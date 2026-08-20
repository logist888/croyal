import { describe, it, expect } from 'vitest';
import { Analytics } from '../analytics';

const DAY = 86_400_000;

describe('Analytics funnel', () => {
  it('tracks registrations, matchmaking reach, and completed matches (unique users)', () => {
    const a = new Analytics();
    a.recordRegister('u1', 0);
    a.recordRegister('u2', 0);
    a.recordQueue('u1');
    a.recordQueue('u1'); // repeat queue is same unique user
    a.recordMatchEnd(
      { durationSec: 100, ranked: true, vsBot: true, humanUserIds: ['u1'], winnerCards: ['knight'], loserCards: ['archer'] },
      0,
    );
    const r = a.report(0) as any;
    expect(r.funnel.registrations).toBe(2);
    expect(r.funnel.uniqueRegistered).toBe(2);
    expect(r.funnel.reachedMatchmaking).toBe(1);
    expect(r.funnel.completedAMatch).toBe(1);
    expect(r.funnel.queueToPlayRate).toBe(1); // 1 of 1 queued users played
    expect(r.funnel.registerToPlayRate).toBe(0.5); // 1 of 2 registered users played
  });
});

describe('Analytics battle length', () => {
  it('averages and buckets durations', () => {
    const a = new Analytics();
    const end = (d: number) =>
      a.recordMatchEnd({ durationSec: d, ranked: true, vsBot: false, humanUserIds: [], winnerCards: [], loserCards: [] }, 0);
    end(30); // <=30
    end(90); // <=90
    end(240); // <=240
    const r = a.report(0) as any;
    expect(r.matches.ended).toBe(3);
    expect(r.matches.duration.avgSec).toBe(120); // (30+90+240)/3
    expect(r.matches.duration.minSec).toBe(30);
    expect(r.matches.duration.maxSec).toBe(240);
    expect(r.matches.duration.histogram['<=30s']).toBe(1);
    expect(r.matches.duration.histogram['<=90s']).toBe(1);
    expect(r.matches.duration.histogram['<=240s']).toBe(1);
    expect(r.matches.duration.histogram['>240s']).toBe(0);
  });
});

describe('Analytics card win rates', () => {
  it('counts winner cards as wins, loser cards as plays; ignores friendly matches', () => {
    const a = new Analytics();
    a.recordMatchEnd(
      { durationSec: 60, ranked: true, vsBot: false, humanUserIds: ['w', 'l'], winnerCards: ['knight'], loserCards: ['archer'] },
      0,
    );
    a.recordMatchEnd(
      { durationSec: 60, ranked: true, vsBot: false, humanUserIds: ['w', 'l'], winnerCards: ['archer'], loserCards: ['knight'] },
      0,
    );
    // Friendly must not affect card stats.
    a.recordMatchEnd(
      { durationSec: 60, ranked: false, vsBot: false, humanUserIds: ['w', 'l'], winnerCards: ['knight'], loserCards: ['archer'] },
      0,
    );
    const r = a.report(0) as any;
    const knight = r.cardWinrates.find((c: any) => c.id === 'knight');
    const archer = r.cardWinrates.find((c: any) => c.id === 'archer');
    expect(knight).toEqual({ id: 'knight', plays: 2, wins: 1, winrate: 0.5 });
    expect(archer).toEqual({ id: 'archer', plays: 2, wins: 1, winrate: 0.5 });
    expect(r.matches.friendly).toBe(1);
    expect(r.matches.ranked).toBe(2);
  });
});

describe('Analytics retention cohorts', () => {
  it('D1: active the day after signup is retained; only elapsed cohorts count', () => {
    const a = new Analytics();
    a.recordRegister('stay', 0); // first seen day 0
    a.recordRegister('gone', 0); // first seen day 0, never returns
    a.recordActivity('stay', DAY); // active day 1 -> D1 retained
    // Report on day 1: both users' D1 window has elapsed (today - firstDay >= 1).
    const r = a.report(DAY) as any;
    expect(r.retention.d1.eligible).toBe(2);
    expect(r.retention.d1.retained).toBe(1);
    expect(r.retention.d1.rate).toBe(0.5);
  });

  it('does not count a cohort whose D1 window has not elapsed yet', () => {
    const a = new Analytics();
    a.recordRegister('fresh', 0);
    const r = a.report(0) as any; // same day — window not elapsed
    expect(r.retention.d1.eligible).toBe(0);
    expect(r.retention.d1.rate).toBeNull();
  });

  it('D7: active a week after signup is retained', () => {
    const a = new Analytics();
    a.recordRegister('week', 0);
    a.recordActivity('week', 7 * DAY);
    const r = a.report(7 * DAY) as any;
    expect(r.retention.d7.eligible).toBe(1);
    expect(r.retention.d7.retained).toBe(1);
    expect(r.retention.d7.rate).toBe(1);
  });
});
