/**
 * «كلمة السر» bots. A bot knows what a player knows: its own rows (letters and colours), the list the
 * hidden word comes from (everyday words, Quran words, or both when a mix doesn't say which), the
 * Quran hint when it is shown, and the dictionary of accepted guesses.
 *
 * easy   — the old bot: a random answer of the set, fitting the colours 3 times out of 4.
 * smart  — always a random answer that fits every colour so far.
 * expert — information-maximizing guesses: among the words still possible and the list's other words
 *          (eliminated words still split the rest; a bot playing for an absent person only ever writes
 *          real everyday / Quran words in their rows), the guess
 *          whose colours are expected to tell the most (Shannon entropy of the colour patterns over
 *          the remaining words), with a bonus for a guess that may itself be the answer; the opening
 *          guess per word list is worked out once and remembered. Always a possible word on the last
 *          try or when two or fewer are left. Within a time budget.
 */
import type { WordleMark } from '../../src/shared/protocol';
import { MAX_TRIES, WORD_LEN, markGuess } from '../../src/shared/wordle';

export interface WordleRow {
  guess: string;
  marks: WordleMark[];
}

/**
 * Budget for one expert guess. The work is bounded anyway (the words still possible × at most 120 + them
 * guesses); the wall clock is a safety net that tests switch off so a busy machine never changes a guess.
 */
export const WORDLE_MS = 40;
export const WORDLE_SEARCH = { clock: true, dictionary: false };

const BASE = 0x621; // ء; the normalised letters run ء…ي
const ALPHA = 48;

function encode(w: string, out: Uint8Array, at: number) {
  let i = 0;
  for (const ch of w) out[at + i++] = Math.max(0, Math.min(ALPHA - 1, ch.charCodeAt(0) - BASE));
}

/** The words as letter codes, WORD_LEN per word. */
function pack(words: readonly string[]): Uint8Array {
  const out = new Uint8Array(words.length * WORD_LEN);
  words.forEach((w, i) => encode(w, out, i * WORD_LEN));
  return out;
}

const tally = new Int8Array(ALPHA);

/** The colour pattern of guess g (in G at gi) against answer a (in A at ai), as a base-3 number. */
function pattern(G: Uint8Array, gi: number, A: Uint8Array, ai: number): number {
  let green = 0;
  for (let k = 0; k < WORD_LEN; k++) {
    if (G[gi + k] === A[ai + k]) green |= 1 << k;
    else tally[A[ai + k]]++;
  }
  // forward pass for the yellows (left to right, as markGuess does)
  let y = 0;
  for (let k = 0; k < WORD_LEN; k++) {
    if (green & (1 << k)) continue;
    const l = G[gi + k];
    if (tally[l] > 0) {
      tally[l]--;
      y |= 1 << k;
    }
  }
  for (let k = 0; k < WORD_LEN; k++) if (!(green & (1 << k))) tally[A[ai + k]] = 0;
  let p = 0;
  for (let k = WORD_LEN - 1; k >= 0; k--) p = p * 3 + (green & (1 << k) ? 2 : y & (1 << k) ? 1 : 0);
  return p;
}

const marksCode = (m: readonly WordleMark[]) => m.reduce((p, x, k) => p + (x === 'g' ? 2 : x === 'y' ? 1 : 0) * 3 ** k, 0);

/** The answers that fit every row. */
export function wordleCandidates(answers: readonly string[], rows: readonly WordleRow[]): string[] {
  if (!rows.length) return [...answers];
  const A = pack(answers);
  const G = pack(rows.map((r) => r.guess));
  const want = rows.map((r) => marksCode(r.marks));
  return answers.filter((_, i) => want.every((p, r) => pattern(G, r * WORD_LEN, A, i * WORD_LEN) === p));
}

/* ---------------- the dictionary, packed once ---------------- */

const dictCache = new WeakMap<object, { words: string[]; codes: Uint8Array }>();

function packedDict(valid: ReadonlySet<string>): { words: string[]; codes: Uint8Array } {
  let d = dictCache.get(valid);
  if (!d) {
    const words = [...valid].filter((w) => [...w].length === WORD_LEN);
    d = { words, codes: pack(words) };
    dictCache.set(valid, d);
  }
  return d;
}

