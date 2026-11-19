/**
 * «من الأرجح؟» — the content (220+ kind prompts in every theme), the deal (no repeat in a room until the
 * theme runs low), the vote (changes, early end, timer, people away), the count (ties, scattered votes),
 * no leak of who voted for whom (before the reveal, and never with «تصويت سري»), bots (timing, the bias
 * toward similar earlier prompts and the favourite, blind to the current votes), leaving, settings, titles.
 */
import { expect, test } from 'bun:test';

import { ARJAH_DEFAULTS, ARJAH_THEMES, arjahQuestion, arjahTop, votesWord, type ArjahSettings, type ArjahView } from '../src/shared/games/arjah';
import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { ARJAH_BOT, botDelay, botVote, botWeights, dealPrompts, favourite, type ArjahPast } from './arjah-bots';
import { ARJAH_PROMPTS, themePrompts } from './arjah-content';
import { ARJAH_REVEAL_MS, arjah, countVotes, sanitizeArjah, startArjah, titlesOf, type ArjahState } from './games/arjah';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';

const P = ['a', 'b', 'c', 'd'];
const view = (ctx: TestCtx, s: ArjahState, me: string) => arjah.view(ctx, s, me) as ArjahView;
const vote = (ctx: TestCtx, s: ArjahState, by: string, target: string) => arjah.act(ctx, s, by, { type: 'vote', round: s.round + 1, target });

