// Tiny chiptune sound effects made with the Web Audio API (no sound files).
// Phones only allow sound after the first tap, so call unlockAudio() from a tap.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export const audioSettings = { effects: true, music: true };

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.25;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.6): void {
  if (!ctx || !master || !audioSettings.effects) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Menu cursor blip. */
export function sfxBlip(): void {
  tone(880, 0, 0.06);
}

/** Confirm sound: short rising arpeggio. */
export function sfxStart(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.12));
}

let noiseBuf: AudioBuffer | null = null;

/** A short burst of filtered noise (for mesh rattles and thuds). */
function noise(start: number, dur: number, freq: number, q: number, vol: number): void {
  if (!ctx || !master || !audioSettings.effects) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/** Louder for harder hits: speed in m/s to a 0.3..1 volume. */
function loud(speed: number): number {
  return Math.min(1, 0.3 + speed / 25);
}

/** Ball bounce on the court floor. */
export function sfxBounce(speed = 10): void {
  tone(200, 0, 0.05, 'triangle', 0.6 * loud(speed));
  noise(0, 0.03, 900, 1.5, 0.4 * loud(speed));
}

/** Ball on the glass: a bright "tock" with a ring. */
export function sfxGlass(speed = 10): void {
  tone(1320, 0, 0.09, 'square', 0.25 * loud(speed));
  tone(1980, 0.005, 0.07, 'sine', 0.3 * loud(speed));
  noise(0, 0.04, 2500, 2, 0.5 * loud(speed));
}

/** Ball in the metal mesh: a dull rattle. */
export function sfxMesh(speed = 10): void {
  for (let i = 0; i < 4; i++) noise(i * 0.025, 0.05, 1400 + i * 300, 6, 0.5 * loud(speed));
}

/** Ball into the net: a soft thud. */
export function sfxNet(): void {
  noise(0, 0.12, 250, 1, 0.8);
  tone(110, 0, 0.1, 'triangle', 0.4);
}

/** Ball clipping the top of the net. */
export function sfxNetCord(): void {
  tone(660, 0, 0.04, 'square', 0.3);
  noise(0, 0.08, 400, 1, 0.6);
}

/** Ball flying out of the court: falling whistle. */
export function sfxOut(): void {
  if (!ctx || !master || !audioSettings.effects) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(900, t0);
  osc.frequency.exponentialRampToValueAtTime(150, t0 + 0.45);
  g.gain.setValueAtTime(0.25, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.52);
}

/** Racket hit (used by the test scene's launches for now). */
export function sfxHit(): void {
  noise(0, 0.05, 1800, 1.2, 0.7);
  tone(520, 0, 0.04, 'square', 0.3);
}

/** Short buzz on phones that support it (Android). */
export function vibrate(ms = 15): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}

/** A crisper, louder racket hit for smashes. */
export function sfxSmash(): void {
  noise(0, 0.09, 2400, 0.8, 0.9);
  tone(330, 0, 0.08, 'square', 0.35);
  tone(165, 0.02, 0.12, 'triangle', 0.4);
}

/** Crowd cheering: a swell of soft noise with a few claps. */
export function sfxCrowd(big = false): void {
  const len = big ? 1.4 : 0.8;
  noise(0, len, 700, 0.6, big ? 0.55 : 0.35);
  noise(0.05, len * 0.8, 1600, 0.8, big ? 0.35 : 0.2);
  for (let i = 0; i < (big ? 10 : 5); i++) noise(0.05 + Math.random() * len * 0.7, 0.03, 2200, 3, 0.4);
}

/** Point won by your team: a short rising jingle. */
export function sfxPointWon(): void {
  [659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.14, 'square', 0.35));
}

/** Point lost: a short falling jingle. */
export function sfxPointLost(): void {
  [392, 330, 262].forEach((f, i) => tone(f, i * 0.1, 0.16, 'triangle', 0.5));
}

/** Fault or let: the umpire's buzzer. */
export function sfxFault(): void {
  tone(220, 0, 0.12, 'square', 0.3);
  tone(185, 0.13, 0.18, 'square', 0.3);
}

/** Match won: a little fanfare. */
export function sfxWin(): void {
  const notes: [number, number, number][] = [
    [523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.3],
    [784, 0.7, 0.1], [1047, 0.82, 0.5],
  ];
  for (const [f, s, d] of notes) {
    tone(f, s, d, 'square', 0.35);
    tone(f / 2, s, d, 'triangle', 0.4);
  }
}

/** Match lost: a slow, sad tune. */
export function sfxLose(): void {
  const notes: [number, number][] = [[392, 0], [370, 0.25], [349, 0.5], [262, 0.8]];
  for (const [f, s] of notes) tone(f, s, 0.3, 'triangle', 0.5);
}
