# Reference Notes (original-game study)

Working notes that translate the reference game's **mechanics, structure and UX
flows** into changes for Tower Clash. We replicate *how it works and is laid out* —
**all art, names, logo and branding stay our own original work** (we never ship the
reference screenshots or copy its artwork/trademarks).

> Status: **batch 1**, built from screenshots shared in chat so far. The files
> dropped into `art/incoming/ui/` did not reach the repo (the laptop folder isn't a
> git clone), so this will be expanded as more screens arrive in chat.

---

## 1. Launch & onboarding (from screenshots)
- Privacy/cookies consent on first launch (Accept all / Decline all).
- Age slider with a note that it "does not affect gameplay".
- Auto sign-in with an assigned username shown ("You signed in as …").
- A coach character runs a short **tutorial** of training battles before the
  multiplayer arena unlocks.

**Adopt:** optional consent screen + a guided tutorial (vs a live opponent bot).
**Keep:** our immutable English-nickname registration (explicit earlier requirement).

## 2. Arena & towers (tutorial screens)
- Top = enemy (red), bottom = player (blue); each side: 1 King + 2 Princess towers;
  central river with 2 bridges; checkered grass lanes.
- Tutorial tower HP seen on-screen: Princess ≈ **280** (tutorial-reduced), King
  **1400**; both show a level "1" badge.

**Adopt:** matches our current layout. Consider per-level tower HP and a level
badge on towers later.

## 3. Main hub structure (from UI mockups)
- Top bar: avatar + name + **level** + trophy/progress bar; currency counters
  (gold / gems / elixir) each with a "+"; mail / friends / settings icons.
- Primary tabs: **Battle** (big) + Cards(Deck) / Clan / Shop.
- Side menu: Home / Battle / Deck / Clan / Shop / Quests / Events / Leaderboard /
  Settings.
- Center: a **chests** row (wooden → legendary) with Open + unlock timers; plus
  Missions / Achievements / Trophies / Ranked / Season Pass / Friends.

**Adopt (original art):** restructure our menu into a hub — top bar with
name + level + trophies + gold/gems, an **arena/league** band, a prominent Battle
button, and Cards/Clan. Chests/shop/season-pass are later phases.

## 4. Battle HUD
- Crown counter (towers destroyed) at the top, round timer, elixir bar (max 10)
  with the next-card preview, emote button.

**Adopt:** show destroyed-towers as **crown icons**; add emotes later. (Timer,
elixir bar + next card already exist.)

## 5. Progression (general structure)
- **Arenas/leagues** gated by trophy thresholds.
- Card **rarity** + **levels** (upgrade with gold + duplicate cards).
- **Chests** as the main reward drip (with unlock timers).
- Account/King level from card-upgrade XP.

**Adopt:** league names by trophy range (originals) now; card levels, chests and
king level in later phases.

---

## Mapping → our codebase
- Leagues/arenas, level helper → `shared/src/constants.ts`.
- Hub layout → `client/src/ui.ts` (`renderMenu`) + `style.css`.
- Crown icons / emotes → `client/src/battle.ts` + `hud.ts`.
- Tower levels / card levels → `shared` stats + `server` simulation (later).
