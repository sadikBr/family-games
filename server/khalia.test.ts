/**
 * «خلية الحروف» — letter keys, the word rules (length, hive letters only, the centre letter, «ال», the
 * strict 3-letter words, the big dictionary from 4 letters), points and «كلمة الخلية», ranks, the answer
 * words and the choice of a hive (quality and speed), the timer and the rounds, «انتهيت», no leak of
 * other players' words before the end, bots (pace and strength), leaving, settings.
 */
import { expect, test } from 'bun:test';

import {
  KHALIA_DEFAULTS,
  KHALIA_PANGRAM_BONUS,
  KHALIA_RANKS,
  khaliaKey,
  khaliaLetter,
  khaliaPangram,
  khaliaPoints,
  khaliaPrecheck,
  khaliaRank,
  type KhaliaSettings,
  type KhaliaView,
} from '../src/shared/games/khalia';
import { DEFAULT_SETTINGS, type BotLevel } from '../src/shared/protocol';
import { KHALIA_REVEAL_MS, botPlanFor, khalia, sanitizeKhalia, startKhalia, type KhaliaState } from './games/khalia';
import { ANSWERS_MAX, ANSWERS_MIN, buildHive, checkWord, hiveCandidates, hiveLetters, khaliaWords, maskOf, pickHive, type Hive } from './khalia-hive';
import { isWord } from './scrabble-dict';
import type { GameCtx } from './types';

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

const settings = (o: Partial<KhaliaSettings> = {}): KhaliaSettings => ({ ...KHALIA_DEFAULTS, ...o });
const act = (ctx: Ctx, s: KhaliaState, by: string, a: Record<string, unknown>) => khalia.act(ctx, s, by, a as never);
const view = (ctx: Ctx, s: KhaliaState, me: string) => khalia.view(ctx, s, me) as KhaliaView;
const word = (ctx: Ctx, s: KhaliaState, by: string, w: string) => act(ctx, s, by, { type: 'word', word: w });

/** The hive of «يتطلعون» with ن in the centre. */
const HIVE = () => buildHive(maskOf('يتطلعون'), 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.indexOf('ن'), seeded(2));

function withHive(ctx: Ctx, players: string[], o: Partial<KhaliaSettings> = {}, hive: Hive = HIVE()) {
  const s = startKhalia(ctx, players, settings(o));
  s.hive = hive;
  return s;
}

/** Run the bots' scheduled words up to `until`. */
function runJobs(ctx: Ctx, s: KhaliaState, until: number) {
  ctx.jobs.sort((a, b) => a.at - b.at);
  while (ctx.jobs.length && ctx.jobs[0].at <= until) {
    const j = ctx.jobs.shift()!;
    ctx.now = Math.max(ctx.now, j.at);
    khalia.act(ctx, s, j.by, j.a as never);
  }
}

/* ------------------------------------------------------------------ */

test('letter keys: hamza seats, ة, ى, ئ, ؤ, diacritics, lam-alif, keyboard letters', () => {
  expect(khaliaKey('أإآٱء')).toBe('ااااا');
  expect(khaliaKey('مدرسة')).toBe('مدرسه');
  expect(khaliaKey('مستشفى')).toBe('مستشفي');
  expect(khaliaKey('بئر')).toBe('بير');
  expect(khaliaKey('مؤمن')).toBe('مومن');
  expect(khaliaKey('يَتَطَلَّعُونَ')).toBe('يتطلعون');
  expect(khaliaKey('ﻻ')).toBe('لا');
  expect(khaliaKey('کتاب ـ 1!')).toBe('كتاب');
  expect(khaliaLetter('ی')).toBe('ي');
  expect(khaliaLetter('ڤ')).toBe('ف');
  expect(khaliaLetter('a')).toBeNull();
  expect(khaliaLetter('َ')).toBeNull();
});

