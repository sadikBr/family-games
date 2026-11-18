/**
 * «كلم» — the fast word-changing card game (rules at the top of src/shared/games/kalim.ts).
 *
 * Each round: a fresh deck (server/kalim-words.ts: two different letters on each card, about one star in
 * fifteen), the same number of cards for everyone, and a starting word with plenty of moves for these hands.
 * No turns: anyone lays a card on a letter of the word at any moment. A play names the change it saw
 * (`base` = the word's change count), so when two players are fast at once only the first counts and the
 * other is told the word changed. Everyday words count at once; any other word stops the game for a vote of
 * the other people at the table (bots don't vote; with nobody to ask, the big dictionary decides). A refused
 * word sends its card back and locks its player for three seconds (so trying every card in turn doesn't pay).
 *
 * The round ends when someone lays their last card (+3), or when nobody can change the word: everyone tapped
 * «ما عندي كلمة» (bots tap it when they see no move; people away count as stuck), or a minute without a
 * change. The fewest cards left then win it. One point per card laid. Several rounds: a short reveal
 * between them, a podium at the end.
 *
 * The view never shows another player's cards, only how many they hold.
 */
import {
  KALIM_EMPTY_BONUS,
  KALIM_HAND_SIZES,
  KALIM_KEYS,
  KALIM_LEN,
  KALIM_LOCK_MS,
  KALIM_ROUNDS,
  KALIM_STALL_MS,
  KALIM_STAR,
  KALIM_VOTE_MS,
  kalimKey,
  type KalimBoard,
  type KalimCard,
  type KalimDialect,
  type KalimMove,
  type KalimRoundResult,
  type KalimSettings,
  type KalimStep,
  type KalimView,
} from '../../src/shared/games/kalim';
import type { BotLevel } from '../../src/shared/protocol';
import { botPlay, classify, makeDeck, movesFor, shownWord, startWords, warmKalim, type Rnd, type WordClass } from '../kalim-words';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { placesByScore, soleWinner } from './mcq';

/** The round's result stays on the screens this long (at the room's pace). */
export const KALIM_REVEAL_MS = 7000;
/** Steps of the trail kept in the view. */
const TRAIL = 8;

interface Vote {
  by: string;
  card: number;
  pos: number;
  key: string;
  star: boolean;
  word: string;
  cls: WordClass;
  voters: string[];
  yes: string[];
  no: string[];
  endsAt: number;
  /** what was left of the stall timer when the vote began */
  stallLeft: number;
}

interface State {
  settings: KalimSettings;
  participants: string[];
  totalRounds: number;
  /** 0-based */
  round: number;
  phase: KalimView['phase'];
  hands: Record<string, KalimCard[]>;
  board: KalimBoard;
  /** changes of the word this round */
  seq: number;
  trail: KalimStep[];
  /** who tapped «ما عندي كلمة» for this word */
  stuck: Set<string>;
  locks: Record<string, number>;
  vote: Vote | null;
  /** play: the round ends at this time without a change */
  stallAt: number;
  /** reveal: the next round */
  endsAt: number | null;
  last: KalimMove | null;
  result: KalimRoundResult | null;
  gains: Record<string, number>;
  scores: Record<string, number>;
  usedStarts: Set<string>;
  rnd: Rnd;
}

const snap = (v: unknown, opts: readonly number[], d: number): number =>
  isNum(v) ? opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]) : d;

export function sanitizeKalim(raw: Partial<KalimSettings> | undefined): KalimSettings {
  return {
    dialect: raw?.dialect === 'mixed' ? 'mixed' : 'fusha',
    hand: snap(raw?.hand, KALIM_HAND_SIZES, 9),
    rounds: snap(raw?.rounds, KALIM_ROUNDS, 1),
  };
}

const display = (keys: string) => shownWord(keys);

/** The letters as shown: the word's usual spelling when the app knows it. */
function shownLetters(keys: string): string[] {
  const s = [...display(keys)];
  return s.length === KALIM_LEN ? s : [...keys];
}

/* ------------------------------------------------------------------ */
/* Rounds                                                              */
/* ------------------------------------------------------------------ */

function deal(s: State) {
  const n = s.participants.length;
  const size = s.settings.hand;
  // a starting word these hands can work with: the liveliest of a few tries
  let best: { keys: string; hands: KalimCard[][]; moves: number } | null = null;
  const pool = startWords().filter((w) => !s.usedStarts.has(w));
  const list = pool.length ? pool : startWords();
  for (let t = 0; t < 6; t++) {
    const deck = makeDeck(n * size, s.rnd, s.round * 1000 + 1);
    const hands = s.participants.map((_, i) => deck.slice(i * size, (i + 1) * size));
    const keys = list[Math.floor(s.rnd() * list.length)];
    const moves = movesFor(keys, hands);
    if (!best || moves > best.moves) best = { keys, hands, moves };
    if (moves >= n * 3) break;
  }
  s.usedStarts.add(best!.keys);
  s.hands = Object.fromEntries(s.participants.map((p, i) => [p, best!.hands[i]]));
  s.board = { keys: [...best!.keys], shown: shownLetters(best!.keys), star: [false, false, false], pile: [1, 1, 1], by: [null, null, null] };
  s.trail = [{ word: display(best!.keys), by: null }];
}

