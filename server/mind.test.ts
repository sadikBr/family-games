/**
 * «العقل الواحد» — dealing per level, the focus moment, ordered plays (always the lowest card), the mistake
 * rule (lower cards put aside face up, a life lost, the pause), stars (only when everyone agrees), rewards,
 * winning and losing (the co-op result), simultaneous taps with `base`, bots (they clear the easy levels),
 * no leak of other hands, leaving mid-level, settings.
 */
import { expect, test } from 'bun:test';

import { MIND_DEFAULTS, MIND_VOTE_MS, mindLevels, mindStartKit, type MindSettings, type MindView } from '../src/shared/games/mind';
import { DEFAULT_SETTINGS, type BotLevel } from '../src/shared/protocol';
import { MIND_CLEARED_MS, MIND_OOPS_MS, MIND_SIMUL_MS, mind, mindBotAgrees, mindBotDelay, sanitizeMind, startMind, type MindState } from './games/mind';
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

const settings = (o: Partial<MindSettings> = {}): MindSettings => ({ ...MIND_DEFAULTS, ...o });
const act = (ctx: Ctx, s: MindState, by: string, a: Record<string, unknown>) => mind.act(ctx, s, by, { level: s.level, ...a } as never);
const view = (ctx: Ctx, s: MindState, me: string) => mind.view(ctx, s, me) as MindView;
const readyAll = (ctx: Ctx, s: MindState) => s.participants.forEach((p) => act(ctx, s, p, { type: 'ready' }));
const tap = (ctx: Ctx, s: MindState, by: string, base = s.pile.length) => act(ctx, s, by, { type: 'play', base, card: s.hands[by][0] });

/** A level in play with chosen hands. */
function setup(hands: Record<string, number[]>, ctx = fakeCtx(), o: Partial<MindSettings> = {}) {
  const s = startMind(ctx, Object.keys(hands), settings(o), seeded(1));
  readyAll(ctx, s);
  s.hands = Object.fromEntries(Object.entries(hands).map(([p, h]) => [p, [...h].sort((x, y) => x - y)]));
  return { s, ctx };
}

/* ------------------------------------------------------------------ */

test('levels, lives and the start: per player count, rewards of skipped levels, the comfy start', () => {
  expect([2, 3, 4, 5, 6].map(mindLevels)).toEqual([12, 10, 8, 7, 7]);
  expect(mindStartKit(2, settings())).toEqual({ lives: 2, stars: 1 });
  expect(mindStartKit(6, settings())).toEqual({ lives: 5, stars: 1 });
  expect(mindStartKit(3, settings({ start: 3 }))).toEqual({ lives: 3, stars: 2 });
  expect(mindStartKit(3, settings({ start: 5 }))).toEqual({ lives: 4, stars: 2 });
  expect(mindStartKit(4, settings({ extra: true }))).toEqual({ lives: 5, stars: 2 });
});

test('dealing: L distinct cards each, lowest first, then the focus moment until everyone is ready', () => {
  const ctx = fakeCtx();
  const s = startMind(ctx, ['a', 'b', 'c'], settings({ start: 3 }), seeded(4));
  expect(s.phase).toBe('focus');
  expect(s.level).toBe(3);
  const all = ['a', 'b', 'c'].flatMap((p) => s.hands[p]);
  expect(all).toHaveLength(9);
  expect(new Set(all).size).toBe(9);
  for (const c of all) expect(c >= 1 && c <= 100).toBe(true);
  for (const p of ['a', 'b', 'c']) expect(s.hands[p]).toEqual([...s.hands[p]].sort((x, y) => x - y));
  // no play before the level starts
  act(ctx, s, 'a', { type: 'play', base: 0, card: s.hands.a[0] });
  expect(s.pile).toHaveLength(0);
  act(ctx, s, 'a', { type: 'ready' });
  ctx.offline.add('c'); // someone away doesn't hold the team up
  expect(mind.turnOf!(s)).toEqual(['b', 'c']);
  act(ctx, s, 'b', { type: 'ready' });
  expect(s.phase).toBe('play');
  expect(view(ctx, s, 'a').lastAt).toBe(ctx.now);
});

