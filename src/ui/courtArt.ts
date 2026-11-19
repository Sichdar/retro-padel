import Phaser from 'phaser';
import { COURT_LENGTH, COURT_WIDTH, CourtView, project } from '../game/projection';
import { PAL } from './palette';

// Draws the padel court (floor, lines, glass, mesh, net) in the 3/4 view.
// Real proportions: 20 x 10 m, service lines 6.95 m from the net,
// back walls glass 3 m with mesh above, side walls glass for 2 m then mesh.

const SERVICE_FROM_NET = 6.95;
const WALL_GLASS = 3;
const WALL_TOP = 4;
const SIDE_GLASS_LEN = 2;

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

/** Everything behind the players: apron, floor, lines, far and back walls. */
export function drawCourtBack(g: G, view: CourtView): void {
  const L = COURT_LENGTH;
  const W = COURT_WIDTH;

  // Ground around the court.
  quad(g, view, [[-1.5, -0.6, 0], [L + 1.5, -0.6, 0], [L + 1.5, W + 0.6, 0], [-1.5, W + 0.6, 0]], PAL.courtDark);
  // Playing floor, with a slightly lighter strip down the middle for depth.
  quad(g, view, [[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]], PAL.court);
  quad(g, view, [[0, W * 0.5, 0], [L, W * 0.5, 0], [L, W, 0], [0, W, 0]], PAL.courtLight, 0.25);

  // Lines: service lines and centre service line.
  const sL = L / 2 - SERVICE_FROM_NET;
  const sR = L / 2 + SERVICE_FROM_NET;
  line(g, view, [sL, 0, 0], [sL, W, 0], PAL.lines);
  line(g, view, [sR, 0, 0], [sR, W, 0], PAL.lines);
  line(g, view, [sL, W / 2, 0], [sR, W / 2, 0], PAL.lines);

  // Far side wall: glass near each end, mesh in between.
  meshPanel(g, view, [SIDE_GLASS_LEN, 0], [L - SIDE_GLASS_LEN, 0], 0, WALL_GLASS);
  glassPanel(g, view, [0, 0], [SIDE_GLASS_LEN, 0], WALL_GLASS);
  glassPanel(g, view, [L - SIDE_GLASS_LEN, 0], [L, 0], WALL_GLASS);

  // Back walls (left and right ends): glass with mesh on top.
  for (const x of [0, L]) {
    glassPanel(g, view, [x, 0], [x, W], WALL_GLASS);
    meshPanel(g, view, [x, 0], [x, W], WALL_GLASS, WALL_TOP);
  }
}

/** The net across the middle of the court (drawn after things behind it). */
export function drawNet(g: G, view: CourtView): void {
  const x = COURT_LENGTH / 2;
  const W = COURT_WIDTH;
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const y0 = (W * i) / steps;
    const y1 = (W * (i + 1)) / steps;
    const h = (y: number) => 0.88 + 0.04 * Math.abs(y - W / 2) / (W / 2);
    quad(g, view, [[x, y0, 0], [x, y1, 0], [x, y1, h(y1)], [x, y0, h(y0)]], PAL.ink, 0.45);
    line(g, view, [x, y0, h(y0)], [x, y1, h(y1)], PAL.white);
  }
  for (const y of [0, W]) line(g, view, [x, y, 0], [x, y, 0.92], PAL.grey);
}
