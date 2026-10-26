/**
 * «من الفاعل؟» bots. A bot decides from ITS OWN phone's view only (the same ClueView a person sees:
 * its hand, the public history, the cards shown to it), so it can never cheat.
 *
 * - easy: remembers the cards it has seen (its hand, cards shown to it); suggests unseen cards at
 *   random; accuses when one card per category is left unseen, and now and then risks a guess.
 * - smart: constraint tracking (who could hold what: hand sizes, who could not disprove, who showed
 *   one of three cards, wrong accusations), propagated to a fixed point; accuses only when certain.
 * - expert: the same plus a bounded search that proves which cards can still be in the secret file,
 *   suggestions that always teach something (an unknown card per open category, a "blank" — one of
 *   its own cards or a card known to be in the file — for a solved one), and when showing a card,
 *   the one that reveals least.
 *
 * Owners of a card: the players in seat order (0 … n−1) and the file (bit n). Each card is a bitmask
 * of its possible owners.
 */
import { CLUE_CARDS, CLUE_KINDS, type ClueKind, type ClueTriple, type ClueView } from '../../src/shared/games/clue';

const N = CLUE_CARDS.length;
const INDEX: Record<string, number> = Object.fromEntries(CLUE_CARDS.map((c, i) => [c.id, i]));
const RANGES: Record<ClueKind, number[]> = {
  who: CLUE_CARDS.map((c, i) => (c.kind === 'who' ? i : -1)).filter((i) => i >= 0),
  what: CLUE_CARDS.map((c, i) => (c.kind === 'what' ? i : -1)).filter((i) => i >= 0),
  where: CLUE_CARDS.map((c, i) => (c.kind === 'where' ? i : -1)).filter((i) => i >= 0),
};
const RANGE_LIST = CLUE_KINDS.map((k) => RANGES[k]);

export type BotLevelName = 'easy' | 'smart' | 'expert';
export type Rng = () => number;

const popcount = (x: number) => {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
};

export interface Knowledge {
  /** number of players (owners 0 … n−1; the file is bit n) */
  n: number;
  order: string[];
  me: number;
  counts: number[];
  /** possible owners of each card (0 for a card out of the game: its owner left) */
  poss: number[];
  live: boolean[];
  /** «p holds at least one of these» (p showed a card of a suggestion to someone else) */
  clauses: { p: number; cards: number[] }[];
  /** «not all three in the file» (a wrong accusation) */
  notAll: number[][];
  /** false: the facts contradict each other (never happens with a correct view) */
  ok: boolean;
}

/** Everything a seat knows, built from its own view. */
export function knowledgeFrom(view: ClueView, me: string): Knowledge {
  const order = view.order;
  const n = order.length;
  const pi = (id: string) => order.indexOf(id);
  const all = (1 << (n + 1)) - 1;
  const k: Knowledge = {
    n,
    order,
    me: pi(me),
    counts: order.map((p) => view.handCounts[p] ?? 0),
    poss: Array<number>(N).fill(all),
    live: Array<boolean>(N).fill(true),
    clauses: [],
    notAll: [],
    ok: true,
  };
  const fix = (c: number, owner: number) => {
    if (k.live[c]) k.poss[c] &= owner;
  };
  for (const r of view.revealed) {
    const c = INDEX[r.card];
    if (c === undefined) continue;
    if (pi(r.by) >= 0) fix(c, 1 << pi(r.by));
    else {
      k.live[c] = false;
      k.poss[c] = 0;
    }
  }
  if (k.me >= 0) {
    const mine = new Set(view.myHand.map((id) => INDEX[id]));
    for (let c = 0; c < N; c++) {
      if (!k.live[c]) continue;
      if (mine.has(c)) k.poss[c] = 1 << k.me;
      else k.poss[c] &= ~(1 << k.me);
    }
  }
  for (const e of view.log) {
    const cards = [e.who, e.what, e.where].map((id) => INDEX[id]).filter((c) => c !== undefined && k.live[c]);
    if (e.kind === 'accuse') {
      if (!e.correct && cards.length === 3) k.notAll.push(cards);
      continue;
    }
    for (const p of e.passed) {
      const i = pi(p);
      if (i >= 0) for (const c of cards) k.poss[c] &= ~(1 << i);
    }
    const s = e.shownBy ? pi(e.shownBy) : -1;
    if (s < 0) continue;
    if (e.card && INDEX[e.card] !== undefined) fix(INDEX[e.card], 1 << s);
    else if (cards.length) k.clauses.push({ p: s, cards });
  }
  k.ok = propagate(k.poss, k);
  return k;
}

