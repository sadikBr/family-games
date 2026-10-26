/**
 * «الدخيل» — «سؤال مختلف»: how a bot answers its question, and how well an answer fits a question (the
 * bots vote for the answers that fit the real question worst). Bots only ever use the question on their
 * own screen and the answers everyone sees.
 */
import { answerKey } from '../../src/shared/arabic';
import type { ImposterQuestion } from '../content-imposter-questions';

const DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const NUMBER_WORDS: [string, number][] = [
  ['صفر', 0], ['لا شيء', 0], ['واحد', 1], ['واحده', 1], ['مره', 1], ['اثنان', 2], ['اثنين', 2], ['مرتين', 2], ['مرتان', 2],
  ['ثلاث', 3], ['ثلاثه', 3], ['اربع', 4], ['اربعه', 4], ['خمس', 5], ['خمسه', 5], ['ست', 6], ['سته', 6], ['سبع', 7],
  ['سبعه', 7], ['ثمان', 8], ['ثماني', 8], ['ثمانيه', 8], ['تسع', 9], ['تسعه', 9], ['عشر', 10], ['عشره', 10],
  ['عشرون', 20], ['عشرين', 20], ['ثلاثون', 30], ['ثلاثين', 30], ['خمسون', 50], ['خمسين', 50],
];

const WORDS_LONGEST_FIRST = NUMBER_WORDS.map(([w, n]) => [answerKey(w), n] as const).sort((a, b) => b[0].length - a[0].length);

/** The number in an answer («7», «٧ ساعات», «سبعة»), or null. */
export function answerNumber(text: string): number | null {
  const t = text.replace(/[٠-٩]/g, (d) => DIGITS[d]);
  const m = t.match(/\d+(?:[.,]\d+)?/);
  if (m) return Number(m[0].replace(',', '.'));
  const words = answerKey(text.replace(/[^ء-ي\s]/g, ' '));
  for (const [w, n] of WORDS_LONGEST_FIRST) if (words.startsWith(w)) return n;
  return null;
}

/** A bot's answer to the question on its screen: one of the typical answers. */
export function botAnswer(q: ImposterQuestion, rnd: () => number = Math.random): string {
  return q.answers[Math.floor(rnd() * q.answers.length)] ?? '';
}

/**
 * How badly `answer` fits question `q` (0 = a typical answer, higher = more suspicious): a number outside
 * the usual range by how far (1 to 3), an answer outside the usual ones 0.7 (0.3 when it shares a word
 * with one: «سمك مشوي» for «سمك»), no answer at all 1.2. Only the question on screen counts.
 */
export function misfit(q: ImposterQuestion, answer: string): number {
  if (!answer.trim()) return 1.2;
  const nums = q.answers.map(answerNumber);
  if (nums.every((n) => n !== null)) {
    const n = answerNumber(answer);
    if (n === null) return 1.2;
    const lo = Math.min(...(nums as number[]));
    const hi = Math.max(...(nums as number[]));
    if (n >= lo && n <= hi) return 0;
    const span = Math.max(1, hi - lo);
    return Math.min(3, 1 + (n < lo ? lo - n : n - hi) / span);
  }
  const key = answerKey(answer);
  const keys = q.answers.map(answerKey);
  if (keys.includes(key)) return 0;
  const words = new Set(answer.split(/\s+/).map(answerKey).filter((w) => w.length > 2));
  if (q.answers.some((a) => a.split(/\s+/).some((w) => words.has(answerKey(w))))) return 0.3;
  if (keys.some((k) => k.length > 2 && (key.includes(k) || k.includes(key)) && key.length > 2)) return 0.3;
  return 0.7;
}
