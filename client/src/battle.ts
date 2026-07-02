/**
 * 1v1 battle controller: matchmaking, Phaser field, HUD and deploy input.
 *
 * Two battle models (GDD reversibility): the cooldown/fixed-lane HUD (tap a
 * card to play; spells enter aim mode) and the legacy elixir/free-placement
 * HUD (drag-to-deploy). The server's mode decides which one renders.
 */
import {
  getCard, canDeployTroop, isWithinField, ARENA_WIDTH, otherSide,
  COOLDOWN_BATTLE_CONFIG, LEGACY_BATTLE_CONFIG,
  type BattleSnapshot, type MatchResult, type ServerMessage,
} from '@croyal/shared';
import { socket } from './net';
import { state } from './state';
import { setUI, setGameVisible, hex, escapeHtml, type Nav } from './ui';
import { GameField, type FieldTap } from './field';
import {
  buildHand, buildTrioHand, computeFieldSize, elixirBarHtml, setElixir, fmtTime,
  nextCardHtml, setNextCard, type HandUI, type TrioUI,
} from './hud';
import { beginCardDrag } from './deploy-drag';
import { haptic } from './telegram';
import { t, reasonText, cardName } from './i18n';
import { cardImageUrl } from './assets';

export async function startBattle(nav: Nav): Promise<void> {
  let field: GameField | null = null;
  let hand: HandUI | null = null;
  let trio: TrioUI | null = null;
  let aimingSpell: string | null = null;
  let yourSide: 'A' | 'B' = 'A';
  let enemyDown = { left: false, right: false };
  let opponentName = '';
  let off: (() => void) | null = null;
  let inMatch = false;
  let fastBannerShown = false;
  let seenIds: Set<string> | null = null;
  let statusTimer = 0;
  const cooldownMode = state.mode.economy === 'cooldown';

  // Mirror of the server's deploy rule, used for the live drag preview.
  function validateDeploy(cardId: string, tile: FieldTap): boolean {
    const c = getCard(cardId);
    if (!c) return false;
    if (c.type === 'spell') return isWithinField(tile.x, tile.y);
    return canDeployTroop(yourSide, tile.x, tile.y, enemyDown);
  }

  setGameVisible(false);
  const searching = document.createElement('div');
  searching.className = 'screen';
  searching.innerHTML = `
    <h1>${t('battle.finding')}</h1>
    <div class="card"><div class="muted">${t('battle.findingHint')}</div></div>
    <button id="cancel" class="secondary">${t('common.cancel')}</button>`;
  setUI(searching);
  searching.querySelector<HTMLButtonElement>('#cancel')!.onclick = () => {
    socket.send({ t: 'cancelQueue' });
    cleanup();
    nav.toMenu();
  };

  function cleanup() {
    off?.();
    field?.destroy();
    field = null;
    setGameVisible(false);
  }

  function setAiming(cardId: string | null) {
    aimingSpell = cardId;
    trio?.setAiming(cardId);
    const hint = document.querySelector<HTMLDivElement>('#aim-hint');
    if (hint) hint.style.display = cardId ? '' : 'none';
  }

  function buildBattleUI() {
    const roundSeconds = cooldownMode ? COOLDOWN_BATTLE_CONFIG.roundSeconds : LEGACY_BATTLE_CONFIG.roundSeconds;
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="hud-top">
        <button id="leave" class="danger" style="padding:6px 10px">✕</button>
        <span class="vs-name" title="${escapeHtml(opponentName)}">${escapeHtml(opponentName || '—')}</span>
        <span id="score" class="chip score">👑 0 — 0</span>
        <span id="timer" class="chip timer">${fmtTime(roundSeconds)}</span>
      </div>
      <div id="arena" class="arena-host"></div>
      ${cooldownMode
        ? `<div class="status-line" id="status-line"></div>
           <div class="aim-hint" id="aim-hint" style="display:none">${t('battle.aimHint')}</div>
           <div class="handbar"><div class="hand" id="hand"></div></div>`
        : `${elixirBarHtml()}
           <div class="handbar">${nextCardHtml()}<div class="hand" id="hand"></div></div>`}`;
    setUI(root);
    setGameVisible(false);
    root.querySelector<HTMLButtonElement>('#leave')!.onclick = () => {
      socket.send({ t: 'leaveMatch' });
    };

    const handEl = root.querySelector<HTMLDivElement>('#hand')!;
    if (cooldownMode) {
      // Tap-to-play: troops go out on your lane instantly, spells aim first.
      trio = buildTrioHand(handEl, {
        onPlay: (cardId) => {
          const card = getCard(cardId);
          if (!card) return;
          if (card.type === 'spell') {
            setAiming(aimingSpell === cardId ? null : cardId);
            return;
          }
          setAiming(null);
          socket.send({ t: 'deploy', cardId });
          haptic('light');
        },
      });
    } else {
      hand = buildHand(handEl, {
        onDragStart: (cardId, cell, ev) => beginCardDrag(cardId, cell, ev, {
          field: () => field,
          validate: validateDeploy,
          deploy: (id, tile) => {
            socket.send({ t: 'deploy', cardId: id, x: tile.x, y: tile.y });
            hand?.clearSelection();
          },
          cardArt: (id) => cardImageUrl(id),
          setHoldRender: (h) => hand?.setRenderHold(h),
        }),
      });
    }
    return root;
  }

  function onSnapshot(root: HTMLElement, snap: BattleSnapshot) {
    yourSide = snap.yourSide;
    if (field) field.setFlip(yourSide === 'B');
    field?.render(snap.entities);

    if (cooldownMode) {
      trio?.setCooldowns(snap.cooldowns ?? [], snap.finalPhase ? 2 : 1);

      // Status line: announce units that just entered the field.
      const ids = new Set(snap.entities.map((e) => e.id));
      if (seenIds) {
        let mine: string | null = null;
        let theirs: string | null = null;
        for (const e of snap.entities) {
          if (e.kind === 'tower' || !e.cardId || seenIds.has(e.id)) continue;
          if (e.side === yourSide) mine = e.cardId;
          else theirs = e.cardId;
        }
        const line = root.querySelector<HTMLDivElement>('#status-line');
        if (line && (mine || theirs)) {
          line.textContent = theirs ? `⚠️ ${cardName(theirs)}` : `⚔️ ${cardName(mine!)}`;
          line.classList.add('show');
          window.clearTimeout(statusTimer);
          statusTimer = window.setTimeout(() => line.classList.remove('show'), 2200);
        }
      }
      seenIds = ids;

      // One-time "final minute" banner when the fast phase kicks in.
      if (snap.finalPhase && !fastBannerShown) {
        fastBannerShown = true;
        haptic('light');
        const banner = document.createElement('div');
        banner.className = 'fast-banner';
        banner.textContent = t('battle.fastPhase');
        root.appendChild(banner);
        window.setTimeout(() => banner.remove(), 4000);
      }
    } else {
      // Which enemy princess towers are down → opens that lane for deployment.
      const enemy = otherSide(yourSide);
      let leftAlive = false, rightAlive = false;
      for (const e of snap.entities) {
        if (e.kind === 'tower' && e.side === enemy && e.towerType?.startsWith('princess') && e.hp > 0) {
          if (e.x < ARENA_WIDTH / 2) leftAlive = true; else rightAlive = true;
        }
      }
      enemyDown = { left: !leftAlive, right: !rightAlive };
      const myElixir = snap.elixir[yourSide];
      setElixir(root, myElixir);
      hand?.setHand(snap.hand, snap.nextCard, myElixir);
      setNextCard(root, snap.nextCard);
    }

    const timer = root.querySelector<HTMLSpanElement>('#timer');
    if (timer) {
      const fast = cooldownMode ? !!snap.finalPhase : snap.doubleElixir;
      timer.textContent = fmtTime(snap.timeLeft) + (fast ? ' ×2' : '');
      timer.classList.toggle('fast-phase', fast);
    }
    const score = root.querySelector<HTMLSpanElement>('#score');
    if (score) {
      const enemy = yourSide === 'A' ? 'B' : 'A';
      score.textContent = `👑 ${snap.score[yourSide]} — ${snap.score[enemy]} 👑`;
    }
  }

  function showResult(result: MatchResult) {
    cleanup();
    const node = document.createElement('div');
    node.className = 'screen';
    const win = result.outcome === 'win';
    haptic(win ? 'success' : 'error');
    const crowns = (n: number) => '👑'.repeat(n) + '·'.repeat(Math.max(0, 3 - n));
    node.innerHTML = `
      <h1>${win ? t('battle.victory') : t('battle.defeat')}</h1>
      <div class="card col" style="align-items:center">
        <div style="font-size:26px; letter-spacing:6px">${crowns(result.yourScore)} <span class="muted" style="font-size:14px">vs</span> ${crowns(result.opponentScore)}</div>
        <div class="muted">${t('battle.reason', { reason: reasonText(result.reason) })}</div>
        <div>${t('battle.trophies', { delta: (result.trophyDelta >= 0 ? '+' : '') + result.trophyDelta })}</div>
      </div>
      <div class="card col" id="chest" style="align-items:center">
        <div class="muted">${t('result.chest')}</div>
        <div style="font-size:54px">🎁</div>
        <button id="open" class="accent">${t('result.open')}</button>
      </div>
      <button id="ok" class="accent" style="display:none">${t('battle.backToMenu')}</button>`;
    setUI(node);

    const rewardTile = (id: string, n: number) => {
      const c = getCard(id);
      const art = cardImageUrl(id);
      const bg = art
        ? `background-image:url(${art});background-size:contain;background-repeat:no-repeat;background-position:center`
        : `background:${c ? hex(c.color) : '#555'}`;
      return `<div class="reward"><div class="reward-card" style="${bg}"></div><b>x${n}</b></div>`;
    };

    const ok = node.querySelector<HTMLButtonElement>('#ok')!;
    ok.onclick = () => nav.toMenu();
    node.querySelector<HTMLButtonElement>('#open')!.onclick = () => {
      haptic('success');
      const chest = node.querySelector<HTMLDivElement>('#chest')!;
      const cards = Object.entries(result.rewards.cards);
      chest.innerHTML = `
        <div class="muted">${t('result.received')}</div>
        <div class="reward-row">
          <div class="reward"><div class="reward-card" style="display:flex;align-items:center;justify-content:center;font-size:22px">🪙</div><b>+${result.rewards.gold}</b></div>
          ${cards.map(([id, n]) => rewardTile(id, n)).join('')}
        </div>`;
      ok.style.display = '';
    };
  }

  try {
    await socket.connect();
  } catch (e) {
    searching.innerHTML = `<div class="card">${t('common.connFailed', { msg: (e as Error).message })}</div>`;
    return;
  }

  let root: HTMLElement | null = null;
  off = socket.on((msg: ServerMessage) => {
    if (msg.t === 'matchFound' && !inMatch) {
      inMatch = true;
      opponentName = msg.opponent;
      const { w, h } = computeFieldSize();
      root = buildBattleUI();
      field = new GameField('arena', w, h, (tap) => {
        if (cooldownMode) {
          // Field taps only aim spells — troops auto-march from the lane spawn.
          if (!aimingSpell) return;
          if (!isWithinField(tap.x, tap.y)) return;
          socket.send({ t: 'deploy', cardId: aimingSpell, x: tap.x, y: tap.y });
          setAiming(null);
          haptic('light');
          return;
        }
        const id = hand?.selected();
        if (!id) return;
        socket.send({ t: 'deploy', cardId: id, x: tap.x, y: tap.y });
        hand?.clearSelection();
        haptic('light');
      });
    } else if (msg.t === 'battle' && root) {
      onSnapshot(root, msg.snapshot);
    } else if (msg.t === 'matchEnd') {
      showResult(msg.result);
    }
  });

  socket.send({ t: 'queue' });
}
