/** Board games announce every move on the turn bar (ctx.say), with the player who made it. */
import { afterEach, expect, test } from 'bun:test';

import type { GameAction } from '../src/shared/protocol';
import { battleship } from './games/battleship';
import { blocks } from './games/blocks';
import { chess } from './games/chess';
import { connect4 } from './games/connect4';
import { dama } from './games/dama';
import { dots } from './games/dots';
import { hajj } from './games/hajj';
import { kharbga } from './games/kharbga';
import { ladders } from './games/ladders';
import { ludo } from './games/ludo';
import { mancala, sowingMs } from './games/mancala';
import { xo } from './games/xo';
import type { GameCtx } from './types';

function fakeCtx() {
  const said: { text: string; by?: string }[] = [];
  const bots: { by: string; a: GameAction }[] = [];
  const ctx: GameCtx = {
    now: 1_000_000,
    fx: () => {},
    isConnected: () => true,
    isBot: () => false,
    playerName: (id) => `«${id}»`,
    memo: new Map(),
    bot: (by, _key, _delay, a) => void bots.push({ by, a }),
    say: (text, by) => void said.push({ text, by }),
  };
  const last = () => said[said.length - 1];
  return { ctx, said, bots, last };
}

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});

/* eslint-disable @typescript-eslint/no-explicit-any */

test('ludo: the roll and the move are announced; the bot waits for the dice to land', () => {
  const { ctx, last, bots } = fakeCtx();
  const s: any = ludo.start(ctx, ['a', 'b'], { exitOnOne: false, podium: false, quick: false });
  s.turnIdx = 0;
  s.tokens.a = [10, 20, -1, -1];
  Math.random = () => 3 / 6 + 0.01; // a 4
  ludo.act(ctx, s, 'a', { type: 'roll' });
  Math.random = realRandom;
  expect(last()).toEqual({ text: 'رمية لـ«a»: 4', by: 'a' });
  ludo.act(ctx, s, 'a', { type: 'move', token: 0 });
  expect(last()).toEqual({ text: 'رمية لـ«a»: 4 — حركة قطعة', by: 'a' });
  expect(s.lastMove).toMatchObject({ by: 'a', token: 0, from: 10, to: 14 });
  // a bot's move comes well after its roll (×1.4 pace on top): the number is seen first
  const b: any = ludo.start(ctx, ['a', 'b'], { exitOnOne: false, podium: false, quick: false });
  b.turnIdx = 0;
  b.tokens.a = [10, 20, -1, -1];
  b.phase = 'move';
  b.dice = 3;
  const delays: number[] = [];
  ludo.botPlan!({ ...ctx, isBot: () => true, bot: (_id, _k, d) => void delays.push(d) }, b, ['a']);
  expect(delays[0]).toBeGreaterThanOrEqual(1500);
  expect(bots.length).toBe(0);
});

test('ludo: a capture names the player whose piece was taken', () => {
  const { ctx, last } = fakeCtx();
  const s: any = ludo.start(ctx, ['a', 'b'], { exitOnOne: false, podium: false, quick: false });
  s.turnIdx = 0;
  // red (a) at 10 + 2 = track 12; yellow (b) starts at 26: progress 38 is track 12
  s.tokens.a = [10, -1, -1, -1];
  s.tokens.b = [38, -1, -1, -1];
  Math.random = () => 1 / 6 + 0.01; // a 2
  ludo.act(ctx, s, 'a', { type: 'roll' });
  Math.random = realRandom;
  ludo.act(ctx, s, 'a', { type: 'move', token: 0 });
  expect(last().text).toBe('رمية لـ«a»: 2 — قطعة «b» عادت إلى القاعدة — ودور إضافي');
});

test('dama: a move is announced', () => {
  const { ctx, last } = fakeCtx();
  const s: any = dama.start(ctx, ['a', 'b'], { flyingKings: false, backCapture: false, maxCapture: false });
  const v: any = dama.view(ctx, s, s.white);
  const m = v.moves[0];
  dama.act(ctx, s, s.white, { type: 'move', from: m.from, to: m.path[m.path.length - 1] });
  expect(last()).toEqual({ text: `حركة من «${s.white}»`, by: s.white });
});

test('chess: the piece and its square are announced', () => {
  const { ctx, last } = fakeCtx();
  const s: any = chess.start(ctx, ['a', 'b'], { level: 1 } as any);
  chess.act(ctx, s, s.white, { type: 'move', from: 52, to: 36 }); // e2 → e4
  expect(last()).toEqual({ text: `حركة من «${s.white}»: الجندي إلى e4`, by: s.white });
});

test('kharbga: a placed piece is announced and marked as the last move', () => {
  const { ctx, last } = fakeCtx();
  const s: any = kharbga.start(ctx, ['a', 'b'], { level: 1 });
  kharbga.act(ctx, s, s.attacker, { type: 'place', cell: 0 });
  kharbga.act(ctx, s, s.attacker, { type: 'place', cell: 1 });
  expect(last()).toEqual({ text: `قطعة جديدة لـ«${s.attacker}» (الباقي: 22)`, by: s.attacker });
  expect(s.last).toEqual({ from: 0, to: 1, captured: [] });
  expect(s.turn).toBe(2);
  kharbga.act(ctx, s, s.defender, { type: 'place', cell: 6 });
  expect(s.last).toEqual({ from: 6, to: 6, captured: [] });
  kharbga.act(ctx, s, s.defender, { type: 'undo' });
  expect(s.last).toBeNull();
});

