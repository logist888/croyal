/**
 * Slice uploaded battle-sprite art into client/public/assets/units/<id>.png and
 * merge them into the asset manifest. Only transparent cutouts are processed
 * (autocrop to the figure, then scale so the longest side = 256px).
 *
 * MAP is the file-timestamp -> unit id mapping. Edit it as identities are
 * confirmed, then re-run: node scripts/slice-units.mjs
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Jimp from 'jimp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'art/incoming/cards');
const OUTDIR = path.join(ROOT, 'client/public/assets/units');
const MANIFEST = path.join(ROOT, 'client/public/assets/manifest.json');

// Confirmed/confident identities (by colour signature). Add the rest once known.
const MAP = {
  '22_54_06': 'bombthrower', // brown-dominant dwarf
  '22_54_21': 'archers',     // green outfit (only one with green)
  '22_54_00': 'ratpack',     // grey + sparse small bodies, no blue/green
};

const MAX = 256;

/** Crop to the figure's main mass using per-row/column opaque-pixel counts,
 *  ignoring sparse stray pixels / glow near the edges (more robust than a raw
 *  alpha bounding box or jimp autocrop). */
function cropToAlpha(img, alphaThresh = 50, frac = 0.03, pad = 8) {
  const { width, height, data } = img.bitmap;
  const col = new Float64Array(width);
  const row = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alphaThresh) { col[x]++; row[y]++; }
    }
  }
  let maxCol = 0, maxRow = 0;
  for (let x = 0; x < width; x++) if (col[x] > maxCol) maxCol = col[x];
  for (let y = 0; y < height; y++) if (row[y] > maxRow) maxRow = row[y];
  if (maxCol === 0) return img;
  const cT = maxCol * frac, rT = maxRow * frac;
  let minX = 0; while (minX < width && col[minX] < cT) minX++;
  let maxX = width - 1; while (maxX > 0 && col[maxX] < cT) maxX--;
  let minY = 0; while (minY < height && row[minY] < rT) minY++;
  let maxY = height - 1; while (maxY > 0 && row[maxY] < rT) maxY--;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  return img.crop(minX, minY, maxX - minX + 1, maxY - minY + 1);
}

async function findByTag(tag) {
  const files = await readdir(SRC);
  const hit = files.find((f) => f.includes(tag) && /\.png$/i.test(f));
  return hit ? path.join(SRC, hit) : null;
}

async function main() {
  await mkdir(OUTDIR, { recursive: true });
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  manifest.units = manifest.units || {};

  for (const [tag, id] of Object.entries(MAP)) {
    const file = await findByTag(tag);
    if (!file) { console.log(`! ${tag}: file not found`); continue; }
    const img = await Jimp.read(file);
    cropToAlpha(img);
    const { width, height } = img.bitmap;
    if (width >= height) img.resize(MAX, Jimp.AUTO); else img.resize(Jimp.AUTO, MAX);
    await img.writeAsync(path.join(OUTDIR, `${id}.png`));
    manifest.units[id] = `/assets/units/${id}.png`;
    console.log(`${tag} -> units/${id}.png (${img.bitmap.width}x${img.bitmap.height})`);
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest units: ${Object.keys(manifest.units).join(', ')}`);
}

main().catch((e) => { console.error('slice-units failed:', e); process.exit(1); });
