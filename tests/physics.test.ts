import { describe, expect, it } from 'vitest';
import { netHeight, wallMaterial } from '../src/game/court';
import { FixedStep } from '../src/game/fixedStep';
import { Ball, BallEvent, aimBall, makeBall, stepBall, BALL_RADIUS } from '../src/game/physics';
import { makeRng } from '../src/game/rng';

/** Run the ball for up to `seconds`, collecting every event. */
function run(b: Ball, seconds: number, seed = 1, stopAfter?: (e: BallEvent) => boolean): BallEvent[] {
  const rng = makeRng(seed);
  const all: BallEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const evs = stepBall(b, rng);
    all.push(...evs);
    if (stopAfter && evs.some(stopAfter)) break;
    if (b.dead) break;
  }
  return all;
}

describe('court layout', () => {
  it('back walls: glass up to 3 m, mesh up to 4 m, then open', () => {
    expect(wallMaterial('back-left', 5, 1)).toBe('glass');
    expect(wallMaterial('back-right', 5, 3.5)).toBe('mesh');
    expect(wallMaterial('back-left', 5, 4.2)).toBe('open');
  });

  it('side walls: glass for the first 2 m from each end, mesh in the middle', () => {
    expect(wallMaterial('side-far', 1, 1)).toBe('glass');
    expect(wallMaterial('side-near', 19, 1)).toBe('glass');
    expect(wallMaterial('side-far', 8, 1)).toBe('mesh');
    expect(wallMaterial('side-near', 8, 3.2)).toBe('open');
  });

  it('net is 0.88 m in the centre and 0.92 m at the posts', () => {
    expect(netHeight(5)).toBeCloseTo(0.88);
    expect(netHeight(0)).toBeCloseTo(0.92);
    expect(netHeight(10)).toBeCloseTo(0.92);
  });
});

describe('floor', () => {
  it('a dropped ball bounces lower each time, then rolls and stops', () => {
    const b = makeBall(14, 5, 2);
    const events = run(b, 10);
    const floors = events.filter((e) => e.surface === 'floor');
    expect(floors.length).toBeGreaterThan(2);
    for (let i = 1; i < floors.length; i++) expect(floors[i].speed).toBeLessThan(floors[i - 1].speed);
    expect(b.z).toBeCloseTo(BALL_RADIUS, 3);
    expect(b.dead || b.rolling).toBe(true);
  });

  it('never sinks below the floor', () => {
    const b = makeBall(5, 5, 1, 12, 3, -20);
    const rng = makeRng(3);
    for (let i = 0; i < 600; i++) {
      stepBall(b, rng);
      if (!b.out) expect(b.z).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-9);
    }
  });
});

describe('glass', () => {
  it('bounces cleanly off the back glass and comes back', () => {
    const b = makeBall(6, 5, 1.2, -18, 0, 2);
    const events = run(b, 1, 1, (e) => e.surface === 'glass');
    const hit = events.find((e) => e.surface === 'glass')!;
    expect(hit.wall).toBe('back-left');
    expect(hit.z).toBeLessThan(3);
    expect(b.vx).toBeGreaterThan(0); // now heading back into the court
    expect(Math.abs(b.vx)).toBeGreaterThan(18 * 0.55); // strong, predictable bounce
  });

  it('is the same every time (no randomness)', () => {
    const a = makeBall(6, 5, 1.2, -18, 2, 2);
    const c = makeBall(6, 5, 1.2, -18, 2, 2);
    run(a, 0.6, 1);
    run(c, 0.6, 999);
    expect(a.x).toBeCloseTo(c.x, 9);
    expect(a.vz).toBeCloseTo(c.vz, 9);
  });

  it('side glass near the corners', () => {
    const b = makeBall(18.2, 5, 1.2, 2, 20, 1);
    const events = run(b, 1, 1, (e) => e.surface !== 'floor');
    const hit = events.find((e) => e.surface !== 'floor')!;
    expect(hit.surface).toBe('glass');
    expect(hit.wall).toBe('side-near');
    expect(b.vy).toBeLessThan(0);
  });
});

