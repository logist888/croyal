import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { RateLimiter, clientIp } from '../ratelimit';

describe('RateLimiter (fixed window)', () => {
  it('allows up to max, then blocks within the window', () => {
    const rl = new RateLimiter({ windowMs: 1000, max: 3 });
    const t = 10_000;
    expect(rl.check('ip', t).ok).toBe(true); // 1
    expect(rl.check('ip', t).ok).toBe(true); // 2
    expect(rl.check('ip', t).ok).toBe(true); // 3
    const blocked = rl.check('ip', t); // 4
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(1000);
  });

  it('reports remaining as it counts down', () => {
    const rl = new RateLimiter({ windowMs: 1000, max: 2 });
    expect(rl.check('ip', 0).remaining).toBe(1);
    expect(rl.check('ip', 0).remaining).toBe(0);
  });

  it('resets after the window elapses', () => {
    const rl = new RateLimiter({ windowMs: 1000, max: 1 });
    expect(rl.check('ip', 0).ok).toBe(true);
    expect(rl.check('ip', 500).ok).toBe(false); // same window
    expect(rl.check('ip', 1000).ok).toBe(true); // new window
    expect(rl.check('ip', 1000).ok).toBe(false);
  });

  it('tracks keys independently', () => {
    const rl = new RateLimiter({ windowMs: 1000, max: 1 });
    expect(rl.check('a', 0).ok).toBe(true);
    expect(rl.check('b', 0).ok).toBe(true); // different key, own budget
    expect(rl.check('a', 0).ok).toBe(false);
  });

  it('sweeps expired keys once the map grows past maxKeys', () => {
    const rl = new RateLimiter({ windowMs: 1000, max: 100 }, 2);
    rl.check('a', 0);
    rl.check('b', 0);
    expect(rl.size).toBe(2);
    // A new key at t=2000: both a,b windows have expired and get swept first.
    rl.check('c', 2000);
    expect(rl.size).toBe(1);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, unknown>, remote?: string) =>
    ({ headers, socket: { remoteAddress: remote } } as unknown as Request);

  it('takes the first hop of X-Forwarded-For', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  });

  it('falls back to the socket address when no XFF', () => {
    expect(clientIp(req({}, '198.51.100.9'))).toBe('198.51.100.9');
  });

  it('returns "unknown" when nothing is available', () => {
    expect(clientIp(req({}))).toBe('unknown');
  });
});
