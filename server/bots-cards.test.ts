/**
 * The strong card bots (روندا, الكانزة, الكونكان, الكذّاب, أونو فليب, المراحل العشر):
 * 1. the expert beats the old bot (kept as 'easy') in seeded bot-vs-bot series,
 * 2. known positions are played right,
 * 3. a decision stays within the time budget,
 * 4. no illegal move in many games, at every level and table size.
 * Results don't depend on the machine: Math.random is seeded and the sampling bots use a fixed number of
 * samples here (cardsTuning) instead of their wall-clock budget.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';

import type { Card } from '../src/shared/cards';
import type { P10Card } from '../src/shared/games/phase10';
import type { BotLevel } from '../src/shared/protocol';
import type { UnoCard } from '../src/shared/uno';
import { kanzaBotMove } from './ai/cards-kanza';
import { kdabCall, kdabTurn, knowPlay, knowReveal, newHabits, newKnow, type KdabKnowledge } from './ai/cards-kdab';
import { bestSplit, konkanBotAction, type KonkanKnowledge } from './ai/cards-konkan';
import { p10BotAction, type P10Knowledge } from './ai/cards-phase10';
import { rondaBotCard, type RondaKnowledge } from './ai/cards-ronda';
import { simulate, withSeed } from './ai/cards-sim';
import { cardsTuning } from './ai/cards-tuning';
import { unoColor, unoTurn, type UnoKnowledge } from './ai/cards-uno';
import { kanza } from './games/kanza';
import { kdab } from './games/kdab';
import { konkan } from './games/konkan';
import { phase10 } from './games/phase10';
import { ronda } from './games/ronda';
import { unoflip } from './games/unoflip';
import type { GameModule } from './types';

beforeAll(() => {
  cardsTuning.samples = 60;
});
afterAll(() => {
  cardsTuning.samples = 0;
});

/* ------------------------------------------------------------------ */
/* series                                                              */
/* ------------------------------------------------------------------ */

interface Series {
  wins: number;
  games: number;
  illegal: number;
  stuck: number;
  scoreA: number;
  scoreB: number;
}

/**
 * `games` games of level A against level B. Two players: seats swapped every other game on the same
 * deal (paired seeds). With `team` (4 players) A holds seats 0 and 2. With `np` > 2 and no team: one A
 * against np-1 B, A's seat rotating.
 */
function series<S, T>(
  mod: GameModule<S, T>,
  settings: T,
  games: number,
  A: BotLevel,
  B: BotLevel,
  opts: { np?: number; team?: boolean; seed?: number; score?: (s: S, id: string) => number } = {},
): Series {
  const np = opts.np ?? 2;
  const out: Series = { wins: 0, games, illegal: 0, stuck: 0, scoreA: 0, scoreB: 0 };
  for (let i = 0; i < games; i++) {
    const ids = Array.from({ length: np }, (_, k) => `p${k}`);
    const levels: Record<string, BotLevel> = {};
    ids.forEach((id, k) => {
      if (opts.team) levels[id] = (k % 2 === 0) === (i % 2 === 0) ? A : B;
      else if (np === 2) levels[id] = (k === 0) === (i % 2 === 0) ? A : B;
      else levels[id] = k === i % np ? A : B;
    });
    const seed = (opts.seed ?? 1) * 1000 + (np === 2 || opts.team ? Math.floor(i / 2) : i);
    const r = simulate(mod, ids, levels, settings, { seed });
    out.illegal += r.illegal;
    if (r.stuck) out.stuck++;
    const first = r.result?.places[0] ?? [];
    if (first.some((id) => levels[id] === A) && !first.some((id) => levels[id] === B)) out.wins++;
    if (opts.score) {
      for (const id of ids) {
        if (levels[id] === A) out.scoreA += opts.score(r.state as S, id);
        else out.scoreB += opts.score(r.state as S, id);
      }
    }
  }
  return out;
}

const pct = (s: Series) => Math.round((100 * s.wins) / s.games);

