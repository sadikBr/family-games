/**
 * «خلية الحروف» — a word hive for the family (in the style of the NYT Spelling Bee): the types shared by
 * the server and the app, the default settings, the game's card on the home screen and the letter and
 * scoring rules both sides use.
 *
 * Seven different letters sit in a honeycomb: one in the centre, six around it. Everyone gets the same
 * hive at the same time and makes as many words as they can before the timer runs out:
 * - 3 letters at least, only the hive's letters (a letter may be used again), the centre letter in
 *   every word;
 * - a real Arabic word, without the article: «كتاب» counts, «الكتاب» does not (the article would put
 *   ا and ل in half the words). Words that really start with «ال» («ألوان», «ألم») are fine;
 * - points: a 3-letter word = 1, a longer word = its number of letters, and «كلمة الخلية» (a word that
 *   uses all seven letters) gets 7 more.
 * Everyone sees everyone's points and number of words while playing, never their words; at the end of
 * the round all the words are shown (the ones found by two players or more are marked) with the best
 * words nobody found. Ranks (مبتدئ … عبقري) compare a player's points with the round's maximum.
 *
 * Letters are compared by key, like «البالونات»: ا = أ إ آ ء، ه = ة، ي = ى ئ، و = ؤ; diacritics,
 * tatweel and invisible marks don't count. The hive shows keys, a word is sent as a string of keys.
 */

export const KHALIA_MIN_LEN = 3;
export const KHALIA_PANGRAM_BONUS = 7;
export const KHALIA_ROUNDS = [1, 2, 3] as const;
export const KHALIA_MINUTES = [3, 5, 8] as const;
/** the longest word the line takes (keys) */
export const KHALIA_MAX_LEN = 15;

export interface KhaliaSettings {
  /** hives in the game: 1, 2 or 3 */
  rounds: number;
  /** minutes per hive: 3, 5 or 8 */
  minutes: number;
}

export const KHALIA_DEFAULTS: KhaliaSettings = { rounds: 1, minutes: 5 };

/** The 28 letter keys. */
export const KHALIA_KEYS = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];
const KEY_SET = new Set(KHALIA_KEYS);

/** The other letters a key stands for (written small under it). */
export const KHALIA_KEY_ALSO: Record<string, string> = { ا: 'أ إ آ ء', ه: 'ة', ي: 'ى ئ', و: 'ؤ' };

const KEY_OF: Record<string, string> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ء: 'ا',
  ة: 'ه',
  ى: 'ي',
  ئ: 'ي',
  ؤ: 'و',
  // Persian / Moroccan keyboards
  ک: 'ك',
  ی: 'ي',
  ې: 'ي',
  ڤ: 'ف',
  پ: 'ب',
  ڭ: 'ك',
  ݣ: 'ك',
  گ: 'ك',
  ە: 'ه',
  ۀ: 'ه',
  ۃ: 'ه',
};

/** The key a typed character belongs to (null: not an Arabic letter — a diacritic, a space…). */
export function khaliaLetter(ch: string): string | null {
  const k = KEY_OF[ch] ?? ch;
  return KEY_SET.has(k) ? k : null;
}

/** A word as keys: every Arabic letter mapped to its key, «لا» ligature split, everything else dropped. */
export function khaliaKey(text: string): string {
  let out = '';
  for (const ch of text.replace(/[ﻻﻼ]/g, 'لا')) {
    const k = khaliaLetter(ch);
    if (k) out += k;
  }
  return out;
}

/** Does a word (keys) use all seven letters of the hive? */
export function khaliaPangram(key: string, letters: readonly string[]): boolean {
  return letters.length > 0 && letters.every((l) => key.includes(l));
}

/** Points for a word of `len` letters: 3 letters = 1, longer = its length; «كلمة الخلية» + 7. */
export function khaliaPoints(len: number, pangram: boolean): number {
  if (len < KHALIA_MIN_LEN) return 0;
  return (len === KHALIA_MIN_LEN ? 1 : len) + (pangram ? KHALIA_PANGRAM_BONUS : 0);
}

/** Ranks by the share of the round's maximum points. */
export const KHALIA_RANKS: { min: number; label: string }[] = [
  { min: 0, label: 'مبتدئ' },
  { min: 0.1, label: 'جيد' },
  { min: 0.25, label: 'ممتاز' },
  { min: 0.45, label: 'رائع' },
  { min: 0.7, label: 'عبقري' },
];

