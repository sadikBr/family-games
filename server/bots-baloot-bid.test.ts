/**
 * «البلوط» — the bots' purchases (Saudi and Moroccan rules) and their strength against the previous
 * bots (frozen in ./ai/baloot-ref): no purchase with a clearly negative expected score at any level,
 * the expert's contracts mostly made, the new expert ahead of the old one on seeded deals, bounded
 * decision times, legal moves at every level.
 * Fixed sample counts and seeded randomness: the same result on a fast or a busy machine.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';

import { legalCards, makeBalootDeck } from '../src/shared/baloot-rules';
import { maLegal } from '../src/shared/baloot-morocco';
import type { BCard, BSuit } from '../src/shared/games/baloot';
import { BAD_VALUE, hokmEval } from './ai/baloot-bid';
import { setMindBudget } from './ai/baloot-mind';
import { refDecide, setRefBudget } from './ai/baloot-ref/decide';
import { baloot, bidOptions, decide, turnOf, type State } from './games/baloot';
import type { GameAction } from '../src/shared/protocol';

const P = ['p0', 'p1', 'p2', 'p3'];
type Mode = 'saudi' | 'morocco';
type Lvl = 'easy' | 'smart' | 'expert';

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
  setMindBudget({ play: 20, bid: 24 });
  setRefBudget({ play: 20, bid: 24 });
});
afterAll(() => {
  setMindBudget(null);
  setRefBudget(null);
  Math.random = realRandom;
});

const ctxOf = (): any => ({ now: 1000, fx() {}, isConnected: () => true, isBot: () => true, playerName: (id: string) => id, memo: new Map(), bot() {}, say() {} });

/** a fresh hand of `mode` dealt from `seed` (bidding not started) */
function dealt(mode: Mode, seed: number) {
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
  return { ctx, s };
}

type Agent = (s: State, id: string) => GameAction | null;

/** play the hand to its end; the buyer's side and whether its contract failed (null: everyone passed) */
function playOut(ctx: any, s: State, agent: (seat: number) => Agent, check?: (s: State, id: string, a: GameAction) => void) {
  for (let i = 0; i < 4000; i++) {
    if (s.phase === 'handEnd' || s.phase === 'final') return s.result;
    if (s.phase === 'bid' && s.redealAt !== null) return null;
    if (s.claim && !s.claimed) {
      baloot.act(ctx, s, s.claim.by, { type: 'claim' });
      continue;
    }
    const id = turnOf(s)[0];
    if (id) {
      const a = agent(P.indexOf(id))(s, id)!;
      check?.(s, id, a);
      baloot.act(ctx, s, id, a);
      continue;
    }
    ctx.now += 500;
    baloot.tick!(ctx, s);
  }
  throw new Error('stuck');
}

test('purchases: no bot buys a حكم whose expected score is clearly negative (every level, both rules, 2,000 positions each)', () => {
  for (const mode of ['morocco', 'saudi'] as const) {
    for (const level of ['easy', 'smart', 'expert'] as const) {
      Math.random = rng(mode.length * 100 + level.length);
      let buys = 0;
      let asked = 0;
      for (let k = 0; k < 2000; k++) {
        const { ctx, s } = dealt(mode, 10_000 + k);
        // a random moment of the bidding: everyone before passed (the 2nd round included)
        const steps = k % 8;
        for (let i = 0; i < steps && s.phase === 'bid'; i++) {
          const id = turnOf(s)[0];
          const opts = bidOptions(s, id).map((o) => o.call);
          if (!opts.includes('pass')) break;
          baloot.act(ctx, s, id, { type: 'bid', call: 'pass' });
        }
        if (s.phase !== 'bid' || s.redealAt !== null) continue;
        const id = turnOf(s)[0];
        const options = bidOptions(s, id);
        if (options.length === 1 || options.some((o) => o.call === 'confirm')) continue; // forced / already bought
        const a = decide(s, id, level)!;
        asked++;
        if (a.call !== 'hokm' && a.call !== 'hokm2') continue;
        buys++;
        const suit = (a.call === 'hokm' ? s.faceUp!.suit : a.suit) as BSuit;
        const e = hokmEval([...s.hands[id], s.faceUp!], suit, mode === 'morocco', s.bid!.order[0] === id);
        if (e.value < BAD_VALUE[mode]) throw new Error(`${mode} ${level}: bought ${suit} with ${[...s.hands[id], s.faceUp!].map((c) => c.id).join(' ')} (estimate ${e.value.toFixed(1)})`);
      }
      // they do buy (the test is not passed by never buying)
      expect(buys / asked).toBeGreaterThan(0.05);
    }
  }
  Math.random = realRandom;
}, 60_000);

