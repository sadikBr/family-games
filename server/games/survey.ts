/**
 * «ماذا قال الناس؟» — two teams guess the most common answers to a question.
 *
 * Round: a face-off between one player of each team (rotating): the first to buzz types an answer. The
 * top answer wins the board at once; otherwise the other player answers and the higher answer wins
 * (both wrong: the next two players face off, up to three times). The team in control answers in turn,
 * one phone after the other, until every answer is on the board or it has three strikes (a wrong answer
 * or running out of time). Then the other team gets ONE steal attempt: right takes all the round's
 * points. The last two rounds count ×2 and ×3. The answers are the game's own estimates of what people
 * usually say (see survey-content.ts) — never presented as a real poll.
 */
import {
  SURVEY_ROUND_CHOICES,
  surveyMultiplier,
  type SurveyEvent,
  type SurveySettings,
  type SurveyTeam,
  type SurveyView,
} from '../../src/shared/games/survey';
import { randDelay } from '../cardkit';
import { qdeck } from '../qdeck';
import { SURVEY_QUESTIONS, type SurveyQuestion } from '../survey-content';
import { matchAnswer, namesOf } from '../survey-match';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';

/** pause on the round summary before the next round starts by itself */
export const ROUND_END_MS = 12_000;
/** the stealing team gets a little longer, to talk it over */
export const STEAL_EXTRA_MS = 10_000;
const NOTICE_MS = 6000;
/** face-offs where both players miss before the board goes to the team that did not buzz first */
const MAX_FACEOFFS = 3;

interface State {
  settings: SurveySettings;
  participants: string[];
  teams: [string[], string[]];
  phase: SurveyView['phase'];
  questions: SurveyQuestion[];
  round: number;
  scores: [number, number];
  revealed: boolean[];
  foundBy: (SurveyTeam | null)[];
  bank: number;
  strikes: number;
  control: SurveyTeam | null;
  /** next face-off player / next answerer of each team (indexes into teams[t], taken modulo its size) */
  faceIdx: [number, number];
  playIdx: [number, number];
  /** whose face-off player answers if nobody buzzes (alternates every round) */
  starter: SurveyTeam;
  face: { players: [string, string]; buzzer: string | null; first: { team: SurveyTeam; slot: number } | null; tries: number } | null;
  answerer: string | null;
  endsAt: number | null;
  timerTotal: number;
  step: number;
  last: SurveyEvent | null;
  lastN: number;
  result: SurveyView['result'];
  notice: { text: string; until: number } | null;
  winner: SurveyTeam | -1 | null;
}

const other = (t: SurveyTeam): SurveyTeam => (t === 0 ? 1 : 0);
const TEAM_NAME = ['الفريق الأحمر', 'الفريق الأزرق'] as const;

export function teamOf(s: State, id: string): SurveyTeam | null {
  if (s.teams[0].includes(id)) return 0;
  if (s.teams[1].includes(id)) return 1;
  return null;
}

function makeTeams(ids: string[]): [string[], string[]] {
  const a: string[] = [];
  const b: string[] = [];
  shuffle(ids).forEach((id, i) => (i % 2 === 0 ? a : b).push(id));
  return [a, b];
}

/** Clean up settings that may come from an older version (rounds 3/5/7, 10–45 s). */
function sanitize(settings: SurveySettings): SurveySettings {
  const rounds = isNum(settings.rounds) ? settings.rounds : 5;
  const nearest = SURVEY_ROUND_CHOICES.reduce((b, c) => (Math.abs(c - rounds) < Math.abs(b - rounds) ? c : b), 5 as number);
  const seconds = isNum(settings.seconds) ? Math.max(10, Math.min(45, Math.round(settings.seconds / 5) * 5)) : 20;
  return { rounds: nearest, seconds };
}

const question = (s: State) => s.questions[s.round];
const answerMs = (s: State) => s.settings.seconds * 1000;
const memberAt = (s: State, t: SurveyTeam, i: number) => s.teams[t][((i % s.teams[t].length) + s.teams[t].length) % s.teams[t].length];

function setTimer(ctx: GameCtx, s: State, ms: number) {
  s.timerTotal = ms;
  s.endsAt = ctx.now + ms;
}

function note(ctx: GameCtx, s: State, text: string) {
  s.notice = { text, until: ctx.now + NOTICE_MS };
}

function event(s: State, by: string, text: string, kind: SurveyEvent['kind'], slot: number | null) {
  s.last = { id: ++s.lastN, by, text, kind, slot };
}

