import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { playMusic } from '../audio/music';
import { sfxBlip, unlockAudio } from '../audio/sfx';
import { Level, MatchLength, NAME_MAX, Settings, cleanName, settings, updateSettings } from '../settings';
import { PAL } from '../ui/palette';
import { pixelText } from '../ui/pixelFont';
import { DESIGNS, FOOT_Y, FRAME, KITS, SPRITE_H, ensurePlayerTexture, lookKey, looksFor } from '../ui/sprites';
import { t } from '../ui/strings';
import { makeButton } from '../ui/widgets';
import { BACKDROP_KEY, ensureBackdrop } from './backdrop';

// Settings: tap a row to change it. Everything is saved on the phone at once.

interface Row {
  label: string;
  value: () => string;
  change: (dir: number) => void;
}

const ROW_TOP = 112;
const ROW_H = 21;

const cycle = <T,>(list: readonly T[], v: T, dir: number): T => list[(list.indexOf(v) + dir + list.length) % list.length];

export class SettingsScene extends Phaser.Scene {
  private rows: Row[] = [];
  private valueTexts: Phaser.GameObjects.Container[] = [];
  private preview!: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Container;
  private focus = -1;
  private focusBox!: Phaser.GameObjects.Graphics;
  private back = 'Menu';

  constructor() {
    super('Settings');
  }

  init(data: { back?: string }): void {
    this.back = data?.back ?? 'Menu';
  }

