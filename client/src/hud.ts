/**
 * Shared HUD helpers for battle & boss screens.
 */
import { ARENA_WIDTH, ARENA_HEIGHT, ELIXIR_MAX, getCard } from '@croyal/shared';
import { hex, escapeHtml } from './ui';

export function computeFieldSize(): { w: number; h: number } {
  const availH = Math.max(360, window.innerHeight - 230);
  const availW = Math.min(window.innerWidth - 12, 460);
  let w = Math.min(availW, (availH * ARENA_WIDTH) / ARENA_HEIGHT);
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
      cell.className = 'handcard' + (selectedId === id ? ' selected' : '') + (affordable ? '' : ' unaffordable');
      cell.style.background = hex(c.color);
      cell.innerHTML = `${escapeHtml(c.name)}<div class="cost">${c.cost}</div>`;
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
    clearSelection() {
      selectedId = null;
    },
  };
}

export function elixirBarHtml(): string {
  return `<div class="elixir-bar"><div class="elixir-fill" id="elixir-fill"></div></div>`;
}

export function setElixir(root: HTMLElement, value: number): void {
  const fill = root.querySelector<HTMLDivElement>('#elixir-fill');
  if (fill) fill.style.width = `${Math.min(100, (value / ELIXIR_MAX) * 100)}%`;
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
