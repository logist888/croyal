/**
 * Drag-to-deploy: press a hand card, drag it onto the field (a ghost follows the
 * finger and the field shows a valid/invalid placement marker), release to deploy.
 * Uses pointer capture so the gesture keeps tracking once it leaves the card.
 * A plain tap (no movement) is left alone so tap-to-select still works on desktop.
 */
import type { GameField, FieldTap } from './field';
import { cardTileHtml } from './ui/card-tile';
import { haptic } from './telegram';

export interface DragDeps {
  field: () => GameField | null;
  validate: (cardId: string, tile: FieldTap) => boolean;
  deploy: (cardId: string, tile: FieldTap) => void;
  /** Called true while the gesture is active so the hand pauses DOM rebuilds. */
  setHoldRender?: (hold: boolean) => void;
}

const MOVE_THRESHOLD = 6; // px before a press becomes a drag

export function beginCardDrag(cardId: string, cell: HTMLElement, ev: PointerEvent, deps: DragDeps): void {
  if (ev.button !== undefined && ev.button > 0) return; // ignore non-primary buttons
  const field = deps.field();
  if (!field) return;
  ev.preventDefault();

  const startX = ev.clientX;
  const startY = ev.clientY;
  let dragging = false;
  let ghost: HTMLDivElement | null = null;
  // Remember the tile's state so teardown restores it rather than forcing
  // 'normal' (which would wipe an 'unaffordable' or 'selected' card).
  const stateBefore = cell.dataset.state ?? 'normal';

  // Hold hand re-render for the whole gesture: a snapshot rebuilding the hand
  // mid-drag would remove this card and break pointer capture.
  deps.setHoldRender?.(true);
  try { cell.setPointerCapture(ev.pointerId); } catch { /* unsupported */ }

  const move = (e: PointerEvent) => {
    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < MOVE_THRESHOLD) return;
      dragging = true;
      cell.dataset.state = 'dragging';
      // The ghost is the same CardTile look, so what you drag matches what you
      // picked up (frame, rarity glow and cost all come along).
      const holder = document.createElement('div');
      holder.innerHTML = cardTileHtml({ cardId, size: 'sm', className: 'ct-ghost' });
      ghost = holder.firstElementChild as HTMLDivElement;
      document.body.appendChild(ghost);
    }
    const tile = field.screenToTile(e.clientX, e.clientY);
    const valid = !!tile && deps.validate(cardId, tile);
    field.setMarker(tile, valid);
    if (ghost) {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      ghost.classList.toggle('invalid', !valid);
    }
  };

  const teardown = () => {
    cell.removeEventListener('pointermove', move);
    cell.removeEventListener('pointerup', finish);
    cell.removeEventListener('pointercancel', cancel);
    try { cell.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    cell.dataset.state = stateBefore;
    field.setMarker(null, false);
    ghost?.remove();
    deps.setHoldRender?.(false);
  };

  const finish = (e: PointerEvent) => {
    teardown();
    if (!dragging) return; // a tap → let click-to-select handle it

    // Suppress the click that follows a drag so it doesn't toggle selection.
    cell.addEventListener('click', (c) => { c.stopImmediatePropagation(); c.preventDefault(); },
      { once: true, capture: true });

    const tile = field.screenToTile(e.clientX, e.clientY);
    if (tile && deps.validate(cardId, tile)) {
      deps.deploy(cardId, tile);
      haptic('light');
    }
  };

  const cancel = () => teardown();

  cell.addEventListener('pointermove', move);
  cell.addEventListener('pointerup', finish);
  cell.addEventListener('pointercancel', cancel);
}
