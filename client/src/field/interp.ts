/**
 * Snapshot interpolation buffer.
 *
 * The server broadcasts full snapshots at 10 Hz with a monotonic 20 Hz `tick`.
 * The old renderer smoothed positions exponentially toward the newest snapshot,
 * which lags ~90 ms, stutters whenever a packet is late, and — critically —
 * cannot tell you *when* an entity died, because dead entities simply stop
 * appearing in the array.
 *
 * This buffers a few snapshots and renders at `now - delay`, strictly between
 * two known ticks. That gives, for free and with no protocol change:
 *   - true interpolated motion that survives a dropped packet,
 *   - a velocity vector per entity (facing, gait speed, topple direction),
 *   - exact spawn and death moments, so units can pop in and fall over.
 *
 * Deliberately Phaser-free so it can be unit-tested on its own.
 */
import { TICK_RATE, type EntitySnapshot } from '@croyal/shared';

const TICK_MS = 1000 / TICK_RATE; // 50

/** One entity as it should be drawn this frame. */
export interface Sampled {
  id: string;
  x: number;
  y: number;
  /** Tiles per second, from the frame delta. Zero while holding the last frame. */
  vx: number;
  vy: number;
  hp: number;
  /** The newer of the two snapshots this was interpolated between. */
  e: EntitySnapshot;
}

export interface SampleResult {
  list: Sampled[];
  /** Ids that became visible this frame. */
  spawned: string[];
  /** Ids that stopped being visible this frame — each reported exactly once. */
  died: string[];
  /** Last known state of everything in `died`, for the death animation. */
  gone: Map<string, Sampled>;
}

interface Frame {
  /** Server timeline, ms. */
  t: number;
  ents: Map<string, EntitySnapshot>;
}

const MAX_FRAMES = 8;
/** Beyond this the timeline is considered broken (reconnect, tab resume). */
const RESYNC_TICK_GAP = 20;

export class SnapshotBuffer {
  private frames: Frame[] = [];
  /** localNow - serverTime. Null until the first snapshot. */
  private offset: number | null = null;
  /** How far behind the newest snapshot we render, ms. */
  private delay = 150;
  private lastArrival = 0;
  private meanGap = 100;
  private gapDev = 0;
  /** Ids currently on screen, so spawn/death fire exactly once. */
  private live = new Set<string>();
  private lastSampled = new Map<string, Sampled>();
  /** Set by reset(); suppresses spawn/death FX for one sample after a resync. */
  private silentNext = false;

  /** Feed a snapshot. `tick` is the server's 20 Hz counter. */
  push(tick: number, ents: EntitySnapshot[], nowMs: number): void {
    const t = tick * TICK_MS;
    const last = this.frames[this.frames.length - 1];

    if (last) {
      if (t <= last.t) return; // duplicate or out-of-order — the newer one wins
      if (t - last.t > RESYNC_TICK_GAP * TICK_MS) this.reset();
    }

    const map = new Map<string, EntitySnapshot>();
    for (const e of ents) map.set(e.id, e);
    this.frames.push({ t, ents: map });
    if (this.frames.length > MAX_FRAMES) this.frames.shift();

    // Clock: ease toward the arrival-implied offset when we're falling behind,
    // snap when we're wildly ahead (a resync or a very long stall).
    const target = nowMs - t;
    if (this.offset === null) this.offset = target;
    else if (target > this.offset) this.offset += (target - this.offset) * 0.05;
    else if (target < this.offset - 500) this.offset = target;

    // Adaptive delay from observed jitter: 1.4x the mean gap plus 2 sigma,
    // clamped so we never render more than a quarter second in the past.
    if (this.lastArrival) {
      const gap = nowMs - this.lastArrival;
      this.meanGap += (gap - this.meanGap) * 0.1;
      this.gapDev += (Math.abs(gap - this.meanGap) - this.gapDev) * 0.1;
      this.delay = Math.max(100, Math.min(260, this.meanGap * 1.4 + this.gapDev * 2));
    }
    this.lastArrival = nowMs;
  }

