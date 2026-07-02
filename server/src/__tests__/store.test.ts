import { describe, it, expect } from 'vitest';
import { Store } from '../store';
import { MAX_CLAN_MEMBERS, STARTER_BOX_COUNT, STARTER_POOL } from '@croyal/shared';

function makeUser(store: Store, n: number) {
  return store.createUser({ telegramId: 1000 + n, nickname: `Player${n}`, language: 'en' });
}

describe('user registration', () => {
  it('creates a user with the default deck and battle trio', () => {
    const store = new Store();
    const u = makeUser(store, 1);
    expect(u.nickname).toBe('Player1');
    expect(u.deck.length).toBe(8);
    expect(u.trio.length).toBe(3);
    expect(u.starterBoxesOpened).toBe(0);
  });

  it('rejects an invalid nickname at creation', () => {
    const store = new Store();
    expect(() => store.createUser({ telegramId: 5, nickname: 'Игрок', language: 'en' })).toThrow();
  });

  it('makes the nickname IMMUTABLE', () => {
    const store = new Store();
    const u = makeUser(store, 2);
    expect(() => store.updateUser(u.id, { nickname: 'NewName' })).toThrow(/immutable/i);
    // other fields still update
    const updated = store.updateUser(u.id, { trophies: 50 });
    expect(updated.trophies).toBe(50);
    expect(updated.nickname).toBe('Player2');
  });
});

describe('battle trio', () => {
  it('accepts exactly 3 distinct owned cards', () => {
    const store = new Store();
    const u = makeUser(store, 1);
    const updated = store.setTrio(u.id, ['ratpack', 'blademaster', 'meteor']);
    expect(updated.trio).toEqual(['ratpack', 'blademaster', 'meteor']);
  });

  it('rejects wrong sizes, duplicates and unknown cards', () => {
    const store = new Store();
    const u = makeUser(store, 1);
    expect(() => store.setTrio(u.id, ['footman', 'archers'])).toThrow(/exactly 3/i);
    expect(() => store.setTrio(u.id, ['footman', 'footman', 'archers'])).toThrow(/unique/i);
    expect(() => store.setTrio(u.id, ['footman', 'archers', 'dragon'])).toThrow(/not owned/i);
    // Object.prototype keys must not pass the ownership check
    expect(() => store.setTrio(u.id, ['constructor', 'toString', 'valueOf'])).toThrow(/not owned/i);
  });
});

describe('nickname uniqueness', () => {
  it('rejects a duplicate nickname at registration (in memory, not just in the DB)', () => {
    const store = new Store();
    store.createUser({ telegramId: 1, nickname: 'SameName', language: 'en' });
    expect(() => store.createUser({ telegramId: 2, nickname: 'SameName', language: 'en' }))
      .toThrow(/taken/i);
  });
});

describe('starter boxes (onboarding)', () => {
  it('reveals the starter pool in order and stops after the last box', () => {
    const store = new Store();
    const u = makeUser(store, 1);
    const revealed: string[] = [];
    for (let i = 0; i < STARTER_BOX_COUNT; i++) {
      const r = store.openStarterBox(u.id);
      revealed.push(r.cardId);
      expect(r.opened).toBe(i + 1);
      expect(r.total).toBe(STARTER_BOX_COUNT);
    }
    expect(revealed).toEqual(STARTER_POOL.slice(0, STARTER_BOX_COUNT));
    expect(() => store.openStarterBox(u.id)).toThrow(/already opened/i);
    // presentational: no duplicates granted
    for (const id of revealed) expect(store.getUser(u.id)!.cards[id].count).toBe(0);
  });
});

describe('clans', () => {
  it('enforces the 20-member cap', () => {
    const store = new Store();
    const leader = makeUser(store, 0);
    const clan = store.createClan(leader.id, 'Любой Язык 🏰');
    for (let i = 1; i < MAX_CLAN_MEMBERS; i++) {
      store.joinClan(makeUser(store, i).id, clan.id);
    }
    expect(store.getClan(clan.id)!.members.length).toBe(MAX_CLAN_MEMBERS);
    // the 21st member is rejected
    const overflow = makeUser(store, MAX_CLAN_MEMBERS);
    expect(() => store.joinClan(overflow.id, clan.id)).toThrow(/full/i);
  });

  it('prevents joining two clans at once', () => {
    const store = new Store();
    const a = makeUser(store, 1);
    const b = makeUser(store, 2);
    const c1 = store.createClan(a.id, 'Clan A');
    const c2 = store.createClan(b.id, 'Clan B');
    expect(() => store.joinClan(a.id, c2.id)).toThrow(/already in a clan/i);
  });

  it('promotes a new leader when the leader leaves', () => {
    const store = new Store();
    const leader = makeUser(store, 1);
    const member = makeUser(store, 2);
    const clan = store.createClan(leader.id, 'Clan');
    store.joinClan(member.id, clan.id);
    store.leaveClan(leader.id);
    const after = store.getClan(clan.id)!;
    expect(after.leaderId).toBe(member.id);
    expect(after.members.length).toBe(1);
  });

  it('lets the leader kick a member', () => {
    const store = new Store();
    const leader = makeUser(store, 1);
    const member = makeUser(store, 2);
    const clan = store.createClan(leader.id, 'Clan');
    store.joinClan(member.id, clan.id);
    store.kickMember(leader.id, member.id);
    expect(store.getClan(clan.id)!.members.length).toBe(1);
    expect(store.getUser(member.id)!.clanId).toBeNull();
  });
});
