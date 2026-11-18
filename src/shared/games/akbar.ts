/**
 * «أكبر أم أصغر؟» — higher or lower: the types shared by the server and the app (settings, the view each
 * phone gets), the default settings, the game's card on the home screen, the scoring rule (points, speed
 * bonus, streaks) and how a value is written with its unit.
 *
 * Each question shows two things of the same kind («المغرب» and «كندا») and asks which is bigger on one
 * measure («أيهما أكثر سكاناً؟»). Everyone taps a side on their own phone before the timer ends; the
 * values stay on the server until the reveal. A right answer scores 10, up to 5 more for speed, and the
 * whole is multiplied by the streak: 3 right answers in a row ×1.5, 5 in a row ×2.
 */

export const AKBAR_ROUNDS = [10, 15, 20] as const;
export const AKBAR_SECONDS = [10, 15] as const;

/** The topics of the lobby setting («منوّع» mixes them all). */
export type AkbarTopic = 'mix' | 'places' | 'nature' | 'animals' | 'landmarks' | 'sport' | 'science';
export const AKBAR_TOPICS: AkbarTopic[] = ['mix', 'places', 'nature', 'animals', 'landmarks', 'sport', 'science'];
export const AKBAR_TOPIC_LABEL: Record<AkbarTopic, string> = {
  mix: 'منوّع',
  places: 'بلدان ومدن',
  nature: 'طبيعة وجغرافيا',
  animals: 'حيوانات',
  landmarks: 'مبانٍ ومعالم',
  sport: 'رياضة',
  science: 'علوم وفضاء',
};

export interface AkbarSettings {
  /** 10, 15 or 20 questions */
  rounds: number;
  /** seconds per question: 10 or 15 */
  seconds: number;
  topic: AkbarTopic;
}

export const AKBAR_DEFAULTS: AkbarSettings = { rounds: 10, seconds: 15, topic: 'mix' };

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/** A right answer, and the most the speed adds (all of it for an instant tap, nothing at the buzzer). */
export const AKBAR_POINTS = 10;
export const AKBAR_SPEED_POINTS = 5;
/** Right answers in a row for each multiplier. */
export const AKBAR_STREAK_X15 = 3;
export const AKBAR_STREAK_X2 = 5;

/** The multiplier of a streak of `streak` right answers in a row (this one included). */
export function streakMult(streak: number): number {
  return streak >= AKBAR_STREAK_X2 ? 2 : streak >= AKBAR_STREAK_X15 ? 1.5 : 1;
}

/** The speed bonus: AKBAR_SPEED_POINTS × the share of the time left, rounded. */
export function speedBonus(ms: number, totalMs: number): number {
  const left = Math.max(0, Math.min(totalMs, totalMs - ms));
  return Math.round((AKBAR_SPEED_POINTS * left) / totalMs);
}

