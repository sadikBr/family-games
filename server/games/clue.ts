/**
 * «من الفاعل؟» — a funny family mystery in the spirit of Cluedo (see src/shared/games/clue.ts).
 *
 * The secret file holds one character, one item and one room; the other 18 cards are dealt round
 * the table (some players may hold one card more: hand sizes are public). A turn:
 *   1. «turn»: the player goes to any room but the one they are in and suggests a character + an item
 *      + that room (or makes the final accusation straight away);
 *   2. the players after them, in seat order, are asked: a player holding none of the three passes;
 *      the first one holding any shows ONE to the suggester only — automatically when only one card
 *      matches, otherwise «show»: that player's phone asks which (CLUE_SHOW_SECS, then the card that
 *      reveals least is picked for them). Everyone sees that a card was shown, never which;
 *   3. «after»: the suggester may make the final accusation, or ends the turn.
 * A right final accusation wins; a wrong one puts the player out of the guessing (they no longer
 * play turns but still show cards). Everybody out: the mystery stays unsolved.
 *
 * Views hide everything a seat must not know: the file and the other hands (until the end), and the
 * card shown in a suggestion (only its suggester and the one who showed it see it). Bots decide from
 * their own seat's view (server/ai/clue-bot.ts).
 */
import {
  CLUE_CARDS,
  CLUE_MYSTERIES,
  CLUE_SHOW_SECS,
  CLUE_WHAT,
  CLUE_WHERE,
  CLUE_WHO,
  clueSentence,
  clueTriple,
  type ClueAccusationEntry,
  type ClueEntry,
  type ClueSettings,
  type ClueSuggestionEntry,
  type ClueTriple,
  type ClueView,
} from '../../src/shared/games/clue';
import { li } from '../../src/shared/li';
import { decideOnce } from '../ai/cards-memo';
import { clueAfter, clueShow, clueTurn } from '../ai/clue-bot';
import { randDelay } from '../cardkit';
import { GameError, botLevel, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';
import { CLUE_MYSTERY_VOICE, CLUE_VOICE, voiceSolvedBy } from '../voice-calls-clue';

/** A bot's turn, its choice of a card to show, its decision after a suggestion (ms, before the room's pace). */
export const BOT_TURN_MS: [number, number] = [2600, 4600];
export const BOT_SHOW_MS: [number, number] = [1400, 2600];
export const BOT_AFTER_MS: [number, number] = [1800, 3000];

interface Suggestion extends ClueSuggestionEntry {
  /** still to be asked, in order */
  queue: string[];
}

type Entry = Suggestion | ClueAccusationEntry;

interface State {
  settings: ClueSettings;
  gameKey: string;
  mystery: number;
  order: string[];
  names: Record<string, string>;
  hands: Record<string, string[]>;
  envelope: ClueTriple;
  turnIdx: number;
  phase: ClueView['phase'];
  rooms: Record<string, string | null>;
  /** out of the guessing, in the order they went out */
  out: string[];
  log: Entry[];
  /** this turn's suggestion */
  cur: Suggestion | null;
  /** a player choosing which card to show */
  pending: { id: string; to: string; options: string[]; endsAt: number; total: number } | null;
  winner: string | null;
  /** counts every step (keys the bots' decisions) */
  moves: number;
  revealed: { card: string; by: string }[];
}

const CARD_ORDER: Record<string, number> = Object.fromEntries(CLUE_CARDS.map((c, i) => [c.id, i]));
const byCardOrder = (a: string, b: string) => CARD_ORDER[a] - CARD_ORDER[b];

function clean(settings: Partial<ClueSettings> | undefined): ClueSettings {
  const secs = settings?.showSecs;
  return {
    helper: typeof settings?.helper === 'boolean' ? settings.helper : true,
    showSecs: CLUE_SHOW_SECS.includes(secs as 30) ? (secs as number) : 30,
  };
}

/** The file (one card of each category) and the hands: the rest dealt round the table from the first seat. */
export function deal(order: string[], rnd: () => number = Math.random): { envelope: ClueTriple; hands: Record<string, string[]> } {
  const one = (xs: string[]) => xs[Math.floor(rnd() * xs.length) % xs.length];
  const envelope = { who: one(CLUE_WHO), what: one(CLUE_WHAT), where: one(CLUE_WHERE) };
  const inFile = new Set(clueTriple(envelope));
  const rest = shuffle(CLUE_CARDS.map((c) => c.id).filter((id) => !inFile.has(id)));
  const hands: Record<string, string[]> = Object.fromEntries(order.map((p) => [p, []]));
  rest.forEach((c, i) => hands[order[i % order.length]].push(c));
  for (const p of order) hands[p].sort(byCardOrder);
  return { envelope, hands };
}

const name = (ctx: GameCtx, s: State, id: string) => (s.order.includes(id) ? ctx.playerName(id) : (s.names[id] ?? '؟'));
const cur = (s: State) => s.order[s.turnIdx] ?? null;
const guessing = (s: State) => s.order.filter((p) => !s.out.includes(p));

function finish(ctx: GameCtx, s: State, winner: string | null) {
  s.phase = 'final';
  s.winner = winner;
  s.pending = null;
  if (winner) ctx.fx('win', winner);
  else {
    ctx.say?.(`لم يحلّ أحد اللغز: ${clueSentence(s.envelope)}`, undefined, CLUE_VOICE.unsolved);
    ctx.fx('reveal');
  }
}

/** The next player still guessing gets the turn (everybody out: the mystery stays unsolved). */
function nextTurn(ctx: GameCtx, s: State, from = s.turnIdx) {
  s.cur = null;
  s.pending = null;
  s.moves += 1;
  const n = s.order.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k + n) % n;
    if (!s.out.includes(s.order[i])) {
      s.turnIdx = i;
      s.phase = 'turn';
      return;
    }
  }
  finish(ctx, s, null);
}

