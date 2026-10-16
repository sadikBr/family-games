/** «مسابقة إسلامية» — timed multiple-choice questions, faster right answers score more. */
import type { QuizSettings } from '../../src/shared/protocol';
import { QUESTIONS, Q_CATS } from '../content-islamic';
import { shuffle } from '../util';
import { makeMcq, mcqOptions } from './mcq';

const label = (cat: string) => Q_CATS.find((c) => c.key === cat)?.label ?? '';

export const quiz = makeMcq<QuizSettings>('quiz', (settings) => {
  const pool = settings.category === 'all' ? QUESTIONS : QUESTIONS.filter((q) => q.cat === settings.category);
  return shuffle(pool).map((q) => ({ text: q.q, ...mcqOptions(q.a, q.w), label: label(q.cat) }));
});
