/**
 * «الرامي» — Moroccan rummy with two French decks and 4 jokers (108 cards), 2–6 players, bots welcome.
 * Rules from rasderb.com/rules/rami, two variants (a lobby setting):
 * - التلّاج: 14 cards each (the first player 15, and starts by laying down / discarding). The first
 *   laydown of a player must be worth 71 (or 51) from frank melds and hold a frank set and a frank
 *   run; with the ceiling on, every later first laydown must beat the highest one so far. Laying the
 *   whole hand at once is exempt. Once down, a player lays and adds to any meld freely and may swap
 *   a joker back. A card taken from the discard pile must go down the same turn (else the round is lost).
 * - سامبل: 13 cards each (the first 14). Nobody lays down before going out: the whole hand goes down
 *   in one turn, with a frank set and a frank run.
 * Turn: draw (stock, or the discard — not during the table's first round, nor with one card in hand),
 * lay down, discard. Empty hand = «رامي»: the others pay 10 a card (joker 20), 100 if they never laid
 * down; after a «رامي سيك» (out in one go without having laid down before) 200, and double for those
 * who laid down. سامبل: everyone else pays 100. First to reach the limit ends the game: lowest total wins.
 */
import {
  RAMI_ROUND_END_MS,
  type RCard,
  type RMeld,
  type RamiRoundRow,
  type RamiSettings,
  type RamiView,
} from '../../src/shared/games/rami';
import {
  addToMeld,
  canUseCard,
  checkLay,
  findLay,
  handPoints,
  makeRamiDeck,
  ramiCardName,
  sortRami,
  swapIndex,
  swapped,
} from '../../src/shared/rami-rules';
import { Feed, randDelay } from '../cardkit';
import { botDiscard, botDraw, botPlay, type BotAction, type Seat } from '../rami-bot';
import { GameError, botLevel, type GameCtx, type GameModule } from '../types';
import type { BotLevel } from '../../src/shared/protocol';
import { isNum, isStr, shuffle } from '../util';

export const ROUND_END_MS = RAMI_ROUND_END_MS;
/** The discard pile goes back into the stock at most this many times per round. */
const MAX_RESHUFFLES = 2;
const dealSize = (s: { settings: RamiSettings }) => (s.settings.variant === 'sample' ? 13 : 14);

export interface State {
  settings: RamiSettings;
  seats: string[];
  active: string[];
  scores: Record<string, number>;
  history: Record<string, number>[];
  phase: RamiView['phase'];
  round: number;
  dealerIdx: number;
  turn: string;
  step: RamiView['step'];
  /** turns finished this round (the table's first round is over once everyone has played once) */
  turnsDone: number;
  /** the number of the current turn in this round (to tell a «رامي سيك») */
  turnNo: number;
  stock: RCard[];
  discard: RCard[];
  throwers: (string | null)[];
  reshuffles: number;
  hands: Record<string, RCard[]>;
  melds: RMeld[];
  meldSeq: number;
  /** players down this round → what their first laydown was worth */
  openings: Record<string, number>;
  /** the turn each player first laid down in */
  openedTurn: Record<string, number>;
  /** the card taken from the discard pile this turn */
  taken: string | null;
  /** cards each player took from / threw on the discard pile this round (public: the bots remember them) */
  picked: Record<string, RCard[]>;
  thrown: Record<string, RCard[]>;
  feed: Feed;
  roundWinner: string | null;
  sec: boolean;
  forfeit: string | null;
  roundSummary: RamiRoundRow[] | null;
  winner: string | null;
  nextAt: number | null;
  deadline: number | null;
  lastMelds: RamiView['lastMelds'];
  /** bumps on every move (bot keys) */
  actions: number;
}

const talaj = (s: State) => s.settings.variant === 'talaj';
const opened = (s: State, id: string) => id in s.openings;

