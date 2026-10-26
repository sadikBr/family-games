/**
 * «الممالك الخمس» — books, runs and a wild that changes every round (Five Crowns rules), 2–7 players,
 * bots welcome. 116 cards: five suits (fire, sun, leaf, water, star) × 3…K twice, and 6 jokers.
 * 11 rounds (or 6 in the short game): round k deals k + 2 cards, and that rank is wild (3s, then 4s…
 * J, Q, K); jokers are always wild. One card face up. A turn: draw (the stock, or the face-up card),
 * then throw one — or go out: throw one and lay everything else down in books (3+ of a rank) and runs
 * (3+ in a row of one suit, 3…K). Then every other player has exactly one last turn, and everyone's
 * best arrangement is worked out (src/shared/realms-rules.ts): the cards that fit nowhere count (face
 * value, J 11, Q 12, K 13, the round's wilds 20, jokers 50); the one who went out scores 0. Lowest total
 * after the last round wins.
 */
import {
  REALMS_ROUND_END_MS,
  realmsDeals,
  type RealmCard,
  type RealmGroup,
  type RealmsPlan,
  type RealmsRoundRow,
  type RealmsSettings,
  type RealmsView,
} from '../../src/shared/games/realms';
import { li } from '../../src/shared/li';
import { arrange, bestThrow, cardPoints, isWild, leftPoints, makeRealmsDeck, outCards, realmCardName, rankLabel } from '../../src/shared/realms-rules';
import type { BotLevel } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { botDraw, botThrow, type BotMove, type Seat } from '../realms-bot';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isStr, shuffle } from '../util';
import { voiceWin } from '../voice-calls';
import { voiceRealmsOut, voiceRealmsWild } from '../voice-calls-realms';

export const ROUND_END_MS = REALMS_ROUND_END_MS;
/** The discard pile goes back into the stock at most this many times per round (then the round ends). */
const MAX_RESHUFFLES = 3;
/** A round ends anyway after this many turns per player (no one ever gets near it in a real game). */
const MAX_TURNS_PER_PLAYER = 60;

export interface State {
  settings: RealmsSettings;
  seats: string[];
  active: string[];
  /** cards dealt in each round of this game (= the wild rank) */
  deals: number[];
  scores: Record<string, number>;
  history: Record<string, number>[];
  phase: RealmsView['phase'];
  /** 1-based */
  round: number;
  dealerIdx: number;
  turn: string;
  step: RealmsView['step'];
  stock: RealmCard[];
  discard: RealmCard[];
  throwers: (string | null)[];
  reshuffles: number;
  hands: Record<string, RealmCard[]>;
  /** the card taken from the discard pile this turn (it can't be thrown straight back) */
  taken: string | null;
  /** turns each player has played this round (the bots' sense of time) */
  turns: Record<string, number>;
  /** the cards each player threw or took from the pile this round (public: a bot never takes one of them again) */
  thrown?: Record<string, string[]>;
  outBy: string | null;
  outGroups: RealmGroup[] | null;
  /** players who still have their last turn, in order */
  lastTurn: string[];
  outEvent: RealmsView['outEvent'];
  outSeq: number;
  feed: Feed;
  summary: RealmsRoundRow[] | null;
  winner: string | null;
  nextAt: number | null;
  deadline: number | null;
  /** bumps on every move (bot keys) */
  actions: number;
}

export const wildOf = (s: State) => s.deals[s.round - 1] ?? 3;

function nextActive(s: State, from: string): string {
  const i = s.seats.indexOf(from);
  for (let k = 1; k <= s.seats.length; k++) {
    const id = s.seats[(i + k) % s.seats.length];
    if (s.active.includes(id)) return id;
  }
  return from;
}

function armTimer(ctx: GameCtx, s: State) {
  s.deadline = s.settings.timer > 0 && s.phase === 'play' ? ctx.now + s.settings.timer * 1000 : null;
}

function startRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'play';
  const per = wildOf(s);
  s.stock = shuffle(makeRealmsDeck());
  let dealer = s.seats[s.dealerIdx] ?? s.active[0];
  dealer = nextActive(s, dealer);
  s.dealerIdx = s.seats.indexOf(dealer);
  s.turn = nextActive(s, dealer);
  s.hands = Object.fromEntries(s.seats.map((id) => [id, s.active.includes(id) ? s.stock.splice(0, per) : []]));
  s.discard = [s.stock.pop()!];
  s.throwers = [null];
  s.reshuffles = 0;
  s.step = 'draw';
  s.taken = null;
  s.turns = {};
  s.thrown = {};
  s.outBy = null;
  s.outGroups = null;
  s.lastTurn = [];
  s.outEvent = null;
  s.summary = null;
  s.nextAt = null;
  s.actions += 1;
  s.feed.clear();
  const w = rankLabel(per);
  s.feed.push(`الجولة ${s.round} — ${per} أوراق لكل لاعب، والجوكر: ${w}`);
  ctx.say?.(`الجولة ${s.round} من ${s.deals.length} — جوكر الجولة: ${w} — البداية ${li(ctx.playerName(s.turn))}`, undefined, voiceRealmsWild(per));
  ctx.fx('card');
  armTimer(ctx, s);
}

function finishGame(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.nextAt = null;
  s.deadline = null;
  s.winner = s.active.slice().sort((a, b) => (s.scores[a] ?? 0) - (s.scores[b] ?? 0) || s.seats.indexOf(a) - s.seats.indexOf(b))[0] ?? null;
  if (s.winner) ctx.fx('win', s.winner);
}

/** End of the round: everyone's best arrangement, the points, the next round or the end. */
function endRound(ctx: GameCtx, s: State) {
  const wild = wildOf(s);
  s.deadline = null;
  s.taken = null;
  s.summary = s.active.map((id): RealmsRoundRow => {
    if (id === s.outBy) return { id, groups: s.outGroups ?? [], left: [], points: 0, out: true };
    const a = arrange(s.hands[id] ?? [], wild);
    return { id, groups: a.groups, left: a.left, points: a.points, out: false };
  });
  const gained: Record<string, number> = {};
  for (const row of s.summary) {
    s.scores[row.id] = (s.scores[row.id] ?? 0) + row.points;
    gained[row.id] = row.points;
  }
  s.history.push(gained);
  const last = s.round >= s.deals.length;
  const zero = s.summary.filter((r) => !r.out && r.points === 0).map((r) => ctx.playerName(r.id));
  s.feed.push(`انتهت الجولة ${s.round}`);
  if (last) {
    finishGame(ctx, s);
    const w = s.winner;
    ctx.say?.(w ? `انتهت اللعبة — الفوز ${li(ctx.playerName(w))} بـ${s.scores[w]} نقطة` : 'انتهت اللعبة', w ?? undefined, w ? voiceWin(ctx.playerName(w)) : undefined);
    return;
  }
  ctx.say?.(`انتهت الجولة ${s.round}${zero.length ? ` — صفر أيضاً: ${zero.join(' و')}` : ''}`);
  s.phase = 'roundEnd';
  s.nextAt = ctx.now + paced(ctx, ROUND_END_MS);
  ctx.fx('reveal');
}

