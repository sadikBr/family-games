/**
 * «حروف مبعثرة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * The grid is size×size cells, row by row: cell (r, c) → r·size + c. A word is a path of cells, each
 * one touching the previous one (8 directions), every cell used at most once.
 */

export type BoggleLevel = 'easy' | 'medium' | 'hard';

export interface BoggleSettings {
  rounds: number;
  /** 4 → 4×4, 5 → 5×5 */
  size: number;
  /** 120 or 180 */
  seconds: number;
  /** words found by two players or more score nothing (off: every word counts — for kids) */
  unique: boolean;
  /** how many words the bots found (old apps still send it; the bots now follow the room's bot level) */
  level: BoggleLevel;
}

export const BOGGLE_SIZES = [4, 5] as const;
export const BOGGLE_SECONDS = [120, 180] as const;
export const BOGGLE_MIN_LEN = 3;

export interface BoggleFound {
  word: string;
  path: number[];
  points: number;
}

export interface BoggleResultWord extends BoggleFound {
  /** someone else found it too (scores 0 when the «unique» rule is on) */
  shared: boolean;
}

export interface BoggleResult {
  id: string;
  words: BoggleResultWord[];
  points: number;
}

export interface BoggleView {
  game: 'boggle';
  phase: 'play' | 'reveal' | 'final';
  round: number;
  rounds: number;
  size: number;
  grid: string[];
  unique: boolean;
  /** everyone who plays (in seat order) and their names, kept for players who left */
  players: string[];
  names: Record<string, string>;
  /** my words this round (points before the shared-words rule) */
  myWords: BoggleFound[];
  /** I pressed «انتهيت» */
  done: boolean;
  /** the others: how many words so far (the words stay hidden until the end of the round) */
  others: { id: string; count: number; done: boolean }[];
  endsAt: number | null;
  timerTotal: number;
  /** after a round: everyone's words */
  results: BoggleResult[] | null;
  /** the best everyday word in the grid nobody found */
  missed: BoggleFound | null;
  /** everyday words hidden in this grid */
  possible: number;
  scores: Record<string, number>;
}

/** Classic points by length: 3–4 letters 1, 5 → 2, 6 → 3, 7 → 5, 8+ → 11. */
export function boggleWordPoints(len: number): number {
  if (len < BOGGLE_MIN_LEN) return 0;
  if (len <= 4) return 1;
  if (len === 5) return 2;
  if (len === 6) return 3;
  if (len === 7) return 5;
  return 11;
}

/** Do two cells of a size×size grid touch (8 directions)? */
export function boggleAdjacent(size: number, a: number, b: number): boolean {
  if (a === b) return false;
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const dc = Math.abs((a % size) - (b % size));
  return dr <= 1 && dc <= 1;
}

/** A path of distinct, touching cells inside the grid? */
export function boggleValidPath(size: number, path: readonly number[]): boolean {
  const n = size * size;
  const seen = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    if (!Number.isInteger(c) || c < 0 || c >= n || seen.has(c)) return false;
    if (i > 0 && !boggleAdjacent(size, path[i - 1], c)) return false;
    seen.add(c);
  }
  return true;
}

export const BOGGLE_DEFAULTS: BoggleSettings = { rounds: 3, size: 4, seconds: 180, unique: true, level: 'medium' };

export const BOGGLE_INFO = {
  title: 'حروف مبعثرة',
  tagline: 'ابحث عن أكبر عدد من الكلمات في شبكة الحروف.',
  color: '#E8A417',
  maxPlayers: 12,
  howTo: [
    'الجميع يرى نفس شبكة الحروف على هاتفه، ويبحث عن كلمات قبل انتهاء الوقت.',
    'الكلمة سلسلة من حروف متجاورة (أفقياً أو عمودياً أو قطرياً)، ولا تُستعمل الخانة مرتين في نفس الكلمة. 3 حروف على الأقل.',
    'اسحب إصبعك على الحروف لتكوين الكلمة، أو المس الحروف واحداً واحداً ثم «أرسل».',
    'تُقبل كلمات القاموس فقط، وبدون «ال» التعريف: «كتاب» نعم، «الكتاب» لا. الهمزات والتاء المربوطة لا تهم.',
    'النقاط حسب الطول: 3 أو 4 حروف = 1، خمسة = 2، ستة = 3، سبعة = 5، ثمانية فأكثر = 11.',
    'كلمة وجدها لاعبان أو أكثر لا تُحسب لأحد (يمكن إيقاف هذه القاعدة للصغار). في النهاية نرى كلمات الجميع وأجمل كلمة فاتتكم.',
  ],
};
