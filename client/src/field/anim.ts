/**
 * Procedural animation for static cutout sprites.
 *
 * The art was drawn for exactly this (docs/ART_PROMPT.ru.md §9): transparent
 * background, upright stance, feet at the bottom, no baked shadow — with the
 * engine expected to supply idle sway, a step on the move, a lunge and recoil on
 * attack, a white flash on damage and a topple on death. None of it existed.
 *
 * Everything here is pure `(state, dt) -> transform` maths so it can be tested
 * without Phaser and stays cheap enough to run for every unit every frame.
 */

/** What the renderer applies to a sprite this frame. */
export interface Pose {
  /** Pixel offsets from the entity's ground position. */
  dx: number;
  dy: number;
  /** Scale multipliers (1 = neutral). Squash keeps volume roughly constant. */
  sx: number;
  sy: number;
  /** Radians. */
  rot: number;
  /** 0..1 white overlay for the damage flash. */
  flash: number;
  /** 0..1 fade for the death animation. */
  alpha: number;
  /** How far off the ground the body is, 0..1 — drives the shadow. */
  lift: number;
}

export interface GaitState {
  /** Per-entity phase offset so a group doesn't move as one object. */
  phase: number;
  bob: number;
  walk: number;
  facing: 1 | -1;
  /** Set when a foot lands, so the caller can puff dust. */
  stepped: boolean;
  lastStepSin: number;
  lunge: LungeState | null;
  flashT: number;
  spawnT: number;
  deathT: number;
  /** Last heading, used for the topple direction. */
  heading: number;
  /** Set while a status should freeze the gait (stun / root). */
  frozen: boolean;
  /** Gait rate multiplier: slow = 0.5, rage = 1.4. */
  rate: number;
}

export interface LungeState {
  t: number;
  dur: number;
  /** Unit vector toward the target. */
  ux: number;
  uy: number;
  ranged: boolean;
}

export const SPAWN_DUR = 0.42;
export const DEATH_DUR = 0.34;
export const FLASH_DUR = 0.09;
const LUNGE_ANTICIPATE = 0.06;
const LUNGE_STRIKE = 0.07;
const LUNGE_RECOVER = 0.14;
export const LUNGE_DUR = LUNGE_ANTICIPATE + LUNGE_STRIKE + LUNGE_RECOVER;

/** Stable 0..2π phase from an entity id, so identical units desync. */
export function phaseOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000 * Math.PI * 2;
}

export function newGait(id: string): GaitState {
  return {
    phase: phaseOf(id),
    bob: 0, walk: 0, facing: 1, stepped: false, lastStepSin: 0,
    lunge: null, flashT: 0, spawnT: 0, deathT: -1,
    heading: 0, frozen: false, rate: 1,
  };
}

/** Start an attack lunge toward (tx,ty) from (x,y), in tile space. */
export function beginLunge(g: GaitState, dx: number, dy: number, ranged: boolean): void {
  const len = Math.hypot(dx, dy) || 1;
  g.lunge = { t: 0, dur: LUNGE_DUR, ux: dx / len, uy: dy / len, ranged };
}

export function beginFlash(g: GaitState): void {
  g.flashT = FLASH_DUR;
}

export function beginDeath(g: GaitState): void {
  if (g.deathT < 0) g.deathT = 0;
}

export const isDying = (g: GaitState): boolean => g.deathT >= 0;
export const deathDone = (g: GaitState): boolean => g.deathT >= DEATH_DUR;

const easeOutBack = (t: number): number => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutBounce = (t: number): number => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/**
 * Advance one unit's animation and produce its pose.
 *
 * `speed` is tiles/second from the interpolation buffer; `size` is the sprite's
 * on-screen box in pixels, which all offsets are expressed as a fraction of.
 */
