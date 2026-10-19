/**
 * «كلمة السر» with its three word sets (everyday words, Quran words — formerly the game «كلمة قرآنية»
 * (`qword`) —, a mix), and the old `qword` id still working for older apps.
 *   bun test server/wordle.test.ts
 */
import { expect, test } from 'bun:test';

import { DEFAULT_SETTINGS, GAME_IDS, resolveGame, type PlayerInfo, type ServerMsg, type WordleSettings, type WordleView } from '../src/shared/protocol';
import { MAX_TRIES, WORD_LEN, markGuess, normWord } from '../src/shared/wordle';
import { HURRY_MS, QWORD_KEYS, REVEAL_MS, REVEAL_VERSE_MS, ROUND_MS, VALID_GUESSES, wordle, qwordValid, qwordVerse } from './games/wordle';
import { WORDLE_WORDS } from './content-games2';
import { quranFull, verseText } from './qquote-quran';
import { QWORD_ANSWERS, QWORD_CAT_LABEL, type QwordCat } from './qword-content';
import { inQuran, quranForms, quranWordIndex, verseFor, versesWith, wordsSpelling } from './qword-words';
import { Room, type Sock } from './room';
import { GameError } from './types';

const qword = wordle;

interface Job {
  at: number;
  by: string;
  key: string;
  a: any;
}

function fakeCtx(opts: { bots?: string[]; offline?: string[] } = {}) {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fxs: string[] = [];
  const ctx: any = {
    now: 1_000_000,
    jobs,
    keys,
    fxs,
    fx: (k: string, t?: string) => fxs.push(t ? `${k}:${t}` : k),
    isConnected: (id: string) => !(opts.offline ?? []).includes(id),
    isBot: (id: string) => (opts.bots ?? []).includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + delay, by, key: k, a });
    },
  };
  return ctx;
}

/** Quran words unless said otherwise (the tests that came from «كلمة قرآنية»). */
const settings = (o: Partial<WordleSettings> = {}): WordleSettings => ({ ...DEFAULT_SETTINGS.wordle, words: 'quran', ...o });
const view = (ctx: any, s: any, me: string): WordleView => qword.view(ctx, s, me) as WordleView;
const catOf = (s: any): string => QWORD_CAT_LABEL[s.words[s.round - 1].quran.cat as QwordCat];

