import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEAGUES, LEAGUE_ARENA, arenaForTrophies } from '@croyal/shared';

/** Each league battles on its own arena; every mapped arena must be a real asset id. */
describe('arena per league', () => {
  it('LEAGUE_ARENA aligns 1:1 with LEAGUES', () => {
    expect(LEAGUE_ARENA.length).toBe(LEAGUES.length);
    expect(new Set(LEAGUE_ARENA).size).toBe(LEAGUE_ARENA.length); // distinct
  });

  it('arenaForTrophies returns the right arena at each league threshold', () => {
    for (let i = 0; i < LEAGUES.length; i++) {
      expect(arenaForTrophies(LEAGUES[i].min)).toBe(LEAGUE_ARENA[i]);
    }
    expect(arenaForTrophies(0)).toBe('arena_training');
    expect(arenaForTrophies(999999)).toBe('arena_legend');
    expect(arenaForTrophies(-50)).toBe('arena_training'); // below floor clamps to first
  });

  it('every league arena exists in the sliced asset manifest', () => {
    const path = fileURLToPath(new URL('../../../client/public/assets/manifest.json', import.meta.url));
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    for (const id of LEAGUE_ARENA) {
      expect(manifest.arena[id], `missing arena asset ${id}`).toBeTruthy();
    }
  });
});
