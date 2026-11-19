/**
 * «أكمل المثل» — finish the proverb. Each round shows the beginning of a proverb (server/content-mathal.ts)
 * and everyone answers once, at the same time: one of four endings, or the ending typed and compared
 * tolerantly (server/mathal-match.ts). A right answer scores 10, a complete typed ending 15, plus up to 5
 * for speed. The reveal shows the whole proverb, its meaning and everyone's answer, then moves on by
 * itself (or the host taps «الجولة التالية»). Nothing of the ending leaves the server before the reveal:
 * typed mode doesn't even send the options. Rounds: server/mathal-deck.ts; bots: server/mathal-bots.ts.
 */
import {
  MATHAL_DEFAULTS,
  MATHAL_MODES,
  MATHAL_ROUNDS,
  MATHAL_SECONDS,
  MATHAL_SOURCES,
  mathalPoints,
  type MathalGrade,
  type MathalMode,
  type MathalResult,
  type MathalSettings,
  type MathalSourceSetting,
  type MathalView,
} from '../../src/shared/games/mathal';
import { botAnswer } from '../mathal-bots';
import { buildMathal, type MathalItem } from '../mathal-deck';
import { gradeTyped } from '../mathal-match';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { KNOW_VOICE, voiceFastestRight } from '../voice-calls-knowledge';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { placesByScore, soleWinner } from './mcq';
import { snapTo } from './speedquiz';

/** How long the reveal stays (before the room's pace): the meaning takes a moment to read. */
export const MATHAL_REVEAL_MS = 8000;
/** The longest typed answer kept. */
export const MATHAL_MAX_TEXT = 80;

type Rnd = () => number;

interface Answer {
  choice: number | null;
  text: string | null;
  at: number;
}

interface Scored extends MathalResult {
  ms: number | null;
}

export interface MathalState {
  settings: MathalSettings;
  participants: string[];
  items: MathalItem[];
  /** 0-based */
  round: number;
  phase: 'ask' | 'reveal' | 'final';
  startedAt: number;
  endsAt: number | null;
  answers: Record<string, Answer>;
  results: Scored[] | null;
  scores: Record<string, number>;
  rights: Record<string, number>;
  rnd: Rnd;
}

const oneOf = <T extends string>(v: unknown, keys: { key: T }[], d: T): T => (isStr(v) && keys.some((k) => k.key === v) ? (v as T) : d);

export function sanitizeMathal(raw: Partial<MathalSettings> | undefined): MathalSettings {
  return {
    rounds: snapTo(raw?.rounds, MATHAL_ROUNDS, MATHAL_DEFAULTS.rounds),
    seconds: snapTo(raw?.seconds, MATHAL_SECONDS, MATHAL_DEFAULTS.seconds),
    mode: oneOf<MathalMode>(raw?.mode, MATHAL_MODES, MATHAL_DEFAULTS.mode),
    source: oneOf<MathalSourceSetting>(raw?.source, MATHAL_SOURCES, MATHAL_DEFAULTS.source),
  };
}

const typedMode = (s: MathalState) => s.settings.mode === 'typed';
const totalMs = (s: MathalState) => s.settings.seconds * 1000;

/** A typed answer as kept: one line, trimmed, at most MATHAL_MAX_TEXT characters. */
export function cleanText(v: unknown): string | null {
  if (!isStr(v)) return null;
  const t = v.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? [...t].slice(0, MATHAL_MAX_TEXT).join('') : null;
}

function ask(ctx: GameCtx, s: MathalState) {
  s.phase = 'ask';
  s.answers = {};
  s.results = null;
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + totalMs(s);
  ctx.fx('reveal');
}

function gradeOf(s: MathalState, it: MathalItem, a: Answer | undefined): MathalGrade {
  if (!a) return 'none';
  if (typedMode(s)) return a.text ? gradeTyped(a.text, it.p) : 'none';
  return a.choice === it.correct ? 'exact' : 'wrong';
}

