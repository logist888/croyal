# Players, Nicknames & Profile

## Nicknames — English-only and IMMUTABLE
- Chosen **once at registration** (the nickname screen, alongside language choice)
  and **never changeable** afterward.
- Allowed: English letters `a–z A–Z`, digits `0–9`, and `_`. Length **3–16**.
- **Forbidden:** emoji, spaces, punctuation, and any non-ASCII / non-English
  characters (e.g. Cyrillic, CJK).
- Rule lives once in `shared/src/validation.ts`:
  `NICKNAME_REGEX = /^[A-Za-z0-9_]{3,16}$/` — enforced on **both** client and server.

### Permanent-choice warning
The registration screen shows a prominent warning that the nickname is permanent
("Ник выбирается НАВСЕГДА — изменить его в дальнейшем будет нельзя") and requires an
explicit confirmation checkbox before the account can be created.

### Immutability enforcement
- There is **no** nickname-change REST route.
- `Store.updateUser` rejects any attempt to change `nickname` (single choke point):
  the field is forced back to its original value and a change attempt throws.
- Covered by tests in `server/src/__tests__/store.test.ts`.

> Clan names are the opposite: any language is allowed. See [CLANS.md](CLANS.md).

## Profile (`PlayerProfile`)
| Field | Meaning |
| --- | --- |
| `id` | internal UUID |
| `telegramId` | Telegram user id (identity) |
| `nickname` | immutable, English-only |
| `language` | `en` / `ru` (chosen at registration) |
| `trophies` | ladder rating (floored at 0) |
| `wins` / `losses` | match record |
| `gold` / `gems` | currencies |
| `deck` | 8 card ids |
| `clanId` | current clan or `null` |

## Registration flow
1. `POST /api/auth` with Telegram `initData` (or a dev user in browser) identifies
   the player. If unknown → client shows the registration screen.
2. Player enters a valid nickname, picks a language, confirms the permanent warning.
3. `POST /api/register` validates and creates the immutable profile, returns a
   session token.
