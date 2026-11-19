/**
 * «أكمل المثل» — the content (no duplicates, real hints, fair wrong options), the tolerant typed matching,
 * scoring with speed, timeouts, nothing of the ending before the reveal, bots, leaving, settings, result.
 */
import { expect, test } from 'bun:test';

import { MATHAL_POINTS, MATHAL_SPEED_POINTS, MATHAL_TYPED_POINTS, mathalPoints, type MathalSettings, type MathalView } from '../src/shared/games/mathal';
import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { MATHAL_ALL, MATHAL_DARIJA, MATHAL_FUSHA, type Mathal } from './content-mathal';
import { MATHAL_MAX_TEXT, MATHAL_REVEAL_MS, cleanText, mathal, sanitizeMathal, startMathal, type MathalState } from './games/mathal';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';
import { MATHAL_BOT_KNOWS, botAnswer, botTyped } from './mathal-bots';
import { fairDistractor, makeItem, poolOf, sameOpening } from './mathal-deck';
import { endingsAlike, flat, gradeTyped, mathalWords } from './mathal-match';
import { KNOW_VOICE, voiceFastestRight } from './voice-calls-knowledge';

const P = ['amal', 'badr', 'chama'];
const view = (ctx: TestCtx, s: MathalState, me: string) => mathal.view(ctx, s, me) as MathalView;
const set = (o: Partial<MathalSettings> = {}): MathalSettings => ({ ...DEFAULT_SETTINGS.mathal, ...o });
const tap = (ctx: TestCtx, s: MathalState, by: string, choice: number) => mathal.act(ctx, s, by, { type: 'answer', round: s.round + 1, choice });
const type = (ctx: TestCtx, s: MathalState, by: string, text: string) => mathal.act(ctx, s, by, { type: 'answer', round: s.round + 1, text });
const it = (s: MathalState) => s.items[s.round];
const wrong = (s: MathalState) => (it(s).correct + 1) % 4;
const find = (start: string): Mathal => {
  const p = MATHAL_ALL.find((x) => x.start === start);
  if (!p) throw new Error(`no proverb «${start}»`);
  return p;
};

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('mathal content: 120+ classical and 120+ Moroccan proverbs, each complete', () => {
  expect(MATHAL_FUSHA.length).toBeGreaterThanOrEqual(120);
  expect(MATHAL_DARIJA.length).toBeGreaterThanOrEqual(120);
  for (const p of MATHAL_ALL) {
    expect(p.start.trim()).toBe(p.start);
    expect(p.end.trim()).toBe(p.end);
    expect(mathalWords(p.end).length).toBeGreaterThan(0);
    // the meaning: one short sentence in فصحى
    expect(p.meaning.endsWith('.')).toBe(true);
    expect(p.meaning.length).toBeLessThan(80);
    expect(p.meaning.slice(0, -1)).not.toContain('.');
    expect(/[a-z]/i.test(p.start + p.end + p.meaning)).toBe(false);
  }
  // mostly well-known proverbs, some rarer ones
  for (const pool of [MATHAL_FUSHA, MATHAL_DARIJA]) {
    const famous = pool.filter((p) => p.famous).length;
    expect(famous).toBeGreaterThan(pool.length * 0.5);
    expect(famous).toBeLessThan(pool.length);
  }
});

test('mathal content: no duplicate proverb, beginning or ending', () => {
  const full = new Set<string>();
  for (const p of MATHAL_ALL) {
    const k = `${p.source}:${flat(`${p.start} ${p.end}`)}`;
    expect(full.has(k)).toBe(false);
    full.add(k);
  }
  for (const pool of [MATHAL_FUSHA, MATHAL_DARIJA]) {
    const starts = pool.map((p) => flat(p.start));
    expect(new Set(starts).size).toBe(pool.length);
    // no beginning is the beginning of another proverb (one beginning, one proverb)
    for (const a of pool) for (const b of pool) if (a !== b) expect(flat(`${b.start} ${b.end}`).startsWith(flat(`${a.start} ${a.end}`))).toBe(false);
  }
});

const OPENING = new Set(['اللي', 'ما', 'من', 'لا', 'اذا', 'الا', 'في', 'على', 'كل', 'لكل', 'ان', 'يا', 'و', 'كما', 'قد', 'ليس', 'ان']);

