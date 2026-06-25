/**
 * App bootstrap + screen router for the Tower Clash Telegram Mini App.
 */
import { api } from './net';
import { state } from './state';
import { initTelegram, getInitData, getDevUser } from './telegram';
import { renderRegister, renderMenu, renderClans, setUI, type Nav } from './ui';
import { startBattle } from './battle';
import { startBoss } from './boss';

const nav: Nav = {
  toMenu: () => renderMenu(nav),
  toRegister: (opts) => renderRegister(nav, opts),
  toClans: () => { void renderClans(nav); },
  toBattle: () => { void startBattle(nav); },
  toBoss: (clanId) => { void startBoss(nav, clanId); },
};

function loading(text: string) {
  const node = document.createElement('div');
  node.className = 'screen';
  node.innerHTML = `<h1>Tower Clash</h1><div class="card"><div class="muted">${text}</div></div>`;
  setUI(node);
}

async function boot() {
  initTelegram();
  loading('Connecting…');

  const initData = getInitData();
  const devUser = initData ? undefined : getDevUser();

  try {
    const res = await api.auth({ initData, devUser });
    if (res.registered && res.token && res.profile) {
      state.token = res.token;
      state.profile = res.profile;
      nav.toMenu();
    } else {
      nav.toRegister({ telegramId: res.telegramId ?? devUser?.id, suggested: res.suggestedNickname });
    }
  } catch (e) {
    loading(`Cannot reach server: ${(e as Error).message}. Is the backend running on :3001?`);
  }
}

void boot();