/**
 * Propagate the constraints to a fixed point (in place). Returns false on a contradiction.
 * Sound: every removed owner is impossible given the facts.
 */
export function propagate(poss: number[], k: Pick<Knowledge, 'n' | 'counts' | 'live' | 'clauses' | 'notAll'>): boolean {
  const { n, counts, live } = k;
  const E = 1 << n;
  let changed = true;
  let guard = 0;
  while (changed) {
    changed = false;
    if (++guard > 400) break;
    for (let c = 0; c < N; c++) if (live[c] && poss[c] === 0) return false;
    // hand sizes
    for (let p = 0; p < n; p++) {
      const bit = 1 << p;
      let fixed = 0;
      let possible = 0;
      for (let c = 0; c < N; c++) {
        if (!live[c] || !(poss[c] & bit)) continue;
        possible++;
        if (poss[c] === bit) fixed++;
      }
      if (possible < counts[p] || fixed > counts[p]) return false;
      if (fixed === counts[p] && possible > fixed) {
        for (let c = 0; c < N; c++) {
          if (live[c] && poss[c] & bit && poss[c] !== bit) {
            poss[c] &= ~bit;
            if (!poss[c]) return false;
          }
        }
        changed = true;
      } else if (possible === counts[p] && fixed < possible) {
        for (let c = 0; c < N; c++) if (live[c] && poss[c] & bit) poss[c] = bit;
        changed = true;
      }
    }
    // the file: exactly one card of each category
    for (const range of RANGE_LIST) {
      let fixed = 0;
      let possible = 0;
      let last = -1;
      for (const c of range) {
        if (!live[c] || !(poss[c] & E)) continue;
        possible++;
        last = c;
        if (poss[c] === E) fixed++;
      }
      if (fixed > 1 || possible === 0) return false;
      if (fixed === 1 && possible > 1) {
        for (const c of range) {
          if (live[c] && poss[c] & E && poss[c] !== E) {
            poss[c] &= ~E;
            if (!poss[c]) return false;
          }
        }
        changed = true;
      } else if (possible === 1 && fixed === 0) {
        poss[last] = E;
        changed = true;
      }
    }
    // «holds at least one of»
    for (const cl of k.clauses) {
      const bit = 1 << cl.p;
      let sat = false;
      let cnt = 0;
      let last = -1;
      for (const c of cl.cards) {
        if (poss[c] === bit) {
          sat = true;
          break;
        }
        if (poss[c] & bit) {
          cnt++;
          last = c;
        }
      }
      if (sat) continue;
      if (cnt === 0) return false;
      if (cnt === 1) {
        poss[last] = bit;
        changed = true;
      }
    }
    // «not all three in the file»
    for (const t of k.notAll) {
      let e = 0;
      let other = -1;
      for (const c of t) {
        if (poss[c] === E) e++;
        else other = c;
      }
      if (e === 3) return false;
      if (e === 2 && poss[other] & E) {
        poss[other] &= ~E;
        if (!poss[other]) return false;
        changed = true;
      }
    }
  }
  return true;
}

interface Budget {
  /** search nodes left */
  left: number;
  /** performance.now() deadline */
  until: number;
}

/** Depth-first search for one complete deal consistent with everything. undefined: out of budget. */
function findDeal(poss: number[], k: Knowledge, budget: Budget): number[] | null | undefined {
  if (--budget.left < 0 || ((budget.left & 31) === 0 && performance.now() > budget.until)) {
    budget.left = -1;
    return undefined;
  }
  const p = poss.slice();
  if (!propagate(p, k)) return null;
  let pick = -1;
  let best = 99;
  for (let c = 0; c < N; c++) {
    if (!k.live[c]) continue;
    const pc = popcount(p[c]);
    if (pc > 1 && pc < best) {
      best = pc;
      pick = c;
    }
  }
  if (pick < 0) return p;
  const E = 1 << k.n;
  // players first (they hold most of the cards), the file last
  const bits: number[] = [];
  for (let o = 0; o <= k.n; o++) if (p[pick] & (1 << o)) bits.push(1 << o);
  bits.sort((a, b) => (a === E ? 1 : 0) - (b === E ? 1 : 0));
  let gaveUp = false;
  for (const b of bits) {
    const q = p.slice();
    q[pick] = b;
    const r = findDeal(q, k, budget);
    if (r) return r;
    if (r === undefined) gaveUp = true;
    if (budget.left < 0) return undefined;
  }
  return gaveUp ? undefined : null;
}

/**
 * Expert: prove, card by card, whether it can still be in the file (a deal exists with it there).
 * A card with no such deal loses its file bit. Bounded: when the budget runs out the card simply
 * stays possible (never a wrong certainty).
 */
