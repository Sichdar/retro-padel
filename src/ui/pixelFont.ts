import Phaser from 'phaser';

// Builds a crisp bitmap font from "Press Start 2P" (OFL licence) at load time.
// Each letter is drawn once at 8x8 pixels, then every pixel is forced to fully
// on or fully off, so text never looks blurry when the game is scaled up.

export const FONT_KEY = 'px8';
export const FONT_FAMILY = '"Press Start 2P"';
const CELL = 8;
const PER_ROW = 16;
const CHARS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

/** Wait for the font file (at most `timeoutMs`), so the letters are drawn with it. */
export async function loadPixelFont(timeoutMs = 4000): Promise<boolean> {
  if (!('fonts' in document)) return false;
  const load = document.fonts.load(`8px ${FONT_FAMILY}`, 'AZaz09').then((f) => f.length > 0);
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  try {
    return await Promise.race([load, timeout]);
  } catch {
    return false;
  }
}

// Each letter is drawn 8 times too big, then one sample is read from the
// middle of every 8x8 block. That lands exactly on the font's own pixel grid,
// whatever smoothing the browser applies to the edges.
const BIG = 8;
const PAD = 16;

/** Where the top-left pixel of a capital M lands when drawn at (PAD, PAD). */
function measureOrigin(ctx: CanvasRenderingContext2D, size: number): { dx: number; dy: number } {
  ctx.clearRect(0, 0, size, size);
  ctx.fillText('M', PAD, PAD);
  const data = ctx.getImageData(0, 0, size, size).data;
  let minX = size;
  let minY = size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] >= 128) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
      }
    }
  }
  return minX === size ? { dx: 0, dy: 0 } : { dx: minX - PAD, dy: minY - PAD };
}

export function buildPixelFont(scene: Phaser.Scene): void {
  if (scene.textures.exists(FONT_KEY)) return;
  const rows = Math.ceil(CHARS.length / PER_ROW);
  const canvas = document.createElement('canvas');
  canvas.width = PER_ROW * CELL;
  canvas.height = rows * CELL;
  const out = canvas.getContext('2d')!;
  const img = out.createImageData(canvas.width, canvas.height);
  const d = img.data;

  const size = PAD * 2 + CELL * BIG;
  const scratch = document.createElement('canvas');
  scratch.width = size;
  scratch.height = size;
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `${CELL * BIG}px ${FONT_FAMILY}, monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  const { dx, dy } = measureOrigin(ctx, size);

  for (let i = 0; i < CHARS.length; i++) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillText(CHARS[i], PAD - dx, PAD - dy);
    const big = ctx.getImageData(0, 0, size, size).data;
    const cx = (i % PER_ROW) * CELL;
    const cy = Math.floor(i / PER_ROW) * CELL;
    for (let r = 0; r < CELL; r++) {
      for (let c = 0; c < CELL; c++) {
        const sx = PAD + c * BIG + BIG / 2;
        const sy = PAD + r * BIG + BIG / 2;
        const on = big[(sy * size + sx) * 4 + 3] >= 128;
        const o = ((cy + r) * canvas.width + cx + c) * 4;
        d[o] = d[o + 1] = d[o + 2] = 255;
        d[o + 3] = on ? 255 : 0;
      }
    }
  }
  out.putImageData(img, 0, 0);

  scene.textures.addCanvas(FONT_KEY, canvas);
  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: FONT_KEY,
    width: CELL,
    height: CELL,
    chars: CHARS,
    charsPerRow: PER_ROW,
    'spacing.x': 0,
    'spacing.y': 0,
    'offset.x': 0,
    'offset.y': 0,
    lineSpacing: 2,
  });
  scene.cache.bitmapFont.add(FONT_KEY, data);
}

export interface PixelTextStyle {
  colour?: number;
  scale?: number;
  outline?: number;
  shadow?: number;
  originX?: number;
  originY?: number;
}

/**
 * Text with an optional 1-pixel outline and drop shadow, all on the pixel grid.
 * Returns a container, so it can be moved, faded or tweened as one piece.
 */
export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: PixelTextStyle = {},
): Phaser.GameObjects.Container {
  const { colour = 0xffffff, scale = 1, outline, shadow, originX = 0.5, originY = 0.5 } = style;
  const parts: Phaser.GameObjects.BitmapText[] = [];
  const make = (dx: number, dy: number, tint: number) => {
    const b = scene.add
      .bitmapText(dx, dy, FONT_KEY, text)
      .setScale(scale)
      .setOrigin(originX, originY)
      .setTint(tint);
    parts.push(b);
  };
  const s = Math.max(1, Math.round(scale / 2));
  if (shadow !== undefined) make(s * 2, s * 2, shadow);
  if (outline !== undefined) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      make(dx * s, dy * s, outline);
    }
  }
  make(0, 0, colour);
  return scene.add.container(Math.round(x), Math.round(y), parts);
}
