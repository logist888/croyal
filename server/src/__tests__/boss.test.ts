import { describe, it, expect } from 'vitest';
import { BossRoom } from '../game/boss';
import { DEFAULT_DECK, BOSS_BASE_HP } from '@croyal/shared';

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
