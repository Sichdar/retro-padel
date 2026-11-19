import { describe, expect, it } from 'vitest';
import { BEST_OF_3, ONE_SET, QUICK_MATCH, SERVE_ORDER, Score, Team } from '../src/game/scoring';

const play = (s: Score, ...winners: Team[]) => winners.map((w) => s.pointWon(w));
const game = (s: Score, w: Team) => play(s, w, w, w, w).at(-1)!;

describe('points in a game', () => {
  it('counts 15, 30, 40 and wins the game on the fourth point', () => {
    const s = new Score(ONE_SET);
    play(s, 0);
    expect([s.call(0), s.call(1)]).toEqual(['15', '0']);
    play(s, 0, 1);
    expect([s.call(0), s.call(1)]).toEqual(['30', '15']);
    play(s, 0);
    expect(s.call(0)).toBe('40');
    expect(s.pointWon(0)).toEqual({ game: 0 });
    expect(s.games).toEqual([1, 0]);
    expect(s.points).toEqual([0, 0]);
  });

  it('deuce and advantage without golden point', () => {
    const s = new Score(ONE_SET);
    play(s, 0, 0, 0, 1, 1, 1);
    expect(s.isDeuce).toBe(true);
    play(s, 0);
    expect([s.call(0), s.call(1)]).toEqual(['AD', '40']);
    play(s, 1);
    expect(s.isDeuce).toBe(true);
    play(s, 1);
    expect(s.call(1)).toBe('AD');
    expect(s.pointWon(1)).toEqual({ game: 1 });
  });

  it('golden point: at 40-40 the next point wins the game', () => {
    const s = new Score(QUICK_MATCH);
    play(s, 0, 0, 0, 1, 1, 1);
    expect(s.isGoldenPoint).toBe(true);
    expect(s.pointWon(1)).toEqual({ game: 1 });
  });

  it('serves from the right on even points and the left on odd ones, also after deuce', () => {
    const s = new Score(ONE_SET);
    expect(s.serveSide).toBe('right');
    play(s, 0);
    expect(s.serveSide).toBe('left');
    play(s, 0, 0, 1, 1, 1, 0, 1); // deuce after advantage
    expect(s.isDeuce).toBe(true);
    expect(s.serveSide).toBe('right');
  });
});

describe('games, sets and serve order', () => {
  it('serve passes in the order 0, 2, 1, 3 each game', () => {
    const s = new Score(ONE_SET);
    const servers = [];
    for (let i = 0; i < 5; i++) {
      servers.push(s.server);
      game(s, 0);
    }
    expect(servers).toEqual([...SERVE_ORDER, SERVE_ORDER[0]]);
  });

  it('a set needs 6 games with a 2-game lead: 6-4 wins, 6-5 does not', () => {
    const s = new Score(ONE_SET);
    for (let i = 0; i < 4; i++) game(s, 1);
    for (let i = 0; i < 5; i++) game(s, 0);
    expect(s.games).toEqual([5, 4]);
    expect(game(s, 0)).toEqual({ game: 0, set: 0, match: 0 });
    expect(s.history).toEqual([[6, 4]]);

    const t = new Score(ONE_SET);
    for (let i = 0; i < 5; i++) game(t, 0), game(t, 1);
    expect(game(t, 0)).toEqual({ game: 0 });
    expect(t.games).toEqual([6, 5]);
    expect(game(t, 0).set).toBe(0); // 7-5
  });

  it('tie-break at 6-6: first to 7 points by 2, set ends 7-6', () => {
    const s = new Score(ONE_SET);
    for (let i = 0; i < 6; i++) game(s, 0), game(s, 1);
    expect(s.tiebreak).toBe(true);
    play(s, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1); // 5-5
    expect([s.call(0), s.call(1)]).toEqual(['5', '5']);
    play(s, 0, 1, 1); // 6-7
    expect(s.tiebreak).toBe(true);
    const r = s.pointWon(1);
    expect(r.set).toBe(1);
    expect(s.history).toEqual([[6, 7]]);
    expect(s.tiebreak).toBe(false);
  });

  it('tie-break serve: first point by one player, then two each', () => {
    const s = new Score(ONE_SET);
    for (let i = 0; i < 6; i++) game(s, 0), game(s, 1);
    const servers = [];
    for (let i = 0; i < 6; i++) {
      servers.push(s.server);
      s.pointWon((i % 2) as Team);
    }
    const a = servers[0];
    const i0 = SERVE_ORDER.indexOf(a as 0 | 1 | 2 | 3);
    const next = (k: number) => SERVE_ORDER[(i0 + k) % 4];
    expect(servers).toEqual([a, next(1), next(1), next(2), next(2), next(3)]);
  });

  it('quick match: first to 4 games, tie-break at 3-3 ends 4-3', () => {
    const s = new Score(QUICK_MATCH);
    for (let i = 0; i < 3; i++) game(s, 0), game(s, 1);
    expect(s.tiebreak).toBe(true);
    for (let i = 0; i < 6; i++) s.pointWon(0);
    const r = s.pointWon(0);
    expect(r).toEqual({ game: 0, set: 0, match: 0 });
    expect(s.history).toEqual([[4, 3]]);
    expect(s.winner).toBe(0);

    const q = new Score(QUICK_MATCH);
    for (let i = 0; i < 3; i++) game(q, 1);
    expect(game(q, 1).match).toBe(1); // 0-4
  });

  it('best of 3 sets: the match ends when a team wins 2 sets', () => {
    const s = new Score(BEST_OF_3);
    const set = (w: Team) => {
      let r = {};
      for (let i = 0; i < 6; i++) r = game(s, w);
      return r;
    };
    expect(set(0)).toEqual({ game: 0, set: 0 });
    expect(set(1)).toEqual({ game: 1, set: 1 });
    expect(set(1)).toEqual({ game: 1, set: 1, match: 1 });
    expect(s.sets).toEqual([1, 2]);
  });
});
