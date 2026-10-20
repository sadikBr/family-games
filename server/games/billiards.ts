/**
 * «البلياردو» — 8-ball (2 players, or 4 in two teams), 9-ball (2–4 players) and snooker (2 players, or
 * 4 in two teams), one shooter at a time.
 *
 * The shooter's phone sends its live aim (a few times a second: everyone sees the cue turn) and then the
 * stroke {angle, power, spin} (+ the cue ball's spot when it was in hand, + the pocket called for the 8).
 * The server plays the whole shot at once with the deterministic physics (billiards-physics.ts), keeps the
 * final positions, and puts the recorded trajectories in the view for the first moments only (each phone
 * caches them by id and plays them back in real time). When the playback is over (+ a short pause at
 * the room's pace) the rules (billiards-rules.ts) are applied: a foul gives the next player the ball in
 * hand anywhere, a legal pot keeps the table, the 8 / the 9 decide the rack. The rack winner breaks the
 * next rack; «عدد الأشواط للفوز» racks win the match.
 *
 * Snooker: the same flow on the snooker table. The shooter may nominate a colour with the aim (`nom`;
 * when a colour is on and none was nominated, the colour the cue is aimed at, else the one hit first).
 * Legal pots score for the shooter and keep the table, a foul gives its penalty to the other side, which
 * plays from where the cue ball stopped (from the D when it dropped). The frame ends on the last black;
 * a tie re-spots the black (the next player in turn, cue ball in the D). The break alternates between
 * frames.
 */
import {
  BILLIARDS_RACES,
  GROUP_NAME,
  type SnookerOn,
  type BilliardsNote,
  type BilliardsSettings,
  type BilliardsShot,
  type BilliardsSide,
  type BilliardsView,
} from '../../src/shared/games/billiards';
import {
  BLACK,
  aimGuide,
  isColour,
  legalCueSpot,
  nearestCueSpot,
  rackEight,
  rackNine,
  rackSnooker,
  respotColours,
  simulate,
  spotBall,
  tableOf,
  type BallPos,
} from '../../src/shared/games/billiards-physics';
import { li } from '../../src/shared/li';
import { botShot } from '../ai/billiards-bot';
import {
  foulText,
  judge,
  judgeSnooker,
  legalTargets,
  onEight,
  snookerFoulText,
  snookerNextOn,
  snookerRemaining,
  snookerTargets,
  type Situation,
  type SnookerVerdict,
  type Verdict,
} from '../billiards-rules';
import { randDelay } from '../cardkit';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';
import { BV, voiceAnd, voiceBreak, voiceFoul, voiceFrame, voiceGroup, voiceRack, voiceSnookerFoul, voiceWinner } from '../voice-calls-billiards';

/** The recorded trajectories stay in the view this long after the stroke (then only the shot's id). */
export const SHOT_SEND_MS = 2500;
/** After the playback, the balls stay still this long before the rules are applied (at the room's pace). */
export const SETTLE_MS = 500;
/** Between two racks (at the room's pace). */
export const RACK_PAUSE_MS = 5000;

interface Pending {
  by: string;
  verdict: Verdict;
  /** snooker: the verdict (verdict is then an empty one) and what was on */
  snooker?: { v: SnookerVerdict; on: SnookerOn };
  /** where the cue ball stopped (null: pocketed) */
  cueAt: { x: number; y: number } | null;
}

/** Snooker's score for the frame. */
interface Snk {
  scores: number[];
  brk: number;
  on: SnookerOn;
}

/** A snooker penalty in words (4 … 7). */
const PENALTY_TEXT: Record<number, string> = { 4: 'أربع نقاط', 5: 'خمس نقاط', 6: 'ست نقاط', 7: 'سبع نقاط' };

interface State {
  settings: BilliardsSettings;
  seats: string[];
  sideOf: Record<string, number>;
  sides: BilliardsSide[];
  /** index in seats of the shooter */
  seat: number;
  balls: BallPos[];
  inHand: 'kitchen' | 'anywhere' | null;
  breakShot: boolean;
  phase: BilliardsView['phase'];
  aim: BilliardsView['aim'];
  aimSeq: number;
  /** a new id for every turn (bots and stale strokes are matched against it) */
  turn: number;
  shotSeq: number;
  shot: BilliardsShot | null;
  rollEnds: number;
  pending: Pending | null;
  note: BilliardsNote | null;
  noteSeq: number;
  rack: number;
  winner: number | null;
  nextAt: number | null;
  /** seat of the next rack's breaker */
  breaker: number;
  botTurn: number;
  /** players who left or resigned, in that order (ranked last) */
  gone: string[];
  /** snooker only */
  snk: Snk | null;
  rnd: () => number;
}