test('روندا: the expert beats the old bot (2 players and 2 v 2)', () => {
  const duel = series(ronda, { target: 31 }, 24, 'expert', 'easy', { seed: 11 });
  console.log(`ronda 1v1 expert vs old: ${duel.wins}/${duel.games} (${pct(duel)}%)`);
  expect(duel.illegal).toBe(0);
  expect(pct(duel)).toBeGreaterThanOrEqual(70);
  const teams = series(ronda, { target: 31 }, 40, 'expert', 'easy', { np: 4, team: true, seed: 12 });
  console.log(`ronda 2v2 expert+expert vs old+old: ${teams.wins}/${teams.games} (${pct(teams)}%)`);
  expect(teams.illegal).toBe(0);
  expect(pct(teams)).toBeGreaterThanOrEqual(60);
}, 60_000);

test('الكانزة: the expert beats the old bot, with a clear point margin', () => {
  const r = series(kanza, { hands: 3 }, 30, 'expert', 'easy', { seed: 21, score: (s: any, id) => s.scores[id] ?? 0 });
  console.log(`kanza expert vs old: ${r.wins}/${r.games} (${pct(r)}%), points ${r.scoreA} vs ${r.scoreB}`);
  expect(r.illegal).toBe(0);
  expect(pct(r)).toBeGreaterThanOrEqual(65);
  expect(r.scoreA).toBeGreaterThan(r.scoreB * 1.08);
}, 60_000);

test('الكونكان: the expert beats the old bot and pays far fewer penalty points', () => {
  const r = series(konkan, { limit: 100 }, 40, 'expert', 'easy', { seed: 31, score: (s: any, id) => s.scores[id] ?? 0 });
  console.log(`konkan expert vs old: ${r.wins}/${r.games} (${pct(r)}%), penalty ${r.scoreA} vs ${r.scoreB}`);
  expect(r.illegal).toBe(0);
  expect(r.stuck).toBe(0);
  expect(pct(r)).toBeGreaterThanOrEqual(60);
  expect(r.scoreA).toBeLessThan(r.scoreB * 0.9);
}, 60_000);

test('الكذّاب: the expert wins most games against old bots at a table of 3 and of 4', () => {
  const three = series(kdab, { maxPlay: 4 }, 60, 'expert', 'easy', { np: 3, seed: 41 });
  console.log(`kdab 1 expert vs 2 old: ${three.wins}/${three.games} (${pct(three)}%, fair share 33%)`);
  expect(three.illegal).toBe(0);
  expect(three.stuck).toBe(0);
  expect(pct(three)).toBeGreaterThanOrEqual(70);
  const four = series(kdab, { maxPlay: 4 }, 40, 'expert', 'easy', { np: 4, seed: 42 });
  console.log(`kdab 1 expert vs 3 old: ${four.wins}/${four.games} (${pct(four)}%, fair share 25%)`);
  expect(pct(four)).toBeGreaterThanOrEqual(60);
  // a duel against the old bot is mostly decided by who starts (it plays almost only truthfully):
  // the expert at least holds its own
  const duel = series(kdab, { maxPlay: 4 }, 60, 'expert', 'easy', { seed: 43 });
  console.log(`kdab 1v1 expert vs old: ${duel.wins}/${duel.games} (${pct(duel)}%)`);
  expect(pct(duel)).toBeGreaterThanOrEqual(40);
}, 60_000);

test('أونو فليب: the expert beats the old bot', () => {
  const r = series(unoflip, { target: 250 }, 120, 'expert', 'easy', { seed: 51 });
  console.log(`unoflip expert vs old: ${r.wins}/${r.games} (${pct(r)}%)`);
  expect(r.illegal).toBe(0);
  expect(r.stuck).toBe(0);
  expect(pct(r)).toBeGreaterThanOrEqual(64);
}, 60_000);

