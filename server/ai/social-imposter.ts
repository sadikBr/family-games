/**
 * «الدخيل» bots that read the clues. Everything here uses only what a bot's own phone shows: its role (and
 * the word, for a civilian), the category when it is public (a fixed category, or the imposter's hint), and
 * the clues the other bots put on screen. People say their clues out loud, so a bot can't weigh those.
 *
 * The model: a civilian says one of the word's traits (see imposter-traits.ts), an imposter one that fits
 * many words. So for a clue `t`:
 *   P(t | civilian with word w) — 1/|pool(w)| when t is in w's clue pool, a little when t is merely one of
 *   w's traits, almost nothing otherwise;
 *   P(t | imposter) — half "a common trait", half "mimics a random word of the category".
 * Civilian bots vote by the likelihood ratio; the caught imposter guesses the option that best explains the
 * civilians' clues; clues are chosen to prove knowledge without narrowing the word down to fewer than three.
 */
import { IMPOSTER_HINTS } from '../bot-content';
import { IMPOSTER_CATEGORIES, type WordCategory } from '../content';
import { TRAITS, traitCounts, traitPool } from '../imposter-traits';

const EPS = 0.004;

const traitCache = new Map<string, string[]>();
const traitsOf = (cat: WordCategory, w: string): string[] => {
  const k = `${cat.key}|${w}`;
  let t = traitCache.get(k);
  if (!t) traitCache.set(k, (t = TRAITS[cat.key]?.[w]?.split('|') ?? []));
  return t;
};

const countCache = new Map<string, Map<string, number>>();
/** How many words of the category have each trait (cached: the tables are fixed). */
function counts(cat: WordCategory): Map<string, number> {
  let m = countCache.get(cat.key);
  if (!m) countCache.set(cat.key, (m = traitCounts(cat)));
  return m;
}

const poolCache = new Map<string, string[]>();
/** What a civilian bot holding `w` might say (the same pools the bots use), never empty. */
export function civilianPool(cat: WordCategory, w: string): string[] {
  const k = `${cat.key}|${w}`;
  let pool = poolCache.get(k);
  if (!pool) {
    const p = traitPool(cat, w, false);
    poolCache.set(k, (pool = p.length ? p : (IMPOSTER_HINTS[w] ?? [])));
  }
  return pool;
}

/** P(clue | a civilian whose word is w). */
export function pCivilian(cat: WordCategory, w: string, clue: string): number {
  const pool = civilianPool(cat, w);
  if (pool.includes(clue)) return 1 / pool.length;
  const own = traitsOf(cat, w);
  if (own.includes(clue)) return 0.25 / own.length;
  return EPS;
}

const impCache = new Map<string, Map<string, number>>();
/** P(clue | an imposter) in this category. */
export function pImposter(cat: WordCategory, clue: string): number {
  let m = impCache.get(cat.key);
  if (!m) {
    m = new Map();
    const common = traitPool(cat, '', true); // once per category (cached below)
    for (const t of common) m.set(t, (m.get(t) ?? 0) + 0.5 / common.length);
    for (const w of cat.words) for (const t of civilianPool(cat, w)) m.set(t, (m.get(t) ?? 0) + 0.5 / cat.words.length / civilianPool(cat, w).length);
    impCache.set(cat.key, m);
  }
  return Math.max(EPS, m.get(clue) ?? 0);
}

/** Small deterministic hash: bots on the same side break ties the same way, so their votes add up. */
export function tieHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Words of the category that fit every one of `clues` as a trait (or a fallback hint). */
function consistent(cat: WordCategory, clues: string[]): string[] {
  return cat.words.filter((w) => clues.every((c) => traitsOf(cat, w).includes(c) || (IMPOSTER_HINTS[w] ?? []).includes(c)));
}

/**
 * A civilian's clue: one of its word's traits, chosen so that together with the earlier clues that fit
 * the word, at least three words of the category still fit when that's possible (the imposter can't pin
 * the word down), and otherwise as specific as possible (a rare trait proves we know the word). `top`: 1 =
 * the best; a smart bot takes one of the `top` best.
 */
