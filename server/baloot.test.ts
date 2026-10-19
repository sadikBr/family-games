/** «البلوط» — rules, bidding, play duties, projects, scoring, doubling, bots. */
import { expect, test } from 'bun:test';

import type { BalootView, BCard, BRank, BSuit } from '../src/shared/games/baloot';
import {
  abnatToPoints,
  balootBlocked,
  bestProjectSide,
  cardValue,
  findProjects,
  legalCards,
  makeBalootDeck,
  projectKey,
  projectPoints,
  scoreHand,
  trickLeader,
} from '../src/shared/baloot-rules';
import { baloot, bidOptions, decide, HAND_END_MS, REDEAL_MS, TRICK_PAUSE_MS, turnOf, type State } from './games/baloot';

const P = ['p0', 'p1', 'p2', 'p3'];
const vw = (ctx: any, s: State, me: string) => baloot.view(ctx, s, me) as BalootView;

function fakeCtx() {
  const said: string[] = [];
  const jobs: { by: string; a: any }[] = [];
  const ctx: any = {
    now: 1000,
    fx: () => {},
    isConnected: () => true,
    isBot: () => true,
    playerName: (id: string) => ({ p0: 'سارة', p1: 'يوسف', p2: 'ماما', p3: 'بابا' })[id] ?? id,
    memo: new Map(),
    bot: (by: string, _k: string, _d: number, a: any) => jobs.push({ by, a }),
    say: (t: string) => said.push(t),
    // these tests check the rules with the quick old bots (the new ones: bots-baloot.test.ts)
    botLevel: () => 'easy',
  };
  return { ctx, said, jobs };
}

const c = (id: string): BCard => {
  const suit = id.slice(-1) as BSuit;
  return { id, suit, rank: id.slice(0, -1) as BRank };
};
const cs = (s: string) => s.split(' ').map(c);
const ids = (cards: BCard[]) => cards.map((x) => x.id).sort();

function newGame(settings: Partial<State['settings']> = {}) {
  const f = fakeCtx();
  const s = baloot.start(f.ctx, P, { target: 152, timer: 0, doubling: false, level: 2, ...settings });
  return { ...f, s };
}

/** Force the deal: dealer seat 3 (so p0 bids first), given 5-card hands and face-up card. */
function rig(s: State, hands: string[], faceUp: string) {
  s.dealer = 3;
  const used = new Set([...hands.flatMap((h) => h.split(' ')), faceUp]);
  s.hands = Object.fromEntries(P.map((id, i) => [id, cs(hands[i])]));
  s.faceUp = c(faceUp);
  s.stock = makeBalootDeck().filter((x) => !used.has(x.id));
  s.bid = { round: 1, stage: 'main', order: P.slice(), queue: P.slice(), calls: {}, best: null };
}

const HANDS = ['AS KS QS 7H 8H', 'AH 10H 9C 8C 7C', 'JD 9D AD 10D KD', 'QH JH 9H AC 10C'];

test('deal: 5 cards each, one face up, 11 left; 8 each after the purchase', () => {
  const { s, ctx } = newGame();
  for (const id of P) expect(s.hands[id].length).toBe(5);
  expect(s.faceUp).not.toBeNull();
  expect(s.stock.length).toBe(11);
  const all = [...P.flatMap((id) => s.hands[id]), s.faceUp!, ...s.stock].map((x) => x.id);
  expect(new Set(all).size).toBe(32);
  const first = s.bid!.queue[0];
  expect(first).toBe(P[(s.dealer + 1) % 4]); // the dealer's right speaks first
  baloot.act(ctx, s, first, { type: 'bid', call: 'sun' });
  for (const id of P) expect(s.hands[id].length).toBe(8);
  expect(s.stock.length).toBe(0);
  expect(s.contract).toMatchObject({ mode: 'sun', buyer: first });
});

test('bidding: حكم, the passers and the bidder may still go صن, then the contract', () => {
  const { s, ctx } = newGame();
  rig(s, HANDS, '7D');
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'pass' });
  expect(ids(bidOptions(s, 'p1').map((o) => ({ id: o.call }) as any))).toEqual(['hokm', 'pass', 'sun']);
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'hokm' });
  expect(s.bid!.best).toEqual({ by: 'p1', suit: 'D' });
  expect(bidOptions(s, 'p2').map((o) => o.call)).toEqual(['pass', 'sun', 'ashkal']); // no second حكم
  baloot.act(ctx, s, 'p2', { type: 'bid', call: 'pass' });
  expect(bidOptions(s, 'p3').map((o) => o.call)).toEqual(['pass', 'sun']); // dealer: أشكل only if all passed
  baloot.act(ctx, s, 'p3', { type: 'bid', call: 'pass' });
  expect(s.bid!.stage).toBe('confirm');
  expect(s.bid!.queue).toEqual(['p0', 'p1']);
  expect(turnOf(s)).toEqual(['p0']);
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'pass' });
  expect(bidOptions(s, 'p1').map((o) => o.call)).toEqual(['confirm', 'sun']);
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'confirm' });
  expect(s.contract).toMatchObject({ mode: 'hokm', trump: 'D', buyer: 'p1' });
  expect(s.hands.p1.some((x) => x.id === '7D')).toBe(true); // the buyer took the face-up card
  expect(s.phase).toBe('play');
  expect(s.turn).toBe('p0'); // the dealer's right always leads
});

