/**
 * Vector glyphs drawn in code.
 *
 * The repo ships 40 raster UI icons, and none of them is a shop, a deck, an
 * arena, a clan or an events marker — the five things a tab bar needs. No new
 * art is being commissioned, so these are paths.
 *
 * They deliberately do NOT go through `Icon()`. That helper resolves through the
 * asset manifest first, and `crown`, `star` and `clan_badge` DO have raster — so
 * a tab asking for one of those would silently get a painted 64px webp next to
 * four flat vectors. Keeping glyphs in their own module makes that impossible
 * rather than merely discouraged.
 *
 * Every glyph is filled with `currentColor` and carries a dark keyline with
 * `paint-order: stroke fill` — the same treatment style.css already gives h1/h2.
 * That is what relates them to this game's display type instead of making them
 * look borrowed from iOS.
 */

export type GlyphId =
  | 'shop' | 'cards' | 'arena' | 'clan' | 'events'
  | 'plus' | 'chevron' | 'swords' | 'rosette';

/** 24x24 path data. Filled shapes only — no strokes-as-shapes. */
const PATHS: Record<GlyphId, string> = {
  // A market awning: body plus a three-scallop canopy.
  shop:
    '<path d="M3.6 9.4h16.8l-1.15 9.8a2 2 0 0 1-2 1.8H6.75a2 2 0 0 1-2-1.8L3.6 9.4Z"/>'
    + '<path d="M3 9.4c1.5-2.6 3-4 4.3-4s2 1.4 1.6 4Zm6 0c.6-2.6 1.5-4 2.9-4s2.3 1.4 2.9 4Zm5.8 0'
    + 'c-.4-2.6.3-4 1.6-4s2.8 1.4 4.3 4Z"/>',
  // Three fanned cards — literally the battle trio.
  cards:
    '<g transform="rotate(-10 7.2 13)"><rect x="3.6" y="7.2" width="6.4" height="9.8" rx="1.6"/></g>'
    + '<rect x="8.8" y="6.5" width="6.4" height="9.8" rx="1.6"/>'
    + '<g transform="rotate(10 16.8 13)"><rect x="13.9" y="7.2" width="6.4" height="9.8" rx="1.6"/></g>',
  // A castle gate with the doorway knocked out. Not a crown: crown.webp already
  // means "tower destroyed" in this game, and a gate echoes hub_bg.
  arena:
    '<path d="M5 21V8.6l3-2V4.1h2.1v1.4h3.8V4.1H16v2.5l3 2V21h-4.9v-4.2a2.1 2.1 0 0 0-4.2 0V21Z"/>',
  clan:
    '<path d="M12 2.7 20 5.9v6.5c0 4.4-3.3 7.6-8 9.2-4.7-1.6-8-4.8-8-9.2V5.9Z"/>',
  // A pennant. The silhouette is deliberately unlike the shield next to it.
  events:
    '<path d="M5.6 2.6h1.9V21.6H5.6Z"/><path d="M8.4 4h10.7l-2.9 3.8 2.9 3.8H8.4Z"/>',

  plus: '<path d="M10.7 4h2.6v6.7H20v2.6h-6.7V20h-2.6v-6.7H4v-2.6h6.7Z"/>',
  chevron: '<path d="M9.3 4.6 16.7 12l-7.4 7.4-1.9-1.9L12.9 12 7.4 6.5Z"/>',
  swords:
    '<path d="M3.4 4.3 6 4.4l11 11-2.6 2.6-11-11Zm17.2 0-.1 2.6-11 11L6.9 15.3l11-11Z"/>',
  // A rosette for daily quests — a target read without borrowing the emoji.
  rosette:
    '<path d="M12 2.6 14 6l3.7-.9-.9 3.7 3.4 2-3.4 2 .9 3.7-3.7-.9-2 3.4-2-3.4-3.7.9.9-3.7-3.4-2'
    + ' 3.4-2-.9-3.7 3.7.9Z"/><circle cx="12" cy="12" r="2.6" fill="none"/>',
};

/**
 * Inline SVG markup for a glyph. `px` is the rendered box; 26 is the bar size
 * (filled-plus-keyline needs 2px more than a plain 24 to read at the same size).
 */
export function Glyph(id: GlyphId, px = 26): string {
  return `<svg class="glyph" viewBox="0 0 24 24" width="${px}" height="${px}" `
    + `aria-hidden="true" focusable="false">${PATHS[id]}</svg>`;
}

export const GLYPH_IDS = Object.keys(PATHS) as GlyphId[];
