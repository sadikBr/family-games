/**
 * «القطع الملونة» — the rules shared by the server (authority, bots) and the app (ghost preview, hints).
 *
 * Board: n×n cells, cell (r, c) → r·n + c, row 0 at the top, column 0 on the left. A board array holds
 * -1 for an empty cell or the seat index of the colour that covers it.
 *
 * A piece is placed as { piece, t, r, c }: `t` (0..7) is its orientation (bit 2 = mirrored, then
 * t % 4 quarter turns clockwise) and (r, c) is the top-left corner of the oriented piece's bounding box.
 */

/** The 21 free polyominoes (1 + 1 + 2 + 5 + 12), each as [row, col] cells. */
export const PIECES: readonly (readonly [number, number][])[] = [
  [[0, 0]], // 1
  [[0, 0], [0, 1]], // 2
  [[0, 0], [0, 1], [0, 2]], // 3 straight
  [[0, 0], [1, 0], [1, 1]], // 3 corner
  [[0, 0], [0, 1], [0, 2], [0, 3]], // 4 straight
  [[0, 0], [1, 0], [2, 0], [2, 1]], // 4 L
  [[0, 0], [0, 1], [0, 2], [1, 1]], // 4 T
  [[0, 1], [0, 2], [1, 0], [1, 1]], // 4 S
  [[0, 0], [0, 1], [1, 0], [1, 1]], // 4 square
  [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]], // 5 F
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], // 5 straight
  [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], // 5 L
  [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]], // 5 N
  [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]], // 5 P
  [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]], // 5 T
  [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], // 5 U
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], // 5 V
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], // 5 W
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], // 5 X
  [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]], // 5 Y
  [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]], // 5 Z
];

export const PIECE_COUNT = PIECES.length;
export const PIECE_SIZES = PIECES.map((p) => p.length);
export const TOTAL_SQUARES = PIECE_SIZES.reduce((a, b) => a + b, 0);
/** the monomino: placing it last is worth 5 more points */
export const MONO = 0;

export type Cells = [number, number][];

