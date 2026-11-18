/**
 * «رتّب الأحداث» — the content (unique, plausible years, valid categories, enough per topic), scoring, the
 * dealer (distinct years, rising difficulty, never already in order, no card twice in a game), the round flow
 * (drafts, confirming, timeouts with partial orders), no leak of years or order before the reveal, bots,
 * leaving, settings, the result.
 */
import { expect, test } from 'bun:test';

import { TARTIB_CAT_LABEL, TARTIB_DEFAULTS, TARTIB_TOPICS, tartibPoints, tartibRight, tartibSpeed, tartibYear, type TartibCat, type TartibSettings, type TartibView } from '../src/shared/games/tartib';
import type { BotLevel } from '../src/shared/protocol';
import { sanitizeTartib, scoreOf, tartib, TARTIB_REVEAL_MS, type TartibState } from './games/tartib';
import { TARTIB_ITEMS } from './tartib-content';
import { botDelay, botOrder, dealRound, feltYear, GAP_FLOOR, LEVEL_CARDS, LEVEL_TARGET, minGap, roundLevels, shuffleCards, topicPool } from './tartib-deal';
import type { GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Ctx = GameCtx & { now: number; jobs: Job[]; offline: Set<string>; voices: string[] };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert', memo = new Map<string, unknown>()): Ctx {
  const keys = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: () => {},
    say: (_t, _by, voice) => {
      if (voice) ctx.voices.push(voice);
    },
    isConnected: (id) => !ctx.offline.has(id),
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
    offline: new Set(),
    voices: [],
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

const settings = (o: Partial<TartibSettings> = {}): TartibSettings => ({ ...TARTIB_DEFAULTS, ...o });
const view = (ctx: GameCtx, s: TartibState, me: string) => tartib.view(ctx, s, me) as TartibView;
const act = (ctx: Ctx, s: TartibState, by: string, a: Record<string, unknown>) => tartib.act(ctx, s, by, { round: s.round + 1, ...a } as never);
const submit = (ctx: Ctx, s: TartibState, by: string, order: (number | null)[]) => act(ctx, s, by, { type: 'submit', order });
const arrange = (ctx: Ctx, s: TartibState, by: string, slots: (number | null)[]) => act(ctx, s, by, { type: 'arrange', slots });
/** Play the bots' jobs and the clock until the game is over (or `until` says stop). */
function runBots(ctx: Ctx, s: TartibState, bots: string[], until: () => boolean = () => s.phase === 'final') {
  for (let guard = 0; guard < 5000 && !until(); guard++) {
    tartib.botPlan!(ctx, s, bots);
    const due = ctx.jobs.filter((j) => j.at <= ctx.now);
    ctx.jobs = ctx.jobs.filter((j) => j.at > ctx.now);
    for (const j of due) tartib.act(ctx, s, j.by, j.a);
    ctx.now += 500;
    tartib.tick!(ctx, s);
  }
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('content: 250+ unique items, valid categories, plausible years, short texts, Hijri only where it fits', () => {
  expect(TARTIB_ITEMS.length).toBeGreaterThanOrEqual(250);
  expect(new Set(TARTIB_ITEMS.map((i) => i.id)).size).toBe(TARTIB_ITEMS.length);
  expect(new Set(TARTIB_ITEMS.map((i) => i.text)).size).toBe(TARTIB_ITEMS.length);
  const cats = Object.keys(TARTIB_CAT_LABEL) as TartibCat[];
  for (const it of TARTIB_ITEMS) {
    expect(cats, it.id).toContain(it.cat);
    expect(Number.isInteger(it.year), it.id).toBe(true);
    expect(it.year, it.id).not.toBe(0);
    expect(it.year, it.id).toBeGreaterThanOrEqual(-600);
    expect(it.year, it.id).toBeLessThanOrEqual(2025);
    expect(it.text.trim(), it.id).toBe(it.text);
    expect(it.text.length, it.id).toBeGreaterThanOrEqual(6);
    expect(it.text.length, it.id).toBeLessThanOrEqual(40); // two lines on a 320 px phone
    expect(/(?:^|\D)(?:1\d{3}|20\d{2})(?:\D|$)/.test(it.text), `${it.id}: no year in the text`).toBe(false);
    if (it.hijri !== undefined) {
      expect(it.year, it.id).toBeGreaterThanOrEqual(622);
      // the Hijri year from the Gregorian one: within a year of (y − 622) × 33 / 32
      expect(Math.abs(it.hijri - (it.year - 622) * (33 / 32)), it.id).toBeLessThanOrEqual(1.6);
    }
  }
  // the Islamic history cards carry their Hijri year (except a few before the Hijra or near a year's turn)
  const islam = TARTIB_ITEMS.filter((i) => i.cat === 'islam' && i.year >= 622);
  expect(islam.filter((i) => i.hijri !== undefined).length / islam.length).toBeGreaterThan(0.9);
});

test('content: enough items for every topic, spread over the eras, a few landmarks exactly right', () => {
  for (const t of TARTIB_TOPICS) {
    const pool = topicPool(t.key);
    expect(pool.length, t.key).toBeGreaterThanOrEqual(45);
    // enough different years for a 10-round game of 5 cards (never a card twice)
    expect(new Set(pool.map((i) => i.year)).size, t.key).toBeGreaterThanOrEqual(40);
  }
  expect(TARTIB_ITEMS.filter((i) => i.year < 1000).length).toBeGreaterThanOrEqual(40);
  expect(TARTIB_ITEMS.filter((i) => i.year >= 1000 && i.year < 1800).length).toBeGreaterThanOrEqual(50);
  expect(TARTIB_ITEMS.filter((i) => i.year >= 1800).length).toBeGreaterThanOrEqual(120);
  const year = (text: string) => TARTIB_ITEMS.find((i) => i.text === text)!;
  expect(year('الهجرة النبوية إلى المدينة المنورة')).toMatchObject({ year: 622, hijri: 1 });
  expect(year('غزوة بدر الكبرى')).toMatchObject({ year: 624, hijri: 2 });
  expect(year('فتح القسطنطينية على يد محمد الفاتح')).toMatchObject({ year: 1453, hijri: 857 });
  expect(year('المسيرة الخضراء').year).toBe(1975);
  expect(year('استقلال المغرب').year).toBe(1956);
  expect(year('أول هبوط للإنسان على سطح القمر').year).toBe(1969);
  expect(year('أول كأس عالم لكرة القدم في الأوروغواي').year).toBe(1930);
});

test('content: no dialect words', () => {
  const DIALECT = /(?:^|\s)(?:ماشي|يلا|شفت|بزاف|واش|ديال|كاين|دابا|هادي|هاد|علاش|فين|كيفاش|مش|عشان|هيك|شو|ليش)(?=\s|$|[،.؟!])/;
  for (const it of TARTIB_ITEMS) expect(DIALECT.test(it.text), it.text).toBe(false);
});

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

test('scoring: +1 a card in place, +3 perfect, speed bonus only for a confirmed perfect order', () => {
  expect(tartibRight([0, 1, 2, 3], [0, 1, 2, 3])).toBe(4);
  expect(tartibRight([1, 0, 2, 3], [0, 1, 2, 3])).toBe(2);
  expect(tartibRight([0, null, null, 3], [0, 1, 2, 3])).toBe(2);
  expect(tartibRight([null, null, null, null], [0, 1, 2, 3])).toBe(0);
  expect(tartibSpeed(40_000, 45_000)).toBe(2);
  expect(tartibSpeed(30_000, 45_000)).toBe(2);
  expect(tartibSpeed(20_000, 45_000)).toBe(1);
  expect(tartibSpeed(10_000, 45_000)).toBe(0);
  expect(tartibPoints(4, 4, true, 40_000, 45_000)).toEqual({ perfect: true, speed: 2, points: 9 });
  expect(tartibPoints(5, 5, true, 5_000, 45_000)).toEqual({ perfect: true, speed: 0, points: 8 });
  expect(tartibPoints(5, 5, false, 0, 45_000)).toEqual({ perfect: true, speed: 0, points: 8 });
  expect(tartibPoints(3, 5, true, 44_000, 45_000)).toEqual({ perfect: false, speed: 0, points: 3 });
  expect(tartibPoints(0, 4, true, 44_000, 45_000).points).toBe(0);
  expect(tartibYear(1453)).toBe('1453م');
  expect(tartibYear(-44)).toBe('44 ق.م');
});

/* ------------------------------------------------------------------ */
/* Dealing                                                             */
/* ------------------------------------------------------------------ */

test('levels: the first third easy (4 cards), then medium and hard (5 cards)', () => {
  expect(roundLevels(5)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard']);
  expect(roundLevels(8)).toEqual(['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard']);
  expect(roundLevels(10)).toEqual(['easy', 'easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard']);
  expect(LEVEL_CARDS).toEqual({ easy: 4, medium: 5, hard: 5 });
  expect(feltYear(2000)).toBeGreaterThan(feltYear(1900));
  // ten years weigh more today than in antiquity
  expect(feltYear(2010) - feltYear(2000)).toBeGreaterThan(feltYear(-290) - feltYear(-300));
});

test('dealing: distinct years, never closer than the floor, easy far apart, harder rounds closer', () => {
  const rnd = seeded(7);
  for (const t of TARTIB_TOPICS) {
    const pool = topicPool(t.key);
    const avg: Record<string, number> = {};
    for (const level of ['easy', 'medium', 'hard'] as const) {
      let sum = 0;
      for (let k = 0; k < 60; k++) {
        const set = dealRound(pool, LEVEL_CARDS[level], level, rnd);
        expect(set).toHaveLength(LEVEL_CARDS[level]);
        expect(new Set(set.map((i) => i.year)).size).toBe(set.length);
        expect(new Set(set).size).toBe(set.length);
        const g = minGap(set);
        expect(g, `${t.key} ${level}`).toBeGreaterThanOrEqual(GAP_FLOOR);
        if (level === 'easy') expect(g, t.key).toBeGreaterThanOrEqual(t.key === 'sport' ? 1.5 : 2);
        if (level === 'hard') expect(g, t.key).toBeLessThanOrEqual(LEVEL_TARGET.medium);
        sum += g;
      }
      avg[level] = sum / 60;
    }
    expect(avg.easy, t.key).toBeGreaterThan(avg.medium);
    expect(avg.medium, t.key).toBeGreaterThan(avg.hard);
  }
});

test('shuffle: the cards are never already in order, and `correct` lists them oldest first', () => {
  const rnd = seeded(3);
  for (let k = 0; k < 200; k++) {
    const set = dealRound(topicPool('mix'), 4 + (k % 2), k % 3 === 0 ? 'easy' : 'hard', rnd);
    const { cards, correct } = shuffleCards(set, rnd);
    const years = correct.map((i) => cards[i].year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(correct).not.toEqual([...cards.keys()]);
    expect([...correct].sort()).toEqual([...cards.keys()]);
  }
});

test('a game: rising difficulty, no card twice, no two cards of the same year in a round', () => {
  for (const topic of ['mix', 'sport', 'morocco'] as const) {
    const ctx = fakeCtx();
    const s = tartib.start(ctx, ['a'], settings({ rounds: 10, topic })) as TartibState;
    const seen = new Set<string>();
    const gaps: number[] = [];
    for (let r = 0; r < 10; r++) {
      expect(s.round).toBe(r);
      expect(s.cards).toHaveLength(r < 4 ? 4 : 5);
      expect(new Set(s.cards.map((c) => c.year)).size).toBe(s.cards.length);
      for (const c of s.cards) {
        expect(seen.has(c.id), c.id).toBe(false);
        seen.add(c.id);
        if (topic !== 'mix') expect(c.cat).toBe(topic);
      }
      gaps.push(minGap(s.cards));
      submit(ctx, s, 'a', s.correct);
      expect(s.phase).toBe('reveal');
      act(ctx, s, 'a', { type: 'next' });
    }
    expect(s.phase).toBe('final');
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(gaps.slice(0, 4))).toBeGreaterThan(mean(gaps.slice(7)));
  }
});

test('room memory: a second game in the room starts with cards not seen yet', () => {
  const memo = new Map<string, unknown>();
  const ctx = fakeCtx([], 'expert', memo);
  const first = tartib.start(ctx, ['a'], settings({ rounds: 5, topic: 'islam' })) as TartibState;
  runBots(fakeCtx(['a'], 'expert', memo), first, ['a']);
  const second = tartib.start(ctx, ['a'], settings({ rounds: 5, topic: 'islam' })) as TartibState;
  const before = new Set(first.used);
  for (const c of second.cards) expect(before.has(c.id)).toBe(false);
});

/* ------------------------------------------------------------------ */
/* Flow                                                                */
/* ------------------------------------------------------------------ */

test('a round: hidden years while playing, confirm, scores and the timeline on reveal', () => {
  const ctx = fakeCtx();
  const s = tartib.start(ctx, ['a', 'b', 'c'], settings({ seconds: 45 })) as TartibState;
  expect(s.phase).toBe('play');
  expect(tartib.turnOf!(s)).toEqual(['a', 'b', 'c']);
  let v = view(ctx, s, 'a');
  expect(v.cards).toHaveLength(4);
  expect(v.level).toBe('easy');
  expect(v.answer).toBeNull();
  expect(v.results).toBeNull();
  expect(v.mine).toBeNull();

  // invalid orders are ignored
  submit(ctx, s, 'a', [0, 0, 1, 2]);
  submit(ctx, s, 'a', [0, 1, 2]);
  submit(ctx, s, 'a', [0, 1, null, 2]);
  submit(ctx, s, 'a', [0, 1, 2, 9]);
  act(ctx, s, 'a', { type: 'submit', order: 'x' });
  submit(ctx, s, 'z', s.correct);
  act(ctx, s, 'a', { type: 'submit', order: s.correct, round: 7 }); // an old round
  expect(Object.keys(s.subs)).toEqual([]);

  ctx.now += 10_000; // a: perfect with 35 s of 45 left → +4 +3 +2
  submit(ctx, s, 'a', s.correct);
  submit(ctx, s, 'a', [...s.correct].reverse()); // no change after confirming
  arrange(ctx, s, 'a', [null, null, null, null]);
  expect(s.subs.a.order).toEqual(s.correct);
  expect(tartib.turnOf!(s)).toEqual(['b', 'c']);
  v = view(ctx, s, 'b');
  expect(v.submitted).toEqual(['a']);
  expect(v.mine).toBeNull();
  expect(view(ctx, s, 'a').mine).toEqual(s.correct);

  ctx.now += 20_000; // b: two swapped after 30 s → 2 points
  const swapped = s.correct.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  submit(ctx, s, 'b', swapped);
  expect(s.phase).toBe('play');
  submit(ctx, s, 'c', [...s.correct].reverse());
  expect(s.phase).toBe('reveal');

  v = view(ctx, s, 'a');
  expect(v.answer!.map((x) => x.card)).toEqual(s.correct);
  const years = v.answer!.map((x) => x.year);
  expect(years).toEqual([...years].sort((x, y) => x - y));
  const by = (id: string) => v.results!.find((r) => r.id === id)!;
  expect(by('a')).toMatchObject({ right: 4, perfect: true, speed: 2, points: 9, sent: true, ms: 10_000 });
  expect(by('b')).toMatchObject({ right: 2, perfect: false, speed: 0, points: 2, sent: true });
  expect(by('c').right).toBe(0);
  expect(s.scores).toEqual({ a: 9, b: 2, c: 0 });
  expect(v.timerTotal).toBe(TARTIB_REVEAL_MS);
  expect(tartib.turnOf!(s)).toEqual([]);

  // only the host's «next» (hostOnly) or the clock moves on
  expect(tartib.hostOnly).toContain('next');
  ctx.now += TARTIB_REVEAL_MS;
  tartib.tick!(ctx, s);
  expect(s.phase).toBe('play');
  expect(s.round).toBe(1);
  expect(view(ctx, s, 'a').mine).toBeNull();
  expect(view(ctx, s, 'a').draft).toBeNull();
});

test('timeout: unconfirmed drafts count the cards already in their right slots (no speed bonus)', () => {
  const ctx = fakeCtx();
  const s = tartib.start(ctx, ['a', 'b', 'c', 'd'], settings({ seconds: 30 })) as TartibState;
  const [c0, c1, c2, c3] = s.correct;
  arrange(ctx, s, 'a', [c0, null, null, c3]); // two right, two empty
  arrange(ctx, s, 'b', [c0, c1, c2, c3]); // complete and right, never confirmed
  arrange(ctx, s, 'c', [c1, c0, null, null]); // nothing right
  arrange(ctx, s, 'c', [c1, c1, null, null]); // invalid: ignored
  expect(s.drafts.c).toEqual([c1, c0, null, null]);
  expect(view(ctx, s, 'a').draft).toEqual([c0, null, null, c3]);
  expect(view(ctx, s, 'b').draft).toEqual([c0, c1, c2, c3]);
  ctx.now += 30_000;
  tartib.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  const v = view(ctx, s, 'a');
  const by = (id: string) => v.results!.find((r) => r.id === id)!;
  expect(by('a')).toMatchObject({ right: 2, points: 2, sent: false, perfect: false });
  expect(by('b')).toMatchObject({ right: 4, points: 7, sent: false, perfect: true, speed: 0 });
  expect(by('c')).toMatchObject({ right: 0, points: 0, sent: false });
  expect(by('d')).toMatchObject({ order: null, points: 0, sent: false });
  expect(scoreOf(s, 'd').order).toBeNull();
});

test('no leak: before the reveal the view has no years, no right order and nobody else’s order', () => {
  const ctx = fakeCtx();
  const s = tartib.start(ctx, ['a', 'b'], settings({ topic: 'islam' })) as TartibState;
  arrange(ctx, s, 'b', [s.correct[0], null, null, null]);
  submit(ctx, s, 'a', s.correct);
  const v = view(ctx, s, 'b');
  const json = JSON.stringify(v);
  expect(json).not.toContain('year');
  expect(json).not.toContain('hijri');
  expect(json).not.toContain(s.cards[0].id);
  for (const c of s.cards) expect(Object.keys(v.cards[s.cards.indexOf(c)]).sort()).toEqual(['cat', 'text']);
  expect(v.answer).toBeNull();
  expect(v.results).toBeNull();
  expect(v.mine).toBeNull(); // b has not confirmed
  expect(v.draft).toEqual([s.correct[0], null, null, null]); // b's own draft only
  expect(view(ctx, s, 'a').draft).toEqual(s.correct);
  expect(JSON.stringify(view(ctx, s, 'b'))).not.toContain(JSON.stringify(s.correct)); // a's order stays hidden
  // the cards are not dealt in chronological order
  expect(s.correct).not.toEqual([...s.cards.keys()]);
  // once revealed, the years come with the Hijri year for Islamic history
  submit(ctx, s, 'b', s.correct);
  const r = view(ctx, s, 'b');
  expect(r.answer!.every((x) => typeof x.year === 'number')).toBe(true);
  expect(r.answer!.some((x) => x.hijri !== null)).toBe(true);
});

test('voice: the round start, perfect orders, the winner (no hidden information)', () => {
  const ctx = fakeCtx();
  const s = tartib.start(ctx, ['a', 'b'], settings({ rounds: 5 })) as TartibState;
  expect(ctx.voices.at(-1)).toContain('رَتِّبُوا');
  submit(ctx, s, 'a', s.correct);
  submit(ctx, s, 'b', [...s.correct].reverse());
  expect(ctx.voices.at(-1)).toBe('تَرْتِيبٌ كَامِلٌ لِاسم-a');
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: expert orders far-apart dates right, swaps only close ones; easy mixes up more', () => {
  const rnd = seeded(11);
  const rate = (level: BotLevel, dl: 'easy' | 'hard') => {
    let perfect = 0;
    for (let k = 0; k < 300; k++) {
      const set = dealRound(topicPool('mix'), LEVEL_CARDS[dl], dl, rnd);
      const { cards, correct } = shuffleCards(set, rnd);
      const o = botOrder(cards, level, rnd);
      expect([...o].sort()).toEqual([...cards.keys()]);
      if (tartibRight(o, correct) === cards.length) perfect++;
    }
    return perfect / 300;
  };
  const expertEasy = rate('expert', 'easy');
  const expertHard = rate('expert', 'hard');
  const easyHard = rate('easy', 'hard');
  expect(expertEasy).toBeGreaterThan(0.95);
  expect(expertHard).toBeLessThan(0.9);
  expect(expertHard).toBeGreaterThan(easyHard + 0.15);
  expect(rate('easy', 'easy')).toBeLessThan(expertEasy);
});

test('bots: human-like time, slower when weaker, never past the timer', () => {
  const cards = TARTIB_ITEMS.slice(0, 5);
  const avg = (level: BotLevel) => {
    let t = 0;
    for (let k = 0; k < 100; k++) t += botDelay(cards, level, 45_000);
    return t / 100;
  };
  for (const level of ['easy', 'smart', 'expert'] as const) {
    for (let k = 0; k < 50; k++) {
      const d = botDelay(cards, level, 30_000);
      expect(d).toBeGreaterThanOrEqual(2500);
      expect(d).toBeLessThan(30_000);
    }
  }
  expect(avg('expert')).toBeGreaterThan(6000);
  expect(avg('easy')).toBeGreaterThan(avg('expert'));
});

test('bots: a full game with bots ends with a podium; the expert beats the easy bot over many games', () => {
  let expertWins = 0;
  let easyWins = 0;
  for (let g = 0; g < 12; g++) {
    for (const level of ['expert', 'easy'] as const) {
      const ctx = fakeCtx(['b1', 'b2'], level);
      const s = tartib.start(ctx, ['b1', 'b2'], settings({ rounds: 5, seconds: 45 })) as TartibState;
      runBots(ctx, s, ['b1', 'b2']);
      expect(s.phase).toBe('final');
      const res = tartib.result!(s)!;
      expect(res.places.flat().sort()).toEqual(['b1', 'b2']);
      const total = s.scores.b1 + s.scores.b2;
      if (level === 'expert') expertWins += total;
      else easyWins += total;
    }
  }
  expect(expertWins).toBeGreaterThan(easyWins);
});

test('bots: a person and a bot; the bot never waits for the person, the person gets the full timer', () => {
  const ctx = fakeCtx(['bot1'], 'smart');
  const s = tartib.start(ctx, ['me', 'bot1'], settings({ seconds: 30 })) as TartibState;
  runBots(ctx, s, ['bot1'], () => !!s.subs.bot1);
  expect(s.phase).toBe('play');
  expect(ctx.now - s.startedAt).toBeLessThan(30_000);
  submit(ctx, s, 'me', s.correct);
  expect(s.phase).toBe('reveal');
});

/* ------------------------------------------------------------------ */
/* Leaving, settings, result                                           */
/* ------------------------------------------------------------------ */

test('leaving: the round goes on without them; offline players do not hold up the reveal; the last one leaving ends it', () => {
  const ctx = fakeCtx();
  const s = tartib.start(ctx, ['a', 'b', 'c'], settings()) as TartibState;
  submit(ctx, s, 'a', s.correct);
  ctx.offline.add('c'); // away: not waited for
  tartib.onLeave!(ctx, s, 'b');
  expect(s.participants).toEqual(['a', 'c']);
  expect(s.scores.b).toBeUndefined();
  expect(s.phase).toBe('reveal');
  expect(s.results!.map((r) => r.id)).toEqual(['a', 'c']);
  tartib.onLeave!(ctx, s, 'c');
  expect(s.results!.map((r) => r.id)).toEqual(['a']);
  tartib.onLeave!(ctx, s, 'zz'); // not playing: nothing
  tartib.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
  expect(tartib.result!(s)).toBeNull();
});

test('settings: sanitized at start and patched to the allowed values only', () => {
  expect(sanitizeTartib({})).toEqual({ rounds: 8, seconds: 45, topic: 'mix' });
  expect(sanitizeTartib({ rounds: 1, seconds: 999, topic: 'nope' } as never)).toEqual({ rounds: 5, seconds: 60, topic: 'mix' });
  expect(sanitizeTartib({ rounds: 9, seconds: 40, topic: 'sport' })).toEqual({ rounds: 8, seconds: 45, topic: 'sport' });
  const st = sanitizeTartib({});
  tartib.patchSettings!(st, { rounds: 10, seconds: 30, topic: 'islam' });
  expect(st).toEqual({ rounds: 10, seconds: 30, topic: 'islam' });
  tartib.patchSettings!(st, { rounds: 'x', seconds: null, topic: 'other' });
  expect(st).toEqual({ rounds: 10, seconds: 30, topic: 'islam' });
  tartib.patchSettings!(st, { rounds: 6, seconds: 50 });
  expect(st).toEqual({ rounds: 5, seconds: 45, topic: 'islam' });
  const ctx = fakeCtx();
  const s = tartib.start(ctx, ['a'], { rounds: 99, seconds: -5, topic: 'zz' } as never) as TartibState;
  expect(s.levels).toHaveLength(10);
  expect(s.timerTotal).toBe(30_000);
  expect(s.settings.topic).toBe('mix');
});

test('result: places by total score, ties share a place, null until the end', () => {
  const ctx = fakeCtx();
  const s = tartib.start(ctx, ['a', 'b', 'c'], settings({ rounds: 5 })) as TartibState;
  expect(tartib.result!(s)).toBeNull();
  for (let r = 0; r < 5; r++) {
    submit(ctx, s, 'a', s.correct);
    submit(ctx, s, 'b', s.correct);
    submit(ctx, s, 'c', [...s.correct].reverse());
    act(ctx, s, 'a', { type: 'next' });
  }
  expect(s.phase).toBe('final');
  expect(s.scores.a).toBe(s.scores.b);
  expect(s.scores.a).toBeGreaterThan(s.scores.c);
  expect(tartib.result!(s)).toEqual({ places: [['a', 'b'], ['c']] });
  expect(ctx.voices.at(-1)).toBeTruthy();
});
