/**
 * «الانقلاب» — the hidden-role bluffing game (rules at the top of src/shared/games/coup.ts).
 *
 * The server holds the deck (15 cards, 3 of each role) and every hand. A turn is a small state machine:
 *
 *   turn ── declare ──► [window: challenge] ──► [window: block] ──► [window: challenge the block] ──► resolve
 *                              │                       │                        │
 *                              └─ challenge ──► proof ─┴─ (lose queue) ─────────┘──► next / end of turn
 *
 * - A window lists who may answer (`eligible`); it closes early once they all let it go (people away count as
 *   letting it go), or when its time is up. Windows nobody can answer are skipped: income and coup open none,
 *   aid opens only the block window, tax and exchange only the challenge window.
 * - A challenge closes the window at once and shows its result for a moment («proof»). Then the influence
 *   losses are played one by one (`loses`): a player with two hidden cards chooses which to reveal (bots
 *   choose too; the time runs out = a random one), with one card left it is revealed at once.
 * - After the losses the turn goes on where it stood (`pending.next`): to the block window, to the action,
 *   or to the next player.
 *
 * The view sends a phone only its own hidden cards (and, during its own exchange, the two drawn cards). Other
 * players appear as counts and face-up cards; the deck only as a number.
 */
import {
  ACTION_INFO,
  COUP_COST,
  COUP_DEFAULTS,
  COUP_EXCHANGE_MS,
  COUP_FORCE,
  COUP_INFORM_COST,
  COUP_LOSE_MS,
  COUP_ROLES,
  COUP_COPIES,
  COUP_SEIZE,
  COUP_START_COINS,
  COUP_TURN_SECONDS,
  COUP_WINDOW_SECONDS,
  ROLE_INFO,
  isAction,
  isRole,
  type CoupAction,
  type CoupLoseReason,
  type CoupPending,
  type CoupRole,
  type CoupSettings,
  type CoupView,
  type CoupWindow,
} from '../../src/shared/games/coup';
import type { BotLevel } from '../../src/shared/protocol';
import { botBlock, botChallenge, botKeep, botLoseIdx, botTurn, strongest, type BotInfo, type Rnd, type Stakes } from '../coup-bots';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';

/** A challenge's result stays on the screens this long (at the room's pace). */
export const COUP_PROOF_MS = 2600;
/** Lines kept in the view's log. */
const LOG = 8;

interface Seat {
  id: string;
  coins: number;
  hand: CoupRole[];
  revealed: CoupRole[];
  out: boolean;
  claim: CoupRole | null;
}

interface Pend extends CoupPending {
  /** where the turn goes once the losses are played */
  next: 'block' | 'resolve' | 'end';
}

interface Win extends CoupWindow {
  /** what each bot decided when the window opened (played at the latest when the time runs out) */
  intents: Record<string, { type: 'pass' } | { type: 'challenge' } | { type: 'block'; role: CoupRole }>;
}

interface State {
  settings: CoupSettings;
  /** seat order (players who left stay here, marked in `left`) */
  order: string[];
  seats: Record<string, Seat>;
  left: string[];
  deck: CoupRole[];
  phase: CoupView['phase'];
  seq: number;
  turn: string | null;
  turnEndsAt: number | null;
  pending: Pend | null;
  window: Win | null;
  loses: { who: string; reason: CoupLoseReason }[];
  loseEndsAt: number | null;
  exchange: { by: string; drawn: CoupRole[]; endsAt: number } | null;
  proofEndsAt: number | null;
  log: { text: string; by: string | null }[];
  outOrder: string[];
  winner: string | null;
  twoPlayer: boolean;
  /** public memory for the bots: every claim, and roles a player was caught without */
  claims: Record<string, CoupRole[]>;
  lacks: Record<string, CoupRole[]>;
  rnd: Rnd;
}

const snap = (v: unknown, opts: readonly number[], d: number): number =>
  isNum(v) ? opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]) : d;

