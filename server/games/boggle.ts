/**
 * «حروف مبعثرة» — everyone looks for words in the same grid of letters until the timer runs out.
 *
 * A word is a path of touching cells (8 directions), each cell once, 3+ letters, found in the Arabic
 * list (see server/boggle-grid.ts: exact lookup, no «ال» + word). Points by length (boggleWordPoints);
 * with the «unique» rule, a word found by two players or more scores nothing. Rounds end on the timer,
 * or as soon as every person still playing has pressed «انتهيت». Bots pick everyday words hidden in the
 * grid (more, and longer, for a stronger room bot level) and send them one by one over the round.
 */
import {
  BOGGLE_SECONDS,
  BOGGLE_SIZES,
  boggleWordPoints,
  type BoggleFound,
  type BoggleLevel,
  type BoggleResult,
  type BoggleSettings,
  type BoggleView,
} from '../../src/shared/games/boggle';
import { boggleWord, generateGrid, wordOf } from '../boggle-grid';
import { randDelay } from '../cardkit';
import type { BotLevel } from '../../src/shared/protocol';
import { GameError, botLevel, type GameCtx, type GameModule } from '../types';
import { isNum, shuffle } from '../util';
import { roundWin, voiceResult } from '../voice-calls-boards';

/** pause on a round's words before the next round (the host may skip it) */
export const REVEAL_MS = 30_000;

interface PlannedWord {
  word: string;
  path: number[];
}

interface State {
  settings: BoggleSettings;
  players: string[];
  names: Record<string, string>;
  round: number;
  phase: BoggleView['phase'];
  grid: string[];
  /** every everyday word hidden in the grid → one path */
  solution: Record<string, number[]>;
  found: Record<string, BoggleFound[]>;
  done: Record<string, boolean>;
  endsAt: number | null;
  timerTotal: number;
  results: BoggleResult[] | null;
  missed: BoggleFound | null;
  scores: Record<string, number>;
  /** the words each bot will send this round */
  plans: Record<string, PlannedWord[]>;
}

const LEVELS: BoggleLevel[] = ['easy', 'medium', 'hard'];

/**
 * How many words a bot finds in a 3-minute 4×4 round: [min, max], by the room's bot level
 * (easy = the game's old default «متوسط», smart = the old «صعب»).
 */
const BOT_WORDS: Record<BotLevel, [number, number]> = { easy: [7, 12], smart: [13, 20], expert: [22, 32] };

function clean(settings: BoggleSettings): BoggleSettings {
  return {
    rounds: isNum(settings.rounds) ? Math.max(1, Math.min(5, Math.round(settings.rounds))) : 3,
    size: settings.size === 5 ? 5 : 4,
    seconds: settings.seconds === 120 ? 120 : 180,
    unique: settings.unique !== false,
    level: LEVELS.includes(settings.level) ? settings.level : 'medium',
  };
}

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'play';
  const { grid, words } = generateGrid(s.settings.size);
  s.grid = grid;
  s.solution = Object.fromEntries(words);
  s.found = Object.fromEntries(s.players.map((p) => [p, []]));
  s.done = {};
  s.results = null;
  s.missed = null;
  s.plans = {};
  s.timerTotal = s.settings.seconds * 1000;
  s.endsAt = ctx.now + s.timerTotal;
  ctx.fx('start');
}

/** Add a word for a player (already checked). */
function addWord(s: State, id: string, word: string, path: number[]) {
  s.found[id] ??= [];
  s.found[id].push({ word, path, points: boggleWordPoints([...word].length) });
}

/** The top scorer, or null on a tie. */
function topScorer(s: State): string | null {
  if (!s.players.length) return null;
  const best = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
  const top = s.players.filter((id) => (s.scores[id] ?? 0) === best);
  return top.length === 1 ? top[0] : null;
}

