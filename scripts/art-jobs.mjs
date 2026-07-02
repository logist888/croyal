/**
 * Art job builder: turns docs/ART_PROMPT.ru.md (the single source of truth for
 * the art roster) into a flat list of generation jobs — one per asset file.
 *
 * Pure and network-free (unit-tested): scripts/gen-art.mjs consumes the list
 * and talks to the image API; `npm run slice` post-processes the results.
 *
 * Job shape:
 *   { id, category, file, size, background: 'transparent'|'opaque', prompt }
 * file is repo-relative: art/incoming/<category>/<id>.png
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** §2 of ART_PROMPT.ru.md — prefixed to EVERY prompt for style consistency. */
export const MASTER_STYLE =
  'mobile game art, original IP, stylized 3D cartoon, hand-painted PBR look, ' +
  'chunky proportions, bold clean silhouette, warm rim light, soft ambient occlusion, ' +
  'vibrant saturated colors, high readability at small size, centered single subject, ' +
  'no text, no logo, no watermark, no UI, plain background';

/** Sent as the negative/avoid clause where the API supports it (kept in prompt tail). */
export const NEGATIVE =
  'text, letters, watermark, signature, logo, brand, multiple subjects, collage, ' +
  'frame, border, busy background, photoreal, gore, low contrast, blurry, extra limbs, cut off';

// gpt-image-1 sizes: square for sprites/icons, portrait for cards/arenas, landscape for the logo.
const SQUARE = '1024x1024';
const PORTRAIT = '1024x1536';
const LANDSCAPE = '1536x1024';

/** Parse the §4 roster tables: 80 rows of id/Name/R/Type/Role/Cost/Visual. */
export function parseRoster(md = readArtPrompt()) {
  const start = md.indexOf('## 4.');
  const end = md.indexOf('## 5.', start);
  const rows = [];
  for (const line of md.slice(start, end).split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 8) continue;
    const id = cells[1];
    if (!/^[a-z][a-z0-9_]*$/.test(id) || id === 'id') continue;
    rows.push({
      id, name: cells[2], rarity: cells[3], type: cells[4],
      role: cells[5], cost: Number(cells[6]), visual: cells[7],
    });
  }
  return rows;
}

export function readArtPrompt() {
  return readFileSync(path.join(ROOT, 'docs/ART_PROMPT.ru.md'), 'utf8');
}

/** Spawner tokens: battle sprites only (no cards — they are not collectible). */
export const TOKEN_VISUALS = {
  hornet: 'single oversized angry hornet with a glowing stinger and buzzing wings',
  glider: 'small paper-and-wood glider with a tiny goblin pilot',
  skeleton: 'small skeleton warrior with a rusty sword and cracked shield',
};

/** §6 — arena biomes, one per league theme. */
export const ARENA_BIOMES = {
  arena_training: 'training grounds biome, bright green grass, wooden fences and straw dummies at the edges',
  arena_forest: 'forest glade biome, mossy grass, wildflowers, old roots at the edges',
  arena_stonefort: 'stone fortress yard biome, worn flagstones, battlement walls at the edges',
  arena_fireforge: 'volcanic forge biome, dark basalt ground, glowing lava seams',
  arena_frostpeak: 'snowy peak biome, packed snow, ice patches, frosted pines at the edges',
  arena_storm: 'stormy sky platform biome, floating stone slabs, crackling storm clouds around',
  arena_royal: 'royal courtyard biome, polished marble tiles, gold trim and banners at the edges',
  arena_marsh: 'poison swamp biome, murky shallow water, glowing mushrooms, gnarled trees',
  arena_desert: 'desert ruins biome, golden sand, cracked sandstone ruins at the edges',
  arena_legend: 'celestial temple biome, starlit sky, radiant clouds, ancient glowing glyph tiles',
};

/** §3.7 — VFX sprites the engine scales/rotates/fades. */
export const FX_VISUALS = {
  hit_slash: 'curved white energy slash arc',
  explosion: 'fiery orange explosion burst with sparks',
  fireball: 'blazing fireball with a trailing flame tail',
  frostbolt: 'icy blue bolt with a frost crystal trail',
  lightning_arc: 'jagged electric blue lightning arc',
  arrow: 'wooden arrow with white fletching in flight',
  cannonball: 'round black iron cannonball with motion streaks',
  heal_sparkle: 'cluster of soft green healing sparkles',
  poison_cloud: 'bubbling toxic green gas cloud',
  shield_aura: 'translucent golden shield dome',
  rage_aura: 'fiery orange rage aura ring',
  freeze_crystal: 'sharp blue ice crystal shard',
  dust_puff: 'soft brown dust puff',
  star_bolt: 'radiant golden star projectile with sparkle trail',
  smoke_ring: 'grey smoke ring',
  deploy_ring: 'glowing golden ground ring marker',
};

