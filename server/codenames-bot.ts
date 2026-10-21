/**
 * «الكلمات السرية»: the spymaster bot. A bot is only ever a team's spymaster: it never guesses.
 *
 * Every board word lists the everyday words a family links to it, in three tiers (codenames-links.ts). A clue is
 * one of those link words: it "targets" the team's unrevealed words that list it (or that it lists, when the clue
 * is itself a board word of the big list). The hard rules never bend: a clue linked, even weakly or through one of
 * its forms, to an opponent word or to the black word is never given; nor a board word or a form of one; nor a
 * clue given before. A link to a neutral word is avoided: an expert may accept one the clue points at much less
 * than at its targets, and only an expert behind in the race risks more. The number is how many of the team's
 * words the clue targets, the strongest links first: a clue whose links are all strong aims at two or three
 * words, a weaker one at fewer.
 *
 * The lists can't hold every link a person makes, so the danger checks use a broader `relatedness`: the links
 * either way, the word's form or rough root («مطبخ» / «طباخ»), links shared with the clue's own board words (two
 * hops), words much like those or like the clue itself («صيف» / «ربيع»), the category the clue names («حيوان» →
 * «زرافة»), words said together («ملعقة» / «شوكة»). The black word may hardly be related to a clue, an opponent's
 * word only a little and well below every target, a neutral word never clearly (easy, smart) or only weakly
 * (expert); and every target must come before every word that is not the team's (`SAFETY`).
 */
import { norm } from '../src/shared/arabic';
import type { BotLevel, CodeColor } from '../src/shared/protocol';
import { CODENAMES_ENTRIES, CODENAMES_PAIRS } from './codenames-links';

type Team = 'red' | 'blue';

/** A word's spelling to look it up: normalised, without «ال» (only a real «ال», not the «أل» of «ألوان»), no spaces. */
function keyOfWord(word: string): string {
  const w = word.trim();
  return norm(w.startsWith('ال') && w.length > 3 ? w.slice(2) : w).replace(/\s/g, '');
}

/** A word reduced to compare forms: no «ال», hamza shapes, final ة, the common plural endings. */
export function stemOf(word: string): string {
  let s = keyOfWord(word);
  for (const suffix of ['ات', 'ون', 'ين', 'ان']) {
    if (s.endsWith(suffix) && s.length >= 5) {
      s = s.slice(0, -2);
      break;
    }
  }
  if (s.endsWith('ه') && s.length >= 3) s = s.slice(0, -1);
  return s;
}

/** The consonants of a word (long vowels after the first letter dropped): «بحار» and «بحر» → «بحر». */
function skeleton(word: string): string {
  const s = stemOf(word);
  return s ? s[0] + s.slice(1).replace(/[اوي]/g, '') : s;
}

/**
 * The consonants of the whole word (a leading «ا» dropped, long vowels and hamza after the first letter too):
 * «أشجار» / «شجرة», «طيور» / «طائر», «أوراق» / «ورق», «بيوت» / «بيت», «ألوان» / «لون» (broken plurals).
 */
function rootOf(word: string): string {
  let s = keyOfWord(word);
  if (s.endsWith('ه') && s.length >= 3) s = s.slice(0, -1);
  if (s.startsWith('ا') && s.length > 3) s = s.slice(1);
  return s ? s[0] + s.slice(1).replace(/[اويء]/g, '') : s;
}

/**
 * Is `clue` the board word itself or a form of it (with or without «ال», plural, feminine…), or does one contain
 * the other? Such a clue is never given. Rough on purpose: refusing a fine clue costs nothing.
 */
export function sameFamily(clue: string, word: string): boolean {
  return related(formsOf(clue), formsOf(word));
}

interface Forms {
  stem: string;
  skel: string;
  root: string;
}
const formsOf = (word: string): Forms => ({ stem: stemOf(word), skel: skeleton(word), root: rootOf(word) });
function related(x: Forms, y: Forms): boolean {
  const a = x.stem;
  const b = y.stem;
  if (a === b) return true;
  if ((b.length >= 3 && a.includes(b)) || (a.length >= 3 && b.includes(a))) return true;
  if (x.skel.length >= 3 && x.skel === y.skel) return true;
  // the same consonants: three of them, or two in short words («بيوت» / «بيت», «عيون» / «عين»)
  return x.root === y.root && (x.root.length >= 3 || (x.root.length === 2 && a.length <= 4 && b.length <= 4));
}
/** Forms that make two clue words one family for the risk: same stem, or same consonants after the first letter. */
function familyKeys(f: Forms): string[] {
  return [`s:${f.stem}`, f.skel.length >= 3 ? `k:${f.skel}` : ''].filter(Boolean);
}

