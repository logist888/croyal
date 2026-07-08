/**
 * 1v1 battle controller: matchmaking, Phaser field, HUD and deploy input.
 *
 * Two battle models (GDD reversibility): the cooldown/fixed-lane HUD (tap a
 * card to play; spells enter aim mode) and the legacy elixir/free-placement
 * HUD (drag-to-deploy). The server's mode decides which one renders.
 */
import {
  getCard, canDeployTroop, isWithinField, ARENA_WIDTH, otherSide, arenaForTrophies,
  COOLDOWN_BATTLE_CONFIG, LEGACY_BATTLE_CONFIG,
  type BattleSnapshot, type MatchResult, type ServerMessage,
} from '@croyal/shared';
import { socket } from './net';
import { state } from './state';
import { setUI, setGameVisible, escapeHtml, type Nav } from './ui';
import { GameField, type FieldTap } from './field';
import {
  buildHand, buildTrioHand, computeFieldSize, elixirBarHtml, setElixir, fmtTime,
  nextCardHtml, setNextCard, type HandUI, type TrioUI,
} from './hud';
import { beginCardDrag } from './deploy-drag';
import { haptic } from './telegram';
import { t, reasonText, cardName } from './i18n';
import { cardImageUrl, uiImageUrl } from './assets';

export async function startBattle(nav: Nav): Promise<void> {
  let field: GameField | null = null;
  let hand: HandUI | null = null;
  let trio: TrioUI | null = null;
  let aimingSpell: string | null = null;
  let yourSide: 'A' | 'B' = 'A';
  let enemyDown = { left: false, right: false };
  let opponentName = '';
  let off: (() => void) | null = null;
  let offConn: (() => void) | null = null;
  let inMatch = false;
  let fastBannerShown = false;
  let seenIds: Set<string> | null = null;
  let statusTimer = 0;
  // The two mode axes are independent: economy picks the HAND (trio with
  // recharge overlays vs elixir bar + 4-card cycle), deployment picks the
  // INPUT (tap-to-play on lanes vs coordinate placement).
  const cooldownEcon = state.mode.economy === 'cooldown';
  const lanes = state.mode.deployment === 'fixed-lane';

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
    offConn?.();
    document.getElementById('reconnect-overlay')?.remove();
    field?.destroy();
    field = null;
    setGameVisible(false);
  }

  // Show a "reconnecting…" veil while the socket is down mid-battle; the
  // server holds the match open and resyncs it once the socket is back.
  function setConnState(s: 'online' | 'reconnecting') {
    const existing = document.getElementById('reconnect-overlay');
    if (s === 'reconnecting') {
      if (existing || !inMatch) return;
      const veil = document.createElement('div');
      veil.id = 'reconnect-overlay';
      veil.innerHTML = `<div class="reconnect-box"><div class="spinner"></div>${t('battle.reconnecting')}</div>`;
      document.body.appendChild(veil);
    } else {
      existing?.remove();
    }
  }

  function setAiming(cardId: string | null) {
    aimingSpell = cardId;
    trio?.setAiming(cardId);
    const card = cardId ? getCard(cardId) : null;
    const isTroop = !!card && card.type !== 'spell';
    // Open mode: highlight the deployable half while a troop is armed.
    field?.setDeployActive(!lanes && isTroop);
    const hint = document.querySelector<HTMLDivElement>('#aim-hint');
    if (hint) {
      hint.style.display = cardId ? '' : 'none';
      hint.textContent = isTroop ? t('battle.deployHint') : t('battle.aimHint');
    }
  }

  function buildBattleUI() {
    const roundSeconds = cooldownEcon ? COOLDOWN_BATTLE_CONFIG.roundSeconds : LEGACY_BATTLE_CONFIG.roundSeconds;
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
      ${lanes ? `<div class="status-line" id="status-line"></div>` : ''}
      <div class="aim-hint" id="aim-hint" style="display:none">${t('battle.aimHint')}</div>
      ${cooldownEcon
        ? `<div class="handbar"><div class="hand" id="hand"></div></div>`
        : `${elixirBarHtml()}
           <div class="handbar">${nextCardHtml()}<div class="hand" id="hand"></div></div>`}`;
    setUI(root);
    setGameVisible(false);
    root.querySelector<HTMLButtonElement>('#leave')!.onclick = () => {
      socket.send({ t: 'leaveMatch' });
    };

    const handEl = root.querySelector<HTMLDivElement>('#hand')!;
    if (cooldownEcon) {
      // Trio hand. On lanes, troops go out instantly and spells aim first;
      // with free placement every card arms and a field tap places it.
      trio = buildTrioHand(handEl, {
        onPlay: (cardId) => {
          const card = getCard(cardId);
          if (!card) return;
          if (!lanes || card.type === 'spell') {
            setAiming(aimingSpell === cardId ? null : cardId);
            return;
          }
          setAiming(null);
          socket.send({ t: 'deploy', cardId });
          haptic('light');
        },
      });
    } else if (lanes) {
      // Elixir hand on fixed lanes: tap a troop to send it out, spells stay
      // selected and are aimed by a field tap.
      hand = buildHand(handEl, {
        onSelect: () => {
          const id = hand?.selected();
          if (!id) return;
          const card = getCard(id);
          if (!card || card.type === 'spell') return; // aim via field tap
          socket.send({ t: 'deploy', cardId: id });
          hand?.clearSelection();
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
    // The authoritative mode rides on every snapshot — keep the app state in
    // sync so post-battle screens are correct even after a server mode flip.
    if (snap.mode) state.mode = snap.mode;
    if (field) field.setFlip(yourSide === 'B');
    field?.render(snap.entities);
    if (snap.events?.length) field?.addEvents(snap.events);
    field?.setZones(snap.zones ?? []);
    const fast = snap.finalPhase ?? snap.doubleElixir;
    field?.setFastPhase(fast);

    // HAND updates follow the economy.
    if (cooldownEcon) {
      trio?.setCooldowns(snap.cooldowns ?? [], fast ? 2 : 1);

      // One-time "final minute" banner when the fast recharge kicks in.
      if (fast && !fastBannerShown) {
        fastBannerShown = true;
        haptic('light');
        const banner = document.createElement('div');
        banner.className = 'fast-banner';
        banner.textContent = t('battle.fastPhase');
        root.appendChild(banner);
        window.setTimeout(() => banner.remove(), 4000);
      }
    } else {
      const myElixir = snap.elixir[yourSide];
      setElixir(root, myElixir);
      hand?.setHand(snap.hand, snap.nextCard, myElixir);
      setNextCard(root, snap.nextCard);
    }

    // Placement zones matter only with free placement.
    if (!lanes) {
      const enemy = otherSide(yourSide);
      let leftAlive = false, rightAlive = false;
      for (const e of snap.entities) {
        if (e.kind === 'tower' && e.side === enemy && e.towerType?.startsWith('princess') && e.hp > 0) {
          if (e.x < ARENA_WIDTH / 2) leftAlive = true; else rightAlive = true;
        }
      }
      enemyDown = { left: !leftAlive, right: !rightAlive };
    }

    // Status line (lanes): announce units that just entered the field.
    if (lanes) {
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
    }

    const timer = root.querySelector<HTMLSpanElement>('#timer');
    if (timer) {
      timer.textContent = fmtTime(snap.timeLeft) + (fast ? ' ×2' : '');
      timer.classList.toggle('fast-phase', !!fast);
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

    // A win earns a chest into a hub slot (its cards are claimed there). Slots
    // full on a win => a nudge to go open one. Losses earn no chest.
    let chestBlock = '';
    if (result.earnedChest) {
      const art = uiImageUrl(`chest_${result.earnedChest}`);
      const chestArt = art
        ? `<div class="chest-img big" style="background-image:url(${art})"></div>`
        : '<div style="font-size:54px">🎁</div>';
      chestBlock = `
        <div class="card col" style="align-items:center">
          ${chestArt}
          <b>${escapeHtml(t('result.earnedChest', { rarity: t(`chest.rarity.${result.earnedChest}`) }))}</b>
        </div>`;
    } else if (win) {
      chestBlock = `<div class="card col" style="align-items:center"><div class="muted">${t('result.chestFull')}</div></div>`;
    }

    node.innerHTML = `
      <h1>${win ? t('battle.victory') : t('battle.defeat')}</h1>
      <div class="card col" style="align-items:center">
        <div style="font-size:26px; letter-spacing:6px">${crowns(result.yourScore)} <span class="muted" style="font-size:14px">vs</span> ${crowns(result.opponentScore)}</div>
        <div class="muted">${t('battle.reason', { reason: reasonText(result.reason) })}</div>
        <div>${t('battle.trophies', { delta: (result.trophyDelta >= 0 ? '+' : '') + result.trophyDelta })}</div>
        <div class="row" style="gap:8px"><span class="badge">🪙 +${result.rewards.gold}</span></div>
      </div>
      ${chestBlock}
      <button id="ok" class="accent">${t('battle.backToMenu')}</button>`;
    setUI(node);
    node.querySelector<HTMLButtonElement>('#ok')!.onclick = () => nav.toMenu();
  }

  try {
    await socket.connect();
  } catch (e) {
    searching.innerHTML = `<div class="card">${t('common.connFailed', { msg: (e as Error).message })}</div>`;
    return;
  }

  let root: HTMLElement | null = null;
  offConn = socket.onConn(setConnState);
  off = socket.on((msg: ServerMessage) => {
    if (msg.t === 'matchFound' && !inMatch) {
      inMatch = true;
      opponentName = msg.opponent;
      const { w, h } = computeFieldSize();
      root = buildBattleUI();
      const arenaId = arenaForTrophies(state.profile?.trophies ?? 0);
      field = new GameField('arena', w, h, (tap) => {
        // Armed trio card (spell aim on lanes; any card with free placement).
        if (aimingSpell) {
          if (!validateDeploy(aimingSpell, tap)) return;
          socket.send({ t: 'deploy', cardId: aimingSpell, x: tap.x, y: tap.y });
          setAiming(null);
          haptic('light');
          return;
        }
        // Legacy-hand selection: on lanes only spells reach here (troops
        // deploy on card tap); with free placement it's the tap-tap fallback.
        const id = hand?.selected();
        if (!id) return;
        if (lanes && !isWithinField(tap.x, tap.y)) return;
        socket.send({ t: 'deploy', cardId: id, x: tap.x, y: tap.y });
        hand?.clearSelection();
        haptic('light');
      }, arenaId);
    } else if (msg.t === 'battle' && root) {
      onSnapshot(root, msg.snapshot);
    } else if (msg.t === 'matchEnd') {
      showResult(msg.result);
    }
  });

  socket.send({ t: 'queue' });
}
