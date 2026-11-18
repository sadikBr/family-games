/**
 * «خلية الحروف» — everyone gets the same hive of seven letters at the same time and makes as many words
 * as they can before the timer runs out (rules: src/shared/games/khalia.ts; words and hives:
 * server/khalia-hive.ts).
 *
 * A round: a new hive, a timer of 3, 5 or 8 minutes. Each player's words stay on their own phone; the
 * others see only their points and number of words. The round ends on the timer, or as soon as every
 * person still playing has pressed «انتهيت». Then everyone's words are shown (the ones two players or
 * more found are marked, they still count for each) with the best words nobody found, for 30 s (the
 * host may go on). After the last hive: the podium, by the total of points.
 *
 * Bots find words of the hive's answer list (everyday words) one by one over the round, at a human
 * pace: the easy bot a few short words, slowly; the expert many, long ones and «كلمة الخلية» included.
 */
import {
  KHALIA_DEFAULTS,
  KHALIA_MAX_LEN,
  KHALIA_MINUTES,
  KHALIA_ROUNDS,
  khaliaKey,
  khaliaPangram,
  khaliaPoints,
  khaliaPraise,
  type KhaliaFeedback,
  type KhaliaResult,
  type KhaliaSettings,
  type KhaliaView,
  type KhaliaWord,
} from '../../src/shared/games/khalia';
import type { BotLevel } from '../../src/shared/protocol';
import { checkWord, hiveLetters, maskOf, pickHive, type Hive } from '../khalia-hive';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { roundWin, voiceResult } from '../voice-calls-boards';

/** pause on a round's words before the next hive (the host may skip it) */
export const KHALIA_REVEAL_MS = 30_000;
/** how many of the best words nobody found are shown */
export const KHALIA_MISSED_SHOWN = 10;
/** hives a room remembers, so the next games don't bring them back soon */
const RECENT = 40;

interface PlannedWord {
  key: string;
  at: number;
}

interface State {
  settings: KhaliaSettings;
  players: string[];
  names: Record<string, string>;
  round: number;
  phase: KhaliaView['phase'];
  hive: Hive;
  /** masks of this game's hives (never twice in a game) */
  used: number[];
  found: Record<string, KhaliaWord[]>;
  done: Record<string, boolean>;
  feedback: Record<string, KhaliaFeedback>;
  endsAt: number | null;
  timerTotal: number;
  results: KhaliaResult[] | null;
  missed: KhaliaWord[] | null;
  missedMore: number;
  scores: Record<string, number>;
  /** the words each bot will send this round, with when */
  plans: Record<string, PlannedWord[]>;
}

export function sanitizeKhalia(s: Partial<KhaliaSettings> | undefined): KhaliaSettings {
  const v = { ...KHALIA_DEFAULTS, ...(s ?? {}) };
  return {
    rounds: (KHALIA_ROUNDS as readonly number[]).includes(v.rounds) ? v.rounds : KHALIA_DEFAULTS.rounds,
    minutes: (KHALIA_MINUTES as readonly number[]).includes(v.minutes) ? v.minutes : KHALIA_DEFAULTS.minutes,
  };
}

function recentOf(ctx: GameCtx): number[] {
  const r = ctx.memo.get('khalia:recent');
  return Array.isArray(r) ? (r as number[]) : [];
}

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'play';
  const recent = recentOf(ctx);
  s.hive = pickHive(new Set([...recent, ...s.used]));
  const mask = maskOf(hiveLetters(s.hive).join(''));
  s.used.push(mask);
  ctx.memo.set('khalia:recent', [...recent.filter((m) => m !== mask), mask].slice(-RECENT));
  s.found = Object.fromEntries(s.players.map((p) => [p, []]));
  s.done = {};
  s.feedback = {};
  s.results = null;
  s.missed = null;
  s.missedMore = 0;
  s.plans = {};
  s.timerTotal = s.settings.minutes * 60_000;
  s.endsAt = ctx.now + s.timerTotal;
  ctx.fx('start');
}

const roundPoints = (s: State, id: string) => (s.found[id] ?? []).reduce((a, w) => a + w.points, 0);

/** The top scorer, or null on a tie. */
function topScorer(s: State): string | null {
  if (!s.players.length) return null;
  const best = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
  const top = s.players.filter((id) => (s.scores[id] ?? 0) === best);
  return top.length === 1 ? top[0] : null;
}

/** Points first, then the longer word, then alphabetical order. */
const byWorth = (a: KhaliaWord, b: KhaliaWord) => b.points - a.points || a.word.localeCompare(b.word, 'ar');

