/** «معركة السفن» — 10×10 grids, fleet of 5 ships (5, 4, 3, 3, 2). Ships don't touch, not even diagonally. */
export const BN = 10;
export const FLEET = [5, 4, 3, 3, 2];
export const SHIP_NAME: Record<number, string> = { 5: 'حاملة الطائرات', 4: 'البارجة', 3: 'المدمّرة', 2: 'الزورق' };

export function randomFleet(): number[][] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const taken = new Set<number>();
    const ships: number[][] = [];
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horiz = Math.random() < 0.5;
        const r = Math.floor(Math.random() * (horiz ? BN : BN - len + 1));
        const c = Math.floor(Math.random() * (horiz ? BN - len + 1 : BN));
        const cells = Array.from({ length: len }, (_, k) => (horiz ? r * BN + c + k : (r + k) * BN + c));
        const touches = cells.some((i) => {
          const ri = Math.floor(i / BN), ci = i % BN;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const rr = ri + dr, cc = ci + dc;
              if (rr >= 0 && rr < BN && cc >= 0 && cc < BN && taken.has(rr * BN + cc)) return true;
            }
          return false;
        });
        if (touches) continue;
        cells.forEach((i) => taken.add(i));
        ships.push(cells);
        placed = true;
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return ships;
  }
  throw new Error('could not place fleet');
}

/** Bot targeting. shots: cell → 'hit' | 'miss'; sunk: cells of ships already sunk. */
export function botShot(shots: Record<number, 'hit' | 'miss'>, sunk: number[][], level: 1 | 2): number {
  const sunkSet = new Set(sunk.flat());
  const free = (i: number) => i >= 0 && i < BN * BN && shots[i] === undefined;
  const nb = (i: number) => {
    const r = Math.floor(i / BN), c = i % BN;
    return [r > 0 ? i - BN : -1, r < BN - 1 ? i + BN : -1, c > 0 ? i - 1 : -1, c < BN - 1 ? i + 1 : -1].filter((x) => x >= 0);
  };
  // cells next to a sunk ship can't hold a ship (ships don't touch)
  const blocked = new Set<number>();
  for (const cell of sunkSet) {
    const r = Math.floor(cell / BN), c = cell % BN;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < BN && cc >= 0 && cc < BN) blocked.add(rr * BN + cc);
    }
  }
  const open = Object.keys(shots).map(Number).filter((i) => shots[i] === 'hit' && !sunkSet.has(i));
  if (open.length && level === 2) {
    // target mode: extend a line of hits, or try around a single hit
    if (open.length >= 2) {
      const horiz = open.every((i) => Math.floor(i / BN) === Math.floor(open[0] / BN));
      const sorted = open.slice().sort((a, b) => a - b);
      const ends = horiz ? [sorted[0] - 1, sorted[sorted.length - 1] + 1].filter((i) => Math.floor(i / BN) === Math.floor(sorted[0] / BN)) : [sorted[0] - BN, sorted[sorted.length - 1] + BN];
      const cand = ends.filter((i) => free(i) && !blocked.has(i));
      if (cand.length) return cand[Math.floor(Math.random() * cand.length)];
    }
    const around = open.flatMap(nb).filter((i) => free(i) && !blocked.has(i));
    if (around.length) return around[Math.floor(Math.random() * around.length)];
  } else if (open.length) {
    const around = open.flatMap(nb).filter(free);
    if (around.length && Math.random() < 0.6) return around[Math.floor(Math.random() * around.length)];
  }
  const all = Array.from({ length: BN * BN }, (_, i) => i).filter((i) => free(i) && !(level === 2 && blocked.has(i)));
  const parity = level === 2 ? all.filter((i) => (Math.floor(i / BN) + (i % BN)) % 2 === 0) : all;
  const pool = parity.length ? parity : all.length ? all : Array.from({ length: BN * BN }, (_, i) => i).filter(free);
  return pool[Math.floor(Math.random() * pool.length)];
}
