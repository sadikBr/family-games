/**
 * «أكبر أم أصغر؟» — the content (units by measure, positive values, the political rules, enough fair
 * pairs per topic), the pairing rules (same group, never closer than 10%, rising difficulty), scoring and
 * streaks, timeouts, no leak of the values before the reveal, bots, leaving, settings.
 */
import { expect, test } from 'bun:test';

import {
  AKBAR_POINTS,
  AKBAR_SPEED_POINTS,
  AKBAR_TOPICS,
  formatValue,
  rightPoints,
  speedBonus,
  streakMult,
  type AkbarSettings,
  type AkbarView,
} from '../src/shared/games/akbar';
import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { AKBAR_GROUPS, AKBAR_ITEMS, MEASURE_UNITS } from './akbar-content';
import { AKBAR_MIN_RATIO, AKBAR_MIN_YEARS, dealPairs, fairPair, groupPairs, ratioOf, targetRatio, topicGroups, winnerSide } from './akbar-pairs';
import { AKBAR_BOT_RIGHT, AKBAR_REVEAL_MS, akbar, botAnswer, botRightChance, sanitizeAkbar, scoreAnswer, startAkbar, type AkbarState } from './games/akbar';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';
import { KNOW_VOICE, voiceFastestRight } from './voice-calls-knowledge';

const P = ['a', 'b', 'c'];
const view = (ctx: TestCtx, s: AkbarState, me: string) => akbar.view(ctx, s, me) as AkbarView;
const tap = (ctx: TestCtx, s: AkbarState, by: string, choice: unknown) => akbar.act(ctx, s, by, { type: 'answer', round: s.round + 1, choice });
const right = (s: AkbarState) => s.qs[s.round].correct;
const wrong = (s: AkbarState) => (s.qs[s.round].correct === 0 ? 1 : 0);

