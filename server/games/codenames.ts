/**
 * الكلمات السرية — two teams, 25 words. Each team's spymaster sees which words are theirs
 * and gives a one-word clue + a number. Team-mates point at words and reveal them.
 * Find all your words first. Revealing the assassin loses immediately.
 *
 * Bots can only be spymasters (at most one per team): a bot gives clues (codenames-bot.ts) and never guesses, so a
 * team led by a bot still needs at least one person guessing.
 */
import type { CodeColor, CodenamesSettings, CodenamesView } from '../../src/shared/protocol';
import { randDelay } from '../cardkit';
import { chooseClue } from '../codenames-bot';
import { CODENAMES_WORDS } from '../content-extra';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';
import { PVOICE, voiceAnd, voiceCodeClue, voiceTeamWin } from '../voice-calls-party';

type Team = 'red' | 'blue';

interface State {
  settings: CodenamesSettings;
  participants: string[];
  teams: Record<Team, string[]>;
  spymasters: Record<Team, string | null>;
  phase: CodenamesView['phase'];
  words: string[];
  key: CodeColor[];
  revealed: boolean[];
  first: Team;
  turn: Team;
  clue: { word: string; n: number } | null;
  guessesLeft: number;
  proposals: Record<string, number>;
  winner: Team | null;
  reason: CodenamesView['reason'];
  log: CodenamesView['log'];
  /** why the last turn ended, shown for a few seconds */
  turnNote: { team: Team; text: string; until: number } | null;
  /** shown on the team screen (e.g. a team lost its last players) */
  notice: string | null;
  /** when the clue / guessing time runs out (null = no limit set) */
  endsAt: number | null;
  /** the bots of this game: only ever spymasters */
  bots: string[];
  /** counts the turns of the whole game (also across «جولة جديدة»), so a bot's clue is scheduled once per turn */
  turnNo: number;
  /** the clue a bot spymaster prepared for turn `turn` */
  botClue: { turn: number; word: string; n: number } | null;
}

/** why the last turn ended stays up this long */
const NOTE_MS = 6000;
const TEAM_NAME: Record<Team, string> = { red: 'الفريق الأحمر', blue: 'الفريق الأزرق' };
const COLOR_NAME: Record<CodeColor, string> = { red: 'للأحمر', blue: 'للأزرق', neutral: 'محايدة', assassin: 'الكلمة السوداء' };

const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red');
/** the time limit of the current phase in seconds (0 = none) */
const limitOf = (s: State) => (s.phase === 'clue' ? (s.settings.clueSeconds ?? 0) : s.phase === 'guess' ? (s.settings.guessSeconds ?? 0) : 0);
/** start the clock of the phase just entered (or clear it) */
function startClock(ctx: GameCtx, s: State) {
  const sec = limitOf(s);
  s.endsAt = sec > 0 ? ctx.now + sec * 1000 : null;
}
const teamOf = (s: State, id: string): Team | null => (s.teams.red.includes(id) ? 'red' : s.teams.blue.includes(id) ? 'blue' : null);
const left = (s: State, t: Team) => s.key.filter((k, i) => k === t && !s.revealed[i]).length;
const isBotSeat = (s: State, id: string) => (s.bots ?? []).includes(id);
/** the team's bot (always its spymaster), if it has one */
const botOf = (s: State, t: Team) => s.teams[t].find((id) => isBotSeat(s, id)) ?? null;
/** the people of a team who guess (not the spymaster, never a bot) */
const guessers = (s: State, t: Team) => s.teams[t].filter((id) => id !== s.spymasters[t] && !isBotSeat(s, id));
const TOO_MANY_BOTS = 'في «الكلمات السرية» بوتان على الأكثر، قائد لكل فريق — أخرجوا البوتات الزائدة';

/**
 * Split players into the two teams. Without bots: every other player, the first of each team its spymaster.
 * With bots: each bot leads a team (one per team) and the people join the smaller team (on a tie, the one without
 * a bot, which needs a spymaster and a guesser).
 */
function arrange(s: State, order: string[]) {
  const bots = order.filter((id) => isBotSeat(s, id));
  const people = order.filter((id) => !isBotSeat(s, id));
  if (!bots.length) {
    s.teams = { red: people.filter((_, i) => i % 2 === 0), blue: people.filter((_, i) => i % 2 === 1) };
    s.spymasters = { red: s.teams.red[0] ?? null, blue: s.teams.blue[0] ?? null };
    return;
  }
  const first: Team = Math.random() < 0.5 ? 'red' : 'blue';
  const teams: Record<Team, string[]> = { red: [], blue: [] };
  bots.slice(0, 2).forEach((b, i) => teams[i === 0 ? first : other(first)].push(b));
  for (const id of people) {
    const r = teams.red.length;
    const b = teams.blue.length;
    const t: Team = r !== b ? (r < b ? 'red' : 'blue') : teams.red.some((x) => isBotSeat(s, x)) ? 'blue' : 'red';
    teams[t].push(id);
  }
  s.teams = teams;
  s.spymasters = { red: botOf(s, 'red') ?? teams.red[0] ?? null, blue: botOf(s, 'blue') ?? teams.blue[0] ?? null };
}