export function sanitizeBilliards(raw: Partial<BilliardsSettings> | undefined): BilliardsSettings {
  const race = isNum(raw?.race) ? BILLIARDS_RACES.reduce((b, r) => (Math.abs(r - raw!.race!) < Math.abs(b - raw!.race!) ? r : b), 1 as number) : 1;
  return {
    mode: raw?.mode === 'nine' || raw?.mode === 'snooker' ? raw.mode : 'eight',
    race,
    callPocket: raw?.callPocket !== false,
    guide: raw?.guide === 'short' || raw?.guide === 'off' ? raw.guide : 'long',
  };
}

const shooterOf = (s: State) => s.seats[s.seat] ?? null;
const sideLabel = (ctx: GameCtx, side: BilliardsSide) => side.ids.map((id) => ctx.playerName(id)).join(' و');

function situation(s: State, called: number | null = null): Situation {
  const side = s.sides[s.sideOf[shooterOf(s) ?? ''] ?? 0];
  return {
    mode: s.settings.mode,
    onTable: s.balls.filter((b) => b.id !== 0).map((b) => b.id),
    group: side?.group ?? null,
    breakShot: s.breakShot,
    called,
    callPocket: s.settings.callPocket,
  };
}

const needCall = (s: State) => s.settings.mode === 'eight' && s.settings.callPocket && !s.breakShot && onEight(situation(s));
const tableFor = (s: State) => tableOf(s.settings.mode);

/** The balls the shooter may hit first now. */
function targetsNow(s: State): number[] {
  if (s.snk) return snookerTargets(s.balls.map((b) => b.id), s.snk.on);
  return legalTargets(situation(s));
}

/** Sides still in the game. */
const liveSides = (s: State) => s.sides.map((x, i) => i).filter((i) => !s.sides[i].out);

function addNote(s: State, n: Omit<BilliardsNote, 'id'>) {
  s.note = { id: ++s.noteSeq, ...n };
}

/** The opening aim of a turn: at the nearest legal ball, the cue ball where it is (or a suggested spot). */
function openAim(s: State, lastCue: { x: number; y: number } | null) {
  const objects = s.balls.filter((b) => b.id !== 0);
  const t = tableFor(s);
  let cue = s.balls.find((b) => b.id === 0) ?? null;
  let spot: [number, number] | null = null;
  if (s.inHand) {
    const kitchen = s.inHand === 'kitchen';
    const want = kitchen ? t.breakSpot : (lastCue ?? t.breakSpot);
    const p = nearestCueSpot(objects, want.x, want.y, kitchen, t);
    spot = [Math.round(p.x), Math.round(p.y)];
    cue = { id: 0, x: spot[0], y: spot[1] };
  }
  const targets = targetsNow(s);
  let a = -Math.PI / 2;
  if (cue) {
    let best = Infinity;
    for (const t of targets) {
      const b = objects.find((x) => x.id === t);
      if (!b) continue;
      const d = Math.hypot(b.x - cue.x, b.y - cue.y);
      if (d < best) {
        best = d;
        a = Math.atan2(b.y - cue.y, b.x - cue.x);
      }
    }
  }
  s.aim = { seq: ++s.aimSeq, a, cue: spot, pocket: null, nom: null };
}

function startTurn(s: State, lastCue: { x: number; y: number } | null) {
  s.phase = 'aim';
  s.turn++;
  openAim(s, lastCue);
}

function newRack(ctx: GameCtx, s: State) {
  s.rack++;
  const mode = s.settings.mode;
  s.balls = mode === 'nine' ? rackNine(s.rnd) : mode === 'snooker' ? rackSnooker(s.rnd) : rackEight(s.rnd);
  s.snk = mode === 'snooker' ? { scores: s.sides.map(() => 0), brk: 0, on: 'red' } : null;
  s.inHand = 'kitchen';
  s.breakShot = true;
  for (const side of s.sides) {
    side.group = null;
    side.pocketed = [];
  }
  s.seat = s.seats.length ? s.breaker % s.seats.length : 0;
  s.winner = null;
  s.nextAt = null;
  s.pending = null;
  s.note = null;
  startTurn(s, null);
  ctx.fx('start');
}

