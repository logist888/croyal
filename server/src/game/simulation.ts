/**
 * Authoritative 1v1 battle simulation. Deterministic, server-side only.
 * The client never runs this for truth — it only renders snapshots.
 *
 * Two battle models live side-by-side, selected by BattleConfig (GDD
 * reversibility): the legacy elixir/free-placement core and the new
 * cooldown/fixed-lane core (per-card recharge, auto-march lanes, intercept).
 */
import {
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, RIVER_HALF_HEIGHT, BRIDGE_X,
  ELIXIR_MAX, ELIXIR_START, ELIXIR_REGEN_SECONDS,
  KING_TOWER, PRINCESS_TOWER, TOWER_POSITIONS, otherSide,
  LANE_SPAWN, LANE_BUILDING_SPAWN, laneTargetTower, ENGAGE_X_WINDOW, UNIT_BODY_RADIUS, towerBodyRadius,
  DEFAULT_BATTLE_CONFIG,
  CARDS, getCard, levelStatMultiplier, canDeployTroop,
  type Side, type TowerType, type CardDef, type TargetKind, type BattleConfig,
  type BattleSnapshot, type EntitySnapshot, type MatchResult, type CardCooldown,
  type AttackEvent, type StatusKind, type TroopAbility, type ZoneSnapshot,
} from '@croyal/shared';

/** FX events kept per snapshot window (visual only; bounded for payload size). */
const MAX_EVENTS_PER_WINDOW = 60;
/** Lingering spell areas are bounded; the oldest is evicted beyond the cap. */
const MAX_ZONES = 12;
/** How far a chain attack can arc between consecutive victims (tiles). */
const CHAIN_JUMP_RADIUS = 2.5;
/** Chargers re-arm their first-hit bonus after this long without attacking. */
const CHARGE_REARM_DEFAULT = 4;

/** One active status per kind: strongest magnitude wins, duration refreshes. */
interface StatusInstance {
  kind: StatusKind;
  remaining: number;
  magnitude: number;
  sourceSide: Side;
}

/** A lingering poison/slow area left by a spell. NOT an entity — untargetable. */
interface Zone {
  id: string;
  side: Side; // caster's side (affects the OTHER side)
  x: number;
  y: number;
  radius: number;
  status: 'poison' | 'slow';
  magnitude: number;
  remaining: number;
  color: number;
}

