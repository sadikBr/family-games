/**
 * «كلم»: the words behind the game — which three-letter words count, the deck of double-sided letter cards,
 * the starting words, and the bots' moves.
 *
 * Three kinds of word (classify):
 * - 'known': everyday words — the curated list below (with their usual spelling, for the screens), the
 *   three-letter everyday words of server/data/common-words.txt that the bots of «شبكة الكلمات» may play
 *   (scrabble-dict botWord), and in «فصحى وعامية» the Moroccan words below. They count at once.
 * - 'dict': the big dictionary knows it (server/scrabble-dict isWord: the names list and Hunspell) but it
 *   isn't an everyday word. Nearly a third of all three-letter strings pass that check (old roots, verb
 *   forms), so with other people at the table it goes to their vote (accepted unless more say no).
 * - 'unknown': nobody's list has it: a vote (accepted only when more say yes), or refused without voters.
 *
 * Keys: as «البالونات» compares letters (ا = أ إ آ ء, ه = ة, ي = ى ئ, و = ؤ). The big dictionary keeps ء,
 * so an alif after the first letter is also tried as ء («جزا» = «جزء», «ماا» = «ماء»).
 */
import fs from 'node:fs';
import path from 'node:path';

import { KALIM_KEYS, KALIM_LEN, KALIM_STAR, kalimWordKey, type KalimCard, type KalimDialect } from '../src/shared/games/kalim';
import type { BotLevel } from '../src/shared/protocol';
import { botWord, isWord } from './scrabble-dict';

export type Rnd = () => number;

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * Everyday three-letter words everyone knows, in their usual spelling: nouns first (the starting words come
 * from them), then verbs. Some the big dictionary misses («عين», «أذن», «قال»).
 */
export const KALIM_NOUNS = words(`
  قلم قمر شمس باب بيت ولد بنت أخت خال خبز تمر لحم سمك حوت فيل أسد نمر ذئب قرد جمل ثور كلب فأر نحل نمل ديك
  طير صقر نسر بوم موز تين عنب خوخ بلح زيت ملح سكر عسل أرز جبن شاي لبن بيض رأس عين أنف أذن رجل قدم ظهر بطن
  صدر شعر جلد كتف ذقن عنق قلب كبد عظم ضرس بحر نهر جبل سهل شجر زهر ورد ورق غصن ثلج برد مطر رعد برق ريح غيم
  نجم ليل يوم صبح فجر عصر نور نار رمل حجر طين ذهب فضة صخر بئر نبع عشب قدر صحن كأس كوب درج فرن سلم كرة ثوب
  جيب قفل علم سيف رمح درع قوس سهم طبل عود ناي لوح حبر شمع حبل خيط مقص مشط سوق درب دار قصر برج سور جسر نفق
  بلد شهر عام سنة وقت أمس ملك شيخ طفل جار ضيف شعب قوم أهل زوج عمة جدة بطل خير عقل صبر شكر حمد فرح حزن خوف
  أمل سلم حرب نصر فوز لعب ركض نوم أكل شرب سفر عمل درس صوم دين نفس روح وجه اسم رقم حرف قول فعل خبر عيد حفل
  هدف كنز سعر مال ربح ماء بقر غنم دجاج بطة لون أرض جوع عطش ثمر حقل نخل قمح ذرة فول عدس بصل ثوم جزر كرم ريش
  ذيل قرن ظفر ناب كعك تاج صوف قطن سجن كهف غار موج سفن فلك صوت لحن قصة سطر جرة سلة كيس رسم حلم ثلث ربع نصف
  سبع تسع عشر ألف مئة دبس عقد خاتم كمّ زرّ حزام دلو مهد سرج لجام نعل خفّ مسك عطر ورس شاة نعجة ظبي وعل غزال
  `).filter((w) => [...w.replace(/ّ/g, '')].length === KALIM_LEN);

export const KALIM_VERBS = words(`
  كتب قرأ نام قام جلس ذهب رجع خرج دخل سبح فتح سمع نظر لمس ضحك بكى مشى جرى طار سار عاد زار قال باع أخذ وجد
  فقد كسر صنع غسل طبخ زرع حصد سقى رمى قفز خسر وصل سأل حمل نقل دفع سحب رفع وضع بنى هدم سكن عاش مات نبت كبر
  صغر طال قصر غضب هرب جاء حفظ نسي صام دعا رقص غنى عزف نجح فهم ركب نزل صعد رسم لبس شرح سرق قطع جمع طرق شدّ
  `).filter((w) => [...w.replace(/ّ/g, '')].length === KALIM_LEN);

