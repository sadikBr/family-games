/**
 * «حروف» — two teams, a 5×5 grid of letter hexagons.
 * The team whose turn it is picks a letter; a question appears whose answer starts with that letter.
 * Like the TV show, the first player to press the buzzer answers — here by typing it (spelling slips
 * are forgiven, see answerMatches). Right: the hexagon is theirs. Wrong or too slow: that team is
 * locked out and the other team can buzz. Red joins right ↔ left, green joins top ↔ bottom.
 */
import { answerMatches, displayLetter, firstLetter } from '../../src/shared/arabic';
import { HEX_N, hexWinPath } from '../../src/shared/islamic';
import type { HuroofSettings, HuroofTeam, HuroofView } from '../../src/shared/protocol';
import { huroofPick } from '../ai/social-huroof';
import { quizSkill, readMs } from '../ai/social-quiz';
import { Feed, randDelay } from '../cardkit';
import { QUESTIONS, type Question } from '../content-islamic';
import { qdeck } from '../qdeck';
import { botLevel, GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';
import { PVOICE, voiceAnd, voiceAnswer, voiceCell, voiceLetter, voiceTeamWin } from '../voice-calls-party';

/** how often an easy bot's answer is right (smart / expert bots know more: see ai/social-quiz) */
const SKILL = 0.65;
/** a bot that doesn't know the answer and tries anyway (nothing to lose) is right this often */
const LUCKY = 0.2;
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
  used: Set<Question>; // questions already asked in this game
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
  /** smart / expert bots: whether each bot knows the current question's answer (`${attempt}|${bot}`) */
  botKnows?: Record<string, boolean>;
}

const teamOf = (s: State, id: string): HuroofTeam | null => (s.teams.red.includes(id) ? 'red' : s.teams.green.includes(id) ? 'green' : null);
const TEAM_NAME: Record<HuroofTeam, string> = { red: 'الفريق الأحمر', green: 'الفريق الأخضر' };

/** Questions for `letter` not asked yet in this game. */
const fresh = (s: State, letter: string) => (BY_LETTER.get(letter) ?? []).filter((q) => !s.used.has(q)).length;

/**
 * The room's deck for the letter (huroof's own, not shared with the other quiz games), skipping questions
 * already asked in this game whenever possible.
 */
function drawQuestion(ctx: GameCtx, s: State, letter: string) {
  const q = qdeck(ctx, `huroof:${letter}`, BY_LETTER.get(letter) ?? []).draw((x) => s.used.has(x));
  s.used.add(q);
  return { text: q.q, answer: q.a, wrong: q.w };
}

/**
 * A free hexagon whose letter has no unasked question left would bring back a question whose answer
 * everyone just saw: give it a letter that isn't on the board and still has questions.
 */
export function refreshLetter(s: State, i: number): boolean {
  const cell = s.cells[i];
  if (cell.owner || fresh(s, cell.letter)) return false;
  const onBoard = new Set(s.cells.map((c) => c.letter));
  const spare = shuffle([...BY_LETTER.keys()].filter((l) => !onBoard.has(l) && fresh(s, l)));
  if (!spare.length) return false;
  const old = cell.letter;
  cell.letter = spare[0];
  s.feed.push(`نفدت أسئلة «${displayLetter(old)}» — صارت الخانة «${displayLetter(cell.letter)}»`);
  return true;
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
  if (!s.canAnswer.length) {
    ctx.say?.(`لم يأخذ أحد الحرف: الجواب «${s.question?.answer ?? ''}»`, undefined, voiceAnd(PVOICE.wrong, voiceAnswer(s.question?.answer ?? '')));
    settle(s, null, null);
  } else openBuzzers(ctx, s);
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
  } else {
    s.turn = other(s.turn);
    refreshLetter(s, i); // swap the letter now, so players see the new one before picking again
  }
  if (s.phase !== 'final') s.phase = 'pick';
  s.cell = null;
  s.question = null;
  s.canAnswer = [];
  s.buzzer = null;
  s.endsAt = null;
}

