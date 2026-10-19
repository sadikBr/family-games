/**
 * «هزّ 2» — the Moroccan «shed your hand» card game (https://rasderb.com/rules/hez2).
 * Moroccan deck of 40 (1–7, 10, 11, 12 in أوروص / كوباص / شباضا / باسطوص), 2–4 players, 5 cards each.
 * Play a card of the same number or the same suit as the top card; with nothing to play, draw one card
 * (play it at once if it fits, otherwise the turn passes).
 *   7  joker: on anything, its player picks the suit everyone follows until another 7.
 *   2  «هزّ 2»: the next player draws 2 and loses the turn, unless they answer with a 2 (they stack:
 *      four 2s = 8 cards). Only a 2 answers a 2. A last card 2 only ends the round once someone has
 *      drawn its penalty; if it comes back to its player, they draw it and play on (setting).
 *   1, 10  play again. 10 can never be the last card.
 *   12  the next player loses the turn (two players: play again).
 * Cards left in hand count against their owner (1–7 face value, 10/11/12 = 10). When someone reaches
 * the target (100), the game ends and the fewest points win (tie: the better last round).
 */
import { cardName, makeDeck, sortHand, SUIT_INFO, SUITS, type Card, type Suit } from '../../src/shared/cards';
import {
  HEZ2_HAND,
  HEZ2_OVER_MS,
  HEZ2_ROUND_END_MS,
  hez2Points,
  isSpecial,
  type Hez2Event,
  type Hez2Row,
  type Hez2Settings,
  type Hez2View,
} from '../../src/shared/games/hez2';
import { li } from '../../src/shared/li';
import { randDelay } from '../cardkit';
import { decide, type Void } from '../hez2-bot';
import { botLevel, GameError, paced, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, isStr, shuffle } from '../util';
import { SUIT_VOICE, voiceHez, voiceRound, voiceWin } from '../voice-calls';

export const OVER_MS = HEZ2_OVER_MS;
export const ROUND_END_MS = HEZ2_ROUND_END_MS;

export interface State {
  settings: Hez2Settings;
  seats: string[];
  scores: Record<string, number>;
  history: Record<string, number>[];
  phase: Hez2View['phase'];
  round: number;
  dealerIdx: number;
  turnIdx: number;
  deck: Card[];
  discard: Card[];
  topBy: string | null;
  hands: Record<string, Card[]>;
  suit: Suit;
  suitChosen: boolean;
  pending: number;
  out: string | null;
  again: string | null;
  choosing: string | null;
  drawn: { by: string; id: string } | null;
  event: Hez2Event | null;
  eventSeq: number;
  /** draws in a row that found no card at all (stock and pile empty) */
  stuckCount: number;
  stuck: boolean;
  roundWinner: string | null;
  roundSummary: Hez2Row[] | null;
  winner: string | null;
  /** the winner is the last one left (the others left the game) */
  byLeave: boolean;
  overAt: number | null;
  nextAt: number | null;
  moves: number;
  /** what each player is known to lack since their last draw (for the expert bots; public information) */
  voids: Record<string, Void>;
}

const n = (s: State) => s.seats.length;
const cur = (s: State) => s.seats[s.turnIdx];
const at = (s: State, k: number) => s.seats[(s.turnIdx + k) % n(s)];
const topCard = (s: State): Card | null => s.discard[s.discard.length - 1] ?? null;
const name = (ctx: GameCtx, id: string) => ctx.playerName(id);
const handPoints = (cards: Card[]) => cards.reduce((t, c) => t + hez2Points(c), 0);
/** «ورقتان» / «3 أوراق» / «8 أوراق» (penalties are 2 to 8 cards) */
const cardsText = (k: number) => (k === 1 ? 'ورقة' : k === 2 ? 'ورقتان' : `${k} أوراق`);

function refill(s: State) {
  if (s.deck.length || s.discard.length < 2) return;
  const keep = s.discard.pop()!;
  s.deck = shuffle(s.discard);
  s.discard = [keep];
}

function drawOne(s: State, id: string): Card | null {
  refill(s);
  const c = s.deck.shift();
  if (!c) return null;
  s.hands[id].push(c);
  return c;
}

