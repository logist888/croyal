import { describe, it, expect } from 'vitest';
import {
  COSMETICS, getCosmetic, freshCosmetics, equippedColor,
  DEFAULT_CARD_FRAME, DEFAULT_TOWER_SKIN, DEFAULT_COSMETICS,
} from '@croyal/shared';
import { Store } from '../store';

describe('cosmetics catalog (pure)', () => {
  it('has unique ids, valid types, and non-negative gem prices; lookup works', () => {
    const ids = new Set<string>();
    for (const c of COSMETICS) {
      expect(['cardFrame', 'towerSkin']).toContain(c.type);
      expect(c.gems).toBeGreaterThanOrEqual(0);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(getCosmetic(c.id)).toEqual(c);
    }
    expect(getCosmetic('nope')).toBeUndefined();
  });

  it('the free defaults exist, cost 0, and are one per slot', () => {
    const frame = getCosmetic(DEFAULT_CARD_FRAME)!;
    const tower = getCosmetic(DEFAULT_TOWER_SKIN)!;
    expect(frame.type).toBe('cardFrame');
    expect(frame.gems).toBe(0);
    expect(tower.type).toBe('towerSkin');
    expect(tower.gems).toBe(0);
    expect(DEFAULT_COSMETICS).toEqual([DEFAULT_CARD_FRAME, DEFAULT_TOWER_SKIN]);
  });

  it('equippedColor falls back to the default when nothing is equipped', () => {
    expect(equippedColor(null, 'cardFrame')).toBe(getCosmetic(DEFAULT_CARD_FRAME)!.color);
    expect(equippedColor(freshCosmetics(), 'towerSkin')).toBe(getCosmetic(DEFAULT_TOWER_SKIN)!.color);
  });
});

describe('cosmetics (store)', () => {
  function freshUser(tg: number, gems: number) {
    const store = new Store();
    const u = store.createUser({ telegramId: tg, nickname: 'Cos' + Math.floor(Math.random() * 1e6), language: 'en' });
    store.updateUser(u.id, { gems });
    return { store, id: u.id };
  }
  const paidFrame = COSMETICS.find((c) => c.type === 'cardFrame' && c.gems > 0)!;
  const paidTower = COSMETICS.find((c) => c.type === 'towerSkin' && c.gems > 0)!;

  it('new accounts own and equip the free defaults', () => {
    const { store, id } = freshUser(7001, 0);
    const c = store.getUser(id)!.cosmetics!;
    expect(c.owned).toEqual(DEFAULT_COSMETICS);
    expect(c.cardFrame).toBe(DEFAULT_CARD_FRAME);
    expect(c.towerSkin).toBe(DEFAULT_TOWER_SKIN);
  });

  it('buying a cosmetic spends gems and adds it to owned', () => {
    const { store, id } = freshUser(7002, paidFrame.gems + 5);
    const p = store.buyCosmetic(id, paidFrame.id);
    expect(p.gems).toBe(5);
    expect(p.cosmetics!.owned).toContain(paidFrame.id);
  });

  it('rejects an unaffordable, already-owned, or unknown cosmetic', () => {
    const { store, id } = freshUser(7003, 0);
    expect(() => store.buyCosmetic(id, paidFrame.id)).toThrow(/not enough gems/i);
    expect(() => store.buyCosmetic(id, DEFAULT_CARD_FRAME)).toThrow(/already owned/i);
    expect(() => store.buyCosmetic(id, 'bogus')).toThrow(/unknown cosmetic/i);
  });

  it('equips only owned cosmetics, into the slot matching the type', () => {
    const { store, id } = freshUser(7004, paidTower.gems);
    expect(() => store.equipCosmetic(id, paidTower.id)).toThrow(/not owned/i);
    store.buyCosmetic(id, paidTower.id);
    const p = store.equipCosmetic(id, paidTower.id);
    expect(p.cosmetics!.towerSkin).toBe(paidTower.id);
    expect(p.cosmetics!.cardFrame).toBe(DEFAULT_CARD_FRAME); // other slot untouched
  });

  it('ensureCosmetics initialises a legacy (null) loadout and re-grants defaults', () => {
    const { store, id } = freshUser(7005, 0);
    store.updateUser(id, { cosmetics: null });
    const c = store.ensureCosmetics(id)!;
    expect(c.owned).toEqual(DEFAULT_COSMETICS);
    // Missing default is re-granted defensively.
    store.getUser(id)!.cosmetics!.owned = [];
    expect(store.ensureCosmetics(id)!.owned).toEqual(DEFAULT_COSMETICS);
  });
});
