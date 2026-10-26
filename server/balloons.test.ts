/**
 * «البالونات» — letter rules (equivalences, «ال», diacritics, joined shapes), the setter's word check, letters
 * and points, whole-word guesses, balloons and the end of a round, the setters' rotation, the app's words,
 * bots (they finish games, the expert beats the easy one, quick decisions), no leak of the word to the
 * guessers, reconnect / autopilot, the turn timer, leaving, voice calls and settings.
 */
import { expect, test } from 'bun:test';

import {
  BALLOONS_CATS,
  BALLOONS_COUNT,
  BALLOONS_DEFAULTS,
  BALLOONS_KEYS,
  BALLOONS_WORD_BONUS,
  letterKey,
  prepareWord,
  sameWord,
  slotForms,
  type BalloonsCat,
  type BalloonsSettings,
  type BalloonsView,
} from '../src/shared/games/balloons';
import { DEFAULT_SETTINGS, type BotLevel } from '../src/shared/protocol';
import { normWord } from '../src/shared/wordle';
// @ts-expect-error — plain JS build script (exports the shared dialect blocklist)
import { DIALECT } from '../tools/wordle-dict.mjs';
import { botMove, candidates, checkSecret, pickWord, poolOf } from './balloons-words';
import { BALLOONS_REVEAL_MS, balloons, roundsFor, sanitizeBalloons, startBalloons, type BalloonsState } from './games/balloons';
import { GameError, type GameCtx } from './types';
import { BALLOONS_CAT_VOICE, voiceCategory, voiceRoundEnd } from './voice-calls-balloons';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Said = { text: string; by?: string; voice?: string };
type Ctx = GameCtx & { now: number; jobs: Job[]; said: Said[]; fxs: [string, string | undefined][]; offline: Set<string> };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert'): Ctx {
  const keys = new Set<string>();
  const offline = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: (k, t) => ctx.fxs.push([k, t]),
    say: (text, by, voice) => ctx.said.push({ text, by, voice }),
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
    fxs: [],
    offline,
  };
  return ctx;
}

/** A small seeded random (mulberry32). */
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

const P = ['a', 'b', 'c'];
const settings = (o: Partial<BalloonsSettings> = {}): BalloonsSettings => ({ ...BALLOONS_DEFAULTS, ...o });
const view = (ctx: GameCtx, s: BalloonsState, me: string) => balloons.view(ctx, s, me) as BalloonsView;
const act = (ctx: GameCtx, s: BalloonsState, by: string, type: string, extra: Record<string, unknown> = {}) => balloons.act(ctx, s, by, { type, round: s.round + 1, ...extra });
const letter = (ctx: GameCtx, s: BalloonsState, by: string, key: string) => act(ctx, s, by, 'letter', { key });
const turn = (s: BalloonsState) => balloons.turnOf!(s)[0];

/** A game of three people where `a` has just set `word` (b then c guess). */
function setGame(word: string, cat: BalloonsCat = 'animal', o: Partial<BalloonsSettings> = {}, players = P) {
  const ctx = fakeCtx();
  const s = startBalloons(ctx, players, settings(o), seeded(3));
  act(ctx, s, s.r.setter!, 'set', { cat, word });
  return { ctx, s };
}

/* ------------------------------------------------------------------ */
/* Letters                                                             */
/* ------------------------------------------------------------------ */

test('letters: one key for the alif and the hamza, ة with ه, ى ئ with ي, ؤ with و; 28 keys', () => {
  expect(BALLOONS_KEYS.length).toBe(28);
  expect(new Set(BALLOONS_KEYS).size).toBe(28);
  for (const c of 'اأإآٱء') expect(letterKey(c)).toBe('ا');
  expect(letterKey('ة')).toBe('ه');
  expect(letterKey('ى')).toBe('ي');
  expect(letterKey('ئ')).toBe('ي');
  expect(letterKey('ؤ')).toBe('و');
  expect(letterKey('ب')).toBe('ب');
  expect(letterKey('a')).toBeNull();
  expect(letterKey('ـ')).toBeNull();
});

