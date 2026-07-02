/**
 * Art slicer: turns raw images dropped in art/incoming/<category>/ into
 * game-ready sprites under client/public/assets/, and rebuilds manifest.json.
 *
 * Usage:  npm run slice
 *
 * Naming & sizes are documented in art/incoming/README.md. Sprite sheets named
 * `<id>@COLSxROWS.png` are cut into frames (frame 0 becomes the static sprite).
 */
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Jimp from 'jimp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'art/incoming');
const OUT = path.join(ROOT, 'client/public/assets');

/** Target box + fit mode per category. */
const CONFIG = {
  cards: { w: 256, h: 320, mode: 'cover' },
  units: { w: 128, h: 128, mode: 'contain' },
  towers: { w: 192, h: 192, mode: 'contain' },
  boss: { w: 320, h: 320, mode: 'contain' },
  arena: { w: 540, h: 900, mode: 'cover' },
  fx: { w: 128, h: 128, mode: 'contain' },
  ui: { w: 64, h: 64, mode: 'contain' },
};

const IMAGE_RE = /\.(png|jpe?g|gif|bmp)$/i;
// Asset ids are snake_case (they become manifest keys and texture ids). Raw
// drops with default names ("ChatGPT Image ….png", "photo_….jpeg") are
// skipped with a warning instead of polluting the assets folder.
const ID_RE = /^[a-z][a-z0-9_]*$/;

function parseName(file) {
  const base = file.replace(IMAGE_RE, '');
  const m = base.match(/^(.+)@(\d+)x(\d+)$/);
  if (m) return { id: m[1], cols: Number(m[2]), rows: Number(m[3]) };
  return { id: base, cols: 1, rows: 1 };
}

function fit(img, cfg) {
  const out = img.clone();
  return cfg.mode === 'cover' ? out.cover(cfg.w, cfg.h) : out.contain(cfg.w, cfg.h);
}

async function listImages(dir) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => IMAGE_RE.test(f));
}

async function sliceCategory(cat, cfg) {
  const dir = path.join(IN, cat);
  const files = await listImages(dir);
  if (files.length === 0) return;
  const outDir = path.join(OUT, cat);
  await mkdir(outDir, { recursive: true });

  for (const file of files) {
    const { id, cols, rows } = parseName(file);
    if (!ID_RE.test(id)) {
      console.warn(`  ! ${cat}/${file}: name is not a valid asset id (rename to <id>.png) — skipped`);
      continue;
    }
    const img = await Jimp.read(path.join(dir, file));

    if (cols > 1 || rows > 1) {
      const fw = Math.floor(img.bitmap.width / cols);
      const fh = Math.floor(img.bitmap.height / rows);
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const frame = fit(img.clone().crop(c * fw, r * fh, fw, fh), cfg);
          await frame.writeAsync(path.join(outDir, `${id}_${idx}.png`));
          idx++;
        }
      }
      await fit(img.clone().crop(0, 0, fw, fh), cfg).writeAsync(path.join(outDir, `${id}.png`));
      console.log(`  ${cat}/${file} -> ${id}.png (+${idx} frames)`);
    } else {
      await fit(img, cfg).writeAsync(path.join(outDir, `${id}.png`));
      console.log(`  ${cat}/${file} -> ${id}.png`);
    }
  }
}

/**
 * The manifest is rebuilt from what actually exists under client/public/assets —
 * NOT from art/incoming. Sliced assets whose raw source was later renamed or
 * removed must keep working (they are committed game content).
 */
async function buildManifest() {
  const manifest = { cards: {}, units: {}, towers: {}, boss: {}, arena: {}, fx: {}, ui: {} };
  for (const cat of Object.keys(CONFIG)) {
    const dir = path.join(OUT, cat);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => f.endsWith('.png'));
    const names = new Set(files.map((f) => f.replace(/\.png$/, '')));
    for (const f of files) {
      const id = f.replace(/\.png$/, '');
      // `X_N.png` is a sheet frame only when the base `X.png` exists too
      // (badge_1 / emote_3 style ids have no base and stay in the manifest).
      const m = id.match(/^(.+)_(\d+)$/);
      if (m && names.has(m[1])) continue;
      manifest[cat][id] = `/assets/${cat}/${id}.png`;
    }
  }
  if (existsSync(path.join(OUT, 'menu-bg.png'))) manifest.menuBg = '/assets/menu-bg.png';
  return manifest;
}

async function sliceLogo() {
  const files = await listImages(path.join(IN, 'logo'));
  if (files.length === 0) return;
  const img = await Jimp.read(path.join(IN, 'logo', files[0]));
  if (img.bitmap.width > 1280) img.resize(1280, Jimp.AUTO);
  await img.writeAsync(path.join(ROOT, 'client/public/logo.png'));
  console.log(`  logo/${files[0]} -> client/public/logo.png`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log('Slicing art from art/incoming/ …');
  for (const [cat, cfg] of Object.entries(CONFIG)) await sliceCategory(cat, cfg);
  await sliceLogo();
  const manifest = await buildManifest();
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const counts = Object.entries(manifest)
    .filter(([, v]) => typeof v === 'object')
    .map(([k, v]) => `${k}:${Object.keys(v).length}`).join('  ');
  console.log(`Done. manifest.json -> ${counts}`);
}

main().catch((e) => {
  console.error('Slice failed:', e);
  process.exit(1);
});