function start(ctx: TestCtx, ids = P, rounds = 10, seconds = 10, topic: AkbarState['settings']['topic'] = 'mix', seed = 1) {
  return startAkbar(ctx, ids, { rounds, seconds, topic }, seeded(seed));
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('akbar content: 350+ items, unique ids, Arabic names, positive values, one name once per group', () => {
  expect(AKBAR_ITEMS.length).toBeGreaterThanOrEqual(350);
  expect(new Set(AKBAR_ITEMS.map((i) => i.id)).size).toBe(AKBAR_ITEMS.length);
  expect(new Set(AKBAR_GROUPS.map((g) => g.id)).size).toBe(AKBAR_GROUPS.length);
  for (const g of AKBAR_GROUPS) {
    expect(g.items.length).toBeGreaterThanOrEqual(6);
    expect(new Set(g.items.map((i) => i.name)).size).toBe(g.items.length);
    expect(g.ask.endsWith('؟')).toBe(true);
    for (const it of g.items) {
      expect(it.group).toBe(g.id);
      expect(Number.isFinite(it.value)).toBe(true);
      expect(it.value).toBeGreaterThan(0);
      expect(it.name.trim()).toBe(it.name);
      // Arabic, no stray Latin letters
      expect(/[ء-ي]/.test(it.name)).toBe(true);
      expect(/[A-Za-z]/.test(it.name)).toBe(false);
    }
  }
});

test('akbar content: the units are the ones of the measure; years are AD years, rates are whole', () => {
  for (const g of AKBAR_GROUPS) {
    expect(MEASURE_UNITS[g.measure]).toContain(g.unit);
    expect(g.minRatio).toBeGreaterThanOrEqual(AKBAR_MIN_RATIO);
    if (g.measure === 'year') {
      expect(g.unit).toBe('year');
      expect(g.older).toBe(true);
      for (const it of g.items) {
        expect(Number.isInteger(it.value)).toBe(true);
        expect(it.value).toBeLessThanOrEqual(2026);
      }
    } else expect(g.older).toBeFalsy();
    if (g.unit === 'players' || g.unit === 'count' || g.unit === 'seats') for (const it of g.items) expect(Number.isInteger(it.value)).toBe(true);
    if (g.measure === 'population' || g.id.startsWith('capacity') || g.id.startsWith('record')) expect(g.asOf).toBeGreaterThan(2020);
  }
  // one unit per measure group, the same way everywhere: every population in «نسمة», every area in km²
  expect(new Set(AKBAR_GROUPS.filter((g) => g.measure === 'population').map((g) => g.unit))).toEqual(new Set(['people']));
  expect(new Set(AKBAR_GROUPS.filter((g) => g.measure === 'area').map((g) => g.unit))).toEqual(new Set(['km2']));
});

test('akbar content: the owner’s rules — Palestine in, Israel never, Morocco with its Sahara', () => {
  const names = AKBAR_ITEMS.map((i) => i.name).join(' | ');
  expect(names).not.toContain('إسرائيل');
  expect(names).not.toContain('الصحراء الغربية');
  expect(names).toContain('فلسطين');
  const area = AKBAR_GROUPS.find((g) => g.id === 'area-country')!;
  expect(area.items.find((i) => i.name === 'المغرب')?.value).toBe(710_850);
  expect(area.items.find((i) => i.name === 'فلسطين')).toBeDefined();
  // the Sahara's cities are Moroccan cities
  const cities = AKBAR_GROUPS.find((g) => g.id === 'pop-morocco-city')!.items.map((i) => i.name);
  expect(cities).toContain('العيون');
  expect(cities).toContain('الداخلة');
  // Morocco's population is its 2024 census
  expect(AKBAR_GROUPS.find((g) => g.id === 'pop-country')!.items.find((i) => i.name === 'المغرب')?.value).toBe(36_800_000);
});

test('akbar content: some well-known figures', () => {
  const v = (gid: string, name: string) => AKBAR_GROUPS.find((g) => g.id === gid)!.items.find((i) => i.name === name)!.value;
  expect(v('height-mountain', 'جبل إيفرست')).toBe(8849);
  expect(v('height-mountain', 'جبل توبقال')).toBe(4167);
  expect(v('height-building', 'برج خليفة')).toBe(828);
  expect(v('height-building', 'صومعة مسجد الحسن الثاني')).toBe(210);
  expect(v('length-river', 'نهر النيل')).toBe(6650);
  expect(v('year-building', 'جامع القرويين في فاس')).toBe(859);
  expect(v('speed-animal', 'الفهد')).toBe(110);
  expect(v('count-players', 'كرة القدم')).toBe(11);
  expect(v('year-event', 'كأس العالم لكرة القدم')).toBe(1930);
  expect(v('atomic', 'الذهب')).toBe(79);
});

test('akbar content: every topic has groups and plenty of fair pairs at every difficulty', () => {
  for (const topic of AKBAR_TOPICS) {
    const groups = topicGroups(topic);
    expect(groups.length).toBeGreaterThanOrEqual(topic === 'mix' ? 30 : 3);
    const pairs = groups.flatMap((g) => groupPairs(g));
    expect(pairs.length).toBeGreaterThan(300);
    // easy (3× or more), medium (1.5–3×) and hard (under 1.5×) pairs all exist
    expect(pairs.filter((p) => p.ratio >= 3).length).toBeGreaterThan(30);
    expect(pairs.filter((p) => p.ratio >= 1.5 && p.ratio < 3).length).toBeGreaterThan(30);
    expect(pairs.filter((p) => p.ratio < 1.5).length).toBeGreaterThan(20);
    // and a 20-question game never runs out (20 distinct pairs, no item twice)
    for (let seed = 1; seed <= 5; seed++) expect(dealPairs(topic, 20, seeded(seed)).length).toBe(20);
  }
});

test('akbar content: no near-equal pair is ever asked', () => {
  for (const g of AKBAR_GROUPS) {
    for (const p of groupPairs(g)) {
      expect(p.a.group).toBe(g.id);
      expect(p.b.group).toBe(g.id);
      expect(p.ratio).toBeGreaterThanOrEqual(Math.max(AKBAR_MIN_RATIO, g.minRatio));
      if (g.older) expect(Math.abs(p.a.value - p.b.value)).toBeGreaterThanOrEqual(AKBAR_MIN_YEARS);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Pairing                                                             */
/* ------------------------------------------------------------------ */

test('akbar pairs: ratios, the years by their age, the winner side', () => {
  const pop = AKBAR_GROUPS.find((g) => g.id === 'pop-country')!;
  const years = AKBAR_GROUPS.find((g) => g.id === 'year-building')!;
  expect(ratioOf(pop, 100, 200)).toBe(2);
  expect(fairPair(pop, 100, 105)).toBe(false);
  expect(fairPair(pop, 100, 109)).toBe(false); // under the group's 15%
  expect(fairPair(pop, 100, 120)).toBe(true);
  // 1889 against 1931: 137 years against 95
  expect(ratioOf(years, 1889, 1931)).toBeCloseTo(137 / 95, 6);
  expect(fairPair(years, 2020, 2022)).toBe(false); // ages 6 and 4, but only two years apart
  expect(fairPair(years, 1889, 1931)).toBe(true);
  expect(winnerSide(pop, 5, 9)).toBe(1);
  expect(winnerSide(pop, 9, 5)).toBe(0);
  expect(winnerSide(years, 1889, 1931)).toBe(0); // the older one
  expect(winnerSide(years, 1931, 1889)).toBe(1);
});

test('akbar pairs: a game uses each item once, same-group pairs, spread groups, rising difficulty', () => {
  let early = 0;
  let late = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const qs = dealPairs('mix', 15, seeded(seed));
    expect(qs.length).toBe(15);
    const ids = qs.flatMap((q) => [q.a.id, q.b.id]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of qs) {
      expect(q.a.group).toBe(q.group.id);
      expect(q.b.group).toBe(q.group.id);
      expect(fairPair(q.group, q.a.value, q.b.value)).toBe(true);
    }
    // never the same group twice in a row, and no group more than twice in a 15-question mix
    for (let i = 1; i < qs.length; i++) expect(qs[i].group.id).not.toBe(qs[i - 1].group.id);
    const counts = new Map<string, number>();
    for (const q of qs) counts.set(q.group.id, (counts.get(q.group.id) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBe(1);
    early += qs.slice(0, 5).reduce((x, q) => x + Math.log(q.ratio), 0) / 5;
    late += qs.slice(-5).reduce((x, q) => x + Math.log(q.ratio), 0) / 5;
  }
  // the first questions are far apart, the last ones close
  expect(Math.exp(early / 40)).toBeGreaterThan(2.2);
  expect(Math.exp(late / 40)).toBeLessThan(1.6);
  expect(targetRatio(0, 10)).toBeCloseTo(4, 6);
  expect(targetRatio(9, 10)).toBeCloseTo(1.15, 6);
  // sides are shuffled: the right answer isn't always the first card
  const sides = dealPairs('mix', 20, seeded(3)).map((q) => winnerSide(q.group, q.a.value, q.b.value));
  expect(sides).toContain(0);
  expect(sides).toContain(1);
});

test('akbar pairs: a single topic stays in its topic', () => {
  for (const topic of AKBAR_TOPICS.filter((t) => t !== 'mix')) {
    const qs = dealPairs(topic, 20, seeded(7));
    for (const q of qs) expect(q.group.topic).toBe(topic);
  }
});

test('akbar pairs: the room remembers what it has seen; the next game shows other items first', () => {
  const ctx = fakeCtx();
  const s1 = start(ctx, P, 10, 10, 'animals', 1);
  const s2 = start(ctx, P, 10, 10, 'animals', 1);
  const ids = (s: AkbarState) => s.qs.flatMap((q) => [q.a.id, q.b.id]);
  const shared = ids(s1).filter((id) => ids(s2).includes(id));
  expect(shared.length).toBeLessThan(6);
});

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

test('akbar scoring: 10 + speed, ×1.5 from 3 in a row, ×2 from 5, a miss breaks the streak', () => {
  expect(AKBAR_POINTS).toBe(10);
  expect(speedBonus(0, 10000)).toBe(AKBAR_SPEED_POINTS);
  expect(speedBonus(10000, 10000)).toBe(0);
  expect(speedBonus(5000, 10000)).toBe(3); // 2.5 rounds up
  expect(speedBonus(-5, 10000)).toBe(5);
  expect([1, 2, 3, 4, 5, 9].map(streakMult)).toEqual([1, 1, 1.5, 1.5, 2, 2]);
  expect(rightPoints(0, 10000, 1)).toBe(15);
  expect(rightPoints(0, 10000, 3)).toBe(23); // 22.5
  expect(rightPoints(0, 10000, 5)).toBe(30);
  expect(rightPoints(10000, 10000, 5)).toBe(20);
  expect(scoreAnswer(0, 1000, 0, 10000, 2)).toMatchObject({ correct: true, streak: 3, mult: 1.5, speed: 5, points: 23 });
  expect(scoreAnswer(1, 1000, 0, 10000, 7)).toMatchObject({ correct: false, streak: 0, mult: 1, points: 0 });
  expect(scoreAnswer(null, null, 0, 10000, 4)).toMatchObject({ choice: null, correct: false, streak: 0, points: 0 });
});

test('akbar: a whole game — streaks build and break, scores add up, the podium places', () => {
  const ctx = fakeCtx();
  const s = start(ctx, ['a', 'b'], 10, 10);
  const plan = ['r', 'r', 'r', 'r', 'r', 'w', 'r', 'r', 'r', 'n'];
  let expectA = 0;
  let streak = 0;
  for (let r = 0; r < 10; r++) {
    // a: instant taps; b: always wrong
    const p = plan[r];
    if (p !== 'n') tap(ctx, s, 'a', p === 'r' ? right(s) : wrong(s));
    tap(ctx, s, 'b', wrong(s));
    if (p === 'n') {
      ctx.now = s.endsAt!;
      akbar.tick!(ctx, s);
    }
    expect(s.phase).toBe('reveal');
    streak = p === 'r' ? streak + 1 : 0;
    expectA += p === 'r' ? Math.round(15 * streakMult(streak)) : 0;
    expect(s.streaks.a).toBe(streak);
    expect(s.scores.a).toBe(expectA);
    expect(s.streaks.b).toBe(0);
    expect(akbar.result!(s)).toBeNull();
    ctx.now = s.endsAt!;
    akbar.tick!(ctx, s);
  }
  expect(s.phase).toBe('final');
  expect(s.best.a).toBe(5);
  expect(s.rights.a).toBe(8);
  expect(s.scores.b).toBe(0);
  // 15 + 15 + 23 + 23 + 30, then 15 + 15 + 23
  expect(s.scores.a).toBe(15 + 15 + 23 + 23 + 30 + 15 + 15 + 23);
  expect(akbar.result!(s)).toEqual({ places: [['a'], ['b']] });
  expect(ctx.fxs.some(([k, t]) => k === 'win' && t === 'a')).toBe(true);
});

test('akbar: the speed bonus follows the time of the tap', () => {
  const ctx = fakeCtx();
  const s = start(ctx, ['a', 'b'], 10, 10);
  tap(ctx, s, 'a', right(s));
  ctx.now += 6000;
  tap(ctx, s, 'b', right(s));
  const by = Object.fromEntries(s.results!.map((r) => [r.id, r]));
  expect(by.a).toMatchObject({ speed: 5, points: 15, ms: 0 });
  expect(by.b).toMatchObject({ speed: 2, points: 12, ms: 6000 });
  expect(ctx.said[ctx.said.length - 1]).toMatchObject({ text: 'أسرع إجابة صحيحة: a', by: 'a', voice: voiceFastestRight('a') });
});

/* ------------------------------------------------------------------ */
/* Timeouts, taps, leaks                                               */
/* ------------------------------------------------------------------ */

test('akbar: the values never reach a phone before the reveal', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  const q = s.qs[0];
  tap(ctx, s, 'a', 0);
  for (const me of P) {
    const v = view(ctx, s, me);
    expect(v.phase).toBe('ask');
    expect(v.correct).toBeNull();
    expect(v.values).toBeNull();
    expect(v.bars).toBeNull();
    expect(v.unit).toBeNull();
    expect(v.results).toBeNull();
    const json = JSON.stringify(v);
    // no number of the view (the timer, the round and the names aside) is one of the two values
    const bare = JSON.stringify({ ...v, endsAt: 0, timerTotal: 0, round: 0, rounds: 0, names: ['', ''] });
    for (const val of [q.a.value, q.b.value]) {
      expect(json.includes(formatValue(val, q.group.unit))).toBe(false);
      expect(new RegExp(`(^|[^0-9.])${String(val).replace('.', '\\.')}([^0-9]|$)`).test(bare)).toBe(false);
    }
    expect(v.names).toEqual([q.a.name, q.b.name]);
  }
  // my own tap is mine only
  expect(view(ctx, s, 'a').mine).toBe(0);
  expect(view(ctx, s, 'b').mine).toBeNull();
  expect(view(ctx, s, 'b').answered).toEqual(['a']);
  // after the reveal: both values, the right side, the bars (the bigger one = 1)
  tap(ctx, s, 'b', 1);
  tap(ctx, s, 'c', 1);
  const v = view(ctx, s, 'c');
  expect(v.phase).toBe('reveal');
  expect(v.values).toEqual([q.a.value, q.b.value]);
  expect(v.correct).toBe(q.correct);
  expect(Math.max(...v.bars!)).toBe(1);
  expect(v.unit).toBe(q.group.unit);
});

test('akbar: taps — one each, only 0 or 1, only this round, only in time, only players', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  tap(ctx, s, 'a', 2);
  tap(ctx, s, 'a', '0');
  tap(ctx, s, 'a', null);
  expect(s.answers.a).toBeUndefined();
  tap(ctx, s, 'a', 1);
  tap(ctx, s, 'a', 0); // no second tap
  expect(s.answers.a.choice).toBe(1);
  tap(ctx, s, 'zz', 0);
  expect(s.answers.zz).toBeUndefined();
  akbar.act(ctx, s, 'b', { type: 'answer', round: 2, choice: 0 });
  expect(s.answers.b).toBeUndefined();
  ctx.now = s.endsAt! + 1; // too late (the tick hasn't run yet)
  tap(ctx, s, 'b', 0);
  expect(s.answers.b).toBeUndefined();
});

test('akbar: the timer reveals with whoever answered; a silent player loses the streak; the host skips', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  tap(ctx, s, 'a', right(s));
  tap(ctx, s, 'b', right(s));
  tap(ctx, s, 'c', right(s));
  ctx.now = s.endsAt!;
  akbar.tick!(ctx, s);
  expect(s.streaks).toEqual({ a: 1, b: 1, c: 1 });
  tap(ctx, s, 'b', right(s));
  ctx.now = s.endsAt! - 1;
  expect(akbar.tick!(ctx, s)).toBe(false);
  ctx.now = s.endsAt!;
  expect(akbar.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('reveal');
  expect(s.results!.find((r) => r.id === 'a')).toMatchObject({ choice: null, points: 0, streak: 0 });
  expect(s.streaks).toEqual({ a: 0, b: 2, c: 0 });
  expect(akbar.hostOnly).toContain('next');
  akbar.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('ask');
  expect(s.round).toBe(2);
  // nobody right: «لا إجابة صحيحة»
  ctx.now = s.endsAt!;
  akbar.tick!(ctx, s);
  expect(ctx.said[ctx.said.length - 1].voice).toBe(KNOW_VOICE.noRight);
  // the reveal lasts at the room pace
  const ctx2 = fakeCtx();
  ctx2.pace = () => 1.5;
  const s2 = start(ctx2, ['a']);
  tap(ctx2, s2, 'a', 0);
  expect(s2.endsAt).toBe(ctx2.now + AKBAR_REVEAL_MS * 1.5);
});

/* ------------------------------------------------------------------ */
/* Leaving, settings                                                   */
/* ------------------------------------------------------------------ */

test('akbar: someone leaving — the question goes on without them; an offline player isn’t waited for', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  tap(ctx, s, 'a', 0);
  tap(ctx, s, 'b', 1);
  akbar.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.participants).toEqual(['a', 'b']);
  expect(s.scores.c).toBeUndefined();
  expect(s.streaks.c).toBeUndefined();
  expect(s.results!.map((r) => r.id)).toEqual(['a', 'b']);
  ctx.now = s.endsAt!;
  akbar.tick!(ctx, s);
  ctx.offline.add('b');
  tap(ctx, s, 'a', 0);
  expect(s.phase).toBe('reveal');
  // everyone gone: the game ends without a result
  akbar.onLeave!(ctx, s, 'a');
  akbar.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('final');
  expect(akbar.result!(s)).toBeNull();
});

test('akbar: settings — the defaults are valid, odd values snap, unknown topics are refused', () => {
  expect(sanitizeAkbar(DEFAULT_SETTINGS.akbar)).toEqual(DEFAULT_SETTINGS.akbar);
  expect(sanitizeAkbar(undefined)).toEqual({ rounds: 10, seconds: 15, topic: 'mix' });
  expect(sanitizeAkbar({ rounds: 18, seconds: 99, topic: 'cats' as never })).toEqual({ rounds: 20, seconds: 15, topic: 'mix' });
  expect(sanitizeAkbar({ rounds: 'x' as never, seconds: 3, topic: 'sport' })).toEqual({ rounds: 10, seconds: 10, topic: 'sport' });
  const st: AkbarSettings = { rounds: 10, seconds: 15, topic: 'mix' };
  akbar.patchSettings!(st, { rounds: 14, seconds: 11, topic: 'animals' });
  expect(st).toEqual({ rounds: 15, seconds: 10, topic: 'animals' });
  akbar.patchSettings!(st, { rounds: 'many', seconds: null, topic: 'nope' });
  expect(st).toEqual({ rounds: 15, seconds: 10, topic: 'animals' });
  for (const rounds of [10, 15, 20]) {
    for (const topic of AKBAR_TOPICS) {
      const ctx = fakeCtx();
      const s = start(ctx, P, rounds, 15, topic);
      expect(s.qs.length).toBe(rounds);
      expect(view(ctx, s, 'a').rounds).toBe(rounds);
      expect(view(ctx, s, 'a').timerTotal).toBe(15000);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('akbar bots: right more often for far-apart values and for stronger bots; a human pace', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    expect(botRightChance(level, 1.1)).toBeCloseTo(AKBAR_BOT_RIGHT[level][0], 6);
    expect(botRightChance(level, 10)).toBeCloseTo(AKBAR_BOT_RIGHT[level][1], 6);
    expect(botRightChance(level, 2)).toBeGreaterThan(botRightChance(level, 1.2));
  }
  expect(botRightChance('expert', 1.5)).toBeGreaterThan(botRightChance('smart', 1.5));
  expect(botRightChance('smart', 1.5)).toBeGreaterThan(botRightChance('easy', 1.5));
  const rnd = seeded(9);
  const rate = (level: 'easy' | 'smart' | 'expert', close: boolean) => {
    const qs = [1, 2, 3, 4, 5].flatMap((k) => dealPairs('mix', 20, seeded(k))).map((p) => ({ ...p, correct: winnerSide(p.group, p.a.value, p.b.value) }));
    const pool = qs.filter((q) => (close ? q.ratio < 1.5 : q.ratio > 2.5));
    let ok = 0;
    let n = 0;
    for (let k = 0; k < 60; k++) {
      for (const q of pool) {
        const { choice, delay } = botAnswer(level, q, 10, rnd);
        expect(delay).toBeGreaterThan(1500);
        expect(delay).toBeLessThan(10000);
        ok += choice === q.correct ? 1 : 0;
        n++;
      }
    }
    return ok / n;
  };
  const e = { easy: rate('easy', true), smart: rate('smart', true), expert: rate('expert', true) };
  expect(e.expert).toBeGreaterThan(e.smart);
  expect(e.smart).toBeGreaterThan(e.easy);
  expect(e.expert).toBeLessThan(0.95); // an expert isn't perfect on close pairs
  expect(rate('easy', false)).toBeGreaterThan(e.easy);
});

test('akbar bots: at every level they play a whole game; nothing leaks before a reveal', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const bots = ['b1', 'b2', 'b3'];
    const ctx = fakeCtx(bots, level);
    const s = startAkbar(ctx, bots, { rounds: 15, seconds: 10, topic: 'mix' }, seeded(11));
    playOut(akbar as never, ctx, s, bots, (st) => {
      if (st.phase === 'ask') {
        const v = view(ctx, st, 'b1');
        expect(v.values).toBeNull();
        expect(v.correct).toBeNull();
      }
    });
    expect(s.phase).toBe('final');
    expect(s.round).toBe(14);
    expect(Object.values(s.scores).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect(akbar.result!(s)?.places.flat().sort()).toEqual(bots);
    expect(ctx.jobs.length).toBe(45);
  }
});

/* ------------------------------------------------------------------ */
/* Writing the values                                                  */
/* ------------------------------------------------------------------ */

test('akbar: values with their units', () => {
  expect(formatValue(36_800_000, 'people')).toBe('36.8 مليون نسمة');
  expect(formatValue(1_451_000_000, 'people')).toBe('1.45 مليار نسمة');
  expect(formatValue(710_850, 'km2')).toBe('710,850 كم²');
  expect(formatValue(8849, 'm')).toBe('8,849 م');
  expect(formatValue(1889, 'year')).toBe('1889م');
  expect(formatValue(80, 'year')).toBe('80م');
  expect(formatValue(11, 'players')).toBe('11 لاعباً');
  expect(formatValue(5, 'players')).toBe('5 لاعبين');
  expect(formatValue(2, 'players')).toBe('لاعبان');
  expect(formatValue(74.35, 'm')).toBe('74.35 م');
  expect(formatValue(23.77, 'm')).toBe('23.77 م');
  expect(formatValue(57_900_000, 'km')).toBe('57.9 مليون كم');
  expect(formatValue(280, 'days')).toBe('280 يوماً');
  expect(formatValue(9.58, 'm')).toBe('9.58 م');
  expect(formatValue(0.05, 'kmh')).toBe('0.05 كم/س');
  expect(formatValue(2.5, 'years')).toBe('2.5 سنة');
  expect(formatValue(4.24, 'ly')).toBe('4.24 سنة ضوئية');
  expect(formatValue(79, 'count')).toBe('79');
  for (const it of AKBAR_ITEMS) {
    const g = AKBAR_GROUPS.find((x) => x.id === it.group)!;
    const t = formatValue(it.value, g.unit);
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain('NaN');
    expect(t).not.toMatch(/\d\.\d{5,}/);
  }
});
