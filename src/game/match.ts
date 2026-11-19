// One match of padel, 2 vs 2: serve, rally, referee, score and the computer
// players, stepped at a fixed 60 steps per second. No Phaser here, so a whole
// match can be played in a test. Scenes only draw what this reports.

import { SERVICE_FROM_NET } from './court';
import {
  DIFFICULTY,
  Difficulty,
  Intercept,
  PathPoint,
  ballComing,
  chooseShot,
  findIntercept,
  homeSpot,
  predictPath,
  rollTiming,
} from './ai';
import { Ball, BallEvent, STEP, makeBall, speedOf, stepBall } from './physics';
import {
  HUMAN_SPEED,
  OVERHEAD_Z,
  Player,
  alongPath,
  depthX,
  fromNet,

  inReach,
  makePlayer,
  movePlayer,
  moveToward,
  onForehand,
  REACH,
  sideY,
} from './players';
import { Box, PointReason, Referee, halfOf, serviceBox } from './referee';
import { Rng, makeRng } from './rng';
import { MatchRules, PointResult, QUICK_MATCH, Score, Team } from './scoring';
import { ShotKind, Timing, playShot } from './shots';

export interface HumanInput {
  /** Joystick across the screen: -1 left .. 1 right. */
  mx: number;
  /** Joystick up and down the screen: -1 up .. 1 down. */
  my: number;
  /** True while the joystick is being used. */
  active: boolean;
  /** HIT was pressed since the last step. */
  hit: boolean;
  /** LOB was pressed since the last step. */
  lob: boolean;
}

export const NO_INPUT: HumanInput = { mx: 0, my: 0, active: false, hit: false, lob: false };

export type FaultWhy = 'box' | 'net' | 'wall' | 'mesh' | 'out';

export type MatchEvent =
  | { type: 'ball'; e: BallEvent }
  | { type: 'hit'; player: number; kind: ShotKind; timing: Timing; speed: number }
  | { type: 'swing'; player: number }
  | { type: 'serve-ready'; server: number }
  | { type: 'fault'; second: boolean; why: FaultWhy }
  | { type: 'let' }
  | { type: 'point'; winner: Team; reason: PointReason; result: PointResult; rally: number }
  | { type: 'match-over'; winner: Team };

export type Phase = 'serve-wait' | 'toss' | 'rally' | 'point-over' | 'match-over';

export interface TeamStats {
  winners: number;
  errors: number;
  aces: number;
  doubleFaults: number;
  smashes: number;
}

export interface MatchOptions {
  rules?: MatchRules;
  difficulty?: Difficulty;
  seed?: number;
  /** The computer plays player 0 too (tests and demos). */
  allCpu?: boolean;
  /** Player 0 drifts towards the ball when the joystick is left alone. */
  assist?: boolean;
}

/** The player you control. */
export const HUMAN = 0;

/** Swing timing window for the player you control (seconds after pressing). */
const SWING_FROM = 0.05;
const SWING_TO = 0.42;
/** How far past the ideal contact point still counts as perfect (metres). */
const PERFECT_BAND = 0.55;
const SERVE_WAIT_CPU = 1.1;
const POINT_PAUSE = 1.8;
const REPLAY_PAUSE = 1.1;

const emptyStats = (): TeamStats => ({ winners: 0, errors: 0, aces: 0, doubleFaults: 0, smashes: 0 });

export class Match {
  ball: Ball = makeBall(0, 0, 0);
  readonly players: Player[];
  readonly score: Score;
  readonly ref = new Referee();
  readonly difficulty: Difficulty;
  readonly allCpu: boolean;
  assist: boolean;
  phase: Phase = 'serve-wait';
  phaseTime = 0;
  time = 0;
  /** Serve faults on this point (0 or 1). */
  faults = 0;
  stats: [TeamStats, TeamStats] = [emptyStats(), emptyStats()];
  longestRally = 0;
  pointsPlayed = 0;
  /** Service box of the current serve. */
  box: Box = serviceBox(1, 'right', SERVICE_FROM_NET);
  /** The point being replayed after a fault or let (true) or a new point (false). */
  private after: 'next-point' | 'serve-again' | 'end' = 'next-point';
  private rng: Rng;
  private path: PathPoint[] = [];
  private pathDirty = true;
  private plan: (Intercept | null)[] = [null, null, null, null];
  private chosen: [number | null, number | null] = [null, null];
  private reactAt: [number, number] = [0, 0];
  private atNet: [boolean, boolean] = [false, false];
  private willMiss = [false, false, false, false];
  private missed = [false, false, false, false];
  private timing: Timing[] = ['perfect', 'perfect', 'perfect', 'perfect'];
  private swingKind: 'hit' | 'lob' = 'hit';
  private swingUsed = true;
  private serveAim = 0;
  private tossBounced = false;
  private winner: Team | null = null;