/** A link from a clue to a board word: its strength, and whether it is a real target (a vague theme only warns). */
interface Link {
  w: number;
  target: boolean;
}
interface ClueInfo extends Forms {
  word: string;
  targets: Map<string, Link>;
  /** the board words this clue or one of its forms is linked to, even weakly: never an opponent's or the black word */
  risk: Set<string>;
}

/** Themes that make a fair clue on their own («حيوان 3»); the others («مكان», «مادة»…) only warn of a risk. */
const CLUE_THEMES = new Set(['حيوان', 'طائر', 'فاكهة', 'خضار', 'طعام', 'ملابس', 'مهنة', 'رياضة', 'نبات']);
/** a bird is also an animal, a fruit is also food… */
const THEME_PARENT: Record<string, string> = { طائر: 'حيوان', فاكهة: 'طعام', خضار: 'طعام' };
/**
 * Words never given as a clue (they still warn of a risk): the team colours and the black word's colour would be
 * confusing, and a family game has no need for war, weapons, blood, fear or crime.
 */
const NOT_A_CLUE = new Set(
  ['أحمر', 'أزرق', 'أسود', 'حرب', 'سلاح', 'دم', 'خوف', 'بندقية', 'رصاص', 'طلقة', 'معركة', 'قتال', 'عسكري', 'دبابة', 'بارود', 'انفجار', 'جريمة', 'هجوم', 'عدو', 'جنود', 'جيش', 'جندي', 'حصار', 'كمين', 'سرقة', 'سيف', 'رمح', 'مدفع']
    .map(keyOfWord),
);
/** Plain qualities: fair clues, but people link them to many more words than the lists say. */
const VAGUE = new Set(
  ['كبير', 'صغير', 'ضخم', 'طويل', 'قصير', 'قوي', 'سريع', 'بطيء', 'جميل', 'لذيذ', 'حلو', 'جديد', 'قديم', 'ثقيل', 'خفيف', 'لطيف', 'صعب', 'سهل', 'حار', 'بارد', 'ساخن', 'كثير', 'عالي', 'عميق', 'واسع']
    .map(stemOf),
);
/** A link's strength by its tier: strong, clear, fair. */
const TIER_W = [1, 0.85, 0.7];

/** every possible clue, by its spelling (normalised, without «ال») */
const CLUES = new Map<string, ClueInfo>();
/** board word → the clues linked to it */
const CLUES_OF = new Map<string, string[]>();

const keyOf = keyOfWord;

function link(clueWord: string, boardWord: string, w: number, target: boolean) {
  const key = keyOf(clueWord);
  let c = CLUES.get(key);
  if (!c) {
    c = { word: clueWord, targets: new Map(), ...formsOf(clueWord), risk: new Set() };
    CLUES.set(key, c);
  }
  const old = c.targets.get(boardWord);
  c.targets.set(boardWord, { w: Math.max(old?.w ?? 0, w), target: target || (old?.target ?? false) });
}

(function build() {
  const boardByKey = new Map(CODENAMES_ENTRIES.map((e) => [keyOf(e.word), e.word]));
  for (const e of CODENAMES_ENTRIES) {
    e.links.forEach((l, i) => {
      const w = TIER_W[e.tiers[i]] ?? 0.7;
      link(l, e.word, w, true);
      // the other way round: a board word of the big list, as a clue, makes people think of its own links
      const other = boardByKey.get(keyOf(l));
      if (other && other !== e.word) link(e.word, other, 0.8 * w, true);
    });
    if (e.tag) {
      link(e.tag, e.word, 0.5, CLUE_THEMES.has(e.tag));
      const parent = THEME_PARENT[e.tag];
      if (parent) link(parent, e.word, 0.45, CLUE_THEMES.has(parent));
    }
  }
  /** the clues of one family of forms (same stem or same consonants: «نجم» / «نجوم») */
  const family = new Map<string, string[]>();
  for (const [key, c] of CLUES) {
    for (const w of c.targets.keys()) {
      const list = CLUES_OF.get(w) ?? [];
      list.push(key);
      CLUES_OF.set(w, list);
    }
    for (const f of familyKeys(c)) {
      const list = family.get(f) ?? [];
      list.push(key);
      family.set(f, list);
    }
  }
  // a clue warns of every word its other forms are linked to: «نجم» is not safe if «نجوم» links an opponent word
  for (const c of CLUES.values()) {
    for (const f of familyKeys(c)) for (const k of family.get(f) ?? []) for (const w of CLUES.get(k)!.targets.keys()) c.risk.add(w);
  }
})();

