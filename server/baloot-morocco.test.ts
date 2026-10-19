/** «البلوط» — the Moroccan mode (النمط المغربي): deck, purchase, play duties, announcements, belote, scoring, game end, bots. */
import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  annKey,
  bestAnnSide,
  findAnnouncements,
  maCardLabel,
  maLegal,
  maScoreHand,
  maSuitName,
  toSpanish,
  type Ann,
} from '../src/shared/baloot-morocco';
import { cardValue, makeBalootDeck, trickLeader } from '../src/shared/baloot-rules';
import type { BalootView, BCard, BRank, BSuit } from '../src/shared/games/baloot';
import { BALOOT_DEFAULTS } from '../src/shared/games/baloot';
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
  };
  return { ctx, said, jobs };
}

const c = (id: string): BCard => ({ id, suit: id.slice(-1) as BSuit, rank: id.slice(0, -1) as BRank });
const cs = (s: string) => s.split(' ').map(c);
const ids = (cards: BCard[]) => cards.map((x) => x.id).sort();
const T = (...xs: string[]) => xs.map((x) => ({ card: c(x) }));

function newGame(settings: Partial<State['settings']> = {}) {
  const f = fakeCtx();
  const s = baloot.start(f.ctx, P, { mode: 'morocco', target: 1000, timer: 0, doubling: true, level: 2, ...settings });
  return { ...f, s };
}

/** Force the deal: dealer seat 3 (so p0 speaks first), given 5-card hands and face-up card. */
function rig(s: State, hands: string[], faceUp: string) {
  s.dealer = 3;
  const used = new Set([...hands.flatMap((h) => h.split(' ')), faceUp]);
  s.hands = Object.fromEntries(P.map((id, i) => [id, cs(hands[i])]));
  s.faceUp = c(faceUp);
  s.stock = makeBalootDeck().filter((x) => !used.has(x.id));
  s.bid = { round: 1, stage: 'main', order: P.slice(), queue: P.slice(), calls: {}, best: null };
}

const HANDS = ['AS KS QS 7H 8H', 'AH 10H 9C 8C 7C', 'JD 9D AD 10D KD', 'QH JH 9H AC 10C'];

