/**
 * «معركة السفن» — the expert bot: probability-density targeting from public information only (its own
 * shots and which enemy ships are sunk, exactly what its phone shows).
 *
 * Every way each remaining ship could lie is counted, given what is known: misses, sunk ships and the
 * water around them (ships never touch, not even diagonally), the diagonal neighbours of a hit (a
 * straight ship can't be there, and another ship can't touch it), and that a ship can't sit next to a
 * hit it doesn't include. Hunting: fire at the cell covered by the most placements (which also gives
 * the natural parity pattern). Targeting (unsunk hits on the board): only placements through those hits
 * count, weighted by how many hits they explain.
 */
import { BN, FLEET } from '../../src/shared/battleship';

const CELLS = BN * BN;

export function battleshipExpert(shots: Record<number, 'hit' | 'miss'>, sunk: number[][], rng: () => number = Math.random): number {
  const sunkSet = new Set(sunk.flat());
  const blocked = new Uint8Array(CELLS);
  const hit = new Uint8Array(CELLS); // unresolved hits
  const around = (i: number, f: (j: number, diag: boolean) => void) => {
    const r = Math.floor(i / BN), c = i % BN;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < BN && cc >= 0 && cc < BN) f(rr * BN + cc, dr !== 0 && dc !== 0);
      }
  };
  for (const k of Object.keys(shots)) {
    const i = Number(k);
    if (shots[i] === 'miss') blocked[i] = 1;
  }
  for (const i of sunkSet) {
    blocked[i] = 1;
    around(i, (j) => (blocked[j] = 1));
  }
  const hits: number[] = [];
  for (const k of Object.keys(shots)) {
    const i = Number(k);
    if (shots[i] === 'hit' && !sunkSet.has(i)) {
      hit[i] = 1;
      hits.push(i);
    }
  }
  for (const i of hits) around(i, (j, diag) => diag && !hit[j] && (blocked[j] = 1));

  // the ships still afloat
  const left = FLEET.slice();
  for (const ship of sunk) {
    const k = left.indexOf(ship.length);
    if (k >= 0) left.splice(k, 1);
  }
  if (!left.length) left.push(2);

  const density = new Float64Array(CELLS);
  const cells: number[] = [];
  for (const len of new Set(left)) {
    const copies = left.filter((x) => x === len).length;
    for (let horiz = 0; horiz < 2; horiz++)
      for (let r = 0; r < BN; r++)
        for (let c = 0; c < BN; c++) {
          if (horiz ? c + len > BN : r + len > BN) continue;
          cells.length = 0;
          let ok = true, covered = 0;
          for (let k = 0; k < len; k++) {
            const i = horiz ? r * BN + c + k : (r + k) * BN + c;
            if (blocked[i]) {
              ok = false;
              break;
            }
            if (hit[i]) covered++;
            cells.push(i);
          }
          if (!ok) continue;
          // a ship can't touch a hit it doesn't include (that hit belongs to another ship)
          if (hits.length) {
            const inShip = new Set(cells);
            for (const i of cells) {
              around(i, (j) => {
                if (hit[j] && !inShip.has(j)) ok = false;
              });
              if (!ok) break;
            }
            if (!ok) continue;
          }
          if (hits.length && !covered) {
            // while targeting, other placements only break ties
            for (const i of cells) if (shots[i] === undefined) density[i] += 0.001 * copies;
            continue;
          }
          const w = copies * (covered ? Math.pow(20, covered) : 1);
          for (const i of cells) if (shots[i] === undefined) density[i] += w;
        }
  }
  let best = -1, bestV = -1, ties = 0;
  for (let i = 0; i < CELLS; i++) {
    if (shots[i] !== undefined || blocked[i]) continue;
    const v = density[i];
    if (v > bestV + 1e-9) {
      bestV = v;
      best = i;
      ties = 1;
    } else if (Math.abs(v - bestV) <= 1e-9 && rng() < 1 / ++ties) best = i;
  }
  if (best >= 0) return best;
  for (let i = 0; i < CELLS; i++) if (shots[i] === undefined) return i;
  return 0;
}
