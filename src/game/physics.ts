// Ball physics for the padel court. No Phaser here: plain maths, run at a
// fixed 60 steps per second so it behaves the same on every phone.
//
// Surfaces:
// - floor and glass: clean, predictable bounce
// - mesh: weak bounce with a little randomness
// - net: stops the ball, or (touching the top) pops it up: it may roll over or fall back
// - above a wall's top: the ball leaves the court ('out')

import {
  COURT_LENGTH,
  COURT_WIDTH,
  Material,
  NET_X,
  WallId,
  netHeight,
  wallMaterial,
} from './court';
import { Rng } from './rng';

export const STEP = 1 / 60;
export const GRAVITY = 9.81;
export const BALL_RADIUS = 0.033;
/** Air drag: slows fast balls more than slow ones. */
export const DRAG = 0.012;

export const FLOOR_BOUNCE = 0.72; // share of vertical speed kept after a floor bounce
export const FLOOR_GRIP = 0.88; // share of horizontal speed kept
export const GLASS_BOUNCE = 0.68;
export const GLASS_GRIP = 0.92;
const ROLL_BELOW = 0.6; // vertical speed (m/s) under which the ball stops bouncing and rolls
const ROLL_FRICTION = 1.2; // m/s² slowing while rolling
const STOP_SPEED = 0.05;

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Rolling on the floor (no more bounces). */
  rolling: boolean;
  /** Has left the court over a wall: no more collisions. */
  out: boolean;
  /** Stopped completely. */
  dead: boolean;
}

export type Surface = 'floor' | 'glass' | 'mesh' | 'net' | 'netcord' | 'out';

export interface BallEvent {
  surface: Surface;
  wall: WallId | null;
  x: number;
  y: number;
  z: number;
  /** Ball speed (m/s) just before the contact. */
  speed: number;
}

export function makeBall(x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): Ball {
  return { x, y, z, vx, vy, vz, rolling: false, out: false, dead: false };
}

export function speedOf(b: Ball): number {
  return Math.hypot(b.vx, b.vy, b.vz);
}

/**
 * Velocity that sends the ball from where it is to `target` in `time` seconds
 * (gravity included, drag ignored, so long shots land a little short).
 */
export function aimBall(b: Ball, tx: number, ty: number, tz: number, time: number): void {
  b.vx = (tx - b.x) / time;
  b.vy = (ty - b.y) / time;
  b.vz = (tz - b.z + 0.5 * GRAVITY * time * time) / time;
  b.rolling = false;
  b.dead = false;
}

interface Hit {
  t: number;
  kind: 'floor' | 'net' | WallId;
}

/** Earliest surface the ball reaches within `dt` seconds of straight-line travel. */
function firstHit(b: Ball, dt: number, ignoreNet: boolean): Hit | null {
  let best: Hit | null = null;
  const consider = (t: number, kind: Hit['kind']) => {
    if (t >= 0 && t <= dt && (!best || t < best.t)) best = { t, kind };
  };
  const r = BALL_RADIUS;
  if (!b.rolling && b.vz < 0) consider((r - b.z) / b.vz, 'floor');
  if (b.vx < 0) consider((r - b.x) / b.vx, 'back-left');
  if (b.vx > 0) consider((COURT_LENGTH - r - b.x) / b.vx, 'back-right');
  if (b.vy < 0) consider((r - b.y) / b.vy, 'side-far');
  if (b.vy > 0) consider((COURT_WIDTH - r - b.y) / b.vy, 'side-near');
  if (b.vx !== 0 && !ignoreNet) {
    const side = b.x - NET_X;
    // Only when the ball is about to cross the net plane (or touch it).
    const edge = b.vx > 0 ? NET_X - r : NET_X + r;
    if ((b.vx > 0 && side < -r * 0.5) || (b.vx < 0 && side > r * 0.5)) consider((edge - b.x) / b.vx, 'net');
  }
  return best;
}

