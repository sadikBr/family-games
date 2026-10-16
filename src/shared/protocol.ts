/**
 * Shared types between the app (src/) and the game server (server/).
 * Keep this file free of React Native / Bun specific imports.
 */
import type { Card } from './cards';
import type { UnoColor, UnoFace, UnoSide } from './uno';

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
  | 'ladders';

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
];

/** Games where bots can take a seat. Heads Up & Taboo need real voices. */
export const BOT_GAMES: GameId[] = ['imposter', 'names', 'potato', 'werewolf', 'ronda', 'kanza', 'tris', 'konkan', 'unoflip', 'ludo', 'dama', 'estate', 'huroof', 'quiz', 'whois', 'surah', 'hajj', 'ladders'];
export const MAX_BOTS = 8;

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
};

/** Card games have a seat limit. */
export const MAX_PLAYERS: Partial<Record<GameId, number>> = { ronda: 4, kanza: 4, tris: 4, konkan: 4, unoflip: 10, ludo: 4, dama: 2, draw: 12, estate: 6, huroof: 12, quiz: 12, whois: 12, surah: 12, hajj: 6, ladders: 6 };

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
}

export interface NamesSettings {
  rounds: number;
  seconds: number;
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
}
export interface CodenamesSettings {
  assassin: boolean;
}
export interface DamaSettings {
  flyingKings: boolean;
  backCapture: boolean; // men may capture backwards
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
export interface HuroofSettings {
  seconds: number;
}
export interface QuizSettings {
  rounds: number;
  seconds: number;
  category: QuizCategory;
}
export interface WhoisSettings {
  rounds: number;
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
}

export const DEFAULT_SETTINGS: AllSettings = {
  imposter: { category: 'random', imposters: 0, hintForImposter: true },
  names: { rounds: 5, seconds: 90 },
  headsup: { category: 'random', seconds: 60, turnsEach: 1 },
  taboo: { seconds: 60, turnsEach: 3 },
  potato: { rounds: 5, minFuse: 15, maxFuse: 45 },
  werewolf: { narratorId: null, wolves: 0, seer: true, doctor: true, hunter: false },
  ronda: { target: 41 },
  kanza: { hands: 3 },
  tris: { target: 31 },
  konkan: { limit: 100 },
  unoflip: { target: 250 },
  ludo: { exitOnOne: false },
  codenames: { assassin: true },
  dama: { flyingKings: true, backCapture: true },
  draw: { rounds: 2, seconds: 80 },
  estate: { startCash: 1500, rounds: 30 },
  huroof: { seconds: 20 },
  quiz: { rounds: 10, seconds: 15, category: 'all' },
  whois: { rounds: 8 },
  surah: { rounds: 10, seconds: 20, level: 'easy' },
  hajj: { questions: true },
  ladders: { exact: true },
};

/* ------------------------------------------------------------------ */
/* Game views (personalised per player by the server)                  */
/* ------------------------------------------------------------------ */

export type ImposterSecret =
  | { role: 'civilian'; word: string; category: string }
  | { role: 'imposter'; category: string | null; partners: string[] };

export interface ImposterResult {
  votes: Record<string, string>;
  accused: string | null;
  imposters: string[];
  word: string;
  caught: boolean;
  guessed: string | null;
  guessCorrect: boolean | null;
  winners: 'civilians' | 'imposters';
}

export interface ImposterView {
  game: 'imposter';
  phase: 'reveal' | 'clues' | 'vote' | 'guess' | 'result';
  round: number;
  participants: string[];
  secret: ImposterSecret | null;
  ready: string[];
  order: string[]; // clue order, starts with starter
  voted: string[];
  myVote: string | null;
  guessOptions: string[] | null; // only for the caught imposter
  guesserId: string | null;
  /** clues "said" by bots (shown on screen) */
  botClues: Record<string, string>;
  result: ImposterResult | null;
  scores: Record<string, number>;
}

export const NAMES_CATEGORIES: CategoryInfo[] = [
  { key: 'boy', label: 'اسم ولد', emoji: '👦' },
  { key: 'girl', label: 'اسم بنت', emoji: '👧' },
  { key: 'animal', label: 'حيوان', emoji: '🐾' },
  { key: 'plant', label: 'نبات / فاكهة / خضرة', emoji: '🌿' },
  { key: 'thing', label: 'جماد', emoji: '🪑' },
  { key: 'country', label: 'بلاد / مدينة', emoji: '🌍' },
];

export type NamesVerdict = 'ok' | 'empty' | 'letter' | 'rejected';

export interface NamesCell {
  text: string;
  verdict: NamesVerdict;
  rejects: string[]; // who voted it invalid
  points: number | null; // filled in after scoring
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
  /** how many categories each player has filled (live progress) */
  progress: Record<string, number>;
  myAnswers: Record<string, string>;
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
}

export type WolfRole = 'wolf' | 'villager' | 'seer' | 'doctor' | 'hunter';

export type WolfStep =
  | 'sleep'
  | 'wolves'
  | 'doctor'
  | 'seer'
  | 'wake'
  | 'announce'
  | 'vote'
  | 'hunter';

export interface WolfNarratorInfo {
  roles: Record<string, WolfRole>;
  step: WolfStep;
  steps: WolfStep[];
  wolvesTarget: string | null;
  doctorSave: string | null;
  seerCheck: string | null;
  hunterTarget: string | null;
  hunterAfter: 'night' | 'day' | null; // when the hunter step was triggered
  log: string[];
  /** which of the current picks were made automatically for bots */
  auto: Partial<Record<'wolves' | 'doctor' | 'seer' | 'hunter', boolean>>;
}

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
  winner: 'wolves' | 'village' | null;
  revealed: Record<string, WolfRole> | null;
  narrator: WolfNarratorInfo | null;
  roleCounts: Partial<Record<WolfRole, number>>;
  /** bots accusing someone during the day */
  accusations: { by: string; target: string }[];
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
}

