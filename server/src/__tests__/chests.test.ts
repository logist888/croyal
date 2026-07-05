import { describe, it, expect } from 'vitest';
import { Store } from '../store';
import { Match, type MatchSeat } from '../game/match';
import {
  CHEST_SLOTS, CHEST_DEFS, chestState, gemsToSkip, rollChestRewards,
  randomChestRarity, unlockedCards, getCard, DEFAULT_TRIO, COOLDOWN_BATTLE_CONFIG,
} from '@croyal/shared';

function mkUser(store: Store, tg: number) {
  return store.createUser({ telegramId: tg, nickname: 'Chest' + tg, language: 'en' });
}

describe('chest slots & awarding', () => {
  it('a win drops a chest into a free slot; slots cap at CHEST_SLOTS', () => {
    const store = new Store();
    const u = mkUser(store, 1);
    for (let i = 0; i < CHEST_SLOTS; i++) {
      expect(store.awardChest(u.id, 'wood')).toBe('wood');
    }
    expect(store.getUser(u.id)!.chests.length).toBe(CHEST_SLOTS);
    // full → forfeited
    expect(store.awardChest(u.id, 'gold')).toBeNull();
    expect(store.getUser(u.id)!.chests.length).toBe(CHEST_SLOTS);
  });
});

describe('unlock timer', () => {
  it('starts one unlock; a second concurrent unlock is rejected', () => {
    const store = new Store();
    const u = mkUser(store, 2);
    store.awardChest(u.id, 'wood');
    store.awardChest(u.id, 'silver');
    const [c0, c1] = store.getUser(u.id)!.chests;
    const t0 = 1_000_000;
    store.startChestUnlock(u.id, c0.id, t0);
    const chest = store.getUser(u.id)!.chests[0];
    expect(chestState(chest, t0)).toBe('unlocking');
    expect(chest.unlockAt).toBe(t0 + CHEST_DEFS.wood.unlockMinutes * 60000);
    // second one can't unlock while the first is
    expect(() => store.startChestUnlock(u.id, c1.id, t0 + 1000)).toThrow(/another chest/i);
    // re-unlocking an already-unlocking chest is rejected too
    expect(() => store.startChestUnlock(u.id, c0.id, t0 + 1000)).toThrow(/already unlocking/i);
  });

  it('becomes ready exactly at unlockAt', () => {
    const store = new Store();
    const u = mkUser(store, 3);
    store.awardChest(u.id, 'gold');
    const c = store.getUser(u.id)!.chests[0];
    const t0 = 5_000_000;
    store.startChestUnlock(u.id, c.id, t0);
    const dur = CHEST_DEFS.gold.unlockMinutes * 60000;
    const chest = store.getUser(u.id)!.chests[0];
    expect(chestState(chest, t0 + dur - 1)).toBe('unlocking');
    expect(chestState(chest, t0 + dur)).toBe('ready');
  });
});

