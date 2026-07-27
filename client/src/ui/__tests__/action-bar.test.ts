/**
 * The trio picker's Save must be reachable without scrolling.
 *
 * It used to be the last row of an 80-card grid: pick your three at the top,
 * then scroll the entire catalogue to confirm a decision you had already made.
 * Measured in a real browser, the button sat ~4600px down the page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const uiSrc = readFileSync(fileURLToPath(new URL('../../ui.ts', import.meta.url)), 'utf8');
const css = readFileSync(fileURLToPath(new URL('../primitives.css', import.meta.url)), 'utf8');

/** Source of renderTrioPicker, to the next top-level function. */
const trio = (() => {
  const start = uiSrc.indexOf('function renderTrioPicker(');
  const next = uiSrc.slice(start + 1).search(/\n(?:export )?(?:async )?function /);
  return uiSrc.slice(start, next > -1 ? start + 1 + next : undefined);
})();

describe('trio picker', () => {
  it('puts save in the sticky action bar', () => {
    expect(trio).toMatch(/class="action-bar"[\s\S]*?id="save"/);
  });

  it('keeps the error and pair hint with the button', () => {
    // All three describe the same selection; splitting them would put feedback
    // off-screen while the control that acts on it stays pinned.
    const bar = trio.slice(trio.indexOf('class="action-bar"'), trio.indexOf('</div>\n  `'));
    expect(bar).toMatch(/id="pair-hint"/);
    expect(bar).toMatch(/id="err"/);
  });
});

describe('.action-bar', () => {
  const rule = css.slice(css.indexOf('.action-bar {'), css.indexOf('body.has-nav .action-bar'));

  it('is sticky, never fixed', () => {
    // setUI() translates .screen during the transition, and a transformed
    // ancestor becomes the containing block for a fixed child — it would drift
    // across the screen on every navigation.
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).not.toMatch(/position:\s*fixed/);
  });

  it('clears the nav bar when one is present', () => {
    expect(css).toMatch(/body\.has-nav \.action-bar \{ bottom: calc\(var\(--nav-h\)/);
  });

  it('clears the safe area even with no nav bar', () => {
    expect(rule).toMatch(/bottom:\s*var\(--sa-bottom\)/);
  });

  it('cancels the extra screen padding so it does not hop at the end of a list', () => {
    // body.has-nav adds --s-7 beyond the bar height; without cancelling it the
    // resting position sits 16px above the sticky one and the bar jumps.
    expect(rule).toMatch(/margin:[^;]*calc\(var\(--s-7\) \* -1\)\s*;/);
  });

  it('has the same opaque fallback as the nav bar', () => {
    expect(css).toMatch(/@supports not \(\(backdrop-filter[\s\S]*?\.action-bar \{ background: var\(--glass-solid\)/);
    expect(css).toMatch(/html\.low-end \.action-bar/);
  });
});
