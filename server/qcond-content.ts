/**
 * «سؤال وشرط»: judging answers and dealing the cards.
 *
 * An answer is valid when it meets the condition (meetsCond in src/shared/games/qcond.ts: what the player
 * typed, letter by letter) and belongs to the category: one of the category's words (server/qcond-words.ts),
 * exactly after normalising, or written a little differently (a long vowel more or less, one slip in a
 * word of 5+ letters) — then the listed word itself must meet the condition too, so a letter added in
 * front of a known word never passes. A real word the lists don't have for the category (the names
 * dictionary and Hunspell know it: server/dictionary.ts) can still be accepted by the other players' vote.
 *
 * The cards: only question + condition pairs that at least QCOND_MIN_ANSWERS standard words answer are
 * dealt, so a round always has answers (shown as examples when nobody finds one), and not the pairs that
 * a third of the category answers (too easy to be fun).
 */
import { editDistance, norm, stripAl } from '../src/shared/arabic';
import { QCOND_CATS, QCOND_CAT_INFO, condMiss, meetsCond, qcondClean, qcondLetters, type QcondCat, type QcondCond, type QcondCondKind } from '../src/shared/games/qcond';
import type { BotLevel } from '../src/shared/protocol';
import { knownWord } from './dictionary';
import { QCOND_WORDS } from './qcond-words';

export type Rnd = () => number;

/** A pair is dealt only when at least this many standard words answer it… */
export const QCOND_MIN_ANSWERS = 4;
/** …and when no more than this share of the category does. */
export const QCOND_MAX_SHARE = 0.35;

/** The key a word is looked up with in a category (both sides stripped of «ال» the same way). */
export function catKey(text: string): string {
  return stripAl(norm(qcondClean(text))).replace(/ /g, '');
}

/** Without its long vowels: «زيمبابوي» and «زمبابوي» share «زمبب». */
const skeleton = (k: string) => k.replace(/[اوي]/g, '');

interface CatData {
  /** standard words, in list order (most common first) */
  std: string[];
  /** every accepted key → the word it stands for (a standard spelling when there is one) */
  byKey: Map<string, string>;
  /** every accepted word with its key and skeleton, for the tolerant lookup */
  entries: { word: string; key: string; sk: string }[];
}

const cats = new Map<QcondCat, CatData>();

function catData(cat: QcondCat): CatData {
  let d = cats.get(cat);
  if (d) return d;
  const { std, alt } = QCOND_WORDS[cat];
  const seen = new Set<string>();
  const stdWords: string[] = [];
  for (const w of std) {
    const k = catKey(w);
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    stdWords.push(w);
  }
  const byKey = new Map<string, string>();
  const entries: CatData['entries'] = [];
  for (const w of [...stdWords, ...alt]) {
    const key = catKey(w);
    if (key.length < 2 || byKey.has(key)) continue;
    byKey.set(key, w);
    entries.push({ word: w, key, sk: skeleton(key) });
  }
  d = { std: stdWords, byKey, entries };
  cats.set(cat, d);
  return d;
}

/**
 * The category's word this answer stands for (null: none). Exact after normalising; or, for 5+ letters,
 * the same word with a long vowel more or less, or one slip (two from 8 letters) — then only a listed
 * word that meets the condition itself counts.
 */
export function matchCat(cat: QcondCat, text: string, cond?: QcondCond): string | null {
  const d = catData(cat);
  const key = catKey(text);
  if (key.length < 2) return null;
  const exact = d.byKey.get(key);
  if (exact) return exact;
  const n = [...key].length;
  if (n < 5) return null;
  const sk = skeleton(key);
  const slack = n >= 8 ? 2 : 1;
  for (const e of d.entries) {
    if (Math.abs(e.key.length - key.length) > 2) continue;
    if (e.sk !== sk && (e.key.length < 5 || editDistance(e.key, key) > slack)) continue;
    if (cond && !meetsCond(e.word, cond)) continue;
    return e.word;
  }
  return null;
}

/** Which names-game column the dictionary check uses (Hunspell's word forms count for the common nouns). */
const DICT_CAT: Record<QcondCat, string> = {
  boy: 'boy',
  girl: 'girl',
  animal: 'animal',
  fruit: 'plant',
  veg: 'plant',
  color: 'thing',
  body: 'thing',
  job: 'job',
  sport: 'thing',
  school: 'thing',
  country: 'country',
  city: 'country',
  mcity: 'country',
  house: 'thing',
  food: 'thing',
};

/** Is it a real word at all (the names dictionary, the curated lists, Hunspell)? */
export function realWord(cat: QcondCat, text: string): boolean {
  const t = qcondClean(text);
  if (qcondLetters(t).key.length < 2) return false;
  return knownWord(t, DICT_CAT[cat]);
}

export type Judgement = { ok: true; word: string } | { ok: false; hint: string; real: boolean };

/** Is this answer valid for the cards? If not: a hint, and whether it is a real word (the others may vote). */
export function judge(cat: QcondCat, cond: QcondCond, text: string): Judgement {
  const t = qcondClean(text);
  if (qcondLetters(t).key.length < 2) return { ok: false, hint: 'اكتب كلمة كاملة', real: false };
  if (!meetsCond(t, cond)) return { ok: false, hint: condMiss(t, cond), real: false };
  const word = matchCat(cat, t, cond);
  if (word) return { ok: true, word };
  const real = realWord(cat, t);
  return { ok: false, hint: real ? QCOND_CAT_INFO[cat].notIn : 'كلمة غير معروفة', real };
}

