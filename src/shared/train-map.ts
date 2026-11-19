/**
 * «قطار المغرب» — the board: Morocco, whole with its Sahara, its cities, the rail routes between them
 * and the destination tickets. Shared by the server (rules, bots) and the app (the drawing).
 *
 * Board units: BOARD_W × BOARD_H (a phone-portrait board). The cities sit roughly where they are on the
 * map, spread apart in the crowded north so every route stays legible on a 320 px phone; the outline
 * (src/shared/train-outline.ts, made by tools/train-map.mjs) is the real coastline and borders of Morocco
 * bent the same way, with the cities as the anchors of the bend. No line ever separates the Sahara.
 *
 * Routes: `len` 1–6 wagons, one of the 8 card colours or grey (any one colour). A double route is two
 * routes between the same cities (`twin` points at the other one): with 2–3 players only one of the two
 * can be claimed; with 4–5 both can, never by the same player.
 * Tickets: two cities; the value is the shortest rail distance between them (in wagons), computed once
 * from the routes (5–22).
 */

export const BOARD_W = 1000;
export const BOARD_H = 1665;

/** the 8 card colours; locomotives ('loco') are wild */
export const TRAIN_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'white'] as const;
export type TrainColor = (typeof TRAIN_COLORS)[number];
export type TrainCard = TrainColor | 'loco';
/** a route's colour: a card colour, or grey (paid with any one colour) */
export type RouteColor = TrainColor | 'grey';

export const COLOR_NAME: Record<TrainCard | 'grey', string> = {
  red: 'أحمر',
  orange: 'برتقالي',
  yellow: 'أصفر',
  green: 'أخضر',
  blue: 'أزرق',
  purple: 'بنفسجي',
  black: 'أسود',
  white: 'أبيض',
  loco: 'قاطرة',
  grey: 'رمادي',
};

/** where a city's name sits around its dot */
export type LabelAt = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface TrainCity {
  id: string;
  name: string;
  /** the shorter name drawn on the map (defaults to `name`) */
  short?: string;
  /** the real place (degrees; on the land of the simplified coast for Dakhla and Lagouira): the anchor of the outline's bend */
  lon: number;
  lat: number;
  /** on the board */
  x: number;
  y: number;
  label: LabelAt;
}