test('bidding: صن over حكم by someone who passed before', () => {
  const { s, ctx } = newGame();
  rig(s, HANDS, '7D');
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'pass' });
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'hokm' });
  baloot.act(ctx, s, 'p2', { type: 'bid', call: 'pass' });
  baloot.act(ctx, s, 'p3', { type: 'bid', call: 'pass' });
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'sun' });
  expect(s.contract).toMatchObject({ mode: 'sun', trump: null, buyer: 'p0', call: 'sun' });
});

test('bidding: a later صن ends the bidding at once; wrong turn refused', () => {
  const { s, ctx } = newGame();
  rig(s, HANDS, '7D');
  expect(() => baloot.act(ctx, s, 'p2', { type: 'bid', call: 'sun' })).toThrow();
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'hokm' });
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'sun' });
  expect(s.contract).toMatchObject({ mode: 'sun', buyer: 'p1' });
});

test('bidding: أشكل gives the face-up card (and the purchase) to the partner', () => {
  const { s, ctx } = newGame();
  rig(s, HANDS, 'AH');
  rig(s, ['AS KS QS 7H 8H', '10H 9H 9C 8C 7C', 'JD 9D AD 10D KD', 'QH JH 8D AC 10C'], 'AH');
  expect(bidOptions(s, 'p0').map((o) => o.call)).not.toContain('ashkal');
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'pass' });
  expect(bidOptions(s, 'p1').map((o) => o.call)).not.toContain('ashkal');
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'pass' });
  baloot.act(ctx, s, 'p2', { type: 'bid', call: 'ashkal' });
  expect(s.contract).toMatchObject({ mode: 'sun', buyer: 'p0', caller: 'p2', call: 'ashkal' });
  expect(s.hands.p0.some((x) => x.id === 'AH')).toBe(true);
});

test('bidding: the dealer may say أشكل when everyone passed', () => {
  const { s, ctx } = newGame();
  rig(s, HANDS, '7D');
  for (const id of ['p0', 'p1', 'p2']) baloot.act(ctx, s, id, { type: 'bid', call: 'pass' });
  expect(bidOptions(s, 'p3').map((o) => o.call)).toContain('ashkal');
});

test('bidding: round 2 — حكم in another suit, صن overcall, redeal after two passes', () => {
  const { s, ctx } = newGame();
  rig(s, HANDS, '7D');
  for (const id of P) baloot.act(ctx, s, id, { type: 'bid', call: 'pass' });
  expect(s.bid!.round).toBe(2);
  const o = bidOptions(s, 'p0').find((x) => x.call === 'hokm2')!;
  expect(o.suits!.sort()).toEqual(['C', 'H', 'S']);
  expect(() => baloot.act(ctx, s, 'p0', { type: 'bid', call: 'hokm2', suit: 'D' })).toThrow();
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'hokm2', suit: 'S' });
  expect(bidOptions(s, 'p1').map((x) => x.call)).toEqual(['pass', 'sun']);
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'pass' });
  baloot.act(ctx, s, 'p2', { type: 'bid', call: 'pass' });
  baloot.act(ctx, s, 'p3', { type: 'bid', call: 'pass' });
  expect(s.contract).toMatchObject({ mode: 'hokm', trump: 'S', buyer: 'p0' });

  const g = newGame();
  rig(g.s, HANDS, '7D');
  for (const id of P) baloot.act(g.ctx, g.s, id, { type: 'bid', call: 'pass' });
  baloot.act(g.ctx, g.s, 'p0', { type: 'bid', call: 'hokm2', suit: 'S' });
  baloot.act(g.ctx, g.s, 'p1', { type: 'bid', call: 'sun' });
  expect(g.s.contract).toMatchObject({ mode: 'sun', buyer: 'p1' });

  const r = newGame();
  rig(r.s, HANDS, '7D');
  for (let k = 0; k < 8; k++) baloot.act(r.ctx, r.s, P[k % 4], { type: 'bid', call: 'pass' });
  expect(r.s.redealAt).not.toBeNull();
  expect(turnOf(r.s)).toEqual([]);
  r.ctx.now += REDEAL_MS + 1;
  expect(baloot.tick!(r.ctx, r.s)).toBe(true);
  expect(r.s.dealer).toBe(0); // the next dealer deals again
  expect(r.s.hand).toBe(2);
  expect(r.s.bid!.queue[0]).toBe('p1');
});