/** The match is over: `w` won. */
function finish(ctx: GameCtx, s: State, w: number, voice?: string) {
  s.phase = 'final';
  s.winner = w;
  s.nextAt = null;
  s.aim = null;
  const side = s.sides[w];
  ctx.fx('win', side.ids.length === 1 ? side.ids[0] : undefined);
  ctx.say?.(`الفوز ${li(sideLabel(ctx, side))}`, side.ids[0], voice ?? voiceWinner(sideLabel(ctx, side)));
}

/** Side `w` won the rack (snooker: the frame). */
function rackWon(ctx: GameCtx, s: State, w: number, nextBreaker: number, why: string, by: string, eightOrNine?: string) {
  const side = s.sides[w];
  side.wins++;
  const label = sideLabel(ctx, side);
  const word = s.snk ? 'الإطار' : 'الشوط';
  addNote(s, { kind: 'rack', text: `${word} ${li(label)}`, sub: why, by });
  s.breaker = nextBreaker;
  if (side.wins >= s.settings.race || liveSides(s).length < 2) return finish(ctx, s, w, voiceAnd(eightOrNine, voiceWinner(label)));
  s.phase = 'rack';
  s.winner = w;
  s.aim = null;
  s.nextAt = ctx.now + paced(ctx, RACK_PAUSE_MS);
  ctx.fx('reveal');
  ctx.say?.(`${word} ${li(label)} — ${why}`, by, voiceAnd(eightOrNine, s.snk ? voiceFrame(label) : voiceRack(label)));
}

/** Apply what the shot did, once everyone has seen it. */
function applyShot(ctx: GameCtx, s: State) {
  const p = s.pending;
  s.pending = null;
  if (!p) return;
  if (p.snooker && s.snk) return applySnooker(ctx, s, p, p.snooker.v, s.snk);
  const v = p.verdict;
  const mode = s.settings.mode;
  const seated = s.seats.includes(p.by);
  const shooterSide = s.sideOf[p.by] ?? 0;
  const name = ctx.playerName(p.by);
  const wasBreak = s.breakShot;
  s.breakShot = false;
  // what went down counts for the shooter (a re-spotted ball doesn't)
  const down = v.potted.filter((b) => b !== v.respot);
  s.sides[shooterSide].pocketed.push(...down);

  if (v.assign && mode === 'eight') {
    const other = v.assign === 'solids' ? 'stripes' : 'solids';
    s.sides.forEach((side, i) => (side.group = i === shooterSide ? v.assign : other));
  }

  if (v.rack) {
    const n = s.seats.length;
    const shooterSeat = s.seats.indexOf(p.by);
    if (v.rack === 'win') {
      const why = mode === 'nine' ? 'الكرة 9 في الجيب' : 'الكرة 8 في الجيب';
      return rackWon(ctx, s, shooterSide, shooterSeat >= 0 ? shooterSeat : s.seat, why, p.by, mode === 'nine' ? BV.nine : BV.eight);
    }
    // 8-ball lost by the shooter: the other side wins and breaks next (its player after the shooter)
    const w = liveSides(s).find((i) => i !== shooterSide) ?? shooterSide;
    const why = v.loseWhy === 'early' ? `الكرة 8 قبل الأوان من ${name}` : v.loseWhy === 'pocket' ? `الكرة 8 في غير الجيب المسمّى من ${name}` : `الكرة 8 مع خطأ من ${name}`;
    const next = n ? ((shooterSeat >= 0 ? shooterSeat : s.seat) + (shooterSeat >= 0 ? 1 : 0)) % n : 0;
    return rackWon(ctx, s, w, next, why, p.by, BV.eight);
  }

  const cueOn = s.balls.some((b) => b.id === 0);
  if (v.foul) {
    if (seated) s.seat = (s.seat + 1) % s.seats.length;
    else s.seat %= Math.max(1, s.seats.length);
    s.inHand = 'anywhere';
    // the cue ball is picked up (it is placed again by the next player)
    s.balls = s.balls.filter((b) => b.id !== 0);
    const next = shooterOf(s);
    const lowest = mode === 'nine' ? Math.min(...situationBefore(s, v).filter((b) => b !== 0)) : undefined;
    const sub = `${foulText(v.foul, v.foul === 'wrong' && mode === 'nine' ? lowest : undefined)}${v.respot === 9 ? ' — والكرة 9 تعود إلى مكانها' : ''}`;
    const text = `خطأ — الكرة في اليد ${li(ctx.playerName(next ?? ''))}`;
    addNote(s, { kind: 'foul', text, sub, by: p.by });
    ctx.fx('buzz', p.by);
    ctx.say?.(`خطأ من ${name}: ${sub}`, p.by, voiceFoul());
    startTurn(s, p.cueAt);
    return;
  }

  if (v.assign && mode === 'eight') {
    const mine = s.sides[shooterSide];
    const other = s.sides.find((x, i) => i !== shooterSide);
    const text = `${GROUP_NAME[v.assign]} ${li(sideLabel(ctx, mine))}`;
    const sub = other?.group ? `${GROUP_NAME[other.group]} ${li(sideLabel(ctx, other))}` : undefined;
    addNote(s, { kind: 'group', text, sub, by: p.by });
    ctx.say?.(text, p.by, voiceGroup(v.assign, sideLabel(ctx, mine)));
  } else if (v.respot === 8 && wasBreak) {
    addNote(s, { kind: 'respot', text: 'الكرة 8 في الكسر تعود إلى مكانها', sub: v.cont ? `الدور يبقى ${li(name)}` : undefined, by: p.by });
    ctx.say?.('الكرة 8 في الكسر تعود إلى مكانها', p.by, BV.respot);
  } else if (!v.cont) {
    s.note = null;
  }
  if (!v.cont && seated) s.seat = (s.seat + 1) % s.seats.length;
  else if (!seated) s.seat %= Math.max(1, s.seats.length);
  if (!cueOn) s.inHand = 'anywhere';
  startTurn(s, p.cueAt);
}