export const huroof: GameModule<State, HuroofSettings> = {
  turnOf: (s) => s.phase === 'pick' ? s.teams[s.turn] : s.phase === 'answer' && s.buzzer ? [s.buzzer] : [],
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
      used: new Set(),
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
      refreshLetter(s, a.cell);
      s.question = drawQuestion(ctx, s, s.cells[a.cell].letter);
      s.canAnswer = ['red', 'green'];
      s.attempt += 1;
      s.wrong = null;
      openBuzzers(ctx, s);
      ctx.fx('reveal');
      // the letter and the question, read aloud for everyone
      ctx.say?.(`حرف «${displayLetter(s.cells[a.cell].letter)}» باختيار ${ctx.playerName(by)}: من يضغط أولاً؟`, by, `${voiceLetter(s.cells[a.cell].letter)}. ${s.question.text}`);
      return;
    }
    if (a.type === 'buzz') {
      if (s.phase !== 'question') return;
      if (!s.canAnswer.includes(team)) throw new GameError('فريقك أخطأ في هذا السؤال');
      s.phase = 'answer';
      s.buzzer = by;
      s.timerTotal = ANSWER_MS;
      s.endsAt = ctx.now + ANSWER_MS;
      s.feed.push(`أول من ضغط الجرس: ${ctx.playerName(by)}`, { by });
      ctx.fx('throw', by);
      ctx.say?.(`الجرس لـ${ctx.playerName(by)}: في انتظار الجواب`, by);
      return;
    }
    if (a.type === 'answer') {
      if (s.phase !== 'answer' || !s.question || s.buzzer !== by || !isStr(a.text)) return;
      const text = a.text.trim().slice(0, 60);
      if (!text) return;
      if (answerMatches(text, s.question.answer)) {
        s.feed.push(`جواب صحيح من ${ctx.playerName(by)} — الحرف ل${TEAM_NAME[team].slice(1)}`, { by });
        ctx.fx('correct', by);
        const said = `${ctx.playerName(by)}: «${s.question.answer}» صحيح — الحرف ل${TEAM_NAME[team].slice(1)}`;
        settle(s, team, by);
        if (s.winner) ctx.fx('win');
        // the cell, or the winning path (a full path, or every cell taken)
        ctx.say?.(said, by, s.winner ? voiceAnd(s.winPath ? PVOICE.fullPath : null, voiceTeamWin(s.winner)) : voiceAnd(PVOICE.right, voiceCell(team)));
      } else {
        s.wrong = { by, text, id: ++s.lastN };
        s.feed.push(`${ctx.playerName(by)}: «${text}» — خطأ`, { by });
        ctx.fx('buzz', by);
        ctx.say?.(`${ctx.playerName(by)}: «${text}» خطأ`, by, PVOICE.wrong);
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
      ctx.say?.(`انتهى وقت ${ctx.playerName(s.buzzer)}`, s.buzzer, PVOICE.timeUp);
      miss(ctx, s, team);
    } else {
      s.feed.push('انتهى الوقت — لم يضغط أحد الجرس');
      ctx.say?.(`انتهى الوقت: الجواب «${s.question?.answer ?? ''}»`, undefined, voiceAnd(PVOICE.timeUp, voiceAnswer(s.question?.answer ?? '')));
      settle(s, null, null);
    }
    return true;
  },

  botPlan(ctx, s, bots) {
    const level = botLevel(ctx);
    if (s.phase === 'pick') {
      // a team of bots only picks for itself
      const members = s.teams[s.turn];
      if (!members.length || !members.every((m) => ctx.isBot(m))) return;
      const cell = huroofPick(
        s.cells.map((c) => c.owner),
        s.turn,
        level,
      );
      ctx.bot(members[0], `pick:${s.attempt}`, randDelay(1500, 2500), { type: 'pick', cell });
      return;
    }
    if (!s.question) return;
    const q = s.question;
    const total = s.settings.seconds * 1000;
    if (level === 'easy') {
      // the old bots: always buzz, right about two times in three
      if (s.phase === 'question') {
        for (const t of s.canAnswer) {
          const bot = s.teams[t].find((m) => bots.includes(m));
          if (!bot) continue;
          const humans = s.teams[t].some((m) => !ctx.isBot(m) && ctx.isConnected(m));
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
      return;
    }
    // smart / expert: a bot knows the answer or not, and only buzzes when it does — a wrong answer hands
    // the other team a free try — unless the other team is already out (nothing to lose by trying)
    const knows = (b: string) => ((s.botKnows ??= {})[`${s.attempt}|${b}`] ??= Math.random() < quizSkill(level, SKILL));
    if (s.phase === 'question') {
      const read = readMs(q.text.length);
      for (const t of s.canAnswer) {
        const team = s.teams[t].filter((m) => bots.includes(m));
        if (!team.length) continue;
        const sure = team.find(knows);
        const otherIn = s.canAnswer.some((x) => x !== t);
        const humans = s.teams[t].some((m) => !ctx.isBot(m) && ctx.isConnected(m));
        if (sure) {
          // read the question, then press; with people on the team, leave them a fair moment first
          const ms = (level === 'expert' ? read : read * 1.4 + randDelay(500, 2000)) + randDelay(0, 700);
          const delay = Math.min(total * 0.8, humans ? Math.max(ms, total * (level === 'expert' ? 0.35 : 0.5)) : ms);
          ctx.bot(sure, `buzz:${s.attempt}:${t}`, Math.round(delay), { type: 'buzz' });
        } else if (!otherIn) {
          ctx.bot(team[0], `buzz:${s.attempt}:${t}`, randDelay(total * 0.6, total * 0.85), { type: 'buzz' });
        }
      }
    }
    if (s.phase === 'answer' && s.buzzer && bots.includes(s.buzzer)) {
      const right = knows(s.buzzer) || Math.random() < LUCKY;
      const text = right ? q.answer : q.wrong[Math.floor(Math.random() * q.wrong.length)];
      // typing the answer: a moment to start, then a few letters a second
      const typing = Math.min(ANSWER_MS * 0.6, 1200 + text.length * 220 + randDelay(0, 1000));
      ctx.bot(s.buzzer, `ans:${s.attempt}`, Math.round(typing), { type: 'answer', text });
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

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const loser: HuroofTeam = s.winner === 'red' ? 'green' : 'red';
    return { places: [s.teams[s.winner].slice(), s.teams[loser].slice()] };
  },
};
