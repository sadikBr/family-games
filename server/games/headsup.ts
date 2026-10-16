import type { CategoryInfo, HeadsUpSettings, HeadsUpView } from '../../src/shared/protocol';
import { HEADSUP_CATEGORIES, type WordCategory } from '../content';
import type { GameCtx, GameModule } from '../types';
import { Deck, isNum, pick, shuffle } from '../util';

const COUNTDOWN_MS = 3500;

interface State {
  settings: HeadsUpSettings;
  phase: HeadsUpView['phase'];
  participants: string[];
  turnOrder: string[];
  turn: number; // index into turnOrder
  category: WordCategory;
  endsAt: number | null;
  card: { index: number; word: string } | null;
  cardCounter: number;
  history: { word: string; ok: boolean }[];
  scores: Record<string, number>;
}

function deckFor(ctx: GameCtx, cat: WordCategory): Deck<string> {
  const key = `headsup:${cat.key}`;
  let deck = ctx.memo.get(key) as Deck<string> | undefined;
  if (!deck) {
    deck = new Deck(cat.words);
    ctx.memo.set(key, deck);
  }
  return deck;
}

function chooseCategory(s: State): WordCategory {
  return HEADSUP_CATEGORIES.find((c) => c.key === s.settings.category) ?? pick(HEADSUP_CATEGORIES);
}

function drawCard(ctx: GameCtx, s: State) {
  s.cardCounter += 1;
  s.card = { index: s.cardCounter, word: deckFor(ctx, s.category).draw() };
}

function goToTurn(ctx: GameCtx, s: State, turn: number) {
  // skip players who are not connected anymore
  let t = turn;
  while (t < s.turnOrder.length && !ctx.isConnected(s.turnOrder[t])) t++;
  if (t >= s.turnOrder.length) {
    s.phase = 'final';
    s.endsAt = null;
    s.card = null;
    ctx.fx('win');
    return;
  }
  s.turn = t;
  s.phase = 'ready';
  s.history = [];
  s.card = null;
  s.endsAt = null;
  s.category = chooseCategory(s);
}

function endTurn(ctx: GameCtx, s: State) {
  s.phase = 'turnEnd';
  s.endsAt = null;
  s.card = null;
  ctx.fx('buzz');
}

export const headsup: GameModule<State, HeadsUpSettings> = {
  id: 'headsup',
  hostOnly: ['endTurn'],

  start(ctx, participants, settings) {
    const base = shuffle(participants);
    const turnOrder: string[] = [];
    for (let i = 0; i < Math.max(1, settings.turnsEach); i++) turnOrder.push(...base);
    const s: State = {
      settings,
      phase: 'ready',
      participants,
      turnOrder,
      turn: 0,
      category: HEADSUP_CATEGORIES[0],
      endsAt: null,
      card: null,
      cardCounter: 0,
      history: [],
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
    };
    goToTurn(ctx, s, 0);
    return s;
  },

  act(ctx, s, by, a) {
    const guesser = s.turnOrder[s.turn];
    switch (a.type) {
      case 'start': {
        if (s.phase !== 'ready') return;
        s.phase = 'countdown';
        s.endsAt = ctx.now + COUNTDOWN_MS;
        ctx.fx('start');
        return;
      }
      case 'mark': {
        if (s.phase !== 'play' || !s.card || !s.participants.includes(by)) return;
        if (!isNum(a.index) || a.index !== s.card.index) return; // stale tap from another phone
        const ok = a.ok === true;
        s.history.push({ word: s.card.word, ok });
        if (ok) s.scores[guesser] = (s.scores[guesser] ?? 0) + 1;
        ctx.fx(ok ? 'correct' : 'skip');
        drawCard(ctx, s);
        return;
      }
      case 'endTurn': {
        if (s.phase === 'play' || s.phase === 'countdown') endTurn(ctx, s);
        return;
      }
      case 'next': {
        if (s.phase !== 'turnEnd') return;
        goToTurn(ctx, s, s.turn + 1);
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'countdown') {
      s.phase = 'play';
      s.endsAt = ctx.now + s.settings.seconds * 1000;
      drawCard(ctx, s);
      return true;
    }
    if (s.phase === 'play') {
      endTurn(ctx, s);
      return true;
    }
    return false;
  },

  view(ctx, s): HeadsUpView {
    const category: CategoryInfo = {
      key: s.category.key,
      label: s.category.label,
      emoji: s.category.emoji,
    };
    return {
      game: 'headsup',
      phase: s.phase,
      participants: s.participants,
      guesserId: s.turnOrder[s.turn],
      turn: s.turn + 1,
      totalTurns: s.turnOrder.length,
      category,
      endsAt: s.endsAt,
      card: s.card,
      history: s.history,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, id) {
    s.participants = s.participants.filter((p) => p !== id);
    const current = s.turnOrder[s.turn];
    const before = s.turnOrder.slice(0, s.turn).filter((p) => p !== id).length;
    s.turnOrder = s.turnOrder.filter((p) => p !== id);
    if (current === id && s.phase !== 'final') {
      goToTurn(ctx, s, before);
    } else {
      s.turn = before;
    }
  },
};