export interface EstateView {
  game: 'estate';
  phase: 'roll' | 'buy' | 'manage' | 'debt' | 'final';
  players: EstatePlayer[];
  turn: string;
  dice: number[] | null;
  rollId: number;
  props: Record<number, { owner: string; houses: number; mortgaged: boolean }>;
  buy: number | null;
  card: { id: number; deck: 'luck' | 'family'; text: string; by: string } | null;
  debt: { amount: number; to: string | null } | null;
  trade: EstateTrade | null;
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
}

/** Shared by «مسابقة إسلامية» and «من أي سورة؟». */
export interface McqView {
  game: 'quiz' | 'surah';
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
}

export type HuroofTeam = 'red' | 'green';
export interface HuroofView {
  game: 'huroof';
  phase: 'pick' | 'question' | 'final';
  teams: Record<HuroofTeam, string[]>;
  cells: { letter: string; owner: HuroofTeam | null }[];
  turn: HuroofTeam; // team choosing the next letter
  cell: number | null;
  question: { text: string; options: string[] } | null;
  canAnswer: HuroofTeam[];
  endsAt: number | null;
  last: { cell: number; team: HuroofTeam | null; answer: string; by: string | null; id: number } | null;
  winner: HuroofTeam | null;
  winPath: number[] | null;
  feed: FeedItem[];
}

export interface BoardCard {
  id: number;
  by: string;
  kind: 'station' | 'event' | 'ladder' | 'snake' | 'right' | 'wrong';
  title: string;
  text: string;
  day?: string;
}

export interface HajjView {
  game: 'hajj';
  phase: 'roll' | 'question' | 'final';
  players: { id: string; pos: number }[];
  turn: string;
  dice: number | null;
  rollId: number;
  card: BoardCard | null;
  question: { text: string; options: string[]; endsAt: number; for: string } | null;
  winner: string | null;
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
  feed: FeedItem[];
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
  | LudoView
  | CodenamesView
  | DamaView
  | DrawView
  | EstateView
  | McqView
  | WhoisView
  | HuroofView
  | HajjView
  | LaddersView;

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
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export type GameAction = { type: string; [key: string]: unknown };

export type ClientMsg =
  | { t: 'hello'; player: PlayerInfo }
  | { t: 'create'; game: GameId }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'ping' }
  | { t: 'room'; action: RoomAction }
  | { t: 'act'; action: GameAction };

export type RoomAction =
  | { type: 'game'; game: GameId }
  | { type: 'settings'; game: GameId; patch: Record<string, unknown> }
  | { type: 'start' }
  | { type: 'lobby' }
  | { type: 'kick'; id: string }
  | { type: 'addBot' };

export type ServerMsg =
  | { t: 'welcome'; now: number }
  | { t: 'state'; room: RoomView; now: number }
  | { t: 'error'; message: string; code?: 'no_room' | 'generic' }
  | { t: 'left' }
  | { t: 'pong'; now: number };
