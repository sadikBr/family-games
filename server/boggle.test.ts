/** «حروف مبعثرة» — paths, the dictionary check, scoring and the shared-words rule, grids, bots, leaving. */
import { expect, test } from 'bun:test';

import { BOGGLE_DEFAULTS, boggleAdjacent, boggleValidPath, boggleWordPoints, type BoggleSettings, type BoggleView } from '../src/shared/games/boggle';
import { BOGGLE_LETTERS, boggleWord, commonWords, generateGrid, isDialect, MIN_WORDS, solve, wordOf } from './boggle-grid';
import { boggle, botWords, REVEAL_MS, type BoggleState } from './games/boggle';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
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

const settings = (p: Partial<BoggleSettings> = {}): BoggleSettings => ({ ...BOGGLE_DEFAULTS, ...p });

/**
 *  ك ت ا ب
 *  م د ر س
 *  ل ع ن ه
 *  و ي ق ف
 */
const GRID = [...'كتابمدرسلعنهويقف'];

function setup(players: string[], p: Partial<BoggleSettings> = {}, bots: string[] = []) {
  const ctx = fakeCtx(bots);
  const s = boggle.start(ctx, players, settings(p));
  s.grid = [...GRID];
  s.solution = Object.fromEntries(solve(GRID, 4));
  return { ctx, s };
}

const send = (ctx: GameCtx, s: BoggleState, by: string, path: number[]) => boggle.act(ctx, s, by, { type: 'word', path });

