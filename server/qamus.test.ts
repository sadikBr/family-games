/**
 * «القاموس العجيب» — the content (enough words, vowel marks, no duplicates, sensible lengths, decoys that are
 * not the real meaning), comparing definitions, the full flow (write → vote → reveal → scores), the own-vote
 * rule, timeouts (no definition, no vote, drafts), the +3 rule (found by the app or marked by the host), no
 * leak in the views while writing and voting, bots (decoys, votes, levels, a whole game), leaving mid-round,
 * settings and the final places.
 */
import { expect, test } from 'bun:test';

import { QAMUS_DEFAULTS, QAMUS_POINTS, QAMUS_TEXT_MAX, cleanDefinition, defWords, sameMeaning, scoreRound, type QamusSettings, type QamusView } from '../src/shared/games/qamus';
import { DEFAULT_SETTINGS, type BotLevel } from '../src/shared/protocol';
import { QAMUS_BOT_FIND, QAMUS_REVEAL_MS, botChoice, botDecoy, qamus, qamusVoteMs, sanitizeQamus, startQamus, type QamusState } from './games/qamus';
import { QAMUS_CATS, QAMUS_SPARE, QAMUS_WORDS, bareWord } from './qamus-words';
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

const settings = (o: Partial<QamusSettings> = {}): QamusSettings => ({ ...QAMUS_DEFAULTS, ...o });
const act = (ctx: Ctx, s: QamusState, by: string, a: Record<string, unknown>) => qamus.act(ctx, s, by, { round: s.round + 1, ...a } as never);
const view = (ctx: Ctx, s: QamusState, me: string) => qamus.view(ctx, s, me) as QamusView;
const realId = (s: QamusState) => s.cards.find((c) => c.real)!.id;
const cardOf = (s: QamusState, author: string) => s.cards.find((c) => c.authors.includes(author))!.id;

