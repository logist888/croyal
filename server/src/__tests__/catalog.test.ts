import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CARDS, TOKEN_UNITS, ALL_CARD_IDS, getCard, THEMES,
  type CardDef,
} from '@croyal/shared';

/**
 * The 80-card catalog is the single source of truth for gameplay, and
 * docs/ART_PROMPT.ru.md (the roster used to generate every art asset) must
 * stay in lockstep with it — an id mismatch means art that can never load.
 */

interface RosterRow {
  id: string;
  name: string;
  rarity: string; // C/R/E/L
  type: string;
  cost: number;
}

const RARITY_BY_LETTER: Record<string, string> = {
  C: 'common', R: 'rare', E: 'epic', L: 'legendary',
};

function parseRoster(): RosterRow[] {
  const path = fileURLToPath(new URL('../../../docs/ART_PROMPT.ru.md', import.meta.url));
  const md = readFileSync(path, 'utf8');
  // Section 4 only — later sections (arenas, VFX, UI) have their own tables.
  const start = md.indexOf('## 4.');
  const end = md.indexOf('## 5.', start);
  const rows: RosterRow[] = [];
  for (const line of md.slice(start, end).split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // | id | Name | R | Type | Role | Cost | Visual | -> 9 cells with the outer empties
    if (cells.length < 8) continue;
    const id = cells[1];
    if (!/^[a-z][a-z0-9_]*$/.test(id) || id === 'id') continue;
    rows.push({ id, name: cells[2], rarity: cells[3], type: cells[4], cost: Number(cells[6]) });
  }
  return rows;
}

const roster = parseRoster();

describe('catalog <-> ART_PROMPT roster', () => {
  it('the roster has exactly 80 unique ids', () => {
    expect(roster.length).toBe(80);
    expect(new Set(roster.map((r) => r.id)).size).toBe(80);
  });

  it('catalog ids match the roster exactly (no missing, no extra)', () => {
    const catalogIds = new Set(Object.keys(CARDS));
    const rosterIds = new Set(roster.map((r) => r.id));
    expect(catalogIds.size).toBe(80);
    const missing = [...rosterIds].filter((id) => !catalogIds.has(id));
    const extra = [...catalogIds].filter((id) => !rosterIds.has(id));
    expect(missing, `catalog is missing roster cards: ${missing.join(', ')}`).toEqual([]);
    expect(extra, `catalog has cards not in the roster: ${extra.join(', ')}`).toEqual([]);
  });

  it('name, rarity, type and cost agree with the roster row by row', () => {
    for (const row of roster) {
      const c = CARDS[row.id];
      expect(c.name, row.id).toBe(row.name);
      expect(c.rarity, row.id).toBe(RARITY_BY_LETTER[row.rarity]);
      expect(c.type, row.id).toBe(row.type);
      expect(c.cost, row.id).toBe(row.cost);
    }
  });
});

describe('catalog structural invariants', () => {
  const all: CardDef[] = [...Object.values(CARDS), ...Object.values(TOKEN_UNITS)];

  it('every card recharges within the designed 3..16s window', () => {
    for (const c of all) {
      expect(c.cooldownSec, c.id).toBeGreaterThanOrEqual(3);
      expect(c.cooldownSec, c.id).toBeLessThanOrEqual(16);
    }
  });

  it('troops and buildings have combat stats; spells have spell stats', () => {
    for (const c of all) {
      if (c.type === 'spell') {
        expect(c.spellRadius, c.id).toBeGreaterThan(0);
        // A spell must DO something: damage, or a status/utility effect.
        expect((c.spellDamage ?? 0) > 0 || c.effect !== undefined, c.id).toBe(true);
      } else {
        expect(c.hp, c.id).toBeGreaterThan(0);
        expect(c.damage ?? 0, c.id).toBeGreaterThanOrEqual(0);
        expect(c.hitSpeed, c.id).toBeGreaterThan(0);
        expect(c.range, c.id).toBeGreaterThan(0);
        if (c.type === 'troop') expect(c.moveSpeed, c.id).toBeGreaterThan(0);
      }
    }
  });

  it('ALL_CARD_IDS is the collection only — spawner tokens live outside it', () => {
    expect(ALL_CARD_IDS.length).toBe(80);
    for (const id of Object.keys(TOKEN_UNITS)) {
      expect(ALL_CARD_IDS.includes(id), id).toBe(false);
      expect(getCard(id)?.id, 'getCard must still resolve tokens').toBe(id);
    }
  });

  it('every spawner ability points at a resolvable token unit', () => {
    for (const c of all) {
      if (c.ability?.kind !== 'spawner') continue;
      const unit = getCard(c.ability.unit);
      expect(unit, `${c.id} spawns unknown unit ${c.ability.unit}`).toBeTruthy();
      expect(unit!.type, c.ability.unit).toBe('troop');
    }
  });

  it('every theme brings at least one anti-air answer', () => {
    for (const theme of THEMES) {
      const antiAir = theme.cardIds.filter((id) => {
        const c = CARDS[id];
        return c.type !== 'spell' && (c.targets === 'both' || c.targets === 'air');
      });
      expect(antiAir.length, `${theme.theme} has no anti-air`).toBeGreaterThanOrEqual(1);
    }
  });
});
