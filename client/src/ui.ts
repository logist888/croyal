/**
 * DOM screens: registration, main menu, clans. Battle/boss rendering lives in
 * battle.ts / boss.ts (Phaser canvas + HUD). All visible text goes through i18n.
 */
import {
  getCard, NICKNAME_REGEX, NICKNAME_MIN, NICKNAME_MAX,
  leagueForTrophies, levelFromXp, averageElixir, averageCooldown, RARITY_COLOR, LEAGUES,
  MAX_CARD_LEVEL, cardsToUpgrade, goldToUpgrade, scaledStats, TRIO_SIZE, ALL_CARD_IDS,
  pairFor, isCardUnlocked, unlockLeagueIndex,
  CHEST_SLOTS, CHEST_DEFS, chestState, chestRemainingMs, gemsToSkip, hasUnlockingChest,
  hasDailyRewards, loginReward, questClaimable, DAILY_REWARDS,
  seasonRemainingMs, leagueName as seasonLeagueName, GOLD_PACKS, GEM_PACKS,
  bpTierProgress, hasBattlePassRewards,
  type ChestSlot, type DailyState, type DailyQuest, type SeasonReward, type BattlePassReward,
} from '@croyal/shared';
import { api, type ClanWarInfo, type BattlePassInfo } from './net';
import { state } from './state';
import { haptic } from './telegram';
import { t, setLang, getLang, cardName, rarityText, roleText, type Lang } from './i18n';
import { cardImageUrl, uiImageUrl, asset } from './assets';
import { escapeHtml, hex, div } from './html';
import { fx, prefersReducedMotion } from './ui/motion';
import { hydrate, ProgressBar, toast, confirmSheet, Icon } from './ui/primitives';
import { cardTile, cardTileHtml, setTileState } from './ui/card-tile';

/** Live countdown ticker for the hub chest bar (cleared on any screen change). */
let chestTicker: ReturnType<typeof setInterval> | null = null;
function stopChestTicker(): void {
  if (chestTicker) { clearInterval(chestTicker); chestTicker = null; }
}

export interface Nav {
  toMenu(): void;
  toRegister(opts: { telegramId?: number; suggested?: string }): void;
  toClans(): void;
  toBattle(): void;
  toBoss(clanId: string): void;
  toCollection(): void;
  toTrio(): void;
  toDaily(): void;
  toLeaderboard(): void;
  toFriendly(): void;
  toFriendlyHost(): void;
  toFriendlyGuest(code: string): void;
  toReplay(): void;
  toTournament(): void;
  toTournamentMatch(): void;
  toWar(): void;
  toShop(): void;
  toBattlePass(): void;
}

const uiRoot = () => document.getElementById('ui')!;
const gameRoot = () => document.getElementById('game')!;

export type NavDir = 'forward' | 'back' | 'none';
export interface SetUIOptions {
  /** Screen identity; also drives the default transition direction. */
  screen?: string;
  /** Override the inferred direction ('none' = hard cut, e.g. in-battle swaps). */
  dir?: NavDir;
}

/** The screen currently mounted, so we can infer forward vs back. */
let currentScreen: string | null = null;

/**
 * Mount a screen. This is the one choke point every screen passes through, so
 * it owns the transition, primitive hydration and the chest-ticker teardown.
 *
 * Direction is inferred rather than threaded through 25 call sites: this app is
 * hub-and-spoke, so "going to the menu" is always a back motion and everything
 * else is forward.
 */
export function setUI(node: HTMLElement, opts: SetUIOptions = {}): void {
  stopChestTicker(); // any screen change kills the hub chest countdown
  const ui = uiRoot();
  const screen = opts.screen ?? node.dataset.screen ?? null;
  const prev = ui.firstElementChild as HTMLElement | null;

  const dir: NavDir = opts.dir
    ?? (!prev ? 'none' : screen && screen === currentScreen ? 'none' : screen === 'menu' ? 'back' : 'forward');
  currentScreen = screen;
  if (screen) node.dataset.screen = screen;

  hydrate(node);

  if (!prev || dir === 'none' || prefersReducedMotion()) {
    ui.replaceChildren(node);
    return;
  }

  // Overlap the two screens: the outgoing one is parked absolutely so the
  // incoming one can take over the layout flow immediately (no height jump).
  const dx = dir === 'back' ? -1 : 1;
  prev.classList.add('is-leaving');
  ui.appendChild(node);
  fx.exit(prev, dx).finished.finally(() => prev.remove());
  fx.enter(node, dx);
}
export function setGameVisible(visible: boolean): void {
  gameRoot().classList.toggle('hidden', !visible);
}

// escapeHtml/hex/div live in html.ts so ui/primitives.ts can use them without
// importing this module back. Re-exported here for the existing call sites.
export { escapeHtml, hex } from './html';

/**
 * Currency values as last painted in the hub. Returning from a battle, a chest
 * or a purchase re-renders the hub, and we tween from the old number to the new
 * one instead of swapping it — a reward you can watch land reads as a reward.
 */
let lastCurrencies: { trophies: number; gold: number; gems: number } | null = null;

/** Tween the hub's three currency readouts toward the profile's current values. */
function animateCurrencies(node: HTMLElement, to: { trophies: number; gold: number; gems: number }): void {
  const from = lastCurrencies;
  lastCurrencies = { ...to };
  if (!from) return; // first paint of the session — nothing to count up from
  for (const key of ['trophies', 'gold', 'gems'] as const) {
    if (from[key] === to[key]) continue;
    const el = node.querySelector<HTMLElement>(`#cur-${key}`);
    if (!el) continue;
    fx.countTo(el, to[key], { from: from[key] });
    fx.pop(el.parentElement ?? el, to[key] > from[key] ? 1.18 : 1.06);
  }
}

/**
 * League crest for a league index. `badge_1..10` shipped with the art but were
 * never wired up, so leagues had no visual identity at all — only a name.
 */
function leagueBadge(index: number): string {
  return `badge_${Math.min(LEAGUES.length, Math.max(1, index + 1))}`;
}

/** Localized league name where the given card unlocks. */
function unlockLeagueName(cardId: string): string {
  const league = LEAGUES[unlockLeagueIndex(cardId)];
  return getLang() === 'ru' ? league.ru : league.en;
}

/**
 * Logo markup. Uses /logo.png if the operator dropped one into client/public,
 * otherwise falls back to the bundled placeholder crest /logo.svg.
 */
export function logoHtml(small = false): string {
  const png = asset('logo.png');
  const svg = asset('logo.svg');
  return `<img class="logo${small ? ' logo-sm' : ''}" src="${png}" alt="Tower Clash"
    onerror="this.onerror=null;this.src='${svg}'">`;
}

