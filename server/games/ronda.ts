/**
 * روندا — the family variant: 4 cards each, no cards dealt to the table.
 * Play a card: if the same rank is on the table you take it, plus the cards that follow
 * it in sequence (… 6, 7, 10, 11, 12). دقة = taking the card just played by the
 * previous player (+1); if the next player answers with the third card of that rank, they take the
 * three cards from the other pile («ف جوج», +5), and the fourth card takes all four («ف ثلاثة», +10). ميسا = clearing the table (+1). روندا (pair) = 1, ترينكا
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
  /** card left on the table by the previous turn (for دقة) */
  lastPlayed: { by: string; cardId: string } | null;
  /**
   * After a دقة: the cards of that rank just taken, still on top of the taker's pile. The very
   * next player can answer with the same rank and take them all: 3 cards = +5, 4 cards = +10.
   */
  chain: { by: string; side: string; rank: Card['rank']; cards: Card[] } | null;
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

/** «ورقتين» / «3 أوراق» / «11 ورقة» */
export const cardsWord = (k: number) => (k === 1 ? 'ورقة' : k === 2 ? 'ورقتان' : k <= 10 ? `${k} أوراق` : `${k} ورقة`);

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

/** روندا / ترينكا detection for one hand of cards. */
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
  const label = tringa ? 'ترينكا!!' : value >= 2 ? 'روندتان!' : 'روندا!';
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
  setAnnounce(s, null, `${named}\nتعادل — يأخذ كلٌّ نقاطه`);
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
  s.chain = null;
  s.announce = null;
  s.handSummary = null;
  s.dealerIdx = (s.dealerIdx + 1) % n(s);
  s.turnIdx = (s.dealerIdx + 1) % n(s);
  s.feed.clear();
  s.feed.push(`اليد ${s.hand} — التوزيع: ${ctx.playerName(s.seats[s.dealerIdx])}`);
  ctx.say?.(`اليد ${s.hand} — التوزيع: ${ctx.playerName(s.seats[s.dealerIdx])}`);
  dealRound(ctx, s);
  // a روندا / ترينكا at the first deal: say it (the banner shows it on the felt too)
  const call = s.announce as State['announce'];
  if (call) ctx.say?.(call.text.replace(/\n/g, ' — '), call.by ?? undefined);
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

/**
 * «المفرّق ياكل القاعة» (agreed from the start): at the last deal, the dealer's very last card must
 * take. If it takes, the dealer's side also takes everything left on the table (القاعة); taking
 * with the king (الراي) is +5 for the dealer's side. Playing the ace (اللاص) as that card, or taking
 * nothing with it, is +5 for the other side(s).
 */
