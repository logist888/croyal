/**
 * Bot opponent card policy. Pure decisions (no timers) so it is unit-testable;
 * the Match controller owns the clock and calls this on its own schedule.
 */
import {
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, TOWER_POSITIONS, otherSide, getCard,
  BOT_PLAY_INTERVAL_SECONDS, BOT_PLAY_INTERVAL_FINAL_SECONDS, BOT_PLAY_JITTER_SECONDS,
  type Side,
} from '@croyal/shared';
import type { Simulation } from './simulation';

export interface BotAction {
  cardId: string;
  x?: number;
  y?: number;
}

/**
 * Seconds until the bot's next play in the cooldown model — the prototype's
 * pacing (~4.5s, ~2.7s in the final minute) with deterministic jitter.
 */
export function botNextDelay(sim: Simulation, tickCount: number): number {
  const base = sim.finalPhase() ? BOT_PLAY_INTERVAL_FINAL_SECONDS : BOT_PLAY_INTERVAL_SECONDS;
  return base + (tickCount % 5) * (BOT_PLAY_JITTER_SECONDS / 4);
}

export function pickBotAction(sim: Simulation, side: Side, tickCount: number): BotAction | null {
  const config = sim.battleConfig;

  let cardId: string;
  if (config.economy === 'cooldown') {
    const ready = sim.readyCards(side);
    if (ready.length === 0) return null;
    cardId = ready[tickCount % ready.length];
  } else {
    const elixir = sim.elixirOf(side);
    if (elixir < 4) return null; // prefer spending when elixir is plentiful
    const affordable = sim.handOf(side).filter((id) => (getCard(id)?.cost ?? 99) <= elixir);
    if (affordable.length === 0) return null;
    cardId = affordable[tickCount % affordable.length];
  }

  const card = getCard(cardId)!;
  if (card.type === 'spell') {
    // Legacy parity: the build-13 bot dropped spells on a fixed point near the
    // enemy king; only the cooldown-model bot aims at real targets.
    if (config.economy === 'elixir') return { cardId, ...legacySpellSpot(side, tickCount) };
    return { cardId, ...spellAim(sim, side) };
  }
  if (config.deployment === 'fixed-lane') return { cardId }; // server picks the lane spawn
  return { cardId, ...troopSpot(side, tickCount) };
}

/** Build-13 bot spell drop: the enemy king area, lane-jittered. */
function legacySpellSpot(side: Side, tickCount: number): { x: number; y: number } {
  const lane = tickCount % 2 === 0 ? ARENA_WIDTH * 0.25 : ARENA_WIDTH * 0.75;
  const x = lane + ((tickCount % 5) - 2) * 0.4;
  const y = side === 'A' ? 3 : ARENA_HEIGHT - 3;
  return { x, y };
}

/** Free-placement troop spot: own half, alternating lanes near the river. */
function troopSpot(side: Side, tickCount: number): { x: number; y: number } {
  const lane = tickCount % 2 === 0 ? ARENA_WIDTH * 0.25 : ARENA_WIDTH * 0.75;
  const x = lane + ((tickCount % 5) - 2) * 0.4;
  const y = side === 'A' ? RIVER_Y + 2 : RIVER_Y - 2;
  return { x, y };
}

/** Aim a spell at the nearest enemy unit; with no units up, at the enemy king. */
function spellAim(sim: Simulation, side: Side): { x: number; y: number } {
  const enemy = otherSide(side);
  const own = TOWER_POSITIONS[side].king;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (e.side !== enemy || e.hp <= 0 || e.kind === 'tower') continue;
    const dx = e.x - own.x;
    const dy = e.y - own.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = { x: e.x, y: e.y };
    }
  }
  return best ?? { ...TOWER_POSITIONS[enemy].king };
}
