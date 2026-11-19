import { describe, expect, it } from 'vitest';
import { Match, MatchEvent } from '../src/game/match';
import { QUICK_MATCH } from '../src/game/scoring';

/** Play a whole match with the computer on all four spots. */
function playOut(seed: number, maxMinutes = 40) {
  const m = new Match({ seed, allCpu: true, rules: QUICK_MATCH });
  const events: MatchEvent[] = [...m.start()];
  const steps = maxMinutes * 60 * 60;
  for (let i = 0; i < steps && m.phase !== 'match-over'; i++) events.push(...m.step());
  return { m, events };
}

describe('a full quick match, computer against computer', () => {
  for (const seed of [1, 2, 3]) {
    it(`finishes with a winner (seed ${seed})`, () => {
      const { m, events } = playOut(seed);
      const points = events.filter((e) => e.type === 'point');
      const hits = events.filter((e) => e.type === 'hit');
      const reasons: Record<string, number> = {};
      for (const e of points) if (e.type === 'point') reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
      const faults = events.filter((e) => e.type === 'fault').length;
      console.log(
        `seed ${seed}: winner ${m.winnerTeam}, sets ${m.score.history.map((s) => s.join('-'))}, points ${points.length}, ` +
          `hits/point ${(hits.length / points.length).toFixed(1)}, smashes ${hits.filter((h) => h.type === "hit" && h.kind === "smash").length}, longest ${m.longestRally}, faults ${faults}, ` +
          `minutes ${(m.time / 60).toFixed(1)}`,
        reasons,
      );
      expect(m.phase).toBe('match-over');
      expect(m.winnerTeam === 0 || m.winnerTeam === 1).toBe(true);
      expect(events.some((e) => e.type === 'match-over')).toBe(true);
      // Real rallies happen: on average more than the serve and a return.
      expect(hits.length / points.length).toBeGreaterThan(2.5);
    });
  }
});
