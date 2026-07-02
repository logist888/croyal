/**
 * Network layer: REST API client + WebSocket game socket.
 */
import {
  encode, decodeServer, type ClientMessage, type ServerMessage,
  type PlayerProfile, type Clan, type BattleModeInfo,
} from '@croyal/shared';
import { API_BASE, WS_BASE, state } from './state';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers as Record<string, string>) };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface AuthResponse {
  registered: boolean;
  token?: string;
  profile?: PlayerProfile;
  telegramId?: number;
  suggestedNickname?: string;
  mode?: BattleModeInfo;
}

export const api = {
  auth: (body: { initData?: string; devUser?: { id: number; username?: string } }) =>
    req<AuthResponse>('/api/auth', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: { initData?: string; devUser?: { id: number }; nickname: string; language: string }) =>
    req<{ token: string; profile: PlayerProfile; mode?: BattleModeInfo }>('/api/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => req<{ profile: PlayerProfile; mode?: BattleModeInfo }>('/api/me'),
  upgradeCard: (id: string) => req<{ profile: PlayerProfile }>(`/api/cards/${id}/upgrade`, { method: 'POST' }),
  updateTrio: (trio: string[]) =>
    req<{ profile: PlayerProfile }>('/api/trio', { method: 'POST', body: JSON.stringify({ trio }) }),
  openStarterBox: () =>
    req<{ cardId: string; opened: number; total: number; profile: PlayerProfile }>(
      '/api/starter/open', { method: 'POST' }),
  listClans: () => req<{ clans: { id: string; name: string; memberCount: number }[] }>('/api/clans'),
  getClan: (id: string) => req<{ clan: Clan }>(`/api/clans/${id}`),
  createClan: (name: string) => req<{ clan: Clan }>('/api/clans', { method: 'POST', body: JSON.stringify({ name }) }),
  joinClan: (id: string) => req<{ clan: Clan }>(`/api/clans/${id}/join`, { method: 'POST' }),
  leaveClan: () => req<{ ok: boolean }>('/api/clans/leave', { method: 'POST' }),
  kick: (id: string, targetUserId: string) =>
    req<{ clan: Clan }>(`/api/clans/${id}/kick`, { method: 'POST', body: JSON.stringify({ targetUserId }) }),
};

type Handler = (msg: ServerMessage) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private authed = false;
  private queueOnOpen: ClientMessage[] = [];

  connect(): Promise<void> {
    if (this.ws && this.authed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_BASE);
      this.ws = ws;
      ws.onopen = () => {
        if (state.token) ws.send(encode({ t: 'auth', token: state.token }));
      };
      ws.onmessage = (ev) => {
        const msg = decodeServer(String(ev.data));
        if (!msg) return;
        if (msg.t === 'authOk') {
          this.authed = true;
          for (const q of this.queueOnOpen) ws.send(encode(q));
          this.queueOnOpen = [];
          resolve();
        } else if (msg.t === 'authError') {
          reject(new Error(msg.error));
        }
        for (const h of this.handlers) h(msg);
      };
      ws.onerror = () => reject(new Error('socket error'));
      ws.onclose = () => { this.authed = false; };
    });
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.authed && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encode(msg));
    } else {
      this.queueOnOpen.push(msg);
    }
  }
}

export const socket = new GameSocket();
