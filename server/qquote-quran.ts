/**
 * The complete Quran text (server/data/quran-full.json, built by tools/quran-full.mjs from quran-json 3.1.2:
 * Uthmani text from quranenc.com, CC BY-SA 4.0), shared by «من القائل؟» and «كلمة قرآنية».
 * Verse text is always taken from this file by reference (surah:ayah), never typed by hand.
 */
import { readFileSync } from 'node:fs';

export interface QuranFull {
  source: string;
  surahs: { n: number; name: string; type: string; count: number }[];
  /** [surah, ayah, text] */
  verses: [number, number, string][];
}

let data: QuranFull | null = null;
let index: Map<string, string> | null = null;

export function quranFull(): QuranFull {
  data ??= JSON.parse(readFileSync(new URL('./data/quran-full.json', import.meta.url), 'utf8')) as QuranFull;
  return data;
}

/** The exact text of a verse, or null if there is no such verse. */
export function verseText(surah: number, ayah: number): string | null {
  if (!index) {
    index = new Map();
    for (const [s, a, t] of quranFull().verses) index.set(`${s}:${a}`, t);
  }
  return index.get(`${surah}:${ayah}`) ?? null;
}

export function surahName(surah: number): string {
  return quranFull().surahs[surah - 1]?.name ?? '';
}

/** «سورة يوسف — الآية 4» */
export function verseRef(surah: number, ayah: number): string {
  return `سورة ${surahName(surah)} — الآية ${ayah}`;
}

/** Signs that are not words: the hizb mark and the sajdah mark. */
const NOT_WORDS = /^[۞۩]+$/;

/** The verse's words (split on spaces; a hizb mark glued to the first word is dropped). */
export function verseWords(text: string): string[] {
  return text
    .replace(/[۞۩]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOT_WORDS.test(w));
}

/**
 * Words `from`..`to` of a verse (1-based, inclusive; `to` may be omitted for "to the end").
 * Cut on word boundaries only; the text itself is never changed.
 */
export function verseSlice(surah: number, ayah: number, from = 1, to?: number): string | null {
  const t = verseText(surah, ayah);
  if (t === null) return null;
  const words = verseWords(t);
  const end = to ?? words.length;
  if (from < 1 || end > words.length || from > end) return null;
  return words.slice(from - 1, end).join(' ');
}
