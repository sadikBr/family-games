/**
 * «قطار المغرب» — the game module: actions, timers, announcements, bots and the views.
 * Rules (the top of src/shared/games/train.ts) are played by server/train-rules.ts; bots: server/train-bots.ts.
 *
 * Hidden information: a view carries only the viewer's own hand, tickets and ticket offer; for everyone
 * else the counts (cards, tickets, wagons, route points). The deck's order and the ticket pile never leave
 * the server; cards drawn from the deck are announced as «من الكومة». All tickets are shown at the end.
 */
import { TRAIN_DEFAULTS, TRAIN_SECONDS, TRAIN_WAGONS, handTotal, type TrainSettings, type TrainView } from '../../src/shared/games/train';
import { COLOR_NAME, CITY, ROUTES, TRAIN_COLORS, type TrainColor } from '../../src/shared/train-map';
import { botDecide, botDelay, type BotAction, type BotSee } from '../train-bots';
import {
  active,
  beginPlay,
  claim,
  doublesOpen,
  drawTickets,
  endTurn,
  finish,
  isActive,
  keepMin,
  keepTickets,
  newState,
  nextActive,
  places,
  stuck,
  takeDeck,
  takeFaceUp,
  ticketDone,
  type State,
} from '../train-rules';
import { GameError, botLevel, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import type { BotLevel } from '../../src/shared/protocol';

export function sanitizeTrain(raw: Partial<TrainSettings> | undefined): TrainSettings {
  const w = Number(raw?.wagons);
  const sec = Number(raw?.seconds);
  return {
    wagons: (TRAIN_WAGONS as readonly number[]).includes(w) ? w : TRAIN_DEFAULTS.wagons,
    seconds: (TRAIN_SECONDS as readonly number[]).includes(sec) ? sec : TRAIN_DEFAULTS.seconds,
  };
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

/** «لسارة» / «لـBob» */
const li = (n: string) => (/^[ء-ي]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);
const routeName = (id: number) => `${CITY[ROUTES[id].a].name}–${CITY[ROUTES[id].b].name}`;

function drawLine(s: State, name: string): string {
  const took = s.took;
  if (took.length === 1 && took[0] === 'loco') return `قاطرة مكشوفة ${li(name)}`;
  const deck = took.filter((c) => c === 'deck').length;
  const shown = took.filter((c) => c !== 'deck').map((c) => `${COLOR_NAME[c as TrainColor | 'loco']} مكشوف`);
  if (!shown.length) return deck === 2 ? `بطاقتان من الكومة ${li(name)}` : `بطاقة من الكومة ${li(name)}`;
  const parts = [...shown, ...(deck ? [deck === 2 ? 'بطاقتان من الكومة' : 'بطاقة من الكومة'] : [])];
  return `${took.length === 2 ? 'بطاقتان' : 'بطاقة'} ${li(name)}: ${parts.join(' و')}`;
}

const deadline = (ctx: GameCtx, s: State, factor = 1) => (s.settings.seconds ? ctx.now + s.settings.seconds * 1000 * factor : null);

/* ------------------------------------------------------------------ */
/* Turn flow                                                           */
/* ------------------------------------------------------------------ */

function afterTurn(ctx: GameCtx, s: State) {
  const by = s.turn;
  const r = endTurn(s);
  if (r.over) {
    // the winner is revealed by the scoring on the screens, step by step
    ctx.fx('win', s.final!.winners[0]);
    ctx.say?.('انتهت الرحلة: حساب النقاط');
    return;
  }
  if (r.lastRound) {
    ctx.fx('reveal');
    ctx.say?.(`الجولة الأخيرة! بقيت ${s.wagons[by]} عربات مع ${ctx.playerName(by)}: دور أخير للجميع`, by);
  }
  s.endsAt = deadline(ctx, s);
}

/** One action of the player whose turn it is (or a ticket choice). Throws GameError when not allowed. */
function play(ctx: GameCtx, s: State, by: string, a: BotAction) {
  const name = ctx.playerName(by);
  switch (a.type) {
    case 'face':
    case 'deck': {
      const over = a.type === 'face' ? takeFaceUp(s, by, a.i) : takeDeck(s, by);
      ctx.fx('card', by);
      if (over) {
        s.last = { seq: s.seq + 1, by, kind: 'draw', took: s.took.slice() };
        ctx.say?.(drawLine(s, name), by);
        afterTurn(ctx, s);
      }
      return;
    }
    case 'claim': {
      const pts = claim(s, by, a.route, a.color);
      s.last = { seq: s.seq + 1, by, kind: 'claim', route: a.route };
      ctx.fx('correct', by);
      ctx.say?.(`سكة ${routeName(a.route)} ${li(name)} (+${pts})`, by);
      afterTurn(ctx, s);
      return;
    }
    case 'tickets': {
      drawTickets(s, by);
      ctx.fx('card', by);
      return;
    }
    case 'keep': {
      const picking = s.phase === 'pick';
      const had = s.tickets[by].length;
      keepTickets(s, by, a.ids);
      const kept = s.tickets[by].length - had;
      if (picking) {
        if (!active(s).some((id) => s.offer[id])) {
          beginPlay(s);
          s.endsAt = deadline(ctx, s);
          ctx.fx('start');
          ctx.say?.(`الرحلة تبدأ: الدور الأول ${li(ctx.playerName(s.turn))}`, s.turn);
        }
        return;
      }
      s.last = { seq: s.seq + 1, by, kind: 'tickets', kept };
      ctx.say?.(`تذاكر جديدة ${li(name)}: ${kept === 1 ? 'تذكرة واحدة' : kept === 2 ? 'تذكرتان' : `${kept} تذاكر`}`, by);
      afterTurn(ctx, s);
      return;
    }
    case 'pass': {
      if (!stuck(s, by)) throw new GameError('ما زال في الدور شيء ممكن');
      s.last = { seq: s.seq + 1, by, kind: 'pass' };
      ctx.say?.(`لا حركة ممكنة: تمرير الدور من ${name}`, by);
      afterTurn(ctx, s);
      return;
    }
  }
}

/** What a bot (or a player away, or a timed-out turn) may know: its own phone's view, nothing more. */
export function botSee(s: State, id: string, level: BotLevel): BotSee {
  return {
    me: id,
    level,
    step: s.phase === 'play' && s.turn === id ? s.step : 'start',
    owners: s.owners.slice(),
    doubles: doublesOpen(s),
    faceUp: s.faceUp.slice(),
    deck: s.deck.length + s.discard.length,
    ticketDeck: s.ticketDeck.length,
    hand: { ...s.hands[id] },
    wagons: s.wagons[id],
    points: s.points[id],
    tickets: s.tickets[id].slice(),
    offer: s.offer[id] ? s.offer[id].slice() : null,
    keepMin: keepMin(s, id),
    lastRound: !!s.lastRound,
    others: active(s)
      .filter((o) => o !== id)
      .map((o) => ({ id: o, wagons: s.wagons[o], points: s.points[o] })),
    rnd: s.rnd,
  };
}

/** The time ran out: the turn is played for them (a sensible move), ticket choices too. */
function autoplay(ctx: GameCtx, s: State) {
  const ids = s.phase === 'pick' ? active(s).filter((id) => s.offer[id]) : [s.turn];
  for (const id of ids) {
    for (let guard = 0; guard < 4; guard++) {
      if (s.phase === 'final') return;
      if (s.phase === 'play' && s.turn !== id) break;
      if (s.phase === 'pick' && !s.offer[id]) break;
      let a = botDecide(botSee(s, id, 'smart'));
      // a timed-out turn only draws cards (never spends them)
      if (a.type === 'claim' || a.type === 'tickets') a = s.deck.length + s.discard.length ? { type: 'deck' } : a;
      try {
        play(ctx, s, id, a);
      } catch {
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startTrain(ctx: GameCtx, participants: string[], raw: TrainSettings, rnd: () => number = Math.random): State {
  const s = newState(participants, sanitizeTrain(raw), rnd);
  s.endsAt = deadline(ctx, s, 1.5);
  ctx.fx('start');
  ctx.say?.('اختر تذاكر رحلاتك: احتفظ باثنتين على الأقل');
  return s;
}

const isAction = (a: Record<string, unknown>): BotAction | null => {
  switch (a.type) {
    case 'face':
      return isNum(a.i) ? { type: 'face', i: Math.floor(a.i) } : null;
    case 'deck':
    case 'tickets':
    case 'pass':
      return { type: a.type };
    case 'claim':
      return isNum(a.route) && isStr(a.color) && ([...TRAIN_COLORS, 'loco'] as string[]).includes(a.color) ? { type: 'claim', route: Math.floor(a.route), color: a.color as TrainColor | 'loco' } : null;
    case 'keep':
      return Array.isArray(a.ids) && a.ids.every(isNum) ? { type: 'keep', ids: (a.ids as number[]).map(Math.floor) } : null;
    default:
      return null;
  }
};

export const train: GameModule<State, TrainSettings> = {
  id: 'train',

  start(ctx, participants, settings) {
    return startTrain(ctx, participants, settings);
  },

  act(ctx, s, by, raw) {
    if (s.phase === 'final' || !isActive(s, by)) return;
    // a bot's move planned for an older state is dropped (it plans again)
    if (raw.seq !== undefined && raw.seq !== s.seq) return;
    const a = isAction(raw);
    if (!a) return;
    if (s.phase === 'pick' && a.type !== 'keep') throw new GameError('اختر تذاكرك أولاً');
    play(ctx, s, by, a);
    s.seq++;
  },

  tick(ctx, s) {
    if (s.phase === 'final' || s.endsAt === null || ctx.now < s.endsAt) return false;
    s.endsAt = null;
    autoplay(ctx, s);
    if (s.phase === 'play' && s.endsAt === null) s.endsAt = deadline(ctx, s);
    s.seq++;
    return true;
  },

  turnOf(s) {
    if (s.phase === 'final') return [];
    if (s.phase === 'pick') return active(s).filter((id) => s.offer[id]);
    return [s.turn];
  },

  botPlan(ctx, s) {
    if (s.phase === 'final') return;
    const level = botLevel(ctx);
    for (const id of train.turnOf!(s)) {
      if (!ctx.isBot(id)) continue;
      const a = botDecide(botSee(s, id, level));
      ctx.bot(id, `${s.seq}`, botDelay(level, a, s.rnd), { ...a, seq: s.seq });
    }
  },

  view(_ctx, s, me): TrainView {
    const seat = s.order.indexOf(me);
    const playing = seat >= 0 && !s.gone.includes(me);
    const over = s.phase === 'final';
    return {
      game: 'train',
      phase: s.phase,
      order: s.order,
      turn: s.phase === 'play' ? s.turn : null,
      step: s.step,
      turnNo: s.turnNo,
      seq: s.seq,
      owners: s.owners.slice(),
      faceUp: s.faceUp.slice(),
      deck: s.deck.length,
      discard: s.discard.length,
      ticketDeck: s.ticketDeck.length,
      players: Object.fromEntries(
        s.order.map((id, i) => [
          id,
          {
            seat: i,
            wagons: s.wagons[id],
            cards: handTotal(s.hands[id]),
            tickets: s.tickets[id].length,
            points: s.points[id],
            picking: s.phase === 'pick' && !!s.offer[id],
            gone: s.gone.includes(id),
          },
        ]),
      ),
      lastRound: s.lastRound ? { by: s.lastRound.by, left: s.lastRound.left.filter((id) => isActive(s, id)) } : null,
      doubles: doublesOpen(s),
      endsAt: s.endsAt,
      total: s.settings.seconds * 1000 * (s.phase === 'pick' ? 1.5 : 1),
      last: s.last,
      me: playing
        ? {
            seat,
            hand: { ...s.hands[me] },
            tickets: s.tickets[me].map((id) => ({ id, done: ticketDone(s, me, id) })),
            offer: !over && s.offer[me] ? s.offer[me].slice() : null,
            keepMin: keepMin(s, me),
          }
        : null,
      final: s.final,
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase === 'final' || !isActive(s, id)) return;
    const wasTurn = s.phase === 'play' && s.turn === id;
    s.gone.push(id);
    // their cards go to the discards and their tickets under the pile; their routes stay on the map
    for (const [c, n] of Object.entries(s.hands[id])) for (let i = 0; i < n; i++) s.discard.push(c as TrainColor | 'loco');
    s.hands[id] = { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0, black: 0, white: 0, loco: 0 };
    s.ticketDeck.push(...(s.offer[id] ?? []));
    delete s.offer[id];
    s.seq++;
    if (active(s).length < 2) {
      finish(s, 'left');
      ctx.fx('win', active(s)[0]);
      return;
    }
    if (s.phase === 'pick') {
      if (!active(s).some((p) => s.offer[p])) {
        beginPlay(s);
        s.endsAt = deadline(ctx, s);
      }
      return;
    }
    if (s.lastRound) {
      s.lastRound.left = s.lastRound.left.filter((p) => p !== id);
      if (!s.lastRound.left.some((p) => isActive(s, p))) {
        finish(s, 'end');
        ctx.fx('win', s.final!.winners[0]);
        return;
      }
    }
    if (wasTurn) {
      s.turn = nextActive(s, id);
      s.step = 'start';
      s.turnNo++;
      s.took = [];
      s.endsAt = deadline(ctx, s);
    }
  },

  result(s) {
    if (s.phase !== 'final' || !s.final) return null;
    return { places: places(s) };
  },

  patchSettings(settings, patch) {
    if ((TRAIN_WAGONS as readonly unknown[]).includes(patch.wagons)) settings.wagons = patch.wagons as number;
    if ((TRAIN_SECONDS as readonly unknown[]).includes(patch.seconds)) settings.seconds = patch.seconds as number;
  },
};
export type { State as TrainState };