test('purchases: the expert makes most of its contracts (both rules)', () => {
  for (const mode of ['morocco', 'saudi'] as const) {
    Math.random = rng(mode === 'morocco' ? 71 : 72);
    let made = 0;
    let bought = 0;
    const expert: Agent = (s, id) => decide(s, id, 'expert');
    for (let k = 0; k < 90; k++) {
      const { ctx, s } = dealt(mode, 20_000 + k);
      const res = playOut(ctx, s, () => expert);
      if (!res || res.contract.mode !== 'hokm') continue;
      bought++;
      if (!res.failed) made++;
    }
    // measured ~84 % (Moroccan) / ~80 % (Saudi) over thousands of deals (scripts/baloot-selfplay.ts)
    expect(bought).toBeGreaterThan(40);
    expect(made / bought).toBeGreaterThan(mode === 'morocco' ? 0.72 : 0.68);
  }
  Math.random = realRandom;
}, 60_000);

/** duplicate series: every deal twice, teams swapped; the new expert pair's share of the points */
function versusOld(mode: Mode, deals: number, seed0: number) {
  Math.random = rng(seed0);
  const nu: Agent = (s, id) => decide(s, id, 'expert');
  const old: Agent = (s, id) => refDecide(s, id, 'expert');
  let pn = 0;
  let po = 0;
  for (let k = 0; k < deals; k++) {
    for (const flip of [0, 1]) {
      const { ctx, s } = dealt(mode, seed0 + k);
      const res = playOut(ctx, s, (seat) => ((seat & 1) === flip ? nu : old));
      if (!res) continue;
      pn += res.points[flip === 0 ? 'A' : 'B'];
      po += res.points[flip === 0 ? 'B' : 'A'];
    }
  }
  Math.random = realRandom;
  return pn / (pn + po);
}

test('strength: the new expert pair scores more than the previous expert pair (Moroccan, seeded deals)', () => {
  // the new expert thinks longer per card (45 ms instead of 28): more sampled deals per decision
  setMindBudget({ play: 40, bid: 24 });
  setRefBudget({ play: 24, bid: 24 });
  try {
    // 70 deals × 2: 51.6 % here (50.2–52.1 % over five seeds of 70 deals)
    expect(versusOld('morocco', 70, 6100)).toBeGreaterThan(0.5);
  } finally {
    setMindBudget({ play: 20, bid: 24 });
    setRefBudget({ play: 20, bid: 24 });
  }
}, 60_000);

test('decision time: purchases and cards stay well under 300 ms (real time budgets)', () => {
  setMindBudget(null);
  try {
    Math.random = rng(404);
    const times: number[] = [];
    const timed: Agent = (s, id) => {
      const t0 = performance.now();
      const a = decide(s, id, 'expert');
      times.push(performance.now() - t0);
      return a;
    };
    for (let k = 0; k < 2; k++) {
      const { ctx, s } = dealt(k ? 'saudi' : 'morocco', 30_000 + k);
      playOut(ctx, s, () => timed);
    }
    times.sort((a, b) => a - b);
    expect(times.length).toBeGreaterThan(8);
    // the search stops itself at ~45 ms (~100 ms at worst); generous margins for a busy test machine
    expect(times[times.length - 1]).toBeLessThan(300);
  } finally {
    setMindBudget({ play: 20, bid: 24 });
    Math.random = realRandom;
  }
}, 60_000);

test('legal moves only: every level over whole hands (both rules)', () => {
  Math.random = rng(808);
  let plays = 0;
  const levels: Lvl[] = ['easy', 'smart', 'expert'];
  for (let k = 0; k < 12; k++) {
    const mode: Mode = k % 2 ? 'morocco' : 'saudi';
    const { ctx, s } = dealt(mode, 40_000 + k);
    playOut(
      ctx,
      s,
      (seat) => (st, id) => decide(st, id, levels[(seat + k) % 3]),
      (st, id, a) => {
        if (st.phase === 'bid') {
          expect(bidOptions(st, id).some((o) => o.call === a.call)).toBe(true);
          return;
        }
        if (st.phase !== 'play') return;
        const legal = mode === 'morocco' ? maLegal(st.hands[id], st.trick, st.contract!.trump!) : legalCards(st.hands[id], st.trick, st.contract!.trump, st.leadBoss);
        expect(legal.some((x) => x.id === a.card)).toBe(true);
        plays++;
      },
    );
  }
  expect(plays).toBeGreaterThan(100);
  Math.random = realRandom;
}, 60_000);