/** How much a shared link says two board words are alike: a rare link much more than a common one. */
const LINK_WEIGHT = new Map<string, number>();
for (const [key, c] of CLUES) LINK_WEIGHT.set(key, 1 / Math.log2(2 + c.targets.size));
/** Each board word's links (normalised, with their weights) and theme, to tell how alike two board words are. */
const PROFILE = new Map(
  CODENAMES_ENTRIES.map((e) => {
    const links = new Map(e.links.map((l) => [keyOf(l), LINK_WEIGHT.get(keyOf(l)) ?? 0]));
    let total = 0;
    for (const v of links.values()) total += v;
    return [e.word, { links, total, tag: e.tag }];
  }),
);
/** clue spelling → the board word of the big list it is, if any */
const ENTRY_OF = new Map(CODENAMES_ENTRIES.map((e) => [keyOf(e.word), e.word]));

/**
 * How alike two board words are (0 … ~1): the weight of the links they share (rare links weigh more) over the
 * smaller of the two, a little more with the same theme. Nine random pairs in ten score under 0.1; «أسد» / «نمر»,
 * «بندير» / «دربوكة», «ملك» / «سلطان», «كنبة» / «أريكة» score 0.5 and more. A clue for one of two alike words makes people think of
 * the other too, even when the lists don't link it.
 */
export function alike(a: string, b: string): number {
  const x = PROFILE.get(a);
  const y = PROFILE.get(b);
  if (!x || !y) return 0;
  let common = 0;
  for (const [l, w] of x.links) if (y.links.has(l)) common += w;
  return common / Math.max(1e-9, Math.min(x.total, y.total)) + (x.tag && x.tag === y.tag ? 0.1 : 0);
}

/**
 * How clear a clue is. A word shared by a few dozen board words is a fine clue (the safety rules check the board
 * itself); one linked to a hundred or more, or a plain quality («كبير», «طويل»), makes people think of more words
 * than any list says.
 */
const specificity = (c: ClueInfo) => (VAGUE.has(c.stem) ? 0.6 : 1) / (1 + Math.max(0, c.targets.size - 40) / 300);

/** How strongly a clue word makes people think of a board word (0 = not at all). */
export function linkStrength(clue: string, word: string): number {
  return CLUES.get(keyOf(clue))?.targets.get(word)?.w ?? 0;
}

/** Is a clue word (or one of its forms) linked at all, even weakly, to a board word? */
export function linkedAtAll(clue: string, word: string): boolean {
  const c = CLUES.get(keyOf(clue)) ?? { risk: new Set<string>() };
  return c.risk.has(word);
}

/* ------------------------------------------------------------------ */
/* How related a clue is to a board word, the way a person sees it     */
/* ------------------------------------------------------------------ */

/**
 * A rough root, for words of one family that the form check misses: no «ال», no leading «م»/«ت» of a derived noun,
 * no leading «ا», no long vowels: «مطبخ» / «طباخ» / «طبخ» → «طبخ», «مكتب» / «كتاب» → «كتب», «ملعب» / «لعبة». A
 * derived noun also meets the three-letter word with a weak letter at its place: «مضيء» / «ضوء», «منار» / «نور».
 * Rough on purpose (it only ever makes a clue less safe): «مصباح» / «صباح» meet too.
 */
interface Rootish {
  /** the consonants (three at least), or '' */
  v: string;
  /** the letters with their weak ones («ا و ي») as one, for a derived noun or a three-letter word, or '' */
  w: string;
  derived: boolean;
}
function rootish(word: string): Rootish {
  let s = stemOf(word);
  const derived = s.length >= 4 && /^[مت]/.test(s);
  if (derived) s = s.slice(1);
  if (s.startsWith('ا') && s.length > 3) s = s.slice(1);
  const v = s ? s[0] + s.slice(1).replace(/[اويء]/g, '') : s;
  const w = s.length === 3 ? s.replace(/[اوي]/g, '*') : '';
  return { v: v.length >= 3 ? v : '', w, derived };
}
const sameRoot = (a: Rootish, b: Rootish) => (!!a.v && a.v === b.v) || (!!a.w && a.w === b.w && a.derived !== b.derived);