export const CITIES: TrainCity[] = [
  { id: 'tng', name: 'طنجة', lon: -5.8, lat: 35.77, x: 500, y: 58, label: 'n' },
  { id: 'ttn', name: 'تطوان', lon: -5.37, lat: 35.57, x: 628, y: 92, label: 'n' },
  { id: 'hoc', name: 'الحسيمة', lon: -3.93, lat: 35.25, x: 772, y: 128, label: 'n' },
  { id: 'ndr', name: 'الناظور', lon: -2.93, lat: 35.17, x: 884, y: 160, label: 'n' },
  { id: 'ouj', name: 'وجدة', lon: -1.91, lat: 34.68, x: 952, y: 268, label: 'w' },
  { id: 'ken', name: 'القنيطرة', lon: -6.58, lat: 34.26, x: 430, y: 186, label: 'w' },
  { id: 'rab', name: 'الرباط', lon: -6.84, lat: 34.02, x: 372, y: 268, label: 'w' },
  { id: 'cas', name: 'الدار البيضاء', short: 'البيضاء', lon: -7.59, lat: 33.57, x: 292, y: 350, label: 'w' },
  { id: 'jad', name: 'الجديدة', lon: -8.51, lat: 33.25, x: 210, y: 432, label: 'w' },
  { id: 'mek', name: 'مكناس', lon: -5.55, lat: 33.89, x: 520, y: 288, label: 's' },
  { id: 'fes', name: 'فاس', lon: -5.0, lat: 34.03, x: 642, y: 262, label: 'n' },
  { id: 'taz', name: 'تازة', lon: -4.01, lat: 34.21, x: 800, y: 290, label: 's' },
  { id: 'ifr', name: 'إفران', lon: -5.11, lat: 33.53, x: 600, y: 392, label: 'e' },
  { id: 'khu', name: 'خريبكة', lon: -6.91, lat: 32.88, x: 400, y: 440, label: 'e' },
  { id: 'bml', name: 'بني ملال', lon: -6.36, lat: 32.34, x: 492, y: 530, label: 'e' },
  { id: 'mid', name: 'ميدلت', lon: -4.74, lat: 32.68, x: 690, y: 500, label: 'e' },
  { id: 'err', name: 'الراشيدية', lon: -4.42, lat: 31.93, x: 800, y: 622, label: 's' },
  { id: 'fig', name: 'فكيك', lon: -1.23, lat: 32.11, x: 952, y: 560, label: 's' },
  { id: 'saf', name: 'آسفي', lon: -9.24, lat: 32.3, x: 170, y: 545, label: 'w' },
  { id: 'mrk', name: 'مراكش', lon: -8.01, lat: 31.63, x: 330, y: 610, label: 'e' },
  { id: 'ess', name: 'الصويرة', lon: -9.77, lat: 31.51, x: 150, y: 668, label: 'w' },
  { id: 'ouz', name: 'ورزازات', lon: -6.89, lat: 30.92, x: 500, y: 712, label: 'e' },
  { id: 'zag', name: 'زاكورة', lon: -5.84, lat: 30.33, x: 640, y: 790, label: 'e' },
  { id: 'aga', name: 'أكادير', lon: -9.6, lat: 30.42, x: 196, y: 790, label: 'w' },
  { id: 'tiz', name: 'تيزنيت', lon: -9.73, lat: 29.7, x: 214, y: 880, label: 'w' },
  { id: 'tat', name: 'طاطا', lon: -7.97, lat: 29.74, x: 450, y: 880, label: 'e' },
  { id: 'glm', name: 'كلميم', lon: -10.06, lat: 28.99, x: 250, y: 972, label: 'w' },
  { id: 'tnt', name: 'طانطان', lon: -11.1, lat: 28.44, x: 196, y: 1062, label: 'w' },
  { id: 'mhb', name: 'المحبس', lon: -9.03, lat: 27.42, x: 470, y: 1090, label: 'e' },
  { id: 'trf', name: 'طرفاية', lon: -12.93, lat: 27.94, x: 100, y: 1150, label: 'e' },
  { id: 'aay', name: 'العيون', lon: -13.2, lat: 27.15, x: 100, y: 1272, label: 'e' },
  { id: 'sma', name: 'السمارة', lon: -11.67, lat: 26.74, x: 300, y: 1240, label: 'e' },
  { id: 'bjd', name: 'بوجدور', lon: -14.48, lat: 26.13, x: 80, y: 1390, label: 'e' },
  { id: 'dkh', name: 'الداخلة', lon: -15.65, lat: 23.9, x: 98, y: 1536, label: 'ne' },
  { id: 'aus', name: 'أوسرد', lon: -14.33, lat: 22.55, x: 300, y: 1560, label: 'e' },
  { id: 'lag', name: 'الكويرة', lon: -16.85, lat: 21.45, x: 76, y: 1636, label: 'e' },
];

export const CITY: Record<string, TrainCity> = Object.fromEntries(CITIES.map((c) => [c.id, c]));

export interface TrainRoute {
  id: number;
  a: string;
  b: string;
  len: number;
  color: RouteColor;
  /** the other route of a double route */
  twin?: number;
  /** a gentle curve: the middle pushed sideways by this much (board units, + = to the left of a→b) */
  bend?: number;
}

/** [from, to, length, colour, colour of the twin (a double route), bend] */
type RouteRow = [string, string, number, RouteColor, (RouteColor | null)?, number?];

