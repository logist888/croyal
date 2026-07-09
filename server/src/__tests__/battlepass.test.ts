import { describe, it, expect } from 'vitest';
import {
  BP_TRACK, BP_TIERS, BP_XP_PER_TIER, BP_PREMIUM_COST_GEMS, BP_XP_PER_WIN,
  bpTier, bpTierProgress, freshBattlePass, hasBattlePassRewards,
  OPEN_BATTLE_CONFIG,
} from '@croyal/shared';
import { Store } from '../store';
import { Match } from '../game/match';

const JAN = Date.UTC(2026, 0, 15);
const FEB = Date.UTC(2026, 1, 15);

describe('battle pass (pure)', () => {
  it('track has BP_TIERS tiers, each with a free and premium reward', () => {
    expect(BP_TRACK.length).toBe(BP_TIERS);
    for (const t of BP_TRACK) {
      expect(t.free).toBeTruthy();
      expect(t.premium).toBeTruthy();
      expect((t.free.gold ?? 0) + (t.free.gems ?? 0)).toBeGreaterThan(0);
    }
  });

  it('bpTier and progress track XP', () => {
    expect(bpTier(0)).toBe(0);
    expect(bpTier(BP_XP_PER_TIER - 1)).toBe(0);
    expect(bpTier(BP_XP_PER_TIER)).toBe(1);
    expect(bpTier(BP_XP_PER_TIER * (BP_TIERS + 5))).toBe(BP_TIERS); // capped
    expect(bpTierProgress(BP_XP_PER_TIER + 30)).toEqual({ into: 30, need: BP_XP_PER_TIER });
  });

  it('hasBattlePassRewards flags unclaimed unlocked tiers', () => {
    const bp = freshBattlePass(1);
    expect(hasBattlePassRewards(bp)).toBe(false);
    bp.xp = BP_XP_PER_TIER * 2; // reached tier 2
    expect(hasBattlePassRewards(bp)).toBe(true);
    bp.claimedFree = [1, 2];
    expect(hasBattlePassRewards(bp)).toBe(false); // free claimed, not premium
    bp.premium = true;
    expect(hasBattlePassRewards(bp)).toBe(true); // premium tiers now claimable
  });
});

describe('battle pass (store)', () => {
  function user(tg: number, gems = 0) {
    const store = new Store();
    const u = store.createUser({ telegramId: tg, nickname: 'BP' + Math.floor(Math.random() * 1e6), language: 'en' });
    if (gems) store.updateUser(u.id, { gems });
    return { store, id: u.id };
  }

  it('resets on a new season', () => {
    const { store, id } = user(6401);
    store.addBattlePassXp(id, 250, JAN);
    expect(store.ensureBattlePass(id, JAN)!.xp).toBe(250);
    const feb = store.ensureBattlePass(id, FEB)!;
    expect(feb.xp).toBe(0); // fresh pass for the new season
  });

  it('buying premium spends gems and gates on affordability + double-buy', () => {
    const { store, id } = user(6402, BP_PREMIUM_COST_GEMS + 20);
    const p = store.buyBattlePassPremium(id, JAN);
    expect(p.gems).toBe(20);
    expect(store.ensureBattlePass(id, JAN)!.premium).toBe(true);
    expect(() => store.buyBattlePassPremium(id, JAN)).toThrow(/already/i);
    const poor = user(6403, 0);
    expect(() => poor.store.buyBattlePassPremium(poor.id, JAN)).toThrow(/not enough gems/i);
  });

  it('claimAll grants free rewards (premium only when owned) and is idempotent', () => {
    const { store, id } = user(6404, BP_PREMIUM_COST_GEMS);
    store.addBattlePassXp(id, BP_XP_PER_TIER * 3, JAN); // tier 3
    const goldBefore = store.getUser(id)!.gold;
    const r1 = store.claimAllBattlePass(id, JAN);
    // free tiers 1..3: tiers not %5 give gold; none of 1,2,3 are %5 -> all gold
    const expectedGold = BP_TRACK.slice(0, 3).reduce((s, t) => s + (t.free.gold ?? 0), 0);
    expect(r1.gold).toBe(expectedGold);
    expect(store.getUser(id)!.gold).toBe(goldBefore + expectedGold);
    expect(() => store.claimAllBattlePass(id, JAN)).toThrow(/nothing to claim/i); // idempotent

    // now unlock premium and claim the premium track for the same tiers
    store.buyBattlePassPremium(id, JAN);
    const r2 = store.claimAllBattlePass(id, JAN);
    const expectedPrem = BP_TRACK.slice(0, 3).reduce(
      (acc, t) => ({ gold: acc.gold + (t.premium.gold ?? 0), gems: acc.gems + (t.premium.gems ?? 0) }),
      { gold: 0, gems: 0 },
    );
    expect(r2.gold).toBe(expectedPrem.gold);
    expect(r2.gems).toBe(expectedPrem.gems);
  });

  it('a ranked result grants battle-pass XP; a friendly one does not', () => {
    const store = new Store();
    const a = store.createUser({ telegramId: 6501, nickname: 'BPa' + Math.floor(Math.random() * 1e6), language: 'en' });
    const b = store.createUser({ telegramId: 6502, nickname: 'BPb' + Math.floor(Math.random() * 1e6), language: 'en' });
    const send = () => {};
    const mk = (id: string, friendly: boolean) => new Match(
      id,
      { userId: a.id, deck: store.getUser(a.id)!.trio, send },
      { userId: b.id, deck: store.getUser(b.id)!.trio, send },
      store, () => {}, OPEN_BATTLE_CONFIG, friendly,
    );
    mk('bp-ranked', false).handleLeave(b.id); // a wins ranked
    expect(store.ensureBattlePass(a.id)!.xp).toBe(BP_XP_PER_WIN);
    mk('bp-friendly', true).handleLeave(b.id); // friendly -> no XP
    expect(store.ensureBattlePass(a.id)!.xp).toBe(BP_XP_PER_WIN);
  });
});