/* ------------------------------------------------------------------ */
/* The condition cards                                                 */
/* ------------------------------------------------------------------ */

const LETTERS = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];

/** Every condition card the game knows. */
export const QCOND_ALL_CONDS: QcondCond[] = [
  ...LETTERS.map((letter) => ({ kind: 'start' as const, letter })),
  ...LETTERS.map((letter) => ({ kind: 'end' as const, letter })),
  ...LETTERS.filter((l) => l !== 'ا').map((letter) => ({ kind: 'has' as const, letter })),
  ...[3, 4, 5, 6, 7, 8].map((n) => ({ kind: 'len' as const, n })),
  ...[6, 7, 8, 9].map((n) => ({ kind: 'min' as const, n })),
  { kind: 'noAlif' },
];

export const condId = (c: QcondCond) => `${c.kind}:${c.letter ?? c.n ?? ''}`;

const answersMemo = new Map<string, string[]>();

/** The category's standard words that meet the condition, most common first. */
export function answersFor(cat: QcondCat, cond: QcondCond): string[] {
  const k = `${cat}|${condId(cond)}`;
  let a = answersMemo.get(k);
  if (!a) {
    a = catData(cat).std.filter((w) => meetsCond(w, cond));
    answersMemo.set(k, a);
  }
  return a;
}

const playableMemo = new Map<QcondCat, QcondCond[]>();

/** The conditions that can be dealt with this question card (enough answers, not too many). */
export function playableConds(cat: QcondCat): QcondCond[] {
  let p = playableMemo.get(cat);
  if (!p) {
    const size = catData(cat).std.length;
    const max = Math.max(QCOND_MIN_ANSWERS + 2, Math.floor(size * QCOND_MAX_SHARE));
    p = QCOND_ALL_CONDS.filter((c) => {
      const n = answersFor(cat, c).length;
      return n >= QCOND_MIN_ANSWERS && n <= max;
    });
    playableMemo.set(cat, p);
  }
  return p;
}

/** How often each kind of condition card comes up. */
const KIND_WEIGHT: Record<QcondCondKind, number> = { start: 4, end: 2, has: 2, len: 2, min: 1, noAlif: 1 };

const pickFrom = <T,>(arr: readonly T[], rnd: Rnd): T => arr[Math.floor(rnd() * arr.length) % arr.length];

function shuffled<T>(arr: readonly T[], rnd: Rnd): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface QcondPair {
  cat: QcondCat;
  cond: QcondCond;
}

/**
 * The game's cards: every question card once before any comes back, a condition card that has answers,
 * the kinds mixed (starts-with most often) and never the same letter twice in a row.
 */
export function dealPairs(n: number, rnd: Rnd = Math.random): QcondPair[] {
  const out: QcondPair[] = [];
  let deck: QcondCat[] = [];
  let lastKind: QcondCondKind | null = null;
  let lastLetter: string | null = null;
  const used = new Set<string>();
  while (out.length < n) {
    if (!deck.length) deck = shuffled(QCOND_CATS, rnd);
    const cat = deck.pop()!;
    let conds = playableConds(cat).filter((c) => !used.has(`${cat}|${condId(c)}`) && (!c.letter || c.letter !== lastLetter));
    if (!conds.length) conds = playableConds(cat);
    if (!conds.length) continue;
    const kinds = [...new Set(conds.map((c) => c.kind))];
    const weights = kinds.map((k) => KIND_WEIGHT[k] * (k === lastKind ? 0.35 : 1));
    let r = rnd() * weights.reduce((a, b) => a + b, 0);
    let kind = kinds[kinds.length - 1];
    for (let i = 0; i < kinds.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        kind = kinds[i];
        break;
      }
    }
    const cond = pickFrom(
      conds.filter((c) => c.kind === kind),
      rnd,
    );
    used.add(`${cat}|${condId(cond)}`);
    out.push({ cat, cond });
    lastKind = cond.kind;
    lastLetter = cond.letter ?? null;
  }
  return out;
}

/** A few valid answers to show (the common ones first), leaving out the given words. */
export function examplesFor(cat: QcondCat, cond: QcondCond, exclude: string[] = [], n = 3, rnd: Rnd = Math.random): string[] {
  const skip = new Set(exclude.map(catKey));
  const all = answersFor(cat, cond).filter((w) => !skip.has(catKey(w)));
  const common = shuffled(all.slice(0, 10), rnd);
  const rest = shuffled(all.slice(10), rnd);
  return [...common, ...rest].slice(0, n);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** Which part of the answers a bot knows: easy ones the common words only. */
const BOT_REACH: Record<BotLevel, number> = { easy: 0.4, smart: 0.75, expert: 1 };

/** A right answer a bot gives (null: none it knows). */
export function botAnswer(cat: QcondCat, cond: QcondCond, level: BotLevel, rnd: Rnd = Math.random): string | null {
  const all = answersFor(cat, cond);
  if (!all.length) return null;
  const pool = all.slice(0, Math.max(3, Math.ceil(all.length * BOT_REACH[level])));
  return pickFrom(pool, rnd);
}

/** A slip: a word of the category that misses the condition (null: none). */
export function botSlip(cat: QcondCat, cond: QcondCond, rnd: Rnd = Math.random): string | null {
  const std = catData(cat).std.slice(0, 80).filter((w) => !meetsCond(w, cond));
  return std.length ? pickFrom(std, rnd) : null;
}
