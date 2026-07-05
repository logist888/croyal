/**
 * Daily engagement: a login-streak reward track + a set of daily quests that
 * reset each UTC day. Retention loop #2 (see docs/ROADMAP.ru.md, Этап 1).
 *
 * State is timestamp-based (a UTC "day index"), so nothing runs in the
 * background — the store refreshes a player's daily state whenever it's read or
 * a tracked action happens. Pure data + helpers here; the store owns mutation.
 */

/** Quest kinds are tracked from existing game signals — no new plumbing. */
export type QuestType = 'play' | 'win' | 'openChest' | 'upgrade';

export interface DailyQuest {
  id: QuestType; // one quest per type per day → the type is a stable id
  type: QuestType;
  target: number;
  progress: number;
  rewardGold: number;
  rewardGems: number;
  claimed: boolean;
}

export interface DailyState {
  dayIndex: number; // UTC day this state was rolled for
  streak: number; // consecutive active days (drives the login reward)
  rewardClaimed: boolean; // today's login reward claimed
  quests: DailyQuest[];
}

/** UTC day number since the epoch (login/quest reset boundary). */
export function dayIndex(now: number): number {
  return Math.floor(now / 86_400_000);
}

/** Login-streak reward cycle (position = (streak-1) % 7). Day 7 is the big one. */
export const DAILY_REWARDS: Array<{ gold: number; gems: number }> = [
  { gold: 50, gems: 0 },
  { gold: 80, gems: 0 },
  { gold: 0, gems: 5 },
  { gold: 120, gems: 0 },
  { gold: 0, gems: 10 },
  { gold: 150, gems: 0 },
  { gold: 100, gems: 20 },
];

export function loginReward(streak: number): { gold: number; gems: number } {
  const i = ((Math.max(1, streak) - 1) % DAILY_REWARDS.length);
  return DAILY_REWARDS[i];
}

interface QuestDef {
  type: QuestType;
  target: number;
  rewardGold: number;
  rewardGems: number;
}

/** The pool daily quests are drawn from (3 of these per day). */
export const QUEST_POOL: QuestDef[] = [
  { type: 'play', target: 3, rewardGold: 40, rewardGems: 0 },
  { type: 'win', target: 2, rewardGold: 60, rewardGems: 2 },
  { type: 'openChest', target: 1, rewardGold: 30, rewardGems: 0 },
  { type: 'upgrade', target: 1, rewardGold: 50, rewardGems: 0 },
];

export const DAILY_QUEST_COUNT = 3;

/**
 * Deterministically pick DAILY_QUEST_COUNT quests for a given day. Rotating by
 * the day index gives everyone the same varied rotation with no RNG/storage.
 */
export function rollDailyQuests(day: number): DailyQuest[] {
  const n = QUEST_POOL.length;
  const drop = ((day % n) + n) % n; // which one to leave out today
  const chosen = QUEST_POOL.filter((_, i) => i !== drop).slice(0, DAILY_QUEST_COUNT);
  return chosen.map((q) => ({
    id: q.type,
    type: q.type,
    target: q.target,
    progress: 0,
    rewardGold: q.rewardGold,
    rewardGems: q.rewardGems,
    claimed: false,
  }));
}

/** A fresh daily state for `day` given the previous state (streak continuity). */
export function freshDailyState(day: number, prev: DailyState | null): DailyState {
  let streak = 1;
  if (prev) streak = prev.dayIndex === day - 1 ? prev.streak + 1 : 1;
  return { dayIndex: day, streak, rewardClaimed: false, quests: rollDailyQuests(day) };
}

export function questClaimable(q: DailyQuest): boolean {
  return !q.claimed && q.progress >= q.target;
}

/** Anything to collect right now (login reward or a finished quest)? */
export function hasDailyRewards(state: DailyState): boolean {
  return !state.rewardClaimed || state.quests.some(questClaimable);
}
