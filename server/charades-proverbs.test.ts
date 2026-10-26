/** «تمثيل صامت» — «أمثال وحكم» (the «غصب عنك تقول» style): content, points, command and rest cards, toggles. */
import { afterEach, expect, test } from 'bun:test';

import { answerKey } from '../src/shared/arabic';
import { CHARADES_DEFAULTS, CHARADES_FREE_SKIPS, type CharadesSettings, type CharadesView } from '../src/shared/games/charades';
import { CHARADES_ALL } from './charades-content';
import { COMMANDS, PROVERBS, REST_CARDS, type RestCard } from './content-proverbs';
import { COMMAND_CHANCE, COUNTDOWN_MS, REST_MS, charades, charadesPool, proverbPool } from './games/charades';
import { Deck } from './util';

const fakeCtx = (): any => {
  const fxs: { kind: string; target?: string }[] = [];
  const said: string[] = [];
  return {
    now: 1_000_000,
    fxs,
    said,
    fx: (kind: string, target?: string) => fxs.push({ kind, target }),
    say: (text: string) => said.push(text),
    isConnected: () => true,
    isBot: () => false,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: () => {},
  };
};

const PLAYERS = ['a', 'b', 'c', 'd', 'e', 'f'];
const settings = (o: Partial<CharadesSettings> = {}): CharadesSettings => ({ ...CHARADES_DEFAULTS, category: 'proverbs', ...o });
const v = (ctx: any, s: any, me: string) => charades.view(ctx, s, me) as CharadesView;

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});
/** Every roll returns `r` (the deck shuffles stay random). */
function rolls(r: number) {
  Math.random = () => r;
}

function startTurn(ctx: any, o: Partial<CharadesSettings> = {}) {
  const s: any = charades.start(ctx, PLAYERS, settings(o));
  charades.act(ctx, s, 'a', { type: 'begin' });
  charades.act(ctx, s, s.actorId, { type: 'start' });
  ctx.now += COUNTDOWN_MS;
  charades.tick!(ctx, s);
  expect(s.phase).toBe('play');
  const team = (s.startTeam + s.turn) % 2;
  const mate = s.teams[team].find((id: string) => id !== s.actorId);
  const rival = s.teams[1 - team][0];
  return { s, team, mate, rival };
}

test('proverbs content: ~250 unique proverbs with 1–3 points, Moroccan ones marked with their meaning', () => {
  expect(PROVERBS.length).toBeGreaterThanOrEqual(240);
  expect(new Set(PROVERBS.map((p) => answerKey(p.text))).size).toBe(PROVERBS.length);
  for (const p of PROVERBS) {
    expect([1, 2, 3]).toContain(p.level);
    expect(p.text.trim()).toBe(p.text);
    expect(p.text.length).toBeLessThanOrEqual(45);
    if (p.ma) expect(p.meaning?.length).toBeGreaterThan(5);
    else expect(p.meaning).toBeUndefined();
  }
  for (const l of [1, 2, 3]) expect(PROVERBS.filter((p) => p.level === l).length).toBeGreaterThanOrEqual(30);
  const ma = PROVERBS.filter((p) => p.ma);
  expect(ma.length).toBeGreaterThanOrEqual(30);
  expect(ma.length).toBeLessThan(PROVERBS.length / 3); // mostly فصحى
  // none of the classic words
  const classic = new Set(CHARADES_ALL.map((w) => answerKey(w.word)));
  expect(PROVERBS.filter((p) => classic.has(answerKey(p.text)))).toEqual([]);
  // nothing religious to mime
  for (const p of PROVERBS) expect(p.text).not.toMatch(/قال الله|رسول الله|صلى الله|﴿|حديث/);
});

test('commands and rest cards: ~60 unique commands worth 1–3 points, rest cards with a known effect', () => {
  expect(COMMANDS.length).toBeGreaterThanOrEqual(60);
  expect(new Set(COMMANDS.map((c) => c.text)).size).toBe(COMMANDS.length);
  for (const c of COMMANDS) expect([1, 2, 3]).toContain(c.points);
  expect(REST_CARDS.length).toBeGreaterThanOrEqual(5);
  for (const r of REST_CARDS) {
    expect(['points', 'pass', 'freeSkip']).toContain(r.effect);
    expect(r.value).toBe(r.effect === 'points' ? r.value : 0);
    if (r.effect === 'points') expect(r.value).toBeGreaterThan(0);
  }
  expect(REST_CARDS.some((r) => r.effect === 'points')).toBe(true);
  expect(REST_CARDS.some((r) => r.effect !== 'points')).toBe(true);
});

