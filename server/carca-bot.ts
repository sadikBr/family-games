/**
 * «المدن والطرق» — the bots. «سهل» is the previous bot (server/carca-bot-easy.ts); «ذكي» and «خبير»
 * evaluate every legal spot, rotation and follower choice of the drawn tile like this:
 *
 * - Every feature with followers is worth, to the players holding its majority, its expected final
 *   points: P(complete) × its points when complete (it grows by at least one tile per open cell) +
 *   (1 − P) × its end-of-game points. P comes from the tiles still to draw (public: 71 minus what is on
 *   the board and what was discarded): for each empty cell the feature still needs, how many of those
 *   tiles fit the cell's sides and close the feature there, and how many draws the owners get before the
 *   end. A cell no remaining tile fits is dead: that feature can never be finished — the bot avoids
 *   investing in such features and gladly kills an opponent's big city or monastery that way.
 *   Monasteries count their expected neighbours; farms 3 per city they touch × that city's P.
 * - Only features touched by the new tile (joined, or whose open cells' sides change) are re-evaluated;
 *   the move's worth is the change of (my expected points − the best and the average opponent's).
 * - A follower in hand is worth more early and when few are left, almost nothing in the last turns (so
 *   the last followers go on unfinished features for their end points, and farmers come late); a feature
 *   that completes gives its followers back. Joining an opponent's feature to share or steal the majority
 *   falls out of the same sums.
 * «ذكي» counts less precisely (no dead cells, a little noise).
 */
import type { CarcaFollower, CarcaTilePlaced } from '../src/shared/games/carca';
import type { BotLevel } from '../src/shared/protocol';
import {
  DX,
  DY,
  TILES,
  TOTAL_TILES,
  edgeAt,
  facingPort,
  featureAt,
  groupOf,
  key,
  legalSpots,
  majority,
  makeBoard,
  makePile,
  memberKey,
  type Board,
  type Edge,
  type Group,
  type Member,
} from '../src/shared/carca-tiles';
import * as easy from './carca-bot-easy';

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
  /** the room's bot level (1 / 2: the old per-game setting, read as easy / expert) */
  level: BotLevel | 1 | 2;
  /** false: just the best spot (time-outs) */
  withFollower: boolean;
  /** the tiles still in the pile, in any order (public: all tiles minus the board and the discards) */
  remaining?: string[];
  random?: () => number;
}

