import { IMPOSTER_ANSWER_MAX, type BotLevel, type ImposterResult, type ImposterSettings, type ImposterView } from '../../src/shared/protocol';
import { IMPOSTER_HINTS } from '../bot-content';
import { IMPOSTER_CATEGORIES, type WordCategory } from '../content';
import { botAnswer, misfit } from '../ai/imposter-question';
import { civilianClue, guessCategories, imposterClue, rankGuesses, suspicion, tieHash } from '../ai/social-imposter';
import { IMPOSTER_QUESTIONS, type ImposterQuestion, type ImposterQuestionPair } from '../content-imposter-questions';
import { traitPool } from '../imposter-traits';
import { botLevel, GameError, type GameCtx, type GameModule } from '../types';
import { Deck, isStr, pick, shuffle } from '../util';
import { PVOICE, voiceAnd, voiceFinal, voiceOnly } from '../voice-calls-party';

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
  guessEndsAt: number | null;
  result: ImposterResult | null;
  scores: Record<string, number>;
  botClues: Record<string, string>;
  /** «سؤال مختلف»: the real question (everyone else's) and the imposters' */
  realQ: ImposterQuestion | null;
  impQ: ImposterQuestion | null;
  answers: Map<string, string>;
  answerEndsAt: number | null;
}

const isQuestionMode = (s: State) => s.settings.mode === 'question';
const answerMs = (s: State) => (s.settings.answerSeconds || 60) * 1000;

function questionDeck(ctx: GameCtx): Deck<ImposterQuestionPair> {
  let deck = ctx.memo.get('imposter:questions') as Deck<ImposterQuestionPair> | undefined;
  if (!deck) {
    deck = new Deck(IMPOSTER_QUESTIONS);
    ctx.memo.set('imposter:questions', deck);
  }
  return deck;
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
  if (isQuestionMode(s)) {
    // either question of a pair can be the real one: both have answers of the same shape
    const pair = questionDeck(ctx).draw();
    const swap = Math.random() < 0.5;
    s.realQ = swap ? pair.imposter : pair.real;
    s.impQ = swap ? pair.real : pair.imposter;
    s.word = s.realQ.q;
  } else {
    const cat = IMPOSTER_CATEGORIES.find((c) => c.key === s.settings.category) ?? pick(IMPOSTER_CATEGORIES);
    s.category = cat;
    s.word = deckFor(ctx, cat).draw();
    s.realQ = null;
    s.impQ = null;
  }
  s.answers = new Map();
  s.answerEndsAt = null;
  const n = s.participants.length;
  const auto = n >= 7 ? 2 : 1;
  const count = Math.max(1, Math.min(s.settings.imposters || auto, Math.floor((n - 1) / 2)));
  s.imposters = shuffle(s.participants).slice(0, count);
  // clue order: random, but a civilian always starts (starting is hard for the imposter)
  const order = shuffle(s.participants);
  const firstCivilian = order.findIndex((id) => !s.imposters.includes(id));
  // («سؤال مختلف» has no clue order: a civilian first would give a hint there)
  s.order = isQuestionMode(s) ? order : [...order.slice(firstCivilian), ...order.slice(0, firstCivilian)];
  s.ready = new Set();
  s.votes = new Map();
  s.guesserId = null;
  s.guessOptions = null;
  s.guessEndsAt = null;
  s.result = null;
  s.phase = 'reveal';
  s.round += 1;
  s.botClues = {};
  if (isQuestionMode(s)) {
    // everyone reads their question and types an answer before the timer
    s.phase = 'answer';
    s.answerEndsAt = ctx.now + answerMs(s);
    ctx.fx('start');
    return;
  }
  const used = new Set<string>();
  const level = botLevel(ctx);
  if (level === 'easy') {
    for (const id of s.participants) if (ctx.isBot(id)) s.botClues[id] = botClue(s, id, used);
  } else {
    // in speaking order: each bot hears the bot clues said before its own
    for (const id of s.order) if (ctx.isBot(id)) s.botClues[id] = smartClue(s, id, used, level === 'expert' ? 1 : 3);
  }
  ctx.fx('start');
}

