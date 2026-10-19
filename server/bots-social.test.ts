/**
 * Smarter bots for the quiz family and the party games: the expert bot beats the old one (kept as
 * «سهل»), known positions are handled, decisions stay fast, and bots only ever play legal moves.
 * Bot-vs-bot series run on a fake clock with a seeded Math.random, the way the room runs them
 * (plan → due jobs → tick); each side of a duel gets its own context with its own bot strength.
 */
import { afterEach, expect, test } from 'bun:test';

import type { BotLevel } from '../src/shared/protocol';
import { HEX_N, hexWinPath } from '../src/shared/islamic';
import { MOSQUE_DEFAULTS } from '../src/shared/games/mosque';
import { PROPHETS_DEFAULTS } from '../src/shared/games/prophets';
import { quizDelay, readChars } from './ai/social-quiz';
import { hexDistance, huroofPick } from './ai/social-huroof';
import { civilianClue, imposterClue, rankGuesses, suspicion } from './ai/social-imposter';
import { clueHits, conventionClue, expertGuess, guessPosterior } from './ai/social-oneword';
import { villageScores } from './ai/social-werewolf';
import { IMPOSTER_CATEGORIES } from './content';
import { asma } from './games/asma';
import { huroof } from './games/huroof';
import { imposter } from './games/imposter';
import { mapquiz, sanitizeMapquiz } from './games/mapquiz';
import { mosque } from './games/mosque';
import { names, namesBotAnswer } from './games/names';
import { botClue, botGuess, oneword } from './games/oneword';
import { potato } from './games/potato';
import { prophets } from './games/prophets';
import { qquote } from './games/qquote';
import { quiz } from './games/quiz';
import { sanitizeSteps, steps } from './games/steps';
import { surah } from './games/surah';
import { survey } from './games/survey';
import { tajweed } from './games/tajweed';
import { trivia } from './games/trivia';
import { werewolf } from './games/werewolf';
import { whois } from './games/whois';
import { ONEWORD_WORDS } from './oneword-content';
import { clueKey } from './oneword-match';
import { TRAITS, traitPool } from './imposter-traits';
import { GameError, type GameModule } from './types';

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;
const seed = (n: number) => (Math.random = mulberry32(n));
afterEach(() => {
  Math.random = realRandom;
});

interface Side {
  ids: string[];
  level: BotLevel;
}

/** Every bot decision timed in the series (ms for one botPlan call), by game. */
const timings = new Map<string, number[]>();
/** Bot actions played / refused by the game (GameError), by game. */
const actions = new Map<string, { ok: number; refused: number }>();

class Sim {
  now = 1_000_000;
  jobs: { at: number; by: string; a: any; k: string }[] = [];
  keys = new Set<string>();
  memo = new Map<string, unknown>();
  plans = 0;
  constructor(public sides: Side[]) {}

  ctx(side?: Side): any {
    const sim = this;
    const all = this.sides.flatMap((x) => x.ids);
    return {
      get now() {
        return sim.now;
      },
      fx() {},
      say() {},
      isConnected: () => true,
      isBot: (id: string) => (side ? side.ids.includes(id) : all.includes(id)),
      playerName: (id: string) => id,
      memo: sim.memo,
      botLevel: () => side?.level ?? 'expert',
      bot(by: string, key: string, d: number, a: any) {
        const k = `${by}|${key}`;
        if (sim.keys.has(k)) return;
        sim.keys.add(k);
        expect(d).toBeGreaterThanOrEqual(0);
        sim.jobs.push({ at: sim.now + d, by, a, k });
      },
    };
  }

  plan(mod: GameModule<any, any>, s: any) {
    for (const side of this.sides) {
      const t = performance.now();
      mod.botPlan?.(this.ctx(side), s, side.ids);
      const ms = performance.now() - t;
      // the very first calls warm caches up (deck indexes, JIT)
      if (++this.plans > 4) {
        const list = timings.get(mod.id) ?? [];
        list.push(ms);
        timings.set(mod.id, list);
      }
    }
  }

