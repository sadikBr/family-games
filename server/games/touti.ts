/**
 * «التوتي» — the Fez bidding game for 4 players in two fixed partnerships (seats 0 & 2 vs 1 & 3), with
 * the 40-card Moroccan deck, 10 cards each. The auction starts on the dealer's right, from 70 to 230 in
 * steps of 10; a «باص» leaves the auction; the last bidder («الشاري») names the trump. Tricks: follow
 * suit, otherwise trump, over a trump already on the table if you can. Card points 1 = 11, 3 = 10,
 * 12 = 4, 11 = 3, 10 = 2, the last trick («الدير») 10: 130. «الغناء»: 12 + 11 of one suit, sung by the
 * bidding team after a trick it takes (20; 40 in trumps; bid 80+ / 90+). The bidders reach their bid →
 * they score the bid, otherwise the defenders score it. First team to 600 wins. Play goes
 * anticlockwise: seat i+1 sits on seat i's right.
 */
import { SUITS, makeDeck, type Card, type Suit } from '../../src/shared/cards';
import type { ToutiCall, ToutiHandResult, ToutiHistoryRow, ToutiSettings, ToutiSung, ToutiView, TSide } from '../../src/shared/games/touti';
import { TOUTI_TARGETS } from '../../src/shared/games/touti';
import type { CardSide, GameAction } from '../../src/shared/protocol';
import {
  BID_MAX,
  BID_MIN,
  BID_STEP,
  T_LAST,
  TRICKS,
  cardLabel,
  cardPoints,
  illegalReason,
  legalCards,
  scoreHand,
  singable,
  sortTouti,
  suitName,
  trickLeader,
} from '../../src/shared/touti-rules';
import type { BotLevel } from '../../src/shared/protocol';
import { makeSides, randDelay } from '../cardkit';
import { expertBid, expertCard, expertTrump, findClaim, outlook, type BidOutlook, type Knowledge, type Sim } from '../touti-ai';
import { bestTrump, botBid, botPlay, reachChance } from '../touti-bot';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isStr, shuffle } from '../util';
import { SUIT_VOICE, VOICE, voiceBid, voiceTeam, voiceTrump, voiceWin } from '../voice-calls';

/** a full trick stays on the table this long (everyone sees who took it) */
export const TRICK_PAUSE_MS = 2800;
/** everyone passed: the empty auction stays on screen this long before the new deal */
export const REDEAL_MS = 3200;
/** the end-of-hand sheet stays this long (the host can deal sooner) */
export const HAND_END_MS = 15_000;
/** «الباقي لنا»: the claimer's cards stay face up this long before the end of the hand */
export const CLAIM_REVEAL_MS = 4500;

interface BidState {
  /** dealer's right first, dealer last */
  order: string[];
  /** still in the auction (not passed) */
  active: string[];
  turn: string;
  calls: Record<string, ToutiCall>;
  high: number | null;
  highBy: string | null;
}

export interface State {
  settings: ToutiSettings;
  seats: string[];
  sides: CardSide[];
  scores: Record<TSide, number>;
  history: ToutiHistoryRow[];
  phase: ToutiView['phase'];
  hand: number;
  dealer: number;
  hands: Record<string, Card[]>;
  bid: BidState | null;
  redealAt: number | null;
  bidder: string | null;
  contract: number | null;
  trump: Suit | null;
  turn: string | null;
  trick: { by: string; card: Card }[];
  trickNo: number;
  trickWinner: string | null;
  pauseUntil: number | null;
  lastTrick: ToutiView['lastTrick'];
  played: Card[];
  cards: Record<TSide, number>;
  tricks: Record<TSide, number>;
  sung: ToutiSung[];
  /** «الغناء» window after a trick won by the bidding team: who may still sing, in order */
  singQueue: string[];
  /** finished tricks this hand (what the bots remember) and every call of the auction */
  done: { by: string; card: Card }[][];
  auction: { by: string; call: ToutiCall }[];
  /** «الباقي لنا»: a team certain to take every remaining trick, and who may claim it (worked out after every change) */
  claim: { by: string; side: TSide; reveal: string[] } | null;
  /** «الباقي لنا» was claimed: those hands are shown until `until`, then the hand ends */
  claimed: { by: string; side: TSide; reveal: { by: string; cards: Card[] }[]; until: number } | null;
  /** the expert bots' auction outlook, per player, for this hand */
  outlooks: Record<string, BidOutlook>;
  result: ToutiHandResult | null;
  nextAt: number | null;
  winner: TSide | null;
  deadline: number | null;
  /** bumps on every change (bot keys, timer) */
  seq: number;
}

