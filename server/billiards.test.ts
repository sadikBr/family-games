/**
 * «البلياردو» — the rules of 8-ball and 9-ball, the game flow on the server (ball in hand, the called
 * pocket, the outcome applied after the playback, teams, races, leaving), the view, the spoken calls
 * and the bots (a full game at every level, bounded thinking time, expert beats easy).
 */
import { expect, test } from 'bun:test';

import type { BilliardsView } from '../src/shared/games/billiards';
import { BREAK_SPOT, FOOT_X, FOOT_Y, HEAD_Y, L, R, W, type BallPos, type Pocketed } from '../src/shared/games/billiards-physics';
import { botShot } from './ai/billiards-bot';
import { foulText, judge, legalTargets, type Situation } from './billiards-rules';
import { RACK_PAUSE_MS, SHOT_SEND_MS, billiards, startBilliards, type BilliardsState } from './games/billiards';
import { GameError, type GameCtx } from './types';
import { BV, GROUP_VOICE, voiceFoul, voiceGroup, voiceRack } from './voice-calls-billiards';

type Level = 'easy' | 'smart' | 'expert';
interface Job {
  by: string;
  key: string;
  delay: number;
  a: { type: string; [k: string]: unknown };
}
type Said = { text: string; by?: string; voice?: string };

function fakeCtx(bots: string[] = []) {
  const jobs: Job[] = [];
  const fxs: [string, string | undefined][] = [];
  const said: Said[] = [];
  let level: Level = 'expert';
  const ctx: GameCtx & { jobs: Job[]; fxs: typeof fxs; said: Said[]; setLevel: (l: Level) => void } = {
    now: 1_000_000,
    fx: (k, t) => fxs.push([k, t]),
    say: (text, by, voice) => said.push({ text, by, voice }),
    isConnected: () => true,
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, delay, a) => jobs.push({ by, key, delay, a }),
    jobs,
    fxs,
    said,
    setLevel: (l) => (level = l),
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

const view = (ctx: GameCtx, s: BilliardsState, me: string) => billiards.view(ctx, s, me) as BilliardsView;
const shooter = (s: BilliardsState) => s.seats[s.seat];
/** Let the playback run out and the outcome be applied. */
const settle = (ctx: GameCtx, s: BilliardsState) => {
  ctx.now = s.rollEnds + 1;
  billiards.tick!(ctx, s);
};
const pk = (id: number, pocket = 0, t = 1): Pocketed => ({ id, pocket, t });
const sit = (o: Partial<Situation>): Situation => ({ mode: 'eight', onTable: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], group: null, breakShot: false, called: null, callPocket: true, ...o });

/** A shot from (cx, cy) straight at a ball at (bx, by): the angle. */
const at = (cx: number, cy: number, bx: number, by: number) => Math.atan2(by - cy, bx - cx);

/* ------------------------------------------------------------------ */
/* 8-ball rules                                                         */
/* ------------------------------------------------------------------ */

test('8-ball: open table — the first legal pot gives the group, the shooter carries on', () => {
  const v = judge(sit({}), { firstHit: 3, pocketed: [pk(3)], railAfterContact: true });
  expect(v).toMatchObject({ foul: null, assign: 'solids', cont: true, rack: null });
  // both groups go down: the first one decides
  const both = judge(sit({}), { firstHit: 3, pocketed: [pk(12, 1, 0.8), pk(3, 0, 1.2)], railAfterContact: true });
  expect(both.assign).toBe('stripes');
  expect(both.cont).toBe(true);
  // nothing assigned on a foul, even with balls down
  const foul = judge(sit({}), { firstHit: 3, pocketed: [pk(3), pk(0, 2)], railAfterContact: true });
  expect(foul).toMatchObject({ foul: 'scratch', assign: null, cont: false });
});

