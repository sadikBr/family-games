/**
 * «رحلة الحج» — a race along the Hajj journey with one die.
 * Every pilgrim stops at each station (the die never carries you past one — unless you play «الدليل»),
 * where a card explains the ritual. The first pilgrim to reach a station opens its question for
 * EVERYONE: right answers earn a provision card (زاد) and the fastest right answer steps forward.
 * Provision cards are played on your own turn before rolling (one per turn):
 *   التلبية +2 · الدليل pass the next station · ماء زمزم roll again · الصدقة you and a friend step on ·
 *   الصبر (kept in hand) cancels the next delay.
 * Between stations: good deeds move you on, delays set you back, and question squares give a personal
 * question (right → one step and a card). First to finish Tawaf al-Wada' wins.
 */
import { HAJJ_EVENTS, HAJJ_LEN, HAJJ_STATIONS, ZAD_DECK, ZAD_HAND, ZAD_INFO, hajjSquare, hajjStationAt, type ZadKind } from '../../src/shared/islamic';
import type { BoardCard, HajjSettings, HajjView, HajjZad } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { QUESTIONS } from '../content-islamic';
import { qdeck } from '../qdeck';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';
import { mcqOptions } from './mcq';

const LAST = HAJJ_LEN - 1;
const Q_MS = 20000;
const QUIZ_MS = 15000;
const REVEAL_MS = 5000; // time to read the station quiz's answer
const BOTS_REVEAL_MS = 3500; // nobody to read it: bots only
const BOT_SKILL = 0.7;

interface Pilgrim {
  id: string;
  pos: number;
  hand: HajjZad[];
  /** when the pilgrim got to `pos` (orders ties on the final scoreboard), see stamp() */
  since: number;
  seen: number;
}

interface Quiz {
  station: string;
  text: string;
  options: string[];
  correct: number;
  endsAt: number;
  answers: Record<string, { choice: number; at: number }>;
  revealed: boolean;
  results: { id: string; correct: boolean; first: boolean }[] | null;
}

interface State {
  settings: HajjSettings;
  players: Pilgrim[];
  turnIdx: number;
  phase: HajjView['phase'];
  dice: number | null;
  rollId: number;
  landing: number | null;
  card: BoardCard | null;
  cardN: number;
  question: { text: string; options: string[]; correct: number; endsAt: number; for: string } | null;
  quiz: Quiz | null;
  reached: number[]; // stations someone has already reached (their question was asked)
  events: typeof HAJJ_EVENTS;
  zadDeck: ZadKind[];
  zadN: number;
  mods: HajjView['mods'];
  played: HajjView['played'];
  playedN: number;
  winner: string | null;
  feed: Feed;
  moves: number;
  clock: number;
  botAt: number;
  botCard: number | null; // the card a bot decided to play this turn
}

const cur = (s: State) => s.players[s.turnIdx];
const nextStation = (pos: number) => Math.min(LAST, (Math.floor(pos / 4) + 1) * 4);
const prevStation = (pos: number) => Math.floor(pos / 4) * 4;
const freshMods = (): HajjView['mods'] => ({ bonus: 0, pass: false, again: false, played: false });

function card(s: State, by: string, c: Omit<BoardCard, 'id' | 'by'>) {
  s.card = { id: ++s.cardN, by, ...c };
}

function deck(): ZadKind[] {
  return shuffle((Object.keys(ZAD_DECK) as ZadKind[]).flatMap((k) => Array<ZadKind>(ZAD_DECK[k]).fill(k)));
}

/** Give a provision card (if the hand has room). Returns the card kind, or null. */
function draw(s: State, p: Pilgrim): ZadKind | null {
  if (p.hand.length >= ZAD_HAND) return null;
  if (!s.zadDeck.length) s.zadDeck = deck();
  const kind = s.zadDeck.shift()!;
  p.hand.push({ id: ++s.zadN, kind });
  return kind;
}

const HAJJ_POOL = QUESTIONS.filter((q) => q.cat === 'hajj' || q.cat === 'worship');

/** The room's own deck (not shared with «مسابقة إسلامية» or «حروف»), so questions don't repeat between games. */
function drawQuestion(ctx: GameCtx) {
  return qdeck(ctx, 'hajj:q', HAJJ_POOL).draw();
}

/**
 * Remember when each pilgrim's square last changed. Called before every action / tick (and on a win),
 * so moves made by one action are stamped before the next action moves anyone.
 */
function stamp(s: State) {
  if (s.players.every((p) => p.pos === p.seen)) return;
  s.clock += 1;
  for (const p of s.players)
    if (p.pos !== p.seen) {
      p.seen = p.pos;
      p.since = s.clock;
    }
}

