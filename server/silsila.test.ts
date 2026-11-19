/**
 * «سلسلة الذاكرة» — settings, the chain growing by one pad a round, the playback timing, taps checked
 * against the chain (right, wrong, early, stale, repeated), the tap timeout, lives, the round's end, the last
 * player standing, falling together (furthest then fastest), solo and the room's best, no leak of the chain
 * beyond its length or of the other players' taps, leaving, bots (levels, rhythm, they finish games).
 */
import { expect, test } from 'bun:test';

import { SILSILA_DEFAULTS, SILSILA_FIRST_LEAD_MS, SILSILA_LEAD_MS, SILSILA_TAP_MS, silsilaStepMs, type SilsilaSettings, type SilsilaView } from '../src/shared/games/silsila';
import { DEFAULT_SETTINGS, type BotLevel } from '../src/shared/protocol';
import { SILSILA_CLEAN_MS, SILSILA_FALLEN_MS, sanitizeSilsila, silsila, startSilsila, type SilsilaState } from './games/silsila';
import { SILSILA_BOT_SPAN, botPad, botTapDelay, chainOk, stepError } from './silsila-bots';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Ctx = GameCtx & { now: number; jobs: Job[]; said: string[]; fxs: string[] };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert', memo = new Map<string, unknown>()): Ctx {
  const keys = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: (k, t) => ctx.fxs.push(`${k}:${t ?? ''}`),
    say: (text) => ctx.said.push(text),
    isConnected: () => true,
    isBot: (id) => bots.includes(id),
    playerName: (id) => `اسم-${id}`,
    botLevel: () => level,
    memo,
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      ctx.jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs: [],
    said: [],
    fxs: [],
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

const settings = (o: Partial<SilsilaSettings> = {}): SilsilaSettings => ({ ...SILSILA_DEFAULTS, ...o });
const view = (ctx: Ctx, s: SilsilaState, me: string) => silsila.view(ctx, s, me) as SilsilaView;
const tap = (ctx: Ctx, s: SilsilaState, by: string, pad: number) => silsila.act(ctx, s, by, { type: 'tap', len: s.seq.length, i: s.prog[by], pad });

/** Move the clock to the end of the playback (the input opens). */
function toInput(ctx: Ctx, s: SilsilaState) {
  ctx.now = s.inputAt;
  silsila.tick!(ctx, s);
  expect(s.phase).toBe('input');
}
/** Repeat the whole chain correctly. */
function repeat(ctx: Ctx, s: SilsilaState, by: string) {
  for (const p of s.seq) {
    ctx.now += 300;
    tap(ctx, s, by, p);
  }
}
const wrong = (s: SilsilaState, i: number) => (s.seq[i] + 1) % s.settings.pads;
/** From the round's result to the next playback. */
function nextRound(ctx: Ctx, s: SilsilaState) {
  expect(s.phase).toBe('fallen');
  ctx.now = s.endsAt!;
  silsila.tick!(ctx, s);
  expect(s.phase).toBe('watch');
}

/* ------------------------------------------------------------------ */

test('settings: 4 / 6 pads, 1 / 2 / 3 lives; patch and start validate', () => {
  expect(DEFAULT_SETTINGS.silsila).toEqual({ pads: 4, lives: 1 });
  expect(sanitizeSilsila({ pads: 5, lives: 9 } as never)).toEqual({ pads: 4, lives: 1 });
  expect(sanitizeSilsila({ pads: 6, lives: 3 })).toEqual({ pads: 6, lives: 3 });
  const st = settings();
  silsila.patchSettings!(st, { pads: 6, lives: 2 });
  expect(st).toEqual({ pads: 6, lives: 2 });
  silsila.patchSettings!(st, { pads: 8, lives: 0, rounds: 3 });
  expect(st).toEqual({ pads: 6, lives: 2 });
  silsila.patchSettings!(st, { pads: '4' });
  expect(st.pads).toBe(6);
});

