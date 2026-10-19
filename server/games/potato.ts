import type { PotatoSettings, PotatoView } from '../../src/shared/protocol';
import { potatoAnswerPool } from '../bot-content';
import { POTATO_PROMPTS } from '../content';
import { botLevel, GameError, type GameCtx, type GameModule } from '../types';
import { Deck, isStr, pick, randInt } from '../util';

const MIN_HOLD_MS = 700; // you must at least *say* a word before throwing

interface State {
  settings: PotatoSettings;
  phase: PotatoView['phase'];
  participants: string[];
  holderId: string;
  fromId: string | null;
  receivedAt: number;
  round: number;
  category: string;
  startedAt: number | null;
  explodeAt: number | null;
  passes: number;
  burns: Record<string, number>;
  loserId: string | null;
  lastWord: { by: string; word: string } | null;
  /** how long each player held the potato before throwing it (public: everyone sees it fly), for the bots */
  holds?: Record<string, { ms: number; n: number }>;
}

function prompts(ctx: GameCtx): Deck<string> {
  let d = ctx.memo.get('potato') as Deck<string> | undefined;
  if (!d) {
    d = new Deck(POTATO_PROMPTS);
    ctx.memo.set('potato', d);
  }
  return d;
}

function eligibleTargets(ctx: GameCtx, s: State): string[] {
  const others = s.participants.filter((id) => id !== s.holderId && ctx.isConnected(id));
  // no instant throw-backs when there are enough players
  if (others.length > 1 && s.fromId) return others.filter((id) => id !== s.fromId);
  return others;
}

function newRound(ctx: GameCtx, s: State, starter: string) {
  s.round += 1;
  s.phase = 'ready';
  s.holderId = starter;
  s.fromId = null;
  s.category = prompts(ctx).draw();
  s.startedAt = null;
  s.explodeAt = null;
  s.passes = 0;
  s.loserId = null;
  s.lastWord = null;
}

/**
 * How long a bot holds the potato: it has to say a word first (the game refuses a throw before
 * MIN_HOLD_MS). Easy: 1.3–3.2 s like the old bots. Smart / expert: says a short word and throws at once,
 * quicker still once the fuse has burned past its shortest length (it could go off any moment). The fuse
 * itself is secret: only the time since the start, which everyone sees, is used.
 */
export function potatoDelay(s: Pick<State, 'settings' | 'startedAt'>, level: 'easy' | 'smart' | 'expert', now: number): number {
  if (level === 'easy') return randInt(1300, 3200);
  const elapsed = s.startedAt === null ? 0 : now - s.startedAt;
  const min = Math.max(5, Math.min(s.settings.minFuse, s.settings.maxFuse)) * 1000;
  const danger = elapsed >= min * 0.8;
  if (level === 'smart') return danger ? randInt(1000, 1700) : randInt(1100, 2300);
  return danger ? randInt(850, 1200) : randInt(950, 1500);
}

/**
 * Who a bot throws to. Easy: anyone allowed. Smart / expert: the player who keeps the potato longest (what
 * everyone has seen this game) — the fuse burns while they hold it, not us — and, between equals, the one
 * with the fewest burns (the leader); never the one who'd throw it straight back if there's a choice.
 */
