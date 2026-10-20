/**
 * «الكلمات السرية»: the spymaster bot. A bot is only ever a team's spymaster: it never guesses.
 *
 * Every board word lists the everyday words a family links to it (codenames-links.ts). A clue is one of those link
 * words: it "targets" the team's unrevealed words that list it (or that it lists, when the clue is itself a board
 * word of the big list, or that share its theme). A clue linked to an opponent word or to the black word is never
 * given; a link to a neutral word is avoided (an expert behind in the race may take that small risk). The number
 * is how many of the team's words the clue targets. Strong, specific links are preferred over vague ones: a word
 * linked to dozens of board words in the whole list («كبير», «أبيض») says little.
 */
import { norm, stripAl } from '../src/shared/arabic';
import type { BotLevel, CodeColor } from '../src/shared/protocol';
import { CODENAMES_ENTRIES } from './codenames-links';

type Team = 'red' | 'blue';

/** A word reduced to compare forms: no «ال», hamza shapes, final ة, the common plural endings. */
export function stemOf(word: string): string {
  let s = stripAl(norm(word)).replace(/\s/g, '');
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
 * Is `clue` the board word itself or a form of it (with or without «ال», plural, feminine…), or does one contain
 * the other? Such a clue is never given. Rough on purpose: refusing a fine clue costs nothing.
 */
export function sameFamily(clue: string, word: string): boolean {
  return related(formsOf(clue), formsOf(word));
}

interface Forms {
  stem: string;
  skel: string;
}
const formsOf = (word: string): Forms => ({ stem: stemOf(word), skel: skeleton(word) });
function related(x: Forms, y: Forms): boolean {
  const a = x.stem;
  const b = y.stem;
  if (a === b) return true;
  if ((b.length >= 3 && a.includes(b)) || (a.length >= 3 && b.includes(a))) return true;
  return x.skel.length >= 3 && x.skel === y.skel;
}

/** A link from a clue to a board word: its strength, and whether it is a real target (a vague theme only warns). */
interface Link {
  w: number;
  target: boolean;
}
interface ClueInfo {
  word: string;
  targets: Map<string, Link>;
  stem: string;
  skel: string;
  /** the board words this clue or one of its forms is linked to, even weakly: never an opponent's or the black word */
  risk: Set<string>;
}

/** Themes that make a fair clue on their own («حيوان 3»); the others («مكان», «مادة»…) only warn of a risk. */
const CLUE_THEMES = new Set(['حيوان', 'طائر', 'فاكهة', 'خضار', 'طعام', 'ملابس', 'مهنة', 'رياضة', 'نبات']);
/** a bird is also an animal, a fruit is also food… */
const THEME_PARENT: Record<string, string> = { طائر: 'حيوان', فاكهة: 'طعام', خضار: 'طعام' };
/**
 * Words never given as a clue (they still warn of a risk): the team colours and the black word's colour would be
 * confusing, and a family game has no need for war and blood.
 */
const NOT_A_CLUE = new Set(['أحمر', 'أزرق', 'أسود', 'حرب', 'سلاح', 'دم', 'خوف'].map((w) => stripAl(norm(w))));
/** Plain qualities: fair clues, but people link them to many more words than the lists say. */
const VAGUE = new Set(
  ['كبير', 'صغير', 'ضخم', 'طويل', 'قصير', 'قوي', 'سريع', 'بطيء', 'جميل', 'لذيذ', 'حلو', 'جديد', 'قديم', 'ثقيل', 'خفيف', 'لطيف', 'صعب', 'سهل', 'حار', 'بارد', 'ساخن', 'كثير', 'عالي', 'عميق', 'واسع']
    .map(stemOf),
);
/** A board word's own links, the first ones strongest. */
const strength = (i: number) => (i < 4 ? 1 : i < 8 ? 0.85 : 0.7);

/** every possible clue, by its spelling (normalised, without «ال») */
const CLUES = new Map<string, ClueInfo>();
/** board word → the clues linked to it */
const CLUES_OF = new Map<string, string[]>();
/** the clues of one family of forms (same stem or same consonants: «نجم» / «نجوم»), by stem and by consonants */
const FAMILY = new Map<string, string[]>();

const keyOf = (word: string) => stripAl(norm(word)).replace(/\s/g, '');

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
      link(l, e.word, strength(i), true);
      // the other way round: a board word of the big list, as a clue, makes people think of its own links
      const other = boardByKey.get(keyOf(l));
      if (other && other !== e.word) link(e.word, other, 0.8 * strength(i), true);
    });
    if (e.tag) {
      link(e.tag, e.word, 0.5, CLUE_THEMES.has(e.tag));
      const parent = THEME_PARENT[e.tag];
      if (parent) link(parent, e.word, 0.45, CLUE_THEMES.has(parent));
    }
  }
  for (const [key, c] of CLUES) {
    for (const w of c.targets.keys()) {
      const list = CLUES_OF.get(w) ?? [];
      list.push(key);
      CLUES_OF.set(w, list);
    }
    for (const f of new Set([`s:${c.stem}`, c.skel.length >= 3 ? `k:${c.skel}` : ''])) {
      if (!f) continue;
      const list = FAMILY.get(f) ?? [];
      list.push(key);
      FAMILY.set(f, list);
    }
  }
  // a clue warns of every word its other forms are linked to: «نجم» is not safe if «نجوم» links an opponent word
  for (const c of CLUES.values()) {
    for (const f of [`s:${c.stem}`, `k:${c.skel}`]) for (const k of FAMILY.get(f) ?? []) for (const w of CLUES.get(k)!.targets.keys()) c.risk.add(w);
  }
})();

