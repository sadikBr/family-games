/**
 * «البلوط» — Saudi Baloot for 4 players in two fixed partnerships (seats 0 & 2 vs 1 & 3).
 * 32 cards, 5 dealt to each and one turned face up; bidding «صن» / «حكم» / «أشكل» / «بس» in two
 * rounds; the buyer takes the face-up card + 2, the others 3. Tricks: follow suit, the Saudi trumping
 * duties in حكم. Projects declared on the first trick and shown on the second; «بلوت»; doubling in
 * حكم (دبل ← ثري ← فور ← قهوة) and in صن (دبل only, when the buyers are over 100 and the defenders
 * under). The first team to the target (152) wins. Play goes anticlockwise: seat i+1 sits on seat i's right.
 */
import type {
  BalootCall,
  BalootContract,
  BalootHandResult,
  BalootHistoryRow,
  BalootOption,
  BalootRaise,
  BalootSettings,
  BalootView,
  BCard,
  BMode,
  BSide,
  BSuit,
} from '../../src/shared/games/baloot';
import {
  B_SUITS,
  GROUND,
  PROJECT_NAME,
  balootBlocked,
  bestProjectSide,
  cardLabel,
  cardValue,
  findProjects,
  isBoss,
  legalCards,
  makeBalootDeck,
  projectKey,
  projectPoints,
  scoreHand,
  sortBaloot,
  suitLabel,
  trickLeader,
  type Played,
  type Project,
} from '../../src/shared/baloot-rules';
import type { CardSide, GameAction } from '../../src/shared/protocol';
import { botBid, botPlay, botRaise } from '../baloot-bot';
import { makeSides, randDelay } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr, shuffle } from '../util';

/** a full trick stays on the table this long (everyone sees who took it) */
export const TRICK_PAUSE_MS = 2400;
/** everyone passed twice: the empty bidding stays on screen this long before the new deal */
export const REDEAL_MS = 2600;
/** the end-of-hand sheet stays this long (the host can deal sooner) */
export const HAND_END_MS = 15_000;

interface BidState {
  round: 1 | 2;
  stage: 'main' | 'confirm';
  /** playing order of the bidding: dealer's right first, dealer last */
  order: string[];
  queue: string[];
  calls: Record<string, { call: BalootCall; suit?: BSuit }>;
  best: { by: string; suit: BSuit } | null;
}

interface RaiseState {
  step: BalootRaise;
  queue: string[];
  doubler: string | null;
  calls: Record<string, BalootRaise | 'pass'>;
}

export interface State {
  settings: BalootSettings;
  seats: string[];
  sides: CardSide[];
  scores: Record<BSide, number>;
  history: BalootHistoryRow[];
  phase: BalootView['phase'];
  hand: number;
  dealer: number;
  hands: Record<string, BCard[]>;
  stock: BCard[];
  faceUp: BCard | null;
  bid: BidState | null;
  redealAt: number | null;
  contract: BalootContract | null;
  raise: RaiseState | null;
  turn: string | null;
  trick: Played[];
  leadBoss: boolean;
  trickNo: number;
  trickWinner: string | null;
  pauseUntil: number | null;
  lastTrick: BalootView['lastTrick'];
  played: BCard[];
  abnat: Record<BSide, number>;
  tricks: Record<BSide, number>;
  /** projects each player could declare (found when the 8 cards are in hand) */
  avail: Record<string, Project[]>;
  declared: Record<string, Project[]>;
  /** the first trick's playing order (ties between equal projects) */
  firstOrder: string[];
  shown: { side: BSide; items: { by: string; project: Project }[] } | null;
  projPoints: Record<BSide, number>;
  /** who holds K + Q of trumps, and how many of the two they have played */
  balootHolder: string | null;
  balootPlayed: number;
  baloot: string[];
  result: BalootHandResult | null;
  nextAt: number | null;
  winner: BSide | null;
  deadline: number | null;
  /** bumps on every change (bot keys, timer) */
  seq: number;
}

