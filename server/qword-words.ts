/**
 * «كلمة قرآنية» — the words of the Quran in the spelling players type.
 * The Uthmani script writes some words differently from today's spelling (ٱلصِّرَٰطَ, ٱلصَّلَوٰةَ, ءَادَمَ,
 * إِبۡرَٰهِـۧمَ…), so each word of the text gives a few candidate spellings: the small alif (ٰ) kept as «ا»
 * or dropped, «وٰ» read as «وا» or «ا», «ىٰ» as «ى» or «ا», «ءا» read as «آ», the small waw/yeh dropped or written out. Each candidate
 * is then normalised like «كلمة السر» (normWord: أ/إ/آ→ا, ى/ئ→ي, ؤ→و, no diacritics).
 */
import { WORD_LEN, normWord } from '../src/shared/wordle';
import { quranFull, verseWords } from './qquote-quran';

/** Diacritics, Quranic annotation signs and pause marks: removed. */
const MARKS = /[ً-ْٖٓ-ٟۖ-ۜ۞-ۤۨ-ۭ]/g;

/** Letter-like signs, each with the ways it may be spelled today. Order matters: longest first. */
const CHOICES: [RegExp, string[]][] = [
  [/^ءا/, ['ءا', 'ا']],
  [/^ىٰ/, ['ى', 'ا']],
  [/^وٰ/, ['وا', 'ا', 'و']],
  [/^ـٰ/, ['ا', '']],
  [/^ٰ/, ['ا', '']],
  [/^ـٔ/, ['ء', 'ا', 'ي', 'و']],
  [/^[ۥ]/, ['', 'و']],
  [/^[ۦۧ]/, ['', 'ي']],
];

/** «ٱلَّـ» (after an optional joined «و/ف/ب/ك»): the article's lam carrying a shadda. */
const DOUBLE_LAM = /^((?:[وفبك][ًٌٍَُِْ]*)?)ٱل([ًٌٍَُِْ]*ّ)/;

/** Every spelling of one Uthmani word, normalised (several when the script allows several readings). */
export function quranForms(word: string): string[] {
  const raws = [word];
  // the alif after an accusative tanween is not part of the noun: «قُرۡبَانٗا» is the word «قربان»
  const noTanweenAlif = word.replace(/([ًٗ])ا(?=[^ء-ي]*$)/, '$1');
  if (noTanweenAlif !== word) raws.push(noTanweenAlif);
  // «ٱلَّيۡلِ»: the script writes one lam for the article + a first lam of the word («الليل»)
  for (const r of [...raws]) if (DOUBLE_LAM.test(r)) raws.push(r.replace(DOUBLE_LAM, '$1ٱلل$2'));
  return [...new Set(raws.flatMap(spellings))];
}

function spellings(word: string): string[] {
  const w = word.replace(MARKS, '').replace(/ٱ/g, 'ا').replace(/([اويى])ٔ/g, '$1').replace(/ٕ/g, '');
  let out = [''];
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    const hit = CHOICES.find(([re]) => re.test(rest));
    if (hit) {
      const len = rest.match(hit[0])![0].length;
      // only the first «ءا» of a word stands for «آ»
      const opts = i === 0 || hit[0].source !== '^ءا' ? hit[1] : ['ءا'];
      out = out.flatMap((o) => opts.map((x) => o + x));
      if (out.length > 64) out = out.slice(0, 64);
      i += len;
    } else {
      out = out.map((o) => o + w[i]);
      i += 1;
    }
  }
  return out.map((o) => normWord(o)).filter((o) => o && /^[ء-ي]+$/.test(o));
}

const isLen = (w: string) => [...w].length === WORD_LEN;
/** Letters written joined to the next word: «و» / «ف» (and, so), then «ب» / «ك» (with, like). */
const JOINED = /^[وف]?[بك]?/;

let byForm: Map<string, [number, number][]> | null = null;
let afterAnd: Map<string, [number, number][]> | null = null;

const add = (m: Map<string, [number, number][]>, f: string, s: number, a: number) => {
  const list = m.get(f) ?? [];
  if (!list.some(([x, y]) => x === s && y === a)) list.push([s, a]);
  m.set(f, list);
};

function build() {
  const exact = new Map<string, [number, number][]>();
  const joined = new Map<string, [number, number][]>();
  for (const [s, a, text] of quranFull().verses) {
    for (const word of verseWords(text)) {
      for (const f of quranForms(word)) {
        if (isLen(f)) add(exact, f, s, a);
        else {
          const p = f.match(JOINED)?.[0].length ?? 0;
          if (p && isLen(f.slice(p))) add(joined, f.slice(p), s, a);
        }
      }
    }
  }
  byForm = exact;
  afterAnd = joined;
  return { exact, joined };
}

/** Every 5-letter spelling found in the Quran as a whole word → the verses it appears in (in order). */
export function quranWordIndex(): Map<string, [number, number][]> {
  return byForm ?? build().exact;
}

/**
 * 5-letter spellings found after a joined «و»/«ف»/«ب»/«ك»: «وَٱلتِّينِ» gives «التين», «بِٱلصَّبۡرِ» «الصبر».
 * (Also gives some non-words such as «عدنا» from «وعدنا»: fine for accepting guesses; every answer is
 * hand-picked, and checked against its verse.)
 */
export function quranJoinedIndex(): Map<string, [number, number][]> {
  return afterAnd ?? build().joined;
}

/** Verses where the word appears: as a whole word first, then after a joined letter. */
export function versesWith(word: string): [number, number][] {
  return [...(quranWordIndex().get(word) ?? []), ...(quranJoinedIndex().get(word) ?? [])];
}

/** Does this normalised 5-letter word appear in the Quran (alone or after a joined letter)? */
export function inQuran(word: string): boolean {
  return quranWordIndex().has(word) || quranJoinedIndex().has(word);
}

/** The words of a verse that spell `word` (alone or after a joined letter). */
export function wordsSpelling(word: string, surah: number, ayah: number): string[] {
  const text = quranFull().verses.find(([s, a]) => s === surah && a === ayah)?.[2] ?? '';
  return verseWords(text).filter((w) =>
    quranForms(w).some((f) => f === word || (f.endsWith(word) && JOINED.test(f.slice(0, -word.length)) && f.slice(0, -word.length).match(JOINED)![0].length === [...f].length - [...word].length)),
  );
}

/** Verses worth showing after a round: short enough to read on a phone. */
const SHORT = 25;

/** The verse shown with an answer: the first short verse where it appears (else the shortest one). */
export function verseFor(word: string): [number, number] | null {
  const all = versesWith(word);
  if (!all.length) return null;
  const len = ([s, a]: [number, number]) => verseWords(quranFull().verses.find(([x, y]) => x === s && y === a)![2]).length;
  return all.find((r) => len(r) <= SHORT) ?? [...all].sort((x, y) => len(x) - len(y))[0];
}