test('8-ball: the fouls — scratch, no ball, the wrong group or the 8 first, no rail', () => {
  expect(judge(sit({}), { firstHit: 8, pocketed: [], railAfterContact: true }).foul).toBe('eightFirst');
  expect(judge(sit({ group: 'solids' }), { firstHit: 11, pocketed: [], railAfterContact: true }).foul).toBe('wrong');
  expect(judge(sit({ group: 'solids' }), { firstHit: 8, pocketed: [], railAfterContact: true }).foul).toBe('eightFirst');
  expect(judge(sit({ group: 'solids' }), { firstHit: null, pocketed: [], railAfterContact: false }).foul).toBe('none');
  expect(judge(sit({ group: 'solids' }), { firstHit: 2, pocketed: [pk(0)], railAfterContact: true }).foul).toBe('scratch');
  expect(judge(sit({ group: 'solids' }), { firstHit: 2, pocketed: [], railAfterContact: false }).foul).toBe('rail');
  // a legal hit that reaches a cushion and pots nothing: no foul, the turn passes
  expect(judge(sit({ group: 'solids' }), { firstHit: 2, pocketed: [], railAfterContact: true })).toMatchObject({ foul: null, cont: false });
  // potting only the other group's ball: no foul, no extra shot
  expect(judge(sit({ group: 'solids' }), { firstHit: 2, pocketed: [pk(13)], railAfterContact: false })).toMatchObject({ foul: null, cont: false });
  // the reasons read without a verb for the player
  for (const f of ['scratch', 'none', 'wrong', 'eightFirst', 'rail'] as const) expect(foulText(f).length).toBeGreaterThan(4);
  expect(foulText('wrong', 3)).toContain('3');
});

test('8-ball: the 8 — early, with a scratch, in another pocket loses; in the called pocket wins', () => {
  const cleared = sit({ group: 'solids', onTable: [8, 9, 10], called: 5 });
  expect(legalTargets(cleared)).toEqual([8]);
  expect(judge(cleared, { firstHit: 8, pocketed: [pk(8, 5)], railAfterContact: true })).toMatchObject({ rack: 'win', foul: null });
  expect(judge(cleared, { firstHit: 8, pocketed: [pk(8, 4)], railAfterContact: true })).toMatchObject({ rack: 'lose', loseWhy: 'pocket' });
  expect(judge(cleared, { firstHit: 8, pocketed: [pk(8, 5), pk(0, 1)], railAfterContact: true })).toMatchObject({ rack: 'lose', loseWhy: 'foul' });
  // the 8 hit after another ball, then dropping: a foul, so the rack is lost
  expect(judge(cleared, { firstHit: 9, pocketed: [pk(8, 5)], railAfterContact: true })).toMatchObject({ rack: 'lose', loseWhy: 'foul' });
  // group not cleared yet (or the table still open): the 8 down is a loss, wherever it goes
  expect(judge(sit({ group: 'solids', onTable: [1, 8, 9], called: null }), { firstHit: 1, pocketed: [pk(1, 0, 1), pk(8, 3, 2)], railAfterContact: true })).toMatchObject({ rack: 'lose', loseWhy: 'early' });
  expect(judge(sit({}), { firstHit: 2, pocketed: [pk(8)], railAfterContact: true })).toMatchObject({ rack: 'lose', loseWhy: 'early' });
  // without calling pockets, any pocket wins
  expect(judge({ ...cleared, callPocket: false, called: null }, { firstHit: 8, pocketed: [pk(8, 2)], railAfterContact: true }).rack).toBe('win');
});

test('8-ball: the break — the 8 comes back and the breaker carries on; balls down keep the table, it stays open', () => {
  const brk = sit({ breakShot: true });
  expect(judge(brk, { firstHit: 4, pocketed: [pk(8, 1)], railAfterContact: true })).toMatchObject({ respot: 8, cont: true, rack: null, foul: null });
  expect(judge(brk, { firstHit: 4, pocketed: [pk(8, 1), pk(0, 2)], railAfterContact: true })).toMatchObject({ respot: 8, cont: false, rack: null, foul: 'scratch' });
  expect(judge(brk, { firstHit: 4, pocketed: [pk(2), pk(12)], railAfterContact: true })).toMatchObject({ cont: true, assign: null, foul: null });
  expect(judge(brk, { firstHit: 4, pocketed: [], railAfterContact: true })).toMatchObject({ cont: false, foul: null });
});

