/** «الممالك الخمس»: the deck, the deal and the wild of each round, the solver, going out and the last turns, scoring, bots. */
import { expect, test } from 'bun:test';

import { REALMS_DEFAULTS, REALM_SUITS, realmsDeals, type RealmCard, type RealmSuit } from '../src/shared/games/realms';
import { arrange, bestThrow, cardPoints, isGroup, isWild, leftPoints, makeRealmsDeck, outCards, sortRealms } from '../src/shared/realms-rules';
import type { BotLevel } from '../src/shared/protocol';
import { botDraw, botThrow } from './realms-bot';
import { ROUND_END_MS, planBot, realms, wildOf, type State } from './games/realms';
import { REALMS_RANK_VOICE, voiceRealmsOut, voiceRealmsWild } from './voice-calls-realms';

let seq = 0;
const c = (rank: number, suit: RealmSuit = 'fire'): RealmCard => ({ id: `t${++seq}-${suit}-${rank}`, suit, rank });
const J = (): RealmCard => ({ id: `J-t${++seq}`, suit: null, rank: 0 });
const ids = (cs: RealmCard[]) => cs.map((x) => x.id);

function fakeCtx(isBot: (id: string) => boolean = () => true, level: BotLevel = 'expert') {
  const fx: { kind: string; target?: string }[] = [];
  const sched: { by: string; key: string; delay: number; a: any }[] = [];
  const said: { text: string; by?: string; voice?: string }[] = [];
  const ctx: any = {
    now: 1000,
    fx: (kind: string, target?: string) => fx.push({ kind, target }),
    isConnected: () => true,
    isBot,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => sched.push({ by, key, delay, a }),
    say: (text: string, by?: string, voice?: string) => said.push({ text, by, voice }),
    botLevel: () => level,
  };
  return { ctx, fx, sched, said };
}

const totalCards = (s: State) => s.stock.length + s.discard.length + Object.values(s.hands).reduce((t, h) => t + h.length, 0);

/** A started game where it's `p`'s turn at `step` with exactly this hand. */
function setup(players: string[], hand: RealmCard[], step: 'draw' | 'discard' = 'discard', settings = REALMS_DEFAULTS) {
  const f = fakeCtx(() => false);
  const s = realms.start(f.ctx, players, { ...settings });
  const p = s.turn;
  s.hands[p] = hand.slice();
  s.step = step;
  return { ...f, s, p };
}

/* ------------------------------------------------------------------ */
/* cards                                                               */
/* ------------------------------------------------------------------ */

test('deck: 116 cards — five suits × 3…K twice, and 6 jokers', () => {
  const d = makeRealmsDeck();
  expect(d.length).toBe(116);
  expect(new Set(ids(d)).size).toBe(116);
  expect(d.filter((x) => x.rank === 0).length).toBe(6);
  expect(REALM_SUITS.length).toBe(5);
  for (const suit of REALM_SUITS) {
    for (let r = 3; r <= 13; r++) expect(d.filter((x) => x.suit === suit && x.rank === r).length).toBe(2);
  }
  expect(d.some((x) => x.rank === 1 || x.rank === 2 || x.rank === 14)).toBe(false);
});

test('points: face value, J 11, Q 12, K 13, the round wild 20, jokers 50', () => {
  expect(cardPoints(c(3), 5)).toBe(3);
  expect(cardPoints(c(10), 5)).toBe(10);
  expect(cardPoints(c(11), 5)).toBe(11);
  expect(cardPoints(c(12), 5)).toBe(12);
  expect(cardPoints(c(13), 5)).toBe(13);
  expect(cardPoints(c(5, 'star'), 5)).toBe(20);
  expect(cardPoints(J(), 5)).toBe(50);
  expect(isWild(c(7), 7)).toBe(true);
  expect(isWild(c(7), 8)).toBe(false);
  expect(isWild(J(), 8)).toBe(true);
});