function drawN(s: State, id: string, k: number): number {
  let got = 0;
  for (let i = 0; i < k; i++) if (drawOne(s, id)) got++;
  return got;
}

function setEvent(s: State, e: Omit<Hez2Event, 'id'>) {
  s.eventSeq += 1;
  s.event = { id: s.eventSeq, ...e };
}

/** May `id` put this card down now (their turn aside)? */
export function canPlay(s: State, id: string, c: Card): boolean {
  if (c.rank === 10 && s.hands[id].length === 1) return false; // the 10 never ends a hand
  if (s.pending > 0) return c.rank === 2; // only a 2 answers a 2
  if (c.rank === 7) return true;
  const t = topCard(s);
  return c.suit === s.suit || (!!t && c.rank === t.rank);
}

export function playable(s: State, id: string): string[] {
  if (s.phase !== 'play' || s.choosing || cur(s) !== id) return [];
  const hand = s.hands[id] ?? [];
  const cards = s.drawn?.by === id ? hand.filter((c) => c.id === s.drawn!.id) : hand;
  return cards.filter((c) => canPlay(s, id, c)).map((c) => c.id);
}

/**
 * The turn moves `steps` seats on. A player with no cards left whose last 2 came back to them (every
 * player answered it with a 2) draws the whole penalty and the turn goes on.
 */
function advance(ctx: GameCtx, s: State, steps = 1) {
  s.turnIdx = (s.turnIdx + steps) % n(s);
  s.drawn = null;
  s.again = null;
  for (let guard = 0; guard < n(s) && s.pending > 0 && s.hands[cur(s)].length === 0; guard++) {
    const id = cur(s);
    const k = drawN(s, id, s.pending);
    setEvent(s, { kind: 'back', by: id, target: id, n: k });
    ctx.say?.(`عادت العقوبة إلى ${name(ctx, id)}: ${cardsText(k)}`, id);
    ctx.fx('buzz', id);
    s.pending = 0;
    delete s.voids[id];
    if (s.out === id) s.out = null;
    s.turnIdx = (s.turnIdx + 1) % n(s);
  }
}

function startRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'play';
  s.deck = shuffle(makeDeck());
  s.hands = Object.fromEntries(s.seats.map((id) => [id, []]));
  s.dealerIdx = (s.dealerIdx + 1) % n(s);
  s.turnIdx = (s.dealerIdx + 1) % n(s);
  for (let k = 0; k < HEZ2_HAND; k++) for (const id of s.seats) s.hands[id].push(s.deck.shift()!);
  // the first card turned up is a plain one (3–6 or 11): a special card goes back into the stock
  let i = s.deck.findIndex((c) => !isSpecial(c));
  if (i < 0) i = 0;
  s.discard = s.deck.splice(i, 1);
  s.topBy = null;
  s.suit = s.discard[0].suit;
  s.suitChosen = false;
  s.pending = 0;
  s.out = null;
  s.again = null;
  s.choosing = null;
  s.drawn = null;
  s.event = null;
  s.stuckCount = 0;
  s.stuck = false;
  s.roundWinner = null;
  s.roundSummary = null;
  s.overAt = null;
  s.nextAt = null;
  s.voids = {};
  s.moves += 1;
  ctx.say?.(`الجولة ${s.round} — البداية ${li(name(ctx, cur(s)))}`);
  ctx.fx('card');
}

/** Everyone by total points (fewest first), then by the last round (fewest first), then by seat. */
export function ranking(s: State): string[] {
  const last = s.history[s.history.length - 1] ?? {};
  return [...s.seats].sort((a, b) => (s.scores[a] ?? 0) - (s.scores[b] ?? 0) || (last[a] ?? 0) - (last[b] ?? 0));
}