function startRound(ctx: GameCtx, s: State) {
  s.phase = 'play';
  s.seq = 0;
  s.stuck = new Set();
  s.locks = {};
  s.vote = null;
  s.last = null;
  s.result = null;
  s.endsAt = null;
  s.gains = Object.fromEntries(s.participants.map((p) => [p, 0]));
  deal(s);
  s.stallAt = ctx.now + KALIM_STALL_MS;
  ctx.fx('start');
  ctx.say?.(`الكلمة الأولى: «${display(s.board.keys.join(''))}» — الأسرع يغيّرها!`);
}

function endRound(ctx: GameCtx, s: State, how: KalimRoundResult['how'], winners: string[]) {
  const left = Object.fromEntries(s.participants.map((p) => [p, s.hands[p]?.length ?? 0]));
  if (how === 'stuck') {
    const fewest = Math.min(...s.participants.map((p) => left[p]));
    winners = s.participants.filter((p) => left[p] === fewest);
  }
  if (how === 'emptied') for (const w of winners) addGain(s, w, KALIM_EMPTY_BONUS);
  s.vote = null;
  s.result = { how, winners, left, gains: { ...s.gains } };
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, KALIM_REVEAL_MS);
  ctx.fx(how === 'left' ? 'reveal' : 'win', winners.length === 1 ? winners[0] : undefined);
  if (how === 'emptied') ctx.say?.(`آخر بطاقة في يد ${ctx.playerName(winners[0])}: الفوز بالجولة!`, winners[0]);
  else if (how === 'stuck') ctx.say?.(`لا أحد يستطيع تغيير «${display(s.board.keys.join(''))}»: الفوز لأقل البطاقات`);
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  s.vote = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.totalRounds || s.participants.length < 2) return finish(ctx, s);
  s.round++;
  startRound(ctx, s);
}

function addGain(s: State, id: string, n: number) {
  s.gains[id] = (s.gains[id] ?? 0) + n;
  s.scores[id] = (s.scores[id] ?? 0) + n;
}

/* ------------------------------------------------------------------ */
/* Plays                                                               */
/* ------------------------------------------------------------------ */

/** Lay the card: the word changes. */
function apply(ctx: GameCtx, s: State, by: string, cardId: number, pos: number, key: string, star: boolean) {
  const hand = s.hands[by];
  const i = hand.findIndex((c) => c.id === cardId);
  if (i < 0) return;
  hand.splice(i, 1);
  const b = s.board;
  b.keys[pos] = key;
  b.star[pos] = star;
  b.pile[pos]++;
  b.by[pos] = by;
  const word = b.keys.join('');
  b.shown = shownLetters(word);
  s.seq++;
  s.trail.push({ word: display(word), by });
  if (s.trail.length > TRAIL) s.trail.shift();
  s.last = { seq: s.seq, by, pos, word: display(word), star };
  s.stuck.clear();
  s.stallAt = ctx.now + KALIM_STALL_MS;
  addGain(s, by, 1);
  if (!hand.length) return endRound(ctx, s, 'emptied', [by]);
  ctx.fx('card', by);
  ctx.say?.(`«${display(word)}» · ${ctx.playerName(by)}`, by);
}

/** A word that didn't count: the card stays, its player waits a moment. */
function refuse(ctx: GameCtx, s: State, by: string, word: string) {
  s.locks[by] = ctx.now + KALIM_LOCK_MS;
  ctx.fx('skip', by);
  ctx.say?.(`«${word}» لم تُقبل · ${ctx.playerName(by)}`, by);
}

/** The other people at the table who can vote now. */
const votersFor = (ctx: GameCtx, s: State, by: string) => s.participants.filter((p) => p !== by && !ctx.isBot(p) && ctx.isConnected(p));

