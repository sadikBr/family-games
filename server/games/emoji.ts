/**
 * «خمّن من الإيموجي» — guess what a row of emojis stands for. Each round one puzzle (server/emoji-content.ts)
 * from the chosen category («منوّع»: the categories in turn), dealt from the room's deck so puzzles don't come
 * back game after game. Everyone answers once, at the same time: typed (forgiving match, emoji-match.ts) or
 * one of four options (three other answers of the same category). Halfway the hint comes out (typed: words
 * and first letter; options: two wrong options go away) and later answers score half (emojiPoints). The
 * round ends when every connected player has answered or the time is up; the reveal shows the answer and
 * its one-line explanation, then moves on by itself (or the host taps «التالي»). Nothing about the answer
 * is in the view before the reveal; bots: emoji-bots.ts.
 */
import {
  EMOJI_CATEGORIES,
  EMOJI_CATEGORY_PICKS,
  EMOJI_DEFAULTS,
  EMOJI_MODES,
  EMOJI_ROUNDS,
  EMOJI_SECONDS,
  emojiPoints,
  type EmojiCategory,
  type EmojiCategoryPick,
  type EmojiHint,
  type EmojiMode,
  type EmojiResult,
  type EmojiSettings,
  type EmojiView,
} from '../../src/shared/games/emoji';
import { norm } from '../../src/shared/arabic';
import { botMove, type BotItem } from '../emoji-bots';
import { EMOJI_PUZZLES, puzzlesOf, type EmojiPuzzle } from '../emoji-content';
import { cleanTyped, emojiKey, emojiMatches, matchesForm } from '../emoji-match';
import { qdeck } from '../qdeck';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { KNOW_VOICE, voiceFastestRight } from '../voice-calls-knowledge';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { placesByScore, soleWinner } from './mcq';
import { snapTo } from './speedquiz';

export const EMOJI_REVEAL_MS = 7000;

type Rnd = () => number;

export type EmojiItem = BotItem;

interface Answer {
  text: string | null;
  choice: number | null;
  at: number;
  correct: boolean;
  late: boolean;
}

export interface EmojiState {
  settings: EmojiSettings;
  participants: string[];
  items: EmojiItem[];
  /** 0-based */
  round: number;
  phase: 'ask' | 'reveal' | 'final';
  startedAt: number;
  hintAt: number;
  endsAt: number | null;
  hinted: boolean;
  answers: Record<string, Answer>;
  results: EmojiResult[] | null;
  scores: Record<string, number>;
  rights: Record<string, number>;
  rnd: Rnd;
}

const oneOf = <T extends string>(v: unknown, keys: { key: T }[], d: T): T => (isStr(v) && keys.some((k) => k.key === v) ? (v as T) : d);

export function sanitizeEmoji(raw: Partial<EmojiSettings> | undefined): EmojiSettings {
  return {
    rounds: snapTo(raw?.rounds, EMOJI_ROUNDS, EMOJI_DEFAULTS.rounds),
    seconds: snapTo(raw?.seconds, EMOJI_SECONDS, EMOJI_DEFAULTS.seconds),
    mode: oneOf<EmojiMode>(raw?.mode, EMOJI_MODES, EMOJI_DEFAULTS.mode),
    category: oneOf<EmojiCategoryPick>(raw?.category, EMOJI_CATEGORY_PICKS, EMOJI_DEFAULTS.category),
  };
}

function shuffled<T>(xs: readonly T[], rnd: Rnd): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Two option texts too alike to stand side by side (one would be read as the other). */
const alike = (a: string, b: string) => emojiKey(a) === emojiKey(b) || matchesForm(a, b) || matchesForm(b, a);

/** Four options: the answer and three other answers of its category, in a random order; two wrong ones to take away at the hint. */
export function makeOptions(p: EmojiPuzzle, rnd: Rnd): { options: string[]; correct: number; removed: number[] } {
  const picked: string[] = [];
  for (const q of shuffled(puzzlesOf(p.cat), rnd)) {
    if (picked.length >= 3) break;
    if (q.id === p.id || emojiMatches(q.answer, p) || [p.answer, ...picked].some((x) => alike(x, q.answer))) continue;
    picked.push(q.answer);
  }
  const options = shuffled([p.answer, ...picked], rnd);
  const correct = options.indexOf(p.answer);
  const wrong = shuffled(options.map((_, i) => i).filter((i) => i !== correct), rnd);
  return { options, correct, removed: wrong.slice(0, 2).sort((a, b) => a - b) };
}