test('rounds: 11 (3 to 13 cards) or 6 short (3 to 8); the wild is the number of cards dealt', () => {
  expect(realmsDeals({ rounds: 'full', timer: 0 })).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  expect(realmsDeals({ rounds: 'short', timer: 0 })).toEqual([3, 4, 5, 6, 7, 8]);
  const { ctx } = fakeCtx();
  const seats = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const s = realms.start(ctx, seats, { ...REALMS_DEFAULTS });
  for (let r = 1; r <= 11; r++) {
    expect(s.round).toBe(r);
    expect(wildOf(s)).toBe(r + 2);
    for (const id of seats) expect(s.hands[id].length).toBe(r + 2);
    expect(s.discard.length).toBe(1);
    expect(totalCards(s)).toBe(116);
    const v = realms.view(ctx, s, 'a') as any;
    expect(v.wild).toBe(r + 2);
    expect(v.dealt).toBe(r + 2);
    expect(v.rounds).toBe(11);
    // finish the round at once: the next deal
    s.phase = 'roundEnd';
    s.nextAt = ctx.now;
    if (r < 11) expect(realms.tick!(ctx, s)).toBe(true);
  }
});

test('the starting player moves round the table each round', () => {
  const { ctx } = fakeCtx();
  const s = realms.start(ctx, ['a', 'b', 'c'], { ...REALMS_DEFAULTS });
  const first = s.turn;
  realms.act(ctx, s, 'a', { type: 'next' }); // not in roundEnd: ignored
  expect(s.round).toBe(1);
  s.phase = 'roundEnd';
  realms.act(ctx, s, 'a', { type: 'next' });
  expect(s.round).toBe(2);
  expect(s.turn).not.toBe(first);
});

/* ------------------------------------------------------------------ */
/* groups and the solver                                               */
/* ------------------------------------------------------------------ */

test('groups: books of a rank, runs of a suit, wilds anywhere, no wrap', () => {
  const w = 5;
  expect(isGroup([c(7), c(7, 'sun'), c(7, 'leaf')], w)).toBe(true);
  expect(isGroup([c(7), c(7)], w)).toBe(false);
  expect(isGroup([c(7), c(8), c(9)], w)).toBe(true);
  expect(isGroup([c(7), c(8, 'sun'), c(9)], w)).toBe(false);
  expect(isGroup([c(7), c(9), J()], w)).toBe(true);
  expect(isGroup([c(7), c(10), J()], w)).toBe(false);
  expect(isGroup([c(12), c(13), c(5, 'star')], w)).toBe(true); // J Q K with a 5 as the J
  expect(isGroup([c(13), c(3), c(4)], w)).toBe(false); // no wrap
  expect(isGroup([J(), J(), c(5)], w)).toBe(true); // all wilds
  expect(isGroup([c(7), c(7), J()], w)).toBe(true); // the two copies of a card make a book
  expect(isGroup([c(7), c(7), c(8)], w)).toBe(false);
});

test('solver: books, runs, wilds and jokers; the leftovers are the cheapest', () => {
  // round 1: 3s wild
  expect(leftPoints([c(3), c(9), c(13, 'sun')], 3)).toBe(42); // the 3 is wild: 20
  expect(leftPoints([c(9), c(9, 'sun'), c(3, 'star')], 3)).toBe(0);
  // a run with a joker in a gap
  const hand = [c(4), c(6), J(), c(9, 'water')];
  expect(leftPoints(hand, 8)).toBe(9);
  const a = arrange(hand, 8);
  expect(a.points).toBe(9);
  expect(a.groups.length).toBe(1);
  expect(a.groups[0].kind).toBe('run');
  expect(a.groups[0].ranks).toEqual([4, 5, 6]);
  expect(ids(a.left)).toEqual([hand[3].id]);
  // a joker joins the pair of 9s
  expect(leftPoints([c(9), c(9, 'sun'), J(), c(13, 'leaf')], 5)).toBe(13);
  // two wilds with nothing to join: they count (20 + 50)
  expect(leftPoints([c(5, 'sun'), J(), c(10), c(13, 'leaf')], 5)).toBe(10); // 10 and K of different suits: K + 2 wilds, the 10 stays
  expect(leftPoints([c(5, 'sun'), J()], 5)).toBe(70);
  // three wilds make a book of their own
  expect(leftPoints([c(5, 'sun'), J(), J()], 5)).toBe(0);
  // a spare wild joins a book (books take any number)
  expect(leftPoints([c(9), c(9, 'sun'), c(9, 'leaf'), J()], 5)).toBe(0);
  // the full run 3…K takes no more wilds, but it splits: 3-4-5-joker and 6…K
  const full = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((r) => c(r, 'star'));
  expect(leftPoints([...full, J()], 2)).toBe(0);
  expect(arrange([...full, J()], 2).groups.length).toBeGreaterThanOrEqual(2);
  // 3…Q and a joker: the joker is the K
  expect(leftPoints([...full.slice(0, 10), J()], 2)).toBe(0);
  // the cheapest arrangement, not the one with most groups
  expect(leftPoints([c(10), c(11), c(12), c(12, 'sun'), c(12, 'leaf')], 3)).toBe(21);
});

