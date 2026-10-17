/** «قصص الأنبياء» — content integrity, majority vote, lanterns, bots and leaving. */
import { expect, test } from 'bun:test';

import { PROPHETS_DEFAULTS, PROPHETS_STORIES, type ProphetsSettings, type ProphetsStoryId, type ProphetsView } from '../src/shared/games/prophets';
import { PROPHETS_REVEAL_MS, ayahFor, majority, prophets, type ProphetsState } from './games/prophets';
import { quranData } from './games/surah';
import { STORIES } from './prophets-stories';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: any;
}

function fakeCtx(bots: string[] = []) {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fxs: [string, string | undefined][] = [];
  const offline = new Set<string>();
  const ctx: GameCtx & { jobs: Job[]; keys: Set<string>; fxs: typeof fxs; offline: Set<string> } = {
    now: 1_000_000,
    fx: (k, t) => fxs.push([k, t]),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs,
    keys,
    fxs,
    offline,
  };
  return ctx;
}

const settings = (patch: Partial<ProphetsSettings> = {}): ProphetsSettings => ({ ...PROPHETS_DEFAULTS, story: 'yusuf', ...patch });
const view = (ctx: GameCtx, s: ProphetsState, me = 'a') => prophets.view(ctx, s, me) as ProphetsView;
const correct = (s: ProphetsState) => s.chapters[s.chapter].correct;
const wrong = (s: ProphetsState) => (correct(s) + 1) % s.chapters[s.chapter].options.length;

/** Surahs the stories cite, with their number (the data file spells some names differently). */
const SURAH_N: Record<string, number> = {
  البقرة: 2,
  الأنعام: 6,
  يونس: 10,
  هود: 11,
  يوسف: 12,
  إبراهيم: 14,
  مريم: 19,
  طه: 20,
  الأنبياء: 21,
  الحج: 22,
  الشعراء: 26,
  النمل: 27,
  القصص: 28,
  العنكبوت: 29,
  سبأ: 34,
  الصافات: 37,
  نوح: 71,
};

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('content: six stories of 6–10 chapters, each question with exactly one right and distinct options', () => {
  expect(PROPHETS_STORIES.map((s) => s.key as string).sort()).toEqual(Object.keys(STORIES).sort());
  const { surahs } = quranData();
  for (const story of Object.values(STORIES)) {
    expect(story.chapters.length).toBeGreaterThanOrEqual(6);
    expect(story.chapters.length).toBeLessThanOrEqual(10);
    expect(story.lessons.length).toBeGreaterThanOrEqual(2);
    expect(story.lessons.length).toBeLessThanOrEqual(3);
    for (const c of story.chapters) {
      const options = [c.a, ...c.w];
      expect(options.length).toBeGreaterThanOrEqual(3);
      expect(options.length).toBeLessThanOrEqual(4);
      expect(new Set(options).size).toBe(options.length); // distinct
      expect(c.w).not.toContain(c.a); // exactly one right answer
      for (const o of options) expect(o.trim().length).toBeGreaterThan(0);
      // 2–4 sentences of narration
      const sentences = c.text.split(/[.!؟?]/).filter((x) => x.trim().length > 0);
      expect(sentences.length).toBeGreaterThanOrEqual(1);
      expect(sentences.length).toBeLessThanOrEqual(4);
      expect(c.title.length).toBeGreaterThan(0);
      // every source is a real surah and verse range
      expect(c.source.length).toBeGreaterThan(0);
      for (const [name, from, to] of c.source) {
        const n = SURAH_N[name];
        expect(n).toBeDefined();
        expect(from).toBeGreaterThanOrEqual(1);
        expect(to).toBeGreaterThanOrEqual(from);
        expect(to).toBeLessThanOrEqual(surahs[n - 1].count);
      }
      // a quoted verse must exist in the (filtered) Quran data and come from a cited surah
      if (c.ayah) {
        const a = ayahFor(c.ayah);
        expect(a).not.toBeNull();
        expect(c.source.some(([name]) => SURAH_N[name] === c.ayah![0])).toBe(true);
        const [, from, to = from] = c.ayah;
        expect(c.source.some(([name, f, t]) => SURAH_N[name] === c.ayah![0] && from >= f && to <= t)).toBe(true);
        expect(a!.verses.map((v) => v.n)).toEqual(Array.from({ length: to - from + 1 }, (_, i) => from + i));
      }
    }
  }
});

