import { describe, it, expect } from 'vitest';
import {
  seasonIndex, seasonRemainingMs, softResetTrophies, seasonRewardFor, SEASON_RESET_FLOOR,
} from '@croyal/shared';
import { Store } from '../store';

// Fixed UTC month anchors (mid-month so day-of-month never confuses the index).
const JAN = Date.UTC(2026, 0, 15);
const FEB = Date.UTC(2026, 1, 15);
const DEC = Date.UTC(2025, 11, 31, 23, 0, 0);
const NEXT_JAN = Date.UTC(2026, 0, 1, 1, 0, 0);

describe('season math', () => {
  it('seasonIndex advances by one each UTC month, incl. year boundary', () => {
    expect(seasonIndex(FEB) - seasonIndex(JAN)).toBe(1);
    expect(seasonIndex(NEXT_JAN) - seasonIndex(DEC)).toBe(1);
    // stable within a month regardless of the day
    expect(seasonIndex(Date.UTC(2026, 0, 1))).toBe(seasonIndex(Date.UTC(2026, 0, 28)));
  });

  it('seasonRemainingMs is the gap to the next UTC month start, clamped >= 0', () => {
    const startFeb = Date.UTC(2026, 1, 1);
    expect(seasonRemainingMs(startFeb)).toBe(Date.UTC(2026, 2, 1) - startFeb);
    // one minute before rollover -> one minute left
    expect(seasonRemainingMs(Date.UTC(2026, 2, 1) - 60000)).toBe(60000);
  });

  it('softReset keeps everything up to the floor and halves the excess', () => {
    expect(softResetTrophies(0)).toBe(0);
    expect(softResetTrophies(SEASON_RESET_FLOOR)).toBe(SEASON_RESET_FLOOR);
    expect(softResetTrophies(1200)).toBe(SEASON_RESET_FLOOR + 300); // 600 + (600/2)
    expect(softResetTrophies(2200)).toBe(SEASON_RESET_FLOOR + 800); // 600 + (1600/2)
  });

  it('reward scales with the peak league reached', () => {
    expect(seasonRewardFor(1, 0)).toEqual({ season: 1, league: 0, gold: 100, gems: 0 });
    expect(seasonRewardFor(1, 1200)).toEqual({ season: 1, league: 4, gold: 400, gems: 16 });
    expect(seasonRewardFor(1, 3000)).toEqual({ season: 1, league: 7, gold: 625, gems: 28 });
  });
});

describe('store seasons', () => {
  it('initialises on first read with peak = current trophies, no pending reward', () => {
    const store = new Store();
    const u = store.createUser({ telegramId: 1, nickname: 'SeasonA', language: 'en' });
    store.updateUser(u.id, { trophies: 250 });
    const s = store.ensureSeason(u.id, JAN)!;
    expect(s.index).toBe(seasonIndex(JAN));
    expect(s.peakTrophies).toBe(250);
    expect(s.pendingReward).toBeNull();
  });

  it('tracks the season peak (never lowers it) within a month', () => {
    const store = new Store();
    const u = store.createUser({ telegramId: 2, nickname: 'SeasonB', language: 'en' });
    store.ensureSeason(u.id, JAN); // peak 0
    store.updateUser(u.id, { trophies: 1200 });
    expect(store.ensureSeason(u.id, JAN)!.peakTrophies).toBe(1200);
    store.updateUser(u.id, { trophies: 500 }); // dropped back down
    expect(store.ensureSeason(u.id, JAN)!.peakTrophies).toBe(1200); // peak sticks
  });

  it('rolls over a new month: banks a reward, soft-resets trophies, reseeds peak', () => {
    const store = new Store();
    const u = store.createUser({ telegramId: 3, nickname: 'SeasonC', language: 'en' });
    store.ensureSeason(u.id, JAN);
    store.updateUser(u.id, { trophies: 1200 });
    store.ensureSeason(u.id, JAN); // peak 1200

    const s = store.ensureSeason(u.id, FEB)!;
    expect(s.index).toBe(seasonIndex(FEB));
    expect(s.pendingReward).toEqual({ season: seasonIndex(JAN), league: 4, gold: 400, gems: 16 });
    expect(store.getUser(u.id)!.trophies).toBe(900); // softReset(1200)
    expect(s.peakTrophies).toBe(900); // reseeded to the post-reset value
  });

  it('claimSeasonReward grants gold+gems once, then errors', () => {
    const store = new Store();
    const u = store.createUser({ telegramId: 4, nickname: 'SeasonD', language: 'en' });
    store.ensureSeason(u.id, JAN);
    store.updateUser(u.id, { trophies: 1200 });
    store.ensureSeason(u.id, JAN);
    store.ensureSeason(u.id, FEB); // bank reward (gold 400, gems 16)

    const before = store.getUser(u.id)!;
    const goldBefore = before.gold;
    const claimed = store.claimSeasonReward(u.id, FEB);
    expect(claimed.gold).toBe(goldBefore + 400);
    expect(claimed.gems).toBe(16);
    expect(claimed.season!.pendingReward).toBeNull();
    expect(() => store.claimSeasonReward(u.id, FEB)).toThrow(/no season reward/i);
  });

  it('is idempotent within a month (no double rollover)', () => {
    const store = new Store();
    const u = store.createUser({ telegramId: 5, nickname: 'SeasonE', language: 'en' });
    store.updateUser(u.id, { trophies: 1200 });
    store.ensureSeason(u.id, JAN);
    store.ensureSeason(u.id, FEB); // one rollover
    const t1 = store.getUser(u.id)!.trophies; // 900
    store.ensureSeason(u.id, FEB); // same month again — must not reset a second time
    expect(store.getUser(u.id)!.trophies).toBe(t1);
  });
});