test('solver: the two copies of a card, overlapping books and runs', () => {
  // 7 7 8 9 of fire: run 7-8-9 + a 7 left, or… the best is to leave a 7
  expect(leftPoints([c(7), c(7), c(8), c(9)], 3)).toBe(7);
  // 6♦ book or run: 6 fire, 6 sun, 6 leaf, 7 fire, 8 fire → run 6-7-8 fire leaves 6+6=12; book of 6s leaves 15 → 12
  expect(leftPoints([c(6), c(6, 'sun'), c(6, 'leaf'), c(7), c(8)], 3)).toBe(12);
  // with one wild everything fits: book 6 6 + wild? run 6-7-8 + book 6 6 W
  expect(leftPoints([c(6), c(6, 'sun'), c(6, 'leaf'), c(7), c(8), J()], 3)).toBe(0);
});

/** The reference: try every group that holds the first card (checked by isGroup), or leave it. */
function brute(cards: RealmCard[], wild: number): number {
  if (!cards.length) return 0;
  const [first, ...rest] = cards;
  let b = cardPoints(first, wild) + brute(rest, wild);
  for (let m = 1; m < 1 << rest.length; m++) {
    const g = [first];
    const r: RealmCard[] = [];
    rest.forEach((x, k) => ((m >> k) & 1 ? g : r).push(x));
    if (g.length >= 3 && isGroup(g, wild)) b = Math.min(b, brute(r, wild));
  }
  return b;
}

