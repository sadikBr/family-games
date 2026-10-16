/**
 * الكلمات السرية — two teams, 25 words. Each team's spymaster sees which words are theirs
 * and gives a one-word clue + a number. Team-mates point at words and reveal them.
 * Find all your words first. Revealing the assassin loses immediately.
 */
import type { CodeColor, CodenamesSettings, CodenamesView } from '../../src/shared/protocol';
import { CODENAMES_WORDS } from '../content-extra';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';

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
}

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
}

function endTurn(s: State) {
  s.turn = other(s.turn);
  s.clue = null;
  s.guessesLeft = 0;
  s.proposals = {};
  s.phase = 'clue';
}

function reveal(ctx: GameCtx, s: State, by: string, i: number) {
  s.revealed[i] = true;
  const color = s.key[i];
  s.log[s.log.length - 1]?.picks.push({ word: s.words[i], color });
  s.proposals = Object.fromEntries(Object.entries(s.proposals).filter(([, v]) => v !== i));
  if (color === 'assassin') {
    s.phase = 'final';
    s.winner = other(s.turn);
    s.reason = 'assassin';
    ctx.fx('boom', by);
    return;
  }
  for (const t of ['red', 'blue'] as Team[]) {
    if (left(s, t) === 0) {
      s.phase = 'final';
      s.winner = t;
      s.reason = 'words';
      ctx.fx('win');
      return;
    }
  }
  if (color === s.turn) {
    ctx.fx('correct', by);
    s.guessesLeft -= 1;
    if (s.guessesLeft <= 0) endTurn(s);
  } else {
    ctx.fx('buzz', by);
    endTurn(s);
  }
}

export const codenames: GameModule<State, CodenamesSettings> = {
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
    if (a.type === 'pass') endTurn(s);
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
    };
  },

  onLeave(ctx, s, id) {
    for (const t of ['red', 'blue'] as Team[]) {
      s.teams[t] = s.teams[t].filter((x) => x !== id);
      if (s.spymasters[t] === id) s.spymasters[t] = s.teams[t][0] ?? null;
    }
    s.participants = s.participants.filter((x) => x !== id);
    delete s.proposals[id];
  },
};
