/**
 * «مكية أم مدنية؟» — the surah data (114 surahs, 6236 verses by the Kufan count, 28 مدنية / 86 مكية as in the
 * Madinah Mushaf's headings, juz' from the standard division, cross-checked with server/quran-data.json),
 * the facts' rules, dealing (no repeats, famous first, scope, kinds), scoring and streaks, the timers, no
 * leak of the answer or the facts before the reveal, bots, leaving, settings.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  MAKKI_DEFAULTS,
  MAKKI_MCQ_EXTRA,
  ayatLabel,
  makkiKinds,
  makkiMult,
  makkiPoints,
  makkiSpeed,
  type MakkiSettings,
  type MakkiView,
} from '../src/shared/games/makki';
import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { AMMA_FIRST, DISPUTED_NOTE, JUZ_STARTS, SURAHS } from './makki-data';
import {
  MAKKI_BOT_RIGHT,
  MAKKI_REVEAL_MS,
  ayatDistractors,
  botAnswer,
  dealQuestions,
  juzDistractors,
  makeQuestion,
  makki,
  sanitizeMakki,
  scoreAnswer,
  startMakki,
  type MakkiState,
} from './games/makki';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';

const P = ['aaaa', 'bbbb', 'cccc'];
const view = (ctx: TestCtx, s: MakkiState, me: string) => makki.view(ctx, s, me) as MakkiView;
const tap = (ctx: TestCtx, s: MakkiState, by: string, choice: unknown) => makki.act(ctx, s, by, { type: 'answer', round: s.round + 1, choice });
const right = (s: MakkiState) => s.qs[s.round].correct;
const wrong = (s: MakkiState) => (s.qs[s.round].correct === 0 ? 1 : 0);
const settings = (p: Partial<MakkiSettings> = {}): MakkiSettings => ({ ...MAKKI_DEFAULTS, ...p });

/* ------------------------------------------------------------------ */
/* The data                                                            */
/* ------------------------------------------------------------------ */

/** The 28 surahs printed «مدنية» in the headings of the Madinah Mushaf (King Fahd Complex, Hafs). */
const MADANI = [2, 3, 4, 5, 8, 9, 13, 22, 24, 33, 47, 48, 49, 55, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 76, 98, 99, 110];

test('makki data: 114 surahs in Mushaf order, distinct names, Arabic only', () => {
  expect(SURAHS.length).toBe(114);
  SURAHS.forEach((x, i) => expect(x.n).toBe(i + 1));
  expect(new Set(SURAHS.map((x) => x.name)).size).toBe(114);
  for (const x of SURAHS) {
    expect(x.name.trim()).toBe(x.name);
    expect(/^[ء-ي ]+$/.test(x.name)).toBe(true);
    expect(x.name.startsWith('سورة')).toBe(false);
  }
  expect(SURAHS[0].name).toBe('الفاتحة');
  expect(SURAHS[113].name).toBe('الناس');
});

test('makki data: 6236 verses by the Kufan count; every surah has 3 to 286', () => {
  expect(SURAHS.reduce((a, x) => a + x.ayat, 0)).toBe(6236);
  for (const x of SURAHS) {
    expect(Number.isInteger(x.ayat)).toBe(true);
    expect(x.ayat).toBeGreaterThanOrEqual(3);
  }
  expect(SURAHS[1].ayat).toBe(286); // البقرة, the longest
  expect(Math.max(...SURAHS.map((x) => x.ayat))).toBe(286);
  expect(Math.min(...SURAHS.map((x) => x.ayat))).toBe(3);
  expect(SURAHS.filter((x) => x.ayat === 3).map((x) => x.n)).toEqual([103, 108, 110]); // العصر، الكوثر، النصر
});

test('makki data: 28 مدنية and 86 مكية, exactly the Madinah Mushaf headings', () => {
  expect(SURAHS.filter((x) => x.madani).length).toBe(28);
  expect(SURAHS.filter((x) => !x.madani).length).toBe(86);
  expect(SURAHS.filter((x) => x.madani).map((x) => x.n)).toEqual(MADANI);
});

