/**
 * «الروابط» — sixteen words in four hidden groups (rules at the top of src/shared/games/rawabit.ts).
 *
 * Each puzzle is dealt in a random order: a tile's id is its place in that order, so it tells nothing about
 * its group. A board holds the groups found, the selection, the mistakes and the wrong fours already tried.
 *
 * «سباق»: one board per player; the view sends a player their own board only, and the others as counts. The
 * puzzle ends when every player is done (a full board, or no mistakes left; someone away doesn't hold it up)
 * or when the time limit runs out; only then does everyone see the four groups and the puzzle's points.
 * «تعاون»: one board for the family (anyone selects, anyone checks; a check must be of the selection everyone
 * sees). Bots don't play in it.
 *
 * Several puzzles: a reveal between them (the host may go on at once), a podium at the end (co-op: the
 * family's result).
 */
import {
  RAWABIT_CLEAN_BONUS,
  RAWABIT_COLOR_NAME,
  RAWABIT_MINUTES,
  RAWABIT_MISTAKES,
  RAWABIT_ORDER_BONUS,
  RAWABIT_POINTS,
  RAWABIT_PUZZLES,
  RAWABIT_SIZE,
  type RawabitBoardView,
  type RawabitDone,
  type RawabitFlash,
  type RawabitGroup,
  type RawabitMode,
  type RawabitPlayerResult,
  type RawabitProgress,
  type RawabitReveal,
  type RawabitSettings,
  type RawabitView,
} from '../../src/shared/games/rawabit';
import { botGuess, guessKey, type BotGroup, type Rnd } from '../rawabit-bots';
import { RAWABIT_PUZZLE_LIST, type RawabitPuzzle } from '../rawabit-puzzles';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { placesByScore, soleWinner } from './mcq';

/** The end of a puzzle stays on the screens this long (at the room's pace), unless the host goes on. */
export const RAWABIT_REVEAL_MS = 16_000;
const MEMO_USED = 'rawabit:used';

interface Deal {
  puzzle: RawabitPuzzle;
  /** tile id = index */
  tiles: { word: string; group: number }[];
}

interface Board {
  /** group indices, in the order found */
  found: number[];
  foundBy: (string | null)[];
  sel: number[];
  mistakes: number;
  /** the wrong fours already checked */
  tried: Set<string>;
  done: RawabitDone;
  rank: number | null;
  /** checks so far */
  checks: number;
  flash: RawabitFlash | null;
}

interface State {
  settings: RawabitSettings;
  participants: string[];
  /** puzzle ids for the game */
  queue: string[];
  /** 0-based */
  round: number;
  phase: RawabitView['phase'];
  deal: Deal;
  /** race: one per player */
  boards: Record<string, Board>;
  /** co-op: the family's */
  team: Board;
  /** full boards so far this puzzle (race) */
  finished: number;
  /** play: the time limit (null without one) · reveal: the next puzzle */
  endsAt: number | null;
  reveal: RawabitReveal | null;
  scores: Record<string, number>;
  /** co-op: puzzles solved */
  solved: number;
  rnd: Rnd;
}

const snap = (v: unknown, opts: readonly number[], d: number): number =>
  isNum(v) ? opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]) : d;

export function sanitizeRawabit(raw: Partial<RawabitSettings> | undefined): RawabitSettings {
  return {
    mode: raw?.mode === 'coop' ? 'coop' : 'race',
    puzzles: snap(raw?.puzzles, RAWABIT_PUZZLES, 3),
    minutes: snap(raw?.minutes, RAWABIT_MINUTES, 0),
  };
}

const newBoard = (): Board => ({ found: [], foundBy: [], sel: [], mistakes: 0, tried: new Set(), done: null, rank: null, checks: 0, flash: null });

/* ------------------------------------------------------------------ */
/* Puzzles                                                             */
/* ------------------------------------------------------------------ */

function shuffled<T>(list: readonly T[], rnd: Rnd): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The game's puzzles: ones this room hasn't seen yet first (the room remembers them between games). */
function choosePuzzles(ctx: GameCtx, n: number, rnd: Rnd): string[] {
  let used = ctx.memo.get(MEMO_USED) as Set<string> | undefined;
  if (!used) ctx.memo.set(MEMO_USED, (used = new Set()));
  let fresh = RAWABIT_PUZZLE_LIST.filter((p) => !used.has(p.id));
  if (fresh.length < n) {
    used.clear();
    fresh = RAWABIT_PUZZLE_LIST.slice();
  }
  const ids = shuffled(fresh, rnd)
    .slice(0, n)
    .map((p) => p.id);
  for (const id of ids) used.add(id);
  return ids;
}

