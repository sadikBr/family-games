/** «تمثيل صامت»: content, teams, hidden word, scoring, a full game and leaving players. */
import { expect, test } from 'bun:test';

import { CHARADES_CATEGORIES, CHARADES_DEFAULTS, CHARADES_FREE_SKIPS, type CharadesSettings, type CharadesView } from '../src/shared/games/charades';
import { CHARADES_ALL, CHARADES_WORDS } from './charades-content';
import { COUNTDOWN_MS, charades, charadesPool } from './games/charades';
import { GameError } from './types';

const fakeCtx = (offline: string[] = []): any => {
  const fxs: { kind: string; target?: string }[] = [];
  return {
    now: 1_000_000,
    fxs,
    fx: (kind: string, target?: string) => fxs.push({ kind, target }),
    isConnected: (id: string) => !offline.includes(id),
    isBot: () => false,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: () => {},
  };
};

const settings = (o: Partial<CharadesSettings> = {}): CharadesSettings => ({ ...CHARADES_DEFAULTS, ...o });
const PLAYERS = ['a', 'b', 'c', 'd', 'e', 'f'];

function startGame(ctx: any, players = PLAYERS, o: Partial<CharadesSettings> = {}) {
  const s: any = charades.start(ctx, players, settings(o));
  charades.act(ctx, s, 'a', { type: 'begin' });
  return s;
}

/** ready → countdown → play */
function startTurn(ctx: any, s: any) {
  charades.act(ctx, s, s.actorId, { type: 'start' });
  expect(s.phase).toBe('countdown');
  ctx.now += COUNTDOWN_MS;
  charades.tick!(ctx, s);
  expect(s.phase).toBe('play');
}

const v = (ctx: any, s: any, me: string) => charades.view(ctx, s, me) as CharadesView;

test('charades content: 300+ unique words, every category has easy, medium and hard', () => {
  expect(CHARADES_ALL.length).toBeGreaterThanOrEqual(300);
  expect(new Set(CHARADES_ALL.map((w) => w.word)).size).toBe(CHARADES_ALL.length);
  for (const c of CHARADES_CATEGORIES) {
    const l = CHARADES_WORDS[c.key];
    expect(l.easy.length).toBeGreaterThanOrEqual(8);
    expect(l.medium.length).toBeGreaterThanOrEqual(8);
    expect(l.hard.length).toBeGreaterThanOrEqual(8);
  }
  expect(charadesPool(settings({ category: 'animals', level: 'hard' })).every((w) => w.cat === 'animals' && w.level === 3)).toBe(true);
  expect(charadesPool(settings({ category: 'mixed', level: 'easy' })).every((w) => w.level === 1)).toBe(true);
  expect(charadesPool(settings()).length).toBe(CHARADES_ALL.length);
});

test('charades: auto-balanced teams, host moves players, each team needs two to begin', () => {
  const ctx = fakeCtx();
  const s: any = charades.start(ctx, ['a', 'b', 'c', 'd', 'e'], settings());
  expect(s.phase).toBe('teams');
  expect([s.teams[0].length, s.teams[1].length].sort()).toEqual([2, 3]);
  // make it 4 v 1: can't begin
  const small = s.teams[0].length === 2 ? 0 : 1;
  charades.act(ctx, s, 'a', { type: 'swap', id: s.teams[small][0] });
  expect(s.teams[small].length).toBe(1);
  expect(() => charades.act(ctx, s, 'a', { type: 'swap', id: s.teams[small][0] })).toThrow(GameError);
  expect(() => charades.act(ctx, s, 'a', { type: 'begin' })).toThrow(GameError);
  charades.act(ctx, s, 'a', { type: 'shuffle' });
  charades.act(ctx, s, 'a', { type: 'begin' });
  expect(s.phase).toBe('ready');
  expect(s.totalTurns).toBe(2 * 3); // bigger team has 3, one turn each
  expect(s.teams[(s.startTeam + s.turn) % 2]).toContain(s.actorId);
  expect(charades.turnOf!(s)).toEqual([s.actorId]);
});

test('charades: only the actor and the other team see the word', () => {
  const ctx = fakeCtx();
  const s = startGame(ctx);
  expect(v(ctx, s, s.actorId).card).toBeNull(); // not before the turn starts
  startTurn(ctx, s);
  const team = (s.startTeam + s.turn) % 2;
  const mate = s.teams[team].find((id: string) => id !== s.actorId);
  const rival = s.teams[1 - team][0];
  expect(v(ctx, s, s.actorId).card?.word).toBe(s.card.word);
  expect(v(ctx, s, rival).card?.word).toBe(s.card.word);
  expect(v(ctx, s, mate).card).toBeNull();
  expect(JSON.stringify(v(ctx, s, mate))).not.toContain(s.card.word);
  expect(v(ctx, s, 'spectator').card).toBeNull();
  // words already played this turn stay hidden from the guessers too
  const first = s.card.word;
  charades.act(ctx, s, s.actorId, { type: 'skip', index: s.card.index });
  expect(v(ctx, s, mate).history).toEqual([{ word: null, result: 'skip' }]);
  expect(v(ctx, s, rival).history[0].word).toBe(first);
  ctx.now += 60_000;
  charades.tick!(ctx, s);
  expect(s.phase).toBe('turnEnd');
  expect(v(ctx, s, mate).history[0].word).toBe(first); // revealed after the turn
  expect(v(ctx, s, rival).card).toBeNull();
});

