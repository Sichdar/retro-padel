import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { DEFAULT_VIEW } from '../game/projection';
import { drawCourtBack, drawNet } from '../ui/courtArt';
import { PAL } from '../ui/palette';

// The stadium at sunset behind the title and menu screens, drawn once into a
// texture so it costs nothing per frame.

export const BACKDROP_KEY = 'backdrop';

/** Small repeatable random numbers, so the crowd looks the same every time. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The stadium and court; with withNet false, the net is left out so a scene can draw it in front of or behind the ball. */
export function ensureBackdrop(scene: Phaser.Scene, withNet = true): string {
  const key = withNet ? BACKDROP_KEY : BACKDROP_KEY + '-nonet';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  const rnd = seeded(94);

  // Sky in bands, with a checkerboard dither where two colours meet.
  const bands: [number, number][] = [
    [0, PAL.navy],
    [26, PAL.purpleDark],
    [46, PAL.purple],
    [62, PAL.pink],
    [74, PAL.sunset],
    [84, PAL.yellowLight],
  ];
  const skyBottom = 100;
  bands.forEach(([y, c], i) => {
    const next = i + 1 < bands.length ? bands[i + 1][0] : skyBottom;
    g.fillStyle(c, 1).fillRect(0, y, GAME_W, next - y);
  });
  for (let i = 1; i < bands.length; i++) {
    const [y] = bands[i];
    const prev = bands[i - 1][1];
    g.fillStyle(prev, 1);
    for (let x = 0; x < GAME_W; x++) {
      if (x % 2 === 0) g.fillRect(x, y, 1, 1);
      if (x % 4 === 1) g.fillRect(x, y + 1, 1, 1);
    }
  }
  // Stars.
  for (let i = 0; i < 30; i++) {
    g.fillStyle(rnd() < 0.3 ? PAL.yellowLight : PAL.white, 1).fillRect(Math.floor(rnd() * GAME_W), Math.floor(rnd() * 30), 1, 1);
  }
  // Striped setting sun.
  const sx = 316;
  const sy = 84;
  const r = 24;
  for (let y = -r; y <= 0; y++) {
    if (y > -10 && (y + 20) % 4 === 0) continue;
    const half = Math.floor(Math.sqrt(r * r - y * y));
    g.fillStyle(y < -14 ? PAL.yellowLight : y < -6 ? PAL.yellow : PAL.orange, 1).fillRect(sx - half, sy + y, half * 2, 1);
  }

  // Stands behind the far wall, with a crowd of tiny heads.
  g.fillStyle(PAL.ink, 1).fillRect(0, 84, GAME_W, 40);
  g.fillStyle(PAL.navy, 1);
  for (let row = 0; row < 5; row++) g.fillRect(0, 88 + row * 6, GAME_W, 1);
  const crowd = [PAL.red, PAL.yellow, PAL.white, PAL.cyan, PAL.pink, PAL.green, PAL.orange, PAL.skin, PAL.skinDark];
  for (let row = 0; row < 5; row++) {
    for (let x = 2 + (row % 2) * 2; x < GAME_W; x += 4) {
      if (rnd() < 0.15) continue;
      const y = 85 + row * 6 + (rnd() < 0.2 ? -1 : 0);
      g.fillStyle(crowd[Math.floor(rnd() * crowd.length)], 1).fillRect(x, y + 2, 2, 2);
      g.fillStyle(rnd() < 0.5 ? PAL.skin : PAL.skinDark, 1).fillRect(x, y, 2, 2);
    }
  }
  // Floodlight towers.
  for (const x of [20, 362]) {
    g.fillStyle(PAL.ink, 1).fillRect(x, 30, 2, 60);
    g.fillStyle(PAL.greyDark, 1).fillRect(x - 6, 24, 14, 7);
    g.fillStyle(PAL.yellowLight, 1);
    for (let i = 0; i < 3; i++) g.fillRect(x - 5 + i * 5, 25, 3, 2), g.fillRect(x - 5 + i * 5, 28, 3, 2);
  }

  // Stadium floor around the court.
  g.fillStyle(PAL.ink, 1).fillRect(0, 118, GAME_W, GAME_H - 118);
  g.fillStyle(PAL.navy, 1);
  for (let x = 0; x < GAME_W; x += 2) g.fillRect(x, 118 + ((x / 2) % 2), 1, 1);
  drawCourtBack(g, DEFAULT_VIEW);
  if (withNet) drawNet(g, DEFAULT_VIEW);

  g.generateTexture(key, GAME_W, GAME_H);
  g.destroy();
  return key;
}
