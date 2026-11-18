/**
 * «الدومينو» — dominoes as Moroccan families and cafés play them: the types shared by the server and the
 * app (settings, the view each phone gets), the default settings, the game's card on the home screen and
 * the rule helpers both sides use.
 *
 * A double-six set (28 tiles), 7 tiles each. With 2–3 players the rest is the boneyard «السوق»: a player
 * who can't play draws until they can («اسحب من السوق»; off = pass). With 4 players every tile is dealt,
 * and «فريقان» (on by default) seats partners across the table (seats 1+3 and 2+4).
 *
 * The first round (and a round after a blocked round with a tie) starts with the highest double, played by
 * its holder (nobody holds a double: the heaviest tile). Later rounds: the last round's winner starts with
 * any tile. A tile goes on either open end where its number matches; doubles lie crosswise.
 *
 * The round ends when a player empties their hand («دومينو»), or when nobody can play (blocked): then the
 * lowest pip total wins (teams: the pair's total; a tie for the lowest = nobody scores). The winner (or the
 * winning pair) scores every pip left in the opponents' hands. First to the target (51 / 101 / 151) wins.
 */

/** A tile is `"a-b"` with a ≤ b (0…6). */
export type DominoTileId = string;
export type DominoEnd = 'L' | 'R';

export const DOMINO_TARGETS = [51, 101, 151] as const;
export const DOMINO_TURN_SECONDS = [0, 20, 40] as const;
export const DOMINO_HAND = 7;

export interface DominoSettings {
  /** points to win: 51, 101 or 151 */
  target: number;
  /** 2–3 players: a player who can't play draws from «السوق» (off: they pass) */
  draw: boolean;
  /** 4 players: two pairs, partners sitting across (off: each for themselves) */
  teams: boolean;
  /** seconds per turn: 0 (no limit), 20 or 40 */
  turnSec: number;
}

export const DOMINO_DEFAULTS: DominoSettings = { target: 101, draw: true, teams: true, turnSec: 0 };

/** One tile on the table. `l` faces the line's left end, `r` its right end. */
export interface DominoPlaced {
  id: DominoTileId;
  l: number;
  r: number;
  by: string;
  /** the move's number (the newest tile glides in) */
  seq: number;
}

/** A side: one player, or a pair of partners («A» / «B»). */
export interface DominoSide {
  key: string;
  members: string[];
  score: number;
}

export interface DominoMove {
  seq: number;
  by: string;
  kind: 'play' | 'draw' | 'pass';
  tile?: DominoTileId;
  end?: DominoEnd;
  /** tiles drawn */
  n?: number;
}

export interface DominoRoundResult {
  round: number;
  how: 'domino' | 'blocked';
  /** the winning side's key (null: a blocked round with a tie for the lowest total) */
  winner: string | null;
  /** who emptied their hand, or the winning side's lowest hand in a blocked round */
  by: string | null;
  points: number;
  /** every hand at the end of the round (shown to all: the counting is done openly) */
  hands: Record<string, DominoTileId[]>;
  pips: Record<string, number>;
}

export interface DominoView {
  game: 'domino';
  phase: 'play' | 'roundEnd' | 'final';
  round: number;
  target: number;
  /** the order of play */
  seats: string[];
  teams: boolean;
  sides: DominoSide[];
  line: DominoPlaced[];
  /** the index in `line` of the round's first tile (the snake grows from it both ways) */
  anchor: number;
  /** [left, right] open ends (null: nothing played yet) */
  ends: [number, number] | null;
  myHand: DominoTileId[];
  /** my legal moves right now (empty when it isn't my turn) */
  moves: { tile: DominoTileId; ends: DominoEnd[] }[];
  /** tiles in each hand */
  counts: Record<string, number>;
  boneyard: number;
  drawOn: boolean;
  turn: string | null;
  /** the turn's deadline (null: no limit) */
  deadline: number | null;
  turnSec: number;
  /** the first move of a round that must open with a given tile */
  opening: DominoTileId | null;
  last: DominoMove | null;
  /** the round just over (roundEnd / final) */
  result: DominoRoundResult | null;
  /** every finished round, for the score sheet */
  history: { round: number; winner: string | null; points: number; how: 'domino' | 'blocked' }[];
  /** the next round starts by itself at this time */
  nextAt: number | null;
  /** final: the winning side */
  winner: string | null;
}

