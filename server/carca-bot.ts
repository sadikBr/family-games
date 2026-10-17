/**
 * «المدن والطرق» — the bots. For every legal spot and rotation of the drawn tile, the bot looks at the
 * features the tile touches (and the monasteries around it) and measures how the expected points of
 * every player change: completed features score for real, unfinished ones are worth their end-of-game
 * points plus a share of the bonus they may still get (by tiles left and open sides). Then it weighs
 * putting a follower on each free feature of the tile against keeping it (followers are worth more
 * early in the game and when few are left; farmers never come back, so they wait for the late game).
 * Joining an opponent's feature to its own to share or take the majority falls out of the same sums.
 * Level 1 (easy) adds noise and is shy with followers.
 */
import type { CarcaFollower, CarcaTilePlaced } from '../src/shared/games/carca';
import {
  TILES,
  TOTAL_TILES,
  fieldCities,
  groupOf,
  key,
  legalSpots,
  majority,
  makeBoard,
  memberKey,
  unfinishedPoints,
  type Board,
  type Group,
} from '../src/shared/carca-tiles';

export interface BotInput {
  board: CarcaTilePlaced[];
  followers: CarcaFollower[];
  tile: string;
  me: string;
  order: string[];
  /** tiles left in the pile after this one */
  tilesLeft: number;
  supply: number;
  farmers: boolean;
  level: 1 | 2;
  /** false: just the best spot (time-outs) */
  withFollower: boolean;
  random?: () => number;
}

