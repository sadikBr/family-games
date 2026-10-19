/** «هزّ 2»: matching, the special cards, the last 2, scoring, the end, bots playing whole games, leaving. */
import { expect, test } from 'bun:test';

import type { Card, Suit } from '../src/shared/cards';
import { HEZ2_DEFAULTS, hez2Points, hez2Variant, isSpecial, type Hez2Settings, type Hez2View } from '../src/shared/games/hez2';
import type { BotLevel } from '../src/shared/protocol';
import { OVER_MS, ROUND_END_MS, canPlay, hez2, playable, ranking, type State } from './games/hez2';
import { decide, hez2Tuning, longSuit } from './hez2-bot';

const c = (rank: number, suit: Suit = 'coins'): Card => ({ id: `${suit}-${rank}`, suit, rank });

function fakeCtx(isBot: (id: string) => boolean = () => false) {
  const fx: { kind: string; target?: string }[] = [];
  const said: { text: string; by?: string }[] = [];
  const sched: { by: string; key: string; delay: number; a: any }[] = [];
  const ctx: any = {
    now: 1000,
    fx: (kind: string, target?: string) => fx.push({ kind, target }),
    isConnected: () => true,
    isBot,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => sched.push({ by, key, delay, a }),
    say: (text: string, by?: string) => said.push({ text, by }),
  };
  return { ctx, fx, said, sched };
}

const total = (s: State) => s.deck.length + s.discard.length + Object.values(s.hands).reduce((t, h) => t + h.length, 0);

/**
 * A started game where it is `a`'s turn, with these hands and this top card (every other card is in
 * the stock, so the 40 cards stay whole).
 */
function setup(hands: Record<string, Card[]>, topCard: Card, settings: Partial<Hez2Settings> = {}) {
  const f = fakeCtx();
  const seats = Object.keys(hands);
  const s = hez2.start(f.ctx, seats, { ...HEZ2_DEFAULTS, ...settings });
  const used = new Set([topCard.id, ...Object.values(hands).flat().map((x) => x.id)]);
  const all = [...s.deck, ...s.discard, ...Object.values(s.hands).flat()];
  s.deck = all.filter((x) => !used.has(x.id));
  s.discard = [topCard];
  s.hands = Object.fromEntries(seats.map((id) => [id, hands[id].slice()]));
  s.suit = topCard.suit;
  s.topBy = null;
  s.turnIdx = 0;
  f.said.length = 0;
  return { ...f, s };
}

/** Seeded Math.random, so a series of games is the same every run. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const act = (ctx: any, s: State, by: string, a: any) => hez2.act(ctx, s, by, a);
const turn = (s: State) => s.seats[s.turnIdx];

/* ------------------------------------------------------------------ */
/* cards                                                               */
/* ------------------------------------------------------------------ */

