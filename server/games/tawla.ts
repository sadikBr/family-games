/**
 * «الطاولة» — backgammon for two, a match to 1, 3, 5 or 7 points (no doubling cube).
 * Each game starts with the opening roll (one die each, the higher starts with both values). A turn: roll,
 * move checker by checker (a tap can also move one checker with several dice), undo while the turn is not
 * confirmed, «تمّ» (or the turn confirms itself after a short pause once no die can be played).
 * A game is worth 1, 2 («مارس») or 3 («مارس كبير») points. The series score counts matches won.
 * The rules (move generation, scoring) are in src/shared/games/tawla.ts, the bots in ../tawla-bot.ts.
 */
import {
  TAWLA_DEFAULTS,
  TAWLA_MATCH,
  applyStep,
  clonePos,
  diceToPlay,
  legalSteps,
  pipCount,
  tawlaChains,
  tawlaRemoveDie,
  tawlaStart,
  tawlaTargets,
  winKind,
  type TawlaLast,
  type TawlaPos,
  type TawlaSettings,
  type TawlaSide,
  type TawlaStep,
  type TawlaView,
  type TawlaWinKind,
} from '../../src/shared/games/tawla';
import { randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { tawlaBotSteps } from '../tawla-bot';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, randInt } from '../util';
import { VB, roundWin, voiceAnd, voiceResult, voiceWinner } from '../voice-calls-boards';

/** The last move in absolute terms: the mover's numbering (the view turns it for each phone). */
interface Last {
  seq: number;
  side: TawlaSide;
  path: number[];
  /** in the mover's numbering */
  hits: number[];
}

interface Snapshot {
  pos: TawlaPos;
  left: number[];
  last: Last | null;
}

export interface State {
  settings: TawlaSettings;
  seats: [string, string];
  pos: TawlaPos;
  phase: TawlaView['phase'];
  turn: TawlaSide;
  opening: [number | null, number | null];
  openTie: number | null;
  /** counts the opening rolls of the match (a tie rolls again) */
  openNo: number;
  dice: number[] | null;
  left: number[];
  rollId: number;
  /** this turn's taps, to undo them */
  undo: Snapshot[];
  /** counts the turns of the match (bot keys) */
  turnNo: number;
  seq: number;
  last: Last | null;
  timer: { kind: 'confirm' | 'pass' | 'next'; at: number } | null;
  points: Record<string, number>;
  gameNo: number;
  gameResult: { winner: TawlaSide; kind: TawlaWinKind } | null;
  ready: string[];
  winner: TawlaSide | null;
  reason: TawlaView['reason'];
  score: Record<string, number>;
  /** the bot's planned turn, for this turn and this many taps */
  botPlan: { key: string; steps: TawlaStep[] } | null;
  /** tests: the next dice (consumed first) */
  rig?: number[][];
}

const other = (s: TawlaSide): TawlaSide => (s === 0 ? 1 : 0);
const die = (s: State) => {
  const r = s.rig?.shift();
  return r ?? [randInt(1, 6), randInt(1, 6)];
};

export const sanitizeTawla = (st: Partial<TawlaSettings> | undefined): TawlaSettings => ({
  match: (TAWLA_MATCH as readonly number[]).includes(Number(st?.match)) ? Number(st!.match) : TAWLA_DEFAULTS.match,
});

const KIND_TEXT: Record<TawlaWinKind, string> = { 1: 'نقطة واحدة', 2: 'مارس: نقطتان', 3: 'مارس كبير: ثلاث نقاط' };

function newGame(ctx: GameCtx, s: State) {
  s.pos = tawlaStart();
  s.phase = 'opening';
  s.opening = [null, null];
  s.openTie = null;
  s.openNo += 1;
  s.dice = null;
  s.left = [];
  s.undo = [];
  s.last = null;
  s.timer = null;
  s.gameResult = null;
  s.ready = [];
  s.gameNo += 1;
  s.botPlan = null;
  ctx.fx('start');
}

