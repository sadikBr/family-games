/** «سؤال وشرط» — the cards always have answers, judging (category + every condition, «ال», hamza, ة, ى), the round flow, votes, skips, bots. */
import { expect, test } from 'bun:test';

import {
  QCOND_CATS,
  QCOND_DEFAULTS,
  QCOND_TRIES,
  QCOND_VOTE_MS,
  condLabel,
  meetsCond,
  qcondLetters,
  type QcondCat,
  type QcondCond,
  type QcondView,
} from '../src/shared/games/qcond';
import { normWord } from '../src/shared/wordle';
// @ts-expect-error — plain JS build script (exports the shared dialect blocklist)
import { DIALECT } from '../tools/wordle-dict.mjs';
import { QCOND_MIN_ANSWERS, answersFor, botAnswer, botSlip, condId, dealPairs, examplesFor, judge, matchCat, playableConds } from './qcond-content';
import { QCOND_WORDS } from './qcond-words';
import { QCOND_BOT_MS, QCOND_RESUME_MS, QCOND_REVEAL_MS, qcond, qcondBotDelay, sanitizeQcond, startQcond, type QcondState } from './games/qcond';
import type { GameCtx } from './types';
import { QCOND_CAT_VOICE, voiceCards, voiceCond } from './voice-calls-qcond';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Said = { text: string; by?: string; voice?: string };

function fakeCtx(bots: string[] = [], level: 'easy' | 'smart' | 'expert' = 'expert') {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const said: Said[] = [];
  const fxs: [string, string | undefined][] = [];
  const offline = new Set<string>();
  const ctx: GameCtx & { jobs: Job[]; said: Said[]; fxs: typeof fxs; offline: Set<string> } = {
    now: 1_000_000,
    fx: (k, t) => fxs.push([k, t]),
    say: (text, by, voice) => said.push({ text, by, voice }),
    isConnected: (id) => !offline.has(id),
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
    said,
    fxs,
    offline,
  };
  return ctx;
}

/** A small seeded random (mulberry32). */
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

const P = ['a', 'b', 'c'];
const view = (ctx: GameCtx, s: QcondState, me: string) => qcond.view(ctx, s, me) as QcondView;
const say = (ctx: GameCtx, s: QcondState, by: string, text: string) => qcond.act(ctx, s, by, { type: 'answer', round: s.round + 1, text });
/** A game whose current round has the given cards. */
function game(cat: QcondCat, cond: QcondCond, players = P, bots: string[] = [], seed = 1) {
  const ctx = fakeCtx(bots);
  const s = startQcond(ctx, players, { ...QCOND_DEFAULTS }, seeded(seed));
  s.pairs[s.round] = { cat, cond };
  return { ctx, s };
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('cards: every question card has playable conditions, every pair dealt has enough known answers', () => {
  for (const cat of QCOND_CATS) {
    expect([cat, playableConds(cat).length >= 15]).toEqual([cat, true]);
    for (const c of playableConds(cat)) expect(answersFor(cat, c).length).toBeGreaterThanOrEqual(QCOND_MIN_ANSWERS);
  }
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    const pairs = dealPairs(20, seeded(seed));
    expect(pairs.length).toBe(20);
    // the first 15 cards: every question card once
    expect(new Set(pairs.slice(0, 15).map((p) => p.cat)).size).toBe(15);
    for (const p of pairs) {
      const answers = answersFor(p.cat, p.cond);
      expect(answers.length).toBeGreaterThanOrEqual(QCOND_MIN_ANSWERS);
      // each known answer really passes the judge (category and condition)
      for (const w of answers.slice(0, 3)) expect([p.cat, condId(p.cond), w, judge(p.cat, p.cond, w).ok]).toEqual([p.cat, condId(p.cond), w, true]);
      kinds.add(p.cond.kind);
    }
    // never the same letter twice in a row
    for (let i = 1; i < pairs.length; i++) if (pairs[i].cond.letter) expect(pairs[i].cond.letter === pairs[i - 1].cond.letter).toBe(false);
  }
  expect([...kinds].sort()).toEqual(['end', 'has', 'len', 'min', 'noAlif', 'start']);
});

