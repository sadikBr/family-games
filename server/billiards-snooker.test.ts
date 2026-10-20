/**
 * «البلياردو» — snooker: the table and its rack, the rules (scoring, re-spots, the colours in order,
 * every foul and its penalty), the flow on the server (the nominated colour, the score, the end of the
 * frame and a tie on the black), the spoken calls, the bots; and for both tables, that every ball drops
 * over the hole drawn for it and that the frame holds the pockets.
 */
import { expect, test } from 'bun:test';

import type { BilliardsView } from '../src/shared/games/billiards';
import {
  BAULK_Y,
  BLACK,
  COLOURS,
  D_R,
  POOL,
  REDS,
  SNOOKER,
  SPOTS,
  inZone,
  isRed,
  legalCueSpot,
  rackSnooker,
  respotColours,
  simulate,
  type BallPos,
  type Pocketed,
} from '../src/shared/games/billiards-physics';
import { botShot } from './ai/billiards-bot';
import { judgeSnooker, snookerNextOn, snookerRemaining, snookerTargets, type SnookerSit } from './billiards-rules';
import { billiards, startBilliards, type BilliardsState } from './games/billiards';
import { GameError, type GameCtx } from './types';
import { BV, voiceBreak, voiceFrame, voiceSnookerFoul } from './voice-calls-billiards';

type Level = 'easy' | 'smart' | 'expert';
interface Job {
  by: string;
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
    bot: (by, _key, _delay, a) => jobs.push({ by, a }),
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

const { W, L, R } = SNOOKER;
const view = (ctx: GameCtx, s: BilliardsState, me: string) => billiards.view(ctx, s, me) as BilliardsView;
const shooter = (s: BilliardsState) => s.seats[s.seat];
const settle = (ctx: GameCtx, s: BilliardsState) => {
  ctx.now = s.rollEnds + 1;
  billiards.tick!(ctx, s);
};
const pk = (id: number, pocket = 0, t = 1): Pocketed => ({ id, pocket, t });
const sit = (o: Partial<SnookerSit>): SnookerSit => ({ onTable: [...REDS, ...COLOURS], on: 'red', nominated: null, ...o });
const RED = 22;
/** A ball 300 mm from the top-left corner on its diagonal, the cue ball 600 mm behind it: a sure pot into pocket 0. */
const potLine = (id: number) => {
  const obj = { id, x: 300, y: 300 };
  const dir = Math.atan2(-300, -300);
  return { obj, dir, cue: { id: 0, x: obj.x - Math.cos(dir) * 600, y: obj.y - Math.sin(dir) * 600 } };
};

/** A snooker game with a hand-made table (the cue ball, id 0, included unless in hand). */
function setup(players: string[], balls: BallPos[], on: 'red' | 'colour' | number = 'red', scores = [0, 0]) {
  const ctx = fakeCtx();
  const s = startBilliards(ctx, players, { mode: 'snooker', race: 1, callPocket: true, guide: 'long' }, seeded(1));
  s.balls = balls.map((b) => ({ ...b }));
  s.inHand = balls.some((b) => b.id === 0) ? null : 'kitchen';
  s.breakShot = false;
  s.seat = 0;
  s.snk = { scores: [...scores], brk: 0, on };
  ctx.fxs.length = 0;
  ctx.said.length = 0;
  return { ctx, s };
}

/* ------------------------------------------------------------------ */
/* The table and the rack                                               */
/* ------------------------------------------------------------------ */

test('snooker: the rack — 15 reds in a triangle behind the pink, the colours on their spots, the cue ball in the D', () => {
  const balls = rackSnooker(seeded(3));
  expect(balls).toHaveLength(21);
  for (const c of COLOURS) expect(balls.find((b) => b.id === c)).toMatchObject(SPOTS[c]);
  // the spots: yellow / brown / green on the baulk line (yellow on the right seen from baulk), blue in the centre, pink, black
  expect(SPOTS[16]).toEqual({ x: W / 2 + D_R, y: BAULK_Y });
  expect(SPOTS[17]).toEqual({ x: W / 2 - D_R, y: BAULK_Y });
  expect(SPOTS[18]).toEqual({ x: W / 2, y: BAULK_Y });
  expect(SPOTS[19]).toEqual({ x: W / 2, y: L / 2 });
  expect(SPOTS[20].y).toBeCloseTo(L / 4, 6);
  expect(SPOTS[21].y).toBe(324);
  const reds = balls.filter((b) => isRed(b.id));
  expect(reds).toHaveLength(15);
  const apex = reds.reduce((a, b) => (b.y > a.y ? b : a));
  // the apex just behind the pink, not touching it; the triangle between the pink and the black
  expect(Math.abs(apex.x - W / 2)).toBeLessThan(1);
  expect(SPOTS[20].y - apex.y).toBeGreaterThan(2 * R);
  expect(SPOTS[20].y - apex.y).toBeLessThan(2 * R + 3);
  expect(Math.min(...reds.map((b) => b.y))).toBeGreaterThan(SPOTS[21].y + 4 * R);
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) expect(Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y)).toBeGreaterThan(2 * R);
  // a game starts with the cue ball in hand in the D, a red on, the scores at 0
  const ctx = fakeCtx();
  const s = startBilliards(ctx, ['a', 'b'], { mode: 'snooker', race: 1, callPocket: true, guide: 'long' }, seeded(2));
  const v = view(ctx, s, 'a');
  expect(v.mode).toBe('snooker');
  expect(v.inHand).toBe('kitchen');
  expect(v.snooker).toEqual({ scores: [0, 0], brk: 0, on: 'red', remaining: 147 });
  expect(v.targets.sort()).toEqual([...REDS].sort());
  expect(inZone(v.aim!.cue![0], v.aim!.cue![1], SNOOKER)).toBe(true);
  // the D: on or below the baulk line, within its radius
  expect(legalCueSpot([], W / 2, BAULK_Y + D_R - 1, true, SNOOKER)).toBe(true);
  expect(legalCueSpot([], W / 2 + D_R, BAULK_Y + 60, true, SNOOKER)).toBe(false);
  expect(legalCueSpot([], W / 2, BAULK_Y - 10, true, SNOOKER)).toBe(false);
  expect(() => billiards.act(ctx, s, shooter(s), { type: 'shot', a: -Math.PI / 2, power: 1, spin: 0, cue: [W / 2, BAULK_Y - 100] })).toThrow(GameError);
});

