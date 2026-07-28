/**
 * Orchestrates matchmaking, live matches and clan boss rooms. One instance per
 * server process. The WebSocket layer (ws.ts) translates socket events into
 * these method calls.
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_DECK, DEFAULT_TRIO, TRIO_SIZE, TICK_DT,
  type Side, type PlayerProfile, type ServerMessage, type TournamentView, type TournamentMatchView,
} from '@croyal/shared';
import { Match, type MatchSeat, type Sender } from './game/match';
import { ReplayRoom, type MatchRecording } from './game/replay';
import { BossRoom } from './game/boss';
import { Simulation } from './game/simulation';
import { pickBotAction } from './game/bot';
import {
  fillBots, seedRound, winnersOf, allResolved, totalRounds, prizeGems,
  type TSeat, type TPairing, type Placement,
} from './game/tournament';
import { ACTIVE_BATTLE_CONFIG } from './game/active-config';
import { store } from './store';

interface TournamentRun {
  userId: string;
  send: Sender;
  seats: TSeat[];
  rounds: TPairing[][];
  round: number;
  status: TournamentView['status'];
  prizeGems: number;
}

const BOT_FALLBACK_MS = 6000;
/** How long a match survives a socket drop before the absent player forfeits. */
const RECONNECT_GRACE_MS = 30000;
/** A friendly room waits this long for a guest before it expires. */
const FRIENDLY_ROOM_TTL_MS = 5 * 60 * 1000;
/** How many recent match recordings to keep for replays (server memory). */
const REPLAY_CAP = 100;
/** Room-code alphabet — no easily-confused chars (O/0, I/1). */
const FRIENDLY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FRIENDLY_CODE_LEN = 4;

interface Waiting {
  userId: string;
  send: Sender;
  trophies: number;
  queuedAt: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Trophy gap a waiting player will accept, as a function of how long they've
 * been waiting. Starts tight (roughly one league) and doubles every second,
 * so a thin queue still resolves before the bot-fallback timer fires — by
 * BOT_FALLBACK_MS the range is already far wider than any real trophy spread
 * (150 * 2^6 = 9600), so the bot only steps in when there is truly nobody to
 * pair, not just nobody nearby.
 */
function maxGap(waitedMs: number): number {
  return 150 * 2 ** (waitedMs / 1000);
}

export class GameManager {
  private matches = new Map<string, Match>();
  private userMatch = new Map<string, string>(); // userId -> matchId
  private bossRooms = new Map<string, BossRoom>(); // clanId -> room
  private userBoss = new Map<string, string>(); // userId -> clanId
  // Small pool, not a singleton: lets a same-instant queue() pick the best
  // trophy-range match among everyone waiting, instead of blindly grabbing
  // whoever queued first.
  private waitingQueue: Waiting[] = [];
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>(); // userId -> forfeit timer
  // Friendly (unranked) rooms: a host opens one and shares the code; a guest joins by it.
  private friendlyRooms = new Map<string, { hostId: string; send: Sender; timer: ReturnType<typeof setTimeout> }>(); // code -> room
  private userFriendly = new Map<string, string>(); // hostId -> code
  // Replays: recent match recordings + each user's most recent, and live playbacks.
  private replays = new Map<string, MatchRecording>(); // matchId -> recording
  private replayOrder: string[] = []; // insertion order for bounded eviction
  private lastReplay = new Map<string, string>(); // userId -> matchId
  private replayRooms = new Map<string, ReplayRoom>(); // viewerId -> active playback
  private tournaments = new Map<string, TournamentRun>(); // userId -> solo tournament run

  // --- 1v1 matchmaking ---
  queue(userId: string, send: Sender): void {
    if (this.userMatch.has(userId)) return;
    if (this.waitingQueue.some((w) => w.userId === userId)) return; // already waiting
    const profile = store.getUser(userId);
    if (!profile) return;

    // Pair with whichever waiting player has the smallest trophy gap that
    // THEY are currently willing to accept — their tolerance widened by how
    // long they've already waited. A fresh joiner brings no tolerance of
    // their own; they only need to fall inside the waiting side's net.
    const now = Date.now();
    let best: Waiting | null = null;
    let bestGap = Infinity;
    for (const w of this.waitingQueue) {
      const gap = Math.abs(w.trophies - profile.trophies);
      if (gap > maxGap(now - w.queuedAt)) continue;
      if (gap < bestGap) { best = w; bestGap = gap; }
    }
    if (best) {
      clearTimeout(best.timer);
      this.waitingQueue = this.waitingQueue.filter((w) => w !== best);
      this.createMatch(
        { userId: best.userId, deck: deckOf(best.userId), send: best.send },
        { userId, deck: battleDeckOf(profile), send },
      );
      return;
    }

    send({ t: 'queued' });
    const timer = setTimeout(() => this.matchWithBot(userId), BOT_FALLBACK_MS);
    this.waitingQueue.push({ userId, send, trophies: profile.trophies, queuedAt: now, timer });
  }

