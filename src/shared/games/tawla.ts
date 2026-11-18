/**
 * «الطاولة» — backgammon for two: the types shared by the server and the app, the default settings, the
 * game's card on the home screen, and the rules (move generation) used by the server and its bots.
 *
 * Coordinates: each side counts the points from its own home: point 1 is the deepest point of its home
 * board, point 24 the farthest, 25 is the bar and 0 is «off» (borne off). A side's checkers move from 24
 * down to 1 and then off. Point p of one side is point 25 − p of the other.
 * A position is two arrays of 26 counts, one per side, each in that side's own numbering:
 * `pos[s][0]` = borne off, `pos[s][1..24]` = on the points, `pos[s][25]` = on the bar.
 */

export type TawlaSide = 0 | 1;
export type TawlaPos = [number[], number[]];

export const TAWLA_MATCH = [1, 3, 5, 7] as const;

export interface TawlaSettings {
  /** points to win the match (a single game = 1, «مارس» = 2, «مارس كبير» = 3) */
  match: number;
}

export const TAWLA_DEFAULTS: TawlaSettings = { match: 3 };

/** One checker moved by one die. `from` 25 = from the bar, `to` 0 = borne off. */
export interface TawlaStep {
  from: number;
  to: number;
  die: number;
}

/** Where a checker on `from` can go this turn: one die or several dice in a row (one checker). */
export interface TawlaTarget {
  from: number;
  to: number;
  dice: number[];
}

/** 1 = a single game, 2 = «مارس» (gammon), 3 = «مارس كبير» (backgammon). */
export type TawlaWinKind = 1 | 2 | 3;

export interface TawlaLast {
  /** a new value = a new move to animate */
  seq: number;
  /** who moved (absolute side) */
  side: TawlaSide;
  /** the checker's way in the VIEWER's numbering (see TawlaView.near): start, every landing; 25 = the mover's bar, 0 = off */
  path: number[];
  /** points (viewer's numbering) where a lone checker of the other side was hit and went to the bar */
  hits: number[];
}

export interface TawlaView {
  game: 'tawla';
  /**
   * opening: each player rolls one die (the higher starts with both values) · roll: the player on turn
   * rolls · move: moving checkers · between: a game of the match is over (the next one starts soon) · final
   */
  phase: 'opening' | 'roll' | 'move' | 'between' | 'final';
  /** [side 0 (light checkers), side 1 (dark checkers)] */
  seats: [string, string];
  mySide: TawlaSide | null;
  /** the side drawn at the bottom: mine (side 0 for someone watching). Every board field below is from its point of view */
  near: TawlaSide;
  /** points[p − 1] = checkers on point p of `near`: > 0 near's, < 0 the other side's */
  points: number[];
  /** [near, far] */
  bar: [number, number];
  off: [number, number];
  pips: [number, number];
  /** absolute side on turn */
  turn: TawlaSide;
  /** the opening roll: each side's die (absolute sides), null = not rolled yet */
  opening: [number | null, number | null];
  /** the opening dice were equal: this value (shown while both roll again) */
  openTie: number | null;
  /** the current roll (two values) */
  dice: number[] | null;
  /** dice still to play this turn */
  left: number[];
  /** a new value = new dice thrown */
  rollId: number;
  /** where my checkers can go now (empty when it isn't my move) */
  targets: TawlaTarget[];
  canUndo: boolean;
  /** my turn is complete: «تمّ» confirms it (it also confirms itself after a short pause) */
  canDone: boolean;
  /** the dice can't be played (or no die is left): the turn passes at `timerAt` */
  stuck: boolean;
  /** when the current pause ends (server time): the turn confirms/passes, the next game starts */
  timerAt: number | null;
  last: TawlaLast | null;
  /** points to win the match */
  match: number;
  /** match points so far, by player id */
  points2: Record<string, number>;
  /** game number in the match (1, 2, …) */
  gameNo: number;
  /** the game that just ended (between games and at the end) */
  gameResult: { winner: TawlaSide; kind: TawlaWinKind } | null;
  /** players ready for the next game */
  ready: string[];
  /** match winner (absolute side) */
  winner: TawlaSide | null;
  reason: 'points' | 'forfeit' | null;
  /** matches won in this series (same two players in this room) */
  score: Record<string, number>;
}