export function potatoTarget(s: Pick<State, 'holds' | 'burns'>, targets: string[], level: 'easy' | 'smart' | 'expert'): string {
  if (level === 'easy' || targets.length === 1) return pick(targets);
  const avg = (id: string) => {
    const h = s.holds?.[id];
    // nobody seen yet: assume an ordinary 2 s
    return h && h.n ? (h.ms + 2000) / (h.n + 1) : 2000;
  };
  const score = (id: string) => avg(id) - 150 * (s.burns[id] ?? 0) + Math.random() * (level === 'expert' ? 50 : 900);
  return [...targets].sort((a, b) => score(b) - score(a))[0];
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

export const potato: GameModule<State, PotatoSettings> = {
  // the holder starts the round, then throws
  turnOf: (s) => (s.phase === 'play' || s.phase === 'ready' ? [s.holderId] : []),
  id: 'potato',
  hostOnly: ['next'],

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      phase: 'ready',
      participants,
      holderId: pick(participants),
      fromId: null,
      receivedAt: 0,
      round: 0,
      category: '',
      startedAt: null,
      explodeAt: null,
      passes: 0,
      burns: Object.fromEntries(participants.map((id) => [id, 0])),
      loserId: null,
      lastWord: null,
    };
    newRound(ctx, s, s.holderId);
    return s;
  },

  act(ctx, s, by, a) {
    switch (a.type) {
      case 'start': {
        if (s.phase !== 'ready') return;
        const min = Math.max(5, Math.min(s.settings.minFuse, s.settings.maxFuse));
        const max = Math.max(min, s.settings.maxFuse);
        s.phase = 'play';
        s.startedAt = ctx.now;
        s.receivedAt = ctx.now;
        s.explodeAt = ctx.now + randInt(min * 1000, max * 1000);
        ctx.fx('start');
        ctx.say?.(`اشتعلت البطاطا! الموضوع: ${s.category}`, s.holderId);
        return;
      }
      case 'throw': {
        if (s.phase !== 'play' || by !== s.holderId || !isStr(a.to)) return;
        if (ctx.now - s.receivedAt < MIN_HOLD_MS) throw new GameError('قل كلمة أولاً!');
        const eligible = eligibleTargets(ctx, s);
        let to: string = a.to;
        if (ctx.isBot(by) && !eligible.includes(to) && eligible.length) to = pick(eligible);
        if (!eligible.includes(to)) {
          throw new GameError('لا يجوز أن تعيدها إلى من رماها إليك!');
        }
        const held = ((s.holds ??= {})[by] ??= { ms: 0, n: 0 });
        held.ms += ctx.now - s.receivedAt;
        held.n += 1;
        s.fromId = by;
        s.holderId = to;
        s.receivedAt = ctx.now;
        s.passes += 1;
        s.lastWord = ctx.isBot(by) && isStr(a.word) ? { by, word: a.word } : null;
        ctx.fx('throw', to);
        ctx.say?.(`البطاطا من ${ctx.playerName(by)} إلى ${ctx.playerName(to)}`, by);
        return;
      }
      case 'next': {
        if (s.phase !== 'boom') return;
        if (s.round >= s.settings.rounds) {
          s.phase = 'final';
          // fewest burns wins
          const least = Math.min(...s.participants.map((id) => s.burns[id] ?? 0));
          const top = s.participants.filter((id) => (s.burns[id] ?? 0) === least);
          if (top.length === 1) ctx.fx('win', top[0]);
          else ctx.fx('win');
          return;
        }
        newRound(ctx, s, s.loserId ?? pick(s.participants));
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.phase !== 'play' || s.explodeAt === null) return false;
    if (ctx.now >= s.explodeAt) {
      s.phase = 'boom';
      s.loserId = s.holderId;
      s.burns[s.holderId] = (s.burns[s.holderId] ?? 0) + 1;
      s.explodeAt = null;
      ctx.fx('boom', s.holderId);
      ctx.say?.(`بوم! انفجرت البطاطا في يد ${ctx.playerName(s.holderId)}`, s.holderId);
      return true;
    }
    // the holder's phone went to sleep: toss the potato to someone else
    if (!ctx.isConnected(s.holderId) && ctx.now - s.receivedAt > 3000) {
      const targets = eligibleTargets(ctx, s);
      if (targets.length > 0) {
        s.fromId = s.holderId;
        s.holderId = pick(targets);
        s.receivedAt = ctx.now;
        ctx.fx('throw', s.holderId);
        ctx.say?.(`انتقلت البطاطا إلى ${ctx.playerName(s.holderId)}`, s.holderId);
        return true;
      }
    }
    return false;
  },

  view(ctx, s, me): PotatoView {
    return {
      game: 'potato',
      phase: s.phase,
      participants: s.participants,
      holderId: s.holderId,
      fromId: s.fromId,
      round: s.round,
      totalRounds: s.settings.rounds,
      category: s.category,
      startedAt: s.startedAt,
      passes: s.passes,
      burns: s.burns,
      loserId: s.loserId,
      lastWord: s.lastWord,
      targets: s.phase === 'play' && me === s.holderId ? eligibleTargets(ctx, s) : [],
    };
  },

  botPlan(ctx, s) {
    if (!ctx.isBot(s.holderId)) return;
    const bot = s.holderId;
    if (s.phase === 'ready') {
      ctx.bot(bot, `start:${s.round}`, 2200, { type: 'start' });
    } else if (s.phase === 'play') {
      const targets = eligibleTargets(ctx, s);
      if (!targets.length) return;
      const level = botLevel(ctx);
      const word = pick(potatoAnswerPool(s.category));
      ctx.bot(bot, `throw:${s.round}:${s.passes}`, potatoDelay(s, level, ctx.now), { type: 'throw', to: potatoTarget(s, targets, level), word });
    }
  },

  onLeave(ctx, s, id) {
    s.participants = s.participants.filter((p) => p !== id);
    if (s.holderId === id && s.participants.length > 0) {
      s.holderId = pick(s.participants);
      s.receivedAt = ctx.now;
    }
    if (s.fromId === id) s.fromId = null;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    // fewest burns wins
    return { places: placesByScore(s.participants, (id) => -(s.burns[id] ?? 0)) };
  },
};
