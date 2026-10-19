/**
 * Tournaments («البطولات»): one evening, several games in a row, a running family leaderboard and a
 * final champion. Shared between the app and the server: the types, the points table, the bracket
 * maths and the checks, so the waiting room shows the same verdict the server gives.
 *
 * - League («دوري»): the host lists 3–10 games; each game gives points by finishing place
 *   (5, 3, 2, 1, then 1 for everyone else who finished; a co-op game gives everyone 3 if the family
 *   won, 1 if it lost). Highest total wins; a tie goes to the most first places, then the title is shared.
 * - Knockout («خروج المغلوب»): a bracket of duels between the people present (random seeding, byes
 *   when the count isn't a power of two). A draw is replayed (twice at most), then the higher seed goes on.
 * Bots can fill seats in a league game but are never ranked: no points, no titles, not in brackets.
 */
import { BOT_GAMES, GAME_IDS, MAX_PLAYERS, MIN_PLAYERS, type GameId, type PlayerInfo } from './protocol';

export type TournamentFormat = 'league' | 'knockout';

export interface LeagueConfig {
  format: 'league';
  /** played in this order (repeats allowed) */
  games: GameId[];
  /** points for the 1st, 2nd, 3rd… place; everyone else who finished gets REST_POINTS */
  points: number[];
}

export interface KnockoutConfig {
  format: 'knockout';
  /** a game two people can play against each other */
  game: GameId;
  /** optional: a different game per round (first round first); missing rounds use `game` */
  perRound?: GameId[];
}

export type TournamentConfig = LeagueConfig | KnockoutConfig;

export type TournamentStage = 'setup' | 'playing' | 'standings' | 'final';

export const DEFAULT_POINTS = [5, 3, 2, 1];
/** for every place after the points table */
export const REST_POINTS = 1;
/** co-op games: the same for everyone */
export const COOP_POINTS = { won: 3, lost: 1 };
export const LEAGUE_MIN_GAMES = 3;
export const LEAGUE_MAX_GAMES = 10;
export const KNOCKOUT_MIN = 2;
export const KNOCKOUT_MAX = 16;
/** a drawn duel is played again at most this many times, then the higher seed goes on */
export const MAX_REPLAYS = 2;

/** Games two people can play against each other (duel games first, then those that also work with two). */
export const KNOCKOUT_GAMES: GameId[] = [
  'xo', 'connect4', 'chess', 'dama', 'kharbga', 'battleship', 'mancala',
  'dots', 'ludo', 'blocks', 'ladders', 'memory', 'ronda', 'kanza', 'konkan', 'unoflip', 'phase10', 'kdab',
  'scrabble', 'boggle', 'wordle', 'quiz', 'trivia', 'surah', 'whois', 'huroof',
];

/** Short games that suit an evening league («اختيار عشوائي» picks from these first). */
export const QUICK_GAMES: GameId[] = [
  'quiz', 'trivia', 'surah', 'whois', 'huroof', 'xo', 'connect4', 'memory', 'dots', 'wordle', 'boggle',
  'qquote', 'tajweed', 'asma', 'mapquiz', 'steps', 'names', 'potato', 'imposter', 'spy', 'oneword',
  'survey', 'ladders', 'codebreak', 'kdab', 'mancala', 'wave',
];

export interface StandingRow {
  id: string;
  points: number;
  /** first places (league) or duels won (knockout) */
  wins: number;
  /** games finished (league) or duels played (knockout, byes not counted) */
  played: number;
}

export interface BracketMatch {
  /** null: a bye (the other one goes through), or not known yet in a later round */
  a: string | null;
  b: string | null;
  winner: string | null;
  /** a bye: nobody to play against, the player goes through */
  bye?: boolean;
  /** drawn games so far */
  draws?: number;
  /** how the winner was decided when it wasn't a win on the board */
  by?: 'seed' | 'forfeit';
}