const other = (s: BSide): BSide => (s === 'A' ? 'B' : 'A');
export const sideOf = (s: State, id: string): BSide => (s.sides[0].members.includes(id) ? 'A' : 'B');
const partnerOf = (s: State, id: string) => s.seats[(s.seats.indexOf(id) + 2) % 4];
const nextOf = (s: State, id: string) => s.seats[(s.seats.indexOf(id) + 1) % 4];
const teamName = (ctx: GameCtx, s: State, side: BSide) =>
  `فريق ${s.sides.find((x) => x.key === side)!.members.map((m) => ctx.playerName(m)).join(' و')}`;
const contractLabel = (c: BalootContract) => (c.mode === 'sun' ? 'صن' : `حكم ${suitLabel(c.trump!)}`);
const RAISE_NAME: Record<BalootRaise, string> = { double: 'دبل', triple: 'ثري', four: 'فور', gahwa: 'قهوة' };

/* ------------------------------------------------------------------ */
/* Dealing and bidding                                                 */
/* ------------------------------------------------------------------ */

function startHand(ctx: GameCtx, s: State) {
  s.hand += 1;
  s.dealer = (s.dealer + 1) % 4;
  const deck = shuffle(makeBalootDeck());
  const order = [1, 2, 3, 0].map((k) => s.seats[(s.dealer + k) % 4]);
  s.hands = Object.fromEntries(s.seats.map((id) => [id, [] as BCard[]]));
  // 3 then 2 to each, starting on the dealer's right
  for (const n of [3, 2]) for (const id of order) s.hands[id].push(...deck.splice(0, n));
  s.faceUp = deck.shift()!;
  s.stock = deck;
  s.phase = 'bid';
  s.bid = { round: 1, stage: 'main', order, queue: order.slice(), calls: {}, best: null };
  s.redealAt = null;
  s.contract = null;
  s.raise = null;
  s.turn = null;
  s.trick = [];
  s.leadBoss = false;
  s.trickNo = 0;
  s.trickWinner = null;
  s.pauseUntil = null;
  s.lastTrick = null;
  s.played = [];
  s.abnat = { A: 0, B: 0 };
  s.tricks = { A: 0, B: 0 };
  s.avail = {};
  s.declared = {};
  s.firstOrder = [];
  s.shown = null;
  s.projPoints = { A: 0, B: 0 };
  s.balootHolder = null;
  s.balootPlayed = 0;
  s.baloot = [];
  s.result = null;
  s.nextAt = null;
  ctx.fx('card');
  ctx.say?.(`اليد ${s.hand}: التوزيع من ${ctx.playerName(s.seats[s.dealer])} — الورقة المكشوفة ${cardLabel(s.faceUp)}`);
}

/** What the player whose turn it is may say now. */
export function bidOptions(s: State, id: string): BalootOption[] {
  const b = s.bid;
  if (s.phase !== 'bid' || !b || s.redealAt !== null || b.queue[0] !== id || !s.faceUp) return [];
  if (b.stage === 'confirm') return id === b.best?.by ? [{ call: 'confirm' }, { call: 'sun' }] : [{ call: 'pass' }, { call: 'sun' }];
  const idx = b.order.indexOf(id);
  const opts: BalootOption[] = [{ call: 'pass' }];
  if (b.round === 1) {
    if (!b.best) opts.push({ call: 'hokm' });
    opts.push({ call: 'sun' });
    const allPassed = b.order.slice(0, idx).every((p) => b.calls[p]?.call === 'pass');
    if (idx === 2 || (idx === 3 && allPassed)) opts.push({ call: 'ashkal' });
  } else {
    if (!b.best) opts.push({ call: 'hokm2', suits: B_SUITS.filter((x) => x !== s.faceUp!.suit) });
    opts.push({ call: 'sun' });
  }
  return opts;
}

