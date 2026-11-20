import Phaser from 'phaser';
import { PAL } from './palette';

// Original pixel-art padel players, drawn in code from simple blocks.
// Each look becomes one texture strip with these frames:
export const FRAME = {
  idle: 0,
  run1: 1,
  run2: 2,
  forehand: 3,
  backhand: 4,
  overhead: 5,
  cheer: 6,
  run3: 7,
  run4: 8,
  ready: 9,
  fhWind: 10,
  bhWind: 11,
  ohWind: 12,
  cheer2: 13,
} as const;
const FRAMES = 14;
export const SPRITE_W = 34;
export const SPRITE_H = 40;
/** Row of the feet (the sprite stands on this row). */
export const FOOT_Y = 38;

/** Run cycle: stride, passing, other stride, passing. */
export const RUN_CYCLE = [FRAME.run1, FRAME.run3, FRAME.run2, FRAME.run4];
/** Wind-up frame before each swing. */
export const WIND_UP = { forehand: FRAME.fhWind, backhand: FRAME.bhWind, overhead: FRAME.ohWind } as const;

/** Hair styles: the 4 character designs. */
export type Style = 0 | 1 | 2 | 3;

export interface Look {
  kit: number;
  kitDark: number;
  hair: number;
  skin: number;
  shoes: number;
  style: Style;
  /** Seen from the front (far team) or from behind (near team). */
  front: boolean;
}

/** The 4 original character designs to choose from in the settings. */
export const DESIGNS: { name: string; hair: number; skin: number; style: Style }[] = [
  { name: 'HEADBAND', hair: PAL.brown, skin: PAL.skin, style: 0 },
  { name: 'CAP', hair: PAL.ink, skin: PAL.skinDark, style: 1 },
  { name: 'PONYTAIL', hair: PAL.yellow, skin: PAL.skin, style: 2 },
  { name: 'CURLS', hair: PAL.ink, skin: PAL.brown, style: 3 },
];

/** Kit colours for your team. */
export const KITS: { name: string; kit: number; dark: number }[] = [
  { name: 'BLUE', kit: PAL.sky, dark: PAL.blue },
  { name: 'GREEN', kit: PAL.green, dark: PAL.turfDark },
  { name: 'PURPLE', kit: PAL.purple, dark: PAL.purpleDark },
  { name: 'PINK', kit: PAL.pink, dark: PAL.purpleDark },
];

type R = [x: number, y: number, w: number, h: number, c: number];

/** Head and hair for a design, seen from the front or from behind. */
function headRects(l: Look, by: number): R[] {
  const r: R[] = [];
  const y = by;
  if (l.front) {
    r.push([5, y + 1, 6, 6, l.skin]);
    r.push([6, y + 4, 1, 1, PAL.ink], [9, y + 4, 1, 1, PAL.ink]);
    switch (l.style) {
      case 0:
        r.push([5, y, 6, 2, l.hair], [5, y + 2, 1, 2, l.hair], [10, y + 2, 1, 2, l.hair], [5, y + 2, 6, 1, l.kitDark]);
        break;
      case 1: // cap with a peak towards the viewer
        r.push([5, y - 1, 6, 3, l.kitDark], [4, y + 2, 8, 1, l.kitDark], [5, y + 3, 1, 1, l.hair], [10, y + 3, 1, 1, l.hair]);
        break;
      case 2: // ponytail swinging to one side
        r.push([5, y, 6, 2, l.hair], [5, y + 2, 1, 2, l.hair], [10, y + 2, 1, 2, l.hair], [11, y + 1, 2, 4, l.hair]);
        break;
      case 3: // big curls
        r.push([4, y - 1, 8, 3, l.hair], [3, y + 1, 2, 4, l.hair], [11, y + 1, 2, 4, l.hair]);
        break;
    }
  } else {
    switch (l.style) {
      case 0:
        r.push([5, y, 6, 6, l.hair], [5, y + 5, 6, 1, l.skin], [5, y + 2, 6, 1, l.kitDark]);
        break;
      case 1:
        r.push([5, y + 1, 6, 5, l.hair], [5, y + 5, 6, 1, l.skin], [5, y - 1, 6, 3, l.kitDark], [7, y + 2, 2, 1, l.kitDark]);
        break;
      case 2:
        r.push([5, y, 6, 6, l.hair], [5, y + 5, 6, 1, l.skin], [7, y + 5, 2, 4, l.hair], [5, y + 2, 6, 1, l.kitDark]);
        break;
      case 3:
        r.push([4, y - 1, 8, 7, l.hair], [3, y + 1, 1, 4, l.hair], [12, y + 1, 1, 4, l.hair], [5, y + 6, 6, 1, l.skin]);
        break;
    }
  }
  return r;
}