export function sanitizeCoup(raw: Partial<CoupSettings> | undefined): CoupSettings {
  return {
    windowSec: snap(raw?.windowSec, COUP_WINDOW_SECONDS, COUP_DEFAULTS.windowSec),
    turnSec: snap(raw?.turnSec, COUP_TURN_SECONDS, COUP_DEFAULTS.turnSec),
  };
}

function shuffleIn<T>(a: T[], rnd: Rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

const roleName = (r: CoupRole) => ROLE_INFO[r].name;
/** A number kept left-to-right inside the Arabic line («+3» never turns into «3+»). */
const n = (v: string | number) => `\u2066${v}\u2069`;
const alive = (s: State) => s.order.filter((p) => !s.seats[p].out && !s.left.includes(p));
const isIn = (s: State, id: string | null | undefined): id is string => !!id && !!s.seats[id] && !s.seats[id].out && !s.left.includes(id);
const bump = (s: State) => s.seq++;

function say(ctx: GameCtx, s: State, text: string, by?: string) {
  s.log.push({ text, by: by ?? null });
  if (s.log.length > LOG) s.log.shift();
  ctx.say?.(text, by);
}

/** «قطعة واحدة»، «قطعتان»، «3 قطع» */
export function coinsText(n: number) {
  if (n === 1) return 'قطعة واحدة';
  if (n === 2) return 'قطعتان';
  return n >= 3 && n <= 10 ? `${n} قطع` : `${n} قطعة`;
}

/* ------------------------------------------------------------------ */
/* Turns                                                               */
/* ------------------------------------------------------------------ */

function startTurn(ctx: GameCtx, s: State, id: string): void {
  s.phase = 'turn';
  s.turn = id;
  s.pending = null;
  s.window = null;
  s.exchange = null;
  s.proofEndsAt = null;
  s.loses = [];
  s.loseEndsAt = null;
  s.turnEndsAt = s.settings.turnSec ? ctx.now + s.settings.turnSec * 1000 : null;
  bump(s);
}

function nextTurn(ctx: GameCtx, s: State): void {
  if (checkWin(ctx, s)) return;
  const n = s.order.length;
  const at = s.turn ? s.order.indexOf(s.turn) : -1;
  for (let k = 1; k <= n; k++) {
    const id = s.order[(at + k + n) % n];
    if (isIn(s, id)) return startTurn(ctx, s, id);
  }
}

function checkWin(ctx: GameCtx, s: State): boolean {
  if (s.phase === 'final') return true;
  const a = alive(s);
  if (a.length > 1) return false;
  s.phase = 'final';
  s.winner = a[0] ?? null;
  s.turn = null;
  s.turnEndsAt = null;
  s.pending = null;
  s.window = null;
  s.exchange = null;
  s.loses = [];
  s.loseEndsAt = null;
  s.proofEndsAt = null;
  bump(s);
  if (s.winner) {
    ctx.fx('win', s.winner);
    say(ctx, s, `الفوز من نصيب ${ctx.playerName(s.winner)}: آخر من بقي في القصر!`, s.winner);
  }
  return true;
}

function announce(ctx: GameCtx, s: State, by: string, action: CoupAction, target: string | null): void {
  const me = s.seats[by];
  const info = ACTION_INFO[action];
  if (me.coins >= COUP_FORCE && action !== 'coup') throw new GameError('مع 10 قطع أو أكثر لا بد من الانقلاب');
  if (me.coins < info.cost) throw new GameError(`يلزم ${coinsText(info.cost)} لهذا العمل`);
  if (info.target) {
    if (!isIn(s, target) || target === by) throw new GameError('اختر لاعباً من القصر');
    if (action === 'seize' && s.seats[target].coins <= 0) throw new GameError('لا قطع عند هذا اللاعب');
  } else target = null;

  me.coins -= info.cost;
  s.turnEndsAt = null;
  const p: Pend = { action, by, target, claim: info.role, block: null, challenge: null, failed: false, next: 'end' };
  s.pending = p;
  if (info.role) claim(s, by, info.role);
  const name = ctx.playerName(by);
  const tName = target ? ctx.playerName(target) : '';

  switch (action) {
    case 'income':
      me.coins += 1;
      ctx.fx('card', by);
      say(ctx, s, `الدخل: ${n('+1')} · ${name}`, by);
      return nextTurn(ctx, s);
    case 'coup':
      ctx.fx('boom', target!);
      say(ctx, s, `انقلاب من ${name} على ${tName}!`, by);
      s.loses.push({ who: target!, reason: 'coup' });
      p.next = 'end';
      return runLoses(ctx, s);
    case 'aid':
      say(ctx, s, `طلب المعونة · ${name}`, by);
      return toBlock(ctx, s);
    case 'tax':
      say(ctx, s, `ادّعاء الوزير من ${name}: الضريبة`, by);
      break;
    case 'inform':
      say(ctx, s, `ادّعاء الواشي من ${name}: وشاية بـ${tName}`, by);
      break;
    case 'seize':
      say(ctx, s, `ادّعاء القرصان من ${name}: الاستيلاء على قطع ${tName}`, by);
      break;
    case 'exchange':
      say(ctx, s, `ادّعاء السفير من ${name}: التبديل`, by);
      break;
  }
  ctx.fx('card', by);
  openWindow(ctx, s, 'challenge', alive(s).filter((x) => x !== by), []);
}

function claim(s: State, by: string, role: CoupRole) {
  s.seats[by].claim = role;
  (s.claims[by] ??= []).push(role);
}

function openWindow(ctx: GameCtx, s: State, kind: CoupWindow['kind'], eligible: string[], roles: CoupRole[]): void {
  if (!eligible.length) return closeWindow(ctx, s, kind);
  const total = s.settings.windowSec * 1000;
  s.window = { kind, eligible, passed: [], roles, endsAt: ctx.now + total, total, intents: {} };
  s.phase = 'window';
  bump(s);
}

/** Nobody answered (or everyone let it go). */
function closeWindow(ctx: GameCtx, s: State, kind: CoupWindow['kind']): void {
  s.window = null;
  const p = s.pending!;
  if (kind === 'challenge') return toBlock(ctx, s);
  if (kind === 'block') return resolve(ctx, s);
  // the block stands
  p.failed = true;
  say(ctx, s, `«${ACTION_INFO[p.action].name}» ممنوعة: ${roleName(p.block!.role)} · ${ctx.playerName(p.block!.by)}`, p.block!.by);
  nextTurn(ctx, s);
}

function toBlock(ctx: GameCtx, s: State): void {
  const p = s.pending!;
  if (p.failed || !isIn(s, p.by)) return nextTurn(ctx, s);
  const roles = ACTION_INFO[p.action].blockedBy;
  let blockers: string[] = [];
  if (p.action === 'aid') blockers = alive(s).filter((x) => x !== p.by);
  else if (roles.length && isIn(s, p.target)) blockers = [p.target];
  if (!blockers.length) return resolve(ctx, s);
  openWindow(ctx, s, 'block', blockers, roles);
}

function resolve(ctx: GameCtx, s: State): void {
  const p = s.pending!;
  s.window = null;
  if (p.failed || !isIn(s, p.by)) return nextTurn(ctx, s);
  const me = s.seats[p.by];
  const name = ctx.playerName(p.by);
  switch (p.action) {
    case 'aid':
      me.coins += 2;
      say(ctx, s, `المعونة: ${n('+2')} · ${name}`, p.by);
      break;
    case 'tax':
      me.coins += 3;
      say(ctx, s, `الضريبة: ${n('+3')} · ${name}`, p.by);
      break;
    case 'seize': {
      if (!isIn(s, p.target)) break;
      const t = s.seats[p.target];
      const n = Math.min(COUP_SEIZE, t.coins);
      t.coins -= n;
      me.coins += n;
      say(ctx, s, `${coinsText(n)} من ${ctx.playerName(p.target)} إلى ${name}`, p.by);
      break;
    }
    case 'inform': {
      if (!isIn(s, p.target)) break;
      s.loses.push({ who: p.target, reason: 'inform' });
      p.next = 'end';
      return runLoses(ctx, s);
    }
    case 'exchange': {
      const drawn = s.deck.splice(0, Math.min(2, s.deck.length));
      s.exchange = { by: p.by, drawn, endsAt: ctx.now + COUP_EXCHANGE_MS };
      s.phase = 'exchange';
      bump(s);
      return;
    }
  }
  nextTurn(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

function challenge(ctx: GameCtx, s: State, by: string): void {
  const w = s.window!;
  const p = s.pending!;
  const onBlock = w.kind === 'blockChallenge';
  const claimer = onBlock ? p.block!.by : p.by;
  const role = onBlock ? p.block!.role : p.claim!;
  const seat = s.seats[claimer];
  const at = seat.hand.indexOf(role);
  const proven = at >= 0;
  s.window = null;
  p.challenge = { by, of: claimer, role, proven };
  const cName = ctx.playerName(by);
  const oName = ctx.playerName(claimer);
  ctx.fx('buzz', by);
  say(ctx, s, `تحدٍّ من ${cName} لادّعاء ${oName}: ${roleName(role)}`, by);
  if (proven) {
    // the card is shown, goes back into the deck, the deck is shuffled, a new card is drawn
    seat.hand.splice(at, 1);
    s.deck.push(role);
    shuffleIn(s.deck, s.rnd);
    seat.hand.push(s.deck.shift()!);
    s.lacks[claimer] = [];
    s.loses.push({ who: by, reason: 'wrong' });
    if (onBlock) {
      p.failed = true;
      p.next = 'end';
    } else p.next = 'block';
  } else {
    (s.lacks[claimer] ??= []).push(role);
    s.loses.push({ who: claimer, reason: 'caught' });
    if (onBlock) p.next = 'resolve';
    else {
      p.failed = true;
      p.next = 'end';
      // a caught «الوشاية» gives its 3 coins back
      if (p.action === 'inform') seat.coins += COUP_INFORM_COST;
    }
  }
  s.phase = 'proof';
  s.proofEndsAt = ctx.now + paced(ctx, COUP_PROOF_MS);
  bump(s);
}

function block(ctx: GameCtx, s: State, by: string, role: CoupRole): void {
  const p = s.pending!;
  s.window = null;
  p.block = { by, role };
  claim(s, by, role);
  ctx.fx('skip', by);
  say(ctx, s, `منع من ${ctx.playerName(by)} بادّعاء ${roleName(role)}`, by);
  openWindow(ctx, s, 'blockChallenge', alive(s).filter((x) => x !== by), []);
}

function pass(ctx: GameCtx, s: State, by: string): void {
  const w = s.window!;
  if (!w.passed.includes(by)) w.passed.push(by);
  maybeClose(ctx, s);
}

/** Everyone who may answer has let it go (people away count as letting it go): the window closes. */
function maybeClose(ctx: GameCtx, s: State): void {
  const w = s.window;
  if (!w || s.phase !== 'window') return;
  if (w.eligible.every((p) => w.passed.includes(p) || !isIn(s, p) || !ctx.isConnected(p))) closeWindow(ctx, s, w.kind);
}

/* ------------------------------------------------------------------ */
/* Influence                                                           */
/* ------------------------------------------------------------------ */

/** Play the queued losses; when they are done, go on with the turn. */
function runLoses(ctx: GameCtx, s: State): void {
  s.proofEndsAt = null;
  while (s.loses.length) {
    const l = s.loses[0];
    if (!isIn(s, l.who)) {
      s.loses.shift();
      continue;
    }
    const seat = s.seats[l.who];
    if (seat.hand.length === 1) {
      s.loses.shift();
      reveal(ctx, s, l.who, 0);
      continue;
    }
    s.phase = 'lose';
    s.loseEndsAt = ctx.now + COUP_LOSE_MS;
    bump(s);
    return;
  }
  s.loseEndsAt = null;
  if (checkWin(ctx, s)) return;
  const p = s.pending;
  if (!p) return nextTurn(ctx, s);
  if (p.next === 'block') return toBlock(ctx, s);
  if (p.next === 'resolve') return resolve(ctx, s);
  nextTurn(ctx, s);
}

function reveal(ctx: GameCtx, s: State, who: string, idx: number): void {
  const seat = s.seats[who];
  const [card] = seat.hand.splice(idx, 1);
  seat.revealed.push(card);
  const name = ctx.playerName(who);
  if (!seat.hand.length) {
    seat.out = true;
    seat.coins = 0;
    s.outOrder.push(who);
    ctx.fx('death', who);
    say(ctx, s, `بطاقة مكشوفة: ${roleName(card)} · خروج ${name} من القصر`, who);
  } else {
    ctx.fx('reveal', who);
    say(ctx, s, `خسارة نفوذ: ${roleName(card)} مكشوف · ${name}`, who);
  }
}

function chooseLoss(ctx: GameCtx, s: State, by: string, idx: number): void {
  const l = s.loses[0];
  if (!l || l.who !== by) throw new GameError('ليس دورك');
  const seat = s.seats[by];
  if (!Number.isInteger(idx) || idx < 0 || idx >= seat.hand.length) return;
  s.loses.shift();
  reveal(ctx, s, by, idx);
  runLoses(ctx, s);
}

function finishExchange(ctx: GameCtx, s: State, keepIdx: number[] | null): void {
  const x = s.exchange!;
  const seat = s.seats[x.by];
  const cards = [...seat.hand, ...x.drawn];
  const keep = seat.hand.length;
  const chosen = keepIdx && keepIdx.length === keep && new Set(keepIdx).size === keep && keepIdx.every((i) => Number.isInteger(i) && i >= 0 && i < cards.length) ? keepIdx : cards.slice(0, keep).map((_, i) => i);
  seat.hand = chosen.map((i) => cards[i]);
  const back = cards.filter((_, i) => !chosen.includes(i));
  s.deck.push(...back);
  shuffleIn(s.deck, s.rnd);
  s.exchange = null;
  s.lacks[x.by] = [];
  say(ctx, s, `تبديل البطاقات مع الرزمة · ${ctx.playerName(x.by)}`, x.by);
  nextTurn(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** A bot's time, by what it does: [fastest, slowest] in ms. */
export const COUP_BOT_MS: Record<'turn' | 'answer' | 'lose' | 'exchange', [number, number]> = {
  turn: [1800, 3600],
  answer: [1100, 2600],
  lose: [1300, 2400],
  exchange: [1800, 3200],
};

function infoFor(s: State, me: string): BotInfo {
  return {
    me,
    hand: [...s.seats[me].hand],
    seats: Object.fromEntries(s.order.map((p) => [p, { coins: s.seats[p].coins, hidden: s.seats[p].hand.length, revealed: [...s.seats[p].revealed], out: !isIn(s, p) }])),
    alive: alive(s),
    claims: Object.fromEntries(Object.entries(s.claims).map(([k, v]) => [k, [...v]])),
    lacks: Object.fromEntries(Object.entries(s.lacks).map(([k, v]) => [k, [...v]])),
  };
}

const delay = (s: State, kind: keyof typeof COUP_BOT_MS) => {
  const [lo, hi] = COUP_BOT_MS[kind];
  return Math.round(lo + s.rnd() * (hi - lo));
};

function windowIntent(level: BotLevel, s: State, b: string): Win['intents'][string] {
  const w = s.window!;
  const p = s.pending!;
  const info = infoFor(s, b);
  if (w.kind === 'block') {
    const role = botBlock(level, info, p.action, p.by, s.rnd);
    return role && w.roles.includes(role) ? { type: 'block', role } : { type: 'pass' };
  }
  const onBlock = w.kind === 'blockChallenge';
  const claimer = onBlock ? p.block!.by : p.by;
  const role = onBlock ? p.block!.role : p.claim!;
  let stakes: Stakes = 'small';
  let lethal = false;
  if (!onBlock) {
    if (p.target === b) stakes = 'me';
    else if (p.action === 'tax' && s.seats[p.by].coins + 3 >= COUP_COST) stakes = 'big';
    else if (p.action === 'inform') stakes = 'big';
    lethal = p.action === 'inform' && p.target === b && info.hand.length === 1 && !info.hand.includes('harisa');
  } else if (p.by === b) stakes = 'me';
  return botChallenge(level, info, claimer, role, stakes, s.rnd, lethal, onBlock) ? { type: 'challenge' } : { type: 'pass' };
}

function planBots(ctx: GameCtx, s: State, bots: string[]): void {
  const level = botLevel(ctx);
  const mine = (id: string | null | undefined): id is string => !!id && bots.includes(id);
  const seq = s.seq;
  if (s.phase === 'turn' && mine(s.turn)) {
    const plan = botTurn(level, infoFor(s, s.turn), s.rnd);
    ctx.bot(s.turn, `t:${seq}`, delay(s, 'turn'), { type: 'declare', seq, action: plan.action, ...(plan.target ? { target: plan.target } : {}) });
  } else if (s.phase === 'window' && s.window) {
    const w = s.window;
    for (const b of w.eligible) {
      if (!mine(b) || w.passed.includes(b) || w.intents[b] || !isIn(s, b)) continue;
      const intent = windowIntent(level, s, b);
      w.intents[b] = intent;
      ctx.bot(b, `w:${seq}`, delay(s, 'answer'), { ...intent, seq });
    }
  } else if (s.phase === 'lose' && mine(s.loses[0]?.who)) {
    const who = s.loses[0].who;
    ctx.bot(who, `l:${seq}`, delay(s, 'lose'), { type: 'lose', seq, idx: botLoseIdx(level, infoFor(s, who), s.rnd) });
  } else if (s.phase === 'exchange' && s.exchange && mine(s.exchange.by)) {
    const x = s.exchange;
    const cards = [...s.seats[x.by].hand, ...x.drawn];
    ctx.bot(x.by, `x:${seq}`, delay(s, 'exchange'), { type: 'keep', seq, keep: botKeep(level, cards, s.seats[x.by].hand.length, s.rnd) });
  }
}

/** A window's time is up: a bot that meant to answer does so now; then it closes. */
function expireWindow(ctx: GameCtx, s: State): void {
  const w = s.window!;
  for (const b of w.eligible) {
    const it = w.intents[b];
    if (!it || it.type === 'pass' || w.passed.includes(b) || !isIn(s, b)) continue;
    if (it.type === 'challenge') return challenge(ctx, s, b);
    return block(ctx, s, b, it.role);
  }
  closeWindow(ctx, s, w.kind);
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startCoup(ctx: GameCtx, participants: string[], raw: CoupSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeCoup(raw);
  const order = [...participants];
  shuffleIn(order, rnd);
  const deck: CoupRole[] = COUP_ROLES.flatMap((r) => Array.from({ length: COUP_COPIES }, () => r));
  shuffleIn(deck, rnd);
  const seats: Record<string, Seat> = {};
  for (const id of order) seats[id] = { id, coins: COUP_START_COINS, hand: deck.splice(0, 2), revealed: [], out: false, claim: null };
  const twoPlayer = order.length === 2;
  // the official two-player tweak: the first player starts with one coin
  if (twoPlayer) seats[order[0]].coins = 1;
  const s: State = {
    settings,
    order,
    seats,
    left: [],
    deck,
    phase: 'turn',
    seq: 0,
    turn: null,
    turnEndsAt: null,
    pending: null,
    window: null,
    loses: [],
    loseEndsAt: null,
    exchange: null,
    proofEndsAt: null,
    log: [],
    outOrder: [],
    winner: null,
    twoPlayer,
    claims: {},
    lacks: {},
    rnd,
  };
  ctx.fx('start');
  if (order.length) {
    startTurn(ctx, s, order[0]);
    say(ctx, s, `القصر مفتوح: البداية مع ${ctx.playerName(order[0])}`, order[0]);
  }
  return s;
}

export const coup: GameModule<State, CoupSettings> = {
  id: 'coup',

  start(ctx, participants, raw) {
    return startCoup(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.seats[by] || s.phase === 'final') return;
    // every answer names the step it saw: a late tap never answers a newer question
    if (!isNum(a.seq) || a.seq !== s.seq) return;
    switch (a.type) {
      case 'declare': {
        if (s.phase !== 'turn' || s.turn !== by) throw new GameError('ليس دورك');
        if (!isAction(a.action)) return;
        return announce(ctx, s, by, a.action, isStr(a.target) ? a.target : null);
      }
      case 'challenge':
      case 'pass':
      case 'block': {
        const w = s.window;
        if (s.phase !== 'window' || !w || !w.eligible.includes(by) || w.passed.includes(by) || !isIn(s, by)) return;
        if (a.type === 'pass') return pass(ctx, s, by);
        if (a.type === 'challenge') {
          if (w.kind === 'block') return;
          return challenge(ctx, s, by);
        }
        if (w.kind !== 'block' || !isRole(a.role) || !w.roles.includes(a.role)) return;
        return block(ctx, s, by, a.role);
      }
      case 'lose': {
        if (s.phase !== 'lose' || !isNum(a.idx)) return;
        return chooseLoss(ctx, s, by, a.idx);
      }
      case 'keep': {
        if (s.phase !== 'exchange' || s.exchange?.by !== by) return;
        if (!Array.isArray(a.keep) || !a.keep.every(isNum)) throw new GameError('اختر البطاقات التي تحتفظ بها');
        const need = s.seats[by].hand.length;
        if (a.keep.length !== need || new Set(a.keep).size !== need) throw new GameError(need === 1 ? 'اختر بطاقة واحدة' : 'اختر بطاقتين');
        return finishExchange(ctx, s, a.keep as number[]);
      }
    }
  },

  tick(ctx, s) {
    switch (s.phase) {
      case 'turn':
        if (s.turnEndsAt !== null && ctx.now >= s.turnEndsAt && s.turn) {
          const id = s.turn;
          const me = s.seats[id];
          say(ctx, s, `انتهى وقت الدور · ${ctx.playerName(id)}`, id);
          if (me.coins >= COUP_FORCE) announce(ctx, s, id, 'coup', strongest(infoFor(s, id), s.rnd));
          else announce(ctx, s, id, 'income', null);
          return true;
        }
        return false;
      case 'window':
        if (s.window && ctx.now >= s.window.endsAt) {
          expireWindow(ctx, s);
          return true;
        }
        if (s.window) {
          const before = s.seq;
          maybeClose(ctx, s);
          return s.seq !== before || s.phase !== 'window';
        }
        return false;
      case 'proof':
        if (s.proofEndsAt !== null && ctx.now >= s.proofEndsAt) {
          runLoses(ctx, s);
          return true;
        }
        return false;
      case 'lose':
        if (s.loseEndsAt !== null && ctx.now >= s.loseEndsAt && s.loses.length) {
          const who = s.loses[0].who;
          chooseLoss(ctx, s, who, Math.floor(s.rnd() * s.seats[who].hand.length));
          return true;
        }
        return false;
      case 'exchange':
        if (s.exchange && ctx.now >= s.exchange.endsAt) {
          finishExchange(ctx, s, null);
          return true;
        }
        return false;
    }
    return false;
  },

  turnOf(s) {
    if (s.phase === 'turn' && s.turn) return [s.turn];
    if (s.phase === 'window' && s.window) return s.window.eligible.filter((p) => !s.window!.passed.includes(p) && isIn(s, p));
    if (s.phase === 'lose' && s.loses[0]) return [s.loses[0].who];
    if (s.phase === 'exchange' && s.exchange) return [s.exchange.by];
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'final') return;
    planBots(ctx, s, bots);
  },

  view(ctx, s, me): CoupView {
    const p = s.pending;
    const w = s.window;
    const x = s.exchange;
    const players = s.order.filter((id) => !s.left.includes(id));
    return {
      game: 'coup',
      phase: s.phase,
      seq: s.seq,
      players,
      seats: Object.fromEntries(
        players.map((id) => {
          const t = s.seats[id];
          return [id, { id, coins: t.coins, hidden: t.hand.length, revealed: [...t.revealed], out: t.out, claim: t.claim, kept: s.phase === 'final' ? [...t.hand] : null }];
        }),
      ),
      turn: s.turn,
      turnEndsAt: s.phase === 'turn' ? s.turnEndsAt : null,
      turnTotal: s.settings.turnSec * 1000,
      hand: s.seats[me] && !s.left.includes(me) ? [...s.seats[me].hand] : [],
      pending: p ? { action: p.action, by: p.by, target: p.target, claim: p.claim, block: p.block ? { ...p.block } : null, challenge: p.challenge ? { ...p.challenge } : null, failed: p.failed } : null,
      window: w && s.phase === 'window' ? { kind: w.kind, eligible: [...w.eligible], passed: [...w.passed], roles: [...w.roles], endsAt: w.endsAt, total: w.total } : null,
      lose: s.phase === 'lose' && s.loses[0] ? { who: s.loses[0].who, reason: s.loses[0].reason, endsAt: s.loseEndsAt ?? ctx.now, total: COUP_LOSE_MS } : null,
      exchange: x && s.phase === 'exchange' ? { by: x.by, cards: x.by === me ? [...s.seats[me].hand, ...x.drawn] : null, keep: s.seats[x.by].hand.length, endsAt: x.endsAt, total: COUP_EXCHANGE_MS } : null,
      proofEndsAt: s.phase === 'proof' ? s.proofEndsAt : null,
      deck: s.deck.length,
      log: s.log.map((l) => ({ ...l })),
      outOrder: s.outOrder.filter((id) => !s.left.includes(id)),
      winner: s.winner,
      twoPlayer: s.twoPlayer,
      windowSec: s.settings.windowSec,
    };
  },

  onLeave(ctx, s, id) {
    const seat = s.seats[id];
    if (!seat || s.left.includes(id)) return;
    s.left.push(id);
    if (s.phase === 'final') return;
    const wasIn = !seat.out;
    // the cards of a player who leaves are turned face up (out of the game)
    if (wasIn) {
      seat.revealed.push(...seat.hand);
      seat.hand = [];
      seat.out = true;
      seat.coins = 0;
      say(ctx, s, `مغادرة ${ctx.playerName(id)}: خروج من القصر`);
    }
    const wasLosing = s.loses[0]?.who === id;
    s.loses = s.loses.filter((l) => l.who !== id);
    if (s.exchange?.by === id) {
      s.deck.push(...s.exchange.drawn);
      shuffleIn(s.deck, s.rnd);
      s.exchange = null;
    }
    if (checkWin(ctx, s)) return;
    const p = s.pending;
    if (p) {
      if (p.by === id) {
        p.failed = true;
        p.next = 'end';
      } else if (p.target === id && ACTION_INFO[p.action].target) {
        // nobody left to aim at: the turn ends (coins already paid stay paid)
        p.failed = true;
        p.next = 'end';
      }
    }
    switch (s.phase) {
      case 'turn':
        if (s.turn === id) nextTurn(ctx, s);
        return;
      case 'window': {
        const w = s.window!;
        if (p?.failed) {
          s.window = null;
          return runLoses(ctx, s);
        }
        if (w.kind === 'blockChallenge' && p?.block?.by === id) {
          // the blocker left: the block goes with them
          p.block = null;
          s.window = null;
          return resolve(ctx, s);
        }
        w.eligible = w.eligible.filter((x) => x !== id);
        if (!w.eligible.length) return closeWindow(ctx, s, w.kind);
        return maybeClose(ctx, s);
      }
      case 'lose':
        if (wasLosing) runLoses(ctx, s);
        return;
      case 'exchange':
        if (!s.exchange) nextTurn(ctx, s);
        return;
      case 'proof':
        return;
    }
  },

  patchSettings(settings, patch) {
    if (isNum(patch.windowSec)) settings.windowSec = snap(patch.windowSec, COUP_WINDOW_SECONDS, settings.windowSec);
    if (isNum(patch.turnSec)) settings.turnSec = snap(patch.turnSec, COUP_TURN_SECONDS, settings.turnSec);
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const rest = [...s.outOrder].reverse().filter((id) => !s.left.includes(id) && id !== s.winner);
    return { places: [[s.winner], ...rest.map((id) => [id])] };
  },
};

export type { State as CoupState };