test('points: 1–7 at face value, the figures (10, 11, 12) 10 each; specials are 1, 2, 7, 10, 12', () => {
  expect([1, 2, 3, 4, 5, 6, 7].map((r) => hez2Points(c(r)))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect([10, 11, 12].map((r) => hez2Points(c(r)))).toEqual([10, 10, 10]);
  expect([1, 2, 3, 4, 5, 6, 7, 10, 11, 12].filter((r) => isSpecial(c(r)))).toEqual([1, 2, 7, 10, 12]);
});

test('the deal: 5 cards each, a plain card turned up, 40 cards in all; the next seat after the dealer starts', () => {
  for (let k = 0; k < 30; k++) {
    const { ctx, said } = fakeCtx();
    const s = hez2.start(ctx, ['a', 'b', 'c', 'd'], HEZ2_DEFAULTS);
    for (const id of s.seats) expect(s.hands[id].length).toBe(5);
    expect(s.discard.length).toBe(1);
    expect(isSpecial(s.discard[0])).toBe(false);
    expect(s.suit).toBe(s.discard[0].suit);
    expect(total(s)).toBe(40);
    expect(s.turnIdx).toBe((s.dealerIdx + 1) % 4);
    expect(said[0].text).toContain('الجولة 1');
  }
});

/* ------------------------------------------------------------------ */
/* matching                                                            */
/* ------------------------------------------------------------------ */

test('match the number or the suit; a 7 goes on anything; with nothing to play, draw', () => {
  const { ctx, s } = setup({ a: [c(4, 'coins'), c(5, 'cups'), c(7, 'clubs'), c(3, 'swords')], b: [c(6, 'clubs')] }, c(5, 'coins'));
  expect(playable(s, 'a').sort()).toEqual(['clubs-7', 'coins-4', 'cups-5'].sort());
  expect(() => act(ctx, s, 'a', { type: 'play', card: 'swords-3' })).toThrow();
  expect(() => act(ctx, s, 'a', { type: 'draw' })).toThrow(); // a playable card: no drawing
  expect(() => act(ctx, s, 'b', { type: 'play', card: 'clubs-6' })).toThrow('ليس دورك');
  act(ctx, s, 'a', { type: 'play', card: 'cups-5' });
  expect(s.suit).toBe('cups');
  expect(turn(s)).toBe('b');
  expect(playable(s, 'b')).toEqual([]);
});

test('drawing: a card that fits may be played at once (and only that one), or the turn passed', () => {
  const { ctx, s, said } = setup({ a: [c(3, 'swords'), c(4, 'swords')], b: [c(6, 'clubs')] }, c(5, 'coins'));
  s.deck = [c(6, 'coins'), ...s.deck.filter((x) => x.id !== 'coins-6')];
  act(ctx, s, 'a', { type: 'draw' });
  expect(s.drawn).toEqual({ by: 'a', id: 'coins-6' });
  expect(playable(s, 'a')).toEqual(['coins-6']);
  const v = hez2.view(ctx, s, 'a') as Hez2View;
  expect(v.canPass).toBe(true);
  expect(v.canDraw).toBe(false);
  expect(() => act(ctx, s, 'a', { type: 'draw' })).toThrow();
  act(ctx, s, 'a', { type: 'pass' });
  expect(turn(s)).toBe('b');
  expect(said.at(-1)).toEqual({ text: 'تمرير: a', by: 'a' });
  // a drawn card that doesn't fit: the turn passes by itself
  s.deck = [c(3, 'cups'), ...s.deck.filter((x) => x.id !== 'cups-3')];
  act(ctx, s, 'b', { type: 'draw' });
  expect(turn(s)).toBe('a');
  expect(s.hands.b.length).toBe(2);
  expect(said.at(-1)!.text).toBe('ورقة من الكومة ثم تمرير: b');
});

test('the 10 never ends a hand: alone in hand it cannot be played', () => {
  const { ctx, s } = setup({ a: [c(10, 'coins')], b: [c(6, 'clubs'), c(3, 'clubs')] }, c(5, 'coins'));
  expect(canPlay(s, 'a', c(10, 'coins'))).toBe(false);
  expect(() => act(ctx, s, 'a', { type: 'play', card: 'coins-10' })).toThrow('الخادم');
  expect((hez2.view(ctx, s, 'a') as Hez2View).canDraw).toBe(true);
});

/* ------------------------------------------------------------------ */
/* special cards                                                       */
/* ------------------------------------------------------------------ */

test('7: the joker picks the suit everyone follows until another 7', () => {
  const { ctx, s, said } = setup({ a: [c(7, 'clubs'), c(3, 'coins')], b: [c(5, 'cups'), c(4, 'swords'), c(7, 'coins')], c: [c(6, 'swords')] }, c(5, 'coins'));
  act(ctx, s, 'a', { type: 'play', card: 'clubs-7' });
  expect(s.choosing).toBe('a');
  expect(hez2.turnOf!(s)).toEqual(['a']);
  expect(playable(s, 'b')).toEqual([]);
  act(ctx, s, 'b', { type: 'suit', suit: 'swords' }); // not theirs to choose
  expect(s.choosing).toBe('a');
  act(ctx, s, 'a', { type: 'suit', suit: 'swords' });
  expect(s.suit).toBe('swords');
  expect(s.suitChosen).toBe(true);
  expect(s.event).toMatchObject({ kind: 'suit', by: 'a', suit: 'swords' });
  expect(said.at(-1)).toEqual({ text: 'اللون من اختيار a: شباضا', by: 'a' });
  expect(turn(s)).toBe('b');
  expect(playable(s, 'b').sort()).toEqual(['coins-7', 'swords-4']);
});

test('2: the next player draws 2 and loses the turn, unless a 2 answers it — they stack', () => {
  const { ctx, s, said } = setup({ a: [c(2, 'coins'), c(3, 'coins')], b: [c(2, 'cups'), c(6, 'coins')], c: [c(6, 'clubs'), c(4, 'clubs')] }, c(5, 'coins'));
  act(ctx, s, 'a', { type: 'play', card: 'coins-2' });
  expect(s.pending).toBe(2);
  expect(said.at(-1)!.text).toBe('ورقة من a: 2 أوروص — 2 للسحب على b');
  expect(playable(s, 'b')).toEqual(['cups-2']); // only a 2 answers a 2 (not the 6 of the suit)
  act(ctx, s, 'b', { type: 'play', card: 'cups-2' });
  expect(s.pending).toBe(4);
  expect(s.event).toMatchObject({ kind: 'two', by: 'b', target: 'c', n: 4 });
  expect(playable(s, 'c')).toEqual([]);
  expect((hez2.view(ctx, s, 'c') as Hez2View).canDraw).toBe(true);
  act(ctx, s, 'c', { type: 'draw' });
  expect(s.hands.c.length).toBe(6);
  expect(s.pending).toBe(0);
  expect(turn(s)).toBe('a'); // c lost the turn
  expect(said.at(-1)!.text).toBe('عقوبة على c: 4 أوراق');
  // after the penalty, the 2 on top is an ordinary card: same suit or any 2
  expect(playable(s, 'a')).toEqual([]);
  expect(total(s)).toBe(40);
});

test('1 and 10: play again; 12: the next player loses the turn (two players: play again)', () => {
  const g = setup({ a: [c(1, 'coins'), c(10, 'coins'), c(12, 'coins'), c(3, 'cups')], b: [c(4, 'swords')], c: [c(4, 'clubs')] }, c(5, 'coins'));
  act(g.ctx, g.s, 'a', { type: 'play', card: 'coins-1' });
  expect(turn(g.s)).toBe('a');
  expect(g.s.again).toBe('a');
  expect(g.said.at(-1)!.text).toContain('دور إضافي');
  act(g.ctx, g.s, 'a', { type: 'play', card: 'coins-10' });
  expect(turn(g.s)).toBe('a');
  act(g.ctx, g.s, 'a', { type: 'play', card: 'coins-12' });
  expect(turn(g.s)).toBe('c'); // b skipped
  expect(g.s.event).toMatchObject({ kind: 'skip', target: 'b' });
  expect(g.said.at(-1)!.text).toBe('ورقة من a: الملك أوروص — دور ضائع على b');

  const two = setup({ a: [c(12, 'coins'), c(3, 'coins')], b: [c(4, 'swords')] }, c(5, 'coins'));
  act(two.ctx, two.s, 'a', { type: 'play', card: 'coins-12' });
  expect(turn(two.s)).toBe('a');
  expect(two.s.again).toBe('a');
});

/* ------------------------------------------------------------------ */
/* end of a round                                                      */
/* ------------------------------------------------------------------ */

test('the last card ends the round: cards left count against their owners; results after a pause, next round by itself', () => {
  const { ctx, s, fx } = setup({ a: [c(4, 'coins')], b: [c(7, 'cups'), c(11, 'clubs'), c(2, 'swords')], c: [c(12, 'cups'), c(1, 'cups')] }, c(5, 'coins'));
  act(ctx, s, 'a', { type: 'play', card: 'coins-4' });
  expect(s.phase).toBe('over');
  expect(hez2.turnOf!(s)).toEqual([]);
  expect(s.roundWinner).toBe('a');
  expect(s.scores).toEqual({ a: 0, b: 7 + 10 + 2, c: 10 + 1 });
  expect(s.history).toEqual([{ a: 0, b: 19, c: 11 }]);
  expect(fx.some((x) => x.kind === 'reveal' && x.target === 'a')).toBe(true);
  expect(hez2.tick!(ctx, s)).toBe(false);
  ctx.now += OVER_MS;
  expect(hez2.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('roundEnd');
  const v = hez2.view(ctx, s, 'b') as Hez2View;
  expect(v.roundSummary!.find((r) => r.id === 'b')!.points).toBe(19);
  act(ctx, s, 'b', { type: 'play', card: 'x' }); // nothing happens between rounds
  ctx.now += ROUND_END_MS;
  hez2.tick!(ctx, s);
  expect(s.phase).toBe('play');
  expect(s.round).toBe(2);
  expect(total(s)).toBe(40);
});

test('a 7 or a 1 may be the last card (no suit to choose, no extra turn)', () => {
  const g = setup({ a: [c(7, 'clubs')], b: [c(3, 'cups')] }, c(5, 'coins'));
  act(g.ctx, g.s, 'a', { type: 'play', card: 'clubs-7' });
  expect(g.s.phase).toBe('over');
  expect(g.s.choosing).toBeNull();
  const h = setup({ a: [c(1, 'coins')], b: [c(3, 'cups')] }, c(5, 'coins'));
  act(h.ctx, h.s, 'a', { type: 'play', card: 'coins-1' });
  expect(h.s.phase).toBe('over');
});

test('a last 2: the round waits until someone draws its penalty', () => {
  const { ctx, s, said } = setup({ a: [c(2, 'coins')], b: [c(3, 'clubs')], c: [c(4, 'clubs')] }, c(5, 'coins'));
  act(ctx, s, 'a', { type: 'play', card: 'coins-2' });
  expect(s.phase).toBe('play');
  expect(s.out).toBe('a');
  expect(said.at(-1)!.text).toBe('آخر ورقة من a: 2 أوروص — 2 للسحب على b');
  act(ctx, s, 'b', { type: 'draw' });
  expect(s.phase).toBe('over');
  expect(s.roundWinner).toBe('a');
  expect(s.hands.b.length).toBe(3);
  expect(s.scores.b).toBe(3 + hez2Points(s.hands.b[1]) + hez2Points(s.hands.b[2]));
});

test('a last 2 answered by everyone comes back: its player draws the whole penalty and plays on', () => {
  const { ctx, s, said } = setup({ a: [c(2, 'coins')], b: [c(2, 'cups'), c(3, 'clubs')], c: [c(2, 'clubs'), c(4, 'clubs')] }, c(5, 'coins'));
  act(ctx, s, 'a', { type: 'play', card: 'coins-2' });
  act(ctx, s, 'b', { type: 'play', card: 'cups-2' });
  act(ctx, s, 'c', { type: 'play', card: 'clubs-2' });
  expect(s.phase).toBe('play');
  expect(s.hands.a.length).toBe(6);
  expect(s.out).toBeNull();
  expect(s.pending).toBe(0);
  expect(turn(s)).toBe('b');
  expect(s.event).toMatchObject({ kind: 'back', target: 'a', n: 6 });
  expect(said.at(-1)!.text).toBe('عادت العقوبة إلى a: 6 أوراق');
  expect(total(s)).toBe(40);
});

test('setting off: a last 2 makes the next player draw at once and ends the round', () => {
  const { ctx, s } = setup({ a: [c(2, 'coins')], b: [c(2, 'cups'), c(3, 'clubs')], c: [c(4, 'clubs')] }, c(5, 'coins'), { lastTwo: false });
  act(ctx, s, 'a', { type: 'play', card: 'coins-2' });
  expect(s.phase).toBe('over');
  expect(s.hands.b.length).toBe(4);
  expect(s.roundWinner).toBe('a');
});

test('nothing left to draw from: after a whole turn of empty draws the round ends, fewest points win it', () => {
  const { ctx, s } = setup({ a: [c(3, 'swords'), c(11, 'swords')], b: [c(4, 'clubs')] }, c(5, 'coins'));
  s.deck = [];
  act(ctx, s, 'a', { type: 'draw' });
  expect(turn(s)).toBe('b');
  act(ctx, s, 'b', { type: 'draw' });
  expect(s.phase).toBe('over');
  expect(s.stuck).toBe(true);
  expect(s.roundWinner).toBe('b');
  expect(s.scores).toEqual({ a: 13, b: 4 });
});

test('the end: someone reaches the target, the fewest points win; a tie goes to the better last round', () => {
  const { ctx, s, fx } = setup({ a: [c(4, 'coins')], b: [c(12, 'cups'), c(3, 'clubs')], c: [c(6, 'cups')] }, c(5, 'coins'));
  s.scores = { a: 30, b: 95, c: 24 };
  s.history = [{ a: 30, b: 95, c: 24 }];
  act(ctx, s, 'a', { type: 'play', card: 'coins-4' });
  // a: 30, b: 108, c: 30 — a and c tied, a had 0 in the last round
  expect(s.scores).toEqual({ a: 30, b: 108, c: 30 });
  expect(s.winner).toBe('a');
  expect(ranking(s)).toEqual(['a', 'c', 'b']);
  ctx.now += OVER_MS;
  hez2.tick!(ctx, s);
  expect(s.phase).toBe('final');
  expect(fx.at(-1)).toEqual({ kind: 'win', target: 'a' });
  expect(hez2.result!(s)).toEqual({ places: [['a'], ['c'], ['b']] });
});

test('result: exact ties share a place; null while playing', () => {
  const { s } = setup({ a: [c(4, 'coins')], b: [c(3, 'clubs')] }, c(5, 'coins'));
  expect(hez2.result!(s)).toBeNull();
  s.phase = 'final';
  s.scores = { a: 40, b: 40 };
  s.history = [{ a: 5, b: 5 }];
  s.winner = 'a';
  expect(hez2.result!(s)).toEqual({ places: [['a', 'b']] });
});

/* ------------------------------------------------------------------ */
/* views, settings                                                     */
/* ------------------------------------------------------------------ */

test('a phone never sees the other hands (only their counts)', () => {
  const { ctx } = fakeCtx();
  const s = hez2.start(ctx, ['a', 'b', 'c'], HEZ2_DEFAULTS);
  const v = hez2.view(ctx, s, 'a') as Hez2View;
  const json = JSON.stringify(v);
  for (const x of [...s.hands.b, ...s.hands.c]) expect(json).not.toContain(`"${x.id}"`);
  expect(v.myHand.length).toBe(5);
  expect(v.counts).toEqual({ a: 5, b: 5, c: 5 });
});

test('settings: the target snaps to 50–200 by 50; the last-2 rule is a switch; the cover text follows', () => {
  const st = { ...HEZ2_DEFAULTS };
  hez2.patchSettings!(st, { target: 133, lastTwo: false });
  expect(st).toEqual({ target: 150, lastTwo: false });
  hez2.patchSettings!(st, { target: 999, lastTwo: 'x' });
  expect(st).toEqual({ target: 200, lastTwo: false });
  hez2.patchSettings!(st, { target: -4 });
  expect(st.target).toBe(50);
  expect(hez2Variant(HEZ2_DEFAULTS)).toBeNull();
  const v = hez2Variant(st)!;
  expect(v.howTo.join(' ')).toContain('50 نقطة');
  expect(v.howTo.join(' ')).toContain('تنتهي الجولة فوراً');
});

/* ------------------------------------------------------------------ */
/* bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: the suit held most; a 2 answers a 2; smart keeps the joker; every level plays only legal moves', () => {
  expect(longSuit([c(3, 'cups'), c(4, 'cups'), c(5, 'clubs'), c(7, 'swords')])).toBe('cups');
  for (const level of ['easy', 'smart', 'expert'] as BotLevel[]) {
    const g = setup({ a: [c(2, 'cups'), c(4, 'clubs')], b: [c(3, 'clubs')] }, c(2, 'coins'));
    g.s.pending = 2;
    expect(decide(g.s, 'a', level)).toEqual({ type: 'play', card: 'cups-2' });
    const d = setup({ a: [c(3, 'clubs'), c(4, 'swords')], b: [c(3, 'cups')] }, c(5, 'coins'));
    expect(decide(d.s, 'a', level)).toEqual({ type: 'draw' });
    expect(decide(d.s, 'b', level)).toBeNull(); // not b's turn
  }
  const h = setup({ a: [c(7, 'cups'), c(4, 'coins'), c(6, 'clubs')], b: [c(3, 'clubs'), c(5, 'cups'), c(1, 'cups')] }, c(5, 'coins'));
  expect(decide(h.s, 'a', 'smart')).toEqual({ type: 'play', card: 'coins-4' });
});

test('expert: plays its turn through: a 1 or a 10 first to go out, never stuck with a lone 10', () => {
  const g = setup({ a: [c(4, 'coins'), c(1, 'coins')], b: [c(3, 'clubs'), c(5, 'cups'), c(6, 'swords')] }, c(5, 'coins'));
  expect(decide(g.s, 'a', 'expert')).toEqual({ type: 'play', card: 'coins-1' });
  const h = setup({ a: [c(4, 'coins'), c(10, 'coins')], b: [c(3, 'clubs'), c(5, 'cups'), c(6, 'swords')] }, c(5, 'coins'));
  expect(decide(h.s, 'a', 'expert')).toEqual({ type: 'play', card: 'coins-10' });
});

test('expert: remembers who drew — the next player is void in a suit, so that suit is chosen with the 7', () => {
  // b had to draw on cups (no cups, no 7): with the 7, the expert sends the game back to cups
  const g = setup({ a: [c(3, 'cups'), c(4, 'swords'), c(6, 'coins')], b: [c(5, 'swords'), c(6, 'swords')] }, c(7, 'clubs'));
  g.s.voids = { b: { suits: ['cups'], ranks: [5], no7: true } };
  // a fixed stock order: the look-ahead's sampled worlds then depend only on the seed below
  g.s.deck.sort((x, y) => (x.id < y.id ? -1 : 1));
  g.s.topBy = 'a';
  g.s.choosing = 'a';
  // the look-ahead samples possible hands: over a few seeded decisions, cups wins clearly
  const orig = Math.random;
  Math.random = seeded(7);
  const picks: Record<string, number> = {};
  hez2Tuning.timeless = true;
  try {
    for (let k = 0; k < 15; k++) {
      const a = decide(g.s, 'a', 'expert')!;
      expect(a.type).toBe('suit');
      picks[a.suit as string] = (picks[a.suit as string] ?? 0) + 1;
    }
  } finally {
    Math.random = orig;
    hez2Tuning.timeless = false;
  }
  expect(picks.cups ?? 0).toBeGreaterThanOrEqual(8);
});

/** One game between bots of the given levels (seat i plays levels[i]); the winner's level and the expert's slowest decision (CPU ms). */
function botMatch(levels: BotLevel[], seed: number) {
  const orig = Math.random;
  Math.random = seeded(seed);
  try {
    const { ctx } = fakeCtx(() => true);
    ctx.say = undefined;
    const seats = levels.map((_, i) => `p${i}`);
    const s = hez2.start(ctx, seats, HEZ2_DEFAULTS);
    let slowest = 0;
    for (let steps = 0; s.phase !== 'final' && steps < 50000; steps++) {
      if (s.phase !== 'play') {
        ctx.now += ROUND_END_MS;
        hez2.tick!(ctx, s);
        continue;
      }
      const bot = s.choosing ?? s.seats[s.turnIdx];
      const level = levels[seats.indexOf(bot)];
      const cpu0 = process.cpuUsage();
      const a = decide(s, bot, level)!;
      const cpu = process.cpuUsage(cpu0);
      if (level === 'expert') slowest = Math.max(slowest, (cpu.user + cpu.system) / 1000);
      hez2.act(ctx, s, bot, a);
    }
    expect(s.phase).toBe('final');
    return { level: levels[seats.indexOf(s.winner!)], slowest };
  } finally {
    Math.random = orig;
  }
}

test('expert beats the easy policy clearly over seeded games, and thinks under ~60 ms a move', () => {
  let wins = 0;
  const times: number[] = [];
  const N = 30;
  for (let g = 0; g < N; g++) {
    const r = botMatch(g % 2 ? ['easy', 'expert'] : ['expert', 'easy'], 1000 + g);
    if (r.level === 'expert') wins++;
    times.push(r.slowest);
  }
  expect(wins / N).toBeGreaterThanOrEqual(0.7);
  // CPU time (the machine may be busy with other work): the slowest decision of most games stays under 60 ms
  times.sort((x, y) => x - y);
  expect(times[Math.floor(N * 0.9)]).toBeLessThan(60);
}, 240_000);

/** Bots play every seat until the game is over (fake clock); checks the cards stay whole. */
function playOut(players: number, settings: Partial<Hez2Settings> = {}, level: BotLevel = 'expert') {
  const f = fakeCtx(() => true);
  f.ctx.botLevel = () => level;
  const seats = Array.from({ length: players }, (_, i) => `p${i}`);
  const s = hez2.start(f.ctx, seats, { ...HEZ2_DEFAULTS, ...settings });
  let steps = 0;
  while (s.phase !== 'final' && steps < 20000) {
    steps++;
    f.sched.length = 0;
    hez2.botPlan!(f.ctx, s, seats);
    const job = f.sched[0];
    if (!job) {
      f.ctx.now += 1000;
      hez2.tick!(f.ctx, s);
      continue;
    }
    f.ctx.now += job.delay;
    hez2.act(f.ctx, s, job.by, job.a);
    expect(total(s)).toBe(40);
  }
  return { s, steps, said: f.said, fx: f.fx };
}

test('bots play whole games to the end, 2 to 4 players, both last-2 rules', () => {
  for (const players of [2, 3, 4]) {
    for (const lastTwo of [true, false]) {
      const { s, fx } = playOut(players, { lastTwo }, lastTwo ? 'expert' : players === 3 ? 'easy' : 'smart');
      expect(s.phase).toBe('final');
      expect(s.winner).toBe(ranking(s)[0]);
      expect(Math.max(...s.seats.map((id) => s.scores[id]))).toBeGreaterThanOrEqual(100);
      // totals are the sum of the rounds
      for (const id of s.seats) expect(s.history.reduce((t, r) => t + (r[id] ?? 0), 0)).toBe(s.scores[id]);
      expect(fx.at(-1)).toEqual({ kind: 'win', target: s.winner! });
      expect(hez2.result!(s)!.places.flat().sort()).toEqual([...s.seats].sort());
    }
  }
}, 120_000);

test('announcements are short, noun-first and gender-neutral (no verb conjugated for a player)', () => {
  const { said } = playOut(4);
  expect(said.length).toBeGreaterThan(20);
  const VERBS = ['سحب', 'لعب', 'لعبت', 'رمى', 'رمت', 'سحبت', 'أخذ', 'أخذت', 'ربح', 'ربحت', 'فاز', 'فازت', 'اختار', 'اختارت', 'مرّر', 'مررت', 'أنهى', 'أنهت', 'خسر', 'خسرت'];
  for (const t of said) {
    const words = t.text.split(/[\s:،—()!+]+/);
    for (const w of VERBS) expect(words).not.toContain(w);
    expect(t.text.length).toBeLessThanOrEqual(70);
  }
});

/* ------------------------------------------------------------------ */
/* leaving                                                             */
/* ------------------------------------------------------------------ */

test('onLeave: the leaver’s cards go back to the stock and the turn passes on; one player left wins', () => {
  const { ctx, s, fx } = setup({ a: [c(3, 'clubs')], b: [c(4, 'clubs')], c: [c(6, 'clubs')] }, c(5, 'coins'));
  hez2.onLeave!(ctx, s, 'a');
  expect(s.seats).toEqual(['b', 'c']);
  expect(turn(s)).toBe('b');
  expect(total(s)).toBe(40);
  expect(s.phase).toBe('play');
  // the player choosing a suit leaves: the 7 keeps its own suit and the next player plays
  s.hands.b = [c(7, 'cups'), c(4, 'cups')];
  act(ctx, s, 'b', { type: 'play', card: 'cups-7' });
  expect(s.choosing).toBe('b');
  hez2.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('c');
  expect(fx.at(-1)).toEqual({ kind: 'win', target: 'c' });
  expect(hez2.result!(s)).toEqual({ places: [['c']] });
});

test('onLeave of a player after the one playing keeps the turn where it is; during the results the game goes on', () => {
  const { ctx, s } = setup({ a: [c(3, 'clubs'), c(5, 'clubs')], b: [c(4, 'clubs')], c: [c(6, 'clubs')] }, c(5, 'coins'));
  s.turnIdx = 1;
  hez2.onLeave!(ctx, s, 'c');
  expect(turn(s)).toBe('b');
  s.turnIdx = 1;
  act(ctx, s, 'b', { type: 'draw' }); // b has nothing: draws
  expect(s.seats).toEqual(['a', 'b']);
  // round results, then someone leaves: the next round deals to who stayed
  const g = setup({ a: [c(4, 'coins')], b: [c(3, 'clubs')], c: [c(6, 'clubs')] }, c(5, 'coins'));
  act(g.ctx, g.s, 'a', { type: 'play', card: 'coins-4' });
  g.ctx.now += OVER_MS;
  hez2.tick!(g.ctx, g.s);
  hez2.onLeave!(g.ctx, g.s, 'b');
  g.ctx.now += ROUND_END_MS;
  hez2.tick!(g.ctx, g.s);
  expect(g.s.phase).toBe('play');
  expect(Object.keys(g.s.hands).sort()).toEqual(['a', 'c']);
  expect(total(g.s)).toBe(40);
});
