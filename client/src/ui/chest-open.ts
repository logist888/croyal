/**
 * The chest-opening sequence.
 *
 * This is the payoff for every chest timer, every battle win and every gem
 * spend — the single most important moment in the game's economy — and it used
 * to be a static div that simply appeared with the loot already listed.
 *
 * The beats, in order: the chest drops in and lands, shakes with decaying
 * amplitude while the screen darkens, bursts in a white flash, then the cards
 * fly out one at a time along an arc and land with a rarity-coloured ring.
 * Legendaries slow the whole thing down and add a gold shower.
 *
 * The sequence is skippable at any point — a player opening their tenth chest
 * of the day should not be held hostage by it.
 */
import { getCard, type Rarity } from '@croyal/shared';
import { escapeHtml } from '../html';
import { haptic } from '../telegram';
import { t } from '../i18n';
import { animate, fx, prefersReducedMotion, EASE_OUT } from './motion';
import { cardTileHtml } from './card-tile';
import { Icon } from './primitives';

export interface ChestRewards {
  gold: number;
  cards: Record<string, number>;
}

const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Best rarity in the haul — it sets the pacing and whether gold rains. */
function topRarity(cards: Record<string, number>): Rarity {
  let best: Rarity = 'common';
  for (const id of Object.keys(cards)) {
    const r = getCard(id)?.rarity;
    if (r && RARITY_ORDER.indexOf(r) > RARITY_ORDER.indexOf(best)) best = r;
  }
  return best;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Play the sequence. Resolves once the player dismisses it.
 * `chestArt` may be undefined — the loot still reveals, just without a chest.
 */
export function openChestSequence(opts: {
  rarityLabel: string;
  chestArt?: string;
  rewards: ChestRewards;
  mount: HTMLElement;
}): Promise<void> {
  const { rarityLabel, chestArt, rewards, mount } = opts;
  const legendary = topRarity(rewards.cards) === 'legendary';
  // A legendary haul gets a slower, heavier build-up.
  const pace = legendary ? 1.6 : 1;

  const overlay = document.createElement('div');
  overlay.className = 'chest-seq';
  overlay.innerHTML = `
    <div class="chest-seq-veil"></div>
    <div class="chest-seq-flash"></div>
    <div class="chest-seq-stage">
      ${chestArt ? `<div class="chest-seq-box" style="background-image:url(${chestArt})"></div>` : ''}
      <h2 class="chest-seq-title">${escapeHtml(rarityLabel)}</h2>
    </div>
    <div class="chest-seq-loot">
      <div class="chest-seq-cards"></div>
      <div class="chest-seq-gold">${Icon('gold', 20)} <b>0</b></div>
    </div>
    <button class="chest-seq-done accent">${escapeHtml(t('common.back'))}</button>
    <div class="chest-seq-skip">${escapeHtml(t('chest.tapToSkip'))}</div>`;
  mount.appendChild(overlay);

  const veil = overlay.querySelector<HTMLElement>('.chest-seq-veil')!;
  const flash = overlay.querySelector<HTMLElement>('.chest-seq-flash')!;
  const box = overlay.querySelector<HTMLElement>('.chest-seq-box');
  const title = overlay.querySelector<HTMLElement>('.chest-seq-title')!;
  const lootRow = overlay.querySelector<HTMLElement>('.chest-seq-cards')!;
  const goldRow = overlay.querySelector<HTMLElement>('.chest-seq-gold')!;
  const goldNum = goldRow.querySelector('b') as HTMLElement;
  const doneBtn = overlay.querySelector<HTMLButtonElement>('.chest-seq-done')!;
  const skipHint = overlay.querySelector<HTMLElement>('.chest-seq-skip')!;

  let skipped = false;
  let settle!: () => void;
  const closed = new Promise<void>((res) => { settle = res; });

  const finish = () => {
    overlay.remove();
    settle();
  };

  /** Jump straight to the end state: everything visible, nothing animating. */
  const revealAll = () => {
    skipped = true;
    skipHint.style.display = 'none';
    overlay.classList.add('is-open');
    if (box) box.style.display = 'none';
    lootRow.innerHTML = cardsHtml(rewards.cards);
    for (const el of lootRow.children) (el as HTMLElement).style.opacity = '1';
    goldNum.textContent = String(rewards.gold);
    goldRow.style.opacity = '1';
    doneBtn.style.display = '';
  };

  doneBtn.style.display = 'none';
  doneBtn.onclick = finish;
  // A tap anywhere skips ahead; once everything is revealed it closes.
  overlay.addEventListener('click', (e) => {
    if (e.target === doneBtn) return;
    if (!skipped) revealAll(); else finish();
  });

  if (prefersReducedMotion()) {
    revealAll();
    return closed;
  }

  void run();
  return closed;

  async function run(): Promise<void> {
    fx.veilIn(veil);

    // 1. Drop in and land.
    if (box) {
      haptic('medium');
      animate(box, { y: [-160, 0], opacity: [0, 1] },
        { duration: 0.42 * pace, ease: [0.34, 1.2, 0.64, 1] });
      await wait(420 * pace);
      if (skipped) return;
      haptic('heavy');
      animate(box, { scaleX: [1, 1.18, 1], scaleY: [1, 0.84, 1] },
        { duration: 0.24, ease: EASE_OUT });
    }
    animate(title, { opacity: [0, 1], y: [10, 0] }, { duration: 0.3, ease: EASE_OUT });

    // 2. Shake, harder each time, while the room darkens.
    if (box) {
      for (const amp of [4, 7, 11]) {
        if (skipped) return;
        haptic('light');
        await animate(box,
          { rotate: [0, -amp, amp, -amp * 0.6, 0] },
          { duration: 0.3 * pace, ease: 'easeInOut' },
        ).finished;
        await wait(70 * pace);
      }
    }
    if (skipped) return;

    // 3. Burst.
    haptic('success');
    animate(flash, { opacity: [0, 0.92, 0] }, { duration: 0.34, ease: EASE_OUT });
    if (box) {
      animate(box, { scale: [1, 1.28, 0], opacity: [1, 1, 0] }, { duration: 0.3, ease: 'easeIn' });
    }
    overlay.classList.add('is-open');
    if (legendary) goldRain(overlay);
    await wait(280);
    if (skipped) return;
    if (box) box.style.display = 'none';

    // 4. Cards fly out one at a time, arcing up and out to their slot.
    lootRow.innerHTML = cardsHtml(rewards.cards);
    const tiles = [...lootRow.children] as HTMLElement[];
    for (const tile of tiles) tile.style.opacity = '0';
    for (const tile of tiles) {
      if (skipped) return;
      const rarity = tile.querySelector('.ct')?.getAttribute('data-rarity') ?? 'common';
      haptic(rarity === 'legendary' ? 'heavy' : rarity === 'epic' ? 'medium' : 'light');
      ring(tile, rarity);
      animate(tile,
        // The y keyframes are the arc: up first, then down into place.
        { opacity: [0, 1], y: [90, -22, 0], scale: [0.4, 1.18, 1] },
        { duration: 0.44 * pace, ease: EASE_OUT },
      );
      await wait(180 * pace);
    }
    if (skipped) return;

    // 5. Gold ticks up last, so it reads as a bonus rather than the headline.
    animate(goldRow, { opacity: [0, 1], y: [10, 0] }, { duration: 0.28, ease: EASE_OUT });
    fx.countTo(goldNum, rewards.gold, { from: 0, duration: 700 });
    await wait(400);
    skipHint.style.display = 'none';
    doneBtn.style.display = '';
    animate(doneBtn, { opacity: [0, 1], y: [12, 0] }, { duration: 0.26, ease: EASE_OUT });
  }
}

function cardsHtml(cards: Record<string, number>): string {
  return Object.entries(cards).map(([id, n]) =>
    `<div class="chest-seq-card">${cardTileHtml({ cardId: id, size: 'sm', showCost: false })}`
    + `<b>×${n}</b></div>`,
  ).join('');
}

/** Expanding ring in the card's rarity colour, as it lands. */
function ring(host: HTMLElement, rarity: string): void {
  const r = document.createElement('i');
  r.className = 'chest-seq-ring';
  r.style.borderColor = `var(--rarity-${rarity})`;
  host.appendChild(r);
  animate(r, { scale: [0.3, 2.2], opacity: [0.9, 0] }, { duration: 0.55, ease: EASE_OUT })
    .finished.finally(() => r.remove());
}

/** Legendary-only: coins raining down behind the loot. */
function goldRain(host: HTMLElement): void {
  const layer = document.createElement('div');
  layer.className = 'chest-seq-rain';
  host.appendChild(layer);
  for (let i = 0; i < 18; i++) {
    const coin = document.createElement('i');
    coin.innerHTML = Icon('gold', 18 + (i % 3) * 6);
    coin.style.left = `${(i * 37) % 100}%`;
    layer.appendChild(coin);
    animate(coin,
      { y: [-60, 620], rotate: [0, 220 + (i % 5) * 60], opacity: [1, 1, 0] },
      { duration: 1.4 + (i % 4) * 0.25, delay: (i % 9) * 0.07, ease: 'easeIn' },
    );
  }
  setTimeout(() => layer.remove(), 3000);
}