test('mathal content: the split points are sensible (the beginning gives a real hint)', () => {
  for (const p of MATHAL_ALL) {
    const sw = mathalWords(p.start);
    // a content word in the beginning, not only «اللي / من / إذا…»
    expect(sw.some((w) => !OPENING.has(w) && [...w].length >= 2)).toBe(true);
    expect(flat(p.start).length).toBeGreaterThanOrEqual(3);
    // an ending to find: at least a short word
    expect(flat(p.end).length).toBeGreaterThanOrEqual(2);
    // the alternative endings are longer or variant forms, never the same as the ending
    for (const a of p.alt ?? []) expect(flat(a)).not.toBe(flat(p.end));
  }
});

test('mathal content: every proverb has fair wrong options, never another real ending', () => {
  const rnd = seeded(7);
  for (const p of MATHAL_ALL) {
    const item = makeItem(p, rnd);
    expect(item.options.length).toBe(4);
    expect(item.options[item.correct]).toBe(p.end);
    // the options differ from each other
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(endingsAlike(item.options[i], item.options[j])).toBe(false);
    for (const [i, o] of item.options.entries()) {
      if (i === item.correct) continue;
      const owner = poolOf(p.source).find((c) => c.end === o)!;
      // same source, and never one of this proverb's endings
      expect(owner.source).toBe(p.source);
      expect(gradeTyped(o, p)).toBe('wrong');
      for (const e of [p.end, ...(p.alt ?? [])]) expect(endingsAlike(o, e)).toBe(false);
      expect(sameOpening(p.start, owner.start)).toBe(false);
    }
  }
});

test('mathal content: the wrong options are of a similar length', () => {
  const rnd = seeded(3);
  let far = 0;
  let n = 0;
  for (const p of MATHAL_ALL) {
    const item = makeItem(p, rnd);
    const w = mathalWords(p.end).length;
    for (const [i, o] of item.options.entries()) {
      if (i === item.correct) continue;
      n++;
      if (Math.abs(mathalWords(o).length - w) > 1) far++;
    }
  }
  expect(far / n).toBeLessThan(0.05);
});

test('mathal content: a known saying hidden in another proverb is never a wrong option', () => {
  // «جزاء» + «من جنس العمل» is «الجزاء من جنس العمل», «الغريق» + «فما خوفي من البلل» is «أنا الغريق…»
  expect(fairDistractor(find('جزاء'), find('الجزاء'))).toBe(false);
  expect(fairDistractor(find('الغريق'), find('أنا الغريق'))).toBe(false);
  expect(fairDistractor(find('جزاء'), find('الغريق'))).toBe(true);
  // «من جدّ وجد» + «ومن سار على الدرب وصل» is the longer form of the same saying
  expect(gradeTyped('ومن سار على الدرب وصل', find('من جدّ وجد'))).toBe('exact');
  // two beginnings that open the same way don't lend each other their endings
  expect(sameOpening('ما يحسّ بالمزود', 'ما يحسّ بالجمرة')).toBe(true);
  expect(fairDistractor(find('ما يحسّ بالجمرة'), find('ما يحسّ بالمزود'))).toBe(false);
  expect(fairDistractor(find('لكلّ جوادٍ'), find('لكلّ مقامٍ'))).toBe(false);
  // other sources never mix
  expect(fairDistractor(find('يدٌ واحدة'), find('يد وحدة'))).toBe(false);
});

/* ------------------------------------------------------------------ */
/* Typed matching                                                      */
/* ------------------------------------------------------------------ */

test('mathal match: diacritics, hamza shapes, ة/ه, ى/ي, punctuation and spaces are ignored', () => {
  const p = find('عند الامتحان'); // يُكرم المرء أو يُهان
  expect(gradeTyped('يكرم المرء او يهان', p)).toBe('exact');
  expect(gradeTyped('  يُكْرَمُ المَرْءُ أَوْ يُهَانُ!! ', p)).toBe('exact');
  expect(gradeTyped('يكرم المرء، أو يهان.', p)).toBe('exact');
  expect(gradeTyped('يكرمالمرء او يهان', p)).toBe('exact');
  const q = find('القناعة'); // كنزٌ لا يفنى
  expect(gradeTyped('كنز لا يفني', q)).toBe('exact');
  const r = find('من طلب العلا'); // سهر الليالي
  expect(gradeTyped('سهر الليالى', r)).toBe('exact');
  const d = find('حبّة حبّة'); // كيعمر الصاك
  expect(gradeTyped('كيعمر الصاك', d)).toBe('exact');
  expect(gradeTyped('تيعمر الصاك', d)).toBe('exact'); // the other Moroccan spelling
});

