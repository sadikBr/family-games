/** «كلمة واحدة» — matching, cancellations, invalid clues, scoring, rotation, secrecy, bots, leaving. */
import { expect, test } from 'bun:test';

import { ONEWORD_DEFAULTS, onewordRating, type OnewordSettings, type OnewordView } from '../src/shared/games/oneword';
import { botClue, botGuess, CHECK_MIN_MS, CHECK_MS, GUESS_MS, oneword, REVEAL_MS, type OnewordState } from './games/oneword';
import { ONEWORD_WORDS, type OnewordWord } from './oneword-content';
import { clueKey, clueProblem, duplicates, guessMatches, sameClue } from './oneword-match';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}

function fakeCtx(bots: string[] = []) {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const said: string[] = [];
  const fxs: string[] = [];
  const ctx: GameCtx & { jobs: Job[]; keys: Set<string>; said: string[]; fxs: string[] } = {
    now: 1_000_000,
    fx: (k) => fxs.push(k),
    isConnected: () => true,
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    memo: new Map(),
    say: (t) => said.push(t),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs,
    keys,
    said,
    fxs,
  };
  return ctx;
}

const settings = (p: Partial<OnewordSettings> = {}): OnewordSettings => ({ ...ONEWORD_DEFAULTS, ...p });
const word = (w: string): OnewordWord => ONEWORD_WORDS.find((x) => x.w === w)!;

function setup(players: string[], p: Partial<OnewordSettings> = {}, bots: string[] = []) {
  const ctx = fakeCtx(bots);
  const s = oneword.start(ctx, players, settings(p));
  // a known word, and the first player guesses
  s.guesserIdx = 0;
  s.guesser = players[0];
  s.word = word('هاتف');
  return { ctx, s };
}

const act = (ctx: GameCtx, s: OnewordState, by: string, a: Record<string, unknown>) => oneword.act(ctx, s, by, { step: s.step, ...a } as never);
const view = (ctx: GameCtx, s: OnewordState, me: string) => oneword.view(ctx, s, me) as OnewordView;

