/** «من هو؟» typed answers and «الدخيل» bot clues. */
import { expect, test } from 'bun:test';

import { IMPOSTER_CATEGORIES } from './content';
import { WHO } from './content-islamic';
import { imposter } from './games/imposter';
import { whoMatches, whois } from './games/whois';
import { traitCounts, traitPool } from './imposter-traits';

const fakeCtx = (): any => ({
  now: 0,
  fx: () => {},
  isConnected: () => true,
  isBot: () => false,
  playerName: (id: string) => id,
  memo: new Map(),
  bot: () => {},
});

test('whois typed: names, short forms, titles and slips match; other names do not', () => {
  expect(whoMatches('عمر', 'عمر بن الخطاب')).toBe(true);
  expect(whoMatches('ابو بكر', 'أبو بكر الصديق')).toBe(true);
  expect(whoMatches('سيدنا يوسف', 'يوسف')).toBe(true);
  expect(whoMatches('النبي إبراهيم', 'إبراهيم')).toBe(true);
  expect(whoMatches('المدينه', 'المدينة المنورة')).toBe(true);
  expect(whoMatches('حراء', 'غار حراء')).toBe(true);
  expect(whoMatches('ابن بطوطه', 'ابن بطوطة')).toBe(true);
  expect(whoMatches('صلاح الدين', 'صلاح الدين الأيوبي')).toBe(true);
  expect(whoMatches('سليمن', 'سليمان')).toBe(true); // a slip
  expect(whoMatches('يونس', 'يوسف')).toBe(false); // one letter off, but another prophet
  expect(whoMatches('موسى', 'عيسى')).toBe(false);
  expect(whoMatches('فاطمة', 'فاطمة الفهرية')).toBe(false);
  expect(whoMatches('', 'نوح')).toBe(false);
  // every entry accepts its own name
  for (const w of WHO) expect(whoMatches(w.name, w.name)).toBe(true);
});

test('whois typed: a miss locks you until the next clue; a right name scores for that clue', () => {
  const ctx = fakeCtx();
  const s: any = whois.start(ctx, ['a', 'b'], { rounds: 4, typed: true });
  const name = s.entries[0].name;
  const other = WHO.find((w) => w.cat === s.entries[0].cat && w.name !== name)!.name;
  expect((whois.view(ctx, s, 'a') as any).options).toEqual([]); // no options to pick from
  whois.act(ctx, s, 'a', { type: 'guess', text: other });
  expect((whois.view(ctx, s, 'a') as any).locked).toBe(true);
  whois.act(ctx, s, 'a', { type: 'guess', text: name }); // still clue 1: ignored
  expect(s.guesses.a).toBeUndefined();
  ctx.now += 7000;
  whois.tick!(ctx, s); // clue 2
  expect((whois.view(ctx, s, 'a') as any).locked).toBe(false);
  whois.act(ctx, s, 'a', { type: 'guess', text: name });
  expect(s.guesses.a.clue).toBe(2);
  whois.act(ctx, s, 'b', { type: 'guess', text: `سيدنا ${name}` });
  expect(s.phase).toBe('reveal');
  const res = Object.fromEntries(s.results.map((r: any) => [r.id, r]));
  expect(res.a.points).toBe(300);
  expect(res.b.points).toBe(300);
  expect(res.a.text).toBe(name);
  expect((whois.view(ctx, s, 'a') as any).answerName).toBe(name);
});

test('whois typed: the round ends once everyone has missed at the last clue', () => {
  const ctx = fakeCtx();
  const s: any = whois.start(ctx, ['a', 'b'], { rounds: 4, typed: true });
  for (let i = 0; i < 3; i++) {
    ctx.now += 7000;
    whois.tick!(ctx, s);
  }
  expect(s.shown).toBe(4);
  whois.act(ctx, s, 'a', { type: 'guess', text: 'لا أدري' });
  expect(s.phase).toBe('ask');
  whois.act(ctx, s, 'b', { type: 'guess', text: 'لا أعرف' });
  expect(s.phase).toBe('reveal');
  expect(s.results.find((r: any) => r.id === 'a').text).toBe('لا أدري');
});

test('whois: bots type names in typed mode, pick in options mode', () => {
  for (const typed of [true, false]) {
    const acts: any[] = [];
    const ctx = { ...fakeCtx(), isBot: () => true, bot: (_b: string, _k: string, _d: number, a: any) => acts.push(a) };
    const s: any = whois.start(ctx, ['b1', 'b2'], { rounds: 4, typed });
    for (let i = 0; i < 3; i++) {
      ctx.now += 7000;
      whois.tick!(ctx, s);
    }
    whois.botPlan!(ctx, s, ['b1', 'b2']);
    expect(acts.length).toBe(2);
    for (const a of acts) expect(typed ? typeof a.text : typeof a.choice).toBe(typed ? 'string' : 'number');
  }
});

test('imposter: bot clues are shared by several words, so they never give the word away', () => {
  for (const cat of IMPOSTER_CATEGORIES) {
    const counts = traitCounts(cat);
    for (const w of cat.words) {
      const pool = traitPool(cat, w, false);
      expect(pool.length).toBeGreaterThan(0);
      for (const t of pool) expect(counts.get(t)!).toBeGreaterThanOrEqual(3);
    }
    expect(traitPool(cat, '', true).length).toBeGreaterThanOrEqual(5);
  }
  // in a game: civilian bots' clues fit the word, none is the word itself
  for (let g = 0; g < 30; g++) {
    const s: any = imposter.start({ ...fakeCtx(), isBot: () => true }, ['b1', 'b2', 'b3', 'b4'], { category: 'animals', imposters: 1, rounds: 1, hintForImposter: false } as any);
    for (const [id, clue] of Object.entries(s.botClues) as [string, string][]) {
      expect(clue).not.toBe(s.word);
      if (!s.imposters.includes(id)) expect(traitPool(s.category, s.word, false)).toContain(clue);
    }
  }
});