test('the chain grows by one random pad a round; the playback speeds up slowly', () => {
  const ctx = fakeCtx();
  const s = startSilsila(ctx, ['a', 'b'], settings({ pads: 6 }), seeded(4));
  expect(s.phase).toBe('watch');
  expect(s.seq).toHaveLength(1);
  expect(s.playAt).toBe(ctx.now + SILSILA_FIRST_LEAD_MS);
  expect(s.inputAt).toBe(s.playAt + silsilaStepMs(1));
  const seen = new Set<number>();
  for (let r = 1; r <= 12; r++) {
    expect(s.seq).toHaveLength(r);
    for (const p of s.seq) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(6);
      seen.add(p);
    }
    const before = [...s.seq];
    toInput(ctx, s);
    repeat(ctx, s, 'a');
    repeat(ctx, s, 'b');
    nextRound(ctx, s);
    expect(s.seq.slice(0, r)).toEqual(before);
    expect(s.playAt).toBe(ctx.now + SILSILA_LEAD_MS);
    expect(s.inputAt).toBe(s.playAt + s.seq.length * silsilaStepMs(s.seq.length));
  }
  expect(seen.size).toBeGreaterThan(3);
  expect(silsilaStepMs(1)).toBe(700);
  expect(silsilaStepMs(10)).toBeLessThan(silsilaStepMs(5));
  expect(silsilaStepMs(40)).toBe(380);
});

test('taps: checked against the chain; early, stale, repeated and outside taps are refused or ignored', () => {
  const ctx = fakeCtx();
  const s = startSilsila(ctx, ['a', 'b'], settings(), seeded(2));
  s.seq = [0];
  // during the playback: refused
  expect(() => tap(ctx, s, 'a', 0)).toThrow(GameError);
  // just before its end by the server's clock (the phone's clock is a bit off): counts
  ctx.now = s.inputAt - 300;
  tap(ctx, s, 'a', 0);
  expect(s.phase).toBe('input');
  expect(s.st.a).toBe('done');
  expect(s.best.a).toBe(1);
  // done: more taps are ignored
  tap(ctx, s, 'a', 3);
  expect(s.lives.a).toBe(1);
  // a tap for the wrong step or the round before is dropped
  silsila.act(ctx, s, 'b', { type: 'tap', len: 1, i: 1, pad: 2 });
  silsila.act(ctx, s, 'b', { type: 'tap', len: 7, i: 0, pad: 2 });
  silsila.act(ctx, s, 'b', { type: 'tap', len: 1, i: 0, pad: 9 });
  silsila.act(ctx, s, 'zz', { type: 'tap', len: 1, i: 0, pad: 0 });
  expect(s.st.b).toBe('play');
  expect(s.prog.b).toBe(0);
  // the wrong pad: a life, out at 0, the round ends
  tap(ctx, s, 'b', 1);
  expect(s.st.b).toBe('out');
  expect(s.lives.b).toBe(0);
  expect(s.phase).toBe('final');
  expect(ctx.fxs).toContain('buzz:b');
  expect(ctx.fxs).toContain('correct:a');
});

test('the tap timeout: after the playback, then since the last tap', () => {
  const ctx = fakeCtx();
  const s = startSilsila(ctx, ['a', 'b', 'c'], settings({ lives: 2 }), seeded(3));
  toInput(ctx, s);
  for (const p of ['a', 'b', 'c']) repeat(ctx, s, p);
  nextRound(ctx, s);
  toInput(ctx, s);
  // b taps the first pad at once, then nothing; c never taps
  ctx.now += 100;
  tap(ctx, s, 'b', s.seq[0]);
  const bLast = ctx.now;
  repeat(ctx, s, 'a');
  ctx.now = bLast;
  ctx.now = s.inputAt + SILSILA_TAP_MS;
  silsila.tick!(ctx, s);
  expect(s.st.c).toBe('play'); // the network's grace
  expect(view(ctx, s, 'b').me!.deadline).toBe(bLast + SILSILA_TAP_MS);
  ctx.now = s.inputAt + SILSILA_TAP_MS + 450;
  silsila.tick!(ctx, s);
  expect(s.st.c).toBe('fail');
  expect(s.lives.c).toBe(1);
  expect(s.st.b).toBe('play');
  expect(view(ctx, s, 'c').me!.miss).toEqual({ want: s.seq[0], got: null });
  ctx.now = bLast + SILSILA_TAP_MS + 1000;
  silsila.tick!(ctx, s);
  expect(s.st.b).toBe('fail');
  expect(s.phase).toBe('fallen');
  expect(s.fallen.map((f) => [f.id, f.how, f.out])).toEqual([
    ['c', 'time', false],
    ['b', 'time', false],
  ]);
  expect(s.endsAt).toBe(ctx.now + SILSILA_FALLEN_MS);
  expect(ctx.said.at(-1)).toContain('قلب أقل');
});

