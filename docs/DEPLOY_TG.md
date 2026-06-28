# Testing as a real Telegram Mini App

A Telegram Mini App must load from a **public HTTPS URL**. Our server now serves
the built client + the API + the WebSocket from **one origin**, so a single URL is
all you need. Pick the fastest path:

- **Path A — Quick test from your laptop + a tunnel** (5 min, temporary URL).
- **Path B — Deploy to Render** (permanent URL, free).

Then point your bot at that URL in **@BotFather**.

> Auth: with `ALLOW_DEV_AUTH=1` the app works inside Telegram without putting your
> bot token on the server (it trusts Telegram's `initData` unverified — fine for
> testing). For a real launch, set `BOT_TOKEN` and drop `ALLOW_DEV_AUTH` so the
> signature is verified.

---

## 1. Create the bot (once)
1. Open **@BotFather** in Telegram → `/newbot` → follow prompts → copy the **token**.
2. Keep BotFather open; you'll set the Mini App URL after you have a public URL.

## Path A — Laptop + Cloudflare quick tunnel
```bash
cd ~/croyal
git pull origin claude/clash-royale-telegram-app-cln5rb
npm install

# 1) build the client and start the single-origin server (serves everything on :3001)
ALLOW_DEV_AUTH=1 npm start          # = build client + run server

# 2) in a SECOND terminal, expose :3001 over HTTPS (no account needed)
brew install cloudflared            # macOS (once)
cloudflared tunnel --url http://localhost:3001
```
Cloudflared prints a URL like `https://something.trycloudflare.com`. That's your
public Mini App URL. (Alternatives: `npx localtunnel --port 3001`, or `ngrok http 3001`.)

> The tunnel URL changes each run, and the server's data is in memory (resets on
> restart) — fine for testing.

## Path B — Deploy to Render (permanent URL)
1. Push the repo to GitHub (already there).
2. Go to **render.com → New → Web Service → connect this repo**. It reads
   `render.yaml` (build: `npm install && npm run build --workspace client`,
   start: `npm run start --workspace server`).
3. Deploy → you get `https://tower-clash-xxxx.onrender.com`. That's your URL.
   (Free tier sleeps when idle; first open after idle is slow.)

A `Dockerfile` is also included if you prefer a Docker host (Railway, Fly.io, a VPS…).

## 2. Point the bot at your URL (@BotFather)
Either set it as the **Menu Button** (simplest) or a named Mini App:
- `/mybots` → pick your bot → **Bot Settings → Menu Button → Edit menu button URL**
  → paste your public URL (the tunnel or Render URL).
- (Optional) `/newapp` → pick your bot → set title/description/photo and the same URL.

## 3. Play
Open your bot in Telegram → tap the **menu button** (bottom-left) → the Mini App
opens. Register a nickname, hit **Battle**, place cards on your (bottom) half.

## Troubleshooting
- **Blank screen / "Cannot reach server":** make sure you opened the *tunnel/Render*
  URL (HTTPS), not `localhost`. Hard-refresh.
- **Auth error inside Telegram:** ensure the server runs with `ALLOW_DEV_AUTH=1`
  (or set the correct `BOT_TOKEN`).
- **WebSocket won't connect:** the tunnel must forward WebSockets (cloudflared,
  ngrok and localtunnel all do). The client auto-uses `wss://<same-host>/ws`.
- **Test on desktop first:** open the tunnel/Render URL in a normal browser — it
  runs there too (dev auth), which isolates app bugs from Telegram setup.
