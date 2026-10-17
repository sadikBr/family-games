/** «مسابقة إسلامية» — timed multiple-choice questions, faster right answers score more. */
import type { QuizSettings } from '../../src/shared/protocol';
import { QUESTIONS, Q_CATS } from '../content-islamic';
import { qdeck } from '../qdeck';
import { makeMcq, mcqOptions } from './mcq';

const label = (cat: string) => Q_CATS.find((c) => c.key === cat)?.label ?? '';

export const quiz = makeMcq<QuizSettings>('quiz', (ctx, settings, rounds) => {
  const pool = settings.category === 'all' ? QUESTIONS : QUESTIONS.filter((q) => q.cat === settings.category);
  return qdeck(ctx, `quiz:${settings.category}`, pool)
    .deal(rounds)
    .map((q) => ({ text: q.q, ...mcqOptions(q.a, q.w), label: label(q.cat) }));
});
