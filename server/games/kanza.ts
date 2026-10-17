/**
 * الكانزة (15) — play a card and take table cards so that, together with your card,
 * they add up to exactly 15, using at most 3 cards (your card + up to 2 from the table).
 * Capture values are the card numbers (1–7, 10, 11, 12).
 * Scoring at the end of a hand: every card = 1 point, except gold (ذهب) cards which
 * count their number, and the 1 of gold which is worth 20.
 */
import { cardName, sortHand, type Card } from '../../src/shared/cards';
import type { CardSide, KanzaSettings, KanzaView } from '../../src/shared/protocol';
import { Feed, freshDeck, makeSides, randDelay, removeCard, sideOf, soloOf } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr } from '../util';

const HAND_SIZE = 3;
const TABLE_START = 4;
const TARGET_SUM = 15;
const MAX_TAKE = 2;

export function kanzaPoints(c: Card): number {
  if (c.suit !== 'coins') return 1;
  return c.rank === 1 ? 20 : c.rank;
}

interface State {
  settings: KanzaSettings;
  seats: string[];
  sides: CardSide[];
  scores: Record<string, number>;
  phase: KanzaView['phase'];
  hand: number;
  dealerIdx: number;
  turnIdx: number;
  deck: Card[];
  hands: Record<string, Card[]>;
  table: Card[];
  captured: Record<string, Card[]>;
  lastCapturer: string | null;
  lastPlay: KanzaView['lastPlay'];
  feed: Feed;
  handSummary: KanzaView['handSummary'];
  winner: string | null;
  moves: number;
}

const n = (s: State) => s.seats.length;

function dealRound(s: State) {
  const players = n(s);
  let per = HAND_SIZE;
  if (s.deck.length < HAND_SIZE * players) per = Math.floor(s.deck.length / players);
  for (let i = 1; i <= players; i++) {
    const id = s.seats[(s.dealerIdx + i) % players];
    s.hands[id].push(...s.deck.splice(0, per));
  }
  if (per < HAND_SIZE && s.deck.length) s.table.push(...s.deck.splice(0));
}

function startHand(ctx: GameCtx, s: State) {
  s.hand += 1;
  s.phase = 'play';
  s.deck = freshDeck();
  s.hands = Object.fromEntries(s.seats.map((id) => [id, []]));
  s.captured = Object.fromEntries(s.sides.map((x) => [x.key, []]));
  s.lastCapturer = null;
  s.lastPlay = null;
  s.handSummary = null;
  s.dealerIdx = (s.dealerIdx + 1) % n(s);
  s.turnIdx = (s.dealerIdx + 1) % n(s);
  s.table = s.deck.splice(0, TABLE_START);
  s.feed.clear();
  s.feed.push(`اليد ${s.hand} من ${s.settings.hands} — التوزيع: ${ctx.playerName(s.seats[s.dealerIdx])}`);
  dealRound(s);
  ctx.fx('card');
}

function endHand(ctx: GameCtx, s: State) {
  if (s.table.length && s.lastCapturer) {
    s.captured[sideOf(s.sides, s.lastCapturer)].push(...s.table);
    s.feed.push(`${ctx.playerName(s.lastCapturer)} يأخذ ما بقي على الطاولة`);
    s.table = [];
  }
  s.handSummary = s.sides.map((x) => {
    const cards = s.captured[x.key];
    return {
      side: x.key,
      cards: cards.length,
      golds: sortHand(cards.filter((c) => c.suit === 'coins')),
      points: cards.reduce((t, c) => t + kanzaPoints(c), 0),
    };
  });
  for (const row of s.handSummary) s.scores[row.side] = (s.scores[row.side] ?? 0) + row.points;
  if (s.hand >= s.settings.hands) {
    const best = Math.max(...Object.values(s.scores));
    const leaders = s.sides.filter((x) => s.scores[x.key] === best);
    s.winner = leaders.length === 1 ? leaders[0].key : null;
    s.phase = 'final';
    ctx.fx('win', soloOf(s.sides, s.winner));
  } else {
    s.phase = 'handEnd';
    ctx.fx('reveal');
  }
}

/** Every legal capture for a card: table combos of 1–2 cards that make 15 with it. */
export function kanzaCaptures(table: Card[], card: Card): Card[][] {
  const need = TARGET_SUM - card.rank;
  const out: Card[][] = [];
  for (let i = 0; i < table.length; i++) {
    if (table[i].rank === need) out.push([table[i]]);
    for (let j = i + 1; j < table.length; j++) {
      if (table[i].rank + table[j].rank === need) out.push([table[i], table[j]]);
    }
  }
  return out;
}