  constructor(opts: MatchOptions = {}) {
    this.rng = makeRng(opts.seed ?? Date.now());
    this.difficulty = opts.difficulty ?? DIFFICULTY.normal;
    this.allCpu = opts.allCpu ?? false;
    this.assist = opts.assist ?? true;
    this.score = new Score(opts.rules ?? QUICK_MATCH, 0);
    this.players = [0, 1, 2, 3].map((id) => makePlayer(id, id === HUMAN && !this.allCpu));
  }

  /** Call once before the first step: places everyone for the first serve. */
  start(): MatchEvent[] {
    return this.setupServe(true);
  }

  get server(): Player {
    return this.players[this.score.server];
  }

  get winnerTeam(): Team | null {
    return this.winner;
  }

  /** Is the human about to serve (waiting for HIT)? */
  get humanToServe(): boolean {
    return this.phase === 'serve-wait' && this.server.human;
  }

  /** Ball held in the server's hand before the toss. */
  get ballHeld(): boolean {
    return this.phase === 'serve-wait';
  }

  private isCpu(p: Player): boolean {
    return !p.human;
  }

  private speedOf(p: Player): number {
    return p.human ? HUMAN_SPEED : this.difficulty.speed;
  }

  step(input: HumanInput = NO_INPUT, dt = STEP): MatchEvent[] {
    const ev: MatchEvent[] = [];
    this.time += dt;
    this.phaseTime += dt;
    for (const p of this.players) {
      if (p.swing >= 0) p.swing = p.swing + dt > 0.45 ? -1 : p.swing + dt;
      p.cheer = Math.max(0, p.cheer - dt);
    }
    const human = this.players[HUMAN];
    if (human.human && (input.hit || input.lob) && this.phase === 'rally') {
      human.swing = 0;
      human.pose = 'forehand';
      this.swingKind = input.lob ? 'lob' : 'hit';
      this.swingUsed = false;
      ev.push({ type: 'swing', player: HUMAN });
    }

    switch (this.phase) {
      case 'serve-wait':
        this.stepServeWait(input, ev, dt);
        break;
      case 'toss':
        this.stepToss(ev, dt);
        break;
      case 'rally':
        this.stepRally(input, ev, dt);
        break;
      case 'point-over':
      case 'match-over':
        this.stepAfterPoint(ev, dt);
        break;
    }
    return ev;
  }

  // ---- Serve ---------------------------------------------------------------

  private setupServe(newPoint: boolean): MatchEvent[] {
    if (newPoint) this.faults = 0;
    const s = this.score;
    const server = this.server;
    const T = server.team;
    const R = (1 - T) as Team;
    const side = s.serveSide;
    const other = side === 'right' ? 'left' : 'right';
    const partner = this.players.find((p) => p.team === T && p !== server)!;
    const receiver = this.players.find((p) => p.team === R && p.side === side)!;
    const rPartner = this.players.find((p) => p.team === R && p !== receiver)!;
    const place = (p: Player, x: number, y: number) => {
      p.x = x;
      p.y = y;
      p.vx = p.vy = 0;
      p.swing = -1;
    };
    place(server, depthX(T, 7.5), sideY(T, side, 1.6));
    place(partner, depthX(T, 3.2), sideY(T, other, 2.3));
    place(receiver, depthX(R, 8.6), sideY(R, side, 2.4));
    place(rPartner, depthX(R, 6.2), sideY(R, other, 2.3));
    this.box = serviceBox(R, side, SERVICE_FROM_NET);
    this.atNet = [false, false];

    this.holdBall();
    this.phase = 'serve-wait';
    this.phaseTime = 0;
    this.tossBounced = false;
    this.chosen = [null, null];
    this.plan = [null, null, null, null];
    return [{ type: 'serve-ready', server: server.id }];
  }

  private holdBall(): void {
    const p = this.server;
    const hand = p.team === 0 ? 0.35 : -0.35;
    this.ball = makeBall(p.x - (p.team === 0 ? 0.2 : -0.2), p.y + hand, 1.0);
  }