export interface BotMove {
  x: number;
  y: number;
  r: number;
  f: number | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Tile types with their count still to draw. */
function remainingCounts(inp: BotInput): Map<string, number> {
  const out = new Map<string, number>();
  if (inp.remaining) {
    for (const t of inp.remaining) out.set(t, (out.get(t) ?? 0) + 1);
    return out;
  }
  // no pile given (tests): everything not on the board, minus the drawn tile
  for (const t of makePile()) out.set(t, (out.get(t) ?? 0) + 1);
  out.set('D', (out.get('D') ?? 0) + 1);
  for (const p of inp.board) out.set(p.t, Math.max(0, (out.get(p.t) ?? 0) - 1));
  out.set(inp.tile, Math.max(0, (out.get(inp.tile) ?? 0) - 1));
  return out;
}

interface Ctx {
  board: Board;
  counts: [string, number][];
  total: number;
  tilesLeft: number;
  np: number;
  precise: boolean;
  /** cell statistics by the cell's sides (and the sides a feature enters by) */
  cells: Map<string, { fit: number; close: number }>;
}

/** The edge each side of an empty cell must have ('' = no neighbour). */
function sidesOf(board: Board, x: number, y: number): (Edge | '')[] {
  const out: (Edge | '')[] = ['', '', '', ''];
  for (let d = 0; d < 4; d++) {
    const nb = board.get(key(x + DX[d], y + DY[d]));
    if (nb) out[d] = edgeAt(nb.t, nb.r, (d + 2) % 4);
  }
  return out;
}

/** How many remaining tiles fit an empty cell, and how many of those also close a feature entering by `entry`. */
function cellStats(c: Ctx, x: number, y: number, entry: number[], kind: 'city' | 'road' | 'any'): { fit: number; close: number } {
  const sides = sidesOf(c.board, x, y);
  const sig = `${sides.join('')}|${entry.join('')}|${kind}`;
  const hit = c.cells.get(sig);
  if (hit) return hit;
  let fit = 0;
  let close = 0;
  for (const [t, n] of c.counts) {
    let fitsAny = false;
    let closesAny = false;
    for (let r = 0; r < 4; r++) {
      let ok = true;
      for (let d = 0; d < 4 && ok; d++) if (sides[d] && edgeAt(t, r, d) !== sides[d]) ok = false;
      if (!ok) continue;
      fitsAny = true;
      if (kind === 'any') continue;
      // the features of this tile facing the entries must reach only sides with a neighbour
      const placed = { x, y, t, r };
      let closes = true;
      for (const d of entry) {
        const f = featureAt(placed, d * 3 + 1);
        if (f < 0) {
          closes = false;
          break;
        }
        for (const lp of TILES[t].feats[f].ports) {
          const side = Math.floor(((lp + 3 * r) % 12) / 3);
          if (!sides[side]) {
            closes = false;
            break;
          }
        }
        if (!closes) break;
      }
      if (closes) closesAny = true;
      if (closesAny) break;
    }
    if (fitsAny) fit += n;
    if (closesAny) close += n;
  }
  const res = { fit, close };
  c.cells.set(sig, res);
  return res;
}

type Cells = Map<string, { x: number; y: number; sides: number[] }>;

/** A connected feature, as the bot needs it. */
interface Feat {
  kind: Group['kind'];
  id: string;
  tiles: number;
  pennants: number;
  owners: string[];
  /** empty cells it borders, with the sides it enters each by (monastery: the empty cells around it) */
  cells: Cells;
  /** fields: the city features they touch */
  cityRefs: Member[];
  complete: boolean;
}

interface Eval {
  /** expected final points for the majority */
  ev: number;
  /** chance it gets completed */
  p: number;
}

/** The empty cells a road, city or field borders, with the sides it enters each by. */
function openCells(board: Board, g: Group): Cells {
  const out: Cells = new Map();
  if (g.kind === 'monastery') {
    const m = g.members[0];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = key(m.x + dx, m.y + dy);
        if ((dx || dy) && !board.has(k)) out.set(k, { x: m.x + dx, y: m.y + dy, sides: [] });
      }
    }
    return out;
  }
  for (const m of g.members) {
    const pl = board.get(key(m.x, m.y))!;
    for (const lp of TILES[pl.t].feats[m.f].ports) {
      const wp = (lp + 3 * pl.r) % 12;
      const side = Math.floor(wp / 3);
      addCell(out, board, m.x + DX[side], m.y + DY[side], (side + 2) % 4);
    }
  }
  return out;
}

function addCell(out: Cells, board: Board, x: number, y: number, from: number) {
  const k = key(x, y);
  if (board.has(k)) return;
  let cell = out.get(k);
  if (!cell) out.set(k, (cell = { x, y, sides: [] }));
  if (!cell.sides.includes(from)) cell.sides.push(from);
}

/** Chance that one cell gets a tile that helps, over `m` draws. */
function cellChance(c: Ctx, st: { fit: number; close: number }, m: number): number {
  if (!c.total || m <= 0) return 0;
  if (c.precise && st.fit === 0) return 0;
  const helpful = c.precise ? st.close + 0.1 * (st.fit - st.close) : Math.max(1, st.fit) * 0.55;
  const q = clamp(helpful / c.total, 0, 1);
  return 1 - Math.pow(1 - q, m);
}

/** Expected final points of a feature held by `owners` players (0: nobody, for the cities of a farm). */
function evaluate(c: Ctx, g: Feat, owners: number): Eval {
  // the owners can't spend every draw on it: a fraction of their turns, split over the cells it needs
  const share = (owners ? Math.min(1, owners / c.np + 0.1) : 0.12) * 0.15;
  if (g.kind === 'monastery') {
    if (g.complete) return { ev: 9, p: 1 };
    let exp = g.tiles;
    let p = 1;
    for (const cell of g.cells.values()) {
      // anyone may fill a cell next to a monastery
      const f = cellChance(c, cellStats(c, cell.x, cell.y, [], 'any'), c.tilesLeft * 0.3);
      exp += f;
      p *= f;
    }
    return { ev: exp + p * 0.5, p };
  }
  if (g.kind === 'field') return { ev: 0, p: 0 };
  if (g.complete) return { ev: g.kind === 'road' ? g.tiles : 2 * g.tiles + 2 * g.pennants, p: 1 };
  const n = g.cells.size;
  const m = (c.tilesLeft * share) / Math.pow(Math.max(1, n), 0.7);
  let p = 1;
  for (const cell of g.cells.values()) {
    p *= cellChance(c, cellStats(c, cell.x, cell.y, cell.sides.slice().sort(), g.kind as 'city' | 'road'), m);
    if (!p) break;
  }
  // never count on it: an unfinished feature holds a follower until it is done
  p = Math.min(p, 0.8);
  const done = g.kind === 'road' ? g.tiles + n : 2 * (g.tiles + n + 0.25 * n) + 2 * g.pennants;
  const grow = c.tilesLeft > 0 ? 0.4 * Math.min(n, (c.tilesLeft / c.np) * 0.5) : 0;
  const left = (g.kind === 'road' ? g.tiles : g.tiles + g.pennants) + grow;
  return { ev: p * done + (1 - p) * left, p };
}

