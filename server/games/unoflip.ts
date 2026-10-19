/**
 * UNO FLIP — match the colour, number or symbol of the top card.
 * A Flip card turns everything over: the discard pile, the draw pile and every hand.
 * You see your cards' active side; the other players see the other side.
 * Say UNO with one card left, or anyone can catch you (+2).
 * The round winner scores the cards left in the other hands; first to the target wins.
 */
import type { BotLevel, FeedItem, UnoSettings, UnoView } from '../../src/shared/protocol';
import {
  canPlayFace,
  colorsOf,
  faceName,
  faceOf,
  isWild,
  makeUnoDeck,
  otherSide,
  unoPoints,
  UNO_COLOR_INFO,
  type UnoCard,
  type UnoColor,
  type UnoFace,
  type UnoSide,
} from '../../src/shared/uno';
import { decideOnce } from '../ai/cards-memo';
import { unoColor, unoObserve, unoTurn, type UnoKnowledge, type UnoMemory } from '../ai/cards-uno';
import { Feed, randDelay } from '../cardkit';
import { botLevel, GameError, type GameCtx, type GameModule } from '../types';
import { isStr } from '../util';
import { VOICE, voiceAnd, voiceRound, voiceWin } from '../voice-calls';

const HAND = 7;
const CATCH_PENALTY = 2;

interface State {
  settings: UnoSettings;
  seats: string[];
  scores: Record<string, number>;
  phase: UnoView['phase'];
  round: number;
  dealerIdx: number;
  turnIdx: number;
  dir: 1 | -1;
  side: UnoSide;
  deck: UnoCard[];
  discard: UnoCard[];
  hands: Record<string, UnoCard[]>;
  color: UnoColor;
  /** Player who must pick a colour, and what happens once they do. */
  choosing: { by: string; then: 'next' | 'draw2' | 'drawColor' | 'none' } | null;
  drawn: { by: string; id: string } | null;
  unoSaid: Set<string>;
  catchable: string | null;
  lastPlay: UnoView['lastPlay'];
  feed: Feed;
  roundSummary: UnoView['roundSummary'];
  winner: string | null;
  moves: number;
  /** what each seat has seen of the cards (for the bots — see server/ai/cards-uno.ts) */
  unoMem?: UnoMemory;
  /** colours a player had to draw on (public), forgotten when they get more cards or the deck flips */
  voids?: Record<string, UnoColor[]>;
}

const n = (s: State) => s.seats.length;
const top = (s: State) => faceOf(s.discard[s.discard.length - 1], s.side);
const at = (s: State, offset: number) => s.seats[(((s.turnIdx + offset * s.dir) % n(s)) + n(s)) % n(s)];
const name = (ctx: GameCtx, id: string) => ctx.playerName(id);

function refill(s: State) {
  if (s.deck.length || s.discard.length < 2) return;
  const keep = s.discard.pop()!;
  s.deck = s.discard;
  for (let i = s.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s.deck[i], s.deck[j]] = [s.deck[j], s.deck[i]];
  }
  s.discard = [keep];
}

function drawOne(s: State, id: string): UnoCard | null {
  refill(s);
  const c = s.deck.shift();
  if (!c) return null;
  s.hands[id].push(c);
  s.unoSaid.delete(id);
  if (s.catchable === id) s.catchable = null;
  return c;
}

function drawN(s: State, id: string, k: number) {
  if (s.voids) delete s.voids[id];
  let got = 0;
  for (let i = 0; i < k; i++) if (drawOne(s, id)) got++;
  return got;
}

/** Move the turn `steps` seats along the current direction. */
function advance(s: State, steps = 1) {
  s.turnIdx = (((s.turnIdx + steps * s.dir) % n(s)) + n(s)) % n(s);
  s.drawn = null;
}

function startRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'play';
  s.side = 'light';
  s.dir = 1;
  s.deck = makeUnoDeck();
  s.hands = Object.fromEntries(s.seats.map((id) => [id, []]));
  s.dealerIdx = (s.dealerIdx + 1) % n(s);
  s.turnIdx = (s.dealerIdx + 1) % n(s);
  for (let k = 0; k < HAND; k++) for (const id of s.seats) s.hands[id].push(s.deck.shift()!);
  // first card: a light number card
  let i = s.deck.findIndex((c) => c.light.kind === 'num');
  if (i < 0) i = 0;
  s.discard = s.deck.splice(i, 1);
  s.color = top(s).color ?? 'red';
  s.choosing = null;
  s.drawn = null;
  s.unoSaid = new Set();
  s.catchable = null;
  s.lastPlay = null;
  s.roundSummary = null;
  s.feed.clear();
  s.feed.push(`الجولة ${s.round} — ${HAND} أوراق لكل لاعب`);
  ctx.say?.(`الجولة ${s.round} — البداية لـ${name(ctx, s.seats[s.turnIdx])}`);
  ctx.fx('card');
}

function endRound(ctx: GameCtx, s: State, winner: string) {
  const hands = s.seats
    .filter((id) => id !== winner)
    .map((id) => {
      const faces = s.hands[id].map((c) => faceOf(c, s.side));
      return { id, faces, points: faces.reduce((t, f) => t + unoPoints(f), 0) };
    });
  const points = hands.reduce((t, h) => t + h.points, 0);
  s.scores[winner] = (s.scores[winner] ?? 0) + points;
  s.roundSummary = { winner, points, hands };
  s.feed.push(`${name(ctx, winner)} أنهى أوراقه: +${points}`, { by: winner, points });
  const over = s.scores[winner] >= s.settings.target;
  ctx.say?.(`الجولة لـ${name(ctx, winner)}: +${points}`, winner, over ? voiceWin(name(ctx, winner)) : voiceRound(name(ctx, winner)));
  if (over) {
    s.phase = 'final';
    s.winner = winner;
    ctx.fx('win', winner);
  } else {
    s.phase = 'roundEnd';
    ctx.fx('reveal', winner);
  }
}

/** Apply the effect of a played face and move the turn on; returns what happened, for the announcement. */
function applyEffect(ctx: GameCtx, s: State, by: string, f: UnoFace): string {
  const next = () => at(s, 1);
  let said = '';
  switch (f.kind) {
    case 'num':
      advance(s);
      break;
    case 'draw1':
    case 'draw5': {
      const victim = next();
      const k = f.kind === 'draw1' ? 1 : 5;
      drawN(s, victim, k);
      s.feed.push(`${name(ctx, victim)} يسحب ${k} ويُمنع`, { by: victim });
      said = ` — ${k} للسحب على ${name(ctx, victim)}`;
      ctx.fx('buzz', victim);
      advance(s, 2);
      break;
    }
    case 'skip': {
      s.feed.push(`${name(ctx, next())} ممنوع من الدور`, { by: next() });
      said = ` — منعٌ لـ${name(ctx, next())}`;
      advance(s, 2);
      break;
    }
    case 'skipAll':
      s.feed.push(`${name(ctx, by)} يمنع الجميع ويلعب مرة أخرى`, { by });
      said = ' ودورٌ آخر';
      s.drawn = null;
      break;
    case 'reverse':
      s.dir = s.dir === 1 ? -1 : 1;
      said = ' — انعكس الاتجاه';
      if (n(s) === 2) advance(s, 2);
      else advance(s);
      break;
    case 'flip': {
      s.side = otherSide(s.side);
      s.voids = {};
      s.deck.reverse();
      const t = top(s);
      s.feed.push(`قلب! الجهة ${s.side === 'dark' ? 'المظلمة' : 'المضيئة'} — فوق: ${faceName(t)}`, { by });
      said = ` — الجهة ${s.side === 'dark' ? 'المظلمة' : 'المضيئة'}`;
      ctx.fx('reveal');
      if (isWild(t)) {
        s.choosing = { by, then: 'next' };
        return said;
      }
      s.color = t.color!;
      advance(s);
      break;
    }
    case 'wild':
      s.choosing = { by, then: 'next' };
      break;
    case 'wild2':
      s.choosing = { by, then: 'draw2' };
      break;
    case 'wildColor':
      s.choosing = { by, then: 'drawColor' };
      break;
  }
  return said;
}