test('ordered plays clear the level, the reward follows, the next level deals one more card', () => {
  const { s, ctx } = setup({ a: [10, 40], b: [25, 60] });
  s.level = 2;
  expect(() => act(ctx, s, 'a', { type: 'play', base: 0, card: 40 })).toThrow('أصغر بطاقة');
  tap(ctx, s, 'a');
  tap(ctx, s, 'b');
  tap(ctx, s, 'a');
  expect(s.phase).toBe('play');
  tap(ctx, s, 'b');
  expect(s.pile.map((p) => p.card)).toEqual([10, 25, 40, 60]);
  expect(s.phase).toBe('cleared');
  expect(s.reward).toEqual({ kind: 'star', capped: false });
  expect(s.stars).toBe(2);
  expect(s.lives).toBe(2);
  ctx.now += MIND_CLEARED_MS;
  expect(mind.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('focus');
  expect(s.level).toBe(3);
  expect(s.hands.a).toHaveLength(3);
  expect(s.pile).toHaveLength(0);
  // the host may move on at once
  const r = setup({ a: [5], b: [6] });
  tap(r.ctx, r.s, 'a');
  tap(r.ctx, r.s, 'b');
  expect(r.s.phase).toBe('cleared');
  expect(r.s.reward).toBeNull();
  act(r.ctx, r.s, 'a', { type: 'next' });
  expect(r.s.level).toBe(2);
});

test('a mistake: a life lost, every lower card put aside face up, a pause, then play goes on', () => {
  const { s, ctx } = setup({ a: [40, 90], b: [30, 35, 50], c: [20, 45] });
  tap(ctx, s, 'a'); // 40 while 20, 30 and 35 are lower
  expect(s.lives).toBe(2);
  expect(s.phase).toBe('oops');
  expect(s.hands.b).toEqual([50]);
  expect(s.hands.c).toEqual([45]);
  const v = view(ctx, s, 'b');
  expect(v.mistake).toMatchObject({ card: 40, by: 'a', seq: 1 });
  expect(v.mistake!.lower).toEqual([
    { by: 'b', cards: [30, 35] },
    { by: 'c', cards: [20] },
  ]);
  expect(v.shown.map((x) => x.card).sort()).toEqual([20, 30, 35]);
  expect(v.shown.every((x) => x.why === 'mistake')).toBe(true);
  expect(() => tap(ctx, s, 'c')).toThrow(GameError);
  ctx.now += MIND_OOPS_MS;
  expect(mind.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('play');
  tap(ctx, s, 'c');
  tap(ctx, s, 'b');
  tap(ctx, s, 'a');
  expect(s.phase).toBe('cleared');
  expect(s.stats.mistakes).toBe(1);
});

test('a mistake that empties every hand clears the level after the pause; no life left loses the game', () => {
  const { s, ctx } = setup({ a: [50], b: [20] });
  tap(ctx, s, 'a');
  expect(s.phase).toBe('oops');
  ctx.now += MIND_OOPS_MS;
  mind.tick!(ctx, s);
  expect(s.phase).toBe('cleared');
  expect(s.lives).toBe(1);
  // the last life
  const r = setup({ a: [50, 70], b: [20, 90] });
  r.s.lives = 1;
  tap(r.ctx, r.s, 'a');
  expect(r.s.phase).toBe('oops');
  expect(mind.result!(r.s)).toBeNull();
  r.ctx.now += MIND_OOPS_MS;
  mind.tick!(r.ctx, r.s);
  expect(r.s.phase).toBe('final');
  expect(view(r.ctx, r.s, 'a').won).toBe(false);
  expect(mind.result!(r.s)).toEqual({ places: [['a', 'b']], coop: { won: false } });
});

test('a star needs everyone holding cards: each hand then shows its lowest card', () => {
  const { s, ctx } = setup({ a: [10, 60, 65], b: [30, 70], c: [] });
  s.stars = 2;
  act(ctx, s, 'a', { type: 'star' });
  expect(view(ctx, s, 'c').proposal).toMatchObject({ by: 'a', yes: ['a'], voters: ['a', 'b'] });
  expect(mind.turnOf!(s)).toEqual(['b']);
  expect(s.hands.a).toEqual([10, 60, 65]);
  act(ctx, s, 'b', { type: 'star', on: true });
  expect(s.proposal).toBeNull();
  expect(s.stars).toBe(1);
  expect(s.hands).toEqual({ a: [60, 65], b: [70], c: [] });
  expect(s.shown).toEqual([
    { card: 10, by: 'a', why: 'star' },
    { card: 30, by: 'b', why: 'star' },
  ]);
  expect(s.pile).toHaveLength(0);
  // a «لا» cancels, a card laid cancels, the time runs out
  act(ctx, s, 'b', { type: 'star' });
  act(ctx, s, 'a', { type: 'star', on: false });
  expect(s.proposal).toBeNull();
  act(ctx, s, 'b', { type: 'star' });
  tap(ctx, s, 'a');
  expect(s.proposal).toBeNull();
  act(ctx, s, 'b', { type: 'star' });
  ctx.now += MIND_VOTE_MS;
  expect(mind.tick!(ctx, s)).toBe(true);
  expect(s.proposal).toBeNull();
  expect(s.stars).toBe(1);
  // no star left
  s.stars = 0;
  expect(() => act(ctx, s, 'a', { type: 'star' })).toThrow('لا نجوم');
});

test('a star that empties the hands clears the level; someone away counts as agreeing', () => {
  const { s, ctx } = setup({ a: [10], b: [30], c: [50] });
  ctx.offline.add('c');
  act(ctx, s, 'a', { type: 'star' });
  act(ctx, s, 'b', { type: 'star' });
  expect(s.phase).toBe('cleared');
  expect(s.shown.map((x) => x.card)).toEqual([10, 30, 50]);
  expect(s.stats.starsUsed).toBe(1);
});

test('rewards: a star after 2, 5, 8; a life after 3, 6, 9; capped at the maximum', () => {
  const clear = (start: number, n = 2, kit: Partial<{ lives: number; stars: number }> = {}) => {
    const hands = Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, [i + 1]]));
    const { s, ctx } = setup(hands, fakeCtx(), { start: start <= 1 ? 1 : start <= 3 ? 3 : 5 });
    s.level = start;
    Object.assign(s, kit);
    for (const p of s.participants) tap(ctx, s, p);
    return s;
  };
  expect(clear(3).reward).toEqual({ kind: 'life', capped: false });
  expect(clear(3).lives).toBe(3);
  expect(clear(5, 2, { stars: 1 }).stars).toBe(2);
  expect(clear(6, 6, { lives: 5 }).reward).toEqual({ kind: 'life', capped: true });
  expect(clear(8, 2, { stars: 3 }).reward).toEqual({ kind: 'star', capped: true });
  expect(clear(4).reward).toBeNull();
});

