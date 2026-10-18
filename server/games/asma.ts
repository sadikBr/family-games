/**
 * «أسماء الله الحسنى» — server rules.
 * - match («طابِق»): the timed multiple-choice engine of «مسابقة إسلامية» (makeMcq): a Name and four meanings,
 *   or a meaning and four Names.
 * - memory («الذاكرة»): Name cards and meaning cards face down; turn two over, a Name with its own meaning is
 *   a pair (you keep it and play again), otherwise the turn passes — like «الذاكرة».
 */
import { ASMA_PAIRS, type AsmaCard, type AsmaMatchView, type AsmaMemoryView, type AsmaSettings, type AsmaView } from '../../src/shared/games/asma';
import { ASMA_NAMES, type AsmaName } from '../asma-content';
import { randDelay } from '../cardkit';
import { qdeck } from '../qdeck';
import { GameError, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, shuffle } from '../util';
import { makeMcq, mcqOptions, soleWinner, type McqItem, type McqState } from './mcq';

/** memory: a Name and a meaning that don't match stay face up this long */
export const PEEK_MS = 2500;
const BOT_SKILL = 0.7;
/** memory bots remember each card they saw with this chance */
const BOT_MEMORY = 0.7;

interface AsmaItem extends McqItem {
  shows: 'name' | 'meaning';
  idx: number;
}

/** Three wrong answers for a name: from other groups (close meanings are never offered as wrong answers). */
export function asmaDistractors(target: AsmaName, count = 3): AsmaName[] {
  return shuffle(ASMA_NAMES.filter((x) => x.group !== target.group)).slice(0, count);
}

export function asmaItem(idx: number, shows: 'name' | 'meaning'): AsmaItem {
  const t = ASMA_NAMES[idx];
  const wrong = asmaDistractors(t);
  const opts = shows === 'name' ? mcqOptions(t.meaning, wrong.map((w) => w.meaning)) : mcqOptions(t.name, wrong.map((w) => w.name));
  return {
    text: shows === 'name' ? t.name : t.meaning,
    ...opts,
    label: shows === 'name' ? 'ما معنى هذا الاسم؟' : 'ما الاسم الذي هذا معناه؟',
    shows,
    idx,
  };
}

const matchEngine = makeMcq<AsmaSettings>(
  'quiz', // the engine only uses the id for its own view, which this game replaces
  (ctx, settings, rounds) =>
    qdeck(ctx, 'asma:names', [...ASMA_NAMES.keys()])
      .deal(rounds)
      .map((idx, i) => asmaItem(idx, settings.dir === 'mix' ? (i % 2 ? 'meaning' : 'name') : settings.dir)),
  () => BOT_SKILL,
);

interface MemoryState {
  order: string[];
  turnIdx: number;
  /** each card: the index of its name in ASMA_NAMES and which side it shows */
  deck: { idx: number; kind: AsmaCard['kind'] }[];
  owners: (string | null)[];
  flipped: number[];
  peekUntil: number | null;
  pairs: Record<string, number>;
  /** what bots have seen */
  seen: number[];
  moves: number;
  last: { idx: number; by: string } | null;
}

type State =
  | { mode: 'match'; settings: AsmaSettings; m: McqState<AsmaSettings> }
  | { mode: 'memory'; settings: AsmaSettings; phase: 'play' | 'final'; g: MemoryState };

/** Names for a memory table: never two from the same group (their meanings would be too close). */
export function memoryNames(ctx: GameCtx, pairs: number): number[] {
  const deck = qdeck(ctx, 'asma:memory', [...ASMA_NAMES.keys()]);
  const out: number[] = [];
  const groups = new Set<string>();
  while (out.length < pairs) {
    const idx = deck.draw((i) => out.includes(i) || groups.has(ASMA_NAMES[i].group));
    if (out.includes(idx)) continue;
    out.push(idx);
    groups.add(ASMA_NAMES[idx].group);
  }
  return out;
}

function memoryStart(ctx: GameCtx, participants: string[], pairs: number): MemoryState {
  const names = memoryNames(ctx, pairs);
  const deck = shuffle(names.flatMap((idx) => [{ idx, kind: 'name' as const }, { idx, kind: 'meaning' as const }]));
  return {
    order: shuffle(participants),
    turnIdx: 0,
    deck,
    owners: Array(deck.length).fill(null),
    flipped: [],
    peekUntil: null,
    pairs: Object.fromEntries(participants.map((p) => [p, 0])),
    seen: [],
    moves: 0,
    last: null,
  };
}

