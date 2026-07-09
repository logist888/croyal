import { describe, it, expect } from 'vitest';
import { GEM_PACKS, gemPack } from '@croyal/shared';
import { parsePaymentPayload, handleTelegramUpdate } from '../payments';
import { Store } from '../store';

describe('gem packs (pure)', () => {
  it('every pack has a positive gem count and Stars price; lookup works', () => {
    expect(GEM_PACKS.length).toBeGreaterThan(0);
    for (const p of GEM_PACKS) {
      expect(p.gems).toBeGreaterThan(0);
      expect(p.stars).toBeGreaterThan(0);
      expect(gemPack(p.id)).toEqual(p);
    }
    expect(gemPack('nope')).toBeUndefined();
  });
});

describe('payment payload parsing', () => {
  it('accepts a valid payload and rejects junk', () => {
    expect(parsePaymentPayload(JSON.stringify({ userId: 'u1', packId: 'gems_s' }))).toEqual({ userId: 'u1', packId: 'gems_s' });
    expect(parsePaymentPayload('not json')).toBeNull();
    expect(parsePaymentPayload(JSON.stringify({ userId: 1 }))).toBeNull();
    expect(parsePaymentPayload(42)).toBeNull();
  });
});

describe('handleTelegramUpdate', () => {
  const pack = GEM_PACKS[0];

  it('approves pre-checkout for a known pack, rejects an unknown one', async () => {
    const calls: Array<[string, boolean]> = [];
    const deps = {
      answerPreCheckout: async (id: string, ok: boolean) => { calls.push([id, ok]); },
      credit: async () => true,
    };
    await handleTelegramUpdate({ pre_checkout_query: { id: 'q1', invoice_payload: JSON.stringify({ userId: 'u1', packId: pack.id }) } }, deps);
    await handleTelegramUpdate({ pre_checkout_query: { id: 'q2', invoice_payload: JSON.stringify({ userId: 'u1', packId: 'bogus' }) } }, deps);
    expect(calls).toEqual([['q1', true], ['q2', false]]);
  });

  it('credits gems on a successful payment (once per charge)', async () => {
    const credited: Array<[string, string, number]> = [];
    const seen = new Set<string>();
    const deps = {
      answerPreCheckout: async () => {},
      credit: async (chargeId: string, userId: string, gems: number) => {
        if (seen.has(chargeId)) return false;
        seen.add(chargeId);
        credited.push([chargeId, userId, gems]);
        return true;
      },
    };
    const update = { message: { successful_payment: { invoice_payload: JSON.stringify({ userId: 'u9', packId: pack.id }), telegram_payment_charge_id: 'ch_1' } } };
    await handleTelegramUpdate(update, deps);
    await handleTelegramUpdate(update, deps); // Telegram retry — must not double-credit
    expect(credited).toEqual([['ch_1', 'u9', pack.gems]]);
  });

  it('ignores a payment with an unparseable payload', async () => {
    let credited = false;
    await handleTelegramUpdate(
      { message: { successful_payment: { invoice_payload: 'garbage', telegram_payment_charge_id: 'ch_x' } } },
      { answerPreCheckout: async () => {}, credit: async () => { credited = true; return true; } },
    );
    expect(credited).toBe(false);
  });
});

describe('store.claimPayment idempotency (in-memory)', () => {
  it('returns true once per charge, then false', async () => {
    const store = new Store();
    const u = store.createUser({ telegramId: 6301, nickname: 'Pay' + Math.floor(Math.random() * 1e6), language: 'en' });
    expect(await store.claimPayment('charge_a', u.id, 80)).toBe(true);
    expect(await store.claimPayment('charge_a', u.id, 80)).toBe(false); // duplicate
    expect(await store.claimPayment('charge_b', u.id, 80)).toBe(true);
  });
});
