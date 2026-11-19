/** «خمّن من الإيموجي» — content, forgiving match, scoring and the hint, timeouts, no leak, bots, leaving, settings. */
import { expect, test } from 'bun:test';

import { EMOJI_CATEGORIES, EMOJI_DEFAULTS, emojiPoints, type EmojiView } from '../src/shared/games/emoji';
import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { EMOJI_BOT_KNOWS, botMove, nearMiss } from './emoji-bots';
import { EMOJI_PUZZLES, isTextStyle, puzzlesOf, type EmojiPuzzle } from './emoji-content';
import { emojiKey, emojiMatches, matchesForm } from './emoji-match';
import { EMOJI_REVEAL_MS, emoji, makeOptions, sanitizeEmoji, startEmoji, typedHint, type EmojiState } from './games/emoji';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';

const view = (ctx: TestCtx, s: EmojiState, me: string) => emoji.view(ctx, s, me) as EmojiView;
const byAnswer = (a: string) => EMOJI_PUZZLES.find((p) => p.answer === a)!;
const graphemes = (s: string) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].map((g) => g.segment);

/** Emoji code points of Emoji 12.0 and later (Unicode emoji-data.txt), too new for some Android phones. */
const NEW_EMOJI: [number, number][] = [
  [0x26a7, 0x26a7], [0x1f6d5, 0x1f6d7], [0x1f6dc, 0x1f6df], [0x1f6fa, 0x1f6fc], [0x1f7e0, 0x1f7eb], [0x1f7f0, 0x1f7f0],
  [0x1f90c, 0x1f90f], [0x1f93f, 0x1f93f], [0x1f971, 0x1f972], [0x1f977, 0x1f979], [0x1f97b, 0x1f97b], [0x1f9a3, 0x1f9af],
  [0x1f9ba, 0x1f9bf], [0x1f9c3, 0x1f9cf], [0x1fa70, 0x1fa7c], [0x1fa80, 0x1fa88], [0x1fa90, 0x1fabd], [0x1fabf, 0x1fac5],
  [0x1face, 0x1fadb], [0x1fae0, 0x1fae8], [0x1faf0, 0x1faf8],
];
const inRanges = (cp: number, rs: [number, number][]) => rs.some(([a, b]) => cp >= a && cp <= b);

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('emoji content: 220+ puzzles, every category big enough for 15 rounds', () => {
  expect(EMOJI_PUZZLES.length).toBeGreaterThanOrEqual(220);
  for (const c of EMOJI_CATEGORIES) expect(puzzlesOf(c.key).length).toBeGreaterThanOrEqual(24);
  expect(new Set(EMOJI_PUZZLES.map((p) => p.id)).size).toBe(EMOJI_PUZZLES.length);
});

test('emoji content: emoji rows are short, old enough for every phone, no flags, no skin tones, no letters', () => {
  const bad: string[] = [];
  for (const p of EMOJI_PUZZLES) {
    const g = graphemes(p.emojis);
    if (g.length < 1 || g.length > 7 || p.emojis.length > 40) bad.push(`${p.id}: ${g.length} emojis`);
    const cps = [...p.emojis].map((c) => c.codePointAt(0)!);
    cps.forEach((cp, i) => {
      if (cp >= 0x1f1e6 && cp <= 0x1f1ff) bad.push(`${p.id}: a flag`);
      if (cp >= 0x1f3fb && cp <= 0x1f3ff) bad.push(`${p.id}: a skin tone`);
      if (cp === 0xe0067 || (cp >= 0xe0020 && cp <= 0xe007f)) bad.push(`${p.id}: a tag sequence`);
      if (inRanges(cp, NEW_EMOJI)) bad.push(`${p.id}: Emoji 12+ U+${cp.toString(16)}`);
      // «🧑‍…» sequences are Emoji 12.1
      if (cp === 0x1f9d1 && cps[i + 1] === 0x200d) bad.push(`${p.id}: 🧑 sequence`);
      // text-style symbols need U+FE0F to be drawn in colour
      if (isTextStyle(cp) && cps[i + 1] !== 0xfe0f) bad.push(`${p.id}: U+${cp.toString(16)} without FE0F`);
      // digits only as keycaps
      if (cp >= 0x30 && cp <= 0x39 && !(cps[i + 1] === 0xfe0f && cps[i + 2] === 0x20e3)) bad.push(`${p.id}: a bare digit`);
    });
    if (/[\p{Script=Arabic}\p{Script=Latin}]/u.test(p.emojis)) bad.push(`${p.id}: letters in the emojis`);
    if (/\s/.test(p.emojis)) bad.push(`${p.id}: spaces in the emojis`);
  }
  expect(bad).toEqual([]);
});

