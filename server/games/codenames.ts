/**
 * الكلمات السرية — two teams, 25 words. Each team's spymaster sees which words are theirs
 * and gives a one-word clue + a number. Team-mates point at words and reveal them.
 * Find all your words first. Revealing the assassin loses immediately.
 */
import type { CodeColor, CodenamesSettings, CodenamesView } from '../../src/shared/protocol';
import { CODENAMES_WORDS } from '../content-extra';
import { GameError, type GameCtx, type GameModule } from '../types';
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
}

/** why the last turn ended stays up this long */
const NOTE_MS = 6000;
const TEAM_NAME: Record<Team, string> = { red: 'الفريق الأحمر', blue: 'الفريق الأزرق' };
const COLOR_NAME: Record<CodeColor, string> = { red: 'للأحمر', blue: 'للأزرق', neutral: 'محايدة', assassin: 'الكلمة السوداء' };

const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red');
const teamOf = (s: State, id: string): Team | null => (s.teams.red.includes(id) ? 'red' : s.teams.blue.includes(id) ? 'blue' : null);
const left = (s: State, t: Team) => s.key.filter((k, i) => k === t && !s.revealed[i]).length;

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
}

function endTurn(ctx: GameCtx, s: State, why: string) {
  s.turnNote = { team: s.turn, text: why, until: ctx.now + NOTE_MS };
  s.turn = other(s.turn);
  s.clue = null;
  s.guessesLeft = 0;
  s.proposals = {};
  s.phase = 'clue';
}

function reveal(ctx: GameCtx, s: State, by: string, i: number) {
  s.revealed[i] = true;
  const color = s.key[i];
  ctx.say?.(`«${s.words[i]}» من ${ctx.playerName(by)}: ${COLOR_NAME[color]}`, by);
  s.log[s.log.length - 1]?.picks.push({ word: s.words[i], color });
  s.proposals = Object.fromEntries(Object.entries(s.proposals).filter(([, v]) => v !== i));
  if (color === 'assassin') {
    s.phase = 'final';
    s.winner = other(s.turn);
    s.reason = 'assassin';
    ctx.fx('boom', by);
    ctx.say?.(`الكلمة السوداء من ${ctx.playerName(by)}! الفوز ل${TEAM_NAME[s.winner].slice(1)}`, by, voiceAnd(PVOICE.assassin, voiceTeamWin(s.winner)));
    return;
  }
  for (const t of ['red', 'blue'] as Team[]) {
    if (left(s, t) === 0) {
      s.phase = 'final';
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
    const order = shuffle(participants);
    const red = order.filter((_, i) => i % 2 === 0);
    const blue = order.filter((_, i) => i % 2 === 1);
    const s: State = {
      settings,
      participants,
      teams: { red, blue },
      spymasters: { red: red[0] ?? null, blue: blue[0] ?? null },
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
    };
    ctx.fx('start');
    return s;
  },

  act(ctx, s, by, a) {
    const myTeam = teamOf(s, by);
    if (s.phase === 'teams') {
      if (a.type === 'shuffle') {
        const order = shuffle(s.participants);
        s.teams = { red: order.filter((_, i) => i % 2 === 0), blue: order.filter((_, i) => i % 2 === 1) };
        s.spymasters = { red: s.teams.red[0] ?? null, blue: s.teams.blue[0] ?? null };
      } else if (a.type === 'swap' && isStr(a.id)) {
        const t = teamOf(s, a.id);
        if (!t) return;
        s.teams[t] = s.teams[t].filter((x) => x !== a.id);
        s.teams[other(t)].push(a.id);
        if (s.spymasters[t] === a.id) s.spymasters[t] = s.teams[t][0] ?? null;
        if (!s.spymasters[other(t)]) s.spymasters[other(t)] = a.id;
      } else if (a.type === 'spymaster' && isStr(a.id)) {
        const t = teamOf(s, a.id);
        if (t) s.spymasters[t] = a.id;
      } else if (a.type === 'begin') {
        if (s.teams.red.length < 2 || s.teams.blue.length < 2) throw new GameError('كل فريق يحتاج لاعبين على الأقل');
        s.notice = null;
        deal(s);
        s.phase = 'clue';
        ctx.fx('start');
      }
      return;
    }
    if (s.phase === 'final') {
      if (a.type === 'again') {
        s.phase = 'teams';
        // the spymaster role moves to the next player of each team
        for (const t of ['red', 'blue'] as Team[]) {
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
    if (s.turnNote && ctx.now >= s.turnNote.until) {
      s.turnNote = null;
      return true;
    }
    return false;
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
    };
  },

  onLeave(ctx, s, id) {
    for (const t of ['red', 'blue'] as Team[]) {
      s.teams[t] = s.teams[t].filter((x) => x !== id);
      if (s.spymasters[t] === id) s.spymasters[t] = s.teams[t][0] ?? null;
    }
    s.participants = s.participants.filter((x) => x !== id);
    delete s.proposals[id];
    if (s.phase !== 'clue' && s.phase !== 'guess') return;
    // a team without a spymaster and at least one guesser can't play on
    const broken = (['red', 'blue'] as Team[]).find((t) => s.teams[t].length < 2 || !s.spymasters[t]);
    if (broken) {
      s.phase = 'teams';
      s.clue = null;
      s.guessesLeft = 0;
      s.proposals = {};
      s.turnNote = null;
      s.notice = `${broken === 'red' ? 'الفريق الأحمر' : 'الفريق الأزرق'} لم يعد فيه قائد ولاعب يخمّن — رتّبوا الفرق من جديد`;
      ctx.fx('reveal');
    }
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    return { places: [s.teams[s.winner].slice(), s.teams[other(s.winner)].slice()] };
  },
};