/** board word → the board words much like it (sharing rare links), with how alike they are: `alike` ≥ 0.3 */
const SIMILAR = new Map<string, [string, number][]>();
(function similar() {
  const byLink = new Map<string, string[]>();
  for (const [w, p] of PROFILE) {
    for (const l of p.links.keys()) {
      const list = byLink.get(l);
      if (list) list.push(w);
      else byLink.set(l, [w]);
    }
  }
  for (const [w, p] of PROFILE) {
    // the weight of the links shared with every other word (as in `alike`)
    const common = new Map<string, number>();
    for (const [l, lw] of p.links) for (const o of byLink.get(l)!) if (o !== w) common.set(o, (common.get(o) ?? 0) + lw);
    const list: [string, number][] = [];
    for (const [o, sum] of common) {
      const q = PROFILE.get(o)!;
      const a = sum / Math.max(1e-9, Math.min(p.total, q.total)) + (p.tag && p.tag === q.tag ? 0.1 : 0);
      if (a >= 0.3) list.push([o, a]);
    }
    SIMILAR.set(w, list);
  }
})();
/** each board word's forms, rough root and links (with their weights, as arrays), computed once */
const WORD_FORMS = new Map(
  CODENAMES_ENTRIES.map((e) => {
    const p = PROFILE.get(e.word)!;
    return [e.word, { forms: formsOf(e.word), root: rootish(e.word), key: keyOf(e.word), links: [...p.links.keys()], weights: [...p.links.values()] }];
  }),
);
const ROOT_OF_CLUE = new Map<string, Rootish>();

/**
 * The words a clue brings to mind besides its own board words: the links its board words share, by how many of
 * them share each one (a clue's own links too, when it is itself a board word). «كهرباء» → «ضوء، سلك، بطارية…».
 */
const NEIGHBOURHOOD = new Map<string, Map<string, number>>();
function neighbourhood(c: ClueInfo, key: string): Map<string, number> {
  let v = NEIGHBOURHOOD.get(key);
  if (v) return v;
  v = new Map();
  let total = 0;
  const add = (word: string, w: number) => {
    const p = PROFILE.get(word);
    if (!p) return;
    total += w;
    for (const l of p.links.keys()) v!.set(l, (v!.get(l) ?? 0) + w);
  };
  for (const [b, l] of c.targets) add(b, l.w);
  const own = ENTRY_OF.get(key);
  if (own) add(own, 1.5);
  for (const [l, s] of v) v.set(l, s / Math.max(1, total));
  v.delete(key);
  NEIGHBOURHOOD.set(key, v);
  return v;
}

/**
 * Categories people name a word by even when its own links don't: «حيوان» for an animal, «أكل» for a dish…
 * category word → the themes of codenames-links.ts it covers (and how sure: a tight theme more than a loose one).
 */
const CATEGORY: Record<string, string[]> = {
  حيوان: ['حيوان', 'طائر'], حيوانات: ['حيوان', 'طائر'], مخلوق: ['حيوان', 'طائر'], طائر: ['طائر'], طيور: ['طائر'],
  فاكهة: ['فاكهة'], فواكه: ['فاكهة'], ثمار: ['فاكهة'], خضار: ['خضار'], خضر: ['خضار'], خضروات: ['خضار'],
  طعام: ['طعام', 'فاكهة', 'خضار'], أكل: ['طعام', 'فاكهة', 'خضار'], غذاء: ['طعام', 'فاكهة', 'خضار'], وجبة: ['طعام'], مطبخ: ['طعام'],
  ملابس: ['ملابس'], لباس: ['ملابس'], ثياب: ['ملابس'], أزياء: ['ملابس'],
  مهنة: ['مهنة'], مهن: ['مهنة'], وظيفة: ['مهنة'], حرفة: ['مهنة'], شخص: ['مهنة'],
  نبات: ['نبات'], نباتات: ['نبات'], رياضة: ['رياضة'], لعبة: ['رياضة'], ألعاب: ['رياضة'],
  مواصلات: ['نقل'], نقل: ['نقل'], سفر: ['نقل'], مركبة: ['نقل'], جسم: ['جسم'],
  أداة: ['أداة'], أدوات: ['أداة'], آلة: ['أداة', 'تقنية'], جهاز: ['تقنية'], تقنية: ['تقنية'],
  طبيعة: ['طبيعة'], منزل: ['بيت'], بيت: ['بيت'], مكان: ['مكان'], مدينة: ['مكان'], مدرسة: ['مدرسة'],
  فن: ['فن'], موسيقى: ['فن'], حكاية: ['حكاية'], تاريخ: ['حكاية'], علم: ['علم'], مادة: ['مادة'],
};
/** themes so tight that naming the category points at each word clearly; the others («بيت»، «مكان»، «مهنة» with its kings and twins…) less */
const TIGHT_THEMES = new Set(['حيوان', 'طائر', 'فاكهة', 'خضار', 'ملابس', 'نبات']);
const CATEGORY_OF = new Map(Object.entries(CATEGORY).map(([k, v]) => [keyOf(k), v]));
/** theme → its words */
const THEME_WORDS = new Map<string, string[]>();
for (const e of CODENAMES_ENTRIES) if (e.tag) THEME_WORDS.set(e.tag, [...(THEME_WORDS.get(e.tag) ?? []), e.word]);
/** clue → theme → the share of a tight theme's words that list the clue: a clue most of the theme lists names it */
const THEME_SHARE = new Map<string, Map<string, number>>();
for (const [key, c] of CLUES) {
  const counts = new Map<string, number>();
  for (const [w, l] of c.targets) {
    const tag = PROFILE.get(w)?.tag;
    if (tag && TIGHT_THEMES.has(tag) && l.w >= 0.7) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  for (const [tag, n] of counts) {
    const share = n / (THEME_WORDS.get(tag)?.length ?? 1e9);
    if (share >= 0.5 && n >= 5) {
      const m = THEME_SHARE.get(key) ?? new Map<string, number>();
      m.set(tag, share);
      THEME_SHARE.set(key, m);
    }
  }
}

/**
 * Words people say together (`CODENAMES_PAIRS`): one of them makes them think of the other at once, whatever the
 * lists say. A clue strongly linked to one of them, or the word itself, points at the other too.
 */
/** word (its spelling key) → the spelling keys of the words it is paired with, and the words themselves */
const PAIRS = new Map<string, Set<string>>();
const PAIR_WORDS = new Map<string, string[]>();
for (const [a, b] of CODENAMES_PAIRS) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const s = PAIRS.get(keyOf(x)) ?? new Set<string>();
    s.add(keyOf(y));
    PAIRS.set(keyOf(x), s);
    PAIR_WORDS.set(keyOf(x), [...(PAIR_WORDS.get(keyOf(x)) ?? []), y]);
  }
}

