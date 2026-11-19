/**
 * «الكلمات المتقاطعة» — the bank (700+ words, 2–7 letters, clean clues, no dialect), the generator (seeded,
 * every run a word of the bank, numbering from the top right, dense small grids, levels), the letters
 * convention, co-op (shared grid, who wrote what, «تحقّق», hints, the family's win), the race (own grids,
 * points, first bonus, the full grid ends it, hint cost, the time limit), no answers in any view during
 * play, bots (no unknown words, pace by strength, the co-op share), leaving, settings.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CROSS_CHECK_PENALTY_MS,
  CROSS_DEFAULTS,
  CROSS_FIRST_BONUS,
  CROSS_FULL_BONUS,
  CROSS_HINTS,
  CROSS_HINT_COST,
  crossKey,
  crossLetter,
  crossLetters,
  type CrossSettings,
  type CrossView,
} from '../src/shared/games/cross';
import type { BotLevel } from '../src/shared/protocol';
import { CROSS_BOT, botShare, botTarget, type BotMind } from './cross-bots';
import { acceptable, generateCross, gridStats, seededRnd, type CrossPuzzle } from './cross-gen';
import { CROSS_BY_KEY, CROSS_WORDS } from './cross-words';
import { cross, sanitizeCross, startCross, type CrossState } from './games/cross';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  a: { type: string; [k: string]: unknown };
}
type Ctx = GameCtx & { now: number; jobs: Job[]; said: string[]; offline: Set<string> };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert'): Ctx {
  const keys = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: () => {},
    say: (text) => ctx.said.push(text),
    isConnected: (id) => !ctx.offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => `اسم-${id}`,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      ctx.jobs.push({ at: ctx.now + d, by, a });
    },
    jobs: [],
    said: [],
    offline: new Set(),
  };
  return ctx;
}

const settings = (o: Partial<CrossSettings> = {}): CrossSettings => ({ ...CROSS_DEFAULTS, ...o });
const PUZZLE = generateCross(seededRnd(11), { level: 'mixed' });
const start = (players: string[], o: Partial<CrossSettings> = {}, ctx = fakeCtx(), p: CrossPuzzle = PUZZLE) => ({ s: startCross(ctx, players, settings(o), seededRnd(5), p), ctx });
const act = (ctx: Ctx, s: CrossState, by: string, a: Record<string, unknown>) => cross.act(ctx, s, by, a as never);
const view = (ctx: Ctx, s: CrossState, me: string) => cross.view(ctx, s, me) as CrossView;
/** Write a whole word (right, or with a wrong letter at `wrongAt`). */
function writeWord(ctx: Ctx, s: CrossState, by: string, clue: number, wrongAt = -1) {
  const sl = s.puzzle.slots[clue];
  sl.cells.forEach((c, i) => {
    const l = i === wrongAt ? (s.puzzle.sol[c] === 'ب' ? 'ت' : 'ب') : s.puzzle.sol[c];
    act(ctx, s, by, { type: 'set', cell: c, letter: l });
  });
}

/** Run the bots' jobs in time order (each one re-plans, as the room does). */
function runBots(ctx: Ctx, s: CrossState, bots: string[], until: number) {
  cross.botPlan!(ctx, s, bots);
  for (let guard = 0; guard < 2000 && s.phase === 'play'; guard++) {
    ctx.jobs.sort((a, b) => a.at - b.at);
    const j = ctx.jobs.shift();
    if (!j || j.at > until) break;
    ctx.now = j.at;
    cross.tick!(ctx, s);
    if (s.phase !== 'play') break;
    act(ctx, s, j.by, j.a);
    cross.botPlan!(ctx, s, bots);
  }
}

/* ------------------------------------------------------------------ */
/* The bank                                                            */
/* ------------------------------------------------------------------ */

