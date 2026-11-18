/**
 * «الانقلاب» — the deal (and the two-player tweak), every action and its cost, the 10-coin rule, challenges
 * both ways (the proven card goes back and a new one is drawn; a caught «الوشاية» gets its coins back), blocks
 * and challenges of blocks, the exchange, choosing the card to reveal (and the one-card and timeout cases),
 * elimination and the win, no leak of hands or of the deck, stale taps, bots finishing games at every strength,
 * leaving in the middle of an action, settings.
 */
import { expect, test } from 'bun:test';

import { COUP_DEFAULTS, COUP_EXCHANGE_MS, COUP_LOSE_MS, type CoupRole, type CoupSettings, type CoupView } from '../src/shared/games/coup';
import { DEFAULT_SETTINGS, type BotLevel } from '../src/shared/protocol';
import { botBlock, botChallenge, botKeep, chanceHolds, type BotInfo } from './coup-bots';
import { COUP_PROOF_MS, coup, sanitizeCoup, startCoup, type CoupState } from './games/coup';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Ctx = GameCtx & { now: number; jobs: Job[]; said: string[]; offline: Set<string> };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert'): Ctx {
  const keys = new Set<string>();
  const offline = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: () => {},
    say: (text) => ctx.said.push(text),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => `اسم-${id}`,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      ctx.jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs: [],
    said: [],
    offline,
  };
  return ctx;
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const settings = (o: Partial<CoupSettings> = {}): CoupSettings => ({ ...COUP_DEFAULTS, ...o });
const view = (ctx: Ctx, s: CoupState, me: string) => coup.view(ctx, s, me) as CoupView;
const act = (ctx: Ctx, s: CoupState, by: string, a: Record<string, unknown>) => coup.act(ctx, s, by, { seq: s.seq, ...a } as never);
const play = (ctx: Ctx, s: CoupState, by: string, action: string, target?: string) => act(ctx, s, by, { type: 'declare', action, ...(target ? { target } : {}) });
/** Everyone who may answer the open window lets it go. */
const passAll = (ctx: Ctx, s: CoupState) => {
  const w = s.window!;
  for (const p of [...w.eligible]) {
    if (s.window !== w) break;
    act(ctx, s, p, { type: 'pass' });
  }
};
const after = (ctx: Ctx, s: CoupState, ms: number) => {
  ctx.now += ms;
  coup.tick!(ctx, s);
};

/** A table in seat order with chosen hands and coins (a starts); the deck holds what is left. */
function setup(hands: Record<string, CoupRole[]>, coins: Record<string, number> = {}, deck?: CoupRole[], o: Partial<CoupSettings> = {}, ctx = fakeCtx()) {
  const ids = Object.keys(hands);
  const s = startCoup(ctx, ids, settings(o), seeded(7));
  s.order = ids;
  for (const id of ids) s.seats[id] = { id, coins: coins[id] ?? 2, hand: [...hands[id]], revealed: [], out: false, claim: null };
  const all: CoupRole[] = ['wazir', 'washi', 'qursan', 'safir', 'harisa'].flatMap((r) => [r, r, r]) as CoupRole[];
  for (const r of Object.values(hands).flat()) all.splice(all.indexOf(r), 1);
  s.deck = deck ?? all;
  s.turn = ids[0];
  s.phase = 'turn';
  s.seq++;
  return { s, ctx };
}

/* ------------------------------------------------------------------ */

test('the deal: two hidden cards and two coins each, the rest in the deck; two players: the first starts with one coin', () => {
  const ctx = fakeCtx();
  const s = startCoup(ctx, ['a', 'b', 'c', 'd'], settings(), seeded(1));
  expect(s.deck.length).toBe(15 - 8);
  for (const id of s.order) {
    expect(s.seats[id].hand.length).toBe(2);
    expect(s.seats[id].coins).toBe(2);
  }
  const counts: Record<string, number> = {};
  for (const r of [...s.deck, ...s.order.flatMap((id) => s.seats[id].hand)]) counts[r] = (counts[r] ?? 0) + 1;
  expect(Object.values(counts)).toEqual([3, 3, 3, 3, 3]);
  expect(s.turn).toBe(s.order[0]);
  expect(s.twoPlayer).toBe(false);

  const two = startCoup(ctx, ['a', 'b'], settings(), seeded(2));
  expect(two.twoPlayer).toBe(true);
  expect(two.seats[two.order[0]].coins).toBe(1);
  expect(two.seats[two.order[1]].coins).toBe(2);
});