test('charades: صح scores, free skips then a one-point penalty, stale taps and other players ignored', () => {
  const ctx = fakeCtx();
  const s = startGame(ctx, PLAYERS, { skips: 1 });
  startTurn(ctx, s);
  const team = (s.startTeam + s.turn) % 2;
  const other = s.teams[1 - team][0];
  const idx = s.card.index;
  charades.act(ctx, s, other, { type: 'ok', index: idx }); // not the actor
  expect(s.teamScores[team]).toBe(0);
  charades.act(ctx, s, s.actorId, { type: 'ok', index: idx });
  charades.act(ctx, s, s.actorId, { type: 'ok', index: idx }); // double tap on the same card
  expect(s.teamScores[team]).toBe(1);
  expect(v(ctx, s, s.actorId).skipsLeft).toBe(1);
  charades.act(ctx, s, s.actorId, { type: 'skip', index: s.card.index }); // free
  expect(s.teamScores[team]).toBe(1);
  expect(v(ctx, s, s.actorId).skipsLeft).toBe(0);
  charades.act(ctx, s, s.actorId, { type: 'skip', index: s.card.index }); // costs a point
  expect(s.teamScores[team]).toBe(0);
  expect(s.history.map((h: any) => h.result)).toEqual(['ok', 'skip', 'penalty']);
  // unlimited skips never cost anything
  const s2 = startGame(ctx, PLAYERS, { skips: CHARADES_FREE_SKIPS });
  startTurn(ctx, s2);
  for (let i = 0; i < 12; i++) charades.act(ctx, s2, s2.actorId, { type: 'skip', index: s2.card.index });
  expect(s2.teamScores).toEqual([0, 0]);
});

test('charades: a full game alternates teams, rotates actors and reaches the final screen', () => {
  const ctx = fakeCtx();
  const s = startGame(ctx, PLAYERS, { turnsEach: 2, seconds: 45 });
  expect(s.totalTurns).toBe(12);
  const actors: string[] = [];
  const teams: number[] = [];
  let guard = 0;
  while (s.phase !== 'final' && guard++ < 100) {
    expect(s.phase).toBe('ready');
    actors.push(s.actorId);
    teams.push((s.startTeam + s.turn) % 2);
    startTurn(ctx, s);
    for (let i = 0; i < (guard % 3) + 1; i++) charades.act(ctx, s, s.actorId, { type: 'ok', index: s.card.index });
    ctx.now += 45_000;
    charades.tick!(ctx, s);
    expect(s.phase).toBe('turnEnd');
    charades.act(ctx, s, s.actorId, { type: 'next' });
  }
  expect(s.phase).toBe('final');
  expect(actors.length).toBe(12);
  for (let i = 1; i < teams.length; i++) expect(teams[i]).not.toBe(teams[i - 1]);
  for (const id of PLAYERS) expect(actors.filter((a) => a === id).length).toBe(2); // 3 v 3: everyone acts twice
  expect(s.teamScores[0] + s.teamScores[1]).toBeGreaterThan(0);
  expect(ctx.fxs.at(-1)).toEqual({ kind: 'win', target: undefined }); // a team win has no single target
  expect(charades.turnOf!(s)).toEqual([]);
});

test('charades: the host can end a turn; offline actors are skipped', () => {
  const ctx = fakeCtx();
  const s = startGame(ctx);
  startTurn(ctx, s);
  charades.act(ctx, s, 'a', { type: 'endTurn' });
  expect(s.phase).toBe('turnEnd');
  const ctx2 = fakeCtx();
  const s2: any = charades.start(ctx2, PLAYERS, settings());
  const team = (s2.startTeam + s2.turn) % 2;
  const off = s2.teams[team][0];
  const ctx3 = fakeCtx([off]);
  charades.act(ctx3, s2, 'a', { type: 'begin' });
  expect(s2.actorId).not.toBe(off);
});

test('charades: leaving players — actor leaves mid-turn, teams rebalance, too few ends the game', () => {
  const ctx = fakeCtx();
  const s = startGame(ctx, ['a', 'b', 'c', 'd', 'e']);
  startTurn(ctx, s);
  const team = (s.startTeam + s.turn) % 2;
  const leaver = s.actorId;
  charades.onLeave!(ctx, s, leaver);
  expect(s.phase).toBe('turnEnd');
  expect(s.participants).not.toContain(leaver);
  expect(s.teams[0].length).toBeGreaterThanOrEqual(2);
  expect(s.teams[1].length).toBeGreaterThanOrEqual(2);
  expect(s.teams[team]).toContain(s.actorId);
  charades.act(ctx, s, s.actorId, { type: 'next' });
  expect(s.phase).toBe('ready');
  // down to 3 players: the game ends
  charades.onLeave!(ctx, s, s.participants[0]);
  expect(s.phase).toBe('final');
  // in the teams phase it just waits for the host
  const s2: any = charades.start(ctx, ['a', 'b', 'c', 'd'], settings());
  charades.onLeave!(ctx, s2, 'a');
  expect(s2.phase).toBe('teams');
  expect(() => charades.act(ctx, s2, 'b', { type: 'begin' })).toThrow(GameError);
});

test('charades: settings are validated', () => {
  const s = settings();
  charades.patchSettings!(s, { seconds: 50, turnsEach: 9, skips: -3, category: 'nope', level: 'x' });
  expect(s).toEqual(settings({ turnsEach: 3, skips: 0 }));
  charades.patchSettings!(s, { seconds: 90, turnsEach: 0, skips: 20, category: 'movies', level: 'hard' });
  expect(s).toEqual({ seconds: 90, turnsEach: 1, skips: CHARADES_FREE_SKIPS, category: 'movies', level: 'hard' });
  charades.patchSettings!(s, { category: 'mixed', skips: 3 });
  expect(s.category).toBe('mixed');
  expect(s.skips).toBe(3);
});