function showCard(ctx: GameCtx, s: State, rec: Suggestion, by: string, card: string) {
  rec.shownBy = by;
  rec.card = card;
  rec.pending = null;
  rec.done = true;
  rec.queue = [];
  s.pending = null;
  s.phase = 'after';
  s.moves += 1;
  ctx.say?.(`ورقة من ${name(ctx, s, by)} إلى ${name(ctx, s, rec.by)} — لا يراها غيرهما`, by);
  ctx.fx('card', rec.by);
}

/** Ask the players after the suggester, in order, until one can show a card. */
function disprove(ctx: GameCtx, s: State) {
  const rec = s.cur;
  if (!rec) return;
  const triple = clueTriple(rec);
  while (rec.queue.length) {
    const p = rec.queue[0];
    if (!s.order.includes(p)) {
      rec.queue.shift();
      continue;
    }
    const options = (s.hands[p] ?? []).filter((c) => triple.includes(c)).sort(byCardOrder);
    if (!options.length) {
      rec.passed.push(p);
      rec.queue.shift();
      continue;
    }
    if (options.length === 1) {
      showCard(ctx, s, rec, p, options[0]);
      return;
    }
    const total = s.settings.showSecs * 1000;
    rec.pending = p;
    s.pending = { id: p, to: rec.by, options, endsAt: ctx.now + total, total };
    s.phase = 'show';
    return;
  }
  // nobody could disprove it
  rec.done = true;
  rec.pending = null;
  s.pending = null;
  s.phase = 'after';
  s.moves += 1;
  ctx.say?.('لم يستطع أحد النفي!', rec.by, CLUE_VOICE.nobody);
  ctx.fx('reveal');
}

function readTriple(a: Record<string, unknown>): ClueTriple {
  const ok = isStr(a.who) && CLUE_WHO.includes(a.who) && isStr(a.what) && CLUE_WHAT.includes(a.what) && isStr(a.where) && CLUE_WHERE.includes(a.where);
  if (!ok) throw new GameError('اختر شخصية وأداة ومكاناً');
  return { who: a.who as string, what: a.what as string, where: a.where as string };
}

export function startClue(ctx: GameCtx, participants: string[], settings: Partial<ClueSettings> | undefined, rnd: () => number = Math.random): State {
  const order = shuffle(participants);
  const { envelope, hands } = deal(order, rnd);
  const mystery = Math.floor(rnd() * CLUE_MYSTERIES.length) % CLUE_MYSTERIES.length;
  const s: State = {
    settings: clean(settings),
    gameKey: Math.floor(rnd() * 2 ** 40).toString(36) + Date.now().toString(36).slice(-4),
    mystery,
    order,
    names: Object.fromEntries(participants.map((id) => [id, ctx.playerName(id)])),
    hands,
    envelope,
    turnIdx: 0,
    phase: 'turn',
    rooms: Object.fromEntries(order.map((p) => [p, null])),
    out: [],
    log: [],
    cur: null,
    pending: null,
    winner: null,
    moves: 0,
    revealed: [],
  };
  ctx.say?.(CLUE_MYSTERIES[mystery].title, undefined, CLUE_MYSTERY_VOICE[mystery]);
  ctx.fx('start');
  return s;
}

