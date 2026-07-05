/**
 * Battle chests (retention loop, original-game style).
 *
 * A win drops a chest into one of the player's slots. Chests unlock on a timer
 * (only ONE unlocks at a time); a ready chest is opened for gold + cards, or a
 * player spends gems to open instantly. Timers are timestamp-based — the server
 * stores `unlockAt` and readiness is computed from the current time, so no
 * background job is needed.
 *
 * Pure data + helpers here; the store owns slot mutation and reward granting.
 */

export type ChestRarity = 'wood' | 'silver' | 'gold' | 'magic' | 'legendary';

export interface ChestSlot {
  id: string;
  rarity: ChestRarity;
  /** null = sitting idle in the slot; a timestamp = unlocking (ready when now >= it). */
  unlockAt: number | null;
}

/** Slots a player can hold at once (chests earned while full are forfeited). */
export const CHEST_SLOTS = 4;

/** One gem buys this many minutes off the remaining unlock time (min 1 gem). */
export const MINUTES_PER_GEM = 10;

export interface ChestDef {
  rarity: ChestRarity;
  unlockMinutes: number;
  gold: number;
  cards: number; // total duplicate cards granted
  weight: number; // relative drop chance on a win
  color: number; // UI tint / fallback
}

export const CHEST_DEFS: Record<ChestRarity, ChestDef> = {
  wood: { rarity: 'wood', unlockMinutes: 15, gold: 20, cards: 4, weight: 55, color: 0xa1785a },
  silver: { rarity: 'silver', unlockMinutes: 60, gold: 45, cards: 8, weight: 25, color: 0xc0c6cc },
  gold: { rarity: 'gold', unlockMinutes: 180, gold: 90, cards: 14, weight: 13, color: 0xf5c542 },
  magic: { rarity: 'magic', unlockMinutes: 480, gold: 160, cards: 22, weight: 5, color: 0xb15cff },
  legendary: { rarity: 'legendary', unlockMinutes: 720, gold: 320, cards: 32, weight: 2, color: 0xffe082 },
};

export const CHEST_RARITIES: ChestRarity[] = ['wood', 'silver', 'gold', 'magic', 'legendary'];

export type ChestState = 'idle' | 'unlocking' | 'ready';

export function chestState(slot: ChestSlot, now: number): ChestState {
  if (slot.unlockAt === null) return 'idle';
  return now >= slot.unlockAt ? 'ready' : 'unlocking';
}

/** Milliseconds until a chest is ready (0 if idle/ready). */
export function chestRemainingMs(slot: ChestSlot, now: number): number {
  if (slot.unlockAt === null) return 0;
  return Math.max(0, slot.unlockAt - now);
}

/** Gems to open a chest right now (0 if already ready). */
export function gemsToSkip(slot: ChestSlot, now: number): number {
  const remMs = chestRemainingMs(slot, now);
  if (remMs <= 0) return 0;
  const remMin = remMs / 60000;
  return Math.max(1, Math.ceil(remMin / MINUTES_PER_GEM));
}

/** True if any chest in the list is currently unlocking (only one may be). */
export function hasUnlockingChest(chests: ChestSlot[], now: number): boolean {
  return chests.some((c) => chestState(c, now) === 'unlocking');
}

/** Weighted random chest rarity for a win. `rng` returns [0,1). */
export function randomChestRarity(rng: () => number): ChestRarity {
  const total = CHEST_RARITIES.reduce((s, r) => s + CHEST_DEFS[r].weight, 0);
  let roll = rng() * total;
  for (const r of CHEST_RARITIES) {
    roll -= CHEST_DEFS[r].weight;
    if (roll < 0) return r;
  }
  return 'wood';
}

/**
 * Roll a chest's contents: fixed gold + `cards` duplicate cards drawn from the
 * player's UNLOCKED pool (so low-league players never get locked cards). Pure:
 * pass an rng for deterministic tests. A legendary chest guarantees at least one
 * legendary-tier card when one is available in the pool.
 */
export function rollChestRewards(
  rarity: ChestRarity,
  pool: string[],
  rng: () => number,
  legendaryPool: string[] = [],
): { gold: number; cards: Record<string, number> } {
  const def = CHEST_DEFS[rarity];
  const cards: Record<string, number> = {};
  if (pool.length === 0) return { gold: def.gold, cards };
  const pick = (from: string[]) => from[Math.min(from.length - 1, Math.floor(rng() * from.length))];
  let remaining = def.cards;
  if (rarity === 'legendary' && legendaryPool.length > 0) {
    const id = pick(legendaryPool);
    cards[id] = (cards[id] ?? 0) + 1;
    remaining -= 1;
  }
  for (let i = 0; i < remaining; i++) {
    const id = pick(pool);
    cards[id] = (cards[id] ?? 0) + 1;
  }
  return { gold: def.gold, cards };
}
