/**
 * «أكمل المثل» — comparing a typed ending with the real one, the way players expect.
 *
 * Both are cut into words after `norm` (no tashkeel or tatweel, one alif for أ إ آ ٱ, ة/ه, ى/ي, ؤ ئ)
 * and punctuation; Moroccan keyboard letters (ڭ گ ڤ) count as the letters they stand for. Then:
 * - exact: every word is there (a slip of one letter in a 4+ letter word, two from 8 letters; a leading
 *   «و»/«ف» or «ال» may be missing), or the text without spaces is the ending's (one slip from 8 letters);
 * - close: the words are in order but one is missing (two from six words), with at most one extra word,
 *   and no «لا / ما / لم…» missing (that turns the meaning round);
 * - wrong: anything else. A player who types the beginning again is not penalised.
 * `alt` endings (a longer or a variant form of the same proverb) are accepted the same way.
 */
import { editDistance, norm, stripAl } from '../src/shared/arabic';

export type TypedGrade = 'exact' | 'close' | 'wrong';

const KEYS: Record<string, string> = { ڭ: 'ك', گ: 'ك', ݣ: 'ك', ک: 'ك', ڤ: 'ف', پ: 'ب', ی: 'ي', ے: 'ي' };

const cache = new Map<string, string[]>();

/** The words of a text, normalised. */
export function mathalWords(s: string): string[] {
  const hit = cache.get(s);
  if (hit) return hit;
  const t = norm(s.replace(/[ڭگݣکڤپیے]/g, (c) => KEYS[c] ?? c).toLowerCase());
  const words = t
    .replace(/[^ء-ي0-9a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (cache.size > 20_000) cache.clear();
  cache.set(s, words);
  return words;
}

const len = (w: string) => [...w].length;

/** The word without a leading «و» / «ف» (kept when that would leave too little). */
const bare = (w: string) => (/^[وف]/.test(w) && len(w) > 3 ? w.slice(1) : w);

/** Two words that count as the same: equal, a slip apart, or differing by «و»/«ف» or «ال» in front. */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const forms = (w: string) => new Set([w, bare(w), stripAl(w), stripAl(bare(w))]);
  const fa = forms(a);
  for (const x of forms(b)) if (fa.has(x)) return true;
  const n = Math.min(len(a), len(b));
  const slack = n >= 8 ? 2 : n >= 4 ? 1 : 0;
  return slack > 0 && editDistance(a, b) <= slack;
}

/** How many words of `a` and `b` match in order (a longest common subsequence with sameWord). */
function matched(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = sameWord(a[i - 1], b[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Words that turn a sentence round (normalised; «ولا» and «فما» too). */
const NEGATIONS = new Set(['لا', 'ما', 'لم', 'لن', 'ليس', 'غير', 'الا', 'ولا', 'وما', 'فلا', 'فما', 'ولم', 'ولن']);
/** …and the Moroccan ones: a word in «ماش…», or «ما…ش» around a verb. */
const negations = (ws: string[]) => ws.filter((w) => NEGATIONS.has(w) || /^ماش/.test(w) || (/^ما/.test(w) && /ش$/.test(w))).length;

/** Letters of slack for the whole ending at once (a slip across a missing space): one, from 8 letters. */
const wholeSlack = (n: number) => (n >= 8 ? 1 : 0);

function gradeOne(typed: string[], answer: string[]): TypedGrade {
  if (!typed.length || !answer.length) return 'wrong';
  const tj = typed.join('');
  const aj = answer.join('');
  if (tj === aj) return 'exact';
  const slack = wholeSlack(len(aj));
  if (slack && Math.abs(len(tj) - len(aj)) <= slack && editDistance(tj, aj) <= slack) return 'exact';
  const m = matched(typed, answer);
  const missing = answer.length - m;
  const extra = typed.length - m;
  if (missing === 0 && extra === 0) return 'exact';
  // a missing «لا / ما / لم…» turns the meaning round: never close
  if (negations(typed) < negations(answer)) return 'wrong';
  if (missing === 0 && extra <= 1 && answer.length >= 2) return 'close';
  const allowed = answer.length >= 6 ? 2 : answer.length >= 3 ? 1 : 0;
  if (missing <= allowed && extra <= 1 && m >= 2 && m / answer.length >= 0.6) return 'close';
  return 'wrong';
}

/** The typed words without the proverb's beginning, if the player typed it again. */
function withoutStart(typed: string[], start: string[]): string[] {
  if (!start.length || typed.length <= start.length) return typed;
  for (let i = 0; i < start.length; i++) if (!sameWord(typed[i], start[i])) return typed;
  return typed.slice(start.length);
}

const RANK: Record<TypedGrade, number> = { exact: 2, close: 1, wrong: 0 };

/** How a typed ending compares with the proverb's ending (and its other real endings). */
export function gradeTyped(raw: string, p: { start: string; end: string; alt?: string[] }): TypedGrade {
  const typed = withoutStart(mathalWords(raw), mathalWords(p.start));
  let best: TypedGrade = 'wrong';
  for (const form of [p.end, ...(p.alt ?? [])]) {
    const g = gradeOne(typed, mathalWords(form));
    if (RANK[g] > RANK[best]) best = g;
    if (best === 'exact') break;
  }
  return best;
}

/** Normalised text without spaces (to compare endings with each other). */
export const flat = (s: string) => mathalWords(s).join('');

/** Two endings too alike to stand side by side as options. */
export function endingsAlike(a: string, b: string): boolean {
  const x = flat(a);
  const y = flat(b);
  if (x === y) return true;
  if (Math.min(len(x), len(y)) >= 4 && (x.includes(y) || y.includes(x))) return true;
  const slack = Math.max(1, Math.floor(Math.min(len(x), len(y)) / 5));
  return Math.abs(len(x) - len(y)) <= slack && editDistance(x, y) <= slack;
}
