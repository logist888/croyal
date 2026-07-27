/**
 * The arena scene: board, unit views, effects, camera feel.
 *
 * Draw order is five flat layers rather than nested containers, so everything
 * batches and only the unit layer needs depth sorting:
 *   -20 board    static arena art / drawn board
 *   -10 ground   shadows, spell zones, deploy rings, auras
 *     0 unit     bodies (sorted by ground Y)
 *    10 fx       projectiles, particles, impacts
 *    20 overlay  HP bars, damage numbers, tower HP text
 */
import Phaser from 'phaser';
import {
  ARENA_WIDTH, ARENA_HEIGHT, RIVER_Y, BRIDGE_X,
  type EntitySnapshot, type AttackEvent, type ZoneSnapshot,
} from '@croyal/shared';
import { COLOR } from '../ui/tokens';
import { getTier as deviceTier, setTier as setDeviceTier } from '../ui/device';
import { SnapshotBuffer, type Sampled } from './interp';
import { UnitView } from './unit-view';
import { FxLayer, projectileSprite, type QualityTier } from './fx';

export interface FieldTap { x: number; y: number }

export interface InitData {
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
  return 1.7;
}

export class FieldScene extends Phaser.Scene {
  private board!: Phaser.GameObjects.Graphics;
  private vector!: Phaser.GameObjects.Graphics; // zones / markers / overlays
  private layers!: {
    board: Phaser.GameObjects.Layer;
    ground: Phaser.GameObjects.Layer;
    unit: Phaser.GameObjects.Layer;
    fx: Phaser.GameObjects.Layer;
    overlay: Phaser.GameObjects.Layer;
  };
  private fx!: FxLayer;
  private buffer = new SnapshotBuffer();
  private views = new Map<string, UnitView>();
  private dying: UnitView[] = [];
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private arenaImg: Phaser.GameObjects.Image | null = null;

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
  private deployActive = false;

  /** Frames are frozen while hit stop is active, but effects keep ticking. */
  private hitStopUntil = 0;
  /** Rolling FPS used to drop to the low-quality tier on weak devices. */
  private fpsAcc = 0;
  private fpsFrames = 0;
  private slowFor = 0;
  private tier: QualityTier = 'high';

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
    this.makeShadowTexture();

    this.layers = {
      board: this.add.layer().setDepth(-20),
      ground: this.add.layer().setDepth(-10),
      unit: this.add.layer().setDepth(0),
      fx: this.add.layer().setDepth(10),
      overlay: this.add.layer().setDepth(20),
    };

    this.board = this.add.graphics();
    this.layers.board.add(this.board);
    this.vector = this.add.graphics();
    this.layers.ground.add(this.vector);