/** Finishing order: furthest along first; on the same square, whoever got there first. */
export function hajjOrder(s: State): string[] {
  return [...s.players].sort((a, b) => b.pos - a.pos || a.since - b.since).map((p) => p.id);
}

function win(ctx: GameCtx, s: State, id: string) {
  stamp(s);
  s.winner = id;
  s.phase = 'final';
  ctx.fx('win', id);
}

/** Steps forward, never past the next station; `onto: false` also stops just before it. */
function step(p: Pilgrim, n = 1, onto = true) {
  p.pos = Math.min(nextStation(p.pos) - (onto ? 0 : 1), p.pos + n);
}

function endTurn(s: State) {
  if (s.phase === 'final' || !s.players.length) return;
  const again = s.mods.again;
  if (!again) s.turnIdx = (s.turnIdx + 1) % s.players.length;
  s.phase = 'roll';
  s.question = null;
  s.quiz = null;
  s.mods = freshMods();
}

function stationArrival(ctx: GameCtx, s: State, p: Pilgrim) {
  const k = hajjStationAt(p.pos);
  const station = HAJJ_STATIONS[k];
  card(s, p.id, { kind: 'station', title: station.title, text: station.text, day: station.day });
  s.feed.push(`${ctx.playerName(p.id)} وصل إلى ${station.title}`, { by: p.id });
  if (p.pos === LAST) return win(ctx, s, p.id);
  ctx.fx('reveal', p.id);
  if (s.settings.questions && !s.reached.includes(k) && s.players.length > 1) {
    // the first pilgrim here opens the station's question for everyone
    s.reached.push(k);
    const q = drawQuestion(ctx);
    s.quiz = { station: station.title, text: q.q, ...mcqOptions(q.a, q.w), endsAt: ctx.now + QUIZ_MS, answers: {}, revealed: false, results: null };
    s.phase = 'quiz';
    return;
  }
  endTurn(s);
}

function arrive(ctx: GameCtx, s: State, p: Pilgrim) {
  const kind = hajjSquare(p.pos);
  if (kind === 'station') return stationArrival(ctx, s, p);
  if (kind === 'event') {
    if (!s.events.length) s.events = shuffle(HAJJ_EVENTS);
    const e = s.events.shift()!;
    const shield = e.move < 0 ? p.hand.findIndex((c) => c.kind === 'sabr') : -1;
    if (shield >= 0) {
      p.hand.splice(shield, 1);
      card(s, p.id, { kind: 'zad', title: 'الصبر حماك', text: `${e.text.replace(/ارجع.*$/, '')}لكنك صبرت فلم تتأخر.` });
      s.feed.push(`${ctx.playerName(p.id)} استعمل «الصبر»`, { by: p.id });
    } else {
      const to = e.move > 0 ? Math.min(nextStation(p.pos), p.pos + e.move) : Math.max(prevStation(p.pos), p.pos + e.move);
      card(s, p.id, { kind: 'event', title: e.move > 0 ? 'عمل صالح' : 'في الطريق', text: e.text });
      p.pos = to;
      if (hajjSquare(p.pos) === 'station') return stationArrival(ctx, s, p);
    }
  } else if (kind === 'question' && s.settings.questions) {
    const q = drawQuestion(ctx);
    s.question = { text: q.q, ...mcqOptions(q.a, q.w), endsAt: ctx.now + Q_MS, for: p.id };
    s.phase = 'question';
    return;
  }
  endTurn(s);
}

/** Everyone answered (or time is up): hand out cards and the step for the fastest. */
function revealQuiz(ctx: GameCtx, s: State) {
  const q = s.quiz!;
  const right = Object.entries(q.answers)
    .filter(([, a]) => a.choice === q.correct)
    .sort((x, y) => x[1].at - y[1].at)
    .map(([id]) => id);
  q.revealed = true;
  q.results = s.players.map((p) => ({ id: p.id, correct: right.includes(p.id), first: right[0] === p.id }));
  q.endsAt = ctx.now + (s.players.some((p) => !ctx.isBot(p.id)) ? REVEAL_MS : BOTS_REVEAL_MS);
  for (const id of right) {
    const p = s.players.find((x) => x.id === id);
    if (p) draw(s, p);
  }
  const first = s.players.find((p) => p.id === right[0]);
  if (first) {
    step(first, 1, false); // a bonus step never lands on a station (arriving there needs a roll)
    s.feed.push(`${ctx.playerName(first.id)} أسرع إجابة صحيحة — خطوة إلى الأمام وبطاقة زاد`, { by: first.id });
  } else s.feed.push('لم يُجب أحد صحيحاً');
  // no shared sound: each phone plays «correct» or «wrong» for its own player (see hajj.tsx)
}

