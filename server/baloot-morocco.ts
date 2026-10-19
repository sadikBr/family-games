/**
 * «البلوط» — the Moroccan rules (النمط المغربي) on the server, used when `settings.mode === 'morocco'`:
 * the purchase (الشرا: «شاري» the face-up suit or pass, then another suit or pass, الفورص on a face-up
 * Jack), the announcements declared on the 2nd trick and shown on the 3rd, بلوط-ريبلوط, the scoring
 * (each team its own points, دخل, كابو 252, ليتيج carried over) and the game's end at 1000 (البيل on a
 * tie above it). The rest of the game (dealing, tricks, pauses, timers, turns) is the Saudi module's.
 */
import { maLegal, annKey, bestAnnSide, findAnnouncements, maScoreHand, maSuitName, ANN_NAME, MA_BELOTE, type Ann } from '../src/shared/baloot-morocco';
import { B_SUITS } from '../src/shared/baloot-rules';
import type { BalootCall, BalootOption, BCard, BProjectView, BSide, BSuit } from '../src/shared/games/baloot';
import type { GameAction } from '../src/shared/protocol';
import { hokmStrength } from './baloot-bot';
import type { State } from './games/baloot';
import { GameError, type GameCtx } from './types';
import { isStr } from './util';

export const isMorocco = (s: State) => s.settings.mode === 'morocco';

const sideOf = (s: State, id: string): BSide => (s.sides[0].members.includes(id) ? 'A' : 'B');
const teamName = (ctx: GameCtx, s: State, side: BSide) =>
  `فريق ${s.sides.find((x) => x.key === side)!.members.map((m) => ctx.playerName(m)).join(' و')}`;

/* ------------------------------------------------------------------ */
/* The purchase (الشرا)                                                */
/* ------------------------------------------------------------------ */

/** What the player whose turn it is may say: «شاري» (or the forced take on a Jack) / another suit, or pass. */
export function maBidOptions(s: State, id: string): BalootOption[] {
  const b = s.bid;
  if (s.phase !== 'bid' || !b || s.redealAt !== null || b.queue[0] !== id || !s.faceUp) return [];
  if (b.round === 1) {
    // الفورص: a face-up Jack must be taken by the first player
    if (s.faceUp.rank === 'J' && b.order[0] === id) return [{ call: 'hokm' }];
    return [{ call: 'pass' }, { call: 'hokm' }];
  }
  return [{ call: 'pass' }, { call: 'hokm2', suits: B_SUITS.filter((x) => x !== s.faceUp!.suit) }];
}

/** One bidding move. 'play': someone bought (the cards are dealt); 'redeal': everyone passed twice. */
export function maBidCall(ctx: GameCtx, s: State, by: string, call: BalootCall, suit: unknown): 'play' | 'redeal' | null {
  const b = s.bid!;
  const opt = maBidOptions(s, by).find((o) => o.call === call);
  if (!opt) throw new GameError(b.queue[0] === by ? 'لا يمكنك هذا الاختيار الآن' : 'ليس دورك');
  if (call === 'hokm2' && !(isStr(suit) && opt.suits?.includes(suit as BSuit))) throw new GameError('اختر شكل الأتو');
  b.queue.shift();
  if (call === 'hokm' || call === 'hokm2') {
    const trump = call === 'hokm' ? s.faceUp!.suit : (suit as BSuit);
    const forced = call === 'hokm' && s.faceUp!.rank === 'J' && b.order[0] === by;
    b.calls[by] = { call, suit: trump };
    maDeal(ctx, s, by, trump, forced);
    return 'play';
  }
  b.calls[by] = { call: 'pass' };
  ctx.say?.(`باص: ${ctx.playerName(by)}`, by);
  if (b.queue.length) return null;
  if (b.round === 1) {
    b.round = 2;
    b.calls = {};
    b.queue = b.order.slice();
    ctx.say?.('لا شراء في الجولة الأولى — الجولة الثانية: أتو بشكل آخر');
    return null;
  }
  return 'redeal';
}