/** Dictionary words (distinct letters) that split `cands` best by letters, for the entropy search. */
function shortlist(valid: ReadonlySet<string>, C: Uint8Array, m: number, k: number): string[] {
  const { words, codes } = packedDict(valid);
  // how many candidates have each letter, and each letter at each place
  const has = new Float64Array(ALPHA);
  const at = new Float64Array(ALPHA * WORD_LEN);
  const seen = new Uint8Array(ALPHA);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < WORD_LEN; j++) {
      const l = C[i * WORD_LEN + j];
      at[l * WORD_LEN + j]++;
      if (!seen[l]) (seen[l] = 1), has[l]++;
    }
    for (let j = 0; j < WORD_LEN; j++) seen[C[i * WORD_LEN + j]] = 0;
  }
  // a letter in half of the words splits best; a letter in its usual place adds greens
  const w = has.map((n) => Math.min(n, m - n) / m);
  const top: { i: number; v: number }[] = [];
  let floor = -1;
  const used = new Uint8Array(ALPHA);
  for (let i = 0; i < words.length; i++) {
    let v = 0;
    let dup = false;
    for (let j = 0; j < WORD_LEN; j++) {
      const l = codes[i * WORD_LEN + j];
      if (used[l]) dup = true;
      used[l] = 1;
      v += w[l] + (0.5 * Math.min(at[l * WORD_LEN + j], m - at[l * WORD_LEN + j])) / m;
    }
    for (let j = 0; j < WORD_LEN; j++) used[codes[i * WORD_LEN + j]] = 0;
    if (dup) v *= 0.8;
    if (v <= floor) continue;
    top.push({ i, v });
    if (top.length > k * 2) {
      top.sort((a, b) => b.v - a.v);
      top.length = k;
      floor = top[k - 1].v;
    }
  }
  return top
    .sort((a, b) => b.v - a.v)
    .slice(0, k)
    .map((t) => words[t.i]);
}

const counts = new Int32Array(243);

function entropyOf(G: Uint8Array, gi: number, C: Uint8Array, m: number): number {
  counts.fill(0);
  for (let i = 0; i < m; i++) counts[pattern(G, gi, C, i * WORD_LEN)]++;
  let h = 0;
  for (let p = 0; p < 243; p++) {
    const n = counts[p];
    if (n) h -= (n / m) * Math.log2(n / m);
  }
  return h;
}

const openers = new Map<string, string>();

/**
 * The expert's next guess. `answers` = every word the hidden one may be (what the bot knows of the
 * list), `valid` = accepted guesses. `key` names the answer list, to remember its opening guess.
 */
export function wordleExpertGuess(answers: readonly string[], valid: ReadonlySet<string>, rows: readonly WordleRow[], key: string, rand: () => number = Math.random): string | null {
  const tried = new Set(rows.map((r) => r.guess));
  const cands = wordleCandidates(answers, rows).filter((w) => !tried.has(w));
  if (!cands.length) return null;
  if (cands.length <= 2) return cands[0];
  if (!rows.length && openers.has(key)) return openers.get(key)!;
  const t0 = performance.now();
  const m = cands.length;
  const C = pack(cands);
  const last = rows.length >= MAX_TRIES - 1;
  // guesses: the candidates (shuffled, all of them when few), then the shortlist
  const pool: string[] = [];
  const order = cands.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // words a person would recognise: the list's own words, eliminated ones too (they still split the rest);
  // the dictionary's shortlist only on request (it has rare forms a person would not play)
  const candSet0 = new Set(cands);
  const outside = last
    ? []
    : WORDLE_SEARCH.dictionary
      ? shortlist(valid, C, m, m > 60 ? 120 : 60).filter((w) => !tried.has(w))
      : answers.filter((w) => !tried.has(w) && !candSet0.has(w));
  const candSet = new Set(cands);
  // alternate so a time-out still leaves both kinds tried
  for (let i = 0, j = 0; i < order.length || j < outside.length; ) {
    if (j < outside.length) pool.push(outside[j++]);
    if (i < order.length) pool.push(cands[order[i++]]);
  }
  const G = new Uint8Array(WORD_LEN);
  let best = cands[order[0]], bestScore = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    const g = pool[i];
    if (!candSet.has(g) && (tried.has(g) || !valid.has(g))) continue;
    encode(g, G, 0);
    // a possible word may be the answer: solving now is worth about as much as the bits it leaves
    const isCand = candSet.has(g);
    const score = entropyOf(G, 0, C, m) + (isCand ? Math.log2(m) / m + 0.05 : 0);
    if (score > bestScore) (bestScore = score), (best = g);
    if ((i & 7) === 7 && WORDLE_SEARCH.clock && performance.now() - t0 > WORDLE_MS) break;
  }
  if (!rows.length) openers.set(key, best);
  return best;
}

/** The smart bot: a random word that fits every colour so far. */
export function wordleSmartGuess(answers: readonly string[], rows: readonly WordleRow[], rand: () => number = Math.random): string | null {
  const tried = new Set(rows.map((r) => r.guess));
  const fits = wordleCandidates(answers, rows).filter((w) => !tried.has(w));
  if (fits.length) return fits[Math.floor(rand() * fits.length)];
  const fresh = answers.filter((w) => !tried.has(w));
  return fresh.length ? fresh[Math.floor(rand() * fresh.length)] : null;
}

/** The old bot (kept as «سهل»): a random answer, fitting what it learned 3 times out of 4. */
export function wordleEasyGuess(answers: readonly string[], rows: readonly WordleRow[], rand: () => number = Math.random): string | null {
  const tried = new Set(rows.map((r) => r.guess));
  const fresh = answers.filter((w) => !tried.has(w));
  const fits = fresh.filter((w) => rows.every((r) => markGuess(r.guess, w).join() === r.marks.join()));
  const pool = fits.length && rand() < 0.75 ? fits : fresh;
  return pool.length ? pool[Math.floor(rand() * pool.length)] : null;
}
