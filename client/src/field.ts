/**
 * Phaser 3 renderer for the arena (battle + boss raid).
 * Uses sliced art textures when present (sprite pool), otherwise falls back to
 * drawn placeholder shapes. The static board (grass/river/bridges) is drawn once,
 * or replaced by an arena background image if one was provided. Your side is
 * always rendered at the bottom.
 */
import Phaser from 'phaser';
import {
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, BRIDGE_X,
  type EntitySnapshot, type AttackEvent, type ZoneSnapshot,
} from '@croyal/shared';
import { fieldLoadList, arenaImageUrl } from './assets';

/** Sprite tint per status (priority order — first present wins). */
const STATUS_TINTS: Array<[string, number]> = [
  ['stun', 0xaad4ff],
  ['root', 0xaad4ff],
  ['slow', 0x74b9ff],
  ['poison', 0x81c784],
  ['rage', 0xffa726],
];

/** Visual FX state (tile coords; converted to px flip-aware at draw time). */
interface Projectile { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; color: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number }
interface SpellRing { x: number; y: number; radius: number; t: number; dur: number }

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
  if (e.id === 'boss') return 3.8;
  // Towers are the focal structures — clearly larger than troops so the
  // king > princess > unit hierarchy reads at a glance.
  if (e.kind === 'tower') return e.towerType === 'king' ? 3.4 : 2.8;
  return 1.7; // troop sprites: big enough to read, small enough not to overhang the river
}

class FieldScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private fxUnder!: Phaser.GameObjects.Graphics; // shadows (under the sprites)
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private entities: EntitySnapshot[] = [];
  /** Smoothed display positions (tiles) — lerped toward the 10Hz snapshots. */
  private display = new Map<string, { x: number; y: number }>();
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private rings: SpellRing[] = [];
  private zones: ZoneSnapshot[] = [];
  private zonePulse = 0;
  private fastPhase = false;
  private flip = false;
  private w = 0;
  private h = 0;
  private onTap: (t: FieldTap) => void = () => {};
  private loadList: { key: string; url: string }[] = [];
  private arenaUrl?: string;
  private marker: { x: number; y: number; valid: boolean } | null = null;
  private deployActive = false; // tint the player's own half while a troop is armed (open mode)

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
    this.fxUnder = this.add.graphics().setDepth(-1);
    this.gfx = this.add.graphics().setDepth(10000);
    this.sliceUnitSheets();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(this.toTile(p.x, p.y)));
  }

  /**
   * Some unit art arrives as 4x4 sprite-sheet grids; drawing the whole grid
   * made units render as a cluster of tiny frames. Re-register those sheets
   * with their frame size so the field draws a single frame. Heuristic: the
   * art pipeline's single-frame cutouts are square (128x128) — only clearly
   * NON-square images are treated as grids.
   */
  private sliceUnitSheets() {
    for (const { key } of this.loadList) {
      if (!key.startsWith('unit:') || !this.textures.exists(key)) continue;
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
      if (!src.width || !src.height) continue;
      const aspect = src.width / src.height;
      if (aspect > 0.85 && aspect < 1.18) continue; // square-ish: a single frame
      const sheetKey = `${key}:sheet`;
      if (this.textures.exists(sheetKey)) continue;
      this.textures.addSpriteSheet(sheetKey, src as unknown as HTMLImageElement, {
        frameWidth: Math.floor(src.width / 4),
        frameHeight: Math.floor(src.height / 4),
      });
    }
  }

  setData2(entities: EntitySnapshot[], flip: boolean) {
    this.entities = entities;
    this.flip = flip;
  }

  setMarker(m: { x: number; y: number; valid: boolean } | null) {
    this.marker = m;
  }

  setDeployActive(on: boolean) {
    this.deployActive = on;
  }

  setFastPhase(on: boolean) {
    this.fastPhase = on;
  }

  setZones(zones: ZoneSnapshot[]) {
    this.zones = zones;
  }

  /** Queue combat FX from a snapshot (projectiles, impacts, spell rings). */
  addEvents(events: AttackEvent[]) {
    for (const ev of events) {
      let color = ev.side === 'A' ? 0xbce8ff : 0xffb3a7;
      if (ev.effect === 'heal') color = 0x8bf78b;
      else if (ev.effect === 'chain') color = 0xfff176;
      if (ev.kind === 'spell') {
        this.rings.push({ x: ev.toX, y: ev.toY, radius: ev.radius ?? 2, t: 0, dur: 0.45 });
        this.burst(ev.toX, ev.toY, 0xffc46b, 10);
        continue;
      }
      if (ev.effect === 'heal') {
        this.burst(ev.toX, ev.toY, color, 5);
        continue; // green sparkles only — no projectile spam from auras
      }
      if (ev.effect === 'spawn') {
        this.rings.push({ x: ev.toX, y: ev.toY, radius: 1.2, t: 0, dur: 0.3 });
        continue;
      }
      if (ev.ranged) {
        this.projectiles.push({ x0: ev.fromX, y0: ev.fromY, x1: ev.toX, y1: ev.toY, t: 0, dur: 0.16, color });
      }
      this.burst(ev.toX, ev.toY, color, 4);
    }
  }

  private burst(x: number, y: number, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 0.35, maxLife: 0.35, color,
      });
    }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  }

  /** Convert canvas pixel coords to tile coords (flip-aware). Public for drag. */
  pxToTile(px: number, py: number): FieldTap {
    return this.toTile(px, py);
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

  update(_time: number, deltaMs: number) {
    const g = this.gfx;
    if (!g) return;
    g.clear();
    this.fxUnder?.clear();
    const sx = this.sx();
    const seen = new Set<string>();
    const dt = Math.min(0.05, deltaMs / 1000);
    // Exponential smoothing toward the latest 10Hz snapshot (~90ms time constant)
    // so movement looks continuous instead of snapping 10 times a second.
    const lerpK = 1 - Math.exp(-deltaMs / 90);

    // Lingering spell zones (poison/slow) under the sprites, gently pulsing.
    this.zonePulse += dt;
    for (const z of this.zones) {
      const { px, py } = this.toPx(z.x, z.y);
      const r = z.radius * sx * (1 + 0.03 * Math.sin(this.zonePulse * 4));
      this.fxUnder.fillStyle(z.color, 0.14).fillCircle(px, py, r);
      this.fxUnder.lineStyle(2, z.color, 0.5).strokeCircle(px, py, r);
    }

    for (const e of this.entities) {
      seen.add(e.id);
      let disp = this.display.get(e.id);
      if (!disp || e.kind === 'tower') {
        disp = { x: e.x, y: e.y };
        this.display.set(e.id, disp);
      } else {
        disp.x += (e.x - disp.x) * lerpK;
        disp.y += (e.y - disp.y) * lerpK;
      }
      const { px, py } = this.toPx(disp.x, disp.y);
      const key = textureKeyFor(e);
      const sheetKey = key ? `${key}:sheet` : null;
      const useSheet = sheetKey && this.textures.exists(sheetKey);

      if (key && (useSheet || this.textures.exists(key))) {
        let img = this.sprites.get(e.id);
        if (!img) { img = this.add.image(px, py, useSheet ? sheetKey! : key, useSheet ? 0 : undefined); this.sprites.set(e.id, img); }
        const box = boxTiles(e) * sx;
        const scale = box / Math.max(img.width, img.height || 1);
        // ground shadow under the sprite
        if (e.kind !== 'tower') {
          this.fxUnder.fillStyle(0x000000, 0.28).fillEllipse(px, py + box * 0.42, box * 0.7, box * 0.26);
        }
        img.setScale(scale).setPosition(px, py).setDepth(py).setVisible(true);
        if (e.kind !== 'tower') img.setFlipX(this.flip ? e.side === 'A' : e.side === 'B');
        // Status tint (first matching by priority) + gold shield arc.
        const tint = e.statuses?.length ? STATUS_TINTS.find(([k]) => e.statuses!.includes(k)) : undefined;
        if (tint) img.setTint(tint[1]);
        else img.clearTint();
        if (e.statuses?.includes('shield')) {
          g.lineStyle(2.5, 0xffd54a, 0.9).strokeCircle(px, py, box * 0.55);
        }
        this.hpBar(px, py - box / 2 - 7, box * 0.8, e, e.kind === 'tower' && e.towerType !== 'king');
      } else {
        const dead = this.sprites.get(e.id);
        if (dead) { dead.destroy(); this.sprites.delete(e.id); }
        this.drawShape(px, py, sx, e);
        // Placeholder shapes get a status ring instead of a tint.
        const tint = e.statuses?.length ? STATUS_TINTS.find(([k]) => e.statuses!.includes(k)) : undefined;
        if (tint) g.lineStyle(2.5, tint[1], 0.9).strokeCircle(px, py, sx * 0.8);
        if (e.statuses?.includes('shield')) g.lineStyle(2.5, 0xffd54a, 0.9).strokeCircle(px, py, sx * 0.95);
      }

      if (e.kind === 'tower') this.towerLabel(e, px, py - (boxTiles(e) * sx) / 2 - 9);
    }

    for (const [id, img] of this.sprites) {
      if (!seen.has(id)) { img.destroy(); this.sprites.delete(id); }
    }
    for (const [id, txt] of this.labels) {
      if (!seen.has(id)) { txt.destroy(); this.labels.delete(id); }
    }
    for (const id of this.display.keys()) {
      if (!seen.has(id)) this.display.delete(id);
    }

    this.drawFx(dt);

    if (this.fastPhase) {
      g.fillStyle(0xffb300, 0.07).fillRect(0, 0, this.w, this.h);
    }

    // Open mode: while a troop is armed, tint the deployable area. The flip
    // keeps the player's own half at the bottom of the screen, so the zone is
    // always "below the river", regardless of side.
    if (this.deployActive) {
      const riverCenterPy = this.flip ? this.h - RIVER_Y * this.sy() : RIVER_Y * this.sy();
      const top = riverCenterPy + this.sy() * 0.8; // just past the river band
      g.fillStyle(0x4caf50, 0.1).fillRect(0, top, this.w, this.h - top);
      g.lineStyle(2, 0x8bf78b, 0.5);
      for (let x = 0; x < this.w; x += 28) g.lineBetween(x, top, Math.min(x + 14, this.w), top);
    }

    if (this.marker) {
      const { px, py } = this.toPx(this.marker.x, this.marker.y);
      const r = this.sx() * 1.3;
      const col = this.marker.valid ? 0x4caf50 : 0xe53935;
      g.fillStyle(col, 0.2).fillCircle(px, py, r);
      g.lineStyle(3, col, 0.95).strokeCircle(px, py, r);
      g.lineStyle(2, col, 0.6).strokeCircle(px, py, r * 0.5);
    }
  }

  /** Step + draw projectiles, impact particles and spell rings. */
  private drawFx(dt: number) {
    const g = this.gfx;
    const sx = this.sx();

    for (const p of this.projectiles) {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const { px, py } = this.toPx(p.x0 + (p.x1 - p.x0) * k, p.y0 + (p.y1 - p.y0) * k);
      g.fillStyle(p.color, 0.95).fillCircle(px, py, Math.max(2.5, sx * 0.16));
      g.fillStyle(0xffffff, 0.5).fillCircle(px, py, Math.max(1.2, sx * 0.07));
    }
    this.projectiles = this.projectiles.filter((p) => p.t < p.dur);

    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      const { px, py } = this.toPx(pt.x, pt.y);
      const a = Math.max(0, pt.life / pt.maxLife);
      const s = Math.max(2, sx * 0.14);
      g.fillStyle(pt.color, a * 0.9).fillRect(px - s / 2, py - s / 2, s, s);
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const r of this.rings) {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const { px, py } = this.toPx(r.x, r.y);
      const rad = r.radius * sx * (0.4 + 0.6 * k);
      g.lineStyle(3, 0xffc46b, (1 - k) * 0.9).strokeCircle(px, py, rad);
      g.fillStyle(0xffc46b, (1 - k) * 0.18).fillCircle(px, py, rad);
    }
    this.rings = this.rings.filter((r) => r.t < r.dur);
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
    this.hpBar(px, y - (king ? s * 0.55 : 9), s * 0.95, e, !king);
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

  /** HP number above towers: princess always, king only once active (damaged). */
  private towerLabel(e: EntitySnapshot, px: number, topY: number) {
    const show = e.towerType !== 'king' || e.hp < e.maxHp;
    let txt = this.labels.get(e.id);
    if (!show) { txt?.setVisible(false); return; }
    if (!txt) {
      txt = this.add.text(px, topY, '', {
        fontFamily: 'Arial, sans-serif', fontSize: '13px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(20000);
      this.labels.set(e.id, txt);
    }
    txt.setText(String(Math.max(0, Math.ceil(e.hp)))).setPosition(px, topY).setVisible(true);
  }

  private hpBar(cx: number, top: number, width: number, e: EntitySnapshot, always = false) {
    if (!(e.maxHp > 0) || (!always && e.hp >= e.maxHp)) return;
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
  private width: number;
  private height: number;

  constructor(parentId: string, width: number, height: number, onTap: (t: FieldTap) => void, arenaId?: string) {
    this.width = width;
    this.height = height;
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
      arenaUrl: arenaImageUrl(arenaId),
    });
  }

  setFlip(flip: boolean) { this.flip = flip; }
  render(entities: EntitySnapshot[]) { this.scene?.setData2(entities, this.flip); }
  addEvents(events: AttackEvent[]) { this.scene?.addEvents(events); }
  setFastPhase(on: boolean) { this.scene?.setFastPhase(on); }
  setZones(zones: ZoneSnapshot[]) { this.scene?.setZones(zones); }

  /** Map a viewport point (clientX/clientY) to a field tile, or null if outside. */
  screenToTile(clientX: number, clientY: number): FieldTap | null {
    const canvas = this.game.canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const px = (clientX - rect.left) * (this.width / rect.width);
    const py = (clientY - rect.top) * (this.height / rect.height);
    return this.scene?.pxToTile(px, py) ?? null;
  }

  setMarker(tile: FieldTap | null, valid: boolean) {
    this.scene?.setMarker(tile ? { x: tile.x, y: tile.y, valid } : null);
  }

  setDeployActive(on: boolean) {
    this.scene?.setDeployActive(on);
  }

  destroy() { this.game.destroy(true); }
}
