# Data Model & Persistence

## Current: in-memory store
The MVP ships with an **in-memory** `Store` (`server/src/store.ts`) so it runs with
zero external services. It holds users, sessions (token → user), and clans in `Map`s
and enforces all domain invariants:

- nickname immutability (rejects any change),
- clan capacity ≤ 20,
- one clan per player,
- leader hand-off / clan deletion on leave.

> In-memory means state resets on server restart. Swap in the SQL/Redis path below
> for durability.

## Production path: PostgreSQL + Redis
The `Store` interface is intentionally small so it can be backed by a database.

### PostgreSQL (durable)
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  telegram_id   BIGINT UNIQUE NOT NULL,
  nickname      VARCHAR(16) UNIQUE NOT NULL,   -- immutable; no UPDATE path
  language      VARCHAR(8)  NOT NULL DEFAULT 'en',
  trophies      INT NOT NULL DEFAULT 0,
  wins          INT NOT NULL DEFAULT 0,
  losses        INT NOT NULL DEFAULT 0,
  gold          INT NOT NULL DEFAULT 100,
  gems          INT NOT NULL DEFAULT 0,
  deck          JSONB NOT NULL,
  clan_id       UUID NULL REFERENCES clans(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clans (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,                   -- any language (Unicode)
  leader_id   UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clan_members (
  clan_id    UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id), -- one clan per player
  role       VARCHAR(8) NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (clan_id, user_id)
);
```

Enforce the **20-member cap** with a trigger / advisory lock on insert, or a guarded
transaction (`SELECT count(*) … FOR UPDATE`), mirroring `Store.joinClan`.

To keep the nickname immutable at the DB layer, grant no `UPDATE` on `users.nickname`
(or add a trigger that raises on change) — the app already refuses changes.

### Redis (ephemeral / fast)
- **Matchmaking queue** (sorted set by trophies), **session tokens** (TTL),
- **live match / boss-room state** for horizontal scale and reconnection,
- pub/sub to fan match events across worker processes.

## Migration steps
1. Implement a `PgStore`/`RedisStore` with the same methods as `Store`.
2. Inject it where `store` is imported (a single module).
3. Move match/boss state and matchmaking into Redis for multi-process scale.
