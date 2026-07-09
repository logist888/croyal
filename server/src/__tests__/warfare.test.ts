import { describe, it, expect } from 'vitest';
import {
  warWeekIndex, warWeekRemainingMs, WAR_WEEK_MS, WAR_POINTS_PER_WIN,
  clanWarTier, memberWarReward, freshWar, OPEN_BATTLE_CONFIG,
} from '@croyal/shared';
import { Store } from '../store';
import { Match } from '../game/match';

const W1 = Date.UTC(2026, 0, 12); // a Monday-ish anchor within one war week
const W2 = W1 + WAR_WEEK_MS;

describe('clan-war math (pure)', () => {
  it('warWeekIndex advances by one each week; remaining is the gap to the next', () => {
    expect(warWeekIndex(W2) - warWeekIndex(W1)).toBe(1);
    expect(warWeekIndex(W1 + WAR_WEEK_MS - 1)).toBe(warWeekIndex(W1)); // still same week
    expect(warWeekRemainingMs(W1 + WAR_WEEK_MS - 1000)).toBe(1000);
  });

  it('clan tiers step at 100 / 300 / 600', () => {
    expect(clanWarTier(0)).toBe(0);
    expect(clanWarTier(99)).toBe(0);
    expect(clanWarTier(100)).toBe(1);
    expect(clanWarTier(300)).toBe(2);
    expect(clanWarTier(600)).toBe(3);
  });

  it('member reward scales with contribution and clan tier', () => {
    expect(memberWarReward(0, 500)).toEqual({ gold: 0, gems: 0 });
    // 120 pts, clan score 120 -> tier 1 -> mult 1.5
    expect(memberWarReward(120, 120)).toEqual({ gold: 900, gems: 7 });
    // same contribution, higher tier pays more
    const low = memberWarReward(100, 50); // tier 0, mult 1
    const high = memberWarReward(100, 700); // tier 3, mult 2.5
    expect(high.gold).toBeGreaterThan(low.gold);
  });

  it('freshWar starts empty for the given week', () => {
    expect(freshWar(42)).toEqual({ weekIndex: 42, score: 0, contributions: {} });
  });
});

describe('clan wars (store)', () => {
  function setup() {
    const store = new Store();
    const leader = store.createUser({ telegramId: 5001, nickname: 'WarLead' + Math.floor(Math.random() * 1e6), language: 'en' });
    const clan = store.createClan(leader.id, 'War Clan ' + Math.floor(Math.random() * 1e6));
    return { store, leaderId: leader.id, clanId: clan.id };
  }

  it('contributions accumulate on the clan within a week', () => {
    const { store, leaderId } = setup();
    store.addWarContribution(leaderId, WAR_POINTS_PER_WIN, W1);
    store.addWarContribution(leaderId, WAR_POINTS_PER_WIN, W1);
    const s = store.clanWarSummary(leaderId, W1)!;
    expect(s.score).toBe(2 * WAR_POINTS_PER_WIN);
    expect(s.yourContribution).toBe(2 * WAR_POINTS_PER_WIN);
  });

  it('a new week banks a reward for contributors and resets the score', () => {
    const { store, leaderId, clanId } = setup();
    for (let i = 0; i < 40; i++) store.addWarContribution(leaderId, WAR_POINTS_PER_WIN, W1); // 120 pts
    expect(store.getUser(leaderId)!.warReward).toBeNull();

    store.ensureClanWar(clanId, W2); // rollover
    const reward = store.getUser(leaderId)!.warReward!;
    expect(reward).toEqual({ week: warWeekIndex(W1), gold: 900, gems: 7, score: 120 });
    expect(store.clanWarSummary(leaderId, W2)!.score).toBe(0); // fresh week
  });

  it('claiming grants the reward once then errors; non-contributors get nothing', () => {
    const { store, leaderId, clanId } = setup();
    // a second member who never fights
    const bench = store.createUser({ telegramId: 5002, nickname: 'Bench' + Math.floor(Math.random() * 1e6), language: 'en' });
    store.joinClan(bench.id, clanId);
    for (let i = 0; i < 40; i++) store.addWarContribution(leaderId, WAR_POINTS_PER_WIN, W1);
    store.ensureClanWar(clanId, W2);

    expect(store.getUser(bench.id)!.warReward).toBeNull(); // didn't contribute
    const before = store.getUser(leaderId)!;
    const goldBefore = before.gold, gemsBefore = before.gems;
    const claimed = store.claimWarReward(leaderId, W2);
    expect(claimed.gold).toBe(goldBefore + 900);
    expect(claimed.gems).toBe(gemsBefore + 7);
    expect(claimed.warReward).toBeNull();
    expect(() => store.claimWarReward(leaderId, W2)).toThrow(/no war reward/i);
  });

  it('topWarClans ranks clans by this week\'s score', () => {
    const store = new Store();
    const a = store.createUser({ telegramId: 5101, nickname: 'CA' + Math.floor(Math.random() * 1e6), language: 'en' });
    const b = store.createUser({ telegramId: 5102, nickname: 'CB' + Math.floor(Math.random() * 1e6), language: 'en' });
    const ca = store.createClan(a.id, 'Alpha ' + Math.floor(Math.random() * 1e6));
    const cb = store.createClan(b.id, 'Bravo ' + Math.floor(Math.random() * 1e6));
    store.addWarContribution(a.id, 30, W1);
    store.addWarContribution(b.id, 90, W1);
    const top = store.topWarClans(10, W1);
    const rankA = top.find((e) => e.clanId === ca.id)!;
    const rankB = top.find((e) => e.clanId === cb.id)!;
    expect(rankB.rank).toBeLessThan(rankA.rank); // Bravo scored more -> ranks higher
    expect(rankB.score).toBe(90);
  });

  it('a ranked win feeds the clan war; a friendly one does not', () => {
    const store = new Store();
    const winner = store.createUser({ telegramId: 5201, nickname: 'WW' + Math.floor(Math.random() * 1e6), language: 'en' });
    const loser = store.createUser({ telegramId: 5202, nickname: 'WL' + Math.floor(Math.random() * 1e6), language: 'en' });
    const clan = store.createClan(winner.id, 'Fighters ' + Math.floor(Math.random() * 1e6));
    const send = () => {};
    const mk = (id: string, friendly: boolean) => new Match(
      id,
      { userId: winner.id, deck: store.getUser(winner.id)!.trio, send },
      { userId: loser.id, deck: store.getUser(loser.id)!.trio, send },
      store, () => {}, OPEN_BATTLE_CONFIG, friendly,
    );
    mk('ranked-war', false).handleLeave(loser.id); // loser forfeits -> winner wins (ranked)
    expect(store.clanWarSummary(winner.id)!.score).toBe(WAR_POINTS_PER_WIN);
    mk('friendly-war', true).handleLeave(loser.id); // friendly -> no war points
    expect(store.clanWarSummary(winner.id)!.score).toBe(WAR_POINTS_PER_WIN);
    expect(store.getUser(clan.leaderId)!.id).toBe(winner.id);
  });
});
