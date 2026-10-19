/** «التوتي» — rules, the auction, «الغناء», scoring, the game's end, bots, timer, onLeave and the announcements. */
import { expect, test } from 'bun:test';

import { makeDeck, type Card, type Suit } from '../src/shared/cards';
import { TOUTI_DEFAULTS, type ToutiView } from '../src/shared/games/touti';
import { T_TABLE, cardPoints, legalCards, scoreHand, singable, trickLeader } from '../src/shared/touti-rules';
import { HAND_END_MS, REDEAL_MS, TRICK_PAUSE_MS, bidOptions, decide, touti, turnOf, type State } from './games/touti';
import { botBid, handValue } from './touti-bot';

const P = ['p0', 'p1', 'p2', 'p3'];
const NAMES: Record<string, string> = { p0: 'سارة', p1: 'يوسف', p2: 'ماما', p3: 'بابا' };
const vw = (ctx: any, s: State, me: string) => touti.view(ctx, s, me) as ToutiView;

function fakeCtx() {
  const said: string[] = [];
  const jobs: { by: string; a: any }[] = [];
  const fx: string[] = [];
  const ctx: any = {
    now: 1000,
    fx: (k: string) => fx.push(k),
    isConnected: () => true,
    isBot: () => true,
    playerName: (id: string) => NAMES[id] ?? id,
    memo: new Map(),
    bot: (by: string, _k: string, _d: number, a: any) => jobs.push({ by, a }),
    say: (t: string) => said.push(t),
  };
  return { ctx, said, jobs, fx };
}

/** "cups-12" style ids from a short form: "12c" = 12 of cups (c cups, o coins, s swords, b clubs) */
const SU: Record<string, Suit> = { c: 'cups', o: 'coins', s: 'swords', b: 'clubs' };
const c = (x: string): Card => {
  const suit = SU[x.slice(-1)];
  const rank = Number(x.slice(0, -1));
  return { id: `${suit}-${rank}`, suit, rank };
};
const cs = (x: string) => x.split(' ').map(c);
const ids = (cards: Card[]) => cards.map((k) => k.id).sort();
const T = (...xs: string[]) => xs.map((x, i) => ({ by: P[i], card: c(x) }));

function newGame(settings: Partial<State['settings']> = {}) {
  const f = fakeCtx();
  const s = touti.start(f.ctx, P, { ...TOUTI_DEFAULTS, ...settings });
  return { ...f, s };
}

/** Force the deal: dealer seat 3 (so p0 speaks and leads first), the given 10-card hands. */
function rig(s: State, hands: string[]) {
  s.dealer = 3;
  s.hands = Object.fromEntries(P.map((id, i) => [id, cs(hands[i])]));
  s.bid = { order: P.slice(), active: P.slice(), turn: 'p0', calls: {}, high: null, highBy: null };
}

// each hand: 10 cards, the 40 of the deck exactly once
const HANDS = [
  '1c 3c 12c 11c 7c 1o 3o 12b 11b 2s',
  '10c 6c 5c 4c 2c 12o 11o 10o 7o 6o',
  '1s 3s 12s 11s 10s 7s 6s 5s 4s 5o',
  '1b 3b 10b 7b 6b 5b 4b 2b 4o 2o',
];

function run(g: ReturnType<typeof newGame>, until: () => boolean, max = 20000) {
  for (let i = 0; i < max && !until(); i++) {
    touti.botPlan!(g.ctx, g.s, P);
    const job = g.jobs.shift();
    if (job) {
      g.jobs.length = 0;
      try {
        touti.act(g.ctx, g.s, job.by, job.a);
      } catch {
        // a stale move: plan again
      }
      continue;
    }
    g.ctx.now += 500;
    touti.tick!(g.ctx, g.s);
  }
}

/* ------------------------------------------------------------------ */
/* Cards and duties                                                    */
/* ------------------------------------------------------------------ */

test('deck: 40 cards, 120 card points, 130 with the last trick; the rigged hands use each card once', () => {
  const deck = makeDeck();
  expect(deck.length).toBe(40);
  expect(deck.reduce((t, k) => t + cardPoints(k), 0)).toBe(120);
  expect(T_TABLE).toBe(130);
  const all = HANDS.flatMap((h) => h.split(' ')).map((x) => c(x).id);
  expect(new Set(all).size).toBe(40);
});

