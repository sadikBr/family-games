/**
 * التريس — 4 players in two teams (partners sit opposite), 10 cards each, no trumps.
 * You must follow the suit that was led. Strength: 3 > 2 > 1 > 12 > 11 > 10 > 7 > 6 > 5 > 4.
 * Points: each 1 (as) = 1 point; 3, 2, 12, 11, 10 = ⅓ point each; last trick = 1 point.
 * A hand is worth 11 points (thirds are rounded down). First team to the target wins.
 */
import { cardName, sortHand, type Card } from '../../src/shared/cards';
import type { TrisClaimView } from '../../src/shared/games/tris-claim';
import type { CardSide, TrisSettings, TrisView } from '../../src/shared/protocol';
import { trisClaim, trisMindPlay, trisSimOf } from '../ai/tris-mind';
import { freshDeck, makeSides, randDelay, removeCard, sideOf } from '../cardkit';
import { botLevel, GameError, type GameCtx, type GameModule } from '../types';
import { isStr } from '../util';

const STRENGTH = [3, 2, 1, 12, 11, 10, 7, 6, 5, 4];
/** a full trick stays on the table this long before it is collected (everyone sees who took it) */
export const TRICK_PAUSE_MS = 2500;
/** «الباقي لنا»: the claimer's cards stay face up this long before the end of the hand */
export const CLAIM_REVEAL_MS = 3800;

export const strength = (rank: number) => STRENGTH.length - STRENGTH.indexOf(rank);
/** «⅓ نقطة» / «نقطة و⅔» */
function thirdsWord(t: number) {
  const whole = Math.floor(t / 3);
  const frac = ['', '⅓', '⅔'][t % 3];
  if (!whole) return `${frac} نقطة`;
  return `${whole === 1 ? 'نقطة' : whole === 2 ? 'نقطتان' : `${whole} نقاط`}${frac ? ` و${frac}` : ''}`;
}

export const thirds = (c: Card) => (c.rank === 1 ? 3 : [2, 3, 10, 11, 12].includes(c.rank) ? 1 : 0);

export interface State {
  settings: TrisSettings;
  seats: string[];
  sides: CardSide[];
  scores: Record<string, number>;
  phase: TrisView['phase'];
  hand: number;
  dealerIdx: number;
  turnIdx: number;
  hands: Record<string, Card[]>;
  trick: { by: string; card: Card }[];
  trickNo: number;
  trickWinner: string | null;
  lastTrick: TrisView['lastTrick'];
  pauseUntil: number | null;
  tricksWon: Record<string, number>;
  handThirds: Record<string, number>;
  handSummary: TrisView['handSummary'];
  winner: string | null;
  /** the tricks collected this hand, who played what (what every phone has seen: the bots' memory) */
  log: { by: string; card: Card }[][];
  /** «الباقي لنا»: a team certain to take every remaining trick, and who may claim it */
  claim: { by: string; side: string; reveal: string[] } | null;
  claimed: { by: string; side: string; reveal: { by: string; cards: Card[] }[] } | null;
}

function startHand(ctx: GameCtx, s: State) {
  s.hand += 1;
  s.phase = 'play';
  const deck = freshDeck();
  s.hands = Object.fromEntries(s.seats.map((id, i) => [id, deck.slice(i * 10, i * 10 + 10)]));
  s.dealerIdx = (s.dealerIdx + 1) % 4;
  s.turnIdx = (s.dealerIdx + 1) % 4;
  s.trick = [];
  s.trickNo = 1;
  s.trickWinner = null;
  s.lastTrick = null;
  s.pauseUntil = null;
  s.tricksWon = { A: 0, B: 0 };
  s.handThirds = { A: 0, B: 0 };
  s.handSummary = null;
  s.log = [];
  s.claim = null;
  s.claimed = null;
  ctx.fx('card');
  ctx.say?.(`اليد ${s.hand} — البداية لـ${ctx.playerName(s.seats[s.turnIdx])}`);
}

