/**
 * «المربعات» — dots and boxes for 2–4 players. Draw one line per turn; closing a box scores it and
 * gives another turn; most boxes when the grid is full wins. The starting player rotates between
 * games of the same group and a series score is kept (2 players: the shared duel series).
 */
import { DOTS_SIZES, dotsBoxLines, dotsLineBoxes, dotsLineCount, type DotsLevel, type DotsSettings, type DotsView } from '../../src/shared/games/dots';
import { randDelay } from '../cardkit';
import { dotsBotLine } from '../dots-ai';
import { duelWin, startDuel } from '../duel';
import { GameError, botLevel, type GameCtx, type GameModule } from '../types';
import { isNum, shuffle } from '../util';
import { VB, voiceAnd, voiceResult } from '../voice-calls-boards';

interface State {
  settings: DotsSettings;
  n: number;
  seats: string[];
  names: Record<string, string>;
  active: string[];
  turnIdx: number;
  lines: number[];
  boxes: number[];
  last: number | null;
  lastBoxes: number[];
  points: Record<string, number>;
  phase: DotsView['phase'];
  winners: string[] | null;
  reason: DotsView['reason'];
  moves: number;
  score: Record<string, number>;
  /** the bot's choice for the current move (worked out once per move) */
  botCache: { moves: number; line: number } | null;
}

/** «لماما»، «للحسن»: a name after the preposition لـ (announcements never conjugate a verb for the player). */
const li = (n: string) => (/^[\u0621-\u064A]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);

interface GroupMemo {
  group: string;
  order: string[];
  lastFirst: number;
  score: Record<string, number>;
}

/** 3–4 players: keep the same seating for the group and pass the first move along each game. */
function startGroup(ctx: GameCtx, participants: string[]) {
  const group = participants.slice().sort().join('|');
  const prev = ctx.memo.get('dots:group') as GroupMemo | undefined;
  if (prev && prev.group === group) {
    const lastFirst = (prev.lastFirst + 1) % prev.order.length;
    ctx.memo.set('dots:group', { ...prev, lastFirst });
    return { seats: [...prev.order.slice(lastFirst), ...prev.order.slice(0, lastFirst)], score: prev.score };
  }
  const order = shuffle(participants);
  const score = Object.fromEntries(order.map((p) => [p, 0]));
  ctx.memo.set('dots:group', { group, order, lastFirst: 0, score } satisfies GroupMemo);
  return { seats: order, score };
}

const turnOf = (s: State) => (s.phase === 'play' && s.active.length ? s.active[s.turnIdx % s.active.length] : null);

function finish(ctx: GameCtx, s: State, reason: 'full' | 'forfeit') {
  s.phase = 'final';
  s.reason = reason;
  const best = Math.max(...s.active.map((p) => s.points[p] ?? 0));
  s.winners = s.active.filter((p) => (s.points[p] ?? 0) === best);
  if (s.winners.length !== 1) return; // a tie: no win counted
  const w = s.winners[0];
  if (s.seats.length === 2) duelWin(ctx, s.score, w);
  else {
    s.score[w] = (s.score[w] ?? 0) + 1;
    ctx.fx('win', w);
  }
}

/** A player is out (resigned or left): the others carry on; the last one standing wins. */
function dropOut(ctx: GameCtx, s: State, id: string) {
  const i = s.active.indexOf(id);
  if (i < 0 || s.phase !== 'play') return;
  const wasTurn = i === s.turnIdx;
  s.active.splice(i, 1);
  if (i < s.turnIdx) s.turnIdx -= 1;
  if (s.active.length) s.turnIdx %= s.active.length;
  if (wasTurn) s.botCache = null;
  if (s.active.length <= 1) finish(ctx, s, 'forfeit');
}

