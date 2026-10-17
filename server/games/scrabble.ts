/**
 * «شبكة الكلمات» — an Arabic word-tile game for 2–4 players (bots allowed).
 * 15×15 board (column 0 on the right: across words read right to left), 100 tiles (see TILE_SET in
 * src/shared/scrabble-rules.ts), 7 per rack. Your turn: put tiles in one line touching the tiles on the
 * board (the first word covers the centre star), swap tiles (only with 7+ in the bag), or pass. Every
 * word formed must be in the dictionary (server/scrabble-dict.ts). Premium squares, +50 for all 7.
 * The game ends when the bag is empty and someone uses their last tile (they gain the others' leftover
 * points), or after 2 × players turns in a row without a word (passes, swaps, time-outs); everyone
 * loses the points left on their rack.
 */
import type { ScrabbleMove, ScrabblePlacement, ScrabbleSettings, ScrabbleTile, ScrabbleView } from '../../src/shared/games/scrabble';
import { CELLS, RACK, analyse, makeTiles, normLetter, rackValue } from '../../src/shared/scrabble-rules';
import { randDelay } from '../cardkit';
import { findMoves, tilesFor } from '../scrabble-bot';
import { isWord } from '../scrabble-dict';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, pick, shuffle } from '../util';

const LOG = 8;

interface State {
  settings: ScrabbleSettings;
  order: string[];
  phase: ScrabbleView['phase'];
  board: ScrabbleView['board'];
  bag: ScrabbleTile[];
  racks: Record<string, ScrabbleTile[]>;
  scores: Record<string, number>;
  turn: string;
  turnNo: number;
  endsAt: number | null;
  scoreless: number;
  last: ScrabbleMove | null;
  log: ScrabbleMove[];
  final: ScrabbleView['final'];
  /** the bot move worked out for a turn (computed once per turn) */
  botMove: { turnNo: number; action: { type: string; [k: string]: unknown } } | null;
}

function draw(s: State, id: string) {
  const rack = s.racks[id];
  while (rack.length < RACK && s.bag.length) rack.push(s.bag.pop()!);
}

function startTurn(ctx: GameCtx, s: State, id: string) {
  s.turn = id;
  s.turnNo += 1;
  s.endsAt = s.settings.seconds ? ctx.now + s.settings.seconds * 1000 : null;
}

function nextAfter(s: State, id: string): string {
  const i = s.order.indexOf(id);
  return s.order[(i + 1) % s.order.length];
}

function remember(s: State, m: ScrabbleMove) {
  s.last = m;
  s.log.push(m);
  if (s.log.length > LOG) s.log.shift();
}

const move = (by: string, kind: ScrabbleMove['kind'], extra: Partial<ScrabbleMove> = {}): ScrabbleMove => ({ by, kind, cells: [], words: [], score: 0, bingo: false, count: 0, ...extra });

/** The single best score, or null on a tie. */
function leader(s: State): string | null {
  const ranked = s.order.slice().sort((a, b) => s.scores[b] - s.scores[a]);
  if (!ranked.length) return null;
  if (ranked.length > 1 && s.scores[ranked[0]] === s.scores[ranked[1]]) return null;
  return ranked[0];
}

function endGame(ctx: GameCtx, s: State, out: string | null) {
  const adjust: Record<string, number> = {};
  const left: Record<string, ScrabbleTile[]> = {};
  let pot = 0;
  for (const id of s.order) {
    const v = rackValue(s.racks[id]);
    left[id] = s.racks[id].slice();
    adjust[id] = -v;
    pot += v;
  }
  if (out) adjust[out] = pot;
  for (const id of s.order) s.scores[id] += adjust[id];
  s.phase = 'final';
  s.endsAt = null;
  const winner = leader(s);
  s.final = { winner, out, adjust, left };
  ctx.fx('win', winner ?? undefined);
}

/** After a turn without a word: end the game once everyone has had two of them in a row. */
function afterScoreless(ctx: GameCtx, s: State, by: string) {
  s.scoreless += 1;
  if (s.scoreless >= 2 * s.order.length) endGame(ctx, s, null);
  else startTurn(ctx, s, nextAfter(s, by));
}

function pass(ctx: GameCtx, s: State, by: string, kind: 'pass' | 'timeout') {
  remember(s, move(by, kind));
  ctx.fx(kind === 'timeout' ? 'buzz' : 'skip');
  afterScoreless(ctx, s, by);
}