const other = (s: TSide): TSide => (s === 'A' ? 'B' : 'A');
export const sideOf = (s: State, id: string): TSide => (s.sides[0].members.includes(id) ? 'A' : 'B');
const partnerOf = (s: State, id: string) => s.seats[(s.seats.indexOf(id) + 2) % 4];
const nextOf = (s: State, id: string) => s.seats[(s.seats.indexOf(id) + 1) % 4];
const teamName = (ctx: GameCtx, s: State, side: TSide) =>
  `فريق ${s.sides.find((x) => x.key === side)!.members.map((m) => ctx.playerName(m)).join(' و')}`;
const sungSuits = (s: State) => s.sung.map((x) => x.suit);

/* ------------------------------------------------------------------ */
/* Dealing and the auction                                             */
/* ------------------------------------------------------------------ */

function startHand(ctx: GameCtx, s: State) {
  s.hand += 1;
  s.dealer = (s.dealer + 1) % 4;
  const deck = shuffle(makeDeck());
  const order = [1, 2, 3, 0].map((k) => s.seats[(s.dealer + k) % 4]);
  s.hands = Object.fromEntries(s.seats.map((id) => [id, [] as Card[]]));
  // 5 then 5 to each, starting on the dealer's right
  for (let round = 0; round < 2; round++) for (const id of order) s.hands[id].push(...deck.splice(0, 5));
  s.phase = 'bid';
  s.bid = { order, active: order.slice(), turn: order[0], calls: {}, high: null, highBy: null };
  s.redealAt = null;
  s.bidder = null;
  s.contract = null;
  s.trump = null;
  s.turn = null;
  s.trick = [];
  s.trickNo = 0;
  s.trickWinner = null;
  s.pauseUntil = null;
  s.lastTrick = null;
  s.played = [];
  s.cards = { A: 0, B: 0 };
  s.tricks = { A: 0, B: 0 };
  s.sung = [];
  s.singQueue = [];
  s.done = [];
  s.auction = [];
  s.claim = null;
  s.claimed = null;
  s.outlooks = {};
  s.result = null;
  s.nextAt = null;
  ctx.fx('card');
  ctx.say?.(`اليد ${s.hand}: التوزيع من ${ctx.playerName(s.seats[s.dealer])}`);
}

/** The bids the player whose turn it is may make now (from the next step up to 230). */
export function bidOptions(s: State, id: string): number[] {
  const b = s.bid;
  if (s.phase !== 'bid' || !b || s.redealAt !== null || b.turn !== id) return [];
  const out: number[] = [];
  for (let n = b.high === null ? BID_MIN : b.high + BID_STEP; n <= BID_MAX; n += BID_STEP) out.push(n);
  return out;
}