test('snooker: what is on and the points left on the table', () => {
  const all = [...REDS, ...COLOURS];
  expect(snookerRemaining(all, 'red')).toBe(147);
  expect(snookerRemaining(all.filter((b) => b !== RED), 'colour')).toBe(14 * 8 + 7 + 27);
  // the last red went down: its colour, then the colours
  expect(snookerRemaining(COLOURS, 'colour')).toBe(34);
  expect(snookerRemaining(COLOURS, 16)).toBe(27);
  expect(snookerRemaining([20, 21], 20)).toBe(13);
  expect(snookerNextOn(all, 'red', true)).toBe('colour');
  expect(snookerNextOn(all, 'colour', true)).toBe('red');
  expect(snookerNextOn(COLOURS, 'colour', false)).toBe(16);
  expect(snookerNextOn(COLOURS.slice(1), 16, true)).toBe(17);
  expect(snookerTargets(all, 'colour', 19)).toEqual([19]);
  expect(snookerTargets(all, 'colour')).toEqual(COLOURS);
});

/* ------------------------------------------------------------------ */
/* The rules                                                            */
/* ------------------------------------------------------------------ */

test('snooker: scoring — reds 1 each, then the nominated colour its value (re-spotted); later the colours in order, not re-spotted', () => {
  expect(judgeSnooker(sit({}), { firstHit: RED, pocketed: [pk(RED), pk(23, 3)] })).toMatchObject({ foul: null, points: 2, cont: true, respot: [] });
  expect(judgeSnooker(sit({}), { firstHit: RED, pocketed: [] })).toMatchObject({ foul: null, points: 0, cont: false });
  const col = sit({ on: 'colour', nominated: 19 });
  expect(judgeSnooker(col, { firstHit: 19, pocketed: [pk(19)] })).toMatchObject({ foul: null, points: 5, cont: true, respot: [19] });
  // nothing nominated: the colour hit first counts as nominated
  expect(judgeSnooker(sit({ on: 'colour' }), { firstHit: 21, pocketed: [pk(21)] })).toMatchObject({ foul: null, points: 7, respot: [21] });
  // the colours in order once the reds are gone
  const seq = sit({ onTable: COLOURS, on: 16 });
  expect(judgeSnooker(seq, { firstHit: 16, pocketed: [pk(16)] })).toMatchObject({ foul: null, points: 2, cont: true, respot: [], frameOver: false });
  expect(judgeSnooker(sit({ onTable: [BLACK], on: BLACK }), { firstHit: BLACK, pocketed: [pk(BLACK)] })).toMatchObject({ foul: null, points: 7, frameOver: true });
});

