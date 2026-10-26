/**
 * «خمّن من؟» bots. A bot reasons only from what its own phone shows: the questions it asked about the
 * other's secret and their (truthful) answers, its own wrong guesses, and the public log of the other
 * player's questions (how close they are). Never from the other's secret.
 *
 * - expert: plays the race, not only the puzzle. Every option — each question by how it would split
 *   the remaining candidates, or a guess — is scored by the chance to win the round from where it
 *   leads (gwWinChance: an exact table over «my candidates × theirs», both players then splitting as
 *   well as possible). Ahead, that is the most even question; behind, a bolder split or an early
 *   guess; one candidate left, the guess.
 * - smart: one of the three best questions; guesses at one left (two when a miss only costs the turn).
 * - easy: often a weak question (or a useless one), and may guess with a few candidates left.
 */
import type { BotLevel } from '../../src/shared/protocol';
import { GW_N, GW_QUESTIONS, gwAnswer, gwConsistent, type GwEvent, type GwQuestionId } from '../../src/shared/games/guesswho';

export type GwMove = { type: 'ask'; q: GwQuestionId } | { type: 'guess'; char: number };

type Rnd = () => number;

/** The characters still possible for `by`, from the log alone. */
export function gwCandidates(log: GwEvent[], by: string): number[] {
  const out: number[] = [];
  for (let c = 0; c < GW_N; c++) if (gwConsistent(c, log, by)) out.push(c);
  return out;
}

/** The questions `by` already asked this round. */
export const gwAsked = (log: GwEvent[], by: string) => new Set(log.flatMap((e) => (e.kind === 'ask' && e.by === by ? [e.q] : [])));

/** How unevenly a question splits the candidates: |yes − no| (0 = a perfect half). */
export function gwSplit(q: GwQuestionId, cands: number[]): number {
  let yes = 0;
  for (const c of cands) if (gwAnswer(q, c)) yes++;
  return Math.abs(2 * yes - cands.length);
}

/** Unasked questions with their split, best (most even) first; ties in random order. */
function ranked(cands: number[], asked: Set<GwQuestionId>, rnd: Rnd) {
  return GW_QUESTIONS.filter((q) => !asked.has(q.id))
    .map((q) => ({ q: q.id, split: gwSplit(q.id, cands), r: rnd() }))
    .sort((a, b) => a.split - b.split || a.r - b.r);
}

const pick = <T>(arr: T[], rnd: Rnd): T => arr[Math.floor(rnd() * arr.length)];

/* ------------------------------------------------------------------ */
/* The race: who finds first                                           */
/* ------------------------------------------------------------------ */

/**
 * gwWinChance(n, m, wrongLoses): the chance that the player on turn wins the round with `n` candidates
 * left against `m` for the other player, both playing their best from here, when any split of the
 * candidates can be asked (the questions come close: 24 characters, 17 questions). Exact on that model.
 */
const tables = new Map<boolean, number[][]>();
function table(wrongLoses: boolean): number[][] {
  let t = tables.get(wrongLoses);
  if (t) return t;
  const N = GW_N;
  t = Array.from({ length: N + 1 }, () => Array(N + 1).fill(0));
  // W(n, m) depends on W(m, a) with a < n: fill by the sum n + m, small first; W(1, m) = 1
  for (let sum = 2; sum <= 2 * N; sum++) {
    for (let n = 1; n <= N; n++) {
      const m = sum - n;
      if (m < 1 || m > N) continue;
      if (n === 1) {
        t[n][m] = 1;
        continue;
      }
      // a guess…
      let best = 1 / n + (wrongLoses ? 0 : ((n - 1) / n) * (1 - t[m][n - 1]));
      // …or a question that keeps a or n − a
      for (let a = 1; a < n; a++) best = Math.max(best, (a / n) * (1 - t[m][a]) + ((n - a) / n) * (1 - t[m][n - a]));
      t[n][m] = best;
    }
  }
  tables.set(wrongLoses, t);
  return t;
}

export const gwWinChance = (n: number, m: number, wrongLoses: boolean) => table(wrongLoses)[Math.max(1, n)][Math.max(1, m)];

/** A guess now among `n`. */
const guessChance = (n: number, m: number, wrongLoses: boolean) => 1 / n + (wrongLoses ? 0 : ((n - 1) / n) * (1 - gwWinChance(m, n - 1, wrongLoses)));
/** A question that keeps `a` (yes or no) of `n` candidates. */
const splitChance = (n: number, a: number, m: number, wrongLoses: boolean) =>
  (a / n) * (1 - gwWinChance(m, a, wrongLoses)) + ((n - a) / n) * (1 - gwWinChance(m, n - a, wrongLoses));

export interface GwBotInput {
  level: BotLevel;
  log: GwEvent[];
  me: string;
  other: string;
  /** a wrong guess loses the round (otherwise it only costs the turn) */
  wrongLoses: boolean;
  rnd?: Rnd;
}

export function gwBotMove({ level, log, me, other, wrongLoses, rnd = Math.random }: GwBotInput): GwMove {
  const cands = gwCandidates(log, me);
  const k = cands.length;
  if (k <= 1) return { type: 'guess', char: cands[0] ?? 0 };
  const theirs = gwCandidates(log, other).length;
  const asked = gwAsked(log, me);
  const qs = ranked(cands, asked, rnd);
  const useful = qs.filter((x) => x.split < k);
  const guess = (): GwMove => ({ type: 'guess', char: pick(cands, rnd) });

  if (level === 'expert') {
    let best: { move: GwMove; p: number } = { move: { type: 'guess', char: pick(cands, rnd) }, p: guessChance(k, theirs, wrongLoses) };
    for (const x of useful) {
      const yes = (k + x.split) / 2;
      const p = splitChance(k, Math.max(yes, k - yes), theirs, wrongLoses);
      // (ties: the more even question — `useful` is sorted that way)
      if (p > best.p + 1e-9) best = { move: { type: 'ask', q: x.q }, p };
    }
    return best.move;
  }
  if (level === 'smart') {
    if (!wrongLoses && k <= 2) return guess();
    if (theirs <= 1 && k <= 3) return guess();
    const top = useful.slice(0, 3);
    return top.length ? { type: 'ask', q: pick(top, rnd).q } : guess();
  }
  // easy: a hasty guess now and then…
  if (k <= 4 && rnd() < 0.4) return guess();
  if (!useful.length) return guess();
  // …and a weak question: one of the worse half of the useful ones, sometimes one that tells nothing
  if (rnd() < 0.2 && qs.length > useful.length) return { type: 'ask', q: pick(qs.filter((x) => x.split >= k), rnd).q };
  const weak = useful.slice(Math.floor(useful.length / 2));
  return { type: 'ask', q: pick(weak.length ? weak : useful, rnd).q };
}
