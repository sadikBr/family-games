/**
 * «المراحل العشر» — a rummy-style race through ten phases (2–6 players, bots welcome).
 * 108 cards: 1–12 in four colours twice, 8 wilds, 4 skips. 10 cards each, one card face up.
 * Your turn: draw (deck, or the face-up card unless it's a skip), optionally lay your current phase,
 * optionally add cards to any group on the table (only once your own phase is down), then discard.
 * Discarding a skip makes a chosen player lose their next turn. The hand ends when someone has no
 * cards left: whoever laid their phase moves on, the others repeat it, and everyone adds penalty points
 * for the cards still in hand (1–9 = 5, 10–12 = 10, skip = 15, wild = 25). The first to complete the
 * last phase wins (several in the same hand: fewest points).
 */
import {
  FULL_PHASES,
  P10_HAND_END_MS,
  SHORT_PHASES,
  phaseLabel,
  type P10Card,
  type P10Group,
  type P10HandRow,
  type Phase10Settings,
  type Phase10View,
} from '../../src/shared/games/phase10';
import {
  canHit,
  cardPoints,
  deficit,
  groupOk,
  isNatural,
  isSkip,
  isWild,
  makeP10Deck,
  p10CardName,
  phaseReqs,
  solvePhase,
  sortP10,
} from '../../src/shared/phase10-rules';
import { Feed, randDelay } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';

const HAND_SIZE = 10;
/** the next hand deals itself after this long (the host can deal sooner) */
export const HAND_END_MS = P10_HAND_END_MS;

export interface State {
  settings: Phase10Settings;
  seats: string[];
  active: string[];
  phases: number[];
  progress: Record<string, number>;
  scores: Record<string, number>;
  phase: Phase10View['phase'];
  hand: number;
  dealerIdx: number;
  turn: string;
  step: Phase10View['step'];
  stock: P10Card[];
  discard: P10Card[];
  hands: Record<string, P10Card[]>;
  groups: P10Group[];
  groupSeq: number;
  laid: string[];
  skipped: string[];
  feed: Feed;
  handWinner: string | null;
  handSummary: P10HandRow[] | null;
  winner: string | null;
  nextAt: number | null;
  skipEvent: Phase10View['skipEvent'];
  skipSeq: number;
  actions: number;
}

/** The phase number a player is working on (null once they finished them all). */
export function currentPhase(s: State, id: string): number | null {
  return s.phases[s.progress[id] ?? 0] ?? null;
}

function nextActive(s: State, from: string): string {
  const i = s.seats.indexOf(from);
  for (let k = 1; k <= s.seats.length; k++) {
    const id = s.seats[(i + k) % s.seats.length];
    if (s.active.includes(id)) return id;
  }
  return from;
}

/** Next player to play after `from`, passing over (and clearing) skipped players. */
function nextTurn(ctx: GameCtx, s: State, from: string): string {
  let id = from;
  for (let guard = 0; guard < s.seats.length * 2 + 2; guard++) {
    id = nextActive(s, id);
    if (!s.skipped.includes(id)) return id;
    s.skipped = s.skipped.filter((x) => x !== id);
    s.feed.push(`${ctx.playerName(id)} فقد دوره`, { by: id });
  }
  return id;
}

function startHand(ctx: GameCtx, s: State) {
  s.hand += 1;
  s.phase = 'play';
  s.stock = shuffle(makeP10Deck());
  s.hands = Object.fromEntries(s.seats.map((id) => [id, s.active.includes(id) ? s.stock.splice(0, HAND_SIZE) : []]));
  s.discard = [s.stock.pop()!];
  s.groups = [];
  s.laid = [];
  s.skipped = [];
  let dealer = s.seats[s.dealerIdx] ?? s.active[0];
  dealer = nextActive(s, dealer);
  s.dealerIdx = s.seats.indexOf(dealer);
  s.turn = nextActive(s, dealer);
  s.step = 'draw';
  s.handWinner = null;
  s.handSummary = null;
  s.nextAt = null;
  s.skipEvent = null;
  s.feed.clear();
  s.feed.push(`اليد ${s.hand} — ${HAND_SIZE} أوراق لكل لاعب`);
  ctx.fx('card');
}

