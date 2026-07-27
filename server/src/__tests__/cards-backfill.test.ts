import { describe, it, expect } from 'vitest';
import { Store } from '../store';
import { ALL_CARD_IDS } from '@croyal/shared';

/**
 * Accounts created before the roster grew to its current size kept a smaller
 * `cards` map, so their collection (and trio picker) was missing cards. The
 * store backfills any catalog card missing from a user.
 */
describe('legacy card backfill', () => {
  it('ensureCards restores catalog cards missing from an old account, preserving existing ones', () => {
    const store = new Store();
    const u = store.createUser({ telegramId: 8801, nickname: 'Legacy' + Math.floor(Math.random() * 1e6), language: 'en' });
    // Simulate a pre-expansion account: only a handful of cards, some upgraded.
    const kept = ALL_CARD_IDS.slice(0, 5);
    u.cards = {};
    for (const id of kept) u.cards[id] = { level: 3, count: 7 };
    expect(Object.keys(store.getUser(u.id)!.cards).length).toBe(5);

    const fixed = store.ensureCards(u.id)!;
    expect(Object.keys(fixed.cards).length).toBe(ALL_CARD_IDS.length); // owns everything now
    expect(fixed.cards[kept[0]]).toEqual({ level: 3, count: 7 }); // progress preserved
    const added = ALL_CARD_IDS.find((id) => !kept.includes(id))!;
    expect(fixed.cards[added]).toEqual({ level: 1, count: 0 }); // new ones default in
  });

  it('is a no-op for a fresh account that already owns everything', () => {
    const store = new Store();
    const u = store.createUser({ telegramId: 8802, nickname: 'Fresh' + Math.floor(Math.random() * 1e6), language: 'en' });
    expect(store.backfillCards(store.getUser(u.id)!)).toBe(false);
    expect(Object.keys(store.getUser(u.id)!.cards).length).toBe(ALL_CARD_IDS.length);
  });
});