/** Three players, a known word, everyone writes a different fake. */
function written(ids = ['aaaa', 'bbbb', 'cccc'], ctx = fakeCtx(), o: Partial<QamusSettings> = {}) {
  const s = startQamus(ctx, ids, settings(o), seeded(7));
  s.entry = QAMUS_WORDS.find((w) => w.word === 'الخِرْنِق')!;
  const fakes = ['حجر أملس يوضع في البئر', 'طائر يغرّد عند المساء', 'سيف قصير مستقيم', 'ثوب من الصوف الأبيض', 'نهر صغير بين جبلين'];
  ids.forEach((p, i) => act(ctx, s, p, { type: 'send', text: fakes[i] }));
  return { s, ctx };
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('content: 150+ words, every family well stocked, vowel marks, «ال»', () => {
  expect(QAMUS_WORDS.length).toBeGreaterThanOrEqual(150);
  for (const cat of Object.keys(QAMUS_CATS)) expect(QAMUS_WORDS.filter((w) => w.cat === cat).length).toBeGreaterThanOrEqual(10);
  for (const w of QAMUS_WORDS) {
    expect(w.word).toMatch(/^ال/);
    expect(w.word).toMatch(/[\u064B-\u0652]|\u0622/); // vowel marks
    expect(bareWord(w.word)).toMatch(/^[\u0621-\u064A]+$/);
    expect(w.word.includes(' ')).toBe(false);
  }
});

test('content: no duplicate words or definitions', () => {
  const words = QAMUS_WORDS.map((w) => bareWord(w.word));
  expect(new Set(words).size).toBe(words.length);
  const defs = QAMUS_WORDS.map((w) => defWords(w.def).join(' '));
  expect(new Set(defs).size).toBe(defs.length);
  const twins: string[] = [];
  for (let i = 0; i < QAMUS_WORDS.length; i++)
    for (let j = i + 1; j < QAMUS_WORDS.length; j++) if (sameMeaning(QAMUS_WORDS[i].def, QAMUS_WORDS[j].def)) twins.push(`${QAMUS_WORDS[i].word} ~ ${QAMUS_WORDS[j].word}`);
  expect(twins).toEqual([]);
});

test('content: sensible lengths; 2–4 decoys, all different from each other and from the real meaning', () => {
  const bad: string[] = [];
  for (const w of QAMUS_WORDS) {
    const len = [...w.def].length;
    if (len < 2 || len > 60 || defWords(w.def).length < 1) bad.push(`${w.word}: def length ${len}`);
    if (w.decoys.length < 2 || w.decoys.length > 4) bad.push(`${w.word}: ${w.decoys.length} decoys`);
    for (const d of w.decoys) {
      const dl = [...d].length;
      if (dl < 3 || dl > QAMUS_TEXT_MAX) bad.push(`${w.word}: decoy «${d}» length ${dl}`);
      if (sameMeaning(d, w.def)) bad.push(`${w.word}: decoy «${d}» says the real meaning`);
      if (bareWord(d) === bareWord(w.word)) bad.push(`${w.word}: decoy is the word`);
    }
    for (let i = 0; i < w.decoys.length; i++) for (let j = i + 1; j < w.decoys.length; j++) if (sameMeaning(w.decoys[i], w.decoys[j])) bad.push(`${w.word}: twin decoys`);
  }
  for (const [cat, list] of Object.entries(QAMUS_SPARE)) {
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const d of list) for (const w of QAMUS_WORDS.filter((x) => x.cat === cat)) if (sameMeaning(d, w.def)) bad.push(`spare «${d}» ~ ${w.word}`);
  }
  expect(bad).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* Comparing definitions                                               */
/* ------------------------------------------------------------------ */

test('same meaning: vowel marks, «ال», hamza shapes, punctuation, a slip, one more word', () => {
  expect(sameMeaning('ولد الأرنب', 'ولدُ الأرنبِ.')).toBe(true);
  expect(sameMeaning('ولد الأرنب', 'ولد الارنب')).toBe(true);
  expect(sameMeaning('ولد الأرنب', 'هو ولد الأرنب')).toBe(true);
  expect(sameMeaning('ولد الأرنب', 'ولد الأرنب الصغير')).toBe(true);
  expect(sameMeaning('ولد الضَّبّ', 'ولد الدب')).toBe(false);
  expect(sameMeaning('ولد الضَّبُع', 'ولد الذئب من الضبع')).toBe(false);
  expect(sameMeaning('شجر كثير الشوك', 'شجر عظيم كثير الشوك')).toBe(false);
  expect(sameMeaning('دويبة سوداء تدحرج كرات الروث', 'دويبة سوداء تدحرج الروث')).toBe(true);
  expect(sameMeaning('طائر جارح يخطف الطعام', 'طائر جارح يخطف الطعم')).toBe(true);
  expect(sameMeaning('ولد الأرنب', 'ولد الثعلب')).toBe(false);
  expect(sameMeaning('ولد الأرنب', 'أرنب')).toBe(false);
  expect(sameMeaning('صوت الغنم', 'صوت المعز')).toBe(false);
  expect(sameMeaning('ولد الأرنب', 'حجر أملس يوضع في البئر')).toBe(false);
  expect(cleanDefinition('  ولد \n  الأرنب  ')).toBe('ولد الأرنب');
  expect([...cleanDefinition('ب'.repeat(200))].length).toBe(QAMUS_TEXT_MAX);
});

/* ------------------------------------------------------------------ */
/* The flow                                                            */
/* ------------------------------------------------------------------ */

test('flow: write → vote → reveal → scores, then the next round', () => {
  const { s, ctx } = written();
  expect(s.phase).toBe('vote');
  expect(s.cards.length).toBe(4);
  expect(s.cards.filter((c) => c.real).length).toBe(1);
  // aaaa finds the real one, bbbb falls for cccc's, cccc falls for aaaa's
  act(ctx, s, 'aaaa', { type: 'vote', card: realId(s) });
  act(ctx, s, 'bbbb', { type: 'vote', card: cardOf(s, 'cccc') });
  expect(s.phase).toBe('vote');
  act(ctx, s, 'cccc', { type: 'vote', card: cardOf(s, 'aaaa') });
  expect(s.phase).toBe('reveal');
  expect(s.gains).toEqual({ aaaa: QAMUS_POINTS.real + QAMUS_POINTS.fooled, bbbb: 0, cccc: QAMUS_POINTS.fooled });
  expect(s.scores).toEqual({ aaaa: 3, bbbb: 0, cccc: 1 });
  const v = view(ctx, s, 'bbbb');
  expect(v.reveal!.cards[0].real).toBe(true);
  expect(v.reveal!.cards[0].text).toBe('ولد الأرنب');
  expect(v.reveal!.cards[0].voters).toEqual(['aaaa']);
  expect(v.reveal!.cards.find((c) => c.authors.includes('cccc'))!.voters).toEqual(['bbbb']);
  expect(v.reveal!.votes).toEqual({ aaaa: realId(s), bbbb: cardOf(s, 'cccc'), cccc: cardOf(s, 'aaaa') });
  // the host moves on (host-only), a new word
  expect(qamus.hostOnly).toContain('next');
  const word = s.entry.word;
  act(ctx, s, 'aaaa', { type: 'next' });
  expect(s.phase).toBe('write');
  expect(s.round).toBe(1);
  expect(s.entry.word).not.toBe(word);
  expect(view(ctx, s, 'aaaa').reveal).toBeNull();
});

test('a vote can change until everyone has voted; votes from another round are ignored', () => {
  const { s, ctx } = written();
  act(ctx, s, 'aaaa', { type: 'vote', card: cardOf(s, 'bbbb') });
  act(ctx, s, 'aaaa', { type: 'vote', card: realId(s) });
  expect(s.votes.aaaa).toBe(realId(s));
  qamus.act(ctx, s, 'bbbb', { type: 'vote', round: 9, card: realId(s) });
  expect(s.votes.bbbb).toBeUndefined();
});

test('own vote forbidden (also on a card written by two)', () => {
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings(), seeded(3));
  s.entry = QAMUS_WORDS.find((w) => w.word === 'الدَّغْفَل')!;
  act(ctx, s, 'aaaa', { type: 'send', text: 'سيف قصير' });
  act(ctx, s, 'bbbb', { type: 'send', text: 'سيفٌ قصيرٌ' });
  act(ctx, s, 'cccc', { type: 'send', text: 'نبات أخضر' });
  expect(s.cards.length).toBe(3);
  const twin = cardOf(s, 'aaaa');
  expect(s.cards.find((c) => c.id === twin)!.authors).toEqual(['aaaa', 'bbbb']);
  expect(() => act(ctx, s, 'aaaa', { type: 'vote', card: twin })).toThrow(GameError);
  expect(() => act(ctx, s, 'bbbb', { type: 'vote', card: twin })).toThrow(GameError);
  expect(s.votes.aaaa).toBeUndefined();
  // a vote for the twin gives a point to each author
  act(ctx, s, 'cccc', { type: 'vote', card: twin });
  act(ctx, s, 'aaaa', { type: 'vote', card: realId(s) });
  act(ctx, s, 'bbbb', { type: 'vote', card: cardOf(s, 'cccc') });
  expect(s.gains).toEqual({ aaaa: 3, bbbb: 1, cccc: 1 });
});

test('writing: too short refused, a sent definition can be taken back, drafts are private', () => {
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings(), seeded(1));
  expect(() => act(ctx, s, 'aaaa', { type: 'send', text: ' ب ' })).toThrow(GameError);
  act(ctx, s, 'aaaa', { type: 'send', text: 'حجر أملس' });
  expect(view(ctx, s, 'aaaa').mine).toEqual({ text: 'حجر أملس', sent: true });
  act(ctx, s, 'aaaa', { type: 'edit' });
  expect(view(ctx, s, 'aaaa').mine).toEqual({ text: 'حجر أملس', sent: false });
  act(ctx, s, 'aaaa', { type: 'type', text: 'حجر أملس جداً' });
  expect(view(ctx, s, 'aaaa').mine!.text).toBe('حجر أملس جداً');
  expect(view(ctx, s, 'bbbb').mine).toEqual({ text: '', sent: false });
  expect(JSON.stringify(view(ctx, s, 'bbbb'))).not.toContain('حجر');
});

