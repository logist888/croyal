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
  });
}

main().catch((err) => {
  console.error('[tower-clash] fatal startup error:', err);
  process.exit(1);
});
