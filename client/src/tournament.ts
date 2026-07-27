/**
 * Solo tournament screen (4-player single-elimination vs bots). The server owns
 * the bracket; this screen renders it and hands off to the battle view for your
 * matches. Your matches are played live; bot pairings are auto-resolved server-side.
 */
import { type TournamentView, type ServerMessage } from '@croyal/shared';
import { socket } from './net';
import { setUI, setGameVisible, escapeHtml, type Nav } from './ui';
import { t } from './i18n';
import { haptic } from './telegram';

export async function startTournament(nav: Nav): Promise<void> {
  let off: (() => void) | null = null;
  const cleanup = () => { off?.(); off = null; };
  const back = () => { cleanup(); nav.toMenu(); };

  function roundLabel(r: number, total: number): string {
    if (r === total - 1) return t('tourney.final');
    if (r === total - 2) return t('tourney.semifinals');
    return t('tourney.round', { n: r + 1 });
  }

  function renderStart(): void {
    setGameVisible(false);
    const node = document.createElement('div');
    node.className = 'screen';
    node.innerHTML = `
      <div class="row space-between">
        <h1>${t('tourney.title')}</h1>
        <button id="back" class="secondary">${t('common.back')}</button>
      </div>
      <div class="muted">${t('tourney.intro')}</div>
      <button id="start" class="accent big-battle">${t('tourney.start')}</button>`;
    setUI(node, { screen: 'tournament' });
    node.querySelector<HTMLButtonElement>('#back')!.onclick = back;
    node.querySelector<HTMLButtonElement>('#start')!.onclick = () => { haptic('light'); socket.send({ t: 'tournamentCreate' }); };
  }

  function renderView(view: TournamentView): void {
    setGameVisible(false);
    const total = Math.max(1, Math.round(Math.log2(view.size)));
    const matchRow = (m: TournamentView['rounds'][number][number]) => {
      const aWin = m.winner === 0, bWin = m.winner === 1;
      return `
        <div class="card tourney-match ${m.youIn ? 'you' : ''}">
          <div class="row space-between">
            <span class="${aWin ? 'tourney-win' : ''}">${escapeHtml(m.aName)}${aWin ? ' ✓' : ''}</span>
            <span class="muted">vs</span>
            <span class="${bWin ? 'tourney-win' : ''}">${escapeHtml(m.bName)}${bWin ? ' ✓' : ''}</span>
          </div>
        </div>`;
    };
    const bracket = view.rounds.map((round, ri) => `
      <div class="tourney-round">
        <div class="muted tourney-round-label">${roundLabel(ri, total)}</div>
        ${round.map(matchRow).join('')}
      </div>`).join('');

    let action = '';
    if (view.status === 'yourTurn') {
      action = `<button id="play" class="accent big-battle">${t('tourney.play')}</button>`;
    } else if (view.status === 'playing') {
      action = `<div class="muted">${t('tourney.playing')}</div>`;
    } else {
      const title = view.status === 'champion' ? t('tourney.champion')
        : view.status === 'eliminated' ? t('tourney.eliminated') : t('tourney.done');
      const prize = view.prizeGems > 0 ? t('tourney.prize', { n: view.prizeGems }) : t('tourney.noPrize');
      action = `
        <div class="card col" style="align-items:center">
          <h2>${title}</h2>
          <div class="${view.prizeGems > 0 ? '' : 'muted'}">${prize}</div>
        </div>
        <button id="new" class="accent">${t('tourney.new')}</button>`;
    }

    const node = document.createElement('div');
    node.className = 'screen';
    node.innerHTML = `
      <div class="row space-between">
        <h1>${t('tourney.title')}</h1>
        <button id="back" class="secondary">${t('common.back')}</button>
      </div>
      ${bracket}
      ${action}`;
    setUI(node, { screen: 'tournament' });
    node.querySelector<HTMLButtonElement>('#back')!.onclick = back;
    node.querySelector<HTMLButtonElement>('#play')?.addEventListener('click', () => {
      haptic('light');
      cleanup(); // the battle view takes over the socket; we return via nav.toTournament
      nav.toTournamentMatch();
    });
    node.querySelector<HTMLButtonElement>('#new')?.addEventListener('click', () => { haptic('light'); socket.send({ t: 'tournamentCreate' }); });
  }

  renderStart(); // default until the server reports an active bracket
  try {
    await socket.connect();
  } catch {
    return; // renderStart stays; user can retry from the menu
  }
  off = socket.on((msg: ServerMessage) => {
    if (msg.t === 'tournamentState') renderView(msg.view);
  });
  socket.send({ t: 'tournamentSync' }); // resume an in-progress bracket if any
}
