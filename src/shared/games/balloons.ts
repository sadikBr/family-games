/**
 * «البالونات» — a family letter-guessing game (Hangman without the gallows): the types shared by the server
 * and the app (settings, the view each phone gets), the default settings, the game's card on the home
 * screen and the letter rules both sides use.
 *
 * A bunch of 7 balloons lifts a little basket. One player (the «setter», a new one every round) writes a
 * secret word and picks its category; the others take turns choosing letters on a 28-letter keyboard. A
 * letter in the word is shown in every box where it appears (+1 per box for the player who chose it, who
 * plays again); a letter that isn't pops a balloon and the turn passes. On their turn a player may also
 * try the whole word («أعرف الكلمة!»): right = the hidden boxes + 2 and the round is won; wrong = a balloon
 * pops and the turn passes (nobody sits out). The round ends when the word is complete, or when the last
 * balloon pops and the basket lands softly; the setter gets 1 point per popped balloon. With «الكلمة من
 * التطبيق», with only two players, or when the setter is a bot, the word comes from the app's lists.
 *
 * How letters are compared (letterKey):
 * - one key for the alif and the hamza: ا أ إ آ ٱ ء (the key «ا» shows them all);
 * - ة with ه, ى and ئ with ي, ؤ with و;
 * - diacritics and tatweel don't count; the article «ال» at the start of a setter's word is taken off.
 */

export const BALLOONS_COUNT = 7;
export const BALLOONS_MIN_LETTERS = 3;
export const BALLOONS_MAX_LETTERS = 10;
/** Points for the whole word found at once: the hidden boxes + this bonus. */
export const BALLOONS_WORD_BONUS = 2;

/** 0 = every player sets the word once (in «الكلمة من التطبيق»: one round per player, 3 at least). */
export const BALLOONS_ROUNDS = [0, 5, 10] as const;
/** 0 = no time limit for a turn. */
export const BALLOONS_TURN_SECONDS = [0, 15, 30] as const;

export type BalloonsCat =
  | 'animal'
  | 'fruit'
  | 'veg'
  | 'country'
  | 'city'
  | 'job'
  | 'tool'
  | 'sport'
  | 'food'
  | 'house'
  | 'boy'
  | 'girl'
  | 'color'
  | 'body'
  | 'school';

export const BALLOONS_CATS: BalloonsCat[] = ['animal', 'fruit', 'veg', 'country', 'city', 'job', 'tool', 'sport', 'food', 'house', 'boy', 'girl', 'color', 'body', 'school'];

export const BALLOONS_CAT_LABEL: Record<BalloonsCat, string> = {
  animal: 'حيوان',
  fruit: 'فاكهة',
  veg: 'خضار',
  country: 'بلد',
  city: 'مدينة',
  job: 'مهنة',
  tool: 'أداة',
  sport: 'رياضة',
  food: 'أكلة',
  house: 'شيء في البيت',
  boy: 'اسم ولد',
  girl: 'اسم بنت',
  color: 'لون',
  body: 'عضو من الجسم',
  school: 'من أدوات المدرسة',
};

export interface BalloonsSettings {
  /** 0 (everyone sets once), 5 or 10 */
  rounds: number;
  /** the app chooses every word (nobody sets one) */
  appWords: boolean;
  /** the category of the app's words: 'mix' or one category (a setter always chooses their own) */
  cat: BalloonsCat | 'mix';
  /** seconds per turn: 0 (no limit), 15 or 30 */
  turnSec: number;
}

export const BALLOONS_DEFAULTS: BalloonsSettings = { rounds: 0, appWords: false, cat: 'mix', turnSec: 0 };

/** The 28 keys, in alphabetical order (7 per row). */
export const BALLOONS_KEYS = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];

/** The other letters a key also shows (written small on the key). */
export const BALLOONS_KEY_ALSO: Record<string, string> = { ا: 'أ', ه: 'ة', ي: 'ى', و: 'ؤ' };

/** The rule line under the keyboard. */
export const BALLOONS_KEY_RULE = 'ا = أ إ آ ء · ه = ة · ي = ى ئ · و = ؤ';

