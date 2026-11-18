/**
 * «كلم» — word classes (everyday, dictionary, unknown, Moroccan), the deck, dealing and the starting word,
 * plays (one card, either face, never a letter on itself, the star's letter, the race on `base`), refused
 * words and the lock, the vote on doubtful words, the end of a round (an empty hand, everyone stuck, the
 * minute without a change, people away), points and rounds, bots (they finish games, the expert beats the
 * easy one), no leak of other hands, leaving, settings.
 */
import { expect, test } from 'bun:test';

import { KALIM_DEFAULTS, KALIM_EMPTY_BONUS, KALIM_LOCK_MS, KALIM_STALL_MS, KALIM_STAR, KALIM_VOTE_MS, kalimWordKey, type KalimCard, type KalimSettings, type KalimView } from '../src/shared/games/kalim';
import { DEFAULT_SETTINGS, type BotLevel } from '../src/shared/protocol';
import { KALIM_REVEAL_MS, kalim, sanitizeKalim, startKalim, type KalimState } from './games/kalim';
import { botPlay, classify, makeDeck, neighbours, starsFor, startWords } from './kalim-words';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Ctx = GameCtx & { now: number; jobs: Job[]; said: string[]; offline: Set<string> };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert'): Ctx {
  const keys = new Set<string>();
  const offline = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: () => {},
    say: (text) => ctx.said.push(text),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => `اسم-${id}`,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      ctx.jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs: [],
    said: [],
    offline,
  };
  return ctx;
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const settings = (o: Partial<KalimSettings> = {}): KalimSettings => ({ ...KALIM_DEFAULTS, ...o });
const act = (ctx: Ctx, s: KalimState, by: string, a: Record<string, unknown>) => kalim.act(ctx, s, by, { round: s.round + 1, ...a } as never);
const view = (ctx: Ctx, s: KalimState, me: string) => kalim.view(ctx, s, me) as KalimView;

/** A round with a chosen word and hands (ids from 100). */
function setup(word: string, hands: Record<string, string[]>, ctx = fakeCtx(), o: Partial<KalimSettings> = {}) {
  const s = startKalim(ctx, Object.keys(hands), settings(o), seeded(1));
  let id = 100;
  s.hands = Object.fromEntries(Object.entries(hands).map(([p, cards]) => [p, cards.map((c): KalimCard => (c === '*' ? { id: id++, a: KALIM_STAR, b: KALIM_STAR } : { id: id++, a: c[0], b: c[1] }))]));
  s.board = { keys: [...word], shown: [...word], star: [false, false, false], pile: [1, 1, 1], by: [null, null, null] };
  s.trail = [{ word, by: null }];
  s.seq = 0;
  return { s, ctx };
}
const cardOf = (s: KalimState, p: string, i = 0) => s.hands[p][i].id;

/* ------------------------------------------------------------------ */

test('word classes: everyday, dictionary, unknown; Moroccan words only in «فصحى وعامية»', () => {
  for (const w of ['قلم', 'رسم', 'قسم', 'رمل', 'جمل', 'عين', 'أذن', 'قال', 'ماء', 'أمل']) expect(classify(kalimWordKey(w)!, 'fusha')).toBe('known');
  expect(classify('ظظظ', 'fusha')).toBe('unknown');
  expect(classify('غدا', 'fusha')).toBe('unknown');
  expect(classify('غدا', 'mixed')).toBe('known');
  expect(classify('واش', 'mixed')).toBe('known');
  expect(['dict', 'unknown']).toContain(classify('زفك', 'fusha'));
  expect(kalimWordKey('أَمَل')).toBe('امل');
  expect(kalimWordKey('مدرسة')).toBeNull();
});

test('the deck: two different letters on a card, a star in about fifteen, unique ids', () => {
  const d = makeDeck(60, seeded(3));
  expect(d).toHaveLength(60);
  expect(d.filter((c) => c.a === KALIM_STAR)).toHaveLength(starsFor(60));
  expect(new Set(d.map((c) => c.id)).size).toBe(60);
  for (const c of d) if (c.a !== KALIM_STAR) expect(c.a).not.toBe(c.b);
  expect(starsFor(12)).toBe(1);
});

