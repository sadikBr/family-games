/**
 * «حروف»: the questions of every category the host can choose (HUROOF_CATS). The Islamic ones are the
 * Islamic quiz's questions (content-islamic.ts, unchanged); the others live in content-huroof-*.ts as
 * `[question, answer]` pairs, where the answer may list other accepted spellings after «|»
 * («مراكش|مراكيش»). Every spelling starts with the same letter as the answer, «ال» aside — the letter
 * is what the game is about (see firstLetter).
 *
 * Bots that answer wrongly type another answer of the same letter (`w`), picked from the same
 * category first.
 */
import { answerMatches, firstLetter } from '../src/shared/arabic';
import type { HuroofCat } from '../src/shared/protocol';
import { AROUND } from './content-huroof-around';
import { FOOD } from './content-huroof-food';
import { GENERAL } from './content-huroof-general';
import { GEO } from './content-huroof-geo';
import { MOROCCO } from './content-huroof-morocco';
import { NATURE } from './content-huroof-nature';
import { SCIENCE } from './content-huroof-science';
import { SPORT } from './content-huroof-sport';
import { QUESTIONS } from './content-islamic';

/** A question as written in a content file: the question and its answer («answer|other spelling|…»). */
export type RawQ = readonly [string, string];

export interface HuroofQ {
  q: string;
  /** the answer shown */
  a: string;
  /** other accepted spellings */
  alt: string[];
  /** wrong answers a bot may type (same letter when possible) */
  w: string[];
  cat: HuroofCat;
}

/** The raw content of the new categories (exported for the content tests). */
export const HUROOF_RAW: Record<Exclude<HuroofCat, 'islamic'>, readonly RawQ[]> = {
  general: GENERAL,
  geo: GEO,
  nature: NATURE,
  science: SCIENCE,
  food: FOOD,
  sport: SPORT,
  morocco: MOROCCO,
  around: AROUND,
};

/** A real letter starts the answer (not a number such as «114»). */
const lettered = (a: string) => /[ء-ي]/.test(firstLetter(a));

function build(): Record<HuroofCat, HuroofQ[]> {
  const pool = { islamic: QUESTIONS.filter((q) => lettered(q.a)).map((q): HuroofQ => ({ q: q.q, a: q.a, alt: [], w: [...q.w], cat: 'islamic' })) } as Record<HuroofCat, HuroofQ[]>;
  for (const [cat, raw] of Object.entries(HUROOF_RAW) as [Exclude<HuroofCat, 'islamic'>, readonly RawQ[]][]) {
    pool[cat] = raw.map(([q, ans]) => {
      const [a, ...alt] = ans.split('|').map((x) => x.trim());
      return { q, a, alt, w: [], cat };
    });
  }
  // wrong answers: other answers of the same letter, from the same category first, then from the others
  const all = Object.values(pool).flat();
  const byLetter = new Map<string, HuroofQ[]>();
  for (const q of all) {
    const l = firstLetter(q.a);
    if (!byLetter.has(l)) byLetter.set(l, []);
    byLetter.get(l)!.push(q);
  }
  for (const [cat, qs] of Object.entries(pool)) {
    if (cat === 'islamic') continue;
    qs.forEach((q, i) => {
      const same = byLetter.get(firstLetter(q.a)) ?? [];
      const right = (x: string) => [q.a, ...q.alt].some((f) => answerMatches(x, f) || answerMatches(f, x));
      const pick: string[] = [];
      const add = (list: HuroofQ[]) => {
        // a fixed rotation (by the question's place), so the same question always has the same wrong answers
        for (let k = 0; k < list.length && pick.length < 3; k++) {
          const x = list[(i * 7 + k) % list.length].a;
          if (!right(x) && !pick.includes(x)) pick.push(x);
        }
      };
      add(same.filter((x) => x.cat === q.cat));
      add(same.filter((x) => x.cat !== q.cat));
      add(all);
      q.w = pick;
    });
  }
  return pool;
}

/** Every category's questions (only answers that start with a letter). */
export const HUROOF_POOL: Record<HuroofCat, HuroofQ[]> = build();
