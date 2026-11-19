/**
 * «سلسلة الذاكرة» — the memory chain (rules at the top of src/shared/games/silsila.ts).
 *
 * Each round: one random pad is added to the shared chain; `watch` while every phone plays it (the view
 * carries the server time of the first light and the time per pad, so all phones light the same pad at the
 * same moment, and a phone that opens late joins the playback where it is); then `input`: everyone repeats
 * the chain at the same time. The server checks each tap against the chain: a wrong pad, or no tap within
 * SILSILA_TAP_MS (after the playback, then since the previous tap), costs a life and ends that player's
 * round; at 0 lives the player is out. When every remaining player has finished or failed, `fallen` shows
 * who fell, then the next round. Last player standing wins; players who go out in the same round are ranked
 * by how far they got in it, then by the time it took them (equal = a shared place). Alone: until the
 * lives run out; the score is the longest chain repeated; the room keeps its best (per pad count).
 *
 * The view sends the chain only up to its current length, and another player's taps never: only whether
 * they are still in, done this round or out.
 */
import {
  SILSILA_DEFAULTS,
  SILSILA_FIRST_LEAD_MS,
  SILSILA_LEAD_MS,
  SILSILA_LIVES,
  SILSILA_MAX_LEN,
  SILSILA_PADS,
  SILSILA_TAP_MS,
  silsilaStepMs,
  type SilsilaFall,
  type SilsilaFinal,
  type SilsilaPlayerState,
  type SilsilaSettings,
  type SilsilaView,
} from '../../src/shared/games/silsila';
import { botPad, botSpan, botTapDelay, type Rnd } from '../silsila-bots';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';

/** The round's result stays on the screens this long (at the room's pace); shorter when nobody fell. */
export const SILSILA_FALLEN_MS = 2800;
export const SILSILA_CLEAN_MS = 1500;
/**
 * A tap that comes before the end of the playback by the server's clock still counts (the phone, whose clock
 * may be a little off, saw the playback over): the input opens a moment early.
 */
const EARLY_MS = 1000;
/** The network's share of the tap timer. */
const GRACE_MS = 400;

interface Best {
  len: number;
  by: string[];
}

interface State {
  settings: SilsilaSettings;
  participants: string[];
  solo: boolean;
  phase: SilsilaView['phase'];
  seq: number[];
  playAt: number;
  stepMs: number;
  inputAt: number;
  endsAt: number | null;
  lives: Record<string, number>;
  st: Record<string, SilsilaPlayerState>;
  /** correct taps this round */
  prog: Record<string, number>;
  /** time of the last tap (or the start of the input): the next one is due SILSILA_TAP_MS after it */
  last: Record<string, number>;
  /** ms from the start of the input to the last correct tap (ranking players who fall together) */
  reachMs: Record<string, number>;
  miss: Record<string, { want: number; got: number | null }>;
  best: Record<string, number>;
  /** out: the round, and how far / how fast they got in it */
  outRound: Record<string, number>;
  outProg: Record<string, number>;
  outMs: Record<string, number>;
  fallen: SilsilaFall[];
  /** the bots' memory spans for this game */
  spans: Record<string, number>;
  /** the room's best before this game */
  roomBest: Best;
  final: SilsilaFinal | null;
  rnd: Rnd;
}

const snap = (v: unknown, opts: readonly number[], d: number): number => (isNum(v) && opts.includes(v) ? v : d);

export function sanitizeSilsila(raw: Partial<SilsilaSettings> | undefined): SilsilaSettings {
  return {
    pads: snap(raw?.pads, SILSILA_PADS, SILSILA_DEFAULTS.pads),
    lives: snap(raw?.lives, SILSILA_LIVES, SILSILA_DEFAULTS.lives),
  };
}

const bestKey = (pads: number) => `silsila:best:${pads}`;
const len = (s: State) => s.seq.length;
const alive = (s: State) => s.participants.filter((p) => (s.lives[p] ?? 0) > 0);
const names = (ctx: GameCtx, ids: string[]) => ids.map((id) => ctx.playerName(id)).join(' و');