function bidCall(ctx: GameCtx, s: State, by: string, call: unknown) {
  const b = s.bid!;
  if (b.turn !== by) throw new GameError('ليس دورك');
  const name = ctx.playerName(by);
  // read aloud: «بَاصْ» or the number bid («مْيَة وْعِشْرِينْ»), on every say of this move
  const voice = call === 'pass' ? VOICE.pass : typeof call === 'number' ? voiceBid(call) : undefined;
  if (call === 'pass') {
    s.auction.push({ by, call: 'pass' });
    b.calls[by] = 'pass';
    b.active = b.active.filter((p) => p !== by);
    ctx.say?.(`باص: ${name}`, by, voice);
  } else {
    if (typeof call !== 'number' || !bidOptions(s, by).includes(call)) throw new GameError('مزايدة غير صالحة');
    s.auction.push({ by, call });
    b.calls[by] = call;
    b.high = call;
    b.highBy = by;
    ctx.say?.(`مزايدة من ${name}: ${call}`, by, voice);
    ctx.fx('throw');
  }
  // the auction is over: everyone passed (a new deal), the last bidder stands alone, or 230
  if (!b.highBy && !b.active.length) {
    s.redealAt = ctx.now + paced(ctx, REDEAL_MS);
    ctx.say?.('لا مزايدة — توزيع جديد', undefined, voice);
    ctx.fx('buzz');
    return;
  }
  if (b.highBy && (b.high === BID_MAX || (b.active.length === 1 && b.active[0] === b.highBy))) {
    s.phase = 'trump';
    s.bidder = b.highBy;
    s.contract = b.high;
    ctx.say?.(`الشاري: ${ctx.playerName(b.highBy)} بـ ${b.high} — اختيار الطرونفو`, b.highBy, voice);
    ctx.fx('correct', b.highBy);
    return;
  }
  let next = nextOf(s, by);
  while (!b.active.includes(next)) next = nextOf(s, next);
  b.turn = next;
}

function chooseTrump(ctx: GameCtx, s: State, by: string, suit: unknown) {
  if (by !== s.bidder) throw new GameError('ليس دورك');
  if (!isStr(suit) || !SUITS.includes(suit as Suit)) throw new GameError('اختر شكل الطرونفو');
  s.trump = suit as Suit;
  s.phase = 'play';
  s.trickNo = 1;
  s.turn = s.seats[(s.dealer + 1) % 4];
  ctx.say?.(`الطرونفو: ${suitName(s.trump)} — الشاري: ${ctx.playerName(by)} (${s.contract})`, by, voiceTrump(SUIT_VOICE[s.trump]));
  ctx.fx('reveal');
}

/* ------------------------------------------------------------------ */
/* Tricks and «الغناء»                                                 */
/* ------------------------------------------------------------------ */

const rules = (s: State) => ({ partnerFree: s.settings.partnerFree });

export function playable(s: State, id: string): Card[] {
  if (s.phase !== 'play' || s.pauseUntil !== null || s.claimed || s.singQueue.length || s.turn !== id) return [];
  return legalCards(s.hands[id], s.trick, s.trump!, rules(s));
}

function playCard(ctx: GameCtx, s: State, by: string, cardId: unknown): boolean {
  if (s.phase !== 'play' || s.pauseUntil !== null) return false;
  if (s.singQueue.length || s.turn !== by) throw new GameError('ليس دورك');
  if (!isStr(cardId)) return false;
  const hand = s.hands[by];
  if (!hand.some((x) => x.id === cardId)) return false;
  if (!playable(s, by).some((x) => x.id === cardId)) throw new GameError(illegalReason(hand, s.trick, s.trump!));
  const card = hand.splice(hand.findIndex((x) => x.id === cardId), 1)[0];
  s.trick.push({ by, card });
  ctx.fx('card');
  const head = `ورقة من ${ctx.playerName(by)}: ${cardLabel(card)}`;
  if (s.trick.length < 4) {
    s.turn = nextOf(s, by);
    ctx.say?.(head, by);
    return true;
  }
  const winner = s.trick[trickLeader(s.trick, s.trump)].by;
  const side = sideOf(s, winner);
  const gain = s.trick.reduce((t, p) => t + cardPoints(p.card), 0) + (s.trickNo === TRICKS ? T_LAST : 0);
  s.cards[side] += gain;
  s.tricks[side] += 1;
  s.trickWinner = winner;
  s.turn = null;
  s.pauseUntil = ctx.now + paced(ctx, TRICK_PAUSE_MS);
  ctx.say?.(`${head} — الأكلة لـ${ctx.playerName(winner)}${gain ? ` (+${gain})` : ''}${s.trickNo === TRICKS ? ' مع الدير' : ''}`, winner);
  ctx.fx('correct', winner);
  return true;
}

/** The pairs `id` may sing now (in the «الغناء» window, on their turn in it). */
export function singOptions(s: State, id: string) {
  if (s.phase !== 'play' || s.singQueue[0] !== id) return [];
  return singable(s.hands[id], s.trump!, s.contract!, sungSuits(s));
}