/** Each board word's links (normalised) and theme, to tell how alike two board words are. */
const PROFILE = new Map(CODENAMES_ENTRIES.map((e) => [e.word, { links: new Set(e.links.map(keyOf)), tag: e.tag }]));
/** clue spelling → the board word of the big list it is, if any */
const ENTRY_OF = new Map(CODENAMES_ENTRIES.map((e) => [keyOf(e.word), e.word]));

/**
 * How alike two board words are (0 … ~1): the share of links they have in common, a little more with the same
 * theme. Unrelated words score under 0.2; «أسد» / «نمر», «بندير» / «دربوكة», «ملك» / «سلطان» score 0.6 and more.
 * A clue for one of two alike words makes people think of the other too, even when the lists don't link it.
 */
export function alike(a: string, b: string): number {
  const x = PROFILE.get(a);
  const y = PROFILE.get(b);
  if (!x || !y) return 0;
  let common = 0;
  for (const l of x.links) if (y.links.has(l)) common++;
  return common / Math.max(1, Math.min(x.links.size, y.links.size)) + (x.tag && x.tag === y.tag ? 0.1 : 0);
}

/** How specific a clue is: linked to few board words of the whole list = a clear clue; to many = vague. */
const specificity = (c: ClueInfo) => (VAGUE.has(c.stem) ? 0.6 : 1) / (1 + c.targets.size / 30);

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
  level: BotLevel;
  /** most words one clue may aim at */
  maxN: number;
  /** a clue aiming at 2+ words needs every link at least this strong */
  minLink: number;
  /** may risk a neutral word */
  neutralOk: boolean;
}

function planFor(level: BotLevel, behind: boolean, rand: () => number): Plan {
  if (level === 'easy') return { level, maxN: rand() < 0.35 ? 2 : 1, minLink: 0.85, neutralOk: false };
  if (level === 'smart') return { level, maxN: 2, minLink: 0.7, neutralOk: false };
  return { level, maxN: 3, minLink: 0.7, neutralOk: behind };
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
  const danger = [...open(opponent), ...open('assassin')];
  const neutral = open('neutral');
  const plan = planFor(level, mine.length > open(opponent).length, rand);
  const taken = [...board.words, ...used].map(formsOf);
  const legal = (word: string, f: Forms = formsOf(word)) => !/\s/.test(word) && !taken.some((t) => related(f, t));
  const assassin = open('assassin');
  // aiming at a word much like an opponent's word (or the black word) is risky: people may pick the other one
  const lookalike = new Map(
    mine.map((m) => {
      let risk = 0;
      for (const d of danger) risk = Math.max(risk, (assassin.includes(d) ? 2 : 1) * Math.max(0, alike(m, d) - 0.3));
      return [m, risk];
    }),
  );

  let best: { score: number; clue: BotClue } | null = null;
  const seen = new Set<string>();
  for (const w of mine) {
    for (const key of CLUES_OF.get(w) ?? []) {
      if (seen.has(key)) continue;
      seen.add(key);
      const c = CLUES.get(key)!;
      if (NOT_A_CLUE.has(key) || danger.some((d) => c.risk.has(d)) || !legal(c.word, c)) continue;
      // a clue that is itself a word much like an opponent's word (or the black word) points at it too
      const asWord = ENTRY_OF.get(key);
      if (asWord && danger.some((d) => alike(asWord, d) >= 0.35)) continue;
      const aims = mine
        .map((m) => ({ m, l: c.targets.get(m) }))
        // never aim at a word much like the black word (or very much like an opponent's word)
        .filter((x): x is { m: string; l: Link } => !!x.l?.target && (lookalike.get(x.m) ?? 0) < 0.4)
        .sort((p, q) => q.l.w - p.l.w);
      if (!aims.length) continue;
      const risky = neutral.filter((n) => c.risk.has(n));
      // a neutral link: a small cost for an expert behind in the race, otherwise only as a last resort
      const penalty = risky.length === 0 ? 0 : plan.neutralOk ? 0.45 * risky.reduce((sum, n) => sum + (c.targets.get(n)?.w ?? 0.5), 0) : 10;
      const spec = specificity(c);
      let sum = 0;
      let lookalikes = 0;
      for (let n = 1; n <= Math.min(plan.maxN, aims.length); n++) {
        const weakest = aims[n - 1].l.w;
        if (n > 1 && weakest < plan.minLink) break;
        // a three-word clue must be a clear one: strong links, or a specific word
        if (n === 3 && !(weakest >= 0.85 && spec >= 0.35) && !(spec >= 0.5)) break;
        sum += weakest;
        lookalikes = Math.max(lookalikes, lookalike.get(aims[n - 1].m) ?? 0);
        const score = (sum + (n - 1) * 0.45) * spec - penalty - 2.5 * lookalikes + rand() * 0.04;
        if (!best || score > best.score) best = { score, clue: { word: c.word, n, targets: aims.slice(0, n).map((x) => x.m) } };
      }
    }
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