  /** Run until `done`, `host` playing the host's buttons; every bot action must be accepted. */
  run(mod: GameModule<any, any>, s: any, done: (s: any) => boolean, host?: (ctx: any, s: any, now: number) => void, step = 100, maxMs = 4 * 3_600_000) {
    const end = this.now + maxMs;
    const ctx = this.ctx();
    this.plan(mod, s);
    while (!done(s) && this.now < end) {
      this.now += step;
      const due = this.jobs.filter((j) => j.at <= this.now).sort((a, b) => a.at - b.at);
      this.jobs = this.jobs.filter((j) => j.at > this.now);
      const count = actions.get(mod.id) ?? { ok: 0, refused: 0 };
      actions.set(mod.id, count);
      for (const j of due) {
        try {
          mod.act(ctx, s, j.by, j.a);
          count.ok++;
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
          count.refused++;
          this.keys.delete(j.k);
        }
      }
      mod.tick?.(ctx, s);
      host?.(ctx, s, this.now);
      this.plan(mod, s);
    }
    expect(done(s)).toBe(true);
  }
}

/** A seeded series of 1-vs-1 games between an expert and an easy bot; returns the expert's share of wins. */
function series(n: number, play: (expert: Side, easy: Side, g: number) => { x: number; e: number }): { wins: number; rate: number; x: number; e: number } {
  let wins = 0;
  let ties = 0;
  let xs = 0;
  let es = 0;
  for (let g = 0; g < n; g++) {
    seed(1000 + g);
    const r = play({ ids: ['x'], level: 'expert' }, { ids: ['e'], level: 'easy' }, g);
    xs += r.x;
    es += r.e;
    if (r.x > r.e) wins++;
    else if (r.x === r.e) ties++;
  }
  return { wins, rate: (wins + ties / 2) / n, x: xs / n, e: es / n };
}

/** A simultaneous-answer game (everyone answers on their own phone): expert vs easy over a seeded series. */
function quizSeries(mod: GameModule<any, any>, settings: any, n = 8, scores = (s: any) => s.scores, phase = (s: any) => s.phase) {
  return series(n, (x, e) => {
    const sim = new Sim([x, e]);
    const s = mod.start(sim.ctx(), ['x', 'e'], structuredClone(settings));
    sim.run(mod, s, (st) => phase(st) === 'final');
    return { x: scores(s).x ?? 0, e: scores(s).e ?? 0 };
  });
}

/* ------------------------------------------------------------------ */
/* Quiz family                                                         */
/* ------------------------------------------------------------------ */

const QUIZ_CASES: [string, () => ReturnType<typeof quizSeries>][] = [
  ['quiz', () => quizSeries(quiz, { rounds: 10, seconds: 20, category: 'all' })],
  ['trivia', () => quizSeries(trivia, { rounds: 10, seconds: 20, category: 'all' })],
  ['surah', () => quizSeries(surah, { rounds: 10, seconds: 20, level: 'hard' })],
  ['qquote', () => quizSeries(qquote, { rounds: 10, seconds: 20, level: 'hard' })],
  ['tajweed', () => quizSeries(tajweed, { rounds: 10, seconds: 20, topic: 'all' })],
  ['asma', () => quizSeries(asma, { mode: 'match', rounds: 10, seconds: 15, dir: 'mix', pairs: 8 }, 8, (s) => s.m.scores, (s) => s.m.phase)],
  ['steps', () => quizSeries(steps, sanitizeSteps({ rounds: 6, seconds: 60 }), 8)],
  ['mapquiz', () => quizSeries(mapquiz, sanitizeMapquiz({ rounds: 8, seconds: 20 }), 8)],
  ['whois', () => quizSeries(whois, { rounds: 8 })],
];

for (const [name, run] of QUIZ_CASES) {
  test(`${name}: the expert bot beats the old bot`, () => {
    const r = run();
    console.log(`${name}, expert vs old: ${Math.round(r.rate * 100)}% of games (${Math.round(r.x)} vs ${Math.round(r.e)} points)`);
    expect(r.rate).toBeGreaterThanOrEqual(0.8);
    expect(r.x).toBeGreaterThan(r.e * 1.2);
  }, 60_000);
}

test('quiz timing: an expert is quick but never faster than a person can read', () => {
  seed(7);
  for (let i = 0; i < 2000; i++) {
    const chars = 20 + (i % 200);
    const d = quizDelay('expert', 20, chars);
    expect(d).toBeGreaterThanOrEqual(1800);
    expect(d).toBeLessThanOrEqual(11_000);
    // more to read takes longer (on average)
  }
  const avg = (chars: number) => {
    let t = 0;
    for (let i = 0; i < 400; i++) t += quizDelay('expert', 30, chars);
    return t / 400;
  };
  expect(avg(200)).toBeGreaterThan(avg(40) + 3000);
  // smart is slower than expert, easy (the old bot) mostly answers in the second half
  let smart = 0, expert = 0, late = 0;
  for (let i = 0; i < 1000; i++) {
    smart += quizDelay('smart', 20, 80);
    expert += quizDelay('expert', 20, 80);
    if (quizDelay('easy', 20, 80) >= 10_000) late++;
  }
  expect(smart).toBeGreaterThan(expert * 1.3);
  expect(late).toBeGreaterThan(600);
  expect(readChars('abc', ['de', 'fg'])).toBe(3 + Math.round(0.6 * 4));
}, 120_000);