test('lives: a mistake costs one; the player plays on in the next round until none are left', () => {
  const ctx = fakeCtx();
  const s = startSilsila(ctx, ['a', 'b'], settings({ lives: 2 }), seeded(5));
  toInput(ctx, s);
  repeat(ctx, s, 'a');
  tap(ctx, s, 'b', wrong(s, 0));
  expect(s.lives.b).toBe(1);
  expect(s.st.b).toBe('fail');
  nextRound(ctx, s);
  expect(s.st.b).toBe('play');
  expect(s.prog.b).toBe(0);
  toInput(ctx, s);
  repeat(ctx, s, 'b');
  repeat(ctx, s, 'a');
  expect(s.best.b).toBe(2);
  nextRound(ctx, s);
  toInput(ctx, s);
  repeat(ctx, s, 'a');
  ctx.now += 200;
  tap(ctx, s, 'b', s.seq[0]);
  tap(ctx, s, 'b', wrong(s, 1));
  expect(s.st.b).toBe('out');
  // the last player standing wins
  expect(s.phase).toBe('final');
  expect(silsila.result!(s)).toEqual({ places: [['a'], ['b']] });
  expect(s.final!.longest).toBe(3);
  expect(s.final!.longestBy).toEqual(['a']);
  expect(s.final!.outRound).toEqual({ b: 3 });
  expect(ctx.fxs.at(-1)).toBe('win:a');
});

test('the round waits for everyone still in; players out earlier sit it out', () => {
  const ctx = fakeCtx();
  const s = startSilsila(ctx, ['a', 'b', 'c'], settings(), seeded(6));
  toInput(ctx, s);
  tap(ctx, s, 'c', wrong(s, 0));
  repeat(ctx, s, 'a');
  expect(s.phase).toBe('input');
  repeat(ctx, s, 'b');
  expect(s.phase).toBe('fallen');
  expect(view(ctx, s, 'a').fallen).toEqual([{ id: 'c', out: true, how: 'wrong' }]);
  expect(ctx.said.at(-1)).toContain('خارج اللعبة: اسم-c');
  nextRound(ctx, s);
  expect(s.st.c).toBe('out');
  toInput(ctx, s);
  repeat(ctx, s, 'a');
  repeat(ctx, s, 'b');
  expect(s.phase).toBe('fallen');
  expect(s.endsAt).toBe(ctx.now + SILSILA_CLEAN_MS);
  expect(ctx.said.at(-1)).toContain('كاملة من الجميع');
});

test('falling together: ranked by how far they got in the round, then by speed; equal = a shared place', () => {
  const ctx = fakeCtx();
  const s = startSilsila(ctx, ['a', 'b', 'c', 'd', 'e'], settings(), seeded(7));
  for (let r = 0; r < 3; r++) {
    toInput(ctx, s);
    for (const p of ['a', 'b', 'c', 'd']) repeat(ctx, s, p);
    if (r === 0) tap(ctx, s, 'e', wrong(s, 0));
    nextRound(ctx, s);
  }
  // round 4: everyone left fails — c gets 3 steps, a and b 2 (b faster), d none
  toInput(ctx, s);
  ctx.now += 100;
  tap(ctx, s, 'b', s.seq[0]);
  tap(ctx, s, 'c', s.seq[0]);
  ctx.now += 100;
  tap(ctx, s, 'b', s.seq[1]);
  tap(ctx, s, 'c', s.seq[1]);
  ctx.now += 400;
  tap(ctx, s, 'a', s.seq[0]);
  tap(ctx, s, 'a', s.seq[1]);
  tap(ctx, s, 'c', s.seq[2]);
  tap(ctx, s, 'd', wrong(s, 0));
  tap(ctx, s, 'a', wrong(s, 2));
  tap(ctx, s, 'b', wrong(s, 2));
  tap(ctx, s, 'c', wrong(s, 3));
  expect(s.phase).toBe('final');
  expect(s.final!.together).toBe(true);
  expect(silsila.result!(s)!.places).toEqual([['c'], ['b'], ['a'], ['d'], ['e']]);
  expect(ctx.said.at(-1)).toContain('الفوز من نصيب اسم-c');
  // the same progress at the same time: a shared place
  const t = startSilsila(fakeCtx(), ['x', 'y'], settings(), seeded(1));
  const c2 = fakeCtx();
  toInput(c2, t);
  tap(c2, t, 'x', wrong(t, 0));
  tap(c2, t, 'y', wrong(t, 0));
  expect(silsila.result!(t)!.places).toEqual([['x', 'y']]);
  expect(c2.said.at(-1)).toContain('تعادل');
});

