/**
 * Orchestrates matchmaking, live matches and clan boss rooms. One instance per
 * server process. The WebSocket layer (ws.ts) translates socket events into
 * these method calls.
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_DECK, DEFAULT_TRIO, TRIO_SIZE, type PlayerProfile, type ServerMessage } from '@croyal/shared';
import { Match, type MatchSeat, type Sender } from './game/match';
import { BossRoom } from './game/boss';
import { ACTIVE_BATTLE_CONFIG } from './game/active-config';
import { store } from './store';

const BOT_FALLBACK_MS = 6000;
/** How long a match survives a socket drop before the absent player forfeits. */
const RECONNECT_GRACE_MS = 30000;

interface Waiting {
  userId: string;
  send: Sender;
  timer: ReturnType<typeof setTimeout>;
}

export class GameManager {
  private matches = new Map<string, Match>();
  private userMatch = new Map<string, string>(); // userId -> matchId
  private bossRooms = new Map<string, BossRoom>(); // clanId -> room
  private userBoss = new Map<string, string>(); // userId -> clanId
  private waiting: Waiting | null = null;
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>(); // userId -> forfeit timer

  // --- 1v1 matchmaking ---
  queue(userId: string, send: Sender): void {
    if (this.userMatch.has(userId)) return;
    const profile = store.getUser(userId);
    if (!profile) return;

    if (this.waiting && this.waiting.userId !== userId) {
      const opponent = this.waiting;
      clearTimeout(opponent.timer);
      this.waiting = null;
      this.createMatch(
        { userId: opponent.userId, deck: deckOf(opponent.userId), send: opponent.send },
        { userId, deck: battleDeckOf(profile), send },
      );
      return;
    }

    if (this.waiting && this.waiting.userId === userId) return; // already waiting
    send({ t: 'queued' });
    const timer = setTimeout(() => this.matchWithBot(userId), BOT_FALLBACK_MS);
    this.waiting = { userId, send, timer };
  }

  cancelQueue(userId: string): void {
    if (this.waiting?.userId === userId) {
      clearTimeout(this.waiting.timer);
      this.waiting = null;
    }
  }

  private matchWithBot(userId: string): void {
    if (this.waiting?.userId !== userId) return;
    const human = this.waiting;
    this.waiting = null;
    const profile = store.getUser(userId);
    if (!profile) return;
    this.createMatch(
      { userId, deck: battleDeckOf(profile), send: human.send },
      { userId: null, deck: botDeck(), send: noop },
    );
  }

  private createMatch(seatA: MatchSeat, seatB: MatchSeat): void {
    const matchId = randomUUID();
    const nameOf = (s: MatchSeat) => (s.userId ? store.getUser(s.userId)?.nickname ?? 'Player' : 'Bot');
    if (seatA.userId) {
      this.userMatch.set(seatA.userId, matchId);
      seatA.send({ t: 'matchFound', matchId, opponent: nameOf(seatB) });
    }
    if (seatB.userId) {
      this.userMatch.set(seatB.userId, matchId);
      seatB.send({ t: 'matchFound', matchId, opponent: nameOf(seatA) });
    }
    const match = new Match(matchId, seatA, seatB, store, (m) => this.onMatchEnd(m, seatA, seatB));
    this.matches.set(matchId, match);
    match.start();
  }

  private onMatchEnd(match: Match, seatA: MatchSeat, seatB: MatchSeat): void {
    this.matches.delete(match.id);
    if (seatA.userId) { this.userMatch.delete(seatA.userId); this.clearGrace(seatA.userId); }
    if (seatB.userId) { this.userMatch.delete(seatB.userId); this.clearGrace(seatB.userId); }
  }

  private clearGrace(userId: string): void {
    const t = this.graceTimers.get(userId);
    if (t) { clearTimeout(t); this.graceTimers.delete(userId); }
  }

  /**
   * Re-bind a reconnecting player to their in-progress match (called on
   * re-auth). Cancels any pending forfeit and resyncs the client. Returns
   * true if the player was resumed into a live match.
   */
  attach(userId: string, send: Sender): boolean {
    const matchId = this.userMatch.get(userId);
    if (!matchId) return false;
    const match = this.matches.get(matchId);
    if (!match || !match.hasUser(userId)) return false;
    this.clearGrace(userId);
    return match.reattach(userId, send);
  }

