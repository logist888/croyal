import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import { DEFAULT_DECK, ROUND_SECONDS, LEGACY_BATTLE_CONFIG, getCard } from '@croyal/shared';

// The legacy elixir/free-placement core stays alive behind the config flags
// (GDD reversibility) — these tests are the rollback-path guarantee.
function legacySim(seed: number): Simulation {
  return new Simulation([...DEFAULT_DECK], [...DEFAULT_DECK], seed, {}, {}, LEGACY_BATTLE_CONFIG);
}

describe('battle simulation (legacy elixir / free placement)', () => {
  it('NEVER ends in a draw — a timed-out match still has a winner', () => {
    const sim = legacySim(12345);
    // fast-forward to the time limit with no deploys
    sim.step(ROUND_SECONDS + 1);
    expect(sim.result).not.toBeNull();
    expect(sim.result!.outcome).toBe('win');
    expect(sim.winnerSide === 'A' || sim.winnerSide === 'B').toBe(true);
    expect(sim.endReason).toBe('timeout');
  });

  it('treats leaving as an automatic loss for that side', () => {
    const sim = legacySim(7);
    sim.forfeit('A');
    expect(sim.winnerSide).toBe('B');
    expect(sim.endReason).toBe('opponent_left');
  });

  it('spends elixir when a card is deployed', () => {
    const sim = legacySim(1);
    const before = sim.getSnapshot('A').elixir.A;
    const card = sim.handOf('A').find((id) => (getCard(id)?.cost ?? 99) <= before)!;
    expect(card).toBeTruthy();
    const ok = sim.deploy('A', card, 5, 22); // A's own half (bottom)
    expect(ok.ok).toBe(true);
    const after = sim.getSnapshot('A').elixir.A;
    expect(after).toBeLessThan(before);
  });

  it('rejects deploying onto the enemy half', () => {
    const sim = legacySim(1);
    const card = sim.handOf('A')[0];
    const res = sim.deploy('A', card, 5, 3); // top half belongs to B
    expect(res.ok).toBe(false);
  });

  it('keeps the 4-card hand + next-card cycle', () => {
    const sim = legacySim(2);
    expect(sim.handOf('A').length).toBe(4);
    expect(sim.getSnapshot('A').nextCard).toBeTruthy();
  });

  it('DECISION: towers actively defend in legacy mode too (build-13 bug fix kept)', () => {
    // Build-13 towers locked a distant enemy tower forever and never fired at
    // approaching units — a defect, not a mechanic. The defender re-scan fix
    // deliberately applies to BOTH modes; exact build-13 behavior remains
    // available via the fallback commit 3c0354d. This test pins the decision.
    const sim = legacySim(9);
    for (let i = 0; i < 20; i++) sim.step(0.05); // empty field: towers idle
    expect(sim.deploy('A', sim.handOf('A').find((id) => getCard(id)?.type === 'troop')!, 13.5, 16.5).ok).toBe(true);
    const unit = [...sim.entities.values()].find((e) => e.kind === 'unit')!;
    const hp0 = unit.hp;
    for (let i = 0; i < 100; i++) sim.step(0.05); // 5s inside princess range
    expect(unit.hp).toBeLessThan(hp0); // the tower fires (unlike build-13)
  });

  it('buildings can still siege a tower in reach (build-13 parity)', () => {
    const sim = new Simulation(Array(8).fill('bastion'), [...DEFAULT_DECK], 3, {}, {}, LEGACY_BATTLE_CONFIG);
    // Deploy on own half, then move it to the king's doorstep via direct
    // entity access — asserts the targeting rule: buildings may hit towers.
    const ok = sim.deploy('A', 'bastion', 9, 22);
    expect(ok.ok).toBe(true);
    const b = [...sim.entities.values()].find((e) => e.kind === 'building')!;
    b.x = 9; b.y = 5.5; // in reach of B king (9,2), range 5.5
    const king = [...sim.entities.values()].find((e) => e.side === 'B' && e.towerType === 'king')!;
    const hp0 = king.hp;
    for (let i = 0; i < 60; i++) sim.step(0.05);
    expect(king.hp).toBeLessThan(hp0);
  });
});
