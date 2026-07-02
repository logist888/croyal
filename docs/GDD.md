# Tower Clash — Game Design Document

**Genre:** Real-time PvP tower-rush (MOBA-lite collectible card battler)
**Platform:** Telegram Mini App (Web App; mobile-first, also runs in desktop Telegram & browser)
**Sessions:** 3 minute matches, snackable meta loop
**Status:** Playable MVP (builds 1–14); progression & hosting in place
**Doc version:** 1.0 · 2026-06-28 (see the "Core redesign" note below)

> **Original IP.** Tower Clash reproduces the *mechanics and structure* of the
> tower-rush genre with **entirely original** art, names, characters and branding.
> No third-party (Supercell) assets, names or trademarks are used. Mechanics are
> not copyrightable; presentation is our own.

---

> ## ⚡ Core battle redesign (build-14)
> The battle described in this document's combat section is the **legacy** model
> (elixir + free placement). Since build-14 the game defaults to the designer's
> redesigned core: **per-card cooldowns** (no elixir pool; final minute ticks
> recharges ×2), **fixed lanes with auto-march** (the player picks WHICH card
> and WHEN — spells are tap-aimed), the **intercept rule** (one nearest marcher
> peels off per crossing threat), a **3-card battle trio** instead of the 8-deck
> cycle, **3:00 matches**, starter-box onboarding and recommended pairs. Towers,
> crowns and the no-draw tiebreaks are unchanged. The legacy core stays intact
> behind `BATTLE_ECONOMY`/`BATTLE_DEPLOYMENT` env flags (rollback = restart).
> Up-to-date battle spec: [GAME_DESIGN.md](GAME_DESIGN.md); details:
> [CHANGELOG.md](CHANGELOG.md) build-14.

---

## 1. Vision & pillars
A bite-sized, competitive card-battler that lives **inside Telegram** — no install,
instant play, viral by chat. You build an 8-card deck, fight 1v1 in 3–4 minute
real-time duels to smash towers and earn crowns, then upgrade cards, climb arenas
and raid bosses with your clan.

**Design pillars**
1. **Instant & fair.** Open from a chat, in a match in seconds; server-authoritative,
   no pay-to-win walls in the core loop.
2. **Easy to learn, deep to master.** Simple deploy-and-push controls; elixir tempo,
   counters and lane management create depth.
3. **Decisive.** Every match has a winner — **no draws** (see §3).
4. **Social by default.** Telegram identity, clans, co-op boss raids, result sharing.
5. **Snackable progression.** Short matches feed a long collection/upgrade meta.

**Elevator pitch:** "A Clash-style arena duel you play without leaving Telegram —
fast 1v1 card battles, clans, and co-op boss raids, with original heroes."

---

## 2. Audience & platform rationale
- **Audience:** mobile strategy/PvP players 16+, Telegram-native users, clan/social
  players; CIS + global (game ships **English & Russian**).
- **Why Telegram Mini App:**
  - **Zero-install** → frictionless acquisition straight from chats and channels.
  - **Built-in identity** (no signup) and **viral loops** (share results, invite to clan).
  - **Payments** via Telegram Stars; **notifications** via the bot.
  - Constraints: webview performance budget, HTTPS-only, must feel native (haptics,
    theme, back button).

---

## 3. Core gameplay (battle)

### 3.1 Arena
- Fixed board **18×30 tiles**; a **river** at the midline with **two bridges**
  (x≈4.5 and 13.5); two lanes. You defend the **bottom**, opponent the **top**
  (the client always renders *your* side at the bottom).
- **Towers (3 per side):** 1 **King** (HP 2400) + 2 **Princess** (HP 1400 each).
  Princess towers fire automatically; the **King is dormant** until it takes damage
  **or** one of its Princess towers falls, then it activates.

### 3.2 Elixir (tempo resource)
- Start **5**, regen **1 per 2.8 s**, cap **10**.
- **Double elixir** in the **final 60 s** (faster, swingier endgame).
- Deploying a card costs its elixir; the server rejects unaffordable plays.

