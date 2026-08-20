import { describe, it, expect } from 'vitest';
import { validateNickname, validateClanName, nicknameContentError, MAX_CLAN_MEMBERS } from '@croyal/shared';

describe('nickname rules (English-only, no emoji)', () => {
  it('accepts valid English nicknames', () => {
    expect(validateNickname('Knight_99').ok).toBe(true);
    expect(validateNickname('abc').ok).toBe(true);
  });
  it('rejects too short / too long', () => {
    expect(validateNickname('ab').ok).toBe(false);
    expect(validateNickname('a'.repeat(17)).ok).toBe(false);
  });
  it('rejects emoji', () => {
    expect(validateNickname('cool😎guy').ok).toBe(false);
  });
  it('rejects non-English (Cyrillic) characters', () => {
    expect(validateNickname('Игрок').ok).toBe(false);
  });
  it('rejects spaces and punctuation', () => {
    expect(validateNickname('john doe').ok).toBe(false);
    expect(validateNickname('john!').ok).toBe(false);
  });
});

describe('nickname content moderation (Этап 4.3 anti-abuse)', () => {
  it('rejects reserved names (case-insensitive, whole name)', () => {
    expect(validateNickname('admin').ok).toBe(false);
    expect(validateNickname('Admin').ok).toBe(false);
    expect(validateNickname('SUPPORT').ok).toBe(false);
    // A reserved word as a substring of a longer legit name is fine.
    expect(validateNickname('adminionN').ok).toBe(true);
    expect(nicknameContentError('modern')).toBeNull();
  });

  it('rejects obvious profanity anywhere in the name', () => {
    expect(validateNickname('xXfuckXx').ok).toBe(false);
    expect(validateNickname('a_shit_b').ok).toBe(false);
    expect(nicknameContentError('cleanName')).toBeNull();
  });

  it('still accepts ordinary nicknames', () => {
    expect(validateNickname('Knight_99').ok).toBe(true);
    expect(validateNickname('DragonKing').ok).toBe(true);
  });
});

describe('clan name rules (any language allowed)', () => {
  it('accepts any language, including emoji', () => {
    expect(validateClanName('Война Кланов').ok).toBe(true);
    expect(validateClanName('龙之战队').ok).toBe(true);
    expect(validateClanName('Dragons 🐉').ok).toBe(true);
  });
  it('rejects empty / whitespace-only', () => {
    expect(validateClanName('   ').ok).toBe(false);
    expect(validateClanName('').ok).toBe(false);
  });
  it('rejects names that are too long', () => {
    expect(validateClanName('x'.repeat(25)).ok).toBe(false);
  });
});

describe('clan capacity constant', () => {
  it('is 20', () => {
    expect(MAX_CLAN_MEMBERS).toBe(20);
  });
});
