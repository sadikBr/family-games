/**
 * Tournaments («البطولات») on the server: the state of one tournament in a room, and the group's
 * honour board built from the finished ones. The room (server/room.ts) starts the games and asks
 * this class what to play next; the rules shared with the app live in src/shared/tournament.ts.
 *
 * League: every game is started with everyone (as a normal start); when the game's result() first
 * becomes non-null its points are recorded; the host then goes to the standings and on to the next
 * game. After the last one the champion is the best total (tie → most first places → shared title).
 *
 * Knockout: a bracket of the people present at the start (random seeds, byes for the top seeds);
 * each duel starts the game with just its two players, the others watch. A draw is replayed up to
 * MAX_REPLAYS times, then the higher seed goes on. Someone who left the room loses their duel.
 */
import type { GameId, GroupHonor, PlayerInfo } from '../src/shared/protocol';
import {
  awardPoints,
  knockoutDuels,
  leagueChampions,
  makeBracket,
  MAX_REPLAYS,
  nextMatch,
  pointsFor,
  propagate,
  roundGame,
  sortStandings,
  type BracketMatch,
  type StandingRow,
  type TournamentConfig,
  type TournamentFormat,
  type TournamentLast,
  type TournamentStage,
  type TournamentView,
} from '../src/shared/tournament';
import { GameError, type GameResult } from './types';
import { shuffle } from './util';

/** What a group keeps of a finished tournament (see Store.saveTournament). */
export interface TournamentRecord {
  format: TournamentFormat;
  games: GameId[];
  standings: (StandingRow & PlayerInfo)[];
  champions: PlayerInfo[];
  startedAt: number;
  endedAt: number;
}

export class Tournament {
  stage: TournamentStage = 'setup';
  /** everyone ranked in this tournament (people, never bots), with the name they had */
  people = new Map<string, PlayerInfo>();
  rows = new Map<string, StandingRow>();
  /** league: 0-based number of the current / next game */
  index = 0;
  /** knockout: seed order (seed 1 first) and the rounds */
  seeds: string[] = [];
  rounds: BracketMatch[][] = [];
  /** knockout: duels decided so far */
  duels = 0;
  /** knockout: the duel being played (the view shows it until the host moves on) */
  private playingAt: { round: number; slot: number } | null = null;
  /** the current game's result is recorded */
  done = false;
  /** the current game has a result() (games without one are played for fun) */
  ranked = true;
  last: TournamentLast | null = null;
  champion: string[] | null = null;
  startedAt = 0;
  endedAt = 0;
  /** written to the group's history already */
  saved = false;

  constructor(public config: TournamentConfig) {}

  get format() {
    return this.config.format;
  }

  /** «ابدأ البطولة»: the ranked people are fixed for a knockout (a league takes late arrivals too). */
  begin(people: PlayerInfo[], now: number, rand: <T>(list: T[]) => T[] = shuffle) {
    this.startedAt = now;
    for (const p of people) this.addPerson(p);
    if (this.config.format === 'knockout') {
      this.seeds = rand(people.map((p) => p.id));
      this.rounds = makeBracket(this.seeds);
    }
    this.stage = 'standings';
  }

  private addPerson(p: PlayerInfo) {
    this.people.set(p.id, { id: p.id, name: p.name, avatar: p.avatar, color: p.color });
    if (!this.rows.has(p.id)) this.rows.set(p.id, { id: p.id, points: 0, wins: 0, played: 0 });
  }

  /** The game to play now and who plays it (null = everyone in the room), or null when it's over. */
  upcoming(): { game: GameId; participants: string[] | null } | null {
    const c = this.config;
    if (this.stage === 'final' || this.stage === 'setup') return null;
    if (c.format === 'league') return this.index < c.games.length ? { game: c.games[this.index], participants: null } : null;
    const m = nextMatch(this.rounds);
    if (!m) return null;
    const match = this.rounds[m.round][m.slot];
    return { game: roundGame(c, m.round), participants: [match.a!, match.b!] };
  }

  private current(): BracketMatch | null {
    const m = nextMatch(this.rounds);
    return m ? this.rounds[m.round][m.slot] : null;
  }

  /** The room started the next game with these people (`ranked`: the game has a result()). */
  started(people: PlayerInfo[], ranked: boolean) {
    this.stage = 'playing';
    this.done = false;
    this.ranked = ranked;
    this.playingAt = this.config.format === 'knockout' ? nextMatch(this.rounds) : null;
    // a league takes people who arrived after the start, from their first game on
    if (this.config.format === 'league') for (const p of people) this.addPerson(p);
  }

