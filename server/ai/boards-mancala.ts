/**
 * «المنقلة» (Kalah) — the expert bot: negamax (./boards-search.ts) with extra turns (the same side moves
 * again), a transposition table, ordering by extra turn / capture, and an evaluation of the stores plus
 * the seeds still on each side (they are banked by their owner when a side runs dry). A store holding
 * more than half of all seeds is a won game, so the search stops there.
 */
import { mancalaStore } from '../../src/shared/games/mancala';
import { legalPits, sow } from '../mancala-rules';
import { BUDGET, WIN, search, zobrist, type SearchGame } from './boards-search';

const Z = zobrist(14 * 128 + 1, 0x3a3a);

export class Kalah implements SearchGame<number> {
  boards: number[][];
  turns: (0 | 1)[];
  overs: boolean[];
  half: number;

  constructor(board: number[], side: 0 | 1) {
    this.boards = [board.slice()];
    this.turns = [side];
    this.overs = [false];
    this.half = board.reduce((a, b) => a + b, 0) / 2;
  }

  get b() {
    return this.boards[this.boards.length - 1];
  }

  side() {
    return this.turns[this.turns.length - 1];
  }

  moves() {
    return legalPits(this.b, this.side());
  }

  play(p: number) {
    const side = this.side();
    const r = sow(this.b, side, p, false);
    this.boards.push(r.board);
    this.overs.push(r.over);
    this.turns.push(r.extra ? side : side === 0 ? 1 : 0);
  }

  undo() {
    this.boards.pop();
    this.overs.pop();
    this.turns.pop();
  }

  over(ply: number) {
    const b = this.b, me = this.side();
    const mine = b[mancalaStore(me)], theirs = b[mancalaStore(me === 0 ? 1 : 0)];
    if (this.overs[this.overs.length - 1]) return mine > theirs ? WIN - ply : mine < theirs ? -(WIN - ply) : 0;
    if (mine > this.half) return WIN - ply;
    if (theirs > this.half) return -(WIN - ply);
    return null;
  }

  evaluate() {
    const b = this.b, me = this.side(), them = me === 0 ? 1 : 0;
    let side = 0;
    for (let j = 0; j < 6; j++) side += b[me * 7 + j] - b[them * 7 + j];
    return (b[mancalaStore(me)] - b[mancalaStore(them)]) * 4 + side;
  }

  hash() {
    const b = this.b;
    let h = this.side() ? Z[14 * 128] : 0;
    for (let i = 0; i < 14; i++) h ^= Z[i * 128 + Math.min(127, b[i])];
    return h;
  }

  moveKey(p: number) {
    return p;
  }

  orderScore(p: number) {
    const b = this.b, side = this.side();
    const seeds = b[p];
    const store = mancalaStore(side);
    if ((p + seeds) % 13 === store % 13 && seeds < 13) return 100; // ends in our store: another turn
    const land = (p + seeds) % 13;
    const ownSide = side === 0 ? land <= 5 : land >= 7 && land <= 12;
    if (seeds < 13 && ownSide && b[land] === 0 && b[12 - land] > 0) return 50 + b[12 - land];
    return p - side * 7; // otherwise prefer pits nearer the store
  }
}

/** The expert's pit. */
export function mancalaExpert(board: number[], side: 0 | 1, o: { timeMs?: number; maxNodes?: number } = {}): number {
  const g = new Kalah(board, side);
  const r = search(g, { maxDepth: 60, timeMs: o.timeMs ?? BUDGET.expert, maxNodes: o.maxNodes });
  return r ? r.move : legalPits(board, side)[0];
}
