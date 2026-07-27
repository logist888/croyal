/**
 * App bootstrap + screen router for the Tower Clash Telegram Mini App.
 */
import { api } from './net';
import { state, setProfile } from './state';
import { initTelegram, getInitData, getDevUser, suggestedLanguage } from './telegram';
import { renderRegister, renderMenu, renderClans, renderCollection, renderTrioPicker, renderDaily, renderLeaderboard, renderFriendly, renderWar, renderShop, renderBattlePass, renderEvents, setUI, logoHtml, installProfileSync, type Nav } from './ui';
import { renderOnboarding, needsOnboarding } from './onboarding';
import { startTournament } from './tournament';
import { t, setLang, type Lang } from './i18n';
import { loadAssetManifest, menuBgUrl, uiImageUrl, arenaImageUrl } from './assets';
import { applyRarityTokens } from './ui/tokens';
import { setIconResolver } from './ui/primitives';
import { startPerfOverlay } from './dev/perf';
import { mountShell } from './ui/shell';
import { detectTier } from './ui/device';

// Phaser (~1.6 MB) lives behind these three modules. Importing them lazily keeps
// it out of the entry bundle so the register/menu screen paints immediately;
// the chunk is prefetched while the player sits in the hub (see prefetchArena).
const lazyBattle = () => import('./battle');
const lazyBoss = () => import('./boss');
const lazyReplay = () => import('./replay');

/** Run a lazily-imported screen, showing a placeholder while its chunk loads. */
function lazy<T>(load: () => Promise<T>, run: (mod: T) => unknown): void {
  let settled = false;
  // Only show the loading card if the chunk isn't already warm — otherwise a
  // cached import flashes the placeholder for one frame.
  const timer = setTimeout(() => { if (!settled) loading(t('common.loading')); }, 80);
  void load().then((mod) => { settled = true; clearTimeout(timer); run(mod); })
    .catch(() => { settled = true; clearTimeout(timer); loading(t('common.serverUnreachable', { msg: 'chunk' })); });
}

/** Warm the battle chunk while the player idles in the hub (import() is cached). */
let prefetched = false;
function prefetchArena(): void {
  if (prefetched) return;
  prefetched = true;
  const go = () => { void lazyBattle(); };
  if ('requestIdleCallback' in window) (window as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(go);
  else setTimeout(go, 1200);
}

const nav: Nav = {
  // Every "go home" routes through the onboarding gate until the starter
  // boxes are opened and the first trio saved.
  toMenu: () => {
    if (needsOnboarding()) return renderOnboarding(nav);
    renderMenu(nav);
    prefetchArena();
  },
  toRegister: (opts) => renderRegister(nav, opts),
  toClans: () => { void renderClans(nav); },
  toBattle: () => lazy(lazyBattle, (m) => m.startBattle(nav)),
  toBoss: (clanId) => lazy(lazyBoss, (m) => m.startBoss(nav, clanId)),
  toCollection: () => { void renderCollection(nav); },
  toTrio: () => { void renderTrioPicker(nav); },
  toDaily: () => { void renderDaily(nav); },
  toLeaderboard: () => { void renderLeaderboard(nav); },
  toFriendly: () => renderFriendly(nav),
  toFriendlyHost: () => lazy(lazyBattle, (m) => m.startBattle(nav, { kind: 'friendly-host' })),
  toFriendlyGuest: (code) => lazy(lazyBattle, (m) => m.startBattle(nav, { kind: 'friendly-guest', code })),
  toReplay: () => lazy(lazyReplay, (m) => m.startReplay(nav)),
  toTournament: () => { void startTournament(nav); },
  toTournamentMatch: () => lazy(lazyBattle, (m) => m.startBattle(nav, { kind: 'tournament' }, () => nav.toTournament())),
  toWar: () => { void renderWar(nav); },
  toShop: () => { void renderShop(nav); },
  toBattlePass: () => { void renderBattlePass(nav); },
  toEvents: () => renderEvents(nav),
};

function loading(text: string) {
  const node = document.createElement('div');
  node.className = 'screen';
  node.innerHTML = `${logoHtml()}<div class="card"><div class="muted">${text}</div></div>`;
  setUI(node, { screen: 'loading' });
}

async function boot() {
  initTelegram();
  applyRarityTokens(); // --rarity-* comes from the shared catalog, not from CSS
  detectTier();        // sets html.low-end, which the glass fallback keys off
  startPerfOverlay(); // no-op unless ?fps=1
  // The bar is a sibling of #ui, not a child — see ui/shell.ts for why.
  mountShell(nav);
  installProfileSync();
  loading(t('common.connecting'));
  await loadAssetManifest();
  // Icons resolve through assets.ts once the manifest is in; until then (and for
  // any icon with no art yet) Icon() falls back to the emoji the UI used before.
  setIconResolver(uiImageUrl);

  // hub_bg is a 3/4 castle diorama and is the app's ground; menu-bg (a green
  // battlefield) is the fallback. The old scrim of .84 -> .93 buried whichever
  // was used entirely. At .52 -> .88 the castle silhouette reads around the
  // plates, which is what gives the slate chrome something to sit on.
  const bg = arenaImageUrl('hub_bg') ?? menuBgUrl();
  if (bg) {
    document.body.style.background =
      `linear-gradient(rgba(6,16,20,0.52), rgba(6,16,20,0.88)), url("${bg}") center top / cover fixed`;
  }

  const initData = getInitData();
  const devUser = initData ? undefined : getDevUser();

  try {
    const res = await api.auth({ initData, devUser });
    if (res.mode) state.mode = res.mode;
    if (res.registered && res.token && res.profile) {
      state.token = res.token;
      setProfile(res.profile);
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
