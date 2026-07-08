/**
 * WebSocket layer for real-time battles and clan boss raids.
 * A client must send { t: 'auth', token } (token from POST /api/auth or /register)
 * before any other message is accepted.
 */
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { decodeClient, encode, type ServerMessage } from '@croyal/shared';
import { store } from './store';
import { gameManager } from './manager';

/** Coordinates come off the wire as `unknown` in practice — only finite numbers pass. */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null;

    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
    };

    ws.on('message', (raw) => {
      const msg = decodeClient(raw.toString());
      if (!msg) return;

      if (msg.t === 'auth') {
        const user = store.getSessionUser(msg.token);
        if (!user) {
          send({ t: 'authError', error: 'invalid session' });
          return;
        }
        // One identity per socket: silently swapping users would leak the
        // previous identity's queue/match state past disconnect cleanup.
        if (userId && userId !== user.id) {
          send({ t: 'authError', error: 'socket already authenticated' });
          return;
        }
        userId = user.id;
        send({ t: 'authOk', userId: user.id, nickname: user.nickname });
        // Reconnect: if this player has a match still running (socket dropped
        // within the grace window), re-bind it and resync so the battle resumes.
        gameManager.attach(user.id, send);
        return;
      }

      if (!userId) {
        send({ t: 'error', error: 'not authenticated' });
        return;
      }

      switch (msg.t) {
        case 'queue':
          gameManager.queue(userId, send);
          break;
        case 'cancelQueue':
          gameManager.cancelQueue(userId);
          break;
        case 'deploy':
          gameManager.deploy(userId, msg.cardId, num(msg.x), num(msg.y));
          break;
        case 'leaveMatch':
          gameManager.leaveMatch(userId);
          break;
        case 'createFriendly':
          gameManager.createFriendly(userId, send);
          break;
        case 'joinFriendly':
          gameManager.joinFriendly(userId, msg.code, send);
          break;
        case 'cancelFriendly':
          gameManager.cancelFriendly(userId);
          break;
        case 'watchLastReplay':
          gameManager.watchLastReplay(userId, send);
          break;
        case 'leaveReplay':
          gameManager.stopReplay(userId);
          break;
        case 'bossJoin':
          gameManager.bossJoin(userId, msg.clanId, send);
          break;
        case 'bossDeploy':
          gameManager.bossDeploy(userId, msg.cardId, num(msg.x), num(msg.y));
          break;
        case 'bossLeave':
          gameManager.bossLeave(userId);
          break;
        case 'ping':
          send({ t: 'pong' });
          break;
      }
    });

    ws.on('close', () => {
      if (userId) gameManager.disconnect(userId);
    });
  });
}
