/**
 * Clan boss raid controller (co-op). Joins the clan's shared boss room,
 * renders the boss + troops, and shows live per-player damage.
 */
import { getCard, isWithinField, ARENA_HEIGHT, type BossSnapshot, type BossResult, type ServerMessage } from '@croyal/shared';
import { socket } from './net';
import { setUI, setGameVisible, escapeHtml, type Nav } from './ui';
import { GameField, type FieldTap } from './field';
import { buildHand, computeFieldSize, elixirBarHtml, setElixir, fmtTime, nextCardHtml, setNextCard, type HandUI } from './hud';
import { beginCardDrag } from './deploy-drag';
import { haptic } from './telegram';
import { t } from './i18n';
import { cardImageUrl } from './assets';

export async function startBoss(nav: Nav, clanId: string): Promise<void> {
  let field: GameField | null = null;
  let hand: HandUI | null = null;
  let off: (() => void) | null = null;

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
    ${elixirBarHtml()}
    <div class="handbar">${nextCardHtml()}<div class="hand" id="hand"></div></div>
    <div class="card"><div class="muted">${t('boss.raiders')}</div><div id="parts"></div></div>`;
  setUI(root);
  setGameVisible(false);

  root.querySelector<HTMLButtonElement>('#leave')!.onclick = () => {
    socket.send({ t: 'bossLeave' });
    cleanup();
    nav.toClans();
  };

  // Boss raid: troops land in the lower band of the field (boss is at the top).
  function validateDeploy(cardId: string, tile: FieldTap): boolean {
    const c = getCard(cardId);
    if (!c || !isWithinField(tile.x, tile.y)) return false;
    return c.type === 'spell' || tile.y >= ARENA_HEIGHT * 0.4;
  }

  hand = buildHand(root.querySelector<HTMLDivElement>('#hand')!, {
    onDragStart: (cardId, cell, ev) => beginCardDrag(cardId, cell, ev, {
      field: () => field,
      validate: validateDeploy,
      deploy: (id, tile) => {
        socket.send({ t: 'bossDeploy', cardId: id, x: tile.x, y: tile.y });
        hand?.clearSelection();
      },
      cardArt: (id) => cardImageUrl(id),
      setHoldRender: (h) => hand?.setRenderHold(h),
    }),
  });

  const { w, h } = computeFieldSize();
  field = new GameField('arena', w, h, (tap) => {
    const id = hand?.selected();
    if (!id) return;
    socket.send({ t: 'bossDeploy', cardId: id, x: tap.x, y: tap.y });
    hand?.clearSelection();
    haptic('light');
  });

  function onSnapshot(snap: BossSnapshot) {
    field?.render(snap.entities);
    setElixir(root, snap.yourElixir);
    hand?.setHand(snap.hand, snap.nextCard, snap.yourElixir);
    setNextCard(root, snap.nextCard);

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
    setUI(node);
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
      alert(msg.error);
      nav.toClans();
    }
  });

  socket.send({ t: 'bossJoin', clanId });
}
