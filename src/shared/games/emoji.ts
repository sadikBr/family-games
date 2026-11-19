/**
 * «خمّن من الإيموجي» — the types shared by the server and the app, the settings and the scoring rule.
 *
 * Each round shows a short row of emojis that stands for something in a category (a proverb, a film, a dish,
 * a city…). Everyone answers at the same time on their own phone: a typed answer (forgiving: «ال», hamza
 * shapes, small typos, accepted alternatives) or one of four options (lobby setting). Halfway through the
 * time a hint appears (typed: the number of words and the first letter; options: two wrong options go
 * away) and answers after it score half. The reveal shows the answer with a one-line explanation.
 * The answer, the alternatives and the right option never leave the server before the reveal.
 */

export type EmojiCategory = 'proverbs' | 'movies' | 'food' | 'places' | 'jobs' | 'animals' | 'home' | 'sports';
export type EmojiCategoryPick = 'mix' | EmojiCategory;
export type EmojiMode = 'typed' | 'options';

export const EMOJI_ROUNDS = [8, 12, 15] as const;
export const EMOJI_SECONDS = [20, 30] as const;

export interface EmojiSettings {
  /** 8, 12 or 15 */
  rounds: number;
  /** seconds per puzzle: 20 or 30 */
  seconds: number;
  mode: EmojiMode;
  /** «منوّع» or one category */
  category: EmojiCategoryPick;
}

export const EMOJI_DEFAULTS: EmojiSettings = { rounds: 12, seconds: 30, mode: 'typed', category: 'mix' };

export const EMOJI_CATEGORIES: { key: EmojiCategory; label: string; icon: string }[] = [
  { key: 'proverbs', label: 'أمثال وحكم', icon: '📜' },
  { key: 'movies', label: 'أفلام ومسلسلات', icon: '🎬' },
  { key: 'food', label: 'أكلات', icon: '🍲' },
  { key: 'places', label: 'مدن وبلدان', icon: '🌍' },
  { key: 'jobs', label: 'مهن', icon: '🧰' },
  { key: 'animals', label: 'حيوانات', icon: '🐾' },
  { key: 'home', label: 'أشياء في البيت', icon: '🏠' },
  { key: 'sports', label: 'رياضات', icon: '🏅' },
];

export const EMOJI_CATEGORY_PICKS: { key: EmojiCategoryPick; label: string }[] = [
  { key: 'mix', label: 'منوّع' },
  ...EMOJI_CATEGORIES.map(({ key, label }) => ({ key, label })),
];

export const EMOJI_MODES: { key: EmojiMode; label: string }[] = [
  { key: 'typed', label: 'كتابة الجواب' },
  { key: 'options', label: 'أربعة اختيارات' },
];

export const emojiCategoryLabel = (c: EmojiCategory) => EMOJI_CATEGORIES.find((x) => x.key === c)?.label ?? '';
export const emojiCategoryIcon = (c: EmojiCategory) => EMOJI_CATEGORIES.find((x) => x.key === c)?.icon ?? '';

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/** a right answer */
export const EMOJI_POINTS = 10;
/** more for a right answer in the typed mode */
export const EMOJI_TYPED_BONUS = 5;
/** the speed bonus at most (an instant answer), shrinking with the time left */
export const EMOJI_SPEED_MAX = 5;

/**
 * The points of an answer: 10 (+5 typed) + up to 5 for speed; half (rounded up) once the hint is out.
 * `ms` = time since the puzzle appeared, `totalMs` = the whole time, `afterHint` = sent after the hint.
 */
export function emojiPoints(correct: boolean, mode: EmojiMode, ms: number, totalMs: number, afterHint: boolean): number {
  if (!correct) return 0;
  const left = Math.max(0, Math.min(totalMs, totalMs - ms));
  const full = EMOJI_POINTS + (mode === 'typed' ? EMOJI_TYPED_BONUS : 0) + Math.round((EMOJI_SPEED_MAX * left) / totalMs);
  return afterHint ? Math.ceil(full / 2) : full;
}

/* ------------------------------------------------------------------ */
/* The view                                                            */
/* ------------------------------------------------------------------ */

/** The hint, sent only once it is out (halfway). */
export interface EmojiHint {
  /** a short clue written with the puzzle («عن الانتظار») */
  text: string;
  /** typed mode: how many words the answer has */
  words: number | null;
  /** typed mode: its first letter (after «ال» when it starts with it) */
  letter: string | null;
  /** whether the answer starts with «ال» (the letter is the one after it) */
  al: boolean;
  /** options mode: the two wrong options taken away */
  removed: number[];
}

export interface EmojiResult {
  id: string;
  /** typed mode: what they wrote (null: nothing in time) */
  text: string | null;
  /** options mode: the option they tapped (null: nothing in time) */
  choice: number | null;
  correct: boolean;
  /** sent after the hint (half points) */
  late: boolean;
  points: number;
}

export interface EmojiView {
  game: 'emoji';
  phase: 'ask' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  mode: EmojiMode;
  category: EmojiCategory;
  emojis: string;
  /** options mode: the four options (null in the typed mode) */
  options: string[] | null;
  endsAt: number | null;
  timerTotal: number;
  /** when the hint comes out (ask phase) */
  hintAt: number | null;
  hint: EmojiHint | null;
  /** who has sent an answer (never what, nor whether it is right, before the reveal) */
  answered: string[];
  /** my own answer, as sent */
  myText: string | null;
  myChoice: number | null;
  /** reveal / final only */
  answer: string | null;
  explanation: string | null;
  correct: number | null;
  results: EmojiResult[] | null;
  scores: Record<string, number>;
  players: string[];
  /** right answers so far */
  rights: Record<string, number>;
}

export const EMOJI_INFO = {
  title: 'خمّن من الإيموجي',
  tagline: 'أمثال وأفلام وأكلات مكتوبة بالإيموجي… فكّوا الرموز!',
  color: '#E9A21F',
  maxPlayers: 12,
  howTo: [
    'في كل جولة تظهر مجموعة إيموجي ترمز إلى شيء من فئة معروفة: مثل أو حكمة، فيلم أو مسلسل، أكلة، مدينة أو بلد، مهنة، حيوان، شيء في البيت، أو رياضة.',
    'الجميع يجيب في الوقت نفسه، كل واحد على هاتفه: بكتابة الجواب، أو باختيار واحد من أربعة اختيارات (حسب الإعدادات).',
    'في الكتابة تُقبل الأخطاء الإملائية الصغيرة، ولا فرق بين «ال» وبدونها ولا بين أشكال الهمزة، وتُقبل الأسماء الأخرى المعروفة للجواب.',
    'في منتصف الوقت يظهر تلميح: عدد الكلمات وأول حرف، أو حذف اختيارين خاطئين.',
    'الجواب الصحيح: 10 نقاط (و15 في وضع الكتابة)، وحتى 5 نقاط إضافية للسرعة. بعد ظهور التلميح: نصف النقاط.',
    'بعد كل جولة يظهر الجواب مع شرح قصير للإيموجي.',
    'في الإعدادات: عدد الجولات (8 أو 12 أو 15)، والوقت (20 أو 30 ثانية)، وطريقة الإجابة، والفئة: منوّع أو فئة واحدة.',
  ],
};
