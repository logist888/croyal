/**
 * Phaser 3 renderer for the arena (used by both battle and boss raid).
 * The static board (grass, river, bridges) is drawn once; entities redraw each
 * frame. Coordinates are transformed so YOUR side is always at the bottom.
 * All visuals are drawn with primitives — no external art assets.
 */
import Phaser from 'phaser';
import {
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, BRIDGE_X, type EntitySnapshot,
} from '@croyal/shared';

export interface FieldTap { x: number; y: number }

class FieldScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private entities: EntitySnapshot[] = [];
  private flip = false;
  private w = 0;
  private h = 0;
  private onTap: (t: FieldTap) => void = () => {};

  constructor() { super('field'); }

  init(data: { width: number; height: number; flip: boolean; onTap: (t: FieldTap) => void }) {
    this.w = data.width;
    this.h = data.height;
    this.flip = data.flip;
    this.onTap = data.onTap;
  }

  create() {
    this.bg = this.add.graphics();
    this.gfx = this.add.graphics();
    this.drawBoard();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(this.toTile(p.x, p.y)));
  }

  setData2(entities: EntitySnapshot[], flip: boolean) {
    this.entities = entities;
    this.flip = flip;
  }

  private sx() { return this.w / ARENA_WIDTH; }
  private sy() { return this.h / ARENA_HEIGHT; }

  private toPx(x: number, y: number) {
    if (this.flip) return { px: this.w - x * this.sx(), py: this.h - y * this.sy() };
    return { px: x * this.sx(), py: y * this.sy() };
  }
  private toTile(px: number, py: number): FieldTap {
    if (this.flip) return { x: (this.w - px) / this.sx(), y: (this.h - py) / this.sy() };
    return { x: px / this.sx(), y: py / this.sy() };
  }

  /** Static board: checkered grass, river and bridges (symmetric, flip-independent). */
  private drawBoard() {
    const g = this.bg;
    const sx = this.sx();
    const sy = this.sy();
    const riverPy = RIVER_Y * sy;

    g.fillStyle(0x3a8f3a, 1).fillRect(0, 0, this.w, this.h);
    // checker
    const cell = 2;
    for (let ty = 0; ty < ARENA_HEIGHT; ty += cell) {
      for (let tx = 0; tx < ARENA_WIDTH; tx += cell) {
        const dark = ((tx / cell) + (ty / cell)) % 2 === 0;
        g.fillStyle(dark ? 0x357f35 : 0x3f9b3f, 1);
        g.fillRect(tx * sx, ty * sy, cell * sx, cell * sy);
      }
    }
    // darker enemy-half tint (top)
    g.fillStyle(0x000000, 0.06).fillRect(0, 0, this.w, riverPy);

    // river
    const rt = sy * 1.6;
    g.fillStyle(0x1565c0, 1).fillRect(0, riverPy - rt / 2, this.w, rt);
    g.fillStyle(0x42a5f5, 0.6).fillRect(0, riverPy - rt / 2, this.w, rt * 0.25);
    g.fillStyle(0x0d47a1, 0.5).fillRect(0, riverPy + rt / 2 - rt * 0.18, this.w, rt * 0.18);

    // bridges with planks
    for (const bx of BRIDGE_X) {
      const cx = bx * sx;
      const bw = sx * 1.6;
      g.fillStyle(0x8d6e3a, 1).fillRect(cx - bw / 2, riverPy - rt / 2, bw, rt);
      g.fillStyle(0x6d4c2a, 1);
      const planks = 4;
      for (let i = 0; i < planks; i++) {
        g.fillRect(cx - bw / 2, riverPy - rt / 2 + (i + 0.5) * (rt / planks) - 1, bw, 2);
      }
      g.lineStyle(2, 0x5a3d20, 1).strokeRect(cx - bw / 2, riverPy - rt / 2, bw, rt);
    }

    // outer border
    g.lineStyle(3, 0x244a18, 1).strokeRect(1, 1, this.w - 2, this.h - 2);
  }

  update() {
    const g = this.gfx;
    if (!g) return;
    g.clear();
    const sx = this.sx();

    for (const e of this.entities) {
      const { px, py } = this.toPx(e.x, e.y);
      const isBoss = e.id === 'boss';
      const isTower = e.kind === 'tower';

      if (isBoss) { this.drawBoss(px, py, sx, e); continue; }
      if (isTower) { this.drawTower(px, py, sx, e); continue; }

      // unit: shadow + body + outline
      const r = sx * 0.62;
      g.fillStyle(0x000000, 0.25).fillEllipse(px, py + r * 0.7, r * 1.8, r * 0.8);
      g.fillStyle(e.color, 1).fillCircle(px, py, r);
      g.fillStyle(0xffffff, 0.18).fillCircle(px - r * 0.3, py - r * 0.3, r * 0.4);
      g.lineStyle(2, 0x1a1a1a, 0.55).strokeCircle(px, py, r);
      this.hpBar(px, py - r - 7, r * 2.0, e);
    }
  }

  private drawTower(px: number, py: number, sx: number, e: EntitySnapshot) {
    const g = this.gfx;
    const king = e.towerType === 'king';
    const s = (king ? 2.2 : 1.8) * sx;
    const x = px - s / 2;
    const y = py - s / 2;
    // base
    g.fillStyle(0x000000, 0.22).fillEllipse(px, py + s * 0.42, s * 1.05, s * 0.4);
    g.fillStyle(shade(e.color, -0.25), 1).fillRoundedRect(x, y, s, s, 6);
    g.fillStyle(e.color, 1).fillRoundedRect(x + 3, y + 3, s - 6, s - 9, 6);
    g.fillStyle(0xffffff, 0.18).fillRoundedRect(x + 3, y + 3, s - 6, (s - 9) * 0.4, 6);
    g.lineStyle(2, shade(e.color, -0.4), 1).strokeRoundedRect(x, y, s, s, 6);
    // crown for king
    if (king) {
      const cw = s * 0.55;
      const cx = px - cw / 2;
      const cy = y - cw * 0.5;
      g.fillStyle(0xffd54a, 1);
      g.fillTriangle(cx, cy + cw * 0.5, cx + cw * 0.16, cy, cx + cw * 0.32, cy + cw * 0.5);
      g.fillTriangle(cx + cw * 0.34, cy + cw * 0.5, cx + cw * 0.5, cy - cw * 0.08, cx + cw * 0.66, cy + cw * 0.5);
      g.fillTriangle(cx + cw * 0.68, cy + cw * 0.5, cx + cw * 0.84, cy, cx + cw, cy + cw * 0.5);
      g.fillRect(cx, cy + cw * 0.45, cw, cw * 0.18);
    }
    this.hpBar(px, y - (king ? s * 0.55 : 9), s * 0.95, e);
  }

  private drawBoss(px: number, py: number, sx: number, e: EntitySnapshot) {
    const g = this.gfx;
    const r = sx * 1.5;
    g.fillStyle(0x000000, 0.3).fillEllipse(px, py + r * 0.7, r * 2.0, r * 0.7);
    // spikes
    g.fillStyle(0x4a148c, 1);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.fillTriangle(
        px + Math.cos(a) * r, py + Math.sin(a) * r,
        px + Math.cos(a + 0.3) * r * 0.8, py + Math.sin(a + 0.3) * r * 0.8,
        px + Math.cos(a) * r * 1.4, py + Math.sin(a) * r * 1.4,
      );
    }
    g.fillStyle(e.color, 1).fillCircle(px, py, r);
    g.fillStyle(0xffffff, 0.15).fillCircle(px - r * 0.3, py - r * 0.3, r * 0.45);
    g.lineStyle(3, 0x311b92, 1).strokeCircle(px, py, r);
    // eyes
    g.fillStyle(0xff5252, 1).fillCircle(px - r * 0.3, py - r * 0.1, r * 0.12).fillCircle(px + r * 0.3, py - r * 0.1, r * 0.12);
  }

  private hpBar(cx: number, top: number, width: number, e: EntitySnapshot) {
    if (!(e.maxHp > 0) || e.hp >= e.maxHp) return;
    const g = this.gfx;
    const frac = Math.max(0, e.hp / e.maxHp);
    const bx = cx - width / 2;
    g.fillStyle(0x000000, 0.65).fillRoundedRect(bx - 1, top - 1, width + 2, 6, 2);
    g.fillStyle(frac > 0.5 ? 0x4caf50 : frac > 0.25 ? 0xffb300 : 0xe53935, 1)
      .fillRoundedRect(bx, top, width * frac, 4, 2);
  }
}

function shade(color: number, amt: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amt)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
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
      backgroundColor: '#173017',
      scene,
      scale: { mode: Phaser.Scale.NONE },
    });
    this.game.scene.start('field', { width, height, flip: false, onTap });
  }

  setFlip(flip: boolean) { this.flip = flip; }
  render(entities: EntitySnapshot[]) { this.scene?.setData2(entities, this.flip); }
  destroy() { this.game.destroy(true); }
}
