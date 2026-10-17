/** «اسم ولد اسم بنت»: the Arabic dictionary check. */
import { expect, test } from 'bun:test';

import { NAMES_DICT } from './bot-content';
import { knownWord } from './dictionary';
import { names } from './games/names';

const fakeCtx = (bots: string[] = []): any => ({
  now: 0,
  fx: () => {},
  isConnected: () => true,
  isBot: (id: string) => bots.includes(id),
  playerName: (id: string) => id,
  memo: new Map(),
  bot: () => {},
});

test('dictionary: real words, names and places are known; gibberish and typos are not', () => {
  for (const [w, cat] of [
    ['زرافة', 'animal'], ['الأسد', 'animal'], ['سمك القرش', 'animal'], ['قنفذ', 'animal'],
    ['تفاح', 'plant'], ['خرشوف', 'plant'], ['كرسي', 'thing'], ['ثلاجة', 'thing'],
    ['إدريس', 'boy'], ['عبد الصمد', 'boy'], ['عبدالصمد', 'boy'], ['غيثة', 'girl'],
    ['الدار البيضاء', 'country'], ['زمبابوي', 'country'], ['مراكش', 'country'], ['سباك', 'job'], ['نجّار', 'job'],
  ])
    expect([w, knownWord(w, cat)]).toEqual([w, true]);
  for (const w of ['كخبتر', 'زززز', 'ببببب', 'قلمم', 'سشيبلا', 'تتتت', 'ممم', 'ههههه', 'ما', 'من', 'هذا', 'في'])
    expect([w, knownWord(w, 'thing')]).toEqual([w, false]);
  expect(knownWord('', 'boy')).toBe(false);
});

test('dictionary: every bot answer is known', () => {
  for (const [cat, byLetter] of Object.entries(NAMES_DICT))
    for (const w of Object.values(byLetter).flat()) expect([cat, w, knownWord(w, cat)]).toEqual([cat, w, true]);
});

function play(dict: 'off' | 'warn' | 'strict', players: string[], bots: string[] = []) {
  const ctx = fakeCtx(bots);
  const s: any = names.start(ctx, players, { rounds: 1, seconds: 60, stop: false, dict });
  s.letter = 'ك';
  ctx.now += 4000;
  names.tick!(ctx, s); // write
  return { ctx, s };
}

test('names strict: an unknown word shows while writing and is wrong unless most others keep it', () => {
  const { ctx, s } = play('strict', ['a', 'b', 'c']);
  names.act(ctx, s, 'a', { type: 'answer', cat: 'thing', text: 'كخبتر' });
  names.act(ctx, s, 'a', { type: 'answer', cat: 'animal', text: 'كلب' });
  names.act(ctx, s, 'b', { type: 'answer', cat: 'thing', text: 'كرسي' });
  const w: any = names.view(ctx, s, 'a');
  expect(w.myUnknown).toEqual(['thing']);
  expect(w.dict).toBe('strict');
  for (const p of ['a', 'b', 'c']) names.act(ctx, s, p, { type: 'stop' });
  ctx.now += 4000;
  names.tick!(ctx, s); // stopping → review
  expect(s.phase).toBe('review');
  let v: any = names.view(ctx, s, 'b');
  expect(v.board.a.thing.verdict).toBe('unknown');
  expect(v.board.a.thing.unknown).toBe(true);
  expect(v.board.a.animal.verdict).toBe('ok');
  names.act(ctx, s, 'a', { type: 'keep', player: 'a', cat: 'thing' }); // not your own
  names.act(ctx, s, 'b', { type: 'keep', player: 'a', cat: 'thing' }); // 1 of 2: not a majority
  expect((names.view(ctx, s, 'b') as any).board.a.thing.verdict).toBe('unknown');
  names.act(ctx, s, 'c', { type: 'keep', player: 'a', cat: 'thing' }); // 2 of 2
  v = names.view(ctx, s, 'b');
  expect(v.board.a.thing.verdict).toBe('ok');
  expect(v.board.a.thing.keeps.sort()).toEqual(['b', 'c']);
  names.act(ctx, s, 'a', { type: 'score' });
  expect(s.cellPoints['a|thing']).toBe(10);
});

test('names warn: unknown words are marked but count; off: no marks', () => {
  for (const dict of ['warn', 'off'] as const) {
    const { ctx, s } = play(dict, ['a', 'b']);
    names.act(ctx, s, 'a', { type: 'answer', cat: 'thing', text: 'كخبتر' });
    expect((names.view(ctx, s, 'a') as any).myUnknown).toEqual(dict === 'warn' ? ['thing'] : []);
    for (const p of ['a', 'b']) names.act(ctx, s, p, { type: 'stop' });
    ctx.now += 4000;
    names.tick!(ctx, s);
    const cell = (names.view(ctx, s, 'b') as any).board.a.thing;
    expect(cell.verdict).toBe('ok');
    expect(cell.unknown).toBe(dict === 'warn');
  }
});

test('names strict with bots only around: an unknown word stays wrong (nobody to keep it)', () => {
  const { ctx, s } = play('strict', ['a', 'bot1'], ['bot1']);
  names.act(ctx, s, 'a', { type: 'answer', cat: 'thing', text: 'كخبتر' });
  names.act(ctx, s, 'a', { type: 'stop' });
  ctx.now += 4000;
  names.tick!(ctx, s);
  expect((names.view(ctx, s, 'a') as any).board.a.thing.verdict).toBe('unknown');
});
