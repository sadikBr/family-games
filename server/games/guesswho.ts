/**
 * «خمّن من؟» — two players, the same board of 24 family characters, one secret character each. In turn,
 * a player asks a yes/no question about the other's secret.
 *
 * «أسئلة جاهزة»: a question from the fixed list (src/shared/games/guesswho.ts); the server answers it
 * truthfully from the other's secret character, logs it for both, and — with «إسقاط تلقائي», and always
 * for bots — flips down the asker's characters that don't match. The answer stays on the screens a moment
 * (GW_ANSWER_MS), then the turn passes; without auto-flip the asker flips by hand and ends the turn with
 * «إنهاء الدور» (or it passes after GW_MANUAL_MS).
 *
 * «أسئلة حرة» (the default): a typed question (or a tapped ready one) goes to the other player, who
 * answers نعم / لا within GW_REPLY_MS (`pending`); the asker then flips by hand and ends the turn. In
 * time or gone (GW_GONE_MS offline): a ready question gets the truthful answer, a typed one «لا أعرف».
 * Against a bot (or a person a bot plays for), a ready question is answered truthfully as above, and a
 * typed one is matched to a ready question (guesswho-match.ts) or refused. A bot's (ready) questions to
 * a person are answered by that person; the bot copes with a wrong answer (gwCandidates).
 *
 * Instead of asking, the player on turn may guess: right wins the round; wrong loses it, or only costs
 * the turn (and that character goes down), by setting. Rounds: 1, best of 3 or best of 5; the first
 * asker alternates. A secret never leaves the server before its round is over.
 */
import {
  GUESSWHO_DEFAULTS,
  GW_BEST_OF,
  GW_CHARS,
  GW_N,
  GW_QUESTION,
  gwAnswer,
  gwConsistent,
  gwCleanText,
  gwToWin,
  type GuesswhoSettings,
  type GuesswhoView,
  type GwEvent,
  type GwQuestionId,
} from '../../src/shared/games/guesswho';
import { GW_MATCH_ERROR, gwMatchQuestion } from '../../src/shared/games/guesswho-match';
import { gwBotMove, gwCandidates } from '../ai/guesswho-bot';
import { randDelay } from '../cardkit';
import { startDuel } from '../duel';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';
import { GV, voiceAnd, voiceRoundTo, voiceWinner } from '../voice-calls-guesswho';

/** After an answer (auto-flip on, or a bot asking), the turn passes after this pause (at the room's pace). */
export const GW_ANSWER_MS = 2600;
/** After a wrong guess that only costs the turn. */
export const GW_MISS_MS = 2600;
/** Without auto-flip, the asker has this long to flip and tap «إنهاء الدور» before the turn passes. */
export const GW_MANUAL_MS = 45_000;
/** The round's result (both secrets) stays this long before the next round (at the room's pace). */
export const GW_REVEAL_MS = 6500;
/** «أسئلة حرة»: the other player has this long to answer نعم / لا (an answer timer: not paced). */
export const GW_REPLY_MS = 45_000;
/** …and is taken as gone after this long offline (the app then answers, see the header). */
export const GW_GONE_MS = 10_000;
/** A bot thinks this long before a question or a guess. */
export const GW_BOT_MS: [number, number] = [1500, 2800];

type Rnd = () => number;

interface Pending {
  by: string;
  /** a ready question, or null for a typed one */
  q: GwQuestionId | null;
  /** the question as shown (the ready question's text, or what was typed) */
  text: string;
  until: number;
  total: number;
  /** since when the one to answer has been offline (null: connected) */
  goneAt: number | null;
}

interface State {
  settings: GuesswhoSettings;
  /** players[0] asks first in round 1; the first asker alternates */
  players: [string, string];
  round: number;
  wins: Record<string, number>;
  phase: GuesswhoView['phase'];
  turnIdx: 0 | 1;
  secrets: Record<string, number>;
  /** each player's board: true = flipped down */
  down: Record<string, boolean[]>;
  log: GwEvent[];
  n: number;
  pauseUntil: number | null;
  pauseTotal: number;
  /** the pause waits for the asker to flip by hand and tap «إنهاء الدور» */
  manual: boolean;
  /** a question waiting for the other player's answer («أسئلة حرة») */
  pending: Pending | null;
  roundWinner: string | null;
  how: GuesswhoView['how'];
  winner: string | null;
  nextAt: number | null;
  /** bumps at every new turn (bot decisions are keyed on it) */
  moves: number;
  rnd: Rnd;
}

