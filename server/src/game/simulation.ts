/**
 * Authoritative 1v1 battle simulation. Deterministic, server-side only.
 * The client never runs this for truth — it only renders snapshots.
 */
import {
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, RIVER_HALF_HEIGHT, BRIDGE_X,
  ELIXIR_MAX, ELIXIR_START, ELIXIR_REGEN_SECONDS,
  ROUND_SECONDS, DOUBLE_ELIXIR_LAST_SECONDS,
  KING_TOWER, PRINCESS_TOWER, TOWER_POSITIONS, otherSide,
  CARDS, getCard,
  type Side, type TowerType, type CardDef, type TargetKind,
  type BattleSnapshot, type EntitySnapshot, type MatchResult,
} from '@croyal/shared';

interface Entity {
  id: string;
  side: Side;
  kind: 'tower' | 'unit' | 'building';
  cardId?: string;
  towerType?: TowerType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  hitSpeed: number;
  range: number;
  moveSpeed: number;
  targets: TargetKind;
  flying: boolean;
  targetsBuildingsOnly: boolean;
  splashRadius: number;
  color: number;
  attackCd: number;
  targetId: string | null;
  lifetime: number; // seconds remaining, Infinity for permanent
  kingActivated: boolean;
}

interface DeployResult {
  ok: boolean;
  error?: string;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function crossesRiver(y1: number, y2: number): boolean {
  return (y1 < RIVER_Y) !== (y2 < RIVER_Y);
}

export class Simulation {
  tick = 0;
  timeLeft = ROUND_SECONDS;
  entities = new Map<string, Entity>();
  result: MatchResult | null = null;
  winnerSide: Side | null = null;
  endReason: MatchResult['reason'] | null = null;

  private elixir: Record<Side, number> = { A: ELIXIR_START, B: ELIXIR_START };
  private queue: Record<Side, string[]>;
  private seq = 0;
  private towersDestroyed: Record<Side, number> = { A: 0, B: 0 };
  private towerDamage: Record<Side, number> = { A: 0, B: 0 };
  private firstTowerTick: Record<Side, number | null> = { A: null, B: null };

  constructor(
    deckA: string[],
    deckB: string[],
    private fallbackSeed: number,
  ) {
    this.queue = { A: shuffle(deckA, fallbackSeed), B: shuffle(deckB, fallbackSeed + 1) };
    this.spawnTowers('A');
    this.spawnTowers('B');
  }

  private nextId(side: Side): string {
    return `${side}-${this.seq++}`;
  }

  private spawnTowers(side: Side): void {
    const pos = TOWER_POSITIONS[side];
    const towerTypes: TowerType[] = ['king', 'princessLeft', 'princessRight'];
    for (const tt of towerTypes) {
      const stats = tt === 'king' ? KING_TOWER : PRINCESS_TOWER;
      const id = `${side}-tower-${tt}`;
      this.entities.set(id, {
        id,
        side,
        kind: 'tower',
        towerType: tt,
        x: pos[tt].x,
        y: pos[tt].y,
        hp: stats.hp,
        maxHp: stats.hp,
        damage: stats.damage,
        hitSpeed: stats.hitSpeed,
        range: stats.range,
        moveSpeed: 0,
        targets: 'both',
        flying: false,
        targetsBuildingsOnly: false,
        splashRadius: 0,
        color: side === 'A' ? 0x2196f3 : 0xe53935,
        attackCd: 0,
        targetId: null,
        lifetime: Infinity,
        kingActivated: tt !== 'king', // princess towers are always active
      });
    }
  }

  private getTower(side: Side, tt: TowerType): Entity | undefined {
    for (const e of this.entities.values()) {
      if (e.kind === 'tower' && e.side === side && e.towerType === tt && e.hp > 0) return e;
    }
    return undefined;
  }

  // --- Elixir / hand ---
  private elixirRate(): number {
    const doubling = this.timeLeft <= DOUBLE_ELIXIR_LAST_SECONDS;
    return (doubling ? 2 : 1) / ELIXIR_REGEN_SECONDS; // elixir per second
  }