function play(ctx: GameCtx, s: State, by: string, a: Record<string, unknown>) {
  const bot = ctx.isBot(by);
  // (a bot's refused play is planned again once the vote is over)
  if (s.phase === 'vote') throw new GameError('انتظروا نتيجة التصويت');
  if (s.phase !== 'play') return;
  if (!isNum(a.base) || a.base !== s.seq) {
    if (bot) return;
    throw new GameError('تغيّرت الكلمة قبلك: انظر إليها من جديد');
  }
  if ((s.locks[by] ?? 0) > ctx.now) throw new GameError('انتظر لحظة قبل محاولة جديدة');
  const card = isNum(a.card) ? s.hands[by]?.find((c) => c.id === a.card) : undefined;
  if (!card) throw new GameError('هذه البطاقة ليست في يدك');
  const pos = a.pos;
  if (!isNum(pos) || !Number.isInteger(pos) || pos < 0 || pos >= KALIM_LEN) return;
  const star = card.a === KALIM_STAR;
  let key: string | null;
  if (star) {
    key = isStr(a.as) ? kalimKey(a.as) : null;
    if (!key || !KALIM_KEYS.includes(key)) throw new GameError('اختر الحرف الذي تمثّله النجمة');
  } else key = a.face === 1 ? card.b : card.a;
  if (key === s.board.keys[pos]) throw new GameError('لا يوضع الحرف على مثله');
  const keys = [...s.board.keys];
  keys[pos] = key;
  const w = keys.join('');
  const cls = classify(w, s.settings.dialect);
  if (cls === 'known') return apply(ctx, s, by, card.id, pos, key, star);
  const voters = votersFor(ctx, s, by);
  if (!voters.length) {
    if (cls === 'dict') return apply(ctx, s, by, card.id, pos, key, star);
    return refuse(ctx, s, by, display(w));
  }
  s.vote = {
    by,
    card: card.id,
    pos,
    key,
    star,
    word: display(w),
    cls,
    voters,
    yes: [],
    no: [],
    endsAt: ctx.now + KALIM_VOTE_MS,
    stallLeft: Math.max(15_000, s.stallAt - ctx.now),
  };
  s.phase = 'vote';
  ctx.fx('buzz', by);
  ctx.say?.(`اقتراح من ${ctx.playerName(by)}: «${display(w)}» — هل هي كلمة؟`, by);
}

/** Count the vote: a dictionary word stays unless more say no; another word needs more yes than no. */
function resolveVote(ctx: GameCtx, s: State) {
  const v = s.vote;
  if (!v) return;
  s.vote = null;
  s.phase = 'play';
  s.stallAt = ctx.now + v.stallLeft;
  const ok = v.cls === 'dict' ? v.yes.length >= v.no.length : v.yes.length > v.no.length;
  if (ok && s.participants.includes(v.by) && s.hands[v.by]?.some((c) => c.id === v.card)) apply(ctx, s, v.by, v.card, v.pos, v.key, v.star);
  else refuse(ctx, s, v.by, v.word);
}

function castVote(ctx: GameCtx, s: State, by: string, yes: boolean) {
  const v = s.vote;
  if (s.phase !== 'vote' || !v || !v.voters.includes(by) || v.yes.includes(by) || v.no.includes(by)) return;
  (yes ? v.yes : v.no).push(by);
  if (v.voters.every((p) => v.yes.includes(p) || v.no.includes(p) || !ctx.isConnected(p))) resolveVote(ctx, s);
}

