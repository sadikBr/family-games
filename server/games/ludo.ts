/**
 * لودو — roll the dice and race your 4 pieces home.
 * A 6 (or a 1 with the setting) brings a piece out. A 6 also gives another roll (three 6s in a row lose the turn).
 * Landing on other pieces outside a safe square sends them back to base (+ another roll).
 * Pieces need the exact number to finish; finishing a piece gives another roll.
 */
import { FINISH, SAFE, seatColors, trackIndex } from '../../src/shared/ludo';
import type { LudoColor, LudoSettings, LudoView } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';

interface State {
  settings: LudoSettings;
  seats: { id: string; color: LudoColor }[];
  tokens: Record<string, number[]>;
  turnIdx: number;
  phase: LudoView['phase'];
  dice: number | null;
  rollId: number;
  sixes: number;
  lastMove: LudoView['lastMove'];
  ranking: string[];
  winner: string | null;
  feed: Feed;
  moves: number;
}

const colorOf = (s: State, id: string) => s.seats.find((x) => x.id === id)!.color;
const current = (s: State) => s.seats[s.turnIdx].id;

export function movableTokens(tokens: number[], dice: number, exitOnOne: boolean): number[] {
  const out: number[] = [];
  tokens.forEach((p, i) => {
    if (p >= FINISH) return;
    if (p < 0) {
      if (dice === 6 || (exitOnOne && dice === 1)) out.push(i);
      return;
    }
    if (p + dice <= FINISH) out.push(i);
  });
  return out;
}

function nextTurn(s: State) {
  s.sixes = 0;
  for (let k = 0; k < s.seats.length; k++) {
    s.turnIdx = (s.turnIdx + 1) % s.seats.length;
    if (!s.ranking.includes(current(s))) break;
  }
  s.phase = 'roll';
  s.dice = null;
}

/** Move a token; returns ids of captured players. */
function moveToken(s: State, id: string, t: number): { captured: string[]; finished: boolean } {
  const color = colorOf(s, id);
  const from = s.tokens[id][t];
  const to = from < 0 ? 0 : from + s.dice!;
  s.tokens[id][t] = to;
  const captured: string[] = [];
  const at = trackIndex(color, to);
  if (at !== null && !SAFE.includes(at)) {
    for (const seat of s.seats) {
      if (seat.id === id) continue;
      s.tokens[seat.id] = s.tokens[seat.id].map((p) => {
        if (trackIndex(seat.color, p) === at) {
          if (!captured.includes(seat.id)) captured.push(seat.id);
          return -1;
        }
        return p;
      });
    }
  }
  s.lastMove = { by: id, token: t, from, to, captured };
  return { captured, finished: to === FINISH };
}

function afterMove(ctx: GameCtx, s: State, id: string, res: { captured: string[]; finished: boolean }) {
  if (res.captured.length) {
    s.feed.push(`${ctx.playerName(id)} أكل ${res.captured.map((c) => ctx.playerName(c)).join(' و ')}`, { by: id });
    ctx.fx('boom', res.captured[0]);
  }
  if (res.finished) {
    s.feed.push(`${ctx.playerName(id)} أدخل قطعة إلى البيت`, { by: id });
    ctx.fx('correct', id);
  }
  if (s.tokens[id].every((p) => p >= FINISH)) {
    s.ranking.push(id);
    if (!s.winner) s.winner = id;
    s.phase = 'final';
    ctx.fx('win', id);
    return;
  }
  const again = s.dice === 6 || res.captured.length > 0 || res.finished;
  if (again) {
    s.phase = 'roll';
    s.dice = null;
  } else nextTurn(s);
}

