/**
 * «حروف» — two teams, a 5×5 grid of letter hexagons.
 * The team whose turn it is picks a letter; a question appears whose answer starts with that letter.
 * Like the TV show, the first player to press the buzzer answers — here by typing it (spelling slips
 * are forgiven, see answerMatches). Right: the hexagon is theirs. Wrong or too slow: that team is
 * locked out and the other team can buzz. Red joins right ↔ left, green joins top ↔ bottom.
 *
 * The question is revealed word by word (the server keeps the schedule; views only carry the words shown
 * so far and how many are still hidden, so nobody can read ahead in the payload). The buzzer works from
 * the first word: pressing it freezes the reveal for everyone and the buzzer answers from that part. A
 * wrong answer (or running out of time) shows the whole question at once, and the other team answers.
 * The question's own timer only starts once the whole question is shown.
 *
 * Categories: the host mixes one or more (إسلامية, معلومات عامة, رياضة…; see HUROOF_CATS). The board only
 * shows letters the chosen categories have enough questions for, and each question comes from one of
 * them (weighted by how many unasked questions each has for the letter).
 */
import { answerMatches, displayLetter, firstLetter } from '../../src/shared/arabic';
import { HEX_N, hexWinPath } from '../../src/shared/islamic';
import { HUROOF_CATS, huroofCats, type HuroofCat, type HuroofSettings, type HuroofTeam, type HuroofView } from '../../src/shared/protocol';
import { huroofKnowShare, huroofPick } from '../ai/social-huroof';
import { quizSkill } from '../ai/social-quiz';
import { Feed, randDelay } from '../cardkit';
import { HUROOF_POOL, type HuroofQ } from '../content-huroof';
import { qdeck } from '../qdeck';
import { botLevel, GameError, paced, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, isStr, shuffle } from '../util';
import { PVOICE, voiceAnd, voiceAnswer, voiceCell, voiceLetter, voiceOnly, voiceTeamWin } from '../voice-calls-party';

/** how often an easy bot's answer is right (smart / expert bots know more: see ai/social-quiz) */
const SKILL = 0.65;
/** a bot that doesn't know the answer and tries anyway (nothing to lose) is right this often */
const LUCKY = 0.2;
const ANSWER_MS = 20_000;
/** the pause before the first word of a question, then the time each word takes (both at the room's pace) */
const REVEAL_LEAD_MS = 700;
const WORD_MIN_MS = 350;
const WORD_MAX_MS = 450;
/** a word's base reveal time: a little longer for a long word */
export const wordMs = (w: string) => Math.max(WORD_MIN_MS, Math.min(WORD_MAX_MS, 300 + 22 * w.length));
const other = (t: HuroofTeam): HuroofTeam => (t === 'red' ? 'green' : 'red');

const CELLS = HEX_N * HEX_N;
/** A letter goes on the board only when the chosen categories have at least this many questions for it. */
export const MIN_PER_LETTER = 3;

/** Each category's questions grouped by the first letter of their answer (only real letters, not numbers). */
const CAT_LETTERS = Object.fromEntries(
  HUROOF_CATS.map(({ key }) => {
    const m = new Map<string, HuroofQ[]>();
    for (const q of HUROOF_POOL[key]) {
      const l = firstLetter(q.a);
      if (!/[ء-ي]/.test(l)) continue;
      if (!m.has(l)) m.set(l, []);
      m.get(l)!.push(q);
    }
    return [key, m];
  }),
) as Record<HuroofCat, Map<string, HuroofQ[]>>;

const UNIONS = new Map<string, Map<string, HuroofQ[]>>();
/** The chosen categories' questions (their union) grouped by the first letter of the answer. */
export function huroofByLetter(cats: readonly HuroofCat[]): Map<string, HuroofQ[]> {
  const key = HUROOF_CATS.map((c) => c.key).filter((k) => cats.includes(k)).join(',');
  let m = UNIONS.get(key);
  if (!m) {
    m = new Map();
    for (const c of cats) for (const [l, qs] of CAT_LETTERS[c]) m.set(l, [...(m.get(l) ?? []), ...qs]);
    UNIONS.set(key, m);
  }
  return m;
}

/** The Islamic questions by letter (the default category). */
export const BY_LETTER = huroofByLetter(['islamic']);

/**
 * The board's 25 letters: different letters that have enough questions; a pool with fewer such letters
 * repeats the ones with the most questions per hexagon.
 */
