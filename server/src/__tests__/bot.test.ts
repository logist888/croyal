import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import { pickBotAction, botNextDelay } from '../game/bot';
import {
  COOLDOWN_BATTLE_CONFIG, LEGACY_BATTLE_CONFIG, DEFAULT_TRIO, DEFAULT_DECK,
  BOT_PLAY_INTERVAL_SECONDS, BOT_PLAY_INTERVAL_FINAL_SECONDS, getCard, TICK_DT,
} from '@croyal/shared';

describe('bot policy (cooldown model)', () => {
  it('plays only cards that are off cooldown, without coordinates for troops', () => {
    const sim = new Simulation([...DEFAULT_TRIO], [...DEFAULT_TRIO], 1, {}, {}, COOLDOWN_BATTLE_CONFIG);
    const action = pickBotAction(sim, 'B', 0)!;
    expect(action).not.toBeNull();
    expect(DEFAULT_TRIO).toContain(action.cardId);
    expect(action.x).toBeUndefined();
    expect(action.y).toBeUndefined();
  });

  it('returns null while the whole trio is recharging', () => {
    const sim = new Simulation([...DEFAULT_TRIO], [...DEFAULT_TRIO], 1, {}, {}, COOLDOWN_BATTLE_CONFIG);
    for (const id of DEFAULT_TRIO) sim.deploy('B', id);
    expect(sim.readyCards('B')).toEqual([]);
    expect(pickBotAction(sim, 'B', 5)).toBeNull();
  });

  it('never returns a card that is on cooldown', () => {
    const sim = new Simulation([...DEFAULT_TRIO], [...DEFAULT_TRIO], 1, {}, {}, COOLDOWN_BATTLE_CONFIG);
    sim.deploy('B', 'footman');
    for (let tick = 0; tick < 10; tick++) {
      const action = pickBotAction(sim, 'B', tick);
      expect(action?.cardId).not.toBe('footman');
    }
  });

  it('aims spells at a point (coordinates present)', () => {
    const sim = new Simulation(['footman', 'archers', 'colossus'], ['meteor', 'archers', 'footman'], 1, {}, {}, COOLDOWN_BATTLE_CONFIG);
    sim.deploy('A', 'footman');
    sim.step(TICK_DT);
    // force the bot to the spell slot
    let spell = null;
    for (let t = 0; t < 6 && !spell; t++) {
      const a = pickBotAction(sim, 'B', t);
      if (a && getCard(a.cardId)!.type === 'spell') spell = a;
    }
    expect(spell).not.toBeNull();
    expect(spell!.x).toBeTypeOf('number');
    expect(spell!.y).toBeTypeOf('number');
  });

  it('paces ~4.5s normally and ~2.7s in the final minute', () => {
    const sim = new Simulation([...DEFAULT_TRIO], [...DEFAULT_TRIO], 1, {}, {}, COOLDOWN_BATTLE_CONFIG);
    expect(botNextDelay(sim, 0)).toBeGreaterThanOrEqual(BOT_PLAY_INTERVAL_SECONDS);
    sim.step(COOLDOWN_BATTLE_CONFIG.roundSeconds - 30); // into the final minute
    expect(sim.finalPhase()).toBe(true);
    expect(botNextDelay(sim, 0)).toBeGreaterThanOrEqual(BOT_PLAY_INTERVAL_FINAL_SECONDS);
    expect(botNextDelay(sim, 0)).toBeLessThan(BOT_PLAY_INTERVAL_SECONDS);
  });
});

describe('bot policy (legacy elixir model)', () => {
  it('waits for elixir >= 4 and provides coordinates', () => {
    const sim = new Simulation([...DEFAULT_DECK], [...DEFAULT_DECK], 1, {}, {}, LEGACY_BATTLE_CONFIG);
    const action = pickBotAction(sim, 'B', 0);
    if (action) {
      expect(action.x).toBeTypeOf('number');
      expect(action.y).toBeTypeOf('number');
    }
    // burn elixir below 4 -> bot holds
    while (sim.elixirOf('B') >= 4) {
      const hand = sim.handOf('B');
      const affordable = hand.find((id) => (getCard(id)?.cost ?? 99) <= sim.elixirOf('B'));
      if (!affordable) break;
      sim.deploy('B', affordable, 9, 8);
    }
    if (sim.elixirOf('B') < 4) {
      expect(pickBotAction(sim, 'B', 1)).toBeNull();
    }
  });
});