test('emoji content: answers unique per category, alternatives normalised, hints never give the answer', () => {
  const bad: string[] = [];
  for (const c of EMOJI_CATEGORIES) {
    const ps = puzzlesOf(c.key);
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        // no form of one puzzle is accepted for another one of the same category
        for (const f of [ps[i].answer, ...ps[i].alt]) if (emojiMatches(f, ps[j])) bad.push(`${ps[i].id} «${f}» ≈ ${ps[j].id}`);
        for (const f of [ps[j].answer, ...ps[j].alt]) if (emojiMatches(f, ps[i])) bad.push(`${ps[j].id} «${f}» ≈ ${ps[i].id}`);
      }
    }
  }
  for (const p of EMOJI_PUZZLES) {
    const keys = [p.answer, ...p.alt].map(emojiKey);
    if (keys.some((k) => [...k].length < 2)) bad.push(`${p.id}: a form too short`);
    if (new Set(keys).size !== keys.length) bad.push(`${p.id}: an alternative that is the answer (or another alternative) again`);
    for (const a of p.alt) if (a !== a.trim() || /\s{2}/.test(a) || /[«»"'.]/.test(a)) bad.push(`${p.id}: alternative «${a}» not clean`);
    if (!p.hint.trim() || p.hint.length > 40) bad.push(`${p.id}: hint`);
    if (!p.explain.trim() || p.explain.length > 110) bad.push(`${p.id}: explanation`);
    if (![1, 2, 3].includes(p.difficulty)) bad.push(`${p.id}: difficulty`);
    // the hint is shown before the reveal: it never holds the answer (or a 4+ letter alternative)
    const hk = emojiKey(p.hint);
    for (const f of [p.answer, ...p.alt]) {
      const k = emojiKey(f);
      if ((f === p.answer || [...k].length >= 4) && hk.includes(k)) bad.push(`${p.id}: hint «${p.hint}» gives «${f}»`);
    }
    // …nor a word of it (in the options mode that word would point at the right option)
    const hintWords = p.hint.split(' ').map(emojiKey);
    for (const w of p.answer.split(' ').map(emojiKey)) if ([...w].length >= 3 && hintWords.includes(w)) bad.push(`${p.id}: hint «${p.hint}» shares «${w}»`);
    // the explanation talks about the emojis it explains
    const plain = (x: string) => x.replace(/️/g, '');
    if (!graphemes(p.emojis).some((g) => plain(p.explain).includes(plain(g)))) bad.push(`${p.id}: explanation without its emojis`);
  }
  expect(bad).toEqual([]);
});

test('emoji content: every category makes four distinct options for each of its puzzles', () => {
  const rnd = seeded(2);
  for (const p of EMOJI_PUZZLES) {
    const { options, correct, removed } = makeOptions(p, rnd);
    expect(options.length).toBe(4);
    expect(options[correct]).toBe(p.answer);
    expect(new Set(options.map(emojiKey)).size).toBe(4);
    for (const o of options) if (o !== p.answer) expect(emojiMatches(o, p)).toBe(false);
    expect(removed.length).toBe(2);
    expect(removed).not.toContain(correct);
  }
});

/* ------------------------------------------------------------------ */
/* Forgiving match                                                     */
/* ------------------------------------------------------------------ */

