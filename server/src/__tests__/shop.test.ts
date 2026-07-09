import { describe, it, expect } from 'vitest';
import { GOLD_PACKS, goldPack } from '@croyal/shared';
import { Store } from '../store';

describe('gold packs (pure)', () => {
  it('every pack has a positive gem price and gold value; lookup works', () => {
    expect(GOLD_PACKS.length).toBeGreaterThan(0);
    for (const p of GOLD_PACKS) {
      expect(p.gems).toBeGreaterThan(0);
      expect(p.gold).toBeGreaterThan(0);
      expect(goldPack(p.id)).toEqual(p);
    }
    expect(goldPack('nope')).toBeUndefined();
  });

  it('bigger packs give more gold per gem (bulk discount)', () => {
    const rate = (p: { gems: number; gold: number }) => p.gold / p.gems;
    for (let i = 1; i < GOLD_PACKS.length; i++) {
      expect(rate(GOLD_PACKS[i])).toBeGreaterThanOrEqual(rate(GOLD_PACKS[i - 1]));
    }
  });
});

describe('shop (store)', () => {
  function freshUser(tg: number, gems: number) {
    const store = new Store();
    const u = store.createUser({ telegramId: tg, nickname: 'Shop' + Math.floor(Math.random() * 1e6), language: 'en' });
    store.updateUser(u.id, { gems });
    return { store, id: u.id };
  }

  it('buying a gold pack spends gems and grants gold', () => {
    const pack = GOLD_PACKS[0];
    const { store, id } = freshUser(6001, pack.gems + 5);
    const goldBefore = store.getUser(id)!.gold;
    const p = store.buyGoldPack(id, pack.id);
    expect(p.gems).toBe(5); // (pack.gems + 5) - pack.gems
    expect(p.gold).toBe(goldBefore + pack.gold);
  });

  it('rejects an unaffordable pack and an unknown pack', () => {
    const { store, id } = freshUser(6002, 0);
    expect(() => store.buyGoldPack(id, GOLD_PACKS[0].id)).toThrow(/not enough gems/i);
    expect(() => store.buyGoldPack(id, 'bogus')).toThrow(/unknown pack/i);
  });

  it('grantGems credits gems (Stars-purchase path)', () => {
    const { store, id } = freshUser(6003, 10);
    const p = store.grantGems(id, 100)!;
    expect(p.gems).toBe(110);
    expect(store.grantGems(id, 0)!.gems).toBe(110); // non-positive is a no-op
  });
});
