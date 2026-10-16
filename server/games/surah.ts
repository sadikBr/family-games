/**
 * «من أي سورة؟» — a verse is shown (exact Uthmani text), pick the surah it's from.
 * Levels: easy = Juz' Amma (78–114), medium = from Qaf to the end (50–114), hard = the whole Quran.
 * Verses that appear word-for-word in more than one surah are excluded when the data is built.
 */
import { readFileSync } from 'node:fs';

import type { SurahSettings } from '../../src/shared/protocol';
import { shuffle } from '../util';
import { makeMcq, mcqOptions } from './mcq';

interface QuranData {
  surahs: { n: number; name: string; type: string; count: number }[];
  verses: [number, number, string][];
}

let data: QuranData | null = null;
export function quranData(): QuranData {
  data ??= JSON.parse(readFileSync(new URL('../quran-data.json', import.meta.url), 'utf8')) as QuranData;
  return data;
}

export const LEVEL_FROM: Record<SurahSettings['level'], number> = { easy: 78, medium: 50, hard: 1 };
const LEVEL_LABEL: Record<SurahSettings['level'], string> = { easy: 'جزء عمّ', medium: 'من «ق» إلى «الناس»', hard: 'القرآن كاملاً' };

export const surah = makeMcq<SurahSettings>('surah', (settings) => {
  const { surahs, verses } = quranData();
  const from = LEVEL_FROM[settings.level];
  const pool = verses.filter((v) => v[0] >= from);
  // at most one verse per surah per game when possible, so the same surah doesn't keep coming back
  const bySurah = new Map<number, [number, number, string][]>();
  for (const v of shuffle(pool)) {
    if (!bySurah.has(v[0])) bySurah.set(v[0], []);
    bySurah.get(v[0])!.push(v);
  }
  const order = shuffle([...bySurah.keys()]);
  const picks: [number, number, string][] = [];
  for (let k = 0; picks.length < settings.rounds && k < 50; k++) for (const n of order) if (picks.length < settings.rounds && bySurah.get(n)![k]) picks.push(bySurah.get(n)![k]);
  const inLevel = surahs.filter((x) => x.n >= from);
  return picks.map(([n, ayah, text]) => {
    // distractors: mostly neighbouring surahs (harder), sometimes random ones
    const near = inLevel.filter((x) => x.n !== n && Math.abs(x.n - n) <= 6);
    const others = shuffle(near.length >= 3 ? near : inLevel.filter((x) => x.n !== n)).slice(0, 3);
    const s = surahs[n - 1];
    return {
      text,
      ...mcqOptions(s.name, others.map((o) => o.name)),
      label: LEVEL_LABEL[settings.level],
      ref: `سورة ${s.name} — الآية ${ayah}`,
    };
  });
});