function runBots(s: any, ctx: any, bots: string[], maxSteps = 50_000) {
  for (let step = 0; step < maxSteps && s.phase !== 'final'; step++) {
    qword.botPlan!(ctx, s, bots);
    const next = Math.min(...ctx.jobs.map((j: Job) => j.at), s.endsAt ?? Infinity);
    if (next === Infinity) throw new Error('stuck');
    ctx.now = Math.max(ctx.now, next);
    const due = ctx.jobs.filter((j: Job) => j.at <= ctx.now);
    ctx.jobs.splice(0, ctx.jobs.length, ...ctx.jobs.filter((j: Job) => j.at > ctx.now));
    for (const j of due) {
      try {
        qword.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
    }
    qword.tick!(ctx, s);
  }
  return s;
}

/** A word that is not the answer but is accepted, sharing no letter with it when possible. */
const otherWord = (answer: string) => QWORD_KEYS.find((w) => w !== answer && ![...w].some((c) => answer.includes(c))) ?? QWORD_KEYS.find((w) => w !== answer)!;

test('quran data: complete (6236 verses)', () => {
  expect(quranFull().verses.length).toBe(6236);
  expect(quranFull().surahs.length).toBe(114);
});

test('Uthmani spellings: the small alif, «وٰ», «ءا», the small yeh and the single lam are read as players spell', () => {
  const w = (s: number, a: number, i: number) => verseText(s, a)!.split(' ')[i];
  expect(quranForms(w(1, 6, 1))).toContain('الصراط'); // ٱلصِّرَٰطَ
  expect(quranForms(w(2, 43, 1))).toContain('الصلاة'); // ٱلصَّلَوٰةَ
  expect(quranForms(w(2, 31, 1))).toContain('ادم'); // ءَادَمَ
  expect(quranForms(w(2, 124, 2))).toContain('ابراهيم'); // إِبۡرَٰهِـۧمَ
  expect(quranForms(w(2, 30, 3))).toContain('للملايكة');
  expect(quranForms(w(92, 1, 0))).toContain('والليل'); // وَٱلَّيۡلِ
  expect(wordsSpelling('كافور', 76, 5).length).toBe(1); // كَافُورًا: the tanween alif dropped
  expect(inQuran('الليل')).toBe(true);
});

test('answers: ~150 hand-picked words, 5 normalised letters, distinct, all really in the Quran', () => {
  expect(QWORD_ANSWERS.length).toBeGreaterThanOrEqual(150);
  expect(new Set(QWORD_KEYS).size).toBe(QWORD_KEYS.length);
  for (const e of QWORD_ANSWERS) {
    const k = normWord(e.word);
    expect([...k].length, e.word).toBe(WORD_LEN);
    expect(/^[ء-ي]+$/.test(k)).toBe(true);
    expect(inQuran(k), e.word).toBe(true);
    expect(qwordValid().has(k)).toBe(true);
    expect(QWORD_CAT_LABEL[e.cat]).toBeTruthy();
    // the verse shown after the round exists and really contains the word
    const r = e.ref ?? verseFor(k);
    expect(r, e.word).toBeTruthy();
    expect(verseText(r![0], r![1])).toBeTruthy();
    expect(wordsSpelling(k, r![0], r![1]).length, `${e.word} ${r}`).toBeGreaterThan(0);
    if (e.ref) expect(versesWith(k).some(([s, a]) => s === e.ref![0] && a === e.ref![1])).toBe(true);
    const v = qwordVerse(e)!;
    expect(v.ref).toMatch(/^سورة .+ — الآية \d+$/);
  }
  // most answers appear on their own (not only after a joined «و»/«ف»/«ب»/«ك»)
  expect(QWORD_KEYS.filter((k) => quranWordIndex().has(k)).length).toBeGreaterThan(QWORD_KEYS.length * 0.85);
});

test('guesses: Quran words and dictionary words are accepted, others refused', () => {
  const ctx = fakeCtx();
  const s: any = qword.start(ctx, ['a', 'b'], settings({ rounds: 2 }));
  expect(s.words.length).toBe(2);
  const answer = normWord(s.words[0].word);
  // a 5-letter Quran word that is not in the «كلمة السر» dictionary
  const quranOnly = [...quranWordIndex().keys()].find((w) => w !== answer && !QWORD_KEYS.includes(w))!;
  qword.act(ctx, s, 'a', { type: 'guess', word: quranOnly });
  expect(s.rows.a.length).toBe(1);
  expect(() => qword.act(ctx, s, 'a', { type: 'guess', word: quranOnly })).toThrow(GameError); // twice
  expect(() => qword.act(ctx, s, 'a', { type: 'guess', word: 'سسسسس' })).toThrow(GameError);
  expect(() => qword.act(ctx, s, 'a', { type: 'guess', word: 'كتب' })).toThrow(GameError);
  expect(() => qword.act(ctx, s, 'a', { type: 'guess', word: 42 })).toThrow(GameError);
  // a dictionary word from «كلمة السر»
  qword.act(ctx, s, 'a', { type: 'guess', word: 'مدرسة' });
  expect(s.rows.a.length).toBe(2);
  // hamza shapes are normalised: «أعناب» = «اعناب»
  qword.act(ctx, s, 'b', { type: 'guess', word: answer === 'اعناب' ? 'يقطين' : 'أعناب' });
  expect(s.rows.b[0].guess).toBe(answer === 'اعناب' ? 'يقطين' : 'اعناب');
});

test('a round: marks, points, first-solver bonus, hurry-up, reveal with a verse', () => {
  const ctx = fakeCtx();
  const s: any = qword.start(ctx, ['a', 'b', 'c'], settings({ rounds: 1 }));
  const answer = normWord(s.words[0].word);
  const v0: any = view(ctx, s, 'a');
  expect(v0.answer).toBeNull();
  expect(v0.verse).toBeNull();
  expect(v0.hint).toBe(catOf(s));
  expect(v0.timerTotal).toBe(ROUND_MS);
  const miss = otherWord(answer);
  qword.act(ctx, s, 'a', { type: 'guess', word: miss });
  expect(s.rows.a[0].marks).toEqual(markGuess(miss, answer));
  qword.act(ctx, s, 'a', { type: 'guess', word: answer });
  expect(ctx.fxs).toContain('correct:a');
  // a is done: sees the answer, the others don't
  expect(view(ctx, s, 'a').answer).toBe(s.words[0].word);
  expect(view(ctx, s, 'b').answer).toBeNull();
  expect(view(ctx, s, 'b').others.find((o: any) => o.id === 'a')!.rows[1]).toEqual(['g', 'g', 'g', 'g', 'g']);
  qword.act(ctx, s, 'b', { type: 'guess', word: miss });
  qword.act(ctx, s, 'b', { type: 'guess', word: QWORD_KEYS.find((x) => x !== answer && x !== miss) });
  qword.act(ctx, s, 'b', { type: 'guess', word: answer });
  // 2 of 3 are done: c has a minute at most
  expect(s.hurried).toBe(true);
  expect(s.endsAt).toBe(ctx.now + HURRY_MS);
  expect(qword.turnOf!(s)).toEqual(['c']);
  ctx.now += HURRY_MS;
  qword.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  const pts = Object.fromEntries(s.results.map((r: any) => [r.id, r.points]));
  expect(pts.a).toBe((MAX_TRIES + 1 - 2) * 100 + 100); // first to solve: +100
  expect(pts.b).toBe((MAX_TRIES + 1 - 3) * 100); // second: no bonus
  expect(pts.c).toBe(0);
  const v: any = view(ctx, s, 'c');
  expect(v.answer).toBe(s.words[0].word);
  expect(v.verse.text.length).toBeGreaterThan(0);
  expect(v.verse.ref).toMatch(/^سورة /);
  expect(v.timerTotal).toBe(REVEAL_VERSE_MS);
  ctx.now += REVEAL_VERSE_MS;
  qword.tick!(ctx, s);
  expect(s.phase).toBe('final');
  expect(ctx.fxs.filter((f: string) => f.startsWith('win'))).toEqual(['win:a']);
});

test('first solver gets +100; six misses end a player', () => {
  const ctx = fakeCtx();
  const s: any = qword.start(ctx, ['a', 'b'], settings({ rounds: 1 }));
  const answer = normWord(s.words[0].word);
  qword.act(ctx, s, 'a', { type: 'guess', word: answer });
  const misses = QWORD_KEYS.filter((w) => w !== answer).slice(0, MAX_TRIES);
  for (const m of misses) qword.act(ctx, s, 'b', { type: 'guess', word: m });
  expect(ctx.fxs).toContain('buzz:b');
  expect(s.phase).toBe('reveal');
  const pts = Object.fromEntries(s.results.map((r: any) => [r.id, r.points]));
  expect(pts.a).toBe(MAX_TRIES * 100 + 100);
  expect(pts.b).toBe(0);
});

test('race mode: the round ends as soon as someone finds the word', () => {
  const ctx = fakeCtx();
  const s: any = qword.start(ctx, ['a', 'b', 'c'], settings({ rounds: 2, race: true }));
  const answer = normWord(s.words[0].word);
  qword.act(ctx, s, 'b', { type: 'guess', word: otherWord(answer) });
  expect(s.phase).toBe('play');
  qword.act(ctx, s, 'c', { type: 'guess', word: answer });
  expect(s.phase).toBe('reveal');
  expect(s.scores.c).toBe(MAX_TRIES * 100 + 100);
  expect(s.scores.a + s.scores.b).toBe(0);
  expect(view(ctx, s, 'a').race).toBe(true);
});

test('hint off: no hint during the round, the kind of word after it', () => {
  const ctx = fakeCtx();
  const s: any = qword.start(ctx, ['a'], settings({ rounds: 1, hint: false }));
  expect(view(ctx, s, 'a').hint).toBeNull();
  ctx.now += ROUND_MS;
  qword.tick!(ctx, s);
  expect(view(ctx, s, 'a').hint).toBe(catOf(s));
});

test('decks: words do not come back in the same room until all were played', () => {
  const ctx = fakeCtx();
  const seen = new Set<string>();
  for (let i = 0; i < 17; i++) {
    const s: any = qword.start(ctx, ['a'], settings({ rounds: 10 }));
    for (const w of s.words) seen.add(w.word);
  }
  expect(seen.size).toBe(QWORD_ANSWERS.length);
});

test('settings: validated and clamped', () => {
  const st = settings();
  qword.patchSettings!(st, { rounds: 50, race: 'yes', hint: 0 });
  expect(st).toEqual({ rounds: 10, words: 'quran', race: false, hint: true });
  qword.patchSettings!(st, { rounds: 0, race: true, hint: false, words: 'koran' });
  expect(st).toEqual({ rounds: 1, words: 'quran', race: true, hint: false });
  qword.patchSettings!(st, { words: 'mix' });
  expect(st.words).toBe('mix');
  qword.patchSettings!(st, { words: 'general' });
  expect(st.words).toBe('general');
});

test('onLeave and offline players: the round ends when everyone left is done', () => {
  const ctx = fakeCtx();
  const s: any = qword.start(ctx, ['a', 'b'], settings({ rounds: 2 }));
  qword.act(ctx, s, 'a', { type: 'guess', word: normWord(s.words[0].word) });
  qword.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('reveal');
  expect(s.players).toEqual(['a']);
  expect('b' in s.scores).toBe(false);
  const ctx2 = fakeCtx({ offline: ['b'] });
  const s2: any = qword.start(ctx2, ['a', 'b'], settings({ rounds: 1 }));
  qword.act(ctx2, s2, 'a', { type: 'guess', word: normWord(s2.words[0].word) });
  expect(s2.phase).toBe('reveal');
});

test('full games with bots only reach the final screen', () => {
  for (const race of [false, true]) {
    const bots = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'];
    const ctx = fakeCtx({ bots });
    const s: any = qword.start(ctx, bots, settings({ rounds: 3, race }));
    runBots(s, ctx, bots);
    expect(s.phase).toBe('final');
    expect(s.round).toBe(3);
    expect(ctx.fxs.filter((f: string) => f.startsWith('win')).length).toBe(1);
    // bots only guess accepted words and do find words
    for (const id of bots) for (const r of s.rows[id]) expect(qwordValid().has(r.guess)).toBe(true);
    expect(Object.values(s.scores).some((v: any) => v > 0)).toBe(true);
  }
  // one bot alone, and a human who never plays among bots (the clock ends the rounds)
  const ctx = fakeCtx({ bots: ['b'] });
  const s: any = qword.start(ctx, ['b'], settings({ rounds: 2 }));
  runBots(s, ctx, ['b']);
  expect(s.phase).toBe('final');
  const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const ctx2 = fakeCtx({ bots: ids.slice(1) });
  const s2: any = qword.start(ctx2, ids, settings({ rounds: 1 }));
  runBots(s2, ctx2, ids.slice(1));
  expect(s2.phase).toBe('final');
  expect(s2.scores.p0).toBe(0);
});

/* ------------------------------------------------------------------ */
/* Everyday words, the mix                                             */
/* ------------------------------------------------------------------ */

test('everyday words: dictionary guesses only, no verse, a shorter reveal; old rooms (rounds only) still start', () => {
  const ctx = fakeCtx();
  const s: any = wordle.start(ctx, ['a', 'b'], { rounds: 2 });
  expect(s.words.every((w: any) => w.quran === null && WORDLE_WORDS.includes(w.word))).toBe(true);
  const answer = s.words[0].key;
  // a Quran word that is not in the dictionary is refused here
  const quranOnly = [...quranWordIndex().keys()].find((w) => !VALID_GUESSES.has(w))!;
  expect(() => wordle.act(ctx, s, 'a', { type: 'guess', word: quranOnly })).toThrow('ليست في القاموس');
  const v0 = view(ctx, s, 'a');
  expect(v0.words).toBe('general');
  expect(v0.quran).toBe(false);
  expect(v0.hint).toBeNull();
  wordle.act(ctx, s, 'a', { type: 'guess', word: answer });
  wordle.act(ctx, s, 'b', { type: 'guess', word: answer });
  expect(s.phase).toBe('reveal');
  const v = view(ctx, s, 'b');
  expect(v.verse).toBeNull();
  expect(v.timerTotal).toBe(REVEAL_MS);
  expect(v.answer).toBe(s.words[0].word);
});

test('mix: about half of each set; where the word comes from is a hint (hidden when hints are off)', () => {
  const ctx = fakeCtx();
  const s: any = wordle.start(ctx, ['a'], settings({ words: 'mix', rounds: 4 }));
  expect(s.words.filter((w: any) => w.quran).length).toBe(2);
  // Quran words and dictionary words are both accepted
  const quranOnly = [...quranWordIndex().keys()].find((w) => !VALID_GUESSES.has(w) && w !== s.words[0].key)!;
  wordle.act(ctx, s, 'a', { type: 'guess', word: quranOnly });
  const e = s.words[0];
  expect(view(ctx, s, 'a').quran).toBe(e.quran !== null);
  expect(view(ctx, s, 'a').hint).toBe(e.quran ? QWORD_CAT_LABEL[e.quran.cat as QwordCat] : null);
  const s2: any = wordle.start(ctx, ['a'], settings({ words: 'mix', rounds: 3, hint: false }));
  expect(view(ctx, s2, 'a').quran).toBeNull();
  expect(view(ctx, s2, 'a').hint).toBeNull();
  ctx.now += ROUND_MS;
  wordle.tick!(ctx, s2);
  expect(view(ctx, s2, 'a').quran).toBe(s2.words[0].quran !== null);
  expect(view(ctx, s2, 'a').verse !== null).toBe(s2.words[0].quran !== null);
});

test('bots finish games with every word set', () => {
  for (const words of ['general', 'quran', 'mix'] as const) {
    const bots = ['b1', 'b2', 'b3'];
    const ctx = fakeCtx({ bots });
    const s: any = wordle.start(ctx, bots, settings({ words, rounds: 4 }));
    runBots(s, ctx, bots);
    expect(s.phase).toBe('final');
    expect(wordle.result!(s)!.places.flat().sort()).toEqual(bots);
    const valid = words === 'general' ? VALID_GUESSES : qwordValid();
    for (const id of bots) for (const r of s.rows[id]) expect(valid.has(r.guess)).toBe(true);
  }
});

/* ------------------------------------------------------------------ */
/* The old «كلمة قرآنية» id                                           */
/* ------------------------------------------------------------------ */

class FakeSock {
  data: { player: PlayerInfo | null; code: string | null } = { player: null, code: null };
  msgs: ServerMsg[] = [];
  send(raw: string) {
    this.msgs.push(JSON.parse(raw));
  }
  close() {}
}
const person = (id: string): PlayerInfo => ({ id, name: id, avatar: 'cat', color: '#E2475F' });

function room() {
  const r = new Room('4243', person('h'), 'quiz');
  r.join(person('h'), new FakeSock() as unknown as Sock);
  return r;
}

test('qword is gone from the game list but resolves to «كلمة السر» with the Quran words', () => {
  expect((GAME_IDS as string[]).includes('qword')).toBe(false);
  expect(resolveGame('qword')).toEqual({ game: 'wordle', settings: { words: 'quran' } });
  expect(resolveGame('wordle')).toEqual({ game: 'wordle', settings: null });
  expect(resolveGame('nope')).toBeNull();
  expect(resolveGame('toString')).toBeNull();
  expect(resolveGame(42)).toBeNull();
});

test('an older app: create / change game / settings / tournament with qword get the Quran words', () => {
  // create (server/index.ts): the room opens on wordle with the alias' settings
  const want = resolveGame('qword')!;
  const created = new Room('4244', person('h'), want.game);
  created.preset(want.game, want.settings);
  expect(created.game).toBe('wordle');
  expect(created.settings.wordle.words).toBe('quran');
  // change of game
  const r = room();
  r.roomAction('h', { type: 'game', game: 'qword' as any });
  expect(r.game).toBe('wordle');
  expect(r.settings.wordle.words).toBe('quran');
  // the old settings screen
  r.roomAction('h', { type: 'settings', game: 'wordle', patch: { words: 'general' } });
  r.roomAction('h', { type: 'settings', game: 'qword' as any, patch: { rounds: 5, race: true, hint: false } });
  expect(r.settings.wordle).toEqual({ rounds: 5, words: 'quran', race: true, hint: false });
  // the view is the merged game's
  expect(r.viewFor('h').game).toBe('wordle');
  // a league from an older app: qword is played as wordle (both listed: the mix)
  const t = room();
  t.roomAction('h', { type: 'tournament', config: { format: 'league', games: ['qword', 'quiz'] } as any });
  expect(t.viewFor('h').tournament!.games).toEqual(['wordle', 'quiz']);
  expect(t.settings.wordle.words).toBe('quran');
  const t2 = room();
  t2.roomAction('h', { type: 'tournament', config: { format: 'league', games: ['wordle', 'qword'] } as any });
  expect(t2.viewFor('h').tournament!.games).toEqual(['wordle', 'wordle']);
  expect(t2.settings.wordle.words).toBe('mix');
  const k = room();
  k.roomAction('h', { type: 'tournament', config: { format: 'knockout', game: 'qword' } as any });
  expect(k.game).toBe('wordle');
  expect(k.settings.wordle.words).toBe('quran');
});