test('card order and trick winner in صن and حكم', () => {
  // sun: A > 10 > K; off-suit never wins
  expect(trickLeader([{ card: c('KH') }, { card: c('10H') }, { card: c('AS') }, { card: c('QH') }], null)).toBe(1);
  expect(trickLeader([{ card: c('9H') }, { card: c('JH') }, { card: c('AS') }], null)).toBe(1);
  // hokm ♠: J > 9 > A; any trump beats the suit led
  expect(trickLeader([{ card: c('AS') }, { card: c('9S') }, { card: c('JS') }], 'S')).toBe(2);
  expect(trickLeader([{ card: c('AH') }, { card: c('7S') }, { card: c('10H') }], 'S')).toBe(1);
  expect(trickLeader([{ card: c('AH') }, { card: c('7S') }, { card: c('8S') }, { card: c('KH') }], 'S')).toBe(2);
  expect(cardValue(c('JS'), 'S')).toBe(20);
  expect(cardValue(c('9S'), 'S')).toBe(14);
  expect(cardValue(c('JS'), null)).toBe(2);
  expect(cardValue(c('9H'), 'S')).toBe(0);
  const deck = makeBalootDeck();
  expect(deck.length).toBe(32);
  expect(deck.reduce((t, x) => t + cardValue(x, null), 0)).toBe(120);
  expect(deck.reduce((t, x) => t + cardValue(x, 'H'), 0)).toBe(152);
});

test('follow suit and the حكم trumping duties (with the partner exceptions)', () => {
  const T = 'S';
  const hand = cs('KH 7S JS 8D');
  // must follow suit
  expect(ids(legalCards(hand, [{ card: c('AH') }], T))).toEqual(['KH']);
  expect(ids(legalCards(hand, [{ card: c('AH') }], null))).toEqual(['KH']);
  // sun, void: anything
  expect(legalCards(cs('7S 8D'), [{ card: c('AH') }], null).length).toBe(2);
  // hokm, void, opponent holds: must trump
  expect(ids(legalCards(cs('7S JS 8D'), [{ card: c('AH') }], T))).toEqual(['7S', 'JS'].sort());
  // an opponent trumped: must overtrump if able…
  expect(ids(legalCards(cs('7S JS 8D'), [{ card: c('AH') }, { card: c('9S') }], T))).toEqual(['JS']);
  // …otherwise anything
  expect(legalCards(cs('7S 8D'), [{ card: c('AH') }, { card: c('9S') }], T).length).toBe(2);
  // 4th player, partner (2nd) holds: anything
  expect(legalCards(cs('7S 8D'), [{ card: c('7H') }, { card: c('AH') }, { card: c('8H') }], T).length).toBe(2);
  // 3rd player, partner led a plain card that is not the top one left: must still trump
  expect(ids(legalCards(cs('7S 8D'), [{ card: c('KH') }, { card: c('8H') }], T, false))).toEqual(['7S']);
  // …but not when the partner led the ace / the highest card left («إكة»)
  expect(legalCards(cs('7S 8D'), [{ card: c('KH') }, { card: c('8H') }], T, true).length).toBe(2);
  // trump led: overtrump if able
  expect(ids(legalCards(cs('7S JS AH'), [{ card: c('9S') }], T))).toEqual(['JS']);
  expect(ids(legalCards(cs('7S 8S AH'), [{ card: c('9S') }], T))).toEqual(['7S', '8S']);
  // trump led and the partner holds: any trump
  expect(ids(legalCards(cs('7S JS AH'), [{ card: c('9S') }, { card: c('8S') }], T))).toEqual(['7S', 'JS'].sort());
  // no trumps at all: anything
  expect(legalCards(cs('AH 8D'), [{ card: c('9S') }], T).length).toBe(2);
});

