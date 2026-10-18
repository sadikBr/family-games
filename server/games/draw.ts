/**
 * ارسم وخمّن — the drawer picks one of three words and draws it on their phone;
 * the strokes appear live on every phone. Everyone else types guesses.
 * Faster correct guesses score more; the drawer scores for every correct guess.
 * Letters are revealed as hints when time runs low.
 */
import { answerKey, norm } from '../../src/shared/arabic';
import type { DrawSettings, DrawStroke, DrawView } from '../../src/shared/protocol';
import { DRAW_WORDS } from '../content-extra';
import type { GameCtx, GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';

const CHOOSE_MS = 15000;
/** the word and the round's points stay up this long (or until the host taps «التالي») */
export const DRAW_REVEAL_MS = 9000;
const MAX_POINTS = 24000;
const MAX_STROKES = 400;

interface State {
  settings: DrawSettings;
  order: string[];
  round: number;
  turn: number; // index in order
  phase: DrawView['phase'];
  options: string[];
  word: string;
  endsAt: number;
  startedAt: number;
  strokes: DrawStroke[];
  points: number;
  guessed: { id: string; pts: number }[];
  hints: number[]; // revealed letter positions
  close: Set<string>;
  feed: DrawView['feed'];
  feedN: number;
  scores: Record<string, number>;
  roundPoints: Record<string, number> | null;
  used: Set<string>;
}

const drawer = (s: State) => s.order[s.turn];

/** Every connected guesser has found the word (offline players don't hold the turn up). */
function allGuessed(ctx: GameCtx, s: State) {
  if (!s.guessed.length) return false;
  return s.order.filter((id) => id !== drawer(s) && ctx.isConnected(id)).every((id) => s.guessed.some((g) => g.id === id));
}

/** The only top scorer, or null on a tie. */
function topScorer(s: State): string | null {
  const best = Math.max(...s.order.map((id) => s.scores[id] ?? 0));
  const top = s.order.filter((id) => (s.scores[id] ?? 0) === best);
  return top.length === 1 ? top[0] : null;
}

/** Edit distance ≤ 1 → "close". */
function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

export function hintText(word: string, shown: number[]) {
  return [...word].map((ch, i) => (ch === ' ' ? '  ' : shown.includes(i) ? ch : '_')).join(' ');
}

function startTurn(ctx: GameCtx, s: State) {
  s.phase = 'choose';
  const fresh = DRAW_WORDS.filter((w) => !s.used.has(w));
  s.options = shuffle(fresh.length >= 3 ? fresh : DRAW_WORDS).slice(0, 3);
  s.word = '';
  s.strokes = [];
  s.points = 0;
  s.guessed = [];
  s.hints = [];
  s.close = new Set();
  s.feed = [];
  s.roundPoints = null;
  s.endsAt = ctx.now + CHOOSE_MS;
  ctx.fx('start', drawer(s));
}

function beginDrawing(ctx: GameCtx, s: State, word: string) {
  s.word = word;
  s.used.add(word);
  s.phase = 'draw';
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + s.settings.seconds * 1000;
  ctx.say?.(`حان دور ${ctx.playerName(drawer(s))} في الرسم: خمّنوا!`, drawer(s));
}

function endTurn(ctx: GameCtx, s: State) {
  const pts: Record<string, number> = Object.fromEntries(s.order.map((id) => [id, 0]));
  for (const g of s.guessed) pts[g.id] = g.pts;
  pts[drawer(s)] = s.guessed.length ? Math.min(100, 30 + s.guessed.length * 20) : 0;
  for (const [id, p] of Object.entries(pts)) s.scores[id] = (s.scores[id] ?? 0) + p;
  s.roundPoints = pts;
  s.phase = 'reveal';
  s.endsAt = ctx.now + DRAW_REVEAL_MS;
  ctx.fx('reveal');
  ctx.say?.(`الكلمة كانت «${s.word}» — عرفها ${s.guessed.length} من ${s.order.length - 1}`, drawer(s));
}

function advance(ctx: GameCtx, s: State) {
  s.turn += 1;
  if (s.turn >= s.order.length) {
    s.turn = 0;
    s.round += 1;
  }
  if (s.round > s.settings.rounds) {
    s.phase = 'final';
    s.endsAt = 0;
    const w = topScorer(s);
    if (w) ctx.fx('win', w);
    else ctx.fx('win');
    return;
  }
  startTurn(ctx, s);
}

export const draw: GameModule<State, DrawSettings> = {
  // the drawer picks a word, then draws while everyone else guesses
  turnOf: (s) => (s.phase === 'choose' || s.phase === 'draw' ? [s.order[s.turn]] : []),
  id: 'draw',
  hostOnly: ['next'],

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      order: shuffle(participants),
      round: 1,
      turn: 0,
      phase: 'choose',
      options: [],
      word: '',
      endsAt: 0,
      startedAt: 0,
      strokes: [],
      points: 0,
      guessed: [],
      hints: [],
      close: new Set(),
      feed: [],
      feedN: 0,
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      roundPoints: null,
      used: new Set(),
    };
    startTurn(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (!s.order.includes(by)) return;
    const isDrawer = by === drawer(s);

    if (a.type === 'choose') {
      if (s.phase !== 'choose' || !isDrawer || !isStr(a.word) || !s.options.includes(a.word)) return;
      beginDrawing(ctx, s, a.word);
      return;
    }
    if (a.type === 'stroke') {
      if (s.phase !== 'draw' || !isDrawer || !isStr(a.id) || !Array.isArray(a.pts)) return;
      const pts = (a.pts as unknown[]).filter(isNum).map((v) => Math.max(0, Math.min(1000, Math.round(v))));
      if (pts.length % 2) pts.pop();
      if (s.points + pts.length > MAX_POINTS) return;
      let st = s.strokes.find((x) => x.id === a.id);
      if (!st) {
        if (s.strokes.length >= MAX_STROKES) return;
        st = { id: a.id.slice(0, 24), c: isStr(a.c) && /^#[0-9a-fA-F]{6}$/.test(a.c) ? a.c : '#1B1830', w: isNum(a.w) ? Math.max(2, Math.min(80, a.w)) : 8, pts: [] };
        s.strokes.push(st);
      }
      st.pts.push(...pts);
      s.points += pts.length;
      return;
    }
    if (a.type === 'undo') {
      if (s.phase === 'draw' && isDrawer) {
        const st = s.strokes.pop();
        if (st) s.points -= st.pts.length;
      }
      return;
    }
    if (a.type === 'clear') {
      if (s.phase === 'draw' && isDrawer) {
        s.strokes = [];
        s.points = 0;
      }
      return;
    }
    if (a.type === 'guess') {
      if (s.phase !== 'draw' || isDrawer || s.guessed.some((g) => g.id === by)) return;
      const text = isStr(a.text) ? a.text.trim().slice(0, 40) : '';
      if (!text) return;
      const guess = answerKey(text);
      const target = answerKey(s.word);
      if (guess === target) {
        const total = s.settings.seconds * 1000;
        const remaining = Math.max(0, s.endsAt - ctx.now);
        const pts = Math.round(50 + (100 * remaining) / total) - s.guessed.length * 5;
        s.guessed.push({ id: by, pts: Math.max(20, pts) });
        s.feed.push({ id: ++s.feedN, by, text: '', ok: true });
        ctx.fx('correct', by);
        ctx.say?.(`إجابة صحيحة من ${ctx.playerName(by)}!`, by);
        if (allGuessed(ctx, s)) endTurn(ctx, s);
        return;
      }
      if (oneEdit(guess, target) || (target.includes(guess) && guess.length >= 3)) s.close.add(by);
      else s.close.delete(by);
      s.feed.push({ id: ++s.feedN, by, text: norm(text) === norm(s.word) ? '•••' : text });
      if (s.feed.length > 30) s.feed.shift();
      return;
    }
    if (a.type === 'next' && s.phase === 'reveal') advance(ctx, s);
    if (a.type === 'giveup' && s.phase === 'draw' && isDrawer) endTurn(ctx, s);
  },

  tick(ctx, s) {
    if (s.phase === 'choose' && ctx.now >= s.endsAt) {
      beginDrawing(ctx, s, s.options[0]);
      return true;
    }
    if (s.phase === 'draw') {
      if (ctx.now >= s.endsAt) {
        endTurn(ctx, s);
        return true;
      }
      // letter hints at 50% and 75% of the time (never more than half the word)
      const frac = (ctx.now - s.startedAt) / (s.settings.seconds * 1000);
      const letters = [...s.word].map((ch, i) => (ch === ' ' ? -1 : i)).filter((i) => i >= 0);
      const want = frac > 0.75 ? 2 : frac > 0.5 ? 1 : 0;
      const cap = Math.floor(letters.length / 2);
      if (s.hints.length < Math.min(want, cap)) {
        const pool = letters.filter((i) => !s.hints.includes(i));
        s.hints.push(pool[Math.floor(Math.random() * pool.length)]);
        return true;
      }
    }
    if (s.phase === 'reveal' && ctx.now >= s.endsAt) {
      advance(ctx, s);
      return true;
    }
    return false;
  },

  view(ctx, s, me): DrawView {
    const isDrawer = me === drawer(s);
    const knows = isDrawer || s.guessed.some((g) => g.id === me) || s.phase === 'reveal' || s.phase === 'final';
    return {
      game: 'draw',
      phase: s.phase,
      participants: s.order,
      round: Math.min(s.round, s.settings.rounds),
      totalRounds: s.settings.rounds,
      drawer: drawer(s),
      options: isDrawer && s.phase === 'choose' ? s.options : null,
      word: knows && s.word ? s.word : null,
      hint: s.word ? hintText(s.word, s.hints) : '',
      endsAt: s.phase === 'final' ? null : s.endsAt,
      total: s.phase === 'choose' ? CHOOSE_MS : s.phase === 'reveal' ? DRAW_REVEAL_MS : s.settings.seconds * 1000,
      strokes: s.strokes,
      guessed: s.guessed.map((g) => g.id),
      close: s.close.has(me),
      feed: s.feed,
      scores: s.scores,
      roundPoints: s.roundPoints,
    };
  },

  onLeave(ctx, s, id) {
    const i = s.order.indexOf(id);
    if (i < 0) return;
    const wasDrawer = i === s.turn;
    s.order.splice(i, 1);
    if (s.order.length < 2) {
      s.phase = 'final';
      return;
    }
    if (i < s.turn) s.turn -= 1;
    if (wasDrawer) {
      s.turn -= 1;
      advance(ctx, s);
      return;
    }
    s.guessed = s.guessed.filter((g) => g.id !== id);
    if (s.phase === 'draw' && allGuessed(ctx, s)) endTurn(ctx, s);
  },
};