/** The taker (الشاري) gets the face-up card + 2, everyone else 3 (dealer's right first). */
function maDeal(ctx: GameCtx, s: State, buyer: string, trump: BSuit, forced: boolean) {
  s.contract = { mode: 'hokm', trump, buyer, caller: buyer, call: 'hokm', mult: 1, gahwa: false };
  for (const id of s.bid!.order) {
    if (id === buyer) s.hands[id].push(s.faceUp!, ...s.stock.splice(0, 2));
    else s.hands[id].push(...s.stock.splice(0, 3));
  }
  s.faceUp = null;
  for (const id of s.seats) s.maAvail[id] = findAnnouncements(s.hands[id], trump);
  s.balootHolder = s.seats.find((id) => ['K', 'Q'].every((r) => s.hands[id].some((c) => c.suit === trump && c.rank === r))) ?? null;
  ctx.say?.(`الشاري: ${ctx.playerName(buyer)} — الأتو: ${maSuitName(trump)}${forced ? ' (الفورص)' : ''}`, buyer);
  ctx.fx('correct', buyer);
}

/* ------------------------------------------------------------------ */
/* Tricks                                                              */
/* ------------------------------------------------------------------ */

export const maPlayable = (s: State, id: string) => maLegal(s.hands[id], s.trick, s.contract!.trump!);

/** Why a card may not be played. */
export function maIllegal(s: State, id: string): string {
  const trump = s.contract!.trump!;
  const led = s.trick[0]?.card.suit;
  const hand = s.hands[id];
  if (led === trump && hand.some((c) => c.suit === trump)) return 'يجب أن تلعب أتو أعلى إن استطعت';
  if (hand.some((c) => c.suit === led)) return 'يجب أن تتبع الشكل المطلوب';
  return 'يجب أن تقطع بالأتو';
}

/** The 2nd trick: the announcements a player declares with the card (before it leaves the hand). */
export function maDeclare(s: State, by: string, declare: unknown): string[] {
  if (s.trickNo !== 2) return [];
  const keys = Array.isArray(declare) ? declare.filter(isStr) : [];
  s.maDeclared[by] = (s.maAvail[by] ?? []).filter((a) => keys.includes(annKey(a)));
  return s.maDeclared[by].length ? [`إعلان: ${s.maDeclared[by].map((a) => ANN_NAME[a.kind]).join(' و')}`] : [];
}

/** بلوط with the first of K / Q of trumps, ريبلوط (+20) with the second. */
export function maBelote(s: State, by: string, card: BCard): string | null {
  const trump = s.contract!.trump;
  if (by !== s.balootHolder || card.suit !== trump || (card.rank !== 'K' && card.rank !== 'Q')) return null;
  s.balootPlayed += 1;
  if (s.balootPlayed === 1) return 'بلوط!';
  s.baloot.push(by);
  return `ريبلوط! (+${MA_BELOTE})`;
}

/** The 3rd trick starts: the best team's announcements are shown to everyone. */
export function maShowAnnouncements(ctx: GameCtx, s: State) {
  const all = s.firstOrder.flatMap((by) => (s.maDeclared[by] ?? []).map((ann) => ({ by, ann })));
  const side = bestAnnSide(all, s.firstOrder, s.contract!.trump, (id) => sideOf(s, id));
  if (!side) return;
  const items = all.filter((d) => sideOf(s, d.by) === side);
  s.maShown = { side, items };
  s.projPoints[side] = items.reduce((t, d) => t + d.ann.points, 0);
  ctx.say?.(`الإعلانات ل${teamName(ctx, s, side)}: ${items.map((d) => ANN_NAME[d.ann.kind]).join('، ')} (+${s.projPoints[side]})`);
  ctx.fx('reveal');
}

/* ------------------------------------------------------------------ */
/* End of a hand                                                       */
/* ------------------------------------------------------------------ */

