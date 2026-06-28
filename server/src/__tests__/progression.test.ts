import { describe, it, expect } from 'vitest';
import { Store } from '../store';
import {
  getCard, cardsToUpgrade, goldToUpgrade, levelStatMultiplier, scaledStats, MAX_CARD_LEVEL,
} from '@croyal/shared';

function newUser(store: Store) {
  return store.createUser({ telegramId: 42, nickname: 'Hero42', language: 'en' });
}

describe('card upgrades', () => {
  it('starts every card at level 1 with 0 duplicates', () => {
    const store = new Store();
    const u = newUser(store);
    expect(u.cards.footman).toEqual({ level: 1, count: 0 });
    expect(u.xp).toBe(0);
  });

  it('rejects upgrade without enough cards', () => {
    const store = new Store();
    const u = newUser(store);
    expect(() => store.upgradeCard(u.id, 'footman')).toThrow(/cards/i);
  });

  it('upgrades when cards + gold are available, deducting both and granting XP', () => {
    const store = new Store();
    const u = newUser(store);
    const need = cardsToUpgrade(1);
    const gold = goldToUpgrade(1);
    store.awardCards(u.id, { footman: need });
    const before = u.gold;
    const after = store.upgradeCard(u.id, 'footman');
    expect(after.cards.footman.level).toBe(2);
    expect(after.cards.footman.count).toBe(0);
    expect(after.gold).toBe(before - gold);
    expect(after.xp).toBeGreaterThan(0);
  });

  it('rejects upgrade without enough gold', () => {
    const store = new Store();
    const u = newUser(store);
    store.awardCards(u.id, { footman: cardsToUpgrade(1) });
    store.updateUser(u.id, { gold: 0 });
    expect(() => store.upgradeCard(u.id, 'footman')).toThrow(/gold/i);
  });
});

describe('level stat scaling', () => {
  it('level 1 is the base, higher levels scale up', () => {
    expect(levelStatMultiplier(1)).toBe(1);
    expect(levelStatMultiplier(2)).toBeGreaterThan(1);
    const f = getCard('footman')!;
    expect(scaledStats(f, 1).hp).toBe(f.hp);
    expect(scaledStats(f, 3).hp).toBeGreaterThan(f.hp!);
  });

  it('caps at the max card level', () => {
    expect(cardsToUpgrade(MAX_CARD_LEVEL)).toBe(Infinity);
  });
});
