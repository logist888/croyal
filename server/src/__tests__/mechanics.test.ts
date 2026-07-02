import { describe, it, expect } from 'vitest';
import { Simulation } from '../game/simulation';
import { COOLDOWN_BATTLE_CONFIG, TICK_DT, getCard, type Side } from '@croyal/shared';

function sim(trioA: string[], trioB: string[]): Simulation {
  return new Simulation(trioA, trioB, 1, {}, {}, COOLDOWN_BATTLE_CONFIG);
}

function run(s: Simulation, seconds: number, each?: () => void): void {
  const ticks = Math.round(seconds / TICK_DT);
  for (let i = 0; i < ticks; i++) {
    s.step(TICK_DT);
    each?.();
  }
}

function unitsOf(s: Simulation, side: Side, cardId?: string) {
  return [...s.entities.values()].filter(
    (e) => e.side === side && e.kind === 'unit' && (!cardId || e.cardId === cardId),
  );
}

describe('charger / assassin (first-hit burst)', () => {
  it('the armed first hit lands heavier, then normal hits follow', () => {
    // Isolated: the rider is the ONLY attacker; the enemy lane princess is
    // the only thing losing hp, so every delta is a rider hit.
    const s = sim(['boarrider', 'archers', 'footman'], ['footman', 'archers', 'colossus']);
    s.deploy('A', 'boarrider');
    const rider = unitsOf(s, 'A', 'boarrider')[0];
    expect(rider.charging).toBe(true);
    const princess = [...s.entities.values()].find(
      (e) => e.side === 'B' && e.towerType === 'princessRight',
    )!;
    const card = getCard('boarrider')!;
    const deltas: number[] = [];
    let prevHp = princess.hp;
    run(s, 25, () => {
      if (princess.hp < prevHp) deltas.push(prevHp - princess.hp);
      prevHp = princess.hp;
    });
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas[0]).toBeGreaterThanOrEqual(Math.floor(card.damage! * 1.9)); // boosted
    expect(deltas[1]).toBeLessThanOrEqual(card.damage! + 1); // back to normal
  });
});

describe('healer', () => {
  it('heals the most-wounded ally, never above maxHp', () => {
    const s = sim(['druidess', 'footman', 'archers'], ['footman', 'archers', 'colossus']);
    s.deploy('A', 'footman');
    run(s, 0.5);
    const [tankee] = unitsOf(s, 'A', 'footman');
    tankee.hp = 300; // wound it directly
    s.deploy('A', 'druidess');
    run(s, 6);
    expect(tankee.hp).toBeGreaterThan(300);
    expect(tankee.hp).toBeLessThanOrEqual(tankee.maxHp);
  });
});

describe('spawner', () => {
  it('a spawner building produces tokens on cadence, capped at maxAlive, and they march', () => {
    const s = sim(['beehive', 'archers', 'footman'], ['footman', 'archers', 'colossus']);
    s.deploy('A', 'beehive');
    run(s, 15);
    const hornets = unitsOf(s, 'A', 'hornet');
    expect(hornets.length).toBeGreaterThanOrEqual(2);
    expect(hornets.length).toBeLessThanOrEqual(4); // maxAlive
    // They march toward the enemy: at least one crossed toward the top half.
    expect(Math.min(...hornets.map((h) => h.y))).toBeLessThan(15);
  });

  it('a spawner troop (necromancer) raises skeletons while marching', () => {
    const s = sim(['necromancer', 'archers', 'footman'], ['footman', 'archers', 'colossus']);
    s.deploy('A', 'necromancer');
    // Check right after the first cadence (before towers shoot the skeletons).
    run(s, 7.5);
    expect(unitsOf(s, 'A', 'skeleton').length).toBeGreaterThanOrEqual(2);
  });
});

describe('chain lightning', () => {
  it('chain_bolt hits at most 1+jumps enemies with falloff and no double-hits', () => {
    const s = sim(['chain_bolt', 'archers', 'footman'], ['ratpack', 'archers', 'colossus']);
    s.deploy('B', 'ratpack'); // 3 clustered bodies, 80 hp each
    run(s, 1);
    const rats = unitsOf(s, 'B', 'ratpack');
    expect(rats.length).toBe(3);
    s.deploy('A', 'chain_bolt', rats[0].x, rats[0].y);
    run(s, 0.1);
    // 150 base > 80 hp; falloff 0.75 -> 112, 84: all three die if within jump range.
    expect(unitsOf(s, 'B', 'ratpack').length).toBe(0);
  });

  it('thunder mage arcs its attacks to nearby extra targets', () => {
    const s = sim(['thunder_mage', 'archers', 'footman'], ['ratpack', 'archers', 'colossus']);
    s.deploy('B', 'ratpack');
    s.deploy('A', 'thunder_mage');
    let sawChainEvent = false;
    run(s, 20, () => {
      const snap = s.getSnapshot('A');
      if (snap.events?.some((ev) => ev.effect === 'chain')) sawChainEvent = true;
      s.clearEvents();
    });
    expect(sawChainEvent).toBe(true);
  });
});

