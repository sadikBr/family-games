/** «خمّن من؟» — the characters' attributes, truthful answers, auto-flip, guessing, the turn flow, hidden secrets, bots. */
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import {
  GUESSWHO_DEFAULTS,
  GW_CHARS,
  GW_N,
  GW_QUESTIONS,
  gwAnswer,
  gwConsistent,
  type GuesswhoSettings,
  type GuesswhoView,
  type GwQuestionId,
} from '../src/shared/games/guesswho';
import type { BotLevel } from '../src/shared/protocol';
import { gwBotMove, gwCandidates, gwSplit, gwWinChance } from './ai/guesswho-bot';
import { GW_ANSWER_MS, GW_MANUAL_MS, GW_REVEAL_MS, guesswho, sanitizeGuesswho, startGuesswho, type GuesswhoState } from './games/guesswho';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Said = { text: string; by?: string; voice?: string };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert') {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fxs: [string, string | undefined][] = [];
  const said: Said[] = [];
  const ctx: GameCtx & { jobs: Job[]; fxs: typeof fxs; said: Said[] } = {
    now: 1_000_000,
    fx: (k, t) => fxs.push([k, t]),
    say: (text, by, voice) => said.push({ text, by, voice }),
    isConnected: () => true,
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs,
    fxs,
    said,
  };
  return ctx;
}

/** A small seeded random (mulberry32), so a test can be replayed. */
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

const view = (ctx: GameCtx, s: GuesswhoState, me: string) => guesswho.view(ctx, s, me) as GuesswhoView;
const turn = (s: GuesswhoState) => s.players[s.turnIdx];
const other = (s: GuesswhoState, id: string) => (s.players[0] === id ? s.players[1] : s.players[0]);
const settings = (p: Partial<GuesswhoSettings> = {}): GuesswhoSettings => ({ ...GUESSWHO_DEFAULTS, ...p });
/** Let the answer's pause run out. */
const passPause = (ctx: GameCtx, s: GuesswhoState) => {
  if (s.pauseUntil === null) return;
  ctx.now = s.pauseUntil;
  guesswho.tick!(ctx, s);
};
const ask = (ctx: GameCtx, s: GuesswhoState, by: string, q: GwQuestionId) => guesswho.act(ctx, s, by, { type: 'ask', q });
const guess = (ctx: GameCtx, s: GuesswhoState, by: string, char: number) => guesswho.act(ctx, s, by, { type: 'guess', char });

/* ------------------------------------------------------------------ */
/* The characters                                                      */
/* ------------------------------------------------------------------ */

test('24 characters with unique ids and short Arabic names', () => {
  expect(GW_N).toBe(24);
  expect(new Set(GW_CHARS.map((c) => c.id)).size).toBe(24);
  expect(new Set(GW_CHARS.map((c) => c.name)).size).toBe(24);
  for (const c of GW_CHARS) {
    expect(c.name).toMatch(/^[ء-ي ]{2,9}$/);
    expect(c.id).toMatch(/^[a-z]+$/);
  }
});

test('every question is useful: true for 25–50% of the characters', () => {
  for (const q of GW_QUESTIONS) {
    const n = GW_CHARS.filter(q.test).length;
    expect([q.id, n >= 6 && n <= 12]).toEqual([q.id, true]);
  }
  expect(GW_QUESTIONS.length).toBeGreaterThanOrEqual(15);
  expect(new Set(GW_QUESTIONS.map((q) => q.id)).size).toBe(GW_QUESTIONS.length);
  expect(new Set(GW_QUESTIONS.map((q) => q.short)).size).toBe(GW_QUESTIONS.length);
  for (const q of GW_QUESTIONS) expect(q.text.endsWith('؟')).toBe(true);
});

test('every character can be told apart by the questions (no two answer everything alike)', () => {
  const keys = GW_CHARS.map((c) => GW_QUESTIONS.map((q) => (q.test(c) ? 1 : 0)).join(''));
  expect(new Set(keys).size).toBe(GW_N);
});