export const hajj: GameModule<State, HajjSettings> = {
  turnOf: (s) => s.phase === 'roll' ? [cur(s).id] : s.phase === 'question' && s.question ? [s.question.for] : [],
  id: 'hajj',

  start(ctx, participants, settings) {
    ctx.fx('start');
    const s: State = {
      settings,
      players: shuffle(participants).map((id) => ({ id, pos: 0, hand: [], since: 0, seen: 0 })),
      turnIdx: 0,
      phase: 'roll',
      dice: null,
      rollId: 0,
      landing: null,
      card: null,
      cardN: 0,
      question: null,
      quiz: null,
      reached: [],
      events: shuffle(HAJJ_EVENTS),
      zadDeck: deck(),
      zadN: 0,
      mods: freshMods(),
      played: null,
      playedN: 0,
      winner: null,
      feed: new Feed(),
      moves: 0,
      clock: 0,
      botAt: -1,
      botCard: null,
    };
    for (const p of s.players) draw(s, p); // everyone sets off with one provision
    return s;
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    stamp(s);
    if (a.type === 'quiz') {
      const q = s.quiz;
      if (s.phase !== 'quiz' || !q || q.revealed || q.answers[by] || !s.players.some((p) => p.id === by)) return;
      if (!isNum(a.choice) || a.choice < 0 || a.choice >= q.options.length) return;
      q.answers[by] = { choice: a.choice, at: ctx.now };
      const waiting = s.players.filter((p) => !q.answers[p.id] && (ctx.isConnected(p.id) || ctx.isBot(p.id)));
      if (!waiting.length) revealQuiz(ctx, s);
      return;
    }
    const p = cur(s);
    if (!p || p.id !== by) throw new GameError('ماشي دورك');

    if (a.type === 'play' && s.phase === 'roll') {
      if (s.mods.played) throw new GameError('بطاقة واحدة في كل دور');
      const i = p.hand.findIndex((c) => c.id === a.card);
      if (i < 0) return;
      const kind = p.hand[i].kind;
      if (ZAD_INFO[kind].auto) throw new GameError('«الصبر» يُستعمل وحده عند التأخير');
      let target: string | null = null;
      if (kind === 'sadaqa') {
        const friend = isStr(a.target) ? s.players.find((x) => x.id === a.target && x.id !== by) : undefined;
        if (!friend) throw new GameError('اختر الحاج الذي تتصدّق عليه');
        target = friend.id;
        // both step on, but never onto a station (that needs a roll)
        for (const x of [p, friend]) if (nextStation(x.pos) - x.pos > 1) x.pos += 1;
      }
      p.hand.splice(i, 1);
      s.mods.played = true;
      if (kind === 'talbiya') s.mods.bonus += 2;
      if (kind === 'dalil') s.mods.pass = true;
      if (kind === 'zamzam') s.mods.again = true;
      s.played = { by, kind, target, id: ++s.playedN };
      s.feed.push(`${ctx.playerName(by)} استعمل «${ZAD_INFO[kind].title}»${target ? ` مع ${ctx.playerName(target)}` : ''}`, { by });
      ctx.fx('card', by);
      return;
    }

    if (a.type === 'roll' && s.phase === 'roll') {
      const d = 1 + Math.floor(Math.random() * 6);
      s.dice = d;
      s.rollId += 1;
      s.moves += 1;
      const first = nextStation(p.pos);
      const stop = s.mods.pass && first < LAST ? nextStation(first) : first;
      const from = p.pos;
      p.pos = Math.min(stop, p.pos + d + s.mods.bonus);
      if (s.mods.pass && p.pos > first) {
        const passed = HAJJ_STATIONS[hajjStationAt(first)];
        s.feed.push(`${ctx.playerName(by)} مرّ بـ${passed.title} مع الدليل`, { by });
      }
      s.landing = p.pos;
      if (p.pos === from) s.landing = null;
      ctx.fx('tick', by);
      arrive(ctx, s, p);
      return;
    }

    if (a.type === 'answer' && s.phase === 'question' && s.question && isNum(a.choice)) {
      const q = s.question;
      s.moves += 1;
      if (a.choice === q.correct) {
        step(p);
        const got = draw(s, p);
        card(s, by, {
          kind: 'right',
          title: 'إجابة صحيحة!',
          text: `«${q.options[q.correct]}» — تقدّم خطوة${got ? ` وخذ بطاقة «${ZAD_INFO[got].title}»` : ''}.`,
        });
        s.feed.push(`${ctx.playerName(by)} أجاب صحيحاً`, { by });
        ctx.fx('correct', by);
      } else {
        card(s, by, { kind: 'wrong', title: 'إجابة خاطئة', text: `الجواب الصحيح: «${q.options[q.correct]}».` });
        ctx.fx('buzz', by);
      }
      s.question = null;
      if (hajjSquare(p.pos) === 'station' && a.choice === q.correct) return stationArrival(ctx, s, p);
      endTurn(s);
    }
  },

  tick(ctx, s) {
    stamp(s);
    if (s.phase === 'quiz' && s.quiz && ctx.now >= s.quiz.endsAt) {
      if (!s.quiz.revealed) revealQuiz(ctx, s);
      else endTurn(s);
      return true;
    }
    if (s.phase !== 'question' || !s.question || ctx.now < s.question.endsAt) return false;
    const q = s.question;
    card(s, q.for, { kind: 'wrong', title: 'انتهى الوقت', text: `الجواب الصحيح: «${q.options[q.correct]}».` });
    s.moves += 1;
    s.question = null;
    endTurn(s);
    return true;
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'final') return;
    // everyone answers the station question
    if (s.phase === 'quiz' && s.quiz && !s.quiz.revealed) {
      const q = s.quiz;
      for (const b of bots) {
        if (q.answers[b] || !s.players.some((p) => p.id === b)) continue;
        const wrong = [...q.options.keys()].filter((k) => k !== q.correct);
        const choice = Math.random() < BOT_SKILL ? q.correct : wrong[Math.floor(Math.random() * wrong.length)];
        ctx.bot(b, `quiz:${s.reached.length}`, randDelay(2500, 9000), { type: 'quiz', choice });
      }
      return;
    }
    const p = cur(s);
    if (!p || !bots.includes(p.id)) return;
    if (s.phase === 'roll') {
      if (s.botAt !== s.moves) {
        // decide once per turn whether to play a card first
        s.botAt = s.moves;
        s.botCard = null;
        const dist = nextStation(p.pos) - p.pos;
        const has = (k: ZadKind) => p.hand.find((c) => c.kind === k);
        const pickCard =
          (dist <= 3 && nextStation(p.pos) < LAST && has('dalil')) ||
          (dist >= 3 && has('talbiya')) ||
          (Math.random() < 0.4 && has('zamzam')) ||
          (Math.random() < 0.3 && dist > 2 && has('sadaqa'));
        s.botCard = pickCard ? pickCard.id : null;
      }
      if (s.botCard !== null && !s.mods.played) {
        const c = p.hand.find((x) => x.id === s.botCard);
        const others = s.players.filter((x) => x.id !== p.id);
        const last = [...others].sort((x, y) => x.pos - y.pos)[0];
        if (c) {
          ctx.bot(p.id, `play:${s.moves}`, randDelay(1200, 2000), { type: 'play', card: c.id, target: c.kind === 'sadaqa' ? last?.id : undefined });
          return;
        }
      }
      ctx.bot(p.id, `roll:${s.moves}:${s.mods.played ? 1 : 0}`, randDelay(2600, 3400), { type: 'roll' });
    } else if (s.phase === 'question' && s.question) {
      const q = s.question;
      const wrong = [...q.options.keys()].filter((k) => k !== q.correct);
      const choice = Math.random() < BOT_SKILL ? q.correct : wrong[Math.floor(Math.random() * wrong.length)];
      ctx.bot(p.id, `ans:${s.moves}`, randDelay(3500, 6000), { type: 'answer', choice });
    }
  },

  view(ctx, s, me): HajjView {
    const mine = s.players.find((p) => p.id === me);
    const q = s.quiz;
    return {
      game: 'hajj',
      phase: s.phase,
      players: s.players.map((p) => ({ id: p.id, pos: p.pos, hand: p.hand.length, shield: p.hand.some((c) => c.kind === 'sabr') })),
      turn: cur(s)?.id ?? '',
      dice: s.dice,
      rollId: s.rollId,
      landing: s.landing,
      card: s.card,
      question: s.question ? { text: s.question.text, options: s.question.options, endsAt: s.question.endsAt, for: s.question.for } : null,
      quiz: q
        ? {
            station: q.station,
            text: q.text,
            options: q.options,
            endsAt: q.endsAt,
            answered: Object.keys(q.answers),
            myAnswer: q.answers[me]?.choice ?? null,
            correct: q.revealed ? q.correct : null,
            results: q.results,
          }
        : null,
      myHand: mine?.hand ?? [],
      played: s.played,
      mods: s.mods,
      winner: s.winner,
      order: s.phase === 'final' ? hajjOrder(s) : null,
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
    if (s.players.length === 1) return win(ctx, s, s.players[0].id);
    if (s.phase === 'quiz' && s.quiz && !s.quiz.revealed) {
      const q = s.quiz;
      if (!s.players.some((p) => !q.answers[p.id] && (ctx.isConnected(p.id) || ctx.isBot(p.id)))) revealQuiz(ctx, s);
    }
    if (wasTurn) {
      s.turnIdx = (s.turnIdx - 1 + s.players.length) % s.players.length;
      s.mods = freshMods();
      endTurn(s);
    }
  },
};