test('projects: sequences, fours, values and comparison', () => {
  const kinds = (h: string, m: 'sun' | 'hokm') => findProjects(cs(h), m).map((p) => `${p.kind}:${p.top}`);
  expect(kinds('AH KH QH 7S 8D 9C 10C JD', 'sun')).toEqual(['sira:A']);
  expect(kinds('KH QH JH 10H 8D 9C 7C JD', 'hokm')).toEqual(['fifty:K']);
  expect(kinds('KH QH JH 10H 9H 8D 9C 7C', 'hokm')).toEqual(['hundred:K']);
  expect(kinds('AH KH QH JH 10H 9H 8H 7H', 'sun')).toEqual(['hundred:A', 'sira:9']); // 5 + 3
  expect(kinds('KH KS KD KC 7H 8D 9C 7C', 'sun')).toEqual(['hundred:K']);
  expect(kinds('9H 9S 9D 9C 7H 8D JC 7C', 'sun')).toEqual([]); // four 9s count nothing
  expect(kinds('AH AS AD AC 7H 8D JC 7C', 'sun')).toEqual(['four100:A']);
  expect(kinds('AH AS AD AC 7H 8D JC 7C', 'hokm')).toEqual(['hundred:A']);
  expect(projectPoints('sira', 'sun')).toBe(4);
  expect(projectPoints('sira', 'hokm')).toBe(2);
  expect(projectPoints('fifty', 'sun')).toBe(10);
  expect(projectPoints('fifty', 'hokm')).toBe(5);
  expect(projectPoints('hundred', 'sun')).toBe(20);
  expect(projectPoints('hundred', 'hokm')).toBe(10);
  expect(projectPoints('four100', 'sun')).toBe(40);

  const side = (id: string) => (id === 'p0' || id === 'p2' ? 'A' : 'B') as 'A' | 'B';
  const order = ['p1', 'p2', 'p3', 'p0'];
  const pr = (h: string) => findProjects(cs(h), 'sun')[0];
  // higher kind wins
  expect(bestProjectSide([{ by: 'p1', project: pr('AH KH QH') }, { by: 'p0', project: pr('9S 8S 7S 10S') }], order, side)).toBe('A');
  // same kind: higher top card wins
  expect(bestProjectSide([{ by: 'p1', project: pr('QH JH 10H') }, { by: 'p2', project: pr('AS KS QS') }], order, side)).toBe('A');
  // equal: the one who played earlier in the first trick
  expect(bestProjectSide([{ by: 'p2', project: pr('QH JH 10H') }, { by: 'p1', project: pr('QS JS 10S') }], order, side)).toBe('B');
  // a four of a kind beats a 5-card sequence
  expect(bestProjectSide([{ by: 'p1', project: pr('AH KH QH JH 10H') }, { by: 'p0', project: pr('10S 10H 10D 10C') }], order, side)).toBe('A');
  expect(bestProjectSide([], order, side)).toBeNull();
});

test('«بلوت»: K + Q of trumps, announced with the second card; blocked by a 100 holding them', () => {
  expect(balootBlocked(findProjects(cs('KS QS JS 10S 9S'), 'hokm'), 'S')).toBe(true);
  expect(balootBlocked(findProjects(cs('KS QS JS'), 'hokm'), 'S')).toBe(false);
  expect(balootBlocked(findProjects(cs('KS KH KD KC'), 'hokm'), 'S')).toBe(true);

  const { s, ctx, said } = newGame();
  rig(s, ['KS QS 7H 8H 9H', 'AH 10H 9C 8C 7C', 'JD 9D AD 10D KD', 'QH JH AC 10C 8D'], '7S');
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'hokm' });
  for (const id of ['p1', 'p2', 'p3']) baloot.act(ctx, s, id, { type: 'bid', call: 'pass' });
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'confirm' });
  expect(s.balootHolder).toBe('p0');
  // p0 leads K♠ then (later) Q♠
  s.hands.p0 = cs('KS QS 7H 8H 9H 7S AS 10S');
  baloot.act(ctx, s, 'p0', { type: 'play', card: 'KS', declare: [] });
  expect(s.baloot).toEqual([]);
  s.trick = [];
  s.turn = 'p0';
  baloot.act(ctx, s, 'p0', { type: 'play', card: 'QS' });
  expect(s.baloot).toEqual(['p0']);
  expect(said.some((t) => t.includes('بلوت'))).toBe(true);
});

test('abnat → points: the standard rounding', () => {
  expect(abnatToPoints(65, 'hokm')).toBe(6);
  expect(abnatToPoints(66, 'hokm')).toBe(7);
  expect(abnatToPoints(56, 'hokm')).toBe(6);
  expect(abnatToPoints(45, 'hokm')).toBe(4);
  expect(abnatToPoints(162, 'hokm')).toBe(16);
  expect(abnatToPoints(64, 'sun')).toBe(12);
  expect(abnatToPoints(65, 'sun')).toBe(13);
  expect(abnatToPoints(66, 'sun')).toBe(14);
  expect(abnatToPoints(35, 'sun')).toBe(7);
  expect(abnatToPoints(130, 'sun')).toBe(26);
});

