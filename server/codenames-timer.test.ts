/** «الكلمات السرية»: the optional time limits for the spymaster's clue and the team's guessing. */
import { expect, test } from 'bun:test';

import { codenames } from './games/codenames';

const fakeCtx = () => {
  const said: string[] = [];
  const ctx: any = {
    now: 1_000_000,
    said,
    fx: () => {},
    isConnected: () => true,
    isBot: () => false,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: () => {},
    say: (text: string) => said.push(text),
  };
  return ctx;
};

const begin = (settings: Record<string, unknown>) => {
  const ctx = fakeCtx();
  const s: any = codenames.start(ctx, ['a', 'b', 'c', 'd'], { assassin: true, ...settings } as any);
  codenames.act(ctx, s, 'a', { type: 'begin' });
  return { ctx, s };
};
const clueWord = (s: any) => ['بحر', 'جبل', 'شمس', 'قمر', 'نهر'].find((w) => !s.words.includes(w))!;

test('no limits by default: nothing runs out', () => {
  const { ctx, s } = begin({});
  expect(s.endsAt).toBeNull();
  expect(codenames.view(ctx, s, 'a').endsAt).toBeNull();
  ctx.now += 3_600_000;
  codenames.tick!(ctx, s);
  expect(s.phase).toBe('clue');
});

test('the clue time runs out: the other team plays', () => {
  const { ctx, s } = begin({ clueSeconds: 60, guessSeconds: 120 });
  const team = s.turn;
  expect(s.endsAt).toBe(ctx.now + 60_000);
  expect(codenames.view(ctx, s, 'a').seconds).toBe(60);
  ctx.now += 59_000;
  expect(codenames.tick!(ctx, s)).toBe(false);
  ctx.now += 1_000;
  expect(codenames.tick!(ctx, s)).toBe(true);
  expect(s.turn).not.toBe(team);
  expect(s.phase).toBe('clue');
  expect(s.turnNote.text).toBe('انتهى وقت التلميح');
  expect(ctx.said.at(-1)).toContain('انتهى وقت التلميح');
  // the next spymaster gets a fresh clock
  expect(s.endsAt).toBe(ctx.now + 60_000);
});

test('the guessing time runs out: the team\'s turn ends', () => {
  const { ctx, s } = begin({ clueSeconds: 0, guessSeconds: 120 });
  const team = s.turn;
  expect(s.endsAt).toBeNull(); // no limit on the clue
  codenames.act(ctx, s, s.spymasters[team], { type: 'clue', word: clueWord(s), n: 2 });
  expect(s.phase).toBe('guess');
  expect(s.endsAt).toBe(ctx.now + 120_000);
  // a correct word doesn't reset the clock
  const guesser = s.teams[team].find((id: string) => id !== s.spymasters[team]);
  codenames.act(ctx, s, guesser, { type: 'reveal', index: s.key.findIndex((k: string) => k === team) });
  expect(s.endsAt).toBe(ctx.now + 120_000);
  ctx.now += 120_000;
  codenames.tick!(ctx, s);
  expect(s.turn).not.toBe(team);
  expect(s.phase).toBe('clue');
  expect(s.turnNote.text).toBe('انتهى وقت التخمين');
  expect(s.endsAt).toBeNull(); // the next clue has no limit
});

test('the clock stops at the end of the game', () => {
  const { ctx, s } = begin({ clueSeconds: 60, guessSeconds: 60 });
  const team = s.turn;
  codenames.act(ctx, s, s.spymasters[team], { type: 'clue', word: clueWord(s), n: 1 });
  const guesser = s.teams[team].find((id: string) => id !== s.spymasters[team]);
  codenames.act(ctx, s, guesser, { type: 'reveal', index: s.key.indexOf('assassin') });
  expect(s.phase).toBe('final');
  expect(s.endsAt).toBeNull();
  ctx.now += 120_000;
  codenames.tick!(ctx, s);
  expect(s.phase).toBe('final');
});