test('the attributes agree with what a picture can show', () => {
  for (const c of GW_CHARS) {
    // a hijab or a turban hides the hair: no colour, not long
    if (c.hijab || c.hat === 'turban') expect([c.id, c.hair, c.style]).toEqual([c.id, 'hidden', 'none']);
    if (c.hair === 'hidden') expect([c.id, c.hijab || c.hat === 'turban']).toEqual([c.id, true]);
    // a hijab hides the ears: no earrings shown; hijab and a hat never together
    if (c.hijab) expect([c.id, c.earrings, c.hat]).toEqual([c.id, false, 'none']);
    if (c.hijab || c.earrings) expect([c.id, c.female]).toEqual([c.id, true]);
    // beards and moustaches on grown men only
    if (c.beard || c.moustache) expect([c.id, c.female, c.age !== 'child']).toEqual([c.id, false, true]);
  }
  // a varied family: every age, both sexes, every skin tone
  expect(new Set(GW_CHARS.map((c) => c.skin)).size).toBe(4);
  for (const age of ['child', 'adult', 'elder'] as const) expect(GW_CHARS.filter((c) => c.age === age).length).toBeGreaterThanOrEqual(6);
});

test('every character has its portrait, drawn by the art pipeline from the same table', () => {
  for (const c of GW_CHARS) expect([c.id, existsSync(new URL(`../assets/art/guesswho/${c.id}.webp`, import.meta.url))]).toEqual([c.id, true]);
  const build = readFileSync(new URL('../tools/art/build.mjs', import.meta.url), 'utf8');
  const list = build.match(/const GUESSWHO = \[([^\]]+)\]/)![1].match(/'([a-z]+)'/g)!.map((x) => x.slice(1, -1));
  expect(list).toEqual(GW_CHARS.map((c) => c.id));
  const art = readFileSync(new URL('../tools/art/guesswho.mjs', import.meta.url), 'utf8');
  expect(art).toContain("from '../../src/shared/games/guesswho-chars.ts'");
  const app = readFileSync(new URL('../src/games/guesswho-art.ts', import.meta.url), 'utf8');
  for (const c of GW_CHARS) expect(app).toContain(`${c.id}: require('../../assets/art/guesswho/${c.id}.webp')`);
});

/* ------------------------------------------------------------------ */
/* Answers and flips                                                   */
/* ------------------------------------------------------------------ */

test('answers are the truth about the other player\'s secret character', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const ctx = fakeCtx();
    const s = startGuesswho(ctx, ['a', 'b'], settings(), seeded(seed));
    for (const q of GW_QUESTIONS) {
      const by = turn(s);
      ask(ctx, s, by, q.id);
      const e = s.log[s.log.length - 1];
      expect(e).toMatchObject({ kind: 'ask', by, q: q.id, yes: q.test(GW_CHARS[s.secrets[other(s, by)]]) });
      passPause(ctx, s);
    }
  }
});

test('auto-flip drops exactly the characters that don\'t match, never the secret', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const ctx = fakeCtx();
    const s = startGuesswho(ctx, ['a', 'b'], settings({ autoFlip: true }), seeded(seed));
    const qs = GW_QUESTIONS.map((q) => q.id);
    for (let k = 0; k < 8; k++) {
      const by = turn(s);
      ask(ctx, s, by, qs[(seed + k * 5) % qs.length]);
      // (a repeated question is refused; skip it)
      const target = s.secrets[other(s, by)];
      for (let c = 0; c < GW_N; c++) expect(s.down[by][c]).toBe(!gwConsistent(c, s.log, by));
      expect(s.down[by][target]).toBe(false);
      passPause(ctx, s);
      if (s.log.filter((e) => e.by === by).length >= 3) break;
    }
  }
});

