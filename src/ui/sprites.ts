import Phaser from 'phaser';
import { PAL } from './palette';

// Original pixel-art padel players, drawn in code from simple blocks.
// Each look becomes one texture strip with these frames:
export const FRAME = { idle: 0, run1: 1, run2: 2, forehand: 3, backhand: 4, overhead: 5, cheer: 6 } as const;
const FRAMES = 7;
export const SPRITE_W = 34;
export const SPRITE_H = 36;
/** Row of the feet (the sprite stands on this row). */
export const FOOT_Y = 34;

export interface Look {
  kit: number;
  kitDark: number;
  hair: number;
  skin: number;
  shoes: number;
  /** Seen from the front (far team) or from behind (near team). */
  front: boolean;
}

type R = [x: number, y: number, w: number, h: number, c: number];

/** The blocks that make one frame, in body coordinates (feet at the bottom). */
function frameRects(f: number, l: Look): R[] {
  const r: R[] = [];
  const legL = f === FRAME.run1 ? -2 : f === FRAME.run2 ? 1 : 0;
  const legR = f === FRAME.run2 ? -2 : f === FRAME.run1 ? 1 : 0;
  // Legs and shoes (a raised leg is shorter).
  r.push([5, 18, 2, 5 + Math.min(0, legL), l.skin], [9, 18, 2, 5 + Math.min(0, legR), l.skin]);
  r.push([4, 23 + Math.min(0, legL), 3, 2, l.shoes], [9, 23 + Math.min(0, legR), 3, 2, l.shoes]);
  // Shorts and shirt.
  r.push([4, 15, 8, 3, l.kitDark]);
  r.push([4, 8, 8, 7, l.kit], [4, 12, 8, 1, l.kitDark]);
  // Arms.
  const sway = f === FRAME.run1 ? 1 : f === FRAME.run2 ? -1 : 0;
  if (f === FRAME.cheer) {
    r.push([2, 1, 2, 8, l.skin], [12, 1, 2, 8, l.skin]);
  } else if (f === FRAME.overhead) {
    r.push([2, 8, 2, 6, l.skin], [12, 0, 2, 9, l.skin]);
  } else if (f === FRAME.forehand) {
    r.push([2, 8, 2, 6, l.skin], [12, 9, 6, 2, l.skin]);
  } else if (f === FRAME.backhand) {
    r.push([-2, 9, 6, 2, l.skin], [12, 8, 2, 6, l.skin]);
  } else {
    r.push([2, 8 + sway, 2, 6, l.skin], [12, 8 - sway, 2, 6, l.skin]);
  }
  // Short sleeves.
  r.push([3, 8, 1, 2, l.kit], [12, 8, 1, 2, l.kit]);
  // Neck and head.
  r.push([7, 7, 2, 1, l.skin]);
  if (l.front) {
    r.push([5, 1, 6, 6, l.skin], [5, 0, 6, 2, l.hair], [5, 2, 1, 2, l.hair], [10, 2, 1, 2, l.hair]);
    r.push([6, 4, 1, 1, PAL.ink], [9, 4, 1, 1, PAL.ink]);
  } else {
    r.push([5, 0, 6, 6, l.hair], [5, 5, 6, 1, l.skin]);
  }
  // Headband in the kit colour.
  r.push([5, 2, 6, 1, l.kitDark]);
  return r;
}

/** Racket blocks for a frame: [handle, head]. */
function racketRects(f: number): R[] {
  const frame = PAL.ink;
  const face = PAL.grey;
  switch (f) {
    case FRAME.forehand:
      return [[17, 9, 2, 2, PAL.brown], [19, 7, 4, 6, frame], [20, 8, 2, 4, face]];
    case FRAME.backhand:
      return [[-3, 9, 2, 2, PAL.brown], [-7, 7, 4, 6, frame], [-6, 8, 2, 4, face]];
    case FRAME.overhead:
      return [[12, -2, 2, 2, PAL.brown], [11, -8, 4, 6, frame], [12, -7, 2, 4, face]];
    case FRAME.cheer:
      return [[12, -1, 2, 2, PAL.brown], [11, -7, 4, 6, frame], [12, -6, 2, 4, face]];
    default:
      return [[13, 12, 1, 3, PAL.brown], [12, 6, 4, 6, frame], [13, 7, 2, 4, face]];
  }
}

/** Make (once) the texture strip for a look; returns its key. */
export function ensurePlayerTexture(scene: Phaser.Scene, key: string, look: Look): string {
  if (scene.textures.exists(key)) return scene.textures.get(key).key;
  const g = scene.make.graphics({}, false);
  const ox = 9; // body offset inside the frame (room for the racket both sides)
  const oy = 9; // room above the head for an overhead racket
  for (let f = 0; f < FRAMES; f++) {
    const fx = f * SPRITE_W + ox;
    const parts = [...frameRects(f, look), ...racketRects(f)];
    // Chunky outline: every block drawn one pixel bigger in ink first.
    g.fillStyle(PAL.ink, 1);
    for (const [x, y, w, h] of parts) g.fillRect(fx + x - 1, oy + y - 1, w + 2, h + 2);
    for (const [x, y, w, h, c] of parts) g.fillStyle(c, 1).fillRect(fx + x, oy + y, w, h);
  }
  g.generateTexture(key, SPRITE_W * FRAMES, SPRITE_H);
  g.destroy();
  const tex = scene.textures.get(key);
  for (let f = 0; f < FRAMES; f++) tex.add(f, 0, f * SPRITE_W, 0, SPRITE_W, SPRITE_H);
  return key;
}

/** The four players' looks: your team in blue (you with yellow trim), the computer team in red. */
export const LOOKS: Look[] = [
  { kit: PAL.sky, kitDark: PAL.yellow, hair: PAL.brown, skin: PAL.skin, shoes: PAL.white, front: false },
  { kit: PAL.sky, kitDark: PAL.blue, hair: PAL.ink, skin: PAL.skinDark, shoes: PAL.white, front: false },
  { kit: PAL.red, kitDark: PAL.redDark, hair: PAL.yellow, skin: PAL.skin, shoes: PAL.white, front: true },
  { kit: PAL.orange, kitDark: PAL.redDark, hair: PAL.ink, skin: PAL.skinDark, shoes: PAL.white, front: true },
];
