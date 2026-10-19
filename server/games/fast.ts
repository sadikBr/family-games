/**
 * «الأسرع» — quick reaction mini-games for the whole family (made for the children). Each round is one
 * mini-game drawn from the pool (server/fast-content.ts): its name and what to do, then the stimulus on
 * every phone at the same server moment (`showAt`). Each phone measures its own reaction time from the
 * moment it really displayed the stimulus and sends {answer, ms}; the server checks the answer (the right
 * one never leaves the server before the reveal) and ranks the right answers by their ms: 5 / 3 / 2, then
 * 1 for every other right answer; a wrong answer or a tap before the green costs a point (a total never
 * goes below zero). The round ends when everyone answered or at the time limit; the reveal shows the
 * right answer and the fastest, then the next round starts by itself (or the host taps «التالي»).
 */
import type { BotLevel } from '../../src/shared/protocol';
import {
  FAST_RANK_POINTS,
  FAST_RIGHT_POINTS,
  FAST_ROUNDS,
  FAST_WRONG_POINTS,
  fastSeconds,
  type FastAnswer,
  type FastContent,
  type FastKind,
  type FastResult,
  type FastSettings,
  type FastView,
} from '../../src/shared/games/fast';
import { dealKinds, levelFor, makeFastItem, optionCount, type Rnd } from '../fast-content';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { clamp, isNum } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { FAST_NONE, FAST_VOICE, voiceFastest } from '../voice-calls-fast';
import { placesByScore, soleWinner } from './mcq';

/** The name and the instruction stay alone on the screens this long before the round's screen opens. */
export const FAST_INTRO_MS = 2400;
/** «اضغط عند الأخضر»: the circle stays red between these two durations (random). */
export const FAST_RED_MS: [number, number] = [1500, 4500];
/** The time to answer, from the stimulus. */
export const FAST_LIMIT_MS: Record<FastKind, number> = {
  green: 2500,
  odd: 6000,
  stars: 7000,
  stroop: 5000,
  biggest: 6000,
  arrow: 4000,
  match: 5000,
  sum: 7000,
  order: 8000,
};
/** The round's result stays on the screens this long (at the room's pace). */
export const FAST_REVEAL_MS = 4500;
/** Answers still arriving this long after the limit count (the network). */
export const FAST_GRACE_MS = 400;
/** No person reacts faster than this: a smaller reported time is raised to it. */
export const FAST_MIN_MS = 100;
/** A phone's clock may be off by this much: a reported time can't exceed the server's view by more. */
export const FAST_SKEW_MS = 1500;
/** A tap that reaches the server this long before the green is too early, whatever the phone says. */
export const FAST_EARLY_SLACK_MS = 300;

interface Answer {
  answer: FastAnswer | null;
  ms: number | null;
  early: boolean;
  correct: boolean;
}

interface Round {
  kind: FastKind;
  content: FastContent;
  answer: FastAnswer;
  startAt: number;
  showAt: number;
  /** the last moment to answer (the server waits FAST_GRACE_MS more) */
  limitAt: number;
}

interface State {
  settings: FastSettings;
  participants: string[];
  phase: FastView['phase'];
  kinds: FastKind[];
  /** 0-based */
  round: number;
  cur: Round;
  answers: Record<string, Answer>;
  results: FastResult[] | null;
  scores: Record<string, number>;
  /** reveal: when the next round starts */
  revealEnds: number | null;
  best: FastView['best'];
  /** tests make the content and the bots predictable */
  rnd: Rnd;
}

export function sanitizeFast(raw: Partial<FastSettings>): FastSettings {
  return { rounds: snapRounds(raw?.rounds) };
}

function snapRounds(v: unknown): number {
  if (!isNum(v)) return 8;
  return FAST_ROUNDS.reduce((best, r) => (Math.abs(r - v) < Math.abs(best - v) ? r : best), FAST_ROUNDS[0] as number);
}

const sameAnswer = (a: FastAnswer, b: FastAnswer) =>
  Array.isArray(a) || Array.isArray(b) ? Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]) : a === b;

/** A phone's answer as the content allows it (null: not a valid answer). */
export function parseAnswer(raw: unknown, c: FastContent): FastAnswer | null {
  const n = optionCount(c);
  const ok = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0 && v < n;
  if (c.kind === 'order') {
    if (!Array.isArray(raw) || raw.length !== n || !raw.every(ok) || new Set(raw).size !== n) return null;
    return raw.slice();
  }
  return ok(raw) ? raw : null;
}