/** The signals of `relatedness`, each 0 … 1, to explain a score. */
export interface Relatedness {
  /** linked in the lists, either way, or through one of the clue's forms */
  direct: number;
  /** a form of the board word, or the same rough root («مطبخ» / «طباخ») */
  form: number;
  /** the clue's board words and this word share their links («كهرباء» … «مصباح»: «ضوء، سلك») */
  hop: number;
  /** a word much like the clue's board words, or like the clue itself when it is a board word */
  like: number;
  /** the clue names the word's category («حيوان» → «زرافة») */
  category: number;
  /** the word is paired with the clue, or with a word the clue points at strongly («ملعقة» → «شوكة») */
  pair: number;
  /** all together */
  score: number;
}

/**
 * How much a person hearing `clue` may think of the board word `word`: 0 … 1. Broader than the links the bot
 * aims with: on top of the lists themselves (either way, and through the clue's forms), the word's form or
 * root, links shared with the clue's own board words (two hops), words much like those, the category the clue
 * names, and words people say together. Used for the danger checks: the black word, the opponents' and the
 * neutral words.
 */
export function relatedness(clue: string, word: string): number {
  return relatednessParts(clue, word).score;
}

export function relatednessParts(clue: string, word: string): Relatedness {
  const key = keyOf(clue);
  return partsOf(key, clue, CLUES.get(key), word);
}

/** `relatednessParts` for a clue already looked up (its spelling key and its links, if any) */
function partsOf(key: string, clue: string, c: ClueInfo | undefined, word: string): Relatedness {
  const p = PROFILE.get(word);
  // the lists, either way, and through one of the clue's forms (weakly)
  let direct = c?.targets.get(word)?.w ?? 0;
  if (!direct && c?.risk.has(word)) direct = 0.5;
  // a form of the word, or the same rough root
  const wf = WORD_FORMS.get(word) ?? { forms: formsOf(word), root: rootish(word), key: keyOf(word), links: [], weights: [] };
  let rc = ROOT_OF_CLUE.get(key);
  if (rc === undefined) {
    rc = rootish(clue);
    ROOT_OF_CLUE.set(key, rc);
  }
  const form = related(c ?? formsOf(clue), wf.forms) ? 1 : sameRoot(rc, wf.root) ? 0.8 : 0;
  // two hops: the share of the word's links (rare ones weigh more) the clue's own board words share too
  let hop = 0;
  let like = 0;
  if (c && p) {
    const v = neighbourhood(c, key);
    let shared = 0;
    for (let i = 0; i < wf.links.length; i++) shared += (v.get(wf.links[i]) ?? 0) * wf.weights[i];
    hop = Math.min(1, (2.5 * shared) / Math.max(1e-9, p.total));
    // a word much like the ones the clue points at: of the words most like it, how many the clue points at
    let all = 0;
    let pointed = 0;
    let top = 0;
    for (const [o, a] of SIMILAR.get(word) ?? []) {
      all += a;
      const l = c.targets.get(o);
      if (!l?.target) continue;
      pointed += a * l.w;
      top = Math.max(top, l.w * Math.min(1, 1.2 * a));
    }
    if (all) like = top * Math.sqrt(pointed / all);
  }
  // a clue that is itself a board word: a word much like it («صيف» / «ربيع», «قبعة» / «عمامة»)
  const asWord = ENTRY_OF.get(key);
  if (asWord && asWord !== word) {
    const a = alike(asWord, word);
    if (a >= 0.15) like = Math.max(like, Math.min(1, 1.6 * a));
  }
  // the category the clue names
  let category = 0;
  if (p?.tag) {
    const named = CATEGORY_OF.get(key);
    if (named?.includes(p.tag)) category = TIGHT_THEMES.has(p.tag) ? 0.75 : 0.35;
    const share = THEME_SHARE.get(key)?.get(p.tag) ?? 0;
    if (share) category = Math.max(category, Math.min(0.65, share));
  }
  // words said together: the clue itself, or a word it points at strongly
  let pair = PAIRS.get(key)?.has(wf.key) ? 0.9 : 0;
  for (const x of PAIR_WORDS.get(wf.key) ?? []) {
    const l = c?.targets.get(x);
    if (l?.target && l.w >= 1) pair = Math.max(pair, 0.3);
  }
  // the strongest signal, a little more when another one agrees
  let first = 0;
  let second = 0;
  for (const x of [direct, form, hop, like, category, pair]) {
    if (x > first) [first, second] = [x, first];
    else if (x > second) second = x;
  }
  const score = Math.min(1, first + 0.25 * second);
  return { direct, form, hop, like, category, pair, score };
}

