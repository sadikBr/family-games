/**
 * «مكية أم مدنية؟» — surahs come one after another; everyone taps «مكية» or «مدنية» on their own phone (one
 * tap, fast). The types shared by the server and the app (settings, the view each phone gets), the default
 * settings, the game's card on the home screen and the scoring rule.
 *
 * Question types («نوع الأسئلة»): «مكية أم مدنية» (two buttons), «في أي جزء تبدأ؟» (four juz' numbers), or
 * «منوّع» (both, plus «كم عدد آياتها؟» with four counts). A right answer scores 10, up to 5 more for speed,
 * and the whole is multiplied by the streak: 3 right answers in a row ×1.5, 5 in a row ×2. The answer and
 * the surah's facts stay on the server until the reveal. The surah data: server/makki-data.ts.
 */

export const MAKKI_ROUNDS = [10, 15, 20] as const;
/** seconds for the tap question; the multiple-choice ones get MAKKI_MCQ_EXTRA more */
export const MAKKI_SECONDS = [8, 12] as const;
export const MAKKI_MCQ_EXTRA = 5;

export type MakkiMode = 'type' | 'juz' | 'mix';
export const MAKKI_MODES: MakkiMode[] = ['type', 'juz', 'mix'];
export const MAKKI_MODE_LABEL: Record<MakkiMode, string> = {
  type: 'مكية أم مدنية',
  juz: 'في أي جزء تبدأ؟',
  mix: 'منوّع',
};

export type MakkiScope = 'all' | 'amma';
export const MAKKI_SCOPES: MakkiScope[] = ['all', 'amma'];
export const MAKKI_SCOPE_LABEL: Record<MakkiScope, string> = {
  all: 'كل القرآن',
  amma: 'جزء عمّ',
};

/** The kind of one question. */
export type MakkiKind = 'type' | 'juz' | 'ayat';

export interface MakkiSettings {
  /** 10, 15 or 20 surahs */
  rounds: number;
  /** seconds for «مكية أم مدنية»: 8 or 12 (+5 for the multiple-choice questions) */
  seconds: number;
  mode: MakkiMode;
  scope: MakkiScope;
}

export const MAKKI_DEFAULTS: MakkiSettings = { rounds: 10, seconds: 8, mode: 'type', scope: 'all' };

/** The kinds a game can ask: in جزء عمّ every surah begins in juz' 30, so the juz' question gives way to the verses. */
export function makkiKinds(mode: MakkiMode, scope: MakkiScope): MakkiKind[] {
  if (mode === 'type') return ['type'];
  if (mode === 'juz') return scope === 'amma' ? ['ayat'] : ['juz'];
  return scope === 'amma' ? ['type', 'ayat'] : ['type', 'juz', 'ayat'];
}

/** The seconds of one question of this kind. */
export const makkiSeconds = (kind: MakkiKind, seconds: number): number => (kind === 'type' ? seconds : seconds + MAKKI_MCQ_EXTRA);

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

export const MAKKI_POINTS = 10;
export const MAKKI_SPEED_POINTS = 5;
export const MAKKI_STREAK_X15 = 3;
export const MAKKI_STREAK_X2 = 5;

/** The multiplier of a streak of `streak` right answers in a row (this one included). */
export function makkiMult(streak: number): number {
  return streak >= MAKKI_STREAK_X2 ? 2 : streak >= MAKKI_STREAK_X15 ? 1.5 : 1;
}

/** The speed bonus: 5 × the share of the time left, rounded. */
export function makkiSpeed(ms: number, totalMs: number): number {
  const left = Math.max(0, Math.min(totalMs, totalMs - ms));
  return Math.round((MAKKI_SPEED_POINTS * left) / totalMs);
}

/** A right answer's points: (10 + speed) × the streak's multiplier, rounded. */
export function makkiPoints(ms: number, totalMs: number, streak: number): number {
  return Math.round((MAKKI_POINTS + makkiSpeed(ms, totalMs)) * makkiMult(streak));
}