test('deal: 10 cards each, the auction starts on the dealer\'s right', () => {
  const { s } = newGame();
  for (const id of P) expect(s.hands[id].length).toBe(10);
  expect(s.bid!.turn).toBe(P[(s.dealer + 1) % 4]);
  expect(turnOf(s)).toEqual([P[(s.dealer + 1) % 4]]);
});

test('order: 1 > 3 > 12 > 11 > 10 > 7 > … > 2 in every suit; the highest trump takes the trick', () => {
  expect(trickLeader(T('3c', '1c', '12c', '2c'), 'coins')).toBe(1);
  expect(trickLeader(T('12c', '11c', '3c', '7c'), 'coins')).toBe(2);
  expect(trickLeader(T('4c', '2c', '5c', '10c'), 'coins')).toBe(3);
  // off-suit cards never take it; any trump does
  expect(trickLeader(T('2c', '1o', '1s', '4c'), 'swords')).toBe(2);
  expect(trickLeader(T('2c', '2s', '4s', '1c'), 'swords')).toBe(2);
});

test('duties: follow suit; otherwise trump; over a trump on the table if possible, else a lower trump', () => {
  const R = { partnerFree: false };
  const hand = cs('12c 4c 3s 5s 1o');
  expect(ids(legalCards(hand, T('7c'), 'swords', R))).toEqual(ids(cs('12c 4c')));
  const noCups = cs('3s 5s 1o');
  expect(ids(legalCards(noCups, T('7c'), 'swords', R))).toEqual(ids(cs('3s 5s')));
  // a trump on the table: go over it (3 beats 12, 5 doesn't)
  expect(ids(legalCards(noCups, T('7c', '12s'), 'swords', R))).toEqual(ids(cs('3s')));
  // can't go over the ace of trumps: any trump still
  expect(ids(legalCards(noCups, T('7c', '1s'), 'swords', R))).toEqual(ids(cs('3s 5s')));
  // neither the suit nor a trump: anything
  expect(ids(legalCards(cs('1o 2b'), T('7c'), 'swords', R))).toEqual(ids(cs('1o 2b')));
  // the trump led: follow with any trump (no duty to go over)
  expect(ids(legalCards(cs('5s 1o'), T('3s'), 'swords', R))).toEqual(ids(cs('5s')));
});

test('duties: with «partnerFree», no trump is needed while the partner holds the trick', () => {
  const hand = cs('3s 5s 1o');
  // I play 4th: my partner played 2nd (index 1) and holds the trick
  const trick = [
    { by: 'p0', card: c('7c') },
    { by: 'p1', card: c('1c') },
    { by: 'p2', card: c('4c') },
  ];
  expect(ids(legalCards(hand, trick, 'swords', { partnerFree: true }))).toEqual(ids(hand));
  expect(ids(legalCards(hand, trick, 'swords', { partnerFree: false }))).toEqual(ids(cs('3s 5s')));
  // the opponents hold it: trump as usual
  const trick2 = [
    { by: 'p0', card: c('1c') },
    { by: 'p1', card: c('7c') },
    { by: 'p2', card: c('4c') },
  ];
  expect(ids(legalCards(hand, trick2, 'swords', { partnerFree: true }))).toEqual(ids(cs('3s 5s')));
});

test('«الغناء»: 12 + 11 of a suit; a plain pair needs a bid of 80, the trump pair 90; each suit once', () => {
  const hand = cs('12c 11c 12o 11o 3s');
  expect(singable(hand, 'cups', 70, [])).toEqual([]);
  expect(singable(hand, 'cups', 80, [])).toEqual([{ suit: 'coins', points: 20 }]);
  expect(singable(hand, 'cups', 90, [])).toEqual([
    { suit: 'cups', points: 40 },
    { suit: 'coins', points: 20 },
  ]);
  expect(singable(hand, 'cups', 90, ['cups'])).toEqual([{ suit: 'coins', points: 20 }]);
  expect(singable(cs('12c 3c'), 'swords', 200, [])).toEqual([]);
});

