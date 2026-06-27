# Static assets (`client/public/`)

Files here are served at the site root (e.g. `public/logo.png` → `/logo.png`).

## Custom logo

The UI shows `/logo.png` if present, otherwise it falls back to the bundled
placeholder crest `logo.svg`.

To use your own logo:
1. Save your image as **`client/public/logo.png`** (PNG with transparent
   background, ideally square-ish, ~512×512 or wider banner up to ~1280px).
2. Reload the app — it appears on the loading, registration and menu screens
   automatically. No code change needed.

## Telegram bot avatar

The bot's profile picture is set in **@BotFather**, not in this repo:
`/setuserpic` → choose your bot → upload the image.
