import { describe, it, expect } from 'vitest';
import { splitReward } from '../game/boss';

/**
 * Boss raid payout, weighted by damage share.
 *
 * The old formula (`rewardGold: outcome==='win' ? 200*multiplier : 25`) paid
 * every participant the identical flat amount regardless of `damageDealt`,
 * which was already tracked for the UI leaderboard — a player who dealt zero
 * damage got exactly as much gold as the top contributor. splitReward fixes
 * that: REWARD_FLOOR_SHARE (40%) of the pool is split evenly so a low
 * contributor isn't punished to zero, the rest is weighted by damage share.
 */
describe('splitReward', () => {
  it('a zero-damage rider gets less than a full contributor, but not zero', () => {
    const pool = 1000;
    const result = splitReward(pool, [
      { userId: 'idle', damageDealt: 0 },
      { userId: 'carry', damageDealt: 100 },
    ]);
    expect(result.get('idle')!).toBeGreaterThan(0);
    expect(result.get('carry')!).toBeGreaterThan(result.get('idle')!);
  });

  it('equal damage means an equal split', () => {
    const result = splitReward(1000, [
      { userId: 'a', damageDealt: 50 },
      { userId: 'b', damageDealt: 50 },
    ]);
    expect(result.get('a')).toBe(result.get('b'));
  });

  it('the top damage dealer earns strictly more than an equal 50/50 split would give', () => {
    // 90% of the damage should out-earn the naive "pool / n" everyone used to get.
    const pool = 1000;
    const result = splitReward(pool, [
      { userId: 'carry', damageDealt: 900 },
      { userId: 'support', damageDealt: 100 },
    ]);
    expect(result.get('carry')!).toBeGreaterThan(pool / 2);
  });

  it('falls back to an even split when nobody dealt any damage (no division by zero)', () => {
    const result = splitReward(1000, [
      { userId: 'a', damageDealt: 0 },
      { userId: 'b', damageDealt: 0 },
      { userId: 'c', damageDealt: 0 },
    ]);
    expect(result.get('a')).toBe(result.get('b'));
    expect(result.get('b')).toBe(result.get('c'));
    expect(result.get('a')!).toBeGreaterThan(0);
  });

  it('an empty raid splits nothing and does not throw', () => {
    expect(splitReward(1000, [])).toEqual(new Map());
  });

  it('never pays out more than the pool in total', () => {
    const result = splitReward(1000, [
      { userId: 'a', damageDealt: 700 },
      { userId: 'b', damageDealt: 200 },
      { userId: 'c', damageDealt: 100 },
    ]);
    const total = [...result.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeLessThanOrEqual(1000);
  });
});
