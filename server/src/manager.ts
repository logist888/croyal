/**
 * Orchestrates matchmaking, live matches and clan boss rooms. One instance per
 * server process. The WebSocket layer (ws.ts) translates socket events into
 * these method calls.
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_DECK, type ServerMessage } from '@croyal/shared';
import { Match, type MatchSeat, type Sender } from './game/match';
import { BossRoom } from './game/boss';
import { store } from './store';

const BOT_FALLBACK_MS = 6000;

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
        { userId, deck: profile.deck, send },
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
      { userId, deck: profile.deck, send: human.send },
      { userId: null, deck: [...DEFAULT_DECK], send: noop },
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
    if (seatA.userId) this.userMatch.delete(seatA.userId);
    if (seatB.userId) this.userMatch.delete(seatB.userId);
  }

  deploy(userId: string, cardId: string, x: number, y: number): void {
    const matchId = this.userMatch.get(userId);
    if (!matchId) return;
    this.matches.get(matchId)?.handleDeploy(userId, cardId, x, y);
  }

  leaveMatch(userId: string): void {
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
      room = new BossRoom(clanId, (r) => this.bossRooms.delete(r.clanId));
      this.bossRooms.set(clanId, room);
    }
    const res = room.join(userId, profile.nickname, profile.deck, send);
    if (!res.ok) {
      send({ t: 'error', error: res.error ?? 'cannot join raid' });
      return;
    }
    this.userBoss.set(userId, clanId);
  }

  bossDeploy(userId: string, cardId: string, x: number, y: number): void {
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
  disconnect(userId: string): void {
    this.cancelQueue(userId);
    this.leaveMatch(userId);
    this.bossLeave(userId);
  }
}

function deckOf(userId: string): string[] {
  return store.getUser(userId)?.deck ?? [...DEFAULT_DECK];
}

const noop: Sender = (_msg: ServerMessage) => {};

export const gameManager = new GameManager();