function finishRound(ctx: GameCtx, s: State) {
  // bots that had words left to send still get them (the round may end early)
  for (const [id, plan] of Object.entries(s.plans)) {
    if (!s.players.includes(id) || !ctx.isBot(id)) continue;
    for (const w of plan) if (!s.found[id]?.some((f) => f.word === w.word)) addWord(s, id, w.word, w.path);
  }
  s.plans = {};
  const count = new Map<string, number>();
  for (const id of s.players) for (const f of s.found[id] ?? []) count.set(f.word, (count.get(f.word) ?? 0) + 1);
  s.results = s.players.map((id) => {
    const words = (s.found[id] ?? []).map((f) => {
      const shared = (count.get(f.word) ?? 0) > 1;
      return { ...f, shared, points: shared && s.settings.unique ? 0 : f.points };
    });
    const points = words.reduce((a, w) => a + w.points, 0);
    s.scores[id] = (s.scores[id] ?? 0) + points;
    return { id, words, points };
  });
  // the best everyday word nobody found: the most points, then the longest
  const left = Object.keys(s.solution).filter((w) => !count.has(w));
  const ranked = shuffle(left).sort((a, b) => boggleWordPoints([...b].length) - boggleWordPoints([...a].length) || b.length - a.length);
  s.missed = ranked.length ? { word: ranked[0], path: s.solution[ranked[0]], points: boggleWordPoints([...ranked[0]].length) } : null;
  s.done = {};
  if (s.round >= s.settings.rounds || !s.players.length) {
    s.phase = 'final';
    s.endsAt = null;
    const w = topScorer(s);
    if (w) ctx.fx('win', w);
    else ctx.fx('win');
    // the end, said and read aloud (the words found stay on the result screen)
    ctx.say?.(w ? `انتهت اللعبة: الفوز لـ${ctx.playerName(w)} (${s.scores[w]} نقطة)` : 'انتهت اللعبة بالتعادل', w ?? undefined, voiceResult(w && ctx.playerName(w)));
  } else {
    s.phase = 'reveal';
    s.endsAt = ctx.now + REVEAL_MS;
    s.timerTotal = REVEAL_MS;
    ctx.fx('reveal');
    // the round's best score, said and read aloud
    const best = Math.max(0, ...s.results.map((r) => r.points));
    const top = s.results.filter((r) => r.points === best);
    if (best > 0 && top.length === 1) ctx.say?.(`انتهت الجولة ${s.round}: الأعلى نقاطاً ${ctx.playerName(top[0].id)} (+${best})`, top[0].id, roundWin(ctx.playerName(top[0].id)));
  }
}

/** Every person still in the game has pressed «انتهيت» (needs at least one person). */
function peopleDone(ctx: GameCtx, s: State): boolean {
  const people = s.players.filter((id) => !ctx.isBot(id) && ctx.isConnected(id));
  return people.length > 0 && people.every((id) => s.done[id]);
}

/**
 * A bot's words for this round: a sample of the everyday words in the grid, by the room's bot level.
 * The easy bot mostly sees short words; stronger bots see longer ones too. The expert goes for the
 * points: long words first (worth up to 11), and, when words found by two players score nothing,
 * it leans even harder on long words, which the others are less likely to find too.
 */
export function botWords(s: Pick<State, 'settings' | 'solution'>, level: BotLevel): PlannedWord[] {
  const all = Object.keys(s.solution);
  const [lo, hi] = BOT_WORDS[level];
  const scale = (s.settings.seconds / 180) * (s.settings.size === 5 ? 1.3 : 1);
  const n = Math.min(all.length, Math.round((lo + Math.random() * (hi - lo)) * scale));
  const len = (w: string) => [...w].length;
  const weight = (w: string) =>
    level === 'easy'
      ? len(w) <= 5 ? 2 : 1
      : level === 'smart'
        ? 1 + (len(w) - 3) * 0.6
        : Math.pow(boggleWordPoints(len(w)), s.settings.unique ? 1.6 : 1.2) + (len(w) - 3) * 0.5;
  const pool = all.map((w) => ({ w, k: Math.pow(Math.random(), 1 / weight(w)) }));
  pool.sort((a, b) => b.k - a.k);
  return pool.slice(0, n).map(({ w }) => ({ word: w, path: s.solution[w] }));
}

