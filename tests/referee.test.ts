import { describe, expect, it } from 'vitest';
import { SERVICE_FROM_NET } from '../src/game/court';
import { Ball, aimBall, makeBall, stepBall } from '../src/game/physics';
import { Referee, RallyCall, serviceBox } from '../src/game/referee';
import { makeRng } from '../src/game/rng';
import { Team } from '../src/game/scoring';

/** Fly the ball until the referee makes a call (or 6 seconds pass). */
function watch(ref: Referee, b: Ball, seed = 3): RallyCall | null {
  const rng = makeRng(seed);
  for (let i = 0; i < 360; i++) {
    const call = ref.update(b, stepBall(b, rng));
    if (call) return call;
  }
  return null;
}

/** A shot by `team` from (x, y, z) to land at (tx, ty) in `time` seconds. */
function shot(ref: Referee, team: Team, from: [number, number, number], tx: number, ty: number, time: number): Ball {
  const b = makeBall(...from);
  aimBall(b, tx, ty, 0.03, time);
  ref.onHit(team);
  return b;
}

describe('serve', () => {
  // Team 0 (near end) serves from the right side to team 1's right box: x 3.05..10, y 0..5.
  const box = serviceBox(1, 'right', SERVICE_FROM_NET);

  const serve = (tx: number, ty: number, time = 1.0, from: [number, number, number] = [17.5, 7.5, 0.6]) => {
    const ref = new Referee();
    ref.startServe(0, box);
    const b = makeBall(...from);
    aimBall(b, tx, ty, 0.03, time);
    return { ref, b };
  };

  it('the box is diagonal: near-right server serves into far-left box', () => {
    expect(box).toEqual({ x0: 10 - SERVICE_FROM_NET, x1: 10, y0: 0, y1: 5 });
    expect(serviceBox(0, 'right', SERVICE_FROM_NET)).toEqual({ x0: 10, x1: 10 + SERVICE_FROM_NET, y0: 5, y1: 10 });
  });

  it('a serve into the box, not returned, wins the point (ace)', () => {
    const { ref, b } = serve(5, 2.5);
    const call = watch(ref, b);
    expect(call).toMatchObject({ kind: 'point', winner: 0, byHitter: true });
  });

  it('a serve landing outside the box is a fault', () => {
    expect(watch(...Object.values(serve(5, 7.5)) as [Referee, Ball])).toEqual({ kind: 'fault', why: 'box' });
    expect(watch(...Object.values(serve(-0.5, 2.5)) as [Referee, Ball])).toMatchObject({ kind: 'fault' });
  });

  it('a serve into the net is a fault', () => {
    const { ref, b } = serve(10, 2.5, 0.6);
    b.vz = -1;
    expect(watch(ref, b)).toMatchObject({ kind: 'fault' });
  });

  it('a serve that clips the net and lands in the box is a let', () => {
    const ref = new Referee();
    ref.startServe(0, box);
    const b = makeBall(17.5, 7.5, 0.6);
    // Aim so it brushes the top of the net, then check whatever happens is a let or a fault, never a point.
    aimBall(b, 10, 5.5, 0.93, 0.7);
    const call = watch(ref, b);
    expect(call?.kind === 'let' || call?.kind === 'fault').toBe(true);
    // A direct check of the let rule: net touched, then a bounce in the box.
    const r2 = new Referee();
    r2.startServe(0, box);
    const ball = makeBall(9, 2, 0.5);
    expect(r2.update(ball, [{ surface: 'netcord', wall: null, x: 10, y: 2, z: 0.9, speed: 5 }])).toBeNull();
    expect(r2.update(ball, [{ surface: 'floor', wall: null, x: 8, y: 2, z: 0.03, speed: 5 }])).toEqual({ kind: 'let' });
  });

  it('a serve that bounces in and then hits the mesh is a fault; glass is fine', () => {
    const r = new Referee();
    r.startServe(0, box);
    const b = makeBall(5, 2, 0.5);
    expect(r.update(b, [{ surface: 'floor', wall: null, x: 6, y: 2, z: 0.03, speed: 9 }])).toBeNull();
    expect(r.update(b, [{ surface: 'glass', wall: 'back-left', x: 0, y: 2, z: 1, speed: 7 }])).toBeNull();
    expect(r.update(b, [{ surface: 'mesh', wall: 'side-far', x: 4, y: 0, z: 1, speed: 6 }])).toEqual({ kind: 'fault', why: 'mesh' });
  });

  it('the return of serve must bounce first', () => {
    const r = new Referee();
    r.startServe(0, box);
    expect(r.canHit(1, 6)).toBe(false);
    r.update(makeBall(6, 2, 0.1), [{ surface: 'floor', wall: null, x: 6, y: 2, z: 0.03, speed: 9 }]);
    expect(r.canHit(1, 5)).toBe(true);
    expect(r.canHit(0, 5)).toBe(false);
  });
});