test('scoring: normal hand, خسرانة, tie to the buyers, كبوت, doubling', () => {
  const zero = { A: 0, B: 0 };
  // sun, buyers (A) win 80–50: defenders 50 → 10, buyers 26 − 10 = 16
  expect(scoreHand({ mode: 'sun', buyerSide: 'A', abnat: { A: 80, B: 50 }, tricks: { A: 5, B: 3 }, projects: zero, baloot: zero, mult: 1 })).toMatchObject({
    points: { A: 16, B: 10 },
    failed: false,
  });
  // hokm, buyers keep their projects
  expect(scoreHand({ mode: 'hokm', buyerSide: 'B', abnat: { A: 60, B: 102 }, tricks: { A: 3, B: 5 }, projects: { A: 0, B: 5 }, baloot: { A: 2, B: 0 }, mult: 1 }).points).toEqual({ A: 8, B: 15 });
  // خسرانة: the defenders take everything (16 + projects + بلوت)
  const lost = scoreHand({ mode: 'hokm', buyerSide: 'A', abnat: { A: 50, B: 112 }, tricks: { A: 3, B: 5 }, projects: { A: 2, B: 0 }, baloot: { A: 2, B: 0 }, mult: 1 });
  expect(lost).toMatchObject({ failed: true, points: { A: 0, B: 20 }, winner: 'B' });
  // projects can save the buyers: 70 + 20 (سرا) + 20 (بلوت) = 110 ≥ 92
  expect(scoreHand({ mode: 'hokm', buyerSide: 'A', abnat: { A: 70, B: 92 }, tricks: { A: 3, B: 5 }, projects: { A: 2, B: 0 }, baloot: { A: 2, B: 0 }, mult: 1 }).failed).toBe(false);
  expect(scoreHand({ mode: 'hokm', buyerSide: 'A', abnat: { A: 72, B: 90 }, tricks: { A: 3, B: 5 }, projects: { A: 0, B: 0 }, baloot: { A: 2, B: 0 }, mult: 1 }).failed).toBe(false);
  expect(scoreHand({ mode: 'hokm', buyerSide: 'A', abnat: { A: 72, B: 90 }, tricks: { A: 3, B: 5 }, projects: { A: 0, B: 0 }, baloot: { A: 0, B: 0 }, mult: 1 }).failed).toBe(true);
  // a tie goes to the buyers
  expect(scoreHand({ mode: 'hokm', buyerSide: 'A', abnat: { A: 81, B: 81 }, tricks: { A: 4, B: 4 }, projects: zero, baloot: zero, mult: 1 })).toMatchObject({ failed: false, points: { A: 8, B: 8 } });
  expect(scoreHand({ mode: 'sun', buyerSide: 'B', abnat: { A: 65, B: 65 }, tricks: { A: 4, B: 4 }, projects: zero, baloot: zero, mult: 1 })).toMatchObject({ failed: false, points: { A: 13, B: 13 } });
  // كبوت: 44 in sun, 25 in hokm, plus projects
  expect(scoreHand({ mode: 'sun', buyerSide: 'A', abnat: { A: 130, B: 0 }, tricks: { A: 8, B: 0 }, projects: { A: 4, B: 0 }, baloot: zero, mult: 1 })).toMatchObject({ kaboot: 'A', points: { A: 48, B: 0 } });
  expect(scoreHand({ mode: 'hokm', buyerSide: 'A', abnat: { A: 0, B: 162 }, tricks: { A: 0, B: 8 }, projects: zero, baloot: zero, mult: 1 })).toMatchObject({ kaboot: 'B', failed: true, points: { A: 0, B: 25 } });
  // doubled: the winners take 16 × mult + projects × 2 + بلوت
  expect(scoreHand({ mode: 'hokm', buyerSide: 'A', abnat: { A: 100, B: 62 }, tricks: { A: 5, B: 3 }, projects: { A: 5, B: 0 }, baloot: { A: 2, B: 0 }, mult: 2 }).points).toEqual({ A: 32 + 10 + 2, B: 0 });
  expect(scoreHand({ mode: 'hokm', buyerSide: 'A', abnat: { A: 60, B: 102 }, tricks: { A: 3, B: 5 }, projects: zero, baloot: zero, mult: 3 }).points).toEqual({ A: 0, B: 48 });
  expect(scoreHand({ mode: 'hokm', buyerSide: 'A', abnat: { A: 100, B: 62 }, tricks: { A: 5, B: 3 }, projects: zero, baloot: zero, mult: 4 }).points).toEqual({ A: 64, B: 0 });
  expect(scoreHand({ mode: 'sun', buyerSide: 'B', abnat: { A: 50, B: 80 }, tricks: { A: 3, B: 5 }, projects: zero, baloot: zero, mult: 2 }).points).toEqual({ A: 0, B: 52 });
  expect(scoreHand({ mode: 'sun', buyerSide: 'B', abnat: { A: 0, B: 130 }, tricks: { A: 0, B: 8 }, projects: zero, baloot: zero, mult: 2 }).points).toEqual({ A: 0, B: 88 });
});

