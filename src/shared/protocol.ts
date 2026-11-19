/**
 * Shared types between the app (src/) and the game server (server/).
 * Keep this file free of React Native / Bun specific imports.
 */
import type { Card } from './cards';
import type { ZadKind } from './islamic';
import type { UnoColor, UnoFace, UnoSide } from './uno';
import type { MemberStatus, MyStatus } from './status';
import type { ReactionKey } from './reactions';
import { PHASE10_DEFAULTS, type Phase10Settings, type Phase10View } from './games/phase10';
import { SCRABBLE_DEFAULTS, type ScrabbleSettings, type ScrabbleView } from './games/scrabble';
import { CHARADES_DEFAULTS, type CharadesSettings, type CharadesView } from './games/charades';
import { SPY_DEFAULTS, type SpySettings, type SpyView } from './games/spy';
import { SURVEY_DEFAULTS, type SurveySettings, type SurveyView } from './games/survey';
import { DOTS_DEFAULTS, type DotsSettings, type DotsView } from './games/dots';
import { MANCALA_DEFAULTS, type MancalaSettings, type MancalaView } from './games/mancala';
import { BLOCKS_DEFAULTS, type BlocksSettings, type BlocksView } from './games/blocks';
import { CODEBREAK_DEFAULTS, type CodebreakSettings, type CodebreakView } from './games/codebreak';
import { CATAN_DEFAULTS, type CatanSettings, type CatanView } from './games/catan';
import { CARCA_DEFAULTS, type CarcaSettings, type CarcaView } from './games/carca';
import { BALOOT_DEFAULTS, type BalootSettings, type BalootView } from './games/baloot';
import { TOUTI_DEFAULTS, type ToutiSettings, type ToutiView } from './games/touti';
import { TELEDRAW_DEFAULTS, type TeledrawSettings, type TeledrawView } from './games/teledraw';
import { STORY_DEFAULTS, type StorySettings, type StoryView } from './games/story';
import { ONEWORD_DEFAULTS, type OnewordSettings, type OnewordView } from './games/oneword';
import { BOGGLE_DEFAULTS, type BoggleSettings, type BoggleView } from './games/boggle';
import { QQUOTE_DEFAULTS, type QquoteSettings, type QquoteView } from './games/qquote';
import { TAJWEED_DEFAULTS, type TajweedSettings, type TajweedView } from './games/tajweed';
import { ASMA_DEFAULTS, type AsmaSettings, type AsmaView } from './games/asma';
import { STEPS_DEFAULTS, type StepsSettings, type StepsView } from './games/steps';
import { MAPQUIZ_DEFAULTS, type MapquizSettings, type MapquizView } from './games/mapquiz';
import { PROPHETS_DEFAULTS, type ProphetsSettings, type ProphetsView } from './games/prophets';
import { MOSQUE_DEFAULTS, type MosqueSettings, type MosqueView } from './games/mosque';
import { HEZ2_DEFAULTS, type Hez2Settings, type Hez2View } from './games/hez2';
import { RAMI_DEFAULTS, type RamiSettings, type RamiView } from './games/rami';
import { FAST_DEFAULTS, type FastSettings, type FastView } from './games/fast';
import { ESTIMATE_DEFAULTS, type EstimateSettings, type EstimateView } from './games/estimate';
import { TRUEFALSE_DEFAULTS, type TruefalseSettings, type TruefalseView } from './games/truefalse';
import { FLAGS_DEFAULTS, type FlagsSettings, type FlagsView } from './games/flags';
import { QCOND_DEFAULTS, type QcondSettings, type QcondView } from './games/qcond';
import { GUESSWHO_DEFAULTS, type GuesswhoSettings, type GuesswhoView } from './games/guesswho';
import { CLUE_DEFAULTS, type ClueSettings, type ClueView } from './games/clue';
import { TRIANGLES_DEFAULTS, type TrianglesSettings, type TrianglesView } from './games/triangles';
import { REALMS_DEFAULTS, type RealmsSettings, type RealmsView } from './games/realms';
import { BALLOONS_DEFAULTS, type BalloonsSettings, type BalloonsView } from './games/balloons';
import { KALIM_DEFAULTS, type KalimSettings, type KalimView } from './games/kalim';
import { DOMINO_DEFAULTS, type DominoSettings, type DominoView } from './games/domino';
import { TAWLA_DEFAULTS, type TawlaSettings, type TawlaView } from './games/tawla';
import { QAMUS_DEFAULTS, type QamusSettings, type QamusView } from './games/qamus';
import { MIND_DEFAULTS, type MindSettings, type MindView } from './games/mind';
import { COUP_DEFAULTS, type CoupSettings, type CoupView } from './games/coup';
import { MILLION_DEFAULTS, type MillionSettings, type MillionView } from './games/million';
import { RAWABIT_DEFAULTS, type RawabitSettings, type RawabitView } from './games/rawabit';
import { KHALIA_DEFAULTS, type KhaliaSettings, type KhaliaView } from './games/khalia';
import { TARTIB_DEFAULTS, type TartibSettings, type TartibView } from './games/tartib';
import { AKBAR_DEFAULTS, type AkbarSettings, type AkbarView } from './games/akbar';
import { MATHAL_DEFAULTS, type MathalSettings, type MathalView } from './games/mathal';
import { AYNA_DEFAULTS, type AynaSettings, type AynaView } from './games/ayna';
import { BALAD_DEFAULTS, type BaladSettings, type BaladView } from './games/balad';
import { EMOJI_DEFAULTS, type EmojiSettings, type EmojiView } from './games/emoji';
import { ARJAH_DEFAULTS, type ArjahSettings, type ArjahView } from './games/arjah';
import { CROSS_DEFAULTS, type CrossSettings, type CrossView } from './games/cross';
import { MAKKI_DEFAULTS, type MakkiSettings, type MakkiView } from './games/makki';
import { QAIMA_DEFAULTS, type QaimaSettings, type QaimaView } from './games/qaima';
import { TRAIN_DEFAULTS, type TrainSettings, type TrainView } from './games/train';
import { SILSILA_DEFAULTS, type SilsilaSettings, type SilsilaView } from './games/silsila';
import { BOMB_DEFAULTS, type BombSettings, type BombView } from './games/bomb';
import { BILLIARDS_DEFAULTS, type BilliardsSettings, type BilliardsView } from './games/billiards';
import type { TournamentConfig, TournamentFormat, TournamentView } from './tournament';
export type { Phase10Settings, Phase10View } from './games/phase10';
export type { ScrabbleSettings, ScrabbleView } from './games/scrabble';
export type { CharadesSettings, CharadesView } from './games/charades';
export type { SpySettings, SpyView } from './games/spy';
export type { SurveySettings, SurveyView } from './games/survey';
export type { DotsSettings, DotsView } from './games/dots';
export type { MancalaSettings, MancalaView } from './games/mancala';
export type { BlocksSettings, BlocksView } from './games/blocks';
export type { CodebreakSettings, CodebreakView } from './games/codebreak';
export type { CatanSettings, CatanView } from './games/catan';
export type { CarcaSettings, CarcaView } from './games/carca';
export type { BalootSettings, BalootView } from './games/baloot';
export type { ToutiSettings, ToutiView } from './games/touti';
export type { TeledrawSettings, TeledrawView } from './games/teledraw';
export type { StorySettings, StoryView } from './games/story';
export type { OnewordSettings, OnewordView } from './games/oneword';
export type { BoggleSettings, BoggleView } from './games/boggle';
export type { QquoteSettings, QquoteView } from './games/qquote';
export type { TajweedSettings, TajweedView } from './games/tajweed';
export type { AsmaSettings, AsmaView } from './games/asma';
export type { StepsSettings, StepsView } from './games/steps';
export type { MapquizSettings, MapquizView } from './games/mapquiz';
export type { ProphetsSettings, ProphetsView } from './games/prophets';
export type { MosqueSettings, MosqueView } from './games/mosque';
export type { Hez2Settings, Hez2View } from './games/hez2';
export type { RamiSettings, RamiView } from './games/rami';
export type { FastSettings, FastView } from './games/fast';
export type { BilliardsSettings, BilliardsView } from './games/billiards';
export type { EstimateSettings, EstimateView } from './games/estimate';
export type { TruefalseSettings, TruefalseView } from './games/truefalse';
export type { FlagsSettings, FlagsView } from './games/flags';
export type { QcondSettings, QcondView } from './games/qcond';
export type { GuesswhoSettings, GuesswhoView } from './games/guesswho';
export type { ClueSettings, ClueView } from './games/clue';
export type { TrianglesSettings, TrianglesView } from './games/triangles';
export type { RealmsSettings, RealmsView } from './games/realms';
export type { BalloonsSettings, BalloonsView } from './games/balloons';
export type { KalimSettings, KalimView } from './games/kalim';
export type { DominoSettings, DominoView } from './games/domino';
export type { TawlaSettings, TawlaView } from './games/tawla';
export type { QamusSettings, QamusView } from './games/qamus';
export type { MindSettings, MindView } from './games/mind';
export type { CoupSettings, CoupView } from './games/coup';
export type { MillionSettings, MillionView } from './games/million';
export type { RawabitSettings, RawabitView } from './games/rawabit';
export type { KhaliaSettings, KhaliaView } from './games/khalia';
export type { TartibSettings, TartibView } from './games/tartib';
export type { AkbarSettings, AkbarView } from './games/akbar';
export type { MathalSettings, MathalView } from './games/mathal';
export type { AynaSettings, AynaView } from './games/ayna';
export type { BaladSettings, BaladView } from './games/balad';
export type { EmojiSettings, EmojiView } from './games/emoji';
export type { ArjahSettings, ArjahView } from './games/arjah';
export type { CrossSettings, CrossView } from './games/cross';
export type { MakkiSettings, MakkiView } from './games/makki';
export type { QaimaSettings, QaimaView } from './games/qaima';
export type { TrainSettings, TrainView } from './games/train';
export type { SilsilaSettings, SilsilaView } from './games/silsila';
export type { BombSettings, BombView } from './games/bomb';