test('connect4 and xo: a disc / a mark is announced', () => {
  const { ctx, last } = fakeCtx();
  const c: any = connect4.start(ctx, ['a', 'b'], { level: 1 } as any);
  connect4.act(ctx, c, c.red, { type: 'drop', col: 3 });
  expect(last()).toEqual({ text: `قرص من «${c.red}»`, by: c.red });
  const x: any = xo.start(ctx, ['a', 'b'], { level: 1, size: 3 });
  xo.act(ctx, x, x.x, { type: 'mark', cell: 4 });
  expect(last()).toEqual({ text: `X من «${x.x}»`, by: x.x });
});

test('dots: a line is announced', () => {
  const { ctx, last } = fakeCtx();
  const s: any = dots.start(ctx, ['a', 'b'], { size: 3, level: 'easy' });
  dots.act(ctx, s, s.seats[0], { type: 'line', line: 0 });
  expect(last()).toEqual({ text: `خط من «${s.seats[0]}»`, by: s.seats[0] });
});

test('mancala: sowing is announced; the bot waits for the seeds to land on the phones', () => {
  const { ctx, last } = fakeCtx();
  const s: any = mancala.start(ctx, ['a', 'b'], { seeds: 4, level: 'easy' });
  mancala.act(ctx, s, s.seats[0], { type: 'sow', pit: 0 });
  expect(last()).toEqual({ text: `توزيع من «${s.seats[0]}»: 4 حبات`, by: s.seats[0] });
  expect(sowingMs(s.last)).toBe(4 * 170);
  expect(sowingMs({ ...s.last, capture: { pit: 1, opposite: 11, seeds: 3 } })).toBe(4 * 170 + 750);
});

test('battleship: a shot is announced', () => {
  const { ctx, last } = fakeCtx();
  const s: any = battleship.start(ctx, ['a', 'b'], { level: 1 });
  battleship.act(ctx, s, 'a', { type: 'ready' });
  battleship.act(ctx, s, 'b', { type: 'ready' });
  const shooter = s.players[0];
  const enemy = s.players[1];
  const water = Array.from({ length: 100 }, (_, i) => i).find((i) => !s.fleets[enemy].some((sh: number[]) => sh.includes(i)))!;
  battleship.act(ctx, s, shooter, { type: 'fire', cell: water });
  expect(last()).toEqual({ text: `طلقة من «${shooter}»: في الماء`, by: shooter });
  const hit = s.fleets[shooter][0][0];
  battleship.act(ctx, s, enemy, { type: 'fire', cell: hit });
  expect(last().text).toContain('إصابة');
});

test('blocks: a placed piece is announced with its size', () => {
  const { ctx, last, bots } = fakeCtx();
  const s: any = blocks.start(ctx, ['a', 'b'], { level: 'easy' });
  const first = s.seats[0];
  blocks.botPlan!(ctx, s, [first]);
  blocks.act(ctx, s, first, bots[0].a);
  expect(last().by).toBe(first);
  expect(last().text).toStartWith('قطعة من ');
});

test('announcements attach the name with لـ without conjugating a verb', () => {
  const { ctx, last } = fakeCtx();
  const named = { ...ctx, playerName: (id: string) => ({ a: 'ماما', b: 'الحسن' })[id] ?? id };
  const l: any = ladders.start(named, ['a', 'b'], { exact: true });
  l.players = [l.players.find((p: any) => p.id === 'a'), l.players.find((p: any) => p.id === 'b')];
  l.turnIdx = 0;
  Math.random = () => 2 / 6 + 0.01;
  ladders.act(named, l, 'a', { type: 'roll' });
  expect(last().text).toBe('رمية لماما: 3 — إلى الخانة 3');
  ladders.act(named, l, 'b', { type: 'roll' });
  Math.random = realRandom;
  expect(last().text).toBe('رمية للحسن: 3 — إلى الخانة 3');
});

test('ladders and hajj: the roll is announced with where it led', () => {
  const { ctx, last } = fakeCtx();
  const l: any = ladders.start(ctx, ['a', 'b'], { exact: true });
  const p = l.players[0];
  Math.random = () => 2 / 6 + 0.01; // a 3: square 3 has no ladder or snake
  ladders.act(ctx, l, p.id, { type: 'roll' });
  Math.random = realRandom;
  expect(last()).toEqual({ text: `رمية لـ«${p.id}»: 3 — إلى الخانة 3`, by: p.id });

  const hj: any = hajj.start(ctx, ['a', 'b'], { questions: false });
  const q = hj.players[hj.turnIdx];
  hajj.act(ctx, hj, q.id, { type: 'roll' });
  expect(last().by).toBe(q.id);
  expect(last().text).toStartWith(`رمية لـ«${q.id}»: `);
});