test('timeouts: a draft is sent, an empty box writes nothing; no vote = no points', () => {
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc', 'dddd'], settings({ seconds: 60 }), seeded(2));
  s.entry = QAMUS_WORDS.find((w) => w.word === 'الحِسْل')!;
  act(ctx, s, 'aaaa', { type: 'send', text: 'حجر أملس' });
  act(ctx, s, 'bbbb', { type: 'type', text: 'طائر صغير' }); // never sent
  act(ctx, s, 'cccc', { type: 'type', text: 'ب' }); // too short
  ctx.now += 59_000;
  expect(qamus.tick!(ctx, s)).toBe(false);
  ctx.now += 1_000;
  expect(qamus.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('vote');
  expect(s.wrote).toEqual({ aaaa: 'حجر أملس', bbbb: 'طائر صغير', cccc: null, dddd: null });
  expect(s.cards.length).toBe(3);
  expect(s.voters).toEqual(['aaaa', 'bbbb', 'cccc', 'dddd']); // no definition: still votes
  act(ctx, s, 'cccc', { type: 'vote', card: cardOf(s, 'aaaa') });
  act(ctx, s, 'dddd', { type: 'vote', card: realId(s) });
  ctx.now += qamusVoteMs(3);
  expect(qamus.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('reveal');
  expect(s.gains).toEqual({ aaaa: 1, bbbb: 0, cccc: 0, dddd: 2 });
  expect(view(ctx, s, 'aaaa').reveal!.votes.aaaa).toBeNull();
  // the reveal ends by itself
  ctx.now += QAMUS_REVEAL_MS;
  expect(qamus.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('write');
});

test('nobody wrote anything: straight to the reveal', () => {
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings(), seeded(2));
  ctx.now += 90_000;
  qamus.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  expect(s.cards.length).toBe(1);
  expect(Object.values(s.gains)).toEqual([0, 0, 0]);
});

test('people away don\'t hold up the writing or the vote', () => {
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings(), seeded(2));
  ctx.offline.add('cccc');
  act(ctx, s, 'aaaa', { type: 'send', text: 'حجر أملس' });
  act(ctx, s, 'bbbb', { type: 'send', text: 'طائر صغير' });
  expect(s.phase).toBe('vote');
  act(ctx, s, 'aaaa', { type: 'vote', card: realId(s) });
  act(ctx, s, 'bbbb', { type: 'vote', card: realId(s) });
  expect(s.phase).toBe('reveal');
});

/* ------------------------------------------------------------------ */
/* +3                                                                  */
/* ------------------------------------------------------------------ */

test('+3: a definition that says the real meaning is merged with it; its author sits the vote out', () => {
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings(), seeded(4));
  s.entry = QAMUS_WORDS.find((w) => w.word === 'الخِرْنِق')!;
  act(ctx, s, 'aaaa', { type: 'send', text: 'ولدُ الأرنب' });
  act(ctx, s, 'bbbb', { type: 'send', text: 'حجر أملس' });
  act(ctx, s, 'cccc', { type: 'send', text: 'طائر صغير' });
  expect(s.knew).toEqual(['aaaa']);
  expect(s.cards.length).toBe(3); // the real one, bbbb's, cccc's
  expect(s.voters).toEqual(['bbbb', 'cccc']);
  const va = view(ctx, s, 'aaaa');
  expect(va.iKnew).toBe(true);
  expect(va.done).toContain('aaaa');
  expect(view(ctx, s, 'bbbb').iKnew).toBe(false);
  act(ctx, s, 'aaaa', { type: 'vote', card: realId(s) }); // ignored
  expect(s.votes.aaaa).toBeUndefined();
  act(ctx, s, 'bbbb', { type: 'vote', card: realId(s) });
  act(ctx, s, 'cccc', { type: 'vote', card: cardOf(s, 'bbbb') });
  expect(s.phase).toBe('reveal');
  expect(s.gains).toEqual({ aaaa: QAMUS_POINTS.knew, bbbb: QAMUS_POINTS.real + QAMUS_POINTS.fooled, cccc: 0 });
  expect(view(ctx, s, 'cccc').reveal!.knew).toEqual(['aaaa']);
});