test('content: no Latin letters or emoji in the player-facing text', () => {
  for (const story of Object.values(STORIES)) {
    for (const c of story.chapters) {
      for (const t of [c.title, c.text, c.q, c.a, ...c.w, c.after ?? '']) {
        expect(t).not.toMatch(/[A-Za-z]/);
        expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  }
});

test('the quote text is taken from the Quran data, not typed', () => {
  const a = ayahFor([12, 4])!;
  const v = quranData().verses.find((x) => x[0] === 12 && x[1] === 4)!;
  expect(a.verses[0].text).toBe(v[2]);
  expect(a.surah).toBe('يوسف');
  expect(ayahFor([14, 37])!.surah).toBe('إبراهيم');
  expect(ayahFor([12, 100])).toBeNull(); // not in the filtered copy
});

/* ------------------------------------------------------------------ */
/* Majority vote                                                       */
/* ------------------------------------------------------------------ */

test('majority: most votes win; a tie goes to the option that got there first; nobody voted = null', () => {
  expect(majority({})).toBeNull();
  expect(majority({ a: { choice: 2, at: 5 } })).toBe(2);
  expect(majority({ a: { choice: 1, at: 1 }, b: { choice: 2, at: 2 }, c: { choice: 2, at: 3 } })).toBe(2);
  // 1–1: option 0 reached one vote first
  expect(majority({ a: { choice: 3, at: 10 }, b: { choice: 0, at: 4 } })).toBe(0);
  // 2–2: option 1 reached its second vote (t=6) before option 0 (t=9)
  expect(
    majority({
      a: { choice: 0, at: 1 },
      b: { choice: 1, at: 2 },
      c: { choice: 1, at: 6 },
      d: { choice: 0, at: 9 },
    }),
  ).toBe(1);
});

test('the family answer counts every vote alike (bots too) and a right answer keeps the lanterns', () => {
  const ctx = fakeCtx(['bot']);
  const s = prophets.start(ctx, ['a', 'b', 'bot'], settings());
  const ok = correct(s);
  prophets.act(ctx, s, 'a', { type: 'vote', choice: ok });
  prophets.act(ctx, s, 'bot', { type: 'vote', choice: wrong(s) });
  expect(s.phase).toBe('ask');
  prophets.act(ctx, s, 'b', { type: 'vote', choice: ok });
  expect(s.phase).toBe('reveal');
  expect(s.chosen).toBe(ok);
  expect(s.lanterns).toBe(3);
  expect(s.history).toEqual([true]);
  expect(s.perPlayer).toEqual({ a: 1, b: 1, bot: 0 });
  expect(ctx.fxs.at(-1)![0]).toBe('correct');
});

test('a wrong family answer dims a lantern; so does a chapter nobody answered', () => {
  const ctx = fakeCtx();
  const s = prophets.start(ctx, ['a', 'b'], settings());
  prophets.act(ctx, s, 'a', { type: 'vote', choice: wrong(s) });
  prophets.act(ctx, s, 'b', { type: 'vote', choice: wrong(s) });
  expect(s.lanterns).toBe(2);
  expect(ctx.fxs.at(-1)![0]).toBe('buzz');
  ctx.now += PROPHETS_REVEAL_MS;
  prophets.tick!(ctx, s);
  expect(s.chapter).toBe(1);
  ctx.now += s.seconds * 1000;
  prophets.tick!(ctx, s); // time's up, nobody voted
  expect(s.phase).toBe('reveal');
  expect(s.chosen).toBeNull();
  expect(s.lanterns).toBe(1);
});

test('voting: one vote each, only during the question, only valid options', () => {
  const ctx = fakeCtx();
  const s = prophets.start(ctx, ['a', 'b'], settings());
  prophets.act(ctx, s, 'a', { type: 'vote', choice: 9 });
  prophets.act(ctx, s, 'a', { type: 'vote', choice: 1.5 });
  prophets.act(ctx, s, 'x', { type: 'vote', choice: 0 });
  expect(s.votes).toEqual({});
  prophets.act(ctx, s, 'a', { type: 'vote', choice: 0 });
  prophets.act(ctx, s, 'a', { type: 'vote', choice: 1 });
  expect(s.votes.a.choice).toBe(0);
  prophets.act(ctx, s, 'a', { type: 'ready' }); // not on the question
  expect(s.ready).toEqual([]);
});

test('view: the answer stays hidden until the reveal, and the votes until I have voted', () => {
  const ctx = fakeCtx();
  const s = prophets.start(ctx, ['a', 'b'], settings());
  let v = view(ctx, s, 'a');
  expect(v.correct).toBeNull();
  expect(v.after).toBeNull();
  expect(v.ayah).toBeNull();
  expect(v.votes).toBeNull();
  expect(v.chapters).toBe(STORIES.yusuf.chapters.length);
  expect(v.source).toEqual([{ surah: 'يوسف', from: 4, to: 6 }]);
  prophets.act(ctx, s, 'b', { type: 'vote', choice: 1 });
  expect(view(ctx, s, 'a').votes).toBeNull();
  expect(view(ctx, s, 'b').votes).toEqual({ b: 1 });
  expect(prophets.turnOf!(s)).toEqual(['a']);
  prophets.act(ctx, s, 'a', { type: 'vote', choice: 1 });
  v = view(ctx, s, 'a');
  expect(v.phase).toBe('reveal');
  expect(v.correct).toBe(correct(s));
  expect(v.ayah?.surah).toBe('يوسف');
  expect(v.ayah?.verses[0].n).toBe(4);
  expect(prophets.turnOf!(s)).toEqual([]);
});

test('reveal: moves on once everyone pressed «تابع», or when the time is up', () => {
  const ctx = fakeCtx();
  const s = prophets.start(ctx, ['a', 'b'], settings());
  prophets.act(ctx, s, 'a', { type: 'vote', choice: correct(s) });
  prophets.act(ctx, s, 'b', { type: 'vote', choice: correct(s) });
  prophets.act(ctx, s, 'a', { type: 'ready' });
  expect(s.phase).toBe('reveal');
  prophets.act(ctx, s, 'b', { type: 'ready' });
  expect(s.phase).toBe('ask');
  expect(s.chapter).toBe(1);
  expect(s.votes).toEqual({});
  // someone offline doesn't hold the family up
  ctx.offline.add('b');
  prophets.act(ctx, s, 'a', { type: 'vote', choice: correct(s) });
  expect(s.phase).toBe('reveal');
});

test('the story is completed with a lantern left; the end shows the lessons', () => {
  const ctx = fakeCtx();
  const s = prophets.start(ctx, ['a'], settings({ story: 'yunus', lanterns: 2 }));
  const n = s.chapters.length;
  for (let i = 0; i < n; i++) {
    prophets.act(ctx, s, 'a', { type: 'vote', choice: i === 0 ? wrong(s) : correct(s) });
    prophets.act(ctx, s, 'a', { type: 'ready' });
  }
  expect(s.phase).toBe('final');
  const v = view(ctx, s);
  expect(v.final).toEqual({ completed: true, lessons: STORIES.yunus.lessons, right: n - 1, perPlayer: { a: n - 1 } });
  expect(v.lanterns).toBe(1);
  expect(ctx.fxs.at(-1)).toEqual(['win', undefined]); // a team win: no single winner
});

test('when the last lantern goes out the story ends gently after the reveal', () => {
  const ctx = fakeCtx();
  const s = prophets.start(ctx, ['a'], settings({ lanterns: 1 }));
  prophets.act(ctx, s, 'a', { type: 'vote', choice: wrong(s) });
  expect(s.phase).toBe('reveal'); // the answer is still shown
  expect(s.lanterns).toBe(0);
  prophets.act(ctx, s, 'a', { type: 'ready' });
  expect(s.phase).toBe('final');
  expect(view(ctx, s).final?.completed).toBe(false);
  expect(ctx.fxs.at(-1)![0]).toBe('skip');
});

test('random story: the room goes through every story before one comes back', () => {
  const ctx = fakeCtx();
  const seen = new Set<ProphetsStoryId>();
  for (let i = 0; i < PROPHETS_STORIES.length; i++) seen.add(prophets.start(ctx, ['a'], settings({ story: 'random' })).story);
  expect(seen.size).toBe(PROPHETS_STORIES.length);
});

test('settings: only known stories, seconds and lanterns clamped', () => {
  const s = { ...PROPHETS_DEFAULTS };
  prophets.patchSettings!(s, { story: 'musa', seconds: 500, lanterns: -3 });
  expect(s).toEqual({ story: 'musa', seconds: 60, lanterns: 1 });
  prophets.patchSettings!(s, { story: 'nobody', seconds: 3, lanterns: 9 });
  expect(s).toEqual({ story: 'musa', seconds: 15, lanterns: 5 });
  prophets.patchSettings!(s, { story: 'random', seconds: 27, lanterns: 'x' });
  expect(s).toEqual({ story: 'random', seconds: 25, lanterns: 5 });
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('onLeave: the leaver no longer holds up the vote or the reveal; everyone gone ends the game', () => {
  const ctx = fakeCtx();
  const s = prophets.start(ctx, ['a', 'b', 'c'], settings());
  prophets.act(ctx, s, 'a', { type: 'vote', choice: correct(s) });
  prophets.act(ctx, s, 'b', { type: 'vote', choice: correct(s) });
  prophets.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  prophets.act(ctx, s, 'a', { type: 'ready' });
  prophets.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('ask');
  expect(s.participants).toEqual(['a']);
  // a vote from someone who left is dropped
  prophets.act(ctx, s, 'b', { type: 'vote', choice: 0 });
  expect(s.votes).toEqual({});
  prophets.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
  expect(() => view(ctx, s, 'a')).not.toThrow();
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bot team-mates wait for the people, then vote quickly once everyone else has', () => {
  const ctx = fakeCtx(['bot']);
  const s = prophets.start(ctx, ['a', 'bot'], settings());
  prophets.botPlan!(ctx, s, ['bot']);
  expect(ctx.jobs.length).toBe(1);
  expect(ctx.jobs[0].at - ctx.now).toBeGreaterThanOrEqual(Math.min(2500, s.seconds * 250));
  prophets.act(ctx, s, 'a', { type: 'vote', choice: 0 });
  prophets.botPlan!(ctx, s, ['bot']);
  expect(ctx.jobs.length).toBe(2);
  expect(ctx.jobs[1].at - ctx.now).toBeLessThanOrEqual(1800);
});

/** Run a whole game with bots only, the way the room does: plan → due jobs → tick, on a fake clock. */
function runBotGame(n: number, story: ProphetsStoryId, lanterns = 3) {
  const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
  const ctx = fakeCtx(ids);
  const s = prophets.start(ctx, ids, settings({ story, lanterns }));
  const plan = () => prophets.botPlan!(ctx, s, ids);
  plan();
  let guard = 0;
  const phases = new Set<string>();
  while (s.phase !== 'final' && guard++ < 20_000) {
    ctx.now += 250;
    let changed = prophets.tick!(ctx, s);
    const due = ctx.jobs.filter((j) => j.at <= ctx.now);
    for (const j of due) {
      ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
      try {
        prophets.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
      changed = true;
    }
    if (changed) plan();
    phases.add(s.phase);
  }
  return { s, ctx, phases };
}

test('full bot games reach the end screen (1, 3 and 8 players, every story)', () => {
  let completed = 0;
  let games = 0;
  for (const story of Object.keys(STORIES) as ProphetsStoryId[]) {
    for (const n of [1, 3, 8]) {
      const { s, ctx, phases } = runBotGame(n, story);
      games++;
      expect(s.phase).toBe('final');
      expect(phases.has('reveal')).toBe(true);
      const v = view(ctx, s, 'bot0');
      expect(v.final).not.toBeNull();
      if (v.final!.completed) {
        completed++;
        expect(s.history.length).toBe(s.chapters.length);
        expect(s.lanterns).toBeGreaterThan(0);
      } else expect(s.lanterns).toBe(0);
      expect(s.history.filter((r) => !r).length).toBe(s.maxLanterns - s.lanterns);
    }
  }
  expect(completed).toBeGreaterThan(games / 2); // helpful team-mates finish most stories
});

test('a story with a single lantern can end early in a bot game', () => {
  let early = 0;
  for (let i = 0; i < 12; i++) {
    const { s } = runBotGame(1, 'sulayman', 1);
    expect(s.phase).toBe('final');
    if (s.history.length < s.chapters.length) early++;
  }
  expect(early).toBeGreaterThan(0);
});