test('المراحل العشر: the expert beats the old bot', () => {
  // Phase 10 is mostly the luck of the draw, and the old bot already built its phase sensibly:
  // the margin is smaller here (about 60 % over a few hundred paired games)
  const r = series(phase10, { short: true }, 80, 'expert', 'easy', { seed: 61 });
  console.log(`phase10 expert vs old: ${r.wins}/${r.games} (${pct(r)}%)`);
  expect(r.illegal).toBe(0);
  expect(r.stuck).toBe(0);
  expect(pct(r)).toBeGreaterThanOrEqual(55);
}, 60_000);

/* ------------------------------------------------------------------ */
/* known positions                                                     */
/* ------------------------------------------------------------------ */

const C = (id: string): Card => {
  const [suit, rank] = id.split('-');
  return { id, suit: suit as Card['suit'], rank: Number(rank) };
};
const cards = (...ids: string[]) => ids.map(C);
const duelSides = [
  { key: 'me', members: ['me'] },
  { key: 'op', members: ['op'] },
];

function rondaPos(over: Partial<RondaKnowledge>): RondaKnowledge {
  return {
    me: 'me',
    seats: ['me', 'op'],
    sides: duelSides,
    turnIdx: 0,
    dealerIdx: 1,
    hand: [],
    table: [],
    seen: [],
    handCounts: { me: 0, op: 4 },
    deckLeft: 20,
    lastPlayed: null,
    chain: null,
    ...over,
  };
}

test('روندا positions: answer a دقة with «ف جوج», take the دقة, no gift next to the table, the dealer’s last card takes', () => {
  withSeed(5, () => {
    // the opponent just took my 5 with a دقة: my third 5 takes the three cards back (+5)
    const chain = { by: 'op', side: 'op', rank: 5, cards: cards('cups-5', 'coins-5') };
    const a = rondaPos({ turnIdx: 0, hand: cards('swords-5', 'clubs-12', 'cups-2'), table: cards('coins-7'), chain, handCounts: { me: 3, op: 3 } });
    // seats: op played before me
    a.seats = ['op', 'me'];
    a.turnIdx = 1;
    a.dealerIdx = 0;
    expect(rondaBotCard(a, 'expert').id).toBe('swords-5');
    // the card the opponent just dropped can be taken (دقة) — and it clears the table (ميسا)
    const b = rondaPos({ seats: ['op', 'me'], turnIdx: 1, dealerIdx: 0, hand: cards('coins-4', 'cups-11', 'swords-2'), table: cards('cups-4'), lastPlayed: { by: 'op', cardId: 'cups-4' }, handCounts: { me: 3, op: 3 } });
    expect(rondaBotCard(b, 'expert').id).toBe('coins-4');
    // nothing to take: don't drop the 7 next to the 6 on the table (any 6 would then take both)
    const c = rondaPos({ hand: cards('coins-7', 'cups-3', 'swords-3', 'clubs-11'), table: cards('cups-6'), handCounts: { me: 4, op: 4 } });
    expect(rondaBotCard(c, 'expert').id).not.toBe('coins-7');
    // last deal, the dealer's (my) last two cards: play the ace now, keep the king that takes the 12
    // (the dealer's last card must take — with the king it is +5, and the table)
    const d = rondaPos({ seats: ['op', 'me'], turnIdx: 1, dealerIdx: 1, deckLeft: 0, hand: cards('coins-1', 'coins-12'), table: cards('cups-12', 'cups-6'), handCounts: { me: 2, op: 1 } });
    expect(rondaBotCard(d, 'expert').id).toBe('coins-1');
  });
});

function kanzaPos(hand: string[], table: string[], deckLeft = 20, opp = 3) {
  return {
    me: 'me',
    seats: ['me', 'op'],
    sides: duelSides,
    turnIdx: 0,
    dealerIdx: 1,
    hand: cards(...hand),
    table: cards(...table),
    seen: [],
    handCounts: { me: hand.length, op: opp },
    deckLeft,
  };
}

