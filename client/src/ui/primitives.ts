/**
 * Shared UI primitives.
 *
 * Every primitive exposes an `.html()` string form so it can drop straight into
 * the existing template literals in ui.ts, and an `.el()` DOM form for code that
 * needs the node. Behaviour is attached later by `hydrate()`, which setUI() runs
 * on each mounted screen — so a screen adopts a primitive by emitting the right
 * markup, with no restructuring.
 */
import { haptic } from '../telegram';
import { escapeHtml } from '../html';
import { fx, prefersReducedMotion } from './motion';

/* ------------------------------------------------------------------ Button */

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonOpts {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  id?: string;
  /** Rendered raw — pass an Icon().html() here, not user text. */
  iconHtml?: string;
  disabled?: boolean;
  /** Red notification dot in the top-right corner. */
  notify?: boolean;
  className?: string;
  /** Extra attributes, e.g. `{ 'data-card': id }`. Values are escaped. */
  attrs?: Record<string, string>;
}

function attrString(attrs?: Record<string, string>): string {
  if (!attrs) return '';
  return Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');
}

export const Button = {
  html(o: ButtonOpts): string {
    const variant = o.variant ?? 'primary';
    const cls = [
      variant === 'primary' ? '' : variant,
      o.size && o.size !== 'md' ? `btn-${o.size}` : '',
      o.className ?? '',
    ].filter(Boolean).join(' ');
    return `<button data-primitive="btn"${o.id ? ` id="${escapeHtml(o.id)}"` : ''}`
      + `${cls ? ` class="${cls}"` : ''}${o.disabled ? ' disabled' : ''}${attrString(o.attrs)}>`
      + `${o.iconHtml ?? ''}<span class="btn-label">${escapeHtml(o.label)}</span>`
      + `${o.notify ? '<i class="claim-dot btn-dot"></i>' : ''}`
      + `</button>`;
  },
  el(o: ButtonOpts & { onClick?: () => void }): HTMLButtonElement {
    const wrap = document.createElement('div');
    wrap.innerHTML = Button.html(o);
    const btn = wrap.firstElementChild as HTMLButtonElement;
    if (o.onClick) btn.addEventListener('click', o.onClick);
    return btn;
  },
  /** Put a button into / out of its loading state (keeps its width stable). */
  setLoading(btn: HTMLButtonElement, on: boolean): void {
    btn.classList.toggle('is-loading', on);
    btn.disabled = on;
  },
};

/* ------------------------------------------------------------------- Panel */

export interface PanelOpts {
  bodyHtml: string;
  variant?: 'wood' | 'glass' | 'flat';
  title?: string;
  rightHtml?: string;
  className?: string;
}

export const Panel = {
  html(o: PanelOpts): string {
    const v = o.variant && o.variant !== 'wood' ? ` panel-${o.variant}` : '';
    const head = o.title || o.rightHtml
      ? `<div class="row space-between panel-head"><h2>${escapeHtml(o.title ?? '')}</h2>${o.rightHtml ?? ''}</div>`
      : '';
    return `<div class="card${v}${o.className ? ' ' + o.className : ''}">${head}${o.bodyHtml}</div>`;
  },
};

/* -------------------------------------------------------------------- Icon */

/**
 * Game icons live in `assets/ui/<name>.png`. When an icon is missing we fall
 * back to the emoji the UI used before, so this can be adopted name by name.
 */
const ICON_FALLBACK: Record<string, string> = {
  crown: '👑', gold: '🪙', gem: '💎', elixir: '💧', trophy: '🏆', lock: '🔒',
  timer: '⏳', star: '⭐', xp: '⬆', clan_badge: '🛡', vs_banner: '⚔️',
  medal_gold: '🥇', medal_silver: '🥈', medal_bronze: '🥉',
  chest_wood: '🎁', chest_silver: '🎁', chest_gold: '🎁', chest_magic: '🎁', chest_legendary: '🎁',
};

let iconUrl: (name: string) => string | undefined = () => undefined;
/** Wired at boot from assets.ts (avoids a module cycle between ui/ and assets). */
export function setIconResolver(fn: (name: string) => string | undefined): void { iconUrl = fn; }

export function Icon(name: string, size = 16): string {
  const url = iconUrl(name);
  if (!url) {
    const glyph = ICON_FALLBACK[name] ?? '';
    return glyph ? `<i class="icon icon-emoji" style="--icon-size:${size}px">${glyph}</i>` : '';
  }
  return `<i class="icon" style="--icon-size:${size}px;background-image:url('${url}')"></i>`;
}

/* ------------------------------------------------------------- ProgressBar */

export type BarKind = 'elixir' | 'xp' | 'hp' | 'chest' | 'league';

export interface BarOpts {
  value: number;      // 0..1
  kind?: BarKind;
  id?: string;
  height?: number;
  className?: string;
  segments?: number;  // draws n divisions over the fill (elixir)
}