const isPair = (g: MemoryState, a: number, b: number) => g.deck[a].idx === g.deck[b].idx && g.deck[a].kind !== g.deck[b].kind;

function memoryEnd(ctx: GameCtx, s: Extract<State, { mode: 'memory' }>) {
  s.phase = 'final';
  s.g.peekUntil = null;
  ctx.fx('win', soleWinner(s.g.pairs));
  const w = soleWinner(s.g.pairs);
  ctx.say?.(w ? `انتهت اللعبة: الفوز لـ${ctx.playerName(w)}` : 'انتهت اللعبة بالتعادل');
}

function memoryFlip(ctx: GameCtx, s: Extract<State, { mode: 'memory' }>, by: string, card: unknown) {
  const g = s.g;
  if (s.phase !== 'play' || g.peekUntil !== null) return;
  if (g.order[g.turnIdx] !== by) throw new GameError('ليس دورك');
  if (!isNum(card) || card < 0 || card >= g.deck.length || g.owners[card] || g.flipped.includes(card)) return;
  // the pair found just before stays marked until this flip
  if (g.flipped.length === 2) g.flipped = [];
  g.flipped.push(card);
  if (!g.seen.includes(card)) g.seen.push(card);
  g.moves += 1;
  ctx.fx('card', by);
  if (g.flipped.length < 2) return;
  const [x, y] = g.flipped;
  if (isPair(g, x, y)) {
    g.owners[x] = g.owners[y] = by;
    g.pairs[by] = (g.pairs[by] ?? 0) + 1;
    // the pair stays in `flipped` (shown as just found) until the next flip
    g.last = { idx: g.deck[x].idx, by };
    ctx.fx('correct', by);
    ctx.say?.(`زوج لـ${ctx.playerName(by)}: «${ASMA_NAMES[g.deck[x].idx].name}» ومعناه، ودورٌ آخر`, by);
    if (g.owners.every(Boolean)) memoryEnd(ctx, s);
  } else {
    g.peekUntil = ctx.now + PEEK_MS;
    ctx.say?.(`بطاقتان غير متطابقتين من ${ctx.playerName(by)}`, by);
  }
}

/** A bot's pick: a known matching card if it remembers one, else an unseen card, else any. */
export function memoryBotPick(g: MemoryState, remember: (card: number) => boolean = () => Math.random() < BOT_MEMORY): number {
  const open = (i: number) => !g.owners[i] && !g.flipped.includes(i);
  const known = g.seen.filter((i) => open(i) && remember(i));
  const hidden = g.deck.map((_, i) => i).filter(open);
  const unseen = hidden.filter((i) => !g.seen.includes(i));
  const any = (list: number[]) => list[Math.floor(Math.random() * list.length)];
  if (g.flipped.length === 1) {
    const first = g.flipped[0];
    const mate = known.find((i) => isPair(g, first, i));
    return mate ?? any(unseen.length ? unseen : hidden);
  }
  for (const a of known) {
    const b = known.find((i) => i !== a && isPair(g, a, i));
    if (b !== undefined) return a;
  }
  return any(unseen.length ? unseen : hidden);
}

function memoryView(s: Extract<State, { mode: 'memory' }>): AsmaMemoryView {
  const g = s.g;
  const best = Math.max(0, ...Object.values(g.pairs));
  const face = (i: number): AsmaCard => {
    const c = g.deck[i];
    const nm = ASMA_NAMES[c.idx];
    return { kind: c.kind, text: c.kind === 'name' ? nm.name : nm.short };
  };
  return {
    game: 'asma',
    mode: 'memory',
    phase: s.phase,
    order: g.order,
    turn: g.order[g.turnIdx] ?? '',
    size: g.deck.length,
    cards: g.deck.map((_, i) => (g.owners[i] || g.flipped.includes(i) || s.phase === 'final' ? face(i) : null)),
    owners: g.owners,
    flipped: g.flipped,
    peek: g.peekUntil !== null,
    pairs: g.pairs,
    last: g.last ? { name: ASMA_NAMES[g.last.idx].name, meaning: ASMA_NAMES[g.last.idx].meaning, by: g.last.by } : null,
    winner: s.phase === 'final' ? Object.keys(g.pairs).filter((p) => g.pairs[p] === best) : null,
  };
}

