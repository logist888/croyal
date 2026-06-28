/**
 * DOM screens: registration, main menu, clans. Battle/boss rendering lives in
 * battle.ts / boss.ts (Phaser canvas + HUD). All visible text goes through i18n.
 */
import {
  getCard, NICKNAME_REGEX, NICKNAME_MIN, NICKNAME_MAX,
  leagueForTrophies, accountLevel, averageElixir, RARITY_COLOR, LEAGUES,
} from '@croyal/shared';
import { api } from './net';
import { state } from './state';
import { haptic } from './telegram';
import { t, setLang, getLang, cardName, type Lang } from './i18n';
import { cardImageUrl } from './assets';

export interface Nav {
  toMenu(): void;
  toRegister(opts: { telegramId?: number; suggested?: string }): void;
  toClans(): void;
  toBattle(): void;
  toBoss(clanId: string): void;
}

const uiRoot = () => document.getElementById('ui')!;
const gameRoot = () => document.getElementById('game')!;

export function setUI(node: HTMLElement): void {
  const ui = uiRoot();
  ui.innerHTML = '';
  ui.appendChild(node);
}
export function setGameVisible(visible: boolean): void {
  gameRoot().classList.toggle('hidden', !visible);
}

function div(cls: string, html = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}
export function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/**
 * Logo markup. Uses /logo.png if the operator dropped one into client/public,
 * otherwise falls back to the bundled placeholder crest /logo.svg.
 */
export function logoHtml(small = false): string {
  return `<img class="logo${small ? ' logo-sm' : ''}" src="/logo.png" alt="Tower Clash"
    onerror="this.onerror=null;this.src='/logo.svg'">`;
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
  setUI(node);

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
      const { token, profile } = await api.register({
        nickname: name,
        language: getLang(),
        devUser: opts.telegramId ? { id: opts.telegramId } : undefined,
        initData: window.Telegram?.WebApp?.initData || undefined,
      });
      state.token = token;
      state.profile = profile;
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
  const lvl = accountLevel(p.wins);
  const { index, league, nextMin } = leagueForTrophies(p.trophies);
  const leagueName = lang === 'ru' ? league.ru : league.en;
  const nextLeague = LEAGUES[index + 1];
  const nextName = nextLeague ? (lang === 'ru' ? nextLeague.ru : nextLeague.en) : '';
  const pct = nextMin !== null
    ? Math.min(100, Math.max(0, ((p.trophies - league.min) / (nextMin - league.min)) * 100))
    : 100;
  const avg = averageElixir(p.deck);

  const node = div('screen');
  node.innerHTML = `
    <div class="topbar">
      <div class="player">
        <img class="avatar" src="/logo.png" alt="" onerror="this.onerror=null;this.src='/logo.svg'">
        <div class="pinfo">
          <div class="pname">${escapeHtml(p.nickname)}</div>
          <div class="plvl">${t('menu.level', { n: lvl })}</div>
        </div>
      </div>
      <div class="currencies">
        <span class="cur">🏆 ${p.trophies}</span>
        <span class="cur">🪙 ${p.gold}</span>
        <span class="cur">💎 ${p.gems}</span>
      </div>
    </div>

    <div class="league card">
      <div class="row space-between">
        <b>🏟 ${escapeHtml(leagueName)}</b>
        <span class="muted">${p.wins}W / ${p.losses}L</span>
      </div>
      <div class="league-bar"><div class="league-fill" style="width:${pct}%"></div></div>
      <div class="muted">${nextMin !== null
        ? t('menu.toNext', { n: Math.max(0, nextMin - p.trophies), name: nextName })
        : t('menu.topLeague')}</div>
    </div>

    <button id="battle" class="accent big-battle">${t('menu.battle')}</button>
    <button id="clans" class="secondary">${t('menu.clans')}</button>

    <div class="card">
      <div class="row space-between">
        <div class="muted">${t('menu.yourDeck')}</div>
        <div class="muted">${t('menu.avgElixir', { v: avg })}</div>
      </div>
      <div class="hand" id="deck"></div>
    </div>
  `;
  setUI(node);

  const deck = node.querySelector<HTMLDivElement>('#deck')!;
  for (const id of p.deck) {
    const c = getCard(id)!;
    const cell = div('handcard');
    const art = cardImageUrl(id);
    if (art) {
      cell.className = 'handcard has-art';
      cell.style.backgroundImage = `url(${art})`;
    } else {
      cell.style.background = hex(c.color);
      cell.innerHTML = `${escapeHtml(cardName(id))}<div class="cost">${c.cost}</div>`;
    }
    cell.style.border = `2px solid ${hex(RARITY_COLOR[c.rarity])}`;
    deck.appendChild(cell);
  }

  node.querySelector<HTMLButtonElement>('#battle')!.onclick = () => { haptic('light'); nav.toBattle(); };
  node.querySelector<HTMLButtonElement>('#clans')!.onclick = () => { haptic('light'); nav.toClans(); };
}

// --- Clans ---
export async function renderClans(nav: Nav): Promise<void> {
  setGameVisible(false);
  const node = div('screen');
  node.innerHTML = `<div class="row space-between"><h1>${t('clans.title')}</h1><button id="back" class="secondary">${t('common.back')}</button></div><div id="body" class="col">${t('common.loading')}</div>`;
  setUI(node);
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
      catch (e) { alert((e as Error).message); }
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
        catch (e) { alert((e as Error).message); }
      };
      item.appendChild(kick);
    }
    members.appendChild(item);
  }

  body.querySelector<HTMLButtonElement>('#boss')!.onclick = () => nav.toBoss(clan.id);
  body.querySelector<HTMLButtonElement>('#leave')!.onclick = async () => {
    try { await api.leaveClan(); haptic('light'); nav.toClans(); }
    catch (e) { alert((e as Error).message); }
  };
}
