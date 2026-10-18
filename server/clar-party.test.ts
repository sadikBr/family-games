/**
 * The turn bar's last-move line: the moves of the party and board games are announced to everyone with
 * ctx.say (and the turn bar points at the right player).
 */
import { expect, test } from 'bun:test';

import { CHARADES_DEFAULTS } from '../src/shared/games/charades';
import { SPY_DEFAULTS } from '../src/shared/games/spy';
import { carca } from './games/carca';
import { catan } from './games/catan';
import { codenames } from './games/codenames';
import { charades } from './games/charades';
import { draw } from './games/draw';
import { estate } from './games/estate';
import { headsup } from './games/headsup';
import { huroof } from './games/huroof';
import { imposter } from './games/imposter';
import { names } from './games/names';
import { potato } from './games/potato';
import { scrabble } from './games/scrabble';
import { spy } from './games/spy';
import { survey } from './games/survey';
import { taboo } from './games/taboo';
import { wave } from './games/wave';

const fakeCtx = (bots: string[] = []) => {
  const said: { text: string; by?: string }[] = [];
  const jobs: { id: string; action: any }[] = [];
  const ctx: any = {
    now: 1_000_000,
    said,
    jobs,
    fx: () => {},
    isConnected: () => true,
    isBot: (id: string) => bots.includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (id: string, _key: string, _ms: number, action: any) => jobs.push({ id, action }),
    say: (text: string, by?: string) => said.push({ text, by }),
  };
  return ctx;
};
const lastSaid = (ctx: any) => ctx.said[ctx.said.length - 1] as { text: string; by?: string } | undefined;

test('imposter: the clue round and the vote are announced', () => {
  const ctx = fakeCtx();
  const s: any = imposter.start(ctx, ['a', 'b', 'c', 'd'], { category: '', imposters: 0, rounds: 3, hintForImposter: false } as any);
  for (const id of ['a', 'b', 'c', 'd']) imposter.act(ctx, s, id, { type: 'ready' });
  expect(lastSaid(ctx)?.text).toContain('التلميحات');
  imposter.act(ctx, s, 'a', { type: 'toVote' });
  expect(lastSaid(ctx)?.text).toContain('التصويت');
  expect(imposter.turnOf!(s)).toEqual([]);
});

test('spy: an accusation is announced; votes do not point the turn bar at anyone', () => {
  const ctx = fakeCtx();
  const P = ['a', 'b', 'c', 'd'];
  const s: any = spy.start(ctx, P, { ...SPY_DEFAULTS });
  for (const id of P) spy.act(ctx, s, id, { type: 'ready' });
  spy.act(ctx, s, 'a', { type: 'accuse', target: 'b' });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining('اتّهام من a'), by: 'a' });
  expect(spy.turnOf!(s)).toEqual([]);
});

test('taboo: the describer is on turn; a correct word and a buzz are announced', () => {
  const ctx = fakeCtx();
  const s: any = taboo.start(ctx, ['a', 'b', 'c', 'd'], { seconds: 60, turnsEach: 1 } as any);
  taboo.act(ctx, s, 'a', { type: 'begin' });
  expect(taboo.turnOf!(s)).toEqual([s.describerId]);
  taboo.act(ctx, s, s.describerId, { type: 'start' });
  expect(lastSaid(ctx)?.text).toContain('الشرح من');
  taboo.act(ctx, s, s.describerId, { type: 'ok', index: s.card.index });
  expect(lastSaid(ctx)?.text).toContain('صحيحة');
  const watcher = s.teams[s.teams[0].includes(s.describerId) ? 1 : 0][0];
  taboo.act(ctx, s, watcher, { type: 'buzz', index: s.card.index });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining('قالها'), by: watcher });
});

test('charades: the actor and a guessed word are announced', () => {
  const ctx = fakeCtx();
  const s: any = charades.start(ctx, ['a', 'b', 'c', 'd'], { ...CHARADES_DEFAULTS });
  charades.act(ctx, s, 'a', { type: 'begin' });
  charades.act(ctx, s, s.actorId, { type: 'start' });
  ctx.now = s.endsAt;
  charades.tick!(ctx, s);
  expect(lastSaid(ctx)?.text).toContain('التمثيل');
  charades.act(ctx, s, s.actorId, { type: 'ok', index: s.card.index });
  expect(lastSaid(ctx)?.text).toContain('خمّنوها');
});

test('wave: the clue and the result are announced', () => {
  const ctx = fakeCtx();
  const s: any = wave.start(ctx, ['a', 'b', 'c'], { rounds: 1 } as any);
  const p = s.giver;
  wave.act(ctx, s, p, { type: 'clue', text: 'شاي' });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining('«شاي»'), by: p });
  for (const id of s.players.filter((x: string) => x !== p)) wave.act(ctx, s, id, { type: 'guess', value: s.target });
  expect(s.phase).toBe('reveal');
  expect(lastSaid(ctx)?.text).toContain(String(s.target));
});

test('draw: the drawer is on turn while drawing; a right guess and the word are announced', () => {
  const ctx = fakeCtx();
  const s: any = draw.start(ctx, ['a', 'b', 'c'], { rounds: 1, seconds: 80 } as any);
  const d = s.order[s.turn];
  draw.act(ctx, s, d, { type: 'choose', word: s.options[0] });
  expect(draw.turnOf!(s)).toEqual([d]);
  expect(lastSaid(ctx)?.text).toContain('الرسم');
  const g = s.order.find((x: string) => x !== d);
  draw.act(ctx, s, g, { type: 'guess', text: s.word });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining('إجابة صحيحة من'), by: g });
  expect(draw.hostOnly).toContain('next');
});

