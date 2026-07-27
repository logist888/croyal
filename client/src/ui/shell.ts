/**
 * The persistent navigation shell.
 *
 * A DOM node that lives beside #ui rather than inside it, because setUI() does
 * `ui.replaceChildren()` and the screen transition translates `.screen` — a
 * backdrop-filter inside a transformed ancestor loses its backdrop root and
 * renders flat. The bar has to be a sibling for the glass to work at all.
 *
 * Its five cells ARE re-rendered on every navigation, deliberately. Badges are
 * derived from `state.profile`, which is a plain mutable object with ~20
 * assignment sites and no observers; repainting five cells whenever the player
 * navigates makes "the badge clears when you visit" true for free, with no
 * observer refactor. Five cells is ~2 KB of innerHTML at human tap rate.
 */
import { hasDailyRewards, hasBattlePassRewards, chestState, type ChestSlot } from '@croyal/shared';
import { state } from '../state';
import { t } from '../i18n';
import { haptic, setBackButton } from '../telegram';
import { Glyph, type GlyphId } from './glyphs';

/** A tab is a place, not a feature — five containers, not five destinations. */
export type TabId = 'shop' | 'cards' | 'arena' | 'clan' | 'events';

export interface ShellNav {
  toMenu(): void;
  toShop(): void;
  toCollection(): void;
  toClans(): void;
  toEvents(): void;
}

interface TabDef {
  id: TabId;
  glyph: GlyphId;
  labelKey: string;
  go: (nav: ShellNav) => void;
}

const TABS: TabDef[] = [
  { id: 'shop',   glyph: 'shop',   labelKey: 'tab.shop',   go: (n) => n.toShop() },
  { id: 'cards',  glyph: 'cards',  labelKey: 'tab.cards',  go: (n) => n.toCollection() },
  { id: 'arena',  glyph: 'arena',  labelKey: 'tab.arena',  go: (n) => n.toMenu() },
  { id: 'clan',   glyph: 'clan',   labelKey: 'tab.clan',   go: (n) => n.toClans() },
  { id: 'events', glyph: 'events', labelKey: 'tab.events', go: (n) => n.toEvents() },
];

/**
 * Which screen belongs to which tab. Screens absent from this map are "deep" —
 * they keep the bar but light no tab, and they get the native back button.
 */
const SCREEN_TAB: Record<string, TabId> = {
  menu: 'arena',
  shop: 'shop',
  collection: 'cards',
  trio: 'cards',
  clans: 'clan',
  war: 'clan',
  events: 'events',
  leaderboard: 'events',
  friendly: 'events',
  tournament: 'events',
  battlepass: 'events',
  daily: 'arena',
};

/** Screens with no shell at all: full-attention or pre-account. */
const NO_SHELL = new Set(['register', 'onboarding', 'loading', 'battle', 'boss', 'replay', 'result']);

/** Screens that are a tab's own root — a back button there is meaningless. */
const TAB_ROOTS = new Set(['menu', 'shop', 'collection', 'clans', 'events']);

let host: HTMLElement | null = null;
let bar: HTMLElement | null = null;
let ind: HTMLElement | null = null;
let nav: ShellNav | null = null;
let offBack: (() => void) | null = null;

/** Called once at boot, before the first screen mounts. */
export function mountShell(n: ShellNav): void {
  nav = n;
  if (host) return;
  host = document.createElement('div');
  host.className = 'navbar-wrap';
  host.hidden = true;
  // The indicator is a sibling of the cells, NOT part of the markup they
  // re-render — otherwise it would be destroyed and rebuilt on every navigation
  // and could never animate between tabs.
  host.innerHTML = '<div class="navbar-scrim"></div>'
    + '<nav class="navbar" role="tablist"><i class="nav-ind" aria-hidden="true"></i>'
    + '<div class="nav-cells"></div></nav>'
    + '<div class="navbar-pad"></div>';
  document.getElementById('app')!.appendChild(host);
  bar = host.querySelector<HTMLElement>('.nav-cells');
  ind = host.querySelector<HTMLElement>('.nav-ind');
}