/** Everyone stuck (people away count as stuck): the round ends. */
function checkStuck(ctx: GameCtx, s: State) {
  if (s.phase !== 'play') return;
  if (s.participants.every((p) => s.stuck.has(p) || !ctx.isConnected(p))) endRound(ctx, s, 'stuck', []);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** A bot's time to change the word, by strength: [fastest, slowest] in ms. */
export const KALIM_BOT_MS: Record<BotLevel, [number, number]> = { easy: [7000, 12000], smart: [4500, 8500], expert: [2800, 5500] };

function planBot(ctx: GameCtx, s: State, b: string) {
  const level = botLevel(ctx);
  const [lo, hi] = KALIM_BOT_MS[level];
  const delay = Math.round(lo + s.rnd() * (hi - lo));
  const m = botPlay(level, s.board.keys.join(''), s.hands[b] ?? [], s.settings.dialect, s.rnd);
  const key = `p:${s.round}:${s.seq}`;
  if (m) ctx.bot(b, key, delay, { type: 'play', round: s.round + 1, base: s.seq, card: m.card, face: m.face, pos: m.pos, ...(m.as ? { as: m.as } : {}) });
  else ctx.bot(b, key, delay, { type: 'stuck', round: s.round + 1, base: s.seq, on: true });
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startKalim(ctx: GameCtx, participants: string[], raw: KalimSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeKalim(raw);
  warmKalim();
  const s: State = {
    settings,
    participants: [...participants],
    totalRounds: settings.rounds,
    round: 0,
    phase: 'play',
    hands: {},
    board: { keys: [], shown: [], star: [], pile: [], by: [] },
    seq: 0,
    trail: [],
    stuck: new Set(),
    locks: {},
    vote: null,
    stallAt: 0,
    endsAt: null,
    last: null,
    result: null,
    gains: {},
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    usedStarts: new Set(),
    rnd,
  };
  startRound(ctx, s);
  return s;
}

export const kalim: GameModule<State, KalimSettings> = {
  id: 'kalim',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startKalim(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by)) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    switch (a.type) {
      case 'play':
        return play(ctx, s, by, a);
      case 'stuck': {
        if (s.phase !== 'play') return;
        if (isNum(a.base) && a.base !== s.seq) return;
        if (a.on === false) s.stuck.delete(by);
        else s.stuck.add(by);
        return checkStuck(ctx, s);
      }
      case 'vote': {
        if (typeof a.yes !== 'boolean') return;
        return castVote(ctx, s, by, a.yes);
      }
      case 'next': {
        if (s.phase === 'reveal') next(ctx, s);
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.phase === 'vote' && s.vote && ctx.now >= s.vote.endsAt) {
      resolveVote(ctx, s);
      return true;
    }
    if (s.phase === 'play' && ctx.now >= s.stallAt) {
      endRound(ctx, s, 'stuck', []);
      return true;
    }
    if (s.phase === 'reveal' && s.endsAt !== null && ctx.now >= s.endsAt) {
      next(ctx, s);
      return true;
    }
    return false;
  },

  turnOf(s) {
    if (s.phase === 'vote' && s.vote) return s.vote.voters.filter((p) => !s.vote!.yes.includes(p) && !s.vote!.no.includes(p));
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    let changed = false;
    for (const b of bots) {
      if (!s.participants.includes(b) || s.stuck.has(b)) continue;
      // someone away: they don't play for themselves, they just don't hold the round up
      if (!ctx.isConnected(b)) {
        s.stuck.add(b);
        changed = true;
        continue;
      }
      planBot(ctx, s, b);
    }
    if (changed) checkStuck(ctx, s);
    return changed;
  },

  view(ctx, s, me): KalimView {
    const v = s.vote;
    return {
      game: 'kalim',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.totalRounds,
      dialect: s.settings.dialect,
      board: { keys: [...s.board.keys], shown: [...s.board.shown], star: [...s.board.star], pile: [...s.board.pile], by: [...s.board.by] },
      trail: s.trail.map((t) => ({ ...t })),
      seq: s.seq,
      hand: (s.hands[me] ?? []).map((c) => ({ ...c })),
      counts: Object.fromEntries(s.participants.map((p) => [p, s.hands[p]?.length ?? 0])),
      stuck: [...s.stuck],
      lockUntil: (s.locks[me] ?? 0) > ctx.now ? s.locks[me] : null,
      vote: v ? { by: v.by, word: v.word, pos: v.pos, key: v.key, star: v.star, inDict: v.cls === 'dict', voters: [...v.voters], yes: [...v.yes], no: [...v.no], endsAt: v.endsAt } : null,
      endsAt: s.phase === 'play' ? s.stallAt : s.phase === 'vote' && v ? v.endsAt : s.endsAt,
      timerTotal: s.phase === 'reveal' ? paced(ctx, KALIM_REVEAL_MS) : s.phase === 'vote' ? KALIM_VOTE_MS : KALIM_STALL_MS,
      last: s.last,
      result: s.phase === 'reveal' || s.phase === 'final' ? s.result : null,
      scores: s.scores,
      players: s.participants,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.hands[id];
    delete s.scores[id];
    delete s.gains[id];
    s.stuck.delete(id);
    if (s.phase === 'final') return;
    if (s.participants.length < 2) {
      if (s.phase === 'play' || s.phase === 'vote') endRound(ctx, s, 'left', [...s.participants]);
      return finish(ctx, s);
    }
    if (s.vote) {
      if (s.vote.by === id) {
        s.stallAt = ctx.now + s.vote.stallLeft;
        s.vote = null;
        s.phase = 'play';
      } else {
        s.vote.voters = s.vote.voters.filter((p) => p !== id);
        s.vote.yes = s.vote.yes.filter((p) => p !== id);
        s.vote.no = s.vote.no.filter((p) => p !== id);
        if (!s.vote.voters.length || s.vote.voters.every((p) => s.vote!.yes.includes(p) || s.vote!.no.includes(p))) resolveVote(ctx, s);
      }
    }
    checkStuck(ctx, s);
  },

  patchSettings(settings, patch) {
    if (patch.dialect === 'fusha' || patch.dialect === 'mixed') settings.dialect = patch.dialect as KalimDialect;
    if (isNum(patch.hand)) settings.hand = snap(patch.hand, KALIM_HAND_SIZES, settings.hand);
    if (isNum(patch.rounds)) settings.rounds = snap(patch.rounds, KALIM_ROUNDS, settings.rounds);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as KalimState };
