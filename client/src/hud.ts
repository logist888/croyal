/**
 * Shared HUD helpers for battle & boss screens.
 */
import { ARENA_WIDTH, ARENA_HEIGHT, ELIXIR_MAX, getCard, type CardCooldown } from '@croyal/shared';
import { hex, escapeHtml } from './ui';
import { cardName } from './i18n';
import { cardImageUrl } from './assets';

export function computeFieldSize(): { w: number; h: number } {
  const availH = Math.max(360, window.innerHeight - 250);
  const availW = Math.min(window.innerWidth - 12, 460);
  const w = Math.min(availW, (availH * ARENA_WIDTH) / ARENA_HEIGHT);
  const h = (w * ARENA_HEIGHT) / ARENA_WIDTH;
  return { w: Math.round(w), h: Math.round(h) };
}

export interface HandUI {
  setHand(hand: string[], nextCard: string, elixir: number): void;
  selected(): string | null;
  clearSelection(): void;
  /** Pause DOM rebuilds during a drag so the dragged card isn't orphaned. */
  setRenderHold(hold: boolean): void;
}

export interface HandHandlers {
  /** Tap-to-select (desktop fallback). */
  onSelect?: () => void;
  /** Press on an affordable card → start a drag-to-deploy gesture. */
  onDragStart?: (cardId: string, cell: HTMLElement, ev: PointerEvent) => void;
}

export function buildHand(container: HTMLElement, handlers: HandHandlers = {}): HandUI {
  let selectedId: string | null = null;
  let current: string[] = [];

  function rerender(elixir: number) {
    container.innerHTML = '';
    current.forEach((id) => {
      const c = getCard(id)!;
      const cell = document.createElement('div');
      const affordable = elixir >= c.cost;
      const art = cardImageUrl(id);
      cell.className = 'handcard' + (art ? ' has-art' : '') + (selectedId === id ? ' selected' : '') + (affordable ? '' : ' unaffordable');
      if (art) {
        cell.style.backgroundImage = `url(${art})`;
        cell.innerHTML = '';
      } else {
        cell.style.background = `linear-gradient(180deg, ${hex(c.color)}, ${hex(shadeHex(c.color, -0.3))})`;
        cell.innerHTML = `${escapeHtml(cardName(id))}<div class="cost">${c.cost}</div>`;
      }
      cell.onclick = () => {
        if (!affordable) return;
        selectedId = selectedId === id ? null : id;
        rerender(elixir);
        handlers.onSelect?.();
      };
      if (affordable && handlers.onDragStart) {
        cell.addEventListener('pointerdown', (ev) => handlers.onDragStart!(id, cell, ev));
      }
      container.appendChild(cell);
    });
  }

  let hold = false;
  let pending: { hand: string[]; next: string; elixir: number } | null = null;

  const api: HandUI = {
    setHand(hand, next, elixir) {
      if (hold) { pending = { hand, next, elixir }; return; }
      current = hand;
      if (selectedId && !hand.includes(selectedId)) selectedId = null;
      rerender(elixir);
    },
    selected: () => selectedId,
    clearSelection() { selectedId = null; },
    setRenderHold(h) {
      hold = h;
      if (!h && pending) { const p = pending; pending = null; api.setHand(p.hand, p.next, p.elixir); }
    },
  };
  return api;
}

// --- Trio hand (cooldown battle model): 3 big cards, each with its own recharge ---

export interface TrioUI {
  /**
   * Update the recharge overlays from the latest snapshot. `speed` is the
   * local countdown rate between 10Hz snapshots (2 in the final minute).
   */
  setCooldowns(cds: CardCooldown[], speed?: number): void;
  /** Highlight the spell that is in aim mode (null clears). */
  setAiming(cardId: string | null): void;
}

export interface TrioHandlers {
  /** Tap on a READY card: troops play instantly, spells enter aim mode. */
  onPlay: (cardId: string) => void;
}

