import { DEFAULT_BATTLE_CONFIG, type PlayerProfile, type Clan, type BattleModeInfo } from '@croyal/shared';

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
  /** Which battle core the server runs (from /api/auth, refined by snapshots). */
  mode: BattleModeInfo;
}

export const state: AppState = {
  token: null,
  profile: null,
  clan: null,
  mode: { economy: DEFAULT_BATTLE_CONFIG.economy, deployment: DEFAULT_BATTLE_CONFIG.deployment },
};
