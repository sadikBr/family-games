/** Ludo (auto move, quick game, podium) and Estate (auction, bot offers) rules. */
import { afterEach, expect, test } from 'bun:test';

import type { EstateView, GameAction, LudoView } from '../src/shared/protocol';
import { AUCTION_MS, BOT_TRADE_MS, botAuctionMax, estate } from './games/estate';
import { AUTO_MOVE_MS, distinctMoves, ludo } from './games/ludo';
import type { GameCtx } from './types';

type Queued = { by: string; a: GameAction };

function fakeCtx(bots: (id: string) => boolean = () => false) {
  const queue: Queued[] = [];
  const fx: { kind: string; target?: string }[] = [];
  const ctx: GameCtx = {
    now: 1_000_000,
    fx: (kind, target) => void fx.push({ kind, target }),
    isConnected: () => true,
    isBot: bots,
    playerName: (id) => id,
    memo: new Map(),
    bot: (by, _key, _delay, a) => void queue.push({ by, a }),
    // these rules tests check the old bot (now the «سهل» level); the expert has its own tests (bots-misc)
    botLevel: () => 'easy',
  };
  return { ctx, queue, fx };
}

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});
/** Make the next ludo roll show `d`. */
const nextRoll = (d: number) => {
  Math.random = () => (d - 1) / 6 + 0.01;
};

/* ---------------- ludo ---------------- */

test('ludo: a single legal move is played on the server after the dice land', () => {
  const { ctx } = fakeCtx();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = ludo.start(ctx, ['a', 'b'], { exitOnOne: false });
  s.turnIdx = 0;
  s.tokens.a = [10, -1, -1, -1];
  nextRoll(4);
  ludo.act(ctx, s, 'a', { type: 'roll' });
  Math.random = realRandom;
  expect(s.phase).toBe('move');
  expect(s.autoAt).toBe(ctx.now + AUTO_MOVE_MS);
  expect((ludo.view(ctx, s, 'a') as LudoView).autoAt).toBe(s.autoAt);
  expect((ludo.view(ctx, s, 'b') as LudoView).autoAt).toBeNull();
  ctx.now += AUTO_MOVE_MS - 1;
  expect(ludo.tick!(ctx, s)).toBe(false);
  expect(s.tokens.a[0]).toBe(10);
  ctx.now += 1;
  expect(ludo.tick!(ctx, s)).toBe(true);
  expect(s.tokens.a[0]).toBe(14);
  expect(s.autoAt).toBeNull();
  expect(s.seats[s.turnIdx].id).toBe('b');
  expect(s.phase).toBe('roll');
});

test('ludo: tapping still works during the wait; two different moves are never automatic', () => {
  const { ctx } = fakeCtx();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = ludo.start(ctx, ['a', 'b'], { exitOnOne: false });
  s.turnIdx = 0;
  // all pieces at home and a 6: bringing any of them out is the same move
  expect(distinctMoves([-1, -1, -1, -1], 6, false).length).toBe(1);
  expect(distinctMoves([12, 12, -1, -1], 3, false)).toEqual([0]); // stacked pieces
  expect(distinctMoves([12, 20, -1, -1], 3, false)).toEqual([0, 1]);
  nextRoll(6);
  ludo.act(ctx, s, 'a', { type: 'roll' });
  Math.random = realRandom;
  expect(s.autoAt).not.toBeNull();
  ludo.act(ctx, s, 'a', { type: 'move', token: 2 }); // the player taps first
  expect(s.tokens.a).toEqual([-1, -1, 0, -1]);
  expect(s.autoAt).toBeNull();
  ctx.now += AUTO_MOVE_MS * 2;
  expect(ludo.tick!(ctx, s)).toBe(false);
  // a 6 again: one piece out, the others at home → two different moves → wait for the player
  expect(s.phase).toBe('roll');
  nextRoll(6);
  ludo.act(ctx, s, 'a', { type: 'roll' });
  Math.random = realRandom;
  expect(s.phase).toBe('move');
  expect(s.autoAt).toBeNull();
});