test('doubling: دبل ← ثري ← فور ← قهوة in حكم; صن only above 100 vs below 100', () => {
  const { s, ctx } = newGame({ doubling: true });
  rig(s, HANDS, '7D');
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'hokm' });
  for (const id of ['p1', 'p2', 'p3']) baloot.act(ctx, s, id, { type: 'bid', call: 'pass' });
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'confirm' });
  expect(s.phase).toBe('double');
  expect(turnOf(s)).toEqual(['p1']); // the defender on the buyer's right first
  expect(() => baloot.act(ctx, s, 'p1', { type: 'raise', raise: 'triple' })).toThrow();
  baloot.act(ctx, s, 'p1', { type: 'raise', raise: 'pass' });
  baloot.act(ctx, s, 'p3', { type: 'raise', raise: 'double' });
  expect(s.contract!.mult).toBe(2);
  expect(turnOf(s)).toEqual(['p0']);
  baloot.act(ctx, s, 'p0', { type: 'raise', raise: 'triple' });
  expect(turnOf(s)).toEqual(['p3']);
  baloot.act(ctx, s, 'p3', { type: 'raise', raise: 'four' });
  baloot.act(ctx, s, 'p0', { type: 'raise', raise: 'gahwa' });
  expect(s.contract).toMatchObject({ mult: 4, gahwa: true });
  expect(s.phase).toBe('play');

  // sun: no doubling at 0–0
  const g = newGame({ doubling: true });
  rig(g.s, HANDS, '7D');
  baloot.act(g.ctx, g.s, 'p0', { type: 'bid', call: 'sun' });
  expect(g.s.phase).toBe('play');
  // sun: buyers over 100, defenders under 100 → دبل only
  const h = newGame({ doubling: true });
  h.s.scores = { A: 110, B: 60 };
  rig(h.s, HANDS, '7D');
  baloot.act(h.ctx, h.s, 'p0', { type: 'bid', call: 'sun' });
  expect(h.s.phase).toBe('double');
  baloot.act(h.ctx, h.s, 'p1', { type: 'raise', raise: 'double' });
  expect(h.s.contract!.mult).toBe(2);
  expect(h.s.phase).toBe('play');
  // doubling off in the settings
  const k = newGame({ doubling: false });
  rig(k.s, HANDS, '7D');
  baloot.act(k.ctx, k.s, 'p0', { type: 'bid', call: 'hokm' });
  for (const id of ['p1', 'p2', 'p3']) baloot.act(k.ctx, k.s, id, { type: 'bid', call: 'pass' });
  baloot.act(k.ctx, k.s, 'p0', { type: 'bid', call: 'confirm' });
  expect(k.s.phase).toBe('play');
});

/** Let the bots play (and the clock run) until `until` is true. */
function run(g: ReturnType<typeof newGame>, until: () => boolean, max = 5000) {
  for (let i = 0; i < max && !until(); i++) {
    baloot.botPlan!(g.ctx, g.s, P);
    const job = g.jobs.shift();
    // «الباقي لنا» is left aside here: these hands are played to the end (claims: claim.test.ts)
    if (job?.a.type === 'claim') {
      g.jobs.length = 0;
      g.s.claim = null;
      continue;
    }
    if (job) {
      g.jobs.length = 0;
      try {
        baloot.act(g.ctx, g.s, job.by, job.a);
      } catch {
        // stale move: plan again
      }
      continue;
    }
    g.ctx.now += 500;
    baloot.tick!(g.ctx, g.s);
  }
}

test('a full hand: abnat add up to 130 (صن) / 162 (حكم), 8 tricks, projects shown on trick 2', () => {
  for (const mode of ['sun', 'hokm'] as const) {
    for (let k = 0; k < 10; k++) {
      const g = newGame();
      const first = g.s.bid!.queue[0];
      if (mode === 'sun') baloot.act(g.ctx, g.s, first, { type: 'bid', call: 'sun' });
      else {
        baloot.act(g.ctx, g.s, first, { type: 'bid', call: 'hokm' });
        for (const id of g.s.bid!.queue.slice()) baloot.act(g.ctx, g.s, id, { type: 'bid', call: 'pass' });
        while (g.s.phase === 'bid') baloot.act(g.ctx, g.s, g.s.bid!.queue[0], { type: 'bid', call: g.s.bid!.queue[0] === first ? 'confirm' : 'pass' });
      }
      let sawShown = false;
      run(g, () => {
        if (g.s.trickNo === 2 && g.s.shown) sawShown = true;
        return g.s.phase === 'handEnd' || g.s.phase === 'final';
      });
      const r = g.s.result!;
      expect(r.abnat.A + r.abnat.B).toBe(mode === 'sun' ? 130 : 162);
      expect(r.tricks.A + r.tricks.B).toBe(8);
      const anyDeclared = Object.values(g.s.declared).some((d) => d.length);
      expect(sawShown).toBe(anyDeclared);
      if (!r.kaboot && g.s.contract!.mult === 1 && !r.failed) {
        expect(r.points.A + r.points.B).toBe((mode === 'sun' ? 26 : 16) + r.projects.A + r.projects.B + r.baloot.A + r.baloot.B);
      }
      for (const id of P) expect(g.s.hands[id].length).toBe(0);
    }
  }
});