test('proverbs pool: by difficulty, never empty; «خليط» stays the classic words', () => {
  expect(proverbPool(settings()).length).toBe(PROVERBS.length);
  expect(proverbPool(settings({ level: 'hard' })).every((p) => p.level === 3)).toBe(true);
  expect(proverbPool(settings({ level: 'easy' })).every((p) => p.level === 1)).toBe(true);
  expect(charadesPool({ ...CHARADES_DEFAULTS }).length).toBe(CHARADES_ALL.length);
});

test('proverbs: cards show their points, «صحيح» scores them; guessers never see the proverb', () => {
  rolls(0.99); // no special cards
  const ctx = fakeCtx();
  const { s, team, mate, rival } = startTurn(ctx);
  let total = 0;
  for (let i = 0; i < 8; i++) {
    const card = s.card;
    expect(card.kind).toBe('proverb');
    expect(card.points).toBe(card.level);
    expect(v(ctx, s, s.actorId).card?.points).toBe(card.points);
    expect(v(ctx, s, rival).card?.word).toBe(card.word);
    expect(v(ctx, s, mate).card).toBeNull();
    expect(JSON.stringify(v(ctx, s, mate))).not.toContain(card.word);
    if (card.ma) expect(card.meaning).toBeTruthy();
    total += card.points;
    charades.act(ctx, s, s.actorId, { type: 'ok', index: card.index });
  }
  expect(s.teamScores[team]).toBe(total);
  expect(v(ctx, s, mate).history.every((h) => h.word === null && h.kind === 'proverb')).toBe(true);
  // the voice counts the points won this turn
  expect(ctx.said.at(-1)).toContain(String(total));
  // a skip beyond the free ones still costs one point
  charades.act(ctx, s, s.actorId, { type: 'skip', index: s.card.index });
  charades.act(ctx, s, s.actorId, { type: 'skip', index: s.card.index });
  charades.act(ctx, s, s.actorId, { type: 'skip', index: s.card.index });
  expect(s.teamScores[team]).toBe(total - 1);
});

test('a command: everyone sees it, the clock stops, only the other team (or the host) judges; «نُفِّذ» scores its points', () => {
  rolls(0.01); // a command whenever allowed
  const ctx = fakeCtx();
  const { s, team, mate, rival } = startTurn(ctx);
  const card = s.card;
  expect(card.kind).toBe('command');
  expect([1, 2, 3]).toContain(card.points);
  expect(s.endsAt).toBeNull();
  const left = s.pausedLeft;
  expect(left).toBe(60_000);
  for (const id of [s.actorId, mate, rival, 'spectator']) expect(v(ctx, s, id).card?.word).toBe(card.word);
  expect(v(ctx, s, rival).canJudge).toBe(true);
  expect(v(ctx, s, mate).canJudge).toBe(false);
  expect(v(ctx, s, s.actorId).canJudge).toBe(false);
  expect(v(ctx, s, s.actorId).pausedLeft).toBe(left);
  // the actor can't skip or score it, the acting team can't judge it
  charades.act(ctx, s, s.actorId, { type: 'ok', index: card.index });
  charades.act(ctx, s, s.actorId, { type: 'skip', index: card.index });
  charades.act(ctx, s, mate, { type: 'judge', index: card.index, done: true });
  charades.act(ctx, s, s.actorId, { type: 'hostJudge', index: card.index, done: true });
  charades.act(ctx, s, rival, { type: 'judge', index: card.index - 1, done: true }); // stale
  expect(s.card.index).toBe(card.index);
  expect(s.teamScores[team]).toBe(0);
  ctx.now += 20_000; // a command takes its time: the turn clock waits
  expect(charades.tick!(ctx, s)).toBe(false);
  charades.act(ctx, s, rival, { type: 'judge', index: card.index, done: true });
  expect(s.teamScores[team]).toBe(card.points);
  expect(s.history.at(-1)).toEqual({ word: card.word, result: 'done', points: card.points, kind: 'command' });
  // the clock goes on with the time that was left, and never two special cards in a row
  expect(s.endsAt).toBe(ctx.now + left);
  expect(s.pausedLeft).toBeNull();
  expect(s.card.kind).toBe('proverb');
  // command texts are public in the history, proverbs hidden from the guessers while the turn runs
  charades.act(ctx, s, s.actorId, { type: 'ok', index: s.card.index });
  const hist = v(ctx, s, mate).history;
  expect(hist[0].word).toBe(card.word);
  expect(hist[1].word).toBeNull();
});