/** The turn is over: the next player (or the next last turn, or the end of the round). */
function passTurn(ctx: GameCtx, s: State, from: string) {
  s.turns[from] = (s.turns[from] ?? 0) + 1;
  // a round that goes on and on (players passing the same cards back and forth) ends like an empty stock
  if (!s.outBy && Object.values(s.turns).reduce((t, n) => t + n, 0) >= MAX_TURNS_PER_PLAYER * s.active.length) {
    s.feed.push('طالت الجولة كثيراً');
    ctx.say?.('طالت الجولة كثيراً — انتهت الجولة');
    endRound(ctx, s);
    return;
  }
  s.taken = null;
  s.step = 'draw';
  if (s.outBy) {
    s.lastTurn = s.lastTurn.filter((id) => id !== from && s.active.includes(id));
    if (!s.lastTurn.length) {
      endRound(ctx, s);
      return;
    }
    s.turn = s.lastTurn[0];
  } else {
    s.turn = nextActive(s, from);
  }
  armTimer(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Moves                                                               */
/* ------------------------------------------------------------------ */

function drawDeck(ctx: GameCtx, s: State, by: string) {
  if (!s.stock.length) {
    if (s.reshuffles >= MAX_RESHUFFLES || s.discard.length <= 1) {
      s.feed.push('انتهت الكومة');
      ctx.say?.('انتهت الكومة — انتهت الجولة');
      endRound(ctx, s);
      return;
    }
    s.reshuffles += 1;
    const top = s.discard.pop()!;
    s.stock = shuffle(s.discard);
    s.discard = [top];
    s.throwers = s.throwers.slice(-1);
    s.feed.push('خلط الأوراق المرمية في الكومة');
  }
  s.hands[by].push(s.stock.pop()!);
  s.step = 'discard';
  s.actions += 1;
  s.feed.push(`${ctx.playerName(by)}: سحب من الكومة`, { by });
  ctx.say?.(`سحب من الكومة: ${ctx.playerName(by)}`, by);
  ctx.fx('card');
}

function drawDiscard(ctx: GameCtx, s: State, by: string) {
  const card = s.discard[s.discard.length - 1];
  if (!card) throw new GameError('لا توجد ورقة مكشوفة');
  s.discard.pop();
  s.throwers.pop();
  s.hands[by].push(card);
  s.taken = card.id;
  (s.thrown ??= {})[by] = [...(s.thrown[by] ?? []), card.id];
  s.step = 'discard';
  s.actions += 1;
  s.feed.push(`${ctx.playerName(by)}: أخذ ${realmCardName(card)}`, { by });
  ctx.say?.(`المكشوفة إلى ${ctx.playerName(by)}: ${realmCardName(card)}`, by);
  ctx.fx('card');
}

function throwCard(ctx: GameCtx, s: State, by: string, cardId: unknown, out: boolean) {
  const hand = s.hands[by];
  const idx = isStr(cardId) ? hand.findIndex((c) => c.id === cardId) : -1;
  if (idx < 0) throw new GameError('هذه الورقة ليست في يدك');
  if (cardId === s.taken) throw new GameError('لا يمكن رمي الورقة المأخوذة للتو');
  const wild = wildOf(s);
  const rest = hand.filter((_, i) => i !== idx);
  if (out && leftPoints(rest, wild) > 0) throw new GameError('لا يمكن الخروج: بعض الأوراق لا تدخل في مجموعة أو متتالية');
  const [card] = hand.splice(idx, 1);
  s.discard.push(card);
  s.throwers.push(by);
  (s.thrown ??= {})[by] = [...(s.thrown[by] ?? []), card.id];
  s.actions += 1;
  const name = ctx.playerName(by);
  if (out && !s.outBy) {
    // going out: everything else goes down, and every other player has one last turn
    s.outBy = by;
    s.outGroups = arrange(rest, wild).groups;
    s.outEvent = { id: ++s.outSeq, by };
    const order: string[] = [];
    for (let id = nextActive(s, by); id !== by && order.length < s.seats.length; id = nextActive(s, id)) order.push(id);
    s.lastTurn = order;
    s.feed.push(`${name}: خروج!`, { by });
    ctx.say?.(`خروج ${li(name)} برمي ${realmCardName(card)} — دور أخير لكل لاعب`, by, voiceRealmsOut(name));
    ctx.fx('correct', by);
  } else {
    s.feed.push(`${name}: رمى ${realmCardName(card)}`, { by });
    const all = s.outBy && leftPoints(rest, wild) === 0;
    ctx.say?.(all ? `ورقة مرمية من ${name}: ${realmCardName(card)} — والباقي كله في مجموعات` : `ورقة مرمية من ${name}: ${realmCardName(card)}`, by);
    ctx.fx('card');
  }
  passTurn(ctx, s, by);
}

function step(ctx: GameCtx, s: State, by: string, a: { type: string; [k: string]: unknown }) {
  switch (a.type) {
    case 'drawDeck':
      if (s.step !== 'draw') return;
      drawDeck(ctx, s, by);
      return;
    case 'drawDiscard':
      if (s.step !== 'draw') return;
      drawDiscard(ctx, s, by);
      return;
    case 'discard':
      if (s.step !== 'discard') throw new GameError('اسحب ورقة أولاً');
      throwCard(ctx, s, by, a.card, false);
      return;
    case 'out':
      if (s.step !== 'discard') throw new GameError('اسحب ورقة أولاً');
      throwCard(ctx, s, by, a.card, true);
      return;
  }
}

/* ------------------------------------------------------------------ */
/* Bots (and the turn timer)                                           */
/* ------------------------------------------------------------------ */

export function seatFor(s: State, id: string): Seat {
  return {
    hand: s.hands[id] ?? [],
    wild: wildOf(s),
    top: s.discard[s.discard.length - 1] ?? null,
    last: !!s.outBy,
    turns: s.turns[id] ?? 0,
    thrown: s.thrown?.[id] ?? [],
    dealt: wildOf(s),
    seen: s.discard,
  };
}

/** The next move of a bot playing `id` at this strength. */
export function planBot(s: State, id: string, level: BotLevel): BotMove {
  const seat = seatFor(s, id);
  if (s.step === 'draw') return botDraw(seat, level);
  return botThrow(seat, level, s.taken);
}

/** A player who ran out of time: a card from the stock, then out if the hand allows it, else the throw that hurts least. */
function autoTurn(ctx: GameCtx, s: State, id: string) {
  if (s.step === 'draw') drawDeck(ctx, s, id);
  if (s.phase !== 'play' || s.turn !== id || s.step !== 'discard') return;
  step(ctx, s, id, botThrow(seatFor(s, id), 'smart', s.taken));
}

/* ------------------------------------------------------------------ */
/* My plan (the best arrangement of my hand, for my phone)             */
/* ------------------------------------------------------------------ */

const planCache = new Map<string, RealmsPlan>();

function planFor(s: State, me: string): RealmsPlan | null {
  const hand = s.hands[me];
  if (s.phase !== 'play' || !hand?.length) return null;
  const wild = wildOf(s);
  const mine = s.turn === me && s.step === 'discard';
  const lastMine = mine && !!s.outBy;
  const taken = mine ? s.taken : null;
  const key = `${wild}|${mine ? 1 : 0}${lastMine ? 1 : 0}|${taken ?? ''}|${hand.map((c) => c.id).sort().join(',')}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const outs = mine ? outCards(hand, wild).filter((id) => id !== taken) : [];
  // my turn, one card too many: the throw (to go out with: a natural card first, the dearest), and the rest
  let throwCard: RealmCard | null = null;
  if (mine) {
    const outList = hand.filter((c) => outs.includes(c.id));
    throwCard = outList.length ? (outList.filter((c) => !isWild(c, wild)).length ? outList.filter((c) => !isWild(c, wild)) : outList).sort((x, y) => cardPoints(y, wild) - cardPoints(x, wild))[0] : bestThrow(hand, wild, undefined, taken).card;
  }
  const a = arrange(throwCard ? hand.filter((c) => c !== throwCard) : hand, wild);
  const best: RealmsPlan['best'] = lastMine && throwCard ? { card: throwCard.id, points: a.points } : null;
  const plan: RealmsPlan = { throw: throwCard?.id ?? null, groups: a.groups.map((g) => g.cards.map((c) => c.id)), left: a.left.map((c) => c.id), points: a.points, outCards: outs, best };
  if (planCache.size > 400) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

/* ------------------------------------------------------------------ */

export const realms: GameModule<State, RealmsSettings> = {
  id: 'realms',
  hostOnly: ['next'],

  turnOf: (s) => (s.phase === 'play' ? [s.turn] : []),

  start(ctx, participants, settings) {
    const s: State = {
      settings: { ...settings },
      seats: participants.slice(),
      active: participants.slice(),
      deals: realmsDeals(settings),
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      history: [],
      phase: 'play',
      round: 0,
      dealerIdx: Math.floor(Math.random() * participants.length),
      turn: participants[0],
      step: 'draw',
      stock: [],
      discard: [],
      throwers: [],
      reshuffles: 0,
      hands: {},
      taken: null,
      turns: {},
      outBy: null,
      outGroups: null,
      lastTurn: [],
      outEvent: null,
      outSeq: 0,
      feed: new Feed(),
      summary: null,
      winner: null,
      nextAt: null,
      deadline: null,
      actions: 0,
    };
    startRound(ctx, s);
    ctx.fx('start');
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'roundEnd') startRound(ctx, s);
      return;
    }
    if (s.phase !== 'play' || !s.active.includes(by)) return;
    if (s.turn !== by) throw new GameError('ليس دورك');
    step(ctx, s, by, a);
  },

  tick(ctx, s) {
    if (s.phase === 'roundEnd' && s.nextAt !== null && ctx.now >= s.nextAt) {
      startRound(ctx, s);
      return true;
    }
    if (s.phase === 'play' && s.deadline !== null && ctx.now >= s.deadline) {
      const id = s.turn;
      s.feed.push(`${ctx.playerName(id)}: انتهى الوقت`, { by: id });
      autoTurn(ctx, s, id);
      return true;
    }
    return false;
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play' || !s.active.includes(s.turn) || !ctx.isBot(s.turn)) return;
    const bot = s.turn;
    const move = planBot(s, bot, botLevel(ctx));
    const delay = s.step === 'draw' ? randDelay(900, 1600) : move.type === 'out' ? randDelay(1300, 2100) : randDelay(1000, 1800);
    ctx.bot(bot, `r:${s.round}:${s.actions}`, delay, move);
  },

  view(_ctx, s, me): RealmsView {
    return {
      game: 'realms',
      phase: s.phase,
      participants: s.seats,
      active: s.active,
      turn: s.turn,
      step: s.step,
      round: s.round,
      rounds: s.deals.length,
      dealt: wildOf(s),
      wild: wildOf(s),
      myHand: s.hands[me] ?? [],
      plan: planFor(s, me),
      taken: s.turn === me ? s.taken : null,
      counts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      discardTop: s.discard[s.discard.length - 1] ?? null,
      discardBy: s.throwers[s.throwers.length - 1] ?? null,
      stockLeft: s.stock.length,
      outBy: s.outBy,
      outGroups: s.outGroups,
      lastTurn: s.lastTurn,
      outEvent: s.outEvent,
      scores: s.scores,
      history: s.history,
      feed: s.feed.list(),
      summary: s.summary,
      winner: s.winner,
      nextAt: s.nextAt,
      deadline: s.deadline,
      timer: s.settings.timer,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.active.includes(id) || s.phase === 'final') return;
    s.active = s.active.filter((p) => p !== id);
    s.hands[id] = [];
    s.lastTurn = s.lastTurn.filter((p) => p !== id);
    s.feed.push(`${ctx.playerName(id)} غادر اللعبة`);
    if (s.active.length <= 1) {
      finishGame(ctx, s);
      return;
    }
    if (s.phase === 'play' && s.turn === id) {
      s.actions += 1;
      s.taken = null;
      s.step = 'draw';
      if (s.outBy) {
        if (!s.lastTurn.length) {
          endRound(ctx, s);
          return;
        }
        s.turn = s.lastTurn[0];
      } else s.turn = nextActive(s, id);
      armTimer(ctx, s);
    } else if (s.phase === 'play' && s.outBy && !s.lastTurn.length) {
      endRound(ctx, s);
    }
  },

  patchSettings(settings, patch) {
    if (patch.rounds === 'full' || patch.rounds === 'short') settings.rounds = patch.rounds;
    if (patch.timer === 0 || patch.timer === 60 || patch.timer === 90 || patch.timer === 120) settings.timer = patch.timer;
  },

  /** Lowest total first; equal totals share a place. Leavers are left out. */
  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const vals = [...new Set(s.active.map((id) => s.scores[id] ?? 0))].sort((a, b) => a - b);
    return { places: vals.map((v) => s.active.filter((id) => (s.scores[id] ?? 0) === v)) };
  },
};

/** (for tests) is this card a wild this round? */
export const wildCard = (s: State, c: RealmCard) => isWild(c, wildOf(s));