/** Snooker: score the shot, pass the table or not, end the frame on the last black. */
function applySnooker(ctx: GameCtx, s: State, p: Pending, v: SnookerVerdict, k: Snk) {
  const seated = s.seats.includes(p.by);
  const shooterSide = s.sideOf[p.by] ?? 0;
  const oppSide = liveSides(s).find((i) => i !== shooterSide) ?? (shooterSide + 1) % s.sides.length;
  const name = ctx.playerName(p.by);
  const n = s.seats.length;
  s.breakShot = false;
  const onTable = s.balls.map((b) => b.id);
  const brkBefore = k.brk;
  if (v.foul) k.scores[oppSide] += v.penalty;
  else {
    k.scores[shooterSide] += v.points;
    k.brk += v.points;
    s.sides[shooterSide].pocketed.push(...v.potted);
  }
  const visitEnds = !!v.foul || !v.cont;
  // a big break is called when the visit ends
  const bigBreak = visitEnds && !v.frameOver ? (v.foul ? brkBefore : k.brk) : 0;
  const breakVoice = voiceBreak(bigBreak, sideLabel(ctx, s.sides[shooterSide]));

  if (v.frameOver) {
    const [a, b] = [k.scores[shooterSide], k.scores[oppSide]];
    if (a === b) {
      // a tie: the black comes back, the next player in turn plays it with the cue ball in the D
      s.balls = respotColours(s.balls.filter((x) => x.id !== 0 && x.id !== BLACK), [BLACK]);
      s.inHand = 'kitchen';
      k.on = BLACK;
      k.brk = 0;
      if (seated && n) s.seat = (s.seat + 1) % n;
      else s.seat %= Math.max(1, n);
      const next = shooterOf(s);
      addNote(s, { kind: 'respot', text: 'تعادل: الكرة السوداء تعود إلى مكانها', sub: `الكرة البيضاء ${li(ctx.playerName(next ?? ''))} داخل نصف الدائرة — أول نقاط تحسم الإطار`, by: p.by });
      ctx.say?.('تعادل: الكرة السوداء تعود إلى مكانها', p.by, BV.tieBlack);
      startTurn(s, null);
      return;
    }
    const w = a > b ? shooterSide : oppSide;
    const why = `${Math.max(a, b)}–${Math.min(a, b)}${v.foul ? ` — خطأ من ${name} على الكرة السوداء` : ''}`;
    k.brk = 0;
    return rackWon(ctx, s, w, n ? (s.breaker + 1) % n : 0, why, p.by);
  }

  if (v.foul) {
    const to = sideLabel(ctx, s.sides[oppSide]);
    const pen = PENALTY_TEXT[v.penalty] ?? `${v.penalty} نقاط`;
    const text = `خطأ من ${name}: ${pen} ${li(to)}`;
    const sub = `${snookerFoulText(v, p.snooker!.on)}${v.respot.length ? ' — والألوان تعود إلى مكانها' : ''}`;
    addNote(s, { kind: 'foul', text, sub, by: p.by });
    ctx.fx('buzz', p.by);
    ctx.say?.(text, p.by, voiceAnd(voiceSnookerFoul(v.penalty, to), breakVoice ?? undefined));
  } else if (breakVoice) {
    const text = `سلسلة ${bigBreak} ${li(sideLabel(ctx, s.sides[shooterSide]))}`;
    addNote(s, { kind: 'info', text, by: p.by });
    ctx.say?.(text, p.by, breakVoice);
  } else if (visitEnds) s.note = null;
  if (visitEnds) {
    k.brk = 0;
    if (seated && n) s.seat = (s.seat + 1) % n;
    else s.seat %= Math.max(1, n);
  } else if (!seated) s.seat %= Math.max(1, n);
  k.on = snookerNextOn(onTable, p.snooker!.on, !visitEnds);
  s.inHand = s.balls.some((b) => b.id === 0) ? null : 'kitchen';
  startTurn(s, p.cueAt);
}