### 3.3 Deck, hand & cycle
- **Deck = 8 cards.** In battle you hold a **4-card hand** + a **"Next" preview**.
- Playing a card sends it to the back of the queue and draws the next — a fair,
  deterministic cycle. Decks show their **average elixir cost**.

### 3.4 Controls & deploy rules
- Tap a card to select → tap a **valid tile** to deploy.
- You may deploy on **your half only**, until you destroy an enemy Princess tower,
  which **opens that lane** on the enemy half. **Spells** may target anywhere.

### 3.5 Combat & unit AI
- Server simulates at **20 ticks/s** (snapshots to clients at **10/s**).
- Units acquire the nearest valid target, **path to a bridge** to cross the river
  (ground units), attack on a hit-timer. Supports **splash**, **buildings**
  (timed lifetime), **building-only targeters** (tanks), and **spells** (instant AoE).

### 3.6 Win conditions — **NO DRAWS**
- **Round cap: 4 minutes.** No overtime.
- **Crowns = towers destroyed** (max 3). Destroying the enemy **King = instant win**.
- At the time limit a winner is **always** chosen via a deterministic tiebreak chain:
  **(1)** more crowns → **(2)** more total tower damage → **(3)** first tower destroyed
  → **(4)** deterministic seed fallback. Not winning in time = **automatic loss**.
- **Leaving/disconnecting = automatic loss.**

### 3.7 Bots
- If no human is found within ~6 s, a **practice bot** fills in (also used for the
  tutorial), so play is always instant.

---

## 4. Cards
### 4.1 Card model
Each card has: `id`, `name`, **type** (troop/spell/building), **rarity**
(common/rare/epic/legendary), **role** (Warrior/Ranged/Tank/Swarm/Splash/Building/Spell),
**elixir cost**, and stats (HP, damage, hit speed, range, move speed, targets, count,
splash, lifetime; spells use radius + damage).

### 4.2 Starter catalog (10, original designs)
| Card | Type | Rarity | Role | Cost |
| --- | --- | --- | --- | --- |
| Footman | troop | common | Warrior | 3 |
| Archers | troop | common | Ranged | 3 |
| Rat Pack | troop | common | Swarm | 2 |
| Bastion | building | common | Building | 5 |
| Sharpshooter | troop | rare | Ranged | 4 |
| Bomb Thrower | troop | rare | Splash | 4 |
| Volley | spell | rare | Spell | 3 |
| Colossus | troop | epic | Tank | 6 |
| Blademaster | troop | epic | Warrior | 4 |
| Meteor | spell | epic | Spell | 5 |

### 4.3 Levels & scaling
- Cards level up (max **L6**). Each level scales core stats **+10%** (`1.1^(level-1)`)
  applied live in the authoritative sim.
- **Upgrade cost** (duplicates + gold) per step:
  | From L | dup cards | gold |
  |---|---|---|
  | 1→2 | 2 | 5 |
  | 2→3 | 4 | 20 |
  | 3→4 | 10 | 50 |
  | 4→5 | 20 | 150 |
  | 5→6 | 50 | 400 |
- Upgrading also grants **account XP** (= new level ×2) → raises **King level**.

---

## 5. Progression & economy
### 5.1 Ladder & arenas
- **Trophies:** +30 win / −30 loss (floored at 0); used for matchmaking.
- **8 leagues/arenas** by trophy threshold (original names): Training Camp (0),
  Forest Clearing (100), Stone Fort (300), Fire Forge (600), Frost Peak (1000),
  Storm Arena (1500), Royal Arena (2200), Legend League (3000). Arenas gate card
  unlocks and cosmetic identity.

### 5.2 Account / King level
- XP from card upgrades; level curve = `10 × level` XP per level. Shown in the hub.