/** The least a new first laydown must be worth now. */
export function needNow(s: State): number {
  if (!talaj(s)) return Infinity;
  const best = Math.max(0, ...Object.values(s.openings));
  return s.settings.ceiling && best ? Math.max(s.settings.open, best + 1) : s.settings.open;
}

/** The taken card must still go down (التلّاج). */
const mustUse = (s: State, id: string) => talaj(s) && s.taken !== null && s.turn === id && s.hands[id].some((c) => c.id === s.taken);

function nextActive(s: State, from: string): string {
  const i = s.seats.indexOf(from);
  for (let k = 1; k <= s.seats.length; k++) {
    const id = s.seats[(i + k) % s.seats.length];
    if (s.active.includes(id)) return id;
  }
  return from;
}

function armTimer(ctx: GameCtx, s: State) {
  s.deadline = s.settings.timer > 0 && s.phase === 'play' ? ctx.now + s.settings.timer * 1000 : null;
}

function startRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'play';
  s.stock = shuffle(makeRamiDeck());
  const per = dealSize(s);
  let dealer = s.seats[s.dealerIdx] ?? s.active[0];
  dealer = nextActive(s, dealer);
  s.dealerIdx = s.seats.indexOf(dealer);
  s.turn = nextActive(s, dealer);
  // everyone gets 14 (سامبل 13); the first player one more, and starts without drawing
  s.hands = Object.fromEntries(s.seats.map((id) => [id, s.active.includes(id) ? s.stock.splice(0, per + (id === s.turn ? 1 : 0)) : []]));
  s.discard = [];
  s.throwers = [];
  s.reshuffles = 0;
  s.melds = [];
  s.openings = {};
  s.openedTurn = {};
  s.step = 'play';
  s.turnsDone = 0;
  s.turnNo = 1;
  s.taken = null;
  s.picked = {};
  s.thrown = {};
  s.roundWinner = null;
  s.sec = false;
  s.forfeit = null;
  s.roundSummary = null;
  s.nextAt = null;
  s.lastMelds = null;
  s.actions += 1;
  s.feed.clear();
  s.feed.push(`الجولة ${s.round} — ${per} ورقة لكل لاعب، و${per + 1} للبادئ`);
  ctx.say?.(`الجولة ${s.round} — البداية لـ${ctx.playerName(s.turn)}: ${per + 1} ورقة`);
  ctx.fx('card');
  armTimer(ctx, s);
}

function finishGame(ctx: GameCtx, s: State, winner: string | null) {
  s.winner = winner;
  s.phase = 'final';
  s.nextAt = null;
  s.deadline = null;
  if (winner) ctx.fx('win', winner);
}

/** The lowest total among those still in (ties: the one who went out this round, then seat order). */
function leader(s: State): string | null {
  return s.active.slice().sort((a, b) => s.scores[a] - s.scores[b] || Number(b === s.roundWinner) - Number(a === s.roundWinner))[0] ?? null;
}

/**
 * End of the round. `out` = who went out (null: the stock ran out, or a forfeit).
 */
