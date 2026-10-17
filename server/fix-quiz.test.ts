import { expect, test } from 'bun:test';

import { firstLetter } from '../src/shared/arabic';
import { QUESTIONS, WHO } from './content-islamic';
import { TRIVIA } from './content-trivia';
import { hajj, hajjOrder } from './games/hajj';
import { BY_LETTER, huroof } from './games/huroof';
import { ladders, laddersOrder } from './games/ladders';
import { quiz } from './games/quiz';
import { surah } from './games/surah';
import { trivia } from './games/trivia';
import { BOT_GO, whois } from './games/whois';
import { qdeck } from './qdeck';

const fakeCtx = (bot: (by: string, a: any, delay: number) => void = () => {}): any => ({
  now: 0,
  fx: () => {},
  isConnected: () => true,
  isBot: () => true,
  playerName: (id: string) => id,
  memo: new Map(),
  bot: (by: string, _k: string, d: number, a: any) => bot(by, a, d),
});

test('decks: two games in the same room never repeat a question until the pool is used up', () => {
  const ctx = fakeCtx();
  const pool = QUESTIONS.filter((q) => q.cat === 'quran').length;
  const seen = new Set<string>();
  let dealt = 0;
  while (dealt + 5 <= pool) {
    const s: any = quiz.start(ctx, ['a', 'b'], { rounds: 5, seconds: 10, category: 'quran' });
    for (const it of s.items) seen.add(it.text);
    dealt += 5;
    expect(seen.size).toBe(dealt);
  }
  // trivia and whois too
  const t1: any = trivia.start(ctx, ['a'], { rounds: 10, seconds: 10, category: 'all' });
  const t2: any = trivia.start(ctx, ['a'], { rounds: 10, seconds: 10, category: 'all' });
  expect(new Set([...t1.items, ...t2.items].map((i: any) => i.text)).size).toBe(20);
  const w1: any = whois.start(ctx, ['a'], { rounds: 10 });
  const w2: any = whois.start(ctx, ['a'], { rounds: 10 });
  expect(new Set([...w1.entries, ...w2.entries].map((e: any) => e.name)).size).toBe(20);
  // surah: no surah twice across two games of the same level until all were asked
  // (Juz' Amma has 37 surahs; one verse per surah per game, the surahs rotate between games)
  const s1: any = surah.start(ctx, ['a'], { rounds: 20, seconds: 20, level: 'easy' });
  const s2: any = surah.start(ctx, ['a'], { rounds: 17, seconds: 20, level: 'easy' });
  const surahsOf = (g: any) => g.items.map((i: any) => i.options[i.correct]);
  expect(new Set([...surahsOf(s1), ...surahsOf(s2)]).size).toBe(37);
  // a new room starts fresh
  expect(fakeCtx().memo.size).toBe(0);
  expect(TRIVIA.length).toBeGreaterThan(20);
});

test('decks: quiz, hajj and huroof each keep their own deck', () => {
  const ctx = fakeCtx();
  quiz.start(ctx, ['a', 'b'], { rounds: 5, seconds: 10, category: 'all' });
  const h: any = huroof.start(ctx, ['a', 'b'], { seconds: 15 });
  h.teams = { red: ['a'], green: ['b'] };
  h.turn = 'red';
  huroof.act(ctx, h, 'a', { type: 'pick', cell: 0 });
  const keys = [...ctx.memo.keys()];
  expect(keys).toContain('quiz:all');
  expect(keys.some((k) => k.startsWith('huroof:'))).toBe(true);
  // the deck helper deals distinct items and refills without repeating inside one deal
  const d = qdeck(ctx, 'x', [1, 2, 3, 4, 5]);
  expect(new Set(d.deal(3)).size).toBe(3);
  expect(new Set(d.deal(5)).size).toBe(5);
});

test('rounds are clamped to the size of the chosen pool', () => {
  const ctx = fakeCtx();
  const places = QUESTIONS.filter((q) => q.cat === 'places').length;
  const s: any = quiz.start(ctx, ['a'], { rounds: 30, seconds: 10, category: 'places' });
  expect(s.items.length).toBe(Math.min(30, places));
  expect((quiz.view(ctx, s, 'a') as any).rounds).toBe(s.items.length);
  const w: any = whois.start(ctx, ['a'], { rounds: 500 });
  expect(w.entries.length).toBe(WHO.length);
});