test('without auto-flip nothing goes down by itself; «أسقِط من لا يطابق» does it; flips are free', () => {
  const ctx = fakeCtx();
  const s = startGuesswho(ctx, ['a', 'b'], settings({ autoFlip: false }), seeded(7));
  const by = turn(s);
  ask(ctx, s, by, 'female');
  expect(s.down[by].some(Boolean)).toBe(false);
  // the asker flips by hand while the turn waits for «إنهاء الدور»
  expect(s.manual).toBe(true);
  expect(guesswho.turnOf!(s)).toEqual([by]);
  guesswho.act(ctx, s, by, { type: 'flip', char: 3 });
  expect(s.down[by][3]).toBe(true);
  guesswho.act(ctx, s, by, { type: 'flip', char: 3, down: false });
  expect(s.down[by][3]).toBe(false);
  guesswho.act(ctx, s, by, { type: 'dropAll' });
  for (let c = 0; c < GW_N; c++) expect(s.down[by][c]).toBe(gwAnswer('female', c) !== (s.log[0] as { yes: boolean }).yes);
  // nonsense is ignored
  guesswho.act(ctx, s, by, { type: 'flip', char: 99 });
  guesswho.act(ctx, s, by, { type: 'flip', char: -1 });
  expect(s.down[by].length).toBe(GW_N);
  // the other board is untouched
  expect(s.down[other(s, by)].some(Boolean)).toBe(false);
  guesswho.act(ctx, s, by, { type: 'done' });
  expect(turn(s)).toBe(other(s, by));
  // the manual pause also ends by itself
  const by2 = turn(s);
  ask(ctx, s, by2, 'child');
  expect(s.pauseTotal).toBe(GW_MANUAL_MS);
  ctx.now += GW_MANUAL_MS;
  guesswho.tick!(ctx, s);
  expect(turn(s)).toBe(by);
});

test('bots (and the autopilot) always flip automatically', () => {
  const ctx = fakeCtx(['a', 'b']);
  const s = startGuesswho(ctx, ['a', 'b'], settings({ autoFlip: false }), seeded(3));
  const by = turn(s);
  ask(ctx, s, by, 'glasses');
  for (let c = 0; c < GW_N; c++) expect(s.down[by][c]).toBe(!gwConsistent(c, s.log, by));
  expect(s.manual).toBe(false);
});

/* ------------------------------------------------------------------ */
/* Turns and guesses                                                   */
/* ------------------------------------------------------------------ */

test('turn flow: one question per turn, the answer shows, then the turn passes', () => {
  const ctx = fakeCtx();
  const s = startGuesswho(ctx, ['a', 'b'], settings(), seeded(11));
  const first = turn(s);
  const second = other(s, first);
  expect(() => ask(ctx, s, second, 'female')).toThrow(GameError);
  expect(() => guess(ctx, s, second, 0)).toThrow(GameError);
  ask(ctx, s, first, 'female');
  expect(s.pauseUntil).toBe(ctx.now + GW_ANSWER_MS);
  expect(guesswho.turnOf!(s)).toEqual([]);
  // a second action in the same turn is ignored
  ask(ctx, s, first, 'child');
  guess(ctx, s, first, 0);
  expect(s.log.length).toBe(1);
  expect(s.phase).toBe('play');
  ctx.now += GW_ANSWER_MS - 1;
  guesswho.tick!(ctx, s);
  expect(turn(s)).toBe(first);
  ctx.now += 1;
  expect(guesswho.tick!(ctx, s)).toBe(true);
  expect(turn(s)).toBe(second);
  expect(guesswho.turnOf!(s)).toEqual([second]);
  // «done» skips the rest of the pause
  ask(ctx, s, second, 'female');
  guesswho.act(ctx, s, second, { type: 'done' });
  expect(turn(s)).toBe(first);
  // the same question twice is refused; an unknown one ignored
  expect(() => ask(ctx, s, first, 'female')).toThrow(GameError);
  ask(ctx, s, first, 'nope' as GwQuestionId);
  expect(s.log.length).toBe(2);
  // a spectator can't play
  ask(ctx, s, 'zz', 'child');
  guesswho.act(ctx, s, 'zz', { type: 'flip', char: 1 });
  expect(s.log.length).toBe(2);
});

test('a right guess wins the round; the first asker alternates; best of 3', () => {
  const ctx = fakeCtx();
  const s = startGuesswho(ctx, ['a', 'b'], settings({ bestOf: 3 }), seeded(5));
  const p0 = s.players[0];
  expect(turn(s)).toBe(p0);
  guess(ctx, s, p0, s.secrets[other(s, p0)]);
  expect(s.phase).toBe('reveal');
  expect(s.roundWinner).toBe(p0);
  expect(s.how).toBe('guess');
  expect(s.wins[p0]).toBe(1);
  expect(guesswho.result!(s)).toBeNull();
  ctx.now += GW_REVEAL_MS;
  guesswho.tick!(ctx, s);
  expect(s.phase).toBe('play');
  expect(s.round).toBe(2);
  expect(s.log).toEqual([]);
  expect(s.down[p0].some(Boolean)).toBe(false);
  // round 2: the other player asks first
  const p1 = s.players[1];
  expect(turn(s)).toBe(p1);
  guess(ctx, s, p1, s.secrets[p0]);
  expect(s.wins).toEqual({ [p0]: 1, [p1]: 1 });
  // the host can skip the wait
  guesswho.act(ctx, s, p0, { type: 'next' });
  expect(s.round).toBe(3);
  expect(turn(s)).toBe(p0);
  guess(ctx, s, p0, s.secrets[p1]);
  expect(s.phase).toBe('final');
  expect(s.winner).toBe(p0);
  expect(guesswho.result!(s)).toEqual({ places: [[p0], [p1]] });
  expect(ctx.fxs.filter(([k]) => k === 'win')).toEqual([['win', p0]]);
});