function runBots(ctx: ReturnType<typeof fakeCtx>, s: BoggleState, bots: string[], maxSteps = 100_000) {
  let steps = 0;
  boggle.botPlan!(ctx, s, bots);
  while (s.phase !== 'final' && steps++ < maxSteps) {
    ctx.now += 1000;
    const due = ctx.jobs.filter((j) => j.at <= ctx.now).sort((a, b) => a.at - b.at);
    for (const j of due) {
      ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
      try {
        boggle.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
    }
    boggle.tick!(ctx, s);
    boggle.botPlan!(ctx, s, bots);
  }
  return steps;
}

test('paths: touching cells in 8 directions, each cell once', () => {
  expect(boggleAdjacent(4, 0, 1)).toBe(true);
  expect(boggleAdjacent(4, 0, 5)).toBe(true);
  expect(boggleAdjacent(4, 3, 4)).toBe(false); // end of a row → start of the next
  expect(boggleAdjacent(4, 0, 2)).toBe(false);
  expect(boggleAdjacent(4, 5, 5)).toBe(false);
  expect(boggleValidPath(4, [0, 1, 2, 3])).toBe(true);
  expect(boggleValidPath(4, [0, 5, 10, 15])).toBe(true);
  expect(boggleValidPath(4, [0, 1, 0])).toBe(false);
  expect(boggleValidPath(4, [0, 2])).toBe(false);
  expect(boggleValidPath(4, [15, 16])).toBe(false);
  expect(boggleValidPath(5, [20, 21, 16, 12])).toBe(true);
  expect(wordOf(GRID, 4, [0, 1, 2, 3])).toBe('كتاب');
  expect(wordOf(GRID, 4, [0, 2, 3])).toBe('');
});

test('dictionary: normalised like the list, no «ال» + word, 3 letters or more', () => {
  expect(boggleWord('كتاب')).toBe(true);
  expect(boggleWord('مدرسة')).toBe(true);
  expect(boggleWord('مدرسه')).toBe(true);
  expect(boggleWord('ابتسامة')).toBe(true);
  expect(boggleWord('الله')).toBe(true);
  expect(boggleWord('الكتاب')).toBe(false);
  expect(boggleWord('كت')).toBe(false);
  expect(boggleWord('ربس')).toBe(false);
  expect(boggleWord('ثثثث')).toBe(false);
});

test('bots and the missed word use standard Arabic only: dialect words are left out', () => {
  const { words } = commonWords();
  for (const w of ['عايز', 'فين', 'عشان', 'ماشي', 'ياسر', 'شويه', 'كده', 'بزاف', 'دلوقتي']) {
    expect(isDialect(w)).toBe(true);
    expect(words.has(w)).toBe(false);
  }
  expect(words.has('كتاب')).toBe(true);
  // a grid spelling «فين» and «عشان»: the solver (bots, missed word) never offers them
  const found = solve([...'فينكعشانكتبمدرسل'], 4); // ف ي ن ك / ع ش ا ن / …
  expect(found.has('فين')).toBe(false);
  expect(found.has('عشان')).toBe(false);
});

test('points by length', () => {
  expect([2, 3, 4, 5, 6, 7, 8, 10].map(boggleWordPoints)).toEqual([0, 1, 1, 2, 3, 5, 11, 11]);
});

test('sending words: path, length, dictionary and repeats are checked', () => {
  const { ctx, s } = setup(['a', 'b']);
  send(ctx, s, 'a', [0, 1, 2, 3]);
  expect(s.found.a).toEqual([{ word: 'كتاب', path: [0, 1, 2, 3], points: 1 }]);
  expect(() => send(ctx, s, 'a', [0, 1, 2, 3])).toThrow(GameError); // again
  expect(() => send(ctx, s, 'a', [0, 2, 3])).toThrow(GameError); // not touching
  expect(() => send(ctx, s, 'a', [5, 6, 5])).toThrow(GameError); // a cell twice
  expect(() => send(ctx, s, 'a', [0, 1])).toThrow(GameError); // too short
  expect(() => send(ctx, s, 'a', [6, 3, 7])).toThrow(GameError); // «ربس»
  expect(() => boggle.act(ctx, s, 'a', { type: 'word', path: 'x' })).toThrow(GameError);
  send(ctx, s, 'a', [5, 6, 7]); // درس
  expect(s.found.a.map((f) => f.word)).toEqual(['كتاب', 'درس']);
  // «ال» + a word is refused
  const t = setup(['a']);
  t.s.grid = [...'الكتمدبارسعنهويف']; // ا ل ك ت / م د ب ا / …
  expect(() => send(t.ctx, t.s, 'a', [0, 1, 2, 3, 7, 6])).toThrow(/ال/);
  send(t.ctx, t.s, 'a', [2, 3, 7, 6]);
  expect(t.s.found.a[0].word).toBe('كتاب');
});

test('scoring: shared words score 0 (unless the rule is off); the best missed word is shown', () => {
  for (const unique of [true, false]) {
    const { ctx, s } = setup(['a', 'b', 'c'], { unique, rounds: 2 });
    send(ctx, s, 'a', [0, 1, 2, 3]); // كتاب (shared)
    send(ctx, s, 'b', [0, 1, 2, 3]);
    send(ctx, s, 'a', [5, 6, 7]); // درس
    send(ctx, s, 'b', [4, 5, 6, 7]); // مدرس (4 letters)
    const madrasa = s.solution['مدرسه'];
    expect(madrasa).toBeDefined();
    send(ctx, s, 'c', madrasa); // 5 letters → 2
    ctx.now = s.endsAt!;
    boggle.tick!(ctx, s);
    expect(s.phase).toBe('reveal');
    const res = Object.fromEntries(s.results!.map((r) => [r.id, r]));
    expect(res.a.words[0]).toMatchObject({ word: 'كتاب', shared: true, points: unique ? 0 : 1 });
    expect(res.a.points).toBe(unique ? 1 : 2);
    expect(res.b.points).toBe(unique ? 1 : 2);
    expect(res.c.points).toBe(2);
    expect(s.scores).toEqual({ a: res.a.points, b: res.b.points, c: 2 });
    // the missed word: in the grid, nobody found it, as good as any other word left
    const m = s.missed!;
    expect(wordOf(s.grid, 4, m.path)).toBe(m.word);
    expect(['كتاب', 'درس', 'مدرس', 'مدرسه']).not.toContain(m.word);
    const bestLeft = Math.max(...Object.keys(s.solution).filter((w) => !['كتاب', 'درس', 'مدرس', 'مدرسه'].includes(w)).map((w) => boggleWordPoints(w.length)));
    expect(m.points).toBe(bestLeft);
    // the view shows everyone's words now
    const v = boggle.view(ctx, s, 'c') as BoggleView;
    expect(v.results?.length).toBe(3);
    // the host skips to the next round
    boggle.act(ctx, s, 'a', { type: 'next' });
    expect(s.phase).toBe('play');
    expect(s.round).toBe(2);
    expect(s.found.a).toEqual([]);
  }
});

test('view: the others words stay hidden while playing', () => {
  const { ctx, s } = setup(['a', 'b']);
  send(ctx, s, 'a', [0, 1, 2, 3]);
  const v = boggle.view(ctx, s, 'b') as BoggleView;
  expect(v.others).toEqual([{ id: 'a', count: 1, done: false }]);
  expect(v.results).toBeNull();
  expect(v.missed).toBeNull();
  expect(JSON.stringify(v)).not.toContain('كتاب');
  expect((boggle.view(ctx, s, 'a') as BoggleView).myWords[0].word).toBe('كتاب');
});

test('grids: dice letters, at most 3 of a letter, enough everyday words, solver paths are right', () => {
  for (const size of [4, 5]) {
    for (let i = 0; i < 12; i++) {
      const { grid, words } = generateGrid(size);
      expect(grid.length).toBe(size * size);
      expect(grid.every((c) => BOGGLE_LETTERS.includes(c))).toBe(true);
      const count = new Map<string, number>();
      for (const c of grid) count.set(c, (count.get(c) ?? 0) + 1);
      expect(Math.max(...count.values())).toBeLessThanOrEqual(size === 4 ? 3 : 4);
      expect(words.size).toBeGreaterThanOrEqual(MIN_WORDS[size]);
      for (const [w, p] of words) {
        expect(wordOf(grid, size, p)).toBe(w);
        expect(boggleWord(w)).toBe(true);
      }
    }
  }
});

test('bots: words come from the grid, stronger bots find more', () => {
  const { s } = setup(['a']);
  const avg = (level: 'easy' | 'smart' | 'expert') => {
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const ws = botWords(s, level);
      for (const w of ws) expect(wordOf(GRID, 4, w.path)).toBe(w.word);
      expect(new Set(ws.map((w) => w.word)).size).toBe(ws.length);
      n += ws.length;
    }
    return n / 40;
  };
  const e = avg('easy'), m = avg('smart'), h = avg('expert');
  expect(e).toBeLessThan(m);
  expect(m).toBeLessThan(h);
});

