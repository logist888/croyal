/**
 * Deploy-zone rules shared by the authoritative server (`simulation.deploy`) and
 * the client's drag preview, so both agree on where a card may be placed.
 * Coordinates are in tiles.
 */
import { ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, RIVER_HALF_HEIGHT, type Side } from './constants';

/**
 * Which enemy princess towers are down — each opens deployment in the matching
 * lane of the enemy half. `left` = the tower on the left half (x < width/2).
 */
export interface EnemyTowersDown {
  left: boolean;
  right: boolean;
}

/** Within the playable field (spells may target anywhere inside it). */
export function isWithinField(x: number, y: number): boolean {
  return x >= 0.5 && x <= ARENA_WIDTH - 0.5 && y >= 0.5 && y <= ARENA_HEIGHT - 0.5;
}

/**
 * Whether `side` may deploy a troop/building at (x, y): inside the field, on your
 * own half, or — once an enemy princess tower falls — in that tower's lane on the
 * enemy half.
 */
export function canDeployTroop(side: Side, x: number, y: number, enemyDown: EnemyTowersDown): boolean {
  if (!isWithinField(x, y)) return false;
  const ownHalf = side === 'A' ? y > RIVER_Y + RIVER_HALF_HEIGHT : y < RIVER_Y - RIVER_HALF_HEIGHT;
  if (ownHalf) return true;
  const onLeft = x < ARENA_WIDTH / 2;
  if (onLeft && enemyDown.left) return true;
  if (!onLeft && enemyDown.right) return true;
  return false;
}