test('starting words are everyday nouns with many neighbours; a round deals equal hands', () => {
  expect(startWords().length).toBeGreaterThan(80);
  for (const w of startWords().slice(0, 20)) expect(neighbours(w).length).toBeGreaterThanOrEqual(12);
  const ctx = fakeCtx();
  const s = startKalim(ctx, ['a', 'b', 'c'], settings({ hand: 6 }), seeded(9));
  expect(s.phase).toBe('play');
  for (const p of ['a', 'b', 'c']) expect(s.hands[p]).toHaveLength(6);
  expect(startWords()).toContain(s.board.keys.join(''));
  expect(s.stallAt).toBe(ctx.now + KALIM_STALL_MS);
});

test('a play: one card on one letter makes a new word; either face; a point', () => {
  const { s, ctx } = setup('كلم', { a: ['سق', 'رب'], b: ['دن'] });
  act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), face: 1, pos: 0 });
  expect(s.board.keys.join('')).toBe('قلم');
  expect(s.seq).toBe(1);
  expect(s.hands.a).toHaveLength(1);
  expect(s.scores.a).toBe(1);
  expect(s.board.pile).toEqual([2, 1, 1]);
  expect(s.board.by[0]).toBe('a');
  expect(s.trail.map((t) => t.word)).toEqual(['كلم', 'قلم']);
  expect(view(ctx, s, 'b').last).toMatchObject({ by: 'a', pos: 0, word: 'قلم' });
});

test('never a letter on the same letter; a stale play is told the word changed', () => {
  const { s, ctx } = setup('قلم', { a: ['قس', 'سر'], b: ['رد'] });
  expect(() => act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), face: 0, pos: 0 })).toThrow(GameError);
  act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), face: 1, pos: 1 }); // قسم
  expect(s.board.keys.join('')).toBe('قسم');
  expect(() => act(ctx, s, 'b', { type: 'play', base: 0, card: cardOf(s, 'b'), face: 0, pos: 0 })).toThrow('تغيّرت الكلمة');
  act(ctx, s, 'b', { type: 'play', base: 1, card: cardOf(s, 'b'), face: 0, pos: 0 }); // رسم
  expect(s.board.keys.join('')).toBe('رسم');
});

test('the star stands for the letter chosen and stays it', () => {
  const { s, ctx } = setup('جمل', { a: ['*', 'حب'], b: ['دن'] });
  expect(() => act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), pos: 0 })).toThrow('النجمة');
  act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), pos: 0, as: 'ر' }); // رمل
  expect(s.board.keys.join('')).toBe('رمل');
  expect(s.board.star).toEqual([true, false, false]);
  act(ctx, s, 'a', { type: 'play', base: 1, card: cardOf(s, 'a'), face: 0, pos: 2 }); // رمح
  expect(s.board.keys.join('')).toBe('رمح');
  expect(s.board.star[0]).toBe(true);
});

test('an unknown word with nobody to ask is refused: the card stays, a short lock', () => {
  const ctx = fakeCtx(['b']);
  const { s } = setup('قلم', { a: ['ظث', 'سب'], b: ['دن'] }, ctx);
  act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), face: 0, pos: 1 }); // قظم
  expect(s.board.keys.join('')).toBe('قلم');
  expect(s.hands.a).toHaveLength(2);
  expect(view(ctx, s, 'a').lockUntil).toBe(ctx.now + KALIM_LOCK_MS);
  expect(() => act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a', 1), face: 0, pos: 1 })).toThrow('انتظر');
  ctx.now += KALIM_LOCK_MS;
  act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a', 1), face: 0, pos: 1 }); // قسم
  expect(s.board.keys.join('')).toBe('قسم');
});

test('a doubtful word goes to the others: yes keeps it, no sends the card back', () => {
  const { s, ctx } = setup('قلم', { a: ['ظث', 'ظث'], b: ['دن'], c: ['دن'] });
  act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), face: 0, pos: 1 });
  expect(s.phase).toBe('vote');
  const v = view(ctx, s, 'b').vote!;
  expect(v).toMatchObject({ by: 'a', voters: ['b', 'c'], inDict: false });
  expect(kalim.turnOf!(s)).toEqual(['b', 'c']);
  expect(() => act(ctx, s, 'b', { type: 'play', base: 0, card: cardOf(s, 'b'), face: 0, pos: 0 })).toThrow('التصويت');
  act(ctx, s, 'a', { type: 'vote', yes: true }); // the proposer doesn't vote
  act(ctx, s, 'b', { type: 'vote', yes: true });
  act(ctx, s, 'c', { type: 'vote', yes: true });
  expect(s.phase).toBe('play');
  expect(s.board.keys.join('')).toBe('قظم');
  // refused
  act(ctx, s, 'a', { type: 'play', base: 1, card: cardOf(s, 'a'), face: 1, pos: 2 }); // قظث
  act(ctx, s, 'b', { type: 'vote', yes: false });
  act(ctx, s, 'c', { type: 'vote', yes: true });
  expect(s.board.keys.join('')).toBe('قظم');
  expect(s.hands.a).toHaveLength(1);
  expect(view(ctx, s, 'a').lockUntil).not.toBeNull();
});

