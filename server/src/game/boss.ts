/**
 * Clan boss raid (co-op). Members of one clan fight a shared boss together.
 * Co-op (2+ simultaneous players) DOUBLES the boss difficulty (HP and damage).
 * Per-player damage is attributed for the reward screen.
 */
import {
  TICK_DT, TICK_RATE, SNAPSHOT_RATE, ARENA_WIDTH, ARENA_HEIGHT,
  RIVER_Y, RIVER_HALF_HEIGHT, BRIDGE_X,
  ELIXIR_MAX, ELIXIR_START, ELIXIR_REGEN_SECONDS,
  BOSS_RAID_SECONDS, BOSS_BASE_HP, BOSS_BASE_DAMAGE, BOSS_COOP_MULTIPLIER, BOSS_MAX_PLAYERS,
  BOSS_RAIDER_COOLDOWN_MULT,
  getCard, type ServerMessage, type BossSnapshot, type EntitySnapshot, type BossResult,
  type BattleConfig, type CardCooldown, type AttackEvent,
} from '@croyal/shared';
import { ACTIVE_BATTLE_CONFIG } from './active-config';

type Sender = (msg: ServerMessage) => void;

interface Participant {
  userId: string;
  nickname: string;
  elixir: number;
  queue: string[];
  /** Per-card recharge (cooldown economy; raider cooldowns run x1.5 long). */
  cooldowns: Map<string, number>;
  damageDealt: number;
  send: Sender;
}

interface BossUnit {
  id: string;
  ownerId: string;
  cardId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  hitSpeed: number;
  range: number;
  moveSpeed: number;
  flying: boolean;
  color: number;
  attackCd: number;
}

/** True when a straight path from y1 to y2 would cross the river. */
function crossesRiver(y1: number, y2: number): boolean {
  return (y1 < RIVER_Y) !== (y2 < RIVER_Y);
}

const BOSS_POS = { x: ARENA_WIDTH / 2, y: 4 };
const BOSS_RANGE = 3.5;
/** Same cap the 1v1 simulation uses — a phone cannot express more than this. */
const MAX_EVENTS_PER_WINDOW = 60;
const BOSS_HIT_SPEED = 1.2;

