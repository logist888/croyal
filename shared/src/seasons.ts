/**
 * Monthly seasons + ladder soft-reset (retention loop #4, docs/ROADMAP.ru.md).
 *
 * A season is one UTC calendar month. When a new month begins, the player's
 * trophies soft-reset (keep everything up to a floor, then half the excess) and
 * they get an end-of-season reward sized by the league they peaked at, held as a
 * pending claim. Timestamp-based: the store detects the rollover on the first
 * read/action of the new month — no scheduled job.
 */
import { leagueForTrophies, LEAGUES } from './constants';

export interface SeasonReward {
  season: number; // season index this reward is for
  league: number; // peak league index reached that season
  gold: number;
  gems: number;
}

export interface SeasonState {
  index: number; // the season the player is currently in
  peakTrophies: number; // highest trophies reached this season
  pendingReward: SeasonReward | null; // unclaimed end-of-season reward
}

/** UTC month index since year 0 — the season boundary. */
export function seasonIndex(now: number): number {
  const d = new Date(now);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Milliseconds until the current season (UTC month) ends. */
export function seasonRemainingMs(now: number): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return Math.max(0, next - now);
}

/**
 * Trophies below the floor are kept as-is; above it, half the excess carries
 * over. Gentle enough that progress isn't wiped, sharp enough to re-mix the
 * ladder each month.
 */
export const SEASON_RESET_FLOOR = 600;
export function softResetTrophies(trophies: number): number {
  if (trophies <= SEASON_RESET_FLOOR) return trophies;
  return SEASON_RESET_FLOOR + Math.round((trophies - SEASON_RESET_FLOOR) * 0.5);
}

/** End-of-season reward for the league the player peaked at. */
export function seasonRewardFor(season: number, peakTrophies: number): SeasonReward {
  const league = leagueForTrophies(peakTrophies).index;
  return { season, league, gold: 100 + league * 75, gems: league * 4 };
}

/** League name reached (for the reward card). */
export function leagueName(index: number, ru: boolean): string {
  const lg = LEAGUES[Math.max(0, Math.min(LEAGUES.length - 1, index))];
  return ru ? lg.ru : lg.en;
}
