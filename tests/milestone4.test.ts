import { describe, expect, it } from 'vitest';
import { DIFFICULTY } from '../src/game/ai';
import { HUMAN, HUMAN_2, HumanInput, Match, MatchEvent, NO_INPUT } from '../src/game/match';
import { makeBall } from '../src/game/physics';
import { alongPath, groundDistance } from '../src/game/players';
import { QUICK_MATCH } from '../src/game/scoring';
import { DEFAULTS, cleanName, loadSettings, sanitise, saveSettings } from '../src/settings';
import { SONGS, noteFreq, noteLengths, tokens } from '../src/audio/music';

describe('settings', () => {
  it('start from the defaults when nothing is saved, or the saved data is broken', () => {
    expect(loadSettings(null)).toEqual(DEFAULTS);
    const broken = { getItem: () => '{not json', setItem: () => undefined };
    expect(loadSettings(broken)).toEqual(DEFAULTS);
  });

  it('are saved and read back', () => {
    const mem: Record<string, string> = {};
    const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v) };
    const mine = { ...DEFAULTS, level: 'hard' as const, music: false, look: 2, name: 'FABI' };
    saveSettings(mine, store);
    expect(loadSettings(store)).toEqual(mine);
  });

  it('a full or blocked storage never breaks the game', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('full'); } };
    expect(() => saveSettings(DEFAULTS, full)).not.toThrow();
  });

  it('fix wrong values one by one, keeping the good ones', () => {
    const s = sanitise({ level: 'insane', music: 'yes', look: 7, kit: 2, length: 'best3' });
    expect(s.level).toBe('normal');
    expect(s.music).toBe(true);
    expect(s.look).toBe(0);
    expect(s.kit).toBe(2);
    expect(s.length).toBe('best3');
  });

  it('names: capitals, letters and digits only, at most 8, never empty', () => {
    expect(cleanName('fábio!')).toBe('FBIO');
    expect(cleanName('  padel   king 1994 ')).toBe('PADEL KI');
    expect(cleanName('!!!')).toBe('YOU');
  });
});

describe('music', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    it(`"${name}": every part is whole bars of 16ths and every note is real`, () => {
      const parts = [tokens(song.lead), tokens(song.bass), tokens(song.drums)];
      for (const p of parts) expect(p.length % 16).toBe(0);
      expect(parts[0].length).toBe(parts[1].length);
      expect(parts[0].length).toBe(parts[2].length);
      for (const tk of [...parts[0], ...parts[1]]) {
        if (tk !== '.' && tk !== '-') expect(noteFreq(tk)).toBeGreaterThan(30);
      }
      for (const tk of parts[2]) expect('kshx.'.includes(tk)).toBe(true);
    });
  }
  it('A4 is 440 Hz and holds make notes longer', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('C5')).toBeCloseTo(523.25, 1);
    expect(noteLengths(['C4', '-', '-', '.', 'D4', '.'])).toEqual([3, 0, 0, 0, 1, 0]);
  });
});

describe('ball touching a player', () => {
  it('loses the point for that player`s team', () => {
    const m = new Match({ seed: 3, allCpu: true });
    m.start();
    // Skip to the rally: let the computer serve and the other side return it.
    let ev: MatchEvent[] = [];
    for (let i = 0; i < 2000 && !(m.phase === 'rally' && m.ref.shots >= 2 && m.ref.hitter === 1); i++) ev = m.step();
    expect(m.ref.hitter).toBe(1);
    // A ball from the far team flying straight at a near player's chest.
    const p = m.players.find((q) => q.team === 0)!;
    m.ball = makeBall(p.x - 0.1, p.y, 1.2);
    m.ball.vx = 20;
    m.ball.vy = 0;
    m.ball.vz = 0;
    p.swing = -1;
    // Nobody may hit it in this test: stop the near team from reaching.
    for (const q of m.players) if (q.team === 0) (m as unknown as { missed: boolean[] }).missed[q.id] = true;
    ev = m.step();
    const point = ev.find((e) => e.type === 'point');
    expect(point && point.type === 'point' && point.reason).toBe('body');
    expect(point && point.type === 'point' && point.winner).toBe(1);
  });

  it('is rare in computer matches (mostly after a swing and a miss)', () => {
    let points = 0;
    let body = 0;
    for (const seed of [11, 12, 13]) {
      const m = new Match({ seed, allCpu: true, rules: QUICK_MATCH });
      m.start();
      for (let i = 0; i < 40 * 3600 && m.phase !== 'match-over'; i++) {
        for (const e of m.step()) {
          if (e.type !== 'point') continue;
          points++;
          if (e.reason === 'body') body++;
        }
      }
    }
    expect(body / points).toBeLessThan(0.12);
  });
});