  /** The current game's result came in (the first time result() was non-null). */
  record(result: GameResult, isRanked: (id: string) => boolean) {
    if (this.stage !== 'playing' || this.done) return;
    const c = this.config;
    const ranked = (id: string) => this.people.has(id) && isRanked(id);
    if (c.format === 'league') {
      const { places, awarded } = awardPoints(result, ranked, c.points);
      for (const id of places.flat()) {
        const row = this.rows.get(id)!;
        row.points += awarded[id];
        row.played += 1;
      }
      if (!result.coop) for (const id of places[0] ?? []) this.rows.get(id)!.wins += 1;
      this.last = { index: this.index, gameId: c.games[this.index], places, awarded };
      this.done = true;
      return;
    }
    const at = nextMatch(this.rounds);
    if (!at) return;
    const m = this.rounds[at.round][at.slot];
    const duo = [m.a!, m.b!];
    const places = result.places.map((p) => p.filter((id) => duo.includes(id))).filter((p) => p.length);
    const top = places[0] ?? [];
    let winner: string | null = top.length === 1 ? top[0] : null;
    let draw: TournamentLast['draw'];
    for (const id of duo) this.rows.get(id)!.played += 1;
    if (!winner) {
      m.draws = (m.draws ?? 0) + 1;
      if (m.draws > MAX_REPLAYS) {
        winner = this.higherSeed(duo);
        m.by = 'seed';
        draw = 'seed';
      } else draw = 'replay';
    } else this.rows.get(winner)!.wins += 1;
    if (winner) this.decide(m, winner);
    this.last = { index: this.duels - (winner ? 1 : 0), gameId: roundGame(c, at.round), places, awarded: {}, winner, ...(draw ? { draw } : null) };
    this.done = true;
  }

  private koGame(round: number): GameId {
    const c = this.config;
    return c.format === 'knockout' ? roundGame(c, round) : c.games[this.index];
  }

  private higherSeed(ids: string[]) {
    return [...ids].sort((a, b) => this.seeds.indexOf(a) - this.seeds.indexOf(b))[0];
  }

  private decide(m: BracketMatch, winner: string) {
    m.winner = winner;
    this.duels += 1;
    propagate(this.rounds);
  }

  /** The host moves on after a game: to the standings / bracket, or to the champion after the last game. */
  next(now: number) {
    if (this.stage !== 'playing') return;
    if (this.config.format === 'league') {
      if (!this.done) this.last = { index: this.index, gameId: this.config.games[this.index], places: [], awarded: {}, none: this.ranked ? 'aborted' : 'unranked' };
      this.index += 1;
      this.afterGame(now);
      return;
    }
    if (!this.done) throw new GameError('لا نتيجة لهذه المباراة بعد — أعيدوها أو تخطّوها');
    this.afterGame(now);
  }

  /** «تخطَّ»: a league game gives no points; a duel goes to the higher seed. */
  skip(now: number) {
    if (this.stage !== 'playing' && this.stage !== 'standings') return;
    if (this.config.format === 'league') {
      if (this.stage === 'playing' && this.done) return this.next(now);
      this.last = { index: this.index, gameId: this.config.games[this.index], places: [], awarded: {}, none: 'skipped' };
      this.index += 1;
      this.afterGame(now);
      return;
    }
    // the duel just ended with a winner: nothing to skip, go on
    if (this.stage === 'playing' && this.done && this.last?.winner) return this.afterGame(now);
    const at = nextMatch(this.rounds);
    if (!at) return this.afterGame(now);
    const m = this.rounds[at.round][at.slot];
    const winner = this.higherSeed([m.a!, m.b!]);
    m.by = 'seed';
    this.decide(m, winner);
    this.last = { index: this.duels - 1, gameId: this.koGame(at.round), places: [], awarded: {}, winner, none: 'skipped' };
    this.afterGame(now);
  }

  /** People who left the room lose their duel before it starts (both gone: the higher seed goes on). */
  forfeit(missing: string[], now: number) {
    const at = nextMatch(this.rounds);
    if (!at) return;
    const m = this.rounds[at.round][at.slot];
    const duo = [m.a!, m.b!];
    const left = duo.filter((id) => !missing.includes(id));
    const winner = left.length === 1 ? left[0] : this.higherSeed(duo);
    m.by = 'forfeit';
    this.decide(m, winner);
    this.last = { index: this.duels - 1, gameId: this.koGame(at.round), places: [], awarded: {}, winner, none: 'skipped' };
    if (!nextMatch(this.rounds)) this.finish(now);
  }