function afterColor(ctx: GameCtx, s: State): string {
  const c = s.choosing!;
  s.choosing = null;
  const victim = at(s, 1);
  let said = '';
  if (c.then === 'draw2') {
    drawN(s, victim, 2);
    s.feed.push(`${name(ctx, victim)} يسحب 2 ويُمنع`, { by: victim });
    said = ` — 2 للسحب على ${name(ctx, victim)}`;
    ctx.fx('buzz', victim);
    advance(s, 2);
  } else if (c.then === 'drawColor') {
    let k = 0;
    for (let guard = 0; guard < 60; guard++) {
      const got = drawOne(s, victim);
      if (!got) break;
      k++;
      if (faceOf(got, s.side).color === s.color) break;
    }
    s.feed.push(`${name(ctx, victim)} سحب ${k} حتى وجد ${UNO_COLOR_INFO[s.color].name}`, { by: victim });
    said = ` — ${k} مسحوبة على ${name(ctx, victim)}`;
    ctx.fx('buzz', victim);
    advance(s, 2);
  } else {
    advance(s);
  }
  return said;
}

function playable(s: State, id: string): string[] {
  if (s.phase !== 'play' || s.choosing || s.seats[s.turnIdx] !== id) return [];
  const t = top(s);
  const hand = s.hands[id];
  const cards = s.drawn?.by === id ? hand.filter((c) => c.id === s.drawn!.id) : hand;
  return cards.filter((c) => canPlayFace(faceOf(c, s.side), t, s.color)).map((c) => c.id);
}

/** A new action by someone else closes the window to catch a forgotten UNO. */
function closeCatch(s: State, by: string) {
  if (s.catchable && s.catchable !== by) s.catchable = null;
}

/** What a bot can know from its seat. */
function knowledge(s: State, me: string): UnoKnowledge {
  return {
    me,
    seats: s.seats,
    turnIdx: s.turnIdx,
    dir: s.dir,
    side: s.side,
    top: top(s),
    color: s.color,
    hand: s.hands[me] ?? [],
    hands: Object.fromEntries(s.seats.filter((id) => id !== me).map((id) => [id, s.hands[id]])),
    memory: s.unoMem?.[me] ?? {},
    voids: s.voids ?? {},
    drawn: s.drawn?.by === me ? s.drawn.id : null,
    scores: s.scores,
    target: s.settings.target,
  };
}

/** The 'smart' / 'expert' bots (server/ai/cards-uno.ts). */
function strongBots(ctx: GameCtx, s: State, level: BotLevel) {
  unoObserve((s.unoMem ??= {}), s.seats, s.hands, s.side, s.discard[s.discard.length - 1], s.deck[0]);
  // catch a forgotten UNO at once
  if (s.catchable) {
    const catcher = s.seats.find((id) => id !== s.catchable && ctx.isBot(id));
    if (catcher && (level === 'expert' || Math.random() < 0.9)) ctx.bot(catcher, `catch:${s.moves}:${s.catchable}`, randDelay(700, 1500), { type: 'catch' });
  }
  if (s.choosing) {
    const bot = s.choosing.by;
    if (!ctx.isBot(bot)) return;
    const color = decideOnce(s, `${bot}:color:${s.moves}`, () => unoColor(knowledge(s, bot), level));
    ctx.bot(bot, `color:${s.moves}`, randDelay(700, 1400), { type: 'color', color });
    return;
  }
  const bot = s.seats[s.turnIdx];
  if (!ctx.isBot(bot)) return;
  const action = decideOnce(s, `${bot}:turn:${s.moves}`, () => unoTurn(knowledge(s, bot), level));
  if (action.type === 'play' && s.hands[bot].length === 2 && !s.unoSaid.has(bot) && (level === 'expert' || Math.random() < 0.95)) {
    ctx.bot(bot, `uno:${s.moves}`, randDelay(300, 600), { type: 'uno' });
  }
  const delay = action.type === 'play' ? randDelay(1100, 2000) : action.type === 'pass' ? randDelay(700, 1300) : randDelay(900, 1700);
  ctx.bot(bot, `${action.type}:${s.moves}`, delay, action);
}