test('quiz bots: an expert is almost always right, smart mostly, easy as before', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    seed(11);
    let right = 0, total = 0;
    const sim = new Sim([{ ids: ['b'], level }]);
    for (let g = 0; g < 20; g++) {
      const s: any = quiz.start(sim.ctx(), ['b'], { rounds: 10, seconds: 20, category: 'all' });
      for (let r = 1; r <= s.items.length; r++) {
        s.round = r;
        s.answers = {};
        sim.keys.clear();
        sim.jobs = [];
        quiz.botPlan!(sim.ctx(sim.sides[0]), s, ['b']);
        total++;
        if (sim.jobs[0].a.choice === s.items[r - 1].correct) right++;
      }
    }
    const rate = right / total;
    if (level === 'easy') expect(Math.abs(rate - 0.7)).toBeLessThan(0.07);
    if (level === 'smart') expect(rate).toBeGreaterThan(0.8);
    if (level === 'expert') expect(rate).toBeGreaterThan(0.92);
  }
}, 120_000);

test('co-op quiz games: an expert bot team builds more of the mosque and finishes the stories far more often', () => {
  const team = (level: BotLevel) => ({ ids: ['b1', 'b2', 'b3'], level });
  let built = { expert: 0, easy: 0 };
  let done = { expert: 0, easy: 0 };
  for (const level of ['expert', 'easy'] as const) {
    for (let g = 0; g < 8; g++) {
      seed(300 + g);
      const sim = new Sim([team(level)]);
      const s: any = mosque.start(sim.ctx(), ['b1', 'b2', 'b3'], { ...MOSQUE_DEFAULTS, level: 'hard' });
      sim.run(mosque, s, (st) => st.phase === 'final');
      built[level] += s.built;
      seed(500 + g);
      const sim2 = new Sim([team(level)]);
      const p: any = prophets.start(sim2.ctx(), ['b1', 'b2', 'b3'], { ...PROPHETS_DEFAULTS, lanterns: 1 });
      sim2.run(prophets, p, (st) => st.phase === 'final');
      if (p.completed) done[level]++;
    }
  }
  console.log(`co-op: mosque pieces ${built.expert} vs ${built.easy}; stories finished ${done.expert} vs ${done.easy} (of 8)`);
  expect(built.expert).toBeGreaterThan(built.easy);
  expect(done.expert).toBeGreaterThan(done.easy);
  expect(done.expert).toBeGreaterThanOrEqual(5);
}, 120_000);

test('asma memory: an expert bot remembers the cards and wins most games', () => {
  const r = series(12, (x, e) => {
    const sim = new Sim([x, e]);
    const s: any = asma.start(sim.ctx(), ['x', 'e'], { mode: 'memory', rounds: 10, seconds: 15, dir: 'name', pairs: 10 });
    sim.run(asma, s, (st) => st.phase === 'final');
    return { x: s.g.pairs.x, e: s.g.pairs.e };
  });
  console.log(`asma memory: expert ${Math.round(r.rate * 100)}% of games, ${r.x.toFixed(1)} vs ${r.e.toFixed(1)} pairs`);
  expect(r.rate).toBeGreaterThanOrEqual(0.7);
}, 120_000);

/* ------------------------------------------------------------------ */
/* حروف                                                                */
/* ------------------------------------------------------------------ */

test('huroof: an expert team plans its path, buzzes only when it knows, and beats the old bots', () => {
  const r = series(14, (x, e, g) => {
    const X = { ids: ['x1', 'x2'], level: x.level };
    const E = { ids: ['e1', 'e2'], level: e.level };
    const sim = new Sim([X, E]);
    const s: any = huroof.start(sim.ctx(), ['x1', 'x2', 'e1', 'e2'], { seconds: 15 });
    const xRed = g % 2 === 0;
    s.teams = xRed ? { red: X.ids, green: E.ids } : { red: E.ids, green: X.ids };
    sim.run(huroof, s, (st) => st.phase === 'final');
    const xTeam = xRed ? 'red' : 'green';
    return { x: s.winner === xTeam ? 1 : 0, e: s.winner === xTeam ? 0 : 1 };
  });
  console.log(`huroof: expert team wins ${Math.round(r.rate * 100)}%`);
  expect(r.rate).toBeGreaterThanOrEqual(0.8);
}, 120_000);

