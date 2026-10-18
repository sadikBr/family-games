/**
 * «سودوكو» — everyone gets the same puzzle and races to finish it on their own phone.
 * Each entry is checked: a wrong number counts as a mistake and isn't kept.
 * Points: first to finish 300, then 200, 150, 100…; −20 per mistake (never below 50 for finishing).
 */
import type { SudokuSettings, SudokuView } from '../../src/shared/protocol';
import { generateSudoku } from '../../src/shared/sudoku';
import { type GameCtx, type GameModule } from '../types';
import { isNum, randInt } from '../util';

const PLACE_POINTS = [300, 200, 150, 100];

interface State {
  settings: SudokuSettings;
  players: string[];
  puzzle: number[];
  solution: number[];
  grids: Record<string, number[]>;
  mistakes: Record<string, number>;
  wrong: Record<string, SudokuView['wrong']>;
  wrongN: number;
  finished: SudokuView['finished'];
  startedAt: number;
  phase: SudokuView['phase'];
  scores: Record<string, number>;
  botNext: Record<string, number>;
}

const filled = (s: State, id: string) => s.grids[id].filter((v, i) => v && !s.puzzle[i]).length;
const emptyCount = (s: State) => s.puzzle.filter((v) => !v).length;

function finish(ctx: GameCtx, s: State, id: string) {
  const place = s.finished.length;
  s.finished.push({ id, ms: ctx.now - s.startedAt, mistakes: s.mistakes[id] });
  s.scores[id] += Math.max(50, (PLACE_POINTS[place] ?? 80) - 20 * s.mistakes[id]);
  ctx.fx(place === 0 ? 'win' : 'correct', id);
  if (s.players.every((p) => s.finished.some((f) => f.id === p) || !(ctx.isConnected(p) || ctx.isBot(p)))) s.phase = 'final';
}

/** For result(): the highest `score` first; equal scores share a place. */
function placesByScore(ids: string[], score: (id: string) => number): string[][] {
  const out: string[][] = [];
  let prev: number | null = null;
  for (const id of [...ids].sort((a, b) => score(b) - score(a))) {
    const v = score(id);
    if (v === prev) out[out.length - 1].push(id);
    else out.push([id]);
    prev = v;
  }
  return out;
}

export const sudoku: GameModule<State, SudokuSettings> = {
  id: 'sudoku',

  start(ctx, participants, settings) {
    const { puzzle, solution } = generateSudoku(settings.level);
    ctx.fx('start');
    return {
      settings,
      players: participants,
      puzzle,
      solution,
      grids: Object.fromEntries(participants.map((p) => [p, puzzle.slice()])),
      mistakes: Object.fromEntries(participants.map((p) => [p, 0])),
      wrong: {},
      wrongN: 0,
      finished: [],
      startedAt: ctx.now,
      phase: 'play',
      scores: Object.fromEntries(participants.map((p) => [p, 0])),
      botNext: {},
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play' || !s.players.includes(by) || s.finished.some((f) => f.id === by)) return;
    if (a.type === 'giveup') {
      s.finished.push({ id: by, ms: -1, mistakes: s.mistakes[by] });
      if (s.players.every((p) => s.finished.some((f) => f.id === p))) s.phase = 'final';
      return;
    }
    if (a.type !== 'set' || !isNum(a.cell) || !isNum(a.value)) return;
    const { cell, value } = a;
    if (cell < 0 || cell > 80 || value < 1 || value > 9 || s.puzzle[cell] || s.grids[by][cell]) return;
    if (s.solution[cell] !== value) {
      s.mistakes[by] += 1;
      s.wrong[by] = { cell, value, id: ++s.wrongN };
      ctx.fx('buzz', by);
      return;
    }
    s.grids[by][cell] = value;
    if (filled(s, by) === emptyCount(s)) finish(ctx, s, by);
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    // bots fill one correct cell every few seconds, so they race at a human pace
    for (const b of bots) {
      if (!s.players.includes(b) || s.finished.some((f) => f.id === b)) continue;
      const n = filled(s, b);
      if (s.botNext[b] === n) continue;
      s.botNext[b] = n;
      const empty = s.grids[b].map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      const cell = empty[randInt(0, empty.length - 1)];
      const pace = s.settings.level === 'easy' ? [4000, 9000] : s.settings.level === 'medium' ? [6000, 13000] : [8000, 18000];
      ctx.bot(b, `s:${n}`, randInt(pace[0], pace[1]), { type: 'set', cell, value: s.solution[cell] });
    }
  },

  view(ctx, s, me): SudokuView {
    return {
      game: 'sudoku',
      phase: s.phase,
      level: s.settings.level,
      givens: s.puzzle,
      myGrid: s.grids[me] ?? s.puzzle,
      mistakes: s.mistakes[me] ?? 0,
      wrong: s.wrong[me] ?? null,
      progress: Object.fromEntries(s.players.map((p) => [p, filled(s, p)])),
      empty: emptyCount(s),
      finished: s.finished,
      startedAt: s.startedAt,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase === 'play' && s.players.every((p) => p === id || s.finished.some((f) => f.id === p) || !(ctx.isConnected(p) || ctx.isBot(p)))) s.phase = 'final';
  },

  result(s) {
    if (s.phase !== 'final') return null;
    return { places: placesByScore(s.players, (id) => s.scores[id] ?? 0) };
  },
};
