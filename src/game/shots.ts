// Turns "player hits a drive / lob / smash..." into a ball flight towards the
// other half. Timing changes how fast and how accurate the shot is.
// No Phaser here.

import { COURT_WIDTH, NET_X, netHeight } from './court';
import { Ball, BALL_RADIUS, GRAVITY, aimBall, stepBall } from './physics';
import { Rng } from './rng';
import { Team } from './scoring';
import { Box } from './referee';

export type ShotKind = 'serve' | 'drive' | 'volley' | 'lob' | 'smash' | 'bandeja';
export type Timing = 'early' | 'perfect' | 'late';

export interface ShotPlan {
  kind: ShotKind;
  /** Team hitting: the ball goes to the other half. */
  team: Team;
  /** -1..1: left to right on the screen (court y). */
  aim: number;
  timing: Timing;
  /** Chance (0..1) the shot goes wrong: into the net, long or wide. Defaults by timing. */
  risk?: number;
  /** Spin (m/s of ball surface, negative = slice). Defaults by shot kind. */
  spin?: number;
}

export type ShotError = 'net' | 'long' | 'wide' | null;

/** Default chance of a mistake: small when well timed, bigger when early or late. */
export function defaultRisk(kind: ShotKind, timing: Timing): number {
  if (kind === 'serve') return timing === 'perfect' ? 0.03 : 0.16;
  return timing === 'perfect' ? 0.03 : 0.22;
}

interface ShotShape {
  /** Target distance past the net (metres). */
  depth: number;
  /** Ground speed (m/s), or 0 to use a fixed flight time. */
  speed: number;
  /** Fixed flight time (s) for lobs. */
  time?: number;
  /** How far the ball must clear the net (metres). */
  clear: number;
  /** Spin put on the ball (m/s of surface speed): negative = slice. */
  spin?: number;
}

// Speeds and heights checked against real club padel (S05): serve skims the
// net, lobs peak around 6 m, bandeja and volleys are sliced so they stay low.
const SHAPES: Record<ShotKind, ShotShape> = {
  serve: { depth: 5.2, speed: 14, clear: 0.25 },
  drive: { depth: 7.0, speed: 14.5, clear: 0.3 },
  volley: { depth: 6.0, speed: 13.5, clear: 0.15, spin: -3 },
  lob: { depth: 8.3, speed: 0, time: 2.15, clear: 1.5 },
  smash: { depth: 6.5, speed: 21, clear: 0.2 },
  bandeja: { depth: 6.6, speed: 16, clear: 0.3, spin: -5 },
};

/** Where on the far half a shot from `team` lands, before timing errors. */
export function targetFor(plan: ShotPlan, box?: Box): { x: number; y: number } {
  const s = SHAPES[plan.kind];
  const dir = plan.team === 0 ? -1 : 1;
  if (plan.kind === 'serve' && box) {
    const cy = (box.y0 + box.y1) / 2;
    return { x: NET_X + dir * s.depth, y: cy + plan.aim * 1.5 };
  }
  return { x: NET_X + dir * s.depth, y: COURT_WIDTH / 2 + plan.aim * 3.6 };
}

/** Height of the ball when it reaches the net (Infinity if it never gets there). */
function heightAtNet(b: Ball): { z: number; y: number } {
  if ((b.x - NET_X) * b.vx >= 0) return { z: Infinity, y: b.y };
  const t = (NET_X - b.x) / b.vx;
  return { z: b.z + b.vz * t - 0.5 * GRAVITY * t * t, y: b.y + b.vy * t };
}

/**
 * Hit the ball. Changes its speed so it flies to the target picked from the
 * plan, with errors that grow with bad timing. Returns where it was aimed.
 */
