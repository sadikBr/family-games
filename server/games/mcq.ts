/**
 * A timed multiple-choice round engine, shared by «مسابقة إسلامية» and «من أي سورة؟».
 * Everyone answers on their own phone; a correct answer scores 500 + up to 500 for speed.
 */
import type { GameId, McqResult, McqView } from '../../src/shared/protocol';
import { easyDelay, quizAnswer } from '../ai/social-quiz';
import { botLevel, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';
import { voiceAnswer, voiceFinal, voiceOnly, voiceQuestion } from '../voice-calls-party';

export interface McqItem {
  text: string;
  options: string[];
  correct: number;
  label: string;
  ref?: string;
}

const REVEAL_MS = 7000;

/**
 * «قراءة الأحداث بصوت»: what the voice reads at the start of a round and at the reveal. By default the
 * question with its options (when they are short), then «الجَوَابُ: …».
 */
export interface McqVoice {
  ask?(item: McqItem): string;
  answer?(item: McqItem): string;
}
const askVoice = (v: McqVoice | undefined, item: McqItem) => v?.ask?.(item) ?? voiceQuestion(item.text, item.options);
const answerVoice = (v: McqVoice | undefined, item: McqItem) => v?.answer?.(item) ?? voiceAnswer(item.options[item.correct]);
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

function reveal(ctx: GameCtx, s: McqState<unknown>, voice?: McqVoice) {
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
  voiceOnly(ctx, answerVoice(voice, item));
  // no shared sound here: each phone plays «correct» or «wrong» for its own player (see quiz.tsx)
}

/** The only top scorer, or undefined on a tie (for the win / lose sound). */
export function soleWinner(scores: Record<string, number>): string | undefined {
  const best = Math.max(...Object.values(scores));
  const top = Object.keys(scores).filter((id) => scores[id] === best);
  return top.length === 1 ? top[0] : undefined;
}

/** Players ranked by score, best first; equal scores share a place (for GameModule.result). */
export function placesByScore(ids: string[], scores: Record<string, number>): string[][] {
  const sorted = [...ids].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  const places: string[][] = [];
  sorted.forEach((id, i) => {
    if (i > 0 && (scores[id] ?? 0) === (scores[sorted[i - 1]] ?? 0)) places[places.length - 1].push(id);
    else places.push([id]);
  });
  return places;
}

/** When an easy bot answers: mostly in the second half of the timer, sometimes earlier. */
export const botAnswerDelay = easyDelay;

function ask(ctx: GameCtx, s: McqState<unknown>, voice?: McqVoice) {
  s.round += 1;
  s.answers = {};
  s.results = null;
  s.phase = 'ask';
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + s.seconds * 1000;
  ctx.fx('reveal');
  const item = s.items[s.round - 1];
  if (item) voiceOnly(ctx, askVoice(voice, item));
}

export function makeMcq<S extends { rounds: number; seconds: number }>(
  id: Extract<GameId, 'quiz' | 'surah' | 'trivia'>,
  /** At most `rounds` items, drawn from the room's deck (see qdeck) so questions don't repeat between games. */
  build: (ctx: GameCtx, settings: S, rounds: number) => McqItem[],
  /** How often easy bots pick the right answer (default 70%); smart and expert bots know more (see ai/social-quiz). */
  botSkill: (settings: S) => number = () => BOT_SKILL,
  voice?: McqVoice,
): GameModule<McqState<S>, S> {
  return {
    id,
    start(ctx, participants, settings) {
      // rounds are clamped to the size of the chosen pool
      const items = build(ctx, settings, settings.rounds).slice(0, settings.rounds);
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
      ask(ctx, s, voice);
      return s;
    },

    act(ctx, s, by, a) {
      if (a.type !== 'answer' || s.phase !== 'ask' || !s.participants.includes(by) || s.answers[by]) return;
      const item = s.items[s.round - 1];
      if (!isNum(a.choice) || a.choice < 0 || a.choice >= item.options.length) return;
      s.answers[by] = { choice: a.choice, at: ctx.now };
      const waiting = s.participants.filter((p) => !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
      if (!waiting.length) reveal(ctx, s, voice);
    },

    tick(ctx, s) {
      if (s.endsAt === null || ctx.now < s.endsAt) return false;
      if (s.phase === 'ask') reveal(ctx, s, voice);
      else if (s.phase === 'reveal') {
        if (s.round >= s.items.length) {
          s.phase = 'final';
          s.endsAt = null;
          ctx.fx('win', soleWinner(s.scores));
          voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
        } else ask(ctx, s, voice);
      }
      return true;
    },

    botPlan(ctx, s, bots) {
      if (s.phase !== 'ask') return;
      const item = s.items[s.round - 1];
      const level = botLevel(ctx);
      for (const b of bots) {
        if (!s.participants.includes(b) || s.answers[b]) continue;
        const { choice, delay } = quizAnswer(level, botSkill(s.settings), item, s.seconds);
        ctx.bot(b, `ans:${s.round}`, delay, { type: 'answer', choice });
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

    result(s) {
      return s.phase === 'final' ? { places: placesByScore(s.participants, s.scores) } : null;
    },

    onLeave(ctx, s, who) {
      if (s.phase !== 'ask') return;
      const waiting = s.participants.filter((p) => p !== who && !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
      if (!waiting.length) reveal(ctx, s, voice);
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
