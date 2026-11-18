/**
 * «الانقلاب» — the bots' thinking. A bot only knows what everyone knows (coins, hidden-card counts, the cards
 * turned face up, the public history of claims and caught bluffs) plus its own hidden cards. Never the deck,
 * never another hand.
 *
 * Three strengths (the room's «البوتات»):
 *  - easy: plays mostly honestly, bluffs now and then, challenges almost at random, coups late.
 *  - smart: reads the table (how many copies of a role are still unseen, how often people tell the truth),
 *    bluffs a little more, coups at 7, aims at the leader.
 *  - expert: weighs every challenge (chance the claim is true × what is at stake), keeps its story consistent
 *    (bluffs the roles it already claimed, keeps that card when it must reveal one), bluffs blocks more.
 * Measured over 300 three-player games: an expert against two easy bots wins about half (a fair share is a
 * third), and against two smart bots a little more than its share.
 */
import { ACTION_INFO, COUP_COPIES, COUP_COST, COUP_FORCE, COUP_INFORM_COST, COUP_ROLES, type CoupAction, type CoupRole } from '../src/shared/games/coup';
import type { BotLevel } from '../src/shared/protocol';

export type Rnd = () => number;

/** What a bot may look at. */
export interface BotInfo {
  me: string;
  hand: CoupRole[];
  seats: Record<string, { coins: number; hidden: number; revealed: CoupRole[]; out: boolean }>;
  /** players still in, seat order */
  alive: string[];
  /** every role each player claimed, oldest first (actions and blocks) */
  claims: Record<string, CoupRole[]>;
  /** roles a player was caught without (until they changed cards) */
  lacks: Record<string, CoupRole[]>;
}

/** How much a bot likes to keep a role. */
const VALUE: Record<CoupRole, number> = { wazir: 5, washi: 4.2, qursan: 3.6, harisa: 3.2, safir: 2.6 };

const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

const revealedCount = (info: BotInfo, role: CoupRole) => Object.values(info.seats).reduce((n, s) => n + s.revealed.filter((r) => r === role).length, 0);
const totalRevealed = (info: BotInfo) => Object.values(info.seats).reduce((n, s) => n + s.revealed.length, 0);

/** Copies of `role` the bot can't see (in other hands or in the deck). */
export function unseenCopies(info: BotInfo, role: CoupRole): number {
  return Math.max(0, COUP_COPIES - revealedCount(info, role) - info.hand.filter((r) => r === role).length);
}

/** The bot's estimate that `who` holds `role` right now. */
export function chanceHolds(info: BotInfo, who: string, role: CoupRole): number {
  const copies = unseenCopies(info, role);
  if (copies <= 0) return 0;
  if (info.lacks[who]?.includes(role)) return 0.05;
  const pool = COUP_ROLES.length * COUP_COPIES - totalRevealed(info) - info.hand.length;
  const k = info.seats[who]?.hidden ?? 0;
  let p = pool > 0 ? 1 - choose(pool - copies, k) / choose(pool, k) : 0;
  // what they claimed before: the same role again makes it likelier; many different roles, less so
  const said = info.claims[who] ?? [];
  const same = said.filter((r) => r === role).length;
  const other = new Set(said.filter((r) => r !== role)).size;
  if (same > 1) p += (1 - p) * 0.25;
  if (other >= 2) p *= 0.8;
  return Math.max(0, Math.min(1, p));
}

const others = (info: BotInfo) => info.alive.filter((p) => p !== info.me);

/** The most dangerous player: most influence, then most coins (ties at random). */
export function strongest(info: BotInfo, rnd: Rnd, among = others(info)): string | null {
  if (!among.length) return null;
  const score = (id: string) => info.seats[id].hidden * 20 + info.seats[id].coins + rnd() * 0.5;
  return [...among].sort((a, b) => score(b) - score(a))[0];
}

export interface TurnPlan {
  action: CoupAction;
  target: string | null;
}

const BLUFF: Record<BotLevel, number> = { easy: 0.1, smart: 0.2, expert: 0.27 };
const COUP_AT7: Record<BotLevel, number> = { easy: 0.45, smart: 0.85, expert: 0.95 };

