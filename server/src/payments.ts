/**
 * Telegram Stars payments (Этап 3 monetization). Users buy gems with Stars
 * (currency XTR). The server creates an invoice link (Bot API `createInvoiceLink`),
 * the client opens it via `Telegram.WebApp.openInvoice`, and the bot webhook here
 * confirms the payment: answer the pre-checkout query, then credit gems ONCE
 * (idempotent by the Telegram charge id).
 *
 * Everything is gated by STARS_ENABLED so nothing can be charged until the bot
 * webhook is wired and tested. The BOT_TOKEN is read from the env — never logged.
 */
import { gemPack } from '@croyal/shared';

/** Payments are live only when explicitly enabled AND a bot token is present. */
export function starsEnabled(): boolean {
  return process.env.STARS_ENABLED === '1' && !!process.env.BOT_TOKEN;
}

function botApiBase(): string {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('payments not configured');
  return `https://api.telegram.org/bot${token}`;
}

/** The (small, non-secret) data baked into an invoice so the webhook can credit. */
export interface PaymentPayload {
  userId: string;
  packId: string;
}

export function parsePaymentPayload(raw: unknown): PaymentPayload | null {
  if (typeof raw !== 'string') return null;
  try {
    const p = JSON.parse(raw) as Partial<PaymentPayload>;
    if (typeof p.userId === 'string' && typeof p.packId === 'string') {
      return { userId: p.userId, packId: p.packId };
    }
  } catch { /* not our payload */ }
  return null;
}

/** Create a Stars invoice link for a gem pack. Throws if payments aren't configured. */
export async function createStarsInvoiceLink(userId: string, packId: string): Promise<string> {
  const pack = gemPack(packId);
  if (!pack) throw new Error('Unknown pack');
  const payload: PaymentPayload = { userId, packId };
  const res = await fetch(`${botApiBase()}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: `${pack.gems} gems`,
      description: `${pack.gems} gems for Tower Clash`,
      payload: JSON.stringify(payload),
      currency: 'XTR',
      prices: [{ label: `${pack.gems} gems`, amount: pack.stars }],
    }),
  });
  const data = (await res.json()) as { ok: boolean; result?: string; description?: string };
  if (!data.ok || !data.result) throw new Error(data.description ?? 'createInvoiceLink failed');
  return data.result;
}

/** Answer a pre-checkout query (must happen within ~10s or the payment fails). */
export async function answerPreCheckoutQuery(queryId: string, ok: boolean, errorMessage?: string): Promise<void> {
  await fetch(`${botApiBase()}/answerPreCheckoutQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pre_checkout_query_id: queryId,
      ok,
      ...(ok ? {} : { error_message: errorMessage ?? 'This item is unavailable' }),
    }),
  });
}

export interface UpdateDeps {
  answerPreCheckout(queryId: string, ok: boolean, errorMessage?: string): Promise<void>;
  /** Credit gems for a charge; returns true if newly credited (false = duplicate). */
  credit(chargeId: string, userId: string, gems: number): Promise<boolean>;
}

/**
 * Process one Telegram bot update: approve pre-checkout for a known pack, and
 * credit gems on a successful payment (idempotent via `credit`). External input —
 * everything is validated; unknown shapes are ignored.
 */
export async function handleTelegramUpdate(update: unknown, deps: UpdateDeps): Promise<void> {
  const u = update as {
    pre_checkout_query?: { id: string; invoice_payload: string };
    message?: { successful_payment?: { invoice_payload: string; telegram_payment_charge_id: string } };
  };

  if (u.pre_checkout_query) {
    const payload = parsePaymentPayload(u.pre_checkout_query.invoice_payload);
    const ok = !!payload && !!gemPack(payload.packId);
    await deps.answerPreCheckout(u.pre_checkout_query.id, ok, ok ? undefined : 'This item is no longer available');
    return;
  }

  const sp = u.message?.successful_payment;
  if (sp) {
    const payload = parsePaymentPayload(sp.invoice_payload);
    if (!payload) return;
    const pack = gemPack(payload.packId);
    if (!pack) return;
    await deps.credit(sp.telegram_payment_charge_id, payload.userId, pack.gems);
  }
}