test('scoring: the bidders reach the bid → they score the bid; otherwise the defenders score it', () => {
  expect(scoreHand({ bidSide: 'A', bid: 90, cards: { A: 75, B: 55 }, sung: 20 })).toEqual({ made: 95, success: true, points: { A: 90, B: 0 } });
  expect(scoreHand({ bidSide: 'B', bid: 100, cards: { A: 40, B: 90 }, sung: 0 })).toEqual({ made: 90, success: false, points: { A: 100, B: 0 } });
  // exactly the bid is enough
  expect(scoreHand({ bidSide: 'A', bid: 70, cards: { A: 70, B: 60 }, sung: 0 }).success).toBe(true);
});

/* ------------------------------------------------------------------ */
/* The auction                                                         */
/* ------------------------------------------------------------------ */

test('auction: 70 to 230 in steps of 10; «باص» leaves; the last bidder takes it and names the trump', () => {
  const g = newGame();
  rig(g.s, HANDS);
  expect(bidOptions(g.s, 'p0')[0]).toBe(70);
  expect(bidOptions(g.s, 'p0').at(-1)).toBe(230);
  expect(bidOptions(g.s, 'p1')).toEqual([]);
  expect(() => touti.act(g.ctx, g.s, 'p1', { type: 'bid', bid: 70 })).toThrow('ليس دورك');
  expect(() => touti.act(g.ctx, g.s, 'p0', { type: 'bid', bid: 75 })).toThrow();
  expect(() => touti.act(g.ctx, g.s, 'p0', { type: 'bid', bid: 60 })).toThrow();
  touti.act(g.ctx, g.s, 'p0', { type: 'bid', bid: 80 });
  expect(bidOptions(g.s, 'p1')[0]).toBe(90);
  touti.act(g.ctx, g.s, 'p1', { type: 'bid', bid: 'pass' });
  touti.act(g.ctx, g.s, 'p2', { type: 'bid', bid: 100 });
  touti.act(g.ctx, g.s, 'p3', { type: 'bid', bid: 'pass' });
  // p1 passed: back to p0
  expect(g.s.bid!.turn).toBe('p0');
  touti.act(g.ctx, g.s, 'p0', { type: 'bid', bid: 110 });
  expect(g.s.bid!.turn).toBe('p2');
  touti.act(g.ctx, g.s, 'p2', { type: 'bid', bid: 'pass' });
  expect(g.s.phase).toBe('trump');
  expect(g.s.bidder).toBe('p0');
  expect(g.s.contract).toBe(110);
  expect(turnOf(g.s)).toEqual(['p0']);
  expect(() => touti.act(g.ctx, g.s, 'p1', { type: 'trump', suit: 'cups' })).toThrow('ليس دورك');
  expect(() => touti.act(g.ctx, g.s, 'p0', { type: 'trump', suit: 'gold' })).toThrow();
  touti.act(g.ctx, g.s, 'p0', { type: 'trump', suit: 'cups' });
  expect(g.s.phase).toBe('play');
  expect(g.s.trump).toBe('cups');
  // the dealer's right leads
  expect(turnOf(g.s)).toEqual(['p0']);
  expect(g.said).toContain('مزايدة من سارة: 80');
  expect(g.said).toContain('باص: يوسف');
  expect(g.said.some((t) => t.startsWith('الطرونفو: الكوباص — الشاري: سارة (110)'))).toBe(true);
});

test('auction: everyone passes → a new deal by the next dealer', () => {
  const g = newGame();
  rig(g.s, HANDS);
  for (const id of P) touti.act(g.ctx, g.s, id, { type: 'bid', bid: 'pass' });
  expect(g.s.redealAt).not.toBeNull();
  expect(turnOf(g.s)).toEqual([]);
  expect(g.said.at(-1)).toBe('لا مزايدة — توزيع جديد');
  g.ctx.now += REDEAL_MS;
  touti.tick!(g.ctx, g.s);
  expect(g.s.dealer).toBe(0);
  expect(g.s.hand).toBe(2);
  expect(g.s.bid!.turn).toBe('p1');
});