test('«انتهيت»: when every person is done the round ends, and bots get their planned words', () => {
  const { ctx, s } = setup(['me', 'b1'], { rounds: 1 }, ['b1']);
  boggle.botPlan!(ctx, s, ['b1']);
  const planned = s.plans.b1.map((w) => w.word);
  expect(planned.length).toBeGreaterThan(0);
  expect(boggle.turnOf!(s).sort()).toEqual(['b1', 'me']);
  send(ctx, s, 'me', [0, 1, 2, 3]);
  boggle.act(ctx, s, 'me', { type: 'done' });
  expect(s.phase).toBe('final');
  expect(s.found.b1.map((f) => f.word).sort()).toEqual([...planned].sort());
  expect(ctx.fxs.some(([k]) => k === 'win')).toBe(true);
});

test('a bot-only room plays on the timer', () => {
  const ids = ['b1', 'b2'];
  const ctx = fakeCtx(ids);
  const s = boggle.start(ctx, ids, settings({ rounds: 1, seconds: 120 }));
  boggle.botPlan!(ctx, s, ids);
  boggle.act(ctx, s, 'b1', { type: 'done' });
  expect(s.phase).toBe('play'); // no person to wait for: the timer decides
});

test('a full bot game reaches the final (1, 4 and 12 players; 4×4 and 5×5; every level)', () => {
  const cases: [number, Partial<BoggleSettings>][] = [
    [1, { rounds: 1, level: 'easy', size: 4, seconds: 120 }],
    [4, { rounds: 3, level: 'medium', size: 5, seconds: 180 }],
    [12, { rounds: 2, level: 'hard', size: 4, unique: false }],
  ];
  for (const [n, p] of cases) {
    const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
    const ctx = fakeCtx(ids);
    const s = boggle.start(ctx, ids, settings(p));
    runBots(ctx, s, ids);
    expect(s.phase).toBe('final');
    expect(s.round).toBe(p.rounds!);
    expect(s.results!.length).toBe(n);
    expect(Object.values(s.scores).some((v) => v > 0)).toBe(true);
    // every word a bot sent is a real word of that round's grid
    for (const r of s.results!) for (const w of r.words) expect(wordOf(s.grid, s.settings.size, w.path)).toBe(w.word);
  }
});

test('leaving: the game goes on; the round ends when the last person still playing leaves', () => {
  const ctx = fakeCtx(['b1']);
  const s = boggle.start(ctx, ['a', 'b', 'b1'], settings({ rounds: 2 }));
  boggle.act(ctx, s, 'a', { type: 'done' });
  expect(s.phase).toBe('play');
  boggle.onLeave!(ctx, s, 'b');
  expect(s.players).toEqual(['a', 'b1']);
  expect(s.phase).toBe('reveal');
  ctx.now += REVEAL_MS;
  boggle.tick!(ctx, s);
  expect(s.phase).toBe('play');
  boggle.onLeave!(ctx, s, 'a');
  boggle.onLeave!(ctx, s, 'b1');
  expect(s.phase).toBe('final');
});

test('settings are validated', () => {
  const st = settings();
  boggle.patchSettings!(st, { size: 6, seconds: 90, unique: 'no', level: 'x' });
  expect(st).toEqual(BOGGLE_DEFAULTS);
  boggle.patchSettings!(st, { size: 5, seconds: 120, unique: false, level: 'hard', rounds: 9 });
  expect(st).toEqual({ rounds: 5, size: 5, seconds: 120, unique: false, level: 'hard' });
});