function endRound(ctx: GameCtx, s: State, winner: string | null, stuck = false) {
  const rows: Hez2Row[] = s.seats.map((id) => {
    const cards = sortHand(s.hands[id]);
    return { id, cards, points: handPoints(cards) };
  });
  if (stuck) winner = [...rows].sort((a, b) => a.points - b.points)[0]?.id ?? null;
  const pts: Record<string, number> = {};
  for (const r of rows) {
    pts[r.id] = r.points;
    s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
  }
  s.history.push(pts);
  s.roundWinner = winner;
  s.roundSummary = rows;
  s.stuck = stuck;
  s.phase = 'over';
  s.choosing = null;
  s.drawn = null;
  s.again = null;
  s.pending = 0;
  s.out = null;
  s.overAt = ctx.now + paced(ctx, OVER_MS);
  s.moves += 1;
  const reached = s.seats.some((id) => (s.scores[id] ?? 0) >= s.settings.target);
  s.winner = reached ? ranking(s)[0] : null;
  // read aloud: the winner of the round (the game's winner is read when the game ends, in tick)
  const voice = winner ? voiceRound(name(ctx, winner)) : undefined;
  if (stuck) ctx.say?.(`لا أوراق للسحب — انتهت الجولة${winner ? `، الأقل نقاطاً: ${name(ctx, winner)}` : ''}`, undefined, voice);
  else if (winner) ctx.say?.(`انتهت الجولة — الفوز بها ${li(name(ctx, winner))}`, winner, voice);
  ctx.fx('reveal', winner ?? undefined);
}

/** Put down a card that was checked as playable. */
function playCard(ctx: GameCtx, s: State, by: string, card: Card) {
  const hand = s.hands[by];
  hand.splice(
    hand.findIndex((c) => c.id === card.id),
    1,
  );
  s.discard.push(card);
  s.topBy = by;
  s.suit = card.suit;
  s.suitChosen = false;
  s.drawn = null;
  s.again = null;
  s.stuckCount = 0;
  s.moves += 1;
  ctx.fx('card', by);
  const label = cardName(card);
  const empty = hand.length === 0;
  const lead = `${empty ? 'آخر ورقة' : 'ورقة'} من ${name(ctx, by)}: ${label}`;

  if (card.rank === 2) {
    s.pending += 2;
    const victim = at(s, 1);
    if (empty && !s.settings.lastTwo) {
      // the table's way: the penalty lands at once and the round is over
      const stacked = s.pending;
      const k = drawN(s, victim, s.pending);
      s.pending = 0;
      setEvent(s, { kind: 'two', by, target: victim, n: k });
      ctx.say?.(`${lead} — ${cardsText(k)} على ${name(ctx, victim)}`, by, voiceHez(stacked));
      ctx.fx('buzz', victim);
      endRound(ctx, s, by);
      return;
    }
    if (empty) s.out = by;
    setEvent(s, { kind: 'two', by, target: victim, n: s.pending });
    // «هزّ 2», «هزّ 4»… (the 2s stack)
    ctx.say?.(`${lead} — ${s.pending} للسحب على ${name(ctx, victim)}`, by, voiceHez(s.pending));
    advance(ctx, s, 1);
    return;
  }
  if (empty) {
    ctx.say?.(lead, by);
    endRound(ctx, s, by);
    return;
  }
  if (card.rank === 7) {
    s.choosing = by;
    ctx.say?.(`${lead} — واختيار لون`, by);
    return;
  }
  if (card.rank === 1 || card.rank === 10 || (card.rank === 12 && n(s) === 2)) {
    s.again = by;
    ctx.say?.(`${lead} — دور إضافي`, by);
    return;
  }
  if (card.rank === 12) {
    const victim = at(s, 1);
    setEvent(s, { kind: 'skip', by, target: victim });
    ctx.say?.(`${lead} — دور ضائع على ${name(ctx, victim)}`, by);
    advance(ctx, s, 2);
    return;
  }
  ctx.say?.(lead, by);
  advance(ctx, s, 1);
}

/* —— the module —————————————————————————————————————————————————————————————————— */

