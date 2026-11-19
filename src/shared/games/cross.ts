/**
 * «الكلمات المتقاطعة» — a small Arabic crossword, new every game: the types shared by the server and the app,
 * the default settings, the game's card on the home screen and the letter rules both sides use.
 *
 * The grid (5×5 to 7×7, black cells between the words) is built at the start from a bank of common words
 * with short clues (server/cross-gen.ts, server/cross-words.ts). Across words read right to left, down
 * words top to bottom; the numbers start at the top right.
 *
 * Letters: one letter per cell, written alone. Typing and the grid use the same shapes:
 * - one alif: أ إ آ ٱ → ا;
 * - ى and ئ → ي, ؤ → و;
 * - ة and ء are letters of their own (ة ≠ ه, ء ≠ ا);
 * - the words come without the article «ال» unless it is part of a name («القدس»).
 *
 * Modes:
 * - «تعاوني» (default): one shared grid for the family, filled live by everyone (a small dot in each cell
 *   shows who wrote its letter). «تحقّق» lights the wrong letters in red for a moment (+10 seconds on the
 *   family's time). The family wins when the grid is complete and right.
 * - «سباق»: everyone gets their own copy of the same grid; a word counts once it is complete and right
 *   (its letters then lock): points = its letters, +2 for the first player to complete that word. The game
 *   ends when someone completes the whole grid (+5) or when the time runs out. Nobody sees another's grid.
 * Hints: «اكشف حرفاً» writes the right letter in a cell (3 per player; −2 points in a race).
 *
 * The server never sends the answers during play: only the shape of the grid, the numbers, the clues and
 * the letters already written; it checks the words itself.
 */

export type CrossMode = 'coop' | 'race';
export type CrossLevel = 'easy' | 'medium' | 'mixed';
export type CrossDir = 'a' | 'd';

export const CROSS_MINUTES = [0, 5, 8, 12] as const;
/** Hints («اكشف حرفاً») per player. */
export const CROSS_HINTS = 3;
/** Race: a hint costs this many points. */
export const CROSS_HINT_COST = 2;
/** Race: the first to complete a word gets this on top of its letters. */
export const CROSS_FIRST_BONUS = 2;
/** Race: the first to complete the whole grid. */
export const CROSS_FULL_BONUS = 5;
/** Co-op: «تحقّق» adds this to the family's time. */
export const CROSS_CHECK_PENALTY_MS = 10_000;
/** Co-op: wrong letters stay red this long after «تحقّق». */
export const CROSS_WRONG_MS = 2600;
/** Co-op: a new «تحقّق» only after this. */
export const CROSS_CHECK_COOLDOWN_MS = 4000;

export interface CrossSettings {
  mode: CrossMode;
  level: CrossLevel;
  /** 0 = no time limit (co-op only; a race without one gets 8 minutes) */
  minutes: number;
}

export const CROSS_DEFAULTS: CrossSettings = { mode: 'coop', level: 'mixed', minutes: 0 };

/** A race always has a time limit. */
export const crossMinutes = (s: Pick<CrossSettings, 'mode' | 'minutes'>) => (s.mode === 'race' && !s.minutes ? 8 : s.minutes);

export interface CrossClue {
  /** index in `clues` */
  id: number;
  num: number;
  dir: CrossDir;
  text: string;
  /** the cells of the word, in reading order (index = row * cols + col; col 0 is the right edge) */
  cells: number[];
}

export interface CrossProgress {
  words: number;
  /** race: the whole grid */
  done: boolean;
}

/** Race: what my last word brought (the screen shows it for a moment). */
export interface CrossGain {
  seq: number;
  clue: number;
  points: number;
  first: boolean;
}

export interface CrossFinal {
  /** coop: the grid complete and right */
  completed: boolean;
  /** race: who completed the whole grid (null: the time ran out) */
  winner: string | null;
  /** the whole grid's letters (black cells '') — only once the game is over */
  solution: string[];
  /** from the start to the end, with the penalties (coop) */
  ms: number;
  penaltyMs: number;
  hintsUsed: number;
  checks: number;
}

export interface CrossView {
  game: 'cross';
  mode: CrossMode;
  level: CrossLevel;
  phase: 'play' | 'final';
  rows: number;
  cols: number;
  /** true = a white cell */
  open: boolean[];
  /** the small number in a cell (0: none) */
  nums: number[];
  clues: CrossClue[];
  /** my grid (coop: the family's): '' = empty */
  letters: string[];
  /** coop: who wrote each letter */
  by: (string | null)[];
  /** a letter given by «اكشف حرفاً» */
  revealed: boolean[];
  /** a letter that can't change any more (a right word, or revealed) */
  locked: boolean[];
  /** per clue: who completed it (race: only my own words, as my id) */
  solved: (string | null)[];
  /** coop: the wrong cells of the last «تحقّق», red until `wrongUntil` */
  wrong: number[];
  wrongUntil: number;
  checkSeq: number;
  /** my hints left */
  hintsLeft: number;
  gain: CrossGain | null;
  /** race: everyone's words and points (never their letters) */
  progress: Record<string, CrossProgress>;
  /** coop: words completed by each one · race: points */
  scores: Record<string, number>;
  /** coop: words completed by each one */
  words: Record<string, number>;
  startedAt: number;
  endsAt: number | null;
  timerTotal: number;
  penaltyMs: number;
  final: CrossFinal | null;
  players: string[];
}

