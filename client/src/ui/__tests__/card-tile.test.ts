/**
 * CardTile markup contract.
 *
 * The `background:` regression this guards against was invisible to typecheck,
 * to the tests that existed, and to a glance at the code: an inline `background:`
 * shorthand on `.ct-art` resets background-size/position to their initial values
 * and outranks the stylesheet, so `background-size: cover` stopped applying and
 * every portrait rendered zoomed into its top-left corner. Only a rendered
 * screenshot caught it.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// The tile reads art URLs and localised names; stub both so this stays a pure
// markup test with no manifest or DOM dependency.
vi.mock('../../assets', () => ({
  cardImageUrl: (id: string) => `/assets/cards/${id}.webp`,
}));
vi.mock('../../i18n', () => ({
  cardName: (id: string) => id,
}));

let cardTileHtml: typeof import('../card-tile')['cardTileHtml'];
let firstCardId: string;

beforeAll(async () => {
  cardTileHtml = (await import('../card-tile')).cardTileHtml;
  const { ALL_CARD_IDS } = await import('@croyal/shared');
  firstCardId = ALL_CARD_IDS[0];
});

/** Pull the inline style off the `.ct-art` layer. */
function artStyle(html: string): string {
  return html.match(/class="ct-art"[^>]*style="([^"]*)"/)?.[1] ?? '';
}

describe('cardTileHtml', () => {
  it('never uses the `background` shorthand on the art layer', () => {
    for (const opts of [
      { cardId: firstCardId },
      { cardId: firstCardId, lazy: true },
      { cardId: firstCardId, size: 'lg' as const, showCost: false },
    ]) {
      const style = artStyle(cardTileHtml(opts));
      expect(style, `shorthand would reset background-size for ${JSON.stringify(opts)}`)
        .not.toMatch(/(^|;)\s*background\s*:/);
      expect(style).toMatch(/background-image\s*:/);
    }
  });

  it('paints the portrait immediately when not lazy', () => {
    const html = cardTileHtml({ cardId: firstCardId });
    expect(artStyle(html)).toContain(`/assets/cards/${firstCardId}.webp`);
    expect(html).not.toContain('data-art=');
  });

  it('defers the portrait behind data-art when lazy', () => {
    const html = cardTileHtml({ cardId: firstCardId, lazy: true });
    expect(html).toContain(`data-art="/assets/cards/${firstCardId}.webp"`);
    // The visible style must be the placeholder, not the portrait.
    expect(artStyle(html)).not.toContain('url(');
    expect(artStyle(html)).toContain('linear-gradient');
  });

  it('always renders the elixir cost unless explicitly suppressed', () => {
    // Regression guard: the old hand renderer blanked the tile when art existed,
    // so a player could not see what a card cost mid-battle.
    expect(cardTileHtml({ cardId: firstCardId })).toContain('ct-cost');
    expect(cardTileHtml({ cardId: firstCardId, showCost: false })).not.toContain('ct-cost');
  });

  it('exposes rarity and state as data attributes for the CSS frame', () => {
    const html = cardTileHtml({ cardId: firstCardId, state: 'locked' });
    expect(html).toMatch(/data-rarity="(common|rare|epic|legendary)"/);
    expect(html).toContain('data-state="locked"');
  });

  it('escapes the card id it echoes back into the markup', () => {
    const html = cardTileHtml({ cardId: firstCardId, costText: '<img src=x>' });
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img');
  });

  it('returns nothing for an unknown card rather than throwing', () => {
    expect(cardTileHtml({ cardId: 'no_such_card' })).toBe('');
  });
});
