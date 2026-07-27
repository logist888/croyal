/**
 * The TypeScript half of the design tokens.
 *
 * `tokens.css` owns the DOM side; this file mirrors the same values as 0xRRGGBB
 * numbers for Phaser, which cannot read CSS custom properties. `tokens.test.ts`
 * asserts the two stay in sync, so add a colour to one and you must add it to
 * the other.
 */
import { RARITY_COLOR } from '@croyal/shared';

/** Palette as Phaser-friendly 0xRRGGBB numbers. Mirrors the `--c-*` layer. */
export const COLOR = {
  greenBg1: 0x2c6b2c,
  greenBg2: 0x1c4a1c,
  greenBg3: 0x123012,
  grass1: 0x3a8f3a,
  grass2: 0x1f5e1f,

  wood400: 0x7a5536,
  wood600: 0x4e3621,
  wood900: 0x2e2013,

  gold200: 0xffe082,
  gold300: 0xffd866,
  gold500: 0xf5a623,
  gold800: 0x9c6510,

  blue400: 0x42a5f5,
  blue500: 0x36b6f6,
  blue800: 0x1565c0,

  red500: 0xef5f5f,
  red700: 0xc62828,

  elixir: 0xd500f9,
  white: 0xffffff,
  black: 0x000000,
  ink: 0x0a0e14,

  /** HP bar thresholds (>50% / >25% / rest). */
  hpHigh: 0x4caf50,
  hpMid: 0xffb300,
  hpLow: 0xe53935,
} as const;

/** Status → sprite tint, priority order (first present wins). */
export const STATUS_TINT: ReadonlyArray<readonly [string, number]> = [
  ['stun', 0xaad4ff],
  ['root', 0xaad4ff],
  ['slow', 0x74b9ff],
  ['poison', 0x81c784],
  ['rage', 0xffa726],
];

/** Motion durations in ms — mirrors `--dur-*`. */
export const DUR = { d1: 80, d2: 140, d3: 220, d4: 360, d5: 600 } as const;

/** Easing curves — mirrors `--ease-*`. Tuples are cubic-bezier control points. */
export const EASE = {
  out: [0.22, 1, 0.36, 1] as const,
  in: [0.55, 0, 1, 0.45] as const,
  backOut: [0.34, 1.56, 0.64, 1] as const,
};

/** `[0.22,1,0.36,1]` → `"cubic-bezier(0.22,1,0.36,1)"`. */
export const bezier = (e: readonly number[]): string => `cubic-bezier(${e.join(',')})`;

/** 0xRRGGBB → "#rrggbb". */
export const hexOf = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/**
 * Push RARITY_COLOR (the shared catalog's authority) into `--rarity-*` so the
 * CSS placeholders can never drift from what the field renderer tints with.
 * Call once at boot, before the first screen renders.
 */
export function applyRarityTokens(): void {
  const root = document.documentElement;
  for (const [rarity, color] of Object.entries(RARITY_COLOR)) {
    root.style.setProperty(`--rarity-${rarity}`, hexOf(color));
  }
}
