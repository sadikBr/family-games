/**
 * «فك الشيفرة»: every possible code, and how a bot picks its next guess — a random code that fits
 * every clue so far (the consistent-guess strategy). Hard bots pick the fitting code that splits the
 * remaining ones best once few are left; easy bots sometimes forget one clue.
 */
import { codebreakMarks, type CodebreakLevel, type CodebreakRow } from '../src/shared/games/codebreak';

const cache = new Map<string, number[][]>();

/** All codes of `pegs` pegs from `colors` colours (with or without repeats). At most 8⁵ = 32 768. */
export function allCodes(pegs: number, colors: number, repeats: boolean): number[][] {
  const key = `${pegs}|${colors}|${repeats}`;
  let out = cache.get(key);
  if (out) return out;
  out = [];
  const cur: number[] = [];
  const rec = () => {
    if (cur.length === pegs) {
      out!.push([...cur]);
      return;
    }
    for (let c = 0; c < colors; c++) {
      if (!repeats && cur.includes(c)) continue;
      cur.push(c);
      rec();
      cur.pop();
    }
  };
  rec();
  cache.set(key, out);
  return out;
}

export function randomCode(pegs: number, colors: number, repeats: boolean, rand: () => number = Math.random): number[] {
  const codes = allCodes(pegs, colors, repeats);
  return [...codes[Math.floor(rand() * codes.length)]];
}

const fits = (code: readonly number[], rows: readonly CodebreakRow[]) =>
  rows.every((r) => {
    const m = codebreakMarks(r.guess, code);
    return m.black === r.black && m.white === r.white;
  });

/** The codes that agree with every clue. */
export function consistent(codes: readonly number[][], rows: readonly CodebreakRow[]): number[][] {
  return codes.filter((c) => fits(c, rows));
}

/** Among `cands`, the guess whose worst answer leaves the fewest codes (only for small sets). */
function minimax(cands: number[][]): number[] {
  let best = cands[0];
  let bestWorst = Infinity;
  for (const g of cands) {
    const parts = new Map<number, number>();
    let worst = 0;
    for (const c of cands) {
      const m = codebreakMarks(g, c);
      const k = m.black * 10 + m.white;
      const n = (parts.get(k) ?? 0) + 1;
      parts.set(k, n);
      if (n > worst) worst = n;
      if (worst >= bestWorst) break;
    }
    if (worst < bestWorst) {
      bestWorst = worst;
      best = g;
    }
  }
  return best;
}

const pick = <T>(arr: readonly T[], rand: () => number) => arr[Math.floor(rand() * arr.length)];

/** The bot's next guess (never one it already tried). */
export function botGuess(
  rows: readonly CodebreakRow[],
  opts: { pegs: number; colors: number; repeats: boolean; level: CodebreakLevel },
  rand: () => number = Math.random,
): number[] {
  const codes = allCodes(opts.pegs, opts.colors, opts.repeats);
  const tried = new Set(rows.map((r) => r.guess.join(',')));
  const fresh = (cs: number[][]) => cs.filter((c) => !tried.has(c.join(',')));
  // an easy bot forgets one of its clues now and then (a medium one rarely)
  const slip = opts.level === 'easy' ? 0.4 : opts.level === 'medium' ? 0.12 : 0;
  if (rows.length >= 1 && rand() < slip) {
    const forget = Math.floor(rand() * rows.length);
    const loose = fresh(consistent(codes, rows.filter((_, i) => i !== forget)));
    if (loose.length) return [...pick(loose, rand)];
  }
  const ok = fresh(consistent(codes, rows));
  if (!ok.length) return [...pick(fresh(codes), rand)];
  if (opts.level === 'hard' && ok.length > 2 && ok.length <= 400) return [...minimax(ok)];
  return [...pick(ok, rand)];
}