export const hez2: GameModule<State, Hez2Settings> = {
  id: 'hez2',
  hostOnly: ['next'],
  turnOf: (s) => (s.phase === 'play' ? [s.choosing ?? cur(s)] : []),

  start(ctx, participants, settings) {
    const s: State = {
      settings: { ...settings },
      seats: [...participants],
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      history: [],
      phase: 'play',
      round: 0,
      dealerIdx: Math.floor(Math.random() * participants.length),
      turnIdx: 0,
      deck: [],
      discard: [],
      topBy: null,
      hands: {},
      suit: 'coins',
      suitChosen: false,
      pending: 0,
      out: null,
      again: null,
      choosing: null,
      drawn: null,
      event: null,
      eventSeq: 0,
      stuckCount: 0,
      stuck: false,
      roundWinner: null,
      roundSummary: null,
      winner: null,
      byLeave: false,
      overAt: null,
      nextAt: null,
      moves: 0,
      voids: {},
    };
    startRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'roundEnd') startRound(ctx, s);
      return;
    }
    if (s.phase !== 'play' || !s.seats.includes(by)) return;

    if (a.type === 'suit') {
      if (s.choosing !== by) return;
      const suit = a.suit as Suit;
      if (!SUITS.includes(suit)) return;
      s.suit = suit;
      s.suitChosen = true;
      s.choosing = null;
      s.moves += 1;
      setEvent(s, { kind: 'suit', by, suit });
      // read aloud: the suit the 7 asks for
      ctx.say?.(`اللون من اختيار ${name(ctx, by)}: ${SUIT_INFO[suit].name}`, by, SUIT_VOICE[suit]);
      advance(ctx, s, 1);
      return;
    }

    if (cur(s) !== by) throw new GameError('ليس دورك');
    if (s.choosing) return;

    if (a.type === 'draw') {
      if (s.drawn?.by === by) throw new GameError('سحبت ورقة — العبها أو مرّر');
      if (playable(s, by).length) throw new GameError(s.pending ? 'لديك 2 تردّ بها' : 'لديك ورقة تصلح — العبها');
      s.moves += 1;
      if (s.pending > 0) {
        const k = drawN(s, by, s.pending);
        s.pending = 0;
        delete s.voids[by]; // new unknown cards
        ctx.say?.(`عقوبة على ${name(ctx, by)}: ${cardsText(k)}`, by);
        ctx.fx('buzz', by);
        if (s.out && s.hands[s.out]?.length === 0) {
          endRound(ctx, s, s.out);
          return;
        }
        s.out = null;
        advance(ctx, s, 1);
        return;
      }
      // nothing to play: everyone now knows this player lacks the suit, the number and any 7
      s.voids[by] = { suits: [s.suit], ranks: [topCard(s)?.rank ?? 0], no7: true };
      const c = drawOne(s, by);
      if (!c) {
        s.stuckCount += 1;
        ctx.say?.(`لا أوراق للسحب — تمرير: ${name(ctx, by)}`, by);
        if (s.stuckCount >= n(s)) endRound(ctx, s, null, true);
        else advance(ctx, s, 1);
        return;
      }
      s.stuckCount = 0;
      ctx.fx('card', by);
      if (canPlay(s, by, c)) {
        s.drawn = { by, id: c.id };
        ctx.say?.(`ورقة من الكومة: ${name(ctx, by)}`, by);
      } else {
        ctx.say?.(`ورقة من الكومة ثم تمرير: ${name(ctx, by)}`, by);
        advance(ctx, s, 1);
      }
      return;
    }

    if (a.type === 'pass') {
      if (s.drawn?.by !== by) throw new GameError('اسحب ورقة أولاً');
      delete s.voids[by]; // kept a card that fits: what they lack is unknown again
      s.moves += 1;
      ctx.say?.(`تمرير: ${name(ctx, by)}`, by);
      advance(ctx, s, 1);
      return;
    }

    if (a.type === 'play') {
      if (!isStr(a.card)) return;
      const card = s.hands[by].find((c) => c.id === a.card);
      if (!card) return;
      if (!playable(s, by).includes(card.id)) {
        if (card.rank === 10 && s.hands[by].length === 1) throw new GameError('لا تنتهي الأوراق بالخادم — اسحب ورقة');
        if (s.drawn?.by === by) throw new GameError('العب الورقة المسحوبة أو مرّر');
        throw new GameError(s.pending ? 'لا يُردّ على 2 إلا بـ2' : 'لا يمكنك لعب هذه الورقة');
      }
      playCard(ctx, s, by, card);
    }
  },

  tick(ctx, s) {
    if (s.phase === 'over' && s.overAt !== null && ctx.now >= s.overAt) {
      s.overAt = null;
      if (s.winner) {
        s.phase = 'final';
        ctx.say?.(`الفوز ${li(name(ctx, s.winner))} بـ${s.scores[s.winner] ?? 0} نقطة`, s.winner, voiceWin(name(ctx, s.winner)));
        ctx.fx('win', s.winner);
      } else {
        s.phase = 'roundEnd';
        s.nextAt = ctx.now + paced(ctx, ROUND_END_MS);
      }
      return true;
    }
    if (s.phase === 'roundEnd' && s.nextAt !== null && ctx.now >= s.nextAt) {
      startRound(ctx, s);
      return true;
    }
    return false;
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play') return;
    const key = `${s.round}:${s.moves}`;
    const bot = s.choosing ?? cur(s);
    if (!ctx.isBot(bot)) return;
    const a = decide(s, bot, botLevel(ctx));
    if (!a) return;
    const delay = a.type === 'suit' ? randDelay(700, 1300) : a.type === 'play' ? randDelay(1000, 1900) : a.type === 'pass' ? randDelay(700, 1200) : randDelay(900, 1600);
    ctx.bot(bot, `${a.type}:${key}`, delay, a);
  },

  view(_ctx, s, me): Hez2View {
    const mine = playable(s, me);
    const myTurn = s.phase === 'play' && cur(s) === me && !s.choosing;
    return {
      game: 'hez2',
      phase: s.phase,
      participants: s.seats,
      round: s.round,
      target: s.settings.target,
      lastTwo: s.settings.lastTwo,
      turn: s.phase === 'play' ? cur(s) : null,
      top: topCard(s),
      topBy: s.topBy,
      suit: s.suit,
      suitChosen: s.suitChosen,
      pending: s.pending,
      out: s.out,
      again: s.again,
      deckLeft: s.deck.length,
      myHand: sortHand(s.hands[me] ?? []),
      playable: mine,
      counts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      choosing: s.choosing,
      drawn: s.drawn?.by === me ? s.drawn.id : null,
      canDraw: myTurn && !s.drawn && mine.length === 0,
      canPass: myTurn && s.drawn?.by === me,
      scores: s.scores,
      history: s.history,
      event: s.event,
      roundWinner: s.roundWinner,
      roundSummary: s.roundSummary,
      stuck: s.stuck,
      winner: s.winner,
      nextAt: s.nextAt,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.seats.includes(id) || s.phase === 'final') return;
    const idx = s.seats.indexOf(id);
    const wasTurn = s.phase === 'play' && s.turnIdx === idx;
    s.seats.splice(idx, 1);
    // their cards go to the bottom of the stock
    s.deck.push(...(s.hands[id] ?? []));
    delete s.hands[id];
    if (s.choosing === id) s.choosing = null; // the 7 keeps its own suit
    if (s.out === id) s.out = null;
    if (s.drawn?.by === id) s.drawn = null;
    if (s.again === id) s.again = null;
    s.moves += 1;
    if (s.seats.length < 2) {
      s.phase = 'final';
      s.winner = s.seats[0] ?? null;
      s.byLeave = true;
      s.overAt = null;
      s.nextAt = null;
      if (s.winner) ctx.fx('win', s.winner);
      return;
    }
    if (idx < s.turnIdx) s.turnIdx -= 1;
    s.turnIdx %= s.seats.length;
    if (idx <= s.dealerIdx) s.dealerIdx = (s.dealerIdx - 1 + s.seats.length) % s.seats.length;
    if (s.winner === id) s.winner = ranking(s)[0];
    if (wasTurn) advance(ctx, s, 0);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.target)) settings.target = clamp(Math.round(patch.target / 50) * 50, 50, 200);
    if (typeof patch.lastTwo === 'boolean') settings.lastTwo = patch.lastTwo;
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const last = s.history[s.history.length - 1] ?? {};
    const key = (id: string) => `${s.scores[id] ?? 0}:${last[id] ?? 0}`;
    const order = ranking(s);
    const rest = s.byLeave ? order.filter((id) => id !== s.winner) : order;
    const places: string[][] = s.byLeave ? [[s.winner]] : [];
    let prev: string | null = null;
    for (const id of rest) {
      const k = key(id);
      if (k === prev && places.length) places[places.length - 1].push(id);
      else places.push([id]);
      prev = k;
    }
    return { places };
  },
};