function bounceOffWall(b: Ball, wall: WallId, material: Material, rng: Rng): void {
  const glass = material === 'glass';
  const keepNormal = glass ? GLASS_BOUNCE : 0.25 + 0.2 * rng();
  const grip = () => (glass ? GLASS_GRIP : 0.55 + 0.3 * rng());
  if (wall === 'back-left' || wall === 'back-right') {
    b.vx = -b.vx * keepNormal;
    b.vy *= grip();
  } else {
    b.vy = -b.vy * keepNormal;
    b.vx *= grip();
  }
  b.vz *= glass ? GLASS_GRIP : 0.6 + 0.3 * rng();
  if (!glass) b.vz += (rng() - 0.5) * 1.2;
}

/**
 * Move the ball forward by one fixed step. Returns what it touched.
 * `rng` makes the mesh and net-cord bounces vary; pass a seeded one in tests.
 */
export function stepBall(b: Ball, rng: Rng, dt = STEP): BallEvent[] {
  const events: BallEvent[] = [];
  if (b.dead) return events;

  // Forces: gravity and air drag (applied once per step).
  const sp = speedOf(b);
  const drag = Math.max(0, 1 - DRAG * sp * dt);
  b.vx *= drag;
  b.vy *= drag;
  b.vz *= drag;
  if (b.rolling) {
    const hs = Math.hypot(b.vx, b.vy);
    const slow = Math.max(0, hs - ROLL_FRICTION * dt);
    if (slow < STOP_SPEED) {
      b.vx = b.vy = 0;
      b.dead = true;
      return events;
    }
    b.vx *= slow / hs;
    b.vy *= slow / hs;
    b.vz = 0;
    b.z = BALL_RADIUS;
  } else {
    b.vz -= GRAVITY * dt;
  }

  let remaining = dt;
  let ignoreNet = false;
  for (let guard = 0; guard < 8 && remaining > 0; guard++) {
    const hit = b.out ? null : firstHit(b, remaining, ignoreNet);
    if (!hit) {
      b.x += b.vx * remaining;
      b.y += b.vy * remaining;
      b.z += b.vz * remaining;
      break;
    }
    b.x += b.vx * hit.t;
    b.y += b.vy * hit.t;
    b.z += b.vz * hit.t;
    remaining -= hit.t;
    const ev = (surface: Surface, wall: WallId | null): BallEvent => ({
      surface,
      wall,
      x: b.x,
      y: b.y,
      z: b.z,
      speed: speedOf(b),
    });

    if (hit.kind === 'floor') {
      events.push(ev('floor', null));
      b.z = BALL_RADIUS;
      b.vz = -b.vz * FLOOR_BOUNCE;
      b.vx *= FLOOR_GRIP;
      b.vy *= FLOOR_GRIP;
      if (b.vz < ROLL_BELOW) {
        b.vz = 0;
        b.rolling = true;
      }
      continue;
    }

    if (hit.kind === 'net') {
      const top = netHeight(b.y);
      if (b.z - BALL_RADIUS >= top) {
        ignoreNet = true; // clears the net: carry on
        continue;
      }
      if (b.z < top - 0.06) {
        // Into the net: it drops.
        events.push(ev('net', null));
        b.vx = -b.vx * 0.08;
        b.vy *= 0.4;
        b.vz = Math.min(b.vz, 0) * 0.3;
      } else {
        // Clips the top of the net (net cord): pops up, may go over or fall back.
        events.push(ev('netcord', null));
        b.vz = Math.abs(b.vz) * 0.35 + 0.8 + rng() * 0.8;
        b.vx *= -0.25 + rng() * 0.75;
        b.vy *= 0.5;
        b.z = top + BALL_RADIUS;
      }
      continue;
    }

    // A wall.
    const wall = hit.kind;
    const along = wall === 'back-left' || wall === 'back-right' ? b.y : b.x;
    const material = wallMaterial(wall, along, b.z);
    if (material === 'open') {
      events.push(ev('out', wall));
      b.out = true;
      continue;
    }
    events.push(ev(material, wall));
    bounceOffWall(b, wall, material, rng);
    if (b.rolling && material === 'mesh') b.vz = 0;
  }

  // A ball that left the court keeps falling outside; stop it below ground.
  if (b.out && b.z < -1) b.dead = true;
  return events;
}
