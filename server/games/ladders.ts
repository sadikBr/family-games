/**
 * «سلّم الحسنات» — snakes & ladders where ladders are good deeds and snakes are bad habits.
 * One die; first to square 100 wins (with `exact`, you need the exact number, otherwise you stay put).
 */
import { JUMPS } from '../../src/shared/islamic';
import type { BoardCard, LaddersSettings, LaddersView } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { GameError, type GameModule } from '../types';
import { shuffle } from '../util';
import { VB, voiceAnd, voiceWinner } from '../voice-calls-boards';

interface State {
  settings: LaddersSettings;
  players: { id: string; pos: number; since: number }[]; // since: the roll that brought them to `pos`
  turnIdx: number;
  phase: LaddersView['phase'];
  dice: number | null;
  rollId: number;
  card: BoardCard | null;
  cardN: number;
  winner: string | null;
  feed: Feed;
}

/** «لماما»، «للحسن»: a name after the preposition لـ (announcements never conjugate a verb for the player). */
const li = (n: string) => (/^[\u0621-\u064A]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);

const cur = (s: State) => s.players[s.turnIdx];

/** Finishing order: furthest along first; on the same square, whoever got there first. */
export function laddersOrder(s: State): string[] {
  return [...s.players].sort((a, b) => b.pos - a.pos || a.since - b.since).map((p) => p.id);
}

export const ladders: GameModule<State, LaddersSettings> = {
  turnOf: (s) => s.phase === 'roll' ? [cur(s).id] : [],
  id: 'ladders',

  start(ctx, participants, settings) {
    ctx.fx('start');
    return {
      settings,
      players: shuffle(participants).map((id) => ({ id, pos: 0, since: 0 })),
      turnIdx: 0,
      phase: 'roll',
      dice: null,
      rollId: 0,
      card: null,
      cardN: 0,
      winner: null,
      feed: new Feed(),
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'roll' || a.type !== 'roll') return;
    const p = cur(s);
    if (!p || p.id !== by) throw new GameError('ليس دورك');
    const d = 1 + Math.floor(Math.random() * 6);
    s.dice = d;
    s.rollId += 1;
    ctx.fx('tick', by);
    let to = p.pos + d;
    if (to > 100) {
      if (s.settings.exact) {
        s.feed.push(`${ctx.playerName(by)} يحتاج ${100 - p.pos} بالضبط`, { by });
        to = p.pos;
      } else to = 100;
    }
    const from = p.pos;
    p.pos = to;
    const jump = JUMPS[to];
    if (jump) {
      p.pos = jump.to;
      s.card = { id: ++s.cardN, by, kind: jump.kind, title: jump.deed.title, text: jump.deed.text };
      s.feed.push(`${ctx.playerName(by)}: ${jump.deed.title} ${jump.kind === 'ladder' ? '↑' : '↓'} ${jump.to}`, { by });
      ctx.fx(jump.kind === 'ladder' ? 'correct' : 'buzz', by);
    }
    if (p.pos !== from) p.since = s.rollId;
    const name = li(ctx.playerName(by));
    // read aloud: a ladder, a snake, and the winner on square 100
    const voice = voiceAnd(jump && (jump.kind === 'ladder' ? VB.ladder : VB.snake), p.pos === 100 && voiceWinner(ctx.playerName(by)));
    if (jump) ctx.say?.(`رمية ${name}: ${d} — ${jump.deed.title}: ${jump.kind === 'ladder' ? 'صعود' : 'نزول'} إلى ${p.pos}`, by, voice);
    else if (p.pos === from) ctx.say?.(`رمية ${name}: ${d} — المطلوب ${100 - from} بالضبط`, by);
    else ctx.say?.(`رمية ${name}: ${d} — إلى الخانة ${p.pos}`, by, voice);
    if (p.pos === 100) {
      s.winner = by;
      s.phase = 'final';
      ctx.fx('win', by);
      return;
    }
    s.turnIdx = (s.turnIdx + 1) % s.players.length;
  },

  botPlan(ctx, s, bots) {
    const p = cur(s);
    if (!p || s.phase !== 'roll' || !bots.includes(p.id)) return;
    ctx.bot(p.id, `roll:${s.rollId}`, randDelay(2600, 3400), { type: 'roll' });
  },

  view(ctx, s): LaddersView {
    return {
      game: 'ladders',
      phase: s.phase,
      players: s.players.map((p) => ({ id: p.id, pos: p.pos })),
      turn: cur(s)?.id ?? '',
      dice: s.dice,
      rollId: s.rollId,
      card: s.card,
      winner: s.winner,
      order: s.phase === 'final' ? laddersOrder(s) : null,
      feed: s.feed.list(),
    };
  },

  onLeave(ctx, s, id) {
    const i = s.players.findIndex((p) => p.id === id);
    if (i < 0 || s.phase === 'final') return;
    s.players.splice(i, 1);
    if (!s.players.length) return;
    if (i < s.turnIdx || s.turnIdx >= s.players.length) s.turnIdx = (s.turnIdx - (i < s.turnIdx ? 1 : 0)) % s.players.length;
    if (s.players.length === 1) {
      s.winner = s.players[0].id;
      s.phase = 'final';
      ctx.fx('win', s.winner);
    }
  },

  /** The finishing order of the final screen: furthest along first (same square: whoever got there first). */
  result(s) {
    const winner = s.winner;
    if (s.phase !== 'final' || !winner) return null;
    return { places: [winner, ...laddersOrder(s).filter((id) => id !== winner)].map((id) => [id]) };
  },
};
