/**
 * «حروف» — two teams, a 5×5 grid of letter hexagons.
 * The team whose turn it is picks a letter; a question appears whose answer starts with that letter.
 * The first player to answer correctly wins the hexagon for their team. A wrong answer locks that
 * team out and the other team gets the chance. Red joins right ↔ left, green joins top ↔ bottom.
 */
import { firstLetter } from '../../src/shared/arabic';
import { HEX_N, hexWinPath } from '../../src/shared/islamic';
import type { HuroofSettings, HuroofTeam, HuroofView } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { QUESTIONS, type Question } from '../content-islamic';
import { GameError, type GameModule } from '../types';
import { isNum, shuffle } from '../util';
import { mcqOptions } from './mcq';

const SKILL = 0.65;
const other = (t: HuroofTeam): HuroofTeam => (t === 'red' ? 'green' : 'red');

/** Questions grouped by the first letter of their answer (only real letters, not numbers). */
export const BY_LETTER: Map<string, Question[]> = (() => {
  const m = new Map<string, Question[]>();
  for (const q of QUESTIONS) {
    const l = firstLetter(q.a);
    if (!/[ء-ي]/.test(l)) continue;
    if (!m.has(l)) m.set(l, []);
    m.get(l)!.push(q);
  }
  return m;
})();

interface State {
  settings: HuroofSettings;
  teams: Record<HuroofTeam, string[]>;
  cells: { letter: string; owner: HuroofTeam | null }[];
  decks: Record<string, Question[]>;
  phase: HuroofView['phase'];
  turn: HuroofTeam;
  cell: number | null;
  question: { text: string; options: string[]; correct: number } | null;
  canAnswer: HuroofTeam[];
  endsAt: number | null;
  attempt: number;
  last: HuroofView['last'];
  lastN: number;
  winner: HuroofTeam | null;
  winPath: number[] | null;
  feed: Feed;
}

const teamOf = (s: State, id: string): HuroofTeam | null => (s.teams.red.includes(id) ? 'red' : s.teams.green.includes(id) ? 'green' : null);
const TEAM_NAME: Record<HuroofTeam, string> = { red: 'الفريق الأحمر', green: 'الفريق الأخضر' };

function drawQuestion(s: State, letter: string) {
  if (!s.decks[letter]?.length) s.decks[letter] = shuffle(BY_LETTER.get(letter) ?? []);
  const q = s.decks[letter].shift()!;
  return { text: q.q, ...mcqOptions(q.a, q.w) };
}

function settle(s: State, team: HuroofTeam | null, by: string | null) {
  const i = s.cell!;
  const q = s.question!;
  s.last = { cell: i, team, answer: q.options[q.correct], by, id: ++s.lastN };
  if (team) {
    s.cells[i].owner = team;
    s.turn = team;
    const path = hexWinPath(s.cells.map((c) => c.owner), team);
    if (path) {
      s.winner = team;
      s.winPath = path;
      s.phase = 'final';
    } else if (s.cells.every((c) => c.owner)) {
      const red = s.cells.filter((c) => c.owner === 'red').length;
      s.winner = red * 2 > s.cells.length ? 'red' : 'green';
      s.phase = 'final';
    }
  } else s.turn = other(s.turn);
  if (s.phase !== 'final') s.phase = 'pick';
  s.cell = null;
  s.question = null;
  s.canAnswer = [];
  s.endsAt = null;
}

