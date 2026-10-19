/** GameModule.result(): each game's final standing (for tournaments) — batch B. */
import { expect, test } from 'bun:test';

import { DEFAULT_SETTINGS, isWolfRole } from '../src/shared/protocol';
import { ludo } from './games/ludo';
import { mancala } from './games/mancala';
import { mapquiz } from './games/mapquiz';
import { memory } from './games/memory';
import { mosque } from './games/mosque';
import { names } from './games/names';
import { oneword } from './games/oneword';
import { phase10 } from './games/phase10';
import { potato } from './games/potato';
import { prophets } from './games/prophets';
import { qquote } from './games/qquote';
import { ronda } from './games/ronda';
import { scrabble } from './games/scrabble';
import { spy } from './games/spy';
import { steps } from './games/steps';
import { sudoku } from './games/sudoku';
import { survey } from './games/survey';
import { taboo } from './games/taboo';
import { tajweed } from './games/tajweed';
import { teledraw } from './games/teledraw';
import { tris } from './games/tris';
import { unoflip } from './games/unoflip';
import { wave } from './games/wave';
import { werewolf } from './games/werewolf';
import { whois } from './games/whois';
import { wordle } from './games/wordle';
import { GameError, type GameResult } from './types';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type Act = (by: string, a: any) => void;

interface SimOpts {
  /** players run by botPlan (default: everyone) */
  bots?: string[];
  /** host / human moves, tried whenever no bot move is due (before the clock moves on) */
  drive?: (s: any, act: Act, ctx: any) => void;
  /** game over (default: phase 'final') */
  done?: (s: any) => boolean;
  max?: number;
}

/**
 * Play a game to the end with a tiny fake room: bot moves are queued with their delay (each bot + key
 * once, as in the room), `drive` plays the host / humans, and the clock jumps forward when idle.
 * Also checks result() stayed null on every step before the end.
 */
function sim(mod: any, players: string[], settings: any, o: SimOpts = {}) {
  const bots = o.bots ?? players;
  const queue: { at: number; by: string; a: any }[] = [];
  const keys = new Set<string>();
  const ctx: any = {
    now: 1_000_000,
    fx: () => {},
    say: () => {},
    isConnected: () => true,
    isBot: (id: string) => bots.includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    bot(by: string, key: string, delay: number, a: any) {
      if (keys.has(`${by}|${key}`)) return;
      keys.add(`${by}|${key}`);
      queue.push({ at: ctx.now + delay, by, a });
    },
  };
  const s: any = mod.start(ctx, players, settings);
  const act: Act = (by, a) => {
    try {
      mod.act(ctx, s, by, a);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
    }
  };
  const done = o.done ?? ((x: any) => x.phase === 'final');
  let early = 0;
  for (let k = 0; k < (o.max ?? 300_000) && !done(s); k++) {
    if (mod.result(s) !== null) early++;
    if (mod.botPlan?.(ctx, s, bots)) continue;
    queue.sort((x, y) => x.at - y.at);
    if (queue.length && queue[0].at <= ctx.now) {
      const z = queue.shift()!;
      act(z.by, z.a);
      continue;
    }
    o.drive?.(s, act, ctx);
    if (done(s)) break;
    ctx.now = Math.min(queue[0]?.at ?? Infinity, ctx.now + 1000);
    mod.tick?.(ctx, s);
  }
  expect(done(s)).toBe(true);
  expect(early).toBe(0);
  return { s, ctx, act };
}

/** The result exists, has no empty place, and lists exactly `who`, each once. */
function check(mod: any, s: any, who: string[]): GameResult {
  const r: GameResult | null = mod.result(s);
  expect(r).not.toBeNull();
  expect(r!.places.length).toBeGreaterThan(0);
  expect(r!.places.every((p) => p.length > 0)).toBe(true);
  expect(r!.places.flat().sort()).toEqual([...who].sort());
  return r!;
}

/** Places follow `score` (best first, strictly worse from one place to the next, equal inside a place). */
function ordered(r: GameResult, score: (id: string) => number) {
  r.places.forEach((p, i) => {
    for (const id of p) expect(score(id)).toBe(score(p[0]));
    if (i) expect(score(r.places[i - 1][0])).toBeGreaterThan(score(p[0]));
  });
}