export type { Card } from './cards';

export type GameId =
  | 'imposter'
  | 'names'
  | 'headsup'
  | 'taboo'
  | 'potato'
  | 'werewolf'
  | 'ronda'
  | 'kanza'
  | 'tris'
  | 'konkan'
  | 'unoflip'
  | 'hez2'
  | 'ludo'
  | 'codenames'
  | 'dama'
  | 'draw'
  | 'estate'
  | 'huroof'
  | 'quiz'
  | 'whois'
  | 'surah'
  | 'hajj'
  | 'ladders'
  | 'connect4'
  | 'chess'
  | 'kdab'
  | 'wave'
  | 'wordle'
  | 'kharbga'
  | 'battleship'
  | 'xo'
  | 'sudoku'
  | 'trivia'
  | 'memory'
  | 'phase10'
  | 'scrabble'
  | 'charades'
  | 'spy'
  | 'survey'
  | 'dots'
  | 'mancala'
  | 'blocks'
  | 'codebreak'
  | 'catan'
  | 'carca'
  | 'baloot'
  | 'touti'
  | 'teledraw'
  | 'story'
  | 'oneword'
  | 'boggle'
  | 'qquote'
  | 'tajweed'
  | 'asma'
  | 'steps'
  | 'mapquiz'
  | 'prophets'
  | 'mosque'
  | 'rami'
  | 'fast'
  | 'billiards'
  | 'estimate'
  | 'truefalse'
  | 'flags'
  | 'qcond'
  | 'guesswho'
  | 'clue'
  | 'triangles'
  | 'realms'
  | 'balloons'
  | 'kalim'
  | 'domino'
  | 'tawla'
  | 'qamus'
  | 'mind'
  | 'coup'
  | 'million'
  | 'rawabit'
  | 'khalia'
  | 'tartib'
  | 'akbar'
  | 'mathal'
  | 'ayna'
  | 'balad'
  | 'emoji'
  | 'arjah'
  | 'cross'
  | 'makki'
  | 'qaima'
  | 'train'
  | 'silsila'
  | 'bomb';

export const GAME_IDS: GameId[] = [
  'imposter',
  'names',
  'headsup',
  'taboo',
  'potato',
  'werewolf',
  'ronda',
  'kanza',
  'tris',
  'konkan',
  'unoflip',
  'hez2',
  'ludo',
  'codenames',
  'dama',
  'draw',
  'estate',
  'huroof',
  'quiz',
  'whois',
  'surah',
  'hajj',
  'ladders',
  'connect4',
  'chess',
  'kdab',
  'wave',
  'wordle',
  'kharbga',
  'battleship',
  'xo',
  'sudoku',
  'trivia',
  'memory',
  'phase10',
  'scrabble',
  'charades',
  'spy',
  'survey',
  'dots',
  'mancala',
  'blocks',
  'codebreak',
  'catan',
  'carca',
  'baloot',
  'touti',
  'teledraw',
  'story',
  'oneword',
  'boggle',
  'qquote',
  'tajweed',
  'asma',
  'steps',
  'mapquiz',
  'prophets',
  'mosque',
  'rami',
  'fast',
  'billiards',
  'estimate',
  'truefalse',
  'flags',
  'qcond',
  'guesswho',
  'clue',
  'triangles',
  'realms',
  'balloons',
  'kalim',
  'domino',
  'tawla',
  'qamus',
  'mind',
  'coup',
  'million',
  'rawabit',
  'khalia',
  'tartib',
  'akbar',
  'mathal',
  'ayna',
  'balad',
  'emoji',
  'arjah',
  'cross',
  'makki',
  'qaima',
  'train',
  'silsila',
  'bomb',
];

/** Games where bots can take a seat. Heads Up & Taboo need real voices. */
/** Games still being built: registered, but kept off the lists until they're finished. */
export const HIDDEN_GAMES: GameId[] = ['cross', 'qaima', 'train', 'silsila'];

export const BOT_GAMES: GameId[] = ['imposter', 'names', 'potato', 'werewolf', 'ronda', 'kanza', 'tris', 'konkan', 'unoflip', 'hez2', 'ludo', 'dama', 'estate', 'huroof', 'quiz', 'whois', 'surah', 'hajj', 'ladders', 'connect4', 'chess', 'kdab', 'wordle', 'kharbga', 'battleship', 'xo', 'sudoku', 'trivia', 'memory', 'phase10', 'scrabble', 'survey', 'dots', 'mancala', 'blocks', 'codebreak', 'boggle', 'qquote', 'tajweed', 'asma', 'steps', 'mapquiz', 'prophets', 'mosque', 'catan', 'carca', 'baloot', 'oneword', 'rami', 'touti', 'fast', 'billiards', 'codenames', 'estimate', 'truefalse', 'flags', 'qcond', 'guesswho', 'clue', 'triangles', 'realms', 'balloons', 'kalim', 'domino', 'tawla', 'qamus', 'coup', 'million', 'mathal', 'cross', 'qaima', 'train', 'silsila'];
export const MAX_BOTS = 8;
/** Games that take fewer bots than MAX_BOTS: in «الكلمات السرية» a bot can only lead a team (one per team). */
export const GAME_MAX_BOTS: Partial<Record<GameId, number>> = { codenames: 2 };

export const MIN_PLAYERS: Record<GameId, number> = {
  imposter: 3,
  names: 2,
  headsup: 2,
  taboo: 4,
  potato: 3,
  werewolf: 5,
  ronda: 2,
  kanza: 2,
  tris: 4,
  konkan: 2,
  unoflip: 2,
  hez2: 2,
  ludo: 2,
  codenames: 4,
  dama: 2,
  draw: 2,
  estate: 2,
  huroof: 2,
  quiz: 2,
  whois: 2,
  surah: 2,
  hajj: 2,
  ladders: 2,
  connect4: 2,
  chess: 2,
  kdab: 2,
  wave: 2,
  wordle: 1,
  kharbga: 2,
  battleship: 2,
  xo: 2,
  sudoku: 1,
  trivia: 2,
  memory: 2,
  phase10: 2,
  scrabble: 2,
  charades: 4,
  spy: 3,
  survey: 2,
  dots: 2,
  mancala: 2,
  blocks: 2,
  codebreak: 1,
  catan: 3,
  carca: 2,
  baloot: 4,
  touti: 4,
  teledraw: 3,
  story: 3,
  oneword: 3,
  boggle: 1,
  qquote: 1,
  tajweed: 1,
  asma: 1,
  steps: 1,
  mapquiz: 1,
  prophets: 1,
  mosque: 1,
  rami: 2,
  fast: 2,
  billiards: 2,
  estimate: 2,
  truefalse: 1,
  flags: 1,
  qcond: 2,
  guesswho: 2,
  clue: 3,
  triangles: 2,
  realms: 2,
  balloons: 2,
  kalim: 2,
  domino: 2,
  tawla: 2,
  qamus: 3,
  mind: 2,
  coup: 2,
  million: 1,
  rawabit: 1,
  khalia: 1,
  tartib: 1,
  akbar: 1,
  mathal: 1,
  ayna: 1,
  balad: 1,
  emoji: 1,
  arjah: 3,
  cross: 1,
  makki: 1,
  qaima: 1,
  train: 2,
  silsila: 1,
  bomb: 2,
};

/** Card games have a seat limit. */
export const MAX_PLAYERS: Partial<Record<GameId, number>> = { ronda: 4, kanza: 4, tris: 4, konkan: 4, unoflip: 10, hez2: 4, ludo: 4, dama: 2, draw: 12, estate: 6, huroof: 12, quiz: 12, whois: 12, surah: 12, hajj: 6, ladders: 6, connect4: 2, chess: 2, kdab: 6, wave: 12, wordle: 12, kharbga: 2, battleship: 2, xo: 2, sudoku: 12, trivia: 12, memory: 6, phase10: 6, scrabble: 4, charades: 12, spy: 10, survey: 12, dots: 4, mancala: 2, blocks: 4, codebreak: 6, boggle: 12, qquote: 12, tajweed: 12, asma: 6, steps: 12, mapquiz: 12, prophets: 8, mosque: 8, catan: 4, carca: 5, baloot: 4, teledraw: 12, story: 12, oneword: 10, rami: 6, touti: 4, fast: 12, billiards: 4, estimate: 12, truefalse: 12, flags: 12, qcond: 8, guesswho: 2, clue: 6, triangles: 4, realms: 7, balloons: 8, kalim: 6, domino: 4, tawla: 2, qamus: 10, mind: 6, coup: 6, million: 10, rawabit: 10, khalia: 10, tartib: 12, akbar: 12, mathal: 12, ayna: 12, balad: 12, emoji: 12, arjah: 12, cross: 8, makki: 12, qaima: 12, train: 5, silsila: 12, bomb: 8 };