export function refineFile(k: Knowledge, nodes = 2500, ms = 50): Knowledge {
  if (!k.ok) return k;
  const E = 1 << k.n;
  const budget: Budget = { left: nodes, until: performance.now() + ms };
  const witnessed = new Set<number>();
  const first = findDeal(k.poss, k, budget);
  if (first) for (let c = 0; c < N; c++) if (k.live[c] && first[c] === E) witnessed.add(c);
  for (let c = 0; c < N; c++) {
    if (!k.live[c] || !(k.poss[c] & E) || k.poss[c] === E || witnessed.has(c)) continue;
    if (budget.left <= 0) break;
    const q = k.poss.slice();
    q[c] = E;
    const r = findDeal(q, k, budget);
    if (r) {
      for (let d = 0; d < N; d++) if (k.live[d] && r[d] === E) witnessed.add(d);
    } else if (r === null) {
      k.poss[c] &= ~E;
      if (!propagate(k.poss, k)) {
        k.ok = false;
        return k;
      }
    }
  }
  return k;
}

/** The file as far as it is certain: the card of each category, or null. */
export function knownFile(k: Knowledge): Partial<Record<ClueKind, string>> {
  const E = 1 << k.n;
  const out: Partial<Record<ClueKind, string>> = {};
  if (!k.ok) return out;
  for (const kind of CLUE_KINDS) {
    const c = RANGES[kind].find((i) => k.live[i] && k.poss[i] === E);
    if (c !== undefined) out[kind] = CLUE_CARDS[c].id;
  }
  return out;
}

const pickOne = <T>(xs: T[], rng: Rng): T => xs[Math.floor(rng() * xs.length) % xs.length];

/** The cards a seat has seen (its hand, cards shown to it, cards of players who left). */
function seenBy(view: ClueView, me: string): Set<string> {
  const seen = new Set(view.myHand);
  for (const r of view.revealed) seen.add(r.card);
  for (const e of view.log) if (e.kind === 'suggest' && e.by === me && e.card) seen.add(e.card);
  return seen;
}

function easyFile(view: ClueView, me: string): { unseen: Record<ClueKind, string[]> } {
  const seen = seenBy(view, me);
  const unseen = Object.fromEntries(CLUE_KINDS.map((k) => [k, RANGES[k].map((i) => CLUE_CARDS[i].id).filter((id) => !seen.has(id))])) as Record<ClueKind, string[]>;
  return { unseen };
}

export type ClueBotMove = { type: 'suggest'; who: string; what: string; where: string } | { type: 'accuse'; who: string; what: string; where: string } | { type: 'end' };

/** The facts at a level ('easy' has none of this). */
export function botKnowledge(view: ClueView, me: string, level: BotLevelName): Knowledge {
  const k = knowledgeFrom(view, me);
  return level === 'expert' ? refineFile(k) : k;
}

/** A certain accusation, or null. */
export function certainAccusation(view: ClueView, me: string, level: BotLevelName): ClueTriple | null {
  if (level === 'easy') {
    const { unseen } = easyFile(view, me);
    return CLUE_KINDS.every((k) => unseen[k].length === 1) ? { who: unseen.who[0], what: unseen.what[0], where: unseen.where[0] } : null;
  }
  const f = knownFile(botKnowledge(view, me, level));
  return f.who && f.what && f.where ? { who: f.who, what: f.what, where: f.where } : null;
}

/** The bot's turn: a certain accusation, else a suggestion (easy may also risk a guess). */
export function clueTurn(view: ClueView, me: string, level: BotLevelName, rng: Rng = Math.random): ClueBotMove {
  const room = view.rooms[me] ?? null;
  if (level === 'easy') {
    const { unseen } = easyFile(view, me);
    if (CLUE_KINDS.every((k) => unseen[k].length === 1)) return { type: 'accuse', who: unseen.who[0], what: unseen.what[0], where: unseen.where[0] };
    if (CLUE_KINDS.every((k) => unseen[k].length && unseen[k].length <= 2) && rng() < 0.2) {
      return { type: 'accuse', who: pickOne(unseen.who, rng), what: pickOne(unseen.what, rng), where: pickOne(unseen.where, rng) };
    }
    const rooms = unseen.where.filter((r) => r !== room);
    const allRooms = RANGES.where.map((i) => CLUE_CARDS[i].id).filter((r) => r !== room);
    const anyOf = (kind: ClueKind) => RANGES[kind].map((i) => CLUE_CARDS[i].id);
    return {
      type: 'suggest',
      who: pickOne(unseen.who.length ? unseen.who : anyOf('who'), rng),
      what: pickOne(unseen.what.length ? unseen.what : anyOf('what'), rng),
      where: pickOne(rooms.length ? rooms : allRooms, rng),
    };
  }
  const k = botKnowledge(view, me, level);
  const f = knownFile(k);
  if (f.who && f.what && f.where) return { type: 'accuse', who: f.who, what: f.what, where: f.where };
  return { type: 'suggest', ...pickSuggestion(k, room, level, rng) };
}

