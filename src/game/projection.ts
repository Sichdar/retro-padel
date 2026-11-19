// Turns court positions in metres into screen pixels for the upright (portrait)
// view, seen from a raised spot behind the near back wall.
// No Phaser here, so it can be unit-tested and reused by every scene.
//
// Court coordinates: x = 0..20 m along the length (0 = far end, top of the
// screen; 20 = near end, bottom of the screen), y = 0..10 m across (0 = left,
// 10 = right), z = height above the ground in metres.

export { COURT_LENGTH, COURT_WIDTH } from "./court";
import { COURT_LENGTH, COURT_WIDTH } from "./court";

export interface CourtView {
  /** Screen x of the court's centre line. */
  cx: number;
  /** Screen y of the far back wall (x = 0 m) and near back wall (x = 20 m). */
  farY: number;
  nearY: number;
  /** Half the on-screen court width at the far and near ends. */
  farHalf: number;
  nearHalf: number;
  /** How much height lifts things up the screen (1 = as much as a metre across). */
  lift: number;
  /**
   * How much things spread out from the centre per metre of height, so the
   * side walls lean outwards and stay visible instead of covering the court.
   */
  spread: number;
  /**
   * Turn the court round (far end at the bottom). In multiplayer each phone
   * shows its own team at the bottom of the screen.
   */
  flipped?: boolean;
}

export const DEFAULT_VIEW: CourtView = {
  cx: 108,
  farY: 84,
  nearY: 300,
  farHalf: 58,
  nearHalf: 84,
  lift: 0.75,
  spread: 0.05,
};

export interface ScreenPoint {
  x: number;
  y: number;
}

function along(view: CourtView, xM: number): number {
  const v = xM / COURT_LENGTH;
  return view.flipped ? 1 - v : v;
}

function across(view: CourtView, yM: number): number {
  const u = yM / COURT_WIDTH;
  return view.flipped ? 1 - u : u;
}

/** Pixels per metre at court length x (things nearer the viewer look bigger). */
export function pxPerMetre(view: CourtView, xM: number): number {
  const v = along(view, xM);
  const half = view.farHalf + (view.nearHalf - view.farHalf) * v;
  return (half * 2) / COURT_WIDTH;
}

/** The court spot (on the ground) under a screen point: the reverse of project(). */
export function unprojectGround(view: CourtView, sx: number, sy: number): { x: number; y: number } {
  const v = (sy - view.farY) / (view.nearY - view.farY);
  const half = view.farHalf + (view.nearHalf - view.farHalf) * v;
  const u = (sx - view.cx) / (2 * half) + 0.5;
  return {
    x: (view.flipped ? 1 - v : v) * COURT_LENGTH,
    y: (view.flipped ? 1 - u : u) * COURT_WIDTH,
  };
}

export function project(view: CourtView, xM: number, yM: number, zM = 0): ScreenPoint {
  const v = along(view, xM);
  const u = across(view, yM);
  const half = view.farHalf + (view.nearHalf - view.farHalf) * v;
  const groundX = view.cx + (u - 0.5) * 2 * half;
  const groundY = view.farY + (view.nearY - view.farY) * v;
  const ppm = (half * 2) / COURT_WIDTH;
  return {
    x: view.cx + (groundX - view.cx) * (1 + zM * view.spread),
    y: groundY - zM * ppm * view.lift,
  };
}

/** True when court length x is nearer the viewer than the net (drawn in front of it). */
export function nearerThanNet(view: CourtView, xM: number): boolean {
  return along(view, xM) > 0.5;
}
