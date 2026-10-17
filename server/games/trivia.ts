/** «معلومات عامة» — general-knowledge quiz (Morocco, geography, science, sport, animals…), same timed format as the Islamic quiz. */
import type { TriviaSettings } from '../../src/shared/protocol';
import { TRIVIA, TRIVIA_CATS } from '../content-trivia';
import { qdeck } from '../qdeck';
import { makeMcq, mcqOptions } from './mcq';

const label = (cat: string) => TRIVIA_CATS.find((c) => c.key === cat)?.label ?? '';

export const trivia = makeMcq<TriviaSettings>('trivia', (ctx, settings, rounds) => {
  const pool = settings.category === 'all' ? TRIVIA : TRIVIA.filter((q) => q.cat === settings.category);
  return qdeck(ctx, `trivia:${settings.category}`, pool)
    .deal(rounds)
    .map((q) => ({ text: q.q, ...mcqOptions(q.a, q.w), label: label(q.cat) }));
});
