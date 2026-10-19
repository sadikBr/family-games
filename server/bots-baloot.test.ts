/**
 * The bots of البلوط (Saudi and Moroccan rules) and التريس: the expert beats the old bot, solves
 * known positions, decides within the budget and only ever plays legal moves.
 * Strength tests use fixed sample counts and seeded randomness (setMindBudget / setTrisBudget), so
 * they give the same result on a fast or a busy machine.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';

import { makeBalootDeck, legalCards } from '../src/shared/baloot-rules';
import { maLegal } from '../src/shared/baloot-morocco';
import { makeDeck, type Card } from '../src/shared/cards';
import type { BCard, BRank, BSuit } from '../src/shared/games/baloot';
import { Sim, ddValue, maskOf, trumpIndex } from './ai/baloot-engine';
import { mindPlay, setMindBudget } from './ai/baloot-mind';
import { setTrisBudget } from './ai/tris-mind';
import { baloot, decide, turnOf, type State } from './games/baloot';
import { tris, trisBotCard, trisPlayable, type State as TrisState } from './games/tris';

const P = ['p0', 'p1', 'p2', 'p3'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const realRandom = Math.random;
beforeAll(() => {
  // repeatable: the same samples whatever the machine's speed
  setMindBudget({ play: 20, bid: 48 });
  setTrisBudget(24);
});
afterAll(() => {
  setMindBudget(null);
  setTrisBudget(null);
  Math.random = realRandom;
});

const ctxOf = (): any => ({ now: 1000, fx() {}, isConnected: () => true, isBot: () => true, playerName: (id: string) => id, memo: new Map(), bot() {}, say() {} });

type Lvl = 'expert' | 'smart' | 'easy' | 2;

/** One Baloot hand dealt from `seed`, each seat at its level; the hand result (null: no purchase). */
function balootHand(seed: number, mode: 'saudi' | 'morocco', lv: (seat: number) => Lvl, check?: (s: State, id: string, card: string) => void) {
  const ctx = ctxOf();
  const s = baloot.start(ctx, P, { mode, target: mode === 'morocco' ? 1000 : 152, timer: 0, doubling: true, level: 2 }) as State;
  const r = rng(seed);
  const deck = makeBalootDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  s.dealer = seed % 4;
  const order = [1, 2, 3, 0].map((k) => P[(s.dealer + k) % 4]);
  s.hands = Object.fromEntries(P.map((id) => [id, [] as BCard[]]));
  for (const id of order) s.hands[id].push(...deck.splice(0, 5));
  s.faceUp = deck.shift()!;
  s.stock = deck;
  s.bid = { round: 1, stage: 'main', order, queue: order.slice(), calls: {}, best: null };
  for (let i = 0; i < 4000; i++) {
    if (s.phase === 'handEnd' || s.phase === 'final') return s.result;
    if (s.phase === 'bid' && s.redealAt !== null) return null;
    if (s.claim && !s.claimed) {
      baloot.act(ctx, s, s.claim.by, { type: 'claim' });
      continue;
    }
    const id = turnOf(s)[0];
    if (id) {
      const a = decide(s, id, lv(P.indexOf(id)))!;
      if (a.type === 'play' && check) check(s, id, a.card as string);
      baloot.act(ctx, s, id, a);
      continue;
    }
    ctx.now += 500;
    baloot.tick!(ctx, s);
  }
  throw new Error('stuck');
}

/** Duplicate series: every deal twice with the teams swapped; the expert pair's share of the points. */
function series(mode: 'saudi' | 'morocco', deals: number, x: Lvl, y: Lvl, seed0: number) {
  Math.random = rng(seed0);
  let px = 0;
  let py = 0;
  let wx = 0;
  let wy = 0;
  for (let k = 0; k < deals; k++) {
    for (const flip of [0, 1]) {
      const res = balootHand(seed0 + k, mode, (seat) => ((seat & 1) === flip ? x : y));
      if (!res) continue;
      const xs = flip === 0 ? 'A' : 'B';
      const ys = flip === 0 ? 'B' : 'A';
      px += res.points[xs];
      py += res.points[ys];
      if (res.points[xs] > res.points[ys]) wx++;
      else if (res.points[ys] > res.points[xs]) wy++;
    }
  }
  Math.random = realRandom;
  return { share: px / (px + py), px, py, wx, wy };
}

test('البلوط (Saudi): the expert pair beats the previous bot (the old «قوي») by a clear margin', () => {
  const r = series('saudi', 60, 'expert', 2, 4100);
  expect(r.share).toBeGreaterThan(0.55);
  expect(r.wx).toBeGreaterThan(r.wy);
}, 60_000);