test('bank: 700+ words of 2–7 letters, each with a clue and a difficulty', () => {
  expect(CROSS_BY_KEY.size).toBeGreaterThanOrEqual(700);
  for (const w of CROSS_WORDS) {
    const n = crossLetters(w.word).length;
    expect([w.word, n >= 2 && n <= 7]).toEqual([w.word, true]);
    expect(w.clue.length).toBeGreaterThan(2);
    expect(['e', 'm']).toContain(w.diff);
    expect(w.word.includes(' ')).toBe(false);
  }
  const easy = [...CROSS_BY_KEY.values()].filter((l) => l.some((w) => w.diff === 'e')).length;
  expect(easy).toBeGreaterThanOrEqual(400);
  expect(CROSS_BY_KEY.size - easy).toBeGreaterThanOrEqual(200);
});

test('bank: a clue never contains its own word', () => {
  const tokens = (s: string) => s.split(/[^ء-ي]+/).filter(Boolean).map(crossKey);
  for (const w of CROSS_WORDS) {
    const t = tokens(w.clue);
    expect([w.word, w.clue, t.includes(w.key) || t.includes(`ال${w.key}`)]).toEqual([w.word, w.clue, false]);
  }
});

test('bank: no dialect word, no Israel; Morocco with its Sahara, Palestine', () => {
  const dialect = new Set(readFileSync(new URL('./data/dialect-words.txt', import.meta.url), 'utf8').split(/\s+/).filter(Boolean).map(crossKey));
  const hits = CROSS_WORDS.filter((w) => dialect.has(w.key)).map((w) => w.word);
  expect(hits).toEqual([]);
  const all = CROSS_WORDS.map((w) => `${w.word} ${w.clue}`).join('\n');
  expect(all).not.toContain('إسرائيل');
  expect(all).not.toContain('اسرائيل');
  for (const w of ['العيون', 'الداخلة', 'السمارة', 'بوجدور', 'الرباط', 'القدس', 'غزة', 'فلسطين', 'يافا']) expect(CROSS_BY_KEY.has(crossKey(w))).toBe(true);
  expect(CROSS_BY_KEY.get(crossKey('العيون'))![0].clue).toContain('الصحراء المغربية');
});

/* ------------------------------------------------------------------ */
/* Letters                                                             */
/* ------------------------------------------------------------------ */

test('letters: one alif, ى ئ → ي, ؤ → و, ة and ء of their own', () => {
  for (const ch of ['أ', 'إ', 'آ', 'ٱ', 'ا']) expect(crossLetter(ch)).toBe('ا');
  expect(crossLetter('ى')).toBe('ي');
  expect(crossLetter('ئ')).toBe('ي');
  expect(crossLetter('ؤ')).toBe('و');
  expect(crossLetter('ة')).toBe('ة');
  expect(crossLetter('ه')).toBe('ه');
  expect(crossLetter('ء')).toBe('ء');
  expect(crossLetter('x')).toBeNull();
  expect(crossLetters('مستشفى')).toEqual([...'مستشفي']);
  expect(crossLetters('سماء')).toEqual([...'سماء']);
  expect(crossKey('مؤذن')).toBe('موذن');
});

/* ------------------------------------------------------------------ */
/* The generator                                                       */
/* ------------------------------------------------------------------ */

/** Every run of 2+ letters of a solution grid, across then down. */
function runsOf(p: CrossPuzzle): string[] {
  const out: string[] = [];
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= p.rows || c >= p.cols ? '' : p.sol[r * p.cols + c]);
  for (const [R, C, f] of [
    [p.rows, p.cols, (a: number, b: number) => at(a, b)],
    [p.cols, p.rows, (a: number, b: number) => at(b, a)],
  ] as const) {
    for (let a = 0; a < R; a++) {
      let cur = '';
      for (let b = 0; b <= C; b++) {
        const ch = b < C ? f(a, b) : '';
        if (ch) cur += ch;
        else {
          if ([...cur].length >= 2) out.push(cur);
          cur = '';
        }
      }
    }
  }
  return out;
}

test('generator: the same seed gives the same grid, another seed another one', () => {
  const a = generateCross(seededRnd(42), { level: 'mixed' });
  const b = generateCross(seededRnd(42), { level: 'mixed' });
  const c = generateCross(seededRnd(43), { level: 'mixed' });
  expect(a).toEqual(b);
  expect(c.sol.join('')).not.toBe(a.sol.join(''));
});