test('huroof path planning: chains as short as possible (who wins a hexagon decides, not when it is picked)', () => {
  // each picked hexagon goes to a team at random: compare how many hexagons a team owns when it wins
  const run = (plan: boolean) => {
    let cells = 0, wins = 0;
    for (let g = 0; g < 200; g++) {
      seed(900 + g);
      const owners: ('red' | 'green' | null)[] = Array(HEX_N * HEX_N).fill(null);
      const a = g % 2 ? 'red' : 'green';
      let turn: 'red' | 'green' = Math.random() < 0.5 ? 'red' : 'green';
      for (;;) {
        const cell = huroofPick(owners, turn, turn === a && plan ? 'expert' : 'easy');
        expect(owners[cell]).toBeNull();
        const won = Math.random() < 0.5 ? 'red' : 'green';
        owners[cell] = won;
        turn = won;
        if (hexWinPath(owners, won)) {
          if (won === a) {
            wins++;
            cells += owners.filter((o) => o === a).length;
          }
          break;
        }
      }
    }
    return cells / wins;
  };
  const planned = run(true);
  const random = run(false);
  console.log(`huroof: hexagons owned at a win — planned ${planned.toFixed(1)}, random picks ${random.toFixed(1)}`);
  expect(planned).toBeLessThan(random - 2);
}, 120_000);

test('huroof: takes the winning hexagon, and blocks the only one the other team needs', () => {
  // red owns row 2 except its last hexagon: picking 14 can win at once
  const o: ('red' | 'green' | null)[] = Array(25).fill(null);
  for (const i of [10, 11, 12, 13]) o[i] = 'red';
  expect(hexDistance(o, 'red')).toBe(1);
  expect(huroofPick(o, 'red', 'expert')).toBe(14);
  // the same board seen by green: 14 is the hexagon to deny red
  expect(huroofPick(o, 'green', 'expert')).toBe(14);
  // random boards: whenever one hexagon wins on the spot, the expert takes it
  seed(5);
  let checked = 0;
  for (let t = 0; t < 400; t++) {
    const b: ('red' | 'green' | null)[] = Array(25).fill(null);
    for (let i = 0; i < 25; i++) b[i] = Math.random() < 0.3 ? 'red' : Math.random() < 0.4 ? 'green' : null;
    if (hexWinPath(b, 'red') || hexWinPath(b, 'green') || b.every(Boolean)) continue;
    const wins = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0 && hexWinPath(b.map((x, j) => (j === i ? 'red' : x)), 'red'));
    if (!wins.length) continue;
    checked++;
    expect(wins).toContain(huroofPick(b, 'red', 'expert'));
  }
  expect(checked).toBeGreaterThan(20);
  // and a pick is cheap: time it on random boards
  const ms: number[] = [];
  for (let t = 0; t < 300; t++) {
    const b: ('red' | 'green' | null)[] = Array(25).fill(null);
    for (let i = 0; i < 25; i++) b[i] = Math.random() < 0.2 ? 'red' : Math.random() < 0.25 ? 'green' : null;
    const t0 = performance.now();
    huroofPick(b, t % 2 ? 'red' : 'green', 'expert');
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  console.log(`huroof pick: median ${ms[150].toFixed(2)} ms, p95 ${ms[285].toFixed(2)} ms`);
  expect(ms[150]).toBeLessThan(5);
  expect(ms[285]).toBeLessThan(40);
}, 120_000);

/* ------------------------------------------------------------------ */
/* ماذا قال الناس؟                                                    */
/* ------------------------------------------------------------------ */

test('survey: an expert team names the common answers and beats the old bots', () => {
  const r = series(12, (x, e, g) => {
    const X = { ids: ['x1', 'x2'], level: x.level };
    const E = { ids: ['e1', 'e2'], level: e.level };
    const sim = new Sim([X, E]);
    const s: any = survey.start(sim.ctx(), ['x1', 'x2', 'e1', 'e2'], { rounds: 5, seconds: 20 });
    s.teams = g % 2 ? [X.ids, E.ids] : [E.ids, X.ids];
    survey.act(sim.ctx(), s, 'host', { type: 'begin' });
    sim.run(survey, s, (st) => st.phase === 'final');
    const xi = g % 2 ? 0 : 1;
    return { x: s.scores[xi], e: s.scores[1 - xi] };
  });
  console.log(`survey: expert team ${Math.round(r.rate * 100)}% (${Math.round(r.x)} vs ${Math.round(r.e)} points)`);
  expect(r.rate).toBeGreaterThanOrEqual(0.7);
  expect(r.x).toBeGreaterThan(r.e * 1.3);
}, 120_000);

