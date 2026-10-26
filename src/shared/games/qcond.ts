/**
 * «سؤال وشرط» — the Arabic card game: a QUESTION card (a category: «اسم ولد»، «مدينة»، «حيوان»…) and a
 * CONDITION card («تبدأ بحرف الجيم»، «من 4 حروف»…) are turned over together; everyone types an answer on
 * their own phone and the first valid one takes the round (a card). The types shared by the server and
 * the app, the default settings, the game's card on the home screen, and the letter rules both sides use.
 *
 * How a word is read for the conditions (qcondLetters):
 * - diacritics, tatweel, spaces and punctuation don't count;
 * - the article «ال» at the start of the answer is ignored: «الجزائر» starts with ج and has 5 letters.
 *   Only a bare «ال» is the article: «إلياس» and «ألمانيا» start with ا (the hamza makes it part of the word);
 * - the hamza's seat doesn't matter: أ إ آ count as ا, ؤ as و, ئ as ي;
 * - ة counts as ه (a word ending with ة «ends with the taa marbuta or the haa»), ى as ي, and a final ى
 *   also counts as an ending alif («سلمى» ends with ا and with ي).
 * Whether the answer belongs to the category is checked on the server (server/qcond-content.ts).
 */

export const QCOND_ROUNDS = [10, 15, 20] as const;
export const QCOND_SECONDS = [20, 30, 45] as const;

export interface QcondSettings {
  /** 10, 15 or 20 */
  rounds: number;
  /** seconds per round: 20, 30 or 45 */
  seconds: number;
}

export const QCOND_DEFAULTS: QcondSettings = { rounds: 10, seconds: 30 };

/** Tries per player and round (a wrong answer gets a hint and costs one). */
export const QCOND_TRIES = 3;
/** A word the lists don't know for this category: the others have this long to accept it. */
export const QCOND_VOTE_MS = 10_000;

export type QcondCat =
  | 'boy'
  | 'girl'
  | 'animal'
  | 'fruit'
  | 'veg'
  | 'color'
  | 'body'
  | 'job'
  | 'sport'
  | 'school'
  | 'country'
  | 'city'
  | 'mcity'
  | 'house'
  | 'food';

export const QCOND_CATS: QcondCat[] = ['boy', 'girl', 'animal', 'fruit', 'veg', 'color', 'body', 'job', 'sport', 'school', 'country', 'city', 'mcity', 'house', 'food'];

export const QCOND_CAT_INFO: Record<QcondCat, { label: string; notIn: string; is: string }> = {
  boy: { label: 'اسم ولد', notIn: 'ليس اسم ولد معروفاً', is: 'اسم ولد' },
  girl: { label: 'اسم بنت', notIn: 'ليس اسم بنت معروفاً', is: 'اسم بنت' },
  animal: { label: 'حيوان', notIn: 'ليس حيواناً معروفاً', is: 'حيوان' },
  fruit: { label: 'فاكهة', notIn: 'ليست فاكهة معروفة', is: 'فاكهة' },
  veg: { label: 'خضار', notIn: 'ليس من الخضار المعروفة', is: 'من الخضار' },
  color: { label: 'لون', notIn: 'ليس لوناً معروفاً', is: 'لون' },
  body: { label: 'عضو من الجسم', notIn: 'ليس عضواً من الجسم', is: 'عضو من الجسم' },
  job: { label: 'مهنة', notIn: 'ليست مهنة معروفة', is: 'مهنة' },
  sport: { label: 'رياضة', notIn: 'ليست رياضة معروفة', is: 'رياضة' },
  school: { label: 'من أدوات المدرسة', notIn: 'ليس من أدوات المدرسة', is: 'من أدوات المدرسة' },
  country: { label: 'دولة', notIn: 'ليست دولة معروفة', is: 'دولة' },
  city: { label: 'مدينة', notIn: 'ليست مدينة معروفة', is: 'مدينة' },
  mcity: { label: 'مدينة مغربية', notIn: 'ليست مدينة مغربية معروفة', is: 'مدينة مغربية' },
  house: { label: 'شيء في البيت', notIn: 'ليس من أشياء البيت المعروفة', is: 'من أشياء البيت' },
  food: { label: 'أكلة', notIn: 'ليست أكلة معروفة', is: 'أكلة' },
};

export type QcondCondKind = 'start' | 'end' | 'has' | 'len' | 'min' | 'noAlif';

export interface QcondCond {
  kind: QcondCondKind;
  /** start / end / has: the letter (normalised: ا for أ إ آ, ه for ة) */
  letter?: string;
  /** len / min: the number of letters */
  n?: number;
}