describe('opening', () => {
  it('a ready chest opens for free, grants its gold + cards, and frees the slot', () => {
    const store = new Store();
    const u = mkUser(store, 4);
    store.awardChest(u.id, 'silver');
    const c = store.getUser(u.id)!.chests[0];
    const t0 = 9_000_000;
    store.startChestUnlock(u.id, c.id, t0);
    const ready = t0 + CHEST_DEFS.silver.unlockMinutes * 60000;
    const goldBefore = store.getUser(u.id)!.gold;
    const { rewards, profile } = store.openChest(u.id, c.id, {}, ready, () => 0.5);
    expect(rewards.gold).toBe(CHEST_DEFS.silver.gold);
    const cardTotal = Object.values(rewards.cards).reduce((a, b) => a + b, 0);
    expect(cardTotal).toBe(CHEST_DEFS.silver.cards);
    expect(profile.gold).toBe(goldBefore + CHEST_DEFS.silver.gold);
    expect(profile.chests.length).toBe(0); // slot freed
    // every dropped card is in the player's unlocked pool
    const allowed = new Set(unlockedCards(profile.trophies));
    for (const id of Object.keys(rewards.cards)) expect(allowed.has(id)).toBe(true);
  });

  it('an unready chest cannot be opened for free, but gems skip it (charging gemsToSkip)', () => {
    const store = new Store();
    const u = mkUser(store, 5);
    store.updateUser(u.id, { gems: 100 });
    store.awardChest(u.id, 'gold');
    const c = store.getUser(u.id)!.chests[0];
    const t0 = 2_000_000;
    store.startChestUnlock(u.id, c.id, t0);
    const mid = t0 + 60000; // 1 min in, far from ready
    expect(() => store.openChest(u.id, c.id, {}, mid)).toThrow(/not ready/i);
    const chest = store.getUser(u.id)!.chests[0];
    const cost = gemsToSkip(chest, mid);
    expect(cost).toBeGreaterThan(0);
    const gemsBefore = store.getUser(u.id)!.gems;
    const { profile } = store.openChest(u.id, c.id, { withGems: true }, mid, () => 0.5);
    expect(profile.gems).toBe(gemsBefore - cost);
    expect(profile.chests.length).toBe(0);
  });

  it('gem open is refused when the player cannot afford it', () => {
    const store = new Store();
    const u = mkUser(store, 6);
    store.updateUser(u.id, { gems: 0 });
    store.awardChest(u.id, 'legendary');
    const c = store.getUser(u.id)!.chests[0];
    const t0 = 3_000_000;
    store.startChestUnlock(u.id, c.id, t0);
    expect(() => store.openChest(u.id, c.id, { withGems: true }, t0 + 1000)).toThrow(/not enough gems/i);
    expect(store.getUser(u.id)!.chests.length).toBe(1); // untouched
  });
});

describe('reward rolling & rarity weighting', () => {
  it('gemsToSkip is 0 once ready and >=1 otherwise', () => {
    const slot = { id: 'x', rarity: 'wood' as const, unlockAt: 1000 };
    expect(gemsToSkip(slot, 1000)).toBe(0);
    expect(gemsToSkip(slot, 999)).toBeGreaterThanOrEqual(1);
  });

  it('legendary chest guarantees a legendary card when the pool has one', () => {
    const pool = unlockedCards(999999); // everything unlocked
    const legendary = pool.filter((id) => getCard(id)?.rarity === 'legendary');
    expect(legendary.length).toBeGreaterThan(0);
    const r = rollChestRewards('legendary', pool, () => 0, legendary);
    const gotLegendary = Object.keys(r.cards).some((id) => getCard(id)?.rarity === 'legendary');
    expect(gotLegendary).toBe(true);
  });

  it('a finished match earns the WINNER a chest and grants no instant cards', () => {
    const store = new Store();
    const winner = store.createUser({ telegramId: 71, nickname: 'Winner', language: 'en' });
    const loser = store.createUser({ telegramId: 72, nickname: 'Loser', language: 'en' });
    const seatA: MatchSeat = { userId: winner.id, deck: [...DEFAULT_TRIO], send: () => {} };
    const seatB: MatchSeat = { userId: loser.id, deck: [...DEFAULT_TRIO], send: () => {} };
    const match = new Match('m1', seatA, seatB, store, () => {}, COOLDOWN_BATTLE_CONFIG);
    match.handleLeave(loser.id); // loser forfeits -> winner is seatA

    const w = store.getUser(winner.id)!;
    const l = store.getUser(loser.id)!;
    expect(w.chests.length).toBe(1); // winner earned a chest
    expect(l.chests.length).toBe(0); // loser earned none
    // no instant card drops — inventory counts stay at 0 until the chest opens
    expect(Object.values(w.cards).every((c) => c.count === 0)).toBe(true);
    expect(w.gold).toBeGreaterThan(loser.gold); // winner gold > starting
  });

  it('randomChestRarity respects weights (wood most common)', () => {
    const counts: Record<string, number> = {};
    let seed = 12345;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 4000; i++) {
      const r = randomChestRarity(rng);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    expect(counts.wood).toBeGreaterThan(counts.silver ?? 0);
    expect(counts.silver ?? 0).toBeGreaterThan(counts.legendary ?? 0);
  });
});
