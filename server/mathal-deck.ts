/**
 * «أكمل المثل» — the game's rounds: which proverbs (from the room's decks, so they don't come back game
 * after game) and, for each, three wrong endings.
 *
 * A wrong ending is the ending of another proverb of the same source and of a similar length, never:
 * - one of this proverb's real endings (or too alike to one of them),
 * - an ending that would make a real saying with this beginning (it appears after it in another proverb:
 *   «السكوت» + «من ذهب» is inside «فالسكوت من ذهب»),
 * - the ending of a proverb that opens the same way («ما يحسّ بالمزود / ما يحسّ بالجمرة», «لكلّ…»), whose
 *   endings would sound right after this beginning too,
 * - two options too alike to each other.
 */
import type { MathalSettings, MathalSource } from '../src/shared/games/mathal';
import { MATHAL_DARIJA, MATHAL_FUSHA, type Mathal } from './content-mathal';
import { endingsAlike, flat, mathalWords } from './mathal-match';
import { qdeck } from './qdeck';
import type { GameCtx } from './types';

type Rnd = () => number;

export interface MathalItem {
  p: Mathal;
  /** the four endings in their shown order */
  options: string[];
  /** index of the real ending in `options` */
  correct: number;
}

export const poolOf = (source: MathalSource): Mathal[] => (source === 'fusha' ? MATHAL_FUSHA : MATHAL_DARIJA);

/** Opening words too common to say that two proverbs begin alike. */
const OPENERS = new Set(['اللي', 'ما', 'من', 'لا', 'اذا', 'الا', 'في', 'على', 'كل', 'كما', 'ان', 'و']);

/** Do two beginnings open the same way (so one's ending could sound right after the other)? */
export function sameOpening(a: string, b: string): boolean {
  const x = mathalWords(a);
  const y = mathalWords(b);
  if (x.length >= 2 && y.length >= 2 && x[0] === y[0] && x[1] === y[1]) return true;
  return x[0] === y[0] && !OPENERS.has(x[0]);
}

/** Can `c`'s ending be a wrong option for `p`? */
export function fairDistractor(p: Mathal, c: Mathal, holders = startHolders(p)): boolean {
  if (c === p || c.source !== p.source) return false;
  if ([p.end, ...(p.alt ?? [])].some((e) => endingsAlike(e, c.end))) return false;
  if (sameOpening(p.start, c.start)) return false;
  // «beginning + this ending» must not be a saying we know
  const joined = flat(p.start) + flat(c.end);
  return !holders.some((t) => t.includes(joined));
}

/** The other proverbs (in full) that contain `p`'s beginning: only these can hide a saying. */
function startHolders(p: Mathal): string[] {
  const st = flat(p.start);
  return fullTexts(p.source)
    .filter(([q, t]) => q !== p && t.includes(st))
    .map(([, t]) => t);
}

const FULL = new Map<MathalSource, [Mathal, string][]>();

/** Every proverb of a source in full (each of its endings), flattened once. */
function fullTexts(source: MathalSource): [Mathal, string][] {
  let list = FULL.get(source);
  if (!list) {
    list = poolOf(source).flatMap((q) => [q.end, ...(q.alt ?? [])].map((e) => [q, flat(`${q.start} ${e}`)] as [Mathal, string]));
    FULL.set(source, list);
  }
  return list;
}

const words = (s: string) => mathalWords(s).length;
const letters = (s: string) => flat(s).length;

/** How unlike in length two endings are (0 = the same number of words and letters). */
const lengthGap = (a: string, b: string) => Math.abs(words(a) - words(b)) * 4 + Math.abs(letters(a) - letters(b));

function shuffled<T>(xs: readonly T[], rnd: Rnd): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const FAIR = new Map<Mathal, Mathal[]>();

/** The proverbs whose endings can be wrong options for `p` (worked out once). */
export function fairPool(p: Mathal): Mathal[] {
  let list = FAIR.get(p);
  if (!list) {
    const holders = startHolders(p);
    list = poolOf(p.source).filter((c) => fairDistractor(p, c, holders));
    FAIR.set(p, list);
  }
  return list;
}

const lastWord = (s: string) => mathalWords(s).slice(-1)[0] ?? '';

/**
 * How far an ending is from being a good wrong option for `p`: its gap in length, less when its proverb
 * is built the same way (the same last word of the beginning: «أكرم من / أطمع من…» get names).
 */
const distance = (p: Mathal, c: Mathal) => lengthGap(p.end, c.end) - (lastWord(p.start) === lastWord(c.start) ? 8 : 0);

/** Three wrong endings of a similar length (chosen at random among the closest in length). */
export function pickDistractors(p: Mathal, rnd: Rnd, n = 3): string[] {
  const fair = shuffled(fairPool(p), rnd).sort((a, b) => distance(p, a) - distance(p, b));
  const near = shuffled(fair.slice(0, Math.max(10, n * 4)), rnd);
  const out: string[] = [];
  for (const c of [...near, ...fair]) {
    if (out.length >= n) break;
    if (out.some((o) => endingsAlike(o, c.end))) continue;
    out.push(c.end);
  }
  return out;
}

export function makeItem(p: Mathal, rnd: Rnd): MathalItem {
  const options = shuffled([p.end, ...pickDistractors(p, rnd)], rnd);
  return { p, options, correct: options.indexOf(p.end) };
}

/** The sources of the game's rounds: one source, or both in turn (in a shuffled order) for «منوّعة». */
function roundSources(settings: MathalSettings, rnd: Rnd): MathalSource[] {
  if (settings.source !== 'mixed') return Array.from({ length: settings.rounds }, () => settings.source as MathalSource);
  const half = Array.from({ length: settings.rounds }, (_, i) => (i % 2 ? 'darija' : 'fusha') as MathalSource);
  return shuffled(half, rnd);
}

/** The game's rounds, each proverb at most once. */
export function buildMathal(ctx: GameCtx, settings: MathalSettings, rnd: Rnd): MathalItem[] {
  const used = new Set<Mathal>();
  return roundSources(settings, rnd).map((source) => {
    const deck = qdeck(ctx, `mathal:${source}`, poolOf(source));
    const p = deck.draw((x) => used.has(x));
    used.add(p);
    return makeItem(p, rnd);
  });
}