export const huroof: GameModule<State, HuroofSettings> = {
  id: 'huroof',

  start(ctx, participants, settings) {
    const order = shuffle(participants);
    const teams: Record<HuroofTeam, string[]> = { red: [], green: [] };
    order.forEach((p, i) => teams[i % 2 ? 'green' : 'red'].push(p));
    const letters = shuffle([...BY_LETTER.keys()]).slice(0, HEX_N * HEX_N);
    ctx.fx('start');
    return {
      settings,
      teams,
      cells: letters.map((letter) => ({ letter, owner: null })),
      decks: {},
      phase: 'pick',
      turn: Math.random() < 0.5 ? 'red' : 'green',
      cell: null,
      question: null,
      canAnswer: [],
      endsAt: null,
      attempt: 0,
      last: null,
      lastN: 0,
      winner: null,
      winPath: null,
      feed: new Feed(),
    };
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    const team = teamOf(s, by);
    if (!team) return;
    if (a.type === 'pick') {
      if (s.phase !== 'pick') return;
      if (team !== s.turn) throw new GameError('ليس دور فريقك في الاختيار');
      if (!isNum(a.cell) || !s.cells[a.cell] || s.cells[a.cell].owner) return;
      s.cell = a.cell;
      s.question = drawQuestion(s, s.cells[a.cell].letter);
      s.canAnswer = ['red', 'green'];
      s.phase = 'question';
      s.attempt += 1;
      s.endsAt = ctx.now + s.settings.seconds * 1000;
      ctx.fx('reveal');
      return;
    }
    if (a.type === 'answer') {
      if (s.phase !== 'question' || !s.question || !isNum(a.choice)) return;
      if (!s.canAnswer.includes(team)) throw new GameError('فريقك أجاب على هذا السؤال');
      if (a.choice === s.question.correct) {
        s.feed.push(`${ctx.playerName(by)} أجاب صحيحاً — الحرف لـ${TEAM_NAME[team]}`, { by });
        ctx.fx('correct', by);
        settle(s, team, by);
        if (s.winner) ctx.fx('win');
      } else {
        s.feed.push(`${ctx.playerName(by)} أخطأ`, { by });
        ctx.fx('buzz', by);
        s.canAnswer = s.canAnswer.filter((t) => t !== team);
        s.attempt += 1;
        if (!s.canAnswer.length) settle(s, null, null);
        else s.endsAt = ctx.now + s.settings.seconds * 1000;
      }
    }
  },

  tick(ctx, s) {
    if (s.phase !== 'question' || s.endsAt === null || ctx.now < s.endsAt) return false;
    s.feed.push('انتهى الوقت');
    settle(s, null, null);
    return true;
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'pick') {
      // a team of bots only picks for itself
      const members = s.teams[s.turn];
      if (!members.length || !members.every((m) => ctx.isBot(m))) return;
      const free = s.cells.map((c, i) => (c.owner ? -1 : i)).filter((i) => i >= 0);
      ctx.bot(members[0], `pick:${s.attempt}`, randDelay(1500, 2500), { type: 'pick', cell: free[Math.floor(Math.random() * free.length)] });
      return;
    }
    if (s.phase !== 'question' || !s.question) return;
    const q = s.question;
    for (const t of s.canAnswer) {
      const bot = s.teams[t].find((m) => bots.includes(m));
      if (!bot) continue;
      const humans = s.teams[t].some((m) => !ctx.isBot(m) && ctx.isConnected(m));
      const total = s.settings.seconds * 1000;
      const right = Math.random() < SKILL;
      const wrong = [...q.options.keys()].filter((k) => k !== q.correct);
      // with humans on the team, the bot waits longer so people get to answer first
      const delay = humans ? randDelay(total * 0.55, total * 0.9) : randDelay(2500, total * 0.7);
      ctx.bot(bot, `ans:${s.attempt}:${t}`, delay, { type: 'answer', choice: right ? q.correct : wrong[Math.floor(Math.random() * wrong.length)] });
    }
  },

  view(ctx, s): HuroofView {
    return {
      game: 'huroof',
      phase: s.phase,
      teams: s.teams,
      cells: s.cells,
      turn: s.turn,
      cell: s.cell,
      question: s.question ? { text: s.question.text, options: s.question.options } : null,
      canAnswer: s.canAnswer,
      endsAt: s.endsAt,
      last: s.last,
      winner: s.winner,
      winPath: s.winPath,
      feed: s.feed.list(),
    };
  },
};
