/**
 * «رتّب الخطوات» — everyone gets the same shuffled steps (of wudu, umrah, the Hijri months, the
 * ghazawat…) and races to put them in order on their own phone.
 *
 * Score per round: 600 × (steps in their right position ÷ steps), plus — only when the whole order is
 * right — up to 400 for speed (time left when sent). Per-position credit is easy to see on the reveal
 * (each step is green or red) and rewards knowing part of a sequence; keeping the speed bonus for a
 * perfect order means guessing fast never pays. The round ends when everyone has sent or time is up.
 */
import type { BotLevel } from '../../src/shared/protocol';
import {
  STEPS_CATEGORIES,
  stepsPoints,
  stepsRight,
  type StepsCategory,
  type StepsLevel,
  type StepsResult,
  type StepsSettings,
  type StepsView,
} from '../../src/shared/games/steps';
import { randDelay } from '../cardkit';
import { soleWinner } from './mcq';
import { qdeck } from '../qdeck';
import { STEP_SEQS, type StepSeq } from '../steps-content';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, isStr, shuffle } from '../util';
import { ASK, voiceFinal, voiceOnly, voiceOrder } from '../voice-calls-party';

/** how long the answer stays on screen before the next round (the host may go on sooner) */
export const STEPS_REVEAL_MS = 14_000;
const LEVELS: StepsLevel[] = ['easy', 'medium', 'hard'];
const CATS = STEPS_CATEGORIES.map((c) => c.key);

interface State {
  settings: StepsSettings;
  participants: string[];
  phase: StepsView['phase'];
  seqs: StepSeq[];
  /** 0-based index into seqs */
  round: number;
  /** the current steps, shuffled */
  items: string[];
  /** the right order, as indexes into items */
  correct: number[];
  startedAt: number;
  endsAt: number | null;
  timerTotal: number;
  subs: Record<string, { order: number[]; at: number }>;
  results: StepsResult[] | null;
  scores: Record<string, number>;
}

export function sanitizeSteps(raw: Partial<StepsSettings>): StepsSettings {
  return {
    rounds: isNum(raw.rounds) ? clamp(Math.round(raw.rounds), 3, 12) : 6,
    seconds: isNum(raw.seconds) ? clamp(Math.round(raw.seconds / 10) * 10, 30, 120) : 60,
    category: CATS.includes(raw.category as StepsCategory) ? (raw.category as StepsCategory | 'all') : 'all',
    level: LEVELS.includes(raw.level as StepsLevel) ? (raw.level as StepsLevel) : 'medium',
  };
}

export function stepsPool(category: StepsSettings['category']): StepSeq[] {
  return category === 'all' ? STEP_SEQS : STEP_SEQS.filter((q) => q.cat === category);
}

/** A shuffle of the steps that is never already in the right order. */
export function shuffleSteps(seq: StepSeq): { items: string[]; correct: number[] } {
  const n = seq.steps.length;
  let perm = shuffle([...Array(n).keys()]);
  for (let k = 0; k < 20 && perm.every((v, i) => v === i); k++) perm = shuffle(perm);
  if (perm.every((v, i) => v === i)) perm = [...perm.slice(1), perm[0]];
  // items[i] is step perm[i]; the right order lists, for each step, where it sits in items
  const items = perm.map((p) => seq.steps[p]);
  const correct = seq.steps.map((_, step) => perm.indexOf(step));
  return { items, correct };
}

function startRound(ctx: GameCtx, s: State) {
  const { items, correct } = shuffleSteps(s.seqs[s.round]);
  s.items = items;
  s.correct = correct;
  s.subs = {};
  s.results = null;
  s.phase = 'play';
  s.startedAt = ctx.now;
  s.timerTotal = s.settings.seconds * 1000;
  s.endsAt = ctx.now + s.timerTotal;
  ctx.fx('start');
  voiceOnly(ctx, ASK.steps(s.seqs[s.round].title));
}

function reveal(ctx: GameCtx, s: State) {
  const total = s.timerTotal;
  s.results = s.participants.map((id) => {
    const sub = s.subs[id];
    if (!sub) return { id, order: null, right: 0, points: 0, ms: null };
    const right = stepsRight(sub.order, s.correct);
    const ms = sub.at - s.startedAt;
    const points = stepsPoints(right, s.correct.length, total - ms, total);
    s.scores[id] = (s.scores[id] ?? 0) + points;
    return { id, order: sub.order, right, points, ms };
  });
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, STEPS_REVEAL_MS);
  ctx.fx('reveal');
  voiceOnly(ctx, voiceOrder(s.seqs[s.round].steps));
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  ctx.fx('win', soleWinner(s.scores));
  if (s.participants.length) voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.seqs.length) return finish(ctx, s);
  s.round++;
  startRound(ctx, s);
}

