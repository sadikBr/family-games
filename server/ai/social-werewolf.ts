/**
 * «الذئب» bots that reason from what was said and seen, never from the hidden roles. A bot knows:
 * - its own role (and its pack, if it is a wolf; what it checked, if it is the seer);
 * - who died in the night and who the village voted out, and on which day (public);
 * - every accusation the bots made in the day, and by whom (public, shown one by one).
 *
 * Night victims are (almost always) innocent, so:
 * - accusing someone who later died in the night = having accused an innocent → suspicious;
 * - being accused by someone who later died in the night → suspicious (wolves silence their accusers);
 * - accusing ME (I know I'm innocent) → suspicious, for that bot only.
 * Accusations then count for their target, each weighted by how trustworthy the accuser looks; an accuser
 * who keeps naming the same player day after day counts more (that's what a seer does).
 */
import { isWolfRole, type WolfRole } from '../../src/shared/protocol';

export interface WolfAcc {
  day: number;
  by: string;
  target: string;
}

/** The public record the bots reason from (kept by the game as things happen). */
export interface WolfPublic {
  /** night victims: id → night */
  nightDead: Record<string, number>;
  /** voted out (or shot) by day: id → day */
  out: Record<string, number>;
  acc: WolfAcc[];
}

export interface WolfSeen {
  participants: string[];
  alive: Record<string, boolean>;
  mayorId: string | null;
  pub: WolfPublic;
}

export const emptyPublic = (): WolfPublic => ({ nightDead: {}, out: {}, acc: [] });

/** Suspicion before weighing accusations: what the night deaths say about each player. */
function baseScores(s: WolfSeen, viewer: string | null, viewerInnocent: boolean): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of s.participants) m.set(id, 0);
  for (const a of s.pub.acc) {
    const killedAt = s.pub.nightDead[a.target];
    // accused someone who then died in the night (after the accusation): accused an innocent
    if (killedAt !== undefined && killedAt > a.day) m.set(a.by, (m.get(a.by) ?? 0) + 1);
    // was accused by someone the wolves then killed
    const accuserKilled = s.pub.nightDead[a.by];
    if (accuserKilled !== undefined && accuserKilled > a.day) m.set(a.target, (m.get(a.target) ?? 0) + 1.5);
    // accused me, and I know I'm innocent
    if (viewer && viewerInnocent && a.target === viewer) m.set(a.by, (m.get(a.by) ?? 0) + 2);
  }
  return m;
}

/**
 * How suspicious each living player looks to `viewer` (null = an outsider's view, with no private
 * knowledge — what the village as a whole would think). Higher = more likely a wolf.
 */
export function villageScores(s: WolfSeen, viewer: string | null, viewerInnocent = true): Map<string, number> {
  const base = baseScores(s, viewer, viewerInnocent);
  const trust = (id: string) => Math.max(0.15, Math.min(1.3, 1 - 0.35 * (base.get(id) ?? 0)));
  const out = new Map<string, number>();
  for (const id of s.participants) if (s.alive[id]) out.set(id, base.get(id) ?? 0);
  // each accuser counts once a day for a target; naming the same player on several days counts more
  const days = new Map<string, Set<number>>();
  for (const a of s.pub.acc) {
    if (a.by === viewer) continue;
    const k = `${a.by}|${a.target}`;
    if (!days.has(k)) days.set(k, new Set());
    days.get(k)!.add(a.day);
  }
  for (const [k, ds] of days) {
    const [by, target] = k.split('|');
    if (!out.has(target)) continue;
    const persistence = ds.size > 1 ? 1 + 0.5 * (ds.size - 1) : 1;
    out.set(target, out.get(target)! + 0.6 * trust(by) * persistence);
  }
  if (viewer) out.delete(viewer);
  return out;
}

/** The highest-scoring id, ties broken by `tie` (deterministic per day so bots on one side agree). */
export function top(scores: Map<string, number>, tie: (id: string) => number, exclude: (id: string) => boolean = () => false): string | null {
  let best: string | null = null;
  let bestV = -Infinity;
  for (const [id, v] of scores) {
    if (exclude(id)) continue;
    const w = v + tie(id) * 1e-3;
    if (w > bestV) {
      best = id;
      bestV = w;
    }
  }
  return best;
}

/**
 * Who the wolves fear most among the living non-wolves: whoever accused pack members (repeatedly: likely
 * the seer), the mayor (a double vote), and anyone the village trusts (low suspicion).
 */
export function threatScores(s: WolfSeen, pack: string[], prey: string[]): Map<string, number> {
  const village = villageScores(s, null);
  const out = new Map<string, number>();
  for (const id of prey) {
    let v = 0;
    const hits = new Set<number>();
    for (const a of s.pub.acc) if (a.by === id && pack.includes(a.target)) hits.add(a.day);
    v += 1.5 * hits.size;
    if (s.mayorId === id) v += 1;
    v -= 0.3 * (village.get(id) ?? 0);
    out.set(id, v);
  }
  return out;
}

/** Who a protector (doctor / guard) expects the wolves to go for, from public information only. */
export function protectScores(s: WolfSeen, candidates: string[], self: string): Map<string, number> {
  const village = villageScores(s, null);
  const out = new Map<string, number>();
  for (const id of candidates) {
    // whoever accused the players the village suspects most is who the wolves want gone
    let v = 0;
    for (const a of s.pub.acc) if (a.by === id && s.alive[a.target]) v += Math.max(0, village.get(a.target) ?? 0) * 0.5;
    if (s.mayorId === id) v += 1;
    if (id === self) v += 0.4; // a protector is precious to the village too
    v -= 0.3 * (village.get(id) ?? 0);
    out.set(id, v);
  }
  return out;
}

/** Roles that play for the village (the tanner plays for himself). */
export const villageRole = (r: WolfRole | undefined) => !!r && !isWolfRole(r) && r !== 'tanner';
