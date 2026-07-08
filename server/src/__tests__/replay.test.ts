import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameManager } from '../manager';
import { Simulation } from '../game/simulation';
import { store } from '../store';
import {
  OPEN_BATTLE_CONFIG, DEFAULT_TRIO, ARENA_WIDTH, ARENA_HEIGHT, TICK_DT,
  type Side, type ServerMessage,
} from '@croyal/shared';

/**
 * Replays lean on the simulation being fully deterministic: re-running the same
 * seed + decks + levels + config + action list reproduces the match exactly.
 */
describe('deterministic replay reproduction', () => {
  it('replaying a recorded action list yields the same winner and score', () => {
    const seed = 12345;
    const trio = [...DEFAULT_TRIO];
    // A scripted set of deploys (side, tick, card, coords) for the open core.
    const script: Array<{ tick: number; side: Side; cardId: string }> = [];
    for (let t = 1; t <= 60; t++) {
      if (t % 6 === 0) script.push({ tick: t, side: 'A', cardId: trio[(t / 6) % 3] });
      if (t % 9 === 0) script.push({ tick: t, side: 'B', cardId: trio[(t / 9) % 3] });
    }
    const spot = (side: Side) => (side === 'A'
      ? { x: ARENA_WIDTH - 4, y: ARENA_HEIGHT - 5 }
      : { x: 4, y: 5 });

    // Run once, recording exactly the deploys that the sim accepted, at their tick.
    const rec: Array<{ tick: number; side: Side; cardId: string; x: number; y: number }> = [];
    const run = () => {
      const s = new Simulation(trio, trio, seed, {}, {}, OPEN_BATTLE_CONFIG);
      const total = Math.round(OPEN_BATTLE_CONFIG.roundSeconds * (1 / TICK_DT));
      let ptr = 0;
      for (let i = 0; i < total && !s.result; i++) {
        while (ptr < script.length && script[ptr].tick <= s.tick) {
          const a = script[ptr++];
          const p = spot(a.side);
          const r = s.deploy(a.side, a.cardId, p.x, p.y);
          if (r.ok && rec.length < script.length) rec.push({ tick: s.tick, side: a.side, cardId: a.cardId, x: p.x, y: p.y });
        }
        s.step(TICK_DT);
      }
      return { winner: s.winnerSide, snap: s.getSnapshot('A') };
    };
    const first = run();

    // Replay the RECORDED actions on a fresh sim — must match bit-for-bit.
    const replaySim = new Simulation(trio, trio, seed, {}, {}, OPEN_BATTLE_CONFIG);
    const total = Math.round(OPEN_BATTLE_CONFIG.roundSeconds * (1 / TICK_DT));
    let ptr = 0;
    for (let i = 0; i < total && !replaySim.result; i++) {
      while (ptr < rec.length && rec[ptr].tick <= replaySim.tick) {
        const a = rec[ptr++];
        replaySim.deploy(a.side, a.cardId, a.x, a.y);
      }
      replaySim.step(TICK_DT);
    }
    expect(replaySim.winnerSide).toBe(first.winner);
    const rsnap = replaySim.getSnapshot('A');
    expect(rsnap.score).toEqual(first.snap.score);
    expect(replaySim.tick).toBe(first.snap.tick);
  });
});

describe('replay wiring (manager)', () => {
  let mgr: GameManager;
  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new GameManager();
  });
  afterEach(() => vi.useRealTimers());

  function freshUser(tg: number, nick: string): string {
    return store.createUser({ telegramId: tg, nickname: nick, language: 'en' }).id;
  }

  it('watching with no prior match reports "no replay available"', () => {
    const uid = freshUser(8001, 'NoRep' + Math.floor(Math.random() * 1e6));
    const msgs: ServerMessage[] = [];
    mgr.watchLastReplay(uid, (m) => msgs.push(m));
    expect(msgs.some((m) => m.t === 'error' && m.error === 'no replay available')).toBe(true);
  });

  it('after a finished match, watching streams a replay and ends it', () => {
    const uid = freshUser(8002, 'Rep' + Math.floor(Math.random() * 1e6));
    const battleMsgs: ServerMessage[] = [];
    mgr.queue(uid, (m) => battleMsgs.push(m));
    vi.advanceTimersByTime(6000); // BOT_FALLBACK_MS -> live match vs bot
    mgr.leaveMatch(uid); // end it immediately (forfeit) so a recording is stored

    const rep: ServerMessage[] = [];
    mgr.watchLastReplay(uid, (m) => rep.push(m));
    expect(rep.some((m) => m.t === 'replayStart')).toBe(true);
    // Let the playback loop run to completion.
    vi.advanceTimersByTime(OPEN_BATTLE_CONFIG.roundSeconds * 1000 + 2000);
    expect(rep.some((m) => m.t === 'battle')).toBe(true);
    expect(rep.some((m) => m.t === 'replayEnd')).toBe(true);
  });
});
