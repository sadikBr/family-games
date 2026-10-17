/**
 * روندا — the family variant: 4 cards each, no cards dealt to the table.
 * Play a card: if the same rank is on the table you take it, plus the cards that follow
 * it in sequence (… 6, 7, 10, 11, 12). إسطي = taking the card just played by the
 * previous player (+1). مسّة = clearing the table (+1). روندا (pair) = 1, تريلا
 * (three of a kind) = 5, four of a kind = two rondas. At the end of a hand the side
 * with more than 20 cards (13 with three players) scores one point per extra card. First to the target wins.
 */
import { RANKS, cardName, rankIndex, sortHand, type Card } from '../../src/shared/cards';
import type { CardSide, RondaSettings, RondaView } from '../../src/shared/protocol';
import { Feed, freshDeck, makeSides, randDelay, removeCard, sideOf, soloOf } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr, pick } from '../util';

const HAND_SIZE = 4;

interface State {
  settings: RondaSettings;
  seats: string[];
  sides: CardSide[];
  scores: Record<string, number>;
  phase: RondaView['phase'];
  hand: number;
  deal: number;
  dealerIdx: number;
  turnIdx: number;
  deck: Card[];
  hands: Record<string, Card[]>;
  table: Card[];
  captured: Record<string, Card[]>;
  lastCapturer: string | null;
  /** card left on the table by the previous turn (for إسطي) */
  lastPlayed: { by: string; cardId: string } | null;
  lastPlay: RondaView['lastPlay'];
  announce: RondaView['announce'];
  announceN: number;
  feed: Feed;
  handSummary: RondaView['handSummary'];
  winner: string | null;
}

const n = (s: State) => s.seats.length;
/** Cards a side must pass to score: 20 of the 40 with two sides, 13 with three. */
export const rondaBase = (sides: number) => (sides === 2 ? 20 : 13);

function setAnnounce(s: State, by: string | null, text: string) {
  s.announce = { by, text, id: ++s.announceN };
}

function addPoints(ctx: GameCtx, s: State, side: string, pts: number): boolean {
  if (pts <= 0 || s.phase === 'final') return s.phase === 'final';
  s.scores[side] = (s.scores[side] ?? 0) + pts;
  if (s.scores[side] >= s.settings.target) {
    s.phase = 'final';
    s.winner = side;
    ctx.fx('win', soloOf(s.sides, side));
    return true;
  }
  return false;
}

/** روندا / تريلا detection for one hand of cards. */
function announcement(cards: Card[]) {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  let value = 0;
  let best = -1;
  let tringa = false;
  for (const [rank, k] of counts) {
    if (k === 2) {
      value += 1;
      best = Math.max(best, 100 + rankIndex(rank));
    } else if (k === 3) {
      value += 5;
      tringa = true;
      best = Math.max(best, 200 + rankIndex(rank));
    } else if (k === 4) {
      value += 2; // four of a kind counts as two rondas
      best = Math.max(best, 100 + rankIndex(rank));
    }
  }
  const label = tringa ? 'تريلا!!' : value >= 2 ? 'جوج روندات!' : 'روندا!';
  return { value, best, label };
}

function announce(ctx: GameCtx, s: State): boolean {
  const bySide = new Map<string, { value: number; best: number }>();
  const calls: { id: string; label: string; best: number }[] = [];
  for (const id of s.seats) {
    const a = announcement(s.hands[id]);
    if (!a.value) continue;
    calls.push({ id, label: a.label, best: a.best });
    s.feed.push(`${ctx.playerName(id)}: ${a.label}`, { by: id });
    const side = sideOf(s.sides, id);
    const cur = bySide.get(side) ?? { value: 0, best: -1 };
    bySide.set(side, { value: cur.value + a.value, best: Math.max(cur.best, a.best) });
  }
  if (bySide.size === 0) return false;
  ctx.fx('reveal');
  const named = calls.map((c) => `${ctx.playerName(c.id)}: ${c.label}`).join(' · ');
  // the strongest announcer of a side speaks for it on the banner
  const voice = (side: string) =>
    calls.filter((c) => sideOf(s.sides, c.id) === side).sort((x, y) => y.best - x.best)[0]?.id ?? null;
  const entries = [...bySide.entries()];
  if (entries.length === 1) {
    const [side, { value }] = entries[0];
    const by = voice(side);
    s.feed.push(`+${value}`, { points: value, by: by ?? undefined });
    setAnnounce(s, by, calls.length === 1 ? `${calls[0].label} +${value}` : `${named} — +${value}`);
    return addPoints(ctx, s, side, value);
  }
  const top = Math.max(...entries.map(([, v]) => v.best));
  const leaders = entries.filter(([, v]) => v.best === top);
  if (leaders.length === 1) {
    const total = entries.reduce((t, [, v]) => t + v.value, 0);
    const side = leaders[0][0];
    const by = voice(side);
    s.feed.push(`الأقوى يأخذ الكل: +${total}`, { points: total, by: by ?? undefined });
    setAnnounce(s, by, `${named}\nالأقوى يأخذ الكل: +${total}`);
    return addPoints(ctx, s, side, total);
  }
  // equal announcements: everyone keeps their own
  setAnnounce(s, null, `${named}\nتعادل — كل واحد يأخذ نقاطه`);
  for (const [side, v] of leaders) if (addPoints(ctx, s, side, v.value)) return true;
  s.feed.push('تعادل في الروندا');
  return false;
}