test('snooker: every foul and its penalty — max(4, the ball on, the ball hit first, any ball wrongly potted)', () => {
  // no ball hit
  expect(judgeSnooker(sit({}), { firstHit: null, pocketed: [] })).toMatchObject({ foul: 'none', penalty: 4 });
  expect(judgeSnooker(sit({ onTable: [20, 21], on: 20 }), { firstHit: null, pocketed: [] })).toMatchObject({ foul: 'none', penalty: 6 });
  // the wrong ball first
  expect(judgeSnooker(sit({}), { firstHit: 20, pocketed: [] })).toMatchObject({ foul: 'wrong', penalty: 6, wrongFirst: 20 });
  expect(judgeSnooker(sit({}), { firstHit: 16, pocketed: [] })).toMatchObject({ foul: 'wrong', penalty: 4 });
  expect(judgeSnooker(sit({ on: 'colour', nominated: 17 }), { firstHit: 21, pocketed: [] })).toMatchObject({ foul: 'wrong', penalty: 7 });
  expect(judgeSnooker(sit({ on: 'colour', nominated: 17 }), { firstHit: RED, pocketed: [] })).toMatchObject({ foul: 'wrong', penalty: 4 });
  expect(judgeSnooker(sit({ onTable: COLOURS, on: 16 }), { firstHit: 17, pocketed: [] })).toMatchObject({ foul: 'wrong', penalty: 4 });
  expect(judgeSnooker(sit({ onTable: COLOURS, on: 16 }), { firstHit: 21, pocketed: [] })).toMatchObject({ foul: 'wrong', penalty: 7 });
  // the cue ball down (a red that went with it stays down)
  expect(judgeSnooker(sit({}), { firstHit: RED, pocketed: [pk(RED), pk(0, 2)] })).toMatchObject({ foul: 'scratch', penalty: 4, respot: [], points: 0 });
  expect(judgeSnooker(sit({ on: 'colour', nominated: 19 }), { firstHit: 19, pocketed: [pk(19), pk(0, 2)] })).toMatchObject({ foul: 'scratch', penalty: 5, respot: [19] });
  // a ball that is not on goes down: colours come back, the penalty counts its value
  expect(judgeSnooker(sit({}), { firstHit: RED, pocketed: [pk(RED), pk(19, 3)] })).toMatchObject({ foul: 'potWrong', penalty: 5, respot: [19], points: 0 });
  expect(judgeSnooker(sit({ on: 'colour', nominated: 19 }), { firstHit: 19, pocketed: [pk(20)] })).toMatchObject({ foul: 'potWrong', penalty: 6, respot: [20] });
  expect(judgeSnooker(sit({ on: 'colour', nominated: 16 }), { firstHit: 16, pocketed: [pk(RED)] })).toMatchObject({ foul: 'potWrong', penalty: 4 });
  // a foul while only the black is left ends the frame
  expect(judgeSnooker(sit({ onTable: [BLACK], on: BLACK }), { firstHit: null, pocketed: [] })).toMatchObject({ foul: 'none', penalty: 7, frameOver: true });
});

