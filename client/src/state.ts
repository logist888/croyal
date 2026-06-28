import type { PlayerProfile, Clan } from '@croyal/shared';

// When VITE_API_BASE is empty (production single-origin build) the API + WebSocket
// are served from the SAME origin that served the page (works behind a tunnel /
// behind a Telegram Mini App URL). For local dev, client/.env.development points
// this at the standalone server on :3001.
const base = import.meta.env.VITE_API_BASE ?? '';

export const API_BASE = base;
export const WS_BASE = base
  ? base.replace(/^http/, 'ws') + '/ws'
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export interface AppState {
  token: string | null;
  profile: PlayerProfile | null;
  clan: Clan | null;
}

export const state: AppState = {
  token: null,
  profile: null,
  clan: null,
};