  /**
   * Drop the whole timeline. Call on reconnect and on tab resume — rAF stops in
   * the background, so the render clock would otherwise be seconds stale.
   */
  reset(): void {
    this.frames.length = 0;
    this.offset = null;
    this.lastArrival = 0;
    this.live.clear();
    this.lastSampled.clear();
    this.silentNext = true;
  }

  /** True when the next sample() should not raise spawn/death effects. */
  consumeSilent(): boolean {
    const s = this.silentNext;
    this.silentNext = false;
    return s;
  }

  /** Diagnostics for the FPS overlay. */
  get health(): { depth: number; delay: number; starved: boolean } {
    const rt = this.renderTime();
    const last = this.frames[this.frames.length - 1];
    return {
      depth: this.frames.length,
      delay: Math.round(this.delay),
      starved: !!last && rt !== null && rt > last.t,
    };
  }

  private renderTime(): number | null {
    if (this.offset === null || !this.frames.length) return null;
    return performanceNowShim() - this.offset - this.delay;
  }

  /** Interpolate the world at `now`. */
  sample(nowMs: number): SampleResult {
    const empty: SampleResult = { list: [], spawned: [], died: [], gone: new Map() };
    if (this.offset === null || !this.frames.length) return empty;

    const rt = nowMs - this.offset - this.delay;
    const first = this.frames[0];
    const last = this.frames[this.frames.length - 1];

    let f0 = first;
    let f1 = first;
    let a = 0;

    if (rt >= last.t) {
      // Past the newest frame. Hold it — extrapolating positions rubber-bands,
      // which reads far worse than a beat of lag. The local gait keeps playing.
      f0 = last; f1 = last; a = 0;
    } else if (rt > first.t) {
      for (let i = this.frames.length - 1; i > 0; i--) {
        if (this.frames[i - 1].t <= rt) { f0 = this.frames[i - 1]; f1 = this.frames[i]; break; }
      }
      const span = f1.t - f0.t;
      a = span > 0 ? Math.min(1, Math.max(0, (rt - f0.t) / span)) : 0;
    }

    const list: Sampled[] = [];
    const visible = new Set<string>();
    const dtSec = (f1.t - f0.t) / 1000;

    // Everything present in the newer frame is live and interpolated toward.
    for (const [id, e1] of f1.ents) {
      const e0 = f0.ents.get(id);
      let x = e1.x, y = e1.y, hp = e1.hp, vx = 0, vy = 0;
      if (e0 && e0 !== e1) {
        x = e0.x + (e1.x - e0.x) * a;
        y = e0.y + (e1.y - e0.y) * a;
        hp = e0.hp + (e1.hp - e0.hp) * a;
        if (dtSec > 0) { vx = (e1.x - e0.x) / dtSec; vy = (e1.y - e0.y) / dtSec; }
      }
      const s: Sampled = { id, x, y, vx, vy, hp, e: e1 };
      list.push(s);
      visible.add(id);
      this.lastSampled.set(id, s);
    }

    // Present in the older frame only: it died during this span. Keep drawing it
    // frozen until the render clock crosses into the newer frame, then report it.
    if (f0 !== f1) {
      for (const [id, e0] of f0.ents) {
        if (f1.ents.has(id)) continue;
        if (a >= 1) continue; // the moment has passed — fall through to `died`
        const s: Sampled = { id, x: e0.x, y: e0.y, vx: 0, vy: 0, hp: e0.hp, e: e0 };
        list.push(s);
        visible.add(id);
        this.lastSampled.set(id, s);
      }
    }

    const spawned: string[] = [];
    const died: string[] = [];
    const gone = new Map<string, Sampled>();
    for (const id of visible) if (!this.live.has(id)) spawned.push(id);
    for (const id of this.live) {
      if (visible.has(id)) continue;
      died.push(id);
      const s = this.lastSampled.get(id);
      if (s) gone.set(id, s);
      this.lastSampled.delete(id);
    }
    this.live = visible;

    return { list, spawned, died, gone };
  }
}

// performance.now() is used only for diagnostics; guard for non-browser tests.
function performanceNowShim(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}