test('emoji match: «ال», hamza shapes, ة/ه, tashkeel, spaces, punctuation, small slips and alternatives are accepted', () => {
  const ok: [string, string][] = [
    ['صبر مفتاح فرج', 'الصبر مفتاح الفرج'],
    ['الصّبرُ مفتاحُ الفرَج!', 'الصبر مفتاح الفرج'],
    ['الصبر مفتاخ الفرج', 'الصبر مفتاح الفرج'],
    ['الصبر مفتاح الفرح', 'الصبر مفتاح الفرج'],
    ['اسد البحر', 'أسد البحر'],
    ['حريره', 'حريرة'],
    ['  كسكس  ', 'كسكس'],
    ['كسكسو', 'كسكس'],
    ['فروزن', 'ملكة الثلج'],
    ['كازابلانكا', 'الدار البيضاء'],
    ['الدارالبيضاء', 'الدار البيضاء'],
    ['ملكه الثلج', 'ملكة الثلج'],
    ['حول العالم في ٨٠ يوما', 'حول العالم في 80 يوما'],
    ['حول العالم في ثمانين يوما', 'حول العالم في 80 يوما'],
    ['شطرنج', 'الشطرنج'],
    ['بالشطرنج', 'الشطرنج'],
    ['ابن الوز عوام', 'ابن البط عوام'],
    ['في الاتحاد قوه', 'في الاتحاد قوة'],
    ['الكاراتي', 'الكاراتيه'],
    ['السكوت من ذهب', 'الكلام من فضة والسكوت من ذهب'],
    ['الكلام من فضه والسكوت من دهب', 'الكلام من فضة والسكوت من ذهب'],
    ['ميكانيكى', 'ميكانيكي'],
    ['سبايدرمان', 'الرجل العنكبوت'],
    ['سبايدر مان', 'الرجل العنكبوت'],
  ];
  for (const [typed, answer] of ok) expect([typed, emojiMatches(typed, byAnswer(answer))]).toEqual([typed, true]);
});

test('emoji match: other words, half a proverb and near-twins of short words are refused', () => {
  const no: [string, string][] = [
    ['القط', 'الكلب'],
    ['قرد', 'القطة'],
    ['الصبر', 'الصبر مفتاح الفرج'],
    ['الصبر مفتاح', 'الصبر مفتاح الفرج'],
    ['طنجية', 'طاجين'],
    ['طبيب', 'طبيب أسنان'],
    ['طبيب أسنان', 'طبيب'],
    ['ال', 'الأسد'],
    ['', 'الأسد'],
    ['؟؟', 'الأسد'],
    ['🦁', 'الأسد'],
    ['باريس', 'المغرب'],
    ['مكة', 'مصر'],
    ['الغسالة', 'غسالة الصحون'],
    ['كرة اليد', 'كرة القدم'],
    ['ملك الغابة', 'الأسد الملك'],
  ];
  for (const [typed, answer] of no) expect([typed, emojiMatches(typed, byAnswer(answer))]).toEqual([typed, false]);
  // short words: no slip at all
  expect(matchesForm('قلب', 'كلب')).toBe(false);
  expect(matchesForm('سعد', 'سعيد')).toBe(false);
});

/* ------------------------------------------------------------------ */
/* Scoring and the hint                                                */
/* ------------------------------------------------------------------ */

test('emoji scoring: 10 right, +5 typed, up to +5 for speed, half after the hint', () => {
  expect(emojiPoints(true, 'options', 0, 30000, false)).toBe(15);
  expect(emojiPoints(true, 'typed', 0, 30000, false)).toBe(20);
  expect(emojiPoints(true, 'typed', 15000, 30000, false)).toBe(18);
  expect(emojiPoints(true, 'typed', 30000, 30000, true)).toBe(8);
  expect(emojiPoints(true, 'options', 15000, 30000, true)).toBe(7);
  expect(emojiPoints(true, 'typed', 18000, 30000, true)).toBe(9);
  expect(emojiPoints(false, 'typed', 1000, 30000, false)).toBe(0);
  // never more after the hint than before it
  for (let ms = 0; ms <= 20000; ms += 500) expect(emojiPoints(true, 'typed', ms, 20000, ms >= 10000)).toBeLessThanOrEqual(emojiPoints(true, 'typed', Math.min(ms, 9999), 20000, false));
});