export class BossRoom {
  private participants = new Map<string, Participant>();
  private units: BossUnit[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private seq = 0;
  private ended = false;

  private bossHp = BOSS_BASE_HP;
  private bossMaxHp = BOSS_BASE_HP;
  private bossDamage = BOSS_BASE_DAMAGE;
  private bossAttackCd = 0;
  private multiplier = 1;
  private timeLeft = BOSS_RAID_SECONDS;

  /** Cooldowns of raiders who left mid-raid — restored on re-join so a
   * leave+rejoin cannot wipe the x1.5 recharges. */
  private benchedCooldowns = new Map<string, Map<string, number>>();

  constructor(
    public readonly clanId: string,
    private onEmpty: (room: BossRoom) => void,
    private config: BattleConfig = ACTIVE_BATTLE_CONFIG,
    /** Called once with the final result so rewards can be persisted. */
    private onResult?: (result: BossResult) => void,
  ) {}

  get size(): number {
    return this.participants.size;
  }

  /** Exposed for tests/telemetry. */
  get difficultyMultiplier(): number {
    return this.multiplier;
  }
  get bossMaxHpValue(): number {
    return this.bossMaxHp;
  }

  join(userId: string, nickname: string, deck: string[], send: Sender): { ok: boolean; error?: string } {
    if (this.ended) return { ok: false, error: 'raid ended' };
    if (this.participants.has(userId)) return { ok: false, error: 'already in raid' };
    if (this.participants.size >= BOSS_MAX_PLAYERS) return { ok: false, error: 'raid full' };
    const cooldowns = this.benchedCooldowns.get(userId) ?? new Map<string, number>();
    this.benchedCooldowns.delete(userId);
    for (const id of deck) {
      if (!cooldowns.has(id)) cooldowns.set(id, 0);
    }
    this.participants.set(userId, {
      userId, nickname, elixir: ELIXIR_START, queue: [...deck], cooldowns, damageDealt: 0, send,
    });
    this.recomputeDifficulty();
    if (!this.timer) this.start();
    return { ok: true };
  }

  leave(userId: string): void {
    const p = this.participants.get(userId);
    if (p) this.benchedCooldowns.set(userId, p.cooldowns);
    this.participants.delete(userId);
    if (this.participants.size === 0) {
      this.stop();
      return;
    }
    this.recomputeDifficulty(); // dropping to solo drops the co-op multiplier too
  }

  /**
   * Combat FX for the current broadcast window. The raid loop never produced
   * these, which is why boss fights had no projectiles, impacts or spell rings
   * while 1v1 did. Lifecycle copies Simulation exactly: pushed during the tick,
   * read by snapshotFor (which runs once PER PARTICIPANT), cleared once after
   * the broadcast — clearing inside the snapshot would give the FX to whichever
   * raider happened to be serialised first and nobody else.
   */
  private events: AttackEvent[] = [];

  private pushEvent(ev: AttackEvent): void {
    if (this.events.length < MAX_EVENTS_PER_WINDOW) this.events.push(ev);
  }

  /** Co-op (2+) doubles boss HP and damage; difficulty is recomputed live. */
  private recomputeDifficulty(): void {
    const mult = this.participants.size >= 2 ? BOSS_COOP_MULTIPLIER : 1;
    if (mult === this.multiplier) return;
    const frac = this.bossMaxHp > 0 ? this.bossHp / this.bossMaxHp : 1;
    this.multiplier = mult;
    this.bossMaxHp = BOSS_BASE_HP * mult;
    this.bossHp = this.bossMaxHp * frac;
    this.bossDamage = BOSS_BASE_DAMAGE * mult;
  }

  private start(): void {
    this.timer = setInterval(() => this.loop(), Math.round(TICK_DT * 1000));
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onEmpty(this);
  }

  /** Exposed for tests: seconds until a participant's card is playable again. */
  cooldownOf(userId: string, cardId: string): number {
    return this.participants.get(userId)?.cooldowns.get(cardId) ?? 0;
  }

  private handOf(p: Participant): string[] {
    return this.config.economy === 'cooldown' ? p.queue : p.queue.slice(0, 4);
  }

  deploy(userId: string, cardId: string, x?: number, y?: number): void {
    if (this.ended) return;
    const p = this.participants.get(userId);
    if (!p) return;
    const card = getCard(cardId);
    if (!card) return;
    if (!this.handOf(p).includes(cardId)) return;

    // Economy gate + payment
    if (this.config.economy === 'cooldown') {
      if ((p.cooldowns.get(cardId) ?? 0) > 0) return;
      p.cooldowns.set(cardId, card.cooldownSec * BOSS_RAIDER_COOLDOWN_MULT);
    } else {
      if (p.elixir < card.cost) return;
      p.elixir -= card.cost;
      // cycle
      const idx = p.queue.indexOf(cardId);
      if (idx >= 0) {
        p.queue.splice(idx, 1);
        p.queue.push(cardId);
      }
    }

    if (card.type === 'spell') {
      // Coordinate-free casts (cooldown client) auto-aim at the boss.
      const sx = x ?? BOSS_POS.x;
      const sy = y ?? BOSS_POS.y;
      if (dist(sx, sy, BOSS_POS.x, BOSS_POS.y) <= (card.spellRadius ?? 1)) {
        // Boss-raid shim for mechanic spells: DoT zones deal their full
        // over-time damage up front, chain spells deal their arc damage;
        // utility effects (root/slow/heal/rage/shield/knockback) are no-ops
        // against the boss (documented limitation).
        let dmg = card.spellDamage ?? 0;
        if (card.effect?.kind === 'zone' && card.effect.status === 'poison') {
          dmg += card.effect.magnitude * card.effect.zoneSeconds;
        }
        this.damageBoss(Math.round(dmg), p);
        this.pushEvent({
          kind: 'spell', side: 'A',
          fromX: round2(sx), fromY: round2(sy),
          toX: BOSS_POS.x, toY: BOSS_POS.y,
          ranged: false,
          radius: card.spellRadius ?? 1,
          effect: card.effect?.kind === 'chain' ? 'chain' : undefined,
        });
      }
      return;
    }
    // Raiders place troops by tapping their own half; coordinate-free plays
    // (legacy elixir client) fall back to the raider band. Either way troops
    // start BELOW the river and must cross a bridge to reach the boss.
    const seat = [...this.participants.keys()].indexOf(userId);
    const bx = x ?? ARENA_WIDTH * (0.3 + 0.4 * ((seat % 5) / 4));
    const by = y ?? ARENA_HEIGHT * 0.8;
    const count = card.count ?? 1;
    for (let i = 0; i < count; i++) {
      this.units.push({
        id: `u-${this.seq++}`,
        ownerId: userId,
        cardId: card.id,
        x: clamp(bx + (i - count / 2) * 0.5, 0.5, ARENA_WIDTH - 0.5),
        y: clamp(by, RIVER_Y + RIVER_HALF_HEIGHT + 0.3, ARENA_HEIGHT - 0.5),
        hp: card.hp ?? 100,
        maxHp: card.hp ?? 100,
        damage: card.damage ?? 0,
        hitSpeed: card.hitSpeed ?? 1,
        range: card.range ?? 1.2,
        moveSpeed: card.moveSpeed ?? 1,
        flying: card.flying ?? false,
        color: card.color,
        attackCd: 0,
      });
    }
  }

  /**
   * Move a raider unit toward the boss, crossing the river ONLY on a bridge
   * (nearest one) — same two-stage routing + water clamp as the PvP sim, so
   * ground troops never walk on water. Flyers ignore the river.
   */
  private moveUnitTowardBoss(u: BossUnit, dt: number): void {
    let gx = BOSS_POS.x;
    let gy = BOSS_POS.y;
    let bridge: number | null = null;
    if (!u.flying && crossesRiver(u.y, BOSS_POS.y)) {
      bridge = BRIDGE_X.reduce((a, b) => (Math.abs(b - u.x) < Math.abs(a - u.x) ? b : a), BRIDGE_X[0]);
      const ownBankY = u.y > RIVER_Y ? RIVER_Y + (RIVER_HALF_HEIGHT + 0.3) : RIVER_Y - (RIVER_HALF_HEIGHT + 0.3);
      const farBankY = u.y > RIVER_Y ? RIVER_Y - (RIVER_HALF_HEIGHT + 0.3) : RIVER_Y + (RIVER_HALF_HEIGHT + 0.3);
      gx = bridge;
      // walk along your bank to the bridge head, then cross straight over the deck
      gy = Math.abs(u.x - bridge) > 0.2 ? ownBankY : farBankY;
    }
    const d = dist(u.x, u.y, gx, gy);
    const step = u.moveSpeed * dt;
    if (d <= step || d === 0) {
      u.x = gx;
      u.y = gy;
    } else {
      u.x += ((gx - u.x) / d) * step;
      u.y += ((gy - u.y) / d) * step;
    }
    // Hard rule: inside the river band a ground unit must stand on a bridge deck.
    if (!u.flying && Math.abs(u.y - RIVER_Y) <= RIVER_HALF_HEIGHT + 0.05) {
      if (bridge !== null) u.x = bridge; // stay on the deck while crossing
      else u.y = u.y < RIVER_Y ? RIVER_Y - (RIVER_HALF_HEIGHT + 0.1) : RIVER_Y + (RIVER_HALF_HEIGHT + 0.1);
    }
  }

  private damageBoss(amount: number, p: Participant): void {
    const dealt = Math.min(amount, this.bossHp);
    this.bossHp -= amount;
    p.damageDealt += dealt;
    if (this.bossHp <= 0) this.finish('win');
  }

  private loop(): void {
    if (this.ended) return;
    this.tickCount++;
    this.timeLeft = Math.max(0, this.timeLeft - TICK_DT);

    // economy tick: card recharges OR elixir regen
    if (this.config.economy === 'cooldown') {
      for (const p of this.participants.values()) {
        for (const [id, v] of p.cooldowns) {
          if (v > 0) p.cooldowns.set(id, Math.max(0, v - TICK_DT));
        }
      }
    } else {
      for (const p of this.participants.values()) {
        p.elixir = Math.min(ELIXIR_MAX, p.elixir + TICK_DT / ELIXIR_REGEN_SECONDS);
      }
    }

    // units move toward boss and attack it
    const owners = new Map<string, Participant>();
    for (const p of this.participants.values()) owners.set(p.userId, p);
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const d = dist(u.x, u.y, BOSS_POS.x, BOSS_POS.y);
      if (d <= u.range + 0.6) {
        u.attackCd -= TICK_DT;
        if (u.attackCd <= 0 && u.damage > 0) {
          const owner = owners.get(u.ownerId);
          if (owner) this.damageBoss(u.damage, owner);
          u.attackCd = u.hitSpeed;
          this.pushEvent({
            kind: 'attack', side: 'A',
            fromX: round2(u.x), fromY: round2(u.y),
            toX: BOSS_POS.x, toY: BOSS_POS.y,
            ranged: u.range > 1.5,
          });
        }
      } else if (u.moveSpeed > 0) {
        this.moveUnitTowardBoss(u, TICK_DT);
      }
    }

    // boss AoE attack
    this.bossAttackCd -= TICK_DT;
    if (this.bossAttackCd <= 0) {
      let struck = false;
      for (const u of this.units) {
        if (u.hp > 0 && dist(u.x, u.y, BOSS_POS.x, BOSS_POS.y) <= BOSS_RANGE) {
          u.hp -= this.bossDamage;
          struck = true;
        }
      }
      // One slam, not one event per victim: the boss hits an area, and N
      // identical events would just burn the per-window cap.
      if (struck) {
        this.pushEvent({
          kind: 'spell', side: 'B',
          fromX: BOSS_POS.x, fromY: BOSS_POS.y,
          toX: BOSS_POS.x, toY: BOSS_POS.y,
          ranged: false, radius: BOSS_RANGE,
        });
      }
      this.bossAttackCd = BOSS_HIT_SPEED;
    }
    this.units = this.units.filter((u) => u.hp > 0);

    if (this.tickCount % Math.round(TICK_RATE / SNAPSHOT_RATE) === 0) this.broadcast();

    if (this.bossHp <= 0 && !this.ended) this.finish('win');
    else if (this.timeLeft <= 0 && !this.ended) this.finish('loss');
  }