/** After a trick: who of the bidding team may sing (the taker; with «team», then the partner). */
function openSinging(s: State, winner: string) {
  if (sideOf(s, s.bidder!) !== sideOf(s, winner)) return;
  const who = s.settings.singBy === 'team' ? [winner, partnerOf(s, winner)] : [winner];
  s.singQueue = who.filter((id) => singable(s.hands[id], s.trump!, s.contract!, sungSuits(s)).length > 0);
}

function sing(ctx: GameCtx, s: State, by: string, suit: unknown) {
  if (s.singQueue[0] !== by) throw new GameError('ليس دورك');
  if (suit === null || suit === 'skip') {
    s.singQueue.shift();
    return;
  }
  const pair = singOptions(s, by).find((p) => p.suit === suit);
  if (!pair) throw new GameError('لا يمكنك غناء هذا الزوج');
  s.sung.push({ by, suit: pair.suit, points: pair.points, trick: s.trickNo - 1 });
  // one pair after each trick taken
  s.singQueue = [];
  ctx.say?.(`غناء من ${ctx.playerName(by)}: 12 و11 ${suitName(pair.suit)}${pair.suit === s.trump ? ' (الطرونفو)' : ''} +${pair.points}`, by, VOICE.sing);
  ctx.fx('reveal');
}

function endHand(ctx: GameCtx, s: State) {
  const bidSide = sideOf(s, s.bidder!);
  const sungPts = s.sung.reduce((t, x) => t + x.points, 0);
  const out = scoreHand({ bidSide, bid: s.contract!, cards: s.cards, sung: sungPts });
  s.result = {
    hand: s.hand,
    bidder: s.bidder!,
    bid: s.contract!,
    trump: s.trump!,
    bidSide,
    cards: { ...s.cards },
    last: sideOf(s, s.lastTrick?.winner ?? s.trickWinner!),
    tricks: { ...s.tricks },
    sung: s.sung.slice(),
    made: out.made,
    success: out.success,
    points: out.points,
  };
  s.scores.A += out.points.A;
  s.scores.B += out.points.B;
  s.history.push({ A: out.points.A, B: out.points.B, bid: s.contract!, bidSide, success: out.success });
  s.phase = 'handEnd';
  s.turn = null;
  const gainer = out.success ? bidSide : other(bidSide);
  ctx.say?.(`نهاية اليد ${s.hand}: ${out.made} من ${s.contract}${out.success ? '' : ' (تغطيس)'} — ${s.contract} لـ${teamName(ctx, s, gainer)}`, undefined, out.success ? undefined : VOICE.taghtis);
  const t = s.settings.target;
  if (s.scores.A >= t || s.scores.B >= t) finish(ctx, s, s.scores.A >= t ? 'A' : 'B');
  else {
    s.nextAt = ctx.now + paced(ctx, HAND_END_MS);
    ctx.fx(out.success ? 'reveal' : 'buzz');
  }
}

function finish(ctx: GameCtx, s: State, side: TSide | null) {
  s.phase = 'final';
  s.winner = side;
  s.nextAt = null;
  s.turn = null;
  s.deadline = null;
  s.singQueue = [];
  if (side) {
    ctx.say?.(`الفوز لـ${teamName(ctx, s, side)}`, undefined, voiceWin(voiceTeam(s.sides.find((x) => x.key === side)!.members.map((m) => ctx.playerName(m)))));
    ctx.fx('win');
  }
}

/* ------------------------------------------------------------------ */
/* Turns, timer, bots                                                  */
/* ------------------------------------------------------------------ */