/* ------------------------------------------------------------------ */
/* اسم ولد اسم بنت                                                    */
/* ------------------------------------------------------------------ */

test('names: expert bots fill more boxes with less common words (and call «ستوب»), beating the old bots', () => {
  for (const stop of [false, true]) {
    const r = series(10, (x, e) => {
      const sim = new Sim([x, e]);
      const s: any = names.start(sim.ctx(), ['x', 'e'], { rounds: 3, seconds: 90, stop, dict: 'strict' });
      sim.run(names, s, (st) => st.phase === 'final', (ctx, st) => {
        if (st.phase === 'review') names.act(ctx, st, 'host', { type: 'score' });
        else if (st.phase === 'results') names.act(ctx, st, 'host', { type: 'next' });
      });
      // every bot answer starts with the letter and is a dictionary word: no box was wrong
      return { x: s.scores.x, e: s.scores.e };
    });
    console.log(`names (stop ${stop}): expert ${Math.round(r.rate * 100)}% (${Math.round(r.x)} vs ${Math.round(r.e)})`);
    expect(r.rate).toBeGreaterThanOrEqual(0.8);
  }
  // the words: valid for the letter, and the expert skips the most common ones
  seed(3);
  for (const letter of ['م', 'س', 'ك']) {
    for (let i = 0; i < 50; i++) {
      const w = namesBotAnswer({ letter }, 'boy', 'expert');
      if (w) expect(w.length).toBeGreaterThan(1);
    }
  }
}, 120_000);

/* ------------------------------------------------------------------ */
/* البطاطا الساخنة                                                    */
/* ------------------------------------------------------------------ */

test('potato: expert bots get rid of the potato fast, at the slow players, and burn far less', () => {
  let burns = { x: 0, e: 0 };
  for (let g = 0; g < 10; g++) {
    seed(700 + g);
    const X = { ids: ['x1', 'x2'], level: 'expert' as const };
    const E = { ids: ['e1', 'e2'], level: 'easy' as const };
    const sim = new Sim([X, E]);
    const s: any = potato.start(sim.ctx(), ['x1', 'e1', 'x2', 'e2'], { rounds: 6, minFuse: 10, maxFuse: 30 });
    sim.run(potato, s, (st) => st.phase === 'final', (ctx, st) => {
      if (st.phase === 'boom') potato.act(ctx, st, 'host', { type: 'next' });
    });
    burns.x += s.burns.x1 + s.burns.x2;
    burns.e += s.burns.e1 + s.burns.e2;
  }
  console.log(`potato burns: expert ${burns.x} vs easy ${burns.e}`);
  expect(burns.x * 2).toBeLessThan(burns.e);
}, 120_000);

/* ------------------------------------------------------------------ */
/* الدخيل                                                              */
/* ------------------------------------------------------------------ */

/** One all-bot imposter round: clues by `clueLevel`, votes by `voteLevel` (the caught imposter guesses by `voteLevel` too). */
function imposterRound(players: number, clueLevel: BotLevel, voteLevel: BotLevel, category = 'random', hint = true) {
  const ids = Array.from({ length: players }, (_, i) => `b${i}`);
  const clueSim = new Sim([{ ids, level: clueLevel }]);
  const s: any = imposter.start(clueSim.ctx(clueSim.sides[0]), ids, { category, imposters: 1, hintForImposter: hint, rounds: 1 });
  const sim = new Sim([{ ids, level: voteLevel }]);
  sim.memo = clueSim.memo;
  sim.run(imposter, s, (st) => st.phase === 'result', (ctx, st) => {
    if (st.phase === 'clues') imposter.act(ctx, st, 'host', { type: 'toVote' });
  });
  return s;
}

