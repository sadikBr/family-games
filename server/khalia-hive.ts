/**
 * «خلية الحروف»: the answer words, choosing a hive and checking a player's word.
 *
 * - The answer words: server/data/khalia-words.txt (everyday words, spelled with hamza, ة, ى; see
 *   tools/khalia-words.ts). A hive's answer list is every one of them made of its letters only, with the
 *   centre letter: that is the round's maximum, what the bots find and what the end of a round shows.
 * - A hive: the letters of a «كلمة الخلية» (an answer word with exactly seven different letters) and
 *   one of them in the centre, kept when its answer list has ANSWERS_MIN–ANSWERS_MAX words. Every such
 *   hive is found once (≈ 0.1 s, the first time a game starts) and kept; a game draws from them, hives
 *   with everyday letters more often, never the same letters twice in a row in a room.
 * - A player's word counts when it is in the answer list or, from 4 letters, when the app's big
 *   dictionary knows it (scrabble-dict isWord: very permissive with 3-letter strings, so those come from
 *   the answer list only). Never «ال» + a word.
 */
import fs from 'node:fs';
import path from 'node:path';

import { KHALIA_KEYS, khaliaKey, khaliaPangram, khaliaPoints, khaliaPrecheck, type KhaliaWord } from '../src/shared/games/khalia';
import { isWord } from './scrabble-dict';

export const ANSWERS_MIN = 20;
export const ANSWERS_MAX = 100;

interface Entry {
  key: string;
  word: string;
  mask: number;
}

interface Words {
  list: Entry[];
  /** key → spelled */
  byKey: Map<string, string>;
}

let words: Words | null = null;

const bit = new Map(KHALIA_KEYS.map((k, i) => [k, 1 << i]));
export function maskOf(key: string): number {
  let m = 0;
  for (const c of key) m |= bit.get(c) ?? 0;
  return m;
}
const bits = (m: number) => {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
};

/** The answer words (loaded once). */
export function khaliaWords(): Words {
  if (words) return words;
  let raw: string[] = [];
  try {
    raw = fs.readFileSync(path.join(import.meta.dir, 'data', 'khalia-words.txt'), 'utf8').split('\n');
  } catch {
    raw = [];
  }
  const list: Entry[] = [];
  const byKey = new Map<string, string>();
  for (const w of raw) {
    const word = w.trim();
    if (!word) continue;
    const key = khaliaKey(word);
    if ([...key].length < 3 || byKey.has(key)) continue;
    byKey.set(key, word);
    list.push({ key, word, mask: maskOf(key) });
  }
  words = { list, byKey };
  return words;
}

export interface Hive {
  centre: string;
  /** the six letters around the centre */
  outer: string[];
  /** the answer list: key → spelled */
  answers: Map<string, string>;
  /** the answer list's points, and its «كلمات الخلية» (keys) */
  max: number;
  pangrams: string[];
}

interface Candidate {
  mask: number;
  centre: number;
  count: number;
  weight: number;
}

let candidates: Candidate[] | null = null;

/** Every good hive (letters + centre), found once. */
export function hiveCandidates(): Candidate[] {
  if (candidates) return candidates;
  const { list } = khaliaWords();
  // how often each letter is in a word (to favour hives of everyday letters)
  const freq = new Array(KHALIA_KEYS.length).fill(0);
  for (const e of list) for (let i = 0; i < KHALIA_KEYS.length; i++) if (e.mask & (1 << i)) freq[i]++;
  const top = Math.max(1, ...freq);
  const seven = new Set(list.filter((e) => bits(e.mask) === 7).map((e) => e.mask));
  const small = list.filter((e) => bits(e.mask) <= 7);
  const out: Candidate[] = [];
  for (const mask of seven) {
    const inside = small.filter((e) => (e.mask & ~mask) === 0);
    for (let c = 0; c < KHALIA_KEYS.length; c++) {
      if (!(mask & (1 << c))) continue;
      let count = 0;
      for (const e of inside) if (e.mask & (1 << c)) count++;
      if (count < ANSWERS_MIN || count > ANSWERS_MAX) continue;
      // everyday letters, and an everyday centre, come up more often
      let w = 0;
      for (let i = 0; i < KHALIA_KEYS.length; i++) if (mask & (1 << i)) w += freq[i] / top;
      out.push({ mask, centre: c, count, weight: Math.pow(w / 7, 2) * (0.5 + freq[c] / top) });
    }
  }
  candidates = out;
  return out;
}