describe('rally', () => {
  it('a shot that bounces and hits the glass is still in play', () => {
    const ref = new Referee();
    // Deep and fast enough to reach the glass after one bounce (air drag included).
    const b = shot(ref, 0, [16, 5, 1], 2.5, 5, 1.0);
    const rng = makeRng(1);
    let sawGlass = false;
    for (let i = 0; i < 120; i++) {
      const evs = stepBall(b, rng);
      const call = ref.update(b, evs);
      if (evs.some((e) => e.surface === 'glass')) {
        sawGlass = true;
        expect(call).toBeNull();
        break;
      }
      expect(call).toBeNull();
    }
    expect(sawGlass).toBe(true);
  });

  it('two bounces on the other side: the hitter wins', () => {
    const ref = new Referee();
    const b = shot(ref, 1, [4, 5, 1], 13, 5, 1.2);

    expect(watch(ref, b)).toMatchObject({ kind: 'point', winner: 1, byHitter: true });
  });

  it('a shot that hits the other side’s wall before bouncing loses the point', () => {
    const ref = new Referee();
    const b = shot(ref, 0, [16, 5, 1], -5, 5, 1.0); // aimed past the far back wall
    expect(watch(ref, b)).toEqual({ kind: 'point', winner: 1, reason: 'wall', byHitter: false });
  });

  it('a shot into the net loses the point', () => {
    const ref = new Referee();
    const b = shot(ref, 0, [13, 5, 0.5], 10, 5, 0.3);
    b.vz = 0;
    expect(watch(ref, b)).toMatchObject({ kind: 'point', winner: 1, reason: 'net' });
  });

  it('playing the ball off your own back wall is allowed', () => {
    const ref = new Referee();
    ref.onHit(1); // the far team hit last; now team 0 plays it against its own glass
    ref.onHit(0);
    const b = makeBall(18, 5, 1.2, 8, 0, 4); // towards the near back glass
    const rng = makeRng(2);
    let call: RallyCall | null = null;
    let wall = false;
    for (let i = 0; i < 30 && !wall; i++) {
      const evs = stepBall(b, rng);
      call = ref.update(b, evs);
      wall = evs.some((e) => e.surface === 'glass');
    }
    expect(wall).toBe(true);
    expect(call).toBeNull();
  });

  it('a good shot that bounces and flies out over the wall wins the point', () => {
    const ref = new Referee();
    ref.onHit(0);
    const b = makeBall(2, 5, 0.1);
    expect(ref.update(b, [{ surface: 'floor', wall: null, x: 3, y: 5, z: 0.03, speed: 15 }])).toBeNull();
    expect(ref.update(b, [{ surface: 'out', wall: 'back-left', x: 0, y: 5, z: 4.2, speed: 10 }])).toMatchObject({
      kind: 'point',
      winner: 0,
      reason: 'out-after-bounce',
    });
  });

  it('one touch per team, and only on your own half', () => {
    const ref = new Referee();
    ref.onHit(0);
    expect(ref.canHit(0, 15)).toBe(false);
    expect(ref.canHit(1, 15)).toBe(false);
    expect(ref.canHit(1, 5)).toBe(true);
  });
});
