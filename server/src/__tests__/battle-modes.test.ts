import { describe, it, expect } from 'vitest';
import { resolveBattleConfig, ACTIVE_BATTLE_CONFIG } from '../game/active-config';

/**
 * Guards that EVERY sim-based battle mode uses the same PvP "open" core, so
 * bridge routing + deploy-zone rules are identical across them:
 *   - ranked / friendly / tournament matches -> new Match(..., ACTIVE_BATTLE_CONFIG)
 *   - tournament bot auto-resolve            -> new Simulation(..., ACTIVE_BATTLE_CONFIG)
 *   - replays                                -> new Simulation(..., recorded config)
 * (The boss raid has its own engine, covered by boss.test.ts.)
 */
describe('all sim battle modes share the open core', () => {
  it('the default (and active) battle core is cooldown + open', () => {
    expect(resolveBattleConfig({}).economy).toBe('cooldown');
    expect(resolveBattleConfig({}).deployment).toBe('open');
    expect(ACTIVE_BATTLE_CONFIG.deployment).toBe('open');
  });

  it('env can still switch cores (rollback path), open is the default', () => {
    expect(resolveBattleConfig({ BATTLE_DEPLOYMENT: 'fixed-lane' }).deployment).toBe('fixed-lane');
    expect(resolveBattleConfig({ BATTLE_DEPLOYMENT: 'free-placement' }).deployment).toBe('free-placement');
    expect(resolveBattleConfig({ BATTLE_DEPLOYMENT: 'open' }).deployment).toBe('open');
    expect(resolveBattleConfig({ BATTLE_DEPLOYMENT: 'garbage' }).deployment).toBe('open'); // fallback
  });
});
