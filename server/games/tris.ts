/**
 * التريس — 4 players in two teams (partners sit opposite), 10 cards each, no trumps.
 * You must follow the suit that was led. Strength: 3 > 2 > 1 > 12 > 11 > 10 > 7 > 6 > 5 > 4.
 * Points: each 1 (as) = 1 point; 3, 2, 12, 11, 10 = ⅓ point each; last trick = 1 point.
 * A hand is worth 11 points (thirds are rounded down). First team to the target wins.
 */
import { cardName, sortHand, type Card } from '../../src/shared/cards';
import type { CardSide, TrisSettings, TrisView } from '../../src/shared/protocol';
import { freshDeck, makeSides, randDelay, removeCard, sideOf } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr } from '../util';

const STRENGTH = [3, 2, 1, 12, 11, 10, 7, 6, 5, 4];
/** a full trick stays on the table this long before it is collected (everyone sees who took it) */
export const TRICK_PAUSE_MS = 2500;

export const strength = (rank: number) => STRENGTH.length - STRENGTH.indexOf(rank);
/** «⅓ نقطة» / «نقطة و⅔» */
function thirdsWord(t: number) {
  const whole = Math.floor(t / 3);
  const frac = ['', '⅓', '⅔'][t % 3];
  if (!whole) return `${frac} نقطة`;
  return `${whole === 1 ? 'نقطة' : whole === 2 ? 'نقطتان' : `${whole} نقاط`}${frac ? ` و${frac}` : ''}`;
}

export const thirds = (c: Card) => (c.rank === 1 ? 3 : [2, 3, 10, 11, 12].includes(c.rank) ? 1 : 0);

interface State {
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
  },

  tick(ctx, s) {
    if (s.phase !== 'trickEnd' || s.pauseUntil === null || ctx.now < s.pauseUntil) return false;
    s.pauseUntil = null;
    if (s.trickNo >= 10) {
      endHand(ctx, s);
      return true;
    }
    s.turnIdx = s.seats.indexOf(s.trickWinner!);
    s.lastTrick = { cards: s.trick, winner: s.trickWinner! };
    s.trick = [];
    s.trickWinner = null;
    s.trickNo += 1;
    s.phase = 'play';
    return true;
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play') return;
    const bot = s.seats[s.turnIdx];
    if (!ctx.isBot(bot)) return;
    const hand = s.hands[bot];
    const options = trisPlayable(hand, s.trick);
    if (!options.length) return;
    const weakest = (cs: Card[]) =>
      cs.slice().sort((x, y) => thirds(x) - thirds(y) || strength(x.rank) - strength(y.rank))[0];
    let choice: Card;
    if (!s.trick.length) {
      // lead a "boss" 3 if we have one, otherwise the weakest card of our longest suit
      const boss = hand.find((c) => c.rank === 3);
      if (boss) choice = boss;
      else {
        const bySuit = new Map<string, Card[]>();
        for (const c of hand) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c]);
        const longest = [...bySuit.values()].sort((x, y) => y.length - x.length)[0];
        choice = weakest(longest);
      }
    } else {
      const lead = s.trick[0].card.suit;
      const currentWinner = trickWinnerOf(s.trick);
      const partnerWinning = sideOf(s.sides, currentWinner) === sideOf(s.sides, bot);
      const last = s.trick.length === 3;
      const following = options[0].suit === lead;
      const top = Math.max(...s.trick.filter((t) => t.card.suit === lead).map((t) => strength(t.card.rank)));
      if (partnerWinning && last) {
        // safe: give the partner as many points as possible
        choice = options.slice().sort((x, y) => thirds(y) - thirds(x) || strength(x.rank) - strength(y.rank))[0];
      } else if (following && !partnerWinning) {
        const winners = options.filter((c) => strength(c.rank) > top).sort((x, y) => strength(x.rank) - strength(y.rank));
        choice = winners[0] ?? weakest(options);
      } else {
        choice = weakest(options);
      }
    }
    ctx.bot(bot, `play:${s.hand}:${s.trickNo}:${s.trick.length}`, randDelay(900, 2000), { type: 'play', card: choice.id });
  },

  view(ctx, s, me): TrisView {
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
