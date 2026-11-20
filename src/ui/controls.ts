import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { PAL } from './palette';
import { pixelText } from './pixelFont';
import { t } from './strings';

// Touch controls in the bottom strip of the upright screen:
// left thumb = floating joystick (appears where the thumb lands),
// right thumb = big HIT button and a LOB button.
// Options: swap sides (joystick right), and a second set turned round for the
// player at the top of the phone in couch mode (one HIT button, double tap = lob).
// Keyboard too, for testing on a computer: arrows/WASD, Space or Z = HIT, X = LOB;
// the top couch player uses I J K L, U = HIT, O = LOB.

const JOY_ZONE_TOP = 236;
const JOY_RADIUS = 20;
const REST = { x: 44, y: 340 };
export const HIT_BTN = { x: 178, y: 336, r: 24 };
export const LOB_BTN = { x: 128, y: 360, r: 16 };
/** Two taps on HIT closer than this make a lob (couch mode). */
const DOUBLE_TAP_MS = 300;

export interface ControlsLayout {
  /** Turned round for the player at the top of the phone. */
  flipped?: boolean;
  /** Joystick on the right, buttons on the left. */
  swap?: boolean;
  /** Show a LOB button; without it, a double tap on HIT plays a lob. */
  lobButton?: boolean;
  /** Which keyboard keys drive this set. */
  keys?: 'p1' | 'p2' | 'none';
}

interface Pt {
  x: number;
  y: number;
}

/** Turn a screen point into this player's own view (and back: it's its own reverse). */
export function toLocal(x: number, y: number, flipped: boolean): Pt {
  return flipped ? { x: GAME_W - x, y: GAME_H - y } : { x, y };
}

export class TouchControls {
  /** Joystick in the player's own view: -1 left .. 1 right, -1 up (away) .. 1 down (towards them). */
  mx = 0;
  my = 0;
  active = false;
  private hitQueued = false;
  private lobQueued = false;
  private joyId: number | null = null;
  private hitId: number | null = null;
  private lobId: number | null = null;
  private lastHitAt = -1e9;
  private base: Pt;
  private knob: Pt;
  private rest: Pt;
  private hitBtn: { x: number; y: number; r: number };
  private lobBtn: { x: number; y: number; r: number };
  private g: Phaser.GameObjects.Graphics;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private labels: Phaser.GameObjects.Container[] = [];
  private visible = true;
  private readonly flipped: boolean;
  private readonly swap: boolean;
  private readonly lobButton: boolean;

  constructor(private scene: Phaser.Scene, depth: number, layout: ControlsLayout = {}) {
    this.flipped = layout.flipped ?? false;
    this.swap = layout.swap ?? false;
    this.lobButton = layout.lobButton ?? true;
    const mirror = (p: { x: number; y: number }) => (this.swap ? GAME_W - p.x : p.x);
    this.rest = { x: mirror(REST), y: REST.y };
    this.hitBtn = { ...HIT_BTN, x: mirror(HIT_BTN) };
    this.lobBtn = { ...LOB_BTN, x: mirror(LOB_BTN) };
    this.base = { ...this.rest };
    this.knob = { ...this.rest };

    this.g = scene.add.graphics().setDepth(depth);
    const label = (b: Pt, text: string) => {
      const s = this.toScreen(b);
      return pixelText(scene, s.x, s.y, text, { colour: PAL.white, outline: PAL.ink })
        .setDepth(depth + 1)
        .setAngle(this.flipped ? 180 : 0);
    };
    this.labels.push(label(this.hitBtn, t.hit));
    if (this.lobButton) this.labels.push(label(this.lobBtn, t.lob));

    const input = scene.input;
    input.on('pointerdown', this.onDown, this);
    input.on('pointermove', this.onMove, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);

    const kb = input.keyboard;
    const which = layout.keys ?? 'p1';
    if (kb && which !== 'none') {
      const K = Phaser.Input.Keyboard.KeyCodes;
      if (which === 'p1') {
        this.keys = kb.addKeys({
          up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT,
          w: K.W, a: K.A, s: K.S, d: K.D,
        }) as Record<string, Phaser.Input.Keyboard.Key>;
        kb.on('keydown-SPACE', () => this.pressHit());
        kb.on('keydown-Z', () => this.pressHit());
        kb.on('keydown-X', () => this.press('lob'));
      } else {
        const k = kb.addKeys({ up: K.I, down: K.K, left: K.J, right: K.L }) as Record<string, Phaser.Input.Keyboard.Key>;
        this.keys = { ...k, w: k.up, a: k.left, s: k.down, d: k.right };
        kb.on('keydown-U', () => this.pressHit());
        kb.on('keydown-O', () => this.press('lob'));
      }
    }
    scene.events.once('shutdown', () => this.destroy());
    this.draw();
  }

  private toScreen(p: Pt): Pt {
    return toLocal(p.x, p.y, this.flipped);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.g.setVisible(on);
    this.labels.forEach((l) => l.setVisible(on));
    if (!on) this.reset();
  }

  /** Read and clear the button presses since the last call. */
  consume(): { hit: boolean; lob: boolean } {
    const r = { hit: this.hitQueued, lob: this.lobQueued };
    this.hitQueued = this.lobQueued = false;
    return r;
  }

  private press(which: 'hit' | 'lob'): void {
    if (!this.visible) return;
    if (which === 'hit') this.hitQueued = true;
    else this.lobQueued = true;
  }