  private hand(side: Side): string[] {
    return this.queue[side].slice(0, 4);
  }

  private nextCardOf(side: Side): string {
    return this.queue[side][4];
  }

  /** Whether a position is a legal deploy spot for `side`. */
  private canDeployAt(side: Side, x: number, y: number): boolean {
    if (x < 0.5 || x > ARENA_WIDTH - 0.5 || y < 0.5 || y > ARENA_HEIGHT - 0.5) return false;
    const enemy = otherSide(side);
    const ownHalf = side === 'A' ? y > RIVER_Y + RIVER_HALF_HEIGHT : y < RIVER_Y - RIVER_HALF_HEIGHT;
    if (ownHalf) return true;

    // Crossing onto the enemy half is only allowed in a lane whose enemy princess tower is down.
    const leftDown = !this.getTower(enemy, 'princessLeft');
    const rightDown = !this.getTower(enemy, 'princessRight');
    const onLeft = x < ARENA_WIDTH / 2;
    if (onLeft && leftDown) return true;
    if (!onLeft && rightDown) return true;
    return false;
  }

  deploy(side: Side, cardId: string, x: number, y: number): DeployResult {
    if (this.result) return { ok: false, error: 'match over' };
    const card = getCard(cardId);
    if (!card) return { ok: false, error: 'unknown card' };
    if (!this.hand(side).includes(cardId)) return { ok: false, error: 'card not in hand' };
    if (this.elixir[side] < card.cost) return { ok: false, error: 'not enough elixir' };

    if (card.type === 'spell') {
      // spells can target anywhere on the field
      if (x < 0 || x > ARENA_WIDTH || y < 0 || y > ARENA_HEIGHT) return { ok: false, error: 'out of bounds' };
    } else if (!this.canDeployAt(side, x, y)) {
      return { ok: false, error: 'illegal deploy zone' };
    }

    this.elixir[side] -= card.cost;
    this.cycle(side, cardId);

    if (card.type === 'spell') {
      this.castSpell(side, card, x, y);
    } else {
      this.spawnCard(side, card, x, y);
    }
    return { ok: true };
  }

  private cycle(side: Side, cardId: string): void {
    const q = this.queue[side];
    const idx = q.indexOf(cardId);
    if (idx >= 0) {
      q.splice(idx, 1);
      q.push(cardId);
    }
  }

  private spawnCard(side: Side, card: CardDef, x: number, y: number): void {
    const count = card.count ?? 1;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const ox = count > 1 ? Math.cos(angle) * 0.6 : 0;
      const oy = count > 1 ? Math.sin(angle) * 0.6 : 0;
      const id = this.nextId(side);
      this.entities.set(id, {
        id,
        side,
        kind: card.type === 'building' ? 'building' : 'unit',
        cardId: card.id,
        x: clamp(x + ox, 0.5, ARENA_WIDTH - 0.5),
        y: clamp(y + oy, 0.5, ARENA_HEIGHT - 0.5),
        hp: card.hp ?? 100,
        maxHp: card.hp ?? 100,
        damage: card.damage ?? 0,
        hitSpeed: card.hitSpeed ?? 1,
        range: card.range ?? 1.2,
        moveSpeed: card.moveSpeed ?? 0,
        targets: card.targets ?? 'ground',
        flying: card.flying ?? false,
        targetsBuildingsOnly: card.targetsBuildingsOnly ?? false,
        splashRadius: card.splashRadius ?? 0,
        color: card.color,
        attackCd: 0,
        targetId: null,
        lifetime: card.lifetimeSeconds ?? Infinity,
        kingActivated: true,
      });
    }
  }

  private castSpell(side: Side, card: CardDef, x: number, y: number): void {
    const radius = card.spellRadius ?? 1;
    const dmg = card.spellDamage ?? 0;
    const enemy = otherSide(side);
    for (const e of this.entities.values()) {
      if (e.side !== enemy || e.hp <= 0) continue;
      if (dist(e.x, e.y, x, y) <= radius) {
        this.applyDamage(e, dmg, side);
      }
    }
  }