// --- Registration (nickname is permanent!) ---
export function renderRegister(nav: Nav, opts: { telegramId?: number; suggested?: string }): void {
  setGameVisible(false);
  const lang = getLang();

  const node = div('screen');
  node.innerHTML = `
    ${logoHtml()}
    <div class="card col">
      <h2>${t('register.title')}</h2>
      <label class="muted">${t('register.nickLabel')}</label>
      <input id="nick" type="text" placeholder="Knight_99" value="${escapeHtml(opts.suggested ?? '')}" autocomplete="off" />
      <div class="muted">${t('register.nickHint')}</div>

      <label class="muted">${t('register.language')}</label>
      <div class="row lang-pick">
        <button id="lang-en" class="secondary ${lang === 'en' ? 'active' : ''}">English</button>
        <button id="lang-ru" class="secondary ${lang === 'ru' ? 'active' : ''}">Русский</button>
      </div>

      <div class="warn">
        ⚠️ <b>${t('register.warnTitle')}</b><br/>
        <span class="muted">${t('register.warnSub')}</span>
      </div>
      <label class="row" style="gap:8px">
        <input id="confirm" type="checkbox" />
        <span>${t('register.confirm')}</span>
      </label>

      <div class="error" id="err"></div>
      <button id="submit" class="accent" disabled>${t('register.submit')}</button>
    </div>
  `;
  setUI(node, { screen: 'register' });

  const nick = node.querySelector<HTMLInputElement>('#nick')!;
  const confirm = node.querySelector<HTMLInputElement>('#confirm')!;
  const submit = node.querySelector<HTMLButtonElement>('#submit')!;
  const err = node.querySelector<HTMLDivElement>('#err')!;

  // Switching language re-renders the screen in that language (preserving the nickname).
  const switchLang = (l: Lang) => {
    setLang(l);
    renderRegister(nav, { ...opts, suggested: nick.value });
  };
  node.querySelector<HTMLButtonElement>('#lang-en')!.onclick = () => switchLang('en');
  node.querySelector<HTMLButtonElement>('#lang-ru')!.onclick = () => switchLang('ru');
  confirm.onchange = () => { submit.disabled = !confirm.checked; };

  submit.onclick = async () => {
    err.textContent = '';
    const name = nick.value.trim();
    // Client-side validation with localized messages (server re-validates too).
    if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) {
      err.textContent = t('register.errLen');
      haptic('error');
      return;
    }
    if (!NICKNAME_REGEX.test(name)) {
      err.textContent = t('register.errRules');
      haptic('error');
      return;
    }
    submit.disabled = true;
    try {
      const { token, profile, mode } = await api.register({
        nickname: name,
        language: getLang(),
        devUser: opts.telegramId ? { id: opts.telegramId } : undefined,
        initData: window.Telegram?.WebApp?.initData || undefined,
      });
      state.token = token;
      state.profile = profile;
      if (mode) state.mode = mode; // the server's battle core decides the HUD/onboarding path
      setLang(profile.language as Lang);
      haptic('success');
      nav.toMenu();
    } catch (e) {
      err.textContent = (e as Error).message;
      submit.disabled = false;
      haptic('error');
    }
  };
}

// --- Main menu (hub: top bar + league band + battle + nav + deck) ---
export function renderMenu(nav: Nav): void {
  setGameVisible(false);
  const p = state.profile!;
  const lang = getLang();
  const lvl = levelFromXp(p.xp);
  const { index, league, nextMin } = leagueForTrophies(p.trophies);
  const leagueName = lang === 'ru' ? league.ru : league.en;
  const nextLeague = LEAGUES[index + 1];
  const nextName = nextLeague ? (lang === 'ru' ? nextLeague.ru : nextLeague.en) : '';
  const pct = nextMin !== null
    ? Math.min(100, Math.max(0, ((p.trophies - league.min) / (nextMin - league.min)) * 100))
    : 100;
  const cooldownMode = state.mode.economy === 'cooldown';
  const avg = cooldownMode ? averageCooldown(p.trio) : averageElixir(p.deck);

  const node = div('screen');
  node.innerHTML = `
    <div class="topbar">
      <div class="player">
        <img class="avatar" src="${asset('logo.png')}" alt="" onerror="this.onerror=null;this.src='${asset('logo.svg')}'">
        <div class="pinfo">
          <div class="pname">${escapeHtml(p.nickname)}</div>
          <div class="plvl">${t('menu.level', { n: lvl })}</div>
        </div>
      </div>
      <div class="currencies">
        <span class="cur">${Icon('trophy', 15)}<b id="cur-trophies">${p.trophies}</b></span>
        <span class="cur">${Icon('gold', 15)}<b id="cur-gold">${p.gold}</b></span>
        <span class="cur">${Icon('gem', 15)}<b id="cur-gems">${p.gems}</b></span>
      </div>
    </div>

    <div class="league card">
      <div class="row space-between">
        <div class="row league-title">
          ${Icon(leagueBadge(index), 34)}
          <b>${escapeHtml(leagueName)}</b>
        </div>
        <span class="muted">${p.wins}W / ${p.losses}L</span>
      </div>
      ${ProgressBar.html({ kind: 'league', value: pct / 100, height: 10, className: 'league-bar' })}
      <div class="muted">${nextMin !== null
        ? t('menu.toNext', { n: Math.max(0, nextMin - p.trophies), trophy: Icon('trophy', 14), name: nextName })
        : t('menu.topLeague')}</div>
      <div class="muted season-line">${Icon('timer', 12)} ${t('season.endsIn', { time: fmtSeasonTime(seasonRemainingMs(Date.now())) })}</div>
    </div>

    <button id="battle" class="accent big-battle">${t('menu.battle')}</button>
    <button id="pass" class="secondary">${t('menu.pass')}${hasBattlePassRewards(p.battlePass) ? ' <span class="claim-dot"></span>' : ''}</button>
    <div class="row">
      <button id="tournament" class="secondary grow">${t('menu.tournament')}</button>
      <button id="war" class="secondary grow">${t('menu.war')}${p.warReward ? ' <span class="claim-dot"></span>' : ''}</button>
    </div>
    <div class="row">
      <button id="friendly" class="secondary grow">${t('menu.friendly')}</button>
      <button id="replay" class="secondary grow">${t('menu.replay')}</button>
    </div>
    <div class="row">
      <button id="daily" class="secondary grow">${t('menu.daily')}${p.daily && hasDailyRewards(p.daily) ? ' <span class="claim-dot"></span>' : ''}</button>
      <button id="leaderboard" class="secondary grow">${t('menu.leaderboard')}</button>
    </div>
    <button id="shop" class="secondary">${t('menu.shop')}</button>
    <div class="row">
      <button id="cards" class="secondary grow">${t('menu.cards')}</button>
      <button id="clans" class="secondary grow">${t('menu.clans')}</button>
    </div>

    <div class="card">
      <div class="row space-between">
        <div class="muted">${cooldownMode ? t('menu.trio') : t('menu.yourDeck')}</div>
        <div class="muted">${cooldownMode ? t('menu.avgCooldown', { v: avg }) : t('menu.avgElixir', { v: avg })}</div>
      </div>
      <div class="hand${cooldownMode ? ' trio' : ''}" id="deck"></div>
      ${cooldownMode ? `<button id="edit-trio" class="secondary" style="margin-top:8px">${t('trio.edit')}</button>` : ''}
    </div>

    <div class="card">
      <div class="muted" style="margin-bottom:6px">${t('chest.title')}</div>
      <div class="chest-bar" id="chest-bar"></div>
    </div>
  `;
  setUI(node, { screen: 'menu' });
  animateCurrencies(node, { trophies: p.trophies, gold: p.gold, gems: p.gems });

  renderChestBar(node.querySelector<HTMLDivElement>('#chest-bar')!, nav);

  const deck = node.querySelector<HTMLDivElement>('#deck')!;
  for (const id of cooldownMode ? p.trio : p.deck) {
    const c = getCard(id)!;
    deck.appendChild(cardTile({
      cardId: id,
      size: 'sm',
      costText: cooldownMode ? `${c.cooldownSec}s` : undefined,
    }));
  }

  node.querySelector<HTMLButtonElement>('#battle')!.onclick = () => { haptic('light'); nav.toBattle(); };
  node.querySelector<HTMLButtonElement>('#friendly')!.onclick = () => { haptic('light'); nav.toFriendly(); };
  node.querySelector<HTMLButtonElement>('#replay')!.onclick = () => { haptic('light'); nav.toReplay(); };
  node.querySelector<HTMLButtonElement>('#tournament')!.onclick = () => { haptic('light'); nav.toTournament(); };
  node.querySelector<HTMLButtonElement>('#war')!.onclick = () => { haptic('light'); nav.toWar(); };
  node.querySelector<HTMLButtonElement>('#shop')!.onclick = () => { haptic('light'); nav.toShop(); };
  node.querySelector<HTMLButtonElement>('#pass')!.onclick = () => { haptic('light'); nav.toBattlePass(); };
  node.querySelector<HTMLButtonElement>('#daily')!.onclick = () => { haptic('light'); nav.toDaily(); };
  node.querySelector<HTMLButtonElement>('#leaderboard')!.onclick = () => { haptic('light'); nav.toLeaderboard(); };
  node.querySelector<HTMLButtonElement>('#cards')!.onclick = () => { haptic('light'); nav.toCollection(); };
  node.querySelector<HTMLButtonElement>('#clans')!.onclick = () => { haptic('light'); nav.toClans(); };
  node.querySelector<HTMLButtonElement>('#edit-trio')?.addEventListener('click', () => { haptic('light'); nav.toTrio(); });

  // A season rolled over while the player was away — greet them with the reward.
  if (p.season?.pendingReward) showSeasonReward(p.season.pendingReward, nav);
}

