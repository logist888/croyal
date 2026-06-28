/**
 * Tiny i18n layer. UI shows English by default and Russian when the player picks
 * the Russian language at registration (stored in profile.language).
 */
import { getCard } from '@croyal/shared';

export type Lang = 'en' | 'ru';

let currentLang: Lang = 'en';
export function setLang(l: Lang): void { currentLang = l === 'ru' ? 'ru' : 'en'; }
export function getLang(): Lang { return currentLang; }

type Dict = Record<string, string>;

const EN: Dict = {
  'common.back': 'Back',
  'common.loading': 'Loading…',
  'common.cancel': 'Cancel',
  'common.leave': 'Leave',
  'common.connecting': 'Connecting…',
  'common.connFailed': 'Connection failed: {msg}',
  'common.serverUnreachable': 'Cannot reach server: {msg}. Is the backend running on :3001?',

  'register.title': 'Create your account',
  'register.nickLabel': 'Nickname (English letters, digits, "_" — 3-16 chars)',
  'register.nickHint': 'No emoji, no spaces, English only.',
  'register.language': 'Language',
  'register.warnTitle': 'Your nickname is chosen FOREVER. It can NEVER be changed later.',
  'register.warnSub': 'Make sure you are happy with it before continuing.',
  'register.confirm': 'I understand my nickname is permanent.',
  'register.submit': 'Create account',
  'register.errLen': 'Nickname must be 3-16 characters.',
  'register.errRules': 'Nickname may contain only English letters (a-z, A-Z), digits and "_". No emoji or other languages.',

  'menu.greeting': 'Hi, {name}',
  'menu.trophies': 'Trophies',
  'menu.wins': 'Wins',
  'menu.losses': 'Losses',
  'menu.gold': 'Gold',
  'menu.battle': '⚔️ Battle (1v1)',
  'menu.clans': '🛡️ Clans',
  'menu.yourDeck': 'Your deck',
  'menu.level': 'Lvl {n}',
  'menu.avgElixir': 'Avg elixir {v}',
  'menu.toNext': '{n} 🏆 to {name}',
  'menu.topLeague': 'Top league',
  'hud.max': 'Max {n}',

  'clans.title': 'Clans',
  'clans.createTitle': 'Create a clan',
  'clans.createHint': 'Clan name can be in ANY language (up to 24 chars).',
  'clans.createBtn': 'Create clan (max 20 members)',
  'clans.open': 'Open clans',
  'clans.none': 'No clans yet — be the first!',
  'clans.members': '{n}/20 members',
  'clans.join': 'Join',
  'clans.full': 'Full',
  'clans.raidBoss': '🐉 Raid Clan Boss (co-op ×2)',
  'clans.bossTip': 'Tip: 2+ clanmates raiding at once doubles the boss difficulty.',
  'clans.membersTitle': 'Members',
  'clans.leave': 'Leave clan',
  'clans.kick': 'Kick',

  'battle.finding': 'Finding opponent…',
  'battle.findingHint': 'Matchmaking by trophies. A practice bot joins if nobody is found.',
  'battle.victory': '🏆 Victory!',
  'battle.defeat': '💀 Defeat',
  'battle.towers': 'Crowns: {a} — {b}',
  'battle.reason': 'Result: {reason}',
  'battle.trophies': 'Trophies: {delta}',
  'battle.backToMenu': 'Back to menu',

  'reason.king': 'enemy king destroyed',
  'reason.tiebreak': 'won on tiebreak',
  'reason.timeout': 'time ran out',
  'reason.opponent_left': 'opponent left',

  'boss.solo': 'solo',
  'boss.coop': 'CO-OP ×{n}',
  'boss.hp': 'Boss {hp} / {max} HP',
  'boss.raiders': 'Raiders',
  'boss.defeated': '🐉 Boss defeated!',
  'boss.failed': '⏱️ Raid failed',
  'boss.reward': 'Reward: {gold} gold',
  'boss.damage': 'Damage dealt',
  'boss.backToClan': 'Back to clan',

  'card.footman': 'Footman',
  'card.archers': 'Archers',
  'card.colossus': 'Colossus',
  'card.ratpack': 'Rat Pack',
  'card.sharpshooter': 'Sharpshooter',
  'card.blademaster': 'Blademaster',
  'card.bombthrower': 'Bomb Thrower',
  'card.bastion': 'Bastion',
  'card.meteor': 'Meteor',
  'card.volley': 'Volley',
};