test('البلوط (Moroccan): the expert pair beats the previous bot by a clear margin', () => {
  const r = series('morocco', 60, 'expert', 2, 5200);
  expect(r.share).toBeGreaterThan(0.53);
  expect(r.wx).toBeGreaterThan(r.wy);
}, 60_000);

/* ------------------------------------------------------------------ */
/* Known positions                                                     */
/* ------------------------------------------------------------------ */

const c = (id: string): BCard => ({ id, suit: id.slice(-1) as BSuit, rank: id.slice(0, -1) as BRank });
const cs = (s: string) => s.split(' ').map(c);

/** a hand in play (p0 bought), `turn` to play after the trick on the table */
function position(mode: 'saudi' | 'morocco', trump: BSuit | null, hands: string[], turn: string, trick: [string, string][]) {
  const ctx = ctxOf();
  const s = baloot.start(ctx, P, { mode, target: 152, timer: 0, doubling: false, level: 2 }) as State;
  s.phase = 'play';
  s.bid = null;
  s.faceUp = null;
  s.contract = { mode: trump ? 'hokm' : 'sun', trump, buyer: 'p0', caller: 'p0', call: trump ? 'hokm' : 'sun', mult: 1, gahwa: false };
  s.hands = Object.fromEntries(P.map((id, i) => [id, cs(hands[i])]));
  s.trick = trick.map(([by, id]) => ({ by, card: c(id) }));
  s.trickNo = 9 - Math.max(...P.map((id) => s.hands[id].length));
  s.turn = turn;
  s.pauseUntil = null;
  // every other card was played in the earlier tricks
  const here = new Set([...hands.join(' ').split(' '), ...trick.map((t) => t[1])]);
  s.played = makeBalootDeck().filter((x) => !here.has(x.id));
  return s;
}

test('known positions: last to play, the only card that takes the trick (both rules)', () => {
  Math.random = rng(9);
  for (const [mode, trump] of [
    ['saudi', null],
    ['saudi', 'H'],
    ['morocco', 'H'],
  ] as const) {
    // K♠ J♠ Q♠ on the table (9 points): only the 10♠ takes it
    const s = position(mode, trump, ['7D', '7C', '8D', '10S 9S'], 'p3', [
      ['p0', 'KS'],
      ['p1', 'JS'],
      ['p2', 'QS'],
    ]);
    const legal = cs('10S 9S');
    expect(mindPlay(s, 'p3', legal, 'expert').id).toBe('10S');
  }
  Math.random = realRandom;
});

test('known positions: the exact solver finds the counter-intuitive order (K♥ before the A♠)', () => {
  // صن, سارة leads with A♠ K♥: cashing the ace first gives 21; K♥ first keeps the A♠ for the last trick: 31
  const x = new Sim(trumpIndex(null), false);
  x.h = ['AS KH', '10S AH', '7S 7D', '8S 8D'].map((h) => maskOf(cs(h)));
  x.left = 8;
  x.turn = 0;
  const best = ddValue(x, 0);
  expect(Math.floor(best / 16)).toBe(31);
  const ace = x.clone();
  ace.play(maskIndex('AS'));
  const king = x.clone();
  king.play(maskIndex('KH'));
  expect(Math.floor(ddValue(ace, 0) / 16) + 0).toBe(21);
  expect(Math.floor(ddValue(king, 0) / 16)).toBe(31);
});

const maskIndex = (id: string) => 31 - Math.clz32(maskOf([c(id)]));

/* ------------------------------------------------------------------ */
/* Time and legality                                                   */
/* ------------------------------------------------------------------ */

test('decision time: the expert stays within the budget (time-capped search)', () => {
  setMindBudget(null);
  setTrisBudget(null);
  try {
    const times: number[] = [];
    Math.random = rng(77);
    for (let k = 0; k < 3; k++) {
      balootHand(900 + k, k === 1 ? 'morocco' : 'saudi', () => 'expert', () => {});
    }
    // measure the play decisions of one more hand
    balootHand(950, 'saudi', (seat) => (seat === 0 ? 'expert' : 2), (s, id) => {
      if (id !== 'p0') return;
      const legal = s.hands[id].filter((x) => (s.settings.mode === 'morocco' ? maLegal(s.hands[id], s.trick, s.contract!.trump!) : legalCards(s.hands[id], s.trick, s.contract!.trump, s.leadBoss)).some((y) => y.id === x.id));
      const t0 = performance.now();
      mindPlay(s, id, legal, 'expert');
      times.push(performance.now() - t0);
    });
    times.sort((a, b) => a - b);
    // the search stops itself at ~28 ms (generous margins for a busy test machine)
    expect(times.reduce((a, b) => a + b, 0) / times.length).toBeLessThan(90);
    expect(times[times.length - 1]).toBeLessThan(500);
  } finally {
    setMindBudget({ play: 20, bid: 48 });
    setTrisBudget(24);
    Math.random = realRandom;
  }
}, 60_000);

