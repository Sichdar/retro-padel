// The computer players' brain: predict where the ball goes, decide which
// player of a team takes it, where to stand, and which shot to play.
// No Phaser here.

import { Ball, BallEvent, stepBall, STEP } from './physics';
import { Player, REACH, REACH_TOP, depthX, fromNet, sideY, OVERHEAD_Z } from './players';
import { Rng, makeRng } from './rng';
import { halfOf } from './referee';
import { Team } from './scoring';
import { ShotKind, Timing } from './shots';

export interface Difficulty {
  /** Running speed (m/s). */
  speed: number;
  /** Seconds before reacting to a new shot. */
  reaction: number;
  /** Chance a hit is perfectly timed. */
  perfect: number;
  /** Chance of swinging and missing completely. */
  miss: number;
  /** How far the aim wanders from the open gap (0 = spot on, 1 = anywhere). */
  aimNoise: number;
  /** Chance of a lob when both opponents are at the net. */
  lobAtNet: number;
  /** Chance of a smash (rather than a safer bandeja) on a high ball near the net. */
  smash: number;
  /** Chance a human's badly timed shot goes wrong at this level. */
  humanRisk: number;
}

export const DIFFICULTY: Record<'easy' | 'normal' | 'hard', Difficulty> = {
  easy: { speed: 3.8, reaction: 0.32, perfect: 0.4, miss: 0.09, aimNoise: 0.9, lobAtNet: 0.15, smash: 0.3, humanRisk: 0.07 },
  normal: { speed: 4.4, reaction: 0.18, perfect: 0.6, miss: 0.035, aimNoise: 0.5, lobAtNet: 0.35, smash: 0.55, humanRisk: 0.12 },
  hard: { speed: 5.0, reaction: 0.09, perfect: 0.82, miss: 0.008, aimNoise: 0.25, lobAtNet: 0.55, smash: 0.75, humanRisk: 0.16 },
};

export interface PathPoint {
  t: number;
  x: number;
  y: number;
  z: number;
  /** Floor bounces so far on each half (since the prediction started). */
  bounces: [number, number];
}

/** Simulate a copy of the ball forward (up to `seconds`), stopping when it dies or leaves. */
export function predictPath(ball: Ball, seconds = 3.2): PathPoint[] {
  const b: Ball = { ...ball };
  const rng = makeRng(7);
  const out: PathPoint[] = [];
  const bounces: [number, number] = [0, 0];
  const steps = Math.round(seconds / STEP);
  for (let i = 1; i <= steps && !b.dead && !b.out; i++) {
    const evs: BallEvent[] = stepBall(b, rng);
    for (const e of evs) if (e.surface === 'floor') bounces[halfOf(e.x)]++;
    out.push({ t: i * STEP, x: b.x, y: b.y, z: b.z, bounces: [bounces[0], bounces[1]] });
    if (b.rolling) break;
  }
  return out;
}

export interface Intercept {
  t: number;
  x: number;
  y: number;
  z: number;
  /** Seconds the player has to spare when arriving there. */
  spare: number;
}

/**
 * The first point on the path where `p` can reach the ball at a good height
 * on their half, before it bounces twice there.
 * `needBounce` is true for the return of serve (it must bounce first).
 */
export function findIntercept(
  p: Player,
  path: PathPoint[],
  speed: number,
  reaction: number,
  needBounce: boolean,
): Intercept | null {
  let fallback: Intercept | null = null;
  for (const s of path) {
    if (halfOf(s.x) !== p.team) continue;
    const bounced = s.bounces[p.team];
    if (bounced >= 2) break;
    if (needBounce && bounced < 1) continue;
    if (s.z < 0.15 || s.z > REACH_TOP - 0.1) continue;
    if (fromNet(s.x) < 0.5) continue;
    const d = Math.max(0, Math.hypot(s.x - p.x, s.y - p.y) - REACH * 0.6);
    const need = d / speed + reaction;
    if (need > s.t) continue;
    const it = { t: s.t, x: s.x, y: s.y, z: s.z, spare: s.t - need };
    // Prefer a comfortable height: waist high, or high enough for an overhead.
    if ((s.z >= 0.35 && s.z <= 1.5) || s.z >= OVERHEAD_Z + 0.3) return it;
    fallback ??= it;
  }
  return fallback;
}

/** Where a player waits when the ball isn't theirs to play. */
export function homeSpot(p: Player, atNet: boolean): { x: number; y: number } {
  return { x: depthX(p.team, atNet ? 3.0 : 7.9), y: sideY(p.team, p.side, 2.2) };
}

export interface ShotChoice {
  kind: ShotKind;
  aim: number;
}

/** Pick a shot for a computer player about to hit the ball. */
export function chooseShot(
  p: Player,
  ball: Ball,
  opponents: Player[],
  rng: Rng,
  bounced: boolean,
  d: Difficulty = DIFFICULTY.normal,
): ShotChoice {
  const netDist = fromNet(p.x);
  // Aim at the bigger gap between the opponents and the side walls.
  const oy = opponents.map((o) => o.y).sort((a, b) => a - b);
  const gaps = [
    { aim: -0.75, size: oy[0] },
    { aim: 0, size: (oy[1] ?? oy[0]) - oy[0] },
    { aim: 0.75, size: 10 - (oy[1] ?? oy[0]) },
  ].sort((a, b) => b.size - a.size);
  let aim = gaps[0].aim + (rng() - 0.5) * d.aimNoise;
  aim = Math.max(-1, Math.min(1, aim));

  if (ball.z >= OVERHEAD_Z) {
    return { kind: netDist < 4.5 && rng() < d.smash ? 'smash' : 'bandeja', aim };
  }
  const bothAtNet = opponents.every((o) => fromNet(o.x) < 4.5);
  if (bothAtNet && rng() < d.lobAtNet) return { kind: 'lob', aim: (rng() - 0.5) * 1.2 };
  if (!bounced && netDist < 4.5) return { kind: 'volley', aim };
  if (rng() < 0.07) return { kind: 'lob', aim: (rng() - 0.5) * 1.2 };
  return { kind: 'drive', aim };
}

export function rollTiming(d: Difficulty, rng: Rng): Timing {
  const r = rng();
  if (r < d.perfect) return 'perfect';
  return r < d.perfect + (1 - d.perfect) / 2 ? 'early' : 'late';
}

/** True when the ball is on `team`'s half and coming to them (or already there). */
export function ballComing(ball: Ball, team: Team): boolean {
  if (halfOf(ball.x) === team) return true;
  return team === 0 ? ball.vx > 0 : ball.vx < 0;
}
