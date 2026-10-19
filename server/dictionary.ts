/**
 * «اسم ولد اسم بنت»: is an answer a real word? Looks it up in server/data/names-dict.txt (≈450k
 * normalised Arabic words from the Hunspell dictionary and everyday usage — see tools/names-dict.mjs)
 * and in the curated category lists (server/names-words.ts: the bots' words and the extra spellings
 * and Moroccan words players write).
 *
 * The file stays one string with a sorted line index (binary search): a Set of 450k strings would
 * cost ~100 MB of memory, this costs ~8 MB. It is loaded the first time it's needed.
 *
 * People write foreign names and dialect words in many ways («نيوزيلندا / نيوزيلاندا», «بسطيلة /
 * بستيلا», «دلفين / دولفين»), so after the exact lookup comes a spelling-tolerant one (see looseCost):
 * long vowels written or not, ة/ه/ا at the end, hamza, a doubled letter, and the letters that sound
 * alike in loanwords (ط/ت, ص/س, ض/د, ظ/ز, ث/ت/س, ذ/د/ز, ق/ك). Candidates come from a "skeleton" index
 * (the word without its vowels, alike-sounding letters merged), built lazily like the line index.
 */
import fs from 'node:fs';
import path from 'node:path';

import { norm, stripAl } from '../src/shared/arabic';
import { NAMES_EXTRA, NAMES_WORDS } from './names-words';

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

/* ------------------------------------------------------------------ */
/* Spelling-tolerant matching                                          */
/* ------------------------------------------------------------------ */

const VOWEL = new Set(['ا', 'و', 'ي']);
/** letters people swap in loanwords and dialect words (both ways) */
const ALIKE = new Set(['طت', 'صس', 'ضد', 'ظز', 'ثت', 'ثس', 'ذد', 'ذز', 'قك', 'ضظ'].flatMap((p) => [p, p[1] + p[0]]));
/** the same, merged into one letter each (so every alike pair lands in the same skeleton) */
const MERGE: Record<string, string> = { ط: 'ت', ث: 'ت', س: 'ت', ص: 'ت', ض: 'د', ذ: 'د', ز: 'د', ظ: 'د', ق: 'ك' };

/** A normalised word for the tolerant lookup: no hamza, no ة/ه/ا ending («بسطيلة», «بسطيلا» → «بسطيل»). */
function looseForm(key: string): string {
  const s = key.replace(/ء/g, '');
  const t = s.replace(/[اه]+$/, '');
  return t.length >= 2 ? t : s;
}

/** First letter + the consonants, alike letters merged, repeats collapsed: «نيوزيلاندا» → «ندلند». */
function skeleton(f: string): string {
  let out = '';
  for (let i = 0; i < f.length; i++) {
    const c = f[i];
    if (i > 0 && VOWEL.has(c)) continue;
    const m = MERGE[c] ?? c;
    if (out[out.length - 1] !== m) out += m;
  }
  return out;
}

/** Consonants (the first letter counts, a doubled letter once): «بطاطيس» 4, «طوكيو» 2. */
function consonants(f: string): number {
  let n = 0;
  for (let i = 0; i < f.length; i++) if (i === 0 || (!VOWEL.has(f[i]) && f[i] !== f[i - 1])) n++;
  return n;
}

/**
 * Is the tolerant lookup allowed for this loose form? It needs 4+ letters, 3+ consonants and no
 * letter three times in a row (keyboard mashing).
 */
function looseOk(f: string): boolean {
  return f.length >= 4 && consonants(f) >= 3 && !/(.)\1\1/.test(f);
}

/**
 * How far apart two loose forms are: 1 per long vowel added, dropped or changed (not the first
 * letter), 1 per alike-letter swap, 1 per doubled letter inside a word of 6+ letters; anything else
 * (another consonant) is no match at all. Returns a number > max when they're further than max.
 */
function looseCost(a: string, b: string, max: number): number {
  const INF = max + 1;
  // a doubled letter only counts as a spelling slip in longer words: «سممر» is not «سمر»
  const del = (s: string, i: number) => ((s.length >= 6 && i > 1 && s[i] === s[i - 1] && i < s.length - 1) || (i > 0 && VOWEL.has(s[i])) ? 1 : INF);
  let prev = new Array<number>(b.length + 1).fill(INF);
  prev[0] = 0;
  for (let j = 1; j <= b.length; j++) prev[j] = Math.min(INF, prev[j - 1] + del(b, j - 1));
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(INF);
    row[0] = Math.min(INF, prev[0] + del(a, i - 1));
    let best = row[0];
    for (let j = 1; j <= b.length; j++) {
      const x = a[i - 1], y = b[j - 1];
      let sub = INF;
      if (x === y) sub = 0;
      else if (ALIKE.has(x + y)) sub = 1;
      else if (i > 1 && j > 1 && VOWEL.has(x) && VOWEL.has(y)) sub = 1;
      row[j] = Math.min(INF, prev[j - 1] + sub, prev[j] + del(a, i - 1), row[j - 1] + del(b, j - 1));
      if (row[j] < best) best = row[j];
    }
    if (best > max) return INF;
    prev = row;
  }
  return prev[b.length];
}