/** The balls that were on the table before the shot (the ones on it now plus the ones that dropped). */
function situationBefore(s: State, v: Verdict): number[] {
  return [...s.balls.map((b) => b.id).filter((id) => id !== v.respot), ...v.potted];
}

/** `id` leaves the match (left the room or resigned). */
function drop(ctx: GameCtx, s: State, id: string, resigned: boolean) {
  const i = s.seats.indexOf(id);
  if (i < 0 || s.phase === 'final') return;
  const wasShooter = i === s.seat;
  s.gone.push(id);
  s.seats.splice(i, 1);
  if (i < s.seat) s.seat--;
  if (i < s.breaker) s.breaker--;
  const n = s.seats.length;
  s.seat = n ? s.seat % n : 0;
  s.breaker = n ? s.breaker % n : 0;
  const sd = s.sides[s.sideOf[id]];
  if (sd && sd.ids.every((p) => !s.seats.includes(p))) sd.out = true;
  const live = liveSides(s);
  const what = resigned ? 'انسحاب' : 'مغادرة';
  if (live.length === 1) {
    const label = sideLabel(ctx, s.sides[live[0]]);
    finish(ctx, s, live[0], voiceAnd(resigned ? 'انْسِحَابْ' : undefined, voiceWinner(label)));
    ctx.say?.(`${what} ${ctx.playerName(id)} — الفوز ${li(label)}`, id, voiceAnd(resigned ? 'انْسِحَابْ' : undefined, voiceWinner(label)));
    return;
  }
  if (!live.length) {
    s.phase = 'final';
    s.winner = null;
    return;
  }
  ctx.say?.(`${what} ${ctx.playerName(id)}`, id);
  // it was their turn to aim: the next player takes the table as it is
  if (s.phase === 'aim' && wasShooter) startTurn(s, s.aim?.cue ? { x: s.aim.cue[0], y: s.aim.cue[1] } : null);
}

