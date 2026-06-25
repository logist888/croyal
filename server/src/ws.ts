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
        userId = user.id;
        send({ t: 'authOk', userId: user.id, nickname: user.nickname });
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
          gameManager.deploy(userId, msg.cardId, msg.x, msg.y);
          break;
        case 'leaveMatch':
          gameManager.leaveMatch(userId);
          break;
        case 'bossJoin':
          gameManager.bossJoin(userId, msg.clanId, send);
          break;
        case 'bossDeploy':
          gameManager.bossDeploy(userId, msg.cardId, msg.x, msg.y);
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
