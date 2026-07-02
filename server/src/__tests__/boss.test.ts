import { describe, it, expect } from 'vitest';
import { BossRoom } from '../game/boss';
import {
  DEFAULT_DECK, DEFAULT_TRIO, BOSS_BASE_HP, BOSS_RAIDER_COOLDOWN_MULT,
  COOLDOWN_BATTLE_CONFIG, getCard,
} from '@croyal/shared';

const noop = () => {};

describe('clan boss co-op difficulty', () => {
  it('keeps base difficulty for a single player', () => {
    const room = new BossRoom('clan1', () => {});
    room.join('u1', 'Solo', [...DEFAULT_DECK], noop);
    expect(room.difficultyMultiplier).toBe(1);
    expect(room.bossMaxHpValue).toBe(BOSS_BASE_HP);
    room.leave('u1'); // stop the loop
  });

  it('DOUBLES difficulty when 2+ players raid together', () => {
    const room = new BossRoom('clan2', () => {});
    room.join('u1', 'One', [...DEFAULT_DECK], noop);
    room.join('u2', 'Two', [...DEFAULT_DECK], noop);
    expect(room.difficultyMultiplier).toBe(2);
    expect(room.bossMaxHpValue).toBe(BOSS_BASE_HP * 2);
    room.leave('u1');
    room.leave('u2');
  });
});

describe('boss raid cooldown economy', () => {
  it('raider cooldowns run x1.5 long (the only allowed cooldown asymmetry)', () => {
    const room = new BossRoom('clan3', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('u1', 'Raider', [...DEFAULT_TRIO], noop);
    room.deploy('u1', 'footman'); // coordinate-free: server picks the raider band spot
    expect(room.cooldownOf('u1', 'footman'))
      .toBeCloseTo(getCard('footman')!.cooldownSec * BOSS_RAIDER_COOLDOWN_MULT, 5);
    room.leave('u1');
  });

  it('rejects a play while that card is recharging', () => {
    const room = new BossRoom('clan4', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('u1', 'Raider', [...DEFAULT_TRIO], noop);
    room.deploy('u1', 'archers');
    const before = room.cooldownOf('u1', 'archers');
    room.deploy('u1', 'archers'); // must be a no-op
    expect(room.cooldownOf('u1', 'archers')).toBe(before);
    room.leave('u1');
  });
});