/** How many claimable things live behind the Events tab. */
function eventsBadge(): number {
  const p = state.profile;
  if (!p) return 0;
  let n = 0;
  if (hasBattlePassRewards(p.battlePass)) n++;
  if (p.warReward) n++;
  return n;
}

/** Chests ready to open, shown on the Arena tab. */
function arenaBadge(): number {
  const p = state.profile;
  if (!p) return 0;
  let n = 0;
  if (p.daily && hasDailyRewards(p.daily)) n++;
  for (const c of (p.chests ?? []) as ChestSlot[]) {
    if (chestState(c, Date.now()) === 'ready') n++;
  }
  return n;
}

const BADGE: Partial<Record<TabId, () => number>> = {
  arena: arenaBadge,
  events: eventsBadge,
};

/**
 * Sync the shell to the screen being mounted. Called from setUI().
 * Returns true when the bar is visible, so setUI can pick the transition.
 */
export function syncShell(screen: string | null): boolean {
  if (!host || !bar || !nav) return false;

  const visible = !!screen && !NO_SHELL.has(screen) && !!state.profile;
  host.hidden = !visible;
  document.body.classList.toggle('has-nav', visible);

  // The native back button belongs to screens DEEPER than a tab root. On a tab
  // root the tabs are the navigation and a back arrow is just confusing; in a
  // battle it is dangerous, because one stray tap would forfeit the match.
  offBack?.();
  offBack = visible && screen && !TAB_ROOTS.has(screen)
    ? setBackButton(() => backFrom(screen))
    : setBackButton(null);

  if (!visible) return false;

  const active = screen ? SCREEN_TAB[screen] : undefined;
  bar.innerHTML = TABS.map((tab) => {
    const count = BADGE[tab.id]?.() ?? 0;
    return `<button class="nav-cell" role="tab" data-tab="${tab.id}"`
      + ` aria-selected="${tab.id === active}">`
      + Glyph(tab.glyph, 26)
      + `<span>${t(tab.labelKey)}</span>`
      + (count > 0 ? `<i class="nav-badge">${count > 9 ? '9+' : count}</i>` : '')
      + '</button>';
  }).join('');

  for (const cell of bar.querySelectorAll<HTMLButtonElement>('.nav-cell')) {
    cell.addEventListener('click', () => {
      const tab = TABS.find((x) => x.id === cell.dataset.tab);
      if (!tab) return;
      haptic('select');
      tab.go(nav!);
    });
  }
  moveIndicator(active);
  return true;
}

/**
 * Slide the capsule to the active cell. Position comes from the cell's measured
 * box rather than an index times a width, because the five columns are `1fr` and
 * the real width depends on the device.
 */
function moveIndicator(active: TabId | undefined): void {
  if (!ind || !bar) return;
  if (!active) { ind.style.opacity = '0'; return; }
  const cell = bar.querySelector<HTMLElement>(`.nav-cell[data-tab="${active}"]`);
  if (!cell) { ind.style.opacity = '0'; return; }
  const x = cell.offsetLeft + cell.offsetWidth / 2;
  ind.style.opacity = '1';
  ind.style.width = `${Math.round(cell.offsetWidth * 0.82)}px`;
  ind.style.transform = `translateX(${Math.round(x)}px) translateX(-50%)`;
}

/** Where "back" goes from a deep screen: to the root of its own tab. */
function backFrom(screen: string): void {
  if (!nav) return;
  haptic('light');
  const tab = SCREEN_TAB[screen];
  const def = TABS.find((x) => x.id === tab);
  (def ?? TABS[2]).go(nav);
}

/** True when this screen sits under the bar (used to pick the transition). */
export function isTabScreen(screen: string | null): boolean {
  return !!screen && !NO_SHELL.has(screen);
}
