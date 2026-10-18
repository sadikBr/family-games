/**
 * «الكذّاب» — the bluffing card game with the 40-card Spanish deck.
 * All cards are dealt. The first player of a pile plays 1–4 cards face down and names a rank;
 * after that everyone must claim the same rank (truthfully or not) or pass.
 * Anyone may shout «كذّاب!» about the last play, until the next play is made:
 *   - if the cards were not all of the named rank, the liar takes the whole pile;
 *   - if they were, the caller takes it.
 * If everybody passes, the pile is put aside and the last player to play starts a new one.
 * Empty your hand (and survive the last challenge) to win.
 */
import { RANKS, sortHand, type Card } from '../../src/shared/cards';
import type { KdabSettings, KdabView } from '../../src/shared/protocol';
import { Feed, freshDeck, randDelay } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';

const FINISH_MS = 5000; // time others get to challenge a player's last cards
/** the cards shown by a «كذّاب!» stay face up at least this long, even if someone plays meanwhile */
export const REVEAL_MS = 4500;
const RANK_NAME: Record<number, string> = { 1: 'الآس', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 10: 'الخادم', 11: 'الفارس', 12: 'الملك' };
const rankText = (r: number, n = 2) => (r <= 7 && r !== 1 ? `${n === 1 ? '' : `${n} × `}${r}` : `${n === 1 ? '' : `${n} × `}${RANK_NAME[r]}`);

interface Play {
  id: number;
  by: string;
  cards: Card[];
  rank: number;
}

interface State {
  settings: KdabSettings;
  order: string[];
  hands: Record<string, Card[]>;
  turnIdx: number;
  pile: Card[];
  rank: number | null;
  last: Play | null;
  called: boolean; // the last play was already challenged
  passes: number; // consecutive passes since the last play
  playN: number;
  reveal: KdabView['reveal'];
  revealN: number;
  revealUntil: number;
  finishing: { id: string; until: number } | null;
  winner: string | null;
  phase: KdabView['phase'];
  feed: Feed;
  moves: number;
  botPlans: Record<string, number>; // bot → play id already judged for a challenge
}

const cur = (s: State) => s.order[s.turnIdx];
const active = (s: State) => s.order.filter((id) => s.hands[id].length > 0 || s.finishing?.id === id);

function nextTurn(s: State, from = s.turnIdx) {
  for (let k = 1; k <= s.order.length; k++) {
    const i = (from + k) % s.order.length;
    if (s.hands[s.order[i]].length > 0) {
      s.turnIdx = i;
      return;
    }
  }
}

function finishWin(ctx: GameCtx, s: State, id: string) {
  s.finishing = null;
  s.winner = id;
  s.phase = 'final';
  s.feed.push(`${ctx.playerName(id)} تخلّص من كل أوراقه!`, { by: id });
  ctx.say?.(`الفوز لـ${ctx.playerName(id)}: لا أوراق باقية!`, id);
  ctx.fx('win', id);
}

/** Settle a pending "last cards" once the challenge window has passed or another play is made. */
function settleFinishing(ctx: GameCtx, s: State) {
  if (s.finishing && !s.called) finishWin(ctx, s, s.finishing.id);
}

function challenge(ctx: GameCtx, s: State, caller: string) {
  const play = s.last!;
  const truthful = play.cards.every((c) => c.rank === play.rank);
  const taker = truthful ? caller : play.by;
  s.hands[taker].push(...s.pile);
  s.reveal = { id: ++s.revealN, caller, player: play.by, cards: play.cards, truthful, taker };
  s.revealUntil = ctx.now + REVEAL_MS;
  ctx.say?.(
    truthful
      ? `«كذّاب!» من ${ctx.playerName(caller)} في غير محلّه — الكومة لـ${ctx.playerName(caller)}`
      : `«كذّاب!» من ${ctx.playerName(caller)} في محلّه — الكومة لـ${ctx.playerName(play.by)}`,
    caller,
  );
  s.feed.push(
    truthful ? `${ctx.playerName(caller)} قال «كذّاب» — لكن ${ctx.playerName(play.by)} كان صادقاً! ${ctx.playerName(caller)} يأخذ الكومة` : `${ctx.playerName(caller)} كشف ${ctx.playerName(play.by)}! الكذّاب يأخذ الكومة`,
    { by: caller },
  );
  ctx.fx(truthful ? 'buzz' : 'correct', caller);
  s.pile = [];
  s.rank = null;
  s.called = true;
  s.passes = 0;
  // the one who did not take the pile starts the next pile
  const starter = truthful ? play.by : caller;
  if (s.finishing?.id === play.by && truthful) {
    finishWin(ctx, s, play.by);
    return;
  }
  s.finishing = null;
  const si = s.order.indexOf(starter);
  if (s.hands[starter].length > 0) s.turnIdx = si;
  else nextTurn(s, si);
}

