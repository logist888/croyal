/**
 * Raid combat FX.
 *
 * Boss raids rendered units but produced no projectiles, impacts or spell rings,
 * because the raid loop is bespoke and never emitted AttackEvents while the 1v1
 * simulation did.
 *
 * The subtle part is the lifecycle: snapshotFor() runs once PER PARTICIPANT, so
 * clearing the buffer inside it would hand the effects to whichever raider was
 * serialised first and leave everyone else with a silent fight. These tests
 * drive the real room rather than reading the source, so that stays honest.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BossRoom } from '../game/boss';
import {
  DEFAULT_TRIO, COOLDOWN_BATTLE_CONFIG, RIVER_Y, RIVER_HALF_HEIGHT, ARENA_WIDTH,
  type BossSnapshot, type ServerMessage, type AttackEvent,
} from '@croyal/shared';

afterEach(() => { vi.useRealTimers(); });

/** Collect every snapshot a seat receives. */
function seat() {
  const snaps: BossSnapshot[] = [];
  const send = (m: ServerMessage) => { if (m.t === 'boss') snaps.push(m.snapshot); };
  const events = () => snaps.flatMap((s) => s.events ?? []);
  return { snaps, send, events };
}

/** Deploy in the raider band (below the river) so troops march at the boss. */
const RAIDER_Y = RIVER_Y + RIVER_HALF_HEIGHT + 2;

describe('boss raid combat events', () => {
  it('emits an attack event when a raider unit reaches and hits the boss', () => {
    vi.useFakeTimers();
    const a = seat();
    const room = new BossRoom('c-atk', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('u1', 'Raider', [...DEFAULT_TRIO], a.send);
    room.deploy('u1', 'footman', ARENA_WIDTH / 2, RAIDER_Y);

    vi.advanceTimersByTime(20000); // march across the bridge and engage

    const attacks = a.events().filter((e) => e.kind === 'attack' && e.side === 'A');
    expect(attacks.length, 'a raider hitting the boss must produce FX').toBeGreaterThan(0);
    room.leave('u1');
  });

  it('emits one area event for the boss slam, not one per victim', () => {
    vi.useFakeTimers();
    const a = seat();
    const room = new BossRoom('c-slam', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('u1', 'Raider', [...DEFAULT_TRIO], a.send);
    // Send the whole trio so several bodies stand inside the boss's radius at
    // once: if the slam emitted per victim we would see a burst of identical
    // events in a single window. (ratpack alone dies before arriving — the
    // first draft of this test used it and proved nothing.)
    for (const card of DEFAULT_TRIO) {
      room.deploy('u1', card, ARENA_WIDTH / 2, RAIDER_Y);
    }
    vi.advanceTimersByTime(25000);

    const slams = a.snaps
      .map((s) => (s.events ?? []).filter((e: AttackEvent) => e.side === 'B'))
      .filter((list) => list.length > 0);
    expect(slams.length, 'the boss should have swung at least once').toBeGreaterThan(0);
    for (const window of slams) {
      expect(window.length, 'one slam per window, not one per unit hit').toBe(1);
      expect(window[0].radius).toBeGreaterThan(0);
    }
    room.leave('u1');
  });

  it('gives the SAME events to every raider in a co-op room', () => {
    // The regression this guards: clearing the buffer inside snapshotFor would
    // serve the first seat and starve the rest.
    vi.useFakeTimers();
    const a = seat();
    const b = seat();
    const room = new BossRoom('c-coop', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('u1', 'One', [...DEFAULT_TRIO], a.send);
    room.join('u2', 'Two', [...DEFAULT_TRIO], b.send);
    room.deploy('u1', 'footman', ARENA_WIDTH / 2, RAIDER_Y);
    vi.advanceTimersByTime(20000);

    expect(a.events().length).toBeGreaterThan(0);
    expect(b.events().length, 'the second raider must see the same fight').toBe(a.events().length);
    room.leave('u1');
    room.leave('u2');
  });

  it('omits the field entirely on a quiet window', () => {
    // Optional on the wire, so a client that never learned about `events`
    // is unaffected.
    vi.useFakeTimers();
    const a = seat();
    const room = new BossRoom('c-quiet', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('u1', 'Idle', [...DEFAULT_TRIO], a.send);
    vi.advanceTimersByTime(1500); // nothing deployed: no combat can happen

    expect(a.snaps.length).toBeGreaterThan(0);
    expect(a.snaps.every((s) => s.events === undefined)).toBe(true);
    room.leave('u1');
  });

  it('does not leak events across windows', () => {
    vi.useFakeTimers();
    const a = seat();
    const room = new BossRoom('c-clear', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('u1', 'Raider', [...DEFAULT_TRIO], a.send);
    room.deploy('u1', 'footman', ARENA_WIDTH / 2, RAIDER_Y);
    vi.advanceTimersByTime(20000);

    // If the buffer were never cleared, each snapshot would carry every event
    // ever produced and the counts would climb monotonically.
    const counts = a.snaps.map((s) => (s.events ?? []).length);
    const maxWindow = Math.max(...counts);
    expect(maxWindow).toBeLessThan(20);
    expect(counts[counts.length - 1]).toBeLessThanOrEqual(maxWindow);
    room.leave('u1');
  });
});
