/**
 * The round engine of «صح أم خطأ» and «الأعلام والعواصم»: a timed question with a few options, everyone
 * answers once on their own phone; a right answer scores 500 and up to 500 more the faster it came. The
 * right option never leaves the server before the reveal. The reveal names the fastest right answer
 * (voice included), shows what everyone picked, then moves on by itself (or the host taps «التالي»).
 * Bots know the answer with a chance set by «مستوى البوتات» and the item, else they guess, and they take
 * the time a person needs to read.
 */
import type { BotLevel, GameId } from '../../src/shared/protocol';
import { quizDelay } from '../ai/social-quiz';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { KNOW_VOICE, voiceFastestRight } from '../voice-calls-knowledge';
import { placesByScore, soleWinner } from './mcq';

export const SQ_POINTS = 500;
export const SQ_SPEED_POINTS = 500;

type Rnd = () => number;

export interface SqItem {
  /** the right option */
  correct: number;
  /** how many options */
  count: number;
  /** characters a player reads before answering (the bots' reading time) */
  chars: number;
}

export interface SqResult {
  id: string;
  choice: number | null;
  correct: boolean;
  points: number;
  ms: number | null;
}

export interface SqState<S, I extends SqItem> {
  settings: S;
  participants: string[];
  items: I[];
  /** 0-based */
  round: number;
  phase: 'ask' | 'reveal' | 'final';
  startedAt: number;
  endsAt: number | null;
  answers: Record<string, { choice: number; at: number }>;
  results: SqResult[] | null;
  scores: Record<string, number>;
  /** right answers so far */
  rights: Record<string, number>;
  rnd: Rnd;
}

/** 500 for a right answer, + up to 500 for the time left. */
export function speedPoints(correct: boolean, ms: number, totalMs: number): number {
  if (!correct) return 0;
  const left = Math.max(0, totalMs - ms);
  return SQ_POINTS + Math.round((SQ_SPEED_POINTS * left) / totalMs);
}

export interface SpeedQuizSpec<S, I extends SqItem, V> {
  id: GameId;
  sanitize(raw: Partial<S> | undefined): S;
  patch(settings: S, patch: Record<string, unknown>): void;
  seconds(settings: S): number;
  /** the game's items (at most the number of rounds) */
  build(ctx: GameCtx, settings: S, rnd: Rnd): I[];
  /** how long the reveal stays (ms, before the room's pace) */
  revealMs: number;
  /** the chance that a bot of this strength knows the answer */
  botKnows(level: BotLevel, item: I): number;
  /** the view, from what the engine knows (the item's right option is only in it once `shown`) */
  view(ctx: GameCtx, s: SqState<S, I>, me: string, item: I, shown: boolean): V;
}

