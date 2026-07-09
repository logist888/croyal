/**
 * Battle Pass (docs/ROADMAP.ru.md — Этап 3). A seasonal reward track tied to the
 * monthly season (see seasons.ts): earn Battle-Pass XP by playing ranked battles
 * to climb tiers, each with a FREE reward and a PREMIUM reward. Premium is
 * unlocked with gems. Progress resets every season — timestamp-based (the store
 * detects the rollover on read, keyed off `seasonIndex`), no scheduled job.
 */

export const BP_TIERS = 20;
export const BP_XP_PER_TIER = 100;
export const BP_XP_PER_WIN = 25;
export const BP_XP_PER_LOSS = 10;
export const BP_PREMIUM_COST_GEMS = 500;

export interface BattlePassReward {
  gold?: number;
  gems?: number;
}

export interface BattlePassTier {
  tier: number; // 1-based
  free: BattlePassReward;
  premium: BattlePassReward;
}

function freeReward(i: number): BattlePassReward {
  return i % 5 === 0 ? { gems: 10 } : { gold: 200 + i * 20 };
}
function premiumReward(i: number): BattlePassReward {
  if (i % 10 === 0) return { gems: 100 };
  if (i % 5 === 0) return { gems: 40 };
  if (i % 3 === 0) return { gold: 1500 };
  return { gems: 25 };
}

/** The reward track for a season (deterministic — same every season). */
export const BP_TRACK: BattlePassTier[] = Array.from({ length: BP_TIERS }, (_, k) => {
  const tier = k + 1;
  return { tier, free: freeReward(tier), premium: premiumReward(tier) };
});

export interface BattlePassState {
  season: number; // the season (UTC month) this pass belongs to
  xp: number;
  premium: boolean; // premium track unlocked (bought this season)
  claimedFree: number[]; // tiers claimed on the free track
  claimedPremium: number[]; // tiers claimed on the premium track
}

export function freshBattlePass(season: number): BattlePassState {
  return { season, xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
}

/** Current tier (0..BP_TIERS) reached for a given XP total. */
export function bpTier(xp: number): number {
  return Math.max(0, Math.min(BP_TIERS, Math.floor(xp / BP_XP_PER_TIER)));
}

/** Progress within the current tier, for an XP bar. */
export function bpTierProgress(xp: number): { into: number; need: number } {
  if (bpTier(xp) >= BP_TIERS) return { into: BP_XP_PER_TIER, need: BP_XP_PER_TIER };
  return { into: xp % BP_XP_PER_TIER, need: BP_XP_PER_TIER };
}

/** Whether any unlocked tier still has an unclaimed reward (drives the hub dot). */
export function hasBattlePassRewards(bp: BattlePassState | null): boolean {
  if (!bp) return false;
  const reached = bpTier(bp.xp);
  for (let t = 1; t <= reached; t++) {
    if (!bp.claimedFree.includes(t)) return true;
    if (bp.premium && !bp.claimedPremium.includes(t)) return true;
  }
  return false;
}