/** The same check for a pure re-ranking: force a tie between two players and see them share a place. */
function tieShares(mod: any, s: any, scores: Record<string, number>, a: string, b: string) {
  scores[b] = scores[a];
  const r: GameResult = mod.result(s);
  expect(r.places.some((p) => p.includes(a) && p.includes(b))).toBe(true);
}

const P3 = ['a', 'b', 'c'];
const P4 = ['a', 'b', 'c', 'd'];
const next: SimOpts['drive'] = (_s, act) => act('a', { type: 'next' });

/* ------------------------------------------------------------------ */
/* Duels and races                                                     */
/* ------------------------------------------------------------------ */

test('ludo: the winner, then the others share second; with «podium» the full order', () => {
  const { s } = sim(ludo, P3, { ...DEFAULT_SETTINGS.ludo, quick: true });
  const r = check(ludo, s, P3);
  expect(r.places[0]).toEqual([s.winner]);
  expect(r.places[1].length).toBe(2);
  const { s: t } = sim(ludo, P3, { ...DEFAULT_SETTINGS.ludo, quick: true, podium: true });
  const r2 = check(ludo, t, P3);
  expect(r2.places).toEqual(t.ranking.map((id: string) => [id]));
  // the other player left: the one still racing wins
  const ctx: any = { now: 0, fx() {}, isConnected: () => true, isBot: () => false, playerName: (x: string) => x, memo: new Map(), bot() {} };
  const u: any = ludo.start(ctx, ['a', 'b'], DEFAULT_SETTINGS.ludo);
  ludo.onLeave!(ctx, u, 'a');
  expect(check(ludo, u, ['b']).places).toEqual([['b']]);
});

test('mancala: winner then loser; a draw shares first; a resignation counts', () => {
  const { s } = sim(mancala, ['a', 'b'], DEFAULT_SETTINGS.mancala);
  const r = check(mancala, s, ['a', 'b']);
  if (s.winner === 'draw') expect(r.places.length).toBe(1);
  else expect(r.places).toEqual([[s.seats[s.winner]], [s.seats[1 - s.winner]]]);
  s.winner = 'draw';
  expect(mancala.result!(s)!.places.length).toBe(1);
  const { s: t, act } = sim(mancala, ['a', 'b'], DEFAULT_SETTINGS.mancala, { bots: [], done: (x) => x.moves > 0 || x.phase === 'final', drive: (x, a) => a(x.seats[x.turn], { type: 'sow', pit: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].find((p) => x.board[p] > 0 && (x.turn === 0 ? p < 6 : p > 6)) }) });
  expect(mancala.result!(t)).toBeNull();
  act('a', { type: 'resign' });
  expect(check(mancala, t, ['a', 'b']).places).toEqual([['b'], ['a']]);
});

test('sudoku: ranked by points (first finisher ahead)', () => {
  const { s } = sim(sudoku, P3, { level: 'easy' });
  const r = check(sudoku, s, P3);
  ordered(r, (id) => s.scores[id]);
  expect(r.places[0]).toContain(s.finished[0].id);
});

test('memory: ranked by pairs; equal pairs share a place', () => {
  const { s } = sim(memory, P3, { pairs: 6 });
  const r = check(memory, s, P3);
  ordered(r, (id) => s.pairs[id]);
  tieShares(memory, s, s.pairs, 'a', 'b');
});

/* ------------------------------------------------------------------ */
/* Card and board games                                                */
/* ------------------------------------------------------------------ */

test('phase10: the winner, then by phases completed and fewest points', () => {
  const { s } = sim(phase10, P3, { short: true }, { drive: next });
  const r = check(phase10, s, P3);
  expect(r.places[0]).toEqual([s.winner]);
  const key = (id: string) => s.progress[id] * 1e6 - s.scores[id];
  ordered({ places: r.places.slice(1) }, key);
});

test('ronda: 1v1 winner then loser; 2v2 partners share their side\'s place', () => {
  const { s } = sim(ronda, ['a', 'b'], { target: 21 }, { drive: next });
  const r = check(ronda, s, ['a', 'b']);
  expect(r.places).toEqual([[s.winner], [s.winner === 'a' ? 'b' : 'a']]);
  const { s: t } = sim(ronda, P4, { target: 21 }, { drive: next });
  const r2 = check(ronda, t, P4);
  const sides = Object.fromEntries(t.sides.map((x: any) => [x.key, x.members]));
  expect(r2.places).toEqual([sides[t.winner], sides[t.winner === 'A' ? 'B' : 'A']]);
  // a player leaving ends the game with no winner: no result
  const { s: u, ctx } = sim(ronda, ['a', 'b'], { target: 21 }, { done: (x) => x.deal > 0 });
  ronda.onLeave!(ctx, u, 'a');
  expect(ronda.result!(u)).toBeNull();
});

