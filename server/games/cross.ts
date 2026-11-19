/**
 * «الكلمات المتقاطعة» — server rules (the rules at the top of src/shared/games/cross.ts).
 *
 * A new grid at the start (server/cross-gen.ts), a word the room saw in its last grids kept out when
 * possible. «تعاوني»: one shared grid (`team`); «سباق»: one grid per player (`grids`), the same puzzle.
 * A word counts the moment its cells hold the right letters: it is credited to the player who wrote its
 * last letter, and its cells lock. The answers stay on the server: a view carries the grid's shape, the
 * numbers, the clues and the letters written in the viewer's grid — the solution only once it is over.
 *
 * Bots (server/cross-bots.ts): a bot "knows" a clue or not (a chance by its strength and the clue's
 * difficulty, rolled again when crossing letters fill in) and writes a known word after a human-like
 * pause. In «تعاوني» they keep to a modest pace and a share of the words, so the people play too.
 */
import {
  CROSS_CHECK_COOLDOWN_MS,
  CROSS_CHECK_PENALTY_MS,
  CROSS_FIRST_BONUS,
  CROSS_FULL_BONUS,
  CROSS_HINTS,
  CROSS_HINT_COST,
  CROSS_MINUTES,
  CROSS_WRONG_MS,
  crossLetter,
  crossMinutes,
  type CrossGain,
  type CrossLevel,
  type CrossSettings,
  type CrossView,
} from '../../src/shared/games/cross';
import { botTarget, botShare, type BotMind } from '../cross-bots';
import { generateCross, type CrossPuzzle, type Rnd } from '../cross-gen';
import { GameError, botLevel, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { placesByScore, soleWinner } from './mcq';

const MEMO_RECENT = 'cross:recent';
/** Words of this many last grids are kept out of the next one. */
const RECENT_GRIDS = 3;

export interface CrossGrid {
  letters: string[];
  by: (string | null)[];
  revealed: boolean[];
  locked: boolean[];
  /** per clue: who completed it */
  solved: (string | null)[];
}

interface State {
  settings: CrossSettings;
  participants: string[];
  puzzle: CrossPuzzle;
  phase: CrossView['phase'];
  team: CrossGrid;
  grids: Record<string, CrossGrid>;
  hintsUsed: Record<string, number>;
  scores: Record<string, number>;
  words: Record<string, number>;
  /** race: who completed each word first */
  firstBy: (string | null)[];
  gains: Record<string, CrossGain | null>;
  gainSeq: number;
  wrong: number[];
  wrongUntil: number;
  checkSeq: number;
  lastCheck: number;
  penaltyMs: number;
  startedAt: number;
  endsAt: number | null;
  endedAt: number | null;
  completed: boolean;
  winner: string | null;
  bots: Record<string, BotMind>;
  rnd: Rnd;
}

const snap = (v: unknown, opts: readonly number[], d: number): number =>
  isNum(v) ? opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]) : d;

export function sanitizeCross(raw: Partial<CrossSettings> | undefined): CrossSettings {
  const level: CrossLevel = raw?.level === 'easy' || raw?.level === 'medium' ? raw.level : 'mixed';
  return { mode: raw?.mode === 'race' ? 'race' : 'coop', level, minutes: snap(raw?.minutes, CROSS_MINUTES, 0) };
}

const coop = (s: State) => s.settings.mode === 'coop';

const emptyGrid = (p: CrossPuzzle): CrossGrid => ({
  letters: p.sol.map(() => ''),
  by: p.sol.map(() => null),
  revealed: p.sol.map(() => false),
  locked: p.sol.map(() => false),
  solved: p.slots.map(() => null),
});

/** The grid a player writes in (null: not playing). */
const gridOf = (s: State, id: string): CrossGrid | null => (coop(s) ? (s.participants.includes(id) ? s.team : null) : (s.grids[id] ?? null));

const dirName = (d: 'a' | 'd') => (d === 'a' ? 'أفقي' : 'عمودي');

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

const wordRight = (s: State, g: CrossGrid, clue: number) => s.puzzle.slots[clue].cells.every((c) => g.letters[c] === s.puzzle.sol[c]);

