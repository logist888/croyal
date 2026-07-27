/**
 * The app's single motion vocabulary.
 *
 * Everything animated in the DOM goes through here rather than calling `animate`
 * directly, so that reduced-motion, the low-end device tier and any future
 * global "less flashy" setting are one switch instead of sixty call sites.
 *
 * Backed by motion.dev (WAAPI): the browser runs these off the main thread,
 * which matters because during a battle the main thread belongs to Phaser.
 *
 * Two API notes that are easy to get wrong:
 *  - easing is bezier control points, NOT a "cubic-bezier(...)" string (a string
 *    is silently ignored and you get the default curve);
 *  - transforms use motion's own props (x/y/scale/rotate), not a `transform`
 *    string, so motion can compose them and keep them on the compositor.
 */
import { animate, stagger as mStagger } from 'motion';
import { DUR, EASE } from './tokens';

type El = Element | Element[];
type Bezier = [number, number, number, number];

const EASE_OUT: Bezier = [...EASE.out];
const EASE_IN: Bezier = [...EASE.in];
const EASE_BACK: Bezier = [...EASE.backOut];

let forcedOff = false;

/** True when the user (or the OS) asked for less motion. */
export function prefersReducedMotion(): boolean {
  if (forcedOff) return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Global kill switch — wired to the settings sheet / low-end device tier. */
export function setMotionEnabled(on: boolean): void { forcedOff = !on; }

/** A resolved animation handle; `.finished` always settles, even when skipped. */
export interface Play { finished: Promise<unknown>; cancel(): void }

const NOOP: Play = { finished: Promise.resolve(), cancel() {} };

const s = (ms: number) => ms / 1000;

function toList(el: El): HTMLElement[] {
  return (el instanceof Element ? [el] : Array.from(el)) as HTMLElement[];
}

/**
 * Run an animation unless motion is suppressed. When suppressed we clear any
 * inline transform and force opacity to 1, so an element can never be left
 * invisible or displaced mid-transition.
 */
function play(el: El, keyframes: Record<string, unknown>, options: Record<string, unknown> = {}): Play {
  if (prefersReducedMotion()) {
    for (const node of toList(el)) {
      if ('opacity' in keyframes) node.style.opacity = '1';
      node.style.transform = '';
    }
    return NOOP;
  }
  const a = animate(el as never, keyframes as never, options as never);
  return { finished: a.finished, cancel: () => a.stop() };
}

export const fx = {
  /** Screen/panel entering. `dx` is the horizontal slide direction (1 fwd, -1 back). */
  enter(el: El, dx = 1): Play {
    return play(el, { opacity: [0, 1], x: [18 * dx, 0] }, { duration: s(DUR.d3), ease: EASE_OUT });
  },

  /** Screen/panel leaving — shorter than enter so the two overlap pleasantly. */
  exit(el: El, dx = 1): Play {
    return play(el, { opacity: [1, 0], x: [0, -14 * dx] }, { duration: s(DUR.d2), ease: EASE_IN });
  },

  /** Children rise into place one after another. Capped so long lists stay snappy. */
  stagger(items: Element[], max = 14): Play {
    const list = items.slice(0, max) as HTMLElement[];
    if (!list.length) return NOOP;
    return play(list, { opacity: [0, 1], y: [10, 0] },
      { duration: s(DUR.d3), ease: EASE_OUT, delay: mStagger(0.035, { startDelay: 0.04 }) });
  },

  /** Attention pop — card ready, reward landing, value changed. */
  pop(el: El, scale = 1.12): Play {
    return play(el, { scale: [1, scale, 1] }, { duration: s(DUR.d4), ease: EASE_BACK });
  },

  /** Modal panel springing in. */
  modalIn(el: El): Play {
    return play(el, { opacity: [0, 1], scale: [0.88, 1], y: [24, 0] },
      { type: 'spring', stiffness: 380, damping: 28 });
  },

  modalOut(el: El): Play {
    return play(el, { opacity: [1, 0], scale: [1, 0.92], y: [0, 12] },
      { duration: s(DUR.d2), ease: EASE_IN });
  },

  /** Backdrop fade, used by both Modal and Sheet. */
  veilIn(el: El): Play {
    return play(el, { opacity: [0, 1] }, { duration: s(DUR.d2), ease: EASE_OUT });
  },

  veilOut(el: El): Play {
    return play(el, { opacity: [1, 0] }, { duration: s(DUR.d2), ease: EASE_IN });
  },

  /** Bottom sheet / toast sliding along Y. */
  slideIn(el: El, from = 100, unit: '%' | 'px' = '%'): Play {
    const y = unit === '%' ? [`${from}%`, '0%'] : [from, 0];
    return play(el, { opacity: [0, 1], y }, { type: 'spring', stiffness: 320, damping: 30 });
  },

  slideOut(el: El, to = 100, unit: '%' | 'px' = '%'): Play {
    const y = unit === '%' ? ['0%', `${to}%`] : [0, to];
    return play(el, { opacity: [1, 0], y }, { duration: s(DUR.d3), ease: EASE_IN });
  },

  /** Error nudge — invalid input, unaffordable card, failed action. */
  shake(el: El): Play {
    return play(el, { x: [0, -6, 5, -3, 0] }, { duration: s(DUR.d4), ease: 'easeOut' });
  },

  /**
   * Tween an integer readout (gold, gems, trophies, XP). Returns a Play so
   * callers can await the tick finishing before, say, showing a reward modal.
   */
  countTo(el: HTMLElement, to: number, opts: { from?: number; duration?: number; format?: (n: number) => string } = {}): Play {
    const format = opts.format ?? ((n: number) => String(n));
    const from = opts.from ?? (Number(String(el.textContent ?? '').replace(/[^\d-]/g, '')) || 0);
    if (from === to || prefersReducedMotion()) {
      el.textContent = format(to);
      return NOOP;
    }
    const a = animate(from, to, {
      duration: s(opts.duration ?? DUR.d5),
      ease: EASE_OUT,
      onUpdate: (v: number) => { el.textContent = format(Math.round(v)); },
    });
    return { finished: a.finished, cancel: () => a.stop() };
  },
};

/** Escape hatch for one-off sequences (chest opening, victory screen). */
export { animate, mStagger as stagger };
export { EASE_OUT, EASE_IN, EASE_BACK };
