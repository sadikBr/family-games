/**
 * «صح أم خطأ» — a statement (server/truefalse-content.ts), everyone taps «صح» or «خطأ» on their own phone.
 * Option 0 is «صح», option 1 «خطأ». Scoring, reveal and bots: the speed-quiz engine (speedquiz.ts).
 * The statements are dealt from the room's deck (no repeats until the pool is used up), and each game
 * keeps true and false statements roughly balanced.
 */
import type { BotLevel } from '../../src/shared/protocol';
import {
  TRUEFALSE_CAT_LABEL,
  TRUEFALSE_ROUNDS,
  TRUEFALSE_SECONDS,
  type TruefalseResult,
  type TruefalseSettings,
  type TruefalseView,
} from '../../src/shared/games/truefalse';
import { TRUEFALSE, type TruefalseQ } from '../truefalse-content';
import { qdeck } from '../qdeck';
import { paced } from '../types';
import { makeSpeedQuiz, snapTo, type SqItem } from './speedquiz';

export const TRUEFALSE_REVEAL_MS = 6000;

export interface TfItem extends SqItem {
  q: TruefalseQ;
}

/** How often a bot knows whether a statement is true (normal / hard); otherwise it guesses. */
export const TF_BOT_KNOWS: Record<BotLevel, [number, number]> = { easy: [0.35, 0.15], smart: [0.6, 0.38], expert: [0.82, 0.6] };

export function sanitizeTruefalse(raw: Partial<TruefalseSettings> | undefined): TruefalseSettings {
  return { rounds: snapTo(raw?.rounds, TRUEFALSE_ROUNDS, 10), seconds: snapTo(raw?.seconds, TRUEFALSE_SECONDS, 12) };
}

const item = (q: TruefalseQ): TfItem => ({ q, correct: q.t ? 0 : 1, count: 2, chars: q.s.length });

const quiz = makeSpeedQuiz<TruefalseSettings, TfItem, TruefalseView>({
  id: 'truefalse',
  sanitize: sanitizeTruefalse,
  patch(settings, patch) {
    if (patch.rounds !== undefined) settings.rounds = snapTo(patch.rounds, TRUEFALSE_ROUNDS, settings.rounds);
    if (patch.seconds !== undefined) settings.seconds = snapTo(patch.seconds, TRUEFALSE_SECONDS, settings.seconds);
  },
  seconds: (s) => s.seconds,
  revealMs: TRUEFALSE_REVEAL_MS,
  build(ctx, settings) {
    // two decks (true / false), alternated at random but never more than a few of one kind in a row
    const yes = qdeck(ctx, 'truefalse:t', TRUEFALSE.filter((q) => q.t));
    const no = qdeck(ctx, 'truefalse:f', TRUEFALSE.filter((q) => !q.t));
    const half = Math.round(settings.rounds / 2);
    const kinds = [...Array(half).fill(true), ...Array(settings.rounds - half).fill(false)] as boolean[];
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    const used = new Set<TruefalseQ>();
    return kinds.map((t) => {
      const q = (t ? yes : no).draw((x) => used.has(x));
      used.add(q);
      return item(q);
    });
  },
  botKnows: (level, it) => TF_BOT_KNOWS[level][it.q.hard ? 1 : 0],
  view(ctx, s, me, it, shown): TruefalseView {
    const results: TruefalseResult[] | null =
      shown && s.results ? s.results.map((r) => ({ id: r.id, answer: r.choice === null ? null : r.choice === 0, correct: r.correct, points: r.points, ms: r.ms })) : null;
    const mine = s.answers[me];
    return {
      game: 'truefalse',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.items.length,
      label: TRUEFALSE_CAT_LABEL[it.q.cat],
      statement: it.q.s,
      endsAt: s.endsAt,
      timerTotal: s.phase === 'ask' ? s.settings.seconds * 1000 : paced(ctx, TRUEFALSE_REVEAL_MS),
      answered: s.participants.filter((p) => !!s.answers[p]),
      mine: mine ? mine.choice === 0 : null,
      truth: shown ? it.q.t : null,
      why: shown ? it.q.why : null,
      results,
      scores: s.scores,
      players: s.participants,
      rights: s.rights,
    };
  },
});

export const truefalse = quiz.module;
export const startTruefalse = quiz.start;
export const truefalseBotAnswer = quiz.botAnswer;
export type TruefalseState = ReturnType<typeof quiz.start>;
