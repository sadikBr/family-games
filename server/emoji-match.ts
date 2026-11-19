/**
 * «خمّن من الإيموجي» — is a typed answer the puzzle's answer?
 *
 * Both sides are reduced to a key: tashkeel, tatweel, hamza shapes, ة/ه, ى/ي are ignored (`norm`), so are the
 * article «ال» (and «بال/وال/فال/كال/لل» in front of a word), punctuation and spaces; Eastern digits count as
 * digits, letters from Persian / Moroccan keyboards as their Arabic twins. Then small slips are forgiven,
 * more for longer answers: none up to 4 letters («قط» ≠ «قرد», «كلب» ≠ «قلب»), one from 5, two from 9,
 * three from 15 (a whole proverb), one more every 8 letters after that.
 * The puzzle's alternatives (other names, short forms of a proverb) count as the answer.
 */
import { editDistance, norm, stripAl } from '../src/shared/arabic';

const KEYBOARD: Record<string, string> = { ی: 'ي', ک: 'ك', ڤ: 'ف', پ: 'ب', ڭ: 'ك', گ: 'ك', ۀ: 'ه', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

/** One word without its article (or a joined preposition + article). */
function wordKey(w: string): string {
  let k = w;
  if (/^(وال|بال|فال|كال)/.test(k) && k.length > 5) k = k.slice(3);
  else if (k.startsWith('لل') && k.length > 4) k = k.slice(2);
  return stripAl(k);
}

const keyCache = new Map<string, string>();

/** The comparable key of an answer. */
export function emojiKey(s: string): string {
  const hit = keyCache.get(s);
  if (hit !== undefined) return hit;
  const clean = norm(
    s
      .toLowerCase()
      .replace(/[یکڤپڭگۀ٠-٩]/g, (c) => KEYBOARD[c] ?? c)
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' '),
  );
  const k = clean.split(' ').filter(Boolean).map(wordKey).join('');
  if (keyCache.size > 20_000) keyCache.clear();
  keyCache.set(s, k);
  return k;
}

const len = (s: string) => [...s].length;

/** How many slips a key of this length forgives. */
export function slack(n: number): number {
  if (n < 5) return 0;
  if (n < 9) return 1;
  if (n < 15) return 2;
  return 3 + Math.floor((n - 15) / 8);
}

/** Does `typed` match this one form (an answer or one of its alternatives)? */
export function matchesForm(typed: string, form: string): boolean {
  const t = emojiKey(typed);
  const f = emojiKey(form);
  if (!t || !f) return false;
  if (t === f) return true;
  const s = slack(len(f));
  return s > 0 && Math.abs(len(t) - len(f)) <= s && editDistance(t, f) <= s;
}

/** Is the typed answer right for this puzzle (its answer or one of its alternatives)? */
export function emojiMatches(typed: string, puzzle: { answer: string; alt: readonly string[] }): boolean {
  if (len(emojiKey(typed)) < 2) return false;
  return [puzzle.answer, ...puzzle.alt].some((f) => matchesForm(typed, f));
}

/** Clean up what a player typed before it is stored and shown at the reveal. */
export function cleanTyped(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}