export interface BotMove {
  x: number;
  y: number;
  r: number;
  f: number | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Expected points of a feature for whoever holds its majority. */
export function expectedValue(board: Board, g: Group, tilesLeft: number): number {
  const frac = tilesLeft / (TOTAL_TILES - 1);
  switch (g.kind) {
    case 'road':
      return g.complete ? g.tiles : g.tiles + 0.4 * Math.min(g.open, 2) * frac;
    case 'city': {
      const end = g.tiles + g.pennants;
      if (g.complete) return 2 * end;
      const p = clamp((frac * 2.2) / (1 + 0.8 * (g.open - 1)), 0, 0.85);
      return end * (1 + p) + Math.min(g.open, 3) * frac;
    }
    case 'monastery': {
      if (g.complete) return 9;
      const p = clamp(1 - g.open / (tilesLeft * 0.3 + 1), 0, 0.95);
      return g.tiles + p * (9 - g.tiles);
    }
    case 'field': {
      const cs = fieldCities(board, g);
      const done = cs.filter((c) => c.complete).length;
      return 3 * done + 1.5 * (cs.length - done) * Math.min(1, frac * 2);
    }
  }
}

/** What keeping one follower in hand is worth now. */
function followerWorth(supply: number, tilesLeft: number): number {
  const frac = tilesLeft / (TOTAL_TILES - 1);
  const scarce = supply <= 1 ? 3 : supply <= 2 ? 1.8 : supply <= 3 ? 1.3 : 1;
  return (0.6 + 4 * frac) * scarce;
}

export function planMove(inp: BotInput): BotMove | null {
  const rnd = inp.random ?? Math.random;
  const board = makeBoard(inp.board);
  const spots = legalSpots(board, inp.tile);
  if (!spots.length) return null;
  const frac = inp.tilesLeft / (TOTAL_TILES - 1);
  const opps = inp.order.filter((p) => p !== inp.me);
  const active = new Set(inp.order);

  const byMember = new Map<string, CarcaFollower>();
  for (const f of inp.followers) byMember.set(memberKey(f), f);

  /** points per player for a feature with followers */
  const valueVec = (g: Group): Record<string, number> => {
    const owners = g.members.map((m) => byMember.get(memberKey(m))?.owner).filter((o): o is string => !!o);
    const out: Record<string, number> = {};
    if (!owners.length) return out;
    const v = expectedValue(board, g, inp.tilesLeft);
    for (const o of majority(owners)) if (active.has(o)) out[o] = v;
    // a completed feature gives the followers back
    if (g.complete) for (const o of owners) if (o === inp.me) out[o] = (out[o] ?? 0) + followerWorth(inp.supply + 1, inp.tilesLeft);
    return out;
  };

  // the value of each feature with followers before the tile goes down
  const oldGroup = new Map<string, { id: string; val: Record<string, number> }>();
  const oldOf = (f: CarcaFollower) => {
    const k = memberKey(f);
    let hit = oldGroup.get(k);
    if (!hit) {
      const g = groupOf(board, f.x, f.y, f.f);
      hit = { id: g.id, val: valueVec(g) };
      for (const m of g.members) oldGroup.set(memberKey(m), hit);
    }
    return hit;
  };
  for (const f of inp.followers) oldOf(f);

  const scalar = (d: Record<string, number>) => {
    const mine = d[inp.me] ?? 0;
    if (!opps.length) return mine;
    const vals = opps.map((o) => d[o] ?? 0);
    return mine - 0.5 * Math.max(...vals) - (0.5 * vals.reduce((a, b) => a + b, 0)) / vals.length;
  };

  const type = TILES[inp.tile];
  let best: (BotMove & { score: number }) | null = null;
  for (const spot of spots) {
    for (const r of spot.rs) {
      const k = key(spot.x, spot.y);
      board.set(k, { x: spot.x, y: spot.y, t: inp.tile, r });
      const delta: Record<string, number> = {};
      const add = (vec: Record<string, number>, sign: number) => {
        for (const [p, v] of Object.entries(vec)) delta[p] = (delta[p] ?? 0) + sign * v;
      };
      const free: { f: number; g: Group }[] = [];
      const seen = new Set<string>();
      type.feats.forEach((feat, f) => {
        if (feat.k === 'monastery' || seen.has(`${spot.x},${spot.y},${f}`)) return;
        const g = groupOf(board, spot.x, spot.y, f);
        for (const m of g.members) seen.add(memberKey(m));
        const held = g.members.map((m) => byMember.get(memberKey(m))).filter((x): x is CarcaFollower => !!x);
        if (!held.length) {
          free.push({ f, g });
          return;
        }
        add(valueVec(g), 1);
        const olds = new Map<string, Record<string, number>>();
        for (const h of held) {
          const o = oldOf(h);
          olds.set(o.id, o.val);
        }
        for (const v of olds.values()) add(v, -1);
      });
      // monasteries: the new tile's own, and those around it gaining a neighbour
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const pl = board.get(key(spot.x + dx, spot.y + dy));
          if (!pl) continue;
          const mi = TILES[pl.t].feats.findIndex((x) => x.k === 'monastery');
          if (mi < 0) continue;
          const g = groupOf(board, pl.x, pl.y, mi);
          if (!dx && !dy) {
            free.push({ f: mi, g });
            continue;
          }
          const h = byMember.get(memberKey({ x: pl.x, y: pl.y, f: mi }));
          if (!h) continue;
          add(valueVec(g), 1);
          add(oldOf(h).val, -1);
        }
      }
      let neighbours = 0;
      for (let d = 0; d < 4; d++) if (board.has(key(spot.x + [0, 1, 0, -1][d], spot.y + [-1, 0, 1, 0][d]))) neighbours++;
      board.delete(k);

      const base = scalar(delta) + 0.05 * neighbours;
      const options: { f: number | null; v: number }[] = [{ f: null, v: 0 }];
      if (inp.withFollower && inp.supply > 0) {
        board.set(k, { x: spot.x, y: spot.y, t: inp.tile, r });
        const worth = followerWorth(inp.supply, inp.tilesLeft);
        for (const { f, g } of free) {
          if (g.kind === 'field') {
            if (!inp.farmers) continue;
            if (inp.level === 1 && frac > 0.3) continue;
          }
          let v = expectedValue(board, g, inp.tilesLeft);
          if (g.complete) v += 0.2; // scores now and comes straight back
          else if (g.kind === 'field') v -= worth * 1.6 + (frac > 0.45 ? 6 : 0);
          else v -= worth * (g.kind === 'road' && g.open > 1 ? 1.2 : 1);
          // an unfinished feature is worth at least its end points, so late followers are almost free
          if (!g.complete && g.kind !== 'field') v = Math.max(v, unfinishedPoints(g) - worth);
          if (inp.level === 1) v -= 1.5;
          options.push({ f, v });
        }
        board.delete(k);
      }
      for (const o of options) {
        const noise = inp.level === 1 ? (rnd() - 0.5) * 5 : rnd() * 0.01;
        const score = base + o.v + noise;
        if (!best || score > best.score) best = { x: spot.x, y: spot.y, r, f: o.f, score };
      }
    }
  }
  if (!best) return null;
  return { x: best.x, y: best.y, r: best.r, f: best.f };
}