test('the projects a player declares with the first card are scored for the best team', () => {
  const { s, ctx } = newGame();
  rig(s, ['AS KS QS 7H 8H', 'AH 10H 9C 8C 7C', 'JD 9D AD 10D KD', 'QH JH 9H AC 10C'], '7D');
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'sun' });
  // p0: A K Q ♠ (سرا) — p2: J 9 A 10 K ♦… → may hold more after the deal; force known hands
  s.hands.p0 = cs('AS KS QS 7H 8H 7D 8D 9S');
  s.hands.p1 = cs('AH 10H 9C 8C 7C JS 10S 8S');
  s.hands.p2 = cs('JD 9D AD 10D KD QD 7S QC');
  s.hands.p3 = cs('QH JH 9H AC 10C KH KC JC');
  for (const id of P) s.avail[id] = findProjects(s.hands[id], 'sun');
  expect(s.avail.p2.map((p) => p.kind)).toEqual(['hundred']); // A K Q J 10 ♦
  const v = vw(ctx, s, 'p0');
  expect(v.myProjects.map((p) => p.kind)).toEqual(['sira']);
  baloot.act(ctx, s, 'p0', { type: 'play', card: '7H', declare: v.myProjects.map((p) => p.key) });
  baloot.act(ctx, s, 'p1', { type: 'play', card: 'AH', declare: [] });
  baloot.act(ctx, s, 'p2', { type: 'play', card: '7S', declare: s.avail.p2.map(projectKey) });
  expect(vw(ctx, s, 'p1').declared.map((d) => [d.by, d.kind, d.cards])).toEqual([
    ['p0', 'sira', undefined],
    ['p2', 'hundred', undefined],
  ]); // names only on the first trick
  baloot.act(ctx, s, 'p3', { type: 'play', card: 'QH', declare: [] });
  ctx.now += TRICK_PAUSE_MS;
  baloot.tick!(ctx, s);
  expect(s.trickNo).toBe(2);
  expect(s.projPoints).toEqual({ A: 24, B: 0 }); // both of team A's projects: 20 + 4
  const shown = vw(ctx, s, 'p1').shown!;
  expect(shown.side).toBe('A');
  expect(shown.items.every((i) => i.cards && i.cards.length >= 3)).toBe(true);
});

test('turns: the turn bar is exact in every phase and empty during pauses', () => {
  const g = newGame();
  expect(turnOf(g.s)).toEqual([g.s.bid!.queue[0]]);
  run(g, () => g.s.phase === 'play' && g.s.trick.length === 4);
  expect(g.s.pauseUntil).not.toBeNull();
  expect(turnOf(g.s)).toEqual([]);
  expect(vw(g.ctx, g.s, 'p0').trick.length).toBe(4); // the full trick stays visible
  expect(TRICK_PAUSE_MS).toBeGreaterThanOrEqual(2200);
  g.ctx.now += TRICK_PAUSE_MS - 100;
  expect(baloot.tick!(g.ctx, g.s)).toBe(false);
  g.ctx.now += 200;
  baloot.tick!(g.ctx, g.s);
  expect(turnOf(g.s)).toEqual([g.s.lastTrick!.winner]);
  run(g, () => g.s.phase === 'handEnd' || g.s.phase === 'final');
  expect(turnOf(g.s)).toEqual([]);
});

test('hidden information: only my own hand; legal cards only on my turn', () => {
  const g = newGame();
  const v = vw(g.ctx, g.s, 'p1');
  expect(v.myHand.length).toBe(5);
  expect(JSON.stringify(v)).not.toContain(g.s.hands.p0[0].id + '"'); // nobody else's cards
  expect(v.counts).toEqual({ p0: 5, p1: 5, p2: 5, p3: 5 });
  expect(v.faceUp).toEqual(g.s.faceUp);
});

test('timer: when time runs out the computer passes / plays for the player', () => {
  const g = newGame({ timer: 20 });
  const first = g.s.bid!.queue[0];
  expect(g.s.deadline).toBe(g.ctx.now + 20_000);
  g.ctx.now += 20_001;
  expect(baloot.tick!(g.ctx, g.s)).toBe(true);
  expect(g.s.bid!.calls[first]).toEqual({ call: 'pass' });
  const next = g.s.bid!.queue[0];
  baloot.act(g.ctx, g.s, next, { type: 'bid', call: 'sun' });
  expect(g.s.phase).toBe('play');
  const leader = g.s.turn!;
  g.ctx.now += 20_001;
  baloot.tick!(g.ctx, g.s);
  expect(g.s.trick.length).toBe(1);
  expect(g.s.trick[0].by).toBe(leader);
});