export const TAWLA_INFO = {
  title: 'الطاولة',
  tagline: 'النرد والحجارة: أدخل حجارتك الخمسة عشر إلى البيت قبل خصمك.',
  color: '#9A6233',
  maxPlayers: 2,
  howTo: [
    'لكل لاعب ١٥ حجراً تدور حول اللوحة نحو بيته (الربع الأيمن السفلي على هاتفك)، ثم تخرج منها.',
    'في البداية يرمي كل لاعب حجر نرد واحداً، وصاحب الرقم الأكبر يبدأ بالرقمين معاً.',
    'كل رقم في النرد حركة لحجر: اضغط حجراً فتضيء الأماكن الممكنة، ثم اضغط المكان. الزوج (مثل ٤ و٤) يعني أربع حركات.',
    'لا تنزل على نقطة فيها حجران أو أكثر للخصم. الحجر الوحيد مكشوف: إن نزل عليه الخصم ذهب إلى الوسط (البار).',
    'الحجر الذي في الوسط يدخل أولاً من بيت الخصم قبل أي حركة أخرى.',
    'يجب لعب الرقمين إن أمكن، وإن أمكن رقم واحد فقط فالأكبر.',
    'حين تصل حجارتك الخمسة عشر إلى بيتك تبدأ بإخراجها: بالرقم نفسه، أو برقم أكبر من أبعد حجر.',
    'الفوز بالجولة نقطة، و«مارس» نقطتان إن لم يُخرج الخصم أي حجر، و«مارس كبير» ثلاث إن بقي له حجر في الوسط أو في بيتك.',
    'يمكن التراجع عن حركات الدور قبل «تمّ».',
  ],
};

/* ------------------------------------------------------------------ rules ------------------------------------------------------------------ */

/** The starting position, one side: 2 on point 24, 5 on 13, 3 on 8, 5 on 6. */
export function tawlaStartSide(): number[] {
  const a = new Array(26).fill(0);
  a[24] = 2;
  a[13] = 5;
  a[8] = 3;
  a[6] = 5;
  return a;
}

export const tawlaStart = (): TawlaPos => [tawlaStartSide(), tawlaStartSide()];

export const clonePos = (p: TawlaPos): TawlaPos => [p[0].slice(), p[1].slice()];

/** Pips a side still has to travel (bar = 25). */
export function pipCount(side: number[]): number {
  let n = 0;
  for (let p = 1; p <= 25; p++) n += p * side[p];
  return n;
}

/** All of a side's checkers are in its home board (or off): it may bear off. */
export function allHome(me: number[]): boolean {
  for (let p = 7; p <= 25; p++) if (me[p]) return false;
  return true;
}

/** The single steps a die allows (no "must use both dice" filtering). */
export function stepsForDie(pos: TawlaPos, s: TawlaSide, die: number): TawlaStep[] {
  const me = pos[s], op = pos[1 - s];
  if (me[25] > 0) {
    const to = 25 - die;
    return op[die] >= 2 ? [] : [{ from: 25, to, die }];
  }
  const out: TawlaStep[] = [];
  const home = allHome(me);
  let highest = 0;
  if (home) for (let p = 6; p >= 1; p--) if (me[p]) { highest = p; break; }
  for (let f = 24; f >= 1; f--) {
    if (!me[f]) continue;
    const to = f - die;
    if (to >= 1) {
      if (op[25 - to] < 2) out.push({ from: f, to, die });
    } else if (home && (to === 0 || f === highest)) out.push({ from: f, to: 0, die });
  }
  return out;
}

/** Play one step in place; returns true when it hit a lone checker of the other side. */
export function applyStep(pos: TawlaPos, s: TawlaSide, st: TawlaStep): boolean {
  const me = pos[s], op = pos[1 - s];
  me[st.from] -= 1;
  if (st.to === 0) {
    me[0] += 1;
    return false;
  }
  me[st.to] += 1;
  const q = 25 - st.to;
  if (op[q] === 1) {
    op[q] = 0;
    op[25] += 1;
    return true;
  }
  return false;
}

/** Undo `applyStep` (in place). */
function unapplyStep(pos: TawlaPos, s: TawlaSide, st: TawlaStep, hit: boolean) {
  const me = pos[s], op = pos[1 - s];
  me[st.from] += 1;
  if (st.to === 0) {
    me[0] -= 1;
    return;
  }
  me[st.to] -= 1;
  if (hit) {
    op[25 - st.to] = 1;
    op[25] -= 1;
  }
}

const removeOne = (left: number[], die: number) => {
  const i = left.indexOf(die);
  return i < 0 ? left.slice() : [...left.slice(0, i), ...left.slice(i + 1)];
};
const distinct = (left: number[]) => [...new Set(left)];

/** The most dice that can be played from here with `left`. */
export function maxPlayable(pos: TawlaPos, s: TawlaSide, left: number[]): number {
  if (!left.length || pos[s][0] === 15) return 0;
  let best = 0;
  for (const d of distinct(left)) {
    for (const st of stepsForDie(pos, s, d)) {
      const hit = applyStep(pos, s, st);
      const n = 1 + maxPlayable(pos, s, removeOne(left, d));
      unapplyStep(pos, s, st, hit);
      if (n > best) best = n;
      if (best === left.length) return best;
    }
  }
  return best;
}

/**
 * The single steps allowed now: each must start a sequence that plays as many dice as possible; when only
 * one of two different dice can be played, it must be the larger one if that one can be played.
 */
