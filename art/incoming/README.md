# Drop your raw art here

Put image files into the matching subfolder, commit & push (or just hand them to
Claude). They are then **sliced/standardized** into game-ready sprites under
`client/public/assets/` by the slicer:

```bash
npm run slice
```

## Or generate everything automatically

The whole roster (~225 images from `docs/ART_PROMPT.ru.md`) can be generated
straight into these folders via the OpenAI Images API:

```bash
npm run art:plan                                  # dry-run: job list + cost, no key needed
OPENAI_API_KEY=sk-... npm run art                 # generate everything missing (resumable)
OPENAI_API_KEY=sk-... npm run art -- --only towers,boss,arena_training   # one wave
node scripts/gen-art.mjs --only footman --force   # regenerate a single outlier
node scripts/gen-art.mjs --sheet                  # art/review.html contact sheet
```

Existing files are never re-generated unless `--force` — hand-made art is safe.

The slicer resizes/crops each image to the right size, can cut sprite sheets into
frames, copies the logo, and rebuilds `client/public/assets/manifest.json` (which
the game reads). Anything you don't provide keeps the current built-in look, so you
can add art piece by piece.

Accepted formats: **PNG (preferred, with transparency), JPG, GIF, BMP**.

## Naming rules

The **file name (without extension)** becomes the asset id. Use the exact ids below.

### `cards/` — card portraits (shown in hand & deck)
One file per card, named by card id. Output: 256×320 (cropped to fill).
```
footman.png  archers.png  colossus.png  ratpack.png  sharpshooter.png
blademaster.png  bombthrower.png  bastion.png  meteor.png  volley.png
```

### `units/` — in-battle sprites (top-down/3-quarter view)
Same ids as cards (the troop/building on the field). Output: 128×128 (fit, padded).
Spells (`meteor`, `volley`) don't need a unit sprite.

### `towers/` — exactly two files. Output: 192×192 (fit).
```
king.png       <- King tower
princess.png   <- Princess tower (used for both left & right)
```

### `boss/` — the clan-raid boss. Output: 320×320 (fit).
```
boss.png
```

### `arena/` — battlefield backgrounds. Output: 540×900 (cropped to fill, 18:30).
```
background.png                    <- generic fallback
arena_training.png … arena_legend.png   <- per-league arenas (see docs/ART_PROMPT.ru.md §6)
hub_bg.png  splash.png            <- menu background / loading splash
```

### `fx/` — battle effect sprites (optional). Output: 128×128 (fit, transparent).
e.g. `fireball.png`, `explosion.png`, `heal_sparkle.png` — full list in ART_PROMPT §3.7.

### `ui/` — interface icons (optional). Output: 64×64 (fit). Keep the file name.
e.g. `elixir.png`, `trophy.png`, `gold.png`, `gem.png`, `crown.png`.

### `logo/` — app/bot logo. Copied to `client/public/logo.png` (max 1280px wide).
```
logo.png
```

## Sprite sheets (optional)

If you have an animation strip, add `@COLSxROWS` before the extension and the
slicer cuts it into frames; frame 0 becomes the static sprite:
```
footman@4x2.png   ->  units/footman_0.png … footman_7.png  (+ footman.png = frame 0)
```

> Tip: square-ish images work best for units/towers/boss; the card portraits are
> cropped to a tall card shape.