test('income +1 at once; aid +2 when nobody blocks; tax +3 when nobody challenges', () => {
  const { s, ctx } = setup({ a: ['wazir', 'harisa'], b: ['qursan', 'safir'], c: ['washi', 'harisa'] });
  play(ctx, s, 'a', 'income');
  expect(s.seats.a.coins).toBe(3);
  expect(s.turn).toBe('b');

  play(ctx, s, 'b', 'aid');
  expect(s.phase).toBe('window');
  expect(s.window!.kind).toBe('block');
  expect(s.window!.eligible.sort()).toEqual(['a', 'c']);
  passAll(ctx, s);
  expect(s.seats.b.coins).toBe(4);
  expect(s.turn).toBe('c');

  play(ctx, s, 'c', 'tax');
  expect(s.window!.kind).toBe('challenge');
  // the window's time runs out: nobody answered
  after(ctx, s, 10_001);
  expect(s.seats.c.coins).toBe(5);
  expect(s.turn).toBe('a');
});

test('seize takes two coins (one if that is all); a player with no coins cannot be seized', () => {
  const { s, ctx } = setup({ a: ['qursan', 'harisa'], b: ['wazir', 'washi'], c: ['safir', 'harisa'] }, { b: 5, c: 1 });
  play(ctx, s, 'a', 'seize', 'b');
  passAll(ctx, s); // challenge window
  expect(s.window!.kind).toBe('block');
  expect(s.window!.eligible).toEqual(['b']);
  expect(s.window!.roles).toEqual(['qursan', 'safir']);
  passAll(ctx, s);
  expect(s.seats.a.coins).toBe(4);
  expect(s.seats.b.coins).toBe(3);
  s.turn = 'a';
  s.phase = 'turn';
  s.seq++;
  play(ctx, s, 'a', 'seize', 'c');
  passAll(ctx, s);
  passAll(ctx, s);
  expect(s.seats.a.coins).toBe(5);
  expect(s.seats.c.coins).toBe(0);
  s.turn = 'a';
  s.phase = 'turn';
  s.seq++;
  expect(() => play(ctx, s, 'a', 'seize', 'c')).toThrow(GameError);
  expect(() => play(ctx, s, 'a', 'seize', 'a')).toThrow(GameError);
});

test('inform costs 3 and the target loses an influence; coup costs 7; costs are checked', () => {
  const { s, ctx } = setup({ a: ['washi', 'harisa'], b: ['wazir', 'safir'], c: ['qursan', 'harisa'] }, { a: 10, b: 2 });
  // 10 coins: only the coup
  expect(() => play(ctx, s, 'a', 'income')).toThrow(GameError);
  expect(() => play(ctx, s, 'a', 'inform', 'b')).toThrow(GameError);
  play(ctx, s, 'a', 'coup', 'b');
  expect(s.seats.a.coins).toBe(3);
  expect(s.phase).toBe('lose');
  act(ctx, s, 'b', { type: 'lose', idx: 1 });
  expect(s.seats.b.revealed).toEqual(['safir']);
  expect(s.seats.b.hand).toEqual(['wazir']);
  expect(s.turn).toBe('b');
  // b has 2 coins: no inform, no coup
  expect(() => play(ctx, s, 'b', 'inform', 'a')).toThrow(GameError);
  expect(() => play(ctx, s, 'b', 'coup', 'a')).toThrow(GameError);
  play(ctx, s, 'b', 'income');
  play(ctx, s, 'c', 'income');
  play(ctx, s, 'a', 'inform', 'b');
  expect(s.seats.a.coins).toBe(0);
  passAll(ctx, s); // challenge
  passAll(ctx, s); // block by b
  // b had one card left: revealed at once, b is out
  expect(s.seats.b.out).toBe(true);
  expect(s.seats.b.coins).toBe(0);
  expect(s.turn).toBe('c');
});

