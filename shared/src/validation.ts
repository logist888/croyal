/**
 * Validation rules shared by client and server.
 *
 * Nicknames: English letters / digits / underscore only, 3-16 chars, NO emoji,
 * NO non-ASCII. Chosen ONCE at registration and IMMUTABLE thereafter.
 *
 * Clan names: ANY language / any Unicode is allowed (only length + emptiness are limited).
 */

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;
export const NICKNAME_REGEX = /^[A-Za-z0-9_]{3,16}$/;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateNickname(raw: string): ValidationResult {
  const name = (raw ?? '').trim();
  if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) {
    return { ok: false, error: `Nickname must be ${NICKNAME_MIN}-${NICKNAME_MAX} characters.` };
  }
  if (!NICKNAME_REGEX.test(name)) {
    return {
      ok: false,
      error: 'Nickname may contain only English letters (a-z, A-Z), digits and "_". No emoji or other languages.',
    };
  }
  return { ok: true };
}

export const CLAN_NAME_MIN = 1;
export const CLAN_NAME_MAX = 24;
export const MAX_CLAN_MEMBERS = 20;

export function validateClanName(raw: string): ValidationResult {
  // Any language / any Unicode is allowed; we only guard length and emptiness.
  const name = (raw ?? '').trim();
  if (name.length < CLAN_NAME_MIN) {
    return { ok: false, error: 'Clan name cannot be empty.' };
  }
  // Count by code points so multi-byte scripts (中文, кириллица, emoji) are counted fairly.
  const length = [...name].length;
  if (length > CLAN_NAME_MAX) {
    return { ok: false, error: `Clan name must be at most ${CLAN_NAME_MAX} characters.` };
  }
  return { ok: true };
}