test('+3: the host marks a fake «صحيح» (and can undo it)', () => {
  const { s, ctx } = written();
  const a = cardOf(s, 'aaaa');
  act(ctx, s, 'aaaa', { type: 'vote', card: realId(s) });
  act(ctx, s, 'bbbb', { type: 'vote', card: a });
  act(ctx, s, 'cccc', { type: 'vote', card: a });
  expect(s.gains).toEqual({ aaaa: 4, bbbb: 0, cccc: 0 });
  expect(qamus.hostOnly).toContain('mark');
  act(ctx, s, 'cccc', { type: 'mark', card: a, on: true });
  expect(s.gains).toEqual({ aaaa: QAMUS_POINTS.knew + QAMUS_POINTS.real, bbbb: QAMUS_POINTS.real, cccc: QAMUS_POINTS.real });
  expect(s.scores).toEqual({ aaaa: 5, bbbb: 2, cccc: 2 });
  const r = view(ctx, s, 'bbbb').reveal!;
  expect(r.knew).toEqual(['aaaa']);
  expect(r.cards[1].marked).toBe(true); // right after the real one
  act(ctx, s, 'cccc', { type: 'mark', card: a, on: false });
  expect(s.scores).toEqual({ aaaa: 4, bbbb: 0, cccc: 0 });
  // the real card can't be marked; marks only in the reveal
  act(ctx, s, 'cccc', { type: 'mark', card: realId(s) });
  expect(s.cards.find((c) => c.real)!.marked).toBe(false);
});

