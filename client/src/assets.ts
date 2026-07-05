/**
 * Loads client/public/assets/manifest.json (produced by `npm run slice`) and
 * exposes asset URLs. When an asset is missing the game falls back to its
 * built-in placeholder look, so art can be added piece by piece.
 *
 * All URLs are resolved against the app's base path (import.meta.env.BASE_URL) so
 * the client works at the root ('/') and on a GitHub Pages subpath ('/croyal/').
 */
export interface AssetManifest {
  cards: Record<string, string>;
  units: Record<string, string>;
  towers: Record<string, string>;
  boss: Record<string, string>;
  arena: Record<string, string>;
  ui: Record<string, string>;
  menuBg?: string | null;
}

/** Resolve a public path against the deploy base (handles '/' and '/croyal/'). */
export function asset(p: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return base + p.replace(/^\//, '');
}

const empty = (): AssetManifest => ({ cards: {}, units: {}, towers: {}, boss: {}, arena: {}, ui: {}, menuBg: null });
let manifest: AssetManifest = empty();

function rebase(rec: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = asset(v);
  return out;
}

export async function loadAssetManifest(): Promise<void> {
  try {
    const res = await fetch(asset('assets/manifest.json'), { cache: 'no-cache' });
    if (res.ok) {
      const data = { ...empty(), ...(await res.json()) } as AssetManifest;
      manifest = {
        cards: rebase(data.cards), units: rebase(data.units), towers: rebase(data.towers),
        boss: rebase(data.boss), arena: rebase(data.arena), ui: rebase(data.ui),
        menuBg: data.menuBg ? asset(data.menuBg) : null,
      };
    }
  } catch {
    /* no manifest yet — keep empty, everything falls back to placeholders */
  }
}

export const cardImageUrl = (id: string): string | undefined => manifest.cards[id];
export const unitImageUrl = (id: string): string | undefined => manifest.units[id];
export const uiImageUrl = (id: string): string | undefined => manifest.ui[id];
export const towerImageUrl = (type: string): string | undefined =>
  type === 'king' ? manifest.towers.king : manifest.towers.princess;
export const bossImageUrl = (): string | undefined => manifest.boss.boss ?? Object.values(manifest.boss)[0];
/** Arena background for a given arena id (falls back to training / any / none). */
export const arenaImageUrl = (arenaId?: string): string | undefined =>
  (arenaId ? manifest.arena[arenaId] : undefined)
  ?? manifest.arena.background ?? manifest.arena.arena_training ?? Object.values(manifest.arena)[0];
export const menuBgUrl = (): string | undefined => manifest.menuBg ?? undefined;

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
