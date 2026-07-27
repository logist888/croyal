/**
 * Thin wrapper around the Telegram WebApp SDK with a browser dev fallback.
 */

interface SafeAreaInset { top: number; bottom: number; left: number; right: number }

interface TgWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; username?: string; language_code?: string } };
  version?: string;
  ready(): void;
  expand(): void;
  /** Bot API 7.7+: stop Telegram from treating vertical drags as a close gesture. */
  disableVerticalSwipes?(): void;
  isVersionAtLeast?(v: string): boolean;
  colorScheme?: string;
  /** Height that stays stable while the on-screen keyboard is up. */
  viewportStableHeight?: number;
  viewportHeight?: number;
  onEvent?(event: string, cb: () => void): void;
  offEvent?(event: string, cb: () => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void; selectionChanged?(): void };
  MainButton?: unknown;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const tg = window.Telegram?.WebApp;

/** Version-gated feature check; false in a plain browser. */
function atLeast(v: string): boolean {
  try { return !!tg?.isVersionAtLeast?.(v); } catch { return false; }
}

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Critical for battle: otherwise a vertical drag (used to place a card on the
  // field) is captured by Telegram as a "minimize app" gesture and never reaches
  // the game. Method exists from Bot API 7.7 — guard for older clients.
  try { tg.disableVerticalSwipes?.(); } catch { /* older client */ }

  // Paint Telegram's own chrome to match the game. We deliberately do NOT theme
  // game surfaces from themeParams — the app has its own art direction; this is
  // only so the header/bottom bar don't sit as a bright strip around it.
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim() || '#123012';
  try {
    if (atLeast('6.9')) tg.setHeaderColor?.(bg);
    if (atLeast('6.9')) tg.setBackgroundColor?.(bg);
    if (atLeast('7.10')) tg.setBottomBarColor?.(bg);
  } catch { /* older client */ }

  applySafeArea();
  tg.onEvent?.('safeAreaChanged', applySafeArea);
  tg.onEvent?.('contentSafeAreaChanged', applySafeArea);
}

/**
 * Mirror Telegram's insets into CSS vars. In fullscreen the Telegram header
 * overlays our content, so the *content* inset is what must be honoured at the
 * top; env(safe-area-inset-*) alone is not enough.
 */
function applySafeArea(): void {
  if (!tg || !atLeast('8.0')) return;
  const sa = tg.safeAreaInset;
  const csa = tg.contentSafeAreaInset;
  const root = document.documentElement.style;
  const top = Math.max(sa?.top ?? 0, csa?.top ?? 0);
  root.setProperty('--tg-safe-top', `${top}px`);
  root.setProperty('--tg-safe-bottom', `${sa?.bottom ?? 0}px`);
}

/**
 * Usable viewport height. `viewportStableHeight` excludes the on-screen
 * keyboard, which is what layout should size against.
 */
export function viewportHeight(): number {
  return tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
}

/**
 * Subscribe to viewport changes (rotation, keyboard, Telegram resizing the
 * sheet). Returns an unsubscribe function. Debounced, because Telegram fires
 * `viewportChanged` continuously while the sheet is being dragged.
 */
export function onViewport(cb: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(cb, 150);
  };
  tg?.onEvent?.('viewportChanged', fire);
  window.addEventListener('resize', fire);
  window.addEventListener('orientationchange', fire);
  return () => {
    if (timer) clearTimeout(timer);
    tg?.offEvent?.('viewportChanged', fire);
    window.removeEventListener('resize', fire);
    window.removeEventListener('orientationchange', fire);
  };
}

/**
 * Drive Telegram's native back button. Returns an unsubscribe function.
 * Passing null hides it (the hub is the root, and a battle must not be
 * abandoned by a stray back tap).
 */
export function setBackButton(handler: (() => void) | null): () => void {
  const bb = tg?.BackButton;
  if (!bb || !atLeast('6.1')) return () => {};
  if (!handler) { try { bb.hide(); } catch { /* ignore */ } return () => {}; }
  const cb = () => handler();
  try { bb.onClick(cb); bb.show(); } catch { return () => {}; }
  return () => { try { bb.offClick(cb); bb.hide(); } catch { /* ignore */ } };
}

export function getInitData(): string | undefined {
  return tg?.initData && tg.initData.length > 0 ? tg.initData : undefined;
}

/** Stable dev user id for browser testing (no Telegram context). */
export function getDevUser(): { id: number; username?: string } {
  let id = Number(localStorage.getItem('devUserId') ?? '0');
  if (!id) {
    id = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('devUserId', String(id));
  }
  return { id, username: `Guest${id % 1000}` };
}

export function suggestedLanguage(): 'en' | 'ru' {
  return tg?.initDataUnsafe?.user?.language_code === 'ru' ? 'ru' : 'en';
}

/**
 * Tactile feedback. The impact styles are what give in-battle actions weight —
 * a deploy should feel heavier than a menu tap, and losing a tower heavier still.
 */
export type Haptic =
  | 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
  | 'select' | 'success' | 'error' | 'warning';

export function haptic(type: Haptic): void {
  try {
    const h = tg?.HapticFeedback;
    if (!h) return;
    if (type === 'select') h.selectionChanged?.();
    else if (type === 'success' || type === 'error' || type === 'warning') h.notificationOccurred(type);
    else h.impactOccurred(type);
  } catch {
    /* no-op */
  }
}