/** Shift cells so the bounding box starts at (0, 0), sorted row by row. */
export function normalize(cells: readonly (readonly [number, number])[]): Cells {
  const r0 = Math.min(...cells.map((x) => x[0]));
  const c0 = Math.min(...cells.map((x) => x[1]));
  return cells.map(([r, c]): [number, number] => [r - r0, c - c0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** The piece in orientation t: mirrored left↔right when t ≥ 4, then (t % 4) quarter turns clockwise. */
export function orient(piece: number, t: number): Cells {
  let cells = PIECES[piece].map(([r, c]): [number, number] => [r, t >= 4 ? -c : c]);
  for (let k = 0; k < t % 4; k++) cells = cells.map(([r, c]): [number, number] => [c, -r]);
  return normalize(cells);
}

const key = (cells: Cells) => cells.map(([r, c]) => `${r},${c}`).join(';');

/** Orientation after a quarter turn clockwise (as seen on screen). */
export const rotateT = (t: number) => (t & 4) | ((t + 1) % 4);
/** Orientation after mirroring left↔right as seen on screen (M·Rᵏ = R⁻ᵏ·M). */
export const flipT = (t: number) => (t & 4 ? 0 : 4) | ((4 - (t % 4)) % 4);

/** The distinct orientations of each piece (1 to 8), with one `t` that gives each. */
export const ORIENTS: readonly { t: number; cells: Cells }[][] = PIECES.map((_, p) => {
  const seen = new Set<string>();
  const out: { t: number; cells: Cells }[] = [];
  for (let t = 0; t < 8; t++) {
    const cells = orient(p, t);
    const k = key(cells);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ t, cells });
  }
  return out;
});

/** Start squares per seat: 2 players on 14×14 near the centre, otherwise the corners of 20×20 (clockwise). */
export function boardSize(players: number) {
  return players === 2 ? 14 : 20;
}

export function startCells(n: number, players: number): number[] {
  if (players === 2) return [4 * n + 4, (n - 5) * n + (n - 5)];
  const corners = [0, n - 1, n * n - 1, (n - 1) * n];
  return corners.slice(0, players);
}

export interface Placement {
  piece: number;
  t: number;
  r: number;
  c: number;
}

export interface Move extends Placement {
  /** board cell indices the piece covers */
  cells: number[];
}

/** Everything the legality check needs about one colour. */
export interface SeatCtx {
  board: readonly number[];
  n: number;
  seat: number;
  /** its start square */
  start: number;
  /** true until the colour's first piece is down */
  first: boolean;
}

export type PlaceError = 'out' | 'taken' | 'edge' | 'corner' | 'start' | 'used';

export const PLACE_ERRORS: Record<PlaceError, string> = {
  out: 'القطعة تخرج من اللوحة',
  taken: 'مربع مشغول',
  edge: 'لا يجوز أن تلمس قطعك من الجانب',
  corner: 'يجب أن تلمس إحدى قطعك من الركن',
  start: 'القطعة الأولى يجب أن تغطي مربع البداية',
  used: 'استعملت هذه القطعة من قبل',
};

/** Does this colour touch cell (r, c) by an edge? */
function edgeOwn(x: SeatCtx, r: number, c: number) {
  const { board, n, seat } = x;
  return (r > 0 && board[(r - 1) * n + c] === seat) || (r < n - 1 && board[(r + 1) * n + c] === seat) || (c > 0 && board[r * n + c - 1] === seat) || (c < n - 1 && board[r * n + c + 1] === seat);
}

/** Does this colour touch cell (r, c) by a corner? */
function cornerOwn(x: SeatCtx, r: number, c: number) {
  const { board, n, seat } = x;
  return (
    (r > 0 && c > 0 && board[(r - 1) * n + c - 1] === seat) ||
    (r > 0 && c < n - 1 && board[(r - 1) * n + c + 1] === seat) ||
    (r < n - 1 && c > 0 && board[(r + 1) * n + c - 1] === seat) ||
    (r < n - 1 && c < n - 1 && board[(r + 1) * n + c + 1] === seat)
  );
}

/** The board cells a placement covers, or null when part of it falls off the board. */
export function placementCells(n: number, p: Placement): number[] | null {
  const out: number[] = [];
  for (const [dr, dc] of orient(p.piece, p.t)) {
    const r = p.r + dr, c = p.c + dc;
    if (r < 0 || c < 0 || r >= n || c >= n) return null;
    out.push(r * n + c);
  }
  return out;
}

/** Why these cells can't be placed (null: they can). */
export function checkCells(x: SeatCtx, cells: readonly number[] | null): PlaceError | null {
  if (!cells) return 'out';
  let corner = false;
  for (const i of cells) {
    if (x.board[i] !== -1) return 'taken';
    const r = Math.floor(i / x.n), c = i % x.n;
    if (edgeOwn(x, r, c)) return 'edge';
    if (!corner && cornerOwn(x, r, c)) corner = true;
  }
  if (x.first) return cells.includes(x.start) ? null : 'start';
  return corner ? null : 'corner';
}

export function checkPlacement(x: SeatCtx, p: Placement): PlaceError | null {
  return checkCells(x, placementCells(x.n, p));
}

/** Empty cells where a new piece of this colour may go: corner-touching and not edge-touching (or the start). */
export function anchors(x: SeatCtx): number[] {
  if (x.first) return x.board[x.start] === -1 ? [x.start] : [];
  const out: number[] = [];
  const { board, n } = x;
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== -1) continue;
    const r = Math.floor(i / n), c = i % n;
    if (cornerOwn(x, r, c) && !edgeOwn(x, r, c)) out.push(i);
  }
  return out;
}