export function sanitizeGuesswho(raw: Partial<GuesswhoSettings> | undefined): GuesswhoSettings {
  return {
    bestOf: snapBestOf(raw?.bestOf),
    mode: raw?.mode === 'ready' || raw?.mode === 'free' ? raw.mode : GUESSWHO_DEFAULTS.mode,
    autoFlip: typeof raw?.autoFlip === 'boolean' ? raw.autoFlip : GUESSWHO_DEFAULTS.autoFlip,
    wrongLoses: typeof raw?.wrongLoses === 'boolean' ? raw.wrongLoses : GUESSWHO_DEFAULTS.wrongLoses,
  };
}

function snapBestOf(v: unknown): number {
  if (!isNum(v)) return GUESSWHO_DEFAULTS.bestOf;
  return GW_BEST_OF.reduce((best, r) => (Math.abs(r - v) < Math.abs(best - v) ? r : best), GW_BEST_OF[0] as number);
}

const otherOf = (s: State, id: string) => (s.players[0] === id ? s.players[1] : s.players[0]);
const turnOf = (s: State) => s.players[s.turnIdx];
const isChar = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0 && v < GW_N;

function dealRound(ctx: GameCtx, s: State) {
  const a = Math.floor(s.rnd() * GW_N);
  let b = Math.floor(s.rnd() * (GW_N - 1));
  if (b >= a) b++; // two different characters
  s.secrets = { [s.players[0]]: a, [s.players[1]]: b };
  s.down = Object.fromEntries(s.players.map((p) => [p, Array(GW_N).fill(false)]));
  s.log = [];
  s.phase = 'play';
  s.turnIdx = ((s.round - 1) % 2) as 0 | 1;
  s.pauseUntil = null;
  s.pending = null;
  s.roundWinner = null;
  s.how = null;
  s.nextAt = null;
  s.moves++;
  ctx.fx('start');
}

/** Flip down every character the answers so far rule out on `by`'s board («أسقِط من لا يطابق»). */
function dropMismatches(s: State, by: string) {
  const board = s.down[by];
  for (let c = 0; c < GW_N; c++) if (!gwConsistent(c, s.log, by)) board[c] = true;
}

/**
 * A bot's board shows its candidates: the rest goes down; after a wrong answer from a person (no
 * character fits every answer) the characters that fit the most answers come back up.
 */
function botBoard(s: State, by: string) {
  const board = s.down[by];
  const cands = new Set(gwCandidates(s.log, by));
  for (let c = 0; c < GW_N; c++) {
    if (!cands.has(c)) board[c] = true;
    else if (!gwConsistent(c, s.log, by)) board[c] = false;
  }
}

/** The app answered a ready question (truthfully): auto-flip for bots, or with «إسقاط تلقائي»; then the answer's pause. */
function afterAppAnswer(ctx: GameCtx, s: State, by: string) {
  const auto = s.settings.autoFlip || ctx.isBot(by);
  if (ctx.isBot(by)) botBoard(s, by);
  else if (auto) dropMismatches(s, by);
  if (auto) pause(ctx, s, paced(ctx, GW_ANSWER_MS));
  else pause(ctx, s, GW_MANUAL_MS, true);
}

/** «نعم» / «لا» / «لا أعرف» */
const yesNo = (yes: boolean | null) => (yes === null ? 'لا أعرف' : yes ? 'نعم' : 'لا');

/**
 * The pending question gets its answer: from the other player (`yes`), or — `yes` undefined: no answer
 * in time — the truth for a ready question and «لا أعرف» for a typed one.
 */
