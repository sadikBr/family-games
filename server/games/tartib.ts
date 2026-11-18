/**
 * «رتّب الأحداث» — a timeline game. Every round everyone gets the same 4 or 5 cards (events, inventions,
 * buildings, births of famous people, sports moments…) and puts them in chronological order on their own
 * phone, at the same time.
 *
 * - The phone saves its order as it is built («arrange»), so when time runs out the cards already in their
 *   slots still count; «submit» confirms a full order (no change after that).
 * - Points: +1 a card in its right slot, +3 for a perfect order, +1/+2 more for a perfect order confirmed with
 *   a third / two thirds of the time left. The round ends when everyone still here has confirmed, or on time.
 * - Rounds get harder (see tartib-deal.ts): the first third 4 cards far apart, then 5 cards with closer dates.
 *   No card comes back in the same game, and cards seen in the room come back only when the topic runs out.
 * - The years and the right order reach the phones only at the reveal.
 */
import {
  TARTIB_ROUNDS,
  TARTIB_SECONDS,
  TARTIB_TOPICS,
  tartibPoints,
  tartibRight,
  type TartibLevel,
  type TartibResult,
  type TartibSettings,
  type TartibTopic,
  type TartibView,
} from '../../src/shared/games/tartib';
import type { TartibItem } from '../tartib-content';
import { botDelay, botOrder, dealRound, LEVEL_CARDS, roundLevels, shuffleCards, topicPool } from '../tartib-deal';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { TARTIB_VOICE, voicePerfect } from '../voice-calls-tartib';
import { placesByScore, soleWinner } from './mcq';

/** how long the timeline stays on screen before the next round (the host may go on sooner) */
export const TARTIB_REVEAL_MS = 16_000;
const TOPICS = TARTIB_TOPICS.map((t) => t.key);
/** below this many unseen cards, the room's memory of seen cards for the topic starts again */
const FRESH_MIN = 24;

export interface TartibState {
  settings: TartibSettings;
  participants: string[];
  phase: TartibView['phase'];
  levels: TartibLevel[];
  /** 0-based */
  round: number;
  /** the round's cards, shuffled (the order the phones see) */
  cards: TartibItem[];
  /** the right order: indexes into cards, oldest first */
  correct: number[];
  /** item ids already dealt in this game */
  used: string[];
  startedAt: number;
  endsAt: number | null;
  timerTotal: number;
  /** confirmed orders */
  subs: Record<string, { order: number[]; at: number }>;
  /** orders in progress (slot → card) */
  drafts: Record<string, (number | null)[]>;
  results: TartibResult[] | null;
  scores: Record<string, number>;
}

/** The nearest allowed value. */
const nearest = (v: number, allowed: readonly number[]) => allowed.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

export function sanitizeTartib(raw: Partial<TartibSettings>): TartibSettings {
  return {
    rounds: isNum(raw.rounds) ? nearest(raw.rounds, TARTIB_ROUNDS) : 8,
    seconds: isNum(raw.seconds) ? nearest(raw.seconds, TARTIB_SECONDS) : 45,
    topic: TOPICS.includes(raw.topic as TartibTopic) ? (raw.topic as TartibTopic) : 'mix',
  };
}

/** The room's memory of the cards already seen with this topic (ctx.memo survives between games). */
function seenSet(ctx: GameCtx, topic: TartibTopic): Set<string> {
  const key = `tartib:seen:${topic}`;
  let s = ctx.memo.get(key) as Set<string> | undefined;
  if (!s) {
    s = new Set();
    ctx.memo.set(key, s);
  }
  return s;
}

/** Deal the round's cards: never a card twice in a game, unseen cards first. */
export function dealFor(ctx: GameCtx, s: TartibState, rnd: () => number = Math.random): TartibItem[] {
  const level = s.levels[s.round];
  const n = LEVEL_CARDS[level];
  const used = new Set(s.used);
  let pool = topicPool(s.settings.topic).filter((i) => !used.has(i.id));
  if (pool.length < n) pool = topicPool(s.settings.topic); // (cannot happen with the content's sizes)
  const seen = seenSet(ctx, s.settings.topic);
  let fresh = pool.filter((i) => !seen.has(i.id));
  if (fresh.length < FRESH_MIN) {
    seen.clear();
    fresh = pool;
  }
  const items = dealRound(fresh, n, level, rnd);
  for (const it of items) {
    seen.add(it.id);
    s.used.push(it.id);
  }
  return items;
}

function startRound(ctx: GameCtx, s: TartibState) {
  const { cards, correct } = shuffleCards(dealFor(ctx, s));
  s.cards = cards;
  s.correct = correct;
  s.subs = {};
  s.drafts = {};
  s.results = null;
  s.phase = 'play';
  s.startedAt = ctx.now;
  s.timerTotal = s.settings.seconds * 1000;
  s.endsAt = ctx.now + s.timerTotal;
  ctx.fx('start');
  voiceOnly(ctx, TARTIB_VOICE.ask);
}

