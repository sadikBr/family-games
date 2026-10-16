import type { PotatoSettings, PotatoView } from '../../src/shared/protocol';
import { potatoAnswerPool } from '../bot-content';
import { POTATO_PROMPTS } from '../content';
import { GameError, type GameCtx, type GameModule } from '../types';
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

export const potato: GameModule<State, PotatoSettings> = {
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
        return;
      }
      case 'throw': {
        if (s.phase !== 'play' || by !== s.holderId || !isStr(a.to)) return;
        if (ctx.now - s.receivedAt < MIN_HOLD_MS) throw new GameError('قل كلمة أولاً!');
        const eligible = eligibleTargets(ctx, s);
        let to: string = a.to;
        if (ctx.isBot(by) && !eligible.includes(to) && eligible.length) to = pick(eligible);
        if (!eligible.includes(to)) {
          throw new GameError('ممنوع ترجعها لمن رماها لك!');
        }
        s.fromId = by;
        s.holderId = to;
        s.receivedAt = ctx.now;
        s.passes += 1;
        s.lastWord = ctx.isBot(by) && isStr(a.word) ? { by, word: a.word } : null;
        ctx.fx('throw', to);
        return;
      }
      case 'next': {
        if (s.phase !== 'boom') return;
        if (s.round >= s.settings.rounds) {
          s.phase = 'final';
          ctx.fx('win');
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
        return true;
      }
    }
    return false;
  },

  view(ctx, s): PotatoView {
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
      ctx.bot(bot, `throw:${s.round}:${s.passes}`, randInt(1300, 3200), {
        type: 'throw',
        to: pick(targets),
        word: pick(potatoAnswerPool(s.category)),
      });
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
};
