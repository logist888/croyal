/**
 * Onboarding: open the starter boxes, then assemble the first battle trio.
 * Presentational only — the server reveals STARTER_POOL characters in order
 * and the duplicate/upgrade economy is untouched.
 */
import { STARTER_BOX_COUNT, STARTER_POOL, getCard, RARITY_COLOR } from '@croyal/shared';
import { api } from './net';
import { state } from './state';
import { setUI, setGameVisible, escapeHtml, hex, logoHtml, renderTrioPicker, type Nav } from './ui';
import { haptic } from './telegram';
import { t, cardName } from './i18n';
import { cardImageUrl } from './assets';

export function needsOnboarding(): boolean {
  return state.mode.economy === 'cooldown'
    && (state.profile?.starterBoxesOpened ?? STARTER_BOX_COUNT) < STARTER_BOX_COUNT;
}

export function renderOnboarding(nav: Nav): void {
  setGameVisible(false);
  const p = state.profile!;

  const node = document.createElement('div');
  node.className = 'screen';
  node.innerHTML = `
    ${logoHtml(true)}
    <h1>${t('onboard.title')}</h1>
    <div class="muted">${t('onboard.sub', { n: STARTER_BOX_COUNT })}</div>
    <div class="starter-grid" id="boxes"></div>
    <button id="assemble" class="accent" style="display:none">${t('onboard.assemble')}</button>
  `;
  setUI(node);

  const grid = node.querySelector<HTMLDivElement>('#boxes')!;
  const assemble = node.querySelector<HTMLButtonElement>('#assemble')!;

  function cardFace(cardId: string): string {
    const c = getCard(cardId)!;
    const art = cardImageUrl(cardId);
    const bg = art
      ? `background-image:url(${art});background-size:contain;background-repeat:no-repeat;background-position:center`
      : `background:${hex(c.color)}`;
    return `<div class="starter-card revealed" style="${bg};border-color:${hex(RARITY_COLOR[c.rarity])}">
      ${art ? '' : `<span>${escapeHtml(cardName(cardId))}</span>`}
    </div>`;
  }

  function render(): void {
    const opened = state.profile!.starterBoxesOpened;
    grid.innerHTML = '';
    for (let i = 0; i < STARTER_BOX_COUNT; i++) {
      const cell = document.createElement('div');
      if (i < opened) {
        cell.className = 'starter-cell';
        cell.innerHTML = cardFace(STARTER_POOL[Math.min(i, STARTER_POOL.length - 1)]);
      } else {
        const isNext = i === opened;
        cell.className = 'starter-cell' + (isNext ? ' next' : ' locked');
        cell.innerHTML = `<div class="starter-box">🎁</div>`;
        if (isNext) {
          cell.onclick = async () => {
            cell.onclick = null;
            try {
              const res = await api.openStarterBox();
              state.profile = res.profile;
              haptic('success');
              render();
            } catch {
              haptic('error');
              render();
            }
          };
        }
      }
      grid.appendChild(cell);
    }
    if (opened >= STARTER_BOX_COUNT) assemble.style.display = '';
  }
  render();

  assemble.onclick = () => {
    haptic('light');
    void renderTrioPicker(nav, {
      pool: STARTER_POOL,
      onSaved: () => nav.toMenu(),
      onBack: () => renderOnboarding(nav),
    });
  };

  // Already done (e.g. re-entry) — jump straight to the picker button state.
  if (p.starterBoxesOpened >= STARTER_BOX_COUNT) assemble.style.display = '';
}