/**
 * Games that were merged into another one: older apps may still ask for them (room create, change of
 * game, settings, tournaments). They get the game they became, with these settings applied.
 */
export const GAME_ALIASES: Record<string, { game: GameId; settings: Record<string, unknown> }> = {
  // «كلمة قرآنية» is now «كلمة السر» with the Quran words
  qword: { game: 'wordle', settings: { words: 'quran' } },
};

/** A game id sent by a phone: a current one, or an old one that became part of another game. */
export function resolveGame(v: unknown): { game: GameId; settings: Record<string, unknown> | null } | null {
  if (typeof v !== 'string') return null;
  if ((GAME_IDS as string[]).includes(v)) return { game: v as GameId, settings: null };
  const alias = Object.hasOwn(GAME_ALIASES, v) ? GAME_ALIASES[v] : undefined;
  return alias ? { game: alias.game, settings: alias.settings } : null;
}

export const DEFAULT_PORT = 5757;

export interface PlayerInfo {
  id: string;
  name: string;
  avatar: string; // emoji
  color: string; // hex
}

export interface PlayerPublic extends PlayerInfo {
  connected: boolean;
  bot?: boolean;
  /** a person who has been offline for a while: a bot is playing their turns until they're back */
  auto?: boolean;
}

export type FxKind =
  | 'join'
  | 'start'
  | 'correct'
  | 'skip'
  | 'buzz'
  | 'throw'
  | 'boom'
  | 'reveal'
  | 'death'
  | 'win'
  | 'tick'
  | 'card';

export interface Fx {
  id: number;
  kind: FxKind;
  target?: string;
}