function bidCall(ctx: GameCtx, s: State, by: string, call: BalootCall, suit: unknown) {
  const b = s.bid!;
  const opt = bidOptions(s, by).find((o) => o.call === call);
  if (!opt) throw new GameError(b.queue[0] === by ? 'لا يمكنك هذا الاختيار الآن' : 'ليس دورك');
  if (call === 'hokm2' && !(isStr(suit) && opt.suits?.includes(suit as BSuit))) throw new GameError('اختر شكل الحكم');
  const name = ctx.playerName(by);
  b.queue.shift();
  if (call === 'sun' || call === 'ashkal') {
    b.calls[by] = { call };
    finishBidding(ctx, s, 'sun', null, by, call === 'ashkal' ? partnerOf(s, by) : by, call);
    return;
  }
  if (call === 'hokm' || call === 'hokm2') {
    const trump = call === 'hokm' ? s.faceUp!.suit : (suit as BSuit);
    b.calls[by] = { call, suit: trump };
    b.best = { by, suit: trump };
    ctx.say?.(`حكم من ${name}: ${suitLabel(trump)}`, by);
    ctx.fx('throw');
  } else {
    b.calls[by] = { call };
    ctx.say?.(call === 'confirm' ? `تثبيت الحكم من ${name}` : `بس من ${name}`, by);
  }
  if (b.queue.length) return;
  // the round is over
  if (b.round === 1 && b.stage === 'main' && b.best) {
    // those who passed before the حكم (and the bidder) may still go «صن»
    const k = b.order.indexOf(b.best.by);
    b.stage = 'confirm';
    b.queue = [...b.order.slice(0, k).filter((p) => b.calls[p]?.call === 'pass'), b.best.by];
    return;
  }
  if (b.best) {
    finishBidding(ctx, s, 'hokm', b.best.suit, b.best.by, b.best.by, 'hokm');
    return;
  }
  if (b.round === 1) {
    b.round = 2;
    b.calls = {};
    b.queue = b.order.slice();
    ctx.say?.('لا شراء في الجولة الأولى — الجولة الثانية: حكم بشكل آخر أو صن');
    return;
  }
  s.redealAt = ctx.now + REDEAL_MS;
  ctx.say?.('لا شراء — توزيع جديد');
  ctx.fx('buzz');
}

function finishBidding(ctx: GameCtx, s: State, mode: BMode, trump: BSuit | null, caller: string, buyer: string, call: 'sun' | 'hokm' | 'ashkal') {
  s.contract = { mode, trump, buyer, caller, call, mult: 1, gahwa: false };
  // the buyer takes the face-up card and 2 more, everyone else 3 (dealer's right first)
  for (const id of s.bid!.order) {
    if (id === buyer) s.hands[id].push(s.faceUp!, ...s.stock.splice(0, 2));
    else s.hands[id].push(...s.stock.splice(0, 3));
  }
  s.faceUp = null;
  for (const id of s.seats) s.avail[id] = findProjects(s.hands[id], mode);
  if (trump) s.balootHolder = s.seats.find((id) => ['K', 'Q'].every((r) => s.hands[id].some((c) => c.suit === trump && c.rank === r))) ?? null;
  const buyerName = ctx.playerName(buyer);
  ctx.say?.(
    call === 'ashkal' ? `أشكل من ${ctx.playerName(caller)} — شراء لـ${buyerName}: صن` : `شراء لـ${buyerName}: ${contractLabel(s.contract)}`,
    buyer,
  );
  ctx.fx('correct', buyer);
  const buyerSide = sideOf(s, buyer);
  const canDouble = s.settings.doubling && (mode === 'hokm' || (s.scores[buyerSide] > 100 && s.scores[other(buyerSide)] < 100));
  if (canDouble) {
    const d1 = nextOf(s, buyer);
    s.phase = 'double';
    s.raise = { step: 'double', queue: [d1, partnerOf(s, d1)], doubler: null, calls: {} };
  } else startPlay(s);
}

function raiseCall(ctx: GameCtx, s: State, by: string, raise: unknown) {
  const r = s.raise!;
  if (r.queue[0] !== by) throw new GameError('ليس دورك');
  const c = s.contract!;
  const name = ctx.playerName(by);
  if (raise !== 'pass' && raise !== r.step) throw new GameError('لا يمكنك هذا الاختيار الآن');
  r.queue.shift();
  if (raise === 'pass') {
    r.calls[by] = 'pass';
    ctx.say?.(`بس من ${name}`, by);
    if (!r.queue.length) startPlay(s);
    return;
  }
  r.calls[by] = r.step;
  ctx.say?.(`${RAISE_NAME[r.step]} من ${name}`, by);
  ctx.fx('throw');
  if (r.step === 'double') {
    c.mult = 2;
    r.doubler = by;
    if (c.mode === 'sun') return startPlay(s);
    r.step = 'triple';
    r.queue = [c.buyer];
  } else if (r.step === 'triple') {
    c.mult = 3;
    r.step = 'four';
    r.queue = [r.doubler!];
  } else if (r.step === 'four') {
    c.mult = 4;
    r.step = 'gahwa';
    r.queue = [c.buyer];
  } else {
    c.gahwa = true;
    startPlay(s);
  }
}

