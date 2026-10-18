/**
 * Tournaments («البطولات»): league points, knockout brackets, the room flow, the group's honour board.
 *   bun test server/tournament.test.ts
 */
import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_SETTINGS, type GameId, type GroupInfo, type PlayerInfo, type RoomAction, type ServerMsg, type XoView } from '../src/shared/protocol';
import {
  awardPoints,
  cleanConfig,
  knockoutDuels,
  leagueChampions,
  makeBracket,
  nextMatch,
  problemText,
  randomGames,
  roundName,
  seedOrder,
  sortStandings,
  tournamentProblem,
  type BracketMatch,
  type TournamentConfig,
  type TournamentView,
} from '../src/shared/tournament';
import { Store } from './db';
import { quiz } from './games/quiz';
import { surah } from './games/surah';
import { trivia } from './games/trivia';
import type { McqState } from './games/mcq';
import { xo } from './games/xo';
import { GroupHub } from './groups';
import { Room, type Sock } from './room';
import { buildHonor, Tournament } from './tournament';
import type { GameCtx, GameModule } from './types';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'fg-tournament-'));
  dirs.push(d);
  return d;
};

class FakeSock {
  data: { player: PlayerInfo | null; code: string | null } = { player: null, code: null };
  msgs: ServerMsg[] = [];
  send(raw: string) {
    this.msgs.push(JSON.parse(raw));
  }
  close() {}
}

const person = (id: string, name = id): PlayerInfo => ({ id, name, avatar: 'cat', color: '#E2475F' });

function fakeCtx(): GameCtx {
  return { now: 1000, fx() {}, say() {}, isConnected: () => true, isBot: () => false, playerName: (id) => id, memo: new Map(), bot() {} };
}

/** A room with people (the first is the host) and bots. */
function makeRoom(ids: string[], bots = 0, game: GameId = 'quiz') {
  const r = new Room('4242', person(ids[0]), game);
  const socks = new Map<string, FakeSock>();
  for (const id of ids) {
    const s = new FakeSock();
    socks.set(id, s);
    r.join(person(id), s as unknown as Sock);
  }
  for (let i = 0; i < bots; i++) r.roomAction(ids[0], { type: 'addBot' });
  const host = ids[0];
  const act = (a: RoomAction, by = host) => r.roomAction(by, a);
  const view = (id = host): TournamentView => r.viewFor(id).tournament!;
  return { r, socks, act, view, host, bots: r.players.filter((p) => p.bot).map((p) => p.id) };
}

/** End the room's multiple-choice game now with these scores. */
function finishMcq(r: Room, scores: Record<string, number>) {
  const s = r.state as McqState<unknown>;
  for (const id of s.participants) s.scores[id] = scores[id] ?? 0;
  s.phase = 'reveal';
  s.round = s.items.length;
  s.endsAt = 0;
  r.tick();
}

/** Play X/O in the room: the first player of the pair wins along the top row (or a draw). */
function playXo(r: Room, winner: string | 'draw') {
  const s = r.state as { x: string; o: string; size: number };
  if (winner === 'draw') {
    // X O X / X O O / O X X
    const order = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    order.forEach((cell, i) => r.gameAction(i % 2 === 0 ? s.x : s.o, { type: 'mark', cell }));
    return;
  }
  const w = winner === s.x ? s.x : s.o;
  const l = winner === s.x ? s.o : s.x;
  // the winner takes 0,1,2; the loser 3,4 (and 5 when the loser starts)
  const moves: [string, number][] = w === s.x ? [[w, 0], [l, 3], [w, 1], [l, 4], [w, 2]] : [[l, 3], [w, 0], [l, 4], [w, 1], [l, 8], [w, 2]];
  for (const [by, cell] of moves) r.gameAction(by, { type: 'mark', cell });
}

/* ------------------------------------------------------------------ */
/* result() of X/O and the multiple-choice games                       */
/* ------------------------------------------------------------------ */

