/**
 * The one card renderer.
 *
 * Replaces seven near-duplicate implementations: the battle hand and trio hand
 * (hud.ts), the hub deck strip, the chest reward tile, the trio picker and the
 * collection grid (ui.ts), and the onboarding reveal (onboarding.ts).
 *
 * Two things it fixes beyond de-duplication:
 *  1. The elixir cost is always visible. The old hand renderer blanked the tile
 *     whenever real art existed, so in a live battle you could not see what a
 *     card cost. A gradient scrim under the text solves that.
 *  2. Rarity reads at a glance — frame, glow and (for legendary) a shine sweep,
 *     instead of a 2px border colour.
 *
 * Note on frames: `assets/ui/frame_*.png` are NOT used. They are 64x64 with
 * transparent margins and square ornate corners (so they distort on a 3:4 tile),
 * `frame_common` has an opaque centre that would cover the art entirely, and
 * there is no `frame_legendary` at all. The frame is built in CSS from the
 * `--rarity-*` tokens instead, which is resolution-independent and complete.
 */
import { getCard, type Rarity } from '@croyal/shared';
import { cardImageUrl } from '../assets';
import { cardName } from '../i18n';
import { escapeHtml, hex } from '../html';

export type TileSize = 'xs' | 'sm' | 'md' | 'lg';
export type TileState = 'normal' | 'locked' | 'selected' | 'cooling' | 'unaffordable' | 'aiming' | 'dragging';
export type TileFooter = 'none' | 'level' | 'cost' | 'count' | 'text';
export type TileBadge = 'pair' | 'upgrade' | 'new';

export interface CardTileOpts {
  cardId: string;
  size?: TileSize;
  /** Extra line under the art. `text` uses `footerText` verbatim (escaped). */
  footer?: TileFooter;
  footerText?: string;
  state?: TileState;
  badges?: TileBadge[];
  /** Show the elixir/recharge cost badge. Default: true. */
  showCost?: boolean;
  /** Override the badge text — e.g. "6s" in the cooldown battle model. */
  costText?: string;
  /** Show the card name over the art. Default: true below size 'xs'. */
  showName?: boolean;
  /** Renders the recharge veil at build time (the trio hand drives it live). */
  cooldown?: { remaining: number; total: number };
  className?: string;
  /** Extra attributes; values are escaped. */
  attrs?: Record<string, string>;
  /** Defer loading the portrait until the tile is near the viewport. */
  lazy?: boolean;
}

function rarityOf(cardId: string): Rarity {
  return getCard(cardId)?.rarity ?? 'common';
}

/** Markup form, for dropping into the existing template literals. */
export function cardTileHtml(o: CardTileOpts): string {
  const card = getCard(o.cardId);
  if (!card) return '';
  const size = o.size ?? 'md';
  const rarity = rarityOf(o.cardId);
  const art = cardImageUrl(o.cardId);
  const showCost = o.showCost !== false;
  const showName = o.showName ?? size !== 'xs';
  const name = cardName(o.cardId);

  // No art yet → keep the old coloured-gradient placeholder so the game still
  // reads while art is being added card by card.
  //
  // `lazy` defers the background-image to an IntersectionObserver (see
  // observeLazyArt). The collection renders the full 80-card catalog, and
  // fetching every portrait up front is ~2 MB the player mostly never scrolls to.
  //
  // This MUST stay the `background-image` longhand. The `background:` shorthand
  // resets background-size and background-position to their initial values, and
  // an inline style outranks the stylesheet — a shorthand here silently killed
  // `background-size: cover` and rendered every portrait zoomed into its
  // top-left corner. card-tile.test.ts guards it.
  const placeholder = `background-image:linear-gradient(180deg, ${hex(card.color)}, ${hex(shade(card.color, -0.3))})`;
  const artStyle = !art ? placeholder
    : o.lazy ? placeholder
    : `background-image:url('${art}')`;
  const lazyAttr = art && o.lazy ? ` data-art="${escapeHtml(art)}"` : '';

  const attrs = Object.entries(o.attrs ?? {})
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');

  const cdFrac = o.cooldown && o.cooldown.total > 0
    ? Math.min(1, Math.max(0, o.cooldown.remaining / o.cooldown.total)) : 0;

  const hasFooter = !!o.footer && o.footer !== 'none';
  return `<div class="ct ct-${size}${hasFooter ? ' ct-has-footer' : ''}${o.className ? ' ' + o.className : ''}"`
    + ` data-rarity="${rarity}" data-state="${o.state ?? 'normal'}" data-card="${escapeHtml(o.cardId)}"${attrs}>`
    + `<div class="ct-art"${lazyAttr} style="${artStyle}"></div>`
    + (showName ? '<div class="ct-scrim"></div>' : '')
    + '<div class="ct-frame"></div>'
    + (rarity === 'legendary' ? '<div class="ct-shine"></div>' : '')
    + (showCost
      ? `<div class="ct-cost${o.costText ? ' ct-cost-cd' : ''}">${escapeHtml(o.costText ?? String(card.cost))}</div>`
      : '')
    + (showName ? `<div class="ct-name">${escapeHtml(name)}</div>` : '')
    + footerHtml(o)
    + badgesHtml(o.badges)
    + `<div class="ct-cd" style="height:${(cdFrac * 100).toFixed(1)}%"></div>`
    + '<div class="ct-cd-num"></div>'
    + '</div>';
}