test('mathal match: small slips and a missing «و» or «ال» are still exact', () => {
  expect(gradeTyped('ويبكى مع الراعى', find('يأكل مع الذئب'))).toBe('exact');
  expect(gradeTyped('يبكي مع الراعي', find('يأكل مع الذئب'))).toBe('exact');
  expect(gradeTyped('ويبكي مع الراعي', find('يأكل مع الذئب'))).toBe('exact');
  expect(gradeTyped('ويبكي مع الرعي', find('يأكل مع الذئب'))).toBe('exact'); // one letter missing
  expect(gradeTyped('خير من عشره على الشجره', find('عصفورٌ في اليد'))).toBe('exact');
  expect(gradeTyped('خير من عشرة على شجرة', find('عصفورٌ في اليد'))).toBe('exact');
  expect(gradeTyped('ولكن تؤخد الدنيا غلابا', find('وما نيل المطالب بالتمنّي'))).toBe('exact');
  expect(gradeTyped('لكن تؤخذ الدنيا غلابا', find('وما نيل المطالب بالتمنّي'))).toBe('exact');
  expect(gradeTyped('يصبر لقريص النحل', find('اللي بغا العسل'))).toBe('exact');
  expect(gradeTyped('يصبر لقرص النحل', find('اللي بغا العسل'))).toBe('exact');
});

test('mathal match: typing the beginning again, or a longer real form, is fine', () => {
  expect(gradeTyped('سبق السيف العذل', find('سبق السيف'))).toBe('exact');
  expect(gradeTyped('لسانك حصانك إن صنته صانك وإن هنته هانك', find('لسانك حصانك'))).toBe('exact');
  expect(gradeTyped('حاتم الطائي', find('أكرم من'))).toBe('exact');
  expect(gradeTyped('حاتم', find('أكرم من'))).toBe('exact');
});

test('mathal match: one missing word (two in long endings) is close, more is wrong', () => {
  const e = find('عصفورٌ في اليد'); // خيرٌ من عشرة على الشجرة
  expect(gradeTyped('خير من عشرة الشجرة', e)).toBe('close');
  expect(gradeTyped('خير عشرة على الشجرة', e)).toBe('close');
  expect(gradeTyped('خير من عشرة على الشجرة العالية', e)).toBe('close'); // a word more
  expect(gradeTyped('خير من عشرة', e)).toBe('wrong');
  // but a missing «لا» or «إلا» turns the meaning round
  const p = find('الصحّة تاجٌ على رؤوس الأصحّاء'); // لا يراه إلا المرضى
  expect(gradeTyped('لا يراه المرضى', p)).toBe('wrong');
  expect(gradeTyped('يراه إلا المرضى', p)).toBe('wrong');
  expect(gradeTyped('لا يراه الا المرضي', p)).toBe('exact');
  expect(gradeTyped('المرضى', p)).toBe('wrong');
  const q = find('الخيل والليل والبيداء تعرفني'); // والسيف والرمح والقرطاس والقلم
  expect(gradeTyped('السيف والرمح والقلم', q)).toBe('close');
  expect(gradeTyped('والسيف والقلم', q)).toBe('wrong');
  const r = find('ما كلّ ما يتمنّى المرء يدركه'); // تجري الرياح بما لا تشتهي السفن (6 words)
  expect(gradeTyped('تجري الرياح بما لا تشتهي السفن', r)).toBe('exact');
  expect(gradeTyped('تجري الرياح بما لا تشتهيه السفن', r)).toBe('exact');
  expect(gradeTyped('تجري الرياح لا تشتهي السفن', r)).toBe('close');
  expect(gradeTyped('تجري الرياح بما تشتهي', r)).toBe('wrong');
});

