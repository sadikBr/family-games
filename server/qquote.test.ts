import { expect, test } from 'bun:test';

import { QQUOTE_DEFAULTS, type QquoteSettings } from '../src/shared/games/qquote';
import { qquote, qquotePool, REVEAL_MS } from './games/qquote';
import { quranData } from './games/surah';
import { QQUOTES, SP } from './qquote-content';
import { quranFull, verseSlice, verseText, verseWords } from './qquote-quran';
import { GameError } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: any;
}

/** A tiny room: a clock, bot jobs de-duplicated by key, the fx log. */
function fakeCtx(opts: { bots?: string[]; offline?: string[] } = {}) {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fxs: string[] = [];
  const ctx: any = {
    now: 1_000_000,
    jobs,
    keys,
    fxs,
    fx: (k: string, t?: string) => fxs.push(t ? `${k}:${t}` : k),
    isConnected: (id: string) => !(opts.offline ?? []).includes(id),
    isBot: (id: string) => (opts.bots ?? []).includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + delay, by, key: k, a });
    },
  };
  return ctx;
}

const settings = (o: Partial<QquoteSettings> = {}): QquoteSettings => ({ ...QQUOTE_DEFAULTS, ...o });

test('quran data: the complete text, 114 surahs and 6236 verses', () => {
  const q = quranFull();
  expect(q.surahs.length).toBe(114);
  expect(q.verses.length).toBe(6236);
  expect(q.surahs.reduce((n, s) => n + s.count, 0)).toBe(6236);
  for (const s of q.surahs) expect(q.verses.filter((v) => v[0] === s.n).length).toBe(s.count);
  expect(q.source).toContain('quranenc.com');
  expect(q.source).toContain('CC BY-SA 4.0');
  // short verses filtered out of «من أي سورة؟»'s copy are here
  expect(verseText(108, 1)).toBeTruthy();
  expect(verseText(55, 13)).toBeTruthy();
  expect(verseText(114, 6)).toBeTruthy();
  expect(verseText(114, 7)).toBeNull();
  expect(verseWords(verseText(1, 1)!).length).toBe(4);
  // same source as «من أي سورة؟»'s filtered copy: every verse there is here, letter for letter
  const filtered = quranData();
  expect(filtered.surahs).toEqual(q.surahs);
  for (const [s, a, t] of filtered.verses) expect(verseText(s, a)).toBe(t);
});

test('content: 60+ entries, each pointing to an existing verse, with a non-empty slice cut on word boundaries', () => {
  expect(QQUOTES.length).toBeGreaterThanOrEqual(60);
  for (const q of QQUOTES) {
    const full = verseText(q.surah, q.ayah);
    expect(full, `${q.surah}:${q.ayah}`).toBeTruthy();
    const words = verseWords(full!);
    if (q.from !== undefined) expect(q.from).toBeGreaterThanOrEqual(1);
    if (q.to !== undefined) expect(q.to).toBeLessThanOrEqual(words.length);
    if (q.from !== undefined && q.to !== undefined) expect(q.from).toBeLessThanOrEqual(q.to);
    const slice = verseSlice(q.surah, q.ayah, q.from, q.to);
    expect(slice, `${q.surah}:${q.ayah}`).toBeTruthy();
    // the slice is made of whole words of the verse, in order, untouched
    expect(full!.includes(slice!.split(' ')[0])).toBe(true);
    expect(words.join(' ').includes(slice!)).toBe(true);
    // the speaker is a known one, never among the wrong names; at least 3 distinct wrong names
    expect(Object.values(SP)).toContain(q.speaker as any);
    for (const w of q.wrong) expect(Object.values(SP)).toContain(w as any);
    expect(q.wrong).not.toContain(q.speaker);
    expect(new Set(q.wrong).size).toBe(q.wrong.length);
    expect(q.wrong.length).toBeGreaterThanOrEqual(3);
    expect([1, 2, 3]).toContain(q.level);
  }
  // no quote twice
  const ids = QQUOTES.map((q) => `${q.surah}:${q.ayah}:${q.from ?? 1}`);
  expect(new Set(ids).size).toBe(ids.length);
});

