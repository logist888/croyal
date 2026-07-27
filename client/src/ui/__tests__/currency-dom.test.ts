// @vitest-environment jsdom
/**
 * The repaint itself, in a real DOM.
 *
 * Companion to currency.test.ts, which asserts the same contract against the
 * source text. Split by environment: that one needs `import.meta.url` to be a
 * file URL (node), this one needs a document (jsdom).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currencyChip, refreshCurrencies } from '../primitives';

describe('currencyChip', () => {
  it('stamps data-cur so refreshCurrencies can find it', () => {
    const html = currencyChip('gold', 1234);
    expect(html).toContain('data-cur="gold"');
    expect(html).toContain('<b>1234</b>');
  });
});

describe('refreshCurrencies', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('updates every chip on the page, whatever its skin', async () => {
    document.body.innerHTML =
      currencyChip('gold', 100) + currencyChip('gold', 100, { cls: 'hub-pill' })
      + currencyChip('gems', 5);

    refreshCurrencies({ trophies: 0, gold: 250, gems: 9 });

    // countTo tweens, so the final value lands a frame or two later.
    await vi.waitFor(() => {
      const golds = [...document.querySelectorAll('[data-cur="gold"] b')];
      expect(golds).toHaveLength(2);
      for (const el of golds) expect(el.textContent).toBe('250');
      expect(document.querySelector('[data-cur="gems"] b')!.textContent).toBe('9');
    });
  });

  it('ignores a currency that is not on screen', () => {
    // The hub shows three, the collection shows one — a missing chip is normal,
    // not an error.
    document.body.innerHTML = currencyChip('gold', 7);
    expect(() => refreshCurrencies({ trophies: 1, gold: 7, gems: 2 })).not.toThrow();
  });
});
