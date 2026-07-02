import type { Side, TowerType } from './constants';
import type { DeploymentMode, EconomyMode } from './battle-config';

export type Language = 'en' | 'ru';

/** Per-card inventory entry: current level + duplicate cards toward the next level. */
export interface CardState {
  level: number;
  count: number;
}

export interface PlayerProfile {
  id: string; // internal id (derived from Telegram user id)
  telegramId: number;
  nickname: string; // IMMUTABLE after registration
  language: Language;
  trophies: number;
  wins: number;
  losses: number;
  gold: number;
  gems: number;
  xp: number; // account XP (from card upgrades) -> king level
  deck: string[]; // 8 card ids (legacy elixir model; also drives reward drops)
  trio: string[]; // 3 active battle cards (cooldown model)
  /** Starter boxes revealed during onboarding (>= STARTER_BOX_COUNT = done). */
  starterBoxesOpened: number;
  cards: Record<string, CardState>; // owned cards (id -> level/count)
  clanId: string | null;
  createdAt: number;
}

export type ClanRole = 'leader' | 'elder' | 'member';

export interface ClanMember {
  userId: string;
  nickname: string;
  role: ClanRole;
  trophies: number;
  joinedAt: number;
}

export interface Clan {
  id: string;
  name: string; // any language
  leaderId: string;
  createdAt: number;
  members: ClanMember[];
}

// --- Battle snapshot (server -> client) ---

export type EntityKind = 'tower' | 'unit' | 'building';

export interface EntitySnapshot {
  id: string;
  side: Side;
  kind: EntityKind;
  cardId?: string;
  towerType?: TowerType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  flying?: boolean;
  color: number;
  /** Active status kinds (slow|root|stun|rage|shield|poison); omitted when none. */
  statuses?: string[];
}

/** A lingering spell area (poison / slow) rendered as a translucent circle. */
export interface ZoneSnapshot {
  id: string;
  x: number;
  y: number;
  radius: number;
  status: 'poison' | 'slow';
  color: number;
  remaining: number;
}

/** Which battle model produced a snapshot (drives the client's HUD branch). */
export interface BattleModeInfo {
  economy: EconomyMode;
  deployment: DeploymentMode;
}

/** Recharge state of one card in the receiving player's trio (stable order). */
export interface CardCooldown {
  cardId: string;
  remaining: number; // seconds until playable again (0 = ready)
  total: number; // full recharge this card was set to (for overlay fills)
}

/**
 * A combat event within the last snapshot window (visual only — damage is
 * already applied server-side). The client draws projectiles for ranged
 * attacks and impact/AoE effects at the target point.
 */
export interface AttackEvent {
  kind: 'attack' | 'spell';
  side: Side; // attacker's side
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  ranged: boolean; // draw a projectile from -> to
  radius?: number; // spell AoE radius (tiles)
  /** Special FX coloring for mechanic events. */
  effect?: 'heal' | 'chain' | 'knockback' | 'spawn';
}

export interface BattleSnapshot {
  tick: number;
  timeLeft: number; // seconds remaining in the round
  doubleElixir: boolean; // legacy name; mirrors finalPhase in the cooldown model
  yourSide: Side;
  elixir: { A: number; B: number };
  hand: string[]; // your current 4-card hand (cooldown model: your trio)
  nextCard: string; // your next card to cycle in (cooldown model: '')
  entities: EntitySnapshot[];
  score: { A: number; B: number }; // towers destroyed by each side
  // --- Cooldown model additions (optional so stale clients keep parsing) ---
  mode?: BattleModeInfo;
  cooldowns?: CardCooldown[]; // your trio's recharge state
  finalPhase?: boolean; // last minute: cooldowns tick twice as fast
  events?: AttackEvent[]; // combat FX since the previous snapshot
  zones?: ZoneSnapshot[]; // lingering spell areas (poison/slow)
}

export type MatchOutcome = 'win' | 'loss';

export interface BattleRewards {
  gold: number;
  cards: Record<string, number>; // cardId -> count gained
}

export interface MatchResult {
  outcome: MatchOutcome; // from the receiving player's perspective
  reason: 'king' | 'tiebreak' | 'timeout' | 'opponent_left';
  yourScore: number;
  opponentScore: number;
  trophyDelta: number;
  rewards: BattleRewards; // battle chest contents
}

// --- Boss raid snapshot ---

export interface BossParticipant {
  userId: string;
  nickname: string;
  damageDealt: number;
}

export interface BossSnapshot {
  tick: number;
  timeLeft: number;
  bossHp: number;
  bossMaxHp: number;
  difficultyMultiplier: number; // 1 solo, 2 co-op
  entities: EntitySnapshot[];
  participants: BossParticipant[];
  yourElixir: number;
  hand: string[];
  nextCard: string;
  // --- Cooldown model additions ---
  mode?: BattleModeInfo;
  cooldowns?: CardCooldown[];
}

export interface BossResult {
  outcome: 'win' | 'loss';
  bossMaxHp: number;
  participants: BossParticipant[];
  rewardGold: number;
}
