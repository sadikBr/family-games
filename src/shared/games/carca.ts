/**
 * «المدن والطرق» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 * The tiles and the board geometry live in src/shared/carca-tiles.ts.
 */

export interface CarcaSettings {
  /** farmers on fields (scored at the end, 3 points per completed city) */
  farmers: boolean;
  /** seconds per turn (0 = no limit); when time runs out the tile goes in the best spot, without a follower */
  seconds: 0 | 45 | 60 | 90;
  /** bots: 1 = easy, 2 = strong */
  level: 1 | 2;
}

export interface CarcaTilePlaced {
  x: number;
  y: number;
  /** tile type A–X */
  t: string;
  /** quarter turns clockwise */
  r: number;
}

export interface CarcaFollower {
  owner: string;
  x: number;
  y: number;
  /** feature index on that tile (see TILE_TYPES) */
  f: number;
}

export type CarcaScoreKind = 'road' | 'city' | 'monastery' | 'farm';

export interface CarcaEvent {
  n: number;
  kind: CarcaScoreKind | 'discard';
  /** points each scorer got */
  pts: number;
  /** who scored (empty: nobody had a follower there, or the majority left the game) */
  who: string[];
  /** scored at the end of the game (unfinished feature / farm) */
  end: boolean;
  /** the discarded tile type */
  t?: string;
}

export interface CarcaBreakdown {
  road: number;
  city: number;
  monastery: number;
  farm: number;
}

export interface CarcaView {
  game: 'carca';
  phase: 'play' | 'final';
  /** players still in the game, in turn order */
  order: string[];
  /** colour index (0..4) of everyone who started */
  colors: Record<string, number>;
  turn: string | null;
  turnNo: number;
  /** what the player on turn does now */
  step: 'place' | 'follower' | null;
  /** the tile drawn this turn (everyone sees it) */
  tile: string | null;
  /** where the player on turn is trying the tile (live for everyone) */
  preview: { x: number; y: number; r: number } | null;
  /** the tile placed last */
  last: { x: number; y: number; by: string } | null;
  /** follower step: the features of the placed tile a follower may go on */
  options: number[];
  board: CarcaTilePlaced[];
  followers: CarcaFollower[];
  supply: Record<string, number>;
  scores: Record<string, number>;
  breakdown: Record<string, CarcaBreakdown>;
  /** tiles left to draw */
  deck: number;
  /** scoring events and discarded tiles, newest last */
  log: CarcaEvent[];
  endsAt: number | null;
  /** ms per turn (0 = no limit) */
  total: number;
  farmers: boolean;
  /**
   * The followers that went back to their owners at the latest scoring, and the turn it happened in
   * (lets the app show them going home, even one put on a feature that the same tile completed).
   * Optional: older servers don't send it.
   */
  returned?: { n: number; followers: CarcaFollower[] } | null;
  final: {
    winners: string[];
    /** players who left during the game */
    left: string[];
  } | null;
}

export const CARCA_DEFAULTS: CarcaSettings = { farmers: true, seconds: 0, level: 2 };

export const CARCA_INFO = {
  title: 'المدن والطرق',
  tagline: 'ضع البلاطات، وابنِ المدن والطرق، وضع أتباعك في المكان المناسب.',
  color: '#4E9A5B',
  maxPlayers: 5,
  howTo: [
    'في دورك تسحب بلاطة يراها الجميع، وتضعها بجانب بلاطة موجودة بحيث يطابق كل جانب ما يجاوره: مدينة بجانب مدينة، وطريق بجانب طريق، وحقل بجانب حقل. يمكنك تدويرها. الأماكن الممكنة مضيئة.',
    'بعد وضع البلاطة يمكنك وضع تابع واحد عليها (لكل لاعب سبعة): فارس في المدينة، أو قاطع طريق على الطريق، أو راهب في الدير، أو مزارع في الحقل، بشرط ألا يكون في ذلك المكان المتصل تابع لأحد.',
    'عند اكتمال طريق: نقطة لكل بلاطة. عند اكتمال مدينة (مغلقة بالأسوار): نقطتان لكل بلاطة ونقطتان لكل راية. الدير المحاط بثماني بلاطات: 9 نقاط. يعود التابع إلى صاحبه بعد الاحتساب.',
    'إذا اتصلت أماكن فيها أتباع لعدة لاعبين، فالنقاط لصاحب الأكثرية، وعند التعادل يأخذ كل المتعادلين النقاط كاملة.',
    'في النهاية: الطريق والمدينة غير المكتملين نقطة لكل بلاطة (ولكل راية)، والدير نقطة له ولكل بلاطة حوله. وكل حقل فيه مزارعون يعطي صاحب الأكثرية 3 نقاط عن كل مدينة مكتملة يلامسها. المزارعون لا يعودون.',
    'إذا لم يكن للبلاطة المسحوبة أي مكان ممكن تُستبعد وتُسحب غيرها. تنتهي اللعبة بوضع آخر بلاطة، والأكثر نقاطاً يفوز.',
  ],
};
