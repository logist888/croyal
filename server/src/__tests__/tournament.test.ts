import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameManager } from '../manager';
import { store } from '../store';
import {
  fillBots, seedRound, winnersOf, allResolved, totalRounds, prizeGems, TOURNAMENT_SIZE,
  type TSeat,
} from '../game/tournament';
import type { ServerMessage, TournamentView } from '@croyal/shared';

describe('tournament bracket (pure)', () => {
  const human: TSeat = { userId: 'u1', nickname: 'You' };

  it('fills a lone human up to the bracket size with bots', () => {
    const seats = fillBots([human]);
    expect(seats.length).toBe(TOURNAMENT_SIZE);
    expect(seats[0]).toEqual(human);
    expect(seats.slice(1).every((s) => s.userId === null)).toBe(true);
  });

  it('seeds adjacent pairings and reads winners in bracket order', () => {
    const seats = fillBots([human]);
    const r0 = seedRound(seats);
    expect(r0.length).toBe(2);
    expect(r0[0].a).toEqual(seats[0]);
    expect(r0[0].b).toEqual(seats[1]);
    expect(allResolved(r0)).toBe(false);
    r0[0].winner = 0; r0[1].winner = 1;
    const winners = winnersOf(r0);
    expect(winners).toEqual([seats[0], seats[3]]);
    const final = seedRound(winners);
    expect(final.length).toBe(1);
    expect(allResolved(r0)).toBe(true);
  });

  it('rounds and prizes', () => {
    expect(totalRounds(4)).toBe(2);
    expect(totalRounds(8)).toBe(3);
    expect(prizeGems('champion')).toBe(30);
    expect(prizeGems('finalist')).toBe(10);
    expect(prizeGems('semifinal')).toBe(0);
  });
});

describe('tournament orchestration (manager)', () => {
  let mgr: GameManager;
  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new GameManager();
  });
  afterEach(() => vi.useRealTimers());

  function freshUser(tg: number, nick: string): string {
    return store.createUser({ telegramId: tg, nickname: nick, language: 'en' }).id;
  }
  function lastView(msgs: ServerMessage[]): TournamentView | undefined {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.t === 'tournamentState') return m.view;
    }
    return undefined;
  }

  it('creating a tournament seats you + 3 bots and auto-resolves the other semifinal', () => {
    const uid = freshUser(9101, 'Tny' + Math.floor(Math.random() * 1e6));
    const msgs: ServerMessage[] = [];
    mgr.tournamentCreate(uid, (m) => msgs.push(m));
    const view = lastView(msgs)!;
    expect(view.size).toBe(4);
    expect(view.status).toBe('yourTurn');
    expect(view.rounds[0].length).toBe(2);
    const yours = view.rounds[0].find((m) => m.youIn)!;
    const other = view.rounds[0].find((m) => !m.youIn)!;
    expect(yours.winner).toBeNull(); // you still have to play yours
    expect(other.winner).not.toBeNull(); // bot-vs-bot was decided
  });

  it('forfeiting your semifinal knocks you out with no prize', () => {
    const uid = freshUser(9102, 'Tko' + Math.floor(Math.random() * 1e6));
    const gemsBefore = store.getUser(uid)!.gems;
    const msgs: ServerMessage[] = [];
    const send = (m: ServerMessage) => msgs.push(m);
    mgr.tournamentCreate(uid, send);
    mgr.tournamentPlay(uid, send); // spawns your live match vs a bot
    expect(msgs.some((m) => m.t === 'matchFound')).toBe(true);
    mgr.leaveMatch(uid); // forfeit -> you lose the semifinal
    const view = lastView(msgs)!;
    expect(view.status).toBe('eliminated');
    expect(view.prizeGems).toBe(0);
    expect(store.getUser(uid)!.gems).toBe(gemsBefore); // no gems for a semifinal exit
  });

  it('rejects creating a tournament while you are in a match', () => {
    const uid = freshUser(9103, 'Tbz' + Math.floor(Math.random() * 1e6));
    const msgs: ServerMessage[] = [];
    mgr.queue(uid, (m) => msgs.push(m));
    vi.advanceTimersByTime(6000); // bot match starts
    msgs.length = 0;
    mgr.tournamentCreate(uid, (m) => msgs.push(m));
    expect(msgs.some((m) => m.t === 'error')).toBe(true);
    expect(msgs.some((m) => m.t === 'tournamentState')).toBe(false);
    mgr.leaveMatch(uid);
  });

  it('sync with no active tournament is a no-op', () => {
    const uid = freshUser(9104, 'Tsy' + Math.floor(Math.random() * 1e6));
    const msgs: ServerMessage[] = [];
    mgr.tournamentSync(uid, (m) => msgs.push(m));
    expect(msgs.length).toBe(0);
  });
});
