/** «الجاسوس»: content, hidden roles, accusations, the spy's guess, the final vote, scoring and leaving. */
import { expect, test } from 'bun:test';

import { SPY_DEFAULTS, type SpySettings, type SpyView } from '../src/shared/games/spy';
import { SPY_GUESS_MS, SPY_LIST_SIZE, spy, spyCountFor } from './games/spy';
import { SPY_LOCATIONS } from './spy-content';
import { GameError } from './types';

const fakeCtx = (offline: string[] = []): any => {
  const fxs: { kind: string; target?: string }[] = [];
  return {
    now: 1_000_000,
    fxs,
    offline,
    fx: (kind: string, target?: string) => fxs.push({ kind, target }),
    isConnected: (id: string) => !offline.includes(id),
    isBot: () => false,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: () => {},
  };
};

const settings = (o: Partial<SpySettings> = {}): SpySettings => ({ ...SPY_DEFAULTS, ...o });
const P = ['a', 'b', 'c', 'd', 'e'];
const v = (ctx: any, s: any, me: string) => spy.view(ctx, s, me) as SpyView;

function startPlaying(ctx: any, players = P, o: Partial<SpySettings> = {}) {
  const s: any = spy.start(ctx, players, settings(o));
  for (const id of players) spy.act(ctx, s, id, { type: 'ready' });
  expect(s.phase).toBe('play');
  return s;
}
const civilians = (s: any) => s.participants.filter((id: string) => !s.spies.includes(id));

test('spy content: 40+ locations with 6–8 roles, no religious places', () => {
  expect(SPY_LOCATIONS.length).toBeGreaterThanOrEqual(40);
  expect(new Set(SPY_LOCATIONS.map((l) => l.name)).size).toBe(SPY_LOCATIONS.length);
  for (const l of SPY_LOCATIONS) {
    expect(l.roles.length).toBeGreaterThanOrEqual(6);
    expect(l.roles.length).toBeLessThanOrEqual(8);
    expect(new Set(l.roles).size).toBe(l.roles.length);
    expect(/مسجد|زاوية|ضريح|كنيسة|معبد/.test(l.name)).toBe(false);
  }
});

test('spy: spy count (auto: 1, or 2 from 7 players) never leaves the spies a majority', () => {
  expect(spyCountFor(3, 0)).toBe(1);
  expect(spyCountFor(6, 0)).toBe(1);
  expect(spyCountFor(7, 0)).toBe(2);
  expect(spyCountFor(10, 1)).toBe(1);
  expect(spyCountFor(4, 2)).toBe(1);
  expect(spyCountFor(5, 2)).toBe(2);
});

test('spy: hidden info — the spy never gets the location, civilians get it with a role', () => {
  const ctx = fakeCtx();
  const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const s: any = spy.start(ctx, players, settings());
  expect(s.spies.length).toBe(2);
  expect(s.locations.length).toBe(SPY_LIST_SIZE);
  expect(s.locations).toContain(s.location.name);
  for (const id of players) {
    const view = v(ctx, s, id);
    expect(view.result).toBeNull();
    expect(view.locations).toEqual(s.locations); // the same list for everyone
    if (s.spies.includes(id)) {
      expect(view.secret).toEqual({ role: 'spy', partners: s.spies.filter((x: string) => x !== id) });
      expect(JSON.stringify(view.secret)).not.toContain(s.location.name);
    } else {
      expect(view.secret).toEqual({ role: 'civilian', location: s.location.name, part: s.parts[id] });
      expect(s.location.roles).toContain(s.parts[id]);
    }
    // nobody learns anybody else's role or who the spies are before the end
    const json = JSON.stringify({ ...view, secret: null, locations: [] });
    expect(json).not.toContain(s.location.name);
    for (const other of players) if (other !== id && !s.spies.includes(other) && s.parts[other] !== s.parts[id]) expect(json).not.toContain(s.parts[other]);
  }
  expect(v(ctx, s, 'stranger').secret).toBeNull();
});

