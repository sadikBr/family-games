/**
 * «القاموس العجيب» — the bluffing dictionary game (rules at the top of src/shared/games/qamus.ts).
 *
 * A round: a rare real word from server/qamus-words.ts (never twice in a room until the list is used up).
 *  1. write: everyone writes a fake definition at once (phones keep a draft on the server as they type: it is
 *     used when time runs out; an empty box means no definition). Ends early when everyone connected has sent.
 *     Then a definition that says the real meaning is merged with the real one (+3, its author sits the vote
 *     out), and identical fakes become one card with several authors.
 *  2. vote: the real definition and the fakes, shuffled, with ids new every round; everyone votes for one card
 *     (not their own; a vote can change until everyone has voted). Ends early when everyone connected voted.
 *     No fakes at all: straight to the reveal.
 *  3. reveal: the real card, who wrote each fake, who voted for what, the round's points. The host can mark a
 *     fake «صحيح» (and unmark it): it then counts as the real one (+3 to its authors, +2 to its voters).
 *     The host moves on, or the reveal ends by itself.
 * The final podium after the last round.
 *
 * The views never show who wrote what or which card is real before the reveal, nor anyone else's text while
 * writing. Bots write a decoy of the word (never the real meaning) after a human-like pause and vote: they
 * find the real card with a chance that grows with their level, otherwise they pick another fake.
 */
import {
  QAMUS_DEFAULTS,
  QAMUS_ROUNDS,
  QAMUS_SECONDS,
  QAMUS_TEXT_MIN,
  cleanDefinition,
  sameMeaning,
  scoreRound,
  type QamusReveal,
  type QamusRevealCard,
  type QamusSettings,
  type QamusView,
} from '../../src/shared/games/qamus';
import type { BotLevel } from '../../src/shared/protocol';
import { QAMUS_CATS, QAMUS_SPARE, QAMUS_WORDS, bareWord, type QamusEntry } from '../qamus-words';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { placesByScore, soleWinner } from './mcq';

export type Rnd = () => number;

/** The reveal stays this long (at the room's pace) unless the host moves on. */
export const QAMUS_REVEAL_MS = 25_000;
/** Time to vote: a little more for a longer list. */
export const qamusVoteMs = (cards: number) => Math.min(75_000, 20_000 + 6_000 * cards);

interface Card {
  id: string;
  text: string;
  real: boolean;
  authors: string[];
  marked: boolean;
}

interface State {
  settings: QamusSettings;
  participants: string[];
  /** 0-based */
  round: number;
  phase: QamusView['phase'];
  entry: QamusEntry;
  endsAt: number | null;
  total: number;
  /** write: definitions sent, and drafts as typed */
  sent: Record<string, string>;
  drafts: Record<string, string>;
  /** after writing: what each one wrote (null: nothing) */
  wrote: Record<string, string | null>;
  /** wrote the real meaning (found by the app) */
  knew: string[];
  cards: Card[];
  /** who may vote this round */
  voters: string[];
  votes: Record<string, string>;
  gains: Record<string, number>;
  scores: Record<string, number>;
  /** scores before this round (the host's marks recompute the round) */
  before: Record<string, number>;
  /** a bot's decoy and vote, chosen once per round */
  botText: Record<string, string>;
  botVote: Record<string, string>;
  rnd: Rnd;
}

const snap = (v: unknown, opts: readonly number[], d: number): number =>
  isNum(v) ? opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]) : d;

export function sanitizeQamus(raw: Partial<QamusSettings> | undefined): QamusSettings {
  return {
    rounds: snap(raw?.rounds, QAMUS_ROUNDS, QAMUS_DEFAULTS.rounds),
    seconds: snap(raw?.seconds, QAMUS_SECONDS, QAMUS_DEFAULTS.seconds),
  };
}

const shuffleWith = <T>(arr: readonly T[], rnd: Rnd): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** An opaque card id. */
const cardId = (rnd: Rnd) => Array.from({ length: 6 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(rnd() * 32)]).join('');

/* ------------------------------------------------------------------ */
/* Rounds                                                              */
/* ------------------------------------------------------------------ */

const USED = 'qamus:used';