test('makki data: the juz’ where each surah begins follows the 30-juz’ division, never going back', () => {
  expect(JUZ_STARTS.length).toBe(30);
  for (let j = 1; j < 30; j++) {
    const [s0, a0] = JUZ_STARTS[j - 1];
    const [s1, a1] = JUZ_STARTS[j];
    expect(s1 > s0 || (s1 === s0 && a1 > a0)).toBe(true);
  }
  for (const [s, a] of JUZ_STARTS) expect(a).toBeLessThanOrEqual(SURAHS[s - 1].ayat);
  for (const x of SURAHS) {
    // the last juz' that starts at or before the surah's first verse
    let juz = 0;
    JUZ_STARTS.forEach(([s, a], i) => {
      if (s < x.n || (s === x.n && a === 1)) juz = i + 1;
    });
    expect(x.juz).toBe(juz);
  }
  for (let i = 1; i < SURAHS.length; i++) expect(SURAHS[i].juz).toBeGreaterThanOrEqual(SURAHS[i - 1].juz);
  // landmarks a family knows
  const juzOf = (n: number) => SURAHS[n - 1].juz;
  expect([juzOf(1), juzOf(2), juzOf(3), juzOf(18), juzOf(36), juzOf(55), juzOf(67), juzOf(78), juzOf(114)]).toEqual([1, 1, 3, 15, 22, 27, 29, 30, 30]);
  // every juz' from 1 to 30 holds the beginning of at least one surah except those that start inside a surah
  expect(new Set(SURAHS.map((x) => x.juz)).size).toBeGreaterThanOrEqual(25);
  expect(SURAHS.filter((x) => x.n >= AMMA_FIRST).every((x) => x.juz === 30)).toBe(true);
  expect(SURAHS.filter((x) => x.n >= AMMA_FIRST).length).toBe(37);
});

test('makki data: names, counts and classification agree with the independent quran-data.json', () => {
  const ref = JSON.parse(readFileSync(new URL('./quran-data.json', import.meta.url), 'utf8')) as { surahs: { n: number; name: string; type: string; count: number }[] };
  // spelling of the hamza and hamzat al-wasl aside (the reference writes «ابراهيم», «سبإ», «الإنفطار»…)
  const bare = (t: string) => t.replace(/[أإآ]/g, 'ا').replace(/[ؤئ]/g, 'ء').replace(/إ$|ء$/g, 'ا').replace(/أ$/, 'ا');
  expect(ref.surahs.length).toBe(114);
  for (const r of ref.surahs) {
    const x = SURAHS[r.n - 1];
    expect(x.ayat).toBe(r.count);
    expect(x.madani).toBe(r.type === 'medinan');
    expect(bare(x.name)).toBe(bare(r.name));
  }
});

test('makki data: facts only of the agreed kind — no virtues, rewards or hadith; disputed ones marked', () => {
  for (const x of SURAHS) {
    expect(x.why).toBeTruthy();
    expect(x.theme).toBeTruthy();
    for (const t of [x.why ?? '', x.theme ?? '']) {
      expect(t.endsWith('.')).toBe(true);
      expect(t.length).toBeLessThan(170);
      expect(/[A-Za-z]/.test(t)).toBe(false);
      for (const bad of ['حديث', 'ثواب', 'أجر', 'من قرأ', 'تعدل', 'فضل قراءتها', 'تنجي', 'تشفع', 'رُوي', 'روي', 'يقال']) expect(t.includes(bad)).toBe(false);
    }
  }
  const disputed = SURAHS.filter((x) => x.disputed).map((x) => x.n);
  expect(disputed).toEqual([1, 13, 22, 55, 61, 64, 76, 83, 97, 98, 99, 108, 112, 113, 114]);
  expect(DISPUTED_NOTE).toBe('على ما في مصحف المدينة؛ وفيها خلاف');
});

/* ------------------------------------------------------------------ */
/* Dealing                                                             */
/* ------------------------------------------------------------------ */