function startPlay(s: State) {
  s.phase = 'play';
  s.raise = s.raise ? { ...s.raise, queue: [] } : null;
  s.trickNo = 1;
  s.turn = s.seats[(s.dealer + 1) % 4];
  s.firstOrder = [0, 1, 2, 3].map((k) => s.seats[(s.dealer + 1 + k) % 4]);
}

/* ------------------------------------------------------------------ */
/* Tricks                                                              */
/* ------------------------------------------------------------------ */

export function playable(s: State, id: string): BCard[] {
  if (s.phase !== 'play' || s.pauseUntil !== null || s.turn !== id) return [];
  return legalCards(s.hands[id], s.trick, s.contract!.trump, s.leadBoss);
}

function playCard(ctx: GameCtx, s: State, by: string, cardId: unknown, declare: unknown): boolean {
  if (s.phase !== 'play' || s.pauseUntil !== null) return false;
  if (s.turn !== by) throw new GameError('ليس دورك');
  if (!isStr(cardId)) return false;
  const c = s.contract!;
  const trump = c.trump;
  if (!playable(s, by).some((x) => x.id === cardId)) {
    throw new GameError(s.trick.length && s.hands[by].some((x) => x.suit === s.trick[0].card.suit) ? 'يجب أن تتبع الشكل المطلوب' : 'يجب أن تقطع بالحكم');
  }
  const notes: string[] = [];
  if (s.trickNo === 1) {
    const keys = Array.isArray(declare) ? declare.filter(isStr) : [];
    s.declared[by] = (s.avail[by] ?? []).filter((p) => keys.includes(projectKey(p)));
    if (s.declared[by].length) notes.push(`مشروع: ${s.declared[by].map((p) => PROJECT_NAME[p.kind]).join(' و')}`);
  }
  if (!s.trick.length) s.leadBoss = isBoss(s.hands[by].find((x) => x.id === cardId)!, s.seats.flatMap((id) => s.hands[id]), trump);
  const hand = s.hands[by];
  const card = hand.splice(hand.findIndex((x) => x.id === cardId), 1)[0];
  s.trick.push({ by, card });
  ctx.fx('card');
  if (trump && by === s.balootHolder && card.suit === trump && (card.rank === 'K' || card.rank === 'Q')) {
    s.balootPlayed += 1;
    if (s.balootPlayed === 2 && !balootBlocked(s.declared[by] ?? [], trump)) {
      s.baloot.push(by);
      notes.push('بلوت!');
    }
  }
  const head = `ورقة من ${ctx.playerName(by)}: ${cardLabel(card)}${notes.length ? ` — ${notes.join(' — ')}` : ''}`;
  if (s.trick.length < 4) {
    s.turn = nextOf(s, by);
    ctx.say?.(head, by);
    return true;
  }
  const winner = s.trick[trickLeader(s.trick, trump)].by;
  const side = sideOf(s, winner);
  const gain = s.trick.reduce((t, p) => t + cardValue(p.card, trump), 0) + (s.trickNo === 8 ? GROUND : 0);
  s.abnat[side] += gain;
  s.tricks[side] += 1;
  s.trickWinner = winner;
  s.turn = null;
  s.pauseUntil = ctx.now + TRICK_PAUSE_MS;
  ctx.say?.(`${head} — الأكلة لـ${ctx.playerName(winner)}${gain ? ` (+${gain})` : ''}`, winner);
  ctx.fx('correct', winner);
  return true;
}