export interface CategoryInfo {
  key: string;
  label: string;
  emoji: string;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface ImposterSettings {
  category: string; // 'random' or a category key
  imposters: number; // 0 = auto
  hintForImposter: boolean; // imposter sees the category
  rounds: number;
  /** «نوع اللعب»: «كلمة سرية» (word, the default) or «سؤال مختلف» (question). Missing = word. */
  mode?: ImposterMode;
  /** «سؤال مختلف»: seconds to type an answer (IMPOSTER_ANSWER_SECONDS) */
  answerSeconds?: number;
}

export type ImposterMode = 'word' | 'question';
export const IMPOSTER_ANSWER_SECONDS = [30, 45, 60, 90] as const;
/** «سؤال مختلف»: the longest answer (a number, a word or a short phrase). */
export const IMPOSTER_ANSWER_MAX = 40;

export interface NamesSettings {
  rounds: number;
  seconds: number;
  /** true: the first to fill everything can call «ستوب» for everyone; false: play until the timer ends */
  stop: boolean;
  /**
   * The Arabic dictionary check: off; warn (unknown words are marked for the review); strict (unknown
   * words are wrong unless most of the other players vote to keep them).
   */
  dict?: 'off' | 'warn' | 'strict';
}

export interface HeadsUpSettings {
  category: string; // 'random' or key
  seconds: number;
  turnsEach: number;
}

export interface TabooSettings {
  seconds: number;
  turnsEach: number; // turns per team
}

export interface PotatoSettings {
  rounds: number;
  minFuse: number; // seconds
  maxFuse: number; // seconds
}

export interface WerewolfSettings {
  narratorId: string | null; // null = host
  wolves: number; // 0 = auto
  seer: boolean;
  doctor: boolean;
  hunter: boolean;
  witch: boolean;
  guard: boolean;
  mayor: boolean;
  tanner: boolean;
  whitewolf: boolean; // takes one of the wolf seats (needs 2+ wolves)
  bigwolf: boolean; // takes one of the wolf seats
}

export interface RondaSettings {
  target: number;
}
export interface KanzaSettings {
  hands: number;
}
export interface TrisSettings {
  target: number;
}
export interface UnoSettings {
  target: number; // first to this many points wins
}
export interface LudoSettings {
  exitOnOne: boolean; // a 1 can also bring a piece out
  podium?: boolean; // keep playing for 2nd, 3rd… until one player is left
  quick?: boolean; // 2 pieces each instead of 4
}
export interface CodenamesSettings {
  assassin: boolean;
  /** seconds the spymaster has to give a clue (0 = no limit) */
  clueSeconds?: number;
  /** seconds the team has to reveal words after the clue (0 = no limit) */
  guessSeconds?: number;
}
/** the time limits offered for «الكلمات السرية» (0 = no limit) */
export const CODENAMES_CLUE_SECONDS = [0, 60, 90, 120, 180] as const;
export const CODENAMES_GUESS_SECONDS = [0, 60, 120, 180, 300] as const;
export interface DamaSettings {
  flyingKings: boolean;
  backCapture: boolean; // men may capture backwards
  maxCapture: boolean; // you must take the sequence that captures the most pieces
}
export interface DrawSettings {
  rounds: number;
  seconds: number;
}
export interface EstateSettings {
  startCash: number;
  rounds: number; // 0 = play until one player is left
}
export type QuizCategory = 'all' | 'quran' | 'prophets' | 'seerah' | 'companions' | 'worship' | 'history' | 'places' | 'hajj';
/** «حروف»: the question categories the host can mix (several at once; at least one). */
export type HuroofCat = 'islamic' | 'general' | 'geo' | 'nature' | 'science' | 'food' | 'sport' | 'morocco' | 'around';
export const HUROOF_CATS: { key: HuroofCat; label: string }[] = [
  { key: 'islamic', label: 'إسلامية' },
  { key: 'general', label: 'معلومات عامة' },
  { key: 'geo', label: 'جغرافيا وبلدان' },
  { key: 'nature', label: 'حيوانات ونباتات' },
  { key: 'science', label: 'علوم وجسم الإنسان' },
  { key: 'food', label: 'أكل ومطبخ' },
  { key: 'sport', label: 'رياضة' },
  { key: 'morocco', label: 'المغرب' },
  { key: 'around', label: 'أشياء من حولنا' },
];
/** The categories a «حروف» room plays with: the valid ones chosen, or إسلامية (old settings had no `cats`). */
export function huroofCats(s: { cats?: readonly unknown[] } | null | undefined): HuroofCat[] {
  const keys = HUROOF_CATS.map((c) => c.key);
  const out = keys.filter((k) => Array.isArray(s?.cats) && s.cats.includes(k));
  return out.length ? out : ['islamic'];
}
export interface HuroofSettings {
  seconds: number;
  /** the question categories mixed in this game (missing in older settings = إسلامية only) */
  cats?: HuroofCat[];
}
export interface QuizSettings {
  rounds: number;
  seconds: number;
  category: QuizCategory;
}
export interface WhoisSettings {
  rounds: number;
  /** type the name instead of choosing from options */
  typed?: boolean;
}
export interface SurahSettings {
  rounds: number;
  seconds: number;
  level: 'easy' | 'medium' | 'hard';
}
export interface HajjSettings {
  questions: boolean;
}
export interface LaddersSettings {
  exact: boolean;
}
export interface Connect4Settings {
  level: 1 | 2; // bot strength
}
export interface ChessSettings {
  level: 1 | 2;
}
export interface KdabSettings {
  maxPlay: number; // most cards in one play
}
export interface WaveSettings {
  rounds: number; // times each player gives the clue
}
/** «كلمة السر»'s word set: everyday words, words of the Quran, or a mix of both. */
export type WordleWords = 'general' | 'quran' | 'mix';
export interface WordleSettings {
  rounds: number;
  /** the word set (missing in rooms made before «كلمة قرآنية» joined this game: everyday words) */
  words?: WordleWords;
  /** race: the round ends as soon as someone finds the word (only they score) */
  race?: boolean;
  /** show the kind of a Quran word (prophet, surah, place…) during the round */
  hint?: boolean;
}
export interface KharbgaSettings {
  level: 1 | 2;
}
export interface BattleshipSettings {
  level: 1 | 2;
}
export interface XoSettings {
  level: 1 | 2;
  /** board size n×n (3, 4, 5, 6, 7 or 9); win with inRow(n) in a row */
  size?: number;
}
export interface SudokuSettings {
  level: 'easy' | 'medium' | 'hard';
}
export type TriviaCategory = 'all' | 'morocco' | 'geography' | 'science' | 'sport' | 'animals' | 'mixed';
export interface TriviaSettings {
  rounds: number;
  seconds: number;
  category: TriviaCategory;
}
export interface MemorySettings {
  pairs: number;
}
export interface KonkanSettings {
  limit: number; // eliminated at this many penalty points
}

export interface AllSettings {
  imposter: ImposterSettings;
  names: NamesSettings;
  headsup: HeadsUpSettings;
  taboo: TabooSettings;
  potato: PotatoSettings;
  werewolf: WerewolfSettings;
  ronda: RondaSettings;
  kanza: KanzaSettings;
  tris: TrisSettings;
  konkan: KonkanSettings;
  unoflip: UnoSettings;
  hez2: Hez2Settings;
  ludo: LudoSettings;
  codenames: CodenamesSettings;
  dama: DamaSettings;
  draw: DrawSettings;
  estate: EstateSettings;
  huroof: HuroofSettings;
  quiz: QuizSettings;
  whois: WhoisSettings;
  surah: SurahSettings;
  hajj: HajjSettings;
  ladders: LaddersSettings;
  connect4: Connect4Settings;
  chess: ChessSettings;
  kdab: KdabSettings;
  wave: WaveSettings;
  wordle: WordleSettings;
  kharbga: KharbgaSettings;
  battleship: BattleshipSettings;
  xo: XoSettings;
  sudoku: SudokuSettings;
  trivia: TriviaSettings;
  memory: MemorySettings;
  phase10: Phase10Settings;
  scrabble: ScrabbleSettings;
  charades: CharadesSettings;
  spy: SpySettings;
  survey: SurveySettings;
  dots: DotsSettings;
  mancala: MancalaSettings;
  blocks: BlocksSettings;
  codebreak: CodebreakSettings;
  catan: CatanSettings;
  carca: CarcaSettings;
  baloot: BalootSettings;
  touti: ToutiSettings;
  teledraw: TeledrawSettings;
  story: StorySettings;
  oneword: OnewordSettings;
  boggle: BoggleSettings;
  qquote: QquoteSettings;
  tajweed: TajweedSettings;
  asma: AsmaSettings;
  steps: StepsSettings;
  mapquiz: MapquizSettings;
  prophets: ProphetsSettings;
  mosque: MosqueSettings;
  rami: RamiSettings;
  fast: FastSettings;
  billiards: BilliardsSettings;
  estimate: EstimateSettings;
  truefalse: TruefalseSettings;
  flags: FlagsSettings;
  qcond: QcondSettings;
  guesswho: GuesswhoSettings;
  clue: ClueSettings;
  triangles: TrianglesSettings;
  realms: RealmsSettings;
  balloons: BalloonsSettings;
  kalim: KalimSettings;
  domino: DominoSettings;
  tawla: TawlaSettings;
  qamus: QamusSettings;
  mind: MindSettings;
  coup: CoupSettings;
  million: MillionSettings;
  rawabit: RawabitSettings;
  khalia: KhaliaSettings;
  tartib: TartibSettings;
  akbar: AkbarSettings;
  mathal: MathalSettings;
  ayna: AynaSettings;
  balad: BaladSettings;
  emoji: EmojiSettings;
  arjah: ArjahSettings;
  cross: CrossSettings;
  makki: MakkiSettings;
  qaima: QaimaSettings;
  train: TrainSettings;
  silsila: SilsilaSettings;
  bomb: BombSettings;
}

export const DEFAULT_SETTINGS: AllSettings = {
  imposter: { category: 'random', imposters: 0, hintForImposter: true, rounds: 5, mode: 'word', answerSeconds: 60 },
  names: { rounds: 5, seconds: 90, stop: true, dict: 'strict' },
  headsup: { category: 'random', seconds: 60, turnsEach: 1 },
  taboo: { seconds: 60, turnsEach: 3 },
  potato: { rounds: 5, minFuse: 15, maxFuse: 45 },
  werewolf: { narratorId: null, wolves: 0, seer: true, doctor: true, hunter: false, witch: false, guard: false, mayor: false, tanner: false, whitewolf: false, bigwolf: false },
  ronda: { target: 41 },
  kanza: { hands: 3 },
  tris: { target: 31 },
  konkan: { limit: 100 },
  unoflip: { target: 250 },
  hez2: HEZ2_DEFAULTS,
  ludo: { exitOnOne: false, podium: false, quick: false },
  codenames: { assassin: true, clueSeconds: 0, guessSeconds: 0 },
  dama: { flyingKings: true, backCapture: true, maxCapture: true },
  draw: { rounds: 2, seconds: 80 },
  estate: { startCash: 1500, rounds: 15 },
  huroof: { seconds: 20, cats: ['islamic'] },
  quiz: { rounds: 10, seconds: 15, category: 'all' },
  whois: { rounds: 8, typed: false },
  surah: { rounds: 10, seconds: 20, level: 'easy' },
  hajj: { questions: true },
  ladders: { exact: true },
  connect4: { level: 1 },
  chess: { level: 1 },
  kdab: { maxPlay: 4 },
  wave: { rounds: 1 },
  wordle: { rounds: 3, words: 'general', race: false, hint: true },
  kharbga: { level: 1 },
  battleship: { level: 1 },
  xo: { level: 1, size: 3 },
  sudoku: { level: 'easy' },
  trivia: { rounds: 10, seconds: 15, category: 'all' },
  memory: { pairs: 10 },
  phase10: PHASE10_DEFAULTS,
  scrabble: SCRABBLE_DEFAULTS,
  charades: CHARADES_DEFAULTS,
  spy: SPY_DEFAULTS,
  survey: SURVEY_DEFAULTS,
  dots: DOTS_DEFAULTS,
  mancala: MANCALA_DEFAULTS,
  blocks: BLOCKS_DEFAULTS,
  codebreak: CODEBREAK_DEFAULTS,
  catan: CATAN_DEFAULTS,
  carca: CARCA_DEFAULTS,
  baloot: BALOOT_DEFAULTS,
  touti: TOUTI_DEFAULTS,
  teledraw: TELEDRAW_DEFAULTS,
  story: STORY_DEFAULTS,
  oneword: ONEWORD_DEFAULTS,
  boggle: BOGGLE_DEFAULTS,
  qquote: QQUOTE_DEFAULTS,
  tajweed: TAJWEED_DEFAULTS,
  asma: ASMA_DEFAULTS,
  steps: STEPS_DEFAULTS,
  mapquiz: MAPQUIZ_DEFAULTS,
  prophets: PROPHETS_DEFAULTS,
  mosque: MOSQUE_DEFAULTS,
  rami: RAMI_DEFAULTS,
  fast: FAST_DEFAULTS,
  billiards: BILLIARDS_DEFAULTS,
  estimate: ESTIMATE_DEFAULTS,
  truefalse: TRUEFALSE_DEFAULTS,
  flags: FLAGS_DEFAULTS,
  qcond: QCOND_DEFAULTS,
  guesswho: GUESSWHO_DEFAULTS,
  clue: CLUE_DEFAULTS,
  triangles: TRIANGLES_DEFAULTS,
  realms: REALMS_DEFAULTS,
  balloons: BALLOONS_DEFAULTS,
  kalim: KALIM_DEFAULTS,
  domino: DOMINO_DEFAULTS,
  tawla: TAWLA_DEFAULTS,
  qamus: QAMUS_DEFAULTS,
  mind: MIND_DEFAULTS,
  coup: COUP_DEFAULTS,
  million: MILLION_DEFAULTS,
  rawabit: RAWABIT_DEFAULTS,
  khalia: KHALIA_DEFAULTS,
  tartib: TARTIB_DEFAULTS,
  akbar: AKBAR_DEFAULTS,
  mathal: MATHAL_DEFAULTS,
  ayna: AYNA_DEFAULTS,
  balad: BALAD_DEFAULTS,
  emoji: EMOJI_DEFAULTS,
  arjah: ARJAH_DEFAULTS,
  cross: CROSS_DEFAULTS,
  makki: MAKKI_DEFAULTS,
  qaima: QAIMA_DEFAULTS,
  train: TRAIN_DEFAULTS,
  silsila: SILSILA_DEFAULTS,
  bomb: BOMB_DEFAULTS,
};

/* ------------------------------------------------------------------ */
/* Game views (personalised per player by the server)                  */
/* ------------------------------------------------------------------ */

export type ImposterSecret =
  | { role: 'civilian'; word: string; category: string }
  | { role: 'imposter'; category: string | null; partners: string[] }
  /** «سؤال مختلف»: the same shape for everyone, the imposter included (who doesn't know) */
  | { role: 'question'; question: string };

export interface ImposterResult {
  votes: Record<string, string>;
  accused: string | null;
  imposters: string[];
  word: string;
  caught: boolean;
  /** the caught imposter's guess; '' = missed (time ran out or left) */
  guessed: string | null;
  guessCorrect: boolean | null;
  winners: 'civilians' | 'imposters';
  /** «سؤال مختلف»: the real question and the imposter's */
  question?: string;
  imposterQuestion?: string;
}

export interface ImposterView {
  game: 'imposter';
  /** «سؤال مختلف»: answer (type an answer to your question) → answers (all revealed, the real question shown) → vote → result */
  phase: 'reveal' | 'clues' | 'answer' | 'answers' | 'vote' | 'guess' | 'result' | 'final';
  mode: ImposterMode;
  round: number;
  totalRounds: number;
  participants: string[];
  secret: ImposterSecret | null;
  ready: string[];
  order: string[]; // clue order, starts with starter
  voted: string[];
  myVote: string | null;
  guessOptions: string[] | null; // only for the caught imposter
  guesserId: string | null;
  /** when the last-chance guess runs out */
  guessEndsAt: number | null;
  /** clues "said" by bots (shown on screen) */
  botClues: Record<string, string>;
  result: ImposterResult | null;
  scores: Record<string, number>;
  /** «سؤال مختلف»: who has answered (never what, before the reveal) */
  answered: string[];
  myAnswer: string | null;
  /** «سؤال مختلف»: everyone's answers ('' = none in time), only once revealed */
  answers: Record<string, string>;
  /** «سؤال مختلف»: the real question, only once the answers are revealed */
  question: string | null;
  answerEndsAt: number | null;
  answerSeconds: number;
}

export const NAMES_CATEGORIES: CategoryInfo[] = [
  { key: 'boy', label: 'اسم ولد', emoji: '👦' },
  { key: 'girl', label: 'اسم بنت', emoji: '👧' },
  { key: 'animal', label: 'حيوان', emoji: '🐾' },
  { key: 'plant', label: 'نبات / فاكهة / خضراوات', emoji: '🌿' },
  { key: 'thing', label: 'جماد', emoji: '🪑' },
  { key: 'country', label: 'بلاد / مدينة', emoji: '🌍' },
  { key: 'job', label: 'مهنة', emoji: '👷' },
];

export type NamesVerdict = 'ok' | 'empty' | 'letter' | 'rejected' | 'unknown';

export interface NamesCell {
  text: string;
  verdict: NamesVerdict;
  rejects: string[]; // who voted it invalid
  points: number | null; // filled in after scoring
  /** not in the dictionary (when the check is on) */
  unknown: boolean;
  /** strict check: who voted to keep an unknown word */
  keeps: string[];
}

export interface NamesView {
  game: 'names';
  phase: 'spin' | 'write' | 'stopping' | 'review' | 'results' | 'final';
  participants: string[];
  round: number;
  totalRounds: number;
  letter: string;
  endsAt: number | null;
  stoppedBy: string | null;
  /** players who finished and are waiting for the timer (when «ستوب» is off) */
  done: string[];
  /** how many categories each player has filled (live progress) */
  progress: Record<string, number>;
  myAnswers: Record<string, string>;
  /** my boxes whose word the dictionary doesn't know (live while writing) */
  myUnknown: string[];
  dict: 'off' | 'warn' | 'strict';
  /** everyone's answers: only after writing is over */
  board: Record<string, Record<string, NamesCell>> | null;
  roundPoints: Record<string, number> | null;
  scores: Record<string, number>;
}

export interface HeadsUpView {
  game: 'headsup';
  phase: 'ready' | 'countdown' | 'play' | 'turnEnd' | 'final';
  participants: string[];
  guesserId: string;
  turn: number; // 1-based
  totalTurns: number;
  category: CategoryInfo;
  endsAt: number | null;
  card: { index: number; word: string } | null;
  history: { word: string; ok: boolean }[];
  scores: Record<string, number>;
}

export type TabooCardResult = 'ok' | 'skip' | 'buzz';

export interface TabooView {
  game: 'taboo';
  phase: 'teams' | 'ready' | 'play' | 'turnEnd' | 'final';
  participants: string[];
  teams: [string[], string[]];
  activeTeam: 0 | 1;
  describerId: string;
  turn: number; // 1-based
  totalTurns: number;
  endsAt: number | null;
  /** null for the describer's team-mates (they must guess) */
  card: { index: number; word: string; forbidden: string[] } | null;
  history: { word: string; result: TabooCardResult }[];
  teamScores: [number, number];
  /** the last «قالها» can still be taken back (by the describer or the host) */
  undoBuzz: { by: string } | null;
  /** short message for everyone (an undo, or a player moved to balance the teams) */
  notice: string | null;
}

export interface PotatoView {
  game: 'potato';
  phase: 'ready' | 'play' | 'boom' | 'final';
  participants: string[];
  holderId: string;
  fromId: string | null;
  round: number;
  totalRounds: number;
  category: string;
  startedAt: number | null;
  passes: number;
  burns: Record<string, number>;
  loserId: string | null;
  /** word said by a bot when it threw the potato */
  lastWord: { by: string; word: string } | null;
  /** who the holder may throw to right now (only sent to the holder) */
  targets: string[];
}

export type WolfRole = 'wolf' | 'villager' | 'seer' | 'doctor' | 'hunter' | 'witch' | 'guard' | 'tanner' | 'whitewolf' | 'bigwolf';
export const WOLF_ROLES: WolfRole[] = ['wolf', 'bigwolf', 'whitewolf'];
export const isWolfRole = (r: WolfRole | null | undefined) => r === 'wolf' || r === 'bigwolf' || r === 'whitewolf';

export type WolfStep =
  | 'sleep'
  | 'wolves'
  | 'bigwolf'
  | 'whitewolf'
  | 'guard'
  | 'doctor'
  | 'seer'
  | 'witch'
  | 'wake'
  | 'announce'
  | 'hunter'
  | 'mayor'
  | 'vote';

export type WolfPickStep = 'wolves' | 'bigwolf' | 'whitewolf' | 'guard' | 'doctor' | 'seer' | 'witch' | 'hunter' | 'mayor';

export interface WolfNarratorInfo {
  roles: Record<string, WolfRole>;
  step: WolfStep;
  steps: WolfStep[];
  wolvesTarget: string | null;
  bigwolfTarget: string | null;
  whitewolfTarget: string | null;
  guardSave: string | null;
  lastGuard: string | null; // the guard can't protect the same player two nights running
  doctorSave: string | null;
  seerCheck: string | null;
  witchHeal: string | null; // one of tonight's victims
  witchPoison: string | null;
  healUsed: boolean;
  poisonUsed: boolean;
  hunterTarget: string | null;
  hunterAfter: 'night' | 'day' | null; // when the hunter step was triggered
  mayorPick: string | null;
  log: string[];
  /** which of the current picks were made automatically for bots */
  auto: Partial<Record<WolfPickStep, boolean>>;
}

export type WolfWinner = 'wolves' | 'village' | 'tanner' | 'whitewolf';

export interface WerewolfView {
  game: 'werewolf';
  phase: 'night' | 'day' | 'over';
  narratorId: string;
  participants: string[];
  day: number;
  alive: Record<string, boolean>;
  myRole: WolfRole | null;
  wolfPack: string[] | null;
  lastDeaths: string[] | null;
  lastEliminated: string | null | undefined; // undefined = no vote yet today
  winner: WolfWinner | null;
  mayorId: string | null;
  revealed: Record<string, WolfRole> | null;
  narrator: WolfNarratorInfo | null;
  roleCounts: Partial<Record<WolfRole, number>>;
  /** bots accusing someone during the day */
  accusations: { by: string; target: string }[];
  /** why the game ended early (e.g. the narrator left) */
  endNote: string | null;
}

/* ------------------------------------------------------------------ */
/* Card games                                                          */
/* ------------------------------------------------------------------ */

/** A player, or a team of partners, who score together. */
export interface CardSide {
  key: string;
  members: string[];
}

export interface FeedItem {
  id: number;
  text: string;
  by?: string;
  points?: number;
}

export interface RondaView {
  game: 'ronda';
  phase: 'play' | 'handEnd' | 'final';
  participants: string[];
  sides: CardSide[];
  turn: string;
  dealer: string;
  hand: number;
  deal: number;
  myHand: Card[];
  handCounts: Record<string, number>;
  table: Card[];
  deckLeft: number;
  capturedCounts: Record<string, number>; // side -> cards captured this hand
  scores: Record<string, number>; // side -> points
  target: number;
  lastPlay: { by: string; card: Card; took: Card[] } | null;
  /** big banner on the felt (روندا، ترينكا، ميسا، دقة…); a new id = a new announcement */
  announce: { by: string | null; text: string; id: number } | null;
  /** a side scores one point per captured card above this (20 with two sides, 13 with three) */
  base: number;
  feed: FeedItem[];
  handSummary: { side: string; cards: number; points: number }[] | null;
  winner: string | null; // side key
}

export interface KanzaView {
  game: 'kanza';
  phase: 'play' | 'handEnd' | 'final';
  participants: string[];
  sides: CardSide[];
  turn: string;
  dealer: string;
  hand: number;
  totalHands: number;
  myHand: Card[];
  handCounts: Record<string, number>;
  table: Card[];
  deckLeft: number;
  capturedCounts: Record<string, number>;
  scores: Record<string, number>;
  lastPlay: { by: string; card: Card; took: Card[] } | null;
  feed: FeedItem[];
  handSummary: { side: string; cards: number; golds: Card[]; points: number }[] | null;
  winner: string | null;
}

export interface TrisView {
  game: 'tris';
  phase: 'play' | 'trickEnd' | 'handEnd' | 'final';
  participants: string[];
  sides: CardSide[];
  turn: string;
  dealer: string;
  hand: number;
  myHand: Card[];
  playable: string[]; // ids of cards I'm allowed to play now
  handCounts: Record<string, number>;
  trick: { by: string; card: Card }[];
  trickWinner: string | null;
  /** the previous, already collected trick (shown until the next trick starts) */
  lastTrick: { cards: { by: string; card: Card }[]; winner: string } | null;
  trickNo: number; // 1..10
  tricksWon: Record<string, number>; // side -> tricks
  handThirds: Record<string, number>; // side -> points in thirds (hand so far)
  scores: Record<string, number>;
  target: number;
  handSummary: { side: string; points: number }[] | null;
  winner: string | null;
}

export interface KonkanMeld {
  id: number;
  owner: string;
  cards: Card[];
}

export interface KonkanView {
  game: 'konkan';
  phase: 'play' | 'handEnd' | 'final';
  participants: string[];
  active: string[]; // not eliminated
  turn: string;
  step: 'draw' | 'play';
  hand: number;
  myHand: Card[];
  handCounts: Record<string, number>;
  discardTop: Card | null;
  /** the card the current player took from the discard pile this turn (it can't go straight back) */
  takenDiscard: string | null;
  stockLeft: number;
  melds: KonkanMeld[];
  scores: Record<string, number>; // penalty points (lower is better)
  limit: number;
  feed: FeedItem[];
  handWinner: string | null;
  handSummary: { id: string; points: number; cards: Card[] }[] | null;
  winner: string | null;
}

export interface UnoHandCard {
  id: string;
  face: UnoFace; // the side facing me
}

export interface UnoView {
  game: 'unoflip';
  phase: 'play' | 'roundEnd' | 'final';
  participants: string[];
  round: number;
  target: number;
  side: UnoSide;
  turn: string;
  dir: 1 | -1;
  top: UnoFace; // discard pile, active side
  /** id of the card on top of the discard pile (the same id it had in its player's hand), so the app can make it glide there */
  topId?: string;
  color: UnoColor; // colour in play (chosen colour after a wild)
  deckLeft: number;
  deckTop: UnoFace | null; // the draw pile shows the other side of its top card
  myHand: UnoHandCard[];
  playable: string[];
  /** Everyone sees the other side of the other players' cards (never their own). */
  backs: Record<string, UnoFace[]>;
  handCounts: Record<string, number>;
  choosing: string | null; // player picking a colour
  drawn: string | null; // card I just drew and may play
  canPass: boolean;
  unoSaid: string[];
  catchable: string | null; // has one card and forgot to say UNO
  scores: Record<string, number>;
  lastPlay: { by: string; face: UnoFace } | null;
  feed: FeedItem[];
  roundSummary: { winner: string; points: number; hands: { id: string; faces: UnoFace[]; points: number }[] } | null;
  winner: string | null;
}

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export interface LudoView {
  game: 'ludo';
  phase: 'roll' | 'move' | 'final';
  seats: { id: string; color: LudoColor }[];
  /** Progress of each token: -1 = at home base, 0..50 = on the track, 51..55 = home column, 56 = finished. */
  tokens: Record<string, number[]>;
  turn: string;
  dice: number | null;
  rollId: number;
  movable: number[]; // token indices I can move with this roll
  /** When my only legal move will be played for me (server time), or null. */
  autoAt: number | null;
  lastMove: { by: string; token: number; from: number; to: number; captured: string[] } | null;
  winner: string | null;
  ranking: string[];
  feed: FeedItem[];
}

export type CodeColor = 'red' | 'blue' | 'neutral' | 'assassin';

export interface CodenamesView {
  game: 'codenames';
  phase: 'teams' | 'clue' | 'guess' | 'final';
  participants: string[];
  teams: { red: string[]; blue: string[] };
  spymasters: { red: string | null; blue: string | null };
  myTeam: 'red' | 'blue' | null;
  amSpymaster: boolean;
  words: string[];
  /** Colours I may see: everything for spymasters, revealed cards for everyone else. */
  colors: (CodeColor | null)[];
  revealed: boolean[];
  turn: 'red' | 'blue';
  clue: { word: string; n: number } | null;
  guessesLeft: number;
  proposals: Record<string, number>; // player -> card they point at
  left: { red: number; blue: number };
  winner: 'red' | 'blue' | null;
  reason: 'words' | 'assassin' | null;
  log: { team: 'red' | 'blue'; clue: string; n: number; picks: { word: string; color: CodeColor }[] }[];
  /** why the last turn just ended (shown for a few seconds) */
  turnNote: { team: 'red' | 'blue'; text: string } | null;
  /** team screen message, e.g. after a team lost its players */
  notice: string | null;
  /** when the clue / guessing time runs out (null = no limit), and that phase's full time (s) */
  endsAt?: number | null;
  seconds?: number;
}

/** Board: 64 squares, row-major from the top. 1 / 2 = white man / king, -1 / -2 = black man / king. */
export interface DamaView {
  game: 'dama';
  phase: 'play' | 'final';
  white: string; // moves first, starts at the bottom
  black: string;
  board: number[];
  turn: 'white' | 'black';
  myColor: 'white' | 'black' | null;
  /** My legal moves this turn (full capture sequences). */
  moves: { from: number; path: number[]; captures: number[] }[];
  lastMove: { from: number; path: number[]; captures: number[] } | null;
  counts: { white: number; black: number };
  winner: 'white' | 'black' | 'draw' | null;
  reason: 'pieces' | 'blocked' | 'resign' | 'draw' | 'left' | null;
  score: Record<string, number>; // games won in this series
}

export interface DrawStroke {
  id: string;
  c: string; // colour
  w: number; // width in canvas units (canvas is 1000 wide)
  pts: number[]; // x0,y0,x1,y1… in 0..1000
}

export interface DrawView {
  game: 'draw';
  phase: 'choose' | 'draw' | 'reveal' | 'final';
  participants: string[];
  round: number;
  totalRounds: number;
  drawer: string;
  options: string[] | null; // the drawer's 3 choices
  word: string | null; // drawer, people who guessed it, and everyone at reveal
  hint: string; // e.g. "ط _ _ _ ن"
  endsAt: number | null;
  total: number;
  strokes: DrawStroke[];
  guessed: string[];
  close: boolean; // my last guess was close
  feed: { id: number; by: string; text: string; ok?: boolean }[];
  scores: Record<string, number>;
  roundPoints: Record<string, number> | null;
}

export interface EstatePlayer {
  id: string;
  pos: number;
  cash: number;
  jail: number | null; // turns spent in jail
  jailCards: number;
  bankrupt: boolean;
}

export interface EstateTrade {
  id: number;
  from: string;
  to: string;
  give: { props: number[]; cash: number };
  get: { props: number[]; cash: number };
  endsAt: number; // the offer expires (server time)
}

export interface EstateAuction {
  sq: number;
  price: number; // highest bid so far (0 = no bid yet)
  leader: string | null;
  endsAt: number; // restarts on every bid
  out: string[]; // players who withdrew
}

export interface EstateView {
  game: 'estate';
  phase: 'roll' | 'buy' | 'auction' | 'manage' | 'debt' | 'final';
  players: EstatePlayer[];
  turn: string;
  dice: number[] | null;
  rollId: number;
  props: Record<number, { owner: string; houses: number; mortgaged: boolean }>;
  buy: number | null;
  card: { id: number; deck: 'luck' | 'family'; text: string; by: string } | null;
  debt: { amount: number; to: string | null } | null;
  trade: EstateTrade | null;
  auction: EstateAuction | null;
  round: number;
  maxRounds: number;
  worth: Record<string, number>;
  winner: string | null;
  feed: FeedItem[];
}

export interface McqResult {
  id: string;
  choice: number | null;
  correct: boolean;
  points: number;
  /** typed answers: what the player wrote (their last try if none was right) */
  text?: string | null;
}

/** Shared by «مسابقة إسلامية» and «من أي سورة؟». */
export interface McqView {
  game: 'quiz' | 'surah' | 'trivia';
  phase: 'ask' | 'reveal' | 'final';
  round: number;
  rounds: number;
  label: string; // category, or the level for the surah game
  text: string; // the question, or the verse
  options: string[];
  endsAt: number | null;
  answered: string[];
  myAnswer: number | null;
  correct: number | null; // revealed
  ref: string | null; // e.g. «البقرة — الآية 255»
  results: McqResult[] | null;
  scores: Record<string, number>;
}

export interface WhoisView {
  game: 'whois';
  phase: 'ask' | 'reveal' | 'final';
  round: number;
  rounds: number;
  label: string; // نبي / صحابي / مكان…
  clues: string[]; // revealed so far
  totalClues: number;
  options: string[];
  nextClueAt: number | null;
  endsAt: number | null;
  guessed: string[];
  myGuess: number | null;
  answer: number | null; // revealed
  results: McqResult[] | null;
  scores: Record<string, number>;
  /** typed answers instead of options (options is then empty while asking) */
  typed: boolean;
  /** revealed with the answer */
  answerName: string | null;
  /** typed: my wrong tries this round */
  myTries: string[];
  /** typed: I tried at this clue and missed — wait for the next one */
  locked: boolean;
}

export type HuroofTeam = 'red' | 'green';
export interface HuroofView {
  game: 'huroof';
  /** question: anyone allowed can press the buzzer; answer: the player who buzzed types the answer */
  phase: 'pick' | 'question' | 'answer' | 'final';
  teams: Record<HuroofTeam, string[]>;
  cells: { letter: string; owner: HuroofTeam | null }[];
  turn: HuroofTeam; // team choosing the next letter
  cell: number | null;
  /**
   * The question as revealed so far: `text` = only the words shown (the rest stays on the server),
   * `hidden` = words still to come, `frozen` = someone pressed the buzzer before the end (the reveal
   * stopped there). A wrong answer shows the rest at once.
   */
  question: { text: string; hidden: number; frozen: boolean; /** the question's category (label), e.g. «رياضة» */ cat?: string } | null;
  canAnswer: HuroofTeam[];
  buzzer: string | null;
  endsAt: number | null;
  timerTotal: number; // ms, for the timer bar
  wrong: { by: string; text: string; id: number } | null; // the last wrong answer typed
  /** the question settled last, its whole text (`question`, optional for older servers) and answer */
  last: { cell: number; team: HuroofTeam | null; answer: string; question?: string; by: string | null; id: number } | null;
  winner: HuroofTeam | null;
  winPath: number[] | null;
  feed: FeedItem[];
}

export interface BoardCard {
  id: number;
  by: string;
  kind: 'station' | 'event' | 'ladder' | 'snake' | 'right' | 'wrong' | 'zad';
  title: string;
  text: string;
  day?: string;
}

export interface HajjZad {
  id: number;
  kind: ZadKind;
}

export interface HajjView {
  game: 'hajj';
  /** quiz: a station question everyone answers */
  phase: 'roll' | 'question' | 'quiz' | 'final';
  players: { id: string; pos: number; hand: number; shield: boolean }[];
  turn: string;
  dice: number | null;
  rollId: number;
  landing: number | null; // where the last roll took the pilgrim (die + cards), before any event
  card: BoardCard | null;
  question: { text: string; options: string[]; endsAt: number; for: string } | null;
  quiz: {
    station: string;
    text: string;
    options: string[];
    endsAt: number | null;
    answered: string[];
    myAnswer: number | null;
    correct: number | null; // shown once everyone answered
    results: { id: string; correct: boolean; first: boolean }[] | null;
  } | null;
  myHand: HajjZad[];
  played: { by: string; kind: ZadKind; target: string | null; id: number } | null;
  mods: { bonus: number; pass: boolean; again: boolean; played: boolean };
  winner: string | null;
  order: string[] | null; // finishing order (furthest first, ties: who got there first), at the end
  feed: FeedItem[];
}

export interface LaddersView {
  game: 'ladders';
  phase: 'roll' | 'final';
  players: { id: string; pos: number }[];
  turn: string;
  dice: number | null;
  rollId: number;
  card: BoardCard | null;
  winner: string | null;
  order: string[] | null; // finishing order (furthest first, ties: who got there first), at the end
  feed: FeedItem[];
}

export interface Connect4View {
  game: 'connect4';
  phase: 'play' | 'final';
  red: string; // disc 1, plays first (alternates between games)
  yellow: string; // disc 2
  board: number[]; // 42 cells, row 0 on top
  turn: 1 | 2;
  myDisc: 1 | 2 | null;
  last: number | null;
  line: number[] | null;
  winner: 1 | 2 | 'draw' | null;
  score: Record<string, number>;
}

export interface ChessView {
  game: 'chess';
  phase: 'play' | 'final';
  white: string;
  black: string;
  board: string[]; // 64, index 0 = a8
  turn: 'w' | 'b';
  myColor: 'w' | 'b' | null;
  moves: { from: number; to: number; promo?: 'q' | 'r' | 'b' | 'n' }[];
  lastMove: { from: number; to: number } | null;
  check: boolean;
  captured: { w: string[]; b: string[] }; // pieces each side has taken
  winner: 'w' | 'b' | 'draw' | null;
  reason: 'mate' | 'stalemate' | 'fifty' | 'repetition' | 'material' | 'resign' | 'left' | null;
  feed: FeedItem[];
  score: Record<string, number>; // games won in this series
}

export interface KdabView {
  game: 'kdab';
  phase: 'play' | 'final';
  order: string[];
  turn: string;
  myHand: Card[];
  handCounts: Record<string, number>;
  pileCount: number;
  rank: number | null; // the rank everyone is claiming in this pile
  last: { id: number; by: string; count: number; rank: number } | null;
  canCall: boolean;
  reveal: { id: number; caller: string; player: string; cards: Card[]; truthful: boolean; taker: string } | null;
  finishing: { id: string; until: number } | null;
  winner: string | null;
  feed: FeedItem[];
}

export interface WaveView {
  game: 'wave';
  phase: 'clue' | 'guess' | 'reveal' | 'final';
  round: number;
  rounds: number;
  psychic: string;
  spectrum: [string, string];
  target: number | null; // 0..100, hidden from guessers until the reveal
  clue: string | null;
  /** whose clue time ran out this round (the clue moved on to `psychic`) */
  passedFrom: string | null;
  locked: string[];
  myGuess: number | null;
  guesses: Record<string, number> | null; // revealed
  results: { id: string; guess: number | null; points: number }[] | null;
  endsAt: number | null;
  scores: Record<string, number>;
}

export type WordleMark = 'g' | 'y' | 'x';
export interface WordleView {
  game: 'wordle';
  phase: 'play' | 'reveal' | 'final';
  round: number;
  rounds: number;
  length: number;
  maxTries: number;
  /** the word set (the fields marked «newer» are missing from older servers) */
  words?: WordleWords;
  /** newer: race mode */
  race?: boolean;
  /** newer: the word comes from the Quran (null: not said — a mix without hints, during the round) */
  quran?: boolean | null;
  /** newer: the kind of a Quran word (null when hints are off, or for an everyday word) */
  hint?: string | null;
  myRows: { guess: string; marks: WordleMark[] }[];
  others: { id: string; rows: WordleMark[][]; solved: boolean; done: boolean }[];
  /** revealed (to me once I'm done, to everyone after the round): the word as it is written */
  answer: string | null;
  /** newer: after the round, a verse where a Quran word appears */
  verse?: { text: string; ref: string } | null;
  endsAt: number | null;
  /** newer: total of the current timer, for the timer bar */
  timerTotal?: number;
  /** half of the players are done, so the round time was cut to a minute */
  hurried: boolean;
  results: { id: string; tries: number | null; points: number }[] | null;
  scores: Record<string, number>;
}

export interface KharbgaView {
  game: 'kharbga';
  phase: 'place' | 'move' | 'final';
  attacker: string; // side 1, places and moves first
  defender: string; // side 2
  board: number[]; // 49 cells: 0 empty, 1 attacker, 2 defender
  turn: 1 | 2;
  mySide: 1 | 2 | null;
  toPlace: Record<1 | 2, number>;
  canUndo: boolean; // I placed a piece this turn and may take it back
  chainFrom: number | null; // the piece that must keep capturing
  moves: { from: number; to: number }[]; // my legal moves (movement phase)
  last: { from: number; to: number; captured: number[] } | null;
  counts: Record<1 | 2, number>;
  winner: 1 | 2 | 'draw' | null;
  reason: 'captured' | 'blocked' | 'limit' | 'resign' | 'left' | null;
  feed: FeedItem[];
  score: Record<string, number>; // games won in this series
}

export type ShotResult = 'hit' | 'miss';
export interface BattleshipView {
  game: 'battleship';
  phase: 'setup' | 'play' | 'final';
  players: [string, string];
  ready: string[];
  turn: string;
  myFleet: { cells: number[]; sunk: boolean }[];
  myShots: Record<number, ShotResult>; // on the enemy grid
  enemyShots: Record<number, ShotResult>; // on my grid
  enemySunk: number[][];
  enemyFleetLeft: number;
  last: { by: string; cell: number; result: ShotResult | 'sunk'; id: number } | null;
  winner: string | null;
  enemyFleet: number[][] | null; // revealed at the end
  score: Record<string, number>; // games won in this series
  resigned: boolean; // the loser resigned or left
}

export interface XoView {
  game: 'xo';
  phase: 'play' | 'final';
  x: string;
  o: string;
  board: ('' | 'x' | 'o')[];
  /** board size (n×n) and how many in a row win */
  size: number;
  inRow: number;
  /** the last cell played (highlighted on big boards) */
  last: number | null;
  turn: 'x' | 'o';
  mine: 'x' | 'o' | null;
  line: number[] | null;
  winner: 'x' | 'o' | 'draw' | null;
  score: Record<string, number>;
}

export interface SudokuView {
  game: 'sudoku';
  phase: 'play' | 'final';
  level: 'easy' | 'medium' | 'hard';
  givens: number[]; // 81, 0 = empty
  myGrid: number[]; // givens + my correct entries
  mistakes: number;
  wrong: { cell: number; value: number; id: number } | null; // my last wrong entry (flash)
  progress: Record<string, number>; // cells filled correctly (out of the empty cells)
  empty: number;
  finished: { id: string; ms: number; mistakes: number }[];
  startedAt: number;
  scores: Record<string, number>;
}

export interface MemoryView {
  game: 'memory';
  phase: 'play' | 'final';
  order: string[];
  turn: string;
  size: number;
  faces: (string | null)[]; // visible faces (matched or currently turned over)
  owners: (string | null)[]; // who matched each card
  flipped: number[];
  peek: boolean; // a failed pair is being shown before turning back
  pairs: Record<string, number>;
  winner: string[] | null;
}

export type GameView =
  | ImposterView
  | NamesView
  | HeadsUpView
  | TabooView
  | PotatoView
  | WerewolfView
  | RondaView
  | KanzaView
  | TrisView
  | KonkanView
  | UnoView
  | Hez2View
  | LudoView
  | CodenamesView
  | DamaView
  | DrawView
  | EstateView
  | McqView
  | WhoisView
  | HuroofView
  | HajjView
  | LaddersView
  | Connect4View
  | ChessView
  | KdabView
  | WaveView
  | WordleView
  | KharbgaView
  | BattleshipView
  | XoView
  | SudokuView
  | MemoryView
  | Phase10View
  | ScrabbleView
  | CharadesView
  | SpyView
  | SurveyView
  | DotsView
  | MancalaView
  | BlocksView
  | CodebreakView
  | CatanView
  | CarcaView
  | BalootView
  | ToutiView
  | TeledrawView
  | StoryView
  | OnewordView
  | BoggleView
  | QquoteView
  | TajweedView
  | AsmaView
  | StepsView
  | MapquizView
  | ProphetsView
  | MosqueView
  | RamiView
  | FastView
  | BilliardsView
  | EstimateView
  | TruefalseView
  | FlagsView
  | QcondView
  | GuesswhoView
  | ClueView
  | TrianglesView
  | RealmsView
  | BalloonsView
  | KalimView
  | DominoView
  | TawlaView
  | QamusView
  | MindView
  | CoupView
  | MillionView
  | RawabitView
  | KhaliaView
  | TartibView
  | AkbarView
  | MathalView
  | AynaView
  | BaladView
  | EmojiView
  | ArjahView
  | CrossView
  | MakkiView
  | QaimaView
  | TrainView
  | SilsilaView
  | BombView;

/* ------------------------------------------------------------------ */
/* Room                                                                */
/* ------------------------------------------------------------------ */

export interface RoomView {
  code: string;
  hostId: string;
  me: string;
  game: GameId;
  status: 'lobby' | 'playing';
  players: PlayerPublic[];
  settings: AllSettings;
  view: GameView | null;
  fx: Fx | null;
  categories: { imposter: CategoryInfo[]; headsup: CategoryInfo[] };
  /** true while the game is waiting for me to play (drives the your-turn alert) */
  myTurn: boolean;
  /** who the game is waiting for right now (turn-based games; empty when everyone plays at once or unknown) */
  turn: string[];
  /** how fast bots play, set by the host */
  pace: Pace;
  /** how strong bots play, set by the host (optional: an older server doesn't send it) */
  botLevel?: BotLevel;
  /** the last move announced by the game (see GameCtx.say), for the strip under the turn bar */
  said: Said | null;
  /** who is in the room's voice chat (connected players only) */
  voice: VoiceMember[];
  /** a room started from a group with «لنلعب»: who we wait for (see RoomGroup) */
  group?: RoomGroup;
  /** a tournament being set up in the waiting room, played, or just finished (see src/shared/tournament.ts) */
  tournament?: TournamentView | null;
}

/* ------------------------------------------------------------------ */
/* Groups («المجموعات»)                                                 */
/* ------------------------------------------------------------------ */

export interface GroupMember extends PlayerInfo {
  /**
   * the app is open on that phone right now and the person is visible (false for «غير مرئي»);
   * kept for older apps, which only know this
   */
  online: boolean;
  /** their status as the others see it (an older server doesn't send it: then `online` says it all) */
  status?: MemberStatus;
  /** «في لعبة»: in a room that is playing right now (never sent for an invisible person) */
  playing?: boolean;
}

export interface GroupInfo {
  id: string;
  /** 6-letter invite code (see src/shared/groups.ts) */
  code: string;
  name: string;
  /** player id of the creator (the only one who can remove members) */
  createdBy: string;
  members: GroupMember[];
  /** the group's live room, if a «لنلعب» room is still open: its code, who started it, when */
  playing: { code: string; by: string; since: number } | null;
  /** «لوحة الشرف»: the tournaments played in the group's rooms */
  honor?: GroupHonor;
}

/** A group's honour board, from the tournaments finished in its rooms. */
export interface GroupHonor {
  tournaments: number;
  /** titles per person, most first */
  titles: { id: string; count: number }[];
  /** the last champions, newest first (at most 10) */
  champions: { at: number; format: TournamentFormat; champions: string[] }[];
  /** points over all tournaments, most first */
  points: { id: string; total: number }[];
  /** names and faces of everyone above (members who left, guests of a tournament) */
  people: PlayerInfo[];
}

/** A group room's waiting list: everyone who was in the group when «لنلعب» was pressed. */
export interface RoomGroup {
  id: string;
  name: string;
  expected: (PlayerInfo & {
    online: boolean;
    inRoom: boolean;
    notified?: boolean;
    /** «مشغول»: not invited (no call, no push) — the caller can still start without them */
    status?: MemberStatus;
    /** «في لعبة»: playing in another room right now */
    playing?: boolean;
  })[];
  /** true until everyone is in, or the caller / host chose «ابدأ بالموجودين» (the game can't start before) */
  waiting: boolean;
  /** player id of whoever pressed «لنلعب» */
  by: string;
}

export interface VoiceMember {
  id: string;
  muted: boolean;
}

/** An ICE server for WebRTC (STUN, or TURN with credentials). */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** What phones send each other through the server to set up a voice connection. */
export type VoiceSignal = { description: { type: 'offer' | 'answer'; sdp: string } } | { candidate: Record<string, unknown> } | { restart: true };

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export type GameAction = { type: string; [key: string]: unknown };

export type ClientMsg =
  /** `status`: an older app doesn't send it (then «متاح») */
  | { t: 'hello'; player: PlayerInfo; status?: MyStatus }
  | { t: 'create'; game: GameId }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'ping' }
  | { t: 'room'; action: RoomAction }
  | { t: 'act'; action: GameAction }
  | { t: 'voice'; a: 'join' | 'leave' | 'mute'; muted?: boolean }
  | { t: 'signal'; to: string; data: VoiceSignal }
  | { t: 'groups' }
  | GroupRequest
  | { t: 'push'; token: string }
  /** my status changed («حالتي», or the automatic «بعيد») */
  | { t: 'status'; status: MyStatus }
  /** a reaction to everyone in my room (one of REACTION_KEYS, see src/shared/reactions.ts) */
  | { t: 'react'; key: ReactionKey };