test('makki dealing: no surah twice, famous first, both answers come, the scope is kept', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const qs = dealQuestions(settings({ rounds: 20 }), seeded(seed));
    expect(qs.length).toBe(20);
    expect(new Set(qs.map((q) => q.surah.n)).size).toBe(20);
    const first = qs.slice(0, 6).reduce((a, q) => a + q.surah.fame, 0) / 6;
    const last = qs.slice(-6).reduce((a, q) => a + q.surah.fame, 0) / 6;
    expect(first).toBeLessThan(last);
    const amma = dealQuestions(settings({ rounds: 20, scope: 'amma' }), seeded(seed));
    expect(amma.every((q) => q.surah.n >= AMMA_FIRST)).toBe(true);
    expect(new Set(amma.map((q) => q.surah.n)).size).toBe(20);
  }
  // across many games, Madani surahs make a fair share of «مكية أم مدنية»
  let madani = 0;
  let total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    for (const q of dealQuestions(settings({ rounds: 15 }), seeded(seed))) {
      total++;
      if (q.surah.madani) madani++;
    }
  }
  expect(madani / total).toBeGreaterThan(0.25);
  expect(madani / total).toBeLessThan(0.6);
});

test('makki dealing: the kinds of each mode; جزء عمّ asks the verses instead of the juz’', () => {
  expect(makkiKinds('type', 'all')).toEqual(['type']);
  expect(makkiKinds('juz', 'all')).toEqual(['juz']);
  expect(makkiKinds('juz', 'amma')).toEqual(['ayat']);
  expect(makkiKinds('mix', 'all')).toEqual(['type', 'juz', 'ayat']);
  expect(makkiKinds('mix', 'amma')).toEqual(['type', 'ayat']);
  const kinds = new Set(Array.from({ length: 10 }, (_, k) => dealQuestions(settings({ rounds: 20, mode: 'mix' }), seeded(k + 1)).map((q) => q.kind)).flat());
  expect(kinds).toEqual(new Set(['type', 'juz', 'ayat']));
  expect(dealQuestions(settings({ mode: 'juz' }), seeded(3)).every((q) => q.kind === 'juz' && q.seconds === 8 + MAKKI_MCQ_EXTRA)).toBe(true);
  expect(dealQuestions(settings({ mode: 'type', seconds: 12 }), seeded(3)).every((q) => q.kind === 'type' && q.seconds === 12)).toBe(true);
});

test('makki questions: the options hold the right answer once, sorted, distinct, plausible', () => {
  for (const x of SURAHS) {
    for (let seed = 1; seed <= 6; seed++) {
      const rnd = seeded(seed * 1000 + x.n);
      const t = makeQuestion(x, 'type', 8, rnd);
      expect(t.options).toEqual(['مكية', 'مدنية']);
      expect(t.correct).toBe(x.madani ? 1 : 0);
      const jd = juzDistractors(x.juz, rnd);
      expect(jd.length).toBe(3);
      expect(new Set([x.juz, ...jd]).size).toBe(4);
      for (const j of jd) expect(j >= 1 && j <= 30 && Math.abs(j - x.juz) <= 5).toBe(true);
      const ad = ayatDistractors(x.ayat, rnd);
      expect(ad.length).toBe(3);
      expect(new Set([x.ayat, ...ad]).size).toBe(4);
      for (const a of ad) expect(a >= 3 && Math.abs(a - x.ayat) <= Math.max(6, x.ayat * 0.6)).toBe(true);
      const j = makeQuestion(x, 'juz', 8, rnd);
      expect(j.options.length).toBe(4);
      expect(j.options[j.correct]).toBe(`الجزء ${x.juz}`);
      const a = makeQuestion(x, 'ayat', 8, rnd);
      expect(a.options[a.correct]).toBe(ayatLabel(x.ayat));
      const nums = a.options.map((o) => Number(o.split(' ')[0]));
      expect([...nums].sort((p, q) => p - q)).toEqual(nums);
    }
  }
  expect(ayatLabel(3)).toBe('3 آيات');
  expect(ayatLabel(10)).toBe('10 آيات');
  expect(ayatLabel(11)).toBe('11 آية');
  expect(ayatLabel(286)).toBe('286 آية');
  expect(ayatLabel(103)).toBe('103 آيات');
});

test('makki dealing: the room does not see the same surahs again soon', () => {
  const ctx = fakeCtx();
  const a = startMakki(ctx, P, settings({ rounds: 20 }), seeded(1));
  const b = startMakki(ctx, P, settings({ rounds: 20 }), seeded(2));
  const sa = new Set(a.qs.map((q) => q.surah.n));
  const overlap = b.qs.filter((q) => sa.has(q.surah.n)).length;
  expect(overlap).toBeLessThanOrEqual(6);
});

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