export function boardLetters(byLetter: Map<string, HuroofQ[]>): string[] {
  let ok = [...byLetter].filter(([, qs]) => qs.length >= MIN_PER_LETTER).map(([l]) => l);
  if (!ok.length) ok = [...byLetter.keys()];
  const letters = shuffle(ok).slice(0, CELLS);
  while (letters.length < CELLS && ok.length) {
    const per = (l: string) => byLetter.get(l)!.length / (letters.filter((x) => x === l).length + 1);
    letters.push(shuffle(ok).reduce((a, b) => (per(b) > per(a) ? b : a)));
  }
  return shuffle(letters);
}

interface State {
  settings: HuroofSettings;
  /** the categories in play, and their questions by letter */
  cats: HuroofCat[];
  byLetter: Map<string, HuroofQ[]>;
  teams: Record<HuroofTeam, string[]>;
  cells: { letter: string; owner: HuroofTeam | null }[];
  used: Set<HuroofQ>; // questions already asked in this game
  phase: HuroofView['phase'];
  turn: HuroofTeam;
  cell: number | null;
  question: { text: string; answer: string; alt: string[]; wrong: string[]; cat: HuroofCat } | null;
  /**
   * The gradual reveal of `question`: its words, when the reveal started, when each word appears
   * (absolute ms), and how many are shown. Frozen while someone answers; all shown after a miss.
   */
  reveal: { words: string[]; start: number; at: number[]; shown: number } | null;
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
  /**
   * Bots: a draw in [0, 1) per bot and attempt (`${attempt}|${bot}`); the bot knows the answer once the
   * share of the question shown makes `skill × huroofKnowShare(level, share)` pass it (see botPlan).
   */
  botDraw?: Record<string, number>;
}

const teamOf = (s: State, id: string): HuroofTeam | null => (s.teams.red.includes(id) ? 'red' : s.teams.green.includes(id) ? 'green' : null);
const TEAM_NAME: Record<HuroofTeam, string> = { red: 'الفريق الأحمر', green: 'الفريق الأخضر' };

/** Questions for `letter` not asked yet in this game. */
const fresh = (s: State, letter: string) => (s.byLetter.get(letter) ?? []).filter((q) => !s.used.has(q)).length;

/**
 * A question for the letter: first one of the chosen categories (weighted by its questions for the letter
 * not asked yet in this game), then the room's deck for that category and letter (huroof's own, not
 * shared with the other quiz games), skipping questions already asked in this game whenever possible.
 */
function drawQuestion(ctx: GameCtx, s: State, letter: string) {
  const counts = s.cats.map((c) => {
    const qs = CAT_LETTERS[c].get(letter) ?? [];
    return { c, qs, n: qs.filter((q) => !s.used.has(q)).length };
  });
  const live = counts.filter((x) => x.n > 0);
  const from = live.length ? live : counts.filter((x) => x.qs.length);
  const weight = (x: (typeof counts)[number]) => (live.length ? x.n : x.qs.length);
  let r = Math.random() * from.reduce((t, x) => t + weight(x), 0);
  const pick = from.find((x) => (r -= weight(x)) < 0) ?? from[from.length - 1];
  const q = qdeck(ctx, `huroof:${pick.c}:${letter}`, pick.qs).draw((x) => s.used.has(x));
  s.used.add(q);
  return { text: q.q, answer: q.a, alt: q.alt, wrong: q.w, cat: q.cat };
}

/**
 * A free hexagon whose letter has no unasked question left would bring back a question whose answer
 * everyone just saw: give it a letter that isn't on the board and still has questions.
 */
export function refreshLetter(s: State, i: number): boolean {
  const cell = s.cells[i];
  if (cell.owner || fresh(s, cell.letter)) return false;
  const onBoard = new Set(s.cells.map((c) => c.letter));
  let spare = shuffle([...s.byLetter.keys()].filter((l) => !onBoard.has(l) && fresh(s, l)));
  // a small pool: a letter already on the board, the one with the most questions left
  if (!spare.length) spare = [...s.byLetter.keys()].filter((l) => l !== cell.letter && fresh(s, l)).sort((a, b) => fresh(s, b) - fresh(s, a));
  if (!spare.length) return false;
  const old = cell.letter;
  cell.letter = spare[0];
  s.feed.push(`نفدت أسئلة «${displayLetter(old)}» — صارت الخانة «${displayLetter(cell.letter)}»`);
  return true;
}