export function turnOf(s: State): string[] {
  if (s.phase === 'bid') return s.bid && s.redealAt === null ? [s.bid.turn] : [];
  if (s.phase === 'trump') return s.bidder ? [s.bidder] : [];
  if (s.phase === 'play') {
    if (s.pauseUntil !== null || s.claimed) return [];
    if (s.singQueue.length) return [s.singQueue[0]];
    return s.turn ? [s.turn] : [];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* «الباقي لنا»                                                        */
/* ------------------------------------------------------------------ */

/** The real table, every hand known (for the claim check); a complete trick → the next one. Null: nothing left to play. */
function simOf(s: State): Sim | null {
  if (s.phase !== 'play' || s.claimed || !s.trump) return null;
  const paused = s.pauseUntil !== null;
  if (paused && (s.trickNo >= TRICKS || !s.trickWinner)) return null;
  const turn = paused ? s.trickWinner : s.turn;
  if (!turn) return null;
  return {
    hands: s.seats.map((id) => s.hands[id].slice()),
    trick: paused ? [] : s.trick.map((t) => ({ s: s.seats.indexOf(t.by), card: t.card })),
    turn: s.seats.indexOf(turn),
    trump: s.trump,
    partnerFree: s.settings.partnerFree,
    left: TRICKS - s.trickNo + (paused ? 0 : 1),
    pts: [s.cards.A, s.cards.B],
    bidTeam: s.seats.indexOf(s.bidder!) % 2,
    bid: s.contract!,
    sung: sungSuits(s),
    sungPts: s.sung.reduce((t, x) => t + x.points, 0),
    singBy: s.settings.singBy,
  };
}

/** the last position asked (the same one comes back after a pause, a view, a timer) */
const claimMemo = new WeakMap<State, { key: string; claim: State['claim'] }>();

/** After every change: is some team certain to take every remaining trick (2 or more)? Exact, capped in nodes. */
export function refreshClaim(s: State) {
  const x = simOf(s);
  if (!x) {
    s.claim = null;
    return;
  }
  const key = `${s.hand}|${x.hands.map((h) => h.map((c) => c.id).join('.')).join(',')}|${x.trick.map((t) => t.card.id).join('.')}|${x.turn}`;
  const memo = claimMemo.get(s);
  if (memo?.key === key) {
    s.claim = memo.claim;
    return;
  }
  const f = findClaim(x);
  s.claim = f ? { by: s.seats[f.seat], side: f.team === 0 ? 'A' : 'B', reveal: f.reveal.map((seat) => s.seats[seat]) } : null;
  claimMemo.set(s, { key, claim: s.claim });
}

/**
 * «الباقي لنا — أنهِ اليد»: the team takes every remaining trick (certain whatever anyone plays). The
 * hand ends as if it had been played out: every card left and الدير go to that team; if it bought,
 * the pairs its players can still sing count too (one per trick left before the last — singing is
 * what a bidding team always does), since those tricks would all be theirs.
 */
function claim(ctx: GameCtx, s: State, by: string) {
  if (!s.claim || s.claim.by !== by) throw new GameError('لا يمكن إنهاء اليد الآن');
  const { side, reveal } = s.claim;
  // a trick already complete goes to its taker first
  if (s.pauseUntil !== null && s.trick.length === 4) {
    s.pauseUntil = null;
    s.lastTrick = { cards: s.trick, winner: s.trickWinner! };
    s.played.push(...s.trick.map((t) => t.card));
    s.done.push(s.trick);
    s.trick = [];
    s.trickNo += 1;
  }
  const onTable = s.trick.map((t) => t.card);
  const left = TRICKS - s.trickNo + 1;
  const team = s.sides.find((x) => x.key === side)!.members;
  const gain = [...s.seats.flatMap((id) => s.hands[id]), ...onTable].reduce((t, c) => t + cardPoints(c), 0) + T_LAST;
  if (side === sideOf(s, s.bidder!)) {
    let windows = left - 1;
    for (const id of [by, ...team.filter((m) => m !== by)]) {
      for (const pair of singable(s.hands[id], s.trump!, s.contract!, sungSuits(s))) {
        if (windows <= 0) break;
        s.sung.push({ by: id, suit: pair.suit, points: pair.points, trick: s.trickNo - 1 });
        windows -= 1;
      }
    }
  }
  s.cards[side] += gain;
  s.tricks[side] += left;
  s.claimed = { by, side, reveal: reveal.map((id) => ({ by: id, cards: sortTouti(s.hands[id], s.trump) })), until: ctx.now + paced(ctx, CLAIM_REVEAL_MS) };
  for (const id of s.seats) {
    s.played.push(...s.hands[id]);
    s.hands[id] = [];
  }
  s.played.push(...onTable);
  s.trick = [];
  s.claim = null;
  s.singQueue = [];
  s.turn = null;
  s.trickWinner = by;
  s.trickNo = TRICKS;
  ctx.say?.(`الباقي ل${teamName(ctx, s, side)} — أُنهيت اليد`, by, VOICE.claim);
  ctx.fx('reveal');
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** What the bot in seat `id` knows (no peeking at the others' cards). */
export function knowledge(s: State, id: string): Knowledge {
  const seat = (p: string) => s.seats.indexOf(p);
  return {
    me: seat(id),
    hand: s.hands[id].slice(),
    trump: s.trump!,
    partnerFree: s.settings.partnerFree,
    done: s.done.map((t) => t.map((p) => ({ s: seat(p.by), card: p.card }))),
    trick: s.trick.map((p) => ({ s: seat(p.by), card: p.card })),
    counts: s.seats.map((p) => s.hands[p].length),
    sung: s.sung.map((x) => ({ s: seat(x.by), suit: x.suit })),
    bidTeam: seat(s.bidder!) % 2,
    bid: s.contract!,
    singBy: s.settings.singBy,
  };
}

/** The expert's play-outs of its hand for the auction (once per hand). */
function outlookOf(s: State, id: string): BidOutlook {
  s.outlooks[id] ??= outlook(s.hands[id], s.seats.indexOf(id), (s.dealer + 1) % 4, s.settings.singBy, s.settings.partnerFree);
  return s.outlooks[id];
}

/** The move a bot makes (also the move made for a player whose time ran out, with `timeout`). */
export function decide(s: State, id: string, level: BotLevel, timeout = false): GameAction | null {
  if (turnOf(s)[0] !== id) return null;
  if (s.phase === 'bid') {
    if (timeout) return { type: 'bid', bid: 'pass' };
    const bids = bidOptions(s, id);
    const partner = partnerOf(s, id);
    const partnerHigh = s.bid!.highBy === partner;
    if (level === 'expert') {
      const calls = s.auction.filter((x) => x.by === partner);
      const said = calls.some((x) => x.call !== 'pass') ? 'bid' : calls.length ? 'pass' : 'none';
      const high = s.bid!.highBy ? { by: partnerHigh ? ('partner' as const) : ('them' as const), bid: s.bid!.high! } : null;
      return { type: 'bid', bid: expertBid(outlookOf(s, id), bids, said, high, (b) => reachChance(s.hands[id], b)) };
    }
    return { type: 'bid', bid: botBid(s.hands[id], bids, level === 'easy' ? 1 : 2, Math.random() * 2 - 1, partnerHigh) };
  }
  if (s.phase === 'trump') return { type: 'trump', suit: level === 'expert' && !timeout ? expertTrump(outlookOf(s, id), s.contract!) : bestTrump(s.hands[id]).suit };
  if (s.singQueue.length) {
    // singing never hurts: the best pair (the trump one first)
    const best = singOptions(s, id)[0];
    return { type: 'sing', suit: best ? best.suit : null };
  }
  // bots always claim the rest when it is certain
  if (s.claim?.by === id && !s.claimed) return { type: 'claim' };
  const legal = playable(s, id);
  if (!legal.length) return null;
  if (level === 'expert' && !timeout) {
    const card = expertCard(knowledge(s, id), legal, [s.cards.A, s.cards.B], s.sung.reduce((t, x) => t + x.points, 0));
    return { type: 'play', card: card.id };
  }
  const card = botPlay({
    hand: s.hands[id],
    legal,
    trick: s.trick,
    trump: s.trump!,
    played: s.played,
    bidders: sideOf(s, id) === sideOf(s, s.bidder!),
    bid: s.contract!,
    sung: sungSuits(s),
    level: timeout || level !== 'easy' ? 2 : 1,
    roll: Math.random(),
  });
  return { type: 'play', card: card.id };
}

function armTimer(ctx: GameCtx, s: State) {
  s.seq += 1;
  refreshClaim(s);
  s.deadline = s.settings.timer > 0 && turnOf(s).length ? ctx.now + s.settings.timer * 1000 : null;
}

/** Apply one move; false when it changed nothing. */
function step(ctx: GameCtx, s: State, by: string, a: GameAction): boolean {
  // a bot's move planned for an earlier moment of the game
  if (typeof a.seq === 'number' && a.seq !== s.seq) throw new GameError('انتهى وقت هذه الحركة');
  if (a.type === 'next') {
    if (s.phase !== 'handEnd') return false;
    startHand(ctx, s);
    return true;
  }
  if (a.type === 'bid' && s.phase === 'bid' && s.redealAt === null) {
    bidCall(ctx, s, by, a.bid);
    return true;
  }
  if (a.type === 'trump' && s.phase === 'trump') {
    chooseTrump(ctx, s, by, a.suit);
    return true;
  }
  if (a.type === 'sing' && s.phase === 'play' && s.singQueue.length) {
    sing(ctx, s, by, a.suit);
    return true;
  }
  if (a.type === 'claim' && s.phase === 'play' && !s.claimed) {
    claim(ctx, s, by);
    return true;
  }
  if (a.type === 'play') return playCard(ctx, s, by, a.card);
  return false;
}

/** The trick on the table is collected: the next trick (after the «الغناء» window), or the end of the hand. */
function collectTrick(ctx: GameCtx, s: State) {
  s.pauseUntil = null;
  s.lastTrick = { cards: s.trick, winner: s.trickWinner! };
  s.played.push(...s.trick.map((t) => t.card));
  s.done.push(s.trick);
  if (s.trickNo >= TRICKS) {
    endHand(ctx, s);
    return;
  }
  s.turn = s.trickWinner;
  openSinging(s, s.trickWinner!);
  s.trick = [];
  s.trickWinner = null;
  s.trickNo += 1;
}

export const touti: GameModule<State, ToutiSettings> = {
  id: 'touti',
  hostOnly: ['next'],
  turnOf,

  start(ctx, participants, settings) {
    if (participants.length !== 4) throw new GameError('التوتي يحتاج 4 لاعبين بالضبط — أضيفوا بوتات');
    const s: State = {
      settings: { ...settings },
      seats: participants.slice(),
      sides: makeSides(participants, true),
      scores: { A: 0, B: 0 },
      history: [],
      phase: 'bid',
      hand: 0,
      dealer: Math.floor(Math.random() * 4),
      hands: {},
      bid: null,
      redealAt: null,
      bidder: null,
      contract: null,
      trump: null,
      turn: null,
      trick: [],
      trickNo: 0,
      trickWinner: null,
      pauseUntil: null,
      lastTrick: null,
      played: [],
      cards: { A: 0, B: 0 },
      tricks: { A: 0, B: 0 },
      sung: [],
      singQueue: [],
      done: [],
      auction: [],
      claim: null,
      claimed: null,
      outlooks: {},
      result: null,
      nextAt: null,
      winner: null,
      deadline: null,
      seq: 0,
    };
    if (!TOUTI_TARGETS.includes(s.settings.target)) s.settings.target = TOUTI_TARGETS[0];
    ctx.fx('start');
    startHand(ctx, s);
    armTimer(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    // «التالي» comes from the host (checked by the room), who may be watching without a seat
    if (s.phase === 'final' || (!s.seats.includes(by) && a.type !== 'next')) return;
    if (step(ctx, s, by, a)) armTimer(ctx, s);
  },

  tick(ctx, s) {
    if (s.phase === 'final') return false;
    if (s.phase === 'play' && s.claimed) {
      if (ctx.now < s.claimed.until) return false;
      // the claimed hand: every card is out, the last trick (and its 10) is the claimers'
      s.lastTrick = { cards: [], winner: s.claimed.by };
      endHand(ctx, s);
      if (s.result) s.result.claimed = s.claimed.side;
      s.claimed = null;
      armTimer(ctx, s);
      return true;
    }
    if (s.phase === 'play' && s.pauseUntil !== null) {
      if (ctx.now < s.pauseUntil) return false;
      collectTrick(ctx, s);
      armTimer(ctx, s);
      return true;
    }
    if (s.phase === 'bid' && s.redealAt !== null) {
      if (ctx.now < s.redealAt) return false;
      startHand(ctx, s);
      armTimer(ctx, s);
      return true;
    }
    if (s.phase === 'handEnd') {
      if (s.nextAt === null || ctx.now < s.nextAt) return false;
      startHand(ctx, s);
      armTimer(ctx, s);
      return true;
    }
    if (s.deadline !== null && ctx.now >= s.deadline) {
      const id = turnOf(s)[0];
      const move = id ? decide(s, id, 'smart', true) : null;
      if (!move) {
        s.deadline = null;
        return false;
      }
      step(ctx, s, id, move);
      armTimer(ctx, s);
      return true;
    }
    return false;
  },

  botPlan(ctx, s) {
    // «الباقي لنا»: a bot claims at once (after a short, human-like pause)
    if (s.claim && !s.claimed && ctx.isBot(s.claim.by)) {
      ctx.bot(s.claim.by, `claim${s.hand}:${s.seq}`, randDelay(900, 1600), { type: 'claim', seq: s.seq });
      return;
    }
    const id = turnOf(s)[0];
    if (!id || !ctx.isBot(id)) return;
    const move = decide(s, id, botLevel(ctx));
    if (!move) return;
    move.seq = s.seq;
    const delay = s.phase === 'play' ? randDelay(700, 1500) : randDelay(900, 1700);
    ctx.bot(id, `m${s.hand}:${s.seq}`, delay, move);
  },

  view(_ctx, s, me): ToutiView {
    const b = s.bid;
    return {
      game: 'touti',
      phase: s.phase,
      seats: s.seats,
      sides: s.sides,
      dealer: s.seats[s.dealer],
      hand: s.hand,
      turn: turnOf(s)[0] ?? null,
      deadline: s.deadline,
      timer: s.settings.timer,
      calls: s.phase === 'bid' || s.phase === 'trump' ? (b?.calls ?? {}) : {},
      high: b?.high ?? null,
      highBy: b?.highBy ?? null,
      redeal: s.redealAt !== null,
      myBids: bidOptions(s, me),
      bidder: s.bidder,
      bid: s.contract,
      trump: s.trump,
      myHand: sortTouti(s.hands[me] ?? [], s.trump),
      playable: playable(s, me).map((x) => x.id),
      counts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      trick: s.trick,
      trickWinner: s.trickWinner,
      trickNo: s.trickNo,
      lastTrick: s.lastTrick,
      cards: s.cards,
      tricks: s.tricks,
      sung: s.sung,
      singer: s.phase === 'play' && s.pauseUntil === null ? (s.singQueue[0] ?? null) : null,
      mySing: singOptions(s, me),
      scores: s.scores,
      target: s.settings.target,
      history: s.history,
      result: s.result,
      nextAt: s.nextAt,
      winner: s.winner,
      partnerFree: s.settings.partnerFree,
      singBy: s.settings.singBy,
      canClaim: !!s.claim && s.claim.by === me && !s.claimed,
      claimed: s.claimed ? { by: s.claimed.by, side: s.claimed.side, reveal: s.claimed.reveal } : null,
    };
  },

  onLeave(ctx, s, id) {
    // seats are kept by the room (a bot takes over); a seat that disappears anyway ends the game
    if (!s.seats.includes(id) || s.phase === 'final') return;
    const lead: TSide | null = s.scores.A === s.scores.B ? null : s.scores.A > s.scores.B ? 'A' : 'B';
    finish(ctx, s, lead);
    if (!lead) ctx.say?.('انتهت اللعبة: مقعد فارغ');
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const team = (side: TSide) => s.sides.find((x) => x.key === side)!.members.slice();
    return { places: [team(s.winner), team(other(s.winner))] };
  },

  patchSettings(settings, patch) {
    if (TOUTI_TARGETS.includes(patch.target as number)) settings.target = patch.target as number;
    if (patch.timer === 0 || patch.timer === 20 || patch.timer === 30 || patch.timer === 45) settings.timer = patch.timer;
    if (patch.singBy === 'winner' || patch.singBy === 'team') settings.singBy = patch.singBy;
    if (typeof patch.partnerFree === 'boolean') settings.partnerFree = patch.partnerFree;
  },
};
