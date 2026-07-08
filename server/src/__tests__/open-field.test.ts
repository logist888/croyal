import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import {
  OPEN_BATTLE_CONFIG, DEFAULT_BATTLE_CONFIG, DEFAULT_TRIO,
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, RIVER_HALF_HEIGHT, BRIDGE_X,
  TOWER_POSITIONS, TICK_DT, towerBodyRadius,
  type Side,
} from '@croyal/shared';

function sim(trioA = [...DEFAULT_TRIO], trioB = [...DEFAULT_TRIO]): Simulation {
  return new Simulation(trioA, trioB, 1, {}, {}, OPEN_BATTLE_CONFIG);
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

describe('open-field deployment (classic)', () => {
  it('is the default battle core', () => {
    expect(DEFAULT_BATTLE_CONFIG).toEqual(OPEN_BATTLE_CONFIG);
    expect(DEFAULT_BATTLE_CONFIG.deployment).toBe('open');
    expect(sim().getSnapshot('A').mode).toEqual({ economy: 'cooldown', deployment: 'open' });
  });

  it('lets the player place a troop anywhere on their own half', () => {
    const s = sim();
    // A owns the bottom half; place near the left princess.
    expect(s.deploy('A', 'footman', 3, ARENA_HEIGHT - 6).ok).toBe(true);
    const [u] = unitsOf(s, 'A');
    expect(u.x).toBeCloseTo(3, 5);
    expect(u.y).toBeCloseTo(ARENA_HEIGHT - 6, 5);
  });

  it('rejects the enemy half while both enemy princess towers stand', () => {
    const s = sim();
    expect(s.deploy('A', 'footman', 9, 6).ok).toBe(false); // top half = B's
    expect(s.deploy('A', 'footman').ok).toBe(false); // open mode needs coords
  });

  it('a left-placed troop crosses the LEFT bridge, a right-placed one the RIGHT bridge', () => {
    for (const [placeX, bridge] of [[3, BRIDGE_X[0]], [ARENA_WIDTH - 3, BRIDGE_X[1]]] as const) {
      const s = sim();
      s.deploy('A', 'footman', placeX, ARENA_HEIGHT - 5);
      const [u] = unitsOf(s, 'A');
      let crossedOnBridge = false;
      run(s, 30, () => {
        if (u.hp > 0 && Math.abs(u.y - RIVER_Y) <= RIVER_HALF_HEIGHT) {
          // In the river band it must be standing on the NEAR bridge, never water.
          expect(Math.abs(u.x - bridge)).toBeLessThan(0.6);
          crossedOnBridge = true;
        }
      });
      expect(crossedOnBridge).toBe(true);
    }
  });

  it('a lone troop marches on the NEAREST enemy tower (right placement -> right princess)', () => {
    const s = sim();
    s.deploy('A', 'footman', ARENA_WIDTH - 4, ARENA_HEIGHT - 5);
    const [u] = unitsOf(s, 'A');
    run(s, 22);
    if (u.hp > 0) {
      const right = TOWER_POSITIONS.B.princessRight;
      const left = TOWER_POSITIONS.B.princessLeft;
      const dRight = Math.hypot(u.x - right.x, u.y - right.y);
      const dLeft = Math.hypot(u.x - left.x, u.y - left.y);
      expect(dRight).toBeLessThan(dLeft); // headed for the near (right) tower
    }
    // whatever happened, it crossed to the enemy half
    expect(u.hp <= 0 || u.y < RIVER_Y).toBe(true);
  });

  it('never stands inside a tower hitbox', () => {
    const s = sim();
    s.deploy('A', 'footman', ARENA_WIDTH - 4, ARENA_HEIGHT - 5);
    const [u] = unitsOf(s, 'A');
    const p = TOWER_POSITIONS.B.princessRight;
    run(s, 40, () => {
      if (u.hp > 0) {
        const d = Math.hypot(u.x - p.x, u.y - p.y);
        expect(d).toBeGreaterThanOrEqual(towerBodyRadius('princessRight') - 0.01);
      }
    });
  });

  it('peels off to fight an enemy troop that lands within aggro range', () => {
    const s = sim();
    // A defender sits just inside its half near the right lane.
    s.deploy('A', 'footman', ARENA_WIDTH - 4, RIVER_Y + 2);
    // An attacker crosses into the same area.
    s.deploy('B', 'footman', ARENA_WIDTH - 4, RIVER_Y - 2);
    const defender = unitsOf(s, 'A')[0];
    const attacker = unitsOf(s, 'B')[0];
    const aHp0 = attacker.hp;
    const dHp0 = defender.hp;
    run(s, 8);
    // They should have engaged each other rather than marching past.
    expect(attacker.hp < aHp0 || defender.hp < dHp0).toBe(true);
  });

  it('resolves a one-sided rush to a real result (no draw)', () => {
    const s = sim();
    run(s, OPEN_BATTLE_CONFIG.roundSeconds + 1, () => {
      if (s.result) return;
      for (const id of s.readyCards('A')) s.deploy('A', id, ARENA_WIDTH - 4, ARENA_HEIGHT - 5);
    });
    expect(s.result).not.toBeNull();
    expect(s.winnerSide).toBe('A');
  });
});