function dealerEatsTable(ctx: GameCtx, s: State, by: string, card: Card, took: boolean): { ended: boolean; said: string } {
  if (by !== s.seats[s.dealerIdx]) return { ended: false, said: '' };
  const side = sideOf(s.sides, by);
  const name = ctx.playerName(by);
  if (took && s.table.length) {
    s.captured[side].push(...s.table);
    s.feed.push(`المفرّق ياكل القاعة: ${cardsWord(s.table.length)} لـ${name}`, { by });
    s.table = [];
  }
  const others = s.sides.map((x) => x.key).filter((k) => k !== side);
  if (took && card.rank === 12) {
    s.feed.push('المفرّق ياكل القاعة بالراي! +5', { by, points: 5 });
    setAnnounce(s, by, 'المفرّق ياكل القاعة بالراي! +5');
    return { ended: addPoints(ctx, s, side, 5), said: 'المفرّق ياكل القاعة بالراي: +5' };
  }
  if (card.rank === 1 || !took) {
    const why = took ? 'آخر ورقة للمفرّق هي الواحد' : 'آخر ورقة للمفرّق بلا أخذ';
    const gain = `+5 ${others.length > 1 ? 'لكل خصم' : 'للخصم'}`;
    s.feed.push(`${why}: ${gain}`, { points: 5 });
    setAnnounce(s, null, `${why}\n${gain}`);
    for (const k of others) if (addPoints(ctx, s, k, 5)) return { ended: true, said: `${why}: ${gain}` };
    return { ended: false, said: `${why}: ${gain}` };
  }
  return { ended: false, said: took ? 'المفرّق ياكل القاعة' : '' };
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
      chain: null,
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
    if (s.seats[s.turnIdx] !== by) throw new GameError('ليس دورك');
    if (!isStr(a.card)) return;
    const hand = s.hands[by];
    const card = removeCard(hand, a.card);
    if (!card) return;
    const side = sideOf(s.sides, by);
    const prev = s.seats[(s.turnIdx - 1 + n(s)) % n(s)];
    const took = findCapture(s.table, card);
    let ended = false;

    let said = '';
    const chain = s.chain && s.chain.by === prev && s.chain.rank === card.rank && s.chain.side !== side ? s.chain : null;
    if (chain) {
      // the third (or fourth) card of the rank right after a دقة: take those cards from the other pile
      // everything the دقة took (the matched card AND the run that followed it: 1 → 1 2 3) changes pile
      const pile = s.captured[chain.side];
      for (const c of chain.cards) {
        const i = pile.findIndex((x) => x.id === c.id);
        if (i >= 0) pile.splice(i, 1);
      }
      s.captured[side].push(card, ...chain.cards);
      s.lastCapturer = by;
      const count = chain.cards.length + 1;
      const same = chain.cards.filter((c) => c.rank === card.rank).length + 1;
      const pts = same >= 4 ? 10 : 5;
      // the table's own calls: دقة → ف جوج (+5) → ف ثلاثة (+10)
      const label = same >= 4 ? 'ف ثلاثة! +10' : 'ف جوج! +5';
      s.feed.push(`${label} لـ${ctx.playerName(by)}`, { by, points: pts });
      setAnnounce(s, by, label);
      said = `أخذٌ لـ${ctx.playerName(by)}: ${cardsWord(count)} بـ ${cardName(card)} — +${pts}`;
      ctx.fx('reveal', by);
      s.chain = same < 4 ? { by, side, rank: card.rank, cards: [...chain.cards, card] } : null;
      s.lastPlayed = null;
      s.lastPlay = { by, card, took: chain.cards };
      ended = addPoints(ctx, s, side, pts);
    } else if (took.length) {
      const wasDaqa = s.lastPlayed?.by === prev && s.lastPlayed.cardId === took[0].id;
      s.table = s.table.filter((c) => !took.includes(c));
      s.captured[side].push(card, ...took);
      s.lastCapturer = by;
      const lastCardOfHand = s.deck.length === 0 && s.seats.every((id) => s.hands[id].length === 0);
      const missa = s.table.length === 0 && !lastCardOfHand;
      s.feed.push(`أخذٌ لـ${ctx.playerName(by)}: ${cardsWord(took.length + 1)} بـ ${cardName(card)}`, { by });
      let pts = 0;
      if (wasDaqa) {
        pts += 1;
        s.feed.push('دقة! +1', { by, points: 1 });
      }
      if (missa) {
        pts += 1;
        s.feed.push('ميسا! +1', { by, points: 1 });
      }
      if (pts) setAnnounce(s, by, wasDaqa && missa ? 'دقة وميسا! +2' : wasDaqa ? 'دقة! +1' : 'ميسا! +1');
      said = `أخذٌ لـ${ctx.playerName(by)}: ${cardsWord(took.length + 1)} بـ ${cardName(card)}${wasDaqa && missa ? ' — دقة وميسا!' : wasDaqa ? ' — دقة!' : missa ? ' — ميسا!' : ''}`;
      ctx.fx(pts ? 'reveal' : 'correct', by);
      s.lastPlayed = null;
      // a دقة opens a chain: the next player may answer with the same rank and take all of it,
      // the run included (1 on 1 2 3 → the answer takes 1 1 1 2 3)
      s.chain = wasDaqa ? { by, side, rank: card.rank, cards: [...took, card] } : null;
      s.lastPlay = { by, card, took };
      ended = addPoints(ctx, s, side, pts);
    } else {
      s.table.push(card);
      s.lastPlayed = { by, cardId: card.id };
      s.feed.push(`${ctx.playerName(by)} رمى ${cardName(card)}`, { by });
      ctx.fx('card');
      said = `ورقة من ${ctx.playerName(by)}: ${cardName(card)}`;
      s.chain = null;
      s.lastPlay = { by, card, took };
    }
    if (!ended && s.deck.length === 0 && s.seats.every((id) => s.hands[id].length === 0)) {
      const r = dealerEatsTable(ctx, s, by, card, !!chain || took.length > 0);
      ended = r.ended;
      if (r.said) said += ` — ${r.said}`;
    }
    ctx.say?.(said, by);
    if (ended) return;

    s.turnIdx = (s.turnIdx + 1) % n(s);
    if (s.seats.every((id) => s.hands[id].length === 0)) {
      if (s.deck.length) {
        const before = s.announceN;
        const won = dealRound(ctx, s, took.length > 0);
        // a روندا / ترينكا at this deal scores: it replaces the play in the announcement line
        // (the play itself stays on the felt)
        if (s.announceN !== before && s.announce) ctx.say?.(s.announce.text.replace(/\n/g, ' — '), s.announce.by ?? undefined);
        if (won) return;
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
      // answering a دقة with the same rank is worth +5 / +10: always take it
      if (s.chain && s.chain.by === prev && s.chain.rank === c.rank && s.chain.side !== sideOf(s.sides, bot)) {
        best = c;
        bestScore = 100;
        break;
      }
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

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    // the side that reached the target, then the other sides by score (partners share their side's place)
    const members = (key: string) => s.sides.find((x) => x.key === key)?.members ?? [];
    const rest = s.sides.map((x) => x.key).filter((k) => k !== s.winner);
    return { places: [members(s.winner), ...placesByScore(rest, (k) => s.scores[k] ?? 0).map((keys) => keys.flatMap(members))] };
  },
};