export function playShot(b: Ball, plan: ShotPlan, rng: Rng, box?: Box): { x: number; y: number; error: ShotError } {
  const s = SHAPES[plan.kind];
  const target = targetFor(plan, box);
  const dir = plan.team === 0 ? -1 : 1;

  // A mistake: the ball goes into the net, too long or too wide.
  const risk = plan.risk ?? defaultRisk(plan.kind, plan.timing);
  if (rng() < risk) {
    const r = rng();
    const error: ShotError = r < 0.45 ? 'net' : r < 0.75 ? 'long' : 'wide';
    if (error === 'net') {
      const t = Math.max(0.25, Math.abs(NET_X - b.x) / 11);
      aimBall(b, NET_X - dir * 0.05, target.y, netHeight(target.y) * (0.35 + rng() * 0.4), t);
      return { x: NET_X, y: target.y, error };
    }
    const tx = error === 'long' ? NET_X + dir * (10.6 + rng()) : target.x;
    const ty = error === 'wide' ? (target.y < COURT_WIDTH / 2 ? -0.7 : COURT_WIDTH + 0.7) : target.y;
    const dist = Math.hypot(tx - b.x, ty - b.y);
    let time = s.time ?? dist / s.speed;
    for (let i = 0; i < 20; i++) {
      aimBall(b, tx, ty, BALL_RADIUS, time);
      const n = heightAtNet(b);
      if (n.z >= netHeight(n.y) + 0.3) break;
      time *= 1.07;
    }
    return { x: tx, y: ty, error };
  }
  const good = plan.timing === 'perfect';
  const spread = plan.kind === 'serve' ? (good ? 0.25 : 0.7) : good ? 0.45 : 1.3;
  const noise = () => (rng() * 2 - 1) * spread;
  // Late hits drift wide, early ones pull across.
  const drift = plan.timing === 'late' ? 0.6 : plan.timing === 'early' ? -0.6 : 0;
  let tx = target.x + noise() * dir * 0.8;
  let ty = target.y + noise() + drift * Math.sign(target.y - COURT_WIDTH / 2 || 1);
  // A mistimed lob falls short and lower: a ball the net players can smash.
  const shortLob = plan.kind === 'lob' && !good;
  if (shortLob) tx -= dir * (1.5 + rng() * 1.5);
  const speedK = good ? 1 : 0.86;

  const dist = Math.hypot(tx - b.x, ty - b.y);
  let time = s.time ?? dist / (s.speed * speedK);
  if (shortLob) time *= 0.78 + rng() * 0.12;
  else if (s.time && !good) time *= 0.9 + rng() * 0.25;
  const spin = (plan.spin ?? s.spin ?? 0) * (good ? 1 : 0.6);

  // Lift the arc until it clears the net (bad timing leaves less room).
  const clear = good ? s.clear : s.clear * 0.4;
  for (let i = 0; i < 20; i++) {
    aimBall(b, tx, ty, BALL_RADIUS, time);
    const n = heightAtNet(b);
    if (n.z >= netHeight(n.y) + clear) break;
    time *= 1.07;
  }
  // Air drag and spin bend the flight: fly a practice ball and move the aim
  // point until the real landing spot matches the target.
  const wantX = tx;
  const wantY = ty;
  let aimX = tx;
  let aimY = ty;
  b.spin = spin;
  for (let i = 0; i < 4; i++) {
    const land = firstLanding(b);
    if (!land) break;
    const ex = wantX - land.x;
    const ey = wantY - land.y;
    if (Math.abs(ex) < 0.05 && Math.abs(ey) < 0.05) break;
    aimX += ex;
    aimY += ey;
    aimBall(b, aimX, aimY, BALL_RADIUS, time);
    b.spin = spin;
  }
  return { x: wantX, y: wantY, error: null };
}

/** Steady stand-in for the random numbers while flying a practice ball. */
const steady: Rng = () => 0.5;

/** Where a copy of the ball first touches the floor (null if a wall or the net comes first). */
function firstLanding(ball: Ball): { x: number; y: number } | null {
  const b: Ball = { ...ball };
  for (let i = 0; i < 300; i++) {
    for (const e of stepBall(b, steady)) {
      if (e.surface === 'floor') return { x: e.x, y: e.y };
      return null;
    }
    if (b.dead || b.out) return null;
  }
  return null;
}
