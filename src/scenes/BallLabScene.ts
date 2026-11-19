import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { NET_X } from '../game/court';
import { FixedStep } from '../game/fixedStep';
import { Ball, BallEvent, aimBall, makeBall, speedOf, stepBall } from '../game/physics';
import { DEFAULT_VIEW, nearerThanNet, project, unprojectGround } from '../game/projection';
import { makeRng } from '../game/rng';
import {
  sfxBounce,
  sfxGlass,
  sfxHit,
  sfxMesh,
  sfxNet,
  sfxNetCord,
  sfxOut,
  unlockAudio,
} from '../audio/sfx';
import { drawNearWall, drawNet } from '../ui/courtArt';
import { PAL } from '../ui/palette';
import { pixelText } from '../ui/pixelFont';
import { t } from '../ui/strings';
import { makeButton } from '../ui/widgets';
import { ensureBackdrop } from './backdrop';

// Test scene for milestone 2: fire the ball at every surface and watch it
// bounce. Buttons pick a surface; tapping the court aims at that spot.

type Shot = { from: [number, number, number]; to: [number, number, number]; time: number };

const PRESETS: Record<string, Shot | 'drop'> = {
  [t.labFloor]: 'drop',
  [t.labGlass]: { from: [8, 6, 1], to: [0, 4, 1.5], time: 0.55 },
  [t.labMesh]: { from: [6, 7, 1], to: [0, 3, 3.5], time: 0.6 },
  [t.labSide]: { from: [9, 8, 1], to: [8, 0, 1.4], time: 0.45 },
  [t.labNet]: { from: [4, 5, 0.5], to: [10, 5, 0.4], time: 0.45 },
  [t.labCord]: { from: [6, 5, 1], to: [10, 5, 0.9], time: 0.4 },
  [t.labOut]: { from: [8, 5, 1], to: [-2, 5, 6], time: 1.2 },
};
const PRESET_ORDER = Object.keys(PRESETS);

const DEPTH_NET = 10;
const DEPTH_NEAR_WALL = 50;
const DEPTH_UI = 100;
const TRAIL = 6;

const EVENT_STYLE: Record<BallEvent['surface'], [string, number]> = {
  floor: [t.evBounce, PAL.white],
  glass: [t.evGlass, PAL.cyan],
  mesh: [t.evMesh, PAL.grey],
  net: [t.evNet, PAL.red],
  netcord: [t.evNetCord, PAL.yellow],
  out: [t.evOut, PAL.red],
};

export class BallLabScene extends Phaser.Scene {
  private ball!: Ball;
  private rng = makeRng(Date.now());
  private clock = new FixedStep();
  private ballImg!: Phaser.GameObjects.Image;
  private shadowImg!: Phaser.GameObjects.Image;
  private trail: Phaser.GameObjects.Image[] = [];
  private trailPos: { x: number; y: number; depth: number }[] = [];
  private eventLabel?: Phaser.GameObjects.Container;
  private readout!: Phaser.GameObjects.BitmapText;
  private bounces = 0;
  private auto = true;
  private autoIndex = 0;
  private idleFor = 0;
  private autoBtn!: Phaser.GameObjects.Container;

  constructor() {
    super('BallLab');
  }

  create(): void {
    this.add.image(0, 0, ensureBackdrop(this, false)).setOrigin(0);
    const net = this.add.graphics().setDepth(DEPTH_NET);
    drawNet(net, DEFAULT_VIEW);
    const near = this.add.graphics().setDepth(DEPTH_NEAR_WALL);
    drawNearWall(near, DEFAULT_VIEW);

    this.makeSparkTexture();
    this.shadowImg = this.add.image(0, 0, 'ball-shadow').setAlpha(0.45);
    this.trail = [];
    for (let i = 0; i < TRAIL; i++) {
      this.trail.push(this.add.image(0, 0, 'ball').setAlpha(0).setScale(0.6).setTint(PAL.yellowLight));
    }
    this.ballImg = this.add.image(0, 0, 'ball');

    // Top bar.
    pixelText(this, 6, 6, t.labTitle, { colour: PAL.yellow, outline: PAL.ink, originX: 0, originY: 0 }).setDepth(DEPTH_UI);
    pixelText(this, 6, 18, t.labHint, { colour: PAL.grey, outline: PAL.ink, originX: 0, originY: 0 }).setDepth(DEPTH_UI);
    this.readout = this.add
      .bitmapText(GAME_W - 4, 30, 'px8', '')
      .setOrigin(1, 0)
      .setTint(PAL.white)
      .setDepth(DEPTH_UI);
    makeButton(this, GAME_W - 26, 12, 48, 20, t.back, () => this.leave(), PAL.greyDark).setDepth(DEPTH_UI);

    // Preset buttons along the bottom, two rows of four.
    const labels = [...PRESET_ORDER, t.labAuto];
    const perRow = 4;
    const w = 50;
    const h = 22;
    const gap = 3;
    const x0 = (GAME_W - (perRow * w + (perRow - 1) * gap)) / 2 + w / 2;
    labels.forEach((label, i) => {
      const isAuto = label === t.labAuto;
      const btn = makeButton(
        this,
        x0 + (i % perRow) * (w + gap),
        GAME_H - 44 + Math.floor(i / perRow) * (h + gap),
        w,
        h,
        label,
        () => (isAuto ? this.setAuto(!this.auto) : (this.setAuto(false), this.fire(label))),
        isAuto ? PAL.purple : PAL.blue,
      ).setDepth(DEPTH_UI);
      if (isAuto) this.autoBtn = btn;
    });

    // Tap the court to aim there.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      unlockAudio();
      if (over.length > 0 || p.y > GAME_H - 58 || p.y < 30) return;
      this.setAuto(false);
      this.fireAt(p.x, p.y);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.leave());
    this.input.keyboard?.on('keydown-SPACE', () => this.fire(PRESET_ORDER[this.autoIndex++ % PRESET_ORDER.length]));