  private afterGame(now: number) {
    this.done = false;
    const over = this.config.format === 'league' ? this.index >= this.config.games.length : !nextMatch(this.rounds);
    if (over) this.finish(now);
    else this.stage = 'standings';
  }

  private finish(now: number) {
    this.stage = 'final';
    this.endedAt = now;
    this.done = false;
    if (this.config.format === 'league') {
      this.champion = leagueChampions([...this.rows.values()]);
      return;
    }
    const final = this.rounds[this.rounds.length - 1][0];
    this.champion = final.winner ? [final.winner] : [];
    // knockout points for the family's all-time table: champion 5, finalist 3, semi-finalists 2…
    const R = this.rounds.length;
    for (const row of this.rows.values()) {
      let place = R; // everyone else who took part
      if (row.id === final.winner) place = 0;
      else {
        for (let r = 0; r < R; r++) {
          const m = this.rounds[r].find((x) => (x.a === row.id || x.b === row.id) && x.winner && x.winner !== row.id);
          if (m) place = R - r;
        }
      }
      row.points = pointsFor(place);
    }
  }

  view(): TournamentView {
    const c = this.config;
    const knockout = c.format === 'knockout';
    const at = !knockout || !this.rounds.length ? null : this.stage === 'playing' && this.playingAt ? this.playingAt : nextMatch(this.rounds);
    const m = at ? this.rounds[at.round][at.slot] : null;
    const up = this.upcoming();
    const rounds = knockout ? Math.max(1, this.rounds.length) : 0;
    return {
      format: c.format,
      config: c,
      stage: this.stage,
      games: c.format === 'league' ? c.games : Array.from({ length: rounds }, (_, r) => roundGame(c, r)),
      game: up?.game ?? null,
      index: knockout ? this.duels : this.index,
      total: knockout ? knockoutDuels(this.seeds.length) : c.games.length,
      standings: knockout && this.stage !== 'final' ? [] : sortStandings([...this.rows.values()]),
      bracket: knockout ? { rounds: this.rounds } : null,
      match: at && m ? { round: at.round, slot: at.slot, a: m.a!, b: m.b!, draws: m.draws ?? 0 } : null,
      last: this.last,
      done: this.done,
      ranked: this.ranked,
      champion: this.champion,
      people: [...this.people.values()],
    };
  }

  /** What the group keeps. */
  toRecord(): TournamentRecord {
    const c = this.config;
    return {
      format: c.format,
      games: c.format === 'league' ? c.games : this.view().games,
      standings: sortStandings([...this.rows.values()]).map((r) => ({ ...this.people.get(r.id)!, ...r })),
      champions: (this.champion ?? []).map((id) => this.people.get(id)!).filter(Boolean),
      startedAt: this.startedAt,
      endedAt: this.endedAt,
    };
  }

  /** Did anyone play a game yet? (a league that never finished a game isn't worth keeping) */
  get anyPlayed() {
    return [...this.rows.values()].some((r) => r.played > 0) || this.duels > 0;
  }

  /** Test helper: the current knockout match. */
  get match() {
    return this.current();
  }
}

/**
 * The group's honour board from its finished tournaments (oldest first): titles per person, the last
 * ten champions, and points over all tournaments. Names come from the current members when known.
 */
export function buildHonor(records: TournamentRecord[], members: PlayerInfo[] = []): GroupHonor {
  const people = new Map<string, PlayerInfo>();
  const titles = new Map<string, number>();
  const points = new Map<string, number>();
  for (const rec of records) {
    for (const s of rec.standings) {
      people.set(s.id, { id: s.id, name: s.name, avatar: s.avatar, color: s.color });
      points.set(s.id, (points.get(s.id) ?? 0) + s.points);
    }
    for (const ch of rec.champions) {
      people.set(ch.id, { id: ch.id, name: ch.name, avatar: ch.avatar, color: ch.color });
      titles.set(ch.id, (titles.get(ch.id) ?? 0) + 1);
    }
  }
  for (const m of members) if (people.has(m.id)) people.set(m.id, { id: m.id, name: m.name, avatar: m.avatar, color: m.color });
  const byCount = <T extends { id: string }>(list: T[], key: (x: T) => number) => list.sort((a, b) => key(b) - key(a) || a.id.localeCompare(b.id));
  return {
    tournaments: records.length,
    titles: byCount([...titles].map(([id, count]) => ({ id, count })), (x) => x.count),
    champions: records
      .slice(-10)
      .reverse()
      .map((r) => ({ at: r.endedAt, format: r.format, champions: r.champions.map((c) => c.id) })),
    points: byCount([...points].map(([id, total]) => ({ id, total })), (x) => x.total),
    people: [...people.values()],
  };
}
