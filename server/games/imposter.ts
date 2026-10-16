import type { ImposterResult, ImposterSettings, ImposterView } from '../../src/shared/protocol';
import { IMPOSTER_HINTS } from '../bot-content';
import { IMPOSTER_CATEGORIES, type WordCategory } from '../content';
import { GameError, type GameCtx, type GameModule } from '../types';
import { Deck, isStr, pick, shuffle } from '../util';

interface State {
  settings: ImposterSettings;
  phase: ImposterView['phase'];
  round: number;
  participants: string[];
  category: WordCategory;
  word: string;
  imposters: string[];
  ready: Set<string>;
  order: string[];
  votes: Map<string, string>;
  guesserId: string | null;
  guessOptions: string[] | null;
  result: ImposterResult | null;
  scores: Record<string, number>;
  botClues: Record<string, string>;
}

function deckFor(ctx: GameCtx, cat: WordCategory): Deck<string> {
  const key = `imposter:${cat.key}`;
  let deck = ctx.memo.get(key) as Deck<string> | undefined;
  if (!deck) {
    deck = new Deck(cat.words);
    ctx.memo.set(key, deck);
  }
  return deck;
}

function newRound(ctx: GameCtx, s: State) {
  const cat =
    IMPOSTER_CATEGORIES.find((c) => c.key === s.settings.category) ?? pick(IMPOSTER_CATEGORIES);
  s.category = cat;
  s.word = deckFor(ctx, cat).draw();
  const n = s.participants.length;
  const auto = n >= 7 ? 2 : 1;
  const count = Math.max(1, Math.min(s.settings.imposters || auto, Math.floor((n - 1) / 2)));
  s.imposters = shuffle(s.participants).slice(0, count);
  // clue order: random, but a civilian always starts (starting is hard for the imposter)
  const order = shuffle(s.participants);
  const firstCivilian = order.findIndex((id) => !s.imposters.includes(id));
  s.order = [...order.slice(firstCivilian), ...order.slice(0, firstCivilian)];
  s.ready = new Set();
  s.votes = new Map();
  s.guesserId = null;
  s.guessOptions = null;
  s.result = null;
  s.phase = 'reveal';
  s.round += 1;
  s.botClues = {};
  const used = new Set<string>();
  for (const id of s.participants) if (ctx.isBot(id)) s.botClues[id] = botClue(s, id, used);
  ctx.fx('start');
}

/** A one-word clue for a bot. Imposter bots bluff with a clue for a similar word. */
function botClue(s: State, id: string, used: Set<string>): string {
  let pool: string[];
  if (!s.imposters.includes(id)) {
    pool = IMPOSTER_HINTS[s.word] ?? [];
  } else {
    const cat = s.settings.hintForImposter ? s.category : pick(IMPOSTER_CATEGORIES);
    const other = pick(cat.words.filter((w) => w !== s.word));
    pool = IMPOSTER_HINTS[other] ?? [];
  }
  const fresh = pool.filter((h) => !used.has(h));
  const clue = fresh.length ? pick(fresh) : pool.length ? pick(pool) : 'ممم';
  used.add(clue);
  return clue;
}

const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

function activeIds(ctx: GameCtx, s: State) {
  return s.participants.filter((id) => ctx.isConnected(id));
}

function finish(ctx: GameCtx, s: State, accused: string | null, guessed: string | null) {
  const caught = accused !== null && s.imposters.includes(accused);
  const guessCorrect = guessed === null ? null : guessed === s.word;
  const imposterWins = !caught || guessCorrect === true;
  if (imposterWins) {
    for (const id of s.imposters) s.scores[id] = (s.scores[id] ?? 0) + 2;
  } else {
    for (const id of s.participants) {
      if (!s.imposters.includes(id)) s.scores[id] = (s.scores[id] ?? 0) + 1;
    }
  }
  s.result = {
    votes: Object.fromEntries(s.votes),
    accused,
    imposters: s.imposters,
    word: s.word,
    caught,
    guessed,
    guessCorrect,
    winners: imposterWins ? 'imposters' : 'civilians',
  };
  s.phase = 'result';
  ctx.fx('reveal');
}

