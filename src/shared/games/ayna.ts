/**
 * «أين تقع؟» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings and the game's card on the home screen. Also the map maths both sides need: the
 * three maps (المغرب، العالم العربي، العالم; their shapes are in ../ayna-map.ts), each map's
 * projection, great-circle distance and the points curve fitted to each map.
 */
import { AYNA_GEO, type AynaMapKey } from '../ayna-map';

export type { AynaMapKey } from '../ayna-map';

/** the lobby's map setting: one map, or «منوّع» (each round on the place's own map) */
export type AynaMapSetting = AynaMapKey | 'mixed';
export type AynaPlaceType = 'city' | 'capital' | 'landmark' | 'river' | 'mountain' | 'nature';

export interface AynaSettings {
  /** 8, 10 or 15 */
  rounds: number;
  /** seconds to place the pin: 15, 20 or 30 */
  seconds: number;
  map: AynaMapSetting;
}

export interface AynaPoint {
  lat: number;
  lon: number;
}

export interface AynaResult {
  id: string;
  /** where their pin was when the round ended (null: no pin) */
  guess: AynaPoint | null;
  /** great-circle distance in km (null: no pin) */
  km: number | null;
  points: number;
  /** the pin was confirmed (false: it was still being moved when the time ran out) */
  confirmed: boolean;
}

export interface AynaView {
  game: 'ayna';
  phase: 'play' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  /** the lobby's setting */
  setting: AynaMapSetting;
  /** this round's map */
  map: AynaMapKey;
  /** the place to find */
  name: string;
  type: AynaPlaceType;
  /** reveal / final: the true spot and where it is («فلسطين», «مراكش»…) */
  answer: (AynaPoint & { where: string }) | null;
  endsAt: number | null;
  timerTotal: number;
  /** who has confirmed a pin this round */
  confirmed: string[];
  /** my pin this round (moving or confirmed); never anyone else's before the reveal */
  mine: AynaPoint | null;
  results: AynaResult[] | null;
  scores: Record<string, number>;
  players: string[];
}

/* ------------------------------------------------------------------ */
/* The maps                                                            */
/* ------------------------------------------------------------------ */

export interface AynaMapInfo {
  key: AynaMapKey;
  label: string;
  /** within this many km a pin gets all 1000 points */
  exactKm: number;
  /** beyond exactKm the points fall by e (×0.37) every `scaleKm` */
  scaleKm: number;
  /** the first tap while playing zooms the map this many times around the pin */
  zoom: number;
}

export const AYNA_MAPS: Record<AynaMapKey, AynaMapInfo> = {
  morocco: { key: 'morocco', label: 'خريطة المغرب', exactKm: 10, scaleKm: 120, zoom: 2 },
  arab: { key: 'arab', label: 'خريطة العالم العربي', exactKm: 25, scaleKm: 300, zoom: 2.5 },
  world: { key: 'world', label: 'خريطة العالم', exactKm: 60, scaleKm: 900, zoom: 3 },
};

export const AYNA_MAP_SETTINGS: { key: AynaMapSetting; label: string }[] = [
  { key: 'morocco', label: 'المغرب' },
  { key: 'arab', label: 'العالم العربي' },
  { key: 'world', label: 'العالم' },
  { key: 'mixed', label: 'منوّع' },
];
export const AYNA_ROUNDS = [8, 10, 15];
export const AYNA_SECONDS = [15, 20, 30];

/** What the round asks for, above the name. */
export const AYNA_TYPE_LABEL: Record<AynaPlaceType, string> = {
  city: 'مدينة',
  capital: 'عاصمة',
  landmark: 'معلم',
  river: 'نهر',
  mountain: 'جبل',
  nature: 'موقع طبيعي',
};

const rad = Math.PI / 180;
const millerY = (lat: number) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * Math.max(-85, Math.min(85, lat)) * rad));

/** lon/lat → map units of that map (see tools/ayna-map.mjs) */
export function aynaProject(map: AynaMapKey, lon: number, lat: number): [number, number] {
  const g = AYNA_GEO[map];
  if (g.proj === 'eq') return [(lon - g.lonMin) * g.k * g.cos, (g.latMax - lat) * g.k];
  return [(lon - g.lonMin) * rad * g.k, (millerY(g.latMax) - millerY(lat)) * g.k];
}

/** map units → lon/lat */
export function aynaUnproject(map: AynaMapKey, x: number, y: number): AynaPoint {
  const g = AYNA_GEO[map];
  if (g.proj === 'eq') return { lon: x / (g.k * g.cos) + g.lonMin, lat: g.latMax - y / g.k };
  const my = millerY(g.latMax) - y / g.k;
  return { lon: x / (rad * g.k) + g.lonMin, lat: (Math.atan(Math.exp(my / 1.25)) - Math.PI / 4) / (0.4 * rad) };
}

/** Is the point on the map (at least `margin` degrees inside its edges)? */
export function inMap(map: AynaMapKey, p: AynaPoint, margin = 0): boolean {
  const g = AYNA_GEO[map];
  return p.lon >= g.lonMin + margin && p.lon <= g.lonMax - margin && p.lat >= g.latMin + margin && p.lat <= g.latMax - margin;
}

/** Keep a point on the map. */
export function clampToMap(map: AynaMapKey, p: AynaPoint): AynaPoint {
  const g = AYNA_GEO[map];
  return { lat: Math.min(g.latMax, Math.max(g.latMin, p.lat)), lon: Math.min(g.lonMax, Math.max(g.lonMin, p.lon)) };
}

/** Great-circle distance in km (haversine, mean Earth radius). */
export function aynaKm(a: AynaPoint, b: AynaPoint): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Points for a pin `km` away on this map: 1000 on (or very near) the spot, then fewer the farther. */
export function aynaPoints(km: number, map: AynaMapKey): number {
  const m = AYNA_MAPS[map];
  if (km <= m.exactKm) return 1000;
  return Math.round(1000 * Math.exp(-(km - m.exactKm) / m.scaleKm));
}

export const AYNA_DEFAULTS: AynaSettings = { rounds: 10, seconds: 20, map: 'mixed' };

export const AYNA_INFO = {
  title: 'أين تقع؟',
  tagline: 'مدينة أو معلم: ضع الدبوس على الخريطة، والأقرب يربح.',
  color: '#2FA58A',
  maxPlayers: 12,
  howTo: [
    'في كل جولة يظهر اسم مكان: مدينة مغربية، عاصمة، معلم مشهور، نهر أو جبل…',
    'المس الخريطة على هاتفك حيث تظن أنه يقع: تكبر الخريطة حول الدبوس، ويمكنك تحريكه بلمسة أخرى قبل «تأكيد».',
    'إن انتهى الوقت قبل التأكيد يُحسب الدبوس حيث هو، ومن لم يضع دبوساً فله صفر.',
    'النقاط حسب المسافة الحقيقية بالكيلومترات: ألف نقطة عند المكان أو قربه، وتقلّ كلما ابتعد الدبوس. المقياس على قدر الخريطة: خريطة المغرب أدق من خريطة العالم.',
    'بعد كل جولة يظهر المكان الصحيح ودبابيس الجميع بألوانهم ومسافاتهم.',
    'في الإعدادات: خريطة المغرب، أو العالم العربي، أو العالم، أو «منوّع»، وعدد الجولات ووقت كل جولة.',
  ],
};