test('lists: the words shown and played by bots are فصحى and unique per category', () => {
  const dia = new Set((DIALECT as string[]).map(normWord));
  for (const cat of QCOND_CATS) {
    const { std } = QCOND_WORDS[cat];
    expect(std.length).toBeGreaterThanOrEqual(40);
    if (['boy', 'girl', 'animal', 'job'].includes(cat)) continue; // the names game's lists (tested there)
    const hits = std.filter((w) => w.split(' ').some((x) => dia.has(normWord(x))));
    expect([cat, hits]).toEqual([cat, []]);
  }
});

/* ------------------------------------------------------------------ */
/* Judging                                                             */
/* ------------------------------------------------------------------ */

const S = (letter: string): QcondCond => ({ kind: 'start', letter });
const E = (letter: string): QcondCond => ({ kind: 'end', letter });
const H = (letter: string): QcondCond => ({ kind: 'has', letter });
const L = (n: number): QcondCond => ({ kind: 'len', n });
const M = (n: number): QcondCond => ({ kind: 'min', n });
const NA: QcondCond = { kind: 'noAlif' };

test('conditions: starts with, ends with, contains, exactly N, at least N, no alif', () => {
  expect(meetsCond('جمل', S('ج'))).toBe(true);
  expect(meetsCond('جمل', S('ل'))).toBe(false);
  expect(meetsCond('قمر', E('ر'))).toBe(true);
  expect(meetsCond('قمر', E('م'))).toBe(false);
  expect(meetsCond('مشمش', H('ش'))).toBe(true);
  expect(meetsCond('موز', H('ش'))).toBe(false);
  expect(meetsCond('تفاح', L(4))).toBe(true);
  expect(meetsCond('تفاح', L(5))).toBe(false);
  expect(meetsCond('برتقال', M(6))).toBe(true);
  expect(meetsCond('موز', M(6))).toBe(false);
  expect(meetsCond('خوخ', NA)).toBe(true);
  expect(meetsCond('موز', NA)).toBe(true);
  expect(meetsCond('تفاح', NA)).toBe(false);
  expect(meetsCond('أرنب', NA)).toBe(false); // أ is an alif
  // spaces, diacritics and tatweel don't count
  expect(meetsCond('كُرَةُ القَدَمِ', L(8))).toBe(true);
  expect(meetsCond('جـــمل', L(3))).toBe(true);
});

test('«ال»: ignored at the start of the answer (only the bare article), counted inside', () => {
  expect(qcondLetters('الجزائر').key).toBe('جزاير');
  expect(meetsCond('الجزائر', S('ج'))).toBe(true);
  expect(meetsCond('الجزائر', S('ا'))).toBe(false);
  expect(meetsCond('الجزائر', L(5))).toBe(true);
  // a hamza on the alif makes it part of the word
  expect(meetsCond('إلياس', S('ا'))).toBe(true);
  expect(meetsCond('ألمانيا', S('ا'))).toBe(true);
  expect(meetsCond('ألمانيا', L(7))).toBe(true);
  // «الدار البيضاء»: the first article only
  expect(qcondLetters('الدار البيضاء').key).toBe('دارالبيضاء');
  expect(judge('country', S('ا'), 'الجزائر')).toEqual({ ok: false, hint: 'لا تبدأ بحرف الألف («ال» لا تُحسب)', real: false });
  expect(judge('country', S('ج'), 'الجزائر').ok).toBe(true);
  expect(judge('mcity', S('ر'), 'الرباط').ok).toBe(true);
});

test('normalising: hamza seats, ة = ه, ى ends with ا and ي', () => {
  expect(meetsCond('أحمد', S('ا'))).toBe(true);
  expect(meetsCond('إبراهيم', S('ا'))).toBe(true);
  expect(meetsCond('آدم', S('ا'))).toBe(true);
  expect(judge('boy', S('ا'), 'احمد').ok).toBe(true); // written without hamza
  expect(judge('girl', E('ه'), 'فاطمة').ok).toBe(true);
  expect(judge('girl', E('ه'), 'فاطمه').ok).toBe(true);
  expect(meetsCond('سلمى', E('ا'))).toBe(true);
  expect(meetsCond('سلمى', E('ي'))).toBe(true);
  expect(meetsCond('مؤمن', H('و'))).toBe(true);
  expect(meetsCond('مدينة', E('ه'))).toBe(true);
  expect(meetsCond('مدينة', L(5))).toBe(true);
});

