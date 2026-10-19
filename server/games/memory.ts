/** «الذاكرة» — turn over two cards; a pair is yours and you go again, otherwise the next player plays. */
import { MEMORY_FACES } from '../../src/shared/memory';
import type { MemorySettings, MemoryView } from '../../src/shared/protocol';
import { randDelay } from '../cardkit';
import { memoryBotFlip } from '../ai/misc-memory';
import { GameError, botLevel, type GameModule } from '../types';
import { isNum, shuffle } from '../util';
import { VB, voiceResult } from '../voice-calls-boards';

/** two cards that don't match stay face up this long before turning back */
export const PEEK_MS = 2400;

interface State {
  settings: MemorySettings;
  order: string[];
  turnIdx: number;
  deck: string[];
  owners: (string | null)[];
  flipped: number[];
  peekUntil: number | null;
  pairs: Record<string, number>;
  phase: MemoryView['phase'];
  seen: Record<number, string>; // every card that has been face up (what the bots may remember)
  moves: number;
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

export const memory: GameModule<State, MemorySettings> = {
  turnOf: (s) => s.phase === 'play' && s.peekUntil === null ? [s.order[s.turnIdx]] : [],
  id: 'memory',

  start(ctx, participants, settings) {
    const faces = shuffle(MEMORY_FACES).slice(0, settings.pairs);
    ctx.fx('start');
    return {
      settings,
      order: shuffle(participants),
      turnIdx: 0,
      deck: shuffle([...faces, ...faces]),
      owners: Array(faces.length * 2).fill(null),
      flipped: [],
      peekUntil: null,
      pairs: Object.fromEntries(participants.map((p) => [p, 0])),
      phase: 'play',
      seen: {},
      moves: 0,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play' || a.type !== 'flip' || s.peekUntil !== null) return;
    if (s.order[s.turnIdx] !== by) throw new GameError('ليس دورك');
    if (!isNum(a.card) || a.card < 0 || a.card >= s.deck.length || s.owners[a.card] || s.flipped.includes(a.card)) return;
    // the pair found just before stays marked until this flip
    if (s.flipped.length === 2) s.flipped = [];
    s.flipped.push(a.card);
    s.seen[a.card] = s.deck[a.card];
    s.moves += 1;
    ctx.fx('card', by);
    if (s.flipped.length < 2) return;
    const [x, y] = s.flipped;
    if (s.deck[x] === s.deck[y]) {
      s.owners[x] = s.owners[y] = by;
      s.pairs[by] += 1;
      // the pair stays in `flipped` (shown as just found) until the next flip
      ctx.fx('correct', by);
      ctx.say?.(`زوج لـ${ctx.playerName(by)} ودورٌ آخر`, by, VB.pair);
      if (s.owners.every(Boolean)) {
        s.phase = 'final';
        const best = Math.max(...Object.values(s.pairs));
        const top = Object.keys(s.pairs).filter((p) => s.pairs[p] === best);
        ctx.fx('win', top.length === 1 ? top[0] : undefined);
        ctx.say?.(top.length === 1 ? `انتهت اللعبة: الفوز لـ${ctx.playerName(top[0])}` : 'انتهت اللعبة بالتعادل', undefined, voiceResult(top.length === 1 ? ctx.playerName(top[0]) : null));
      }
    } else {
      s.peekUntil = ctx.now + PEEK_MS;
      ctx.say?.(`بطاقتان غير متطابقتين من ${ctx.playerName(by)}`, by);
    }
  },

  tick(ctx, s) {
    if (s.peekUntil === null || ctx.now < s.peekUntil) return false;
    s.peekUntil = null;
    s.flipped = [];
    s.turnIdx = (s.turnIdx + 1) % s.order.length;
    return true;
  },

  botPlan(ctx, s, bots) {
    const id = s.order[s.turnIdx];
    if (s.phase !== 'play' || s.peekUntil !== null || !bots.includes(id)) return;
    const pick = memoryBotFlip(s, botLevel(ctx));
    ctx.bot(id, `m:${s.moves}`, randDelay(700, 1200), { type: 'flip', card: pick });
  },

  view(ctx, s): MemoryView {
    const best = Math.max(...Object.values(s.pairs));
    return {
      game: 'memory',
      phase: s.phase,
      order: s.order,
      turn: s.order[s.turnIdx],
      size: s.deck.length,
      faces: s.deck.map((f, i) => (s.owners[i] || s.flipped.includes(i) ? f : null)),
      owners: s.owners,
      flipped: s.flipped,
      peek: s.peekUntil !== null,
      pairs: s.pairs,
      winner: s.phase === 'final' ? Object.keys(s.pairs).filter((p) => s.pairs[p] === best) : null,
    };
  },

  onLeave(ctx, s, id) {
    const i = s.order.indexOf(id);
    if (i < 0 || s.phase !== 'play') return;
    s.order.splice(i, 1);
    if (i === s.turnIdx) {
      // it was the leaver's turn: turn their cards back and cancel the flip-back, so the next player starts clean
      s.flipped = [];
      s.peekUntil = null;
    } else if (i < s.turnIdx) s.turnIdx -= 1;
    if (!s.order.length) return;
    s.turnIdx %= s.order.length;
  },

  result(s) {
    if (s.phase !== 'final' || !s.order.length) return null;
    return { places: placesByScore(s.order, (id) => s.pairs[id] ?? 0) };
  },
};