function run(g: ReturnType<typeof newGame>, until: () => boolean, max = 5000) {
  for (let i = 0; i < max && !until(); i++) {
    baloot.botPlan!(g.ctx, g.s, P);
    const job = g.jobs.shift();
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

/** Put given 8-card hands in play after p0 bought (trump = the face-up suit). */
function playWith(hands: string[], faceUp = '7D') {
  const g = newGame();
  rig(g.s, HANDS, faceUp);
  baloot.act(g.ctx, g.s, 'p0', { type: 'bid', call: 'hokm' });
  g.s.hands = Object.fromEntries(P.map((id, i) => [id, cs(hands[i])]));
  const trump = g.s.contract!.trump!;
  for (const id of P) g.s.maAvail[id] = findAnnouncements(g.s.hands[id], trump);
  g.s.balootHolder = P.find((id) => ['K', 'Q'].every((r) => g.s.hands[id].some((x) => x.suit === trump && x.rank === r))) ?? null;
  return g;
}

/** Bots play until the 8th trick is complete (its points counted), just before the hand is scored. */
function toLastTrick(g: ReturnType<typeof newGame>) {
  run(g, () => g.s.phase === 'play' && g.s.trickNo === 8 && g.s.trick.length === 4);
  expect(g.s.pauseUntil).not.toBeNull();
}

/** What the hand about to end will score (the same numbers the server will use). */
function scoreNow(g: ReturnType<typeof newGame>) {
  const side = (id: string) => (g.s.sides[0].members.includes(id) ? 'A' : 'B');
  const belote = { A: 0, B: 0 };
  for (const id of g.s.baloot) belote[side(id)] += 20;
  return maScoreHand({ buyerSide: side(g.s.contract!.buyer), cards: g.s.abnat, tricks: g.s.tricks, ann: g.s.projPoints, belote, pot: g.s.pot });
}

/** Finish the trick in progress and start the next one. */
function collect(g: ReturnType<typeof newGame>) {
  g.ctx.now += TRICK_PAUSE_MS;
  baloot.tick!(g.ctx, g.s);
}

test('deck: the Moroccan 32 cards (1, 4, 5, 6, 7, 10, 11, 12 — no 2s or 3s), each with its card image', () => {
  const deck = makeBalootDeck().map(toSpanish);
  expect(new Set(deck.map((x) => x.id)).size).toBe(32);
  expect([...new Set(deck.map((x) => x.rank))].sort((a, b) => a - b)).toEqual([1, 4, 5, 6, 7, 10, 11, 12]);
  expect(new Set(deck.map((x) => x.suit))).toEqual(new Set(['swords', 'cups', 'coins', 'clubs']));
  for (const x of deck) expect(existsSync(join(import.meta.dir, '..', 'assets/art/cards', `${x.id}.webp`))).toBe(true);
  // A = 1, 7 = 4, 8 = 5, 9 = 6, 10 = 7, J = 10, Q = 11, K = 12
  expect(['AH', '7H', '8H', '9H', '10H', 'JH', 'QH', 'KH'].map((x) => toSpanish(c(x)).rank)).toEqual([1, 4, 5, 6, 7, 10, 11, 12]);
  expect(maCardLabel(c('10C'))).toBe('7 باسطوص');
  expect(maCardLabel(c('9H'))).toBe('6 كوباص');
  expect(['S', 'H', 'D', 'C'].map((x) => maSuitName(x as BSuit))).toEqual(['شباضا', 'الكوباص', 'أوروص', 'الباسطوص']);
});

test('deal: 5 cards each and one face up; «أشتري» or pass from the dealer\'s right; 8 each after the purchase', () => {
  const { s, ctx, said } = newGame();
  for (const id of P) expect(s.hands[id].length).toBe(5);
  expect(s.faceUp).not.toBeNull();
  expect(s.stock.length).toBe(11);
  const first = s.bid!.queue[0];
  expect(first).toBe(P[(s.dealer + 1) % 4]);
  if (s.faceUp!.rank !== 'J') expect(bidOptions(s, first).map((o) => o.call)).toEqual(['pass', 'hokm']);
  expect(bidOptions(s, first).map((o) => o.call)).not.toContain('sun');
  expect(said[0]).toContain('الورقة المكشوفة');
  const up = s.faceUp!;
  baloot.act(ctx, s, first, { type: 'bid', call: 'hokm' });
  for (const id of P) expect(s.hands[id].length).toBe(8);
  expect(s.stock.length).toBe(0);
  expect(s.hands[first].some((x) => x.id === up.id)).toBe(true);
  expect(s.contract).toMatchObject({ mode: 'hokm', trump: up.suit, buyer: first, mult: 1 });
  expect(s.phase).toBe('play'); // no doubling in this mode
  expect(s.turn).toBe(first);
  expect(said.at(-1)).toBe(`الشاري: ${ctx.playerName(first)} — الطرونفو: ${maSuitName(up.suit)}${up.rank === 'J' ? ' (الفورص)' : ''}`);
});

test('purchase turn 1: passes, then the first «أشتري» ends it', () => {
  const { s, ctx } = newGame();
  rig(s, HANDS, '7D');
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'pass' });
  expect(() => baloot.act(ctx, s, 'p2', { type: 'bid', call: 'hokm' })).toThrow(); // not p2's turn
  expect(() => baloot.act(ctx, s, 'p1', { type: 'bid', call: 'sun' })).toThrow(); // no صن
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'hokm' });
  expect(s.contract).toMatchObject({ trump: 'D', buyer: 'p1' });
  expect(s.hands.p1.some((x) => x.id === '7D')).toBe(true);
  expect(s.turn).toBe('p0'); // the dealer's right leads
});

test('purchase turn 2: another suit or pass; everyone passes twice → the next player deals', () => {
  const { s, ctx } = newGame();
  rig(s, HANDS, '7D');
  for (const id of P) baloot.act(ctx, s, id, { type: 'bid', call: 'pass' });
  expect(s.bid!.round).toBe(2);
  const o = bidOptions(s, 'p0').find((x) => x.call === 'hokm2')!;
  expect(o.suits!.sort()).toEqual(['C', 'H', 'S']);
  expect(bidOptions(s, 'p0').map((x) => x.call)).toEqual(['pass', 'hokm2']);
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'pass' });
  expect(() => baloot.act(ctx, s, 'p1', { type: 'bid', call: 'hokm2', suit: 'D' })).toThrow(); // the face-up suit
  expect(() => baloot.act(ctx, s, 'p1', { type: 'bid', call: 'hokm' })).toThrow();
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'hokm2', suit: 'S' });
  expect(s.contract).toMatchObject({ trump: 'S', buyer: 'p1' });
  expect(s.hands.p1.some((x) => x.id === '7D')).toBe(true); // the taker still takes the face-up card

  const r = newGame();
  rig(r.s, HANDS, '7D');
  for (let k = 0; k < 8; k++) baloot.act(r.ctx, r.s, P[k % 4], { type: 'bid', call: 'pass' });
  expect(r.s.redealAt).not.toBeNull();
  expect(turnOf(r.s)).toEqual([]);
  expect(r.said.at(-1)).toBe('لا شراء — توزيع جديد');
  r.ctx.now += REDEAL_MS + 1;
  expect(baloot.tick!(r.ctx, r.s)).toBe(true);
  expect(r.s.dealer).toBe(0);
  expect(r.s.hand).toBe(2);
  expect(r.s.bid!.queue[0]).toBe('p1');
});