test('a challenge of a true claim: the challenger loses, the card goes back into the deck and a new one is drawn', () => {
  const { s, ctx } = setup({ a: ['wazir', 'harisa'], b: ['qursan', 'safir'], c: ['washi', 'washi'] });
  const deckBefore = s.deck.length;
  play(ctx, s, 'a', 'tax');
  act(ctx, s, 'b', { type: 'challenge' });
  expect(s.phase).toBe('proof');
  expect(s.pending!.challenge).toEqual({ by: 'b', of: 'a', role: 'wazir', proven: true });
  expect(s.deck.length).toBe(deckBefore);
  expect(s.seats.a.hand.length).toBe(2);
  expect(s.seats.a.hand).toContain('harisa');
  after(ctx, s, COUP_PROOF_MS + 1);
  expect(s.phase).toBe('lose');
  expect(s.loses[0].who).toBe('b');
  act(ctx, s, 'b', { type: 'lose', idx: 0 });
  expect(s.seats.b.revealed).toEqual(['qursan']);
  // the tax still happens
  expect(s.seats.a.coins).toBe(5);
  expect(s.turn).toBe('b');
});

test('a challenge of a bluff: the bluffer loses and the action fails (a caught inform gets its coins back)', () => {
  const { s, ctx } = setup({ a: ['wazir', 'harisa'], b: ['qursan', 'safir'], c: ['washi', 'washi'] }, { a: 3 });
  play(ctx, s, 'a', 'inform', 'b');
  expect(s.seats.a.coins).toBe(0);
  act(ctx, s, 'c', { type: 'challenge' });
  expect(s.pending!.challenge!.proven).toBe(false);
  expect(s.pending!.failed).toBe(true);
  expect(s.seats.a.coins).toBe(3);
  after(ctx, s, COUP_PROOF_MS + 1);
  act(ctx, s, 'a', { type: 'lose', idx: 1 });
  expect(s.seats.a.revealed).toEqual(['harisa']);
  expect(s.seats.b.hand.length).toBe(2);
  expect(s.turn).toBe('b');
  expect(s.lacks.a).toContain('washi');
});

test('blocks: a block nobody challenges stands; a caught block lets the action happen; a proven block beats the challenger', () => {
  // the block stands
  let { s, ctx } = setup({ a: ['qursan', 'harisa'], b: ['safir', 'wazir'], c: ['washi', 'harisa'] }, { b: 4 });
  play(ctx, s, 'a', 'seize', 'b');
  passAll(ctx, s);
  act(ctx, s, 'b', { type: 'block', role: 'safir' });
  expect(s.window!.kind).toBe('blockChallenge');
  expect(s.window!.eligible.sort()).toEqual(['a', 'c']);
  passAll(ctx, s);
  expect(s.seats.b.coins).toBe(4);
  expect(s.seats.a.coins).toBe(2);
  expect(s.turn).toBe('b');

  // a block that is a bluff, challenged: the blocker loses and the seize happens
  ({ s, ctx } = setup({ a: ['qursan', 'harisa'], b: ['wazir', 'washi'], c: ['washi', 'harisa'] }, { b: 4 }));
  play(ctx, s, 'a', 'seize', 'b');
  passAll(ctx, s);
  act(ctx, s, 'b', { type: 'block', role: 'qursan' });
  act(ctx, s, 'a', { type: 'challenge' });
  expect(s.pending!.challenge).toEqual({ by: 'a', of: 'b', role: 'qursan', proven: false });
  after(ctx, s, COUP_PROOF_MS + 1);
  act(ctx, s, 'b', { type: 'lose', idx: 0 });
  expect(s.seats.b.revealed).toEqual(['wazir']);
  expect(s.seats.b.coins).toBe(2);
  expect(s.seats.a.coins).toBe(4);

  // a true block, challenged: the challenger loses and the action fails
  ({ s, ctx } = setup({ a: ['washi', 'qursan'], b: ['harisa', 'wazir'], c: ['washi', 'safir'] }, { a: 3 }));
  play(ctx, s, 'a', 'inform', 'b');
  passAll(ctx, s);
  act(ctx, s, 'b', { type: 'block', role: 'harisa' });
  act(ctx, s, 'c', { type: 'challenge' });
  expect(s.pending!.challenge!.proven).toBe(true);
  after(ctx, s, COUP_PROOF_MS + 1);
  act(ctx, s, 'c', { type: 'lose', idx: 0 });
  expect(s.seats.b.hand.length).toBe(2);
  expect(s.seats.a.coins).toBe(0); // the 3 coins of a blocked inform are spent
  expect(s.turn).toBe('b');
});