export type GroupRequest =
  | { t: 'group'; a: 'create'; name: string }
  | { t: 'group'; a: 'join'; code: string }
  | { t: 'group'; a: 'leave'; id: string }
  | { t: 'group'; a: 'rename'; id: string; name: string }
  | { t: 'group'; a: 'remove'; id: string; player: string }
  | { t: 'group'; a: 'play'; id: string };

export type RoomAction =
  | { type: 'game'; game: GameId }
  | { type: 'settings'; game: GameId; patch: Record<string, unknown> }
  | { type: 'start' }
  | { type: 'lobby' }
  | { type: 'kick'; id: string }
  | { type: 'addBot' }
  | { type: 'pace'; pace: Pace }
  | { type: 'botLevel'; level: BotLevel }
  /** a group room: stop waiting for the missing members (caller or host) */
  | { type: 'groupGo' }
  /** tournaments (host only): set up / change the tournament in the waiting room */
  | { type: 'tournament'; config: TournamentConfig }
  /** back to a single game (in the waiting room), or end the tournament («إنهاء البطولة») */
  | { type: 'tournamentCancel' }
  /** «ابدأ البطولة» */
  | { type: 'tournamentStart' }
  /** after a game's final screen: to the standings / bracket (or the champion after the last game) */
  | { type: 'tournamentNext' }
  /** from the standings / bracket: start the next game */
  | { type: 'tournamentPlay' }
  /** skip the current / next game (league: no points; knockout: the higher seed goes on) */
  | { type: 'tournamentSkip' }
  /** play the current game again (it ended without a result) */
  | { type: 'tournamentReplay' }
  /** the champion screen: «بطولة جديدة» with the same settings */
  | { type: 'tournamentAgain' };

