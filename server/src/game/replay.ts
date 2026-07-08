/**
 * Deterministic battle replays. The simulation has NO nondeterminism (no
 * Math.random / Date.now — the only RNG is the seeded shuffle), so a match is
 * fully reproducible from its seed, decks, levels, config, and the ordered list
 * of successful deploys with their sim-tick. A ReplayRoom re-runs that recording
 * server-side and streams the same `battle` snapshots to a single viewer.
 */
import {
  TICK_DT, TICK_RATE, SNAPSHOT_RATE,
  type Side, type BattleConfig, type ServerMessage,
} from '@croyal/shared';
import { Simulation } from './simulation';

export interface ReplayAction {
  tick: number; // the sim.tick at which this deploy was applied live
  side: Side;
  cardId: string;
  x?: number;
  y?: number;
}

export interface MatchRecording {
  seed: number;
  deckA: string[];
  deckB: string[];
  levelsA: Record<string, number>;
  levelsB: Record<string, number>;
  config: BattleConfig;
  actions: ReplayAction[]; // sorted by tick (append order is already ascending)
  userA: string | null;
  userB: string | null;
  nameA: string;
  nameB: string;
  winner: Side | null;
  scoreA: number;
  scoreB: number;
}

type Sender = (msg: ServerMessage) => void;

/** Playback speed: step this many sim-ticks per real interval (2 = ~half wall-clock). */
const REPLAY_SPEED = 2;

export class ReplayRoom {
  private sim: Simulation;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ptr = 0; // next action to apply
  private stepsSinceSnap = 0;
  private readonly maxTick: number;
  private ended = false;

  constructor(
    private rec: MatchRecording,
    private viewerSide: Side,
    private send: Sender,
    private onEnd: (room: ReplayRoom) => void,
  ) {
    this.sim = new Simulation(rec.deckA, rec.deckB, rec.seed, rec.levelsA, rec.levelsB, rec.config);
    this.maxTick = Math.round(rec.config.roundSeconds * TICK_RATE) + 5;
  }

  start(): void {
    const opponent = this.viewerSide === 'A' ? this.rec.nameB : this.rec.nameA;
    this.send({ t: 'replayStart', opponent });
    this.send({ t: 'battle', snapshot: this.sim.getSnapshot(this.viewerSide) });
    this.timer = setInterval(() => this.loop(), Math.round(TICK_DT * 1000));
  }

  private applyDueActions(): void {
    // Apply every action recorded at (or somehow before) the current sim tick,
    // BEFORE the step that advances past it — mirroring the live ordering.
    while (this.ptr < this.rec.actions.length && this.rec.actions[this.ptr].tick <= this.sim.tick) {
      const a = this.rec.actions[this.ptr++];
      this.sim.deploy(a.side, a.cardId, a.x, a.y);
    }
  }

  private loop(): void {
    if (this.ended) return;
    const snapshotEvery = Math.round(TICK_RATE / SNAPSHOT_RATE);
    for (let k = 0; k < REPLAY_SPEED && !this.sim.result && this.sim.tick < this.maxTick; k++) {
      this.applyDueActions();
      this.sim.step(TICK_DT);
      this.stepsSinceSnap++;
    }
    if (this.stepsSinceSnap >= snapshotEvery) {
      this.send({ t: 'battle', snapshot: this.sim.getSnapshot(this.viewerSide) });
      this.sim.clearEvents();
      this.stepsSinceSnap = 0;
    }
    if (this.sim.result || this.sim.tick >= this.maxTick) this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    // Final frame so the last blow is seen, then the verdict.
    this.send({ t: 'battle', snapshot: this.sim.getSnapshot(this.viewerSide) });
    const snap = this.sim.getSnapshot(this.viewerSide);
    const winner = this.sim.winnerSide;
    const outcome = winner === null ? 'draw' : winner === this.viewerSide ? 'win' : 'loss';
    this.send({
      t: 'replayEnd',
      outcome,
      yourScore: snap.score[this.viewerSide],
      opponentScore: snap.score[this.viewerSide === 'A' ? 'B' : 'A'],
    });
    this.onEnd(this);
  }

  /** Stop playback early (viewer left / disconnected). */
  stop(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    this.onEnd(this);
  }
}