/** After the suggestion: accuse when certain (easy: sometimes a guess), else end the turn. */
export function clueAfter(view: ClueView, me: string, level: BotLevelName, rng: Rng = Math.random): ClueBotMove {
  const sure = certainAccusation(view, me, level);
  if (sure) return { type: 'accuse', ...sure };
  if (level === 'easy') {
    const { unseen } = easyFile(view, me);
    if (CLUE_KINDS.every((k) => unseen[k].length && unseen[k].length <= 2) && rng() < 0.1) {
      return { type: 'accuse', who: pickOne(unseen.who, rng), what: pickOne(unseen.what, rng), where: pickOne(unseen.where, rng) };
    }
  }
  return { type: 'end' };
}

/**
 * A suggestion that teaches something: per category an unknown card that may be in the file, or —
 * when the category is solved — a blank (a card of mine or the file's card: nobody can show it).
 * The room must differ from the one the bot is in.
 */
export function pickSuggestion(k: Knowledge, room: string | null, level: BotLevelName, rng: Rng): ClueTriple {
  const E = 1 << k.n;
  const meBit = k.me >= 0 ? 1 << k.me : 0;
  const roomIdx = room ? INDEX[room] : -1;
  const out: Partial<ClueTriple> = {};
  for (const kind of CLUE_KINDS) {
    const range = RANGES[kind].filter((c) => k.live[c] && !(kind === 'where' && c === roomIdx));
    const unknown = range.filter((c) => k.poss[c] & E && k.poss[c] !== E);
    let pick: number;
    if (unknown.length) {
      if (level === 'expert') {
        // fewest possible owners first: the suggestion settles it more often
        const best = Math.min(...unknown.map((c) => popcount(k.poss[c])));
        pick = pickOne(
          unknown.filter((c) => popcount(k.poss[c]) === best),
          rng,
        );
      } else pick = pickOne(unknown, rng);
    } else {
      const blanks = range.filter((c) => k.poss[c] === meBit || k.poss[c] === E);
      if (blanks.length) pick = pickOne(blanks, rng);
      else {
        // no blank outside my room: a card held by the player asked last (least likely to hide the others)
        const askedLast = (c: number) => {
          let best = -1;
          for (let p = 0; p < k.n; p++) if (k.poss[c] & (1 << p)) best = Math.max(best, (p - k.me + k.n) % k.n);
          return best;
        };
        const score = range.map((c) => (popcount(k.poss[c]) === 1 ? askedLast(c) : -1));
        const top = Math.max(...score);
        pick = pickOne(
          range.filter((_, i) => score[i] === top),
          rng,
        );
      }
    }
    out[kind] = CLUE_CARDS[pick].id;
  }
  return out as ClueTriple;
}

/**
 * Which card to show when holding several of the suggestion. easy: any. Otherwise the one that
 * reveals least: a card already shown to the same player, else the card already shown to the most
 * players (the fewer different cards ever shown, the less the table learns), else at random.
 */
export function clueShow(view: ClueView, me: string, to: string, options: string[], level: BotLevelName, rng: Rng = Math.random): string {
  if (options.length <= 1 || level === 'easy') return pickOne(options, rng);
  const shownTo = new Map<string, Set<string>>();
  for (const e of view.log) {
    if (e.kind !== 'suggest' || e.shownBy !== me || !e.card) continue;
    if (!shownTo.has(e.card)) shownTo.set(e.card, new Set());
    shownTo.get(e.card)!.add(e.by);
  }
  const already = options.filter((c) => shownTo.get(c)?.has(to));
  if (already.length) return pickOne(already, rng);
  const most = Math.max(...options.map((c) => shownTo.get(c)?.size ?? 0));
  const wide = options.filter((c) => (shownTo.get(c)?.size ?? 0) === most);
  if (most > 0 || level === 'smart') return pickOne(wide, rng);
  // expert, nothing shown yet: a room first (9 rooms — the category that is slowest to solve)
  const rooms = wide.filter((c) => RANGES.where.includes(INDEX[c]));
  return pickOne(rooms.length ? rooms : wide, rng);
}
