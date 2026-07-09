/**
 * In-game shop (docs/ROADMAP.ru.md — Этап 3, monetization).
 *
 * Gold packs are a GEM SINK: spend the premium currency (gems — earned from
 * seasons / wars / tournaments / daily, and later bought with Telegram Stars)
 * for gold, the upgrade currency. Bigger packs give more gold per gem. This file
 * is data-only so client and server price everything identically.
 */

export interface GoldPack {
  id: string;
  gems: number; // price in gems
  gold: number; // gold granted
}

/** Gold-for-gems packs. Value per gem improves at higher tiers (bulk discount). */
export const GOLD_PACKS: GoldPack[] = [
  { id: 'gold_s', gems: 10, gold: 1000 }, // 100 gold/gem
  { id: 'gold_m', gems: 40, gold: 4500 }, // 112.5 gold/gem
  { id: 'gold_l', gems: 90, gold: 11000 }, // ~122 gold/gem
];

export function goldPack(id: string): GoldPack | undefined {
  return GOLD_PACKS.find((p) => p.id === id);
}