test('the last level cleared wins the game (a co-op result)', () => {
  const { s, ctx } = setup({ a: [3], b: [9], c: [4] });
  s.level = s.levels;
  tap(ctx, s, 'a');
  tap(ctx, s, 'c');
  tap(ctx, s, 'b');
  expect(s.phase).toBe('final');
  expect(view(ctx, s, 'a').won).toBe(true);
  expect(mind.result!(s)).toEqual({ places: [['a', 'b', 'c']], coop: { won: true } });
});

test('simultaneous taps: both counted whatever the order; a stale tap never plays another card', () => {
  // the lower card first: the higher one (same base) is still right
  const r1 = setup({ a: [30, 80], b: [32, 90] });
  act(r1.ctx, r1.s, 'a', { type: 'play', base: 0, card: 30 });
  act(r1.ctx, r1.s, 'b', { type: 'play', base: 0, card: 32 });
  expect(r1.s.pile.map((p) => p.card)).toEqual([30, 32]);
  expect(r1.s.lives).toBe(2);
  // the higher card first: the lower tap that hadn't seen it comes right after — laid together, no mistake
  const r2 = setup({ a: [30, 80], b: [32, 90] });
  act(r2.ctx, r2.s, 'b', { type: 'play', base: 0, card: 32 });
  expect(r2.s.phase).toBe('oops');
  r2.ctx.now += MIND_SIMUL_MS - 100;
  act(r2.ctx, r2.s, 'a', { type: 'play', base: 0, card: 30 });
  expect(r2.s.phase).toBe('play');
  expect(r2.s.lives).toBe(2);
  expect(r2.s.pile.map((p) => p.card)).toEqual([30, 32]);
  expect(r2.s.shown).toEqual([]);
  expect(r2.s.stats.mistakes).toBe(0);
  // too late (or having seen the card): the mistake stands and the tap isn't counted
  const r3 = setup({ a: [30, 80], b: [32, 90] });
  act(r3.ctx, r3.s, 'b', { type: 'play', base: 0, card: 32 });
  r3.ctx.now += MIND_SIMUL_MS + 100;
  expect(() => act(r3.ctx, r3.s, 'a', { type: 'play', base: 0, card: 30 })).toThrow(GameError);
  expect(r3.s.lives).toBe(1);
  expect(r3.s.hands.a).toEqual([80]);
  const r4 = setup({ a: [30, 80], b: [32, 90] });
  act(r4.ctx, r4.s, 'b', { type: 'play', base: 0, card: 32 });
  expect(() => act(r4.ctx, r4.s, 'a', { type: 'play', base: 1, card: 30 })).toThrow(GameError);
  expect(r4.s.lives).toBe(1);
  // two of my cards were lower: only the one tapped is rescued, the mistake stays
  const r5 = setup({ a: [30, 31, 80], b: [32] });
  act(r5.ctx, r5.s, 'b', { type: 'play', base: 0, card: 32 });
  act(r5.ctx, r5.s, 'a', { type: 'play', base: 0, card: 30 });
  expect(r5.s.pile.map((p) => p.card)).toEqual([30, 32]);
  expect(r5.s.lives).toBe(1);
  expect(r5.s.phase).toBe('oops');
  // a stale tap whose card is still the lowest is played; one whose card a star took isn't swapped
  const r6 = setup({ a: [10, 60, 65], b: [20, 70, 80] });
  tap(r6.ctx, r6.s, 'a');
  act(r6.ctx, r6.s, 'b', { type: 'play', base: 0, card: 20 });
  expect(r6.s.pile.map((p) => p.card)).toEqual([10, 20]);
  act(r6.ctx, r6.s, 'a', { type: 'star' });
  act(r6.ctx, r6.s, 'b', { type: 'star' });
  expect(() => act(r6.ctx, r6.s, 'b', { type: 'play', base: 2, card: 70 })).toThrow('لم تُحسب');
  expect(r6.s.hands.b).toEqual([80]);
});