function shuffled<T>(a: T[], rand: () => number): T[] {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('solver: optimal on 1500 random small hands (brute force), and every arrangement is valid', () => {
  const rand = lcg(42);
  const deck = makeRealmsDeck();
  for (let t = 0; t < 1500; t++) {
    const n = 3 + Math.floor(rand() * 7);
    const wild = 3 + Math.floor(rand() * 11);
    // a narrow pool so books, runs and wilds come up often
    const pool = deck.filter((x) => x.rank === 0 || (x.rank <= 8 && (x.suit === 'fire' || x.suit === 'sun')) || rand() < 0.12);
    const hand = shuffled(pool, rand).slice(0, n);
    const want = brute(hand, wild);
    expect(leftPoints(hand, wild)).toBe(want);
    const a = arrange(hand, wild);
    expect(a.points).toBe(want);
    expect(a.left.reduce((s, x) => s + cardPoints(x, wild), 0)).toBe(want);
    for (const g of a.groups) {
      expect(isGroup(g.cards, wild)).toBe(true);
      expect(g.ranks.length).toBe(g.cards.length);
    }
    expect(new Set([...a.groups.flatMap((g) => ids(g.cards)), ...ids(a.left)]).size).toBe(hand.length);
  }
});

test('solver: 14-card hands are fast (go-out check + best throw + arrangement)', () => {
  const rand = lcg(7);
  const deck = makeRealmsDeck();
  let worst = 0;
  for (let t = 0; t < 60; t++) {
    const hand = shuffled(deck, rand).slice(0, 14);
    const wild = 3 + (t % 11);
    const t0 = performance.now();
    outCards(hand, wild);
    bestThrow(hand, wild, { pair: 0.5, wildKeep: 0.2 });
    arrange(hand, wild);
    worst = Math.max(worst, performance.now() - t0);
  }
  expect(worst).toBeLessThan(150);
});

test('runs show their wilds in place: gaps first, then upwards, then below K', () => {
  const a = arrange([c(11, 'sun'), c(13, 'sun'), J(), J()], 5);
  expect(a.groups.length).toBe(1);
  const g = a.groups[0];
  expect(g.kind).toBe('run');
  expect(g.ranks).toEqual([10, 11, 12, 13]);
  expect(g.cards[2].rank).toBe(0); // the joker is the Q
});

test('outCards: the throws that leave every other card in a group', () => {
  const hand = [c(4), c(5), c(6), c(9, 'sun'), c(13, 'leaf')];
  expect(outCards(hand, 9)).toEqual([hand[4].id]); // 9s are wild: 4-5-6 fire + the 9 → throw the K
  expect(outCards([c(4), c(5), c(8, 'sun'), c(13, 'leaf')], 3)).toEqual([]);
  // either copy works
  const two = [c(7), c(7, 'sun'), c(7, 'leaf'), c(10), c(10)];
  expect(outCards(two, 3).length).toBe(0);
  const four = [c(7), c(7, 'sun'), c(7, 'leaf'), c(7, 'water'), c(10)];
  expect(outCards(four, 3)).toEqual([four[4].id]);
  // a book of five sevens: any seven can go
  const five = [c(7), c(7, 'sun'), c(7, 'leaf'), c(7, 'water'), c(7, 'star')];
  expect(outCards(five, 3).length).toBe(5);
});

test('sorting: by suit or rank, wilds last', () => {
  const s = sortRealms([J(), c(9, 'sun'), c(5, 'star'), c(4)], 5, 'suit');
  expect(s.map((x) => x.rank)).toEqual([4, 9, 5, 0]);
});

/* ------------------------------------------------------------------ */
/* turns, going out, the last turns, scoring                           */
/* ------------------------------------------------------------------ */

test('a turn: draw (stock or face-up), then throw; not out of turn; the taken card can’t go straight back', () => {
  const { ctx, s } = setup(['a', 'b', 'c'], [], 'draw');
  const p = s.turn;
  const other = s.seats.find((x) => x !== p)!;
  expect(() => realms.act(ctx, s, other, { type: 'drawDeck' })).toThrow('ليس دورك');
  expect(() => realms.act(ctx, s, p, { type: 'discard', card: 'x' })).toThrow();
  s.hands[p] = s.stock.splice(0, 3);
  const top = s.discard[0];
  realms.act(ctx, s, p, { type: 'drawDiscard' });
  expect(s.step).toBe('discard');
  expect(s.hands[p].map((x) => x.id)).toContain(top.id);
  expect(() => realms.act(ctx, s, p, { type: 'discard', card: top.id })).toThrow('لا يمكن رمي الورقة المأخوذة للتو');
  const card = s.hands[p][0];
  realms.act(ctx, s, p, { type: 'discard', card: card.id });
  expect(s.discard[s.discard.length - 1].id).toBe(card.id);
  expect(s.turn).not.toBe(p);
  expect(s.step).toBe('draw');
});

test('going out is refused unless everything else fits; then each other player has exactly one last turn', () => {
  const { ctx, s, said } = setup(['a', 'b', 'c'], []);
  const p = s.turn;
  // round 1: 3s wild; hand of 4 after the draw
  const bad = [c(4), c(6), c(9, 'sun'), c(13, 'leaf')];
  s.hands[p] = bad.slice();
  expect(() => realms.act(ctx, s, p, { type: 'out', card: bad[3].id })).toThrow('لا يمكن الخروج');
  const good = [c(4), c(5), c(6), c(13, 'leaf')];
  s.hands[p] = good.slice();
  realms.act(ctx, s, p, { type: 'out', card: good[3].id });
  expect(s.outBy).toBe(p);
  expect(s.outGroups!.length).toBe(1);
  expect(said.some((x) => x.voice === voiceRealmsOut(p))).toBe(true);
  const order = s.lastTurn.slice();
  expect(order.length).toBe(2);
  expect(order).not.toContain(p);
  expect(s.turn).toBe(order[0]);
  // the two others play their last turn
  for (const id of order) {
    expect(s.turn).toBe(id);
    expect(s.phase).toBe('play');
    realms.act(ctx, s, id, { type: 'drawDeck' });
    realms.act(ctx, s, id, { type: 'discard', card: s.hands[id][0].id });
  }
  expect(s.phase).toBe('roundEnd');
  const row = s.summary!.find((r) => r.id === p)!;
  expect(row.out).toBe(true);
  expect(row.points).toBe(0);
  for (const id of order) {
    const r = s.summary!.find((x) => x.id === id)!;
    expect(r.points).toBe(leftPoints(s.hands[id], 3));
    expect(s.scores[id]).toBe(r.points);
  }
  expect(s.history.length).toBe(1);
  expect(realms.turnOf!(s)).toEqual([]);
});

test('the last turn can lay everything down too (0 points), and going out again then is the same as a throw', () => {
  const { ctx, s } = setup(['a', 'b'], []);
  const p = s.turn;
  const q = s.seats.find((x) => x !== p)!;
  s.hands[p] = [c(4), c(5), c(6), c(13, 'leaf')];
  realms.act(ctx, s, p, { type: 'out', card: s.hands[p][3].id });
  expect(s.turn).toBe(q);
  s.hands[q] = [c(9, 'sun'), c(9, 'water'), c(9, 'leaf')];
  s.stock.push(c(12, 'star'));
  realms.act(ctx, s, q, { type: 'drawDeck' });
  const v = realms.view(ctx, s, q) as any;
  expect(v.plan.outCards.length).toBe(1);
  expect(v.plan.best.points).toBe(0);
  realms.act(ctx, s, q, { type: 'out', card: v.plan.outCards[0] });
  expect(s.phase).toBe('roundEnd');
  expect(s.summary!.find((r) => r.id === q)!.points).toBe(0);
  expect(s.summary!.find((r) => r.id === q)!.out).toBe(false);
});

test('scoring: the best arrangement counts, wilds 20 and jokers 50 when they fit nowhere', () => {
  const { ctx, s } = setup(['a', 'b'], []);
  const p = s.turn;
  const q = s.seats.find((x) => x !== p)!;
  s.hands[p] = [c(4), c(5), c(6), c(13, 'leaf')];
  realms.act(ctx, s, p, { type: 'out', card: s.hands[p][3].id });
  s.hands[q] = [c(3, 'sun'), c(12, 'leaf'), J()];
  // q draws a card that stays useless, throws it
  const dud = c(8, 'water');
  s.stock.push(dud);
  realms.act(ctx, s, q, { type: 'drawDeck' });
  realms.act(ctx, s, q, { type: 'discard', card: dud.id });
  // 3 (wild) + Q + joker = a group of 3 (wild, Q, joker): 0
  expect(s.summary!.find((r) => r.id === q)!.points).toBe(0);
});

test('final: after the last round the lowest total wins; result ranks by total, ties share', () => {
  const { ctx, s, fx } = setup(['a', 'b', 'c'], [], 'discard', { rounds: 'short', timer: 0 });
  s.round = 6;
  s.scores = { a: 40, b: 25, c: 40 };
  const p = s.turn;
  s.hands = { a: [c(4), c(5), c(6), c(13, 'leaf')], b: [c(4), c(5), c(6), c(13, 'leaf')], c: [c(4), c(5), c(6), c(13, 'leaf')] };
  // round 6 deals 8 (8s wild); the hands are tiny but the rules don't care
  realms.act(ctx, s, p, { type: 'out', card: s.hands[p][3].id });
  while (s.phase === 'play') {
    const id = s.turn;
    realms.act(ctx, s, id, { type: 'drawDeck' });
    realms.act(ctx, s, id, { type: 'discard', card: s.hands[id].find((x) => x.rank === 13 || x.rank > 6)?.id ?? s.hands[id][0].id });
  }
  expect(s.phase).toBe('final');
  const totals = s.active.map((id) => s.scores[id]);
  const min = Math.min(...totals);
  expect(s.scores[s.winner!]).toBe(min);
  expect(fx.some((x) => x.kind === 'win' && x.target === s.winner)).toBe(true);
  const r = realms.result!(s)!;
  expect(r.places[0]).toContain(s.winner!);
  expect(r.places.flat().sort()).toEqual(['a', 'b', 'c']);
  for (let i = 1; i < r.places.length; i++) expect(s.scores[r.places[i][0]]).toBeGreaterThan(s.scores[r.places[i - 1][0]]);
});

test('patchSettings accepts only the known values', () => {
  const st = { ...REALMS_DEFAULTS };
  realms.patchSettings!(st, { rounds: 'short', timer: 90 });
  expect(st).toEqual({ rounds: 'short', timer: 90 });
  realms.patchSettings!(st, { rounds: 'long', timer: 45 });
  expect(st).toEqual({ rounds: 'short', timer: 90 });
});

test('the turn timer plays for the player: a card from the stock and a throw (or out)', () => {
  const f = fakeCtx(() => false);
  const s = realms.start(f.ctx, ['a', 'b'], { rounds: 'full', timer: 60 });
  const p = s.turn;
  expect(s.deadline).toBe(f.ctx.now + 60_000);
  f.ctx.now += 60_000;
  expect(realms.tick!(f.ctx, s)).toBe(true);
  expect(s.turn).not.toBe(p);
  expect(s.hands[p].length).toBe(3);
});

test('the stock runs out: the discard pile is reshuffled; past the limit the round ends', () => {
  const { ctx, s } = setup(['a', 'b'], [], 'draw');
  const p = s.turn;
  s.hands[p] = [c(4), c(9, 'sun'), c(12, 'leaf')];
  const moved = s.stock.splice(0);
  s.discard = [...moved, ...s.discard];
  s.throwers = s.discard.map(() => null);
  realms.act(ctx, s, p, { type: 'drawDeck' });
  expect(s.reshuffles).toBe(1);
  expect(s.discard.length).toBe(1);
  expect(s.step).toBe('discard');
  // and once the reshuffles are used up
  realms.act(ctx, s, p, { type: 'discard', card: s.hands[p][0].id });
  s.stock = [];
  s.reshuffles = 3;
  realms.act(ctx, s, s.turn, { type: 'drawDeck' });
  expect(s.phase).toBe('roundEnd');
  expect(s.summary!.every((r) => !r.out)).toBe(true);
});

/* ------------------------------------------------------------------ */
/* bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: go out as soon as possible; take a wild from the discard; never throw a wild while a natural card can go', () => {
  const hand = [c(4), c(5), c(6), c(13, 'leaf')];
  for (const level of ['smart', 'expert'] as const) {
    expect(botThrow({ hand, wild: 3, top: null, last: false, turns: 1, dealt: 3 }, level)).toEqual({ type: 'out', card: hand[3].id });
    expect(botDraw({ hand: hand.slice(0, 3), wild: 3, top: J(), last: false, turns: 1, dealt: 3 }, level).type).toBe('drawDiscard');
    const wildHand = [c(4), c(9, 'sun'), J(), c(12, 'water'), c(8, 'leaf')];
    const m = botThrow({ hand: wildHand, wild: 4, top: null, last: false, turns: 2, dealt: 4 }, level);
    expect(m.type).toBe('discard');
    expect(isWild(wildHand.find((x) => x.id === (m as any).card)!, 4)).toBe(false);
  }
});

test('expert: takes the face-up card that completes a group, throws the dear card that fits nowhere', () => {
  const hand = [c(7), c(8), c(13, 'leaf'), c(4, 'water')];
  expect(botDraw({ hand, wild: 4, top: c(9), last: false, turns: 2, dealt: 4 }, 'expert').type).toBe('drawDiscard');
  expect(botDraw({ hand, wild: 4, top: c(11, 'star'), last: false, turns: 2, dealt: 4 }, 'expert').type).toBe('drawDeck');
  const after = [...hand, c(9)];
  // 7-8-9 fire + 4 (wild) → out with the K
  expect(botThrow({ hand: after, wild: 4, top: null, last: false, turns: 2, dealt: 4 }, 'expert')).toEqual({ type: 'out', card: hand[2].id });
  const loose = [c(7), c(8), c(13, 'leaf'), c(3, 'water'), c(10, 'sun')];
  expect(botThrow({ hand: loose, wild: 4, top: null, last: false, turns: 2, dealt: 4 }, 'expert')).toEqual({ type: 'discard', card: loose[2].id });
});

test('expert on its last turn minimises the real points', () => {
  const hand = [c(12), c(12, 'sun'), c(13, 'leaf'), c(3, 'water'), c(4, 'water')];
  const m = botThrow({ hand, wild: 8, top: null, last: true, turns: 4, dealt: 4 }, 'expert');
  expect(m).toEqual({ type: 'discard', card: hand[2].id });
});

test('no endless swaps: a bot never takes back a card it already threw or took; a round can’t go on forever', () => {
  const hand = [c(7), c(8), c(13, 'leaf'), c(4, 'water')];
  const top = c(9);
  expect(botDraw({ hand, wild: 4, top, last: false, turns: 2, dealt: 4, thrown: [top.id] }, 'expert').type).toBe('drawDeck');
  expect(botDraw({ hand, wild: 4, top: J(), last: false, turns: 2, dealt: 4, thrown: [] }, 'smart').type).toBe('drawDiscard');
  const { ctx, s, said } = setup(['a', 'b'], [], 'draw');
  s.turns = { a: 60, b: 59 };
  const p = s.turn;
  realms.act(ctx, s, p, { type: 'drawDeck' });
  realms.act(ctx, s, p, { type: 'discard', card: s.hands[p][0].id });
  expect(s.phase).toBe('roundEnd');
  expect(said.some((x) => x.text.includes('طالت الجولة'))).toBe(true);
});

function playOut(players: number, level: BotLevel, short: boolean) {
  const { ctx, sched } = fakeCtx(() => true, level);
  const seats = Array.from({ length: players }, (_, i) => `p${i}`);
  const s = realms.start(ctx, seats, { rounds: short ? 'short' : 'full', timer: 0 });
  let steps = 0;
  let rounds = 0;
  const times: number[] = [];
  while (s.phase !== 'final' && steps < 40_000) {
    steps++;
    if (s.phase === 'roundEnd') {
      rounds++;
      for (const r of s.summary!) expect(r.points).toBe(r.out ? 0 : r.left.reduce((t, x) => t + cardPoints(x, wildOf(s)), 0));
      ctx.now += ROUND_END_MS * 2;
      expect(realms.tick!(ctx, s)).toBe(true);
      continue;
    }
    sched.length = 0;
    const t0 = performance.now();
    realms.botPlan!(ctx, s, seats);
    times.push(performance.now() - t0);
    expect(sched.length).toBe(1);
    const job = sched[0];
    expect(job.by).toBe(s.turn);
    ctx.now += job.delay;
    // never an illegal move: act would throw
    realms.act(ctx, s, job.by, job.a);
    if (s.phase === 'play') {
      expect(totalCards(s)).toBe(116);
      for (const id of s.active) {
        const n = s.hands[id].length;
        expect(n === wildOf(s) || (id === s.turn && s.step === 'discard' && n === wildOf(s) + 1)).toBe(true);
      }
    }
  }
  times.sort((a, b) => a - b);
  // (a percentile: other test files run beside this one and a GC pause is not the bot's thinking)
  return { s, steps, rounds, p98: times[Math.floor(times.length * 0.98)] ?? 0 };
}

test('bots finish whole games at every level, 2 to 7 players, quickly and legally', () => {
  for (const [players, level, short] of [
    [2, 'easy', true],
    [3, 'smart', true],
    [4, 'expert', true],
    [7, 'expert', false],
    [5, 'easy', false],
    [2, 'smart', false],
  ] as const) {
    const { s, p98 } = playOut(players, level, short);
    expect(s.phase).toBe('final');
    expect(s.history.length).toBe(short ? 6 : 11);
    expect(s.winner).not.toBeNull();
    expect(p98).toBeLessThan(200);
    const r = realms.result!(s)!;
    expect(r.places.flat().length).toBe(players);
  }
}, 240_000);

test('expert beats easy over a few games', () => {
  let expertTotal = 0;
  let easyTotal = 0;
  for (let g = 0; g < 4; g++) {
    const sched: any[] = [];
    const ctx: any = { now: 0, fx: () => {}, isConnected: () => true, isBot: () => true, playerName: (id: string) => id, memo: new Map(), bot: (by: string, key: string, delay: number, a: any) => sched.push({ by, a }), say: () => {} };
    const seats = ['x', 'e'];
    const s = realms.start(ctx, seats, { rounds: 'short', timer: 0 });
    let steps = 0;
    while (s.phase !== 'final' && steps++ < 20_000) {
      if (s.phase === 'roundEnd') {
        ctx.now += ROUND_END_MS * 2;
        realms.tick!(ctx, s);
        continue;
      }
      const move = planBot(s, s.turn, s.turn === 'x' ? 'expert' : 'easy');
      realms.act(ctx, s, s.turn, move);
    }
    expertTotal += s.scores.x;
    easyTotal += s.scores.e;
  }
  expect(expertTotal).toBeLessThan(easyTotal);
}, 120_000);

/* ------------------------------------------------------------------ */
/* the view, leaving, the voice                                        */
/* ------------------------------------------------------------------ */

test('view: my hand and plan only; the others’ counts; the plan offers going out', () => {
  const { ctx, s } = setup(['a', 'b'], []);
  const p = s.turn;
  const q = s.seats.find((x) => x !== p)!;
  s.hands[p] = [c(4), c(5), c(6), c(13, 'leaf')];
  const v = realms.view(ctx, s, p) as any;
  expect(v.myHand.length).toBe(4);
  expect(v.plan.outCards).toEqual([s.hands[p][3].id]);
  // the card to throw is set apart: the rest all fits
  expect(v.plan.throw).toBe(s.hands[p][3].id);
  expect(v.plan.points).toBe(0);
  const w = realms.view(ctx, s, q) as any;
  expect(w.myHand.map((x: RealmCard) => x.id)).toEqual(s.hands[q].map((x) => x.id));
  expect(w.plan.outCards).toEqual([]);
  expect(w.plan.throw).toBeNull();
  expect(w.plan.points).toBe(leftPoints(s.hands[q], 3));
  expect(w.counts[p]).toBe(4);
});

test('onLeave: the leaver’s turn passes on, a pending last turn is dropped; one player left ends the game', () => {
  const { ctx, s } = setup(['a', 'b', 'c'], []);
  const p = s.turn;
  s.hands[p] = [c(4), c(5), c(6), c(13, 'leaf')];
  realms.act(ctx, s, p, { type: 'out', card: s.hands[p][3].id });
  const [n1, n2] = s.lastTurn;
  realms.onLeave!(ctx, s, n1);
  expect(s.turn).toBe(n2);
  realms.onLeave!(ctx, s, n2);
  expect(s.phase).toBe('final');
  expect(s.winner).toBe(p);
});

test('voice: the new wild and going out are short vowelled calls', () => {
  for (let r = 3; r <= 13; r++) {
    const v = voiceRealmsWild(r);
    expect(REALMS_RANK_VOICE[r]).toBeTruthy();
    expect(v).toMatch(/^[ء-يً-ْ ]+$/);
    expect(v.split(' ').length).toBeLessThanOrEqual(4);
  }
  expect(voiceRealmsOut('سارة')).toMatch(/^[ء-يً-ْ ]+$/);
  const { said } = fakeCtx();
  const f = fakeCtx();
  realms.start(f.ctx, ['a', 'b'], { ...REALMS_DEFAULTS });
  expect(f.said[f.said.length - 1].voice).toBe(voiceRealmsWild(3));
  expect(said.length).toBe(0);
});