test('tris: the winning team, then the other team', () => {
  const { s } = sim(tris, P4, { target: 11 }, { drive: next });
  const r = check(tris, s, P4);
  const win = s.sides.find((x: any) => x.key === s.winner).members;
  expect(r.places.length).toBe(2);
  expect([...r.places[0]].sort()).toEqual([...win].sort());
});

test('unoflip: the winner, then the others by points', () => {
  const { s } = sim(unoflip, P3, { target: 150 }, { drive: next });
  const r = check(unoflip, s, P3);
  expect(r.places[0]).toEqual([s.winner]);
  ordered({ places: r.places.slice(1) }, (id) => s.scores[id]);
});

test('scrabble: ranked by final score', () => {
  const { s } = sim(scrabble, ['a', 'b'], DEFAULT_SETTINGS.scrabble);
  const r = check(scrabble, s, ['a', 'b']);
  ordered(r, (id) => s.scores[id]);
  if (s.final.winner) expect(r.places[0]).toEqual([s.final.winner]);
  tieShares(scrabble, s, s.scores, 'a', 'b');
}, 30_000); // a whole bot game: slow on a busy machine

/* ------------------------------------------------------------------ */
/* Quizzes and score races                                             */
/* ------------------------------------------------------------------ */

const scoreGames: [string, any, any, string[], SimOpts?][] = [
  ['mapquiz', mapquiz, { ...DEFAULT_SETTINGS.mapquiz, rounds: 3 }, P3],
  ['qquote', qquote, { ...DEFAULT_SETTINGS.qquote, rounds: 4 }, P3],
  ['wordle (Quran words)', wordle, { ...DEFAULT_SETTINGS.wordle, words: 'quran', rounds: 2 }, P3],
  ['wordle (mix)', wordle, { ...DEFAULT_SETTINGS.wordle, words: 'mix', race: true, rounds: 3 }, P3],
  ['steps', steps, { ...DEFAULT_SETTINGS.steps, rounds: 3 }, P3],
  ['tajweed', tajweed, { ...DEFAULT_SETTINGS.tajweed, rounds: 5 }, P3],
  ['whois', whois, { rounds: 3, typed: false }, P3],
  ['wordle', wordle, { rounds: 2 }, P3],
  ['names', names, { ...DEFAULT_SETTINGS.names, rounds: 2, seconds: 60 }, P3, { drive: (_s, act) => (act('a', { type: 'score' }), act('a', { type: 'next' })) }],
];

for (const [id, mod, settings, players, opts] of scoreGames) {
  test(`${id}: ranked by score, ties share a place`, () => {
    const { s } = sim(mod, players, settings, opts);
    const r = check(mod, s, players);
    ordered(r, (p) => s.scores[p] ?? 0);
    tieShares(mod, s, s.scores, players[0], players[1]);
  });
}

test('mapquiz / qquote: everyone leaving ends without a result', () => {
  for (const mod of [mapquiz, qquote] as any[]) {
    const { s, ctx } = sim(mod, P3, { ...(mod === mapquiz ? DEFAULT_SETTINGS.mapquiz : DEFAULT_SETTINGS.qquote), rounds: 3 }, { done: () => true });
    for (const p of P3) mod.onLeave(ctx, s, p);
    s.phase = 'final';
    expect(mod.result(s)).toBeNull();
  }
});

test('potato: fewest burns wins', () => {
  const { s } = sim(potato, P4, { rounds: 3, minFuse: 5, maxFuse: 6 }, { drive: next });
  const r = check(potato, s, P4);
  ordered(r, (id) => -s.burns[id]);
  tieShares(potato, s, s.burns, 'a', 'b');
});

/* ------------------------------------------------------------------ */
/* Co-op games                                                         */
/* ------------------------------------------------------------------ */