/** One slip: a letter added, dropped, changed, or two neighbours swapped. */
function oneSlip(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    const diff: number[] = [];
    for (let i = 0; i < la && diff.length <= 2; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

/* ------------------------------------------------------------------ */
/* Curated lists                                                       */
/* ------------------------------------------------------------------ */

type Curated = {
  byCat: Map<string, Set<string>>; // category → phrase keys
  all: Set<string>; // phrase keys of every category
  flat: Set<string>; // the same without spaces
  bySkeleton: Map<string, string[]>; // skeleton → loose forms (spaces removed)
  byFirst: Map<string, string[]>; // first letter → keys (spaces removed), for the one-slip check
};
let curated: Curated | null = null;

function curatedLists(): Curated {
  if (curated) return curated;
  const c: Curated = { byCat: new Map(), all: new Set(), flat: new Set(), bySkeleton: new Map(), byFirst: new Map() };
  for (const src of [NAMES_WORDS, NAMES_EXTRA] as Record<string, string[]>[])
    for (const [cat, words] of Object.entries(src)) {
      const set = c.byCat.get(cat) ?? new Set<string>();
      c.byCat.set(cat, set);
      for (const w of words) {
        const k = phraseKey(w);
        if (!k) continue;
        set.add(k);
        if (c.all.has(k)) continue;
        c.all.add(k);
        const flat = k.replace(/ /g, '');
        c.flat.add(flat);
        const f = looseForm(flat);
        const sk = skeleton(f);
        const arr = c.bySkeleton.get(sk);
        if (arr) arr.push(f);
        else c.bySkeleton.set(sk, [f]);
        const first = c.byFirst.get(flat[0]);
        if (first) first.push(flat);
        else c.byFirst.set(flat[0], [flat]);
      }
    }
  return (curated = c);
}

/** A curated word written another way: «نيوزيلاندا», «بستيلا», «تلفيزيون», «غيته». */
function looseCurated(flat: string): boolean {
  const f = looseForm(flat);
  if (!looseOk(f)) return false;
  const max = [...flat].length >= 6 ? 2 : 1;
  return (curatedLists().bySkeleton.get(skeleton(f)) ?? []).some((g) => looseCost(f, g, max) <= max);
}

/** A curated word of 6+ letters with one slip of the keyboard. */
function slipCurated(flat: string): boolean {
  if (flat.length < 6) return false;
  return (curatedLists().byFirst.get(flat[0]) ?? []).some((k) => k.length >= 6 && oneSlip(flat, k));
}

/* ------------------------------------------------------------------ */
/* Big dictionary, tolerant                                            */
/* ------------------------------------------------------------------ */

/** Skeleton index of the big list, as a hash table: bucket → first line, then line → next line. */
const BUCKETS = 1 << 19;
let skHead: Int32Array | null = null;
let skNext: Int32Array | null = null;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) & (BUCKETS - 1);
}

const code = (c: string) => c.charCodeAt(0);
const HAMZA = code('ء');
const TAIL = new Set(['ا', 'ه', 'ء'].map(code));
const VOWEL_CODE = new Set([...VOWEL].map(code));
const MERGE_CODE = new Map(Object.entries(MERGE).map(([a, b]) => [code(a), code(b)]));

/**
 * hash(skeleton(looseForm(word))) for the line text[s, e), or -1 when the word is too short for the
 * tolerant lookup — computed on the characters directly, so building the index allocates no strings.
 */
function lineSkeletonHash(s: number, e: number): number {
  if (e - s < 5) return -1;
  // looseForm: no hamza, no ة/ه/ا ending (unless that leaves fewer than 2 letters)
  let end = e;
  while (end > s && TAIL.has(text.charCodeAt(end - 1))) end--;
  let kept = 0;
  for (let i = s; i < end; i++) if (text.charCodeAt(i) !== HAMZA) kept++;
  if (kept < 2) end = e;
  let h = 2166136261, last = -1, prev = -1, first = true, cons = 0;
  for (let i = s; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c === HAMZA) continue;
    const vowel = !first && VOWEL_CODE.has(c);
    if (first || (!vowel && c !== prev)) cons++;
    if (!vowel) {
      const m = MERGE_CODE.get(c) ?? c;
      if (m !== last) {
        h = Math.imul(h ^ m, 16777619);
        last = m;
      }
    }
    prev = c;
    first = false;
  }
  return cons < 3 ? -1 : (h >>> 0) & (BUCKETS - 1);
}

function loadSkeletons() {
  if (skHead) return;
  load();
  const n = starts!.length;
  const head = new Int32Array(BUCKETS).fill(-1);
  const next = new Int32Array(n).fill(-1);
  for (let i = n - 1; i >= 0; i--) {
    const st = starts![i];
    const nl = text.indexOf('\n', st);
    const h = lineSkeletonHash(st, nl < 0 ? text.length : nl);
    if (h < 0) continue;
    next[i] = head[h];
    head[h] = i;
  }
  skHead = head;
  skNext = next;
}