function start(ctx: TestCtx, opts: Partial<ArjahSettings> = {}, ids = P, seed = 1) {
  return startArjah(ctx, ids, { ...ARJAH_DEFAULTS, ...opts }, seeded(seed));
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('arjah content: 220+ prompts, every theme deep enough for 15 rounds, unique, well formed', () => {
  expect(ARJAH_PROMPTS.length).toBeGreaterThanOrEqual(220);
  expect(new Set(ARJAH_PROMPTS.map((p) => p.id)).size).toBe(ARJAH_PROMPTS.length);
  expect(new Set(ARJAH_PROMPTS.map((p) => p.clause)).size).toBe(ARJAH_PROMPTS.length);
  for (const t of ARJAH_THEMES) expect(themePrompts(t).length).toBeGreaterThanOrEqual(25);
  for (const p of ARJAH_PROMPTS) {
    expect(p.tag).toMatch(/^[a-z]+$/);
    expect(p.clause.trim()).toBe(p.clause);
    // a present-tense verb in the third person: «ينام…»، «يُخرج…» (never a player's name or «أنت»)
    expect(p.clause).toMatch(/^يُ?[ء-ي]/);
    expect(p.clause).not.toMatch(/[A-Za-z0-9?]|؟$/);
    expect(arjahQuestion(p.clause)).toBe(`من الأرجح أن ${p.clause}؟`);
  }
});

test('arjah content: warm and kind — no looks, body, romance, haram or insults', () => {
  const banned = [
    'سمين', 'بدين', 'نحيف', 'وزن', 'قبيح', 'بشع', 'أصلع', 'طويل القامة', 'قصير القامة', 'شكله', 'وجهه',
    'حبيب', 'غرام', 'عشق', 'يتزوج', 'زواج', 'عريس', 'عروس', 'خطيب', 'قبلة',
    'يرقص', 'رقص', 'يغني', 'أغنية', 'موسيقى', 'خمر', 'تدخين', 'سيجارة', 'قمار', 'رهان',
    'يكذب', 'كذب', 'يسرق', 'يغش', 'غبي', 'أحمق', 'كسول', 'بخيل', 'يفطر عمداً', 'شجار', 'يضرب',
  ];
  for (const p of ARJAH_PROMPTS) for (const w of banned) expect(`${p.id}: ${p.clause}`).not.toContain(w);
});

/* ------------------------------------------------------------------ */
/* Deal                                                                */
/* ------------------------------------------------------------------ */

test('arjah deal: no repeat in a room until the theme runs low, never twice in one game', () => {
  const seen = new Set<string>();
  const rnd = seeded(3);
  const g1 = dealPrompts('food', 15, rnd, seen);
  const g2 = dealPrompts('food', 15, rnd, seen);
  expect(new Set([...g1, ...g2].map((p) => p.id)).size).toBe(30);
  // the theme ran low: the third game starts it over, still without a repeat inside the game
  const g3 = dealPrompts('food', 15, rnd, seen);
  expect(new Set(g3.map((p) => p.id)).size).toBe(15);
  for (const p of [...g1, ...g2, ...g3]) expect(p.theme).toBe('food');
  // «منوّع»: many games in a row before anything comes back
  const mix = new Set<string>();
  const ids: string[] = [];
  for (let g = 0; g < 16; g++) for (const p of dealPrompts('mix', 15, rnd, mix)) ids.push(p.id);
  expect(new Set(ids).size).toBe(240);
});

test('arjah deal: «منوّع» changes theme from one prompt to the next', () => {
  const list = dealPrompts('mix', 15, seeded(5), new Set());
  expect(new Set(list.slice(0, 8).map((p) => p.theme)).size).toBe(8);
  for (let i = 1; i < list.length; i++) expect(list[i].theme).not.toBe(list[i - 1].theme);
});

test('arjah: the room remembers its prompts between games', () => {
  const ctx = fakeCtx();
  const s1 = start(ctx, { theme: 'travel', rounds: 15 });
  const s2 = start(ctx, { theme: 'travel', rounds: 15 });
  expect(new Set([...s1.prompts, ...s2.prompts].map((p) => p.id)).size).toBe(30);
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

test('arjah settings: defaults, sanitised at start, validated in the lobby', () => {
  expect(DEFAULT_SETTINGS.arjah).toEqual({ rounds: 12, seconds: 20, theme: 'mix', secret: true });
  expect(sanitizeArjah({ rounds: 99, seconds: 3, theme: 'nope' as never, secret: 'yes' as never })).toEqual({ rounds: 15, seconds: 20, theme: 'mix', secret: true });
  expect(sanitizeArjah(undefined)).toEqual(ARJAH_DEFAULTS);
  const st = { ...ARJAH_DEFAULTS };
  arjah.patchSettings!(st, { rounds: 8, seconds: 30, theme: 'ramadan', secret: false });
  expect(st).toEqual({ rounds: 8, seconds: 30, theme: 'ramadan', secret: false });
  arjah.patchSettings!(st, { rounds: 'x', theme: 'bad', secret: 1 });
  expect(st).toEqual({ rounds: 8, seconds: 30, theme: 'ramadan', secret: false });
  const s = start(fakeCtx(), { rounds: 8 });
  expect(s.prompts.length).toBe(8);
  expect(s.endsAt! - fakeCtx().now).toBe(20_000);
});

/* ------------------------------------------------------------------ */
/* Votes and the count                                                 */
/* ------------------------------------------------------------------ */

test('arjah count: the most chosen take the title, ties all count, scattered votes give nothing', () => {
  expect(arjahTop({ a: 2, b: 1, c: 0 })).toEqual(['a']);
  expect(arjahTop({ a: 2, b: 2, c: 0 })).toEqual(['a', 'b']);
  expect(arjahTop({ a: 1, b: 1, c: 1 })).toEqual([]);
  expect(arjahTop({ a: 0, b: 0 })).toEqual([]);
  const r = countVotes(P, { a: 'b', b: 'b', c: 'a', d: 'a' });
  expect(r.tally).toEqual({ a: 2, b: 2, c: 0, d: 0 });
  expect(r.top).toEqual(['a', 'b']);
  expect(r.matched).toEqual(['a', 'b', 'c', 'd']);
  expect(r.voters).toEqual({ a: ['c', 'd'], b: ['a', 'b'], c: [], d: [] });
  // a vote for oneself counts like any other
  const self = countVotes(P, { a: 'a', b: 'a', c: 'a', d: 'c' });
  expect(self.top).toEqual(['a']);
  expect(self.matched).toEqual(['a', 'b', 'c']);
  expect(votesWord(0)).toBe('بلا أصوات');
  expect(votesWord(2)).toBe('صوتان');
  expect(votesWord(3)).toBe('3 أصوات');
  expect(votesWord(11)).toBe('11 صوتاً');
});

test('arjah vote: a pick can change while the vote is open; the last vote ends the round; points', () => {
  const ctx = fakeCtx();
  const s = start(ctx, { secret: false });
  vote(ctx, s, 'a', 'c');
  vote(ctx, s, 'a', 'b'); // changed
  vote(ctx, s, 'b', 'b');
  vote(ctx, s, 'c', 'zz'); // not at the table
  vote(ctx, s, 'x', 'a'); // not playing
  expect(s.votes).toEqual({ a: 'b', b: 'b' });
  expect(view(ctx, s, 'a').voted).toEqual(['a', 'b']);
  vote(ctx, s, 'c', 'd');
  expect(s.phase).toBe('vote');
  vote(ctx, s, 'd', 'b');
  expect(s.phase).toBe('reveal');
  expect(s.reveal!.top).toEqual(['b']);
  expect(s.scores).toEqual({ a: 1, b: 1, c: 0, d: 1 });
  expect(ctx.fxs.map((f) => f[0])).toEqual(['start', 'reveal']);
  expect(ctx.said.at(-1)!.text).toBe('لقب الجولة: b');
  // too late now
  vote(ctx, s, 'c', 'b');
  expect(s.scores.c).toBe(0);
  // the reveal moves on by itself, or the host taps «next»
  ctx.now = s.endsAt!;
  arjah.tick!(ctx, s);
  expect(s.phase).toBe('vote');
  expect(s.round).toBe(1);
  expect(ARJAH_REVEAL_MS).toBeGreaterThan(5000);
});

test('arjah vote: people away don’t hold the round up; the timer ends it; nobody voted', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  ctx.offline.add('d');
  vote(ctx, s, 'a', 'b');
  vote(ctx, s, 'b', 'a');
  vote(ctx, s, 'c', 'b');
  expect(s.phase).toBe('reveal');
  expect(s.reveal!.top).toEqual(['b']);
  arjah.act(ctx, s, 'a', { type: 'next' });
  expect(s.round).toBe(1);
  ctx.now = s.endsAt!;
  arjah.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  expect(s.reveal!.total).toBe(0);
  expect(ctx.said.at(-1)!.text).toBe('لا أصوات في هذه الجولة');
});

/* ------------------------------------------------------------------ */
/* No leak                                                             */
/* ------------------------------------------------------------------ */

test('arjah leak: during the vote a phone sees only who voted, and its own pick', () => {
  for (const secret of [true, false]) {
    const ctx = fakeCtx();
    const s = start(ctx, { secret });
    vote(ctx, s, 'a', 'c');
    vote(ctx, s, 'b', 'c');
    for (const me of [...P, 'spectator']) {
      const v = view(ctx, s, me);
      expect(v.reveal).toBeNull();
      expect(v.titles).toBeNull();
      expect(v.voted).toEqual(['a', 'b']);
      expect(v.mine).toBe(me === 'a' || me === 'b' ? 'c' : null);
      // nothing else in the view names a target: drop the fields that are allowed to and look for 'c'
      const { players, voted, mine, scores, ...rest } = v;
      void players, voted, mine;
      expect(JSON.stringify(rest)).not.toContain('"c"');
      expect(Object.values(scores).every((n) => n === 0)).toBe(true);
    }
  }
});

test('arjah leak: «تصويت سري» never tells who voted for whom — counts only, my own points only', () => {
  const ctx = fakeCtx();
  const s = start(ctx, { secret: true, rounds: 8 });
  const seen: ArjahView[] = [];
  const rnd = seeded(21);
  while (s.phase !== 'final') {
    if (s.phase === 'vote') {
      for (const id of P) if (rnd() < 0.9) vote(ctx, s, id, P[Math.floor(rnd() * P.length)]);
      if (s.phase === 'vote') {
        ctx.now = s.endsAt!;
        arjah.tick!(ctx, s);
      }
    }
    for (const me of P) seen.push(view(ctx, s, me));
    arjah.act(ctx, s, 'a', { type: 'next' });
  }
  for (const me of P) seen.push(view(ctx, s, me));
  const reveals = seen.filter((v) => v.phase === 'reveal');
  expect(reveals.length).toBe(8 * P.length);
  for (const v of reveals) {
    expect(v.reveal!.voters).toBeNull();
    expect(v.reveal!.matched).toBeNull();
    expect(Object.keys(v.scores)).toHaveLength(1);
    expect(v.reveal!.mineMatched === null).toBe(v.mine === null);
    expect(Object.values(v.reveal!.tally).reduce((n, x) => n + x, 0)).toBe(v.reveal!.total);
  }
  for (const v of seen) expect(JSON.stringify(v)).not.toMatch(/"votes"|"voters":\{/);
  // the end: everyone's points (one total, not one round) and the titles
  const end = view(ctx, s, 'b');
  expect(Object.keys(end.scores).sort()).toEqual(P);
  expect(end.titles).toHaveLength(4);
  // the lines everyone reads name only the title holders
  for (const l of ctx.said) expect(l.text).not.toMatch(/صوّت|صوت [a-d]/);
});

test('arjah open vote: the reveal shows who voted for whom and who scored', () => {
  const ctx = fakeCtx();
  const s = start(ctx, { secret: false });
  vote(ctx, s, 'a', 'c');
  vote(ctx, s, 'b', 'c');
  vote(ctx, s, 'c', 'a');
  vote(ctx, s, 'd', 'd');
  const v = view(ctx, s, 'd');
  expect(v.reveal!.voters).toEqual({ a: ['c'], b: [], c: ['a', 'b'], d: ['d'] });
  expect(v.reveal!.matched).toEqual(['a', 'b']);
  expect(v.reveal!.mineMatched).toBe(false);
  expect(v.scores).toEqual({ a: 1, b: 1, c: 0, d: 0 });
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

const past = (tag: string, theme: ArjahPast['theme'], tally: Record<string, number>): ArjahPast => {
  const total = Object.values(tally).reduce((n, x) => n + x, 0);
  return { tag, theme, tally, total, top: arjahTop(tally) };
};

test('arjah bots: a player chosen for a similar prompt is the likelier pick, more so for a stronger bot', () => {
  const players = ['me', 'b', 'c', 'd'];
  const history = [past('sleep', 'funny', { me: 0, b: 0, c: 3, d: 1 }), past('cook', 'food', { me: 0, b: 3, c: 0, d: 1 })];
  const prompt = { theme: 'home' as const, tag: 'sleep' };
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const w = botWeights(level, 'me', players, prompt, history);
    expect(w.c).toBeGreaterThan(w.b);
    expect(w.c).toBeGreaterThan(w.d);
    expect(w.me).toBeLessThan(w.d);
  }
  const share = (level: 'easy' | 'expert') => {
    const rnd = seeded(11);
    let c = 0;
    for (let i = 0; i < 2000; i++) if (botVote(level, 'me', players, prompt, history, rnd) === 'c') c++;
    return c / 2000;
  };
  expect(share('expert')).toBeGreaterThan(share('easy') + 0.15);
  expect(share('easy')).toBeGreaterThan(0.3);
  // with no history: everyone is possible, oneself less often
  const rnd = seeded(2);
  const counts: Record<string, number> = {};
  for (let i = 0; i < 2000; i++) {
    const t = botVote('smart', 'me', players, prompt, [], rnd);
    counts[t] = (counts[t] ?? 0) + 1;
  }
  for (const p of players) expect(counts[p]).toBeGreaterThan(50);
  expect(counts.me).toBeLessThan(counts.b);
});

test('arjah bots: smart and expert lean a little toward the favourite; easy does not', () => {
  const players = ['me', 'b', 'c'];
  const history = [past('tea', 'food', { me: 0, b: 2, c: 1 }), past('late', 'work', { me: 0, b: 2, c: 1 })];
  expect(favourite(history, players)).toBe('b');
  expect(favourite([past('x', 'food', { b: 2, c: 2 })], players)).toBeNull();
  expect(ARJAH_BOT.easy.favourite).toBe(0);
  const prompt = { theme: 'talents' as const, tag: 'art' };
  const gap = (level: 'easy' | 'smart' | 'expert') => {
    const w = botWeights(level, 'me', players, prompt, history);
    return w.b / w.c;
  };
  expect(gap('smart')).toBeGreaterThan(gap('easy'));
  expect(gap('expert')).toBeGreaterThan(gap('smart'));
  expect(gap('expert')).toBeLessThan(3); // a small bias
});

test('arjah bots: a human pace, before the timer, never before 2.5 s', () => {
  for (const level of ['easy', 'smart', 'expert'] as const)
    for (const seconds of [20, 30])
      for (let i = 0; i < 200; i++) {
        const d = botDelay(level, seconds, 40, 3 + (i % 10), seeded(i));
        expect(d).toBeGreaterThanOrEqual(2500);
        expect(d).toBeLessThanOrEqual(seconds * 1000 * 0.85);
      }
  const avg = (level: 'easy' | 'expert') => {
    let n = 0;
    for (let i = 0; i < 300; i++) n += botDelay(level, 30, 40, 6, seeded(i + 1));
    return n / 300;
  };
  expect(avg('easy')).toBeGreaterThan(avg('expert'));
});

test('arjah bots: their vote does not depend on this round’s votes', () => {
  const picks = (humanVotes: Record<string, string>) => {
    const ctx = fakeCtx(['b1', 'b2', 'b3']);
    const s = startArjah(ctx, ['h', 'b1', 'b2', 'b3'], { ...ARJAH_DEFAULTS }, seeded(9));
    for (const [by, t] of Object.entries(humanVotes)) vote(ctx, s, by, t);
    arjah.botPlan!(ctx, s, ['b1', 'b2', 'b3']);
    return ctx.jobs.map((j) => `${j.by}>${j.a.target}@${j.at - ctx.now}`);
  };
  const none = picks({});
  expect(none).toHaveLength(3);
  // seeded the same way: the bots pick the same, at the same time, whatever the human voted
  expect(picks({ h: 'b1' })).toEqual(none);
  expect(picks({ h: 'b3' })).toEqual(none);
});

test('arjah bots: a whole game with bots at every strength ends with a podium and titles', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const bots = ['b1', 'b2', 'b3', 'b4', 'b5'];
    const ctx = fakeCtx(bots, level);
    const s = startArjah(ctx, bots, { ...ARJAH_DEFAULTS, rounds: 15, secret: false }, seeded(4));
    // all the bots in: the reveal comes before the timer
    let early = 0;
    let voteEnd = s.endsAt!;
    let seen = 0;
    playOut(arjah as never, ctx, s as never, bots, () => {
      if (s.phase === 'vote') voteEnd = s.endsAt!;
      if (s.history.length > seen) {
        seen = s.history.length;
        if (ctx.now < voteEnd) early++;
      }
    });
    expect(s.phase).toBe('final');
    expect(s.history).toHaveLength(15);
    // every bot voted in every round, before the timer
    for (const h of s.history) expect(h.total).toBe(bots.length);
    const r = arjah.result!(s)!;
    expect(r.places.flat().sort()).toEqual(bots);
    expect(view(ctx, s, 'b1').titles!.length).toBe(5);
    expect(early).toBe(15);
  }
});

/* ------------------------------------------------------------------ */
/* Leaving, titles, the end                                            */
/* ------------------------------------------------------------------ */

test('arjah leave: a vote for the one who left is taken back; the game ends below two players', () => {
  const ctx = fakeCtx();
  const s = start(ctx);
  vote(ctx, s, 'a', 'd');
  vote(ctx, s, 'b', 'c');
  arjah.onLeave!(ctx, s, 'd');
  expect(s.votes).toEqual({ b: 'c' });
  expect(s.participants).toEqual(['a', 'b', 'c']);
  vote(ctx, s, 'a', 'c');
  vote(ctx, s, 'c', 'c');
  expect(s.phase).toBe('reveal');
  expect(s.scores).toEqual({ a: 1, b: 1, c: 1 });
  arjah.onLeave!(ctx, s, 'a');
  arjah.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('final');
  expect(arjah.result!(s)).toEqual({ places: [['c']] });
});

test('arjah titles: the prompt each player was most chosen for; a round title wins a tie', () => {
  const h = [
    { ...past('sleep', 'funny', { a: 2, b: 1, c: 0 }), clause: 'ينام في العرس' },
    { ...past('cook', 'food', { a: 2, b: 2, c: 0 }), clause: 'يطبخ ألذ طاجين في العائلة' },
    { ...past('late', 'work', { a: 0, b: 1, c: 1 }), clause: 'يصل متأخراً إلى كل موعد' },
  ];
  // round 1 gave «a» the title alone; round 2 a shared title with the same 2 votes: the first stays
  expect(titlesOf(['a', 'b', 'c', 'd'], h)).toEqual([
    { id: 'a', clause: 'ينام في العرس', count: 2, top: true },
    { id: 'b', clause: 'يطبخ ألذ طاجين في العائلة', count: 2, top: true },
    { id: 'c', clause: 'يصل متأخراً إلى كل موعد', count: 1, top: false },
    { id: 'd', clause: null, count: 0, top: false },
  ]);
});

test('arjah: the final names the winner by score; places share ties', () => {
  const ctx = fakeCtx();
  const s = start(ctx, { rounds: 8 });
  s.scores = { a: 5, b: 5, c: 2, d: 0 };
  s.round = 7;
  s.phase = 'reveal';
  arjah.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase as string).toBe('final');
  expect(arjah.result!(s)).toEqual({ places: [['a', 'b'], ['c'], ['d']] });
  expect(ctx.fxs.at(-1)).toEqual(['win', undefined]);
});
