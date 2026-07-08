/**
 * Read-only replay viewer. The server re-runs the recorded match deterministically
 * and streams the same `battle` snapshots we render live — minus the hand and any
 * input. Entered from the result screen or the hub ("watch your last battle").
 */
import { arenaForTrophies, type BattleSnapshot, type ServerMessage } from '@croyal/shared';
import { socket } from './net';
import { state } from './state';
import { setUI, setGameVisible, escapeHtml, type Nav } from './ui';
import { GameField } from './field';
import { computeFieldSize, fmtTime } from './hud';
import { t } from './i18n';
import { haptic } from './telegram';

export async function startReplay(nav: Nav): Promise<void> {
  let field: GameField | null = null;
  let off: (() => void) | null = null;
  let root: HTMLElement | null = null;
  let started = false;
  let yourSide: 'A' | 'B' = 'A';

  function cleanup() {
    off?.();
    field?.destroy();
    field = null;
    setGameVisible(false);
  }

  function leave() {
    socket.send({ t: 'leaveReplay' });
    cleanup();
    nav.toMenu();
  }

  const loading = document.createElement('div');
  loading.className = 'screen';
  loading.innerHTML = `
    <h1>${t('replay.title')}</h1>
    <div class="card"><div class="muted">${t('replay.loading')}</div></div>
    <button id="back" class="secondary">${t('common.back')}</button>`;
  setUI(loading);
  loading.querySelector<HTMLButtonElement>('#back')!.onclick = leave;

  function buildUI(opponent: string): HTMLElement {
    const node = document.createElement('div');
    node.className = 'hud';
    node.innerHTML = `
      <div class="hud-top">
        <button id="leave" class="danger" style="padding:6px 10px">✕</button>
        <span class="vs-name" title="${escapeHtml(opponent)}">${escapeHtml(opponent || '—')}</span>
        <span id="score" class="chip score">👑 0 — 0</span>
        <span id="timer" class="chip timer">--:--</span>
      </div>
      <div id="arena" class="arena-host"></div>
      <div class="replay-badge">${t('replay.badge')}</div>`;
    setUI(node);
    setGameVisible(false);
    node.querySelector<HTMLButtonElement>('#leave')!.onclick = leave;
    return node;
  }

  function onSnapshot(snap: BattleSnapshot) {
    yourSide = snap.yourSide;
    if (field) field.setFlip(yourSide === 'B');
    field?.render(snap.entities);
    if (snap.events?.length) field?.addEvents(snap.events);
    field?.setZones(snap.zones ?? []);
    field?.setFastPhase(snap.finalPhase ?? snap.doubleElixir);
    const timer = root?.querySelector<HTMLSpanElement>('#timer');
    if (timer) timer.textContent = fmtTime(snap.timeLeft);
    const score = root?.querySelector<HTMLSpanElement>('#score');
    if (score) {
      const enemy = yourSide === 'A' ? 'B' : 'A';
      score.textContent = `👑 ${snap.score[yourSide]} — ${snap.score[enemy]} 👑`;
    }
  }

  function showEnd(outcome: 'win' | 'loss' | 'draw', yourScore: number, oppScore: number) {
    cleanup();
    const node = document.createElement('div');
    node.className = 'screen';
    const crowns = (n: number) => '👑'.repeat(n) + '·'.repeat(Math.max(0, 3 - n));
    const title = outcome === 'win' ? t('battle.victory') : outcome === 'loss' ? t('battle.defeat') : t('replay.draw');
    node.innerHTML = `
      <h1>${title}</h1>
      <div class="card col" style="align-items:center">
        <div style="font-size:26px; letter-spacing:6px">${crowns(yourScore)} <span class="muted" style="font-size:14px">vs</span> ${crowns(oppScore)}</div>
        <div class="muted">${t('replay.ended')}</div>
      </div>
      <button id="ok" class="accent">${t('battle.backToMenu')}</button>`;
    setUI(node);
    node.querySelector<HTMLButtonElement>('#ok')!.onclick = () => nav.toMenu();
  }

  try {
    await socket.connect();
  } catch (e) {
    loading.innerHTML = `<div class="card">${t('common.connFailed', { msg: (e as Error).message })}</div>`;
    return;
  }

  off = socket.on((msg: ServerMessage) => {
    if (msg.t === 'replayStart' && !started) {
      started = true;
      root = buildUI(msg.opponent);
      const { w, h } = computeFieldSize();
      const arenaId = arenaForTrophies(state.profile?.trophies ?? 0);
      field = new GameField('arena', w, h, () => {}, arenaId); // no input
    } else if (msg.t === 'battle' && root) {
      onSnapshot(msg.snapshot);
    } else if (msg.t === 'replayEnd') {
      haptic('light');
      showEnd(msg.outcome, msg.yourScore, msg.opponentScore);
    } else if (msg.t === 'error' && !started) {
      loading.innerHTML = `
        <h1>${t('replay.title')}</h1>
        <div class="card"><div class="muted">${escapeHtml(msg.error === 'no replay available' ? t('replay.none') : msg.error)}</div></div>
        <button id="back" class="secondary">${t('common.back')}</button>`;
      loading.querySelector<HTMLButtonElement>('#back')!.onclick = () => nav.toMenu();
    }
  });

  socket.send({ t: 'watchLastReplay' });
}
