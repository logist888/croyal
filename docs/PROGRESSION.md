# Progression

## Implemented
- **Trophies** — ladder rating. Win **+30**, loss **−30** (floored at 0).
  Used as the matchmaking key.
- **Win / loss record** — persisted per match.
- **Gold** — earned per match (win +50, loss +10) and from winning boss raids
  (`200 × difficulty` gold on a co-op win). Currency for future upgrades.
- **Gems** — currency field present (no sink/source wired yet).
- **Boss rewards** — gold scaled by the co-op difficulty multiplier.

## Battle trio (cooldown mode — the default since build-14)
- Every player has a 3-card `trio` (default `DEFAULT_TRIO`), edited in the hub
  picker (`POST /api/trio`): exactly 3 distinct owned cards.
- New players open **5 starter boxes** during onboarding and assemble their
  first trio from the revealed starter pool. Boxes grant **no duplicates** —
  the upgrade economy is untouched.

## Deck (legacy elixir mode)
- Every player also keeps the 8-card `DEFAULT_DECK` — it powers the flagged
  legacy battle core and the per-match reward-drop rotation.

## Planned (next phases)
- **Arenas / leagues** keyed by trophy thresholds.
- **Card collection & upgrades** — card levels scaling stats, gold + duplicate
  shards as the upgrade currency.
- **Chests / rewards** after wins, with unlock timers.
- **Clan progression** — clan trophies, clan boss tiers, weekly resets.
- **Seasons & ladder resets.**

Tuning for all of the above belongs in `shared/src/constants.ts` so the client and
server stay in agreement.
