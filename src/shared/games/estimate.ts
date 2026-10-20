/**
 * «كم تقدّر؟» — estimation: the types shared by the server and the app (settings, the view each phone
 * gets), the default settings, the game's card on the home screen, and the number helpers both sides
 * need (reading a typed number with Arabic-Indic digits, writing a big number in words).
 *
 * Each round is a question whose answer is a number. Everyone types a number on their own phone before
 * the timer ends; the true answer never leaves the server before the reveal. The closest guesses score
 * 3 / 2 / 1 (equal distances share a place), an exact guess (or within 1% when the answer is
 * approximate) earns 2 more. The reveal shows every guess on a number line with the true answer.
 */

export const ESTIMATE_ROUNDS = [5, 10, 15] as const;
export const ESTIMATE_SECONDS = [20, 30, 45] as const;

export interface EstimateSettings {
  /** 5, 10 or 15 */
  rounds: number;
  /** seconds per question: 20, 30 or 45 */
  seconds: number;
}

export const ESTIMATE_DEFAULTS: EstimateSettings = { rounds: 10, seconds: 30 };

/** The themes of the questions (the label above each one). */
export type EstimateCat = 'morocco' | 'arab' | 'islam' | 'science' | 'space' | 'body' | 'nature' | 'geo' | 'animals' | 'sport' | 'life';

export const ESTIMATE_CAT_LABEL: Record<EstimateCat, string> = {
  morocco: 'المغرب',
  arab: 'العالم العربي',
  islam: 'تاريخ إسلامي',
  science: 'علوم',
  space: 'الفضاء',
  body: 'جسم الإنسان',
  nature: 'الطبيعة',
  geo: 'جغرافيا',
  animals: 'الحيوانات',
  sport: 'رياضة',
  life: 'الحياة اليومية',
};

/** Points by place among the guesses (closest first), and the bonus for an exact guess. */
export const ESTIMATE_PLACE_POINTS = [3, 2, 1];
export const ESTIMATE_EXACT_BONUS = 2;
/** An approximate answer is «exact» within this share of it. */
export const ESTIMATE_EXACT_SHARE = 0.01;
/** The longest number a phone may send (digits, without the decimal point). */
export const ESTIMATE_MAX_DIGITS = 12;

export interface EstimateResult {
  id: string;
  /** what they typed (null: nothing in time) */
  guess: number | null;
  /** |guess − answer| (null: no guess) */
  diff: number | null;
  /** 1 = closest (equal distances share a place); null: no guess */
  place: number | null;
  exact: boolean;
  points: number;
}

export interface EstimateView {
  game: 'estimate';
  phase: 'ask' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  label: string;
  question: string;
  /** what the number counts («متر», «نسمة»…) */
  unit: string;
  /** a year: the unit (م / هـ) is written after the number, without thousands separators */
  year: boolean;
  /** the answer is approximate («تقريباً») */
  approx: boolean;
  /** ask: the end of the timer; reveal: the next round */
  endsAt: number | null;
  timerTotal: number;
  /** who has sent a guess this round */
  answered: string[];
  /** my own guess this round */
  mine: number | null;
  /** reveal / final: the true answer and the «did you know» line */
  answer: number | null;
  fact: string | null;
  results: EstimateResult[] | null;
  scores: Record<string, number>;
  players: string[];
  /** the game's best guesses: how many rounds each one won (closest) */
  wins: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

const DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * A typed number as a phone may write it: Western, Arabic-Indic (٠-٩) or Persian (۰-۹) digits, the
 * Arabic decimal mark «٫» or a dot, thousands separators («,» «٬» spaces) ignored. Null when it isn't a
 * non-negative number of at most ESTIMATE_MAX_DIGITS digits.
 */
export function parseGuess(raw: string): number | null {
  let s = raw.trim().replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d] ?? d);
  s = s.replace(/[\s,٬'_٬  ⁦-⁩]/g, '').replace(/[٫،]/g, '.');
  if (!/^\d+(\.\d+)?$/.test(s) && !/^\.\d+$/.test(s)) return null;
  if (s.replace('.', '').length > ESTIMATE_MAX_DIGITS) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** «37,000,000», «29.5»; a year stays as it is («1956»). */
export function formatNumber(n: number, year = false): string {
  if (year) return String(Math.round(n));
  const [int, dec] = String(Math.round(n * 1000) / 1000).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec ? `${grouped}.${dec}` : grouped;
}

/** A big number in words, to help read what was typed: «37 مليون», «2.5 مليار», «150 ألف». */
export function numberWords(n: number): string | null {
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  if (n >= 1e12) return `${fmt(n / 1e12)} تريليون`;
  if (n >= 1e9) return `${fmt(n / 1e9)} مليار`;
  if (n >= 1e6) return `${fmt(n / 1e6)} مليون`;
  if (n >= 1e4) return `${fmt(n / 1e3)} ألف`;
  return null;
}

/** «210 متر», «1956 م». */
export function withUnit(n: number, unit: string, year = false): string {
  return `${formatNumber(n, year)} ${unit}`;
}

/** How far a guess is from the answer, as a share of it (0.12 = 12%); null when the answer is 0. */
export function relativeError(guess: number, answer: number): number | null {
  return answer === 0 ? null : Math.abs(guess - answer) / Math.abs(answer);
}

export const ESTIMATE_INFO = {
  title: 'كم تقدّر؟',
  tagline: 'سؤال جوابه رقم: من يقترب أكثر من الجواب الصحيح؟',
  color: '#E0892B',
  maxPlayers: 12,
  howTo: [
    'في كل جولة سؤال جوابه عدد: ارتفاع، مسافة، سنة، عدد… مثل: كم ارتفاع صومعة مسجد الحسن الثاني بالمتر؟',
    'اكتب تقديرك على هاتفك بلوحة الأرقام قبل انتهاء الوقت. لا يرى أحد تقديرات الآخرين قبل الكشف.',
    'عند الكشف تظهر كل التقديرات على خط الأعداد مع الجواب الصحيح ومعلومة قصيرة.',
    'الأقرب إلى الجواب يأخذ 3 نقاط، والثاني نقطتين، والثالث نقطة. الإصابة بالضبط تضيف نقطتين (وفي الأجوبة التقريبية: الفرق أقل من 1%).',
    'في الإعدادات: 5 أو 10 أو 15 سؤالاً، و20 أو 30 أو 45 ثانية لكل سؤال.',
  ],
};
