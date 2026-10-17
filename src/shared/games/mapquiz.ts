/**
 * «أين المكان؟» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to). Also the map maths both
 * sides need: the projection of the map (see ../mapquiz-map.ts), the regions, and great-circle distance.
 */
import { MAP_COS, MAP_K, MAP_LAT_MAX, MAP_LON_MIN } from '../mapquiz-map';

export type MapquizRegion = 'all' | 'maghreb' | 'mashriq';
export type MapquizLevel = 'easy' | 'medium' | 'hard';

export interface MapquizSettings {
  rounds: number;
  /** seconds to place the pin */
  seconds: number;
  region: MapquizRegion;
  /** how close the bots tap */
  level: MapquizLevel;
}

export interface MapquizPoint {
  lat: number;
  lon: number;
}

export interface MapquizResult {
  id: string;
  /** where they tapped (null: no answer in time) */
  guess: MapquizPoint | null;
  /** great-circle distance in km (null: no answer) */
  km: number | null;
  points: number;
}

export interface MapquizView {
  game: 'mapquiz';
  phase: 'play' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  region: MapquizRegion;
  /** the place to find */
  name: string;
  /** reveal / final: the true spot and the one-line fact */
  answer: (MapquizPoint & { fact: string }) | null;
  endsAt: number | null;
  timerTotal: number;
  /** who has confirmed a pin this round */
  guessed: string[];
  /** my confirmed pin */
  mine: MapquizPoint | null;
  results: MapquizResult[] | null;
  scores: Record<string, number>;
  players: string[];
}

/* ------------------------------------------------------------------ */
/* Regions and projection                                              */
/* ------------------------------------------------------------------ */

export interface MapquizRegionInfo {
  key: MapquizRegion;
  label: string;
  /** visible area */
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  /** distance (km) at which a pin scores about a third of the points */
  scale: number;
}

export const MAPQUIZ_REGIONS: Record<MapquizRegion, MapquizRegionInfo> = {
  all: { key: 'all', label: 'العالم الإسلامي كله', lonMin: -20, lonMax: 82, latMin: -10, latMax: 55, scale: 700 },
  maghreb: { key: 'maghreb', label: 'المغرب العربي والأندلس', lonMin: -18, lonMax: 16, latMin: 18, latMax: 45, scale: 300 },
  mashriq: { key: 'mashriq', label: 'المشرق', lonMin: 24, lonMax: 63, latMin: 11, latMax: 43, scale: 350 },
};

/** lon/lat → map units */
export function mapProject(lon: number, lat: number): [number, number] {
  return [(lon - MAP_LON_MIN) * MAP_K * MAP_COS, (MAP_LAT_MAX - lat) * MAP_K];
}

/** map units → lon/lat */
export function mapUnproject(x: number, y: number): MapquizPoint {
  return { lon: x / (MAP_K * MAP_COS) + MAP_LON_MIN, lat: MAP_LAT_MAX - y / MAP_K };
}

/** The region's visible box in map units: [x, y, width, height]. */
export function regionBox(r: MapquizRegion): [number, number, number, number] {
  const g = MAPQUIZ_REGIONS[r];
  const [x0, y0] = mapProject(g.lonMin, g.latMax);
  const [x1, y1] = mapProject(g.lonMax, g.latMin);
  return [x0, y0, x1 - x0, y1 - y0];
}

export function inRegion(r: MapquizRegion, p: MapquizPoint, margin = 0): boolean {
  const g = MAPQUIZ_REGIONS[r];
  return p.lon >= g.lonMin + margin && p.lon <= g.lonMax - margin && p.lat >= g.latMin + margin && p.lat <= g.latMax - margin;
}

/** Great-circle distance in km (haversine, mean Earth radius). */
export function distanceKm(a: MapquizPoint, b: MapquizPoint): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Within this many km a pin gets every point. */
export const MAPQUIZ_EXACT_KM = 25;

/** Points for a pin `km` away: 1000 when (almost) on the spot, then halving roughly every 0.7 × scale. */
export function mapquizPoints(km: number, region: MapquizRegion): number {
  if (km <= MAPQUIZ_EXACT_KM) return 1000;
  return Math.round(1000 * Math.exp(-(km - MAPQUIZ_EXACT_KM) / MAPQUIZ_REGIONS[region].scale));
}

export const MAPQUIZ_DEFAULTS: MapquizSettings = { rounds: 8, seconds: 20, region: 'all', level: 'medium' };

export const MAPQUIZ_INFO = {
  title: 'أين المكان؟',
  tagline: 'ضع المدن والمعالم الإسلامية في مكانها على الخريطة.',
  color: '#22B8B0',
  maxPlayers: 12,
  howTo: [
    'في كل جولة يظهر اسم مدينة أو موضع من العالم الإسلامي: مكة المكرمة، فاس، سمرقند، تمبكتو…',
    'المس الخريطة حيث تظن أنه يقع، ثم اضغط «تأكيد». يمكنك تحريك الدبوس قبل التأكيد.',
    'النقاط حسب المسافة الحقيقية بين دبوسك والمكان (على سطح الأرض): ألف نقطة إن أصبت أو اقتربت جداً، وتقلّ كلما ابتعدت.',
    'بعد كل جولة ترون المكان الصحيح ودبابيس الجميع والمسافات، مع معلومة قصيرة عن المكان.',
    'في الإعدادات: الخريطة كلها، أو جولات مكبّرة على المغرب العربي والأندلس أو على المشرق.',
  ],
};