/** A right answer's points: (10 + speed) × the streak's multiplier, rounded. */
export function rightPoints(ms: number, totalMs: number, streak: number): number {
  return Math.round((AKBAR_POINTS + speedBonus(ms, totalMs)) * streakMult(streak));
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

export type AkbarUnit =
  | 'people'
  | 'km2'
  | 'm'
  | 'km'
  | 'kmh'
  | 'kg'
  | 'g'
  | 'year'
  | 'years'
  | 'days'
  | 'hours'
  | 'ly'
  | 'celsius'
  | 'seats'
  | 'players'
  | 'bpm'
  | 'count';

/**
 * How a unit is written after a number. `one`: after 1, 2, 11+ (and decimals); `few`: after 3–10;
 * `many`: after 11–99 (the accusative «يوماً»); `two`: after exactly 2. A year is written «1889م».
 */
const UNIT_WORDS: Record<AkbarUnit, { one: string; few?: string; many?: string; two?: string }> = {
  people: { one: 'نسمة' },
  km2: { one: 'كم²' },
  m: { one: 'م' },
  km: { one: 'كم' },
  kmh: { one: 'كم/س' },
  kg: { one: 'كغ' },
  g: { one: 'غ' },
  year: { one: 'م' },
  years: { one: 'سنة', few: 'سنوات', two: 'سنتان' },
  days: { one: 'يوم', few: 'أيام', many: 'يوماً', two: 'يومان' },
  hours: { one: 'ساعة', few: 'ساعات', two: 'ساعتان' },
  ly: { one: 'سنة ضوئية', few: 'سنوات ضوئية' },
  celsius: { one: '°م' },
  seats: { one: 'مقعد', few: 'مقاعد', many: 'مقعداً' },
  players: { one: 'لاعب', few: 'لاعبين', many: 'لاعباً', two: 'لاعبان' },
  bpm: { one: 'نبضة في الدقيقة', few: 'نبضات في الدقيقة' },
  count: { one: '' },
};

/** The unit after `v`: the plural forms only after a whole number. */
export function unitWord(v: number, unit: AkbarUnit): string {
  const w = UNIT_WORDS[unit];
  if (!Number.isInteger(v) || v >= 1e6) return w.one;
  const last = v % 100;
  if (v === 2 && w.two) return w.two;
  if (last >= 3 && last <= 10 && w.few) return w.few;
  if (last >= 11 && last <= 99 && w.many) return w.many;
  return w.one;
}

const group3 = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const trim = (x: number, d: number) => String(Number(x.toFixed(d)));

/**
 * A value as the reveal writes it: «36.8 مليون», «1.45 مليار», «8,849», «9.58», «0.05», a year as it
 * is («1889»). The unit is not included (see `formatValue`).
 */
export function formatNumber(v: number, unit: AkbarUnit): string {
  if (unit === 'year') return String(Math.round(v));
  const big = (x: number) => (x < 10 ? trim(x, 2) : x < 100 ? trim(x, 1) : group3(String(Math.round(x))));
  if (v >= 1e9) return `${big(v / 1e9)} مليار`;
  if (v >= 1e6) return `${big(v / 1e6)} مليون`;
  if (v >= 100) return group3(String(Math.round(v)));
  if (v >= 10) return trim(v, 2);
  if (v >= 1) return trim(v, 2);
  return trim(v, 4);
}

/** «36.8 مليون نسمة», «8,849 م», «1889م», «11 لاعباً», «لاعبان» (the dual says the 2 itself). */
export function formatValue(v: number, unit: AkbarUnit): string {
  if (unit === 'year') return `${formatNumber(v, unit)}م`;
  if (v === 2 && UNIT_WORDS[unit].two) return UNIT_WORDS[unit].two as string;
  const w = unit === 'people' || unit === 'km2' || v >= 1e6 ? UNIT_WORDS[unit].one : unitWord(v, unit);
  return w ? `${formatNumber(v, unit)} ${w}` : formatNumber(v, unit);
}

/* ------------------------------------------------------------------ */
/* The view                                                            */
/* ------------------------------------------------------------------ */

export type Side = 0 | 1;

export interface AkbarResult {
  id: string;
  /** the side tapped (0 = the first card, on the right), null: nothing in time */
  choice: Side | null;
  correct: boolean;
  /** the speed bonus (0 when wrong) */
  speed: number;
  /** the streak's multiplier for this answer (1 when wrong) */
  mult: number;
  points: number;
  /** right answers in a row after this question */
  streak: number;
  /** ms from the question to the tap (null: no answer) */
  ms: number | null;
}

export interface AkbarView {
  game: 'akbar';
  phase: 'ask' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  /** the kind of the two things («سكان البلدان», «قمم الجبال») */
  label: string;
  /** «أيهما أكثر سكاناً؟» */
  ask: string;
  /** the two cards (the first one on the right) */
  names: [string, string];
  /** the year the figures are from (populations, capacities, records), when they change */
  asOf: number | null;
  /** the figures are rounded estimates */
  approx: boolean;
  /** ask: the end of the timer; reveal: the next question */
  endsAt: number | null;
  timerTotal: number;
  /** who has answered this question */
  answered: string[];
  /** my own tap this question */
  mine: Side | null;
  /** reveal only: the right side, the two values, their unit, the bars (the bigger one = 1) */
  correct: Side | null;
  values: [number, number] | null;
  unit: AkbarUnit | null;
  bars: [number, number] | null;
  /** a «which is older» question: the smaller year wins */
  older: boolean;
  results: AkbarResult[] | null;
  scores: Record<string, number>;
  players: string[];
  /** right answers in a row, now */
  streaks: Record<string, number>;
  /** the longest streak of the game so far */
  best: Record<string, number>;
  /** right answers so far */
  rights: Record<string, number>;
}

export const AKBAR_INFO = {
  title: 'أكبر أم أصغر؟',
  tagline: 'سكان، مساحة، ارتفاع، سرعة… أيهما أكبر؟',
  color: '#3A8FD6',
  maxPlayers: 12,
  howTo: [
    'في كل سؤال شيئان من نوع واحد وسؤال: أيهما أكثر سكاناً؟ أيهما أعلى؟ أيهما أسرع؟ أيهما أقدم؟',
    'اضغط البطاقة التي تراها الجواب على هاتفك قبل انتهاء الوقت. لا يمكن تغيير الجواب بعد الضغط.',
    'عند الكشف تظهر القيمتان بوحداتهما، وما اختاره كل لاعب.',
    'الجواب الصحيح يعطي 10 نقاط، وحتى 5 نقاط إضافية حسب السرعة.',
    'سلسلة الإجابات الصحيحة تضاعف النقاط: 3 إجابات متتالية ×1.5، و5 متتالية ×2. الجواب الخاطئ يقطع السلسلة.',
    'الأسئلة تبدأ سهلة ثم تتقارب القيم شيئاً فشيئاً.',
    'في الإعدادات: الموضوع، و10 أو 15 أو 20 سؤالاً، و10 أو 15 ثانية لكل سؤال.',
  ],
};
