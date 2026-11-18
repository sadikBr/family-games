/**
 * «الدومينو» — the game (rules at the top of src/shared/games/domino.ts).
 *
 * A round: shuffle the 28 tiles, 7 to each seat, the rest to «السوق» (2–3 players). The opener plays (the
 * highest double, or the last winner with any tile), then the turn goes round the seats. A player who
 * can't play is handled by the server at once: they draw from «السوق» until a tile fits (when drawing is
 * on), or pass; everyone passing in a row blocks the round. Points go to the round's winner (side), the
 * score sheet keeps every round, and the first side to reach the target wins (a podium at the end).
 *
 * The view never holds another hand or the boneyard's order: only the counts (hands are shown to all when
 * a round ends, as they're counted openly at the table). Bots see the same (server/domino-bot.ts).
 */
import {
  DOMINO_HAND,
  DOMINO_SET,
  DOMINO_TARGETS,
  DOMINO_TURN_SECONDS,
  endsOf,
  handPips,
  isTileId,
  legalEnds,
  openingTile,
  orient,
  pipsOf,
  type DominoEnd,
  type DominoMove,
  type DominoPlaced,
  type DominoRoundResult,
  type DominoSettings,
  type DominoSide,
  type DominoTileId,
  type DominoView,
} from '../../src/shared/games/domino';
import { li } from '../../src/shared/li';
import type { BotLevel } from '../../src/shared/protocol';
import { DOMINO_BOT_MS, chooseDominoMove, legalMoves, type DominoBotInfo, type Rnd } from '../domino-bot';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';
import { placesByScore } from './mcq';

/** The end of a round stays on the screens this long (at the room's pace) before the next one. */
export const DOMINO_ROUND_END_MS = 12000;

interface State {
  settings: DominoSettings;
  /** the seats in the order of play (players who left are taken out) */
  seats: string[];
  teams: boolean;
  sides: DominoSide[];
  phase: DominoView['phase'];
  /** 1-based */
  round: number;
  hands: Record<string, DominoTileId[]>;
  boneyard: DominoTileId[];
  /** drawing from «السوق» this round */
  drawOn: boolean;
  line: DominoPlaced[];
  anchor: number;
  turnIdx: number;
  opening: DominoTileId | null;
  /** passes in a row (everyone: the round is blocked) */
  passes: number;
  /** numbers a player is known to lack (they passed, or drew, with them open) */
  lacks: Record<string, Set<number>>;
  deadline: number | null;
  seq: number;
  last: DominoMove | null;
  result: DominoRoundResult | null;
  history: DominoView['history'];
  nextAt: number | null;
  winner: string | null;
  /** who opens the next round with any tile (null: the highest double) */
  starter: string | null;
  rnd: Rnd;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const snap = (v: unknown, opts: readonly number[], d: number): number =>
  isNum(v) ? opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]) : d;