/** Letter names as the condition cards write them. */
export const QCOND_LETTER_NAME: Record<string, string> = {
  ا: 'الألف',
  ب: 'الباء',
  ت: 'التاء',
  ث: 'الثاء',
  ج: 'الجيم',
  ح: 'الحاء',
  خ: 'الخاء',
  د: 'الدال',
  ذ: 'الذال',
  ر: 'الراء',
  ز: 'الزاي',
  س: 'السين',
  ش: 'الشين',
  ص: 'الصاد',
  ض: 'الضاد',
  ط: 'الطاء',
  ظ: 'الظاء',
  ع: 'العين',
  غ: 'الغين',
  ف: 'الفاء',
  ق: 'القاف',
  ك: 'الكاف',
  ل: 'اللام',
  م: 'الميم',
  ن: 'النون',
  ه: 'الهاء',
  و: 'الواو',
  ي: 'الياء',
};

/** «3 حروف»، «11 حرفاً» */
export const lettersText = (n: number) => (n === 1 ? 'حرف واحد' : n === 2 ? 'حرفان' : n <= 10 ? `${n} حروف` : `${n} حرفاً`);

/** The condition card's text: «تبدأ بحرف الجيم»، «من 4 حروف». */
export function condLabel(c: QcondCond): string {
  const name = QCOND_LETTER_NAME[c.letter ?? ''] ?? c.letter ?? '';
  switch (c.kind) {
    case 'start':
      return `تبدأ بحرف ${name}`;
    case 'end':
      if (c.letter === 'ه') return 'تنتهي بالتاء المربوطة أو الهاء';
      if (c.letter === 'ا') return 'تنتهي بالألف (ا أو ى)';
      return `تنتهي بحرف ${name}`;
    case 'has':
      return `فيها حرف ${name}`;
    case 'len':
      return `من ${lettersText(c.n ?? 0)} بالضبط`;
    case 'min':
      return `من ${lettersText(c.n ?? 0)} أو أكثر`;
    case 'noAlif':
      return 'ليس فيها حرف الألف';
  }
}

/** Letters that never join the next one (no tatweel after them). */
const NO_JOIN = new Set(['ا', 'د', 'ذ', 'ر', 'ز', 'و']);

/**
 * The big mark on the condition card, the letter in its position as Arabic writes it: «جـ» (starts),
 * «ـر» (ends), «ـشـ» (inside), «4», «6+», «ا» (struck through on the card).
 */
export function condMark(c: QcondCond): string {
  const l = c.letter === 'ا' ? 'أ' : c.letter === 'ه' && c.kind === 'end' ? 'ة' : (c.letter ?? '');
  const join = !NO_JOIN.has(c.letter ?? '');
  switch (c.kind) {
    case 'start':
      return join ? `${l}ـ` : l;
    case 'end':
      return c.letter === 'ا' ? 'ـا' : `ـ${l}`;
    case 'has':
      return join ? `ـ${l}ـ` : `ـ${l}`;
    case 'len':
      return String(c.n ?? '');
    case 'min':
      return `${c.n ?? ''}+`;
    case 'noAlif':
      return 'ا';
  }
}

