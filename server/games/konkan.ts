/**
 * الكونكان — rummy with the 40-card Spanish deck.
 * Deal: 10 cards each with 2 players, 8 with 3, 7 with 4. One card starts the discard pile.
 * Your turn: draw (from the deck or the face-up discard), lay down melds and/or add cards
 * to melds on the table, then discard one card (not the one you just took from the discard pile).
 * Melds: 3–4 cards of the same number, or 3+ consecutive cards of the same suit (… 6, 7, 10, 11, 12).
 * The first to get rid of all their cards wins the hand ("كونكان!"). Everyone else adds up
 * the cards left in their hand (1–7 = face value, figures = 10). Reach the limit and you're out;
 * the last player standing wins.
 */
import { cardName, isKonkanMeld, rankIndex, sortHand, type Card } from '../../src/shared/cards';
import type { KonkanViewPlus } from '../../src/shared/games/konkan';
import type { KonkanMeld, KonkanSettings, KonkanView } from '../../src/shared/protocol';
import { Feed, freshDeck, randDelay } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr, shuffle } from '../util';

const DEAL: Record<number, number> = { 2: 10, 3: 8, 4: 7 };
/** The discard pile goes back into the stock at most this many times per hand. */
const MAX_RESHUFFLES = 2;

export const cardValue = (c: Card) => (c.rank <= 7 ? c.rank : 10);

export const isValidMeld = isKonkanMeld;

function sortMeld(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank) || a.suit.localeCompare(b.suit));
}

interface State {
  settings: KonkanSettings;
  seats: string[];
  active: string[];
  scores: Record<string, number>;
  phase: KonkanView['phase'];
  hand: number;
  dealerIdx: number;
  turn: string;
  step: KonkanView['step'];
  /** card taken from the discard pile this turn: it may not be thrown straight back */
  takenDiscard: string | null;
  stock: Card[];
  /** times the discard pile went back into the stock this hand (capped: a hand can't go on forever) */
  reshuffles?: number;
  discard: Card[];
  hands: Record<string, Card[]>;
  melds: KonkanMeld[];
  meldSeq: number;
  feed: Feed;
  handWinner: string | null;
  handSummary: KonkanView['handSummary'];
  winner: string | null;
  actions: number;
  /** who threw each card of the discard pile (null: turned up at the deal) */
  throwers: (string | null)[];
  lastMeld: KonkanViewPlus['lastMeld'];
}

function nextActive(s: State, from: string): string {
  const i = s.seats.indexOf(from);
  for (let k = 1; k <= s.seats.length; k++) {
    const id = s.seats[(i + k) % s.seats.length];
    if (s.active.includes(id)) return id;
  }
  return from;
}

function startHand(ctx: GameCtx, s: State) {
  s.hand += 1;
  s.phase = 'play';
  s.stock = freshDeck();
  s.reshuffles = 0;
  const per = DEAL[s.active.length] ?? 7;
  s.hands = Object.fromEntries(s.seats.map((id) => [id, s.active.includes(id) ? s.stock.splice(0, per) : []]));
  s.discard = [s.stock.pop()!];
  s.melds = [];
  // dealer rotates among players still in the game
  let dealer = s.seats[s.dealerIdx] ?? s.active[0];
  dealer = nextActive(s, dealer);
  s.dealerIdx = s.seats.indexOf(dealer);
  s.turn = nextActive(s, dealer);
  s.step = 'draw';
  s.takenDiscard = null;
  s.handWinner = null;
  s.handSummary = null;
  s.throwers = [null];
  s.lastMeld = null;
  s.feed.clear();
  s.feed.push(`اليد ${s.hand} — ${per} أوراق لكل لاعب`);
  ctx.say?.(`اليد ${s.hand} — البداية لـ${ctx.playerName(s.turn)}`);
  ctx.fx('card');
}