export function stepGait(
  g: GaitState,
  dt: number,
  opts: { speed: number; vx: number; size: number; flying: boolean },
): Pose {
  const { speed, vx, size, flying } = opts;
  const pose: Pose = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, flash: 0, alpha: 1, lift: 0 };

  // ---- death: everything else stops mattering ----
  if (g.deathT >= 0) {
    g.deathT += dt;
    const k = Math.min(1, g.deathT / DEATH_DUR);
    const dir = g.heading >= 0 ? 1 : -1;
    if (flying) {
      // Flyers spiral down rather than topple over.
      pose.dy = size * 0.55 * k;
      pose.rot = dir * 0.9 * k;
      pose.sx = pose.sy = 1 - 0.25 * k;
    } else {
      pose.rot = dir * 0.55 * k;
      pose.sy = 1 - 0.18 * k;
      pose.sx = 1 + 0.06 * k;
      pose.dy = size * 0.1 * k;
    }
    pose.alpha = 1 - k * k; // ease-in: lingers, then goes
    return pose;
  }

  // ---- spawn: drop in, land with a squash ----
  if (g.spawnT < SPAWN_DUR) {
    g.spawnT += dt;
    const k = Math.min(1, g.spawnT / SPAWN_DUR);
    const drop = 1 - easeOutBounce(Math.min(1, k / 0.62));
    pose.dy = -size * 0.75 * drop;
    pose.lift = drop;
    const land = Math.min(1, Math.max(0, (k - 0.5) / 0.5));
    const squash = easeOutBack(land);
    pose.sx = 1.35 - 0.35 * squash;
    pose.sy = 0.65 + 0.35 * squash;
    // A short white "materialise" flash on the way in.
    pose.flash = Math.max(0, 1 - k / 0.28);
  }

  // ---- facing, with hysteresis so a jitter doesn't flip the sprite ----
  if (Math.abs(vx) > 0.15) {
    g.facing = vx > 0 ? 1 : -1;
    g.heading = vx;
  }

  // ---- gait ----
  const rate = g.frozen ? 0 : g.rate;
  g.bob += dt * 3.2 * rate;
  const moving = speed > 0.12;

  if (moving && rate > 0) {
    g.walk += dt * (2.4 + speed * 1.6) * rate;
    const s = Math.sin(g.walk);
    // A hop, not a sway — on a flat cutout the vertical beat is what reads as
    // walking, and the landing is where the dust puff belongs.
    const hop = Math.abs(s);
    pose.dy -= size * 0.055 * hop;
    pose.lift = Math.max(pose.lift, hop);
    pose.rot += s * 0.06;
    // Detect the landing beat: sin crossing zero.
    g.stepped = g.lastStepSin > 0 && s <= 0;
    g.lastStepSin = s;
    if (hop < 0.2) { pose.sy *= 0.95; pose.sx *= 1.05; } // squash on contact
  } else {
    g.stepped = false;
    g.lastStepSin = 0;
    const b = Math.sin(g.bob + g.phase);
    pose.dy -= size * 0.02 * b;
    pose.sy *= 1 + 0.02 * b;
    pose.sx *= 1 - 0.02 * b;
  }

  // ---- attack lunge: anticipate back, strike forward, ease back ----
  if (g.lunge) {
    g.lunge.t += dt;
    const t = g.lunge.t;
    const { ux, uy, ranged } = g.lunge;
    let out = 0;
    if (t < LUNGE_ANTICIPATE) {
      out = -0.12 * (t / LUNGE_ANTICIPATE);
    } else if (t < LUNGE_ANTICIPATE + LUNGE_STRIKE) {
      const k = (t - LUNGE_ANTICIPATE) / LUNGE_STRIKE;
      out = -0.12 + (ranged ? 0.04 : 0.34) * (k * k); // ranged only recoils
      const punch = Math.sin(k * Math.PI);
      pose.sx *= 1 + 0.10 * punch;
      pose.sy *= 1 - 0.08 * punch;
    } else if (t < LUNGE_DUR) {
      const k = (t - LUNGE_ANTICIPATE - LUNGE_STRIKE) / LUNGE_RECOVER;
      out = (ranged ? -0.08 : 0.22) * (1 - easeOutBack(k));
    } else {
      g.lunge = null;
    }
    pose.dx += ux * size * out;
    pose.dy += uy * size * out * 0.5; // foreshortened: the board is near top-down
  }

  // ---- damage flash + punch ----
  if (g.flashT > 0) {
    g.flashT -= dt;
    const k = Math.max(0, g.flashT / FLASH_DUR);
    pose.flash = Math.max(pose.flash, k);
    const punch = 1 + 0.12 * k;
    pose.sx *= punch;
    pose.sy *= punch;
    // Tiny positional jitter so a hit registers even on a still unit.
    pose.dx += Math.sin(k * 40) * size * 0.02;
  }

  return pose;
}