test('snooker: a colour comes back on its spot, else the highest free spot, else as near as possible above its own', () => {
  expect(respotColours([], [19])).toEqual([{ id: 19, ...SPOTS[19] }]);
  // the blue spot is taken: the highest free one (the black's)
  const taken = respotColours([{ id: RED, ...SPOTS[19] }], [19]);
  expect(taken.at(-1)).toEqual({ id: 19, ...SPOTS[21] });
  // every spot taken: on the blue's line, as close as possible towards the top cushion
  const blockers = COLOURS.map((c, i) => ({ id: REDS[i], ...SPOTS[c] }));
  const near = respotColours(blockers, [19]).at(-1)!;
  expect(near.x).toBe(SPOTS[19].x);
  expect(near.y).toBeLessThan(SPOTS[19].y);
  expect(SPOTS[19].y - near.y).toBeGreaterThanOrEqual(2 * R);
  expect(SPOTS[19].y - near.y).toBeLessThan(2 * R + 2);
  // two at once: the higher value first (the black on its own spot, the pink then finds its own)
  const two = respotColours([], [20, 21]);
  expect(two.map((b) => b.id)).toEqual([21, 20]);
});

/* ------------------------------------------------------------------ */
/* The flow                                                             */
/* ------------------------------------------------------------------ */

test('flow: a red then the nominated colour — the score, the break, the colour re-spotted, a red again', () => {
  const red = potLine(RED);
  const { ctx, s } = setup(['a', 'b'], [red.cue, red.obj, { id: 19, ...SPOTS[19] }, { id: 23, x: 150, y: 1500 }]);
  billiards.act(ctx, s, 'a', { type: 'shot', a: red.dir, power: 0.42, spin: 0 });
  settle(ctx, s);
  expect(shooter(s)).toBe('a');
  expect(view(ctx, s, 'b').snooker).toMatchObject({ scores: [1, 0], brk: 1, on: 'colour' });
  expect(view(ctx, s, 'a').targets).toEqual([19]);
  // the blue on the pot line; the nomination is relayed with the aim
  const blue = potLine(19);
  s.balls = [blue.cue, blue.obj, { id: 23, x: 150, y: 1500 }];
  billiards.act(ctx, s, 'a', { type: 'aim', a: blue.dir, nom: 19 });
  expect(view(ctx, s, 'b').aim?.nom).toBe(19);
  billiards.act(ctx, s, 'a', { type: 'shot', a: blue.dir, power: 0.42, spin: 0, nom: 19 });
  settle(ctx, s);
  expect(shooter(s)).toBe('a');
  expect(s.snk).toMatchObject({ scores: [6, 0], brk: 6, on: 'red' });
  expect(s.balls.find((b) => b.id === 19)).toMatchObject(SPOTS[19]);
  // a miss ends the visit: the break goes back to 0, the other player is on a red
  const c = s.balls.find((x) => x.id === 0)!;
  const r23 = s.balls.find((x) => x.id === 23)!;
  billiards.act(ctx, s, 'a', { type: 'shot', a: Math.atan2(r23.y - c.y, r23.x - c.x) + 0.004, power: 0.55, spin: 0 });
  settle(ctx, s);
  expect(shooter(s)).toBe('b');
  expect(s.snk).toMatchObject({ scores: [6, 0], brk: 0, on: 'red' });
});

