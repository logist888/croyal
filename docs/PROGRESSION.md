# Progression

## Implemented
- **Trophies** — ladder rating. Win **+30**, loss **−30** (floored at 0).
  Used as the matchmaking key.
- **Leagues** — 8 tiers keyed by trophy thresholds (`LEAGUES` in
  `shared/src/constants.ts`), from Training Camp (0) to Legend League (3000).
  Shown in the hub with progress to the next league.
- **Card unlocks by league** (build-15, `shared/src/unlocks.ts`) — each of the
  10 card themes is tied to a league; the top two leagues carry two themes each.
  The lock gates **use and drops**, not ownership: the battle trio may only
  contain unlocked cards (validated on save — a trophy drop never breaks a saved
  trio) and battle-chest drops draw from the unlocked pool. Everything the
  onboarding hands out is always unlocked. Full table in [CARDS.md](CARDS.md).
- **Card collection & upgrades** — every account owns all 80 cards at level 1;
  duplicates (chest drops) + gold buy levels (+10% hp/damage per level,
  compounding, `MAX_CARD_LEVEL`). Upgrades work even on league-locked cards.
- **Win / loss record** — persisted per match.
- **Gold** — earned per match (win +50, loss +10) and from winning boss raids
  (`200 × difficulty` gold on a co-op win). The upgrade currency.
- **Gems** — currency field present (no sink/source wired yet).
- **Boss rewards** — gold scaled by the co-op difficulty multiplier.
- **Battle chests with unlock timers** (build-16, `shared/chests.ts`) — a win
  drops a chest (rarity weighted: wood→legendary) into one of 4 slots. Chests
  unlock on a timer (only ONE at a time); a ready chest is opened for gold +
  duplicate cards from the player's unlocked pool, or gems skip the timer
  (1 gem per 10 min remaining). Slots can fill up — pressure to open. Timers are
  timestamp-based (no background job). Losses earn no chest; gold is immediate.

## Battle trio (cooldown mode — the default since build-14)
- Every player has a 3-card `trio` (default `DEFAULT_TRIO`), edited in the hub
  picker (`POST /api/trio`): exactly 3 distinct owned **and unlocked** cards.
- New players open **5 starter boxes** during onboarding and assemble their
  first trio from the revealed starter pool. Boxes grant **no duplicates** —
  the upgrade economy is untouched.

## Deck (legacy elixir mode)
- Every player also keeps the 8-card `DEFAULT_DECK` — it powers the flagged
  legacy battle core. (Reward drops rotate over the unlocked pool since
  build-15, no longer over the deck.)

- **Daily quests + login streak** (build-16, `shared/daily.ts`) — a 7-day
  login-reward cycle (streak continues on consecutive UTC days) + 3 rotating
  daily quests (play / win / open-chest / upgrade) tracked from real events,
  reset each UTC day. Claim rewards on the "🎯 Daily" hub screen.

- **Leaderboards** (build-16) — global top players by trophies (with your own
  rank) and top clans by summed live member trophies, on the "🏆 Ranking" screen.

## Planned (next phases)
- **Seasons / ladder resets** (Этап 1 of docs/ROADMAP.ru.md).
- **Clan progression** — clan trophies, clan boss tiers, weekly resets.
- **Seasons & ladder resets.**
- **Gem sources/sinks** (cosmetics, chest skips).

Tuning for all of the above belongs in `shared/src/constants.ts` (thresholds,
rewards) and `shared/src/cards.ts` / `scripts/gen-catalog.mjs` (card balance) so
the client and server stay in agreement.