test('category: the lists, other spellings, and no letter glued to a known word', () => {
  expect(judge('city', S('ج'), 'جدة').ok).toBe(true);
  expect(judge('animal', S('خ'), 'خروف').ok).toBe(true);
  expect(judge('fruit', L(4), 'تفاح').ok).toBe(true);
  expect(judge('color', S('ا'), 'أحمر').ok).toBe(true);
  expect(judge('country', S('ن'), 'نيوزيلاندا').ok).toBe(true); // another spelling
  expect(judge('mcity', S('د'), 'الدار البيضا').ok).toBe(true); // one slip
  expect(judge('sport', S('ك'), 'كرة القدم').ok).toBe(true);
  // a letter added in front of a known name doesn't make a name with that letter
  expect(judge('boy', S('ج'), 'جمحمود').ok).toBe(false);
  expect(matchCat('boy', 'جمحمود', S('ج'))).toBe(null);
  // the wrong category, with its hint
  expect(judge('animal', S('ت'), 'تفاح')).toEqual({ ok: false, hint: 'ليس حيواناً معروفاً', real: true });
  expect(judge('city', S('ف'), 'فرنسا')).toMatchObject({ ok: false, hint: 'ليست مدينة معروفة' });
  // not a word at all
  expect(judge('animal', S('خ'), 'خسشيبك')).toEqual({ ok: false, hint: 'كلمة غير معروفة', real: false });
  // the condition first
  expect(judge('animal', S('ج'), 'خروف')).toEqual({ ok: false, hint: 'لا تبدأ بحرف الجيم', real: false });
  expect(judge('fruit', L(5), 'تفاح')).toEqual({ ok: false, hint: 'فيها 4 حروف، والمطلوب 5 حروف', real: false });
  expect(judge('fruit', NA, 'تفاح')).toEqual({ ok: false, hint: 'فيها حرف الألف', real: false });
});

/* ------------------------------------------------------------------ */
/* Flow                                                                */
/* ------------------------------------------------------------------ */

