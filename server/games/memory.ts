/** «الذاكرة» — turn over two cards; a pair is yours and you go again, otherwise the next player plays. */
import { MEMORY_FACES } from '../../src/shared/memory';
import type { MemorySettings, MemoryView } from '../../src/shared/protocol';
import { randDelay } from '../cardkit';
import { GameError, type GameModule } from '../types';
import { isNum, shuffle } from '../util';

const PEEK_MS = 1600;

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
  seen: Record<number, string>; // what bots have seen (with imperfect memory)
  moves: number;
}

export const memory: GameModule<State, MemorySettings> = {
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
    if (s.order[s.turnIdx] !== by) throw new GameError('ماشي دورك');
    if (!isNum(a.card) || a.card < 0 || a.card >= s.deck.length || s.owners[a.card] || s.flipped.includes(a.card)) return;
    s.flipped.push(a.card);
    s.seen[a.card] = s.deck[a.card];
    s.moves += 1;
    ctx.fx('card', by);
    if (s.flipped.length < 2) return;
    const [x, y] = s.flipped;
    if (s.deck[x] === s.deck[y]) {
      s.owners[x] = s.owners[y] = by;
      s.pairs[by] += 1;
      s.flipped = [];
      ctx.fx('correct', by);
      if (s.owners.every(Boolean)) {
        s.phase = 'final';
        const best = Math.max(...Object.values(s.pairs));
        const top = Object.keys(s.pairs).filter((p) => s.pairs[p] === best);
        ctx.fx('win', top.length === 1 ? top[0] : undefined);
      }
    } else s.peekUntil = ctx.now + PEEK_MS;
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
    const hidden = s.deck.map((_, i) => i).filter((i) => !s.owners[i] && !s.flipped.includes(i));
    // imperfect memory: a bot remembers each seen card with 70% chance
    const memo = Object.entries(s.seen).filter(([i]) => !s.owners[Number(i)] && Math.random() < 0.7);
    let pick: number;
    if (s.flipped.length === 1) {
      const face = s.deck[s.flipped[0]];
      const known = memo.find(([i, f]) => f === face && Number(i) !== s.flipped[0]);
      pick = known ? Number(known[0]) : hidden[Math.floor(Math.random() * hidden.length)];
    } else {
      const byFace = new Map<string, number[]>();
      for (const [i, f] of memo) byFace.set(f, [...(byFace.get(f) ?? []), Number(i)]);
      const pair = [...byFace.values()].find((v) => v.length >= 2);
      pick = pair ? pair[0] : hidden[Math.floor(Math.random() * hidden.length)];
    }
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
};