test('aid can be blocked by anyone claiming the minister; a wrong role cannot block', () => {
  const { s, ctx } = setup({ a: ['qursan', 'harisa'], b: ['safir', 'wazir'], c: ['washi', 'harisa'] });
  play(ctx, s, 'a', 'aid');
  act(ctx, s, 'c', { type: 'block', role: 'harisa' });
  expect(s.window!.kind).toBe('block');
  act(ctx, s, 'c', { type: 'block', role: 'wazir' });
  expect(s.pending!.block).toEqual({ by: 'c', role: 'wazir' });
  // the actor tries a challenge in the block window: ignored (it is the block-challenge window now)
  act(ctx, s, 'b', { type: 'pass' });
  act(ctx, s, 'a', { type: 'pass' });
  expect(s.seats.a.coins).toBe(2);
  expect(s.turn).toBe('b');
});

test('the exchange: two cards drawn, the actor keeps as many as before, the rest go back', () => {
  const { s, ctx } = setup({ a: ['safir', 'harisa'], b: ['qursan', 'wazir'] }, {}, ['washi', 'wazir', 'qursan']);
  play(ctx, s, 'a', 'exchange');
  passAll(ctx, s);
  expect(s.phase).toBe('exchange');
  const va = view(ctx, s, 'a');
  expect(va.exchange!.cards).toEqual(['safir', 'harisa', 'washi', 'wazir']);
  expect(va.exchange!.keep).toBe(2);
  expect(view(ctx, s, 'b').exchange!.cards).toBeNull();
  expect(() => act(ctx, s, 'a', { type: 'keep', keep: [0] })).toThrow(GameError);
  act(ctx, s, 'a', { type: 'keep', keep: [2, 3] });
  expect(s.seats.a.hand).toEqual(['washi', 'wazir']);
  expect(s.deck.length).toBe(3);
  expect([...s.deck].sort()).toEqual(['harisa', 'qursan', 'safir']);
  expect(s.turn).toBe('b');

  // time runs out: the hand stays as it was
  s.turn = 'a';
  s.phase = 'turn';
  s.seq++;
  s.seats.a.hand = ['safir'];
  play(ctx, s, 'a', 'exchange');
  passAll(ctx, s);
  expect(view(ctx, s, 'a').exchange!.keep).toBe(1);
  after(ctx, s, COUP_EXCHANGE_MS + 1);
  expect(s.seats.a.hand).toEqual(['safir']);
  expect(s.deck.length).toBe(3);
});

test('losing influence: the player chooses; one card is revealed at once; the time runs out = a random card', () => {
  const { s, ctx } = setup({ a: ['wazir', 'harisa'], b: ['qursan', 'safir'], c: ['washi', 'harisa'] }, { a: 7, c: 7 });
  play(ctx, s, 'a', 'coup', 'b');
  expect(view(ctx, s, 'c').lose).toMatchObject({ who: 'b', reason: 'coup' });
  // only b may choose
  expect(() => act(ctx, s, 'c', { type: 'lose', idx: 0 })).toThrow(GameError);
  after(ctx, s, COUP_LOSE_MS + 1);
  expect(s.seats.b.revealed.length).toBe(1);
  expect(s.seats.b.hand.length).toBe(1);
  play(ctx, s, 'b', 'income');
  play(ctx, s, 'c', 'coup', 'b');
  expect(s.seats.b.out).toBe(true);
  expect(s.outOrder).toEqual(['b']);
});