test('mathal match: wrong answers stay wrong', () => {
  const p = find('عند الامتحان');
  expect(gradeTyped('', p)).toBe('wrong');
  expect(gradeTyped('   ', p)).toBe('wrong');
  expect(gradeTyped('؟!', p)).toBe('wrong');
  expect(gradeTyped('عند الامتحان', p)).toBe('wrong'); // only the beginning
  expect(gradeTyped('المرء', p)).toBe('wrong'); // one shared word
  expect(gradeTyped('يكرم الضيف', p)).toBe('wrong');
  expect(gradeTyped('لا ينفع الندم', p)).toBe('wrong');
  // short endings are strict: a different word is not a slip
  expect(gradeTyped('سلم', find('من خاف'))).toBe('exact');
  expect(gradeTyped('نجا', find('من خاف'))).toBe('wrong');
  expect(gradeTyped('الكيّ', find('آخر الدواء'))).toBe('exact');
  expect(gradeTyped('الصبر', find('آخر الدواء'))).toBe('wrong');
  expect(gradeTyped('ويوم عليك', find('يومٌ لك'))).toBe('exact');
  expect(gradeTyped('ويوم معك', find('يومٌ لك'))).toBe('wrong');
  // no proverb accepts another proverb's ending
  for (const pool of [MATHAL_FUSHA, MATHAL_DARIJA]) {
    for (const a of pool) {
      for (const b of pool) {
        if (a === b || endingsAlike(a.end, b.end) || [b.end, ...(b.alt ?? [])].some((e) => (a.alt ?? []).some((x) => endingsAlike(x, e)))) continue;
        if (gradeTyped(b.end, a) !== 'wrong') throw new Error(`«${a.start}» accepts «${b.end}»`);
      }
    }
  }
});

