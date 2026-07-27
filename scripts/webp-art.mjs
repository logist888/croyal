#!/usr/bin/env node
/**
 * Convert the shipped art to WebP and rewrite the manifest to point at it.
 *
 * Where the weight actually is (measured, not assumed):
 *   cards  10.0 MB   arena 9.7 MB   units 1.1 MB   menu-bg 0.9 MB
 *   ui 0.3 MB   fx 0.24 MB   towers/boss ~0.2 MB
 * So this is overwhelmingly a cards + arena problem, and the fix is the codec,
 * not packing. A texture atlas was considered and dropped: the renderer already
 * measures 5 draw calls in a live battle, so batching is not the bottleneck and
 * an atlas would buy nothing for a lot of pipeline complexity.
 *
 * Without --prune the PNGs are left alongside, so a bad conversion is undone by
 * re-running `npm run slice`. With --prune they are dropped after the manifest
 * is written; the true originals live in art/incoming either way.
 *
 * Usage: node scripts/webp-art.mjs [--quality 82] [--dry-run] [--prune]
 */
import { readdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, 'client/public/assets');
const MANIFEST = join(ASSETS, 'manifest.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const qArg = args.indexOf('--quality');
const QUALITY = qArg >= 0 ? Number(args[qArg + 1]) : 82;

/**
 * Per-category encoder settings. Card and unit art is a cutout on transparency,
 * so alpha must survive; arena backgrounds are opaque photos-ish and take a
 * lower quality without anyone noticing at phone size.
 */
const CATEGORIES = {
  cards: { quality: QUALITY, alpha: true },
  arena: { quality: 76, alpha: false },
  units: { quality: QUALITY, alpha: true },
  towers: { quality: QUALITY, alpha: true },
  boss: { quality: QUALITY, alpha: true },
  fx: { quality: QUALITY, alpha: true },
  ui: { quality: 88, alpha: true }, // small and always on screen — keep them crisp
};

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

async function convertDir(dir, opts) {
  const abs = join(ASSETS, dir);
  if (!existsSync(abs)) return { before: 0, after: 0, files: 0, map: {} };
  const entries = (await readdir(abs)).filter((f) => extname(f).toLowerCase() === '.png');
  let before = 0, after = 0;
  const map = {};

  for (const file of entries) {
    const src = join(abs, file);
    const outName = file.replace(/\.png$/i, '.webp');
    const out = join(abs, outName);
    before += (await stat(src)).size;

    if (dryRun) { after += 0; map[file] = outName; continue; }

    await sharp(src)
      .webp({ quality: opts.quality, alphaQuality: 100, effort: 6 })
      .toFile(out);

    const size = (await stat(out)).size;
    // A conversion that got bigger is not an optimisation — keep the PNG.
    if (size >= (await stat(src)).size) {
      after += (await stat(src)).size;
      continue;
    }
    after += size;
    map[file] = outName;
  }
  return { before, after, files: entries.length, map };
}

async function main() {
  if (!existsSync(MANIFEST)) throw new Error(`no manifest at ${MANIFEST} — run \`npm run slice\` first`);
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));

  let totalBefore = 0, totalAfter = 0;
  const rewrites = new Map(); // "cards/knight.png" -> "cards/knight.webp"

  for (const [dir, opts] of Object.entries(CATEGORIES)) {
    const r = await convertDir(dir, opts);
    totalBefore += r.before;
    totalAfter += r.after;
    for (const [png, webp] of Object.entries(r.map)) rewrites.set(`${dir}/${png}`, `${dir}/${webp}`);
    const saved = r.before ? (1 - r.after / r.before) * 100 : 0;
    console.log(`${dir.padEnd(8)} ${String(r.files).padStart(3)} files  `
      + `${kb(r.before).padStart(9)} -> ${kb(r.after).padStart(9)}  (-${saved.toFixed(0)}%)`);
  }

  // menu-bg sits at the assets root rather than in a category.
  const menuBg = join(ASSETS, 'menu-bg.png');
  if (existsSync(menuBg) && !dryRun) {
    const b = (await stat(menuBg)).size;
    await sharp(menuBg).webp({ quality: 76, effort: 6 }).toFile(join(ASSETS, 'menu-bg.webp'));
    const a = (await stat(join(ASSETS, 'menu-bg.webp'))).size;
    if (a < b) {
      rewrites.set('menu-bg.png', 'menu-bg.webp');
      totalBefore += b; totalAfter += a;
      console.log(`menu-bg      1 files  ${kb(b).padStart(9)} -> ${kb(a).padStart(9)}  (-${((1 - a / b) * 100).toFixed(0)}%)`);
    }
  }

  if (dryRun) { console.log('\n(dry run — nothing written)'); return; }

  // Point every manifest URL at its .webp twin where one was produced.
  let rewritten = 0;
  const remap = (value) => {
    if (typeof value !== 'string') return value;
    const key = value.replace(/^\/?assets\//, '');
    const next = rewrites.get(key);
    if (!next) return value;
    rewritten++;
    return value.replace(key, next);
  };
  for (const [section, entries] of Object.entries(manifest)) {
    if (typeof entries === 'string') { manifest[section] = remap(entries); continue; }
    if (!entries || typeof entries !== 'object') continue;
    for (const [id, url] of Object.entries(entries)) entries[id] = remap(url);
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\ntotal ${kb(totalBefore)} -> ${kb(totalAfter)} `
    + `(-${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%), ${rewritten} manifest entries repointed`);

  // Pruning happens only AFTER the manifest is safely on disk pointing at the
  // .webp files — deleting first would, on a failed write, leave the manifest
  // referencing PNGs that no longer exist.
  if (args.includes('--prune')) {
    let freed = 0, removed = 0;
    for (const key of rewrites.keys()) {
      const png = join(ASSETS, key);
      if (!existsSync(png)) continue;
      freed += (await stat(png)).size;
      await rm(png);
      removed++;
    }
    console.log(`pruned ${removed} superseded PNGs, freed ${kb(freed)}`);
    console.log('Originals live in art/incoming; `npm run slice` rebuilds this folder from them.');
  } else {
    console.log('PNG originals kept alongside — pass --prune to drop them from the deploy.');
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
