import type { PlayerProfile, Clan } from '@croyal/shared';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001';
export const WS_BASE = API_BASE.replace(/^http/, 'ws') + '/ws';

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
