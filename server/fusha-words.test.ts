/**
 * Party-game word content is Modern Standard Arabic (الفصحى): no dialect word may be shown to players.
 * Names of Moroccan dishes, garments, places and traditions (طاجين، جلابة، بلغة، تكشيطة…) are proper terms
 * and may stay. In «ماذا قال الناس؟» dialect spellings may stay only as hidden aliases that match what
 * players type; the question and every answer shown on the board are فصحى.
 */
import { expect, test } from 'bun:test';

import { norm, stripAl } from '../src/shared/arabic';
import { IMPOSTER_HINTS, POTATO_ANSWERS } from './bot-content';
import { CHARADES_ALL } from './charades-content';
import { COMMANDS, PROVERBS, REST_CARDS } from './content-proverbs';
import { IMPOSTER_QUESTIONS } from './content-imposter-questions';
import { HEADSUP_CATEGORIES, IMPOSTER_CATEGORIES, POTATO_PROMPTS, TABOO_CARDS } from './content';
import { CODENAMES_ENTRIES, CODENAMES_PAIRS } from './codenames-links';
import { CODENAMES_WORDS, DRAW_WORDS } from './content-extra';
import { HUROOF_RAW } from './content-huroof';
import { TRAITS } from './imposter-traits';
import { SPY_LOCATIONS } from './spy-content';
import { SURVEY_QUESTIONS } from './survey-content';

/**
 * Common dialect words (Moroccan, Egyptian, Tunisian, Levantine, Gulf) that have a فصحى equivalent, compared
 * whole-word after normalising. Words that are also real فصحى, or normalise to one («صافي», «حجرة», «سطل»,
 * «قفة», «دوار», «نعاس», «هندية», «فراشة», «فلوس», «زين», «نحب», «رايب» = «رائب», «أوي» = «أوى»), are left out.
 */
const DIALECT = [
  // Moroccan everyday words
  'ماشي', 'بزاف', 'ديال', 'واش', 'دابا', 'كيفاش', 'شنو', 'علاش', 'فين', 'بغيت', 'كاين', 'كاينش', 'ماكاينش',
  'واخا', 'مزيان', 'مزيانة', 'زوين', 'زوينة', 'خويا', 'الدراري', 'دراري', 'حوايج', 'ساروت', 'بزطام',
  'تلفون', 'بورطابل', 'طوموبيل', 'طوبيس', 'بشكليط', 'موطور', 'كبوط', 'صباط', 'تقاشر', 'شطيب', 'تصبين',
  'هضرة', 'يهضر', 'ننعس', 'بلاصة', 'شرجم', 'كرطابة', 'فاليزة', 'كادو', 'ماتش', 'الكورة', 'شارجور',
  'دلاح', 'طاكسي', 'الكارطة', 'كارطة', 'أتاي', 'براد', 'غميضة', 'الغمّيضة', 'زريعة', 'ببوش', 'الببّوش',
  'خيزو', 'مطيشة', 'دنجال', 'معدنوس', 'جلبانة', 'كرموس', 'قمرون', 'فرماج', 'ياغورت', 'سداري', 'طابلة',
  'ريموت', 'تليكوموند', 'سخون', 'عروسة', 'شكاية', 'سميدة', 'خضاري', 'معزة', 'زحليقة', 'حلايقي', 'الحلايقي',
  'كرّاب', 'الكرّاب', 'كرّوسة', 'الكرّوسة', 'ترامواي', 'تريبورتور', 'شورط', 'بيجامة', 'شبشب', 'مريلة',
  'ماكينة', 'كاوكاو', 'لامبة', 'الضو', 'وزرة', 'الهيدورة', 'هيدورة', 'الطيّابة', 'الكسّال',
  // Egyptian
  'دلوقتي', 'ازاي', 'إزاي', 'عايز', 'عايزة', 'كده', 'كدا', 'إيه', 'بتاع', 'بتاعة', 'برطمان', 'السبوع',
  'الاستغماية',
  // Tunisian / Algerian
  'برشا', 'ياسر',
  // Levantine / Gulf
  'هلق', 'هلأ', 'شو', 'هيك', 'كتير', 'منيح', 'هيدا', 'هادشي', 'شلون', 'وايد', 'يلا', 'ليش',
].map((w) => norm(w));
const DIALECT_SET = new Set(DIALECT);