test('words: diacritics and tatweel ignored, «ال» taken off, one Arabic word of 3–10 letters', () => {
  const p = prepareWord('  الزَّرَافَـــة ');
  expect(p.ok).toBe(true);
  if (!p.ok) return;
  expect(p.word.chars.join('')).toBe('زرافة');
  expect(p.word.keys.join('')).toBe('زرافه');
  expect(p.word.alStripped).toBe(true);
  // a short word keeps its «ال» (nothing would be left), and «الله» stays whole
  expect(prepareWord('الم').ok && (prepareWord('الم') as { word: { chars: string[] } }).word.chars.join('')).toBe('الم');
  expect((prepareWord('الله') as { ok: true; word: { alStripped: boolean } }).word.alStripped).toBe(false);
  // a hamza on the alif is part of the word
  expect((prepareWord('ألماني') as { ok: true; word: { alStripped: boolean } }).word.alStripped).toBe(false);
  expect(prepareWord('قلم رصاص')).toEqual({ ok: false, error: 'كلمة واحدة فقط، بلا مسافات' });
  expect(prepareWord('cat')).toEqual({ ok: false, error: 'حروف عربية فقط' });
  expect(prepareWord('قط3')).toEqual({ ok: false, error: 'حروف عربية فقط' });
  expect(prepareWord('قط').ok).toBe(false);
  expect(prepareWord('بابابابابابا').ok).toBe(false);
  expect(prepareWord('').ok).toBe(false);
  // Persian / Moroccan keyboard letters
  expect((prepareWord('کتاب') as { ok: true; word: { chars: string[] } }).word.chars.join('')).toBe('كتاب');
});

test('whole word: compared key by key (أ/ا, ة/ه, ى/ي, «ال» in front, diacritics)', () => {
  const keys = (prepareWord('زرافة') as { ok: true; word: { keys: string[] } }).word.keys;
  expect(sameWord('زرافه', keys)).toBe(true);
  expect(sameWord('الزرافة', keys)).toBe(true);
  expect(sameWord('زَرَافَة', keys)).toBe(true);
  expect(sameWord('زرافات', keys)).toBe(false);
  const k2 = (prepareWord('مصطفى') as { ok: true; word: { keys: string[] } }).word.keys;
  expect(sameWord('مصطفي', k2)).toBe(true);
  const k3 = (prepareWord('أرنب') as { ok: true; word: { keys: string[] } }).word.keys;
  expect(sameWord('ارنب', k3)).toBe(true);
});

test('boxes: found letters joined in their shapes; a hidden neighbour never tells its own shape', () => {
  expect(slotForms(['ق', 'ط', 'ة'])).toEqual(['قـ', 'ـطـ', 'ـة']);
  expect(slotForms(['د', 'ب', 'ب'])).toEqual(['د', 'بـ', 'ـب']);
  expect(slotForms(['ز', 'ر', 'ا', 'ف', 'ة'])).toEqual(['ز', 'ر', 'ا', 'فـ', 'ـة']);
  // next to a hidden box a letter stands alone, whatever the hidden letter is (ا or ل): no clue
  expect(slotForms(['ز', 'ر', null, 'ف', null])).toEqual(['ز', 'ر', null, 'ف', null]);
  expect(slotForms(['ك', null, 'ب'])).toEqual(['ك', null, 'ب']);
  expect(slotForms(['ك', 'ت', null, 'ب'])).toEqual(['كـ', 'ـت', null, 'ب']);
  expect(slotForms([null, null, null])).toEqual([null, null, null]);
  expect(slotForms(['س', 'م', 'ا', 'ء'])).toEqual(['سـ', 'ـمـ', 'ـا', 'ء']);
});

/* ------------------------------------------------------------------ */
/* The setter's word                                                   */
/* ------------------------------------------------------------------ */

test('setter: listed words, dictionary words and «ال» pass; typos and unknown words are refused with a hint', () => {
  expect(checkSecret('animal', 'زرافة').ok).toBe(true);
  expect(checkSecret('animal', 'قطه').ok).toBe(true);
  const al = checkSecret('country', 'المغرب');
  expect(al.ok && al.word.alStripped && al.word.chars.join('')).toBe('مغرب');
  // in another category's list (the setter chooses the category)
  expect(checkSecret('house', 'زرافة').ok).toBe(true);
  // the dictionaries (Hunspell for common nouns)
  expect(checkSecret('house', 'سيارة').ok).toBe(true);
  expect(checkSecret('school', 'مدرسة').ok).toBe(true);
  // one slip from a listed word: a suggestion
  expect(checkSecret('animal', 'عصفوور')).toEqual({ ok: false, error: 'كلمة غير معروفة — هل تقصد «عصفور»؟' });
  expect(checkSecret('animal', 'زرافا')).toEqual({ ok: false, error: 'كلمة غير معروفة — هل تقصد «زرافة»؟' });
  const bad = checkSecret('animal', 'ززز');
  expect(bad.ok).toBe(false);
  expect(checkSecret('animal', 'قط').ok).toBe(false);
  expect(checkSecret('animal', 'cat').ok).toBe(false);
});

