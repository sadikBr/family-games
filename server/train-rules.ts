/**
 * «قطار المغرب» — the rules engine: the state, the deck and the face-up row, the moves of a turn, the end
 * and the scoring. No timers, sounds or bots here (server/games/train.ts drives it).
 * The rules themselves: the top of src/shared/games/train.ts.
 */
import {
  TRAIN_FACE_UP,
  TRAIN_LAST_WAGONS,
  TRAIN_LOCOS,
  TRAIN_LONGEST_BONUS,
  TRAIN_PER_COLOR,
  TRAIN_START_CARDS,
  TRAIN_START_KEEP,
  TRAIN_START_TICKETS,
  emptyHand,
  handTotal,
  joined,
  longestPath,
  ownedRoutes,
  payWith,
  routeOpen,
  type TrainFinal,
  type TrainFinalRow,
  type TrainHand,
  type TrainLast,
  type TrainSettings,
  type TrainStep,
} from '../src/shared/games/train';
import { ROUTES, ROUTE_POINTS, TICKETS, TRAIN_COLORS, type TrainCard, type TrainColor } from '../src/shared/train-map';
import { GameError } from './types';

export type Rnd = () => number;

export interface State {
  settings: TrainSettings;
  /** seats in playing order */
  order: string[];
  gone: string[];
  phase: 'pick' | 'play' | 'final';
  turn: string;
  step: TrainStep;
  turnNo: number;
  /** grows with every change (bots' moves carry it) */
  seq: number;
  deck: TrainCard[];
  discard: TrainCard[];
  faceUp: (TrainCard | null)[];
  hands: Record<string, TrainHand>;
  wagons: Record<string, number>;
  points: Record<string, number>;
  owners: (string | null)[];
  tickets: Record<string, number[]>;
  /** tickets waiting for a choice (the start: everyone; later: the player who drew them) */
  offer: Record<string, number[]>;
  ticketDeck: number[];
  lastRound: { by: string; left: string[] } | null;
  /** the cards drawn so far this turn (for the announcement and the view) */
  took: (TrainCard | 'deck')[];
  last: TrainLast | null;
  endsAt: number | null;
  final: TrainFinal | null;
  rnd: Rnd;
}

export function shuffled<T>(arr: readonly T[], rnd: Rnd): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function freshDeck(rnd: Rnd): TrainCard[] {
  const cards: TrainCard[] = [];
  for (const c of TRAIN_COLORS) for (let i = 0; i < TRAIN_PER_COLOR; i++) cards.push(c);
  for (let i = 0; i < TRAIN_LOCOS; i++) cards.push('loco');
  return shuffled(cards, rnd);
}

export const active = (s: State) => s.order.filter((id) => !s.gone.includes(id));
export const isActive = (s: State, id: string) => s.order.includes(id) && !s.gone.includes(id);
/** both lanes of a double route are open with 4–5 players (counted at the start) */
export const doublesOpen = (s: State) => s.order.length >= 4;

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

/** One card off the deck (the discards are shuffled in when it runs out), or null. */
function pull(s: State): TrainCard | null {
  if (!s.deck.length && s.discard.length) {
    s.deck = shuffled(s.discard, s.rnd);
    s.discard = [];
  }
  return s.deck.pop() ?? null;
}

const locosUp = (s: State) => s.faceUp.filter((c) => c === 'loco').length;

/** Fill the face-up row; three locomotives there: discard the five and deal again (a few times at most). */
export function refill(s: State) {
  for (let tries = 0; tries < 4; tries++) {
    for (let i = 0; i < TRAIN_FACE_UP; i++) if (!s.faceUp[i]) s.faceUp[i] = pull(s);
    if (locosUp(s) < 3) return;
    // not enough other cards left to ever fix it: leave the row as it is
    const others = [...s.deck, ...s.discard].filter((c) => c !== 'loco').length;
    if (others < 3) return;
    for (let i = 0; i < TRAIN_FACE_UP; i++) {
      if (s.faceUp[i]) s.discard.push(s.faceUp[i]!);
      s.faceUp[i] = null;
    }
  }
}

export const cardsLeft = (s: State) => s.deck.length + s.discard.length;

/** Can the player whose turn it is still take a second card? */
export const canDrawSecond = (s: State) => cardsLeft(s) > 0 || s.faceUp.some((c) => c && c !== 'loco');

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function newState(participants: string[], settings: TrainSettings, rnd: Rnd = Math.random): State {
  const order = shuffled(participants, rnd);
  const s: State = {
    settings,
    order,
    gone: [],
    phase: 'pick',
    turn: order[0],
    step: 'start',
    turnNo: 0,
    seq: 1,
    deck: freshDeck(rnd),
    discard: [],
    faceUp: Array(TRAIN_FACE_UP).fill(null),
    hands: {},
    wagons: {},
    points: {},
    owners: ROUTES.map(() => null),
    tickets: {},
    offer: {},
    ticketDeck: shuffled(
      TICKETS.map((t) => t.id),
      rnd,
    ),
    lastRound: null,
    took: [],
    last: null,
    endsAt: null,
    final: null,
    rnd,
  };
  for (const id of order) {
    s.hands[id] = emptyHand();
    for (let i = 0; i < TRAIN_START_CARDS; i++) s.hands[id][pull(s)!]++;
    s.wagons[id] = settings.wagons;
    s.points[id] = 0;
    s.tickets[id] = [];
    s.offer[id] = s.ticketDeck.splice(0, TRAIN_START_TICKETS);
  }
  refill(s);
  return s;
}

