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

- **Monthly seasons + ladder soft-reset** (build-16, `shared/seasons.ts`) — a
  season is one UTC calendar month. The store tracks the trophy **peak** reached
  in the season and, on the first read/action of a new month, closes the old one:
  trophies **soft-reset** (kept up to `SEASON_RESET_FLOOR` = 600, then half the
  excess carries over) and an **end-of-season reward** sized by the peak league
  is banked as a pending claim. Timestamp-based (no scheduled job): the rollover
  is detected lazily. The hub shows a season countdown; a reward modal greets the
  player on the first login after a rollover (`POST /api/season/claim`).

- **Clan wars** (build-21, `shared/warfare.ts`) — a war is one UTC week. Members
  earn their clan **war points** by winning ranked battles; clans rank live by
  weekly score (the "⚔️ War" screen). On the week rollover the previous week is
  finalised: each contributor banks a pending reward scaled by their contribution
  and the clan's final score **tier** (100/300/600). Timestamp-based, no cron
  (DB `clans.war` + `users.war_reward`). A gem source tied to teamplay.

- **Shop** (build-22/23, `shared/shop.ts`) — spend gems on **gold packs**
  (better rate on bigger packs), and buy **gems with Telegram Stars** (currency
  XTR; idempotent crediting via a `payments` table; gated by `STARS_ENABLED`, see
  [PAYMENTS.md](PAYMENTS.md)). The "🛒 Shop" screen.
- **Battle Pass** (build-24, `shared/battlepass.ts`) — a seasonal free/premium
  reward track (20 tiers) tied to the monthly season. Earn BP-XP from ranked
  battles; premium unlocks with gems. Claim rewards on the "🎟 Battle Pass"
  screen. Timestamp-based reset (DB `users.battle_pass`).

## Planned (next phases)
- **Push notifications** (Этап 1.5 of docs/ROADMAP.ru.md — deferred until the
  dev-auth hole is closed).
- **Cosmetics** (tower skins, emotes, card frames — no-P2W gem sinks).
- **Live spectating** and code-based multi-human tournament lobbies (Этап 2 tail).

Tuning for all of the above belongs in `shared/src/constants.ts` (thresholds,
rewards) and `shared/src/cards.ts` / `scripts/gen-catalog.mjs` (card balance) so
the client and server stay in agreement.