test('legal moves only: expert and smart bots over many hands (both rules)', () => {
  Math.random = rng(31);
  let plays = 0;
  for (let k = 0; k < 12; k++) {
    const mode = k % 2 ? 'morocco' : 'saudi';
    balootHand(3000 + k, mode, (seat) => (seat % 2 ? 'smart' : 'expert'), (s, id, card) => {
      const legal = mode === 'morocco' ? maLegal(s.hands[id], s.trick, s.contract!.trump!) : legalCards(s.hands[id], s.trick, s.contract!.trump, s.leadBoss);
      expect(legal.some((x) => x.id === card)).toBe(true);
      plays++;
    });
  }
  expect(plays).toBeGreaterThan(100);
  Math.random = realRandom;
}, 60_000);

/* ------------------------------------------------------------------ */
/* التريس                                                              */
/* ------------------------------------------------------------------ */

function trisHand(seed: number, lv: (seat: number) => 'expert' | 'smart' | 'easy', check?: (s: TrisState, id: string, card: Card) => void) {
  const ctx = ctxOf();
  const s = tris.start(ctx, P, { target: 500 } as any) as TrisState;
  const r = rng(seed);
  const deck = makeDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  s.hands = Object.fromEntries(P.map((id, i) => [id, deck.slice(i * 10, i * 10 + 10)]));
  s.turnIdx = seed % 4;
  for (let i = 0; i < 2000 && s.phase !== 'handEnd'; i++) {
    if (s.claim && !s.claimed) {
      tris.act(ctx, s, s.claim.by, { type: 'claim' });
      continue;
    }
    if (s.phase === 'play') {
      const id = s.seats[s.turnIdx];
      const card = trisBotCard(s, id, lv(P.indexOf(id)));
      check?.(s, id, card);
      tris.act(ctx, s, id, { type: 'play', card: card.id });
      continue;
    }
    ctx.now += 3000;
    tris.tick!(ctx, s);
  }
  return s;
}

test('التريس: the expert pair beats the old bot clearly; legal moves only', () => {
  Math.random = rng(61);
  let tx = 0;
  let ty = 0;
  for (let k = 0; k < 16; k++) {
    for (const flip of [0, 1]) {
      const s = trisHand(700 + k, (seat) => ((seat & 1) === flip ? 'expert' : 'easy'), (st, id, card) => {
        expect(trisPlayable(st.hands[id], st.trick).some((x) => x.id === card.id)).toBe(true);
      });
      tx += s.handThirds[flip === 0 ? 'A' : 'B'];
      ty += s.handThirds[flip === 0 ? 'B' : 'A'];
    }
  }
  Math.random = realRandom;
  expect(tx / (tx + ty)).toBeGreaterThan(0.6);
}, 60_000);

test('التريس: last to play, the only winning card; points to a partner who surely holds the trick', () => {
  Math.random = rng(5);
  const ctx = ctxOf();
  const s = tris.start(ctx, P, { target: 500 } as any) as TrisState;
  const t = (id: string): Card => ({ id, suit: id.split('-')[0] as Card['suit'], rank: Number(id.split('-')[1]) });
  // 12 of coins led, 11 and 4 followed: the 1 of coins (the only card above the 12) takes it with a point
  s.hands = { p0: [t('cups-4')], p1: [t('cups-5')], p2: [t('cups-6')], p3: [t('coins-1'), t('coins-5')] };
  s.trick = [
    { by: 'p0', card: t('coins-12') },
    { by: 'p1', card: t('coins-11') },
    { by: 'p2', card: t('coins-4') },
  ];
  s.trickNo = 9;
  s.turnIdx = 3;
  s.log = [];
  expect(trisBotCard(s, 'p3', 'expert').id).toBe('coins-1');
  // يوسف (my partner) played the 3 of swords: it can't be beaten; I have no sword: the 1 of cups (a point) goes to him
  s.hands = { p0: [t('cups-3')], p1: [t('cups-5')], p2: [t('clubs-6')], p3: [t('cups-1'), t('clubs-4')] };
  s.trick = [
    { by: 'p0', card: t('swords-4') },
    { by: 'p1', card: t('swords-3') },
    { by: 'p2', card: t('swords-5') },
  ];
  expect(trisBotCard(s, 'p3', 'expert').id).toBe('cups-1');
  Math.random = realRandom;
});
