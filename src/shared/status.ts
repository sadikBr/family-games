/**
 * A person's status («حالتي»), shared by the app and the server; no React Native / Bun imports here.
 *
 * - What a phone chooses / sends: متاح (available, the default), بعيد (away), مشغول (busy: visible,
 *   but «لنلعب» sends no invitation), غير مرئي (invisible: looks exactly like غير متصل to everyone,
 *   invitations still arrive).
 * - What the others see: the same minus «غير مرئي», plus غير متصل (no app open, or invisible), and a
 *   «في لعبة» hint while the person is in a room that is playing (never for an invisible person).
 * - بعيد is also set automatically while the app is in the background or untouched for a while, and
 *   goes back to متاح by itself when the person returns — only when the automatic rule set it.
 */

/** What a phone chooses and sends («غير متصل» is not a choice). */
export type MyStatus = 'available' | 'away' | 'busy' | 'invisible';
/** What the others see. */
export type MemberStatus = 'available' | 'away' | 'busy' | 'offline';

export const MY_STATUSES: MyStatus[] = ['available', 'away', 'busy', 'invisible'];

/** The status from a message (anything else: null). */
export function cleanStatus(v: unknown): MyStatus | null {
  return typeof v === 'string' && (MY_STATUSES as string[]).includes(v) ? (v as MyStatus) : null;
}

/** Untouched this long while open → بعيد (when the chosen status is متاح). */
export const AUTO_AWAY_MS = 10 * 60_000;

/**
 * The status to send, from the chosen one and what the phone is doing. Only a chosen «متاح» turns
 * into «بعيد» (app in the background, or untouched for AUTO_AWAY_MS); a hand-chosen بعيد, مشغول or
 * غير مرئي always stays as it is, and the automatic بعيد ends as soon as the person is back.
 */
export function effectiveStatus(chosen: MyStatus, ctx: { active: boolean; idleMs: number }): MyStatus {
  if (chosen !== 'available') return chosen;
  return !ctx.active || ctx.idleMs >= AUTO_AWAY_MS ? 'away' : 'available';
}

/** Names (labels next to a face, the picker's chips). */
export const STATUS_LABEL: Record<MyStatus | MemberStatus, string> = {
  available: 'متاح',
  away: 'بعيد',
  busy: 'مشغول',
  invisible: 'غير مرئي',
  offline: 'غير متصل',
};

/** One line under the picker: what the chosen status means for me. */
export const STATUS_HINT: Record<MyStatus, string> = {
  available: 'حضورك ظاهر للعائلة، والدعوات تصلك',
  away: 'حضورك ظاهر بعلامة «بعيد»، والدعوات تصلك',
  busy: 'حضورك ظاهر بعلامة «مشغول»، دون دعوات «لنلعب»',
  invisible: 'حضورك مخفيّ: للعائلة «غير متصل»، والدعوات تصلك',
};

export const IN_GAME_LABEL = 'في لعبة';
