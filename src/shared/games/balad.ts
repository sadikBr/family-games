/**
 * «البلد الغامض» — guess the country from clues that appear one by one, from hard to easy: the types
 * shared by the server and the app, the scoring rule, the regions and the game's card on the home screen.
 *
 * A round hides a country and shows its six clues one after another, every few seconds (the lobby's
 * interval). Everyone guesses on their own phone at any moment: typed (tolerant matching, see
 * balad-countries.ts) or picked from the list. The earlier the right guess, the more points
 * (60 at the first clue … 10 at the last) plus up to 5 for speed after the clue appeared. A wrong guess
 * costs nothing but locks the guesser for 3 s. The round ends when everyone found it or when the last
 * clue's time runs out; the reveal shows the country with its flag and who found it at which clue.
 *
 * The view never carries the country (nor a clue before its time) until the reveal.
 */
import { BALAD_COUNTRIES, type BaladCountry } from './balad-countries';

export type BaladRegion = 'world' | 'arab' | 'europe' | 'asia' | 'americas';

export const BALAD_ROUNDS = [5, 8, 10] as const;
/** seconds between two clues */
export const BALAD_INTERVALS = [6, 8, 10] as const;
/** clues per country */
export const BALAD_CLUES = 6;
/** a wrong guess locks its guesser this long */
export const BALAD_LOCK_MS = 3000;
/** points of a right guess at clue 1…6 */
export const BALAD_POINTS = [60, 50, 40, 30, 20, 10] as const;
/** at most this much more, the sooner after the clue appeared */
export const BALAD_SPEED_MAX = 5;

export interface BaladSettings {
  /** 5, 8 or 10 */
  rounds: number;
  /** 6, 8 or 10 seconds between clues */
  interval: number;
  region: BaladRegion;
}

export const BALAD_DEFAULTS: BaladSettings = { rounds: 8, interval: 8, region: 'world' };

export const BALAD_REGIONS: { key: BaladRegion; label: string }[] = [
  { key: 'world', label: 'العالم' },
  { key: 'arab', label: 'العالم العربي وأفريقيا' },
  { key: 'europe', label: 'أوروبا' },
  { key: 'asia', label: 'آسيا' },
  { key: 'americas', label: 'الأمريكتان' },
];

/** The countries a region's rounds hide (and the list the guess box suggests from). */
export function baladPool(region: BaladRegion): BaladCountry[] {
  switch (region) {
    case 'world':
      return BALAD_COUNTRIES;
    case 'arab':
      return BALAD_COUNTRIES.filter((c) => c.arab || c.continent === 'africa');
    default:
      return BALAD_COUNTRIES.filter((c) => c.continent === region);
  }
}

/**
 * The points of a right guess made while clue `clue` (0-based) was the newest: the clue's value plus
 * 1…5 for the time left before the next clue (`left` of `interval` ms).
 */
export function baladPoints(clue: number, left: number, interval: number): number {
  const base = BALAD_POINTS[Math.max(0, Math.min(BALAD_CLUES - 1, clue))];
  const bonus = Math.max(1, Math.min(BALAD_SPEED_MAX, Math.ceil((BALAD_SPEED_MAX * Math.max(0, left)) / Math.max(1, interval))));
  return base + bonus;
}

export interface BaladFound {
  id: string;
  /** 1-based clue at which it was found */
  clue: number;
}

export interface BaladResult {
  id: string;
  /** 1-based clue of the right guess (null: not found) */
  clue: number | null;
  points: number;
  /** wrong guesses this round */
  wrong: number;
}

export interface BaladView {
  game: 'balad';
  phase: 'clues' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  region: BaladRegion;
  /** ms between clues */
  interval: number;
  /** the clues shown so far, in order (all six at the reveal) */
  clues: string[];
  /** when the newest clue appeared */
  clueAt: number;
  /** when the next clue appears (or the round ends, after the last one); null at the reveal */
  nextAt: number | null;
  /** the end of the round (clues) or of the reveal */
  endsAt: number | null;
  /** who found it so far, at which clue (never what they answered) */
  found: BaladFound[];
  /** my right guess: the country I named, at which clue, for how many points */
  mine: { name: string; clue: number; points: number } | null;
  /** my wrong guesses this round (country names) */
  wrong: string[];
  /** I may guess again from then */
  lockedUntil: number | null;
  /** reveal / final: the country */
  answer: { code: string; name: string; capital: string | null; flag: string | null } | null;
  results: BaladResult[] | null;
  scores: Record<string, number>;
  /** right guesses in the game */
  rights: Record<string, number>;
  players: string[];
}

export const BALAD_INFO = {
  title: 'البلد الغامض',
  tagline: 'دلائل تتوالى عن بلد مجهول… خمّنه مبكراً تربح أكثر.',
  color: '#D2554B',
  maxPlayers: 12,
  howTo: [
    'في كل جولة بلد مخفي، تظهر عنه ستة دلائل واحداً بعد الآخر، من الأصعب إلى الأسهل: طبق أو منتَج، ثم شخصية أو رياضة، ثم معلم، ثم اللغة والعملة، ثم القارة والجيران، ثم العلم وأول حرف من العاصمة.',
    'خمّن في أي لحظة على هاتفك: اكتب اسم البلد (تظهر اقتراحات أثناء الكتابة) أو اختره من القائمة.',
    'كلما كان التخمين الصحيح أبكر كانت النقاط أكثر: 60 عند الدليل الأول، ثم 50 و40 و30 و20 و10، وحتى 5 نقاط إضافية للسرعة بعد ظهور الدليل.',
    'التخمين الخاطئ لا ينقص النقاط، لكنه يوقف التخمين 3 ثوانٍ.',
    'تنتهي الجولة حين يعرف الجميع البلد أو ينتهي وقت الدليل الأخير، ثم يظهر البلد بعلمه، ونتيجة كل لاعب: عند أي دليل كانت إجابته الصحيحة.',
    'في الإعدادات: عدد الجولات (5 أو 8 أو 10)، والوقت بين دليلين (6 أو 8 أو 10 ثوانٍ)، والمنطقة.',
  ],
};
