/** «أسماء الله الحسنى» — the 99 Names, the match race, the memory pairs, bots and leaving. */
import { expect, test } from 'bun:test';

import type { AsmaMatchView, AsmaMemoryView, AsmaSettings } from '../src/shared/games/asma';
import { ASMA_NAMES } from './asma-content';
import { asma, asmaDistractors, asmaItem, memoryBotPick, memoryNames } from './games/asma';

type Job = { at: number; by: string; a: any };

function fakeRoom(bots: string[] = [], fx: string[] = []) {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const ctx: any = {
    now: 1000,
    fx: (k: string, t?: string) => fx.push(t ? `${k}:${t}` : k),
    isConnected: () => true,
    isBot: (id: string) => bots.includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => {
      if (keys.has(`${by}:${key}`)) return;
      keys.add(`${by}:${key}`);
      jobs.push({ at: ctx.now + delay, by, a });
    },
  };
  const run = (s: any, done: () => boolean, limitMs = 3_600_000) => {
    const end = ctx.now + limitMs;
    while (!done() && ctx.now < end) {
      asma.botPlan!(ctx, s, bots);
      for (const j of jobs.filter((x) => x.at <= ctx.now)) {
        jobs.splice(jobs.indexOf(j), 1);
        asma.act(ctx, s, j.by, j.a);
      }
      asma.tick!(ctx, s);
      ctx.now += 250;
    }
  };
  return { ctx, run };
}

const settings = (p: Partial<AsmaSettings> = {}): AsmaSettings => ({ mode: 'match', rounds: 10, seconds: 15, dir: 'name', pairs: 8, ...p });
const bare = (t: string) => t.replace(/[ً-ْٰ]/g, '');

test('asma: the 99 Names of the Tirmidhi list, no duplicates, with meanings', () => {
  expect(ASMA_NAMES.length).toBe(99);
  expect(new Set(ASMA_NAMES.map((x) => bare(x.name))).size).toBe(99);
  expect(new Set(ASMA_NAMES.map((x) => x.meaning)).size).toBe(99);
  expect(new Set(ASMA_NAMES.map((x) => x.short)).size).toBe(99);
  expect(ASMA_NAMES[0].name).toBe('اللَّه');
  expect(ASMA_NAMES[1].name).toBe('الرَّحْمَن');
  expect(ASMA_NAMES[98].name).toBe('الصَّبُور');
  // careful spellings
  const names = ASMA_NAMES.map((x) => x.name);
  for (const want of ['المُهَيْمِن', 'القَيُّوم', 'المُؤْمِن', 'البَارِئ', 'المُبْدِئ', 'المُحْيِي', 'الرَّؤُوف', 'مَالِكُ المُلْك', 'ذُو الجَلَالِ وَالإِكْرَام']) {
    expect(names).toContain(want);
  }
  // the order of the list (a few anchors)
  const at = (b: string) => ASMA_NAMES.findIndex((x) => bare(x.name) === b);
  expect(at('القدوس')).toBe(4);
  expect(at('الواجد')).toBe(64);
  expect(at('الأول')).toBe(72);
  expect(at('مالك الملك')).toBe(83);
  for (const x of ASMA_NAMES) {
    expect(x.meaning.length).toBeGreaterThan(8);
    expect(x.short.length).toBeLessThanOrEqual(26); // fits on a memory card
    expect(x.name.startsWith('ال') || x.name.startsWith('مَالِك') || x.name.startsWith('ذُو')).toBe(true);
  }
});

test('asma: options are distinct and never offer a name with a close meaning as a wrong answer', () => {
  for (let i = 0; i < ASMA_NAMES.length; i++) {
    const wrong = asmaDistractors(ASMA_NAMES[i]);
    expect(wrong.length).toBe(3);
    for (const w of wrong) expect(w.group).not.toBe(ASMA_NAMES[i].group);
    for (const shows of ['name', 'meaning'] as const) {
      const it = asmaItem(i, shows);
      expect(new Set(it.options).size).toBe(4);
      expect(it.options[it.correct]).toBe(shows === 'name' ? ASMA_NAMES[i].meaning : ASMA_NAMES[i].name);
      expect(it.text).toBe(shows === 'name' ? ASMA_NAMES[i].name : ASMA_NAMES[i].meaning);
    }
  }
});

