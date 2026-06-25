# Clans & Clan Boss Raid

## Clans
- **Anyone can create or join** a clan.
- **Maximum 20 members** per clan (`MAX_CLAN_MEMBERS = 20`). The cap is enforced
  server-side in `Store.joinClan` and at the data layer.
- **Clan names may be in ANY language** — any Unicode is allowed (Latin, Cyrillic,
  CJK, emoji…). Only length (1–24 code points) and emptiness are validated
  (`validateClanName`). This is deliberately the opposite of the English-only
  nickname rule.
- A player can be in **at most one clan** at a time.

### Roles & actions
| Role | Capabilities |
| --- | --- |
| `leader` | kick members, leave (auto hand-off), disband (last to leave) |
| `elder` | reserved (future) |
| `member` | leave |

- The **creator** becomes the leader.
- When the leader leaves, leadership passes to the **longest-standing** member; if
  the last member leaves, the clan is deleted.
- The leader can **kick** any other member (`POST /api/clans/:id/kick`).

### Data model
`clans(id, name, leaderId, createdAt)` + `clan_members(clanId, userId, role,
trophies, joinedAt)`. Invariants: ≤ 20 members, one clan per player. See
[DATABASE.md](DATABASE.md).

## Clan Boss Raid (co-op)
Clanmates fight a **shared boss** together in real time.

- Join via the clan screen → `{t:'bossJoin', clanId}`. Up to a full clan (20) can
  raid at once.
- Each raider has their own elixir and deck; troops they deploy walk to the boss
  and damage it. The boss periodically deals **area damage** to nearby troops.
- **Co-op doubles the difficulty.** With **2 or more** simultaneous raiders the
  boss HP and damage are **×2** (`BOSS_COOP_MULTIPLIER = 2`). Difficulty is
  recomputed live as players join/leave; HP scales while preserving the current
  damage fraction.
- **Per-player damage** is attributed and shown live and on the result screen.
- Win by destroying the boss before the **3-minute** timer (`BOSS_RAID_SECONDS`);
  reward gold scales with the difficulty multiplier.

Implementation: `server/src/game/boss.ts` (`BossRoom`), one room per clan, created
on first join and torn down when empty. Tested in
`server/src/__tests__/boss.test.ts` (solo ×1, co-op ×2).