describe('mesh', () => {
  it('gives a weak bounce, weaker than glass', () => {
    const glass = makeBall(12, 5, 1.2, 0, -16, 1);
    glass.x = 1; // side glass zone
    const mesh = makeBall(9, 5, 1.2, 0, -16, 1);
    run(glass, 1, 1, (e) => e.surface === 'glass');
    const events = run(mesh, 1, 1, (e) => e.surface === 'mesh');
    expect(events.some((e) => e.surface === 'mesh' && e.wall === 'side-far')).toBe(true);
    expect(Math.abs(mesh.vy)).toBeLessThan(Math.abs(glass.vy));
    expect(Math.abs(mesh.vy)).toBeLessThan(16 * 0.5);
  });

  it('is a little random (different seeds, different bounces)', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) {
      const b = makeBall(9, 5, 1.2, 0, -16, 1);
      run(b, 1, seed, (e) => e.surface === 'mesh');
      results.add(b.vy.toFixed(4));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('back-wall mesh above the glass', () => {
    const b = makeBall(4, 5, 3.4, -20, 0, 1.5);
    const events = run(b, 1, 1, (e) => e.surface === 'mesh');
    expect(events.find((e) => e.surface === 'mesh')?.wall).toBe('back-left');
  });
});

describe('over the walls', () => {
  it('a high lob over the back wall leaves the court', () => {
    const b = makeBall(8, 5, 1);
    aimBall(b, -2, 5, 6, 1.2);
    const events = run(b, 3);
    const out = events.find((e) => e.surface === 'out');
    expect(out?.wall).toBe('back-left');
    expect(events.some((e) => e.surface === 'glass' || e.surface === 'mesh')).toBe(false);
  });
});

describe('net', () => {
  it('a low ball into the net stays on its own side', () => {
    const b = makeBall(5, 5, 0.4, 15, 0, 0.5);
    const events = run(b, 3);
    expect(events.some((e) => e.surface === 'net')).toBe(true);
    expect(b.x).toBeLessThan(10);
  });

  it('a ball well above the net passes without touching it', () => {
    const b = makeBall(5, 5, 1.6, 12, 0, 1);
    const events = run(b, 0.8);
    expect(events.some((e) => e.surface === 'net' || e.surface === 'netcord')).toBe(false);
    expect(b.x).toBeGreaterThan(10);
  });

  it('a ball clipping the top of the net pops up (net cord)', () => {
    let over = 0;
    let back = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const b = makeBall(7, 5, 0.9, 10, 0, 0);
      aimBall(b, 10, 5, 0.9, 0.3);
      const events = run(b, 4, seed);
      expect(events.some((e) => e.surface === 'netcord')).toBe(true);
      const firstFloor = events.find((e) => e.surface === 'floor');
      if (firstFloor && firstFloor.x > 10) over++;
      else back++;
    }
    // Sometimes it rolls over, sometimes it falls back.
    expect(over).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
  });
});

describe('fixed time step', () => {
  it('runs 60 steps per second whatever the frame rate', () => {
    for (const fps of [30, 60, 90, 120, 144]) {
      const fs = new FixedStep();
      let steps = 0;
      for (let i = 0; i < fps; i++) fs.advance(1 / fps, () => steps++);
      expect(Math.abs(steps - 60)).toBeLessThanOrEqual(1);
    }
  });

  it('drops the backlog after a long pause instead of racing', () => {
    const fs = new FixedStep();
    let steps = 0;
    fs.advance(5, () => steps++);
    expect(steps).toBeLessThanOrEqual(5);
  });
});

describe('aiming', () => {
  it('lands close to the target without walls in the way', () => {
    const b = makeBall(4, 3, 1);
    aimBall(b, 15, 7, BALL_RADIUS, 1.0);
    const events = run(b, 2, 1, (e) => e.surface === 'floor');
    const land = events.find((e) => e.surface === 'floor')!;
    expect(land.x).toBeGreaterThan(14);
    expect(land.x).toBeLessThan(15.3);
    expect(land.y).toBeCloseTo(7, 0);
  });
});