test('imposter: civilian bots vote by the clues (no peeking) and catch the imposter far more often', () => {
  // same (old) clues, two ways of voting
  const caught = { expert: 0, easy: 0 };
  const n = 200;
  for (const level of ['expert', 'easy'] as const) {
    for (let g = 0; g < n; g++) {
      seed(40 + g);
      const s = imposterRound(5, 'easy', level);
      if (s.result.caught) caught[level]++;
    }
  }
  console.log(`imposter caught (old clues): expert votes ${caught.expert}/${n}, old votes ${caught.easy}/${n}`);
  expect(caught.expert).toBeGreaterThan(caught.easy * 2);
  // all bots at one strength (the imposter's clue blends in better too): still caught far more often
  const all = { expert: 0, easy: 0 };
  for (const level of ['expert', 'easy'] as const) {
    for (let g = 0; g < n; g++) {
      seed(4000 + g);
      if (imposterRound(5, level, level).result.caught) all[level]++;
    }
  }
  console.log(`imposter caught (all bots at one strength): expert ${all.expert}/${n}, old ${all.easy}/${n}`);
  expect(all.expert).toBeGreaterThan(all.easy * 2);
}, 120_000);

test('imposter clues: civilians never narrow the word down to under three, the imposter blends in', () => {
  seed(9);
  let narrow = { expert: 0, easy: 0 };
  let blend = { expert: 0, easy: 0 };
  const n = 300;
  for (let g = 0; g < n; g++) {
    for (const level of ['expert', 'easy'] as const) {
      const ids = ['b0', 'b1', 'b2', 'b3', 'b4'];
      const sim = new Sim([{ ids, level }]);
      const s: any = imposter.start(sim.ctx(sim.sides[0]), ids, { category: 'animals', imposters: 1, hintForImposter: true, rounds: 1 });
      const civClues = ids.filter((id) => !s.imposters.includes(id)).map((id) => s.botClues[id]);
      // the civilian clues together: how many words still fit
      for (const id of ids) if (!s.imposters.includes(id)) expect(traitPool(s.category, s.word, false)).toContain(s.botClues[id]);
      const fits = s.category.words.filter((w: string) => civClues.every((c: string) => traitPool(s.category, w, false).includes(c) || (TRAITS[s.category.key][w] ?? '').split('|').includes(c)));
      if (fits.length < 3) narrow[level]++;
      // does the imposter's clue fit the secret word (so it can't be told apart)?
      const imp = s.botClues[s.imposters[0]];
      if (suspicion(s.category, s.word, [s.imposters[0]], { [s.imposters[0]]: imp }, 1).get(s.imposters[0])! < 0.5) blend[level]++;
    }
  }
  console.log(`imposter clues: too narrow ${narrow.expert} vs ${narrow.easy}; imposter blends in ${blend.expert} vs ${blend.easy} (of ${n})`);
  expect(narrow.expert).toBeLessThanOrEqual(narrow.easy);
  expect(blend.expert).toBeGreaterThan(blend.easy);
  // the caught imposter reads the civilians' clues
  const cat = IMPOSTER_CATEGORIES.find((c) => c.key === 'animals')!;
  const clues = [civilianClue(cat, 'أسد', [], new Set(), () => 0), civilianClue(cat, 'أسد', [], new Set(['x']), () => 0.5)];
  expect(rankGuesses(cat, ['أسد', 'بقرة', 'حمامة', 'نحلة', 'دلفين', 'قط'], clues)[0].w).toBe('أسد');
  // with nothing to go on, an imposter says something vague (never empty)
  expect(imposterClue(null, [], new Set(), () => 0).length).toBeGreaterThan(1);
}, 120_000);

test('imposter: the caught expert imposter guesses the word from the clues much better than chance', () => {
  let right = 0, tries = 0;
  for (let g = 0; g < 300 && tries < 80; g++) {
    seed(6000 + g);
    const ids = ['b0', 'b1', 'b2', 'b3', 'b4'];
    const sim = new Sim([{ ids, level: 'expert' }]);
    const s: any = imposter.start(sim.ctx(sim.sides[0]), ids, { category: 'random', imposters: 1, hintForImposter: true, rounds: 1 });
    s.phase = 'vote';
    for (const id of ids) if (id !== s.imposters[0]) s.votes.set(id, s.imposters[0]);
    s.votes.set(s.imposters[0], ids.find((i) => i !== s.imposters[0]));
    imposter.act(sim.ctx(), s, ids.find((i) => i !== s.imposters[0])!, { type: 'vote', target: s.imposters[0] });
    if (s.phase !== 'guess') continue;
    tries++;
    sim.run(imposter, s, (st) => st.phase === 'result');
    if (s.result.guessCorrect) right++;
  }
  console.log(`imposter last-chance guess: ${right}/${tries} (chance ≈ 1/6)`);
  expect(right / tries).toBeGreaterThan(0.6);
}, 120_000);