test('الكانزة positions: take the ace of golds, prefer golds, never hand the next player a gold 15', () => {
  withSeed(6, () => {
    // the 4 takes the ace of golds with the 10 (4 + 1 + 10 = 15): +20 and more
    const a = kanzaBotMove(kanzaPos(['cups-4', 'swords-12', 'clubs-2'], ['coins-1', 'cups-10', 'clubs-3']), 'expert');
    expect(a.card.id).toBe('cups-4');
    expect(a.take.map((c) => c.id).sort()).toEqual(['coins-1', 'cups-10']);
    // two ways to make 15 with the 3: take the 12 of golds, not the 12 of cups
    const b = kanzaBotMove(kanzaPos(['cups-3', 'swords-1', 'clubs-2'], ['coins-12', 'cups-12']), 'expert');
    expect(b.card.id).toBe('cups-3');
    expect(b.take.map((c) => c.id)).toEqual(['coins-12']);
    // nothing to take: the 2 (2 + 11 + a 2) or the 1 (1 + 11 + a 3) would open more ways to the 11 of
    // golds; the 5 adds none
    const c = kanzaBotMove(kanzaPos(['cups-5', 'clubs-2', 'swords-1'], ['coins-11', 'cups-7']), 'expert');
    expect(c.take.length).toBe(0);
    expect(c.card.id).toBe('cups-5');
  });
});

function konkanPos(over: Partial<KonkanKnowledge>): KonkanKnowledge {
  return {
    me: 'me',
    step: 'play',
    hand: [],
    melds: [],
    discard: [],
    takenDiscard: null,
    next: ['op'],
    handCounts: { op: 10 },
    stockLeft: 15,
    reshuffles: 0,
    maxReshuffles: 2,
    log: [],
    ...over,
  };
}

test('الكونكان positions: the best meld split, going out in one go, no gifts, the face-up card that completes a meld', () => {
  // 5 5 5 + 5 6 7 of cups: the split that melds all six cards
  const sp = bestSplit(cards('cups-5', 'coins-5', 'swords-5', 'cups-6', 'cups-7', 'clubs-5'));
  expect(sp.dead.length).toBe(0);
  // melds + one card: lay everything (then throw the last card)
  const hand = cards('cups-1', 'cups-2', 'cups-3', 'coins-10', 'swords-10', 'clubs-10', 'coins-7');
  const a = konkanBotAction(konkanPos({ hand }), 'expert');
  expect(a.type).toBe('meld');
  // after the melds: the last card goes
  const b = konkanBotAction(konkanPos({ hand: cards('coins-7') }), 'expert');
  expect(b).toEqual({ type: 'discard', card: 'coins-7' });
  // a loose card that fits a meld on the table is laid off, never thrown to the next player
  const melds = [{ id: 1, owner: 'op', cards: cards('swords-4', 'swords-5', 'swords-6') }];
  const c = konkanBotAction(konkanPos({ hand: cards('swords-7', 'coins-12', 'cups-11', 'clubs-1', 'clubs-2'), melds }), 'expert');
  expect(c).toEqual({ type: 'layoff', cards: ['swords-7'], meld: 1 });
  // draw: the face-up 4 of golds completes 4-5-6 of golds → take it; a useless card → stock
  const d = konkanBotAction(konkanPos({ step: 'draw', hand: cards('coins-5', 'coins-6', 'cups-12', 'swords-11', 'clubs-1'), discard: cards('coins-4') }), 'expert');
  expect(d.type).toBe('drawDiscard');
  const e = konkanBotAction(konkanPos({ step: 'draw', hand: cards('coins-5', 'coins-6', 'cups-12', 'swords-11', 'clubs-1'), discard: cards('cups-3') }), 'expert');
  expect(e.type).toBe('drawStock');
  // throw: keep the pair and the neighbours, throw the lone king
  const f = konkanBotAction(konkanPos({ hand: cards('coins-5', 'coins-6', 'cups-2', 'swords-2', 'clubs-12', 'coins-1') }), 'expert');
  expect(f).toEqual({ type: 'discard', card: 'clubs-12' });
});