test('bot timing: proportional to the gap, the expert steadier than the easy bot; stars when far and idle', () => {
  const rnd = seeded(7);
  const spread = (lvl: BotLevel) => {
    const xs = Array.from({ length: 400 }, () => mindBotDelay(lvl, 20, rnd));
    const m = xs.reduce((t, x) => t + x, 0) / xs.length;
    return { m, sd: Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / xs.length) };
  };
  const e = spread('expert');
  const z = spread('easy');
  expect(e.m).toBeGreaterThan(20 * 400);
  expect(e.m).toBeLessThan(20 * 700);
  expect(e.sd).toBeLessThan(z.sd / 2);
  expect(mindBotDelay('expert', 2, rnd)).toBeLessThan(mindBotDelay('expert', 30, rnd));
  expect(mindBotAgrees(40, 0)).toBe(true);
  expect(mindBotAgrees(12, 1000)).toBe(false);
  expect(mindBotAgrees(12, 6000)).toBe(true);
  expect(mindBotAgrees(2, 20_000)).toBe(false);
  expect(mindBotAgrees(null, 0)).toBe(true);
});

/** A game of bots to the end (or `stopAt` levels); returns the state and the levels cleared without a mistake. */
function runBots(players: string[], level: BotLevel, seed: number, stopAt = 99) {
  const ctx = fakeCtx(players, level);
  const s = startMind(ctx, players, settings(), seeded(seed));
  const clean: number[] = [];
  let mistakesAt = 0;
  for (let step = 0; step < 20_000 && s.phase !== 'final' && s.level <= stopAt; step++) {
    mind.botPlan!(ctx, s, players);
    ctx.jobs.sort((x, y) => x.at - y.at);
    const job = ctx.jobs.shift();
    const wake = s.phase === 'oops' || s.phase === 'cleared' ? s.endsAt! : s.proposal ? s.proposal.endsAt : Infinity;
    if (!job || job.at > wake) {
      if (job) ctx.jobs.unshift(job);
      if (wake === Infinity) throw new Error(`stuck in ${s.phase}`);
      ctx.now = Math.max(ctx.now, wake);
      const lvl = s.level;
      const before = s.phase;
      mind.tick!(ctx, s);
      if (before === 'cleared' && s.level !== lvl && s.stats.mistakes === mistakesAt) clean.push(lvl);
      if (before === 'cleared') mistakesAt = s.stats.mistakes;
      continue;
    }
    ctx.now = Math.max(ctx.now, job.at);
    try {
      mind.act(ctx, s, job.by, job.a as never);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
    }
  }
  return { s, clean };
}

test('bots: they always finish, and clear the easy levels with a good success rate', () => {
  let cleanFirst = 0;
  let reached = 0;
  const runs = 30;
  for (let seed = 1; seed <= runs; seed++) {
    const { s, clean } = runBots(['x', 'y', 'z'], 'expert', seed);
    expect(s.phase).toBe('final');
    expect(mind.result!(s)!.coop).toBeDefined();
    if (clean.includes(1) && clean.includes(2)) cleanFirst++;
    if (s.won || s.level >= 4) reached++;
  }
  expect(cleanFirst).toBeGreaterThanOrEqual(runs * 0.7);
  expect(reached).toBeGreaterThanOrEqual(runs * 0.8);
  // easy bots: noisier, still mostly through level 2
  let easyReached = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const { s } = runBots(['x', 'y'], 'easy', seed + 100);
    expect(s.phase).toBe('final');
    if (s.won || s.level >= 3) easyReached++;
  }
  expect(easyReached).toBeGreaterThanOrEqual(runs * 0.6);
});

