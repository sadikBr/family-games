/**
 * «الطاولة» bots: they pick a whole turn (a sequence of steps) among every distinct way to play the roll.
 * - easy: a random legal sequence;
 * - smart: a quick heuristic (hit, make points, keep few blots in direct range, run when ahead);
 * - expert: a static evaluation of each end position: the race (pip counts, with bear-off wastage) when
 *   the armies have passed each other, else pips + the opponent's 36 rolls against my blots (expected loss),
 *   points made in the home board, primes, anchors, checkers sent to the bar, and stuck back checkers.
 * The bots only see the board and the dice: there is nothing hidden in this game.
 */
import { allSequences, pipCount, type TawlaPos, type TawlaSide, type TawlaStep } from '../src/shared/games/tawla';
import type { BotLevel } from '../src/shared/protocol';

/* 21 distinct rolls with their weight out of 36 */
const ROLLS: [number, number, number][] = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push([a, b, a === b ? 1 : 2]);

/** Is there contact (can still be hit / hit)? My farthest checker vs the opponent's farthest, on my numbering. */
export function hasContact(me: number[], op: number[]): boolean {
  let myBack = 0, opBack = 0;
  for (let p = 25; p >= 1; p--) if (me[p]) { myBack = p; break; }
  for (let p = 25; p >= 1; p--) if (op[p]) { opBack = p; break; }
  // the opponent's farthest checker sits on my point 25 − opBack
  return myBack > 25 - opBack;
}

/** Made points (2+) in `side`'s home board. */
const homeMade = (side: number[]) => {
  let n = 0;
  for (let p = 1; p <= 6; p++) if (side[p] >= 2) n++;
  return n;
};

/**
 * The opponent (`op`, on roll) shooting at `me`'s blots: the expected loss for `me`, in pips: for each roll,
 * the best hit (pips the hit checker loses + a tempo), weighted by its chance, more when the opponent's
 * home board is strong (coming back in is harder).
 */
export function shotLoss(me: number[], op: number[]): { loss: number; shots: number } {
  // my blots in the opponent's numbering
  const blots: number[] = [];
  for (let p = 1; p <= 24; p++) if (me[p] === 1) blots.push(25 - p);
  if (!blots.length) return { loss: 0, shots: 0 };
  const blocked = (q: number) => q >= 1 && q <= 24 && me[25 - q] >= 2;
  const sources: number[] = [];
  const onBar = op[25] > 0;
  for (let f = 25; f >= 1; f--) if (op[f]) sources.push(f);
  const strength = 1 + homeMade(op) * 0.18;
  let loss = 0, shots = 0;
  for (const [a, b, w] of ROLLS) {
    let best = 0;
    for (const q of blots) {
      // value of my checker on my point 25 − q going back to the bar
      const value = q + 10;
      if (value <= best) continue;
      let can = false;
      for (const f of sources) {
        if (f <= q) break;
        if (onBar && f !== 25 && op[25] > 1) continue; // must bring both in first
        const n = f - q;
        if (onBar && f !== 25) {
          // one checker on the bar: one die enters, the other may hit
          const enterA = !blocked(25 - a), enterB = !blocked(25 - b);
          if ((n === b && enterA) || (n === a && enterB)) { can = true; break; }
          continue;
        }
        if (a !== b) {
          if (n === a || n === b) { can = true; break; }
          if (n === a + b && !(f === 25 && op[25] > 1) && (!blocked(f - a) || !blocked(f - b))) { can = true; break; }
        } else {
          let at = f;
          for (let k = 1; k <= 4; k++) {
            at -= a;
            if (at === q) { can = true; break; }
            if (at < q || blocked(at)) break;
          }
          if (can) break;
        }
      }
      if (can) best = value;
    }
    if (best) {
      shots += w;
      loss += (w * best * strength) / 36;
    }
  }
  return { loss, shots };
}

/** Length of my longest run of made points, and where it starts (its lowest point). */
function longestPrime(me: number[]): { len: number; low: number } {
  let len = 0, low = 0, run = 0;
  for (let p = 1; p <= 24; p++) {
    if (me[p] >= 2) {
      run++;
      if (run > len) { len = run; low = p - run + 1; }
    } else run = 0;
  }
  return { len, low };
}

const HOME_W = [0, 1.5, 2, 3, 4.5, 6, 6.5, 4.5, 2];
const ANCHOR_W: Record<number, number> = { 18: 2.5, 19: 3, 20: 4.5, 21: 4.5, 22: 3, 23: 2, 24: 1.5 };
const PRIME_W = [0, 0, 0, 2, 5, 9, 15];

