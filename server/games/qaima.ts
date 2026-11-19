/**
 * «املأ القائمة» — fill the list (src/shared/games/qaima.ts has the rules). Each round: one list from the
 * room's deck (server/qaima-lists.ts), everyone types at once for `seconds`; each «add» is checked here
 * (server/qaima-match.ts) and answered on the player's own phone: accepted, «مكتوب من قبل» or «غير موجود
 * في القائمة». The round ends when the time runs out, or when every player still here pressed «انتهيت»
 * (the bots then type the rest of what they planned at once). The reveal (paced; the host can skip it)
 * shows the whole list with who found what. 1 point per answer, +1 when nobody else found it.
 *
 * Hidden until the reveal: the list's items, and which items the others found (only their counts).
 */
import {
  QAIMA_DEFAULTS,
  QAIMA_ROUNDS,
  QAIMA_SECONDS,
  qaimaPoints,
  type QaimaNote,
  type QaimaResult,
  type QaimaReveal,
  type QaimaSettings,
  type QaimaView,
} from '../../src/shared/games/qaima';
import { planBotRound, type BotTry } from '../qaima-bots';
import { QAIMA_BY_ID, QAIMA_LISTS } from '../qaima-lists';
import { qaimaMatch, type QaimaListDef } from '../qaima-match';
import { qdeck } from '../qdeck';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { PVOICE, voiceFinal, voiceOnly } from '../voice-calls-party';
import { placesByScore, soleWinner } from './mcq';
import { snapTo } from './speedquiz';

/** The reveal's pause (the host can skip it). */
export const QAIMA_REVEAL_MS = 16000;
/** At most this many answers per player and round (a stuck key, a script). */
export const QAIMA_MAX_TRIES = 400;
/** «أشهر ما فات الجميع»: at most this many. */
const MISSED_MAX = 8;

type Rnd = () => number;

export interface QaimaState {
  settings: QaimaSettings;
  participants: string[];
  /** the lists of the game, one per round (ids) */
  lists: string[];
  /** 0-based */
  round: number;
  phase: 'play' | 'reveal' | 'final';
  startedAt: number;
  endsAt: number | null;
  /** this round: the items each player found (indices into the list), in order */
  found: Record<string, number[]>;
  tries: Record<string, number>;
  notes: Record<string, QaimaNote>;
  done: string[];
  reveal: QaimaReveal | null;
  scores: Record<string, number>;
  /** the bots' attempts for the round they were planned for */
  plans: Record<string, { round: number; tries: BotTry[] }>;
  rnd: Rnd;
}

export function sanitizeQaima(raw: Partial<QaimaSettings> | undefined): QaimaSettings {
  return {
    rounds: snapTo(raw?.rounds, QAIMA_ROUNDS, QAIMA_DEFAULTS.rounds),
    seconds: snapTo(raw?.seconds, QAIMA_SECONDS, QAIMA_DEFAULTS.seconds),
  };
}

const list = (s: QaimaState): QaimaListDef => QAIMA_BY_ID[s.lists[s.round]];

/** The deck's lists in an order where two neighbours rarely share a topic. */
export function spreadTopics(ids: string[]): string[] {
  const left = [...ids];
  const out: string[] = [];
  while (left.length) {
    const prev = out.length ? QAIMA_BY_ID[out[out.length - 1]].topic : null;
    const i = left.findIndex((id) => QAIMA_BY_ID[id].topic !== prev);
    out.push(left.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out;
}

function beginRound(ctx: GameCtx, s: QaimaState) {
  s.phase = 'play';
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + s.settings.seconds * 1000;
  s.found = {};
  s.tries = {};
  s.notes = {};
  s.done = [];
  s.reveal = null;
  ctx.say?.(`الجولة ${s.round + 1}: ${list(s).title}`, undefined, PVOICE.go);
}

/** The bots' planned answers not typed yet: at an early end they come in at once. */
function flushBots(ctx: GameCtx, s: QaimaState) {
  for (const [b, plan] of Object.entries(s.plans)) {
    if (plan.round !== s.round || !s.participants.includes(b)) continue;
    for (const t of plan.tries) if (s.startedAt + t.at > ctx.now) add(ctx, s, b, t.text, false);
  }
}

function reveal(ctx: GameCtx, s: QaimaState, early = false) {
  const def = list(s);
  const finders: string[][] = def.items.map(() => []);
  for (const p of s.participants) for (const i of s.found[p] ?? []) finders[i].push(p);
  const many = s.participants.length > 1;
  const results: QaimaResult[] = s.participants.map((id) => {
    const mine = s.found[id] ?? [];
    const unique = many ? mine.filter((i) => finders[i].length === 1).length : 0;
    return { id, found: mine.length, unique, points: qaimaPoints(mine.length, unique) };
  });
  for (const r of results) s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
  const order = def.items.map((_, i) => i);
  if (!def.ordered) order.sort((a, b) => def.items[b].fame - def.items[a].fame || a - b);
  const missed = def.items
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => !finders[i].length)
    .sort((a, b) => b.it.fame - a.it.fame || a.i - b.i)
    .slice(0, MISSED_MAX)
    .map(({ it }) => it.name);
  s.reveal = {
    items: order.map((i) => ({ name: def.items[i].name, finders: finders[i] })),
    missed,
    covered: finders.filter((f) => f.length).length,
    note: def.note ?? null,
    results,
  };
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, QAIMA_REVEAL_MS);
  ctx.fx('reveal');
  const best = Math.max(0, ...results.map((r) => r.found));
  const top = results.filter((r) => r.found === best && best > 0).map((r) => ctx.playerName(r.id));
  const head = early ? 'نهاية الجولة' : 'انتهى الوقت';
  ctx.say?.(
    best > 0 ? `${head} · أكثر الإجابات: ${top.join(' و')} (${best})` : `${head} · لا إجابات`,
    top.length === 1 ? results.find((r) => r.found === best)?.id : undefined,
    early ? undefined : PVOICE.timeUp,
  );
}