export function startBilliards(ctx: GameCtx, participants: string[], raw: BilliardsSettings, rnd: () => number = Math.random): State {
  const settings = sanitizeBilliards(raw);
  if (settings.mode === 'eight' && participants.length === 3) throw new GameError('الكرة 8 للاعبَين أو لأربعة في فريقين — أضيفوا بوتاً أو اختاروا الكرة 9');
  if (settings.mode === 'snooker' && participants.length === 3) throw new GameError('السنوكر للاعبَين أو لأربعة في فريقين — أضيفوا بوتاً أو اختاروا الكرة 9');
  if (participants.length < 2 || participants.length > 4) throw new GameError('البلياردو من لاعبَين إلى أربعة');
  const seats = [...participants];
  const teams = settings.mode !== 'nine';
  const nSides = teams ? 2 : seats.length;
  const sides: BilliardsSide[] = Array.from({ length: nSides }, () => ({ ids: [], group: null, wins: 0, pocketed: [], out: false }));
  const sideOf: Record<string, number> = {};
  seats.forEach((id, i) => {
    const k = teams ? i % 2 : i;
    sides[k].ids.push(id);
    sideOf[id] = k;
  });
  const s: State = {
    settings,
    seats,
    sideOf,
    sides,
    seat: 0,
    balls: [],
    inHand: 'kitchen',
    breakShot: true,
    phase: 'aim',
    aim: null,
    aimSeq: 0,
    turn: 0,
    shotSeq: 0,
    shot: null,
    rollEnds: 0,
    pending: null,
    note: null,
    noteSeq: 0,
    rack: 0,
    winner: null,
    nextAt: null,
    breaker: Math.floor(rnd() * seats.length),
    botTurn: -1,
    gone: [],
    snk: null,
    rnd,
  };
  newRack(ctx, s);
  return s;
}

const num = (v: unknown, lo: number, hi: number) => (isNum(v) ? Math.max(lo, Math.min(hi, v)) : null);
const pocketArg = (v: unknown) => (isNum(v) && Number.isInteger(v) && v >= 0 && v <= 5 ? v : null);
const colourArg = (v: unknown) => (isNum(v) && isColour(v) ? v : null);

function parseCue(v: unknown): { x: number; y: number } | null {
  if (Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1])) return { x: v[0], y: v[1] };
  if (v && typeof v === 'object' && isNum((v as { x: unknown }).x) && isNum((v as { y: unknown }).y)) return { x: (v as { x: number }).x, y: (v as { y: number }).y };
  return null;
}

/** Play the stroke (validated) and keep its outcome for the end of the playback. */
function stroke(ctx: GameCtx, s: State, by: string, angle: number, power: number, spin: number, cueArg: { x: number; y: number } | null, pocket: number | null, nom: number | null) {
  const objects = s.balls.filter((b) => b.id !== 0);
  const bot = ctx.isBot(by);
  const t = tableFor(s);
  let balls = s.balls;
  if (s.inHand) {
    const kitchen = s.inHand === 'kitchen';
    // a bot (or the autopilot) never gets stuck on a spot a hair off: it takes the nearest legal one
    if (bot && cueArg && !legalCueSpot(objects, cueArg.x, cueArg.y, kitchen, t)) cueArg = nearestCueSpot(objects, cueArg.x, cueArg.y, kitchen, t);
    if (bot && !cueArg) cueArg = nearestCueSpot(objects, t.breakSpot.x, t.breakSpot.y, kitchen, t);
    if (!cueArg || !legalCueSpot(objects, cueArg.x, cueArg.y, kitchen, t)) throw new GameError(s.snk ? 'ضع الكرة البيضاء داخل نصف الدائرة' : 'ضع الكرة البيضاء في مكان صالح');
    balls = [{ id: 0, x: cueArg.x, y: cueArg.y }, ...objects];
  }
  if (s.snk) return strokeSnooker(ctx, s, s.snk, by, balls, angle, power, spin, nom);
  if (bot && needCall(s) && pocket === null) pocket = 0;
  const call = needCall(s) ? pocket : null;
  if (needCall(s) && call === null) throw new GameError('اختر جيب الكرة 8 أولاً');
  const sit = situation(s, call);
  const res = simulate(balls, { angle, power, spin }, true);
  const verdict = judge(sit, res);
  let final = res.balls;
  if (verdict.respot !== null) final = [...final, spotBall(final, verdict.respot)];
  const cue = final.find((b) => b.id === 0);
  s.balls = final;
  s.shotSeq++;
  const rec = res.record!;
  s.shot = { id: s.shotSeq, at: ctx.now, dur: rec.dur, tr: rec.tr, pk: rec.pk };
  s.pending = { by, verdict, cueAt: cue ? { x: cue.x, y: cue.y } : null };
  s.phase = 'rolling';
  s.rollEnds = ctx.now + rec.dur + paced(ctx, SETTLE_MS);
  s.inHand = null;
  s.aim = null;
  s.note = null;
}