export function legalSteps(pos: TawlaPos, s: TawlaSide, left: number[]): TawlaStep[] {
  if (!left.length || pos[s][0] === 15) return [];
  const best = maxPlayable(pos, s, left);
  if (!best) return [];
  const out: TawlaStep[] = [];
  for (const d of distinct(left)) {
    for (const st of stepsForDie(pos, s, d)) {
      const hit = applyStep(pos, s, st);
      const n = 1 + maxPlayable(pos, s, removeOne(left, d));
      unapplyStep(pos, s, st, hit);
      if (n === best) out.push(st);
    }
  }
  if (best === 1 && left.length === 2 && left[0] !== left[1]) {
    const big = Math.max(...left);
    if (out.some((st) => st.die === big)) return out.filter((st) => st.die === big);
  }
  return out;
}

export { removeOne as tawlaRemoveDie };

/** A step chain for one checker: the steps and the points where it hit. */
export interface TawlaChain {
  steps: TawlaStep[];
  hits: number;
}

/**
 * Every destination a checker can reach this turn, using one die or several in a row (each intermediate
 * landing has to be a legal step at that moment). For one (from, to) the chain with the fewest dice wins,
 * then the one that hits the most, then the smaller dice.
 */
export function tawlaChains(pos: TawlaPos, s: TawlaSide, left: number[]): Map<string, TawlaChain> {
  const out = new Map<string, TawlaChain & { from: number; to: number }>();
  const better = (a: TawlaChain, b: TawlaChain) =>
    a.steps.length !== b.steps.length ? a.steps.length < b.steps.length : a.hits !== b.hits ? a.hits > b.hits : a.steps[0].die < b.steps[0].die;
  const walk = (p: TawlaPos, l: number[], at: number, origin: number, steps: TawlaStep[], hits: number) => {
    for (const st of legalSteps(p, s, l)) {
      if (st.from !== at) continue;
      const q = clonePos(p);
      const hit = applyStep(q, s, st);
      const chain = { from: origin, to: st.to, steps: [...steps, st], hits: hits + (hit ? 1 : 0) };
      const key = `${origin}>${st.to}`;
      const old = out.get(key);
      if (!old || better(chain, old)) out.set(key, chain);
      // keep going with the same checker (not off the board, not out of the bar while others wait there)
      if (st.to > 0 && l.length > 1) walk(q, removeOne(l, st.die), st.to, origin, chain.steps, chain.hits);
    }
  };
  const starts = new Set(legalSteps(pos, s, left).map((st) => st.from));
  for (const f of starts) walk(pos, left, f, f, [], 0);
  return out;
}

export function tawlaTargets(pos: TawlaPos, s: TawlaSide, left: number[]): TawlaTarget[] {
  return [...tawlaChains(pos, s, left).values()].map((c) => ({ from: c.steps[0].from, to: c.steps[c.steps.length - 1].to, dice: c.steps.map((st) => st.die) }));
}

/** The dice a roll gives: four moves for a double. */
export const diceToPlay = (d: number[]) => (d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]]);

/**
 * How a game won by `w` scores: «مارس كبير» (3) if the loser has borne off nothing and still has a
 * checker on the bar or in the winner's home board, «مارس» (2) if the loser has borne off nothing, else 1.
 */
export function winKind(pos: TawlaPos, w: TawlaSide): TawlaWinKind {
  const lo = pos[1 - w];
  if (lo[0] > 0) return 1;
  for (let p = 19; p <= 25; p++) if (lo[p]) return 3;
  return 2;
}

/**
 * Every distinct end position of the turn with one move sequence reaching it (the bots choose among
 * them). Sequences play as many dice as possible (the larger die when only one can be played).
 */
export function allSequences(pos: TawlaPos, s: TawlaSide, left: number[]): { steps: TawlaStep[]; pos: TawlaPos }[] {
  const seen = new Map<string, { steps: TawlaStep[]; pos: TawlaPos }>();
  const work = clonePos(pos);
  const best = maxPlayable(work, s, left);
  if (!best) return [{ steps: [], pos: work }];
  let firstDice: number[] | null = null;
  if (best === 1 && left.length === 2 && left[0] !== left[1]) {
    const big = Math.max(...left);
    firstDice = stepsForDie(work, s, big).length ? [big] : [Math.min(...left)];
  }
  // for a double the order of the moves doesn't change where they can end: keep the "from" points
  // non-increasing (a checker that keeps going is the exception) to prune the search
  const dbl = left.length > 1 && left.every((d) => d === left[0]);
  const walk = (l: number[], steps: TawlaStep[]) => {
    if (steps.length === best) {
      const key = work[0].join(',') + '|' + work[1].join(',');
      if (!seen.has(key)) seen.set(key, { steps, pos: clonePos(work) });
      return;
    }
    const prev = steps[steps.length - 1];
    for (const d of steps.length === 0 && firstDice ? firstDice : distinct(l)) {
      for (const st of stepsForDie(work, s, d)) {
        if (dbl && prev && st.from > prev.from && prev.to !== st.from) continue;
        const hit = applyStep(work, s, st);
        walk(removeOne(l, d), [...steps, st]);
        unapplyStep(work, s, st, hit);
      }
    }
  };
  walk(left, []);
  return [...seen.values()];
}