/** The turn's dice are known: play on, or wait a moment and pass when nothing can be played. */
function startMoving(ctx: GameCtx, s: State) {
  s.phase = 'move';
  s.left = diceToPlay(s.dice!);
  s.undo = [];
  s.timer = null;
  if (!legalSteps(s.pos, s.turn, s.left).length) {
    s.timer = { kind: 'pass', at: ctx.now + paced(ctx, 2600) };
    ctx.say?.(`لا حركة ممكنة ${li(ctx.playerName(s.seats[s.turn]))} بهذا الرمي`, s.seats[s.turn]);
  }
}

function endTurn(s: State) {
  s.turn = other(s.turn);
  s.phase = 'roll';
  s.dice = null;
  s.left = [];
  s.undo = [];
  s.timer = null;
  s.turnNo += 1;
  s.botPlan = null;
}

function finishMatch(ctx: GameCtx, s: State, winner: TawlaSide, reason: 'points' | 'forfeit') {
  s.phase = 'final';
  s.winner = winner;
  s.reason = reason;
  s.timer = null;
  duelWin(ctx, s.score, s.seats[winner]);
}

/** The side on turn has borne off its 15th checker. */
function gameWon(ctx: GameCtx, s: State) {
  const w = s.turn;
  const kind = winKind(s.pos, w);
  const id = s.seats[w];
  s.points[id] = (s.points[id] ?? 0) + kind;
  s.gameResult = { winner: w, kind };
  s.left = [];
  s.undo = [];
  const name = ctx.playerName(id);
  if (s.points[id] >= s.settings.match) {
    finishMatch(ctx, s, w, 'points');
    ctx.say?.(`الفوز بالمباراة ${li(name)} (${KIND_TEXT[kind]})`, id, voiceResult(name));
  } else {
    s.phase = 'between';
    s.timer = { kind: 'next', at: ctx.now + paced(ctx, 9000) };
    ctx.fx('correct', id);
    ctx.say?.(`الجولة ${li(name)} (${KIND_TEXT[kind]})`, id, roundWin(name));
  }
}

/** «لماما»، «للحسن»: a name after لـ (lines never conjugate a verb for a player). */
const li = (n: string) => (/^[ء-ي]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);

/** Play a chain of steps for the side on turn (one tap). */
function play(ctx: GameCtx, s: State, steps: TawlaStep[]) {
  s.undo.push({ pos: clonePos(s.pos), left: s.left.slice(), last: s.last });
  const hits: number[] = [];
  for (const st of steps) {
    if (applyStep(s.pos, s.turn, st)) hits.push(st.to);
    s.left = tawlaRemoveDie(s.left, st.die);
  }
  s.seq += 1;
  s.last = { seq: s.seq, side: s.turn, path: [steps[0].from, ...steps.map((st) => st.to)], hits };
  s.botPlan = null;
  const by = s.seats[s.turn];
  if (hits.length) {
    ctx.fx('boom', by);
    ctx.say?.(`ضربة من ${ctx.playerName(by)}: ${hits.length > 1 ? 'حجران إلى الوسط' : 'حجر إلى الوسط'}`, by);
  } else ctx.fx('card', by);
  if (s.pos[s.turn][0] === 15) return gameWon(ctx, s);
  s.timer = legalSteps(s.pos, s.turn, s.left).length ? null : { kind: 'confirm', at: ctx.now + paced(ctx, ctx.isBot(by) ? 700 : 2400) };
}

function startNext(ctx: GameCtx, s: State) {
  newGame(ctx, s);
}