test('emoji: a typed round — the hint comes out halfway, later answers score half, wrong ones nothing', () => {
  const ctx = fakeCtx();
  const s = startEmoji(ctx, ['a', 'b', 'c', 'd'], { rounds: 8, seconds: 30, mode: 'typed', category: 'proverbs' }, seeded(4));
  const p = s.items[0].puzzle;
  const t0 = ctx.now;
  expect(view(ctx, s, 'a').hint).toBeNull();
  ctx.now = t0 + 3000;
  emoji.act(ctx, s, 'a', { type: 'answer', round: 1, text: p.answer });
  ctx.now = t0 + 14000;
  emoji.act(ctx, s, 'c', { type: 'answer', round: 1, text: 'شيء آخر تماما' });
  expect(emoji.tick!(ctx, s)).toBe(false);
  ctx.now = t0 + 15000;
  expect(emoji.tick!(ctx, s)).toBe(true);
  const h = view(ctx, s, 'b').hint!;
  expect(h.text).toBe(p.hint);
  expect(h.words).toBe(p.answer.split(' ').length);
  expect(h.letter).toBe(typedHint(p.answer).letter);
  expect(h.removed).toEqual([]);
  ctx.now = t0 + 18000;
  emoji.act(ctx, s, 'b', { type: 'answer', round: 1, text: ` ${p.answer}. ` });
  expect(s.phase).toBe('ask'); // d is still thinking
  ctx.now = t0 + 30000;
  emoji.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  const r = Object.fromEntries(s.results!.map((x) => [x.id, x]));
  expect(r.a).toMatchObject({ correct: true, late: false, points: 20 });
  expect(r.b).toMatchObject({ correct: true, late: true, points: 9, text: p.answer + '.' });
  expect(r.c).toMatchObject({ correct: false, points: 0 });
  expect(r.d).toMatchObject({ correct: false, text: null, choice: null, points: 0 });
  expect(s.rights).toEqual({ a: 1, b: 1 });
  expect(ctx.said.at(-1)?.text).toBe('أسرع إجابة صحيحة: a');
});

test('emoji: an options round — two wrong options go at the hint and can no longer be picked', () => {
  const ctx = fakeCtx();
  const s = startEmoji(ctx, ['a', 'b', 'c'], { rounds: 8, seconds: 20, mode: 'options', category: 'food' }, seeded(5));
  const it = s.items[0];
  const t0 = ctx.now;
  const v0 = view(ctx, s, 'a');
  expect(v0.options!.length).toBe(4);
  expect(v0.correct).toBeNull();
  expect(v0.hint).toBeNull();
  emoji.act(ctx, s, 'a', { type: 'answer', round: 1, choice: 7 });
  emoji.act(ctx, s, 'a', { type: 'answer', round: 1, text: it.puzzle.answer });
  expect(s.answers.a).toBeUndefined();
  ctx.now = t0 + 2000;
  emoji.act(ctx, s, 'a', { type: 'answer', round: 1, choice: it.correct });
  emoji.act(ctx, s, 'a', { type: 'answer', round: 1, choice: (it.correct! + 1) % 4 });
  expect(s.answers.a.choice).toBe(it.correct);
  ctx.now = t0 + 10000;
  emoji.tick!(ctx, s);
  expect(view(ctx, s, 'b').hint!.removed).toEqual(it.removed);
  expect(view(ctx, s, 'b').hint!.letter).toBeNull();
  emoji.act(ctx, s, 'b', { type: 'answer', round: 1, choice: it.removed[0] });
  expect(s.answers.b).toBeUndefined();
  emoji.act(ctx, s, 'b', { type: 'answer', round: 1, choice: it.correct });
  ctx.now = t0 + 12000;
  const kept = [0, 1, 2, 3].find((i) => i !== it.correct && !it.removed.includes(i))!;
  emoji.act(ctx, s, 'c', { type: 'answer', round: 1, choice: kept });
  expect(s.phase).toBe('reveal');
  const r = Object.fromEntries(s.results!.map((x) => [x.id, x]));
  expect(r.a.points).toBe(15); // 10 + round(5 * 18/20)
  expect(r.b).toMatchObject({ late: true, points: 7 }); // ceil((10 + round(5 * 10/20)) / 2)
  expect(r.c.points).toBe(0);
  expect(view(ctx, s, 'c').correct).toBe(it.correct);
});

