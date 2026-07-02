import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import { pickBotAction, botNextDelay } from '../game/bot';
import { COOLDOWN_BATTLE_CONFIG, DEFAULT_TRIO, TICK_DT, type Side } from '@croyal/shared';

/**
 * Headless bot-vs-bot harness: two policy bots play a full cooldown/fixed-lane
 * match. Guards the structural invariants of the new core (a real match
 * produces combat, damages towers, and always ends decisively) — balance
 * numbers themselves are tuned by the designer, not asserted here.
 */
describe('bot-vs-bot full match harness', () => {
  it('plays a complete match: combat happens, towers get hit, no draw', () => {
    const sim = new Simulation([...DEFAULT_TRIO], [...DEFAULT_TRIO], 7, {}, {}, COOLDOWN_BATTLE_CONFIG);
    const next: Record<Side, number> = { A: 0.5, B: 1.0 };
    let tick = 0;
    let sawUnitsBothSides = false;
    let towerDamaged = false;

    const maxTicks = (COOLDOWN_BATTLE_CONFIG.roundSeconds + 5) * Math.round(1 / TICK_DT);
    while (!sim.result && tick < maxTicks) {
      sim.step(TICK_DT);
      tick += 1;
      for (const side of ['A', 'B'] as Side[]) {
        next[side] -= TICK_DT;
        if (next[side] > 0) continue;
        const action = pickBotAction(sim, side, tick);
        if (action) sim.deploy(side, action.cardId, action.x, action.y);
        next[side] = botNextDelay(sim, tick);
      }
      if (tick % 20 === 0) {
        const ents = [...sim.entities.values()];
        const a = ents.some((e) => e.side === 'A' && e.kind === 'unit');
        const b = ents.some((e) => e.side === 'B' && e.kind === 'unit');
        if (a && b) sawUnitsBothSides = true;
        if (ents.some((e) => e.kind === 'tower' && e.hp < e.maxHp)) towerDamaged = true;
      }
    }

    expect(sawUnitsBothSides).toBe(true);
    expect(towerDamaged).toBe(true); // no dominant stalemate: pushes reach towers
    expect(sim.result).not.toBeNull(); // and NEVER a draw
    expect(sim.winnerSide === 'A' || sim.winnerSide === 'B').toBe(true);
  });

  // Expansion catalog (build-15): themed trios exercise spawners, zones,
  // statuses, air units and buildings-only tanks through a full match each.
  const THEMED: Array<[string, string[], string[]]> = [
    ['Forest vs Fire', ['treant', 'druidess', 'wolfpack'], ['flame_knight', 'pyromancer', 'emberling']],
    ['Frost vs Storm', ['snow_yeti', 'frost_archer', 'blizzard'], ['thunder_mage', 'stormcrow', 'chain_bolt']],
    ['Shadow vs Desert', ['necromancer', 'swamp_hulk', 'venom_cloud'], ['sand_golem', 'scarab_swarm', 'mirage_assassin']],
  ];
  for (const [label, trioA, trioB] of THEMED) {
    it(`themed matchup ${label} completes decisively with sane state`, () => {
      const sim = new Simulation(trioA, trioB, 23, {}, {}, COOLDOWN_BATTLE_CONFIG);
      const next: Record<Side, number> = { A: 0.5, B: 1.0 };
      let tick = 0;
      const maxTicks = (COOLDOWN_BATTLE_CONFIG.roundSeconds + 5) * Math.round(1 / TICK_DT);
      while (!sim.result && tick < maxTicks) {
        sim.step(TICK_DT);
        tick += 1;
        for (const side of ['A', 'B'] as Side[]) {
          next[side] -= TICK_DT;
          if (next[side] > 0) continue;
          const action = pickBotAction(sim, side, tick);
          if (action) sim.deploy(side, action.cardId, action.x, action.y);
          next[side] = botNextDelay(sim, tick);
        }
        // Statuses/zones/knockback must never corrupt positions.
        if (tick % 40 === 0) {
          for (const e of sim.entities.values()) {
            expect(Number.isFinite(e.x) && Number.isFinite(e.y), `${e.cardId} position`).toBe(true);
          }
        }
      }
      expect(sim.result).not.toBeNull();
      expect(sim.winnerSide === 'A' || sim.winnerSide === 'B').toBe(true);
    });
  }

  it('mirrored trios stay roughly symmetric: winner decided by tiebreak, not a blowout', () => {
    const sim = new Simulation([...DEFAULT_TRIO], [...DEFAULT_TRIO], 11, {}, {}, COOLDOWN_BATTLE_CONFIG);
    const next: Record<Side, number> = { A: 0.5, B: 0.5 }; // perfectly mirrored play
    let tick = 0;
    const maxTicks = (COOLDOWN_BATTLE_CONFIG.roundSeconds + 5) * Math.round(1 / TICK_DT);
    while (!sim.result && tick < maxTicks) {
      sim.step(TICK_DT);
      tick += 1;
      for (const side of ['A', 'B'] as Side[]) {
        next[side] -= TICK_DT;
        if (next[side] > 0) continue;
        const action = pickBotAction(sim, side, tick);
        if (action) sim.deploy(side, action.cardId, action.x, action.y);
        next[side] = botNextDelay(sim, tick);
      }
    }
    expect(sim.result).not.toBeNull();
    // Mirror play must not produce a 3-crown blowout for either side.
    const score = sim.getSnapshot('A').score;
    expect(Math.abs(score.A - score.B)).toBeLessThanOrEqual(2);
  });
});