test('makki scoring: 10 + up to 5 for speed, ×1.5 from 3 in a row, ×2 from 5', () => {
  expect(makkiSpeed(0, 8000)).toBe(5);
  expect(makkiSpeed(8000, 8000)).toBe(0);
  expect(makkiSpeed(4000, 8000)).toBe(3);
  expect([1, 2, 3, 4, 5, 9].map(makkiMult)).toEqual([1, 1, 1.5, 1.5, 2, 2]);
  expect(makkiPoints(0, 8000, 1)).toBe(15);
  expect(makkiPoints(0, 8000, 3)).toBe(23);
  expect(makkiPoints(0, 8000, 5)).toBe(30);
  expect(scoreAnswer(null, null, 0, 8000, 4)).toMatchObject({ points: 0, streak: 0, correct: false });
  expect(scoreAnswer(1, 100, 0, 8000, 4)).toMatchObject({ points: 0, streak: 0, correct: false });
  expect(scoreAnswer(0, 0, 0, 8000, 4)).toMatchObject({ points: 30, streak: 5, mult: 2, correct: true });
});

test('makki rounds: a streak builds over the rounds and a wrong tap breaks it', () => {
  const ctx = fakeCtx();
  const s = startMakki(ctx, ['aaaa', 'bbbb'], settings({ rounds: 10 }), seeded(4));
  for (let r = 0; r < 5; r++) {
    tap(ctx, s, 'aaaa', right(s));
    tap(ctx, s, 'bbbb', r === 3 ? wrong(s) : right(s));
    expect(s.phase).toBe('reveal');
    makki.act(ctx, s, 'aaaa', { type: 'next' });
  }
  expect(s.streaks.aaaa).toBe(5);
  expect(s.streaks.bbbb).toBe(1);
  expect(s.best.bbbb).toBe(3);
  // instant taps: 15, 15, 23, 23, 30
  expect(s.scores.aaaa).toBe(106);
  expect(s.rights.aaaa).toBe(5);
});

test('makki timers: the tap question has its seconds, the multiple-choice ones 5 more; a late tap is refused', () => {
  const ctx = fakeCtx();
  const s = startMakki(ctx, P, settings({ mode: 'juz', seconds: 12 }), seeded(5));
  expect(s.endsAt).toBe(ctx.now + 17000);
  expect(view(ctx, s, 'aaaa').timerTotal).toBe(17000);
  ctx.now += 17001;
  tap(ctx, s, 'aaaa', right(s));
  expect(s.answers.aaaa).toBeUndefined();
  makki.tick?.(ctx, s);
  expect(s.phase).toBe('reveal');
  expect(s.endsAt).toBe(ctx.now + MAKKI_REVEAL_MS);
  ctx.now += MAKKI_REVEAL_MS;
  makki.tick?.(ctx, s);
  expect(s.phase).toBe('ask');
  expect(s.round).toBe(1);
});

test('makki taps: one tap only, valid options only, the right round only; the host skips the reveal', () => {
  const ctx = fakeCtx();
  const s = startMakki(ctx, P, settings({ mode: 'juz' }), seeded(6));
  tap(ctx, s, 'aaaa', 4);
  tap(ctx, s, 'aaaa', -1);
  tap(ctx, s, 'aaaa', 1.5);
  tap(ctx, s, 'aaaa', '1');
  makki.act(ctx, s, 'aaaa', { type: 'answer', round: 5, choice: 1 });
  tap(ctx, s, 'zzzz', 1);
  expect(Object.keys(s.answers)).toEqual([]);
  tap(ctx, s, 'aaaa', 2);
  tap(ctx, s, 'aaaa', 3);
  expect(s.answers.aaaa.choice).toBe(2);
  makki.act(ctx, s, 'aaaa', { type: 'next' }); // not during the question
  expect(s.phase).toBe('ask');
  tap(ctx, s, 'bbbb', 0);
  tap(ctx, s, 'cccc', 1);
  expect(s.phase).toBe('reveal');
  expect(makki.hostOnly).toContain('next');
  makki.act(ctx, s, 'aaaa', { type: 'next' });
  expect(s.phase).toBe('ask');
  expect(s.round).toBe(1);
});