/* ------------------------------------------------------------------ */
/* Timeouts, no leak, host, settings                                   */
/* ------------------------------------------------------------------ */

test('emoji: nobody answers — the time runs out, nobody scores, the reveal moves on by itself', () => {
  const ctx = fakeCtx();
  const s = startEmoji(ctx, ['a', 'b'], { rounds: 8, seconds: 20, mode: 'typed', category: 'mix' }, seeded(6));
  ctx.now += 19999;
  emoji.tick!(ctx, s);
  expect(s.phase).toBe('ask');
  ctx.now += 1;
  emoji.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  expect(s.results!.every((r) => r.points === 0 && r.text === null)).toBe(true);
  expect(ctx.said.at(-1)?.text).toBe('لا إجابة صحيحة في هذه الجولة');
  // too late: refused
  emoji.act(ctx, s, 'a', { type: 'answer', round: 1, text: s.items[0].puzzle.answer });
  expect(s.answers.a).toBeUndefined();
  ctx.now += EMOJI_REVEAL_MS;
  emoji.tick!(ctx, s);
  expect(s.phase).toBe('ask');
  expect(s.round).toBe(1);
  // an answer for the old round is ignored
  emoji.act(ctx, s, 'a', { type: 'answer', round: 1, text: s.items[1].puzzle.answer });
  expect(s.answers.a).toBeUndefined();
  // the host moves on from a reveal; nobody else can, and «next» does nothing while asking
  emoji.act(ctx, s, 'a', { type: 'next' });
  expect(s.round).toBe(1);
  expect(emoji.hostOnly).toContain('next');
});

test('emoji: before the reveal a phone gets no answer, explanation, alternatives or right option', () => {
  for (const mode of ['typed', 'options'] as const) {
    const ctx = fakeCtx();
    const s = startEmoji(ctx, ['a', 'b'], { rounds: 15, seconds: 30, mode, category: 'mix' }, seeded(mode === 'typed' ? 7 : 8));
    expect(s.items.length).toBe(15);
    for (let r = 0; r < 15; r++) {
      const it = s.items[s.round];
      const p = it.puzzle;
      for (const at of [0, 16000]) {
        ctx.now = s.startedAt + at;
        emoji.tick!(ctx, s);
        const v = view(ctx, s, 'a');
        const json = JSON.stringify(v);
        expect(v.answer).toBeNull();
        expect(v.explanation).toBeNull();
        expect(v.correct).toBeNull();
        expect(v.results).toBeNull();
        expect(json.includes(p.explain)).toBe(false);
        if (mode === 'typed') {
          expect(v.options).toBeNull();
          for (const f of [p.answer, ...p.alt]) if ([...f].length >= 3) expect([p.id, json.includes(f)]).toEqual([p.id, false]);
        } else {
          // the answer is one of the four options, like the others
          expect(v.options!.filter((o) => o === p.answer).length).toBe(1);
          const shownText = [...v.options!, v.hint?.text ?? ''].join(' ');
          for (const f of p.alt) if (!shownText.includes(f) && [...f].length >= 3) expect([p.id, f, json.includes(f)]).toEqual([p.id, f, false]);
        }
        if (at === 0) expect(v.hint).toBeNull();
        else expect(v.hint).not.toBeNull();
      }
      // b's answer is not visible to a, only that b has answered
      const kept = [0, 1, 2, 3].find((i) => i !== it.correct && !it.removed.includes(i));
      emoji.act(ctx, s, 'b', mode === 'typed' ? { type: 'answer', round: s.round + 1, text: 'جواب بي السري' } : { type: 'answer', round: s.round + 1, choice: kept });
      const va = view(ctx, s, 'a');
      expect(va.answered).toEqual(['b']);
      expect(va.myText).toBeNull();
      expect(va.myChoice).toBeNull();
      expect(JSON.stringify(va).includes('جواب بي السري')).toBe(false);
      expect(view(ctx, s, 'b').myText ?? view(ctx, s, 'b').myChoice).not.toBeNull();
      emoji.act(ctx, s, 'a', mode === 'typed' ? { type: 'answer', round: s.round + 1, text: p.answer } : { type: 'answer', round: s.round + 1, choice: it.correct });
      expect(s.phase).toBe('reveal');
      const rv = view(ctx, s, 'b');
      expect(rv.answer).toBe(p.answer);
      expect(rv.explanation).toBe(p.explain);
      if (mode === 'options') expect(rv.correct).toBe(it.correct);
      ctx.now = s.endsAt!;
      emoji.tick!(ctx, s);
    }
    expect(s.phase).toBe('final');
    expect(emoji.result!(s)!.places[0]).toEqual(['a']);
    expect(new Set(s.items.map((i) => i.puzzle.id)).size).toBe(15);
  }
});