/** The blocks that make one frame, in body coordinates (feet at the bottom). */
function frameRects(f: number, l: Look): R[] {
  const r: R[] = [];
  // Whole-body lift: passing steps bob up, the ready stance crouches, the jump leaps.
  const lift = f === FRAME.run3 || f === FRAME.run4 ? -1 : f === FRAME.ready ? 1 : f === FRAME.cheer2 ? -3 : 0;
  const legL = f === FRAME.run1 ? -2 : f === FRAME.run2 ? 1 : 0;
  const legR = f === FRAME.run2 ? -2 : f === FRAME.run1 ? 1 : 0;
  const wide = f === FRAME.ready ? 1 : 0;
  const legLen = (raise: number) => Math.max(2, 5 + Math.min(0, raise) - (f === FRAME.ready ? 1 : 0));
  // Legs and shoes (a raised leg is shorter; the ready stance has bent knees).
  // Shoes stay on the ground when crouching (shorter legs), and leave it when bobbing or jumping.
  const shoeY = 23 + Math.min(0, lift);
  r.push([5 - wide, 18 + lift, 2, legLen(legL), l.skin], [9 + wide, 18 + lift, 2, legLen(legR), l.skin]);
  r.push([4 - wide, shoeY + Math.min(0, legL), 3, 2, l.shoes], [9 + wide, shoeY + Math.min(0, legR), 3, 2, l.shoes]);
  const y0 = lift;
  // Shorts and shirt.
  r.push([4, 15 + y0, 8, 3, l.kitDark]);
  r.push([4, 8 + y0, 8, 7, l.kit], [4, 12 + y0, 8, 1, l.kitDark]);
  // Arms.
  const sway = f === FRAME.run1 ? 1 : f === FRAME.run2 ? -1 : 0;
  switch (f) {
    case FRAME.cheer:
    case FRAME.cheer2:
      r.push([2, 1 + y0, 2, 8, l.skin], [12, 1 + y0, 2, 8, l.skin]);
      break;
    case FRAME.overhead:
      r.push([2, 8 + y0, 2, 6, l.skin], [12, 0 + y0, 2, 9, l.skin]);
      break;
    case FRAME.ohWind:
      r.push([2, 3 + y0, 2, 6, l.skin], [12, 3 + y0, 2, 6, l.skin]);
      break;
    case FRAME.forehand:
      r.push([2, 8 + y0, 2, 6, l.skin], [12, 9 + y0, 6, 2, l.skin]);
      break;
    case FRAME.fhWind:
      r.push([3, 9 + y0, 3, 2, l.skin], [12, 6 + y0, 2, 5, l.skin]);
      break;
    case FRAME.backhand:
      r.push([-2, 9 + y0, 6, 2, l.skin], [12, 8 + y0, 2, 6, l.skin]);
      break;
    case FRAME.bhWind:
      r.push([2, 8 + y0, 2, 6, l.skin], [10, 9 + y0, 4, 2, l.skin]);
      break;
    case FRAME.ready:
      r.push([3, 10 + y0, 3, 2, l.skin], [10, 10 + y0, 4, 2, l.skin]);
      break;
    default:
      r.push([2, 8 + sway + y0, 2, 6, l.skin], [12, 8 - sway + y0, 2, 6, l.skin]);
  }
  // Short sleeves.
  r.push([3, 8 + y0, 1, 2, l.kit], [12, 8 + y0, 1, 2, l.kit]);
  // Neck and head.
  r.push([7, 7 + y0, 2, 1, l.skin]);
  r.push(...headRects(l, y0));
  return r;
}

/** Racket blocks for a frame: [handle, head, face]. */
function racketRects(f: number): R[] {
  const frame = PAL.ink;
  const face = PAL.grey;
  const at = (hx: number, hy: number, rx: number, ry: number, horizontal = false): R[] =>
    horizontal
      ? [[hx, hy, 2, 2, PAL.brown], [rx, ry, 6, 4, frame], [rx + 1, ry + 1, 4, 2, face]]
      : [[hx, hy, 2, 2, PAL.brown], [rx, ry, 4, 6, frame], [rx + 1, ry + 1, 2, 4, face]];
  switch (f) {
    case FRAME.forehand:
      return at(17, 9, 19, 7);
    case FRAME.fhWind:
      return at(12, 4, 13, -2);
    case FRAME.backhand:
      return at(-3, 9, -7, 7);
    case FRAME.bhWind:
      return at(8, 9, 2, 8, true);
    case FRAME.overhead:
      return at(12, -2, 11, -8);
    case FRAME.ohWind:
      return at(12, 1, 13, 3);
    case FRAME.cheer:
      return at(12, -1, 11, -7);
    case FRAME.cheer2:
      return at(12, -4, 11, -10);
    case FRAME.ready:
      return at(7, 10, 5, 4);
    default:
      return [[13, 12, 1, 3, PAL.brown], [12, 6, 4, 6, frame], [13, 7, 2, 4, face]];
  }
}

/** Make (once) the texture strip for a look; returns its key. */
export function ensurePlayerTexture(scene: Phaser.Scene, key: string, look: Look): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  const ox = 9; // body offset inside the frame (room for the racket both sides)
  const oy = 13; // room above the head for an overhead racket and a jump
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

/** The computer team's looks, and your partner's. */
const PARTNER = { hair: PAL.ink, skin: PAL.skinDark, style: 0 as Style };
const FAR: Look[] = [
  { kit: PAL.red, kitDark: PAL.redDark, hair: PAL.yellow, skin: PAL.skin, shoes: PAL.white, style: 2, front: true },
  { kit: PAL.orange, kitDark: PAL.redDark, hair: PAL.ink, skin: PAL.skinDark, shoes: PAL.white, style: 1, front: true },
];

/** The four players' looks: your team in your kit (you with yellow trim), the far team in red. */
export function looksFor(design: number, kit: number): Look[] {
  const d = DESIGNS[design] ?? DESIGNS[0];
  const k = KITS[kit] ?? KITS[0];
  // Your partner never wears the same design as you.
  const partner = d.style === PARTNER.style ? { hair: PAL.brown, skin: PAL.skin, style: 3 as Style } : PARTNER;
  return [
    { kit: k.kit, kitDark: PAL.yellow, hair: d.hair, skin: d.skin, shoes: PAL.white, style: d.style, front: false },
    { kit: k.kit, kitDark: k.dark, ...partner, shoes: PAL.white, front: false },
    FAR[0],
    FAR[1],
  ];
}

/** Texture key for a look, so a changed look gets a fresh texture. */
export function lookKey(l: Look): string {
  return `player-${l.kit}-${l.kitDark}-${l.hair}-${l.skin}-${l.style}-${l.front ? 'f' : 'b'}`;
}