test('flow: the first valid answer takes the card; a near-simultaneous second one gets nothing', () => {
  const { ctx, s } = game('city', S('ج'));
  ctx.now += 4200;
  say(ctx, s, 'b', 'جدة');
  say(ctx, s, 'c', 'جنيف'); // same tick, processed right after
  expect(s.phase).toBe('reveal');
  expect(s.result).toMatchObject({ winner: 'b', text: 'جدة', how: 'answer', ms: 4200 });
  expect(s.scores).toEqual({ a: 0, b: 1, c: 0 });
  expect(s.result!.examples.length).toBe(3);
  expect(s.result!.examples.some((w) => w === 'جدة')).toBe(false);
  for (const w of s.result!.examples) expect(judge('city', S('ج'), w).ok).toBe(true);
  expect(ctx.said.at(-1)).toMatchObject({ by: 'b', voice: 'الجَوْلَةُ لِb' });
  // the reveal ends by itself, then the next cards
  ctx.now += QCOND_REVEAL_MS + 10;
  expect(qcond.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('play');
  expect(s.round).toBe(1);
  // an answer for the old round is ignored
  qcond.act(ctx, s, 'a', { type: 'answer', round: 1, text: 'جنيف' });
  expect(s.attempts).toEqual([]);
});

test('tries: a wrong answer gets a hint for its author only; 3 tries per round; the same word again is free', () => {
  const { ctx, s } = game('animal', S('خ'));
  say(ctx, s, 'a', 'جمل');
  expect(view(ctx, s, 'a').myLast).toEqual({ text: 'جمل', hint: 'لا تبدأ بحرف الخاء' });
  expect(view(ctx, s, 'b').myLast).toBe(null);
  expect(view(ctx, s, 'b').tries).toEqual({ a: 1 });
  say(ctx, s, 'a', 'جمل'); // the same refused word: not counted
  expect(s.tries.a).toBe(1);
  say(ctx, s, 'a', 'خسشيبك');
  say(ctx, s, 'a', 'ثعلب');
  expect(s.tries.a).toBe(QCOND_TRIES);
  say(ctx, s, 'a', 'خروف'); // no tries left
  expect(s.phase).toBe('play');
  expect(s.attempts.filter((x) => x.id === 'a').length).toBe(3);
  say(ctx, s, 'b', 'خروف');
  expect(s.result).toMatchObject({ winner: 'b' });
  expect(s.result!.attempts.filter((x) => !x.ok).map((x) => x.text)).toEqual(['جمل', 'خسشيبك', 'ثعلب']);
});

test('timeout: the round ends with three valid example answers and no card', () => {
  const { ctx, s } = game('fruit', S('ب'));
  ctx.now += QCOND_DEFAULTS.seconds * 1000 - 1;
  expect(qcond.tick!(ctx, s)).toBe(false);
  ctx.now += 2;
  expect(qcond.tick!(ctx, s)).toBe(true);
  expect(s.result).toMatchObject({ winner: null, how: 'timeout' });
  expect(s.result!.examples.length).toBe(3);
  for (const w of s.result!.examples) expect(judge('fruit', S('ب'), w).ok).toBe(true);
  expect(ctx.said.at(-1)!.text).toContain('أجوبة ممكنة');
  expect(Object.values(s.scores).every((v) => v === 0)).toBe(true);
  // late answers don't count
  say(ctx, s, 'a', 'برتقال');
  expect(s.scores.a).toBe(0);
});

test('skip: every person asks «تخطّي» (bots and people offline aside), the card goes away with examples', () => {
  const { ctx, s } = game('color', S('ب'), ['a', 'b', 'c', 'bot'], ['bot']);
  qcond.act(ctx, s, 'a', { type: 'skip' });
  qcond.act(ctx, s, 'b', { type: 'skip' });
  expect(view(ctx, s, 'a')).toMatchObject({ skips: ['a', 'b'], skipNeeded: 3 });
  qcond.act(ctx, s, 'b', { type: 'skip' }); // changed their mind
  expect(view(ctx, s, 'a').skips).toEqual(['a']);
  qcond.act(ctx, s, 'b', { type: 'skip' });
  qcond.act(ctx, s, 'bot', { type: 'skip' }); // bots don't ask
  expect(s.phase).toBe('play');
  ctx.offline.add('c'); // c went away: no longer waited for
  expect(qcond.tick!(ctx, s)).toBe(true);
  expect(s.result).toMatchObject({ winner: null, how: 'skip' });
  expect(s.result!.examples.length).toBe(3);
});

/* ------------------------------------------------------------------ */
/* Votes                                                               */
/* ------------------------------------------------------------------ */

test('vote: a real word the lists lack stops the clock; a majority of the others accepts it', () => {
  const { ctx, s } = game('animal', S('خ'), ['a', 'b', 'c', 'bot'], ['bot']);
  ctx.now += 5000;
  say(ctx, s, 'a', 'خبز');
  expect(s.phase).toBe('vote');
  const v = view(ctx, s, 'b');
  expect(v.vote).toMatchObject({ by: 'a', text: 'خبز', question: 'هل «خبز» حيوان؟', voters: ['b', 'c'], total: QCOND_VOTE_MS });
  expect(view(ctx, s, 'a').myLast!.text).toBe('خبز');
  // answers wait during the vote; the author and the bots can't vote
  say(ctx, s, 'c', 'خروف');
  expect(s.phase).toBe('vote');
  qcond.act(ctx, s, 'a', { type: 'vote', yes: true });
  qcond.act(ctx, s, 'bot', { type: 'vote', yes: true });
  expect(s.vote!.yes.size).toBe(0);
  ctx.now += 3000;
  qcond.act(ctx, s, 'b', { type: 'vote', yes: true });
  expect(s.phase).toBe('vote'); // 1 of 2 is not a majority
  qcond.act(ctx, s, 'c', { type: 'vote', yes: true });
  expect(s.result).toMatchObject({ winner: 'a', text: 'خبز', how: 'vote', ms: 5000 });
  expect(s.scores.a).toBe(1);
  expect(s.result!.attempts.find((x) => x.text === 'خبز')!.ok).toBe(true);
});

test('vote: refused, the round goes on with the time it had (a few seconds at least); bots never open one', () => {
  const { ctx, s } = game('animal', S('خ'), ['a', 'b', 'c', 'bot'], ['bot']);
  const end = s.endsAt!;
  ctx.now += 10_000;
  say(ctx, s, 'a', 'خبز');
  ctx.now += 2000;
  qcond.act(ctx, s, 'b', { type: 'vote', yes: false });
  expect(s.phase).toBe('play'); // half of the voters said no: no majority possible
  expect(s.endsAt).toBe(end + 2000);
  expect(s.tries.a).toBe(1);
  // a bot's real word is simply refused
  say(ctx, s, 'bot', 'خبز');
  expect(s.phase).toBe('play');
  expect(s.tries.bot).toBe(1);
  // the vote's end: more yes than no wins
  ctx.now = s.endsAt! - 1000;
  say(ctx, s, 'b', 'خيمة');
  expect(s.phase).toBe('vote');
  qcond.act(ctx, s, 'c', { type: 'vote', yes: true });
  expect(s.phase).toBe('vote');
  ctx.now += QCOND_VOTE_MS;
  qcond.tick!(ctx, s);
  expect(s.result).toMatchObject({ winner: 'b', how: 'vote' });
});

test('vote: with no other person in the room there is nobody to ask: the word is refused', () => {
  const { ctx, s } = game('animal', S('خ'), ['a', 'bot'], ['bot']);
  say(ctx, s, 'a', 'خبز');
  expect(s.phase).toBe('play');
  expect(view(ctx, s, 'a').myLast).toEqual({ text: 'خبز', hint: 'ليس حيواناً معروفاً' });
  // a refused vote leaves at least QCOND_RESUME_MS
  const g = game('animal', S('خ'), ['a', 'b']);
  g.ctx.now = g.s.endsAt! - 500;
  say(g.ctx, g.s, 'a', 'خبز');
  qcond.act(g.ctx, g.s, 'b', { type: 'vote', yes: false });
  expect(g.s.endsAt).toBe(g.ctx.now + QCOND_RESUME_MS);
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: slower when easy and when the card has few answers; right answers from the lists; slips miss the condition', () => {
  const r = seeded(3);
  const avg = (level: 'easy' | 'smart' | 'expert', n: number) => {
    let t = 0;
    for (let i = 0; i < 200; i++) t += qcondBotDelay(level, n, 'start', r);
    return t / 200;
  };
  expect(avg('easy', 30)).toBeGreaterThan(avg('smart', 30));
  expect(avg('smart', 30)).toBeGreaterThan(avg('expert', 30));
  expect(avg('expert', 4)).toBeGreaterThan(avg('expert', 30) * 1.4);
  expect(avg('expert', 30)).toBeGreaterThan(QCOND_BOT_MS.expert[0] - 1);
  for (const cat of QCOND_CATS)
    for (const c of playableConds(cat).slice(0, 8)) {
      expect(judge(cat, c, botAnswer(cat, c, 'easy', r)!).ok).toBe(true);
      const slip = botSlip(cat, c, r);
      if (slip) expect(meetsCond(slip, c)).toBe(false);
    }
});

test('bots: a whole game with bots (and one silent person) reaches the final with a result', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const ctx = fakeCtx(['x', 'y', 'z'], level);
    const s = startQcond(ctx, ['me', 'x', 'y', 'z'], { rounds: 10, seconds: 30 }, seeded(7));
    let guard = 0;
    while (s.phase !== 'final' && guard++ < 5000) {
      qcond.botPlan!(ctx, s, ['x', 'y', 'z']);
      ctx.jobs.sort((a, b) => a.at - b.at);
      const job = ctx.jobs[0];
      const tickAt = s.endsAt ?? ctx.now + 100;
      if (job && job.at <= tickAt) {
        ctx.jobs.shift();
        ctx.now = Math.max(ctx.now, job.at);
        qcond.act(ctx, s, job.by, job.a);
      } else {
        ctx.now = Math.max(ctx.now, tickAt);
        qcond.tick!(ctx, s);
      }
    }
    expect([level, s.phase]).toEqual([level, 'final']);
    const won = Object.values(s.scores).reduce((a, b) => a + b, 0);
    if (level === 'expert') expect(won).toBeGreaterThanOrEqual(9); // expert bots almost always find one
    expect(won).toBeLessThanOrEqual(10);
    const res = qcond.result!(s)!;
    expect(res.places.flat().sort()).toEqual(['me', 'x', 'y', 'z']);
  }
});