/** What the spymaster sees. */
export interface CodenamesBoard {
  words: string[];
  key: CodeColor[];
  revealed: boolean[];
}
export interface BotClue {
  word: string;
  n: number;
  /** the team's words the clue is meant for */
  targets: string[];
  /** no clue met every rule: the safest one left (never linked nor much related to an opponent's or the black word) */
  fallback?: true;
}

interface Plan {
  /** most words one clue may aim at */
  maxN: number;
  /** a link must be stronger than this to be worth aiming at: the higher, the fewer words per clue */
  bar: number;
  /** a clue aiming at 2+ words needs every link at least this strong */
  minLink: number;
  /** a third word needs a link at least this strong, and the clue to be at least this specific */
  minThird: number;
  minThirdSpec: number;
  /**
   * neutral words: «never» = no link and nothing clearly related; «weak» = only one the clue is much less related
   * to than to its targets; «behind» = the same, with a smaller margin (an expert behind in the race)
   */
  neutral: 'never' | 'weak' | 'behind';
  /** how much a clue that keeps pairs of words for later turns is worth */
  ahead: number;
}

function planFor(level: BotLevel, behind: boolean, rand: () => number): Plan {
  if (level === 'easy') return { maxN: rand() < 0.45 ? 2 : 1, bar: 0.5, minLink: 0.85, minThird: 2, minThirdSpec: 1, neutral: 'never', ahead: 0 };
  if (level === 'smart') return { maxN: 2, bar: 0.4, minLink: 0.7, minThird: 2, minThirdSpec: 1, neutral: 'never', ahead: 0.5 };
  return { maxN: 3, bar: 0.3, minLink: 0.7, minThird: 0.7, minThirdSpec: 0.4, neutral: behind ? 'behind' : 'weak', ahead: 0.5 };
}

/**
 * How related (`relatedness`) a clue may be to the words it must not point at. The black word: hardly at all.
 * An opponent's word: a little, and well below the clue's weakest target. A neutral word: never clearly for easy
 * and smart bots; an expert accepts only a weak one, well below its targets.
 */
export const SAFETY = {
  /** the black word: never this related */
  assassin: 0.3,
  /** an opponent's word: never this related… */
  opponent: 0.4,
  /** …and always this much less than the weakest target */
  opponentGap: 0.3,
  /** a neutral word, for easy and smart bots: never this related */
  neutral: 0.4,
  /** an expert: a neutral word at most this related, and this much less than the weakest target (behind: less) */
  neutralExpert: 0.5,
  neutralGap: 0.25,
  neutralGapBehind: 0.15,
} as const;

/** One clue the spymaster may give: how good it is, and the team's words it is meant for. */
interface Option {
  score: number;
  clue: BotClue;
}

/** The size of the largest set of disjoint pairs in a small graph (bit masks of neighbours). */
function matching(nodes: number, adj: number[]): number {
  const memo = new Map<number, number>();
  const go = (left: number): number => {
    if (!left) return 0;
    const hit = memo.get(left);
    if (hit !== undefined) return hit;
    const i = 31 - Math.clz32(left);
    const rest = left & ~(1 << i);
    let best = go(rest);
    for (let m = adj[i] & rest; m; m &= m - 1) best = Math.max(best, 1 + go(rest & ~(m & -m)));
    memo.set(left, best);
    return best;
  };
  return go(nodes);
}

