/**
 * One-off slicer for the hand-made ChatGPT art batch (varied layouts / messy
 * filenames). Cuts the card sheet into individual cards, knocks the white
 * background out of the logo, splits the victory/defeat banners, and prepares a
 * menu backdrop — then writes client/public/assets/manifest.json.
 *
 * Generic convention-named drops still go through `npm run slice`.
 *
 * Usage: node scripts/preslice-uploads.mjs
 */
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Jimp from 'jimp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'art/incoming');
const PUBLIC = path.join(ROOT, 'client/public');
const OUT = path.join(PUBLIC, 'assets');

const CARD_IDS = [
  'footman', 'archers', 'colossus', 'ratpack', 'sharpshooter', // row 0
  'blademaster', 'bombthrower', 'bastion', 'meteor', 'volley', // row 1
];

async function findFile(dir, substr) {
  if (!existsSync(dir)) return null;
  const files = await readdir(dir);
  const hit = files.find((f) => f.includes(substr) && /\.(png|jpe?g)$/i.test(f));
  return hit ? path.join(dir, hit) : null;
}

/** Flood-fill the neutral/bright background from the borders to transparent. */
function knockoutBackground(img) {
  const { width, height, data } = img.bitmap;
  const visited = new Uint8Array(width * height);
  const stack = [];
  const isBg = (idx) => {
    const o = idx * 4;
    if (data[o + 3] < 8) return true; // already transparent
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const mn = Math.min(r, g, b);
    const mx = Math.max(r, g, b);
    return mn > 198 && mx - mn < 26; // bright + low saturation (white/light grey)
  };
  for (let x = 0; x < width; x++) { stack.push(x); stack.push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { stack.push(y * width); stack.push(y * width + width - 1); }
  while (stack.length) {
    const idx = stack.pop();
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (!isBg(idx)) continue;
    data[idx * 4 + 3] = 0;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) stack.push(idx - 1);
    if (x < width - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - width);
    if (y < height - 1) stack.push(idx + width);
  }
  return img;
}

async function sliceCards(manifest) {
  const sheet = await findFile(IN, '21_36_56');
  if (!sheet) { console.log('! card sheet not found, skipping cards'); return; }
  const img = await Jimp.read(sheet);
  const cols = 5, rows = 2;
  const cw = Math.floor(img.bitmap.width / cols);
  const ch = Math.floor(img.bitmap.height / rows);
  const outDir = path.join(OUT, 'cards');
  await mkdir(outDir, { recursive: true });
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = CARD_IDS[i++];
      const cell = img.clone().crop(c * cw, r * ch, cw, ch).autocrop();
      cell.contain(300, 440);
      await cell.writeAsync(path.join(outDir, `${id}.png`));
      manifest.cards[id] = `/assets/cards/${id}.png`;
    }
  }
  console.log(`cards: sliced ${i} from ${path.basename(sheet)}`);
}

async function processLogo() {
  const logo = await findFile(path.join(IN, 'logo'), 'ChatGPT') || await findFile(path.join(IN, 'logo'), '.png');
  if (!logo) { console.log('! logo not found, skipping'); return; }
  const img = await Jimp.read(logo);
  knockoutBackground(img);
  img.autocrop();
  if (img.bitmap.width > 1024) img.resize(1024, Jimp.AUTO);
  await img.writeAsync(path.join(PUBLIC, 'logo.png'));
  console.log(`logo: ${path.basename(logo)} -> client/public/logo.png (bg removed)`);
}

async function sliceBanners(manifest) {
  const file = await findFile(path.join(IN, 'ui'), '22_08_42');
  if (!file) { console.log('! banners not found, skipping'); return; }
  const img = await Jimp.read(file);
  const w = img.bitmap.width, h = img.bitmap.height;
  const outDir = path.join(OUT, 'ui');
  await mkdir(outDir, { recursive: true });
  const halves = [['victory', 0], ['defeat', Math.floor(w / 2)]];
  for (const [name, x] of halves) {
    const part = img.clone().crop(x, 0, Math.floor(w / 2), h);
    knockoutBackground(part);
    part.autocrop();
    if (part.bitmap.width > 640) part.resize(640, Jimp.AUTO);
    await part.writeAsync(path.join(outDir, `${name}.png`));
    manifest.ui[name] = `/assets/ui/${name}.png`;
  }
  console.log('banners: victory.png, defeat.png');
}

async function menuBackground(manifest) {
  const arena = (await findFile(path.join(IN, 'arena'), '22_01_13')) || (await findFile(path.join(IN, 'arena'), '.png'));
  if (!arena) { console.log('! arena not found, skipping menu bg'); return; }
  const img = await Jimp.read(arena);
  if (img.bitmap.width > 720) img.resize(720, Jimp.AUTO);
  await img.writeAsync(path.join(OUT, 'menu-bg.png'));
  manifest.menuBg = '/assets/menu-bg.png';
  console.log(`menu bg: ${path.basename(arena)} -> /assets/menu-bg.png`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifest = { cards: {}, units: {}, towers: {}, boss: {}, arena: {}, ui: {}, menuBg: null };
  await sliceCards(manifest);
  await processLogo();
  // Banners (sliceBanners) are left out for now: their source has a soft, non-flat
  // background that won't key out cleanly. Re-enable once we have tight transparent art.
  await menuBackground(manifest);
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('manifest.json written.');
}

main().catch((e) => { console.error('preslice failed:', e); process.exit(1); });
