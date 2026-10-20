/**
 * The content of «كم تقدّر؟», «صح أم خطأ» and «الأعلام والعواصم»: sizes, shapes, no duplicates, balance,
 * every country with its capital and its flag image, and fair options in every region / mode / level.
 */
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import { ESTIMATE_CAT_LABEL, formatNumber, numberWords, parseGuess } from '../src/shared/games/estimate';
import { FLAGS_LEVELS, FLAGS_MODES, FLAGS_REGIONS, FLAGS_ROUNDS } from '../src/shared/games/flags';
import { TRUEFALSE_CAT_LABEL } from '../src/shared/games/truefalse';
import { ESTIMATE } from './estimate-content';
import { COUNTRIES, UNCLEAR_CAPITAL } from './flags-content';
import { buildFlags, optionText, regionPool, subjectPool, tooAlike, validFor } from './games/flags';
import { TRUEFALSE } from './truefalse-content';
import type { GameCtx } from './types';

/** Loose key for duplicate checks: no diacritics / tatweel / punctuation, one shape per letter. */
const norm = (s: string) =>
  s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

/* ------------------------------------------------------------------ */
/* كم تقدّر؟                                                           */
/* ------------------------------------------------------------------ */

test('estimate: 250+ questions, each with a number answer, a unit and a «did you know» line', () => {
  expect(ESTIMATE.length).toBeGreaterThanOrEqual(250);
  for (const q of ESTIMATE) {
    expect(q.q.trim()).toBe(q.q);
    expect(q.q.endsWith('؟')).toBe(true);
    expect(Number.isFinite(q.a)).toBe(true);
    expect(q.a).toBeGreaterThan(0);
    expect(q.unit.trim().length).toBeGreaterThan(0);
    expect(q.fact.trim().length).toBeGreaterThan(8);
    expect(q.cat in ESTIMATE_CAT_LABEL).toBe(true);
    // an approximate answer says so in the question, and only then
    expect(q.q.includes('تقريباً')).toBe(!!q.approx);
    if (q.year) {
      expect(['م', 'هـ']).toContain(q.unit);
      expect(Number.isInteger(q.a)).toBe(true);
      expect(q.a).toBeLessThanOrEqual(2026);
    }
    // what a phone types for the answer reads back as the answer
    expect(parseGuess(String(q.a))).toBe(q.a);
  }
  expect(dupes(ESTIMATE.map((q) => norm(q.q)))).toEqual([]);
});

test('estimate: every theme is well represented, and there are easy and hard questions', () => {
  for (const cat of Object.keys(ESTIMATE_CAT_LABEL)) expect(ESTIMATE.filter((q) => q.cat === cat).length).toBeGreaterThanOrEqual(10);
  const hard = ESTIMATE.filter((q) => q.hard).length;
  expect(hard).toBeGreaterThan(ESTIMATE.length * 0.25);
  expect(hard).toBeLessThan(ESTIMATE.length * 0.75);
});

test('estimate: typed numbers — Arabic-Indic and Persian digits, separators, decimal marks', () => {
  expect(parseGuess('210')).toBe(210);
  expect(parseGuess('٢١٠')).toBe(210);
  expect(parseGuess('۱۹۵۶')).toBe(1956);
  expect(parseGuess('37,000,000')).toBe(37000000);
  expect(parseGuess('٣٧٬٠٠٠٬٠٠٠')).toBe(37000000);
  expect(parseGuess('29٫5')).toBe(29.5);
  expect(parseGuess('29.5')).toBe(29.5);
  expect(parseGuess(' 42.195 ')).toBe(42.195);
  expect(parseGuess('')).toBeNull();
  expect(parseGuess('-5')).toBeNull();
  expect(parseGuess('1.2.3')).toBeNull();
  expect(parseGuess('abc')).toBeNull();
  expect(parseGuess('1e9')).toBeNull();
  expect(parseGuess('1234567890123')).toBeNull();
  expect(formatNumber(37000000)).toBe('37,000,000');
  expect(formatNumber(1956, true)).toBe('1956');
  expect(formatNumber(42.195)).toBe('42.195');
  expect(numberWords(37000000)).toBe('37 مليون');
  expect(numberWords(2500000000)).toBe('2.5 مليار');
  expect(numberWords(350000)).toBe('350 ألف');
  expect(numberWords(999)).toBeNull();
});

/* ------------------------------------------------------------------ */
/* صح أم خطأ                                                           */
/* ------------------------------------------------------------------ */

test('truefalse: 400+ statements, balanced true / false, each with its explanation', () => {
  expect(TRUEFALSE.length).toBeGreaterThanOrEqual(400);
  const yes = TRUEFALSE.filter((q) => q.t).length;
  expect(yes / TRUEFALSE.length).toBeGreaterThan(0.44);
  expect(yes / TRUEFALSE.length).toBeLessThan(0.56);
  for (const q of TRUEFALSE) {
    expect(q.s.trim()).toBe(q.s);
    expect(q.s.length).toBeGreaterThan(8);
    expect(q.s.endsWith('؟')).toBe(false);
    expect(q.why.trim().length).toBeGreaterThan(3);
    expect(q.cat in TRUEFALSE_CAT_LABEL).toBe(true);
  }
  expect(dupes(TRUEFALSE.map((q) => norm(q.s)))).toEqual([]);
});