  private stepServeWait(input: HumanInput, ev: MatchEvent[], dt: number): void {
    const server = this.server;
    // The receiving human may shuffle about while waiting; everyone else stands.
    const human = this.players[HUMAN];
    if (human.human && human !== server) this.moveHuman(human, input, dt, false);
    this.holdBall();
    const go = server.human ? input.hit || input.lob : this.phaseTime >= SERVE_WAIT_CPU;
    if (!go) return;
    this.serveAim = server.human
      ? Math.abs(input.mx) > 0.2
        ? Math.sign(input.mx) * Math.min(1, Math.abs(input.mx))
        : 0
      : (this.rng() * 2 - 1) * 0.8;
    // Underhand serve: drop the ball, let it bounce, hit it on the way up.
    this.phase = 'toss';
    this.phaseTime = 0;
    this.tossBounced = false;
    server.swing = -1;
    ev.push({ type: 'swing', player: server.id });
  }

  private stepToss(ev: MatchEvent[], dt: number): void {
    for (const e of stepBall(this.ball, this.rng, dt)) {
      ev.push({ type: 'ball', e });
      if (e.surface === 'floor') this.tossBounced = true;
    }
    if (!this.tossBounced || this.ball.vz > 0.4) return;
    const server = this.server;
    const timing: Timing = server.human ? 'perfect' : rollTiming(this.difficulty, this.rng);
    this.ref.startServe(server.team, this.box);
    playShot(this.ball, { kind: 'serve', team: server.team, aim: this.serveAim, timing }, this.rng, this.box);
    server.swing = 0;
    server.pose = 'forehand';
    this.afterHit(server, 'serve', timing, ev);
    this.phase = 'rally';
    this.phaseTime = 0;
  }

  // ---- Rally ---------------------------------------------------------------

  private stepRally(input: HumanInput, ev: MatchEvent[], dt: number): void {
    const evs = stepBall(this.ball, this.rng, dt);
    for (const e of evs) ev.push({ type: 'ball', e });
    if (evs.length) this.pathDirty = true;

    const call = this.ref.update(this.ball, evs);
    if (call) {
      this.onCall(call, ev);
      return;
    }
    if (this.phaseTime > 20) {
      // Safety net: a ball stuck somewhere odd. The side it's on loses.
      this.awardPoint((1 - halfOf(this.ball.x)) as Team, 'double-bounce', false, ev);
      return;
    }

    if (this.pathDirty) this.replan();

    // Movement.
    for (const p of this.players) {
      if (p.human) this.moveHuman(p, input, dt, true);
      else this.moveCpu(p, dt);
    }

    // Hits: the human first, then the computer players.
    const human = this.players[HUMAN];
    if (human.human) this.tryHumanHit(human, ev);
    if (this.phase !== 'rally') return;
    for (const p of this.players) {
      if (!this.isCpu(p)) continue;
      if (this.tryCpuHit(p, ev)) break;
    }
  }

  private moveHuman(p: Player, input: HumanInput, dt: number, inRally: boolean): void {
    if (input.active) {
      // Screen down is court +x (towards your end), screen right is court +y.
      movePlayer(p, input.my, input.mx, HUMAN_SPEED, dt);
      return;
    }
    if (!this.assist || !inRally) {
      movePlayer(p, 0, 0, HUMAN_SPEED, dt);
      return;
    }
    // Assisted movement: drift towards the ball when it's yours, else home.
    const it = this.plan[p.id];
    if (this.chosen[p.team] === p.id && it) {
      const t = this.standSpot(p, it);
      moveToward(p, t.x, t.y, HUMAN_SPEED * 0.8, dt);
    } else if (!ballComing(this.ball, p.team) || this.chosen[p.team] !== p.id) {
      const h = homeSpot(p, this.atNet[p.team]);
      moveToward(p, h.x, h.y, HUMAN_SPEED * 0.55, dt);
    } else {
      movePlayer(p, 0, 0, HUMAN_SPEED, dt);
    }
  }

  /** Where to stand to hit a ball at the intercept: a little behind it, ball on the forehand. */
  private standSpot(p: Player, it: Intercept): { x: number; y: number } {
    const back = p.team === 0 ? 0.3 : -0.3;
    const side = p.team === 0 ? -0.45 : 0.45;
    return { x: it.x + back, y: it.y + side };
  }

  private moveCpu(p: Player, dt: number): void {
    const speed = this.speedOf(p);
    const it = this.plan[p.id];
    if (this.chosen[p.team] === p.id && it && !this.missed[p.id]) {
      if (this.time < this.reactAt[p.team]) {
        movePlayer(p, 0, 0, speed, dt);
        return;
      }
      const t = this.standSpot(p, it);
      moveToward(p, t.x, t.y, speed, dt);
      return;
    }
    const h = homeSpot(p, this.atNet[p.team]);
    moveToward(p, h.x, h.y, speed * 0.75, dt);
  }