test('heads up: the guesser is on turn; the end of the turn is announced', () => {
  const ctx = fakeCtx();
  const s: any = headsup.start(ctx, ['a', 'b'], { seconds: 60, turnsEach: 1, category: '' } as any);
  const g = s.turnOrder[0];
  expect(headsup.turnOf!(s)).toEqual([g]);
  headsup.act(ctx, s, g, { type: 'start' });
  ctx.now = s.endsAt;
  headsup.tick!(ctx, s);
  expect(lastSaid(ctx)?.text).toContain('التخمين');
  ctx.now = s.endsAt;
  headsup.tick!(ctx, s);
  expect(lastSaid(ctx)?.text).toContain('انتهى وقت');
});

test('hot potato: a throw and the explosion are announced', () => {
  const ctx = fakeCtx();
  const s: any = potato.start(ctx, ['a', 'b', 'c'], { rounds: 3, minFuse: 10, maxFuse: 20 } as any);
  expect(potato.turnOf!(s)).toEqual([s.holderId]);
  potato.act(ctx, s, s.holderId, { type: 'start' });
  ctx.now += 1000;
  const from = s.holderId;
  const to = ['a', 'b', 'c'].find((x) => x !== from)!;
  potato.act(ctx, s, from, { type: 'throw', to });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining('البطاطا من'), by: from });
  ctx.now = s.explodeAt;
  potato.tick!(ctx, s);
  expect(lastSaid(ctx)?.text).toContain('انفجرت');
});

test('names: the drawn letter is announced', () => {
  const ctx = fakeCtx();
  const s: any = names.start(ctx, ['a', 'b'], { rounds: 3, seconds: 90, stop: true, dict: 'off' } as any);
  ctx.now = s.endsAt;
  names.tick!(ctx, s);
  expect(lastSaid(ctx)?.text).toContain('الحرف');
});

test('codenames: the clue and a revealed word are announced', () => {
  const ctx = fakeCtx();
  const s: any = codenames.start(ctx, ['a', 'b', 'c', 'd'], { assassin: true } as any);
  codenames.act(ctx, s, 'a', { type: 'begin' });
  const team = s.turn;
  const master = s.spymasters[team];
  // a clue word that is never on the grid (a word on the board would be refused)
  const clue = ['بحر', 'جبل', 'شمس', 'قمر', 'نهر'].find((w) => !s.words.includes(w))!;
  codenames.act(ctx, s, master, { type: 'clue', word: clue, n: 1 });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining(`«${clue}»`), by: master });
  const guesser = s.teams[team].find((id: string) => id !== master);
  const i = s.key.findIndex((k: string) => k === team);
  codenames.act(ctx, s, guesser, { type: 'reveal', index: i });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining(`«${s.words[i]}»`), by: guesser });
});

test('huroof: picking a letter is announced', () => {
  const ctx = fakeCtx();
  const s: any = huroof.start(ctx, ['a', 'b'], { seconds: 20 } as any);
  const who = s.teams[s.turn][0];
  huroof.act(ctx, s, who, { type: 'pick', cell: 0 });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining('باختيار'), by: who });
});

test('survey: the buzz and the answer are announced', () => {
  const ctx = fakeCtx();
  const s: any = survey.start(ctx, ['a', 'b', 'c', 'd'], { rounds: 3, seconds: 20 });
  survey.act(ctx, s, 'a', { type: 'begin' });
  const p = s.face.players[0];
  survey.act(ctx, s, p, { type: 'buzz', step: s.step });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining('الجرس'), by: p });
  survey.act(ctx, s, p, { type: 'answer', step: s.step, text: 'كلمة لا علاقة لها' });
  expect(lastSaid(ctx)?.by).toBe(p);
});

test('scrabble: a pass and a word are announced', () => {
  const ctx = fakeCtx(['b']);
  const s: any = scrabble.start(ctx, ['a', 'b'], { seconds: 0, level: 2 });
  const first = s.turn;
  scrabble.act(ctx, s, first, { type: 'pass' });
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining('تمرير'), by: first });
});

test('estate: a roll says where the token landed (or what was paid)', () => {
  const ctx = fakeCtx();
  const s: any = estate.start(ctx, ['a', 'b'], { startCash: 1500, rounds: 0 });
  const p = s.players[s.turnIdx].id;
  estate.act(ctx, s, p, { type: 'roll' });
  expect(lastSaid(ctx)?.by).toBe(p);
  expect(lastSaid(ctx)?.text.length).toBeGreaterThan(5);
});

test('carca: a bot placing its tile is announced', () => {
  const ctx = fakeCtx(['a', 'b']);
  const s: any = carca.start(ctx, ['a', 'b'], { farmers: true, seconds: 0, level: 1 });
  const who = s.turn;
  for (let k = 0; k < 4 && s.turn === who; k++) {
    ctx.jobs.length = 0;
    carca.botPlan!(ctx, s, ['a', 'b']);
    for (const j of ctx.jobs) carca.act(ctx, s, j.id, j.action);
  }
  expect(ctx.said.some((x: any) => x.by === who && x.text.includes('بلاطة جديدة من'))).toBe(true);
});

test('catan: a settlement placed in the setup is announced, with where it stands in the log', () => {
  const ctx = fakeCtx(['a', 'b', 'c']);
  const s: any = catan.start(ctx, ['a', 'b', 'c'], { layout: 'beginner', target: 10, seconds: 0 });
  const who = s.turn;
  ctx.jobs.length = 0;
  catan.botPlan!(ctx, s, ['a', 'b', 'c']);
  for (const j of ctx.jobs) catan.act(ctx, s, j.id, j.action);
  expect(lastSaid(ctx)).toEqual({ text: expect.stringContaining('قرية جديدة لـ'), by: who });
  expect(s.log.find((e: any) => e.t === 'build').at).toBeNumber();
});
