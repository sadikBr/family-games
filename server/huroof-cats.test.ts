/** «حروف» categories: the content of every category, the board and questions of the chosen ones, settings, bots. */
import { expect, test } from 'bun:test';

import { answerMatches, firstLetter, norm, stripAl } from '../src/shared/arabic';
import { DEFAULT_SETTINGS, HUROOF_CATS, huroofCats, type HuroofCat } from '../src/shared/protocol';
import { HUROOF_POOL, HUROOF_RAW, type HuroofQ } from './content-huroof';
import { BY_LETTER, MIN_PER_LETTER, boardLetters, huroof, huroofByLetter } from './games/huroof';

const LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const NEW_CATS = Object.keys(HUROOF_RAW) as Exclude<HuroofCat, 'islamic'>[];
const CELLS = 25;
/** Words of a name that may also appear in its question. */
const SKIP_WORDS = new Set(['بن', 'ابو', 'ام', 'عبد']);

/** Normalised text for duplicate checks: no diacritics, أإآ→ا, ة→ه, ى→ي, no punctuation. */
const key = (s: string) =>
  norm(s)
    .replace(/[«»"'.,،؛:!?؟…()\-ﷺ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const fakeCtx = (bot: (by: string, a: any) => void = () => {}, level: 'easy' | 'smart' | 'expert' = 'easy'): any => ({
  now: 0,
  fx: () => {},
  isConnected: () => true,
  isBot: () => true,
  playerName: (id: string) => id,
  memo: new Map(),
  botLevel: () => level,
  bot: (by: string, _k: string, _d: number, a: any) => bot(by, a),
});

test('categories: the list, the default, and old settings without categories', () => {
  expect(HUROOF_CATS.map((c) => c.key)).toEqual(['islamic', ...NEW_CATS]);
  expect(DEFAULT_SETTINGS.huroof.cats).toEqual(['islamic']);
  expect(huroofCats({})).toEqual(['islamic']);
  expect(huroofCats(undefined)).toEqual(['islamic']);
  expect(huroofCats({ cats: [] })).toEqual(['islamic']);
  expect(huroofCats({ cats: ['nope', 'sport', 'geo'] })).toEqual(['geo', 'sport']);
  // a room that kept old settings ({ seconds } only) plays the Islamic questions, as before
  const s: any = huroof.start(fakeCtx(), ['a', 'b'], { seconds: 15 });
  expect(s.cats).toEqual(['islamic']);
  expect(s.byLetter).toBe(BY_LETTER);
  for (const c of s.cells) expect(BY_LETTER.get(c.letter)!.length).toBeGreaterThanOrEqual(MIN_PER_LETTER);
});

test('content: each new category has 180+ well-formed questions', () => {
  for (const cat of NEW_CATS) {
    const raw = HUROOF_RAW[cat];
    expect(raw.length, cat).toBeGreaterThanOrEqual(180);
    for (const [q, ans] of raw) {
      const forms = ans.split('|').map((f) => f.trim());
      expect(forms.every(Boolean), `${cat}: ${ans}`).toBe(true);
      const l = firstLetter(forms[0]);
      // a real letter, and every accepted spelling starts with it («ال» aside)
      expect(LETTERS.includes(l) && l !== '', `${cat}: ${ans}`).toBe(true);
      for (const f of forms) expect(firstLetter(f), `${cat}: ${ans}`).toBe(l);
      // «ألمانيا» would count for م (firstLetter takes «أل» for the article): such answers are left out
      for (const f of forms) if (/^[أإآ]ل/.test(f)) expect(firstLetter(f), `${cat}: ${f}`).toBe('ا');
      // a short answer to type: up to 4 words
      expect(key(forms[0]).split(' ').length, `${cat}: ${ans}`).toBeLessThanOrEqual(4);
      expect(q.trim().endsWith('؟'), `${cat}: ${q}`).toBe(true);
      expect(q.length, `${cat}: ${q}`).toBeGreaterThan(10);
      // the question does not give its answer away: no word of the answer (but «بن»…) is in the question
      const qWords = key(q)
        .split(' ')
        .map((w) => stripAl(w.replace(/^[وفبلك](?=ال)/, '')));
      for (const w of key(forms[0]).split(' ').map(stripAl))
        if ([...w].length > 2 && !SKIP_WORDS.has(w)) expect(qWords.includes(w), `${cat}: ${q} → ${ans}`).toBe(false);
    }
  }
});

