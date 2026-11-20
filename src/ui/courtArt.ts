import Phaser from 'phaser';
import { CourtView, project } from '../game/projection';
import {
  BACK_WALL_TOP as WALL_TOP,
  COURT_LENGTH,
  COURT_WIDTH,
  GLASS_HEIGHT as WALL_GLASS,
  NET_X,
  SERVICE_FROM_NET,
  SIDE_GLASS_LENGTH as SIDE_GLASS_LEN,
  SIDE_MESH_TOP,
  SIDE_STEP_HEIGHT,
  SIDE_STEP_LENGTH as SIDE_STEP_LEN,
  netHeight,
} from '../game/court';
import { PAL } from './palette';

// Draws the padel court (floor, lines, glass, mesh, net) in the upright view.
// All sizes come from game/court.ts, the same numbers the physics uses.

type G = Phaser.GameObjects.Graphics;

function quad(g: G, view: CourtView, pts: [number, number, number][], colour: number, alpha = 1): void {
  g.fillStyle(colour, alpha);
  g.fillPoints(
    pts.map(([x, y, z]) => {
      const p = project(view, x, y, z);
      return new Phaser.Math.Vector2(Math.round(p.x), Math.round(p.y));
    }),
    true,
  );
}

function line(g: G, view: CourtView, a: [number, number, number], b: [number, number, number], colour: number, alpha = 1): void {
  const p = project(view, ...a);
  const q = project(view, ...b);
  g.lineStyle(1, colour, alpha);
  g.lineBetween(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, Math.round(q.x) + 0.5, Math.round(q.y) + 0.5);
}

/** Mesh: a fine grid of posts and wires between two points along a wall. */
function meshPanel(
  g: G,
  view: CourtView,
  from: [number, number],
  to: [number, number],
  z0: number,
  z1: number,
): void {
  const [x0, y0] = from;
  const [x1, y1] = to;
  quad(g, view, [[x0, y0, z0], [x1, y1, z0], [x1, y1, z1], [x0, y0, z1]], PAL.mesh, 0.35);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.round(len / 0.5));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const x = x0 + (x1 - x0) * f;
    const y = y0 + (y1 - y0) * f;
    line(g, view, [x, y, z0], [x, y, z1], PAL.mesh, i % 4 === 0 ? 1 : 0.55);
  }
  for (let z = z0; z <= z1 + 1e-6; z += 0.5) {
    line(g, view, [x0, y0, z], [x1, y1, z], PAL.mesh, 0.7);
  }
}

function glassPanel(g: G, view: CourtView, from: [number, number], to: [number, number], z1: number): void {
  const [x0, y0] = from;
  const [x1, y1] = to;
  quad(g, view, [[x0, y0, 0], [x1, y1, 0], [x1, y1, z1], [x0, y0, z1]], PAL.glass, 0.18);
  line(g, view, [x0, y0, z1], [x1, y1, z1], PAL.glass, 0.9);
  line(g, view, [x0, y0, 0], [x0, y0, z1], PAL.glass, 0.6);
  line(g, view, [x1, y1, 0], [x1, y1, z1], PAL.glass, 0.6);
}

/** Everything behind the players: apron, floor, lines, side walls and the far back wall. */
export function drawCourtBack(g: G, view: CourtView): void {
  const L = COURT_LENGTH;
  const W = COURT_WIDTH;
  const ends = view.flipped ? { far: L, near: 0 } : { far: 0, near: L };

  // Ground around the court.
  quad(g, view, [[-1.2, -0.8, 0], [L + 1.2, -0.8, 0], [L + 1.2, W + 0.8, 0], [-1.2, W + 0.8, 0]], PAL.courtDark);
  // Playing floor, with faint bands across it for depth.
  quad(g, view, [[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]], PAL.court);
  for (let x = 0; x < L; x += 5) {
    quad(g, view, [[x, 0, 0], [x + 2.5, 0, 0], [x + 2.5, W, 0], [x, W, 0]], PAL.courtLight, 0.18);
  }

  // Lines: service lines and centre service line.
  const s1 = L / 2 - SERVICE_FROM_NET;
  const s2 = L / 2 + SERVICE_FROM_NET;
  line(g, view, [s1, 0, 0], [s1, W, 0], PAL.lines);
  line(g, view, [s2, 0, 0], [s2, W, 0], PAL.lines);
  line(g, view, [s1, W / 2, 0], [s2, W / 2, 0], PAL.lines);

  // Far back wall (top of the screen): glass with mesh on top.
  glassPanel(g, view, [ends.far, 0], [ends.far, W], WALL_GLASS);
  meshPanel(g, view, [ends.far, 0], [ends.far, W], WALL_GLASS, WALL_TOP);

  // Side walls (left and right): tall glass at each end, then a lower glass
  // step, mesh in between. They lean outwards in this view, so they never
  // cover the court.
  for (const y of [0, W]) {
    meshPanel(g, view, [SIDE_STEP_LEN, y], [L - SIDE_STEP_LEN, y], 0, SIDE_MESH_TOP);
    for (const [a, b] of [[SIDE_GLASS_LEN, SIDE_STEP_LEN], [L - SIDE_STEP_LEN, L - SIDE_GLASS_LEN]]) {
      glassPanel(g, view, [a, y], [b, y], SIDE_STEP_HEIGHT);
      meshPanel(g, view, [a, y], [b, y], SIDE_STEP_HEIGHT, SIDE_MESH_TOP);
    }
    for (const [a, b] of [[0, SIDE_GLASS_LEN], [L - SIDE_GLASS_LEN, L]]) {
      glassPanel(g, view, [a, y], [b, y], WALL_GLASS);
      meshPanel(g, view, [a, y], [b, y], WALL_GLASS, WALL_TOP);
    }
  }
}

/** The net across the middle of the court (drawn after things behind it). */
export function drawNet(g: G, view: CourtView): void {
  const x = NET_X;
  const W = COURT_WIDTH;
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const y0 = (W * i) / steps;
    const y1 = (W * (i + 1)) / steps;
    const h = netHeight;
    quad(g, view, [[x, y0, 0], [x, y1, 0], [x, y1, h(y1)], [x, y0, h(y0)]], PAL.ink, 0.45);
    line(g, view, [x, y0, h(y0)], [x, y1, h(y1)], PAL.white);
  }
  for (const y of [0, W]) line(g, view, [x, y, 0], [x, y, netHeight(y)], PAL.grey);
}

/**
 * The near back wall (bottom of the screen), in front of everything: only
 * faint outlines, so it never hides the players or the ball.
 */
export function drawNearWall(g: G, view: CourtView): void {
  const x = view.flipped ? 0 : COURT_LENGTH;
  const W = COURT_WIDTH;
  const a = 0.3;
  line(g, view, [x, 0, WALL_GLASS], [x, W, WALL_GLASS], PAL.glass, a + 0.2);
  line(g, view, [x, 0, WALL_TOP], [x, W, WALL_TOP], PAL.grey, a);
  for (const y of [0, W / 4, W / 2, (W * 3) / 4, W]) {
    line(g, view, [x, y, 0], [x, y, WALL_TOP], PAL.grey, a);
  }
}