function matchView(m: McqState<AsmaSettings>, me: string): AsmaMatchView {
  const item = m.items[Math.max(0, m.round - 1)] as AsmaItem;
  const shown = m.phase !== 'ask';
  const nm = ASMA_NAMES[item.idx];
  return {
    game: 'asma',
    mode: 'match',
    phase: m.phase,
    round: m.round,
    rounds: m.items.length,
    shows: item.shows,
    prompt: item.text,
    options: item.options,
    endsAt: m.endsAt,
    answered: Object.keys(m.answers),
    myAnswer: m.answers[me]?.choice ?? null,
    correct: shown ? item.correct : null,
    answer: shown ? { name: nm.name, meaning: nm.meaning } : null,
    results: m.results,
    scores: m.scores,
    seconds: m.seconds,
  };
}

export const asma: GameModule<State, AsmaSettings> = {
  id: 'asma',

  start(ctx, participants, settings) {
    if (settings.mode === 'memory') {
      ctx.fx('start');
      return { mode: 'memory', settings, phase: 'play', g: memoryStart(ctx, participants, settings.pairs) };
    }
    return { mode: 'match', settings, m: matchEngine.start(ctx, participants, settings) };
  },

  act(ctx, s, by, a) {
    if (s.mode === 'match') return matchEngine.act(ctx, s.m, by, a);
    if (a.type === 'flip') memoryFlip(ctx, s, by, a.card);
  },

  tick(ctx, s) {
    if (s.mode === 'match') return matchEngine.tick!(ctx, s.m);
    const g = s.g;
    if (g.peekUntil === null || ctx.now < g.peekUntil) return false;
    g.peekUntil = null;
    g.flipped = [];
    if (g.order.length) g.turnIdx = (g.turnIdx + 1) % g.order.length;
    return true;
  },

  turnOf(s) {
    if (s.mode === 'match') return s.m.phase === 'ask' ? s.m.participants.filter((p) => !s.m.answers[p]) : [];
    return s.phase === 'play' && s.g.peekUntil === null && s.g.order.length ? [s.g.order[s.g.turnIdx]] : [];
  },

  botPlan(ctx, s, bots) {
    if (s.mode === 'match') return matchEngine.botPlan!(ctx, s.m, bots);
    const g = s.g;
    const id = g.order[g.turnIdx];
    if (s.phase !== 'play' || g.peekUntil !== null || !id || !(bots.includes(id) || ctx.isBot(id))) return;
    ctx.bot(id, `m:${g.moves}`, randDelay(900, 1500), { type: 'flip', card: memoryBotPick(g) });
  },

  view(_ctx, s, me): AsmaView {
    return s.mode === 'match' ? matchView(s.m, me) : memoryView(s);
  },

  onLeave(ctx, s, id) {
    if (s.mode === 'match') {
      matchEngine.onLeave?.(ctx, s.m, id);
      if (s.m.phase !== 'final' && !s.m.participants.some((p) => p !== id && (ctx.isConnected(p) || ctx.isBot(p)))) {
        s.m.phase = 'final';
        s.m.endsAt = null;
      }
      return;
    }
    const g = s.g;
    const i = g.order.indexOf(id);
    if (i < 0 || s.phase !== 'play') return;
    g.order.splice(i, 1);
    if (i === g.turnIdx) {
      // it was the leaver's turn: their cards go back face down and the next player starts clean
      g.flipped = [];
      g.peekUntil = null;
    } else if (i < g.turnIdx) g.turnIdx -= 1;
    if (!g.order.length) {
      memoryEnd(ctx, s);
      return;
    }
    g.turnIdx %= g.order.length;
  },

  patchSettings(settings, patch) {
    if (patch.mode === 'match' || patch.mode === 'memory') settings.mode = patch.mode;
    if (patch.dir === 'name' || patch.dir === 'meaning' || patch.dir === 'mix') settings.dir = patch.dir;
    if (isNum(patch.rounds)) settings.rounds = clamp(Math.round(patch.rounds), 5, 30);
    if (isNum(patch.seconds)) settings.seconds = clamp(Math.round(patch.seconds), 10, 40);
    if (isNum(patch.pairs) && (ASMA_PAIRS as readonly number[]).includes(patch.pairs)) settings.pairs = patch.pairs;
  },
};
