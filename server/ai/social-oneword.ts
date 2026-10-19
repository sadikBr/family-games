/**
 * «كلمة واحدة» smart bots.
 *
 * Clues — a bot can't see what the others wrote (that would be peeking), so it picks a clue that is good
 * on its own and unlikely to be cancelled:
 * - good = discriminating: an association that few other words of the deck share points straight at the
 *   word (counted over the deck's association lists);
 * - with people writing too, the single most obvious association is the one they are most likely to write
 *   as well, so an expert leaves it to them when an almost-as-good one exists;
 * - bots follow a fixed convention among themselves (the k-th bot takes the k-th best clue), the way team
 *   mates agree on a system before playing — so two bots never cancel each other.
 *
 * Guesses — Bayes over the deck: P(clue | word) is high when the clue is one of the word's associations
 * (the more obvious, the likelier), tiny otherwise (people write clues outside the lists). The bot guesses
 * the most probable word when it's more likely right than wrong (a wrong guess also costs the next card,
 * a pass costs only this one), and passes otherwise.
 */
import { ONEWORD_WORDS, type OnewordWord } from '../oneword-content';
import { clueKey, clueProblem, sameClue, skeleton, stem } from '../oneword-match';

/**
 * Buckets that any two clues counting as the same (sameClue) share at least one of: the key, the stem,
 * the skeleton, and — for edit distance 1 between keys of 5+ letters — the key with one letter dropped.
 */
function buckets(clue: string): string[] {
  const k = clueKey(clue);
  if (!k) return [];
  const st = stem(k);
  const out = [`k:${k}`, `s:${st}`, `x:${skeleton(st)}`];
  const chars = [...k];
  if (chars.length >= 5) {
    out.push(`d:${k}`);
    for (let i = 0; i < chars.length; i++) out.push(`d:${chars.slice(0, i).join('')}${chars.slice(i + 1).join('')}`);
  }
  return out;
}

let index: Map<string, { w: OnewordWord; i: number }[]> | null = null;
function deckIndex() {
  if (!index) {
    index = new Map();
    for (const w of ONEWORD_WORDS)
      w.c.forEach((a, i) => {
        for (const b of new Set(buckets(a))) {
          const list = index!.get(b) ?? [];
          list.push({ w, i });
          index!.set(b, list);
        }
      });
  }
  return index;
}

/** Which deck words have an association matching `clue`, and at which position (cached: the deck is fixed). */
const hitCache = new Map<string, { w: OnewordWord; i: number }[]>();
export function clueHits(clue: string): { w: OnewordWord; i: number }[] {
  const k = clueKey(clue);
  let hits = hitCache.get(k);
  if (!hits) {
    const idx = deckIndex();
    const best = new Map<OnewordWord, number>();
    for (const b of buckets(clue))
      for (const h of idx.get(b) ?? []) {
        const prev = best.get(h.w);
        if (prev !== undefined && prev <= h.i) continue;
        if (sameClue(h.w.c[h.i], clue)) best.set(h.w, h.i);
      }
    hits = [...best].map(([w, i]) => ({ w, i }));
    if (hitCache.size > 5000) hitCache.clear();
    hitCache.set(k, hits);
  }
  return hits;
}

/** The word's usable clues, best first (see the file comment). `humans`: people are writing clues too. */
export function rankedClues(word: OnewordWord, humans: boolean): string[] {
  const ok = word.c.filter((c) => !clueProblem(c, word));
  const all = ok.length ? ok : word.c;
  const scored = all.map((c, i) => {
    const n = Math.max(1, clueHits(c).length);
    // discriminating first; obviousness breaks ties (an obvious clue is easier to read)
    let v = 1 / n - 0.02 * i;
    if (humans && i === 0 && all.length > 2) v -= 0.25;
    return { c, v };
  });
  scored.sort((a, b) => b.v - a.v);
  // drop near-duplicates (two forms of the same clue would cancel each other)
  const out: string[] = [];
  for (const { c } of scored) if (!out.some((o) => sameClue(o, c))) out.push(c);
  return out;
}

/** The clue of the k-th bot giver (bots agree on the order: their seats). */
export function conventionClue(word: OnewordWord, k: number, humans: boolean): string {
  const ranked = rankedClues(word, humans);
  return ranked[k % ranked.length] ?? word.c[0];
}

/** The deck's words ranked by how well they explain the clues (probabilities over the candidates). */
export function guessPosterior(clues: string[], exclude: string[] = []): { w: OnewordWord; p: number }[] {
  if (!clues.length) return [];
  const logp = new Map<OnewordWord, number>();
  const EPS = Math.log(0.002);
  // only words matching at least one clue can win; everything else shares the "explains nothing" score
  const cands = new Set<OnewordWord>();
  for (const c of clues) for (const h of clueHits(c)) if (!exclude.includes(clueKey(h.w.w))) cands.add(h.w);
  for (const w of cands) {
    const norm = w.c.reduce((t, _, i) => t + 1 / (1 + 0.45 * i), 0);
    let lp = 0;
    for (const c of clues) {
      const h = clueHits(c).find((x) => x.w === w);
      lp += h ? Math.log(1 / (1 + 0.45 * h.i) / norm) : EPS;
    }
    logp.set(w, lp);
  }
  // the rest of the deck, each explaining nothing
  const rest = ONEWORD_WORDS.length - cands.size;
  const restLp = EPS * clues.length;
  const max = Math.max(restLp, ...logp.values());
  let z = rest * Math.exp(restLp - max);
  for (const v of logp.values()) z += Math.exp(v - max);
  return [...logp]
    .map(([w, v]) => ({ w, p: Math.exp(v - max) / z }))
    .sort((a, b) => b.p - a.p);
}

/** An expert guess: the most probable word if it's at least as likely right as wrong, else pass (null). */
export function expertGuess(clues: string[], exclude: string[] = []): string | null {
  const post = guessPosterior(clues, exclude);
  if (!post.length || post[0].p < 0.5) return null;
  return post[0].w.w;
}