/**
 * The clue a bot spymaster of `team` gives now. `used` = the clues already given this game (by both teams): none
 * of them, nor a form of one, comes back. Never a board word or a form of one, never a clue linked to an
 * opponent's word or to the black word, nor one a person would relate to them (`relatedness`, `SAFETY`).
 */
export function chooseClue(board: CodenamesBoard, team: Team, level: BotLevel, used: string[] = [], rand: () => number = Math.random): BotClue {
  const open = (color: CodeColor) => board.words.filter((_, i) => !board.revealed[i] && board.key[i] === color);
  const opponent: Team = team === 'red' ? 'blue' : 'red';
  const mine = open(team);
  const assassin = open('assassin');
  const opponents = open(opponent);
  const danger = [...opponents, ...assassin];
  const neutral = open('neutral');
  const plan = planFor(level, mine.length > opponents.length, rand);
  const taken = [...board.words, ...used].map(formsOf);
  const legal = (word: string, f: Forms = formsOf(word)) => !/\s/.test(word) && !taken.some((t) => related(f, t));
  // aiming at a word much like an opponent's word (or the black word) is risky: people may pick the other one
  const lookalike = new Map(
    mine.map((m) => {
      let risk = 0;
      for (const d of danger) risk = Math.max(risk, (assassin.includes(d) ? 2 : 1) * Math.max(0, alike(m, d) - 0.3));
      return [m, risk];
    }),
  );
  const bit = new Map(mine.map((m, i) => [m, i]));
  /** the team's words that can share a clue, as bit masks: to keep pairs for later turns */
  const adj = mine.map(() => 0);
  /** how related a clue is to a board word (computed once per decision) */
  const memo = new Map<string, number>();
  const rel = (key: string, c: ClueInfo, word: string) => {
    const k = `${key}|${word}`;
    let r = memo.get(k);
    if (r === undefined) {
      r = partsOf(key, c.word, c, word).score;
      memo.set(k, r);
    }
    return r;
  };
  /** the most related of `words` to the clue (stops as soon as one reaches `limit`) */
  const maxOf = (key: string, c: ClueInfo, words: string[], limit: number) => {
    let m = 0;
    for (const w of words) {
      m = Math.max(m, rel(key, c, w));
      if (m >= limit) break;
    }
    return m;
  };

  const options: Option[] = [];
  /** every clue for the team's words: at first only those with a clear link (quicker), all of them if none fits */
  const consider = (minTop: number) => {
    const seen = new Set<string>();
    for (const w of mine) {
      for (const key of CLUES_OF.get(w) ?? []) {
        if (seen.has(key)) continue;
        seen.add(key);
        const c = CLUES.get(key)!;
        if (NOT_A_CLUE.has(key) || danger.some((d) => c.risk.has(d)) || !legal(c.word, c)) continue;
        if (plan.neutral === 'never' && neutral.some((n) => c.risk.has(n))) continue;
        const aims = mine
          .map((m) => ({ m, l: c.targets.get(m) }))
          // never aim at a word much like the black word (or very much like an opponent's word)
          .filter((x): x is { m: string; l: Link } => !!x.l?.target && (lookalike.get(x.m) ?? 0) < 0.4)
          .sort((p, q) => q.l.w - p.l.w);
        if (!aims.length || aims[0].l.w < minTop) continue;
        // a clue that is itself a word much like an opponent's word (or the black word) points at it too
        const asWord = ENTRY_OF.get(key);
        if (asWord && danger.some((d) => alike(asWord, d) >= 0.4)) continue;
        // what a person may relate the clue to, beyond the lists: the black word hardly at all, an opponent's
        // word only a little, a neutral word (easy, smart) never clearly, (expert) only weakly
        const assassinR = maxOf(key, c, assassin, SAFETY.assassin);
        if (assassinR >= SAFETY.assassin) continue;
        const opponentR = maxOf(key, c, opponents, SAFETY.opponent);
        if (opponentR >= SAFETY.opponent) continue;
        let neutralR = 0;
        let neutralSum = 0;
        for (const n of neutral) {
          const r = rel(key, c, n);
          neutralR = Math.max(neutralR, r);
          if (r >= 0.2) neutralSum += r;
        }
        if (neutralR >= (plan.neutral === 'never' ? SAFETY.neutral : SAFETY.neutralExpert)) continue;
        const neutralGap = plan.neutral === 'behind' ? SAFETY.neutralGapBehind : SAFETY.neutralGap;
        const spec = specificity(c);
        // the pairs of words this clue could aim at together (only one of them, once)
        const pairable = aims.filter((x) => x.l.w >= plan.minLink).map((x) => bit.get(x.m)!);
        for (const a of pairable) for (const b of pairable) if (a !== b) adj[a] |= 1 << b;
        // the words that are not the team's, the most related one
        const otherR = Math.max(assassinR, opponentR, neutralR);
        let sum = 0;
        let lookalikes = 0;
        let weakestR = Infinity;
        for (let n = 1; n <= Math.min(plan.maxN, aims.length); n++) {
          const weakest = aims[n - 1].l.w;
          if (n > 1 && weakest < plan.minLink) break;
          // a three-word clue must be a clear one: strong links and a fairly specific word
          if (n === 3 && (weakest < plan.minThird || spec < plan.minThirdSpec)) break;
          // guessable: every target comes well before the black word, an opponent's word and a neutral word
          weakestR = Math.min(weakestR, rel(key, c, aims[n - 1].m));
          if (weakestR - assassinR < 0.45 || weakestR - opponentR < SAFETY.opponentGap || weakestR - neutralR < neutralGap) break;
          sum += weakest - plan.bar;
          lookalikes = Math.max(lookalikes, lookalike.get(aims[n - 1].m) ?? 0);
          // the closer the nearest other word, the riskier; a neutral word the clue is related to costs a little
          const penalty = 0.5 * Math.max(0, otherR - 0.15) + 0.3 * neutralSum;
          const score = sum * spec - penalty - 1.5 * lookalikes + rand() * 0.05;
          options.push({ score, clue: { word: c.word, n, targets: aims.slice(0, n).map((x) => x.m) } });
        }
      }
    }
  };
  consider(0.7);
  if (!options.length) consider(0);
  // plan ahead (smart and expert): prefer the clue that leaves the most pairs of words still able to share a
  // clue later, so the awkward words are used up first and the easy pairs kept for the next turns
  const all = (1 << mine.length) - 1;
  let best: Option | null = null;
  for (const o of options) {
    let left = all;
    for (const t of o.clue.targets) left &= ~(1 << bit.get(t)!);
    // the words this clue saves (n − 1) and the ones later pairs may still save
    const score = o.score + (plan.ahead ? plan.ahead * (o.clue.n - 1 + matching(left, adj)) : 0);
    if (!best || score > best.score) best = { score, clue: o.clue };
  }
  if (best && best.score > -5) return best.clue;
  return fallback(mine, assassin, opponents, neutral, legal, rel) ?? best?.clue ?? { word: 'تلميح', n: 1, targets: mine.slice(0, 1), fallback: true };
}

