/** The Arabic Hunspell check (server/hunspell.ts) and how the word games use it. */
import { expect, test } from 'bun:test';

import { normWord } from '../src/shared/wordle';
import { boggleWord, commonWords } from './boggle-grid';
import { knownWord, wordMatch } from './dictionary';
import { VALID_GUESSES, validGuess } from './games/wordle';
import { Hunspell, arabicSpeller, foldNorm, spellArabic } from './hunspell';
import { norm } from '../src/shared/arabic';
import { botWord, isWord, listWord } from './scrabble-dict';

test('engine: prefixes, suffixes, cross products, two suffixes, conditions and continuation classes', () => {
  const aff = [
    'SET UTF-8',
    'FLAG long',
    'IGNORE ًٌٍَُِّْـ',
    'AF 3',
    'AF AaBbDd # 1',
    'AF Cc # 2',
    'AF Ee # 3',
    'PFX Aa Y 1',
    'PFX Aa 0 ال .',
    'PFX Ee N 1',
    'PFX Ee 0 و .',
    'SFX Bb Y 1',
    'SFX Bb 0 ات/2 [^ة]', // a plural that may take a second suffix (Cc)
    'SFX Cc Y 1',
    'SFX Cc 0 ها .', // only ever as a second suffix
    'SFX Dd Y 1',
    'SFX Dd ة تان ة', // strip ة, add تان
  ].join('\n');
  const dic = ['3', 'كتاب/1', 'مدرسة/1', 'ورقة'].join('\n');
  const h = new Hunspell(aff, dic);
  for (const w of ['كتاب', 'الكتاب', 'كتابات', 'الكتابات', 'كتاباتها', 'الكتاباتها', 'مدرستان', 'المدرستان', 'ورقة', 'كِتَابٌ'])
    expect([w, h.check(w)]).toEqual([w, true]);
  // ها only after ات; ات not after ة (condition); تان needs ة; no flag, no affix; Ee not on any entry
  for (const w of ['كتابها', 'مدرسةات', 'كتابتان', 'الورقة', 'وكتاب', 'كتابال', 'ال'])
    expect([w, h.check(w)]).toEqual([w, false]);
  expect(h.check('الكتاب', { prefixes: 'none' })).toBe(false);
  expect(h.check('الكتاب', { prefixes: 'article' })).toBe(true);
});

test('the dictionary loads quickly, folds like norm() and answers fast', () => {
  const t = performance.now();
  const h = arabicSpeller();
  expect(h).not.toBeNull();
  expect(h!.size).toBeGreaterThan(400_000);
  expect(performance.now() - t).toBeLessThan(5000);
  for (const w of ['أَسَدٌ', 'مدرسة', 'إلى', 'مسؤول', 'هيئة', 'آية', 'ٱلله', 'مستشفى']) expect(foldNorm(w)).toBe(norm(w));
  const words = ['طاولاتنا', 'يلعبون', 'خصثقفغ', 'والمعلمات', 'كتابهم', 'ظظظظ'];
  const t2 = performance.now();
  for (let i = 0; i < 200; i++) for (const w of words) h!.check(w + (i % 3 ? '' : 'ا'));
  expect((performance.now() - t2) / 1200).toBeLessThan(1); // ms per uncached lookup
});

test('real inflected words: plurals, dual, feminine, pronouns, verbs, prefixes', () => {
  for (const w of [
    'مدارس', 'سيارات', 'معلمون', 'معلمين', 'طاولات', 'والكتاب', 'بالسيارة', 'معلمة', 'كتابهم', 'يلعبون', 'كتبت',
    'الأمر', 'سيكتبون', 'وسنلعب', 'فبيتك', 'كقلمي', 'لمدرستي', 'المعلمات', 'أقلامهم', 'استيقظنا',
  ])
    expect([w, spellArabic(w)]).toEqual([w, true]);
});

test('spellings players use: no hamza, ه for ة, ي for ى, ؤ/ئ, with or without «ال»', () => {
  for (const w of ['مدرسه', 'سياره', 'اسد', 'الاسد', 'الأسد', 'امراه', 'مسئول', 'مسؤول', 'مستشفي', 'مستشفى', 'اسماك', 'ابريق', 'طاوله', 'المدرسه'])
    expect([w, spellArabic(w)]).toEqual([w, true]);
});

test('nonsense is refused', () => {
  for (const w of ['كخبتر', 'سشيبلا', 'ضصثقف', 'ظغذثق', 'جحخهعغ', 'فقثصضط', 'زززز', 'ببببب', 'قلمم', 'تتتت', 'ههههه', 'خصثقفغ', 'شسيبلات', 'ثذضظ', 'غظطك', 'a', '', 'ك'])
    expect([w, spellArabic(w)]).toEqual([w, false]);
  // random letters: few short strings are words by chance, longer ones almost never
  const L = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const [n, max] of [[5, 0.05], [6, 0.02], [7, 0.01]]) {
    let ok = 0;
    for (let i = 0; i < 1000; i++) {
      let s = '';
      for (let j = 0; j < n; j++) s += L[Math.floor(rnd() * L.length)];
      if (spellArabic(s)) ok++;
    }
    expect([n, ok / 1000 <= max]).toEqual([n, true]);
  }
});

