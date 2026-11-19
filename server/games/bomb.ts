/**
 * «القنبلة» — the server (rules at the top of src/shared/games/bomb.ts).
 *
 * The server holds the deck (index 0 = the top) and every hand. A turn is a small state machine:
 *
 *   turn ── action card ──► window («لا!», restarts after each one) ──► effect ──► turn (same player)
 *     │                                                          └──► skip / attack: the turn ends
 *     │                                                          └──► «طلب»: give (the asked player chooses)
 *     └── draw ──► safe card: the turn ends
 *               └► bomb ──► boom (everyone sees it) ──► defuse: place (secretly) ──► the turn ends
 *                                                    └► no defuse: out ──► next player
 *
 * The «لا!» window lasts the same for everyone (there is no «pass»): closing it early when nobody holds «لا!» would
 * tell the table who does. It is skipped only when every «لا!» is in the discard pile (public).
 *
 * What each player knows about the top of the deck is kept in `known` (their own «نظرة», the bomb they put back);
 * it shifts as cards are drawn and is cleared when the deck is shuffled or someone else puts a bomb back. Bots
 * decide from that and the public counts only (server/bomb-bots.ts).
 */
import {
  BOMB_BOOM_MS,
  BOMB_DEFAULTS,
  BOMB_GIVE_MS,
  BOMB_HAND,
  BOMB_KINDS,
  BOMB_PLACE_MS,
  BOMB_TURN_SECONDS,
  BOMB_WINDOW_SECONDS,
  CARD_INFO,
  deckCounts,
  isActionKind,
  isPairKind,
  turnsText,
  type ActionKind,
  type BombCard,
  type BombKind,
  type BombPending,
  type BombPlace,
  type BombSettings,
  type BombView,
} from '../../src/shared/games/bomb';
import { li } from '../../src/shared/li';
import { botGive, botNope, botPlace, botTurn, type BombBotInfo, type Rnd } from '../bomb-bots';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';

/** Lines kept in the view's log. */
const LOG = 8;
/** Cards of the discard pile sent to the phones (the top one last). */
const DISCARD_SHOWN = 3;
/** After an action card, the turn's clock never has less than this left. */
const TURN_MIN_AFTER_MS = 12_000;

interface Seat {
  id: string;
  hand: BombCard[];
  out: boolean;
}

interface Pend extends BombPending {
  /** the cards played (already in the discard pile) */
  cards: BombCard[];
  /** what each bot decided for this step of the window: the time it plays «لا!» (or null: it lets it go) */
  intents: Record<string, number | null>;
}

interface State {
  settings: BombSettings;
  /** seat order (players who left stay here, marked in `left`) */
  order: string[];
  seats: Record<string, Seat>;
  left: string[];
  /** index 0 = the top */
  deck: BombCard[];
  discard: BombCard[];
  total: Record<BombKind, number>;
  phase: BombView['phase'];
  seq: number;
  turn: string | null;
  /** turns the current player still takes (this one included) */
  turns: number;
  /** the current player's turns come from an attack (a new attack passes them on) */
  chain: boolean;
  turnEndsAt: number | null;
  /** the turn's time left when an action card paused it */
  turnLeft: number | null;
  /** action cards played this turn (bots stop after a few) */
  plays: number;
  pending: Pend | null;
  give: { from: string; to: string; endsAt: number } | null;
  boom: { who: string; card: BombCard; endsAt: number } | null;
  place: { who: string; card: BombCard; endsAt: number } | null;
  /** what each player knows about the top of the deck */
  known: Record<string, (BombKind | null)[]>;
  notes: Record<string, { k: number; text: string; card: BombKind | null }>;
  noteK: number;
  log: { text: string; by: string | null }[];
  outOrder: string[];
  winner: string | null;
  rnd: Rnd;
}

const snap = (v: unknown, opts: readonly number[], d: number): number =>
  isNum(v) ? opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]) : d;

export function sanitizeBomb(raw: Partial<BombSettings> | undefined): BombSettings {
  return {
    windowSec: snap(raw?.windowSec, BOMB_WINDOW_SECONDS, BOMB_DEFAULTS.windowSec),
    turnSec: snap(raw?.turnSec, BOMB_TURN_SECONDS, BOMB_DEFAULTS.turnSec),
  };
}

