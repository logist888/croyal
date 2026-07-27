/**
 * Battle effects: pooled sprites and particle emitters.
 *
 * Replaces the old design where every projectile, particle, ring and HP bar was
 * re-issued into a single immediate-mode Graphics object 60 times a second —
 * which rebuilds its whole vertex buffer each frame and does not scale once
 * effects get richer.
 *
 * Emitters are created once per archetype in `create()` and then only told to
 * explode; creating an emitter per event is the classic Phaser perf trap.
 * Everything draws from the fx atlas, so the whole layer batches.
 */
import Phaser from 'phaser';

export type QualityTier = 'low' | 'high';

interface Pooled<T> { obj: T; active: boolean }

const PROJECTILE_POOL = 32;
const IMPACT_POOL = 24;
const RING_POOL = 12;
const DAMAGE_POOL = 16;

/** Which fx sprite a projectile should use, by attacker archetype. */
export function projectileSprite(cardId: string | undefined, effect?: string): string {
  if (effect === 'chain') return 'lightning_arc';
  if (!cardId) return 'arrow';
  if (/mage|wizard|fire|flame|dragon/i.test(cardId)) return 'fireball';
  if (/ice|frost|freeze|winter/i.test(cardId)) return 'frostbolt';
  if (/cannon|mortar|catapult|bomb|siege/i.test(cardId)) return 'cannonball';
  if (/star|priest|cleric|holy/i.test(cardId)) return 'star_bolt';
  return 'arrow';
}

export class FxLayer {
  private scene: Phaser.Scene;
  private layer: Phaser.GameObjects.Layer;
  private ground: Phaser.GameObjects.Layer;
  private overlay: Phaser.GameObjects.Layer;

  private projectiles: Pooled<Phaser.GameObjects.Image>[] = [];
  private impacts: Pooled<Phaser.GameObjects.Image>[] = [];
  private rings: Pooled<Phaser.GameObjects.Image>[] = [];
  private numbers: Pooled<Phaser.GameObjects.Text>[] = [];

  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();

  /** Live tweens keyed by nothing — Phaser owns them; we only track counts. */
  private tier: QualityTier = 'high';
  private hasAtlas = false;

  constructor(
    scene: Phaser.Scene,
    layers: { ground: Phaser.GameObjects.Layer; fx: Phaser.GameObjects.Layer; overlay: Phaser.GameObjects.Layer },
  ) {
    this.scene = scene;
    this.ground = layers.ground;
    this.layer = layers.fx;
    this.overlay = layers.overlay;
    this.hasAtlas = scene.textures.exists('fx:dust_puff') || scene.textures.exists('fx:explosion');
    this.buildPools();
    this.buildEmitters();
  }

  setTier(tier: QualityTier): void {
    this.tier = tier;
    for (const e of this.emitters.values()) {
      e.maxAliveParticles = tier === 'low' ? 40 : 140;
    }
  }

  get quality(): QualityTier { return this.tier; }

  private has(name: string): boolean {
    return this.scene.textures.exists(`fx:${name}`);
  }