/** The rank for these points out of `max` (index in KHALIA_RANKS). */
export function khaliaRank(points: number, max: number): number {
  const share = max > 0 ? points / max : 0;
  let r = 0;
  KHALIA_RANKS.forEach((k, i) => {
    if (share >= k.min) r = i;
  });
  return r;
}

/**
 * Why a word is refused, before the dictionary (the app shows it at once; the server checks again):
 * null when the word may go to the server. `key` = the word as keys.
 */
export function khaliaPrecheck(key: string, centre: string, letters: readonly string[]): string | null {
  if ([...key].length < KHALIA_MIN_LEN) return 'كلمة قصيرة';
  if ([...key].some((c) => !letters.includes(c))) return 'حروف الخلية فقط';
  if (!key.includes(centre)) return 'حرف المركز ناقص';
  return null;
}

export interface KhaliaWord {
  /** as shown (spelled with hamza, ة, ى when the app knows the word) */
  word: string;
  /** the keys */
  key: string;
  points: number;
  pangram: boolean;
}

export interface KhaliaResultWord extends KhaliaWord {
  /** another player found it too */
  shared: boolean;
}

export interface KhaliaResult {
  id: string;
  words: KhaliaResultWord[];
  points: number;
}

export type KhaliaFeedbackKind = 'ok' | 'pangram' | 'bad';

export interface KhaliaFeedback {
  /** grows with every word I send (the app animates a new line) */
  seq: number;
  kind: KhaliaFeedbackKind;
  text: string;
  /** the word's points (0 when refused) */
  points: number;
}

/** The line for an accepted word, by its length (a «كلمة الخلية» has its own). */
export function khaliaPraise(len: number, pangram: boolean): string {
  if (pangram) return `كلمة الخلية! +${KHALIA_PANGRAM_BONUS}`;
  if (len <= 3) return 'جيد!';
  if (len === 4) return 'جميل!';
  if (len <= 6) return 'رائع!';
  return 'مذهل!';
}

export interface KhaliaView {
  game: 'khalia';
  phase: 'play' | 'reveal' | 'final';
  round: number;
  rounds: number;
  /** the centre letter (a key) and the six around it */
  centre: string;
  outer: string[];
  endsAt: number | null;
  timerTotal: number;
  /** everyone who plays (seat order) and their names, kept for players who left */
  players: string[];
  names: Record<string, string>;
  /** my words this round, in the order found */
  myWords: KhaliaWord[];
  /** the answer list of this hive: its number of words and points, and its «كلمات الخلية» */
  answers: number;
  max: number;
  pangrams: number;
  /** this round, everyone (me too): points and number of words — never the words before the end */
  board: { id: string; points: number; count: number; done: boolean }[];
  /** I pressed «انتهيت» */
  done: boolean;
  /** what became of my last word (only mine) */
  feedback: KhaliaFeedback | null;
  /** after a round: everyone's words */
  results: KhaliaResult[] | null;
  /** after a round: the best words nobody found, and how many more there were */
  missed: KhaliaWord[] | null;
  missedMore: number;
  /** total points over the rounds */
  scores: Record<string, number>;
}

export const KHALIA_INFO = {
  title: 'خلية الحروف',
  tagline: 'سبعة حروف في خلية: كوّنوا أكبر عدد من الكلمات.',
  color: '#E6A817',
  maxPlayers: 10,
  howTo: [
    'سبعة حروف في خلية نحل: حرف في الوسط وستة حوله. الجميع يرى نفس الخلية ويكوّن كلمات قبل انتهاء الوقت.',
    'الكلمة من 3 حروف على الأقل، من حروف الخلية فقط (يمكن تكرار الحرف)، وفيها حرف الوسط دائماً.',
    'كلمات القاموس فقط، وبدون «ال» التعريف: «كتاب» نعم، «الكتاب» لا. الهمزات لا تهم: الألف تشمل أ إ آ ء، والهاء تشمل ة، والياء تشمل ى ئ، والواو تشمل ؤ.',
    'النقاط: كلمة من 3 حروف = نقطة، والأطول بعدد حروفها. «كلمة الخلية» تستعمل الحروف السبعة كلها: +7.',
    'المس الحروف ثم «أدخل»، أو اكتب بلوحة المفاتيح على الحاسوب. «اخلط» يغيّر أماكن الحروف حول الوسط.',
    'ترى نقاط الجميع وعدد كلماتهم أثناء اللعب، والكلمات تُكشف في النهاية مع أجمل الكلمات التي فاتتكم.',
  ],
};