/** Score the hand; returns the team that won the game, or null when the game goes on. */
export function maEndHand(ctx: GameCtx, s: State): BSide | null {
  const c = s.contract!;
  const buyerSide = sideOf(s, c.buyer);
  const belote: Record<BSide, number> = { A: 0, B: 0 };
  for (const id of s.baloot) belote[sideOf(s, id)] += MA_BELOTE;
  const out = maScoreHand({ buyerSide, cards: s.abnat, tricks: s.tricks, ann: s.projPoints, belote, pot: s.pot });
  s.pot = out.pot;
  s.result = {
    hand: s.hand,
    contract: { ...c },
    buyerSide,
    abnat: { ...s.abnat },
    ground: sideOf(s, s.lastTrick?.winner ?? s.trickWinner!),
    tricks: { ...s.tricks },
    projects: { ...s.projPoints },
    baloot: belote,
    points: out.points,
    failed: out.failed,
    kaboot: out.kaboot,
    winner: out.winner ?? (buyerSide === 'A' ? 'B' : 'A'),
    litige: out.litige,
    potWon: out.potWon,
  };
  s.scores.A += out.points.A;
  s.scores.B += out.points.B;
  const tag = out.kaboot ? 'كابو' : out.failed ? 'دخل' : out.litige ? 'ليتيج' : undefined;
  s.history.push({ A: out.points.A, B: out.points.B, tag, mode: 'hokm', buyerSide });
  s.phase = 'handEnd';
  s.turn = null;
  ctx.say?.(
    `نهاية اليد ${s.hand}: ${teamName(ctx, s, 'A')} +${out.points.A}، ${teamName(ctx, s, 'B')} +${out.points.B}${tag ? ` — ${tag}` : ''}`,
  );
  const t = s.settings.target;
  if (s.scores.A < t && s.scores.B < t) return null;
  if (s.scores.A !== s.scores.B) return s.scores.A > s.scores.B ? 'A' : 'B';
  s.bel = true;
  ctx.say?.('تعادل فوق الهدف — البيل: يد فاصلة');
  return null;
}

/* ------------------------------------------------------------------ */
/* Bots and the view                                                   */
/* ------------------------------------------------------------------ */

/** A bot's (or a timed-out player's) purchase: buy when the trump suit is strong (J / 9 of trumps, aces). */
export function maDecideBid(s: State, id: string, level: number, timeout: boolean): GameAction {
  const options = maBidOptions(s, id);
  if (options.length === 1) return { type: 'bid', call: options[0].call };
  if (timeout) return { type: 'bid', call: 'pass' };
  const withUp = [...s.hands[id], s.faceUp!];
  const jitter = level < 2 ? (Math.random() * 2 - 1) * 1.5 + 0.8 : 0;
  const T = 6.6 + jitter;
  if (options.some((o) => o.call === 'hokm') && hokmStrength(withUp, s.faceUp!.suit) >= T) return { type: 'bid', call: 'hokm' };
  const h2 = options.find((o) => o.call === 'hokm2');
  if (h2?.suits?.length) {
    const best = h2.suits.map((x) => ({ x, v: hokmStrength(withUp, x) })).sort((a, b) => b.v - a.v)[0];
    if (best.v >= T + 0.3) return { type: 'bid', call: 'hokm2', suit: best.x };
  }
  return { type: 'bid', call: 'pass' };
}

/** The announcements a bot declares (all of them, on the 2nd trick). */
export const maBotDeclare = (s: State, id: string) => (s.trickNo === 2 ? (s.maAvail[id] ?? []).map(annKey) : []);

/** a sequence is shown low to high, the way it is read on the Moroccan cards (11 12 1) */
const annView = (by: string, a: Ann, cards: boolean): BProjectView => ({
  by,
  kind: a.kind,
  points: a.points,
  ...(cards ? { cards: a.kind === 'carre' ? a.cards : a.cards.slice().reverse() } : {}),
});

/** The announcement parts of the view: names on the 2nd trick, the best team's cards on the 3rd, mine to declare. */
export function maViewAnn(s: State, me: string): { declared: BProjectView[]; shown: { side: BSide; items: BProjectView[] } | null; myProjects: (BProjectView & { key: string })[] } {
  const playing = s.phase === 'play';
  const myTurn = playing && s.trickNo === 2 && s.turn === me && s.pauseUntil === null;
  return {
    declared: playing && s.trickNo === 2 ? s.firstOrder.flatMap((by) => (s.maDeclared[by] ?? []).map((a) => annView(by, a, false))) : [],
    shown: playing && s.trickNo === 3 && s.maShown ? { side: s.maShown.side, items: s.maShown.items.map((d) => annView(d.by, d.ann, true)) } : null,
    myProjects: myTurn
      ? (s.maAvail[me] ?? []).map((a) => ({ ...annView(me, a, true), key: annKey(a) }))
      : [],
  };
}
