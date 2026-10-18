/**
 * «كلمة واحدة» — comparing Arabic words the way players expect.
 *
 * - clueKey: hamza shapes, ة/ه, ى/ي and tashkeel are ignored (src/shared/arabic `norm`), so is the article
 *   «ال» (and «بال/وال/فال/كال/لل» in front of a word) and anything that is not a letter.
 * - stem: the key without a common plural / feminine ending (ات، ون، ين، ة).
 * - sameClue: two clues are «the same» (both cancelled) when their keys or stems match, when they differ by
 *   one letter (5+ letters: a typo), or when they share their root letters once the long vowels inside the
 *   word are dropped (4+ letters): «هاتف» / «الهاتف» / «هواتف».
 * - clueProblem: why a clue is refused (not one word, the mystery word itself, a form of it, or contains it).
 * - guessMatches: is a guess the mystery word (its forms, the article, a one-letter typo from 5 letters).
 */
import { editDistance, norm, stripAl } from '../src/shared/arabic';
import type { OnewordWord } from './oneword-content';

const NOT_LETTER = /[^ء-يa-z0-9]/g;

/** One word, normalised, without the article or a joined preposition + article. */
function wordKey(w: string): string {
  let k = norm(w.toLowerCase()).replace(NOT_LETTER, '');
  if (/^(وال|بال|فال|كال)/.test(k) && k.length > 5) k = k.slice(3);
  else if (k.startsWith('لل') && k.length > 4) k = k.slice(2);
  return stripAl(k);
}

const keyCache = new Map<string, string>();

/** The key of a clue or a (possibly two-word) mystery word: every word normalised, joined. */
export function clueKey(s: string): string {
  const hit = keyCache.get(s);
  if (hit !== undefined) return hit;
  const k = norm(s.toLowerCase())
    .split(/[\sـ_-]+/)
    .filter(Boolean)
    .map(wordKey)
    .join('');
  if (keyCache.size > 20_000) keyCache.clear();
  keyCache.set(s, k);
  return k;
}

const ENDINGS = ['ات', 'ون', 'ين', 'ه'];

/** The key without one plural / feminine ending (only when 3+ letters remain). */
export function stem(key: string): string {
  for (const e of ENDINGS) if (key.endsWith(e) && [...key].length - e.length >= 3) return key.slice(0, -e.length);
  return key;
}

/** Root-ish letters: the stem without the long vowels inside it (the last letter stays). */
export function skeleton(st: string): string {
  const x = [...st];
  return x.map((ch, i) => (i < x.length - 1 && 'اوي'.includes(ch) ? '' : ch)).join('');
}

const len = (s: string) => [...s].length;

/** Do two clues count as the same word (so both are removed)? */
export function sameClue(a: string, b: string): boolean {
  const ka = clueKey(a);
  const kb = clueKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const sa = stem(ka);
  const sb = stem(kb);
  if (sa === sb) return true;
  if (Math.min(len(ka), len(kb)) >= 5 && editDistance(ka, kb) <= 1) return true;
  if (Math.min(len(sa), len(sb)) >= 4) {
    const xa = skeleton(sa);
    if (len(xa) >= 3 && xa === skeleton(sb)) return true;
  }
  return false;
}

/** The word and its forms, plus each word of a two-word form (3+ letters, without the article). */
function forbidden(word: OnewordWord): { whole: string[]; parts: string[] } {
  const whole = [word.w, ...word.f];
  const parts: string[] = [];
  for (const f of whole) {
    const ws = norm(f).split(' ').filter(Boolean);
    if (ws.length < 2) continue;
    for (const w of ws) {
      const k = wordKey(w);
      if (len(k) >= 3) parts.push(k);
    }
  }
  return { whole, parts };
}

/** Clean up what a player typed: trim, drop tashkeel/tatweel and surrounding punctuation. */
export function cleanClue(raw: string): string {
  return raw
    .trim()
    .replace(/[ً-ْـٰ]/g, '')
    .replace(/^[\s.,،؛;:!?؟«»"'()]+|[\s.,،؛;:!?؟«»"'()]+$/g, '');
}

/**
 * Why a clue is refused for this word, in فصحى — or null when it is fine.
 * One word only (no spaces), 2–20 letters, not the word, not a form of it, not containing it.
 */
export function clueProblem(raw: string, word: OnewordWord): string | null {
  const t = cleanClue(raw);
  if (!t) return 'اكتب تلميحاً أولاً';
  if (/\s/.test(t)) return 'التلميح كلمة واحدة فقط، بلا مسافات';
  if (/[^ء-يa-zA-Z0-9٠-٩]/.test(t)) return 'التلميح حروف فقط، بلا رموز';
  const k = clueKey(t);
  if (len(k) < 2) return 'التلميح قصير جداً';
  if (len(t) > 20) return 'التلميح طويل جداً';
  const { whole, parts } = forbidden(word);
  const same = 'لا يجوز أن يكون التلميح الكلمة نفسها أو صيغة منها';
  const inside = 'لا يجوز أن يحتوي التلميح على الكلمة السرية';
  for (const f of whole) {
    if (sameClue(t, f)) return same;
    const fk = clueKey(f);
    const fs = stem(fk);
    if ((len(fk) >= 3 && k.includes(fk)) || (len(fs) >= 3 && k.includes(fs))) return inside;
  }
  for (const p of parts) {
    if (sameClue(t, p)) return same;
    if (k.includes(stem(p)) && len(stem(p)) >= 3) return inside;
  }
  return null;
}

/** Is the guess the mystery word? Forms count, so do the article and a one-letter slip from 5 letters. */
export function guessMatches(raw: string, word: OnewordWord): boolean {
  const g = clueKey(cleanClue(raw));
  if (len(g) < 1) return false;
  for (const f of [word.w, ...word.f]) {
    const k = clueKey(f);
    if (g === k || stem(g) === stem(k)) return true;
    if (len(k) >= 5 && editDistance(g, k) <= 1) return true;
  }
  return false;
}

/**
 * Which clues cancel each other: indexes of every clue that matches another one. `null` entries (no clue)
 * never match.
 */
export function duplicates(clues: (string | null)[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < clues.length; i++) {
    for (let j = i + 1; j < clues.length; j++) {
      const a = clues[i];
      const b = clues[j];
      if (a && b && sameClue(a, b)) {
        out.add(i);
        out.add(j);
      }
    }
  }
  return out;
}
