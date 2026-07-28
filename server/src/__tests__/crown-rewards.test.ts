import { describe, it, expect } from 'vitest';
import { trophyReward, goldReward } from '../game/match';

/**
 * Trophy/gold reward scaled by crowns (towers destroyed by the side being
 * paid), replacing the old flat ±30 / 50-10.
 *
 * The design is deliberately not zero-sum — the average win pays out more
 * than the average loss costs — so the table values themselves are the
 * tuning knob; this test locks the intended shape (monotonic in crowns,
 * losses always negative, wins always positive) rather than exact numbers,
 * except for the one value the reward curve was explicitly anchored to: a
 * 1-crown loss costs exactly 10 trophies.
 */
describe('trophyReward', () => {
  it('a 1-crown loss costs exactly 10 trophies (the anchor value)', () => {
    expect(trophyReward(false, 1)).toBe(-10);
  });

  it('is monotonically increasing in crowns for a win', () => {
    const wins = [0, 1, 2, 3].map((c) => trophyReward(true, c));
    for (let i = 1; i < wins.length; i++) expect(wins[i]).toBeGreaterThan(wins[i - 1]);
    expect(wins.every((v) => v > 0)).toBe(true);
  });

  it('a losing side that took more towers loses fewer trophies', () => {
    const losses = [0, 1, 2, 3].map((c) => trophyReward(false, c));
    for (let i = 1; i < losses.length; i++) expect(losses[i]).toBeGreaterThan(losses[i - 1]);
    expect(losses.every((v) => v < 0)).toBe(true);
  });

  it('a full 3-crown win outscores any loss outcome', () => {
    const maxLoss = Math.max(...[0, 1, 2, 3].map((c) => trophyReward(false, c)));
    expect(trophyReward(true, 3)).toBeGreaterThan(maxLoss);
  });

  it('clamps out-of-range crown counts instead of throwing', () => {
    expect(trophyReward(true, 99)).toBe(trophyReward(true, 3));
    expect(trophyReward(false, -1)).toBe(trophyReward(false, 0));
  });
});

describe('goldReward', () => {
  it('is always positive and monotonically increasing in crowns, win or lose', () => {
    for (const isWinner of [true, false]) {
      const vals = [0, 1, 2, 3].map((c) => goldReward(isWinner, c));
      expect(vals.every((v) => v > 0)).toBe(true);
      for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    }
  });

  it('the worst win still pays more gold than the best loss', () => {
    expect(goldReward(true, 0)).toBeGreaterThan(goldReward(false, 3));
  });
});