/* ------------------------------------------------------------------ */
/* Rounds                                                              */
/* ------------------------------------------------------------------ */

function startRound(ctx: GameCtx, s: State) {
  s.seq.push(Math.floor(s.rnd() * s.settings.pads));
  s.phase = 'watch';
  s.stepMs = silsilaStepMs(len(s));
  s.playAt = ctx.now + (len(s) === 1 ? SILSILA_FIRST_LEAD_MS : SILSILA_LEAD_MS);
  s.inputAt = s.playAt + len(s) * s.stepMs;
  s.endsAt = null;
  s.fallen = [];
  s.miss = {};
  for (const p of s.participants) {
    s.prog[p] = 0;
    s.reachMs[p] = 0;
    s.last[p] = s.inputAt;
    s.st[p] = (s.lives[p] ?? 0) > 0 ? 'play' : 'out';
  }
}

/** The playback is over: everyone repeats. */
function openInput(s: State) {
  s.phase = 'input';
  for (const p of s.participants) if (s.st[p] === 'play') s.last[p] = s.inputAt;
}

function fail(ctx: GameCtx, s: State, p: string, how: SilsilaFall['how'], got: number | null) {
  if (s.st[p] !== 'play') return;
  s.lives[p] = Math.max(0, (s.lives[p] ?? 1) - 1);
  const out = s.lives[p] === 0;
  s.st[p] = out ? 'out' : 'fail';
  s.miss[p] = { want: s.seq[s.prog[p]] ?? 0, got };
  s.fallen.push({ id: p, out, how });
  if (out) {
    s.outRound[p] = len(s);
    s.outProg[p] = s.prog[p];
    s.outMs[p] = s.prog[p] ? s.reachMs[p] : Infinity;
  }
  ctx.fx('buzz', p);
}

function checkRoundOver(ctx: GameCtx, s: State) {
  if (s.phase !== 'input') return;
  if (s.participants.some((p) => s.st[p] === 'play')) return;
  endRound(ctx, s);
}

function gameOver(s: State): boolean {
  const left = alive(s);
  if (!left.length) return true;
  if (!s.solo && left.length <= 1) return true;
  return len(s) >= SILSILA_MAX_LEN;
}

function endRound(ctx: GameCtx, s: State) {
  if (gameOver(s)) return finish(ctx, s);
  s.phase = 'fallen';
  s.endsAt = ctx.now + paced(ctx, s.fallen.length ? SILSILA_FALLEN_MS : SILSILA_CLEAN_MS);
  const outs = s.fallen.filter((f) => f.out).map((f) => f.id);
  const lost = s.fallen.filter((f) => !f.out).map((f) => f.id);
  const parts: string[] = [];
  if (outs.length) parts.push(`خارج اللعبة: ${names(ctx, outs)}`);
  if (lost.length) parts.push(`قلب أقل: ${names(ctx, lost)}`);
  ctx.say?.(parts.length ? `سلسلة من ${len(s)} · ${parts.join(' · ')}` : `سلسلة من ${len(s)}: كاملة من الجميع`, outs.length === 1 && !lost.length ? outs[0] : undefined);
}