function deal(s: State) {
  s.words = shuffle([...new Set(CODENAMES_WORDS)]).slice(0, 25);
  s.first = Math.random() < 0.5 ? 'red' : 'blue';
  const key: CodeColor[] = [
    ...Array(9).fill(s.first),
    ...Array(8).fill(other(s.first)),
    ...Array(s.settings.assassin ? 1 : 0).fill('assassin'),
  ];
  while (key.length < 25) key.push('neutral');
  s.key = shuffle(key);
  s.revealed = Array(25).fill(false);
  s.turn = s.first;
  s.clue = null;
  s.guessesLeft = 0;
  s.proposals = {};
  s.winner = null;
  s.reason = null;
  s.log = [];
  s.turnNote = null;
  s.turnNo = (s.turnNo ?? 0) + 1;
}

function endTurn(ctx: GameCtx, s: State, why: string) {
  s.turnNo = (s.turnNo ?? 0) + 1;
  s.turnNote = { team: s.turn, text: why, until: ctx.now + paced(ctx, NOTE_MS) };
  s.turn = other(s.turn);
  s.clue = null;
  s.guessesLeft = 0;
  s.proposals = {};
  s.phase = 'clue';
  startClock(ctx, s);
}

function reveal(ctx: GameCtx, s: State, by: string, i: number) {
  s.revealed[i] = true;
  const color = s.key[i];
  ctx.say?.(`«${s.words[i]}» من ${ctx.playerName(by)}: ${COLOR_NAME[color]}`, by);
  s.log[s.log.length - 1]?.picks.push({ word: s.words[i], color });
  s.proposals = Object.fromEntries(Object.entries(s.proposals).filter(([, v]) => v !== i));
  if (color === 'assassin') {
    s.phase = 'final';
    s.endsAt = null;
    s.winner = other(s.turn);
    s.reason = 'assassin';
    ctx.fx('boom', by);
    ctx.say?.(`الكلمة السوداء من ${ctx.playerName(by)}! الفوز ل${TEAM_NAME[s.winner].slice(1)}`, by, voiceAnd(PVOICE.assassin, voiceTeamWin(s.winner)));
    return;
  }
  for (const t of ['red', 'blue'] as Team[]) {
    if (left(s, t) === 0) {
      s.phase = 'final';
      s.endsAt = null;
      s.winner = t;
      s.reason = 'words';
      ctx.fx('win');
      ctx.say?.(`فاز ${TEAM_NAME[t]}: كشف كل كلماته`, undefined, voiceTeamWin(t));
      return;
    }
  }
  if (color === s.turn) {
    ctx.fx('correct', by);
    s.guessesLeft -= 1;
    if (s.guessesLeft <= 0) endTurn(ctx, s, 'انتهت التخمينات');
  } else {
    ctx.fx('buzz', by);
    endTurn(ctx, s, color === 'neutral' ? 'كلمة محايدة — انتهى دوركم' : 'كلمة للفريق الآخر');
  }
}