function finishRound(ctx: GameCtx, s: State) {
  s.plans = {};
  const count = new Map<string, number>();
  for (const id of s.players) for (const w of s.found[id] ?? []) count.set(w.key, (count.get(w.key) ?? 0) + 1);
  s.results = s.players.map((id) => {
    const words = (s.found[id] ?? []).map((w) => ({ ...w, shared: (count.get(w.key) ?? 0) > 1 })).sort(byWorth);
    const points = words.reduce((a, w) => a + w.points, 0);
    s.scores[id] = (s.scores[id] ?? 0) + points;
    return { id, words, points };
  });
  // the best answer words nobody found: «كلمات الخلية» first, then the most points
  const letters = hiveLetters(s.hive);
  const left: KhaliaWord[] = [];
  for (const [key, word] of s.hive.answers) {
    if (count.has(key)) continue;
    const pangram = khaliaPangram(key, letters);
    left.push({ word, key, pangram, points: khaliaPoints([...key].length, pangram) });
  }
  left.sort((a, b) => Number(b.pangram) - Number(a.pangram) || byWorth(a, b));
  s.missed = left.slice(0, KHALIA_MISSED_SHOWN);
  s.missedMore = Math.max(0, left.length - KHALIA_MISSED_SHOWN);
  s.done = {};
  if (s.round >= s.settings.rounds || !s.players.length) {
    s.phase = 'final';
    s.endsAt = null;
    const w = topScorer(s);
    if (w) ctx.fx('win', w);
    else ctx.fx('win');
    ctx.say?.(w ? `انتهت اللعبة: الفوز لـ${ctx.playerName(w)} (${s.scores[w]} نقطة)` : 'انتهت اللعبة بالتعادل', w ?? undefined, voiceResult(w && ctx.playerName(w)));
  } else {
    s.phase = 'reveal';
    s.timerTotal = paced(ctx, KHALIA_REVEAL_MS);
    s.endsAt = ctx.now + s.timerTotal;
    ctx.fx('reveal');
    const best = Math.max(0, ...s.results.map((r) => r.points));
    const top = s.results.filter((r) => r.points === best);
    if (best > 0 && top.length === 1) ctx.say?.(`انتهت الخلية ${s.round}: الأعلى نقاطاً ${ctx.playerName(top[0].id)} (+${best})`, top[0].id, roundWin(ctx.playerName(top[0].id)));
  }
}

/** Every person still in the game has pressed «انتهيت» (needs at least one person). */
function peopleDone(ctx: GameCtx, s: State): boolean {
  const people = s.players.filter((id) => !ctx.isBot(id) && ctx.isConnected(id));
  return people.length > 0 && people.every((id) => s.done[id]);
}

/** Share of the answer list a bot finds in a 5-minute round: [min, max], by level. */
const BOT_SHARE: Record<BotLevel, [number, number]> = { easy: [0.12, 0.2], smart: [0.28, 0.4], expert: [0.5, 0.68] };

/**
 * A bot's words for a round and when it sends each (ms from now): a sample of the answer list by the
 * room's bot level — the easy bot mostly short words, the expert long ones and the hive's «كلمة الخلية»
 * too. Short words come first, the long ones later, with gaps like a person's (a burst, then a pause).
 */
export function botPlanFor(hive: Hive, level: BotLevel, timeMs: number, rand: () => number = Math.random): PlannedWord[] {
  const letters = hiveLetters(hive);
  const all = [...hive.answers.keys()];
  const [lo, hi] = BOT_SHARE[level];
  const scale = Math.min(1.45, Math.pow(timeMs / 300_000, 0.6));
  const n = Math.min(all.length, Math.max(level === 'easy' ? 2 : 4, Math.round(all.length * (lo + rand() * (hi - lo)) * scale)));
  const len = (k: string) => [...k].length;
  const weight = (k: string) => {
    const l = len(k);
    const p = khaliaPangram(k, letters);
    if (level === 'easy') return p ? 0.05 : l <= 3 ? 4 : l === 4 ? 2.5 : l === 5 ? 0.8 : 0.25;
    if (level === 'smart') return p ? 0.6 : l <= 4 ? 2 : l <= 6 ? 1.2 : 0.6;
    return p ? 6 : 1 + (l - 3) * 0.5;
  };
  const chosen = all
    .map((k) => ({ k, r: Math.pow(rand(), 1 / weight(k)) }))
    .sort((a, b) => b.r - a.r)
    .slice(0, n)
    .map((x) => x.k)
    // short words come to mind first
    .sort((a, b) => len(a) + rand() * 3 - (len(b) + rand() * 3));
  const start = level === 'easy' ? 9000 : level === 'smart' ? 6000 : 4000;
  const end = timeMs * 0.94;
  const times = chosen.map(() => start + Math.pow(rand(), 1.15) * Math.max(0, end - start)).sort((a, b) => a - b);
  return chosen.map((key, i) => ({ key, at: Math.round(times[i]) }));
}

function feedbackFor(s: State, id: string, kind: KhaliaFeedback['kind'], text: string, points = 0) {
  s.feedback[id] = { seq: (s.feedback[id]?.seq ?? 0) + 1, kind, text, points };
}

