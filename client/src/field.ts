/**
 * Phaser 3 renderer for the arena (used by both battle and boss raid).
 * Entities arrive as plain EntitySnapshot[]; the scene redraws them each frame.
 * Coordinates are transformed so YOUR side is always at the bottom.
 */
import Phaser from 'phaser';
import {
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, BRIDGE_X, type EntitySnapshot,
} from '@croyal/shared';

export interface FieldTap {
  x: number; // tile coords (absolute, server space)
  y: number;
}

class FieldScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private entities: EntitySnapshot[] = [];
  private flip = false;
  private w = 0;
  private h = 0;
  private onTap: (t: FieldTap) => void = () => {};

  constructor() {
    super('field');
  }

  init(data: { width: number; height: number; flip: boolean; onTap: (t: FieldTap) => void }) {
    this.w = data.width;
    this.h = data.height;
    this.flip = data.flip;
    this.onTap = data.onTap;
  }

  create() {
    this.gfx = this.add.graphics();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.onTap(this.toTile(p.x, p.y));
    });
  }

  setData2(entities: EntitySnapshot[], flip: boolean) {
    this.entities = entities;
    this.flip = flip;
  }

  private sx() { return this.w / ARENA_WIDTH; }
  private sy() { return this.h / ARENA_HEIGHT; }

  private toPx(x: number, y: number): { px: number; py: number } {
    if (this.flip) return { px: this.w - x * this.sx(), py: this.h - y * this.sy() };
    return { px: x * this.sx(), py: y * this.sy() };
  }

  private toTile(px: number, py: number): FieldTap {
    if (this.flip) return { x: (this.w - px) / this.sx(), y: (this.h - py) / this.sy() };
    return { x: px / this.sx(), y: py / this.sy() };
  }

  update() {
    const g = this.gfx;
    if (!g) return;
    g.clear();

    // background halves
    const river = this.toPx(0, RIVER_Y).py;
    g.fillStyle(0x1f3a2e, 1).fillRect(0, 0, this.w, this.h);
    // top/bottom tint
    g.fillStyle(0x24402f, 1).fillRect(0, Math.min(river, this.h - river), this.w, Math.abs(this.h - 2 * Math.min(river, this.h - river)));

    // river
    const riverThickness = this.sy() * 1.4;
    g.fillStyle(0x1565c0, 0.85).fillRect(0, river - riverThickness / 2, this.w, riverThickness);
    // bridges
    g.fillStyle(0x6d4c41, 1);
    for (const bx of BRIDGE_X) {
      const { px } = this.toPx(bx, RIVER_Y);
      g.fillRect(px - this.sx() * 0.7, river - riverThickness / 2, this.sx() * 1.4, riverThickness);
    }

    // entities
    for (const e of this.entities) {
      const { px, py } = this.toPx(e.x, e.y);
      const isTower = e.kind === 'tower';
      const isBoss = e.id === 'boss';
      const size = isBoss ? this.sx() * 2.4 : isTower ? this.sx() * 1.8 : this.sx() * 0.7;

      if (isTower || isBoss) {
        g.fillStyle(e.color, 1).fillRect(px - size / 2, py - size / 2, size, size);
      } else {
        g.fillStyle(e.color, 1).fillCircle(px, py, size);
        g.lineStyle(2, 0x000000, 0.4).strokeCircle(px, py, size);
      }

      // hp bar
      if (e.maxHp > 0 && e.hp < e.maxHp) {
        const bw = isBoss ? this.w * 0.6 : size * 1.6;
        const frac = Math.max(0, e.hp / e.maxHp);
        const bx = isBoss ? this.w / 2 - bw / 2 : px - bw / 2;
        const by = py - size / 2 - 8;
        g.fillStyle(0x000000, 0.6).fillRect(bx, by, bw, 5);
        g.fillStyle(frac > 0.3 ? 0x4caf50 : 0xe53935, 1).fillRect(bx, by, bw * frac, 5);
      }
    }
  }
}

export class GameField {
  private game: Phaser.Game;
  private scene: FieldScene | null = null;
  private flip = false;

  constructor(parentId: string, width: number, height: number, onTap: (t: FieldTap) => void) {
    const scene = new FieldScene();
    this.scene = scene;
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parentId,
      width,
      height,
      backgroundColor: '#11151c',
      scene,
      scale: { mode: Phaser.Scale.NONE },
    });
    this.game.scene.start('field', { width, height, flip: false, onTap });
  }

  setFlip(flip: boolean) { this.flip = flip; }

  render(entities: EntitySnapshot[]) {
    this.scene?.setData2(entities, this.flip);
  }

  destroy() {
    this.game.destroy(true);
  }
}