/** Everyday words of the common-noun columns (plurals, dual, feminine, pronouns) the lists alone missed. */
const EVERYDAY: [string, string][] = [
  ['نمرتان', 'animal'], ['الفهدين', 'animal'], ['الجرذات', 'animal'], ['بجعتين', 'animal'], ['ذيوله', 'animal'], ['نعجتان', 'animal'],
  ['ذئبتان', 'animal'], ['قردتان', 'animal'], ['ثعلبتان', 'animal'], ['حمامتين', 'animal'], ['ديكين', 'animal'], ['كلبتان', 'animal'],
  ['غزالتين', 'animal'], ['فراخها', 'animal'],
  ['نخلات', 'plant'], ['رمانات', 'plant'], ['عنبات', 'plant'], ['خوخات', 'plant'], ['مشمشات', 'plant'], ['فلفلات', 'plant'],
  ['صبارات', 'plant'], ['اللوزات', 'plant'], ['زبيبتين', 'plant'], ['وردتان', 'plant'], ['شجرتين', 'plant'], ['تفاحتان', 'plant'], ['زهرتين', 'plant'],
  ['مهندسات', 'job'], ['صيدلانيون', 'job'], ['خبازات', 'job'], ['مزارعات', 'job'], ['طباخات', 'job'], ['حلاقون', 'job'], ['حلاقات', 'job'],
  ['مذيعات', 'job'], ['مترجمات', 'job'], ['رسامات', 'job'], ['سفيرات', 'job'], ['نجارات', 'job'], ['ممرضتان', 'job'], ['طبيبتين', 'job'], ['خبازين', 'job'],
  ['ملاعقنا', 'thing'], ['أقلامهم', 'thing'], ['دفاترهم', 'thing'], ['شبكتان', 'thing'], ['دكانين', 'thing'], ['مفرشان', 'thing'], ['ضيعتنا', 'thing'],
  ['لقمتنا', 'thing'], ['زلاجتين', 'thing'], ['حنجرات', 'thing'], ['كرسيان', 'thing'], ['سيارتين', 'thing'], ['طاولتان', 'thing'], ['مفتاحين', 'thing'],
  ['حقيبتان', 'thing'], ['ساعتين', 'thing'],
];

test('«اسم ولد اسم بنت»: everyday inflected words now known (the lists alone missed most of them)', () => {
  let byLists = 0;
  for (const [w, cat] of EVERYDAY) {
    const m = wordMatch(w, cat);
    expect([w, cat, knownWord(w, cat)]).toEqual([w, cat, true]);
    if (m !== 'hunspell') byLists++;
  }
  console.log(`names: ${EVERYDAY.length} everyday inflected words — the lists alone knew ${byLists}, now all ${EVERYDAY.length}`);
  expect(byLists).toBeLessThan(EVERYDAY.length / 2);
  // the plan's examples (frequent words: the lists already had them) stay known
  for (const w of ['مدارس', 'سيارات', 'معلمون', 'معلمين', 'طاولات', 'معلمة', 'كتابهم', 'يلعبون', 'كتبت']) expect([w, knownWord(w, 'thing')]).toEqual([w, true]);
});

test('«اسم ولد اسم بنت»: no و/ف/ب/ك/ل/س in front, no grammar words, names columns stay with the lists', () => {
  // a prefix would let any word pass for its letter: «بمهندسات» for ب
  for (const w of ['ومهندسات', 'بمهندسات', 'بنخلات', 'لمهندسات', 'فنخلات']) expect([w, wordMatch(w, 'thing')]).toEqual([w, null]);
  for (const w of ['ما', 'من', 'هذا', 'في', 'التي', 'لكن']) expect([w, knownWord(w, 'thing')]).toEqual([w, false]);
  // people and places: Hunspell's forms are not names
  for (const cat of ['boy', 'girl', 'country']) expect([cat, knownWord('مهندسات', cat)]).toEqual([cat, false]);
  expect(knownWord('مهندسات', 'job')).toBe(true);
  // «ال» is fine, and the key without it too
  expect(wordMatch('المهندسات', 'job')).toBe('hunspell');
});

test('«حروف مبعثرة»: Hunspell forms count without any prefix; the bots keep the everyday words', () => {
  for (const w of ['مهندسات', 'نخلات', 'كتابهم', 'طاولات']) expect([w, boggleWord(w)]).toEqual([w, true]);
  for (const w of ['المهندسات', 'ومهندسات', 'بنخلات', 'خصثقف']) expect([w, boggleWord(w)]).toEqual([w, false]);
  for (const w of commonWords().words) expect([w, listWord(w) || w === 'الله']).toEqual([w, true]);
});

test('«شبكة الكلمات»: Hunspell forms count with or without «ال»; bots never play them', () => {
  for (const w of ['مهندسات', 'المهندسات', 'نخلات', 'كتابهم']) expect([w, isWord(w)]).toEqual([w, true]);
  for (const w of ['ومهندسات', 'بنخلات', 'خصثقف', 'ثذضظ']) expect([w, isWord(w)]).toEqual([w, false]);
  for (const w of ['مهندسات', 'نخلات', 'المهندسات']) expect([w, botWord(w)]).toEqual([w, false]);
});

test('«كلمة السر»: everyday Hunspell forms on the list, any Hunspell word accepted, dialect refused', () => {
  // added to wordle-valid.txt by tools/wordle-dict.mjs (everyday forms of everyday entries)
  for (const w of ['جرذات', 'نخلات', 'قروده', 'خردلة', 'شفقات']) expect([w, VALID_GUESSES.has(normWord(w))]).toEqual([w, true]);
  // not on the list, still a word: checked at run time
  for (const w of ['فبيتك', 'كقلمي']) {
    expect([w, VALID_GUESSES.has(w)]).toEqual([w, false]);
    expect([w, validGuess(w, false), validGuess(w, true)]).toEqual([w, true, true]);
  }
  for (const w of ['ضصثقف', 'سجتحخ', 'ظظظظظ', 'عايزة', 'بتقول', 'فاكرة', 'برضو']) expect([w, validGuess(normWord(w), false)]).toEqual([w, false]);
});