/**
 * A clue for one word, when no clue above qualifies (late in a game, most links given or taken): one of its
 * links never linked to an opponent's word nor the black word and related to them only a little (as always), the
 * one that points at the word most clearly ahead of every other word, neutral words included. When every link is
 * too close to an opponent's word (the team's last word next to its synonym: «كهف» / «مغارة»), the link that
 * still points at it first (never one linked to that word, nor one close to the black word).
 */
function fallback(
  mine: string[],
  assassin: string[],
  opponents: string[],
  neutral: string[],
  legal: (w: string) => boolean,
  rel: (key: string, c: ClueInfo, word: string) => number,
): BotClue | null {
  let best: BotClue | null = null;
  let bestScore = 0;
  // when even that fails: the link that points at the word most clearly ahead of the opponents' words
  let last: BotClue | null = null;
  let lastScore = 0;
  for (const w of mine) {
    for (const l of CODENAMES_ENTRIES.find((x) => x.word === w)?.links ?? []) {
      const key = keyOf(l);
      const c = CLUES.get(key);
      if (!c || !legal(l) || NOT_A_CLUE.has(key) || [...opponents, ...assassin].some((d) => c.risk.has(d))) continue;
      if (assassin.some((d) => rel(key, c, d) >= SAFETY.assassin)) continue;
      const r = rel(key, c, w);
      const opponentR = opponents.reduce((m, d) => Math.max(m, rel(key, c, d)), 0);
      const score = r - neutral.reduce((m, n) => Math.max(m, rel(key, c, n)), opponentR);
      if (score > lastScore) {
        last = { word: l, n: 1, targets: [w], fallback: true };
        lastScore = score;
      }
      if (opponentR >= SAFETY.opponent || opponentR > r - SAFETY.opponentGap) continue;
      if (score > bestScore) {
        best = { word: l, n: 1, targets: [w], fallback: true };
        bestScore = score;
      }
    }
  }
  return best ?? last;
}