  create(): void {
    ensureBackdrop(this);
    this.add.image(0, 0, BACKDROP_KEY).setOrigin(0);
    this.add.rectangle(0, 0, GAME_W, GAME_H, PAL.black, 0.7).setOrigin(0);
    playMusic('menu');

    pixelText(this, GAME_W / 2, 16, t.menuSettings, { colour: PAL.yellow, outline: PAL.redDark, shadow: PAL.ink, scale: 2 });

    // Your player, as chosen below.
    const spot = this.add.graphics();
    spot.fillStyle(PAL.court, 1).fillEllipse(GAME_W / 2, 96, 64, 12);
    spot.fillStyle(PAL.black, 0.4).fillEllipse(GAME_W / 2, 96, 26, 6);
    this.preview = this.add.image(GAME_W / 2, 96, '__DEFAULT').setOrigin(0.5, FOOT_Y / SPRITE_H).setScale(2);
    this.nameText = pixelText(this, GAME_W / 2, 36, '', { colour: PAL.white, outline: PAL.ink });
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        // A little idle animation: ready, then a swing now and then.
        const f = this.preview.frame.name;
        this.preview.setFrame(String(f) === String(FRAME.cheer) ? FRAME.idle : Math.random() < 0.25 ? FRAME.cheer : FRAME.ready);
      },
    });

    const onOff = (v: boolean) => (v ? t.on : t.off);
    const flip = (k: keyof Settings) => () => updateSettings({ [k]: !settings[k] } as Partial<Settings>);
    const levels: Level[] = ['easy', 'normal', 'hard'];
    const lengths: MatchLength[] = ['short', 'set', 'best3'];
    const lengthText = { short: t.lenShort, set: t.lenSet, best3: t.lenBest3 };
    this.rows = [
      { label: t.setName, value: () => settings.name, change: () => this.askName() },
      { label: t.setLook, value: () => DESIGNS[settings.look].name, change: (d) => updateSettings({ look: (settings.look + d + 4) % 4 }) },
      { label: t.setKit, value: () => KITS[settings.kit].name, change: (d) => updateSettings({ kit: (settings.kit + d + 4) % 4 }) },
      { label: t.setLevel, value: () => t[settings.level], change: (d) => updateSettings({ level: cycle(levels, settings.level, d) }) },
      { label: t.setLength, value: () => lengthText[settings.length], change: (d) => updateSettings({ length: cycle(lengths, settings.length, d) }) },
      { label: t.setGolden, value: () => onOff(settings.goldenPoint), change: flip('goldenPoint') },
      { label: t.setAssist, value: () => onOff(settings.assist), change: flip('assist') },
      { label: t.setButtons, value: () => (settings.buttonsLeft ? t.left : t.right), change: flip('buttonsLeft') },
      { label: t.setEffects, value: () => onOff(settings.effects), change: flip('effects') },
      { label: t.setMusic, value: () => onOff(settings.music), change: flip('music') },
      { label: t.setVibration, value: () => onOff(settings.vibration), change: flip('vibration') },
    ];

    const bg = this.add.graphics();
    this.focusBox = this.add.graphics().setDepth(5);
    this.valueTexts = [];
    this.rows.forEach((row, i) => {
      const y = ROW_TOP + i * ROW_H;
      bg.fillStyle(i % 2 ? PAL.ink : PAL.navy, 0.85).fillRect(8, y - ROW_H / 2, GAME_W - 16, ROW_H - 1);
      pixelText(this, 16, y, row.label, { colour: PAL.grey, originX: 0 });
      this.valueTexts.push(pixelText(this, GAME_W - 16, y, '', { colour: PAL.yellow, originX: 1 }));
      const zone = this.add.zone(8, y - ROW_H / 2, GAME_W - 16, ROW_H - 1).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => this.changeRow(i, 1));
    });
    pixelText(this, GAME_W / 2, ROW_TOP + this.rows.length * ROW_H - 2, t.settingsHint, { colour: PAL.greyDark });

    const backBtn = makeButton(this, GAME_W / 2, GAME_H - 18, 110, 26, t.back, () => this.leave(), PAL.greyDark);
    backBtn.setDepth(6);

    const kb = this.input.keyboard;
    const move = (d: number) => this.setFocus(this.focus < 0 ? 0 : (this.focus + d + this.rows.length) % this.rows.length);
    kb?.on('keydown-UP', () => move(-1));
    kb?.on('keydown-DOWN', () => move(1));
    kb?.on('keydown-RIGHT', () => this.focus >= 0 && this.changeRow(this.focus, 1));
    kb?.on('keydown-LEFT', () => this.focus >= 0 && this.changeRow(this.focus, -1));
    kb?.on('keydown-ENTER', () => (this.focus >= 0 ? this.changeRow(this.focus, 1) : move(0)));
    kb?.on('keydown-ESC', () => this.leave());

    this.refresh();
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private changeRow(i: number, dir: number): void {
    unlockAudio();
    sfxBlip();
    this.rows[i].change(dir);
    this.refresh();
  }

  private setFocus(i: number): void {
    this.focus = i;
    const y = ROW_TOP + i * ROW_H;
    this.focusBox.clear().lineStyle(1, PAL.yellow, 1).strokeRect(8.5, y - ROW_H / 2 + 0.5, GAME_W - 17, ROW_H - 2);
  }

  private refresh(): void {
    this.rows.forEach((row, i) => {
      const c = this.valueTexts[i];
      c.destroy();
      this.valueTexts[i] = pixelText(this, GAME_W - 16, ROW_TOP + i * ROW_H, row.value(), { colour: PAL.yellow, originX: 1 });
    });
    const look = looksFor(settings.look, settings.kit)[0];
    const key = ensurePlayerTexture(this, lookKey(look), look);
    this.preview.setTexture(key, FRAME.ready);
    this.nameText.destroy();
    this.nameText = pixelText(this, GAME_W / 2, 36, settings.name, { colour: PAL.white, outline: PAL.ink });
  }

  /** The phone's own keyboard is the easiest way to type a name. */
  private askName(): void {
    let typed: string | null = null;
    try {
      typed = window.prompt(t.namePrompt, settings.name);
    } catch {
      typed = null;
    }
    if (typed === null) return;
    updateSettings({ name: cleanName(typed.slice(0, NAME_MAX * 2)) });
  }

  private leave(): void {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.back));
  }
}
