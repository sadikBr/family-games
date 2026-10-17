/**
 * «شبكة الكلمات»: the word list. Exact single-word lookups (and prefix checks for the bots) in
 * server/data/names-dict.txt, the same normalised Arabic list «اسم ولد اسم بنت» uses (see
 * server/dictionary.ts): one string + a sorted line index + binary search, never a Set of 450k words.
 *
 * The list has no article: «الباب» is stored as «باب» (words of 4+ letters starting with «ال» had it
 * removed), so a word placed with «ال» counts when the rest is a word — the same rule the list was
 * built with. It also left out grammar words («من», «في», «على», «كان»…): EXTRA puts the common ones back.
 */
import fs from 'node:fs';
import path from 'node:path';

import { norm } from '../src/shared/arabic';

let text = '';
let starts: Int32Array | null = null;

function load() {
  if (starts) return;
  try {
    text = fs.readFileSync(path.join(import.meta.dir, 'data', 'names-dict.txt'), 'utf8');
  } catch {
    text = '';
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

/** Index of the first line ≥ key (binary search over the sorted list). */
function lowerBound(key: string): number {
  load();
  let lo = 0, hi = starts!.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lineAt(mid) < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function inList(word: string): boolean {
  const i = lowerBound(word);
  return i < starts!.length && lineAt(i) === word;
}

function listHasPrefix(p: string): boolean {
  const i = lowerBound(p);
  return i < starts!.length && lineAt(i).startsWith(p);
}

/**
 * Two-letter words a bot may play (the list has a few hundred two-letter entries, many of them bare
 * Hunspell stems like «ثث»: players may use them, bots stick to these). Normalised spelling.
 */
const SHORT = new Set(
  ('من في عن لا ما يا او ان ثم هل لم لن قد كي اذ بل هو هي هم كم لو مع اب ام اخ يد فم دم دب دف ظل حب جد عم خط سر شك ' +
    'مد حر بر ضد كل نم قم صف حي حق حل حد سد شد عد رد مر جر خد ضم فك فن جو بن شم لف قط كف دق رش رز سم سن عش غش فخ ' +
    'قص لب مخ ند ود ور ذل عز غم فر كد مس مص نص هز وز تل جن خل خف خز دن رف رق سل صب صد ضر طب طن عض عف غض غل قر ' +
    'قل كر لص مل ذا ضب صك طه ري شي ظن قن ذو').split(' '),
);

/** Common words the list left out as «grammar words» (normalised: على → علي, حتى → حتي…). */
const EXTRA = new Set([
  ...SHORT,
  ...('الي علي حتي منذ عند لدي بين فوق تحت امام خلف وراء بعض غير نعم كلا اين متي كيف لماذا ماذا هذا هذه ذلك تلك ' +
    'الذي التي الذين اللذان هنا هناك انا انت انتم انتما انتن نحن هما هن اذا لكن ليس ليست قبل بعد حول دون ضمن ايضا ' +
    'ربما لعل سوف كان كانت كانوا يكون تكون صار مثل كما لما عسي اول اولي حيث اي ايا بلي الا اما انما كذا هكذا هؤلاء ' +
    'اولئك ذات ابو اخو ابي اخي امي كلما بينما عندما لدي معا جميع كلنا كله كلها شيء شي').split(' '),
]);

const EXTRA_PREFIX = new Set([...EXTRA].flatMap((w) => Array.from({ length: w.length }, (_, i) => w.slice(0, i + 1))));

/** p is the start of some word in the list (or of a grammar word)? */
function basePrefix(p: string): boolean {
  return !p || EXTRA_PREFIX.has(p) || listHasPrefix(p);
}

const baseWord = (w: string) => inList(w) || EXTRA.has(w);

/**
 * Is this a word? `word` may be raw Arabic (it is normalised: أإآ→ا, ة→ه, ى→ي, ؤ→و, ئ→ي, no
 * diacritics). «ال» + a word counts for 4+ letters, as the list was built.
 */
export function isWord(word: string): boolean {
  const w = norm(word);
  if ([...w].length < 2 || /[^ء-ي]/.test(w)) return false;
  if (baseWord(w)) return true;
  return w.startsWith('ال') && w.length > 3 && baseWord(w.slice(2));
}

/** Everyday words (server/data/common-words.txt, see tools/common-words.mjs): the only ones bots play. */
let common: Set<string> | null = null;
function isCommon(w: string): boolean {
  if (!common) {
    try {
      common = new Set(fs.readFileSync(path.join(import.meta.dir, 'data', 'common-words.txt'), 'utf8').split('\n').filter(Boolean));
    } catch {
      common = new Set();
    }
  }
  if (!common.size) return true; // no list: fall back to the dictionary alone
  return common.has(w) || EXTRA.has(w) || (w.startsWith('ال') && w.length > 3 && (common.has(w.slice(2)) || EXTRA.has(w.slice(2))));
}

/**
 * The stricter check bots use: two-letter words (alone or after «ال») only from SHORT, longer ones only
 * when they're everyday words — so bots don't play obscure stems or typos the big list contains.
 */
export function botWord(w: string): boolean {
  if (w.length < 2) return false;
  if (w.length === 2) return SHORT.has(w);
  if (!isCommon(w)) return false;
  if (w.startsWith('ال') && w.length > 3) {
    const rest = w.slice(2);
    if (baseWord(w)) return true;
    return rest.length === 2 ? SHORT.has(rest) : baseWord(rest);
  }
  return baseWord(w);
}

/** Can a word (as isWord sees it) start with these normalised letters? For the bots' search. */
export function isPrefix(p: string): boolean {
  if (basePrefix(p)) return true;
  return p.startsWith('ال') && basePrefix(p.slice(2));
}

/** Number of entries in the list (0 if the file is missing). */
export function dictSize(): number {
  load();
  return starts!.length;
}
