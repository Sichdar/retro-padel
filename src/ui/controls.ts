import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { PAL } from './palette';
import { pixelText } from './pixelFont';
import { t } from './strings';

// Touch controls in the bottom strip of the upright screen:
// left thumb = floating joystick (appears where the thumb lands),
// right thumb = big HIT button and a LOB button.
// Keyboard too, for testing on a computer: arrows/WASD, Space or Z = HIT, X = LOB.

const JOY_ZONE_TOP = 236;
const JOY_RADIUS = 20;
const REST = { x: 44, y: 340 };
export const HIT_BTN = { x: 178, y: 336, r: 24 };
export const LOB_BTN = { x: 128, y: 360, r: 16 };

export class TouchControls {
  mx = 0;
  my = 0;
  active = false;
  private hitQueued = false;
  private lobQueued = false;
  private joyId: number | null = null;
  private base = { ...REST };
  private knob = { ...REST };
  private g: Phaser.GameObjects.Graphics;
  private hitDown = false;
  private lobDown = false;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private labels: Phaser.GameObjects.Container[] = [];
  private visible = true;

  constructor(private scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth);
    this.labels.push(
      pixelText(scene, HIT_BTN.x, HIT_BTN.y, t.hit, { colour: PAL.white, outline: PAL.ink }).setDepth(depth + 1),
      pixelText(scene, LOB_BTN.x, LOB_BTN.y, t.lob, { colour: PAL.white, outline: PAL.ink }).setDepth(depth + 1),
    );
    const input = scene.input;
    input.on('pointerdown', this.onDown, this);
    input.on('pointermove', this.onMove, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);

    const kb = input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = kb.addKeys({
        up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT,
        w: K.W, a: K.A, s: K.S, d: K.D,
      }) as Record<string, Phaser.Input.Keyboard.Key>;
      kb.on('keydown-SPACE', () => this.press('hit'));
      kb.on('keydown-Z', () => this.press('hit'));
      kb.on('keydown-X', () => this.press('lob'));
    }
    scene.events.once('shutdown', () => this.destroy());
    this.draw();
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

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.visible) return;
    if (Math.hypot(p.x - HIT_BTN.x, p.y - HIT_BTN.y) <= HIT_BTN.r + 6) {
      this.hitDown = true;
      this.press('hit');
    } else if (Math.hypot(p.x - LOB_BTN.x, p.y - LOB_BTN.y) <= LOB_BTN.r + 5) {
      this.lobDown = true;
      this.press('lob');
    } else if (this.joyId === null && p.x < GAME_W * 0.52 && p.y >= JOY_ZONE_TOP) {
      this.joyId = p.id;
      this.base = {
        x: Phaser.Math.Clamp(p.x, JOY_RADIUS + 2, GAME_W * 0.52),
        y: Phaser.Math.Clamp(p.y, JOY_ZONE_TOP, GAME_H - JOY_RADIUS - 2),
      };
      this.knob = { ...this.base };
      this.active = true;
      this.mx = this.my = 0;
    }
    this.draw();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.joyId) return;
    const dx = p.x - this.base.x;
    const dy = p.y - this.base.y;
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
    if (p.id === this.joyId) {
      this.joyId = null;
      this.active = false;
      this.mx = this.my = 0;
      this.base = { ...REST };
      this.knob = { ...REST };
    }
    this.hitDown = this.lobDown = false;
    this.draw();
  }

  private reset(): void {
    this.joyId = null;
    this.active = false;
    this.mx = this.my = 0;
    this.hitQueued = this.lobQueued = false;
    this.hitDown = this.lobDown = false;
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
    // Joystick: a ring and a knob, brighter while in use.
    const a = this.joyId !== null ? 0.6 : 0.3;
    g.fillStyle(PAL.ink, a * 0.6).fillCircle(this.base.x, this.base.y, JOY_RADIUS + 3);
    g.lineStyle(2, PAL.white, a).strokeCircle(this.base.x, this.base.y, JOY_RADIUS + 2);
    g.fillStyle(PAL.ink, 0.8).fillCircle(this.knob.x + 1, this.knob.y + 2, 9);
    g.fillStyle(PAL.skyLight, a + 0.25).fillCircle(this.knob.x, this.knob.y, 9);
    g.fillStyle(PAL.white, a).fillRect(this.knob.x - 4, this.knob.y - 5, 4, 2);

    const button = (b: { x: number; y: number; r: number }, colour: number, down: boolean) => {
      const off = down ? 2 : 0;
      g.fillStyle(PAL.black, 0.5).fillCircle(b.x + 2, b.y + 3, b.r);
      g.fillStyle(PAL.ink, 0.85).fillCircle(b.x, b.y + off, b.r + 1);
      g.fillStyle(colour, down ? 0.95 : 0.7).fillCircle(b.x, b.y + off, b.r - 1);
      g.fillStyle(PAL.white, 0.25).fillCircle(b.x - b.r * 0.3, b.y - b.r * 0.35 + off, b.r * 0.35);
    };
    button(HIT_BTN, PAL.red, this.hitDown);
    button(LOB_BTN, PAL.purple, this.lobDown);
    this.labels[0]?.setY(HIT_BTN.y + (this.hitDown ? 2 : 0));
    this.labels[1]?.setY(LOB_BTN.y + (this.lobDown ? 2 : 0));
  }

  destroy(): void {
    const input = this.scene.input;
    input.off('pointerdown', this.onDown, this);
    input.off('pointermove', this.onMove, this);
    input.off('pointerup', this.onUp, this);
    input.off('pointerupoutside', this.onUp, this);
  }
}