/** ««كلمة»» or «أ» و«ب» for an error message. */
const quoteAll = (ws: string[]) => ws.map((w) => `«${w}»`).join(' و');

function play(ctx: GameCtx, s: State, by: string, raw: unknown) {
  if (!Array.isArray(raw) || !raw.length) throw new GameError('ضع حرفاً واحداً على الأقل على اللوحة');
  const rack = s.racks[by];
  const used = new Set<number>();
  const placements: ScrabblePlacement[] = [];
  const values: number[] = [];
  for (const x of raw as { id?: unknown; cell?: unknown; l?: unknown }[]) {
    const tile = rack.find((t) => t.id === x?.id);
    if (!tile || used.has(tile.id)) throw new GameError('هذا الحرف ليس عندك');
    if (!isNum(x.cell)) throw new GameError('مربع غير موجود');
    used.add(tile.id);
    values.push(tile.v);
    if (tile.l) placements.push({ cell: x.cell, l: tile.l });
    else {
      const l = typeof x.l === 'string' ? normLetter(x.l) : '';
      if (!l) throw new GameError('اختر الحرف الذي يمثله المربع الفارغ');
      placements.push({ cell: x.cell, l, blank: true });
    }
  }
  const res = analyse(s.board, placements);
  if (!res.ok) throw new GameError(res.error);
  const bad = [...new Set(res.words.map((w) => w.w).filter((w) => !isWord(w)))];
  if (bad.length) throw new GameError(bad.length === 1 ? `«${bad[0]}» ليست في القاموس` : `${quoteAll(bad)} ليست في القاموس`);

  placements.forEach((p, i) => (s.board[p.cell] = { l: p.l, v: values[i] }));
  s.racks[by] = rack.filter((t) => !used.has(t.id));
  s.scores[by] += res.score;
  draw(s, by);
  s.scoreless = 0;
  remember(s, move(by, 'play', { cells: placements.map((p) => p.cell), words: res.words.map((w) => ({ w: w.w, score: w.score })), score: res.score, bingo: res.bingo }));
  ctx.fx(res.bingo ? 'reveal' : 'correct', by);
  if (!s.racks[by].length && !s.bag.length) endGame(ctx, s, by);
  else startTurn(ctx, s, nextAfter(s, by));
}