test('end of the game at the target; قهوة ends it at once; host can deal the next hand', () => {
  const g = newGame({ target: 100 });
  g.s.scores = { A: 95, B: 40 };
  run(g, () => g.s.phase === 'handEnd' || g.s.phase === 'final');
  if (g.s.phase === 'final') expect(Math.max(g.s.scores.A, g.s.scores.B)).toBeGreaterThanOrEqual(100);
  else {
    expect(g.s.nextAt! - g.ctx.now).toBeLessThanOrEqual(HAND_END_MS);
    const hand = g.s.hand;
    baloot.act(g.ctx, g.s, 'p0', { type: 'next' });
    expect(g.s.hand).toBe(hand + 1);
  }
  expect(baloot.hostOnly).toContain('next');

  const q = newGame({ doubling: true });
  rig(q.s, HANDS, '7D');
  baloot.act(q.ctx, q.s, 'p0', { type: 'bid', call: 'hokm' });
  for (const id of ['p1', 'p2', 'p3']) baloot.act(q.ctx, q.s, id, { type: 'bid', call: 'pass' });
  baloot.act(q.ctx, q.s, 'p0', { type: 'bid', call: 'confirm' });
  baloot.act(q.ctx, q.s, 'p1', { type: 'raise', raise: 'double' });
  baloot.act(q.ctx, q.s, 'p0', { type: 'raise', raise: 'triple' });
  baloot.act(q.ctx, q.s, 'p1', { type: 'raise', raise: 'four' });
  baloot.act(q.ctx, q.s, 'p0', { type: 'raise', raise: 'gahwa' });
  run(q, () => q.s.phase === 'handEnd' || q.s.phase === 'final');
  expect(q.s.phase).toBe('final');
  expect(q.s.winner).toBe(q.s.result!.winner);
});

test('a full bot-only game reaches the final, scores add up, says are short and gender-neutral', () => {
  for (const level of [1, 2]) {
    const g = newGame({ doubling: true, level, target: 152 });
    run(g, () => g.s.phase === 'final', 200_000);
    expect(g.s.phase).toBe('final');
    expect(g.s.winner).not.toBeNull();
    const sum = g.s.history.reduce((t, r) => ({ A: t.A + r.A, B: t.B + r.B }), { A: 0, B: 0 });
    expect(sum).toEqual(g.s.scores);
    const w = g.s.winner!;
    expect(g.s.scores[w]).toBeGreaterThanOrEqual(152);
    // no verb conjugated for a player (we don't know if they are a man or a woman)
    const VERBS = ['لعب', 'لعبت', 'اشترى', 'اشترت', 'قال', 'قالت', 'أخذ', 'أخذت', 'ربح', 'ربحت', 'فاز', 'فازت', 'مرّر', 'مرر', 'ضاعف', 'أعلن', 'أعلنت', 'دبّل'];
    for (const t of g.said) {
      const words = t.split(/[\s:،—()!+]+/);
      for (const v of VERBS) expect(words).not.toContain(v);
      expect(t.length).toBeLessThanOrEqual(90);
    }
    expect(g.said.some((t) => t.startsWith('ورقة من '))).toBe(true);
    expect(g.said.some((t) => t.startsWith('شراء لـ') || t.startsWith('أشكل من '))).toBe(true);
  }
}, 60_000);

test('decide: bots always make a legal move', () => {
  for (let k = 0; k < 20; k++) {
    const g = newGame({ doubling: true });
    run(g, () => {
      const id = turnOf(g.s)[0];
      if (id && g.s.phase === 'play') {
        const a = decide(g.s, id, 2)!;
        expect(g.s.hands[id].some((x) => x.id === a.card)).toBe(true);
        expect(legalCards(g.s.hands[id], g.s.trick, g.s.contract!.trump, g.s.leadBoss).some((x) => x.id === a.card)).toBe(true);
      }
      return g.s.phase === 'handEnd' || g.s.phase === 'final';
    });
  }
}, 60_000);

test('onLeave: a seat that disappears ends the game cleanly; settings are validated', () => {
  const g = newGame();
  baloot.onLeave!(g.ctx, g.s, 'someone-else');
  expect(g.s.phase).toBe('bid');
  baloot.onLeave!(g.ctx, g.s, 'p2');
  expect(g.s.phase).toBe('final');
  expect(turnOf(g.s)).toEqual([]);

  const st = { target: 152, timer: 0, doubling: true, level: 2 };
  baloot.patchSettings!(st, { target: 77, timer: 99, doubling: 'x', level: 5 });
  expect(st).toEqual({ target: 152, timer: 0, doubling: true, level: 2 });
  baloot.patchSettings!(st, { target: 100, timer: 30, doubling: false, level: 1 });
  expect(st).toEqual({ target: 100, timer: 30, doubling: false, level: 1 });
  expect(() => baloot.start(fakeCtx().ctx, ['a', 'b', 'c'], st)).toThrow();
});