test('app words: every one passes the setter check, single words without «ال», 3–10 letters, فصحى, enough per category', () => {
  const dia = new Set((DIALECT as string[]).map(normWord));
  for (const cat of BALLOONS_CATS) {
    const { app } = poolOf(cat);
    expect([cat, app.length >= 30]).toEqual([cat, true]);
    for (const e of app) {
      expect(e.word.startsWith('ال')).toBe(false);
      expect(e.key.length).toBeGreaterThanOrEqual(3);
      expect(e.key.length).toBeLessThanOrEqual(10);
      expect([cat, e.word, checkSecret(cat, e.word).ok]).toEqual([cat, e.word, true]);
    }
    const hits = app.filter((e) => dia.has(normWord(e.word)));
    expect([cat, hits]).toEqual([cat, []]);
  }
});

test('setter: the word goes through the check in the game, the error reaches the setter, a word played twice is refused', () => {
  const ctx = fakeCtx();
  const s = startBalloons(ctx, P, settings(), seeded(1));
  expect(s.phase).toBe('set');
  expect(turn(s)).toBe('a');
  expect(() => act(ctx, s, 'b', 'set', { cat: 'animal', word: 'قطة' })).toThrow(GameError);
  expect(() => act(ctx, s, 'a', 'set', { cat: 'nope', word: 'قطة' })).toThrow('اختر فئة الكلمة');
  expect(() => act(ctx, s, 'a', 'set', { cat: 'animal', word: 'ززز' })).toThrow(GameError);
  expect(s.phase).toBe('set');
  act(ctx, s, 'a', 'set', { cat: 'animal', word: 'الزرافة' });
  expect(s.phase).toBe('guess');
  expect(view(ctx, s, 'a').alStripped).toBe(true);
  expect(view(ctx, s, 'a').secret).toBe('زرافة');
  expect(view(ctx, s, 'b').alStripped).toBe(false);
  // the same word can't come back in this game
  s.phase = 'set';
  s.r.setter = 'b';
  expect(() => act(ctx, s, 'b', 'set', { cat: 'animal', word: 'زرافه' })).toThrow('لُعبت');
});

test('setter: «كلمة من التطبيق» — no word sent, the app picks one in the chosen category', () => {
  const ctx = fakeCtx();
  const s = startBalloons(ctx, P, settings(), seeded(5));
  act(ctx, s, 'a', 'set', { cat: 'fruit' });
  expect(s.phase).toBe('guess');
  expect(s.r.cat).toBe('fruit');
  expect(poolOf('fruit').app.some((e) => e.word === s.r.chars.join(''))).toBe(true);
});

/* ------------------------------------------------------------------ */
/* Guessing                                                            */
/* ------------------------------------------------------------------ */

