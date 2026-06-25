import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import { DEFAULT_DECK, ROUND_SECONDS } from '@croyal/shared';

describe('battle simulation', () => {
  it('NEVER ends in a draw — a timed-out match still has a winner', () => {
    const sim = new Simulation([...DEFAULT_DECK], [...DEFAULT_DECK], 12345);
    // fast-forward to the time limit with no deploys
    sim.step(ROUND_SECONDS + 1);
    expect(sim.result).not.toBeNull();
    expect(sim.result!.outcome).toBe('win');
    expect(sim.winnerSide === 'A' || sim.winnerSide === 'B').toBe(true);
    expect(sim.endReason).toBe('timeout');
  });

  it('treats leaving as an automatic loss for that side', () => {
    const sim = new Simulation([...DEFAULT_DECK], [...DEFAULT_DECK], 7);
    sim.forfeit('A');
    expect(sim.winnerSide).toBe('B');
    expect(sim.endReason).toBe('opponent_left');
  });

  it('spends elixir when a card is deployed', () => {
    const sim = new Simulation([...DEFAULT_DECK], [...DEFAULT_DECK], 1);
    const before = sim.getSnapshot('A').elixir.A;
    const card = sim.handOf('A')[0];
    const ok = sim.deploy('A', card, 5, 22); // A's own half (bottom)
    expect(ok.ok).toBe(true);
    const after = sim.getSnapshot('A').elixir.A;
    expect(after).toBeLessThan(before);
  });

  it('rejects deploying onto the enemy half', () => {
    const sim = new Simulation([...DEFAULT_DECK], [...DEFAULT_DECK], 1);
    const card = sim.handOf('A')[0];
    const res = sim.deploy('A', card, 5, 3); // top half belongs to B
    expect(res.ok).toBe(false);
  });
});