function kdabPos(over: Partial<KdabKnowledge>): KdabKnowledge {
  return {
    me: 'me',
    order: ['me', 'a', 'b'],
    hand: [],
    handCounts: { me: 10, a: 10, b: 10 },
    maxPlay: 4,
    rank: null,
    pileCount: 0,
    pileClaimed: 0,
    last: null,
    lastStarted: false,
    finishing: false,
    know: newKnow(),
    habits: newHabits(),
    ...over,
  };
}

test('الكذّاب positions: impossible claims are called, likely ones are not, cards seen in a reveal are remembered', () => {
  // I hold two 7s: «three 7s» is impossible
  const hand = cards('coins-7', 'cups-7', 'swords-1', 'clubs-2', 'cups-3', 'coins-4');
  const claim3 = kdabPos({ hand, rank: 7, pileCount: 3, pileClaimed: 3, last: { id: 1, by: 'a', count: 3, rank: 7 }, lastStarted: true });
  claim3.know.pileSoft.push({ play: 1, by: 'a', rank: 7, n: 3 });
  claim3.know.support = { play: 1, exact: 0, soft: 0 };
  expect(kdabCall(claim3, 'expert')).toBe(true);
  // «one 5» from a full hand, nothing known against it: let it go
  const claim1 = kdabPos({ hand, rank: 5, pileCount: 1, pileClaimed: 1, last: { id: 1, by: 'a', count: 1, rank: 5 }, lastStarted: true, handCounts: { me: 6, a: 13, b: 13 } });
  claim1.know.pileSoft.push({ play: 1, by: 'a', rank: 5, n: 1 });
  expect(kdabCall(claim1, 'expert')).toBe(false);
  // a reveal: «b» took a pile with two 5s shown in it → when «a» then claims three 5s holding… no:
  // the two 5s are in b's hand, I hold the third: «a» claiming two 5s is impossible
  const k = newKnow();
  knowPlay(k, 'me', 'a', 1, ['coins-5', 'cups-5'], 5, 8);
  knowReveal(k, 'me', 'b', 1, ['coins-5', 'cups-5']);
  expect(k.held.b.sort()).toEqual(['coins-5', 'cups-5']);
  knowPlay(k, 'me', 'a', 2, ['x', 'y'], 5, 6);
  const later = kdabPos({ hand: cards('swords-5', 'clubs-1', 'cups-2'), rank: 5, pileCount: 2, pileClaimed: 2, last: { id: 2, by: 'a', count: 2, rank: 5 }, lastStarted: true, know: k, handCounts: { me: 3, a: 6, b: 12 } });
  expect(kdabCall(later, 'expert')).toBe(true);
  // the last cards of a player are always challenged when they could be a lie
  const last = kdabPos({ hand, rank: 3, pileCount: 2, pileClaimed: 2, last: { id: 3, by: 'a', count: 1, rank: 3 }, finishing: true, handCounts: { me: 6, a: 0, b: 10 } });
  last.know.pileSoft.push({ play: 3, by: 'a', rank: 3, n: 1 });
  expect(kdabCall(last, 'expert')).toBe(true);
});

test('الكذّاب turns: a one-rank hand goes out in one play, it never ends its hand on a lie, it follows truthfully', () => {
  withSeed(8, () => {
    expect(kdabTurn(kdabPos({ hand: cards('coins-6', 'cups-6', 'swords-6') }), 'expert')).toEqual({ type: 'play', cards: ['coins-6', 'cups-6', 'swords-6'], rank: 6 });
    // its last card is not the rank in play: pass rather than finish on a lie
    const t = kdabTurn(kdabPos({ hand: cards('coins-2'), rank: 10, pileCount: 2, pileClaimed: 2, last: { id: 1, by: 'b', count: 2, rank: 10 } }), 'expert');
    expect(t).toEqual({ type: 'pass' });
    // holding the rank in play: all of it, truthfully
    const f = kdabTurn(kdabPos({ hand: cards('coins-11', 'cups-11', 'cups-1', 'swords-4'), rank: 11, pileCount: 1, pileClaimed: 1, last: { id: 1, by: 'b', count: 1, rank: 11 } }), 'expert') as any;
    expect(f.type).toBe('play');
    expect(f.cards.slice(0, 2).sort()).toEqual(['coins-11', 'cups-11']);
  });
});

