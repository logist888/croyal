/**
 * One device-capability judgement for the whole app.
 *
 * There were two problems before this existed. The battle renderer had its own
 * heuristic that only ran when a match started, so the hub never knew anything;
 * and `html.low-end` — the class the glass fallback keys off — was written in
 * CSS but set by nobody, which made the entire low-end path dead code.
 */

export type Tier = 'low' | 'high';

let tier: Tier | null = null;

/**
 * Decide once, at boot. Deliberately conservative: `backdrop-filter` over a
 * full-width bar is cheap on a modern phone and genuinely expensive on a weak
 * one, and being wrong in the "too pretty" direction costs frames during a
 * battle, which is the one place that must not stutter.
 */
export function detectTier(): Tier {
  if (tier) return tier;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const noBlur = typeof CSS === 'undefined'
    || !(CSS.supports?.('backdrop-filter', 'blur(1px)')
      || CSS.supports?.('-webkit-backdrop-filter', 'blur(1px)'));

  tier = (cores <= 4 || mem <= 2 || noBlur) ? 'low' : 'high';
  document.documentElement.classList.toggle('low-end', tier === 'low');
  return tier;
}

export function getTier(): Tier {
  return tier ?? detectTier();
}

/**
 * Force the tier at runtime. The battle renderer calls this when its rolling FPS
 * average drops — a device can be "high" on paper and still be thermally
 * throttled, and the bar should stop blurring when that happens rather than
 * competing with the field for the same GPU.
 */
export function setTier(next: Tier): void {
  if (tier === next) return;
  tier = next;
  document.documentElement.classList.toggle('low-end', next === 'low');
}
