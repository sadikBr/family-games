/**
 * «ابنِ المسجد» — server rules. A cooperative build: each round everyone answers the same question on
 * their own phone; right answers earn bricks (a bonus for answering in the first half of the timer)
 * and enough bricks finish the next piece of the mosque. Finish all nine pieces before the rounds
 * (set by the level) run out.
 */
import {
  MOSQUE_BRICKS_FAST,
  MOSQUE_BRICKS_PER_PLAYER,
  MOSQUE_BRICKS_RIGHT,
  MOSQUE_DEFAULTS,
  MOSQUE_PIECES,
  MOSQUE_ROUNDS,
  type MosqueLevel,
  type MosqueResult,
  type MosqueSettings,
  type MosqueView,
} from '../../src/shared/games/mosque';
import { QUESTIONS, Q_CATS } from '../content-islamic';
import { MOSQUE_FACTS, fromBank, type MosqueQuestion } from '../mosque-facts';
import { qdeck } from '../qdeck';
import { type GameCtx, type GameModule } from '../types';
import { clamp, isNum, randInt } from '../util';
import { botAnswerDelay, mcqOptions } from './mcq';

export const MOSQUE_REVEAL_MS = 5500;
/** A finished piece gets a little longer on screen to enjoy it. */
export const MOSQUE_BUILT_MS = 8000;
/** How often a bot team-mate answers right. */
export const MOSQUE_BOT_SKILL = 0.7;

const LEVELS: MosqueLevel[] = ['easy', 'normal', 'hard'];
const label = (cat: string) => Q_CATS.find((c) => c.key === cat)?.label ?? '';

/** The room's question pool: the Islamic bank plus a few mosque-architecture facts. */
export const MOSQUE_POOL: MosqueQuestion[] = [...QUESTIONS.map((q) => fromBank(q, label(q.cat))), ...MOSQUE_FACTS];

interface Item {
  text: string;
  options: string[];
  correct: number;
  label: string;
}

export interface MosqueState {
  settings: MosqueSettings;
  participants: string[];
  level: MosqueLevel;
  items: Item[];
  /** 1-based */
  round: number;
  phase: MosqueView['phase'];
  endsAt: number | null;
  startedAt: number;
  seconds: number;
  answers: Record<string, { choice: number; at: number }>;
  results: MosqueResult[] | null;
  built: number;
  bricks: number;
  justBuilt: number[];
  earned: number;
  stats: Record<string, { right: number; bricks: number }>;
  completed: boolean | null;
}

/** Bricks one piece needs: a full, fast, right round from everyone builds exactly one piece. */
export function mosqueCost(players: number): number {
  return MOSQUE_BRICKS_PER_PLAYER * Math.max(1, players);
}

/** Bricks for one answer. */
export function mosqueBricks(correct: boolean, fast: boolean): number {
  return correct ? MOSQUE_BRICKS_RIGHT + (fast ? MOSQUE_BRICKS_FAST : 0) : 0;
}

/** Lay bricks: finish as many pieces as they pay for (the rest carries over to the next piece). */
function build(s: MosqueState) {
  const cost = mosqueCost(s.participants.length);
  while (s.built < MOSQUE_PIECES.length && s.bricks >= cost) {
    s.bricks -= cost;
    s.justBuilt.push(s.built);
    s.built += 1;
  }
  if (s.built >= MOSQUE_PIECES.length) s.bricks = 0;
}

function active(ctx: GameCtx, s: MosqueState) {
  return s.participants.filter((p) => ctx.isConnected(p) || ctx.isBot(p));
}

function ask(ctx: GameCtx, s: MosqueState) {
  s.round += 1;
  s.phase = 'ask';
  s.answers = {};
  s.results = null;
  s.justBuilt = [];
  s.earned = 0;
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + s.seconds * 1000;
  ctx.fx('card');
}

function reveal(ctx: GameCtx, s: MosqueState) {
  const item = s.items[s.round - 1];
  const half = (s.seconds * 1000) / 2;
  s.justBuilt = [];
  s.results = s.participants.map((id) => {
    const a = s.answers[id];
    const correct = !!a && a.choice === item.correct;
    const fast = correct && a.at - s.startedAt <= half;
    const bricks = mosqueBricks(correct, fast);
    const st = (s.stats[id] ??= { right: 0, bricks: 0 });
    if (correct) st.right += 1;
    st.bricks += bricks;
    return { id, choice: a ? a.choice : null, correct, fast, bricks };
  });
  s.earned = s.results.reduce((t, r) => t + r.bricks, 0);
  s.bricks += s.earned;
  build(s);
  s.phase = 'reveal';
  s.endsAt = ctx.now + (s.justBuilt.length ? MOSQUE_BUILT_MS : MOSQUE_REVEAL_MS);
  // each phone plays its own right / wrong sound; a finished piece is celebrated by everyone
  if (s.justBuilt.length) ctx.fx('reveal');
}

