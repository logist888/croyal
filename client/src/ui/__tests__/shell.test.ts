/**
 * Navigation shell contract.
 *
 * The rule this guards is easy to break by copy-pasting a screen: a tab ROOT is
 * a sibling of the other tabs, so a "Back" button there duplicates its own tab
 * and implies a hierarchy that does not exist. Deep screens are the opposite —
 * they must keep a way out, because the bar cannot express "up".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const uiSrc = readFileSync(fileURLToPath(new URL('../../ui.ts', import.meta.url)), 'utf8');
const shellSrc = readFileSync(fileURLToPath(new URL('../shell.ts', import.meta.url)), 'utf8');
const glyphSrc = readFileSync(fileURLToPath(new URL('../glyphs.ts', import.meta.url)), 'utf8');

/** Source of a render function, from its declaration to the next one. */
function fnBody(name: string): string {
  const start = uiSrc.indexOf(`function ${name}(`);
  expect(start, `${name} not found in ui.ts`).toBeGreaterThan(-1);
  const next = uiSrc.slice(start + 1).search(/\n(?:export )?(?:async )?function /);
  return uiSrc.slice(start, next > -1 ? start + 1 + next : undefined);
}

/**
 * Screens the shell treats as a tab's own root, as [render function, SCREEN id].
 * Note these are screen ids (what setUI is given), not tab ids — TAB_ROOTS in
 * shell.ts is keyed by screen.
 */
const TAB_ROOTS: Array<[string, string]> = [
  ['renderMenu', 'menu'],
  ['renderShop', 'shop'],
  ['renderCollection', 'collection'],
  ['renderClans', 'clans'],
  ['renderEvents', 'events'],
];

/** Screens reached from a tab — these need their own way out. */
const DEEP = ['renderDaily', 'renderLeaderboard', 'renderWar', 'renderFriendly',
              'renderBattlePass', 'renderTrioPicker'];

describe('tab roots', () => {
  it.each(TAB_ROOTS)('%s renders no back button', (fn) => {
    expect(fnBody(fn), 'a back button on a tab root duplicates its own tab')
      .not.toMatch(/id="back"/);
  });

  it('every tab root is declared in the shell TAB_ROOTS set', () => {
    for (const [, screen] of TAB_ROOTS) {
      expect(shellSrc, `${screen} missing from TAB_ROOTS`).toMatch(
        new RegExp(`TAB_ROOTS = new Set\\(\\[[^\\]]*'${screen}'`, 's'));
    }
  });
});

describe('deep screens', () => {
  it.each(DEEP)('%s keeps a way out', (fn) => {
    expect(fnBody(fn), 'a deep screen with no back button is a dead end')
      .toMatch(/id="back"/);
  });
});

describe('shell wiring', () => {
  it('never shows the bar during a battle', () => {
    // A tab bar over a live match steals thumb space and invites a mis-tap that
    // would forfeit; the native back button is suppressed there for the same reason.
    for (const screen of ['battle', 'boss', 'replay', 'result', 'register', 'onboarding']) {
      expect(shellSrc, `${screen} must be in NO_SHELL`).toMatch(
        new RegExp(`NO_SHELL = new Set\\(\\[[^\\]]*'${screen}'`, 's'));
    }
  });

  it('draws tab icons from glyphs, never from the raster resolver', () => {
    // Icon() resolves through the asset manifest, and crown/star/clan_badge DO
    // have raster — a tab asking for one would get a painted webp beside four
    // flat vectors.
    expect(shellSrc).toMatch(/from '\.\/glyphs'/);
    expect(shellSrc, 'the bar must not use the raster icon helper')
      .not.toMatch(/\bIcon\(/);
  });

  it('has a glyph for every tab', () => {
    for (const id of ['shop', 'cards', 'arena', 'clan', 'events']) {
      expect(glyphSrc, `no glyph path for ${id}`).toMatch(new RegExp(`^\\s{2}${id}:`, 'm'));
    }
  });
});