test('letters: a found letter shows every box (+1 each) and plays again; a missing one pops a balloon and passes the turn', () => {
  const { ctx, s } = setGame('دجاجة');
  expect(s.r.guessers).toEqual(['b', 'c']);
  expect(turn(s)).toBe('b');
  letter(ctx, s, 'b', 'ج');
  expect(s.scores.b).toBe(2);
  expect(view(ctx, s, 'c').slots).toEqual([null, 'ج', null, 'ج', null]);
  expect(turn(s)).toBe('b');
  expect(s.r.balloons).toBe(BALLOONS_COUNT);
  letter(ctx, s, 'b', 'ق');
  expect(s.r.balloons).toBe(BALLOONS_COUNT - 1);
  expect(turn(s)).toBe('c');
  expect(view(ctx, s, 'a').last).toMatchObject({ by: 'b', kind: 'letter', text: 'ق', ok: false });
  // not your turn, a letter already tried
  expect(() => letter(ctx, s, 'b', 'د')).toThrow('ليس دورك');
  expect(() => letter(ctx, s, 'c', 'ج')).toThrow('جُرّب');
  expect(() => letter(ctx, s, 'c', 'x')).toThrow(GameError);
  expect(() => letter(ctx, s, 'a', 'د')).toThrow('ليس دورك');
  // «ه» shows the taa marbuta, «ا» the alif
  letter(ctx, s, 'c', 'ه');
  letter(ctx, s, 'c', 'ا');
  expect(view(ctx, s, 'b').slots).toEqual([null, 'ج', 'ا', 'ج', 'ة']);
  expect(s.scores.c).toBe(2);
  // the last letter completes the word: the round is won
  letter(ctx, s, 'c', 'د');
  expect(s.phase).toBe('reveal');
  expect(s.result).toMatchObject({ won: true, word: 'دجاجة', how: 'letters', by: 'c' });
  // the setter: one point per popped balloon
  expect(s.result!.gains).toEqual({ b: 2, c: 3, a: 1 });
  expect(s.scores).toEqual({ a: 1, b: 2, c: 3 });
});

test('letters: «ا» reveals every alif and hamza form, «ي» the ى, «و» the ؤ', () => {
  const { ctx, s } = setGame('مؤمن', 'job');
  letter(ctx, s, 'b', 'و');
  expect(view(ctx, s, 'c').slots).toEqual([null, 'ؤ', null, null]);
  const g = setGame('سماء', 'house');
  letter(g.ctx, g.s, 'b', 'ا');
  expect(view(g.ctx, g.s, 'c').slots).toEqual([null, null, 'ا', 'ء']);
  expect(g.s.scores.b).toBe(2);
  const m = setGame('مصطفى', 'boy');
  letter(m.ctx, m.s, 'b', 'ي');
  expect(view(m.ctx, m.s, 'c').slots).toEqual([null, null, null, null, 'ى']);
});

test('whole word: right = the hidden boxes + 2 and the round; wrong = a balloon and the turn only (no sitting out)', () => {
  const { ctx, s } = setGame('أرنب');
  letter(ctx, s, 'b', 'ر');
  act(ctx, s, 'b', 'word', { text: 'ارنط' });
  expect(s.r.balloons).toBe(BALLOONS_COUNT - 1);
  expect(turn(s)).toBe('c');
  expect(view(ctx, s, 'a').wrongWords).toEqual([{ by: 'b', text: 'ارنط' }]);
  expect(() => act(ctx, s, 'c', 'word', { text: 'ارنط' })).toThrow('جُرّبت');
  letter(ctx, s, 'c', 'ك');
  // b plays again: a wrong word didn't take b out of the round
  expect(turn(s)).toBe('b');
  act(ctx, s, 'b', 'word', { text: 'الارنب' });
  expect(s.phase).toBe('reveal');
  expect(s.result).toMatchObject({ won: true, how: 'word', by: 'b', word: 'أرنب' });
  expect(s.result!.gains.b).toBe(1 + 3 + BALLOONS_WORD_BONUS);
  expect(s.result!.gains.a).toBe(2);
});

test('balloons: the 7th wrong guess lands the basket — the round is lost, the setter gets 7', () => {
  const { ctx, s } = setGame('قطة');
  const wrong = BALLOONS_KEYS.filter((k) => !'قطه'.includes(k)).slice(0, BALLOONS_COUNT);
  for (const k of wrong) letter(ctx, s, turn(s), k);
  expect(s.phase).toBe('reveal');
  expect(s.r.balloons).toBe(0);
  expect(s.result).toMatchObject({ won: false, how: 'balloons', by: null, word: 'قطة' });
  expect(s.result!.gains).toEqual({ a: BALLOONS_COUNT });
  expect(view(ctx, s, 'b').slots).toEqual(['ق', 'ط', 'ة']);
  expect(view(ctx, s, 'b').secret).toBe('قطة');
  expect(ctx.said.at(-1)!.voice).toBe(voiceRoundEnd(false, 'قطة'));
});

