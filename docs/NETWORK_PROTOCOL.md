# Network Protocol

Account & clan management use **REST**; real-time battles and boss raids use a
**WebSocket**. All message shapes are defined in `shared/src/protocol.ts` and
`shared/src/types.ts` and shared by both sides.

## REST API (`server/src/http.ts`)

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | — | — | `{ ok }` |
| POST | `/api/auth` | — | `{ initData? , devUser? }` | `{ registered, token?, profile? }` or `{ registered:false, telegramId, suggestedNickname }` |
| POST | `/api/register` | — | `{ initData?/devUser?, nickname, language }` | `{ token, profile }` |
| GET | `/api/me` | Bearer | — | `{ profile }` |
| GET | `/api/clans` | Bearer | — | `{ clans: [{id,name,memberCount}] }` |
| GET | `/api/clans/:id` | Bearer | — | `{ clan }` |
| POST | `/api/clans` | Bearer | `{ name }` | `{ clan }` |
| POST | `/api/clans/:id/join` | Bearer | — | `{ clan }` |
| POST | `/api/clans/leave` | Bearer | — | `{ ok }` |
| POST | `/api/clans/:id/kick` | Bearer | `{ targetUserId }` | `{ clan }` |

- **Auth** is a Bearer session token from `/api/auth` or `/api/register`.
- There is intentionally **no nickname-change endpoint** — nicknames are immutable.
- Errors return `{ error: string }` with a 4xx status.

## WebSocket (`server/src/ws.ts`, path `/ws`)

The first message must be `auth`. Until authenticated, all other messages are
rejected.

### Client → Server (`ClientMessage`)
```ts
{ t: 'auth', token }
{ t: 'queue' }                              // join 1v1 matchmaking
{ t: 'cancelQueue' }
{ t: 'deploy', cardId, x, y }               // play a card (tile coords)
{ t: 'leaveMatch' }                         // forfeit = auto loss
{ t: 'bossJoin', clanId }
{ t: 'bossDeploy', cardId, x, y }
{ t: 'bossLeave' }
{ t: 'ping' }
```

### Server → Client (`ServerMessage`)
```ts
{ t: 'authOk', userId, nickname } | { t: 'authError', error }
{ t: 'queued' }
{ t: 'matchFound', matchId, opponent }
{ t: 'battle', snapshot }                   // BattleSnapshot, 10/s
{ t: 'matchEnd', result }                   // MatchResult
{ t: 'boss', snapshot }                     // BossSnapshot, 10/s
{ t: 'bossEnd', result }                    // BossResult
{ t: 'error', error } | { t: 'pong' }
```

### `BattleSnapshot` (key fields)
- `tick`, `timeLeft` (s), `doubleElixir`, `yourSide` (`'A'|'B'`)
- `elixir: {A,B}`, `hand: string[]`, `nextCard`
- `entities: EntitySnapshot[]` — `{id, side, kind, cardId?, towerType?, x, y, hp, maxHp, color}`
- `score: {A,B}` — towers destroyed by each side

### `BossSnapshot`
- `bossHp`, `bossMaxHp`, `difficultyMultiplier` (1 solo / 2 co-op),
  `timeLeft`, `entities`, `participants: [{userId, nickname, damageDealt}]`,
  `yourElixir`, `hand`, `nextCard`.

Coordinates are in **tiles** (server/absolute space). The client transforms them so
the local player's side renders at the bottom; taps are converted back to absolute
tile coordinates before being sent as `deploy`.