test('الفورص: a face-up Jack must be taken by the first player (also when the time runs out)', () => {
  const { s, ctx, said } = newGame();
  rig(s, HANDS, 'JS');
  expect(bidOptions(s, 'p0').map((o) => o.call)).toEqual(['hokm']);
  expect(() => baloot.act(ctx, s, 'p0', { type: 'bid', call: 'pass' })).toThrow();
  expect(decide(s, 'p0', 2, true)).toEqual({ type: 'bid', call: 'hokm' });
  expect(decide(s, 'p0', 1)).toEqual({ type: 'bid', call: 'hokm' });
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'hokm' });
  expect(s.contract).toMatchObject({ trump: 'S', buyer: 'p0' });
  expect(said.at(-1)).toContain('(الفورص)');
  // a face-up card other than a Jack: the first player may pass
  const g = newGame();
  rig(g.s, HANDS, '10S');
  expect(bidOptions(g.s, 'p0').map((o) => o.call)).toEqual(['pass', 'hokm']);
});

test('ranks and points: J 20, 9 14, A 11, 10 10, K 4, Q 3 in trumps; A 11, 10 10, K 4, Q 3, J 2 elsewhere; 152 + 10', () => {
  const val = (x: string) => cardValue(c(x), 'H');
  expect(['JH', '9H', 'AH', '10H', 'KH', 'QH', '8H', '7H'].map(val)).toEqual([20, 14, 11, 10, 4, 3, 0, 0]);
  expect(['AS', '10S', 'KS', 'QS', 'JS', '9S', '8S', '7S'].map(val)).toEqual([11, 10, 4, 3, 2, 0, 0, 0]);
  expect(makeBalootDeck().reduce((t, x) => t + cardValue(x, 'H'), 0)).toBe(152);
  // trump order J > 9 > A > 10 > K > Q > 8 > 7; plain A > 10 > K > Q > J > 9
  expect(trickLeader(T('AH', '9H', 'JH', '10H'), 'H')).toBe(2);
  expect(trickLeader(T('JS', 'QS', 'AS', '10S'), 'H')).toBe(2);
  expect(trickLeader(T('AS', '7H', 'KS', 'QS'), 'H')).toBe(1); // any trump beats the suit led
  expect(trickLeader(T('9S', 'AD', 'JS', '8S'), 'H')).toBe(2); // off-suit never wins
  for (let k = 0; k < 6; k++) {
    const g = newGame();
    run(g, () => g.s.phase === 'handEnd' || g.s.phase === 'final');
    const r = g.s.result!;
    expect(r.abnat.A + r.abnat.B).toBe(162);
    expect(r.tricks.A + r.tricks.B).toBe(8);
    for (const id of P) expect(g.s.hands[id].length).toBe(0);
  }
});

test('play duties: follow suit; void → trump (over a trump on the table), partner holding → anything', () => {
  const hand = cs('AS 7S JH 7H KD');
  // follow suit (even when someone trumped)
  expect(ids(maLegal(hand, T('10S'), 'H'))).toEqual(['7S', 'AS']);
  expect(ids(maLegal(hand, T('10S', '8H'), 'H'))).toEqual(['7S', 'AS']);
  // void in ♣, an opponent holds the trick, no trump yet → must trump
  expect(ids(maLegal(hand, T('AC'), 'H'))).toEqual(['7H', 'JH']);
  expect(ids(maLegal(hand, T('7C', 'AC'), 'H'))).toEqual(['7H', 'JH']); // the opponent (2nd card) holds it
  // an opponent trumped with the 9 → over-trump if you can (only the J)
  expect(ids(maLegal(hand, T('KC', '9H'), 'H'))).toEqual(['JH']);
  // can't go over the trump on the table → any card
  const low = cs('AS 7H 8H KD');
  expect(ids(maLegal(low, T('KC', '9H'), 'H'))).toEqual(ids(low));
  // partner holds the trick → any card (with or without a trump on the table)
  expect(ids(maLegal(hand, T('AC', '7C'), 'H'))).toEqual(ids(hand));
  expect(ids(maLegal(hand, T('8C', '9H', '7C'), 'H'))).toEqual(ids(hand));
  // no trump in hand → anything
  const noTrump = cs('AS 7S KD');
  expect(ids(maLegal(noTrump, T('AC'), 'H'))).toEqual(ids(noTrump));
  // trump led: a higher trump if you can — even when the partner holds the trick
  const tr = cs('JH 8H AS');
  expect(ids(maLegal(tr, T('9H'), 'H'))).toEqual(['JH']);
  expect(ids(maLegal(tr, T('KH', '7H'), 'H'))).toEqual(['JH']); // partner (1st card) holds, still over
  expect(ids(maLegal(cs('8H 7H AS'), T('9H'), 'H'))).toEqual(['7H', '8H']); // can't go over: any trump
  expect(ids(maLegal(cs('AS KD'), T('9H'), 'H'))).toEqual(['AS', 'KD']);
  // leading: anything
  expect(maLegal(hand, [], 'H').length).toBe(5);
});