test('mathal match: every ending and every other real ending is accepted as exact', () => {
  for (const p of MATHAL_ALL) {
    expect(gradeTyped(p.end, p)).toBe('exact');
    expect(gradeTyped(`${p.start} ${p.end}`, p)).toBe('exact');
    for (const a of p.alt ?? []) expect(gradeTyped(a, p)).toBe('exact');
  }
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

test('mathal settings: sanitised at start and validated in the lobby', () => {
  expect(sanitizeMathal(DEFAULT_SETTINGS.mathal)).toEqual(DEFAULT_SETTINGS.mathal);
  expect(DEFAULT_SETTINGS.mathal).toEqual({ rounds: 8, seconds: 15, mode: 'options', source: 'mixed' });
  expect(sanitizeMathal({ rounds: 13, seconds: 22, mode: 'typed', source: 'darija' })).toEqual({ rounds: 12, seconds: 25, mode: 'typed', source: 'darija' });
  expect(sanitizeMathal({ rounds: 'x' as never, seconds: null as never, mode: 'voice' as never, source: 'english' as never })).toEqual(DEFAULT_SETTINGS.mathal);
  expect(sanitizeMathal(undefined)).toEqual(DEFAULT_SETTINGS.mathal);
  const s = set();
  mathal.patchSettings!(s, { rounds: 100, mode: 'typed' });
  expect(s).toEqual({ rounds: 15, seconds: 15, mode: 'typed', source: 'mixed' });
  mathal.patchSettings!(s, { seconds: 25, source: 'fusha', mode: 'nope' });
  expect(s).toEqual({ rounds: 15, seconds: 25, mode: 'options', source: 'fusha' });
  // a bad setting at start falls back
  const ctx = fakeCtx();
  const st = startMathal(ctx, P, { rounds: 999, seconds: 1, mode: 'x', source: 'y' } as never);
  expect(st.settings).toEqual({ rounds: 15, seconds: 15, mode: 'options', source: 'mixed' });
  expect(st.items.length).toBe(15);
});

test('mathal settings: the source picks the proverbs; «منوّعة» mixes both halves', () => {
  for (const source of ['fusha', 'darija'] as const) {
    const s = startMathal(fakeCtx(), P, set({ source, rounds: 15 }));
    expect(s.items.every((i) => i.p.source === source)).toBe(true);
    expect(new Set(s.items.map((i) => i.p)).size).toBe(15);
  }
  const m = startMathal(fakeCtx(), P, set({ source: 'mixed', rounds: 12 }));
  expect(m.items.filter((i) => i.p.source === 'fusha').length).toBe(6);
  expect(m.items.filter((i) => i.p.source === 'darija').length).toBe(6);
  // the room's deck: the next game brings other proverbs
  const ctx = fakeCtx();
  const a = startMathal(ctx, P, set({ source: 'darija', rounds: 15 }));
  const b = startMathal(ctx, P, set({ source: 'darija', rounds: 15 }));
  const seen = new Set(a.items.map((i) => i.p));
  expect(b.items.some((i) => seen.has(i.p))).toBe(false);
});

/* ------------------------------------------------------------------ */
/* Rounds, scoring, reveal                                             */
/* ------------------------------------------------------------------ */

test('mathal: points are 10 right, 15 typed complete, plus up to 5 for speed', () => {
  expect(mathalPoints('exact', false, 0, 15000)).toBe(MATHAL_POINTS + MATHAL_SPEED_POINTS);
  expect(mathalPoints('exact', false, 15000, 15000)).toBe(MATHAL_POINTS);
  expect(mathalPoints('exact', false, 7500, 15000)).toBe(13);
  expect(mathalPoints('exact', true, 0, 25000)).toBe(MATHAL_TYPED_POINTS + MATHAL_SPEED_POINTS);
  expect(mathalPoints('close', true, 25000, 25000)).toBe(MATHAL_POINTS);
  expect(mathalPoints('wrong', true, 0, 25000)).toBe(0);
  expect(mathalPoints('none', false, 0, 15000)).toBe(0);
});

test('mathal: four options, one tap each, bad taps refused, speed counts', () => {
  const ctx = fakeCtx();
  const s = startMathal(ctx, P, set());
  const t0 = ctx.now;
  mathal.act(ctx, s, 'amal', { type: 'answer', choice: 4 });
  mathal.act(ctx, s, 'amal', { type: 'answer', choice: 1.5 });
  mathal.act(ctx, s, 'amal', { type: 'answer', choice: '0' });
  mathal.act(ctx, s, 'amal', { type: 'answer', round: 2, choice: 0 });
  mathal.act(ctx, s, 'ghost', { type: 'answer', choice: 0 });
  expect(s.answers).toEqual({});
  ctx.now = t0 + 3000;
  tap(ctx, s, 'amal', it(s).correct);
  tap(ctx, s, 'amal', wrong(s)); // can't change
  expect(s.answers.amal.choice).toBe(it(s).correct);
  ctx.now = t0 + 7500;
  tap(ctx, s, 'badr', it(s).correct);
  tap(ctx, s, 'chama', wrong(s));
  expect(s.phase).toBe('reveal');
  const r = Object.fromEntries(s.results!.map((x) => [x.id, x]));
  expect(r.amal.points).toBe(10 + 4);
  expect(r.badr.points).toBe(13);
  expect(r.chama.points).toBe(0);
  expect(r.chama.grade).toBe('wrong');
  expect(r.amal.fastest).toBe(true);
  expect(r.badr.fastest).toBe(false);
  expect(s.scores).toEqual({ amal: 14, badr: 13, chama: 0 });
  expect(s.rights).toEqual({ amal: 1, badr: 1 });
  expect(ctx.said.at(-1)).toEqual({ text: 'أسرع إجابة صحيحة: amal', by: 'amal', voice: voiceFastestRight('amal') });
  // a tap after the reveal changes nothing
  tap(ctx, s, 'chama', it(s).correct);
  expect(s.scores.chama).toBe(0);
});

test('mathal: typed answers are graded at the reveal: complete 15+, close 10+, wrong 0', () => {
  const ctx = fakeCtx();
  const s = startMathal(ctx, P, set({ mode: 'typed', seconds: 25 }));
  // a known proverb for this round
  s.items[0] = makeItem(find('يأكل مع الذئب'), seeded(1));
  const t0 = ctx.now;
  mathal.act(ctx, s, 'amal', { type: 'answer', choice: 0 }); // no options in typed mode
  type(ctx, s, 'amal', '   ');
  type(ctx, s, 'amal', 12 as never);
  expect(s.answers).toEqual({});
  type(ctx, s, 'amal', 'ويبكي مع الراعي');
  ctx.now = t0 + 25000;
  type(ctx, s, 'badr', 'يبكي الراعي'); // at the very last moment
  expect(s.phase).toBe('ask');
  mathal.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  const r = Object.fromEntries(s.results!.map((x) => [x.id, x]));
  expect(r.amal).toMatchObject({ grade: 'exact', points: 20, text: 'ويبكي مع الراعي' });
  expect(r.badr).toMatchObject({ grade: 'close', points: 10, text: 'يبكي الراعي' });
  expect(r.chama).toMatchObject({ grade: 'none', points: 0, text: null });
});

test('mathal: a typed answer is kept short and on one line', () => {
  expect(cleanText('  أ\nب\tج  ')).toBe('أ ب ج');
  expect(cleanText('x'.repeat(500))!.length).toBe(MATHAL_MAX_TEXT);
  expect(cleanText('‏‮')).toBeNull();
  expect(cleanText(5)).toBeNull();
});

test('mathal: the timer runs out → reveal with «no answer», then the next round, then the end', () => {
  const ctx = fakeCtx();
  const s = startMathal(ctx, P, set({ rounds: 8 }));
  tap(ctx, s, 'amal', wrong(s));
  ctx.now += 15000 - 1;
  expect(mathal.tick!(ctx, s)).toBe(false);
  ctx.now += 1;
  expect(mathal.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('reveal');
  expect(s.results!.map((r) => r.grade)).toEqual(['wrong', 'none', 'none']);
  expect(ctx.said.at(-1)).toEqual({ text: 'لا إجابة صحيحة في هذه الجولة', by: undefined, voice: KNOW_VOICE.noRight });
  const v = view(ctx, s, 'badr');
  expect(v.timerTotal).toBe(MATHAL_REVEAL_MS);
  // the reveal moves on by itself
  ctx.now = s.endsAt!;
  mathal.tick!(ctx, s);
  expect(s.phase).toBe('ask');
  expect(s.round).toBe(1);
  // only the host may skip the reveal: hostOnly
  expect(mathal.hostOnly).toEqual(['next']);
  for (let i = 1; i < 8; i++) {
    ctx.now = s.endsAt!;
    mathal.tick!(ctx, s);
    expect(s.phase).toBe('reveal');
    mathal.act(ctx, s, 'amal', { type: 'next' });
  }
  expect(s.phase).toBe('final');
  expect(mathal.result!(s)).not.toBeNull();
});

test('mathal: a phone that went away is not waited for', () => {
  const ctx = fakeCtx();
  const s = startMathal(ctx, P, set());
  ctx.offline.add('chama');
  tap(ctx, s, 'amal', 0);
  expect(s.phase).toBe('ask');
  tap(ctx, s, 'badr', 0);
  expect(s.phase).toBe('reveal');
});

test('mathal: nothing of the ending leaves the server before the reveal', () => {
  for (const mode of ['options', 'typed'] as const) {
    const ctx = fakeCtx();
    const s = startMathal(ctx, P, set({ mode }));
    const p = it(s).p;
    if (mode === 'typed') type(ctx, s, 'amal', 'شيء ما');
    else tap(ctx, s, 'amal', wrong(s));
    for (const me of P) {
      const v = view(ctx, s, me);
      expect(v.phase).toBe('ask');
      expect(v.correct).toBeNull();
      expect(v.end).toBeNull();
      expect(v.meaning).toBeNull();
      expect(v.results).toBeNull();
      const json = JSON.stringify(v);
      expect(json.includes(p.meaning)).toBe(false);
      if (mode === 'typed') {
        expect(v.options).toBeNull();
        expect(json.includes(p.end)).toBe(false);
      } else expect(v.options!.length).toBe(4);
      // what someone answered stays theirs
      expect(v.answered).toEqual(['amal']);
      if (me !== 'amal') expect(v.myChoice === null && v.myText === null).toBe(true);
      if (me !== 'amal' && mode === 'typed') expect(json.includes('شيء ما')).toBe(false);
    }
    expect(mode === 'typed' ? view(ctx, s, 'amal').myText : view(ctx, s, 'amal').myChoice).toBe(mode === 'typed' ? 'شيء ما' : wrong(s));
    // the reveal shows it all
    ctx.now = s.endsAt!;
    mathal.tick!(ctx, s);
    const v = view(ctx, s, 'badr');
    expect(v.end).toBe(p.end);
    expect(v.meaning).toBe(p.meaning);
    expect(v.correct).toBe(mode === 'typed' ? null : it(s).correct);
    expect(v.results!.length).toBe(3);
    expect(JSON.stringify(v.results)).not.toContain('"ms"');
  }
});

/* ------------------------------------------------------------------ */
/* Leaving, the end                                                    */
/* ------------------------------------------------------------------ */

test('mathal: a player who leaves is dropped; the round goes on without them', () => {
  const ctx = fakeCtx();
  const s = startMathal(ctx, P, set());
  tap(ctx, s, 'amal', it(s).correct);
  tap(ctx, s, 'badr', it(s).correct);
  mathal.onLeave!(ctx, s, 'chama');
  expect(s.participants).toEqual(['amal', 'badr']);
  expect(s.phase).toBe('reveal');
  expect('chama' in s.scores).toBe(false);
  mathal.onLeave!(ctx, s, 'nobody');
  expect(s.participants.length).toBe(2);
  mathal.onLeave!(ctx, s, 'badr');
  expect(s.results!.map((r) => r.id)).toEqual(['amal']);
  mathal.onLeave!(ctx, s, 'amal');
  expect(s.phase).toBe('final');
  expect(mathal.result!(s)).toBeNull();
});

test('mathal: the result ranks by score; ties share a place; nothing before the end', () => {
  const ctx = fakeCtx();
  const s = startMathal(ctx, P, set({ rounds: 8 }));
  expect(mathal.result!(s)).toBeNull();
  s.phase = 'final';
  s.scores = { amal: 30, badr: 30, chama: 12 };
  expect(mathal.result!(s)).toEqual({ places: [['amal', 'badr'], ['chama']] });
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('mathal bots: know famous proverbs more often, and more at higher levels', () => {
  for (const lvl of ['easy', 'smart', 'expert'] as const) expect(MATHAL_BOT_KNOWS[lvl][0]).toBeGreaterThan(MATHAL_BOT_KNOWS[lvl][1]);
  expect(MATHAL_BOT_KNOWS.easy[0]).toBeLessThan(MATHAL_BOT_KNOWS.smart[0]);
  expect(MATHAL_BOT_KNOWS.smart[0]).toBeLessThan(MATHAL_BOT_KNOWS.expert[0]);
  const rnd = seeded(11);
  const famous = makeItem(MATHAL_ALL.find((p) => p.famous)!, rnd);
  const rare = makeItem(MATHAL_ALL.find((p) => !p.famous)!, rnd);
  const rate = (lvl: 'easy' | 'expert', item: typeof famous) => {
    let ok = 0;
    for (let i = 0; i < 2000; i++) if (botAnswer(lvl, item, false, 15, rnd).choice === item.correct) ok++;
    return ok / 2000;
  };
  expect(rate('expert', famous)).toBeGreaterThan(rate('expert', rare));
  expect(rate('expert', famous)).toBeGreaterThan(rate('easy', famous));
});

test('mathal bots: human timing — never instant, always before the timer', () => {
  const rnd = seeded(5);
  for (const lvl of ['easy', 'smart', 'expert'] as const) {
    for (const p of MATHAL_ALL.filter((_, i) => i % 7 === 0)) {
      const item = makeItem(p, rnd);
      for (const [typed, seconds] of [[false, 15], [true, 25], [true, 15]] as const) {
        const a = botAnswer(lvl, item, typed, seconds, rnd);
        expect(a.delay).toBeGreaterThanOrEqual(1500);
        expect(a.delay).toBeLessThan(seconds * 1000);
      }
    }
  }
});

test('mathal bots: in typed mode they type the ending (maybe with a slip) or a near miss', () => {
  const rnd = seeded(9);
  for (const p of MATHAL_ALL) {
    const item = makeItem(p, rnd);
    expect(gradeTyped(botTyped(item, true, rnd), p)).not.toBe('wrong');
    const miss = botTyped(item, false, rnd);
    expect(miss.trim().length).toBeGreaterThan(0);
    expect(gradeTyped(miss, p)).toBe('wrong');
  }
});

test('mathal bots: a whole game with bots in each mode, every view safe, a final ranking', () => {
  for (const mode of ['options', 'typed'] as const) {
    for (const level of ['easy', 'smart', 'expert'] as const) {
      const bots = ['bot1', 'bot2', 'bot3'];
      const ctx = fakeCtx(bots, level);
      const s = startMathal(ctx, bots, set({ mode, rounds: 8, seconds: mode === 'typed' ? 25 : 15 }), seeded(level.length + mode.length));
      playOut(mathal as never, ctx, s, bots, (st) => {
        const v = view(ctx, st, 'bot1');
        if (v.phase === 'ask') expect(v.end).toBeNull();
      });
      expect(s.phase).toBe('final');
      const res = mathal.result!(s)!;
      expect(res.places.flat().sort()).toEqual([...bots].sort());
      const total = Object.values(s.scores).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      // a bot answers each round at most once
      expect(ctx.jobs.length).toBeLessThanOrEqual(8 * 3);
    }
  }
});
