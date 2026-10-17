/**
 * «من القائل؟» — words of a verse that the Quran reports someone saying; everyone picks the speaker from
 * 4 names on their own phone. A timed race like «مسابقة إسلامية»: a right answer scores 500 + up to 500
 * for speed. After each question the reference (surah and verse) is shown.
 * The quote is read from the complete Quran text by reference (see qquote-content.ts), never typed.
 */
import type { McqResult } from '../../src/shared/protocol';
import { QQUOTE_LEVELS, QQUOTE_ROUNDS, QQUOTE_SECONDS, type QquoteLevel, type QquoteSettings, type QquoteView } from '../../src/shared/games/qquote';
import { QQUOTES, type QquoteEntry } from '../qquote-content';
import { verseRef, verseSlice } from '../qquote-quran';
import { qdeck } from '../qdeck';
import { type GameCtx, type GameModule } from '../types';
import { isNum, randInt, shuffle } from '../util';
import { botAnswerDelay, mcqOptions, soleWinner } from './mcq';

export const REVEAL_MS = 7000;

/** The entries each level draws from: easy = level 1, medium = levels 1–2, hard = all. */
const MAX_LEVEL: Record<QquoteLevel, number> = { easy: 1, medium: 2, hard: 3 };
export const qquotePool = (level: QquoteLevel): QquoteEntry[] => QQUOTES.filter((q) => q.level <= MAX_LEVEL[level]);

/** Bots know the famous stories well, the details less. */
export const QQUOTE_BOT_SKILL: Record<QquoteLevel, number> = { easy: 0.75, medium: 0.6, hard: 0.5 };

export interface QquoteItem {
  text: string;
  options: string[];
  correct: number;
  ref: string;
}

interface State {
  settings: QquoteSettings;
  participants: string[];
  items: QquoteItem[];
  round: number;
  phase: QquoteView['phase'];
  endsAt: number | null;
  startedAt: number;
  seconds: number;
  answers: Record<string, { choice: number; at: number }>;
  results: McqResult[] | null;
  scores: Record<string, number>;
}

/** One question: the quoted words, the speaker among 3 of the wrong names, and the reference. */
export function qquoteItem(q: QquoteEntry): QquoteItem {
  const text = verseSlice(q.surah, q.ayah, q.from, q.to);
  if (!text) throw new Error(`qquote: no verse ${q.surah}:${q.ayah}`);
  const wrong = shuffle(q.wrong.filter((w) => w !== q.speaker)).slice(0, 3);
  return { text, ...mcqOptions(q.speaker, wrong), ref: verseRef(q.surah, q.ayah) };
}

function ask(ctx: GameCtx, s: State) {
  s.round += 1;
  s.answers = {};
  s.results = null;
  s.phase = 'ask';
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + s.seconds * 1000;
  ctx.fx('reveal');
}

function reveal(ctx: GameCtx, s: State) {
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
  // each phone plays «correct» or «wrong» for its own player (see useMyResultFx)
}

/** Everyone still able to answer has answered: reveal now. */
function revealIfAllIn(ctx: GameCtx, s: State, gone?: string) {
  if (s.phase !== 'ask') return;
  const waiting = s.participants.filter((p) => p !== gone && !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

export const qquote: GameModule<State, QquoteSettings> = {
  id: 'qquote',

  start(ctx, participants, settings) {
    const pool = qquotePool(settings.level);
    // the room's deck keeps questions from coming back until the whole level has been played
    const items = qdeck(ctx, `qquote:${settings.level}`, pool).deal(settings.rounds).map(qquoteItem);
    const s: State = {
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
    if (!isNum(a.choice) || !Number.isInteger(a.choice) || a.choice < 0 || a.choice >= item.options.length) return;
    s.answers[by] = { choice: a.choice, at: ctx.now };
    revealIfAllIn(ctx, s);
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'ask') reveal(ctx, s);
    else if (s.phase === 'reveal') {
      if (s.round >= s.items.length) {
        s.phase = 'final';
        s.endsAt = null;
        ctx.fx('win', soleWinner(s.scores));
      } else ask(ctx, s);
    }
    return true;
  },

  turnOf(s) {
    return s.phase === 'ask' ? s.participants.filter((p) => !s.answers[p]) : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'ask') return;
    const item = s.items[s.round - 1];
    for (const b of bots) {
      if (!s.participants.includes(b) || s.answers[b]) continue;
      const right = Math.random() < QQUOTE_BOT_SKILL[s.settings.level];
      const wrong = [...item.options.keys()].filter((k) => k !== item.correct);
      const choice = right ? item.correct : wrong[randInt(0, wrong.length - 1)];
      ctx.bot(b, `ans:${s.round}`, botAnswerDelay(s.seconds), { type: 'answer', choice });
    }
  },

  view(ctx, s, me): QquoteView {
    const item = s.items[Math.max(0, s.round - 1)];
    const shown = s.phase !== 'ask';
    return {
      game: 'qquote',
      phase: s.phase,
      round: s.round,
      rounds: s.items.length,
      label: QQUOTE_LEVELS.find((l) => l.key === s.settings.level)?.label ?? '',
      text: item.text,
      options: item.options,
      endsAt: s.endsAt,
      seconds: s.seconds,
      answered: Object.keys(s.answers),
      myAnswer: s.answers[me]?.choice ?? null,
      correct: shown ? item.correct : null,
      ref: shown ? item.ref : null,
      results: s.results,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, who) {
    // a player who left for good drops out of the scores; the others play on
    s.participants = s.participants.filter((p) => p !== who);
    delete s.scores[who];
    delete s.answers[who];
    if (s.results) s.results = s.results.filter((r) => r.id !== who);
    revealIfAllIn(ctx, s);
  },

  patchSettings(settings, patch) {
    const step = (v: number, r: { min: number; max: number; step: number }) => Math.max(r.min, Math.min(r.max, Math.round(v / r.step) * r.step));
    if (isNum(patch.rounds)) settings.rounds = step(patch.rounds, QQUOTE_ROUNDS);
    if (isNum(patch.seconds)) settings.seconds = step(patch.seconds, QQUOTE_SECONDS);
    if (patch.level === 'easy' || patch.level === 'medium' || patch.level === 'hard') settings.level = patch.level;
  },
};

export type { State as QquoteState };