test('play duties are enforced by the server, with clear refusals', () => {
  const g = playWith(['AS KS 7S 8S 9S 10S JS QS', 'AH 10H 9C 8C 7C KH QH 7H', 'JD 9D AD 10D KD QD 8D 7D', 'JH 9H 8H AC 10C KC QC JC'], '7D');
  // trump ♦; p0 holds no ♦; p0 leads ♠
  const { s, ctx } = g;
  expect(s.contract!.trump).toBe('D');
  baloot.act(ctx, s, 'p0', { type: 'play', card: 'AS' });
  // p1: no ♠, no ♦ → anything
  expect(ids(vw(ctx, s, 'p1').playable.map(c))).toEqual(ids(s.hands.p1));
  baloot.act(ctx, s, 'p1', { type: 'play', card: '7C' });
  // p2: no ♠, partner p0 holds the trick → anything
  expect(vw(ctx, s, 'p2').playable.length).toBe(8);
  baloot.act(ctx, s, 'p2', { type: 'play', card: '7D' });
  // p3: no ♠, an opponent (p2) holds with a trump; p3 has no ♦ → anything
  baloot.act(ctx, s, 'p3', { type: 'play', card: 'AC' });
  expect(s.trickWinner).toBe('p2');
  collect(g);
  // p2 leads trump: p3 has none; p0 has none; p1 has none → anything; p2 leads the 8 ♦
  baloot.act(ctx, s, 'p2', { type: 'play', card: '8D' });
  expect(vw(ctx, s, 'p3').playable.length).toBe(7);
  const h = playWith(['AS KS 7S 8S 9S 10S JS QS', 'AH 10H 9C 8C 7C KH QH 7H', 'JH 9H 8H JD 9D AD 10D KD', 'QD 8D 7D AC 10C KC QC JC'], '7H');
  // trump ♥: p0 leads ♠; p1 void → must trump
  baloot.act(h.ctx, h.s, 'p0', { type: 'play', card: '7S' });
  expect(() => baloot.act(h.ctx, h.s, 'p1', { type: 'play', card: '7C' })).toThrow('يجب أن تقطع بالطرونفو');
  baloot.act(h.ctx, h.s, 'p1', { type: 'play', card: '7H' });
  // p2 void in ♠, an opponent holds with the 7 ♥ → over-trump
  expect(ids(vw(h.ctx, h.s, 'p2').playable.map(c))).toEqual(['8H', '9H', 'JH']);
  expect(() => baloot.act(h.ctx, h.s, 'p2', { type: 'play', card: 'JD' })).toThrow('يجب أن تقطع بالطرونفو');
  baloot.act(h.ctx, h.s, 'p2', { type: 'play', card: '8H' });
  // p3 void in ♠ and ♥ → anything
  expect(vw(h.ctx, h.s, 'p3').playable.length).toBe(8);
  expect(() => baloot.act(h.ctx, h.s, 'p0', { type: 'play', card: 'AS' })).toThrow('ليس دورك');
});

test('بلوط-ريبلوط: K + Q of trumps = +20 for either team, announced with the second card', () => {
  for (const holder of ['p0', 'p1']) {
    const hands =
      holder === 'p0'
        ? ['KH QH AS 7S 8S 9S 10S JS', 'AH 10H 9C 8C 7C 7H QS KS', 'JD 9D AD 10D KD QD 8D 7D', 'JH 9H 8H AC 10C KC QC JC']
        : ['AH 10H AS 7S 8S 9S 10S JS', 'KH QH 9C 8C 7C 7H QS KS', 'JD 9D AD 10D KD QD 8D 7D', 'JH 9H 8H AC 10C KC QC JC'];
    const g = playWith(hands, '7D');
    // the taker is p0 (team A), trump is ♦ in playWith → use ♥ as trump instead
    g.s.contract!.trump = 'H';
    g.s.balootHolder = holder;
    run(g, () => g.s.phase === 'handEnd' || g.s.phase === 'final');
    expect(g.s.baloot).toEqual([holder]);
    const side = holder === 'p0' ? 'A' : 'B';
    expect(g.s.result!.baloot).toEqual({ A: side === 'A' ? 20 : 0, B: side === 'B' ? 20 : 0 });
    expect(g.said.filter((t) => t.includes('— بلوط!')).length).toBe(1);
    expect(g.said.filter((t) => t.includes('ريبلوط! (+20)')).length).toBe(1);
    const i1 = g.said.findIndex((t) => t.includes('— بلوط!'));
    const i2 = g.said.findIndex((t) => t.includes('ريبلوط!'));
    expect(i1).toBeLessThan(i2);
  }
});