### 5.3 Currencies & rewards
- **Gold** (upgrade fuel): +50 win / +10 loss; from chests.
- **Cards** (duplicates): per-battle drops (winner 3 / loser 1) + chests.
- **Gems** (premium): bought with Telegram Stars; speed-ups & cosmetics.
- **Battle chest:** after each match, open a chest revealing gold + cards.

### 5.4 Loops
- **Session loop:** Battle → crowns/result → **chest reveal** → upgrade a card → battle.
- **Meta loop:** climb arenas → unlock/upgrade cards → refine deck → clan & boss → seasons.

---

## 6. Clans & co-op
- **Anyone can create or join** a clan; **max 20 members**; **names in any language**
  (Unicode) — deliberately contrasted with English-only player nicknames (§7).
- **Roles:** Leader (kick, hand-off, disband), Elder (reserved), Member; clan chat;
  leader auto-handoff on leave.
- **Clan Boss Raid (co-op):** clanmates fight a shared boss in real time. **2+ raiders
  doubles** the boss HP **and** damage (×2). Per-player **damage is attributed**;
  rewards scale with difficulty. (Boss base HP 12000, dmg 120, 3-minute raid, up to 20 raiders.)

---

## 7. Identity & accounts
- **Auth:** Telegram `initData` (HMAC-verified with the bot token in production; a
  dev/test mode trusts it unverified for local testing).
- **Nicknames — permanent & English-only:** chosen **once** at registration with an
  explicit "forever" warning; allowed `^[A-Za-z0-9_]{3,16}$`; **no emoji / non-ASCII**;
  immutable at the API/DB layer. (Clan names are the opposite — any language.)
- **Profile:** trophies, W/L, gold, gems, XP/level, deck, card inventory, clan.

---

## 8. UX & screen map
```
Loading → (Consent/Age) → Register (nickname + language, permanent warning)
        → HUB ─┬─ Battle (matchmaking → arena → result → chest)
               ├─ Cards (collection grid → card detail → upgrade)
               ├─ Clan (browse/create → clan detail → Boss raid)
               └─ (Shop / Events / Ladder — roadmap)
```
- **Hub top bar:** avatar + nickname + King level + 🏆 trophies / 🪙 gold / 💎 gems;
  **league band** with progress to next arena; big **Battle** button.
- **Battle HUD:** crown counters + timer (top) → **arena** → **elixir bar (max 10)**
  → **hand + Next** (bottom). Tap-to-select, tap-to-deploy.
- **Collection:** card grid with level + upgrade progress + **rarity-colored borders**;
  detail modal with scaled HP/Damage/DPS + Upgrade.
- **Result:** Victory/Defeat, crown tally, ±trophies, **chest open** reveal.
- **Style:** original "arena game" look — wood + gold panels, chunky 3D buttons,
  green arena. **Localization en/ru.** Haptics + Telegram theme params.

---

## 9. Telegram Mini App integration
- **Single origin:** one HTTPS URL serves client + REST API + WebSocket (`wss://host/ws`).
- **SDK:** `WebApp.ready()/expand()`, theme params, **HapticFeedback**, MainButton/BackButton.
- **Distribution:** bot **Menu Button** opens the app; invite/share results to chats;
  deep links to join a clan or rematch.
- **Payments:** **Telegram Stars** for gems/battle-pass (roadmap).
- **Constraints:** HTTPS required; keep bundle/CPU lean for webview; 60 fps target.

---

## 10. Technical architecture
- **Monorepo (TypeScript):** `shared` (types, constants, card catalog, validation,
  protocol — single source of truth), `server` (Express REST + `ws`, authoritative
  sim, matchmaking, store), `client` (Phaser 3 + Vite).
- **Authoritative & deterministic:** clients send **intents** only; server validates
  elixir/zone/cooldown and broadcasts snapshots. Seeded RNG → reproducible matches
  (enables the no-draw tiebreak and future replays).