test('content: no question twice in any category, and the Islamic questions are untouched', () => {
  const seen = new Map<string, string>();
  for (const [cat, qs] of Object.entries(HUROOF_POOL)) {
    for (const q of qs) {
      const k = key(q.q);
      expect(seen.get(k), `${cat}: ${q.q}`).toBeUndefined();
      seen.set(k, cat);
    }
  }
  expect(HUROOF_POOL.islamic.every((q) => q.alt.length === 0)).toBe(true);
  expect(HUROOF_POOL.islamic.length).toBe([...BY_LETTER.values()].reduce((n, qs) => n + qs.length, 0));
});

test('content: bots have three wrong answers, of the same letter when possible, never a right one', () => {
  for (const cat of NEW_CATS) {
    for (const q of HUROOF_POOL[cat]) {
      expect(q.w.length).toBe(3);
      expect(new Set(q.w).size).toBe(3);
      for (const w of q.w) for (const f of [q.a, ...q.alt]) expect(answerMatches(w, f), `${q.a} / ${w}`).toBe(false);
    }
    const sameLetter = HUROOF_POOL[cat].flatMap((q) => q.w.map((w) => firstLetter(w) === firstLetter(q.a)));
    expect(sameLetter.filter(Boolean).length / sameLetter.length).toBeGreaterThan(0.95);
  }
});

test('content: letters × categories — every single category fills a board with different letters', () => {
  const cats = HUROOF_CATS.map((c) => c.key);
  const rows = [`   ${cats.map((c) => c.slice(0, 5).padStart(6)).join('')}`];
  for (const l of LETTERS) rows.push(`${l}  ${cats.map((c) => String(HUROOF_POOL[c].filter((q) => firstLetter(q.a) === l).length).padStart(6)).join('')}`);
  rows.push(`Σ  ${cats.map((c) => String(HUROOF_POOL[c].length).padStart(6)).join('')}`);
  console.log(`huroof: questions per letter and category\n${rows.join('\n')}`);
  for (const cat of cats) {
    const m = huroofByLetter([cat]);
    const enough = [...m].filter(([, qs]) => qs.length >= MIN_PER_LETTER);
    expect(enough.length, cat).toBeGreaterThanOrEqual(CELLS);
    // most letters have five or more questions
    expect([...m].filter(([, qs]) => qs.length >= 5).length, cat).toBeGreaterThanOrEqual(20);
    for (const [l, qs] of m) for (const q of qs) expect(firstLetter(q.a)).toBe(l);
  }
});

test('board: only letters the chosen categories have enough questions for; a small pool repeats letters', () => {
  for (const cat of NEW_CATS) {
    for (let k = 0; k < 20; k++) {
      const s: any = huroof.start(fakeCtx(), ['a', 'b'], { seconds: 15, cats: [cat] });
      expect(s.cats).toEqual([cat]);
      expect(new Set(s.cells.map((c: any) => c.letter)).size).toBe(CELLS);
      for (const c of s.cells) expect(huroofByLetter([cat]).get(c.letter)!.length, `${cat} ${c.letter}`).toBeGreaterThanOrEqual(MIN_PER_LETTER);
    }
  }
  // a pool with only ten letters: 25 hexagons, letters come back, the richer ones more often
  const small = new Map<string, HuroofQ[]>();
  const sport = huroofByLetter(['sport']);
  for (const l of [...sport.keys()].slice(0, 10)) small.set(l, sport.get(l)!);
  small.set('ظ', sport.get('ظ')!.slice(0, 1)); // too few: never on the board
  const letters = boardLetters(small);
  expect(letters.length).toBe(CELLS);
  expect(new Set(letters).size).toBe(10);
  expect(letters).not.toContain('ظ');
});

test('questions: only from the chosen categories, mixed when several are chosen, labelled on the card', () => {
  const label = (c: HuroofCat) => HUROOF_CATS.find((x) => x.key === c)!.label;
  const seen = new Set<string>();
  for (let g = 0; g < 30; g++) {
    const ctx = fakeCtx();
    const s: any = huroof.start(ctx, ['a', 'b'], { seconds: 15, cats: ['geo', 'food'] });
    s.teams = { red: ['a'], green: ['b'] };
    for (let i = 0; i < 5; i++) {
      s.turn = 'red';
      s.phase = 'pick';
      huroof.act(ctx, s, 'a', { type: 'pick', cell: i });
      expect(['geo', 'food']).toContain(s.question.cat);
      expect(firstLetter(s.question.answer)).toBe(s.cells[i].letter);
      expect((huroof.view(ctx, s, 'a') as any).question.cat).toBe(label(s.question.cat));
      seen.add(s.question.cat);
      ctx.now += 60000;
      huroof.tick!(ctx, s);
      ctx.now += 60000;
      huroof.tick!(ctx, s);
    }
  }
  expect(seen).toEqual(new Set(['geo', 'food']));
});