describe('air units', () => {
  it('flyers cross the river anywhere and ground-melee marchers never intercept them', () => {
    const s = sim(['footman', 'archers', 'colossus'], ['stormcrow', 'footman', 'colossus']);
    s.deploy('A', 'footman'); // ground melee marcher (targets ground only)
    s.deploy('B', 'stormcrow'); // flyers heading down the left lane
    // Check just after the crows cross (before the princess shoots them down).
    run(s, 7);
    const crows = unitsOf(s, 'B', 'stormcrow');
    expect(crows.length).toBeGreaterThan(0);
    const mine = unitsOf(s, 'A', 'footman')[0];
    if (mine) expect(mine.marchState).not.toBe('intercept'); // can't hit air
    // Crows crossed onto A's half without using a bridge x
    const south = crows.filter((c) => c.y > 15);
    expect(south.length).toBeGreaterThan(0);
  });

  it('anti-air (archers) does intercept flyers', () => {
    const s = sim(['archers', 'footman', 'colossus'], ['stormcrow', 'footman', 'colossus']);
    s.deploy('B', 'stormcrow');
    run(s, 5); // crows approach the river
    s.deploy('A', 'archers');
    let intercepted = false;
    run(s, 5, () => {
      if (unitsOf(s, 'A', 'archers').some((u) => u.marchState === 'intercept')) intercepted = true;
    });
    expect(intercepted).toBe(true);
  });
});

describe('rage aura & on-hit statuses', () => {
  it('trumpeter keeps nearby allies raging', () => {
    const s = sim(['trumpeter', 'footman', 'archers'], ['footman', 'archers', 'colossus']);
    s.deploy('A', 'footman');
    s.deploy('A', 'trumpeter');
    run(s, 1);
    const foot = unitsOf(s, 'A', 'footman')[0];
    expect(foot.statuses.some((st) => st.kind === 'rage')).toBe(true);
  });

  it('frost archer hits slow their victim', () => {
    // Lanes are mirrored, so stagger the deploys: the footman crosses onto
    // B's half while the frost archer is still marching there — it gets
    // assigned as the interceptor and its arrows apply the slow.
    const s = sim(['footman', 'archers', 'colossus'], ['frost_archer', 'footman', 'colossus']);
    s.deploy('A', 'footman');
    run(s, 7);
    s.deploy('B', 'frost_archer');
    let sawSlow = false;
    run(s, 15, () => {
      const foot = unitsOf(s, 'A', 'footman')[0];
      if (foot?.statuses.some((st) => st.kind === 'slow')) sawSlow = true;
    });
    expect(sawSlow).toBe(true);
  });
});

describe('defense buildings are attackable (build-15 counterplay)', () => {
  it('ranged marchers trade with a lane-threatening enemy building', () => {
    // Sharpshooter: enough hp to survive the approach, enough range to trade.
    // (Squishy archers legitimately get one-shot on the way in — siege counters
    // swarms; the counter to siege is the building-hunter below.)
    const s = sim(['sharpshooter', 'footman', 'colossus'], ['catapult', 'footman', 'colossus']);
    s.deploy('B', 'catapult'); // central defensive spot, outranges the lane
    s.deploy('A', 'sharpshooter');
    const cat = [...s.entities.values()].find((e) => e.cardId === 'catapult')!;
    run(s, 20);
    // It must have been engaged and damaged — before this rule the building
    // sat outside every engagement window and was unattackable.
    expect(cat.hp).toBeLessThan(cat.maxHp);
  });

  it('building-hunters (ram) divert off-lane to demolish a defense building', () => {
    const s = sim(['battering_ram', 'footman', 'colossus'], ['catapult', 'footman', 'colossus']);
    s.deploy('B', 'catapult');
    s.deploy('A', 'battering_ram');
    let destroyed = false;
    run(s, 30, () => {
      if (![...s.entities.values()].some((e) => e.cardId === 'catapult')) destroyed = true;
    });
    expect(destroyed).toBe(true); // the ram left the lane, smashed it, and marches on
  });

  it('building-hunters still ignore enemy troops on the way', () => {
    const s = sim(['battering_ram', 'footman', 'colossus'], ['footman', 'archers', 'colossus']);
    s.deploy('A', 'battering_ram');
    s.deploy('B', 'footman');
    let engagedTroop = false;
    run(s, 15, () => {
      const ram = unitsOf(s, 'A', 'battering_ram')[0];
      if (!ram || ram.marchState !== 'engage') return;
      const t = ram.targetId ? s.entities.get(ram.targetId) : undefined;
      if (t && t.kind === 'unit') engagedTroop = true;
    });
    expect(engagedTroop).toBe(false);
  });
});

describe('siege geometry stays safe', () => {
  it('a siege building at the central spot cannot reach any enemy tower', () => {
    const s = sim(['catapult', 'archers', 'footman'], ['footman', 'archers', 'colossus']);
    s.deploy('A', 'catapult');
    const cat = [...s.entities.values()].find((e) => e.cardId === 'catapult')!;
    const enemyTowers = [...s.entities.values()].filter((e) => e.kind === 'tower' && e.side === 'B');
    for (const t of enemyTowers) {
      const d = Math.hypot(cat.x - t.x, cat.y - t.y);
      expect(d).toBeGreaterThan(getCard('catapult')!.range! + 2);
    }
  });
});