test('a vote that runs out: an unknown word needs more yes, a dictionary word stays', () => {
  const { s, ctx } = setup('قلم', { a: ['ظث'], b: ['دن'] });
  act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), face: 0, pos: 1 });
  ctx.now += KALIM_VOTE_MS;
  expect(kalim.tick!(ctx, s)).toBe(true);
  expect(s.board.keys.join('')).toBe('قلم');
  // a word the big dictionary knows but no everyday list: kept unless more say no
  const dictWord = ['زفك', 'لرب', 'ظرك', 'لتن'].find((w) => classify(w, 'fusha') === 'dict')!;
  expect(dictWord).toBeDefined();
  const { s: s2, ctx: c2 } = setup(dictWord.slice(0, 2) + (dictWord[2] === 'م' ? 'ن' : 'م'), { a: [dictWord[2] + 'ب'], b: ['دن'] });
  act(c2, s2, 'a', { type: 'play', base: 0, card: cardOf(s2, 'a'), face: 0, pos: 2 });
  if (s2.phase === 'vote') {
    expect(view(c2, s2, 'b').vote!.inDict).toBe(true);
    c2.now += KALIM_VOTE_MS;
    kalim.tick!(c2, s2);
  }
  expect(s2.board.keys.join('')).toBe(dictWord);
});

test('the last card wins the round (+3); a game of rounds ends on the podium', () => {
  const { s, ctx } = setup('كلم', { a: ['سق'], b: ['دن', 'رب'] }, fakeCtx(), { rounds: 3 });
  s.totalRounds = 2;
  act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), face: 1, pos: 0 });
  expect(s.phase).toBe('reveal');
  expect(s.result).toMatchObject({ how: 'emptied', winners: ['a'] });
  expect(s.scores.a).toBe(1 + KALIM_EMPTY_BONUS);
  expect(s.result!.left).toEqual({ a: 0, b: 2 });
  ctx.now += KALIM_REVEAL_MS;
  kalim.tick!(ctx, s);
  expect(s.phase).toBe('play');
  expect(s.round).toBe(1);
  expect(s.hands.a).toHaveLength(9);
  act(ctx, s, 'a', { type: 'stuck', base: s.seq });
  act(ctx, s, 'b', { type: 'stuck', base: s.seq });
  expect(s.phase).toBe('reveal');
  act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('final');
  expect(kalim.result!(s)!.places[0]).toEqual(['a']);
});

test('nobody can change the word: the fewest cards win; people away count as stuck; a minute ends it', () => {
  const { s, ctx } = setup('كلم', { a: ['سق', 'رب'], b: ['دن'], c: ['دن', 'دن'] });
  act(ctx, s, 'a', { type: 'stuck' });
  ctx.offline.add('c');
  act(ctx, s, 'b', { type: 'stuck' });
  expect(s.phase).toBe('reveal');
  expect(s.result).toMatchObject({ how: 'stuck', winners: ['b'] });
  // a play clears the stuck marks
  const r2 = setup('كلم', { a: ['سق', 'رب'], b: ['دن', 'رب'] });
  act(r2.ctx, r2.s, 'b', { type: 'stuck' });
  act(r2.ctx, r2.s, 'a', { type: 'play', base: 0, card: cardOf(r2.s, 'a'), face: 1, pos: 0 });
  expect(r2.s.stuck.size).toBe(0);
  r2.ctx.now += KALIM_STALL_MS;
  expect(kalim.tick!(r2.ctx, r2.s)).toBe(true);
  expect(r2.s.result).toMatchObject({ how: 'stuck', winners: ['a'] });
});

