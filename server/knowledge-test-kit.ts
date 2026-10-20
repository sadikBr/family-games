/**
 * Test helpers for «كم تقدّر؟», «صح أم خطأ» and «الأعلام والعواصم»: a fake game context that records bot
 * jobs, fx and says, a seeded random, and a loop that plays a game to its end with the bots.
 */
import type { BotLevel, GameAction } from '../src/shared/protocol';
import type { GameCtx, GameModule } from './types';

export interface Job {
  at: number;
  by: string;
  key: string;
  a: GameAction;
  done?: boolean;
}
export type Said = { text: string; by?: string; voice?: string };

export type TestCtx = GameCtx & { jobs: Job[]; fxs: [string, string | undefined][]; said: Said[]; offline: Set<string> };

export function fakeCtx(bots: string[] = [], level: BotLevel = 'expert'): TestCtx {
  const keys = new Set<string>();
  const ctx: TestCtx = {
    now: 1_000_000,
    fx: (k, t) => ctx.fxs.push([k, t]),
    say: (text, by, voice) => ctx.said.push({ text, by, voice }),
    isConnected: (id) => !ctx.offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      ctx.jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs: [],
    fxs: [],
    said: [],
    offline: new Set(),
  };
  return ctx;
}

/** A small seeded random (mulberry32), so a test can be replayed. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Timed {
  phase: string;
  endsAt: number | null;
}

/**
 * Plays the game with the bots until it ends: plan, jump to the next bot job or timer, act, tick.
 * `onStep` sees every state on the way (to check the views). Returns the number of steps.
 */
export function playOut<S extends Timed>(mod: GameModule<S, never>, ctx: TestCtx, s: S, bots: string[], onStep?: (s: S) => void, maxSteps = 5000): number {
  for (let step = 0; step < maxSteps; step++) {
    if (s.phase === 'final') return step;
    mod.botPlan?.(ctx, s, bots);
    const due = ctx.jobs.filter((j) => !j.done).sort((x, y) => x.at - y.at)[0];
    const t = Math.min(due?.at ?? Infinity, s.endsAt ?? Infinity);
    if (t === Infinity) throw new Error('stuck: no job and no timer');
    ctx.now = Math.max(ctx.now, t);
    for (const j of ctx.jobs) {
      if (j.done || j.at > ctx.now) continue;
      j.done = true;
      mod.act(ctx, s, j.by, j.a);
    }
    mod.tick?.(ctx, s);
    onStep?.(s);
  }
  throw new Error('the game did not end');
}