/** `quiet`: a capture sound was already played in this action, don't cover it with the deal sound. */
function dealRound(ctx: GameCtx, s: State, quiet = false): boolean {
  const players = n(s);
  let per = HAND_SIZE;
  if (s.deck.length < HAND_SIZE * players) per = Math.floor(s.deck.length / players);
  for (let i = 1; i <= players; i++) {
    const id = s.seats[(s.dealerIdx + i) % players];
    s.hands[id].push(...s.deck.splice(0, per));
  }
  if (per < HAND_SIZE && s.deck.length) s.table.push(...s.deck.splice(0)); // leftovers
  s.deal += 1;
  s.lastPlayed = null;
  if (per === 0) return false;
  if (!quiet) ctx.fx('card');
  return announce(ctx, s);
}

function startHand(ctx: GameCtx, s: State) {
  s.hand += 1;
  s.deal = 0;
  s.phase = 'play';
  s.deck = freshDeck();
  s.table = [];
  s.hands = Object.fromEntries(s.seats.map((id) => [id, []]));
  s.captured = Object.fromEntries(s.sides.map((x) => [x.key, []]));
  s.lastCapturer = null;
  s.lastPlay = null;
  s.announce = null;
  s.handSummary = null;
  s.dealerIdx = (s.dealerIdx + 1) % n(s);
  s.turnIdx = (s.dealerIdx + 1) % n(s);
  s.feed.clear();
  s.feed.push(`اليد ${s.hand} — التوزيع: ${ctx.playerName(s.seats[s.dealerIdx])}`);
  dealRound(ctx, s);
}

function endHand(ctx: GameCtx, s: State) {
  if (s.table.length && s.lastCapturer) {
    s.captured[sideOf(s.sides, s.lastCapturer)].push(...s.table);
    s.feed.push(`${ctx.playerName(s.lastCapturer)} يأخذ ما بقي على الطاولة`);
    s.table = [];
  }
  const base = rondaBase(s.sides.length);
  s.handSummary = s.sides.map((x) => {
    const cards = s.captured[x.key].length;
    return { side: x.key, cards, points: cards > base ? cards - base : 0 };
  });
  s.phase = 'handEnd';
  ctx.fx('reveal');
  for (const row of s.handSummary) if (addPoints(ctx, s, row.side, row.points)) return;
}

function findCapture(table: Card[], card: Card): Card[] {
  const match = table.find((c) => c.rank === card.rank);
  if (!match) return [];
  const took = [match];
  for (let idx = rankIndex(card.rank) + 1; idx < RANKS.length; idx++) {
    const next = table.find((c) => c.rank === RANKS[idx] && !took.includes(c));
    if (!next) break;
    took.push(next);
  }
  return took;
}