test('points: 3 letters = 1, longer = its length, «كلمة الخلية» + 7; ranks by share of the maximum', () => {
  expect(khaliaPoints(2, false)).toBe(0);
  expect(khaliaPoints(3, false)).toBe(1);
  expect(khaliaPoints(4, false)).toBe(4);
  expect(khaliaPoints(6, false)).toBe(6);
  expect(khaliaPoints(7, true)).toBe(7 + KHALIA_PANGRAM_BONUS);
  expect(khaliaPangram('يتطلعون', [...'نيتطلعو'])).toBe(true);
  expect(khaliaPangram('وطن', [...'نيتطلعو'])).toBe(false);
  expect(khaliaRank(0, 100)).toBe(0);
  expect(khaliaRank(10, 100)).toBe(1);
  expect(khaliaRank(69, 100)).toBe(3);
  expect(khaliaRank(70, 100)).toBe(KHALIA_RANKS.length - 1);
  expect(khaliaRank(150, 100)).toBe(KHALIA_RANKS.length - 1);
  expect(khaliaRank(5, 0)).toBe(0);
});

test('word rules: length, hive letters only, the centre letter, found before, «ال»', () => {
  const h = HIVE();
  const letters = hiveLetters(h);
  expect(letters).toHaveLength(7);
  expect(new Set(letters).size).toBe(7);
  expect(h.centre).toBe('ن');
  expect(khaliaPrecheck('نو', 'ن', letters)).toBe('كلمة قصيرة');
  expect(checkWord(h, 'نو', new Set())).toEqual({ ok: false, text: 'كلمة قصيرة' });
  expect(checkWord(h, 'كتب', new Set())).toEqual({ ok: false, text: 'حروف الخلية فقط' });
  expect(checkWord(h, 'تلو', new Set())).toEqual({ ok: false, text: 'حرف المركز ناقص' });
  const v = checkWord(h, 'وطن', new Set());
  expect(v).toEqual({ ok: true, word: { word: 'وطن', key: 'وطن', points: 1, pangram: false } });
  expect(checkWord(h, 'وطن', new Set(['وطن']))).toEqual({ ok: false, text: 'وُجدت من قبل' });
  // a letter may come back; the word is turned into keys (diacritics, hamza)
  expect(checkWord(h, 'نُون', new Set())).toMatchObject({ ok: true, word: { key: 'نون' } });
  // «ال» + a word is refused (ا is not even in this hive: build one with it)
  const h2 = buildHive(maskOf('الوطنيت'), 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.indexOf('ن'));
  expect(checkWord(h2, 'الوطن', new Set())).toEqual({ ok: false, text: 'بلا «ال» التعريف' });
  expect(checkWord(h2, 'الوطن', new Set()).ok).toBe(false);
});

test('word rules: 3-letter words only from the answer list; longer ones from the big dictionary too', () => {
  const h = HIVE();
  const letters = hiveLetters(h);
  // every 3-letter string of the hive with the centre: accepted exactly when it is an answer word
  let strict = 0;
  for (const a of letters)
    for (const b of letters)
      for (const c of letters) {
        const k = a + b + c;
        if (!k.includes('ن')) continue;
        const v = checkWord(h, k, new Set());
        expect(v.ok).toBe(h.answers.has(k));
        if (!h.answers.has(k) && isWord(k)) strict++;
      }
  // the big dictionary knows many 3-letter strings the game refuses
  expect(strict).toBeGreaterThan(0);
  // a longer word the answer list does not have but the dictionary knows still counts
  let extra: string | null = null;
  for (const a of letters)
    for (const b of letters)
      for (const c of letters)
        for (const d of letters) {
          const k = a + b + c + d;
          if (extra || !k.includes('ن') || h.answers.has(k) || k.startsWith('ال') || !isWord(k)) continue;
          extra = k;
        }
  expect(extra).not.toBeNull();
  expect(checkWord(h, extra!, new Set())).toMatchObject({ ok: true, word: { key: extra, points: 4 } });
  // nonsense
  expect(checkWord(h, 'ننننن', new Set())).toEqual({ ok: false, text: 'ليست في القاموس' });
});

test('«كلمة الخلية» uses all seven letters: its length + 7; ء typed as ا, shown as written', () => {
  const h = HIVE();
  expect(h.pangrams).toContain('يتطلعون');
  expect(checkWord(h, 'يتطلعون', new Set())).toEqual({ ok: true, word: { word: 'يتطلعون', key: 'يتطلعون', points: 14, pangram: true } });
  const sky = buildHive(maskOf('سماكنلب'), 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.indexOf('س'));
  expect(sky.answers.get('سماا')).toBe('سماء');
  expect(checkWord(sky, 'سماا', new Set())).toMatchObject({ ok: true, word: { word: 'سماء', points: 4 } });
  expect(checkWord(sky, 'سماء', new Set())).toMatchObject({ ok: true, word: { word: 'سماء' } });
});