function startRound(ctx: GameCtx, s: State) {
  const kind = s.kinds[s.round];
  const item = makeFastItem(kind, levelFor(s.round, s.kinds.length), s.rnd);
  const startAt = ctx.now + paced(ctx, FAST_INTRO_MS);
  const [lo, hi] = FAST_RED_MS;
  const showAt = kind === 'green' ? startAt + Math.round(lo + s.rnd() * (hi - lo)) : startAt;
  s.cur = { kind, content: item.content, answer: item.answer, startAt, showAt, limitAt: showAt + FAST_LIMIT_MS[kind] };
  s.phase = 'play';
  s.answers = {};
  s.results = null;
  s.revealEnds = null;
  ctx.fx('start');
  voiceOnly(ctx, FAST_VOICE[kind]);
}

/** Rank the right answers by their time (equal times share a rank) and score the round. */
export function scoreRound(ids: string[], answers: Record<string, Answer>, totals: Record<string, number>): FastResult[] {
  const rightMs = ids.filter((id) => answers[id]?.correct).map((id) => answers[id].ms ?? 0);
  return ids.map((id) => {
    const a = answers[id];
    if (!a) return { id, answer: null, ms: null, correct: false, early: false, rank: null, points: 0 };
    if (!a.correct) {
      // a wrong answer or a tap before the green: one point less, never below zero
      const points = Math.max(FAST_WRONG_POINTS, -(totals[id] ?? 0)) || 0; // (no −0)
      return { id, answer: a.answer, ms: a.ms, correct: false, early: a.early, rank: null, points };
    }
    const ms = a.ms ?? 0;
    const rank = 1 + rightMs.filter((x) => x < ms).length;
    const points = FAST_RANK_POINTS[rank - 1] ?? FAST_RIGHT_POINTS;
    return { id, answer: a.answer, ms, correct: true, early: false, rank, points };
  });
}

function reveal(ctx: GameCtx, s: State) {
  s.results = scoreRound(s.participants, s.answers, s.scores);
  for (const r of s.results) s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
  s.phase = 'reveal';
  s.revealEnds = ctx.now + paced(ctx, FAST_REVEAL_MS);
  const first = s.results.filter((r) => r.rank === 1);
  if (first.length) {
    const ms = first[0].ms!;
    if (!s.best || ms < s.best.ms) s.best = { id: first[0].id, ms, kind: s.cur.kind };
    const names = first.map((r) => ctx.playerName(r.id));
    ctx.say?.(`الأسرع: ${names.join(' و')} (${fastSeconds(ms)} ث)`, first.length === 1 ? first[0].id : undefined, voiceFastest(names.join(' و')));
  } else {
    ctx.say?.('لا إجابة صحيحة في هذه الجولة', undefined, FAST_NONE);
  }
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.revealEnds = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.kinds.length) return finish(ctx, s);
  s.round++;
  startRound(ctx, s);
}