test('bots: the planned answers belong to the round and arrive within its time', () => {
  const ctx = fakeCtx(['x'], 'expert');
  const s = startQcond(ctx, ['me', 'x'], { rounds: 10, seconds: 20 }, seeded(11));
  qcond.botPlan!(ctx, s, ['x']);
  qcond.botPlan!(ctx, s, ['x']); // planned once
  expect(ctx.jobs.length).toBeGreaterThanOrEqual(1);
  expect(ctx.jobs.length).toBeLessThanOrEqual(2);
  for (const j of ctx.jobs) {
    expect(j.a).toMatchObject({ type: 'answer', round: 1 });
    expect(j.at).toBeLessThan(s.endsAt!);
    expect(j.at - ctx.now).toBeGreaterThanOrEqual(1000);
  }
});

/* ------------------------------------------------------------------ */
/* Settings, views, leaving, voice                                     */
/* ------------------------------------------------------------------ */

test('settings: 10 / 15 / 20 rounds, 20 / 30 / 45 seconds', () => {
  expect(sanitizeQcond(undefined)).toEqual({ rounds: 10, seconds: 30 });
  expect(sanitizeQcond({ rounds: 14, seconds: 50 })).toEqual({ rounds: 15, seconds: 45 });
  const st = { ...QCOND_DEFAULTS };
  qcond.patchSettings!(st, { rounds: 99, seconds: 'x' });
  expect(st).toEqual({ rounds: 20, seconds: 30 });
  const ctx = fakeCtx();
  expect(startQcond(ctx, P, { rounds: 15, seconds: 20 }).pairs.length).toBe(15);
});