function finish(ctx: GameCtx, s: State, winner: string | null) {
  s.winner = winner;
  s.phase = 'final';
  s.nextAt = null;
  if (winner) ctx.fx('win', winner);
}

function endHand(ctx: GameCtx, s: State, out: string | null) {
  s.handWinner = out;
  s.handSummary = s.active.map((id) => {
    const cards = sortP10(s.hands[id] ?? [], 'number');
    return {
      id,
      cards,
      points: cards.reduce((t, c) => t + cardPoints(c), 0),
      phase: currentPhase(s, id) ?? s.phases[s.phases.length - 1],
      done: s.laid.includes(id),
    };
  });
  for (const row of s.handSummary) {
    s.scores[row.id] = (s.scores[row.id] ?? 0) + row.points;
    if (row.done) s.progress[row.id] = (s.progress[row.id] ?? 0) + 1;
  }
  if (out) s.feed.push(`${ctx.playerName(out)} أنهى أوراقه!`, { by: out });
  const finishers = s.active.filter((id) => (s.progress[id] ?? 0) >= s.phases.length);
  if (finishers.length) {
    const best = finishers.slice().sort((a, b) => s.scores[a] - s.scores[b] || Number(b === out) - Number(a === out))[0];
    finish(ctx, s, best);
    return;
  }
  s.phase = 'handEnd';
  s.nextAt = ctx.now + HAND_END_MS;
  ctx.fx('reveal');
}

function takeCards(hand: P10Card[], ids: unknown): P10Card[] | null {
  if (!Array.isArray(ids)) return null;
  const list = ids.filter(isStr);
  if (list.length !== ids.length || new Set(list).size !== list.length) return null;
  const cards = list.map((id) => hand.find((c) => c.id === id));
  return cards.every(Boolean) ? (cards as P10Card[]) : null;
}

function removeFrom(hand: P10Card[], cards: P10Card[]) {
  for (const c of cards) hand.splice(hand.indexOf(c), 1);
}

/** Players a skip may hit: everyone else still in, not already waiting out a skip. */
export function skipTargets(s: State, by: string): string[] {
  return s.active.filter((id) => id !== by && !s.skipped.includes(id));
}

/* ------------------------------------------------------------------ */
/* Bot helpers                                                         */
/* ------------------------------------------------------------------ */

/** The player in the lead (for the bots' skips): furthest phase, then phase down, then fewest cards. */
export function leader(s: State, among: string[]): string | undefined {
  return among
    .slice()
    .sort(
      (a, b) =>
        (s.progress[b] ?? 0) - (s.progress[a] ?? 0) ||
        Number(s.laid.includes(b)) - Number(s.laid.includes(a)) ||
        (s.hands[a]?.length ?? 0) - (s.hands[b]?.length ?? 0) ||
        (s.scores[a] ?? 0) - (s.scores[b] ?? 0),
    )[0];
}

/** How well a card sits with the rest of the hand for this phase (higher = keep). */
function keepScore(card: P10Card, hand: P10Card[], phase: number): number {
  if (!isNatural(card)) return isWild(card) ? 100 : -100;
  const kinds = new Set(phaseReqs(phase).map((r) => r.kind));
  let k = 0;
  for (const c of hand) {
    if (c.id === card.id || !isNatural(c)) continue;
    if (kinds.has('set') && c.n === card.n) k += 3;
    if (kinds.has('color') && c.color === card.color) k += 2;
    if (kinds.has('run')) {
      const d = Math.abs(c.n! - card.n!);
      if (d === 0) k -= 1;
      else if (d <= 2) k += 3 - d;
    }
  }
  return k;
}