test('content: the shown words never contain the speaker’s own name', () => {
  const names: Record<string, string[]> = {
    [SP.luqman]: ['لُقۡمَٰن'],
    [SP.yusuf]: ['يُوسُف'],
    [SP.yaqub]: ['يَعۡقُوب'],
    [SP.pharaoh]: ['فِرۡعَوۡن'],
    [SP.musa]: ['مُوسَىٰ'],
    [SP.harun]: ['هَٰرُون'],
    [SP.sulayman]: ['سُلَيۡمَٰن'],
    [SP.ibrahim]: ['إِبۡرَٰهِ'],
    [SP.nuh]: ['نُوح'],
    [SP.maryam]: ['مَرۡيَم'],
    [SP.zakariya]: ['زَكَرِيَّ'],
    [SP.isa]: ['عِيسَىٰ'],
    [SP.qarun]: ['قَٰرُون'],
    [SP.iblis]: ['إِبۡلِيس'],
  };
  for (const q of QQUOTES) {
    const text = verseSlice(q.surah, q.ayah, q.from, q.to)!;
    for (const n of names[q.speaker] ?? []) expect(text.includes(n), `${q.surah}:${q.ayah}`).toBe(false);
  }
});

test('levels: easy ⊂ medium ⊂ hard, each big enough for a game', () => {
  const easy = qquotePool('easy'), medium = qquotePool('medium'), hard = qquotePool('hard');
  expect(easy.length).toBeGreaterThanOrEqual(20);
  expect(medium.length).toBeGreaterThan(easy.length);
  expect(hard.length).toBe(QQUOTES.length);
  for (const q of easy) expect(medium).toContain(q);
});

test('a game: 4 distinct options with the speaker, scoring by speed, reference after the reveal', () => {
  const ctx = fakeCtx();
  const s: any = qquote.start(ctx, ['a', 'b', 'c'], settings({ rounds: 5, seconds: 20, level: 'hard' }));
  expect(s.items.length).toBe(5);
  for (const it of s.items) {
    expect(it.options.length).toBe(4);
    expect(new Set(it.options).size).toBe(4);
    expect(it.text.length).toBeGreaterThan(0);
    expect(it.ref).toMatch(/^سورة .+ — الآية \d+$/);
  }
  expect(ctx.fxs).toContain('start');
  const v0: any = qquote.view(ctx, s, 'a');
  expect(v0.phase).toBe('ask');
  expect(v0.correct).toBeNull();
  expect(v0.ref).toBeNull();
  expect(qquote.turnOf!(s)).toEqual(['a', 'b', 'c']);

  const item = s.items[0];
  const wrong = (item.correct + 1) % 4;
  ctx.now += 5000;
  qquote.act(ctx, s, 'a', { type: 'answer', choice: item.correct });
  qquote.act(ctx, s, 'a', { type: 'answer', choice: wrong }); // a second answer is ignored
  expect(s.answers.a.choice).toBe(item.correct);
  qquote.act(ctx, s, 'b', { type: 'answer', choice: 9 }); // out of range: ignored
  qquote.act(ctx, s, 'b', { type: 'answer', choice: 1.5 });
  expect(s.answers.b).toBeUndefined();
  ctx.now += 5000;
  qquote.act(ctx, s, 'b', { type: 'answer', choice: wrong });
  expect(s.phase).toBe('ask');
  expect(qquote.turnOf!(s)).toEqual(['c']);
  qquote.act(ctx, s, 'c', { type: 'answer', choice: item.correct }); // last one in: reveal at once
  expect(s.phase).toBe('reveal');
  const r = Object.fromEntries(s.results.map((x: any) => [x.id, x]));
  expect(r.a.points).toBe(500 + Math.round((500 * 15000) / 20000));
  expect(r.b.points).toBe(0);
  expect(r.c.points).toBe(500 + Math.round((500 * 10000) / 20000));
  expect(r.a.points).toBeGreaterThan(r.c.points);
  const v1: any = qquote.view(ctx, s, 'b');
  expect(v1.correct).toBe(item.correct);
  expect(v1.ref).toBe(item.ref);
  expect(v1.myAnswer).toBe(wrong);

  // the timer ends a question nobody answers
  ctx.now += REVEAL_MS;
  qquote.tick!(ctx, s);
  expect(s.round).toBe(2);
  ctx.now += 20_000;
  qquote.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  expect(s.results.every((x: any) => x.points === 0)).toBe(true);
});

