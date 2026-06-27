/**
 * 1v1 battle controller: matchmaking, Phaser field, HUD and deploy input.
 */
import type { BattleSnapshot, MatchResult, ServerMessage } from '@croyal/shared';
import { socket } from './net';
import { setUI, setGameVisible, type Nav } from './ui';
import { GameField } from './field';
import { buildHand, computeFieldSize, elixirBarHtml, setElixir, fmtTime, type HandUI } from './hud';
import { haptic } from './telegram';
import { t, reasonText } from './i18n';

export async function startBattle(nav: Nav): Promise<void> {
  let field: GameField | null = null;
  let hand: HandUI | null = null;
  let yourSide: 'A' | 'B' = 'A';
  let off: (() => void) | null = null;
  let inMatch = false;

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

  function buildBattleUI() {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="hud-top">
        <button id="leave" class="danger" style="padding:6px 10px">${t('common.leave')}</button>
        <span id="score">0 — 0</span>
        <span id="timer">4:00</span>
      </div>
      ${elixirBarHtml()}
      <div class="hand" id="hand"></div>`;
    setUI(root);
    setGameVisible(true);
    root.querySelector<HTMLButtonElement>('#leave')!.onclick = () => {
      socket.send({ t: 'leaveMatch' });
    };
    hand = buildHand(root.querySelector<HTMLDivElement>('#hand')!, () => {});
    return root;
  }

  function onSnapshot(root: HTMLElement, snap: BattleSnapshot) {
    yourSide = snap.yourSide;
    if (field) field.setFlip(yourSide === 'B');
    field?.render(snap.entities);
    const myElixir = snap.elixir[yourSide];
    setElixir(root, myElixir);
    hand?.setHand(snap.hand, snap.nextCard, myElixir);
    const timer = root.querySelector<HTMLSpanElement>('#timer');
    if (timer) timer.textContent = fmtTime(snap.timeLeft) + (snap.doubleElixir ? ' ×2' : '');
    const score = root.querySelector<HTMLSpanElement>('#score');
    if (score) {
      const enemy = yourSide === 'A' ? 'B' : 'A';
      score.textContent = `${snap.score[yourSide]} — ${snap.score[enemy]}`;
    }
  }

  function showResult(result: MatchResult) {
    cleanup();
    const node = document.createElement('div');
    node.className = 'screen';
    const win = result.outcome === 'win';
    haptic(win ? 'success' : 'error');
    node.innerHTML = `
      <h1>${win ? t('battle.victory') : t('battle.defeat')}</h1>
      <div class="card col">
        <div>${t('battle.towers', { a: result.yourScore, b: result.opponentScore })}</div>
        <div class="muted">${t('battle.reason', { reason: reasonText(result.reason) })}</div>
        <div>${t('battle.trophies', { delta: (result.trophyDelta >= 0 ? '+' : '') + result.trophyDelta })}</div>
      </div>
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
  off = socket.on((msg: ServerMessage) => {
    if (msg.t === 'matchFound' && !inMatch) {
      inMatch = true;
      const { w, h } = computeFieldSize();
      root = buildBattleUI();
      field = new GameField('game', w, h, (tap) => {
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