/** §3.8 — UI icons. */
export const UI_VISUALS = {
  elixir: 'glossy purple elixir droplet',
  gold: 'shiny stacked gold coins',
  gem: 'faceted green gemstone',
  trophy: 'golden trophy cup',
  crown: 'golden royal crown',
  xp: 'blue hexagonal experience badge with an upward arrow',
  star: 'golden five-pointed star',
  lock: 'sturdy golden padlock',
  chest_wood: 'closed wooden treasure chest with iron bands',
  chest_silver: 'closed silver ornate treasure chest',
  chest_gold: 'closed golden ornate treasure chest',
  chest_magic: 'closed purple treasure chest glowing with magic runes',
  chest_legendary: 'closed radiant white-gold legendary treasure chest',
  badge_1: 'round league badge emblem of crossed wooden training swords, bronze frame',
  badge_2: 'round league badge emblem of a green oak leaf, wooden frame',
  badge_3: 'round league badge emblem of a stone tower, iron frame',
  badge_4: 'round league badge emblem of a flaming anvil, dark steel frame',
  badge_5: 'round league badge emblem of an ice crystal peak, silver frame',
  badge_6: 'round league badge emblem of a storm lightning bolt, steel-blue frame',
  badge_7: 'round league badge emblem of a royal crown over a shield, gold frame',
  badge_8: 'round league badge emblem of a poison skull, tarnished green frame',
  badge_9: 'round league badge emblem of a golden scarab, sandstone frame',
  badge_10: 'round league badge emblem of a radiant celestial star, platinum frame',
  medal_bronze: 'bronze medal with a red ribbon',
  medal_silver: 'silver medal with a blue ribbon',
  medal_gold: 'gold medal with a purple ribbon',
  clan_badge: 'heraldic clan shield emblem with two crossed banners',
  vs_banner: 'battle banner emblem of two crossed swords over a burst',
  timer: 'wooden hourglass with blue sand',
  emote_1: 'round emote of a laughing goblin face',
  emote_2: 'round emote of a crying knight face with a big tear',
  emote_3: 'round emote of an angry red face with steam',
  emote_4: 'round emote of an armored thumbs-up gauntlet',
  emote_5: 'round emote of a sleeping face with z-z-z bubbles',
  emote_6: 'round emote of a surprised wide-eyed face',
  emote_7: 'round emote of a taunting tongue-out face',
  emote_8: 'round emote of a cool face wearing sunglasses',
  frame_common: 'simple rectangular card frame border, grey stone texture',
  frame_rare: 'rectangular card frame border, orange metal with rivets',
  frame_epic: 'ornate rectangular card frame border, purple with silver filigree',
  frame_legendary: 'radiant rectangular card frame border, gold with rainbow shimmer',
  card_back: 'ornate playing card back design with a crown emblem, royal blue and gold',
};

const inFile = (category, id) => path.join('art/incoming', category, `${id}.png`);