/* ------------------------------------------------------------------ */
/* 9-ball rules                                                         */
/* ------------------------------------------------------------------ */

const nine = (o: Partial<Situation> = {}) => sit({ mode: 'nine', onTable: [2, 3, 5, 9], ...o });

test('9-ball: lowest ball first; any ball down keeps the table; the 9 on a legal shot wins (break and combination too)', () => {
  expect(legalTargets(nine())).toEqual([2]);
  expect(judge(nine(), { firstHit: 3, pocketed: [], railAfterContact: true }).foul).toBe('wrong');
  expect(judge(nine(), { firstHit: 2, pocketed: [pk(5)], railAfterContact: false })).toMatchObject({ foul: null, cont: true });
  expect(judge(nine(), { firstHit: 2, pocketed: [pk(9)], railAfterContact: true })).toMatchObject({ rack: 'win' });
  expect(judge(nine({ breakShot: true, onTable: [1, 2, 3, 4, 5, 6, 7, 8, 9] }), { firstHit: 1, pocketed: [pk(9, 3)], railAfterContact: true }).rack).toBe('win');
  expect(judge(nine(), { firstHit: 2, pocketed: [], railAfterContact: false }).foul).toBe('rail');
  expect(judge(nine(), { firstHit: null, pocketed: [], railAfterContact: false }).foul).toBe('none');
});

test('9-ball: a 9 down on a foul comes back, the next player has the ball in hand', () => {
  const v = judge(nine(), { firstHit: 3, pocketed: [pk(9)], railAfterContact: true });
  expect(v).toMatchObject({ foul: 'wrong', respot: 9, rack: null, cont: false });
  const s = judge(nine(), { firstHit: 2, pocketed: [pk(9), pk(0, 1)], railAfterContact: true });
  expect(s).toMatchObject({ foul: 'scratch', respot: 9, rack: null });
});

/* ------------------------------------------------------------------ */
/* The game flow                                                        */
/* ------------------------------------------------------------------ */

/** A game with a hand-made table: `balls` (the cue ball id 0 included unless in hand). */
function setup(mode: 'eight' | 'nine', players: string[], balls: BallPos[], o: { inHand?: 'kitchen' | 'anywhere' | null; race?: number; callPocket?: boolean } = {}) {
  const ctx = fakeCtx();
  const s = startBilliards(ctx, players, { mode, race: o.race ?? 1, callPocket: o.callPocket ?? true, guide: 'long' }, seeded(1));
  s.balls = balls.map((b) => ({ ...b }));
  s.inHand = o.inHand ?? null;
  s.breakShot = false;
  s.seat = 0;
  s.aim = null;
  ctx.fxs.length = 0;
  ctx.said.length = 0;
  return { ctx, s };
}