test('spy: everyone ready starts the timer; questions follow the order; time up opens the final vote', () => {
  const ctx = fakeCtx();
  const s = startPlaying(ctx);
  expect(s.endsAt).toBe(ctx.now + 8 * 60_000);
  const first = v(ctx, s, 'a').askerId!;
  expect(first).toBe(s.order[0]);
  expect(spy.turnOf!(s)).toEqual([first]);
  spy.act(ctx, s, first, { type: 'nextAsker', idx: 0 });
  spy.act(ctx, s, first, { type: 'nextAsker', idx: 0 }); // a stale second tap is ignored
  expect(v(ctx, s, 'a').askerId).toBe(s.order[1]);
  ctx.now = s.endsAt;
  expect(spy.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('finalVote');
  expect(spy.turnOf!(s)).toEqual([]); // everyone votes at once: no turn to point at
});

test('spy: a majority accusation of the spy — civilians win, the accuser gets 2', () => {
  const ctx = fakeCtx();
  const s = startPlaying(ctx);
  const [spyId] = s.spies;
  const [accuser, ...rest] = civilians(s);
  ctx.now += 60_000;
  spy.act(ctx, s, accuser, { type: 'accuse', target: spyId });
  expect(s.phase).toBe('accuse');
  expect(s.endsAt).toBeNull();
  expect(s.pausedLeft).toBe(7 * 60_000);
  expect(spy.turnOf!(s)).toEqual([]); // the voters answer at once
  expect(() => spy.act(ctx, s, spyId, { type: 'accuseVote', yes: false })).toThrow(GameError); // the accused can't vote
  expect(v(ctx, s, rest[0]).accusation).toEqual({ by: accuser, target: spyId, voted: [accuser] });
  spy.act(ctx, s, rest[0], { type: 'accuseVote', yes: true });
  expect(s.phase).toBe('accuse'); // 2 of 4 voters: not yet a majority
  spy.act(ctx, s, rest[1], { type: 'accuseVote', yes: true });
  expect(s.phase).toBe('result');
  expect(s.result.winners).toBe('civilians');
  expect(s.result.how).toBe('caught');
  expect(s.scores[accuser]).toBe(2);
  for (const id of rest) expect(s.scores[id]).toBe(1);
  expect(s.scores[spyId]).toBe(0);
  // now everything is revealed
  expect(v(ctx, s, spyId).result?.location).toBe(s.location.name);
});

test('spy: accusing an innocent by majority — the spy wins 4', () => {
  const ctx = fakeCtx();
  const s = startPlaying(ctx);
  const [spyId] = s.spies;
  const [x, y, ...rest] = civilians(s);
  spy.act(ctx, s, x, { type: 'accuse', target: y });
  spy.act(ctx, s, spyId, { type: 'accuseVote', yes: true });
  spy.act(ctx, s, rest[0], { type: 'accuseVote', yes: true });
  expect(s.phase).toBe('result');
  expect(s.result).toMatchObject({ winners: 'spies', how: 'wrongAccuse', accused: y });
  expect(s.scores[spyId]).toBe(4);
});

test('spy: a failed accusation resumes the clock; one accusation per player per round', () => {
  const ctx = fakeCtx();
  const s = startPlaying(ctx);
  const [spyId] = s.spies;
  const [x, ...rest] = civilians(s);
  ctx.now += 30_000;
  const left = s.endsAt - ctx.now;
  spy.act(ctx, s, x, { type: 'accuse', target: spyId });
  ctx.now += 20_000; // talking during the vote doesn't use the round's time
  spy.act(ctx, s, rest[0], { type: 'accuseVote', yes: false });
  spy.act(ctx, s, rest[1], { type: 'accuseVote', yes: false });
  expect(s.phase).toBe('play');
  expect(s.endsAt - ctx.now).toBe(left);
  expect(v(ctx, s, x).failed).toEqual({ by: x, target: spyId, yes: 1, no: 2 });
  expect(() => spy.act(ctx, s, x, { type: 'accuse', target: spyId })).toThrow(GameError);
  expect(() => spy.act(ctx, s, rest[0], { type: 'accuse', target: rest[0] })).toThrow(GameError); // not yourself
  ctx.now += 8000;
  spy.tick!(ctx, s);
  expect(s.failed).toBeNull();
});

test('spy: the spy reveals and guesses — right wins 4, wrong or too slow loses', () => {
  const ctx = fakeCtx();
  let s = startPlaying(ctx);
  const civ = civilians(s)[0];
  spy.act(ctx, s, civ, { type: 'spyReveal' }); // only a spy can
  expect(s.phase).toBe('play');
  let spyId = s.spies[0];
  spy.act(ctx, s, spyId, { type: 'spyReveal' });
  expect(s.phase).toBe('spyGuess');
  expect(spy.turnOf!(s)).toEqual([spyId]);
  spy.act(ctx, s, spyId, { type: 'spyGuess', location: 'مكان غير موجود' }); // not on the list: ignored
  expect(s.phase).toBe('spyGuess');
  spy.act(ctx, s, spyId, { type: 'spyGuess', location: s.location.name });
  expect(s.result).toMatchObject({ winners: 'spies', how: 'guessRight' });
  expect(s.scores[spyId]).toBe(4);

  s = startPlaying(ctx);
  spyId = s.spies[0];
  spy.act(ctx, s, spyId, { type: 'spyReveal' });
  const wrong = s.locations.find((l: string) => l !== s.location.name);
  spy.act(ctx, s, spyId, { type: 'spyGuess', location: wrong });
  expect(s.result).toMatchObject({ winners: 'civilians', how: 'guessWrong', guessed: wrong });
  for (const id of civilians(s)) expect(s.scores[id]).toBe(1);

  s = startPlaying(ctx);
  spyId = s.spies[0];
  spy.act(ctx, s, spyId, { type: 'spyReveal' });
  ctx.now += SPY_GUESS_MS;
  spy.tick!(ctx, s);
  expect(s.result).toMatchObject({ winners: 'civilians', how: 'guessWrong', guessed: '' });
});

test('spy: final vote — the spy caught, an innocent picked, or a tie', () => {
  const ctx = fakeCtx();
  const timeUp = (s: any) => {
    ctx.now = s.endsAt;
    spy.tick!(ctx, s);
    expect(s.phase).toBe('finalVote');
  };
  let s = startPlaying(ctx);
  timeUp(s);
  let spyId = s.spies[0];
  expect(() => spy.act(ctx, s, 'a', { type: 'finalVote', target: 'a' })).toThrow(GameError);
  for (const id of P) spy.act(ctx, s, id, { type: 'finalVote', target: id === spyId ? civilians(s)[0] : spyId });
  expect(s.result).toMatchObject({ winners: 'civilians', how: 'caught', accused: spyId });
  expect(Object.keys(s.result.votes).length).toBe(P.length);

  s = startPlaying(ctx, P);
  timeUp(s);
  spyId = s.spies[0];
  const [c1, c2, c3, c4] = civilians(s);
  spy.act(ctx, s, c1, { type: 'finalVote', target: c2 });
  spy.act(ctx, s, c2, { type: 'finalVote', target: c3 });
  spy.act(ctx, s, c3, { type: 'finalVote', target: c2 });
  spy.act(ctx, s, c4, { type: 'finalVote', target: spyId });
  spy.act(ctx, s, spyId, { type: 'finalVote', target: c3 });
  expect(s.result).toMatchObject({ winners: 'spies', how: 'tie' }); // c2 and c3 have 2 each
  expect(s.result.points[spyId]).toBe(2);

  // the spy can still reveal during the final vote; the host can close a vote
  s = startPlaying(ctx);
  timeUp(s);
  spy.act(ctx, s, 'a', { type: 'forceResolve' });
  expect(s.result.how).toBe('tie');
  s = startPlaying(ctx);
  timeUp(s);
  spy.act(ctx, s, s.spies[0], { type: 'spyReveal' });
  expect(s.phase).toBe('spyGuess');
});

test('spy: a full game over several rounds ends on the podium', () => {
  const ctx = fakeCtx();
  const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const s: any = spy.start(ctx, players, settings({ rounds: 4, minutes: 5 }));
  const seen = new Set<string>();
  let guard = 0;
  while (s.phase !== 'final' && guard++ < 50) {
    expect(s.phase).toBe('reveal');
    seen.add(s.location.name);
    for (const id of players) spy.act(ctx, s, id, { type: 'ready' });
    const r = s.round % 3;
    if (r === 0) {
      spy.act(ctx, s, s.spies[0], { type: 'spyReveal' });
      spy.act(ctx, s, s.spies[0], { type: 'spyGuess', location: s.location.name });
    } else if (r === 1) {
      const accuser = civilians(s)[0];
      spy.act(ctx, s, accuser, { type: 'accuse', target: s.spies[1] });
      for (const id of civilians(s)) spy.act(ctx, s, id, { type: 'accuseVote', yes: true });
    } else {
      ctx.now = s.endsAt;
      spy.tick!(ctx, s);
      for (const id of players) spy.act(ctx, s, id, { type: 'finalVote', target: id === 'a' ? 'b' : 'a' });
    }
    expect(s.phase).toBe('result');
    spy.act(ctx, s, 'a', { type: 'next' });
  }
  expect(s.phase).toBe('final');
  expect(s.round).toBe(4);
  expect(seen.size).toBe(4); // no repeated location
  expect(ctx.fxs.at(-1).kind).toBe('win');
  const total = Object.values(s.scores as Record<string, number>).reduce((a, b) => a + b, 0);
  expect(total).toBeGreaterThan(0);
});

test('spy: leaving — the spy, the accused, a voter, and dropping below 3', () => {
  const ctx = fakeCtx();
  let s = startPlaying(ctx);
  spy.onLeave!(ctx, s, s.spies[0]);
  expect(s.result).toMatchObject({ how: 'spyLeft', winners: 'civilians' });
  expect(Object.values(s.scores).every((x) => x === 0)).toBe(true);

  s = startPlaying(ctx, ['a', 'b', 'c', 'd', 'e', 'f']);
  const [x, y, z, ...rest] = civilians(s);
  spy.act(ctx, s, x, { type: 'accuse', target: y });
  spy.onLeave!(ctx, s, y);
  expect(s.phase).toBe('play');
  expect(s.accusers.has(x)).toBe(false); // x keeps their accusation
  spy.act(ctx, s, x, { type: 'accuse', target: z });
  spy.act(ctx, s, rest[0], { type: 'accuseVote', yes: false });
  expect(s.phase).toBe('accuse');
  spy.onLeave!(ctx, s, s.spies[0]); // the spy leaves mid-vote
  expect(s.result.how).toBe('spyLeft');

  // the asker leaves: the order moves on
  s = startPlaying(ctx);
  const asker = s.order[s.askIdx];
  spy.onLeave!(ctx, s, asker);
  expect(v(ctx, s, s.participants[0]).askerId).not.toBe(asker);
  expect(s.participants).toContain(v(ctx, s, s.participants[0]).askerId);

  // a final-vote voter leaves: the vote completes without them
  s = startPlaying(ctx);
  ctx.now = s.endsAt;
  spy.tick!(ctx, s);
  const spyId = s.spies[0];
  const civ = civilians(s);
  for (const id of civ.slice(0, -1)) spy.act(ctx, s, id, { type: 'finalVote', target: spyId });
  spy.act(ctx, s, spyId, { type: 'finalVote', target: civ[0] });
  spy.onLeave!(ctx, s, civ.at(-1));
  expect(s.result.how).toBe('caught');

  // an offline player doesn't block the ready step
  const off = fakeCtx(['e']);
  const s2: any = spy.start(off, P, settings());
  for (const id of ['a', 'b', 'c', 'd']) spy.act(off, s2, id, { type: 'ready' });
  expect(s2.phase).toBe('play');

  s = startPlaying(ctx, ['a', 'b', 'c']);
  spy.onLeave!(ctx, s, civilians(s)[0]);
  expect(s.phase).toBe('final');
});

test('spy: settings are validated', () => {
  const s = settings();
  spy.patchSettings!(s, { spies: 7, minutes: 6, rounds: 99 });
  expect(s).toEqual({ spies: 2, minutes: 8, rounds: 10 });
  spy.patchSettings!(s, { spies: -1, minutes: 10, rounds: 0 });
  expect(s).toEqual({ spies: 0, minutes: 10, rounds: 1 });
  spy.patchSettings!(s, { spies: 'x', minutes: '5' });
  expect(s).toEqual({ spies: 0, minutes: 10, rounds: 1 });
});