/** A history entry as `me` sees it: the shown card only for the suggester and the one who showed it. */
function entryView(e: Entry, me: string): ClueEntry {
  if (e.kind !== 'suggest') return { ...e };
  const card = me === e.by || me === e.shownBy ? e.card : null;
  return { kind: 'suggest', n: e.n, by: e.by, who: e.who, what: e.what, where: e.where, passed: [...e.passed], shownBy: e.shownBy, card, pending: e.pending, done: e.done };
}

export function clueView(s: State, me: string): ClueView {
  return {
    game: 'clue',
    phase: s.phase,
    gameKey: s.gameKey,
    mystery: s.mystery,
    order: [...s.order],
    names: { ...s.names },
    turn: s.phase === 'final' ? null : cur(s),
    rooms: { ...s.rooms },
    handCounts: Object.fromEntries(s.order.map((p) => [p, s.hands[p]?.length ?? 0])),
    out: [...s.out],
    myHand: [...(s.hands[me] ?? [])],
    current: s.cur ? (entryView(s.cur, me) as ClueSuggestionEntry) : null,
    choose: s.pending && s.pending.id === me ? { to: s.pending.to, options: [...s.pending.options] } : null,
    endsAt: s.pending?.endsAt ?? null,
    timerTotal: s.pending?.total ?? s.settings.showSecs * 1000,
    log: s.log.map((e) => entryView(e, me)),
    helper: s.settings.helper,
    revealed: s.revealed.map((r) => ({ ...r })),
    winner: s.winner,
    envelope: s.phase === 'final' ? { ...s.envelope } : null,
    hands: s.phase === 'final' ? Object.fromEntries(Object.entries(s.hands).map(([p, h]) => [p, [...h]])) : null,
  };
}

