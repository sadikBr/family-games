/** The word lists behind the word games are فصحى: no Egyptian/Tunisian/Levantine/Moroccan dialect words. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { answerKey } from '../src/shared/arabic';
import { normWord } from '../src/shared/wordle';
// @ts-expect-error — plain JS build script (exports the shared dialect blocklist)
import { ALLOW, DIALECT } from '../tools/wordle-dict.mjs';
import { WAVE_SPECTRUMS, WORDLE_WORDS } from './content-games2';
import { wordle } from './games/wordle';
import { NAMES_WORDS } from './names-words';

const lines = (f: string) => readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').split('\n').filter(Boolean);
const VALID = new Set(lines('wordle-valid.txt'));
const COMMON = new Set(lines('common-words.txt'));
/** Same normalising as tools/common-words.mjs. */
const cwNorm = (s: string) =>
  s.trim().replace(/[ً-ْـٰ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
const DIA = (DIALECT as string[]).map(normWord);

test('the dialect blocklist is loaded and big enough', () => {
  expect(DIA.length).toBeGreaterThan(300);
  expect((ALLOW as string[]).length).toBeGreaterThan(50);
});

test('wordle answers: at least 330, no dialect words, every answer a valid guess', () => {
  const n = WORDLE_WORDS.map(normWord);
  expect(n.length).toBeGreaterThanOrEqual(330);
  const removed = ['مخبزة', 'جلابة', 'طنجرة', 'كسكاس', 'شاكوش', 'جمبري', 'لويزة', 'بندير', 'فرامل', 'بغرير', 'هندية'];
  for (const w of removed) expect([w, n.includes(normWord(w))]).toEqual([w, false]);
  const dia = new Set(DIA);
  expect(n.filter((w) => dia.has(w))).toEqual([]);
  const legacy = new Set(['طاجين', 'مشمشة'].map(normWord)); // dish/fruit names accepted only as answers
  expect(n.filter((w) => !VALID.has(w) && !legacy.has(w))).toEqual([]);
});

test('wordle guess list: فصحى accepted, dialect refused', () => {
  expect(VALID.size).toBeGreaterThan(70000);
  for (const w of VALID) expect([...w].length).toBe(5);
  // Hunspell forms with affixes, and hand-checked very common forms Hunspell misses
  for (const w of ['الأمر', 'كتابه', 'مكتوب', 'جميلة', 'العام', 'سيكون', 'زوجتي', 'قتلوه', 'حفيدة', 'مدرسة'])
    expect([w, VALID.has(normWord(w))]).toEqual([w, true]);
  // came in from subtitle frequencies before: Egyptian, Tunisian, Levantine, Moroccan
  for (const w of ['عايزة', 'بتاعك', 'علشان', 'دلوقت', 'معرفش', 'يقولو', 'بتعمل', 'هنعمل', 'خليني', 'ديالو', 'اشوفك', 'معايا', 'عليكي', 'كويسة', 'مراتي', 'اخويا'])
    expect([w, VALID.has(normWord(w))]).toEqual([w, false]);
  expect(DIA.filter((w) => VALID.has(w))).toEqual([]);
});

test('bots in «كلمة السر» only ever guess answers (فصحى words)', () => {
  const answers = new Set(WORDLE_WORDS.map(normWord));
  const guesses: string[] = [];
  const q: { by: string; a: any }[] = [];
  const ctx: any = {
    now: 0,
    memo: new Map(),
    fx() {},
    isConnected: () => false,
    isBot: () => true,
    playerName: (id: string) => id,
    bot: (by: string, _k: string, _d: number, a: any) => q.push({ by, a }),
  };
  const s: any = wordle.start(ctx, ['x', 'y'], { rounds: 3 });
  for (let k = 0; k < 200 && s.phase !== 'final'; k++) {
    q.length = 0;
    wordle.botPlan!(ctx, s, ['x', 'y']);
    for (const z of q) {
      guesses.push(normWord(z.a.word));
      wordle.act(ctx, s, z.by, z.a);
    }
    if (!q.length) {
      ctx.now += 300000;
      wordle.tick!(ctx, s);
    }
  }
  expect(guesses.length).toBeGreaterThan(0);
  expect(guesses.filter((g) => !answers.has(g))).toEqual([]);
});

test('«شبكة الكلمات» bot words: no dialect forms', () => {
  expect(COMMON.size).toBeGreaterThan(20000);
  expect((DIALECT as string[]).map(cwNorm).filter((w) => COMMON.has(w))).toEqual([]);
  for (const w of ['آية', 'ولادة', 'بردة', 'دية', 'الفين', 'كتاب']) expect([w, COMMON.has(cwNorm(w))]).toEqual([w, true]);
});

test('«اسم ولد اسم بنت» bot answers: standard words, not Darija', () => {
  const darija: Record<string, string[]> = {
    animal: ['بلارج', 'فكرون', 'قنفود', 'سردوك', 'عتروس', 'جرانة', 'قنية', 'زعطوط', 'صوص', 'معزة', 'بلطي', 'جمبري', 'أبو بريص'],
    plant: ['دلاح', 'جلبانة', 'بسباس', 'بقولة', 'معدنوس', 'مطيشة', 'فليو', 'فصة', 'فقوس', 'قوق', 'كرموس', 'كاوكاو', 'لويزة', 'زعيترة', 'سالمية', 'عطرشة', 'حب الملوك', 'حبة حلاوة', 'عرعار', 'أزير'],
    thing: ['بندير', 'جلابة', 'بوطة', 'زلافة', 'شطابة', 'سبنية', 'شربيل', 'طرومبية', 'كسكاس', 'كارطة', 'مطرح', 'مهراز', 'مقراج', 'مضمة', 'وزرة', 'دوش', 'رابوز', 'هيدورة', 'حنبل', 'شنطة', 'شبشب', 'بنطلون', 'بيجامة', 'كنزة', 'يافطة', 'طاكسي', 'ترامواي', 'فرامل', 'طنجرة'],
    job: ['زلايجي', 'زوّاق', 'سفناج', 'عسّاس', 'حوّات', 'دادة', 'نكّافة', 'كسّال', 'كرّاب', 'غيّاط', 'برّاح', 'شاوش', 'قهوجي', 'ترزي', 'سمكري', 'شيف', 'سائق طاكسي', 'جنّان', 'حنّاية', 'درّاز', 'فاكهاني', 'نظاراتي', 'طيّاب'],
  };
  for (const [cat, words] of Object.entries(darija)) {
    const have = new Set((NAMES_WORDS as Record<string, string[]>)[cat].map(answerKey));
    for (const w of words) expect([cat, w, have.has(answerKey(w))]).toEqual([cat, w, false]);
  }
  const standard: Record<string, string[]> = {
    animal: ['لقلق', 'سلحفاة', 'قنفذ', 'ديك', 'تيس', 'ضفدع', 'كتكوت'],
    plant: ['بطيخ أحمر', 'بازلاء', 'بقدونس', 'طماطم', 'كرز', 'يانسون', 'تين شوكي'],
    thing: ['سيارة أجرة', 'ترام', 'مكابح', 'قدر الضغط', 'ورق اللعب', 'دف', 'جلباب'],
    job: ['صانع الزليج', 'بلّاط', 'سائق سيارة أجرة', 'منادي', 'جصّاص', 'سبّاك', 'خيّاط', 'طاهي'],
  };
  for (const [cat, words] of Object.entries(standard)) {
    const have = new Set((NAMES_WORDS as Record<string, string[]>)[cat].map(answerKey));
    for (const w of words) expect([cat, w, have.has(answerKey(w))]).toEqual([cat, w, true]);
  }
});

test('wave spectrums: no dialect words', () => {
  const dia = new Set((DIALECT as string[]).map(cwNorm));
  const bad = WAVE_SPECTRUMS.flat().flatMap((t) => t.split(/\s+/)).filter((w) => dia.has(cwNorm(w)));
  expect(bad).toEqual([]);
});
