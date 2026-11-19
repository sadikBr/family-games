/**
 * «قطار المغرب» — a route-building rail game on the map of Morocco (whole with its Sahara), for 2–5
 * players (bots allowed). The types shared by the server and the app, the rule helpers both sides use
 * (paying for a route, who may claim it, connected cities, the longest path) and the home-screen card.
 *
 * Rules: everyone starts with WAGONS wagons (the lobby: 30, 40 or 45), 4 wagon cards and 3 destination
 * tickets (keep at least 2). A turn is ONE of:
 *  - draw 2 wagon cards, each from the 5 face-up cards or the deck. A face-up locomotive (wild) is the
 *    whole turn, and can't be the second card; a locomotive from the deck counts as one card. Three
 *    locomotives face up: the five are discarded and five new ones dealt.
 *  - claim a route: pay as many cards as its length in its colour (grey: any one colour), locomotives
 *    filling in; it scores 1, 2, 4, 7, 10 or 15 points for 1–6 wagons. Of a double route only one lane can
 *    be used with 2–3 players; with 4–5 both, but never both by the same player.
 *  - draw 3 tickets and keep at least 1 (the others go under the pile).
 * When a player has 2 wagons or fewer at the end of a turn, everyone (them included) plays one last turn.
 * Then: completed tickets add their value, the others take it away, and the longest continuous path
 * (each route counted once) earns 10 more (shared on a tie). Ties: more completed tickets, then the path.
 *
 * The board, its routes and the tickets: src/shared/train-map.ts. Rules engine: server/train-rules.ts.
 */
import { ROUTES, TRAIN_COLORS, type TrainCard, type TrainColor, type TrainRoute } from '../train-map';

export const TRAIN_WAGONS = [30, 40, 45] as const;
export const TRAIN_SECONDS = [0, 60, 90] as const;
export const TRAIN_START_CARDS = 4;
export const TRAIN_START_TICKETS = 3;
export const TRAIN_START_KEEP = 2;
/** the end begins when someone has this many wagons left (or fewer) */
export const TRAIN_LAST_WAGONS = 2;
export const TRAIN_LONGEST_BONUS = 10;
export const TRAIN_FACE_UP = 5;
/** wagon cards: 12 of each colour and 14 locomotives */
export const TRAIN_PER_COLOR = 12;
export const TRAIN_LOCOS = 14;

export interface TrainSettings {
  /** wagons per player: 30 (a short game), 40, 45 */
  wagons: number;
  /** seconds per turn (0 = no limit); when it runs out the turn is played for the player (cards drawn) */
  seconds: number;
}

export const TRAIN_DEFAULTS: TrainSettings = { wagons: 40, seconds: 0 };

export type TrainHand = Record<TrainCard, number>;

export const emptyHand = (): TrainHand => ({ red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0, black: 0, white: 0, loco: 0 });
export const handTotal = (h: TrainHand) => Object.values(h).reduce((a, b) => a + b, 0);

/** where a turn stands: its start, after one card drawn, or choosing among drawn tickets */
export type TrainStep = 'start' | 'second' | 'tickets';

export interface TrainPlayerPub {
  seat: number;
  wagons: number;
  /** cards in hand (never their colours) */
  cards: number;
  /** tickets kept (never which ones) */
  tickets: number;
  /** points from routes so far (public) */
  points: number;
  /** still choosing the first tickets */
  picking: boolean;
  gone: boolean;
}

/** what the last turn did, for everyone (a card from the deck stays a secret) */
export interface TrainLast {
  seq: number;
  by: string;
  kind: 'claim' | 'draw' | 'tickets' | 'pass';
  route?: number;
  /** the cards drawn this turn: a face-up card's colour, or 'deck' */
  took?: (TrainCard | 'deck')[];
  /** tickets kept */
  kept?: number;
}

export interface TrainFinalRow {
  routes: number;
  /** every ticket revealed at the end */
  tickets: { id: number; done: boolean }[];
  ticketPlus: number;
  ticketMinus: number;
  /** the player's longest continuous path (wagons) */
  longest: number;
  bonus: number;
  total: number;
}

export interface TrainFinal {
  rows: Record<string, TrainFinalRow>;
  /** best first (ties broken by completed tickets, then the path bonus) */
  ranking: string[];
  winners: string[];
  reason: 'end' | 'left';
}

export interface TrainView {
  game: 'train';
  phase: 'pick' | 'play' | 'final';
  /** seats in playing order */
  order: string[];
  turn: string | null;
  step: TrainStep;
  turnNo: number;
  seq: number;
  /** each route's owner (a player id) or null */
  owners: (string | null)[];
  faceUp: (TrainCard | null)[];
  deck: number;
  discard: number;
  ticketDeck: number;
  players: Record<string, TrainPlayerPub>;
  /** the last round: who has not played their last turn yet (null: not yet) */
  lastRound: { by: string; left: string[] } | null;
  /** both lanes of a double route are open (4–5 players) */
  doubles: boolean;
  endsAt: number | null;
  total: number;
  last: TrainLast | null;
  me: {
    seat: number;
    hand: TrainHand;
    tickets: { id: number; done: boolean }[];
    /** tickets offered to choose from (the start, or after drawing tickets) */
    offer: number[] | null;
    keepMin: number;
  } | null;
  final: TrainFinal | null;
}