function endRound(ctx: GameCtx, s: State, out: string | null, forfeit: string | null = null) {
  s.roundWinner = out;
  s.forfeit = forfeit;
  s.sec = !!out && talaj(s) && s.openedTurn[out] === s.turnNo;
  s.taken = null;
  s.deadline = null;
  s.roundSummary = s.active.map((id): RamiRoundRow => {
    const cards = sortRami(s.hands[id] ?? []);
    if (forfeit) return { id, cards, points: id === forfeit ? 100 : 0, status: id === forfeit ? 'forfeit' : 'void' };
    if (id === out) return { id, cards, points: 0, status: 'out' };
    if (!opened(s, id)) return { id, cards, points: !talaj(s) ? 100 : s.sec ? 200 : 100, status: 'closed' };
    const pts = cards.reduce((t, c) => t + handPoints(c), 0);
    return { id, cards, points: s.sec ? pts * 2 : pts, status: 'open' };
  });
  const gained: Record<string, number> = {};
  for (const row of s.roundSummary) {
    s.scores[row.id] = (s.scores[row.id] ?? 0) + row.points;
    gained[row.id] = row.points;
  }
  s.history.push(gained);
  if (out) {
    s.feed.push(s.sec ? `${ctx.playerName(out)}: رامي سيك!` : `${ctx.playerName(out)}: رامي!`, { by: out });
    ctx.say?.(s.sec ? `رامي سيك لـ${ctx.playerName(out)}! انتهت الجولة ${s.round}` : `رامي لـ${ctx.playerName(out)}! انتهت الجولة ${s.round}`, out);
  } else if (forfeit) {
    s.feed.push(`${ctx.playerName(forfeit)}: خسارة الجولة`, { by: forfeit });
    ctx.say?.(`خسارة الجولة لـ${ctx.playerName(forfeit)}: الورقة المأخوذة لم تنزل (+100)`, forfeit);
  } else {
    s.feed.push('انتهت الأوراق — انتهت الجولة');
    ctx.say?.(`انتهت الكومة — انتهت الجولة ${s.round}`);
  }
  if (s.active.some((id) => s.scores[id] >= s.settings.limit)) {
    finishGame(ctx, s, leader(s));
    return;
  }
  s.phase = 'roundEnd';
  s.nextAt = ctx.now + ROUND_END_MS;
  ctx.fx(out ? 'reveal' : 'tick');
}

function takeCards(hand: RCard[], ids: unknown): RCard[] | null {
  if (!Array.isArray(ids)) return null;
  const list = ids.filter(isStr);
  if (!list.length || list.length !== ids.length || new Set(list).size !== list.length) return null;
  const cards = list.map((id) => hand.find((c) => c.id === id));
  return cards.every(Boolean) ? (cards as RCard[]) : null;
}

const removeFrom = (hand: RCard[], cards: RCard[]) => {
  for (const c of cards) hand.splice(hand.indexOf(c), 1);
};

/** Mark a meld as just changed by `by` (kept until the next player has discarded). */
function touch(s: State, id: number, by: string) {
  s.lastMelds = s.lastMelds?.by === by ? { ids: [...new Set([...s.lastMelds.ids, id])], by } : { ids: [id], by };
}

/** Can `card` (taken from the discard) go down this turn for this player? */
export const canUseTaken = (s: State, id: string, card: RCard) => canUseCard(s.hands[id], card, { opened: opened(s, id), need: needNow(s), melds: s.melds });

/** Why the discard can't be taken now (null: it can). */
export function discardBlock(s: State, id: string): string | null {
  const top = s.discard[s.discard.length - 1];
  if (!top) return 'لا توجد ورقة مرمية';
  if (s.turnsDone < s.active.length) return 'لا تُؤخذ المرمية في الدورة الأولى';
  if (s.hands[id].length <= 1) return 'لا تُؤخذ المرمية وفي يدك ورقة واحدة';
  if (talaj(s) && !canUseTaken(s, id, top)) return 'لا يمكنك تنزيل هذه الورقة في هذا الدور، فلا تأخذها';
  return null;
}

