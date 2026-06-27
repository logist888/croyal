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
  ui: { w: 64, h: 64, mode: 'contain' },
};

const IMAGE_RE = /\.(png|jpe?g|gif|bmp)$/i;

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

async function sliceCategory(cat, cfg, manifest) {
  const dir = path.join(IN, cat);
  const files = await listImages(dir);
  if (files.length === 0) return;
  const outDir = path.join(OUT, cat);
  await mkdir(outDir, { recursive: true });
  manifest[cat] = {};

  for (const file of files) {
    const { id, cols, rows } = parseName(file);
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
    manifest[cat][id] = `/assets/${cat}/${id}.png`;
  }
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
  const manifest = { cards: {}, units: {}, towers: {}, boss: {}, arena: {}, ui: {} };
  console.log('Slicing art from art/incoming/ …');
  for (const [cat, cfg] of Object.entries(CONFIG)) await sliceCategory(cat, cfg, manifest);
  await sliceLogo();
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const counts = Object.entries(manifest).map(([k, v]) => `${k}:${Object.keys(v).length}`).join('  ');
  console.log(`Done. manifest.json -> ${counts}`);
}

main().catch((e) => {
  console.error('Slice failed:', e);
  process.exit(1);
});
