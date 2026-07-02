/**
 * Recommended card pairs ("удачные пары") + starter-box onboarding data.
 *
 * A light meta feature from the GDD: static combo hints shown in the trio
 * picker and during onboarding. Pure data — the battle core never reads it.
 *
 * Starter boxes are presentational: every account owns the whole catalog at
 * level 1 anyway, so opening boxes reveals the starter characters one by one
 * and drives the first trio choice WITHOUT touching the duplicate/upgrade
 * economy (GDD decision).
 */

export interface RecommendedPair {
  cards: [string, string];
  en: string;
  ru: string;
}

export const RECOMMENDED_PAIRS: RecommendedPair[] = [
  {
    // Fully inside STARTER_POOL so onboarding can showcase the badge.
    cards: ['footman', 'archers'],
    en: 'Classic duo: the Footman holds the line, Archers support from behind.',
    ru: 'Классическая связка: Пехотинец держит удар, Лучницы поддерживают из-за спины.',
  },
  {
    cards: ['colossus', 'archers'],
    en: 'Tank + support: the Colossus soaks damage, Archers shoot from behind.',
    ru: 'Танк + поддержка: Колосс принимает урон, Лучницы стреляют из-за спины.',
  },
  {
    cards: ['colossus', 'sharpshooter'],
    en: 'Tank + sniper: the Colossus leads, the Sharpshooter picks targets off.',
    ru: 'Танк + снайпер: Колосс идёт первым, Стрелок снимает цели.',
  },
  {
    cards: ['ratpack', 'bombthrower'],
    en: 'Bait + splash: the Rat Pack swarms, the Bomb Thrower clears the pile.',
    ru: 'Размен + сплеш: Крысиная стая окружает, Бомбардир накрывает скопление.',
  },
  {
    cards: ['blademaster', 'volley'],
    en: 'Rush + cleanup: the Blademaster pressures, Volley finishes the rest.',
    ru: 'Заход + зачистка: Мечник давит, Залп добивает остатки.',
  },
  {
    cards: ['blademaster', 'meteor'],
    en: 'Rush + burst: the Blademaster dives, Meteor lands the heavy hit.',
    ru: 'Заход + взрыв: Мечник врывается, Метеор наносит тяжёлый удар.',
  },
  // Expansion catalog pairs (build-15) — one flagship combo per new theme.
  {
    cards: ['treant', 'druidess'],
    en: 'Living wall: the Treant tanks while the Druidess keeps it healed.',
    ru: 'Живая стена: Древень танкует, а Друидка его подлечивает.',
  },
  {
    cards: ['infernal_hound', 'firestorm'],
    en: 'Burn them down: the Hound charges in, Firestorm roasts the defenders.',
    ru: 'Выжигание: Адский пёс врывается, Огненный шторм дожигает защитников.',
  },
  {
    cards: ['snow_yeti', 'blizzard'],
    en: 'Cold advance: the Yeti pushes while Blizzard slows every defender.',
    ru: 'Холодный натиск: Йети продавливает, Метель замедляет всех защитников.',
  },
  {
    cards: ['stormcrow', 'chain_bolt'],
    en: 'Sky assault: Storm Crows strike from above, Chain Bolt zaps the swarm answer.',
    ru: 'Небесный штурм: Вороны бьют с воздуха, Цепная молния снимает рой в ответ.',
  },
  {
    cards: ['royal_guard', 'trumpeter'],
    en: 'Royal march: the Guard holds formation, the Trumpeter keeps them enraged.',
    ru: 'Королевский марш: Стража держит строй, Трубач разгоняет её яростью.',
  },
  {
    cards: ['necromancer', 'venom_cloud'],
    en: 'Creeping death: skeletons swarm while Venom Cloud melts the defense.',
    ru: 'Ползучая смерть: скелеты наседают, Ядовитое облако растворяет оборону.',
  },
  {
    cards: ['sand_golem', 'scarab_swarm'],
    en: 'Desert wave: the Golem walks to towers, Scarabs eat whoever intercepts.',
    ru: 'Волна пустыни: Голем идёт к башням, скарабеи съедают перехватчиков.',
  },
  {
    cards: ['titan_golem', 'worldtree_sap'],
    en: 'Unbreakable: the Titan soaks damage, Worldtree Sap heals it back up.',
    ru: 'Несокрушимость: Титан впитывает урон, Сок Мирового древа его отхиливает.',
  },
];

/** Card ids that pair well with the given card. */
export function recommendedPartners(cardId: string): string[] {
  const out: string[] = [];
  for (const p of RECOMMENDED_PAIRS) {
    if (p.cards[0] === cardId) out.push(p.cards[1]);
    else if (p.cards[1] === cardId) out.push(p.cards[0]);
  }
  return out;
}

/** The pair record for two cards, if they are a recommended combo. */
export function pairFor(a: string, b: string): RecommendedPair | undefined {
  return RECOMMENDED_PAIRS.find(
    (p) => (p.cards[0] === a && p.cards[1] === b) || (p.cards[0] === b && p.cards[1] === a),
  );
}

// --- Starter boxes (onboarding) ---

/** Boxes a new player opens on first login; each reveals one starter character. */
export const STARTER_BOX_COUNT = 5;

/**
 * The characters revealed by the boxes, in reveal order (deterministic —
 * box N always reveals STARTER_POOL[N]). The first trio is assembled from
 * this pool.
 */
export const STARTER_POOL: string[] = [
  'footman', 'archers', 'ratpack', 'sharpshooter', 'blademaster',
];