export function dealPuzzle(puzzle: RawabitPuzzle, rnd: Rnd): Deal {
  const tiles = puzzle.groups.flatMap((g, group) => g.words.map((word) => ({ word, group })));
  return { puzzle, tiles: shuffled(tiles, rnd) };
}

const puzzleById = (id: string) => RAWABIT_PUZZLE_LIST.find((p) => p.id === id) ?? RAWABIT_PUZZLE_LIST[0];

/** Tile ids of the groups not found on this board. */
const leftIds = (s: State, b: Board) => s.deal.tiles.map((_, id) => id).filter((id) => !b.found.includes(s.deal.tiles[id].group));

const groupShown = (s: State, g: number): RawabitGroup => {
  const pg = s.deal.puzzle.groups[g];
  // the words in the order they were on the board
  return { color: pg.color, theme: pg.theme, words: s.deal.tiles.filter((t) => t.group === g).map((t) => t.word) };
};

const coop = (s: State) => s.settings.mode === 'coop';

function startPuzzle(ctx: GameCtx, s: State) {
  s.phase = 'play';
  s.deal = dealPuzzle(puzzleById(s.queue[s.round]), s.rnd);
  s.boards = coop(s) ? {} : Object.fromEntries(s.participants.map((p) => [p, newBoard()]));
  s.team = newBoard();
  s.finished = 0;
  s.reveal = null;
  s.endsAt = s.settings.minutes > 0 ? ctx.now + s.settings.minutes * 60_000 : null;
  ctx.fx('start');
  const total = s.queue.length;
  ctx.say?.(total > 1 ? `اللغز ${s.round + 1} من ${total}: ست عشرة كلمة وأربع مجموعات خفية` : 'ست عشرة كلمة وأربع مجموعات خفية: ابحثوا عن الروابط!');
}

/* ------------------------------------------------------------------ */
/* Checking four words                                                 */
/* ------------------------------------------------------------------ */

function readIds(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length !== RAWABIT_SIZE) return null;
  if (!v.every((x) => isNum(x) && Number.isInteger(x))) return null;
  return new Set(v).size === RAWABIT_SIZE ? (v as number[]) : null;
}

/** Check four tiles on a board. Returns what happened (the caller tells the room). */
function check(s: State, b: Board, by: string, ids: number[]): RawabitFlash {
  const left = leftIds(s, b);
  if (!ids.every((id) => left.includes(id))) throw new GameError('اختر أربع كلمات من اللوحة');
  const key = guessKey(ids);
  if (b.tried.has(key)) throw new GameError('هذه الكلمات الأربع مجرَّبة من قبل');
  b.checks++;
  const groups = ids.map((id) => s.deal.tiles[id].group);
  const counts = new Map<number, number>();
  for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  const most = Math.max(...counts.values());
  if (most === RAWABIT_SIZE) {
    const g = groups[0];
    b.found.push(g);
    b.foundBy.push(by);
    b.sel = b.sel.filter((id) => !ids.includes(id));
    b.flash = { seq: b.checks, kind: 'right', by, color: s.deal.puzzle.groups[g].color, ids: [...ids] };
    if (b.found.length === s.deal.puzzle.groups.length) {
      b.done = 'solved';
      b.sel = [];
    }
  } else {
    b.mistakes++;
    b.tried.add(key);
    b.flash = { seq: b.checks, kind: most === RAWABIT_SIZE - 1 ? 'away' : 'wrong', by, color: null, ids: [...ids] };
    if (b.mistakes >= RAWABIT_MISTAKES) {
      b.done = 'out';
      b.sel = [];
    }
  }
  return b.flash;
}

function guess(ctx: GameCtx, s: State, by: string, raw: unknown) {
  if (s.phase !== 'play') return;
  const ids = readIds(raw);
  if (!ids) throw new GameError('اختر أربع كلمات');
  if (coop(s)) {
    const b = s.team;
    if (b.done) return;
    if (guessKey(ids) !== guessKey(b.sel)) throw new GameError('تغيّر التحديد: انظر إلى اللوحة من جديد');
    const f = check(s, b, by, ids);
    const name = ctx.playerName(by);
    if (f.kind === 'right') {
      const g = s.deal.puzzle.groups[b.found[b.found.length - 1]];
      s.scores[by] = (s.scores[by] ?? 0) + 1;
      ctx.fx('correct', by);
      ctx.say?.(`المجموعة ${RAWABIT_COLOR_NAME[g.color]} من ${name}: ${g.theme}`, by);
    } else {
      ctx.fx('buzz', by);
      const left = RAWABIT_MISTAKES - b.mistakes;
      ctx.say?.(`${f.kind === 'away' ? 'ينقص واحد!' : 'ليست مجموعة'} · محاولة ${name} · ${left ? `بقيت ${left}` : 'لا محاولات بعدها'}`, by);
    }
  } else {
    const b = s.boards[by];
    if (!b || b.done) return;
    check(s, b, by, ids);
    if (b.done === 'solved') {
      b.rank = ++s.finished;
      ctx.say?.(`اللوحة كاملة: ${ctx.playerName(by)} · المركز ${b.rank}`, by);
    } else if (b.done === 'out') ctx.say?.(`نفدت محاولات ${ctx.playerName(by)}`, by);
  }
  checkEnd(ctx, s);
}

