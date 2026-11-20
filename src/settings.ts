// The player's settings, kept in the browser's storage on this phone.
// Storage can be missing (private windows, blocked site data), so every read
// and write is guarded and the game always works with the defaults.

export type Level = 'easy' | 'normal' | 'hard';
export type MatchLength = 'short' | 'set' | 'best3';

export interface Settings {
  effects: boolean;
  music: boolean;
  vibration: boolean;
  /** Joystick on the right and buttons on the left. */
  buttonsLeft: boolean;
  /** Your player drifts towards the ball when you leave the joystick alone. */
  assist: boolean;
  level: Level;
  goldenPoint: boolean;
  length: MatchLength;
  /** Shown on the scoreboard instead of YOU. */
  name: string;
  /** Character design 0..3. */
  look: number;
  /** Kit colour 0..3. */
  kit: number;
}

export const DEFAULTS: Settings = {
  effects: true,
  music: true,
  vibration: true,
  buttonsLeft: false,
  assist: true,
  level: 'normal',
  goldenPoint: true,
  length: 'short',
  name: 'YOU',
  look: 0,
  kit: 0,
};

export const NAME_MAX = 8;
const KEY = 'padel-rush-94-settings';

/** Letters, digits and spaces only (the pixel font has them all), upper case, at most 8. */
export function cleanName(raw: string): string {
  const s = raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return s || DEFAULTS.name;
}

/** Fill in anything missing or wrong with the defaults. */
export function sanitise(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const bool = (k: keyof Settings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULTS[k] as boolean));
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
  const idx = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3 ? v : 0);
  return {
    effects: bool('effects'),
    music: bool('music'),
    vibration: bool('vibration'),
    buttonsLeft: bool('buttonsLeft'),
    assist: bool('assist'),
    level: pick(r.level, ['easy', 'normal', 'hard'] as const, DEFAULTS.level),
    goldenPoint: bool('goldenPoint'),
    length: pick(r.length, ['short', 'set', 'best3'] as const, DEFAULTS.length),
    name: typeof r.name === 'string' ? cleanName(r.name) : DEFAULTS.name,
    look: idx(r.look),
    kit: idx(r.kit),
  };
}

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function store(): Store | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadSettings(s: Store | null = store()): Settings {
  try {
    const txt = s?.getItem(KEY);
    return sanitise(txt ? JSON.parse(txt) : {});
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(v: Settings, s: Store | null = store()): void {
  try {
    s?.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage full or blocked: the settings still last until the page closes */
  }
}

/** The live settings, shared by every scene. */
export const settings: Settings = loadSettings();

const listeners: (() => void)[] = [];

/** Run `fn` now and whenever a setting changes. */
export function onSettingsChange(fn: () => void): void {
  listeners.push(fn);
  fn();
}

/** Change some settings, save them and tell everyone listening. */
export function updateSettings(change: Partial<Settings>): void {
  Object.assign(settings, sanitise({ ...settings, ...change }));
  saveSettings(settings);
  for (const fn of listeners) fn();
}