/* ------------------------------------------------------------------ */
/* Letters                                                             */
/* ------------------------------------------------------------------ */

/** The 30 keys: 28 letters, ة and ء. */
export const CROSS_KEYS = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهويةء'];
const KEY_SET = new Set(CROSS_KEYS);
const SHAPE: Record<string, string> = { أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا', ى: 'ي', ئ: 'ي', ؤ: 'و', ی: 'ي', ک: 'ك', ڤ: 'ف', پ: 'ب', ڭ: 'ك', گ: 'ك', ݣ: 'ك' };

/** A typed character → the letter of a cell (null: not a letter of the grid). */
export function crossLetter(ch: string): string | null {
  const k = SHAPE[ch] ?? ch;
  return KEY_SET.has(k) ? k : null;
}

/** A word → its cells' letters (diacritics, tatweel and spaces dropped). */
export function crossLetters(word: string): string[] {
  return [...word.replace(/[ً-ْٰـ\s]/g, '')].map((c) => crossLetter(c) ?? c);
}

/** The key of a word (its letters joined). */
export const crossKey = (word: string) => crossLetters(word).join('');

/** Shown under the grid: the shapes that are one letter. */
export const CROSS_KEY_RULE = 'أ إ آ ← ا · ى ئ ← ي · ؤ ← و · ة وء حرفان مستقلان';

export const CROSS_MODE_LABEL: Record<CrossMode, string> = { coop: 'تعاوني', race: 'سباق' };
export const CROSS_LEVEL_LABEL: Record<CrossLevel, string> = { easy: 'سهل', medium: 'متوسط', mixed: 'مزيج' };

export const CROSS_INFO = {
  title: 'الكلمات المتقاطعة',
  tagline: 'شبكة كلمات عربية صغيرة: حلّوها معاً أو تسابقوا عليها.',
  color: '#4A7BD9',
  maxPlayers: 8,
  howTo: [
    'شبكة صغيرة جديدة في كل لعبة، بين خمس وسبع خانات في كل جهة. لكل كلمة رقم وتعريف قصير: الكلمات الأفقية تُقرأ من اليمين إلى اليسار، والعمودية من الأعلى إلى الأسفل، والترقيم يبدأ من أعلى اليمين.',
    'المس خانة لتختارها، والمسها مرة ثانية لتنتقل بين الأفقي والعمودي، أو المس تعريفاً لتختار كلمته. التعريف الحالي فوق الشبكة. اكتب بلوحة الحروف التي على الشاشة، أو بلوحة مفاتيح الحاسوب.',
    'في كل خانة حرف واحد. الهمزات على الألف حرف واحد هو «ا»، و«ى» و«ئ» تُكتبان «ي»، و«ؤ» تُكتب «و»، أما «ة» و«ء» فحرفان مستقلان. والكلمات بلا «ال» التعريف إلا إذا كانت جزءاً من الاسم مثل «القدس».',
    '«تعاوني»: شبكة واحدة للعائلة، يكتب فيها الجميع معاً، ونقطة صغيرة بلون كل لاعب تبيّن من كتب الحرف. زر «تحقّق» يلوّن الحروف الخاطئة بالأحمر لحظة، ويضيف 10 ثوانٍ إلى وقت العائلة. الفوز للجميع حين تكتمل الشبكة صحيحة.',
    '«سباق»: لكل لاعب نسخة من الشبكة نفسها، ولا يرى أحد حروف غيره. الكلمة تُحسب حين تكتمل صحيحة فتُقفل حروفها: نقاطها عدد حروفها، و2 إضافيتان لأول من يكملها. تنتهي اللعبة حين يكمل أحدهم الشبكة كلها (5 نقاط إضافية) أو حين ينتهي الوقت.',
    '«اكشف حرفاً» يكتب الحرف الصحيح في الخانة المختارة: 3 مرات لكل لاعب، وكل مرة تكلّف نقطتين في السباق.',
    'في الإعدادات: الوضع، والصعوبة (سهل، متوسط، مزيج)، والوقت (5 أو 8 أو 12 دقيقة، وبلا وقت في الوضع التعاوني).',
  ],
};
