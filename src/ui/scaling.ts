// Works out how big to show the game on screen.
// No Phaser here, so it can be unit-tested.

export interface ScaleResult {
  /** How many real screen pixels each game pixel becomes (a whole number). */
  factor: number;
  /** Size of the canvas in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
}

/**
 * Pick the largest whole-number scale that fits the space available.
 * The count is done in *device* pixels, because phones have 2-3 device pixels
 * per CSS pixel: a 216x384 game on a 390x844 upright iPhone (3 device pixels
 * per CSS pixel) gets factor 5, i.e. 1080x1920 device pixels.
 */
export function computeScale(
  availCssW: number,
  availCssH: number,
  dpr: number,
  gameW: number,
  gameH: number,
): ScaleResult {
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const w = Math.max(0, availCssW) * ratio;
  const h = Math.max(0, availCssH) * ratio;
  const factor = Math.max(1, Math.floor(Math.min(w / gameW, h / gameH)));
  return {
    factor,
    cssWidth: (gameW * factor) / ratio,
    cssHeight: (gameH * factor) / ratio,
  };
}
