/**
 * One entity's on-screen representation.
 *
 * Deliberately NOT a Phaser.Container per unit: a Container is its own batch
 * boundary, so 40 units would cost 40 extra draw-call flushes and complicate
 * depth sorting. Instead each view holds references into three flat layers
 * (ground / unit / overlay) which sort and batch as one.
 *
 * The sprite origin is (0.5, 0.9) — a feet anchor. Everything else depends on
 * it: squash has to pivot at the ground, the death topple has to rotate about
 * the feet, and the shadow has to sit at the origin.
 */
import Phaser from 'phaser';
import { COLOR, STATUS_TINT } from '../ui/tokens';
import {
  newGait, stepGait, beginLunge, beginFlash, beginDeath, isDying, deathDone,
  type GaitState, type Pose,
} from './anim';
import type { FxLayer } from './fx';
import type { Sampled } from './interp';

/** Feet anchor — see the note above; changing this breaks every offset. */
const ORIGIN_Y = 0.9;

export interface ViewLayers {
  ground: Phaser.GameObjects.Layer;
  unit: Phaser.GameObjects.Layer;
  overlay: Phaser.GameObjects.Layer;
}

export class UnitView {
  readonly id: string;
  readonly gait: GaitState;
  body: Phaser.GameObjects.Image | null = null;
  private shadow: Phaser.GameObjects.Image;
  private barBg: Phaser.GameObjects.Rectangle;
  private barLag: Phaser.GameObjects.Rectangle;
  private barFill: Phaser.GameObjects.Rectangle;
  private aura: Phaser.GameObjects.Image | null = null;
  private auraName = '';

  /** Health as drawn, and the trailing "lag bar" that catches up behind it. */
  private hpShown = 1;
  private hpLag = 1;
  private lastHp = 0;

  /** Screen position of the entity's feet, updated every frame. */
  px = 0;
  py = 0;
  size = 0;

  constructor(
    private scene: Phaser.Scene,
    private layers: ViewLayers,
    private fx: FxLayer,
    s: Sampled,
    textureKey: string | null,
  ) {
    this.id = s.id;
    this.gait = newGait(s.id);
    this.lastHp = s.hp;

    this.shadow = scene.add.image(0, 0, 'field:shadow').setVisible(false);
    layers.ground.add(this.shadow);

    if (textureKey) {
      this.body = scene.add.image(0, 0, textureKey).setOrigin(0.5, ORIGIN_Y);
      layers.unit.add(this.body);
    }

    this.barBg = scene.add.rectangle(0, 0, 10, 6, COLOR.black, 0.65).setOrigin(0.5, 0.5).setVisible(false);
    this.barLag = scene.add.rectangle(0, 0, 10, 4, COLOR.white, 0.85).setOrigin(0, 0.5).setVisible(false);
    this.barFill = scene.add.rectangle(0, 0, 10, 4, COLOR.hpHigh).setOrigin(0, 0.5).setVisible(false);
    layers.overlay.add([this.barBg, this.barLag, this.barFill]);
  }

  /** Play the deploy pop (skipped on a resync so it doesn't fire a firework). */
  markSpawned(silent: boolean): void {
    if (silent) { this.gait.spawnT = 999; return; }
    this.fx.ring(this.px, this.py, this.size * 1.4, 380, COLOR.gold200);
    this.fx.burst('dust', this.px, this.py, 8);
  }

  kill(): void {
    beginDeath(this.gait);
    this.fx.burst('dust', this.px, this.py, 8);
    this.fx.burst('smoke', this.px, this.py, 3);
  }

  get dying(): boolean { return isDying(this.gait); }
  get finished(): boolean { return deathDone(this.gait); }

  onAttack(dx: number, dy: number, ranged: boolean): void {
    beginLunge(this.gait, dx, dy, ranged);
  }

  /**
   * Update from a sampled snapshot. `px/py` are the feet position in canvas
   * pixels; `size` is the sprite box in pixels.
   */
  update(
    dt: number,
    s: Sampled | null,
    px: number,
    py: number,
    size: number,
    flip: boolean,
  ): void {
    this.px = px;
    this.py = py;
    this.size = size;

    const e = s?.e;
    const statuses = e?.statuses;
    const g = this.gait;

    if (s) {
      // Damage detection without any protocol change: the hp delta between two
      // interpolated samples. Also drives the floating number.
      if (s.hp < this.lastHp - 0.01 && !this.dying) {
        const dmg = this.lastHp - s.hp;
        beginFlash(g);
        const big = e ? dmg > e.maxHp * 0.12 : false;
        this.fx.damage(px, py - size * 0.9, dmg, big || e?.kind === 'tower');
        if (big) this.fx.impact('hit_slash', px, py - size * 0.4, size);
      }
      this.lastHp = s.hp;

      // Statuses shape the gait rather than just tinting the sprite: a frozen
      // unit that stops moving reads instantly; a blue tint alone does not.
      g.frozen = !!statuses?.some((k) => k === 'stun' || k === 'root');
      g.rate = statuses?.includes('slow') ? 0.5 : statuses?.includes('rage') ? 1.4 : 1;
    }

    const speed = s ? Math.hypot(s.vx, s.vy) : 0;
    const pose = stepGait(g, dt, {
      speed, vx: s?.vx ?? 0, size,
      flying: !!e?.flying,
    });

    this.applyPose(pose, px, py, size, flip, e);
    if (s && g.stepped && !this.dying && this.fx.quality === 'high') {
      this.fx.burst('dust', px, py, 2);
    }
    this.updateStatusAura(statuses, px, py, size);
    if (s) this.updateBar(dt, s, px, py, size, pose);
    else { this.barBg.setVisible(false); this.barLag.setVisible(false); this.barFill.setVisible(false); }
  }