test('questions: a whole game on one category never asks a question twice, whatever happens', () => {
  for (const cat of NEW_CATS) {
    for (let g = 0; g < 10; g++) {
      const ctx = fakeCtx();
      const s: any = huroof.start(ctx, ['a', 'b'], { seconds: 15, cats: [cat] });
      s.teams = { red: ['a'], green: ['b'] };
      const asked: string[] = [];
      for (let k = 0; k < 400 && s.phase !== 'final'; k++) {
        const free = s.cells.map((c: any, i: number) => (c.owner ? -1 : i)).filter((i: number) => i >= 0);
        const by = s.turn === 'red' ? 'a' : 'b';
        huroof.act(ctx, s, by, { type: 'pick', cell: free[Math.floor(Math.random() * free.length)] });
        expect(s.question.cat).toBe(cat);
        asked.push(s.question.text);
        if (Math.random() < 0.4) {
          // right, by either team
          const who = Math.random() < 0.5 ? 'a' : 'b';
          huroof.act(ctx, s, who, { type: 'buzz' });
          huroof.act(ctx, s, who, { type: 'answer', text: s.question.answer });
        } else {
          // nobody: the whole question, then its timer runs out
          ctx.now += 60000;
          huroof.tick!(ctx, s);
          ctx.now += 60000;
          huroof.tick!(ctx, s);
        }
      }
      expect(s.phase, cat).toBe('final');
      expect(new Set(asked).size, cat).toBe(asked.length);
    }
  }
});

test('settings: unknown categories are ignored, an empty choice is refused, seconds are clamped', () => {
  const set: any = { seconds: 20, cats: ['islamic'] };
  huroof.patchSettings!(set, { cats: ['sport', 'nope', 'geo', 'sport'] });
  expect(set.cats).toEqual(['geo', 'sport']);
  huroof.patchSettings!(set, { cats: [] });
  expect(set.cats).toEqual(['geo', 'sport']);
  huroof.patchSettings!(set, { cats: ['nope'] });
  expect(set.cats).toEqual(['geo', 'sport']);
  huroof.patchSettings!(set, { cats: 'sport' });
  expect(set.cats).toEqual(['geo', 'sport']);
  huroof.patchSettings!(set, { cats: HUROOF_CATS.map((c) => c.key) });
  expect(set.cats.length).toBe(HUROOF_CATS.length);
  huroof.patchSettings!(set, { seconds: 99 });
  expect(set.seconds).toBe(40);
  huroof.patchSettings!(set, { seconds: 3 });
  expect(set.seconds).toBe(10);
  huroof.patchSettings!(set, { seconds: 'x' });
  expect(set.seconds).toBe(10);
  // old settings without `cats` get them on the first change
  const old: any = { seconds: 20 };
  huroof.patchSettings!(old, { seconds: 25 });
  expect(huroofCats(old)).toEqual(['islamic']);
  huroof.patchSettings!(old, { cats: ['around'] });
  expect(old.cats).toEqual(['around']);
});

test('bots: play the new questions to a winner, answer some right, and type same-letter guesses when wrong', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    let right = 0;
    let wrong = 0;
    let sameLetter = 0;
    for (let g = 0; g < 8; g++) {
      const cat = NEW_CATS[g % NEW_CATS.length];
      const q: any[] = [];
      const ctx = fakeCtx((by, a) => q.push({ by, a }), level);
      const seats = ['a', 'b', 'c', 'd'];
      const s: any = huroof.start(ctx, seats, { seconds: 20, cats: [cat] });
      for (let k = 0; k < 3000 && s.phase !== 'final'; k++) {
        q.length = 0;
        huroof.botPlan!(ctx, s, seats);
        if (!q.length) {
          ctx.now += 1000;
          huroof.tick!(ctx, s);
        }
        for (const x of q) {
          if (x.a.type === 'answer' && s.question) {
            if (x.a.text === s.question.answer) right++;
            else {
              wrong++;
              if (firstLetter(x.a.text) === firstLetter(s.question.answer)) sameLetter++;
            }
          }
          try {
            huroof.act(ctx, s, x.by, x.a);
          } catch {}
        }
      }
      expect(s.phase, `${level} ${cat}`).toBe('final');
      expect(s.winner).not.toBeNull();
    }
    expect(right).toBeGreaterThan(0);
    if (wrong) expect(sameLetter / wrong).toBeGreaterThan(0.9);
  }
});