test('the answer words: spelled, no «ال» + word, no names of the films, keys unique', () => {
  const { list, byKey } = khaliaWords();
  expect(list.length).toBeGreaterThan(10_000);
  expect(byKey.size).toBe(list.length);
  for (const w of ['مدرسة', 'سماء', 'مسؤول', 'ألوان', 'إلى', 'هذا']) expect(list.some((e) => e.word === w)).toBe(true);
  for (const k of ['الكتاب', 'البيت', 'جوني', 'هتلر', 'كيفن', 'مدرسه', 'والله', 'لله']) expect(byKey.has(khaliaKey(k)) && byKey.get(khaliaKey(k)) !== 'مدرسة').toBe(false);
  for (const e of list) {
    expect([...e.key].length).toBeGreaterThanOrEqual(3);
    if (e.key.startsWith('ال') && e.key.length >= 4 && e.word.startsWith('ال')) expect(['التي', 'الذي', 'الله']).toContain(e.word);
  }
});

test('choosing a hive: seven letters, a good answer list, a «كلمة الخلية», quickly', () => {
  const t0 = performance.now();
  const all = hiveCandidates();
  const build = performance.now() - t0;
  expect(build).toBeLessThan(3000);
  expect(all.length).toBeGreaterThan(150);
  const rand = seeded(5);
  const t1 = performance.now();
  for (let i = 0; i < 40; i++) {
    const h = pickHive(new Set(), rand);
    const letters = hiveLetters(h);
    expect(new Set(letters).size).toBe(7);
    expect(h.outer).not.toContain(h.centre);
    expect(h.answers.size).toBeGreaterThanOrEqual(ANSWERS_MIN);
    expect(h.answers.size).toBeLessThanOrEqual(ANSWERS_MAX);
    expect(h.pangrams.length).toBeGreaterThan(0);
    let max = 0;
    for (const k of h.answers.keys()) {
      expect(k.includes(h.centre)).toBe(true);
      expect([...k].every((c) => letters.includes(c))).toBe(true);
      max += khaliaPoints([...k].length, khaliaPangram(k, letters));
    }
    expect(h.max).toBe(max);
  }
  expect((performance.now() - t1) / 40).toBeLessThan(50);
  // everyday letters come up more often than rare ones
  const seen = new Map<string, number>();
  for (let i = 0; i < 300; i++) for (const l of hiveLetters(pickHive(new Set(), rand))) seen.set(l, (seen.get(l) ?? 0) + 1);
  expect(seen.get('ن') ?? 0).toBeGreaterThan(seen.get('ظ') ?? 0);
  // letters to avoid are avoided
  const h = pickHive(new Set(), rand);
  const m = maskOf(hiveLetters(h).join(''));
  for (let i = 0; i < 30; i++) expect(maskOf(hiveLetters(pickHive(new Set([m]), rand)).join(''))).not.toBe(m);
});

test('a round: words score, the feedback is mine only, the pangram is announced without the word', () => {
  const ctx = fakeCtx();
  const s = withHive(ctx, ['a', 'b']);
  word(ctx, s, 'a', 'وطن');
  word(ctx, s, 'a', 'يتطلعون');
  word(ctx, s, 'a', 'وطن');
  word(ctx, s, 'b', 'تلو');
  const va = view(ctx, s, 'a');
  expect(va.myWords.map((w) => w.word)).toEqual(['وطن', 'يتطلعون']);
  expect(va.feedback).toMatchObject({ seq: 3, kind: 'bad', text: 'وُجدت من قبل', points: 0 });
  expect(view(ctx, s, 'b').feedback).toMatchObject({ seq: 1, kind: 'bad', text: 'حرف المركز ناقص' });
  expect(va.board.find((r) => r.id === 'a')).toEqual({ id: 'a', points: 15, count: 2, done: false });
  expect(ctx.said.some((t) => t.includes('كلمة الخلية') && t.includes('اسم-a'))).toBe(true);
  expect(ctx.said.join(' ')).not.toContain('يتطلعون');
  // the pangram line
  word(ctx, s, 'b', 'يَتَطَلَّعُون');
  expect(view(ctx, s, 'b').feedback).toMatchObject({ kind: 'pangram', text: 'كلمة الخلية! +7', points: 14 });
});

