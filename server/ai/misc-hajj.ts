/**
 * «رحلة الحج» bots: which provision card to play before rolling, and how often a bot knows the answer.
 * Only public information is used (positions, the bot's own hand).
 *
 * easy   — the old bot: rules of thumb with some randomness, right answers 70 % of the time.
 * smart  — the expert's card choice, right answers 80 % of the time.
 * expert — cards are played at their moment, the one expected to gain the most squares on this roll
 *          (the die never carries a pilgrim past the next station: +2 right after a station, «الدليل»
 *          one or two squares before one, «ماء زمزم» any time — it is a whole extra roll, «الصدقة» when
 *          the friend it helps is behind); a full hand plays sooner, since new cards would be lost.
 *          Bot-vs-bot series showed playing cards often matters most: the old rules of thumb were
 *          already close, so the expert's edge is mostly knowledge: right answers 90 % of the time,
 *          and a little quicker on the station questions (the fastest right answer steps forward).
 */
import type { HajjZad, BotLevel } from '../../src/shared/protocol';
import type { ZadKind } from '../../src/shared/islamic';

/** The share of questions each level answers right. */
export const HAJJ_SKILL: Record<BotLevel, number> = { easy: 0.7, smart: 0.8, expert: 0.9 };

const nextStation = (pos: number, last: number) => Math.min(last, (Math.floor(pos / 4) + 1) * 4);

/** Expected squares gained by one roll from `pos` with a bonus, stopping at `stop`. */
function rollGain(pos: number, stop: number, bonus: number): number {
  let t = 0;
  for (let d = 1; d <= 6; d++) t += Math.min(stop, pos + d + bonus) - pos;
  return t / 6;
}

/** Expected squares one card gains on this turn (beyond a plain roll). */
export function cardGain(kind: ZadKind, pos: number, last: number, rivals: number[]): number {
  const first = nextStation(pos, last);
  const plain = rollGain(pos, first, 0);
  switch (kind) {
    case 'talbiya':
      return rollGain(pos, first, 2) - plain;
    case 'dalil':
      return first < last ? rollGain(pos, nextStation(first, last), 0) - plain : 0;
    case 'zamzam': {
      // the second roll starts where the first one stopped
      let t = 0;
      for (let d = 1; d <= 6; d++) {
        const at = Math.min(first, pos + d);
        t += rollGain(at, nextStation(at, last), 0);
      }
      return t / 6;
    }
    case 'sadaqa': {
      if (first - pos <= 1) return -1; // we would not move: only the friend would
      const mine = 1 + rollGain(pos + 1, first, 0) - plain;
      // the friend steps on too: harmless when they are far behind, costly when they lead
      const behind = Math.min(...rivals.map((r) => r - pos), 99);
      const help = behind < -6 ? 0.1 : behind < 0 ? 0.4 : 0.8;
      return mine - help;
    }
    default:
      return 0;
  }
}

/**
 * The card a bot plays before rolling (or null), and the friend for «الصدقة».
 * `others` = the other pilgrims (id, square).
 */
export function hajjCardChoice(
  hand: readonly HajjZad[],
  me: { pos: number },
  others: readonly { id: string; pos: number }[],
  last: number,
  handMax: number,
  level: BotLevel,
  rand: () => number = Math.random,
): { card: number; target?: string } | null {
  const lastOf = [...others].sort((x, y) => x.pos - y.pos)[0];
  if (level === 'easy') {
    // the old bot, unchanged
    const dist = nextStation(me.pos, last) - me.pos;
    const has = (k: ZadKind) => hand.find((c) => c.kind === k);
    const c =
      (dist <= 3 && nextStation(me.pos, last) < last && has('dalil')) ||
      (dist >= 3 && has('talbiya')) ||
      (rand() < 0.4 && has('zamzam')) ||
      (rand() < 0.3 && dist > 2 && has('sadaqa'));
    if (!c || (c.kind === 'sadaqa' && !lastOf)) return null;
    return { card: c.id, target: c.kind === 'sadaqa' ? lastOf?.id : undefined };
  }
  const full = hand.length >= handMax;
  const first = nextStation(me.pos, last);
  const dist = first - me.pos;
  const behind = lastOf ? lastOf.pos < me.pos : false;
  // what each card would gain on this roll, and whether this is the moment for it
  let best: HajjZad | null = null, bestV = 0;
  for (const c of hand) {
    const gain = c.kind === 'sabr' || (c.kind === 'sadaqa' && !lastOf) ? 0 : cardGain(c.kind, me.pos, last, others.map((o) => o.pos));
    const now =
      c.kind === 'dalil' ? first < last && (dist <= 2 || (full && dist <= 3))
      : c.kind === 'zamzam' ? true
      : c.kind === 'talbiya' ? dist >= 4 || (full && dist >= 3)
      : c.kind === 'sadaqa' ? dist >= 3 && (behind || full)
      : false;
    if (now && gain > bestV) (bestV = gain), (best = c);
  }
  if (!best) return null;
  return { card: best.id, target: best.kind === 'sadaqa' ? lastOf!.id : undefined };
}
