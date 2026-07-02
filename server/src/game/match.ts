/**
 * Match controller: owns one Simulation, drives the tick loop, broadcasts
 * snapshots, runs the bot opponent (when there is no human), and reports results.
 */
import {
  TICK_DT, SNAPSHOT_RATE, TICK_RATE,
  otherSide, type Side, type ServerMessage, type MatchResult, type BattleRewards, type BattleConfig,
} from '@croyal/shared';
import { Simulation } from './simulation';
import { ACTIVE_BATTLE_CONFIG } from './active-config';
import { pickBotAction, botNextDelay } from './bot';
import type { Store } from '../store';

export type Sender = (msg: ServerMessage) => void;

export interface MatchSeat {
  userId: string | null; // null => bot
  deck: string[];
  send: Sender;
}

const WIN_TROPHIES = 30;
const LOSS_TROPHIES = 30;

export class Match {
  private sim: Simulation;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private ended = false;
  private botSide: Side | null = null;
  private botCooldown = 0;

  constructor(
    public readonly id: string,
    private seatA: MatchSeat,
    private seatB: MatchSeat,
    private store: Store,
    private onEnd: (match: Match) => void,
    config: BattleConfig = ACTIVE_BATTLE_CONFIG,
  ) {
    const seed = hashSeed(id);
    this.sim = new Simulation(seatA.deck, seatB.deck, seed, this.levelsFor(seatA), this.levelsFor(seatB), config);
    if (seatA.userId === null) this.botSide = 'A';
    if (seatB.userId === null) this.botSide = 'B';
  }

  /** Card levels for a seat's deck (bots / unknown -> level 1). */
  private levelsFor(seat: MatchSeat): Record<string, number> {
    const levels: Record<string, number> = {};
    if (!seat.userId) return levels;
    const user = this.store.getUser(seat.userId);
    if (!user) return levels;
    for (const id of seat.deck) levels[id] = user.cards[id]?.level ?? 1;
    return levels;
  }

  start(): void {
    this.sendSnapshots();
    this.timer = setInterval(() => this.loop(), Math.round(TICK_DT * 1000));
  }

  private loop(): void {
    if (this.ended) return;
    this.sim.step(TICK_DT);
    this.tickCount++;

    if (this.botSide) this.runBot(this.botSide);

    const snapshotEvery = Math.round(TICK_RATE / SNAPSHOT_RATE);
    if (this.tickCount % snapshotEvery === 0) this.sendSnapshots();

    if (this.sim.result) this.endMatch();
  }

  private sendSnapshots(): void {
    if (this.seatA.userId) this.seatA.send({ t: 'battle', snapshot: this.sim.getSnapshot('A') });
    if (this.seatB.userId) this.seatB.send({ t: 'battle', snapshot: this.sim.getSnapshot('B') });
    this.sim.clearEvents(); // FX window handed off with this snapshot pair
  }

  /** A deploy request from a connected player (coords absent for fixed-lane troops). */
  handleDeploy(userId: string, cardId: string, x?: number, y?: number): void {
    if (this.ended) return;
    const side = this.sideOf(userId);
    if (!side) return;
    this.sim.deploy(side, cardId, x, y);
  }

  handleLeave(userId: string): void {
    if (this.ended) return;
    const side = this.sideOf(userId);
    if (!side) return;
    this.sim.forfeit(side); // leaving = automatic loss
    this.endMatch();
  }

  private sideOf(userId: string): Side | null {
    if (this.seatA.userId === userId) return 'A';
    if (this.seatB.userId === userId) return 'B';
    return null;
  }

  // --- Bot opponent ---
  private runBot(side: Side): void {
    this.botCooldown -= TICK_DT;
    if (this.botCooldown > 0) return;
    const action = pickBotAction(this.sim, side, this.tickCount);

    if (this.sim.battleConfig.economy === 'cooldown') {
      // Paced play attempts (prototype rhythm) whether or not a card was ready.
      if (action) this.sim.deploy(side, action.cardId, action.x, action.y);
      this.botCooldown = botNextDelay(this.sim, this.tickCount);
      return;
    }
    if (!action) return; // elixir mode: retry next tick until something is affordable
    this.sim.deploy(side, action.cardId, action.x, action.y);
    this.botCooldown = 1.5 + (this.tickCount % 3) * 0.5;
  }

  private endMatch(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    this.sendSnapshots(); // final frame (king-kill state) before the result
    const winner = this.sim.winnerSide!;
    const reason = this.sim.endReason!;
    this.applyResults(winner, reason);
    this.onEnd(this);
  }

  private applyResults(winner: Side, reason: MatchResult['reason']): void {
    const loser = otherSide(winner);
    const scoreWinner = this.sim.getSnapshot(winner).score[winner];
    const scoreLoser = this.sim.getSnapshot(winner).score[loser];

    const seatFor = (s: Side) => (s === 'A' ? this.seatA : this.seatB);

    for (const side of ['A', 'B'] as Side[]) {
      const seat = seatFor(side);
      if (!seat.userId) continue;
      const isWinner = side === winner;
      const delta = isWinner ? WIN_TROPHIES : -LOSS_TROPHIES;
      const rewards = this.persist(seat.userId, isWinner, delta);
      const result: MatchResult = {
        outcome: isWinner ? 'win' : 'loss',
        reason,
        yourScore: side === winner ? scoreWinner : scoreLoser,
        opponentScore: side === winner ? scoreLoser : scoreWinner,
        trophyDelta: delta,
        rewards,
      };
      seat.send({ t: 'matchEnd', result });
    }
  }

  private persist(userId: string, isWinner: boolean, delta: number): BattleRewards {
    const user = this.store.getUser(userId);
    if (!user) return { gold: 0, cards: {} };
    // Battle-chest contents: gold + duplicate cards spread across the deck (winner
    // more). Deterministic rotation by games played.
    const goldGain = isWinner ? 50 : 10;
    const n = isWinner ? 3 : 1;
    const start = (user.wins + user.losses) % Math.max(1, user.deck.length);
    const drops: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const id = user.deck[(start + i) % user.deck.length];
      drops[id] = (drops[id] ?? 0) + 1;
    }
    this.store.updateUser(userId, {
      trophies: Math.max(0, user.trophies + delta),
      wins: user.wins + (isWinner ? 1 : 0),
      losses: user.losses + (isWinner ? 0 : 1),
      gold: user.gold + goldGain,
    });
    this.store.awardCards(userId, drops);
    return { gold: goldGain, cards: drops };
  }
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
