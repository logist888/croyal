/**
 * PostgreSQL durability layer (write-through).
 *
 * The in-memory Store stays the runtime source of truth (fast, synchronous); the
 * Db mirrors every change to Postgres and hydrates the Store on boot. Enabled only
 * when DATABASE_URL is set (Neon/Supabase/Render PG…), otherwise the game runs
 * purely in memory. deck/cards/members are stored as JSONB.
 */
import pg from 'pg';
import { DEFAULT_TRIO, TRIO_SIZE, type PlayerProfile, type Clan, type ClanMember } from '@croyal/shared';

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
  clan_id     UUID,
  created_at  BIGINT NOT NULL
);
-- Idempotent migration for databases created before the cooldown redesign.
-- DEFAULT 5 marks EXISTING players as "onboarding done"; new users are
-- inserted with explicit 0 by upsertUser.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trio JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_boxes_opened INT NOT NULL DEFAULT 5;
CREATE TABLE IF NOT EXISTS clans (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  leader_id  UUID NOT NULL,
  created_at BIGINT NOT NULL,
  members    JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token   UUID PRIMARY KEY,
  user_id UUID NOT NULL
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
      clanId: r.clan_id ?? null,
      createdAt: Number(r.created_at),
    }));
    const clans: Clan[] = c.rows.map((r) => ({
      id: r.id,
      name: r.name,
      leaderId: r.leader_id,
      createdAt: Number(r.created_at),
      members: r.members as ClanMember[],
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
      `INSERT INTO users (id, telegram_id, nickname, language, trophies, wins, losses, gold, gems, xp, deck, trio, starter_boxes_opened, cards, clan_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14::jsonb,$15,$16)
       ON CONFLICT (id) DO UPDATE SET
         language=$4, trophies=$5, wins=$6, losses=$7, gold=$8, gems=$9, xp=$10,
         deck=$11::jsonb, trio=$12::jsonb, starter_boxes_opened=$13, cards=$14::jsonb, clan_id=$15`,
      [u.id, u.telegramId, u.nickname, u.language, u.trophies, u.wins, u.losses, u.gold, u.gems, u.xp,
        JSON.stringify(u.deck), JSON.stringify(u.trio), u.starterBoxesOpened, JSON.stringify(u.cards), u.clanId, u.createdAt],
    );
  }

  upsertClan(c: Clan): void {
    this.run(
      `INSERT INTO clans (id, name, leader_id, created_at, members)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (id) DO UPDATE SET name=$2, leader_id=$3, members=$5::jsonb`,
      [c.id, c.name, c.leaderId, c.createdAt, JSON.stringify(c.members)],
    );
  }

  deleteClan(id: string): void {
    this.run('DELETE FROM clans WHERE id=$1', [id]);
  }

  upsertSession(token: string, userId: string): void {
    this.run('INSERT INTO sessions (token, user_id) VALUES ($1,$2) ON CONFLICT (token) DO NOTHING', [token, userId]);
  }
}