    this.paintBackground();
    this.sliceUnitSheets();
    this.fx = new FxLayer(this, this.layers);
    this.detectTier();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(this.toTile(p.x, p.y)));
    // rAF stops while backgrounded, so the render clock would come back stale.
    this.game.events.on(Phaser.Core.Events.RESUME, () => this.buffer.reset());
  }

  /** Soft radial blob, generated once and reused for every unit's shadow. */
  private makeShadowTexture(): void {
    if (this.textures.exists('field:shadow')) return;
    const size = 64;
    const tex = this.textures.createCanvas('field:shadow', size, size);
    const ctx = tex?.getContext();
    if (!ctx || !tex) return;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  private detectTier(): void {
    // One judgement app-wide (ui/device.ts) so the hub's glass and the field's
    // effect budget can never disagree. Canvas2D has no cheap tint or additive
    // blend, so a missing WebGL context forces low regardless of the hardware.
    const noWebgl = this.game.renderer.type === Phaser.CANVAS;
    this.setTier(noWebgl ? 'low' : deviceTier());
  }

  private setTier(tier: QualityTier): void {
    this.tier = tier;
    this.fx?.setTier(tier);
    // A device can be "high" on paper and still be thermally throttled. When the
    // field drops, the navigation bar must stop blurring too rather than
    // competing for the same GPU.
    setDeviceTier(tier);
  }

  private paintBackground(): void {
    this.board.clear();
    this.arenaImg?.destroy();
    this.arenaImg = null;
    if (this.textures.exists('arena')) {
      const img = this.add.image(this.w / 2, this.h / 2, 'arena');
      img.setDisplaySize(this.w, this.h);
      this.layers.board.add(img);
      this.arenaImg = img;
    } else {
      this.drawBoard();
    }
  }

  /**
   * Some unit art arrives as 4x4 sprite-sheet grids; drawing the whole grid made
   * units render as a cluster of tiny frames. Square-ish images are the
   * pipeline's single-frame cutouts and are left alone.
   */
  private sliceUnitSheets() {
    for (const { key } of this.loadList) {
      if (!key.startsWith('unit:') || !this.textures.exists(key)) continue;
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
      if (!src.width || !src.height) continue;
      const aspect = src.width / src.height;
      if (aspect > 0.85 && aspect < 1.18) continue;
      const sheetKey = `${key}:sheet`;
      if (this.textures.exists(sheetKey)) continue;
      this.textures.addSpriteSheet(sheetKey, src as unknown as HTMLImageElement, {
        frameWidth: Math.floor(src.width / 4),
        frameHeight: Math.floor(src.height / 4),
      });
    }
  }

  // ---- external API (called by GameField) ----

  pushSnapshot(entities: EntitySnapshot[], tick: number, flip: boolean) {
    this.flip = flip;
    this.buffer.push(tick, entities, performance.now());
  }

  hardResync() { this.buffer.reset(); }
  setMarker(m: { x: number; y: number; valid: boolean } | null) { this.marker = m; }
  setDeployActive(on: boolean) { this.deployActive = on; }
  setFastPhase(on: boolean) { this.fastPhase = on; }
  setZones(zones: ZoneSnapshot[]) { this.zones = zones; }
  pxToTile(px: number, py: number): FieldTap { return this.toTile(px, py); }

  resize(width: number, height: number) {
    if (width === this.w && height === this.h) return;
    this.w = width;
    this.h = height;
    this.scale.resize(width, height);
    this.cameras.resize(width, height);
    this.paintBackground();
  }

  /** Queue combat FX from a snapshot, anchored to the attacker where possible. */
  addEvents(events: AttackEvent[]) {
    for (const ev of events) {
      const from = this.toPx(ev.fromX, ev.fromY);
      const to = this.toPx(ev.toX, ev.toY);
      const sx = this.sx();
      let tint = ev.side === 'A' ? 0xbce8ff : 0xffb3a7;
      if (ev.effect === 'heal') tint = 0x8bf78b;
      else if (ev.effect === 'chain') tint = 0xfff176;

      if (ev.kind === 'spell') {
        const r = (ev.radius ?? 2) * sx;
        this.fx.ring(to.px, to.py, r * 2, 460, COLOR.gold500);
        this.fx.impact('explosion', to.px, to.py, r * 1.6, 0, 380);
        this.fx.burst('spark', to.px, to.py, 12, COLOR.gold500);
        this.shake(300, 0.010);
        continue;
      }
      if (ev.effect === 'heal') {
        this.fx.burst('heal', to.px, to.py, 6);
        continue;
      }
      if (ev.effect === 'spawn') {
        this.fx.ring(to.px, to.py, sx * 2.2, 320, COLOR.gold200);
        continue;
      }

      // Anchor the lunge to the nearest own-side view within ~0.6 tiles of the
      // event's origin. There is no attacker id on the wire; this is right the
      // overwhelming majority of the time and costs nothing.
      const attacker = this.nearestView(ev.fromX, ev.fromY, ev.side, 0.6);
      attacker?.onAttack(to.px - from.px, to.py - from.py, !!ev.ranged);

      if (ev.ranged) {
        const name = projectileSprite(attacker?.body?.texture.key.replace('unit:', ''), ev.effect);
        this.fx.projectile(name, from.px, from.py, to.px, to.py, 0.16, sx * 0.9, tint);
        this.fx.burst('spark', from.px, from.py, 2, tint);
      } else {
        this.fx.impact('hit_slash', to.px, to.py, sx * 1.4, Math.atan2(to.py - from.py, to.px - from.px));
      }
      this.fx.burst('impact', to.px, to.py, 3, tint);
      this.shake(160, 0.003);
    }
  }

  private nearestView(tx: number, ty: number, side: string, maxTiles: number): UnitView | null {
    const p = this.toPx(tx, ty);
    const limit = maxTiles * this.sx();
    let best: UnitView | null = null;
    let bestD = limit * limit;
    for (const v of this.views.values()) {
      if (v.dying) continue;
      const d = (v.px - p.px) ** 2 + (v.py - p.py) ** 2;
      if (d < bestD) { bestD = d; best = v; }
    }
    void side;
    return best;
  }

  /** Camera shake, scaled down on the low tier. */
  private shake(ms: number, intensity: number): void {
    if (this.tier === 'low') return;
    this.cameras.main.shake(ms, intensity, false);
  }

  /** Freeze the simulation clock briefly — the cheapest way to add weight. */
  private hitStop(ms: number): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, this.time.now + ms);
  }

  // ---- coordinates ----

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

  // ---- frame ----

  update(_time: number, deltaMs: number) {
    if (!this.fx) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    this.trackFps(deltaMs);

    const frozen = this.time.now < this.hitStopUntil;
    const sample = this.buffer.sample(performance.now());
    const silent = this.buffer.consumeSilent();

    this.drawVector(dt);

    const byId = new Map<string, Sampled>();
    for (const s of sample.list) byId.set(s.id, s);

    for (const id of sample.spawned) {
      const s = byId.get(id);
      if (!s) continue;
      const view = this.makeView(s);
      const box = boxTiles(s.e) * this.sx();
      const p = this.toPx(s.x, s.y);
      // Position first, so the deploy ring lands where the unit does.
      view.update(0, s, p.px, p.py + box * (1 - 0.9), box, this.flip);
      view.markSpawned(silent || s.e.kind === 'tower');
    }

    for (const id of sample.died) {
      const view = this.views.get(id);
      if (!view) continue;
      this.views.delete(id);
      const label = this.labels.get(id);
      if (label) { label.destroy(); this.labels.delete(id); }
      if (silent) { view.destroy(); continue; }
      if (view.body && sample.gone.get(id)?.e.kind === 'tower') this.destroyTower(view);
      else { view.kill(); this.dying.push(view); }
    }

    // Live units.
    for (const s of sample.list) {
      const view = this.views.get(s.id);
      if (!view) continue;
      const box = boxTiles(s.e) * this.sx();
      const p = this.toPx(s.x, s.y);
      // Feet sit at the entity position; the sprite box extends upward.
      view.update(frozen ? 0 : dt, s, p.px, p.py, box, this.flip);
      if (s.e.kind === 'tower') this.towerLabel(s, p.px, p.py - box * 0.95);
    }

    // Units mid-death keep animating with no snapshot behind them.
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const v = this.dying[i];
      v.update(dt, null, v.px, v.py, v.size, this.flip);
      if (v.finished) { v.destroy(); this.dying.splice(i, 1); }
    }

    this.layers.unit.sort('depth');
  }

  private makeView(s: Sampled): UnitView {
    const key = textureKeyFor(s.e);
    const sheetKey = key ? `${key}:sheet` : null;
    const useSheet = sheetKey && this.textures.exists(sheetKey);
    const texture = useSheet ? sheetKey : key && this.textures.exists(key) ? key : null;
    const view = new UnitView(this, this.layers, this.fx, s, texture);
    this.views.set(s.id, view);
    return view;
  }

  /**
   * Tower destruction: flashes, a staggered burst of explosions, hit stop, a
   * heavy shake, then the tower topples. Previously it just vanished.
   */
  private destroyTower(view: UnitView): void {
    const { px, py, size } = view;
    this.hitStop(130);
    this.shake(450, 0.022);
    for (let i = 0; i < 12; i++) {
      const dx = ((i * 37) % 100 - 50) / 100 * size * 0.8;
      const dy = ((i * 53) % 100 - 50) / 100 * size * 0.6;
      this.time.delayedCall(i * 40, () => {
        this.fx.impact('explosion', px + dx, py - size * 0.4 + dy, size * 0.7, 0, 340);
        if (i % 3 === 0) this.fx.burst('smoke', px + dx, py + dy, 3);
      });
    }
    this.fx.burst('dust', px, py, 16);
    view.kill();
    this.dying.push(view);
  }

  private trackFps(deltaMs: number): void {
    this.fpsAcc += deltaMs;
    this.fpsFrames++;
    if (this.fpsAcc < 1000) return;
    const fps = (this.fpsFrames * 1000) / this.fpsAcc;
    this.fpsAcc = 0; this.fpsFrames = 0;
    if (this.tier === 'high' && fps < 45) {
      this.slowFor++;
      if (this.slowFor >= 2) this.setTier('low');
    } else {
      this.slowFor = 0;
    }
  }

  /** Vector overlays that change rarely: zones, deploy tint, marker, wash. */
  private drawVector(dt: number): void {
    const g = this.vector;
    g.clear();
    const sx = this.sx();

    this.zonePulse += dt;
    for (const z of this.zones) {
      const { px, py } = this.toPx(z.x, z.y);
      const r = z.radius * sx * (1 + 0.03 * Math.sin(this.zonePulse * 4));
      g.fillStyle(z.color, 0.14).fillCircle(px, py, r);
      g.lineStyle(2, z.color, 0.5).strokeCircle(px, py, r);
    }

    if (this.fastPhase) g.fillStyle(COLOR.hpMid, 0.07).fillRect(0, 0, this.w, this.h);

    if (this.deployActive) {
      const riverCenterPy = this.flip ? this.h - RIVER_Y * this.sy() : RIVER_Y * this.sy();
      const top = riverCenterPy + this.sy() * 0.8;
      g.fillStyle(0x4caf50, 0.1).fillRect(0, top, this.w, this.h - top);
      g.lineStyle(2, 0x8bf78b, 0.5);
      for (let x = 0; x < this.w; x += 28) g.lineBetween(x, top, Math.min(x + 14, this.w), top);
    }

    if (this.marker) {
      const { px, py } = this.toPx(this.marker.x, this.marker.y);
      const r = sx * 1.3;
      const col = this.marker.valid ? 0x4caf50 : COLOR.hpLow;
      g.fillStyle(col, 0.2).fillCircle(px, py, r);
      g.lineStyle(3, col, 0.95).strokeCircle(px, py, r);
      g.lineStyle(2, col, 0.6).strokeCircle(px, py, r * 0.5);
    }
  }

  /** HP number above towers: princess always, king only once damaged. */
  private towerLabel(s: Sampled, px: number, topY: number) {
    const e = s.e;
    const show = e.towerType !== 'king' || s.hp < e.maxHp;
    let txt = this.labels.get(e.id);
    if (!show) { txt?.setVisible(false); return; }
    if (!txt) {
      txt = this.add.text(px, topY, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '13px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1);
      this.layers.overlay.add(txt);
      this.labels.set(e.id, txt);
    }
    txt.setText(String(Math.max(0, Math.ceil(s.hp)))).setPosition(px, topY).setVisible(true);
  }

  private drawBoard() {
    const g = this.board;
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

  /** Diagnostics for the dev overlay. */
  stats() {
    return {
      views: this.views.size,
      dying: this.dying.length,
      tier: this.tier,
      buffer: this.buffer.health,
      draws: (this.game.renderer as { drawCount?: number }).drawCount ?? -1,
    };
  }
}