/** After letters changed in these cells: the words now right count for `by`. */
function settle(ctx: GameCtx, s: State, g: CrossGrid, cells: number[], by: string) {
  const touched = s.puzzle.slots.map((sl, i) => (sl.cells.some((c) => cells.includes(c)) ? i : -1)).filter((i) => i >= 0);
  let any = false;
  for (const i of touched) {
    if (g.solved[i] !== null || !wordRight(s, g, i)) continue;
    any = true;
    g.solved[i] = by;
    for (const c of s.puzzle.slots[i].cells) g.locked[c] = true;
    s.words[by] = (s.words[by] ?? 0) + 1;
    const sl = s.puzzle.slots[i];
    if (coop(s)) {
      s.scores[by] = (s.scores[by] ?? 0) + 1;
      ctx.say?.(`كلمة صحيحة: ${sl.num} ${dirName(sl.dir)} · ${ctx.playerName(by)}`, by);
    } else {
      const first = s.firstBy[i] === null;
      if (first) s.firstBy[i] = by;
      const points = sl.cells.length + (first ? CROSS_FIRST_BONUS : 0);
      s.scores[by] = (s.scores[by] ?? 0) + points;
      s.gains[by] = { seq: ++s.gainSeq, clue: i, points, first };
    }
  }
  if (any) ctx.fx('correct', by);
  if (g.solved.every((x) => x !== null)) gridDone(ctx, s, by);
}

function gridDone(ctx: GameCtx, s: State, by: string) {
  if (s.phase !== 'play') return;
  if (coop(s)) {
    s.completed = true;
    ctx.say?.('الشبكة كاملة! بارك الله فيكم');
  } else {
    s.winner = by;
    s.scores[by] = (s.scores[by] ?? 0) + CROSS_FULL_BONUS;
    ctx.say?.(`الشبكة كاملة عند ${ctx.playerName(by)}: نهاية السباق`, by);
  }
  finish(ctx, s);
}

