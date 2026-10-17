/** «مسابقة التجويد» — the examples point at real verses, follow their rule, and the game runs to the end. */
import { expect, test } from 'bun:test';

import { TAJWEED_TOPICS, type TajweedSettings, type TajweedTopic, type TajweedView } from '../src/shared/games/tajweed';
import { tajweed, tajweedItem, tajweedPool, verseText, verseWords } from './games/tajweed';
import { TAJWEED_EXAMPLES, TAJWEED_RULES, type TajweedExample } from './tajweed-content';

type Job = { at: number; by: string; key: string; a: any };

/** A tiny room: a clock, bot jobs (de-duplicated by key like the real room), connected/bot sets. */
function fakeRoom(bots: string[] = [], fx: string[] = []) {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const ctx: any = {
    now: 1000,
    fx: (k: string, t?: string) => fx.push(t ? `${k}:${t}` : k),
    isConnected: () => true,
    isBot: (id: string) => bots.includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => {
      if (keys.has(`${by}:${key}`)) return;
      keys.add(`${by}:${key}`);
      jobs.push({ at: ctx.now + delay, by, key, a });
    },
  };
  /** Run until `done` (or a time limit): bots plan, due jobs run, the game ticks. */
  const run = (s: any, done: () => boolean, limitMs = 3_600_000) => {
    const end = ctx.now + limitMs;
    while (!done() && ctx.now < end) {
      tajweed.botPlan!(ctx, s, bots);
      for (const j of jobs.filter((x) => x.at <= ctx.now)) {
        jobs.splice(jobs.indexOf(j), 1);
        tajweed.act(ctx, s, j.by, j.a);
      }
      tajweed.tick!(ctx, s);
      ctx.now += 250;
    }
  };
  return { ctx, run, jobs };
}

const settings = (p: Partial<TajweedSettings> = {}): TajweedSettings => ({ rounds: 10, seconds: 20, topic: 'all', ...p });

const LETTERS = /[ء-غف-يٱ]/;
/** [letter, its marks][] of a word. */
function letters(w: string): [string, string][] {
  const out: [string, string][] = [];
  for (const ch of w) {
    if (LETTERS.test(ch)) out.push([ch, '']);
    else if (ch !== 'ـ' && out.length) out[out.length - 1][1] += ch;
  }
  return out;
}
const SUKUN = 'ۡ';
const SHADDA = 'ّ';
const MADDA = 'ٓ';
const IQLAB = /[ۭۢ]/;
const STACKED_TANWEEN = /[ً-ٍ]/;
const OPEN_TANWEEN = /[ٖٗٞ]/;
const VOWEL = /[َ-ِ]/;
const words = (e: TajweedExample) => verseWords(verseText(e.s, e.a)!);
const span = (e: TajweedExample) => words(e).slice(e.w, e.w + (e.n ?? 1));

test('tajweed: 80+ examples, each on an existing verse and word, with a rule of its topic and a one-line reason', () => {
  expect(TAJWEED_EXAMPLES.length).toBeGreaterThanOrEqual(80);
  const seen = new Set<string>();
  for (const e of TAJWEED_EXAMPLES) {
    const text = verseText(e.s, e.a);
    expect(text, `${e.s}:${e.a}`).toBeDefined();
    const n = e.n ?? 1;
    expect(n === 1 || n === 2).toBe(true);
    expect(e.w).toBeGreaterThanOrEqual(0);
    expect(e.w + n).toBeLessThanOrEqual(words(e).length);
    const rule = TAJWEED_RULES[e.topic].find((r) => r.key === e.rule);
    expect(rule, `${e.topic}/${e.rule}`).toBeDefined();
    expect(e.why).toContain('⇐');
    expect(e.why).toContain(rule!.label);
    const key = `${e.topic}:${e.s}:${e.a}:${e.w}`;
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }
  // every topic has enough questions, and every rule is asked
  for (const t of Object.keys(TAJWEED_RULES) as TajweedTopic[]) {
    expect(tajweedPool(t).length).toBeGreaterThanOrEqual(12);
    for (const r of TAJWEED_RULES[t]) expect(TAJWEED_EXAMPLES.some((e) => e.topic === t && e.rule === r.key)).toBe(true);
  }
  expect(tajweedPool('all').length).toBe(TAJWEED_EXAMPLES.length);
});

