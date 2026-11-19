import Phaser from 'phaser';
import { GAME_VERSION, GAME_W } from '../config';
import { COURT_LENGTH, COURT_WIDTH, DEFAULT_VIEW, project } from '../game/projection';
import { sfxStart, unlockAudio, vibrate } from '../audio/sfx';
import { PAL } from '../ui/palette';
import { pixelText } from '../ui/pixelFont';
import { t } from '../ui/strings';
import { ensureGearTexture, toast } from '../ui/widgets';
import { ensureBackdrop } from './backdrop';
import { drawNet } from '../ui/courtArt';
import { goFullscreenOnPhone } from '../ui/screen';

// Title screen: logo, blinking "TAP TO START", a ball bouncing on the court.
export class TitleScene extends Phaser.Scene {
  private ball!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  // A simple demo ball (real physics come in milestone 2).
  private bx = 3;
  private by = 6;
  private bz = 1.5;
  private vx = 7;
  private vy = -1.5;
  private vz = 0;
  private leaving = false;

  constructor() {
    super('Title');
  }

  create(): void {
    this.leaving = false;
    this.add.image(0, 0, ensureBackdrop(this, false)).setOrigin(0);
    drawNet(this.add.graphics().setDepth(10), DEFAULT_VIEW);

    this.shadow = this.add.image(0, 0, 'ball-shadow').setAlpha(0.45);
    this.ball = this.add.image(0, 0, 'ball');

    // Logo drops in with a bounce.
    const logo1 = pixelText(this, GAME_W / 2, 34, t.title1, {
      colour: PAL.yellow,
      outline: PAL.redDark,
      shadow: PAL.ink,
      scale: 4,
    });
    const logo2 = pixelText(this, GAME_W / 2 + 18, 64, t.title2, {
      colour: PAL.white,
      outline: PAL.red,
      shadow: PAL.ink,
      scale: 2,
    });
    logo1.y = -40;
    logo2.x = GAME_W + 120;
    this.tweens.add({ targets: logo1, y: 34, duration: 700, ease: 'Bounce.easeOut' });
    this.tweens.add({ targets: logo2, x: GAME_W / 2 + 18, duration: 400, delay: 600, ease: 'Back.easeOut' });

    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const tap = pixelText(this, GAME_W / 2, 100, isTouch ? t.tapToStart : t.pressToStart, {
      colour: PAL.white,
      outline: PAL.ink,
    });
    this.time.addEvent({ delay: 450, loop: true, callback: () => tap.setVisible(!tap.visible) });

    pixelText(this, GAME_W / 2, 211, t.copyright + GAME_VERSION, { colour: PAL.grey, outline: PAL.ink });

    // Settings icon (the settings screen arrives in milestone 4).
    const gear = this.add.image(GAME_W - 14, 14, ensureGearTexture(this)).setInteractive({ useHandCursor: true });
    gear.input!.hitArea.setTo(-8, -8, 32, 32);
    gear.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      unlockAudio();
      toast(this, t.comingSoon);
    });
    gear.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) =>
      e.stopPropagation(),
    );

    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.includes(gear)) return;
      this.start();
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.start());
    this.input.keyboard?.on('keydown-SPACE', () => this.start());

    // Texts and icons above the court, net and ball.
    for (const obj of this.children.list) {
      if (obj instanceof Phaser.GameObjects.Container || obj === gear) (obj as Phaser.GameObjects.Container).setDepth(20);
    }
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private start(): void {
    if (this.leaving) return;
    this.leaving = true;
    unlockAudio();
    goFullscreenOnPhone();
    sfxStart();
    vibrate(20);
    this.cameras.main.flash(120, 255, 255, 255);
    this.time.delayedCall(250, () => {
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu'));
    });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.vz -= 9.8 * dt;
    this.bx += this.vx * dt;
    this.by += this.vy * dt;
    this.bz += this.vz * dt;
    if (this.bz <= 0) {
      this.bz = 0;
      this.vz = 6.5;
    }
    if (this.bx < 1.5 || this.bx > COURT_LENGTH - 1.5) this.vx = -this.vx;
    if (this.by < 2.5 || this.by > COURT_WIDTH - 1) this.vy = -this.vy;

    const ground = project(DEFAULT_VIEW, this.bx, this.by, 0);
    const air = project(DEFAULT_VIEW, this.bx, this.by, this.bz);
    this.shadow.setPosition(Math.round(ground.x), Math.round(ground.y));
    this.ball.setPosition(Math.round(air.x), Math.round(air.y) - 2);
    // In front of the net on the left half, behind it on the right half.
    const depth = this.bx < COURT_LENGTH / 2 ? 12 : 8;
    this.ball.setDepth(depth);
    this.shadow.setDepth(depth - 1);
  }
}