test('bots plan again when the pile changes, never play during a star proposal, and vote on it', () => {
  const ctx = fakeCtx(['b']);
  const { s } = setup({ a: [10, 95], b: [50, 99] }, ctx);
  mind.botPlan!(ctx, s, ['b']);
  const plays = () => ctx.jobs.filter((j) => j.a.type === 'play');
  expect(plays()).toHaveLength(1);
  const first = plays()[0];
  expect(first.a).toMatchObject({ type: 'play', card: 50, base: 0 });
  tap(ctx, s, 'a');
  // the old plan is stale now
  mind.act(ctx, s, 'b', first.a as never);
  expect(s.pile).toHaveLength(1);
  mind.botPlan!(ctx, s, ['b']);
  expect(plays()).toHaveLength(2);
  // a star proposal: the bot (far from the pile) agrees; its pending play doesn't go through
  act(ctx, s, 'a', { type: 'star' });
  const pending = plays()[1];
  mind.act(ctx, s, 'b', pending.a as never);
  expect(s.pile).toHaveLength(1);
  mind.botPlan!(ctx, s, ['b']);
  const vote = ctx.jobs[ctx.jobs.length - 1];
  expect(vote.a).toMatchObject({ type: 'star', on: true });
  mind.act(ctx, s, 'b', vote.a as never);
  expect(s.shown.map((x) => x.card)).toEqual([95, 50]);
  // the bot readies itself in the focus moment
  const c2 = fakeCtx(['b']);
  const s2 = startMind(c2, ['a', 'b'], settings(), seeded(3));
  mind.botPlan!(c2, s2, ['b']);
  expect(c2.jobs[0].a).toMatchObject({ type: 'ready' });
});

test('the view: my cards only, counts for the others', () => {
  const { s, ctx } = setup({ a: [77, 88], b: [12] });
  const v = view(ctx, s, 'b');
  expect(v.hand).toEqual([12]);
  expect(v.counts).toEqual({ a: 2, b: 1 });
  const json = JSON.stringify(v);
  expect(json).not.toContain('77');
  expect(json).not.toContain('88');
  expect(json).not.toContain('hands');
  expect(view(ctx, s, 'spectator').hand).toEqual([]);
});

test('leaving mid-level: the cards go with the player, the team carries on; one player left ends it', () => {
  const { s, ctx } = setup({ a: [10], b: [20], c: [30, 40] });
  tap(ctx, s, 'a');
  tap(ctx, s, 'b');
  act(ctx, s, 'b', { type: 'star' });
  mind.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('cleared');
  // a proposal waiting only for the one who left goes through
  const r = setup({ a: [10, 50], b: [20, 60], c: [30, 70] });
  act(r.ctx, r.s, 'a', { type: 'star' });
  act(r.ctx, r.s, 'b', { type: 'star' });
  mind.onLeave!(r.ctx, r.s, 'c');
  expect(r.s.stars).toBe(0);
  expect(r.s.hands).toEqual({ a: [50], b: [60] });
  // in the focus moment, the one missing leaves: the level starts
  const ctx2 = fakeCtx();
  const s2 = startMind(ctx2, ['a', 'b', 'c'], settings(), seeded(2));
  act(ctx2, s2, 'a', { type: 'ready' });
  act(ctx2, s2, 'b', { type: 'ready' });
  mind.onLeave!(ctx2, s2, 'c');
  expect(s2.phase).toBe('play');
  mind.onLeave!(ctx2, s2, 'b');
  expect(s2.phase).toBe('final');
  expect(mind.result!(s2)).toBeNull();
});

test('settings are sanitised and patched', () => {
  expect(sanitizeMind({ start: 4, extra: 'yes' as never })).toEqual({ start: 1, extra: false });
  expect(sanitizeMind({ start: 5, extra: true })).toEqual({ start: 5, extra: true });
  const st = { ...MIND_DEFAULTS };
  mind.patchSettings!(st, { start: 3, extra: true });
  expect(st).toEqual({ start: 3, extra: true });
  mind.patchSettings!(st, { start: 7, extra: 1 });
  expect(st).toEqual({ start: 3, extra: true });
  expect(DEFAULT_SETTINGS.mind).toEqual(MIND_DEFAULTS);
});
