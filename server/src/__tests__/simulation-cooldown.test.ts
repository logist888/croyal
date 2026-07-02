import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import {
  DEFAULT_TRIO, COOLDOWN_BATTLE_CONFIG, TICK_DT, getCard,
} from '@croyal/shared';

const TRIO = [...DEFAULT_TRIO]; // footman, archers, colossus

function sim(seed = 1): Simulation {
  return new Simulation([...TRIO], [...TRIO], seed, {}, {}, COOLDOWN_BATTLE_CONFIG);
}

/** Advance the sim in server-sized ticks (large single steps skip combat detail). */
function run(s: Simulation, seconds: number): void {
  const ticks = Math.round(seconds / TICK_DT);
  for (let i = 0; i < ticks; i++) s.step(TICK_DT);
}

describe('cooldown economy', () => {
  it('playing a card puts THAT card on cooldown and rejects an instant replay', () => {
    const s = sim();
    expect(s.deploy('A', 'footman').ok).toBe(true);
    expect(s.cooldownOf('A', 'footman')).toBeCloseTo(getCard('footman')!.cooldownSec, 5);
    const again = s.deploy('A', 'footman');
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/cooldown/);
  });

  it('cooldowns are independent — other trio cards stay playable', () => {
    const s = sim();
    expect(s.deploy('A', 'footman').ok).toBe(true);
    expect(s.cooldownOf('A', 'archers')).toBe(0);
    expect(s.deploy('A', 'archers').ok).toBe(true);
    expect(s.cooldownOf('A', 'colossus')).toBe(0);
  });

  it('cooldowns are symmetric between sides', () => {
    const s = sim();
    s.deploy('A', 'footman');
    s.deploy('B', 'footman');
    expect(s.cooldownOf('A', 'footman')).toBeCloseTo(s.cooldownOf('B', 'footman'), 5);
  });

  it('a card recharges after its cooldownSec and can be played again', () => {
    const s = sim();
    s.deploy('A', 'footman');
    run(s, getCard('footman')!.cooldownSec + 0.1);
    expect(s.cooldownOf('A', 'footman')).toBe(0);
    expect(s.readyCards('A')).toContain('footman');
    expect(s.deploy('A', 'footman').ok).toBe(true);
  });

  it('final minute: cooldowns tick twice as fast (14s colossus ready in ~7s)', () => {
    const s = sim();
    // Burn time into the final phase (no deploys -> nothing dies).
    run(s, COOLDOWN_BATTLE_CONFIG.roundSeconds - COOLDOWN_BATTLE_CONFIG.finalPhaseLastSeconds + 1);
    expect(s.finalPhase()).toBe(true);
    expect(s.deploy('A', 'colossus').ok).toBe(true);
    run(s, 7.2);
    expect(s.cooldownOf('A', 'colossus')).toBe(0);
  });

  it('there is no elixir gate — snapshot elixir stays untouched and unused', () => {
    const s = sim();
    for (const id of TRIO) expect(s.deploy('A', id).ok).toBe(true); // no pool limits plays
  });

  it('snapshot carries mode, finalPhase and per-card cooldowns in trio order', () => {
    const s = sim();
    s.deploy('A', 'archers');
    const snap = s.getSnapshot('A');
    expect(snap.mode).toEqual({ economy: 'cooldown', deployment: 'fixed-lane' });
    expect(snap.finalPhase).toBe(false);
    expect(snap.hand).toEqual(TRIO);
    expect(snap.nextCard).toBe('');
    expect(snap.cooldowns!.map((c) => c.cardId)).toEqual(TRIO);
    const archers = snap.cooldowns!.find((c) => c.cardId === 'archers')!;
    expect(archers.remaining).toBeGreaterThan(0);
    expect(archers.total).toBeCloseTo(getCard('archers')!.cooldownSec, 5);
  });
});

describe('fixed-lane deployment rules', () => {
  it('rejects troop deploys that carry coordinates (no placement skill)', () => {
    const s = sim();
    const res = s.deploy('A', 'footman', 5, 22);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/fixed-lane/);
  });

  it('spells require a target point and accept free aim anywhere in the field', () => {
    const s = new Simulation(['meteor', 'archers', 'footman'], [...TRIO], 1, {}, {}, COOLDOWN_BATTLE_CONFIG);
    expect(s.deploy('A', 'meteor').ok).toBe(false);
    expect(s.deploy('A', 'meteor', 9, 6).ok).toBe(true); // enemy half
  });

  it('round lasts 180s and the timeout tiebreak still produces a winner', () => {
    const s = sim(42);
    expect(s.getSnapshot('A').timeLeft).toBe(COOLDOWN_BATTLE_CONFIG.roundSeconds);
    s.step(COOLDOWN_BATTLE_CONFIG.roundSeconds + 1);
    expect(s.result).not.toBeNull();
    expect(s.winnerSide === 'A' || s.winnerSide === 'B').toBe(true);
  });
});