  cancelQueue(userId: string): void {
    const w = this.waitingQueue.find((x) => x.userId === userId);
    if (w) {
      clearTimeout(w.timer);
      this.waitingQueue = this.waitingQueue.filter((x) => x !== w);
    }
  }

  // --- Friendly (unranked) rooms ---

  /** Host a friendly room and hand back a shareable code. */
  createFriendly(userId: string, send: Sender): void {
    if (this.userMatch.has(userId)) {
      send({ t: 'error', error: 'already in a match' });
      return;
    }
    this.cancelQueue(userId); // can't wait in ranked and host at once
    const existing = this.userFriendly.get(userId);
    if (existing) {
      send({ t: 'friendlyCreated', code: existing }); // re-open the same room
      return;
    }
    const code = this.newFriendlyCode();
    const timer = setTimeout(() => this.expireFriendly(code), FRIENDLY_ROOM_TTL_MS);
    this.friendlyRooms.set(code, { hostId: userId, send, timer });
    this.userFriendly.set(userId, code);
    send({ t: 'friendlyCreated', code });
  }

  /** Join a friendly room by its code, pairing host + guest into an unranked match. */
  joinFriendly(userId: string, rawCode: string, send: Sender): void {
    if (this.userMatch.has(userId)) return;
    const code = String(rawCode ?? '').trim().toUpperCase();
    const room = this.friendlyRooms.get(code);
    if (!room) {
      send({ t: 'error', error: 'friendly room not found' });
      return;
    }
    if (room.hostId === userId) {
      send({ t: 'error', error: 'cannot join your own room' });
      return;
    }
    const host = store.getUser(room.hostId);
    const guest = store.getUser(userId);
    if (!host || !guest) {
      send({ t: 'error', error: 'player unavailable' });
      return;
    }
    clearTimeout(room.timer);
    this.friendlyRooms.delete(code);
    this.userFriendly.delete(room.hostId);
    this.cancelQueue(userId);
    this.createMatch(
      { userId: room.hostId, deck: battleDeckOf(host), send: room.send },
      { userId, deck: battleDeckOf(guest), send },
      true,
    );
  }

  /** Host closes a still-waiting room. */
  cancelFriendly(userId: string): void {
    const code = this.userFriendly.get(userId);
    if (!code) return;
    const room = this.friendlyRooms.get(code);
    if (room) clearTimeout(room.timer);
    this.friendlyRooms.delete(code);
    this.userFriendly.delete(userId);
  }

  private expireFriendly(code: string): void {
    const room = this.friendlyRooms.get(code);
    if (!room) return;
    this.friendlyRooms.delete(code);
    this.userFriendly.delete(room.hostId);
    room.send({ t: 'error', error: 'friendly room expired' });
  }

  private newFriendlyCode(): string {
    let code = '';
    do {
      code = '';
      for (let i = 0; i < FRIENDLY_CODE_LEN; i++) {
        code += FRIENDLY_CODE_ALPHABET[Math.floor(Math.random() * FRIENDLY_CODE_ALPHABET.length)];
      }
    } while (this.friendlyRooms.has(code));
    return code;
  }

  private matchWithBot(userId: string): void {
    const human = this.waitingQueue.find((w) => w.userId === userId);
    if (!human) return;
    this.waitingQueue = this.waitingQueue.filter((w) => w !== human);
    const profile = store.getUser(userId);
    if (!profile) return;
    this.createMatch(
      { userId, deck: battleDeckOf(profile), send: human.send },
      { userId: null, deck: botDeck(), send: noop },
    );
  }