test('huroof: thin letters have enough questions, all starting with their letter', () => {
  for (const l of ['ج', 'ث', 'ذ', 'ظ', 'ش', 'و']) expect(BY_LETTER.get(l)!.length).toBeGreaterThanOrEqual(5);
  for (const [l, qs] of BY_LETTER) for (const q of qs) expect(firstLetter(q.a)).toBe(l);
  for (const q of QUESTIONS) expect(new Set([q.a, ...q.w]).size).toBe(4);
  // a question naming the Kaaba doesn't offer the Kaaba as an answer
  for (const q of QUESTIONS) if (q.q.includes('الكعبة')) expect(q.w).not.toContain('الكعبة');
});

test('huroof: a letter never repeats a question in one game; when it runs out the hexagon changes letter', () => {
  const ctx = fakeCtx();
  const s: any = huroof.start(ctx, ['a', 'b'], { seconds: 15 });
  s.teams = { red: ['a'], green: ['b'] };
  const letter = s.cells[0].letter;
  const n = BY_LETTER.get(letter)!.length;
  const asked = new Set<string>();
  for (let k = 0; k < n; k++) {
    expect(s.cells[0].letter).toBe(letter);
    huroof.act(ctx, s, s.turn === 'red' ? 'a' : 'b', { type: 'pick', cell: 0 });
    asked.add(s.question.text);
    ctx.now += 16000;
    huroof.tick!(ctx, s); // nobody buzzes
    expect(s.phase).toBe('pick');
  }
  expect(asked.size).toBe(n);
  // all its questions were asked: the hexagon now shows a letter that wasn't on the board
  const now = s.cells[0].letter;
  expect(now).not.toBe(letter);
  expect(s.cells.filter((c: any) => c.letter === now).length).toBe(1);
  expect(s.feed.list().at(-1).text).toContain('نفدت');
  huroof.act(ctx, s, s.turn === 'red' ? 'a' : 'b', { type: 'pick', cell: 0 });
  expect(firstLetter(s.question.answer)).toBe(now);
  expect(asked.has(s.question.text)).toBe(false);
});

test('huroof: the next game in the room starts with questions not asked last game', () => {
  const ctx = fakeCtx();
  const first: any = huroof.start(ctx, ['a', 'b'], { seconds: 15 });
  first.teams = { red: ['a'], green: ['b'] };
  first.cells[0].letter = 'ج';
  huroof.act(ctx, first, first.turn === 'red' ? 'a' : 'b', { type: 'pick', cell: 0 });
  const q1 = first.question.text;
  const second: any = huroof.start(ctx, ['a', 'b'], { seconds: 15 });
  second.teams = { red: ['a'], green: ['b'] };
  second.cells[0].letter = 'ج';
  huroof.act(ctx, second, second.turn === 'red' ? 'a' : 'b', { type: 'pick', cell: 0 });
  expect(second.question.text).not.toBe(q1);
});

test('surah bots are weaker on harder levels, and mcq bots mostly answer in the second half', () => {
  const rate: Record<string, number> = {};
  let late = 0, all = 0;
  for (const level of ['easy', 'medium', 'hard'] as const) {
    let right = 0, total = 0;
    const picks: { by: string; a: any; d: number }[] = [];
    const ctx = fakeCtx((by, a, d) => picks.push({ by, a, d }));
    const bots = Array.from({ length: 10 }, (_, i) => `b${i}`);
    for (let g = 0; g < 8; g++) {
      const s: any = surah.start(ctx, bots, { rounds: 30, seconds: 20, level });
      for (let r = 1; r <= s.items.length; r++) {
        s.round = r;
        s.answers = {};
        picks.length = 0;
        surah.botPlan!(ctx, s, bots);
        for (const p of picks) {
          total++;
          if (p.a.choice === s.items[r - 1].correct) right++;
          all++;
          if (p.d >= 10000) late++;
        }
      }
    }
    rate[level] = right / total;
  }
  expect(Math.abs(rate.easy - 0.7)).toBeLessThan(0.06);
  expect(Math.abs(rate.medium - 0.55)).toBeLessThan(0.06);
  expect(Math.abs(rate.hard - 0.4)).toBeLessThan(0.06);
  expect(late / all).toBeGreaterThan(0.6);
});