test('flow: nothing nominated — the colour the cue is aimed at is the one', () => {
  const blue = potLine(19);
  const { ctx, s } = setup(['a', 'b'], [blue.cue, blue.obj, { id: 21, ...SPOTS[21] }, { id: 23, x: 1500, y: 3000 }], 'colour');
  billiards.act(ctx, s, 'a', { type: 'shot', a: blue.dir, power: 0.42, spin: 0 });
  settle(ctx, s);
  expect(s.snk!.scores).toEqual([5, 0]);
  expect(shooter(s)).toBe('a');
  // a nomination that is not a colour on the table is ignored
  const { ctx: c2, s: s2 } = setup(['a', 'b'], [blue.cue, blue.obj, { id: 23, x: 1500, y: 3000 }], 'colour');
  billiards.act(c2, s2, 'a', { type: 'shot', a: blue.dir, power: 0.42, spin: 0, nom: 21 });
  settle(c2, s2);
  expect(s2.snk!.scores).toEqual([5, 0]);
});

test('flow: a foul — the penalty to the other side, a banner and a call; play goes on from where the cue ball lies (from the D after a scratch)', () => {
  // nothing hit: four points
  const { ctx, s } = setup(['a', 'b'], [{ id: 0, x: 900, y: 2000 }, { id: RED, x: 300, y: 600 }, { id: 21, ...SPOTS[21] }]);
  billiards.act(ctx, s, 'a', { type: 'shot', a: Math.PI / 2, power: 0.05, spin: 0 });
  settle(ctx, s);
  expect(shooter(s)).toBe('b');
  expect(s.snk).toMatchObject({ scores: [0, 4], on: 'red' });
  expect(s.inHand).toBeNull();
  expect(s.balls.some((b) => b.id === 0)).toBe(true);
  expect(view(ctx, s, 'b').note).toMatchObject({ kind: 'foul', text: 'خطأ من a: أربع نقاط لـb', sub: 'لا لمس لأي كرة' });
  expect(ctx.said.at(-1)!.voice).toBe(voiceSnookerFoul(4, 'b'));
  expect(ctx.fxs).toContainEqual(['buzz', 'a']);
  // the pink first while on a red: six points
  const { ctx: c2, s: s2 } = setup(['a', 'b'], [{ id: 0, x: W / 2, y: SPOTS[20].y + 500 }, { id: 20, ...SPOTS[20] }, { id: RED, x: 200, y: 3000 }]);
  billiards.act(c2, s2, 'a', { type: 'shot', a: -Math.PI / 2, power: 0.3, spin: 0 });
  settle(c2, s2);
  expect(s2.snk!.scores).toEqual([0, 6]);
  expect(s2.note?.sub).toContain('الكرة الوردية');
  // the cue ball potted (straight into the side pocket): the next player places it in the D
  const { ctx: c3, s: s3 } = setup(['a', 'b'], [{ id: 0, x: 400, y: L / 2 }, { id: RED, x: 1500, y: 600 }]);
  billiards.act(c3, s3, 'a', { type: 'shot', a: Math.PI, power: 0.3, spin: 0 });
  settle(c3, s3);
  expect(s3.snk!.scores).toEqual([0, 4]);
  expect(shooter(s3)).toBe('b');
  expect(view(c3, s3, 'b').inHand).toBe('kitchen');
  expect(inZone(s3.aim!.cue![0], s3.aim!.cue![1], SNOOKER)).toBe(true);
});