/** Players ranked: still in first, then by the round they went out in, how far they got in it, how fast. */
export function silsilaPlaces(s: Pick<State, 'participants' | 'lives' | 'outRound' | 'outProg' | 'outMs'>): string[][] {
  const key = (p: string): [number, number, number] =>
    (s.lives[p] ?? 0) > 0 ? [Infinity, 0, 0] : [s.outRound[p] ?? 0, s.outProg[p] ?? 0, -(s.outMs[p] ?? Infinity)];
  const cmp = (a: string, b: string) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] > kb[i] ? -1 : 1;
    return 0;
  };
  const sorted = [...s.participants].sort(cmp);
  const places: string[][] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && cmp(p, sorted[i - 1]) === 0) places[places.length - 1].push(p);
    else places.push([p]);
  });
  return places;
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  const places = silsilaPlaces(s);
  const longest = Math.max(0, ...s.participants.map((p) => s.best[p] ?? 0));
  const longestBy = longest ? s.participants.filter((p) => (s.best[p] ?? 0) === longest) : [];
  const record = longest > s.roomBest.len;
  const roomBest: Best = record ? { len: longest, by: longestBy.map((p) => ctx.playerName(p)) } : s.roomBest;
  if (record) ctx.memo.set(bestKey(s.settings.pads), roomBest);
  const left = alive(s);
  s.final = {
    places,
    outRound: { ...s.outRound },
    longest,
    longestBy,
    roomBest: roomBest.len,
    roomBestBy: [...roomBest.by],
    record,
    together: !s.solo && left.length === 0 && s.participants.length > 1,
  };
  const top = places[0] ?? [];
  if (s.solo) {
    ctx.fx('win', s.participants[0]);
    ctx.say?.(`أطول سلسلة: ${longest}${record ? ' — رقم جديد للغرفة!' : ''}`, s.participants[0]);
  } else if (top.length === 1) {
    ctx.fx('win', top[0]);
    ctx.say?.(`الفوز من نصيب ${ctx.playerName(top[0])}! أطول سلسلة: ${longest}`, top[0]);
  } else {
    ctx.fx('win');
    ctx.say?.(`تعادل! أطول سلسلة: ${longest}`);
  }
}

/* ------------------------------------------------------------------ */
/* Taps                                                                */
/* ------------------------------------------------------------------ */