/**
 * Bot speed. Besides scaling the bots' own thinking time, the room always leaves a pause after
 * someone else's move before a bot plays its turn, so everyone can see what just happened.
 */
export type Pace = 'slow' | 'normal' | 'fast';

/** A move announced by the game: «روبو لعب ٧ أوروص». */
export interface Said {
  id: number;
  /** empty for a call that is only heard (`voice`): the turn bar shows no line for it */
  text: string;
  by?: string;
  /**
   * A short call to read aloud on phones that turned on «قراءة الأحداث» («روندا»، «باص»، «شاري»…),
   * written with the vowel marks the phone's Arabic voice needs to say it the Moroccan way.
   */
  voice?: string;
}
export const PACES: Pace[] = ['slow', 'normal', 'fast'];
export const PACE_LABEL: Record<Pace, string> = { slow: 'بطيئة', normal: 'عادية', fast: 'سريعة' };

/**
 * How strong the bots play, for every game (set by the host). 'easy' for children and beginners,
 * 'smart' a solid club player, 'expert' the strongest the game's bot can play (the default).
 */
export type BotLevel = 'easy' | 'smart' | 'expert';
export const BOT_LEVELS: BotLevel[] = ['easy', 'smart', 'expert'];
export const BOT_LEVEL_LABEL: Record<BotLevel, string> = { easy: 'سهل', smart: 'ذكي', expert: 'خبير' };

export type ServerMsg =
  | { t: 'welcome'; now: number }
  | { t: 'state'; room: RoomView; now: number }
  | { t: 'error'; message: string; code?: 'no_room' | 'generic' | 'group' }
  | { t: 'left'; kicked?: boolean }
  | { t: 'pong'; now: number }
  | { t: 'voiceConfig'; iceServers: IceServer[] }
  | { t: 'signal'; from: string; data: VoiceSignal }
  /** my groups (sent on request, and again whenever one of them changes) */
  | { t: 'groups'; groups: GroupInfo[] }
  /** answer to a group create / join */
  | { t: 'group'; a: 'create' | 'join'; group: GroupInfo }
  /** someone pressed «لنلعب» in one of my groups */
  | { t: 'groupCall'; group: { id: string; name: string }; code: string; by: PlayerInfo }
  /**
   * Someone in my room sent a reaction (me too: my own comes back as the confirmation). Only passed
   * on, never kept: it isn't part of the room's view and isn't sent again on reconnect. An older app
   * ignores it.
   */
  | { t: 'reaction'; id: number; by: string; key: ReactionKey };