export function sanitizeDomino(raw: Partial<DominoSettings> | undefined): DominoSettings {
  return {
    target: snap(raw?.target, DOMINO_TARGETS, 101),
    draw: raw?.draw !== false,
    teams: raw?.teams !== false,
    turnSec: snap(raw?.turnSec, DOMINO_TURN_SECONDS, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** «قطعة»، «قطعتان»، «3 قطع»، «11 قطعة» */
export function tilesText(n: number): string {
  if (n === 1) return 'قطعة واحدة';
  if (n === 2) return 'قطعتان';
  if (n <= 10) return `${n} قطع`;
  return `${n} قطعة`;
}

const tileText = (id: DominoTileId) => {
  const [a, b] = pipsOf(id);
  return `${b}|${a}`;
};

function shuffled<T>(arr: readonly T[], rnd: Rnd): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const current = (s: State): string | null => (s.phase === 'play' ? (s.seats[s.turnIdx] ?? null) : null);
const sideOf = (s: State, id: string) => s.sides.find((x) => x.members.includes(id)) ?? null;
const partnerOf = (s: State, id: string): string | null => (s.teams ? (sideOf(s, id)?.members.find((m) => m !== id) ?? null) : null);
const turnMs = (s: State) => s.settings.turnSec * 1000;

function sideName(ctx: GameCtx, s: State, side: DominoSide): string {
  if (!s.teams) return ctx.playerName(side.members[0]);
  return `فريق ${side.members.map((m) => ctx.playerName(m)).join(' و')}`;
}

function movesOf(s: State, id: string) {
  return legalMoves(s.hands[id] ?? [], s.line, s.opening);
}

function record(s: State, m: Omit<DominoMove, 'seq'>) {
  s.seq++;
  s.last = { ...m, seq: s.seq };
}

/* ------------------------------------------------------------------ */
/* Rounds                                                              */
/* ------------------------------------------------------------------ */

function startRound(ctx: GameCtx, s: State) {
  const deck = shuffled(DOMINO_SET, s.rnd);
  s.hands = {};
  for (const id of s.seats) s.hands[id] = deck.splice(0, DOMINO_HAND);
  s.boneyard = deck;
  s.drawOn = s.settings.draw && s.seats.length <= 3 && deck.length > 0;
  s.line = [];
  s.anchor = 0;
  s.passes = 0;
  s.lacks = Object.fromEntries(s.seats.map((id) => [id, new Set<number>()]));
  s.result = null;
  s.nextAt = null;
  s.last = null;
  s.phase = 'play';
  const starter = s.starter && s.seats.includes(s.starter) ? s.starter : null;
  if (starter) {
    s.opening = null;
    s.turnIdx = s.seats.indexOf(starter);
  } else {
    const open = openingTile(s.hands)!;
    s.opening = open.tile;
    s.turnIdx = s.seats.indexOf(open.by);
  }
  ctx.fx('start');
  const who = ctx.playerName(s.seats[s.turnIdx]);
  ctx.say?.(s.opening ? `الجولة ${s.round}: البداية ${li(who)} بالقطعة ${tileText(s.opening)}` : `الجولة ${s.round}: البداية ${li(who)} بأي قطعة`, s.seats[s.turnIdx]);
  settle(ctx, s);
}

/**
 * The turn is at `turnIdx`: wait for a player who can play; draw for one who can't (when drawing is on),
 * or pass. Everyone passing in a row ends the round (blocked).
 */
function settle(ctx: GameCtx, s: State) {
  for (let guard = 0; guard <= s.seats.length + 1; guard++) {
    const id = s.seats[s.turnIdx];
    if (movesOf(s, id).length) {
      s.deadline = turnMs(s) ? ctx.now + turnMs(s) : null;
      return;
    }
    if (s.drawOn && s.boneyard.length) {
      let n = 0;
      while (s.boneyard.length && !movesOf(s, id).length) {
        s.hands[id].push(s.boneyard.pop()!);
        n++;
      }
      record(s, { by: id, kind: 'draw', n });
      // they lacked both ends before drawing, and every tile drawn but the last one too: once that last
      // one is played, the hand lacks them again (what was known before the draw no longer holds)
      const open = endsOf(s.line);
      s.lacks[id] = new Set(open ?? []);
      ctx.fx('card', id);
      ctx.say?.(`من السوق: ${tilesText(n)} · ${ctx.playerName(id)}`, id);
      if (movesOf(s, id).length) {
        s.deadline = turnMs(s) ? ctx.now + turnMs(s) : null;
        return;
      }
    }
    // a pass: with no boneyard left this hand never grows again, so its missing numbers stay known
    const ends = endsOf(s.line);
    if (ends) for (const e of ends) s.lacks[id]?.add(e);
    s.passes++;
    record(s, { by: id, kind: 'pass' });
    ctx.fx('skip', id);
    if (s.passes >= s.seats.length) return endRound(ctx, s, 'blocked', null);
    ctx.say?.(`لا قطعة مناسبة: يمرّ الدور · ${ctx.playerName(id)}`, id);
    s.turnIdx = (s.turnIdx + 1) % s.seats.length;
  }
  // can't happen (someone always plays or the round blocks); end safely
  endRound(ctx, s, 'blocked', null);
}

function play(ctx: GameCtx, s: State, by: string, tile: DominoTileId, endRaw: DominoEnd | undefined) {
  const hand = s.hands[by];
  if (!hand.includes(tile)) throw new GameError('هذه القطعة ليست في يدك');
  if (s.opening && tile !== s.opening) throw new GameError(`ابدأ الجولة بالقطعة ${tileText(s.opening)}`);
  const ends = endsOf(s.line);
  const legal = legalEnds(tile, ends);
  if (!legal.length) throw new GameError('هذه القطعة لا تناسب أي طرف');
  let end: DominoEnd;
  if (!ends) end = 'R';
  else if (ends[0] === ends[1]) end = endRaw ?? 'R'; // equal ends: either side will do
  else if (legal.length === 1) {
    if (endRaw && endRaw !== legal[0]) throw new GameError('هذه القطعة لا تناسب هذا الطرف');
    end = legal[0];
  } else if (!endRaw) throw new GameError('اختر الطرف');
  else end = endRaw;
  const [l, r] = orient(tile, end, ends);
  s.seq++;
  const placed: DominoPlaced = { id: tile, l, r, by, seq: s.seq };
  if (!ends || end === 'R') s.line.push(placed);
  else {
    s.line.unshift(placed);
    s.anchor++;
  }
  s.hands[by] = hand.filter((t) => t !== tile);
  s.last = { seq: s.seq, by, kind: 'play', tile, end };
  s.opening = null;
  s.passes = 0;
  ctx.fx('card', by);
  if (!s.hands[by].length) return endRound(ctx, s, 'domino', by);
  s.turnIdx = (s.turnIdx + 1) % s.seats.length;
  settle(ctx, s);
}

function endRound(ctx: GameCtx, s: State, how: 'domino' | 'blocked', by: string | null) {
  const pips = Object.fromEntries(s.seats.map((id) => [id, handPips(s.hands[id] ?? [])]));
  const sideTotal = (side: DominoSide) => side.members.reduce((t, m) => t + (pips[m] ?? 0), 0);
  let winner: DominoSide | null = null;
  if (how === 'domino' && by) winner = sideOf(s, by);
  else {
    const best = Math.min(...s.sides.map(sideTotal));
    const low = s.sides.filter((x) => sideTotal(x) === best);
    winner = low.length === 1 ? low[0] : null;
    if (winner) {
      // the winning side's lightest hand opens the next round
      by = winner.members.filter((m) => s.seats.includes(m)).sort((a, b) => pips[a] - pips[b] || s.seats.indexOf(a) - s.seats.indexOf(b))[0] ?? null;
    }
  }
  const points = winner ? s.seats.filter((id) => !winner!.members.includes(id)).reduce((t, id) => t + pips[id], 0) : 0;
  if (winner) winner.score += points;
  s.result = {
    round: s.round,
    how,
    winner: winner?.key ?? null,
    by,
    points,
    hands: Object.fromEntries(s.seats.map((id) => [id, (s.hands[id] ?? []).slice()])),
    pips,
  };
  s.history.push({ round: s.round, winner: winner?.key ?? null, points, how });
  s.deadline = null;
  s.starter = winner ? by : null;
  const name = winner ? sideName(ctx, s, winner) : '';
  if (how === 'domino') ctx.say?.(`دومينو! +${points} ${li(name)}`, by ?? undefined);
  else if (winner) ctx.say?.(`اللعبة مقفلة: أقل مجموع ${li(name)} · +${points}`, by ?? undefined);
  else ctx.say?.('اللعبة مقفلة بالتعادل: لا نقاط في هذه الجولة');
  if (winner && winner.score >= s.settings.target) return finish(ctx, s, winner.key);
  s.phase = 'roundEnd';
  s.nextAt = ctx.now + paced(ctx, DOMINO_ROUND_END_MS);
  ctx.fx(winner ? 'reveal' : 'skip', by ?? undefined);
}

function finish(ctx: GameCtx, s: State, winner: string | null) {
  s.phase = 'final';
  s.winner = winner;
  s.deadline = null;
  s.nextAt = null;
  const side = winner ? s.sides.find((x) => x.key === winner) : null;
  ctx.fx('win', side?.members[0]);
  if (side) ctx.say?.(`الفوز ${li(sideName(ctx, s, side))} بـ${side.score} نقطة`, side.members[0]);
}

function nextRound(ctx: GameCtx, s: State) {
  if (s.phase !== 'roundEnd') return;
  s.round++;
  startRound(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

export function botInfo(s: State, id: string): DominoBotInfo {
  return {
    me: id,
    hand: (s.hands[id] ?? []).slice(),
    line: s.line.slice(),
    opening: s.opening,
    seats: s.seats.slice(),
    partner: partnerOf(s, id),
    counts: Object.fromEntries(s.seats.map((p) => [p, s.hands[p]?.length ?? 0])),
    lacks: Object.fromEntries(s.seats.map((p) => [p, [...(s.lacks[p] ?? [])]])),
  };
}

function planBot(ctx: GameCtx, s: State, id: string) {
  const level: BotLevel = ctx.isBot(id) ? botLevel(ctx) : 'smart';
  const m = chooseDominoMove(level, botInfo(s, id), s.rnd);
  if (!m) return;
  const [lo, hi] = DOMINO_BOT_MS[level];
  const options = movesOf(s, id).length;
  let delay = lo + s.rnd() * (hi - lo);
  if (options === 1) delay *= 0.65;
  if (!s.line.length) delay += 500;
  // a drawn tile is looked at first
  if (s.last?.kind === 'draw' && s.last.by === id) delay += 600;
  ctx.bot(id, `p:${s.round}:${s.seq}`, Math.round(delay), { type: 'play', round: s.round, at: s.seq, tile: m.tile, end: m.end });
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startDomino(ctx: GameCtx, participants: string[], raw: DominoSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeDomino(raw);
  const seats = [...participants];
  const teams = settings.teams && seats.length === 4;
  const sides: DominoSide[] = teams
    ? [
        { key: 'A', members: [seats[0], seats[2]], score: 0 },
        { key: 'B', members: [seats[1], seats[3]], score: 0 },
      ]
    : seats.map((id) => ({ key: id, members: [id], score: 0 }));
  const s: State = {
    settings,
    seats,
    teams,
    sides,
    phase: 'play',
    round: 1,
    hands: {},
    boneyard: [],
    drawOn: false,
    line: [],
    anchor: 0,
    turnIdx: 0,
    opening: null,
    passes: 0,
    lacks: {},
    deadline: null,
    seq: 0,
    last: null,
    result: null,
    history: [],
    nextAt: null,
    winner: null,
    starter: null,
    rnd,
  };
  startRound(ctx, s);
  return s;
}

export const domino: GameModule<State, DominoSettings> = {
  id: 'domino',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startDomino(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.seats.includes(by)) return;
    if (isNum(a.round) && a.round !== s.round) return;
    switch (a.type) {
      case 'play': {
        if (s.phase !== 'play') return;
        // a move planned for an earlier position (a bot, or a double tap) is dropped
        if (isNum(a.at) && a.at !== s.seq) return;
        if (current(s) !== by) throw new GameError('ليس دورك');
        if (!isTileId(a.tile)) throw new GameError('اختر قطعة من يدك');
        const end = a.end === 'L' || a.end === 'R' ? a.end : undefined;
        play(ctx, s, by, a.tile, end);
        return;
      }
      case 'next':
        nextRound(ctx, s);
        return;
    }
  },

  tick(ctx, s) {
    if (s.phase === 'play' && s.deadline !== null && ctx.now >= s.deadline) {
      const id = current(s);
      if (!id) return false;
      const m = chooseDominoMove('smart', botInfo(s, id), s.rnd);
      if (!m) return false;
      ctx.say?.(`انتهى الوقت: قطعة تلقائية · ${ctx.playerName(id)}`, id);
      play(ctx, s, id, m.tile, m.end);
      return true;
    }
    if (s.phase === 'roundEnd' && s.nextAt !== null && ctx.now >= s.nextAt) {
      nextRound(ctx, s);
      return true;
    }
    return false;
  },

  turnOf(s) {
    const t = current(s);
    return t ? [t] : [];
  },

  botPlan(ctx, s, bots) {
    const id = current(s);
    if (id && (bots.includes(id) || ctx.isBot(id))) planBot(ctx, s, id);
  },

  view(ctx, s, me): DominoView {
    const turn = current(s);
    const mine = s.hands[me] ?? [];
    const myMoves = turn === me ? movesOf(s, me) : [];
    const byTile = new Map<DominoTileId, DominoEnd[]>();
    const ends = endsOf(s.line);
    for (const m of myMoves) {
      // equal ends: both are offered (the app picks the side with more room)
      const list = ends && ends[0] === ends[1] ? (['L', 'R'] as DominoEnd[]) : [...(byTile.get(m.tile) ?? []), m.end];
      byTile.set(m.tile, list);
    }
    return {
      game: 'domino',
      phase: s.phase,
      round: s.round,
      target: s.settings.target,
      seats: s.seats.slice(),
      teams: s.teams,
      sides: s.sides.map((x) => ({ key: x.key, members: x.members.slice(), score: x.score })),
      line: s.line.map((p) => ({ ...p })),
      anchor: s.anchor,
      ends,
      myHand: [...mine].sort(handOrder),
      moves: [...byTile].map(([tile, e]) => ({ tile, ends: e })),
      counts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      boneyard: s.boneyard.length,
      drawOn: s.drawOn,
      turn,
      deadline: s.deadline,
      turnSec: s.settings.turnSec,
      opening: s.phase === 'play' ? s.opening : null,
      last: s.last ? { ...s.last } : null,
      result: s.phase === 'play' ? null : s.result,
      history: s.history.map((h) => ({ ...h })),
      nextAt: s.nextAt,
      winner: s.winner,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.seats.includes(id) || s.phase === 'final') return;
    if (s.teams) {
      // a pair can't play on without a partner: the game ends, the side ahead wins (a tie: the full pair)
      const [A, B] = s.sides;
      const leaverSide = sideOf(s, id)!;
      const win = A.score === B.score ? (leaverSide === A ? B : A) : A.score > B.score ? A : B;
      s.seats = s.seats.filter((p) => p !== id);
      for (const x of s.sides) x.members = x.members.filter((p) => p !== id);
      delete s.hands[id];
      ctx.say?.('انتهت اللعبة: مقعد فارغ في أحد الفريقين');
      return finish(ctx, s, win.key);
    }
    const wasTurn = current(s) === id;
    const at = s.seats.indexOf(id);
    s.seats = s.seats.filter((p) => p !== id);
    s.sides = s.sides.filter((x) => x.key !== id);
    // the leaver's tiles leave the game with them
    delete s.hands[id];
    delete s.lacks[id];
    if (s.starter === id) s.starter = null;
    if (s.seats.length < 2) {
      const last = s.sides[0];
      return finish(ctx, s, last?.key ?? null);
    }
    if (s.phase !== 'play') return;
    if (at < s.turnIdx) s.turnIdx--;
    if (s.turnIdx >= s.seats.length) s.turnIdx = 0;
    s.passes = Math.min(s.passes, s.seats.length - 1);
    // the opening tile left with its holder: the next player opens with any tile
    if (s.opening && !s.seats.some((p) => s.hands[p].includes(s.opening!))) s.opening = null;
    if (wasTurn) settle(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.target)) settings.target = snap(patch.target, DOMINO_TARGETS, settings.target);
    if (typeof patch.draw === 'boolean') settings.draw = patch.draw;
    if (typeof patch.teams === 'boolean') settings.teams = patch.teams;
    if (isNum(patch.turnSec)) settings.turnSec = snap(patch.turnSec, DOMINO_TURN_SECONDS, settings.turnSec);
  },

  result(s) {
    if (s.phase !== 'final') return null;
    const sides = s.sides.filter((x) => x.members.length);
    if (!sides.length) return null;
    const scores = Object.fromEntries(sides.map((x) => [x.key, x.score]));
    // the winner first (a side that reached the target), then by score; partners share a place
    const order = placesByScore(
      sides.map((x) => x.key),
      { ...scores, ...(s.winner ? { [s.winner]: Infinity } : {}) },
    );
    return { places: order.map((keys) => keys.flatMap((k) => sides.find((x) => x.key === k)!.members)) };
  },
};

/** My hand in order: by the high number, then the low one. */
function handOrder(a: DominoTileId, b: DominoTileId) {
  const [a1, a2] = pipsOf(a);
  const [b1, b2] = pipsOf(b);
  return a2 - b2 || a1 - b1;
}

export type { State as DominoState };
