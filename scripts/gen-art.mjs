/**
 * Art generator: renders the job list from art-jobs.mjs via the OpenAI Images
 * API (gpt-image-1) into art/incoming/<category>/<id>.png, then you run
 * `npm run slice` to produce game-ready assets.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/gen-art.mjs [options]
 *
 * Options:
 *   --only cards,units     limit to categories, or to specific ids (comma list)
 *   --force                regenerate even if the file already exists
 *   --dry-run              print the plan + cost estimate, no network
 *   --concurrency 3        parallel requests (default 3)
 *   --limit N              stop after N generated images (budget guard)
 *   --quality low|medium|high   image quality (default medium)
 *   --sheet                (re)write art/review.html contact sheet and exit
 *
 * Resume is the default: existing files are skipped, so re-running after a
 * crash or a partial wave only generates what is missing.
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildJobs, countByCategory, ROOT } from './art-jobs.mjs';

// --- corporate proxy plumbing -------------------------------------------------
// Node's fetch does not honor HTTPS_PROXY by itself; undici's EnvHttpProxyAgent
// does. TLS interception also needs the proxy CA — never disable verification.
const CA_BUNDLE = '/root/.ccr/ca-bundle.crt';
if (!process.env.NODE_EXTRA_CA_CERTS && existsSync(CA_BUNDLE) && !process.env.GEN_ART_RESPAWNED) {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_EXTRA_CA_CERTS: CA_BUNDLE, GEN_ART_RESPAWNED: '1' },
  });
  process.exit(r.status ?? 1);
}
try {
  const { setGlobalDispatcher, EnvHttpProxyAgent } = await import('undici');
  setGlobalDispatcher(new EnvHttpProxyAgent());
} catch {
  if (process.env.HTTPS_PROXY) {
    console.warn('! undici is not installed but HTTPS_PROXY is set — run `npm i -D undici` or requests may fail.');
  }
}

// --- CLI ----------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};

const only = opt('only', '');
const force = flag('force');
const dryRun = flag('dry-run');
const sheetOnly = flag('sheet');
const concurrency = Math.max(1, Number(opt('concurrency', '3')) || 3);
const limit = Number(opt('limit', '0')) || Infinity;
const quality = opt('quality', 'medium');

// gpt-image-1 pricing per image (USD), by quality and aspect.
const PRICE = {
  low: { square: 0.011, tall: 0.016 },
  medium: { square: 0.042, tall: 0.063 },
  high: { square: 0.167, tall: 0.25 },
};
const priceOf = (job) =>
  (PRICE[quality] ?? PRICE.medium)[job.size === '1024x1024' ? 'square' : 'tall'];

// --- job selection --------------------------------------------------------------
const all = buildJobs();
const wanted = only
  ? all.filter((j) => only.split(',').some((tok) => tok === j.category || tok === j.id))
  : all;
const pending = force ? wanted : wanted.filter((j) => !existsSync(path.join(ROOT, j.file)));
const skipped = wanted.length - pending.length;

if (sheetOnly) {
  writeSheet(all);
  process.exit(0);
}

const estimate = pending.slice(0, limit === Infinity ? undefined : limit)
  .reduce((s, j) => s + priceOf(j), 0);
console.log(`Art plan: ${all.length} total jobs | selected ${wanted.length} | already on disk ${skipped} | to generate ${Math.min(pending.length, limit)}`);
console.log(`Per category (selected):`, countByCategory(wanted));
console.log(`Estimated cost (quality=${quality}): ~$${estimate.toFixed(2)}`);
if (dryRun) {
  for (const j of pending.slice(0, 5)) console.log(`  e.g. ${j.file} [${j.size}, ${j.background}]`);
  process.exit(0);
}

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('\n✗ OPENAI_API_KEY is not set. Add it to the environment and re-run.');
  console.error('  (dry-run works without it: node scripts/gen-art.mjs --dry-run)');
  process.exit(1);
}

// --- generation -----------------------------------------------------------------
let generated = 0;
let failed = 0;
const queue = pending.slice(0, limit === Infinity ? undefined : limit);
const t0 = Date.now();

async function generateOne(job) {
  const body = {
    model: 'gpt-image-1',
    prompt: job.prompt,
    size: job.size,
    quality,
    n: 1,
    ...(job.background === 'transparent' ? { background: 'transparent', output_format: 'png' } : {}),
  };
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** (attempt - 1);
        console.warn(`  ~ ${job.category}/${job.id}: HTTP ${res.status}, retry in ${Math.round(wait / 1000)}s (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (res.status === 401) throw new Error('401 Unauthorized — check OPENAI_API_KEY');
      if (res.status === 407) throw new Error('407 Proxy auth failed — see /root/.ccr/README.md');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error('response had no b64_json image');
      const abs = path.join(ROOT, job.file);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, Buffer.from(b64, 'base64'));
      generated++;
      console.log(`  ✓ ${job.file} (${generated}/${queue.length})`);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNABLE_TO_|CERT|TLS|fetch failed/i.test(msg) && attempt === 1) {
        console.warn(`  ~ ${job.category}/${job.id}: ${msg} — network/TLS issue; if behind the proxy see /root/.ccr/README.md`);
      }
      if (attempt === 4 || /401|407/.test(msg)) {
        failed++;
        console.error(`  ✗ ${job.file}: ${msg}`);
        if (/401/.test(msg)) process.exit(1); // no point burning retries on every job
        return;
      }
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (queue.length > 0) {
    const job = queue.shift();
    if (job) await generateOne(job);
  }
});
await Promise.all(workers);

console.log(`\nDone: ${generated} generated, ${failed} failed in ${Math.round((Date.now() - t0) / 1000)}s.`);
console.log('Next: npm run slice   (then commit art/incoming + client/public/assets)');
writeSheet(all);

// --- contact sheet ----------------------------------------------------------------
function writeSheet(jobs) {
  const cats = [...new Set(jobs.map((j) => j.category))];
  const sections = cats.map((cat) => {
    const items = jobs.filter((j) => j.category === cat).map((j) => {
      const exists = existsSync(path.join(ROOT, j.file));
      return `<figure class="${exists ? '' : 'missing'}">
        ${exists ? `<img loading="lazy" src="incoming/${j.category}/${j.id}.png" alt="${j.id}">` : '<div class="ph"></div>'}
        <figcaption>${j.id}</figcaption></figure>`;
    }).join('\n');
    const have = jobs.filter((j) => j.category === cat && existsSync(path.join(ROOT, j.file))).length;
    return `<h2>${cat} (${have}/${jobs.filter((j) => j.category === cat).length})</h2><div class="grid">${items}</div>`;
  }).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Art review</title>
<style>
 body{background:#1b1b1f;color:#eee;font:14px system-ui;margin:20px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
 figure{margin:0;text-align:center} img{width:100%;background:repeating-conic-gradient(#333 0 25%,#3c3c3c 0 50%) 0 0/16px 16px;border-radius:6px}
 .ph{aspect-ratio:1;background:#26262c;border:1px dashed #555;border-radius:6px}
 figcaption{font-size:11px;color:#aaa;margin-top:2px} .missing figcaption{color:#c33}
</style>
<h1>Art review — regenerate outliers with: node scripts/gen-art.mjs --only &lt;id&gt; --force</h1>
${sections}`;
  writeFileSync(path.join(ROOT, 'art/review.html'), html);
  console.log('Contact sheet: art/review.html');
}
