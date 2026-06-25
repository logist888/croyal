import type { Side, TowerType } from './constants';

export type Language = 'en' | 'ru';

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
  deck: string[]; // 8 card ids
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
}

export interface BattleSnapshot {
  tick: number;
  timeLeft: number; // seconds remaining in the round
  doubleElixir: boolean;
  yourSide: Side;
  elixir: { A: number; B: number };
  hand: string[]; // your current 4-card hand
  nextCard: string; // your next card to cycle in
  entities: EntitySnapshot[];
  score: { A: number; B: number }; // towers destroyed by each side
}

export type MatchOutcome = 'win' | 'loss';

export interface MatchResult {
  outcome: MatchOutcome; // from the receiving player's perspective
  reason: 'king' | 'tiebreak' | 'timeout' | 'opponent_left';
  yourScore: number;
  opponentScore: number;
  trophyDelta: number;
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
}

export interface BossResult {
  outcome: 'win' | 'loss';
  bossMaxHp: number;
  participants: BossParticipant[];
  rewardGold: number;
}
