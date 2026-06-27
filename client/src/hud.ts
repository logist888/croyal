/**
 * Shared HUD helpers for battle & boss screens.
 */
import { ARENA_WIDTH, ARENA_HEIGHT, ELIXIR_MAX, getCard } from '@croyal/shared';
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
}

export function buildHand(container: HTMLElement, onSelect: () => void): HandUI {
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
        onSelect();
      };
      container.appendChild(cell);
    });
  }

  return {
    setHand(hand, _next, elixir) {
      current = hand;
      if (selectedId && !hand.includes(selectedId)) selectedId = null;
      rerender(elixir);
    },
    selected: () => selectedId,
    clearSelection() { selectedId = null; },
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