test('a command «لم يُنفَّذ» gives nothing; the host may judge too; ending the turn on a command is clean', () => {
  rolls(0.01);
  const ctx = fakeCtx();
  const { s, team } = startTurn(ctx);
  charades.act(ctx, s, 'host', { type: 'hostJudge', index: s.card.index, done: false });
  expect(s.history.at(-1).result).toBe('undone');
  expect(s.history.at(-1).points).toBe(0);
  expect(s.teamScores[team]).toBe(0);
  // after a proverb, a new command; the host ends the turn while it waits
  charades.act(ctx, s, s.actorId, { type: 'ok', index: s.card.index });
  expect(s.card.kind).toBe('command');
  charades.act(ctx, s, 'host', { type: 'endTurn' });
  expect(s.phase).toBe('turnEnd');
  expect(s.pausedLeft).toBeNull();
  expect(s.card).toBeNull();
});

function withRest(ctx: any, card: RestCard) {
  ctx.memo.set('charades:rest', new Deck([card]));
}

test('rest cards apply by themselves: free points, a free skip, or a pass; they go away after a moment', () => {
  rolls(COMMAND_CHANCE + 0.01); // a rest card whenever allowed
  const ctx = fakeCtx();
  withRest(ctx, { text: 'استراحة كبيرة: نقطتان مجانيتان لفريقك', effect: 'points', value: 2 });
  const { s, team, mate } = startTurn(ctx, { skips: 1 });
  expect(s.card.kind).toBe('rest');
  expect(s.teamScores[team]).toBe(2);
  expect(s.history).toEqual([{ word: s.card.word, result: 'rest', points: 2, kind: 'rest' }]);
  expect(v(ctx, s, mate).card?.kind).toBe('rest'); // for everyone
  expect(s.endsAt).toBeNull();
  // the actor can't «صحيح» a rest card; after REST_MS it moves on by itself
  charades.act(ctx, s, s.actorId, { type: 'ok', index: s.card.index });
  expect(s.teamScores[team]).toBe(2);
  ctx.now += REST_MS;
  expect(charades.tick!(ctx, s)).toBe(true);
  expect(s.card.kind).toBe('proverb');
  expect(s.endsAt).toBe(ctx.now + 60_000);

  // a free skip: one more skip without cost this turn
  const ctx2 = fakeCtx();
  withRest(ctx2, { text: 'هدية: تخطٍّ مجاني إضافي في هذا الدور', effect: 'freeSkip', value: 0 });
  const t2 = startTurn(ctx2, { skips: 1 });
  expect(v(ctx2, t2.s, t2.s.actorId).skipsLeft).toBe(2);
  expect(t2.s.teamScores).toEqual([0, 0]);
  charades.act(ctx2, t2.s, t2.s.actorId, { type: 'goOn', index: t2.s.card.index - 1 }); // stale
  expect(t2.s.card.kind).toBe('rest');
  rolls(0.99); // no more special cards
  charades.act(ctx2, t2.s, t2.s.actorId, { type: 'goOn', index: t2.s.card.index }); // early
  expect(t2.s.card.kind).toBe('proverb');
  charades.act(ctx2, t2.s, t2.s.actorId, { type: 'skip', index: t2.s.card.index });
  charades.act(ctx2, t2.s, t2.s.actorId, { type: 'skip', index: t2.s.card.index });
  expect(t2.s.teamScores[t2.team]).toBe(0);
  expect(t2.s.history.filter((h: any) => h.result === 'skip').length).toBe(2);

  // a pass: nothing changes
  rolls(COMMAND_CHANCE + 0.01);
  const ctx3 = fakeCtx();
  withRest(ctx3, { text: 'استراحة: تخطَّ هذه البطاقة وخذ نفَساً', effect: 'pass', value: 0 });
  const t3 = startTurn(ctx3);
  expect(t3.s.card.kind).toBe('rest');
  expect(t3.s.teamScores).toEqual([0, 0]);
  expect(v(ctx3, t3.s, t3.s.actorId).skipsLeft).toBe(2);
});