/** Expert evaluation of `pos` for side `s` that has just moved (the other side rolls next). Higher = better. */
export function evalExpert(pos: TawlaPos, s: TawlaSide): number {
  const me = pos[s], op = pos[1 - s];
  if (me[0] === 15) return 10000;
  const myPips = pipCount(me), opPips = pipCount(op);
  if (!hasContact(me, op)) {
    // the race: pips, plus what the checkers still on the board cost (each roll takes off two at most) and wastage
    let left = 0, waste = 0;
    for (let p = 1; p <= 24; p++) {
      left += me[p];
      if (p <= 6 && me[p] > 3) waste += (me[p] - 3) * 0.7;
    }
    let gaps = 0;
    for (let p = 1; p <= 6; p++) if (!me[p] && [...me.slice(p + 1, 7)].some(Boolean)) gaps++;
    return opPips - myPips - left * 2 - waste - gaps * 0.6 + 60;
  }
  let score = opPips - myPips;
  const opHome = homeMade(op), myHome = homeMade(me);
  // the opponent on the bar: a big gain, more with my home board closed
  score += op[25] * (14 + myHome * 3);
  // me on the bar (I couldn't come in)
  score -= me[25] * (10 + opHome * 3);
  // my blots against the opponent's 36 rolls
  score -= shotLoss(me, op).loss * 1.6;
  // points in my home board (and the bar point)
  for (let p = 1; p <= 8; p++) if (me[p] >= 2) score += HOME_W[p] * (op[25] ? 1.4 : 1);
  // a prime in front of the opponent's back checkers
  const pr = longestPrime(me);
  let opBehind = 0;
  for (let q = 1; q <= 25; q++) if (op[q] && 25 - q > pr.low + pr.len - 1) opBehind += op[q];
  if (opBehind) score += PRIME_W[Math.min(6, pr.len)] * (1 + Math.min(opBehind, 4) * 0.25);
  // anchors in the opponent's home / outfield, stuck back checkers against a strong home board
  for (let p = 18; p <= 24; p++) {
    if (me[p] >= 2) score += ANCHOR_W[p] ?? 0;
    if (me[p]) score -= me[p] * opHome * 0.6;
  }
  // stacks: a point with many checkers wastes them
  for (let p = 1; p <= 24; p++) if (me[p] > 3) score -= (me[p] - 3) * (p <= 6 ? 1.2 : 0.8);
  // builders bearing on my home board points not made yet
  for (let p = 7; p <= 11; p++) if (me[p] === 1 || me[p] === 3) score += 0.4;
  // checkers already off count (in a contact bear-off, safety first is covered by the shots)
  score += me[0] * 1.5;
  return score;
}

/** Smart (medium) evaluation: hits, made points, blots within direct range, pips. */
export function evalSmart(pos: TawlaPos, s: TawlaSide): number {
  const me = pos[s], op = pos[1 - s];
  if (me[0] === 15) return 10000;
  let score = (pipCount(op) - pipCount(me)) * 0.6 + op[25] * 9 + me[0] * 2;
  const contact = hasContact(me, op);
  for (let p = 1; p <= 24; p++) {
    if (me[p] >= 2 && p <= 7) score += 3;
    else if (me[p] >= 2) score += 1;
    if (me[p] === 1 && contact) {
      // opponent checkers 1..6 pips behind this blot (on their way towards it)
      let near = 0;
      for (let k = 1; k <= 11; k++) {
        const myPt = p + k; // the opponent comes from my higher points
        const q = myPt >= 25 ? 25 : 25 - myPt;
        if (myPt <= 25 && op[q]) near += k <= 6 ? 2 : 1;
      }
      if (near) score -= 2 + near * 0.8 + (25 - p) * 0.1;
    }
  }
  return score;
}

/** The bot's whole turn: the steps to play, in order (empty = nothing can be played). */
export function tawlaBotSteps(pos: TawlaPos, s: TawlaSide, left: number[], level: BotLevel): TawlaStep[] {
  const seqs = allSequences(pos, s, left);
  if (seqs.length <= 1) return seqs[0]?.steps ?? [];
  if (level === 'easy') return seqs[Math.floor(Math.random() * seqs.length)].steps;
  const ev = level === 'smart' ? evalSmart : evalExpert;
  let best = seqs[0], bestScore = -Infinity;
  for (const q of seqs) {
    const v = ev(q.pos, s) + Math.random() * (level === 'smart' ? 1.5 : 0.05);
    if (v > bestScore) {
      bestScore = v;
      best = q;
    }
  }
  return best.steps;
}
