/**
 * Clan boss raid controller (co-op). Joins the clan's shared boss room,
 * renders the boss + troops, and shows live per-player damage.
 */
import { getCard, isWithinField, RIVER_Y, RIVER_HALF_HEIGHT, type BossSnapshot, type BossResult, type ServerMessage } from '@croyal/shared';
import { socket } from './net';
import { state } from './state';
import { setUI, setGameVisible, escapeHtml, type Nav } from './ui';
import { GameField, type FieldTap } from './field';
import {
  buildHand, buildTrioHand, computeFieldSize, elixirBarHtml, setElixir, fmtTime,
  nextCardHtml, setNextCard, type HandUI, type TrioUI,
} from './hud';
import { beginCardDrag } from './deploy-drag';
import { toast } from './ui/primitives';
import { haptic } from './telegram';
import { t } from './i18n';
import { cardImageUrl } from './assets';

export async function startBoss(nav: Nav, clanId: string): Promise<void> {
  let field: GameField | null = null;
  let hand: HandUI | null = null;
  let trio: TrioUI | null = null;
  let off: (() => void) | null = null;
  const cooldownMode = state.mode.economy === 'cooldown';

  function cleanup() {
    off?.();
    field?.destroy();
    field = null;
    setGameVisible(false);
  }

  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="hud-top">
      <button id="leave" class="danger" style="padding:6px 12px">${t('common.leave')}</button>
      <span id="diff" class="badge">${t('boss.solo')}</span>
      <span id="timer" class="chip timer">3:00</span>
    </div>
    <div style="padding:0 12px">
      <div class="elixir-bar" style="height:16px"><div class="elixir-fill" id="boss-hp" style="background:linear-gradient(180deg,#b388ff,#7e57c2)"></div></div>
      <div class="muted" id="bosshp-label" style="margin-top:2px">Boss</div>
    </div>
    <div id="arena" class="arena-host"></div>
    ${cooldownMode
      ? `<div class="handbar"><div class="hand" id="hand"></div></div>`
      : `${elixirBarHtml()}
         <div class="handbar">${nextCardHtml()}<div class="hand" id="hand"></div></div>`}
    <div class="card"><div class="muted">${t('boss.raiders')}</div><div id="parts"></div></div>`;
  setUI(root, { screen: 'boss' });
  setGameVisible(false);

  root.querySelector<HTMLButtonElement>('#leave')!.onclick = () => {
    socket.send({ t: 'bossLeave' });
    cleanup();
    nav.toClans();
  };

  // Boss raid: troops deploy on YOUR half (below the river) and cross a bridge
  // to the boss; spells may be aimed anywhere in the field.
  function validateDeploy(cardId: string, tile: FieldTap): boolean {
    const c = getCard(cardId);
    if (!c || !isWithinField(tile.x, tile.y)) return false;
    return c.type === 'spell' || tile.y >= RIVER_Y + RIVER_HALF_HEIGHT;
  }

  // Cooldown mode: arm a troop card, then tap your half to choose the spawn spot.
  let aimingCard: string | null = null;
  function setBossAiming(cardId: string | null) {
    aimingCard = cardId;
    trio?.setAiming(cardId);
    const c = cardId ? getCard(cardId) : null;
    field?.setDeployActive(!!c && c.type !== 'spell');
  }

  const handEl = root.querySelector<HTMLDivElement>('#hand')!;
  if (cooldownMode) {
    trio = buildTrioHand(handEl, {
      onPlay: (cardId) => {
        const c = getCard(cardId);
        if (!c) return;
        if (c.type === 'spell') { socket.send({ t: 'bossDeploy', cardId }); haptic('light'); return; } // auto-aims boss
        setBossAiming(aimingCard === cardId ? null : cardId);
      },
    });
  } else {
    hand = buildHand(handEl, {
      onDragStart: (cardId, cell, ev) => beginCardDrag(cardId, cell, ev, {
        field: () => field,
        validate: validateDeploy,
        deploy: (id, tile) => {
          socket.send({ t: 'bossDeploy', cardId: id, x: tile.x, y: tile.y });
          hand?.clearSelection();
        },
        setHoldRender: (h) => hand?.setRenderHold(h),
      }),
    });
  }

  const { w, h } = computeFieldSize();
  field = new GameField('arena', w, h, (tap) => {
    if (cooldownMode) {
      if (!aimingCard || !validateDeploy(aimingCard, tap)) return;
      socket.send({ t: 'bossDeploy', cardId: aimingCard, x: tap.x, y: tap.y });
      setBossAiming(null);
      haptic('light');
      return;
    }
    const id = hand?.selected();
    if (!id) return;
    socket.send({ t: 'bossDeploy', cardId: id, x: tap.x, y: tap.y });
    hand?.clearSelection();
    haptic('light');
  });

  function onSnapshot(snap: BossSnapshot) {
    field?.render(snap.entities, snap.tick);
    // Raids now carry combat FX like 1v1 does. `events` is optional on the wire,
    // so an older server simply sends nothing and the field stays quiet.
    if (snap.events?.length) field?.addEvents(snap.events);
    if (cooldownMode) {
      trio?.setCooldowns(snap.cooldowns ?? []);
    } else {
      setElixir(root, snap.yourElixir);
      hand?.setHand(snap.hand, snap.nextCard, snap.yourElixir);
      setNextCard(root, snap.nextCard);
    }

    const bossHp = root.querySelector<HTMLDivElement>('#boss-hp')!;
    bossHp.style.width = `${Math.max(0, (snap.bossHp / snap.bossMaxHp) * 100)}%`;
    root.querySelector<HTMLDivElement>('#bosshp-label')!.textContent =
      t('boss.hp', { hp: snap.bossHp, max: snap.bossMaxHp });
    root.querySelector<HTMLSpanElement>('#timer')!.textContent = fmtTime(snap.timeLeft);
    const diff = root.querySelector<HTMLSpanElement>('#diff')!;
    diff.textContent = snap.difficultyMultiplier >= 2 ? t('boss.coop', { n: snap.difficultyMultiplier }) : t('boss.solo');

    const parts = root.querySelector<HTMLDivElement>('#parts')!;
    parts.innerHTML = snap.participants
      .sort((a, b) => b.damageDealt - a.damageDealt)
      .map((p) => `<div class="participant"><span>${escapeHtml(p.nickname)}</span><b>${p.damageDealt}</b></div>`)
      .join('');
  }

  function showResult(result: BossResult) {
    cleanup();
    const node = document.createElement('div');
    node.className = 'screen';
    const win = result.outcome === 'win';
    haptic(win ? 'success' : 'error');
    node.innerHTML = `
      <h1>${win ? t('boss.defeated') : t('boss.failed')}</h1>
      <div class="card col">
        <div>${t('boss.reward', { gold: result.rewardGold })}</div>
        <div class="muted">${t('boss.damage')}</div>
        ${result.participants
          .sort((a, b) => b.damageDealt - a.damageDealt)
          .map((p) => `<div class="participant"><span>${escapeHtml(p.nickname)}</span><b>${p.damageDealt}</b></div>`)
          .join('')}
      </div>
      <button id="ok" class="accent">${t('boss.backToClan')}</button>`;
    setUI(node, { screen: 'result' });
    node.querySelector<HTMLButtonElement>('#ok')!.onclick = () => nav.toClans();
  }

  try {
    await socket.connect();
  } catch (e) {
    setUI(Object.assign(document.createElement('div'), { className: 'screen', innerHTML: `<div class="card">${t('common.connFailed', { msg: (e as Error).message })}</div>` }));
    return;
  }

  off = socket.on((msg: ServerMessage) => {
    if (msg.t === 'boss') onSnapshot(msg.snapshot);
    else if (msg.t === 'bossEnd') showResult(msg.result);
    else if (msg.t === 'error') {
      cleanup();
      toast(msg.error, 'error');
      nav.toClans();
    }
  });

  socket.send({ t: 'bossJoin', clanId });
}
