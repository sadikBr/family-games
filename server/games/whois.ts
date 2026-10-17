/**
 * «من هو؟» — clues about a prophet, companion, place or historical figure appear one by one.
 * Each player gets one guess per round; the earlier you guess right, the more points:
 * after clue 1 = 400, clue 2 = 300, clue 3 = 200, clue 4 = 100.
 *
 * With «typed» on there are no options: you write the name (spelling slips are forgiven). A miss
 * costs nothing but time — you may try again once the next clue appears.
 */
import type { McqResult, WhoisSettings, WhoisView } from '../../src/shared/protocol';
import { answerExact, answerMatches, norm } from '../../src/shared/arabic';
import { WHO, WHO_ALIASES, WHO_CAT_LABEL, type WhoEntry } from '../content-islamic';
import { qdeck } from '../qdeck';
import { type GameModule } from '../types';
import { isNum, isStr, randInt, shuffle } from '../util';
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
  guesses: Record<string, { choice: number; clue: number; text?: string }>;
  /** typed: wrong tries this round */
  tries: Record<string, { clue: number; text: string }[]>;
  results: McqResult[] | null;
  scores: Record<string, number>;
  botAt: Record<string, { clue: number; go: boolean; right: boolean }>;
}

const answerIdx = (s: State) => s.options.indexOf(s.entries[s.round - 1].name);
const namesOf = (name: string) => [name, ...(WHO_ALIASES[name] ?? [])];
const HONORIFICS = new Set(['سيدنا', 'سيدتنا', 'السيدة', 'النبي', 'نبي', 'الله', 'الصحابي', 'الصحابية', 'الإمام', 'القائد', 'السلطان', 'مدينة', 'بلاد'].map(norm));

/** «سيدنا يوسف» → «يوسف». */
function stripTitles(text: string) {
  const words = text.trim().split(/\s+/);
  while (words.length > 1 && HONORIFICS.has(norm(words[0]))) words.shift();
  return words.join(' ');
}

/** Does a typed name mean this entry? A slip is forgiven unless the text is exactly someone else («يونس» is not «يوسف»). */
export function whoMatches(typed: string, name: string): boolean {
  const text = stripTitles(typed);
  const forms = namesOf(name);
  if (forms.some((f) => answerExact(text, f))) return true;
  if (!forms.some((f) => answerMatches(text, f))) return false;
  return !WHO.some((w) => w.name !== name && namesOf(w.name).some((f) => answerExact(text, f)));
}

/** Typed: missed at this clue, so wait for the next one. */
const lockedOut = (s: State, id: string) => s.tries[id]?.at(-1)?.clue === s.shown;
/** Nothing more this player can do this round. */
const done = (s: State, id: string) => !!s.guesses[id] || (s.settings.typed === true && s.shown >= s.entries[s.round - 1].clues.length && lockedOut(s, id));
const allDone = (ctx: { isConnected(id: string): boolean; isBot(id: string): boolean }, s: State) =>
  s.participants.every((p) => done(s, p) || !(ctx.isConnected(p) || ctx.isBot(p)));

function newRound(now: number, s: State) {
  s.round += 1;
  const e = s.entries[s.round - 1];
  const same = shuffle(WHO.filter((w) => w.cat === e.cat && w.name !== e.name)).slice(0, OPTIONS - 1);
  s.options = shuffle([e.name, ...same.map((w) => w.name)]);
  s.phase = 'ask';
  s.shown = 1;
  s.guesses = {};
  s.tries = {};
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
    if (!s.settings.typed) return { id, choice: g ? g.choice : null, correct, points };
    return { id, choice: correct ? ans : null, correct, points, text: g?.text ?? s.tries[id]?.at(-1)?.text ?? null };
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
      tries: {},
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
    if (s.settings.typed) {
      if (!isStr(a.text) || lockedOut(s, by)) return;
      const text = a.text.trim().slice(0, 60);
      if (!text) return;
      if (whoMatches(text, s.entries[s.round - 1].name)) {
        s.guesses[by] = { choice: answerIdx(s), clue: s.shown, text };
      } else {
        (s.tries[by] ??= []).push({ clue: s.shown, text });
      }
    } else {
      if (!isNum(a.choice) || a.choice < 0 || a.choice >= s.options.length) return;
      s.guesses[by] = { choice: a.choice, clue: s.shown };
    }
    if (allDone(ctx, s)) finishRound(ctx.now, s);
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
      if (!s.participants.includes(b) || s.guesses[b] || lockedOut(s, b)) continue;
      if (s.botAt[b]?.clue !== s.shown) {
        const k = Math.min(s.shown, BOT_GO.length) - 1;
        s.botAt[b] = { clue: s.shown, go: s.shown >= last || Math.random() < BOT_GO[k], right: Math.random() < BOT_RIGHT[k] };
      }
      const plan = s.botAt[b];
      if (!plan.go) continue;
      const ans = answerIdx(s);
      const wrong = [...s.options.keys()].filter((k) => k !== ans);
      const choice = plan.right ? ans : wrong[randInt(0, wrong.length - 1)];
      // typed: one try per clue
      if (s.settings.typed) ctx.bot(b, `g:${s.round}:${s.shown}`, randInt(2500, 5000), { type: 'guess', text: s.options[choice] });
      else ctx.bot(b, `g:${s.round}`, randInt(1500, 4500), { type: 'guess', choice });
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
      options: s.settings.typed && s.phase === 'ask' ? [] : s.options,
      nextClueAt: s.nextClueAt,
      endsAt: s.endsAt,
      guessed: Object.keys(s.guesses),
      myGuess: s.guesses[me]?.choice ?? null,
      answer: s.phase === 'ask' ? null : answerIdx(s),
      results: s.results,
      scores: s.scores,
      typed: !!s.settings.typed,
      answerName: s.phase === 'ask' ? null : e.name,
      myTries: (s.tries[me] ?? []).map((t) => t.text),
      locked: s.phase === 'ask' && lockedOut(s, me),
    };
  },

  onLeave(ctx, s) {
    if (s.phase === 'ask' && allDone(ctx, s)) finishRound(ctx.now, s);
  },
};
