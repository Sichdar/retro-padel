import { describe, expect, it } from 'vitest';
import { computeScale } from '../src/ui/scaling';

describe('computeScale', () => {
  it('uses whole-number factors in device pixels (iPhone landscape)', () => {
    const r = computeScale(844, 390, 3, 384, 216);
    expect(r.factor).toBe(5);
    expect(r.cssWidth).toBeCloseTo(640);
    expect(r.cssHeight).toBeCloseTo(360);
  });

  it('fills an upright iPhone at factor 5 (216x384 game on 390x844, 3 dots per point)', () => {
    const r = computeScale(390, 844, 3, 216, 384);
    expect(r.factor).toBe(5);
    expect(r.cssWidth).toBeCloseTo(360);
    expect(r.cssHeight).toBeCloseTo(640);
  });

  it('fits a 1080p desktop window at factor 5 with dpr 1', () => {
    const r = computeScale(1920, 1080, 1, 384, 216);
    expect(r.factor).toBe(5);
    expect(r.cssWidth).toBe(1920);
  });

  it('never fills more than the space available', () => {
    for (const [w, h, d] of [[740, 360, 2.625], [915, 412, 2.625], [667, 375, 2], [1366, 768, 1]]) {
      const r = computeScale(w, h, d, 384, 216);
      expect(r.cssWidth).toBeLessThanOrEqual(w + 1e-9);
      expect(r.cssHeight).toBeLessThanOrEqual(h + 1e-9);
      expect(Number.isInteger(r.factor)).toBe(true);
    }
  });

  it('falls back to factor 1 on tiny or broken input', () => {
    expect(computeScale(100, 50, 1, 384, 216).factor).toBe(1);
    expect(computeScale(800, 450, NaN, 384, 216).factor).toBe(2);
    expect(computeScale(-5, 0, 0, 384, 216).factor).toBe(1);
  });
});