const U = (id: string, light: UnoCard['light'], dark: UnoCard['dark'] = { kind: 'num', color: 'pink', n: 1 }): UnoCard => ({ id, light, dark });

function unoPos(over: Partial<UnoKnowledge>): UnoKnowledge {
  return {
    me: 'me',
    seats: ['me', 'op'],
    turnIdx: 0,
    dir: 1,
    side: 'light',
    top: { kind: 'num', color: 'red', n: 5 },
    color: 'red',
    hand: [],
    hands: { op: [] },
    memory: {},
    voids: {},
    drawn: null,
    scores: {},
    target: 250,
    ...over,
  };
}

test('أونو فليب positions: stop the player on their last card, chain a skip, name the colour they lack', () => {
  const op1 = [U('o1', { kind: 'num', color: 'blue', n: 2 })];
  // the opponent has one card left: hit them with +1 rather than a plain number
  const a = unoTurn(unoPos({ hand: [U('h1', { kind: 'num', color: 'red', n: 9 }), U('h2', { kind: 'draw1', color: 'red' }), U('h3', { kind: 'num', color: 'green', n: 1 })], hands: { op: op1 } }), 'expert');
  expect(a).toEqual({ type: 'play', card: 'h2' });
  // a known card in their hand (seen on its back before the flip) can't follow a red 9 → but can follow red 2
  const mem = { o1: 1 };
  const b = unoTurn(unoPos({ hand: [U('h1', { kind: 'num', color: 'red', n: 9 }), U('h4', { kind: 'num', color: 'red', n: 2 }), U('h5', { kind: 'num', color: 'red', n: 7 })], hands: { op: op1 }, memory: mem }), 'expert');
  expect(b.type).toBe('play');
  expect((b as any).card).not.toBe('h4'); // the 2 would let their blue 2 go out
  // a wild: name the colour the next player had to draw on
  const c = unoColor(unoPos({ hand: [U('h6', { kind: 'num', color: 'green', n: 3 }), U('h7', { kind: 'num', color: 'yellow', n: 4 })], hands: { op: [U('o2', { kind: 'num', color: 'green', n: 8 }), U('o3', { kind: 'num', color: 'green', n: 9 })] }, voids: { op: ['yellow'] }, top: { kind: 'wild', color: null } }), 'expert');
  expect(c).toBe('yellow');
});

function p10Pos(over: Partial<P10Knowledge>): P10Knowledge {
  return { me: 'me', step: 'play', hand: [], phase: 1, laid: [], groups: [], discard: [], next: ['op'], counts: { op: 10 }, phaseOf: { op: 1 }, skipped: [], log: [], ...over };
}
const N = (n: number, color: P10Card['color'] = 'orange', copy = 1): P10Card => ({ id: `${color}-${n}-${copy}`, kind: 'num', n, color });
const WILD = (i = 1): P10Card => ({ id: `wild-${i}`, kind: 'wild' });
const SKIP = (i = 1): P10Card => ({ id: `skip-${i}`, kind: 'skip' });

