/**
 * Wires splitReward (boss-reward.test.ts covers the formula in isolation)
 * into a real BossRoom end to end: real combat damage, real finish(), real
 * bossEnd message. Confirms the per-participant reward map actually reaches
 * each raider's own userId rather than, say, silently applying to the wrong
 * seat or leaving a contributor's payout undefined.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BossRoom } from '../game/boss';
import {
  DEFAULT_TRIO, COOLDOWN_BATTLE_CONFIG, RIVER_Y, RIVER_HALF_HEIGHT, ARENA_WIDTH,
  BOSS_RAID_SECONDS, type BossResult, type ServerMessage,
} from '@croyal/shared';

afterEach(() => { vi.useRealTimers(); });

const RAIDER_Y = RIVER_Y + RIVER_HALF_HEIGHT + 2;

function seat() {
  let result: BossResult | null = null;
  const send = (m: ServerMessage) => { if (m.t === 'bossEnd') result = m.result; };
  return { send, result: () => result };
}

describe('boss raid payout (real room)', () => {
  it('a raider who actually fights earns more than one who never deploys', () => {
    vi.useFakeTimers();
    const carry = seat();
    const idle = seat();
    const room = new BossRoom('c-payout', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('carry', 'Carry', [...DEFAULT_TRIO], carry.send);
    room.join('idle', 'Idle', [...DEFAULT_TRIO], idle.send);

    // Only "carry" ever deploys — repeatedly, so it keeps damaging the boss
    // across the whole raid instead of one squad that dies once.
    for (let wave = 0; wave < 6; wave++) {
      for (const card of DEFAULT_TRIO) room.deploy('carry', card, ARENA_WIDTH / 2, RAIDER_Y);
      vi.advanceTimersByTime(25000);
    }
    vi.advanceTimersByTime((BOSS_RAID_SECONDS + 5) * 1000); // force the raid to end either way

    const result = carry.result();
    expect(result, 'raid must have finished and sent a result').not.toBeNull();
    const byId = new Map(result!.participants.map((p) => [p.userId, p]));
    const carryEntry = byId.get('carry')!;
    const idleEntry = byId.get('idle')!;

    expect(carryEntry.damageDealt).toBeGreaterThan(0);
    expect(idleEntry.damageDealt).toBe(0);
    expect(carryEntry.rewardGold).toBeGreaterThan(idleEntry.rewardGold);
    // The floor share means idle still gets something, not zero — free-riding
    // is discouraged, not punished into nothing.
    expect(idleEntry.rewardGold).toBeGreaterThan(0);

    // Both seats must see the identical result, each finding their own entry.
    expect(idle.result()).toEqual(result);
  });

  it('difficulty scaling reaches a large raid: 5 participants pay from a bigger pool than 1', () => {
    vi.useFakeTimers();
    const solo = seat();
    const soloRoom = new BossRoom('c-solo', () => {}, COOLDOWN_BATTLE_CONFIG);
    soloRoom.join('s1', 'Solo', [...DEFAULT_TRIO], solo.send);
    vi.advanceTimersByTime((BOSS_RAID_SECONDS + 5) * 1000);
    const soloResult = solo.result()!;
    expect(soloResult).not.toBeNull();

    vi.useRealTimers();
    vi.useFakeTimers();
    const seats = Array.from({ length: 5 }, () => seat());
    const room = new BossRoom('c-five', () => {}, COOLDOWN_BATTLE_CONFIG);
    seats.forEach((s, i) => room.join(`u${i}`, `U${i}`, [...DEFAULT_TRIO], s.send));
    expect(room.difficultyMultiplier).toBe(2.4); // BOSS_DIFFICULTY_TIERS: 4+ players -> 2.4x
    vi.advanceTimersByTime((BOSS_RAID_SECONDS + 5) * 1000);
    const fiveResult = seats[0].result()!;
    expect(fiveResult).not.toBeNull();

    const soloTotal = soloResult.participants.reduce((s, p) => s + p.rewardGold, 0);
    const fiveTotal = fiveResult.participants.reduce((s, p) => s + p.rewardGold, 0);
    expect(fiveTotal).toBeGreaterThan(soloTotal);
  });
});