function resolveVotes(ctx: GameCtx, s: State) {
  const tally = new Map<string, number>();
  for (const t of s.votes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
  let max = 0;
  let top: string[] = [];
  for (const [id, c] of tally) {
    if (c > max) {
      max = c;
      top = [id];
    } else if (c === max) top.push(id);
  }
  const accused = top.length === 1 ? top[0] : null;
  if (accused && s.imposters.includes(accused)) {
    // caught! give the imposter one last chance to guess the word
    const others = shuffle(s.category.words.filter((w) => w !== s.word)).slice(0, 5);
    s.guessOptions = shuffle([s.word, ...others]);
    s.guesserId = accused;
    s.phase = 'guess';
    ctx.fx('buzz', accused);
    return;
  }
  finish(ctx, s, accused, null);
}

export const imposter: GameModule<State, ImposterSettings> = {
  id: 'imposter',
  hostOnly: ['skipReady', 'toVote', 'forceResolve', 'next'],

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      phase: 'reveal',
      round: 0,
      participants,
      category: IMPOSTER_CATEGORIES[0],
      word: '',
      imposters: [],
      ready: new Set(),
      order: [],
      votes: new Map(),
      guesserId: null,
      guessOptions: null,
      result: null,
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      botClues: {},
    };
    newRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    const isPlayer = s.participants.includes(by);
    switch (a.type) {
      case 'ready': {
        if (s.phase !== 'reveal' || !isPlayer) return;
        s.ready.add(by);
        if (activeIds(ctx, s).every((id) => s.ready.has(id))) {
          s.phase = 'clues';
          ctx.fx('start');
        }
        return;
      }
      case 'skipReady': {
        if (s.phase === 'reveal') s.phase = 'clues';
        return;
      }
      case 'toVote': {
        if (s.phase === 'clues') {
          s.phase = 'vote';
          ctx.fx('tick');
        }
        return;
      }
      case 'vote': {
        if (s.phase !== 'vote' || !isPlayer) return;
        const target = a.target;
        if (!isStr(target) || target === by || !s.participants.includes(target)) {
          throw new GameError('لا يمكنك التصويت على نفسك');
        }
        s.votes.set(by, target);
        if (activeIds(ctx, s).every((id) => s.votes.has(id))) resolveVotes(ctx, s);
        return;
      }
      case 'forceResolve': {
        if (s.phase === 'vote') resolveVotes(ctx, s);
        return;
      }
      case 'guess': {
        if (s.phase !== 'guess' || by !== s.guesserId || !isStr(a.word)) return;
        finish(ctx, s, s.guesserId, a.word);
        return;
      }
      case 'next': {
        if (s.phase === 'result') newRound(ctx, s);
        return;
      }
    }
  },

  view(ctx, s, me): ImposterView {
    const isImposter = s.imposters.includes(me);
    const inGame = s.participants.includes(me);
    return {
      game: 'imposter',
      phase: s.phase,
      round: s.round,
      participants: s.participants,
      secret: !inGame
        ? null
        : isImposter
          ? {
              role: 'imposter',
              category: s.settings.hintForImposter ? s.category.label : null,
              partners: s.imposters.filter((id) => id !== me),
            }
          : { role: 'civilian', word: s.word, category: s.category.label },
      ready: [...s.ready],
      order: s.order,
      voted: [...s.votes.keys()],
      myVote: s.votes.get(me) ?? null,
      guessOptions: me === s.guesserId ? s.guessOptions : null,
      guesserId: s.guesserId,
      botClues: s.phase === 'reveal' ? {} : s.botClues,
      result: s.result,
      scores: s.scores,
    };
  },

  botPlan(ctx, s, bots) {
    for (const bot of bots) {
      if (!s.participants.includes(bot)) continue;
      const isImp = s.imposters.includes(bot);
      if (s.phase === 'reveal' && !s.ready.has(bot)) {
        ctx.bot(bot, `ready:${s.round}`, rand(1200, 3500), { type: 'ready' });
      }
      if (s.phase === 'vote' && !s.votes.has(bot)) {
        const others = s.participants.filter((id) => id !== bot);
        const civilians = others.filter((id) => !s.imposters.includes(id));
        const impostersLeft = others.filter((id) => s.imposters.includes(id));
        // civilian bots have a little "intuition"; imposter bots blame a civilian
        const target = isImp
          ? pick(civilians.length ? civilians : others)
          : impostersLeft.length && Math.random() < 0.35
            ? pick(impostersLeft)
            : pick(others);
        ctx.bot(bot, `vote:${s.round}`, rand(2500, 6000), { type: 'vote', target });
      }
      if (s.phase === 'guess' && s.guesserId === bot && s.guessOptions) {
        const word = Math.random() < 0.35 ? s.word : pick(s.guessOptions);
        ctx.bot(bot, `guess:${s.round}`, rand(2500, 4500), { type: 'guess', word });
      }
    }
  },

  onLeave(ctx, s, id) {
    s.participants = s.participants.filter((p) => p !== id);
    s.order = s.order.filter((p) => p !== id);
    s.votes.delete(id);
  },
};
