/**
 * «ماذا قال الناس؟» — lenient matching of a typed answer against a question's answers.
 * Spelling slips, «ال», hamza shapes, ة/ه and spaces are forgiven (answerMatches / similarAnswers), every
 * answer has aliases (darija words, synonyms), and a longer phrase that contains an answer also counts
 * («كأس شاي» → «شاي»).
 */
import { answerKey, answerMatches, norm, similarAnswers, stripAl } from '../src/shared/arabic';
import type { SurveyQuestion } from './survey-content';

/** All the names that count for an answer: its text first, then its aliases. */
export const namesOf = (a: SurveyQuestion['answers'][number]) => [a.text, ...a.aliases];

const words = (s: string) =>
  norm(s.replace(/[()«»"'.,،؛!?؟-]/g, ' '))
    .split(' ')
    .filter(Boolean)
    .map(stripAl);

/** Is every word of `part` (3+ letters in all) found in `whole`, in order? */
function containsWords(whole: string[], part: string[]): boolean {
  if (part.join('').length < 3 || part.length > whole.length) return false;
  for (let i = 0; i + part.length <= whole.length; i++) {
    if (part.every((w, j) => whole[i + j] === w)) return true;
  }
  return false;
}

/** Same answer, spelled the same way after normalising. */
export const exactName = (typed: string, name: string) => answerKey(typed) === answerKey(name);

/** Same answer with a spelling slip. */
export const fuzzyName = (typed: string, name: string) => answerMatches(typed, name) || similarAnswers(typed, name);

/**
 * Which answers the typed text could be, best tier first: exact names, then spelling slips, then a phrase
 * containing a name. Returns the answer indexes of the first tier that matches anything.
 */
export function candidates(q: SurveyQuestion, typed: string): number[] {
  const t = typed.trim();
  if (answerKey(t).length < 2) return [];
  const tiers: ((name: string) => boolean)[] = [
    (n) => exactName(t, n),
    (n) => fuzzyName(t, n),
    (n) => containsWords(words(t), words(n)),
  ];
  for (const ok of tiers) {
    const hits = q.answers.map((a, i) => (namesOf(a).some(ok) ? i : -1)).filter((i) => i >= 0);
    if (hits.length) return hits;
  }
  return [];
}

/**
 * Match a typed answer: the best not-yet-revealed answer it fits, or 'dup' when it only fits answers already on
 * the board, or -1 when it fits nothing.
 */
export function matchAnswer(q: SurveyQuestion, typed: string, revealed: readonly boolean[] = []): number | 'dup' {
  const hits = candidates(q, typed);
  if (!hits.length) return -1;
  const open = hits.filter((i) => !revealed[i]);
  return open.length ? open[0] : 'dup';
}
