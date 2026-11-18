/**
 * «العقل الواحد» — server rules (the rules themselves are at the top of src/shared/games/mind.ts).
 *
 * A level: a fresh shuffle of 1..100, L cards to everyone, then the focus moment («جاهز», bots too; people
 * away count as ready). In play there are no turns: a play is always the player's lowest card. It carries
 * the pile's size the phone saw (`base`) and the card it meant: a card that was put aside meanwhile is never
 * swapped for another one, and two taps at the same moment are fair. If the higher card arrived first and
 * its mistake put aside the card of a tap that had not seen it (same `base`, within MIND_SIMUL_MS), the two
 * cards were laid together: the lower one goes under it on the pile and the mistake is undone.
 *
 * A mistake: one life less, every lower card in the hands put aside face up, a short pause (oops) so everyone
 * sees it, then play goes on (or the level is cleared if no card is left, or the game is lost at 0 lives).
 * A star: proposed by anyone, used once everyone still holding cards agreed (a «لا», a card laid or 15 s
 * cancel it); each hand then puts its lowest card aside face up.
 *
 * Bots wait a time proportional to the gap between the pile and their lowest card (about half a second per
 * number), planned again whenever the pile changes (`epoch`); the easy ones are noisier and sometimes too
 * early, the experts steady. They propose or accept a star when their card is far and nothing happened for a
 * while. Bots only see what a player sees: the pile, the face-up cards, the counts and their own hand.
 *
 * The view never shows another player's cards, only how many they hold.
 */
import {
  MIND_DEFAULTS,
  MIND_MAX_LIVES,
  MIND_MAX_STARS,
  MIND_REWARDS,
  MIND_STARTS,
  MIND_TOP,
  MIND_VOTE_MS,
  mindLevels,
  mindStartKit,
  type MindMistake,
  type MindPlay,
  type MindSettings,
  type MindShown,
  type MindView,
} from '../../src/shared/games/mind';
import type { BotLevel } from '../../src/shared/protocol';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';

/** A mistake stays on the screens this long (at the room's pace) before play goes on. */
export const MIND_OOPS_MS = 3000;
/** The calm success screen between two levels. */
export const MIND_CLEARED_MS = 5000;
/** Two taps this close, the second not having seen the first card, count as laid together. */
export const MIND_SIMUL_MS = 600;

export type Rnd = () => number;

interface State {
  settings: MindSettings;
  participants: string[];
  levels: number;
  level: number;
  phase: MindView['phase'];
  lives: number;
  stars: number;
  hands: Record<string, number[]>;
  pile: MindPlay[];
  shown: MindShown[];
  ready: Set<string>;
  proposal: { by: string; yes: Set<string>; endsAt: number } | null;
  mistake: (MindMistake & { at: number }) | null;
  lastAt: number;
  endsAt: number | null;
  reward: MindView['reward'];
  won: boolean | null;
  /** bumps whenever the bots should think again (a card, a mistake, a star, a proposal, someone leaving…) */
  epoch: number;
  stats: MindView['stats'];
  rnd: Rnd;
}

export function sanitizeMind(raw: Partial<MindSettings> | undefined): MindSettings {
  const start = isNum(raw?.start) && (MIND_STARTS as readonly number[]).includes(raw.start) ? raw.start : MIND_DEFAULTS.start;
  return { start, extra: raw?.extra === true };
}