export function startKhalia(ctx: GameCtx, participants: string[], settings: Partial<KhaliaSettings>): State {
  const s: State = {
    settings: sanitizeKhalia(settings),
    players: [...participants],
    names: Object.fromEntries(participants.map((id) => [id, ctx.playerName(id)])),
    round: 0,
    phase: 'play',
    hive: { centre: '', outer: [], answers: new Map(), max: 0, pangrams: [] },
    used: [],
    found: {},
    done: {},
    feedback: {},
    endsAt: null,
    timerTotal: 0,
    results: null,
    missed: null,
    missedMore: 0,
    scores: Object.fromEntries(participants.map((id) => [id, 0])),
    plans: {},
  };
  newRound(ctx, s);
  return s;
}

export const khalia: GameModule<State, KhaliaSettings> = {
  id: 'khalia',
  hostOnly: ['next'],

  start: startKhalia,

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') newRound(ctx, s);
      return;
    }
    if (!s.players.includes(by) || s.phase !== 'play') return;
    if (a.type === 'done') {
      s.done[by] = true;
      if (peopleDone(ctx, s)) finishRound(ctx, s);
      return;
    }
    if (a.type !== 'word' || s.done[by]) return;
    if (isNum(a.round) && a.round !== s.round) return; // a bot's word from an earlier round
    if (!isStr(a.word)) return;
    const typed = khaliaKey(a.word.slice(0, KHALIA_MAX_LEN * 3)).slice(0, KHALIA_MAX_LEN);
    const mine = s.found[by] ?? (s.found[by] = []);
    const v = checkWord(s.hive, typed, new Set(mine.map((w) => w.key)));
    if (!v.ok) {
      feedbackFor(s, by, 'bad', v.text);
      return;
    }
    mine.push(v.word);
    feedbackFor(s, by, v.word.pangram ? 'pangram' : 'ok', khaliaPraise([...v.word.key].length, v.word.pangram), v.word.points);
    if (v.word.pangram) {
      ctx.fx('correct', by);
      // said to everyone without the word itself
      ctx.say?.(`«كلمة الخلية» من نصيب ${ctx.playerName(by)} (+${v.word.points})`, by);
    } else ctx.fx('card', by);
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'play') finishRound(ctx, s);
    else if (s.phase === 'reveal') newRound(ctx, s);
    else return false;
    return true;
  },

  turnOf(s) {
    return s.phase === 'play' ? s.players.filter((id) => !s.done[id]) : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play' || s.endsAt === null) return;
    // a person who came back takes over from the bot that played for them
    for (const id of Object.keys(s.plans)) if (!bots.includes(id) && !ctx.isBot(id)) delete s.plans[id];
    const left = s.endsAt - ctx.now;
    for (const b of bots) {
      if (!s.players.includes(b) || s.plans[b]) continue;
      const have = new Set((s.found[b] ?? []).map((w) => w.key));
      // a bot that takes over late has less time, so it finds fewer words
      const plan = botPlanFor(s.hive, botLevel(ctx), left).filter((w) => !have.has(w.key));
      s.plans[b] = plan;
      for (const w of plan) ctx.bot(b, `w:${s.round}:${w.key}`, w.at, { type: 'word', word: w.key, round: s.round });
    }
  },

  view(ctx, s, me): KhaliaView {
    const over = s.phase !== 'play';
    return {
      game: 'khalia',
      phase: s.phase,
      round: s.round,
      rounds: s.settings.rounds,
      centre: s.hive.centre,
      outer: s.hive.outer,
      endsAt: s.endsAt,
      timerTotal: s.timerTotal,
      players: s.players,
      names: s.names,
      myWords: s.found[me] ?? [],
      answers: s.hive.answers.size,
      max: s.hive.max,
      pangrams: s.hive.pangrams.length,
      board: s.players.map((id) => ({ id, points: roundPoints(s, id), count: s.found[id]?.length ?? 0, done: !!s.done[id] })),
      done: !!s.done[me],
      feedback: s.feedback[me] ?? null,
      results: over ? s.results : null,
      missed: over ? s.missed : null,
      missedMore: over ? s.missedMore : 0,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, id) {
    s.players = s.players.filter((p) => p !== id);
    delete s.plans[id];
    delete s.scores[id];
    if (s.phase === 'final') return;
    if (!s.players.length) {
      s.phase = 'final';
      s.endsAt = null;
      return;
    }
    if (s.phase === 'play' && peopleDone(ctx, s)) finishRound(ctx, s);
  },

  result(s) {
    if (s.phase !== 'final' || !s.players.length) return null;
    const pts = (id: string) => s.scores[id] ?? 0;
    const vals = [...new Set(s.players.map(pts))].sort((a, b) => b - a);
    return { places: vals.map((v) => s.players.filter((id) => pts(id) === v)) };
  },

  patchSettings(settings, patch) {
    if ((KHALIA_ROUNDS as readonly unknown[]).includes(patch.rounds)) settings.rounds = patch.rounds as number;
    if ((KHALIA_MINUTES as readonly unknown[]).includes(patch.minutes)) settings.minutes = patch.minutes as number;
  },
};

export type { State as KhaliaState };
