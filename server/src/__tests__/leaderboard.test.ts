import { describe, it, expect } from 'vitest';
import { Store } from '../store';

function seed(store: Store, rows: Array<[number, string, number, number]>) {
  for (const [tg, nick, trophies, wins] of rows) {
    const u = store.createUser({ telegramId: tg, nickname: nick, language: 'en' });
    store.updateUser(u.id, { trophies, wins });
  }
}

describe('player leaderboard', () => {
  it('ranks by trophies desc, tiebreak wins then earliest joined', () => {
    const store = new Store();
    seed(store, [
      [1, 'Alpha', 300, 10],
      [2, 'Bravo', 500, 3],
      [3, 'Charlie', 300, 20], // same trophies as Alpha, more wins → ranks above
      [4, 'Delta', 100, 0],
    ]);
    const top = store.topPlayers(10);
    expect(top.map((e) => e.nickname)).toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);
    expect(top.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it('limit caps the list', () => {
    const store = new Store();
    seed(store, Array.from({ length: 8 }, (_, i) => [100 + i, `Player${i}`, i * 10, 0] as [number, string, number, number]));
    expect(store.topPlayers(3).length).toBe(3);
  });

  it('playerRank returns the caller\'s 1-based position', () => {
    const store = new Store();
    const mid = store.createUser({ telegramId: 20, nickname: 'MidGuy', language: 'en' });
    store.updateUser(mid.id, { trophies: 250 });
    seed(store, [[21, 'Higher', 900, 0], [22, 'Lower', 50, 0]]);
    const r = store.playerRank(mid.id);
    expect(r?.rank).toBe(2); // Higher(1), MidGuy(2), Lower(3)
    expect(r?.nickname).toBe('MidGuy');
    expect(store.playerRank('nope')).toBeNull();
  });
});

describe('clan leaderboard', () => {
  it('ranks clans by summed LIVE member trophies', () => {
    const store = new Store();
    const a = store.createUser({ telegramId: 30, nickname: 'ClanLeadA', language: 'en' });
    const b = store.createUser({ telegramId: 31, nickname: 'ClanLeadB', language: 'en' });
    store.updateUser(a.id, { trophies: 400 });
    store.updateUser(b.id, { trophies: 100 });
    const clanA = store.createClan(a.id, 'Team Alpha');
    const clanB = store.createClan(b.id, 'Team Bravo');
    // add a strong member to clan B so it overtakes A
    const c = store.createUser({ telegramId: 32, nickname: 'Strongman', language: 'en' });
    store.updateUser(c.id, { trophies: 800 });
    store.joinClan(c.id, clanB.id);

    const top = store.topClans(10);
    expect(top[0].name).toBe('Team Bravo'); // 100 + 800 = 900
    expect(top[0].trophies).toBe(900);
    expect(top[0].memberCount).toBe(2);
    expect(top[1].name).toBe('Team Alpha'); // 400
    expect(top[1].trophies).toBe(400);
    // uses LIVE trophies: bumping a member updates the standing
    store.updateUser(a.id, { trophies: 5000 });
    expect(store.topClans(10)[0].name).toBe('Team Alpha');
  });
});