const RU: Dict = {
  'common.back': 'Назад',
  'common.loading': 'Загрузка…',
  'common.cancel': 'Отмена',
  'common.leave': 'Выйти',
  'common.connecting': 'Подключение…',
  'common.connFailed': 'Ошибка соединения: {msg}',
  'common.serverUnreachable': 'Сервер недоступен: {msg}. Запущен ли сервер на :3001?',

  'register.title': 'Создание аккаунта',
  'register.nickLabel': 'Никнейм (английские буквы, цифры, «_» — 3–16 символов)',
  'register.nickHint': 'Без эмодзи и пробелов, только английские буквы.',
  'register.language': 'Язык',
  'register.warnTitle': 'Ник выбирается НАВСЕГДА — изменить его в дальнейшем будет НЕЛЬЗЯ.',
  'register.warnSub': 'Убедись, что ник тебе нравится, прежде чем продолжить.',
  'register.confirm': 'Я понимаю, что ник нельзя будет изменить.',
  'register.submit': 'Создать аккаунт',
  'register.errLen': 'Ник должен быть от 3 до 16 символов.',
  'register.errRules': 'Ник может содержать только английские буквы (a-z, A-Z), цифры и «_». Без эмодзи и других языков.',

  'menu.greeting': 'Привет, {name}',
  'menu.trophies': 'Кубки',
  'menu.wins': 'Победы',
  'menu.losses': 'Поражения',
  'menu.gold': 'Золото',
  'menu.battle': '⚔️ Бой (1 на 1)',
  'menu.clans': '🛡️ Кланы',
  'menu.yourDeck': 'Твоя колода',
  'menu.level': 'Ур. {n}',
  'menu.avgElixir': 'Ср. эликсир {v}',
  'menu.toNext': '{n} 🏆 до «{name}»',
  'menu.topLeague': 'Высшая лига',
  'hud.max': 'Макс. {n}',

  'clans.title': 'Кланы',
  'clans.createTitle': 'Создать клан',
  'clans.createHint': 'Название клана можно на ЛЮБОМ языке (до 24 символов).',
  'clans.createBtn': 'Создать клан (макс. 20 человек)',
  'clans.open': 'Открытые кланы',
  'clans.none': 'Кланов пока нет — создай первый!',
  'clans.members': '{n}/20 участников',
  'clans.join': 'Вступить',
  'clans.full': 'Полон',
  'clans.raidBoss': '🐉 Рейд на босса клана (кооп ×2)',
  'clans.bossTip': 'Совет: если в рейд зайдут 2+ человека одновременно, сложность босса удвоится.',
  'clans.membersTitle': 'Участники',
  'clans.leave': 'Покинуть клан',
  'clans.kick': 'Исключить',

  'battle.finding': 'Поиск соперника…',
  'battle.findingHint': 'Подбор по кубкам. Если никого нет — подключится тренировочный бот.',
  'battle.victory': '🏆 Победа!',
  'battle.defeat': '💀 Поражение',
  'battle.towers': 'Короны: {a} — {b}',
  'battle.reason': 'Итог: {reason}',
  'battle.trophies': 'Кубки: {delta}',
  'battle.backToMenu': 'В меню',

  'reason.king': 'снесена башня короля',
  'reason.tiebreak': 'победа по очкам',
  'reason.timeout': 'вышло время',
  'reason.opponent_left': 'соперник вышел',

  'boss.solo': 'соло',
  'boss.coop': 'КООП ×{n}',
  'boss.hp': 'Босс {hp} / {max} HP',
  'boss.raiders': 'Рейдеры',
  'boss.defeated': '🐉 Босс повержен!',
  'boss.failed': '⏱️ Рейд провален',
  'boss.reward': 'Награда: {gold} золота',
  'boss.damage': 'Нанесённый урон',
  'boss.backToClan': 'Назад в клан',

  'card.footman': 'Пехотинец',
  'card.archers': 'Лучницы',
  'card.colossus': 'Колосс',
  'card.ratpack': 'Крысиная стая',
  'card.sharpshooter': 'Стрелок',
  'card.blademaster': 'Мечник',
  'card.bombthrower': 'Бомбардир',
  'card.bastion': 'Бастион',
  'card.meteor': 'Метеор',
  'card.volley': 'Залп',
};

const DICTS: Record<Lang, Dict> = { en: EN, ru: RU };

/** Translate a key, interpolating {placeholders} from params. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICTS[currentLang][key] ?? EN[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** Localized card name, falling back to the English name in the shared catalog. */
export function cardName(id: string): string {
  return DICTS[currentLang][`card.${id}`] ?? getCard(id)?.name ?? id;
}

/** Localized result reason. */
export function reasonText(reason: string): string {
  return t(`reason.${reason}`);
}