- **Persistence:** in-memory store today (zero-dep run) behind a narrow interface;
  production path = **PostgreSQL** (durable: users, clans, inventory) + **Redis**
  (matchmaking queue, live match/raid state, sessions).
- **Hosting:** Docker / `render.yaml`; `npm start` builds client + runs single-origin server.
- **Anti-cheat:** server is the only source of truth; immutable-nickname & clan-cap
  invariants enforced at the store; per-card levels resolved server-side.

---

## 11. Art & audio
- **Direction:** cohesive cartoon-fantasy, vibrant, bold outlines; **original characters**.
- **Pipeline:** drop raw art into `art/incoming/<category>/`; `npm run slice`
  standardizes/crops (and cuts sprite sheets) into `client/public/assets/` + a manifest;
  the game uses real art when present, else placeholder shapes.
- **Asset set:** card portraits (10) ✔, some unit battle sprites ✔, logo ✔; towers,
  boss, empty arena, full unit set, SFX/music = backlog.

---

## 12. Live-ops & retention (roadmap)
- Daily rewards / free chest timer; quests & achievements; **seasons** with ranked
  resets and a **battle pass**; limited-time events & special game modes; clan wars &
  leaderboards; push re-engagement via the bot.

---

## 13. Monetization (fair-by-design)
- **Telegram Stars** → gems → cosmetics, chest speed-ups, battle-pass. Core
  competitiveness obtainable free; avoid hard pay-to-win. Sources/sinks tuned so
  spend buys **time**, not raw power advantage at equal investment.

---

## 14. KPIs
- Acquisition: chat→play conversion, invite K-factor.
- Engagement: D1/D7/D30 retention, DAU/MAU, sessions/day, avg session length,
  **match completion rate**, matchmaking wait.
- Monetization: payer conversion, ARPDAU, Stars revenue.
- Health: server tick stability, disconnect/forfeit rate, match length distribution.

---

## 15. Risks & mitigations
| Risk | Mitigation |
| --- | --- |
| Trademark/IP similarity to genre leader | Original art/names/brand; legal note; distinct identity |
| Webview perf on low-end phones | Lean bundle, snapshot interpolation, asset budget |
| Real-time netcode/cheating | Authoritative server, intents-only, validation |
| Matchmaking liquidity (cold start) | Bot fallback; trophy-banded queue |
| Telegram platform limits/policy | Follow Mini App + Stars guidelines; HTTPS single-origin |

---

## 16. Roadmap (mapped to builds)
- **Done (b1–b10):** authoritative 1v1, no-draw rules, clans + co-op boss, immutable
  nicknames, en/ru localization, hub + leagues + crowns + rarity, card collection +
  levels + upgrades, battle chests, single-origin Telegram hosting.
- **Next:** Phase 3 **onboarding** (consent/age + scripted tutorial); Phase 4 **battle
  polish** (tower level badges, emotes, camera zoom). Then PostgreSQL/Redis, Stars
  payments, seasons/battle-pass, full art & audio, clan wars.

---

## Appendix A — key constants (source of truth: `shared/src/constants.ts`)
- Arena 18×30; river y=15; bridges x=[4.5,13.5]. Tick 20/s; snapshot 10/s.
- Round 240 s; double elixir last 60 s; elixir start 5, regen 1/2.8 s, max 10.
- King 2400 HP; Princess 1400 HP. Crowns max 3.
- Boss: 180 s, base HP 12000, base dmg 120, co-op ×2, up to 20 raiders.
- Trophies ±30; gold +50/+10; card drops 3/1; card max level 6 (+10%/level).

## Appendix B — formulas
- Elixir/sec = `(doubleElixir ? 2 : 1) / 2.8`.
- Card level multiplier = `1.1^(level−1)`.
- Card upgrade: dup cards `[2,4,10,20,50]`, gold `[5,20,50,150,400]`, XP `= newLevel×2`.
- King level: cumulative XP, `10×level` per level.
- Tiebreak: crowns → tower damage → first-tower time → seed parity.
