/**
 * Guards the class of bug where a full-screen overlay is invisible but still
 * takes every tap.
 *
 * `.modal-overlay` is `position: fixed; inset: 0`, so anything that leaves it at
 * opacity 0 turns the whole screen into a dead zone with no visual cue. That is
 * exactly what happened: the base rule carried `opacity: 0` so openModal()'s
 * fade had somewhere to start from, and the two hand-built overlays — which
 * never ran the fade — stayed permanently transparent on top of the UI. Tapping
 * a card "did nothing".
 *
 * These tests assert the stylesheet contract, not the animation, because the
 * animation is what was missing in the broken path.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../primitives.css', import.meta.url)), 'utf8');
const uiSrc = readFileSync(fileURLToPath(new URL('../../ui.ts', import.meta.url)), 'utf8');

/** Extract the declarations of the first rule whose selector matches exactly. */
function ruleBody(selector: string): string {
  const re = new RegExp(`(^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  expect(m, `rule ${selector} not found in primitives.css`).toBeTruthy();
  return m![2];
}

describe('.modal-overlay', () => {
  it('covers the viewport', () => {
    const body = ruleBody('.modal-overlay');
    expect(body).toMatch(/position:\s*fixed/);
    expect(body).toMatch(/inset:\s*0/);
  });

  it('is NOT transparent by default', () => {
    // A viewport-covering element at opacity 0 is an invisible tap trap.
    const body = ruleBody('.modal-overlay');
    expect(body, 'opacity:0 here makes hand-built overlays swallow every tap')
      .not.toMatch(/opacity:\s*0\s*(;|$)/);
  });
});

describe('ui.ts modals', () => {
  it('builds no overlays by hand', () => {
    // Every modal must go through openModal(), which owns the veil, the
    // spring-in and the dismiss handling.
    expect(uiSrc, "use openModal() instead of div('modal-overlay')")
      .not.toMatch(/div\(\s*['"]modal-overlay/);
  });

  it('routes the card detail and season reward through openModal', () => {
    expect(uiSrc).toMatch(/function openCardDetail[\s\S]{0,2000}openModal\(/);
    expect(uiSrc).toMatch(/function showSeasonReward[\s\S]{0,2000}openModal\(/);
  });
});