export const kanza: GameModule<State, KanzaSettings> = {
  turnOf: (s) => s.phase === 'play' ? [s.seats[s.turnIdx]] : [],
  id: 'kanza',
  hostOnly: ['next'],

  start(ctx, participants, settings) {
    const sides = makeSides(participants, participants.length === 4);
    const s: State = {
      settings,
      seats: participants,
      sides,
      scores: Object.fromEntries(sides.map((x) => [x.key, 0])),
      phase: 'play',
      hand: 0,
      dealerIdx: Math.floor(Math.random() * participants.length),
      turnIdx: 0,
      deck: [],
      hands: {},
      table: [],
      captured: {},
      lastCapturer: null,
      lastPlay: null,
      feed: new Feed(),
      handSummary: null,
      winner: null,
      moves: 0,
    };
    startHand(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'handEnd') startHand(ctx, s);
      return;
    }
    if (a.type !== 'play' || s.phase !== 'play') return;
    if (s.seats[s.turnIdx] !== by) throw new GameError('ليس دورك');
    if (!isStr(a.card)) return;
    const hand = s.hands[by];
    const card = hand.find((c) => c.id === a.card);
    if (!card) return;
    const takeIds = Array.isArray(a.take) ? (a.take as unknown[]).filter(isStr) : [];
    const take = s.table.filter((c) => takeIds.includes(c.id));
    if (take.length !== takeIds.length) return;
    if (take.length > MAX_TAKE) throw new GameError('3 أوراق على الأكثر: ورقتك + ورقتان من الطاولة');
    if (take.length) {
      const sum = card.rank + take.reduce((t, c) => t + c.rank, 0);
      if (sum !== TARGET_SUM) throw new GameError(`المجموع ${sum} — يجب أن يكون 15 بالضبط`);
    }
    removeCard(hand, card.id);
    s.moves += 1;
    if (take.length) {
      s.table = s.table.filter((c) => !take.includes(c));
      const side = sideOf(s.sides, by);
      s.captured[side].push(card, ...take);
      s.lastCapturer = by;
      const pts = [card, ...take].reduce((t, c) => t + kanzaPoints(c), 0);
      const gold = [card, ...take].some((c) => c.suit === 'coins');
      s.feed.push(`${ctx.playerName(by)} جمع 15${gold ? ' بالذهب' : ''}`, { by, points: pts });
      ctx.fx(take.some((c) => c.suit === 'coins' && c.rank === 1) || (card.suit === 'coins' && card.rank === 1) ? 'reveal' : 'correct', by);
    } else {
      s.table.push(card);
      s.feed.push(`${ctx.playerName(by)} رمى ${cardName(card)}`, { by });
      ctx.fx('card');
    }
    s.lastPlay = { by, card, took: take };

    s.turnIdx = (s.turnIdx + 1) % n(s);
    if (s.seats.every((id) => s.hands[id].length === 0)) {
      if (s.deck.length) {
        dealRound(s);
        // keep the capture sound of this action audible: only a drop is followed by the deal sound
        if (!take.length) ctx.fx('card');
      }
      if (s.seats.every((id) => s.hands[id].length === 0)) endHand(ctx, s);
    }
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play') return;
    const bot = s.seats[s.turnIdx];
    if (!ctx.isBot(bot)) return;
    const hand = s.hands[bot];
    if (!hand.length) return;
    let best: { card: Card; take: Card[]; score: number } | null = null;
    for (const c of hand) {
      for (const take of kanzaCaptures(s.table, c)) {
        const score = [c, ...take].reduce((t, x) => t + kanzaPoints(x), 0) + take.length * 0.1;
        if (!best || score > best.score) best = { card: c, take, score };
      }
    }
    if (!best) {
      // keep golds: drop the cheapest card, preferring one that doesn't make an easy 15
      const sorted = hand.slice().sort((x, y) => kanzaPoints(x) - kanzaPoints(y));
      const safe = sorted.find((c) => !s.table.some((t) => t.rank + c.rank === TARGET_SUM));
      best = { card: safe ?? sorted[0], take: [], score: 0 };
    }
    ctx.bot(bot, `play:${s.hand}:${s.moves}`, randDelay(1200, 2400), {
      type: 'play',
      card: best.card.id,
      take: best.take.map((c) => c.id),
    });
  },

  view(ctx, s, me): KanzaView {
    return {
      game: 'kanza',
      phase: s.phase,
      participants: s.seats,
      sides: s.sides,
      turn: s.seats[s.turnIdx],
      dealer: s.seats[s.dealerIdx],
      hand: s.hand,
      totalHands: s.settings.hands,
      myHand: sortHand(s.hands[me] ?? []),
      handCounts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      table: s.table,
      deckLeft: s.deck.length,
      capturedCounts: Object.fromEntries(s.sides.map((x) => [x.key, s.captured[x.key]?.length ?? 0])),
      scores: s.scores,
      lastPlay: s.lastPlay,
      feed: s.feed.list(),
      handSummary: s.handSummary,
      winner: s.winner,
    };
  },

  onLeave(ctx, s, id) {
    if (s.seats.includes(id) && s.phase !== 'final') {
      s.feed.push(`${ctx.playerName(id)} غادر اللعبة`);
      s.phase = 'final';
      s.winner = null;
    }
  },
};