/** the seat colours of the wagons on the board */
/** (kept apart from the eight card colours: pink, cyan, lime, brown, crimson) */
export const SEAT_COLORS = ['#FF5FB4', '#16C8E0', '#A6E03C', '#A0622F', '#C8102E'] as const;
export const SEAT_NAMES = ['الوردي', 'السماوي', 'الليموني', 'البني', 'القرمزي'] as const;

export const TRAIN_INFO = {
  title: 'قطار المغرب',
  tagline: 'اجمعوا العربات وامتلكوا السكك بين مدن المغرب لتكملوا رحلاتكم.',
  color: '#B5453A',
  maxPlayers: 5,
  howTo: [
    'خريطة المغرب كاملة من طنجة إلى الكويرة، وعليها سكك ملوّنة بين المدن. لكل لاعب 40 عربة (أو حسب الإعداد) و4 بطاقات وتذاكر رحلات سرية.',
    'في الدور فعل واحد: خذ بطاقتين (من المكشوفة أو من الكومة)، أو امتلك سكة بدفع بطاقات بلونها وطولها، أو اسحب 3 تذاكر جديدة واحتفظ بواحدة على الأقل.',
    'القاطرة تصلح لأي لون. القاطرة المكشوفة تُحسب بطاقتين، ولا تُؤخذ بطاقةً ثانية. السكة الرمادية تُدفع بأي لون واحد.',
    'نقاط السكك: 1، 2، 4، 7، 10، 15 لطول 1 إلى 6. السكة المزدوجة تُستعمل كلتاها مع 4 لاعبين أو أكثر فقط.',
    'حين تبقى لأحدٍ عربتان أو أقل يلعب الجميع دوراً أخيراً. التذكرة المكتملة تضيف قيمتها والناقصة تطرحها، وأطول طريق متصل يربح 10 نقاط.',
  ],
};

/* ------------------------------------------------------------------ */
/* Rule helpers (server and app)                                       */
/* ------------------------------------------------------------------ */

export interface PayOption {
  /** the colour paid with ('loco': locomotives only) */
  color: TrainColor | 'loco';
  /** cards of that colour */
  n: number;
  /** locomotives */
  locos: number;
}

/**
 * The ways to pay for a route with this hand: one per usable colour (as many of that colour as possible,
 * locomotives for the rest), and locomotives alone when there are no colour cards to use.
 */
export function payOptions(hand: TrainHand, r: TrainRoute): PayOption[] {
  const out: PayOption[] = [];
  const colors = r.color === 'grey' ? TRAIN_COLORS : [r.color];
  for (const c of colors) {
    const n = Math.min(hand[c], r.len);
    if (n > 0 && n + hand.loco >= r.len) out.push({ color: c, n, locos: r.len - n });
  }
  if (!out.length && hand.loco >= r.len) out.push({ color: 'loco', n: 0, locos: r.len });
  // the cheapest in locomotives first
  return out.sort((a, b) => a.locos - b.locos || b.n - a.n);
}

/** The payment for a route in a chosen colour, or null if this hand can't pay that way. */
export function payWith(hand: TrainHand, r: TrainRoute, color: TrainColor | 'loco'): PayOption | null {
  if (color === 'loco') return hand.loco >= r.len ? { color, n: 0, locos: r.len } : null;
  if (r.color !== 'grey' && r.color !== color) return null;
  const n = Math.min(hand[color], r.len);
  if (n === 0 || n + hand.loco < r.len) return null;
  return { color, n, locos: r.len - n };
}

/**
 * Can `id` claim this route on this board? (free; for a double route: never both lanes by one player, and
 * with 2–3 players the second lane closes once the first is taken)
 */
export function routeOpen(owners: (string | null)[], r: TrainRoute, id: string, doubles: boolean): boolean {
  if (owners[r.id]) return false;
  if (r.twin === undefined) return true;
  const other = owners[r.twin];
  if (!other) return true;
  return doubles && other !== id;
}

/** The routes a player owns. */
export const ownedRoutes = (owners: (string | null)[], id: string): TrainRoute[] => ROUTES.filter((r) => owners[r.id] === id);

/** Are two cities joined by these routes? */
export function joined(routes: TrainRoute[], a: string, b: string): boolean {
  if (a === b) return true;
  const adj = new Map<string, string[]>();
  for (const r of routes) {
    adj.set(r.a, [...(adj.get(r.a) ?? []), r.b]);
    adj.set(r.b, [...(adj.get(r.b) ?? []), r.a]);
  }
  const seen = new Set([a]);
  const todo = [a];
  while (todo.length) {
    const c = todo.pop()!;
    for (const n of adj.get(c) ?? []) {
      if (n === b) return true;
      if (!seen.has(n)) {
        seen.add(n);
        todo.push(n);
      }
    }
  }
  return false;
}

/** The longest continuous path (in wagons) over these routes, each route used at most once (cities may repeat). */
export function longestPath(routes: TrainRoute[]): number {
  if (!routes.length) return 0;
  const adj = new Map<string, TrainRoute[]>();
  for (const r of routes) {
    adj.set(r.a, [...(adj.get(r.a) ?? []), r]);
    adj.set(r.b, [...(adj.get(r.b) ?? []), r]);
  }
  const used = new Set<number>();
  let best = 0;
  const walk = (city: string, len: number) => {
    if (len > best) best = len;
    for (const r of adj.get(city) ?? []) {
      if (used.has(r.id)) continue;
      used.add(r.id);
      walk(r.a === city ? r.b : r.a, len + r.len);
      used.delete(r.id);
    }
  };
  for (const city of adj.keys()) walk(city, 0);
  return best;
}