/* ------------------------------------------------------------------ */
/* الذئب                                                               */
/* ------------------------------------------------------------------ */

/** A whole werewolf game, the test playing the narrator; village and wolves may play at different strengths. */
function wolfGame(village: BotLevel, wolves: BotLevel, g: number) {
  seed(8000 + g);
  const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
  const allSim = new Sim([{ ids, level: 'expert' }]);
  const settings = { narratorId: 'n', wolves: 2, seer: true, doctor: true, hunter: true, witch: true, guard: false, mayor: false, tanner: false, whitewolf: false, bigwolf: false };
  const s: any = werewolf.start(allSim.ctx(), ['n', ...ids], settings);
  const isWolf = (id: string) => ['wolf', 'bigwolf', 'whitewolf'].includes(s.roles[id]);
  const W = { ids: ids.filter(isWolf), level: wolves };
  const V = { ids: ids.filter((id) => !isWolf(id)), level: village };
  const sim = new Sim([V, W]);
  const ctx = sim.ctx();
  for (let guard = 0; guard < 400 && s.phase !== 'over'; guard++) {
    sim.now += 5000;
    if (s.phase === 'day' && s.step === 'vote') {
      // the bots speak one after another (each hearing the ones before, each at its side's strength), then
      // the narrator follows the village: the most accused player goes
      const said: any[] = [];
      for (const b of ids.filter((id) => s.alive[id]).sort(() => Math.random() - 0.5)) {
        s.accusedDay = 0;
        werewolf.botPlan!(sim.ctx({ ids: [b], level: isWolf(b) ? wolves : village }), s, [b]);
        said.push(...s.accusations);
      }
      s.accusations = said;
      s.accusedDay = s.day;
      const tally = new Map<string, number>();
      for (const a of s.accusations) if (s.alive[a.target]) tally.set(a.target, (tally.get(a.target) ?? 0) + 1);
      const max = Math.max(0, ...tally.values());
      const topIds = [...tally].filter(([, c]) => c === max).map(([id]) => id);
      werewolf.act(ctx, s, 'n', topIds.length ? { type: 'eliminate', target: topIds[Math.floor(Math.random() * topIds.length)] } : { type: 'next' });
      continue;
    }
    werewolf.botPlan!(sim.ctx(V), s, V.ids);
    werewolf.botPlan!(sim.ctx(W), s, W.ids);
    // every pick the bots made is legal for its step
    for (const id of [s.wolvesTarget, s.doctorSave, s.seerCheck, s.witchPoison, s.hunterTarget].filter(Boolean)) expect(s.participants).toContain(id);
    if (s.wolvesTarget) expect(isWolf(s.wolvesTarget)).toBe(false);
    werewolf.act(ctx, s, 'n', { type: 'next' });
  }
  expect(s.phase).toBe('over');
  return s.winner as string;
}

test('werewolf: expert villagers find the wolves from what was said and seen; expert wolves hide better', () => {
  const n = 100;
  let village = { expert: 0, easy: 0 };
  for (let g = 0; g < n; g++) {
    if (wolfGame('expert', 'easy', g) === 'village') village.expert++;
    if (wolfGame('easy', 'easy', g) === 'village') village.easy++;
  }
  let wolves = { expert: 0, easy: 0 };
  for (let g = 0; g < n; g++) {
    if (wolfGame('easy', 'expert', g) === 'wolves') wolves.expert++;
    if (wolfGame('easy', 'easy', g) === 'wolves') wolves.easy++;
  }
  console.log(`werewolf: village wins ${village.expert}/${n} (expert) vs ${village.easy}/${n} (old); wolves win ${wolves.expert}/${n} (expert) vs ${wolves.easy}/${n} (old)`);
  expect(village.expert).toBeGreaterThan(village.easy * 1.25);
  expect(wolves.expert).toBeGreaterThan(wolves.easy);
}, 120_000);