test('flow: a shot is played at once, its trajectories go out once, and what it did shows after the playback', () => {
  // the 1 in front of the top-left corner, the cue ball behind it on the same line
  const obj = { id: 1, x: 300, y: 300 };
  const dir = at(obj.x, obj.y, 0, 0);
  const cue = { id: 0, x: obj.x - Math.cos(dir) * 600, y: obj.y - Math.sin(dir) * 600 };
  const { ctx, s } = setup('nine', ['a', 'b'], [cue, obj, { id: 9, x: 700, y: 1500 }]);
  billiards.act(ctx, s, 'a', { type: 'shot', a: dir, power: 0.42, spin: 0 });
  expect(s.phase).toBe('rolling');
  const v1 = view(ctx, s, 'b');
  expect(v1.shot?.id).toBe(v1.shotId);
  expect(v1.shot!.tr['1'].length).toBeGreaterThan(3);
  // the final positions are already in the view (someone opening the screen sees where the balls stopped)
  expect(v1.balls.filter((_, i) => i % 3 === 0)).not.toContain(1);
  // …but not what it did: the shooter's rack and the turn wait for the end of the playback
  expect(v1.sides[0].pocketed).toEqual([]);
  expect(billiards.turnOf!(s)).toEqual([]);
  ctx.now += SHOT_SEND_MS + 1;
  if (ctx.now < s.rollEnds) expect(view(ctx, s, 'b').shot).toBeNull();
  settle(ctx, s);
  expect(s.phase).toBe('aim');
  expect(shooter(s)).toBe('a');
  expect(view(ctx, s, 'a').sides[0].pocketed).toEqual([1]);
  expect(view(ctx, s, 'a').shot).toBeNull();
});

test('flow: a foul gives the next player the ball in hand anywhere, with a banner and a spoken call', () => {
  // the cue ball sent away from every ball: nothing touched
  const { ctx, s } = setup('eight', ['a', 'b'], [{ id: 0, x: 500, y: 1500 }, { id: 3, x: 200, y: 300 }, { id: 8, x: 800, y: 400 }, { id: 13, x: 850, y: 900 }]);
  s.sides[0].group = 'solids';
  s.sides[1].group = 'stripes';
  billiards.act(ctx, s, 'a', { type: 'shot', a: Math.PI / 2, power: 0.3, spin: 0 });
  settle(ctx, s);
  expect(shooter(s)).toBe('b');
  expect(s.inHand).toBe('anywhere');
  const v = view(ctx, s, 'b');
  expect(v.inHand).toBe('anywhere');
  expect(v.balls.filter((_, i) => i % 3 === 0)).not.toContain(0);
  expect(v.note).toMatchObject({ kind: 'foul', text: 'خطأ — الكرة في اليد لـb' });
  expect(ctx.fxs).toContainEqual(['buzz', 'a']);
  expect(ctx.said.at(-1)!.voice).toBe(voiceFoul());
  // a spot on a ball is refused; a free spot is fine
  expect(() => billiards.act(ctx, s, 'b', { type: 'shot', a: 0, power: 0.3, spin: 0, cue: [200, 300] })).toThrow(GameError);
  expect(() => billiards.act(ctx, s, 'b', { type: 'shot', a: 0, power: 0.3, spin: 0 })).toThrow(GameError);
  // not your turn
  expect(() => billiards.act(ctx, s, 'a', { type: 'shot', a: 0, power: 0.3, spin: 0, cue: [500, 1000] })).toThrow(GameError);
  billiards.act(ctx, s, 'b', { type: 'shot', a: at(500, 1000, 200, 300), power: 0.4, spin: 0, cue: [500, 1000] });
  expect(s.phase).toBe('rolling');
});

test('flow: the break — the cue ball goes behind the head string, an 8 on the break is re-spotted', () => {
  const ctx = fakeCtx();
  const s = startBilliards(ctx, ['a', 'b'], { mode: 'eight', race: 1, callPocket: true, guide: 'long' }, seeded(4));
  const v = view(ctx, s, shooter(s));
  expect(v.breakShot).toBe(true);
  expect(v.inHand).toBe('kitchen');
  expect(v.aim!.cue![1]).toBeGreaterThanOrEqual(HEAD_Y);
  const who = shooter(s);
  expect(() => billiards.act(ctx, s, who, { type: 'shot', a: -Math.PI / 2, power: 1, spin: 0, cue: [FOOT_X, HEAD_Y - 100] })).toThrow(GameError);
  // the 8 alone in front of a corner, as if the break sent it there
  s.balls = [{ id: 8, x: 300, y: 300 }, { id: 2, x: 700, y: 900 }];
  const dir = at(300, 300, 0, 0);
  const cue = { x: 300 - Math.cos(dir) * 600, y: 300 - Math.sin(dir) * 600 };
  // that spot is above the head string: allow it for this hand-made test
  s.inHand = 'anywhere';
  billiards.act(ctx, s, who, { type: 'shot', a: dir, power: 0.42, spin: 0, cue: [cue.x, cue.y] });
  settle(ctx, s);
  expect(s.phase).toBe('aim');
  expect(shooter(s)).toBe(who);
  const eight = s.balls.find((b) => b.id === 8)!;
  expect(eight.x).toBeCloseTo(FOOT_X, 3);
  expect(eight.y).toBeLessThanOrEqual(FOOT_Y);
  expect(view(ctx, s, who).note?.kind).toBe('respot');
  expect(ctx.said.at(-1)!.voice).toBe(BV.respot);
});