test('a wrong guess loses the round (setting «يخسر الجولة»)', () => {
  const ctx = fakeCtx();
  const s = startGuesswho(ctx, ['a', 'b'], settings({ bestOf: 1, wrongLoses: true }), seeded(9));
  const by = turn(s);
  const wrong = (s.secrets[other(s, by)] + 1) % GW_N;
  guess(ctx, s, by, wrong);
  expect(s.phase).toBe('final');
  expect(s.winner).toBe(other(s, by));
  expect(s.how).toBe('wrong');
});

test('a wrong guess only costs the turn (setting «يضيّع الدور فقط»)', () => {
  const ctx = fakeCtx();
  const s = startGuesswho(ctx, ['a', 'b'], settings({ bestOf: 1, wrongLoses: false }), seeded(9));
  const by = turn(s);
  const wrong = (s.secrets[other(s, by)] + 1) % GW_N;
  guess(ctx, s, by, wrong);
  expect(s.phase).toBe('play');
  expect(s.down[by][wrong]).toBe(true);
  expect(s.log[0]).toMatchObject({ kind: 'guess', by, char: wrong, right: false });
  expect(gwConsistent(wrong, s.log, by)).toBe(false);
  passPause(ctx, s);
  expect(turn(s)).toBe(other(s, by));
});

test('resigning or leaving ends the match for the other player', () => {
  const ctx = fakeCtx();
  const s = startGuesswho(ctx, ['a', 'b'], settings({ bestOf: 5 }), seeded(2));
  guesswho.act(ctx, s, 'a', { type: 'resign' });
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('b');
  const s2 = startGuesswho(ctx, ['a', 'b'], settings({ bestOf: 5 }), seeded(2));
  guesswho.onLeave!(ctx, s2, 'b');
  expect(s2.winner).toBe('a');
  expect(s2.how).toBe('leave');
  expect(guesswho.result!(s2)).toEqual({ places: [['a'], ['b']] });
});

test('settings are validated', () => {
  expect(sanitizeGuesswho(undefined)).toEqual(GUESSWHO_DEFAULTS);
  expect(sanitizeGuesswho({ bestOf: 4 } as GuesswhoSettings).bestOf).toBe(3);
  expect(sanitizeGuesswho({ bestOf: 99 } as GuesswhoSettings).bestOf).toBe(5);
  const st = { ...GUESSWHO_DEFAULTS };
  guesswho.patchSettings!(st, { bestOf: 1, autoFlip: false, wrongLoses: 'x' });
  expect(st).toEqual({ bestOf: 1, autoFlip: false, wrongLoses: true });
  guesswho.patchSettings!(st, { bestOf: '5', wrongLoses: false });
  expect(st).toEqual({ bestOf: 1, autoFlip: false, wrongLoses: false });
});

/* ------------------------------------------------------------------ */
/* Hidden information                                                  */
/* ------------------------------------------------------------------ */