test('tajweed: noon sakinah / tanween examples — one occurrence, and the next letter decides the rule', () => {
  const cls: Record<string, RegExp> = { izhar: /[ءأإؤئهعحغخ]/, idgham_g: /[ينمو]/, idgham_n: /[لر]/, iqlab: /ب/, ikhfa: /[صذثكجشقسدطزفتضظ]/ };
  for (const e of TAJWEED_EXAMPLES.filter((x) => x.topic === 'noon')) {
    const ls = span(e).map(letters);
    const hits: { next: string; marks: string }[] = [];
    ls.forEach((L, wi) =>
      L.forEach(([c, m], j) => {
        const tanween = STACKED_TANWEEN.test(m) || OPEN_TANWEEN.test(m) || (IQLAB.test(m) && VOWEL.test(m));
        const noon = c === 'ن' && !VOWEL.test(m) && !m.includes(SHADDA) && !tanween;
        if (!noon && !tanween) return;
        const rest = L.slice(j + 1).filter(([x, mm]) => !('اى'.includes(x) && (mm === '' || mm.includes('ْ'))));
        const next = noon && rest.length ? rest[0][0] : (ls[wi + 1]?.[0]?.[0] ?? '');
        hits.push({ next, marks: m });
      }),
    );
    expect(hits.length, `${e.s}:${e.a}:${e.w}`).toBe(1);
    expect(hits[0].next).toMatch(cls[e.rule]);
    // the mushaf marks agree: a small meem for iqlab, a sukun / stacked tanween for izhar, neither otherwise
    expect(IQLAB.test(hits[0].marks)).toBe(e.rule === 'iqlab');
    expect(hits[0].marks.includes(SUKUN) || STACKED_TANWEEN.test(hits[0].marks)).toBe(e.rule === 'izhar');
  }
});

test('tajweed: meem sakinah, lam, qalqala, madd and lafz al-jalala examples match their rule', () => {
  for (const e of TAJWEED_EXAMPLES) {
    const sw = span(e);
    const at = `${e.topic} ${e.s}:${e.a}:${e.w}`;
    const last = e.w + (e.n ?? 1) === words(e).length;
    if (e.topic === 'meem') {
      const flat = sw.map(letters).flatMap((L, wi) => L.map(([c, m], j) => ({ c, m, wi, j, L })));
      const meems = flat.filter((x) => x.c === 'م' && !VOWEL.test(x.m) && !x.m.includes(SHADDA) && !STACKED_TANWEEN.test(x.m) && !OPEN_TANWEEN.test(x.m));
      expect(meems.length, at).toBe(1);
      const k = flat.indexOf(meems[0]);
      const next = flat[k + 1].c;
      expect(next === 'ب' ? 'ikhfa_sh' : next === 'م' ? 'idgham_sh' : 'izhar_sh', at).toBe(e.rule);
      expect(meems[0].m.includes(SUKUN)).toBe(e.rule === 'izhar_sh');
    } else if (e.topic === 'lam') {
      const L = letters(sw[0]);
      const p = L.findIndex(([c]) => c === 'ٱ');
      expect(L[p + 1][0]).toBe('ل');
      if (e.rule === 'qamari') expect(L[p + 1][1].includes(SUKUN) && /[أإءبغحجكوخفعقيمه]/.test(L[p + 2][0]), at).toBe(true);
      else expect(L[p + 1][1] === '' && L[p + 2][1].includes(SHADDA) && /[تثدذرزسشصضطظلن]/.test(L[p + 2][0]), at).toBe(true);
    } else if (e.topic === 'qalqala') {
      const L = letters(sw[0]);
      const inner = L.filter(([c, m]) => /[قطبجد]/.test(c) && m.includes(SUKUN));
      if (e.rule === 'kubra') {
        expect(last, at).toBe(true);
        const [c, m] = L[L.length - 1];
        expect(/[قطبجد]/.test(c) && !m.includes(SHADDA) && inner.length === 0, at).toBe(true);
      } else {
        expect(last, at).toBe(false);
        expect(inner.length, at).toBe(1);
      }
    } else if (e.topic === 'madd') {
      const hasMadda = sw[0].includes(MADDA);
      expect(hasMadda, at).toBe(['muttasil', 'munfasil', 'lazim'].includes(e.rule));
      if (e.rule === 'arid') expect(last, at).toBe(true);
      if (e.rule === 'tabii') expect(last, at).toBe(false);
      if (e.rule === 'munfasil') expect(/^[أإء]/.test(words(e)[e.w + 1]), at).toBe(true);
      if (e.rule === 'muttasil') expect(/[ٓ][ءأإؤئ]/.test(sw[0].replace(/[^ء-يٓ]/g, '')), at).toBe(true);
    } else if (e.topic === 'jalala') {
      const allah = sw[sw.length - 1];
      expect(letters(allah).map(([c]) => c).join(''), at).toContain('لله');
      // the vowel just before the lam: on a prefix (بِ لِ وَ فَ) or at the end of the previous word
      let marks: string;
      if (sw.length === 1) marks = letters(allah)[0][1];
      else {
        const P = letters(sw[0]);
        const lastL = P[P.length - 1];
        marks = 'اىوي'.includes(lastL[0]) && !VOWEL.test(lastL[1]) ? P[P.length - 2][1] : lastL[1];
      }
      expect(marks.includes('ِ') ? 'tarqiq' : 'tafkhim', at).toBe(e.rule);
      expect(VOWEL.test(marks), at).toBe(true);
    }
  }
});