function maybeReveal(ctx: GameCtx, s: State) {
  if (s.phase !== 'play') return;
  const waiting = s.participants.filter((p) => !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** A simple reaction (the green), by the room's bot strength: [fastest, slowest] in ms. */
export const BOT_BASE_MS: Record<BotLevel, [number, number]> = { easy: [700, 1100], smart: [450, 700], expert: [300, 450] };
/** How much of a mini-game's extra thinking time each strength needs. */
const EXTRA_K: Record<BotLevel, number> = { easy: 1.5, smart: 1.1, expert: 0.8 };
/** How often a bot taps a wrong answer… */
export const BOT_WRONG: Record<BotLevel, number> = { easy: 0.14, smart: 0.05, expert: 0.015 };
/** …or taps while the circle is still red. */
export const BOT_EARLY: Record<BotLevel, number> = { easy: 0.15, smart: 0.04, expert: 0.01 };

/** The thinking a mini-game adds to a simple reaction (finding, reading, counting, adding…). */
function extraMs(c: FastContent): number {
  switch (c.kind) {
    case 'green':
      return 0;
    case 'arrow':
      return 150;
    case 'match':
      return 200 + 40 * c.options.length;
    case 'odd':
      return 250 + 12 * c.cells.length;
    case 'stroop':
      return 420;
    case 'biggest':
      return 300 + 60 * String(Math.max(...c.numbers)).length;
    case 'sum':
      return 600 + 25 * (c.a + c.b);
    case 'stars':
      return 500 + 80 * c.stars.length;
    case 'order':
      return 280 * c.labels.length;
  }
}

/** A bot's reaction time: its strength's range, the mini-game's extra thinking, a natural spread. */
export function botReactionMs(level: BotLevel, c: FastContent, rnd: Rnd = Math.random): number {
  const [lo, hi] = BOT_BASE_MS[level];
  const base = lo + rnd() * (hi - lo);
  // Box–Muller: a person is never exactly as fast twice
  const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
  const ms = (base + extraMs(c) * EXTRA_K[level]) * (1 + clamp(g, -2.5, 2.5) * 0.08);
  return Math.round(Math.max(lo * 0.8, ms));
}

/** A slip: a wrong option, or two numbers swapped in the order. */
function wrongAnswer(r: Round, rnd: Rnd): FastAnswer {
  if (Array.isArray(r.answer)) {
    const a = r.answer.slice();
    const i = Math.floor(rnd() * (a.length - 1));
    [a[i], a[i + 1]] = [a[i + 1], a[i]];
    return a;
  }
  const n = optionCount(r.content);
  const others = Array.from({ length: n }, (_, i) => i).filter((i) => i !== r.answer);
  return others.length ? others[Math.floor(rnd() * others.length)] : r.answer;
}

function planBot(ctx: GameCtx, s: State, b: string) {
  const r = s.cur;
  const level = botLevel(ctx);
  const round = s.round + 1;
  if (r.kind === 'green' && s.rnd() < BOT_EARLY[level]) {
    // too eager: a tap somewhere in the red
    const at = r.startAt + 300 + s.rnd() * Math.max(0, r.showAt - r.startAt - 500);
    ctx.bot(b, `ans:${s.round}`, Math.max(0, at - ctx.now), { type: 'answer', round, early: true });
    return;
  }
  const ms = botReactionMs(level, r.content, s.rnd);
  const answer = s.rnd() < BOT_WRONG[level] ? wrongAnswer(r, s.rnd) : r.answer;
  ctx.bot(b, `ans:${s.round}`, Math.max(0, r.showAt - ctx.now) + ms, { type: 'answer', round, answer, ms });
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startFast(ctx: GameCtx, participants: string[], raw: FastSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeFast(raw);
  const s: State = {
    settings,
    participants: [...participants],
    phase: 'play',
    kinds: dealKinds(settings.rounds, rnd),
    round: 0,
    cur: null as unknown as Round,
    answers: {},
    results: null,
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    revealEnds: null,
    best: null,
    rnd,
  };
  startRound(ctx, s);
  return s;
}

export const fast: GameModule<State, FastSettings> = {
  id: 'fast',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startFast(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (a.type !== 'answer' || s.phase !== 'play' || !s.participants.includes(by) || s.answers[by]) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    const r = s.cur;
    if (ctx.now > r.limitAt + FAST_GRACE_MS) return;
    // bots (and the room's autopilot) report their own planned time; people's times are checked
    const trusted = ctx.isBot(by);
    const sinceShow = ctx.now - r.showAt;
    if (r.kind === 'green' && (a.early === true || (!trusted && sinceShow < -FAST_EARLY_SLACK_MS))) {
      s.answers[by] = { answer: null, ms: null, early: true, correct: false };
      maybeReveal(ctx, s);
      return;
    }
    // nothing to answer before the stimulus is on the screens
    if (!trusted && sinceShow < -FAST_EARLY_SLACK_MS) return;
    const answer = parseAnswer(a.answer, r.content);
    if (answer === null) return;
    let ms = isNum(a.ms) ? a.ms : sinceShow;
    if (!trusted) ms = Math.min(ms, sinceShow + FAST_SKEW_MS);
    ms = Math.round(clamp(ms, FAST_MIN_MS, FAST_LIMIT_MS[r.kind] + FAST_GRACE_MS));
    s.answers[by] = { answer, ms, early: false, correct: sameAnswer(answer, r.answer) };
    maybeReveal(ctx, s);
  },

  tick(ctx, s) {
    if (s.phase === 'play' && ctx.now >= s.cur.limitAt + FAST_GRACE_MS) {
      reveal(ctx, s);
      return true;
    }
    if (s.phase === 'reveal' && s.revealEnds !== null && ctx.now >= s.revealEnds) {
      next(ctx, s);
      return true;
    }
    return false;
  },

  // everyone answers at once, and the round's start sound already calls them: no «your turn» chime
  // every ten seconds on top of it (the turn bar stays hidden, as for any answer everyone gives at once)
  turnOf() {
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    for (const b of s.participants) {
      if (s.answers[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
      planBot(ctx, s, b);
    }
  },

  view(ctx, s, me): FastView {
    const r = s.cur;
    const shown = s.phase !== 'play';
    const mine = s.answers[me];
    return {
      game: 'fast',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.kinds.length,
      kind: r.kind,
      startAt: r.startAt,
      showAt: r.showAt,
      endsAt: s.phase === 'play' ? r.limitAt : s.revealEnds,
      timerTotal: s.phase === 'play' ? FAST_LIMIT_MS[r.kind] : paced(ctx, FAST_REVEAL_MS),
      content: r.content,
      answered: s.participants.filter((p) => !!s.answers[p]),
      mine: mine ? { answer: mine.answer, ms: mine.ms, early: mine.early } : null,
      answer: shown ? r.answer : null,
      results: shown ? s.results : null,
      scores: s.scores,
      players: s.participants,
      best: s.best,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    delete s.answers[id];
    if (s.results) s.results = s.results.filter((r) => r.id !== id);
    if (s.best?.id === id) s.best = null;
    if (s.phase === 'final') return;
    if (s.participants.length < 2) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = snapRounds(patch.rounds);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as FastState };