export function civilianClue(cat: WordCategory, word: string, earlier: string[], used: Set<string>, rnd: () => number, top = 1): string {
  const pool = civilianPool(cat, word);
  const fresh = pool.filter((t) => !used.has(t));
  const options = fresh.length ? fresh : pool;
  if (!options.length) return 'ممم';
  const n0 = counts(cat);
  const fitting = earlier.filter((c) => traitsOf(cat, word).includes(c) || (IMPOSTER_HINTS[word] ?? []).includes(c));
  const scored = options.map((t) => {
    const left = consistent(cat, [...fitting, t]).length;
    const n = n0.get(t) ?? 1;
    // too narrow (fewer than 3 words left) is the big fault; then prefer specific traits
    const v = (left >= 3 ? 0 : -10 * (3 - left)) - 0.5 * n + rnd() * 0.01;
    return { t, v };
  });
  scored.sort((a, b) => b.v - a.v);
  const k = Math.min(top, scored.length);
  return scored[Math.floor(rnd() * k)].t;
}

/** Traits common across all categories («كبير», «ألوان»…): the safest thing to say with no idea at all. */
let generic: string[] | null = null;
function genericClues(): string[] {
  if (!generic) {
    const total = new Map<string, number>();
    for (const cat of IMPOSTER_CATEGORIES) for (const [t, c] of counts(cat)) total.set(t, (total.get(t) ?? 0) + c / cat.words.length);
    generic = [...total].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }
  return generic;
}

/** The categories the earlier clues point to (all of them that have a word fitting at least one). */
export function guessCategories(clues: string[]): WordCategory[] {
  if (!clues.length) return [];
  const score = IMPOSTER_CATEGORIES.map((cat) => ({ cat, n: clues.filter((c) => cat.words.some((w) => traitsOf(cat, w).includes(c))).length }));
  const best = Math.max(...score.map((x) => x.n));
  return best > 0 ? score.filter((x) => x.n === best).map((x) => x.cat) : [];
}

/**
 * An imposter's clue: it doesn't know the word, so it says what a civilian would most likely say given the
 * clues already on screen — the trait with the highest P(t | civilian with w) summed over the words that
 * still fit those clues. `known`: the category when it is public; otherwise it is read from the clues, and
 * with nothing to go on the bot says something vague that fits any category.
 */
export function imposterClue(known: WordCategory | null, earlier: string[], used: Set<string>, rnd: () => number, top = 1): string {
  const cats = known ? [known] : guessCategories(earlier);
  if (!cats.length) {
    const g = genericClues().filter((t) => !used.has(t));
    return (g.length ? g : genericClues())[Math.floor(rnd() * Math.min(3, (g.length ? g : genericClues()).length))];
  }
  const score = new Map<string, number>();
  for (const cat of cats) {
    // words that fit the earlier clues (allowing one that doesn't: it may be another imposter's)
    let words = consistent(cat, earlier);
    if (!words.length) words = cat.words.filter((w) => earlier.filter((c) => !traitsOf(cat, w).includes(c)).length <= 1);
    if (!words.length) words = cat.words;
    for (const w of words) {
      for (const t of civilianPool(cat, w)) {
        if (used.has(t)) continue;
        score.set(t, (score.get(t) ?? 0) + pCivilian(cat, w, t) / words.length);
      }
    }
  }
  const ranked = [...score].map(([t, v]) => ({ t, v: v + rnd() * 1e-4 })).sort((a, b) => b.v - a.v);
  if (!ranked.length) return genericClues()[0];
  return ranked[Math.floor(rnd() * Math.min(top, ranked.length))].t;
}

/**
 * How likely each other player is an imposter, seen by a civilian bot that knows `word`: players with a
 * bot clue by the likelihood ratio, people (spoken clues) at the prior.
 */
export function suspicion(cat: WordCategory, word: string, others: string[], clues: Record<string, string>, imposters: number): Map<string, number> {
  const prior = Math.min(0.9, imposters / Math.max(1, others.length));
  const out = new Map<string, number>();
  for (const id of others) {
    const clue = clues[id];
    if (!clue) {
      out.set(id, prior);
      continue;
    }
    const lr = pImposter(cat, clue) / pCivilian(cat, word, clue);
    out.set(id, (prior * lr) / (prior * lr + (1 - prior)));
  }
  return out;
}

/** The option the civilians' clues point to: the highest product of P(clue | civilian with that word). */
export function rankGuesses(cat: WordCategory, options: string[], clues: string[]): { w: string; logp: number }[] {
  return options
    .map((w) => ({ w, logp: clues.reduce((t, c) => t + Math.log(pCivilian(cat, w, c)), 0) }))
    .sort((a, b) => b.logp - a.logp);
}
