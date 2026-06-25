/**
 * Thin wrapper around the Telegram WebApp SDK with a browser dev fallback.
 */

interface TgWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; username?: string; language_code?: string } };
  ready(): void;
  expand(): void;
  colorScheme?: string;
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
  MainButton?: unknown;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const tg = window.Telegram?.WebApp;

export function initTelegram(): void {
  if (tg) {
    tg.ready();
    tg.expand();
  }
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

export function haptic(type: 'light' | 'success' | 'error'): void {
  try {
    if (type === 'light') tg?.HapticFeedback?.impactOccurred('light');
    else tg?.HapticFeedback?.notificationOccurred(type);
  } catch {
    /* no-op */
  }
}