// --- Seasons: end-of-season reward claim ---

/** Compact season countdown: "12д 4ч" / "4ч 20м" / "20м". */
function fmtSeasonTime(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60;
  if (d > 0) return `${d}${t('season.d')} ${h}${t('season.h')}`;
  if (h > 0) return `${h}${t('season.h')} ${String(m).padStart(2, '0')}${t('season.m')}`;
  return `${m}${t('season.m')}`;
}

/** Modal shown once per rollover: peak league reached + reward, with a claim button. */
function showSeasonReward(reward: SeasonReward, nav: Nav): void {
  const lang = getLang();
  const overlay = div('modal-overlay');
  overlay.innerHTML = `
    <div class="modal card col" style="align-items:center">
      <h2>🗓 ${t('season.over')}</h2>
      <div class="season-league">🏟 ${escapeHtml(seasonLeagueName(reward.league, lang === 'ru'))}</div>
      <div class="muted">${t('season.reached')}</div>
      <div class="row" style="gap:10px;margin:6px 0">
        ${reward.gold ? `<span class="badge">${Icon('gold', 13)} ${reward.gold}</span>` : ''}
        ${reward.gems ? `<span class="badge">${Icon('gem', 13)} ${reward.gems}</span>` : ''}
      </div>
      <button id="claim-season" class="accent">${t('season.claim')}</button>`;
  document.getElementById('ui')!.appendChild(overlay);
  const btn = overlay.querySelector<HTMLButtonElement>('#claim-season')!;
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      state.profile = (await api.claimSeason()).profile;
      haptic('success');
      overlay.remove();
      renderMenu(nav); // repaint currencies with the reward folded in
    } catch (e) {
      btn.disabled = false;
      haptic('error');
      toast((e as Error).message, 'error');
    }
  };
}

// --- Chests: hub slot bar (unlock timers + open) ---