test('auction: the dealer may still bid after three passes; 230 ends it at once', () => {
  const g = newGame();
  rig(g.s, HANDS);
  for (const id of ['p0', 'p1', 'p2']) touti.act(g.ctx, g.s, id, { type: 'bid', bid: 'pass' });
  touti.act(g.ctx, g.s, 'p3', { type: 'bid', bid: 70 });
  expect(g.s.phase).toBe('trump');
  expect(g.s.bidder).toBe('p3');

  const h = newGame();
  rig(h.s, HANDS);
  touti.act(h.ctx, h.s, 'p0', { type: 'bid', bid: 230 });
  expect(h.s.phase).toBe('trump');
  expect(h.s.contract).toBe(230);
});

/* ------------------------------------------------------------------ */
/* Play and «الغناء»                                                   */
/* ------------------------------------------------------------------ */

/** p0 buys at `bid` with cups as trump (p0 & p2 against p1 & p3). */
function bought(bid: number, settings: Partial<State['settings']> = {}, hands = HANDS) {
  const g = newGame(settings);
  rig(g.s, hands);
  touti.act(g.ctx, g.s, 'p0', { type: 'bid', bid });
  for (const id of ['p1', 'p2', 'p3']) touti.act(g.ctx, g.s, id, { type: 'bid', bid: 'pass' });
  touti.act(g.ctx, g.s, 'p0', { type: 'trump', suit: 'cups' });
  return g;
}

test('play: illegal cards are refused with the duty; the trick stays ≥ 2.2 s, then its taker leads', () => {
  const g = bought(80);
  touti.act(g.ctx, g.s, 'p0', { type: 'play', card: 'coins-1' });
  // p1 holds coins: may not trump
  expect(() => touti.act(g.ctx, g.s, 'p1', { type: 'play', card: 'cups-10' })).toThrow('يجب أن تتبع الشكل المطلوب');
  touti.act(g.ctx, g.s, 'p1', { type: 'play', card: 'coins-6' });
  touti.act(g.ctx, g.s, 'p2', { type: 'play', card: 'coins-5' });
  // p3 holds coins too
  touti.act(g.ctx, g.s, 'p3', { type: 'play', card: 'coins-2' });
  expect(g.s.trickWinner).toBe('p0');
  expect(g.s.cards.A).toBe(11);
  expect(turnOf(g.s)).toEqual([]);
  expect(TRICK_PAUSE_MS).toBeGreaterThanOrEqual(2200);
  g.ctx.now += TRICK_PAUSE_MS - 100;
  touti.tick!(g.ctx, g.s);
  expect(g.s.trick.length).toBe(4);
  g.ctx.now += 200;
  touti.tick!(g.ctx, g.s);
  // p0 took it and holds 12 + 11 of clubs (and of cups, trump, but the bid is 80): the singing window
  expect(g.s.trick.length).toBe(0);
  expect(turnOf(g.s)).toEqual(['p0']);
  const v = vw(g.ctx, g.s, 'p0');
  expect(v.singer).toBe('p0');
  expect(v.mySing).toEqual([{ suit: 'clubs', points: 20 }]);
  expect(v.playable).toEqual([]);
  expect(() => touti.act(g.ctx, g.s, 'p0', { type: 'sing', suit: 'cups' })).toThrow();
  touti.act(g.ctx, g.s, 'p0', { type: 'sing', suit: 'clubs' });
  expect(g.s.sung).toEqual([{ by: 'p0', suit: 'clubs', points: 20, trick: 1 }]);
  expect(g.said.at(-1)).toBe('غناء من سارة: 12 و11 الباسطوص +20');
  // one pair per trick: now p0 plays
  expect(vw(g.ctx, g.s, 'p0').singer).toBeNull();
  expect(vw(g.ctx, g.s, 'p0').playable.length).toBe(9);
  // the cards stay in hand
  expect(g.s.hands.p0.some((k) => k.id === 'clubs-12')).toBe(true);
});

