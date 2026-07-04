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

# 2) in a SECOND terminal, expose :3001 over HTTPS (no account, no Homebrew needed)
cd ~/croyal
ARCH=$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo amd64)
curl -L -o cloudflared.tgz "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-$ARCH.tgz"
tar -xzf cloudflared.tgz && chmod +x cloudflared
xattr -d com.apple.quarantine ./cloudflared 2>/dev/null || true   # skip macOS Gatekeeper
# --protocol http2 avoids QUIC/UDP which many networks block
# ("failed to dial to edge with quic: timeout")
./cloudflared tunnel --protocol http2 --url http://localhost:3001
```
Cloudflared prints a URL like `https://something.trycloudflare.com`. That's your
public Mini App URL. (No-install fallback for a quick *browser* test:
`npx localtunnel --port 3001` — but cloudflared is better for Telegram.)

> The tunnel URL changes each run, and the server's data is in memory (resets on
> restart) — fine for testing.

## Path B — Deploy to Render (permanent URL)  ← RECOMMENDED (single origin)

The server serves the built client **and** the API **and** the WebSocket from
one URL (`server/src/http.ts` → `express.static(client/dist)`), so you don't
need GitHub Pages at all — one deploy updates everything, and there's no Pages
build queue to wait on.

1. Push the repo to GitHub (already there).
2. Go to **render.com → New → Web Service → connect this repo**. It reads
   `render.yaml` (build: `npm install && npm run build --workspace client`,
   start: `npm run start --workspace server`).
3. Deploy → you get `https://tower-clash-xxxx.onrender.com`. **That single URL is
   your Mini App URL** — set it in @BotFather → Bot Settings → Menu Button (and/or
   the Mini App URL). Leave `VITE_API_BASE` empty so the client talks to its own
   origin (the default).
4. **For a real launch**, in Render → Environment set:
   - `BOT_TOKEN` = your @BotFather token (turns on verified Telegram auth; remove
     `ALLOW_DEV_AUTH`).
   - `DATABASE_URL` = a free Postgres (Neon/Supabase) so progress survives restarts.

### Keeping it warm (free tier sleeps after ~15 min idle)
A cold wake costs the first player a 30–60s stall. Two options:
- **External pinger** (recommended): point UptimeRobot / cron-job.org at
  `https://<your-app>.onrender.com/api/health` every 10 min.
- **Built-in self-ping**: set `KEEPALIVE_URL` = your public health URL
  (`.../api/health`); the server pings it every `KEEPALIVE_MINUTES` (default 10).
- Or upgrade to a paid Render instance (no sleep).

A `Dockerfile` is also included if you prefer a Docker host (Railway, Fly.io, a VPS…).

## Path C — GitHub Pages (client) + Render (server)  ← alternative (two origins)

> Prefer **Path B** (single origin) for a launch — it's one deploy with no Pages
> queue. Path C splits hosting only if you specifically want the client on Pages.

GitHub Pages can host **only static files**, so it serves the **client**; the
**server** (API + WebSocket) still needs a Node host. Split:

**C1. Backend on Render** (as in Path B) → note its URL, e.g.
`https://tower-clash-xxxx.onrender.com`. (CORS is open, so the Pages origin can call it.)

**C2. Tell the client where the backend is**
- GitHub repo → **Settings → Secrets and variables → Actions → Variables → New
  repository variable**: `VITE_API_BASE` = your Render URL.

**C3. Enable Pages**
- **Settings → Pages → Source = GitHub Actions.**

**C4. Build & deploy** (workflow `.github/workflows/pages.yml`)
- It runs on push (or **Actions tab → Deploy client to GitHub Pages → Run workflow**).
  It builds with `VITE_BASE=/croyal/` and your `VITE_API_BASE`, then publishes.
- Result URL: **`https://logist888.github.io/croyal/`** — that's your Mini App URL.

> Set `VITE_API_BASE` *before* the build (else the client has no backend). If the
> first auto-run happened without it, just re-run the workflow after adding it.
> Render free tier sleeps when idle; the first battle after idle waits ~30 s while
> it wakes.

Then use that Pages URL in BotFather (next step).

## Persistent progress (Postgres) — recommended
Without a database the server keeps everything **in memory** → progress resets on
restart/sleep. Add a free Postgres and it survives (the server write-throughs to it
and reloads on boot). This is **independent of the host** and of cold starts.
1. **neon.tech** (or supabase.com) → sign up free → create a project/database →
   copy the **connection string** (`postgres://…?sslmode=require`).
2. Set it as **`DATABASE_URL`** on your server host:
   - Render: service → **Environment → Add `DATABASE_URL`** = the string.
   - Fly: `fly secrets set DATABASE_URL="postgres://…"`.
3. Redeploy/restart. The log should print `[store] Postgres connected …`. Done —
   accounts, cards, clans now persist. (Leave `DATABASE_URL` unset for a throwaway
   in-memory run.)

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