/** Compact countdown: "2ч 05м" / "12м 30с" / "45с". */
function fmtChestTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}${t('chest.h')} ${String(m).padStart(2, '0')}${t('chest.m')}`;
  if (m > 0) return `${m}${t('chest.m')} ${String(sec).padStart(2, '0')}${t('chest.s')}`;
  return `${sec}${t('chest.s')}`;
}

function renderChestBar(bar: HTMLDivElement, nav: Nav): void {
  const paint = () => {
    const p = state.profile;
    if (!p) return;
    const now = Date.now();
    const chests = p.chests ?? [];
    const anyUnlocking = hasUnlockingChest(chests, now);
    bar.innerHTML = '';
    for (let i = 0; i < CHEST_SLOTS; i++) {
      const chest = chests[i];
      const cell = div('chest-slot');
      if (!chest) { cell.classList.add('empty'); cell.innerHTML = '<span class="chest-empty">+</span>'; bar.appendChild(cell); continue; }
      const st = chestState(chest, now);
      const art = uiImageUrl(`chest_${chest.rarity}`);
      const img = art
        ? `<div class="chest-img" style="background-image:url(${art})"></div>`
        : `<div class="chest-img" style="background:${hex(CHEST_DEFS[chest.rarity].color)}"></div>`;
      cell.classList.add(`chest-${st}`);
      if (st === 'idle') {
        cell.innerHTML = `${img}<div class="chest-cap">${escapeHtml(t(`chest.rarity.${chest.rarity}`))}</div>
          <button class="chest-act secondary" ${anyUnlocking ? 'disabled' : ''}>${t('chest.start')}</button>`;
        cell.querySelector<HTMLButtonElement>('.chest-act')!.onclick = async () => {
          try { state.profile = (await api.unlockChest(chest.id)).profile; haptic('light'); paint(); }
          catch (e) { toast((e as Error).message, 'error'); }
        };
      } else if (st === 'unlocking') {
        const cost = gemsToSkip(chest, now);
        cell.innerHTML = `${img}<div class="chest-cap chest-time">${fmtChestTime(chestRemainingMs(chest, now))}</div>
          <button class="chest-act accent">${Icon('gem', 12)} ${cost}</button>`;
        cell.querySelector<HTMLButtonElement>('.chest-act')!.onclick = () => openChestFlow(nav, chest, true, paint);
      } else {
        cell.innerHTML = `${img}<div class="chest-cap chest-ready">${t('chest.open')}</div>
          <button class="chest-act accent">${t('chest.open')}</button>`;
        cell.querySelector<HTMLButtonElement>('.chest-act')!.onclick = () => openChestFlow(nav, chest, false, paint);
      }
      bar.appendChild(cell);
    }
  };
  paint();
  stopChestTicker();
  // Repaint every second so countdowns tick and "ready" flips live.
  chestTicker = setInterval(paint, 1000);
}

async function openChestFlow(nav: Nav, chest: ChestSlot, withGems: boolean, repaint: () => void): Promise<void> {
  try {
    const { rewards, profile } = await api.openChest(chest.id, withGems);
    state.profile = profile;
    haptic('success');
    repaint();
    showChestReward(chest, rewards);
  } catch (e) {
    haptic('error');
    toast((e as Error).message, 'error');
    repaint();
  }
}

function showChestReward(chest: ChestSlot, rewards: { gold: number; cards: Record<string, number> }): void {
  const overlay = div('modal-overlay');
  const art = uiImageUrl(`chest_${chest.rarity}`);
  const cardTiles = Object.entries(rewards.cards).map(([id, n]) =>
    `<div class="reward"><div class="reward-card">${cardTileHtml({ cardId: id, size: 'xs', showCost: false })}</div><b>×${n}</b></div>`,
  ).join('');
  overlay.innerHTML = `
    <div class="modal card col" style="align-items:center">
      <h2>${escapeHtml(t(`chest.rarity.${chest.rarity}`))}</h2>
      ${art ? `<div class="chest-img big" style="background-image:url(${art})"></div>` : ''}
      <div class="row" style="gap:8px"><span class="badge">${Icon('gold', 13)} ${rewards.gold}</span></div>
      <div class="reward-row">${cardTiles}</div>
      <button id="x" class="accent">${t('common.back')}</button>`;
  document.getElementById('ui')!.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector<HTMLButtonElement>('#x')!.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

// --- Daily: login-streak reward + daily quests ---

function rewardText(gold: number, gems: number): string {
  const parts: string[] = [];
  if (gold) parts.push(`${Icon('gold', 13)} ${gold}`);
  if (gems) parts.push(`${Icon('gem', 13)} ${gems}`);
  return parts.join('  ') || '—';
}

export async function renderDaily(nav: Nav): Promise<void> {
  setGameVisible(false);
  try { state.profile = (await api.me()).profile; } catch { /* keep cached */ }
  const p = state.profile!;
  const daily: DailyState | null = p.daily ?? null;

  const node = div('screen');
  node.innerHTML = `
    <div class="row space-between">
      <h1>${t('menu.daily')}</h1>
      <button id="back" class="secondary">${t('common.back')}</button>
    </div>
    <div class="card col" id="login"></div>
    <h2>${t('daily.questsTitle')}</h2>
    <div class="col" id="quests"></div>`;
  setUI(node, { screen: 'daily' });
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();

  const loginEl = node.querySelector<HTMLDivElement>('#login')!;
  const questsEl = node.querySelector<HTMLDivElement>('#quests')!;

  const paint = () => {
    const d = state.profile?.daily ?? null;
    // --- Login streak track (7-day cycle) ---
    const streak = d?.streak ?? 1;
    const pos = ((streak - 1) % DAILY_REWARDS.length);
    const track = DAILY_REWARDS.map((r, i) => {
      const cls = i < pos ? 'past' : i === pos ? 'today' : '';
      return `<div class="day-cell ${cls}"><div class="day-n">${i + 1}</div><div class="day-r">${rewardText(r.gold, r.gems)}</div></div>`;
    }).join('');
    const claimed = d?.rewardClaimed ?? true;
    const rew = loginReward(streak);
    loginEl.innerHTML = `
      <div class="row space-between">
        <b>${t('daily.streak', { n: streak })}</b>
        <span class="muted">${t('daily.day', { n: pos + 1 })}</span>
      </div>
      <div class="day-track">${track}</div>
      <button id="claim-login" class="accent" ${claimed ? 'disabled' : ''}>
        ${claimed ? t('daily.claimed') : `${t('daily.claim')} — ${rewardText(rew.gold, rew.gems)}`}
      </button>`;
    loginEl.querySelector<HTMLButtonElement>('#claim-login')!.onclick = async () => {
      try { state.profile = (await api.claimDaily()).profile; haptic('success'); paint(); }
      catch (e) { toast((e as Error).message, 'error'); }
    };

    // --- Quests ---
    questsEl.innerHTML = '';
    for (const q of (d?.quests ?? []) as DailyQuest[]) {
      const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
      const canClaim = questClaimable(q);
      const item = div('card quest-item');
      item.innerHTML = `
        <div class="row space-between">
          <b>${escapeHtml(t(`quest.${q.type}`, { n: q.target }))}</b>
          <span class="muted">${rewardText(q.rewardGold, q.rewardGems)}</span>
        </div>
        <div class="col-bar"><div class="col-fill" style="width:${pct}%"></div></div>
        <div class="row space-between">
          <span class="muted">${Math.min(q.progress, q.target)}/${q.target}</span>
          <button class="quest-claim ${canClaim ? 'accent' : 'secondary'}" ${q.claimed || !canClaim ? 'disabled' : ''}>
            ${q.claimed ? t('daily.claimed') : t('daily.claim')}
          </button>
        </div>`;
      item.querySelector<HTMLButtonElement>('.quest-claim')!.onclick = async () => {
        try { state.profile = (await api.claimQuest(q.id)).profile; haptic('success'); paint(); }
        catch (e) { toast((e as Error).message, 'error'); }
      };
      questsEl.appendChild(item);
    }
    if (!d) questsEl.innerHTML = `<div class="muted">${t('common.loading')}</div>`;
  };
  paint();
}

// --- Leaderboards: top players / top clans ---

export async function renderLeaderboard(nav: Nav): Promise<void> {
  setGameVisible(false);
  const meId = state.profile?.id;
  const node = div('screen');
  node.innerHTML = `
    <div class="row space-between">
      <h1>${t('menu.leaderboard')}</h1>
      <button id="back" class="secondary">${t('common.back')}</button>
    </div>
    <div class="row lb-tabs">
      <button id="tab-players" class="grow active">${t('lb.players')}</button>
      <button id="tab-clans" class="secondary grow">${t('lb.clans')}</button>
    </div>
    <div id="lb-body" class="col">${t('common.loading')}</div>`;
  setUI(node, { screen: 'leaderboard' });
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();
  const body = node.querySelector<HTMLDivElement>('#lb-body')!;
  const tabP = node.querySelector<HTMLButtonElement>('#tab-players')!;
  const tabC = node.querySelector<HTMLButtonElement>('#tab-clans')!;

  const medal = (rank: number) => (rank <= 3
    ? Icon(['medal_gold', 'medal_silver', 'medal_bronze'][rank - 1], 22)
    : `${rank}`);

  const showPlayers = async () => {
    tabP.className = 'grow active'; tabC.className = 'secondary grow';
    body.innerHTML = t('common.loading');
    try {
      const { top, you } = await api.leaderboardPlayers();
      const rows = top.map((e) => `
        <div class="list-item lb-row ${e.userId === meId ? 'me' : ''}">
          <div class="row" style="gap:10px"><span class="lb-rank">${medal(e.rank)}</span><b>${escapeHtml(e.nickname)}</b></div>
          <span class="lb-tr">${Icon('trophy', 14)}${e.trophies}</span>
        </div>`).join('');
      const youRow = you && !top.some((e) => e.userId === meId)
        ? `<div class="muted" style="margin-top:6px">${t('lb.yourRank')}</div>
           <div class="list-item lb-row me"><div class="row" style="gap:10px"><span class="lb-rank">${medal(you.rank)}</span><b>${escapeHtml(you.nickname)}</b></div><span class="lb-tr">${Icon('trophy', 14)}${you.trophies}</span></div>`
        : '';
      body.innerHTML = (rows || `<div class="muted">${t('lb.empty')}</div>`) + youRow;
    } catch (e) { body.innerHTML = `<div class="error">${escapeHtml((e as Error).message)}</div>`; }
  };

  const showClans = async () => {
    tabC.className = 'grow active'; tabP.className = 'secondary grow';
    body.innerHTML = t('common.loading');
    try {
      const { top } = await api.leaderboardClans();
      body.innerHTML = top.map((e) => `
        <div class="list-item lb-row">
          <div class="row" style="gap:10px"><span class="lb-rank">${medal(e.rank)}</span>
            <div><b>${escapeHtml(e.name)}</b><div class="muted">${t('clans.members', { n: e.memberCount })}</div></div></div>
          <span class="lb-tr">${Icon('trophy', 14)}${e.trophies}</span>
        </div>`).join('') || `<div class="muted">${t('lb.empty')}</div>`;
    } catch (e) { body.innerHTML = `<div class="error">${escapeHtml((e as Error).message)}</div>`; }
  };

  tabP.onclick = () => { haptic('light'); void showPlayers(); };
  tabC.onclick = () => { haptic('light'); void showClans(); };
  void showPlayers();
}

// --- Clan wars: weekly clan score + contribution + war leaderboard ---

export async function renderWar(nav: Nav): Promise<void> {
  setGameVisible(false);
  const node = div('screen');
  node.innerHTML = `
    <div class="row space-between">
      <h1>${t('menu.war')}</h1>
      <button id="back" class="secondary">${t('common.back')}</button>
    </div>
    <div id="war-body" class="col">${t('common.loading')}</div>`;
  setUI(node, { screen: 'war' });
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();
  const body = node.querySelector<HTMLDivElement>('#war-body')!;

  const medal = (rank: number) => (rank <= 3
    ? Icon(['medal_gold', 'medal_silver', 'medal_bronze'][rank - 1], 22)
    : `${rank}`);

  const paint = (w: ClanWarInfo) => {
    const rew = w.reward
      ? `<div class="card col" style="align-items:center">
           <h2>${t('war.rewardTitle')}</h2>
           <div class="muted">${t('war.rewardFrom', { score: w.reward.score })}</div>
           <div class="row" style="gap:10px">
             ${w.reward.gold ? `<span class="badge">🪙 ${w.reward.gold}</span>` : ''}
             ${w.reward.gems ? `<span class="badge">💎 ${w.reward.gems}</span>` : ''}
           </div>
           <button id="claim-war" class="accent">${t('war.claim')}</button>
         </div>`
      : '';
    const rows = w.leaderboard.map((e) => `
      <div class="list-item lb-row ${e.clanId === state.profile?.clanId ? 'me' : ''}">
        <div class="row" style="gap:10px"><span class="lb-rank">${medal(e.rank)}</span>
          <div><b>${escapeHtml(e.name)}</b><div class="muted">${t('clans.members', { n: e.memberCount })}</div></div></div>
        <span class="lb-tr">⚔️ ${e.score}</span>
      </div>`).join('') || `<div class="muted">${t('lb.empty')}</div>`;
    body.innerHTML = `
      ${rew}
      <div class="card col">
        <div class="row space-between"><b>⚔️ ${t('war.thisWeek')}</b><span class="muted">${Icon('timer', 12)} ${fmtSeasonTime(w.remainingMs)}</span></div>
        <div class="row space-between"><span class="muted">${t('war.clanScore')}</span><b>${w.clanScore} · ${t('war.tier', { n: w.tier })}</b></div>
        <div class="row space-between"><span class="muted">${t('war.yourContribution')}</span><b>${w.yourContribution}</b></div>
      </div>
      <h2>${t('war.leaderboard')}</h2>
      ${rows}`;
    body.querySelector<HTMLButtonElement>('#claim-war')?.addEventListener('click', async () => {
      try {
        state.profile = (await api.claimWar()).profile;
        haptic('success');
        paint(await api.clanWar());
      } catch (e) { toast((e as Error).message, 'error'); }
    });
  };

  try {
    const w = await api.clanWar();
    if (!w.inClan) {
      body.innerHTML = `<div class="card col" style="align-items:center">
        <div class="muted">${t('war.needClan')}</div>
        <button id="toclans" class="accent">${t('menu.clans')}</button></div>`;
      body.querySelector<HTMLButtonElement>('#toclans')!.onclick = () => nav.toClans();
      return;
    }
    paint(w);
  } catch (e) {
    body.innerHTML = `<div class="error">${escapeHtml((e as Error).message)}</div>`;
  }
}

// --- Shop: gems -> gold, and Telegram Stars -> gems (Этап 3 monetization) ---

/** Open a Telegram Stars invoice; resolves to the final status ('paid' etc.). */
function openTelegramInvoice(link: string): Promise<string> {
  const tg = (window as unknown as { Telegram?: { WebApp?: { openInvoice?: (u: string, cb: (s: string) => void) => void } } }).Telegram?.WebApp;
  return new Promise((resolve) => {
    if (tg?.openInvoice) tg.openInvoice(link, resolve);
    else resolve('unsupported');
  });
}

export async function renderShop(nav: Nav): Promise<void> {
  setGameVisible(false);
  const p = state.profile!;
  const node = div('screen');
  const goldPacks = GOLD_PACKS.map((pk) => `
    <div class="card shop-pack">
      <div class="row space-between">
        <div>
          <b>🪙 ${pk.gold.toLocaleString()}</b>
          <div class="muted">${t('shop.perGem', { n: Math.round(pk.gold / pk.gems) })}</div>
        </div>
        <button class="accent shop-buy-gold" data-pack="${pk.id}">💎 ${pk.gems}</button>
      </div>
    </div>`).join('');
  node.innerHTML = `
    <div class="row space-between">
      <h1>${t('menu.shop')}</h1>
      <button id="back" class="secondary">${t('common.back')}</button>
    </div>
    <div class="row" style="gap:14px;justify-content:center;margin:2px 0 8px">
      <span class="cur">🪙 <b id="shop-gold">${p.gold}</b></span>
      <span class="cur">💎 <b id="shop-gems">${p.gems}</b></span>
    </div>
    <div id="gem-section"></div>
    <h2>${t('shop.gold')}</h2>
    <div class="muted" style="margin-bottom:6px">${t('shop.goldHint')}</div>
    ${goldPacks}`;
  setUI(node, { screen: 'shop' });
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();
  const refresh = () => {
    node.querySelector<HTMLElement>('#shop-gold')!.textContent = String(state.profile!.gold);
    node.querySelector<HTMLElement>('#shop-gems')!.textContent = String(state.profile!.gems);
  };

  node.querySelectorAll<HTMLButtonElement>('.shop-buy-gold').forEach((btn) => {
    btn.onclick = async () => {
      const packId = btn.getAttribute('data-pack')!;
      btn.disabled = true;
      try {
        state.profile = (await api.buyGold(packId)).profile;
        haptic('success');
        refresh();
      } catch (e) {
        haptic('error');
        toast((e as Error).message, 'error');
      } finally {
        btn.disabled = false;
      }
    };
  });

  // Gems for Telegram Stars — only shown once the real-money channel is live.
  const gemSection = node.querySelector<HTMLDivElement>('#gem-section')!;
  let starsOn = false;
  try { starsOn = (await api.shopConfig()).starsEnabled; } catch { /* leave off */ }
  if (starsOn) {
    const gemPacks = GEM_PACKS.map((pk) => `
      <div class="card shop-pack">
        <div class="row space-between">
          <b>💎 ${pk.gems.toLocaleString()}</b>
          <button class="accent shop-buy-gems" data-pack="${pk.id}">⭐ ${pk.stars}</button>
        </div>
      </div>`).join('');
    gemSection.innerHTML = `<h2>${t('shop.gems')}</h2>${gemPacks}`;
    gemSection.querySelectorAll<HTMLButtonElement>('.shop-buy-gems').forEach((btn) => {
      btn.onclick = async () => {
        const packId = btn.getAttribute('data-pack')!;
        btn.disabled = true;
        try {
          const { link } = await api.starsInvoice(packId);
          const status = await openTelegramInvoice(link);
          if (status === 'paid') {
            // The webhook credits gems server-side; refresh to reflect it.
            state.profile = (await api.me()).profile;
            haptic('success');
            refresh();
          } else if (status === 'unsupported') {
            toast(t('shop.openInTelegram'), 'info');
          }
        } catch (e) {
          haptic('error');
          toast((e as Error).message, 'error');
        } finally {
          btn.disabled = false;
        }
      };
    });
  }
}

// --- Friendly battles: host a room (share a code) or join by code ---

export function renderFriendly(nav: Nav): void {
  setGameVisible(false);
  const node = div('screen');
  node.innerHTML = `
    <div class="row space-between">
      <h1>${t('menu.friendly')}</h1>
      <button id="back" class="secondary">${t('common.back')}</button>
    </div>
    <div class="muted">${t('friendly.intro')}</div>
    <button id="host" class="accent big-battle">${t('friendly.create')}</button>
    <div class="card col">
      <div class="muted">${t('friendly.joinTitle')}</div>
      <input id="code" type="text" maxlength="4" autocomplete="off" autocapitalize="characters"
             placeholder="${t('friendly.codePlaceholder')}" style="text-transform:uppercase;letter-spacing:6px;text-align:center;font-weight:900">
      <button id="join" class="secondary">${t('friendly.join')}</button>
      <div class="error" id="err"></div>
    </div>`;
  setUI(node, { screen: 'friendly' });
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();
  node.querySelector<HTMLButtonElement>('#host')!.onclick = () => { haptic('light'); nav.toFriendlyHost(); };

  const input = node.querySelector<HTMLInputElement>('#code')!;
  const err = node.querySelector<HTMLDivElement>('#err')!;
  node.querySelector<HTMLButtonElement>('#join')!.onclick = () => {
    const code = input.value.trim().toUpperCase();
    if (code.length < 4) { err.textContent = t('friendly.badCode'); return; }
    haptic('light');
    nav.toFriendlyGuest(code);
  };
}

// --- Battle Pass: seasonal free/premium reward track (Этап 3) ---

function bpRewardLabel(r: BattlePassReward): string {
  if (r.gems) return `💎 ${r.gems}`;
  if (r.gold) return `🪙 ${r.gold}`;
  return '—';
}

export async function renderBattlePass(nav: Nav): Promise<void> {
  setGameVisible(false);
  const node = div('screen');
  node.innerHTML = `
    <div class="row space-between">
      <h1>${t('menu.pass')}</h1>
      <button id="back" class="secondary">${t('common.back')}</button>
    </div>
    <div id="bp-body" class="col">${t('common.loading')}</div>`;
  setUI(node, { screen: 'battlepass' });
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();
  const body = node.querySelector<HTMLDivElement>('#bp-body')!;

  const paint = (info: BattlePassInfo) => {
    const bp = info.state;
    const tier = info.tier;
    const prog = bpTierProgress(bp?.xp ?? 0);
    const pct = Math.round((prog.into / prog.need) * 100);
    const premium = !!bp?.premium;
    const claimable = hasBattlePassRewards(bp);

    const rows = info.track.map((tr) => {
      const reached = tr.tier <= tier;
      const freeClaimed = bp?.claimedFree.includes(tr.tier);
      const premClaimed = bp?.claimedPremium.includes(tr.tier);
      const cell = (label: string, on: boolean, claimed: boolean | undefined, locked: boolean) =>
        `<div class="bp-cell ${on ? 'bp-open' : 'bp-locked'} ${claimed ? 'bp-claimed' : ''}">
           ${locked ? Icon('lock', 13) + ' ' : ''}${label}${claimed ? ' ✓' : ''}</div>`;
      return `
        <div class="bp-row ${reached ? 'bp-reached' : ''}">
          <div class="bp-tier">${tr.tier}</div>
          ${cell(bpRewardLabel(tr.free), reached, freeClaimed, false)}
          ${cell(bpRewardLabel(tr.premium), reached && premium, premClaimed, !premium)}
        </div>`;
    }).join('');

    body.innerHTML = `
      <div class="card col">
        <div class="row space-between"><b>${t('pass.tier', { n: tier })}</b><span class="muted">${Icon('timer', 12)} ${fmtSeasonTime(seasonRemainingMs(Date.now()))}</span></div>
        <div class="league-bar"><div class="league-fill" style="width:${pct}%"></div></div>
        <div class="muted">${t('pass.xp', { into: prog.into, need: prog.need })}</div>
      </div>
      ${premium
        ? `<div class="muted" style="text-align:center">${t('pass.premiumActive')}</div>`
        : `<button id="buy-premium" class="accent">${t('pass.getPremium', { n: info.premiumCost })}</button>`}
      <button id="claim-all" class="accent" ${claimable ? '' : 'disabled'}>${t('pass.claimAll')}</button>
      <div class="bp-head bp-row"><div class="bp-tier">#</div><div class="bp-cell">${t('pass.free')}</div><div class="bp-cell">${t('pass.premium')}</div></div>
      ${rows}`;

    body.querySelector<HTMLButtonElement>('#buy-premium')?.addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: t('pass.premium'),
        message: t('pass.confirmPremium', { n: info.premiumCost }),
        confirmLabel: t('common.ok'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
      try { state.profile = (await api.buyBattlePassPremium()).profile; haptic('success'); paint(await api.battlePass()); }
      catch (e) { toast((e as Error).message, 'error'); }
    });
    body.querySelector<HTMLButtonElement>('#claim-all')?.addEventListener('click', async () => {
      try {
        const r = await api.claimBattlePass();
        state.profile = r.profile;
        haptic('success');
        toast(t('pass.claimed', { gold: r.gold, gems: r.gems }), 'success');
        paint(await api.battlePass());
      } catch (e) { toast((e as Error).message, 'error'); }
    });
  };

  try {
    paint(await api.battlePass());
  } catch (e) {
    body.innerHTML = `<div class="error">${escapeHtml((e as Error).message)}</div>`;
  }
}

// --- Battle trio picker: choose exactly TRIO_SIZE cards from the collection ---
export interface TrioPickerOpts {
  /** Restrict the choice to these card ids (onboarding: the starter pool). */
  pool?: string[];
  /** Called after a successful save (default: back to the menu). */
  onSaved?: () => void;
  /** Back-button action (default: back to the menu). */
  onBack?: () => void;
}

export async function renderTrioPicker(nav: Nav, opts: TrioPickerOpts = {}): Promise<void> {
  setGameVisible(false);
  try { state.profile = (await api.me()).profile; } catch { /* keep cached */ }
  const p = state.profile!;
  const ids = opts.pool ?? ALL_CARD_IDS;
  // A trophy drop can leave a now-locked card in the active trio (the server
  // only gates on SET) — don't pre-select it here, or it couldn't be deselected.
  const selected = new Set<string>(
    p.trio.filter((id) => ids.includes(id) && isCardUnlocked(id, p.trophies)),
  );

  const node = div('screen');
  node.innerHTML = `
    <div class="row space-between">
      <h1>${t('trio.title')}</h1>
      <button id="back" class="secondary">${t('common.back')}</button>
    </div>
    <div class="muted">${t('trio.hint')}</div>
    <div class="collection" id="grid" data-stagger></div>
    <div class="pair-hint muted" id="pair-hint"></div>
    <div class="error" id="err"></div>
    <button id="save" class="accent">${t('trio.save')} (${selected.size}/${TRIO_SIZE})</button>
  `;
  setUI(node, { screen: 'trio' });
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => (opts.onBack ? opts.onBack() : nav.toMenu());

  const grid = node.querySelector<HTMLDivElement>('#grid')!;
  const save = node.querySelector<HTMLButtonElement>('#save')!;
  const err = node.querySelector<HTMLDivElement>('#err')!;
  const pairHint = node.querySelector<HTMLDivElement>('#pair-hint')!;
  const cells = new Map<string, HTMLDivElement>();
  const lang = getLang();

  // "Good pair" badges: mark unpicked cards that combo with a picked one, and
  // list the descriptions of pairs already assembled in the selection.
  const refreshPairs = () => {
    for (const [id, cell] of cells) {
      const badge = cell.querySelector<HTMLSpanElement>('.pair-badge')!;
      const partnered = !selected.has(id) && [...selected].some((s) => pairFor(s, id));
      badge.style.display = partnered ? '' : 'none';
    }
    const matched: string[] = [];
    const sel = [...selected];
    for (let i = 0; i < sel.length; i++) {
      for (let j = i + 1; j < sel.length; j++) {
        const pr = pairFor(sel[i], sel[j]);
        if (pr) matched.push(lang === 'ru' ? pr.ru : pr.en);
      }
    }
    pairHint.innerHTML = matched.map((m) => `✨ ${escapeHtml(m)}`).join('<br/>');
  };

  const refreshSave = () => {
    save.textContent = `${t('trio.save')} (${selected.size}/${TRIO_SIZE})`;
    save.disabled = selected.size !== TRIO_SIZE;
    refreshPairs();
  };

  for (const id of ids) {
    const c = getCard(id);
    const cs = p.cards[id];
    if (!c || !cs) continue;
    const locked = !isCardUnlocked(id, p.trophies);
    const cell = div('col-card trio-pick');
    cell.innerHTML = cardTileHtml({
      cardId: id,
      size: 'md',
      costText: `${c.cooldownSec}s`,
      state: locked ? 'locked' : selected.has(id) ? 'selected' : 'normal',
    })
      + (locked
        ? `<div class="col-unlock">${escapeHtml(t('col.unlocksIn', { league: unlockLeagueName(id) }))}</div>`
        : `<div class="col-lvl">${t('col.level', { n: cs.level })}</div>`)
      + `<span class="pair-badge" style="display:none">${t('pairs.badge')}</span>`;
    if (locked) {
      // Visible but not selectable — the server enforces the same gate on save.
      cell.classList.add('locked');
    } else {
      const tile = cell.querySelector<HTMLElement>('.ct')!;
      cell.classList.toggle('picked', selected.has(id));
      cell.onclick = () => {
        if (selected.has(id)) {
          selected.delete(id);
        } else {
          if (selected.size >= TRIO_SIZE) return;
          selected.add(id);
        }
        const on = selected.has(id);
        cell.classList.toggle('picked', on);
        setTileState(tile, on ? 'selected' : 'normal');
        haptic('light');
        refreshSave();
      };
    }
    cells.set(id, cell);
    grid.appendChild(cell);
  }
  // hydrate() staggers on mount, but these grids are filled after setUI runs.
  fx.stagger([...grid.children]);
  refreshSave();

  save.onclick = async () => {
    err.textContent = '';
    save.disabled = true;
    try {
      state.profile = (await api.updateTrio([...selected])).profile;
      haptic('success');
      if (opts.onSaved) opts.onSaved();
      else nav.toMenu();
    } catch (e) {
      err.textContent = (e as Error).message;
      save.disabled = false;
      haptic('error');
    }
  };
}

// --- Collection (cards: level, upgrade) ---
export async function renderCollection(nav: Nav): Promise<void> {
  setGameVisible(false);
  // refresh profile (gold/xp/card counts may have changed)
  try { state.profile = (await api.me()).profile; } catch { /* keep cached */ }
  const p = state.profile!;
  const node = div('screen');
  node.innerHTML = `
    <div class="row space-between">
      <h1>${t('col.title')}</h1>
      <button id="back" class="secondary">${t('common.back')}</button>
    </div>
    <div class="row space-between card">
      <div><b>🃏 ${t('menu.level', { n: levelFromXp(p.xp) })}</b></div>
      <div class="muted">🪙 ${p.gold}</div>
    </div>
    <div class="collection" id="grid" data-stagger></div>
  `;
  setUI(node, { screen: 'collection' });
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();

  const grid = node.querySelector<HTMLDivElement>('#grid')!;
  // Show the FULL catalog (deck first), not just the account's stored map — so
  // every card renders even if a legacy account's inventory is behind the roster.
  const order = p.deck.concat(ALL_CARD_IDS.filter((id) => !p.deck.includes(id)));
  for (const id of order) {
    const c = getCard(id);
    if (!c) continue;
    const cs = p.cards[id] ?? { level: 1, count: 0 };
    const locked = !isCardUnlocked(id, p.trophies);
    const need = cardsToUpgrade(cs.level);
    const ready = cs.level < MAX_CARD_LEVEL && cs.count >= need && p.gold >= goldToUpgrade(cs.level);
    const cell = div('col-card');
    // Greyed, but detail/upgrade stay open — only the trio picker is gated.
    if (locked) cell.classList.add('locked');
    cell.innerHTML = cardTileHtml({
      cardId: id,
      size: 'md',
      state: locked ? 'locked' : 'normal',
      badges: ready ? ['upgrade'] : undefined,
    })
      + `<div class="col-lvl">${t('col.level', { n: cs.level })}${ready ? ' ' + Icon('xp', 13) : ''}</div>`
      + ProgressBar.html({
        kind: 'xp', height: 6,
        value: cs.count / (need === Infinity ? cs.count || 1 : need),
        className: 'col-bar',
      })
      + `<div class="muted col-count">${cs.level >= MAX_CARD_LEVEL ? t('col.maxLevel') : t('col.cards', { have: cs.count, need })}</div>`
      + (locked ? `<div class="col-unlock">${escapeHtml(t('col.unlocksIn', { league: unlockLeagueName(id) }))}</div>` : '');
    cell.onclick = () => openCardDetail(nav, id);
    grid.appendChild(cell);
  }
  fx.stagger([...grid.children]);
}

function openCardDetail(nav: Nav, id: string): void {
  const p = state.profile!;
  const c = getCard(id)!;
  const cs = p.cards[id];
  const stats = scaledStats(c, cs.level);
  const dps = c.damage && c.hitSpeed ? Math.round((stats.damage / c.hitSpeed)) : 0;
  const need = cardsToUpgrade(cs.level);
  const goldCost = goldToUpgrade(cs.level);
  const maxed = cs.level >= MAX_CARD_LEVEL;
  const canUp = !maxed && cs.count >= need && p.gold >= goldCost;

  const statLine = (label: string, val: number) => `<div class="row space-between"><span class="muted">${label}</span><b>${val}</b></div>`;
  const overlay = div('modal-overlay');
  overlay.innerHTML = `
    <div class="modal card col">
      <div class="row space-between">
        <h2>${escapeHtml(cardName(id))}</h2>
        <button id="x" class="secondary" style="padding:4px 10px">✕</button>
      </div>
      <div class="row" style="gap:8px">
        <span class="badge" style="background:${hex(RARITY_COLOR[c.rarity])}">${rarityText(c.rarity)}</span>
        <span class="badge" style="background:#455a64;color:#fff">${roleText(c.role)}</span>
        <span class="badge">${state.mode.economy === 'cooldown' ? `${Icon('timer', 13)} ${c.cooldownSec}s` : `${Icon('elixir', 13)} ${c.cost}`}</span>
        <span class="badge">${t('col.level', { n: cs.level })}</span>
      </div>
      ${isCardUnlocked(id, p.trophies) ? '' : `<div class="col-unlock">${Icon('lock', 13)} ${escapeHtml(t('col.unlocksIn', { league: unlockLeagueName(id) }))}</div>`}
      <div class="col" style="gap:4px">
        ${c.type === 'spell'
          ? statLine(t('card.spellDmg'), stats.spellDamage)
          : statLine(t('card.hp'), stats.hp) + statLine(t('card.dmg'), stats.damage) + statLine(t('card.dps'), dps)}
      </div>
      <div class="muted">${maxed ? t('col.maxLevel') : t('col.cards', { have: cs.count, need }) + ' · ' + t('col.gold', { n: goldCost })}</div>
      <div class="error" id="cerr"></div>
      <button id="up" class="accent" ${canUp ? '' : 'disabled'}>${maxed ? t('col.maxLevel') : t('col.upgrade')}</button>
    </div>`;
  document.getElementById('ui')!.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector<HTMLButtonElement>('#x')!.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const up = overlay.querySelector<HTMLButtonElement>('#up')!;
  if (canUp) {
    up.onclick = async () => {
      up.disabled = true;
      try {
        state.profile = (await api.upgradeCard(id)).profile;
        haptic('success');
        close();
        void renderCollection(nav); // refresh the grid
      } catch (err) {
        overlay.querySelector<HTMLDivElement>('#cerr')!.textContent = (err as Error).message;
        up.disabled = false;
        haptic('error');
      }
    };
  }
}

// --- Clans ---
export async function renderClans(nav: Nav): Promise<void> {
  setGameVisible(false);
  const node = div('screen');
  node.innerHTML = `<div class="row space-between"><h1>${t('clans.title')}</h1><button id="back" class="secondary">${t('common.back')}</button></div><div id="body" class="col">${t('common.loading')}</div>`;
  setUI(node, { screen: 'clans' });
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();
  const body = node.querySelector<HTMLDivElement>('#body')!;

  try {
    state.profile = (await api.me()).profile;
  } catch { /* keep cached */ }

  if (state.profile?.clanId) {
    await renderClanDetail(nav, body, state.profile.clanId);
  } else {
    await renderClanBrowser(nav, body);
  }
}

async function renderClanBrowser(nav: Nav, body: HTMLDivElement): Promise<void> {
  const { clans } = await api.listClans();
  body.innerHTML = `
    <div class="card col">
      <h2>${t('clans.createTitle')}</h2>
      <div class="muted">${t('clans.createHint')}</div>
      <input id="cname" type="text" placeholder="Война 龙 🐉" />
      <div class="error" id="cerr"></div>
      <button id="create" class="accent">${t('clans.createBtn')}</button>
    </div>
    <h2>${t('clans.open')}</h2>
    <div id="list" class="col"></div>
  `;
  const list = body.querySelector<HTMLDivElement>('#list')!;
  if (clans.length === 0) list.innerHTML = `<div class="muted">${t('clans.none')}</div>`;
  for (const c of clans) {
    const item = div('list-item');
    const full = c.memberCount >= 20;
    item.innerHTML = `<div><b>${escapeHtml(c.name)}</b><div class="muted">${t('clans.members', { n: c.memberCount })}</div></div>`;
    const btn = document.createElement('button');
    btn.textContent = full ? t('clans.full') : t('clans.join');
    btn.disabled = full;
    btn.onclick = async () => {
      try { await api.joinClan(c.id); haptic('success'); nav.toClans(); }
      catch (e) { toast((e as Error).message, 'error'); }
    };
    item.appendChild(btn);
    list.appendChild(item);
  }

  const cname = body.querySelector<HTMLInputElement>('#cname')!;
  const cerr = body.querySelector<HTMLDivElement>('#cerr')!;
  body.querySelector<HTMLButtonElement>('#create')!.onclick = async () => {
    cerr.textContent = '';
    try { await api.createClan(cname.value.trim()); haptic('success'); nav.toClans(); }
    catch (e) { cerr.textContent = (e as Error).message; haptic('error'); }
  };
}

async function renderClanDetail(nav: Nav, body: HTMLDivElement, clanId: string): Promise<void> {
  const { clan } = await api.getClan(clanId);
  const me = state.profile!;
  const isLeader = clan.leaderId === me.id;
  body.innerHTML = `
    <div class="card col">
      <div class="row space-between">
        <h2>${escapeHtml(clan.name)}</h2>
        <span class="badge">${clan.members.length}/20</span>
      </div>
      <button id="boss" class="accent">${t('clans.raidBoss')}</button>
      <div class="muted">${t('clans.bossTip')}</div>
    </div>
    <h2>${t('clans.membersTitle')}</h2>
    <div id="members" class="col"></div>
    <button id="leave" class="danger">${t('clans.leave')}</button>
  `;
  const members = body.querySelector<HTMLDivElement>('#members')!;
  for (const m of clan.members) {
    const item = div('list-item');
    const roleTag = m.role === 'leader' ? ' 👑' : m.role === 'elder' ? ' ⭐' : '';
    item.innerHTML = `<div><b>${escapeHtml(m.nickname)}${roleTag}</b><div class="muted">${m.trophies} 🏆</div></div>`;
    if (isLeader && m.userId !== me.id) {
      const kick = document.createElement('button');
      kick.className = 'danger';
      kick.textContent = t('clans.kick');
      kick.onclick = async () => {
        try { await api.kick(clan.id, m.userId); nav.toClans(); }
        catch (e) { toast((e as Error).message, 'error'); }
      };
      item.appendChild(kick);
    }
    members.appendChild(item);
  }

  body.querySelector<HTMLButtonElement>('#boss')!.onclick = () => nav.toBoss(clan.id);
  body.querySelector<HTMLButtonElement>('#leave')!.onclick = async () => {
    try { await api.leaveClan(); haptic('light'); nav.toClans(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };
}