function settle(ctx: GameCtx, s: State, yes: boolean | undefined) {
  const p = s.pending;
  if (!p) return;
  s.pending = null;
  const by = p.by;
  const other = otherOf(s, by);
  const human = yes !== undefined;
  const ans = human ? yes : p.q ? gwAnswer(p.q, s.secrets[other]) : null;
  s.log.push({ kind: 'ask', n: ++s.n, by, q: p.q, yes: ans, ...(p.q ? {} : { text: p.text }), ...(human ? { human: true } : {}) });
  // (a typed question stays between the two players: the line under the turn bar leaves it out)
  ctx.say?.(`${p.q ? `سؤال من ${ctx.playerName(by)}: ${p.text}` : `سؤال من ${ctx.playerName(by)}`} — ${human ? `جواب ${ctx.playerName(other)}` : 'الجواب'}: ${yesNo(ans)}`, by);
  if (!human && p.q) {
    afterAppAnswer(ctx, s, by);
    return;
  }
  if (ctx.isBot(by)) {
    botBoard(s, by);
    pause(ctx, s, paced(ctx, GW_ANSWER_MS));
  } else if (ans === null) pause(ctx, s, paced(ctx, GW_ANSWER_MS));
  else pause(ctx, s, GW_MANUAL_MS, true);
}

function pause(ctx: GameCtx, s: State, ms: number, manual = false) {
  s.pauseUntil = ctx.now + ms;
  s.pauseTotal = ms;
  s.manual = manual;
}

/** Would a round won by `winner` end the match? */
const decides = (s: State, winner: string) => (s.wins[winner] ?? 0) + 1 >= gwToWin(s.settings.bestOf);

function endTurn(s: State) {
  s.pauseUntil = null;
  s.pending = null;
  s.manual = false;
  s.turnIdx = (1 - s.turnIdx) as 0 | 1;
  s.moves++;
}

function endRound(ctx: GameCtx, s: State, winner: string, how: NonNullable<GuesswhoView['how']>, voice?: string) {
  // (a resign or a leave ends the match without counting a round)
  if (how === 'guess' || how === 'wrong') s.wins[winner] = (s.wins[winner] ?? 0) + 1;
  s.roundWinner = winner;
  s.how = how;
  s.pauseUntil = null;
  s.pending = null;
  s.manual = false;
  s.moves++;
  const name = ctx.playerName(winner);
  if (s.wins[winner] >= gwToWin(s.settings.bestOf) || how === 'resign' || how === 'leave') {
    s.phase = 'final';
    s.winner = winner;
    s.nextAt = null;
    ctx.fx('win', winner);
    ctx.say?.(`الفوز ${li(name)}`, winner, voiceAnd(voice, voiceWinner(name)));
    return;
  }
  s.phase = 'reveal';
  s.nextAt = ctx.now + paced(ctx, GW_REVEAL_MS);
  ctx.say?.(`الجولة ${li(name)}`, winner, voiceAnd(voice, voiceRoundTo(name)));
}

/** «لبابا»، «للجدة»، «لـ Sam» (a name after لـ, so a line about a player needs no verb). */
const li = (n: string) => (/^[ء-ي]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);

function nextRound(ctx: GameCtx, s: State) {
  if (s.phase !== 'reveal') return;
  s.round++;
  dealRound(ctx, s);
}

export function startGuesswho(ctx: GameCtx, participants: string[], raw: Partial<GuesswhoSettings> | undefined, rnd: Rnd = Math.random): State {
  const { first, second } = startDuel(ctx, 'guesswho', participants);
  const players: [string, string] = [first, second];
  const s: State = {
    settings: sanitizeGuesswho(raw),
    players,
    round: 1,
    wins: { [first]: 0, [second]: 0 },
    phase: 'play',
    turnIdx: 0,
    secrets: {},
    down: {},
    log: [],
    n: 0,
    pauseUntil: null,
    pauseTotal: 0,
    manual: false,
    pending: null,
    roundWinner: null,
    how: null,
    winner: null,
    nextAt: null,
    moves: 0,
    rnd,
  };
  dealRound(ctx, s);
  return s;
}