type MarchState = 'march' | 'intercept' | 'engage';

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
  marchState: MarchState; // fixed-lane units only; 'march' otherwise
  statuses: StatusInstance[];
  ability?: TroopAbility;
  charging: boolean; // charge ability armed (next hit is the heavy one)
  chargeRearm: number; // seconds without attacking until charge re-arms
  spawnCd: number; // spawner ability countdown
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
  timeLeft: number;
  entities = new Map<string, Entity>();
  result: MatchResult | null = null;
  winnerSide: Side | null = null;
  endReason: MatchResult['reason'] | null = null;

  private elixir: Record<Side, number> = { A: ELIXIR_START, B: ELIXIR_START };
  private queue: Record<Side, string[]>;
  /** Per-card recharge timers (cooldown economy only). */
  private cooldowns: Record<Side, Map<string, number>> = { A: new Map(), B: new Map() };
  /** threat entity id -> interceptor entity id (fixed-lane intercept rule). */
  private interceptAssignments = new Map<string, string>();
  /** Combat FX since the last snapshot broadcast (cleared by the match loop). */
  private events: AttackEvent[] = [];
  /** Lingering poison/slow spell areas. */
  private zones: Zone[] = [];
  private zoneSeq = 0;
  private seq = 0;
  private towersDestroyed: Record<Side, number> = { A: 0, B: 0 };
  private towerDamage: Record<Side, number> = { A: 0, B: 0 };
  private firstTowerTick: Record<Side, number | null> = { A: null, B: null };

  private levels: Record<Side, Record<string, number>>;

  constructor(
    deckA: string[],
    deckB: string[],
    private fallbackSeed: number,
    levelsA: Record<string, number> = {},
    levelsB: Record<string, number> = {},
    private config: BattleConfig = DEFAULT_BATTLE_CONFIG,
    private cooldownMult: Record<Side, number> = { A: 1, B: 1 },
  ) {
    this.timeLeft = config.roundSeconds;
    if (config.economy === 'cooldown') {
      // The trio is the whole hand — keep its order stable for the HUD.
      this.queue = { A: [...deckA], B: [...deckB] };
      for (const s of ['A', 'B'] as Side[]) {
        for (const id of this.queue[s]) this.cooldowns[s].set(id, 0);
      }
    } else {
      this.queue = { A: shuffle(deckA, fallbackSeed), B: shuffle(deckB, fallbackSeed + 1) };
    }
    this.levels = { A: levelsA, B: levelsB };
    this.spawnTowers('A');
    this.spawnTowers('B');
  }

  private cardLevel(side: Side, cardId: string): number {
    return this.levels[side][cardId] ?? 1;
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
        marchState: 'march',
        statuses: [],
        charging: false,
        chargeRearm: 0,
        spawnCd: 0,
      });
    }
  }

  // --- Status framework (the unified mechanic backbone) ---

  /** One instance per kind: strongest magnitude wins, duration refreshes. */
  private applyStatus(e: Entity, kind: StatusKind, magnitude: number, seconds: number, sourceSide: Side): void {
    const existing = e.statuses.find((s) => s.kind === kind);
    if (existing) {
      existing.magnitude = Math.max(existing.magnitude, magnitude);
      existing.remaining = Math.max(existing.remaining, seconds);
      existing.sourceSide = sourceSide;
    } else {
      e.statuses.push({ kind, remaining: seconds, magnitude, sourceSide });
    }
  }

  private statusOf(e: Entity, kind: StatusKind): StatusInstance | undefined {
    return e.statuses.find((s) => s.kind === kind);
  }

  private isStunned(e: Entity): boolean {
    return !!this.statusOf(e, 'stun');
  }

  /** The ONE place all speed math lands: root/stun stop, slow/rage/charge scale. */
  private effectiveMoveSpeed(e: Entity): number {
    if (e.statuses.length === 0 && !e.charging) return e.moveSpeed;
    if (this.statusOf(e, 'root') || this.statusOf(e, 'stun')) return 0;
    let speed = e.moveSpeed;
    const slow = this.statusOf(e, 'slow');
    if (slow) speed *= slow.magnitude;
    const rage = this.statusOf(e, 'rage');
    if (rage) speed *= rage.magnitude;
    if (e.charging && e.ability?.kind === 'charge') speed *= e.ability.speedMult;
    return speed;
  }

  /** Seconds between hits, sped up by rage. */
  private effectiveHitSpeed(e: Entity): number {
    const rage = this.statusOf(e, 'rage');
    return rage ? e.hitSpeed / rage.magnitude : e.hitSpeed;
  }

  /** Tick down statuses; poison deals its damage here (damage lives in the status). */
  private tickStatuses(e: Entity, dt: number): void {
    if (e.statuses.length === 0) return;
    for (const s of e.statuses) {
      if (s.kind === 'poison') {
        this.applyDamage(e, s.magnitude * dt, s.sourceSide);
        if (e.hp <= 0) return;
      }
      s.remaining -= dt;
    }
    e.statuses = e.statuses.filter((s) => s.remaining > 0);
  }

  private getTower(side: Side, tt: TowerType): Entity | undefined {
    for (const e of this.entities.values()) {
      if (e.kind === 'tower' && e.side === side && e.towerType === tt && e.hp > 0) return e;
    }
    return undefined;
  }

  // --- Economy (elixir OR per-card cooldowns) / hand ---
  finalPhase(): boolean {
    return this.timeLeft <= this.config.finalPhaseLastSeconds;
  }

  get battleConfig(): BattleConfig {
    return this.config;
  }

  private elixirRate(): number {
    return (this.finalPhase() ? 2 : 1) / ELIXIR_REGEN_SECONDS; // elixir per second
  }

  private hand(side: Side): string[] {
    return this.config.economy === 'cooldown' ? [...this.queue[side]] : this.queue[side].slice(0, 4);
  }

  private nextCardOf(side: Side): string {
    return this.config.economy === 'cooldown' ? '' : this.queue[side][4];
  }

  /** Cards playable right now (off cooldown). Used by the bot and tests. */
  readyCards(side: Side): string[] {
    if (this.config.economy !== 'cooldown') return this.hand(side);
    return this.queue[side].filter((id) => (this.cooldowns[side].get(id) ?? 0) <= 0);
  }

  cooldownOf(side: Side, cardId: string): number {
    return this.cooldowns[side].get(cardId) ?? 0;
  }

  /** Whether a position is a legal deploy spot for `side` (shared client/server rule). */
  private canDeployAt(side: Side, x: number, y: number): boolean {
    const enemy = otherSide(side);
    return canDeployTroop(side, x, y, {
      left: !this.getTower(enemy, 'princessLeft'),
      right: !this.getTower(enemy, 'princessRight'),
    });
  }

  deploy(side: Side, cardId: string, x?: number, y?: number): DeployResult {
    if (this.result) return { ok: false, error: 'match over' };
    const card = getCard(cardId);
    if (!card) return { ok: false, error: 'unknown card' };
    if (!this.hand(side).includes(cardId)) return { ok: false, error: 'card not in hand' };

    // Economy gate
    if (this.config.economy === 'cooldown') {
      if ((this.cooldowns[side].get(cardId) ?? 0) > 0) return { ok: false, error: 'card on cooldown' };
    } else if (this.elixir[side] < card.cost) {
      return { ok: false, error: 'not enough elixir' };
    }

    // Placement gate
    let px: number;
    let py: number;
    if (card.type === 'spell') {
      // Spells are aimed by a tap in both deployment modes (free aim).
      if (x === undefined || y === undefined) return { ok: false, error: 'spell needs a target' };
      if (x < 0 || x > ARENA_WIDTH || y < 0 || y > ARENA_HEIGHT) return { ok: false, error: 'out of bounds' };
      px = x;
      py = y;
    } else if (this.config.deployment === 'fixed-lane') {
      // The player only chooses WHICH card and WHEN — never where. Troops go
      // to the lane spawn; buildings to the central defensive spot (their
      // range must cover the enemy's incoming lane, not your outgoing one).
      if (x !== undefined || y !== undefined) return { ok: false, error: 'fixed-lane: no placement' };
      const spot = card.type === 'building' ? LANE_BUILDING_SPAWN[side] : LANE_SPAWN[side];
      px = spot.x;
      py = spot.y;
    } else {
      if (x === undefined || y === undefined) return { ok: false, error: 'placement required' };
      if (!this.canDeployAt(side, x, y)) return { ok: false, error: 'illegal deploy zone' };
      px = x;
      py = y;
    }

    // Pay
    if (this.config.economy === 'cooldown') {
      this.cooldowns[side].set(cardId, card.cooldownSec * this.cooldownMult[side]);
    } else {
      this.elixir[side] -= card.cost;
      this.cycle(side, cardId);
    }

    if (card.type === 'spell') {
      this.castSpell(side, card, px, py);
    } else {
      this.spawnCard(side, card, px, py);
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
    const m = levelStatMultiplier(this.cardLevel(side, card.id));
    const hp = Math.round((card.hp ?? 100) * m);
    const damage = Math.round((card.damage ?? 0) * m);
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
        hp,
        maxHp: hp,
        damage,
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
        marchState: 'march',
        statuses: [],
        ability: card.ability,
        charging: card.ability?.kind === 'charge',
        chargeRearm: 0,
        spawnCd: card.ability?.kind === 'spawner' ? card.ability.everySeconds : 0,
      });
    }
  }

  private castSpell(side: Side, card: CardDef, x: number, y: number): void {
    const radius = card.spellRadius ?? 1;
    const dmg = Math.round((card.spellDamage ?? 0) * levelStatMultiplier(this.cardLevel(side, card.id)));
    const enemy = otherSide(side);
    const effect = card.effect;
    this.pushEvent({ kind: 'spell', side, fromX: x, fromY: y, toX: x, toY: y, ranged: false, radius });

    // Chain spells route their damage through arcs instead of the AoE blast.
    if (effect?.kind === 'chain') {
      this.castChain(side, x, y, dmg, effect.jumps, effect.falloff);
      return;
    }

    // Instant AoE damage first (may be 0 for pure-utility spells).
    if (dmg > 0) {
      for (const e of this.entities.values()) {
        if (e.side !== enemy || e.hp <= 0) continue;
        if (dist(e.x, e.y, x, y) <= radius) {
          this.applyDamage(e, dmg, side);
        }
      }
    }
    if (!effect) return;

    switch (effect.kind) {
      case 'zone': {
        this.zones.push({
          id: `z-${this.zoneSeq++}`, side, x, y, radius,
          status: effect.status, magnitude: effect.magnitude,
          remaining: effect.zoneSeconds, color: card.color,
        });
        if (this.zones.length > MAX_ZONES) this.zones.shift();
        break;
      }
      case 'root': {
        for (const e of this.entities.values()) {
          if (e.side !== enemy || e.hp <= 0 || e.kind !== 'unit' || e.flying) continue;
          if (dist(e.x, e.y, x, y) <= radius) this.applyStatus(e, 'root', 1, effect.seconds, side);
        }
        break;
      }
      case 'knockback': {
        for (const e of this.entities.values()) {
          if (e.side !== enemy || e.hp <= 0 || e.kind !== 'unit') continue;
          const d = dist(e.x, e.y, x, y);
          if (d > radius) continue;
          const len = d || 1;
          e.x = clamp(e.x + ((e.x - x) / len) * effect.tiles, 0.5, ARENA_WIDTH - 0.5);
          e.y = clamp(e.y + ((e.y - y) / len) * effect.tiles, 0.5, ARENA_HEIGHT - 0.5);
          if (this.config.deployment === 'fixed-lane') this.clampCollisions(e, null);
          this.applyStatus(e, 'stun', 1, effect.stunSeconds, side);
          this.pushEvent({ kind: 'attack', side, fromX: x, fromY: y, toX: round2(e.x), toY: round2(e.y), ranged: false, effect: 'knockback' });
        }
        break;
      }
      case 'heal': {
        for (const e of this.entities.values()) {
          if (e.side !== side || e.hp <= 0 || e.kind === 'tower') continue;
          if (dist(e.x, e.y, x, y) <= radius) {
            e.hp = Math.min(e.maxHp, e.hp + effect.amount);
            this.pushEvent({ kind: 'attack', side, fromX: round2(e.x), fromY: round2(e.y), toX: round2(e.x), toY: round2(e.y), ranged: false, effect: 'heal' });
          }
        }
        break;
      }
      case 'rage': {
        for (const e of this.entities.values()) {
          if (e.side !== side || e.hp <= 0 || e.kind !== 'unit') continue;
          if (dist(e.x, e.y, x, y) <= radius) this.applyStatus(e, 'rage', effect.factor, effect.seconds, side);
        }
        break;
      }
      case 'shield': {
        for (const e of this.entities.values()) {
          if (e.side !== side || e.hp <= 0 || e.kind !== 'unit') continue;
          if (dist(e.x, e.y, x, y) <= radius) this.applyStatus(e, 'shield', effect.amount, effect.seconds, side);
        }
        break;
      }
    }
  }

  /** Lightning arc: hit the enemy nearest the tap, then jump to fresh targets. */
  private castChain(side: Side, x: number, y: number, dmg: number, jumps: number, falloff: number): void {
    const enemy = otherSide(side);
    const hit = new Set<string>();
    let cx = x;
    let cy = y;
    let damage = dmg;
    for (let i = 0; i <= jumps; i++) {
      let best: Entity | null = null;
      let bestD = Infinity;
      for (const e of this.entities.values()) {
        if (e.side !== enemy || e.hp <= 0 || hit.has(e.id)) continue;
        const d = dist(e.x, e.y, cx, cy);
        const maxD = i === 0 ? (jumps + 2) : CHAIN_JUMP_RADIUS; // first pick: near the tap
        if (d <= maxD && d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (!best) break;
      hit.add(best.id);
      this.pushEvent({ kind: 'attack', side, fromX: round2(cx), fromY: round2(cy), toX: round2(best.x), toY: round2(best.y), ranged: true, effect: 'chain' });
      this.applyDamage(best, Math.round(damage), side);
      cx = best.x;
      cy = best.y;
      damage *= falloff;
    }
  }

  /** Zones apply their status to enemies inside; effect decays shortly after leaving. */
  private stepZones(dt: number): void {
    if (this.zones.length === 0) return;
    for (const z of this.zones) {
      z.remaining -= dt;
      if (z.remaining <= 0) continue;
      const enemy = otherSide(z.side);
      for (const e of this.entities.values()) {
        if (e.side !== enemy || e.hp <= 0) continue;
        if (dist(e.x, e.y, z.x, z.y) <= z.radius) {
          this.applyStatus(e, z.status, z.magnitude, 0.5, z.side);
        }
      }
    }
    this.zones = this.zones.filter((z) => z.remaining > 0);
  }

  private pushEvent(ev: AttackEvent): void {
    if (this.events.length < MAX_EVENTS_PER_WINDOW) this.events.push(ev);
  }

  /** Called by the match loop after a snapshot broadcast. */
  clearEvents(): void {
    this.events = [];
  }

  // --- Targeting & combat ---
  private canHit(attacker: Entity, target: Entity): boolean {
    if (target.flying && attacker.targets === 'ground') return false;
    if (attacker.targetsBuildingsOnly && target.kind === 'unit') return false;
    return true;
  }

  /** Body radius used for attack reach and "can't stand inside a tower". */
  private bodyRadius(target: Entity): number {
    if (target.kind === 'tower') return towerBodyRadius(target.towerType!);
    return UNIT_BODY_RADIUS;
  }

  private reachOf(attacker: Entity, target: Entity): number {
    return attacker.range + this.bodyRadius(target);
  }

  /**
   * Static defenders (towers and buildings) re-scan every tick. Towers only
   * shoot things that move — never each other across the map; buildings may
   * also siege a tower that happens to be in reach (build-13 parity).
   */
  private acquireDefenderTarget(e: Entity): Entity | null {
    const enemy = otherSide(e.side);
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const t of this.entities.values()) {
      if (t.side !== enemy || t.hp <= 0) continue;
      if (t.kind === 'tower' && e.kind === 'tower') continue;
      if (!this.canHit(e, t)) continue;
      const d = dist(e.x, e.y, t.x, t.y);
      if (d <= this.reachOf(e, t) && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** Free-placement mobile units: nearest enemy entity of any kind. */
  private acquireTarget(e: Entity): Entity | null {
    const enemy = otherSide(e.side);
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const t of this.entities.values()) {
      if (t.side !== enemy || t.hp <= 0) continue;
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
    // A shield status is a damage-absorbing pool; it soaks before hp.
    const shield = this.statusOf(target, 'shield');
    if (shield) {
      const absorbed = Math.min(shield.magnitude, amount);
      shield.magnitude -= absorbed;
      amount -= absorbed;
      if (shield.magnitude <= 0) target.statuses = target.statuses.filter((s) => s !== shield);
      if (amount <= 0) return;
    }
    const dealt = Math.min(amount, target.hp);
    target.hp -= amount;

    if (target.kind === 'tower') {
      this.towerDamage[bySide] += dealt;
      if (target.towerType === 'king') target.kingActivated = true;
      if (target.hp <= 0) {
        this.onTowerDestroyed(target, bySide);
      }
    } else if (target.hp <= 0) {
      this.entities.delete(target.id);
    }
  }

  private onTowerDestroyed(tower: Entity, bySide: Side): void {
    this.towersDestroyed[bySide] += 1;
    if (this.firstTowerTick[bySide] === null) this.firstTowerTick[bySide] = this.tick;
    this.entities.delete(tower.id);

    if (tower.towerType === 'king') {
      // king down -> immediate win
      this.finish(bySide, 'king');
      return;
    }
    // a princess falling activates the owner's king tower
    const king = this.getTower(tower.side, 'king');
    if (king) king.kingActivated = true;
  }

  /**
   * Move toward a goal. Ground units route across the river via a bridge —
   * the crossing waypoint sits just BEYOND the water so units never stall on
   * the river line (a build-13 bug froze side-A units there forever).
   * The hard collision rules (no walking on water, never stand inside a
   * tower) apply in fixed-lane mode only — legacy movement stays untouched
   * for rollback fidelity.
   */
  private moveToward(e: Entity, tx: number, ty: number, dt: number, preferredBridgeX?: number): void {
    let gx = tx;
    let gy = ty;
    let crossingBridge: number | null = null;
    if (!e.flying && crossesRiver(e.y, ty)) {
      crossingBridge = preferredBridgeX
        ?? BRIDGE_X.reduce((a, b) => (Math.abs(b - e.x) < Math.abs(a - e.x) ? b : a), BRIDGE_X[0]);
      const ownBankY = e.y > RIVER_Y ? RIVER_Y + (RIVER_HALF_HEIGHT + 0.3) : RIVER_Y - (RIVER_HALF_HEIGHT + 0.3);
      const farBankY = e.y > RIVER_Y ? RIVER_Y - (RIVER_HALF_HEIGHT + 0.3) : RIVER_Y + (RIVER_HALF_HEIGHT + 0.3);
      gx = crossingBridge;
      // Two-stage: first walk along your own bank to the bridge head, then
      // cross straight over the deck — never enter the water sideways.
      gy = Math.abs(e.x - crossingBridge) > 0.2 ? ownBankY : farBankY;
    }
    const d = dist(e.x, e.y, gx, gy);
    const step = this.effectiveMoveSpeed(e) * dt;
    if (d <= step || d === 0) {
      e.x = gx;
      e.y = gy;
    } else {
      e.x += ((gx - e.x) / d) * step;
      e.y += ((gy - e.y) / d) * step;
    }
    if (this.config.deployment === 'fixed-lane') this.clampCollisions(e, crossingBridge);
  }

  /** Hard collision rules (fixed-lane): no water off-bridge, never stand inside a tower. */
  private clampCollisions(e: Entity, crossingBridge: number | null): void {
    if (e.flying) return;
    if (Math.abs(e.y - RIVER_Y) <= RIVER_HALF_HEIGHT + 0.05) {
      if (crossingBridge !== null) {
        // crossing: stay on the deck of the bridge being used (no teleport
        // to whatever bridge happens to be nearest)
        e.x = crossingBridge;
      } else {
        // grazing the bank while fighting/chasing: step back out of the water
        e.y = e.y < RIVER_Y ? RIVER_Y - (RIVER_HALF_HEIGHT + 0.1) : RIVER_Y + (RIVER_HALF_HEIGHT + 0.1);
      }
    }
    for (const t of this.entities.values()) {
      if (t.kind !== 'tower' || t.hp <= 0) continue;
      const r = this.bodyRadius(t);
      const d = dist(e.x, e.y, t.x, t.y);
      if (d >= r) continue;
      if (d === 0) {
        e.y = t.y + r * (e.side === 'A' ? 1 : -1);
      } else {
        e.x = t.x + ((e.x - t.x) / d) * r;
        e.y = t.y + ((e.y - t.y) / d) * r;
      }
    }
  }

  // --- Fixed-lane march / intercept ---

  private onHalf(e: { y: number }, side: Side): boolean {
    return side === 'A' ? e.y > RIVER_Y : e.y < RIVER_Y;
  }

  /**
   * The intercept rule (GDD): for each enemy unit that stepped onto my half,
   * exactly ONE of my marching units — the nearest eligible — peels off to
   * fight it; everyone else keeps marching. When either dies, the survivor
   * returns to the march.
   */
  private assignInterceptors(): void {
    for (const [threatId, interceptorId] of this.interceptAssignments) {
      const threat = this.entities.get(threatId);
      const interceptor = this.entities.get(interceptorId);
      if (!threat || threat.hp <= 0 || !interceptor || interceptor.hp <= 0) {
        this.interceptAssignments.delete(threatId);
        if (interceptor && interceptor.hp > 0 && interceptor.marchState === 'intercept') {
          interceptor.marchState = 'march';
          interceptor.targetId = null;
        }
      }
    }

    for (const side of ['A', 'B'] as Side[]) {
      const enemy = otherSide(side);
      for (const threat of this.entities.values()) {
        if (threat.side !== enemy || threat.kind !== 'unit' || threat.hp <= 0) continue;
        if (!this.onHalf(threat, side)) continue;
        if (this.interceptAssignments.has(threat.id)) continue;

        let best: Entity | null = null;
        let bestD = Infinity;
        for (const u of this.entities.values()) {
          if (u.side !== side || u.kind !== 'unit' || u.hp <= 0) continue;
          if (u.marchState !== 'march' || u.targetsBuildingsOnly) continue;
          if (!this.onHalf(u, side)) continue; // defend from your own half
          if (!this.canHit(u, threat)) continue;
          const d = dist(u.x, u.y, threat.x, threat.y);
          if (d < bestD) {
            bestD = d;
            best = u;
          }
        }
        if (best) {
          this.interceptAssignments.set(threat.id, best.id);
          best.marchState = 'intercept';
          best.targetId = threat.id;
        }
      }
    }
  }

  /** The tower a side's lane march heads for: lane princess, then the king. */
  private structuralTarget(side: Side): Entity | null {
    const { enemySide, towerType } = laneTargetTower(side);
    const princess = this.getTower(enemySide, towerType);
    if (princess) return princess;
    const king = this.getTower(enemySide, 'king');
    if (king) return king;
    const otherPrincess = towerType === 'princessRight' ? 'princessLeft' : 'princessRight';
    return this.getTower(enemySide, otherPrincess) ?? null;
  }

  /**
   * How far a building-hunter (targetsBuildingsOnly) will leave the lane to
   * smash an enemy defense building — the classic tank-vs-building counterplay.
   */
  private static readonly BUILDING_DETOUR = 6;

  /** Nearest enemy unit/building already within fighting reach of the lane. */
  private findEngagement(e: Entity): Entity | null {
    const enemy = otherSide(e.side);
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const t of this.entities.values()) {
      if (t.side !== enemy || t.hp <= 0 || t.kind === 'tower') continue;
      if (e.targetsBuildingsOnly && t.kind !== 'building') continue;
      if (!this.canHit(e, t)) continue;
      const d = dist(e.x, e.y, t.x, t.y);
      if (t.kind === 'building') {
        // Defense buildings sit off-lane (the central spot). A building that
        // can threaten the lane is engageable: ranged marchers trade from
        // reach; building-hunters divert a short detour to demolish it.
        // Without this, defense buildings were literally unattackable.
        if (Math.abs(t.x - e.x) > Math.max(ENGAGE_X_WINDOW, t.range)) continue;
        const maxD = e.targetsBuildingsOnly ? Simulation.BUILDING_DETOUR : this.reachOf(e, t) + 0.4;
        if (d <= maxD && d < bestD) {
          bestD = d;
          best = t;
        }
        continue;
      }
      if (Math.abs(t.x - e.x) > ENGAGE_X_WINDOW) continue;
      if (d <= this.reachOf(e, t) + 0.4 && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private attackOrChase(e: Entity, target: Entity, dt: number): void {
    const d = dist(e.x, e.y, target.x, target.y);
    if (d <= this.reachOf(e, target)) {
      if (e.attackCd <= 0 && e.damage > 0) {
        this.attack(e, target);
        e.attackCd = this.effectiveHitSpeed(e);
      }
    } else if (e.moveSpeed > 0) {
      this.moveToward(e, target.x, target.y, dt, LANE_SPAWN[e.side].x);
    }
  }

  private stepLaneUnit(e: Entity, dt: number): void {
    // Keep fighting an assigned/engaged enemy while it lives.
    if (e.marchState === 'intercept' || e.marchState === 'engage') {
      const target = e.targetId ? this.entities.get(e.targetId) : undefined;
      if (target && target.hp > 0 && this.canHit(e, target)) {
        this.attackOrChase(e, target, dt);
        return;
      }
      e.marchState = 'march';
      e.targetId = null;
    }

    // Natural contact fighting on the lane (melee blocking, ranged trades).
    // Building-hunters pass through here too: findEngagement only offers them
    // enemy BUILDINGS (they still ignore troops and march for towers).
    const foe = this.findEngagement(e);
    if (foe) {
      e.marchState = 'engage';
      e.targetId = foe.id;
      this.attackOrChase(e, foe, dt);
      return;
    }

    // March: own bridge -> lane princess -> king.
    const structural = this.structuralTarget(e.side);
    if (!structural) return;
    e.targetId = structural.id;
    this.attackOrChase(e, structural, dt);
  }

  private stepEntity(e: Entity, dt: number): void {
    if (e.hp <= 0) return;
    if (e.lifetime !== Infinity) {
      e.lifetime -= dt;
      if (e.lifetime <= 0) {
        e.hp = 0;
        this.entities.delete(e.id);
        return;
      }
    }
    // Statuses tick for everything (poison melts even an inactive king).
    this.tickStatuses(e, dt);
    if (e.hp <= 0) return;
    if (e.attackCd > 0) e.attackCd -= dt;

    // towers: inactive king does nothing
    if (e.kind === 'tower' && !e.kingActivated) return;

    // Static defenders re-scan every tick (fix: they used to lock a distant
    // enemy tower forever and never fire at approaching units).
    if (e.kind === 'tower' || e.kind === 'building') {
      if (e.kind === 'building' && this.tickBuildingAbility(e, dt)) return;
      const target = this.acquireDefenderTarget(e);
      e.targetId = target ? target.id : null;
      if (target && e.attackCd <= 0 && e.damage > 0 && !this.isStunned(e)) {
        this.attack(e, target);
        e.attackCd = this.effectiveHitSpeed(e);
      }
      return;
    }

    // Data-driven unit abilities work in EVERY deployment mode.
    this.tickUnitAbility(e, dt);
    if (e.hp <= 0) return;
    if (this.isStunned(e)) return; // stunned: no movement, no attacks

    if (this.config.deployment === 'fixed-lane') {
      this.stepLaneUnit(e, dt);
      return;
    }

    // Free-placement units: nearest-entity lock with the build-13 flat reach
    // (rollback fidelity — body radii are a fixed-lane rule).
    let target: Entity | null | undefined = e.targetId ? this.entities.get(e.targetId) : null;
    if (!target || target.hp <= 0 || !this.canHit(e, target)) {
      target = this.acquireTarget(e);
      e.targetId = target ? target.id : null;
    }
    if (!target) return;

    const d = dist(e.x, e.y, target.x, target.y);
    if (d <= e.range + 0.5) {
      if (e.attackCd <= 0 && e.damage > 0) {
        this.attack(e, target);
        e.attackCd = this.effectiveHitSpeed(e);
      }
    } else if (e.moveSpeed > 0) {
      this.moveToward(e, target.x, target.y, dt);
    }
  }

  /**
   * Building abilities. Returns true when the building's turn is fully
   * handled (healers/spawners do their thing instead of shooting).
   */
  private tickBuildingAbility(e: Entity, dt: number): boolean {
    const ability = e.ability;
    if (!ability) return false;
    if (ability.kind === 'healer') {
      if (e.attackCd <= 0 && !this.isStunned(e)) {
        const target = this.acquireAllyHealTarget(e, ability.healRadius ?? e.range);
        if (target) {
          this.healAround(e, target, ability.healPerHit, ability.healRadius ?? 0);
          e.attackCd = this.effectiveHitSpeed(e);
        }
      }
      return true;
    }
    if (ability.kind === 'spawner') {
      this.tickSpawner(e, ability, dt);
      return true; // pure spawner buildings don't also shoot
    }
    return false;
  }

  /** Unit abilities that tick continuously (any deployment mode). */
  private tickUnitAbility(e: Entity, dt: number): void {
    const ability = e.ability;
    if (!ability) return;
    switch (ability.kind) {
      case 'charge': {
        // Re-arm the heavy hit after a stretch without attacking.
        if (!e.charging) {
          e.chargeRearm -= dt;
          if (e.chargeRearm <= 0) e.charging = true;
        }
        return;
      }
      case 'healer': {
        // Heal the most-wounded ally in range INSTEAD of attacking this beat;
        // movement (march/chase) continues unaffected.
        if (e.attackCd <= 0 && !this.isStunned(e)) {
          const target = this.acquireAllyHealTarget(e, e.range);
          if (target) {
            this.healAround(e, target, ability.healPerHit, ability.healRadius ?? 0);
            e.attackCd = this.effectiveHitSpeed(e);
          }
        }
        return;
      }
      case 'rageAura': {
        for (const ally of this.entities.values()) {
          if (ally.side !== e.side || ally.hp <= 0 || ally.kind !== 'unit' || ally === e) continue;
          if (dist(ally.x, ally.y, e.x, e.y) <= ability.radius) {
            this.applyStatus(ally, 'rage', ability.factor, 0.5, e.side);
          }
        }
        return;
      }
      case 'spawner': {
        this.tickSpawner(e, ability, dt);
        return;
      }
    }
  }

  /** Most-wounded allied unit within range (never self, towers, or full-hp). */
  private acquireAllyHealTarget(e: Entity, range: number): Entity | null {
    let best: Entity | null = null;
    let bestFrac = 1;
    for (const ally of this.entities.values()) {
      if (ally.side !== e.side || ally.hp <= 0 || ally === e || ally.kind === 'tower') continue;
      if (ally.hp >= ally.maxHp) continue;
      if (dist(ally.x, ally.y, e.x, e.y) > range) continue;
      const frac = ally.hp / ally.maxHp;
      if (frac < bestFrac) {
        bestFrac = frac;
        best = ally;
      }
    }
    return best;
  }

  private healAround(healer: Entity, target: Entity, amount: number, radius: number): void {
    const recipients = radius > 0
      ? [...this.entities.values()].filter((a) =>
          a.side === healer.side && a.hp > 0 && a.kind !== 'tower' && a !== healer
          && a.hp < a.maxHp && dist(a.x, a.y, target.x, target.y) <= radius)
      : [target];
    for (const a of recipients) {
      a.hp = Math.min(a.maxHp, a.hp + amount);
      this.pushEvent({
        kind: 'attack', side: healer.side,
        fromX: round2(healer.x), fromY: round2(healer.y),
        toX: round2(a.x), toY: round2(a.y),
        ranged: true, effect: 'heal',
      });
    }
  }

  private tickSpawner(e: Entity, ability: Extract<TroopAbility, { kind: 'spawner' }>, dt: number): void {
    e.spawnCd -= dt;
    if (e.spawnCd > 0) return;
    e.spawnCd = ability.everySeconds;
    const token = getCard(ability.unit);
    if (!token) return;
    const alive = [...this.entities.values()]
      .filter((u) => u.side === e.side && u.cardId === ability.unit && u.hp > 0).length;
    const room = ability.maxAlive - alive;
    if (room <= 0) return;
    const n = Math.min(ability.count, room);
    for (let i = 0; i < n; i++) {
      this.spawnCard(e.side, token, e.x + (i - (n - 1) / 2) * 0.7, e.y);
    }
    this.pushEvent({
      kind: 'attack', side: e.side,
      fromX: round2(e.x), fromY: round2(e.y), toX: round2(e.x), toY: round2(e.y),
      ranged: false, effect: 'spawn',
    });
  }

  private attack(e: Entity, target: Entity): void {
    this.pushEvent({
      kind: 'attack',
      side: e.side,
      fromX: round2(e.x),
      fromY: round2(e.y),
      toX: round2(target.x),
      toY: round2(target.y),
      ranged: e.range > 2,
      effect: e.ability?.kind === 'chain' ? 'chain' : undefined,
    });

    // Charge/ambush: the armed first hit lands heavier, then re-arms on march.
    let damage = e.damage;
    if (e.charging && e.ability?.kind === 'charge') {
      damage = Math.round(damage * e.ability.firstHitMult);
      e.charging = false;
      e.chargeRearm = e.ability.rearmSeconds ?? CHARGE_REARM_DEFAULT;
    }

    this.applyDamage(target, damage, e.side);

    // On-hit status (poisoned blades, frost arrows…).
    if (e.ability?.kind === 'onHitStatus' && target.hp > 0) {
      this.applyStatus(target, e.ability.status, e.ability.magnitude, e.ability.seconds, e.side);
    }

    // Chain ability: arcs hop to fresh targets near the last victim.
    if (e.ability?.kind === 'chain') {
      const enemy = otherSide(e.side);
      const hit = new Set<string>([target.id]);
      let last = target;
      let arcDamage = damage;
      for (let i = 0; i < e.ability.jumps; i++) {
        let best: Entity | null = null;
        let bestD = Infinity;
        for (const other of this.entities.values()) {
          if (other.side !== enemy || other.hp <= 0 || hit.has(other.id)) continue;
          if (!this.canHit(e, other)) continue;
          const d = dist(other.x, other.y, last.x, last.y);
          if (d <= CHAIN_JUMP_RADIUS && d < bestD) {
            bestD = d;
            best = other;
          }
        }
        if (!best) break;
        hit.add(best.id);
        arcDamage = Math.round(arcDamage * e.ability.falloff);
        this.pushEvent({
          kind: 'attack', side: e.side,
          fromX: round2(last.x), fromY: round2(last.y),
          toX: round2(best.x), toY: round2(best.y),
          ranged: true, effect: 'chain',
        });
        this.applyDamage(best, arcDamage, e.side);
        last = best;
      }
    }

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

    if (this.config.economy === 'cooldown') {
      // Final phase: recharges tick faster (0.5 multiplier = twice as fast),
      // including cooldowns already running.
      const speed = this.finalPhase() ? 1 / this.config.finalCooldownMultiplier : 1;
      for (const s of ['A', 'B'] as Side[]) {
        const map = this.cooldowns[s];
        for (const [id, v] of map) {
          if (v > 0) map.set(id, Math.max(0, v - dt * speed));
        }
      }
    } else {
      const rate = this.elixirRate();
      for (const s of ['A', 'B'] as Side[]) {
        this.elixir[s] = Math.min(ELIXIR_MAX, this.elixir[s] + rate * dt);
      }
    }

    this.stepZones(dt);
    if (this.config.deployment === 'fixed-lane') this.assignInterceptors();

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
      rewards: { gold: 0, cards: {} }, // real rewards attached by the match controller
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
        statuses: e.statuses.length ? [...new Set(e.statuses.map((s) => s.kind))] : undefined,
      });
    }
    let cooldowns: CardCooldown[] | undefined;
    if (this.config.economy === 'cooldown') {
      cooldowns = this.queue[forSide].map((id) => ({
        cardId: id,
        remaining: round2(this.cooldowns[forSide].get(id) ?? 0),
        total: round2((getCard(id)?.cooldownSec ?? 0) * this.cooldownMult[forSide]),
      }));
    }
    return {
      tick: this.tick,
      timeLeft: Math.ceil(this.timeLeft),
      doubleElixir: this.finalPhase(),
      yourSide: forSide,
      elixir: { A: round2(this.elixir.A), B: round2(this.elixir.B) },
      hand: this.hand(forSide),
      nextCard: this.nextCardOf(forSide),
      entities,
      score: { A: this.towersDestroyed.A, B: this.towersDestroyed.B },
      mode: { economy: this.config.economy, deployment: this.config.deployment },
      cooldowns,
      finalPhase: this.finalPhase(),
      events: this.events.length ? [...this.events] : undefined,
      zones: this.zones.length
        ? this.zones.map((z): ZoneSnapshot => ({
            id: z.id, x: round2(z.x), y: round2(z.y), radius: z.radius,
            status: z.status, color: z.color, remaining: round2(z.remaining),
          }))
        : undefined,
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