test('a view never tells the other player\'s secret before the round is over', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const ctx = fakeCtx();
    const s = startGuesswho(ctx, ['a', 'b'], settings({ wrongLoses: false }), seeded(seed));
    for (let k = 0; k < 6; k++) {
      const by = turn(s);
      if (k === 3) guess(ctx, s, by, (s.secrets[other(s, by)] + 1) % GW_N);
      else ask(ctx, s, by, GW_QUESTIONS[(seed * 3 + k) % GW_QUESTIONS.length].id);
      for (const me of ['a', 'b', 'spectator']) {
        const v = view(ctx, s, me);
        expect(v.secrets).toBeNull();
        expect(v.mySecret).toBe(me === 'spectator' ? null : s.secrets[me]);
        // the view is the same whatever the other's secret is, among those the answers allow
        if (me === 'spectator') continue;
        const them = other(s, me);
        const real = s.secrets[them];
        const alike = gwCandidates(s.log, me).filter((c) => c !== real && c !== s.secrets[me]);
        if (!alike.length) continue;
        s.secrets[them] = alike[0];
        const v2 = view(ctx, s, me);
        s.secrets[them] = real;
        expect(JSON.stringify(v2)).toBe(JSON.stringify(v));
      }
      passPause(ctx, s);
    }
    // nothing said aloud or on the screens names a secret
    for (const said of ctx.said) for (const id of s.players) expect(said.text.includes(GW_CHARS[s.secrets[id]].name) && !said.text.startsWith('تخمين')).toBe(false);
  }
});

