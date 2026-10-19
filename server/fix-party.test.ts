/** Party / word games: leaving players, timers and guards. */
import { expect, test } from 'bun:test';

import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { codenames } from './games/codenames';
import { draw } from './games/draw';
import { imposter } from './games/imposter';
import { names } from './games/names';
import { taboo } from './games/taboo';
import { wave } from './games/wave';
import { werewolf } from './games/werewolf';
import { wordle } from './games/wordle';
import { GameError } from './types';

interface Opts {
  offline?: string[];
  bots?: string[];
}

const fakeCtx = (o: Opts = {}): any => {
  const fx: { kind: string; target?: string }[] = [];
  return {
    now: 1_000_000,
    fxs: fx,
    fx: (kind: string, target?: string) => fx.push({ kind, target }),
    isConnected: (id: string) => !(o.offline ?? []).includes(id),
    isBot: (id: string) => (o.bots ?? []).includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    bot: () => {},
  };
};

test('werewolf: the narrator leaving ends the game with every role shown', () => {
  const ctx = fakeCtx();
  const s: any = werewolf.start(ctx, ['n', 'a', 'b', 'c', 'd'], { ...DEFAULT_SETTINGS.werewolf, narratorId: 'n' });
  expect(s.phase).toBe('night');
  werewolf.onLeave!(ctx, s, 'n');
  expect(s.phase).toBe('over');
  const v: any = werewolf.view(ctx, s, 'a');
  expect(v.revealed).toEqual(s.roles);
  expect(v.endNote).toBe('غادر الراوي — انتهت اللعبة');
  // a fresh start clears the note
  werewolf.act(ctx, s, 'n', { type: 'again' });
  expect(s.endNote).toBeNull();
});

test('werewolf: bot accusations appear one by one', () => {
  // easy bots always speak (smarter villagers keep quiet until they have a reason)
  const ctx = { ...fakeCtx({ bots: ['a', 'b', 'c', 'd'] }), botLevel: () => 'easy' };
  const s: any = werewolf.start(ctx, ['n', 'a', 'b', 'c', 'd'], { ...DEFAULT_SETTINGS.werewolf, narratorId: 'n' });
  s.phase = 'day';
  s.day = 1;
  werewolf.botPlan!(ctx, s, ['a', 'b', 'c', 'd']);
  expect(s.accusations.length).toBe(4);
  expect((werewolf.view(ctx, s, 'n') as any).accusations.length).toBe(0);
  ctx.now += 4001;
  expect(werewolf.tick!(ctx, s)).toBe(true);
  expect((werewolf.view(ctx, s, 'n') as any).accusations.length).toBe(1);
  ctx.now += 16_001;
  werewolf.tick!(ctx, s);
  expect((werewolf.view(ctx, s, 'n') as any).accusations.length).toBe(4);
});

const impSettings = { ...DEFAULT_SETTINGS.imposter, imposters: 1, rounds: 2 };

function catchImposter(ctx: any, s: any) {
  s.phase = 'vote';
  const imp = s.imposters[0];
  for (const id of s.participants) {
    const target = id === imp ? s.participants.find((p: string) => p !== imp) : imp;
    imposter.act(ctx, s, id, { type: 'vote', target });
  }
  return imp as string;
}

