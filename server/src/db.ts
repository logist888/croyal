/**
 * PostgreSQL durability layer (write-through).
 *
 * The in-memory Store stays the runtime source of truth (fast, synchronous); the
 * Db mirrors every change to Postgres and hydrates the Store on boot. Enabled only
 * when DATABASE_URL is set (Neon/Supabase/Render PG…), otherwise the game runs
 * purely in memory. deck/cards/members are stored as JSONB.
 */
import pg from 'pg';
import { DEFAULT_TRIO, TRIO_SIZE, type PlayerProfile, type Clan, type ClanMember, type ChestSlot, type DailyState, type SeasonState, type ClanWarState, type WarReward, type BattlePassState, type CosmeticsState } from '@croyal/shared';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  nickname    TEXT UNIQUE NOT NULL,
  language    TEXT NOT NULL DEFAULT 'en',
  trophies    INT NOT NULL DEFAULT 0,
  wins        INT NOT NULL DEFAULT 0,
  losses      INT NOT NULL DEFAULT 0,
  gold        INT NOT NULL DEFAULT 0,
  gems        INT NOT NULL DEFAULT 0,
  xp          INT NOT NULL DEFAULT 0,
  deck        JSONB NOT NULL,
  trio        JSONB NOT NULL DEFAULT '[]'::jsonb,
  starter_boxes_opened INT NOT NULL DEFAULT 0,
  cards       JSONB NOT NULL,
  chests      JSONB NOT NULL DEFAULT '[]'::jsonb,
  daily       JSONB,
  season      JSONB,
  war_reward  JSONB,
  battle_pass JSONB,
  cosmetics   JSONB,
  clan_id     UUID,
  created_at  BIGINT NOT NULL
);
-- Idempotent migration for databases created before the cooldown redesign.
-- DEFAULT 5 marks EXISTING players as "onboarding done"; new users are
-- inserted with explicit 0 by upsertUser.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trio JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_boxes_opened INT NOT NULL DEFAULT 5;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chests JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS season JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS war_reward JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS battle_pass JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cosmetics JSONB;
CREATE TABLE IF NOT EXISTS clans (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  leader_id  UUID NOT NULL,
  created_at BIGINT NOT NULL,
  members    JSONB NOT NULL,
  war        JSONB
);
ALTER TABLE clans ADD COLUMN IF NOT EXISTS war JSONB;
CREATE TABLE IF NOT EXISTS sessions (
  token   UUID PRIMARY KEY,
  user_id UUID NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  charge_id  TEXT PRIMARY KEY,
  user_id    UUID NOT NULL,
  gems       INT NOT NULL,
  created_at BIGINT NOT NULL
);
`;

export interface LoadedData {
  users: PlayerProfile[];
  clans: Clan[];
  sessions: Array<[string, string]>;
}

export class Db {
  private pool: pg.Pool;

  constructor(url: string) {
    const local = /localhost|127\.0\.0\.1/.test(url);
    this.pool = new pg.Pool({
      connectionString: url,
      ssl: local ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async loadAll(): Promise<LoadedData> {
    const [u, c, s] = await Promise.all([
      this.pool.query('SELECT * FROM users'),
      this.pool.query('SELECT * FROM clans'),
      this.pool.query('SELECT token, user_id FROM sessions'),
    ]);
    const users: PlayerProfile[] = u.rows.map((r) => ({
      id: r.id,
      telegramId: Number(r.telegram_id),
      nickname: r.nickname,
      language: r.language,
      trophies: r.trophies,
      wins: r.wins,
      losses: r.losses,
      gold: r.gold,
      gems: r.gems,
      xp: r.xp,
      deck: r.deck as string[],
      trio: Array.isArray(r.trio) && r.trio.length === TRIO_SIZE ? (r.trio as string[]) : [...DEFAULT_TRIO],
      starterBoxesOpened: r.starter_boxes_opened ?? 5,
      cards: r.cards as PlayerProfile['cards'],
      chests: Array.isArray(r.chests) ? (r.chests as ChestSlot[]) : [],
      daily: (r.daily as DailyState) ?? null,
      season: (r.season as SeasonState) ?? null,
      warReward: (r.war_reward as WarReward) ?? null,
      battlePass: (r.battle_pass as BattlePassState) ?? null,
      cosmetics: (r.cosmetics as CosmeticsState) ?? null,
      clanId: r.clan_id ?? null,
      createdAt: Number(r.created_at),
    }));
    const clans: Clan[] = c.rows.map((r) => ({
      id: r.id,
      name: r.name,
      leaderId: r.leader_id,
      createdAt: Number(r.created_at),
      members: r.members as ClanMember[],
      war: (r.war as ClanWarState) ?? null,
    }));
    const sessions: Array<[string, string]> = s.rows.map((r) => [r.token, r.user_id]);
    return { users, clans, sessions };
  }

  // --- write-through (fire-and-forget; errors are logged, never thrown) ---
  private run(sql: string, params: unknown[]): void {
    this.pool.query(sql, params).catch((e: Error) => console.error('[db]', e.message));
  }

  upsertUser(u: PlayerProfile): void {
    this.run(
      `INSERT INTO users (id, telegram_id, nickname, language, trophies, wins, losses, gold, gems, xp, deck, trio, starter_boxes_opened, cards, chests, daily, clan_id, created_at, season, war_reward, battle_pass, cosmetics)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19::jsonb,$20::jsonb,$21::jsonb,$22::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         language=$4, trophies=$5, wins=$6, losses=$7, gold=$8, gems=$9, xp=$10,
         deck=$11::jsonb, trio=$12::jsonb, starter_boxes_opened=$13, cards=$14::jsonb, chests=$15::jsonb, daily=$16::jsonb, clan_id=$17, season=$19::jsonb, war_reward=$20::jsonb, battle_pass=$21::jsonb, cosmetics=$22::jsonb`,
      [u.id, u.telegramId, u.nickname, u.language, u.trophies, u.wins, u.losses, u.gold, u.gems, u.xp,
        JSON.stringify(u.deck), JSON.stringify(u.trio), u.starterBoxesOpened, JSON.stringify(u.cards), JSON.stringify(u.chests), u.daily ? JSON.stringify(u.daily) : null, u.clanId, u.createdAt, u.season ? JSON.stringify(u.season) : null, u.warReward ? JSON.stringify(u.warReward) : null, u.battlePass ? JSON.stringify(u.battlePass) : null, u.cosmetics ? JSON.stringify(u.cosmetics) : null],
    );
  }

  upsertClan(c: Clan): void {
    this.run(
      `INSERT INTO clans (id, name, leader_id, created_at, members, war)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
       ON CONFLICT (id) DO UPDATE SET name=$2, leader_id=$3, members=$5::jsonb, war=$6::jsonb`,
      [c.id, c.name, c.leaderId, c.createdAt, JSON.stringify(c.members), c.war ? JSON.stringify(c.war) : null],
    );
  }

  deleteClan(id: string): void {
    this.run('DELETE FROM clans WHERE id=$1', [id]);
  }

  upsertSession(token: string, userId: string): void {
    this.run('INSERT INTO sessions (token, user_id) VALUES ($1,$2) ON CONFLICT (token) DO NOTHING', [token, userId]);
  }

  /**
   * Record a Telegram payment charge idempotently. Returns true only if this is
   * the FIRST time we've seen the charge — the caller credits gems on true only,
   * so a webhook retry can never double-credit. Awaited (not fire-and-forget)
   * because it guards real money.
   */
  async recordPayment(chargeId: string, userId: string, gems: number): Promise<boolean> {
    const r = await this.pool.query(
      'INSERT INTO payments (charge_id, user_id, gems, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (charge_id) DO NOTHING',
      [chargeId, userId, gems, Date.now()],
    );
    return r.rowCount === 1;
  }
}