/** Everyone but the guesser sends a clue, the check passes, and the guesser guesses. */
function playCard(ctx: ReturnType<typeof fakeCtx>, s: OnewordState, clues: string[], guess: string | null) {
  const givers = s.participants.filter((p) => p !== s.guesser);
  givers.forEach((g, i) => act(ctx, s, g, { type: 'clue', text: clues[i % clues.length] }));
  expect(s.phase).toBe('check');
  ctx.now += CHECK_MIN_MS;
  for (const g of givers) act(ctx, s, g, { type: 'ready' });
  expect(s.phase).toBe('guess');
  if (guess === null) act(ctx, s, s.guesser, { type: 'pass' });
  else act(ctx, s, s.guesser, { type: 'guess', text: guess });
  expect(s.phase).toBe('reveal');
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

test('oneword: normalisation — article, hamza, ة/ه, ى/ي, tashkeel, plural and feminine endings', () => {
  expect(clueKey('الهاتف')).toBe(clueKey('هاتف'));
  expect(clueKey('أَسَد')).toBe(clueKey('اسد'));
  expect(clueKey('مدرسة')).toBe(clueKey('مدرسه'));
  expect(clueKey('مستشفى')).toBe(clueKey('مستشفي'));
  expect(clueKey('بالهاتف')).toBe(clueKey('هاتف'));
  for (const [a, b] of [
    ['هاتف', 'الهاتف'],
    ['هاتف', 'هواتف'],
    ['الهاتف', 'هواتف'],
    ['سيارة', 'سيارات'],
    ['سمكة', 'سمك'],
    ['معلم', 'معلمون'],
    ['قَمَر', 'القمر'],
    ['برتقالي', 'برتقالى'],
    ['مستشفى', 'مستشفيات'],
    ['مدرسة', 'مدرسه'],
    ['شوكولاتة', 'شوكولاته'],
    ['تلفزيون', 'تلفزيوون'], // a one-letter slip in a long word
  ]) expect([a, b, sameClue(a, b)]).toEqual([a, b, true]);
  for (const [a, b] of [
    ['نار', 'نور'],
    ['جمل', 'جميل'],
    ['شمس', 'شمسية'],
    ['بحر', 'سمك'],
    ['قط', 'قطار'],
  ]) expect([a, b, sameClue(a, b)]).toEqual([a, b, false]);
});

test('oneword: identical and near-identical clues cancel each other, all of them', () => {
  expect([...duplicates(['هاتف', 'الهاتف', 'رنين', null, 'هواتف', 'شاشة'])].sort()).toEqual([0, 1, 4]);
  expect([...duplicates(['رنين', 'رنين'])].sort()).toEqual([0, 1]);
  expect(duplicates(['رنين', 'شاشة', null, null]).size).toBe(0);
});

test('oneword: invalid clues are refused with a clear message', () => {
  const phone = word('هاتف');
  expect(clueProblem('رنين', phone)).toBeNull();
  expect(clueProblem('  رنين!  ', phone)).toBeNull();
  expect(clueProblem('جهاز ذكي', phone)).toContain('كلمة واحدة');
  expect(clueProblem('هاتف', phone)).toContain('الكلمة نفسها');
  expect(clueProblem('الهاتف', phone)).toContain('الكلمة نفسها');
  expect(clueProblem('هواتف', phone)).toContain('الكلمة نفسها');
  expect(clueProblem('جوال', phone)).toContain('الكلمة نفسها'); // a listed form
  expect(clueProblem('هاتفي', phone)).not.toBeNull();
  expect(clueProblem('', phone)).not.toBeNull();
  expect(clueProblem('ب', phone)).toContain('قصير');
  expect(clueProblem('رنين@', phone)).toContain('حروف');
  expect(clueProblem('فيلم', word('فيل'))).toContain('يحتوي');
  // a two-word word: neither of its words may be the clue
  const football = word('كرة القدم');
  expect(clueProblem('كرة', football)).not.toBeNull();
  expect(clueProblem('القدم', football)).not.toBeNull();
  expect(clueProblem('ملعب', football)).toBeNull();
});

test('oneword: the guess is compared leniently (article, forms, one slip from 5 letters)', () => {
  expect(guessMatches('الهاتف', word('هاتف'))).toBe(true);
  expect(guessMatches('هواتف', word('هاتف'))).toBe(true);
  expect(guessMatches('هاتق', word('هاتف'))).toBe(false); // 4 letters: no slip allowed
  expect(guessMatches('برتقل', word('برتقال'))).toBe(true);
  expect(guessMatches('كرة قدم', word('كرة القدم'))).toBe(true);
  expect(guessMatches('زرافه', word('زرافة'))).toBe(true);
  expect(guessMatches('أسد', word('نمر'))).toBe(false);
});

test('oneword: the deck — 500+ words, 6–10 one-word associations each, all valid for their word', () => {
  expect(ONEWORD_WORDS.length).toBeGreaterThanOrEqual(500);
  const keys = new Set<string>();
  for (const w of ONEWORD_WORDS) {
    expect([w.w, keys.has(clueKey(w.w))]).toEqual([w.w, false]);
    keys.add(clueKey(w.w));
    expect([w.w, w.c.length >= 6 && w.c.length <= 10]).toEqual([w.w, true]);
    for (const c of w.c) {
      expect([w.w, c, /\s/.test(c)]).toEqual([w.w, c, false]);
      expect([w.w, c, clueProblem(c, w)]).toEqual([w.w, c, null]);
    }
  }
  for (const cat of ['animals', 'food', 'home', 'places', 'jobs', 'nature', 'sports']) expect(ONEWORD_WORDS.some((w) => w.cat === cat)).toBe(true);
});

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

test('oneword: a clue round — bad clues refused, the check shows cancellations, then the guess', () => {
  const { ctx, s } = setup(['g', 'a', 'b', 'c']);
  expect(oneword.turnOf!(s)).toEqual(['a', 'b', 'c']);
  expect(() => act(ctx, s, 'a', { type: 'clue', text: 'الهاتف' })).toThrow(GameError);
  expect(() => act(ctx, s, 'a', { type: 'clue', text: 'جهاز ذكي' })).toThrow(GameError);
  act(ctx, s, 'g', { type: 'clue', text: 'رنين' }); // the guesser writes no clue
  expect(s.written).toEqual({});
  act(ctx, s, 'a', { type: 'clue', text: 'رنين' });
  expect(ctx.said.at(-1)).toBe('تلميح من a (1 من 3)');
  expect(oneword.turnOf!(s)).toEqual(['b', 'c']);
  act(ctx, s, 'a', { type: 'clue', text: 'اتصال' }); // may change it before everyone is done
  expect(s.written.a).toBe('اتصال');
  act(ctx, s, 'b', { type: 'clue', text: 'الاتصال' });
  act(ctx, s, 'c', { type: 'clue', text: 'شاشة' });
  expect(s.phase).toBe('check');
  expect(s.table.map((c) => c.status)).toEqual(['dup', 'dup', 'ok']);
  expect(ctx.said.at(-1)).toContain('المحذوفة');
  // anyone among the clue-givers may cross out a clue, and restore it
  act(ctx, s, 'a', { type: 'strike', i: 2 });
  expect(s.table[2]).toMatchObject({ status: 'struck', struckBy: 'a' });
  act(ctx, s, 'b', { type: 'strike', i: 2 });
  expect(s.table[2]).toMatchObject({ status: 'ok', struckBy: null });
  act(ctx, s, 'b', { type: 'strike', i: 0 }); // a cancelled clue cannot be toggled
  expect(s.table[0].status).toBe('dup');
  act(ctx, s, 'g', { type: 'strike', i: 2 }); // nor by the guesser
  expect(s.table[2].status).toBe('ok');
  // everyone approves, but the check stays up long enough to be seen
  for (const p of ['a', 'b', 'c']) act(ctx, s, p, { type: 'ready' });
  expect(s.phase).toBe('check');
  expect(oneword.turnOf!(s)).toEqual([]);
  ctx.now += CHECK_MIN_MS;
  oneword.tick!(ctx, s);
  expect(s.phase).toBe('guess');
  expect(oneword.turnOf!(s)).toEqual(['g']);
  expect(view(ctx, s, 'g').clues!.map((c) => c.text)).toEqual(['شاشة']);
});

test('oneword: the check ends by itself when its time runs out', () => {
  const { ctx, s } = setup(['g', 'a', 'b']);
  act(ctx, s, 'a', { type: 'clue', text: 'رنين' });
  ctx.now += 60_000;
  oneword.tick!(ctx, s); // b wrote nothing in time
  expect(s.phase).toBe('check');
  expect(s.table.map((c) => c.status)).toEqual(['ok', 'none']);
  ctx.now += CHECK_MS;
  oneword.tick!(ctx, s);
  expect(s.phase).toBe('guess');
});

test('oneword: the guesser never receives the word or the clues before the guess', () => {
  const { ctx, s } = setup(['g', 'a', 'b', 'c']);
  const secret = () => [s.word!.w, ...Object.values(s.written)];
  const leaks = (me: string) => {
    const json = JSON.stringify(view(ctx, s, me));
    return secret().filter((t) => json.includes(t));
  };
  expect(view(ctx, s, 'g').word).toBeNull();
  expect(view(ctx, s, 'a').word).toBe('هاتف');
  act(ctx, s, 'a', { type: 'clue', text: 'رنين' });
  act(ctx, s, 'b', { type: 'clue', text: 'رنين' });
  expect(leaks('g')).toEqual([]);
  expect(view(ctx, s, 'g').clues).toBeNull();
  act(ctx, s, 'c', { type: 'clue', text: 'شاشة' });
  expect(s.phase).toBe('check');
  expect(leaks('g')).toEqual([]);
  expect(view(ctx, s, 'a').clues!.length).toBe(3);
  ctx.now += CHECK_MS;
  oneword.tick!(ctx, s);
  // while guessing: only the surviving clue, still not the word nor the cancelled ones
  const v = view(ctx, s, 'g');
  expect(v.word).toBeNull();
  expect(v.clues!.map((c) => c.text)).toEqual(['شاشة']);
  expect(JSON.stringify(v)).not.toContain('رنين');
  // nothing secret in the announcements either
  expect(ctx.said.filter((t) => t.includes('هاتف') || t.includes('رنين') || t.includes('شاشة'))).toEqual([]);
  act(ctx, s, 'g', { type: 'guess', text: 'هاتف' });
  expect(view(ctx, s, 'g').word).toBe('هاتف');
  expect(view(ctx, s, 'g').clues!.length).toBe(3);
});

test('oneword: scoring — right +1, pass loses this card, wrong loses this one and the next', () => {
  const { ctx, s } = setup(['g', 'a', 'b'], { cards: 7 });
  expect(s.left).toBe(6);
  playCard(ctx, s, ['رنين', 'شاشة'], 'الهاتف');
  expect([s.won, s.lost, s.left]).toEqual([1, 0, 6]);
  expect(s.guess).toMatchObject({ result: 'right', burned: false });
  act(ctx, s, s.participants[0], { type: 'next' });
  s.word = word('أسد');
  playCard(ctx, s, ['زئير', 'غابة'], null);
  expect([s.won, s.lost, s.left]).toEqual([1, 1, 5]);
  expect(s.guess).toMatchObject({ result: 'pass' });
  expect(ctx.said.at(-1)).toBe('تخمين a: تجاوز — الكلمة «أسد»');
  ctx.now += REVEAL_MS;
  oneword.tick!(ctx, s);
  s.word = word('قمر');
  playCard(ctx, s, ['ليل', 'هلال'], 'شمس');
  expect([s.won, s.lost, s.left]).toEqual([1, 3, 3]); // the next card was burned
  expect(s.guess).toMatchObject({ result: 'wrong', burned: true });
  expect(ctx.said.at(-1)).toContain('«قمر»');
  // a timeout counts as a pass
  ctx.now += REVEAL_MS;
  oneword.tick!(ctx, s);
  s.word = word('قط');
  for (const g of s.participants.filter((p) => p !== s.guesser)) act(ctx, s, g, { type: 'clue', text: 'مواء' });
  ctx.now += CHECK_MS;
  oneword.tick!(ctx, s);
  ctx.now += GUESS_MS;
  oneword.tick!(ctx, s);
  expect(s.guess).toMatchObject({ result: 'timeout', text: null });
  expect([s.won, s.lost, s.left]).toEqual([1, 4, 2]);
});

test('oneword: a wrong guess on the last card costs a card already won; the game ends with the rating', () => {
  const { ctx, s } = setup(['g', 'a', 'b'], { cards: 7 });
  s.left = 0;
  s.won = 4;
  s.lost = 2;
  playCard(ctx, s, ['رنين', 'شاشة'], 'حاسوب');
  expect([s.won, s.lost]).toEqual([3, 4]);
  expect(s.guess).toMatchObject({ result: 'wrong', refunded: true, burned: false });
  ctx.now += REVEAL_MS;
  oneword.tick!(ctx, s);
  expect(s.phase).toBe('final');
  expect(view(ctx, s, 'a').history.length).toBe(1);
  expect(ctx.fxs.at(-1)).toBe('win');
  expect(onewordRating(13, 13).title).toBe('علامة كاملة!');
  expect(onewordRating(12, 13).title).toBe('مذهل!');
  expect(onewordRating(11, 13).title).toBe('رائع!');
  expect(onewordRating(7, 7).title).toBe('علامة كاملة!');
  expect(onewordRating(0, 13).title).not.toBe(onewordRating(5, 13).title);
});

test('oneword: the guesser rotates through every player', () => {
  const { ctx, s } = setup(['p1', 'p2', 'p3', 'p4'], { cards: 13 });
  const guessers: string[] = [];
  for (let k = 0; k < 8; k++) {
    guessers.push(s.guesser);
    const w = s.word!;
    playCard(ctx, s, [w.c[0], w.c[1], w.c[2]], w.w);
    act(ctx, s, s.participants[0], { type: 'next' });
  }
  expect(guessers).toEqual(['p1', 'p2', 'p3', 'p4', 'p1', 'p2', 'p3', 'p4']);
  // never the same word twice in a game
  expect(new Set(s.history.map((h) => h.word)).size).toBe(8);
});

test('oneword: moves are announced to everyone (say), never naming the secret before the reveal', () => {
  const { ctx, s } = setup(['g', 'a', 'b']);
  playCard(ctx, s, ['رنين', 'شاشة'], 'هاتف');
  expect(ctx.said).toEqual([
    'تلميح من a (1 من 2)',
    'تلميح من b (2 من 2)',
    'المقارنة: لا تلميحات متطابقة',
    'التلميحات الباقية: 2 — التخمين لـg',
    'تخمين g: «هاتف» صحيح! +1',
  ]);
});

test('oneword: settings are validated', () => {
  const st = settings();
  oneword.patchSettings!(st, { cards: 5, level: 'genius' });
  expect(st).toEqual(ONEWORD_DEFAULTS);
  oneword.patchSettings!(st, { seconds: 200 });
  expect(st.seconds).toBe(90);
  oneword.patchSettings!(st, { cards: 7, seconds: 50, level: 'hard' });
  expect(st).toEqual({ cards: 7, seconds: 45, level: 'hard' });
  const { s } = setup(['a', 'b', 'c'], { cards: 99 as never, seconds: 10 });
  expect(s.settings).toMatchObject({ cards: 13, seconds: 45 });
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('oneword: bot clues are valid associations; a bot guesser reads them back', () => {
  for (const w of ONEWORD_WORDS.slice(0, 80)) expect(clueProblem(botClue(w), w)).toBeNull();
  const lion = word('أسد');
  expect(botGuess(['زئير', 'لبدة', 'عرين'], 'hard', [], () => 0)).toBe('أسد');
  expect(guessMatches(botGuess(lion.c.slice(0, 4), 'hard', [], () => 0)!, lion)).toBe(true);
  expect(botGuess([], 'hard')).toBeNull(); // nothing to go on: pass
  expect(botGuess(['كلمةغريبةجدا'], 'medium')).toBeNull();
});

function runBots(ctx: ReturnType<typeof fakeCtx>, s: OnewordState, bots: string[], maxSteps = 20_000) {
  let steps = 0;
  oneword.botPlan!(ctx, s, bots);
  while (s.phase !== 'final' && steps++ < maxSteps) {
    ctx.now += 500;
    const due = ctx.jobs.filter((j) => j.at <= ctx.now).sort((a, b) => a.at - b.at);
    for (const j of due) {
      ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
      try {
        oneword.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
    }
    oneword.tick!(ctx, s);
    oneword.botPlan!(ctx, s, bots);
  }
  return steps;
}

test('oneword: bots play a whole game to the end (3, 5 and 10 players, every level)', () => {
  for (const [n, level, cards] of [
    [3, 'easy', 13],
    [5, 'medium', 13],
    [10, 'hard', 7],
  ] as const) {
    const bots = Array.from({ length: n }, (_, i) => `bot${i}`);
    const ctx = fakeCtx(bots);
    const s = oneword.start(ctx, bots, settings({ level, cards }));
    runBots(ctx, s, bots);
    expect(s.phase).toBe('final');
    expect(s.won + s.lost).toBe(cards);
    expect(s.history.length).toBeGreaterThan(0);
    // every card had clues from the bots
    expect(s.history.every((h) => h.result !== 'timeout')).toBe(true);
  }
});

test('oneword: a bot takes over an offline guesser; people keep their clue', () => {
  const ctx = fakeCtx(['b1', 'b2']);
  const s = oneword.start(ctx, ['me', 'b1', 'b2'], settings({ cards: 7 }));
  s.guesserIdx = 0;
  s.guesser = 'b1';
  s.word = word('هاتف');
  oneword.botPlan!(ctx, s, ['b1', 'b2']);
  expect(ctx.jobs.map((j) => j.by)).toEqual(['b2']); // b1 guesses, 'me' is a person
  act(ctx, s, 'me', { type: 'clue', text: 'رنين' });
  const j = ctx.jobs[0];
  oneword.act(ctx, s, j.by, j.a);
  expect(s.phase).toBe('check');
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('oneword: the guesser leaving skips to the next player with a new word; the card goes back', () => {
  const { ctx, s } = setup(['g', 'a', 'b', 'c']);
  act(ctx, s, 'a', { type: 'clue', text: 'رنين' });
  const left = s.left;
  oneword.onLeave!(ctx, s, 'g');
  expect(s.guesser).toBe('a');
  expect(s.phase).toBe('clues');
  expect(s.left).toBe(left);
  expect(s.written).toEqual({});
  expect(oneword.turnOf!(s)).toEqual(['b', 'c']);
});

test('oneword: a clue-giver leaving: their clue goes, the round carries on', () => {
  const { ctx, s } = setup(['g', 'a', 'b', 'c']);
  act(ctx, s, 'a', { type: 'clue', text: 'رنين' });
  act(ctx, s, 'b', { type: 'clue', text: 'شاشة' });
  oneword.onLeave!(ctx, s, 'c'); // the last one we waited for
  expect(s.phase).toBe('check');
  expect(s.table.map((c) => c.by)).toEqual(['a', 'b']);
  // in the check, a leaver's clue disappears and the duplicates are re-counted
  const t = setup(['g', 'a', 'b', 'c', 'd']);
  for (const [p, txt] of [['a', 'رنين'], ['b', 'رنين'], ['c', 'شاشة'], ['d', 'اتصال']]) act(t.ctx, t.s, p, { type: 'clue', text: txt });
  expect(t.s.table.map((c) => c.status)).toEqual(['dup', 'dup', 'ok', 'ok']);
  oneword.onLeave!(t.ctx, t.s, 'b');
  expect(t.s.table.map((c) => c.status)).toEqual(['ok', 'ok', 'ok']);
  // the guesser after the leaver is still next
  const r = setup(['g', 'a', 'b', 'c']);
  playCard(r.ctx, r.s, ['رنين'], null);
  oneword.onLeave!(r.ctx, r.s, 'g');
  r.ctx.now += REVEAL_MS;
  oneword.tick!(r.ctx, r.s);
  expect(r.s.guesser).toBe('a');
});

test('oneword: fewer than 3 players left — the game ends cleanly', () => {
  const { ctx, s } = setup(['g', 'a', 'b']);
  oneword.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
  expect(s.endsAt).toBeNull();
  expect(oneword.turnOf!(s)).toEqual([]);
  oneword.onLeave!(ctx, s, 'nobody');
  expect(view(ctx, s, 'g').phase).toBe('final');
});