test('asma match: a round — answers, reveal with the meaning, speed points', () => {
  const { ctx } = fakeRoom();
  const s = asma.start(ctx, ['a', 'b'], settings({ dir: 'mix', rounds: 6 })) as any;
  expect(s.mode).toBe('match');
  expect(s.m.items.length).toBe(6);
  expect(s.m.items.map((i: any) => i.shows)).toEqual(['name', 'meaning', 'name', 'meaning', 'name', 'meaning']);
  let v = asma.view(ctx, s, 'a') as AsmaMatchView;
  expect(v.mode).toBe('match');
  expect(v.answer).toBeNull();
  expect(asma.turnOf!(s)).toEqual(['a', 'b']);
  const right = s.m.items[0].correct;
  asma.act(ctx, s, 'a', { type: 'answer', choice: right });
  ctx.now += 3000;
  asma.act(ctx, s, 'b', { type: 'answer', choice: (right + 1) % 4 });
  v = asma.view(ctx, s, 'b') as AsmaMatchView;
  expect(v.phase).toBe('reveal');
  expect(v.correct).toBe(right);
  expect(v.answer?.name).toBe(v.prompt);
  expect(s.m.scores.a).toBeGreaterThan(900);
  expect(s.m.scores.b).toBe(0);
});

test('asma memory: a name with its own meaning is a pair (play again), otherwise the turn passes', () => {
  const fx: string[] = [];
  const { ctx } = fakeRoom([], fx);
  const s = asma.start(ctx, ['a', 'b'], settings({ mode: 'memory', pairs: 6 })) as any;
  expect(s.mode).toBe('memory');
  const g = s.g;
  expect(g.deck.length).toBe(12);
  // never two names of the same group on one table
  const groups = new Set(g.deck.map((c: any) => ASMA_NAMES[c.idx].group));
  expect(groups.size).toBe(6);
  const first = g.order[0];
  const other = g.order[1];
  expect(asma.turnOf!(s)).toEqual([first]);
  expect(() => asma.act(ctx, s, other, { type: 'flip', card: 0 })).toThrow('ليس دورك');
  // find a matching pair and a non-matching one
  const mate = (i: number) => g.deck.findIndex((c: any, j: number) => j !== i && c.idx === g.deck[i].idx);
  const m0 = mate(0);
  asma.act(ctx, s, first, { type: 'flip', card: 0 });
  let v = asma.view(ctx, s, other) as AsmaMemoryView;
  expect(v.cards[0]).not.toBeNull();
  expect(v.cards.filter(Boolean).length).toBe(1);
  asma.act(ctx, s, first, { type: 'flip', card: m0 });
  expect(g.pairs[first]).toBe(1);
  expect(g.owners[0]).toBe(first);
  expect(asma.turnOf!(s)).toEqual([first]); // plays again
  v = asma.view(ctx, s, other) as AsmaMemoryView;
  expect(v.last?.name).toBe(ASMA_NAMES[g.deck[0].idx].name);
  expect(v.last?.meaning).toBe(ASMA_NAMES[g.deck[0].idx].meaning);
  // a miss: two cards from different names
  const x = g.deck.findIndex((_: any, i: number) => !g.owners[i]);
  const y = g.deck.findIndex((c: any, i: number) => !g.owners[i] && c.idx !== g.deck[x].idx);
  asma.act(ctx, s, first, { type: 'flip', card: x });
  asma.act(ctx, s, first, { type: 'flip', card: y });
  expect(asma.view(ctx, s, first)).toMatchObject({ peek: true });
  expect(asma.turnOf!(s)).toEqual([]);
  asma.act(ctx, s, first, { type: 'flip', card: 5 }); // ignored while peeking
  expect(g.flipped.length).toBe(2);
  ctx.now += 3000;
  asma.tick!(ctx, s);
  expect(asma.turnOf!(s)).toEqual([other]);
  expect(g.flipped).toEqual([]);
});

test('asma memory: two cards of the same side never make a pair', () => {
  const { ctx } = fakeRoom();
  const s = asma.start(ctx, ['a'], settings({ mode: 'memory', pairs: 6 })) as any;
  // force a table where two name cards are side by side
  s.g.deck = [
    { idx: 1, kind: 'name' },
    { idx: 1, kind: 'name' },
  ];
  s.g.owners = [null, null];
  asma.act(ctx, s, 'a', { type: 'flip', card: 0 });
  asma.act(ctx, s, 'a', { type: 'flip', card: 1 });
  expect(s.g.pairs.a).toBe(0);
  expect(s.g.peekUntil).not.toBeNull();
});

test('asma memory: a bot with a perfect memory takes the pairs it has seen', () => {
  const { ctx } = fakeRoom();
  const s = asma.start(ctx, ['a'], settings({ mode: 'memory', pairs: 6 })) as any;
  const g = s.g;
  const mate = g.deck.findIndex((c: any, j: number) => j !== 0 && c.idx === g.deck[0].idx);
  g.seen = [0, mate];
  expect([0, mate]).toContain(memoryBotPick(g, () => true));
  g.flipped = [0];
  expect(memoryBotPick(g, () => true)).toBe(mate);
  // nothing remembered: an unseen card
  g.flipped = [];
  const pick = memoryBotPick(g, () => false);
  expect(g.seen).not.toContain(pick);
});

