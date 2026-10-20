/**
 * «حروف مبعثرة»: letter grids, the word check and a solver.
 *
 * - A player's word counts when it is in the big Arabic list (server/scrabble-dict.ts, exact lookup:
 *   «ال» + a word is NOT a second word) — normalised like the dictionary (أ إ آ → ا, ة → ه, ى → ي…) —
 *   or, failing that, when the Arabic Hunspell dictionary knows it as a stem with endings (plurals,
 *   feminine, pronouns, verb forms: server/hunspell.ts) and no prefix at all (no «ال», و, ب…).
 *   The bots and «the word you missed» stay on the everyday words (listed words only).
 * - The dice: letters drawn by how often they appear in everyday words (server/data/common-words.txt).
 * - Every grid is solved against the everyday words (a small prefix set, built once) and re-rolled
 *   until it hides enough of them; the same solve feeds the bots and «the best word you missed».
 */
import fs from 'node:fs';
import path from 'node:path';

import { norm } from '../src/shared/arabic';
import { BOGGLE_MIN_LEN, boggleValidPath } from '../src/shared/games/boggle';
import { spellArabic } from './hunspell';
import { listWord } from './scrabble-dict';

/** Letters on the dice (normalised spelling; no «ء»: words with it are rare and awkward on a die). */
export const BOGGLE_LETTERS = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];
const LETTER_SET = new Set(BOGGLE_LETTERS);

/**
 * Dialect words (Egyptian, Darija, Tunisian, Levantine, Gulf…) that slipped into the everyday list (it
 * comes from film subtitles): bots never send them and they are never shown as «the word you missed».
 * Ambiguous ones that are mostly dialect in subtitles are left out too (كمان «also», تاني «again»).
 */
const DIALECT = new Set(
  ('دلوقتي ازاي كده كدا عايز عايزه عاوز بتاع بتاعي بتاعك ديال واش دابا بزاف شنو علاش كيفاش فين ماشي برشا توا ياسر هلق هلا ' +
    'شو هيك عشان علشان كتير كويس كويسه لسه لسا برضو برضه تاني شويه شويا كمان اهو اهي ايوه بدي بدك بدنا هيدا هيدي منيح ' +
    'وين شلون ليش امتي زعما بغيت بغا هاد هادا مزيان واخا خلي ابغي بقي ازيك يلا خلاص').split(' '),
);

/** Words the list misses that a family will surely find. */
const EXTRA_WORDS = new Set(['الله']);

/** The list check alone (normalised word): what the everyday words are filtered with. */
function listedWord(w: string): boolean {
  return [...w].length >= BOGGLE_MIN_LEN && !/[^ء-ي]/.test(w) && (listWord(w) || EXTRA_WORDS.has(w));
}

/** Does a word count? Raw Arabic is normalised; at least 3 letters; no «ال» + word, no prefix. */
export function boggleWord(word: string): boolean {
  const w = norm(word);
  if ([...w].length < BOGGLE_MIN_LEN || /[^ء-ي]/.test(w)) return false;
  return listedWord(w) || spellArabic(w, { prefixes: 'none', noGrammar: true });
}

interface Common {
  /** everyday words that count (3+ letters, only dice letters) */
  words: Set<string>;
  prefixes: Set<string>;
  /** [letter, weight] for the dice */
  weights: [string, number][];
  total: number;
}
let common: Common | null = null;

