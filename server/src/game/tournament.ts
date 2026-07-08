/**
 * Single-elimination tournament bracket (pure helpers). The MVP is a 4-player
 * solo bracket: you + 3 bots, two rounds (semifinals -> final). Your matches are
 * played live; bot-vs-bot pairings are auto-resolved by the manager. Extending to
 * code-based multi-human lobbies is a later step — these helpers are size-agnostic.
 */
export const TOURNAMENT_SIZE = 4;

export interface TSeat {
  userId: string | null; // null => bot
  nickname: string;
}

export interface TPairing {
  a: TSeat;
  b: TSeat;
  winner: 0 | 1 | null; // 0 = a advances, 1 = b advances, null = undecided
}

export function botSeat(i: number): TSeat {
  return { userId: null, nickname: `Bot ${i}` };
}

/** Pad a set of human seats up to TOURNAMENT_SIZE with bots. */
export function fillBots(humans: TSeat[]): TSeat[] {
  const seats = [...humans];
  let i = 1;
  while (seats.length < TOURNAMENT_SIZE) seats.push(botSeat(i++));
  return seats;
}

/** Pair adjacent seats: (0 vs 1), (2 vs 3), … */
export function seedRound(seats: TSeat[]): TPairing[] {
  const pairings: TPairing[] = [];
  for (let i = 0; i + 1 < seats.length; i += 2) {
    pairings.push({ a: seats[i], b: seats[i + 1], winner: null });
  }
  return pairings;
}

/** The advancing seat of each resolved pairing, in bracket order. */
export function winnersOf(pairings: TPairing[]): TSeat[] {
  return pairings.map((p) => (p.winner === 0 ? p.a : p.b));
}

export function allResolved(pairings: TPairing[]): boolean {
  return pairings.every((p) => p.winner !== null);
}

/** Total rounds for a bracket size (4 -> 2, 8 -> 3). */
export function totalRounds(size: number): number {
  return Math.max(1, Math.round(Math.log2(size)));
}

export type Placement = 'champion' | 'finalist' | 'semifinal';

/** Gem prize by finishing place. */
export function prizeGems(placement: Placement): number {
  return placement === 'champion' ? 30 : placement === 'finalist' ? 10 : 0;
}