  /** Work out who goes for the ball and where, after anything changes its path. */
  private replan(): void {
    this.pathDirty = false;
    this.path = predictPath(this.ball);
    this.chosen = [null, null];
    this.plan = [null, null, null, null];
    for (const team of [0, 1] as Team[]) {
      if (this.ref.hitter === team) continue; // the ball isn't theirs to play
      if (!ballComing(this.ball, team)) continue;
      const mates = this.players.filter((p) => p.team === team);
      let best: Player | null = null;
      let bestScore = Infinity;
      for (const p of mates) {
        const reaction = p.human ? 0 : Math.max(0, this.reactAt[team] - this.time);
        const it = findIntercept(p, this.path, this.speedOf(p), reaction, this.ref.serving);
        this.plan[p.id] = it;
        if (!it) continue;
        // Prefer whoever gets there more easily, and the player whose side it is.
        const sideBias = Math.abs(it.y - sideY(team, p.side, 2.5)) > 3.5 ? 1.0 : 0;
        const s = Math.hypot(it.x - p.x, it.y - p.y) + sideBias - it.spare;
        if (s < bestScore) {
          bestScore = s;
          best = p;
        }
      }
      if (!best) {
        // Nobody can make it comfortably: the nearer player chases the landing spot anyway.
        const landing = this.path.find((s) => halfOf(s.x) === team && s.z < 1.2);
        if (landing) {
          best = mates.reduce((a, b) =>
            Math.hypot(a.x - landing.x, a.y - landing.y) <= Math.hypot(b.x - landing.x, b.y - landing.y) ? a : b,
          );
          this.plan[best.id] = { t: landing.t, x: landing.x, y: landing.y, z: landing.z, spare: 0 };
        }
      }
      this.chosen[team] = best ? best.id : null;
    }
  }

  private tryHumanHit(p: Player, ev: MatchEvent[]): void {
    if (this.swingUsed || p.swing < SWING_FROM || p.swing > SWING_TO) return;
    const b = this.ball;
    if (!inReach(p, b) || !this.ref.canHit(p.team, b.x)) return;
    const along = alongPath(p, b);
    const timing: Timing = along < -PERFECT_BAND ? 'early' : along > PERFECT_BAND ? 'late' : 'perfect';
    let kind: ShotKind;
    if (this.swingKind === 'lob') kind = 'lob';
    else if (b.z >= OVERHEAD_Z) kind = fromNet(p.x) < 4.5 ? 'smash' : 'bandeja';
    else if (this.ref.bouncesOver === 0 && fromNet(p.x) < 5) kind = 'volley';
    else kind = 'drive';
    // Joystick sideways aims the shot; left alone, it goes cross-court.
    const aim = this.humanAim(p);
    this.hit(p, kind, aim, timing, ev);
  }

  /** Last joystick position, kept by the scene through setAim(). */
  private aimInput = 0;
  setAim(mx: number): void {
    this.aimInput = mx;
  }

  private humanAim(p: Player): number {
    if (Math.abs(this.aimInput) > 0.25) return Math.max(-1, Math.min(1, this.aimInput));
    return p.y > 5 ? -0.55 : 0.55;
  }

  private tryCpuHit(p: Player, ev: MatchEvent[]): boolean {
    const b = this.ball;
    if (this.missed[p.id] || !this.ref.canHit(p.team, b.x) || !inReach(p, b)) return false;
    const chosen = this.chosen[p.team] === p.id;
    // Would the ball be out of reach after the next step?
    const nx = b.x + b.vx * STEP * 2;
    const ny = b.y + b.vy * STEP * 2;
    const leaving = Math.hypot(nx - p.x, ny - p.y) > REACH || b.z + b.vz * STEP * 2 < 0.1;
    if (!chosen && !leaving) return false;
    const along = alongPath(p, b);
    if (along < -0.35 && !leaving && speedOf(b) > 2) return false;
    if (this.willMiss[p.id]) {
      this.missed[p.id] = true;
      p.swing = 0;
      p.pose = onForehand(p, b) ? 'forehand' : 'backhand';
      ev.push({ type: 'swing', player: p.id });
      return false;
    }
    const opponents = this.players.filter((o) => o.team !== p.team);
    const shot = chooseShot(p, b, opponents, this.rng, this.ref.bouncesOver > 0);
    this.hit(p, shot.kind, shot.aim, this.timing[p.id], ev);
    return true;
  }

