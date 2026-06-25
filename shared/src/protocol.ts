/**
 * WebSocket message protocol (discriminated unions). Battle and boss raids run
 * over WebSocket; account/clan management uses REST (see server/src/http.ts).
 */
import type { BattleSnapshot, BossSnapshot, MatchResult, BossResult } from './types';

// ---- Client -> Server ----
export type ClientMessage =
  | { t: 'auth'; token: string } // session token from REST /api/auth
  | { t: 'queue' } // join 1v1 matchmaking
  | { t: 'cancelQueue' }
  | { t: 'deploy'; cardId: string; x: number; y: number } // play a card in battle
  | { t: 'leaveMatch' }
  | { t: 'bossJoin'; clanId: string }
  | { t: 'bossDeploy'; cardId: string; x: number; y: number }
  | { t: 'bossLeave' }
  | { t: 'ping' };

// ---- Server -> Client ----
export type ServerMessage =
  | { t: 'authOk'; userId: string; nickname: string }
  | { t: 'authError'; error: string }
  | { t: 'queued' }
  | { t: 'matchFound'; matchId: string; opponent: string }
  | { t: 'battle'; snapshot: BattleSnapshot }
  | { t: 'matchEnd'; result: MatchResult }
  | { t: 'boss'; snapshot: BossSnapshot }
  | { t: 'bossEnd'; result: BossResult }
  | { t: 'error'; error: string }
  | { t: 'pong' };

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeClient(raw: string): ClientMessage | null {
  try {
    return JSON.parse(raw) as ClientMessage;
  } catch {
    return null;
  }
}

export function decodeServer(raw: string): ServerMessage | null {
  try {
    return JSON.parse(raw) as ServerMessage;
  } catch {
    return null;
  }
}