/** The dialect words in a text, looked up word by word, with and without «ال» and a leading و/ب/ل. */
function dialectWords(text: string): string[] {
  const tokens = norm(text.replace(/[()«»"'.,،؛:!?؟\-–—|]/g, ' ')).split(' ').filter(Boolean);
  const hits: string[] = [];
  for (const t of tokens) {
    const forms = new Set([t, stripAl(t)]);
    if (/^[وبل]/.test(t) && t.length > 3) {
      forms.add(t.slice(1));
      forms.add(stripAl(t.slice(1)));
    }
    if ([...forms].some((f) => DIALECT_SET.has(f))) hits.push(t);
  }
  return hits;
}

/** Every player-facing string of the party games, labelled with where it comes from. */
function allContent(): [string, string][] {
  const out: [string, string][] = [];
  const add = (where: string, s: string) => out.push([where, s]);
  for (const cat of [...new Set([...IMPOSTER_CATEGORIES, ...HEADSUP_CATEGORIES])]) {
    add(`category ${cat.key}`, cat.label);
    cat.words.forEach((w) => add(`category ${cat.key}`, w));
  }
  for (const [key, table] of Object.entries(TRAITS)) {
    for (const [w, traits] of Object.entries(table)) traits.split('|').forEach((t) => add(`traits ${key}/${w}`, t));
  }
  for (const [w, hints] of Object.entries(IMPOSTER_HINTS)) hints.forEach((h) => add(`hint ${w}`, h));
  for (const c of TABOO_CARDS) {
    add('taboo', c.word);
    c.forbidden.forEach((f) => add(`taboo ${c.word}`, f));
  }
  POTATO_PROMPTS.forEach((p) => add('potato prompt', p));
  for (const [p, answers] of Object.entries(POTATO_ANSWERS)) answers.forEach((a) => add(`potato ${p}`, a));
  CODENAMES_WORDS.forEach((w) => add('codenames', w));
  // the spymaster bot gives these words as clues
  for (const e of CODENAMES_ENTRIES) e.links.forEach((l) => add(`codenames ${e.word}`, l));
  for (const [a, b] of CODENAMES_PAIRS) add('codenames pairs', `${a} ${b}`);
  DRAW_WORDS.forEach((w) => add('draw', w));
  CHARADES_ALL.forEach((c) => add(`charades ${c.cat}`, c.word));
  // «أمثال وحكم»: the Moroccan proverbs are Darija on purpose (the owner asked for them, marked «مثل مغربي»);
  // their meaning, shown under them, is فصحى
  for (const p of PROVERBS) add(`charades proverb${p.ma ? ' (meaning)' : ''}`, p.ma ? p.meaning! : p.text);
  COMMANDS.forEach((c) => add('charades command', c.text));
  REST_CARDS.forEach((r) => add('charades rest', r.text));
  // «الدخيل» — «سؤال مختلف»: the questions, and the answers the bots type
  for (const p of IMPOSTER_QUESTIONS)
    for (const q of [p.real, p.imposter]) {
      add('imposter question', q.q);
      q.answers.forEach((x) => add(`imposter answer ${q.q}`, x));
    }
  for (const l of SPY_LOCATIONS) {
    add('spy', l.name);
    l.roles.forEach((r) => add(`spy ${l.name}`, r));
  }
  // «حروف»: the questions and the answer shown (other accepted spellings are hidden, like survey aliases)
  for (const [cat, raw] of Object.entries(HUROOF_RAW))
    for (const [q, a] of raw) {
      add(`huroof ${cat}`, q);
      add(`huroof ${cat}`, a.split('|')[0]);
    }
  for (const q of SURVEY_QUESTIONS) {
    add('survey question', q.q);
    q.answers.forEach((a) => add(`survey ${q.q}`, a.text)); // aliases are hidden: dialect spellings allowed there
  }
  return out;
}

test('the dialect checker flags dialect and leaves فصحى alone', () => {
  for (const s of ['ماشي دورك', 'الكارطة', 'براد الشاي', 'تشرب أتاي', 'شنو هذا', 'عايز إيه', 'شو بدك', 'دابا', 'والدلاح', 'بزاف'])
    expect(dialectWords(s).length, s).toBeGreaterThan(0);
  for (const s of ['ليس دورك', 'ورق اللعب', 'إبريق الشاي', 'تشرب الشاي', 'ما هذا', 'بطيخ أحمر', 'سيارة أجرة', 'لعبة الاختباء', 'ماء صافٍ', 'حجرة النوم', 'فراشة', 'زينة'])
    expect(dialectWords(s), s).toEqual([]);
});

test('party-game content shown to players has no dialect words', () => {
  const content = allContent();
  expect(content.length).toBeGreaterThan(3000);
  const bad = content.filter(([, s]) => dialectWords(s).length).map(([where, s]) => `${where}: «${s}» (${dialectWords(s).join('، ')})`);
  expect(bad).toEqual([]);
});

test('survey: dialect spellings stay available as aliases, so what players type still counts', () => {
  const find = (q: string) => SURVEY_QUESTIONS.find((x) => x.q === q)!;
  const fruit = find('فاكهة تؤكل في الصيف');
  expect(fruit.answers[0].text).toBe('بطيخ أحمر');
  expect(fruit.answers[0].aliases).toContain('دلاح');
  const transport = find('وسيلة نقل في المغرب');
  expect(transport.answers[0].text).toBe('سيارة أجرة');
  expect(transport.answers[0].aliases).toContain('طاكسي');
  const kitchen = find('شيء تجده في مطبخ مغربي');
  expect(kitchen.answers[1].text).toBe('إبريق الشاي');
  expect(kitchen.answers[1].aliases).toContain('براد');
});

test('replaced words: the فصحى form is in the decks, the dialect one is gone', () => {
  const words = (key: string) => IMPOSTER_CATEGORIES.find((c) => c.key === key)!.words;
  expect(words('fruitveg')).toContain('بطيخ أحمر');
  expect(words('fruitveg')).not.toContain('دلاح');
  expect(words('transport')).toContain('سيارة أجرة');
  expect(words('sports')).toContain('ورق اللعب');
  expect(words('sports')).toContain('لعبة الاختباء');
  expect(words('home')).toContain('إبريق الشاي');
  expect(TABOO_CARDS.map((c) => c.word)).toContain('شاي');
  expect(TABOO_CARDS.map((c) => c.word)).not.toContain('أتاي');
  // proper terms of Moroccan culture stay
  expect(words('clothes')).toEqual(expect.arrayContaining(['تكشيطة', 'بلغة', 'جلابة', 'قفطان']));
  expect(words('food')).toEqual(expect.arrayContaining(['طاجين', 'طنجية', 'بسطيلة']));
});