/** The card a bot throws away. */
export function botDiscard(s: State, bot: string): P10Card {
  const hand = s.hands[bot];
  const skip = hand.find(isSkip);
  if (skip) return skip;
  const pool = hand.some((c) => !isWild(c)) ? hand.filter((c) => !isWild(c)) : hand;
  const phase = currentPhase(s, bot);
  if (s.laid.includes(bot) || phase === null) {
    return pool.slice().sort((a, b) => cardPoints(b) - cardPoints(a) || (b.n ?? 0) - (a.n ?? 0))[0];
  }
  const reqs = phaseReqs(phase);
  let best = pool[0];
  let bestKey: number[] = [Infinity, Infinity, Infinity];
  for (const c of pool) {
    const rest = hand.filter((x) => x !== c);
    const key = [deficit(reqs, rest), keepScore(c, hand, phase), -cardPoints(c)];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = c;
      bestKey = key;
    }
  }
  return best;
}

/** Does the bot want the face-up card? */
export function botWantsTop(s: State, bot: string): boolean {
  const top = s.discard[s.discard.length - 1];
  if (!top || isSkip(top)) return false;
  if (isWild(top)) return true;
  if (s.laid.includes(bot)) return s.groups.some((g) => canHit(g.kind, g.cards, [top]));
  const phase = currentPhase(s, bot);
  if (phase === null) return false;
  const reqs = phaseReqs(phase);
  const hand = s.hands[bot];
  return deficit(reqs, [...hand, top]) < deficit(reqs, hand);
}

/** One card the bot can add to a group on the table (real cards first, wilds last). */
export function botHit(s: State, bot: string): { card: P10Card; group: P10Group } | null {
  const hand = s.hands[bot].slice().sort((a, b) => Number(isWild(a)) - Number(isWild(b)));
  for (const card of hand) {
    if (isSkip(card)) continue;
    // a wild prefers a run (it can grow it); otherwise any group that takes it
    const groups = isWild(card) ? s.groups.slice().sort((a, b) => Number(b.kind === 'run') - Number(a.kind === 'run')) : s.groups;
    const group = groups.find((g) => canHit(g.kind, g.cards, [card]));
    if (group) return { card, group };
  }
  return null;
}

/* ------------------------------------------------------------------ */

