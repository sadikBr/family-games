/** Party-game content: word decks, «الدخيل» traits, taboo cards, hot-potato topics, codenames and drawing words. */
import { expect, test } from 'bun:test';

import { firstLetter, norm } from '../src/shared/arabic';
import { IMPOSTER_HINTS, POTATO_ANSWERS, potatoAnswerPool } from './bot-content';
import { HEADSUP_CATEGORIES, IMPOSTER_CATEGORIES, POTATO_PROMPTS, TABOO_CARDS } from './content';
import { CODENAMES_WORDS, DRAW_WORDS } from './content-extra';
import { TRAITS, traitCounts, traitPool } from './imposter-traits';

const NEW_KEYS = ['clothes', 'school', 'feasts'];
const LETTER_PROMPT = /بحرف [^\s]+ \(([^)]+)\)/;

function expectNoDuplicates(list: string[], what: string) {
  const seen = new Map<string, string>();
  for (const w of list) {
    const k = norm(w);
    if (seen.has(k)) throw new Error(`${what}: «${w}» duplicates «${seen.get(k)}»`);
    seen.set(k, w);
  }
}

function expectClean(w: string) {
  expect(w.trim()).toBe(w);
  expect(w.length).toBeGreaterThan(0);
  expect(w).not.toMatch(/['"\n]/);
}

test('word categories: big enough, no duplicates, new ones in both games', () => {
  const all = [...new Set([...IMPOSTER_CATEGORIES, ...HEADSUP_CATEGORIES])];
  expect(new Set(all.map((c) => c.key)).size).toBe(all.length);
  for (const cat of all) {
    expect(cat.words.length).toBeGreaterThanOrEqual(NEW_KEYS.includes(cat.key) ? 40 : 45);
    expectNoDuplicates(cat.words, cat.key);
    cat.words.forEach(expectClean);
  }
  for (const key of NEW_KEYS) {
    expect(IMPOSTER_CATEGORIES.some((c) => c.key === key)).toBe(true);
    expect(HEADSUP_CATEGORIES.some((c) => c.key === key)).toBe(true);
  }
});

test('imposter traits: every word has 4–6 traits, at least two of them shared by 3+ other words', () => {
  for (const cat of IMPOSTER_CATEGORIES) {
    const table = TRAITS[cat.key];
    expect(table).toBeDefined();
    expect(Object.keys(table).sort()).toEqual([...cat.words].sort()); // no missing or stray entries
    const counts = traitCounts(cat);
    const max = Math.max(3, Math.floor(cat.words.length / 2));
    for (const w of cat.words) {
      const own = table[w].split('|');
      expect(own.length).toBeGreaterThanOrEqual(4);
      expect(own.length).toBeLessThanOrEqual(6);
      expect(new Set(own).size).toBe(own.length);
      for (const t of own) expect(cat.words).not.toContain(t); // a clue is never another word of the deck
      const shared = own.filter((t) => counts.get(t)! >= 4 && counts.get(t)! <= max);
      if (shared.length < 2) throw new Error(`${cat.key}/${w}: only ${shared.length} shared traits`);
      const pool = traitPool(cat, w, false);
      expect(pool.length).toBeGreaterThan(0);
      for (const t of pool) expect(counts.get(t)!).toBeGreaterThanOrEqual(3);
    }
    expect(traitPool(cat, '', true).length).toBeGreaterThanOrEqual(5);
  }
});

test('imposter hints: a fallback for every word, never the word itself', () => {
  for (const cat of IMPOSTER_CATEGORIES) {
    for (const w of cat.words) {
      const hints = IMPOSTER_HINTS[w];
      if (!hints) throw new Error(`no IMPOSTER_HINTS for «${w}»`);
      expect(hints.length).toBeGreaterThanOrEqual(2);
      for (const h of hints) {
        expectClean(h);
        expect(norm(h)).not.toBe(norm(w));
      }
    }
  }
});

test('taboo: 160+ cards, unique words, four distinct forbidden words that are not the word', () => {
  expect(TABOO_CARDS.length).toBeGreaterThanOrEqual(160);
  expectNoDuplicates(TABOO_CARDS.map((c) => c.word), 'taboo');
  for (const c of TABOO_CARDS) {
    expectClean(c.word);
    expect(c.forbidden.length).toBe(4);
    c.forbidden.forEach(expectClean);
    expect(new Set(c.forbidden.map(norm)).size).toBe(4);
    expect(c.forbidden.map(norm)).not.toContain(norm(c.word));
  }
});

test('hot potato: 100+ topics, each with 6+ bot answers; letter topics answer with that letter', () => {
  expect(POTATO_PROMPTS.length).toBeGreaterThanOrEqual(100);
  expectNoDuplicates(POTATO_PROMPTS, 'potato');
  for (const key of Object.keys(POTATO_ANSWERS)) expect(POTATO_PROMPTS).toContain(key);
  for (const p of POTATO_PROMPTS) {
    expectClean(p);
    const pool = potatoAnswerPool(p);
    expect(pool.length).toBeGreaterThanOrEqual(6);
    if (POTATO_ANSWERS[p]) expectNoDuplicates(POTATO_ANSWERS[p], p);
    const letter = p.match(LETTER_PROMPT)?.[1];
    if (letter && POTATO_ANSWERS[p]) {
      for (const a of POTATO_ANSWERS[p]) expect(firstLetter(a)).toBe(norm(letter));
    }
  }
});

test('codenames and drawing: big decks of clean, unique words', () => {
  expect(CODENAMES_WORDS.length).toBeGreaterThanOrEqual(400);
  expect(DRAW_WORDS.length).toBeGreaterThanOrEqual(320);
  expectNoDuplicates(CODENAMES_WORDS, 'codenames');
  expectNoDuplicates(DRAW_WORDS, 'draw');
  CODENAMES_WORDS.forEach(expectClean);
  DRAW_WORDS.forEach(expectClean);
});