/** The hive made of these letters (mask) with this centre (a key index). */
export function buildHive(mask: number, centre: number, rand: () => number = Math.random): Hive {
  const { list } = khaliaWords();
  const answers = new Map<string, string>();
  const letters = KHALIA_KEYS.filter((_, i) => mask & (1 << i));
  let max = 0;
  const pangrams: string[] = [];
  for (const e of list) {
    if ((e.mask & ~mask) !== 0 || !(e.mask & (1 << centre))) continue;
    answers.set(e.key, e.word);
    const p = khaliaPangram(e.key, letters);
    if (p) pangrams.push(e.key);
    max += khaliaPoints([...e.key].length, p);
  }
  const outer = letters.filter((l) => l !== KHALIA_KEYS[centre]);
  for (let i = outer.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [outer[i], outer[j]] = [outer[j], outer[i]];
  }
  return { centre: KHALIA_KEYS[centre], outer, answers, max, pangrams };
}

/** A hive for a round, not one of `avoid` (letter masks used lately in the room). */
export function pickHive(avoid: ReadonlySet<number> = new Set(), rand: () => number = Math.random): Hive {
  const all = hiveCandidates();
  let pool = all.filter((c) => !avoid.has(c.mask));
  if (!pool.length) pool = all;
  if (!pool.length) {
    // no word list (a broken install): a fixed hive, so the game still runs
    return buildHive(maskOf('كتبمدرس'), KHALIA_KEYS.indexOf('ت'), rand);
  }
  const total = pool.reduce((a, c) => a + c.weight, 0);
  let x = rand() * total;
  let pick = pool[pool.length - 1];
  for (const c of pool) {
    x -= c.weight;
    if (x < 0) {
      pick = c;
      break;
    }
  }
  return buildHive(pick.mask, pick.centre, rand);
}

/** The letters of a hive (centre first). */
export const hiveLetters = (h: Pick<Hive, 'centre' | 'outer'>) => [h.centre, ...h.outer];

/** The ways a word typed as keys may be written with «ء» (each ا may be one), the plain one first. */
function hamzaForms(key: string): string[] {
  const at = [...key].map((c, i) => (c === 'ا' ? i : -1)).filter((i) => i >= 0).slice(0, 4);
  const out: string[] = [];
  for (let m = 0; m < 1 << at.length; m++) {
    const chars = [...key];
    at.forEach((i, b) => {
      if (m & (1 << b)) chars[i] = 'ء';
    });
    out.push(chars.join(''));
  }
  return out;
}

/** The big dictionary knows this word (keys), written some way: the way it knows it, or null. */
function dictForm(key: string): string | null {
  for (const f of hamzaForms(key)) if (isWord(f)) return f;
  return null;
}

/** Is this (keys) «ال» + a word? */
function articleForm(key: string): boolean {
  if (!key.startsWith('ال') || [...key].length < 4) return false;
  const rest = key.slice(2);
  return khaliaWords().byKey.has(rest) || ([...rest].length >= 3 && dictForm(rest) !== null);
}

export type Verdict = { ok: true; word: KhaliaWord } | { ok: false; text: string };

/**
 * A player's word (keys, or text that is turned into keys) for this hive. `found` = the keys the
 * player already has.
 */
export function checkWord(h: Hive, typed: string, found: ReadonlySet<string>): Verdict {
  const key = khaliaKey(typed);
  const letters = hiveLetters(h);
  const pre = khaliaPrecheck(key, h.centre, letters);
  if (pre) return { ok: false, text: pre };
  if (found.has(key)) return { ok: false, text: 'وُجدت من قبل' };
  const len = [...key].length;
  const pangram = khaliaPangram(key, letters);
  const listed = h.answers.get(key);
  if (listed) return { ok: true, word: { word: listed, key, points: khaliaPoints(len, pangram), pangram } };
  if (articleForm(key)) return { ok: false, text: 'بلا «ال» التعريف' };
  const form = len > 3 ? dictForm(key) : null;
  if (!form) return { ok: false, text: 'ليست في القاموس' };
  return { ok: true, word: { word: form, key, points: khaliaPoints(len, pangram), pangram } };
}