test('decks: questions do not come back in the same room until the level is used up', () => {
  const ctx = fakeCtx();
  const pool = qquotePool('easy').length;
  const seen = new Set<string>();
  let n = 0;
  while (n + 5 <= pool) {
    const s: any = qquote.start(ctx, ['a'], settings({ rounds: 5, level: 'easy' }));
    for (const it of s.items) seen.add(it.text);
    n += 5;
    expect(seen.size).toBe(n);
  }
});

test('settings: validated and clamped', () => {
  const st = settings();
  qquote.patchSettings!(st, { rounds: 999, seconds: 3, level: 'nope' });
  expect(st).toEqual({ rounds: 20, seconds: 10, level: 'easy' });
  qquote.patchSettings!(st, { rounds: 12, seconds: 27, level: 'hard' });
  expect(st).toEqual({ rounds: 10, seconds: 25, level: 'hard' });
  qquote.patchSettings!(st, { rounds: '7' });
  expect(st.rounds).toBe(10);
});

test('onLeave: the leaver drops out and the question is revealed when everyone left has answered', () => {
  const ctx = fakeCtx();
  const s: any = qquote.start(ctx, ['a', 'b', 'c'], settings({ rounds: 5 }));
  qquote.act(ctx, s, 'a', { type: 'answer', choice: 0 });
  qquote.act(ctx, s, 'b', { type: 'answer', choice: 1 });
  qquote.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.participants).toEqual(['a', 'b']);
  expect('c' in s.scores).toBe(false);
  // an offline player does not hold the question up either
  const ctx2 = fakeCtx({ offline: ['b'] });
  const s2: any = qquote.start(ctx2, ['a', 'b'], settings({ rounds: 5 }));
  qquote.act(ctx2, s2, 'a', { type: 'answer', choice: 2 });
  expect(s2.phase).toBe('reveal');
});

/** Runs a game with bots only (and any `humans` idle) until 'final'. */
function runBots(mod: any, s: any, ctx: any, bots: string[], maxSteps = 20_000) {
  for (let step = 0; step < maxSteps && s.phase !== 'final'; step++) {
    mod.botPlan(ctx, s, bots);
    const next = Math.min(...ctx.jobs.map((j: Job) => j.at), s.endsAt ?? Infinity);
    if (next === Infinity) throw new Error('stuck');
    ctx.now = Math.max(ctx.now, next);
    const due = ctx.jobs.filter((j: Job) => j.at <= ctx.now);
    ctx.jobs.splice(0, ctx.jobs.length, ...ctx.jobs.filter((j: Job) => j.at > ctx.now));
    for (const j of due) {
      try {
        mod.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
    }
    mod.tick(ctx, s);
  }
  return s;
}

test('a full game with bots only reaches the final screen, with one win sound', () => {
  for (const level of ['easy', 'medium', 'hard'] as const) {
    const bots = ['b1', 'b2', 'b3', 'b4'];
    const ctx = fakeCtx({ bots });
    const s: any = qquote.start(ctx, bots, settings({ rounds: 10, seconds: 15, level }));
    runBots(qquote, s, ctx, bots);
    expect(s.phase).toBe('final');
    expect(s.round).toBe(10);
    expect(ctx.fxs.filter((f: string) => f.startsWith('win')).length).toBe(1);
    expect(Object.values(s.scores).some((v: any) => v > 0)).toBe(true);
    const v: any = qquote.view(ctx, s, 'b1');
    expect(v.phase).toBe('final');
  }
  // twelve players, a human who never answers: the timer moves the game on
  const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const bots = ids.slice(1);
  const ctx = fakeCtx({ bots });
  const s: any = qquote.start(ctx, ids, settings({ rounds: 5 }));
  runBots(qquote, s, ctx, bots);
  expect(s.phase).toBe('final');
  expect(s.scores.p0).toBe(0);
});
