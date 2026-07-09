/**
 * Network layer: REST API client + WebSocket game socket.
 */
import {
  encode, decodeServer, type ClientMessage, type ServerMessage,
  type PlayerProfile, type Clan, type BattleModeInfo,
  type LeaderboardPlayer, type LeaderboardClan, type WarClanEntry, type WarReward,
} from '@croyal/shared';

export interface ClanWarInfo {
  inClan: boolean;
  remainingMs: number;
  clanScore: number;
  yourContribution: number;
  tier: number;
  reward: WarReward | null;
  leaderboard: WarClanEntry[];
}
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
  unlockChest: (id: string) =>
    req<{ profile: PlayerProfile }>(`/api/chests/${id}/unlock`, { method: 'POST' }),
  openChest: (id: string, withGems = false) =>
    req<{ rewards: { gold: number; cards: Record<string, number> }; profile: PlayerProfile }>(
      `/api/chests/${id}/open`, { method: 'POST', body: JSON.stringify({ withGems }) }),
  claimDaily: () => req<{ profile: PlayerProfile }>('/api/daily/claim', { method: 'POST' }),
  claimQuest: (id: string) =>
    req<{ profile: PlayerProfile }>(`/api/daily/quests/${id}/claim`, { method: 'POST' }),
  claimSeason: () => req<{ profile: PlayerProfile }>('/api/season/claim', { method: 'POST' }),
  leaderboardPlayers: () =>
    req<{ top: LeaderboardPlayer[]; you: LeaderboardPlayer | null }>('/api/leaderboard/players'),
  leaderboardClans: () => req<{ top: LeaderboardClan[] }>('/api/leaderboard/clans'),
  clanWar: () => req<ClanWarInfo>('/api/clan/war'),
  claimWar: () => req<{ profile: PlayerProfile }>('/api/clan/war/claim', { method: 'POST' }),
  buyGold: (packId: string) =>
    req<{ profile: PlayerProfile }>('/api/shop/gold', { method: 'POST', body: JSON.stringify({ packId }) }),
  shopConfig: () => req<{ starsEnabled: boolean }>('/api/shop/config'),
  starsInvoice: (packId: string) =>
    req<{ link: string }>('/api/shop/stars/invoice', { method: 'POST', body: JSON.stringify({ packId }) }),
  listClans: () => req<{ clans: { id: string; name: string; memberCount: number }[] }>('/api/clans'),
  getClan: (id: string) => req<{ clan: Clan }>(`/api/clans/${id}`),
  createClan: (name: string) => req<{ clan: Clan }>('/api/clans', { method: 'POST', body: JSON.stringify({ name }) }),
  joinClan: (id: string) => req<{ clan: Clan }>(`/api/clans/${id}/join`, { method: 'POST' }),
  leaveClan: () => req<{ ok: boolean }>('/api/clans/leave', { method: 'POST' }),
  kick: (id: string, targetUserId: string) =>
    req<{ clan: Clan }>(`/api/clans/${id}/kick`, { method: 'POST', body: JSON.stringify({ targetUserId }) }),
};

type Handler = (msg: ServerMessage) => void;

/** Notified when the live connection drops and when it comes back (reconnect UX). */
export type ConnListener = (state: 'online' | 'reconnecting') => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private connListeners = new Set<ConnListener>();
  private authed = false;
  private queueOnOpen: ClientMessage[] = [];
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): Promise<void> {
    if (this.ws && this.authed) return Promise.resolve();
    this.intentionalClose = false;
    return new Promise((resolve, reject) => {
      this.open(resolve, reject);
    });
  }

  private open(resolve?: () => void, reject?: (e: Error) => void): void {
    const ws = new WebSocket(WS_BASE);
    this.ws = ws;
    ws.onopen = () => {
      if (state.token) ws.send(encode({ t: 'auth', token: state.token }));
    };
    ws.onmessage = (ev) => {
      const msg = decodeServer(String(ev.data));
      if (!msg) return;
      if (msg.t === 'authOk') {
        const wasDown = this.reconnectAttempts > 0;
        this.authed = true;
        this.reconnectAttempts = 0;
        for (const q of this.queueOnOpen) ws.send(encode(q));
        this.queueOnOpen = [];
        if (wasDown) this.emitConn('online'); // server.attach() will resync any live match
        resolve?.();
      } else if (msg.t === 'authError') {
        reject?.(new Error(msg.error));
      }
      for (const h of this.handlers) h(msg);
    };
    ws.onerror = () => { if (this.reconnectAttempts === 0) reject?.(new Error('socket error')); };
    ws.onclose = () => {
      this.authed = false;
      if (this.intentionalClose) return;
      // Unexpected drop — keep the app's lifeline alive with capped backoff.
      // The server holds an in-progress match open for a grace window, so a
      // quick reconnect (auth → server.attach) resumes the battle in place.
      this.emitConn('reconnecting');
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 8000);
      this.reconnectAttempts += 1;
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };
  }

  /** Close for good (e.g. leaving the app) — stops the reconnect loop. */
  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.authed = false;
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  onConn(l: ConnListener): () => void {
    this.connListeners.add(l);
    return () => this.connListeners.delete(l);
  }

  private emitConn(s: 'online' | 'reconnecting'): void {
    for (const l of this.connListeners) l(s);
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