/** The game's puzzles: one category, or every category in turn («منوّع»), never twice the same puzzle. */
export function buildEmoji(ctx: GameCtx, settings: EmojiSettings, rnd: Rnd): EmojiItem[] {
  const cats: EmojiCategory[] = settings.category === 'mix' ? shuffled(EMOJI_CATEGORIES.map((c) => c.key), rnd) : [settings.category];
  const used = new Set<string>();
  const items: EmojiItem[] = [];
  for (let i = 0; i < settings.rounds; i++) {
    const cat = cats[i % cats.length];
    const deck = qdeck(ctx, `emoji:${cat}`, puzzlesOf(cat));
    const puzzle = deck.draw((p) => used.has(p.id));
    if (used.has(puzzle.id)) break;
    used.add(puzzle.id);
    if (settings.mode === 'options') items.push({ puzzle, ...makeOptions(puzzle, rnd) });
    else items.push({ puzzle, options: null, correct: null, removed: [] });
  }
  return items;
}

/** The typed hint: how many words, and the first letter (after «ال»). */
export function typedHint(answer: string): { words: number; letter: string; al: boolean } {
  const words = answer.trim().split(/\s+/);
  const first = words[0];
  const al = first.startsWith('ال') && first.length > 3;
  const letter = (al ? first.slice(2) : first).replace(/[ً-ْ]/g, '')[0] ?? '';
  return { words: words.length, letter, al };
}

const totalMs = (s: EmojiState) => s.settings.seconds * 1000;

function ask(ctx: GameCtx, s: EmojiState) {
  s.phase = 'ask';
  s.answers = {};
  s.results = null;
  s.hinted = false;
  s.startedAt = ctx.now;
  s.hintAt = ctx.now + totalMs(s) / 2;
  s.endsAt = ctx.now + totalMs(s);
  ctx.fx('reveal');
}

function reveal(ctx: GameCtx, s: EmojiState) {
  s.results = s.participants.map((id) => {
    const a = s.answers[id];
    if (!a) return { id, text: null, choice: null, correct: false, late: false, points: 0 };
    return { id, text: a.text, choice: a.choice, correct: a.correct, late: a.late, points: emojiPoints(a.correct, s.settings.mode, a.at - s.startedAt, totalMs(s), a.late) };
  });
  for (const r of s.results) {
    s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
    if (r.correct) s.rights[r.id] = (s.rights[r.id] ?? 0) + 1;
  }
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, EMOJI_REVEAL_MS);
  const right = s.participants.filter((id) => s.answers[id]?.correct);
  if (!right.length) {
    ctx.say?.('لا إجابة صحيحة في هذه الجولة', undefined, KNOW_VOICE.noRight);
    return;
  }
  const best = Math.min(...right.map((id) => s.answers[id].at));
  const first = right.filter((id) => s.answers[id].at === best);
  const names = first.map((id) => ctx.playerName(id)).join(' و');
  ctx.say?.(`أسرع إجابة صحيحة: ${names}`, first.length === 1 ? first[0] : undefined, voiceFastestRight(names));
}

function finish(ctx: GameCtx, s: EmojiState) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: EmojiState) {
  if (s.round + 1 >= s.items.length) return finish(ctx, s);
  s.round++;
  ask(ctx, s);
}

