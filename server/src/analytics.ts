/**
 * In-memory telemetry (docs/ROADMAP.ru.md — Этап 4.1).
 *
 * "Без цифр баланс и экономика вслепую." This is a lightweight, dependency-free
 * aggregator: a funnel (register → matchmaking → completed a match), D1/D7
 * retention cohorts, a battle-length distribution, and per-card win rates. It
 * lives in process memory and RESETS ON RESTART — enough to read live behavior
 * during the soft launch and steer balance; a durable analytics sink (or an
 * external product-analytics tool) is the scale-up path.
 *
 * The class is pure and time-injectable (every method takes `now`), so it is
 * unit-tested directly; a process-wide singleton `analytics` is what the server
 * hooks feed. Never throws — telemetry must never break a request or a match.
 */
import { dayIndex } from '@croyal/shared';

export interface MatchEndEvent {
  durationSec: number;
  ranked: boolean; // false for friendly/practice (excluded from card win rates)
  vsBot: boolean; // at least one seat was a bot
  humanUserIds: string[]; // real players in the match (funnel + retention)
  winnerCards: string[]; // the winning side's cards
  loserCards: string[]; // the losing side's cards
}

interface UserRec { firstDay: number; d1: boolean; d7: boolean; }
interface CardStat { plays: number; wins: number; }

/** Upper edges (seconds) of the battle-length histogram; a final ">last" bucket is appended. */
export const DURATION_BUCKETS = [30, 60, 90, 120, 180, 240] as const;

function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export class Analytics {
  private registrations = 0;
  private logins = 0;
  private queues = 0;
  private matchesEnded = 0;
  private rankedMatches = 0;
  private friendlyMatches = 0;
  private botMatches = 0;

  // Funnel: unique users reaching each step.
  private registeredUsers = new Set<string>();
  private queuedUsers = new Set<string>();
  private playedUsers = new Set<string>();

  // Battle length.
  private durCount = 0;
  private durSum = 0;
  private durMin = Infinity;
  private durMax = 0;
  private durHist = new Array<number>(DURATION_BUCKETS.length + 1).fill(0);

  // Retention (one small record per user seen since boot).
  private users = new Map<string, UserRec>();

  // Per-card win rates (ranked matches only).
  private cards = new Map<string, CardStat>();

  recordRegister(userId: string, now: number = Date.now()): void {
    this.registrations++;
    this.registeredUsers.add(userId);
    this.touchUser(userId, now);
  }

  /** A returning player's session (login). Drives DAU-ish activity + retention. */
  recordActivity(userId: string, now: number = Date.now()): void {
    this.logins++;
    this.touchUser(userId, now);
  }

  recordQueue(userId: string): void {
    this.queues++;
    this.queuedUsers.add(userId);
  }

  recordMatchEnd(e: MatchEndEvent, now: number = Date.now()): void {
    this.matchesEnded++;
    if (e.ranked) this.rankedMatches++; else this.friendlyMatches++;
    if (e.vsBot) this.botMatches++;

    const d = Math.max(0, e.durationSec);
    this.durCount++;
    this.durSum += d;
    this.durMin = Math.min(this.durMin, d);
    this.durMax = Math.max(this.durMax, d);
    this.durHist[this.bucket(d)]++;

    for (const uid of e.humanUserIds) {
      this.playedUsers.add(uid);
      this.touchUser(uid, now); // playing is activity too
    }

    if (e.ranked) {
      for (const c of e.winnerCards) this.card(c, true);
      for (const c of e.loserCards) this.card(c, false);
    }
  }

  private bucket(d: number): number {
    for (let i = 0; i < DURATION_BUCKETS.length; i++) if (d <= DURATION_BUCKETS[i]) return i;
    return DURATION_BUCKETS.length;
  }

  private card(id: string, won: boolean): void {
    const s = this.cards.get(id) ?? { plays: 0, wins: 0 };
    s.plays++;
    if (won) s.wins++;
    this.cards.set(id, s);
  }

  private touchUser(userId: string, now: number): void {
    const day = dayIndex(now);
    const rec = this.users.get(userId);
    if (!rec) {
      this.users.set(userId, { firstDay: day, d1: false, d7: false });
      return;
    }
    const delta = day - rec.firstDay;
    if (delta === 1) rec.d1 = true; // active the day after signup
    if (delta === 7) rec.d7 = true; // active a week after signup
  }

  /** A JSON-serializable snapshot for the admin metrics endpoint. */
  report(now: number = Date.now()): Record<string, unknown> {
    const today = dayIndex(now);
    let d1n = 0, d1d = 0, d7n = 0, d7d = 0;
    for (const rec of this.users.values()) {
      if (today - rec.firstDay >= 1) { d1d++; if (rec.d1) d1n++; }
      if (today - rec.firstDay >= 7) { d7d++; if (rec.d7) d7n++; }
    }
    const rate = (n: number, d: number) => (d > 0 ? round(n / d) : null);

    const histogram: Record<string, number> = {};
    DURATION_BUCKETS.forEach((edge, i) => { histogram[`<=${edge}s`] = this.durHist[i]; });
    histogram[`>${DURATION_BUCKETS[DURATION_BUCKETS.length - 1]}s`] = this.durHist[DURATION_BUCKETS.length];

    const cardWinrates = [...this.cards.entries()]
      .map(([id, s]) => ({ id, plays: s.plays, wins: s.wins, winrate: s.plays > 0 ? round(s.wins / s.plays) : 0 }))
      .sort((a, b) => b.plays - a.plays);

    return {
      note: 'in-memory telemetry — resets on restart',
      funnel: {
        registrations: this.registrations,
        uniqueRegistered: this.registeredUsers.size,
        reachedMatchmaking: this.queuedUsers.size,
        completedAMatch: this.playedUsers.size,
        queueToPlayRate: rate(this.playedUsers.size, this.queuedUsers.size),
        registerToPlayRate: rate(this.playedUsers.size, this.registeredUsers.size),
      },
      activity: { logins: this.logins, knownUsers: this.users.size },
      retention: {
        d1: { retained: d1n, eligible: d1d, rate: rate(d1n, d1d) },
        d7: { retained: d7n, eligible: d7d, rate: rate(d7n, d7d) },
      },
      matches: {
        ended: this.matchesEnded,
        ranked: this.rankedMatches,
        friendly: this.friendlyMatches,
        vsBot: this.botMatches,
        duration: {
          avgSec: this.durCount > 0 ? round(this.durSum / this.durCount, 1) : 0,
          minSec: this.durCount > 0 ? round(this.durMin, 1) : 0,
          maxSec: round(this.durMax, 1),
          histogram,
        },
      },
      cardWinrates,
    };
  }
}

/** Process-wide telemetry sink fed by the server hooks (mirrors the `store` singleton). */
export const analytics = new Analytics();