function reveal(ctx: GameCtx, s: MathalState) {
  const it = s.items[s.round];
  const results: Scored[] = s.participants.map((id) => {
    const a = s.answers[id];
    const grade = gradeOf(s, it, a);
    const ms = a ? a.at - s.startedAt : null;
    return { id, choice: a?.choice ?? null, text: a?.text ?? null, grade, points: mathalPoints(grade, typedMode(s), ms ?? 0, totalMs(s)), fastest: false, ms };
  });
  const right = results.filter((r) => r.grade === 'exact' || r.grade === 'close');
  const best = right.length ? Math.min(...right.map((r) => r.ms ?? 0)) : null;
  for (const r of results) {
    if (best !== null && r.ms === best && (r.grade === 'exact' || r.grade === 'close')) r.fastest = true;
    s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
    if (r.points > 0) s.rights[r.id] = (s.rights[r.id] ?? 0) + 1;
  }
  s.results = results;
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, MATHAL_REVEAL_MS);
  if (!right.length) {
    ctx.say?.('لا إجابة صحيحة في هذه الجولة', undefined, KNOW_VOICE.noRight);
    return;
  }
  const first = results.filter((r) => r.fastest);
  const names = first.map((r) => ctx.playerName(r.id)).join(' و');
  ctx.say?.(`أسرع إجابة صحيحة: ${names}`, first.length === 1 ? first[0].id : undefined, voiceFastestRight(names));
}

function finish(ctx: GameCtx, s: MathalState) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: MathalState) {
  if (s.round + 1 >= s.items.length) return finish(ctx, s);
  s.round++;
  ask(ctx, s);
}

/** Reveal as soon as everyone still here has answered (a phone that went away isn't waited for). */
function maybeReveal(ctx: GameCtx, s: MathalState) {
  if (s.phase !== 'ask') return;
  const waiting = s.participants.filter((p) => !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

export function startMathal(ctx: GameCtx, participants: string[], raw: Partial<MathalSettings> | undefined, rnd: Rnd = Math.random): MathalState {
  const settings = sanitizeMathal(raw);
  const s: MathalState = {
    settings,
    participants: [...participants],
    items: buildMathal(ctx, settings, rnd),
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

export function mathalView(ctx: GameCtx, s: MathalState, me: string): MathalView {
  const it = s.items[s.round];
  const shown = s.phase !== 'ask';
  const typed = typedMode(s);
  const mine = s.answers[me];
  return {
    game: 'mathal',
    phase: s.phase,
    round: s.round + 1,
    rounds: s.items.length,
    mode: s.settings.mode,
    source: it.p.source,
    start: it.p.start,
    // typed mode never sends the options: the right ending is one of them
    options: typed ? null : it.options,
    endsAt: s.endsAt,
    timerTotal: s.phase === 'ask' ? totalMs(s) : paced(ctx, MATHAL_REVEAL_MS),
    answered: s.participants.filter((p) => !!s.answers[p]),
    myChoice: mine?.choice ?? null,
    myText: mine?.text ?? null,
    correct: shown && !typed ? it.correct : null,
    end: shown ? it.p.end : null,
    meaning: shown ? it.p.meaning : null,
    results: shown && s.results ? s.results.map((r) => ({ id: r.id, choice: r.choice, text: r.text, grade: r.grade, points: r.points, fastest: r.fastest })) : null,
    scores: s.scores,
    players: s.participants,
    rights: s.rights,
  };
}

export const mathal: GameModule<MathalState, MathalSettings> = {
  id: 'mathal',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startMathal(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (a.type !== 'answer' || s.phase !== 'ask' || !s.participants.includes(by) || s.answers[by]) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    if (ctx.now > (s.endsAt ?? 0)) return;
    const it = s.items[s.round];
    if (typedMode(s)) {
      const text = cleanText(a.text);
      if (!text) return;
      s.answers[by] = { choice: null, text, at: ctx.now };
    } else {
      if (!isNum(a.choice) || !Number.isInteger(a.choice) || a.choice < 0 || a.choice >= it.options.length) return;
      s.answers[by] = { choice: a.choice, text: null, at: ctx.now };
    }
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
    const it = s.items[s.round];
    for (const b of s.participants) {
      if (s.answers[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
      const { choice, text, delay } = botAnswer(level, it, typedMode(s), s.settings.seconds, s.rnd);
      ctx.bot(b, `mathal:${s.round}`, delay, { type: 'answer', round: s.round + 1, ...(text !== undefined ? { text } : { choice }) });
    }
  },

  view(ctx, s, me) {
    return mathalView(ctx, s, me);
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
    const next = sanitizeMathal({ ...settings, ...patch } as Partial<MathalSettings>);
    if (patch.rounds !== undefined) settings.rounds = next.rounds;
    if (patch.seconds !== undefined) settings.seconds = next.seconds;
    if (patch.mode !== undefined) settings.mode = next.mode;
    if (patch.source !== undefined) settings.source = next.source;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};