function finish(ctx: GameCtx, s: QaimaState) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: QaimaState) {
  if (s.round + 1 >= s.lists.length) return finish(ctx, s);
  s.round++;
  beginRound(ctx, s);
}

/** Every player still here (bots aside) pressed «انتهيت»: the round ends now. */
function maybeEnd(ctx: GameCtx, s: QaimaState) {
  if (s.phase !== 'play') return;
  const humans = s.participants.filter((p) => !ctx.isBot(p) && ctx.isConnected(p));
  if (!humans.length || humans.some((p) => !s.done.includes(p))) return;
  flushBots(ctx, s);
  reveal(ctx, s, true);
}

export function startQaima(ctx: GameCtx, participants: string[], raw: Partial<QaimaSettings> | undefined, rnd: Rnd = Math.random): QaimaState {
  const settings = sanitizeQaima(raw);
  const deck = qdeck(
    ctx,
    'qaima',
    QAIMA_LISTS.map((l) => l.id),
  );
  const s: QaimaState = {
    settings,
    participants: [...participants],
    lists: spreadTopics(deck.deal(settings.rounds)),
    round: 0,
    phase: 'play',
    startedAt: ctx.now,
    endsAt: null,
    found: {},
    tries: {},
    notes: {},
    done: [],
    reveal: null,
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    plans: {},
    rnd,
  };
  ctx.fx('start');
  beginRound(ctx, s);
  return s;
}

/** One typed answer. `note`: tell the player (false for the bots' answers flushed at an early end). */
function add(ctx: GameCtx, s: QaimaState, by: string, text: string, note = true) {
  const mine = (s.found[by] ??= []);
  const m = qaimaMatch(list(s), text, new Set(mine));
  const seq = (s.notes[by]?.seq ?? 0) + 1;
  if (m.kind === 'ok') mine.push(m.item);
  if (!note) return;
  s.notes[by] = { seq, kind: m.kind, text: m.kind === 'miss' ? text.trim().slice(0, 40) : list(s).items[m.item].name };
}

export const qaima: GameModule<QaimaState, QaimaSettings> = {
  id: 'qaima',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startQaima(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (s.phase !== 'play' || !s.participants.includes(by)) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    if (ctx.now >= (s.endsAt ?? 0)) return;
    if (a.type === 'add') {
      if (!isStr(a.text) || !a.text.trim() || a.text.length > 60) return;
      s.tries[by] = (s.tries[by] ?? 0) + 1;
      if (s.tries[by] > QAIMA_MAX_TRIES) return;
      add(ctx, s, by, a.text);
      return;
    }
    if (a.type === 'done') {
      if (a.undo === true) s.done = s.done.filter((p) => p !== by);
      else if (!s.done.includes(by)) s.done.push(by);
      maybeEnd(ctx, s);
    }
  },

  tick(ctx, s) {
    if (s.phase === 'play' && ctx.now >= (s.endsAt ?? 0)) {
      reveal(ctx, s);
      return true;
    }
    if (s.phase === 'reveal' && ctx.now >= (s.endsAt ?? 0)) {
      next(ctx, s);
      return true;
    }
    return false;
  },

  turnOf() {
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const level = botLevel(ctx);
    const def = list(s);
    for (const b of s.participants) {
      if (!(bots.includes(b) || ctx.isBot(b))) continue;
      let plan = s.plans[b];
      if (!plan || plan.round !== s.round) {
        plan = { round: s.round, tries: planBotRound(level, def, s.settings.seconds, s.rnd, QAIMA_LISTS) };
        s.plans[b] = plan;
      }
      plan.tries.forEach((t, i) => {
        ctx.bot(b, `qaima:${s.round}:${i}`, Math.max(0, s.startedAt + t.at - ctx.now), { type: 'add', round: s.round + 1, text: t.text });
      });
    }
  },

  view(ctx, s, me): QaimaView {
    const def = list(s);
    const play = s.phase === 'play';
    return {
      game: 'qaima',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.lists.length,
      seconds: s.settings.seconds,
      prompt: { title: def.title, topic: def.topic, size: def.items.length, hint: def.hint ?? null },
      endsAt: s.endsAt,
      mine: (s.found[me] ?? []).map((i) => def.items[i].name),
      note: play ? (s.notes[me] ?? null) : null,
      counts: Object.fromEntries(s.participants.map((p) => [p, (s.found[p] ?? []).length])),
      done: s.done,
      reveal: play ? null : s.reveal,
      scores: s.scores,
      players: s.participants,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    delete s.found[id];
    delete s.tries[id];
    delete s.notes[id];
    delete s.plans[id];
    s.done = s.done.filter((p) => p !== id);
    if (s.reveal) {
      s.reveal.results = s.reveal.results.filter((r) => r.id !== id);
      for (const c of s.reveal.items) c.finders = c.finders.filter((p) => p !== id);
    }
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    maybeEnd(ctx, s);
  },

  patchSettings(settings, patch) {
    const next = sanitizeQaima({ ...settings, ...patch } as Partial<QaimaSettings>);
    if (patch.rounds !== undefined) settings.rounds = next.rounds;
    if (patch.seconds !== undefined) settings.seconds = next.seconds;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};
