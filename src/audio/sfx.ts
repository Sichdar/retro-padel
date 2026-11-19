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

/** Ball bounce on the court. */
export function sfxBounce(): void {
  tone(220, 0, 0.05, 'triangle', 0.5);
}

/** Short buzz on phones that support it (Android). */
export function vibrate(ms = 15): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