function tap(ctx: GameCtx, s: State, by: string, a: Record<string, unknown>) {
  if (isNum(a.len) && a.len !== len(s)) return; // a tap from the round before
  if (s.phase === 'watch' && ctx.now >= s.inputAt - EARLY_MS) openInput(s);
  if (s.phase === 'watch') throw new GameError('انتظر حتى ينتهي العرض');
  if (s.phase !== 'input' || s.st[by] !== 'play') return;
  const pad = a.pad;
  if (!isNum(pad) || !Number.isInteger(pad) || pad < 0 || pad >= s.settings.pads) return;
  // the step this tap is for: a repeat of the same tap (a double send) is dropped
  if (isNum(a.i) && a.i !== s.prog[by]) return;
  const i = s.prog[by];
  if (pad !== s.seq[i]) {
    fail(ctx, s, by, 'wrong', pad);
    return checkRoundOver(ctx, s);
  }
  s.prog[by] = i + 1;
  s.last[by] = ctx.now;
  s.reachMs[by] = Math.max(0, ctx.now - s.inputAt);
  if (s.prog[by] === len(s)) {
    s.st[by] = 'done';
    s.best[by] = Math.max(s.best[by] ?? 0, len(s));
    ctx.fx('correct', by);
    checkRoundOver(ctx, s);
  }
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startSilsila(ctx: GameCtx, participants: string[], raw: SilsilaSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeSilsila(raw);
  const saved = ctx.memo.get(bestKey(settings.pads)) as Best | undefined;
  const s: State = {
    settings,
    participants: [...participants],
    solo: participants.length === 1,
    phase: 'watch',
    seq: [],
    playAt: 0,
    stepMs: 0,
    inputAt: 0,
    endsAt: null,
    lives: Object.fromEntries(participants.map((p) => [p, settings.lives])),
    st: {},
    prog: {},
    last: {},
    reachMs: {},
    miss: {},
    best: Object.fromEntries(participants.map((p) => [p, 0])),
    outRound: {},
    outProg: {},
    outMs: {},
    fallen: [],
    spans: {},
    roomBest: saved && isNum(saved.len) ? { len: saved.len, by: [...(saved.by ?? [])] } : { len: 0, by: [] },
    final: null,
    rnd,
  };
  ctx.fx('start');
  startRound(ctx, s);
  return s;
}

export const silsila: GameModule<State, SilsilaSettings> = {
  id: 'silsila',

  start(ctx, participants, raw) {
    return startSilsila(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by)) return;
    if (a.type === 'tap') return tap(ctx, s, by, a);
  },

  tick(ctx, s) {
    if (s.phase === 'watch' && ctx.now >= s.inputAt) {
      openInput(s);
      return true;
    }
    if (s.phase === 'input') {
      let changed = false;
      for (const p of s.participants) {
        if (s.st[p] === 'play' && ctx.now > s.last[p] + SILSILA_TAP_MS + GRACE_MS) {
          fail(ctx, s, p, 'time', null);
          changed = true;
        }
      }
      if (changed) checkRoundOver(ctx, s);
      return changed;
    }
    if (s.phase === 'fallen' && s.endsAt !== null && ctx.now >= s.endsAt) {
      startRound(ctx, s);
      return true;
    }
    return false;
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'input') return;
    const level = botLevel(ctx);
    for (const b of bots) {
      if (!s.participants.includes(b) || s.st[b] !== 'play') continue;
      s.spans[b] ??= botSpan(level, s.rnd);
      const i = s.prog[b];
      const pad = botPad(s.seq, i, s.settings.pads, s.spans[b], s.rnd);
      ctx.bot(b, `t:${len(s)}:${i}`, botTapDelay(i, s.rnd), { type: 'tap', len: len(s), i, pad });
    }
  },

  view(ctx, s, me): SilsilaView {
    const playing = s.participants.includes(me);
    return {
      game: 'silsila',
      phase: s.phase,
      pads: s.settings.pads,
      maxLives: s.settings.lives,
      solo: s.solo,
      len: len(s),
      seq: s.seq.slice(0, len(s)),
      playAt: s.playAt,
      stepMs: s.stepMs,
      inputAt: s.inputAt,
      endsAt: s.endsAt,
      me: playing
        ? {
            prog: s.prog[me] ?? 0,
            lives: s.lives[me] ?? 0,
            state: s.st[me] ?? 'out',
            deadline: s.phase === 'input' && s.st[me] === 'play' ? s.last[me] + SILSILA_TAP_MS : null,
            miss: s.miss[me] ? { ...s.miss[me] } : null,
          }
        : null,
      players: [...s.participants],
      rows: s.participants.map((id) => ({ id, lives: s.lives[id] ?? 0, state: s.st[id] ?? 'out', best: s.best[id] ?? 0 })),
      fallen: s.phase === 'fallen' || s.phase === 'final' ? s.fallen.map((f) => ({ ...f })) : [],
      roomBest: s.roomBest.len,
      final: s.final ? { ...s.final, places: s.final.places.map((p) => [...p]) } : null,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    for (const m of [s.lives, s.st, s.prog, s.last, s.reachMs, s.miss, s.best, s.outRound, s.outProg, s.outMs, s.spans]) delete (m as Record<string, unknown>)[id];
    s.fallen = s.fallen.filter((f) => f.id !== id);
    if (s.phase === 'final') return;
    if (!s.participants.length) {
      s.phase = 'final';
      s.endsAt = null;
      return;
    }
    // one person left at the table of a group game: the last player standing
    if (!s.solo && alive(s).length <= 1) return finish(ctx, s);
    checkRoundOver(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.pads)) settings.pads = snap(patch.pads, SILSILA_PADS, settings.pads);
    if (isNum(patch.lives)) settings.lives = snap(patch.lives, SILSILA_LIVES, settings.lives);
  },

  result(s) {
    if (s.phase !== 'final' || !s.final || !s.participants.length) return null;
    return { places: s.final.places.map((p) => p.filter((id) => s.participants.includes(id))).filter((p) => p.length) };
  },
};

export type { State as SilsilaState };