test('solo: until the lives run out; the score is the longest chain; the room keeps its best per pad count', () => {
  const memo = new Map<string, unknown>();
  const ctx = fakeCtx([], 'expert', memo);
  const s = startSilsila(ctx, ['a'], settings({ lives: 2 }), seeded(8));
  expect(s.solo).toBe(true);
  for (let r = 0; r < 4; r++) {
    toInput(ctx, s);
    repeat(ctx, s, 'a');
    expect(s.phase).toBe('fallen');
    nextRound(ctx, s);
  }
  toInput(ctx, s);
  tap(ctx, s, 'a', wrong(s, 0));
  expect(s.phase).toBe('fallen'); // one life left: go on
  nextRound(ctx, s);
  toInput(ctx, s);
  ctx.now += SILSILA_TAP_MS + 1000;
  silsila.tick!(ctx, s);
  expect(s.phase).toBe('final');
  expect(s.final).toMatchObject({ longest: 4, record: true, roomBest: 4, roomBestBy: ['اسم-a'], together: false });
  expect(silsila.result!(s)).toEqual({ places: [['a']] });
  expect(ctx.said.at(-1)).toContain('رقم جديد');
  // the next game in the room starts from that best; a shorter one is no record
  const c2 = fakeCtx([], 'expert', memo);
  const s2 = startSilsila(c2, ['a'], settings(), seeded(9));
  expect(view(c2, s2, 'a').roomBest).toBe(4);
  toInput(c2, s2);
  repeat(c2, s2, 'a');
  nextRound(c2, s2);
  toInput(c2, s2);
  tap(c2, s2, 'a', wrong(s2, 0));
  expect(s2.final).toMatchObject({ longest: 1, record: false, roomBest: 4 });
  // another pad count keeps its own best
  const s3 = startSilsila(fakeCtx([], 'expert', memo), ['a'], settings({ pads: 6 }), seeded(9));
  expect(s3.roomBest.len).toBe(0);
});

test('the view: the chain only up to its length, my own round only, the others as states', () => {
  const ctx = fakeCtx();
  const s = startSilsila(ctx, ['a', 'b', 'c'], settings({ lives: 3 }), seeded(10));
  s.seq = [0, 1, 2];
  const real = [0, 1, 2];
  toInput(ctx, s);
  ctx.now += 100;
  tap(ctx, s, 'a', real[0]);
  tap(ctx, s, 'b', real[0]);
  tap(ctx, s, 'b', real[1]);
  tap(ctx, s, 'c', 3);
  const va = view(ctx, s, 'a');
  expect(va.seq).toEqual(real);
  expect(va.len).toBe(3);
  expect(va.me).toMatchObject({ prog: 1, lives: 3, state: 'play', miss: null });
  expect(va.rows.map((r) => [r.id, r.state, r.lives])).toEqual([
    ['a', 'play', 3],
    ['b', 'play', 3],
    ['c', 'fail', 2],
  ]);
  const json = JSON.stringify(va);
  // nothing about another player's taps or progress
  expect(json).not.toContain('"prog":2');
  expect(json).not.toContain('reach');
  expect(json).not.toContain('"got":3');
  expect(view(ctx, s, 'c').me!.miss).toEqual({ want: 0, got: 3 });
  expect(view(ctx, s, 'b').me!.prog).toBe(2);
  // a spectator gets no round of their own
  expect(view(ctx, s, 'watcher').me).toBeNull();
});

test('leaving: the round goes on without them; one player left in a group game wins', () => {
  const ctx = fakeCtx();
  const s = startSilsila(ctx, ['a', 'b', 'c'], settings(), seeded(11));
  toInput(ctx, s);
  repeat(ctx, s, 'a');
  repeat(ctx, s, 'b');
  silsila.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('fallen');
  expect(s.participants).toEqual(['a', 'b']);
  nextRound(ctx, s);
  silsila.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('final');
  expect(silsila.result!(s)).toEqual({ places: [['a']] });
  const t = startSilsila(fakeCtx(), ['solo'], settings(), seeded(1));
  silsila.onLeave!(fakeCtx(), t, 'solo');
  expect(t.phase).toBe('final');
  expect(silsila.result!(t)).toBeNull();
});