/** A word of the big list written with one difference (a long vowel, an alike letter): 7+ letters only. */
function looseDict(word: string): boolean {
  if (word.length < DICT_LOOSE_MIN) return false;
  const f = looseForm(word);
  if (!looseOk(f)) return false;
  loadSkeletons();
  const sk = skeleton(f);
  for (let i = skHead![hash(sk)]; i >= 0; i = skNext![i]) {
    const g = looseForm(lineAt(i));
    if (skeleton(g) === sk && looseCost(f, g, 1) <= 1) return true;
  }
  return false;
}
const DICT_LOOSE_MIN = 7;

/* ------------------------------------------------------------------ */

/** Small words that only glue names together: «عبد الله», «أبو بكر», «بن», «مولاي»… */
const GLUE = new Set(['عبد', 'ابو', 'ام', 'بن', 'بنت', 'ابن', 'مولاي', 'لالا', 'لاله', 'سيدي', 'دار', 'عين', 'بني', 'اولاد', 'سان', 'نيو', 'راس', 'جبل', 'وادي', 'تل', 'لا', 'دي', 'دو']);

/**
 * Letters of Persian/Moroccan keyboards: «ک», «ی», «ڤ», «پ» have one Arabic letter; the Moroccan «ڭ»
 * (g) is written ك, ق, ج or غ in Arabic spelling («ڭرسيف» = «جرسيف», «أڭادير» = «أكادير»), «چ» ش or ج.
 */
function spellings(answer: string): string[] {
  const s = answer
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/ک/g, 'ك')
    .replace(/[یې]/g, 'ي')
    .replace(/ڤ/g, 'ف')
    .replace(/پ/g, 'ب')
    .replace(/[ەۀۃ]/g, 'ه');
  let out = [s];
  for (const [ch, alts] of [['[ڭݣگ]', ['ك', 'ق', 'ج', 'غ']], ['چ', ['ش', 'ج', 'تش']]] as const)
    if (new RegExp(ch).test(s)) out = out.flatMap((v) => alts.map((a) => v.replace(new RegExp(ch, 'g'), a)));
  return out.slice(0, 16);
}

/** «عيسا», «حمزا», «فاطيما»: a final ا written for ى or ة (looked up exactly, not tolerantly). */
function finalAlif(s: string): string[] {
  const re = /([^ ]{2})ا(?= |$)/g;
  return re.test(s) ? [s.replace(re, '$1ى'), s.replace(re, '$1ة')] : [];
}

export type WordMatch = 'list' | 'dict' | 'list-spelling' | 'list-slip' | 'dict-spelling';

/** Small words of an answer, normalised (no «ال»), and the whole answer without spaces. */
function parts(answer: string) {
  const key = phraseKey(answer);
  return { key, flat: key.replace(/ /g, ''), words: key.split(' ') };
}

function exactWord(w: string): boolean {
  if (GLUE.has(w) || inDict(w) || curatedLists().all.has(w)) return true;
  // «عبدالصمد», «ابوبكر» typed as one word
  for (const g of ['عبد', 'ابو', 'بو', 'ام', 'نور']) if (w.startsWith(g) && w.length > g.length + 1 && inDict(stripAl(w.slice(g.length)))) return true;
  return false;
}

/** The answer as written: in a curated list, or every word in the dictionary. */
function exact(answer: string, cat?: string): WordMatch | null {
  const { key, flat, words } = parts(answer);
  if (!key) return null;
  const c = curatedLists();
  if ((cat && c.byCat.get(cat)?.has(key)) || c.all.has(key)) return 'list';
  // «نيو يورك» = «نيويورك»; «عبدالرحيم», «نورالدين»: a name glued to its second part, article included
  if (c.flat.has(flat) || c.flat.has(flat.replace(/^(.{2,}?)ال(?=..)/, '$1'))) return 'list';
  return words.every(exactWord) ? 'dict' : null;
}

/** Written another way: the whole answer against the curated lists, then word by word. */
function tolerant(answer: string): WordMatch | null {
  const { key, flat, words } = parts(answer);
  if (!key) return null;
  if (looseCurated(flat)) return 'list-spelling';
  if (slipCurated(flat)) return 'list-slip';
  if (words.every((w) => exactWord(w) || looseCurated(w))) return 'list-spelling';
  return words.every((w) => exactWord(w) || looseCurated(w) || looseDict(w)) ? 'dict-spelling' : null;
}

/** How an answer is known (for tests and tuning), or null. */
export function wordMatch(answer: string, cat?: string): WordMatch | null {
  const forms = spellings(answer);
  for (const s of [...forms, ...forms.flatMap(finalAlif)]) {
    const m = exact(s, cat);
    if (m) return m;
  }
  for (const s of forms) {
    const m = tolerant(s);
    if (m) return m;
  }
  return null;
}

/**
 * Does the dictionary know this answer? Multi-word answers count when every word is known (or is a
 * name glue word); «عبدالصمد» written as one word counts like «عبد الصمد». Spelling variants of known
 * words count too (see looseCost).
 */
export function knownWord(answer: string, cat?: string): boolean {
  return wordMatch(answer, cat) !== null;
}