function endHand(ctx: GameCtx, s: State, winner: string | null) {
  s.handWinner = winner;
  s.handSummary = s.active.map((id) => {
    const cards = sortHand(s.hands[id]);
    return { id, cards, points: id === winner ? 0 : cards.reduce((t, c) => t + cardValue(c), 0) };
  });
  for (const row of s.handSummary) s.scores[row.id] += row.points;
  if (winner) s.feed.push(`${ctx.playerName(winner)}: كونكان!`, { by: winner });
  ctx.say?.(winner ? `كونكان لـ${ctx.playerName(winner)}! انتهت اليد` : 'انتهت الأوراق — لا فائز في هذه اليد', winner ?? undefined);
  const out = s.active.filter((id) => s.scores[id] >= s.settings.limit);
  for (const id of out) s.feed.push(`${ctx.playerName(id)} خرج من اللعبة`, { by: id });
  s.active = s.active.filter((id) => !out.includes(id));
  if (s.active.length <= 1) {
    s.winner =
      s.active[0] ?? s.seats.slice().sort((a, b) => s.scores[a] - s.scores[b])[0];
    s.phase = 'final';
    ctx.fx('win', s.winner);
  } else {
    s.phase = 'handEnd';
    ctx.fx(winner ? 'reveal' : 'tick');
  }
}

function takeCards(hand: Card[], ids: string[]): Card[] | null {
  const unique = [...new Set(ids)];
  const cards = unique.map((id) => hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) return null;
  return cards as Card[];
}

function checkWin(ctx: GameCtx, s: State, by: string) {
  if (s.hands[by].length === 0) endHand(ctx, s, by);
}

/* ------------------------------------------------------------------ */
/* Bot helpers                                                         */
/* ------------------------------------------------------------------ */

/** Greedy search for melds inside a hand. */
export function findMelds(hand: Card[]): Card[][] {
  const left = hand.slice();
  const melds: Card[][] = [];
  // sets
  const byRank = new Map<number, Card[]>();
  for (const c of left) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  for (const group of byRank.values()) {
    if (group.length >= 3) {
      melds.push(group.slice(0, 4));
      for (const c of group.slice(0, 4)) left.splice(left.indexOf(c), 1);
    }
  }
  // runs
  const bySuit = new Map<string, Card[]>();
  for (const c of left) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c]);
  for (const cards of bySuit.values()) {
    const sorted = cards.slice().sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));
    let run: Card[] = [];
    const flush = () => {
      if (run.length >= 3) melds.push(run);
      run = [];
    };
    for (const c of sorted) {
      if (run.length && rankIndex(c.rank) !== rankIndex(run[run.length - 1].rank) + 1) flush();
      run.push(c);
    }
    flush();
  }
  return melds;
}

function layoffTarget(card: Card, melds: KonkanMeld[]): KonkanMeld | null {
  return melds.find((m) => isValidMeld([...m.cards, card])) ?? null;
}

/** How much a card "belongs" with the rest of the hand. */
function usefulness(card: Card, hand: Card[]): number {
  let u = 0;
  for (const c of hand) {
    if (c.id === card.id) continue;
    if (c.rank === card.rank) u += 2;
    if (c.suit === card.suit && Math.abs(rankIndex(c.rank) - rankIndex(card.rank)) === 1) u += 2;
    if (c.suit === card.suit && Math.abs(rankIndex(c.rank) - rankIndex(card.rank)) === 2) u += 1;
  }
  return u;
}

/* ------------------------------------------------------------------ */