export function trisPlayable(hand: Card[], trick: { card: Card }[]): Card[] {
  if (!trick.length) return hand;
  const lead = trick[0].card.suit;
  const follow = hand.filter((c) => c.suit === lead);
  return follow.length ? follow : hand;
}

function trickWinnerOf(trick: { by: string; card: Card }[]): string {
  const lead = trick[0].card.suit;
  return trick
    .filter((t) => t.card.suit === lead)
    .reduce((best, t) => (strength(t.card.rank) > strength(best.card.rank) ? t : best)).by;
}

/** After every change: is some team certain to take every remaining trick? (exact: the server sees every hand) */
function refreshClaim(s: State) {
  s.claim = null;
  if (s.claimed || (s.phase !== 'play' && s.phase !== 'trickEnd')) return;
  if (s.phase === 'trickEnd') {
    if (s.trickNo >= 10 || !s.trickWinner) return;
    s.claim = trisClaim(trisSimOf(s.seats, s.hands, [], s.trickWinner), s.seats);
  } else s.claim = trisClaim(trisSimOf(s.seats, s.hands, s.trick, s.seats[s.turnIdx]), s.seats);
}

/**
 * «الباقي لنا»: the team takes every remaining trick (certain whatever anyone plays — checked again
 * here); the hand ends as if played out: the cards left and the last trick's point go to that team.
 */
function claimHand(ctx: GameCtx, s: State, by: string) {
  // s.claim is worked out again after every change, so it is the current position's
  const claim = s.claim;
  if (!claim || claim.by !== by) throw new GameError('لا يمكن إنهاء اليد الآن');
  if (s.phase === 'trickEnd') {
    // the complete trick goes to its taker first
    s.log.push(s.trick);
    s.lastTrick = { cards: s.trick, winner: s.trickWinner! };
    s.trick = [];
    s.trickNo += 1;
  }
  const left = [...s.seats.flatMap((id) => s.hands[id]), ...s.trick.map((t) => t.card)];
  s.handThirds[claim.side] += left.reduce((t, c) => t + thirds(c), 0) + 3;
  s.tricksWon[claim.side] += left.length / 4;
  s.claimed = { by, side: claim.side, reveal: claim.reveal.map((id) => ({ by: id, cards: sortHand(s.hands[id]) })) };
  s.claim = null;
  s.trickWinner = null;
  s.phase = 'trickEnd';
  s.pauseUntil = ctx.now + CLAIM_REVEAL_MS;
  const team = s.sides.find((x) => x.key === claim.side)!.members.map((m) => ctx.playerName(m)).join(' و');
  ctx.say?.(`الباقي لفريق ${team} — أُنهيت اليد`, by);
  ctx.fx('reveal');
}

/** The old bot (kept as «سهل»): lead a 3 or low from the longest suit, win when it can, feed the partner when last. */
function easyPlay(s: State, bot: string): Card {
  const hand = s.hands[bot];
  const options = trisPlayable(hand, s.trick);
  const weakest = (cs: Card[]) => cs.slice().sort((x, y) => thirds(x) - thirds(y) || strength(x.rank) - strength(y.rank))[0];
  if (!s.trick.length) {
    const boss = hand.find((c) => c.rank === 3);
    if (boss) return boss;
    const bySuit = new Map<string, Card[]>();
    for (const c of hand) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c]);
    const longest = [...bySuit.values()].sort((x, y) => y.length - x.length)[0];
    return weakest(longest);
  }
  const lead = s.trick[0].card.suit;
  const currentWinner = trickWinnerOf(s.trick);
  const partnerWinning = sideOf(s.sides, currentWinner) === sideOf(s.sides, bot);
  const last = s.trick.length === 3;
  const following = options[0].suit === lead;
  const top = Math.max(...s.trick.filter((t) => t.card.suit === lead).map((t) => strength(t.card.rank)));
  if (partnerWinning && last) return options.slice().sort((x, y) => thirds(y) - thirds(x) || strength(x.rank) - strength(y.rank))[0];
  if (following && !partnerWinning) {
    const winners = options.filter((c) => strength(c.rank) > top).sort((x, y) => strength(x.rank) - strength(y.rank));
    return winners[0] ?? weakest(options);
  }
  return weakest(options);
}