/* ------------------------------------------------------------------ */
/* No leak before the reveal                                           */
/* ------------------------------------------------------------------ */

test('makki views: neither the answer nor the facts leave the server before the reveal', () => {
  let tapShape: string | undefined;
  for (const mode of ['type', 'juz', 'mix'] as const) {
    for (let seed = 1; seed <= 5; seed++) {
      const ctx = fakeCtx();
      const s = startMakki(ctx, P, settings({ rounds: 20, mode }), seeded(seed));
      for (let r = 0; r < s.qs.length; r++) {
        const q = s.qs[r];
        tap(ctx, s, 'aaaa', 0);
        for (const me of [...P, 'watcher']) {
          const v = view(ctx, s, me);
          expect(v.correct).toBeNull();
          expect(v.card).toBeNull();
          expect(v.results).toBeNull();
          const json = JSON.stringify(v);
          expect(json.includes(q.surah.why ?? '\u0000')).toBe(false);
          expect(json.includes(q.surah.theme ?? '\u0000')).toBe(false);
          expect(json.includes(DISPUTED_NOTE)).toBe(false);
          expect(json.includes('madani')).toBe(false);
          // a tap question tells nothing beyond the name and the number: the same view for a Makki or a Madani surah
          if (q.kind === 'type') {
            const bare = JSON.stringify({ ...v, n: 0, name: '', round: 0, answered: [], mine: null, endsAt: 0, scores: {}, streaks: {}, best: {}, rights: {} });
            tapShape ??= bare;
            expect(bare).toBe(tapShape);
            expect(v.options).toEqual(['مكية', 'مدنية']);
          }
          if (q.kind === 'juz') expect(json.includes(`"juz":`)).toBe(false);
        }
        expect(view(ctx, s, 'aaaa').mine).toBe(0);
        expect(view(ctx, s, 'bbbb').mine).toBeNull();
        tap(ctx, s, 'bbbb', 0);
        tap(ctx, s, 'cccc', 0);
        const v = view(ctx, s, 'bbbb');
        expect(v.phase).toBe('reveal');
        expect(v.correct).toBe(q.correct);
        expect(v.card).toEqual({ madani: q.surah.madani, ayat: q.surah.ayat, juz: q.surah.juz, why: q.surah.why ?? null, theme: q.surah.theme ?? null, note: q.surah.disputed ? DISPUTED_NOTE : null });
        makki.act(ctx, s, 'aaaa', { type: 'next' });
      }
      expect(s.phase).toBe('final');
    }
  }
});

test('makki says: only the fastest right answer, after the reveal; nothing during the question', () => {
  const ctx = fakeCtx();
  const s = startMakki(ctx, P, settings(), seeded(8));
  ctx.now += 1000;
  tap(ctx, s, 'bbbb', right(s));
  expect(ctx.said.length).toBe(0);
  ctx.now += 500;
  tap(ctx, s, 'aaaa', right(s));
  tap(ctx, s, 'cccc', wrong(s));
  expect(ctx.said.at(-1)?.text).toBe('أسرع إجابة صحيحة: bbbb');
  makki.act(ctx, s, 'aaaa', { type: 'next' });
  for (const p of P) tap(ctx, s, p, wrong(s));
  expect(ctx.said.at(-1)?.text).toBe('لا إجابة صحيحة في هذه السورة');
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('makki bots: right as often as their level and the surah’s fame say; human timing', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const [hi, , lo] = MAKKI_BOT_RIGHT[level];
    expect(hi).toBeGreaterThan(lo);
    for (const fame of [1, 3] as const) {
      const x = SURAHS.find((y) => y.fame === fame && !y.madani)!;
      const q = makeQuestion(x, 'type', 8, seeded(1));
      const rnd = seeded(fame * 7 + level.length);
      let ok = 0;
      const delays: number[] = [];
      for (let i = 0; i < 4000; i++) {
        const a = botAnswer(level, q, rnd);
        if (a.choice === q.correct) ok++;
        delays.push(a.delay);
      }
      const want = MAKKI_BOT_RIGHT[level][fame - 1];
      expect(Math.abs(ok / 4000 - want)).toBeLessThan(0.03);
      expect(Math.min(...delays)).toBeGreaterThanOrEqual(900);
      expect(Math.max(...delays)).toBeLessThanOrEqual(8000 * 0.9);
    }
  }
  // the levels' ranges from the brief
  expect(MAKKI_BOT_RIGHT.easy[2]).toBeGreaterThanOrEqual(0.6);
  expect(MAKKI_BOT_RIGHT.easy[0]).toBeLessThanOrEqual(0.85);
  expect(MAKKI_BOT_RIGHT.expert[2]).toBeGreaterThanOrEqual(0.88);
  // an expert is slower on a hard surah than on a famous one
  const avg = (fame: 1 | 3) => {
    const q = makeQuestion(SURAHS.find((y) => y.fame === fame)!, 'type', 12, seeded(2));
    const rnd = seeded(fame);
    let t = 0;
    for (let i = 0; i < 2000; i++) t += botAnswer('expert', q, rnd).delay;
    return t / 2000;
  };
  expect(avg(3)).toBeGreaterThan(avg(1));
});