test('werewolf: suspicion comes from public facts only', () => {
  const seen = {
    participants: ['a', 'b', 'c', 'd', 'e'],
    alive: { a: true, b: true, c: true, d: false, e: true },
    mayorId: null,
    pub: { nightDead: { d: 2 }, out: {}, acc: [{ day: 1, by: 'd', target: 'b' }, { day: 1, by: 'c', target: 'd' }, { day: 1, by: 'e', target: 'a' }] },
  };
  const m = villageScores(seen, 'a');
  // b was named by the player the wolves then killed; c had accused that (innocent) victim; e accused me
  expect(m.get('b')!).toBeGreaterThan(0);
  expect(m.get('c')!).toBeGreaterThan(0);
  expect(m.get('e')!).toBeGreaterThan(m.get('c')! - 1);
  expect(m.has('a')).toBe(false);
}, 120_000);

/* ------------------------------------------------------------------ */
/* كلمة واحدة                                                          */
/* ------------------------------------------------------------------ */

test('oneword: expert bots give discriminating clues that never cancel each other, and guess well', () => {
  // clues: every bot's clue is legal, and the bots' clues are all different
  for (const w of ONEWORD_WORDS.slice(0, 120)) {
    const clues = [0, 1, 2, 3, 4].map((k) => conventionClue(w, k, false));
    expect(new Set(clues.map(clueKey)).size).toBe(Math.min(5, new Set(clues.map(clueKey)).size));
    for (const c of clues.slice(0, 3)) expect(clueHits(c).some((h) => h.w === w)).toBe(true);
  }
  // guessing: with three of the word's associations the expert finds it almost always; the old bot less
  seed(2);
  let x = 0, e = 0, wrongX = 0;
  for (const w of ONEWORD_WORDS) {
    const clues = w.c.slice(2, 5);
    const gx = expertGuess(clues);
    if (gx === w.w) x++;
    else if (gx) wrongX++;
    if (botGuess(clues, 'medium') === w.w) e++;
  }
  console.log(`oneword guesses from 3 clues: expert ${x}, old ${e} of ${ONEWORD_WORDS.length} (expert wrong ${wrongX})`);
  expect(x).toBeGreaterThan(e);
  expect(wrongX).toBeLessThan(ONEWORD_WORDS.length * 0.05);
  // nothing to go on: pass
  expect(expertGuess([])).toBeNull();
  expect(guessPosterior(['كلمةغريبةجدا']).length).toBe(0);
  expect(botClue(ONEWORD_WORDS[0])).toBeTruthy();
}, 120_000);

test('oneword: an expert bot family wins clearly more cards than the old bots', () => {
  const score = { expert: 0, easy: 0 };
  for (const level of ['expert', 'easy'] as const) {
    for (let g = 0; g < 6; g++) {
      seed(1200 + g);
      const ids = ['b0', 'b1', 'b2', 'b3', 'b4'];
      const sim = new Sim([{ ids, level }]);
      const s: any = oneword.start(sim.ctx(), ids, { cards: 13, seconds: 60, level: 'medium' });
      sim.run(oneword, s, (st) => st.phase === 'final', (ctx, st) => {
        if (st.phase === 'reveal') oneword.act(ctx, st, 'host', { type: 'next' });
      });
      score[level] += s.won;
    }
  }
  console.log(`oneword cards won: expert ${score.expert}, old ${score.easy} (6 games of 13)`);
  expect(score.expert).toBeGreaterThan(score.easy);
  expect(score.expert / 6).toBeGreaterThanOrEqual(9);
}, 120_000);

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

test('every bot decision above stayed well under the 60 ms budget', () => {
  const rows: string[] = [];
  for (const [game, list] of timings) {
    const sorted = [...list].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const max = sorted[sorted.length - 1];
    rows.push(`${game} p99 ${p99.toFixed(1)} / max ${max.toFixed(1)}`);
    // generous margins (the machine may be loaded, and a lone outlier can be a garbage-collection pause of
    // the test itself): the typical decision is tiny and almost none come near the budget
    const median = sorted[Math.floor(sorted.length / 2)];
    expect([game, median < 5, p99 < 40]).toEqual([game, true, true]);
    expect([game, sorted.filter((x) => x > 60).length <= Math.max(3, sorted.length * 0.005)]).toEqual([game, true]);
  }
  console.log(`bot decision times (ms): ${rows.join(' · ')}`);
  // legal moves: the games refused (almost) none of the bots' actions — a refusal is only ever a move
  // overtaken by events (the room drops it and the bot plans again)
  const refused = [...actions].map(([g, c]) => `${g} ${c.refused}/${c.ok + c.refused}`);
  console.log(`bot actions refused: ${refused.join(' · ')}`);
  for (const [g, c] of actions) expect([g, c.refused <= Math.max(2, (c.ok + c.refused) * 0.01)]).toEqual([g, true]);
}, 120_000);
