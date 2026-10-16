/**
 * «رحلة الحج» — a race along the Hajj journey with one die.
 * Every pilgrim must stop at each station (the die never carries you past one), where a card explains
 * the ritual. Between stations: small events (helping others moves you on, delays set you back) and
 * question squares (answer right → 2 squares forward). First to finish Tawaf al-Wada' wins.
 */
import { HAJJ_EVENTS, HAJJ_LEN, HAJJ_STATIONS, hajjSquare, hajjStationAt } from '../../src/shared/islamic';
import type { BoardCard, HajjSettings, HajjView } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { QUESTIONS } from '../content-islamic';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, shuffle } from '../util';
import { mcqOptions } from './mcq';

const LAST = HAJJ_LEN - 1;
const Q_MS = 20000;

interface State {
  settings: HajjSettings;
  players: { id: string; pos: number }[];
  turnIdx: number;
  phase: HajjView['phase'];
  dice: number | null;
  rollId: number;
  card: BoardCard | null;
  cardN: number;
  question: { text: string; options: string[]; correct: number; endsAt: number; for: string } | null;
  qDeck: typeof QUESTIONS;
  events: typeof HAJJ_EVENTS;
  winner: string | null;
  feed: Feed;
  moves: number;
}

const cur = (s: State) => s.players[s.turnIdx];
const nextStation = (pos: number) => Math.min(LAST, (Math.floor(pos / 4) + 1) * 4);
const prevStation = (pos: number) => Math.floor(pos / 4) * 4;

function card(s: State, by: string, c: Omit<BoardCard, 'id' | 'by'>) {
  s.card = { id: ++s.cardN, by, ...c };
}

function nextTurn(s: State) {
  if (s.phase === 'final' || !s.players.length) return;
  s.turnIdx = (s.turnIdx + 1) % s.players.length;
  s.phase = 'roll';
  s.question = null;
}

function arrive(ctx: GameCtx, s: State, p: { id: string; pos: number }) {
  const kind = hajjSquare(p.pos);
  const st = hajjStationAt(p.pos);
  if (kind === 'station') {
    const station = HAJJ_STATIONS[st];
    card(s, p.id, { kind: 'station', title: station.title, text: station.text, day: station.day });
    s.feed.push(`${ctx.playerName(p.id)} وصل إلى ${station.title}`, { by: p.id });
    if (p.pos === LAST) {
      s.winner = p.id;
      s.phase = 'final';
      ctx.fx('win', p.id);
      return;
    }
    ctx.fx('reveal', p.id);
  } else if (kind === 'event') {
    if (!s.events.length) s.events = shuffle(HAJJ_EVENTS);
    const e = s.events.shift()!;
    const to = e.move > 0 ? Math.min(nextStation(p.pos), p.pos + e.move) : Math.max(prevStation(p.pos), p.pos + e.move);
    card(s, p.id, { kind: 'event', title: e.move > 0 ? 'عمل صالح' : 'في الطريق', text: e.text });
    p.pos = to;
    if (hajjSquare(p.pos) === 'station') {
      const station = HAJJ_STATIONS[hajjStationAt(p.pos)];
      s.feed.push(`${ctx.playerName(p.id)} وصل إلى ${station.title}`, { by: p.id });
    }
  } else if (kind === 'question' && s.settings.questions) {
    if (!s.qDeck.length) s.qDeck = shuffle(QUESTIONS.filter((q) => q.cat === 'hajj' || q.cat === 'worship'));
    const q = s.qDeck.shift()!;
    s.question = { text: q.q, ...mcqOptions(q.a, q.w), endsAt: ctx.now + Q_MS, for: p.id };
    s.phase = 'question';
    return;
  }
  nextTurn(s);
}