/** Seconds the caught imposter has for the last-chance guess. */
export const GUESS_MS = 25_000;

/**
 * A clue for a bot: a trait the secret word shares with a few other words of its category, so it
 * proves the bot knows the word without giving it away. Imposter bots bluff with a trait common to
 * many words of the category.
 */
function botClue(s: State, id: string, used: Set<string>): string {
  const imposter = s.imposters.includes(id);
  let pool = traitPool(s.category, s.word, imposter);
  if (!pool.length) {
    // a word without traits: the old one-word hints (an imposter borrows another word's)
    const others = s.category.words.filter((w) => w !== s.word && IMPOSTER_HINTS[w]?.length);
    pool = (imposter ? (others.length ? IMPOSTER_HINTS[pick(others)] : []) : IMPOSTER_HINTS[s.word]) ?? [];
  }
  const fresh = pool.filter((h) => !used.has(h));
  const clue = fresh.length ? pick(fresh) : pool.length ? pick(pool) : 'ممم';
  used.add(clue);
  return clue;
}

/**
 * Smart / expert clue (see ai/social-imposter): a civilian proves it knows the word without narrowing it
 * down to fewer than three words; an imposter says what a civilian would most likely say after the clues
 * it has heard (its partners' don't count), using the category only when its phone shows it.
 */
function smartClue(s: State, id: string, used: Set<string>, top: number): string {
  const imposter = s.imposters.includes(id);
  const before = s.order.slice(0, s.order.indexOf(id));
  const heard = before.filter((p) => s.botClues[p] && !(imposter && s.imposters.includes(p))).map((p) => s.botClues[p]);
  const clue = imposter
    ? imposterClue(s.settings.hintForImposter || s.settings.category !== 'random' ? s.category : null, heard, used, Math.random, top)
    : civilianClue(s.category, s.word, heard, used, Math.random, top);
  used.add(clue);
  return clue;
}

/** Who a smart / expert bot votes for, from the bot clues on screen (never from anyone's hidden role). */
function smartVote(s: State, bot: string, expert: boolean): string {
  const others = s.participants.filter((id) => id !== bot);
  const clues = Object.fromEntries(others.filter((id) => s.botClues[id]).map((id) => [id, s.botClues[id]]));
  const order = (m: Map<string, number>) =>
    [...m].sort((a, b) => b[1] - a[1] || tieHash(`${s.round}|${a[0]}`) - tieHash(`${s.round}|${b[0]}`)).map(([id]) => id);
  if (!s.imposters.includes(bot)) {
    const ranked = order(suspicion(s.category, s.word, others, clues, s.imposters.length));
    // smart: now and then follows a hunch instead
    return !expert && Math.random() < 0.25 ? pick(ranked.slice(0, 3)) : ranked[0];
  }
  // an imposter (and its partners, the same way) piles onto the civilian the others are most likely to
  // blame: it reads the clues as a civilian would with the word its own clue was built around
  const partners = s.imposters.filter((id) => id !== bot);
  const civ = others.filter((id) => !partners.includes(id));
  const heard = Object.entries(clues).filter(([id]) => !partners.includes(id)).map(([, c]) => c);
  const cat = s.settings.hintForImposter || s.settings.category !== 'random' ? s.category : guessCategories(heard)[0];
  if (!cat || !civ.length) return pick(civ.length ? civ : others);
  const guess = rankGuesses(cat, cat.words, heard)[0]?.w;
  if (!guess) return pick(civ);
  return order(suspicion(cat, guess, civ, clues, s.imposters.length))[0];
}

/**
 * «سؤال مختلف»: who a smart / expert bot votes for, from the answers on screen and the real question (shown
 * to everyone after the answers): the answer that fits it worst. An imposter bot has seen the real question
 * differ from its own by then: it spares the answers that fit its own question (likely partners) and piles
 * onto the civilian whose answer looks the oddest.
 */