  private createMatch(seatA: MatchSeat, seatB: MatchSeat, friendly = false, onComplete?: (winner: Side | null) => void): void {
    const matchId = randomUUID();
    const nameOf = (s: MatchSeat) => (s.userId ? store.getUser(s.userId)?.nickname ?? 'Player' : 'Bot');
    if (seatA.userId) {
      this.userMatch.set(seatA.userId, matchId);
      seatA.send({ t: 'matchFound', matchId, opponent: nameOf(seatB), friendly });
    }
    if (seatB.userId) {
      this.userMatch.set(seatB.userId, matchId);
      seatB.send({ t: 'matchFound', matchId, opponent: nameOf(seatA), friendly });
    }
    const match = new Match(matchId, seatA, seatB, store, (m) => this.onMatchEnd(m, seatA, seatB, onComplete), ACTIVE_BATTLE_CONFIG, friendly);
    this.matches.set(matchId, match);
    match.start();
  }

  private onMatchEnd(match: Match, seatA: MatchSeat, seatB: MatchSeat, onComplete?: (winner: Side | null) => void): void {
    const rec = match.getRecording();
    this.storeReplay(match.id, rec, seatA, seatB);
    this.matches.delete(match.id);
    if (seatA.userId) { this.userMatch.delete(seatA.userId); this.clearGrace(seatA.userId); }
    if (seatB.userId) { this.userMatch.delete(seatB.userId); this.clearGrace(seatB.userId); }
    onComplete?.(rec.winner);
  }

  /** Keep a bounded history of match recordings; index each human's most recent. */
  private storeReplay(matchId: string, rec: MatchRecording, seatA: MatchSeat, seatB: MatchSeat): void {
    this.replays.set(matchId, rec);
    this.replayOrder.push(matchId);
    if (seatA.userId) this.lastReplay.set(seatA.userId, matchId);
    if (seatB.userId) this.lastReplay.set(seatB.userId, matchId);
    while (this.replayOrder.length > REPLAY_CAP) {
      const evicted = this.replayOrder.shift()!;
      this.replays.delete(evicted);
      // dangling lastReplay entries resolve to "no replay" on lookup — no cleanup needed
    }
  }

  // --- Replays (watch your last match) ---
  watchLastReplay(userId: string, send: Sender): void {
    if (this.userMatch.has(userId)) {
      send({ t: 'error', error: 'finish your match first' });
      return;
    }
    const matchId = this.lastReplay.get(userId);
    const rec = matchId ? this.replays.get(matchId) : undefined;
    if (!rec) {
      send({ t: 'error', error: 'no replay available' });
      return;
    }
    this.stopReplay(userId); // one playback per viewer
    const viewerSide: Side = rec.userA === userId ? 'A' : 'B';
    const room = new ReplayRoom(rec, viewerSide, send, () => {
      if (this.replayRooms.get(userId) === room) this.replayRooms.delete(userId);
    });
    this.replayRooms.set(userId, room);
    room.start();
  }

  stopReplay(userId: string): void {
    this.replayRooms.get(userId)?.stop();
    this.replayRooms.delete(userId);
  }

  // --- Solo tournaments (4-player single-elimination vs bots) ---
  private tourneySeed = 1;

  /** Start a fresh solo tournament: you + 3 bots, semifinals then final. */
  tournamentCreate(userId: string, send: Sender): void {
    if (this.userMatch.has(userId)) {
      send({ t: 'error', error: 'finish your match first' });
      return;
    }
    const nickname = store.getUser(userId)?.nickname ?? 'You';
    const seats = fillBots([{ userId, nickname }]);
    const run: TournamentRun = {
      userId, send, seats, rounds: [seedRound(seats)], round: 0, status: 'yourTurn', prizeGems: 0,
    };
    this.tournaments.set(userId, run);
    this.progressTournament(run); // auto-resolve the other semifinal; set your turn
    this.sendTournament(run);
  }

  /** Play your pending bracket match live (vs a bot). Advances the bracket on end. */
  tournamentPlay(userId: string, send: Sender): void {
    const run = this.tournaments.get(userId);
    if (!run || run.status !== 'yourTurn' || this.userMatch.has(userId)) return;
    const cur = run.rounds[run.round];
    const yours = cur.find((p) => this.isYours(run, p));
    if (!yours || yours.winner !== null) return;
    run.send = send;
    run.status = 'playing';
    const youAreA = yours.a.userId === run.userId;
    const opp = youAreA ? yours.b : yours.a;
    const you = store.getUser(userId);
    if (!you) return;
    const seatA: MatchSeat = { userId, deck: battleDeckOf(you), send };
    const seatB: MatchSeat = { userId: opp.userId, deck: this.seatDeck(opp), send: noop };
    this.createMatch(seatA, seatB, true, (winner) => {
      const youWon = winner === 'A'; // you are always seated as A in your tournament match
      yours.winner = youWon === youAreA ? 0 : 1;
      this.progressTournament(run);
      this.sendTournament(run);
    });
  }

