import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { WORD_LEN, normWord } from '../src/shared/wordle';
import { WAVE_SPECTRUMS, WORDLE_WORDS } from './content-games2';
import { TRIVIA, TRIVIA_CATS } from './content-trivia';

/** Loose key for duplicate checks: no diacritics/tatweel/punctuation, one shape per letter. */
const norm = (s: string) =>
  s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}-]+/gu, ' ')
    .trim();

const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

test('trivia: at least 300 questions, 48+ per category, well-formed', () => {
  expect(TRIVIA.length).toBeGreaterThanOrEqual(300);
  for (const { key } of TRIVIA_CATS) expect(TRIVIA.filter((q) => q.cat === key).length).toBeGreaterThanOrEqual(48);
  for (const q of TRIVIA) {
    expect(TRIVIA_CATS.some((c) => c.key === q.cat)).toBe(true);
    expect(q.q.trim()).toBe(q.q);
    expect(q.q.length).toBeGreaterThan(5);
    expect(q.w.length).toBe(3);
    const opts = [q.a, ...q.w].map(norm);
    for (const o of opts) expect(o.length).toBeGreaterThan(0);
    // four distinct options, the answer is not among the wrong ones (also after normalising)
    expect(new Set(opts).size).toBe(4);
  }
  expect(dupes(TRIVIA.map((q) => norm(q.q)))).toEqual([]);
});

test('wave: at least 120 spectrums, two different ends, no duplicates', () => {
  expect(WAVE_SPECTRUMS.length).toBeGreaterThanOrEqual(120);
  for (const [l, r] of WAVE_SPECTRUMS) {
    expect(l.trim().length).toBeGreaterThan(0);
    expect(r.trim().length).toBeGreaterThan(0);
    expect(norm(l)).not.toBe(norm(r));
  }
  // the same pair in either order counts as a duplicate
  expect(dupes(WAVE_SPECTRUMS.map(([l, r]) => [norm(l), norm(r)].sort().join('|')))).toEqual([]);
});

test('wordle: at least 330 answers, 5 letters, no duplicates, every new answer is in the guess dictionary', () => {
  expect(WORDLE_WORDS.length).toBeGreaterThanOrEqual(330);
  const n = WORDLE_WORDS.map(normWord);
  for (const w of n) {
    expect([...w].length).toBe(WORD_LEN);
    expect(/^[ء-ي]+$/.test(w)).toBe(true);
  }
  expect(dupes(n)).toEqual([]);
  const dict = new Set(readFileSync(new URL('./data/wordle-valid.txt', import.meta.url), 'utf8').split('\n').filter(Boolean));
  // these four older answers are accepted only because answers are always valid guesses
  const legacy = new Set(['طاجين', 'مخبزة', 'جلابة', 'مشمشة'].map(normWord));
  expect(n.filter((w) => !dict.has(w) && !legacy.has(w))).toEqual([]);
});