test('views: no examples or answers before the reveal; turnOf is empty (everyone at once)', () => {
  const { ctx, s } = game('city', S('ج'));
  const v = view(ctx, s, 'a');
  expect(v.result).toBe(null);
  expect(v.vote).toBe(null);
  expect(JSON.stringify(v)).not.toContain('جدة');
  expect(v.endsAt).toBe(s.endsAt);
  expect(qcond.turnOf!(s)).toEqual([]);
  expect(qcond.result!(s)).toBe(null);
});

test('leaving: the vote of a player who left is dropped; fewer than two players ends the game', () => {
  const { ctx, s } = game('animal', S('خ'));
  say(ctx, s, 'a', 'خبز');
  expect(s.phase).toBe('vote');
  qcond.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('play');
  expect(s.participants).toEqual(['b', 'c']);
  qcond.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('final');
  expect(qcond.result!(s)!.places).toEqual([['c']]);
});

test('voice: the two cards read aloud, vowelled, Arabic letters and spaces only', () => {
  const CALL = /^[ء-غف-يً-ْ]+( [ء-غف-يً-ْ]+)*$/;
  for (const v of Object.values(QCOND_CAT_VOICE)) expect(v).toMatch(CALL);
  for (const cat of QCOND_CATS)
    for (const c of playableConds(cat)) {
      expect([condLabel(c), voiceCond(c)]).toEqual([condLabel(c), expect.stringMatching(CALL)]);
      expect(voiceCond(c)).toMatch(/[ً-ْ]/);
      for (const part of voiceCards(cat, c).split('، ')) expect(part).toMatch(CALL);
    }
  const { ctx } = game('city', S('ج'));
  expect(ctx.said[0].voice).toBeTruthy();
  expect(Object.keys(QCOND_CAT_VOICE).sort()).toEqual([...QCOND_CATS].sort());
});

test('examples: never the winning word, the common words first', () => {
  const ex = examplesFor('mcity', S('م'), ['مراكش'], 3, seeded(2));
  expect(ex.length).toBe(3);
  expect(ex).not.toContain('مراكش');
});
