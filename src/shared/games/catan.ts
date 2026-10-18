/**
 * «المستوطنون» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 * The board geometry (19 hexes, 54 intersections, 72 paths, 9 harbours) lives in src/shared/catan-board.ts.
 */

export type CatanRes = 'wood' | 'brick' | 'sheep' | 'grain' | 'ore';
export type CatanHexType = CatanRes | 'desert';
export type CatanResMap = Record<CatanRes, number>;
/** a harbour: 3:1 for any resource, or 2:1 for one resource */
export type CatanPortKind = CatanRes | 'any';
export type CatanDevKind = 'knight' | 'vp' | 'roads' | 'plenty' | 'monopoly';
export type CatanBuild = 'road' | 'settlement' | 'city' | 'dev';

export interface CatanSettings {
  /** the official fixed beginner board, or a random board (6 and 8 never next to each other) */
  layout: 'beginner' | 'random';
  /** victory points to win */
  target: 8 | 10 | 12;
  /** seconds per turn (0 = no limit); when the time runs out the turn is played automatically */
  seconds: 0 | 60 | 90 | 120;
}

export type CatanPhase =
  /** the opening: everyone places a settlement and a road, in snake order */
  | 'setup'
  /** the active player rolls (a development card may be played first) */
  | 'roll'
  /** a 7: players with more than 7 cards give back half */
  | 'discard'
  /** the active player moves the robber */
  | 'robber'
  /** the active player picks whom to steal from */
  | 'steal'
  /** two free roads (development card) */
  | 'roads'
  /** trade and build */
  | 'main'
  | 'final';

export interface CatanTrade {
  id: number;
  from: string;
  give: CatanResMap;
  want: CatanResMap;
  /** answers so far: true = accepts, false = declines */
  answers: Record<string, boolean>;
}

export type CatanLog =
  | { id: number; t: 'roll'; p: string; d: [number, number] }
  | { id: number; t: 'gain'; p: string; r: CatanResMap }
  | { id: number; t: 'nothing' }
  | { id: number; t: 'short'; r: CatanRes }
  /** `at`: the vertex (settlement, city) or edge (road) built on */
  | { id: number; t: 'build'; p: string; b: CatanBuild; at?: number }
  | { id: number; t: 'dev'; p: string; k: CatanDevKind; r?: CatanRes; n?: number; r2?: CatanRes }
  | { id: number; t: 'robber'; p: string; h: number }
  | { id: number; t: 'steal'; p: string; from: string; r?: CatanRes }
  | { id: number; t: 'discard'; p: string; n: number }
  | { id: number; t: 'bank'; p: string; give: CatanRes; n: number; get: CatanRes }
  | { id: number; t: 'trade'; p: string; with: string; give: CatanResMap; get: CatanResMap }
  | { id: number; t: 'longest'; p: string | null }
  | { id: number; t: 'army'; p: string }
  | { id: number; t: 'timeout'; p: string }
  | { id: number; t: 'left'; p: string };

export interface CatanPlayerInfo {
  /** resource cards in hand */
  cards: number;
  /** development cards in hand (unplayed) */
  dev: number;
  /** knights played */
  knights: number;
  /** points everyone can see (victory-point cards stay hidden until the end) */
  vp: number;
  /** longest continuous road */
  road: number;
  /** pieces left: roads, settlements, cities */
  left: { road: number; settlement: number; city: number };
  /** left the room: their pieces stay on the board, their turns are skipped */
  gone: boolean;
}

export interface CatanFinalRow {
  settlements: number;
  cities: number;
  vpCards: number;
  longest: number;
  army: number;
  total: number;
}