/** A word not seen in this room yet (and of another family than the last one when possible). */
function pickWord(ctx: GameCtx, s: State | null, rnd: Rnd): QamusEntry {
  let used = ctx.memo.get(USED) as Set<string> | undefined;
  if (!used) ctx.memo.set(USED, (used = new Set()));
  let pool = QAMUS_WORDS.filter((w) => !used.has(bareWord(w.word)));
  if (!pool.length) {
    used.clear();
    pool = [...QAMUS_WORDS];
  }
  const other = s ? pool.filter((w) => w.cat !== s.entry.cat) : pool;
  const list = other.length ? other : pool;
  const e = list[Math.floor(rnd() * list.length)];
  used.add(bareWord(e.word));
  return e;
}

function startRound(ctx: GameCtx, s: State) {
  s.entry = pickWord(ctx, s.round > 0 ? s : null, s.rnd);
  s.phase = 'write';
  s.sent = {};
  s.drafts = {};
  s.wrote = {};
  s.knew = [];
  s.cards = [];
  s.voters = [];
  s.votes = {};
  s.botText = {};
  s.botVote = {};
  s.before = { ...s.scores };
  s.gains = Object.fromEntries(s.participants.map((p) => [p, 0]));
  s.total = s.settings.seconds * 1000;
  s.endsAt = ctx.now + s.total;
  ctx.fx('start');
  ctx.say?.(`كلمة الجولة: «${s.entry.word}» · اكتبوا لها معنى`);
}

/** Writing is over: collect the definitions, merge the real-meaning ones and the twins, then vote. */
function endWrite(ctx: GameCtx, s: State) {
  const real: Card = { id: '', text: s.entry.def, real: true, authors: [], marked: false };
  const fakes: Card[] = [];
  s.knew = [];
  for (const p of s.participants) {
    const draft = s.drafts[p] ?? '';
    const text = s.sent[p] ?? ([...draft].length >= QAMUS_TEXT_MIN ? draft : null);
    s.wrote[p] = text;
    if (!text) continue;
    if (sameMeaning(text, s.entry.def)) {
      s.knew.push(p);
      continue;
    }
    const twin = fakes.find((c) => sameMeaning(c.text, text));
    if (twin) twin.authors.push(p);
    else fakes.push({ id: '', text, real: false, authors: [p], marked: false });
  }
  s.cards = shuffleWith([real, ...fakes], s.rnd);
  const ids = new Set<string>();
  for (const c of s.cards) {
    let id = cardId(s.rnd);
    while (ids.has(id)) id = cardId(s.rnd);
    ids.add(id);
    c.id = id;
  }
  s.voters = s.participants.filter((p) => !s.knew.includes(p));
  s.votes = {};
  if (!fakes.length || !s.voters.length) return toReveal(ctx, s);
  s.phase = 'vote';
  s.total = qamusVoteMs(s.cards.length);
  s.endsAt = ctx.now + s.total;
  ctx.fx('buzz');
  ctx.say?.(`التعريفات جاهزة: أيها معنى «${s.entry.word}»؟`);
}

function rescore(s: State) {
  const { gains } = scoreRound({ players: s.participants, cards: s.cards, votes: s.votes, knewBefore: s.knew });
  s.gains = gains;
  for (const p of s.participants) s.scores[p] = (s.before[p] ?? 0) + (gains[p] ?? 0);
}

function toReveal(ctx: GameCtx, s: State) {
  s.phase = 'reveal';
  rescore(s);
  s.total = paced(ctx, QAMUS_REVEAL_MS);
  s.endsAt = ctx.now + s.total;
  ctx.fx('reveal');
  ctx.say?.(`«${s.entry.word}»: ${s.entry.def}`);
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.settings.rounds || s.participants.length < 2) return finish(ctx, s);
  s.round++;
  startRound(ctx, s);
}

/** Everyone connected has sent (people away don't hold the round up). */
function checkWrite(ctx: GameCtx, s: State) {
  if (s.phase === 'write' && s.participants.every((p) => s.sent[p] !== undefined || !ctx.isConnected(p))) endWrite(ctx, s);
}