function maybeReveal(ctx: GameCtx, s: EmojiState) {
  if (s.phase !== 'ask') return;
  const waiting = s.participants.filter((p) => !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

export function startEmoji(ctx: GameCtx, participants: string[], raw: Partial<EmojiSettings>, rnd: Rnd = Math.random): EmojiState {
  const settings = sanitizeEmoji(raw);
  const s: EmojiState = {
    settings,
    participants: [...participants],
    items: buildEmoji(ctx, settings, rnd),
    round: 0,
    phase: 'ask',
    startedAt: ctx.now,
    hintAt: ctx.now,
    endsAt: null,
    hinted: false,
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

/** The bot's move for the current puzzle (its own luck, its own timing). */
export function emojiBotMove(ctx: GameCtx, s: EmojiState) {
  return botMove(botLevel(ctx), s.settings.mode, s.items[s.round], EMOJI_PUZZLES, totalMs(s), totalMs(s) / 2, s.rnd);
}

export function emojiView(ctx: GameCtx, s: EmojiState, me: string): EmojiView {
  const it = s.items[s.round];
  const p = it.puzzle;
  const shown = s.phase !== 'ask';
  const typed = s.settings.mode === 'typed';
  let hint: EmojiHint | null = null;
  if (s.hinted || shown) {
    const t = typedHint(p.answer);
    hint = { text: p.hint, words: typed ? t.words : null, letter: typed ? t.letter : null, al: typed && t.al, removed: typed ? [] : it.removed };
  }
  const mine = s.answers[me];
  return {
    game: 'emoji',
    phase: s.phase,
    round: s.round + 1,
    rounds: s.items.length,
    mode: s.settings.mode,
    category: p.cat,
    emojis: p.emojis,
    options: typed ? null : it.options,
    endsAt: s.endsAt,
    timerTotal: s.phase === 'ask' ? totalMs(s) : paced(ctx, EMOJI_REVEAL_MS),
    hintAt: s.phase === 'ask' ? s.hintAt : null,
    hint,
    answered: s.participants.filter((id) => !!s.answers[id]),
    myText: mine?.text ?? null,
    myChoice: mine?.choice ?? null,
    answer: shown ? p.answer : null,
    explanation: shown ? p.explain : null,
    correct: shown && !typed ? it.correct : null,
    results: shown ? s.results : null,
    scores: s.scores,
    players: s.participants,
    rights: s.rights,
  };
}

export const emoji: GameModule<EmojiState, EmojiSettings> = {
  id: 'emoji',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startEmoji(ctx, participants, raw);
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
    const late = s.hinted || ctx.now >= s.hintAt;
    if (s.settings.mode === 'typed') {
      if (!isStr(a.text)) return;
      const text = cleanTyped(a.text);
      if (!norm(text)) return;
      s.answers[by] = { text, choice: null, at: ctx.now, correct: emojiMatches(text, it.puzzle), late };
    } else {
      const choice = a.choice;
      const count = it.options?.length ?? 0;
      if (!isNum(choice) || !Number.isInteger(choice) || choice < 0 || choice >= count) return;
      // the two options the hint took away can't be picked any more
      if (late && it.removed.includes(choice)) return;
      s.answers[by] = { text: null, choice, at: ctx.now, correct: choice === it.correct, late };
    }
    maybeReveal(ctx, s);
  },

  tick(ctx, s) {
    if (s.endsAt === null) return false;
    if (s.phase === 'ask' && !s.hinted && ctx.now >= s.hintAt && ctx.now < s.endsAt) {
      s.hinted = true;
      return true;
    }
    if (ctx.now < s.endsAt) return false;
    if (s.phase === 'ask') reveal(ctx, s);
    else if (s.phase === 'reveal') next(ctx, s);
    return true;
  },

  turnOf() {
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'ask') return;
    for (const b of s.participants) {
      if (s.answers[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
      const m = emojiBotMove(ctx, s);
      // the delay counts from the puzzle's start, the job from now
      const delay = Math.max(200, m.delay - (ctx.now - s.startedAt));
      const action = s.settings.mode === 'typed' ? { type: 'answer', round: s.round + 1, text: m.text } : { type: 'answer', round: s.round + 1, choice: m.choice };
      ctx.bot(b, `em:${s.round}`, delay, action);
    }
  },

  view(ctx, s, me) {
    return emojiView(ctx, s, me);
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
    const next = sanitizeEmoji({ ...settings, ...patch } as Partial<EmojiSettings>);
    if (patch.rounds !== undefined) settings.rounds = next.rounds;
    if (patch.seconds !== undefined) settings.seconds = next.seconds;
    if (patch.mode !== undefined) settings.mode = next.mode;
    if (patch.category !== undefined) settings.category = next.category;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};
