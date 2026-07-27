/**
 * Dev-only performance overlay: `?fps=1` (or localStorage.debug = '1').
 *
 * Shows the numbers that actually matter for this renderer — frame time, Phaser
 * draw calls, live unit views, the quality tier and the interpolation buffer's
 * depth/delay. A generic stats.js panel reports none of those.
 *
 * Tree-shaken out of production builds via import.meta.env.DEV.
 */

interface FieldStats {
  views: number;
  dying: number;
  tier: string;
  buffer: { depth: number; delay: number; starved: boolean };
  draws: number;
}

let host: HTMLElement | null = null;
let raf = 0;
let statsFn: (() => FieldStats) | null = null;

/** True when the overlay was requested for this session. */
export function perfEnabled(): boolean {
  if (!import.meta.env.DEV && !new URLSearchParams(location.search).has('fps')) return false;
  try {
    return new URLSearchParams(location.search).get('fps') === '1'
      || localStorage.getItem('debug') === '1';
  } catch {
    return false;
  }
}

/** Let the overlay read renderer diagnostics; pass null when a battle ends. */
export function setPerfSource(fn: (() => FieldStats) | null): void {
  statsFn = fn;
}

export function startPerfOverlay(): void {
  if (!perfEnabled() || host) return;
  host = document.createElement('div');
  host.style.cssText = [
    'position:fixed', 'top:4px', 'left:4px', 'z-index:9999',
    'font:11px/1.35 ui-monospace,Menlo,monospace', 'color:#9f9',
    'background:rgba(0,0,0,.65)', 'padding:4px 6px', 'border-radius:6px',
    'pointer-events:none', 'white-space:pre',
  ].join(';');
  document.body.appendChild(host);

  let frames = 0;
  let acc = 0;
  let worst = 0;
  let last = performance.now();
  let fps = 0;

  const tick = () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    frames++;
    acc += dt;
    worst = Math.max(worst, dt);
    if (acc >= 500) {
      fps = (frames * 1000) / acc;
      const s = statsFn?.();
      host!.textContent =
        `${fps.toFixed(0)} fps  worst ${worst.toFixed(1)}ms\n`
        + (s
          ? `draws ${s.draws}  units ${s.views}+${s.dying}  ${s.tier}\n`
            + `buf ${s.buffer.depth} @${s.buffer.delay}ms${s.buffer.starved ? ' STARVED' : ''}`
          : 'no field');
      frames = 0; acc = 0; worst = 0;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

export function stopPerfOverlay(): void {
  cancelAnimationFrame(raf);
  host?.remove();
  host = null;
  statsFn = null;
}