/** Everyone still here (online or played by a bot) has sent: no need to wait for the clock. */
function maybeReveal(ctx: GameCtx, s: State) {
  if (s.phase !== 'play') return;
  const waiting = s.participants.filter((p) => !s.subs[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/**
 * The room's bot strength as the old per-game level (that lobby setting is gone; old apps may still send
 * it, it is kept but ignored): easy = the old default «متوسط», smart = «صعب», expert = better still.
 */
type BotSkill = StepsLevel | 'expert';
const SKILL: Record<BotLevel, BotSkill> = { easy: 'medium', smart: 'hard', expert: 'expert' };

/** How many neighbouring steps a bot swaps by mistake. */
function botSlips(level: BotSkill, rnd: () => number): number {
  const r = rnd();
  if (level === 'easy') return r < 0.25 ? 0 : r < 0.75 ? 1 : 2;
  if (level === 'medium') return r < 0.65 ? 0 : 1;
  if (level === 'hard') return r < 0.9 ? 0 : 1;
  return r < 0.97 ? 0 : 1;
}

/** A bot's order: the right one, with a few neighbouring steps swapped depending on its level. */
export function botOrder(correct: readonly number[], level: BotSkill, rnd: () => number = Math.random): number[] {
  const order = correct.slice();
  const slips = botSlips(level, rnd);
  for (let k = 0; k < slips; k++) {
    const i = Math.floor(rnd() * (order.length - 1));
    [order[i], order[i + 1]] = [order[i + 1], order[i]];
  }
  return order;
}

/**
 * When a bot sends. Easy / smart: a share of the timer (people get the speed points first). Expert: like a
 * person who knows the sequence: reads every step and drags it into place (~1.6 s a step, more for long
 * steps), never more than half the timer.
 */
function botDelay(s: State, level: BotSkill): number {
  const total = s.timerTotal;
  const n = s.correct.length;
  if (level === 'expert') {
    const chars = s.items.reduce((t, x) => t + x.length, 0);
    const ms = 1500 + n * 1300 + chars * 25 + randDelay(0, 2000);
    return Math.round(Math.min(ms, total * 0.5));
  }
  const [lo, hi] = level === 'easy' ? [0.45, 0.85] : level === 'medium' ? [0.35, 0.75] : [0.25, 0.6];
  return Math.max(n * 1500, randDelay(total * lo, total * hi));
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

/** For result(): the highest `score` first; equal scores share a place. */
function placesByScore(ids: string[], score: (id: string) => number): string[][] {
  const out: string[][] = [];
  let prev: number | null = null;
  for (const id of [...ids].sort((a, b) => score(b) - score(a))) {
    const v = score(id);
    if (v === prev) out[out.length - 1].push(id);
    else out.push([id]);
    prev = v;
  }
  return out;
}

export const steps: GameModule<State, StepsSettings> = {
  id: 'steps',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    const settings = sanitizeSteps(raw);
    const seqs = qdeck(ctx, `steps:${settings.category}`, stepsPool(settings.category)).deal(settings.rounds);
    const s: State = {
      settings,
      participants: [...participants],
      phase: 'play',
      seqs,
      round: 0,
      items: [],
      correct: [],
      startedAt: ctx.now,
      endsAt: null,
      timerTotal: settings.seconds * 1000,
      subs: {},
      results: null,
      scores: Object.fromEntries(participants.map((p) => [p, 0])),
    };
    startRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (a.type !== 'submit' || s.phase !== 'play' || !s.participants.includes(by) || s.subs[by]) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    const order = a.order;
    const n = s.items.length;
    if (!Array.isArray(order) || order.length !== n) return;
    if (!order.every((v) => isNum(v) && Number.isInteger(v) && v >= 0 && v < n) || new Set(order).size !== n) return;
    s.subs[by] = { order: order as number[], at: ctx.now };
    ctx.fx('throw', by);
    maybeReveal(ctx, s);
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'play') reveal(ctx, s);
    else if (s.phase === 'reveal') next(ctx, s);
    else return false;
    return true;
  },

  turnOf(s) {
    return s.phase === 'play' ? s.participants.filter((p) => !s.subs[p]) : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const level = SKILL[botLevel(ctx)];
    for (const b of s.participants) {
      if (s.subs[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
      ctx.bot(b, `sub:${s.round}`, botDelay(s, level), { type: 'submit', round: s.round + 1, order: botOrder(s.correct, level) });
    }
  },

  view(ctx, s, me): StepsView {
    const seq = s.seqs[s.round];
    const shown = s.phase !== 'play';
    return {
      game: 'steps',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.seqs.length,
      label: STEPS_CATEGORIES.find((c) => c.key === seq.cat)?.label ?? '',
      title: seq.title,
      items: s.items,
      endsAt: s.endsAt,
      timerTotal: s.phase === 'reveal' ? paced(ctx, STEPS_REVEAL_MS) : s.timerTotal,
      submitted: Object.keys(s.subs).filter((id) => s.participants.includes(id)),
      mine: s.subs[me]?.order ?? null,
      correct: shown ? s.correct : null,
      note: shown ? (seq.note ?? null) : null,
      results: s.results,
      scores: s.scores,
      players: s.participants,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = clamp(Math.round(patch.rounds), 3, 12);
    if (isNum(patch.seconds)) settings.seconds = clamp(Math.round(patch.seconds / 10) * 10, 30, 120);
    if (isStr(patch.category) && CATS.includes(patch.category as StepsCategory)) settings.category = patch.category as StepsSettings['category'];
    if (isStr(patch.level) && LEVELS.includes(patch.level as StepsLevel)) settings.level = patch.level as StepsLevel;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, (id) => s.scores[id] ?? 0) };
  },
};

export type { State as StepsState };