test('flow: the last black ends the frame; a tie re-spots it for the next player, cue ball in the D, and the first score wins', () => {
  const black = potLine(BLACK);
  const won = setup(['a', 'b'], [black.cue, black.obj], BLACK, [40, 30]);
  billiards.act(won.ctx, won.s, 'a', { type: 'shot', a: black.dir, power: 0.42, spin: 0 });
  settle(won.ctx, won.s);
  expect(won.s.phase).toBe('final');
  expect(won.s.snk!.scores).toEqual([47, 30]);
  expect(billiards.result!(won.s)).toEqual({ places: [['a'], ['b']] });
  expect(won.s.note).toMatchObject({ kind: 'rack', text: 'الإطار لـa', sub: '47–30' });
  // a tie after the black
  const tie = setup(['a', 'b'], [black.cue, black.obj], BLACK, [30, 37]);
  billiards.act(tie.ctx, tie.s, 'a', { type: 'shot', a: black.dir, power: 0.42, spin: 0 });
  settle(tie.ctx, tie.s);
  expect(tie.s.phase).toBe('aim');
  expect(tie.s.snk).toMatchObject({ scores: [37, 37], on: BLACK, brk: 0 });
  expect(tie.s.balls).toEqual([{ id: BLACK, ...SPOTS[21] }]);
  expect(shooter(tie.s)).toBe('b');
  expect(tie.s.inHand).toBe('kitchen');
  expect(tie.ctx.said.at(-1)!.voice).toBe(BV.tieBlack);
  // b misses the black entirely: a foul on the last black — seven to a, the frame to a
  billiards.act(tie.ctx, tie.s, 'b', { type: 'shot', a: Math.PI / 2, power: 0.05, spin: 0, cue: [W / 2, BAULK_Y + 100] });
  settle(tie.ctx, tie.s);
  expect(tie.s.phase).toBe('final');
  expect(tie.s.snk!.scores).toEqual([44, 37]);
  expect(billiards.result!(tie.s)!.places[0]).toEqual(['a']);
});

test('flow: frames — races to 2 alternate the break; four players play as two teams; three cannot', () => {
  const ctx = fakeCtx();
  const s = startBilliards(ctx, ['a', 'b'], { mode: 'snooker', race: 2, callPocket: true, guide: 'long' }, seeded(5));
  const first = shooter(s);
  s.balls = [potLine(BLACK).cue, potLine(BLACK).obj];
  s.inHand = null;
  s.breakShot = false;
  s.snk = { scores: [0, 0], brk: 0, on: BLACK };
  billiards.act(ctx, s, first, { type: 'shot', a: potLine(BLACK).dir, power: 0.42, spin: 0 });
  settle(ctx, s);
  expect(s.phase).toBe('rack');
  expect(ctx.said.at(-1)!.voice).toBe(voiceFrame(first));
  ctx.now = s.nextAt! + 1;
  billiards.tick!(ctx, s);
  expect(s.rack).toBe(2);
  expect(shooter(s)).not.toBe(first);
  expect(s.snk).toEqual({ scores: [0, 0], brk: 0, on: 'red' });
  expect(s.balls).toHaveLength(21);
  const four = startBilliards(fakeCtx(), ['a', 'b', 'c', 'd'], { mode: 'snooker', race: 1, callPocket: true, guide: 'long' });
  expect(four.sides.map((x) => x.ids)).toEqual([['a', 'c'], ['b', 'd']]);
  expect(four.snk!.scores).toEqual([0, 0]);
  expect(() => startBilliards(fakeCtx(), ['a', 'b', 'c'], { mode: 'snooker', race: 1, callPocket: true, guide: 'long' })).toThrow(GameError);
  const st = { mode: 'eight', race: 1, callPocket: true, guide: 'long' };
  billiards.patchSettings!(st as never, { mode: 'snooker' });
  expect(st.mode).toBe('snooker');
});

test('voice: snooker calls are short, vowelled, noun-first', () => {
  const calls = [voiceSnookerFoul(4, 'سارة'), voiceSnookerFoul(7, 'بابا'), voiceBreak(32, 'ماما')!, voiceBreak(55, 'ماما')!, voiceBreak(104, 'الحسن')!, voiceFrame('بابا'), BV.tieBlack];
  for (const v of calls) {
    expect(v).toMatch(/^[ء-غف-يً-ْ،]+( [ء-غف-يً-ْ،]+)*$/);
    expect(v).toMatch(/[ً-ْ]/);
    expect(v.split(' ').length).toBeLessThanOrEqual(6);
  }
  expect(voiceSnookerFoul(4, 'سارة')).toBe('خَطَأٌ، أَرْبَعُ نِقَاطٍ لِسارة');
  expect(voiceBreak(29, 'ماما')).toBeNull();
  expect(voiceBreak(32, 'ماما')).toBe('سِلْسِلَةُ ثَلَاثِينَ فَأَكْثَرَ لِماما');
});