export interface CatanView {
  game: 'catan';
  phase: CatanPhase;
  /** seats in turn order; a seat's index picks its colour */
  order: string[];
  /** names captured at the start (someone who left is no longer in the room) */
  names: Record<string, string>;
  /** hex terrain, in the order of HEXES (src/shared/catan-board.ts) */
  hexes: CatanHexType[];
  /** number token per hex (null on the desert) */
  nums: (number | null)[];
  /** harbour kind per slot of PORT_SLOTS */
  ports: CatanPortKind[];
  robber: number;
  /** per intersection: seat index of the owner and whether it is a city */
  buildings: ({ s: number; city: boolean } | null)[];
  /** per path: seat index of the road's owner, or -1 */
  roads: number[];
  turn: string | null;
  turnNo: number;
  dice: [number, number] | null;
  rollId: number;
  /** setup: what the active player places now, and which round (1 or 2) */
  setup: { need: 'settlement' | 'road'; round: 1 | 2; at: number | null } | null;
  players: Record<string, CatanPlayerInfo>;
  longest: string | null;
  army: string | null;
  bank: CatanResMap;
  deck: number;
  /** cards each player still has to give back (7 rolled) */
  discard: Record<string, number>;
  /** players the robber can steal from */
  victims: string[];
  /** free roads left (development card) */
  freeRoads: number;
  /** whether a development card was played this turn */
  devPlayed: boolean;
  trade: CatanTrade | null;
  log: CatanLog[];
  endsAt: number | null;
  /** ms per turn (0 = no limit) */
  total: number;
  target: number;
  /** what this phone sees of its own seat (null for spectators) */
  me: {
    seat: number;
    hand: CatanResMap;
    /** unplayed development cards; `fresh` = bought this turn (can't be played yet) */
    devs: { k: CatanDevKind; fresh: boolean }[];
    /** my points including hidden victory-point cards */
    vp: number;
    /** bank trade ratio per resource (4, 3 with a 3:1 harbour, 2 with that resource's harbour) */
    ratios: CatanResMap;
    /** where I may build now (empty when it isn't my move) */
    legal: { settlements: number[]; cities: number[]; roads: number[]; hexes: number[] };
  } | null;
  final: {
    winner: string | null;
    reason: 'win' | 'left';
    rows: Record<string, CatanFinalRow>;
  } | null;
}

export const CATAN_DEFAULTS: CatanSettings = { layout: 'random', target: 10, seconds: 0 };

export const CATAN_INFO = {
  title: 'المستوطنون',
  tagline: 'ابنِ القرى والمدن، وتاجر بالموارد، وكن أول من يبلغ عشر نقاط.',
  color: '#C9772E',
  maxPlayers: 4,
  howTo: [
    'الجزيرة من 19 أرضاً: الغابة تعطي الخشب، والمرعى الصوف، والحقل القمح، والتلال الطوب، والجبل الحجر. الصحراء لا تعطي شيئاً.',
    'في البداية يضع كل لاعب قرية وطريقاً بجانبها، ثم مرة ثانية بالترتيب المعاكس. القرية الثانية تعطيك مورداً من كل أرض تلامسها.',
    'لا تُبنى قرية بجوار قرية أخرى مباشرة: يجب أن يفصل بينهما تقاطع فارغ على الأقل. بعد البداية يجب أن تتصل القرية بطريق لك.',
    'في دورك ارمِ النردين: كل أرض تحمل الرقم المرمي تعطي كل قرية تلامسها مورداً واحداً، وكل مدينة موردين، إلا الأرض التي عليها اللص.',
    'إذا ظهر 7 فلا إنتاج: كل من لديه أكثر من 7 بطاقات يعيد نصفها، ثم تنقل اللص إلى أرض أخرى وتسرق بطاقة من لاعب بجوارها.',
    'بعد الرمي تاجر وابنِ بأي ترتيب. الطريق: خشب وطوب. القرية: خشب وطوب وصوف وقمح. المدينة (ترقية قرية): قمحتان وثلاثة أحجار. بطاقة التطوير: صوف وقمح وحجر.',
    'التجارة مع البنك 4 مقابل 1، أو 3 مقابل 1 إذا كان لك ميناء عام، أو 2 مقابل 1 بميناء ذلك المورد. ويمكنك أن تعرض صفقة على اللاعبين فيقبل من يريد، ثم تختار منهم.',
    'بطاقات التطوير: الفارس ينقل اللص، ونقطة النصر تبقى سرية، وبناء الطرق يعطي طريقين، والوفرة موردين من البنك، والاحتكار يأخذ مورداً من الجميع. بطاقة واحدة في الدور، وليس في دور شرائها.',
    'القرية نقطة، والمدينة نقطتان. أطول طريق متصل (5 على الأقل) نقطتان، وأكبر جيش (3 فرسان على الأقل) نقطتان.',
    'أول من يبلغ 10 نقاط (أو العدد المختار في الإعدادات) في دوره يفوز فوراً.',
  ],
};