test('generator: small dense grids where every run is a word of the bank, once', () => {
  for (const level of ['easy', 'medium', 'mixed'] as const) {
    let dens = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const p = generateCross(seededRnd(seed * 7 + level.length), { level });
      expect(acceptable(p)).toBe(true);
      const st = gridStats(p);
      expect(st.words).toBeGreaterThanOrEqual(6);
      expect(st.words).toBeLessThanOrEqual(12);
      expect(st.twos).toBeLessThanOrEqual(2);
      dens += st.density;
      // the runs of the grid are exactly its words: no stray letters side by side
      const runs = runsOf(p).sort();
      expect(runs).toEqual(p.slots.map((s) => s.key).sort());
      expect(new Set(runs).size).toBe(runs.length);
      for (const sl of p.slots) {
        expect(sl.cells.map((c) => p.sol[c]).join('')).toBe(sl.key);
        const entries = CROSS_BY_KEY.get(sl.key)!;
        expect(entries.some((e) => e.clue === sl.clue)).toBe(true);
        if (level === 'easy') expect(sl.diff).toBe('e');
      }
      // every white cell belongs to a word, and most words have 3+ letters
      p.sol.forEach((ch, i) => {
        if (ch) expect(p.slots.some((s) => s.cells.includes(i))).toBe(true);
      });
      expect(p.slots.filter((s) => s.cells.length >= 3).length).toBeGreaterThanOrEqual(p.slots.length - 2);
      // words cross: every word shares a cell with another
      for (const sl of p.slots) expect(p.slots.some((o) => o !== sl && o.cells.some((c) => sl.cells.includes(c)))).toBe(true);
    }
    expect(dens / 16).toBeGreaterThan(0.55);
  }
}, 30_000);

test('generator: numbers go row by row from the top right; across reads leftwards', () => {
  const p = PUZZLE;
  const numbered = p.nums.map((n, i) => (n ? [n, i] : null)).filter(Boolean) as [number, number][];
  // in index order (row by row, col 0 = the right edge) the numbers are 1, 2, 3…
  expect(numbered.map(([n]) => n)).toEqual(numbered.map((_, k) => k + 1));
  for (const sl of p.slots) {
    expect(p.nums[sl.cells[0]]).toBe(sl.num);
    const step = sl.dir === 'a' ? 1 : p.cols;
    sl.cells.forEach((c, i) => i && expect(c - sl.cells[i - 1]).toBe(step));
  }
});

test('generator: «متوسط» leans on medium clues, «سهل» uses easy ones only', () => {
  let med = 0, all = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const p = generateCross(seededRnd(seed), { level: 'medium' });
    med += p.slots.filter((s) => s.diff === 'm').length;
    all += p.slots.length;
  }
  expect(med / all).toBeGreaterThan(0.35);
});

test('generator: the room’s last grids are kept out of the next one', () => {
  const ctx = fakeCtx();
  const a = startCross(ctx, ['aaaa'], settings(), seededRnd(1));
  const b = startCross(ctx, ['aaaa'], settings(), seededRnd(2));
  const shared = b.puzzle.slots.filter((s) => a.puzzle.slots.some((x) => x.key === s.key));
  expect(shared.length).toBeLessThanOrEqual(1);
});

/* ------------------------------------------------------------------ */
/* Co-op                                                               */
/* ------------------------------------------------------------------ */

test('coop: one shared grid, a dot for who wrote each letter, a right word counts and locks', () => {
  const { s, ctx } = start(['aaaa', 'bbbb']);
  const sl = s.puzzle.slots[0];
  const l0 = s.puzzle.sol[sl.cells[0]];
  // (an alif is typed with its hamza: it is the same letter)
  act(ctx, s, 'aaaa', { type: 'set', cell: sl.cells[0], letter: l0 === 'ا' ? 'أ' : l0 });
  const vb = view(ctx, s, 'bbbb');
  expect(vb.letters[sl.cells[0]]).toBe(s.puzzle.sol[sl.cells[0]]);
  expect(vb.by[sl.cells[0]]).toBe('aaaa');
  // a wrong letter: the word doesn't count
  writeWord(ctx, s, 'bbbb', 0, sl.cells.length - 1);
  expect(view(ctx, s, 'aaaa').solved[0]).toBeNull();
  // fixed: it counts for the one who wrote the last letter, and locks
  act(ctx, s, 'bbbb', { type: 'set', cell: sl.cells[sl.cells.length - 1], letter: s.puzzle.sol[sl.cells[sl.cells.length - 1]] });
  const v = view(ctx, s, 'aaaa');
  expect(v.solved[0]).toBe('bbbb');
  expect(v.words.bbbb).toBeGreaterThanOrEqual(1);
  for (const c of sl.cells) expect(v.locked[c]).toBe(true);
  act(ctx, s, 'aaaa', { type: 'set', cell: sl.cells[0], letter: '' });
  expect(view(ctx, s, 'aaaa').letters[sl.cells[0]]).toBe(s.puzzle.sol[sl.cells[0]]);
  // typing: hamza shapes are one alif; a non-letter is refused
  expect(() => act(ctx, s, 'aaaa', { type: 'set', cell: s.puzzle.slots[1].cells.find((c) => !s.team.locked[c])!, letter: 'Q' })).toThrow(GameError);
});