const KEY_OF: Record<string, string> = { أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا', ء: 'ا', ة: 'ه', ى: 'ي', ئ: 'ي', ؤ: 'و' };
const KEY_SET = new Set(BALLOONS_KEYS);

/** The keyboard key a letter of the word belongs to (null: not an Arabic letter). */
export function letterKey(ch: string): string | null {
  const k = KEY_OF[ch] ?? ch;
  return KEY_SET.has(k) ? k : null;
}

const DIACRITICS = /[ً-ْـٰ]/g;
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;
/** Letters of Persian/Moroccan keyboards → the Arabic letter they stand for. */
const KEYBOARD: Record<string, string> = { ک: 'ك', ی: 'ي', ې: 'ي', ڤ: 'ف', پ: 'ب', ڭ: 'ك', ݣ: 'ك', گ: 'ك', چ: 'ش', ە: 'ه', ۀ: 'ه', ۃ: 'ه' };

/** What was typed, without diacritics, tatweel or invisible marks, single spaces. */
export function balloonsClean(text: string): string {
  return text
    .replace(INVISIBLE, '')
    .replace(DIACRITICS, '')
    .replace(/[کیېڤپڭݣگچەۀۃ]/g, (c) => KEYBOARD[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PreparedWord {
  /** the letters as written (hamza seats, ة, ى kept), without «ال» */
  chars: string[];
  /** each letter's key */
  keys: string[];
  /** «ال» was taken off the front */
  alStripped: boolean;
}

/**
 * A typed word made ready for the boxes, or the reason it can't be used (shown to its author):
 * Arabic letters only, one word, «ال» at the start taken off, 3–10 letters.
 */
export function prepareWord(raw: string): { ok: true; word: PreparedWord } | { ok: false; error: string } {
  const t = balloonsClean(raw);
  if (!t) return { ok: false, error: 'اكتب كلمة' };
  if (t.includes(' ')) return { ok: false, error: 'كلمة واحدة فقط، بلا مسافات' };
  let chars = [...t];
  if (chars.some((c) => !letterKey(c))) return { ok: false, error: 'حروف عربية فقط' };
  let alStripped = false;
  if (t.startsWith('ال') && t !== 'الله' && chars.length - 2 >= BALLOONS_MIN_LETTERS) {
    chars = chars.slice(2);
    alStripped = true;
  }
  if (chars.length < BALLOONS_MIN_LETTERS) return { ok: false, error: `${BALLOONS_MIN_LETTERS} حروف على الأقل` };
  if (chars.length > BALLOONS_MAX_LETTERS) return { ok: false, error: `${BALLOONS_MAX_LETTERS} حروف على الأكثر` };
  return { ok: true, word: { chars, keys: chars.map((c) => letterKey(c)!), alStripped } };
}

/** A whole-word guess compared with the word: the same keys, letter by letter («ال» in front ignored). */
export function sameWord(guess: string, keys: readonly string[]): boolean {
  const p = prepareWord(guess);
  if (!p.ok) return false;
  return p.word.keys.join('') === keys.join('');
}

/** Letters that never join the letter after them. */
const NO_JOIN_NEXT = new Set(['ا', 'أ', 'إ', 'آ', 'ٱ', 'ء', 'د', 'ذ', 'ر', 'ز', 'و', 'ؤ', 'ة', 'ى']);
/** Letters that never join the letter before them (the lone hamza). */
const NO_JOIN_PREV = new Set(['ء']);

/** Does this letter join the one after it? */
export const joinsNext = (ch: string) => !NO_JOIN_NEXT.has(ch);

/**
 * The boxes as the screens draw them: each letter in the shape it has inside the word, made with tatweel
 * («ـطـ» in the middle, «قـ» at the start, «ـة» at the end). Two letters join only when both are found
 * (and really join), so a found letter never tells anything about a hidden neighbour: next to an empty
 * box it stands alone, as on a word-puzzle grid. Once the whole word is shown every shape is the real one.
 */
export function slotForms(slots: readonly (string | null)[]): (string | null)[] {
  return slots.map((ch, i) => {
    if (!ch) return null;
    const prev = i > 0 ? slots[i - 1] : null;
    const next = i < slots.length - 1 ? slots[i + 1] : null;
    const fromPrev = !!prev && joinsNext(prev) && !NO_JOIN_PREV.has(ch);
    const toNext = !!next && joinsNext(ch) && !NO_JOIN_PREV.has(next);
    return `${fromPrev ? 'ـ' : ''}${ch}${toNext ? 'ـ' : ''}`;
  });
}

/** One letter chosen this round. */
export interface BalloonsTry {
  /** the key («ا» for any alif / hamza) */
  key: string;
  ok: boolean;
  by: string;
  /** boxes it showed */
  n: number;
}

/** The round's last move (the screens animate it: letters appear, a balloon pops). */
export interface BalloonsMove {
  /** bumps with every move of the game */
  seq: number;
  by: string;
  kind: 'letter' | 'word' | 'timeout';
  /** the key, or the word tried */
  text: string;
  ok: boolean;
  gain: number;
}

export interface BalloonsResult {
  won: boolean;
  /** the word in full */
  word: string;
  /** letters: completed letter by letter; word: guessed at once; balloons: every balloon popped; left: the setter left */
  how: 'letters' | 'word' | 'balloons' | 'left';
  /** who completed or guessed it */
  by: string | null;
  /** points of the round, per player (the setter's included) */
  gains: Record<string, number>;
}

export interface BalloonsView {
  game: 'balloons';
  phase: 'set' | 'guess' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  /** who chose the word (null: the app) */
  setter: string | null;
  /** the category (null while the setter is choosing) */
  cat: BalloonsCat | null;
  /** one entry per box: the letter as written once found, null while hidden */
  slots: (string | null)[];
  /** the whole word: only for its setter during the round, for everyone at the reveal */
  secret: string | null;
  /** «ال» was taken off the setter's word (shown to the setter) */
  alStripped: boolean;
  tried: BalloonsTry[];
  /** whole words tried and refused this round */
  wrongWords: { by: string; text: string }[];
  balloons: number;
  maxBalloons: number;
  /** whose turn it is to choose a letter (guess phase) */
  turn: string | null;
  /** the guessers this round, in turn order */
  guessers: string[];
  /** guess: the end of the turn (null: no limit); reveal: the next round */
  endsAt: number | null;
  timerTotal: number;
  last: BalloonsMove | null;
  result: BalloonsResult | null;
  scores: Record<string, number>;
  players: string[];
}

export const BALLOONS_INFO = {
  title: 'البالونات',
  tagline: 'خمّنوا الكلمة حرفاً حرفاً قبل أن تنفجر البالونات السبعة!',
  color: '#E86FA6',
  maxPlayers: 8,
  howTo: [
    'سبعة بالونات ملونة ترفع سلة صغيرة. في كل جولة يكتب لاعب كلمة سرية على هاتفه ويختار فئتها (حيوان، فاكهة، بلد، مهنة، أداة…)، ويتناوب الآخرون على اختيار الحروف.',
    'الحرف الموجود يظهر في كل مكان من الكلمة: نقطة لكل مربع لمن اختاره، ويلعب مرة أخرى. والحرف غير الموجود يفجّر بالوناً، وينتقل الدور.',
    'في دورك يمكنك تجربة الكلمة كاملة بزر «أعرف الكلمة!»: الكلمة الصحيحة تربح الجولة ولك نقطة عن كل مربع مخفي + 2. والخاطئة تفجّر بالوناً وينتقل الدور فقط.',
    'إذا انفجرت البالونات كلها هبطت السلة على الأرض بهدوء وانتهت الجولة. لصاحب الكلمة نقطة عن كل بالون انفجر.',
    'حرف «ا» يكشف أ إ آ ء أيضاً، و«ه» يكشف ة، و«ي» يكشف ى ئ، و«و» يكشف ؤ. الحركات لا تُحسب، و«ال» في أول الكلمة تُحذف.',
    'الكلمة من 3 إلى 10 حروف، عربية، وكلمة واحدة يعرفها قاموس التطبيق، حتى لا يفسد خطأ في الكتابة الجولة.',
    'مع لاعبين اثنين فقط، أو مع «الكلمة من التطبيق»، أو حين يكون صاحب الدور بوتاً: الكلمة من قوائم التطبيق.',
    'في الإعدادات: كل لاعب يكتب كلمة مرة واحدة، أو 5 أو 10 جولات، ووقت الدور (بلا وقت، 15 أو 30 ثانية).',
  ],
};
