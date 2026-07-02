/**
 * DOM screens: registration, main menu, clans. Battle/boss rendering lives in
 * battle.ts / boss.ts (Phaser canvas + HUD). All visible text goes through i18n.
 */
import {
  getCard, NICKNAME_REGEX, NICKNAME_MIN, NICKNAME_MAX,
  leagueForTrophies, levelFromXp, averageElixir, averageCooldown, RARITY_COLOR, LEAGUES,
  MAX_CARD_LEVEL, cardsToUpgrade, goldToUpgrade, scaledStats, TRIO_SIZE, ALL_CARD_IDS,
  pairFor,
} from '@croyal/shared';
import { api } from './net';
import { state } from './state';
import { haptic } from './telegram';
import { t, setLang, getLang, cardName, rarityText, roleText, type Lang } from './i18n';
import { cardImageUrl, asset } from './assets';

export interface Nav {
  toMenu(): void;
  toRegister(opts: { telegramId?: number; suggested?: string }): void;
  toClans(): void;
  toBattle(): void;
  toBoss(clanId: string): void;
  toCollection(): void;
  toTrio(): void;
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
  `;
  setUI(node);

  const deck = node.querySelector<HTMLDivElement>('#deck')!;
  for (const id of cooldownMode ? p.trio : p.deck) {
    const c = getCard(id)!;
    const cell = div('handcard');
    const art = cardImageUrl(id);
    if (art) {
      cell.className = 'handcard has-art';
      cell.style.backgroundImage = `url(${art})`;
    } else {
      cell.style.background = hex(c.color);
      cell.innerHTML = cooldownMode
        ? `${escapeHtml(cardName(id))}<div class="cost cost-cd">${c.cooldownSec}s</div>`
        : `${escapeHtml(cardName(id))}<div class="cost">${c.cost}</div>`;
    }
    cell.style.border = `2px solid ${hex(RARITY_COLOR[c.rarity])}`;
    deck.appendChild(cell);
  }

  node.querySelector<HTMLButtonElement>('#battle')!.onclick = () => { haptic('light'); nav.toBattle(); };
  node.querySelector<HTMLButtonElement>('#cards')!.onclick = () => { haptic('light'); nav.toCollection(); };
  node.querySelector<HTMLButtonElement>('#clans')!.onclick = () => { haptic('light'); nav.toClans(); };
  node.querySelector<HTMLButtonElement>('#edit-trio')?.addEventListener('click', () => { haptic('light'); nav.toTrio(); });
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
  const selected = new Set<string>(p.trio.filter((id) => ids.includes(id)));

  const node = div('screen');
  node.innerHTML = `
    <div class="row space-between">
      <h1>${t('trio.title')}</h1>
      <button id="back" class="secondary">${t('common.back')}</button>
    </div>
    <div class="muted">${t('trio.hint')}</div>
    <div class="collection" id="grid"></div>
    <div class="pair-hint muted" id="pair-hint"></div>
    <div class="error" id="err"></div>
    <button id="save" class="accent">${t('trio.save')} (${selected.size}/${TRIO_SIZE})</button>
  `;
  setUI(node);
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
    const cell = div('col-card trio-pick');
    cell.style.borderColor = hex(RARITY_COLOR[c.rarity]);
    const art = cardImageUrl(id);
    const bg = art
      ? `background-image:url(${art});background-size:contain;background-repeat:no-repeat;background-position:center top`
      : `background:${hex(c.color)}`;
    cell.innerHTML = `
      <div class="col-art" style="${bg}">${art ? '' : escapeHtml(cardName(id))}<span class="col-cost">${c.cooldownSec}s</span></div>
      <div class="col-lvl">${t('col.level', { n: cs.level })}</div>
      <span class="pair-badge" style="display:none">${t('pairs.badge')}</span>`;
    cell.classList.toggle('picked', selected.has(id));
    cell.onclick = () => {
      if (selected.has(id)) {
        selected.delete(id);
      } else {
        if (selected.size >= TRIO_SIZE) return;
        selected.add(id);
      }
      cell.classList.toggle('picked', selected.has(id));
      haptic('light');
      refreshSave();
    };
    cells.set(id, cell);
    grid.appendChild(cell);
  }
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
    <div class="collection" id="grid"></div>
  `;
  setUI(node);
  node.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();

  const grid = node.querySelector<HTMLDivElement>('#grid')!;
  for (const id of p.deck.concat(Object.keys(p.cards).filter((c) => !p.deck.includes(c)))) {
    const c = getCard(id);
    const cs = p.cards[id];
    if (!c || !cs) continue;
    const need = cardsToUpgrade(cs.level);
    const ready = cs.level < MAX_CARD_LEVEL && cs.count >= need && p.gold >= goldToUpgrade(cs.level);
    const cell = div('col-card');
    cell.style.borderColor = hex(RARITY_COLOR[c.rarity]);
    const art = cardImageUrl(id);
    const bg = art
      ? `background-image:url(${art});background-size:contain;background-repeat:no-repeat;background-position:center top`
      : `background:${hex(c.color)}`;
    cell.innerHTML = `
      <div class="col-art" style="${bg}">${art ? '' : escapeHtml(cardName(id))}<span class="col-cost">${c.cost}</span></div>
      <div class="col-lvl">${t('col.level', { n: cs.level })}${ready ? ' <span class="up-dot">⬆</span>' : ''}</div>
      <div class="col-bar"><div class="col-fill" style="width:${Math.min(100, (cs.count / (need === Infinity ? cs.count || 1 : need)) * 100)}%"></div></div>
      <div class="muted col-count">${cs.level >= MAX_CARD_LEVEL ? t('col.maxLevel') : t('col.cards', { have: cs.count, need })}</div>`;
    cell.onclick = () => openCardDetail(nav, id);
    grid.appendChild(cell);
  }
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
        <span class="badge">💧 ${c.cost}</span>
        <span class="badge">${t('col.level', { n: cs.level })}</span>
      </div>
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