  /** Re-send the current bracket (e.g. when the client returns from a match). */
  tournamentSync(userId: string, send: Sender): void {
    const run = this.tournaments.get(userId);
    if (!run) return;
    run.send = send;
    this.sendTournament(run);
  }

  tournamentLeave(userId: string): void {
    this.tournaments.delete(userId);
  }

  private isYours(run: TournamentRun, p: TPairing): boolean {
    return p.a.userId === run.userId || p.b.userId === run.userId;
  }

  private seatDeck(seat: TSeat): string[] {
    if (seat.userId) {
      const u = store.getUser(seat.userId);
      if (u) return battleDeckOf(u);
    }
    return botDeck();
  }

  /** Headlessly resolve a bot-vs-bot pairing to a winner (0 = a, 1 = b). */
  private autoResolvePairing(a: TSeat, b: TSeat): 0 | 1 {
    this.tourneySeed = (this.tourneySeed + 0x9e3779b1) >>> 0;
    const sim = new Simulation(this.seatDeck(a), this.seatDeck(b), this.tourneySeed, {}, {}, ACTIVE_BATTLE_CONFIG);
    const total = Math.round(ACTIVE_BATTLE_CONFIG.roundSeconds / TICK_DT);
    let tc = 0;
    for (let i = 0; i < total && !sim.result; i++) {
      if (i % 45 === 0) {
        for (const side of ['A', 'B'] as Side[]) {
          const act = pickBotAction(sim, side, tc++);
          if (act) sim.deploy(side, act.cardId, act.x, act.y);
        }
      }
      sim.step(TICK_DT);
    }
    return sim.winnerSide === 'B' ? 1 : 0;
  }

  /** Advance the bracket as far as it can go without the human: resolve bot
   *  pairings, then set the viewer's status (their turn / eliminated / champion). */
  private progressTournament(run: TournamentRun): void {
    // Resolve every pairing in the current round that the human is NOT in.
    for (const p of run.rounds[run.round]) {
      if (p.winner === null && !this.isYours(run, p)) p.winner = this.autoResolvePairing(p.a, p.b);
    }
    const cur = run.rounds[run.round];
    const yours = cur.find((p) => this.isYours(run, p));
    if (!yours) { run.status = 'done'; return; }
    if (yours.winner === null) { run.status = 'yourTurn'; return; }

    const youWon = (yours.winner === 0 ? yours.a : yours.b).userId === run.userId;
    if (!youWon) {
      run.status = 'eliminated';
      const finalRound = totalRounds(run.seats.length) - 1;
      this.grantPlacement(run, run.round === finalRound ? 'finalist' : 'semifinal');
      return;
    }
    if (!allResolved(cur)) { run.status = 'yourTurn'; return; } // safety — bots already resolved
    const winners = winnersOf(cur);
    if (winners.length === 1) {
      run.status = 'champion';
      this.grantPlacement(run, 'champion');
      return;
    }
    run.rounds.push(seedRound(winners));
    run.round += 1;
    this.progressTournament(run); // resolve the next round's bots and set your next match
  }

  private grantPlacement(run: TournamentRun, placement: Placement): void {
    const gems = prizeGems(placement);
    run.prizeGems = gems;
    if (gems > 0) {
      const u = store.getUser(run.userId);
      if (u) store.updateUser(run.userId, { gems: u.gems + gems });
    }
  }

  private sendTournament(run: TournamentRun): void {
    const rounds: TournamentMatchView[][] = run.rounds.map((r) =>
      r.map((p) => ({ aName: p.a.nickname, bName: p.b.nickname, winner: p.winner, youIn: this.isYours(run, p) })));
    const view: TournamentView = {
      size: run.seats.length, round: run.round, rounds, status: run.status, prizeGems: run.prizeGems,
    };
    run.send({ t: 'tournamentState', view });
  }

  private clearGrace(userId: string): void {
    const t = this.graceTimers.get(userId);
    if (t) { clearTimeout(t); this.graceTimers.delete(userId); }
  }