function reveal(s: State, slot: number, team: SurveyTeam) {
  s.revealed[slot] = true;
  s.foundBy[slot] = team;
  s.bank += question(s).answers[slot].points;
}

/* ------------------------------------------------------------------ */
/* Round flow                                                          */
/* ------------------------------------------------------------------ */

function startRound(ctx: GameCtx, s: State) {
  const q = question(s);
  s.phase = 'faceoff';
  s.revealed = q.answers.map(() => false);
  s.foundBy = q.answers.map(() => null);
  s.bank = 0;
  s.strikes = 0;
  s.control = null;
  s.result = null;
  s.last = null;
  s.face = null;
  startFaceoff(ctx, s, 0);
  ctx.fx('start');
}

/** Two players (one per team, rotating) step up to the buzzers. */
function startFaceoff(ctx: GameCtx, s: State, tries: number) {
  s.phase = 'faceoff';
  const players: [string, string] = [memberAt(s, 0, s.faceIdx[0]), memberAt(s, 1, s.faceIdx[1])];
  s.faceIdx = [s.faceIdx[0] + 1, s.faceIdx[1] + 1];
  s.face = { players, buzzer: null, first: null, tries };
  s.answerer = null;
  s.step++;
  setTimer(ctx, s, answerMs(s));
}

function faceTeam(s: State, id: string): SurveyTeam {
  return s.face!.players[0] === id ? 0 : 1;
}

/** `id` answers in the face-off now (buzzed, or the buzz window ran out). */
function faceAnswerer(ctx: GameCtx, s: State, id: string) {
  s.face!.buzzer ??= id;
  s.answerer = id;
  s.step++;
  setTimer(ctx, s, answerMs(s));
}

/** The team takes the board: its players answer in turn. */
function beginPlay(ctx: GameCtx, s: State, team: SurveyTeam) {
  s.phase = 'play';
  s.control = team;
  s.strikes = 0;
  s.face = null;
  // the face-off player of that team answers last in the rotation
  s.playIdx[team] = s.faceIdx[team];
  note(ctx, s, `${TEAM_NAME[team]} يلعب هذه الجولة`);
  if (s.revealed.every(Boolean)) return endRound(ctx, s, team, false);
  nextAnswerer(ctx, s, false);
}

function nextAnswerer(ctx: GameCtx, s: State, advance = true) {
  const t = s.control!;
  if (advance) s.playIdx[t]++;
  s.answerer = memberAt(s, t, s.playIdx[t]);
  s.step++;
  setTimer(ctx, s, answerMs(s));
}

function startSteal(ctx: GameCtx, s: State) {
  const t = other(s.control!);
  s.phase = 'steal';
  s.answerer = memberAt(s, t, s.playIdx[t]); // the captain; any team-mate may answer
  s.playIdx[t]++;
  s.step++;
  setTimer(ctx, s, answerMs(s) + STEAL_EXTRA_MS);
  note(ctx, s, `ثلاثة أخطاء! فرصة السرقة الآن: ${TEAM_NAME[t]}`);
}

function endRound(ctx: GameCtx, s: State, team: SurveyTeam, stolen: boolean) {
  const points = s.bank * surveyMultiplier(s.round, s.questions.length);
  s.scores[team] += points;
  s.result = { team, points, stolen };
  s.phase = 'roundEnd';
  s.answerer = null;
  s.face = null;
  s.step++;
  setTimer(ctx, s, ROUND_END_MS);
  ctx.fx('reveal');
}