function questionVote(s: State, bot: string, level: BotLevel): string {
  const others = s.participants.filter((id) => id !== bot);
  if (level === 'easy' || !s.realQ || !s.impQ) return pick(others);
  const real = s.realQ;
  const own = s.imposters.includes(bot) ? s.impQ : real;
  const ans = (id: string) => s.answers.get(id) ?? '';
  const score = (id: string) => misfit(real, ans(id));
  let pool = others;
  if (own !== real) {
    const partners = others.filter((id) => misfit(own, ans(id)) === 0 && score(id) > 0);
    pool = others.filter((id) => !partners.includes(id));
    if (!pool.length) pool = others;
  }
  const ranked = [...pool].sort((a, b) => score(b) - score(a) || tieHash(`${s.round}|${bot}|${a}`) - tieHash(`${s.round}|${bot}|${b}`));
  // smart: now and then follows a hunch instead
  return level === 'smart' && Math.random() < 0.25 ? pick(ranked.slice(0, 3)) : ranked[0];
}

/** «سؤال مختلف»: every answer on screen at once ('' for none), then the real question for everyone. */
function revealAnswers(ctx: GameCtx, s: State) {
  for (const id of s.participants) if (!s.answers.has(id)) s.answers.set(id, '');
  s.phase = 'answers';
  s.answerEndsAt = null;
  ctx.fx('reveal');
  voiceOnly(ctx, PVOICE.reveal); // the screens show the answers and the real question
}

const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

function activeIds(ctx: GameCtx, s: State) {
  return s.participants.filter((id) => ctx.isConnected(id));
}

/** `guessed`: the caught imposter's word, '' when the guess was missed (time out / left), null when there was no guess. */
function finish(ctx: GameCtx, s: State, accused: string | null, guessed: string | null) {
  const caught = accused !== null && s.imposters.includes(accused);
  const guessCorrect = guessed === null ? null : guessed === s.word;
  s.guessEndsAt = null;
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
    ...(isQuestionMode(s) && s.realQ && s.impQ ? { question: s.realQ.q, imposterQuestion: s.impQ.q } : {}),
  };
  s.phase = 'result';
  ctx.fx('reveal');
  const who = s.imposters.map((id) => ctx.playerName(id)).join(' و');
  // how it ended, then the winner side (never the word: the screens show it)
  const how = guessCorrect === true ? PVOICE.guessRight : guessed !== null ? PVOICE.guessWrong : accused === null ? PVOICE.voteTie : !caught ? PVOICE.notImposter : null;
  ctx.say?.(
    imposterWins ? (isQuestionMode(s) ? `الفوز للدخيل: ${who}` : `الفوز للدخيل: ${who}، والكلمة: ${s.word}`) : `الفوز للمواطنين! الدخيل: ${who}`,
    undefined,
    voiceAnd(how, imposterWins ? PVOICE.winImposter : PVOICE.winCivilians),
  );
}

function checkAllIn(ctx: GameCtx, s: State) {
  const active = activeIds(ctx, s);
  if (s.phase === 'reveal' && active.every((id) => s.ready.has(id))) {
    s.phase = 'clues';
    ctx.fx('start');
    ctx.say?.(`وقت التلميحات: البداية مع ${ctx.playerName(s.order[0])}`, undefined, PVOICE.clues);
  } else if (s.phase === 'answer' && active.every((id) => s.answers.has(id))) {
    revealAnswers(ctx, s);
  } else if (s.phase === 'vote' && active.every((id) => s.votes.has(id))) {
    resolveVotes(ctx, s);
  }
}

const totalRounds = (s: State) => s.settings.rounds || 5;