test('coop: «تحقّق» lights the wrong letters for a moment and adds 10 seconds', () => {
  const { s, ctx } = start(['aaaa', 'bbbb']);
  const free = s.puzzle.sol.map((ch, i) => (ch ? i : -1)).filter((i) => i >= 0);
  const [w1, ok] = free;
  act(ctx, s, 'aaaa', { type: 'set', cell: w1, letter: s.puzzle.sol[w1] === 'ب' ? 'ت' : 'ب' });
  act(ctx, s, 'aaaa', { type: 'set', cell: ok, letter: s.puzzle.sol[ok] });
  act(ctx, s, 'bbbb', { type: 'check' });
  let v = view(ctx, s, 'aaaa');
  expect(v.wrong).toContain(w1);
  expect(v.wrong).not.toContain(ok);
  expect(v.penaltyMs).toBe(CROSS_CHECK_PENALTY_MS);
  // not again at once
  expect(() => act(ctx, s, 'bbbb', { type: 'check' })).toThrow(GameError);
  ctx.now += 5000;
  v = view(ctx, s, 'aaaa');
  expect(v.wrong).toEqual([]);
});

test('coop: «اكشف حرفاً» writes the right letter, 3 per player', () => {
  const { s, ctx } = start(['aaaa', 'bbbb']);
  const cells = s.puzzle.sol.map((ch, i) => (ch ? i : -1)).filter((i) => i >= 0);
  let used = 0;
  for (const c of cells) {
    if (s.team.locked[c]) continue;
    if (used === CROSS_HINTS) {
      expect(() => act(ctx, s, 'aaaa', { type: 'reveal', cell: c })).toThrow(GameError);
      break;
    }
    act(ctx, s, 'aaaa', { type: 'reveal', cell: c });
    used++;
    const v = view(ctx, s, 'bbbb');
    expect(v.letters[c]).toBe(s.puzzle.sol[c]);
    expect(v.revealed[c]).toBe(true);
    expect(v.locked[c]).toBe(true);
  }
  expect(view(ctx, s, 'aaaa').hintsLeft).toBe(0);
  expect(view(ctx, s, 'bbbb').hintsLeft).toBe(CROSS_HINTS);
});

test('coop: the whole grid right = the family wins; the time with penalties; who did most words', () => {
  const { s, ctx } = start(['aaaa', 'bbbb']);
  s.puzzle.slots.forEach((_, i) => {
    ctx.now += 3000;
    writeWord(ctx, s, i % 2 ? 'bbbb' : 'aaaa', i);
  });
  expect(s.phase).toBe('final');
  const v = view(ctx, s, 'aaaa');
  expect(v.final!.completed).toBe(true);
  expect(v.final!.solution).toEqual(s.puzzle.sol);
  expect(v.final!.ms).toBe(ctx.now - s.startedAt);
  expect((v.words.aaaa ?? 0) + (v.words.bbbb ?? 0)).toBe(s.puzzle.slots.length);
  expect(cross.result!(s)).toEqual({ places: [['aaaa', 'bbbb']], coop: { won: true } });
});