function footerHtml(o: CardTileOpts): string {
  if (!o.footer || o.footer === 'none') return '';
  const text = o.footerText ?? '';
  return `<div class="ct-footer ct-footer-${o.footer}">${escapeHtml(text)}</div>`;
}

function badgesHtml(badges?: TileBadge[]): string {
  if (!badges?.length) return '';
  return badges.map((b) => `<i class="ct-badge ct-badge-${b}"></i>`).join('');
}

/** DOM form, for code that needs the node (hand, trio, picker). */
export function cardTile(o: CardTileOpts & { onClick?: (cardId: string) => void }): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = cardTileHtml(o);
  const el = wrap.firstElementChild as HTMLElement;
  if (o.onClick) el.addEventListener('click', () => o.onClick!(o.cardId));
  return el;
}

/* ------------------------------------------------------------- mutations */

export function setTileState(el: HTMLElement, state: TileState): void {
  el.dataset.state = state;
}

export function toggleTileClass(el: HTMLElement, cls: string, on: boolean): void {
  el.classList.toggle(cls, on);
}

/**
 * Drive the recharge veil. Called from the trio hand's rAF loop, so it must stay
 * allocation-free and touch as few properties as possible.
 */
export function setTileCooldown(el: HTMLElement, remaining: number, total: number): boolean {
  const cooling = remaining > 0.001;
  const veil = el.querySelector<HTMLElement>('.ct-cd');
  const num = el.querySelector<HTMLElement>('.ct-cd-num');
  const wasCooling = el.dataset.state === 'cooling';
  if (veil) veil.style.height = cooling && total > 0 ? `${Math.min(100, (remaining / total) * 100)}%` : '0%';
  if (num) num.textContent = cooling ? String(Math.ceil(remaining)) : '';
  if (cooling !== wasCooling) el.dataset.state = cooling ? 'cooling' : 'normal';
  // true exactly on the cooling → ready edge, so the caller can pop it.
  return wasCooling && !cooling;
}

/**
 * Load deferred portraits as they approach the viewport. Called once per grid;
 * the observer disconnects itself when the container leaves the DOM.
 */
export function observeLazyArt(root: HTMLElement): void {
  const pending = root.querySelectorAll<HTMLElement>('.ct-art[data-art]');
  if (!pending.length) return;
  if (!('IntersectionObserver' in window)) {
    for (const el of pending) reveal(el);
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      reveal(e.target as HTMLElement);
      io.unobserve(e.target);
    }
    if (!root.isConnected) io.disconnect();
  }, { root: null, rootMargin: '300px 0px' });
  for (const el of pending) io.observe(el);
}

function reveal(el: HTMLElement): void {
  const url = el.dataset.art;
  if (!url) return;
  delete el.dataset.art;
  el.style.backgroundImage = `url('${url}')`;
}

function shade(color: number, amt: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amt)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