test('rounds: the reveal moves on by itself (or by the host), the setters rotate seat by seat, the guessers start after the setter', () => {
  const ctx = fakeCtx();
  const s = startBalloons(ctx, ['a', 'b', 'c', 'd'], settings(), seeded(2));
  expect(s.totalRounds).toBe(4);
  const setters: string[] = [];
  const firsts: string[] = [];
  for (let r = 0; r < 4; r++) {
    expect(s.phase).toBe('set');
    setters.push(s.r.setter!);
    act(ctx, s, s.r.setter!, 'set', { cat: 'fruit' });
    firsts.push(turn(s));
    expect(s.r.guessers).not.toContain(s.r.setter);
    act(ctx, s, turn(s), 'word', { text: s.r.chars.join('') });
    expect(s.phase).toBe('reveal');
    if (r % 2) act(ctx, s, 'a', 'next');
    else {
      ctx.now += BALLOONS_REVEAL_MS + 10;
      balloons.tick!(ctx, s);
    }
  }
  expect(setters).toEqual(['a', 'b', 'c', 'd']);
  expect(firsts).toEqual(['b', 'c', 'd', 'a']);
  expect(s.phase).toBe('final');
  expect(balloons.result!(s)!.places.flat().sort()).toEqual(['a', 'b', 'c', 'd']);
  // 5 rounds with 3 players: a b c a b
  const g = startBalloons(fakeCtx(), P, settings({ rounds: 5 }), seeded(2));
  expect(g.totalRounds).toBe(5);
  expect(balloons.hostOnly).toContain('next');
});

