// The referee: watches the ball after each shot and decides when a point is
// over and who won it, using padel's rules. No Phaser here, so it is tested.
//
// Team 0 plays the near half (x > 10 m), team 1 the far half (x < 10 m).
//
// After a shot the ball must cross the net and bounce once on the other side
// before it touches any wall. After that bounce it may hit the walls and still
// be played. Players may play the ball against their own walls.

import { NET_X } from './court';
import { Ball, BallEvent } from './physics';
import { Team } from './scoring';

export type PointReason =
  | 'double-bounce' // the other team didn't return a good shot
  | 'out-after-bounce' // a good shot bounced and then left the court
  | 'came-back' // a good shot bounced and came back over the net
  | 'net' // the shot didn't cross the net
  | 'wall' // the shot hit the other side's wall or mesh before bouncing
  | 'out' // the shot left the court without bouncing
  | 'body' // the ball touched a player of the other team
  | 'double-fault';

export type RallyCall =
  | { kind: 'point'; winner: Team; reason: PointReason; /** true when the hitter's shot won it */ byHitter: boolean }
  | { kind: 'fault'; why: 'box' | 'net' | 'wall' | 'mesh' | 'out' }
  | { kind: 'let' };

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Which team's half a court length position belongs to. */
export function halfOf(x: number): Team {
  return x > NET_X ? 0 : 1;
}

/** Which team's half a wall stands in (at length position x for side walls). */
function wallHalf(e: BallEvent): Team {
  if (e.wall === 'back-left') return 1;
  if (e.wall === 'back-right') return 0;
  return halfOf(e.x);
}

/** The service box a team serves into, on the given side of the receiver. */
export function serviceBox(receivingTeam: Team, receiverSide: 'right' | 'left', serviceFromNet: number): Box {
  // Team 0 faces up the screen, so its right is y > 5; team 1 faces down, so its right is y < 5.
  const highY = (receivingTeam === 0) === (receiverSide === 'right');
  const x0 = receivingTeam === 0 ? NET_X : NET_X - serviceFromNet;
  const x1 = receivingTeam === 0 ? NET_X + serviceFromNet : NET_X;
  return { x0, x1, y0: highY ? 5 : 0, y1: highY ? 10 : 5 };
}

const LINE = 0.05; // the ball touching the line counts as in

export class Referee {
  /** Team that hit the ball last. */
  hitter: Team = 0;
  /** True from the serve until the receiver hits it back. */
  serving = false;
  /** Floor bounces on the other side since the last shot. */
  bouncesOver = 0;
  private touchedNet = false;
  private box: Box | null = null;
  /** Hits in this rally (serve included). */
  shots = 0;

  startServe(serverTeam: Team, box: Box): void {
    this.hitter = serverTeam;
    this.serving = true;
    this.bouncesOver = 0;
    this.touchedNet = false;
    this.box = box;
    this.shots = 1;
  }

  /** May a player of `team` hit the ball now (ball at length x)? */
  canHit(team: Team, ballX: number): boolean {
    if (team === this.hitter) return false; // one touch per team
    if (halfOf(ballX) !== team) return false;
    if (this.serving && this.bouncesOver < 1) return false; // the return of serve must bounce first
    return true;
  }

  onHit(team: Team): void {
    this.hitter = team;
    this.serving = false;
    this.bouncesOver = 0;
    this.touchedNet = false;
    this.shots++;
  }

  private lose(reason: PointReason): RallyCall {
    return { kind: 'point', winner: (1 - this.hitter) as Team, reason, byHitter: false };
  }

  private win(reason: PointReason): RallyCall {
    return { kind: 'point', winner: this.hitter, reason, byHitter: true };
  }

  /** Look at what the ball did this step; returns a call when the point (or serve) is decided. */
  update(ball: Ball, events: BallEvent[]): RallyCall | null {
    for (const e of events) {
      const call = this.onEvent(e);
      if (call) return call;
    }
    // A ball that rolls or stops counts as its second bounce.
    if (ball.rolling || ball.dead) {
      if (ball.out) return null;
      const side = halfOf(ball.x);
      if (side !== this.hitter || this.bouncesOver >= 1) return this.win('double-bounce');
      return this.serving ? { kind: 'fault', why: 'net' } : this.lose('net');
    }
    return null;
  }

  private onEvent(e: BallEvent): RallyCall | null {
    const over = this.bouncesOver >= 1;
    switch (e.surface) {
      case 'net':
      case 'netcord':
        this.touchedNet = true;
        return null;
      case 'floor': {
        const side = halfOf(e.x);
        if (side === this.hitter) {
          if (over) return this.win('came-back');
          return this.serving ? { kind: 'fault', why: 'net' } : this.lose('net');
        }
        this.bouncesOver++;
        if (this.bouncesOver >= 2) return this.win('double-bounce');
        if (this.serving && this.box) {
          const b = this.box;
          const inBox = e.x >= b.x0 - LINE && e.x <= b.x1 + LINE && e.y >= b.y0 - LINE && e.y <= b.y1 + LINE;
          if (!inBox) return { kind: 'fault', why: 'box' };
          if (this.touchedNet) return { kind: 'let' };
        }
        return null;
      }
      case 'glass':
      case 'mesh': {
        if (over) {
          // After a good bounce the walls are in play, except the mesh on a serve.
          if (this.serving && e.surface === 'mesh') return { kind: 'fault', why: 'mesh' };
          return null;
        }
        if (wallHalf(e) === this.hitter) {
          // Playing off your own wall is allowed in a rally, not on a serve.
          return this.serving ? { kind: 'fault', why: 'wall' } : null;
        }
        return this.serving ? { kind: 'fault', why: 'wall' } : this.lose('wall');
      }
      case 'out':
        if (over) return this.win('out-after-bounce');
        return this.serving ? { kind: 'fault', why: 'out' } : this.lose('out');
    }
  }
}
