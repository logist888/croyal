import { describe, it, expect } from 'vitest';
import {
  THEMES, ALWAYS_UNLOCKED, unlockLeagueIndex, isCardUnlocked, unlockedCards,
  ALL_CARD_IDS, CARDS, LEAGUES, DEFAULT_TRIO, STARTER_POOL, DEFAULT_DECK,
} from '@croyal/shared';
import { Store } from '../store';
import { Match, type MatchSeat } from '../game/match';
import { COOLDOWN_BATTLE_CONFIG } from '@croyal/shared';

describe('league unlock table (shared/unlocks)', () => {
  it('themes partition the whole 80-card collection exactly once', () => {
    const seen = new Map<string, string>();
    for (const t of THEMES) {
      for (const id of t.cardIds) {
        expect(CARDS[id], `${t.theme} references unknown card ${id}`).toBeTruthy();
        expect(seen.has(id), `${id} appears in both ${seen.get(id)} and ${t.theme}`).toBe(false);
        seen.set(id, t.theme);
      }
    }
    expect(seen.size).toBe(ALL_CARD_IDS.length);
  });

  it('every theme points at a real league', () => {
    for (const t of THEMES) {
      expect(t.leagueIndex).toBeGreaterThanOrEqual(0);
      expect(t.leagueIndex).toBeLessThan(LEAGUES.length);
    }
  });

  it('unlocks are monotonic: higher trophies never lose cards', () => {
    let prev = new Set<string>();
    for (const league of LEAGUES) {
      const now = new Set(unlockedCards(league.min));
      for (const id of prev) expect(now.has(id), `${id} vanished at ${league.min}`).toBe(true);
      expect(now.size).toBeGreaterThanOrEqual(prev.size);
      prev = now;
    }
    expect(prev.size).toBe(ALL_CARD_IDS.length); // top league opens everything
  });

  it('grandfather set: everything onboarding hands out is unlocked at 0 trophies', () => {
    for (const id of [...STARTER_POOL, ...DEFAULT_TRIO, ...DEFAULT_DECK]) {
      expect(ALWAYS_UNLOCKED.has(id), id).toBe(true);
      expect(isCardUnlocked(id, 0), id).toBe(true);
      expect(unlockLeagueIndex(id), id).toBe(0);
    }
  });

  it('a fresh account sees theme 1 + the grandfather set, and top-theme cards stay locked', () => {
    const atZero = new Set(unlockedCards(0));
    for (const id of THEMES[0].cardIds) expect(atZero.has(id), id).toBe(true);
    expect(atZero.has('lich_king')).toBe(false);
    expect(atZero.has('titan_golem')).toBe(false);
    // exactly the theme-0 cards plus grandfathered ones
    for (const id of atZero) {
      expect(unlockLeagueIndex(id), id).toBe(0);
    }
  });
});

describe('store.setTrio league gate', () => {
  const makeUser = (store: Store, tg: number, nick: string) =>
    store.createUser({ telegramId: tg, nickname: nick, language: 'en' });

  it('rejects a locked card at 0 trophies and accepts it once the league is reached', () => {
    const store = new Store();
    const user = makeUser(store, 1, 'GateTester');
    expect(() => store.setTrio(user.id, ['footman', 'archers', 'lich_king']))
      .toThrow(/locked/i);
    const idx = unlockLeagueIndex('lich_king');
    store.updateUser(user.id, { trophies: LEAGUES[idx].min });
    const updated = store.setTrio(user.id, ['footman', 'archers', 'lich_king']);
    expect(updated.trio).toEqual(['footman', 'archers', 'lich_king']);
  });

  it('grandfathered cards work in a brand-new trio despite living in later themes', () => {
    const store = new Store();
    const user = makeUser(store, 2, 'Grandfather');
    // colossus (Stone Fort) and meteor (Fire Forge) are in DEFAULT_DECK/TRIO
    const updated = store.setTrio(user.id, ['colossus', 'meteor', 'blademaster']);
    expect(updated.trio).toEqual(['colossus', 'meteor', 'blademaster']);
  });

  it('a trophy drop never breaks the existing trio (gate is on SET only)', () => {
    const store = new Store();
    const user = makeUser(store, 3, 'Faller');
    const idx = unlockLeagueIndex('lich_king');
    store.updateUser(user.id, { trophies: LEAGUES[idx].min });
    store.setTrio(user.id, ['footman', 'archers', 'lich_king']);
    store.updateUser(user.id, { trophies: 0 }); // fell back down
    expect(store.getUser(user.id)!.trio).toEqual(['footman', 'archers', 'lich_king']);
    // ...but re-saving that trio now fails until the league is regained.
    expect(() => store.setTrio(user.id, ['footman', 'archers', 'lich_king']))
      .toThrow(/locked/i);
  });
});

describe('battle-chest drops respect unlocks', () => {
  it('a loss forfeit grants no instant cards (rewards are now chest-gated)', () => {
    const store = new Store();
    const user = store.createUser({ telegramId: 10, nickname: 'DropTester', language: 'en' });
    const seatA: MatchSeat = { userId: user.id, deck: [...user.trio], send: () => {} };
    const seatB: MatchSeat = { userId: null, deck: [...DEFAULT_TRIO], send: () => {} };
    const match = new Match('drop-test', seatA, seatB, store, () => {}, COOLDOWN_BATTLE_CONFIG);
    match.handleLeave(user.id); // forfeit -> loss: no chest, no cards
    const after = store.getUser(user.id)!;
    expect(after.chests.length).toBe(0);
    expect(Object.values(after.cards).every((c) => c.count === 0)).toBe(true);
  });

  it('opening a chest only yields cards from the player\'s unlocked pool', () => {
    const store = new Store();
    const user = store.createUser({ telegramId: 11, nickname: 'ChestUnlock', language: 'en' }); // 0 trophies
    store.awardChest(user.id, 'gold');
    const chest = store.getUser(user.id)!.chests[0];
    const t0 = 1_000_000;
    store.startChestUnlock(user.id, chest.id, t0);
    const ready = t0 + 999 * 60000;
    const { rewards } = store.openChest(user.id, chest.id, {}, ready, () => 0.5);
    const allowed = new Set(unlockedCards(0));
    for (const id of Object.keys(rewards.cards)) {
      expect(allowed.has(id), `chest dropped locked card ${id}`).toBe(true);
    }
  });
});