test('«الغناء»: the trump pair needs 90; skipping keeps the pair for a later trick', () => {
  const g = bought(90);
  for (const [id, card] of [['p0', 'coins-1'], ['p1', 'coins-6'], ['p2', 'coins-5'], ['p3', 'coins-2']]) touti.act(g.ctx, g.s, id, { type: 'play', card });
  g.ctx.now += TRICK_PAUSE_MS;
  touti.tick!(g.ctx, g.s);
  expect(vw(g.ctx, g.s, 'p0').mySing).toEqual([
    { suit: 'cups', points: 40 },
    { suit: 'clubs', points: 20 },
  ]);
  touti.act(g.ctx, g.s, 'p0', { type: 'sing', suit: null });
  expect(g.s.singQueue).toEqual([]);
  expect(g.s.sung).toEqual([]);
  expect(turnOf(g.s)).toEqual(['p0']);
});

test('«الغناء»: defenders never sing; with «team» the partner may sing after the taker', () => {
  // p1 (a defender) holds 12 + 11 of coins
  const g = bought(90);
  touti.act(g.ctx, g.s, 'p0', { type: 'play', card: 'swords-2' });
  touti.act(g.ctx, g.s, 'p1', { type: 'play', card: 'cups-10' });
  touti.act(g.ctx, g.s, 'p2', { type: 'play', card: 'swords-4' });
  touti.act(g.ctx, g.s, 'p3', { type: 'play', card: 'clubs-2' });
  g.ctx.now += TRICK_PAUSE_MS;
  touti.tick!(g.ctx, g.s);
  expect(g.s.singQueue).toEqual([]);
  expect(turnOf(g.s)).toEqual(['p1']);

  // «team»: p2 takes a trick, has no pair; p0 (partner) sings
  const t = bought(90, { singBy: 'team' });
  touti.act(t.ctx, t.s, 'p0', { type: 'play', card: 'swords-2' });
  touti.act(t.ctx, t.s, 'p1', { type: 'play', card: 'cups-2' });
  touti.act(t.ctx, t.s, 'p2', { type: 'play', card: 'swords-1' });
  touti.act(t.ctx, t.s, 'p3', { type: 'play', card: 'clubs-2' });
  expect(t.s.trickWinner).toBe('p1');
  // the defender trumped: no window. Now a trick taken by p0
  const u = bought(90, { singBy: 'team' });
  touti.act(u.ctx, u.s, 'p0', { type: 'play', card: 'coins-3' });
  touti.act(u.ctx, u.s, 'p1', { type: 'play', card: 'coins-6' });
  touti.act(u.ctx, u.s, 'p2', { type: 'play', card: 'coins-5' });
  touti.act(u.ctx, u.s, 'p3', { type: 'play', card: 'coins-2' });
  expect(u.s.trickWinner).toBe('p0');
  u.ctx.now += TRICK_PAUSE_MS;
  touti.tick!(u.ctx, u.s);
  // the taker first, then the partner (p2 holds 12 + 11 of swords)
  expect(u.s.singQueue).toEqual(['p0', 'p2']);
  touti.act(u.ctx, u.s, 'p0', { type: 'sing', suit: null });
  expect(turnOf(u.s)).toEqual(['p2']);
  expect(() => touti.act(u.ctx, u.s, 'p0', { type: 'play', card: 'cups-1' })).toThrow('ليس دورك');
  touti.act(u.ctx, u.s, 'p2', { type: 'sing', suit: 'swords' });
  expect(u.s.singQueue).toEqual([]);
  expect(u.s.sung.map((x) => x.by)).toEqual(['p2']);
});

