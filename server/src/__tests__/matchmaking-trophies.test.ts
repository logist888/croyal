import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameManager } from '../manager';
import { store } from '../store';
import type { ServerMessage } from '@croyal/shared';

/**
 * Trophy-aware 1v1 matchmaking.
 *
 * Queueing used to pair whoever was first in a single-slot queue, with zero
 * regard for trophies — a brand-new player could be thrown against a
 * near-maxed one. The fix widens an acceptable trophy gap over time (starting
 * near one league, effectively unbounded within a few seconds) rather than
 * pairing instantly regardless of skill, while still guaranteeing a match
 * eventually via the existing bot-fallback timer.
 */
describe('trophy-range matchmaking (manager)', () => {
  let mgr: GameManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new GameManager();
  });
  afterEach(() => vi.useRealTimers());

  function freshUser(tg: number, nick: string, trophies: number): string {
    const id = store.createUser({ telegramId: tg, nickname: nick, language: 'en' }).id;
    store.updateUser(id, { trophies });
    return id;
  }

  it('does not instantly pair two players far apart in trophies', () => {
    const low = freshUser(8001, 'Low' + Math.floor(Math.random() * 1e6), 100);
    const high = freshUser(8002, 'High' + Math.floor(Math.random() * 1e6), 3000);
    const lowMsgs: ServerMessage[] = [];
    const highMsgs: ServerMessage[] = [];

    mgr.queue(low, (m) => lowMsgs.push(m));
    mgr.queue(high, (m) => highMsgs.push(m));

    // A 2900-trophy gap is far outside the initial ~150 range: both should
    // still be queued, not matched against each other.
    expect(lowMsgs.some((m) => m.t === 'matchFound')).toBe(false);
    expect(highMsgs.some((m) => m.t === 'matchFound')).toBe(false);
    expect(lowMsgs.some((m) => m.t === 'queued')).toBe(true);
    expect(highMsgs.some((m) => m.t === 'queued')).toBe(true);

    mgr.cancelQueue(low);
    mgr.cancelQueue(high);
  });

  it('pairs two players close in trophies immediately', () => {
    const a = freshUser(8003, 'CloseA' + Math.floor(Math.random() * 1e6), 500);
    const b = freshUser(8004, 'CloseB' + Math.floor(Math.random() * 1e6), 540);
    const aMsgs: ServerMessage[] = [];
    const bMsgs: ServerMessage[] = [];

    mgr.queue(a, (m) => aMsgs.push(m));
    mgr.queue(b, (m) => bMsgs.push(m));

    expect(aMsgs.some((m) => m.t === 'matchFound')).toBe(true);
    expect(bMsgs.some((m) => m.t === 'matchFound')).toBe(true);
    mgr.leaveMatch(a);
  });

  it('widens the acceptable range the longer a player waits, eventually pairing a distant opponent', () => {
    const low = freshUser(8005, 'WLow' + Math.floor(Math.random() * 1e6), 100);
    const high = freshUser(8006, 'WHigh' + Math.floor(Math.random() * 1e6), 3000);
    const lowMsgs: ServerMessage[] = [];
    const highMsgs: ServerMessage[] = [];

    mgr.queue(low, (m) => lowMsgs.push(m));
    // Let `low` wait long enough that its tolerance (150 * 2^(ms/1000)) has
    // grown past the 2900-trophy gap — that happens around 4.3s (150*2^4.3
    // ≈ 3060), well before the 6s bot-fallback deadline — then a distant
    // opponent queues.
    vi.advanceTimersByTime(5000);
    mgr.queue(high, (m) => highMsgs.push(m));

    expect(lowMsgs.some((m) => m.t === 'matchFound')).toBe(true);
    expect(highMsgs.some((m) => m.t === 'matchFound')).toBe(true);
    mgr.leaveMatch(low);
  });

  it('still falls back to a bot when nobody in any range shows up', () => {
    const solo = freshUser(8007, 'Solo' + Math.floor(Math.random() * 1e6), 800);
    const msgs: ServerMessage[] = [];
    mgr.queue(solo, (m) => msgs.push(m));
    vi.advanceTimersByTime(6100);
    expect(msgs.some((m) => m.t === 'matchFound')).toBe(true);
    mgr.leaveMatch(solo);
  });

  it('cancelQueue removes a waiting player so a later opponent does not pair with them', () => {
    const a = freshUser(8008, 'CancelA' + Math.floor(Math.random() * 1e6), 500);
    const b = freshUser(8009, 'CancelB' + Math.floor(Math.random() * 1e6), 500);
    const aMsgs: ServerMessage[] = [];
    const bMsgs: ServerMessage[] = [];

    mgr.queue(a, (m) => aMsgs.push(m));
    mgr.cancelQueue(a);
    mgr.queue(b, (m) => bMsgs.push(m));

    expect(bMsgs.some((m) => m.t === 'matchFound')).toBe(false);
    expect(bMsgs.some((m) => m.t === 'queued')).toBe(true);
    mgr.cancelQueue(b);
  });
});
