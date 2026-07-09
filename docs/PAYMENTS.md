# Telegram Stars payments (gems)

Players buy **gems** with **Telegram Stars** (currency `XTR`). The flow:

1. Client asks the server for an invoice → `POST /api/shop/stars/invoice { packId }`.
2. Server builds a Stars invoice with the Bot API (`createInvoiceLink`) and returns a link.
3. Client opens it with `Telegram.WebApp.openInvoice(link, cb)`.
4. Telegram calls **our bot webhook** (`POST /api/telegram/webhook`):
   - `pre_checkout_query` → we approve it (`answerPreCheckoutQuery ok=true`).
   - `successful_payment` → we credit gems **once** (idempotent by the Telegram
     charge id; a `payments` row guards against webhook retries double-crediting).

Packs & prices live in `shared/src/shop.ts` (`GEM_PACKS`) — tune the `gems`/`stars`
numbers there; the server prices from them.

## Safety gate

Nothing can be charged until **you** turn it on. The Stars section is hidden in
the shop and the invoice endpoint returns `503` unless:

```
STARS_ENABLED=1        # explicit opt-in (default off)
BOT_TOKEN=<bot token>  # already set for auth
```

So the safe order is: wire the webhook → test → only then set `STARS_ENABLED=1`.

## One-time setup (you)

1. **Set the env vars** on the Render web service:
   - `BOT_TOKEN` — the bot token (already set for auth).
   - `STARS_ENABLED=1` — enable the channel (do this **last**, after testing).
   - `TELEGRAM_WEBHOOK_SECRET` — optional but recommended; the webhook rejects
     calls whose `X-Telegram-Bot-Api-Secret-Token` header ≠ this. **Allowed
     characters: `A–Z a–z 0–9 _ -` only** (1–256 chars — no `<>`, spaces, etc.).
     Generate one with `openssl rand -hex 24`. The value here **must equal** the
     `secret_token` you pass to `setWebhook` below. Leave BOTH unset to skip the
     check entirely.

2. **Register the webhook** with Telegram — substitute your real `<BOT_TOKEN>`
   and the secret from step 1 (run once):

   ```sh
   curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
     -d "url=https://croyal.onrender.com/api/telegram/webhook" \
     -d "secret_token=REPLACE_WITH_YOUR_SECRET" \
     -d 'allowed_updates=["message","pre_checkout_query"]'
   ```

   Expect `{"ok":true,...}`. `successful_payment` arrives inside a `message`
   update, so both `message` and `pre_checkout_query` must be allowed. Set the
   `TELEGRAM_WEBHOOK_SECRET` env var in Render **first** (and let it redeploy) so
   the value matches, otherwise the webhook will answer `401`. To skip the secret
   check, drop the `secret_token` line **and** leave the env var unset.

3. **Test** with the cheapest pack. Confirm gems land in your balance and that a
   second (retry) webhook for the same charge does **not** double-credit (a
   `payments` row exists per charge).

4. Flip `STARS_ENABLED=1` and redeploy. Done.

## Notes

- The bot token is read from the env and **never logged or committed**.
- Refunds / disputes are handled in Telegram; this server only credits on
  `successful_payment`. A `payments` table keeps an audit trail (charge id → user,
  gems, timestamp).
- `store.grantGems` is the single crediting choke point (also reusable for
  promo gems).
