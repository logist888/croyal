/**
 * The interpolation buffer is the foundation of the whole battle renderer:
 * facing, gait speed, spawn pops and death topples are all derived from it, and
 * a bug here is invisible in a screenshot but wrong in motion. Hence real tests.
 */
import { describe, it, expect } from 'vitest';
import { TICK_RATE, type EntitySnapshot } from '@croyal/shared';
import { SnapshotBuffer } from '../interp';

const TICK_MS = 1000 / TICK_RATE; // 50

function unit(id: string, x: number, y: number, hp = 100): EntitySnapshot {
  return { id, side: 'A', kind: 'unit', cardId: 'knight', x, y, hp, maxHp: 100, color: 0 };
}

/**
 * Feed snapshots and then sample at a chosen point on the *render* timeline.
 * The buffer renders at `now - offset - delay`, and offset is pinned by the
 * first push, so pushing at t=0 for tick 0 makes render time = now - delay.
 */
function seed(frames: Array<[number, EntitySnapshot[]]>) {
  const buf = new SnapshotBuffer();
  for (const [tick, ents] of frames) buf.push(tick, ents, tick * TICK_MS);
  return buf;
}

/**
 * Sample so that the render clock lands exactly on `tick`. The buffer's delay
 * adapts to observed jitter, so read it back rather than assuming the default.
 */
function sampleAtTick(buf: SnapshotBuffer, tick: number) {
  return buf.sample(tick * TICK_MS + buf.health.delay);
}

describe('SnapshotBuffer', () => {
  it('interpolates position halfway between two ticks', () => {
    const buf = seed([[0, [unit('a', 0, 0)]], [2, [unit('a', 10, 20)]]]);
    const r = sampleAtTick(buf, 1); // exactly between tick 0 and tick 2
    const a = r.list.find((s) => s.id === 'a')!;
    expect(a.x).toBeCloseTo(5, 5);
    expect(a.y).toBeCloseTo(10, 5);
  });

  it('derives velocity in tiles per second from the frame delta', () => {
    // 10 tiles over 2 ticks = 100ms → 100 tiles/second.
    const buf = seed([[0, [unit('a', 0, 0)]], [2, [unit('a', 10, 0)]]]);
    const a = sampleAtTick(buf, 1).list.find((s) => s.id === 'a')!;
    expect(a.vx).toBeCloseTo(100, 3);
    expect(a.vy).toBeCloseTo(0, 5);
  });

  it('lerps hp as well as position', () => {
    const buf = seed([[0, [unit('a', 0, 0, 100)]], [2, [unit('a', 0, 0, 50)]]]);
    const a = sampleAtTick(buf, 1).list.find((s) => s.id === 'a')!;
    expect(a.hp).toBeCloseTo(75, 5);
  });

  it('survives a dropped packet by interpolating across the gap', () => {
    // Tick 2 never arrives; 0 → 4 is a 200ms span.
    const buf = seed([[0, [unit('a', 0, 0)]], [4, [unit('a', 40, 0)]]]);
    const a = sampleAtTick(buf, 2).list.find((s) => s.id === 'a')!;
    expect(a.x).toBeCloseTo(20, 5);
  });

  it('holds the last frame instead of extrapolating past it', () => {
    const buf = seed([[0, [unit('a', 0, 0)]], [2, [unit('a', 10, 0)]]]);
    // Ask for a render time well beyond the newest frame.
    const a = buf.sample(10 * TICK_MS + buf.health.delay).list.find((s) => s.id === 'a')!;
    expect(a.x).toBe(10);      // clamped to the last known position
    expect(a.vx).toBe(0);      // and not still "moving"
  });

  it('reports a spawn exactly once', () => {
    const buf = seed([[0, [unit('a', 0, 0)]]]);
    expect(sampleAtTick(buf, 0).spawned).toEqual(['a']);
    expect(sampleAtTick(buf, 0).spawned).toEqual([]);
  });

  it('keeps a dying unit visible through the span, then reports it once', () => {
    const buf = seed([[0, [unit('a', 5, 5)]], [2, []]]);
    // Mid-span: still drawn, frozen at its last position.
    const mid = sampleAtTick(buf, 1);
    expect(mid.list.map((s) => s.id)).toContain('a');
    expect(mid.died).toEqual([]);
    // Past the newer frame: reported dead, with its last state for the topple.
    const after = buf.sample(10 * TICK_MS + buf.health.delay);
    expect(after.died).toEqual(['a']);
    expect(after.gone.get('a')?.x).toBe(5);
    // Never reported twice.
    expect(buf.sample(11 * TICK_MS + buf.health.delay).died).toEqual([]);
  });

  it('ignores duplicate and out-of-order snapshots', () => {
    const buf = seed([[0, [unit('a', 0, 0)]], [2, [unit('a', 10, 0)]]]);
    buf.push(2, [unit('a', 999, 999)], 2 * TICK_MS); // same tick again
    buf.push(1, [unit('a', 777, 777)], 3 * TICK_MS); // older tick
    const a = sampleAtTick(buf, 2).list.find((s) => s.id === 'a')!;
    expect(a.x).toBe(10);
  });

  it('returns nothing before the first snapshot arrives', () => {
    const buf = new SnapshotBuffer();
    const r = buf.sample(1000);
    expect(r.list).toEqual([]);
    expect(r.spawned).toEqual([]);
    expect(r.died).toEqual([]);
  });

  it('resets on a large tick jump and marks the next sample silent', () => {
    const buf = seed([[0, [unit('a', 0, 0)]], [2, [unit('a', 10, 0)]]]);
    sampleAtTick(buf, 1);
    // A reconnect: the server resumes far ahead on the tick timeline.
    buf.push(500, [unit('b', 3, 3)], 500 * TICK_MS);
    expect(buf.consumeSilent()).toBe(true);
    expect(buf.consumeSilent()).toBe(false);
    // 'a' is gone without ever being reported dead — no phantom death FX.
    const r = buf.sample(500 * TICK_MS + buf.health.delay);
    expect(r.died).toEqual([]);
    expect(r.spawned).toEqual(['b']);
  });

  it('reset() clears the timeline and the live set', () => {
    const buf = seed([[0, [unit('a', 0, 0)]]]);
    sampleAtTick(buf, 0);
    buf.reset();
    expect(buf.sample(1000).list).toEqual([]);
    buf.push(0, [unit('a', 0, 0)], 0);
    // 'a' is a fresh spawn again, not a survivor.
    expect(sampleAtTick(buf, 0).spawned).toEqual(['a']);
  });

  it('evicts old frames but keeps interpolating', () => {
    const frames: Array<[number, EntitySnapshot[]]> = [];
    for (let i = 0; i <= 40; i += 2) frames.push([i, [unit('a', i, 0)]]);
    const buf = seed(frames);
    expect(buf.health.depth).toBeLessThanOrEqual(8);
    const a = sampleAtTick(buf, 39).list.find((s) => s.id === 'a')!;
    expect(a.x).toBeCloseTo(39, 5);
  });
});