function swap(ctx: GameCtx, s: State, by: string, raw: unknown) {
  if (s.bag.length < RACK) throw new GameError('لا يمكن التبديل: بقي في الكيس أقل من ٧ أحرف');
  const ids = Array.isArray(raw) ? [...new Set(raw.filter(isNum))] : [];
  const rack = s.racks[by];
  const out = rack.filter((t) => ids.includes(t.id));
  if (!out.length || out.length !== ids.length) throw new GameError('اختر الأحرف التي تريد تبديلها');
  s.racks[by] = rack.filter((t) => !ids.includes(t.id));
  draw(s, by);
  s.bag = shuffle([...s.bag, ...out]);
  remember(s, move(by, 'swap', { count: out.length }));
  ctx.fx('card');
  afterScoreless(ctx, s, by);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** What a bot does this turn: the best word (strong), a random decent word (easy), else swap or pass. */
export function botAction(s: State, id: string, timeMs = 300): { type: string; [k: string]: unknown } {
  const rack = s.racks[id];
  const moves = findMoves(s.board, rack, timeMs);
  if (moves.length) {
    moves.sort((a, b) => b.score - a.score || b.placements.length - a.placements.length);
    let chosen = moves[0];
    if (s.settings.level === 1) {
      const best = moves[0].score;
      const ok = moves.filter((m) => m.score >= Math.max(3, best * 0.3) && m.score <= Math.max(best * 0.75, 6) && m.placements.length <= 5);
      chosen = ok.length ? pick(ok) : moves[Math.floor(moves.length / 4)];
    }
    const tiles = tilesFor(chosen, rack);
    if (tiles) return { type: 'play', tiles, turn: s.turnNo, auto: true };
  }
  if (s.bag.length >= RACK) {
    // keep a blank and one copy of a cheap common letter, swap the rest
    const keep = new Set<number>();
    const blank = rack.find((t) => !t.l);
    if (blank) keep.add(blank.id);
    const cheap = rack.find((t) => t.v === 1 && t.l);
    if (cheap) keep.add(cheap.id);
    let ids = rack.filter((t) => !keep.has(t.id)).map((t) => t.id);
    if (!ids.length) ids = rack.map((t) => t.id);
    return { type: 'swap', ids, turn: s.turnNo, auto: true };
  }
  return { type: 'pass', turn: s.turnNo, auto: true };
}

/* ------------------------------------------------------------------ */

export const scrabble: GameModule<State, ScrabbleSettings> = {
  id: 'scrabble',

  turnOf: (s) => (s.phase === 'play' ? [s.turn] : []),

  start(ctx, participants, settings) {
    const order = shuffle(participants);
    const s: State = {
      settings: { ...settings },
      order,
      phase: 'play',
      board: new Array(CELLS).fill(null),
      bag: shuffle(makeTiles()),
      racks: Object.fromEntries(order.map((id) => [id, []])),
      scores: Object.fromEntries(order.map((id) => [id, 0])),
      turn: order[0],
      turnNo: 0,
      endsAt: null,
      scoreless: 0,
      last: null,
      log: [],
      final: null,
      botMove: null,
    };
    for (const id of order) draw(s, id);
    startTurn(ctx, s, order[0]);
    ctx.fx('start');
    return s;
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play' || !s.order.includes(by)) return;
    // a bot move planned for an earlier turn (the turn timed out meanwhile): drop it
    if (a.turn !== undefined && a.turn !== s.turnNo) return;
    if (s.turn !== by) throw new GameError('ماشي دورك');
    switch (a.type) {
      case 'play':
        try {
          play(ctx, s, by, a.tiles);
        } catch (e) {
          // a bot's move that is refused becomes a pass, so it never gets stuck retrying
          if (a.auto && e instanceof GameError) pass(ctx, s, by, 'pass');
          else throw e;
        }
        return;
      case 'swap':
        swap(ctx, s, by, a.ids);
        return;
      case 'pass':
        pass(ctx, s, by, 'pass');
        return;
    }
  },

  tick(ctx, s) {
    if (s.phase !== 'play' || s.endsAt === null || ctx.now < s.endsAt) return false;
    pass(ctx, s, s.turn, 'timeout');
    return true;
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play' || !ctx.isBot(s.turn)) return;
    if (s.botMove?.turnNo !== s.turnNo) s.botMove = { turnNo: s.turnNo, action: botAction(s, s.turn) };
    const wait = s.settings.seconds ? Math.min(randDelay(1200, 2600), s.settings.seconds * 500) : randDelay(1200, 2600);
    ctx.bot(s.turn, `t${s.turnNo}`, wait, s.botMove.action);
  },

  view(_ctx, s, me): ScrabbleView {
    return {
      game: 'scrabble',
      phase: s.phase,
      order: s.order,
      turn: s.phase === 'play' ? s.turn : null,
      turnNo: s.turnNo,
      board: s.board,
      rack: s.racks[me] ?? [],
      rackCounts: Object.fromEntries(s.order.map((id) => [id, s.racks[id]?.length ?? 0])),
      scores: s.scores,
      bag: s.bag.length,
      last: s.last,
      log: s.log,
      endsAt: s.endsAt,
      total: s.settings.seconds * 1000,
      scoreless: s.scoreless,
      final: s.final,
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase !== 'play' || !s.order.includes(id)) return;
    const next = nextAfter(s, id);
    s.bag = shuffle([...s.bag, ...(s.racks[id] ?? [])]);
    s.racks[id] = [];
    s.order = s.order.filter((p) => p !== id);
    if (s.order.length <= 1) {
      const winner = s.order[0] ?? null;
      s.phase = 'final';
      s.endsAt = null;
      s.final = { winner, out: null, adjust: {}, left: Object.fromEntries(s.order.map((p) => [p, s.racks[p].slice()])) };
      ctx.fx('win', winner ?? undefined);
      return;
    }
    if (s.scoreless >= 2 * s.order.length) {
      endGame(ctx, s, null);
      return;
    }
    if (s.turn === id) startTurn(ctx, s, next);
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (patch.seconds === 0 || patch.seconds === 60 || patch.seconds === 90 || patch.seconds === 120) settings.seconds = patch.seconds;
    if (patch.level === 1 || patch.level === 2) settings.level = patch.level;
  },
};