/** Cells where the oriented piece fits with `cell` covered by its k-th square, for each k that works. */
function fitsAt(x: SeatCtx, cells: Cells, at: number, visit: (r: number, c: number) => boolean | void): boolean {
  const n = x.n;
  const ar = Math.floor(at / n), ac = at % n;
  for (const [kr, kc] of cells) {
    const r0 = ar - kr, c0 = ac - kc;
    let ok = true;
    for (const [dr, dc] of cells) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || c < 0 || r >= n || c >= n || x.board[r * n + c] !== -1 || edgeOwn(x, r, c)) {
        ok = false;
        break;
      }
    }
    // covering an anchor already gives the corner contact (or the start square on the first move)
    if (ok && visit(r0, c0) === true) return true;
  }
  return false;
}

/** Every legal placement of the given pieces (deduplicated). */
export function legalMoves(x: SeatCtx, pieces: readonly number[]): Move[] {
  const seen = new Set<number>();
  const out: Move[] = [];
  const n = x.n;
  for (const a of anchors(x)) {
    for (const piece of pieces) {
      for (const o of ORIENTS[piece]) {
        fitsAt(x, o.cells, a, (r, c) => {
          const k = ((piece * 8 + o.t) * 64 + r + 8) * 64 + c + 8;
          if (seen.has(k)) return;
          seen.add(k);
          out.push({ piece, t: o.t, r, c, cells: o.cells.map(([dr, dc]) => (r + dr) * n + c + dc) });
        });
      }
    }
  }
  return out;
}

/** Can this colour place any of these pieces? (stops at the first legal placement) */
export function hasMove(x: SeatCtx, pieces: readonly number[]): boolean {
  for (const a of anchors(x)) {
    for (const piece of pieces) {
      for (const o of ORIENTS[piece]) if (fitsAt(x, o.cells, a, () => true)) return true;
    }
  }
  return false;
}

/** Anchors where at least one of these pieces fits (the app's hint dots). */
export function liveAnchors(x: SeatCtx, pieces: readonly number[]): number[] {
  return anchors(x).filter((a) => pieces.some((piece) => ORIENTS[piece].some((o) => fitsAt(x, o.cells, a, () => true))));
}

/**
 * Where to put the oriented piece when the player taps `at`: a legal spot covering `at` if there is one
 * (the square nearest the piece's middle wins), otherwise the piece centred on `at`, kept on the board.
 */
export function snapPlacement(x: SeatCtx, piece: number, t: number, at: number): { r: number; c: number } {
  const cells = orient(piece, t);
  const h = Math.max(...cells.map((q) => q[0])) + 1;
  const w = Math.max(...cells.map((q) => q[1])) + 1;
  const n = x.n;
  const ar = Math.floor(at / n), ac = at % n;
  let best: { r: number; c: number; d: number } | null = null;
  for (const [kr, kc] of cells) {
    const r = ar - kr, c = ac - kc;
    const cand = placementCells(n, { piece, t, r, c });
    if (checkCells(x, cand)) continue;
    const d = Math.abs(kr - (h - 1) / 2) + Math.abs(kc - (w - 1) / 2);
    if (!best || d < best.d) best = { r, c, d };
  }
  if (best) return { r: best.r, c: best.c };
  const r = Math.max(0, Math.min(n - h, ar - Math.floor((h - 1) / 2)));
  const c = Math.max(0, Math.min(n - w, ac - Math.floor((w - 1) / 2)));
  return { r, c };
}

/** Bounding box size of an oriented piece. */
export function pieceBox(piece: number, t: number) {
  const cells = orient(piece, t);
  return { h: Math.max(...cells.map((q) => q[0])) + 1, w: Math.max(...cells.map((q) => q[1])) + 1 };
}

/** Official advanced scoring: −1 per square left; +15 for placing every piece, +5 more if the 1-square went last. */
export function scoreOf(left: readonly number[], lastPiece: number | null) {
  const squares = left.reduce((a, p) => a + PIECE_SIZES[p], 0);
  const bonus = left.length === 0 ? 15 + (lastPiece === MONO ? 5 : 0) : 0;
  return { squares, bonus, total: bonus - squares };
}