function checkVote(ctx: GameCtx, s: State) {
  if (s.phase === 'vote' && s.voters.every((p) => s.votes[p] !== undefined || !ctx.isConnected(p))) toReveal(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** When a bot sends its definition: a share of the writing time, by strength. */
const WRITE_SHARE: Record<BotLevel, [number, number]> = { easy: [0.35, 0.75], smart: [0.25, 0.6], expert: [0.2, 0.5] };
/** A bot's time to vote (ms). */
export const QAMUS_BOT_VOTE_MS: Record<BotLevel, [number, number]> = { easy: [7000, 15000], smart: [5000, 11000], expert: [4000, 9000] };
/** The chance that a bot finds the real definition. */
export const QAMUS_BOT_FIND: Record<BotLevel, number> = { easy: 0.25, smart: 0.45, expert: 0.65 };

const between = (rnd: Rnd, [lo, hi]: [number, number]) => Math.round(lo + rnd() * (hi - lo));

/** A decoy for this word that no one else uses this round (the word's own first, then its family's). */
export function botDecoy(entry: QamusEntry, taken: string[], rnd: Rnd): string {
  const free = (list: string[]) => list.filter((d) => !taken.some((t) => sameMeaning(t, d)) && !sameMeaning(d, entry.def));
  const own = free(entry.decoys);
  if (own.length) return own[Math.floor(rnd() * own.length)];
  const spare = free(QAMUS_SPARE[entry.cat]);
  if (spare.length) return spare[Math.floor(rnd() * spare.length)];
  return entry.decoys[Math.floor(rnd() * entry.decoys.length)];
}

/** A bot's vote: the real card by chance (its strength), otherwise a fake it didn't write. */
export function botChoice(level: BotLevel, cards: { id: string; real: boolean; authors: string[] }[], me: string, rnd: Rnd): string | null {
  const real = cards.find((c) => c.real);
  const others = cards.filter((c) => !c.real && !c.authors.includes(me));
  if (real && (rnd() < QAMUS_BOT_FIND[level] || !others.length)) return real.id;
  if (!others.length) return null;
  return others[Math.floor(rnd() * others.length)].id;
}

function planBots(ctx: GameCtx, s: State, bots: string[]) {
  const level = botLevel(ctx);
  for (const b of bots) {
    if (!s.participants.includes(b)) continue;
    if (s.phase === 'write' && s.sent[b] === undefined) {
      if (!s.botText[b]) {
        const taken = [...Object.values(s.sent), ...Object.values(s.botText)];
        s.botText[b] = botDecoy(s.entry, taken, s.rnd);
      }
      const [lo, hi] = WRITE_SHARE[level];
      const delay = Math.max(6000, between(s.rnd, [lo * s.settings.seconds * 1000, hi * s.settings.seconds * 1000]));
      ctx.bot(b, `w:${s.round}`, delay, { type: 'send', round: s.round + 1, text: s.botText[b] });
    } else if (s.phase === 'vote' && s.voters.includes(b) && s.votes[b] === undefined) {
      if (!s.botVote[b]) {
        const pick = botChoice(level, s.cards, b, s.rnd);
        if (!pick) continue;
        s.botVote[b] = pick;
      }
      ctx.bot(b, `v:${s.round}`, between(s.rnd, QAMUS_BOT_VOTE_MS[level]), { type: 'vote', round: s.round + 1, card: s.botVote[b] });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startQamus(ctx: GameCtx, participants: string[], raw: QamusSettings, rnd: Rnd = Math.random): State {
  const s: State = {
    settings: sanitizeQamus(raw),
    participants: [...participants],
    round: 0,
    phase: 'write',
    entry: QAMUS_WORDS[0],
    endsAt: null,
    total: 0,
    sent: {},
    drafts: {},
    wrote: {},
    knew: [],
    cards: [],
    voters: [],
    votes: {},
    gains: {},
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    before: {},
    botText: {},
    botVote: {},
    rnd,
  };
  startRound(ctx, s);
  return s;
}

function revealOf(s: State): QamusReveal {
  const count = (c: Card) => s.participants.filter((p) => s.votes[p] === c.id).length;
  const cards: QamusRevealCard[] = [...s.cards]
    .sort((a, b) => Number(b.real) - Number(a.real) || Number(b.marked) - Number(a.marked) || count(b) - count(a))
    .map((c) => ({ id: c.id, text: c.text, real: c.real, authors: [...c.authors], voters: s.participants.filter((p) => s.votes[p] === c.id), marked: c.marked }));
  const knew = s.participants.filter((p) => s.knew.includes(p) || s.cards.some((c) => c.marked && c.authors.includes(p)));
  return {
    cards,
    knew,
    wrote: Object.fromEntries(s.participants.map((p) => [p, s.wrote[p] ?? null])),
    votes: Object.fromEntries(s.participants.map((p) => [p, s.votes[p] ?? null])),
    gains: { ...s.gains },
  };
}

export const qamus: GameModule<State, QamusSettings> = {
  id: 'qamus',
  hostOnly: ['next', 'mark'],

  start(ctx, participants, raw) {
    return startQamus(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by)) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    switch (a.type) {
      case 'type': {
        // the draft, kept as the player types: sent as it is if time runs out
        if (s.phase !== 'write' || s.sent[by] !== undefined || !isStr(a.text)) return;
        s.drafts[by] = cleanDefinition(a.text);
        return;
      }
      case 'send': {
        if (s.phase !== 'write' || !isStr(a.text)) return;
        const text = cleanDefinition(a.text);
        if ([...text].length < QAMUS_TEXT_MIN) throw new GameError('اكتب تعريفاً أطول قليلاً');
        s.sent[by] = text;
        s.drafts[by] = text;
        return checkWrite(ctx, s);
      }
      case 'edit': {
        // take back what I sent while the others are still writing
        if (s.phase !== 'write') return;
        delete s.sent[by];
        return;
      }
      case 'vote': {
        if (s.phase !== 'vote' || !s.voters.includes(by) || !isStr(a.card)) return;
        const c = s.cards.find((x) => x.id === a.card);
        if (!c) return;
        if (c.authors.includes(by)) throw new GameError('لا يمكن التصويت لتعريفك');
        s.votes[by] = c.id;
        return checkVote(ctx, s);
      }
      case 'mark': {
        // the host: this fake says the real meaning (or not, to undo)
        if (s.phase !== 'reveal' || !isStr(a.card)) return;
        const c = s.cards.find((x) => x.id === a.card);
        if (!c || c.real || !c.authors.length) return;
        c.marked = a.on !== false;
        rescore(s);
        return;
      }
      case 'next': {
        if (s.phase === 'reveal') next(ctx, s);
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'write') endWrite(ctx, s);
    else if (s.phase === 'vote') toReveal(ctx, s);
    else if (s.phase === 'reveal') next(ctx, s);
    else return false;
    return true;
  },

  turnOf(s) {
    if (s.phase === 'write') return s.participants.filter((p) => s.sent[p] === undefined);
    if (s.phase === 'vote') return s.voters.filter((p) => s.votes[p] === undefined);
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'write' || s.phase === 'vote') planBots(ctx, s, bots);
  },

  view(ctx, s, me): QamusView {
    const playing = s.participants.includes(me);
    const open = s.phase === 'reveal' || s.phase === 'final';
    return {
      game: 'qamus',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.settings.rounds,
      word: s.entry.word,
      category: QAMUS_CATS[s.entry.cat],
      endsAt: s.endsAt,
      total: s.total,
      players: [...s.participants],
      done:
        s.phase === 'write'
          ? s.participants.filter((p) => s.sent[p] !== undefined)
          : s.phase === 'vote'
            ? s.participants.filter((p) => !s.voters.includes(p) || s.votes[p] !== undefined)
            : [...s.participants],
      mine: s.phase === 'write' && playing ? { text: s.sent[me] ?? s.drafts[me] ?? '', sent: s.sent[me] !== undefined } : null,
      iKnew: s.phase !== 'write' && s.knew.includes(me),
      cards: s.phase === 'vote' ? s.cards.map((c) => ({ id: c.id, text: c.text, mine: c.authors.includes(me) })) : null,
      myVote: s.phase === 'vote' || open ? (s.votes[me] ?? null) : null,
      reveal: open ? revealOf(s) : null,
      scores: { ...s.scores },
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    for (const rec of [s.scores, s.before, s.gains, s.sent, s.drafts, s.wrote, s.votes, s.botText, s.botVote] as Record<string, unknown>[]) delete rec[id];
    s.voters = s.voters.filter((p) => p !== id);
    s.knew = s.knew.filter((p) => p !== id);
    for (const c of s.cards) c.authors = c.authors.filter((p) => p !== id);
    if (s.phase === 'final') return;
    if (s.participants.length < 2) return finish(ctx, s);
    if (s.phase === 'write') checkWrite(ctx, s);
    else if (s.phase === 'vote') {
      if (!s.voters.length) toReveal(ctx, s);
      else checkVote(ctx, s);
    } else if (s.phase === 'reveal') rescore(s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = snap(patch.rounds, QAMUS_ROUNDS, settings.rounds);
    if (isNum(patch.seconds)) settings.seconds = snap(patch.seconds, QAMUS_SECONDS, settings.seconds);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as QamusState };