  deploy(userId: string, cardId: string, x?: number, y?: number): void {
    const matchId = this.userMatch.get(userId);
    if (!matchId) return;
    this.matches.get(matchId)?.handleDeploy(userId, cardId, x, y);
  }

  leaveMatch(userId: string): void {
    this.clearGrace(userId); // an explicit leave supersedes any reconnect window
    const matchId = this.userMatch.get(userId);
    if (!matchId) return;
    this.matches.get(matchId)?.handleLeave(userId);
  }

  // --- Clan boss raid ---
  bossJoin(userId: string, clanId: string, send: Sender): void {
    const profile = store.getUser(userId);
    if (!profile) {
      send({ t: 'error', error: 'not registered' });
      return;
    }
    if (profile.clanId !== clanId) {
      send({ t: 'error', error: 'you are not a member of this clan' });
      return;
    }
    let room = this.bossRooms.get(clanId);
    if (!room) {
      room = new BossRoom(
        clanId,
        (r) => {
          this.bossRooms.delete(r.clanId);
          // clear stale raid memberships so future bossDeploys don't no-op
          for (const [uid, cid] of this.userBoss) {
            if (cid === r.clanId) this.userBoss.delete(uid);
          }
        },
        undefined,
        (result) => {
          // Persist the raid rewards — the bossEnd message alone grants nothing.
          for (const p of result.participants) {
            const u = store.getUser(p.userId);
            if (u) store.updateUser(p.userId, { gold: u.gold + result.rewardGold });
          }
        },
      );
      this.bossRooms.set(clanId, room);
    }
    const res = room.join(userId, profile.nickname, battleDeckOf(profile), send);
    if (!res.ok) {
      send({ t: 'error', error: res.error ?? 'cannot join raid' });
      return;
    }
    this.userBoss.set(userId, clanId);
  }

  bossDeploy(userId: string, cardId: string, x?: number, y?: number): void {
    const clanId = this.userBoss.get(userId);
    if (!clanId) return;
    this.bossRooms.get(clanId)?.deploy(userId, cardId, x, y);
  }

  bossLeave(userId: string): void {
    const clanId = this.userBoss.get(userId);
    if (!clanId) return;
    this.bossRooms.get(clanId)?.leave(userId);
    this.userBoss.delete(userId);
  }

  // --- Connection teardown ---
  /**
   * A socket dropped. Leaving matchmaking or a boss raid is immediate, but an
   * active 1v1 match is held open for RECONNECT_GRACE_MS so a flaky mobile
   * connection can rejoin (see attach) instead of auto-losing. If the window
   * elapses with no reconnect, the absent player forfeits.
   */
  disconnect(userId: string): void {
    this.cancelQueue(userId);
    this.bossLeave(userId);
    const matchId = this.userMatch.get(userId);
    if (matchId && this.matches.get(matchId)?.hasUser(userId)) {
      this.clearGrace(userId);
      const timer = setTimeout(() => {
        this.graceTimers.delete(userId);
        this.leaveMatch(userId); // grace elapsed -> forfeit
      }, RECONNECT_GRACE_MS);
      this.graceTimers.set(userId, timer);
    }
  }
}

/** The hand a profile brings to battle: the trio in the cooldown model, the 8-deck otherwise. */
function battleDeckOf(profile: PlayerProfile): string[] {
  if (ACTIVE_BATTLE_CONFIG.economy === 'cooldown') {
    return profile.trio?.length === TRIO_SIZE ? [...profile.trio] : [...DEFAULT_TRIO];
  }
  return [...profile.deck];
}

function botDeck(): string[] {
  return ACTIVE_BATTLE_CONFIG.economy === 'cooldown' ? [...DEFAULT_TRIO] : [...DEFAULT_DECK];
}

function deckOf(userId: string): string[] {
  const user = store.getUser(userId);
  return user ? battleDeckOf(user) : botDeck();
}

const noop: Sender = (_msg: ServerMessage) => {};

export const gameManager = new GameManager();