/** Start revealing the question word by word: a short pause, then one word every ~0.4 s (room pace). */
function startReveal(ctx: GameCtx, s: State) {
  const words = s.question!.text.split(/\s+/).filter(Boolean);
  const at: number[] = [];
  let t = ctx.now + paced(ctx, REVEAL_LEAD_MS);
  for (const w of words) {
    at.push(t);
    t += paced(ctx, wordMs(w));
  }
  s.reveal = { words, start: ctx.now, at, shown: 0 };
}

const fullyShown = (s: State) => !s.reveal || s.reveal.shown >= s.reveal.words.length;

/** The share of the question shown so far (0–1): all the bots may know of it. */
export const shownShare = (s: State) => (s.reveal && s.reveal.words.length ? s.reveal.shown / s.reveal.words.length : 1);

/** The whole question is now on every screen: start the question's timer and read it aloud. */
function revealDone(ctx: GameCtx, s: State) {
  if (s.phase === 'question' && s.endsAt === null) {
    s.timerTotal = s.settings.seconds * 1000;
    s.endsAt = ctx.now + s.timerTotal;
  }
  if (s.question) voiceOnly(ctx, s.question.text);
}

/** Show the rest of the question at once (after a miss). */
function showAll(ctx: GameCtx, s: State) {
  if (!s.reveal || fullyShown(s)) return;
  s.reveal.shown = s.reveal.words.length;
  revealDone(ctx, s);
}

/** Open (or reopen) the buzzers for the teams that may still answer. The timer waits for the whole question. */
function openBuzzers(ctx: GameCtx, s: State) {
  s.phase = 'question';
  s.buzzer = null;
  s.timerTotal = s.settings.seconds * 1000;
  s.endsAt = fullyShown(s) ? ctx.now + s.timerTotal : null;
}

/** A wrong (or missing) answer: lock that team out, give the other team its chance. */
function miss(ctx: GameCtx, s: State, team: HuroofTeam) {
  s.canAnswer = s.canAnswer.filter((t) => t !== team);
  s.attempt += 1;
  if (!s.canAnswer.length) {
    ctx.say?.(`لم يأخذ أحد الحرف: الجواب «${s.question?.answer ?? ''}»`, undefined, voiceAnd(PVOICE.wrong, voiceAnswer(s.question?.answer ?? '')));
    settle(s, null, null);
  } else {
    openBuzzers(ctx, s);
    showAll(ctx, s); // the other team answers with the whole question
  }
}

