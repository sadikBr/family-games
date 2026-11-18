/**
 * «أكبر أم أصغر؟» — higher or lower. Each question shows two things of one kind (server/akbar-content.ts,
 * paired by server/akbar-pairs.ts) and asks which is bigger on one measure; everyone taps a side on their
 * own phone (one tap, it can't be changed). The values stay on the server until the reveal: then both
 * values with their units, the bars, who chose what, the points and the streaks. A right answer scores
 * (10 + up to 5 for speed) × the streak (3 in a row ×1.5, 5 in a row ×2); a wrong answer or none breaks
 * the streak. The reveal moves on by itself (or the host taps «التالي»); after the last one, the podium.
 *
 * Bots are right with a chance set by their strength and by how far apart the two values are, and take
 * the time a person needs to read both cards.
 */
import type { BotLevel } from '../../src/shared/protocol';
import {
  AKBAR_DEFAULTS,
  AKBAR_ROUNDS,
  AKBAR_SECONDS,
  AKBAR_TOPICS,
  rightPoints,
  speedBonus,
  streakMult,
  type AkbarResult,
  type AkbarSettings,
  type AkbarTopic,
  type AkbarView,
  type Side,
} from '../../src/shared/games/akbar';
import { quizDelay } from '../ai/social-quiz';
import { AKBAR_MIN_RATIO, dealPairs, magnitude, roomSeen, winnerSide, type AkbarPair } from '../akbar-pairs';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { KNOW_VOICE, voiceFastestRight } from '../voice-calls-knowledge';
import { placesByScore, soleWinner } from './mcq';
import { snapTo } from './speedquiz';

/** The reveal stays on the screens this long (at the room's pace). */
export const AKBAR_REVEAL_MS = 7000;

type Rnd = () => number;

interface Question extends AkbarPair {
  correct: Side;
}

interface State {
  settings: AkbarSettings;
  participants: string[];
  qs: Question[];
  /** 0-based */
  round: number;
  phase: AkbarView['phase'];
  startedAt: number;
  endsAt: number | null;
  answers: Record<string, { choice: Side; at: number }>;
  results: AkbarResult[] | null;
  scores: Record<string, number>;
  streaks: Record<string, number>;
  best: Record<string, number>;
  rights: Record<string, number>;
  rnd: Rnd;
}

export function sanitizeAkbar(raw: Partial<AkbarSettings> | undefined): AkbarSettings {
  const topic = isStr(raw?.topic) && (AKBAR_TOPICS as string[]).includes(raw.topic) ? (raw.topic as AkbarTopic) : AKBAR_DEFAULTS.topic;
  return {
    rounds: snapTo(raw?.rounds, AKBAR_ROUNDS, AKBAR_DEFAULTS.rounds),
    seconds: snapTo(raw?.seconds, AKBAR_SECONDS, AKBAR_DEFAULTS.seconds),
    topic,
  };
}

const totalMs = (s: State) => s.settings.seconds * 1000;

/** One player's result for the current question; `prev` = their streak before it. */
export function scoreAnswer(choice: Side | null, ms: number | null, correct: Side, total: number, prev: number): Omit<AkbarResult, 'id'> {
  if (choice === null || ms === null) return { choice: null, correct: false, speed: 0, mult: 1, points: 0, streak: 0, ms: null };
  if (choice !== correct) return { choice, correct: false, speed: 0, mult: 1, points: 0, streak: 0, ms };
  const streak = prev + 1;
  return { choice, correct: true, speed: speedBonus(ms, total), mult: streakMult(streak), points: rightPoints(ms, total, streak), streak, ms };
}

function ask(ctx: GameCtx, s: State) {
  s.phase = 'ask';
  s.answers = {};
  s.results = null;
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + totalMs(s);
  ctx.fx('reveal');
}

function reveal(ctx: GameCtx, s: State) {
  const q = s.qs[s.round];
  s.results = s.participants.map((id) => {
    const a = s.answers[id];
    return { id, ...scoreAnswer(a?.choice ?? null, a ? a.at - s.startedAt : null, q.correct, totalMs(s), s.streaks[id] ?? 0) };
  });
  for (const r of s.results) {
    s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
    s.streaks[r.id] = r.streak;
    s.best[r.id] = Math.max(s.best[r.id] ?? 0, r.streak);
    if (r.correct) s.rights[r.id] = (s.rights[r.id] ?? 0) + 1;
  }
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, AKBAR_REVEAL_MS);
  const right = s.results.filter((r) => r.correct);
  if (!right.length) {
    ctx.say?.('لا إجابة صحيحة في هذا السؤال', undefined, KNOW_VOICE.noRight);
    return;
  }
  const fastest = Math.min(...right.map((r) => r.ms ?? 0));
  const first = right.filter((r) => r.ms === fastest);
  const names = first.map((r) => ctx.playerName(r.id)).join(' و');
  ctx.say?.(`أسرع إجابة صحيحة: ${names}`, first.length === 1 ? first[0].id : undefined, voiceFastestRight(names));
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.qs.length) return finish(ctx, s);
  s.round++;
  ask(ctx, s);
}