export const konkan: GameModule<State, KonkanSettings> = {
  turnOf: (s) => s.phase === 'play' ? [s.turn] : [],
  id: 'konkan',
  hostOnly: ['next'],

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      seats: participants,
      active: participants.slice(),
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      phase: 'play',
      hand: 0,
      dealerIdx: Math.floor(Math.random() * participants.length),
      turn: participants[0],
      step: 'draw',
      takenDiscard: null,
      stock: [],
      discard: [],
      hands: {},
      melds: [],
      meldSeq: 0,
      feed: new Feed(),
      handWinner: null,
      handSummary: null,
      winner: null,
      actions: 0,
      throwers: [],
      lastMeld: null,
    };
    startHand(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'handEnd') startHand(ctx, s);
      return;
    }
    if (s.phase !== 'play') return;
    if (s.turn !== by) throw new GameError('ليس دورك');
    const hand = s.hands[by];
    const name = ctx.playerName(by);
    switch (a.type) {
      case 'drawStock': {
        if (s.step !== 'draw') return;
        if (!s.stock.length && (s.reshuffles ?? 0) >= MAX_RESHUFFLES) {
          // nobody could go out after going through the cards three times: end the hand
          s.feed.push('انتهت الأوراق ثلاث مرات — لا فائز في هذه اليد');
          endHand(ctx, s, null);
          return;
        }
        if (!s.stock.length) {
          s.reshuffles = (s.reshuffles ?? 0) + 1;
          const top = s.discard.pop();
          s.stock = shuffle(s.discard);
          s.discard = top ? [top] : [];
          s.throwers = top ? s.throwers.slice(-1) : [];
          s.feed.push('خلط الأوراق المرمية من جديد');
        }
        const card = s.stock.pop();
        if (!card) {
          s.feed.push('انتهت الأوراق — لا فائز في هذه اليد');
          endHand(ctx, s, null);
          return;
        }
        hand.push(card);
        s.step = 'play';
        s.takenDiscard = null;
        s.actions += 1;
        s.feed.push(`${name} سحب من الكومة`, { by });
        ctx.say?.(`سحب من الكومة: ${name}`, by);
        ctx.fx('card');
        return;
      }
      case 'drawDiscard': {
        if (s.step !== 'draw' || !s.discard.length) return;
        const card = s.discard.pop()!;
        hand.push(card);
        s.throwers.pop();
        s.step = 'play';
        s.takenDiscard = card.id;
        s.actions += 1;
        s.feed.push(`${name} أخذ ${cardName(card)} من المرمية`, { by });
        ctx.say?.(`من المرمية إلى ${name}: ${cardName(card)}`, by);
        ctx.fx('card');
        return;
      }
      case 'meld': {
        if (s.step !== 'play' || !Array.isArray(a.cards)) return;
        const cards = takeCards(hand, (a.cards as unknown[]).filter(isStr));
        if (!cards || !isValidMeld(cards)) {
          throw new GameError('هذه ليست مجموعة صحيحة: 3–4 أوراق من الرقم نفسه، أو 3 أوراق متتالية فأكثر من النوع نفسه');
        }
        for (const c of cards) hand.splice(hand.indexOf(c), 1);
        s.melds.push({ id: ++s.meldSeq, owner: by, cards: sortMeld(cards) });
        s.lastMeld = { id: s.meldSeq, by };
        s.actions += 1;
        s.feed.push(`${name} نزّل ${cards.length} أوراق`, { by });
        ctx.say?.(`مجموعة جديدة لـ${name}: ${cards.length} أوراق`, by);
        ctx.fx('correct', by);
        checkWin(ctx, s, by);
        return;
      }
      case 'layoff': {
        if (s.step !== 'play' || !Array.isArray(a.cards) || typeof a.meld !== 'number') return;
        const meld = s.melds.find((m) => m.id === a.meld);
        const cards = takeCards(hand, (a.cards as unknown[]).filter(isStr));
        if (!meld || !cards || !cards.length || !isValidMeld([...meld.cards, ...cards])) {
          throw new GameError('هذه الأوراق لا تتناسب مع هذه المجموعة');
        }
        for (const c of cards) hand.splice(hand.indexOf(c), 1);
        meld.cards = sortMeld([...meld.cards, ...cards]);
        s.lastMeld = { id: meld.id, by };
        s.actions += 1;
        s.feed.push(`${name} أضاف ${cards.length} ${cards.length === 1 ? 'ورقة' : 'أوراق'} إلى مجموعة`, { by });
        ctx.say?.(
          `إضافة من ${name}: ${cards.length === 1 ? cardName(cards[0]) : `${cards.length} أوراق`} إلى مجموعة ${ctx.playerName(meld.owner)}`,
          by,
        );
        ctx.fx('correct', by);
        checkWin(ctx, s, by);
        return;
      }
      case 'discard': {
        if (s.step !== 'play' || !isStr(a.card)) return;
        const idx = hand.findIndex((c) => c.id === a.card);
        if (idx < 0) return;
        // (only allowed when it is the very last card in hand, otherwise the turn could never end)
        if (a.card === s.takenDiscard && hand.length > 1) throw new GameError('لا يمكنك رمي الورقة التي أخذتها للتو');
        const [card] = hand.splice(idx, 1);
        s.discard.push(card);
        s.throwers.push(by);
        // the highlight of the last group lasts until the next player has finished their turn
        if (s.lastMeld && s.lastMeld.by !== by) s.lastMeld = null;
        s.takenDiscard = null;
        s.actions += 1;
        s.feed.push(`${name} رمى ${cardName(card)}`, { by });
        ctx.say?.(`ورقة مرمية من ${name}: ${cardName(card)}`, by);
        ctx.fx('card');
        if (hand.length === 0) {
          endHand(ctx, s, by);
          return;
        }
        s.turn = nextActive(s, by);
        s.step = 'draw';
        return;
      }
    }
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play' || !ctx.isBot(s.turn)) return;
    const bot = s.turn;
    const hand = s.hands[bot];
    const key = `k:${s.hand}:${s.actions}`;
    const delay = randDelay(900, 1800);
    if (s.step === 'draw') {
      const top = s.discard[s.discard.length - 1];
      const wantsTop =
        top &&
        (findMelds([...hand, top]).some((m) => m.includes(top)) || layoffTarget(top, s.melds) !== null);
      ctx.bot(bot, key, delay, { type: wantsTop ? 'drawDiscard' : 'drawStock' });
      return;
    }
    const melds = findMelds(hand);
    if (melds.length) {
      ctx.bot(bot, key, delay, { type: 'meld', cards: melds[0].map((c) => c.id) });
      return;
    }
    for (const c of hand) {
      const target = layoffTarget(c, s.melds);
      if (target) {
        ctx.bot(bot, key, delay, { type: 'layoff', cards: [c.id], meld: target.id });
        return;
      }
    }
    const throwable = hand.length > 1 ? hand.filter((c) => c.id !== s.takenDiscard) : hand;
    const worst = throwable
      .slice()
      .sort((x, y) => usefulness(x, hand) - usefulness(y, hand) || cardValue(y) - cardValue(x))[0];
    if (worst) ctx.bot(bot, key, delay, { type: 'discard', card: worst.id });
  },

  view(ctx, s, me): KonkanViewPlus {
    return {
      game: 'konkan',
      phase: s.phase,
      participants: s.seats,
      active: s.active,
      turn: s.turn,
      step: s.step,
      hand: s.hand,
      myHand: sortHand(s.hands[me] ?? []),
      handCounts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      discardTop: s.discard[s.discard.length - 1] ?? null,
      takenDiscard: s.takenDiscard,
      stockLeft: s.stock.length,
      melds: s.melds,
      scores: s.scores,
      limit: s.settings.limit,
      feed: s.feed.list(),
      handWinner: s.handWinner,
      handSummary: s.handSummary,
      winner: s.winner,
      discardBy: s.throwers[s.throwers.length - 1] ?? null,
      lastMeld: s.lastMeld,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.active.includes(id) || s.phase === 'final') return;
    s.active = s.active.filter((p) => p !== id);
    s.feed.push(`${ctx.playerName(id)} غادر اللعبة`);
    if (s.active.length <= 1) {
      s.winner = s.active[0] ?? null;
      s.phase = 'final';
    } else if (s.turn === id) {
      s.turn = nextActive(s, id);
      s.step = 'draw';
      s.takenDiscard = null;
    }
  },

  /** The winner, then the others by points like the podium (fewer is better); leavers are left out. */
  result(s) {
    const winner = s.winner;
    if (s.phase !== 'final' || !winner) return null;
    // still playing, or knocked out by reaching the limit (a player below it who isn't active left the game)
    const rest = s.seats.filter((id) => id !== winner && (s.active.includes(id) || s.scores[id] >= s.settings.limit));
    const vals = [...new Set(rest.map((id) => s.scores[id]))].sort((a, b) => a - b);
    return { places: [[winner], ...vals.map((v) => rest.filter((id) => s.scores[id] === v))] };
  },
};