/** The bot's move on its turn. */
export function botTurn(level: BotLevel, info: BotInfo, rnd: Rnd): TurnPlan {
  const me = info.seats[info.me];
  const coins = me.coins;
  const lead = strongest(info, rnd);
  if (!lead) return { action: 'income', target: null };
  if (coins >= COUP_FORCE) return { action: 'coup', target: lead };
  if (coins >= COUP_COST && rnd() < COUP_AT7[level]) return { action: 'coup', target: lead };
  const has = (r: CoupRole) => info.hand.includes(r);
  // someone who blocked «الاستيلاء» before will likely block it again
  const blocksSeize = (id: string) => (info.claims[id] ?? []).some((r) => r === 'qursan' || r === 'safir');
  const richest = (avoidBlockers: boolean) => {
    const cands = others(info).filter((p) => info.seats[p].coins >= 2 && !(avoidBlockers && blocksSeize(p) && rnd() < 0.85));
    if (!cands.length) return null;
    const score = (id: string) => info.seats[id].coins + rnd();
    return [...cands].sort((a, b) => score(b) - score(a))[0];
  };
  const informTarget = () => lead;

  // honest moves first
  if (has('washi') && coins >= COUP_INFORM_COST && (level !== 'easy' || rnd() < 0.6)) {
    const t = informTarget();
    const guarded = level !== 'easy' && (info.claims[t] ?? []).includes('harisa') && rnd() < 0.6;
    if (!guarded) return { action: 'inform', target: t };
  }
  if (has('wazir')) return { action: 'tax', target: null };
  if (has('qursan')) {
    const t = richest(level !== 'easy' || rnd() < 0.5);
    if (t) return { action: 'seize', target: t };
  }
  if (has('safir') && (level === 'easy' ? rnd() < 0.5 : info.hand.length === 2 && (info.hand[0] === info.hand[1] || info.hand.every((r) => VALUE[r] < 3.5)))) {
    return { action: 'exchange', target: null };
  }

  // a bluff
  if (rnd() < BLUFF[level] * (info.hand.length === 1 ? 0.6 : 1)) {
    const said = info.claims[info.me] ?? [];
    const ok = (r: CoupRole) => level === 'easy' || revealedCount(info, r) < 2;
    let role: CoupRole | null = null;
    if (level === 'expert') role = said.findLast((r) => (r === 'wazir' || r === 'qursan' || (r === 'washi' && coins >= COUP_INFORM_COST)) && ok(r)) ?? null;
    if (!role) {
      const opts: CoupRole[] = ['wazir', 'wazir', 'qursan', ...(coins >= COUP_INFORM_COST ? (['washi'] as CoupRole[]) : [])];
      role = opts.filter(ok)[Math.floor(rnd() * Math.max(1, opts.filter(ok).length))] ?? null;
    }
    if (role === 'wazir') return { action: 'tax', target: null };
    if (role === 'washi') return { action: 'inform', target: informTarget() };
    if (role === 'qursan') {
      const t = richest(true);
      if (t) return { action: 'seize', target: t };
    }
  }

  // aid unless someone at the table seems to be «الوزير»
  const wazirAround = others(info).some((p) => (info.claims[p] ?? []).includes('wazir') && !info.lacks[p]?.includes('wazir'));
  if (!wazirAround || (level === 'easy' && rnd() < 0.5)) return { action: 'aid', target: null };
  return { action: 'income', target: null };
}

/** What is at stake in a claim, for the bot thinking of a challenge. */
export type Stakes = 'me' | 'big' | 'small';

