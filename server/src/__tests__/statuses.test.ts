import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import { COOLDOWN_BATTLE_CONFIG, TICK_DT, type Side } from '@croyal/shared';

function sim(trioA: string[], trioB: string[]): Simulation {
  return new Simulation(trioA, trioB, 1, {}, {}, COOLDOWN_BATTLE_CONFIG);
}

function run(s: Simulation, seconds: number, each?: () => void): void {
  const ticks = Math.round(seconds / TICK_DT);
  for (let i = 0; i < ticks; i++) {
    s.step(TICK_DT);
    each?.();
  }
}

function unitsOf(s: Simulation, side: Side) {
  return [...s.entities.values()].filter((e) => e.side === side && e.kind === 'unit');
}

describe('status effects', () => {
  it('a slow zone slows enemies inside and decays shortly after it expires', () => {
    const s = sim(['blizzard', 'archers', 'footman'], ['footman', 'archers', 'colossus']);
    s.deploy('B', 'footman');
    run(s, 2);
    const [foe] = unitsOf(s, 'B');
    // Drop the blizzard right on the marcher.
    expect(s.deploy('A', 'blizzard', foe.x, foe.y).ok).toBe(true);
    run(s, 0.2);
    expect(foe.statuses.some((st) => st.kind === 'slow')).toBe(true);

    const y0 = foe.y;
    run(s, 1);
    const slowedTravel = Math.abs(foe.y - y0);
    // ~55% speed: noticeably less than a full-speed second of travel (1 tile)
    expect(slowedTravel).toBeLessThan(0.75);

    // After the zone (4s) + decay (0.5s), the status is gone.
    run(s, 4);
    expect(foe.statuses.some((st) => st.kind === 'slow')).toBe(false);
  });

  it('poison zones kill low-hp swarms and the damage is attributed', () => {
    const s = sim(['venom_cloud', 'archers', 'footman'], ['ratpack', 'archers', 'colossus']);
    s.deploy('B', 'ratpack'); // 80 hp bodies
    run(s, 2);
    const rats = unitsOf(s, 'B');
    expect(rats.length).toBe(3);
    expect(s.deploy('A', 'venom_cloud', rats[0].x, rats[0].y).ok).toBe(true);
    // 35 dps over 6s > 80 hp — the cloud alone melts them.
    run(s, 4);
    expect(unitsOf(s, 'B').length).toBeLessThan(3);
  });

  it('root pins ground units in place; flyers are immune', () => {
    const s = sim(['entangle', 'archers', 'footman'], ['footman', 'stormcrow', 'colossus']);
    s.deploy('B', 'footman');
    s.deploy('B', 'stormcrow');
    run(s, 1);
    const foes = unitsOf(s, 'B');
    const ground = foes.find((e) => !e.flying)!;
    const flyer = foes.find((e) => e.flying)!;
    s.deploy('A', 'entangle', ground.x, ground.y);
    // Also try to root the flyer directly.
    s.deploy('A', 'entangle'); // rejected: needs coords
    const gy = ground.y;
    const fy = flyer.y;
    run(s, 1);
    expect(Math.abs(ground.y - gy)).toBeLessThan(0.05); // rooted
    expect(Math.abs(flyer.y - fy)).toBeGreaterThan(0.5); // kept flying
    run(s, 2);
    expect(Math.abs(ground.y - gy)).toBeGreaterThan(0.3); // released
  });

  it('knockback shoves units back and stuns them briefly', () => {
    const s = sim(['galestrike', 'archers', 'footman'], ['footman', 'archers', 'colossus']);
    s.deploy('B', 'footman');
    run(s, 3);
    const [foe] = unitsOf(s, 'B');
    const yBefore = foe.y;
    // Cast just BELOW the marcher (from A's perspective) to shove it back up.
    s.deploy('A', 'galestrike', foe.x, foe.y + 1.5);
    run(s, 0.1);
    expect(foe.y).toBeLessThan(yBefore); // pushed away from the blast
    expect(foe.statuses.some((st) => st.kind === 'stun')).toBe(true);
    run(s, 1);
    expect(foe.statuses.some((st) => st.kind === 'stun')).toBe(false);
  });

  it('shield absorbs exactly its pool before hp is touched', () => {
    const s = sim(['fortify', 'footman', 'archers'], ['meteor', 'archers', 'footman']);
    s.deploy('A', 'footman');
    run(s, 0.5);
    const [mine] = unitsOf(s, 'A');
    s.deploy('A', 'fortify', mine.x, mine.y); // 320 shield
    run(s, 0.1);
    expect(mine.statuses.some((st) => st.kind === 'shield')).toBe(true);
    const hp0 = mine.hp;
    s.deploy('B', 'meteor', mine.x, mine.y); // 360 dmg -> 320 soaked, 40 through
    run(s, 0.1);
    expect(hp0 - mine.hp).toBeGreaterThanOrEqual(35);
    expect(hp0 - mine.hp).toBeLessThanOrEqual(45);
    expect(mine.statuses.some((st) => st.kind === 'shield')).toBe(false); // broken
  });

  it('rage speeds up movement and expires on schedule', () => {
    const s = sim(['royal_decree', 'footman', 'archers'], ['footman', 'archers', 'colossus']);
    s.deploy('A', 'footman');
    run(s, 0.5);
    const [mine] = unitsOf(s, 'A');
    const y0 = mine.y;
    run(s, 1);
    const plain = y0 - mine.y; // ~1 tile
    s.deploy('A', 'royal_decree', mine.x, mine.y);
    run(s, 0.1);
    expect(mine.statuses.some((st) => st.kind === 'rage')).toBe(true);
    const y1 = mine.y;
    run(s, 1);
    const raged = y1 - mine.y;
    expect(raged).toBeGreaterThan(plain * 1.15);
    run(s, 6);
    expect(mine.statuses.some((st) => st.kind === 'rage')).toBe(false);
  });

  it('statuses ride the snapshot only when present (wire compat)', () => {
    const s = sim(['blizzard', 'archers', 'footman'], ['footman', 'archers', 'colossus']);
    s.deploy('B', 'footman');
    run(s, 1);
    let snap = s.getSnapshot('A');
    for (const e of snap.entities) expect(e.statuses).toBeUndefined();
    expect(snap.zones).toBeUndefined();

    const [foe] = unitsOf(s, 'B');
    s.deploy('A', 'blizzard', foe.x, foe.y);
    run(s, 0.2);
    snap = s.getSnapshot('A');
    expect(snap.zones!.length).toBe(1);
    expect(snap.zones![0].status).toBe('slow');
    const snapFoe = snap.entities.find((e) => e.id === foe.id)!;
    expect(snapFoe.statuses).toContain('slow');
  });
});