test('announcements: تيرس 20, كارت 50, سانك 100 (5 and more), كاري 200 / 150 / 100; no كاري of 8s or 7s', () => {
  const kinds = (h: string, tr: BSuit | null = null) => findAnnouncements(cs(h), tr).map((a) => [a.kind, a.points]);
  expect(kinds('7S 8S 9S AH KD')).toEqual([['tierce', 20]]);
  expect(kinds('7S 8S 9S 10S AH')).toEqual([['quarte', 50]]);
  expect(kinds('7S 8S 9S 10S JS')).toEqual([['quinte', 100]]);
  const six = findAnnouncements(cs('7S 8S 9S 10S JS QS AH'), null);
  expect(six.map((a) => [a.kind, a.points, a.cards.length])).toEqual([['quinte', 100, 6]]);
  expect(kinds('JS JH JD JC 7S')).toEqual([['carre', 200]]);
  expect(kinds('9S 9H 9D 9C 7S')).toEqual([['carre', 150]]);
  for (const r of ['A', '10', 'K', 'Q']) expect(kinds(`${r}S ${r}H ${r}D ${r}C 7S`)).toEqual([['carre', 100]]);
  expect(kinds('8S 8H 8D 8C AS')).toEqual([]);
  expect(kinds('7S 7H 7D 7C AS')).toEqual([]);
  // the natural order: 10 J Q is a تيرس, A K Q too; K A 7 is not
  expect(kinds('10H JH QH')).toEqual([['tierce', 20]]);
  expect(kinds('AH KH QH')).toEqual([['tierce', 20]]);
  expect(kinds('AH KH 7H')).toEqual([]);
  // a كاري and a تيرس without sharing a card
  expect(kinds('JS JH JD JC QH KH AH 7S')).toEqual([['carre', 200], ['tierce', 20]]);
});

test('announcements: only the best team scores (all of its own); ranking and ties', () => {
  const A = (h: string, tr: BSuit | null = null) => findAnnouncements(cs(h), tr)[0];
  const order = P.slice();
  const side = (id: string) => (id === 'p0' || id === 'p2' ? 'A' : 'B');
  const best = (d: [string, Ann][], tr: BSuit | null = null) => bestAnnSide(d.map(([by, ann]) => ({ by, ann })), order, tr, side);
  // any كاري beats any sequence
  expect(best([['p0', A('7S 8S 9S 10S JS QS')], ['p1', A('QS QH QD QC')]])).toBe('B');
  // the longer sequence, even lower
  expect(best([['p0', A('AS KS QS')], ['p1', A('7H 8H 9H 10H')]])).toBe('B');
  // equal length: the higher top card
  expect(best([['p0', A('8S 9S 10S')], ['p1', A('JH QH KH')]])).toBe('B');
  // equal: the trump-suit sequence
  expect(best([['p0', A('8S 9S 10S')], ['p1', A('8H 9H 10H')]], 'S')).toBe('A');
  expect(best([['p0', A('8S 9S 10S')], ['p1', A('8H 9H 10H')]], 'H')).toBe('B');
  // still equal: the player closest to the dealer's right (first in the order)
  expect(best([['p1', A('8S 9S 10S')], ['p2', A('8H 9H 10H')]], 'D')).toBe('B');
  expect(best([['p0', A('8S 9S 10S')], ['p3', A('8H 9H 10H')]], 'D')).toBe('A');
  expect(best([])).toBeNull();
});

const HANDS8 = ['7S 8S 9S AS 10H 7C 8C KD', 'JS JH JD JC QH KH AH 7H', '10S QS KS 9C 10C AC 8D 9D', 'QC QD KC 9H 8H 7D 10D AD'];
const TRICK1 = [['p0', '10H'], ['p1', '7H'], ['p2', '9C'], ['p3', '8H']];

test('announcements in play: offered on my turn in the 2nd trick, names shown, cards and points for the best team on the 3rd', () => {
  const g = playWith(HANDS8, 'QD');
  const { s, ctx } = g;
  expect(vw(ctx, s, 'p0').myProjects).toEqual([]); // not on the first trick
  for (const [by, card] of TRICK1) baloot.act(ctx, s, by, { type: 'play', card });
  collect(g);
  expect(s.trickNo).toBe(2);
  expect(s.turn).toBe('p0');
  const mine = vw(ctx, s, 'p0').myProjects;
  expect(mine.map((p) => [p.kind, p.points])).toEqual([['tierce', 20]]);
  expect(vw(ctx, s, 'p1').myProjects).toEqual([]); // not my turn
  baloot.act(ctx, s, 'p0', { type: 'play', card: 'AS', declare: mine.map((p) => p.key) });
  expect(g.said.at(-1)).toContain('إعلان: تيرس');
  const p1 = vw(ctx, s, 'p1').myProjects;
  expect(p1.map((p) => p.kind)).toEqual(['carre', 'tierce']); // J J J J + Q K A ♥
  const legal = vw(ctx, s, 'p1').playable;
  baloot.act(ctx, s, 'p1', { type: 'play', card: legal[0], declare: p1.map((p) => p.key) });
  const v2 = vw(ctx, s, 'p0');
  expect(v2.declared.map((d) => [d.by, d.kind, d.cards])).toEqual([
    ['p0', 'tierce', undefined],
    ['p1', 'carre', undefined],
    ['p1', 'tierce', undefined],
  ]);
  // p2 declines its own (none), p3 has none
  baloot.act(ctx, s, 'p2', { type: 'play', card: vw(ctx, s, 'p2').playable[0], declare: [] });
  baloot.act(ctx, s, 'p3', { type: 'play', card: vw(ctx, s, 'p3').playable[0], declare: [] });
  collect(g);
  expect(s.trickNo).toBe(3);
  expect(s.projPoints).toEqual({ A: 0, B: 220 }); // team B: كاري 200 + تيرس 20; team A's تيرس doesn't count
  const shown = vw(ctx, s, 'p0').shown!;
  expect(shown.side).toBe('B');
  expect(shown.items.map((i) => [i.kind, i.cards!.length])).toEqual([['carre', 4], ['tierce', 3]]);
  expect(g.said.some((t) => t.startsWith('الإعلانات لفريق يوسف وبابا: كاري، تيرس (+220)'))).toBe(true);
  // a declared announcement is never one the player doesn't hold
  const h = playWith(HANDS8, 'QD');
  for (const [by, card] of TRICK1) baloot.act(h.ctx, h.s, by, { type: 'play', card });
  collect(h);
  baloot.act(h.ctx, h.s, 'p0', { type: 'play', card: 'AS', declare: [annKey(findAnnouncements(cs('JS JH JD JC'), null)[0])] });
  expect(h.s.maDeclared.p0).toEqual([]);
});

