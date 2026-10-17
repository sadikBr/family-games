/**
 * «ابنِ المسجد» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * A cooperative game: everyone answers the same question on their own phone; every right answer adds
 * bricks, and enough bricks finish the next piece of a Moroccan-style mosque. Finish all the pieces
 * before the rounds run out.
 */

export type MosqueLevel = 'easy' | 'normal' | 'hard';

export interface MosqueSettings {
  level: MosqueLevel;
  /** seconds to answer each question */
  seconds: number;
}

/** The pieces, in building order. */
export const MOSQUE_PIECES = [
  { key: 'base', label: 'الأساس' },
  { key: 'walls', label: 'الجدران' },
  { key: 'court', label: 'الصحن والزليج' },
  { key: 'arches', label: 'الأقواس' },
  { key: 'mihrab', label: 'المحراب' },
  { key: 'minbar', label: 'المنبر' },
  { key: 'dome', label: 'القبة' },
  { key: 'minaret', label: 'الصومعة' },
  { key: 'fountain', label: 'النافورة' },
] as const;

export type MosquePiece = (typeof MOSQUE_PIECES)[number]['key'];

/** How many question rounds the family gets to build the nine pieces. */
export const MOSQUE_ROUNDS: Record<MosqueLevel, number> = { easy: 20, normal: 15, hard: 12 };

/** Bricks for one right answer, plus a bonus for answering in the first half of the timer. */
export const MOSQUE_BRICKS_RIGHT = 3;
export const MOSQUE_BRICKS_FAST = 1;
/** One piece costs this many bricks per player (so a full, fast, right round builds one piece). */
export const MOSQUE_BRICKS_PER_PLAYER = MOSQUE_BRICKS_RIGHT + MOSQUE_BRICKS_FAST;

export interface MosqueResult {
  id: string;
  choice: number | null;
  correct: boolean;
  fast: boolean;
  bricks: number;
}

export interface MosqueView {
  game: 'mosque';
  phase: 'ask' | 'reveal' | 'final';
  level: MosqueLevel;
  /** 1-based */
  round: number;
  rounds: number;
  label: string;
  text: string;
  options: string[];
  endsAt: number | null;
  timerTotal: number;
  participants: string[];
  answered: string[];
  myAnswer: number | null;
  correct: number | null;
  results: MosqueResult[] | null;
  /** how many pieces are finished */
  built: number;
  /** bricks laid towards the next piece */
  bricks: number;
  /** bricks one piece needs */
  cost: number;
  /** pieces finished at this reveal (for the celebration) */
  justBuilt: number[];
  /** bricks earned at this reveal */
  earned: number;
  /** per player: right answers and bricks */
  stats: Record<string, { right: number; bricks: number }>;
  /** at the end: true when the mosque was finished */
  completed: boolean | null;
}

export const MOSQUE_DEFAULTS: MosqueSettings = { level: 'normal', seconds: 20 };

export const MOSQUE_INFO = {
  title: 'ابنِ المسجد',
  tagline: 'أجيبوا معاً وابنوا المسجد قطعة قطعة.',
  color: '#2FA57A',
  maxPlayers: 8,
  howTo: [
    'لعبة تعاونية: العائلة كلها تبني مسجداً مغربياً واحداً، من الأساس إلى الصومعة والنافورة.',
    'في كل جولة سؤال إسلامي يجيب عنه كل واحد من هاتفه قبل انتهاء الوقت.',
    'كل جواب صحيح يضيف 3 طوبات، وطوبة إضافية لمن أجاب صحيحاً في النصف الأول من الوقت. حين تكتمل طوبات القطعة تُبنى القطعة التالية.',
    'عدد الجولات محدود حسب المستوى: سهل 20، عادي 15، صعب 12. أكملوا القطع التسع قبل أن تنتهي الجولات.',
    'البوتات زملاء في الفريق تجيب معكم، لكنها لا تستعجل: تترك لكم الوقت أولاً.',
  ],
};