const DIACRITICS = /[ً-ْـٰ]/g;
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;
/** Letters of Persian/Moroccan keyboards → the Arabic letter they stand for. */
const KEYBOARD: Record<string, string> = { ک: 'ك', ی: 'ي', ې: 'ي', ڤ: 'ف', پ: 'ب', ڭ: 'ك', ݣ: 'ك', گ: 'ك', چ: 'ش', ە: 'ه', ۀ: 'ه', ۃ: 'ه' };
const NORM: Record<string, string> = { أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا', ة: 'ه', ى: 'ي', ؤ: 'و', ئ: 'ي' };

/** The answer's words as typed: no diacritics, Arabic letters and single spaces only (hamza seats kept). */
export function qcondClean(text: string): string {
  return text
    .replace(INVISIBLE, '')
    .replace(DIACRITICS, '')
    .replace(/[کیېڤپڭݣگچەۀۃ]/g, (c) => KEYBOARD[c] ?? c)
    .replace(/[^ء-ي ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The letters the conditions look at: no «ال» at the start (only the bare article: «إلياس» keeps its
 * alif), no spaces, hamza seats / ة / ى normalised. `maqsura`: the answer ends with ى.
 */
export function qcondLetters(text: string): { key: string; maqsura: boolean } {
  let s = qcondClean(text);
  if (s.startsWith('ال') && s.replace(/ /g, '').length >= 4) s = s.slice(2);
  const flat = s.replace(/ /g, '');
  return { key: flat.replace(/[أإآٱةىؤئ]/g, (c) => NORM[c]), maqsura: flat.endsWith('ى') };
}

/** Does the answer meet the condition? */
export function meetsCond(text: string, c: QcondCond): boolean {
  const { key, maqsura } = qcondLetters(text);
  if (!key) return false;
  const n = [...key].length;
  switch (c.kind) {
    case 'start':
      return key[0] === c.letter;
    case 'end': {
      const last = key[key.length - 1];
      return last === c.letter || (c.letter === 'ا' && maqsura);
    }
    case 'has':
      return key.includes(c.letter ?? '\u0000');
    case 'len':
      return n === c.n;
    case 'min':
      return n >= (c.n ?? 0);
    case 'noAlif':
      return !key.includes('ا');
  }
}

/** What's wrong with an answer that misses the condition (a hint for its author). */
export function condMiss(text: string, c: QcondCond): string {
  const miss = condMissText(text, c);
  // «الجزائر» for «تبدأ بحرف الألف»: a reminder that the article doesn't count
  return qcondClean(text).startsWith('ال') && (c.kind === 'start' || c.kind === 'len' || c.kind === 'min') ? `${miss} («ال» لا تُحسب)` : miss;
}

function condMissText(text: string, c: QcondCond): string {
  const name = QCOND_LETTER_NAME[c.letter ?? ''] ?? '';
  const n = [...qcondLetters(text).key].length;
  switch (c.kind) {
    case 'start':
      return `لا تبدأ بحرف ${name}`;
    case 'end':
      return c.letter === 'ه' ? 'لا تنتهي بالتاء المربوطة أو الهاء' : `لا تنتهي بحرف ${name}`;
    case 'has':
      return `ليس فيها حرف ${name}`;
    case 'len':
      return `فيها ${lettersText(n)}، والمطلوب ${lettersText(c.n ?? 0)}`;
    case 'min':
      return `فيها ${lettersText(n)} فقط، والمطلوب ${c.n} أو أكثر`;
    case 'noAlif':
      return 'فيها حرف الألف';
  }
}

/** One answer of the round, as the reveal shows it. */
export interface QcondAttempt {
  id: string;
  text: string;
  ok: boolean;
  /** why it was refused */
  hint?: string;
}

export interface QcondVote {
  by: string;
  text: string;
  /** «هل «خروف» حيوان؟» */
  question: string;
  yes: string[];
  no: string[];
  /** who may vote (the other people in the room, bots never) */
  voters: string[];
  endsAt: number;
  total: number;
}

export interface QcondRoundResult {
  /** who took the round (null: nobody) */
  winner: string | null;
  text: string | null;
  /** ms from the cards to the winning answer (a vote's pause not counted) */
  ms: number | null;
  /** answer: a valid answer; vote: accepted by the others; timeout; skip: everyone asked to skip */
  how: 'answer' | 'vote' | 'timeout' | 'skip';
  /** a few valid answers (others than the winner's) */
  examples: string[];
  attempts: QcondAttempt[];
}

export interface QcondView {
  game: 'qcond';
  phase: 'play' | 'vote' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  cat: QcondCat;
  cond: QcondCond;
  /** play: the end of the round; vote: the end of the vote; reveal: the next round */
  endsAt: number | null;
  timerTotal: number;
  /** wrong tries this round, per player */
  tries: Record<string, number>;
  maxTries: number;
  /** my last refused answer and why («لا تبدأ بحرف الجيم»), this round */
  myLast: { text: string; hint: string } | null;
  /** who asked to skip this round, and how many must (every person still in the game) */
  skips: string[];
  skipNeeded: number;
  vote: QcondVote | null;
  result: QcondRoundResult | null;
  scores: Record<string, number>;
  players: string[];
}

export const QCOND_INFO = {
  title: 'سؤال وشرط',
  tagline: 'اسم ولد يبدأ بالجيم؟ مدينة من 4 حروف؟ أول جواب صحيح يأخذ البطاقة!',
  color: '#2E86C1',
  maxPlayers: 8,
  howTo: [
    'في كل جولة بطاقتان: سؤال (اسم ولد، مدينة، حيوان، فاكهة، لون…) وشرط (تبدأ بحرف الجيم، تنتهي بالراء، فيها حرف الشين، من 4 حروف…).',
    'اكتب على هاتفك جواباً يناسب السؤال والشرط معاً. أول جواب صحيح يأخذ البطاقة: نقطة واحدة.',
    '«ال» في أول الكلمة لا تُحسب: «الجزائر» تبدأ بالجيم وفيها 5 حروف. الهمزة على الألف ألف، والتاء المربوطة هاء.',
    'الجواب الخاطئ يُرفض مع تلميح صغير («لا تبدأ بحرف الجيم»)، ولكل لاعب 3 محاولات في الجولة.',
    'كلمة صحيحة لا تعرفها قوائم اللعبة تُعرض على الآخرين: إن قبلتها الأغلبية أخذ صاحبها البطاقة.',
    'لكل سؤال وشرط أجوبة معروفة. إن لم يجد أحد جواباً، اطلبوا «تخطّي» جميعاً، أو انتظروا نهاية الوقت لتروا أمثلة.',
    'في الإعدادات: 10 أو 15 أو 20 جولة، و20 أو 30 أو 45 ثانية لكل جولة. الفائز صاحب أكثر البطاقات.',
  ],
};