test('imposter: the last-chance guess times out as a miss, then the final screen', () => {
  const ctx = fakeCtx();
  const s: any = imposter.start(ctx, ['a', 'b', 'c', 'd'], impSettings);
  const imp = catchImposter(ctx, s);
  expect(s.phase).toBe('guess');
  expect((imposter.view(ctx, s, 'a') as any).guessEndsAt).toBe(ctx.now + 25_000);
  ctx.now += 24_000;
  expect(imposter.tick!(ctx, s)).toBe(false);
  ctx.now += 1_001;
  expect(imposter.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('result');
  expect(s.result.guessCorrect).toBe(false);
  expect(s.result.winners).toBe('civilians');
  expect(s.scores[imp]).toBe(0);

  imposter.act(ctx, s, 'a', { type: 'next' });
  expect(s.round).toBe(2);
  imposter.act(ctx, s, 'a', { type: 'skipReady' });
  imposter.act(ctx, s, 'a', { type: 'toVote' });
  imposter.act(ctx, s, 'a', { type: 'forceResolve' }); // nobody voted: the imposter escapes
  expect(s.phase).toBe('result');
  ctx.fxs.length = 0;
  imposter.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('final');
  const v: any = imposter.view(ctx, s, 'a');
  expect(v.totalRounds).toBe(2);
  expect(ctx.fxs.at(-1).kind).toBe('win');
});

test('imposter: the caught imposter leaving ends the guess; votes re-checked on leave', () => {
  const ctx = fakeCtx();
  const s: any = imposter.start(ctx, ['a', 'b', 'c', 'd', 'e'], impSettings);
  const imp = catchImposter(ctx, s);
  imposter.onLeave!(ctx, s, imp);
  expect(s.phase).toBe('result');
  expect(s.result.winners).toBe('civilians');

  const s2: any = imposter.start(ctx, ['a', 'b', 'c', 'd'], impSettings);
  imposter.act(ctx, s2, 'a', { type: 'ready' });
  imposter.act(ctx, s2, 'b', { type: 'ready' });
  imposter.act(ctx, s2, 'c', { type: 'ready' });
  expect(s2.phase).toBe('reveal');
  imposter.onLeave!(ctx, s2, 'd');
  expect(s2.phase).toBe('clues');
});

test('imposter: bots bluff with a clue from the real category', () => {
  const ctx = fakeCtx({ bots: ['b1', 'b2', 'b3'] });
  for (let i = 0; i < 20; i++) {
    const s: any = imposter.start(ctx, ['h', 'b1', 'b2', 'b3'], { ...impSettings, hintForImposter: false });
    for (const id of s.imposters.filter((x: string) => x !== 'h')) expect(s.botClues[id]).toBeTruthy();
  }
});

test('codenames: a team must reveal a word before passing; a broken team goes back to team picking', () => {
  const ctx = fakeCtx();
  const s: any = codenames.start(ctx, ['a', 'b', 'c', 'd'], { assassin: false });
  s.teams = { red: ['a', 'b'], blue: ['c', 'd'] };
  s.spymasters = { red: 'a', blue: 'c' };
  codenames.act(ctx, s, 'a', { type: 'begin' });
  s.turn = 'red';
  codenames.act(ctx, s, 'a', { type: 'clue', word: 'تلميح', n: 2 });
  expect(() => codenames.act(ctx, s, 'b', { type: 'pass' })).toThrow(GameError);
  const red = s.key.indexOf('red');
  codenames.act(ctx, s, 'b', { type: 'reveal', index: red });
  codenames.act(ctx, s, 'b', { type: 'pass' });
  expect(s.turn).toBe('blue');
  expect((codenames.view(ctx, s, 'c') as any).turnNote.text).toBe('أنهى الفريق دوره');
  ctx.now += 6001; // the note stays 6 s
  expect(codenames.tick!(ctx, s)).toBe(true);
  expect((codenames.view(ctx, s, 'c') as any).turnNote).toBeNull();

  codenames.act(ctx, s, 'c', { type: 'clue', word: 'أخرى', n: 1 });
  const neutral = s.key.findIndex((k: string, i: number) => k === 'neutral' && !s.revealed[i]);
  codenames.act(ctx, s, 'd', { type: 'reveal', index: neutral });
  expect(s.turnNote.text).toBe('كلمة محايدة — انتهى دوركم');

  codenames.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('teams');
  expect((codenames.view(ctx, s, 'a') as any).notice).toContain('الفريق الأحمر');
});

test('draw: the turn ends when every connected guesser is right', () => {
  const ctx = fakeCtx({ offline: ['c'] });
  const s: any = draw.start(ctx, ['a', 'b', 'c'], DEFAULT_SETTINGS.draw);
  s.order = ['a', 'b', 'c'];
  s.turn = 0;
  draw.act(ctx, s, 'a', { type: 'choose', word: s.options[0] });
  draw.act(ctx, s, 'b', { type: 'guess', text: s.word });
  expect(s.phase).toBe('reveal');

  // re-checked when someone who hasn't guessed leaves
  const ctx2 = fakeCtx();
  const s2: any = draw.start(ctx2, ['a', 'b', 'c', 'd'], DEFAULT_SETTINGS.draw);
  const d2 = s2.order[s2.turn];
  draw.act(ctx2, s2, d2, { type: 'choose', word: s2.options[0] });
  const [g1, g2, g3] = s2.order.filter((id: string) => id !== d2);
  draw.act(ctx2, s2, g1, { type: 'guess', text: s2.word });
  draw.act(ctx2, s2, g2, { type: 'guess', text: s2.word });
  expect(s2.phase).toBe('draw');
  draw.onLeave!(ctx2, s2, g3);
  expect(s2.phase).toBe('reveal');
});

test('wave: the clue-giver is stable when someone else leaves, and the clue moves on after 60 s', () => {
  const ctx = fakeCtx();
  const s: any = wave.start(ctx, ['a', 'b', 'c', 'd'], { rounds: 1 });
  s.round = 2;
  s.giverIdx = 1;
  s.giver = s.order[1];
  const giver = s.giver;
  wave.onLeave!(ctx, s, s.order[0]);
  expect((wave.view(ctx, s, 'a') as any).psychic).toBe(giver);
  expect(s.order[s.giverIdx]).toBe(giver);

  const s2: any = wave.start(ctx, ['a', 'b', 'c'], { rounds: 1 });
  const first = s2.giver;
  expect(s2.endsAt).toBe(ctx.now + 60_000);
  ctx.now += 60_001;
  expect(wave.tick!(ctx, s2)).toBe(true);
  const v: any = wave.view(ctx, s2, 'a');
  expect(v.phase).toBe('clue');
  expect(v.psychic).not.toBe(first);
  expect(v.passedFrom).toBe(first);
  wave.act(ctx, s2, v.psychic, { type: 'clue', text: 'حار' });
  expect(s2.phase).toBe('guess');
});

test('wordle: once half of the players are done the round is cut to a minute', () => {
  const ctx = fakeCtx();
  const s: any = wordle.start(ctx, ['a', 'b', 'c', 'd'], { rounds: 1 });
  const answer = s.words[0].word;
  wordle.act(ctx, s, 'a', { type: 'guess', word: answer });
  expect(s.endsAt).toBe(ctx.now + 4 * 60_000);
  wordle.act(ctx, s, 'b', { type: 'guess', word: answer });
  expect(s.endsAt).toBe(ctx.now + 60_000);
  expect((wordle.view(ctx, s, 'c') as any).hurried).toBe(true);
  ctx.now += 60_001;
  ctx.fxs.length = 0;
  wordle.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  expect(ctx.fxs.map((f: any) => f.kind)).toContain('reveal');
});

test('names: with «ستوب» off a player can finish with empty boxes', () => {
  const ctx = fakeCtx();
  const s: any = names.start(ctx, ['a', 'b'], { rounds: 1, seconds: 60, stop: false });
  s.phase = 'write';
  names.act(ctx, s, 'a', { type: 'stop' });
  expect(s.done).toEqual(['a']);
  names.act(ctx, s, 'b', { type: 'stop' });
  expect(s.phase).toBe('stopping');

  const s2: any = names.start(ctx, ['a', 'b'], { rounds: 1, seconds: 60, stop: true });
  s2.phase = 'write';
  expect(() => names.act(ctx, s2, 'a', { type: 'stop' })).toThrow(GameError);
});

test('taboo: the describer can undo a buzz within 5 s, and that card cannot be buzzed again', () => {
  const ctx = fakeCtx();
  const s: any = taboo.start(ctx, ['a', 'b', 'c', 'd'], DEFAULT_SETTINGS.taboo);
  s.teams = [['a', 'b'], ['c', 'd']];
  s.startTeam = 0;
  taboo.act(ctx, s, 'a', { type: 'begin' });
  taboo.act(ctx, s, s.describerId, { type: 'start' });
  const describer = s.describerId;
  const card = s.card;
  taboo.act(ctx, s, 'c', { type: 'buzz', index: card.index });
  taboo.act(ctx, s, 'd', { type: 'buzz', index: card.index }); // same card: ignored
  expect(s.teamScores[0]).toBe(-1);
  expect((taboo.view(ctx, s, describer) as any).undoBuzz).toEqual({ by: 'c' });
  taboo.act(ctx, s, 'c', { type: 'undoBuzz' }); // not the describer
  expect(s.teamScores[0]).toBe(-1);
  taboo.act(ctx, s, describer, { type: 'undoBuzz' });
  expect(s.teamScores[0]).toBe(0);
  expect(s.card.index).toBe(card.index);
  expect(s.history.length).toBe(0);
  taboo.act(ctx, s, 'c', { type: 'buzz', index: card.index });
  expect(s.teamScores[0]).toBe(0);

  // too late
  taboo.act(ctx, s, describer, { type: 'skip', index: s.card.index });
  taboo.act(ctx, s, 'c', { type: 'buzz', index: s.card.index });
  ctx.now += 5001;
  expect(taboo.tick!(ctx, s)).toBe(true);
  taboo.act(ctx, s, describer, { type: 'undoBuzz' });
  expect(s.teamScores[0]).toBe(-1);
});

test('taboo: a team left with one player gets one from the bigger team', () => {
  const ctx = fakeCtx();
  const s: any = taboo.start(ctx, ['a', 'b', 'c', 'd', 'e'], DEFAULT_SETTINGS.taboo);
  s.teams = [['a', 'b'], ['c', 'd', 'e']];
  s.startTeam = 0;
  taboo.act(ctx, s, 'a', { type: 'begin' });
  taboo.onLeave!(ctx, s, 'b');
  expect(s.teams[0].length).toBe(2);
  expect(s.teams[1].length).toBe(2);
  expect((taboo.view(ctx, s, 'a') as any).notice).toContain('انتقل');
});
