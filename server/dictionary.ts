/**
 * «اسم ولد اسم بنت»: is an answer a real word? Looks it up in server/data/names-dict.txt (≈450k
 * normalised Arabic words from the Hunspell dictionary and everyday usage — see tools/names-dict.mjs)
 * and in the curated category lists the bots use (names, countries and cities, Moroccan words).
 *
 * The file stays one string with a sorted line index (binary search): a Set of 450k strings would
 * cost ~100 MB of memory, this costs ~8 MB. It is loaded the first time it's needed.
 */
import fs from 'node:fs';
import path from 'node:path';

import { norm, stripAl } from '../src/shared/arabic';
import { NAMES_DICT } from './bot-content';

let text = '';
let starts: Int32Array | null = null;

function load() {
  if (starts) return;
  try {
    text = fs.readFileSync(path.join(import.meta.dir, 'data', 'names-dict.txt'), 'utf8');
  } catch {
    text = ''; // no dictionary: every word counts as known
  }
  const idx: number[] = [];
  let at = 0;
  while (at < text.length) {
    const nl = text.indexOf('\n', at);
    const end = nl < 0 ? text.length : nl;
    if (end > at) idx.push(at);
    at = end + 1;
  }
  starts = Int32Array.from(idx);
}

function lineAt(i: number) {
  const s = starts![i];
  const e = text.indexOf('\n', s);
  return text.slice(s, e < 0 ? text.length : e);
}

/** One normalised word (no «ال», no spaces) in the big list? */
function inDict(word: string): boolean {
  load();
  if (!starts!.length) return true;
  let lo = 0, hi = starts!.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = lineAt(mid);
    if (w === word) return true;
    if (w < word) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

const wordKey = (w: string) => stripAl(norm(w)).replace(/[^ء-ي]/g, '');
const phraseKey = (s: string) => norm(s).split(' ').map(wordKey).filter(Boolean).join(' ');

/** category → normalised entries of the curated lists (whole phrases, «ال» removed from each word) */
let curated: Map<string, Set<string>> | null = null;
function curatedFor(cat: string) {
  if (!curated) {
    curated = new Map();
    for (const [c, byLetter] of Object.entries(NAMES_DICT)) curated.set(c, new Set(Object.values(byLetter).flat().map(phraseKey)));
  }
  return curated.get(cat);
}
/** every curated word of any category (a girl's name typed in the boy box is still a real word) */
let anyCurated: Set<string> | null = null;
function inAnyCurated(key: string) {
  if (!anyCurated) {
    anyCurated = new Set();
    for (const c of Object.keys(NAMES_DICT)) for (const k of curatedFor(c) ?? []) anyCurated.add(k);
  }
  return anyCurated.has(key);
}

/** Small words that only glue names together: «عبد الله», «أبو بكر», «بن», «مولاي»… */
const GLUE = new Set(['عبد', 'ابو', 'ام', 'بن', 'بنت', 'ابن', 'مولاي', 'لالا', 'سيدي', 'دار', 'عين', 'بني', 'اولاد', 'سان', 'نيو', 'راس', 'جبل', 'وادي', 'تل', 'لا', 'دي', 'دو']);

/**
 * Does the dictionary know this answer? Multi-word answers count when every word is known (or is a
 * name glue word); «عبدالصمد» written as one word counts like «عبد الصمد».
 */
export function knownWord(answer: string, cat?: string): boolean {
  const key = phraseKey(answer);
  if (!key) return false;
  if ((cat && curatedFor(cat)?.has(key)) || inAnyCurated(key)) return true;
  return key.split(' ').every((w) => {
    if (GLUE.has(w) || inDict(w) || inAnyCurated(w)) return true;
    // «عبدالصمد», «ابوبكر» typed as one word
    for (const g of ['عبد', 'ابو', 'بو', 'ام', 'نور']) if (w.startsWith(g) && w.length > g.length + 1 && inDict(stripAl(w.slice(g.length)))) return true;
    return false;
  });
}
