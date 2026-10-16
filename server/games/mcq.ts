/**
 * A timed multiple-choice round engine, shared by «مسابقة إسلامية» and «من أي سورة؟».
 * Everyone answers on their own phone; a correct answer scores 500 + up to 500 for speed.
 */
import type { GameId, McqResult, McqView } from '../../src/shared/protocol';
import { type GameCtx, type GameModule } from '../types';
import { isNum, randInt } from '../util';

export interface McqItem {
  text: string;
  options: string[];
  correct: number;
  label: string;
  ref?: string;
}

const REVEAL_MS = 5000;
const BOT_SKILL = 0.7;

export interface McqState<S> {
  settings: S;
  participants: string[];
  items: McqItem[];
  round: number;
  phase: McqView['phase'];
  endsAt: number | null;
  startedAt: number;
  seconds: number;
  answers: Record<string, { choice: number; at: number }>;
  results: McqResult[] | null;
  scores: Record<string, number>;
}

function reveal(ctx: GameCtx, s: McqState<unknown>) {
  const item = s.items[s.round - 1];
  const total = s.seconds * 1000;
  s.results = s.participants.map((id) => {
    const a = s.answers[id];
    const correct = !!a && a.choice === item.correct;
    const left = a ? Math.max(0, total - (a.at - s.startedAt)) : 0;
    const points = correct ? 500 + Math.round((500 * left) / total) : 0;
    s.scores[id] = (s.scores[id] ?? 0) + points;
    return { id, choice: a ? a.choice : null, correct, points };
  });
  s.phase = 'reveal';
  s.endsAt = ctx.now + REVEAL_MS;
  ctx.fx(s.results.some((r) => r.correct) ? 'correct' : 'buzz');
}

function ask(ctx: GameCtx, s: McqState<unknown>) {
  s.round += 1;
  s.answers = {};
  s.results = null;
  s.phase = 'ask';
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + s.seconds * 1000;
  ctx.fx('reveal');
}

export function makeMcq<S extends { rounds: number; seconds: number }>(
  id: Extract<GameId, 'quiz' | 'surah'>,
  build: (settings: S) => McqItem[],
): GameModule<McqState<S>, S> {
  return {
    id,
    start(ctx, participants, settings) {
      const items = build(settings).slice(0, settings.rounds);
      const s: McqState<S> = {
        settings,
        participants,
        items,
        round: 0,
        phase: 'ask',
        endsAt: null,
        startedAt: ctx.now,
        seconds: settings.seconds,
        answers: {},
        results: null,
        scores: Object.fromEntries(participants.map((p) => [p, 0])),
      };
      ctx.fx('start');
      ask(ctx, s);
      return s;
    },

    act(ctx, s, by, a) {
      if (a.type !== 'answer' || s.phase !== 'ask' || !s.participants.includes(by) || s.answers[by]) return;
      const item = s.items[s.round - 1];
      if (!isNum(a.choice) || a.choice < 0 || a.choice >= item.options.length) return;
      s.answers[by] = { choice: a.choice, at: ctx.now };
      const waiting = s.participants.filter((p) => !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
      if (!waiting.length) reveal(ctx, s);
    },

    tick(ctx, s) {
      if (s.endsAt === null || ctx.now < s.endsAt) return false;
      if (s.phase === 'ask') reveal(ctx, s);
      else if (s.phase === 'reveal') {
        if (s.round >= s.items.length) {
          s.phase = 'final';
          s.endsAt = null;
          ctx.fx('win');
        } else ask(ctx, s);
      }
      return true;
    },

    botPlan(ctx, s, bots) {
      if (s.phase !== 'ask') return;
      const item = s.items[s.round - 1];
      for (const b of bots) {
        if (!s.participants.includes(b) || s.answers[b]) continue;
        const right = Math.random() < BOT_SKILL;
        const wrong = [...item.options.keys()].filter((k) => k !== item.correct);
        const choice = right ? item.correct : wrong[randInt(0, wrong.length - 1)];
        const max = Math.max(2500, s.seconds * 1000 * 0.7);
        ctx.bot(b, `ans:${s.round}`, randInt(1800, max), { type: 'answer', choice });
      }
    },

    view(ctx, s, me): McqView {
      const item = s.items[Math.max(0, s.round - 1)];
      const shown = s.phase !== 'ask';
      return {
        game: id,
        phase: s.phase,
        round: s.round,
        rounds: s.items.length,
        label: item.label,
        text: item.text,
        options: item.options,
        endsAt: s.endsAt,
        answered: Object.keys(s.answers),
        myAnswer: s.answers[me]?.choice ?? null,
        correct: shown ? item.correct : null,
        ref: shown ? (item.ref ?? null) : null,
        results: s.results,
        scores: s.scores,
      };
    },

    onLeave(ctx, s, who) {
      if (s.phase !== 'ask') return;
      const waiting = s.participants.filter((p) => p !== who && !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
      if (!waiting.length) reveal(ctx, s);
    },
  };
}

/** Shuffle the right answer in among the wrong ones. */
export function mcqOptions(right: string, wrong: string[]): { options: string[]; correct: number } {
  const options = [right, ...wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { options, correct: options.indexOf(right) };
}
