import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import { COOLDOWN_BATTLE_CONFIG, RIVER_Y, TICK_DT, type Side } from '@croyal/shared';

function makeSim(trioA: string[], trioB: string[]): Simulation {
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

describe('intercept rule (one nearest unit peels off, the rest keep marching)', () => {
  it('exactly ONE of my units switches onto a threat on my half; others keep marching', () => {
    const s = makeSim(['footman', 'archers', 'colossus'], ['blademaster', 'archers', 'colossus']);
    s.deploy('B', 'blademaster');
    run(s, 8); // the threat crosses onto A's half
    const threat = unitsOf(s, 'B')[0];
    expect(threat).toBeDefined();
    expect(threat.y).toBeGreaterThan(RIVER_Y);

    // Now A fields two cards (3 bodies) — the assignment must pull exactly one.
    s.deploy('A', 'footman');
    s.deploy('A', 'archers');
    run(s, 0.5);
    const mine = unitsOf(s, 'A');
    const interceptors = mine.filter((u) => u.marchState === 'intercept');
    expect(interceptors.length).toBe(1);
    expect(mine.filter((u) => u.marchState === 'march').length).toBe(mine.length - 1);
  });

  it('the interceptor returns to the march after the threat dies', () => {
    const s = makeSim(['blademaster', 'archers', 'colossus'], ['ratpack', 'archers', 'colossus']);
    s.deploy('B', 'ratpack');
    run(s, 7); // rats cross onto A's half (princess left starts shooting them)
    s.deploy('A', 'blademaster');
    let sawIntercept = false;
    run(s, 6, () => {
      const a = unitsOf(s, 'A')[0];
      if (a?.marchState === 'intercept') sawIntercept = true;
    });
    expect(sawIntercept).toBe(true);
    // rats are gone (princess fire + interceptor), the survivor marches again
    expect(unitsOf(s, 'B').length).toBe(0);
    const a = unitsOf(s, 'A')[0];
    expect(a).toBeDefined();
    expect(a.marchState).toBe('march');
  });

  it('tanks (targetsBuildingsOnly) are never chosen as interceptors', () => {
    const s = makeSim(['colossus', 'archers', 'footman'], ['blademaster', 'archers', 'footman']);
    s.deploy('B', 'blademaster');
    run(s, 8);
    s.deploy('A', 'colossus'); // the only candidate — but tanks don't intercept
    run(s, 5, () => {
      const tank = unitsOf(s, 'A').find((u) => u.cardId === 'colossus');
      if (tank) expect(tank.marchState).not.toBe('intercept');
    });
  });

  it('each threat gets its own interceptor — one per threat, no doubling up', () => {
    const s = makeSim(['footman', 'archers', 'colossus'], ['blademaster', 'footman', 'colossus']);
    s.deploy('B', 'blademaster');
    s.deploy('B', 'footman');
    run(s, 10); // both threats are now on A's half
    const threats = unitsOf(s, 'B');
    expect(threats.length).toBe(2);
    for (const t of threats) expect(t.y).toBeGreaterThan(RIVER_Y);

    s.deploy('A', 'footman');
    s.deploy('A', 'archers'); // 3 bodies total
    run(s, 0.5);
    const interceptors = unitsOf(s, 'A').filter((u) => u.marchState === 'intercept');
    expect(interceptors.length).toBe(2); // one per threat
    // and they chase DIFFERENT threats
    expect(new Set(interceptors.map((u) => u.targetId)).size).toBe(2);
  });

  it('a full two-sided match produces real combat and still ends without a draw', () => {
    const s = makeSim(['footman', 'archers', 'colossus'], ['footman', 'archers', 'colossus']);
    let combatSeen = false;
    run(s, COOLDOWN_BATTLE_CONFIG.roundSeconds + 1, () => {
      if (s.result) return;
      for (const id of s.readyCards('A')) s.deploy('A', id);
      for (const id of s.readyCards('B')) s.deploy('B', id);
      const all = [...unitsOf(s, 'A'), ...unitsOf(s, 'B')];
      if (all.some((u) => u.hp < u.maxHp)) combatSeen = true;
    });
    expect(combatSeen).toBe(true);
    expect(s.result).not.toBeNull();
    expect(s.winnerSide === 'A' || s.winnerSide === 'B').toBe(true);
  });
});
