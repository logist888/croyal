/**
 * Loads client/public/assets/manifest.json (produced by `npm run slice`) and
 * exposes asset URLs. When an asset is missing the game falls back to its
 * built-in placeholder look, so art can be added piece by piece.
 */
export interface AssetManifest {
  cards: Record<string, string>;
  units: Record<string, string>;
  towers: Record<string, string>;
  boss: Record<string, string>;
  arena: Record<string, string>;
  ui: Record<string, string>;
}

let manifest: AssetManifest = { cards: {}, units: {}, towers: {}, boss: {}, arena: {}, ui: {} };

export async function loadAssetManifest(): Promise<void> {
  try {
    const res = await fetch('/assets/manifest.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      manifest = { cards: {}, units: {}, towers: {}, boss: {}, arena: {}, ui: {}, ...data };
    }
  } catch {
    /* no manifest yet — keep empty, everything falls back to placeholders */
  }
}

export const cardImageUrl = (id: string): string | undefined => manifest.cards[id];
export const unitImageUrl = (id: string): string | undefined => manifest.units[id];
export const towerImageUrl = (type: string): string | undefined =>
  type === 'king' ? manifest.towers.king : manifest.towers.princess;
export const bossImageUrl = (): string | undefined => manifest.boss.boss ?? Object.values(manifest.boss)[0];
export const arenaImageUrl = (): string | undefined => manifest.arena.background ?? Object.values(manifest.arena)[0];

/** Texture (key,url) list preloaded by the Phaser field. */
export function fieldLoadList(): { key: string; url: string }[] {
  const list: { key: string; url: string }[] = [];
  for (const [id, url] of Object.entries(manifest.units)) list.push({ key: `unit:${id}`, url });
  if (manifest.towers.king) list.push({ key: 'tower:king', url: manifest.towers.king });
  if (manifest.towers.princess) list.push({ key: 'tower:princess', url: manifest.towers.princess });
  const boss = bossImageUrl();
  if (boss) list.push({ key: 'boss', url: boss });
  return list;
}
