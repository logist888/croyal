import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain-JS build script, no type declarations
import { buildJobs, parseRoster, countByCategory, MASTER_STYLE } from '../../../scripts/art-jobs.mjs';
import { CARDS, TOKEN_UNITS } from '@croyal/shared';

interface Job {
  id: string;
  category: string;
  file: string;
  size: string;
  background: 'transparent' | 'opaque';
  prompt: string;
}

/**
 * The art pipeline is pure until the API call — the whole plan must be
 * verifiable offline: every asset the game can load has exactly one job,
 * and every prompt carries the master style for a consistent collection.
 */
describe('art job builder (scripts/art-jobs.mjs)', () => {
  const jobs: Job[] = buildJobs();
  const byCat = countByCategory(jobs) as Record<string, number>;

  it('produces the full asset plan with unique output paths', () => {
    expect(byCat).toEqual({
      cards: 80,
      units: 70, // 67 non-spell cards + 3 spawner tokens
      arena: 12, // 10 league arenas + hub_bg + splash
      towers: 2,
      boss: 1,
      fx: 16,
      ui: 43, // 42 icons + app_icon
      logo: 1,
    });
    expect(jobs.length).toBe(225);
    expect(new Set(jobs.map((j) => j.file)).size).toBe(jobs.length);
    for (const j of jobs) {
      expect(j.file, j.id).toMatch(new RegExp(`^art/incoming/${j.category}/${j.id}\\.png$`));
    }
  });

  it('every prompt starts with the MASTER STYLE prefix', () => {
    for (const j of jobs) {
      expect(j.prompt.startsWith(MASTER_STYLE), `${j.category}/${j.id}`).toBe(true);
    }
  });

  it('covers all 80 catalog cards; spells get no unit cutout; tokens do', () => {
    const cardJobs = new Set(jobs.filter((j) => j.category === 'cards').map((j) => j.id));
    const unitJobs = new Set(jobs.filter((j) => j.category === 'units').map((j) => j.id));
    for (const [id, c] of Object.entries(CARDS)) {
      expect(cardJobs.has(id), `card portrait for ${id}`).toBe(true);
      expect(unitJobs.has(id), `unit cutout for ${id}`).toBe(c.type !== 'spell');
    }
    for (const id of Object.keys(TOKEN_UNITS)) {
      expect(unitJobs.has(id), `token cutout for ${id}`).toBe(true);
      expect(cardJobs.has(id), `tokens are not collectible cards: ${id}`).toBe(false);
    }
  });

  it('sizes and transparency follow the spec', () => {
    for (const j of jobs) {
      expect(['1024x1024', '1024x1536', '1536x1024']).toContain(j.size);
      if (j.category === 'units' || j.category === 'fx' || j.category === 'towers' || j.category === 'boss') {
        // Square single frames: the renderer treats square-ish images as ONE
        // frame (not a sprite sheet), and cutouts must be transparent.
        expect(j.size, j.id).toBe('1024x1024');
        expect(j.background, j.id).toBe('transparent');
      }
      if (j.category === 'arena') expect(j.background, j.id).toBe('opaque');
      if (j.category === 'cards') expect(j.size, j.id).toBe('1024x1536');
    }
  });

  it('roster parser agrees with the shared catalog on types (spell vs unit)', () => {
    const roster = parseRoster() as Array<{ id: string; type: string }>;
    expect(roster.length).toBe(80);
    for (const r of roster) {
      expect(CARDS[r.id]?.type, r.id).toBe(r.type);
    }
  });
});