const ROWS: RouteRow[] = [
  // the north
  ['tng', 'ttn', 2, 'grey', 'grey'],
  ['tng', 'ken', 3, 'white'],
  ['ttn', 'hoc', 3, 'red'],
  ['ttn', 'fes', 3, 'black'],
  ['hoc', 'ndr', 2, 'grey'],
  ['hoc', 'taz', 3, 'green'],
  ['ndr', 'ouj', 2, 'yellow'],
  ['ouj', 'taz', 3, 'grey'],
  ['ouj', 'fig', 6, 'blue'],
  ['ken', 'rab', 1, 'grey', 'grey'],
  ['ken', 'mek', 2, 'orange'],
  ['rab', 'cas', 2, 'red', 'blue'],
  ['rab', 'mek', 3, 'purple'],
  ['rab', 'khu', 3, 'green'],
  ['mek', 'fes', 2, 'yellow', 'white'],
  ['fes', 'taz', 3, 'orange'],
  ['fes', 'ifr', 2, 'purple'],
  ['mek', 'ifr', 2, 'grey'],
  ['cas', 'jad', 2, 'white', 'black'],
  ['cas', 'khu', 2, 'yellow'],
  ['cas', 'mrk', 5, 'orange', 'green'],
  ['jad', 'saf', 2, 'purple'],
  ['saf', 'mrk', 3, 'blue'],
  ['saf', 'ess', 2, 'grey'],
  ['ess', 'mrk', 3, 'yellow'],
  ['ess', 'aga', 2, 'black'],
  ['khu', 'bml', 2, 'red'],
  ['bml', 'mrk', 3, 'white'],
  ['bml', 'ifr', 3, 'blue'],
  ['bml', 'mid', 4, 'grey'],
  ['ifr', 'mid', 2, 'black'],
  ['taz', 'mid', 5, 'red'],
  ['mid', 'err', 3, 'green'],
  ['err', 'fig', 3, 'purple'],
  ['err', 'zag', 5, 'grey'],
  ['err', 'ouz', 6, 'white'],
  ['mrk', 'ouz', 4, 'black', 'purple'],
  ['bml', 'ouz', 3, 'orange'],
  ['ouz', 'zag', 3, 'red'],
  ['mrk', 'aga', 4, 'red', 'blue'],
  ['ouz', 'aga', 6, 'grey'],
  // the south
  ['ouz', 'tat', 3, 'grey'],
  ['zag', 'tat', 4, 'green'],
  ['aga', 'tiz', 1, 'grey'],
  ['aga', 'tat', 5, 'yellow'],
  ['tiz', 'tat', 4, 'orange'],
  ['tiz', 'glm', 2, 'purple'],
  ['tat', 'glm', 4, 'blue'],
  ['tat', 'mhb', 4, 'black'],
  ['glm', 'tnt', 2, 'yellow'],
  ['glm', 'mhb', 5, 'white'],
  // the Sahara
  ['tnt', 'trf', 2, 'red'],
  ['tnt', 'sma', 4, 'grey'],
  ['tnt', 'mhb', 5, 'green'],
  ['trf', 'aay', 2, 'blue', 'orange'],
  ['aay', 'sma', 4, 'purple'],
  ['sma', 'mhb', 4, 'yellow'],
  ['aay', 'bjd', 2, 'grey'],
  ['sma', 'bjd', 5, 'white'],
  ['bjd', 'dkh', 3, 'black'],
  ['sma', 'aus', 6, 'orange'],
  ['dkh', 'aus', 4, 'green'],
  ['dkh', 'lag', 2, 'red'],
  ['aus', 'lag', 5, 'grey'],
];

function buildRoutes(): TrainRoute[] {
  const out: TrainRoute[] = [];
  for (const [a, b, len, color, twin, bend] of ROWS) {
    const id = out.length;
    out.push({ id, a, b, len, color, ...(bend ? { bend } : {}) });
    if (twin) {
      out[id].twin = id + 1;
      out.push({ id: id + 1, a, b, len, color: twin, twin: id });
    }
  }
  return out;
}

export const ROUTES: TrainRoute[] = buildRoutes();

/** the points of a claimed route, by its length */
export const ROUTE_POINTS = [0, 1, 2, 4, 7, 10, 15] as const;

/* ------------------------------------------------------------------ */
/* Geometry (board units): where each wagon slot of a route is drawn   */
/* ------------------------------------------------------------------ */

/** a city's dot */
export const CITY_R = 15;
/** where the first slot starts, from a city's centre */
export const SLOT_START = 17;
/** a wagon slot's thickness, and the gap between two slots */
export const SLOT_T = 24;
export const SLOT_GAP = 5;
/** the board length of one wagon with its gap, for a route's drawn length */
export const SLOT_PITCH = 46;

export interface Slot {
  x: number;
  y: number;
  /** degrees */
  angle: number;
  len: number;
}

function curve(r: TrainRoute): { at: (t: number) => [number, number]; length: number } {
  const A = CITY[r.a];
  const B = CITY[r.b];
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const d = Math.hypot(dx, dy) || 1;
  // left normal of a→b (y grows downwards)
  const nx = dy / d;
  const ny = -dx / d;
  // a double route: the two lanes side by side
  const lane = r.twin === undefined ? 0 : (r.id < r.twin ? 1 : -1) * (SLOT_T / 2 + 2);
  const ax = A.x + nx * lane;
  const ay = A.y + ny * lane;
  const bx = B.x + nx * lane;
  const by = B.y + ny * lane;
  const bend = (r.bend ?? 0) * 2;
  const cx = (ax + bx) / 2 + nx * bend;
  const cy = (ay + by) / 2 + ny * bend;
  const at = (t: number): [number, number] => {
    const u = 1 - t;
    return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by];
  };
  let length = 0;
  let prev = at(0);
  for (let i = 1; i <= 40; i++) {
    const p = at(i / 40);
    length += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return { at, length };
}