test('coop: the host can stop and see the solution; a time limit ends it too', () => {
  const a = start(['aaaa', 'bbbb']);
  act(a.ctx, a.s, 'aaaa', { type: 'giveup' });
  expect(a.s.phase).toBe('final');
  expect(cross.result!(a.s)).toEqual({ places: [['aaaa', 'bbbb']], coop: { won: false } });
  expect(cross.hostOnly).toContain('giveup');
  const b = start(['aaaa'], { minutes: 5 });
  b.ctx.now += 5 * 60_000;
  expect(cross.tick!(b.ctx, b.s)).toBe(true);
  expect(b.s.phase).toBe('final');
});

/* ------------------------------------------------------------------ */
/* Race                                                                */
/* ------------------------------------------------------------------ */

test('race: everyone has an own grid; another player’s letters are never sent', () => {
  const { s, ctx } = start(['aaaa', 'bbbb'], { mode: 'race' });
  const sl = s.puzzle.slots[0];
  writeWord(ctx, s, 'aaaa', 0);
  const va = view(ctx, s, 'aaaa'), vb = view(ctx, s, 'bbbb');
  for (const c of sl.cells) {
    expect(va.letters[c]).toBe(s.puzzle.sol[c]);
    expect(vb.letters[c]).toBe('');
  }
  expect(vb.solved.every((x) => x === null)).toBe(true);
  expect(vb.by.every((x) => x === null)).toBe(true);
  expect(vb.progress.aaaa.words).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(vb)).not.toContain(JSON.stringify(va.letters));
});

test('race: a word = its letters, +2 for the first; a hint costs 2; the full grid ends it (+5)', () => {
  const { s, ctx } = start(['aaaa', 'bbbb'], { mode: 'race' });
  const sl = s.puzzle.slots[0];
  // b's crossings must not complete other words first: b writes only this word
  writeWord(ctx, s, 'aaaa', 0);
  expect(s.scores.aaaa).toBe(sl.cells.length + CROSS_FIRST_BONUS);
  expect(view(ctx, s, 'aaaa').gain).toMatchObject({ clue: 0, first: true });
  writeWord(ctx, s, 'bbbb', 0);
  expect(view(ctx, s, 'bbbb').gain).toMatchObject({ clue: 0, first: false, points: sl.cells.length });
  const before = s.scores.bbbb;
  // a cell whose words all keep another empty cell (the hint completes nothing)
  const gb = s.grids.bbbb;
  const free = s.puzzle.sol
    .map((ch, i) => i)
    .find((i) => s.puzzle.sol[i] && !gb.letters[i] && s.puzzle.slots.filter((x) => x.cells.includes(i)).every((x) => x.cells.filter((c) => !gb.letters[c]).length >= 2))!;
  act(ctx, s, 'bbbb', { type: 'reveal', cell: free });
  expect(s.scores.bbbb).toBe(before - CROSS_HINT_COST);
  expect(s.grids.bbbb.letters[free]).toBe(s.puzzle.sol[free]);
  expect(s.grids.aaaa.letters[free]).toBe(s.grids.aaaa.locked[free] ? s.puzzle.sol[free] : '');
  // a completes the grid
  s.puzzle.slots.forEach((_, i) => writeWord(ctx, s, 'aaaa', i));
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('aaaa');
  const total = s.puzzle.slots.reduce((t, x) => t + x.cells.length + CROSS_FIRST_BONUS, 0) + CROSS_FULL_BONUS;
  expect(s.scores.aaaa).toBe(total);
  expect(cross.result!(s)!.places[0]).toEqual(['aaaa']);
});

test('race: always a time limit (8 minutes when «بلا وقت»)', () => {
  const { s, ctx } = start(['aaaa', 'bbbb'], { mode: 'race', minutes: 0 });
  expect(s.endsAt).toBe(ctx.now + 8 * 60_000);
  ctx.now = s.endsAt!;
  cross.tick!(ctx, s);
  expect(s.phase).toBe('final');
  expect(s.winner).toBeNull();
});

/* ------------------------------------------------------------------ */
/* No answers in the views                                             */
/* ------------------------------------------------------------------ */

/** A view without its clue texts (a clue may name another word of the grid, e.g. «عاصمة المغرب»). */
const bare = (v: CrossView) => JSON.stringify({ ...v, clues: v.clues.map((c) => ({ ...c, text: '' })) });