  private applyPose(
    pose: Pose, px: number, py: number, size: number, flip: boolean,
    e: Sampled['e'] | undefined,
  ): void {
    const body = this.body;
    const isTower = e?.kind === 'tower';

    // Shadow: scale and fade with height off the ground. This sells the vertical
    // motion more than the bob itself does.
    if (!isTower) {
      const lift = pose.lift;
      const w = size * 0.72 * (1 - lift * 0.25);
      this.shadow.setVisible(true)
        .setPosition(px + pose.dx * 0.4, py)
        .setDisplaySize(w, w * 0.36)
        .setAlpha((0.3 - lift * 0.1) * pose.alpha);
    } else {
      this.shadow.setVisible(false);
    }

    if (!body) return;
    const base = size / Math.max(body.width, body.height || 1);
    body.setPosition(px + pose.dx, py + pose.dy);
    body.setScale(base * pose.sx, base * pose.sy);
    body.setRotation(pose.rot);
    body.setAlpha(pose.alpha);
    // Depth by ground Y so units correctly overlap front-to-back.
    body.setDepth(py);

    if (!isTower) body.setFlipX(flip ? this.gait.facing > 0 : this.gait.facing < 0);

    // setTintFill replaces the texture colour outright, giving a true white
    // silhouette flash — setTint would only multiply and barely show.
    if (pose.flash > 0.02) {
      body.setTintFill(COLOR.white);
      body.setAlpha(pose.alpha * (0.55 + 0.45 * pose.flash));
    } else {
      const tint = e?.statuses?.length
        ? STATUS_TINT.find(([k]) => e.statuses!.includes(k))
        : undefined;
      if (tint) body.setTint(tint[1]); else body.clearTint();
    }
  }

  private updateStatusAura(statuses: string[] | undefined, px: number, py: number, size: number): void {
    const want = !statuses?.length ? ''
      : statuses.includes('shield') ? 'shield_aura'
      : statuses.includes('rage') ? 'rage_aura'
      : statuses.includes('stun') || statuses.includes('root') ? 'freeze_crystal'
      : '';
    if (want !== this.auraName) {
      this.aura?.destroy();
      this.aura = want ? this.fx.makeAura(want) : null;
      this.auraName = want;
    }
    if (!this.aura) return;
    const pulse = 1 + 0.06 * Math.sin(this.scene.time.now / 180);
    const overBody = this.auraName !== 'rage_aura';
    this.aura.setVisible(true)
      .setPosition(px, overBody ? py - size * 0.45 : py)
      .setDisplaySize(size * 0.9 * pulse, size * (overBody ? 0.9 : 0.45) * pulse)
      .setAlpha(0.6)
      .setDepth(overBody ? py + 1 : 0);
    if (statuses?.includes('poison') && this.fx.quality === 'high') {
      // A slow drip rather than a constant emitter.
      if (Math.floor(this.scene.time.now / 500) % 2 === 0) this.fx.burst('poison', px, py - size * 0.3, 1);
    }
  }

  private updateBar(
    dt: number, s: Sampled, px: number, py: number, size: number, pose: Pose,
  ): void {
    const e = s.e;
    const isKing = e.kind === 'tower' && e.towerType === 'king';
    const always = e.kind === 'tower' && !isKing;
    const frac = e.maxHp > 0 ? Math.max(0, Math.min(1, s.hp / e.maxHp)) : 0;

    if (!(e.maxHp > 0) || (!always && frac >= 1) || this.dying) {
      this.barBg.setVisible(false); this.barLag.setVisible(false); this.barFill.setVisible(false);
      this.hpShown = this.hpLag = frac;
      return;
    }

    this.hpShown = frac;
    // The white lag bar drains ~300 ms behind the real value — the classic
    // fighting-game readability trick: you see how much you just lost.
    if (this.hpLag > this.hpShown) this.hpLag = Math.max(this.hpShown, this.hpLag - dt / 0.3);
    else this.hpLag = this.hpShown;

    const w = size * (e.kind === 'tower' ? 0.95 : 0.8);
    const top = py - size * (1 - (1 - ORIGIN_Y)) - 8 + pose.dy * 0.4;
    const left = px - w / 2;

    this.barBg.setVisible(true).setPosition(px, top).setSize(w + 2, 6);
    this.barLag.setVisible(true).setPosition(left, top).setSize(w * this.hpLag, 4);
    this.barFill.setVisible(true).setPosition(left, top).setSize(w * this.hpShown, 4)
      .setFillStyle(frac > 0.5 ? COLOR.hpHigh : frac > 0.25 ? COLOR.hpMid : COLOR.hpLow);
  }

  destroy(): void {
    this.body?.destroy();
    this.shadow.destroy();
    this.aura?.destroy();
    this.barBg.destroy();
    this.barLag.destroy();
    this.barFill.destroy();
  }
}
