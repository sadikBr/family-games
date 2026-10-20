/**
 * «البلياردو» — what a shot did under the rules (8-ball as played in Moroccan cafés, close to the WPA
 * rules; 9-ball without push-out or the three-foul rule; snooker without the free ball, the miss rule
 * or "play again"). Pure functions: the game module and the bots judge every shot (real or imagined)
 * with the same code.
 */
import { groupBalls, groupOf, type BilliardsGroup, type BilliardsMode, type SnookerOn } from '../src/shared/games/billiards';
import { BLACK, COLOURS, isColour, isRed, snookerValue, type SimResult } from '../src/shared/games/billiards-physics';

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

/** 8-ball and 9-ball (snooker: judgeSnooker). */
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

/* ------------------------------------------------------------------ */
/* Snooker                                                              */
/* ------------------------------------------------------------------ */

/** What the rules need to know about a snooker table before the shot. */
export interface SnookerSit {
  /** object balls on the table before the shot (the cue ball ignored) */
  onTable: number[];
  /** a red, the colour after a red («الكرة المختارة»), or a given colour once the reds are gone */
  on: SnookerOn;
  /** the colour nominated when a colour is on (null: none) */
  nominated: number | null;
}

export type SnookerFoul = 'scratch' | 'none' | 'wrong' | 'potWrong';

export interface SnookerVerdict {
  foul: SnookerFoul | null;
  /** points to the opponent (fouls only): max(4, the ball on, the ball hit first, any ball wrongly potted) */
  penalty: number;
  /** points to the shooter (legal shots only) */
  points: number;
  /** the shooter carries on */
  cont: boolean;
  /** the balls pocketed (cue ball excluded), in order */
  potted: number[];
  /** colours that come back on their spots */
  respot: number[];
  /** the ball first hit when it was not a legal one (for the reason) */
  wrongFirst: number | null;
  /** the last black went down, or a foul while only the black was left: the frame is over */
  frameOver: boolean;
}

/** The balls the shooter may hit first. */
export function snookerTargets(onTable: number[], on: SnookerOn, nominated: number | null = null): number[] {
  const obj = onTable.filter((b) => b !== 0);
  if (on === 'red') return obj.filter(isRed);
  if (on === 'colour') return nominated !== null && obj.includes(nominated) ? [nominated] : obj.filter(isColour);
  return obj.includes(on) ? [on] : [];
}

/** What is on for a new visit to the table: a red while any is left, else the lowest colour. */
export function snookerFirstOn(onTable: number[]): SnookerOn {
  if (onTable.some(isRed)) return 'red';
  const c = COLOURS.find((x) => onTable.includes(x));
  return c ?? BLACK;
}

/** What is on next after a shot (`cont`: the shooter carries on). */
export function snookerNextOn(onTable: number[], on: SnookerOn, cont: boolean): SnookerOn {
  if (cont && on === 'red') return 'colour';
  return snookerFirstOn(onTable);
}

/** The points still on the table: 8 per red, the colour after a red, then the colours left. */
export function snookerRemaining(onTable: number[], on: SnookerOn): number {
  const reds = onTable.filter(isRed).length;
  const colours = COLOURS.filter((c) => onTable.includes(c)).reduce((a, c) => a + snookerValue(c), 0);
  if (reds || on === 'colour') return reds * 8 + (on === 'colour' ? 7 : 0) + 27;
  return colours;
}

export function judgeSnooker(s: SnookerSit, r: Pick<SimResult, 'pocketed' | 'firstHit'>): SnookerVerdict {
  const potted = r.pocketed.filter((p) => p.id !== 0).map((p) => p.id);
  const scratch = r.pocketed.some((p) => p.id === 0);
  const legal = snookerTargets(s.onTable, s.on, s.nominated);
  // on a colour with nothing nominated, the colour hit first counts as the nominated one
  const nominated = s.on === 'colour' ? (s.nominated ?? (r.firstHit !== null && isColour(r.firstHit) ? r.firstHit : null)) : null;
  const onValue = s.on === 'red' ? 1 : s.on === 'colour' ? (nominated !== null ? snookerValue(nominated) : 0) : snookerValue(s.on);
  const potOk = (b: number) => (s.on === 'red' ? isRed(b) : s.on === 'colour' ? b === nominated : b === s.on);
  const wrongPots = potted.filter((b) => !potOk(b));
  const firstOk = r.firstHit !== null && legal.includes(r.firstHit);
  let foul: SnookerFoul | null = null;
  if (scratch) foul = 'scratch';
  else if (r.firstHit === null) foul = 'none';
  else if (!firstOk) foul = 'wrong';
  else if (wrongPots.length) foul = 'potWrong';
  const v: SnookerVerdict = {
    foul,
    penalty: 0,
    points: 0,
    cont: false,
    potted,
    respot: [],
    wrongFirst: r.firstHit !== null && !firstOk ? r.firstHit : null,
    frameOver: false,
  };
  if (foul) {
    v.penalty = Math.max(4, onValue, r.firstHit !== null ? snookerValue(r.firstHit) : 0, ...wrongPots.map(snookerValue));
    v.respot = potted.filter(isColour);
    if (s.on === BLACK) {
      v.frameOver = true;
      v.respot = [];
    }
    return v;
  }
  if (s.on === 'red') v.points = potted.length;
  else if (potted.length) v.points = onValue;
  v.cont = potted.length > 0;
  // a colour potted after a red is re-spotted; once the reds are gone the colours stay down
  if (s.on === 'colour') v.respot = potted.filter(isColour);
  if (s.on === BLACK && potted.includes(BLACK)) v.frameOver = true;
  return v;
}

/** The short reason of a snooker foul, for the banner. */
export function snookerFoulText(v: Pick<SnookerVerdict, 'foul' | 'wrongFirst' | 'potted'>, on: SnookerOn): string {
  switch (v.foul) {
    case 'scratch':
      return 'سقوط الكرة البيضاء';
    case 'none':
      return 'لا لمس لأي كرة';
    case 'wrong':
      return `أول لمسة على ${v.wrongFirst !== null ? SNOOKER_BALL_NAME[v.wrongFirst] ?? 'كرة حمراء' : 'كرة أخرى'}، والمطلوب ${onName(on)}`;
    case 'potWrong':
      return 'دخول كرة غير مطلوبة';
    default:
      return '';
  }
}

/** «الكرة الصفراء» … «الكرة السوداء» (a red: «كرة حمراء»). */
export const SNOOKER_BALL_NAME: Record<number, string> = {
  16: 'الكرة الصفراء',
  17: 'الكرة الخضراء',
  18: 'الكرة البنية',
  19: 'الكرة الزرقاء',
  20: 'الكرة الوردية',
  21: 'الكرة السوداء',
};
for (let id = 22; id <= 36; id++) SNOOKER_BALL_NAME[id] = 'كرة حمراء';

/** «كرة حمراء» / «لون» / «الكرة الصفراء». */
export const onName = (on: SnookerOn) => (on === 'red' ? 'كرة حمراء' : on === 'colour' ? 'لون' : SNOOKER_BALL_NAME[on]);