/* ------------------------------------------------------------------ */
/* The pockets of both tables                                           */
/* ------------------------------------------------------------------ */

test('pockets: every ball drops with its centre over the hole drawn there; the holes and their caps sit inside the frame', () => {
  for (const t of [POOL, SNOOKER]) {
    const rnd = seeded(t.id === 'pool' ? 11 : 12);
    let drops = 0;
    for (let i = 0; i < 700; i++) {
      const x = t.R + rnd() * (t.W - 2 * t.R);
      const y = t.R + rnd() * (t.L - 2 * t.R);
      const p = t.pockets[Math.floor(rnd() * 6)];
      const a = Math.atan2(p.y - y, p.x - x) + (rnd() - 0.5) * 0.3;
      const r = simulate([{ id: 0, x, y }], { angle: a, power: 0.25 + rnd() * 0.5, spin: 0 }, false, undefined, t);
      for (const d of r.pocketed) {
        const h = t.holes[d.pocket];
        expect(Math.hypot(d.x! - h.x, d.y! - h.y)).toBeLessThan(h.r + 0.5);
        drops++;
      }
    }
    expect(drops).toBeGreaterThan(40);
    // the frame holds every hole with room for its lip
    for (const h of t.holes) {
      expect(h.x - h.r).toBeGreaterThan(-t.rail + 8);
      expect(h.x + h.r).toBeLessThan(t.W + t.rail - 8);
      expect(h.y - h.r).toBeGreaterThan(-t.rail + 8);
      expect(h.y + h.r).toBeLessThan(t.L + t.rail - 8);
    }
    // the sizes: pool corner mouths 2.1–2.25 balls across the jaws, middles 2.3–2.5, holes 1.9–2.1;
    // snooker corners 1.6–1.8, the middles a little wider
    const D = 2 * t.R;
    const corner = (Math.SQRT2 * (t.cornerNose + t.noseR) - 2 * t.noseR) / D;
    const side = (2 * t.sideHalf - 2 * t.noseR) / D;
    if (t.id === 'pool') {
      expect(corner).toBeGreaterThanOrEqual(2.1);
      expect(corner).toBeLessThanOrEqual(2.25);
      expect(side).toBeGreaterThanOrEqual(2.3);
      expect(side).toBeLessThanOrEqual(2.5);
      for (const h of t.holes) expect((2 * h.r) / D).toBeGreaterThanOrEqual(1.9);
      for (const h of t.holes) expect((2 * h.r) / D).toBeLessThanOrEqual(2.1);
    } else {
      expect(corner).toBeGreaterThanOrEqual(1.6);
      expect(corner).toBeLessThanOrEqual(1.8);
      expect(side).toBeGreaterThan(corner);
    }
  }
});

test('physics: snooker shots are deterministic and the balls stay on the cloth', () => {
  const balls = [{ id: 0, x: W / 2 + 100, y: BAULK_Y + 40 }, ...rackSnooker(seeded(1))];
  const shot = { angle: Math.atan2(SPOTS[20].y - 200 - balls[0].y, W / 2 + 60 - balls[0].x), power: 0.8, spin: 0.2 };
  const a = simulate(balls, shot, true, undefined, SNOOKER);
  const b = simulate(balls, shot, true, undefined, SNOOKER);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  for (const x of a.balls) {
    expect(x.x).toBeGreaterThanOrEqual(-R);
    expect(x.x).toBeLessThanOrEqual(W + R);
    for (const y of a.balls) if (x !== y) expect(Math.hypot(x.x - y.x, x.y - y.y)).toBeGreaterThan(2 * R - 0.05);
  }
});

/* ------------------------------------------------------------------ */
/* Bots                                                                 */
/* ------------------------------------------------------------------ */

