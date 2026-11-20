// Ball physics for the padel court. No Phaser here: plain maths, run at a
// fixed 60 steps per second so it behaves the same on every phone.
//
// Surfaces:
// - floor: bounce with friction; steep balls sit up, flat ones skid on,
//   and spin (slice or topspin) changes how fast the ball comes off
// - glass: clean, predictable bounce
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
/**
 * Air drag: slows fast balls more than slow ones (per metre of flight).
 * A real padel ball is about 0.02; a touch less keeps rallies lively.
 */
export const DRAG = 0.018;
/**
 * Spin pushing the ball up or down in the air (Magnus effect): backspin
 * floats, topspin dips. Real-ball value for a 6.5 cm, 57 g ball.
 */
export const MAGNUS = 0.035;

export const FLOOR_BOUNCE = 0.72; // share of vertical speed kept after a floor bounce
/**
 * Grip of the sand-filled turf. The ball skids while its bottom slides on the
 * floor; friction slows it until it rolls. Flat, fast balls slide right
 * through the bounce and keep more speed; steep ones grip and keep about 60%.
 */
export const FLOOR_FRICTION = 0.45;
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
  /**
   * Spin, as the speed of the ball's surface (m/s): positive = topspin
   * (turning the way it travels), negative = backspin (slice).
   */
  spin: number;
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
  return { x, y, z, vx, vy, vz, spin: 0, rolling: false, out: false, dead: false };
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
  b.spin = 0;
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

/**
 * Floor bounce with friction. The bottom of the ball slides at
 * (ground speed - spin); friction works against that slide until the ball
 * rolls, slowing it and turning it into topspin. For a hollow ball, rolling
 * starts once friction has taken 1/2.5 of the slide.
 */
function bounceOffFloor(b: Ball): void {
  const vzIn = Math.abs(b.vz);
  b.vz = vzIn * FLOOR_BOUNCE;
  const hs = Math.hypot(b.vx, b.vy);
  if (hs < 1e-6) {
    b.spin = 0;
    return;
  }
  const slip = hs - b.spin;
  const most = FLOOR_FRICTION * (1 + FLOOR_BOUNCE) * vzIn;
  const j = Math.sign(slip) * Math.min(most, Math.abs(slip) / 2.5);
  const after = Math.max(0, hs - j);
  b.spin += 1.5 * j;
  b.vx *= after / hs;
  b.vy *= after / hs;
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
  // The wall scrubs off most of the spin.
  b.spin *= 0.4;
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
    b.spin = slow;
    b.vz = 0;
    b.z = BALL_RADIUS;
  } else {
    b.vz -= GRAVITY * dt;
    if (b.spin !== 0 && sp > 1) {
      // Magnus: topspin pushes down, backspin lifts; grows with speed, levels off with spin.
      const hs = Math.hypot(b.vx, b.vy);
      const lift = (MAGNUS * sp * sp * b.spin) / (2 * Math.abs(b.spin) + sp);
      b.vz -= lift * dt * (hs / sp);
    }
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
      bounceOffFloor(b);
      if (b.vz < ROLL_BELOW) {
        b.vz = 0;
        b.rolling = true;
        b.spin = Math.hypot(b.vx, b.vy);
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
        b.spin = 0;
      } else {
        // Clips the top of the net (net cord): pops up, may go over or fall back.
        events.push(ev('netcord', null));
        b.vz = Math.abs(b.vz) * 0.35 + 0.8 + rng() * 0.8;
        b.vx *= -0.25 + rng() * 0.75;
        b.vy *= 0.5;
        b.spin = 0;
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