test('scoring: success, دخل, كابو 252, ليتيج carried over and adding up', () => {
  const z = { A: 0, B: 0 };
  // success: each team keeps its own points (tricks + announcements + belote)
  expect(maScoreHand({ buyerSide: 'A', cards: { A: 92, B: 70 }, tricks: { A: 5, B: 3 }, ann: { A: 20, B: 0 }, belote: { A: 0, B: 20 }, pot: 0 })).toMatchObject({
    points: { A: 112, B: 90 },
    failed: false,
    winner: 'A',
    litige: false,
  });
  // دخل: the opponents take 162 + every announcement; the taker keeps only the belote
  const d = maScoreHand({ buyerSide: 'A', cards: { A: 60, B: 102 }, tricks: { A: 3, B: 5 }, ann: { A: 20, B: 0 }, belote: { A: 20, B: 0 }, pot: 0 });
  expect(d).toMatchObject({ points: { A: 20, B: 182 }, failed: true, winner: 'B' });
  // the announcements count in the comparison: 70 + 50 > 92
  expect(maScoreHand({ buyerSide: 'A', cards: { A: 70, B: 92 }, tricks: { A: 3, B: 5 }, ann: { A: 50, B: 0 }, belote: z, pot: 0 }).points).toEqual({ A: 120, B: 92 });
  // كابو by the taker: 252 + its announcements + belote (no extra 10)
  expect(maScoreHand({ buyerSide: 'B', cards: { A: 0, B: 162 }, tricks: { A: 0, B: 8 }, ann: { A: 0, B: 100 }, belote: { A: 0, B: 20 }, pot: 0 })).toMatchObject({
    points: { A: 0, B: 372 },
    kaboot: 'B',
    failed: false,
  });
  // كابو by the opponents: 252 + every announcement, a دخل
  expect(maScoreHand({ buyerSide: 'B', cards: { A: 162, B: 0 }, tricks: { A: 8, B: 0 }, ann: { A: 0, B: 20 }, belote: { A: 0, B: 20 }, pot: 0 })).toMatchObject({
    points: { A: 272, B: 20 },
    kaboot: 'A',
    failed: true,
  });
  // ليتيج: 81 – 81; the opponents keep theirs, the taker's 81 waits
  const t1 = maScoreHand({ buyerSide: 'A', cards: { A: 81, B: 81 }, tricks: { A: 4, B: 4 }, ann: z, belote: z, pot: 0 });
  expect(t1).toMatchObject({ points: { A: 0, B: 81 }, litige: true, winner: null, pot: 81 });
  // the belote stays with the taker and counts in the totals: 71 + 20 = 91 – 91
  const t2 = maScoreHand({ buyerSide: 'B', cards: { A: 91, B: 71 }, tricks: { A: 4, B: 4 }, ann: z, belote: { A: 0, B: 20 }, pot: t1.pot });
  expect(t2).toMatchObject({ points: { A: 91, B: 20 }, litige: true, pot: 152 }); // ties add up
  // the next decided hand's winner takes it all (here a دخل: the opponents)
  const t3 = maScoreHand({ buyerSide: 'A', cards: { A: 50, B: 112 }, tricks: { A: 2, B: 6 }, ann: z, belote: z, pot: t2.pot });
  expect(t3).toMatchObject({ points: { A: 0, B: 162 + 152 }, potWon: 152, pot: 0, winner: 'B' });
  // …or the taker when it succeeds
  expect(maScoreHand({ buyerSide: 'A', cards: { A: 100, B: 62 }, tricks: { A: 5, B: 3 }, ann: z, belote: z, pot: 81 }).points).toEqual({ A: 181, B: 62 });
});