export const DOMINO_INFO = {
  title: 'الدومينو',
  tagline: 'ضع قطعك طرفاً بطرف… وأول من يفرغ يده يربح.',
  color: '#2F8F83',
  maxPlayers: 4,
  howTo: [
    '28 قطعة من الدبل صفر إلى الدبل ستة، ولكل لاعب 7 قطع.',
    'يبدأ الجولة الأولى صاحب أعلى دبل، ثم يبدأ كل جولة الفائز بالجولة السابقة بأي قطعة.',
    'ضع قطعة يطابق أحد رقميها رقم أحد الطرفين المفتوحين. الدبل يوضع بالعرض.',
    'مع لاعبين أو ثلاثة: من لا يستطيع اللعب يسحب من «السوق» حتى يجد قطعة مناسبة.',
    'مع أربعة لاعبين: لا سوق، والشريكان متقابلان في وضع «فريقان».',
    'تنتهي الجولة حين يفرغ أحدهم يده، أو حين تُقفل اللعبة فيفوز صاحب أقل مجموع.',
    'للفائز مجموع النقاط الباقية في أيدي الخصوم، والفوز لمن يبلغ الهدف أولاً.',
  ],
};

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

export const tileId = (a: number, b: number): DominoTileId => (a <= b ? `${a}-${b}` : `${b}-${a}`);

/** [low, high] */
export function pipsOf(id: DominoTileId): [number, number] {
  const [a, b] = id.split('-').map(Number);
  return [a, b];
}

export const isDouble = (id: DominoTileId) => {
  const [a, b] = pipsOf(id);
  return a === b;
};

export const tileSum = (id: DominoTileId) => {
  const [a, b] = pipsOf(id);
  return a + b;
};

export const handPips = (hand: readonly DominoTileId[]) => hand.reduce((t, id) => t + tileSum(id), 0);

/** The whole double-six set, in order. */
export const DOMINO_SET: DominoTileId[] = (() => {
  const out: DominoTileId[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) out.push(tileId(a, b));
  return out;
})();

export const isTileId = (v: unknown): v is DominoTileId => typeof v === 'string' && DOMINO_SET.includes(v);

export const fits = (id: DominoTileId, n: number) => {
  const [a, b] = pipsOf(id);
  return a === n || b === n;
};

/** The ends a tile may go on (an empty line: any, said as 'R'). */
export function legalEnds(id: DominoTileId, ends: [number, number] | null): DominoEnd[] {
  if (!ends) return ['R'];
  const out: DominoEnd[] = [];
  if (fits(id, ends[0])) out.push('L');
  if (fits(id, ends[1])) out.push('R');
  return out;
}

/** The tile as it lies once placed at `end`: [l, r] (its matching number faces the line). */
export function orient(id: DominoTileId, end: DominoEnd, ends: [number, number] | null): [number, number] {
  const [a, b] = pipsOf(id);
  if (!ends) return [a, b];
  if (end === 'L') return b === ends[0] ? [a, b] : [b, a];
  return a === ends[1] ? [a, b] : [b, a];
}

/** The open ends after a line of tiles. */
export const endsOf = (line: readonly DominoPlaced[]): [number, number] | null => (line.length ? [line[0].l, line[line.length - 1].r] : null);

/** The highest double in some hands (nobody holds one: the heaviest tile), and who holds it. */
export function openingTile(hands: Record<string, readonly DominoTileId[]>): { by: string; tile: DominoTileId } | null {
  let best: { by: string; tile: DominoTileId; key: number } | null = null;
  for (const [by, hand] of Object.entries(hands)) {
    for (const t of hand) {
      const [a, b] = pipsOf(t);
      // any double beats every other tile; then the sum, then the high number
      const key = (a === b ? 1000 : 0) + (a + b) * 10 + b;
      if (!best || key > best.key) best = { by, tile: t, key };
    }
  }
  return best ? { by: best.by, tile: best.tile } : null;
}