/** What keeping one follower in hand is worth now. */
function followerWorth(supply: number, tilesLeft: number, np: number): number {
  const frac = tilesLeft / (TOTAL_TILES - 1);
  const turns = tilesLeft / np;
  if (turns < 1) return 0;
  if (supply - 1 >= turns) return 0.15;
  const scarce = supply <= 1 ? 2.6 : supply <= 2 ? 1.7 : supply <= 3 ? 1.25 : 1;
  return (0.4 + 4.2 * frac) * scarce * Math.min(1, turns / 4) * 1.2;
}

export function planMove(inp: BotInput): BotMove | null {
  const level: BotLevel = inp.level === 1 ? 'easy' : inp.level === 2 ? 'expert' : inp.level;
  if (level === 'easy') return easy.planMove({ ...inp, level: 1 });
  const rnd = inp.random ?? Math.random;
  const base = makeBoard(inp.board);
  const board = makeBoard(inp.board);
  const spots = legalSpots(board, inp.tile);
  if (!spots.length) return null;
  const np = Math.max(1, inp.order.length);
  const counts = remainingCounts(inp);
  const c: Ctx = {
    board,
    counts: [...counts].filter(([, n]) => n > 0),
    total: [...counts.values()].reduce((a, b) => a + b, 0),
    tilesLeft: inp.tilesLeft,
    np,
    precise: level === 'expert',
    cells: new Map(),
  };
  const opps = inp.order.filter((p) => p !== inp.me);
  const active = new Set(inp.order);
  const byMember = new Map<string, CarcaFollower>();
  for (const f of inp.followers) byMember.set(memberKey(f), f);
  const worthBack = followerWorth(inp.supply + 1, inp.tilesLeft, np);
  const worth = followerWorth(inp.supply, inp.tilesLeft, np);

  // every feature of the board before the tile goes down, walked once
  const baseIdx = new Map<string, Feat>();
  const baseOf = (x: number, y: number, f: number): Feat => {
    const mk = `${x},${y},${f}`;
    let hit = baseIdx.get(mk);
    if (hit) return hit;
    const g = groupOf(base, x, y, f);
    const owners = g.members.map((m) => byMember.get(memberKey(m))?.owner).filter((o): o is string => !!o);
    hit = { kind: g.kind, id: g.id, tiles: g.tiles, pennants: g.pennants, owners, cells: openCells(base, g), cityRefs: g.cityRefs, complete: g.complete };
    for (const m of g.members) baseIdx.set(memberKey(m), hit);
    return hit;
  };

  /** The value of a feature with followers, per player, plus the empty cells it depends on. */
  interface Held {
    g: Feat;
    val: Record<string, number>;
    watch: Set<string>;
  }
  const valueOf = (g: Feat, cityOf: (ref: Member) => Feat, cityP: Map<Feat, number>): Held => {
    const val: Record<string, number> = {};
    const maj = majority(g.owners).filter((o) => active.has(o));
    const watch = new Set(g.cells.keys());
    let e: Eval;
    if (g.kind === 'field') {
      e = fieldValue(g, cityOf, cityP, watch);
    } else e = evaluate(c, g, maj.length);
    for (const o of maj) val[o] = e.ev;
    // followers come back when it completes (worth something only to me here)
    const mine = g.owners.filter((o) => o === inp.me).length;
    if (mine && g.kind !== 'field') val[inp.me] = (val[inp.me] ?? 0) + mine * worthBack * (g.complete ? 1 : e.p * 0.5);
    return { g, val, watch };
  };
  /** A farm: 3 per city it touches, by the chance each city is completed. */
  const fieldValue = (g: Feat, cityOf: (ref: Member) => Feat, cityP: Map<Feat, number>, watch?: Set<string>): Eval => {
    let ev = 0;
    const known = new Set<Feat>();
    for (const ref of g.cityRefs) {
      const city = cityOf(ref);
      if (known.has(city)) continue;
      known.add(city);
      let p = cityP.get(city);
      if (p === undefined) {
        p = city.complete ? 1 : evaluate(c, city, majority(city.owners).length).p;
        cityP.set(city, p);
      }
      ev += 3 * p;
      if (watch) for (const k of city.cells.keys()) watch.add(k);
    }
    // the field may still reach more cities
    ev += Math.min(3, g.cells.size / 3) * (c.tilesLeft / (TOTAL_TILES - 1));
    return { ev, p: 0 };
  };

  // the features with followers now
  const before: Held[] = [];
  const baseCityP = new Map<Feat, number>();
  const baseCity = (ref: Member) => baseOf(ref.x, ref.y, ref.f);
  for (const f of inp.followers) {
    const g = baseOf(f.x, f.y, f.f);
    if (before.some((h) => h.g === g)) continue;
    if (g.kind === 'field' && !inp.farmers) continue;
    before.push(valueOf(g, baseCity, baseCityP));
  }

  const scalar = (d: Record<string, number>) => {
    const mine = d[inp.me] ?? 0;
    if (!opps.length) return mine;
    const vals = opps.map((o) => d[o] ?? 0);
    return mine - 0.5 * Math.max(...vals) - (0.5 * vals.reduce((a, b) => a + b, 0)) / vals.length;
  };

  const type = TILES[inp.tile];
  const canFollow = inp.withFollower && inp.supply > 0;
  let best: (BotMove & { score: number }) | null = null;
  for (const spot of spots) {
    const k = key(spot.x, spot.y);
    const touched = new Set([k, ...[0, 1, 2, 3].map((d) => key(spot.x + DX[d], spot.y + DY[d]))]);
    for (const r of spot.rs) {
      board.set(k, { x: spot.x, y: spot.y, t: inp.tile, r });
      // the tile's features, each joined with the features it touches (features meeting the same piece merge)
      const parts: Feat[][] = [];
      const own: Cells[] = [];
      type.feats.forEach((feat, f) => {
        const ps: Feat[] = [];
        const cells: Cells = new Map();
        if (feat.k === 'monastery') {
          parts.push(ps);
          own.push(openCells(board, { kind: 'monastery', members: [{ x: spot.x, y: spot.y, f }] } as Group));
          return;
        }
        for (const lp of feat.ports) {
          const wp = (lp + 3 * r) % 12;
          const side = Math.floor(wp / 3);
          const nx = spot.x + DX[side];
          const ny = spot.y + DY[side];
          const nb = board.get(key(nx, ny));
          if (nb) {
            const b = baseOf(nx, ny, featureAt(nb, facingPort(wp)));
            if (!ps.includes(b)) ps.push(b);
          } else addCell(cells, board, nx, ny, (side + 2) % 4);
        }
        parts.push(ps);
        own.push(cells);
      });
      const n = type.feats.length;
      const root = Array.from({ length: n }, (_, i) => i);
      const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (parts[i].some((p) => parts[j].includes(p))) root[find(j)] = find(i);
      const merged = new Map<number, Feat>();
      const featOf: Feat[] = [];
      const replaced = new Map<Feat, Feat>();
      for (let i = 0; i < n; i++) {
        const ri = find(i);
        const feat = type.feats[i];
        let m = merged.get(ri);
        if (!m) {
          m = { kind: feat.k, id: `${spot.x},${spot.y},${ri}`, tiles: 1, pennants: 0, owners: [], cells: new Map(), cityRefs: [], complete: false };
          merged.set(ri, m);
        }
        if (feat.pennant) m.pennants++;
        if (feat.cities) for (const ci of feat.cities) m.cityRefs.push({ x: spot.x, y: spot.y, f: ci });
        for (const [ck, cell] of own[i]) {
          const cur = m.cells.get(ck);
          if (!cur) m.cells.set(ck, { x: cell.x, y: cell.y, sides: cell.sides.slice() });
          else for (const sd of cell.sides) if (!cur.sides.includes(sd)) cur.sides.push(sd);
        }
        for (const p of parts[i]) {
          if (replaced.has(p)) continue;
          replaced.set(p, m);
          m.tiles += p.tiles;
          m.pennants += p.pennants;
          m.owners.push(...p.owners);
          m.cityRefs.push(...p.cityRefs);
          for (const [ck, cell] of p.cells) {
            if (ck === k) continue;
            const cur = m.cells.get(ck);
            if (!cur) m.cells.set(ck, { x: cell.x, y: cell.y, sides: cell.sides.slice() });
            else for (const sd of cell.sides) if (!cur.sides.includes(sd)) cur.sides.push(sd);
          }
        }
        featOf[i] = m;
      }
      for (const m of merged.values()) {
        if (m.kind === 'monastery') m.tiles = 9 - m.cells.size;
        m.complete = m.kind !== 'field' && m.cells.size === 0;
      }
      // a city reference now: the merged feature if the tile joined it
      const cityOf = (ref: Member): Feat => {
        if (ref.x === spot.x && ref.y === spot.y) return featOf[ref.f];
        const b = baseOf(ref.x, ref.y, ref.f);
        return replaced.get(b) ?? b;
      };
      const cityP = new Map<Feat, number>();
      for (const [city, p] of baseCityP) {
        if (replaced.has(city)) continue;
        let hit = false;
        for (const w of city.cells.keys()) if (touched.has(w)) hit = true;
        if (!hit) cityP.set(city, p);
      }

      const delta: Record<string, number> = {};
      const add = (vec: Record<string, number>, sign: number) => {
        for (const [p, v] of Object.entries(vec)) delta[p] = (delta[p] ?? 0) + sign * v;
      };
      const free: { f: number; g: Feat }[] = [];
      const counted = new Set<Feat>();
      for (let i = 0; i < n; i++) {
        const m = featOf[i];
        if (m.kind === 'field' && !inp.farmers) continue;
        if (!m.owners.length) {
          if (canFollow) free.push({ f: i, g: m });
          continue;
        }
        if (counted.has(m)) continue;
        counted.add(m);
        add(valueOf(m, cityOf, cityP).val, 1);
      }
      // features with followers: joined by the tile, or whose cells (or cities' cells) changed
      for (const h of before) {
        if (replaced.has(h.g)) {
          add(h.val, -1);
          continue;
        }
        let hit = false;
        for (const w of h.watch) if (touched.has(w)) hit = true;
        if (!hit && h.g.kind === 'field') for (const ref of h.g.cityRefs) if (replaced.has(baseOf(ref.x, ref.y, ref.f))) hit = true;
        if (!hit) continue;
        add(h.val, -1);
        // the same feature, its cells seen from the new board
        const g = h.g.kind === 'monastery' || h.g.cells.has(k) ? { ...h.g, cells: new Map([...h.g.cells].filter(([ck]) => ck !== k)) } : h.g;
        if (g.kind === 'monastery') g.tiles = 9 - g.cells.size;
        if (g.kind === 'monastery') g.complete = g.cells.size === 0;
        add(valueOf(g, cityOf, cityP).val, 1);
      }

      let neighbours = 0;
      for (let d = 0; d < 4; d++) if (board.has(key(spot.x + DX[d], spot.y + DY[d]))) neighbours++;
      const score0 = scalar(delta) + 0.03 * neighbours;
      const options: { f: number | null; v: number }[] = [{ f: null, v: 0 }];
      for (const { f, g } of free) {
        let v: number;
        if (g.kind === 'field') {
          v = fieldValue(g, cityOf, cityP).ev * 0.85 - worth * 1.5;
        } else {
          const e = evaluate(c, g, 1);
          v = e.ev - worth + (g.complete ? worthBack : e.p * 0.5 * worthBack);
        }
        options.push({ f, v });
      }
      board.delete(k);
      for (const o of options) {
        const noise = level === 'smart' ? (rnd() - 0.5) * 1.5 : rnd() * 0.001;
        const score = score0 + o.v + noise;
        if (!best || score > best.score) best = { x: spot.x, y: spot.y, r, f: o.f, score };
      }
    }
  }
  if (!best) return null;
  return { x: best.x, y: best.y, r: best.r, f: best.f };
}
