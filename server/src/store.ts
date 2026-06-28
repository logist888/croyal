/**
 * In-memory data store. This is the default persistence layer so the MVP runs
 * with zero external dependencies. The interface is intentionally narrow so it
 * can be backed by PostgreSQL + Redis in production (see docs/DATABASE.md).
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_DECK, MAX_CLAN_MEMBERS, ALL_CARD_IDS, MAX_CARD_LEVEL,
  cardsToUpgrade, goldToUpgrade, xpForUpgrade,
  validateNickname, validateClanName,
  type PlayerProfile, type Clan, type ClanMember, type Language, type CardState,
} from '@croyal/shared';

export interface CreateUserInput {
  telegramId: number;
  nickname: string;
  language: Language;
}

export class Store {
  private users = new Map<string, PlayerProfile>();
  private byTelegram = new Map<number, string>();
  private sessions = new Map<string, string>(); // token -> userId
  private clans = new Map<string, Clan>();

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
      cards,
      clanId: null,
      createdAt: Date.now(),
    };
    this.users.set(id, profile);
    this.byTelegram.set(input.telegramId, id);
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
  }

  // --- Sessions ---
  createSession(userId: string): string {
    const token = randomUUID();
    this.sessions.set(token, userId);
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
    return clan;
  }

  leaveClan(userId: string): void {
    const user = this.users.get(userId);
    if (!user || !user.clanId) throw new Error('You are not in a clan');
    const clan = this.clans.get(user.clanId);
    user.clanId = null;
    if (!clan) return;
    clan.members = clan.members.filter((m) => m.userId !== userId);
    if (clan.members.length === 0) {
      this.clans.delete(clan.id);
      return;
    }
    if (clan.leaderId === userId) {
      // promote the longest-standing member to leader
      const next = clan.members.slice().sort((a, b) => a.joinedAt - b.joinedAt)[0];
      next.role = 'leader';
      clan.leaderId = next.userId;
    }
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
    if (target) target.clanId = null;
    return clan;
  }
}

export const store = new Store();