function maybeReveal(ctx: GameCtx, s: State) {
  if (s.phase !== 'ask') return;
  const waiting = s.participants.filter((p) => !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** A bot's chance of the right side: [for the closest pair, for a pair at least 4× apart]. */
export const AKBAR_BOT_RIGHT: Record<BotLevel, [number, number]> = { easy: [0.5, 0.85], smart: [0.6, 0.93], expert: [0.72, 0.97] };

/** How plain a question is: 0 for two values 10% apart, 1 for 4× apart or more. */
export function easeOf(ratio: number): number {
  return clamp((Math.log(ratio) - Math.log(AKBAR_MIN_RATIO)) / (Math.log(4) - Math.log(AKBAR_MIN_RATIO)), 0, 1);
}

export function botRightChance(level: BotLevel, ratio: number): number {
  const [lo, hi] = AKBAR_BOT_RIGHT[level];
  return lo + (hi - lo) * easeOf(ratio);
}

/** A bot's tap and when it comes: a close pair takes longer to think over. */
export function botAnswer(level: BotLevel, q: Question, seconds: number, rnd: Rnd = Math.random): { choice: Side; delay: number } {
  const right = rnd() < botRightChance(level, q.ratio);
  const choice: Side = right ? q.correct : q.correct === 0 ? 1 : 0;
  const chars = q.group.ask.length + q.a.name.length + q.b.name.length;
  return { choice, delay: quizDelay(level, seconds, chars, easeOf(q.ratio) > 0.45) };
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startAkbar(ctx: GameCtx, participants: string[], raw: AkbarSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeAkbar(raw);
  const seen = roomSeen(ctx, settings.topic);
  const qs = dealPairs(settings.topic, settings.rounds, rnd, seen).map((p) => ({ ...p, correct: winnerSide(p.group, p.a.value, p.b.value) }));
  for (const q of qs) {
    seen.add(q.a.id);
    seen.add(q.b.id);
  }
  const zero = () => Object.fromEntries(participants.map((p) => [p, 0]));
  const s: State = {
    settings,
    participants: [...participants],
    qs,
    round: 0,
    phase: 'ask',
    startedAt: ctx.now,
    endsAt: null,
    answers: {},
    results: null,
    scores: zero(),
    streaks: zero(),
    best: zero(),
    rights: zero(),
    rnd,
  };
  ctx.fx('start');
  ask(ctx, s);
  return s;
}

export const akbar: GameModule<State, AkbarSettings> = {
  id: 'akbar',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startAkbar(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (a.type !== 'answer' || s.phase !== 'ask' || !s.participants.includes(by) || s.answers[by]) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    if (a.choice !== 0 && a.choice !== 1) return;
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

  // everyone answers at once: no «your turn» chime
  turnOf() {
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'ask') return;
    const level = botLevel(ctx);
    const q = s.qs[s.round];
    for (const b of s.participants) {
      if (s.answers[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
      const { choice, delay } = botAnswer(level, q, s.settings.seconds, s.rnd);
      ctx.bot(b, `akbar:${s.round}`, delay, { type: 'answer', round: s.round + 1, choice });
    }
  },

  view(ctx, s, me): AkbarView {
    const q = s.qs[s.round];
    const shown = s.phase !== 'ask';
    const g = q.group;
    const ma = magnitude(g, q.a.value);
    const mb = magnitude(g, q.b.value);
    const top = Math.max(ma, mb);
    return {
      game: 'akbar',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.qs.length,
      label: g.label,
      ask: g.ask,
      names: [q.a.name, q.b.name],
      asOf: g.asOf ?? null,
      approx: !!g.approx,
      endsAt: s.endsAt,
      timerTotal: s.phase === 'ask' ? totalMs(s) : paced(ctx, AKBAR_REVEAL_MS),
      answered: s.participants.filter((p) => !!s.answers[p]),
      mine: s.answers[me]?.choice ?? null,
      correct: shown ? q.correct : null,
      values: shown ? [q.a.value, q.b.value] : null,
      unit: shown ? g.unit : null,
      bars: shown ? [ma / top, mb / top] : null,
      older: !!g.older,
      results: shown ? s.results : null,
      scores: s.scores,
      players: s.participants,
      streaks: s.streaks,
      best: s.best,
      rights: s.rights,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    for (const m of [s.scores, s.answers, s.streaks, s.best, s.rights]) delete m[id];
    if (s.results) s.results = s.results.filter((r) => r.id !== id);
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    if (patch.rounds !== undefined) settings.rounds = snapTo(patch.rounds, AKBAR_ROUNDS, settings.rounds);
    if (patch.seconds !== undefined) settings.seconds = snapTo(patch.seconds, AKBAR_SECONDS, settings.seconds);
    if (isStr(patch.topic) && (AKBAR_TOPICS as string[]).includes(patch.topic)) settings.topic = patch.topic as AkbarTopic;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as AkbarState, Question as AkbarQuestion };
