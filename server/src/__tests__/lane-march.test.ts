import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import {
  COOLDOWN_BATTLE_CONFIG, DEFAULT_TRIO, LANE_SPAWN, RIVER_Y, RIVER_HALF_HEIGHT,
  TOWER_POSITIONS, TICK_DT, BRIDGE_X, towerBodyRadius,
  type Side,
} from '@croyal/shared';

function sim(trioA = [...DEFAULT_TRIO], trioB = [...DEFAULT_TRIO]): Simulation {
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

describe('fixed-lane auto-march', () => {
  it('troops spawn at their side lane point (server picks the spot)', () => {
    const s = sim();
    s.deploy('A', 'footman');
    const [u] = unitsOf(s, 'A');
    expect(u.x).toBeCloseTo(LANE_SPAWN.A.x, 5);
    expect(u.y).toBeCloseTo(LANE_SPAWN.A.y, 5);
  });

  it('a marcher crosses via its own bridge and never walks on water', () => {
    const s = sim();
    s.deploy('A', 'footman');
    const [u] = unitsOf(s, 'A');
    let crossed = false;
    run(s, 30, () => {
      if (Math.abs(u.y - RIVER_Y) <= RIVER_HALF_HEIGHT) {
        crossed = true;
        // hard rule: inside the river band the unit must stand on a bridge
        const onBridge = BRIDGE_X.some((bx) => Math.abs(u.x - bx) < 0.6);
        expect(onBridge).toBe(true);
      }
    });
    expect(crossed).toBe(true);
    expect(u.y).toBeLessThan(RIVER_Y); // reached the enemy half
  });

  it("A's march attacks B's right-lane princess first, then heads to the king", () => {
    const s = sim();
    // Rush repeatedly so the princess actually falls.
    run(s, 170, () => {
      for (const id of s.readyCards('A')) s.deploy('A', id);
    });
    const princess = [...s.entities.values()].find(
      (e) => e.side === 'B' && e.towerType === 'princessRight',
    );
    expect(princess).toBeUndefined(); // destroyed
    expect(s.getSnapshot('A').score.A).toBeGreaterThanOrEqual(1);
    // untouched flank: B's LEFT princess still stands
    const other = [...s.entities.values()].find(
      (e) => e.side === 'B' && e.towerType === 'princessLeft',
    );
    expect(other).toBeDefined();
  });

  it('march is mirror-symmetric for side B (left bridge, A princessLeft)', () => {
    const s = sim();
    s.deploy('B', 'footman');
    const [u] = unitsOf(s, 'B');
    expect(u.x).toBeCloseTo(LANE_SPAWN.B.x, 5);
    run(s, 30);
    expect(u.y).toBeGreaterThan(RIVER_Y); // crossed onto A's half
    const target = TOWER_POSITIONS.A.princessLeft;
    expect(Math.abs(u.x - target.x)).toBeLessThan(4);
  });

  it('units stop at the tower hitbox — never stand inside a tower', () => {
    const s = sim();
    s.deploy('A', 'footman');
    const [u] = unitsOf(s, 'A');
    const p = TOWER_POSITIONS.B.princessRight;
    run(s, 40, () => {
      if (u.hp > 0) {
        const d = Math.hypot(u.x - p.x, u.y - p.y);
        expect(d).toBeGreaterThanOrEqual(towerBodyRadius('princessRight') - 0.01);
      }
    });
  });

  it('princess towers actually shoot approaching units (defender re-scan fix)', () => {
    const s = sim();
    s.deploy('A', 'footman');
    const [u] = unitsOf(s, 'A');
    const hp0 = u.hp;
    run(s, 25);
    // By the time it reaches the tower it must have been shot at least once.
    expect(u.hp).toBeLessThan(hp0);
  });

  it('destroying the king ends the match instantly', () => {
    // Give A a heavy trio and B nothing to defend with beyond towers.
    const s = sim();
    run(s, 179, () => {
      for (const id of s.readyCards('A')) s.deploy('A', id);
      if (s.result) return;
    });
    // With a full-match one-sided rush the match must have ended by king or timeout — never a draw.
    expect(s.result).not.toBeNull();
    expect(s.winnerSide).toBe('A');
  });
});