/** For result(): the highest `score` first; equal scores share a place. */
function placesByScore(ids: string[], score: (id: string) => number): string[][] {
  const out: string[][] = [];
  let prev: number | null = null;
  for (const id of [...ids].sort((a, b) => score(b) - score(a))) {
    const v = score(id);
    if (v === prev) out[out.length - 1].push(id);
    else out.push([id]);
    prev = v;
  }
  return out;
}

export const unoflip: GameModule<State, UnoSettings> = {
  turnOf: (s) => s.phase === 'play' ? [s.seats[s.turnIdx]] : [],
  id: 'unoflip',
  hostOnly: ['next'],

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      seats: participants,
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      phase: 'play',
      round: 0,
      dealerIdx: Math.floor(Math.random() * participants.length),
      turnIdx: 0,
      dir: 1,
      side: 'light',
      deck: [],
      discard: [],
      hands: {},
      color: 'red',
      choosing: null,
      drawn: null,
      unoSaid: new Set(),
      catchable: null,
      lastPlay: null,
      feed: new Feed(),
      roundSummary: null,
      winner: null,
      moves: 0,
    };
    startRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'roundEnd') startRound(ctx, s);
      return;
    }
    if (s.phase !== 'play' || !s.seats.includes(by)) return;

    if (a.type === 'uno') {
      const k = s.hands[by].length;
      if (k > 2) throw new GameError('تقول «أونو» عندما تبقى لك ورقة واحدة');
      if (k === 2 && s.seats[s.turnIdx] !== by) throw new GameError('قلها في دورك قبل أن تلعب ورقتك قبل الأخيرة');
      s.unoSaid.add(by);
      if (s.catchable === by) s.catchable = null;
      s.feed.push(`${name(ctx, by)}: أونو!`, { by });
      ctx.say?.(`أونو من ${name(ctx, by)}!`, by, VOICE.uno);
      ctx.fx('correct', by);
      return;
    }

    if (a.type === 'catch') {
      const target = s.catchable;
      if (!target || target === by) return;
      drawN(s, target, CATCH_PENALTY);
      s.catchable = null;
      s.feed.push(`${name(ctx, by)} أمسك ${name(ctx, target)} بدون «أونو»: +${CATCH_PENALTY}`, { by: target });
      ctx.say?.(`لا «أونو» من ${name(ctx, target)}: ${CATCH_PENALTY} للسحب (كشفٌ من ${name(ctx, by)})`, by, VOICE.unoCaught);
      ctx.fx('buzz', target);
      return;
    }

    if (a.type === 'color') {
      if (!s.choosing || s.choosing.by !== by) return;
      const c = a.color as UnoColor;
      if (!colorsOf(s.side).includes(c)) return;
      s.color = c;
      s.feed.push(`${name(ctx, by)} اختار ${UNO_COLOR_INFO[c].name}`, { by });
      s.moves += 1;
      const then = s.choosing.then;
      const effect = afterColor(ctx, s);
      // read aloud: the wild cards that punish the next player (+2, draw until the colour)
      ctx.say?.(`اللون من اختيار ${name(ctx, by)}: ${UNO_COLOR_INFO[c].name}${effect}`, by, then === 'draw2' ? VOICE.plus2 : then === 'drawColor' ? VOICE.wildColor : undefined);
      return;
    }

    if (s.seats[s.turnIdx] !== by) throw new GameError('ليس دورك');
    if (s.choosing) return;

    if (a.type === 'draw') {
      if (s.drawn?.by === by) throw new GameError('سحبت ورقة — العبها أو مرّر');
      closeCatch(s, by);
      const c = drawOne(s, by);
      s.moves += 1;
      ctx.fx('card', by);
      if (c && canPlayFace(faceOf(c, s.side), top(s), s.color)) {
        s.drawn = { by, id: c.id };
        ctx.say?.(`سحب ورقة: ${name(ctx, by)}`, by);
      } else {
        // couldn't play on this colour, nor the card drawn: short of it (everybody saw)
        const v = ((s.voids ??= {})[by] ??= []);
        if (!v.includes(s.color)) v.push(s.color);
        s.feed.push(`${name(ctx, by)} سحب ورقة ومرّر`, { by });
        ctx.say?.(`سحب ورقة ثم تمرير: ${name(ctx, by)}`, by);
        advance(s);
      }
      return;
    }

    if (a.type === 'pass') {
      if (s.drawn?.by !== by) throw new GameError('اسحب ورقة أولاً');
      s.feed.push(`${name(ctx, by)} سحب ورقة ومرّر`, { by });
      ctx.say?.(`تمرير: ${name(ctx, by)}`, by);
      s.moves += 1;
      advance(s);
      return;
    }

    if (a.type === 'play') {
      if (!isStr(a.card)) return;
      if (!playable(s, by).includes(a.card)) throw new GameError('لا يمكنك لعب هذه الورقة');
      closeCatch(s, by);
      const hand = s.hands[by];
      const i = hand.findIndex((c) => c.id === a.card);
      const [card] = hand.splice(i, 1);
      const f = faceOf(card, s.side);
      s.discard.push(card);
      if (!isWild(f)) s.color = f.color!;
      s.lastPlay = { by, face: f };
      s.drawn = null;
      s.moves += 1;
      ctx.fx('card', by);
      if (hand.length === 1 && !s.unoSaid.has(by)) s.catchable = by;
      if (hand.length !== 1) s.unoSaid.delete(by);
      const effect = applyEffect(ctx, s, by, f);
      // read aloud: a flip and the cards that punish everyone (+5, skip everyone) — never a plain card
      const voice = f.kind === 'flip' ? VOICE.flip : f.kind === 'draw5' ? VOICE.plus5 : f.kind === 'skipAll' ? VOICE.skipAll : undefined;
      ctx.say?.(`ورقة من ${name(ctx, by)}: ${faceName(f)}${effect}${s.choosing ? ' — واختيار لون' : ''}`, by, voiceAnd(voice));
      if (hand.length === 0) {
        // a last Wild ends the round right away; draw penalties still land first
        const ch = s.choosing as State['choosing']; // set by applyEffect
        if (ch) {
          if (ch.then === 'next') s.choosing = null;
          else {
            const pick = colorsOf(s.side)[0];
            s.color = pick;
            afterColor(ctx, s);
          }
        }
        endRound(ctx, s, by);
      }
    }
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play') return;
    const level = botLevel(ctx);
    if (level !== 'easy') {
      strongBots(ctx, s, level);
      return;
    }
    // 'easy': the old bots
    // catch a forgotten UNO
    if (s.catchable) {
      const catcher = s.seats.find((id) => id !== s.catchable && ctx.isBot(id));
      if (catcher && Math.random() < 0.7) ctx.bot(catcher, `catch:${s.moves}:${s.catchable}`, randDelay(1400, 3200), { type: 'catch' });
    }
    if (s.choosing) {
      const bot = s.choosing.by;
      if (!ctx.isBot(bot)) return;
      const counts = new Map<UnoColor, number>();
      for (const c of s.hands[bot]) {
        const f = faceOf(c, s.side);
        if (f.color) counts.set(f.color, (counts.get(f.color) ?? 0) + 1);
      }
      const opts = colorsOf(s.side);
      const best = opts.slice().sort((x, y) => (counts.get(y) ?? 0) - (counts.get(x) ?? 0))[0];
      ctx.bot(bot, `color:${s.moves}`, randDelay(700, 1400), { type: 'color', color: best });
      return;
    }
    const bot = s.seats[s.turnIdx];
    if (!ctx.isBot(bot)) return;
    const hand = s.hands[bot];
    const options = playable(s, bot).map((id) => hand.find((c) => c.id === id)!);
    if (!options.length) {
      if (s.drawn?.by === bot) ctx.bot(bot, `pass:${s.moves}`, randDelay(700, 1300), { type: 'pass' });
      else ctx.bot(bot, `draw:${s.moves}`, randDelay(900, 1700), { type: 'draw' });
      return;
    }
    const nextCount = s.hands[at(s, 1)].length;
    const score = (c: UnoCard) => {
      const f = faceOf(c, s.side);
      let v = unoPoints(f);
      if (isWild(f)) v = hand.length <= 2 || nextCount <= 2 ? 90 : 5; // keep wilds for later
      if (nextCount <= 2 && ['draw1', 'draw5', 'skip', 'skipAll', 'wild2', 'wildColor'].includes(f.kind)) v += 60;
      return v;
    };
    const pick = options.sort((x, y) => score(y) - score(x))[0];
    if (hand.length === 2 && Math.random() < 0.85) ctx.bot(bot, `uno:${s.moves}`, randDelay(300, 600), { type: 'uno' });
    ctx.bot(bot, `play:${s.moves}`, randDelay(1100, 2000), { type: 'play', card: pick.id });
  },

  view(ctx, s, me): UnoView {
    const other = otherSide(s.side);
    const deckTop = s.deck[0];
    const backs: Record<string, UnoFace[]> = {};
    for (const id of s.seats) if (id !== me) backs[id] = s.hands[id].map((c) => faceOf(c, other));
    const feed: FeedItem[] = s.feed.list();
    return {
      game: 'unoflip',
      phase: s.phase,
      participants: s.seats,
      round: s.round,
      target: s.settings.target,
      side: s.side,
      turn: s.seats[s.turnIdx],
      dir: s.dir,
      top: top(s),
      topId: s.discard[s.discard.length - 1]?.id,
      color: s.color,
      deckLeft: s.deck.length,
      deckTop: deckTop ? faceOf(deckTop, other) : null,
      myHand: (s.hands[me] ?? []).map((c) => ({ id: c.id, face: faceOf(c, s.side) })),
      playable: playable(s, me),
      backs,
      handCounts: Object.fromEntries(s.seats.map((id) => [id, s.hands[id]?.length ?? 0])),
      choosing: s.choosing?.by ?? null,
      drawn: s.drawn?.by === me ? s.drawn.id : null,
      canPass: s.drawn?.by === me,
      unoSaid: [...s.unoSaid],
      catchable: s.catchable,
      scores: s.scores,
      lastPlay: s.lastPlay,
      feed,
      roundSummary: s.roundSummary,
      winner: s.winner,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.seats.includes(id) || s.phase === 'final') return;
    s.feed.push(`${ctx.playerName(id)} غادر اللعبة`);
    const idx = s.seats.indexOf(id);
    const wasTurn = s.turnIdx === idx;
    s.seats.splice(idx, 1);
    s.deck.push(...s.hands[id]);
    delete s.hands[id];
    if (s.catchable === id) s.catchable = null;
    if (s.choosing?.by === id) s.choosing = null;
    if (s.seats.length < 2) {
      s.phase = 'final';
      s.winner = s.seats[0] ?? null;
      return;
    }
    if (s.turnIdx > idx || s.turnIdx >= s.seats.length) s.turnIdx = (s.turnIdx - (s.turnIdx > idx ? 1 : 0)) % s.seats.length;
    if (wasTurn) s.drawn = null;
  },

  result(s) {
    if (s.phase !== 'final' || !s.winner) return null;
    // the winner, then the others by points scored
    const rest = s.seats.filter((id) => id !== s.winner);
    return { places: [[s.winner], ...placesByScore(rest, (id) => s.scores[id] ?? 0)] };
  },
};