/** The result of the tournament's last game, for the final screen of that game and the standings. */
export interface TournamentLast {
  /** 0-based position of that game in the tournament */
  index: number;
  gameId: GameId;
  /** ranked players only (bots removed, places compressed) */
  places: string[][];
  /** league: points each player earned in that game */
  awarded: Record<string, number>;
  /** knockout: who goes on (null after a draw that will be replayed) */
  winner?: string | null;
  /** knockout: the duel was a draw ('replay': it will be played again; 'seed': the higher seed goes on) */
  draw?: 'replay' | 'seed';
  /** nothing awarded: the game ended without a result, was skipped, or can't rank players yet */
  none?: 'aborted' | 'skipped' | 'unranked';
}

export interface TournamentView {
  format: TournamentFormat;
  config: TournamentConfig;
  stage: TournamentStage;
  /** league: the list; knockout: the game of each round */
  games: GameId[];
  /** the game being played, or the next one */
  game: GameId | null;
  /** league: 0-based number of the current / next game; knockout: duels played so far */
  index: number;
  /** league: number of games; knockout: number of duels to play */
  total: number;
  /** league (and knockout once finished): ranked, best first */
  standings: StandingRow[];
  /** knockout */
  bracket: { rounds: BracketMatch[][] } | null;
  /** knockout: the duel being played / the next one */
  match: { round: number; slot: number; a: string; b: string; draws: number } | null;
  last: TournamentLast | null;
  /** the current game's result is in (its final screen shows the tournament actions) */
  done: boolean;
  /** the current game can rank players (false: it is played but counts for nothing) */
  ranked: boolean;
  champion: string[] | null;
  /** everyone who took part (names stay known after someone leaves the room) */
  people: PlayerInfo[];
}

/* ------------------------------------------------------------------ */
/* Points                                                              */
/* ------------------------------------------------------------------ */

/** Points for the place at `index` (0 = first). */
export function pointsFor(index: number, table: number[] = DEFAULT_POINTS) {
  return index < table.length ? table[index] : REST_POINTS;
}

/**
 * The points a finished game gives: bots are removed and the places closed up (a bot in 1st place
 * makes the best person 1st); players sharing a place share its points (each gets them in full).
 */
export function awardPoints(
  result: { places: string[][]; coop?: { won: boolean } },
  isRanked: (id: string) => boolean,
  table: number[] = DEFAULT_POINTS,
): { places: string[][]; awarded: Record<string, number> } {
  const seen = new Set<string>();
  const places: string[][] = [];
  for (const place of result.places) {
    const people = place.filter((id) => isRanked(id) && !seen.has(id));
    people.forEach((id) => seen.add(id));
    if (people.length) places.push(people);
  }
  const awarded: Record<string, number> = {};
  if (result.coop) {
    const pts = result.coop.won ? COOP_POINTS.won : COOP_POINTS.lost;
    for (const id of places.flat()) awarded[id] = pts;
    return { places: [places.flat()].filter((p) => p.length), awarded };
  }
  places.forEach((place, i) => {
    for (const id of place) awarded[id] = pointsFor(i, table);
  });
  return { places, awarded };
}

/** Best first: points, then first places, then id for a stable order. */
export function sortStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort((a, b) => b.points - a.points || b.wins - a.wins || a.id.localeCompare(b.id));
}

/** Rank numbers (0-based) with ties sharing a rank, for rows already sorted. */
export function standingRanks(rows: StandingRow[]): number[] {
  const ranks: number[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    ranks.push(prev && prev.points === r.points && prev.wins === r.wins ? ranks[i - 1] : i);
  });
  return ranks;
}

/** The champion(s): highest total; a tie goes to the most first places; still tied → a shared title. */
export function leagueChampions(rows: StandingRow[]): string[] {
  if (!rows.length) return [];
  const best = Math.max(...rows.map((r) => r.points));
  const top = rows.filter((r) => r.points === best);
  const most = Math.max(...top.map((r) => r.wins));
  return top.filter((r) => r.wins === most).map((r) => r.id);
}

/* ------------------------------------------------------------------ */
/* Bracket                                                             */
/* ------------------------------------------------------------------ */