export function buildTrioHand(container: HTMLElement, handlers: TrioHandlers): TrioUI {
  container.classList.add('trio');
  let aiming: string | null = null;
  const cells = new Map<string, HTMLElement>();
  // Server truth arrives at 10Hz; a rAF loop counts the overlays down smoothly
  // in between and resyncs on every snapshot.
  const timers = new Map<string, { remaining: number; total: number; at: number; speed: number }>();

  function buildCell(cardId: string): HTMLElement {
    const c = getCard(cardId)!;
    const cell = document.createElement('div');
    const art = cardImageUrl(cardId);
    cell.className = 'handcard triocard' + (art ? ' has-art' : '');
    if (art) {
      cell.style.backgroundImage = `url(${art})`;
    } else {
      cell.style.background = `linear-gradient(180deg, ${hex(c.color)}, ${hex(shadeHex(c.color, -0.3))})`;
      cell.innerHTML = `<span class="triocard-name">${escapeHtml(cardName(cardId))}</span>`;
    }
    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    const num = document.createElement('div');
    num.className = 'cd-num';
    cell.appendChild(overlay);
    cell.appendChild(num);
    cell.onclick = () => {
      if (cell.classList.contains('cooling')) return;
      handlers.onPlay(cardId);
    };
    container.appendChild(cell);
    return cell;
  }

  function paint(cardId: string, remaining: number, total: number): void {
    const cell = cells.get(cardId);
    if (!cell) return;
    const cooling = remaining > 0.001;
    if (cell.classList.contains('cooling') && !cooling) {
      // recharge finished — a little "ready" pop
      cell.classList.add('pop');
      window.setTimeout(() => cell.classList.remove('pop'), 350);
    }
    cell.classList.toggle('cooling', cooling);
    const overlay = cell.querySelector<HTMLDivElement>('.cd-overlay')!;
    const num = cell.querySelector<HTMLDivElement>('.cd-num')!;
    const frac = cooling && total > 0 ? Math.min(1, remaining / total) : 0;
    overlay.style.height = `${frac * 100}%`;
    num.textContent = cooling ? String(Math.ceil(remaining)) : '';
  }

  let raf = 0;
  const tick = () => {
    if (!container.isConnected) {
      cancelAnimationFrame(raf);
      return;
    }
    const now = performance.now();
    for (const [id, tm] of timers) {
      const rem = Math.max(0, tm.remaining - ((now - tm.at) / 1000) * tm.speed);
      paint(id, rem, tm.total);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    setCooldowns(cds: CardCooldown[], speed = 1) {
      for (const cd of cds) {
        if (!cells.has(cd.cardId)) cells.set(cd.cardId, buildCell(cd.cardId));
        timers.set(cd.cardId, { remaining: cd.remaining, total: cd.total, at: performance.now(), speed });
      }
    },
    setAiming(cardId: string | null) {
      aiming = cardId;
      for (const [id, cell] of cells) cell.classList.toggle('aiming', aiming === id);
    },
  };
}

export function elixirBarHtml(): string {
  return `<div class="elixir-wrap">
    <div class="elixir-drop"></div>
    <div class="elixir-bar"><div class="elixir-fill" id="elixir-fill"></div><div class="elixir-seg"></div></div>
    <div class="elixir-num" id="elixir-num">0</div>
  </div>`;
}

export function setElixir(root: HTMLElement, value: number): void {
  const fill = root.querySelector<HTMLDivElement>('#elixir-fill');
  if (fill) fill.style.width = `${Math.min(100, (value / ELIXIR_MAX) * 100)}%`;
  const num = root.querySelector<HTMLDivElement>('#elixir-num');
  if (num) num.textContent = String(Math.floor(value));
}

export function nextCardHtml(): string {
  return `<div class="next-card" id="next"><span class="next-label">→</span><span id="next-name"></span></div>`;
}

export function setNextCard(root: HTMLElement, id: string): void {
  const el = root.querySelector<HTMLDivElement>('#next');
  if (!el || !id) return;
  const c = getCard(id);
  if (!c) return;
  const name = root.querySelector<HTMLSpanElement>('#next-name');
  const art = cardImageUrl(id);
  if (art) {
    el.style.backgroundImage = `url(${art})`;
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
    if (name) name.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.style.background = `linear-gradient(180deg, ${hex(c.color)}, ${hex(shadeHex(c.color, -0.3))})`;
    if (name) name.textContent = cardName(id);
  }
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function shadeHex(color: number, amt: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amt)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