const shuffled = (rnd: Rnd) => {
  const a = Array.from({ length: MIND_TOP }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const top = (s: State) => (s.pile.length ? s.pile[s.pile.length - 1].card : 0);
const cardsLeft = (s: State) => s.participants.reduce((t, p) => t + (s.hands[p]?.length ?? 0), 0);
const holders = (s: State) => s.participants.filter((p) => (s.hands[p]?.length ?? 0) > 0);

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

/** Deal the level's cards and wait for everyone's «جاهز». */
function startLevel(ctx: GameCtx, s: State) {
  const deck = shuffled(s.rnd);
  const L = s.level;
  s.hands = Object.fromEntries(s.participants.map((p, i) => [p, deck.slice(i * L, (i + 1) * L).sort((a, b) => a - b)]));
  s.pile = [];
  s.shown = [];
  s.ready = new Set();
  s.proposal = null;
  s.mistake = null;
  s.reward = null;
  s.endsAt = null;
  s.phase = 'focus';
  s.lastAt = ctx.now;
  s.epoch++;
  ctx.say?.(`المستوى ${L}: ${L === 1 ? 'بطاقة واحدة' : L === 2 ? 'بطاقتان' : `${L} ${L <= 10 ? 'بطاقات' : 'بطاقة'}`} لكل لاعب`);
  checkReady(ctx, s);
}

/** Everyone ready (people away count as ready): the level starts. */
function checkReady(ctx: GameCtx, s: State) {
  if (s.phase !== 'focus') return;
  if (!s.participants.every((p) => s.ready.has(p) || !ctx.isConnected(p))) return;
  s.phase = 'play';
  s.lastAt = ctx.now;
  s.epoch++;
  ctx.fx('start');
}

/** No card left in any hand: the level is cleared (the last one wins the game). */
function checkCleared(ctx: GameCtx, s: State): boolean {
  if (cardsLeft(s) > 0) return false;
  s.proposal = null;
  s.epoch++;
  if (s.level >= s.levels) {
    s.phase = 'final';
    s.won = true;
    s.endsAt = null;
    ctx.fx('win');
    ctx.say?.('أحسنتم! عقل واحد حتى المستوى الأخير');
    return true;
  }
  const kind = MIND_REWARDS[s.level] ?? null;
  let capped = false;
  if (kind === 'life') {
    if (s.lives >= MIND_MAX_LIVES) capped = true;
    else s.lives++;
  } else if (kind === 'star') {
    if (s.stars >= MIND_MAX_STARS) capped = true;
    else s.stars++;
  }
  s.reward = kind ? { kind, capped } : null;
  s.phase = 'cleared';
  s.endsAt = ctx.now + paced(ctx, MIND_CLEARED_MS);
  ctx.fx('win');
  ctx.say?.(`اكتمل المستوى ${s.level}${kind && !capped ? (kind === 'life' ? ' · قلب إضافي' : ' · نجمة إضافية') : ''}`);
  return true;
}

function nextLevel(ctx: GameCtx, s: State) {
  if (s.phase !== 'cleared') return;
  s.level++;
  startLevel(ctx, s);
}

/** End of the mistake's pause. */
function afterOops(ctx: GameCtx, s: State) {
  if (s.phase !== 'oops') return;
  s.endsAt = null;
  if (s.lives <= 0) {
    s.phase = 'final';
    s.won = false;
    s.epoch++;
    ctx.fx('reveal');
    ctx.say?.(`نفدت القلوب في المستوى ${s.level}`);
    return;
  }
  if (checkCleared(ctx, s)) return;
  s.phase = 'play';
  s.lastAt = ctx.now;
  s.epoch++;
}

/* ------------------------------------------------------------------ */
/* Plays                                                               */
/* ------------------------------------------------------------------ */

function lay(ctx: GameCtx, s: State, by: string, card: number) {
  const hand = s.hands[by];
  hand.splice(hand.indexOf(card), 1);
  s.pile.push({ card, by });
  s.stats.cards++;
  s.epoch++;
  s.lastAt = ctx.now;
  if (s.proposal) s.proposal = null;
  // every lower card still in a hand: a mistake
  const lower: MindMistake['lower'] = [];
  for (const p of s.participants) {
    const h = s.hands[p] ?? [];
    const low = h.filter((c) => c < card);
    if (!low.length) continue;
    s.hands[p] = h.filter((c) => c > card);
    lower.push({ by: p, cards: low });
    for (const c of low) s.shown.push({ card: c, by: p, why: 'mistake' });
  }
  if (lower.length) {
    s.lives--;
    s.stats.mistakes++;
    s.mistake = { card, by, lower, seq: s.pile.length, at: ctx.now };
    s.phase = 'oops';
    s.endsAt = ctx.now + paced(ctx, MIND_OOPS_MS);
    ctx.fx('buzz', by);
    const all = lower.flatMap((l) => l.cards).sort((a, b) => a - b);
    ctx.say?.(`${card} · ${ctx.playerName(by)} — وكانت ${all.join('، ')} أصغر منها: قلب أقل`, by);
    return;
  }
  ctx.fx('card', by);
  ctx.say?.(`${card} · ${ctx.playerName(by)}`, by);
  checkCleared(ctx, s);
}

/**
 * The tap of `by` for `card`, which a mistake has just put aside: if that tap hadn't seen the card that made
 * the mistake and came right after it, both cards were laid together. Returns true if it was rescued.
 */
function rescue(ctx: GameCtx, s: State, by: string, card: number, base: number): boolean {
  const m = s.mistake;
  if (!m || m.seq !== s.pile.length || base !== m.seq - 1 || ctx.now - m.at > MIND_SIMUL_MS || m.by === by) return false;
  const mine = m.lower.find((l) => l.by === by);
  // only the lowest of their put-aside cards (the one their tap meant)
  if (!mine || mine.cards[0] !== card) return false;
  mine.cards.shift();
  if (!mine.cards.length) m.lower = m.lower.filter((l) => l !== mine);
  s.shown = s.shown.filter((x) => !(x.why === 'mistake' && x.by === by && x.card === card));
  s.pile.splice(s.pile.length - 1, 0, { card, by });
  s.stats.cards++;
  s.epoch++;
  if (!m.lower.length) {
    // no mistake after all
    s.lives++;
    s.stats.mistakes--;
    s.mistake = null;
    s.phase = 'play';
    s.endsAt = null;
    s.lastAt = ctx.now;
    ctx.fx('card', by);
    ctx.say?.(`${card} و${m.card} معاً · ${ctx.playerName(by)} و${ctx.playerName(m.by)}`, by);
    checkCleared(ctx, s);
  }
  return true;
}

function play(ctx: GameCtx, s: State, by: string, a: Record<string, unknown>) {
  const bot = ctx.isBot(by);
  const hand = s.hands[by] ?? [];
  const base = isNum(a.base) ? a.base : s.pile.length;
  const card = isNum(a.card) ? a.card : hand[0];
  if (!bot && !hand.includes(card) && (s.phase === 'oops' || s.phase === 'play') && rescue(ctx, s, by, card, base)) return;
  if (bot && (a.epoch !== s.epoch || s.proposal)) return;
  if (s.phase === 'oops') throw new GameError('لحظة: انظروا إلى البطاقات المكشوفة');
  if (s.phase !== 'play') return;
  if (!hand.length) return;
  if (!hand.includes(card)) throw new GameError('لم تُحسب: تغيّرت يدك قبل وصولها');
  if (card !== hand[0]) throw new GameError('العب أصغر بطاقة في يدك');
  if (base > s.pile.length) return;
  lay(ctx, s, by, card);
}

/* ------------------------------------------------------------------ */
/* Stars                                                               */
/* ------------------------------------------------------------------ */

/** Who must agree to a star: everyone still holding cards and at the table. */
const voters = (ctx: GameCtx, s: State) => holders(s).filter((p) => ctx.isConnected(p));

function checkStar(ctx: GameCtx, s: State) {
  const pr = s.proposal;
  if (!pr || s.phase !== 'play') return;
  if (!voters(ctx, s).every((p) => pr.yes.has(p))) return;
  // used: each hand puts its lowest card aside face up
  s.proposal = null;
  s.stars--;
  s.stats.starsUsed++;
  for (const p of s.participants) {
    const h = s.hands[p] ?? [];
    if (h.length) s.shown.push({ card: h.shift()!, by: p, why: 'star' });
  }
  s.epoch++;
  s.lastAt = ctx.now;
  ctx.fx('reveal');
  ctx.say?.('نجمة: أصغر بطاقة من كل يد مكشوفة الآن');
  checkCleared(ctx, s);
}

function star(ctx: GameCtx, s: State, by: string, a: Record<string, unknown>) {
  if (s.phase !== 'play') return;
  if (ctx.isBot(by) && a.epoch !== s.epoch) return;
  const on = a.on !== false;
  const pr = s.proposal;
  if (!on) {
    if (!pr) return;
    s.proposal = null;
    s.epoch++;
    ctx.say?.(pr.by === by ? `سحب الاقتراح · ${ctx.playerName(by)}` : `لا نجمة الآن · ${ctx.playerName(by)}`, by);
    return;
  }
  if (!pr) {
    if (s.stars <= 0) throw new GameError('لا نجوم متبقية');
    s.proposal = { by, yes: new Set([by]), endsAt: ctx.now + MIND_VOTE_MS };
    s.epoch++;
    ctx.fx('tick', by);
    ctx.say?.(`اقتراح من ${ctx.playerName(by)}: استعمال نجمة`, by);
  } else pr.yes.add(by);
  checkStar(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** Milliseconds a bot waits per number between the pile and its card. */
export const MIND_BOT_PER = 550;
/** A bot's noise by strength: a fixed part (ms), a part of the wait, the chance of going too early. */
export const MIND_BOT_NOISE: Record<BotLevel, { abs: number; rel: number; early: number }> = {
  easy: { abs: 500, rel: 0.12, early: 0.1 },
  smart: { abs: 320, rel: 0.08, early: 0.03 },
  expert: { abs: 180, rel: 0.045, early: 0 },
};

function gauss(rnd: Rnd) {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/** How long a bot waits before laying a card `gap` above the pile. */
export function mindBotDelay(level: BotLevel, gap: number, rnd: Rnd): number {
  const n = MIND_BOT_NOISE[level];
  const wait = 600 + gap * MIND_BOT_PER;
  let d = wait + gauss(rnd) * (n.abs + n.rel * wait);
  if (n.early && rnd() < n.early) d *= 0.5 + rnd() * 0.25;
  return Math.round(Math.max(500, d));
}

/** Would this bot agree to a star now? Its card is far from the pile, or nothing happened for a while. */
export function mindBotAgrees(gap: number | null, idleMs: number): boolean {
  if (gap === null) return true;
  return gap >= 20 || (gap >= 10 && idleMs >= 5000);
}

function planBot(ctx: GameCtx, s: State, b: string) {
  const hand = s.hands[b] ?? [];
  const lvl = botLevel(ctx);
  if (s.phase === 'focus') {
    if (!s.ready.has(b)) ctx.bot(b, `r:${s.level}`, 900 + Math.round(s.rnd() * 1600), { type: 'ready', level: s.level });
    return;
  }
  if (s.phase !== 'play') return;
  const gap = hand.length ? hand[0] - top(s) : null;
  if (s.proposal) {
    if (s.proposal.yes.has(b) || (gap === null && !voters(ctx, s).includes(b))) return;
    const on = mindBotAgrees(gap, ctx.now - s.lastAt);
    ctx.bot(b, `v:${s.level}:${s.epoch}`, 1000 + Math.round(s.rnd() * 1500), { type: 'star', level: s.level, on, epoch: s.epoch });
    return;
  }
  if (gap === null) return;
  // the only cards left are mine: no need to wait
  const alone = holders(s).length === 1;
  const delay = alone ? 700 + Math.round(s.rnd() * 500) : mindBotDelay(lvl, gap, s.rnd);
  ctx.bot(b, `p:${s.level}:${s.epoch}`, delay, { type: 'play', level: s.level, base: s.pile.length, card: hand[0], epoch: s.epoch });
  // a star when my card is far, everyone still holds cards and nothing happens for a while
  const idle = (lvl === 'easy' ? 8000 : 10_000) + Math.round(s.rnd() * 3000);
  if (s.stars > 0 && !alone && gap >= 25 && holders(s).length === s.participants.length && cardsLeft(s) >= 2 * s.participants.length && delay > idle + 2500) {
    ctx.bot(b, `s:${s.level}:${s.epoch}`, idle, { type: 'star', level: s.level, on: true, epoch: s.epoch });
  }
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startMind(ctx: GameCtx, participants: string[], raw: MindSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeMind(raw);
  const n = participants.length;
  const levels = mindLevels(n);
  const kit = mindStartKit(n, settings);
  const s: State = {
    settings,
    participants: [...participants],
    levels,
    level: Math.min(settings.start, levels),
    phase: 'focus',
    lives: kit.lives,
    stars: kit.stars,
    hands: {},
    pile: [],
    shown: [],
    ready: new Set(),
    proposal: null,
    mistake: null,
    lastAt: ctx.now,
    endsAt: null,
    reward: null,
    won: null,
    epoch: 0,
    stats: { mistakes: 0, starsUsed: 0, cards: 0 },
    rnd,
  };
  startLevel(ctx, s);
  return s;
}

export const mind: GameModule<State, MindSettings> = {
  id: 'mind',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startMind(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by)) return;
    if (isNum(a.level) && a.level !== s.level) return;
    switch (a.type) {
      case 'ready': {
        if (s.phase !== 'focus') return;
        s.ready.add(by);
        return checkReady(ctx, s);
      }
      case 'play':
        return play(ctx, s, by, a);
      case 'star':
        return star(ctx, s, by, a);
      case 'next':
        return nextLevel(ctx, s);
    }
  },

  tick(ctx, s) {
    if (s.phase === 'oops' && s.endsAt !== null && ctx.now >= s.endsAt) {
      afterOops(ctx, s);
      return true;
    }
    if (s.phase === 'cleared' && s.endsAt !== null && ctx.now >= s.endsAt) {
      nextLevel(ctx, s);
      return true;
    }
    if (s.phase === 'play' && s.proposal && ctx.now >= s.proposal.endsAt) {
      s.proposal = null;
      s.epoch++;
      return true;
    }
    // someone away during the focus or a star: they don't hold the team up
    if (s.phase === 'focus' && s.participants.every((p) => s.ready.has(p) || !ctx.isConnected(p))) {
      checkReady(ctx, s);
      return true;
    }
    if (s.phase === 'play' && s.proposal && voters(ctx, s).every((p) => s.proposal!.yes.has(p))) {
      checkStar(ctx, s);
      return true;
    }
    return false;
  },

  turnOf(s) {
    if (s.phase === 'focus') return s.participants.filter((p) => !s.ready.has(p));
    if (s.phase === 'play' && s.proposal) return holders(s).filter((p) => !s.proposal!.yes.has(p));
    return [];
  },

  botPlan(ctx, s, bots) {
    for (const b of bots) if (s.participants.includes(b)) planBot(ctx, s, b);
  },

  view(ctx, s, me): MindView {
    const pr = s.proposal;
    const m = s.mistake;
    return {
      game: 'mind',
      phase: s.phase,
      level: s.level,
      levels: s.levels,
      lives: s.lives,
      stars: s.stars,
      hand: [...(s.hands[me] ?? [])],
      counts: Object.fromEntries(s.participants.map((p) => [p, s.hands[p]?.length ?? 0])),
      pile: s.pile.map((p) => ({ ...p })),
      shown: s.shown.map((x) => ({ ...x })),
      ready: [...s.ready],
      proposal: pr ? { by: pr.by, yes: [...pr.yes], voters: voters(ctx, s), endsAt: pr.endsAt } : null,
      mistake: m ? { card: m.card, by: m.by, lower: m.lower.map((l) => ({ by: l.by, cards: [...l.cards] })), seq: m.seq } : null,
      lastAt: s.phase === 'play' ? s.lastAt : null,
      endsAt: s.endsAt,
      reward: s.reward,
      won: s.phase === 'final' ? s.won : null,
      stats: { ...s.stats },
      players: s.participants,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.hands[id];
    s.ready.delete(id);
    s.proposal?.yes.delete(id);
    s.epoch++;
    if (s.phase === 'final') return;
    if (s.participants.length < 2) {
      s.phase = 'final';
      s.won = null;
      s.proposal = null;
      s.endsAt = null;
      return;
    }
    if (s.proposal?.by === id) s.proposal = null;
    if (s.phase === 'focus') return checkReady(ctx, s);
    if (s.phase === 'play') {
      if (!checkCleared(ctx, s)) checkStar(ctx, s);
    }
  },

  patchSettings(settings, patch) {
    if (isNum(patch.start) && (MIND_STARTS as readonly number[]).includes(patch.start)) settings.start = patch.start;
    if (typeof patch.extra === 'boolean') settings.extra = patch.extra;
  },

  result(s) {
    if (s.phase !== 'final' || s.won === null || !s.participants.length) return null;
    return { places: [[...s.participants]], coop: { won: s.won } };
  },
};

export type { State as MindState };