test('elimination and the win: the last one in the palace; places for tournaments', () => {
  const { s, ctx } = setup({ a: ['wazir', 'harisa'], b: ['qursan'], c: ['washi'] }, { a: 7, b: 7 });
  s.seats.b.revealed = ['safir'];
  s.seats.c.revealed = ['safir'];
  play(ctx, s, 'a', 'coup', 'c');
  expect(s.seats.c.out).toBe(true);
  expect(s.turn).toBe('b');
  play(ctx, s, 'b', 'coup', 'a');
  act(ctx, s, 'a', { type: 'lose', idx: 0 });
  play(ctx, s, 'a', 'income');
  expect(s.phase).toBe('turn');
  expect(coup.result!(s)).toBeNull();
  s.seats.a.coins = 7;
  s.turn = 'a';
  s.seq++;
  play(ctx, s, 'a', 'coup', 'b');
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('a');
  expect(coup.result!(s)).toEqual({ places: [['a'], ['b'], ['c']] });
  // the game is over: the winner's hidden card is shown to all
  expect(view(ctx, s, 'b').seats.a.kept).toEqual(['harisa']);
  expect(ctx.said.at(-1)).toContain('الفوز من نصيب');
});

test('a wrong challenger with one card is out at once; a proven claim then goes on to the block window', () => {
  const { s, ctx } = setup({ a: ['washi', 'wazir'], b: ['qursan'], c: ['harisa', 'safir'] }, { a: 3 });
  s.seats.b.revealed = ['safir'];
  play(ctx, s, 'a', 'inform', 'c');
  act(ctx, s, 'b', { type: 'challenge' });
  after(ctx, s, COUP_PROOF_MS + 1);
  expect(s.seats.b.out).toBe(true);
  expect(s.window!.kind).toBe('block');
  expect(s.window!.eligible).toEqual(['c']);
});

test('the view: my cards only, other hands as counts, no deck order; stale taps are ignored', () => {
  const { s, ctx } = setup({ a: ['safir', 'safir'], b: ['qursan', 'wazir'], c: ['washi', 'harisa'] }, {}, ['wazir', 'washi', 'qursan', 'harisa', 'wazir', 'washi', 'qursan', 'harisa', 'safir']);
  const vb = view(ctx, s, 'b');
  expect(vb.hand).toEqual(['qursan', 'wazir']);
  expect(vb.seats.a.hidden).toBe(2);
  expect(vb.seats.a.kept).toBeNull();
  expect(vb.deck).toBe(9);
  const json = JSON.stringify(vb);
  expect(json).not.toContain('"hand":["safir"');
  expect(json).not.toContain('harisa');
  expect(json).not.toContain('washi');
  // a spectator sees no cards at all
  expect(view(ctx, s, 'zz').hand).toEqual([]);
  // a stale seq does nothing
  const before = s.seq;
  coup.act(ctx, s, 'a', { type: 'declare', action: 'income', seq: before - 1 });
  expect(s.seats.a.coins).toBe(2);
  // nor a move out of turn
  expect(() => play(ctx, s, 'b', 'income')).toThrow(GameError);
});

test('people away count as letting the window go', () => {
  const { s, ctx } = setup({ a: ['wazir', 'harisa'], b: ['qursan', 'safir'], c: ['washi', 'harisa'] });
  ctx.offline.add('c');
  play(ctx, s, 'a', 'tax');
  act(ctx, s, 'b', { type: 'pass' });
  expect(s.seats.a.coins).toBe(5);
  expect(s.turn).toBe('b');
});