function finish(ctx: GameCtx, s: MosqueState, completed: boolean) {
  s.phase = 'final';
  s.endsAt = null;
  s.completed = completed;
  ctx.fx(completed ? 'win' : 'skip');
}

function next(ctx: GameCtx, s: MosqueState) {
  if (s.built >= MOSQUE_PIECES.length) finish(ctx, s, true);
  else if (s.round >= s.items.length) finish(ctx, s, false);
  else ask(ctx, s);
}

export const mosque: GameModule<MosqueState, MosqueSettings> = {
  id: 'mosque',

  start(ctx, participants, settings) {
    const level = LEVELS.includes(settings.level) ? settings.level : MOSQUE_DEFAULTS.level;
    const rounds = MOSQUE_ROUNDS[level];
    const items = qdeck(ctx, 'mosque:q', MOSQUE_POOL)
      .deal(rounds)
      .map((q) => ({ text: q.q, ...mcqOptions(q.a, q.w), label: q.label }));
    const s: MosqueState = {
      settings,
      participants: [...participants],
      level,
      items,
      round: 0,
      phase: 'ask',
      endsAt: null,
      startedAt: ctx.now,
      seconds: clamp(Math.round(settings.seconds ?? MOSQUE_DEFAULTS.seconds), 10, 30),
      answers: {},
      results: null,
      built: 0,
      bricks: 0,
      justBuilt: [],
      earned: 0,
      stats: Object.fromEntries(participants.map((p) => [p, { right: 0, bricks: 0 }])),
      completed: null,
    };
    ctx.fx('start');
    ask(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type !== 'answer' || s.phase !== 'ask' || !s.participants.includes(by) || s.answers[by]) return;
    const item = s.items[s.round - 1];
    if (!isNum(a.choice) || !Number.isInteger(a.choice) || a.choice < 0 || a.choice >= item.options.length) return;
    s.answers[by] = { choice: a.choice, at: ctx.now };
    if (active(ctx, s).every((p) => s.answers[p])) reveal(ctx, s);
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'ask') reveal(ctx, s);
    else if (s.phase === 'reveal') next(ctx, s);
    return true;
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'ask') return;
    const item = s.items[s.round - 1];
    const peopleWaiting = s.participants.some((p) => !bots.includes(p) && !s.answers[p] && ctx.isConnected(p));
    for (const b of bots) {
      if (!s.participants.includes(b) || s.answers[b]) continue;
      const right = Math.random() < MOSQUE_BOT_SKILL;
      const wrong = item.options.map((_, i) => i).filter((i) => i !== item.correct);
      const choice = right ? item.correct : wrong[randInt(0, wrong.length - 1)];
      // team-mates: they let the people answer first, then don't keep anyone waiting
      if (peopleWaiting) ctx.bot(b, `ans:${s.round}`, botAnswerDelay(s.seconds), { type: 'answer', choice });
      else ctx.bot(b, `ans-now:${s.round}`, randInt(600, 1600), { type: 'answer', choice });
    }
  },

  turnOf(s) {
    return s.phase === 'ask' ? s.participants.filter((p) => !s.answers[p]) : [];
  },

  view(_ctx, s, me): MosqueView {
    const item = s.items[Math.max(0, s.round - 1)];
    const shown = s.phase !== 'ask';
    return {
      game: 'mosque',
      phase: s.phase,
      level: s.level,
      round: s.round,
      rounds: s.items.length,
      label: item.label,
      text: item.text,
      options: item.options,
      endsAt: s.endsAt,
      timerTotal: s.seconds * 1000,
      participants: s.participants,
      answered: Object.keys(s.answers),
      myAnswer: s.answers[me]?.choice ?? null,
      correct: shown ? item.correct : null,
      results: shown ? s.results : null,
      built: s.built,
      bricks: s.bricks,
      cost: mosqueCost(s.participants.length),
      justBuilt: s.phase === 'reveal' ? s.justBuilt : [],
      earned: s.phase === 'reveal' ? s.earned : 0,
      stats: s.stats,
      completed: s.phase === 'final' ? !!s.completed : null,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.answers[id];
    if (s.phase === 'final') return;
    if (!s.participants.length) {
      s.phase = 'final';
      s.endsAt = null;
      s.completed = false;
      return;
    }
    // fewer builders: the next pieces need fewer bricks (bricks already laid may finish one now)
    build(s);
    if (s.phase === 'ask' && active(ctx, s).every((p) => s.answers[p])) reveal(ctx, s);
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (LEVELS.includes(patch.level as MosqueLevel)) settings.level = patch.level as MosqueLevel;
    if (isNum(patch.seconds)) settings.seconds = clamp(Math.round(patch.seconds / 5) * 5, 10, 30);
  },
};