/** The everyday words (loaded once): the bots' vocabulary and the solver's target. */
export function commonWords(): Common {
  if (common) return common;
  let raw: string[] = [];
  try {
    raw = fs.readFileSync(path.join(import.meta.dir, 'data', 'common-words.txt'), 'utf8').split('\n');
  } catch {
    raw = [];
  }
  const words = new Set<string>();
  const prefixes = new Set<string>();
  const count = new Map<string, number>();
  for (const w of raw) {
    if (w.length < BOGGLE_MIN_LEN || DIALECT.has(w) || ![...w].every((c) => LETTER_SET.has(c)) || !listedWord(w)) continue;
    words.add(w);
    for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));
    for (const c of w) count.set(c, (count.get(c) ?? 0) + 1);
  }
  // a little flatter than the raw counts, so rarer letters still show up now and then
  const weights = BOGGLE_LETTERS.map((c): [string, number] => [c, Math.pow(count.get(c) ?? 1, 0.8)]);
  common = { words, prefixes, weights, total: weights.reduce((a, [, x]) => a + x, 0) };
  return common;
}

/** Cells touching each cell of a size×size grid. */
const neighbourCache = new Map<number, number[][]>();
export function neighbours(size: number): number[][] {
  let n = neighbourCache.get(size);
  if (!n) {
    n = Array.from({ length: size * size }, (_, i) => {
      const r = Math.floor(i / size), c = i % size;
      const out: number[] = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
        }
      return out;
    });
    neighbourCache.set(size, n);
  }
  return n;
}

/** The word a path spells (empty if the path is not valid). */
export function wordOf(grid: readonly string[], size: number, p: readonly number[]): string {
  return boggleValidPath(size, p) ? p.map((i) => grid[i]).join('') : '';
}

/** Is this one of the dialect words bots and «the word you missed» stay away from? */
export const isDialect = (w: string) => DIALECT.has(norm(w));

/** Every everyday (standard Arabic) word hidden in the grid, with one path for each. */
export function solve(grid: readonly string[], size: number): Map<string, number[]> {
  const { words, prefixes } = commonWords();
  const nb = neighbours(size);
  const found = new Map<string, number[]>();
  const used = new Array<boolean>(grid.length).fill(false);
  const p: number[] = [];
  const walk = (cell: number, sofar: string) => {
    const w = sofar + grid[cell];
    if (!prefixes.has(w)) return;
    used[cell] = true;
    p.push(cell);
    if (w.length >= BOGGLE_MIN_LEN && words.has(w) && !found.has(w)) found.set(w, [...p]);
    for (const n of nb[cell]) if (!used[n]) walk(n, w);
    p.pop();
    used[cell] = false;
  };
  for (let i = 0; i < grid.length; i++) walk(i, '');
  return found;
}

/** Fewest everyday words a grid must hide (re-rolled until it does). */
export const MIN_WORDS: Record<number, number> = { 4: 80, 5: 170 };

/** One random grid: letters by frequency, at most 3 (4×4) / 4 (5×5) of a letter, rare letters once. */
export function rollGrid(size: number, rand: () => number = Math.random): string[] {
  const { weights, total } = commonWords();
  const cap = size >= 5 ? 4 : 3;
  const rare = new Set(weights.filter(([, w]) => w < total / 60).map(([c]) => c));
  const have = new Map<string, number>();
  const grid: string[] = [];
  while (grid.length < size * size) {
    let x = rand() * total;
    let pick = weights[weights.length - 1][0];
    for (const [c, w] of weights) {
      x -= w;
      if (x < 0) {
        pick = c;
        break;
      }
    }
    const n = have.get(pick) ?? 0;
    if (n >= (rare.has(pick) ? 1 : cap)) continue;
    have.set(pick, n + 1);
    grid.push(pick);
  }
  return grid;
}

/** A grid with enough everyday words in it (the best of a few tries). */
export function generateGrid(size: number, rand: () => number = Math.random): { grid: string[]; words: Map<string, number[]> } {
  const need = MIN_WORDS[size] ?? MIN_WORDS[4];
  let best: { grid: string[]; words: Map<string, number[]> } | null = null;
  for (let i = 0; i < 80; i++) {
    const grid = rollGrid(size, rand);
    const words = solve(grid, size);
    if (!best || words.size > best.words.size) best = { grid, words };
    if (words.size >= need) break;
  }
  return best!;
}
