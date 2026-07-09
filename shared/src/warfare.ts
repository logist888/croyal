/**
 * Clan wars (retention loop #5, docs/ROADMAP.ru.md — Этап 2).
 *
 * A war is one UTC week. Clan members earn their clan **war points** by winning
 * ranked battles that week; clans are ranked live by their weekly score. When a
 * new week begins the previous week is finalised: each contributing member banks
 * a reward scaled by their own contribution and the clan's final score tier, held
 * as a pending claim. Timestamp-based — the store detects the rollover on the
 * first read/action of the new week, no scheduled job (same pattern as seasons).
 */

/** One war week in milliseconds. */
export const WAR_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 1970-01-05 was a Monday — anchor weeks to a Monday 00:00 UTC boundary. */
const WAR_EPOCH = Date.UTC(1970, 0, 5);

/** UTC week index since the Monday epoch — the war boundary. */
export function warWeekIndex(now: number): number {
  return Math.floor((now - WAR_EPOCH) / WAR_WEEK_MS);
}

/** Milliseconds until the current war week ends. */
export function warWeekRemainingMs(now: number): number {
  const into = ((now - WAR_EPOCH) % WAR_WEEK_MS + WAR_WEEK_MS) % WAR_WEEK_MS;
  return WAR_WEEK_MS - into;
}

/** War points a member's clan gains per ranked win. */
export const WAR_POINTS_PER_WIN = 3;

/** A clan's tier for the week, from its total war score (drives the reward multiplier). */
export function clanWarTier(score: number): number {
  if (score >= 600) return 3;
  if (score >= 300) return 2;
  if (score >= 100) return 1;
  return 0;
}

/** Reward for one member: their contribution × a clan-tier multiplier. */
export function memberWarReward(contribution: number, clanScore: number): { gold: number; gems: number } {
  if (contribution <= 0) return { gold: 0, gems: 0 };
  const mult = 1 + clanWarTier(clanScore) * 0.5; // 1, 1.5, 2, 2.5
  return {
    gold: Math.round(contribution * 5 * mult),
    gems: Math.floor((contribution * mult) / 25),
  };
}

export interface ClanWarState {
  weekIndex: number;
  score: number; // total clan war points this week
  contributions: Record<string, number>; // userId -> points contributed this week
}

export interface WarReward {
  week: number; // the war week this reward is for
  gold: number;
  gems: number;
  score: number; // the clan's final weekly score (for the reward card)
}

export function freshWar(weekIndex: number): ClanWarState {
  return { weekIndex, score: 0, contributions: {} };
}