test('a ليتيج in a real hand: the pot waits, shows in the view and goes to the next winner', () => {
  const g = newGame();
  toLastTrick(g);
  const bs = g.s.sides[0].members.includes(g.s.contract!.buyer) ? 'A' : 'B';
  const ds = bs === 'A' ? 'B' : 'A';
  g.s.abnat = { A: 81, B: 81 };
  g.s.tricks = { A: 4, B: 4 };
  g.s.projPoints = { A: 0, B: 0 };
  g.s.baloot = [];
  collect(g);
  expect(g.s.phase).toBe('handEnd');
  const r = g.s.result!;
  expect(r.litige).toBe(true);
  expect(r.points[ds]).toBe(81);
  expect(r.points[bs]).toBe(0);
  expect(g.s.pot).toBe(81);
  expect(vw(g.ctx, g.s, 'p0').pot).toBe(81);
  expect(g.s.history.at(-1)!.tag).toBe('ليتيج');
  // the next decided hand's winner gets the 81
  let guard = 0;
  while (g.s.pot > 0 && guard++ < 20) {
    baloot.act(g.ctx, g.s, 'p0', { type: 'next' });
    run(g, () => g.s.phase === 'handEnd' || g.s.phase === 'final');
  }
  const r2 = g.s.result!;
  expect(r2.potWon).toBeGreaterThanOrEqual(81);
  expect(r2.points[r2.winner]).toBeGreaterThanOrEqual(81);
  expect(g.s.pot).toBe(0);
});

test('end of the game at 1000 (or 500); both over → the higher; level → «البيل» deciding hand', () => {
  // one team reaches 1000
  const g = newGame();
  toLastTrick(g);
  const o = scoreNow(g);
  g.s.scores = { A: 1000 - o.points.A, B: 300 };
  collect(g);
  expect(g.s.phase).toBe('final');
  expect(g.s.winner).toBe('A');
  expect(baloot.result!(g.s)!.places[0]).toEqual(g.s.sides[0].members);
  expect(turnOf(g.s)).toEqual([]);

  // under the target: the next hand deals itself
  const n = newGame();
  toLastTrick(n);
  collect(n);
  expect(n.s.phase).toBe('handEnd');
  expect(n.s.nextAt! - n.ctx.now).toBe(HAND_END_MS);

  // both over 1000 in the same hand: the higher score wins
  const b = newGame();
  toLastTrick(b);
  const ob = scoreNow(b);
  b.s.scores = { A: 1050 - ob.points.A, B: 1010 - ob.points.B };
  collect(b);
  expect(b.s.scores).toEqual({ A: 1050, B: 1010 });
  expect(b.s.phase).toBe('final');
  expect(b.s.winner).toBe('A');

  // level at or above the target → البيل; the next decided hand ends it
  const l = newGame({ target: 500 });
  expect(l.s.settings.target).toBe(500);
  toLastTrick(l);
  const ol = scoreNow(l);
  l.s.scores = { A: 600 - ol.points.A, B: 600 - ol.points.B };
  collect(l);
  expect(l.s.scores).toEqual({ A: 600, B: 600 });
  expect(l.s.phase).toBe('handEnd');
  expect(l.s.bel).toBe(true);
  expect(vw(l.ctx, l.s, 'p0').bel).toBe(true);
  expect(l.said.at(-1)).toBe('تعادل فوق الهدف — البيل: يد فاصلة');
  baloot.act(l.ctx, l.s, 'p0', { type: 'next' });
  run(l, () => l.s.phase === 'final', 20000);
  expect(l.s.phase).toBe('final');
  expect(l.s.scores[l.s.winner!]).toBeGreaterThan(l.s.scores[l.s.winner === 'A' ? 'B' : 'A']);
});

test('turns, pauses and the timer work as in the Saudi mode', () => {
  const g = newGame({ timer: 20 });
  expect(turnOf(g.s)).toEqual([g.s.bid!.queue[0]]);
  const first = g.s.bid!.queue[0];
  g.ctx.now += 20_001;
  expect(baloot.tick!(g.ctx, g.s)).toBe(true);
  if (g.s.contract) expect(g.s.contract.buyer).toBe(first); // a face-up Jack: taken for the player
  else expect(g.s.bid!.calls[first]).toEqual({ call: 'pass' });
  run(g, () => g.s.phase === 'play' && g.s.trick.length === 4);
  expect(turnOf(g.s)).toEqual([]);
  expect(TRICK_PAUSE_MS).toBeGreaterThanOrEqual(2200);
  collect(g);
  expect(turnOf(g.s)).toEqual([g.s.lastTrick!.winner]);
});

test('hidden information and the view: my hand only, the rules, the pot', () => {
  const g = newGame();
  const v = vw(g.ctx, g.s, 'p1');
  expect(v.rules).toBe('morocco');
  expect(v.pot).toBe(0);
  expect(v.bel).toBe(false);
  expect(v.target).toBe(1000);
  expect(v.myHand.length).toBe(5);
  expect(JSON.stringify(v)).not.toContain(g.s.hands.p0[0].id + '"');
});