export const kdab: GameModule<State, KdabSettings> = {
  turnOf: (s) => s.phase === 'play' ? [cur(s)] : [],
  id: 'kdab',

  start(ctx, participants, settings) {
    const order = shuffle(participants);
    const deck = shuffle(freshDeck());
    const hands: Record<string, Card[]> = Object.fromEntries(order.map((id) => [id, []]));
    deck.forEach((c, i) => hands[order[i % order.length]].push(c));
    ctx.fx('start');
    return {
      settings,
      order,
      hands,
      turnIdx: 0,
      pile: [],
      rank: null,
      last: null,
      called: false,
      passes: 0,
      playN: 0,
      reveal: null,
      revealN: 0,
      revealUntil: 0,
      finishing: null,
      winner: null,
      phase: 'play',
      feed: new Feed(),
      moves: 0,
      botPlans: {},
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play' || !s.order.includes(by)) return;

    if (a.type === 'call') {
      // a call names the play it judges: if another play came in meanwhile, it is stale
      if (isNum(a.play) && s.last && a.play !== s.last.id) return;
      if (!s.last || s.called || s.last.by === by) throw new GameError('لا يوجد ما تكشفه الآن');
      s.moves += 1;
      challenge(ctx, s, by);
      return;
    }

    if (cur(s) !== by) throw new GameError('ليس دورك');

    if (a.type === 'pass') {
      if (s.rank === null) throw new GameError('أنت تبدأ الكومة — العب ورقة على الأقل');
      s.moves += 1;
      s.passes += 1;
      s.feed.push(`${ctx.playerName(by)} مرّر`, { by });
      ctx.say?.(`تمرير: ${ctx.playerName(by)}`, by);
      const others = active(s).filter((id) => id !== s.last?.by).length;
      if (s.passes >= others) {
        // everybody passed: the pile goes away and the last player to play starts afresh
        settleFinishing(ctx, s);
        if ((s.phase as KdabView['phase']) === 'final') return;
        s.feed.push('مرّر الجميع — تُبعَد الكومة', {});
        ctx.say?.(`مرّر الجميع — تُبعَد الكومة، والبداية لـ${ctx.playerName(s.last!.by)}`);
        s.pile = [];
        s.rank = null;
        s.passes = 0;
        s.called = true;
        const li = s.order.indexOf(s.last!.by);
        if (s.hands[s.last!.by].length > 0) s.turnIdx = li;
        else nextTurn(s, li);
      } else nextTurn(s);
      return;
    }

    if (a.type === 'play') {
      const ids = Array.isArray(a.cards) ? [...new Set(a.cards.filter(isStr))] : [];
      if (!ids.length || ids.length > s.settings.maxPlay) throw new GameError(`العب من 1 إلى ${s.settings.maxPlay} أوراق`);
      const hand = s.hands[by];
      const cards = ids.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => !!c);
      if (cards.length !== ids.length) return;
      const rank = s.rank ?? (isNum(a.rank) && RANKS.includes(a.rank) ? a.rank : null);
      if (rank === null) throw new GameError('اختر الرقم الذي تدّعيه');
      // a new play closes the window for challenging the previous one
      settleFinishing(ctx, s);
      if ((s.phase as KdabView['phase']) === 'final') return;
      s.hands[by] = hand.filter((c) => !ids.includes(c.id));
      s.pile.push(...cards);
      s.rank = rank;
      s.last = { id: ++s.playN, by, cards, rank };
      s.called = false;
      s.passes = 0;
      // a reveal stays a moment longer, so the play right after a «كذّاب!» does not hide it
      if (s.reveal && ctx.now >= s.revealUntil) s.reveal = null;
      s.moves += 1;
      s.feed.push(`${ctx.playerName(by)}: «${rankText(rank, cards.length)}»`, { by });
      ctx.say?.(`${cards.length === 1 ? 'ورقة' : cards.length === 2 ? 'ورقتان' : `${cards.length} أوراق`} من ${ctx.playerName(by)}: «${RANK_NAME[rank]}»`, by);
      ctx.fx('card', by);
      if (s.hands[by].length === 0) s.finishing = { id: by, until: ctx.now + FINISH_MS };
      nextTurn(s);
      if (s.finishing && !active(s).some((id) => id !== by && s.hands[id].length > 0)) finishWin(ctx, s, by);
    }
  },

  tick(ctx, s) {
    // hide an old reveal once a new play has been made and its time is up
    if (s.phase === 'play' && s.reveal && !s.called && ctx.now >= s.revealUntil) {
      s.reveal = null;
      return true;
    }
    if (s.phase !== 'play' || !s.finishing || ctx.now < s.finishing.until) return false;
    if (!s.called) finishWin(ctx, s, s.finishing.id);
    else s.finishing = null;
    return true;
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    // challenges: each bot judges each play once
    if (s.last && !s.called) {
      const play = s.last;
      for (const b of bots) {
        if (b === play.by || s.botPlans[b] === play.id) continue;
        s.botPlans[b] = play.id;
        const mine = s.hands[b].filter((c) => c.rank === play.rank).length;
        const impossible = mine + play.cards.length > 4;
        const lastCards = s.finishing?.id === play.by;
        const p = impossible ? 1 : lastCards ? 0.55 : play.cards.length >= 3 ? 0.3 : 0.1;
        if (Math.random() < p) ctx.bot(b, `call:${play.id}`, randDelay(1200, 2600), { type: 'call', play: play.id });
      }
    }
    const me = cur(s);
    if (!bots.includes(me) || s.hands[me].length === 0) return;
    const hand = s.hands[me];
    const key = `t:${s.moves}`;
    const wait = randDelay(1500, 2500); // give people a moment to shout «كذّاب»
    if (s.rank === null) {
      // start a pile with the rank we hold most of (truthfully), sometimes slipping in one extra card
      const counts = new Map<number, Card[]>();
      for (const c of hand) counts.set(c.rank, [...(counts.get(c.rank) ?? []), c]);
      const [rank, cards] = [...counts.entries()].sort((x, y) => y[1].length - x[1].length)[0];
      const play = cards.slice(0, s.settings.maxPlay);
      const extra = hand.find((c) => c.rank !== rank);
      if (extra && play.length < s.settings.maxPlay && Math.random() < 0.25) play.push(extra);
      ctx.bot(me, key, wait, { type: 'play', cards: play.map((c) => c.id), rank });
      return;
    }
    const matching = hand.filter((c) => c.rank === s.rank);
    if (matching.length) {
      const play = matching.slice(0, s.settings.maxPlay);
      const extra = hand.find((c) => c.rank !== s.rank);
      if (extra && play.length < s.settings.maxPlay && Math.random() < 0.2) play.push(extra);
      ctx.bot(me, key, wait, { type: 'play', cards: play.map((c) => c.id) });
    } else if (Math.random() < 0.5 || hand.length <= 2) {
      const n = Math.min(hand.length, Math.random() < 0.7 ? 1 : 2);
      ctx.bot(me, key, wait, { type: 'play', cards: shuffle(hand).slice(0, n).map((c) => c.id) });
    } else ctx.bot(me, key, wait, { type: 'pass' });
  },

  view(ctx, s, me): KdabView {
    return {
      game: 'kdab',
      phase: s.phase,
      order: s.order,
      turn: cur(s),
      myHand: sortHand(s.hands[me] ?? []),
      handCounts: Object.fromEntries(s.order.map((id) => [id, s.hands[id].length])),
      pileCount: s.pile.length,
      rank: s.rank,
      last: s.last ? { id: s.last.id, by: s.last.by, count: s.last.cards.length, rank: s.last.rank } : null,
      canCall: !!s.last && !s.called && s.last.by !== me,
      reveal: s.reveal,
      finishing: s.finishing,
      winner: s.winner,
      feed: s.feed.list(),
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase !== 'play' || !s.order.includes(id)) return;
    const wasTurn = cur(s) === id;
    const i = s.order.indexOf(id);
    s.order.splice(i, 1);
    delete s.hands[id];
    if (i < s.turnIdx) s.turnIdx -= 1;
    if (s.order.length < 2) {
      if (s.order[0]) finishWin(ctx, s, s.order[0]);
      return;
    }
    if (s.last?.by === id) s.called = true;
    if (wasTurn) nextTurn(s, s.turnIdx - 1);
    s.turnIdx %= s.order.length;
  },
};
