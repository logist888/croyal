/**
 * REST API for account + clan management. Battles/raids run over WebSocket (ws.ts).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express, { type Request, type Response, type NextFunction } from 'express';
import compression from 'compression';
import cors from 'cors';
import {
  validateNickname, validateClanName, warWeekRemainingMs, clanWarTier,
  BP_TRACK, BP_TIERS, BP_XP_PER_TIER, BP_PREMIUM_COST_GEMS, bpTier,
  type Language, type PlayerProfile,
} from '@croyal/shared';
import { authenticate } from './auth';
import { store } from './store';
import { ACTIVE_BATTLE_CONFIG } from './game/active-config';
import { starsEnabled, createStarsInvoiceLink, answerPreCheckoutQuery, handleTelegramUpdate } from './payments';
import { RateLimiter, rateLimit } from './ratelimit';

// --- Anti-abuse rate limits (Этап 4.3), per client IP per 60s. Tunable via env. ---
const RL_GLOBAL_MAX = Number(process.env.RL_GLOBAL_MAX ?? 240); // all /api combined
const RL_AUTH_MAX = Number(process.env.RL_AUTH_MAX ?? 30); // auth + registration (account creation)

/** Which battle core this server runs — lets the client pick the right HUD. */
function battleMode() {
  return { economy: ACTIVE_BATTLE_CONFIG.economy, deployment: ACTIVE_BATTLE_CONFIG.deployment };
}

function publicProfile(p: PlayerProfile) {
  return p; // MVP: return the full profile
}

function clanSummary(c: { id: string; name: string; members: unknown[] }) {
  return { id: c.id, name: c.name, memberCount: c.members.length };
}

interface AuthedRequest extends Request {
  userId?: string;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? store.getSessionUser(token) : undefined;
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.userId = user.id;
  next();
}