test('xo result: winner first, a draw shares the place, null while playing', () => {
  const ctx = fakeCtx();
  const s = xo.start(ctx, ['a', 'b'], DEFAULT_SETTINGS.xo);
  expect(xo.result!(s)).toBeNull();
  const w = s.x;
  const l = s.o;
  for (const [by, cell] of [[w, 0], [l, 3], [w, 1], [l, 4], [w, 2]] as const) xo.act(ctx, s, by, { type: 'mark', cell });
  expect(xo.result!(s)).toEqual({ places: [[w], [l]] });

  const d = xo.start(ctx, ['a', 'b'], DEFAULT_SETTINGS.xo);
  [0, 1, 2, 4, 3, 5, 7, 6, 8].forEach((cell, i) => xo.act(ctx, d, i % 2 === 0 ? d.x : d.o, { type: 'mark', cell }));
  expect(d.winner).toBe('draw');
  expect(xo.result!(d)).toEqual({ places: [[d.x, d.o]] });

  // someone leaving mid-game hands the other the win
  const g = xo.start(ctx, ['a', 'b'], DEFAULT_SETTINGS.xo);
  xo.onLeave!(ctx, g, g.x);
  expect(xo.result!(g)).toEqual({ places: [[g.o], [g.x]] });
});

test('quiz / surah / trivia result: ranked by score, equal scores share a place, null before the end', () => {
  for (const mod of [quiz, surah, trivia] as unknown as GameModule<McqState<unknown>, never>[]) {
    const ctx = fakeCtx();
    const settings = { ...DEFAULT_SETTINGS[mod.id], rounds: 5 } as never;
    const s = mod.start(ctx, ['a', 'b', 'c', 'd'], settings);
    expect(mod.result!(s)).toBeNull();
    s.scores = { a: 900, b: 1500, c: 900, d: 0 };
    s.phase = 'reveal';
    s.round = s.items.length;
    s.endsAt = 0;
    mod.tick!({ ...ctx, now: 5000 }, s);
    expect(s.phase as string).toBe('final');
    expect(mod.result!(s)).toEqual({ places: [['b'], ['a', 'c'], ['d']] });
  }
});

/* ------------------------------------------------------------------ */
/* League points                                                       */
/* ------------------------------------------------------------------ */

test('league points: 5/3/2/1 then 1, ties share the place, bots removed and places closed up', () => {
  const bots = new Set(['bot1', 'bot2']);
  const { places, awarded } = awardPoints({ places: [['bot1'], ['a'], ['b', 'c'], ['bot2'], ['d'], ['e'], ['f']] }, (id) => !bots.has(id));
  expect(places).toEqual([['a'], ['b', 'c'], ['d'], ['e'], ['f']]);
  expect(awarded).toEqual({ a: 5, b: 3, c: 3, d: 2, e: 1, f: 1 });
  // a place with only bots disappears; a custom table
  expect(awardPoints({ places: [['bot1', 'bot2'], ['a', 'b']] }, (id) => !bots.has(id), [10, 4]).awarded).toEqual({ a: 10, b: 10 });
});

test('league points: a co-op game gives everyone 3 if the family won, 1 if it lost (bots nothing)', () => {
  const isPerson = (id: string) => !id.startsWith('bot');
  expect(awardPoints({ places: [['a', 'b', 'bot1']], coop: { won: true } }, isPerson).awarded).toEqual({ a: 3, b: 3 });
  expect(awardPoints({ places: [['a', 'b', 'bot1']], coop: { won: false } }, isPerson).awarded).toEqual({ a: 1, b: 1 });
});

