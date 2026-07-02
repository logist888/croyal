/**
 * Balance harness: representative trios play each other round-robin, headless,
 * with the same policy bot on both sides. Prints a win matrix + outliers.
 *
 * NOT part of CI — a designer tool. Balance is tuned by editing the archetype
 * constants in scripts/gen-catalog.mjs (or individual cards) and re-running.
 *
 * Usage:
 *   npx tsx scripts/balance-harness.mjs              # 12 trios, 4 games/pair
 *   npx tsx scripts/balance-harness.mjs --games 8    # more seeds per pair
 *   npx tsx scripts/balance-harness.mjs --trio treant,druidess,wolfpack   # add a custom trio
 */
import { Simulation } from '../server/src/game/simulation.ts';
import { pickBotAction, botNextDelay } from '../server/src/game/bot.ts';
import { COOLDOWN_BATTLE_CONFIG, TICK_DT, getCard } from '../shared/src/index.ts';

const TRIOS = {
  starter: ['footman', 'archers', 'colossus'],
  training: ['ratpack', 'sharpshooter', 'volley'],
  forest: ['treant', 'druidess', 'wolfpack'],
  stonefort: ['ironclad', 'crossbowman', 'fortify'],
  fireforge: ['infernal_hound', 'pyromancer', 'firestorm'],
  frostpeak: ['snow_yeti', 'frost_archer', 'blizzard'],
  storm: ['thunder_mage', 'stormcrow', 'chain_bolt'],
  royal: ['paladin', 'royal_guard', 'trumpeter'],
  marsh: ['necromancer', 'swamp_hulk', 'venom_cloud'],
  desert: ['sand_golem', 'scarab_swarm', 'mirage_assassin'],
  legend: ['titan_golem', 'gryphon_rider', 'celestial_beam'],
  siege: ['catapult', 'battering_ram', 'cannon_tower'],
};

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const GAMES = Math.max(2, Number(opt('games', '4')) || 4); // per pair, sides alternate
const custom = opt('trio', '');
if (custom) {
  const ids = custom.split(',').map((s) => s.trim());
  if (ids.length !== 3 || ids.some((id) => !getCard(id))) {
    console.error(`--trio needs 3 valid card ids, got: ${custom}`);
    process.exit(1);
  }
  TRIOS.custom = ids;
}

/** Play one full bot-vs-bot match; returns { winner, seconds, crowns } */
function play(trioA, trioB, seed) {
  const sim = new Simulation([...trioA], [...trioB], seed, {}, {}, COOLDOWN_BATTLE_CONFIG);
  const next = { A: 0.5, B: 1.0 };
  let tick = 0;
  const maxTicks = (COOLDOWN_BATTLE_CONFIG.roundSeconds + 5) * Math.round(1 / TICK_DT);
  while (!sim.result && tick < maxTicks) {
    sim.step(TICK_DT);
    tick += 1;
    for (const side of ['A', 'B']) {
      next[side] -= TICK_DT;
      if (next[side] > 0) continue;
      const action = pickBotAction(sim, side, tick);
      if (action) sim.deploy(side, action.cardId, action.x, action.y);
      next[side] = botNextDelay(sim, tick);
    }
  }
  const score = sim.getSnapshot('A').score;
  return { winner: sim.winnerSide, seconds: tick * TICK_DT, crowns: score };
}

const names = Object.keys(TRIOS);
const wins = Object.fromEntries(names.map((n) => [n, 0]));
const games = Object.fromEntries(names.map((n) => [n, 0]));
const cell = {}; // cell[a][b] = wins of a vs b
for (const a of names) cell[a] = Object.fromEntries(names.map((n) => [n, 0]));
let totalSeconds = 0;
let totalGames = 0;

console.log(`Round-robin: ${names.length} trios, ${GAMES} games per pair (sides alternate)…\n`);
const t0 = Date.now();
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = names[i];
    const b = names[j];
    for (let g = 0; g < GAMES; g++) {
      const swap = g % 2 === 1; // alternate sides to cancel any side bias
      const [ta, tb] = swap ? [TRIOS[b], TRIOS[a]] : [TRIOS[a], TRIOS[b]];
      const r = play(ta, tb, 1000 + i * 97 + j * 13 + g);
      const winnerName = (r.winner === 'A') === !swap ? a : b;
      wins[winnerName] += 1;
      games[a] += 1;
      games[b] += 1;
      if (winnerName === a) cell[a][b] += 1; else cell[b][a] += 1;
      totalSeconds += r.seconds;
      totalGames += 1;
    }
  }
}

// --- report ---
const pad = (s, n) => String(s).padStart(n);
const short = (n) => n.slice(0, 6);
console.log(`   vs      ${names.map((n) => pad(short(n), 7)).join('')}`);
for (const a of names) {
  const row = names.map((b) => (a === b ? pad('—', 7) : pad(`${cell[a][b]}/${GAMES}`, 7))).join('');
  console.log(`${pad(short(a), 9)} ${row}`);
}
console.log('\nOverall win rates:');
const rates = names
  .map((n) => ({ n, rate: wins[n] / Math.max(1, games[n]) }))
  .sort((x, y) => y.rate - x.rate);
for (const { n, rate } of rates) {
  const flag = rate > 0.65 ? '  ← strong outlier' : rate < 0.35 ? '  ← weak outlier' : '';
  console.log(`  ${pad(n, 10)}  ${(rate * 100).toFixed(0)}%  (${wins[n]}/${games[n]})${flag}`);
}
console.log(`\nAvg match length: ${(totalSeconds / totalGames).toFixed(0)}s of ${COOLDOWN_BATTLE_CONFIG.roundSeconds}s`);
console.log(`${totalGames} matches in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