export const clue: GameModule<State, ClueSettings> = {
  id: 'clue',

  start(ctx, participants, settings) {
    return startClue(ctx, participants, settings);
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final' || !s.order.includes(by)) return;

    if (a.type === 'show') {
      const p = s.pending;
      if (s.phase !== 'show' || !p || p.id !== by) throw new GameError('لا يُطلب منك عرض ورقة الآن');
      if (!isStr(a.card) || !p.options.includes(a.card)) throw new GameError('اختر ورقة من الأوراق المطلوبة');
      showCard(ctx, s, s.cur!, by, a.card);
      return;
    }

    if (cur(s) !== by) throw new GameError('ليس دورك');

    if (a.type === 'suggest') {
      if (s.phase !== 'turn') throw new GameError('اتهام مؤقت واحد في كل دور');
      const t = readTriple(a);
      if (s.rooms[by] === t.where) throw new GameError('انتقل إلى غرفة أخرى: لا اتهام في الغرفة نفسها مرتين متتاليتين');
      s.rooms[by] = t.where;
      const i = s.order.indexOf(by);
      const queue = [...s.order.slice(i + 1), ...s.order.slice(0, i)];
      const rec: Suggestion = { kind: 'suggest', n: s.log.length + 1, by, ...t, passed: [], shownBy: null, card: null, pending: null, done: false, queue };
      s.log.push(rec);
      s.cur = rec;
      s.moves += 1;
      ctx.say?.(`اتهام مؤقت من ${name(ctx, s, by)}: ${clueSentence(t)}`, by);
      disprove(ctx, s);
      return;
    }

    if (a.type === 'accuse') {
      if (s.phase !== 'turn' && s.phase !== 'after') throw new GameError('انتظر حتى تُعرض الورقة');
      if (s.out.includes(by)) throw new GameError('لا اتهام بعد الخروج من التخمين');
      const t = readTriple(a);
      const correct = t.who === s.envelope.who && t.what === s.envelope.what && t.where === s.envelope.where;
      s.log.push({ kind: 'accuse', n: s.log.length + 1, by, ...t, correct });
      s.moves += 1;
      if (correct) {
        ctx.say?.(`اتهام نهائي صحيح! الفوز ${li(name(ctx, s, by))}: ${clueSentence(t)}`, by, voiceSolvedBy(name(ctx, s, by)));
        finish(ctx, s, by);
        return;
      }
      s.out.push(by);
      ctx.say?.(`اتهام نهائي خاطئ من ${name(ctx, s, by)} — خروج من التخمين`, by, CLUE_VOICE.wrong);
      ctx.fx('buzz', by);
      nextTurn(ctx, s);
      return;
    }

    if (a.type === 'end') {
      if (s.phase !== 'after') throw new GameError(s.phase === 'show' ? 'انتظر حتى تُعرض الورقة' : 'قدّم اتهاماً مؤقتاً أولاً');
      nextTurn(ctx, s);
    }
  },

  tick(ctx, s) {
    const p = s.pending;
    if (s.phase !== 'show' || !p || !s.cur || ctx.now < p.endsAt) return false;
    // time is up: the card that reveals least is shown for them
    showCard(ctx, s, s.cur, p.id, clueShow(clueView(s, p.id), p.id, p.to, p.options, 'smart'));
    return true;
  },

  turnOf(s) {
    if (s.phase === 'final') return [];
    if (s.phase === 'show') return s.pending ? [s.pending.id] : [];
    const c = cur(s);
    return c ? [c] : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'final') return;
    const level = botLevel(ctx);
    const p = s.pending;
    if (s.phase === 'show' && p && bots.includes(p.id)) {
      const key = `show:${s.cur?.n ?? 0}`;
      const card = decideOnce(s, `${p.id}:${key}`, () => clueShow(clueView(s, p.id), p.id, p.to, p.options, level));
      ctx.bot(p.id, key, randDelay(...BOT_SHOW_MS), { type: 'show', card });
      return;
    }
    const me = cur(s);
    if (!me || !bots.includes(me)) return;
    if (s.phase === 'turn') {
      const key = `t:${s.moves}`;
      const move = decideOnce(s, `${me}:${key}`, () => clueTurn(clueView(s, me), me, level));
      ctx.bot(me, key, randDelay(...BOT_TURN_MS), move);
    } else if (s.phase === 'after') {
      const key = `a:${s.moves}`;
      const move = decideOnce(s, `${me}:${key}`, () => clueAfter(clueView(s, me), me, level));
      ctx.bot(me, key, randDelay(...BOT_AFTER_MS), move);
    }
  },

  view(_ctx, s, me) {
    return clueView(s, me);
  },

  /** A player left for good (the room normally seats a bot instead): their cards are shown to everyone. */
  onLeave(ctx, s, id) {
    const i = s.order.indexOf(id);
    if (i < 0 || s.phase === 'final') return;
    const wasTurn = s.turnIdx === i;
    for (const card of s.hands[id] ?? []) s.revealed.push({ card, by: id });
    s.order.splice(i, 1);
    delete s.rooms[id];
    s.out = s.out.filter((p) => p !== id);
    if (i < s.turnIdx) s.turnIdx -= 1;
    if (!s.order.length) {
      s.phase = 'final';
      s.pending = null;
      return;
    }
    if (wasTurn) {
      // their suggestion (if any) is dropped; the next player plays
      if (s.cur) {
        s.cur.done = true;
        s.cur.pending = null;
        s.cur.queue = [];
      }
      nextTurn(ctx, s, s.turnIdx - 1);
      return;
    }
    s.turnIdx %= s.order.length;
    if (s.phase === 'show' && s.pending?.id === id && s.cur) {
      s.pending = null;
      s.cur.pending = null;
      disprove(ctx, s);
    }
    if (!guessing(s).length) finish(ctx, s, null);
  },

  /** The winner; then those still guessing; then the players out of the guessing (the last out first). */
  result(s) {
    if (s.phase !== 'final' || !s.order.length) return null;
    const places: string[][] = [];
    if (s.winner && s.order.includes(s.winner)) places.push([s.winner]);
    const still = s.order.filter((p) => p !== s.winner && !s.out.includes(p));
    if (still.length) places.push(still);
    for (const p of [...s.out].reverse()) if (s.order.includes(p)) places.push([p]);
    return places.length ? { places } : null;
  },

  patchSettings(settings, patch) {
    if (typeof patch.helper === 'boolean') settings.helper = patch.helper;
    if (isNum(patch.showSecs) && CLUE_SHOW_SECS.includes(patch.showSecs as 30)) settings.showSecs = patch.showSecs;
  },
};

export type { State as ClueState };