test('the turn timer: income when the time runs out (the coup with 10 coins)', () => {
  const { s, ctx } = setup({ a: ['wazir', 'harisa'], b: ['qursan', 'safir'] }, { b: 10 }, undefined, { turnSec: 30 });
  s.turnEndsAt = ctx.now + 30_000;
  after(ctx, s, 30_001);
  expect(s.seats.a.coins).toBe(3);
  expect(s.turn).toBe('b');
  after(ctx, s, 30_001);
  expect(s.seats.b.coins).toBe(3);
  expect(s.phase).toBe('lose');
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('leaving: the actor in a window, the target, the blocker, the one choosing a card; the last one wins', () => {
  // the actor leaves while the others may challenge
  let { s, ctx } = setup({ a: ['wazir', 'harisa'], b: ['qursan', 'safir'], c: ['washi', 'harisa'], d: ['wazir', 'washi'] });
  play(ctx, s, 'a', 'tax');
  coup.onLeave!(ctx, s, 'a');
  expect(s.turn).toBe('b');
  expect(s.phase).toBe('turn');
  expect(view(ctx, s, 'b').players).toEqual(['b', 'c', 'd']);

  // the target of a seize leaves during the block window
  play(ctx, s, 'b', 'seize', 'c');
  passAll(ctx, s);
  expect(s.window!.kind).toBe('block');
  coup.onLeave!(ctx, s, 'c');
  expect(s.turn).toBe('d');
  expect(s.seats.b.coins).toBe(2);

  // the blocker of aid leaves while the block may be challenged: the aid happens
  ({ s, ctx } = setup({ a: ['qursan', 'harisa'], b: ['safir', 'wazir'], c: ['washi', 'harisa'] }));
  play(ctx, s, 'a', 'aid');
  act(ctx, s, 'b', { type: 'block', role: 'wazir' });
  coup.onLeave!(ctx, s, 'b');
  expect(s.seats.a.coins).toBe(4);
  expect(s.turn).toBe('c');

  // the one choosing a card leaves: the game goes on
  ({ s, ctx } = setup({ a: ['wazir', 'harisa'], b: ['qursan', 'safir'], c: ['washi', 'harisa'] }, { a: 7 }));
  play(ctx, s, 'a', 'coup', 'b');
  coup.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('turn');
  expect(s.turn).toBe('c');
  coup.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('a');
  expect(coup.result!(s)).toEqual({ places: [['a']] });
});

test('leaving during an exchange returns the drawn cards to the deck', () => {
  const { s, ctx } = setup({ a: ['safir', 'harisa'], b: ['qursan', 'wazir'], c: ['washi', 'harisa'] }, {}, ['washi', 'wazir', 'qursan']);
  play(ctx, s, 'a', 'exchange');
  passAll(ctx, s);
  expect(s.deck.length).toBe(1);
  coup.onLeave!(ctx, s, 'a');
  expect(s.deck.length).toBe(3);
  expect(s.turn).toBe('b');
  expect(s.seats.a.revealed).toEqual(['safir', 'harisa']);
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** Plays a game of bots to the end; returns the state. */
function runBots(players: string[], levels: Record<string, BotLevel>, seed: number) {
  const ctx = fakeCtx(players);
  const s = startCoup(ctx, players, settings(), seeded(seed));
  let lastSeq = -1;
  for (let step = 0; step < 6000 && s.phase !== 'final'; step++) {
    if (s.seq !== lastSeq || ctx.jobs.length === 0) {
      lastSeq = s.seq;
      for (const b of players) {
        ctx.botLevel = () => levels[b];
        coup.botPlan!(ctx, s, [b]);
      }
    }
    ctx.jobs.sort((x, y) => x.at - y.at);
    const job = ctx.jobs.shift();
    const wake = s.phase === 'window' ? s.window!.endsAt : s.phase === 'proof' ? s.proofEndsAt! : s.phase === 'lose' ? s.loseEndsAt! : s.phase === 'exchange' ? s.exchange!.endsAt : (s.turnEndsAt ?? Infinity);
    if (!job || job.at > wake) {
      if (job) ctx.jobs.unshift(job);
      ctx.now = Math.max(ctx.now, wake === Infinity ? ctx.now + 1000 : wake);
      coup.tick!(ctx, s);
      continue;
    }
    ctx.now = Math.max(ctx.now, job.at);
    try {
      coup.act(ctx, s, job.by, job.a as never);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      throw new Error(`bot move refused: ${job.by} ${JSON.stringify(job.a)} — ${(e as Error).message}`);
    }
    // cards are never lost or made up
    const total = s.deck.length + s.order.reduce((n, id) => n + s.seats[id].hand.length + s.seats[id].revealed.length, 0) + (s.exchange?.drawn.length ?? 0);
    expect(total).toBe(15);
  }
  return s;
}

test('bots finish games at every strength and table size, and the expert beats the easy bots more often', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    for (const level of ['easy', 'smart', 'expert'] as BotLevel[]) {
      for (let seed = 1; seed <= 3; seed++) {
        const players = Array.from({ length: n }, (_, i) => `p${i}`);
        const s = runBots(players, Object.fromEntries(players.map((p) => [p, level])), seed * 31 + n);
        expect(s.phase).toBe('final');
        expect(s.winner).not.toBeNull();
        const r = coup.result!(s)!;
        expect(r.places.flat().sort()).toEqual([...players].sort());
      }
    }
  }
  let expertWins = 0;
  const games = 40;
  for (let seed = 1; seed <= games; seed++) {
    const s = runBots(['x', 'e1', 'e2'], { x: 'expert', e1: 'easy', e2: 'easy' }, seed);
    if (s.winner === 'x') expertWins++;
  }
  // a fair share would be a third
  expect(expertWins).toBeGreaterThan(games / 3);
});

test('bot reasoning: a claim with every copy in sight is challenged; a held role blocks; the exchange keeps the best', () => {
  const info: BotInfo = {
    me: 'x',
    hand: ['wazir', 'harisa'],
    seats: {
      x: { coins: 2, hidden: 2, revealed: [], out: false },
      y: { coins: 2, hidden: 2, revealed: ['wazir', 'wazir'], out: false },
    },
    alive: ['x', 'y'],
    claims: {},
    lacks: {},
  };
  expect(chanceHolds(info, 'y', 'wazir')).toBe(0);
  for (const level of ['smart', 'expert'] as BotLevel[]) expect(botChallenge(level, info, 'y', 'wazir', 'small', seeded(1))).toBe(true);
  expect(botBlock('easy', info, 'inform', 'y', seeded(1))).toBe('harisa');
  expect(botBlock('expert', info, 'aid', 'y', seeded(1))).toBe('wazir');
  const keep = botKeep('expert', ['safir', 'safir', 'wazir', 'washi'], 2, seeded(1));
  expect(keep.sort()).toEqual([2, 3]);
});

test('bots answer windows they meant to answer even when the time runs out first', () => {
  const ctx = fakeCtx(['b']);
  const { s } = setup({ a: ['wazir', 'harisa'], b: ['harisa', 'qursan'], c: ['washi', 'safir'] }, { a: 3 }, undefined, {}, ctx);
  play(ctx, s, 'a', 'inform', 'b');
  act(ctx, s, 'c', { type: 'pass' });
  act(ctx, s, 'b', { type: 'pass' });
  expect(s.window!.kind).toBe('block');
  coup.botPlan!(ctx, s, ['b']);
  expect(ctx.jobs.length).toBe(1);
  expect(ctx.jobs[0].a).toMatchObject({ type: 'block', role: 'harisa' });
  after(ctx, s, 10_001);
  expect(s.pending!.block).toEqual({ by: 'b', role: 'harisa' });
});

/* ------------------------------------------------------------------ */

test('settings are sanitised and patched', () => {
  expect(sanitizeCoup({ windowSec: 100, turnSec: 7 })).toEqual({ windowSec: 15, turnSec: 0 });
  expect(sanitizeCoup(undefined)).toEqual(COUP_DEFAULTS);
  const st = { ...COUP_DEFAULTS };
  coup.patchSettings!(st, { windowSec: 6, turnSec: 30, junk: 1 });
  expect(st).toEqual({ windowSec: 6, turnSec: 30 });
  coup.patchSettings!(st, { windowSec: 'x' });
  expect(st.windowSec).toBe(6);
  expect(DEFAULT_SETTINGS.coup).toEqual(COUP_DEFAULTS);
});
