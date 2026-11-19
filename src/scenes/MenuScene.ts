import Phaser from 'phaser';
import { GAME_W } from '../config';
import { PAL } from '../ui/palette';
import { pixelText } from '../ui/pixelFont';
import { t } from '../ui/strings';
import { makeButton, toast } from '../ui/widgets';
import { BACKDROP_KEY, ensureBackdrop } from './backdrop';

// Main menu. In milestone 1 every mode says "coming soon".
export class MenuScene extends Phaser.Scene {
  private buttons: Phaser.GameObjects.Container[] = [];
  private actions: (() => void)[] = [];
  private focus = 0;

  constructor() {
    super('Menu');
  }

  create(): void {
    ensureBackdrop(this);
    this.add.image(0, 0, BACKDROP_KEY).setOrigin(0);
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, PAL.black, 0.55).setOrigin(0);

    pixelText(this, GAME_W / 2, 22, t.menuTitle, { colour: PAL.yellow, outline: PAL.redDark, shadow: PAL.ink, scale: 2 });

    const soon = () => toast(this, t.comingSoon);
    const items: [string, number][] = [
      [t.menuQuick, PAL.blue],
      [t.menuCouch, PAL.purple],
      [t.menuOnline, PAL.red],
      [t.menuHowTo, PAL.turfDark],
    ];
    this.buttons = [];
    this.actions = [];
    items.forEach(([label, colour], i) => {
      const x = i % 2 === 0 ? 106 : 278;
      const y = i < 2 ? 78 : 130;
      this.buttons.push(makeButton(this, x, y, 156, 40, label, soon, colour));
      this.actions.push(soon);
    });

    const back = () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
    };
    this.buttons.push(makeButton(this, 44, 192, 72, 28, t.back, back, PAL.greyDark));
    this.actions.push(back);

    // Test scene for the ball physics (milestone 2).
    const lab = () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('BallLab'));
    };
    this.buttons.push(makeButton(this, GAME_W - 48, 192, 88, 28, t.menuLab, lab, PAL.orange));
    this.actions.push(lab);

    // Keyboard, for testing on a computer.
    // No highlight until a key is pressed, so phones show plain buttons.
    this.focus = -1;
    const move = (step: number) => this.setFocus(this.focus < 0 ? 0 : this.focus + step);
    const kb = this.input.keyboard;
    kb?.on('keydown-RIGHT', () => move(1));
    kb?.on('keydown-LEFT', () => move(-1));
    kb?.on('keydown-DOWN', () => move(2));
    kb?.on('keydown-UP', () => move(-2));
    kb?.on('keydown-ENTER', () => (this.focus < 0 ? move(0) : this.actions[this.focus]()));
    kb?.on('keydown-ESC', back);

    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private setFocus(i: number): void {
    const n = this.buttons.length;
    this.focus = ((i % n) + n) % n;
    this.buttons.forEach((b, j) => (b.getData('focus') as (on: boolean) => void)(j === this.focus));
  }
}