export const ludo: GameModule<State, LudoSettings> = {
  id: 'ludo',

  start(ctx, participants, settings) {
    const colors = seatColors(participants.length);
    const seats = participants.map((id, i) => ({ id, color: colors[i] }));
    ctx.fx('start');
    return {
      settings,
      seats,
      tokens: Object.fromEntries(participants.map((id) => [id, [-1, -1, -1, -1]])),
      turnIdx: Math.floor(Math.random() * participants.length),
      phase: 'roll',
      dice: null,
      rollId: 0,
      sixes: 0,
      lastMove: null,
      ranking: [],
      winner: null,
      feed: new Feed(),
      moves: 0,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    if (current(s) !== by) throw new GameError('ماشي دورك');
    if (a.type === 'roll') {
      if (s.phase !== 'roll') return;
      const d = 1 + Math.floor(Math.random() * 6);
      s.dice = d;
      s.rollId += 1;
      s.moves += 1;
      ctx.fx('tick', by);
      if (d === 6) {
        s.sixes += 1;
        if (s.sixes === 3) {
          s.feed.push(`${ctx.playerName(by)}: ثلاث ستات! ضاع الدور`, { by });
          nextTurn(s);
          s.dice = d;
          return;
        }
      }
      const can = movableTokens(s.tokens[by], d, s.settings.exitOnOne);
      if (!can.length) {
        s.feed.push(`${ctx.playerName(by)} رمى ${d} — لا توجد حركة`, { by });
        nextTurn(s);
        s.dice = d; // keep showing the roll
        return;
      }
      s.phase = 'move';
      return;
    }
    if (a.type === 'move') {
      if (s.phase !== 'move' || !isNum(a.token)) return;
      const can = movableTokens(s.tokens[by], s.dice!, s.settings.exitOnOne);
      if (!can.includes(a.token)) throw new GameError('لا يمكن تحريك هذه القطعة');
      s.moves += 1;
      const res = moveToken(s, by, a.token);
      ctx.fx('card', by);
      afterMove(ctx, s, by, res);
    }
  },

  botPlan(ctx, s) {
    if (s.phase === 'final') return;
    const bot = current(s);
    if (!ctx.isBot(bot)) return;
    if (s.phase === 'roll') {
      ctx.bot(bot, `roll:${s.moves}`, randDelay(2600, 3200), { type: 'roll' });
      return;
    }
    const color = colorOf(s, bot);
    const can = movableTokens(s.tokens[bot], s.dice!, s.settings.exitOnOne);
    const score = (t: number) => {
      const from = s.tokens[bot][t];
      const to = from < 0 ? 0 : from + s.dice!;
      const at = trackIndex(color, to);
      let v = to / 10;
      if (to === FINISH) v += 40;
      if (from < 0) v += 25;
      if (at !== null && !SAFE.includes(at)) {
        for (const seat of s.seats) if (seat.id !== bot && s.tokens[seat.id].some((p) => trackIndex(seat.color, p) === at)) v += 50;
      }
      if (at !== null && SAFE.includes(at)) v += 6;
      return v + Math.random();
    };
    const best = can.sort((x, y) => score(y) - score(x))[0];
    ctx.bot(bot, `move:${s.moves}`, randDelay(1300, 1800), { type: 'move', token: best });
  },

  view(ctx, s, me): LudoView {
    return {
      game: 'ludo',
      phase: s.phase,
      seats: s.seats,
      tokens: s.tokens,
      turn: current(s),
      dice: s.dice,
      rollId: s.rollId,
      movable: s.phase === 'move' && current(s) === me ? movableTokens(s.tokens[me], s.dice!, s.settings.exitOnOne) : [],
      lastMove: s.lastMove,
      winner: s.winner,
      ranking: s.ranking,
      feed: s.feed.list(),
    };
  },

  onLeave(ctx, s, id) {
    const i = s.seats.findIndex((x) => x.id === id);
    if (i < 0 || s.phase === 'final') return;
    const wasTurn = s.turnIdx === i;
    s.seats.splice(i, 1);
    delete s.tokens[id];
    s.feed.push(`${ctx.playerName(id)} غادر اللعبة`);
    if (s.seats.length < 2) {
      s.phase = 'final';
      s.winner = s.seats[0]?.id ?? null;
      return;
    }
    if (s.turnIdx > i) s.turnIdx -= 1;
    s.turnIdx %= s.seats.length;
    if (wasTurn) {
      s.phase = 'roll';
      s.dice = null;
    }
  },
};