function settle(s: State, team: HuroofTeam | null, by: string | null) {
  const i = s.cell!;
  const q = s.question!;
  s.last = { cell: i, team, answer: q.answer, question: q.text, by, id: ++s.lastN };
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
  s.reveal = null;
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
    const cats = huroofCats(settings);
    const byLetter = huroofByLetter(cats);
    const letters = boardLetters(byLetter);
    ctx.fx('start');
    return {
      settings: { ...settings, cats },
      cats,
      byLetter,
      teams,
      cells: letters.map((letter) => ({ letter, owner: null })),
      used: new Set(),
      phase: 'pick',
      turn: Math.random() < 0.5 ? 'red' : 'green',
      cell: null,
      question: null,
      reveal: null,
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
      startReveal(ctx, s);
      openBuzzers(ctx, s);
      ctx.fx('reveal');
      // the letter now; the question is read aloud once it is fully shown (revealDone)
      ctx.say?.(`حرف «${displayLetter(s.cells[a.cell].letter)}» باختيار ${ctx.playerName(by)}: من يضغط أولاً؟`, by, voiceLetter(s.cells[a.cell].letter));
      return;
    }
    if (a.type === 'buzz') {
      if (s.phase !== 'question') return;
      if (!s.canAnswer.includes(team)) throw new GameError('فريقك أخطأ في هذا السؤال');
      s.phase = 'answer';
      s.buzzer = by;
      s.timerTotal = ANSWER_MS;
      s.endsAt = ctx.now + ANSWER_MS;
      // the reveal stops here for everyone: the answer comes from the part shown
      s.feed.push(`أول من ضغط الجرس: ${ctx.playerName(by)}${fullyShown(s) ? '' : ' — قبل اكتمال السؤال'}`, { by });
      ctx.fx('throw', by);
      ctx.say?.(`الجرس لـ${ctx.playerName(by)}: في انتظار الجواب`, by);
      return;
    }
    if (a.type === 'answer') {
      if (s.phase !== 'answer' || !s.question || s.buzzer !== by || !isStr(a.text)) return;
      const text = a.text.trim().slice(0, 60);
      if (!text) return;
      if ([s.question.answer, ...s.question.alt].some((f) => answerMatches(text, f))) {
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
    // the next words of the question (frozen while someone answers)
    if (s.phase === 'question' && s.reveal && !fullyShown(s)) {
      const r = s.reveal;
      const before = r.shown;
      while (r.shown < r.words.length && ctx.now >= r.at[r.shown]) r.shown += 1;
      if (r.shown !== before) {
        if (fullyShown(s)) revealDone(ctx, s);
        return true;
      }
      return false;
    }
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
    // a bot only ever looks at how much of the question is shown, never at the hidden words
    const share = shownShare(s);
    const full = share >= 1;
    const draw = (b: string) => ((s.botDraw ??= {})[`${s.attempt}|${b}`] ??= Math.random());
    /** whether the bot knows the answer from the part shown (`at` = a share of the question) */
    const knows = (b: string, at = share) => draw(b) < quizSkill(level, SKILL) * huroofKnowShare(level, at);
    if (s.phase === 'question') {
      for (const t of s.canAnswer) {
        const team = s.teams[t].filter((m) => bots.includes(m));
        if (!team.length) continue;
        const humans = s.teams[t].some((m) => !ctx.isBot(m) && ctx.isConnected(m));
        // with people on the team, a bot never presses before the whole question is shown, then leaves
        // them a fair share of the timer
        if (humans && !full) continue;
        const key = `buzz:${s.attempt}:${t}`;
        if (level === 'easy') {
          // the old bots: wait for the whole question, then always buzz (right about two times in three)
          if (!full) continue;
          const delay = humans ? randDelay(total * 0.45, total * 0.8) : randDelay(1500, total * 0.6);
          ctx.bot(team[0], key, delay, { type: 'buzz' });
          continue;
        }
        // smart / expert: buzz only when the part shown is enough to know — a wrong answer hands the
        // other team a free try — unless the other team is already out (nothing to lose by trying)
        const sure = team.find((b) => knows(b));
        const otherIn = s.canAnswer.some((x) => x !== t);
        if (sure) {
          // a reaction once it clicks (it has been reading along word by word)
          const react = level === 'expert' ? randDelay(300, 900) : randDelay(900, 2200);
          const delay = humans ? Math.min(total * 0.8, Math.max(react, total * (level === 'expert' ? 0.3 : 0.45))) : react;
          ctx.bot(sure, key, Math.round(delay), { type: 'buzz' });
        } else if (!otherIn && full) {
          ctx.bot(team[0], key, randDelay(total * 0.6, total * 0.85), { type: 'buzz' });
        }
      }
    }
    if (s.phase === 'answer' && s.buzzer && bots.includes(s.buzzer)) {
      // the reveal is frozen: the bot answers from the part shown
      const right = level === 'easy' ? Math.random() < SKILL : knows(s.buzzer) || Math.random() < LUCKY;
      const text = right ? q.answer : q.wrong[Math.floor(Math.random() * q.wrong.length)];
      // typing the answer: a moment to start, then a few letters a second
      const typing = level === 'easy' ? randDelay(2500, 5000) : Math.min(ANSWER_MS * 0.6, 1200 + text.length * 220 + randDelay(0, 1000));
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
      // only the words shown so far: the rest never leaves the server before it is revealed
      question: s.question
        ? (() => {
            const words = s.reveal?.words ?? s.question.text.split(/\s+/).filter(Boolean);
            const shown = s.reveal ? s.reveal.shown : words.length;
            const cat = HUROOF_CATS.find((c) => c.key === s.question!.cat)?.label;
            return { text: words.slice(0, shown).join(' '), hidden: words.length - shown, frozen: s.phase === 'answer' && shown < words.length, cat };
          })()
        : null,
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

  patchSettings(set, patch) {
    if (isNum(patch.seconds)) set.seconds = clamp(Math.round(patch.seconds), 10, 40);
    // several categories at once; unknown ones are ignored and the choice never ends up empty
    if (Array.isArray(patch.cats)) {
      const cats = HUROOF_CATS.map((c) => c.key).filter((k) => (patch.cats as unknown[]).includes(k));
      if (cats.length) set.cats = cats;
    }
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const loser: HuroofTeam = s.winner === 'red' ? 'green' : 'red';
    return { places: [s.teams[s.winner].slice(), s.teams[loser].slice()] };
  },
};