export function makeSpeedQuiz<S, I extends SqItem, V>(spec: SpeedQuizSpec<S, I, V>) {
  const total = (s: SqState<S, I>) => spec.seconds(s.settings) * 1000;

  function ask(ctx: GameCtx, s: SqState<S, I>) {
    s.phase = 'ask';
    s.answers = {};
    s.results = null;
    s.startedAt = ctx.now;
    s.endsAt = ctx.now + total(s);
    ctx.fx('reveal');
  }

  function reveal(ctx: GameCtx, s: SqState<S, I>) {
    const item = s.items[s.round];
    s.results = s.participants.map((id) => {
      const a = s.answers[id];
      if (!a) return { id, choice: null, correct: false, points: 0, ms: null };
      const ms = a.at - s.startedAt;
      const correct = a.choice === item.correct;
      return { id, choice: a.choice, correct, points: speedPoints(correct, ms, total(s)), ms };
    });
    for (const r of s.results) {
      s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
      if (r.correct) s.rights[r.id] = (s.rights[r.id] ?? 0) + 1;
    }
    s.phase = 'reveal';
    s.endsAt = ctx.now + paced(ctx, spec.revealMs);
    const right = s.results.filter((r) => r.correct);
    if (!right.length) {
      ctx.say?.('لا إجابة صحيحة في هذه الجولة', undefined, KNOW_VOICE.noRight);
      return;
    }
    const best = Math.min(...right.map((r) => r.ms ?? 0));
    const first = right.filter((r) => r.ms === best);
    const names = first.map((r) => ctx.playerName(r.id)).join(' و');
    ctx.say?.(`أسرع إجابة صحيحة: ${names}`, first.length === 1 ? first[0].id : undefined, voiceFastestRight(names));
  }

  function finish(ctx: GameCtx, s: SqState<S, I>) {
    s.phase = 'final';
    s.endsAt = null;
    if (!s.participants.length) return;
    ctx.fx('win', soleWinner(s.scores));
    voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
  }

  function next(ctx: GameCtx, s: SqState<S, I>) {
    if (s.round + 1 >= s.items.length) return finish(ctx, s);
    s.round++;
    ask(ctx, s);
  }

  function maybeReveal(ctx: GameCtx, s: SqState<S, I>) {
    if (s.phase !== 'ask') return;
    const waiting = s.participants.filter((p) => !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
    if (!waiting.length) reveal(ctx, s);
  }

  function start(ctx: GameCtx, participants: string[], raw: S, rnd: Rnd = Math.random): SqState<S, I> {
    const settings = spec.sanitize(raw);
    const s: SqState<S, I> = {
      settings,
      participants: [...participants],
      items: spec.build(ctx, settings, rnd),
      round: 0,
      phase: 'ask',
      startedAt: ctx.now,
      endsAt: null,
      answers: {},
      results: null,
      scores: Object.fromEntries(participants.map((p) => [p, 0])),
      rights: {},
      rnd,
    };
    ctx.fx('start');
    ask(ctx, s);
    return s;
  }

  /** A bot's answer for the current item: right with its chance of knowing, else a guess. */
  function botAnswer(level: BotLevel, s: SqState<S, I>): { choice: number; delay: number } {
    const item = s.items[s.round];
    const sure = s.rnd() < spec.botKnows(level, item);
    const choice = sure ? item.correct : Math.floor(s.rnd() * item.count);
    return { choice, delay: quizDelay(level, spec.seconds(s.settings), item.chars, sure) };
  }

  const module: GameModule<SqState<S, I>, S> = {
    id: spec.id,
    hostOnly: ['next'],

    start(ctx, participants, raw) {
      return start(ctx, participants, raw);
    },

    act(ctx, s, by, a) {
      if (a.type === 'next') {
        if (s.phase === 'reveal') next(ctx, s);
        return;
      }
      if (a.type !== 'answer' || s.phase !== 'ask' || !s.participants.includes(by) || s.answers[by]) return;
      if (isNum(a.round) && a.round !== s.round + 1) return;
      const item = s.items[s.round];
      if (!isNum(a.choice) || !Number.isInteger(a.choice) || a.choice < 0 || a.choice >= item.count) return;
      if (ctx.now > (s.endsAt ?? 0)) return;
      s.answers[by] = { choice: a.choice, at: ctx.now };
      maybeReveal(ctx, s);
    },

    tick(ctx, s) {
      if (s.endsAt === null || ctx.now < s.endsAt) return false;
      if (s.phase === 'ask') reveal(ctx, s);
      else if (s.phase === 'reveal') next(ctx, s);
      return true;
    },

    turnOf() {
      return [];
    },

    botPlan(ctx, s, bots) {
      if (s.phase !== 'ask') return;
      const level = botLevel(ctx);
      for (const b of s.participants) {
        if (s.answers[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
        const { choice, delay } = botAnswer(level, s);
        ctx.bot(b, `sq:${s.round}`, delay, { type: 'answer', round: s.round + 1, choice });
      }
    },

    view(ctx, s, me) {
      return spec.view(ctx, s, me, s.items[s.round], s.phase !== 'ask') as never;
    },

    onLeave(ctx, s, id) {
      if (!s.participants.includes(id)) return;
      s.participants = s.participants.filter((p) => p !== id);
      delete s.scores[id];
      delete s.answers[id];
      delete s.rights[id];
      if (s.results) s.results = s.results.filter((r) => r.id !== id);
      if (s.phase === 'final') return;
      if (!s.participants.length) return finish(ctx, s);
      maybeReveal(ctx, s);
    },

    patchSettings(settings, patch) {
      spec.patch(settings, patch);
    },

    result(s) {
      if (s.phase !== 'final' || !s.participants.length) return null;
      return { places: placesByScore(s.participants, s.scores) };
    },
  };

  return { module, start, botAnswer, timerTotal: total };
}

/** The value of `allowed` closest to `v` (`d` when v isn't a number). */
export const snapTo = (v: unknown, allowed: readonly number[], d: number): number =>
  isNum(v) ? allowed.reduce((best, r) => (Math.abs(r - v) < Math.abs(best - v) ? r : best), allowed[0]) : d;