export const phase10: GameModule<State, Phase10Settings> = {
  id: 'phase10',
  hostOnly: ['next'],

  turnOf: (s) => (s.phase === 'play' ? [s.turn] : []),

  start(ctx, participants, settings) {
    const phases = settings.short ? SHORT_PHASES.slice() : FULL_PHASES.slice();
    const s: State = {
      settings,
      seats: participants.slice(),
      active: participants.slice(),
      phases,
      progress: Object.fromEntries(participants.map((id) => [id, 0])),
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      phase: 'play',
      hand: 0,
      dealerIdx: Math.floor(Math.random() * participants.length),
      turn: participants[0],
      step: 'draw',
      stock: [],
      discard: [],
      hands: {},
      groups: [],
      groupSeq: 0,
      laid: [],
      skipped: [],
      feed: new Feed(),
      handWinner: null,
      handSummary: null,
      winner: null,
      nextAt: null,
      skipEvent: null,
      skipSeq: 0,
      actions: 0,
    };
    startHand(ctx, s);
    ctx.fx('start');
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'handEnd') startHand(ctx, s);
      return;
    }
    if (s.phase !== 'play') return;
    if (!s.active.includes(by)) return;
    if (s.turn !== by) throw new GameError('ماشي دورك');
    const hand = s.hands[by];
    const name = ctx.playerName(by);
    switch (a.type) {
      case 'drawDeck': {
        if (s.step !== 'draw') return;
        if (!s.stock.length) {
          const top = s.discard.pop();
          s.stock = shuffle(s.discard);
          s.discard = top ? [top] : [];
          if (s.stock.length) s.feed.push('خلط الأوراق المرمية من جديد');
        }
        const card = s.stock.pop();
        if (!card) {
          s.feed.push('انتهت الأوراق');
          endHand(ctx, s, null);
          return;
        }
        hand.push(card);
        s.step = 'play';
        s.actions += 1;
        s.feed.push(`${name} سحب من الكومة`, { by });
        ctx.fx('card');
        return;
      }
      case 'drawDiscard': {
        if (s.step !== 'draw') return;
        const top = s.discard[s.discard.length - 1];
        if (!top) return;
        if (isSkip(top)) throw new GameError('لا يمكن أخذ ورقة «تخطَّ» — اسحب من الكومة');
        hand.push(s.discard.pop()!);
        s.step = 'play';
        s.actions += 1;
        s.feed.push(`${name} أخذ ${p10CardName(top)} من المرمية`, { by });
        ctx.fx('card');
        return;
      }
      case 'lay': {
        if (s.step !== 'play') throw new GameError('اسحب ورقة أولاً');
        if (s.laid.includes(by)) throw new GameError('وضعت مرحلتك في هذه اليد');
        const phase = currentPhase(s, by);
        if (phase === null) return;
        const reqs = phaseReqs(phase);
        if (!Array.isArray(a.groups) || a.groups.length !== reqs.length) throw new GameError('هذه المرحلة غير مكتملة');
        const groups = (a.groups as unknown[]).map((g) => takeCards(hand, g));
        const all = groups.flatMap((g) => g ?? []);
        if (groups.some((g) => !g) || new Set(all.map((c) => c.id)).size !== all.length) throw new GameError('هذه الأوراق ليست في يدك');
        const list = groups as P10Card[][];
        const fits = (order: P10Card[][]) => order.every((g, i) => groupOk(reqs[i].kind, g, reqs[i].size));
        const ordered = fits(list) ? list : list.length === 2 && fits([list[1], list[0]]) ? [list[1], list[0]] : null;
        if (!ordered) throw new GameError(`هذه الأوراق لا تكمل المرحلة: ${phaseLabel(phase)}`);
        removeFrom(hand, all);
        ordered.forEach((cards, i) => s.groups.push({ id: ++s.groupSeq, owner: by, kind: reqs[i].kind, cards }));
        s.laid.push(by);
        s.actions += 1;
        s.feed.push(`${name} وضع المرحلة ${phase}!`, { by });
        ctx.fx('correct', by);
        if (!hand.length) endHand(ctx, s, by);
        return;
      }
      case 'hit': {
        if (s.step !== 'play') throw new GameError('اسحب ورقة أولاً');
        if (!s.laid.includes(by)) throw new GameError('ضع مرحلتك أولاً، ثم أضف أوراقاً على المجموعات');
        const group = s.groups.find((g) => g.id === a.group);
        const cards = takeCards(hand, a.cards);
        if (!isNum(a.group) || !group || !cards || !canHit(group.kind, group.cards, cards)) {
          throw new GameError('هذه الأوراق لا تركب مع هذه المجموعة');
        }
        removeFrom(hand, cards);
        group.cards.push(...cards);
        s.actions += 1;
        const whose = group.owner === by ? '' : ` ${ctx.playerName(group.owner)}`;
        s.feed.push(`${name} أضاف ${cards.length === 1 ? p10CardName(cards[0]) : `${cards.length} أوراق`} على مجموعة${whose}`, { by });
        ctx.fx('correct', by);
        if (!hand.length) endHand(ctx, s, by);
        return;
      }
      case 'discard': {
        if (s.step !== 'play' || !isStr(a.card)) return;
        const idx = hand.findIndex((c) => c.id === a.card);
        if (idx < 0) return;
        const [card] = hand.splice(idx, 1);
        s.discard.push(card);
        s.actions += 1;
        if (isSkip(card)) {
          const targets = skipTargets(s, by);
          const target = isStr(a.target) && targets.includes(a.target) ? a.target : targets.includes(nextActive(s, by)) ? nextActive(s, by) : targets[0];
          if (target) {
            s.skipped.push(target);
            s.skipEvent = { id: ++s.skipSeq, by, target };
            s.feed.push(`${name} رمى «تخطَّ» على ${ctx.playerName(target)}`, { by });
            ctx.fx('skip', target);
          } else {
            s.feed.push(`${name} رمى «تخطَّ»`, { by });
            ctx.fx('card');
          }
        } else {
          s.feed.push(`${name} رمى ${p10CardName(card)}`, { by });
          ctx.fx('card');
        }
        if (!hand.length) {
          endHand(ctx, s, by);
          return;
        }
        s.turn = nextTurn(ctx, s, by);
        s.step = 'draw';
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.phase === 'handEnd' && s.nextAt !== null && ctx.now >= s.nextAt) {
      startHand(ctx, s);
      return true;
    }
    return false;
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play' || !s.active.includes(s.turn) || !ctx.isBot(s.turn)) return;
    const bot = s.turn;
    const hand = s.hands[bot];
    const key = `p:${s.hand}:${s.actions}`;
    const delay = randDelay(1000, 2500);
    if (s.step === 'draw') {
      ctx.bot(bot, key, delay, { type: botWantsTop(s, bot) ? 'drawDiscard' : 'drawDeck' });
      return;
    }
    const phase = currentPhase(s, bot);
    if (!s.laid.includes(bot) && phase !== null) {
      const sol = solvePhase(phaseReqs(phase), hand);
      if (sol) {
        ctx.bot(bot, key, delay, { type: 'lay', groups: sol.map((g) => g.map((c) => c.id)) });
        return;
      }
    }
    if (s.laid.includes(bot)) {
      const hit = botHit(s, bot);
      if (hit) {
        ctx.bot(bot, key, randDelay(800, 1600), { type: 'hit', group: hit.group.id, cards: [hit.card.id] });
        return;
      }
    }
    const card = botDiscard(s, bot);
    const target = isSkip(card) ? leader(s, skipTargets(s, bot)) : undefined;
    ctx.bot(bot, key, delay, { type: 'discard', card: card.id, ...(target ? { target } : {}) });
  },

  view(_ctx, s, me): Phase10View {
    return {
      game: 'phase10',
      phase: s.phase,
      participants: s.seats,
      active: s.active,
      turn: s.turn,
      step: s.step,
      hand: s.hand,
      phases: s.phases,
      myHand: sortP10(s.hands[me] ?? [], 'number'),
      counts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      progress: s.progress,
      laid: s.laid,
      groups: s.groups,
      skipped: s.skipped,
      discardTop: s.discard[s.discard.length - 1] ?? null,
      stockLeft: s.stock.length,
      scores: s.scores,
      feed: s.feed.list(),
      handWinner: s.handWinner,
      handSummary: s.handSummary,
      winner: s.winner,
      nextAt: s.nextAt,
      skipEvent: s.skipEvent,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.active.includes(id) || s.phase === 'final') return;
    s.active = s.active.filter((p) => p !== id);
    s.skipped = s.skipped.filter((p) => p !== id);
    s.laid = s.laid.filter((p) => p !== id);
    // their hand leaves the game; groups already on the table stay (others may still add to them)
    s.hands[id] = [];
    s.feed.push(`${ctx.playerName(id)} غادر اللعبة`);
    if (s.active.length <= 1) {
      finish(ctx, s, s.active[0] ?? null);
      return;
    }
    if (s.phase === 'play' && s.turn === id) {
      s.turn = nextTurn(ctx, s, id);
      s.step = 'draw';
      s.actions += 1;
    }
  },

  patchSettings(settings, patch) {
    if (typeof patch.short === 'boolean') settings.short = patch.short;
  },
};
