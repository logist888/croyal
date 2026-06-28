# Reference Notes (original-game study)

Working notes that translate the reference game's **mechanics, structure and UX
flows** into changes for Tower Clash. We replicate *how it works and is laid out* —
**all art, names, logo and branding stay our own original work** (we never ship the
reference screenshots or copy its artwork/trademarks/character names).

> Source: 20 gameplay screenshots in `art/incoming/ui/` (analyzed for functional
> facts only). Numbers below are the reference's values; we re-tune our own.

---

## 1. Onboarding / cold start (screen flow)
`Load(%) → Age gate (slider, "does not affect gameplay") → Privacy/consent
(Accept all / Decline all) → auto-login toast ("signed in as <name>") →
scripted tutorial battle vs an AI coach → result → chest reward → hub.`
- New players are dropped into a **tutorial battle**, not the hub.
- **Adopt:** optional consent + age screens; a guided first battle (we have a bot).
- **Keep:** our immutable English-nickname registration (explicit earlier requirement).

## 2. Battle board & scoring (CROWNS)
- Vertical board, player bottom / enemy top, **river + 2 bridges**, left & right lanes.
- 3 towers/side: 1 King + 2 Princess/Crown. Tower HP seen: tutorial princess **280**,
  standard **1400**; towers carry a **level badge**.
- **Score = crowns**: destroy a tower → a crown, **max 3/side**. Crowns shown live
  on the battlefield and tallied on the result screen (your crowns vs opponent's).
- Camera zooms (close while placing, wide late-game).

## 3. Battle HUD
- 4-card **hand** row, each with a pink **elixir-cost** badge; a **"Next:"** card
  preview (rotating deck queue); **elixir bar** segmented, current value + **"Max 10"**.
- Deploy = tap a card → tap a valid tile on your half. Crown counters at top, timer.

## 4. Hub layout
- **Top bar = 3 resources:** account/King **level** (XP bar), **gold**, **gems** (premium).
- **Bottom nav (5):** Shop/Chests · Collection (new-item badge) · **Battle** (center) ·
  Clan · Ladder/Ranked.
- Tabs in collection: **Decks** / **Collection**; a card-type filter row.

## 5. Deck & cards
- **Deck = 8 cards** (2×4). Card shows elixir cost, **level**, **upgrade progress bar**,
  optional "New!". Deck shows **average elixir** (e.g. 3.6).
- Card metadata: **Rarity** (Common/Rare/Epic/Legendary, color-coded) + **Type** (Warrior,
  Ranged, Spell, Building…). Rarity affects starting level.
- **Card detail modal:** rarity, type, an embedded animated arena preview, Upgrade
  (gold) + Select/Use buttons.

## 6. Upgrades & progression
- Cards level by collecting **duplicate cards** (fill bar e.g. 2/2 → next tier needs more);
  upgrading **costs gold** and also grants **account XP** (feeds King level).
- Per-level stat scaling on **Damage, DPS, Health** (flat delta per level).
- **King/account level** with XP bar in the hub.
- **Arenas/leagues** gate card unlocks ("Unlocks at: Arena N"); collection tracked as
  "Found X / total".

## 7. Chests & economy
- **Chests** are the main reward for winning. Open with a **per-card reveal** (countdown
  badge), then a **"Received:"** summary (gold + cards). Currency: **gold** + **gems**.

## 8. Clans
- Social layer; opponent shows clan name; new player is "Not in a clan".

---

## Implemented in build-7
- **Crowns** scoring surfaced in the battle HUD (`👑 x — y 👑`) and on the result
  screen (crown icons); win wording is "Crowns".
- **Hub** main menu: top bar (avatar + nickname + **level** + 🏆/🪙/💎 counters),
  **league band** with progress to the next arena, prominent **Battle**, Clan, and a
  deck panel showing **average elixir** and **rarity-colored** card borders.
- **Leagues/arenas** by trophies (`shared/constants.ts`, original names), `accountLevel`.
- **Card rarity + role/type** added to the catalog (`shared/cards.ts`) and shown.

## Planned next phases (need go-ahead — larger backend+frontend work)
1. **Card collection + levels + upgrades** (per-user inventory, gold cost, stat scaling,
   account XP) + a **card detail modal**.
2. **Chests & reward reveal** after wins (gold + card drops).
3. **Onboarding** (consent/age screens) + a scripted tutorial battle.
4. **Battle HUD polish**: tower level badges, emotes, "Max 10" label, camera zoom.

## Mapping → codebase
- Leagues/level/rarity/avg-elixir → `shared/`. Hub/crowns/deck → `client/ui.ts`,
  `battle.ts`, `style.css`. Collection/upgrades/chests → `server/store.ts` + new client
  screens (next phase).