export const tawla: GameModule<State, TawlaSettings> = {
  id: 'tawla',

  turnOf(s) {
    if (s.phase === 'opening') return s.seats.filter((_, i) => s.opening[i] === null);
    if (s.phase === 'roll' || s.phase === 'move') return [s.seats[s.turn]];
    return [];
  },

  start(ctx, participants, settings) {
    if (participants.length !== 2) throw new GameError('الطاولة للاعبَين فقط — أضف بوتاً إن كنت وحدك');
    const { first, second, score } = startDuel(ctx, 'tawla', participants);
    const s: State = {
      settings: sanitizeTawla(settings),
      seats: [first, second],
      pos: tawlaStart(),
      phase: 'opening',
      turn: 0,
      opening: [null, null],
      openTie: null,
      openNo: 0,
      dice: null,
      left: [],
      rollId: 0,
      undo: [],
      turnNo: 0,
      seq: 0,
      last: null,
      timer: null,
      points: { [first]: 0, [second]: 0 },
      gameNo: 0,
      gameResult: null,
      ready: [],
      winner: null,
      reason: null,
      score,
      botPlan: null,
    };
    newGame(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    const idx = s.seats.indexOf(by);
    if (idx < 0 || s.phase === 'final') return;
    const side = idx as TawlaSide;
    if (a.type === 'resign') {
      const w = other(side);
      ctx.say?.(`انسحاب من ${ctx.playerName(by)}`, by, voiceAnd(VB.resign, voiceWinner(ctx.playerName(s.seats[w]))));
      return finishMatch(ctx, s, w, 'forfeit');
    }
    if (a.type === 'next') {
      if (s.phase !== 'between') return;
      if (!s.ready.includes(by)) s.ready.push(by);
      if (s.seats.every((id) => s.ready.includes(id) || ctx.isBot(id))) startNext(ctx, s);
      return;
    }
    if (a.type === 'roll') {
      if (s.phase === 'opening') {
        if (s.opening[side] !== null) return;
        s.opening[side] = die(s)[0];
        s.openTie = null;
        ctx.fx('tick', by);
        const [d0, d1] = s.opening;
        if (d0 === null || d1 === null) return;
        if (d0 === d1) {
          s.openTie = d0;
          s.openNo += 1;
          s.opening = [null, null];
          ctx.say?.(`تعادل في رمية البداية (${d0}): رمية جديدة`);
          return;
        }
        s.turn = d0 > d1 ? 0 : 1;
        s.dice = s.turn === 0 ? [d0, d1] : [d1, d0];
        s.rollId += 1;
        s.turnNo += 1;
        ctx.say?.(`البداية ${li(ctx.playerName(s.seats[s.turn]))}: ${s.dice[0]} و${s.dice[1]}`, s.seats[s.turn]);
        startMoving(ctx, s);
        return;
      }
      if (s.phase !== 'roll') return;
      if (side !== s.turn) throw new GameError('ليس دورك');
      s.dice = die(s);
      s.rollId += 1;
      ctx.fx('tick', by);
      startMoving(ctx, s);
      return;
    }
    if (s.phase !== 'move') return;
    if (side !== s.turn) throw new GameError('ليس دورك');
    if (a.type === 'undo') {
      const snap = s.undo.pop();
      if (!snap) return;
      s.pos = snap.pos;
      s.left = snap.left;
      s.seq += 1;
      s.last = snap.last ? { ...snap.last, seq: s.seq, path: [], hits: [] } : null;
      s.timer = null;
      s.botPlan = null;
      return;
    }
    if (a.type === 'done') {
      if (legalSteps(s.pos, s.turn, s.left).length) throw new GameError('ما زالت هناك حركة ممكنة');
      endTurn(s);
      return;
    }
    if (a.type !== 'move') return;
    if (!isNum(a.from) || !isNum(a.to)) return;
    let steps: TawlaStep[] | null = null;
    if (isNum(a.die)) {
      const st = legalSteps(s.pos, s.turn, s.left).find((x) => x.from === a.from && x.to === a.to && x.die === a.die);
      if (st) steps = [st];
    } else steps = tawlaChains(s.pos, s.turn, s.left).get(`${a.from}>${a.to}`)?.steps ?? null;
    if (!steps) {
      if (s.pos[s.turn][25] > 0 && a.from !== 25) throw new GameError('أدخل الحجر الذي في الوسط أولاً');
      throw new GameError('حركة غير مسموحة');
    }
    play(ctx, s, steps);
  },

  tick(ctx, s) {
    if (!s.timer || ctx.now < s.timer.at) return false;
    const t = s.timer;
    s.timer = null;
    if (t.kind === 'next') {
      if (s.phase === 'between') startNext(ctx, s);
      return true;
    }
    if (s.phase === 'move') endTurn(s);
    return true;
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'opening') {
      s.seats.forEach((id, i) => {
        if (bots.includes(id) && s.opening[i] === null) ctx.bot(id, `open:${s.openNo}`, randDelay(700, 1400), { type: 'roll' });
      });
      return;
    }
    if (s.phase === 'between') {
      for (const id of s.seats) if (bots.includes(id) && !s.ready.includes(id)) ctx.bot(id, `next:${s.gameNo}`, randDelay(2500, 4000), { type: 'next' });
      return;
    }
    const id = s.seats[s.turn];
    if (!bots.includes(id)) return;
    if (s.phase === 'roll') {
      ctx.bot(id, `roll:${s.turnNo}`, randDelay(600, 1100), { type: 'roll' });
      return;
    }
    if (s.phase !== 'move' || s.timer) return;
    const key = `${s.turnNo}:${s.seq}`;
    if (s.botPlan?.key !== key) s.botPlan = { key, steps: tawlaBotSteps(s.pos, s.turn, s.left, botLevel(ctx)) };
    const st = s.botPlan.steps[0];
    if (!st) return;
    // the first move waits for the dice to land on the phones; then one checker at a time
    const first = !s.undo.length;
    ctx.bot(id, `step:${key}`, (first ? 700 : 0) + paced(ctx, randDelay(550, 950)), { type: 'move', from: st.from, to: st.to, die: st.die });
  },

  view(ctx, s, me): TawlaView {
    const mine = s.seats.indexOf(me);
    const mySide = mine < 0 ? null : (mine as TawlaSide);
    const near: TawlaSide = mySide ?? 0;
    const far = other(near);
    const A = s.pos[near], B = s.pos[far];
    const points = Array.from({ length: 24 }, (_, i) => A[i + 1] - B[24 - i]);
    const myMove = s.phase === 'move' && mySide === s.turn && !s.timer;
    const flip = (p: number) => (p >= 1 && p <= 24 ? 25 - p : p);
    let last: TawlaLast | null = null;
    if (s.last) {
      const turn = s.last.side === near ? (p: number) => p : flip;
      last = { seq: s.last.seq, side: s.last.side, path: s.last.path.map(turn), hits: s.last.hits.map(turn) };
    }
    const moving = s.phase === 'move' && mySide === s.turn;
    const legal = moving ? legalSteps(s.pos, s.turn, s.left) : [];
    return {
      game: 'tawla',
      phase: s.phase,
      seats: s.seats,
      mySide,
      near,
      points,
      bar: [A[25], B[25]],
      off: [A[0], B[0]],
      pips: [pipCount(A), pipCount(B)],
      turn: s.turn,
      opening: s.opening,
      openTie: s.openTie,
      dice: s.dice,
      left: s.left,
      rollId: s.rollId,
      targets: myMove ? tawlaTargets(s.pos, s.turn, s.left) : [],
      canUndo: moving && s.undo.length > 0 && s.timer?.kind !== 'pass',
      canDone: moving && !legal.length && s.timer?.kind === 'confirm',
      stuck: s.phase === 'move' && s.timer?.kind === 'pass',
      timerAt: s.timer?.at ?? null,
      last,
      match: s.settings.match,
      points2: s.points,
      gameNo: s.gameNo,
      gameResult: s.gameResult,
      ready: s.ready,
      winner: s.winner,
      reason: s.reason,
      score: s.score,
    };
  },

  onLeave(ctx, s, id) {
    const side = s.seats.indexOf(id);
    if (side < 0 || s.phase === 'final') return;
    finishMatch(ctx, s, other(side as TawlaSide), 'forfeit');
  },

  result(s) {
    if (s.phase !== 'final' || s.winner === null) return null;
    return { places: [[s.seats[s.winner]], [s.seats[other(s.winner)]]] };
  },

  patchSettings(settings, patch) {
    if (isNum(patch.match) && (TAWLA_MATCH as readonly number[]).includes(patch.match)) settings.match = patch.match;
  },
};
