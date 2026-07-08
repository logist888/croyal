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
  // Play a card. Coordinates are required for free-placement troops and for
  // aimed spells; omitted for fixed-lane troops (the server picks the lane spawn).
  | { t: 'deploy'; cardId: string; x?: number; y?: number }
  | { t: 'leaveMatch' }
  // Friendly (unranked) 1v1 by private room code — no trophies/rewards.
  | { t: 'createFriendly' } // host: open a room, receive a code
  | { t: 'joinFriendly'; code: string } // guest: join by code
  | { t: 'cancelFriendly' } // host: close the room while still waiting
  | { t: 'watchLastReplay' } // re-watch your most recent match (deterministic replay)
  | { t: 'leaveReplay' } // stop watching a replay
  | { t: 'bossJoin'; clanId: string }
  | { t: 'bossDeploy'; cardId: string; x?: number; y?: number }
  | { t: 'bossLeave' }
  | { t: 'ping' };

// ---- Server -> Client ----
export type ServerMessage =
  | { t: 'authOk'; userId: string; nickname: string }
  | { t: 'authError'; error: string }
  | { t: 'queued' }
  | { t: 'friendlyCreated'; code: string } // your room code — share it with a friend
  | { t: 'matchFound'; matchId: string; opponent: string; friendly?: boolean }
  | { t: 'battle'; snapshot: BattleSnapshot }
  | { t: 'matchEnd'; result: MatchResult }
  | { t: 'replayStart'; opponent: string } // begin a replay stream (battle snapshots follow)
  | { t: 'replayEnd'; outcome: 'win' | 'loss' | 'draw'; yourScore: number; opponentScore: number }
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