test('the round\'s end shows both secrets', () => {
  const ctx = fakeCtx();
  const s = startGuesswho(ctx, ['a', 'b'], settings({ bestOf: 3 }), seeded(4));
  const by = turn(s);
  guess(ctx, s, by, s.secrets[other(s, by)]);
  for (const me of ['a', 'b', 'spectator']) expect(view(ctx, s, me).secrets).toEqual(s.secrets);
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** Plays a whole match with the module's own bot plan; returns the final state. */
function botMatch(level: BotLevel, p: Partial<GuesswhoSettings>, seed: number) {
  const ctx = fakeCtx(['a', 'b'], level);
  const s = startGuesswho(ctx, ['a', 'b'], settings(p), seeded(seed));
  for (let step = 0; step < 2000 && s.phase !== 'final'; step++) {
    guesswho.botPlan!(ctx, s, ['a', 'b']);
    const job = ctx.jobs.shift();
    if (job) {
      ctx.now = Math.max(ctx.now, job.at);
      guesswho.act(ctx, s, job.by, job.a);
      continue;
    }
    ctx.now += 500;
    guesswho.tick!(ctx, s);
  }
  return { s, ctx };
}

test('bots finish their matches at every level and with every setting', () => {
  let seed = 100;
  for (const level of ['easy', 'smart', 'expert'] as BotLevel[]) {
    for (const p of [{ bestOf: 5, wrongLoses: true }, { bestOf: 3, wrongLoses: false, autoFlip: false }]) {
      for (let k = 0; k < 4; k++) {
        const { s } = botMatch(level, p, seed++);
        expect([level, s.phase]).toEqual([level, 'final']);
        expect(guesswho.result!(s)!.places.flat().sort()).toEqual(['a', 'b']);
        // bots never ask the same question twice in a round
        const asked = s.log.filter((e) => e.kind === 'ask').map((e) => `${e.by}:${e.kind === 'ask' ? e.q : ''}`);
        expect(new Set(asked).size).toBe(asked.length);
      }
    }
  }
});

test('the expert bot asks the most even question and guesses when one is left', () => {
  const log: Parameters<typeof gwBotMove>[0]['log'] = [];
  const first = gwBotMove({ level: 'expert', log, me: 'a', other: 'b', wrongLoses: true, rnd: seeded(1) });
  expect(first.type).toBe('ask');
  const all = Array.from({ length: GW_N }, (_, i) => i);
  const best = Math.min(...GW_QUESTIONS.map((q) => gwSplit(q.id, all)));
  expect(gwSplit((first as { q: GwQuestionId }).q, all)).toBe(best);
  // narrow down to one: a guess of exactly that one
  const secret = 17;
  const L: typeof log = [];
  let n = 0;
  for (let k = 0; k < 12; k++) {
    const m = gwBotMove({ level: 'expert', log: L, me: 'a', other: 'b', wrongLoses: true, rnd: seeded(k) });
    if (m.type === 'guess') {
      expect(m.char).toBe(secret);
      expect(gwCandidates(L, 'a')).toEqual([secret]);
      return;
    }
    L.push({ kind: 'ask', n: ++n, by: 'a', q: m.q, yes: gwAnswer(m.q, secret) });
  }
  throw new Error('no guess');
});

test('the expert guesses early when that is the better bet', () => {
  // the other player has found the secret already: guess now, whatever is left
  const log: Parameters<typeof gwBotMove>[0]['log'] = [];
  let n = 0;
  const mySecret = 4;
  for (const q of GW_QUESTIONS) log.push({ kind: 'ask', n: ++n, by: 'b', q: q.id, yes: gwAnswer(q.id, mySecret) });
  log.push({ kind: 'ask', n: ++n, by: 'a', q: 'female', yes: true });
  expect(gwBotMove({ level: 'expert', log, me: 'a', other: 'b', wrongLoses: true }).type).toBe('guess');
  // two left and a miss only costs the turn: guess
  const two: typeof log = [];
  const a = 0;
  for (const q of GW_QUESTIONS) {
    two.push({ kind: 'ask', n: ++n, by: 'a', q: q.id, yes: gwAnswer(q.id, a) });
    if (gwCandidates(two, 'a').length <= 2) break;
  }
  if (gwCandidates(two, 'a').length === 2) {
    expect(gwBotMove({ level: 'expert', log: two, me: 'a', other: 'b', wrongLoses: false }).type).toBe('guess');
    expect(gwBotMove({ level: 'expert', log: two, me: 'a', other: 'b', wrongLoses: true }).type).toBe('ask');
  }
});

test('the race table: one left always wins, fewer candidates is better, the opponent closer is worse', () => {
  for (const wl of [true, false]) {
    for (let m = 1; m <= GW_N; m++) expect(gwWinChance(1, m, wl)).toBe(1);
    for (let n = 2; n <= GW_N; n++)
      for (let m = 1; m <= GW_N; m++) {
        const p = gwWinChance(n, m, wl);
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
        expect(p).toBeLessThanOrEqual(gwWinChance(n - 1, m, wl) + 1e-12);
        if (m > 1) expect(gwWinChance(n, m - 1, wl)).toBeLessThanOrEqual(p + 1e-12);
      }
    // the first asker has the edge
    expect(gwWinChance(GW_N, GW_N, wl)).toBeGreaterThan(0.5);
  }
});

test('the expert beats the easy bot most of the time', () => {
  const rnd = seeded(2024);
  let expertWins = 0;
  const N = 300;
  for (let g = 0; g < N; g++) {
    const ctx = fakeCtx(['x', 'e']);
    const s = startGuesswho(ctx, ['x', 'e'], settings({ bestOf: 1, wrongLoses: g % 2 === 0 }), rnd);
    // who starts alternates
    if ((g >> 1) % 2 === 1) s.turnIdx = (1 - s.turnIdx) as 0 | 1;
    const level: Record<string, BotLevel> = { x: 'expert', e: 'easy' };
    for (let k = 0; k < 100 && s.phase === 'play'; k++) {
      const by = turn(s);
      const m = gwBotMove({ level: level[by], log: s.log, me: by, other: other(s, by), wrongLoses: s.settings.wrongLoses, rnd });
      guesswho.act(ctx, s, by, m);
      passPause(ctx, s);
    }
    expect(s.phase).toBe('final');
    if (s.winner === 'x') expertWins++;
  }
  expect(expertWins / N).toBeGreaterThan(0.7);
});

test('a bot decision is quick', () => {
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) gwBotMove({ level: 'expert', log: [], me: 'a', other: 'b', wrongLoses: true });
  expect((performance.now() - t0) / 200).toBeLessThan(5);
});

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

test('spoken calls: vowelled Arabic only, never a verb about a player', () => {
  const { ctx } = botMatch('expert', { bestOf: 5, wrongLoses: false }, 77);
  const r = fakeCtx();
  const s = startGuesswho(r, ['a', 'b'], settings(), seeded(1));
  guesswho.act(r, s, 'a', { type: 'resign' });
  const voices = [...ctx.said, ...r.said].map((x) => x.voice).filter((v): v is string => !!v);
  expect(voices.length).toBeGreaterThan(3);
  // player names are the ids here (a, b): everything else is Arabic letters, marks, spaces and «،»
  for (const v of voices) expect(v.replace(/لِ[ab]\b/g, '')).toMatch(/^[ء-ْ ،]+$/);
  // a question is shown, not read aloud
  expect(ctx.said.filter((x) => x.text.startsWith('سؤال من')).every((x) => !x.voice)).toBe(true);
});