export const codenames: GameModule<State, CodenamesSettings> = {
  turnOf: (s) => s.phase === 'clue' ? [s.spymasters[s.turn] ?? ''] : s.phase === 'guess' ? s.teams[s.turn].filter((id) => id !== s.spymasters[s.turn]) : [],
  id: 'codenames',
  hostOnly: ['shuffle', 'swap', 'spymaster', 'begin'],

  start(ctx, participants, settings) {
    const bots = participants.filter((id) => ctx.isBot(id));
    if (bots.length > 2) throw new GameError(TOO_MANY_BOTS);
    const s: State = {
      settings,
      participants,
      teams: { red: [], blue: [] },
      spymasters: { red: null, blue: null },
      phase: 'teams',
      words: [],
      key: [],
      revealed: [],
      first: 'red',
      turn: 'red',
      clue: null,
      guessesLeft: 0,
      proposals: {},
      winner: null,
      reason: null,
      log: [],
      turnNote: null,
      notice: null,
      endsAt: null,
      bots,
      turnNo: 0,
      botClue: null,
    };
    arrange(s, shuffle(participants));
    ctx.fx('start');
    return s;
  },

  act(ctx, s, by, a) {
    const myTeam = teamOf(s, by);
    if (s.phase === 'teams') {
      if (a.type === 'shuffle') {
        arrange(s, shuffle(s.participants));
      } else if (a.type === 'swap' && isStr(a.id)) {
        const t = teamOf(s, a.id);
        if (!t) return;
        const o = other(t);
        if (isBotSeat(s, a.id)) {
          // a bot moves only to a team without a bot, and leads it
          if (botOf(s, o)) throw new GameError('لكل فريق بوت واحد على الأكثر، وهو قائده');
          s.teams[t] = s.teams[t].filter((x) => x !== a.id);
          s.teams[o].push(a.id);
          s.spymasters[o] = a.id;
          s.spymasters[t] = s.teams[t][0] ?? null;
          return;
        }
        s.teams[t] = s.teams[t].filter((x) => x !== a.id);
        s.teams[o].push(a.id);
        if (s.spymasters[t] === a.id) s.spymasters[t] = botOf(s, t) ?? s.teams[t][0] ?? null;
        if (!s.spymasters[o]) s.spymasters[o] = a.id;
      } else if (a.type === 'spymaster' && isStr(a.id)) {
        const t = teamOf(s, a.id);
        if (!t || isBotSeat(s, a.id)) return;
        if (botOf(s, t)) throw new GameError('قائد هذا الفريق بوت، والبوت لا يخمّن — انقلوا البوت إلى الفريق الآخر أولاً');
        s.spymasters[t] = a.id;
      } else if (a.type === 'begin') {
        for (const t of ['red', 'blue'] as Team[]) {
          if (s.spymasters[t] && guessers(s, t).length) continue;
          throw new GameError(botOf(s, t) ? `${TEAM_NAME[t]} قائده بوت، ويحتاج لاعباً واحداً على الأقل للتخمين` : 'كل فريق يحتاج لاعبين على الأقل');
        }
        s.notice = null;
        deal(s);
        s.phase = 'clue';
        startClock(ctx, s);
        ctx.fx('start');
      }
      return;
    }
    if (s.phase === 'final') {
      if (a.type === 'again') {
        s.phase = 'teams';
        s.endsAt = null;
        // the spymaster role moves to the next player of each team (a bot stays its team's spymaster)
        for (const t of ['red', 'blue'] as Team[]) {
          const bot = botOf(s, t);
          if (bot) {
            s.spymasters[t] = bot;
            continue;
          }
          const list = s.teams[t];
          const i = list.indexOf(s.spymasters[t] ?? '');
          s.spymasters[t] = list[(i + 1) % list.length] ?? null;
        }
      }
      return;
    }
    if (!myTeam) return;

    if (a.type === 'clue') {
      if (s.phase !== 'clue' || s.spymasters[s.turn] !== by) throw new GameError('القائد فقط يعطي التلميح');
      const word = isStr(a.word) ? a.word.trim().slice(0, 24) : '';
      const n = isNum(a.n) ? Math.max(0, Math.min(9, Math.round(a.n))) : 1;
      if (!word || /\s/.test(word)) throw new GameError('التلميح كلمة واحدة فقط');
      if (s.words.some((w, i) => !s.revealed[i] && w === word)) throw new GameError('لا يمكن استعمال كلمة من الشبكة');
      s.clue = { word, n };
      s.guessesLeft = n === 0 ? 25 : n + 1;
      s.phase = 'guess';
      startClock(ctx, s);
      s.log.push({ team: s.turn, clue: word, n, picks: [] });
      ctx.fx('reveal');
      // the clue as every screen shows it (the spymaster gives it publicly)
      ctx.say?.(`تلميح ${TEAM_NAME[s.turn]}: «${word}» ${n === 0 ? '∞' : n}`, by, voiceCodeClue(word, n));
      return;
    }
    if (s.phase !== 'guess' || myTeam !== s.turn || s.spymasters[myTeam] === by) return;
    if (a.type === 'point' && isNum(a.index)) {
      if (s.revealed[a.index]) return;
      if (s.proposals[by] === a.index) delete s.proposals[by];
      else s.proposals[by] = a.index;
      return;
    }
    if (a.type === 'reveal' && isNum(a.index)) {
      if (a.index < 0 || a.index > 24 || s.revealed[a.index]) return;
      reveal(ctx, s, by, a.index);
      return;
    }
    if (a.type === 'pass') {
      if (!s.log[s.log.length - 1]?.picks.length) throw new GameError('اكشفوا كلمة واحدة على الأقل قبل إنهاء الدور');
      endTurn(ctx, s, 'أنهى الفريق دوره');
      ctx.say?.(`انتهى الدور بطلب من ${ctx.playerName(by)}`, by);
    }
  },

  tick(ctx, s) {
    let changed = false;
    if (s.endsAt !== null && ctx.now >= s.endsAt && (s.phase === 'clue' || s.phase === 'guess')) {
      // time's up: no clue → the other team plays; guessing → the team's turn ends
      const team = TEAM_NAME[s.turn];
      if (s.phase === 'clue') {
        endTurn(ctx, s, 'انتهى وقت التلميح');
        ctx.say?.(`انتهى وقت التلميح ل${team.slice(1)}`, undefined, PVOICE.timeUp);
      } else {
        endTurn(ctx, s, 'انتهى وقت التخمين');
        ctx.say?.(`انتهى وقت التخمين ل${team.slice(1)}`, undefined, PVOICE.timeUp);
      }
      ctx.fx('buzz');
      changed = true;
    }
    if (s.turnNote && ctx.now >= s.turnNote.until) {
      s.turnNote = null;
      changed = true;
    }
    return changed;
  },

  view(ctx, s, me): CodenamesView {
    const myTeam = teamOf(s, me);
    const amSpymaster = !!myTeam && s.spymasters[myTeam] === me;
    const seeAll = amSpymaster || s.phase === 'final';
    return {
      game: 'codenames',
      phase: s.phase,
      participants: s.participants,
      teams: s.teams,
      spymasters: s.spymasters,
      myTeam,
      amSpymaster,
      words: s.words,
      colors: s.key.map((k, i) => (seeAll || s.revealed[i] ? k : null)),
      revealed: s.revealed,
      turn: s.turn,
      clue: s.clue,
      guessesLeft: s.guessesLeft,
      proposals: s.proposals,
      left: { red: s.words.length ? left(s, 'red') : 0, blue: s.words.length ? left(s, 'blue') : 0 },
      winner: s.winner,
      reason: s.reason,
      log: s.log,
      turnNote: s.turnNote ? { team: s.turnNote.team, text: s.turnNote.text } : null,
      notice: s.phase === 'teams' ? s.notice : null,
      endsAt: s.endsAt,
      seconds: limitOf(s),
    };
  },

  onLeave(ctx, s, id) {
    for (const t of ['red', 'blue'] as Team[]) {
      s.teams[t] = s.teams[t].filter((x) => x !== id);
      if (s.spymasters[t] === id) s.spymasters[t] = botOf(s, t) ?? s.teams[t][0] ?? null;
    }
    s.participants = s.participants.filter((x) => x !== id);
    s.bots = (s.bots ?? []).filter((x) => x !== id);
    delete s.proposals[id];
    if (s.phase !== 'clue' && s.phase !== 'guess') return;
    // a team without a spymaster and at least one person guessing can't play on
    const broken = (['red', 'blue'] as Team[]).find((t) => !s.spymasters[t] || !guessers(s, t).length);
    if (broken) {
      s.phase = 'teams';
      s.endsAt = null;
      s.clue = null;
      s.guessesLeft = 0;
      s.proposals = {};
      s.turnNote = null;
      s.notice = `${broken === 'red' ? 'الفريق الأحمر' : 'الفريق الأزرق'} لم يعد فيه قائد ولاعب يخمّن — رتّبوا الفرق من جديد`;
      ctx.fx('reveal');
    }
  },

  botPlan(ctx, s, bots) {
    // a bot is only ever a spymaster: it gives its team's clue, after thinking a few seconds like a person
    if (s.phase !== 'clue') return;
    const id = s.spymasters[s.turn];
    if (!id || !bots.includes(id)) return;
    const turn = s.turnNo ?? 0;
    if (s.botClue?.turn !== turn) {
      const clue = chooseClue({ words: s.words, key: s.key, revealed: s.revealed }, s.turn, botLevel(ctx), s.log.map((l) => l.clue));
      s.botClue = { turn, word: clue.word, n: clue.n };
    }
    const level = botLevel(ctx);
    let delay = level === 'easy' ? randDelay(3000, 6000) : level === 'smart' ? randDelay(4000, 7500) : randDelay(4500, 8500);
    // well within the clue time (the room's pace still stretches it)
    const limit = s.settings.clueSeconds ?? 0;
    if (limit) delay = Math.min(delay, limit * 1000 * 0.2);
    ctx.bot(id, `clue:${turn}`, delay, { type: 'clue', word: s.botClue.word, n: s.botClue.n });
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    return { places: [s.teams[s.winner].slice(), s.teams[other(s.winner)].slice()] };
  },
};
