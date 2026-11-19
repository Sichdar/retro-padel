import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, nearerThanNet, project, pxPerMetre, unprojectGround } from '../src/game/projection';
import { GAME_H, GAME_W } from '../src/config';

const FLIPPED = { ...DEFAULT_VIEW, flipped: true };

describe('court projection (upright phone)', () => {
  it('puts the far end at the top and the near end at the bottom', () => {
    expect(project(DEFAULT_VIEW, 0, 5).y).toBeLessThan(project(DEFAULT_VIEW, 20, 5).y);
  });

  it('runs across the court from left to right', () => {
    expect(project(DEFAULT_VIEW, 10, 0).x).toBeLessThan(project(DEFAULT_VIEW, 10, 10).x);
  });

  it('draws nearer things bigger', () => {
    expect(pxPerMetre(DEFAULT_VIEW, 20)).toBeGreaterThan(pxPerMetre(DEFAULT_VIEW, 0));
  });

  it('raises the ball straight up the screen on the centre line', () => {
    const ground = project(DEFAULT_VIEW, 5, 5, 0);
    const air = project(DEFAULT_VIEW, 5, 5, 2);
    expect(air.x).toBeCloseTo(ground.x);
    expect(air.y).toBeLessThan(ground.y);
  });

  it('leans the side walls outwards so they never cover the court', () => {
    const groundL = project(DEFAULT_VIEW, 10, 0, 0);
    const topL = project(DEFAULT_VIEW, 10, 0, 3);
    const groundR = project(DEFAULT_VIEW, 10, 10, 0);
    const topR = project(DEFAULT_VIEW, 10, 10, 3);
    expect(topL.x).toBeLessThan(groundL.x);
    expect(topR.x).toBeGreaterThan(groundR.x);
  });

  it(`keeps the whole court and its 4 m walls inside the ${GAME_W}x${GAME_H} screen`, () => {
    for (const [x, y] of [[0, 0], [20, 0], [0, 10], [20, 10]]) {
      for (const z of [0, 4]) {
        const p = project(DEFAULT_VIEW, x, y, z);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(GAME_W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(GAME_H);
      }
    }
  });

  it('finds the court spot under a screen point (reverse of project)', () => {
    for (const view of [DEFAULT_VIEW, FLIPPED]) {
      const p = project(view, 7, 3, 0);
      const back = unprojectGround(view, p.x, p.y);
      expect(back.x).toBeCloseTo(7);
      expect(back.y).toBeCloseTo(3);
    }
  });

  it('turned round, shows the far team at the bottom (for multiplayer)', () => {
    expect(project(FLIPPED, 0, 5).y).toBeGreaterThan(project(FLIPPED, 20, 5).y);
    expect(nearerThanNet(DEFAULT_VIEW, 15)).toBe(true);
    expect(nearerThanNet(FLIPPED, 15)).toBe(false);
  });
});
