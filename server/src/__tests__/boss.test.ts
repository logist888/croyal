import { describe, it, expect, vi } from 'vitest';
import { BossRoom } from '../game/boss';
import {
  DEFAULT_DECK, DEFAULT_TRIO, BOSS_BASE_HP, BOSS_RAIDER_COOLDOWN_MULT,
  COOLDOWN_BATTLE_CONFIG, getCard,
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, RIVER_HALF_HEIGHT, BRIDGE_X,
  type BossSnapshot, type ServerMessage,
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

  it('leave+rejoin cannot wipe raider cooldowns', () => {
    const room = new BossRoom('clan5', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('u1', 'Raider', [...DEFAULT_TRIO], noop);
    room.join('u2', 'Buddy', [...DEFAULT_TRIO], noop); // keeps the raid alive
    room.deploy('u1', 'footman');
    const cd = room.cooldownOf('u1', 'footman');
    expect(cd).toBeGreaterThan(0);
    room.leave('u1');
    room.join('u1', 'Raider', [...DEFAULT_TRIO], noop);
    expect(room.cooldownOf('u1', 'footman')).toBeCloseTo(cd, 1);
    room.leave('u1');
    room.leave('u2');
  });

  it('difficulty drops back to solo when a raider leaves', () => {
    const room = new BossRoom('clan6', () => {});
    room.join('u1', 'One', [...DEFAULT_DECK], noop);
    room.join('u2', 'Two', [...DEFAULT_DECK], noop);
    expect(room.difficultyMultiplier).toBe(2);
    room.leave('u2');
    expect(room.difficultyMultiplier).toBe(1);
    room.leave('u1');
  });
});

describe('boss raid movement', () => {
  it('a raider unit crosses the river on a bridge, never on water', () => {
    vi.useFakeTimers();
    const snaps: BossSnapshot[] = [];
    const room = new BossRoom('clanMove', () => {}, COOLDOWN_BATTLE_CONFIG);
    room.join('u1', 'Raider', ['footman', 'archers', 'bastion'],
      (m: ServerMessage) => { if (m.t === 'boss') snaps.push(m.snapshot); });
    // Deploy on the raider's own half (below the river), off-centre.
    room.deploy('u1', 'footman', ARENA_WIDTH * 0.25, ARENA_HEIGHT - 4);
    vi.advanceTimersByTime(14000); // enough ticks to march up to (and across) the river

    let sawInBand = false;
    for (const s of snaps) {
      for (const e of s.entities) {
        if (e.id === 'boss' || e.kind !== 'unit') continue;
        if (Math.abs(e.y - RIVER_Y) <= RIVER_HALF_HEIGHT) {
          sawInBand = true;
          const onBridge = BRIDGE_X.some((bx) => Math.abs(e.x - bx) < 0.6);
          expect(onBridge).toBe(true); // inside the river band => must be on a bridge deck
        }
      }
    }
    expect(sawInBand).toBe(true); // it actually reached/entered the river
    room.leave('u1');
    vi.useRealTimers();
  });
});