  private buildPools(): void {
    const mk = (n: number, layer: Phaser.GameObjects.Layer) => {
      const out: Pooled<Phaser.GameObjects.Image>[] = [];
      for (let i = 0; i < n; i++) {
        const img = this.scene.add.image(0, 0, this.hasAtlas ? 'fx:dust_puff' : '__WHITE');
        img.setVisible(false).setActive(false);
        layer.add(img);
        out.push({ obj: img, active: false });
      }
      return out;
    };
    this.projectiles = mk(PROJECTILE_POOL, this.layer);
    this.impacts = mk(IMPACT_POOL, this.layer);
    this.rings = mk(RING_POOL, this.ground);

    for (let i = 0; i < DAMAGE_POOL; i++) {
      const txt = this.scene.add.text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '900',
        color: '#ffffff', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5, 1).setVisible(false).setActive(false);
      this.overlay.add(txt);
      this.numbers.push({ obj: txt, active: false });
    }
  }

  private buildEmitters(): void {
    if (!this.hasAtlas) return;
    const specs: Array<[string, string, Partial<Phaser.Types.GameObjects.Particles.ParticleEmitterConfig>]> = [
      ['dust', 'dust_puff', { speed: { min: 20, max: 70 }, scale: { start: 0.28, end: 0 }, alpha: { start: 0.7, end: 0 }, lifespan: 380 }],
      ['spark', 'star_bolt', { speed: { min: 60, max: 170 }, scale: { start: 0.22, end: 0 }, lifespan: 320, blendMode: 'ADD' }],
      ['impact', 'hit_slash', { speed: { min: 40, max: 120 }, scale: { start: 0.3, end: 0 }, lifespan: 260 }],
      ['heal', 'heal_sparkle', { speed: { min: 20, max: 60 }, gravityY: -60, scale: { start: 0.3, end: 0 }, lifespan: 520, blendMode: 'ADD' }],
      ['frost', 'frostbolt', { speed: { min: 20, max: 80 }, scale: { start: 0.2, end: 0 }, lifespan: 420, blendMode: 'ADD' }],
      ['poison', 'poison_cloud', { speed: { min: 8, max: 26 }, scale: { start: 0.3, end: 0.55 }, alpha: { start: 0.5, end: 0 }, lifespan: 900 }],
      ['smoke', 'smoke_ring', { speed: { min: 10, max: 40 }, scale: { start: 0.25, end: 0.6 }, alpha: { start: 0.55, end: 0 }, lifespan: 620 }],
      ['gold', 'star_bolt', { speed: { min: 60, max: 200 }, gravityY: 260, scale: { start: 0.3, end: 0 }, lifespan: 800, tint: 0xffd54a, blendMode: 'ADD' }],
    ];
    for (const [name, tex, cfg] of specs) {
      if (!this.has(tex)) continue;
      const em = this.scene.add.particles(0, 0, `fx:${tex}`, {
        ...cfg, frequency: -1, emitting: false, maxAliveParticles: 140,
      });
      this.layer.add(em);
      this.emitters.set(name, em);
    }
  }

  /** Fire n particles of an archetype at a screen position. */
  burst(kind: string, px: number, py: number, n: number, tint?: number): void {
    const em = this.emitters.get(kind);
    if (!em) return;
    const count = this.tier === 'low' ? Math.max(1, Math.round(n * 0.5)) : n;
    if (tint !== undefined) em.setParticleTint(tint);
    em.explode(count, px, py);
  }

  /** Fly a projectile sprite from a to b over `dur` seconds. */
  projectile(name: string, x0: number, y0: number, x1: number, y1: number, dur: number, size: number, tint?: number): void {
    const slot = this.projectiles.find((p) => !p.active);
    if (!slot) return;
    const key = this.has(name) ? `fx:${name}` : (this.has('arrow') ? 'fx:arrow' : null);
    if (!key) return;
    slot.active = true;
    const img = slot.obj;
    img.setTexture(key).setPosition(x0, y0).setVisible(true).setActive(true).setAlpha(1);
    img.setDisplaySize(size, size);
    img.setRotation(Math.atan2(y1 - y0, x1 - x0));
    if (tint !== undefined) img.setTint(tint); else img.clearTint();
    this.scene.tweens.add({
      targets: img, x: x1, y: y1, duration: dur * 1000, ease: 'Linear',
      onComplete: () => { img.setVisible(false).setActive(false); slot.active = false; },
    });
  }

  /** One-shot impact sprite that scales up and fades. */
  impact(name: string, px: number, py: number, size: number, rot = 0, ms = 240): void {
    const slot = this.impacts.find((p) => !p.active);
    if (!slot || !this.has(name)) return;
    slot.active = true;
    const img = slot.obj;
    img.setTexture(`fx:${name}`).setPosition(px, py).setRotation(rot)
      .setVisible(true).setActive(true).setAlpha(1).clearTint();
    img.setDisplaySize(size * 0.6, size * 0.6);
    this.scene.tweens.add({
      targets: img, alpha: 0, displayWidth: size * 1.25, displayHeight: size * 1.25,
      duration: ms, ease: 'Cubic.easeOut',
      onComplete: () => { img.setVisible(false).setActive(false); slot.active = false; },
    });
  }

  /** Expanding ground ring — deploys, spells, spawns. */
  ring(px: number, py: number, size: number, ms = 380, tint?: number): void {
    const slot = this.rings.find((p) => !p.active);
    if (!slot || !this.has('deploy_ring')) return;
    slot.active = true;
    const img = slot.obj;
    img.setTexture('fx:deploy_ring').setPosition(px, py)
      .setVisible(true).setActive(true).setAlpha(0.95).setRotation(0);
    img.setDisplaySize(size * 0.3, size * 0.3 * 0.55);
    if (tint !== undefined) img.setTint(tint); else img.clearTint();
    this.scene.tweens.add({
      targets: img, alpha: 0, displayWidth: size * 1.5, displayHeight: size * 1.5 * 0.55,
      duration: ms, ease: 'Cubic.easeOut',
      onComplete: () => { img.setVisible(false).setActive(false); slot.active = false; },
    });
  }

  /**
   * Floating damage number. Text objects are pooled and re-used: allocating one
   * per hit re-uploads a canvas texture to the GPU on every strike.
   */
  damage(px: number, py: number, amount: number, big: boolean): void {
    if (this.tier === 'low' && !big) return;
    const slot = this.numbers.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    const txt = slot.obj;
    txt.setText(String(Math.max(1, Math.round(amount))));
    txt.setFontSize(big ? 20 : 15);
    txt.setColor(big ? '#ffca28' : '#ffffff');
    // Nudge sideways so simultaneous hits don't stack into an unreadable blob.
    const jitter = ((Math.round(px + py) % 7) - 3) * 3;
    txt.setPosition(px + jitter, py).setAlpha(1).setScale(1.4).setVisible(true).setActive(true);
    this.scene.tweens.add({
      targets: txt, y: py - 26, alpha: 0, scale: 1,
      duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => { txt.setVisible(false).setActive(false); slot.active = false; },
    });
  }

  /** Persistent aura pinned under/over a unit (rage, shield, poison, freeze). */
  makeAura(name: string): Phaser.GameObjects.Image | null {
    if (!this.has(name)) return null;
    const img = this.scene.add.image(0, 0, `fx:${name}`).setVisible(false);
    this.ground.add(img);
    return img;
  }

  destroy(): void {
    for (const e of this.emitters.values()) e.destroy();
    this.emitters.clear();
  }
}