/** The fewest tickets to keep from the current offer. */
export const keepMin = (s: State, id: string) => (s.offer[id] ? Math.min(s.phase === 'pick' ? TRAIN_START_KEEP : 1, s.offer[id].length) : 0);

/* ------------------------------------------------------------------ */
/* Moves (each throws a GameError when not allowed)                    */
/* ------------------------------------------------------------------ */

function mustPlay(s: State, by: string) {
  if (s.phase !== 'play') throw new GameError('ليس الآن');
  if (s.turn !== by) throw new GameError('ليس دورك');
}

/** Take a face-up card. Returns true when the turn is over. */
export function takeFaceUp(s: State, by: string, i: number): boolean {
  mustPlay(s, by);
  if (s.step === 'tickets') throw new GameError('اختر التذاكر أولاً');
  const c = s.faceUp[i];
  if (!c) throw new GameError('لا توجد بطاقة هنا');
  if (c === 'loco' && s.step === 'second') throw new GameError('لا تؤخذ القاطرة المكشوفة بطاقةً ثانية');
  s.faceUp[i] = null;
  s.hands[by][c]++;
  s.took.push(c);
  refill(s);
  if (c === 'loco' || s.step === 'second') return true;
  s.step = 'second';
  return !canDrawSecond(s);
}

/** Take the top card of the deck. Returns true when the turn is over. */
export function takeDeck(s: State, by: string): boolean {
  mustPlay(s, by);
  if (s.step === 'tickets') throw new GameError('اختر التذاكر أولاً');
  const c = pull(s);
  if (!c) throw new GameError('الكومة فارغة');
  s.hands[by][c]++;
  s.took.push('deck');
  // the face-up row may have been waiting for cards
  if (s.faceUp.some((x) => !x)) refill(s);
  if (s.step === 'second') return true;
  s.step = 'second';
  return !canDrawSecond(s);
}

/** Claim a route, paying in `color` (or locomotives only). Returns the points scored. */
export function claim(s: State, by: string, routeId: number, color: TrainColor | 'loco'): number {
  mustPlay(s, by);
  if (s.step !== 'start') throw new GameError('أكمل سحب البطاقات أولاً');
  const r = ROUTES[routeId];
  if (!r) throw new GameError('اختر سكة');
  if (!routeOpen(s.owners, r, by, doublesOpen(s))) {
    if (s.owners[r.id]) throw new GameError('هذه السكة مملوكة');
    throw new GameError(doublesOpen(s) ? 'لا يملك اللاعب مساري سكة مزدوجة معاً' : 'مع 2–3 لاعبين يُستعمل مسار واحد من السكة المزدوجة');
  }
  if (s.wagons[by] < r.len) throw new GameError('لا تكفي عرباتك لهذه السكة');
  const pay = payWith(s.hands[by], r, color);
  if (!pay) throw new GameError('لا تكفي بطاقاتك لهذه السكة');
  const h = s.hands[by];
  if (pay.color !== 'loco') h[pay.color] -= pay.n;
  h.loco -= pay.locos;
  for (let i = 0; i < pay.n; i++) s.discard.push(pay.color as TrainColor);
  for (let i = 0; i < pay.locos; i++) s.discard.push('loco');
  s.owners[r.id] = by;
  s.wagons[by] -= r.len;
  const pts = ROUTE_POINTS[r.len];
  s.points[by] += pts;
  // the face-up row may have been waiting for cards
  if (s.faceUp.some((x) => !x)) refill(s);
  return pts;
}

/** Draw tickets to choose from (3, or what is left). */
export function drawTickets(s: State, by: string) {
  mustPlay(s, by);
  if (s.step !== 'start') throw new GameError('أكمل سحب البطاقات أولاً');
  if (!s.ticketDeck.length) throw new GameError('لم تبق تذاكر');
  s.offer[by] = s.ticketDeck.splice(0, TRAIN_START_TICKETS);
  s.step = 'tickets';
}

/** Keep some of the offered tickets; the rest go under the pile. */
export function keepTickets(s: State, by: string, keep: number[]) {
  const offer = s.offer[by];
  if (!offer) throw new GameError('لا توجد تذاكر للاختيار');
  if (s.phase === 'play' && (s.turn !== by || s.step !== 'tickets')) throw new GameError('ليس دورك');
  const ids = [...new Set(keep)].filter((id) => offer.includes(id));
  const min = keepMin(s, by);
  if (ids.length < min) throw new GameError(min === 1 ? 'احتفظ بتذكرة واحدة على الأقل' : `احتفظ بـ${min} تذاكر على الأقل`);
  s.tickets[by].push(...ids);
  s.ticketDeck.push(...offer.filter((id) => !ids.includes(id)));
  delete s.offer[by];
}

