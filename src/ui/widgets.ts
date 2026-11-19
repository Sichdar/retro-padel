import Phaser from 'phaser';
import { PAL } from './palette';
import { pixelText } from './pixelFont';
import { sfxBlip } from '../audio/sfx';

/** A chunky retro button. `onTap` runs when a finger lifts inside it. */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onTap: () => void,
  colour: number = PAL.blue,
): Phaser.GameObjects.Container {
  const box = scene.add.graphics();
  const draw = (pressed: boolean, focused: boolean) => {
    box.clear();
    const off = pressed ? 2 : 0;
    box.fillStyle(PAL.black, 1).fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
    box.fillStyle(focused ? PAL.yellow : PAL.ink, 1).fillRect(-w / 2 + off - 1, -h / 2 + off - 1, w + 2, h + 2);
    box.fillStyle(colour, 1).fillRect(-w / 2 + off, -h / 2 + off, w, h);
    box.fillStyle(PAL.white, 0.25).fillRect(-w / 2 + off, -h / 2 + off, w, 2);
    box.fillStyle(PAL.black, 0.25).fillRect(-w / 2 + off, h / 2 + off - 2, w, 2);
  };
  draw(false, false);
  const text = pixelText(scene, 0, 0, label, { colour: PAL.white, outline: PAL.ink });
  const c = scene.add.container(Math.round(x), Math.round(y), [box, text]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  let down = false;
  c.on('pointerdown', () => {
    down = true;
    draw(true, true);
    text.setPosition(2, 2);
  });
  const release = (fire: boolean) => {
    if (!down) return;
    down = false;
    draw(false, false);
    text.setPosition(0, 0);
    if (fire) {
      sfxBlip();
      onTap();
    }
  };
  c.on('pointerup', () => release(true));
  c.on('pointerout', () => release(false));
  c.setData('focus', (on: boolean) => draw(false, on));
  return c;
}

/** A short message that pops up in the middle and fades away. */
export function toast(scene: Phaser.Scene, message: string): void {
  const t = pixelText(scene, scene.scale.width / 2, scene.scale.height / 2, message, {
    colour: PAL.yellow,
    outline: PAL.ink,
    shadow: PAL.black,
    scale: 2,
  });
  t.setDepth(1000);
  scene.tweens.add({
    targets: t,
    y: t.y - 12,
    alpha: { from: 1, to: 0 },
    delay: 700,
    duration: 500,
    onComplete: () => t.destroy(),
  });
}

/** 16x16 pixel-art gear icon, made once as a texture. */
export function ensureGearTexture(scene: Phaser.Scene): string {
  const key = 'icon-gear';
  if (scene.textures.exists(key)) return key;
  const rows = [
    '......XXXX......',
    '......XWWX......',
    '..XX.XXWWXX.XX..',
    '..XWXXWWWWXXWX..',
    '...XWWWWWWWWX...',
    '..XXWWWXXWWWXX..',
    'XXXWWWX..XWWWXXX',
    'XWWWWX....XWWWWX',
    'XWWWWX....XWWWWX',
    'XXXWWWX..XWWWXXX',
    '..XXWWWXXWWWXX..',
    '...XWWWWWWWWX...',
    '..XWXXWWWWXXWX..',
    '..XX.XXWWXX.XX..',
    '......XWWX......',
    '......XXXX......',
  ];
  const g = scene.make.graphics({}, false);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle(ch === 'X' ? PAL.ink : PAL.white, 1).fillRect(x, y, 1, 1);
    }),
  );
  g.generateTexture(key, 16, 16);
  g.destroy();
  return key;
}
