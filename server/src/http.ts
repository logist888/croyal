/**
 * REST API for account + clan management. Battles/raids run over WebSocket (ws.ts).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  validateNickname, validateClanName, type Language, type PlayerProfile,
} from '@croyal/shared';
import { authenticate } from './auth';
import { store } from './store';
import { ACTIVE_BATTLE_CONFIG } from './game/active-config';

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
  app.use(cors());
  app.use(express.json());

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
    store.ensureDaily(req.userId!); // roll a new day's quests/streak on login
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
    app.use(express.static(clientDist));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(clientDist, 'index.html'));
      } else {
        next();
      }
    });
  }

  return app;
}
