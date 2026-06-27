# Drop your raw art here

Put image files into the matching subfolder, commit & push (or just hand them to
Claude). They are then **sliced/standardized** into game-ready sprites under
`client/public/assets/` by the slicer:

```bash
npm run slice
```

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

### `arena/` — battlefield background. Output: 540×900 (cropped to fill, 18:30).
```
background.png
```

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
