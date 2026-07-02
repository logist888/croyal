/**
 * App bootstrap + screen router for the Tower Clash Telegram Mini App.
 */
import { api } from './net';
import { state } from './state';
import { initTelegram, getInitData, getDevUser, suggestedLanguage } from './telegram';
import { renderRegister, renderMenu, renderClans, renderCollection, setUI, logoHtml, type Nav } from './ui';
import { startBattle } from './battle';
import { startBoss } from './boss';
import { t, setLang, type Lang } from './i18n';
import { loadAssetManifest, menuBgUrl } from './assets';

const nav: Nav = {
  toMenu: () => renderMenu(nav),
  toRegister: (opts) => renderRegister(nav, opts),
  toClans: () => { void renderClans(nav); },
  toBattle: () => { void startBattle(nav); },
  toBoss: (clanId) => { void startBoss(nav, clanId); },
  toCollection: () => { void renderCollection(nav); },
};

function loading(text: string) {
  const node = document.createElement('div');
  node.className = 'screen';
  node.innerHTML = `${logoHtml()}<div class="card"><div class="muted">${text}</div></div>`;
  setUI(node);
}

async function boot() {
  initTelegram();
  loading(t('common.connecting'));
  await loadAssetManifest();

  const bg = menuBgUrl();
  if (bg) {
    document.body.style.background =
      `linear-gradient(rgba(8,16,10,0.84), rgba(8,16,10,0.93)), url("${bg}") center top / cover fixed`;
  }

  const initData = getInitData();
  const devUser = initData ? undefined : getDevUser();

  try {
    const res = await api.auth({ initData, devUser });
    if (res.mode) state.mode = res.mode;
    if (res.registered && res.token && res.profile) {
      state.token = res.token;
      state.profile = res.profile;
      setLang(res.profile.language as Lang);
      nav.toMenu();
    } else {
      // No account yet — default the registration screen to the device language.
      setLang(suggestedLanguage());
      nav.toRegister({ telegramId: res.telegramId ?? devUser?.id, suggested: res.suggestedNickname });
    }
  } catch (e) {
    loading(t('common.serverUnreachable', { msg: (e as Error).message }));
  }
}

void boot();