test('bots finish full games (both levels); scores add up; says are noun-first and gender-neutral', () => {
  for (const level of [1, 2]) {
    const g = newGame({ level, target: 1000 });
    run(g, () => g.s.phase === 'final', 300_000);
    expect(g.s.phase).toBe('final');
    const sum = g.s.history.reduce((t, r) => ({ A: t.A + r.A, B: t.B + r.B }), { A: 0, B: 0 });
    expect(sum).toEqual(g.s.scores);
    expect(g.s.scores[g.s.winner!]).toBeGreaterThanOrEqual(1000);
    expect(g.s.scores[g.s.winner!]).toBeGreaterThan(g.s.scores[g.s.winner === 'A' ? 'B' : 'A']);
    for (const r of g.s.history) expect(['دخل', 'كابو', 'ليتيج', undefined]).toContain(r.tag);
    const VERBS = ['لعب', 'لعبت', 'اشترى', 'اشترت', 'قال', 'قالت', 'أخذ', 'أخذت', 'ربح', 'ربحت', 'فاز', 'فازت', 'مرّر', 'مرر', 'أعلن', 'أعلنت', 'قطع', 'قطعت'];
    for (const t of g.said) {
      const words = t.split(/[\s:،—()!+]+/);
      for (const w of VERBS) expect(words).not.toContain(w);
      expect(t.length).toBeLessThanOrEqual(90);
    }
    expect(g.said.some((t) => t.startsWith('ورقة من '))).toBe(true);
    expect(g.said.some((t) => t.startsWith('الشاري: '))).toBe(true);
    expect(g.said.some((t) => t.includes('صن') || t.includes('حكم ') || t.includes('مشروع'))).toBe(false);
  }
});

test('decide: bots always make a legal move and only declare announcements they hold', () => {
  for (let k = 0; k < 15; k++) {
    const g = newGame();
    run(g, () => {
      const id = turnOf(g.s)[0];
      if (id && g.s.phase === 'play') {
        const a = decide(g.s, id, 2)!;
        expect(maLegal(g.s.hands[id], g.s.trick, g.s.contract!.trump!).some((x) => x.id === a.card)).toBe(true);
        const held = (g.s.maAvail[id] ?? []).map(annKey);
        for (const key of a.declare as string[]) expect(held).toContain(key);
        if (g.s.trickNo !== 2) expect(a.declare).toEqual([]);
      }
      if (id && g.s.phase === 'bid') {
        const a = decide(g.s, id, 1)!;
        expect(bidOptions(g.s, id).map((o) => o.call as string)).toContain(a.call as string);
      }
      return g.s.phase === 'handEnd' || g.s.phase === 'final';
    });
  }
});

test('settings: the rule set is validated; each starts from its own target; Saudi stays the default', () => {
  expect(BALOOT_DEFAULTS.mode).toBe('saudi');
  const st: any = { ...BALOOT_DEFAULTS };
  baloot.patchSettings!(st, { mode: 'egypt' });
  expect(st.mode).toBe('saudi');
  baloot.patchSettings!(st, { target: 100 });
  expect(st.target).toBe(100);
  baloot.patchSettings!(st, { mode: 'morocco' });
  expect(st).toMatchObject({ mode: 'morocco', target: 1000 });
  baloot.patchSettings!(st, { target: 152 });
  expect(st.target).toBe(1000);
  baloot.patchSettings!(st, { target: 500 });
  expect(st.target).toBe(500);
  baloot.patchSettings!(st, { mode: 'morocco', target: 1000 });
  expect(st.target).toBe(1000);
  baloot.patchSettings!(st, { mode: 'saudi' });
  expect(st).toMatchObject({ mode: 'saudi', target: 152 });
  baloot.patchSettings!(st, { target: 500 });
  expect(st.target).toBe(152);
  // a Moroccan game never starts with a Saudi target
  expect(newGame({ target: 152 }).s.settings.target).toBe(1000);
});

test('the Saudi mode is unchanged: صن / حكم / أشكل, French card labels, «rules: saudi»', () => {
  for (const mode of [undefined, 'saudi'] as const) {
    const f = fakeCtx();
    const s = baloot.start(f.ctx, P, { ...(mode ? { mode } : {}), target: 152, timer: 0, doubling: true, level: 2 });
    rig(s, HANDS, '7D');
    expect(bidOptions(s, 'p0').map((o) => o.call)).toEqual(['pass', 'hokm', 'sun']);
    expect(vw(f.ctx, s, 'p0').rules).toBe('saudi');
    expect(f.said[0]).toMatch(/الورقة المكشوفة ⁦(A|K|Q|J|10|9|8|7)[♠♥♦♣]⁩$/);
    expect(s.settings.target).toBe(152);
  }
});