/** Bots play a frame (with `reds` reds, to keep it short) — the plans carried out at once. */
function botFrame(levels: Record<string, Level>, players: string[], seed: number, reds: number, cap = 400) {
  const ctx = fakeCtx(players);
  const s = startBilliards(ctx, players, { mode: 'snooker', race: 1, callPocket: true, guide: 'long' }, seeded(seed));
  s.balls = s.balls.filter((b) => !REDS.slice(reds).includes(b.id));
  let shots = 0;
  let maxMs = 0;
  while (s.phase !== 'final' && shots < cap) {
    if (s.phase === 'aim') {
      const who = shooter(s);
      ctx.setLevel(levels[who]);
      ctx.jobs.length = 0;
      const t0 = performance.now();
      billiards.botPlan!(ctx, s, players);
      maxMs = Math.max(maxMs, performance.now() - t0);
      const aim = ctx.jobs.find((j) => j.a.type === 'aim')!;
      const shot = ctx.jobs.find((j) => j.a.type === 'shot')!;
      // a colour on: the bot always names one that is on the table
      if (s.snk!.on === 'colour' && shot.a.nom !== undefined) expect(s.balls.some((b) => b.id === shot.a.nom)).toBe(true);
      billiards.act(ctx, s, who, aim.a);
      billiards.act(ctx, s, who, shot.a);
      expect(s.phase as string).toBe('rolling');
      shots++;
    }
    ctx.now = Math.max(s.rollEnds, s.nextAt ?? 0) + 1;
    billiards.tick!(ctx, s);
  }
  return { s, shots, maxMs };
}

test('bots: a frame at every level ends, each decision within the time budget (a full rack too)', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const r = botFrame({ x: level, y: level }, ['x', 'y'], 31, 3);
    expect(r.s.phase).toBe('final');
    expect(r.maxMs).toBeLessThan(300);
    expect(billiards.result!(r.s)!.places.flat().sort()).toEqual(['x', 'y']);
  }
  // 22 balls on the table: the break-off and a few shots stay within the budget
  const full = botFrame({ x: 'expert', y: 'smart' }, ['x', 'y'], 7, 15, 12);
  expect(full.maxMs).toBeLessThan(300);
  // two teams of bots
  const teams = botFrame({ a: 'smart', b: 'expert', c: 'easy', d: 'smart' }, ['a', 'b', 'c', 'd'], 8, 2);
  expect(teams.s.phase).toBe('final');
}, 120_000);

test('bots: after a red the expert takes a colour it can pot (and names it)', () => {
  // the black hanging over a corner, the blue far away: the black is the obvious colour
  const balls: BallPos[] = [{ id: 0, x: 420, y: 420 }, { id: BLACK, x: 120, y: 120 }, { id: 19, ...SPOTS[19] }, { id: 16, ...SPOTS[16] }, { id: RED, x: 1500, y: 3000 }];
  let made = 0;
  for (let i = 0; i < 4; i++) {
    const shot = botShot({ mode: 'snooker', balls, inHand: null, breakShot: false, group: null, oppGroup: null, callPocket: false, level: 'expert', rnd: seeded(i), snooker: { on: 'colour' } });
    expect(shot.nom).toBe(BLACK);
    const r = simulate(balls, shot, false, undefined, SNOOKER);
    if (r.pocketed.some((p) => p.id === BLACK)) made++;
  }
  expect(made).toBeGreaterThanOrEqual(3);
});

test('bots: the expert beats the easy bot most of the time', () => {
  let expert = 0;
  const games = 4;
  for (let i = 0; i < games; i++) {
    const players = i % 2 ? ['e', 'z'] : ['z', 'e'];
    const r = botFrame({ e: 'expert', z: 'easy' }, players, 200 + i, 3);
    if (r.s.phase === 'final' && billiards.result!(r.s)!.places[0].includes('e')) expert++;
  }
  expect(expert).toBeGreaterThanOrEqual(3);
}, 120_000);