test('app words: with the setting or with two players nobody sets — everyone guesses in turn, one round per player (3 at least)', () => {
  const ctx = fakeCtx();
  const s = startBalloons(ctx, P, settings({ appWords: true, cat: 'animal' }), seeded(4));
  expect(s.phase).toBe('guess');
  expect(s.r.setter).toBeNull();
  expect(s.r.cat).toBe('animal');
  expect(s.r.guessers).toEqual(['a', 'b', 'c']);
  expect(view(ctx, s, 'a').secret).toBeNull();
  expect(s.totalRounds).toBe(3);
  const two = startBalloons(fakeCtx(), ['a', 'b'], settings(), seeded(4));
  expect(two.appMode).toBe(true);
  expect(two.phase).toBe('guess');
  expect(two.totalRounds).toBe(3);
  expect(roundsFor(settings({ rounds: 10 }), 2, true)).toBe(10);
  expect(roundsFor(settings(), 6, true)).toBe(6);
  // the second round starts with the next player, never the same word twice
  const words = new Set<string>();
  const ctx2 = fakeCtx();
  const g = startBalloons(ctx2, ['a', 'b'], settings({ rounds: 10 }), seeded(9));
  for (let r = 0; r < 10; r++) {
    words.add(g.r.keys.join(''));
    expect(turn(g)).toBe(r % 2 ? 'b' : 'a');
    act(ctx2, g, turn(g), 'word', { text: g.r.chars.join('') });
    act(ctx2, g, 'a', 'next');
  }
  expect(words.size).toBe(10);
  // the round's winner gets no setter points
  expect(Object.values(g.scores).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
});

test('turn timer: when the time is up the turn passes, no balloon pops; off by default', () => {
  const { ctx, s } = setGame('دجاجة', 'animal', { turnSec: 15 });
  expect(view(ctx, s, 'b').endsAt).toBe(ctx.now + 15_000);
  ctx.now += 14_000;
  expect(balloons.tick!(ctx, s)).toBe(false);
  // a found letter starts a fresh turn for the same player
  letter(ctx, s, 'b', 'ج');
  ctx.now += 14_000;
  expect(balloons.tick!(ctx, s)).toBe(false);
  ctx.now += 1_500;
  expect(balloons.tick!(ctx, s)).toBe(true);
  expect(turn(s)).toBe('c');
  expect(s.r.balloons).toBe(BALLOONS_COUNT);
  expect(s.last).toMatchObject({ by: 'b', kind: 'timeout' });
  const g = setGame('دجاجة');
  expect(view(g.ctx, g.s, 'b').endsAt).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Secrecy, reconnect, leaving                                         */
/* ------------------------------------------------------------------ */

test('secrecy: a guesser never gets the hidden letters — only the boxes found; the setter sees the word', () => {
  const ctx = fakeCtx();
  const s = startBalloons(ctx, P, settings(), seeded(8));
  const hiddenWord = 'خروف';
  // while the setter types: no category, no boxes
  expect(view(ctx, s, 'b')).toMatchObject({ cat: null, slots: [], secret: null });
  act(ctx, s, 'a', 'set', { cat: 'animal', word: hiddenWord });
  const leaks = (me: string) => {
    const v = view(ctx, s, me);
    const json = JSON.stringify(v);
    expect(v.secret).toBeNull();
    expect(json.includes(hiddenWord)).toBe(false);
    s.r.found.forEach((f, i) => expect(v.slots[i]).toBe(f ? s.r.chars[i] : null));
    return json;
  };
  leaks('b');
  leaks('c');
  letter(ctx, s, 'b', 'ر');
  letter(ctx, s, 'b', 'و');
  const json = leaks('c');
  expect(json.includes('خ')).toBe(false);
  expect(json.includes('ف')).toBe(false);
  // nothing said aloud or under the turn bar names the word before the end
  for (const x of ctx.said) {
    expect(x.text.includes(hiddenWord)).toBe(false);
    expect((x.voice ?? '').includes(hiddenWord)).toBe(false);
  }
  expect(view(ctx, s, 'a').secret).toBe(hiddenWord);
  // a spectator neither
  expect(view(ctx, s, 'zz').secret).toBeNull();
  act(ctx, s, 'b', 'word', { text: hiddenWord });
  expect(view(ctx, s, 'c').secret).toBe(hiddenWord);
});

test('reconnect: an offline phone gets the same view back; the autopilot sets the word or chooses a letter for a person away', () => {
  const ctx = fakeCtx();
  const s = startBalloons(ctx, P, settings(), seeded(6));
  // a is away while setting: the room's autopilot plays for a
  ctx.offline.add('a');
  balloons.botPlan!(ctx, s, ['a']);
  const job = ctx.jobs.find((j) => j.by === 'a')!;
  expect(job.a.type).toBe('set');
  ctx.now = job.at;
  balloons.act(ctx, s, 'a', job.a);
  expect(s.phase).toBe('guess');
  // b is away on b's turn: the autopilot chooses a letter
  ctx.offline.add('b');
  const before = JSON.stringify(view(ctx, s, 'b'));
  ctx.offline.delete('b');
  expect(JSON.stringify(view(ctx, s, 'b'))).toBe(before);
  ctx.offline.add('b');
  balloons.botPlan!(ctx, s, ['b']);
  const g = ctx.jobs.find((j) => j.by === 'b')!;
  expect(['letter', 'word']).toContain(g.a.type);
  ctx.now = g.at;
  balloons.act(ctx, s, 'b', g.a);
  expect(s.r.tried.length + s.r.wrongWords.length).toBe(1);
  // back: the view is the game's, as for everyone
  ctx.offline.delete('b');
  expect(view(ctx, s, 'b').tried).toEqual(view(ctx, s, 'c').tried);
});

test('leaving: the setter leaves → the round ends without points; the guesser on turn leaves → the next one plays; one player left → the end', () => {
  const g1 = setGame('دجاجة', 'animal', {}, ['a', 'b', 'c', 'd']);
  letter(g1.ctx, g1.s, 'b', 'ق');
  balloons.onLeave!(g1.ctx, g1.s, 'a');
  expect(g1.s.phase).toBe('reveal');
  expect(g1.s.result).toMatchObject({ how: 'left', won: false });
  expect(g1.s.scores.a).toBeUndefined();
  const g2 = setGame('دجاجة', 'animal', {}, ['a', 'b', 'c', 'd']);
  expect(turn(g2.s)).toBe('b');
  balloons.onLeave!(g2.ctx, g2.s, 'b');
  expect(turn(g2.s)).toBe('c');
  letter(g2.ctx, g2.s, 'c', 'ق');
  expect(turn(g2.s)).toBe('d');
  letter(g2.ctx, g2.s, 'd', 'ك');
  expect(turn(g2.s)).toBe('c');
  balloons.onLeave!(g2.ctx, g2.s, 'd');
  balloons.onLeave!(g2.ctx, g2.s, 'c');
  expect(g2.s.phase).toBe('final');
  // the setter leaves while typing: the next setter's turn
  const ctx = fakeCtx();
  const s = startBalloons(ctx, ['a', 'b', 'c', 'd'], settings(), seeded(1));
  balloons.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('set');
  expect(s.r.setter).toBe('b');
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** Runs a game where everyone is a bot until the end (the room's loop: plan, run the next job, tick). */
function runBots(players: string[], level: BotLevel, o: Partial<BalloonsSettings>, seed: number) {
  const ctx = fakeCtx(players, level);
  const s = startBalloons(ctx, players, settings(o), seeded(seed));
  for (let guard = 0; guard < 5000 && s.phase !== 'final'; guard++) {
    balloons.botPlan!(ctx, s, players);
    ctx.jobs.sort((x, y) => x.at - y.at);
    const job = ctx.jobs.shift();
    if (!job) {
      ctx.now += 1000;
      balloons.tick!(ctx, s);
      continue;
    }
    ctx.now = Math.max(ctx.now, job.at);
    try {
      balloons.act(ctx, s, job.by, job.a);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
    }
    balloons.tick!(ctx, s);
  }
  return { ctx, s };
}

test('bots: set words and guess letters until the podium, at every strength, with a human pace', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const { ctx, s } = runBots(['r1', 'r2', 'r3', 'r4'], level, {}, 11);
    expect([level, s.phase]).toEqual([level, 'final']);
    expect(balloons.result!(s)!.places.flat().sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(Object.values(s.scores).some((x) => x > 0)).toBe(true);
    void ctx;
    const two = runBots(['r1', 'r2'], level, { rounds: 5 }, 12);
    expect(two.s.phase).toBe('final');
  }
  // delays: a bot thinks for a second or more
  const ctx = fakeCtx(['r1', 'r2', 'r3'], 'expert');
  const s = startBalloons(ctx, ['r1', 'r2', 'r3'], settings(), seeded(1));
  balloons.botPlan!(ctx, s, ['r1', 'r2', 'r3']);
  expect(ctx.jobs[0].at - ctx.now).toBeGreaterThanOrEqual(2000);
  ctx.now = ctx.jobs[0].at;
  balloons.act(ctx, s, ctx.jobs[0].by, ctx.jobs[0].a);
  balloons.botPlan!(ctx, s, ['r1', 'r2', 'r3']);
  expect(ctx.jobs[1].at - ctx.now).toBeGreaterThanOrEqual(1000);
});

/** One guesser against one word: how many balloons it needs, and whether it finds the word. */
function solo(level: BotLevel, cat: BalloonsCat, word: string, rnd: () => number) {
  const p = prepareWord(word);
  if (!p.ok) throw new Error(word);
  const keys = p.word.keys;
  const found = keys.map(() => false);
  const tried = new Set<string>();
  const wrongWords = new Set<string>();
  let left = BALLOONS_COUNT;
  let maxMs = 0;
  while (left > 0) {
    const t = performance.now();
    const m = botMove(level, { cat, slots: keys.map((k, i) => (found[i] ? k : null)), tried, wrongWords, balloons: left }, rnd);
    maxMs = Math.max(maxMs, performance.now() - t);
    if (m.kind === 'word') {
      if (sameWord(m.text, keys)) return { won: true, left, maxMs };
      wrongWords.add((prepareWord(m.text) as { ok: true; word: { keys: string[] } }).word.keys.join(''));
      left--;
      continue;
    }
    expect(tried.has(m.key)).toBe(false);
    tried.add(m.key);
    let hit = false;
    keys.forEach((k, i) => {
      if (k === m.key) {
        found[i] = true;
        hit = true;
      }
    });
    if (!hit) left--;
    if (found.every(Boolean)) return { won: true, left, maxMs };
  }
  return { won: false, left: 0, maxMs };
}

test('bots: the expert finds far more words than the easy bot, with fewer balloons; every decision is quick', () => {
  const rnd = seeded(21);
  const tally: Record<string, { won: number; left: number; maxMs: number }> = { easy: { won: 0, left: 0, maxMs: 0 }, smart: { won: 0, left: 0, maxMs: 0 }, expert: { won: 0, left: 0, maxMs: 0 } };
  let n = 0;
  for (const cat of BALLOONS_CATS) {
    for (let i = 0; i < 10; i++) {
      const w = pickWord(cat, 'app', rnd).word;
      n++;
      for (const level of ['easy', 'smart', 'expert'] as const) {
        const r = solo(level, cat, w, rnd);
        tally[level].won += r.won ? 1 : 0;
        tally[level].left += r.left;
        tally[level].maxMs = Math.max(tally[level].maxMs, r.maxMs);
      }
    }
  }
  expect(tally.expert.won).toBeGreaterThan(tally.easy.won + n * 0.25);
  expect(tally.expert.won).toBeGreaterThanOrEqual(tally.smart.won);
  expect(tally.smart.won).toBeGreaterThan(tally.easy.won);
  expect(tally.expert.left).toBeGreaterThan(tally.smart.left);
  expect(tally.expert.left).toBeGreaterThan(tally.easy.left);
  expect(tally.expert.won / n).toBeGreaterThan(0.8);
  for (const level of ['easy', 'smart', 'expert']) expect(tally[level].maxMs).toBeLessThan(200);
});

test('bots: candidates come from the public board only (found boxes, tried letters, refused words)', () => {
  const slots = ['ز', 'ر', null, 'ف', null];
  const c = candidates({ cat: 'animal', slots, tried: new Set(['ز', 'ر', 'ف', 'ب']), wrongWords: new Set(), balloons: 6 });
  expect(c.map((e) => e.word)).toContain('زرافة');
  for (const e of c) expect(e.key.length).toBe(5);
  const none = candidates({ cat: 'animal', slots, tried: new Set(['ز', 'ر', 'ف', 'ا']), wrongWords: new Set(), balloons: 6 });
  expect(none.map((e) => e.word)).not.toContain('زرافة');
  // one candidate left: the expert says the word
  const m = botMove('expert', { cat: 'animal', slots: ['ز', 'ر', 'ا', 'ف', null], tried: new Set(['ز', 'ر', 'ا', 'ف']), wrongWords: new Set(), balloons: 7 }, seeded(1));
  expect(m).toEqual({ kind: 'word', text: 'زرافة' });
  // bot setters pick by strength: the easy ones short common words, the expert longer ones
  const rnd = seeded(3);
  const avg = (level: BotLevel) => Array.from({ length: 60 }, () => pickWord('animal', level, rnd).key.length).reduce((x, y) => x + y, 0) / 60;
  expect(avg('expert')).toBeGreaterThan(avg('easy') + 1);
});

/* ------------------------------------------------------------------ */
/* Voice, settings                                                     */
/* ------------------------------------------------------------------ */

test('voice: the category when the guessing starts, the word only once the round is over, the winner at the end', () => {
  const { ctx, s } = setGame('أرنب');
  expect(ctx.said.at(-1)!.voice).toBe(voiceCategory('animal'));
  expect(voiceCategory('animal')).toBe('الفِئَةُ حَيَوَانٌ');
  for (const c of BALLOONS_CATS) expect(BALLOONS_CAT_VOICE[c]).toMatch(/^[ء-ْ ]+$/);
  letter(ctx, s, 'b', 'ر');
  expect(ctx.said.at(-1)!.voice).toBeUndefined();
  act(ctx, s, 'b', 'word', { text: 'أرنب' });
  expect(ctx.said.at(-1)!.voice).toBe(voiceRoundEnd(true, 'أرنب'));
  expect(voiceRoundEnd(true, 'أرنب')).toBe('أَحْسَنْتُمْ، الكَلِمَةُ أرنب');
  // texts: noun-first, the player's name never with a verb about them
  for (const x of ctx.said) expect(x.text).not.toMatch(/(خمّن|اختار|وجد|عرف) اسم-/);
});

test('settings: defaults, sanitising and the lobby patch', () => {
  expect(DEFAULT_SETTINGS.balloons).toEqual({ rounds: 0, appWords: false, cat: 'mix', turnSec: 0 });
  expect(sanitizeBalloons({ rounds: 7, turnSec: 20, cat: 'nope' as BalloonsCat, appWords: 1 as unknown as boolean })).toEqual({ rounds: 5, appWords: false, cat: 'mix', turnSec: 15 });
  const st = { ...BALLOONS_DEFAULTS };
  balloons.patchSettings!(st, { rounds: 10, appWords: true, cat: 'tool', turnSec: 30 });
  expect(st).toEqual({ rounds: 10, appWords: true, cat: 'tool', turnSec: 30 });
  balloons.patchSettings!(st, { rounds: 'x', appWords: 'y', cat: 'nope', turnSec: null });
  expect(st).toEqual({ rounds: 10, appWords: true, cat: 'tool', turnSec: 30 });
});