function toggle(s: State, by: string, id: unknown) {
  if (s.phase !== 'play' || !isNum(id)) return;
  const b = coop(s) ? s.team : s.boards[by];
  if (!b || b.done) return;
  if (!leftIds(s, b).includes(id)) return;
  if (b.sel.includes(id)) b.sel = b.sel.filter((x) => x !== id);
  else if (b.sel.length >= RAWABIT_SIZE) throw new GameError('أربع كلمات فقط');
  else b.sel = [...b.sel, id];
}

/* ------------------------------------------------------------------ */
/* The end of a puzzle                                                 */
/* ------------------------------------------------------------------ */

/** Everyone done (race: people away don't hold the puzzle up)? */
function checkEnd(ctx: GameCtx, s: State) {
  if (s.phase !== 'play') return;
  const over = coop(s) ? !!s.team.done : s.participants.every((p) => s.boards[p]?.done || !ctx.isConnected(p));
  if (over) endPuzzle(ctx, s, false);
}

export function puzzleGain(b: Board, colors: RawabitPuzzle['groups']): Omit<RawabitPlayerResult, 'id' | 'mistakes' | 'done' | 'rank' | 'found'> {
  const groups = b.found.reduce((t, g) => t + RAWABIT_POINTS[colors[g].color], 0);
  const full = b.done === 'solved';
  const clean = full ? (RAWABIT_MISTAKES - b.mistakes) * RAWABIT_CLEAN_BONUS : 0;
  const order = full && b.rank ? (RAWABIT_ORDER_BONUS[b.rank - 1] ?? 0) : 0;
  return { groups, clean, order, gain: groups + clean + order };
}

function endPuzzle(ctx: GameCtx, s: State, timeUp: boolean) {
  const groups = s.deal.puzzle.groups.map((_, g) => groupShown(s, g));
  if (coop(s)) {
    const b = s.team;
    if (!b.done && timeUp) b.done = 'time';
    b.sel = [];
    if (b.done === 'solved') s.solved++;
    s.reveal = { groups, results: [], team: { found: b.found.map((g) => s.deal.puzzle.groups[g].color), mistakes: b.mistakes, done: b.done } };
    ctx.fx(b.done === 'solved' ? 'win' : 'reveal');
    ctx.say?.(b.done === 'solved' ? 'اللغز محلول! بارك الله فيكم' : timeUp ? 'انتهى الوقت: إليكم المجموعات الأربع' : 'انتهت المحاولات: إليكم المجموعات الأربع');
  } else {
    const results: RawabitPlayerResult[] = s.participants.map((id) => {
      const b = s.boards[id] ?? newBoard();
      if (!b.done && timeUp) b.done = 'time';
      b.sel = [];
      const g = puzzleGain(b, s.deal.puzzle.groups);
      s.scores[id] = (s.scores[id] ?? 0) + g.gain;
      return { id, found: b.found.map((x) => s.deal.puzzle.groups[x].color), mistakes: b.mistakes, done: b.done, rank: b.rank, ...g };
    });
    s.reveal = { groups, results, team: null };
    ctx.fx('reveal');
    ctx.say?.(timeUp ? 'انتهى الوقت: إليكم المجموعات الأربع' : 'انتهى اللغز: إليكم المجموعات الأربع');
  }
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, RAWABIT_REVEAL_MS);
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  if (coop(s)) {
    ctx.fx(won(s) ? 'win' : 'reveal');
    return;
  }
  ctx.fx('win', soleWinner(Object.fromEntries(s.participants.map((p) => [p, s.scores[p] ?? 0]))));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.queue.length || !s.participants.length) return finish(ctx, s);
  s.round++;
  startPuzzle(ctx, s);
}

