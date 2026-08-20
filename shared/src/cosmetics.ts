/**
 * Cosmetics (docs/ROADMAP.ru.md — Этап 3.4).
 *
 * Pure vanity: card frames and tower skins bought with gems and equipped per
 * slot. NEVER pay-to-win — a cosmetic changes only how your cards/towers LOOK,
 * never a stat, which is what keeps a competitive PvP game fair to monetize.
 *
 * Data-only so client and server price and render identically. Each item carries
 * an accent `color` (0xRRGGBB) the client uses to draw the frame/skin; the free
 * defaults (`gems: 0`) are auto-owned by every account.
 */

export type CosmeticType = 'cardFrame' | 'towerSkin';

export interface Cosmetic {
  id: string;
  type: CosmeticType;
  en: string;
  ru: string;
  gems: number; // 0 = free default (auto-owned)
  color: number; // accent color for rendering the frame/skin (0xRRGGBB)
}

export const COSMETICS: Cosmetic[] = [
  // --- Card frames (recolor the ring around your cards) ---
  { id: 'frame_classic', type: 'cardFrame', en: 'Classic', ru: 'Классика', gems: 0, color: 0x9aa4b2 },
  { id: 'frame_gold', type: 'cardFrame', en: 'Golden', ru: 'Золотая', gems: 300, color: 0xffcc44 },
  { id: 'frame_ruby', type: 'cardFrame', en: 'Ruby', ru: 'Рубиновая', gems: 300, color: 0xff4d6d },
  { id: 'frame_emerald', type: 'cardFrame', en: 'Emerald', ru: 'Изумрудная', gems: 400, color: 0x2ec26b },
  { id: 'frame_void', type: 'cardFrame', en: 'Void', ru: 'Пустота', gems: 600, color: 0x7a5cff },
  // --- Tower skins (recolor your towers) ---
  { id: 'tower_standard', type: 'towerSkin', en: 'Standard', ru: 'Стандарт', gems: 0, color: 0x4a90d9 },
  { id: 'tower_crimson', type: 'towerSkin', en: 'Crimson', ru: 'Багровая', gems: 350, color: 0xd94a4a },
  { id: 'tower_forest', type: 'towerSkin', en: 'Forest', ru: 'Лесная', gems: 350, color: 0x3a9d5a },
  { id: 'tower_royal', type: 'towerSkin', en: 'Royal', ru: 'Королевская', gems: 500, color: 0x8a5cff },
  { id: 'tower_frost', type: 'towerSkin', en: 'Frost', ru: 'Ледяная', gems: 700, color: 0x5ccfff },
];

export const DEFAULT_CARD_FRAME = 'frame_classic';
export const DEFAULT_TOWER_SKIN = 'tower_standard';
/** Ids every account owns from the start (the free defaults). */
export const DEFAULT_COSMETICS = [DEFAULT_CARD_FRAME, DEFAULT_TOWER_SKIN];

export interface CosmeticsState {
  owned: string[];
  cardFrame: string; // equipped card-frame id
  towerSkin: string; // equipped tower-skin id
}

export function getCosmetic(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id);
}

/** A fresh loadout: the free defaults, owned and equipped. */
export function freshCosmetics(): CosmeticsState {
  return { owned: [...DEFAULT_COSMETICS], cardFrame: DEFAULT_CARD_FRAME, towerSkin: DEFAULT_TOWER_SKIN };
}

/** The accent color of the equipped item of a given type, for rendering. */
export function equippedColor(c: CosmeticsState | null | undefined, type: CosmeticType): number {
  const id = type === 'cardFrame' ? c?.cardFrame : c?.towerSkin;
  return getCosmetic(id ?? '')?.color
    ?? getCosmetic(type === 'cardFrame' ? DEFAULT_CARD_FRAME : DEFAULT_TOWER_SKIN)!.color;
}