  private hit(p: Player, kind: ShotKind, aim: number, timing: Timing, ev: MatchEvent[]): void {
    const b = this.ball;
    p.pose = b.z >= OVERHEAD_Z ? 'overhead' : onForehand(p, b) ? 'forehand' : 'backhand';
    p.swing = Math.max(p.swing, 0.12);
    if (p.human) this.swingUsed = true;
    this.ref.onHit(p.team);
    // You make fewer unforced errors than the computer, so beginners keep rallies going.
    const risk = p.human ? (timing === 'perfect' ? 0 : 0.12) : undefined;
    playShot(b, { kind, team: p.team, aim, timing, risk }, this.rng);
    this.afterHit(p, kind, timing, ev);
  }

  private afterHit(p: Player, kind: ShotKind, timing: Timing, ev: MatchEvent[]): void {
    const team = p.team;
    const other = (1 - team) as Team;
    ev.push({ type: 'hit', player: p.id, kind, timing, speed: speedOf(this.ball) });
    if (kind === 'smash') this.stats[team].smashes++;
    this.pathDirty = true;
    this.reactAt[other] = this.time + this.difficulty.reaction;
    for (const q of this.players) {
      if (q.team !== other) continue;
      this.missed[q.id] = false;
      this.willMiss[q.id] = !q.human && kind !== 'serve' && this.rng() < this.difficulty.miss;
      this.timing[q.id] = rollTiming(this.difficulty, this.rng);
    }
    // Team positions: go to the net after a lob or when already close to it;
    // a lob from the other side sends them back.
    if (kind === 'lob') {
      this.atNet[team] = true;
      this.atNet[other] = false;
    } else if (kind !== 'serve') {
      this.atNet[team] = fromNet(p.x) < 4.5 || kind === 'smash' || kind === 'volley' || (kind === 'drive' && this.rng() < 0.15);
    } else {
      this.atNet[team] = true; // serve and volley
    }
  }

  // ---- Calls and points ----------------------------------------------------

  private onCall(call: NonNullable<ReturnType<Referee['update']>>, ev: MatchEvent[]): void {
    if (call.kind === 'let') {
      ev.push({ type: 'let' });
      this.endRally('serve-again', REPLAY_PAUSE);
      return;
    }
    if (call.kind === 'fault') {
      if (this.faults >= 1) {
        const serverTeam = this.server.team;
        this.stats[serverTeam].doubleFaults++;
        this.awardPoint((1 - serverTeam) as Team, 'double-fault', false, ev);
        return;
      }
      this.faults++;
      ev.push({ type: 'fault', second: false, why: call.why });
      this.endRally('serve-again', REPLAY_PAUSE);
      return;
    }
    this.awardPoint(call.winner, call.reason, call.byHitter, ev);
  }

  private awardPoint(winner: Team, reason: PointReason, byHitter: boolean, ev: MatchEvent[]): void {
    const loser = (1 - winner) as Team;
    if (reason !== 'double-fault') {
      if (byHitter) {
        this.stats[winner].winners++;
        if (this.ref.shots === 1) this.stats[winner].aces++;
      } else this.stats[loser].errors++;
    }
    const rally = this.ref.shots;
    this.longestRally = Math.max(this.longestRally, rally);
    this.pointsPlayed++;
    const result = this.score.pointWon(winner);
    for (const p of this.players) if (p.team === winner) p.cheer = 1.4;
    ev.push({ type: 'point', winner, reason, result, rally });
    if (result.match !== undefined) {
      this.winner = result.match;
      this.endRally('end', POINT_PAUSE);
    } else this.endRally('next-point', POINT_PAUSE);
  }

  private endRally(after: Match['after'], pause: number): void {
    this.after = after;
    this.phase = 'point-over';
    this.phaseTime = -pause; // counts up to 0
    this.chosen = [null, null];
  }

  private stepAfterPoint(ev: MatchEvent[], dt: number): void {
    if (!this.ball.dead && !this.ball.out) {
      for (const e of stepBall(this.ball, this.rng, dt)) ev.push({ type: 'ball', e });
    }
    for (const p of this.players) {
      if (p.cheer > 0) movePlayer(p, 0, 0, 4, dt);
      else {
        const h = homeSpot(p, false);
        moveToward(p, h.x, h.y, 2.2, dt);
      }
    }
    if (this.phase === 'match-over' || this.phaseTime < 0) return;
    if (this.after === 'end') {
      this.phase = 'match-over';
      ev.push({ type: 'match-over', winner: this.winner! });
      return;
    }
    ev.push(...this.setupServe(this.after === 'next-point'));
  }
}