test('tajweed: questions show the verse around the coloured words, with distinct options and the right answer', () => {
  for (const e of TAJWEED_EXAMPLES) {
    const item = tajweedItem(e);
    const all = words(e);
    expect(item.words.slice(item.hl[0], item.hl[1] + 1)).toEqual(all.slice(e.w, e.w + (e.n ?? 1)));
    expect(item.words.length).toBeLessThanOrEqual(14);
    expect(item.cutStart).toBe(e.w - item.hl[0] > 0);
    expect(item.cutEnd).toBe(e.w - item.hl[0] + item.words.length < all.length);
    expect(new Set(item.options).size).toBe(item.options.length);
    expect(item.options.length).toBe(Math.min(4, TAJWEED_RULES[e.topic].length));
    expect(item.options[item.correct]).toBe(TAJWEED_RULES[e.topic].find((r) => r.key === e.rule)!.label);
    expect(item.ref).toContain(`الآية ${e.a}`);
  }
});

test('tajweed: a round — the reason stays hidden until the reveal, fast right answers score more', () => {
  const fx: string[] = [];
  const { ctx } = fakeRoom([], fx);
  const s = tajweed.start(ctx, ['a', 'b', 'c'], settings({ topic: 'noon', rounds: 5 }));
  expect(s.items.length).toBe(5);
  let v = tajweed.view(ctx, s, 'a') as TajweedView;
  expect(v.phase).toBe('ask');
  expect(v.topic).toBe('noon');
  expect(v.why).toBeNull();
  expect(v.correct).toBeNull();
  expect(v.ref).toBeNull();
  expect(tajweed.turnOf!(s)).toEqual(['a', 'b', 'c']);
  const right = s.items[0].correct;
  tajweed.act(ctx, s, 'a', { type: 'answer', choice: right });
  ctx.now += 5000;
  tajweed.act(ctx, s, 'b', { type: 'answer', choice: right });
  tajweed.act(ctx, s, 'b', { type: 'answer', choice: (right + 1) % 4 }); // a second answer is ignored
  expect(tajweed.turnOf!(s)).toEqual(['c']);
  tajweed.act(ctx, s, 'c', { type: 'answer', choice: (right + 1) % s.items[0].options.length });
  v = tajweed.view(ctx, s, 'c') as TajweedView;
  expect(v.phase).toBe('reveal');
  expect(v.why).toContain('⇐');
  expect(v.correct).toBe(right);
  expect(v.ref).toContain('سورة');
  expect(s.scores.a).toBeGreaterThan(s.scores.b);
  expect(s.scores.b).toBeGreaterThanOrEqual(500);
  expect(s.scores.c).toBe(0);
  expect(tajweed.turnOf!(s)).toEqual([]);
});

test('tajweed: full bot-only games reach the final for every topic', () => {
  for (const t of TAJWEED_TOPICS) {
    const fx: string[] = [];
    const bots = ['b1', 'b2', 'b3'];
    const { ctx, run } = fakeRoom(bots, fx);
    const s = tajweed.start(ctx, bots, settings({ topic: t.key, rounds: 12, seconds: 10 }));
    run(s, () => s.phase === 'final');
    expect(s.phase).toBe('final');
    expect(s.round).toBe(s.items.length);
    expect(Object.values(s.scores).some((x) => x > 0)).toBe(true);
    expect(fx.filter((f) => f.startsWith('win')).length).toBe(1);
  }
});

test('tajweed: questions do not repeat in a game, and the room deck avoids repeats across games', () => {
  const { ctx } = fakeRoom();
  const a = tajweed.start(ctx, ['x'], settings({ topic: 'jalala', rounds: 6 }));
  const b = tajweed.start(ctx, ['x'], settings({ topic: 'jalala', rounds: 6 }));
  const keys = (s: any) => s.items.map((i: any) => `${i.ref}:${i.hl[0]}:${i.words.join(' ')}`);
  expect(new Set([...keys(a), ...keys(b)]).size).toBe(12);
  // asking for more rounds than examples: clamped to the pool
  const c = tajweed.start(ctx, ['x'], settings({ topic: 'qalqala', rounds: 30 }));
  expect(c.items.length).toBe(tajweedPool('qalqala').length);
});

test('tajweed: a leaver does not block the round; an empty game ends', () => {
  const { ctx } = fakeRoom();
  const s = tajweed.start(ctx, ['a', 'b'], settings({ rounds: 5 }));
  tajweed.act(ctx, s, 'a', { type: 'answer', choice: 0 });
  ctx.isConnected = (id: string) => id !== 'b';
  tajweed.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('reveal');
  ctx.isConnected = () => false;
  tajweed.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
});

test('tajweed: settings are validated', () => {
  const st = settings();
  tajweed.patchSettings!(st, { rounds: 99, seconds: 2, topic: 'madd' });
  expect(st).toEqual({ rounds: 30, seconds: 10, topic: 'madd' });
  tajweed.patchSettings!(st, { topic: 'nope', rounds: 'x' });
  expect(st.topic).toBe('madd');
  expect(st.rounds).toBe(30);
});