test('makki bots: at every level they play a whole game; result() ranks by score', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    for (const mode of ['type', 'mix'] as const) {
      const bots = ['bot1', 'bot2', 'bot3'];
      const ctx = fakeCtx(bots, level);
      const s = startMakki(ctx, ['hhhh', ...bots], settings({ rounds: 10, mode }), seeded(level.length));
      ctx.offline.add('hhhh');
      playOut(makki as never, ctx, s, bots, (st) => {
        if (st.phase === 'ask') expect(view(ctx, st, 'hhhh').card).toBeNull();
      });
      expect(s.phase).toBe('final');
      const r = makki.result?.(s);
      expect(r).not.toBeNull();
      expect(r!.places.flat().sort()).toEqual(['hhhh', ...bots].sort());
      const flat = r!.places.flat();
      for (let i = 1; i < flat.length; i++) expect(s.scores[flat[i - 1]]).toBeGreaterThanOrEqual(s.scores[flat[i]]);
      expect(bots.some((b) => s.scores[b] > 0)).toBe(true);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Leaving, settings                                                   */
/* ------------------------------------------------------------------ */

test('makki leaving: the game goes on without them; the last one leaving ends it', () => {
  const ctx = fakeCtx();
  const s = startMakki(ctx, P, settings(), seeded(9));
  tap(ctx, s, 'aaaa', right(s));
  tap(ctx, s, 'bbbb', right(s));
  makki.onLeave?.(ctx, s, 'cccc');
  expect(s.phase).toBe('reveal');
  expect(s.participants).toEqual(['aaaa', 'bbbb']);
  expect(s.scores.cccc).toBeUndefined();
  makki.onLeave?.(ctx, s, 'aaaa');
  makki.onLeave?.(ctx, s, 'bbbb');
  expect(s.phase).toBe('final');
  expect(makki.result?.(s)).toBeNull();
});

test('makki settings: sanitised at start, validated on patch', () => {
  expect(DEFAULT_SETTINGS.makki).toEqual(MAKKI_DEFAULTS);
  expect(sanitizeMakki(undefined)).toEqual(MAKKI_DEFAULTS);
  expect(sanitizeMakki({ rounds: 99, seconds: 3, mode: 'x' as never, scope: 'y' as never })).toEqual({ rounds: 20, seconds: 8, mode: 'type', scope: 'all' });
  const st = { ...MAKKI_DEFAULTS };
  makki.patchSettings?.(st, { rounds: 15, seconds: 12, mode: 'mix', scope: 'amma' });
  expect(st).toEqual({ rounds: 15, seconds: 12, mode: 'mix', scope: 'amma' });
  makki.patchSettings?.(st, { rounds: 'a', mode: 'nope', scope: 3 });
  expect(st).toEqual({ rounds: 15, seconds: 12, mode: 'mix', scope: 'amma' });
  const ctx = fakeCtx();
  const s = startMakki(ctx, P, { rounds: 7, seconds: 100 } as MakkiSettings, seeded(1));
  expect(s.qs.length).toBe(10);
  expect(s.qs[0].seconds).toBe(12);
});