test('flow: the pocket for the 8 must be called; the 8 in the called pocket wins, in another loses', () => {
  const obj = { id: 8, x: 300, y: 300 };
  const dir = at(obj.x, obj.y, 0, 0);
  const cue = { id: 0, x: obj.x - Math.cos(dir) * 600, y: obj.y - Math.sin(dir) * 600 };
  for (const [called, wins] of [[0, true], [5, false]] as const) {
    const { ctx, s } = setup('eight', ['a', 'b'], [cue, obj, { id: 12, x: 800, y: 1800 }]);
    s.sides[0].group = 'solids';
    s.sides[1].group = 'stripes';
    expect(view(ctx, s, 'a').needCall).toBe(true);
    expect(view(ctx, s, 'a').targets).toEqual([8]);
    expect(() => billiards.act(ctx, s, 'a', { type: 'shot', a: dir, power: 0.42, spin: 0 })).toThrow(GameError);
    // the called pocket is relayed with the aim
    billiards.act(ctx, s, 'a', { type: 'aim', a: dir, pocket: called });
    expect(view(ctx, s, 'b').aim?.pocket).toBe(called);
    billiards.act(ctx, s, 'a', { type: 'shot', a: dir, power: 0.42, spin: 0, pocket: called });
    settle(ctx, s);
    expect(s.phase).toBe('final');
    expect(s.winner).toBe(wins ? 0 : 1);
    expect(billiards.result!(s)).toEqual({ places: wins ? [['a'], ['b']] : [['b'], ['a']] });
    expect(ctx.fxs).toContainEqual(['win', wins ? 'a' : 'b']);
    expect(ctx.said.at(-1)!.voice).toContain(BV.eight);
  }
});

test('flow: the group is announced to everyone (strip and voice)', () => {
  const obj = { id: 11, x: 300, y: 300 };
  const dir = at(obj.x, obj.y, 0, 0);
  const cue = { id: 0, x: obj.x - Math.cos(dir) * 600, y: obj.y - Math.sin(dir) * 600 };
  const { ctx, s } = setup('eight', ['a', 'b'], [cue, obj, { id: 2, x: 800, y: 1800 }, { id: 8, x: 500, y: 1000 }]);
  billiards.act(ctx, s, 'a', { type: 'shot', a: dir, power: 0.42, spin: 0 });
  settle(ctx, s);
  const v = view(ctx, s, 'b');
  expect(v.sides.map((x) => x.group)).toEqual(['stripes', 'solids']);
  expect(v.note).toMatchObject({ kind: 'group', text: 'الكرات المخططة لـa', sub: 'الكرات الكاملة لـb' });
  expect(ctx.said.at(-1)!.voice).toBe(voiceGroup('stripes', 'a'));
  expect(shooter(s)).toBe('a');
});