/** The second trick starts: the best team's projects are shown to everyone. */
function showProjects(ctx: GameCtx, s: State) {
  const all = s.firstOrder.flatMap((by) => (s.declared[by] ?? []).map((project) => ({ by, project })));
  const side = bestProjectSide(all, s.firstOrder, (id) => sideOf(s, id));
  if (!side) return;
  const items = all.filter((d) => sideOf(s, d.by) === side);
  s.shown = { side, items };
  s.projPoints[side] = items.reduce((t, d) => t + projectPoints(d.project.kind, s.contract!.mode), 0);
  ctx.say?.(`المشاريع لـ${teamName(ctx, s, side)}: ${items.map((d) => PROJECT_NAME[d.project.kind]).join('، ')}`);
  ctx.fx('reveal');
}

function endHand(ctx: GameCtx, s: State) {
  const c = s.contract!;
  const buyerSide = sideOf(s, c.buyer);
  const ground = sideOf(s, s.lastTrick?.winner ?? s.trickWinner!);
  const baloot: Record<BSide, number> = { A: 0, B: 0 };
  for (const id of s.baloot) baloot[sideOf(s, id)] += 2;
  const out = scoreHand({ mode: c.mode, buyerSide, abnat: s.abnat, tricks: s.tricks, projects: s.projPoints, baloot, mult: c.mult });
  s.result = {
    hand: s.hand,
    contract: { ...c },
    buyerSide,
    abnat: { ...s.abnat },
    ground,
    tricks: { ...s.tricks },
    projects: { ...s.projPoints },
    baloot,
    points: out.points,
    failed: out.failed,
    kaboot: out.kaboot,
    winner: out.winner,
  };
  s.scores.A += out.points.A;
  s.scores.B += out.points.B;
  const tag = c.gahwa ? 'قهوة' : out.kaboot ? 'كبوت' : out.failed ? 'خسرانة' : undefined;
  s.history.push({ A: out.points.A, B: out.points.B, tag, mode: c.mode, buyerSide });
  s.phase = 'handEnd';
  s.turn = null;
  ctx.say?.(
    `نهاية اليد ${s.hand}: ${teamName(ctx, s, 'A')} +${out.points.A}، ${teamName(ctx, s, 'B')} +${out.points.B}${tag ? ` — ${tag}` : ''}`,
  );
  const t = s.settings.target;
  if (c.gahwa) finish(ctx, s, out.winner);
  else if ((s.scores.A >= t || s.scores.B >= t) && s.scores.A !== s.scores.B) finish(ctx, s, s.scores.A > s.scores.B ? 'A' : 'B');
  else {
    s.nextAt = ctx.now + HAND_END_MS;
    ctx.fx('reveal');
  }
}

function finish(ctx: GameCtx, s: State, side: BSide | null) {
  s.phase = 'final';
  s.winner = side;
  s.nextAt = null;
  s.turn = null;
  s.deadline = null;
  if (side) {
    ctx.say?.(`الفوز ل${teamName(ctx, s, side)}`);
    ctx.fx('win');
  }
}

/* ------------------------------------------------------------------ */
/* Turns, timer, bots                                                  */
/* ------------------------------------------------------------------ */

export function turnOf(s: State): string[] {
  if (s.phase === 'bid') return s.bid && s.redealAt === null && s.bid.queue.length ? [s.bid.queue[0]] : [];
  if (s.phase === 'double') return s.raise?.queue.length ? [s.raise.queue[0]] : [];
  if (s.phase === 'play') return s.pauseUntil === null && s.turn ? [s.turn] : [];
  return [];
}

/** The move a bot makes (also the move made for a player whose time ran out, with `timeout`). */
export function decide(s: State, id: string, level: number, timeout = false): GameAction | null {
  if (turnOf(s)[0] !== id) return null;
  if (s.phase === 'bid') {
    const options = bidOptions(s, id);
    if (timeout) return { type: 'bid', call: options.some((o) => o.call === 'confirm') ? 'confirm' : 'pass' };
    const pick = botBid({ hand: s.hands[id], faceUp: s.faceUp!, options, level, noise: Math.random() * 2 - 1 });
    return { type: 'bid', call: pick.call, suit: pick.suit };
  }
  if (s.phase === 'double') {
    const step = s.raise!.step;
    const yes = !timeout && botRaise(s.hands[id], s.contract!.mode, s.contract!.trump, step, level);
    return { type: 'raise', raise: yes ? step : 'pass' };
  }
  const legal = playable(s, id);
  if (!legal.length) return null;
  const card = botPlay({
    hand: s.hands[id],
    legal,
    trick: s.trick,
    trump: s.contract!.trump,
    played: s.played,
    buyers: sideOf(s, id) === sideOf(s, s.contract!.buyer),
    level: timeout ? 2 : level,
    roll: Math.random(),
  });
  return { type: 'play', card: card.id, declare: s.trickNo === 1 ? (s.avail[id] ?? []).map(projectKey) : [] };
}

