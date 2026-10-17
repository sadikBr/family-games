/** Shape and rules of the Islamic content (quiz, حروف, من هو؟, Hajj stations). */
import { expect, test } from 'bun:test';

import { answerExact, firstLetter, norm, stripAl } from '../src/shared/arabic';
import { QUESTIONS, Q_CATS, WHO, WHO_ALIASES } from './content-islamic';
import { BY_LETTER } from './games/huroof';
import { whoMatches } from './games/whois';

/** Normalised text for duplicate checks: no diacritics, أإآ→ا, ة→ه, ى→ي, no punctuation. */
const key = (s: string) =>
  norm(s)
    .replace(/[«»"'.,،؛:!?؟…()\-ﷺ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

test('questions: enough per category, Hajj stations well stocked', () => {
  expect(QUESTIONS.length).toBeGreaterThanOrEqual(380);
  for (const c of Q_CATS) expect(QUESTIONS.filter((q) => q.cat === c.key).length).toBeGreaterThanOrEqual(c.key === 'hajj' ? 45 : 40);
});

test('questions: no duplicates, options distinct, short answers', () => {
  const seen = new Set<string>();
  for (const q of QUESTIONS) {
    const k = key(q.q);
    expect(seen.has(k)).toBe(false);
    seen.add(k);
    expect(q.w.length).toBe(3);
    const opts = [q.a, ...q.w].map(key);
    expect(new Set(opts).size).toBe(4); // answer not among the wrong options, wrong options distinct
    // typed in «حروف»: 1–3 words, not counting «بن» / «أبي» in a person's name
    expect(key(q.a).split(' ').filter((w) => w !== 'بن' && w !== 'ابي').length).toBeLessThanOrEqual(q.cat === 'worship' || q.cat === 'hajj' ? 4 : 3);
    expect(q.q.trim().length).toBeGreaterThan(5);
  }
});

test('حروف: every letter on the board has at least 6 questions', () => {
  for (const [l, qs] of BY_LETTER) {
    expect(qs.length).toBeGreaterThanOrEqual(6);
    for (const q of qs) expect(firstLetter(q.a)).toBe(l);
  }
  // the whole alphabet is playable (ة and ى never start a word)
  for (const l of 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي') expect(BY_LETTER.has(l)).toBe(true);
});

/** Exact typed forms an entry accepts (its name, its aliases and their short forms, as whoMatches sees them). */
const formsOf = (name: string) => {
  const out = new Set<string>();
  for (const n of [name, ...(WHO_ALIASES[name] ?? [])]) {
    const words = norm(n.replace(/[ﷺ()]/g, ' ')).split(' ').filter(Boolean);
    const forms = [words.join(' ')];
    const bin = words.findIndex((w) => w === 'بن' || w === 'بنت');
    if (bin > 0) forms.push(words.slice(0, bin).join(' '));
    if (words.length >= 3 && words[words.length - 1].startsWith('ال')) forms.push(words.slice(0, -1).join(' '));
    for (const f of forms) out.add(f.split(' ').map((w) => (w === 'الله' ? w : stripAl(w))).join(''));
  }
  return out;
};

test('من هو؟: enough balanced entries, 4 clues, no name in its clues', () => {
  expect(WHO.length).toBeGreaterThanOrEqual(90);
  const per = (c: string) => WHO.filter((w) => w.cat === c).length;
  expect(per('prophet')).toBe(25); // all prophets named in the Quran
  for (const c of ['companion', 'place', 'figure']) expect(per(c)).toBeGreaterThanOrEqual(20);
  expect(new Set(WHO.map((w) => key(w.name))).size).toBe(WHO.length);
  const SKIP = new Set(['بن', 'بنت', 'ابو', 'ابي', 'ام', 'ابن', 'عبد', 'جبل', 'غار', 'مسجد', 'الله']);
  for (const e of WHO) {
    expect(e.clues.length).toBe(4);
    expect(new Set(e.clues).size).toBe(4);
    const words = key(e.name)
      .split(' ')
      .filter((w) => !SKIP.has(w))
      .map(stripAl)
      .filter((w) => !SKIP.has(w));
    for (const c of e.clues) {
      const clueWords = key(c)
        .split(' ')
        .map((w) => stripAl(w.replace(/^[وفبلك](?=ال)/, '')));
      for (const w of words) expect(clueWords.includes(w)).toBe(false);
    }
  }
});

test('من هو؟: aliases point at real entries and never at two entries', () => {
  const names = new Set(WHO.map((w) => w.name));
  for (const k of Object.keys(WHO_ALIASES)) expect(names.has(k)).toBe(true);
  const owner = new Map<string, string>();
  for (const e of WHO)
    for (const f of formsOf(e.name)) {
      // known, harmless: «يوسف» is also accepted for يوسف بن تاشفين (never the other way round)
      if (f !== 'يوسف') expect(owner.get(f) ?? e.name).toBe(e.name);
      owner.set(f, e.name);
    }
  for (const e of WHO) {
    expect(whoMatches(e.name, e.name)).toBe(true);
    for (const a of WHO_ALIASES[e.name] ?? []) {
      expect(whoMatches(a, e.name)).toBe(true);
      for (const o of WHO) if (o.name !== e.name) expect(answerExact(a, o.name)).toBe(false);
    }
  }
  expect(whoMatches('أحمد', 'محمد ﷺ')).toBe(true);
  expect(whoMatches('ابن عباس', 'عبد الله بن عباس')).toBe(true);
  expect(whoMatches('الإدريسي', 'إدريس')).toBe(false);
  expect(whoMatches('إدريس', 'الشريف الإدريسي')).toBe(false);
  expect(whoMatches('هارون', 'هارون الرشيد')).toBe(false);
});
