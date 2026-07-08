import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameManager } from '../manager';
import { Match } from '../game/match';
import { store } from '../store';
import { OPEN_BATTLE_CONFIG, type ServerMessage } from '@croyal/shared';

/**
 * Friendly (unranked) battles: a host opens a private room and shares its code;
 * a guest joins by that code. The pairing runs the normal match engine, but the
 * result touches no ladder or economy.
 */
describe('friendly rooms (manager)', () => {
  let mgr: GameManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new GameManager();
  });
  afterEach(() => vi.useRealTimers());

  function freshUser(tg: number, nick: string): string {
    return store.createUser({ telegramId: tg, nickname: nick, language: 'en' }).id;
  }

  it('hosting hands back a code; joining pairs both into a friendly match', () => {
    const host = freshUser(7001, 'FHost' + Math.floor(Math.random() * 1e6));
    const guest = freshUser(7002, 'FGuest' + Math.floor(Math.random() * 1e6));
    const hostMsgs: ServerMessage[] = [];
    const guestMsgs: ServerMessage[] = [];

    mgr.createFriendly(host, (m) => hostMsgs.push(m));
    const created = hostMsgs.find((m) => m.t === 'friendlyCreated');
    expect(created).toBeTruthy();
    const code = (created as { code: string }).code;
    expect(code).toMatch(/^[A-Z2-9]{4}$/);

    mgr.joinFriendly(guest, code.toLowerCase(), (m) => guestMsgs.push(m)); // case-insensitive
    const hostFound = hostMsgs.find((m) => m.t === 'matchFound');
    const guestFound = guestMsgs.find((m) => m.t === 'matchFound');
    expect(hostFound).toBeTruthy();
    expect(guestFound).toBeTruthy();
    expect((hostFound as { friendly?: boolean }).friendly).toBe(true);
    expect((guestFound as { friendly?: boolean }).friendly).toBe(true);
    mgr.leaveMatch(host); // tidy up the running match
  });

  it('an unknown code returns an error and starts no match', () => {
    const guest = freshUser(7003, 'NoRoom' + Math.floor(Math.random() * 1e6));
    const msgs: ServerMessage[] = [];
    mgr.joinFriendly(guest, 'ZZZZ', (m) => msgs.push(m));
    expect(msgs.some((m) => m.t === 'error')).toBe(true);
    expect(msgs.some((m) => m.t === 'matchFound')).toBe(false);
  });

  it('the host cannot join their own room', () => {
    const host = freshUser(7004, 'SelfJoin' + Math.floor(Math.random() * 1e6));
    const msgs: ServerMessage[] = [];
    mgr.createFriendly(host, (m) => msgs.push(m));
    const code = (msgs.find((m) => m.t === 'friendlyCreated') as { code: string }).code;
    msgs.length = 0;
    mgr.joinFriendly(host, code, (m) => msgs.push(m));
    expect(msgs.some((m) => m.t === 'error')).toBe(true);
    expect(msgs.some((m) => m.t === 'matchFound')).toBe(false);
  });

  it('a room expires after its TTL, notifying the host', () => {
    const host = freshUser(7005, 'Expire' + Math.floor(Math.random() * 1e6));
    const msgs: ServerMessage[] = [];
    mgr.createFriendly(host, (m) => msgs.push(m));
    const code = (msgs.find((m) => m.t === 'friendlyCreated') as { code: string }).code;
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(msgs.some((m) => m.t === 'error')).toBe(true);
    // the code is now free — joining it fails
    const guest = freshUser(7006, 'LGuest' + Math.floor(Math.random() * 1e6));
    const gmsgs: ServerMessage[] = [];
    mgr.joinFriendly(guest, code, (m) => gmsgs.push(m));
    expect(gmsgs.some((m) => m.t === 'error')).toBe(true);
  });

  it('re-hosting returns the same code (idempotent room)', () => {
    const host = freshUser(7007, 'ReHost' + Math.floor(Math.random() * 1e6));
    const msgs: ServerMessage[] = [];
    mgr.createFriendly(host, (m) => msgs.push(m));
    mgr.createFriendly(host, (m) => msgs.push(m));
    const codes = msgs.filter((m) => m.t === 'friendlyCreated').map((m) => (m as { code: string }).code);
    expect(codes.length).toBe(2);
    expect(codes[0]).toBe(codes[1]);
  });
});

describe('friendly match awards nothing', () => {
  function seatUser(tg: number, nick: string, trophies: number) {
    const u = store.createUser({ telegramId: tg, nickname: nick, language: 'en' });
    store.updateUser(u.id, { trophies });
    return u.id;
  }
  const send = () => {};

  it('a friendly match leaves trophies, gold, wins and losses untouched', () => {
    const a = seatUser(7101, 'FriA' + Math.floor(Math.random() * 1e6), 500);
    const b = seatUser(7102, 'FriB' + Math.floor(Math.random() * 1e6), 500);
    const before = { a: { ...store.getUser(a)! }, b: { ...store.getUser(b)! } };
    const match = new Match(
      'friendly-1',
      { userId: a, deck: store.getUser(a)!.trio, send },
      { userId: b, deck: store.getUser(b)!.trio, send },
      store,
      () => {},
      OPEN_BATTLE_CONFIG,
      true, // friendly
    );
    match.handleLeave(b); // b forfeits -> a "wins", but it's friendly
    for (const id of [a, b]) {
      const now = store.getUser(id)!;
      const was = id === a ? before.a : before.b;
      expect(now.trophies).toBe(was.trophies);
      expect(now.gold).toBe(was.gold);
      expect(now.wins).toBe(was.wins);
      expect(now.losses).toBe(was.losses);
    }
  });

  it('control: a ranked match DOES move trophies', () => {
    const a = seatUser(7103, 'RankA' + Math.floor(Math.random() * 1e6), 500);
    const b = seatUser(7104, 'RankB' + Math.floor(Math.random() * 1e6), 500);
    const match = new Match(
      'ranked-1',
      { userId: a, deck: store.getUser(a)!.trio, send },
      { userId: b, deck: store.getUser(b)!.trio, send },
      store,
      () => {},
      OPEN_BATTLE_CONFIG,
      false, // ranked
    );
    match.handleLeave(b); // b forfeits -> a wins, +30 / -30
    expect(store.getUser(a)!.trophies).toBe(530);
    expect(store.getUser(b)!.trophies).toBe(470);
  });
});