function nextRound(ctx: GameCtx, s: State) {
  s.round++;
  s.starter = other(s.starter);
  if (s.round >= s.questions.length) return finish(ctx, s);
  startRound(ctx, s);
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.round = Math.min(s.round, s.questions.length - 1);
  s.answerer = null;
  s.face = null;
  s.endsAt = null;
  s.revealed = s.revealed.map(() => true);
  const [a, b] = s.scores;
  s.winner = a === b ? -1 : a > b ? 0 : 1;
  ctx.fx('win');
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

/** A typed answer (or a timeout when `text` is null) from `by`. */
function answer(ctx: GameCtx, s: State, by: string, text: string | null) {
  const q = question(s);
  const r = text === null ? -1 : matchAnswer(q, text, s.revealed);
  const team = teamOf(s, by)!;
  const shown = text ?? '…';
  const missKind = text === null ? 'timeout' : 'miss';

  if (s.phase === 'faceoff') {
    const face = s.face!;
    const ft = faceTeam(s, by);
    // an answer already on the board is no better than a wrong one here
    const slot = typeof r === 'number' ? r : -1;
    if (slot >= 0) {
      reveal(s, slot, ft);
      event(s, by, shown, 'hit', slot);
      ctx.fx('reveal', by);
    } else {
      event(s, by, shown, r === 'dup' ? 'dup' : missKind, null);
      ctx.fx('buzz', by);
    }
    if (!face.first) {
      if (slot === 0) return beginPlay(ctx, s, ft);
      face.first = { team: ft, slot };
      return faceAnswerer(ctx, s, face.players[other(ft)]);
    }
    const first = face.first;
    if (slot >= 0) return beginPlay(ctx, s, first.slot < 0 || slot < first.slot ? ft : first.team);
    if (first.slot >= 0) return beginPlay(ctx, s, first.team);
    // both missed
    if (face.tries + 1 < MAX_FACEOFFS) {
      note(ctx, s, 'أخطأ الاثنان — مواجهة جديدة بين لاعبَين آخرين');
      return startFaceoff(ctx, s, face.tries + 1);
    }
    return beginPlay(ctx, s, other(first.team));
  }

  if (s.phase === 'play') {
    if (r === 'dup') {
      // already on the board: no strike, try again in the time left
      event(s, by, shown, 'dup', null);
      s.step++;
      return;
    }
    if (r >= 0) {
      reveal(s, r, team);
      event(s, by, shown, 'hit', r);
      ctx.fx('reveal', by);
      if (s.revealed.every(Boolean)) return endRound(ctx, s, team, false);
      return nextAnswerer(ctx, s);
    }
    s.strikes++;
    event(s, by, shown, missKind, null);
    ctx.fx('buzz', by);
    if (s.strikes >= 3) return startSteal(ctx, s);
    return nextAnswerer(ctx, s);
  }

  if (s.phase === 'steal') {
    const control = s.control!;
    if (r === 'dup') {
      event(s, by, shown, 'dup', null);
      s.step++;
      return;
    }
    if (r >= 0) {
      reveal(s, r, team);
      event(s, by, shown, 'hit', r);
      ctx.fx('correct', by);
      return endRound(ctx, s, team, true);
    }
    event(s, by, shown, missKind, null);
    ctx.fx('buzz', by);
    return endRound(ctx, s, control, false);
  }
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** How likely a bot finds an answer that is on the board. */
export function botSkill(s: State): number {
  if (s.phase === 'faceoff') return 0.75;
  if (s.phase === 'steal') return 0.5;
  const found = s.revealed.filter(Boolean).length;
  return Math.max(0.35, 0.8 - 0.08 * found);
}

/** A bot's answer: a hidden answer, weighted by its points (common ones come first), or a plausible miss. */
export function botGuess(s: State, rnd: () => number = Math.random): string {
  const q = question(s);
  const open = q.answers.map((a, i) => ({ a, i })).filter(({ i }) => !s.revealed[i]);
  if (open.length && rnd() < botSkill(s)) {
    const total = open.reduce((n, o) => n + o.a.points * o.a.points, 0);
    let x = rnd() * total;
    for (const o of open) {
      x -= o.a.points * o.a.points;
      if (x <= 0) {
        const names = namesOf(o.a);
        return rnd() < 0.7 ? o.a.text : names[Math.floor(rnd() * names.length)];
      }
    }
    return open[0].a.text;
  }
  // a wrong guess: an answer from another question that doesn't fit this one
  for (let k = 0; k < 20; k++) {
    const oq = SURVEY_QUESTIONS[Math.floor(rnd() * SURVEY_QUESTIONS.length)];
    if (oq === q) continue;
    const t = oq.answers[Math.floor(rnd() * oq.answers.length)].text;
    if (matchAnswer(q, t) === -1) return t;
  }
  return 'لا أعرف';
}

/** Typing takes a moment, but always well inside the timer. */
const typingDelay = (s: State, extra = 0) => {
  const ms = answerMs(s);
  return randDelay(Math.min(2500, ms * 0.25), Math.min(6500 + extra, ms * 0.6 + extra));
};

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const survey: GameModule<State, SurveySettings> = {
  id: 'survey',
  hostOnly: ['shuffle', 'swap', 'begin', 'next'],

  start(ctx, participants, raw) {
    const settings = sanitize(raw);
    const questions = qdeck(ctx, 'survey', SURVEY_QUESTIONS).deal(settings.rounds);
    return {
      settings,
      participants,
      teams: makeTeams(participants),
      phase: 'teams',
      questions,
      round: 0,
      scores: [0, 0],
      revealed: [],
      foundBy: [],
      bank: 0,
      strikes: 0,
      control: null,
      faceIdx: [0, 0],
      playIdx: [0, 0],
      starter: Math.random() < 0.5 ? 0 : 1,
      face: null,
      answerer: null,
      endsAt: null,
      timerTotal: 0,
      step: 0,
      last: null,
      lastN: 0,
      result: null,
      notice: null,
      winner: null,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    switch (a.type) {
      case 'shuffle':
        if (s.phase !== 'teams') return;
        s.teams = makeTeams(s.participants);
        return;
      case 'swap': {
        if (s.phase !== 'teams' || !isStr(a.id)) return;
        const t = teamOf(s, a.id);
        if (t === null) return;
        if (s.teams[t].length <= 1) throw new GameError('كل فريق يحتاج لاعباً واحداً على الأقل');
        s.teams[t] = s.teams[t].filter((p) => p !== a.id);
        s.teams[other(t)] = [...s.teams[other(t)], a.id];
        return;
      }
      case 'begin':
        if (s.phase !== 'teams') return;
        if (!s.teams[0].length || !s.teams[1].length) throw new GameError('كل فريق يحتاج لاعباً واحداً على الأقل');
        startRound(ctx, s);
        return;
      case 'next':
        if (s.phase === 'roundEnd') nextRound(ctx, s);
        return;
      case 'buzz': {
        if (s.phase !== 'faceoff' || !s.face || s.face.buzzer || s.answerer) return;
        if (!s.face.players.includes(by)) return;
        if (isNum(a.step) && a.step !== s.step) return;
        faceAnswerer(ctx, s, by);
        ctx.fx('throw', by);
        return;
      }
      case 'answer': {
        if (!isStr(a.text) || (isNum(a.step) && a.step !== s.step)) return;
        const text = a.text.trim().slice(0, 60);
        if (!text) return;
        if (s.phase === 'faceoff' || s.phase === 'play') {
          if (by !== s.answerer) return;
        } else if (s.phase === 'steal') {
          if (s.control === null || teamOf(s, by) !== other(s.control)) return;
        } else return;
        answer(ctx, s, by, text);
        return;
      }
    }
  },

  tick(ctx, s) {
    let changed = false;
    if (s.notice && ctx.now >= s.notice.until) {
      s.notice = null;
      changed = true;
    }
    if (s.endsAt === null || ctx.now < s.endsAt) return changed;
    switch (s.phase) {
      case 'faceoff':
        if (!s.answerer) {
          // nobody buzzed: the starting team's player has to answer
          faceAnswerer(ctx, s, s.face!.players[s.starter]);
          ctx.fx('tick');
        } else answer(ctx, s, s.answerer, null);
        return true;
      case 'play':
        answer(ctx, s, s.answerer!, null);
        return true;
      case 'steal':
        answer(ctx, s, s.answerer!, null);
        return true;
      case 'roundEnd':
        nextRound(ctx, s);
        return true;
    }
    return changed;
  },

  turnOf(s) {
    if (s.phase === 'faceoff') return s.answerer ? [s.answerer] : s.face ? [...s.face.players] : [];
    if (s.phase === 'play') return s.answerer ? [s.answerer] : [];
    if (s.phase === 'steal' && s.control !== null) return s.teams[other(s.control)];
    return [];
  },

  botPlan(ctx, s, bots) {
    const isBot = (id: string) => bots.includes(id) || ctx.isBot(id);
    switch (s.phase) {
      case 'teams':
        // only a room full of bots (everyone offline) starts by itself; people press «هيا نبدأ»
        if (s.participants.length && s.participants.every(isBot)) ctx.bot(s.participants[0], 'begin', randDelay(1500, 2500), { type: 'begin' });
        return;
      case 'faceoff': {
        const face = s.face;
        if (!face) return;
        if (!s.answerer) {
          const humanThere = face.players.some((p) => !isBot(p) && ctx.isConnected(p));
          for (const p of face.players) {
            if (!isBot(p)) continue;
            // against a person the bot is a little slower, so people get a fair chance
            const delay = humanThere ? randDelay(2500, Math.min(7000, answerMs(s) * 0.7)) : randDelay(1200, 4000);
            ctx.bot(p, `buzz:${s.step}`, delay, { type: 'buzz', step: s.step });
          }
        } else if (isBot(s.answerer)) {
          ctx.bot(s.answerer, `ans:${s.step}`, typingDelay(s), { type: 'answer', step: s.step, text: botGuess(s) });
        }
        return;
      }
      case 'play':
        if (s.answerer && isBot(s.answerer)) ctx.bot(s.answerer, `ans:${s.step}`, typingDelay(s), { type: 'answer', step: s.step, text: botGuess(s) });
        return;
      case 'steal': {
        if (s.control === null) return;
        const team = s.teams[other(s.control)];
        // people on the stealing team decide together; a team of bots sends its captain
        if (team.some((p) => !isBot(p) && ctx.isConnected(p))) return;
        const who = s.answerer && team.includes(s.answerer) ? s.answerer : team[0];
        if (who) ctx.bot(who, `steal:${s.step}`, typingDelay(s, 3000), { type: 'answer', step: s.step, text: botGuess(s) });
        return;
      }
    }
  },

  view(ctx, s): SurveyView {
    const q = s.phase === 'teams' ? null : question(s);
    const all = s.phase === 'roundEnd' || s.phase === 'final';
    return {
      game: 'survey',
      phase: s.phase,
      teams: s.teams,
      scores: s.scores,
      round: s.round + 1,
      rounds: s.questions.length,
      multiplier: surveyMultiplier(s.round, s.questions.length),
      question: q ? q.q : null,
      slots: q
        ? q.answers.map((a, i) =>
            s.revealed[i] || all ? { text: a.text, points: a.points, found: s.foundBy[i] ?? null } : { text: null, points: null, found: null },
          )
        : [],
      bank: s.bank,
      strikes: s.strikes,
      control: s.control,
      faceoff: s.face
        ? {
            players: s.face.players,
            buzzer: s.face.buzzer,
            firstSlot: s.face.first && s.face.first.slot >= 0 ? s.face.first.slot : null,
            firstMissed: !!s.face.first && s.face.first.slot < 0,
          }
        : null,
      answerer: s.answerer,
      endsAt: s.endsAt,
      timerTotal: s.timerTotal,
      step: s.step,
      last: s.last,
      result: s.result,
      notice: s.notice?.text ?? null,
      winner: s.winner,
    };
  },

  onLeave(ctx, s, id) {
    s.participants = s.participants.filter((p) => p !== id);
    const t = teamOf(s, id);
    if (t === null) return;
    const before = s.teams[t].length;
    const idx = s.teams[t].indexOf(id);
    s.teams[t] = s.teams[t].filter((p) => p !== id);
    // keep each rotation pointing at the same next player (the leaver's turn passes to the one after)
    const fix = (i: number) => {
      const pos = ((i % before) + before) % before;
      return pos > idx ? pos - 1 : pos;
    };
    s.faceIdx[t] = fix(s.faceIdx[t]);
    s.playIdx[t] = fix(s.playIdx[t]);
    if (s.phase === 'teams' || s.phase === 'final') return;

    let moved = false;
    if (!s.teams[t].length) {
      const o = other(t);
      if (s.teams[o].length < 2) return finish(ctx, s);
      // move someone over so both teams can still play
      const pool = s.teams[o].filter((p) => p !== s.answerer);
      const mover = pool.find((p) => ctx.isConnected(p)) ?? pool[0];
      s.teams[o] = s.teams[o].filter((p) => p !== mover);
      s.teams[t] = [mover];
      s.faceIdx[o] = 0;
      s.playIdx[o] = 0;
      moved = true;
      note(ctx, s, `انتقل ${ctx.playerName(mover)} إلى ${TEAM_NAME[t]} ليبقى في كل فريق لاعب`);
    }

    // the leaver was in the middle of something: carry on without a penalty
    if (s.phase === 'faceoff' && s.face) {
      const involved = s.face.players.includes(id) && (s.answerer === id || !s.answerer);
      if (involved || moved) return startFaceoff(ctx, s, s.face.tries);
      return;
    }
    if (s.phase === 'play' && s.answerer === id) return nextAnswerer(ctx, s, false);
    if (s.phase === 'steal' && (s.answerer === id || moved) && s.control !== null) {
      s.answerer = memberAt(s, other(s.control), s.playIdx[other(s.control)]);
      s.step++;
    }
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) {
      const r = patch.rounds;
      settings.rounds = SURVEY_ROUND_CHOICES.reduce((b, c) => (Math.abs(c - r) < Math.abs(b - r) ? c : b), 5 as number);
    }
    if (isNum(patch.seconds)) settings.seconds = Math.max(10, Math.min(45, Math.round(patch.seconds / 5) * 5));
  },
};

export type { State as SurveyState };
