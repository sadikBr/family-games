/** GameModule.result() for tournaments: asma … ladders (batch A). */
import { expect, test } from 'bun:test';

import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { asma } from './games/asma';
import { baloot } from './games/baloot';
import { battleship } from './games/battleship';
import { blocks } from './games/blocks';
import { boggle } from './games/boggle';
import { carca } from './games/carca';
import { catan } from './games/catan';
import { charades, COUNTDOWN_MS } from './games/charades';
import { chess } from './games/chess';
import { codebreak } from './games/codebreak';
import { codenames } from './games/codenames';
import { connect4 } from './games/connect4';
import { dama } from './games/dama';
import { dots } from './games/dots';
import { draw } from './games/draw';
import { estate, worthOf } from './games/estate';
import { hajj, hajjOrder } from './games/hajj';
import { headsup } from './games/headsup';
import { huroof } from './games/huroof';
import { imposter } from './games/imposter';
import { kanza } from './games/kanza';
import { kdab } from './games/kdab';
import { kharbga } from './games/kharbga';
import { konkan } from './games/konkan';
import { ladders, laddersOrder } from './games/ladders';
import type { GameModule, GameResult } from './types';

interface Job {
  at: number;
  by: string;
  a: any;
  key: string;
}

function fakeCtx() {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const ctx: any = {
    now: 1000,
    fx: () => {},
    isConnected: () => true,
    isBot: () => true,
    playerName: (id: string) => id,
    memo: new Map(),
    say: () => {},
    // like the room: one job per bot + key per game, played after its delay
    bot: (by: string, key: string, delay: number, a: any) => {
      const k = `${by}:${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + delay, by, a, key: k });
    },
  };
  return { ctx, jobs, keys };
}

const isOver = (s: any) => s.phase === 'final' || s.m?.phase === 'final';

/**
 * Play a bot-only game to the end: bots plan after every change, their jobs run when due, the clock
 * moves on and ticks in between. `nudge` plays the host's buttons when nothing else happens.
 */
function botGame(mod: GameModule<any, any>, players: string[], settings: any, opts: { steps?: number; dt?: number; nudge?: (ctx: any, s: any) => void; each?: (s: any) => void } = {}): { s: any; ctx: any; r: GameResult } {
  const { ctx, jobs, keys } = fakeCtx();
  const s: any = mod.start(ctx, players, settings);
  expect(mod.result!(s)).toBeNull();
  const dt = opts.dt ?? 1000;
  for (let k = 0; k < (opts.steps ?? 20000) && !isOver(s); k++) {
    opts.each?.(s);
    mod.botPlan?.(ctx, s, players);
    jobs.sort((x, y) => x.at - y.at);
    const job = jobs[0];
    if (job && job.at <= ctx.now + dt) {
      jobs.shift();
      if (job.at > ctx.now) {
        ctx.now = job.at;
        mod.tick?.(ctx, s);
      }
      try {
        mod.act(ctx, s, job.by, job.a);
      } catch {
        // refused (e.g. a stale move): like the room, the bot thinks again on the next plan
        keys.delete(job.key);
      }
      continue;
    }
    ctx.now += dt;
    if (!mod.tick?.(ctx, s) && !job) opts.nudge?.(ctx, s);
  }
  expect(isOver(s)).toBe(true);
  return { s, ctx, r: mod.result!(s) as GameResult };
}

/** Each listed player exactly once, nobody else, no empty place. */
function covers(r: GameResult | null, ids: string[]) {
  expect(r).not.toBeNull();
  for (const p of r!.places) expect(p.length).toBeGreaterThan(0);
  expect(r!.places.flat().sort()).toEqual([...ids].sort());
}

/** Places follow `score` strictly (best first), and equal scores share a place. */
function rankedBy(r: GameResult, score: (id: string) => number, lowIsBetter = false) {
  const v = (id: string) => (lowIsBetter ? -score(id) : score(id));
  for (const place of r.places) expect(new Set(place.map(v)).size).toBe(1);
  for (let i = 1; i < r.places.length; i++) expect(v(r.places[i - 1][0])).toBeGreaterThan(v(r.places[i][0]));
}

const P2 = ['a', 'b'];
const P3 = ['a', 'b', 'c'];
const P4 = ['a', 'b', 'c', 'd'];

test('asma: match by score, memory by pairs; everyone gone = no result', () => {
  for (const players of [P2, P3]) {
    const { s, r } = botGame(asma, players, { ...DEFAULT_SETTINGS.asma, rounds: 5 });
    covers(r, players);
    rankedBy(r, (id) => (s as any).m.scores[id]);
  }
  const { s, r } = botGame(asma, P3, { ...DEFAULT_SETTINGS.asma, mode: 'memory', pairs: 8 });
  covers(r, P3);
  rankedBy(r, (id) => (s as any).g.pairs[id]);
  expect(r.places[0].sort()).toEqual((asma.view({} as any, s, 'a') as any).winner.sort());
  // a memory tie
  const t: any = asma.start(fakeCtx().ctx, P2, { ...DEFAULT_SETTINGS.asma, mode: 'memory' });
  t.phase = 'final';
  t.g.pairs = { a: 4, b: 4 };
  expect(asma.result!(t)!.places.map((p) => p.sort())).toEqual([['a', 'b']]);
  // match: all players leave mid-game
  const { ctx } = fakeCtx();
  ctx.isConnected = () => false;
  ctx.isBot = () => false;
  const m: any = asma.start(ctx, P2, DEFAULT_SETTINGS.asma);
  asma.onLeave!(ctx, m, 'a');
  expect(m.m.phase).toBe('final');
  expect(asma.result!(m)).toBeNull();
});

test('baloot: the winning team first, both partners share the place', () => {
  const { s, r } = botGame(baloot, P4, { ...DEFAULT_SETTINGS.baloot, target: 100 }, { steps: 200000, dt: 500 });
  covers(r, P4);
  expect(r.places.length).toBe(2);
  const win = s.sides.find((x: any) => x.key === s.winner)!.members;
  expect(r.places[0].sort()).toEqual([...win].sort());
  expect(s.scores[s.winner!]).toBeGreaterThan(s.scores[s.winner === 'A' ? 'B' : 'A']);
});

test('battleship / chess / connect4 / dama / kharbga: winner then loser, a draw shares first place', () => {
  const duels: [GameModule<any, any>, any, (s: any) => string | null][] = [
    [battleship, DEFAULT_SETTINGS.battleship, (s) => s.winner],
    [connect4, DEFAULT_SETTINGS.connect4, (s) => (s.winner === 'draw' ? null : s.winner === 1 ? s.red : s.yellow)],
    [dama, DEFAULT_SETTINGS.dama, (s) => (s.winner === 'draw' ? null : s[s.winner])],
    [kharbga, { level: 2 }, (s) => (s.winner === 'draw' ? null : s.winner === 1 ? s.attacker : s.defender)],
  ];
  for (const [mod, settings, winnerOf] of duels) {
    const { s, r } = botGame(mod, P2, settings);
    covers(r, P2);
    const w = winnerOf(s);
    if (w) expect(r.places).toEqual([[w], [P2.find((p) => p !== w)!]]);
    else expect(r.places.length).toBe(1);
  }
  // chess: resign, a draw, leaving
  const { ctx } = fakeCtx();
  const c: any = chess.start(ctx, P2, DEFAULT_SETTINGS.chess);
  expect(chess.result!(c)).toBeNull();
  chess.act(ctx, c, c.white, { type: 'resign' });
  expect(chess.result!(c)).toEqual({ places: [[c.black], [c.white]] });
  const d: any = chess.start(ctx, P2, DEFAULT_SETTINGS.chess);
  d.phase = 'final';
  d.winner = 'draw';
  expect(chess.result!(d)!.places.map((p) => p.sort())).toEqual([['a', 'b']]);
  const l: any = chess.start(ctx, P2, DEFAULT_SETTINGS.chess);
  chess.onLeave!(ctx, l, l.black);
  expect(chess.result!(l)).toEqual({ places: [[l.white], [l.black]] });
  // connect4 draw on a full board
  const c4: any = connect4.start(ctx, P2, DEFAULT_SETTINGS.connect4);
  c4.phase = 'final';
  c4.winner = 'draw';
  expect(connect4.result!(c4)!.places.length).toBe(1);
}, 60000); // bot-only games at the default «خبير» level

test('blocks: colours by score, the leaver left out', () => {
  for (const players of [P2, P3]) {
    const { s, r } = botGame(blocks, players, DEFAULT_SETTINGS.blocks, { steps: 50000 });
    covers(r, players);
    const sc = blocks.view({} as any, s, 'a') as any;
    rankedBy(r, (id) => sc.scores[s.seats.indexOf(id)].total);
    expect(r.places[0].sort()).toEqual([...s.winners!].sort());
  }
  const { ctx } = fakeCtx();
  const s: any = blocks.start(ctx, P3, DEFAULT_SETTINGS.blocks);
  blocks.onLeave!(ctx, s, 'a');
  blocks.onLeave!(ctx, s, 'b');
  expect(blocks.result!(s)).toEqual({ places: [['c']] });
});

test('boggle / codebreak: by total score; everyone leaving = no result', () => {
  for (const [mod, settings] of [
    [boggle, { ...DEFAULT_SETTINGS.boggle, rounds: 1 }],
    [codebreak, { ...DEFAULT_SETTINGS.codebreak, rounds: 2 }],
  ] as [GameModule<any, any>, any][]) {
    const { s, r } = botGame(mod, P3, settings);
    covers(r, P3);
    rankedBy(r, (id) => s.scores[id]);
    const { ctx } = fakeCtx();
    const g: any = mod.start(ctx, P2, settings);
    mod.onLeave!(ctx, g, 'a');
    mod.onLeave!(ctx, g, 'b');
    expect(g.phase).toBe('final');
    expect(mod.result!(g)).toBeNull();
  }
});

test('carca: by final score; the leavers are left out', () => {
  const { s, r } = botGame(carca, P3, { ...DEFAULT_SETTINGS.carca, level: 1 }, { steps: 5000 });
  covers(r, P3);
  rankedBy(r, (id) => s.scores[id]);
  expect(r.places[0].sort()).toEqual([...s.final!.winners].sort());
  const { ctx } = fakeCtx();
  const g: any = carca.start(ctx, P3, DEFAULT_SETTINGS.carca);
  carca.onLeave!(ctx, g, 'a');
  carca.onLeave!(ctx, g, 'b');
  expect(carca.result!(g)).toEqual({ places: [['c']] });
});

test('catan: the winner first, then the others by points', () => {
  const { s, r } = botGame(catan, P3, { ...DEFAULT_SETTINGS.catan, target: 8 }, { steps: 100000 });
  covers(r, P3);
  expect(r.places[0]).toEqual([s.final!.winner!]);
  rankedBy({ places: r.places.slice(1) }, (id) => s.final!.rows[id].total);
  const { ctx } = fakeCtx();
  const g: any = catan.start(ctx, P3, DEFAULT_SETTINGS.catan);
  catan.onLeave!(ctx, g, 'a');
  catan.onLeave!(ctx, g, 'b');
  expect(catan.result!(g)).toEqual({ places: [['c']] });
});

test('charades: the team with more points first, a tie shares first place, an early end gives no result', () => {
  function play(okFor: (team: number) => number) {
    const { ctx } = fakeCtx();
    const s: any = charades.start(ctx, P4, DEFAULT_SETTINGS.charades);
    charades.act(ctx, s, 'a', { type: 'begin' });
    while (s.phase !== 'final') {
      expect(charades.result!(s)).toBeNull();
      const team = s.teams[0].includes(s.actorId) ? 0 : 1;
      charades.act(ctx, s, s.actorId, { type: 'start' });
      ctx.now += COUNTDOWN_MS;
      charades.tick!(ctx, s);
      for (let i = 0; i < okFor(team); i++) charades.act(ctx, s, s.actorId, { type: 'ok', index: s.card.index });
      charades.act(ctx, s, 'a', { type: 'endTurn' });
      charades.act(ctx, s, 'a', { type: 'next' });
    }
    return s;
  }
  const s = play((t) => (t === 0 ? 3 : 1));
  const r = charades.result!(s)!;
  covers(r, P4);
  expect(r.places).toEqual([s.teams[0], s.teams[1]]);
  const tie = play(() => 2);
  expect(charades.result!(tie)!.places.length).toBe(1);
  covers(charades.result!(tie), P4);
  // a player leaves mid-game: fewer than 4 left, the game stops without a result
  const { ctx } = fakeCtx();
  const g: any = charades.start(ctx, P4, DEFAULT_SETTINGS.charades);
  charades.act(ctx, g, 'a', { type: 'begin' });
  charades.onLeave!(ctx, g, 'd');
  expect(g.phase).toBe('final');
  expect(charades.result!(g)).toBeNull();
});

test('codenames: the winning team first (also when the other team hits the assassin)', () => {
  // people only: a bot can only be a spymaster (at most one per team)
  const ctx = { ...fakeCtx().ctx, isBot: () => false };
  const s: any = codenames.start(ctx, P4, DEFAULT_SETTINGS.codenames);
  codenames.act(ctx, s, 'a', { type: 'begin' });
  expect(codenames.result!(s)).toBeNull();
  const team = s.turn;
  const guesser = s.teams[team].find((id: string) => id !== s.spymasters[team]);
  codenames.act(ctx, s, s.spymasters[team], { type: 'clue', word: 'تلميحغريب', n: 1 });
  codenames.act(ctx, s, guesser, { type: 'reveal', index: s.key.indexOf('assassin') });
  expect(s.phase).toBe('final');
  const other = team === 'red' ? 'blue' : 'red';
  const r = codenames.result!(s)!;
  covers(r, P4);
  expect(r.places).toEqual([s.teams[other], s.teams[team]]);
  // «again» goes back to the team screen: no result
  codenames.act(ctx, s, 'a', { type: 'again' });
  expect(codenames.result!(s)).toBeNull();
});

test('dots: by boxes, ties share, whoever resigned comes last', () => {
  for (const players of [P2, P3]) {
    const { s, r } = botGame(dots, players, DEFAULT_SETTINGS.dots);
    covers(r, players);
    rankedBy(r, (id) => s.points[id]);
    expect(r.places[0].sort()).toEqual([...s.winners!].sort());
  }
  const { ctx } = fakeCtx();
  const s: any = dots.start(ctx, P3, DEFAULT_SETTINGS.dots);
  dots.act(ctx, s, 'a', { type: 'resign' });
  dots.onLeave!(ctx, s, 'b');
  expect(dots.result!(s)!.places.map((p) => p.sort())).toEqual([['c'], ['a', 'b']]);
});

test('draw: by total score; all zero = one shared place; too few players = no result', () => {
  const { ctx } = fakeCtx();
  const s: any = draw.start(ctx, P3, { rounds: 1, seconds: 80 });
  let guessed = false;
  for (let k = 0; k < 1000 && s.phase !== 'final'; k++) {
    expect(draw.result!(s)).toBeNull();
    if (s.phase === 'draw' && !guessed) {
      // the first guesser finds the first word
      const g = s.order.find((id: string) => id !== s.order[s.turn]);
      draw.act(ctx, s, g, { type: 'guess', text: s.word });
      guessed = true;
    }
    ctx.now += 5000;
    draw.tick!(ctx, s);
  }
  const r = draw.result!(s)!;
  covers(r, P3);
  rankedBy(r, (id) => s.scores[id]);
  expect(r.places.length).toBeGreaterThan(1);
  const t: any = draw.start(ctx, P3, { rounds: 1, seconds: 80 });
  for (let k = 0; k < 1000 && t.phase !== 'final'; k++) {
    ctx.now += 5000;
    draw.tick!(ctx, t);
  }
  expect(draw.result!(t)!.places).toEqual([t.order]);
  const e: any = draw.start(ctx, P3, { rounds: 1, seconds: 80 });
  draw.onLeave!(ctx, e, 'a');
  draw.onLeave!(ctx, e, 'b');
  expect(e.phase).toBe('final');
  expect(draw.result!(e)).toBeNull();
});

test('estate: the winner, the others still standing by worth, then the bankrupt', () => {
  const { s, r } = botGame(estate, P3, { ...DEFAULT_SETTINGS.estate, rounds: 8 }, { steps: 100000 });
  covers(r, P3);
  expect(r.places[0]).toEqual([s.winner!]);
  const broke = s.players.filter((p: any) => p.bankrupt).map((p: any) => p.id);
  if (broke.length) expect(r.places[r.places.length - 1].sort()).toEqual(broke.sort());
  const standing = r.places.slice(1).filter((p) => !broke.includes(p[0]));
  rankedBy({ places: standing }, (id) => worthOf(s, id));
  const { ctx } = fakeCtx();
  const g: any = estate.start(ctx, P3, DEFAULT_SETTINGS.estate);
  estate.onLeave!(ctx, g, 'a');
  estate.onLeave!(ctx, g, 'b');
  expect(estate.result!(g)!.places.map((p) => p.sort())).toEqual([['c'], ['a', 'b']]);
});

test('hajj / ladders: the finishing order, one player per place', () => {
  for (const [mod, settings, order] of [
    [hajj, DEFAULT_SETTINGS.hajj, hajjOrder],
    [ladders, DEFAULT_SETTINGS.ladders, laddersOrder],
  ] as [GameModule<any, any>, any, (s: any) => string[]][]) {
    const { s, r } = botGame(mod, P4, settings, { steps: 50000 });
    covers(r, P4);
    expect(r.places[0]).toEqual([s.winner]);
    expect(r.places.flat()).toEqual(order(s));
  }
});

test('headsup: by words guessed', () => {
  const { ctx } = fakeCtx();
  const s: any = headsup.start(ctx, P3, DEFAULT_SETTINGS.headsup);
  const got: Record<string, number> = { a: 2, b: 0, c: 2 };
  while (s.phase !== 'final') {
    expect(headsup.result!(s)).toBeNull();
    const g = s.turnOrder[s.turn];
    headsup.act(ctx, s, g, { type: 'start' });
    ctx.now += 4000;
    headsup.tick!(ctx, s);
    for (let i = 0; i < got[g]; i++) headsup.act(ctx, s, 'a', { type: 'mark', index: s.card.index, ok: true });
    headsup.act(ctx, s, 'a', { type: 'mark', index: s.card.index, ok: false });
    headsup.act(ctx, s, 'a', { type: 'endTurn' });
    headsup.act(ctx, s, 'a', { type: 'next' });
  }
  const r = headsup.result!(s)!;
  expect(r.places.map((p) => p.sort())).toEqual([['a', 'c'], ['b']]);
});

test('huroof: the team that joined its sides first', () => {
  const { s, r } = botGame(huroof, P4, DEFAULT_SETTINGS.huroof, { dt: 5000 });
  covers(r, P4);
  expect(r.places).toEqual([s.teams[s.winner!], s.teams[s.winner === 'red' ? 'green' : 'red']]);
});

test('imposter: by total points', () => {
  const nudge = (ctx: any, s: any) => {
    for (const type of ['skipReady', 'toVote', 'forceResolve', 'next']) {
      if (isOver(s)) return;
      imposter.act(ctx, s, 'a', { type });
    }
  };
  const { s, r } = botGame(imposter, P4, { ...DEFAULT_SETTINGS.imposter, rounds: 3 }, { nudge });
  covers(r, P4);
  rankedBy(r, (id) => s.scores[id]);
});

test('kanza: players or 2v2 teams by points; someone leaving = no result', () => {
  const nudge = (ctx: any, s: any) => kanza.act(ctx, s, 'a', { type: 'next' });
  const { s, r } = botGame(kanza, P2, { hands: 2 }, { nudge });
  covers(r, P2);
  rankedBy(r, (id) => s.scores[s.sides.find((x: any) => x.members.includes(id))!.key]);
  const t = botGame(kanza, P4, { hands: 1 }, { nudge });
  covers(t.r, P4);
  for (const side of t.s.sides) expect(t.r.places.some((p) => side.members.every((m: string) => p.includes(m)))).toBe(true);
  rankedBy(t.r, (id) => t.s.scores[t.s.sides.find((x: any) => x.members.includes(id))!.key]);
  const { ctx } = fakeCtx();
  const g: any = kanza.start(ctx, P2, { hands: 2 });
  kanza.onLeave!(ctx, g, 'a');
  expect(g.phase).toBe('final');
  expect(kanza.result!(g)).toBeNull();
});

test('kdab: the first with an empty hand, then by cards left', () => {
  const { s, r } = botGame(kdab, P3, DEFAULT_SETTINGS.kdab, { steps: 50000 });
  covers(r, P3);
  expect(r.places[0]).toEqual([s.winner!]);
  rankedBy({ places: r.places.slice(1) }, (id) => s.hands[id].length, true);
});

test('konkan: the winner, then the others by points (fewer is better)', () => {
  const nudge = (ctx: any, s: any) => konkan.act(ctx, s, 'a', { type: 'next' });
  // no workaround needed: a hand ends with no winner after the discards went back into the stock twice
  const { s, r } = botGame(konkan, P3, { limit: 50 }, { steps: 100000, nudge });
  covers(r, P3);
  expect(r.places[0]).toEqual([s.winner!]);
  rankedBy({ places: r.places.slice(1) }, (id) => s.scores[id], true);
  // a player who left is not ranked
  const { ctx } = fakeCtx();
  const g: any = konkan.start(ctx, P3, { limit: 50 });
  konkan.onLeave!(ctx, g, 'a');
  konkan.onLeave!(ctx, g, 'b');
  expect(konkan.result!(g)).toEqual({ places: [['c']] });
});
