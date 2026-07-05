import { describe, it, expect } from 'vitest';
import { Store } from '../store';
import { Match, type MatchSeat } from '../game/match';
import {
  dayIndex, loginReward, rollDailyQuests, DAILY_QUEST_COUNT, DAILY_REWARDS,
  freshDailyState, questClaimable, DEFAULT_TRIO, COOLDOWN_BATTLE_CONFIG,
} from '@croyal/shared';

const DAY = 86_400_000;
function mk(store: Store, tg: number) {
  return store.createUser({ telegramId: tg, nickname: 'Daily' + tg, language: 'en' });
}

describe('daily helpers (pure)', () => {
  it('dayIndex advances by one per UTC day', () => {
    expect(dayIndex(DAY * 100 + 5000)).toBe(100);
    expect(dayIndex(DAY * 101)).toBe(101);
  });

  it('rollDailyQuests picks DAILY_QUEST_COUNT distinct quests and rotates by day', () => {
    const a = rollDailyQuests(10);
    expect(a.length).toBe(DAILY_QUEST_COUNT);
    expect(new Set(a.map((q) => q.type)).size).toBe(DAILY_QUEST_COUNT);
    // rotation drops a different quest on different days
    const droppedA = new Set(a.map((q) => q.type));
    const b = rollDailyQuests(11);
    const droppedB = new Set(b.map((q) => q.type));
    expect([...droppedA].sort().join()).not.toBe([...droppedB].sort().join());
  });

  it('loginReward cycles over the 7-day track', () => {
    expect(loginReward(1)).toEqual(DAILY_REWARDS[0]);
    expect(loginReward(7)).toEqual(DAILY_REWARDS[6]);
    expect(loginReward(8)).toEqual(DAILY_REWARDS[0]); // wraps
  });

  it('streak continues on consecutive days, resets after a gap', () => {
    const d1 = freshDailyState(100, null);
    expect(d1.streak).toBe(1);
    const d2 = freshDailyState(101, d1);
    expect(d2.streak).toBe(2);
    const d3 = freshDailyState(105, d2); // missed days
    expect(d3.streak).toBe(1);
  });
});

describe('store: login reward', () => {
  it('claims once per day and grants the streak reward', () => {
    const store = new Store();
    const u = mk(store, 1);
    const now = DAY * 1000 + 1000;
    const goldBefore = store.getUser(u.id)!.gold;
    const after = store.claimDailyReward(u.id, now);
    const reward = loginReward(store.getUser(u.id)!.daily!.streak);
    expect(after.gold).toBe(goldBefore + reward.gold);
    expect(after.gems).toBe(reward.gems);
    // second claim same day rejected
    expect(() => store.claimDailyReward(u.id, now + 1000)).toThrow(/already claimed/i);
  });

  it('a new day re-rolls quests and re-opens the login reward', () => {
    const store = new Store();
    const u = mk(store, 2);
    const day1 = DAY * 2000 + 500;
    store.claimDailyReward(u.id, day1);
    expect(store.getUser(u.id)!.daily!.rewardClaimed).toBe(true);
    store.ensureDaily(u.id, day1 + DAY); // next day
    const d = store.getUser(u.id)!.daily!;
    expect(d.rewardClaimed).toBe(false);
    expect(d.streak).toBe(2);
    expect(d.dayIndex).toBe(dayIndex(day1 + DAY));
  });
});

describe('store: quests progress & claim', () => {
  it('progress advances the right quest and caps at target; claim pays out once', () => {
    const store = new Store();
    const u = mk(store, 3);
    const now = DAY * 3000;
    store.ensureDaily(u.id, now);
    // force a known quest set so the test is deterministic regardless of day
    store.getUser(u.id)!.daily!.quests = [
      { id: 'play', type: 'play', target: 3, progress: 0, rewardGold: 40, rewardGems: 0, claimed: false },
    ];
    store.progressQuest(u.id, 'play', 1, now);
    store.progressQuest(u.id, 'play', 5, now); // overshoot -> caps
    const q = store.getUser(u.id)!.daily!.quests[0];
    expect(q.progress).toBe(3);
    expect(questClaimable(q)).toBe(true);
    const goldBefore = store.getUser(u.id)!.gold;
    const after = store.claimQuest(u.id, 'play', now);
    expect(after.gold).toBe(goldBefore + 40);
    expect(() => store.claimQuest(u.id, 'play', now)).toThrow(/already claimed/i);
  });

  it('claiming an incomplete quest is rejected', () => {
    const store = new Store();
    const u = mk(store, 4);
    const now = DAY * 4000;
    store.ensureDaily(u.id, now);
    store.getUser(u.id)!.daily!.quests = [
      { id: 'win', type: 'win', target: 2, progress: 0, rewardGold: 60, rewardGems: 2, claimed: false },
    ];
    expect(() => store.claimQuest(u.id, 'win', now)).toThrow(/not complete/i);
  });

  it('a match win advances play + win quests; a loss only advances play', () => {
    const store = new Store();
    const winner = store.createUser({ telegramId: 51, nickname: 'WinnerDaily', language: 'en' });
    const loser = store.createUser({ telegramId: 52, nickname: 'LoserDaily', language: 'en' });
    // give both a full quest set
    for (const id of [winner.id, loser.id]) {
      store.ensureDaily(id);
      store.getUser(id)!.daily!.quests = [
        { id: 'play', type: 'play', target: 3, progress: 0, rewardGold: 40, rewardGems: 0, claimed: false },
        { id: 'win', type: 'win', target: 2, progress: 0, rewardGold: 60, rewardGems: 2, claimed: false },
      ];
    }
    const seatA: MatchSeat = { userId: winner.id, deck: [...DEFAULT_TRIO], send: () => {} };
    const seatB: MatchSeat = { userId: loser.id, deck: [...DEFAULT_TRIO], send: () => {} };
    const match = new Match('dq', seatA, seatB, store, () => {}, COOLDOWN_BATTLE_CONFIG);
    match.handleLeave(loser.id); // loser forfeits -> winner wins

    const wq = store.getUser(winner.id)!.daily!.quests;
    const lq = store.getUser(loser.id)!.daily!.quests;
    expect(wq.find((q) => q.type === 'play')!.progress).toBe(1);
    expect(wq.find((q) => q.type === 'win')!.progress).toBe(1);
    expect(lq.find((q) => q.type === 'play')!.progress).toBe(1);
    expect(lq.find((q) => q.type === 'win')!.progress).toBe(0);
  });

  it('opening a chest advances the openChest quest', () => {
    const store = new Store();
    const u = mk(store, 6);
    store.ensureDaily(u.id);
    store.getUser(u.id)!.daily!.quests = [
      { id: 'openChest', type: 'openChest', target: 1, progress: 0, rewardGold: 30, rewardGems: 0, claimed: false },
    ];
    store.awardChest(u.id, 'wood');
    const c = store.getUser(u.id)!.chests[0];
    const t0 = 1_000_000;
    store.startChestUnlock(u.id, c.id, t0);
    store.openChest(u.id, c.id, {}, t0 + 999 * 60000, () => 0.5);
    expect(store.getUser(u.id)!.daily!.quests[0].progress).toBe(1);
  });
});
