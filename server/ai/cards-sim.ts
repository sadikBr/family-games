/**
 * Bot-vs-bot simulator for the card games' tests and benchmarks (bots-cards.test.ts).
 * Mimics the room: after every change each bot plans (with its own strength — the room has one level
 * for everyone, the simulator lets two levels meet), scheduled actions run in time order on a
 * virtual clock, `tick` runs as time passes, the host deals the next hand. Math.random is seeded for
 * the whole run so a series is reproducible.
 */
import type { BotLevel, GameAction } from '../../src/shared/protocol';
import { GameError, type GameCtx, type GameModule, type GameResult } from '../types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run `fn` with Math.random seeded. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

export interface SimStats {
  result: GameResult | null;
  state: unknown;
  /** bot actions the game refused (GameError): must stay 0 */
  illegal: number;
  illegalActions: { by: string; action: GameAction; error: string }[];
  /** the slowest single botPlan call, ms */
  maxPlanMs: number;
  /** slowest plan per level */
  maxPlanByLevel: Record<string, number>;
  plans: number;
  /** every plan's duration (ms) by level, to read percentiles */
  planMs: Record<string, number[]>;
  steps: number;
  stuck: boolean;
}

interface Job {
  at: number;
  botId: string;
  key: string;
  action: GameAction;
  n: number;
  /** the state version the bot planned on */
  v: number;
}

export function simulate<S, Settings>(
  mod: GameModule<S, Settings>,
  players: string[],
  levels: Record<string, BotLevel>,
  settings: Settings,
  opts: { seed: number; maxSteps?: number; onState?: (s: S) => void },
): SimStats {
  return withSeed(opts.seed, () => {
    let now = 1_000_000;
    let level: BotLevel = 'expert';
    let planning: string | null = null;
    const keys = new Set<string>();
    let jobs: Job[] = [];
    let jobN = 0;
    let version = 0;
    const ctx: GameCtx = {
      get now() {
        return now;
      },
      fx: () => {},
      say: () => {},
      isConnected: () => true,
      isBot: (id) => id === planning,
      playerName: (id) => id,
      memo: new Map(),
      botLevel: () => level,
      bot: (botId, key, delayMs, action) => {
        const k = `${botId}|${key}`;
        if (keys.has(k)) return;
        keys.add(k);
        jobs.push({ at: now + delayMs, botId, key: k, action, n: ++jobN, v: version });
      },
    } as GameCtx;
    const stats: SimStats = { result: null, state: null, illegal: 0, illegalActions: [], maxPlanMs: 0, maxPlanByLevel: {}, planMs: {}, plans: 0, steps: 0, stuck: false };
    const s = mod.start(ctx, players, settings);
    stats.state = s;
    const plan = () => {
      for (const b of players) {
        level = levels[b] ?? 'expert';
        planning = b;
        // CPU time, not wall time: the test machine is shared, a descheduled process is not a slow bot
        const t0 = process.cpuUsage();
        mod.botPlan?.(ctx, s, [b]);
        const used = process.cpuUsage(t0);
        const ms = (used.user + used.system) / 1000;
        planning = null;
        stats.plans += 1;
        if (ms > stats.maxPlanMs) stats.maxPlanMs = ms;
        if (ms > (stats.maxPlanByLevel[level] ?? 0)) stats.maxPlanByLevel[level] = ms;
        if (ms > 0.5) (stats.planMs[level] ??= []).push(ms);
      }
    };
    const phase = () => (s as { phase?: string }).phase;
    const maxSteps = opts.maxSteps ?? 20000;
    plan();
    let idle = 0;
    while (stats.steps < maxSteps) {
      if (phase() === 'final') break;
      if (mod.result?.(s)) break;
      if (!jobs.length) {
        const p = phase();
        if (p === 'handEnd' || p === 'roundEnd') {
          mod.act(ctx, s, players[0], { type: 'next' });
          version += 1;
          plan();
          continue;
        }
        // let time pass (challenge windows, timers)
        now += 1000;
        const changed = mod.tick?.(ctx, s);
        if (changed) {
          version += 1;
          plan();
        }
        if (++idle > 30) {
          stats.stuck = true;
          break;
        }
        continue;
      }
      idle = 0;
      jobs.sort((a, b) => a.at - b.at || a.n - b.n);
      const job = jobs.shift()!;
      now = Math.max(now, job.at);
      stats.steps += 1;
      try {
        mod.act(ctx, s, job.botId, job.action);
        version += 1;
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        // refused although nothing changed since the bot decided: an illegal move
        if (job.v === version) {
          stats.illegal += 1;
          stats.illegalActions.push({ by: job.botId, action: job.action, error: e.message });
        }
        keys.delete(job.key);
      }
      if (mod.tick?.(ctx, s)) version += 1;
      opts.onState?.(s);
      plan();
    }
    stats.result = mod.result?.(s) ?? null;
    return stats;
  });
}