/** Build the full generation job list (~225 assets). */
export function buildJobs(md = readArtPrompt()) {
  const roster = parseRoster(md);
  const jobs = [];

  // 1) Card portraits — all 80, vertical, transparent (§3.1).
  for (const r of roster) {
    const subject = r.type === 'spell'
      ? `dramatic magical spell effect illustration of ${r.visual}, arcane energy`
      : `character portrait of ${r.visual}, dynamic heroic pose, 3/4 front view`;
    jobs.push({
      id: r.id, category: 'cards', file: inFile('cards', r.id),
      size: PORTRAIT, background: 'transparent',
      prompt: `${MASTER_STYLE}, ${subject}, dramatic lighting, vertical composition, transparent background`,
    });
  }

  // 2) Battle cutouts — troops/buildings only (spells have none, §3.2) + tokens.
  //    SQUARE single frames: the renderer treats square-ish images as one frame.
  const unitRows = roster.filter((r) => r.type !== 'spell');
  for (const r of unitRows) {
    const subject = r.type === 'building'
      ? `compact defensive structure of ${r.visual}, top-down three-quarter view`
      : `top-down three-quarter game sprite of ${r.visual}, full body, standing idle pose, facing camera-forward, feet at bottom`;
    jobs.push({
      id: r.id, category: 'units', file: inFile('units', r.id),
      size: SQUARE, background: 'transparent',
      prompt: `${MASTER_STYLE}, ${subject}, transparent background, no ground shadow`,
    });
  }
  for (const [id, visual] of Object.entries(TOKEN_VISUALS)) {
    jobs.push({
      id, category: 'units', file: inFile('units', id),
      size: SQUARE, background: 'transparent',
      prompt: `${MASTER_STYLE}, top-down three-quarter game sprite of ${visual}, full body, standing idle pose, facing camera-forward, feet at bottom, transparent background, no ground shadow`,
    });
  }

  // 3) Arenas (10, §3.3/§6) + hub background + splash — opaque.
  for (const [id, biome] of Object.entries(ARENA_BIOMES)) {
    jobs.push({
      id, category: 'arena', file: inFile('arena', id),
      size: PORTRAIT, background: 'opaque',
      prompt: `${MASTER_STYLE}, top-down battlefield background, two mirrored halves divided by a river with two wooden bridges, subtle checkerboard tiles, ${biome}, empty arena, no towers, no characters, no UI, vertical composition`,
    });
  }
  jobs.push({
    id: 'hub_bg', category: 'arena', file: inFile('arena', 'hub_bg'),
    size: PORTRAIT, background: 'opaque',
    prompt: `${MASTER_STYLE}, epic fantasy castle arena seen from afar under a dramatic sky, main menu background, painterly depth, vertical composition`,
  });
  jobs.push({
    id: 'splash', category: 'arena', file: inFile('arena', 'splash'),
    size: PORTRAIT, background: 'opaque',
    prompt: `${MASTER_STYLE}, loading screen scene: a knight and an archer overlooking a battlefield with distant towers at sunset, epic scale, vertical composition`,
  });

  // 4) Towers (§3.5) — neutral stone, the engine tints the owning side.
  jobs.push({
    id: 'king', category: 'towers', file: inFile('towers', 'king'),
    size: SQUARE, background: 'transparent',
    prompt: `${MASTER_STYLE}, top-down three-quarter view of a large neutral stone king tower with a golden crown ornament on top, sturdy medieval masonry, compact footprint, transparent background, no ground shadow`,
  });
  jobs.push({
    id: 'princess', category: 'towers', file: inFile('towers', 'princess'),
    size: SQUARE, background: 'transparent',
    prompt: `${MASTER_STYLE}, top-down three-quarter view of a compact neutral stone watchtower with a hooded archer turret silhouette on top, medieval masonry, transparent background, no ground shadow`,
  });

  // 5) Clan raid boss (§3.6).
  jobs.push({
    id: 'boss', category: 'boss', file: inFile('boss', 'boss'),
    size: SQUARE, background: 'transparent',
    prompt: `${MASTER_STYLE}, top-down three-quarter game sprite of a colossal obsidian golem boss with glowing lava cracks and burning eyes, menacing wide stance, transparent background, no ground shadow`,
  });

  // 6) VFX (§3.7) — additive sprites.
  for (const [id, visual] of Object.entries(FX_VISUALS)) {
    jobs.push({
      id, category: 'fx', file: inFile('fx', id),
      size: SQUARE, background: 'transparent',
      prompt: `${MASTER_STYLE}, game VFX sprite of ${visual}, glowing, additive style, on transparent background`,
    });
  }

  // 7) UI icons (§3.8) + app icon (§3.9).
  for (const [id, visual] of Object.entries(UI_VISUALS)) {
    jobs.push({
      id, category: 'ui', file: inFile('ui', id),
      size: SQUARE, background: 'transparent',
      prompt: `${MASTER_STYLE}, single game UI icon of ${visual}, centered, crisp, transparent background`,
    });
  }
  jobs.push({
    id: 'app_icon', category: 'ui', file: inFile('ui', 'app_icon'),
    size: SQUARE, background: 'opaque',
    prompt: `${MASTER_STYLE}, mobile game app icon: a mighty cartoon king tower with a golden crown, bold readable composition filling the square frame`,
  });

  // 8) Logo (§3.9) — emblem only, no lettering (the game renders its own title).
  jobs.push({
    id: 'logo', category: 'logo', file: inFile('logo', 'logo'),
    size: LANDSCAPE, background: 'transparent',
    prompt: `${MASTER_STYLE}, fantasy game logo emblem: a golden crown above two crossed swords and a stone tower, rich gold and royal blue palette, emblem only, no letters, transparent background`,
  });

  return jobs;
}

/** Per-category job counts (used by --dry-run and the unit tests). */
export function countByCategory(jobs) {
  const out = {};
  for (const j of jobs) out[j.category] = (out[j.category] ?? 0) + 1;
  return out;
}