/** The bot's card at the room's strength: «سهل» the old bot, «ذكي» / «خبير» simulate (../ai/tris-mind.ts). */
export function trisBotCard(s: State, bot: string, level: 'easy' | 'smart' | 'expert'): Card {
  const legal = trisPlayable(s.hands[bot], s.trick);
  if (level === 'easy' || legal.length === 1) return level === 'easy' ? easyPlay(s, bot) : legal[0];
  return trisMindPlay({ seats: s.seats, hands: { [bot]: s.hands[bot], ...Object.fromEntries(s.seats.filter((id) => id !== bot).map((id) => [id, new Array(s.hands[id].length)])) }, log: s.log ?? [], trick: s.trick, turn: bot, thirds: s.handThirds, tricks: s.tricksWon }, bot, legal, level);
}

function endHand(ctx: GameCtx, s: State) {
  s.handSummary = s.sides.map((x) => ({ side: x.key, points: Math.floor(s.handThirds[x.key] / 3) }));
  for (const row of s.handSummary) s.scores[row.side] += row.points;
  ctx.say?.(
    `انتهت اليد: ${s.sides.map((x) => `${x.members.map((m) => ctx.playerName(m)).join(' و')} +${s.handSummary!.find((r) => r.side === x.key)?.points ?? 0}`).join(' · ')}`,
  );
  const [a, b] = [s.scores.A, s.scores.B];
  const t = s.settings.target;
  if ((a >= t || b >= t) && a !== b) {
    s.winner = a > b ? 'A' : 'B';
    s.phase = 'final';
    ctx.fx('win');
  } else {
    s.phase = 'handEnd';
    ctx.fx('reveal');
  }
}

/** the card a bot planned for a moment of a game */
const planned = new WeakMap<State, { key: string; card: Card }>();