  /**
   * Re-bind a reconnecting player to their in-progress match (called on
   * re-auth). Cancels any pending forfeit and resyncs the client. Returns
   * true if the player was resumed into a live match.
   */
  attach(userId: string, send: Sender): boolean {
    const matchId = this.userMatch.get(userId);
    if (!matchId) return false;
    const match = this.matches.get(matchId);
    if (!match || !match.hasUser(userId)) return false;
    this.clearGrace(userId);
    return match.reattach(userId, send);
  }

  deploy(userId: string, cardId: string, x?: number, y?: number): void {
    const matchId = this.userMatch.get(userId);
    if (!matchId) return;
    this.matches.get(matchId)?.handleDeploy(userId, cardId, x, y);
  }

  leaveMatch(userId: string): void {
    this.clearGrace(userId); // an explicit leave supersedes any reconnect window
    const matchId = this.userMatch.get(userId);
    if (!matchId) return;
    this.matches.get(matchId)?.handleLeave(userId);
  }

  // --- Clan boss raid ---
  bossJoin(userId: string, clanId: string, send: Sender): void {
    const profile = store.getUser(userId);
    if (!profile) {
      send({ t: 'error', error: 'not registered' });
      return;
    }
    if (profile.clanId !== clanId) {
      send({ t: 'error', error: 'you are not a member of this clan' });
      return;
    }
    let room = this.bossRooms.get(clanId);
    if (!room) {
      room = new BossRoom(
        clanId,
        (r) => {
          this.bossRooms.delete(r.clanId);
          // clear stale raid memberships so future bossDeploys don't no-op
          for (const [uid, cid] of this.userBoss) {
            if (cid === r.clanId) this.userBoss.delete(uid);
          }
        },
        undefined,
        (result) => {
          // Persist the raid rewards — the bossEnd message alone grants nothing.
          // Each participant's own rewardGold already reflects their damage share.
          for (const p of result.participants) {
            const u = store.getUser(p.userId);
            if (u) store.updateUser(p.userId, { gold: u.gold + p.rewardGold });
          }
        },
      );
      this.bossRooms.set(clanId, room);
    }
    const res = room.join(userId, profile.nickname, battleDeckOf(profile), send);
    if (!res.ok) {
      send({ t: 'error', error: res.error ?? 'cannot join raid' });
      return;
    }
    this.userBoss.set(userId, clanId);
  }

  bossDeploy(userId: string, cardId: string, x?: number, y?: number): void {
    const clanId = this.userBoss.get(userId);
    if (!clanId) return;
    this.bossRooms.get(clanId)?.deploy(userId, cardId, x, y);
  }

  bossLeave(userId: string): void {
    const clanId = this.userBoss.get(userId);
    if (!clanId) return;
    this.bossRooms.get(clanId)?.leave(userId);
    this.userBoss.delete(userId);
  }

  // --- Connection teardown ---
  /**
   * A socket dropped. Leaving matchmaking or a boss raid is immediate, but an
   * active 1v1 match is held open for RECONNECT_GRACE_MS so a flaky mobile
   * connection can rejoin (see attach) instead of auto-losing. If the window
   * elapses with no reconnect, the absent player forfeits.
   */
  disconnect(userId: string): void {
    this.cancelQueue(userId);
    this.cancelFriendly(userId);
    this.stopReplay(userId);
    this.bossLeave(userId);
    const matchId = this.userMatch.get(userId);
    if (matchId && this.matches.get(matchId)?.hasUser(userId)) {
      this.clearGrace(userId);
      const timer = setTimeout(() => {
        this.graceTimers.delete(userId);
        this.leaveMatch(userId); // grace elapsed -> forfeit
      }, RECONNECT_GRACE_MS);
      this.graceTimers.set(userId, timer);
    }
  }
}

/** The hand a profile brings to battle: the trio in the cooldown model, the 8-deck otherwise. */
function battleDeckOf(profile: PlayerProfile): string[] {
  if (ACTIVE_BATTLE_CONFIG.economy === 'cooldown') {
    return profile.trio?.length === TRIO_SIZE ? [...profile.trio] : [...DEFAULT_TRIO];
  }
  return [...profile.deck];
}

function botDeck(): string[] {
  return ACTIVE_BATTLE_CONFIG.economy === 'cooldown' ? [...DEFAULT_TRIO] : [...DEFAULT_DECK];
}

function deckOf(userId: string): string[] {
  const user = store.getUser(userId);
  return user ? battleDeckOf(user) : botDeck();
}

const noop: Sender = (_msg: ServerMessage) => {};

export const gameManager = new GameManager();
