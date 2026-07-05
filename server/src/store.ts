/**
 * In-memory data store, mirrored write-through to PostgreSQL when DATABASE_URL is
 * set (see db.ts / docs/DATABASE.md). The in-memory maps stay the synchronous
 * runtime source of truth; the DB provides durability across restarts.
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_DECK, DEFAULT_TRIO, TRIO_SIZE, MAX_CLAN_MEMBERS, ALL_CARD_IDS, MAX_CARD_LEVEL,
  STARTER_BOX_COUNT, STARTER_POOL, getCard, isCardUnlocked,
  cardsToUpgrade, goldToUpgrade, xpForUpgrade,
  validateNickname, validateClanName,
  CHEST_SLOTS, CHEST_DEFS, chestState, gemsToSkip, hasUnlockingChest,
  rollChestRewards, unlockedCards,
  type PlayerProfile, type Clan, type ClanMember, type Language, type CardState,
  type ChestRarity, type BattleRewards,
} from '@croyal/shared';
import { Db } from './db';

export interface CreateUserInput {
  telegramId: number;
  nickname: string;
  language: Language;
}

export class Store {
  private users = new Map<string, PlayerProfile>();
  private byTelegram = new Map<number, string>();
  private byNickname = new Map<string, string>(); // nickname -> userId (uniqueness)
  private sessions = new Map<string, string>(); // token -> userId
  private clans = new Map<string, Clan>();
  private db: Db | null = null;

  /** Connect to Postgres (if DATABASE_URL is set) and hydrate from it. */
  async init(): Promise<void> {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.log('[store] no DATABASE_URL — running in-memory only (data resets on restart).');
      return;
    }
    this.db = new Db(url);
    await this.db.init();
    const data = await this.db.loadAll();
    for (const u of data.users) {
      this.users.set(u.id, u);
      this.byTelegram.set(u.telegramId, u.id);
      this.byNickname.set(u.nickname, u.id);
    }
    for (const c of data.clans) this.clans.set(c.id, c);
    for (const [token, userId] of data.sessions) this.sessions.set(token, userId);
    console.log(`[store] Postgres connected — loaded ${data.users.length} users, ${data.clans.length} clans.`);
  }

  /** True once Postgres is connected (DATABASE_URL set) — surfaced via /api/health. */
  get persistent(): boolean {
    return this.db !== null;
  }

  // --- Users ---
  getUser(id: string): PlayerProfile | undefined {
    return this.users.get(id);
  }

  getUserByTelegram(telegramId: number): PlayerProfile | undefined {
    const id = this.byTelegram.get(telegramId);
    return id ? this.users.get(id) : undefined;
  }

  /** Register a new player. Nickname is validated and then IMMUTABLE forever. */
  createUser(input: CreateUserInput): PlayerProfile {
    const v = validateNickname(input.nickname);
    if (!v.ok) throw new Error(v.error);
    if (this.byTelegram.has(input.telegramId)) {
      throw new Error('User already registered');
    }
    // Enforce nickname uniqueness in memory too — the DB UNIQUE constraint
    // alone would only make the fire-and-forget write-through fail silently,
    // creating an account that vanishes on restart.
    if (this.byNickname.has(input.nickname.trim())) {
      throw new Error('Nickname is already taken');
    }
    const id = randomUUID();
    const cards: Record<string, CardState> = {};
    for (const cardId of ALL_CARD_IDS) cards[cardId] = { level: 1, count: 0 };
    const profile: PlayerProfile = {
      id,
      telegramId: input.telegramId,
      nickname: input.nickname.trim(),
      language: input.language,
      trophies: 0,
      wins: 0,
      losses: 0,
      gold: 100,
      gems: 0,
      xp: 0,
      deck: [...DEFAULT_DECK],
      trio: [...DEFAULT_TRIO],
      starterBoxesOpened: 0,
      cards,
      chests: [],
      clanId: null,
      createdAt: Date.now(),
    };
    this.users.set(id, profile);
    this.byTelegram.set(input.telegramId, id);
    this.byNickname.set(profile.nickname, id);
    this.db?.upsertUser(profile);
    return profile;
  }

  /**
   * Update mutable fields only. The nickname is IMMUTABLE — any attempt to change
   * it is rejected at this single choke point (and there is no API route for it).
   */
  updateUser(id: string, patch: Partial<PlayerProfile>): PlayerProfile {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    if (patch.nickname !== undefined && patch.nickname !== user.nickname) {
      throw new Error('Nickname is immutable and cannot be changed');
    }
    Object.assign(user, patch, { nickname: user.nickname, id: user.id, telegramId: user.telegramId });
    this.db?.upsertUser(user);
    return user;
  }

  /** Upgrade one card a level: spends duplicate cards + gold, grants account XP. */
  upgradeCard(userId: string, cardId: string): PlayerProfile {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    const cs = user.cards[cardId];
    if (!cs) throw new Error('Card not owned');
    if (cs.level >= MAX_CARD_LEVEL) throw new Error('Card is already at max level');
    const needCards = cardsToUpgrade(cs.level);
    const needGold = goldToUpgrade(cs.level);
    if (cs.count < needCards) throw new Error('Not enough cards');
    if (user.gold < needGold) throw new Error('Not enough gold');
    cs.count -= needCards;
    user.gold -= needGold;
    cs.level += 1;
    user.xp += xpForUpgrade(cs.level);
    this.db?.upsertUser(user);
    return user;
  }

  /**
   * Open the next starter box (onboarding). Deterministic: box N always
   * reveals STARTER_POOL[N]. Purely presentational — grants no duplicates,
   * so the upgrade economy is untouched (GDD decision).
   */
  openStarterBox(userId: string): { cardId: string; opened: number; total: number } {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    if (user.starterBoxesOpened >= STARTER_BOX_COUNT) throw new Error('All starter boxes already opened');
    const cardId = STARTER_POOL[Math.min(user.starterBoxesOpened, STARTER_POOL.length - 1)];
    user.starterBoxesOpened += 1;
    this.db?.upsertUser(user);
    return { cardId, opened: user.starterBoxesOpened, total: STARTER_BOX_COUNT };
  }

  /** Set the active battle trio: exactly TRIO_SIZE distinct, owned cards. */
  setTrio(userId: string, trio: string[]): PlayerProfile {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    if (!Array.isArray(trio) || trio.length !== TRIO_SIZE) {
      throw new Error(`Trio must contain exactly ${TRIO_SIZE} cards`);
    }
    if (new Set(trio).size !== trio.length) throw new Error('Trio cards must be unique');
    for (const id of trio) {
      // hasOwnProperty + catalog check: a plain `user.cards[id]` truthiness
      // test would accept Object.prototype keys like "constructor".
      if (typeof id !== 'string' || !getCard(id) || !Object.prototype.hasOwnProperty.call(user.cards, id)) {
        throw new Error(`Card not owned: ${String(id)}`);
      }
      // League gate on SET only — a trophy drop never breaks an existing trio.
      if (!isCardUnlocked(id, user.trophies)) {
        throw new Error(`Card locked: ${id}`);
      }
    }
    user.trio = [...trio];
    this.db?.upsertUser(user);
    return user;
  }

  /** Add duplicate cards to a user's inventory (rewards). Ignores unknown ids. */
  awardCards(userId: string, drops: Record<string, number>): void {
    const user = this.users.get(userId);
    if (!user) return;
    for (const [cardId, n] of Object.entries(drops)) {
      const cs = user.cards[cardId];
      if (cs) cs.count += n;
    }
    this.db?.upsertUser(user);
  }

  // --- Battle chests (retention loop, see shared/chests.ts) ---

  /**
   * Drop a chest into the first free slot (won matches). Returns the rarity if
   * placed, or null when all slots are full (the chest is forfeited — the CR
   * "chests can be full" pressure to open them).
   */
  awardChest(userId: string, rarity: ChestRarity): ChestRarity | null {
    const user = this.users.get(userId);
    if (!user) return null;
    if (user.chests.length >= CHEST_SLOTS) return null;
    user.chests.push({ id: randomUUID(), rarity, unlockAt: null });
    this.db?.upsertUser(user);
    return rarity;
  }

  /** Start a chest's unlock timer. Only ONE chest may unlock at a time. */
  startChestUnlock(userId: string, chestId: string, now = Date.now()): PlayerProfile {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    const chest = user.chests.find((c) => c.id === chestId);
    if (!chest) throw new Error('Chest not found');
    if (chestState(chest, now) !== 'idle') throw new Error('Chest already unlocking');
    if (hasUnlockingChest(user.chests, now)) throw new Error('Another chest is already unlocking');
    chest.unlockAt = now + CHEST_DEFS[chest.rarity].unlockMinutes * 60000;
    this.db?.upsertUser(user);
    return user;
  }

  /**
   * Open a chest: free when the timer has elapsed, or instantly for gems.
   * Grants gold + duplicate cards drawn from the player's UNLOCKED pool, then
   * frees the slot. Returns the rewards and the updated profile.
   */
  openChest(
    userId: string,
    chestId: string,
    opts: { withGems?: boolean } = {},
    now = Date.now(),
    rng: () => number = Math.random,
  ): { rewards: BattleRewards; profile: PlayerProfile } {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    const idx = user.chests.findIndex((c) => c.id === chestId);
    if (idx < 0) throw new Error('Chest not found');
    const chest = user.chests[idx];
    const state = chestState(chest, now);
    if (state !== 'ready') {
      if (!opts.withGems) throw new Error('Chest not ready');
      const cost = gemsToSkip(chest, now);
      if (user.gems < cost) throw new Error('Not enough gems');
      user.gems -= cost;
    }
    const pool = unlockedCards(user.trophies);
    const legendaryPool = pool.filter((id) => getCard(id)?.rarity === 'legendary');
    const rewards = rollChestRewards(chest.rarity, pool, rng, legendaryPool);
    user.chests.splice(idx, 1);
    user.gold += rewards.gold;
    for (const [cardId, n] of Object.entries(rewards.cards)) {
      const cs = user.cards[cardId];
      if (cs) cs.count += n;
    }
    this.db?.upsertUser(user);
    return { rewards, profile: user };
  }

  // --- Sessions ---
  createSession(userId: string): string {
    const token = randomUUID();
    this.sessions.set(token, userId);
    this.db?.upsertSession(token, userId);
    return token;
  }

  getSessionUser(token: string): PlayerProfile | undefined {
    const userId = this.sessions.get(token);
    return userId ? this.users.get(userId) : undefined;
  }

  // --- Clans ---
  listClans(): Clan[] {
    return [...this.clans.values()];
  }

  getClan(id: string): Clan | undefined {
    return this.clans.get(id);
  }

  createClan(leaderId: string, name: string): Clan {
    const v = validateClanName(name);
    if (!v.ok) throw new Error(v.error);
    const leader = this.users.get(leaderId);
    if (!leader) throw new Error('User not found');
    if (leader.clanId) throw new Error('You are already in a clan');

    const id = randomUUID();
    const member: ClanMember = {
      userId: leader.id,
      nickname: leader.nickname,
      role: 'leader',
      trophies: leader.trophies,
      joinedAt: Date.now(),
    };
    const clan: Clan = { id, name: name.trim(), leaderId, createdAt: Date.now(), members: [member] };
    this.clans.set(id, clan);
    leader.clanId = id;
    this.db?.upsertClan(clan);
    this.db?.upsertUser(leader);
    return clan;
  }

  joinClan(userId: string, clanId: string): Clan {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    if (user.clanId) throw new Error('You are already in a clan');
    const clan = this.clans.get(clanId);
    if (!clan) throw new Error('Clan not found');
    if (clan.members.length >= MAX_CLAN_MEMBERS) {
      throw new Error(`Clan is full (max ${MAX_CLAN_MEMBERS} members)`);
    }
    clan.members.push({
      userId: user.id,
      nickname: user.nickname,
      role: 'member',
      trophies: user.trophies,
      joinedAt: Date.now(),
    });
    user.clanId = clan.id;
    this.db?.upsertClan(clan);
    this.db?.upsertUser(user);
    return clan;
  }

  leaveClan(userId: string): void {
    const user = this.users.get(userId);
    if (!user || !user.clanId) throw new Error('You are not in a clan');
    const clan = this.clans.get(user.clanId);
    user.clanId = null;
    this.db?.upsertUser(user);
    if (!clan) return;
    clan.members = clan.members.filter((m) => m.userId !== userId);
    if (clan.members.length === 0) {
      this.clans.delete(clan.id);
      this.db?.deleteClan(clan.id);
      return;
    }
    if (clan.leaderId === userId) {
      // promote the longest-standing member to leader
      const next = clan.members.slice().sort((a, b) => a.joinedAt - b.joinedAt)[0];
      next.role = 'leader';
      clan.leaderId = next.userId;
    }
    this.db?.upsertClan(clan);
  }

  kickMember(leaderId: string, targetUserId: string): Clan {
    const leader = this.users.get(leaderId);
    if (!leader || !leader.clanId) throw new Error('You are not in a clan');
    const clan = this.clans.get(leader.clanId);
    if (!clan) throw new Error('Clan not found');
    if (clan.leaderId !== leaderId) throw new Error('Only the leader can kick members');
    if (targetUserId === leaderId) throw new Error('The leader cannot kick themselves (use leave/disband)');
    const target = this.users.get(targetUserId);
    clan.members = clan.members.filter((m) => m.userId !== targetUserId);
    if (target) {
      target.clanId = null;
      this.db?.upsertUser(target);
    }
    this.db?.upsertClan(clan);
    return clan;
  }
}

export const store = new Store();