test('flow: four players in 8-ball are two teams; the seats alternate between the teams', () => {
  const { ctx, s } = setup('eight', ['a', 'b', 'c', 'd'], [{ id: 0, x: 500, y: 1500 }, { id: 3, x: 200, y: 300 }, { id: 8, x: 800, y: 400 }]);
  expect(s.sides.map((x) => x.ids)).toEqual([['a', 'c'], ['b', 'd']]);
  const order: string[] = [];
  for (let i = 0; i < 5; i++) {
    const who = shooter(s);
    order.push(who);
    // a miss away from every ball (a foul: the next seat gets the ball in hand)
    const cue = s.inHand ? [500, 1500] : undefined;
    billiards.act(ctx, s, who, { type: 'shot', a: Math.PI / 2, power: 0.25, spin: 0, cue });
    settle(ctx, s);
  }
  expect(order).toEqual(['a', 'b', 'c', 'd', 'a']);
  // three players can't play 8-ball
  expect(() => startBilliards(fakeCtx(), ['a', 'b', 'c'], { mode: 'eight', race: 1, callPocket: true, guide: 'long' })).toThrow(GameError);
  expect(() => startBilliards(fakeCtx(), ['a', 'b', 'c'], { mode: 'nine', race: 1, callPocket: true, guide: 'long' })).not.toThrow();
});

test('flow: races — the rack winner breaks the next rack, the match ends at the race, the rest ranked by racks', () => {
  const ctx = fakeCtx();
  const s = startBilliards(ctx, ['a', 'b', 'c'], { mode: 'nine', race: 2, callPocket: true, guide: 'long' }, seeded(9));
  const winRack = (who: string) => {
    // the 9 in front of a corner; `who` shoots it in
    s.seat = s.seats.indexOf(who);
    s.balls = [{ id: 9, x: 300, y: 300 }];
    s.inHand = 'anywhere';
    s.breakShot = false;
    const dir = at(300, 300, 0, 0);
    billiards.act(ctx, s, who, { type: 'shot', a: dir, power: 0.42, spin: 0, cue: [300 - Math.cos(dir) * 600, 300 - Math.sin(dir) * 600] });
    settle(ctx, s);
  };
  winRack('b');
  expect(s.phase).toBe('rack');
  expect(view(ctx, s, 'a').winner).toBe(1);
  expect(ctx.said.at(-1)!.voice).toContain(voiceRack('b'));
  expect(s.nextAt).toBe(ctx.now + RACK_PAUSE_MS);
  ctx.now = s.nextAt! + 1;
  billiards.tick!(ctx, s);
  expect(s.phase).toBe('aim');
  expect(s.rack).toBe(2);
  expect(shooter(s)).toBe('b');
  expect(s.breakShot).toBe(true);
  expect(s.balls).toHaveLength(9);
  winRack('c');
  ctx.now = s.nextAt! + 1;
  billiards.tick!(ctx, s);
  expect(shooter(s)).toBe('c');
  winRack('b');
  expect(s.phase).toBe('final');
  expect(billiards.result!(s)).toEqual({ places: [['b'], ['c'], ['a']] });
});

test('flow: leaving — a 1-vs-1 match goes to the other player; in 9-ball for three the others carry on', () => {
  const two = setup('eight', ['a', 'b'], [{ id: 0, x: 500, y: 1500 }, { id: 3, x: 200, y: 300 }, { id: 8, x: 800, y: 400 }]);
  billiards.onLeave!(two.ctx, two.s, 'a');
  expect(two.s.phase).toBe('final');
  expect(billiards.result!(two.s)!.places[0]).toEqual(['b']);
  const three = setup('nine', ['a', 'b', 'c'], [{ id: 0, x: 500, y: 1500 }, { id: 3, x: 200, y: 300 }, { id: 9, x: 800, y: 400 }]);
  billiards.onLeave!(three.ctx, three.s, 'a');
  expect(three.s.phase).toBe('aim');
  expect(three.s.seats).toEqual(['b', 'c']);
  expect(shooter(three.s)).toBe('b');
  billiards.act(three.ctx, three.s, 'c', { type: 'resign' });
  expect(three.s.phase).toBe('final');
  expect(billiards.result!(three.s)!.places[0]).toEqual(['b']);
  // a team keeps playing with the partner who stays
  const teams = setup('eight', ['a', 'b', 'c', 'd'], [{ id: 0, x: 500, y: 1500 }, { id: 3, x: 200, y: 300 }, { id: 8, x: 800, y: 400 }]);
  billiards.onLeave!(teams.ctx, teams.s, 'c');
  expect(teams.s.phase).toBe('aim');
  expect(teams.s.seats).toEqual(['a', 'b', 'd']);
});

