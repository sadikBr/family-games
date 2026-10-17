/**
 * «حروف» — two teams, a 5×5 grid of letter hexagons.
 * The team whose turn it is picks a letter; a question appears whose answer starts with that letter.
 * Like the TV show, the first player to press the buzzer answers — here by typing it (spelling slips
 * are forgiven, see answerMatches). Right: the hexagon is theirs. Wrong or too slow: that team is
 * locked out and the other team can buzz. Red joins right ↔ left, green joins top ↔ bottom.
 */
import { answerMatches, firstLetter } from '../../src/shared/arabic';
import { HEX_N, hexWinPath } from '../../src/shared/islamic';
import type { HuroofSettings, HuroofTeam, HuroofView } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { QUESTIONS, type Question } from '../content-islamic';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';

const SKILL = 0.65;
const ANSWER_MS = 20_000;
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
  question: { text: string; answer: string; wrong: string[] } | null;
  canAnswer: HuroofTeam[];
  buzzer: string | null;
  endsAt: number | null;
  timerTotal: number;
  wrong: HuroofView['wrong'];
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
  return { text: q.q, answer: q.a, wrong: q.w };
}

/** Open (or reopen) the buzzers for the teams that may still answer. */
function openBuzzers(ctx: GameCtx, s: State) {
  s.phase = 'question';
  s.buzzer = null;
  s.timerTotal = s.settings.seconds * 1000;
  s.endsAt = ctx.now + s.timerTotal;
}

/** A wrong (or missing) answer: lock that team out, give the other team its chance. */
function miss(ctx: GameCtx, s: State, team: HuroofTeam) {
  s.canAnswer = s.canAnswer.filter((t) => t !== team);
  s.attempt += 1;
  if (!s.canAnswer.length) settle(s, null, null);
  else openBuzzers(ctx, s);
}

function settle(s: State, team: HuroofTeam | null, by: string | null) {
  const i = s.cell!;
  const q = s.question!;
  s.last = { cell: i, team, answer: q.answer, by, id: ++s.lastN };
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
  s.buzzer = null;
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
      buzzer: null,
      endsAt: null,
      timerTotal: settings.seconds * 1000,
      wrong: null,
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
      s.attempt += 1;
      s.wrong = null;
      openBuzzers(ctx, s);
      ctx.fx('reveal');
      return;
    }
    if (a.type === 'buzz') {
      if (s.phase !== 'question') return;
      if (!s.canAnswer.includes(team)) throw new GameError('فريقك أخطأ في هذا السؤال');
      s.phase = 'answer';
      s.buzzer = by;
      s.timerTotal = ANSWER_MS;
      s.endsAt = ctx.now + ANSWER_MS;
      s.feed.push(`${ctx.playerName(by)} ضغط الجرس!`, { by });
      ctx.fx('throw', by);
      return;
    }
    if (a.type === 'answer') {
      if (s.phase !== 'answer' || !s.question || s.buzzer !== by || !isStr(a.text)) return;
      const text = a.text.trim().slice(0, 60);
      if (!text) return;
      if (answerMatches(text, s.question.answer)) {
        s.feed.push(`${ctx.playerName(by)} أجاب صحيحاً — الحرف لـ${TEAM_NAME[team]}`, { by });
        ctx.fx('correct', by);
        settle(s, team, by);
        if (s.winner) ctx.fx('win');
      } else {
        s.wrong = { by, text, id: ++s.lastN };
        s.feed.push(`${ctx.playerName(by)}: «${text}» — خطأ`, { by });
        ctx.fx('buzz', by);
        miss(ctx, s, team);
      }
    }
  },

  tick(ctx, s) {
    if ((s.phase !== 'question' && s.phase !== 'answer') || s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'answer' && s.buzzer) {
      // the player who buzzed ran out of time: counts as a wrong answer
      const team = teamOf(s, s.buzzer)!;
      s.wrong = { by: s.buzzer, text: '…', id: ++s.lastN };
      s.feed.push(`انتهى وقت ${ctx.playerName(s.buzzer)}`, { by: s.buzzer });
      miss(ctx, s, team);
    } else {
      s.feed.push('انتهى الوقت — لم يضغط أحد الجرس');
      settle(s, null, null);
    }
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
    if (!s.question) return;
    const q = s.question;
    if (s.phase === 'question') {
      for (const t of s.canAnswer) {
        const bot = s.teams[t].find((m) => bots.includes(m));
        if (!bot) continue;
        const humans = s.teams[t].some((m) => !ctx.isBot(m) && ctx.isConnected(m));
        const total = s.settings.seconds * 1000;
        // with humans on the team, the bot waits longer so people get to buzz first
        const delay = humans ? randDelay(total * 0.55, total * 0.9) : randDelay(2500, total * 0.7);
        ctx.bot(bot, `buzz:${s.attempt}:${t}`, delay, { type: 'buzz' });
      }
    }
    if (s.phase === 'answer' && s.buzzer && bots.includes(s.buzzer)) {
      const right = Math.random() < SKILL;
      const text = right ? q.answer : q.wrong[Math.floor(Math.random() * q.wrong.length)];
      ctx.bot(s.buzzer, `ans:${s.attempt}`, randDelay(2500, 5000), { type: 'answer', text });
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
      question: s.question ? { text: s.question.text } : null,
      canAnswer: s.canAnswer,
      buzzer: s.buzzer,
      endsAt: s.endsAt,
      timerTotal: s.timerTotal,
      wrong: s.wrong,
      last: s.last,
      winner: s.winner,
      winPath: s.winPath,
      feed: s.feed.list(),
    };
  },
};