test('asma: full bot-only games reach the final in both modes', () => {
  for (const mode of ['match', 'memory'] as const) {
    for (const players of [['b1'], ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']]) {
      const fx: string[] = [];
      const { ctx, run } = fakeRoom(players, fx);
      const s = asma.start(ctx, players, settings({ mode, pairs: 10, rounds: 8, seconds: 10, dir: 'mix' })) as any;
      run(s, () => (s.mode === 'match' ? s.m.phase : s.phase) === 'final');
      if (mode === 'match') {
        expect(s.m.phase).toBe('final');
        expect(s.m.round).toBe(8);
      } else {
        expect(s.phase).toBe('final');
        expect(s.g.owners.every(Boolean)).toBe(true);
        expect(Object.values(s.g.pairs as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(10);
        const v = asma.view(ctx, s, players[0]) as AsmaMemoryView;
        expect(v.winner!.length).toBeGreaterThan(0);
        expect(v.cards.every(Boolean)).toBe(true);
      }
      expect(fx.filter((f) => f.startsWith('win')).length).toBe(1);
    }
  }
});

test('asma memory: tables use different names from game to game', () => {
  const { ctx } = fakeRoom();
  const a = memoryNames(ctx, 10);
  const b = memoryNames(ctx, 10);
  expect(new Set(a).size).toBe(10);
  expect(a.filter((i) => b.includes(i)).length).toBeLessThan(5);
});

test('asma memory: a leaver is skipped; the last one leaving ends the game', () => {
  const { ctx } = fakeRoom();
  const s = asma.start(ctx, ['a', 'b', 'c'], settings({ mode: 'memory' })) as any;
  const [p0, p1, p2] = s.g.order;
  asma.act(ctx, s, p0, { type: 'flip', card: 0 });
  asma.onLeave!(ctx, s, p0);
  expect(s.g.order).toEqual([p1, p2]);
  expect(s.g.flipped).toEqual([]);
  expect(asma.turnOf!(s)).toEqual([p1]);
  asma.onLeave!(ctx, s, p2);
  expect(asma.turnOf!(s)).toEqual([p1]);
  asma.onLeave!(ctx, s, p1);
  expect(s.phase).toBe('final');
});

test('asma match: a leaver does not block the round', () => {
  const { ctx } = fakeRoom();
  const s = asma.start(ctx, ['a', 'b'], settings()) as any;
  asma.act(ctx, s, 'a', { type: 'answer', choice: 0 });
  ctx.isConnected = (id: string) => id !== 'b';
  asma.onLeave!(ctx, s, 'b');
  expect(s.m.phase).toBe('reveal');
});

test('asma: settings are validated', () => {
  const st = settings();
  asma.patchSettings!(st, { mode: 'memory', pairs: 7, rounds: 1, seconds: 100, dir: 'meaning' });
  expect(st).toEqual({ mode: 'memory', rounds: 5, seconds: 40, dir: 'meaning', pairs: 8 });
  asma.patchSettings!(st, { mode: 'x', pairs: 10, dir: 'y' });
  expect(st.mode).toBe('memory');
  expect(st.pairs).toBe(10);
  expect(st.dir).toBe('meaning');
});

test('asma memory: a pair and a miss are announced; the found pair stays turned until the next flip', () => {
  const { ctx } = fakeRoom();
  const said: { text: string; by?: string }[] = [];
  ctx.say = (text: string, by?: string) => said.push({ text, by });
  const s = asma.start(ctx, ['a', 'b'], settings({ mode: 'memory', pairs: 6 })) as any;
  const g = s.g;
  const p = g.order[0];
  const mate = g.deck.findIndex((c: any, j: number) => j !== 0 && c.idx === g.deck[0].idx);
  asma.act(ctx, s, p, { type: 'flip', card: 0 });
  asma.act(ctx, s, p, { type: 'flip', card: mate });
  expect(said.at(-1)!.by).toBe(p);
  expect(said.at(-1)!.text).toContain(ASMA_NAMES[g.deck[0].idx].name);
  expect((asma.view(ctx, s, p) as AsmaMemoryView).flipped).toEqual([0, mate]);
  const x = g.deck.findIndex((_: any, i: number) => !g.owners[i]);
  const y = g.deck.findIndex((c: any, i: number) => !g.owners[i] && c.idx !== g.deck[x].idx);
  asma.act(ctx, s, p, { type: 'flip', card: x });
  expect(g.flipped).toEqual([x]);
  asma.act(ctx, s, p, { type: 'flip', card: y });
  expect(said.at(-1)!.text).toContain('غير متطابقتين');
});