test('whois bots rarely guess at the first clue', () => {
  let guessed = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    let got = false;
    const ctx = fakeCtx(() => (got = true));
    const s: any = whois.start(ctx, ['b'], { rounds: 4 });
    whois.botPlan!(ctx, s, ['b']);
    whois.botPlan!(ctx, s, ['b']); // a second call in the same clue doesn't roll again
    if (got) guessed++;
  }
  expect(Math.abs(guessed / n - BOT_GO[0])).toBeLessThan(0.04);
  // at the last clue every bot guesses
  const ctx = fakeCtx();
  const s: any = whois.start(ctx, ['b'], { rounds: 4 });
  let got = false;
  ctx.bot = () => (got = true);
  for (let k = 0; k < 3; k++) {
    ctx.now += 7001;
    whois.tick!(ctx, s);
  }
  expect(s.shown).toBe(4);
  whois.botPlan!(ctx, s, ['b']);
  expect(got).toBe(true);
});

test('mcq: no shared sound on reveal; the sole winner is the target of the win sound', () => {
  const fx: [string, string | undefined][] = [];
  const ctx = fakeCtx();
  ctx.fx = (k: string, t?: string) => fx.push([k, t]);
  const s: any = quiz.start(ctx, ['a', 'b'], { rounds: 5, seconds: 10, category: 'all' });
  for (let r = 0; r < s.items.length; r++) {
    quiz.act(ctx, s, 'a', { type: 'answer', choice: s.items[r].correct });
    quiz.act(ctx, s, 'b', { type: 'answer', choice: (s.items[r].correct + 1) % 4 });
    expect(s.phase).toBe('reveal');
    expect(s.endsAt - ctx.now).toBe(7000);
    ctx.now += 7000;
    quiz.tick!(ctx, s);
  }
  expect(s.phase).toBe('final');
  expect(fx.some(([k]) => k === 'correct' || k === 'buzz')).toBe(false);
  expect(fx.find(([k]) => k === 'win')).toEqual(['win', 'a']);
});

test('ladders and hajj: final standings by position, ties by who got there first', () => {
  const ctx = fakeCtx();
  const l: any = ladders.start(ctx, ['a', 'b', 'c', 'd'], { exact: false });
  l.players = [
    { id: 'a', pos: 40, since: 5 },
    { id: 'b', pos: 100, since: 9 },
    { id: 'c', pos: 40, since: 2 },
    { id: 'd', pos: 12, since: 1 },
  ];
  expect(laddersOrder(l)).toEqual(['b', 'c', 'a', 'd']);
  l.phase = 'final';
  expect((ladders.view(ctx, l, 'a') as any).order).toEqual(['b', 'c', 'a', 'd']);

  // a real race records who reached a square first
  const fx: [string, string | undefined][] = [];
  const h: any = hajj.start(ctx, ['a', 'b', 'c'], { questions: false });
  ctx.fx = (k: string, t?: string) => fx.push([k, t]);
  for (let k = 0; k < 4000 && h.phase !== 'final'; k++) {
    const queued: any[] = [];
    ctx.bot = (by: string, _k: string, _d: number, a: any) => queued.push({ by, a });
    hajj.botPlan!(ctx, h, ['a', 'b', 'c']);
    for (const x of queued) {
      try {
        hajj.act(ctx, h, x.by, x.a);
      } catch {}
    }
    if (!queued.length) {
      ctx.now += 3000;
      hajj.tick!(ctx, h);
    }
  }
  expect(h.phase).toBe('final');
  const order = (hajj.view(ctx, h, 'a') as any).order as string[];
  expect(order[0]).toBe(h.winner);
  expect(order).toEqual(hajjOrder(h));
  const pos = order.map((id) => h.players.find((p: any) => p.id === id));
  for (let i = 1; i < pos.length; i++) {
    expect(pos[i - 1].pos).toBeGreaterThanOrEqual(pos[i].pos);
    if (pos[i - 1].pos === pos[i].pos) expect(pos[i - 1].since).toBeLessThanOrEqual(pos[i].since);
  }
  expect(fx.find(([k]) => k === 'win')).toEqual(['win', h.winner]);
});

test('hajj: the station quiz answer stays up 5 s when people are playing', () => {
  const ctx = fakeCtx();
  ctx.isBot = (id: string) => id !== 'me';
  const s: any = hajj.start(ctx, ['me', 'bot'], { questions: true });
  const p = s.players[s.turnIdx];
  p.pos = 3;
  const roll = Math.random;
  Math.random = () => 0; // the die shows 1: onto the first station
  hajj.act(ctx, s, p.id, { type: 'roll' });
  Math.random = roll;
  expect(s.phase).toBe('quiz');
  hajj.act(ctx, s, 'me', { type: 'quiz', choice: 0 });
  hajj.act(ctx, s, 'bot', { type: 'quiz', choice: 1 });
  expect(s.quiz.revealed).toBe(true);
  expect(s.quiz.endsAt - ctx.now).toBe(5000);
});