/** Score a player's round: their confirmed order, else what they had placed. */
export function scoreOf(s: TartibState, id: string): TartibResult {
  const sub = s.subs[id];
  const order: (number | null)[] | null = sub ? sub.order : (s.drafts[id] ?? null);
  const placed = order ? order.some((x) => x !== null) : false;
  if (!order || !placed) return { id, order: null, sent: false, right: 0, perfect: false, speed: 0, points: 0, ms: null };
  const right = tartibRight(order, s.correct);
  const ms = sub ? sub.at - s.startedAt : null;
  const { perfect, speed, points } = tartibPoints(right, s.correct.length, !!sub, ms === null ? 0 : s.timerTotal - ms, s.timerTotal);
  return { id, order, sent: !!sub, right, perfect, speed, points, ms };
}

function reveal(ctx: GameCtx, s: TartibState) {
  s.results = s.participants.map((id) => scoreOf(s, id));
  for (const r of s.results) s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, TARTIB_REVEAL_MS);
  ctx.fx('reveal');
  const perfect = s.results.filter((r) => r.perfect).map((r) => ctx.playerName(r.id));
  voiceOnly(ctx, perfect.length ? voicePerfect(perfect.join(' و')) : TARTIB_VOICE.noPerfect);
}

function finish(ctx: GameCtx, s: TartibState) {
  s.phase = 'final';
  s.endsAt = null;
  ctx.fx('win', soleWinner(s.scores));
  if (s.participants.length) voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: TartibState) {
  if (s.round + 1 >= s.levels.length) return finish(ctx, s);
  s.round++;
  startRound(ctx, s);
}

/** Everyone still here (online or a bot) has confirmed: no need to wait for the clock. */
function maybeReveal(ctx: GameCtx, s: TartibState) {
  if (s.phase !== 'play') return;
  const waiting = s.participants.filter((p) => !s.subs[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

/** A valid slot list: n entries, each a card index or null, no card twice. */
function validSlots(v: unknown, n: number, full: boolean): v is (number | null)[] {
  if (!Array.isArray(v) || v.length !== n) return false;
  const seen = new Set<number>();
  for (const x of v) {
    if (x === null && !full) continue;
    if (!isNum(x) || !Number.isInteger(x) || x < 0 || x >= n || seen.has(x)) return false;
    seen.add(x);
  }
  return true;
}

export const tartib: GameModule<TartibState, TartibSettings> = {
  id: 'tartib',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    const settings = sanitizeTartib(raw);
    const s: TartibState = {
      settings,
      participants: [...participants],
      phase: 'play',
      levels: roundLevels(settings.rounds),
      round: 0,
      cards: [],
      correct: [],
      used: [],
      startedAt: ctx.now,
      endsAt: null,
      timerTotal: settings.seconds * 1000,
      subs: {},
      drafts: {},
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
    if (s.phase !== 'play' || !s.participants.includes(by) || s.subs[by]) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    const n = s.cards.length;
    if (a.type === 'arrange') {
      if (validSlots(a.slots, n, false)) s.drafts[by] = a.slots.slice();
      return;
    }
    if (a.type !== 'submit' || !validSlots(a.order, n, true)) return;
    const order = a.order as number[];
    s.subs[by] = { order: order.slice(), at: ctx.now };
    s.drafts[by] = order.slice();
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
    const level = botLevel(ctx);
    for (const b of s.participants) {
      if (s.subs[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
      ctx.bot(b, `sub:${s.round}`, botDelay(s.cards, level, s.timerTotal), { type: 'submit', round: s.round + 1, order: botOrder(s.cards, level) });
    }
  },

  view(ctx, s, me): TartibView {
    const shown = s.phase !== 'play';
    return {
      game: 'tartib',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.levels.length,
      level: s.levels[s.round],
      topic: s.settings.topic,
      // text and field only: the years stay on the server until the reveal
      cards: s.cards.map((c) => ({ text: c.text, cat: c.cat })),
      endsAt: s.endsAt,
      timerTotal: s.phase === 'reveal' ? paced(ctx, TARTIB_REVEAL_MS) : s.timerTotal,
      submitted: s.participants.filter((id) => s.subs[id]),
      mine: s.subs[me]?.order ?? null,
      draft: s.drafts[me] ?? null,
      answer: shown ? s.correct.map((card) => ({ card, year: s.cards[card].year, hijri: s.cards[card].hijri ?? null })) : null,
      results: shown ? s.results : null,
      scores: s.scores,
      players: s.participants,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    delete s.subs[id];
    delete s.drafts[id];
    if (s.results) s.results = s.results.filter((r) => r.id !== id);
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = nearest(patch.rounds, TARTIB_ROUNDS);
    if (isNum(patch.seconds)) settings.seconds = nearest(patch.seconds, TARTIB_SECONDS);
    if (isStr(patch.topic) && TOPICS.includes(patch.topic as TartibTopic)) settings.topic = patch.topic as TartibTopic;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};
