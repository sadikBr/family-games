/** «كلمة السر» helpers shared by the app (on-screen keyboard) and the server (scoring). */
import type { WordleMark } from './protocol';

export const WORD_LEN = 5;
export const MAX_TRIES = 6;

/** One shape per letter: أ/إ/آ→ا, ى→ي, ئ→ي, ؤ→و; diacritics and tatweel removed. */
export function normWord(s: string): string {
  return s
    .replace(/[ً-ْٰـ\s]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و');
}

/** Keyboard rows (right to left, like an Arabic keyboard). */
export const KEY_ROWS: string[][] = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ء', 'ر', 'ة', 'و', 'ز', 'ظ', 'د', 'ذ'],
];

/** Classic Wordle marking with repeated letters handled correctly. */
export function markGuess(guess: string, answer: string): WordleMark[] {
  const g = [...guess], a = [...answer];
  const marks: WordleMark[] = g.map(() => 'x');
  const left: Record<string, number> = {};
  g.forEach((ch, i) => {
    if (ch === a[i]) marks[i] = 'g';
    else left[a[i]] = (left[a[i]] ?? 0) + 1;
  });
  g.forEach((ch, i) => {
    if (marks[i] === 'g') return;
    if (left[ch]) {
      marks[i] = 'y';
      left[ch] -= 1;
    }
  });
  return marks;
}
