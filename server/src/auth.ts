/**
 * Telegram Mini App authentication.
 *
 * In production we verify `initData` from the Telegram WebApp SDK by recomputing
 * the HMAC per Telegram's spec. In development (no BOT_TOKEN, or ALLOW_DEV_AUTH=1)
 * we accept a plain dev user id so the game runs in a normal browser.
 */
import { createHmac } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const ALLOW_DEV_AUTH = process.env.ALLOW_DEV_AUTH === '1' || BOT_TOKEN === '';

export interface AuthResult {
  ok: boolean;
  user?: TelegramUser;
  error?: string;
}

/** Verify Telegram WebApp initData. Returns the embedded user when valid. */
export function verifyInitData(initData: string): AuthResult {
  if (!initData) return { ok: false, error: 'missing initData' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'missing hash' };

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computed !== hash) return { ok: false, error: 'bad signature' };

  const userRaw = params.get('user');
  if (!userRaw) return { ok: false, error: 'missing user' };
  try {
    return { ok: true, user: JSON.parse(userRaw) as TelegramUser };
  } catch {
    return { ok: false, error: 'bad user payload' };
  }
}

/** Parse the `user` field out of initData WITHOUT verifying the signature. */
function parseInitDataUser(initData: string): TelegramUser | null {
  try {
    const raw = new URLSearchParams(initData).get('user');
    return raw ? (JSON.parse(raw) as TelegramUser) : null;
  } catch {
    return null;
  }
}

/**
 * Authenticate an auth request. `initData` is the Telegram payload; `devUser`
 * is an optional fallback (id + username) accepted only in dev mode.
 *
 * When BOT_TOKEN is set, initData is cryptographically verified. When it is NOT
 * set (dev/test), we trust the initData payload as-is so the Mini App can be
 * tested inside Telegram without putting the bot token on the server. INSECURE —
 * set BOT_TOKEN for any real deployment.
 */
export function authenticate(initData: string | undefined, devUser?: { id: number; username?: string }): AuthResult {
  if (initData) {
    const verified = verifyInitData(initData);
    if (verified.ok) return verified;
    if (ALLOW_DEV_AUTH) {
      const user = parseInitDataUser(initData);
      if (user && Number.isFinite(user.id)) return { ok: true, user };
    }
    return verified;
  }
  if (ALLOW_DEV_AUTH && devUser && Number.isFinite(devUser.id)) {
    return { ok: true, user: { id: devUser.id, username: devUser.username } };
  }
  return { ok: false, error: 'authentication required' };
}

export const isDevAuthAllowed = ALLOW_DEV_AUTH;
