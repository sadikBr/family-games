/**
 * «البلياردو» — what a shot did under the rules (8-ball as played in Moroccan cafés, close to the WPA
 * rules; 9-ball without push-out or the three-foul rule). Pure functions: the game module and the bots
 * judge every shot (real or imagined) with the same code.
 */
import { groupBalls, groupOf, type BilliardsGroup, type BilliardsMode } from '../src/shared/games/billiards';
import type { SimResult } from '../src/shared/games/billiards-physics';

/** What the rules need to know about the table before the shot. */
export interface Situation {
  mode: BilliardsMode;
  /** balls on the table before the shot (the cue ball included or not) */
  onTable: number[];
  /** 8-ball: the shooter's group (null: the table is open) */
  group: BilliardsGroup | null;
  breakShot: boolean;
  /** 8-ball: the pocket called for the 8 (null: none / not required) */
  called: number | null;
  callPocket: boolean;
}

export type FoulKind = 'scratch' | 'none' | 'wrong' | 'eightFirst' | 'rail';

export interface Verdict {
  foul: FoulKind | null;
  /** the shooter keeps the table */
  cont: boolean;
  /** 8-ball: the group the shooter gets with this shot */
  assign: BilliardsGroup | null;
  /** the rack is decided by this shot: won or lost by the shooter */
  rack: 'win' | 'lose' | null;
  /** a ball that comes back on the foot spot (the 8 on the break, the 9 on a foul) */
  respot: number | null;
  /** 8-ball: why the rack was lost */
  loseWhy?: 'early' | 'pocket' | 'foul';
  /** the balls pocketed (cue ball excluded), in order */
  potted: number[];
}

/** The balls the shooter may legally hit first. */
export function legalTargets(s: Pick<Situation, 'mode' | 'onTable' | 'group'>): number[] {
  const on = s.onTable.filter((b) => b !== 0);
  if (s.mode === 'nine') return on.length ? [Math.min(...on)] : [];
  if (!s.group) {
    const any = on.filter((b) => b !== 8);
    return any.length ? any : on;
  }
  const mine = groupBalls(s.group).filter((b) => on.includes(b));
  return mine.length ? mine : on.includes(8) ? [8] : [];
}

/** The shooter is on the 8 (their group is cleared). */
export const onEight = (s: Pick<Situation, 'mode' | 'onTable' | 'group'>) =>
  s.mode === 'eight' && !!s.group && legalTargets(s).length === 1 && legalTargets(s)[0] === 8;

export function judge(s: Situation, r: Pick<SimResult, 'pocketed' | 'firstHit' | 'railAfterContact'>): Verdict {
  return s.mode === 'nine' ? judgeNine(s, r) : judgeEight(s, r);
}

function baseFoul(s: Situation, r: Pick<SimResult, 'pocketed' | 'firstHit' | 'railAfterContact'>, targets: number[]): FoulKind | null {
  const potted = r.pocketed.filter((p) => p.id !== 0);
  if (r.pocketed.some((p) => p.id === 0)) return 'scratch';
  if (r.firstHit === null) return 'none';
  if (!targets.includes(r.firstHit)) return s.mode === 'eight' && r.firstHit === 8 ? 'eightFirst' : 'wrong';
  if (!potted.length && !r.railAfterContact) return 'rail';
  return null;
}

function judgeEight(s: Situation, r: Pick<SimResult, 'pocketed' | 'firstHit' | 'railAfterContact'>): Verdict {
  const targets = legalTargets(s);
  const wasOnEight = onEight(s);
  const potted = r.pocketed.filter((p) => p.id !== 0).map((p) => p.id);
  const eight = r.pocketed.find((p) => p.id === 8);
  let foul = baseFoul(s, r, targets);
  // the break: any ball may be hit first (the rack is in front of the cue ball)
  if (s.breakShot && (foul === 'wrong' || foul === 'eightFirst')) foul = null;
  const v: Verdict = { foul, cont: false, assign: null, rack: null, respot: null, potted };

  if (eight) {
    if (s.breakShot) {
      // the 8 on the break comes back; the breaker carries on unless it was a foul
      v.respot = 8;
      v.cont = !foul;
      return v;
    }
    if (!wasOnEight) return { ...v, rack: 'lose', loseWhy: 'early' };
    if (foul) return { ...v, rack: 'lose', loseWhy: 'foul' };
    if (s.callPocket && s.called !== null && s.called !== eight.pocket) return { ...v, rack: 'lose', loseWhy: 'pocket' };
    return { ...v, rack: 'win' };
  }
  if (foul) return v;
  if (s.breakShot) {
    v.cont = potted.length > 0;
    return v;
  }
  let group = s.group;
  if (!group) {
    const first = potted.map(groupOf).find((g) => g);
    if (first) {
      v.assign = first;
      group = first;
    }
  }
  v.cont = !!group && potted.some((b) => groupOf(b) === group);
  return v;
}

function judgeNine(s: Situation, r: Pick<SimResult, 'pocketed' | 'firstHit' | 'railAfterContact'>): Verdict {
  const targets = legalTargets(s);
  const potted = r.pocketed.filter((p) => p.id !== 0).map((p) => p.id);
  const foul = baseFoul(s, r, targets);
  const v: Verdict = { foul, cont: false, assign: null, rack: null, respot: null, potted };
  const nine = potted.includes(9);
  if (foul) {
    if (nine) v.respot = 9;
    return v;
  }
  if (nine) return { ...v, rack: 'win' };
  v.cont = potted.length > 0;
  return v;
}

/** The short reason of a foul, for the banner. */
export function foulText(f: FoulKind, lowest?: number): string {
  switch (f) {
    case 'scratch':
      return 'سقوط الكرة البيضاء';
    case 'none':
      return 'لا لمس لأي كرة';
    case 'wrong':
      return lowest !== undefined ? `أول لمسة ليست على الكرة ${lowest}` : 'أول لمسة على كرة الخصم';
    case 'eightFirst':
      return 'أول لمسة على الكرة 8';
    case 'rail':
      return 'لا كرة في الجيب ولا كرة على الحافة';
  }
}
