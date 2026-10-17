/**
 * «من هو؟» — clues about a prophet, companion, place or historical figure appear one by one.
 * Each player gets one guess per round; the earlier you guess right, the more points:
 * after clue 1 = 400, clue 2 = 300, clue 3 = 200, clue 4 = 100.
 */
import type { McqResult, WhoisSettings, WhoisView } from '../../src/shared/protocol';
import { WHO, WHO_CAT_LABEL, type WhoEntry } from '../content-islamic';
import { qdeck } from '../qdeck';
import { type GameModule } from '../types';
import { isNum, randInt, shuffle } from '../util';
import { soleWinner } from './mcq';

const CLUE_MS = 7000;
const LAST_MS = 9000; // time after the last clue
const REVEAL_MS = 5500;
const OPTIONS = 6;
/** Chance that a bot dares to guess at clue 1, 2, 3, 4 (it always guesses at the last one)… */
export const BOT_GO = [0.15, 0.3, 0.55, 1];
/** …and how often that guess is right. */
export const BOT_RIGHT = [0.45, 0.6, 0.75, 0.85];

interface State {
  settings: WhoisSettings;
  participants: string[];
  entries: WhoEntry[];
  options: string[];
  round: number;
  phase: WhoisView['phase'];
  shown: number;
  nextClueAt: number | null;
  endsAt: number | null;
  guesses: Record<string, { choice: number; clue: number }>;
  results: McqResult[] | null;
  scores: Record<string, number>;
  botAt: Record<string, { clue: number; go: boolean; right: boolean }>;
}

const answerIdx = (s: State) => s.options.indexOf(s.entries[s.round - 1].name);

function newRound(now: number, s: State) {
  s.round += 1;
  const e = s.entries[s.round - 1];
  const same = shuffle(WHO.filter((w) => w.cat === e.cat && w.name !== e.name)).slice(0, OPTIONS - 1);
  s.options = shuffle([e.name, ...same.map((w) => w.name)]);
  s.phase = 'ask';
  s.shown = 1;
  s.guesses = {};
  s.results = null;
  s.botAt = {};
  s.nextClueAt = now + CLUE_MS;
  s.endsAt = null;
}

function finishRound(now: number, s: State) {
  const ans = answerIdx(s);
  s.results = s.participants.map((id) => {
    const g = s.guesses[id];
    const correct = !!g && g.choice === ans;
    const points = correct ? (5 - g.clue) * 100 : 0;
    s.scores[id] = (s.scores[id] ?? 0) + points;
    return { id, choice: g ? g.choice : null, correct, points };
  });
  s.phase = 'reveal';
  s.shown = s.entries[s.round - 1].clues.length;
  s.nextClueAt = null;
  s.endsAt = now + REVEAL_MS;
}

export const whois: GameModule<State, WhoisSettings> = {
  id: 'whois',

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      participants,
      entries: qdeck(ctx, 'whois', WHO).deal(settings.rounds),
      options: [],
      round: 0,
      phase: 'ask',
      shown: 1,
      nextClueAt: null,
      endsAt: null,
      guesses: {},
      results: null,
      scores: Object.fromEntries(participants.map((p) => [p, 0])),
      botAt: {},
    };
    ctx.fx('start');
    newRound(ctx.now, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type !== 'guess' || s.phase !== 'ask' || !s.participants.includes(by) || s.guesses[by]) return;
    if (!isNum(a.choice) || a.choice < 0 || a.choice >= s.options.length) return;
    s.guesses[by] = { choice: a.choice, clue: s.shown };
    if (s.participants.every((p) => s.guesses[p] || !(ctx.isConnected(p) || ctx.isBot(p)))) finishRound(ctx.now, s);
  },

  tick(ctx, s) {
    if (s.phase === 'ask' && s.nextClueAt !== null && ctx.now >= s.nextClueAt) {
      s.shown += 1;
      const last = s.shown >= s.entries[s.round - 1].clues.length;
      s.nextClueAt = last ? null : ctx.now + CLUE_MS;
      s.endsAt = last ? ctx.now + LAST_MS : null;
      ctx.fx('tick');
      return true;
    }
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'ask') finishRound(ctx.now, s);
    else if (s.phase === 'reveal') {
      if (s.round >= s.entries.length) {
        s.phase = 'final';
        s.endsAt = null;
        ctx.fx('win', soleWinner(s.scores));
      } else newRound(ctx.now, s);
    }
    return true;
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'ask') return;
    // at each new clue a bot decides whether to guess now; early guesses are rare and less often right
    const last = s.entries[s.round - 1].clues.length;
    for (const b of bots) {
      if (!s.participants.includes(b) || s.guesses[b]) continue;
      if (s.botAt[b]?.clue !== s.shown) {
        const k = Math.min(s.shown, BOT_GO.length) - 1;
        s.botAt[b] = { clue: s.shown, go: s.shown >= last || Math.random() < BOT_GO[k], right: Math.random() < BOT_RIGHT[k] };
      }
      const plan = s.botAt[b];
      if (!plan.go) continue;
      const ans = answerIdx(s);
      const wrong = [...s.options.keys()].filter((k) => k !== ans);
      ctx.bot(b, `g:${s.round}`, randInt(1500, 4500), { type: 'guess', choice: plan.right ? ans : wrong[randInt(0, wrong.length - 1)] });
    }
  },

  view(ctx, s, me): WhoisView {
    const e = s.entries[s.round - 1];
    return {
      game: 'whois',
      phase: s.phase,
      round: s.round,
      rounds: s.entries.length,
      label: WHO_CAT_LABEL[e.cat],
      clues: e.clues.slice(0, s.shown),
      totalClues: e.clues.length,
      options: s.options,
      nextClueAt: s.nextClueAt,
      endsAt: s.endsAt,
      guessed: Object.keys(s.guesses),
      myGuess: s.guesses[me]?.choice ?? null,
      answer: s.phase === 'ask' ? null : answerIdx(s),
      results: s.results,
      scores: s.scores,
    };
  },

  onLeave(ctx, s) {
    if (s.phase === 'ask' && s.participants.every((p) => s.guesses[p] || !(ctx.isConnected(p) || ctx.isBot(p)))) finishRound(ctx.now, s);
  },
};
