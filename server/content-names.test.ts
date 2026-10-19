/** «اسم ولد اسم بنت»: the curated word lists (bots' answers, always-accepted words). */
import { expect, test } from 'bun:test';

import { GAME_LETTERS, answerKey, norm, startsWithLetter } from '../src/shared/arabic';
import { NAMES_CATEGORIES } from '../src/shared/protocol';
import { NAMES_DICT, potatoAnswerPool, wordsStartingWith } from './bot-content';
import { NAMES_WORDS, type NamesWordCategory } from './names-words';

const CATS = Object.keys(NAMES_WORDS) as NamesWordCategory[];
const hasAl = (w: string) => w.startsWith('ال') && w.length > 3;

/** Letter × category pairs where the language has fewer than 6 good words (checked by hand). */
const KNOWN_LOW: Record<string, string[]> = {
  girl: ['ط', 'ق'],
  plant: ['و'],
  job: ['ه', 'ي'],
};

test('names words: one list per game category, big enough', () => {
  expect<string[]>([...CATS].sort()).toEqual(NAMES_CATEGORIES.map((c) => c.key).sort());
  const min: Record<NamesWordCategory, number> = { boy: 730, girl: 570, animal: 340, plant: 315, thing: 590, country: 1000, job: 410 };
  for (const cat of CATS) expect([cat, NAMES_WORDS[cat].length >= min[cat]]).toEqual([cat, true]);
});

test('names words: Arabic letters only, trimmed, no duplicates inside a list', () => {
  for (const cat of CATS) {
    const seen = new Map<string, string>();
    for (const w of NAMES_WORDS[cat]) {
      // letters (ء–ي), harakat/shadda, single spaces between words
      expect([cat, w, /^[ء-ي][ء-يً-ْ]*( [ء-ي][ء-يً-ْ]*)*$/.test(w)]).toEqual([cat, w, true]);
      expect([cat, w, w.includes('_')]).toEqual([cat, w, false]);
      const k = answerKey(w); // same as how answers are compared in the game (ignores «ال», hamzas, ة/ه…)
      expect([cat, w, seen.get(k) ?? null]).toEqual([cat, w, null]);
      seen.set(k, w);
    }
  }
});

test('names words: at least 6 bot words per letter and category (except the known gaps)', () => {
  const low: string[] = [];
  for (const cat of CATS)
    for (const l of GAME_LETTERS) {
      const n = (NAMES_DICT[cat][l] ?? []).length;
      if (n < 6 && !KNOWN_LOW[cat]?.includes(l)) low.push(`${cat}:${l}=${n}`);
    }
  expect(low).toEqual([]);
});

test('names dictionary: category → first letter → words, with no «ال» answers', () => {
  expect(Object.keys(NAMES_DICT).sort()).toEqual([...CATS].sort());
  for (const cat of CATS) {
    const byLetter = NAMES_DICT[cat];
    const flat = Object.values(byLetter).flat();
    // every word without the article is playable, nothing else
    expect(flat.length).toBe(NAMES_WORDS[cat].filter((w) => !hasAl(w)).length);
    for (const [l, words] of Object.entries(byLetter)) {
      expect(l.length).toBe(1);
      expect(words.length).toBeGreaterThan(0);
      for (const w of words) {
        expect([cat, w, hasAl(w)]).toEqual([cat, w, false]);
        expect([cat, w, norm(w)[0] === l && startsWithLetter(w, l)]).toEqual([cat, w, true]);
      }
    }
  }
  // the «ال» words are still in the lists (accepted for players), just not played by bots
  expect(NAMES_WORDS.country).toContain('الرباط');
  expect(Object.values(NAMES_DICT.country).flat()).not.toContain('الرباط');
  expect(NAMES_DICT.boy['ع']).toContain('عبد الرحيم');
  expect(NAMES_DICT.country['ر']).not.toContain('الرباط');
});

test('names dictionary: Hot Potato helpers still work', () => {
  const b = wordsStartingWith('ب');
  expect(b.length).toBeGreaterThan(100);
  expect(b.every((w) => norm(w)[0] === 'ب')).toBe(true);
  expect(potatoAnswerPool('كلمات تبدأ بحرف الألف (أ)').every((w) => norm(w)[0] === 'ا')).toBe(true);
  expect(potatoAnswerPool('أسماء أولاد')).toContain('يوسف');
  expect(potatoAnswerPool('أسماء بنات')).toContain('غيثة');
});