export const tris: GameModule<State, TrisSettings> = {
  turnOf: (s) => s.phase === 'play' ? [s.seats[s.turnIdx]] : [],
  id: 'tris',
  hostOnly: ['next'],

  start(ctx, participants, settings) {
    if (participants.length !== 4) throw new GameError('التريس يحتاج 4 لاعبين بالضبط — أضيفوا بوتات');
    const s: State = {
      settings,
      seats: participants,
      sides: makeSides(participants, true),
      scores: { A: 0, B: 0 },
      phase: 'play',
      hand: 0,
      dealerIdx: Math.floor(Math.random() * 4),
      turnIdx: 0,
      hands: {},
      trick: [],
      trickNo: 1,
      trickWinner: null,
      lastTrick: null,
      pauseUntil: null,
      tricksWon: { A: 0, B: 0 },
      handThirds: { A: 0, B: 0 },
      handSummary: null,
      winner: null,
      log: [],
      claim: null,
      claimed: null,
    };
    startHand(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'handEnd') startHand(ctx, s);
      return;
    }
    if (a.type === 'claim') {
      if ((s.phase === 'play' || s.phase === 'trickEnd') && !s.claimed && s.seats.includes(by)) claimHand(ctx, s, by);
      return;
    }
    if (a.type !== 'play' || s.phase !== 'play') return;
    if (s.seats[s.turnIdx] !== by) throw new GameError('ليس دورك');
    if (!isStr(a.card)) return;
    const hand = s.hands[by];
    const allowed = trisPlayable(hand, s.trick);
    if (!allowed.some((c) => c.id === a.card)) {
      throw new GameError(s.trick.length ? 'يجب أن تلعب من النوع نفسه' : 'لا يمكنك لعب هذه الورقة');
    }
    const card = removeCard(hand, a.card)!;
    s.trick.push({ by, card });
    ctx.fx('card');
    if (s.trick.length < 4) {
      ctx.say?.(`ورقة من ${ctx.playerName(by)}: ${cardName(card)}`, by);
      s.turnIdx = (s.turnIdx + 1) % 4;
      refreshClaim(s);
      return;
    }
    const winner = trickWinnerOf(s.trick);
    const side = sideOf(s.sides, winner);
    s.tricksWon[side] += 1;
    s.handThirds[side] += s.trick.reduce((t, x) => t + thirds(x.card), 0) + (s.trickNo === 10 ? 3 : 0);
    s.trickWinner = winner;
    const won = s.trick.reduce((t, x) => t + thirds(x.card), 0) + (s.trickNo === 10 ? 3 : 0);
    ctx.say?.(`ورقة من ${ctx.playerName(by)}: ${cardName(card)} — اللمّة لـ${ctx.playerName(winner)}${won ? ` (${thirdsWord(won)})` : ''}`, winner);
    s.phase = 'trickEnd';
    s.pauseUntil = ctx.now + TRICK_PAUSE_MS;
    ctx.fx('correct', winner);
    refreshClaim(s);
  },

  tick(ctx, s) {
    if (s.phase !== 'trickEnd' || s.pauseUntil === null || ctx.now < s.pauseUntil) return false;
    s.pauseUntil = null;
    if (s.claimed) {
      // the claimed hand: every card is out
      for (const id of s.seats) s.hands[id] = [];
      s.trick = [];
      endHand(ctx, s);
      return true;
    }
    if (s.trickNo >= 10) {
      endHand(ctx, s);
      return true;
    }
    (s.log ??= []).push(s.trick);
    s.turnIdx = s.seats.indexOf(s.trickWinner!);
    s.lastTrick = { cards: s.trick, winner: s.trickWinner! };
    s.trick = [];
    s.trickWinner = null;
    s.trickNo += 1;
    s.phase = 'play';
    refreshClaim(s);
    return true;
  },

  botPlan(ctx, s) {
    // «الباقي لنا»: a bot claims at once (after a short, human-like pause)
    if (s.claim && !s.claimed && ctx.isBot(s.claim.by)) {
      ctx.bot(s.claim.by, `claim:${s.hand}:${s.trickNo}:${s.trick.length}:${s.phase}`, randDelay(900, 1600), { type: 'claim' });
      return;
    }
    if (s.phase !== 'play') return;
    const bot = s.seats[s.turnIdx];
    if (!ctx.isBot(bot)) return;
    if (!s.hands[bot].length) return;
    const key = `play:${s.hand}:${s.trickNo}:${s.trick.length}`;
    // botPlan runs after every change: think once per moment
    const memo = planned.get(s);
    let choice: Card;
    if (memo?.key === key) choice = memo.card;
    else {
      choice = trisBotCard(s, bot, botLevel(ctx));
      planned.set(s, { key, card: choice });
    }
    ctx.bot(bot, key, randDelay(900, 2000), { type: 'play', card: choice.id });
  },

  view(ctx, s, me): TrisView & TrisClaimView {
    const myTurn = s.phase === 'play' && s.seats[s.turnIdx] === me;
    return {
      game: 'tris',
      phase: s.phase,
      participants: s.seats,
      sides: s.sides,
      turn: s.seats[s.turnIdx],
      dealer: s.seats[s.dealerIdx],
      hand: s.hand,
      myHand: sortHand(s.hands[me] ?? []),
      playable: myTurn ? trisPlayable(s.hands[me] ?? [], s.trick).map((c) => c.id) : [],
      handCounts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      trick: s.trick,
      trickWinner: s.trickWinner,
      lastTrick: s.lastTrick,
      trickNo: s.trickNo,
      tricksWon: s.tricksWon,
      handThirds: s.handThirds,
      scores: s.scores,
      target: s.settings.target,
      handSummary: s.handSummary,
      winner: s.winner,
      canClaim: !!s.claim && s.claim.by === me && !s.claimed,
      claimed: s.claimed,
    };
  },

  onLeave(ctx, s, id) {
    if (s.seats.includes(id) && s.phase !== 'final') {
      s.phase = 'final';
      s.winner = null;
    }
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const win = s.sides.find((x) => x.key === s.winner);
    const lose = s.sides.filter((x) => x.key !== s.winner).flatMap((x) => x.members);
    return win ? { places: [[...win.members], lose] } : null;
  },
};
