// Turns court positions in metres into screen pixels for the raised 3/4 view.
// No Phaser here, so it can be unit-tested and reused by every scene.
//
// Court coordinates: x = 0..20 m along the length (left to right on screen),
// y = 0..10 m across (0 = far side, top of screen; 10 = near side),
// z = height above the ground in metres.

export { COURT_LENGTH, COURT_WIDTH } from "./court";
import { COURT_LENGTH, COURT_WIDTH } from "./court";

export interface CourtView {
  /** Screen x of the court's centre line. */
  cx: number;
  /** Screen y of the far edge (y = 0 m) and near edge (y = 10 m). */
  farY: number;
  nearY: number;
  /** Half the on-screen court length at the far and near edges. */
  farHalf: number;
  nearHalf: number;
  /**
   * How far (px) the near edge is shifted right compared with the far edge.
   * A small slant means the net is not seen exactly edge-on, so its height shows.
   */
  skew: number;
}

export const DEFAULT_VIEW: CourtView = {
  cx: 192,
  farY: 120,
  nearY: 204,
  farHalf: 132,
  nearHalf: 166,
  skew: 28,
};

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Pixels per metre at depth y (things nearer the viewer look bigger). */
export function pxPerMetre(view: CourtView, yM: number): number {
  const v = yM / COURT_WIDTH;
  const half = view.farHalf + (view.nearHalf - view.farHalf) * v;
  return (half * 2) / COURT_LENGTH;
}

/** The court spot (on the ground) under a screen point: the reverse of project(). */
export function unprojectGround(view: CourtView, sx: number, sy: number): { x: number; y: number } {
  const v = (sy - view.farY) / (view.nearY - view.farY);
  const half = view.farHalf + (view.nearHalf - view.farHalf) * v;
  const u = (sx - view.cx - (v - 0.5) * view.skew) / (2 * half) + 0.5;
  return { x: u * COURT_LENGTH, y: v * COURT_WIDTH };
}

export function project(view: CourtView, xM: number, yM: number, zM = 0): ScreenPoint {
  const v = yM / COURT_WIDTH;
  const half = view.farHalf + (view.nearHalf - view.farHalf) * v;
  const groundY = view.farY + (view.nearY - view.farY) * v;
  return {
    x: view.cx + (xM / COURT_LENGTH - 0.5) * 2 * half + (v - 0.5) * view.skew,
    y: groundY - zM * pxPerMetre(view, yM) * 0.9,
  };
}
