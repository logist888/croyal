import { describe, it, expect } from 'vitest';
import { canDeployTroop, isWithinField, ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y } from '@croyal/shared';

const NONE = { left: false, right: false };

describe('deploy zones (shared client/server rule)', () => {
  it('allows your own half', () => {
    expect(canDeployTroop('A', 9, ARENA_HEIGHT - 5, NONE)).toBe(true); // A bottom half
    expect(canDeployTroop('B', 9, 5, NONE)).toBe(true); // B top half
  });

  it('forbids the enemy half while both princess towers stand', () => {
    expect(canDeployTroop('A', 9, 5, NONE)).toBe(false); // A into top
    expect(canDeployTroop('B', 9, ARENA_HEIGHT - 5, NONE)).toBe(false);
  });

  it('forbids the river strip itself', () => {
    expect(canDeployTroop('A', 9, RIVER_Y, NONE)).toBe(false);
  });

  it('opens only the lane whose enemy princess tower is down', () => {
    const leftOnly = { left: true, right: false };
    expect(canDeployTroop('A', 3, 6, leftOnly)).toBe(true); // left lane, enemy half
    expect(canDeployTroop('A', ARENA_WIDTH - 3, 6, leftOnly)).toBe(false); // right lane still closed
  });

  it('rejects out-of-bounds positions', () => {
    expect(canDeployTroop('A', -1, 20, NONE)).toBe(false);
    expect(canDeployTroop('A', 9, ARENA_HEIGHT + 5, NONE)).toBe(false);
    expect(isWithinField(0, 0)).toBe(false);
    expect(isWithinField(9, 15)).toBe(true);
  });
});
