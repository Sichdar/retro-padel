import { describe, expect, it } from 'vitest';
import { netHeight, wallMaterial } from '../src/game/court';
import { FixedStep } from '../src/game/fixedStep';
import { Ball, BallEvent, aimBall, makeBall, stepBall, BALL_RADIUS } from '../src/game/physics';
import { makeRng } from '../src/game/rng';
import { ShotKind, playShot } from '../src/game/shots';

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
  it('plain aiming ignores air drag, so the ball lands a little short', () => {
    const b = makeBall(4, 3, 1);
    aimBall(b, 15, 7, BALL_RADIUS, 1.0);
    const events = run(b, 2, 1, (e) => e.surface === 'floor');
    const land = events.find((e) => e.surface === 'floor')!;
    expect(land.x).toBeGreaterThan(13.2);
    expect(land.x).toBeLessThan(15);
    expect(land.y).toBeCloseTo(6.6, 0);
  });

  it('real shots allow for drag and spin and land where they were aimed', () => {
    const kinds: [ShotKind, number, number][] = [
      ['drive', 18, 0.8],
      ['volley', 12.5, 1.0],
      ['lob', 12.5, 0.9],
      ['smash', 13, 2.6],
      ['bandeja', 14.5, 2.4],
    ];
    for (const [kind, x, z] of kinds) {
      for (const aim of [-0.8, 0, 0.8]) {
        const b = makeBall(x, 5, z);
        const want = playShot(b, { kind, team: 0, aim, timing: 'perfect', risk: 0 }, makeRng(3));
        const land = run(b, 4, 1, (e) => e.surface !== 'netcord').find((e) => e.surface === 'floor')!;
        expect(Math.hypot(land.x - want.x, land.y - want.y)).toBeLessThan(0.3);
      }
    }
  });
});

describe('real padel numbers (S05)', () => {
  const launch = (kind: ShotKind, x: number, z: number) => {
    const b = makeBall(x, 5, z);
    playShot(b, { kind, team: 0, aim: 0, timing: 'perfect', risk: 0 }, makeRng(5));
    return b;
  };

  it('a lob peaks around 5-7 m', () => {
    const b = launch('lob', 12.5, 0.9);
    let top = 0;
    for (let i = 0; i < 240 && b.vz > -0.1; i++) {
      stepBall(b, makeRng(1));
      top = Math.max(top, b.z);
    }
    expect(top).toBeGreaterThan(5);
    expect(top).toBeLessThan(7);
  });

  it('a serve skims the net (well under a metre above it)', () => {
    const b = makeBall(18, 7.5, 0.8);
    playShot(b, { kind: 'serve', team: 0, aim: 0, timing: 'perfect', risk: 0 }, makeRng(5), { x0: 3.05, x1: 10, y0: 0, y1: 5 });
    let over = Infinity;
    const rng = makeRng(1);
    for (let i = 0; i < 120; i++) {
      const px = b.x;
      stepBall(b, rng);
      if (px > 10 && b.x <= 10) over = b.z - netHeight(b.y);
    }
    expect(over).toBeGreaterThan(0.1);
    expect(over).toBeLessThan(0.9);
  });

  it('a flat ball skids on after the bounce; a steep one keeps less of its speed', () => {
    const keep = (vx: number, vz: number) => {
      const b = makeBall(5, 5, 0.2, vx, 0, vz);
      run(b, 1, 1, (e) => e.surface === 'floor');
      return b.vx / vx;
    };
    const flat = keep(20, -3);
    const steep = keep(8, -9);
    expect(flat).toBeGreaterThan(steep);
    expect(steep).toBeCloseTo(0.6, 1); // grips and rolls: a hollow ball keeps 3/5
    expect(flat).toBeLessThan(0.9);
  });

  it('backspin floats in the air, topspin dips', () => {
    const landing = (spin: number) => {
      const b = makeBall(4, 5, 1, 15, 0, 3);
      b.spin = spin;
      return run(b, 2, 1, (e) => e.surface === 'floor').find((e) => e.surface === 'floor')!.x;
    };
    expect(landing(-5)).toBeGreaterThan(landing(0));
    expect(landing(0)).toBeGreaterThan(landing(5));
  });

  it('a sliced bandeja stays near the back glass instead of popping out', () => {
    const after = (slice: boolean) => {
      const b = makeBall(14.5, 5, 2.4);
      const plan = { kind: 'bandeja' as const, team: 0 as const, aim: 0, timing: 'perfect' as const, risk: 0 };
      playShot(b, slice ? plan : { ...plan, spin: 0 }, makeRng(5));
      const evs = run(b, 4, 1);
      const glass = evs.findIndex((e) => e.surface === 'glass');
      return evs.slice(glass + 1).find((e) => e.surface === 'floor')!.x;
    };
    expect(after(true)).toBeLessThan(3);
    expect(after(true)).toBeLessThan(after(false));
  });

  it('side walls have a lower glass step from 2 to 4 m', () => {
    expect(wallMaterial('side-far', 3, 1.5)).toBe('glass');
    expect(wallMaterial('side-near', 17, 1.5)).toBe('glass');
    expect(wallMaterial('side-far', 3, 2.5)).toBe('mesh');
    expect(wallMaterial('side-far', 3, 3.2)).toBe('open');
    expect(wallMaterial('side-far', 5, 1.5)).toBe('mesh');
  });
});