test('«الغناء» with «team»: the partner of the taker gets the window when holding a pair', () => {
  // p2 holds 12 + 11 of swords; p0 takes the first trick and has no pair
  const hands = ['1c 3c 10c 7c 6c 1o 3o 10b 7b 2s', '12c 11c 5c 4c 2c 12o 11o 10o 7o 6o', '1s 3s 12s 11s 10s 7s 6s 5s 4s 5o', '1b 3b 12b 11b 6b 5b 4b 2b 4o 2o'];
  const g = bought(80, { singBy: 'team' }, hands);
  for (const [id, card] of [['p0', 'coins-1'], ['p1', 'coins-6'], ['p2', 'coins-5'], ['p3', 'coins-2']]) touti.act(g.ctx, g.s, id, { type: 'play', card });
  g.ctx.now += TRICK_PAUSE_MS;
  touti.tick!(g.ctx, g.s);
  expect(g.s.singQueue).toEqual(['p2']);
  expect(turnOf(g.s)).toEqual(['p2']);
  touti.act(g.ctx, g.s, 'p2', { type: 'sing', suit: 'swords' });
  expect(g.s.sung[0]).toMatchObject({ by: 'p2', suit: 'swords', points: 20 });
  // the taker leads
  expect(turnOf(g.s)).toEqual(['p0']);

  // the same deal with «winner»: no window for p2
  const w = bought(80, { singBy: 'winner' }, hands);
  for (const [id, card] of [['p0', 'coins-1'], ['p1', 'coins-6'], ['p2', 'coins-5'], ['p3', 'coins-2']]) touti.act(w.ctx, w.s, id, { type: 'play', card });
  w.ctx.now += TRICK_PAUSE_MS;
  touti.tick!(w.ctx, w.s);
  expect(w.s.singQueue).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* A whole hand, the game's end, bots                                  */
/* ------------------------------------------------------------------ */

test('a whole hand by bots: 130 points shared out, the bid scored by one team only, the sheet updated', () => {
  const g = bought(90);
  run(g, () => g.s.phase === 'handEnd' || g.s.phase === 'final');
  const r = g.s.result!;
  expect(r.cards.A + r.cards.B).toBe(130);
  expect(r.tricks.A + r.tricks.B).toBe(10);
  expect(r.made).toBe(r.cards.A + r.sung.reduce((t, x) => t + x.points, 0));
  expect(r.points.A + r.points.B).toBe(90);
  expect(r.points[r.success ? 'A' : 'B']).toBe(90);
  expect(g.s.history).toHaveLength(1);
  expect(g.said.some((t) => t.startsWith('نهاية اليد 1: '))).toBe(true);
  expect(HAND_END_MS).toBeGreaterThanOrEqual(4000);
  expect(vw(g.ctx, g.s, 'p1').result?.bid).toBe(90);
});

test('the first team to the target wins; result() ranks the winning pair first', () => {
  const g = bought(100);
  g.s.scores = { A: 550, B: 590 };
  run(g, () => g.s.phase === 'handEnd' || g.s.phase === 'final');
  expect(g.s.phase).toBe('final');
  const won = g.s.result!.success ? 'A' : 'B';
  expect(g.s.winner).toBe(won);
  const res = touti.result!(g.s)!;
  expect(res.places[0].sort()).toEqual((won === 'A' ? ['p0', 'p2'] : ['p1', 'p3']).sort());
  expect(res.places[1]).toHaveLength(2);
  expect(g.fx).toContain('win');
});

test('a full bot-only game reaches the end (each setting combination)', () => {
  for (const settings of [{}, { singBy: 'team' as const, partnerFree: true, level: 1 }, { target: 300, timer: 20 }]) {
    const g = newGame(settings);
    run(g, () => g.s.phase === 'final', 200000);
    expect(g.s.phase).toBe('final');
    expect(Math.max(g.s.scores.A, g.s.scores.B)).toBeGreaterThanOrEqual(g.s.settings.target);
    expect(touti.result!(g.s)!.places.flat().sort()).toEqual(P.slice().sort());
  }
});

test('bots bid sensibly: weak hands pass, strong hands bid, the pair is protected by the bid', () => {
  const weak = cs('2c 4c 5o 6o 2s 4s 5s 2b 4b 6b');
  expect(botBid(weak, [70, 80, 90], 2, 0)).toBe('pass');
  const strong = cs('1c 3c 12c 11c 7c 6c 1o 3o 1s 1b');
  expect(handValue(strong, 'cups')).toBeGreaterThan(120);
  const call = botBid(strong, [70, 80, 90, 100, 110, 120], 2, 0);
  // holding the trump pair: straight to 90 (needed to sing it)
  expect(call).toBe(90);
  // over a partner's bid only with a clearly better hand
  expect(botBid(cs('1c 3c 5c 7c 2o 4o 2s 4s 2b 4b'), [80, 90], 2, 0, true)).toBe('pass');
});

test('timer: a player who runs out passes in the auction / gets a card played', () => {
  const g = newGame({ timer: 20 });
  g.ctx.isBot = () => false;
  const first = g.s.bid!.turn;
  expect(g.s.deadline).toBe(g.ctx.now + 20_000);
  g.ctx.now += 20_000;
  touti.tick!(g.ctx, g.s);
  expect(g.s.bid!.calls[first]).toBe('pass');
  // a bot plays for whoever times out
  const h = bought(80, { timer: 20 });
  h.ctx.now += 20_001;
  touti.tick!(h.ctx, h.s);
  expect(h.s.trick.length).toBe(1);
});

test('onLeave: a seat that disappears ends the game cleanly (the room normally seats a bot)', () => {
  const g = newGame();
  g.s.scores = { A: 200, B: 100 };
  touti.onLeave!(g.ctx, g.s, 'p3');
  expect(g.s.phase).toBe('final');
  expect(g.s.winner).toBe('A');
  expect(turnOf(g.s)).toEqual([]);
  const h = newGame();
  touti.onLeave!(h.ctx, h.s, 'p1');
  expect(h.s.winner).toBeNull();
  expect(touti.result!(h.s)).toBeNull();
  expect(h.said.at(-1)).toBe('انتهت اللعبة: مقعد فارغ');
  // someone who wasn't seated changes nothing
  const k = newGame();
  touti.onLeave!(k.ctx, k.s, 'guest');
  expect(k.s.phase).toBe('bid');
});

test('start needs exactly 4 players; settings are validated', () => {
  const f = fakeCtx();
  expect(() => touti.start(f.ctx, P.slice(0, 3), TOUTI_DEFAULTS)).toThrow();
  const s = { ...TOUTI_DEFAULTS };
  touti.patchSettings!(s, { target: 1000, timer: 30, singBy: 'team', partnerFree: true, level: 1 });
  expect(s).toEqual({ target: 1000, timer: 30, singBy: 'team', partnerFree: true, level: 1 });
  touti.patchSettings!(s, { target: 999, timer: 7, singBy: 'all', partnerFree: 'yes', level: 9 });
  expect(s).toEqual({ target: 1000, timer: 30, singBy: 'team', partnerFree: true, level: 1 });
});

test('view: my hand only, the others as counts; the decision is mine only on my turn', () => {
  const g = newGame();
  rig(g.s, HANDS);
  const v = vw(g.ctx, g.s, 'p1');
  expect(v.myHand.length).toBe(10);
  expect(ids(v.myHand)).toEqual(ids(cs(HANDS[1])));
  expect(v.counts).toEqual({ p0: 10, p1: 10, p2: 10, p3: 10 });
  expect(v.myBids).toEqual([]);
  expect(vw(g.ctx, g.s, 'p0').myBids.length).toBe(17);
  expect(JSON.stringify(v)).not.toContain('swords-1');
});

test('announcements: noun first, the player only by name, no verb conjugated for a player', () => {
  const g = newGame();
  run(g, () => g.s.hand >= 3 || g.s.phase === 'final', 60000);
  expect(g.said.length).toBeGreaterThan(30);
  for (const t of g.said) {
    expect(t.length).toBeLessThanOrEqual(80);
    // «لعب / أخذ / ربح / زايد / غنّى / قال / مرّر» about a player would say who did it with a verb
    expect(t).not.toMatch(/(^|\s)(لعب|لعبت|أخذ|أخذت|ربح|ربحت|زايد|زايدت|غنّى|غنت|قال|قالت|مرّر|مررت|اختار|اختارت)(\s|$)/);
  }
  expect(g.said.some((t) => /^ورقة من (سارة|يوسف|ماما|بابا): /.test(t))).toBe(true);
  expect(g.said.some((t) => /^(مزايدة من|باص: )/.test(t))).toBe(true);
});

test('decide: only for the player whose turn it is', () => {
  const g = newGame();
  const id = turnOf(g.s)[0];
  const other = P.find((p) => p !== id)!;
  expect(decide(g.s, other, 2)).toBeNull();
  expect(decide(g.s, id, 2)?.type).toBe('bid');
});