function finish(ctx: GameCtx, s: State) {
  if (s.phase === 'final') return;
  s.phase = 'final';
  s.endedAt = ctx.now;
  s.wrong = [];
  if (coop(s)) ctx.fx(s.completed ? 'win' : 'reveal');
  else {
    const scores = Object.fromEntries(s.participants.map((p) => [p, s.scores[p] ?? 0]));
    ctx.fx('win', s.participants.length ? soleWinner(scores) : undefined);
    voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function readCell(s: State, v: unknown): number {
  if (!isNum(v) || !Number.isInteger(v) || v < 0 || v >= s.puzzle.sol.length || !s.puzzle.sol[v]) throw new GameError('اختر خانة بيضاء');
  return v;
}

function setLetter(ctx: GameCtx, s: State, by: string, a: Record<string, unknown>) {
  const g = gridOf(s, by);
  if (!g) return;
  const cell = readCell(s, a.cell);
  if (g.locked[cell]) return;
  const raw = isStr(a.letter) ? a.letter : '';
  const letter = raw === '' ? '' : crossLetter(raw);
  if (letter === null) throw new GameError('حرف غير معروف');
  g.letters[cell] = letter;
  g.by[cell] = letter ? by : null;
  if (s.wrong.includes(cell)) s.wrong = s.wrong.filter((c) => c !== cell);
  if (letter) settle(ctx, s, g, [cell], by);
}

function reveal(ctx: GameCtx, s: State, by: string, a: Record<string, unknown>) {
  const g = gridOf(s, by);
  if (!g) return;
  if ((s.hintsUsed[by] ?? 0) >= CROSS_HINTS) throw new GameError('لا تلميحات متبقية');
  const cell = readCell(s, a.cell);
  let target = !g.locked[cell] && g.letters[cell] !== s.puzzle.sol[cell] ? cell : -1;
  if (target < 0) {
    // the chosen cell is right already: another cell of the chosen word
    const clue = isNum(a.clue) && s.puzzle.slots[a.clue]?.cells.includes(cell) ? a.clue : s.puzzle.slots.findIndex((sl) => sl.cells.includes(cell));
    target = s.puzzle.slots[clue]?.cells.find((c) => !g.locked[c] && g.letters[c] !== s.puzzle.sol[c]) ?? -1;
  }
  if (target < 0) throw new GameError('حروف هذه الكلمة صحيحة: اختر كلمة أخرى');
  s.hintsUsed[by] = (s.hintsUsed[by] ?? 0) + 1;
  g.letters[target] = s.puzzle.sol[target];
  g.by[target] = by;
  g.revealed[target] = true;
  g.locked[target] = true;
  s.wrong = s.wrong.filter((c) => c !== target);
  if (coop(s)) ctx.say?.(`حرف مكشوف · ${ctx.playerName(by)}`, by);
  else s.scores[by] = (s.scores[by] ?? 0) - CROSS_HINT_COST;
  settle(ctx, s, g, [target], by);
}

function check(ctx: GameCtx, s: State, by: string) {
  if (!coop(s)) return;
  if (ctx.now - s.lastCheck < CROSS_CHECK_COOLDOWN_MS) throw new GameError('انتظر لحظة قبل تحقّق جديد');
  const g = s.team;
  s.lastCheck = ctx.now;
  s.wrong = g.letters.map((l, i) => (l && !g.locked[i] && l !== s.puzzle.sol[i] ? i : -1)).filter((i) => i >= 0);
  s.wrongUntil = ctx.now + CROSS_WRONG_MS;
  s.checkSeq++;
  s.penaltyMs += CROSS_CHECK_PENALTY_MS;
  ctx.fx(s.wrong.length ? 'buzz' : 'correct', by);
  ctx.say?.(`تحقّق من ${ctx.playerName(by)} · ${s.wrong.length ? `حروف خاطئة: ${s.wrong.length}` : 'لا خطأ في الحروف'}`, by);
}

/** Co-op with people: the bots have done their share of the words (the people play the rest). */
function botsCapped(ctx: GameCtx, s: State): boolean {
  if (!coop(s) || !s.participants.some((p) => !ctx.isBot(p))) return false;
  const botWords = s.participants.filter((p) => ctx.isBot(p)).reduce((t, p) => t + (s.words[p] ?? 0), 0);
  return botWords >= botShare(s.puzzle.slots.length);
}

/** A bot writes the word it planned (it "knows" it): only cells not locked. */
function botWord(ctx: GameCtx, s: State, by: string, a: Record<string, unknown>) {
  if (!ctx.isBot(by)) return;
  const mind = s.bots[by];
  if (!mind || !isNum(a.step) || a.step !== mind.step) return;
  mind.step++;
  const g = gridOf(s, by);
  const clue = isNum(a.clue) ? a.clue : -1;
  const sl = s.puzzle.slots[clue];
  if (!g || !sl || g.solved[clue] !== null) return;
  if (botsCapped(ctx, s)) return;
  // in the shared grid a bot doesn't write over someone's letters (it waits for them to be fixed)
  if (coop(s) && sl.cells.some((c) => g.letters[c] && g.letters[c] !== s.puzzle.sol[c])) return;
  const changed: number[] = [];
  for (const c of sl.cells) {
    if (g.locked[c] || g.letters[c] === s.puzzle.sol[c]) continue;
    g.letters[c] = s.puzzle.sol[c];
    g.by[c] = by;
    changed.push(c);
  }
  settle(ctx, s, g, changed.length ? changed : sl.cells, by);
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startCross(ctx: GameCtx, participants: string[], raw: CrossSettings, rnd: Rnd = Math.random, puzzle?: CrossPuzzle): State {
  const settings = sanitizeCross(raw);
  const recent = (ctx.memo.get(MEMO_RECENT) as string[][] | undefined) ?? [];
  const p = puzzle ?? generateCross(rnd, { level: settings.level, avoid: new Set(recent.flat()) });
  ctx.memo.set(MEMO_RECENT, [...recent, p.slots.map((sl) => sl.key)].slice(-RECENT_GRIDS));
  const minutes = crossMinutes(settings);
  const s: State = {
    settings,
    participants: [...participants],
    puzzle: p,
    phase: 'play',
    team: emptyGrid(p),
    grids: settings.mode === 'race' ? Object.fromEntries(participants.map((id) => [id, emptyGrid(p)])) : {},
    hintsUsed: {},
    scores: Object.fromEntries(participants.map((id) => [id, 0])),
    words: Object.fromEntries(participants.map((id) => [id, 0])),
    firstBy: p.slots.map(() => null),
    gains: {},
    gainSeq: 0,
    wrong: [],
    wrongUntil: 0,
    checkSeq: 0,
    lastCheck: -Infinity,
    penaltyMs: 0,
    startedAt: ctx.now,
    endsAt: minutes ? ctx.now + minutes * 60_000 : null,
    endedAt: null,
    completed: false,
    winner: null,
    bots: {},
    rnd,
  };
  ctx.fx('start');
  ctx.say?.(settings.mode === 'race' ? `شبكة جديدة من ${p.slots.length} كلمات: من يكملها أولاً؟` : `شبكة جديدة من ${p.slots.length} كلمات: حلّوها معاً!`);
  return s;
}

export const cross: GameModule<State, CrossSettings> = {
  id: 'cross',
  hostOnly: ['giveup'],

  start(ctx, participants, raw) {
    return startCross(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by) || s.phase !== 'play') return;
    switch (a.type) {
      case 'set':
        return setLetter(ctx, s, by, a);
      case 'reveal':
        return reveal(ctx, s, by, a);
      case 'check':
        return check(ctx, s, by);
      case 'botword':
        return botWord(ctx, s, by, a);
      case 'giveup':
        if (coop(s)) {
          ctx.say?.('انتهت المحاولة: إليكم الحل');
          finish(ctx, s);
        }
        return;
    }
  },

  tick(ctx, s) {
    if (s.phase === 'play' && s.endsAt !== null && ctx.now >= s.endsAt) {
      ctx.say?.('انتهى الوقت!');
      finish(ctx, s);
      return true;
    }
    return false;
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const level = botLevel(ctx);
    const capped = botsCapped(ctx, s);
    for (const b of bots) {
      if (!s.participants.includes(b) || capped) continue;
      const g = gridOf(s, b);
      if (!g) continue;
      const mind = (s.bots[b] ??= { step: 0, know: {}, rolledAt: {} });
      const t = botTarget(level, coop(s), s.puzzle, g, mind, s.rnd, ctx.now - s.startedAt);
      if (t) ctx.bot(b, `w:${mind.step}`, t.delay, { type: 'botword', clue: t.clue, step: mind.step });
    }
  },

  view(ctx, s, me): CrossView {
    const p = s.puzzle;
    const g = gridOf(s, me) ?? (coop(s) ? s.team : emptyGrid(p));
    const race = !coop(s);
    const over = s.phase === 'final';
    const progress: CrossView['progress'] = {};
    if (race) for (const id of s.participants) {
      const pg = s.grids[id];
      if (pg) progress[id] = { words: pg.solved.filter((x) => x !== null).length, done: pg.solved.every((x) => x !== null) };
    }
    const end = s.endedAt ?? ctx.now;
    return {
      game: 'cross',
      mode: s.settings.mode,
      level: s.settings.level,
      phase: s.phase,
      rows: p.rows,
      cols: p.cols,
      open: p.sol.map((ch) => !!ch),
      nums: [...p.nums],
      clues: p.slots.map((sl, id) => ({ id, num: sl.num, dir: sl.dir, text: sl.clue, cells: [...sl.cells] })),
      letters: [...g.letters],
      by: coop(s) ? [...g.by] : g.letters.map(() => null),
      revealed: [...g.revealed],
      locked: [...g.locked],
      solved: race ? g.solved.map((x) => (x === null ? null : me)) : [...g.solved],
      wrong: coop(s) && ctx.now < s.wrongUntil ? [...s.wrong] : [],
      wrongUntil: s.wrongUntil,
      checkSeq: s.checkSeq,
      hintsLeft: Math.max(0, CROSS_HINTS - (s.hintsUsed[me] ?? 0)),
      gain: race ? (s.gains[me] ?? null) : null,
      progress,
      scores: { ...s.scores },
      words: { ...s.words },
      startedAt: s.startedAt,
      endsAt: over ? null : s.endsAt,
      timerTotal: crossMinutes(s.settings) * 60_000,
      penaltyMs: s.penaltyMs,
      final: over
        ? {
            completed: s.completed,
            winner: s.winner,
            solution: [...p.sol],
            ms: end - s.startedAt + s.penaltyMs,
            penaltyMs: s.penaltyMs,
            hintsUsed: Object.values(s.hintsUsed).reduce((a, b) => a + b, 0),
            checks: s.checkSeq,
          }
        : null,
      players: [...s.participants],
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.grids[id];
    delete s.scores[id];
    delete s.words[id];
    delete s.bots[id];
    if (s.phase === 'final') return;
    // nobody left to play for (bots alone don't go on)
    if (!s.participants.length || s.participants.every((p) => ctx.isBot(p))) finish(ctx, s);
  },

  patchSettings(settings, patch) {
    if (patch.mode === 'coop' || patch.mode === 'race') settings.mode = patch.mode;
    if (patch.level === 'easy' || patch.level === 'medium' || patch.level === 'mixed') settings.level = patch.level;
    if (isNum(patch.minutes)) settings.minutes = snap(patch.minutes, CROSS_MINUTES, settings.minutes);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    if (coop(s)) return { places: [[...s.participants]], coop: { won: s.completed } };
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as CrossState };