/** «3 آيات», «11 آية», «286 آية» (the number is written in digits; a surah has at least 3 verses). */
export function ayatLabel(v: number): string {
  if (v === 1) return 'آية واحدة';
  if (v === 2) return 'آيتان';
  const last = v % 100;
  return `${v} ${last >= 3 && last <= 10 ? 'آيات' : 'آية'}`;
}

/** «الجزء 12» */
export const juzLabel = (j: number): string => `الجزء ${j}`;

/* ------------------------------------------------------------------ */
/* The view                                                            */
/* ------------------------------------------------------------------ */

/** What the reveal shows about the surah (never sent before the reveal). */
export interface MakkiCard {
  madani: boolean;
  /** verses (Kufan count) */
  ayat: number;
  /** the juz' where it begins */
  juz: number;
  /** the meaning of the name / why it is called so (absent when not well established) */
  why: string | null;
  /** one main theme, one sentence */
  theme: string | null;
  /** «على ما في مصحف المدينة؛ وفيها خلاف» when its classification is disputed, else null */
  note: string | null;
}

export interface MakkiResult {
  id: string;
  /** the option tapped, null: nothing in time */
  choice: number | null;
  correct: boolean;
  speed: number;
  mult: number;
  points: number;
  /** right answers in a row after this question */
  streak: number;
  ms: number | null;
}

export interface MakkiView {
  game: 'makki';
  phase: 'ask' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  kind: MakkiKind;
  /** the surah: its number in the Mushaf and its name (without «سورة») */
  n: number;
  name: string;
  /** the question («مكية أم مدنية؟», «في أي جزء تبدأ؟», «كم عدد آياتها؟») */
  ask: string;
  options: string[];
  /** ask: the end of the timer; reveal: the next surah */
  endsAt: number | null;
  timerTotal: number;
  answered: string[];
  mine: number | null;
  /** reveal only */
  correct: number | null;
  card: MakkiCard | null;
  results: MakkiResult[] | null;
  scores: Record<string, number>;
  players: string[];
  streaks: Record<string, number>;
  best: Record<string, number>;
  rights: Record<string, number>;
}

export const MAKKI_ASK: Record<MakkiKind, string> = {
  type: 'مكية أم مدنية؟',
  juz: 'في أي جزء تبدأ؟',
  ayat: 'كم عدد آياتها؟',
};

export const MAKKI_INFO = {
  title: 'مكية أم مدنية؟',
  tagline: 'سور تتوالى بسرعة… مكية أم مدنية؟ ومع كل سورة فائدة.',
  color: '#2E9E6B',
  maxPlayers: 12,
  howTo: [
    'يظهر اسم سورة ورقمها في المصحف على كل الهواتف.',
    'اضغط «مكية» أو «مدنية» قبل انتهاء الوقت. لا يمكن تغيير الجواب بعد الضغط.',
    'الجواب الصحيح يعطي 10 نقاط، وحتى 5 نقاط إضافية حسب السرعة.',
    'سلسلة الإجابات الصحيحة تضاعف النقاط: 3 إجابات متتالية ×1.5، و5 متتالية ×2. الجواب الخاطئ يقطع السلسلة.',
    'عند الكشف تظهر بطاقة السورة: عدد آياتها، وترتيبها في المصحف، والجزء الذي تبدأ فيه، وسبب تسميتها، وموضوعها.',
    'التصنيف على ما في مصحف المدينة النبوية برواية حفص، وعدد الآيات بالعدّ الكوفي.',
    'في الإعدادات: نوع الأسئلة (مكية أم مدنية، أو في أي جزء تبدأ؟، أو منوّع يضم أيضاً عدد الآيات)، والنطاق (كل القرآن أو جزء عمّ)، و10 أو 15 أو 20 سورة، و8 أو 12 ثانية (وخمس ثوانٍ زيادة لأسئلة الاختيار).',
  ],
};