function finalWinner(s: State): string | null {
  const best = Math.max(...s.participants.map((id) => s.scores[id] ?? 0));
  const top = s.participants.filter((id) => (s.scores[id] ?? 0) === best);
  return top.length === 1 ? top[0] : null;
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
  // «سؤال مختلف»: no word to guess, a caught imposter is simply caught
  if (accused && s.imposters.includes(accused) && !isQuestionMode(s)) {
    // caught! give the imposter one last chance to guess the word
    const others = shuffle(s.category.words.filter((w) => w !== s.word)).slice(0, 5);
    s.guessOptions = shuffle([s.word, ...others]);
    s.guesserId = accused;
    s.guessEndsAt = ctx.now + GUESS_MS;
    s.phase = 'guess';
    ctx.fx('buzz', accused);
    ctx.say?.(`انكشاف ${ctx.playerName(accused)}: الدخيل! فرصة أخيرة لتخمين الكلمة`, accused, PVOICE.imposterCaught);
    return;
  }
  finish(ctx, s, accused, null);
}

export const imposter: GameModule<State, ImposterSettings> = {
  turnOf: (s) => s.phase === 'guess' && s.guesserId ? [s.guesserId] : [],
  id: 'imposter',
  hostOnly: ['skipReady', 'toVote', 'forceResolve', 'next', 'revealAnswers'],

  tick(ctx, s) {
    if (s.phase === 'answer' && s.answerEndsAt !== null && ctx.now >= s.answerEndsAt) {
      revealAnswers(ctx, s); // time is up: whoever hasn't answered has no answer
      return true;
    }
    if (s.phase === 'guess' && s.guessEndsAt !== null && ctx.now >= s.guessEndsAt) {
      finish(ctx, s, s.guesserId, ''); // time is up: a missed guess
      return true;
    }
    return false;
  },

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
      guessEndsAt: null,
      result: null,
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      botClues: {},
      realQ: null,
      impQ: null,
      answers: new Map(),
      answerEndsAt: null,
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
        checkAllIn(ctx, s);
        return;
      }
      case 'skipReady': {
        if (s.phase === 'reveal') {
          s.phase = 'clues';
          ctx.say?.(`وقت التلميحات: البداية مع ${ctx.playerName(s.order[0])}`, undefined, PVOICE.clues);
        }
        return;
      }
      case 'answer': {
        if (s.phase !== 'answer' || !isPlayer || !isStr(a.text)) return;
        const text = a.text.replace(/\s+/g, ' ').trim().slice(0, IMPOSTER_ANSWER_MAX);
        if (!text) return;
        s.answers.set(by, text); // may be changed until the reveal
        checkAllIn(ctx, s);
        return;
      }
      case 'revealAnswers': {
        if (s.phase === 'answer') revealAnswers(ctx, s);
        return;
      }
      case 'toVote': {
        if (s.phase === 'clues' || s.phase === 'answers') {
          s.phase = 'vote';
          ctx.fx('tick');
          ctx.say?.('بدأ التصويت: من هو الدخيل؟', undefined, PVOICE.vote);
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
        checkAllIn(ctx, s);
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
        if (s.phase !== 'result') return;
        if (s.round >= totalRounds(s)) {
          s.phase = 'final';
          const w = finalWinner(s);
          if (w) ctx.fx('win', w);
          else ctx.fx('win');
          voiceOnly(ctx, voiceFinal(ctx, s.participants, (id) => s.scores[id] ?? 0));
          return;
        }
        newRound(ctx, s);
        return;
      }
    }
  },

  view(ctx, s, me): ImposterView {
    const isImposter = s.imposters.includes(me);
    const inGame = s.participants.includes(me);
    const qMode = isQuestionMode(s);
    // «سؤال مختلف»: answers and the real question only once revealed; the other question never before the result
    const revealed = qMode && s.phase !== 'answer';
    return {
      game: 'imposter',
      phase: s.phase,
      mode: qMode ? 'question' : 'word',
      round: s.round,
      totalRounds: totalRounds(s),
      participants: s.participants,
      secret: !inGame
        ? null
        : qMode
          ? { role: 'question', question: (isImposter ? s.impQ : s.realQ)?.q ?? '' }
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
      guessEndsAt: s.phase === 'guess' ? s.guessEndsAt : null,
      botClues: s.phase === 'reveal' ? {} : s.botClues,
      result: s.result,
      scores: s.scores,
      answered: qMode ? [...s.answers.keys()] : [],
      myAnswer: qMode ? (s.answers.get(me) ?? null) : null,
      answers: revealed ? Object.fromEntries(s.answers) : {},
      question: revealed ? (s.realQ?.q ?? null) : null,
      answerEndsAt: s.phase === 'answer' ? s.answerEndsAt : null,
      answerSeconds: answerMs(s) / 1000,
    };
  },

  botPlan(ctx, s, bots) {
    const level = botLevel(ctx);
    for (const bot of bots) {
      if (!s.participants.includes(bot)) continue;
      const isImp = s.imposters.includes(bot);
      if (isQuestionMode(s)) {
        // answers the question on its own screen (an imposter bot doesn't know either), then votes by the answers
        const q = isImp ? s.impQ : s.realQ;
        if (s.phase === 'answer' && q && !s.answers.has(bot)) {
          ctx.bot(bot, `answer:${s.round}`, rand(3000, Math.max(4000, Math.min(14_000, answerMs(s) * 0.5))), { type: 'answer', text: botAnswer(q) });
        }
        if (s.phase === 'vote' && !s.votes.has(bot)) {
          ctx.bot(bot, `vote:${s.round}`, rand(2500, 6000), { type: 'vote', target: questionVote(s, bot, level) });
        }
        continue;
      }
      if (s.phase === 'reveal' && !s.ready.has(bot)) {
        ctx.bot(bot, `ready:${s.round}`, rand(1200, 3500), { type: 'ready' });
      }
      if (s.phase === 'vote' && !s.votes.has(bot) && level !== 'easy') {
        ctx.bot(bot, `vote:${s.round}`, rand(2500, 6000), { type: 'vote', target: smartVote(s, bot, level === 'expert') });
      } else if (s.phase === 'vote' && !s.votes.has(bot)) {
        const others = s.participants.filter((id) => id !== bot);
        // the old casual vote: imposter bots blame someone who isn't a partner (they see their partners),
        // civilian bots pick anyone (no peeking at who the imposter is)
        const civilians = others.filter((id) => !s.imposters.includes(id));
        const target = isImp ? pick(civilians.length ? civilians : others) : pick(others);
        ctx.bot(bot, `vote:${s.round}`, rand(2500, 6000), { type: 'vote', target });
      }
      if (s.phase === 'guess' && s.guesserId === bot && s.guessOptions) {
        const clues = s.participants.filter((id) => s.botClues[id] && !s.imposters.includes(id)).map((id) => s.botClues[id]);
        const ranked = rankGuesses(s.category, s.guessOptions, clues);
        // easy: the old lucky guess; smart: one of the two that fit best; expert: the best fit
        const word =
          level === 'easy' ? (Math.random() < 0.35 ? s.word : pick(s.guessOptions)) : level === 'smart' ? pick(ranked.slice(0, 2)).w : ranked[0].w;
        ctx.bot(bot, `guess:${s.round}`, rand(2500, 4500), { type: 'guess', word });
      }
    }
  },

  onLeave(ctx, s, id) {
    s.participants = s.participants.filter((p) => p !== id);
    s.order = s.order.filter((p) => p !== id);
    s.ready.delete(id);
    s.votes.delete(id);
    s.answers.delete(id);
    // votes for someone who is gone no longer count: those players vote again
    for (const [from, to] of [...s.votes]) if (to === id) s.votes.delete(from);
    if (s.phase === 'guess' && s.guesserId === id) {
      finish(ctx, s, id, ''); // the caught imposter walked away: a missed guess
      return;
    }
    checkAllIn(ctx, s);
  },

  /** By total points over all the rounds. */
  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    const pts = (id: string) => s.scores[id] ?? 0;
    const vals = [...new Set(s.participants.map(pts))].sort((a, b) => b - a);
    return { places: vals.map((v) => s.participants.filter((id) => pts(id) === v)) };
  },
};
