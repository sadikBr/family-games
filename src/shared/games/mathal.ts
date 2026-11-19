/**
 * «أكمل المثل» — finish the proverb: the types shared by the server and the app. Each round shows the
 * beginning of a proverb and everyone completes it at the same time on their own phone: one of four
 * endings, or the ending typed («اكتب البقية», compared tolerantly: diacritics, hamza shapes, small slips,
 * a missing word or two). The reveal shows the whole proverb, its meaning in one فصحى sentence and what
 * everyone answered. The ending never leaves the server before the reveal (in typed mode no option either).
 */

/** Where a proverb comes from: classical Arabic, or Moroccan (written in Darija). */
export type MathalSource = 'fusha' | 'darija';
export type MathalSourceSetting = MathalSource | 'mixed';
export type MathalMode = 'options' | 'typed';

export const MATHAL_ROUNDS = [8, 12, 15] as const;
/** seconds to answer each round */
export const MATHAL_SECONDS = [15, 25] as const;

export interface MathalSettings {
  /** 8, 12 or 15 */
  rounds: number;
  /** 15 or 25 */
  seconds: number;
  mode: MathalMode;
  source: MathalSourceSetting;
}

export const MATHAL_DEFAULTS: MathalSettings = { rounds: 8, seconds: 15, mode: 'options', source: 'mixed' };

export const MATHAL_MODES: { key: MathalMode; label: string }[] = [
  { key: 'options', label: 'أربعة اختيارات' },
  { key: 'typed', label: 'اكتب البقية' },
];

export const MATHAL_SOURCES: { key: MathalSourceSetting; label: string }[] = [
  { key: 'fusha', label: 'أمثال عربية (فصحى)' },
  { key: 'darija', label: 'أمثال مغربية' },
  { key: 'mixed', label: 'منوّعة' },
];

export const MATHAL_SOURCE_LABEL: Record<MathalSource, string> = { fusha: 'مثل عربي', darija: 'مثل مغربي' };

/** A right option, or a typed ending that is right but for a missing word or two. */
export const MATHAL_POINTS = 10;
/** A typed ending that is complete (small slips allowed). */
export const MATHAL_TYPED_POINTS = 15;
/** Up to this much more for speed (all of it at once, nothing at the last second). */
export const MATHAL_SPEED_POINTS = 5;

/** exact: right (typed: complete); close: typed, right but a word or two missing; wrong; none: no answer. */
export type MathalGrade = 'exact' | 'close' | 'wrong' | 'none';

/** The round's points: the base for the grade, plus the speed bonus (time left / total). */
export function mathalPoints(grade: MathalGrade, typed: boolean, ms: number, totalMs: number): number {
  if (grade !== 'exact' && grade !== 'close') return 0;
  const base = typed && grade === 'exact' ? MATHAL_TYPED_POINTS : MATHAL_POINTS;
  const left = Math.max(0, Math.min(totalMs, totalMs - ms));
  return base + Math.round((MATHAL_SPEED_POINTS * left) / totalMs);
}

export interface MathalResult {
  id: string;
  /** the option tapped (options mode; null: nothing in time) */
  choice: number | null;
  /** what was typed (typed mode; null: nothing in time) */
  text: string | null;
  grade: MathalGrade;
  points: number;
  /** the fastest right answer of the round */
  fastest: boolean;
}

export interface MathalView {
  game: 'mathal';
  phase: 'ask' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  mode: MathalMode;
  /** where this proverb comes from (shown as its label) */
  source: MathalSource;
  /** the beginning shown to everyone */
  start: string;
  /** options mode: the four endings (null in typed mode, which never sends them) */
  options: string[] | null;
  endsAt: number | null;
  timerTotal: number;
  /** who has answered (never what) */
  answered: string[];
  myChoice: number | null;
  myText: string | null;
  /** reveal / final only */
  correct: number | null;
  end: string | null;
  meaning: string | null;
  results: MathalResult[] | null;
  scores: Record<string, number>;
  players: string[];
  /** right answers so far */
  rights: Record<string, number>;
}

export const MATHAL_INFO = {
  title: 'أكمل المثل',
  tagline: 'بداية مثل عربي أو مغربي… من يكمله أولاً؟',
  color: '#8E5BD0',
  maxPlayers: 12,
  howTo: [
    'تظهر بداية مثل على كل الشاشات، ويكمله الجميع في الوقت نفسه كلٌّ على هاتفه.',
    '«أربعة اختيارات»: اختر النهاية الصحيحة. «اكتب البقية»: اكتب نهاية المثل بنفسك، والتشكيل والهمزات والأخطاء الصغيرة ونقص كلمة أو كلمتين مقبولة.',
    'الإجابة الصحيحة تعطي 10 نقاط، والنهاية المكتوبة كاملة تعطي 15، وحتى 5 نقاط إضافية حسب السرعة.',
    'بعد كل جولة يظهر المثل كاملاً مع معناه، وما أجاب به كل واحد.',
    'في الإعدادات: عدد الجولات (8 أو 12 أو 15)، ووقت الجواب (15 أو 25 ثانية)، وطريقة اللعب، والمصدر: أمثال عربية بالفصحى، أو أمثال مغربية بالدارجة مع معناها بالفصحى، أو منوّعة.',
  ],
};