export function createApp() {
  const app = express();
  // gzip everything down the wire — the Phaser bundle alone is ~1.6 MB raw.
  app.use(compression());
  app.use(cors());
  app.use(express.json());

  // --- Anti-abuse: rate limiting (Этап 4.3). A global per-IP ceiling on the whole
  //     API, plus a stricter bucket on the account-creating auth routes. The
  //     Telegram webhook is exempt — we must always ack Telegram, and it carries
  //     its own secret-token guard (TELEGRAM_WEBHOOK_SECRET). ---
  const globalLimiter = new RateLimiter({ windowMs: 60_000, max: RL_GLOBAL_MAX });
  const authLimiter = new RateLimiter({ windowMs: 60_000, max: RL_AUTH_MAX });
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/telegram/webhook') { next(); return; }
    rateLimit(globalLimiter)(req, res, next);
  });
  app.post(['/api/auth', '/api/register'], rateLimit(authLimiter));

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, persistence: store.persistent ? 'postgres' : 'memory' }));

  // --- Auth: identify the Telegram user; tell the client whether to register ---
  app.post('/api/auth', (req: Request, res: Response) => {
    const { initData, devUser } = req.body ?? {};
    const auth = authenticate(initData, devUser);
    if (!auth.ok || !auth.user) {
      res.status(401).json({ error: auth.error ?? 'auth failed' });
      return;
    }
    const existing = store.getUserByTelegram(auth.user.id);
    if (existing) {
      store.ensureDaily(existing.id); // roll a new day's quests/streak on login
      store.ensureSeason(existing.id); // roll over the season / bank an end-of-season reward
      const token = store.createSession(existing.id);
      res.json({ registered: true, token, profile: publicProfile(existing), mode: battleMode() });
      return;
    }
    res.json({ registered: false, telegramId: auth.user.id, suggestedNickname: auth.user.username ?? '', mode: battleMode() });
  });

  // --- Registration: nickname is chosen ONCE and is immutable thereafter ---
  app.post('/api/register', (req: Request, res: Response) => {
    const { initData, devUser, nickname, language } = req.body ?? {};
    const auth = authenticate(initData, devUser);
    if (!auth.ok || !auth.user) {
      res.status(401).json({ error: auth.error ?? 'auth failed' });
      return;
    }
    const v = validateNickname(nickname ?? '');
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }
    const lang: Language = language === 'ru' ? 'ru' : 'en';
    try {
      const profile = store.createUser({ telegramId: auth.user.id, nickname, language: lang });
      const token = store.createSession(profile.id);
      res.json({ token, profile: publicProfile(profile), mode: battleMode() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/me', requireAuth, (req: AuthedRequest, res: Response) => {
    store.ensureCards(req.userId!); // backfill any catalog cards missing on old accounts
    store.ensureDaily(req.userId!); // roll a new day's quests/streak on login
    store.ensureSeason(req.userId!); // roll over the season / bank an end-of-season reward
    store.ensureBattlePass(req.userId!); // roll the battle pass to the current season
    const me = store.getUser(req.userId!);
    if (me?.clanId) store.ensureClanWar(me.clanId); // roll over the war / bank a war reward
    const user = store.getUser(req.userId!);
    res.json({ profile: user ? publicProfile(user) : null, mode: battleMode() });
  });

  // --- Daily: claim the login-streak reward ---
  app.post('/api/daily/claim', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const profile = store.claimDailyReward(req.userId!);
      res.json({ profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Daily: claim a completed quest ---
  app.post('/api/daily/quests/:id/claim', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const profile = store.claimQuest(req.userId!, req.params.id);
      res.json({ profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Season: claim the banked end-of-season reward ---
  app.post('/api/season/claim', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const profile = store.claimSeasonReward(req.userId!);
      res.json({ profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Shop: spend gems on gold ---
  app.post('/api/shop/gold', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const profile = store.buyGoldPack(req.userId!, req.body?.packId);
      res.json({ profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Shop config: is the Stars (real-money) channel live? ---
  app.get('/api/shop/config', requireAuth, (_req: AuthedRequest, res: Response) => {
    res.json({ starsEnabled: starsEnabled() });
  });

  // --- Shop: buy gems with Telegram Stars (create an invoice link to openInvoice) ---
  app.post('/api/shop/stars/invoice', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!starsEnabled()) {
      res.status(503).json({ error: 'Stars payments are not available yet' });
      return;
    }
    try {
      const link = await createStarsInvoiceLink(req.userId!, req.body?.packId);
      res.json({ link });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Telegram bot webhook: pre-checkout + successful payment (NO auth — Telegram calls it) ---
  app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.header('x-telegram-bot-api-secret-token') !== secret) {
      res.sendStatus(401);
      return;
    }
    try {
      await handleTelegramUpdate(req.body, {
        answerPreCheckout: answerPreCheckoutQuery,
        credit: async (chargeId, userId, gems) => {
          const isNew = await store.claimPayment(chargeId, userId, gems);
          if (isNew) store.grantGems(userId, gems); // credit ONCE, ever
          return isNew;
        },
      });
    } catch (e) {
      console.error('[telegram-webhook]', (e as Error).message);
    }
    res.sendStatus(200); // always ack so Telegram doesn't hammer retries
  });

  // --- Battle Pass ---
  app.get('/api/battlepass', requireAuth, (req: AuthedRequest, res: Response) => {
    const bp = store.ensureBattlePass(req.userId!);
    res.json({
      state: bp,
      tier: bp ? bpTier(bp.xp) : 0,
      track: BP_TRACK,
      tiers: BP_TIERS,
      xpPerTier: BP_XP_PER_TIER,
      premiumCost: BP_PREMIUM_COST_GEMS,
    });
  });
  app.post('/api/battlepass/premium', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const profile = store.buyBattlePassPremium(req.userId!);
      res.json({ profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });
  app.post('/api/battlepass/claim', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const { profile, gold, gems } = store.claimAllBattlePass(req.userId!);
      res.json({ profile: publicProfile(profile), gold, gems });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Clan wars ---
  app.get('/api/clan/war', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = store.getUser(req.userId!);
    const summary = store.clanWarSummary(req.userId!);
    res.json({
      inClan: !!user?.clanId,
      remainingMs: warWeekRemainingMs(Date.now()),
      clanScore: summary?.score ?? 0,
      yourContribution: summary?.yourContribution ?? 0,
      tier: clanWarTier(summary?.score ?? 0),
      reward: user?.warReward ?? null,
      leaderboard: store.topWarClans(50),
    });
  });
  app.post('/api/clan/war/claim', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const profile = store.claimWarReward(req.userId!);
      res.json({ profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Leaderboards ---
  app.get('/api/leaderboard/players', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ top: store.topPlayers(50), you: store.playerRank(req.userId!) });
  });
  app.get('/api/leaderboard/clans', requireAuth, (_req: AuthedRequest, res: Response) => {
    res.json({ top: store.topClans(50) });
  });

  // --- Battle trio: pick the 3 active cards (cooldown model) ---
  app.post('/api/trio', requireAuth, (req: AuthedRequest, res: Response) => {
    const { trio } = req.body ?? {};
    try {
      const profile = store.setTrio(req.userId!, trio);
      res.json({ profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Onboarding: open the next starter box (reveals a starter character) ---
  app.post('/api/starter/open', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const reveal = store.openStarterBox(req.userId!);
      const profile = store.getUser(req.userId!)!;
      res.json({ ...reveal, profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Cards: upgrade ---
  app.post('/api/cards/:id/upgrade', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const profile = store.upgradeCard(req.userId!, req.params.id);
      res.json({ profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Chests: start the unlock timer ---
  app.post('/api/chests/:id/unlock', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const profile = store.startChestUnlock(req.userId!, req.params.id);
      res.json({ profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Chests: open (free when ready, or `?gems=1` to skip the timer) ---
  app.post('/api/chests/:id/open', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const withGems = req.body?.withGems === true || req.query.gems === '1';
      const { rewards, profile } = store.openChest(req.userId!, req.params.id, { withGems });
      res.json({ rewards, profile: publicProfile(profile) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Clans ---
  app.get('/api/clans', requireAuth, (_req: AuthedRequest, res: Response) => {
    res.json({ clans: store.listClans().map(clanSummary) });
  });

  app.get('/api/clans/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const clan = store.getClan(req.params.id);
    if (!clan) {
      res.status(404).json({ error: 'clan not found' });
      return;
    }
    res.json({ clan });
  });

  app.post('/api/clans', requireAuth, (req: AuthedRequest, res: Response) => {
    const { name } = req.body ?? {};
    const v = validateClanName(name ?? '');
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }
    try {
      const clan = store.createClan(req.userId!, name);
      res.json({ clan });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/clans/:id/join', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const clan = store.joinClan(req.userId!, req.params.id);
      res.json({ clan });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/clans/leave', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      store.leaveClan(req.userId!);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/clans/:id/kick', requireAuth, (req: AuthedRequest, res: Response) => {
    const { targetUserId } = req.body ?? {};
    try {
      const clan = store.kickMember(req.userId!, targetUserId);
      res.json({ clan });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Serve the built client (single origin: client + API + WS on one URL) ---
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (existsSync(clientDist)) {
    // Vite emits content-hashed filenames under /assets/*.js|css, so those are
    // safe to cache forever. index.html and the art manifest must never be
    // cached or a deploy strands clients on a stale build.
    app.use(express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        const rel = path.relative(clientDist, filePath);
        const hashed = /^assets[\\/].+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(rel);
        if (hashed) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (rel === 'index.html' || rel.endsWith('manifest.json')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=86400'); // art: 1 day
      },
    }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(clientDist, 'index.html'));
      } else {
        next();
      }
    });
  }

  return app;
}
