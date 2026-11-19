import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, project, pxPerMetre } from '../src/game/projection';

describe('court projection', () => {
  it('puts the far edge above the near edge', () => {
    expect(project(DEFAULT_VIEW, 10, 0).y).toBeLessThan(project(DEFAULT_VIEW, 10, 10).y);
  });

  it('draws nearer things bigger', () => {
    expect(pxPerMetre(DEFAULT_VIEW, 10)).toBeGreaterThan(pxPerMetre(DEFAULT_VIEW, 0));
  });

  it('raises the ball on screen as it goes up, without moving sideways', () => {
    const ground = project(DEFAULT_VIEW, 5, 5, 0);
    const air = project(DEFAULT_VIEW, 5, 5, 2);
    expect(air.x).toBe(ground.x);
    expect(air.y).toBeLessThan(ground.y);
  });

  it('keeps the whole court inside the 384x216 screen', () => {
    for (const [x, y] of [[0, 0], [20, 0], [0, 10], [20, 10]]) {
      const p = project(DEFAULT_VIEW, x, y, 0);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(384);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(216);
    }
  });

  it('keeps both halves of the court the same size (fair for both teams)', () => {
    const w = (x0: number, x1: number, y: number) => project(DEFAULT_VIEW, x1, y).x - project(DEFAULT_VIEW, x0, y).x;
    for (const y of [0, 5, 10]) expect(w(0, 10, y)).toBeCloseTo(w(10, 20, y));
  });
});
