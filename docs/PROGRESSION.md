# Progression

## Implemented
- **Trophies** — ladder rating. Win **+30**, loss **−30** (floored at 0).
  Used as the matchmaking key.
- **Win / loss record** — persisted per match.
- **Gold** — earned per match (win +50, loss +10) and from winning boss raids
  (`200 × difficulty` gold on a co-op win). Currency for future upgrades.
- **Gems** — currency field present (no sink/source wired yet).
- **Boss rewards** — gold scaled by the co-op difficulty multiplier.

## Deck
- Every player starts with the same 8-card `DEFAULT_DECK`. A deck builder and
  per-card levels are planned (gold/card-shard sink).

## Planned (next phases)
- **Arenas / leagues** keyed by trophy thresholds.
- **Card collection & upgrades** — card levels scaling stats, gold + duplicate
  shards as the upgrade currency.
- **Chests / rewards** after wins, with unlock timers.
- **Clan progression** — clan trophies, clan boss tiers, weekly resets.
- **Seasons & ladder resets.**

Tuning for all of the above belongs in `shared/src/constants.ts` so the client and
server stay in agreement.