/** Co-op: more than half of the puzzles solved. */
const won = (s: State) => s.solved * 2 > s.queue.length;

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startRawabit(ctx: GameCtx, participants: string[], raw: RawabitSettings, rnd: Rnd = Math.random, queue?: string[]): State {
  const settings = sanitizeRawabit(raw);
  const s: State = {
    settings,
    participants: [...participants],
    queue: queue ?? choosePuzzles(ctx, settings.puzzles, rnd),
    round: 0,
    phase: 'play',
    deal: { puzzle: RAWABIT_PUZZLE_LIST[0], tiles: [] },
    boards: {},
    team: newBoard(),
    finished: 0,
    endsAt: null,
    reveal: null,
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    solved: 0,
    rnd,
  };
  startPuzzle(ctx, s);
  return s;
}

function boardView(s: State, b: Board): RawabitBoardView {
  return {
    tiles: leftIds(s, b).map((id) => ({ id, word: s.deal.tiles[id].word })),
    found: b.found.map((g, i) => ({ ...groupShown(s, g), by: b.foundBy[i] ?? null })),
    sel: [...b.sel],
    mistakes: b.mistakes,
    done: b.done,
    rank: b.rank,
    flash: b.flash ? { ...b.flash, ids: [...b.flash.ids] } : null,
  };
}

export const rawabit: GameModule<State, RawabitSettings> = {
  id: 'rawabit',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startRawabit(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by)) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    switch (a.type) {
      case 'toggle':
        return toggle(s, by, a.id);
      case 'clear': {
        if (s.phase !== 'play') return;
        const b = coop(s) ? s.team : s.boards[by];
        if (b && !b.done) b.sel = [];
        return;
      }
      case 'guess':
        return guess(ctx, s, by, a.ids);
      case 'next':
        if (s.phase === 'reveal') next(ctx, s);
        return;
    }
  },

  tick(ctx, s) {
    if (s.phase === 'play' && s.endsAt !== null && ctx.now >= s.endsAt) {
      endPuzzle(ctx, s, true);
      return true;
    }
    if (s.phase === 'play') {
      checkEnd(ctx, s);
      return s.phase !== 'play';
    }
    if (s.phase === 'reveal' && s.endsAt !== null && ctx.now >= s.endsAt) {
      next(ctx, s);
      return true;
    }
    return false;
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play' || coop(s)) return;
    const level = botLevel(ctx);
    for (const id of bots) {
      const b = s.boards[id];
      if (!s.participants.includes(id) || !b || b.done) continue;
      const left: BotGroup[] = s.deal.puzzle.groups
        .map((g, group) => ({ group, color: g.color, ids: s.deal.tiles.map((t, tid) => (t.group === group ? tid : -1)).filter((x) => x >= 0) }))
        .filter((g) => !b.found.includes(g.group));
      const m = botGuess(level, left, b.tried, s.rnd);
      ctx.bot(id, `g:${s.round}:${b.checks}`, m.delay, { type: 'guess', round: s.round + 1, ids: m.ids });
    }
  },

  view(ctx, s, me): RawabitView {
    const race = !coop(s);
    const mine = race ? s.boards[me] : s.team;
    const progress: Record<string, RawabitProgress> = {};
    if (race) for (const p of s.participants) {
      const b = s.boards[p];
      if (b) progress[p] = { found: b.found.length, mistakes: b.mistakes, done: b.done, rank: b.rank };
    }
    const timerTotal = s.phase === 'reveal' ? paced(ctx, RAWABIT_REVEAL_MS) : s.settings.minutes * 60_000;
    return {
      game: 'rawabit',
      mode: s.settings.mode,
      phase: s.phase,
      puzzle: s.round + 1,
      puzzles: s.queue.length,
      board: mine && s.phase !== 'final' ? boardView(s, mine) : null,
      progress,
      endsAt: s.phase === 'final' ? null : s.endsAt,
      timerTotal,
      reveal: s.phase === 'play' ? null : s.reveal,
      scores: { ...s.scores },
      solved: s.solved,
      players: [...s.participants],
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.boards[id];
    delete s.scores[id];
    if (s.phase === 'final') return;
    // co-op: bots don't play, so a family of bots alone can't go on
    if (!s.participants.length || (coop(s) && s.participants.every((p) => ctx.isBot(p)))) return finish(ctx, s);
    if (s.reveal) s.reveal.results = s.reveal.results.filter((r) => r.id !== id);
    // (co-op: the family's selection stays for the others)
    checkEnd(ctx, s);
  },

  patchSettings(settings, patch) {
    if (patch.mode === 'race' || patch.mode === 'coop') settings.mode = patch.mode as RawabitMode;
    if (isNum(patch.puzzles)) settings.puzzles = snap(patch.puzzles, RAWABIT_PUZZLES, settings.puzzles);
    if (isNum(patch.minutes)) settings.minutes = snap(patch.minutes, RAWABIT_MINUTES, settings.minutes);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    if (coop(s)) return { places: [[...s.participants]], coop: { won: won(s) } };
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as RawabitState, Board as RawabitBoard };