function armTimer(ctx: GameCtx, s: State) {
  s.seq += 1;
  s.deadline = s.settings.timer > 0 && turnOf(s).length ? ctx.now + s.settings.timer * 1000 : null;
}

/** Apply one move; false when it changed nothing. */
function step(ctx: GameCtx, s: State, by: string, a: GameAction): boolean {
  // a bot's move planned for an earlier moment of the game
  if (typeof a.seq === 'number' && a.seq !== s.seq) throw new GameError('انتهى وقت هذه الحركة');
  if (a.type === 'next') {
    if (s.phase !== 'handEnd') return false;
    startHand(ctx, s);
    return true;
  }
  if (a.type === 'bid' && s.phase === 'bid') {
    bidCall(ctx, s, by, a.call as BalootCall, a.suit);
    return true;
  }
  if (a.type === 'raise' && s.phase === 'double') {
    raiseCall(ctx, s, by, a.raise);
    return true;
  }
  if (a.type === 'play') return playCard(ctx, s, by, a.card, a.declare);
  return false;
}

export const baloot: GameModule<State, BalootSettings> = {
  id: 'baloot',
  hostOnly: ['next'],
  turnOf,

  start(ctx, participants, settings) {
    if (participants.length !== 4) throw new GameError('البلوط يحتاج 4 لاعبين بالضبط — أضيفوا بوتات');
    const s: State = {
      settings: { ...settings },
      seats: participants.slice(),
      sides: makeSides(participants, true),
      scores: { A: 0, B: 0 },
      history: [],
      phase: 'bid',
      hand: 0,
      dealer: Math.floor(Math.random() * 4),
      hands: {},
      stock: [],
      faceUp: null,
      bid: null,
      redealAt: null,
      contract: null,
      raise: null,
      turn: null,
      trick: [],
      leadBoss: false,
      trickNo: 0,
      trickWinner: null,
      pauseUntil: null,
      lastTrick: null,
      played: [],
      abnat: { A: 0, B: 0 },
      tricks: { A: 0, B: 0 },
      avail: {},
      declared: {},
      firstOrder: [],
      shown: null,
      projPoints: { A: 0, B: 0 },
      balootHolder: null,
      balootPlayed: 0,
      baloot: [],
      result: null,
      nextAt: null,
      winner: null,
      deadline: null,
      seq: 0,
    };
    ctx.fx('start');
    startHand(ctx, s);
    armTimer(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    // «التالي» comes from the host (checked by the room), who may be watching without a seat
    if (s.phase === 'final' || (!s.seats.includes(by) && a.type !== 'next')) return;
    if (step(ctx, s, by, a)) armTimer(ctx, s);
  },

  tick(ctx, s) {
    if (s.phase === 'final') return false;
    if (s.phase === 'play' && s.pauseUntil !== null) {
      if (ctx.now < s.pauseUntil) return false;
      s.pauseUntil = null;
      s.lastTrick = { cards: s.trick, winner: s.trickWinner! };
      s.played.push(...s.trick.map((t) => t.card));
      if (s.trickNo >= 8) {
        endHand(ctx, s);
      } else {
        s.turn = s.trickWinner;
        s.trick = [];
        s.trickWinner = null;
        s.trickNo += 1;
        if (s.trickNo === 2) showProjects(ctx, s);
      }
      armTimer(ctx, s);
      return true;
    }
    if (s.phase === 'bid' && s.redealAt !== null) {
      if (ctx.now < s.redealAt) return false;
      startHand(ctx, s);
      armTimer(ctx, s);
      return true;
    }
    if (s.phase === 'handEnd') {
      if (s.nextAt === null || ctx.now < s.nextAt) return false;
      startHand(ctx, s);
      armTimer(ctx, s);
      return true;
    }
    if (s.deadline !== null && ctx.now >= s.deadline) {
      const id = turnOf(s)[0];
      const move = id ? decide(s, id, 2, true) : null;
      if (!move) {
        s.deadline = null;
        return false;
      }
      step(ctx, s, id, move);
      armTimer(ctx, s);
      return true;
    }
    return false;
  },

  botPlan(ctx, s) {
    const id = turnOf(s)[0];
    if (!id || !ctx.isBot(id)) return;
    const move = decide(s, id, s.settings.level);
    if (!move) return;
    move.seq = s.seq;
    const delay = s.phase === 'play' ? randDelay(700, 1500) : randDelay(900, 1700);
    ctx.bot(id, `m${s.hand}:${s.seq}`, delay, move);
  },

  view(_ctx, s, me): BalootView {
    const c = s.contract;
    const mine = s.hands[me] ?? [];
    const projView = (by: string, p: Project, cards: boolean) => ({ by, kind: p.kind, points: projectPoints(p.kind, c?.mode ?? 'sun'), ...(cards ? { cards: p.cards } : {}) });
    const myTurnFirst = s.phase === 'play' && s.trickNo === 1 && s.turn === me && s.pauseUntil === null;
    const showShown = s.phase === 'play' && s.trickNo === 2;
    return {
      game: 'baloot',
      phase: s.phase,
      seats: s.seats,
      sides: s.sides,
      dealer: s.seats[s.dealer],
      hand: s.hand,
      turn: turnOf(s)[0] ?? null,
      deadline: s.deadline,
      timer: s.settings.timer,
      faceUp: s.faceUp,
      bidRound: s.bid?.round ?? 1,
      bidStage: s.bid?.stage ?? 'main',
      calls: s.phase === 'bid' ? (s.bid?.calls ?? {}) : {},
      myOptions: bidOptions(s, me),
      redeal: s.redealAt !== null,
      contract: c,
      raiseStep: s.phase === 'double' ? (s.raise?.step ?? null) : null,
      raises: s.raise?.calls ?? {},
      myHand: sortBaloot(mine, c?.trump ?? null),
      playable: playable(s, me).map((x) => x.id),
      counts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      trick: s.trick,
      trickWinner: s.trickWinner,
      trickNo: s.trickNo,
      lastTrick: s.lastTrick,
      abnat: s.abnat,
      tricks: s.tricks,
      declared: s.phase === 'play' && s.trickNo === 1 ? s.firstOrder.flatMap((by) => (s.declared[by] ?? []).map((p) => projView(by, p, false))) : [],
      shown: showShown && s.shown ? { side: s.shown.side, items: s.shown.items.map((d) => projView(d.by, d.project, true)) } : null,
      myProjects: myTurnFirst ? (s.avail[me] ?? []).map((p) => ({ ...projView(me, p, true), key: projectKey(p) })) : [],
      baloot: s.baloot,
      scores: s.scores,
      target: s.settings.target,
      history: s.history,
      result: s.result,
      nextAt: s.nextAt,
      winner: s.winner,
    };
  },

  onLeave(ctx, s, id) {
    // seats are kept by the room (a bot takes over); a seat that disappears anyway ends the game
    if (!s.seats.includes(id) || s.phase === 'final') return;
    const lead: BSide | null = s.scores.A === s.scores.B ? null : s.scores.A > s.scores.B ? 'A' : 'B';
    finish(ctx, s, lead);
    if (!lead) ctx.say?.('انتهت اللعبة: مقعد فارغ');
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const team = (side: BSide) => s.sides.find((x) => x.key === side)!.members.slice();
    return { places: [team(s.winner), team(other(s.winner))] };
  },

  patchSettings(settings, patch) {
    if (patch.target === 100 || patch.target === 152) settings.target = patch.target;
    if (patch.timer === 0 || patch.timer === 20 || patch.timer === 30 || patch.timer === 45) settings.timer = patch.timer;
    if (typeof patch.doubling === 'boolean') settings.doubling = patch.doubling;
    if (patch.level === 1 || patch.level === 2) settings.level = patch.level;
  },
};