  private snapshotFor(p: Participant): BossSnapshot {
    const entities: EntitySnapshot[] = [
      {
        id: 'boss', side: 'B', kind: 'tower', x: BOSS_POS.x, y: BOSS_POS.y,
        hp: Math.max(0, Math.round(this.bossHp)), maxHp: this.bossMaxHp, color: 0x7e57c2,
      },
    ];
    for (const u of this.units) {
      entities.push({
        id: u.id, side: 'A', kind: 'unit', cardId: u.cardId,
        x: round2(u.x), y: round2(u.y), hp: Math.max(0, Math.round(u.hp)), maxHp: u.maxHp, color: u.color,
      });
    }
    return {
      tick: this.tickCount,
      timeLeft: Math.ceil(this.timeLeft),
      bossHp: Math.max(0, Math.round(this.bossHp)),
      bossMaxHp: this.bossMaxHp,
      difficultyMultiplier: this.multiplier,
      entities,
      participants: [...this.participants.values()].map((x) => ({
        userId: x.userId, nickname: x.nickname, damageDealt: Math.round(x.damageDealt),
      })),
      events: this.events.length ? [...this.events] : undefined,
      yourElixir: round2(p.elixir),
      hand: this.handOf(p),
      nextCard: this.config.economy === 'cooldown' ? '' : p.queue[4],
      mode: { economy: this.config.economy, deployment: this.config.deployment },
      cooldowns: this.config.economy === 'cooldown'
        ? p.queue.map((id): CardCooldown => ({
            cardId: id,
            remaining: round2(p.cooldowns.get(id) ?? 0),
            total: round2((getCard(id)?.cooldownSec ?? 0) * BOSS_RAIDER_COOLDOWN_MULT),
          }))
        : undefined,
    };
  }

  private broadcast(): void {
    for (const p of this.participants.values()) {
      p.send({ t: 'boss', snapshot: this.snapshotFor(p) });
    }
    // Cleared only after every participant has been served — see the note on
    // `events` above.
    this.events.length = 0;
  }

  private finish(outcome: 'win' | 'loss'): void {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    const result: BossResult = {
      outcome,
      bossMaxHp: this.bossMaxHp,
      participants: [...this.participants.values()].map((x) => ({
        userId: x.userId, nickname: x.nickname, damageDealt: Math.round(x.damageDealt),
      })),
      rewardGold: outcome === 'win' ? 200 * this.multiplier : 25,
    };
    for (const p of this.participants.values()) p.send({ t: 'bossEnd', result });
    this.onResult?.(result); // persist rewards (the message alone grants nothing)
    this.participants.clear();
    this.onEmpty(this);
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy) || 0.0001;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