/** Snooker's stroke: the nominated colour (tapped, else aimed at, else hit first), the verdict, the re-spots. */
function strokeSnooker(ctx: GameCtx, s: State, k: Snk, by: string, balls: BallPos[], angle: number, power: number, spin: number, nomArg: number | null) {
  const t = tableFor(s);
  const ids = balls.filter((b) => b.id !== 0).map((b) => b.id);
  let nom: number | null = null;
  if (k.on === 'colour') {
    if (nomArg !== null && ids.includes(nomArg)) nom = nomArg;
    else {
      const cue = balls.find((b) => b.id === 0)!;
      const g = aimGuide(balls, cue.x, cue.y, angle, t);
      if (g.ball !== null && isColour(g.ball)) nom = g.ball;
    }
  }
  const res = simulate(balls, { angle, power, spin }, true, undefined, t);
  const v = judgeSnooker({ onTable: ids, on: k.on, nominated: nom }, res);
  let final = res.balls;
  if (v.respot.length) final = respotColours(final, v.respot);
  const cue = final.find((b) => b.id === 0);
  s.balls = final;
  s.shotSeq++;
  const rec = res.record!;
  s.shot = { id: s.shotSeq, at: ctx.now, dur: rec.dur, tr: rec.tr, pk: rec.pk };
  const empty: Verdict = { foul: null, cont: false, assign: null, rack: null, respot: null, potted: v.potted };
  s.pending = { by, verdict: empty, snooker: { v, on: k.on }, cueAt: cue ? { x: cue.x, y: cue.y } : null };
  s.phase = 'rolling';
  s.rollEnds = ctx.now + rec.dur + paced(ctx, SETTLE_MS);
  s.inHand = null;
  s.aim = null;
  s.note = null;
}

