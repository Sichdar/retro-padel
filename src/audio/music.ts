// Two short original chiptune loops, played live with the Web Audio API
// (no music files): a bouncy menu theme and a calmer match theme.
// The tunes are plain data, so a test can check every bar has the right length.

import { audioSettings, getAudio, whenAudioReady } from './sfx';

export interface Song {
  bpm: number;
  /** Volume of the whole song (0..1). */
  volume: number;
  /** One token per 16th note: a note like "E5", "." for silence, "-" to hold the last note. */
  lead: string;
  bass: string;
  /** k = kick, s = snare, h = hi-hat, . = nothing. */
  drums: string;
  leadWave: OscillatorType;
}

export type SongName = 'menu' | 'match';

export const SONGS: Record<SongName, Song> = {
  // C - Am - F - G, upbeat.
  menu: {
    bpm: 138,
    volume: 0.55,
    leadWave: 'square',
    lead:
      'E5 . G5 . C6 - G5 . A5 . G5 . E5 . D5 . ' +
      'C5 . E5 . A5 - - . G5 . E5 . C5 . D5 . ' +
      'F5 . A5 . C6 - A5 . G5 . F5 . E5 . D5 . ' +
      'D5 . G5 . B5 . D6 - C6 . B5 . G5 - - . ' +
      'E5 . G5 . C6 - G5 . A5 . C6 . E6 - D6 . ' +
      'C6 . A5 . E5 - A5 . G5 . E5 . C5 . E5 . ' +
      'F5 . A5 . C6 . F6 - E6 . C6 . A5 . F5 . ' +
      'G5 - - . D5 . G5 . B5 - - . C6 - - .',
    bass:
      'C3 . C4 . C3 . C4 . C3 . C4 . G2 . B2 . ' +
      'A2 . A3 . A2 . A3 . A2 . A3 . E2 . G2 . ' +
      'F2 . F3 . F2 . F3 . F2 . F3 . C3 . A2 . ' +
      'G2 . G3 . G2 . G3 . G2 . G3 . D3 . B2 . ' +
      'C3 . C4 . C3 . C4 . C3 . C4 . G2 . B2 . ' +
      'A2 . A3 . A2 . A3 . A2 . A3 . E2 . G2 . ' +
      'F2 . F3 . F2 . F3 . F2 . F3 . C3 . A2 . ' +
      'G2 . G3 . G2 . G3 . G2 . B2 . C3 . . .',
    drums: ('k . h . s . h . k . k . s . h h ').repeat(7) + 'k . h . s . h . k . s . s s s s',
  },
  // Am - F - C - G, calmer, under the match sounds.
  match: {
    bpm: 120,
    volume: 0.32,
    leadWave: 'triangle',
    lead:
      'A4 . C5 . E5 . C5 . A4 . C5 . E5 . G5 . ' +
      'F4 . A4 . C5 . A4 . F4 . A4 . C5 . E5 . ' +
      'E4 . G4 . C5 . G4 . E4 . G4 . C5 . D5 . ' +
      'D4 . G4 . B4 . G4 . D4 . G4 . B4 . D5 .',
    bass:
      'A2 - - . A2 - . . A2 - - . E2 . G2 . ' +
      'F2 - - . F2 - . . F2 - - . C3 . A2 . ' +
      'C3 - - . C3 - . . C3 - - . G2 . E2 . ' +
      'G2 - - . G2 - . . G2 - - . D3 . B2 .',
    drums: ('k . . . h . . . k . k . h . . . ').repeat(3) + 'k . . . h . . . k . k . s . s .',
  },
};

/** Split a pattern into its 16th-note tokens. */
export function tokens(pattern: string): string[] {
  return pattern.trim().split(/\s+/);
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" -> 440 Hz. Sharps as "C#4". */
export function noteFreq(note: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) return 0;
  const semis = NOTE_INDEX[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semis - 69) / 12);
}

/** How many 16ths each note in a part lasts (holds "-" included). */
export function noteLengths(pattern: string[]): number[] {
  const out = pattern.map(() => 0);
  let last = -1;
  pattern.forEach((tk, i) => {
    if (tk === '-') {
      if (last >= 0) out[last]++;
    } else if (tk === '.') last = -1;
    else {
      out[i] = 1;
      last = i;
    }
  });
  return out;
}

