/**
 * In-memory rate limiting (docs/ROADMAP.ru.md — Этап 4.3, anti-abuse).
 *
 * Fixed-window counters keyed by client IP — cheap, synchronous, and good enough
 * for a single-process launch. The game is mostly WebSocket; the REST surface is
 * menu actions and auth, so a per-IP request ceiling per minute stops scripted
 * hammering (account-creation spam, brute polling) without touching normal play.
 *
 * When the game scales to multiple worker processes this state moves to Redis
 * (see ROADMAP Этап 4.4). The limiter is isolated here so that swap stays local.
 */
import type { Request, Response, NextFunction } from 'express';

export interface RateRule {
  windowMs: number;
  max: number; // max requests per window per key
}

export interface RateResult {
  ok: boolean;
  remaining: number; // requests left in the current window (0 once blocked)
  retryAfterMs: number; // ms until the window resets (0 when allowed)
}

/**
 * Fixed-window request counter. O(1) per check; each key's window resets lazily
 * on the first request after it expires. Memory is bounded: once the tracked-key
 * map grows past `maxKeys`, expired windows are swept before a new key is added.
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private rule: RateRule, private maxKeys = 50_000) {}

  check(key: string, now: number = Date.now()): RateResult {
    let b = this.buckets.get(key);
    if (!b || now >= b.resetAt) {
      // Bound memory: only sweep when adding a genuinely new key into a large map.
      if (!b && this.buckets.size >= this.maxKeys) this.sweep(now);
      b = { count: 0, resetAt: now + this.rule.windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    const ok = b.count <= this.rule.max;
    return {
      ok,
      remaining: Math.max(0, this.rule.max - b.count),
      retryAfterMs: ok ? 0 : b.resetAt - now,
    };
  }

  /** Drop expired windows (called only when the map grows past maxKeys). */
  private sweep(now: number): void {
    for (const [k, v] of this.buckets) if (now >= v.resetAt) this.buckets.delete(k);
  }

  /** Number of keys currently tracked (test/introspection helper). */
  get size(): number {
    return this.buckets.size;
  }
}

/**
 * Best-effort client IP. Behind a proxy (Render, etc.) the real client is the
 * first hop of X-Forwarded-For; fall back to the socket address for direct
 * connections. This is used only for coarse rate-limiting, not authorization.
 */
export function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (typeof raw === 'string' && raw.length > 0) {
    const first = raw.split(',')[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/** Express middleware enforcing a limiter, keyed by client IP. */
export function rateLimit(limiter: RateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const r = limiter.check(clientIp(req));
    if (!r.ok) {
      res.setHeader('Retry-After', String(Math.ceil(r.retryAfterMs / 1000)));
      res.status(429).json({ error: 'Too many requests. Please slow down.' });
      return;
    }
    next();
  };
}