export function bracketSize(n: number) {
  let size = 1;
  while (size < n) size *= 2;
  return Math.max(2, size);
}

/** Standard seeding order for a bracket of `size` slots: [0, 3, 1, 2] for 4, [0, 7, 3, 4, 1, 6, 2, 5] for 8… */
export function seedOrder(size: number): number[] {
  let order = [0];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n - 1 - s]);
  }
  return order;
}

/**
 * All rounds of a bracket for these seeds (seed 1 first). Byes go to the top seeds and are decided
 * at once; later rounds are filled as winners are known.
 */
export function makeBracket(seeds: string[]): BracketMatch[][] {
  const size = bracketSize(seeds.length);
  const order = seedOrder(size);
  const first: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    const a = seeds[order[i]] ?? null;
    const b = seeds[order[i + 1]] ?? null;
    const bye = !a || !b;
    first.push({ a: a ?? b, b: a ? b : null, winner: bye ? (a ?? b) : null, ...(bye ? { bye: true } : null) });
  }
  const rounds: BracketMatch[][] = [first];
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => ({ a: null, b: null, winner: null })));
  propagate(rounds);
  return rounds;
}

/** Move every known winner into its slot of the next round. */
export function propagate(rounds: BracketMatch[][]) {
  for (let r = 0; r + 1 < rounds.length; r++) {
    rounds[r].forEach((m, i) => {
      const next = rounds[r + 1][Math.floor(i / 2)];
      if (i % 2 === 0) next.a = m.winner;
      else next.b = m.winner;
    });
  }
}

/** The next duel to play: the first match of the earliest round with both players known and no winner. */
export function nextMatch(rounds: BracketMatch[][]): { round: number; slot: number } | null {
  for (let r = 0; r < rounds.length; r++) {
    const slot = rounds[r].findIndex((m) => !m.winner && m.a && m.b);
    if (slot >= 0) return { round: r, slot };
    if (rounds[r].some((m) => !m.winner)) return null;
  }
  return null;
}

/** Duels to play in a bracket of n people (byes don't count). */
export const knockoutDuels = (n: number) => Math.max(0, n - 1);

/** «النهائي», «نصف النهائي», «ربع النهائي», «دور الستة عشر». */
export function roundName(round: number, rounds: number) {
  const left = rounds - round;
  if (left === 1) return 'النهائي';
  if (left === 2) return 'نصف النهائي';
  if (left === 3) return 'ربع النهائي';
  if (left === 4) return 'دور الستة عشر';
  return `الدور ${round + 1}`;
}

export const knockoutRounds = (n: number) => Math.round(Math.log2(bracketSize(n)));