export const guesswho: GameModule<State, GuesswhoSettings> = {
  id: 'guesswho',
  hostOnly: ['next'],

  start(ctx, participants, settings) {
    return startGuesswho(ctx, participants, settings);
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') nextRound(ctx, s);
      return;
    }
    if (!s.players.includes(by) || s.phase !== 'play') return;
    const other = otherOf(s, by);

    if (a.type === 'resign') {
      ctx.say?.(`انسحاب ${ctx.playerName(by)}`, by);
      endRound(ctx, s, other, 'resign', GV.resign);
      return;
    }
    // my own board: flip a character down or back up, any time in the round
    if (a.type === 'flip') {
      if (!isChar(a.char)) return;
      const board = s.down[by];
      board[a.char] = typeof a.down === 'boolean' ? a.down : !board[a.char];
      return;
    }
    if (a.type === 'dropAll') {
      dropMismatches(s, by);
      return;
    }
    if (a.type === 'done') {
      if (turnOf(s) === by && s.pauseUntil !== null) endTurn(s);
      return;
    }
    // the answer to the pending question: only from the one it was asked to
    if (a.type === 'answer') {
      if (!s.pending || s.pending.by !== other || typeof a.yes !== 'boolean') return;
      settle(ctx, s, a.yes);
      return;
    }
    if (a.type !== 'ask' && a.type !== 'guess') return;
    if (turnOf(s) !== by) throw new GameError('ليس دورك');
    if (s.pauseUntil !== null || s.pending) return; // one question or one guess per turn
    const name = ctx.playerName(by);

    if (a.type === 'ask') {
      const free = s.settings.mode === 'free';
      let q = typeof a.q === 'string' ? GW_QUESTION[a.q as GwQuestionId] : undefined;
      let typed = '';
      let neg = false;
      if (!q) {
        if (!free) return; // «أسئلة جاهزة»: the list only
        typed = gwCleanText(a.text);
        if (!typed) throw new GameError('اكتب السؤال أولاً');
        if (!/[?؟]$/.test(typed)) typed = gwCleanText(`${typed}؟`);
        if (ctx.isBot(other)) {
          // a bot can't read free text: understood as one of the ready questions, or refused
          const m = gwMatchQuestion(typed);
          if (!m.ok) throw new GameError(GW_MATCH_ERROR[m.why]);
          q = GW_QUESTION[m.q];
          neg = m.neg;
        }
      }
      if (q && s.log.some((e) => e.kind === 'ask' && e.by === by && e.q === q.id)) throw new GameError('سبق طرح هذا السؤال');
      if (free && !ctx.isBot(other)) {
        // the other player answers on their phone
        s.pending = { by, q: q?.id ?? null, text: q ? q.text : typed, until: ctx.now + GW_REPLY_MS, total: GW_REPLY_MS, goneAt: null };
        ctx.say?.(q ? `سؤال من ${name}: ${q.text}` : `سؤال من ${name}`, by);
        return;
      }
      if (!q) return;
      const yes = gwAnswer(q.id, s.secrets[other]);
      s.log.push({ kind: 'ask', n: ++s.n, by, q: q.id, yes, ...(typed ? { text: typed } : {}), ...(neg ? { neg: true } : {}) });
      ctx.say?.(`سؤال من ${name}: ${q.text} — ${yes ? 'نعم' : 'لا'}`, by);
      afterAppAnswer(ctx, s, by);
      return;
    }

    // a guess: «هل هو …؟»
    if (!isChar(a.char)) return;
    const right = s.secrets[other] === a.char;
    s.log.push({ kind: 'guess', n: ++s.n, by, char: a.char, right });
    const who = GW_CHARS[a.char].name;
    // the match's last guess gets the win / lose sound instead
    if (right) {
      if (!decides(s, by)) ctx.fx('correct', by);
      ctx.say?.(`تخمين صحيح من ${name}: ${who}`, by);
      endRound(ctx, s, by, 'guess', GV.right);
      return;
    }
    if (!s.settings.wrongLoses || !decides(s, other)) ctx.fx('buzz', by);
    if (s.settings.wrongLoses) {
      ctx.say?.(`تخمين خاطئ من ${name}: ليس ${who}`, by);
      endRound(ctx, s, other, 'wrong', GV.wrong);
      return;
    }
    s.down[by][a.char] = true;
    // (a bot's board follows its candidates: after a wrong answer from a person, the next best ones come up)
    if (ctx.isBot(by)) botBoard(s, by);
    ctx.say?.(`تخمين خاطئ من ${name}: ليس ${who} — الدور ${li(ctx.playerName(other))}`, by, GV.wrong);
    pause(ctx, s, paced(ctx, GW_MISS_MS));
  },

  tick(ctx, s) {
    const p = s.pending;
    if (s.phase === 'play' && p) {
      // no answer in time, or the one to answer is gone: the app answers (see settle)
      const who = otherOf(s, p.by);
      const was = p.goneAt;
      p.goneAt = ctx.isConnected(who) ? null : (p.goneAt ?? ctx.now);
      if (ctx.now >= p.until || (p.goneAt !== null && ctx.now - p.goneAt >= GW_GONE_MS)) {
        settle(ctx, s, undefined);
        return true;
      }
      return (was === null) !== (p.goneAt === null);
    }
    if (s.phase === 'play' && s.pauseUntil !== null && ctx.now >= s.pauseUntil) {
      endTurn(s);
      return true;
    }
    if (s.phase === 'reveal' && s.nextAt !== null && ctx.now >= s.nextAt) {
      nextRound(ctx, s);
      return true;
    }
    return false;
  },

  turnOf(s) {
    if (s.phase !== 'play') return [];
    // a question waits for the other player's answer
    if (s.pending) return [otherOf(s, s.pending.by)];
    // a pause after an answer waits for nobody, except the asker flipping by hand («إنهاء الدور»)
    if (s.pauseUntil !== null) return s.manual ? [turnOf(s)] : [];
    return [turnOf(s)];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    // a bot now plays for the one who has to answer (offline for a while): the app answers
    if (s.pending) {
      if (!bots.includes(otherOf(s, s.pending.by))) return;
      settle(ctx, s, undefined);
      return true;
    }
    if (s.pauseUntil !== null) return;
    const id = turnOf(s);
    if (!bots.includes(id)) return;
    const move = gwBotMove({ level: botLevel(ctx), log: s.log, me: id, other: otherOf(s, id), wrongLoses: s.settings.wrongLoses });
    ctx.bot(id, `t:${s.round}:${s.moves}`, randDelay(...GW_BOT_MS), move);
  },

  view(ctx, s, me): GuesswhoView {
    const player = s.players.includes(me);
    const over = s.phase !== 'play';
    return {
      game: 'guesswho',
      phase: s.phase,
      players: s.players,
      round: s.round,
      bestOf: s.settings.bestOf,
      wins: s.wins,
      turn: s.phase === 'play' ? turnOf(s) : null,
      pauseUntil: s.pauseUntil,
      pauseTotal: s.pauseTotal,
      manual: s.manual,
      // a typed question is for the two players' eyes only
      pending: s.pending ? { by: s.pending.by, q: s.pending.q, text: player || s.pending.q ? s.pending.text : null, until: s.pending.until, total: s.pending.total } : null,
      bots: s.players.filter((p) => ctx.isBot(p)),
      mode: s.settings.mode,
      mySecret: player ? s.secrets[me] : null,
      myDown: player ? s.down[me].flatMap((d, i) => (d ? [i] : [])) : [],
      standing: Object.fromEntries(s.players.map((p) => [p, s.down[p].filter((d) => !d).length])),
      log: player ? s.log : s.log.map((e) => (e.kind === 'ask' && e.text !== undefined ? { ...e, text: '' } : e)),
      autoFlip: s.settings.autoFlip,
      wrongLoses: s.settings.wrongLoses,
      // the secrets only once the round is over
      secrets: over ? { ...s.secrets } : null,
      roundWinner: s.roundWinner,
      how: s.how,
      winner: s.winner,
      nextAt: s.nextAt,
      nextTotal: paced(ctx, GW_REVEAL_MS),
    };
  },

  onLeave(ctx, s, id) {
    if (!s.players.includes(id) || s.phase === 'final') return;
    s.phase = 'play'; // (a leave during the reveal ends the match too)
    endRound(ctx, s, otherOf(s, id), 'leave');
  },

  patchSettings(settings, patch) {
    if (isNum(patch.bestOf)) settings.bestOf = snapBestOf(patch.bestOf);
    if (patch.mode === 'free' || patch.mode === 'ready') settings.mode = patch.mode;
    if (typeof patch.autoFlip === 'boolean') settings.autoFlip = patch.autoFlip;
    if (typeof patch.wrongLoses === 'boolean') settings.wrongLoses = patch.wrongLoses;
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    return { places: [[s.winner], [otherOf(s, s.winner)]] };
  },
};

export type { State as GuesswhoState };