/** Nothing at all is possible (no card to draw, no route to pay, no ticket): the turn may be passed. */
export function stuck(s: State, by: string): boolean {
  if (s.phase !== 'play' || s.turn !== by || s.step !== 'start') return false;
  if (cardsLeft(s) > 0 || s.faceUp.some((c) => c)) return false;
  if (s.ticketDeck.length) return false;
  const h = s.hands[by];
  return !ROUTES.some((r) => routeOpen(s.owners, r, by, doublesOpen(s)) && s.wagons[by] >= r.len && payAny(h, r.id));
}

function payAny(h: TrainHand, routeId: number) {
  const r = ROUTES[routeId];
  return (r.color === 'grey' ? TRAIN_COLORS : [r.color]).some((c) => !!payWith(h, r, c)) || !!payWith(h, r, 'loco');
}

/* ------------------------------------------------------------------ */
/* Turns and the end                                                   */
/* ------------------------------------------------------------------ */

export function nextActive(s: State, id: string): string {
  const n = s.order.length;
  let i = s.order.indexOf(id);
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (!s.gone.includes(s.order[i])) return s.order[i];
  }
  return id;
}

/** Everyone has their first tickets: the first turn. */
export function beginPlay(s: State) {
  s.phase = 'play';
  s.turn = active(s)[0];
  s.step = 'start';
  s.turnNo = 1;
  s.took = [];
}

export type TurnEnd = { lastRound?: boolean; over?: boolean };

/** The turn is over: the last round may start (or end the game), then the next player. */
export function endTurn(s: State): TurnEnd {
  const by = s.turn;
  const out: TurnEnd = {};
  if (s.lastRound) {
    s.lastRound.left = s.lastRound.left.filter((id) => id !== by);
  } else if (s.wagons[by] <= TRAIN_LAST_WAGONS) {
    // everyone else, then the player who started it, plays once more
    const others: string[] = [];
    for (let id = nextActive(s, by); id !== by; id = nextActive(s, id)) others.push(id);
    s.lastRound = { by, left: [...others, by] };
    out.lastRound = true;
  }
  if (s.lastRound && !s.lastRound.left.some((id) => isActive(s, id))) {
    finish(s, 'end');
    out.over = true;
    return out;
  }
  s.turn = nextActive(s, by);
  s.step = 'start';
  s.turnNo++;
  s.took = [];
  return out;
}

export function ticketDone(s: State, id: string, ticket: number): boolean {
  const t = TICKETS[ticket];
  return joined(ownedRoutes(s.owners, id), t.a, t.b);
}

export function finish(s: State, reason: 'end' | 'left') {
  const ids = active(s);
  const lens = Object.fromEntries(ids.map((id) => [id, longestPath(ownedRoutes(s.owners, id))]));
  const best = Math.max(0, ...ids.map((id) => lens[id]));
  const rows: Record<string, TrainFinalRow> = {};
  for (const id of ids) {
    const tickets = s.tickets[id].map((t) => ({ id: t, done: ticketDone(s, id, t) }));
    const ticketPlus = tickets.filter((t) => t.done).reduce((a, t) => a + TICKETS[t.id].value, 0);
    const ticketMinus = tickets.filter((t) => !t.done).reduce((a, t) => a + TICKETS[t.id].value, 0);
    const bonus = best > 0 && lens[id] === best ? TRAIN_LONGEST_BONUS : 0;
    rows[id] = { routes: s.points[id], tickets, ticketPlus, ticketMinus, longest: lens[id], bonus, total: s.points[id] + ticketPlus - ticketMinus + bonus };
  }
  const doneCount = (id: string) => rows[id].tickets.filter((t) => t.done).length;
  const key = (id: string) => [rows[id].total, doneCount(id), rows[id].bonus];
  const cmp = (a: string, b: string) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  };
  const ranking = ids.slice().sort(cmp);
  const winners = ranking.filter((id) => ranking.length && cmp(id, ranking[0]) === 0);
  s.phase = 'final';
  s.endsAt = null;
  s.offer = {};
  s.final = { rows, ranking, winners, reason };
}

/** Places for tournaments: equal totals with equal tie-breaks share a place. */
export function places(s: State): string[][] {
  const f = s.final;
  if (!f) return [];
  const out: string[][] = [];
  const sig = (id: string) => {
    const r = f.rows[id];
    return `${r.total}|${r.tickets.filter((t) => t.done).length}|${r.bonus}`;
  };
  for (const id of f.ranking) {
    const lastGroup = out[out.length - 1];
    if (lastGroup && sig(lastGroup[0]) === sig(id)) lastGroup.push(id);
    else out.push([id]);
  }
  return out;
}

export { handTotal };