test('المراحل العشر positions: lay at once, keep wilds and pairs, skip the player about to go out, no card for their groups', () => {
  // phase 1 (two sets of 3) is there: lay it
  const lay = p10BotAction(p10Pos({ hand: [N(4), N(4, 'teal'), N(4, 'pink'), N(9), N(9, 'teal'), WILD(), N(1), N(12)] }), 'expert');
  expect(lay.type).toBe('lay');
  // keep wilds and pairs: throw a lone card
  const d = p10BotAction(p10Pos({ hand: [N(4), N(4, 'teal'), N(8), N(8, 'teal'), WILD(), N(1), N(12), N(10, 'pink'), N(6), N(2), N(11)] }), 'expert') as any;
  expect(d.type).toBe('discard');
  expect(['orange-4-1', 'teal-4-1', 'orange-8-1', 'teal-8-1', 'wild-1']).not.toContain(d.card);
  // a skip goes on the player who is down with the fewest cards
  const s = p10BotAction(p10Pos({ hand: [SKIP(), N(3), N(5)], next: ['a', 'b'], laid: ['b'], counts: { a: 8, b: 2 }, phaseOf: { a: 3, b: 2 } }), 'expert');
  expect(s).toEqual({ type: 'discard', card: 'skip-1', target: 'b' });
  // the next player is down: don't throw them a card that fits a group on the table
  const groups = [{ id: 1, owner: 'op', kind: 'set' as const, cards: [N(7), N(7, 'teal'), N(7, 'pink')] }];
  const g = p10BotAction(p10Pos({ hand: [N(7, 'purple'), N(1), N(2, 'teal'), N(11), N(3, 'pink'), N(9)], laid: ['op'], groups, phase: 2 }), 'expert') as any;
  expect(g.card).not.toBe('purple-7-1');
});

/* ------------------------------------------------------------------ */
/* time and legality                                                   */
/* ------------------------------------------------------------------ */

const GAMES: { name: string; mod: GameModule<any, any>; settings: unknown; sizes: number[] }[] = [
  { name: 'ronda', mod: ronda, settings: { target: 21 }, sizes: [2, 3, 4] },
  { name: 'kanza', mod: kanza, settings: { hands: 1 }, sizes: [2, 3, 4] },
  { name: 'konkan', mod: konkan, settings: { limit: 40 }, sizes: [2, 3, 4] },
  { name: 'kdab', mod: kdab, settings: { maxPlay: 4 }, sizes: [2, 3, 5] },
  { name: 'unoflip', mod: unoflip, settings: { target: 100 }, sizes: [2, 3, 5] },
  { name: 'phase10', mod: phase10, settings: { short: true }, sizes: [2, 4] },
];

test('a decision takes well under the budget (CPU time, the real clock budget in force)', () => {
  cardsTuning.samples = 0;
  try {
    for (const g of GAMES) {
      const times: number[] = [];
      for (let i = 0; i < 2; i++) {
        const r = simulate(g.mod, ['a', 'b', 'c'].slice(0, i === 0 ? 2 : 3), { a: 'expert', b: 'expert', c: 'smart' }, g.settings, { seed: 900 + i });
        times.push(...(r.planMs.expert ?? []), ...(r.planMs.smart ?? []));
      }
      times.sort((x, y) => x - y);
      const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
      console.log(`${g.name}: ${times.length} timed decisions, median ${(times[times.length >> 1] ?? 0).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${(times.at(-1) ?? 0).toFixed(1)} ms CPU`);
      expect(p95).toBeLessThan(60);
      expect(times.at(-1) ?? 0).toBeLessThan(250); // a single slow one (GC, a cold start) is tolerated
    }
  } finally {
    cardsTuning.samples = 60;
  }
}, 60_000);

test('no illegal move and no stuck game: every level, several table sizes', () => {
  cardsTuning.samples = 12;
  try {
    const mix: BotLevel[] = ['expert', 'smart', 'easy', 'expert', 'smart'];
    let games = 0;
    for (const g of GAMES) {
      for (const np of g.sizes) {
        for (let i = 0; i < 3; i++) {
          const ids = Array.from({ length: np }, (_, k) => `p${k}`);
          const levels = Object.fromEntries(ids.map((id, k) => [id, mix[(k + i) % mix.length]]));
          const r = simulate(g.mod, ids, levels, g.settings, { seed: 5000 + np * 10 + i });
          games++;
          if (r.illegal) console.log(g.name, np, r.illegalActions.slice(0, 3));
          expect(r.illegal).toBe(0);
          expect(r.stuck).toBe(false);
          expect(r.result).not.toBeNull();
        }
      }
    }
    expect(games).toBeGreaterThan(40);
  } finally {
    cardsTuning.samples = 60;
  }
}, 60_000);
