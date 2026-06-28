/**
 * 1v1 battle controller: matchmaking, Phaser field, HUD and deploy input.
 */
import { getCard, type BattleSnapshot, type MatchResult, type ServerMessage } from '@croyal/shared';
import { socket } from './net';
import { setUI, setGameVisible, hex, type Nav } from './ui';
import { GameField } from './field';
import { buildHand, computeFieldSize, elixirBarHtml, setElixir, fmtTime, nextCardHtml, setNextCard, type HandUI } from './hud';
import { haptic } from './telegram';
import { t, reasonText } from './i18n';
import { cardImageUrl } from './assets';

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
        <button id="leave" class="danger" style="padding:6px 12px">${t('common.leave')}</button>
        <span id="score" class="chip score">0 — 0</span>
        <span id="timer" class="chip timer">4:00</span>
      </div>
      <div id="arena" class="arena-host"></div>
      ${elixirBarHtml()}
      <div class="handbar">${nextCardHtml()}<div class="hand" id="hand"></div></div>`;
    setUI(root);
    setGameVisible(false);
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
    setNextCard(root, snap.nextCard);
    const timer = root.querySelector<HTMLSpanElement>('#timer');
    if (timer) timer.textContent = fmtTime(snap.timeLeft) + (snap.doubleElixir ? ' ×2' : '');
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
      const { w, h } = computeFieldSize();
      root = buildBattleUI();
      field = new GameField('arena', w, h, (tap) => {
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
