// The four players: where they are, how they move, and whether the ball is
// within reach of their racket. No Phaser here.

import { COURT_LENGTH, COURT_WIDTH, NET_X } from './court';
import { Ball } from './physics';
import { Team, teamOf } from './scoring';

/** How far from the body the racket reaches (metres, along the ground). */
export const REACH = 1.1;
/** Highest ball a player can hit (an overhead with the arm stretched). */
export const REACH_TOP = 2.9;
export const REACH_BOTTOM = 0.08;
/** Running speed of the player you control (m/s). */
export const HUMAN_SPEED = 5.0;
/** Above this height a hit becomes an overhead (smash or bandeja). */
export const OVERHEAD_Z = 2.3;

export type CourtSide = 'right' | 'left';
export type SwingPose = 'forehand' | 'backhand' | 'overhead';

export interface Player {
  id: number;
  team: Team;
  /** The side of the court this player covers, seen from their own end. */
  side: CourtSide;
  human: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds since the swing started (-1 when not swinging). */
  swing: number;
  pose: SwingPose;
  /** Seconds left of the celebration after a won point. */
  cheer: number;
}

export function makePlayer(id: number, human: boolean): Player {
  const team = teamOf(id);
  // Players 0 and 2 cover their team's right side, 1 and 3 the left.
  const side: CourtSide = id % 2 === 0 ? 'right' : 'left';
  return { id, team, side, human, x: 0, y: 0, vx: 0, vy: 0, swing: -1, pose: 'forehand', cheer: 0 };
}

/** Court y of a team's right or left side (team 0 faces up the screen, team 1 down). */
export function sideY(team: Team, side: CourtSide, offset = 2.3): number {
  const highY = (team === 0) === (side === 'right');
  return highY ? COURT_WIDTH / 2 + offset : COURT_WIDTH / 2 - offset;
}

/** Court x at a given distance from the net, on a team's half. */
export function depthX(team: Team, fromNet: number): number {
  return team === 0 ? NET_X + fromNet : NET_X - fromNet;
}

/** Distance from the net of a court x. */
export function fromNet(x: number): number {
  return Math.abs(x - NET_X);
}

/** Keep a player on their own half and inside the walls. */
export function clampToHalf(p: Player): void {
  const minX = p.team === 0 ? NET_X + 0.6 : 0.3;
  const maxX = p.team === 0 ? COURT_LENGTH - 0.3 : NET_X - 0.6;
  p.x = Math.min(maxX, Math.max(minX, p.x));
  p.y = Math.min(COURT_WIDTH - 0.3, Math.max(0.3, p.y));
}

/**
 * Move a player for one step. (dx, dy) is the wanted direction in court
 * metres (length up to 1 = full speed); speed is in m/s.
 */
export function movePlayer(p: Player, dx: number, dy: number, speed: number, dt: number): void {
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  const k = Math.min(1, dt * 14); // quick to start and stop, but not instant
  p.vx += (dx * speed - p.vx) * k;
  p.vy += (dy * speed - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const bx = p.x;
  const by = p.y;
  clampToHalf(p);
  if (p.x !== bx) p.vx = 0;
  if (p.y !== by) p.vy = 0;
}

/** Move toward a point, slowing down on arrival. Returns true when there. */
export function moveToward(p: Player, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.08) {
    movePlayer(p, 0, 0, speed, dt);
    return true;
  }
  const want = Math.min(1, d / 0.6); // ease in over the last 60 cm
  movePlayer(p, (dx / d) * want, (dy / d) * want, speed, dt);
  return false;
}

/** Ground distance from a player to the ball. */
export function groundDistance(p: Player, b: Ball): number {
  return Math.hypot(b.x - p.x, b.y - p.y);
}

export function inReach(p: Player, b: Ball): boolean {
  return b.z >= REACH_BOTTOM && b.z <= REACH_TOP && groundDistance(p, b) <= REACH;
}

/**
 * Where the ball is along its own path relative to the player: negative while
 * it is still coming, around 0 when level with the player, positive once past.
 */
export function alongPath(p: Player, b: Ball): number {
  const hs = Math.hypot(b.vx, b.vy);
  if (hs < 0.5) return 0;
  return ((b.x - p.x) * b.vx + (b.y - p.y) * b.vy) / hs;
}

/** Is the ball on this player's forehand side? */
export function onForehand(p: Player, b: Ball): boolean {
  // Team 0 faces up the screen: right hand towards y = 10. Team 1 faces down.
  return p.team === 0 ? b.y >= p.y : b.y <= p.y;
}