export const hajj: GameModule<State, HajjSettings> = {
  id: 'hajj',

  start(ctx, participants, settings) {
    ctx.fx('start');
    return {
      settings,
      players: shuffle(participants).map((id) => ({ id, pos: 0 })),
      turnIdx: 0,
      phase: 'roll',
      dice: null,
      rollId: 0,
      card: null,
      cardN: 0,
      question: null,
      qDeck: shuffle(QUESTIONS.filter((q) => q.cat === 'hajj' || q.cat === 'worship')),
      events: shuffle(HAJJ_EVENTS),
      winner: null,
      feed: new Feed(),
      moves: 0,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    const p = cur(s);
    if (!p || p.id !== by) throw new GameError('ماشي دورك');
    if (a.type === 'roll' && s.phase === 'roll') {
      const d = 1 + Math.floor(Math.random() * 6);
      s.dice = d;
      s.rollId += 1;
      s.moves += 1;
      const stop = nextStation(p.pos);
      p.pos = Math.min(stop, p.pos + d);
      ctx.fx('tick', by);
      arrive(ctx, s, p);
      return;
    }
    if (a.type === 'answer' && s.phase === 'question' && s.question && isNum(a.choice)) {
      const q = s.question;
      s.moves += 1;
      if (a.choice === q.correct) {
        p.pos = Math.min(nextStation(p.pos), p.pos + 2);
        card(s, by, { kind: 'right', title: 'إجابة صحيحة!', text: `«${q.options[q.correct]}» — تقدّم خانتين.` });
        s.feed.push(`${ctx.playerName(by)} أجاب صحيحاً`, { by });
        ctx.fx('correct', by);
      } else {
        card(s, by, { kind: 'wrong', title: 'إجابة خاطئة', text: `الجواب الصحيح: «${q.options[q.correct]}».` });
        ctx.fx('buzz', by);
      }
      s.question = null;
      nextTurn(s);
    }
  },

  tick(ctx, s) {
    if (s.phase !== 'question' || !s.question || ctx.now < s.question.endsAt) return false;
    const q = s.question;
    card(s, q.for, { kind: 'wrong', title: 'انتهى الوقت', text: `الجواب الصحيح: «${q.options[q.correct]}».` });
    s.moves += 1;
    s.question = null;
    nextTurn(s);
    return true;
  },

  botPlan(ctx, s, bots) {
    const p = cur(s);
    if (!p || !bots.includes(p.id) || s.phase === 'final') return;
    if (s.phase === 'roll') ctx.bot(p.id, `roll:${s.moves}`, randDelay(2600, 3400), { type: 'roll' });
    else if (s.phase === 'question' && s.question) {
      const q = s.question;
      const wrong = [...q.options.keys()].filter((k) => k !== q.correct);
      const choice = Math.random() < 0.7 ? q.correct : wrong[Math.floor(Math.random() * wrong.length)];
      ctx.bot(p.id, `ans:${s.moves}`, randDelay(3500, 6000), { type: 'answer', choice });
    }
  },

  view(ctx, s): HajjView {
    return {
      game: 'hajj',
      phase: s.phase,
      players: s.players,
      turn: cur(s)?.id ?? '',
      dice: s.dice,
      rollId: s.rollId,
      card: s.card,
      question: s.question ? { text: s.question.text, options: s.question.options, endsAt: s.question.endsAt, for: s.question.for } : null,
      winner: s.winner,
      feed: s.feed.list(),
    };
  },

  onLeave(ctx, s, id) {
    const i = s.players.findIndex((p) => p.id === id);
    if (i < 0 || s.phase === 'final') return;
    const wasTurn = i === s.turnIdx;
    s.players.splice(i, 1);
    if (!s.players.length) return;
    if (i < s.turnIdx) s.turnIdx -= 1;
    if (s.players.length === 1) {
      s.winner = s.players[0].id;
      s.phase = 'final';
      return;
    }
    if (wasTurn) {
      s.turnIdx = (s.turnIdx - 1 + s.players.length) % s.players.length;
      nextTurn(s);
    }
  },
};