export const boggle: GameModule<State, BoggleSettings> = {
  id: 'boggle',
  hostOnly: ['next'],

  start(ctx, participants, settings) {
    const s: State = {
      settings: clean(settings),
      players: [...participants],
      names: Object.fromEntries(participants.map((id) => [id, ctx.playerName(id)])),
      round: 0,
      phase: 'play',
      grid: [],
      solution: {},
      found: {},
      done: {},
      endsAt: null,
      timerTotal: 0,
      results: null,
      missed: null,
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      plans: {},
    };
    newRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      // host only (see hostOnly), even a host who is only watching
      if (s.phase === 'reveal') newRound(ctx, s);
      return;
    }
    if (!s.players.includes(by) || s.phase !== 'play') return;
    if (a.type === 'done') {
      s.done[by] = true;
      if (peopleDone(ctx, s)) finishRound(ctx, s);
      return;
    }
    if (a.type !== 'word' || s.done[by]) return;
    if (isNum(a.round) && a.round !== s.round) return; // a bot's word from an earlier round
    const path = Array.isArray(a.path) ? (a.path as unknown[]) : [];
    if (!path.every(isNum)) throw new GameError('اختر الحروف من الشبكة');
    const word = wordOf(s.grid, s.settings.size, path as number[]);
    if (!word) throw new GameError('الحروف يجب أن تكون متجاورة، وكل خانة مرة واحدة');
    if ([...word].length < 3) throw new GameError('الكلمة قصيرة: 3 حروف على الأقل');
    if (s.found[by]?.some((f) => f.word === word)) throw new GameError(`وجدت «${word}» من قبل`);
    if (!boggleWord(word)) {
      throw new GameError(word.startsWith('ال') ? `«${word}» غير مقبولة — الكلمات بدون «ال» التعريف` : `«${word}» ليست في القاموس`);
    }
    addWord(s, by, word, path as number[]);
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'play') finishRound(ctx, s);
    else if (s.phase === 'reveal') newRound(ctx, s);
    else return false;
    return true;
  },

  turnOf(s) {
    return s.phase === 'play' ? s.players.filter((id) => !s.done[id]) : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play' || s.endsAt === null) return;
    // a person who came back takes over from the bot that played for them
    for (const id of Object.keys(s.plans)) if (!bots.includes(id) && !ctx.isBot(id)) delete s.plans[id];
    const left = s.endsAt - ctx.now;
    for (const b of bots) {
      if (!s.players.includes(b) || s.plans[b]) continue;
      // the room's bot level (the game's own old «level» setting is ignored)
      const plan = botWords(s, botLevel(ctx)).filter((w) => !s.found[b]?.some((f) => f.word === w.word));
      // a bot that takes over late finds fewer words
      s.plans[b] = plan.slice(0, Math.ceil((plan.length * left) / s.timerTotal));
      for (const w of s.plans[b]) {
        ctx.bot(b, `w:${s.round}:${w.word}`, randDelay(Math.min(4000, left * 0.1), left * 0.95), { type: 'word', path: w.path, round: s.round });
      }
    }
  },

  view(ctx, s, me): BoggleView {
    const over = s.phase !== 'play';
    return {
      game: 'boggle',
      phase: s.phase,
      round: s.round,
      rounds: s.settings.rounds,
      size: s.settings.size,
      grid: s.grid,
      unique: s.settings.unique,
      players: s.players,
      names: s.names,
      myWords: s.found[me] ?? [],
      done: !!s.done[me],
      others: s.players.filter((id) => id !== me).map((id) => ({ id, count: s.found[id]?.length ?? 0, done: !!s.done[id] })),
      endsAt: s.endsAt,
      timerTotal: s.timerTotal,
      results: over ? s.results : null,
      missed: over ? s.missed : null,
      possible: Object.keys(s.solution).length,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, id) {
    s.players = s.players.filter((p) => p !== id);
    delete s.plans[id];
    delete s.scores[id];
    if (s.phase === 'final') return;
    if (!s.players.length) {
      s.phase = 'final';
      s.endsAt = null;
      return;
    }
    if (s.phase === 'play' && peopleDone(ctx, s)) finishRound(ctx, s);
  },

  result(s) {
    if (s.phase !== 'final' || !s.players.length) return null;
    const pts = (id: string) => s.scores[id] ?? 0;
    const vals = [...new Set(s.players.map(pts))].sort((a, b) => b - a);
    return { places: vals.map((v) => s.players.filter((id) => pts(id) === v)) };
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = Math.max(1, Math.min(5, Math.round(patch.rounds)));
    if (BOGGLE_SIZES.includes(patch.size as 4)) settings.size = patch.size as number;
    if (BOGGLE_SECONDS.includes(patch.seconds as 120)) settings.seconds = patch.seconds as number;
    if (typeof patch.unique === 'boolean') settings.unique = patch.unique;
    if (LEVELS.includes(patch.level as BoggleLevel)) settings.level = patch.level as BoggleLevel;
  },
};

export type { State as BoggleState };