// ---- Player -----------------------------------------------------------------

let current: SongName | null = null;
let wanted: SongName | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let gain: GainNode | null = null;
let step = 0;
let nextTime = 0;
let parsed: { lead: string[]; bass: string[]; drums: string[]; leadLen: number[]; bassLen: number[] } | null = null;
let noiseBuf: AudioBuffer | null = null;

const LOOKAHEAD = 0.15;

/** Start a loop (or keep it going if it's already playing). */
export function playMusic(name: SongName): void {
  wanted = name;
  if (current === name && timer) return;
  stopNow();
  if (!audioSettings.music) return;
  const a = getAudio();
  if (!a) return; // starts on the first tap, see whenAudioReady below
  const song = SONGS[name];
  const lead = tokens(song.lead);
  const bass = tokens(song.bass);
  parsed = { lead, bass, drums: tokens(song.drums), leadLen: noteLengths(lead), bassLen: noteLengths(bass) };
  gain = a.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, a.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(song.volume, a.ctx.currentTime + 0.3);
  gain.connect(a.master);
  current = name;
  step = 0;
  nextTime = a.ctx.currentTime + 0.08;
  timer = setInterval(schedule, 30);
  schedule();
}

/** Fade the music out. */
export function stopMusic(): void {
  wanted = null;
  stopNow();
}

/** Turn music on or off after the setting changes. */
export function refreshMusic(): void {
  if (!audioSettings.music) stopNow();
  else if (wanted && !timer) playMusic(wanted);
}

function stopNow(): void {
  if (timer) clearInterval(timer);
  timer = null;
  const a = getAudio();
  if (gain && a) {
    const g = gain;
    g.gain.cancelScheduledValues(a.ctx.currentTime);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), a.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.ctx.currentTime + 0.25);
    setTimeout(() => g.disconnect(), 400);
  }
  gain = null;
  current = null;
}

function schedule(): void {
  const a = getAudio();
  if (!a || !gain || !parsed || !current) return;
  const song = SONGS[current];
  const sixteenth = 60 / song.bpm / 4;
  // After the page was hidden the clock ran on: skip ahead instead of rushing.
  if (nextTime < a.ctx.currentTime) nextTime = a.ctx.currentTime + 0.05;
  while (nextTime < a.ctx.currentTime + LOOKAHEAD) {
    const p = parsed;
    const i = step % p.lead.length;
    const lead = p.lead[i];
    if (p.leadLen[i]) voice(a.ctx, noteFreq(lead), nextTime, p.leadLen[i] * sixteenth * 0.92, song.leadWave, 0.22);
    const bi = step % p.bass.length;
    if (p.bassLen[bi]) voice(a.ctx, noteFreq(p.bass[bi]), nextTime, p.bassLen[bi] * sixteenth * 0.9, 'triangle', 0.5);
    const d = p.drums[step % p.drums.length];
    if (d !== '.') drum(a.ctx, d, nextTime);
    nextTime += sixteenth;
    step++;
  }
}

function voice(ctx: AudioContext, freq: number, t0: number, dur: number, wave: OscillatorType, vol: number): void {
  if (!gain || !freq) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.setValueAtTime(vol * 0.7, t0 + Math.min(0.05, dur / 2));
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(gain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function drum(ctx: AudioContext, kind: string, t0: number): void {
  if (!gain) return;
  if (kind === 'k') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
    g.gain.setValueAtTime(0.8, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    osc.connect(g).connect(gain);
    osc.start(t0);
    osc.stop(t0 + 0.16);
    return;
  }
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = kind === 's' ? 'bandpass' : 'highpass';
  f.frequency.value = kind === 's' ? 1800 : 7000;
  const g = ctx.createGain();
  const len = kind === 's' ? 0.12 : 0.035;
  g.gain.setValueAtTime(kind === 's' ? 0.45 : 0.18, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  src.connect(f).connect(g).connect(gain);
  src.start(t0);
  src.stop(t0 + len + 0.02);
}

// Music asked for before the first tap starts as soon as sound is allowed.
whenAudioReady(() => {
  if (wanted && !timer) playMusic(wanted);
});