test('mosque (co-op): everyone together, won = the whole mosque built', () => {
  for (const level of ['easy', 'hard']) {
    const { s } = sim(mosque, P3, { ...DEFAULT_SETTINGS.mosque, level });
    const r = check(mosque, s, P3);
    expect(r.places.length).toBe(1);
    expect(r.coop).toEqual({ won: s.completed === true });
  }
  const { s, ctx } = sim(mosque, P3, DEFAULT_SETTINGS.mosque, { done: () => true });
  for (const p of P3) mosque.onLeave!(ctx, s, p);
  expect(s.phase).toBe('final');
  expect(mosque.result!(s)).toBeNull();
});

test('prophets (co-op): everyone together, won = the story completed with a lantern lit', () => {
  const { s } = sim(prophets, P3, DEFAULT_SETTINGS.prophets);
  const r = check(prophets, s, P3);
  expect(r.places.length).toBe(1);
  expect(r.coop).toEqual({ won: s.completed === true });
  expect(s.completed).toBe(s.lanterns > 0);
});

test('oneword (co-op): everyone together, won = more than half of the cards; ended early = no result', () => {
  const { s } = sim(oneword, P4, { ...DEFAULT_SETTINGS.oneword, cards: 7 }, { drive: next });
  const r = check(oneword, s, P4);
  expect(r.places.length).toBe(1);
  expect(r.coop).toEqual({ won: s.won * 2 > 7 });
  const { s: t, ctx } = sim(oneword, P4, { ...DEFAULT_SETTINGS.oneword, cards: 7 }, { done: () => true });
  oneword.onLeave!(ctx, t, 'a');
  oneword.onLeave!(ctx, t, 'b');
  expect(t.phase).toBe('final');
  expect(oneword.result!(t)).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Team games                                                          */
/* ------------------------------------------------------------------ */

test('survey: the winning team, then the other; a tie puts both teams first', () => {
  const { s } = sim(survey, P4, { rounds: 3, seconds: 20 }, { drive: (_s, act) => (act('a', { type: 'begin' }), act('a', { type: 'next' })) });
  const r = check(survey, s, P4);
  const [a, b] = s.scores;
  if (a === b) expect(r.places.length).toBe(1);
  else expect([...r.places[0]].sort()).toEqual([...s.teams[a > b ? 0 : 1]].sort());
  s.winner = -1;
  expect(check(survey, s, P4).places.length).toBe(1);
});

test('taboo: the team with more words first; a tie shares first place', () => {
  const players = ['a', 'b', 'c', 'd', 'e'];
  let n = 0;
  const { s } = sim(taboo, players, { seconds: 60, turnsEach: 2 }, {
    bots: [],
    drive: (x, act) => {
      if (x.phase === 'teams') act('a', { type: 'begin' });
      else if (x.phase === 'ready') act(x.describerId, { type: 'start' });
      else if (x.phase === 'play') {
        // the team that starts gets 3 words a turn, the other 1
        const words = x.turn % 2 === 0 ? 3 : 1;
        if (n++ < words) act(x.describerId, { type: 'ok', index: x.card.index });
        else (act('a', { type: 'endTurn' }), (n = 0));
      } else if (x.phase === 'turnEnd') act('a', { type: 'next' });
    },
  });
  const r = check(taboo, s, players);
  const first = s.startTeam;
  expect(s.teamScores[first]).toBe(6);
  expect(r.places).toEqual([s.teams[first], s.teams[1 - first]]);
  s.teamScores = [4, 4];
  expect(check(taboo, s, players).places.length).toBe(1);
});

test('werewolf: the winning camp first, the narrator left out, the tanner loses with the village', () => {
  const players = ['n', 'a', 'b', 'c', 'd', 'e', 'f'];
  const settings = { ...DEFAULT_SETTINGS.werewolf, narratorId: 'n', wolves: 2, tanner: true };
  for (const camp of ['village', 'wolves']) {
    const ctx: any = { now: 0, fx() {}, isConnected: () => true, isBot: () => false, playerName: (x: string) => x, memo: new Map(), bot() {} };
    const s: any = werewolf.start(ctx, players, settings);
    expect(werewolf.result!(s)).toBeNull();
    const kill = (id: string) => s.phase !== 'over' && werewolf.act(ctx, s, 'n', { type: 'toggleAlive', target: id });
    const wolves = s.participants.filter((id: string) => isWolfRole(s.roles[id]));
    const others = s.participants.filter((id: string) => !isWolfRole(s.roles[id]));
    for (const id of camp === 'village' ? wolves : others) kill(id);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(camp);
    const r = check(werewolf, s, players.slice(1));
    expect(r.places.length).toBe(2);
    const tanner = s.participants.find((id: string) => s.roles[id] === 'tanner');
    expect(r.places[1]).toContain(tanner);
    expect([...r.places[0]].sort()).toEqual((camp === 'village' ? others.filter((id: string) => id !== tanner) : wolves).sort());
  }
  // the narrator leaving: no winner, no result
  const ctx: any = { now: 0, fx() {}, isConnected: () => true, isBot: () => false, playerName: (x: string) => x, memo: new Map(), bot() {} };
  const s: any = werewolf.start(ctx, players, settings);
  werewolf.onLeave!(ctx, s, 'n');
  expect(s.phase).toBe('over');
  expect(werewolf.result!(s)).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Party games played by humans                                        */
/* ------------------------------------------------------------------ */

test('spy: ranked by points over the rounds', () => {
  const players = ['a', 'b', 'c', 'd', 'e'];
  const { s } = sim(spy, players, { spies: 1, minutes: 8, rounds: 3 }, {
    bots: [],
    drive: (x, act) => {
      if (x.phase === 'reveal') act('a', { type: 'skipReady' });
      else if (x.phase === 'play') {
        const spyId = x.spies[0];
        if (x.round % 2) {
          act(spyId, { type: 'spyReveal' });
          act(spyId, { type: 'spyGuess', location: x.location.name });
        } else {
          const by = x.participants.find((p: string) => p !== spyId);
          act(by, { type: 'accuse', target: spyId });
          for (const p of x.participants) if (p !== spyId) act(p, { type: 'accuseVote', yes: true });
        }
      } else if (x.phase === 'result') act('a', { type: 'next' });
    },
  });
  const r = check(spy, s, players);
  ordered(r, (id) => s.scores[id] ?? 0);
  tieShares(spy, s, s.scores, 'a', 'b');
});

test('wave: ranked by points', () => {
  const { s } = sim(wave, P3, { rounds: 1 }, {
    bots: [],
    drive: (x, act) => {
      if (x.phase === 'clue') act(x.giver, { type: 'clue', text: 'تلميح' });
      else if (x.phase === 'guess') x.players.forEach((p: string, i: number) => act(p, { type: 'guess', value: x.target + i * 15 }));
    },
  });
  const r = check(wave, s, P3);
  ordered(r, (id) => s.scores[id]);
});

test('teledraw: ranked by votes received; without votes everyone shares first place', () => {
  for (const votes of [true, false]) {
    const players = ['p0', 'p1', 'p2', 'p3'];
    const { s } = sim(teledraw, players, { ...DEFAULT_SETTINGS.teledraw, votes }, {
      bots: [],
      drive: (x, act) => {
        if (x.phase === 'write' || x.phase === 'draw' || x.phase === 'guess') {
          for (const id of teledraw.turnOf!(x)) {
            const t = x.tasks[id];
            if (t.kind === 'write') act(id, { type: 'pick', text: `جملة ${id}` });
            else if (t.kind === 'draw') {
              act(id, { type: 'stroke', c: '#123456', w: 10, p: [100, 100, 500, 500, 900, 120] });
              act(id, { type: 'done' });
            } else act(id, { type: 'guess', text: `تخمين ${id}` });
          }
        } else if (x.phase === 'reveal') act(x.seats[0], { type: 'next', at: `${x.rb}:${x.rp}` });
        else if (x.phase === 'vote') {
          for (const id of x.live) {
            const ref = x.books
              .flatMap((b: any, bi: number) => b.pages.map((p: any, pi: number) => ({ p, bi, pi })))
              .find((z: any) => z.p.kind === 'draw' && !z.p.empty && !z.p.left && z.p.by !== id);
            if (ref) act(id, { type: 'vote', cat: 'draw', book: ref.bi, page: ref.pi });
            act(id, { type: 'confirm' });
          }
        }
      },
    });
    const r = check(teledraw, s, players);
    if (votes) {
      expect(s.result.votes).toBe(true);
      ordered(r, (id) => s.result.scores[id] ?? 0);
      expect(r.places.length).toBeGreaterThan(1);
    } else expect(r.places.length).toBe(1);
  }
});