test('no view carries the letters of unfilled cells (coop and race, players and spectators)', () => {
  for (const mode of ['coop', 'race'] as const) {
    for (let seed = 1; seed <= 6; seed++) {
      const p = generateCross(seededRnd(100 + seed), { level: 'mixed' });
      const { s, ctx } = start(['aaaa', 'bbbb'], { mode }, fakeCtx(), p);
      // a few words and letters written, a hint
      writeWord(ctx, s, 'aaaa', 0);
      act(ctx, s, 'bbbb', { type: 'set', cell: p.slots[1].cells[0], letter: p.sol[p.slots[1].cells[0]] });
      act(ctx, s, 'bbbb', { type: 'reveal', cell: p.slots[p.slots.length - 1].cells.at(-1)! });
      for (const me of ['aaaa', 'bbbb', 'watcher']) {
        const v = view(ctx, s, me);
        expect(v.final).toBeNull();
        const txt = bare(v);
        expect(txt).not.toContain('solution');
        expect(txt).not.toContain('"sol"');
        v.letters.forEach((l, i) => {
          if (!v.open[i]) expect(l).toBe('');
        });
        // the answer of every word not complete in this view appears nowhere
        for (const sl of p.slots) {
          const shown = sl.cells.every((c) => v.letters[c]);
          if (!shown && [...sl.key].length >= 3) expect([sl.key, txt.includes(sl.key)]).toEqual([sl.key, false]);
        }
        // letters only where this viewer's grid has them
        const g = mode === 'coop' ? s.team : s.grids[me];
        v.letters.forEach((l, i) => expect(l).toBe(g ? g.letters[i] : ''));
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: a word it doesn’t know is never written (until crossings help)', () => {
  const p = PUZZLE;
  const g = { letters: p.sol.map(() => ''), by: p.sol.map(() => null), revealed: p.sol.map(() => false), locked: p.sol.map(() => false), solved: p.slots.map(() => null) };
  const mind: BotMind = { step: 0, know: {}, rolledAt: {} };
  expect(botTarget('expert', false, p, g, mind, () => 0.999, 0)).toBeNull();
  expect(Object.values(mind.know).every((k) => !k)).toBe(true);
  // the same letters: no new roll, still nothing
  expect(botTarget('expert', false, p, g, mind, () => 0, 0)).toBeNull();
  // a letter of word 0 written: it thinks again
  g.letters[p.slots[0].cells[0]] = p.sol[p.slots[0].cells[0]];
  const t = botTarget('expert', false, p, g, mind, () => 0, 0);
  expect(t).not.toBeNull();
  expect(p.slots[t!.clue].cells).toContain(p.slots[0].cells[0]);
});

function raceTime(level: BotLevel, seed: number): { words: number; done: number | null } {
  const ctx = fakeCtx(['bot1'], level);
  const s = startCross(ctx, ['hhhh', 'bot1'], settings({ mode: 'race', minutes: 12 }), seededRnd(seed), generateCross(seededRnd(seed), { level: 'mixed' }));
  runBots(ctx, s, ['bot1'], s.endsAt!);
  const words = s.grids.bot1.solved.filter((x) => x !== null).length;
  return { words, done: s.winner === 'bot1' ? s.endedAt! - s.startedAt : null };
}

test('bots: in a race the expert is quick and sure, the easy bot slow with gaps', () => {
  let expertDone = 0, easyDone = 0, expertWords = 0, easyWords = 0, expertMs = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const e = raceTime('expert', seed), z = raceTime('easy', seed);
    if (e.done !== null) {
      expertDone++;
      expertMs += e.done;
    }
    if (z.done !== null) easyDone++;
    expertWords += e.words;
    easyWords += z.words;
  }
  expect(expertDone).toBeGreaterThanOrEqual(5);
  expect(expertMs / expertDone).toBeLessThan(4 * 60_000);
  expect(expertMs / expertDone).toBeGreaterThan(50_000);
  expect(easyDone).toBeLessThan(expertDone);
  expect(easyWords).toBeLessThan(expertWords);
  // human-like pauses
  for (const lv of Object.values(CROSS_BOT.race)) expect(lv.ms[0]).toBeGreaterThanOrEqual(6000);
});

test('bots: in co-op they take a modest share and wait for the people at first', () => {
  const ctx = fakeCtx(['bot1', 'bot2'], 'expert');
  const s = startCross(ctx, ['hhhh', 'bot1', 'bot2'], settings(), seededRnd(3), PUZZLE);
  cross.botPlan!(ctx, s, ['bot1', 'bot2']);
  expect(Math.min(...ctx.jobs.map((j) => j.at)) - ctx.now).toBeGreaterThanOrEqual(15_000);
  runBots(ctx, s, ['bot1', 'bot2'], ctx.now + 30 * 60_000);
  const botWords = (s.words.bot1 ?? 0) + (s.words.bot2 ?? 0);
  expect(botWords).toBeGreaterThan(0);
  // (a word may complete a crossing one at the same time)
  expect(botWords).toBeLessThanOrEqual(botShare(PUZZLE.slots.length) + 1);
  expect(s.phase).toBe('play');
});

test('bots: in co-op a bot never writes over someone’s wrong letters', () => {
  const ctx = fakeCtx(['bot1'], 'expert');
  const s = startCross(ctx, ['hhhh', 'bot1'], settings(), seededRnd(3), PUZZLE);
  // a wrong letter in every word
  for (const sl of PUZZLE.slots) {
    const c = sl.cells[0];
    act(ctx, s, 'hhhh', { type: 'set', cell: c, letter: PUZZLE.sol[c] === 'ب' ? 'ت' : 'ب' });
  }
  const before = [...s.team.letters];
  runBots(ctx, s, ['bot1'], ctx.now + 10 * 60_000);
  s.team.letters.forEach((l, i) => before[i] && expect(l).toBe(before[i]));
});

test('bots: a race of bots alone plays to the end; a bot’s planned word is checked again', () => {
  const ctx = fakeCtx(['bot1'], 'expert');
  const s = startCross(ctx, ['hhhh', 'bot1'], settings({ mode: 'race' }), seededRnd(2), PUZZLE);
  // a stale step is ignored
  act(ctx, s, 'bot1', { type: 'botword', clue: 0, step: 7 });
  expect(s.grids.bot1.solved[0]).toBeNull();
  // a person can't use the bots' action
  act(ctx, s, 'hhhh', { type: 'botword', clue: 0, step: 0 });
  expect(s.grids.hhhh.solved[0]).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Leaving and settings                                                */
/* ------------------------------------------------------------------ */

test('leaving: the game goes on; nobody left (or only bots) ends it', () => {
  const ctx = fakeCtx(['bot1']);
  const s = startCross(ctx, ['aaaa', 'bbbb', 'bot1'], settings({ mode: 'race' }), seededRnd(1), PUZZLE);
  cross.onLeave!(ctx, s, 'aaaa');
  expect(s.phase).toBe('play');
  expect(s.grids.aaaa).toBeUndefined();
  cross.onLeave!(ctx, s, 'bbbb');
  expect(s.phase).toBe('final');
  expect(cross.result!(s)!.places).toEqual([['bot1']]);
});

test('settings: sanitised and patched', () => {
  expect(sanitizeCross(undefined)).toEqual(CROSS_DEFAULTS);
  expect(sanitizeCross({ mode: 'x', level: 'hard', minutes: 7 } as never)).toEqual({ mode: 'coop', level: 'mixed', minutes: 8 });
  const st = { ...CROSS_DEFAULTS };
  cross.patchSettings!(st, { mode: 'race', level: 'easy', minutes: 12 });
  expect(st).toEqual({ mode: 'race', level: 'easy', minutes: 12 });
  cross.patchSettings!(st, { mode: 'nope', level: 3, minutes: 'a' });
  expect(st).toEqual({ mode: 'race', level: 'easy', minutes: 12 });
});

test('the say lines never name a word’s answer', () => {
  const { s, ctx } = start(['aaaa', 'bbbb']);
  s.puzzle.slots.forEach((_, i) => writeWord(ctx, s, 'aaaa', i));
  for (const line of ctx.said) for (const sl of s.puzzle.slots) if ([...sl.key].length >= 3) expect(line.includes(sl.key)).toBe(false);
});