test('truefalse: every theme has statements of both kinds', () => {
  for (const cat of Object.keys(TRUEFALSE_CAT_LABEL)) {
    const xs = TRUEFALSE.filter((q) => q.cat === cat);
    expect(xs.length).toBeGreaterThanOrEqual(15);
    expect(xs.some((q) => q.t)).toBe(true);
    expect(xs.some((q) => !q.t)).toBe(true);
  }
});

/* ------------------------------------------------------------------ */
/* الأعلام والعواصم                                                    */
/* ------------------------------------------------------------------ */

test('flags: every UN member state but one, plus Palestine and the Holy See; Arabic names and capitals', () => {
  expect(COUNTRIES.length).toBe(194);
  expect(dupes(COUNTRIES.map((c) => c.code))).toEqual([]);
  expect(dupes(COUNTRIES.map((c) => norm(c.name)))).toEqual([]);
  for (const c of COUNTRIES) {
    expect(c.code).toMatch(/^[a-z]{2}$/);
    expect(/[ء-ي]/.test(c.name)).toBe(true);
    expect(/[ء-ي]/.test(c.capital)).toBe(true);
    expect(c.name.trim()).toBe(c.name);
    expect(c.capital.trim()).toBe(c.capital);
  }
  // capitals that are asked are all different
  expect(dupes(COUNTRIES.filter((c) => !c.noCapital).map((c) => norm(c.capital)))).toEqual([]);
  // a capital with the country's own name is never asked
  // a capital that contains the country's name (or the other way round) is never asked: it would give it away
  const bare = (x: string) => norm(x).replace(/^ال/, '').replace(/ ال/g, ' ');
  for (const c of COUNTRIES) if (bare(c.capital).includes(bare(c.name)) || bare(c.name).includes(bare(c.capital))) expect([c.code, c.noCapital]).toEqual([c.code, true]);
  for (const code of UNCLEAR_CAPITAL) expect(COUNTRIES.find((c) => c.code === code)?.noCapital).toBe(true);
  const by = (code: string) => COUNTRIES.find((c) => c.code === code);
  expect(by('ma')?.capital).toBe('الرباط');
  expect(by('ps')?.name).toBe('فلسطين');
  expect(by('ps')?.capital).toBe('القدس');
  expect(by('us')?.capital).toBe('واشنطن');
  expect(by('va')).toBeDefined();
  expect(by('eh')).toBeUndefined();
  expect(COUNTRIES.filter((c) => c.arab).length).toBe(22);
  expect(regionPool('africa').length).toBe(54);
  expect(regionPool('oceania').length).toBe(14);
});

test('flags: every country has its flag image in assets/flags and in the app map', () => {
  const map = readFileSync(new URL('../src/art/flags.ts', import.meta.url), 'utf8');
  for (const c of COUNTRIES) {
    expect(existsSync(new URL(`../assets/flags/${c.code}.webp`, import.meta.url))).toBe(true);
    expect(map.includes(`assets/flags/${c.code}.webp`)).toBe(true);
  }
  expect(existsSync(new URL('../assets/flags/LICENSE', import.meta.url))).toBe(true);
});

const fakeCtx = () => ({ now: 0, memo: new Map() }) as unknown as GameCtx;

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

test('flags: every region, mode and level deals fair questions — four different options, the answer once', () => {
  const rnd = seeded(3);
  for (const { key: region } of FLAGS_REGIONS) {
    for (const { key: mode } of FLAGS_MODES) {
      for (const { key: level } of FLAGS_LEVELS) {
        const ctx = fakeCtx();
        for (let game = 0; game < 4; game++) {
          const rounds = FLAGS_ROUNDS[game % 3];
          const items = buildFlags(ctx, { rounds, mode, region, level }, rnd);
          expect(items.length).toBe(rounds);
          const pool = regionPool(region);
          const subjects = subjectPool(region, level);
          for (const it of items) {
            expect(validFor(it.kind, it.country)).toBe(true);
            expect(subjects).toContain(it.country);
            expect(it.options.length).toBe(4);
            expect(new Set(it.options).size).toBe(4);
            expect(it.options[it.correct]).toBe(it.country);
            expect(it.options.filter((c) => c === it.country).length).toBe(1);
            const texts = it.options.map((c) => optionText(it.kind, c));
            if (it.kind === 'pickflag') {
              for (const c of it.options) expect(c.noFlag).toBeUndefined();
            } else {
              // no two options alike (also never the answer twice under another spelling)
              for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(tooAlike(texts[i] as string, texts[j] as string)).toBe(false);
            }
            if (it.kind === 'capital') for (const c of it.options) expect(c.noCapital).toBeUndefined();
            // wrong options come from the region whenever it has enough countries
            if (pool.length >= 8) for (const c of it.options) expect(pool).toContain(c);
          }
          // a country is asked once per game while the region has enough
          if (subjects.length >= rounds * 1.5) expect(new Set(items.map((i) => i.country.code)).size).toBe(rounds);
        }
      }
    }
  }
});

test('flags: easy level asks about well-known countries only', () => {
  const rnd = seeded(9);
  const items = buildFlags(fakeCtx(), { rounds: 20, mode: 'mixed', region: 'world', level: 'easy' }, rnd);
  for (const it of items) expect(it.country.known).toBe(true);
  // the Arab world: all 22 are well known
  expect(subjectPool('arab', 'easy').length).toBe(22);
});