test('scoreRound: nobody gains from their own card, people who left get nothing', () => {
  const r = scoreRound({
    players: ['a', 'b'],
    cards: [
      { id: 'r', real: true, authors: [], marked: false },
      { id: 'x', real: false, authors: ['a', 'gone'], marked: false },
    ],
    votes: { a: 'x', b: 'x', gone: 'r' },
    knewBefore: ['gone'],
  });
  expect(r.gains).toEqual({ a: 1, b: 0 });
  expect(r.knew).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* No leak                                                             */
/* ------------------------------------------------------------------ */

test('no leak: writing shows only my own text, voting shows no authors and no «real»', () => {
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings(), seeded(5));
  s.entry = QAMUS_WORDS.find((w) => w.word === 'الخِرْنِق')!;
  act(ctx, s, 'aaaa', { type: 'send', text: 'حجر أملس' });
  act(ctx, s, 'bbbb', { type: 'type', text: 'طائر صغير' });
  for (const me of ['bbbb', 'cccc', 'zzzz']) {
    const j = JSON.stringify(view(ctx, s, me));
    expect(j).not.toContain('حجر أملس');
    expect(j).not.toContain('الأرنب');
  }
  expect(JSON.stringify(view(ctx, s, 'cccc'))).not.toContain('طائر صغير');
  expect(view(ctx, s, 'cccc').done).toEqual(['aaaa']);
  act(ctx, s, 'bbbb', { type: 'send', text: 'طائر صغير' });
  act(ctx, s, 'cccc', { type: 'send', text: 'نهر صغير' });
  expect(s.phase).toBe('vote');
  for (const me of ['aaaa', 'bbbb', 'cccc', 'zzzz']) {
    const v = view(ctx, s, me);
    expect(v.reveal).toBeNull();
    expect(v.cards!.length).toBe(4);
    for (const c of v.cards!) expect(Object.keys(c).sort()).toEqual(['id', 'mine', 'text']);
    expect(v.cards!.filter((c) => c.mine).length).toBe(me === 'zzzz' ? 0 : 1);
    if (me !== 'zzzz') expect(v.cards!.find((c) => c.mine)!.id).toBe(cardOf(s, me));
    const j = JSON.stringify(v);
    expect(j).not.toContain('authors');
    expect(j).not.toContain('"real"');
    for (const c of v.cards!) for (const p of ['aaaa', 'bbbb', 'cccc']) expect(c.id).not.toContain(p);
  }
  act(ctx, s, 'aaaa', { type: 'vote', card: realId(s) });
  // who voted is public, what they voted is not
  const vb = view(ctx, s, 'bbbb');
  expect(vb.done).toEqual(['aaaa']);
  expect(vb.myVote).toBeNull();
  expect(view(ctx, s, 'aaaa').myVote).toBe(realId(s));
  // nothing in the said lines either
  expect(ctx.said.join(' ')).not.toContain('حجر');
});

test('the real card is not always in the same place and ids change every round', () => {
  const places = new Set<number>();
  const ids = new Set<string>();
  for (let seed = 1; seed <= 30; seed++) {
    const ctx = fakeCtx();
    const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings(), seeded(seed));
    act(ctx, s, 'aaaa', { type: 'send', text: 'حجر أملس' });
    act(ctx, s, 'bbbb', { type: 'send', text: 'طائر صغير' });
    act(ctx, s, 'cccc', { type: 'send', text: 'نهر صغير' });
    places.add(s.cards.findIndex((c) => c.real));
    for (const c of s.cards) ids.add(c.id);
  }
  expect(places.size).toBe(4);
  expect(ids.size).toBe(120);
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** Run due bot jobs until the game ends (humans: send a fixed fake, vote for the first card they may). */
function runGame(ctx: Ctx, s: QamusState, humans: string[], bots: string[], maxSteps = 4000) {
  for (let step = 0; step < maxSteps && s.phase !== 'final'; step++) {
    qamus.botPlan!(ctx, s, bots);
    if (s.phase === 'write') for (const h of humans) if (s.sent[h] === undefined) act(ctx, s, h, { type: 'send', text: `تعريف مزيف رقم ${step}` });
    if (s.phase === 'vote') for (const h of humans) if (s.voters.includes(h) && !s.votes[h]) act(ctx, s, h, { type: 'vote', card: s.cards.find((c) => !c.authors.includes(h))!.id });
    if (s.phase === 'reveal') {
      act(ctx, s, humans[0] ?? bots[0], { type: 'next' });
      continue;
    }
    const due = ctx.jobs.filter((j) => j.at <= ctx.now);
    ctx.jobs = ctx.jobs.filter((j) => j.at > ctx.now);
    for (const j of due) {
      try {
        qamus.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
      }
    }
    if (!due.length) {
      ctx.now += 1000;
      qamus.tick!(ctx, s);
    }
  }
}

test('bots: decoys of the word (never the real meaning, never twice in a round), human-like pauses, a whole game', () => {
  const bots = ['bot1', 'bot2', 'bot3', 'bot4'];
  const ctx = fakeCtx(bots, 'smart');
  const s = startQamus(ctx, ['me00', ...bots], settings({ rounds: 5, seconds: 60 }), seeded(11));
  qamus.botPlan!(ctx, s, bots);
  expect(ctx.jobs.length).toBe(4);
  for (const j of ctx.jobs) {
    expect(j.a.type).toBe('send');
    expect(j.at - ctx.now).toBeGreaterThanOrEqual(6000);
    expect(j.at - ctx.now).toBeLessThanOrEqual(60_000);
    expect(sameMeaning(j.a.text as string, s.entry.def)).toBe(false);
  }
  const texts = ctx.jobs.map((j) => j.a.text as string);
  expect(new Set(texts).size).toBe(4);
  // planning again doesn't change the bot's text or add jobs
  qamus.botPlan!(ctx, s, bots);
  expect(ctx.jobs.length).toBe(4);
  runGame(ctx, s, ['me00'], bots);
  expect(s.phase).toBe('final');
  expect(s.round).toBe(4);
  const r = qamus.result!(s)!;
  expect(r.places.flat().sort()).toEqual(['bot1', 'bot2', 'bot3', 'bot4', 'me00']);
  expect(Object.values(s.scores).some((v) => v > 0)).toBe(true);
});

test('bots: a word\'s decoys run out → the family\'s spares', () => {
  const e = QAMUS_WORDS[0];
  const d = botDecoy(e, [...e.decoys], seeded(1));
  expect(QAMUS_SPARE[e.cat]).toContain(d);
});

test('bots: never vote for their own card; the expert finds the real one more often than the easy bot', () => {
  const cards = [
    { id: 'r', real: true, authors: [] },
    { id: 'm', real: false, authors: ['bot1'] },
    { id: 'x', real: false, authors: ['aaaa'] },
    { id: 'y', real: false, authors: ['bbbb'] },
  ];
  const hits: Record<BotLevel, number> = { easy: 0, smart: 0, expert: 0 };
  const rnd = seeded(9);
  for (const level of ['easy', 'smart', 'expert'] as BotLevel[])
    for (let i = 0; i < 2000; i++) {
      const c = botChoice(level, cards, 'bot1', rnd);
      expect(c).not.toBe('m');
      if (c === 'r') hits[level]++;
    }
  expect(hits.easy).toBeLessThan(hits.smart);
  expect(hits.smart).toBeLessThan(hits.expert);
  expect(Math.abs(hits.easy / 2000 - QAMUS_BOT_FIND.easy)).toBeLessThan(0.05);
  // only its own fake left: the real one
  expect(botChoice('easy', cards.slice(0, 2), 'bot1', rnd)).toBe('r');
});

test('bots: their votes wait for the vote, and they don\'t vote when their definition was the real meaning', () => {
  const bots = ['bot1', 'bot2'];
  const ctx = fakeCtx(bots);
  const s = startQamus(ctx, ['aaaa', ...bots], settings(), seeded(12));
  act(ctx, s, 'aaaa', { type: 'send', text: 'حجر أملس' });
  act(ctx, s, 'bot1', { type: 'send', text: s.entry.def });
  act(ctx, s, 'bot2', { type: 'send', text: 'طائر صغير' });
  expect(s.phase).toBe('vote');
  ctx.jobs = [];
  qamus.botPlan!(ctx, s, bots);
  expect(ctx.jobs.map((j) => j.by)).toEqual(['bot2']);
  expect(ctx.jobs[0].a.type).toBe('vote');
  expect(ctx.jobs[0].a.card).not.toBe(cardOf(s, 'bot2'));
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('leaving while writing: the others go on (the round ends if everyone left has sent)', () => {
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings(), seeded(6));
  act(ctx, s, 'aaaa', { type: 'send', text: 'حجر أملس' });
  act(ctx, s, 'bbbb', { type: 'send', text: 'طائر صغير' });
  qamus.onLeave!(ctx, s, 'cccc');
  expect(s.participants).toEqual(['aaaa', 'bbbb']);
  expect(s.phase).toBe('vote');
  expect(s.scores.cccc).toBeUndefined();
});

test('leaving while voting: their card stays without author, their vote goes; too few players ends the game', () => {
  const { s, ctx } = written(['aaaa', 'bbbb', 'cccc', 'dddd']);
  const c = cardOf(s, 'cccc');
  act(ctx, s, 'aaaa', { type: 'vote', card: c });
  act(ctx, s, 'cccc', { type: 'vote', card: realId(s) });
  qamus.onLeave!(ctx, s, 'cccc');
  expect(s.cards.find((x) => x.id === c)!.authors).toEqual([]);
  expect(s.votes.cccc).toBeUndefined();
  expect(s.phase).toBe('vote');
  act(ctx, s, 'bbbb', { type: 'vote', card: realId(s) });
  act(ctx, s, 'dddd', { type: 'vote', card: realId(s) });
  expect(s.phase).toBe('reveal');
  expect(s.gains).toEqual({ aaaa: 0, bbbb: 2, dddd: 2 });
  qamus.onLeave!(ctx, s, 'dddd');
  qamus.onLeave!(ctx, s, 'bbbb');
  expect(s.phase).toBe('final');
  expect(qamus.result!(s)).toEqual({ places: [['aaaa']] });
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

test('settings: defaults, sanitised at start, patched to the nearest option; rounds and time are honoured', () => {
  expect(DEFAULT_SETTINGS.qamus).toEqual(QAMUS_DEFAULTS);
  expect(sanitizeQamus({ rounds: 7, seconds: 1000 } as QamusSettings)).toEqual({ rounds: 8, seconds: 120 });
  expect(sanitizeQamus(undefined)).toEqual(QAMUS_DEFAULTS);
  const st = { ...QAMUS_DEFAULTS };
  qamus.patchSettings!(st, { rounds: 10, seconds: 59 });
  expect(st).toEqual({ rounds: 10, seconds: 60 });
  qamus.patchSettings!(st, { rounds: 'many', seconds: null });
  expect(st).toEqual({ rounds: 10, seconds: 60 });
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], { rounds: 3, seconds: 5 } as QamusSettings, seeded(8));
  expect(s.settings).toEqual({ rounds: 5, seconds: 60 });
  expect(s.endsAt! - ctx.now).toBe(60_000);
  expect(view(ctx, s, 'aaaa').rounds).toBe(5);
  expect(qamus.result!(s)).toBeNull();
});

test('a whole game: five different words, a podium, places by score (ties share)', () => {
  const ctx = fakeCtx();
  const s = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings({ rounds: 5 }), seeded(10));
  const words = new Set<string>();
  while (s.phase !== 'final') {
    words.add(s.entry.word);
    expect(view(ctx, s, 'aaaa').category).toBe(QAMUS_CATS[s.entry.cat]);
    ctx.now += 90_000;
    qamus.tick!(ctx, s); // nobody writes
    expect(s.phase).toBe('reveal');
    act(ctx, s, 'aaaa', { type: 'next' });
  }
  expect(words.size).toBe(5);
  expect(qamus.result!(s)).toEqual({ places: [['aaaa', 'bbbb', 'cccc']] });
  // the next game in the same room starts with a word not seen yet
  const s2 = startQamus(ctx, ['aaaa', 'bbbb', 'cccc'], settings(), seeded(10));
  expect(words.has(s2.entry.word)).toBe(false);
});