/** Moroccan words for «فصحى وعامية» (the everyday ones fusha spells the same way are in the lists above). */
export const KALIM_DARIJA = words(`
  واش فين هاد داك ديك ختي غدا شنو كاع ناض طاح داز صاب بغا جاب شاف كلا مشا جرا هدر عيط فاق نعس قرا دوز زين
  خيب ديب مرا دري صاك لاش فاش زوز جوج غوت خزر نقز شطح كمش طلع هبط حضي شرا عطا خلص خدم ضرب سخن برد حرق
  فلس طاس كاس قرع لوز حوش تاي بنة زعف سرد عقل نقش لقا حرث قوم
  `).filter((w) => [...w].length === KALIM_LEN);

/* ------------------------------------------------------------------ */
/* The lexicon                                                         */
/* ------------------------------------------------------------------ */

interface Lexicon {
  /** curated keys (the starting words, the star's words) */
  curated: Set<string>;
  /** every everyday key */
  known: Set<string>;
  darija: Set<string>;
  /** key → the usual spelling, for the screens */
  shown: Map<string, string>;
  /** letter key → weight in the deck */
  weights: Map<string, number>;
}

let lex: Lexicon | null = null;

const keyOf = (w: string) => kalimWordKey(w.replace(/ّ/g, ''));

function lexicon(): Lexicon {
  if (lex) return lex;
  const curated = new Set<string>();
  const shown = new Map<string, string>();
  for (const w of [...KALIM_NOUNS, ...KALIM_VERBS]) {
    const k = keyOf(w);
    if (!k) continue;
    curated.add(k);
    if (!shown.has(k)) shown.set(k, w.replace(/ّ/g, ''));
  }
  const known = new Set(curated);
  try {
    const common = fs.readFileSync(path.join(import.meta.dir, 'data', 'common-words.txt'), 'utf8').split('\n');
    for (const w of common) {
      if ([...w].length !== KALIM_LEN || /(.)\1\1/.test(w) || !botWord(w)) continue;
      const k = kalimWordKey(w);
      if (k) known.add(k);
    }
  } catch {
    // no everyday list: the curated words alone
  }
  const darija = new Set<string>();
  for (const w of KALIM_DARIJA) {
    const k = keyOf(w);
    if (k && !known.has(k)) darija.add(k);
    if (k && !shown.has(k)) shown.set(k, w);
  }
  // the deck's letters: how often each letter appears in everyday words (rare ones still come up)
  const count = new Map<string, number>(KALIM_KEYS.map((k) => [k, 1]));
  for (const w of known) for (const c of w) count.set(c, (count.get(c) ?? 1) + 1);
  const weights = new Map([...count].map(([k, n]) => [k, Math.pow(n, 0.75)]));
  return (lex = { curated, known, darija, shown, weights });
}

/** The big dictionary, with ء tried for an alif after the first letter. */
function inDict(key: string): boolean {
  if (isWord(key)) return true;
  for (let i = 1; i < key.length; i++) if (key[i] === 'ا' && isWord(key.slice(0, i) + 'ء' + key.slice(i + 1))) return true;
  return false;
}

export type WordClass = 'known' | 'dict' | 'unknown';

export function classify(key: string, dialect: KalimDialect): WordClass {
  const l = lexicon();
  if (l.known.has(key) || (dialect === 'mixed' && l.darija.has(key))) return 'known';
  return inDict(key) ? 'dict' : 'unknown';
}

/** A word as the screens show it: its usual spelling when the app knows one («امل» → «أمل»). */
export function shownWord(key: string): string {
  // most words starting with an alif start with a hamza («أمر», «أكل»): the usual spelling then
  return lexicon().shown.get(key) ?? (key[0] === 'ا' ? `أ${key.slice(1)}` : key);
}

/** Load the lists and the dictionaries now (the first lookup otherwise takes half a second). */
export function warmKalim() {
  lexicon();
  inDict('قلم');
}

/* ------------------------------------------------------------------ */
/* The deck                                                            */
/* ------------------------------------------------------------------ */

function pickWeighted(rnd: Rnd, weights: Map<string, number>, not?: string): string {
  let total = 0;
  for (const [k, w] of weights) if (k !== not) total += w;
  let r = rnd() * total;
  for (const [k, w] of weights) {
    if (k === not) continue;
    r -= w;
    if (r <= 0) return k;
  }
  return [...weights.keys()].find((k) => k !== not)!;
}

/** Star cards in a deck of `total` cards: about one in fifteen, one at least. */
export const starsFor = (total: number) => Math.max(1, Math.round(total / 15));