    this.ball = makeBall(14, 5, 3);
    this.ball.dead = true;
    this.setAuto(true);
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private leave(): void {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu'));
  }

  private setAuto(on: boolean): void {
    this.auto = on;
    this.idleFor = on ? 10 : 0;
    (this.autoBtn?.getData('focus') as ((v: boolean) => void) | undefined)?.(on);
  }

  private fire(label: string): void {
    const shot = PRESETS[label];
    this.bounces = 0;
    this.clearTrail();
    if (shot === 'drop') {
      this.ball = makeBall(14, 5, 3);
      return;
    }
    this.ball = makeBall(...shot.from);
    aimBall(this.ball, ...shot.to, shot.time);
    sfxHit();
  }

  private fireAt(sx: number, sy: number): void {
    const target = unprojectGround(DEFAULT_VIEW, sx, sy);
    const fromLeft = target.x >= NET_X;
    const from: [number, number, number] = fromLeft ? [3, 5, 1] : [17, 5, 1];
    const dist = Math.hypot(target.x - from[0], target.y - from[1]);
    this.bounces = 0;
    this.clearTrail();
    this.ball = makeBall(...from);
    aimBall(this.ball, target.x, target.y, 0.03, 0.45 + dist / 18);
    sfxHit();
  }

  private clearTrail(): void {
    this.trailPos = [];
  }

  update(_time: number, deltaMs: number): void {
    this.clock.advance(deltaMs / 1000, (dt) => {
      for (const e of stepBall(this.ball, this.rng, dt)) this.onEvent(e);
      // Auto mode: next shot once the ball has settled (or left the court).
      const b = this.ball;
      this.idleFor = b.dead || b.rolling || b.out ? this.idleFor + dt : 0;
    });

    if (this.auto && this.idleFor > 1) {
      this.idleFor = 0;
      this.fire(PRESET_ORDER[this.autoIndex++ % PRESET_ORDER.length]);
    }

    this.draw();
  }

  private onEvent(e: BallEvent): void {
    switch (e.surface) {
      case 'floor':
        this.bounces++;
        sfxBounce(e.speed);
        break;
      case 'glass':
        sfxGlass(e.speed);
        break;
      case 'mesh':
        sfxMesh(e.speed);
        break;
      case 'net':
        sfxNet();
        break;
      case 'netcord':
        sfxNetCord();
        break;
      case 'out':
        sfxOut();
        break;
    }
    const [label, colour] = EVENT_STYLE[e.surface];
    this.showEvent(e.surface === 'floor' ? `${label} ${this.bounces}` : label, colour);
    this.spark(e, colour);
  }

  private showEvent(text: string, colour: number): void {
    this.eventLabel?.destroy();
    const c = pixelText(this, GAME_W / 2, 110, text, { colour, outline: PAL.ink, shadow: PAL.black, scale: 2 }).setDepth(DEPTH_UI);
    this.eventLabel = c;
    this.tweens.add({ targets: c, alpha: { from: 1, to: 0 }, delay: 600, duration: 400 });
  }

  private makeSparkTexture(): void {
    if (this.textures.exists('spark')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(3, 0, 1, 7).fillRect(0, 3, 7, 1).fillRect(2, 2, 3, 3);
    g.generateTexture('spark', 7, 7);
    g.destroy();
  }

  private spark(e: BallEvent, colour: number): void {
    const p = project(DEFAULT_VIEW, e.x, e.y, Math.max(0, e.z));
    const s = this.add
      .image(Math.round(p.x), Math.round(p.y), 'spark')
      .setTint(colour)
      .setDepth(nearerThanNet(DEFAULT_VIEW, e.x) ? DEPTH_NET + 3 : DEPTH_NET - 3);
    this.tweens.add({ targets: s, scale: { from: 0.6, to: 1.6 }, alpha: { from: 1, to: 0 }, duration: 300, onComplete: () => s.destroy() });
  }

  private draw(): void {
    const b = this.ball;
    const inFront = nearerThanNet(DEFAULT_VIEW, b.x);
    const ground = project(DEFAULT_VIEW, b.x, b.y, 0);
    const air = project(DEFAULT_VIEW, b.x, b.y, b.z);
    const depth = inFront ? DEPTH_NET + 2 : DEPTH_NET - 2;

    this.shadowImg
      .setPosition(Math.round(ground.x), Math.round(ground.y))
      .setDepth(depth - 1)
      .setVisible(!b.out && b.z > -0.5)
      .setAlpha(Math.max(0.15, 0.5 - b.z * 0.06));
    this.ballImg.setPosition(Math.round(air.x), Math.round(air.y) - 2).setDepth(depth).setVisible(b.z > -0.5);

    // Short trail behind fast balls.
    const speed = speedOf(b);
    this.trailPos.unshift({ x: Math.round(air.x), y: Math.round(air.y) - 2, depth: depth - 0.5 });
    this.trailPos.length = Math.min(this.trailPos.length, TRAIL * 2);
    const fast = speed > 12 && !b.dead;
    this.trail.forEach((img, i) => {
      const p = this.trailPos[(i + 1) * 2];
      if (!p || !fast) return img.setAlpha(0);
      img.setPosition(p.x, p.y).setDepth(p.depth).setAlpha(0.5 * (1 - i / TRAIL));
    });

    const kmh = Math.round(speed * 3.6);
    this.readout.setText(`${kmh} ${t.unitSpeed}\nZ ${Math.max(0, b.z).toFixed(1)} ${t.unitHeight}`);
  }
}
