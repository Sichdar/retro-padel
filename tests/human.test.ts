import { describe, expect, it } from 'vitest';
import { HUMAN, Match, MatchEvent, NO_INPUT } from '../src/game/match';
import { alongPath, groundDistance } from '../src/game/players';

/**
 * A pretend player who never touches the joystick (assisted movement does the
 * running) and taps HIT when the ball is about to arrive.
 */
function playWithThumb(seed: number, pressAt: number) {
  const m = new Match({ seed, assist: true });
  const ev: MatchEvent[] = [...m.start()];
  let cooldown = 0;
  for (let i = 0; i < 40 * 3600 && m.phase !== 'match-over'; i++) {
    const me = m.players[HUMAN];
    const b = m.ball;
    let hit = false;
    cooldown--;
    if (m.humanToServe && m.phaseTime > 0.5) hit = true;
    else if (m.phase === 'rally' && cooldown <= 0 && m.ref.canHit(0, b.x) && groundDistance(me, b) < 2.2) {
      const along = alongPath(me, b);
      if (along > pressAt - 0.15 && along < pressAt + 0.15) {
        hit = true;
        cooldown = 30;
      }
    }
    ev.push(...m.step({ ...NO_INPUT, hit }));
  }
  return { m, ev };
}

describe('playing as the human with assisted movement', () => {
  // The pretend thumb presses at one fixed moment, so about half its hits are perfect (8 seeds: 45-54%).
  it('a well-timed thumb hits the ball, often with perfect timing, and the match ends', () => {
    const { m, ev } = playWithThumb(5, -1.6);
    const mine = ev.filter((e) => e.type === 'hit' && e.player === HUMAN && e.kind !== 'serve');
    const perfect = mine.filter((e) => e.type === 'hit' && e.timing === 'perfect').length;
    const points = ev.filter((e) => e.type === 'point');
    const won = points.filter((e) => e.type === 'point' && e.winner === 0).length;
    console.log(`human hits ${mine.length}, perfect ${perfect}, points won ${won}/${points.length}, winner ${m.winnerTeam}, score ${m.score.history}`);
    expect(m.phase).toBe('match-over');
    expect(mine.length).toBeGreaterThan(10);
    expect(perfect / mine.length).toBeGreaterThan(0.4);
  });
});

describe('joystick', () => {
  it('moves your player the way the thumb points (screen left = court left, screen up = towards the net)', () => {
    const m = new Match({ seed: 9 });
    m.start();
    m.step({ ...NO_INPUT, hit: true }); // serve
    while (m.phase === 'toss') m.step();
    const me = m.players[HUMAN];
    const y0 = me.y;
    for (let i = 0; i < 20; i++) m.step({ ...NO_INPUT, active: true, mx: -1 });
    expect(me.y).toBeLessThan(y0 - 0.5);
    const x0 = me.x;
    for (let i = 0; i < 20; i++) m.step({ ...NO_INPUT, active: true, my: -1 });
    expect(me.x).toBeLessThan(x0 - 0.5);
    // Never past the net or through the walls.
    for (let i = 0; i < 300; i++) m.step({ ...NO_INPUT, active: true, my: -1, mx: -1 });
    expect(me.x).toBeGreaterThan(10);
    expect(me.y).toBeGreaterThan(0);
  });
});