describe('computer levels', () => {
  it('Hard beats Easy over several matches', () => {
    let hardPoints = 0;
    let easyPoints = 0;
    for (const seed of [21, 22, 23, 24]) {
      const m = new Match({ seed, allCpu: true, levels: [DIFFICULTY.easy, DIFFICULTY.hard] });
      m.start();
      for (let i = 0; i < 40 * 3600 && m.phase !== 'match-over'; i++) {
        for (const e of m.step()) if (e.type === 'point') e.winner === 1 ? hardPoints++ : easyPoints++;
      }
      expect(m.phase).toBe('match-over');
    }
    expect(hardPoints).toBeGreaterThan(easyPoints * 1.3);
  });

  it('the three levels get faster and more accurate in order', () => {
    const { easy, normal, hard } = DIFFICULTY;
    expect(easy.speed).toBeLessThan(normal.speed);
    expect(normal.speed).toBeLessThan(hard.speed);
    expect(easy.miss).toBeGreaterThan(normal.miss);
    expect(normal.miss).toBeGreaterThan(hard.miss);
    expect(easy.aimNoise).toBeGreaterThan(hard.aimNoise);
  });
});

/** A pretend thumb for one player: taps HIT when the ball is about to arrive. */
function thumb(m: Match, id: number, cooldown: number[]): HumanInput {
  const me = m.players[id];
  const b = m.ball;
  cooldown[id]--;
  if (m.phase === 'serve-wait' && m.server.id === id && m.phaseTime > 0.5) return { ...NO_INPUT, hit: true };
  if (m.phase === 'rally' && cooldown[id] <= 0 && m.ref.canHit(me.team, b.x) && groundDistance(me, b) < 2.2) {
    const along = alongPath(me, b);
    if (along > -1.75 && along < -1.45) {
      cooldown[id] = 30;
      return { ...NO_INPUT, hit: true };
    }
  }
  return NO_INPUT;
}

describe('couch mode: two people on one phone', () => {
  it('both people hit the ball and the match ends', () => {
    const m = new Match({ seed: 31, humans: [HUMAN, HUMAN_2], assist: true });
    expect(m.players[HUMAN].human && m.players[HUMAN_2].human).toBe(true);
    expect(m.players[1].human || m.players[3].human).toBe(false);
    const ev: MatchEvent[] = [...m.start()];
    const cd = [0, 0, 0, 0];
    for (let i = 0; i < 40 * 3600 && m.phase !== 'match-over'; i++) {
      const inputs: HumanInput[] = [];
      inputs[HUMAN] = thumb(m, HUMAN, cd);
      inputs[HUMAN_2] = thumb(m, HUMAN_2, cd);
      ev.push(...m.step(inputs));
    }
    const hits = (id: number) => ev.filter((e) => e.type === 'hit' && e.player === id && e.kind !== 'serve').length;
    expect(m.phase).toBe('match-over');
    expect(hits(HUMAN)).toBeGreaterThan(5);
    expect(hits(HUMAN_2)).toBeGreaterThan(5);
  });

  it('the top player`s stick is turned round: their "up" runs towards the net', () => {
    const m = new Match({ seed: 9, humans: [HUMAN, HUMAN_2] });
    m.start();
    // Wait until the ball is in play, then push P2's stick "up" (away from them).
    for (let i = 0; i < 2000 && m.phase !== 'rally'; i++) {
      const inputs: HumanInput[] = [];
      if (m.server.human) inputs[m.server.id] = { ...NO_INPUT, hit: true };
      m.step(inputs);
    }
    const p2 = m.players[HUMAN_2];
    const x0 = p2.x;
    const y0 = p2.y;
    for (let i = 0; i < 20; i++) {
      const inputs: HumanInput[] = [];
      inputs[HUMAN_2] = { ...NO_INPUT, active: true, my: -1 };
      m.step(inputs);
    }
    expect(p2.x).toBeGreaterThan(x0 + 0.3); // towards the net (x = 10) from the far half
    for (let i = 0; i < 20; i++) {
      const inputs: HumanInput[] = [];
      inputs[HUMAN_2] = { ...NO_INPUT, active: true, mx: 1 };
      m.step(inputs);
    }
    expect(p2.y).toBeLessThan(y0); // their right is the screen's left
  });

  it('a double tap (lob) makes a lob', () => {
    const m = new Match({ seed: 5, humans: [HUMAN] });
    const ev: MatchEvent[] = [...m.start()];
    let cd = 0;
    for (let i = 0; i < 60 * 60 && !ev.some((e) => e.type === 'hit' && e.player === HUMAN && e.kind === 'lob'); i++) {
      const c = [cd, 0, 0, 0];
      const inp = thumb(m, HUMAN, c);
      cd = c[0];
      ev.push(...m.step(inp.hit && m.phase === 'rally' ? { ...inp, hit: false, lob: true } : inp));
    }
    expect(ev.some((e) => e.type === 'hit' && e.player === HUMAN && e.kind === 'lob')).toBe(true);
  });
});
