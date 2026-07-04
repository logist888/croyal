import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameManager } from '../manager';
import { store } from '../store';
import type { ServerMessage } from '@croyal/shared';

/**
 * Reconnection: a dropped socket must NOT instantly forfeit a live 1v1 match.
 * The manager holds the room open for a grace window; re-auth re-binds the
 * socket and resyncs. Only when the window elapses does the absent player lose.
 */
describe('reconnect grace window', () => {
  let mgr: GameManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new GameManager();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function freshUser(tg: number, nick: string): string {
    return store.createUser({ telegramId: tg, nickname: nick, language: 'en' }).id;
  }

  it('a disconnect does not end the match until the grace window elapses; reconnect resumes it', () => {
    const uid = freshUser(9001, 'Recon' + Math.floor(Math.random() * 1e6));
    const msgs1: ServerMessage[] = [];
    // Queue -> falls back to a bot after BOT_FALLBACK_MS, giving a live match.
    mgr.queue(uid, (m) => msgs1.push(m));
    vi.advanceTimersByTime(6000); // BOT_FALLBACK_MS -> match starts
    expect(msgs1.some((m) => m.t === 'matchFound')).toBe(true);

    // Socket drops. The match must stay alive (no matchEnd yet).
    mgr.disconnect(uid);
    vi.advanceTimersByTime(10000); // 10s < 30s grace
    // Reconnect within the window: re-auth calls attach(), which resyncs.
    const msgs2: ServerMessage[] = [];
    const resumed = mgr.attach(uid, (m) => msgs2.push(m));
    expect(resumed).toBe(true);
    expect(msgs2.some((m) => m.t === 'matchFound')).toBe(true); // re-announced
    expect(msgs2.some((m) => m.t === 'battle')).toBe(true); // resynced frame
    // No forfeit was delivered.
    expect(msgs2.some((m) => m.t === 'matchEnd')).toBe(false);
  });

  it('forfeits only after the grace window with no reconnect', () => {
    const uid = freshUser(9002, 'Timeout' + Math.floor(Math.random() * 1e6));
    const got: ServerMessage[] = [];
    mgr.queue(uid, (m) => got.push(m));
    vi.advanceTimersByTime(6000);
    got.length = 0;

    mgr.disconnect(uid);
    vi.advanceTimersByTime(29000);
    expect(got.some((m) => m.t === 'matchEnd')).toBe(false); // still within grace
    vi.advanceTimersByTime(2000); // now past 30s
    expect(got.some((m) => m.t === 'matchEnd')).toBe(true);
    expect(got.find((m) => m.t === 'matchEnd' && m.result.outcome === 'loss')).toBeTruthy();
  });

  it('attach is a no-op when the player has no live match', () => {
    const uid = freshUser(9003, 'NoMatch' + Math.floor(Math.random() * 1e6));
    expect(mgr.attach(uid, () => {})).toBe(false);
  });

  it('an explicit leave forfeits immediately and cancels any grace timer', () => {
    const uid = freshUser(9004, 'Leaver' + Math.floor(Math.random() * 1e6));
    const got: ServerMessage[] = [];
    mgr.queue(uid, (m) => got.push(m));
    vi.advanceTimersByTime(6000);
    got.length = 0;
    mgr.leaveMatch(uid);
    expect(got.some((m) => m.t === 'matchEnd')).toBe(true);
    // A later attach finds nothing (match already ended).
    expect(mgr.attach(uid, () => {})).toBe(false);
  });
});
