/**
 * «من أي سورة؟» — a verse is shown (exact Uthmani text), pick the surah it's from.
 * Levels: easy = Juz' Amma (78–114), medium = from Qaf to the end (50–114), hard = the whole Quran.
 * Verses that appear word-for-word in more than one surah are excluded when the data is built.
 */
import { readFileSync } from 'node:fs';

import type { SurahSettings } from '../../src/shared/protocol';
import { qdeck } from '../qdeck';
import { shuffle } from '../util';
import { makeMcq, mcqOptions } from './mcq';
import { forFont } from './tajweed';
import { ASK, voiceAnswer, voiceQuestion } from '../voice-calls-party';

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

/** Bots know Juz' Amma well, the longer surahs less, the whole Quran much less. */
export const SURAH_BOT_SKILL: Record<SurahSettings['level'], number> = { easy: 0.7, medium: 0.55, hard: 0.4 };

export const surah = makeMcq<SurahSettings>(
  'surah',
  (ctx, settings, rounds) => {
    const { surahs, verses } = quranData();
    const from = LEVEL_FROM[settings.level];
    const bySurah = new Map<number, [number, number, string][]>();
    for (const v of verses) {
      if (v[0] < from) continue;
      if (!bySurah.has(v[0])) bySurah.set(v[0], []);
      bySurah.get(v[0])!.push(v);
    }
    // one verse per surah per game, and the room's decks keep surahs and verses from coming back too soon
    const picks = qdeck(ctx, `surah:${settings.level}`, [...bySurah.keys()])
      .deal(rounds)
      .map((n) => qdeck(ctx, `surah:v:${n}`, bySurah.get(n)!).draw());
    const inLevel = surahs.filter((x) => x.n >= from);
    return picks.map(([n, ayah, text]) => {
      // distractors: mostly neighbouring surahs (harder), sometimes random ones
      const near = inLevel.filter((x) => x.n !== n && Math.abs(x.n - n) <= 6);
      const others = shuffle(near.length >= 3 ? near : inLevel.filter((x) => x.n !== n)).slice(0, 3);
      const s = surahs[n - 1];
      return {
        text: forFont(text), // open tanween as the Quran font draws it
        ...mcqOptions(s.name, others.map((o) => o.name)),
        label: LEVEL_LABEL[settings.level],
        ref: `سورة ${s.name} — الآية ${ayah}`,
      };
    });
  },
  (settings) => SURAH_BOT_SKILL[settings.level],
  // the voice never reads the verse itself: the question in plain words, the surah names, then «سورة …، الآية …»
  { ask: (item) => voiceQuestion(ASK.surah, item.options), answer: (item) => voiceAnswer((item.ref ?? item.options[item.correct]).replace(' — ', '، ')) },
);
