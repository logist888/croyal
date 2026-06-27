// Analyze the uploaded unit images by pixel statistics (no vision needed):
// detect background type + a colour signature to help map each file to a unit.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import Jimp from 'jimp';

const DIR = 'art/incoming/cards';
const NEW = ['22_45_13', '22_54_00', '22_54_06', '22_54_12', '22_54_16', '22_54_21', '22_54_26'];

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

const files = (await readdir(DIR)).filter((f) => NEW.some((t) => f.includes(t)) && /\.png$/i.test(f)).sort();

for (const f of files) {
  const img = await Jimp.read(path.join(DIR, f));
  const { width, height, data } = img.bitmap;
  const corners = [[5, 5], [width - 6, 5], [5, height - 6], [width - 6, height - 6]].map(([x, y]) => {
    const o = (y * width + x) * 4;
    return [data[o], data[o + 1], data[o + 2], data[o + 3]];
  });
  const cornerAlpha = corners.reduce((s, c) => s + c[3], 0) / 4;
  let transparent = 0, total = 0, subject = 0;
  const m = { pink: 0, brown: 0, skin: 0, yellow: 0, green: 0, blue: 0, grey: 0, dark: 0 };
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const o = (y * width + x) * 4;
      total++;
      const a = data[o + 3];
      if (a < 16) { transparent++; continue; }
      const [h, s, v] = rgb2hsv(data[o], data[o + 1], data[o + 2]);
      subject++;
      if (v < 0.22) m.dark++;
      else if (s < 0.16 && v >= 0.35) m.grey++;
      else if (h >= 290 && h <= 350 && s > 0.25) m.pink++;
      else if (h >= 46 && h <= 66 && s > 0.35 && v > 0.55) m.yellow++;
      else if (h >= 80 && h <= 160 && s > 0.25) m.green++;
      else if (h >= 195 && h <= 255 && s > 0.25) m.blue++;
      else if (h >= 12 && h <= 45 && s > 0.2 && v > 0.6) m.skin++;
      else if (h >= 12 && h <= 45 && s > 0.2) m.brown++;
    }
  }
  const pct = (n) => ((n / Math.max(1, subject)) * 100).toFixed(0);
  const tag = f.match(/22_\d\d_\d\d/)[0];
  console.log(
    `${tag}  cornerA=${cornerAlpha.toFixed(0)} transp=${((transparent / total) * 100).toFixed(0)}% subj=${((subject / total) * 100).toFixed(0)}%` +
    ` | pink${pct(m.pink)} brown${pct(m.brown)} skin${pct(m.skin)} yellow${pct(m.yellow)} green${pct(m.green)} blue${pct(m.blue)} grey${pct(m.grey)} dark${pct(m.dark)}`,
  );
}