/** Play a whole ludo game with bots choosing every move. */
function playLudo(seats: string[], settings: { exitOnOne: boolean; podium?: boolean; quick?: boolean }) {
  const { ctx, queue, fx } = fakeCtx(() => true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = ludo.start(ctx, seats, settings);
  let guard = 0;
  while (s.phase !== 'final' && guard++ < 30000) {
    queue.length = 0;
    ludo.botPlan!(ctx, s, seats);
    expect(queue.length).toBe(1);
    ludo.act(ctx, s, queue[0].by, queue[0].a);
    for (const id of seats) for (const p of s.tokens[id]) expect(p >= -1 && p <= 56).toBe(true);
  }
  return { s, fx };
}

test('ludo quick game: 2 pieces each, bots finish, the winner has both home', () => {
  for (let g = 0; g < 30; g++) {
    const seats = ['a', 'b', 'c', 'd'].slice(0, 2 + (g % 3));
    const { s, fx } = playLudo(seats, { exitOnOne: g % 2 === 0, quick: true });
    expect(s.phase).toBe('final');
    for (const id of seats) expect(s.tokens[id].length).toBe(2);
    expect(s.tokens[s.winner]).toEqual([56, 56]);
    expect(s.ranking).toEqual([s.winner]);
    expect(fx.filter((f) => f.kind === 'win')).toEqual([{ kind: 'win', target: s.winner }]);
  }
});

test('ludo podium: play goes on until one player is left, ranking has everyone in order', () => {
  for (let g = 0; g < 20; g++) {
    const seats = ['a', 'b', 'c', 'd'].slice(0, 2 + (g % 3));
    const { s, fx } = playLudo(seats, { exitOnOne: false, podium: true, quick: g % 2 === 0 });
    expect(s.phase).toBe('final');
    expect([...s.ranking].sort()).toEqual([...seats].sort());
    expect(s.winner).toBe(s.ranking[0]);
    // everyone but the last finished all pieces
    for (const id of s.ranking.slice(0, -1)) expect(s.tokens[id].every((p: number) => p === 56)).toBe(true);
    expect(s.tokens[s.ranking[s.ranking.length - 1]].every((p: number) => p === 56)).toBe(false);
    // one win sound, for the winner, at the very end
    expect(fx.filter((f) => f.kind === 'win')).toEqual([{ kind: 'win', target: s.winner }]);
  }
});

test('ludo podium: a finished player is skipped and the view keeps the order', () => {
  const { ctx } = fakeCtx();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = ludo.start(ctx, ['a', 'b', 'c'], { exitOnOne: false, podium: true });
  s.turnIdx = 0;
  s.tokens.a = [56, 56, 56, 53];
  nextRoll(3);
  ludo.act(ctx, s, 'a', { type: 'roll' });
  Math.random = realRandom;
  ludo.act(ctx, s, 'a', { type: 'move', token: 3 });
  expect(s.phase).toBe('roll');
  expect(s.ranking).toEqual(['a']);
  expect(s.winner).toBe('a');
  expect(s.seats[s.turnIdx].id).toBe('b');
  // b then c: a is never asked to play again
  s.turnIdx = 2;
  nextRoll(2);
  ludo.act(ctx, s, 'c', { type: 'roll' }); // nothing can move → next player
  Math.random = realRandom;
  expect(s.seats[s.turnIdx].id).toBe('b');
  const v = ludo.view(ctx, s, 'b') as LudoView;
  expect(v.ranking).toEqual(['a']);
});

/* ---------------- estate ---------------- */

function estateGame(bots: (id: string) => boolean = () => false) {
  const f = fakeCtx(bots);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = estate.start(f.ctx, ['p0', 'p1', 'p2'], { startCash: 1500, rounds: 15 });
  s.players.sort((x: { id: string }, y: { id: string }) => x.id.localeCompare(y.id));
  s.turnIdx = 0;
  return { ...f, s };
}
const cash = (s: { players: { id: string; cash: number }[] }, id: string) => s.players.find((p) => p.id === id)!.cash;

/** p0 lands on Ouarzazate (60) and declines it. */
function declineBrown(ctx: GameCtx, s: ReturnType<typeof estateGame>['s']) {
  s.phase = 'buy';
  s.buy = 1;
  s.players[0].pos = 1;
  estate.act(ctx, s, 'p0', { type: 'skip' });
}

test('estate: a declined property goes to auction; highest bidder pays once everyone withdraws', () => {
  const { ctx, s } = estateGame();
  declineBrown(ctx, s);
  expect(s.phase).toBe('auction');
  let v = estate.view(ctx, s, 'p1') as EstateView;
  expect(v.auction).toEqual({ sq: 1, price: 0, leader: null, endsAt: ctx.now + AUCTION_MS, out: [] });
  estate.act(ctx, s, 'p1', { type: 'bid', add: 50 });
  estate.act(ctx, s, 'p2', { type: 'bid', add: 100 });
  expect(() => estate.act(ctx, s, 'p2', { type: 'bid', add: 10 })).toThrow(); // already the leader
  estate.act(ctx, s, 'p0', { type: 'bid', add: 10 }); // the decliner may bid too
  v = estate.view(ctx, s, 'p1') as EstateView;
  expect(v.auction!.price).toBe(160);
  expect(v.auction!.leader).toBe('p0');
  estate.act(ctx, s, 'p1', { type: 'pass' });
  expect(s.phase).toBe('auction');
  estate.act(ctx, s, 'p2', { type: 'pass' });
  expect(s.phase).toBe('manage');
  expect(s.auction).toBeNull();
  expect(s.props[1]).toEqual({ owner: 'p0', houses: 0, mortgaged: false });
  expect(cash(s, 'p0')).toBe(1500 - 160);
  expect(cash(s, 'p1')).toBe(1500);
});

test('estate auction: the 7 s countdown restarts on every bid; no bids → stays with the bank', () => {
  const { ctx, s } = estateGame();
  declineBrown(ctx, s);
  estate.act(ctx, s, 'p1', { type: 'bid', add: 10 });
  ctx.now += AUCTION_MS - 1;
  expect(estate.tick!(ctx, s)).toBe(false);
  expect(() => estate.act(ctx, s, 'p2', { type: 'bid', add: 10_000 })).not.toThrow(); // not a valid step: ignored
  expect(s.auction.price).toBe(10);
  estate.act(ctx, s, 'p2', { type: 'bid', add: 10 }); // restarts the countdown
  ctx.now += AUCTION_MS - 1;
  expect(estate.tick!(ctx, s)).toBe(false);
  ctx.now += 1;
  expect(estate.tick!(ctx, s)).toBe(true);
  expect(s.props[1].owner).toBe('p2');
  expect(cash(s, 'p2')).toBe(1480);

  // nobody bids
  const g = estateGame();
  declineBrown(g.ctx, g.s);
  g.ctx.now += AUCTION_MS;
  expect(estate.tick!(g.ctx, g.s)).toBe(true);
  expect(g.s.props[1]).toBeUndefined();
  expect(g.s.phase).toBe('manage');
  expect(g.s.players.map((p: { cash: number }) => p.cash)).toEqual([1500, 1500, 1500]);

  // everybody withdraws: ends at once
  const w = estateGame();
  declineBrown(w.ctx, w.s);
  for (const id of ['p0', 'p1', 'p2']) estate.act(w.ctx, w.s, id, { type: 'pass' });
  expect(w.s.phase).toBe('manage');
  expect(w.s.props[1]).toBeUndefined();
  // can't bid more than you have
  const c = estateGame();
  declineBrown(c.ctx, c.s);
  c.s.players[1].cash = 40;
  expect(() => estate.act(c.ctx, c.s, 'p1', { type: 'bid', add: 50 })).toThrow();
});

test('estate auction: bots bid up to a share of the price, more when it finishes their set', () => {
  const { ctx, s, queue } = estateGame((id) => id !== 'p0');
  s.props[3] = { owner: 'p1', houses: 0, mortgaged: false }; // p1 has the other brown city
  expect(botAuctionMax(s, 'p1', 1)).toBe(80); // 60 × 1.3
  expect(botAuctionMax(s, 'p2', 1)).toBe(60); // stops p1's set
  s.players[2].cash = 180;
  expect(botAuctionMax(s, 'p2', 1)).toBe(0); // keeps a cash reserve
  s.players[2].cash = 1500;
  declineBrown(ctx, s);
  estate.act(ctx, s, 'p0', { type: 'pass' });
  let guard = 0;
  while (s.phase === 'auction' && guard++ < 100) {
    queue.length = 0;
    estate.botPlan!(ctx, s, ['p1', 'p2']);
    expect(queue.length).toBeGreaterThan(0);
    for (const q of queue) {
      try {
        estate.act(ctx, s, q.by, q.a);
      } catch {}
    }
  }
  expect(s.props[1].owner).toBe('p1');
  expect(1500 - cash(s, 'p1')).toBeLessThanOrEqual(80);
  expect(1500 - cash(s, 'p1')).toBeGreaterThan(50); // p2 pushed the price up
});

test('estate: a bot offer waits 15 s without freezing the bot turn', () => {
  const { ctx, s, queue } = estateGame((id) => id === 'p0');
  s.props[1] = { owner: 'p0', houses: 0, mortgaged: false };
  s.props[3] = { owner: 'p1', houses: 0, mortgaged: false };
  s.phase = 'manage';
  estate.botPlan!(ctx, s, ['p0']);
  const offer = queue.find((q) => q.a.type === 'trade');
  expect(offer).toBeDefined();
  estate.act(ctx, s, 'p0', offer!.a);
  expect(s.trade.to).toBe('p1');
  expect(s.trade.endsAt).toBe(ctx.now + BOT_TRADE_MS);
  expect((estate.view(ctx, s, 'p1') as EstateView).trade!.endsAt).toBe(ctx.now + BOT_TRADE_MS);
  // the bot carries on with its turn while the offer is open
  queue.length = 0;
  estate.botPlan!(ctx, s, ['p0']);
  expect(queue.map((q) => q.a.type)).toEqual(['end']);
  estate.act(ctx, s, 'p0', queue[0].a);
  expect(s.players[s.turnIdx].id).toBe('p1');
  expect(s.phase).toBe('roll');
  expect(s.trade).not.toBeNull(); // still waiting for p1
  ctx.now += BOT_TRADE_MS - 1;
  expect(estate.tick!(ctx, s)).toBe(false);
  ctx.now += 2;
  expect(estate.tick!(ctx, s)).toBe(true);
  expect(s.trade).toBeNull();
});

test('estate: default 15 rounds and a single winner gets the win effect', () => {
  const { ctx, s, fx } = estateGame();
  s.players[1].bankrupt = true;
  s.players[2].cash = 10;
  s.players[2].bankrupt = false;
  s.players[0].cash = 5000;
  s.round = 15;
  s.turnIdx = 2;
  s.phase = 'manage';
  estate.act(ctx, s, 'p2', { type: 'end' });
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('p0');
  expect(fx.filter((f) => f.kind === 'win')).toEqual([{ kind: 'win', target: 'p0' }]);
});