  /** HIT, or a lob when it's the second tap of a double tap (sets without a LOB button). */
  private pressHit(): void {
    const now = this.scene.time.now;
    if (!this.lobButton && now - this.lastHitAt < DOUBLE_TAP_MS) {
      this.press('lob');
      this.lastHitAt = -1e9;
      return;
    }
    this.lastHitAt = now;
    this.press('hit');
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.visible) return;
    const l = toLocal(p.x, p.y, this.flipped);
    const near = (b: { x: number; y: number; r: number }, pad: number) => Math.hypot(l.x - b.x, l.y - b.y) <= b.r + pad;
    const joySide = this.swap ? l.x > GAME_W * 0.48 : l.x < GAME_W * 0.52;
    if (near(this.hitBtn, 6)) {
      this.hitId = p.id;
      this.pressHit();
    } else if (this.lobButton && near(this.lobBtn, 5)) {
      this.lobId = p.id;
      this.press('lob');
    } else if (this.joyId === null && joySide && l.y >= JOY_ZONE_TOP) {
      this.joyId = p.id;
      const lo = this.swap ? GAME_W * 0.48 : JOY_RADIUS + 2;
      const hi = this.swap ? GAME_W - JOY_RADIUS - 2 : GAME_W * 0.52;
      this.base = {
        x: Phaser.Math.Clamp(l.x, lo, hi),
        y: Phaser.Math.Clamp(l.y, JOY_ZONE_TOP, GAME_H - JOY_RADIUS - 2),
      };
      this.knob = { ...this.base };
      this.active = true;
      this.mx = this.my = 0;
    } else return;
    this.draw();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.joyId) return;
    const l = toLocal(p.x, p.y, this.flipped);
    const dx = l.x - this.base.x;
    const dy = l.y - this.base.y;
    const d = Math.hypot(dx, dy);
    const k = d > JOY_RADIUS ? JOY_RADIUS / d : 1;
    this.knob = { x: this.base.x + dx * k, y: this.base.y + dy * k };
    // A small dead zone in the middle, then full speed a little before the edge.
    const mag = Math.min(1, Math.max(0, (d - 3) / (JOY_RADIUS * 0.8)));
    this.mx = d > 0 ? (dx / d) * mag : 0;
    this.my = d > 0 ? (dy / d) * mag : 0;
    this.draw();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    let changed = false;
    if (p.id === this.joyId) {
      this.joyId = null;
      this.active = false;
      this.mx = this.my = 0;
      this.base = { ...this.rest };
      this.knob = { ...this.rest };
      changed = true;
    }
    if (p.id === this.hitId) {
      this.hitId = null;
      changed = true;
    }
    if (p.id === this.lobId) {
      this.lobId = null;
      changed = true;
    }
    if (changed) this.draw();
  }

  private reset(): void {
    this.joyId = this.hitId = this.lobId = null;
    this.active = false;
    this.mx = this.my = 0;
    this.hitQueued = this.lobQueued = false;
    this.base = { ...this.rest };
    this.knob = { ...this.rest };
  }

  /** Call every frame: folds in the keyboard. */
  update(): void {
    if (this.joyId !== null || !this.visible) return;
    const k = this.keys;
    if (!k.up) return;
    const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    const d = Math.hypot(x, y);
    this.active = d > 0;
    this.mx = d ? x / d : 0;
    this.my = d ? y / d : 0;
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const S = (p: Pt) => this.toScreen(p);
    // Joystick: a ring and a knob, brighter while in use.
    const a = this.joyId !== null ? 0.6 : 0.3;
    const base = S(this.base);
    const knob = S(this.knob);
    const shadow = this.flipped ? -1 : 1;
    g.fillStyle(PAL.ink, a * 0.6).fillCircle(base.x, base.y, JOY_RADIUS + 3);
    g.lineStyle(2, PAL.white, a).strokeCircle(base.x, base.y, JOY_RADIUS + 2);
    g.fillStyle(PAL.ink, 0.8).fillCircle(knob.x + shadow, knob.y + 2 * shadow, 9);
    g.fillStyle(PAL.skyLight, a + 0.25).fillCircle(knob.x, knob.y, 9);
    g.fillStyle(PAL.white, a).fillRect(knob.x - (this.flipped ? 0 : 4), knob.y - (this.flipped ? -3 : 5), 4, 2);

    const button = (b: { x: number; y: number; r: number }, colour: number, down: boolean) => {
      const off = (down ? 2 : 0) * shadow;
      const c = S(b);
      g.fillStyle(PAL.black, 0.5).fillCircle(c.x + 2 * shadow, c.y + 3 * shadow, b.r);
      g.fillStyle(PAL.ink, 0.85).fillCircle(c.x, c.y + off, b.r + 1);
      g.fillStyle(colour, down ? 0.95 : 0.7).fillCircle(c.x, c.y + off, b.r - 1);
      g.fillStyle(PAL.white, 0.25).fillCircle(c.x - b.r * 0.3 * shadow, c.y - b.r * 0.35 * shadow + off, b.r * 0.35);
    };
    button(this.hitBtn, PAL.red, this.hitId !== null);
    if (this.lobButton) button(this.lobBtn, PAL.purple, this.lobId !== null);
    const lift = (down: boolean) => (down ? 2 : 0) * shadow;
    this.labels[0]?.setY(S(this.hitBtn).y + lift(this.hitId !== null));
    this.labels[1]?.setY(S(this.lobBtn).y + lift(this.lobId !== null));
  }

  destroy(): void {
    const input = this.scene.input;
    input.off('pointerdown', this.onDown, this);
    input.off('pointermove', this.onMove, this);
    input.off('pointerup', this.onUp, this);
    input.off('pointerupoutside', this.onUp, this);
  }
}
