/**
 * Phaser 3 renderer for the arena (battle + boss raid).
 * Uses sliced art textures when present (sprite pool), otherwise falls back to
 * drawn placeholder shapes. The static board (grass/river/bridges) is drawn once,
 * or replaced by an arena background image if one was provided. Your side is
 * always rendered at the bottom.
 */
import Phaser from 'phaser';
import {
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, BRIDGE_X, type EntitySnapshot,
} from '@croyal/shared';
import { fieldLoadList, arenaImageUrl } from './assets';

export interface FieldTap { x: number; y: number }

interface InitData {
  width: number;
  height: number;
  flip: boolean;
  onTap: (t: FieldTap) => void;
  loadList: { key: string; url: string }[];
  arenaUrl?: string;
}

function textureKeyFor(e: EntitySnapshot): string | null {
  if (e.id === 'boss') return 'boss';
  if (e.kind === 'tower') return e.towerType === 'king' ? 'tower:king' : 'tower:princess';
  if (e.cardId) return `unit:${e.cardId}`;
  return null;
}
function boxTiles(e: EntitySnapshot): number {
  if (e.id === 'boss') return 3.4;
  if (e.kind === 'tower') return e.towerType === 'king' ? 2.4 : 2.0;
  return 1.5;
}

class FieldScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private entities: EntitySnapshot[] = [];
  private flip = false;
  private w = 0;
  private h = 0;
  private onTap: (t: FieldTap) => void = () => {};
  private loadList: { key: string; url: string }[] = [];
  private arenaUrl?: string;

  constructor() { super('field'); }

  init(data: InitData) {
    this.w = data.width;
    this.h = data.height;
    this.flip = data.flip;
    this.onTap = data.onTap;
    this.loadList = data.loadList;
    this.arenaUrl = data.arenaUrl;
  }

  preload() {
    for (const { key, url } of this.loadList) this.load.image(key, url);
    if (this.arenaUrl) this.load.image('arena', this.arenaUrl);
  }

  create() {
    this.bg = this.add.graphics().setDepth(-10);
    if (this.textures.exists('arena')) {
      const img = this.add.image(this.w / 2, this.h / 2, 'arena').setDepth(-10);
      img.setDisplaySize(this.w, this.h);
    } else {
      this.drawBoard();
    }
    this.gfx = this.add.graphics().setDepth(10000);
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

  private drawBoard() {
    const g = this.bg;
    const sx = this.sx();
    const sy = this.sy();
    const riverPy = RIVER_Y * sy;
    g.fillStyle(0x3a8f3a, 1).fillRect(0, 0, this.w, this.h);
    const cell = 2;
    for (let ty = 0; ty < ARENA_HEIGHT; ty += cell) {
      for (let tx = 0; tx < ARENA_WIDTH; tx += cell) {
        const dark = ((tx / cell) + (ty / cell)) % 2 === 0;
        g.fillStyle(dark ? 0x357f35 : 0x3f9b3f, 1).fillRect(tx * sx, ty * sy, cell * sx, cell * sy);
      }
    }
    g.fillStyle(0x000000, 0.06).fillRect(0, 0, this.w, riverPy);
    const rt = sy * 1.6;
    g.fillStyle(0x1565c0, 1).fillRect(0, riverPy - rt / 2, this.w, rt);
    g.fillStyle(0x42a5f5, 0.6).fillRect(0, riverPy - rt / 2, this.w, rt * 0.25);
    for (const bx of BRIDGE_X) {
      const cx = bx * sx;
      const bw = sx * 1.6;
      g.fillStyle(0x8d6e3a, 1).fillRect(cx - bw / 2, riverPy - rt / 2, bw, rt);
      g.fillStyle(0x6d4c2a, 1);
      for (let i = 0; i < 4; i++) g.fillRect(cx - bw / 2, riverPy - rt / 2 + (i + 0.5) * (rt / 4) - 1, bw, 2);
      g.lineStyle(2, 0x5a3d20, 1).strokeRect(cx - bw / 2, riverPy - rt / 2, bw, rt);
    }
    g.lineStyle(3, 0x244a18, 1).strokeRect(1, 1, this.w - 2, this.h - 2);
  }

  update() {
    const g = this.gfx;
    if (!g) return;
    g.clear();
    const sx = this.sx();
    const seen = new Set<string>();

    for (const e of this.entities) {
      seen.add(e.id);
      const { px, py } = this.toPx(e.x, e.y);
      const key = textureKeyFor(e);

      if (key && this.textures.exists(key)) {
        let img = this.sprites.get(e.id);
        if (!img) { img = this.add.image(px, py, key); this.sprites.set(e.id, img); }
        else img.setTexture(key);
        const box = boxTiles(e) * sx;
        const scale = box / Math.max(img.width, img.height || 1);
        img.setScale(scale).setPosition(px, py).setDepth(py).setVisible(true);
        this.hpBar(px, py - box / 2 - 7, box * 0.8, e);
      } else {
        const dead = this.sprites.get(e.id);
        if (dead) { dead.destroy(); this.sprites.delete(e.id); }
        this.drawShape(px, py, sx, e);
      }
    }

    for (const [id, img] of this.sprites) {
      if (!seen.has(id)) { img.destroy(); this.sprites.delete(id); }
    }
  }

  private drawShape(px: number, py: number, sx: number, e: EntitySnapshot) {
    if (e.id === 'boss') return this.drawBoss(px, py, sx, e);
    if (e.kind === 'tower') return this.drawTower(px, py, sx, e);
    const g = this.gfx;
    const r = sx * 0.62;
    g.fillStyle(0x000000, 0.25).fillEllipse(px, py + r * 0.7, r * 1.8, r * 0.8);
    g.fillStyle(e.color, 1).fillCircle(px, py, r);
    g.fillStyle(0xffffff, 0.18).fillCircle(px - r * 0.3, py - r * 0.3, r * 0.4);
    g.lineStyle(2, 0x1a1a1a, 0.55).strokeCircle(px, py, r);
    this.hpBar(px, py - r - 7, r * 2.0, e);
  }

  private drawTower(px: number, py: number, sx: number, e: EntitySnapshot) {
    const g = this.gfx;
    const king = e.towerType === 'king';
    const s = (king ? 2.2 : 1.8) * sx;
    const x = px - s / 2;
    const y = py - s / 2;
    g.fillStyle(0x000000, 0.22).fillEllipse(px, py + s * 0.42, s * 1.05, s * 0.4);
    g.fillStyle(shade(e.color, -0.25), 1).fillRoundedRect(x, y, s, s, 6);
    g.fillStyle(e.color, 1).fillRoundedRect(x + 3, y + 3, s - 6, s - 9, 6);
    g.fillStyle(0xffffff, 0.18).fillRoundedRect(x + 3, y + 3, s - 6, (s - 9) * 0.4, 6);
    g.lineStyle(2, shade(e.color, -0.4), 1).strokeRoundedRect(x, y, s, s, 6);
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
    g.fillStyle(0xff5252, 1).fillCircle(px - r * 0.3, py - r * 0.1, r * 0.12).fillCircle(px + r * 0.3, py - r * 0.1, r * 0.12);
    this.hpBar(px, py - r - 10, r * 1.6, e);
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
    this.game.scene.start('field', {
      width, height, flip: false, onTap,
      loadList: fieldLoadList(),
      arenaUrl: arenaImageUrl(),
    });
  }

  setFlip(flip: boolean) { this.flip = flip; }
  render(entities: EntitySnapshot[]) { this.scene?.setData2(entities, this.flip); }
  destroy() { this.game.destroy(true); }
}
