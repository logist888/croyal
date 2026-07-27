/**
 * Public handle for the arena renderer.
 *
 * The surface is unchanged from the previous single-file renderer except that
 * `render()` now takes the snapshot tick (needed for real interpolation) and
 * `resize()` exists, so the field can react to Telegram viewport changes instead
 * of being frozen at whatever size the match started with.
 */
import Phaser from 'phaser';
import type { EntitySnapshot, AttackEvent, ZoneSnapshot } from '@croyal/shared';
import { fieldLoadList, arenaImageUrl } from '../assets';
import { FieldScene, type FieldTap } from './scene';

export type { FieldTap };

/** Cap device-pixel-ratio: past 2x the fill-rate cost stops buying visible sharpness. */
function pickDpr(): number {
  const raw = window.devicePixelRatio || 1;
  const weak = (navigator.hardwareConcurrency ?? 4) <= 4;
  return Math.min(raw, weak ? 1.5 : 2);
}

export class GameField {
  private game: Phaser.Game;
  private scene: FieldScene;
  private flip = false;
  private width: number;
  private height: number;
  private dpr: number;

  constructor(parentId: string, width: number, height: number, onTap: (t: FieldTap) => void, arenaId?: string) {
    this.width = width;
    this.height = height;
    this.dpr = pickDpr();
    const scene = new FieldScene();
    this.scene = scene;

    // The canvas is created at device resolution and scaled down by CSS. The
    // old renderer built it at CSS pixel size and let the browser upscale it,
    // which made every 128px cutout soft on a 2-3x phone.
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parentId,
      width: Math.round(width * this.dpr),
      height: Math.round(height * this.dpr),
      backgroundColor: '#173017',
      scene,
      scale: { mode: Phaser.Scale.NONE },
      render: { roundPixels: true, antialias: true, powerPreference: 'high-performance' },
      fps: { target: 60, min: 30, smoothStep: true },
    });
    this.game.events.once(Phaser.Core.Events.READY, () => this.applyCssSize());

    this.game.scene.start('field', {
      width: Math.round(width * this.dpr),
      height: Math.round(height * this.dpr),
      flip: false,
      onTap,
      loadList: fieldLoadList(),
      arenaUrl: arenaImageUrl(arenaId),
    });
  }

  private applyCssSize(): void {
    const canvas = this.game.canvas;
    if (!canvas) return;
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;
  }

  setFlip(flip: boolean) { this.flip = flip; }

  /** `tick` is the snapshot's 20 Hz server counter — it drives interpolation. */
  render(entities: EntitySnapshot[], tick: number) {
    this.scene.pushSnapshot(entities, tick, this.flip);
  }

  /** After a reconnect: drop the timeline and teleport, with no spawn/death FX. */
  hardResync() { this.scene.hardResync(); }

  addEvents(events: AttackEvent[]) { this.scene.addEvents(events); }
  setFastPhase(on: boolean) { this.scene.setFastPhase(on); }
  setZones(zones: ZoneSnapshot[]) { this.scene.setZones(zones); }

  /** Re-fit the arena (Telegram viewport change, rotation, keyboard). */
  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.game.scale.resize(Math.round(width * this.dpr), Math.round(height * this.dpr));
    this.scene.resize(Math.round(width * this.dpr), Math.round(height * this.dpr));
    this.applyCssSize();
  }

  /** Map a viewport point (clientX/clientY) to a field tile, or null if outside. */
  screenToTile(clientX: number, clientY: number): FieldTap | null {
    const canvas = this.game.canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const px = (clientX - rect.left) * ((this.width * this.dpr) / rect.width);
    const py = (clientY - rect.top) * ((this.height * this.dpr) / rect.height);
    return this.scene.pxToTile(px, py);
  }

  setMarker(tile: FieldTap | null, valid: boolean) {
    this.scene.setMarker(tile ? { x: tile.x, y: tile.y, valid } : null);
  }

  setDeployActive(on: boolean) { this.scene.setDeployActive(on); }

  /** Renderer diagnostics for the `?fps=1` overlay. */
  stats() { return this.scene.stats(); }

  destroy() { this.game.destroy(true); }
}