/** A shuffled deck of `total` cards: two different letters on each (by how common they are), and stars. */
export function makeDeck(total: number, rnd: Rnd, firstId = 1): KalimCard[] {
  const { weights } = lexicon();
  const stars = starsFor(total);
  const deck: KalimCard[] = [];
  for (let i = 0; i < total; i++) {
    if (i < stars) {
      deck.push({ id: 0, a: KALIM_STAR, b: KALIM_STAR });
      continue;
    }
    const a = pickWeighted(rnd, weights);
    deck.push({ id: 0, a, b: pickWeighted(rnd, weights, a) });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.map((c, i) => ({ ...c, id: firstId + i }));
}

/* ------------------------------------------------------------------ */
/* Starting words                                                      */
/* ------------------------------------------------------------------ */

/** Everyday words one letter away from `key`. */
export function neighbours(key: string, set: ReadonlySet<string> = lexicon().known): string[] {
  const out: string[] = [];
  for (let i = 0; i < KALIM_LEN; i++)
    for (const c of KALIM_KEYS) {
      if (c === key[i]) continue;
      const w = key.slice(0, i) + c + key.slice(i + 1);
      if (set.has(w)) out.push(w);
    }
  return out;
}

let starts: string[] | null = null;

/** The starting words: curated nouns with plenty of everyday words one letter away. */
export function startWords(): string[] {
  if (starts) return starts;
  const l = lexicon();
  const list: string[] = [];
  for (const w of KALIM_NOUNS) {
    const k = keyOf(w);
    if (k && !list.includes(k) && neighbours(k, l.known).length >= 12) list.push(k);
  }
  return (starts = list);
}

/** Moves a set of hands has on `keys` with everyday words (for picking a lively starting word). */
export function movesFor(keys: string, hands: KalimCard[][]): number {
  const l = lexicon();
  let n = 0;
  for (const hand of hands)
    for (const c of hand) {
      if (c.a === KALIM_STAR) {
        n++;
        continue;
      }
      for (const face of [c.a, c.b])
        for (let i = 0; i < KALIM_LEN; i++) if (face !== keys[i] && l.known.has(keys.slice(0, i) + face + keys.slice(i + 1))) n++;
    }
  return n;
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

export interface BotPlay {
  card: number;
  face: 0 | 1;
  pos: number;
  /** a star's letter */
  as?: string;
  word: string;
}

/** How likely a bot is to notice each possible move. */
const SEES: Record<BotLevel, number> = { easy: 0.45, smart: 0.8, expert: 1 };

/** A bot's play on `keys`, or null when it sees none (easy bots miss more than half of what there is). */
export function botPlay(level: BotLevel, keys: string, hand: KalimCard[], dialect: KalimDialect, rnd: Rnd): BotPlay | null {
  const l = lexicon();
  const knows = (w: string) => l.known.has(w) || (dialect === 'mixed' && l.darija.has(w));
  const rarity = (k: string) => 1 / (l.weights.get(k) ?? 1);
  const seen: (BotPlay & { score: number })[] = [];
  for (const c of hand) {
    if (c.a === KALIM_STAR) continue;
    ([c.a, c.b] as const).forEach((face, f) => {
      for (let i = 0; i < KALIM_LEN; i++) {
        if (face === keys[i]) continue;
        const w = keys.slice(0, i) + face + keys.slice(i + 1);
        if (!knows(w) || rnd() > SEES[level]) continue;
        // expert: get rid of the cards whose letters are hardest to place
        seen.push({ card: c.id, face: f as 0 | 1, pos: i, word: w, score: rarity(c.a) + rarity(c.b) + rnd() * 0.002 });
      }
    });
  }
  if (seen.length) {
    if (level === 'expert') return strip(seen.reduce((a, b) => (b.score > a.score ? b : a)));
    return strip(seen[Math.floor(rnd() * seen.length)]);
  }
  // the star, when nothing else fits (a common word, the commonest letter first for the others)
  const star = hand.find((c) => c.a === KALIM_STAR);
  if (!star) return null;
  const opts: BotPlay[] = [];
  for (let i = 0; i < KALIM_LEN; i++)
    for (const k of KALIM_KEYS) {
      if (k === keys[i]) continue;
      const w = keys.slice(0, i) + k + keys.slice(i + 1);
      if (l.curated.has(w) && rnd() <= SEES[level]) opts.push({ card: star.id, face: 0, pos: i, as: k, word: w });
    }
  return opts.length ? opts[Math.floor(rnd() * opts.length)] : null;
}

function strip({ card, face, pos, as, word }: BotPlay & { score?: number }): BotPlay {
  return as ? { card, face, pos, as, word } : { card, face, pos, word };
}