function shuffleIn<T>(a: T[], rnd: Rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

const nameOf = (k: BombKind) => CARD_INFO[k].name;
const alive = (s: State) => s.order.filter((p) => isIn(s, p));
const isIn = (s: State, id: string | null | undefined): id is string => !!id && !!s.seats[id] && !s.seats[id].out && !s.left.includes(id);
const bump = (s: State) => s.seq++;
const nopesTotal = (s: State) => s.total.nope;
const nopesGone = (s: State) => s.discard.filter((c) => c.kind === 'nope').length;
/** Some «لا!» is still in a hand or in the deck (left players' cards went to the discard pile). */
const nopeLive = (s: State) => nopesGone(s) < nopesTotal(s);

function say(ctx: GameCtx, s: State, text: string, by?: string | null) {
  s.log.push({ text, by: by ?? null });
  if (s.log.length > LOG) s.log.shift();
  ctx.say?.(text, by ?? undefined);
}

function note(s: State, id: string, text: string, card: BombKind | null) {
  s.noteK += 1;
  s.notes[id] = { k: s.noteK, text, card };
}

/** The next player still in after `id` (null when nobody else is). */
function nextAfter(s: State, id: string): string | null {
  const n = s.order.length;
  const at = s.order.indexOf(id);
  for (let k = 1; k <= n; k++) {
    const p = s.order[(at + k + n) % n];
    if (p !== id && isIn(s, p)) return p;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The deck and what people know of it                                 */
/* ------------------------------------------------------------------ */

/** A card left the top of the deck: everyone's knowledge moves up by one. */
function drawTop(s: State): BombCard | null {
  const c = s.deck.shift() ?? null;
  if (!c) return null;
  for (const id of Object.keys(s.known)) s.known[id].shift();
  return c;
}

function shuffleDeck(s: State) {
  shuffleIn(s.deck, s.rnd);
  for (const id of Object.keys(s.known)) s.known[id] = [];
}

/** The place in the deck (0 = on top) a picker choice stands for. */
export function placeIndex(choice: BombPlace, deck: number, rnd: Rnd): number {
  if (choice === 'top') return 0;
  if (choice === 'second') return Math.min(1, deck);
  if (choice === 'third') return Math.min(2, deck);
  if (choice === 'bottom') return deck;
  if (choice === 'random') return Math.floor(rnd() * (deck + 1));
  return Math.max(0, Math.min(deck, Math.round(choice)));
}

function insertBomb(s: State, by: string, card: BombCard, at: number) {
  s.deck.splice(at, 0, card);
  // the placer knows where it is; the others only know it is somewhere
  for (const id of Object.keys(s.known)) {
    if (id !== by) {
      s.known[id] = [];
      continue;
    }
    const k = s.known[id];
    while (k.length < at) k.push(null);
    k.splice(at, 0, 'bomb');
  }
}

/* ------------------------------------------------------------------ */
/* Turns                                                               */
/* ------------------------------------------------------------------ */

function startTurn(ctx: GameCtx, s: State, id: string, turns: number, chain: boolean): void {
  s.phase = 'turn';
  s.turn = id;
  s.turns = turns;
  s.chain = chain;
  s.plays = 0;
  s.pending = null;
  s.give = null;
  s.boom = null;
  s.place = null;
  s.turnLeft = null;
  s.turnEndsAt = s.settings.turnSec ? ctx.now + s.settings.turnSec * 1000 : null;
  bump(s);
}

/** Back to the same player's turn after an action card (the clock goes on where it stopped). */
function resumeTurn(ctx: GameCtx, s: State): void {
  s.phase = 'turn';
  s.pending = null;
  s.give = null;
  if (s.settings.turnSec) s.turnEndsAt = ctx.now + Math.max(TURN_MIN_AFTER_MS, s.turnLeft ?? s.settings.turnSec * 1000);
  s.turnLeft = null;
  bump(s);
}

function pauseTurn(ctx: GameCtx, s: State) {
  if (s.turnEndsAt !== null && s.turnLeft === null) s.turnLeft = Math.max(0, s.turnEndsAt - ctx.now);
  s.turnEndsAt = null;
}

/** One of the current player's turns is over (a safe draw, a defused bomb, «تخطٍّ»). */
function endOneTurn(ctx: GameCtx, s: State): void {
  if (checkWin(ctx, s)) return;
  const id = s.turn!;
  if (isIn(s, id) && s.turns > 1) return startTurn(ctx, s, id, s.turns - 1, s.chain);
  passTurn(ctx, s, 1, false);
}

/** The turn goes to the next player still in, with `turns` turns. */
function passTurn(ctx: GameCtx, s: State, turns: number, chain: boolean): void {
  if (checkWin(ctx, s)) return;
  const nx = s.turn ? nextAfter(s, s.turn) : (alive(s)[0] ?? null);
  if (!nx) return void checkWin(ctx, s);
  startTurn(ctx, s, nx, turns, chain);
}

function checkWin(ctx: GameCtx, s: State): boolean {
  if (s.phase === 'final') return true;
  const a = alive(s);
  if (a.length > 1) return false;
  s.phase = 'final';
  s.winner = a[0] ?? null;
  s.turn = null;
  s.turnEndsAt = null;
  s.turnLeft = null;
  s.pending = null;
  s.give = null;
  s.boom = null;
  s.place = null;
  bump(s);
  if (s.winner) {
    ctx.fx('win', s.winner);
    say(ctx, s, `الفوز ${li(ctx.playerName(s.winner))}: آخر من بقي!`, s.winner);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Playing cards                                                       */
/* ------------------------------------------------------------------ */

function takeCards(s: State, by: string, ids: string[]): BombCard[] {
  const hand = s.seats[by].hand;
  const cards = ids.map((id) => hand.find((c) => c.id === id));
  if (cards.some((c) => !c) || new Set(ids).size !== ids.length) throw new GameError('هذه الورقة ليست في يدك');
  return cards as BombCard[];
}

function discard(s: State, by: string, cards: BombCard[]) {
  const ids = new Set(cards.map((c) => c.id));
  s.seats[by].hand = s.seats[by].hand.filter((c) => !ids.has(c.id));
  s.discard.push(...cards);
}

function playCards(ctx: GameCtx, s: State, by: string, ids: string[], target: string | null): void {
  if (!ids.length || ids.length > 2) throw new GameError('اختر ورقة');
  const cards = takeCards(s, by, ids);
  const kind0 = cards[0].kind;
  let kind: ActionKind | 'pair';
  if (cards.length === 2) {
    if (!isPairKind(kind0) || cards[1].kind !== kind0) throw new GameError('الزوج ورقتان من الشخصية نفسها');
    kind = 'pair';
  } else if (isActionKind(kind0)) kind = kind0;
  else if (isPairKind(kind0)) throw new GameError('شخصيات المطبخ تُلعب زوجاً: ورقتين متشابهتين');
  else if (kind0 === 'nope') throw new GameError('«لا!» تُلعب على ورقة حركة من لاعب');
  else if (kind0 === 'defuse') throw new GameError('المفكّك يُستعمل وحده عند سحب القنبلة');
  else throw new GameError('هذه الورقة لا تُلعب');

  const needsTarget = kind === 'favor' || kind === 'pair';
  if (needsTarget) {
    if (!isIn(s, target) || target === by) throw new GameError('اختر لاعباً');
    if (!s.seats[target].hand.length) throw new GameError('لا أوراق عند هذا اللاعب');
  } else target = kind === 'attack' ? nextAfter(s, by) : null;

  discard(s, by, cards);
  s.plays += 1;
  pauseTurn(ctx, s);
  const total = s.settings.windowSec * 1000;
  s.pending = { kind, card: kind0, by, target, nopes: [], endsAt: ctx.now + total, total, cards, intents: {} };
  const name = ctx.playerName(by);
  const tName = target ? ctx.playerName(target) : '';
  switch (kind) {
    case 'skip':
      say(ctx, s, `تخطٍّ من ${name}`, by);
      break;
    case 'attack':
      say(ctx, s, `هجوم على ${tName}!`, by);
      break;
    case 'peek':
      say(ctx, s, `نظرة من ${name} على أعلى الرزمة`, by);
      break;
    case 'shuffle':
      say(ctx, s, `خلط الرزمة · ${name}`, by);
      break;
    case 'favor':
      say(ctx, s, `طلب ورقة من ${tName} · ${name}`, by);
      break;
    case 'pair':
      say(ctx, s, `زوج «${nameOf(kind0)}»: سرقة من ${tName} · ${name}`, by);
      break;
  }
  ctx.fx('card', by);
  openWindow(ctx, s);
}

/** The «لا!» window for the pending action (skipped when no «لا!» can be played any more). */
function openWindow(ctx: GameCtx, s: State) {
  const p = s.pending!;
  if (!nopeLive(s)) return resolve(ctx, s);
  p.endsAt = ctx.now + p.total;
  p.intents = {};
  s.phase = 'window';
  bump(s);
}

/** May `by` play «لا!» now? (Not on their own action with nothing on it, nor on their own «لا!».) */
function mayNope(s: State, by: string): boolean {
  const p = s.pending;
  if (s.phase !== 'window' || !p || !isIn(s, by)) return false;
  if (!s.seats[by].hand.some((c) => c.kind === 'nope')) return false;
  const last = p.nopes.length ? p.nopes[p.nopes.length - 1] : p.by;
  return last !== by;
}

function nope(ctx: GameCtx, s: State, by: string, cardId: string | null): void {
  const p = s.pending!;
  const hand = s.seats[by].hand;
  const card = (cardId ? hand.find((c) => c.id === cardId && c.kind === 'nope') : null) ?? hand.find((c) => c.kind === 'nope');
  if (!card) return;
  discard(s, by, [card]);
  p.nopes.push(by);
  const name = ctx.playerName(by);
  say(ctx, s, p.nopes.length % 2 ? `لا! من ${name}: إلغاء «${nameOf(p.card)}»` : `لا! على لا! من ${name}: عودة «${nameOf(p.card)}»`, by);
  ctx.fx('buzz', p.by);
  openWindow(ctx, s);
}

/** The window closed: the action happens (or not, with an odd number of «لا!»). */
function resolve(ctx: GameCtx, s: State): void {
  const p = s.pending!;
  if (!isIn(s, p.by)) {
    s.pending = null;
    return;
  }
  if (p.nopes.length % 2 === 1) {
    say(ctx, s, `إلغاء «${nameOf(p.card)}» · ${ctx.playerName(p.by)}`, p.by);
    return resumeTurn(ctx, s);
  }
  const name = ctx.playerName(p.by);
  switch (p.kind) {
    case 'skip':
      s.pending = null;
      return endOneTurn(ctx, s);
    case 'attack': {
      s.pending = null;
      const turns = (s.chain ? s.turns : 0) + 2;
      const nx = nextAfter(s, p.by);
      if (nx) say(ctx, s, `${turnsText(turns)} على ${ctx.playerName(nx)}`, nx);
      return passTurn(ctx, s, turns, true);
    }
    case 'peek':
      s.known[p.by] = s.deck.slice(0, 3).map((c) => c.kind);
      ctx.fx('card', p.by);
      return resumeTurn(ctx, s);
    case 'shuffle':
      shuffleDeck(s);
      return resumeTurn(ctx, s);
    case 'favor': {
      if (!isIn(s, p.target) || !s.seats[p.target].hand.length) return resumeTurn(ctx, s);
      s.phase = 'give';
      s.give = { from: p.target, to: p.by, endsAt: ctx.now + BOMB_GIVE_MS };
      bump(s);
      return;
    }
    case 'pair': {
      if (!isIn(s, p.target) || !s.seats[p.target].hand.length) return resumeTurn(ctx, s);
      const from = s.seats[p.target];
      const [card] = from.hand.splice(Math.floor(s.rnd() * from.hand.length), 1);
      s.seats[p.by].hand.push(card);
      note(s, p.by, `ورقة مسروقة من ${ctx.playerName(p.target)}: ${nameOf(card.kind)}`, card.kind);
      note(s, p.target, `سرقة ورقة منك إلى ${name}: ${nameOf(card.kind)}`, card.kind);
      say(ctx, s, `ورقة من ${ctx.playerName(p.target)} إلى ${name}`, p.by);
      ctx.fx('card', p.target);
      return resumeTurn(ctx, s);
    }
  }
}

function giveCard(ctx: GameCtx, s: State, cardId: string | null): void {
  const g = s.give!;
  const from = s.seats[g.from];
  let at = cardId ? from.hand.findIndex((c) => c.id === cardId) : -1;
  if (at < 0) at = Math.floor(s.rnd() * from.hand.length);
  const [card] = from.hand.splice(at, 1);
  if (card && isIn(s, g.to)) {
    s.seats[g.to].hand.push(card);
    note(s, g.to, `ورقة من ${ctx.playerName(g.from)}: ${nameOf(card.kind)}`, card.kind);
    note(s, g.from, `ورقتك إلى ${ctx.playerName(g.to)}: ${nameOf(card.kind)}`, card.kind);
    say(ctx, s, `ورقة من ${ctx.playerName(g.from)} إلى ${ctx.playerName(g.to)}`, g.from);
    ctx.fx('card', g.to);
  } else if (card) from.hand.push(card);
  s.give = null;
  if (isIn(s, s.turn)) resumeTurn(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Drawing and the bomb                                                */
/* ------------------------------------------------------------------ */

function drawCard(ctx: GameCtx, s: State, by: string, auto = false): void {
  s.pending = null;
  s.turnLeft = null;
  const card = drawTop(s);
  const name = ctx.playerName(by);
  if (!card) {
    // never happens while bombs are left (there are always more bombs than players minus one)
    say(ctx, s, `الرزمة فارغة · ${name}`, by);
    return endOneTurn(ctx, s);
  }
  if (card.kind === 'bomb') {
    s.phase = 'boom';
    s.turnEndsAt = null;
    s.boom = { who: by, card, endsAt: ctx.now + paced(ctx, BOMB_BOOM_MS) };
    bump(s);
    ctx.fx('boom', by);
    say(ctx, s, `قنبلة عند ${name}!`, by);
    return;
  }
  s.seats[by].hand.push(card);
  note(s, by, `${auto ? 'انتهى الوقت، ' : ''}من الرزمة: ${nameOf(card.kind)}`, card.kind);
  say(ctx, s, auto ? `انتهاء الوقت: سحب تلقائي · ${name}` : `سحب ورقة · ${name}`, by);
  ctx.fx('card', by);
  endOneTurn(ctx, s);
}

/** The bomb's moment is over: the defuse saves the player, or they are out. */
function afterBoom(ctx: GameCtx, s: State): void {
  const b = s.boom!;
  s.boom = null;
  const seat = s.seats[b.who];
  const name = ctx.playerName(b.who);
  if (!isIn(s, b.who)) {
    // they left meanwhile: the bomb goes back at a random place
    insertBomb(s, b.who, b.card, Math.floor(s.rnd() * (s.deck.length + 1)));
    return passTurn(ctx, s, 1, false);
  }
  const d = seat.hand.findIndex((c) => c.kind === 'defuse');
  if (d >= 0) {
    const [defuse] = seat.hand.splice(d, 1);
    s.discard.push(defuse);
    s.phase = 'place';
    s.place = { who: b.who, card: b.card, endsAt: ctx.now + BOMB_PLACE_MS };
    bump(s);
    ctx.fx('correct', b.who);
    say(ctx, s, `المفكّك من ${name}: نجاة!`, b.who);
    return;
  }
  seat.out = true;
  s.discard.push(...seat.hand, b.card);
  seat.hand = [];
  s.outOrder.push(b.who);
  ctx.fx('death', b.who);
  say(ctx, s, `خروج ${name}`, b.who);
  if (checkWin(ctx, s)) return;
  passTurn(ctx, s, 1, false);
}

function placeBomb(ctx: GameCtx, s: State, choice: BombPlace): void {
  const pl = s.place!;
  const at = placeIndex(choice, s.deck.length, s.rnd);
  insertBomb(s, pl.who, pl.card, at);
  s.place = null;
  note(s, pl.who, at === 0 ? 'القنبلة الآن في أعلى الرزمة (سرّاً)' : at >= s.deck.length - 1 ? 'القنبلة الآن في أسفل الرزمة (سرّاً)' : `القنبلة الآن في الموضع ${at + 1} من الأعلى (سرّاً)`, 'bomb');
  say(ctx, s, `القنبلة في الرزمة من جديد، في موضع سرّي · ${ctx.playerName(pl.who)}`, pl.who);
  endOneTurn(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** A bot's time, by what it does: [fastest, slowest] in ms. */
export const BOMB_BOT_MS: Record<'first' | 'next' | 'draw' | 'nope' | 'give' | 'place', [number, number]> = {
  first: [1400, 2800],
  next: [1000, 2000],
  draw: [900, 1700],
  nope: [700, 1900],
  give: [1500, 3200],
  place: [1600, 3200],
};

const delay = (s: State, kind: keyof typeof BOMB_BOT_MS) => {
  const [lo, hi] = BOMB_BOT_MS[kind];
  return Math.round(lo + s.rnd() * (hi - lo));
};

/** What a bot may know: its hand, the public counts, and its own knowledge of the deck's top. */
export function botInfo(s: State, me: string): BombBotInfo {
  const a = alive(s);
  return {
    me,
    hand: s.seats[me].hand.map((c) => ({ ...c })),
    alive: a,
    counts: Object.fromEntries(s.order.map((p) => [p, isIn(s, p) ? s.seats[p].hand.length : 0])),
    next: nextAfter(s, me),
    deck: s.deck.length,
    bombs: s.deck.filter((c) => c.kind === 'bomb').length,
    known: [...(s.known[me] ?? [])],
    turns: s.turn === me ? s.turns : 1,
    plays: s.turn === me ? s.plays : 0,
  };
}

function publicPending(p: Pend): BombPending {
  return { kind: p.kind, card: p.card, by: p.by, target: p.target, nopes: [...p.nopes], endsAt: p.endsAt, total: p.total };
}

function planBots(ctx: GameCtx, s: State, bots: string[]): void {
  const level = botLevel(ctx);
  const mine = (id: string | null | undefined): id is string => !!id && bots.includes(id) && isIn(s, id);
  const seq = s.seq;
  if (s.phase === 'turn' && mine(s.turn)) {
    const move = botTurn(level, botInfo(s, s.turn), s.rnd);
    if (move.type === 'draw') ctx.bot(s.turn, `t:${seq}`, delay(s, 'draw') + (s.plays ? 0 : delay(s, 'first') - 900), { type: 'draw', seq });
    else ctx.bot(s.turn, `t:${seq}`, delay(s, s.plays ? 'next' : 'first'), { type: 'play', seq, cards: move.cards, ...(move.target ? { target: move.target } : {}) });
  } else if (s.phase === 'window' && s.pending) {
    const p = s.pending;
    for (const b of bots) {
      if (b in p.intents || !mayNope(s, b)) continue;
      const yes = botNope(level, botInfo(s, b), publicPending(p), s.rnd);
      // a «لا!» lands before the window closes (at the latest when its time runs out, see tick)
      const d = Math.min(delay(s, 'nope'), Math.max(200, p.total - 500));
      p.intents[b] = yes ? ctx.now + d : null;
      if (yes) ctx.bot(b, `n:${seq}`, d, { type: 'nope', seq });
    }
  } else if (s.phase === 'give' && s.give && mine(s.give.from)) {
    ctx.bot(s.give.from, `g:${seq}`, delay(s, 'give'), { type: 'give', seq, card: botGive(level, s.seats[s.give.from].hand, s.rnd) });
  } else if (s.phase === 'place' && s.place && mine(s.place.who)) {
    const choice = botPlace(level, s.deck.length, Math.max(0, s.turns - 1), alive(s).length, s.rnd);
    ctx.bot(s.place.who, `p:${seq}`, delay(s, 'place'), { type: 'place', seq, at: choice });
  }
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startBomb(ctx: GameCtx, participants: string[], raw: BombSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeBomb(raw);
  const order = [...participants];
  shuffleIn(order, rnd);
  const n = Math.max(2, order.length);
  const total = deckCounts(n);
  // every card gets an id that says nothing about its kind
  const all: BombKind[] = BOMB_KINDS.flatMap((k) => Array.from({ length: total[k] }, () => k));
  shuffleIn(all, rnd);
  const cards: BombCard[] = all.map((kind, i) => ({ id: `b${i}`, kind }));
  const bombs = cards.filter((c) => c.kind === 'bomb');
  const defuses = cards.filter((c) => c.kind === 'defuse');
  const rest = cards.filter((c) => c.kind !== 'bomb' && c.kind !== 'defuse');
  const seats: Record<string, Seat> = {};
  for (const id of order) seats[id] = { id, hand: [defuses.shift()!, ...rest.splice(0, BOMB_HAND)], out: false };
  const deck = [...rest, ...defuses, ...bombs];
  shuffleIn(deck, rnd);
  const s: State = {
    settings,
    order,
    seats,
    left: [],
    deck,
    discard: [],
    total,
    phase: 'turn',
    seq: 0,
    turn: null,
    turns: 1,
    chain: false,
    turnEndsAt: null,
    turnLeft: null,
    plays: 0,
    pending: null,
    give: null,
    boom: null,
    place: null,
    known: Object.fromEntries(order.map((id) => [id, []])),
    notes: {},
    noteK: 0,
    log: [],
    outOrder: [],
    winner: null,
    rnd,
  };
  ctx.fx('start');
  if (order.length) {
    startTurn(ctx, s, order[0], 1, false);
    say(ctx, s, `القنابل في الرزمة: البداية مع ${ctx.playerName(order[0])}`, order[0]);
  }
  return s;
}

function parsePlace(v: unknown): BombPlace | null {
  if (v === 'top' || v === 'second' || v === 'third' || v === 'bottom' || v === 'random') return v;
  return isNum(v) ? v : null;
}

export const bomb: GameModule<State, BombSettings> = {
  id: 'bomb',

  start(ctx, participants, raw) {
    return startBomb(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.seats[by] || s.phase === 'final' || !isIn(s, by)) return;
    // every answer names the step it saw: a late tap never answers a newer question
    if (!isNum(a.seq) || a.seq !== s.seq) return;
    switch (a.type) {
      case 'play': {
        if (s.phase !== 'turn' || s.turn !== by) throw new GameError('ليس دورك');
        const ids = Array.isArray(a.cards) ? a.cards.filter(isStr) : isStr(a.card) ? [a.card] : [];
        return playCards(ctx, s, by, ids, isStr(a.target) ? a.target : null);
      }
      case 'draw': {
        if (s.phase !== 'turn' || s.turn !== by) throw new GameError('ليس دورك');
        return drawCard(ctx, s, by);
      }
      case 'nope': {
        if (!mayNope(s, by)) return;
        return nope(ctx, s, by, isStr(a.card) ? a.card : null);
      }
      case 'give': {
        if (s.phase !== 'give' || s.give?.from !== by) return;
        if (!isStr(a.card) || !s.seats[by].hand.some((c) => c.id === a.card)) throw new GameError('اختر ورقة من يدك');
        return giveCard(ctx, s, a.card);
      }
      case 'place': {
        if (s.phase !== 'place' || s.place?.who !== by) return;
        const choice = parsePlace(a.at);
        if (choice === null) throw new GameError('اختر موضع القنبلة');
        return placeBomb(ctx, s, choice);
      }
    }
  },

  tick(ctx, s) {
    switch (s.phase) {
      case 'turn':
        if (s.turnEndsAt !== null && ctx.now >= s.turnEndsAt && s.turn) {
          drawCard(ctx, s, s.turn, true);
          return true;
        }
        return false;
      case 'window': {
        const p = s.pending;
        if (!p || ctx.now < p.endsAt) return false;
        // a bot that meant to answer does so now (its job may still be on its way)
        for (const [b, at] of Object.entries(p.intents)) {
          if (at !== null && mayNope(s, b)) {
            nope(ctx, s, b, null);
            return true;
          }
        }
        resolve(ctx, s);
        return true;
      }
      case 'give':
        if (s.give && ctx.now >= s.give.endsAt) {
          giveCard(ctx, s, null);
          return true;
        }
        return false;
      case 'boom':
        if (s.boom && ctx.now >= s.boom.endsAt) {
          afterBoom(ctx, s);
          return true;
        }
        return false;
      case 'place':
        if (s.place && ctx.now >= s.place.endsAt) {
          placeBomb(ctx, s, 'random');
          return true;
        }
        return false;
    }
    return false;
  },

  turnOf(s) {
    // the «لا!» window waits for nobody in particular (naming the holders would tell who has «لا!»)
    if (s.phase === 'turn' && s.turn) return [s.turn];
    if (s.phase === 'give' && s.give) return [s.give.from];
    if (s.phase === 'place' && s.place) return [s.place.who];
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'final') return;
    planBots(ctx, s, bots);
  },

  view(ctx, s, me): BombView {
    const players = s.order.filter((id) => !s.left.includes(id));
    const p = s.pending;
    const gone = {} as Record<BombKind, number>;
    for (const k of BOMB_KINDS) gone[k] = 0;
    for (const c of s.discard) gone[c.kind] += 1;
    const inGame = isIn(s, me);
    const known = inGame ? [...(s.known[me] ?? [])] : [];
    while (known.length && known[known.length - 1] === null) known.pop();
    return {
      game: 'bomb',
      phase: s.phase,
      seq: s.seq,
      players,
      seats: Object.fromEntries(players.map((id) => [id, { id, cards: s.seats[id].hand.length, out: s.seats[id].out }])),
      turn: s.turn,
      turns: s.turns,
      turnEndsAt: s.phase === 'turn' ? s.turnEndsAt : null,
      turnTotal: s.settings.turnSec * 1000,
      hand: s.seats[me] && !s.left.includes(me) ? s.seats[me].hand.map((c) => ({ ...c })) : [],
      deck: s.deck.length,
      bombs: s.deck.filter((c) => c.kind === 'bomb').length,
      discard: s.discard.slice(-DISCARD_SHOWN).map((c) => ({ ...c })),
      discardCount: s.discard.length,
      total: { ...s.total },
      gone,
      nopeLive: nopeLive(s),
      pending: p && s.phase === 'window' ? publicPending(p) : null,
      give: s.give && s.phase === 'give' ? { from: s.give.from, to: s.give.to, endsAt: s.give.endsAt, total: BOMB_GIVE_MS } : null,
      boom: s.boom && s.phase === 'boom' ? { who: s.boom.who, card: { ...s.boom.card }, endsAt: s.boom.endsAt } : null,
      place: s.place && s.phase === 'place' ? { who: s.place.who, endsAt: s.place.endsAt, total: BOMB_PLACE_MS } : null,
      known,
      note: s.notes[me] ? { ...s.notes[me] } : null,
      log: s.log.map((l) => ({ ...l })),
      outOrder: s.outOrder.filter((id) => !s.left.includes(id)),
      winner: s.winner,
      windowSec: s.settings.windowSec,
    };
  },

  onLeave(ctx, s, id) {
    const seat = s.seats[id];
    if (!seat || s.left.includes(id)) return;
    const wasIn = isIn(s, id);
    s.left.push(id);
    if (s.phase === 'final' || !wasIn) return;
    // the hand goes to the discard pile (face up: any «لا!» in it is public now)
    s.discard.push(...seat.hand);
    seat.hand = [];
    seat.out = true;
    delete s.known[id];
    say(ctx, s, `مغادرة ${ctx.playerName(id)}`);
    if (checkWin(ctx, s)) return;
    switch (s.phase) {
      case 'turn':
        if (s.turn === id) passTurn(ctx, s, 1, false);
        return;
      case 'window': {
        const p = s.pending!;
        if (p.by === id) {
          // the action goes with its player
          s.pending = null;
          return passTurn(ctx, s, 1, false);
        }
        if (p.target === id && p.kind !== 'attack') {
          s.pending = null;
          return resumeTurn(ctx, s);
        }
        // no «لا!» left anywhere: the window has nothing to wait for
        if (!nopeLive(s)) resolve(ctx, s);
        return;
      }
      case 'give':
        if (s.give?.from === id) {
          s.give = null;
          return resumeTurn(ctx, s);
        }
        if (s.give?.to === id) {
          s.give = null;
          return passTurn(ctx, s, 1, false);
        }
        return;
      case 'boom':
        // afterBoom puts the bomb back for them
        return;
      case 'place':
        if (s.place?.who === id) {
          insertBomb(s, id, s.place.card, Math.floor(s.rnd() * (s.deck.length + 1)));
          s.place = null;
          passTurn(ctx, s, 1, false);
        }
        return;
    }
  },

  patchSettings(settings, patch) {
    if (isNum(patch.windowSec)) settings.windowSec = snap(patch.windowSec, BOMB_WINDOW_SECONDS, settings.windowSec);
    if (isNum(patch.turnSec)) settings.turnSec = snap(patch.turnSec, BOMB_TURN_SECONDS, settings.turnSec);
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    const rest = [...s.outOrder].reverse().filter((id) => !s.left.includes(id) && id !== s.winner);
    return { places: [[s.winner], ...rest.map((id) => [id])] };
  },
};

export type { State as BombState };
