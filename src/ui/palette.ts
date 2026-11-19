// The game's limited palette (about 32 colours, 16-bit console style).
// Always pick colours from here so the whole game looks consistent.

export const PAL = {
  black: 0x0b0a12,
  ink: 0x1b1730,
  navy: 0x222a5c,
  blue: 0x2f4fb0,
  sky: 0x4f86e8,
  skyLight: 0x8fc2ff,
  cyan: 0x58e1f0,
  white: 0xf4f1e8,
  grey: 0x9a98a8,
  greyDark: 0x5b5870,
  courtDark: 0x1d4f9c,
  court: 0x2a6fd0,
  courtLight: 0x3f8ae6,
  lines: 0xf4f1e8,
  turf: 0x2f8f4a,
  turfDark: 0x1f6235,
  glass: 0x9fe6ff,
  mesh: 0x3b3a52,
  red: 0xe23a4a,
  redDark: 0x9a1e3a,
  orange: 0xf47a2a,
  yellow: 0xffd23c,
  yellowLight: 0xfff1a0,
  ball: 0xe8f44a,
  pink: 0xff6fa8,
  purple: 0x7a3fc0,
  purpleDark: 0x45247a,
  sunset: 0xff9a5a,
  skin: 0xf2b48a,
  skinDark: 0xb06a48,
  brown: 0x6a3a2a,
  green: 0x5ad65a,
} as const;

export type PalColour = keyof typeof PAL;

/** '#rrggbb' version of a palette colour, for CSS and canvas drawing. */
export function css(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