export const dots: GameModule<State, DotsSettings> = {
  id: 'dots',

  turnOf: (s) => {
    const t = turnOf(s);
    return t ? [t] : [];
  },

  start(ctx, participants, settings) {
    const n = (DOTS_SIZES as readonly number[]).includes(settings.size) ? settings.size : 4;
    let seats: string[], score: Record<string, number>;
    if (participants.length === 2) {
      const d = startDuel(ctx, 'dots', participants);
      seats = [d.first, d.second];
      score = d.score;
    } else ({ seats, score } = startGroup(ctx, participants));
    ctx.fx('start');
    return {
      settings,
      n,
      seats,
      names: Object.fromEntries(seats.map((p) => [p, ctx.playerName(p)])),
      active: seats.slice(),
      turnIdx: 0,
      lines: Array(dotsLineCount(n)).fill(-1),
      boxes: Array(n * n).fill(-1),
      last: null,
      lastBoxes: [],
      points: Object.fromEntries(seats.map((p) => [p, 0])),
      phase: 'play',
      winners: null,
      reason: null,
      moves: 0,
      score,
      botCache: null,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play' || !s.active.includes(by)) return;
    if (a.type === 'resign') {
      dropOut(ctx, s, by);
      // the last one standing wins: read aloud
      const over = s.phase !== 'play';
      ctx.say?.(`انسحاب من ${ctx.playerName(by)}`, by, voiceAnd(VB.resign, over && voiceResult(s.winners?.length === 1 ? ctx.playerName(s.winners[0]) : null)));
      return;
    }
    if (a.type !== 'line') return;
    if (turnOf(s) !== by) throw new GameError('ليس دورك');
    const e = a.line;
    if (!isNum(e) || !Number.isInteger(e) || e < 0 || e >= s.lines.length) return;
    if (s.lines[e] >= 0) throw new GameError('هذا الخط مرسوم من قبل');
    const seat = s.seats.indexOf(by);
    s.lines[e] = seat;
    s.last = e;
    s.moves += 1;
    s.lastBoxes = dotsLineBoxes(s.n, e).filter((b) => s.boxes[b] < 0 && dotsBoxLines(s.n, b).every((x) => s.lines[x] >= 0));
    for (const b of s.lastBoxes) s.boxes[b] = seat;
    const k = s.lastBoxes.length;
    if (s.lastBoxes.length) {
      s.points[by] += s.lastBoxes.length;
      ctx.fx('correct', by);
      if (s.boxes.every((o) => o >= 0)) finish(ctx, s, 'full');
    } else {
      ctx.fx('card', by);
      s.turnIdx = (s.turnIdx + 1) % s.active.length;
    }
    // read aloud (after the end check): two boxes with one line, and the winner
    const over = s.phase !== 'play';
    const voice = voiceAnd(k === 2 && VB.twoBoxes, over && voiceResult(s.winners?.length === 1 ? ctx.playerName(s.winners[0]) : null));
    ctx.say?.(k ? `${k === 1 ? 'مربع' : 'مربعان'} ${li(ctx.playerName(by))} — ودور إضافي` : `خط من ${ctx.playerName(by)}`, by, voice);
  },

  botPlan(ctx, s, bots) {
    const id = turnOf(s);
    if (!id || !bots.includes(id)) return;
    if (s.botCache?.moves !== s.moves) {
      const drawn = s.lines.map((x) => x >= 0);
      // the room's «مستوى البوتات» (the old per-game level is ignored)
      const level = botLevel(ctx);
      s.botCache = { moves: s.moves, line: dotsBotLine(s.n, drawn, level === 'expert' ? 'expert' : level === 'smart' ? 'medium' : 'easy') };
    }
    // a quicker hand while eating a chain
    const delay = s.lastBoxes.length && s.seats[s.lines[s.last ?? 0]] === id ? randDelay(380, 650) : randDelay(650, 1150);
    ctx.bot(id, `d:${s.moves}`, delay, { type: 'line', line: s.botCache.line });
  },

  view(ctx, s, me): DotsView {
    return {
      game: 'dots',
      phase: s.phase,
      n: s.n,
      seats: s.seats,
      names: s.names,
      active: s.active,
      turn: turnOf(s),
      lines: s.lines,
      boxes: s.boxes,
      last: s.last,
      lastBoxes: s.lastBoxes,
      points: s.points,
      winners: s.winners,
      reason: s.reason,
      score: s.score,
      me: s.seats.indexOf(me),
    };
  },

  onLeave(ctx, s, id) {
    dropOut(ctx, s, id);
  },

  /** Players still in by boxes, then everyone who dropped out (resigned or left) sharing last place. */
  result(s) {
    if (s.phase !== 'final' || !s.active.length) return null;
    const pts = (p: string) => s.points[p] ?? 0;
    const vals = [...new Set(s.active.map(pts))].sort((a, b) => b - a);
    const places = vals.map((v) => s.active.filter((p) => pts(p) === v));
    const out = s.seats.filter((p) => !s.active.includes(p));
    return { places: out.length ? [...places, out] : places };
  },

  patchSettings(settings, patch) {
    if (isNum(patch.size) && (DOTS_SIZES as readonly number[]).includes(patch.size)) settings.size = patch.size;
    if (patch.level === 'easy' || patch.level === 'medium' || patch.level === 'hard') settings.level = patch.level as DotsLevel;
  },
};