export const billiards: GameModule<State, BilliardsSettings> = {
  id: 'billiards',

  start(ctx, participants, settings) {
    return startBilliards(ctx, participants, settings);
  },

  act(ctx, s, by, a) {
    if (a.type === 'resign') {
      if (s.seats.includes(by)) drop(ctx, s, by, true);
      return;
    }
    if (s.phase !== 'aim' || (a.type !== 'aim' && a.type !== 'shot')) return;
    if (by !== shooterOf(s)) {
      if (a.type === 'shot') throw new GameError('ليس دورك');
      return;
    }
    if (isNum(a.turn) && a.turn !== s.turn) return;
    const angle = num(a.a, -100, 100);
    if (angle === null) return;
    const cueArg = s.inHand ? parseCue(a.cue) : null;
    const pocket = pocketArg(a.pocket);
    const nom = s.snk?.on === 'colour' ? colourArg(a.nom) : null;
    if (a.type === 'aim') {
      let cue: [number, number] | null = s.aim?.cue ?? null;
      if (s.inHand && cueArg) {
        const objects = s.balls.filter((b) => b.id !== 0);
        const t = tableFor(s);
        const kitchen = s.inHand === 'kitchen';
        const p = legalCueSpot(objects, cueArg.x, cueArg.y, kitchen, t) ? cueArg : nearestCueSpot(objects, cueArg.x, cueArg.y, kitchen, t);
        cue = [Math.round(p.x), Math.round(p.y)];
      }
      s.aim = { seq: ++s.aimSeq, a: angle, cue: s.inHand ? cue : null, pocket: needCall(s) ? pocket : null, nom };
      return;
    }
    const power = num(a.power, 0, 1);
    if (power === null) return;
    const spin = num(a.spin, -1, 1) ?? 0;
    stroke(ctx, s, by, angle, power, spin, cueArg, pocket, nom);
  },

  tick(ctx, s) {
    if (s.phase === 'rolling' && ctx.now >= s.rollEnds) {
      applyShot(ctx, s);
      return true;
    }
    if (s.phase === 'rack' && s.nextAt !== null && ctx.now >= s.nextAt) {
      newRack(ctx, s);
      return true;
    }
    return false;
  },

  turnOf: (s) => (s.phase === 'aim' && shooterOf(s) ? [shooterOf(s)!] : []),

  botPlan(ctx, s, bots) {
    if (s.phase !== 'aim') return;
    const id = shooterOf(s);
    if (!id || !(bots.includes(id) || ctx.isBot(id)) || s.botTurn === s.turn) return;
    s.botTurn = s.turn;
    const side = s.sides[s.sideOf[id]];
    const opp = s.sides.find((x, i) => i !== s.sideOf[id] && !x.out);
    const shot = botShot({
      mode: s.settings.mode,
      balls: s.balls,
      inHand: s.inHand,
      breakShot: s.breakShot,
      group: s.settings.mode === 'eight' ? side.group : null,
      oppGroup: s.settings.mode === 'eight' ? (opp?.group ?? null) : null,
      callPocket: s.settings.callPocket,
      level: botLevel(ctx),
      rnd: s.rnd,
      snooker: s.snk ? { on: s.snk.on, lead: s.snk.scores[s.sideOf[id]] - (opp ? s.snk.scores[s.sides.indexOf(opp)] : 0), remaining: snookerRemaining(s.balls.map((b) => b.id), s.snk.on) } : undefined,
    });
    const cue = shot.cue ? [shot.cue.x, shot.cue.y] : undefined;
    const think = randDelay(900, 1600) + (s.inHand ? 500 : 0);
    ctx.bot(id, `aim:${s.turn}`, think, { type: 'aim', turn: s.turn, a: shot.angle, cue, pocket: shot.pocket, nom: shot.nom });
    ctx.bot(id, `shot:${s.turn}`, think + randDelay(700, 1200), { type: 'shot', turn: s.turn, a: shot.angle, power: shot.power, spin: shot.spin, cue, pocket: shot.pocket, nom: shot.nom });
  },

  view(ctx, s): BilliardsView {
    const shooter = shooterOf(s);
    const fresh = s.shot && ctx.now - s.shot.at < SHOT_SEND_MS;
    const flat: number[] = [];
    for (const b of s.balls) flat.push(b.id, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10);
    return {
      game: 'billiards',
      mode: s.settings.mode,
      phase: s.phase,
      players: [...s.seats],
      sides: s.sides.map((x) => ({ ...x, ids: [...x.ids], pocketed: [...x.pocketed] })),
      shooter: s.phase === 'rolling' ? (s.pending?.by ?? shooter) : shooter,
      side: shooter ? (s.sideOf[shooter] ?? 0) : 0,
      balls: flat,
      inHand: s.phase === 'aim' ? s.inHand : null,
      breakShot: s.breakShot,
      targets: s.phase === 'aim' ? targetsNow(s) : [],
      needCall: s.phase === 'aim' && needCall(s),
      aim: s.phase === 'aim' ? s.aim : null,
      shotId: s.shotSeq,
      shot: fresh ? s.shot : null,
      note: s.note,
      rack: s.rack,
      race: s.settings.race,
      winner: s.winner,
      nextAt: s.nextAt,
      callPocket: s.settings.callPocket,
      guide: s.settings.guide,
      snooker: s.snk ? { scores: [...s.snk.scores], brk: s.snk.brk, on: s.snk.on, remaining: snookerRemaining(s.balls.map((b) => b.id), s.snk.on) } : null,
    };
  },

  onLeave(ctx, s, id) {
    drop(ctx, s, id, false);
  },

  patchSettings(settings, patch) {
    const next = sanitizeBilliards({ ...settings, ...(patch as Partial<BilliardsSettings>) });
    Object.assign(settings, next);
  },

  result(s) {
    if (s.phase !== 'final' || s.winner === null) return null;
    const order = s.sides
      .map((side, i) => ({ side, i }))
      .filter(({ i }) => i !== s.winner)
      .sort((a, b) => Number(a.side.out) - Number(b.side.out) || b.side.wins - a.side.wins);
    const places: string[][] = [s.sides[s.winner].ids.slice()];
    let prev: { wins: number; out: boolean } | null = null;
    for (const { side } of order) {
      const key = { wins: side.wins, out: side.out };
      if (prev && prev.wins === key.wins && prev.out === key.out && !side.out) places[places.length - 1].push(...side.ids);
      else places.push(side.ids.slice());
      prev = key;
    }
    return { places };
  },
};

export type { State as BilliardsState };