function nextTurn(ctx: GameCtx, s: State, from: string) {
  s.turnsDone += 1;
  s.turnNo += 1;
  s.turn = nextActive(s, from);
  s.step = 'draw';
  s.taken = null;
  armTimer(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Moves                                                               */
/* ------------------------------------------------------------------ */

function drawStock(ctx: GameCtx, s: State, by: string) {
  if (!s.stock.length) {
    if (s.reshuffles >= MAX_RESHUFFLES || s.discard.length <= 1) {
      endRound(ctx, s, null);
      return;
    }
    s.reshuffles += 1;
    const top = s.discard.pop()!;
    s.stock = shuffle(s.discard);
    s.discard = [top];
    s.throwers = s.throwers.slice(-1);
    s.feed.push('خلط الأوراق المرمية في الكومة');
  }
  s.hands[by].push(s.stock.pop()!);
  s.step = 'play';
  s.actions += 1;
  s.feed.push(`${ctx.playerName(by)}: سحب من الكومة`, { by });
  ctx.say?.(`سحب من الكومة: ${ctx.playerName(by)}`, by);
  ctx.fx('card');
}

function drawDiscard(ctx: GameCtx, s: State, by: string) {
  const why = discardBlock(s, by);
  if (why) throw new GameError(why);
  const card = s.discard.pop()!;
  s.throwers.pop();
  s.hands[by].push(card);
  s.picked[by] = [...(s.picked[by] ?? []), card];
  s.taken = card.id;
  s.step = 'play';
  s.actions += 1;
  s.feed.push(`${ctx.playerName(by)}: أخذ ${ramiCardName(card)} من المرمية`, { by });
  ctx.say?.(`من المرمية إلى ${ctx.playerName(by)}: ${ramiCardName(card)}`, by);
  ctx.fx('card');
}

function lay(ctx: GameCtx, s: State, by: string, raw: unknown) {
  const hand = s.hands[by];
  if (!Array.isArray(raw) || !raw.length) throw new GameError('اختر أوراق التشكيلة');
  const groups = raw.map((g) => takeCards(hand, g));
  const all = groups.flatMap((g) => g ?? []);
  if (groups.some((g) => !g) || new Set(all.map((c) => c.id)).size !== all.length) throw new GameError('هذه الأوراق ليست في يدك');
  const check = checkLay(groups as RCard[][]);
  if (!check) throw new GameError('تشكيلة غير صحيحة: تيرسي (3–4 من الرتبة نفسها بأنواع مختلفة) أو سويفي (3 متتالية من النوع نفسه)، وجوكر واحد على الأكثر');
  const left = hand.length - all.length;
  const first = !opened(s, by);
  if (first) {
    if (!check.frankSet || !check.frankRun) throw new GameError('أول نزلة تحتاج إلى تيرسي فرانك وسويفي فرانك على الأقل (بلا جوكر)');
    // the taken card can't be the one left to throw
    const leftOk = left === 0 || (left === 1 && !(talaj(s) && s.taken && hand.some((c) => c.id === s.taken && !all.includes(c))));
    if (!talaj(s) && !leftOk) throw new GameError('في سامبل تنزّل يدك كاملة دفعة واحدة (تبقى ورقة واحدة على الأكثر لترميها)');
    const need = needNow(s);
    if (talaj(s) && !leftOk && check.value < need) {
      throw new GameError(`أول نزلة يجب أن تبلغ ${need} نقطة من تشكيلات فرانك — هذه ${check.value}`);
    }
  }
  removeFrom(hand, all);
  const firstId = s.meldSeq + 1;
  for (const m of check.melds) s.melds.push({ id: ++s.meldSeq, owner: by, kind: m.kind, slots: m.slots });
  for (let id = firstId; id <= s.meldSeq; id++) touch(s, id, by);
  if (first) {
    s.openings[by] = check.value;
    s.openedTurn[by] = s.turnNo;
  }
  s.actions += 1;
  const name = ctx.playerName(by);
  const n = check.melds.length;
  const what = n === 1 ? 'تشكيلة' : n === 2 ? 'تشكيلتان' : `${n} تشكيلات`;
  s.feed.push(first ? `${name}: نزلة أولى (${check.value})` : `${name}: ${what}`, { by });
  ctx.say?.(first && talaj(s) && left > 1 ? `نزلة أولى لـ${name}: ${what} بـ${check.value} نقطة` : `نزلة لـ${name}: ${what}`, by);
  ctx.fx('correct', by);
  if (!hand.length) endRound(ctx, s, by);
}

function addCards(ctx: GameCtx, s: State, by: string, meldId: unknown, raw: unknown) {
  if (!opened(s, by)) throw new GameError('انزل أولاً، ثم أضف إلى التشكيلات');
  const meld = s.melds.find((m) => m.id === meldId);
  const cards = takeCards(s.hands[by], raw);
  const slots = meld && cards ? addToMeld(meld, cards) : null;
  if (!isNum(meldId) || !meld || !cards || !slots) throw new GameError('هذه الأوراق لا تتناسب مع هذه التشكيلة');
  removeFrom(s.hands[by], cards);
  meld.slots = slots;
  touch(s, meld.id, by);
  s.actions += 1;
  const name = ctx.playerName(by);
  const what = cards.length === 1 ? ramiCardName(cards[0]) : `${cards.length} أوراق`;
  s.feed.push(`${name}: أضاف ${what}`, { by });
  ctx.say?.(`إضافة من ${name}: ${what} إلى تشكيلة ${ctx.playerName(meld.owner)}`, by);
  ctx.fx('correct', by);
  if (!s.hands[by].length) endRound(ctx, s, by);
}

function swapJoker(ctx: GameCtx, s: State, by: string, meldId: unknown, cardId: unknown) {
  if (!opened(s, by)) throw new GameError('انزل أولاً، ثم استرجع الجوكر');
  const meld = s.melds.find((m) => m.id === meldId);
  const card = isStr(cardId) ? s.hands[by].find((c) => c.id === cardId) : undefined;
  const slots = meld && card ? swapped(meld, card) : null;
  if (!meld || !card || !slots) throw new GameError('هذه الورقة ليست الورقة التي يمثّلها الجوكر');
  const joker = meld.slots[swapIndex(meld, card)].card;
  removeFrom(s.hands[by], [card]);
  s.hands[by].push(joker);
  meld.slots = slots;
  touch(s, meld.id, by);
  s.actions += 1;
  const name = ctx.playerName(by);
  s.feed.push(`${name}: استرجع الجوكر`, { by });
  ctx.say?.(`جوكر مسترجع لـ${name} مقابل ${ramiCardName(card)}`, by);
  ctx.fx('correct', by);
}

function discardCard(ctx: GameCtx, s: State, by: string, cardId: unknown) {
  const hand = s.hands[by];
  const idx = isStr(cardId) ? hand.findIndex((c) => c.id === cardId) : -1;
  if (idx < 0) return;
  if (mustUse(s, by)) throw new GameError('الورقة التي أخذتها من المرمية يجب أن تنزل في هذا الدور');
  if (cardId === s.taken && hand.length > 1) throw new GameError('لا يمكنك رمي الورقة التي أخذتها للتو');
  const [card] = hand.splice(idx, 1);
  s.discard.push(card);
  s.throwers.push(by);
  s.thrown[by] = [...(s.thrown[by] ?? []), card].slice(-12);
  if (s.lastMelds && s.lastMelds.by !== by) s.lastMelds = null;
  s.actions += 1;
  const name = ctx.playerName(by);
  s.feed.push(`${name}: رمى ${ramiCardName(card)}`, { by });
  ctx.say?.(`ورقة مرمية من ${name}: ${ramiCardName(card)}`, by);
  ctx.fx('card');
  if (!hand.length) {
    endRound(ctx, s, by);
    return;
  }
  nextTurn(ctx, s, by);
}

/* ------------------------------------------------------------------ */
/* Bots (and the turn timer)                                           */
/* ------------------------------------------------------------------ */

/** What `id` may know at their turn, for the bots. */
export function seatFor(s: State, id: string): Seat {
  const top = s.discard[s.discard.length - 1] ?? null;
  return {
    me: id,
    hand: s.hands[id],
    melds: s.melds,
    openings: s.openings,
    counts: Object.fromEntries(s.active.map((p) => [p, s.hands[p]?.length ?? 0])),
    talaj: talaj(s),
    need: needNow(s),
    taken: s.turn === id ? s.taken : null,
    mustUse: mustUse(s, id),
    top,
    // (only worth working out when drawing)
    canTake: s.turn === id && s.step === 'draw' && !discardBlock(s, id),
    next: nextActive(s, id),
    others: s.active.filter((p) => p !== id),
    picked: s.picked,
    thrown: s.thrown,
    pile: s.discard,
    stockLeft: s.stock.length,
  };
}

/** The next move of a bot playing `id` at this strength. */
export function planBot(s: State, id: string, level: BotLevel): BotAction {
  const seat = seatFor(s, id);
  if (s.step === 'draw') return { type: botDraw(seat, level) };
  return botPlay(seat, level) ?? { type: 'discard', card: botDiscard(seat, level).id };
}

/** The whole rest of a turn for a player who ran out of time: draw, the taken card, discard. */
function autoTurn(ctx: GameCtx, s: State, id: string) {
  if (s.step === 'draw') drawStock(ctx, s, id);
  if (s.phase !== 'play' || s.turn !== id) return;
  if (mustUse(s, id)) {
    const move = botPlay(seatFor(s, id), 'smart');
    if (!move || move.type === 'forfeit') {
      endRound(ctx, s, null, id);
      return;
    }
    step(ctx, s, id, move);
    if (s.phase !== 'play' || s.turn !== id) return;
    if (mustUse(s, id)) {
      endRound(ctx, s, null, id);
      return;
    }
  }
  discardCard(ctx, s, id, botDiscard(seatFor(s, id), 'smart').id);
}

/* ------------------------------------------------------------------ */

function step(ctx: GameCtx, s: State, by: string, a: { type: string; [k: string]: unknown }) {
  switch (a.type) {
    case 'drawStock':
      if (s.step !== 'draw') return;
      drawStock(ctx, s, by);
      return;
    case 'drawDiscard':
      if (s.step !== 'draw') return;
      drawDiscard(ctx, s, by);
      return;
    case 'lay':
      if (s.step !== 'play') throw new GameError('اسحب ورقة أولاً');
      lay(ctx, s, by, a.groups);
      return;
    case 'add':
      if (s.step !== 'play') throw new GameError('اسحب ورقة أولاً');
      addCards(ctx, s, by, a.meld, a.cards);
      return;
    case 'swap':
      if (s.step !== 'play') throw new GameError('اسحب ورقة أولاً');
      swapJoker(ctx, s, by, a.meld, a.card);
      return;
    case 'discard':
      if (s.step !== 'play') return;
      discardCard(ctx, s, by, a.card);
      return;
    case 'forfeit':
      if (!mustUse(s, by)) return;
      endRound(ctx, s, null, by);
      return;
  }
}

export const rami: GameModule<State, RamiSettings> = {
  id: 'rami',
  hostOnly: ['next'],

  turnOf: (s) => (s.phase === 'play' ? [s.turn] : []),

  start(ctx, participants, settings) {
    const s: State = {
      settings: { ...settings },
      seats: participants.slice(),
      active: participants.slice(),
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      history: [],
      phase: 'play',
      round: 0,
      dealerIdx: Math.floor(Math.random() * participants.length),
      turn: participants[0],
      step: 'play',
      turnsDone: 0,
      turnNo: 1,
      stock: [],
      discard: [],
      throwers: [],
      reshuffles: 0,
      hands: {},
      melds: [],
      meldSeq: 0,
      openings: {},
      openedTurn: {},
      taken: null,
      picked: {},
      thrown: {},
      feed: new Feed(),
      roundWinner: null,
      sec: false,
      forfeit: null,
      roundSummary: null,
      winner: null,
      nextAt: null,
      deadline: null,
      lastMelds: null,
      actions: 0,
    };
    startRound(ctx, s);
    ctx.fx('start');
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'roundEnd') startRound(ctx, s);
      return;
    }
    if (s.phase !== 'play' || !s.active.includes(by)) return;
    if (s.turn !== by) throw new GameError('ليس دورك');
    step(ctx, s, by, a);
  },

  tick(ctx, s) {
    if (s.phase === 'roundEnd' && s.nextAt !== null && ctx.now >= s.nextAt) {
      startRound(ctx, s);
      return true;
    }
    if (s.phase === 'play' && s.deadline !== null && ctx.now >= s.deadline) {
      const id = s.turn;
      s.feed.push(`${ctx.playerName(id)}: انتهى الوقت`, { by: id });
      autoTurn(ctx, s, id);
      return true;
    }
    return false;
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play' || !s.active.includes(s.turn) || !ctx.isBot(s.turn)) return;
    const bot = s.turn;
    const move = planBot(s, bot, botLevel(ctx));
    const delay = s.step === 'draw' || move.type === 'discard' ? randDelay(900, 1700) : randDelay(1100, 2000);
    ctx.bot(bot, `r:${s.round}:${s.actions}`, delay, move);
  },

  view(_ctx, s, me): RamiView {
    return {
      game: 'rami',
      phase: s.phase,
      variant: s.settings.variant,
      participants: s.seats,
      active: s.active,
      turn: s.turn,
      step: s.step,
      round: s.round,
      myHand: sortRami(s.hands[me] ?? []),
      counts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      discardTop: s.discard[s.discard.length - 1] ?? null,
      discardBy: s.throwers[s.throwers.length - 1] ?? null,
      stockLeft: s.stock.length,
      melds: s.melds,
      openings: s.openings,
      need: Number.isFinite(needNow(s)) ? needNow(s) : 0,
      open: s.settings.open,
      ceiling: s.settings.ceiling,
      firstRound: s.turnsDone < s.active.length,
      taken: s.turn === me ? s.taken : null,
      mustUse: mustUse(s, me),
      scores: s.scores,
      limit: s.settings.limit,
      feed: s.feed.list(),
      roundWinner: s.roundWinner,
      sec: s.sec,
      forfeit: s.forfeit,
      roundSummary: s.roundSummary,
      history: s.history,
      winner: s.winner,
      nextAt: s.nextAt,
      deadline: s.deadline,
      timer: s.settings.timer,
      lastMelds: s.lastMelds,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.active.includes(id) || s.phase === 'final') return;
    s.active = s.active.filter((p) => p !== id);
    // their hand leaves the game; their melds stay on the table (others may still add to them)
    s.hands[id] = [];
    delete s.openings[id];
    s.feed.push(`${ctx.playerName(id)} غادر اللعبة`);
    if (s.active.length <= 1) {
      finishGame(ctx, s, s.active[0] ?? null);
      return;
    }
    if (s.phase === 'play' && s.turn === id) {
      s.turn = nextActive(s, id);
      s.step = 'draw';
      s.taken = null;
      s.actions += 1;
      armTimer(ctx, s);
    }
  },

  patchSettings(settings, patch) {
    if (patch.variant === 'talaj' || patch.variant === 'sample') settings.variant = patch.variant;
    if (patch.open === 71 || patch.open === 51) settings.open = patch.open;
    if (typeof patch.ceiling === 'boolean') settings.ceiling = patch.ceiling;
    if (patch.limit === 500 || patch.limit === 1000) settings.limit = patch.limit;
    if (patch.timer === 0 || patch.timer === 60 || patch.timer === 90 || patch.timer === 120) settings.timer = patch.timer;
  },

  /** Lowest total first; equal totals share a place. Leavers are left out. */
  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const rest = s.active.filter((id) => id !== s.winner);
    const vals = [...new Set(rest.map((id) => s.scores[id]))].sort((a, b) => a - b);
    const tied = rest.filter((id) => s.scores[id] === s.scores[s.winner!]);
    return { places: [[s.winner, ...tied], ...vals.filter((v) => v !== s.scores[s.winner!]).map((v) => rest.filter((id) => s.scores[id] === v))] };
  },
};