test('no leak: during play another player sees counts and points only, never words', () => {
  const ctx = fakeCtx();
  const s = withHive(ctx, ['a', 'b']);
  for (const w of ['وطن', 'لون', 'عيون', 'يتطلعون']) word(ctx, s, 'a', w);
  const vb = view(ctx, s, 'b');
  expect(vb.myWords).toEqual([]);
  expect(vb.results).toBeNull();
  expect(vb.missed).toBeNull();
  expect(vb.feedback).toBeNull();
  const json = JSON.stringify(vb);
  for (const w of s.found.a) expect(json).not.toContain(w.word);
  // nor the answer list
  for (const k of s.hive.answers.keys()) expect(json).not.toContain(k);
  expect(vb.board.find((r) => r.id === 'a')!.count).toBe(s.found.a.length);
});

test('the timer ends the round: everyone\'s words, shared ones marked, the best missed words; rounds and podium', () => {
  const ctx = fakeCtx();
  const s = withHive(ctx, ['a', 'b'], { rounds: 2, minutes: 3 });
  expect(s.endsAt).toBe(ctx.now + 3 * 60_000);
  word(ctx, s, 'a', 'وطن');
  word(ctx, s, 'a', 'عيون');
  word(ctx, s, 'b', 'وطن');
  ctx.now = s.endsAt! - 1;
  expect(khalia.tick!(ctx, s)).toBe(false);
  ctx.now = s.endsAt!;
  expect(khalia.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('reveal');
  const v = view(ctx, s, 'b');
  const ra = v.results!.find((r) => r.id === 'a')!;
  expect(ra.points).toBe(5);
  expect(ra.words.find((w) => w.key === 'وطن')!.shared).toBe(true);
  expect(ra.words.find((w) => w.key === 'عيون')!.shared).toBe(false);
  expect(v.missed!.length).toBeGreaterThan(0);
  expect(v.missed![0].pangram).toBe(true);
  expect(v.missed!.some((w) => w.key === 'وطن')).toBe(false);
  expect(v.missed!.length + v.missedMore).toBe(s.hive.answers.size - 2);
  expect(s.scores).toEqual({ a: 5, b: 1 });
  expect(khalia.result!(s)).toBeNull();
  // the reveal ends on its own (or the host goes on): a new hive with other letters
  const first = maskOf(hiveLetters(s.hive).join(''));
  expect(s.endsAt).toBe(ctx.now + KHALIA_REVEAL_MS);
  ctx.now = s.endsAt!;
  khalia.tick!(ctx, s);
  expect(s.phase).toBe('play');
  expect(s.round).toBe(2);
  expect(maskOf(hiveLetters(s.hive).join(''))).not.toBe(first);
  expect(view(ctx, s, 'a').myWords).toEqual([]);
  ctx.now = s.endsAt!;
  khalia.tick!(ctx, s);
  expect(s.phase).toBe('final');
  expect(khalia.result!(s)).toEqual({ places: [['a'], ['b']] });
  expect(ctx.said.at(-1)).toContain('الفوز لـاسم-a');
});

test('«انتهيت»: the round ends when every person has pressed it; bots and people away do not wait', () => {
  const ctx = fakeCtx(['bot1']);
  const s = withHive(ctx, ['a', 'b', 'c', 'bot1'], { rounds: 2 });
  ctx.offline.add('c');
  act(ctx, s, 'a', { type: 'done' });
  expect(s.phase).toBe('play');
  word(ctx, s, 'a', 'وطن');
  expect(s.found.a).toHaveLength(0); // done: no more words
  act(ctx, s, 'b', { type: 'done' });
  expect(s.phase).toBe('reveal');
  // only the host goes on early
  expect(khalia.hostOnly).toContain('next');
  act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('play');
});

test('bots: a human pace, more and longer words for a stronger level, never a refused word', () => {
  const h = HIVE();
  const avg = (level: BotLevel) => {
    let n = 0, len = 0, pang = 0;
    for (let i = 0; i < 60; i++) {
      const p = botPlanFor(h, level, 300_000, seeded(i + 1));
      n += p.length;
      len += p.reduce((a, w) => a + [...w.key].length, 0) / Math.max(1, p.length);
      pang += p.some((w) => h.pangrams.includes(w.key)) ? 1 : 0;
      for (const w of p) {
        expect(h.answers.has(w.key)).toBe(true);
        expect(w.at).toBeGreaterThanOrEqual(3000);
        expect(w.at).toBeLessThan(300_000);
      }
      for (let j = 1; j < p.length; j++) expect(p[j].at).toBeGreaterThanOrEqual(p[j - 1].at);
    }
    return { n: n / 60, len: len / 60, pang: pang / 60 };
  };
  const e = avg('easy'), m = avg('smart'), x = avg('expert');
  expect(e.n).toBeLessThan(m.n);
  expect(m.n).toBeLessThan(x.n);
  expect(e.len).toBeLessThan(x.len);
  expect(x.pang).toBeGreaterThan(e.pang);
  expect(x.n).toBeLessThan(h.answers.size);
  // a shorter round: fewer words
  expect(botPlanFor(h, 'expert', 180_000, seeded(3)).length).toBeLessThanOrEqual(botPlanFor(h, 'expert', 480_000, seeded(3)).length);

  // in a game: the bots' words arrive over the round and all count
  const ctx = fakeCtx(['bot1', 'bot2'], 'smart');
  const s = withHive(ctx, ['a', 'bot1', 'bot2']);
  khalia.botPlan!(ctx, s, ['bot1', 'bot2']);
  const planned = s.plans.bot1.length;
  expect(planned).toBeGreaterThan(0);
  runJobs(ctx, s, ctx.now + 60_000);
  const early = s.found.bot1.length;
  expect(early).toBeLessThan(planned);
  runJobs(ctx, s, s.endsAt!);
  expect(s.found.bot1.length).toBe(planned);
  expect(view(ctx, s, 'bot1').feedback!.kind).not.toBe('bad');
});

test('bots never see more than the answer list; a word from an earlier round is ignored', () => {
  const ctx = fakeCtx(['bot1']);
  const s = withHive(ctx, ['a', 'bot1'], { rounds: 2 });
  act(ctx, s, 'bot1', { type: 'word', word: 'وطن', round: 0 });
  expect(s.found.bot1).toHaveLength(0);
  act(ctx, s, 'bot1', { type: 'word', word: 'وطن', round: 1 });
  expect(s.found.bot1).toHaveLength(1);
});

test('leaving: the game goes on; everyone gone ends it; places for the ones still there', () => {
  const ctx = fakeCtx();
  const s = withHive(ctx, ['a', 'b', 'c']);
  word(ctx, s, 'b', 'وطن');
  act(ctx, s, 'a', { type: 'done' });
  khalia.onLeave!(ctx, s, 'c');
  expect(s.players).toEqual(['a', 'b']);
  expect(s.phase).toBe('play');
  khalia.onLeave!(ctx, s, 'b');
  // only «a» is left and has pressed «انتهيت»
  expect(s.phase).toBe('final');
  expect(khalia.result!(s)).toEqual({ places: [['a']] });
  const s2 = withHive(ctx, ['x']);
  khalia.onLeave!(ctx, s2, 'x');
  expect(s2.phase).toBe('final');
  expect(khalia.result!(s2)).toBeNull();
});

test('settings: defaults registered, sanitised at start, validated in the lobby', () => {
  expect(DEFAULT_SETTINGS.khalia).toEqual(KHALIA_DEFAULTS);
  expect(sanitizeKhalia({ rounds: 9, minutes: 4 })).toEqual(KHALIA_DEFAULTS);
  expect(sanitizeKhalia({ rounds: 3, minutes: 8 })).toEqual({ rounds: 3, minutes: 8 });
  expect(sanitizeKhalia(undefined)).toEqual(KHALIA_DEFAULTS);
  const st = { ...KHALIA_DEFAULTS };
  khalia.patchSettings!(st, { rounds: 2, minutes: 3 });
  expect(st).toEqual({ rounds: 2, minutes: 3 });
  khalia.patchSettings!(st, { rounds: 7, minutes: '5' });
  expect(st).toEqual({ rounds: 2, minutes: 3 });
  const ctx = fakeCtx();
  const s = startKhalia(ctx, ['a'], { rounds: 0, minutes: 99 } as KhaliaSettings);
  expect(s.settings).toEqual(KHALIA_DEFAULTS);
  expect(s.endsAt).toBe(ctx.now + KHALIA_DEFAULTS.minutes * 60_000);
  // the hives of a room are remembered for the next game
  expect((ctx.memo.get('khalia:recent') as number[]).length).toBe(1);
});