test('emoji: settings — rounds, seconds, mode and category validated; mix goes through the categories', () => {
  expect(sanitizeEmoji(DEFAULT_SETTINGS.emoji)).toEqual(EMOJI_DEFAULTS);
  expect(sanitizeEmoji({ rounds: 14, seconds: 26, mode: 'options', category: 'sports' })).toEqual({ rounds: 15, seconds: 30, mode: 'options', category: 'sports' });
  expect(sanitizeEmoji({ rounds: 'x' as never, seconds: 5, mode: 'voice' as never, category: 'mars' as never })).toEqual({ ...EMOJI_DEFAULTS, seconds: 20 });
  const st = { ...EMOJI_DEFAULTS };
  emoji.patchSettings!(st, { rounds: 8, category: 'animals' });
  expect(st).toMatchObject({ rounds: 8, category: 'animals', mode: 'typed', seconds: 30 });
  emoji.patchSettings!(st, { category: 'nowhere', mode: 'options', seconds: 20 });
  expect(st).toMatchObject({ category: 'mix', mode: 'options', seconds: 20 });
  const ctx = fakeCtx();
  const one = startEmoji(ctx, ['a'], { rounds: 15, seconds: 20, mode: 'typed', category: 'home' }, seeded(9));
  expect(one.items.every((i) => i.puzzle.cat === 'home')).toBe(true);
  const mix = startEmoji(ctx, ['a'], { rounds: 8, seconds: 20, mode: 'typed', category: 'mix' }, seeded(9));
  expect(new Set(mix.items.map((i) => i.puzzle.cat)).size).toBe(8);
  // the room's deck: the next game of the same category brings other puzzles
  const again = startEmoji(ctx, ['a'], { rounds: 8, seconds: 20, mode: 'typed', category: 'home' }, seeded(10));
  const seen = new Set(one.items.map((i) => i.puzzle.id));
  expect(again.items.filter((i) => seen.has(i.puzzle.id)).length).toBeLessThan(8);
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('emoji: a player who leaves is dropped; the round ends when the rest have answered; nobody left ends the game', () => {
  const ctx = fakeCtx();
  const s = startEmoji(ctx, ['a', 'b', 'c'], { rounds: 8, seconds: 30, mode: 'typed', category: 'jobs' }, seeded(11));
  emoji.act(ctx, s, 'a', { type: 'answer', round: 1, text: s.items[0].puzzle.answer });
  emoji.act(ctx, s, 'b', { type: 'answer', round: 1, text: 'لا أعرف' });
  expect(s.phase).toBe('ask');
  emoji.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.participants).toEqual(['a', 'b']);
  expect(s.results!.map((r) => r.id)).toEqual(['a', 'b']);
  // an offline player is not waited for
  ctx.now = s.endsAt!;
  emoji.tick!(ctx, s);
  ctx.offline.add('b');
  emoji.act(ctx, s, 'a', { type: 'answer', round: 2, text: 'شيء' });
  expect(s.phase).toBe('reveal');
  emoji.onLeave!(ctx, s, 'a');
  emoji.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('final');
  expect(emoji.result!(s)).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('emoji bots: right more often at a higher level and on easier puzzles; human timing', () => {
  const rnd = seeded(12);
  const rate = (level: 'easy' | 'smart' | 'expert', d: 1 | 2 | 3) => {
    const pool = EMOJI_PUZZLES.filter((p) => p.difficulty === d);
    let right = 0;
    for (let k = 0; k < 600; k++) {
      const p = pool[k % pool.length];
      const m = botMove(level, 'typed', { puzzle: p, options: null, correct: null, removed: [] }, EMOJI_PUZZLES, 30000, 15000, rnd);
      expect(m.delay).toBeGreaterThanOrEqual(1500);
      expect(m.delay).toBeLessThanOrEqual(29600);
      expect(emojiMatches(m.text!, p)).toBe(m.right);
      if (m.right) right++;
    }
    return right / 600;
  };
  for (const d of [1, 2, 3] as const) {
    const r = { easy: rate('easy', d), smart: rate('smart', d), expert: rate('expert', d) };
    expect(r.expert).toBeGreaterThan(r.smart);
    expect(r.smart).toBeGreaterThan(r.easy);
    expect(r.expert).toBeLessThan(1);
  }
  expect(rate('expert', 1)).toBeGreaterThan(rate('expert', 3));
  for (const lv of ['easy', 'smart', 'expert'] as const) expect(EMOJI_BOT_KNOWS[lv][0]).toBeGreaterThan(EMOJI_BOT_KNOWS[lv][2]);
});

test('emoji bots: a wrong typed answer is a near miss, never accepted, and in the same category', () => {
  const rnd = seeded(13);
  for (const p of EMOJI_PUZZLES) {
    const miss = nearMiss(p, EMOJI_PUZZLES, rnd);
    expect([p.id, emojiMatches(miss, p)]).toEqual([p.id, false]);
    const other = EMOJI_PUZZLES.find((q) => q.answer === miss);
    if (other) expect(other.cat).toBe(p.cat);
    else expect(p.answer.startsWith(miss)).toBe(true); // the proverb cut short
  }
});

test('emoji bots: an options bot never picks an option the hint removed after it, and some answer after the hint', () => {
  const rnd = seeded(14);
  let late = 0;
  const p: EmojiPuzzle = byAnswer('الصبر مفتاح الفرج');
  for (let k = 0; k < 300; k++) {
    const o = makeOptions(p, rnd);
    const m = botMove('smart', 'options', { puzzle: p, ...o }, EMOJI_PUZZLES, 20000, 10000, rnd);
    if (m.delay >= 10000) {
      late++;
      expect(o.removed).not.toContain(m.choice);
    }
    expect(m.right).toBe(m.choice === o.correct);
  }
  expect(late).toBeGreaterThan(20);
});

test('emoji bots: whole games at every level, both modes, never seeing the answer in their view', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    for (const mode of ['typed', 'options'] as const) {
      const bots = ['b1', 'b2', 'b3'];
      const ctx = fakeCtx(bots, level);
      const s = startEmoji(ctx, bots, { rounds: 12, seconds: 20, mode, category: 'mix' }, seeded(15));
      let late = 0;
      playOut(emoji as never, ctx, s, bots, (st) => {
        if (st.phase === 'ask') expect(view(ctx, st, 'b2').answer).toBeNull();
        if (st.phase === 'reveal') late += st.results!.filter((r) => r.late).length;
      });
      expect(s.phase).toBe('final');
      expect(s.items.length).toBe(12);
      expect(late).toBeGreaterThan(0);
      expect(emoji.result!(s)?.places.flat().sort()).toEqual(bots);
      const total = Object.values(s.scores).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
    }
  }
});

test('emoji bots: a bot plays next to people, one answer per round', () => {
  const ctx = fakeCtx(['bot1']);
  const s = startEmoji(ctx, ['me', 'bot1'], { rounds: 8, seconds: 30, mode: 'typed', category: 'animals' }, seeded(16));
  emoji.botPlan!(ctx, s, ['bot1']);
  emoji.botPlan!(ctx, s, ['bot1']);
  expect(ctx.jobs.filter((j) => j.by === 'bot1').length).toBe(1);
  const job = ctx.jobs[0];
  expect(job.at - s.startedAt).toBeGreaterThanOrEqual(1500);
  ctx.now = job.at;
  emoji.act(ctx, s, job.by, job.a);
  expect(s.answers.bot1).toBeDefined();
  expect(s.phase).toBe('ask'); // waits for me
});