test('standings order and the champion: points, then first places, then a shared title', () => {
  const rows = [
    { id: 'a', points: 12, wins: 1, played: 3 },
    { id: 'b', points: 12, wins: 2, played: 3 },
    { id: 'c', points: 9, wins: 0, played: 3 },
  ];
  expect(sortStandings(rows).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  expect(leagueChampions(rows)).toEqual(['b']);
  expect(leagueChampions([{ id: 'a', points: 10, wins: 1, played: 3 }, { id: 'b', points: 10, wins: 1, played: 3 }, { id: 'c', points: 2, wins: 1, played: 3 }]).sort()).toEqual(['a', 'b']);
});

test('league in a room: points per game, bots seated but never ranked, standings between games, champion', () => {
  const { r, act, view, bots } = makeRoom(['mama', 'baba', 'sara'], 1);
  act({ type: 'tournament', config: { format: 'league', games: ['quiz', 'trivia', 'surah'], points: [5, 3, 2, 1] } });
  expect(view().stage).toBe('setup');
  act({ type: 'tournamentStart' });
  expect(r.status).toBe('playing');
  expect(r.game).toBe('quiz');
  expect(view().stage).toBe('playing');
  expect((r.state as McqState<unknown>).participants).toContain(bots[0]); // the bot fills a seat
  expect(view().standings.map((s) => s.id).sort()).toEqual(['baba', 'mama', 'sara']); // …but isn't ranked

  // game 1: the bot comes first, sara and baba tie
  finishMcq(r, { [bots[0]]: 3000, sara: 2000, baba: 2000, mama: 500 });
  let v = view();
  expect(v.done).toBe(true);
  expect(v.last!.places).toEqual([['baba', 'sara'], ['mama']]);
  expect(v.last!.awarded).toEqual({ sara: 5, baba: 5, mama: 3 });
  expect(r.status).toBe('playing'); // the game's own final screen stays

  act({ type: 'tournamentNext' });
  v = view();
  expect(r.status).toBe('lobby');
  expect(v.stage).toBe('standings');
  expect(v.index).toBe(1);
  expect(v.game).toBe('trivia');
  expect(r.game).toBe('trivia');

  // game 2
  act({ type: 'tournamentPlay' });
  expect(r.game).toBe('trivia');
  finishMcq(r, { mama: 2500, baba: 1000, sara: 0, [bots[0]]: 0 });
  // a later change doesn't count twice
  r.tick();
  act({ type: 'tournamentNext' });
  // game 3
  act({ type: 'tournamentPlay' });
  finishMcq(r, { mama: 2000, baba: 2100, sara: 100, [bots[0]]: 5000 });
  act({ type: 'tournamentNext' });
  v = view();
  expect(v.stage).toBe('final');
  expect(r.status).toBe('lobby');
  const pts = Object.fromEntries(v.standings.map((s) => [s.id, s.points]));
  expect(pts).toEqual({ baba: 5 + 3 + 5, mama: 3 + 5 + 3, sara: 5 + 2 + 2 });
  expect(v.standings[0].id).toBe('baba');
  expect(v.champion).toEqual(['baba']);
  expect(v.standings.find((s) => s.id === 'mama')!.played).toBe(3);
  // «بطولة جديدة»: back to the set-up with the same games
  act({ type: 'tournamentAgain' });
  expect(view().stage).toBe('setup');
  expect((view().config as { games: string[] }).games).toEqual(['quiz', 'trivia', 'surah']);
});

test('league: a game that ends without a result awards nothing; it can be replayed or skipped', () => {
  const { r, act, view } = makeRoom(['mama', 'baba']);
  act({ type: 'tournament', config: { format: 'league', games: ['quiz', 'quiz', 'trivia'], points: [5, 3, 2, 1] } });
  act({ type: 'tournamentStart' });
  // the host replays the first game: still game 1, a fresh state
  const first = r.state;
  act({ type: 'tournamentReplay' });
  expect(r.state).not.toBe(first);
  expect(view().index).toBe(0);
  // moving on without a result: nothing awarded
  act({ type: 'tournamentNext' });
  let v = view();
  expect(v.last).toMatchObject({ index: 0, none: 'aborted', awarded: {} });
  expect(v.standings.every((s) => s.points === 0 && s.played === 0)).toBe(true);
  // skip the second game from the standings
  act({ type: 'tournamentSkip' });
  v = view();
  expect(v.stage).toBe('standings');
  expect(v.index).toBe(2);
  expect(v.last).toMatchObject({ index: 1, none: 'skipped' });
  act({ type: 'tournamentPlay' });
  finishMcq(r, { mama: 10, baba: 5 });
  act({ type: 'tournamentNext' });
  v = view();
  expect(v.stage).toBe('final');
  expect(v.champion).toEqual(['mama']);
});

test('league: a game without result() is played for fun and the host can still go on', () => {
  const t = new Tournament({ format: 'league', games: ['names', 'quiz', 'quiz'], points: [5, 3, 2, 1] });
  t.begin([person('a'), person('b')], 1);
  t.started([person('a'), person('b')], false);
  expect(t.view().ranked).toBe(false);
  t.next(2);
  expect(t.view().last).toMatchObject({ none: 'unranked', gameId: 'names' });
  expect(t.stage).toBe('standings');
});

test('league: a late arrival is ranked from their first game; the start and the game buttons are refused meanwhile', () => {
  const { r, act, view } = makeRoom(['mama', 'baba']);
  act({ type: 'tournament', config: { format: 'league', games: ['quiz', 'quiz', 'quiz'], points: [5, 3, 2, 1] } });
  act({ type: 'tournamentStart' });
  finishMcq(r, { mama: 10, baba: 5 });
  act({ type: 'tournamentNext' });
  r.join(person('sara'), new FakeSock() as unknown as Sock);
  expect(() => act({ type: 'start' })).toThrow('البطولة جارية');
  act({ type: 'game', game: 'xo' });
  expect(r.game).toBe('quiz');
  act({ type: 'tournamentPlay' });
  expect(view().standings.map((s) => s.id).sort()).toEqual(['baba', 'mama', 'sara']);
  finishMcq(r, { sara: 10, mama: 5, baba: 1 });
  expect(view().last!.awarded).toEqual({ sara: 5, mama: 3, baba: 2 });
});

test('«إنهاء البطولة»: going back to the waiting room ends the tournament', () => {
  const { r, act, view } = makeRoom(['mama', 'baba']);
  act({ type: 'tournament', config: { format: 'league', games: ['quiz', 'quiz', 'quiz'], points: [5, 3, 2, 1] } });
  act({ type: 'tournamentStart' });
  act({ type: 'lobby' });
  expect(r.status).toBe('lobby');
  expect(r.tournament).toBeNull();
  expect(r.viewFor('mama').tournament).toBeNull();
  // a set-up survives the lobby button; tournamentCancel goes back to a single game
  act({ type: 'tournament', config: { format: 'league', games: ['quiz'], points: [5] } });
  act({ type: 'lobby' });
  expect(view().stage).toBe('setup');
  act({ type: 'tournamentCancel' });
  expect(r.tournament).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Knockout                                                            */
/* ------------------------------------------------------------------ */

function checkBracket(n: number) {
  const seeds = Array.from({ length: n }, (_, i) => `s${i + 1}`);
  const rounds = makeBracket(seeds);
  const size = 2 ** rounds.length;
  expect(size).toBeGreaterThanOrEqual(n);
  expect(size / 2).toBeLessThan(n);
  const first = rounds[0];
  // everyone exactly once in the first round; byes go through at once; never two byes together
  expect(first.flatMap((m) => [m.a, m.b]).filter(Boolean).sort()).toEqual([...seeds].sort());
  const byes = first.filter((m) => m.bye);
  expect(byes.length).toBe(size - n);
  for (const m of byes) expect(m.winner).toBe(m.a);
  expect(first.every((m) => m.a)).toBe(true);
  // the top seeds get the byes
  expect(byes.map((m) => m.a).sort()).toEqual(seeds.slice(0, size - n).sort());
  // play it out: n − 1 duels, one champion
  let duels = 0;
  for (let at = nextMatch(rounds); at; at = nextMatch(rounds)) {
    const m = rounds[at.round][at.slot];
    m.winner = m.b!; // the lower seed always wins
    duels++;
    for (let r = 0; r + 1 < rounds.length; r++) rounds[r].forEach((x, i) => (i % 2 ? (rounds[r + 1][i >> 1].b = x.winner) : (rounds[r + 1][i >> 1].a = x.winner)));
  }
  expect(duels).toBe(knockoutDuels(n));
  expect(rounds[rounds.length - 1][0].winner).toBeTruthy();
  return rounds;
}

test('knockout bracket: byes for 3, 5 and 6 players (and the round names)', () => {
  expect(seedOrder(4)).toEqual([0, 3, 1, 2]);
  expect(seedOrder(8)).toEqual([0, 7, 3, 4, 1, 6, 2, 5]);
  const three = checkBracket(3);
  expect(three.length).toBe(2);
  const five = checkBracket(5);
  expect(five[0].filter((m) => !m.bye).length).toBe(1);
  const six = checkBracket(6);
  expect(six[0].filter((m) => !m.bye).length).toBe(2);
  for (const n of [2, 4, 7, 8, 9, 16]) checkBracket(n);
  // 3 players: seed 1 waits in the final for the winner of 2 v 3
  const b3 = makeBracket(['a', 'b', 'c']);
  expect(b3[0]).toEqual([{ a: 'a', b: null, winner: 'a', bye: true }, { a: 'b', b: 'c', winner: null }]);
  expect(b3[1][0]).toMatchObject({ a: 'a', b: null });
  expect(roundName(1, 2)).toBe('النهائي');
  expect(roundName(0, 2)).toBe('نصف النهائي');
  expect(roundName(0, 3)).toBe('ربع النهائي');
});

test('knockout: a draw is replayed twice, then the higher seed goes on (and everyone is told)', () => {
  const t = new Tournament({ format: 'knockout', game: 'xo' });
  t.begin([person('a'), person('b')], 1, (l) => [...l]); // seeds in order: a is seed 1
  for (let i = 1; i <= 2; i++) {
    t.started([person('a'), person('b')], true);
    t.record({ places: [['a', 'b']] }, () => true);
    expect(t.view().last).toMatchObject({ draw: 'replay', winner: null });
    expect(t.view().match).toMatchObject({ a: 'a', b: 'b', draws: i });
    t.next(2);
    expect(t.stage).toBe('standings');
    expect(t.upcoming()).toEqual({ game: 'xo', participants: ['a', 'b'] });
  }
  t.started([person('a'), person('b')], true);
  t.record({ places: [['b', 'a']] }, () => true);
  expect(t.view().last).toMatchObject({ draw: 'seed', winner: 'a' });
  expect((t.view().bracket!.rounds[0][0] as BracketMatch).by).toBe('seed');
  t.next(3);
  expect(t.stage).toBe('final');
  expect(t.champion).toEqual(['a']);
});

test('knockout in a room: only the two players play, the others watch; byes, rounds and the champion', () => {
  const { r, act, view } = makeRoom(['mama', 'baba', 'sara'], 1, 'xo');
  act({ type: 'tournament', config: { format: 'knockout', game: 'xo' } });
  act({ type: 'tournamentStart' });
  let v = view();
  expect(v.bracket!.rounds.length).toBe(2);
  expect(v.total).toBe(2);
  const seeds = r.tournament!.seeds;
  expect([...seeds].sort()).toEqual(['baba', 'mama', 'sara']); // the bot is never bracketed
  const top = r.tournament!.seeds[0];
  expect(v.bracket!.rounds[0][0]).toMatchObject({ a: top, bye: true, winner: top });
  // the first duel: the two others; the top seed watches
  const duo = [v.match!.a, v.match!.b];
  expect(duo).not.toContain(top);
  const s = r.state as { x: string; o: string; board: string[] };
  expect([s.x, s.o].sort()).toEqual([...duo].sort());
  r.gameAction(top, { type: 'mark', cell: 4 });
  expect(s.board.every((c) => !c)).toBe(true); // a spectator can't play
  expect((r.viewFor(top).view as XoView).mine).toBeNull();

  // a draw: replayed
  playXo(r, 'draw');
  expect(view().last).toMatchObject({ draw: 'replay' });
  act({ type: 'tournamentNext' });
  expect(view().stage).toBe('standings');
  act({ type: 'tournamentPlay' });
  playXo(r, duo[1]);
  v = view();
  expect(v.last).toMatchObject({ winner: duo[1] });
  act({ type: 'tournamentNext' });
  v = view();
  expect(v.stage).toBe('standings');
  expect(v.match).toMatchObject({ round: 1, a: top, b: duo[1] });
  act({ type: 'tournamentPlay' });
  playXo(r, top);
  act({ type: 'tournamentNext' });
  v = view();
  expect(v.stage).toBe('final');
  expect(v.champion).toEqual([top]);
  // all-time points: champion 5, finalist 3, out in the semi-final 2
  expect(Object.fromEntries(v.standings.map((x) => [x.id, x.points]))).toEqual({ [top]: 5, [duo[1]]: 3, [duo[0]]: 2 });
});

test('knockout: someone who left the room loses the duel before it starts', () => {
  const { r, act, view } = makeRoom(['mama', 'baba', 'sara', 'omar'], 0, 'xo');
  act({ type: 'tournament', config: { format: 'knockout', game: 'xo' } });
  act({ type: 'tournamentStart' });
  const first = view().match!;
  playXo(r, first.a);
  act({ type: 'tournamentNext' });
  const second = view().match!;
  // (not the host, who has the buttons)
  const gone = second.b === 'mama' ? second.a : second.b;
  const stays = gone === second.a ? second.b : second.a;
  r.leave(gone);
  act({ type: 'tournamentPlay' });
  const b = view().bracket!.rounds[0][second.slot];
  expect(b).toMatchObject({ winner: stays, by: 'forfeit' });
  // straight on to the final
  expect(view().match).toMatchObject({ round: 1 });
  expect(r.status).toBe('playing');
});

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

test('validation: Arabic errors for the list, seats, bots and duel games', () => {
  const name = (_: string, i: number) => `اللعبة ${i + 1}`;
  const say = (c: TournamentConfig, people: number, bots: number) => {
    const p = tournamentProblem(c, people, bots);
    return p ? problemText(p, name) : null;
  };
  expect(say({ format: 'league', games: ['quiz', 'quiz'], points: [5] }, 3, 0)).toBe('اختر من 3 إلى 10 ألعاب للدوري');
  expect(say({ format: 'league', games: ['quiz', 'werewolf', 'quiz'], points: [5] }, 3, 0)).toBe('اللعبة 2 تحتاج 5 لاعبين على الأقل');
  // bots fill seats only in games that take bots
  expect(say({ format: 'league', games: ['quiz', 'imposter', 'quiz'], points: [5] }, 2, 1)).toBeNull();
  expect(say({ format: 'league', games: ['quiz', 'taboo', 'quiz'], points: [5] }, 2, 3)).toBe('اللعبة 2 تحتاج 4 لاعبين على الأقل');
  expect(say({ format: 'league', games: ['quiz', 'quiz', 'xo'], points: [5] }, 3, 0)).toBe('اللعبة 3 لـ 2 لاعبين على الأكثر');
  expect(say({ format: 'knockout', game: 'werewolf' }, 4, 0)).toBe('اختر لعبة تُلعب بين اثنين');
  expect(say({ format: 'knockout', game: 'xo' }, 1, 3)).toContain('البوتات لا تدخل الجدول');
  expect(say({ format: 'knockout', game: 'xo' }, 17, 0)).toBe('خروج المغلوب لـ 16 شخصاً على الأكثر');
  expect(say({ format: 'knockout', game: 'xo', perRound: ['chess', 'taboo'] }, 4, 0)).toBe('لعبة الدور 2 لا تُلعب بين اثنين');

  // the room refuses with the same words, and only the host may set it up
  const { r, act } = makeRoom(['mama', 'baba', 'sara']);
  act({ type: 'tournament', config: { format: 'league', games: ['xo'], points: [5] } }, 'baba');
  expect(r.tournament).toBeNull();
  act({ type: 'tournament', config: { format: 'league', games: ['quiz', 'xo', 'quiz'], points: [5, 3] } });
  expect(() => act({ type: 'tournamentStart' })).toThrow('اللعبة 2 لـ 2 لاعبين على الأكثر');
  expect(r.status).toBe('lobby');
  act({ type: 'tournament', config: { format: 'league', games: ['quiz', 'quiz'], points: [5, 3] } });
  expect(() => act({ type: 'start' })).toThrow('اختر من 3 إلى 10 ألعاب للدوري');
});

test('cleanConfig and the random pick', () => {
  expect(cleanConfig({ format: 'league', games: ['quiz', 'nope', 'xo'], points: [9, -2, 'x'] })).toEqual({ format: 'league', games: ['quiz', 'xo'], points: [9, 0] });
  expect(cleanConfig({ format: 'league', games: Array(14).fill('quiz') })).toMatchObject({ points: [5, 3, 2, 1] });
  expect((cleanConfig({ format: 'league', games: Array(14).fill('quiz') }) as { games: string[] }).games.length).toBe(10);
  expect(cleanConfig({ format: 'knockout', game: 'werewolf' })).toEqual({ format: 'knockout', game: 'xo' });
  expect(cleanConfig({ format: 'knockout', game: 'chess', perRound: ['xo', 'taboo', 'dama'] })).toEqual({ format: 'knockout', game: 'chess', perRound: ['xo', 'dama'] });
  expect(cleanConfig('league')).toBeNull();
  // 3 people, no bots: 5 different games all playable with 3
  const picked = randomGames(5, 3, 0);
  expect(new Set(picked).size).toBe(5);
  expect(tournamentProblem({ format: 'league', games: picked, points: [5] }, 3, 0)).toBeNull();
  expect(picked).not.toContain('xo');
});

/* ------------------------------------------------------------------ */
/* Group history and the honour board                                  */
/* ------------------------------------------------------------------ */

test('a tournament in a group room is kept and shows on the group honour board', () => {
  const store = Store.open(tempDir());
  const rooms = new Map<string, Room>();
  const hub = new GroupHub({
    store,
    rooms,
    createRoom: (host, game) => {
      const r = new Room('5151', host, game);
      rooms.set(r.code, r);
      return r;
    },
    fetch: async () => Response.json({ data: [] }),
    log: { log() {}, warn() {}, error() {} },
    presenceDelayMs: 5,
  });
  const mama = person('p-mama', 'ماما');
  const baba = person('p-baba', 'بابا');
  const s1 = new FakeSock();
  const s2 = new FakeSock();
  hub.hello(s1 as unknown as Sock, mama);
  hub.hello(s2 as unknown as Sock, baba);
  hub.handle(s1 as unknown as Sock, mama, { t: 'group', a: 'create', name: 'العائلة' });
  const g = (s1.msgs.find((m) => m.t === 'group') as { group: GroupInfo }).group;
  expect(g.honor).toEqual({ tournaments: 0, titles: [], champions: [], points: [], people: [] });
  hub.handle(s2 as unknown as Sock, baba, { t: 'group', a: 'join', code: g.code });
  hub.handle(s1 as unknown as Sock, mama, { t: 'group', a: 'play', id: g.id });
  hub.handle(s2 as unknown as Sock, baba, { t: 'group', a: 'play', id: g.id });
  const r = rooms.get('5151')!;
  expect(r.group?.waiting).toBe(false);
  r.roomAction(mama.id, { type: 'game', game: 'quiz' });

  // a tournament left half-way isn't kept
  r.roomAction(mama.id, { type: 'tournament', config: { format: 'league', games: ['quiz', 'quiz', 'quiz'], points: [5, 3, 2, 1] } });
  r.roomAction(mama.id, { type: 'tournamentStart' });
  finishMcq(r, { [mama.id]: 10, [baba.id]: 5 });
  r.roomAction(mama.id, { type: 'lobby' });
  expect(store.tournaments(g.id)).toEqual([]);

  // a full league, then a knockout
  r.roomAction(mama.id, { type: 'tournament', config: { format: 'league', games: ['quiz', 'trivia', 'quiz'], points: [5, 3, 2, 1] } });
  r.roomAction(mama.id, { type: 'tournamentStart' });
  for (let i = 0; i < 3; i++) {
    if (i) r.roomAction(mama.id, { type: 'tournamentPlay' });
    finishMcq(r, { [mama.id]: i === 2 ? 1 : 10, [baba.id]: 5 });
    r.roomAction(mama.id, { type: 'tournamentNext' });
  }
  expect(r.tournament!.stage).toBe('final');
  let saved = store.tournaments(g.id);
  expect(saved.length).toBe(1);
  expect(saved[0]).toMatchObject({ format: 'league', games: ['quiz', 'trivia', 'quiz'], champions: [{ id: mama.id, name: 'ماما' }] });
  expect(saved[0].standings.map((s) => [s.id, s.points])).toEqual([[mama.id, 13], [baba.id, 11]]);

  r.roomAction(mama.id, { type: 'tournament', config: { format: 'knockout', game: 'xo' } });
  r.roomAction(mama.id, { type: 'tournamentStart' });
  playXo(r, baba.id);
  r.roomAction(mama.id, { type: 'tournamentNext' });
  saved = store.tournaments(g.id);
  expect(saved.length).toBe(2);
  expect(saved[1]).toMatchObject({ format: 'knockout', games: ['xo'], champions: [{ id: baba.id }] });

  const honor = hub.groupsFor(mama.id)[0].honor!;
  expect(honor.tournaments).toBe(2);
  expect(honor.titles).toEqual([{ id: baba.id, count: 1 }, { id: mama.id, count: 1 }].sort((a, b) => a.id.localeCompare(b.id)));
  expect(honor.champions.map((c) => [c.format, c.champions])).toEqual([['knockout', [baba.id]], ['league', [mama.id]]]);
  expect(honor.points).toEqual([{ id: mama.id, total: 13 + 3 }, { id: baba.id, total: 11 + 5 }].sort((a, b) => b.total - a.total || a.id.localeCompare(b.id)));
  expect(honor.people.map((p) => p.name).sort()).toEqual(['بابا', 'ماما']);
  // and the members got a fresh group list
  expect(s2.msgs.some((m) => m.t === 'groups' && m.groups[0]?.honor?.tournaments === 2)).toBe(true);
});

test('honour board: titles and points add up, the last ten champions newest first, current names', () => {
  const rec = (i: number, champ: string) => ({
    format: 'league' as const,
    games: ['quiz' as const],
    standings: [
      { ...person('a', 'A-old'), points: 5, wins: 1, played: 1 },
      { ...person('b'), points: 3, wins: 0, played: 1 },
    ],
    champions: [person(champ, champ === 'a' ? 'A-old' : champ)],
    startedAt: i,
    endedAt: i + 1,
  });
  const records = Array.from({ length: 12 }, (_, i) => rec(i, i % 3 === 0 ? 'b' : 'a'));
  const h = buildHonor(records, [person('a', 'A-new')]);
  expect(h.tournaments).toBe(12);
  expect(h.titles).toEqual([{ id: 'a', count: 8 }, { id: 'b', count: 4 }]);
  expect(h.champions.length).toBe(10);
  expect(h.champions[0].at).toBe(12);
  expect(h.points).toEqual([{ id: 'a', total: 60 }, { id: 'b', total: 36 }]);
  expect(h.people.find((p) => p.id === 'a')!.name).toBe('A-new');
});