test('flow: settings are sanitised (mode, race 1–3, call pocket, aim guide)', () => {
  const st = { mode: 'eight', race: 1, callPocket: true, guide: 'long' } as const;
  const s = { ...st } as { mode: string; race: number; callPocket: boolean; guide: string };
  billiards.patchSettings!(s as never, { mode: 'nine', race: 7, guide: 'short', callPocket: false });
  expect(s).toEqual({ mode: 'nine', race: 3, callPocket: false, guide: 'short' });
  billiards.patchSettings!(s as never, { mode: 'x', guide: 'y' });
  expect(s.mode).toBe('eight');
  expect(s.guide).toBe('long');
});

test('voice: the calls are short, vowelled Arabic', () => {
  const calls = [...Object.values(BV), ...Object.values(GROUP_VOICE), voiceFoul(), voiceGroup('solids', 'ماما'), voiceRack('بابا')];
  for (const v of calls) {
    expect(v).toMatch(/^[ء-غف-يً-ْ،]+( [ء-غف-يً-ْ،]+)*$/);
    expect(v).toMatch(/[ً-ْ]/);
    expect(v.split(' ').length).toBeLessThanOrEqual(6);
  }
  expect(voiceGroup('stripes', 'الحسن')).toBe('الكُرَاتُ المُخَطَّطَةُ لِلحسن');
});

/* ------------------------------------------------------------------ */
/* Bots                                                                 */
/* ------------------------------------------------------------------ */

/** Bots play a whole match against each other (levels per player); the bot plans are carried out at once. */
function botMatch(mode: 'eight' | 'nine', players: string[], levels: Record<string, Level>, seed: number, race = 1) {
  const ctx = fakeCtx(players);
  const s = startBilliards(ctx, players, { mode, race, callPocket: true, guide: 'long' }, seeded(seed));
  let shots = 0;
  let maxMs = 0;
  while (s.phase !== 'final' && shots < 300) {
    if (s.phase === 'aim') {
      const who = shooter(s);
      ctx.setLevel(levels[who]);
      ctx.jobs.length = 0;
      const t0 = performance.now();
      billiards.botPlan!(ctx, s, players);
      maxMs = Math.max(maxMs, performance.now() - t0);
      const aim = ctx.jobs.find((j) => j.a.type === 'aim');
      const shot = ctx.jobs.find((j) => j.a.type === 'shot');
      expect(aim && shot).toBeTruthy();
      expect(shot!.delay).toBeGreaterThan(aim!.delay);
      billiards.act(ctx, s, who, aim!.a);
      billiards.act(ctx, s, who, shot!.a);
      expect(s.phase as string).toBe('rolling');
      shots++;
    }
    ctx.now = Math.max(s.rollEnds, s.nextAt ?? 0) + 1;
    billiards.tick!(ctx, s);
  }
  return { s, shots, maxMs };
}

test('bots: a whole match at every level, in 8-ball and 9-ball, with a bounded thinking time', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    for (const mode of ['eight', 'nine'] as const) {
      const r = botMatch(mode, ['x', 'y'], { x: level, y: level }, mode === 'eight' ? 21 : 22);
      expect(r.s.phase).toBe('final');
      expect(r.maxMs).toBeLessThan(300);
      expect(billiards.result!(r.s)!.places.flat().sort()).toEqual(['x', 'y']);
    }
  }
  // four bots: teams in 8-ball, everyone for themselves in 9-ball
  const t = botMatch('eight', ['a', 'b', 'c', 'd'], { a: 'smart', b: 'expert', c: 'easy', d: 'smart' }, 5);
  expect(t.s.phase).toBe('final');
  expect(billiards.result!(t.s)!.places).toHaveLength(2);
  const n = botMatch('nine', ['a', 'b', 'c', 'd'], { a: 'smart', b: 'expert', c: 'easy', d: 'smart' }, 6);
  expect(n.s.phase).toBe('final');
}, 120_000);