const slotCache = new Map<number, Slot[]>();

/** The wagon slots of a route, from city a to city b. */
export function routeSlots(r: TrainRoute): Slot[] {
  const hit = slotCache.get(r.id);
  if (hit) return hit;
  const { at, length } = curve(r);
  const start = SLOT_START;
  const usable = length - 2 * start;
  const len = Math.max(8, (usable - (r.len - 1) * SLOT_GAP) / r.len);
  const out: Slot[] = [];
  for (let i = 0; i < r.len; i++) {
    const mid = start + i * (len + SLOT_GAP) + len / 2;
    const t = mid / length;
    const [x, y] = at(t);
    const [x1, y1] = at(Math.max(0, t - 0.01));
    const [x2, y2] = at(Math.min(1, t + 0.01));
    out.push({ x, y, angle: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI, len });
  }
  slotCache.set(r.id, out);
  return out;
}

/** Points along a route (for finding the route under a finger). */
export function routeLine(r: TrainRoute, n = 12): [number, number][] {
  const { at } = curve(r);
  return Array.from({ length: n + 1 }, (_, i) => at(i / n));
}

/* ------------------------------------------------------------------ */
/* Destination tickets                                                 */
/* ------------------------------------------------------------------ */

export interface TrainTicket {
  id: number;
  a: string;
  b: string;
  /** points if the two cities are joined by the player's own routes (lost if not) */
  value: number;
}

/** the ticket pairs, from the shortest (5) to the whole country (22) */
const TICKET_PAIRS: [string, string][] = [
  ['tng', 'dkh'],
  ['ouj', 'aay'],
  ['rab', 'dkh'],
  ['fes', 'aay'],
  ['mrk', 'lag'],
  ['cas', 'aay'],
  ['cas', 'sma'],
  ['hoc', 'zag'],
  ['tat', 'dkh'],
  ['tng', 'aga'],
  ['ouj', 'mrk'],
  ['cas', 'fig'],
  ['ess', 'taz'],
  ['aga', 'dkh'],
  ['tiz', 'aus'],
  ['ouj', 'cas'],
  ['rab', 'fig'],
  ['mrk', 'sma'],
  ['err', 'glm'],
  ['err', 'mhb'],
  ['fes', 'aga'],
  ['ken', 'zag'],
  ['zag', 'sma'],
  ['fig', 'tat'],
  ['bml', 'tnt'],
  ['tng', 'mrk'],
  ['ndr', 'rab'],
  ['hoc', 'cas'],
  ['cas', 'err'],
  ['saf', 'fes'],
  ['aga', 'bjd'],
  ['mid', 'aga'],
  ['glm', 'dkh'],
  ['tnt', 'lag'],
  ['trf', 'aus'],
  ['ttn', 'ouz'],
  ['khu', 'tiz'],
  ['jad', 'fes'],
  ['ifr', 'ess'],
  ['fes', 'mrk'],
  ['mek', 'ouz'],
  ['ess', 'tnt'],
  ['ouz', 'mhb'],
  ['tng', 'ifr'],
  ['ken', 'jad'],
];

/** The fewest wagons joining every pair of cities over all the routes. */
function allDistances(): Record<string, Record<string, number>> {
  const ids = CITIES.map((c) => c.id);
  const D: Record<string, Record<string, number>> = {};
  for (const a of ids) D[a] = Object.fromEntries(ids.map((b) => [b, a === b ? 0 : Infinity]));
  for (const r of ROUTES) D[r.a][r.b] = D[r.b][r.a] = Math.min(D[r.a][r.b], r.len);
  for (const k of ids) for (const i of ids) for (const j of ids) if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
  return D;
}

/** A ticket's value from the shortest distance: wagon for wagon up to 16, then half (the longest crossings stay at 22). */
export const ticketValue = (dist: number) => (dist <= 16 ? dist : 16 + Math.round((dist - 16) / 2));

export const RAIL_DIST = allDistances();

export const TICKETS: TrainTicket[] = TICKET_PAIRS.map(([a, b], id) => ({ id, a, b, value: ticketValue(RAIL_DIST[a][b]) }));