test('bots: the error chance grows with the length and depends on the level; a human rhythm', () => {
  for (const level of ['easy', 'smart', 'expert'] as BotLevel[]) {
    const [lo, hi] = SILSILA_BOT_SPAN[level];
    const span = (lo + hi) / 2;
    expect(chainOk(lo - 3, span)).toBeGreaterThan(0.9);
    expect(chainOk(hi + 3, span)).toBeLessThan(0.1);
    expect(stepError(hi, span)).toBeGreaterThan(stepError(lo, span));
  }
  expect(SILSILA_BOT_SPAN).toEqual({ easy: [5, 8], smart: [9, 13], expert: [14, 20] });
  const rnd = seeded(12);
  for (let k = 0; k < 200; k++) {
    const seq = [0, 1, 2, 3, 1, 0, 2, 3, 3, 1, 0, 2, 1, 0, 3, 2, 1, 0, 2, 3, 1, 2, 0, 3, 3];
    const p = botPad(seq, k % seq.length, 4, 2, rnd);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(4);
    const d0 = botTapDelay(0, rnd);
    const d = botTapDelay(3, rnd);
    expect(d0).toBeGreaterThanOrEqual(450);
    expect(d0).toBeLessThanOrEqual(1100);
    expect(d).toBeGreaterThanOrEqual(300);
    expect(d).toBeLessThanOrEqual(700);
  }
});

/** A whole game run by bots, with the clock jumping to the next bot move or timer. */
function botGame(level: BotLevel, players: string[], seed: number, o: Partial<SilsilaSettings> = {}) {
  const ctx = fakeCtx(players, level);
  const s = startSilsila(ctx, players, settings(o), seeded(seed));
  for (let guard = 0; guard < 20000 && s.phase !== 'final'; guard++) {
    silsila.botPlan!(ctx, s, players);
    ctx.jobs.sort((x, y) => x.at - y.at);
    const job = ctx.jobs[0];
    const timer = s.phase === 'watch' ? s.inputAt : s.phase === 'fallen' ? s.endsAt! : Math.min(...players.filter((p) => s.st[p] === 'play').map((p) => s.last[p] + SILSILA_TAP_MS + 401));
    if (job && job.at <= timer) {
      ctx.jobs.shift();
      ctx.now = Math.max(ctx.now, job.at);
      silsila.act(ctx, s, job.by, job.a as never);
    } else {
      ctx.now = Math.max(ctx.now, timer);
      silsila.tick!(ctx, s);
    }
  }
  return { s, ctx };
}

test('bots: games end; each level falls around its span; no timeouts at a human rhythm', () => {
  const reach: Record<BotLevel, number[]> = { easy: [], smart: [], expert: [] };
  for (const level of ['easy', 'smart', 'expert'] as BotLevel[]) {
    for (let g = 0; g < 30; g++) {
      const { s } = botGame(level, ['b1'], 100 + g);
      expect(s.phase).toBe('final');
      expect(s.fallen.every((f) => f.how === 'wrong')).toBe(true);
      reach[level].push(s.final!.longest);
    }
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  expect(avg(reach.easy)).toBeGreaterThan(3.5);
  expect(avg(reach.easy)).toBeLessThan(8.5);
  expect(avg(reach.smart)).toBeGreaterThan(7.5);
  expect(avg(reach.smart)).toBeLessThan(13);
  expect(avg(reach.expert)).toBeGreaterThan(12.5);
  expect(avg(reach.expert)).toBeLessThan(20.5);
  // a group game: a winner, everyone ranked once
  const { s } = botGame('smart', ['b1', 'b2', 'b3', 'b4'], 7, { lives: 2, pads: 6 });
  const places = silsila.result!(s)!.places;
  expect(places.flat().sort()).toEqual(['b1', 'b2', 'b3', 'b4']);
});

test('bots plan only once the input is open, one tap at a time', () => {
  const ctx = fakeCtx(['b1']);
  const s = startSilsila(ctx, ['b1', 'h'], settings(), seeded(13));
  silsila.botPlan!(ctx, s, ['b1']);
  expect(ctx.jobs).toHaveLength(0);
  toInput(ctx, s);
  silsila.botPlan!(ctx, s, ['b1']);
  silsila.botPlan!(ctx, s, ['b1']);
  expect(ctx.jobs).toHaveLength(1);
  expect(ctx.jobs[0].a).toMatchObject({ type: 'tap', len: 1, i: 0 });
  expect(ctx.jobs[0].at - ctx.now).toBeGreaterThanOrEqual(450);
});