  // --- Targeting & combat ---
  private canHit(attacker: Entity, target: Entity): boolean {
    if (target.flying && attacker.targets === 'ground') return false;
    if (attacker.targetsBuildingsOnly && target.kind === 'unit') return false;
    return true;
  }

  private acquireTarget(e: Entity): Entity | null {
    const enemy = otherSide(e.side);
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const t of this.entities.values()) {
      if (t.side !== enemy || t.hp <= 0) continue;
      // inactive king tower is not targetable until it activates (acts like a wall but un-aggroable)
      if (t.kind === 'tower' && t.towerType === 'king' && !t.kingActivated) {
        // still targetable structurally — towers are valid targets; activation only governs attacking
      }
      if (!this.canHit(e, t)) continue;
      const d = dist(e.x, e.y, t.x, t.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private applyDamage(target: Entity, amount: number, bySide: Side): void {
    if (target.hp <= 0) return;
    const dealt = Math.min(amount, target.hp);
    target.hp -= amount;

    if (target.kind === 'tower') {
      this.towerDamage[bySide] += dealt;
      if (target.towerType === 'king') target.kingActivated = true;
      if (target.hp <= 0) {
        this.onTowerDestroyed(target, bySide);
      }
    } else if (target.hp <= 0) {
      this.entities.delete(idKey(target));
    }
  }

  private onTowerDestroyed(tower: Entity, bySide: Side): void {
    this.towersDestroyed[bySide] += 1;
    if (this.firstTowerTick[bySide] === null) this.firstTowerTick[bySide] = this.tick;
    this.entities.delete(idKey(tower));

    if (tower.towerType === 'king') {
      // king down -> immediate win
      this.finish(bySide, 'king');
      return;
    }
    // a princess falling activates the owner's king tower
    const king = this.getTower(tower.side, 'king');
    if (king) king.kingActivated = true;
  }

  private moveToward(e: Entity, tx: number, ty: number, dt: number): void {
    let gx = tx;
    let gy = ty;
    if (!e.flying && crossesRiver(e.y, ty)) {
      // ground units must use a bridge to cross the river
      const bridge = BRIDGE_X.reduce((a, b) => (Math.abs(b - e.x) < Math.abs(a - e.x) ? b : a), BRIDGE_X[0]);
      gx = bridge;
      gy = RIVER_Y;
    }
    const d = dist(e.x, e.y, gx, gy);
    const step = e.moveSpeed * dt;
    if (d <= step || d === 0) {
      e.x = gx;
      e.y = gy;
    } else {
      e.x += ((gx - e.x) / d) * step;
      e.y += ((gy - e.y) / d) * step;
    }
  }

  private stepEntity(e: Entity, dt: number): void {
    if (e.hp <= 0) return;
    if (e.lifetime !== Infinity) {
      e.lifetime -= dt;
      if (e.lifetime <= 0) {
        e.hp = 0;
        this.entities.delete(idKey(e));
        return;
      }
    }
    if (e.attackCd > 0) e.attackCd -= dt;

    // towers: inactive king does nothing
    if (e.kind === 'tower' && !e.kingActivated) return;

    let target: Entity | null | undefined = e.targetId ? this.entities.get(e.targetId) : null;
    if (!target || target.hp <= 0 || !this.canHit(e, target)) {
      target = this.acquireTarget(e);
      e.targetId = target ? target.id : null;
    }
    if (!target) return;

    const d = dist(e.x, e.y, target.x, target.y);
    const reach = e.range + 0.5; // small body radius tolerance
    if (d <= reach) {
      if (e.attackCd <= 0 && e.damage > 0) {
        this.attack(e, target);
        e.attackCd = e.hitSpeed;
      }
    } else if (e.moveSpeed > 0) {
      this.moveToward(e, target.x, target.y, dt);
    }
  }

  private attack(e: Entity, target: Entity): void {
    this.applyDamage(target, e.damage, e.side);
    if (e.splashRadius > 0) {
      const enemy = otherSide(e.side);
      for (const other of this.entities.values()) {
        if (other === target || other.side !== enemy || other.hp <= 0) continue;
        if (dist(other.x, other.y, target.x, target.y) <= e.splashRadius) {
          this.applyDamage(other, e.damage, e.side);
        }
      }
    }
  }

  step(dt: number): void {
    if (this.result) return;
    this.tick += 1;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    // elixir regen
    const rate = this.elixirRate();
    for (const s of ['A', 'B'] as Side[]) {
      this.elixir[s] = Math.min(ELIXIR_MAX, this.elixir[s] + rate * dt);
    }

    // step a stable snapshot of entities (towers + units)
    for (const e of [...this.entities.values()]) {
      if (e.hp > 0) this.stepEntity(e, dt);
    }

    if (this.timeLeft <= 0 && !this.result) {
      this.resolveTimeout();
    }
  }

  /** No draws: resolve a timed-out match through a deterministic tiebreak chain. */
  private resolveTimeout(): void {
    const a = this.towersDestroyed.A;
    const b = this.towersDestroyed.B;
    if (a !== b) return this.finish(a > b ? 'A' : 'B', 'timeout');

    if (this.towerDamage.A !== this.towerDamage.B) {
      return this.finish(this.towerDamage.A > this.towerDamage.B ? 'A' : 'B', 'timeout');
    }
    const fa = this.firstTowerTick.A;
    const fb = this.firstTowerTick.B;
    if (fa !== fb) {
      if (fa === null) return this.finish('B', 'timeout');
      if (fb === null) return this.finish('A', 'timeout');
      return this.finish(fa < fb ? 'A' : 'B', 'timeout');
    }
    // Everything equal — deterministic fallback so a DRAW is impossible.
    this.finish(this.fallbackSeed % 2 === 0 ? 'A' : 'B', 'timeout');
  }

  private finish(winner: Side, reason: MatchResult['reason']): void {
    this.winnerSide = winner;
    this.endReason = reason;
    this.result = {
      outcome: 'win',
      reason,
      yourScore: this.towersDestroyed[winner],
      opponentScore: this.towersDestroyed[otherSide(winner)],
      trophyDelta: 0, // filled in by the match controller
    };
  }

  /** Force an end (used when a player disconnects/leaves). */
  forfeit(loser: Side): void {
    if (this.result) return;
    this.finish(otherSide(loser), 'opponent_left');
  }

  getSnapshot(forSide: Side): BattleSnapshot {
    const entities: EntitySnapshot[] = [];
    for (const e of this.entities.values()) {
      if (e.hp <= 0) continue;
      entities.push({
        id: e.id,
        side: e.side,
        kind: e.kind,
        cardId: e.cardId,
        towerType: e.towerType,
        x: round2(e.x),
        y: round2(e.y),
        hp: Math.max(0, Math.round(e.hp)),
        maxHp: e.maxHp,
        flying: e.flying,
        color: e.color,
      });
    }
    return {
      tick: this.tick,
      timeLeft: Math.ceil(this.timeLeft),
      doubleElixir: this.timeLeft <= DOUBLE_ELIXIR_LAST_SECONDS,
      yourSide: forSide,
      elixir: { A: round2(this.elixir.A), B: round2(this.elixir.B) },
      hand: this.hand(forSide),
      nextCard: this.nextCardOf(forSide),
      entities,
      score: { A: this.towersDestroyed.A, B: this.towersDestroyed.B },
    };
  }

  /** Read-only elixir accessor for bot AI. */
  elixirOf(side: Side): number {
    return this.elixir[side];
  }

  handOf(side: Side): string[] {
    return this.hand(side);
  }
}

// --- helpers ---
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function idKey(e: Entity): string {
  return e.id;
}
function targetKey(e: Entity): string {
  return e.id;
}

/** Deterministic shuffle (mulberry32) so matches replay identically. */
function shuffle(deck: string[], seed: number): string[] {
  const arr = [...deck];
  let s = seed >>> 0;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export { CARDS };
