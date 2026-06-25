/**
 * DOM screens: registration, main menu, clans. Battle/boss rendering lives in
 * battle.ts / boss.ts (Phaser canvas + HUD).
 */
import { getCard } from '@croyal/shared';
import { api } from './net';
import { state } from './state';
import { haptic } from './telegram';

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

// --- Registration (nickname is permanent!) ---
export function renderRegister(nav: Nav, opts: { telegramId?: number; suggested?: string }): void {
  setGameVisible(false);
  let language: 'en' | 'ru' = 'en';

  const node = div('screen');
  node.innerHTML = `
    <h1>Tower Clash</h1>
    <div class="card col">
      <h2>Create your account</h2>
      <label class="muted">Nickname (English letters, digits, "_" — 3-16 chars)</label>
      <input id="nick" type="text" placeholder="Knight_99" value="${escapeHtml(opts.suggested ?? '')}" autocomplete="off" />
      <div class="muted">No emoji, no spaces, English only.</div>

      <label class="muted">Language</label>
      <div class="row lang-pick">
        <button id="lang-en" class="secondary active">English</button>
        <button id="lang-ru" class="secondary">Русский</button>
      </div>

      <div class="warn">
        ⚠️ Your nickname is chosen <b>FOREVER</b>. It can <b>NEVER</b> be changed later.<br/>
        <span class="muted">Ник выбирается НАВСЕГДА — изменить его в дальнейшем будет нельзя.</span>
      </div>
      <label class="row" style="gap:8px">
        <input id="confirm" type="checkbox" />
        <span>I understand my nickname is permanent.</span>
      </label>

      <div class="error" id="err"></div>
      <button id="submit" class="accent" disabled>Create account</button>
    </div>
  `;
  setUI(node);

  const nick = node.querySelector<HTMLInputElement>('#nick')!;
  const confirm = node.querySelector<HTMLInputElement>('#confirm')!;
  const submit = node.querySelector<HTMLButtonElement>('#submit')!;
  const err = node.querySelector<HTMLDivElement>('#err')!;
  const langEn = node.querySelector<HTMLButtonElement>('#lang-en')!;
  const langRu = node.querySelector<HTMLButtonElement>('#lang-ru')!;

  const pickLang = (l: 'en' | 'ru') => {
    language = l;
    langEn.classList.toggle('active', l === 'en');
    langRu.classList.toggle('active', l === 'ru');
  };
  langEn.onclick = () => pickLang('en');
  langRu.onclick = () => pickLang('ru');
  confirm.onchange = () => { submit.disabled = !confirm.checked; };

  submit.onclick = async () => {
    err.textContent = '';
    submit.disabled = true;
    try {
      const { token, profile } = await api.register({
        nickname: nick.value.trim(),
        language,
        devUser: opts.telegramId ? { id: opts.telegramId } : undefined,
        initData: getInitDataMaybe(),
      });
      state.token = token;
      state.profile = profile;
      haptic('success');
      nav.toMenu();
    } catch (e) {
      err.textContent = (e as Error).message;
      submit.disabled = false;
      haptic('error');
    }
  };
}

function getInitDataMaybe(): string | undefined {
  // re-read Telegram initData at submit time (kept here to avoid a circular import)
  return window.Telegram?.WebApp?.initData || undefined;
}

// --- Main menu ---
export function renderMenu(nav: Nav): void {
  setGameVisible(false);
  const p = state.profile!;
  const node = div('screen');
  node.innerHTML = `
    <div class="row space-between">
      <h1>Hi, ${escapeHtml(p.nickname)}</h1>
    </div>
    <div class="card row space-between">
      <div class="stat"><b>${p.trophies}</b><span class="muted">Trophies</span></div>
      <div class="stat"><b>${p.wins}</b><span class="muted">Wins</span></div>
      <div class="stat"><b>${p.losses}</b><span class="muted">Losses</span></div>
      <div class="stat"><b>${p.gold}</b><span class="muted">Gold</span></div>
    </div>
    <button id="battle" class="accent">⚔️ Battle (1v1)</button>
    <button id="clans" class="secondary">🛡️ Clans</button>
    <div class="card">
      <div class="muted">Your deck</div>
      <div class="hand" id="deck"></div>
    </div>
  `;
  setUI(node);

  const deck = node.querySelector<HTMLDivElement>('#deck')!;
  for (const id of p.deck) {
    const c = getCard(id)!;
    const cell = div('handcard');
    cell.style.background = hex(c.color);
    cell.innerHTML = `${escapeHtml(c.name)}<div class="cost">${c.cost}</div>`;
    deck.appendChild(cell);
  }

  node.querySelector<HTMLButtonElement>('#battle')!.onclick = () => { haptic('light'); nav.toBattle(); };
  node.querySelector<HTMLButtonElement>('#clans')!.onclick = () => { haptic('light'); nav.toClans(); };
}

// --- Clans ---
export async function renderClans(nav: Nav): Promise<void> {
  setGameVisible(false);
  const node = div('screen');
  node.innerHTML = `<div class="row space-between"><h1>Clans</h1><button id="back" class="secondary">Back</button></div><div id="body" class="col">Loading…</div>`;
  setUI(node);
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();
  const body = node.querySelector<HTMLDivElement>('#body')!;

  // refresh profile to know clan membership
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
      <h2>Create a clan</h2>
      <div class="muted">Clan name can be in ANY language (up to 24 chars).</div>
      <input id="cname" type="text" placeholder="Война 龙 🐉" />
      <div class="error" id="cerr"></div>
      <button id="create" class="accent">Create clan (max 20 members)</button>
    </div>
    <h2>Open clans</h2>
    <div id="list" class="col"></div>
  `;
  const list = body.querySelector<HTMLDivElement>('#list')!;
  if (clans.length === 0) list.innerHTML = `<div class="muted">No clans yet — be the first!</div>`;
  for (const c of clans) {
    const item = div('list-item');
    const full = c.memberCount >= 20;
    item.innerHTML = `<div><b>${escapeHtml(c.name)}</b><div class="muted">${c.memberCount}/20 members</div></div>`;
    const btn = document.createElement('button');
    btn.textContent = full ? 'Full' : 'Join';
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
      <button id="boss" class="accent">🐉 Raid Clan Boss (co-op ×2)</button>
      <div class="muted">Tip: 2+ clanmates raiding at once doubles the boss difficulty.</div>
    </div>
    <h2>Members</h2>
    <div id="members" class="col"></div>
    <button id="leave" class="danger">Leave clan</button>
  `;
  const members = body.querySelector<HTMLDivElement>('#members')!;
  for (const m of clan.members) {
    const item = div('list-item');
    const roleTag = m.role === 'leader' ? ' 👑' : m.role === 'elder' ? ' ⭐' : '';
    item.innerHTML = `<div><b>${escapeHtml(m.nickname)}${roleTag}</b><div class="muted">${m.trophies} 🏆</div></div>`;
    if (isLeader && m.userId !== me.id) {
      const kick = document.createElement('button');
      kick.className = 'danger';
      kick.textContent = 'Kick';
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
