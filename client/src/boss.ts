/**
 * Clan boss raid controller (co-op). Joins the clan's shared boss room,
 * renders the boss + troops, and shows live per-player damage.
 */
import type { BossSnapshot, BossResult, ServerMessage } from '@croyal/shared';
import { socket } from './net';
import { setUI, setGameVisible, escapeHtml, type Nav } from './ui';
import { GameField } from './field';
import { buildHand, computeFieldSize, elixirBarHtml, setElixir, fmtTime, type HandUI } from './hud';
import { haptic } from './telegram';

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
      <button id="leave" class="danger" style="padding:6px 10px">Leave</button>
      <span id="diff" class="badge">solo</span>
      <span id="timer">3:00</span>
    </div>
    <div class="elixir-bar"><div class="elixir-fill" id="boss-hp" style="background:linear-gradient(90deg,#7e57c2,#b388ff)"></div></div>
    <div class="muted" id="bosshp-label" style="padding:0 12px">Boss</div>
    ${elixirBarHtml()}
    <div class="hand" id="hand"></div>
    <div class="card"><div class="muted">Raiders</div><div id="parts"></div></div>`;
  setUI(root);
  setGameVisible(true);

  root.querySelector<HTMLButtonElement>('#leave')!.onclick = () => {
    socket.send({ t: 'bossLeave' });
    cleanup();
    nav.toClans();
  };

  hand = buildHand(root.querySelector<HTMLDivElement>('#hand')!, () => {});

  const { w, h } = computeFieldSize();
  field = new GameField('game', w, h, (tap) => {
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

    const bossHp = root.querySelector<HTMLDivElement>('#boss-hp')!;
    bossHp.style.width = `${Math.max(0, (snap.bossHp / snap.bossMaxHp) * 100)}%`;
    root.querySelector<HTMLDivElement>('#bosshp-label')!.textContent =
      `Boss ${snap.bossHp} / ${snap.bossMaxHp} HP`;
    root.querySelector<HTMLSpanElement>('#timer')!.textContent = fmtTime(snap.timeLeft);
    const diff = root.querySelector<HTMLSpanElement>('#diff')!;
    diff.textContent = snap.difficultyMultiplier >= 2 ? `CO-OP ×${snap.difficultyMultiplier}` : 'solo';

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
      <h1>${win ? '🐉 Boss defeated!' : '⏱️ Raid failed'}</h1>
      <div class="card col">
        <div>Reward: <b>${result.rewardGold} gold</b></div>
        <div class="muted">Damage dealt</div>
        ${result.participants
          .sort((a, b) => b.damageDealt - a.damageDealt)
          .map((p) => `<div class="participant"><span>${escapeHtml(p.nickname)}</span><b>${p.damageDealt}</b></div>`)
          .join('')}
      </div>
      <button id="ok" class="accent">Back to clan</button>`;
    setUI(node);
    node.querySelector<HTMLButtonElement>('#ok')!.onclick = () => nav.toClans();
  }

  try {
    await socket.connect();
  } catch (e) {
    setUI(Object.assign(document.createElement('div'), { className: 'screen', innerHTML: `<div class="card">Connection failed: ${(e as Error).message}</div>` }));
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