test('toggles: no commands / no rest cards; the classic categories never get special cards', () => {
  rolls(0.01);
  const noCmd = startTurn(fakeCtx(), { commands: false });
  expect(noCmd.s.card.kind).toBe('rest'); // the rest window starts at 0 without commands
  const none = startTurn(fakeCtx(), { commands: false, rest: false });
  for (let i = 0; i < 10; i++) {
    expect(none.s.card.kind).toBe('proverb');
    charades.act(fakeCtx(), none.s, none.s.actorId, { type: 'ok', index: none.s.card.index });
  }
  for (const category of ['mixed', 'animals'] as const) {
    const ctx = fakeCtx();
    const t = startTurn(ctx, { category });
    for (let i = 0; i < 10; i++) {
      expect(t.s.card.kind).toBe('word');
      expect(t.s.card.points).toBe(1);
      charades.act(ctx, t.s, t.s.actorId, { type: 'ok', index: t.s.card.index });
    }
    expect(t.s.teamScores[t.team]).toBe(10);
    expect(t.s.endsAt).not.toBeNull();
  }
  rolls(COMMAND_CHANCE + 0.01);
  const noRest = startTurn(fakeCtx(), { rest: false });
  expect(noRest.s.card.kind).toBe('proverb');
});

test('settings: the «أمثال وحكم» category and its two toggles are validated', () => {
  const s = settings({ category: 'mixed' });
  charades.patchSettings!(s, { category: 'proverbs', commands: false, rest: 'no' });
  expect(s.category).toBe('proverbs');
  expect(s.commands).toBe(false);
  expect(s.rest).toBe(true);
  charades.patchSettings!(s, { commands: 1, rest: false });
  expect(s.commands).toBe(false);
  expect(s.rest).toBe(false);
  charades.patchSettings!(s, { skips: CHARADES_FREE_SKIPS, category: 'proverbz' });
  expect(s.category).toBe('proverbs');
  expect(CHARADES_DEFAULTS.commands).toBe(true);
  expect(CHARADES_DEFAULTS.rest).toBe(true);
});

test('a full «أمثال وحكم» game with every kind of card reaches the final screen; scores add up', () => {
  const ctx = fakeCtx();
  const s: any = charades.start(ctx, PLAYERS, settings({ seconds: 45 }));
  charades.act(ctx, s, 'a', { type: 'begin' });
  let guard = 0;
  const expected: [number, number] = [0, 0];
  while (s.phase !== 'final' && guard++ < 50) {
    charades.act(ctx, s, s.actorId, { type: 'start' });
    ctx.now += COUNTDOWN_MS;
    charades.tick!(ctx, s);
    const team = (s.startTeam + s.turn) % 2;
    const rival = s.teams[1 - team][0];
    for (let i = 0; i < 12 && s.phase === 'play'; i++) {
      const c = s.card;
      if (c.kind === 'command') charades.act(ctx, s, rival, { type: 'judge', index: c.index, done: i % 2 === 0 });
      else if (c.kind === 'rest') charades.act(ctx, s, s.actorId, { type: 'goOn', index: c.index });
      else charades.act(ctx, s, s.actorId, { type: i % 4 === 3 ? 'skip' : 'ok', index: c.index });
    }
    ctx.now += 45_000;
    charades.tick!(ctx, s);
    // a command still waiting for its judges (or a rest card that just gave the clock back): the host ends the turn
    if (s.phase === 'play') charades.act(ctx, s, 'host', { type: 'endTurn' });
    expect(s.phase).toBe('turnEnd');
    expected[team] += s.history.reduce((n: number, h: any) => n + h.points, 0);
    charades.act(ctx, s, s.actorId, { type: 'next' });
  }
  expect(s.phase).toBe('final');
  expect(s.teamScores).toEqual(expected);
  expect(charades.result!(s)).not.toBeNull();
});
