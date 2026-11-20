// The padel court's real measurements and what each wall is made of.
// Shared by the physics and the drawing, so they always agree.

export const COURT_LENGTH = 20; // metres, x axis (left to right on screen)
export const COURT_WIDTH = 10; // metres, y axis (0 = far side, 10 = near side)
export const NET_X = COURT_LENGTH / 2;
export const NET_HEIGHT_CENTRE = 0.88;
export const NET_HEIGHT_POSTS = 0.92;
export const SERVICE_FROM_NET = 6.95;

/** Glass height on the back walls and on the glass part of the side walls. */
export const GLASS_HEIGHT = 3;
/** Top of the mesh above the back-wall glass. */
export const BACK_WALL_TOP = 4;
/** Side walls: full-height glass (3 m) for this distance from each back wall. */
export const SIDE_GLASS_LENGTH = 2;
/** Then a lower glass step (2 m high) up to this distance, as on most real courts. */
export const SIDE_STEP_LENGTH = 4;
export const SIDE_STEP_HEIGHT = 2;
/** Height of the side mesh along the rest of the court (and above the step). */
export const SIDE_MESH_TOP = 3;

export type Material = 'glass' | 'mesh' | 'open';
export type WallId = 'back-left' | 'back-right' | 'side-far' | 'side-near';

/** Net height (metres) at depth y: a little higher at the posts. */
export function netHeight(y: number): number {
  const fromCentre = Math.min(1, Math.abs(y - COURT_WIDTH / 2) / (COURT_WIDTH / 2));
  return NET_HEIGHT_CENTRE + (NET_HEIGHT_POSTS - NET_HEIGHT_CENTRE) * fromCentre;
}

/**
 * What the ball meets on a wall at height z.
 * `along` is the position along the wall: y for back walls, x for side walls.
 * 'open' means there is no wall there: the ball leaves the court.
 */
export function wallMaterial(wall: WallId, along: number, z: number): Material {
  if (wall === 'back-left' || wall === 'back-right') {
    if (z < GLASS_HEIGHT) return 'glass';
    if (z < BACK_WALL_TOP) return 'mesh';
    return 'open';
  }
  const nearEnd = along < SIDE_GLASS_LENGTH || along > COURT_LENGTH - SIDE_GLASS_LENGTH;
  if (nearEnd) {
    if (z < GLASS_HEIGHT) return 'glass';
    if (z < BACK_WALL_TOP) return 'mesh';
    return 'open';
  }
  const onStep = along < SIDE_STEP_LENGTH || along > COURT_LENGTH - SIDE_STEP_LENGTH;
  if (onStep && z < SIDE_STEP_HEIGHT) return 'glass';
  return z < SIDE_MESH_TOP ? 'mesh' : 'open';
}