export const ronda: GameModule<State, RondaSettings> = {
  turnOf: (s) => s.phase === 'play' ? [s.seats[s.turnIdx]] : [],
  id: 'ronda',
  hostOnly: ['next'],

  start(ctx, participants, settings) {
    const sides = makeSides(participants, participants.length === 4);
    const s: State = {
      settings,
      seats: participants,
      sides,
      scores: Object.fromEntries(sides.map((x) => [x.key, 0])),
      phase: 'play',
      hand: 0,
      deal: 0,
      dealerIdx: Math.floor(Math.random() * participants.length) - 1,
      turnIdx: 0,
      deck: [],
      hands: {},
      table: [],
      captured: {},
      lastCapturer: null,
      lastPlayed: null,
      lastPlay: null,
      announce: null,
      announceN: 0,
      feed: new Feed(),
      handSummary: null,
      winner: null,
    };
    if (s.dealerIdx < 0) s.dealerIdx = participants.length - 1;
    startHand(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'handEnd') startHand(ctx, s);
      return;
    }
    if (a.type !== 'play' || s.phase !== 'play') return;
    if (s.seats[s.turnIdx] !== by) throw new GameError('ماشي دورك');
    if (!isStr(a.card)) return;
    const hand = s.hands[by];
    const card = removeCard(hand, a.card);
    if (!card) return;
    const side = sideOf(s.sides, by);
    const prev = s.seats[(s.turnIdx - 1 + n(s)) % n(s)];
    const took = findCapture(s.table, card);
    let ended = false;

    if (took.length) {
      const wasEsti = s.lastPlayed?.by === prev && s.lastPlayed.cardId === took[0].id;
      s.table = s.table.filter((c) => !took.includes(c));
      s.captured[side].push(card, ...took);
      s.lastCapturer = by;
      const lastCardOfHand = s.deck.length === 0 && s.seats.every((id) => s.hands[id].length === 0);
      const missa = s.table.length === 0 && !lastCardOfHand;
      s.feed.push(`${ctx.playerName(by)} أخذ ${took.length + 1} أوراق`, { by });
      let pts = 0;
      if (wasEsti) {
        pts += 1;
        s.feed.push('إسطي! +1', { by, points: 1 });
      }
      if (missa) {
        pts += 1;
        s.feed.push('مسّة! +1', { by, points: 1 });
      }
      if (pts) setAnnounce(s, by, wasEsti && missa ? 'إسطي ومسّة! +2' : wasEsti ? 'إسطي! +1' : 'مسّة! +1');
      ctx.fx(pts ? 'reveal' : 'correct', by);
      s.lastPlayed = null;
      ended = addPoints(ctx, s, side, pts);
    } else {
      s.table.push(card);
      s.lastPlayed = { by, cardId: card.id };
      s.feed.push(`${ctx.playerName(by)} رمى ${cardName(card)}`, { by });
      ctx.fx('card');
    }
    s.lastPlay = { by, card, took };
    if (ended) return;

    s.turnIdx = (s.turnIdx + 1) % n(s);
    if (s.seats.every((id) => s.hands[id].length === 0)) {
      if (s.deck.length) {
        if (dealRound(ctx, s, took.length > 0)) return;
        if (s.seats.every((id) => s.hands[id].length === 0)) endHand(ctx, s);
      } else endHand(ctx, s);
    }
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play') return;
    const bot = s.seats[s.turnIdx];
    if (!ctx.isBot(bot)) return;
    const hand = s.hands[bot];
    if (!hand.length) return;
    const prev = s.seats[(s.turnIdx - 1 + n(s)) % n(s)];
    let best: Card = pick(hand);
    let bestScore = -1;
    for (const c of hand) {
      const took = findCapture(s.table, c);
      if (!took.length) continue;
      let score = took.length + 1;
      if (s.lastPlayed?.by === prev && s.lastPlayed.cardId === took[0].id) score += 10;
      if (took.length === s.table.length) score += 8;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (bestScore < 0) {
      // nothing to take: drop a card whose rank we hold twice (safer), else a random one
      const dup = hand.find((c) => hand.filter((x) => x.rank === c.rank).length > 1);
      best = dup ?? pick(hand);
    }
    ctx.bot(bot, `play:${s.hand}:${s.deal}:${hand.length}`, randDelay(1100, 2300), { type: 'play', card: best.id });
  },

  view(ctx, s, me): RondaView {
    return {
      game: 'ronda',
      phase: s.phase,
      participants: s.seats,
      sides: s.sides,
      turn: s.seats[s.turnIdx],
      dealer: s.seats[s.dealerIdx],
      hand: s.hand,
      deal: s.deal,
      myHand: sortHand(s.hands[me] ?? []),
      handCounts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      table: s.table,
      deckLeft: s.deck.length,
      capturedCounts: Object.fromEntries(s.sides.map((x) => [x.key, s.captured[x.key]?.length ?? 0])),
      scores: s.scores,
      target: s.settings.target,
      lastPlay: s.lastPlay,
      announce: s.announce,
      base: rondaBase(s.sides.length),
      feed: s.feed.list(),
      handSummary: s.handSummary,
      winner: s.winner,
    };
  },

  onLeave(ctx, s, id) {
    // a seat can't simply disappear from a card game: end the game politely
    if (s.seats.includes(id) && s.phase !== 'final') {
      s.feed.push(`${ctx.playerName(id)} غادر اللعبة`);
      s.phase = 'final';
      s.winner = null;
    }
  },
};