/** Should the bot challenge `claimer`'s claim of `role`? */
export function botChallenge(level: BotLevel, info: BotInfo, claimer: string, role: CoupRole, stakes: Stakes, rnd: Rnd, lethal = false, onBlock = false): boolean {
  const prior = chanceHolds(info, claimer, role);
  if (prior <= 0.001) return level === 'easy' ? rnd() < 0.7 : true;
  if (level === 'easy') return rnd() < (stakes === 'me' ? 0.1 : 0.03);
  // most claims are honest: how often would someone without the card claim it anyway?
  const said = new Set(info.claims[claimer] ?? []);
  let beta = onBlock ? 0.4 : 0.3;
  if (level === 'expert' && said.size >= 3) beta += 0.15;
  if (onBlock && info.seats[claimer]?.hidden === 1) beta += 0.2;
  const p = prior / (prior + (1 - prior) * beta);
  // a «الوشاية» on my last card: I lose it anyway unless the claim is a lie (or I bluff a block next)
  if (lethal) return p < (level === 'expert' ? 0.45 : 0.4);
  const mine = info.hand.length;
  const loss = mine === 1 ? 3.2 : 1.3;
  const gain = 1 + (stakes === 'me' ? 1.3 : stakes === 'big' ? 0.6 : 0.1);
  const ev = (1 - p) * gain - p * loss;
  if (level === 'smart') return ev > 0.2 && rnd() < 0.8;
  return ev > 0.35;
}

/** Which role, if any, the bot blocks with. */
export function botBlock(level: BotLevel, info: BotInfo, action: CoupAction, actor: string, rnd: Rnd): CoupRole | null {
  const roles = ACTION_INFO[action].blockedBy;
  const held = roles.find((r) => info.hand.includes(r));
  if (held) return held;
  // a bluff: never on a role whose three copies are all face up
  const usable = roles.filter((r) => revealedCount(info, r) < COUP_COPIES && (level === 'easy' || revealedCount(info, r) < 2));
  if (!usable.length) return null;
  const pickRole = () => [...usable].sort((a, b) => unseenCopies(info, b) - unseenCopies(info, a))[0];
  let chance = 0;
  if (action === 'inform') chance = info.hand.length === 1 ? { easy: 0.5, smart: 0.8, expert: 0.9 }[level] : { easy: 0.2, smart: 0.3, expert: 0.35 }[level];
  else if (action === 'seize') chance = { easy: 0.12, smart: 0.22, expert: 0.3 }[level];
  else if (action === 'aid') {
    const lead = strongest(info, () => 0.5);
    chance = actor === lead ? { easy: 0.03, smart: 0.08, expert: 0.14 }[level] : 0.02;
  }
  // the expert stays consistent: a role it claimed before is a better bluff
  if (level === 'expert' && usable.some((r) => (info.claims[info.me] ?? []).includes(r))) chance = Math.min(0.95, chance * 1.4);
  return rnd() < chance ? (usable.find((r) => (info.claims[info.me] ?? []).includes(r)) ?? pickRole()) : null;
}

/** Which hidden card to turn face up (an index into the hand). */
export function botLoseIdx(level: BotLevel, info: BotInfo, rnd: Rnd): number {
  const h = info.hand;
  if (h.length <= 1) return 0;
  if (level === 'easy') return Math.floor(rnd() * h.length);
  const last = (info.claims[info.me] ?? []).at(-1);
  const v = (r: CoupRole) => VALUE[r] + (level === 'expert' && r === last ? 1.2 : 0);
  let worst = 0;
  for (let i = 1; i < h.length; i++) if (v(h[i]) < v(h[worst])) worst = i;
  return worst;
}

/** Which cards to keep after «التبديل»: `keep` indices of `cards`. */
export function botKeep(level: BotLevel, cards: CoupRole[], keep: number, rnd: Rnd): number[] {
  const idx = cards.map((_, i) => i);
  if (level === 'easy') {
    const sh = idx.sort(() => rnd() - 0.5);
    return sh.slice(0, keep);
  }
  const chosen: number[] = [];
  const left = [...idx];
  while (chosen.length < keep && left.length) {
    // the best value, two different roles when possible
    left.sort((a, b) => score(b) - score(a));
    chosen.push(left.shift()!);
  }
  return chosen;
  function score(i: number) {
    const r = cards[i];
    return VALUE[r] - (chosen.some((c) => cards[c] === r) ? 3 : 0);
  }
}