/** The game of a knockout round. */
export function roundGame(c: KnockoutConfig, round: number): GameId {
  return c.perRound?.[round] ?? c.game;
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

export type TournamentProblem =
  | { kind: 'count'; min: number; max: number }
  | { kind: 'duel'; index?: number }
  | { kind: 'people'; min: number; max: number; n: number }
  | { kind: 'min'; index: number; game: GameId; n: number }
  | { kind: 'max'; index: number; game: GameId; n: number };

/** Players a game would seat now: the people, plus the bots if the game takes bots. */
export function seatsFor(game: GameId, people: number, bots: number) {
  return people + (BOT_GAMES.includes(game) ? bots : 0);
}

/** Can this game be played now? null = yes. */
export function gameProblem(game: GameId, index: number, people: number, bots: number): TournamentProblem | null {
  const seats = seatsFor(game, people, bots);
  if (seats < MIN_PLAYERS[game]) return { kind: 'min', index, game, n: MIN_PLAYERS[game] };
  const max = MAX_PLAYERS[game];
  if (max && seats > max) return { kind: 'max', index, game, n: max };
  return null;
}

/** What stops the tournament from starting with these players (people = connected humans), or null. */
export function tournamentProblem(c: TournamentConfig, people: number, bots: number): TournamentProblem | null {
  if (c.format === 'league') {
    if (c.games.length < LEAGUE_MIN_GAMES || c.games.length > LEAGUE_MAX_GAMES) return { kind: 'count', min: LEAGUE_MIN_GAMES, max: LEAGUE_MAX_GAMES };
    for (let i = 0; i < c.games.length; i++) {
      const p = gameProblem(c.games[i], i, people, bots);
      if (p) return p;
    }
    return null;
  }
  if (!KNOCKOUT_GAMES.includes(c.game)) return { kind: 'duel' };
  const bad = (c.perRound ?? []).findIndex((g) => !KNOCKOUT_GAMES.includes(g));
  if (bad >= 0) return { kind: 'duel', index: bad };
  if (people < KNOCKOUT_MIN || people > KNOCKOUT_MAX) return { kind: 'people', min: KNOCKOUT_MIN, max: KNOCKOUT_MAX, n: people };
  return null;
}

/** Arabic text for a problem; `name` gives a game's name («ورقة» / «اللعبة 2»). */
export function problemText(p: TournamentProblem, name: (game: GameId, index: number) => string): string {
  switch (p.kind) {
    case 'count':
      return `اختر من ${p.min} إلى ${p.max} ألعاب للدوري`;
    case 'duel':
      return p.index === undefined ? 'اختر لعبة تُلعب بين اثنين' : `لعبة الدور ${p.index + 1} لا تُلعب بين اثنين`;
    case 'people':
      return p.n < p.min ? 'خروج المغلوب يحتاج شخصين على الأقل (البوتات لا تدخل الجدول)' : `خروج المغلوب لـ ${p.max} شخصاً على الأكثر`;
    case 'min':
      return `${name(p.game, p.index)} تحتاج ${p.n} لاعبين على الأقل`;
    case 'max':
      return `${name(p.game, p.index)} لـ ${p.n} لاعبين على الأكثر`;
  }
}

/** A clean config from whatever a phone sent (unknown games dropped, sizes clamped), or null. */
export function cleanConfig(raw: unknown): TournamentConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const game = (v: unknown): v is GameId => typeof v === 'string' && (GAME_IDS as string[]).includes(v);
  if (o.format === 'league') {
    const games = (Array.isArray(o.games) ? o.games : []).filter(game).slice(0, LEAGUE_MAX_GAMES);
    const pts = Array.isArray(o.points) ? o.points.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).map((n) => Math.max(0, Math.min(20, Math.round(n)))).slice(0, 8) : [];
    return { format: 'league', games, points: pts.length ? pts : [...DEFAULT_POINTS] };
  }
  if (o.format === 'knockout') {
    const g = game(o.game) && KNOCKOUT_GAMES.includes(o.game) ? o.game : 'xo';
    const per = Array.isArray(o.perRound) ? o.perRound.filter(game).filter((x) => KNOCKOUT_GAMES.includes(x)).slice(0, 4) : [];
    return per.length ? { format: 'knockout', game: g, perRound: per } : { format: 'knockout', game: g };
  }
  return null;
}

/**
 * «اختيار عشوائي»: `n` different games playable now, short ones first (`rand` in [0, 1)).
 * Falls back to any playable game when there aren't enough short ones.
 */
export function randomGames(n: number, people: number, bots: number, rand: () => number = Math.random): GameId[] {
  const ok = (g: GameId) => !gameProblem(g, 0, people, bots);
  const shuffle = (list: GameId[]) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const quick = shuffle(QUICK_GAMES.filter(ok));
  const rest = shuffle(GAME_IDS.filter((g) => ok(g) && !QUICK_GAMES.includes(g)));
  return [...quick, ...rest].slice(0, n);
}

/** Points line for the waiting room: «الأول 5، الثاني 3، الثالث 2، البقية 1». */
export function pointsLine(table: number[] = DEFAULT_POINTS) {
  const names = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];
  return [...table.map((p, i) => `${names[i]} ${p}`), `البقية ${REST_POINTS}`].join('، ');
}