test('the view: my cards, only counts for the others', () => {
  const { s, ctx } = setup('كلم', { a: ['سق', 'رب'], b: ['دن'] });
  const v = view(ctx, s, 'b');
  expect(v.hand).toHaveLength(1);
  expect(v.counts).toEqual({ a: 2, b: 1 });
  expect(JSON.stringify(v)).not.toContain('"سق"');
  expect(JSON.stringify(v)).not.toMatch(/"a":"س"/);
});

/** Plays a game of bots to the end; returns the state. */
function runBots(players: string[], levels: Record<string, BotLevel>, seed: number, o: Partial<KalimSettings> = {}) {
  const ctx = fakeCtx(players);
  ctx.botLevel = () => 'expert';
  const s = startKalim(ctx, players, settings(o), seeded(seed));
  for (let step = 0; step < 4000 && s.phase !== 'final'; step++) {
    if (s.phase === 'play') {
      for (const b of players) {
        ctx.botLevel = () => levels[b];
        kalim.botPlan!(ctx, s, [b]);
      }
    }
    ctx.jobs.sort((x, y) => x.at - y.at);
    const job = ctx.jobs.shift();
    const wake = s.phase === 'reveal' ? s.endsAt! : s.stallAt;
    if (!job || job.at > wake) {
      if (job) ctx.jobs.unshift(job);
      ctx.now = Math.max(ctx.now, wake);
      kalim.tick!(ctx, s);
      continue;
    }
    ctx.now = Math.max(ctx.now, job.at);
    try {
      kalim.act(ctx, s, job.by, job.a as never);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
    }
  }
  return s;
}

test('bots finish games, and the expert beats the easy one', () => {
  let expertWins = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = runBots(['x', 'e'], { x: 'expert', e: 'easy' }, seed, { hand: 9 });
    expect(s.phase).toBe('final');
    const top = kalim.result!(s)!.places[0];
    if (top.includes('x') && !top.includes('e')) expertWins++;
  }
  expect(expertWins).toBeGreaterThanOrEqual(8);
});

test('a bot plays everyday words only, saves the star, and says when it sees nothing', () => {
  const hand: KalimCard[] = [
    { id: 1, a: KALIM_STAR, b: KALIM_STAR },
    { id: 2, a: 'ق', b: 'ظ' },
  ];
  const p = botPlay('expert', 'كلم', hand, 'fusha', seeded(2))!;
  expect(p).toMatchObject({ card: 2, pos: 0 });
  expect(['قلم', 'ظلم']).toContain(p.word);
  const star = botPlay('expert', 'كلم', [hand[0]], 'fusha', seeded(2))!;
  expect(star.as).toBeDefined();
  expect(classify(star.word, 'fusha')).toBe('known');
  expect(botPlay('expert', 'كلم', [{ id: 3, a: 'ث', b: 'ض' }], 'fusha', seeded(2))).toBeNull();
});

test('bots skip a vote, and someone away never plays (they just count as stuck)', () => {
  const ctx = fakeCtx(['b', 'c']);
  const { s } = setup('كلم', { a: ['سق'], b: ['سق'], c: ['ظث'] }, ctx);
  ctx.offline.add('c');
  kalim.botPlan!(ctx, s, ['b', 'c']);
  expect(s.stuck.has('c')).toBe(true);
  expect(ctx.jobs.map((j) => j.by)).toEqual(['b']);
});

test('leaving: the vote and the round carry on; one player left ends the game', () => {
  const { s, ctx } = setup('قلم', { a: ['ظث'], b: ['دن'], c: ['دن'] });
  act(ctx, s, 'a', { type: 'play', base: 0, card: cardOf(s, 'a'), face: 0, pos: 1 });
  kalim.onLeave!(ctx, s, 'b');
  expect(s.vote!.voters).toEqual(['c']);
  kalim.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
});

test('settings are sanitised and patched', () => {
  expect(sanitizeKalim({ dialect: 'x' as never, hand: 100, rounds: 2 })).toEqual({ dialect: 'fusha', hand: 12, rounds: 1 });
  const st = { ...KALIM_DEFAULTS };
  kalim.patchSettings!(st, { dialect: 'mixed', hand: 6, rounds: 5 });
  expect(st).toEqual({ dialect: 'mixed', hand: 6, rounds: 5 });
  expect(DEFAULT_SETTINGS.kalim).toEqual(KALIM_DEFAULTS);
});