test('bots: ball in hand — a legal spot and a good shot from it, within the time budget', () => {
  const rnd = seeded(3);
  for (let i = 0; i < 6; i++) {
    const balls: BallPos[] = [];
    for (const id of [1, 2, 3, 4, 8, 9, 10, 11]) {
      let x = 0;
      let y = 0;
      do {
        x = R + rnd() * (W - 2 * R);
        y = R + rnd() * (L - 2 * R);
      } while (balls.some((b) => Math.hypot(b.x - x, b.y - y) < 2 * R + 1));
      balls.push({ id, x, y });
    }
    const t0 = performance.now();
    const shot = botShot({ mode: 'eight', balls, inHand: 'anywhere', breakShot: false, group: 'solids', oppGroup: 'stripes', callPocket: true, level: 'expert', rnd });
    expect(performance.now() - t0).toBeLessThan(300);
    expect(shot.cue).toBeDefined();
    expect(balls.every((b) => Math.hypot(b.x - shot.cue!.x, b.y - shot.cue!.y) >= 2 * R + 0.5)).toBe(true);
  }
  // the break spot is behind the head string
  const brk = botShot({ mode: 'nine', balls: [{ id: 1, x: FOOT_X, y: FOOT_Y }], inHand: 'kitchen', breakShot: true, group: null, oppGroup: null, callPocket: true, level: 'expert', rnd });
  expect(brk.cue!.y).toBeGreaterThanOrEqual(HEAD_Y);
  expect(brk.power).toBeGreaterThan(0.9);
  expect(BREAK_SPOT.y).toBeGreaterThan(HEAD_Y);
});

test('bots: an easy straight pot is made by the expert', () => {
  const obj = { id: 5, x: 300, y: 300 };
  const dir = at(obj.x, obj.y, 0, 0);
  const cue = { id: 0, x: obj.x - Math.cos(dir) * 500, y: obj.y - Math.sin(dir) * 500 };
  let made = 0;
  for (let i = 0; i < 5; i++) {
    const { ctx, s } = setup('eight', ['a', 'b'], [cue, obj, { id: 12, x: 800, y: 1700 }, { id: 8, x: 600, y: 1100 }]);
    s.sides[0].group = 'solids';
    s.sides[1].group = 'stripes';
    const shot = botShot({ mode: 'eight', balls: s.balls, inHand: null, breakShot: false, group: 'solids', oppGroup: 'stripes', callPocket: true, level: 'expert', rnd: seeded(i) });
    billiards.act(ctx, s, 'a', { type: 'shot', a: shot.angle, power: shot.power, spin: shot.spin, pocket: shot.pocket });
    settle(ctx, s);
    if (s.sides[0].pocketed.includes(5)) made++;
  }
  expect(made).toBeGreaterThanOrEqual(4);
});

test('bots: the expert beats the easy bot most of the time', () => {
  let expert = 0;
  const games = 6;
  for (let i = 0; i < games; i++) {
    const mode = i % 2 ? 'nine' : 'eight';
    // alternate who breaks first by swapping the seats
    const players = i % 3 === 0 ? ['e', 'z'] : ['z', 'e'];
    const r = botMatch(mode, players, { e: 'expert', z: 'easy' }, 100 + i);
    if (billiards.result!(r.s)!.places[0].includes('e')) expert++;
  }
  expect(expert).toBeGreaterThanOrEqual(5);
}, 120_000);
