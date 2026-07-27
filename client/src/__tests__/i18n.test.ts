/**
 * `t()` falls back to EN and then to the raw key, so a missing translation is
 * silent: the UI just renders "common.ok". These two dictionaries are ~300 keys
 * of hand-maintained parallel text, which is exactly the shape that drifts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../i18n.ts', import.meta.url)), 'utf8');

/** Pull the keys of a top-level `const NAME: ... = { ... }` dictionary. */
function keysOf(name: string): string[] {
  const start = src.indexOf(`const ${name}`);
  expect(start, `dictionary ${name} not found`).toBeGreaterThan(-1);
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(open, end);
  // Several entries share a line ("'chest.h': 'h', 'chest.m': 'm', …"), so this
  // must not be anchored to the start of a line.
  return [...body.matchAll(/'([a-z][\w.]*)'\s*:/gi)].map((m) => m[1]);
}

describe('i18n dictionaries', () => {
  const en = keysOf('EN');
  const ru = keysOf('RU');

  it('finds both dictionaries', () => {
    expect(en.length).toBeGreaterThan(100);
    expect(ru.length).toBeGreaterThan(100);
  });

  it('has no duplicate keys', () => {
    expect(new Set(en).size, 'EN has duplicates').toBe(en.length);
    expect(new Set(ru).size, 'RU has duplicates').toBe(ru.length);
  });

  it('RU covers every EN key', () => {
    const missing = en.filter((k) => !ru.includes(k));
    expect(missing, `keys missing from RU: ${missing.join(', ')}`).toEqual([]);
  });

  it('EN covers every RU key, except card names', () => {
    // `card.*` is intentionally RU-only: cardName() falls back to the English
    // name carried by the shared catalog, so EN entries would be duplicates.
    const extra = ru.filter((k) => !en.includes(k) && !k.startsWith('card.'));
    expect(extra, `keys missing from EN: ${extra.join(', ')}`).toEqual([]);
  });

  it('every key used via t() exists in EN', () => {
    const files = ['ui.ts', 'battle.ts', 'boss.ts', 'hud.ts', 'onboarding.ts', 'replay.ts', 'tournament.ts', 'main.ts'];
    const used = new Set<string>();
    for (const f of files) {
      const body = readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');
      for (const m of body.matchAll(/\bt\('([^']+)'/g)) used.add(m[1]);
    }
    // Keys built dynamically (e.g. t(`chest.rarity.${r}`)) are not matched by
    // the literal regex above, so this only ever reports real static misses.
    const missing = [...used].filter((k) => !en.includes(k));
    expect(missing, `t() keys with no EN entry: ${missing.join(', ')}`).toEqual([]);
  });
});
