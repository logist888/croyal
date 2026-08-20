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

/**
 * Reserved nicknames (matched on the WHOLE name, case-insensitively) — block
 * impersonation of staff / the system. A launch starter set; extend freely.
 */
export const RESERVED_NICKNAMES = new Set<string>([
  'admin', 'administrator', 'root', 'system', 'systembot', 'moderator',
  'support', 'staff', 'official', 'server', 'bot', 'null', 'undefined',
  'supercell', 'towerclash',
]);

/**
 * Offensive substrings rejected ANYWHERE in a nickname (case-insensitive).
 * A deliberately small, unambiguous starter list — tune it for your audience.
 * Kept as substrings so obvious variants ("xXfuckXx") are caught too.
 */
export const NICKNAME_BLOCKLIST = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot',
  'retard', 'whore', 'slut', 'asshole', 'rape', 'nazi',
];

/**
 * Content moderation layered on top of the character/length rules: reject
 * reserved names and obvious profanity. Returns an error string or null.
 */
export function nicknameContentError(name: string): string | null {
  const lower = name.toLowerCase();
  if (RESERVED_NICKNAMES.has(lower)) {
    return 'This nickname is reserved. Please choose another.';
  }
  for (const bad of NICKNAME_BLOCKLIST) {
    if (lower.includes(bad)) return 'This nickname contains inappropriate language.';
  }
  return null;
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
  const content = nicknameContentError(name);
  if (content) return { ok: false, error: content };
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
