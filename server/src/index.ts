/**
 * Server entrypoint: HTTP REST API + WebSocket game server on one port.
 */
import { createServer } from 'node:http';
import { createApp } from './http';
import { attachWebSocket } from './ws';
import { isDevAuthAllowed } from './auth';
import { store } from './store';

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  await store.init(); // connect + hydrate from Postgres if DATABASE_URL is set
  const app = createApp();
  const server = createServer(app);
  attachWebSocket(server);
  server.listen(PORT, () => {
    console.log(`[tower-clash] server listening on http://localhost:${PORT}`);
    console.log(`[tower-clash] websocket on ws://localhost:${PORT}/ws`);
    if (isDevAuthAllowed) {
      console.log('[tower-clash] DEV AUTH ENABLED (no BOT_TOKEN) — accepting dev users for browser testing.');
    }
    startKeepAlive();
  });
}

/**
 * Optional keep-warm ping for free hosting tiers (e.g. Render free) that sleep
 * after ~15 min of no inbound traffic — a cold wake costs the player a 30–60s
 * stall. Opt in with KEEPALIVE_URL=<public health url> (KEEPALIVE_MINUTES tunes
 * the interval, default 10). Best-effort; failures are ignored. For a
 * pay-as-you-go alternative, point an external uptime pinger at /api/health.
 */
function startKeepAlive(): void {
  const url = process.env.KEEPALIVE_URL;
  if (!url) return;
  const minutes = Number(process.env.KEEPALIVE_MINUTES ?? 10);
  const everyMs = Math.max(1, minutes) * 60_000;
  setInterval(() => { void fetch(url).catch(() => {}); }, everyMs).unref();
  console.log(`[tower-clash] keep-alive: pinging ${url} every ${minutes}min`);
}

main().catch((err) => {
  console.error('[tower-clash] fatal startup error:', err);
  process.exit(1);
});
