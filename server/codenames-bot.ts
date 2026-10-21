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
 */
import { norm } from '../src/shared/arabic';
import type { BotLevel, CodeColor } from '../src/shared/protocol';
import { CODENAMES_ENTRIES } from './codenames-links';

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
  /** neutral words: never; only one the clue points at much less than at its targets; or any (a small risk) */
  neutral: 'never' | 'weak' | 'any';
  /** how much a clue that keeps pairs of words for later turns is worth */
  ahead: number;
}

function planFor(level: BotLevel, behind: boolean, rand: () => number): Plan {
  if (level === 'easy') return { maxN: rand() < 0.45 ? 2 : 1, bar: 0.5, minLink: 0.85, minThird: 2, minThirdSpec: 1, neutral: 'never', ahead: 0 };
  if (level === 'smart') return { maxN: 2, bar: 0.4, minLink: 0.7, minThird: 2, minThirdSpec: 1, neutral: 'never', ahead: 0.5 };
  return { maxN: 3, bar: 0.3, minLink: 0.7, minThird: 0.7, minThirdSpec: 0.4, neutral: behind ? 'any' : 'weak', ahead: 0.5 };
}

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
 * opponent's word or to the black word.
 */
export function chooseClue(board: CodenamesBoard, team: Team, level: BotLevel, used: string[] = [], rand: () => number = Math.random): BotClue {
  const open = (color: CodeColor) => board.words.filter((_, i) => !board.revealed[i] && board.key[i] === color);
  const opponent: Team = team === 'red' ? 'blue' : 'red';
  const mine = open(team);
  const assassin = open('assassin');
  const danger = [...open(opponent), ...assassin];
  const neutral = open('neutral');
  const plan = planFor(level, mine.length > open(opponent).length, rand);
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

  const options: Option[] = [];
  const seen = new Set<string>();
  for (const w of mine) {
    for (const key of CLUES_OF.get(w) ?? []) {
      if (seen.has(key)) continue;
      seen.add(key);
      const c = CLUES.get(key)!;
      if (NOT_A_CLUE.has(key) || danger.some((d) => c.risk.has(d)) || !legal(c.word, c)) continue;
      // a clue that is itself a word much like an opponent's word (or the black word) points at it too
      const asWord = ENTRY_OF.get(key);
      if (asWord && danger.some((d) => alike(asWord, d) >= 0.4)) continue;
      const aims = mine
        .map((m) => ({ m, l: c.targets.get(m) }))
        // never aim at a word much like the black word (or very much like an opponent's word)
        .filter((x): x is { m: string; l: Link } => !!x.l?.target && (lookalike.get(x.m) ?? 0) < 0.4)
        .sort((p, q) => q.l.w - p.l.w);
      if (!aims.length) continue;
      // the neutral words the clue makes people think of, and how strongly (a link through a form only: weakly)
      let neutralTop = 0;
      let neutralSum = 0;
      for (const n of neutral) {
        if (!c.risk.has(n)) continue;
        const s = c.targets.get(n)?.w ?? 0.5;
        neutralTop = Math.max(neutralTop, s);
        neutralSum += s;
      }
      if (neutralTop > 0 && plan.neutral === 'never') continue;
      const spec = specificity(c);
      // the pairs of words this clue could aim at together (only one of them, once)
      const pairable = aims.filter((x) => x.l.w >= plan.minLink).map((x) => bit.get(x.m)!);
      for (const a of pairable) for (const b of pairable) if (a !== b) adj[a] |= 1 << b;
      let sum = 0;
      let lookalikes = 0;
      for (let n = 1; n <= Math.min(plan.maxN, aims.length); n++) {
        const weakest = aims[n - 1].l.w;
        if (n > 1 && weakest < plan.minLink) break;
        // a three-word clue must be a clear one: strong links and a fairly specific word
        if (n === 3 && (weakest < plan.minThird || spec < plan.minThirdSpec)) break;
        // guessable: every target must come before any neutral word the clue points at
        if (neutralTop > 0 && plan.neutral === 'weak' && neutralTop > weakest - 0.25) break;
        sum += weakest - plan.bar;
        lookalikes = Math.max(lookalikes, lookalike.get(aims[n - 1].m) ?? 0);
        const penalty = neutralTop === 0 ? 0 : (neutralTop >= weakest ? 0.6 : 0.25) * neutralSum;
        const score = sum * spec - penalty - 1.5 * lookalikes + rand() * 0.05;
        options.push({ score, clue: { word: c.word, n, targets: aims.slice(0, n).map((x) => x.m) } });
      }
    }
  }
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
  return fallback(board, mine, danger, legal) ?? best?.clue ?? { word: 'تلميح', n: 1, targets: mine.slice(0, 1) };
}

/** A safe clue for one word: its strongest link that no other open word shares. */
function fallback(board: CodenamesBoard, mine: string[], danger: string[], legal: (w: string) => boolean): BotClue | null {
  const others = board.words.filter((w, i) => !board.revealed[i] && !mine.includes(w));
  for (const strict of [true, false]) {
    for (const w of mine) {
      const e = CODENAMES_ENTRIES.find((x) => x.word === w);
      for (const l of e?.links ?? []) {
        if (!legal(l) || NOT_A_CLUE.has(keyOf(l))) continue;
        const c = CLUES.get(keyOf(l));
        const bad = strict ? others : danger;
        if (c && bad.some((d) => c.risk.has(d))) continue;
        return { word: l, n: 1, targets: [w] };
      }
    }
  }
  return null;
}