export const ProgressBar = {
  html(o: BarOpts): string {
    const pct = Math.max(0, Math.min(1, o.value)) * 100;
    const style = o.height ? ` style="--bar-h:${o.height}px"` : '';
    const seg = o.segments ? `<div class="bar-seg" style="--bar-seg:${o.segments}"></div>` : '';
    return `<div class="bar bar-${o.kind ?? 'xp'}${o.className ? ' ' + o.className : ''}"`
      + `${o.id ? ` id="${escapeHtml(o.id)}"` : ''}${style}>`
      + `<div class="bar-fill" style="width:${pct.toFixed(2)}%"></div>${seg}</div>`;
  },
  /** Animate an existing bar to a new 0..1 value. */
  set(bar: HTMLElement, value: number): void {
    const fill = bar.querySelector<HTMLElement>('.bar-fill');
    if (!fill) return;
    // Width is tweened by the CSS transition on .bar-fill (cheap, and it
    // survives being set many times per second by the battle HUD).
    fill.style.transition = prefersReducedMotion() ? 'none' : '';
    fill.style.width = `${(Math.max(0, Math.min(1, value)) * 100).toFixed(2)}%`;
  },
};

/* ------------------------------------------------------------------- Toast */

let toastHost: HTMLElement | null = null;
function getToastHost(): HTMLElement {
  if (toastHost?.isConnected) return toastHost;
  toastHost = document.createElement('div');
  toastHost.className = 'toast-host';
  document.body.appendChild(toastHost);
  return toastHost;
}

export type ToastKind = 'info' | 'success' | 'error';

/** Replaces `alert()` — non-blocking, stacked, auto-dismissing. */
export function toast(message: string, kind: ToastKind = 'info', ms = 2600): void {
  const host = getToastHost();
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  haptic(kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'light');
  fx.slideIn(el, -20, 'px');
  const kill = () => {
    if (!el.isConnected) return;
    fx.slideOut(el, -12, 'px').finished.finally(() => el.remove());
  };
  const timer = setTimeout(kill, ms);
  el.addEventListener('click', () => { clearTimeout(timer); kill(); });
}

/* ------------------------------------------------------------ Modal / Sheet */

export interface ModalHandle {
  el: HTMLElement;
  body: HTMLElement;
  close: () => void;
  closed: Promise<void>;
}

interface ModalOpts {
  bodyHtml?: string;
  className?: string;
  /** Bottom sheet instead of a centred dialog — better thumb reach on phones. */
  sheet?: boolean;
  /** Tap-outside and Esc dismiss. Default true. */
  dismissable?: boolean;
}

/** One implementation for what used to be three hand-duplicated overlays. */
export function openModal(o: ModalOpts = {}): ModalHandle {
  const overlay = document.createElement('div');
  overlay.className = o.sheet ? 'modal-overlay sheet-overlay' : 'modal-overlay';
  const panel = document.createElement('div');
  panel.className = `card modal${o.sheet ? ' sheet' : ''}${o.className ? ' ' + o.className : ''}`;
  panel.innerHTML = o.bodyHtml ?? '';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  hydrate(panel);

  fx.veilIn(overlay);
  if (o.sheet) fx.slideIn(panel); else fx.modalIn(panel);

  let resolveClosed: () => void;
  const closed = new Promise<void>((res) => { resolveClosed = res; });
  let closing = false;

  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    fx.veilOut(overlay);
    const out = o.sheet ? fx.slideOut(panel) : fx.modalOut(panel);
    out.finished.finally(() => { overlay.remove(); resolveClosed(); });
  };

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

  if (o.dismissable !== false) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
  }
  return { el: overlay, body: panel, close, closed };
}

/** Replaces `confirm()`. Resolves true when the primary action is chosen. */
export function confirmSheet(opts: {
  title: string; message?: string; confirmLabel: string; cancelLabel: string; danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const m = openModal({
      sheet: true,
      bodyHtml: `<div class="col">
        <h2>${escapeHtml(opts.title)}</h2>
        ${opts.message ? `<div class="muted">${escapeHtml(opts.message)}</div>` : ''}
        <div class="row">
          ${Button.html({ label: opts.cancelLabel, variant: 'secondary', className: 'grow', id: 'cf-no' })}
          ${Button.html({ label: opts.confirmLabel, variant: opts.danger ? 'danger' : 'accent', className: 'grow', id: 'cf-yes' })}
        </div></div>`,
    });
    let answer = false;
    m.body.querySelector('#cf-yes')?.addEventListener('click', () => { answer = true; m.close(); });
    m.body.querySelector('#cf-no')?.addEventListener('click', () => m.close());
    void m.closed.then(() => resolve(answer));
  });
}

/* ----------------------------------------------------------------- hydrate */

/**
 * Attach behaviour to a freshly-built screen. Runs from setUI() on every mount.
 *
 * Note on button feel: the chunky press (translateY + shadow collapse) stays in
 * CSS `:active`. Driving it from JS would write an inline `transform`, which
 * permanently outranks the `:active` rule and kills the effect. So here we only
 * add what CSS cannot: haptics and staggered entrances.
 */
export function hydrate(root: HTMLElement): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>('button')) {
    if (btn.dataset.hydrated) continue;
    btn.dataset.hydrated = '1';
    if (btn.dataset.haptic !== 'off') {
      btn.addEventListener('pointerdown', () => { if (!btn.disabled) haptic('light'); }, { passive: true });
    }
  }
  for (const group of root.querySelectorAll<HTMLElement>('[data-stagger]')) {
    if (group.dataset.staggered) continue;
    group.dataset.staggered = '1';
    fx.stagger(Array.from(group.children) as Element[]);
  }
}
