/**
 * Reactions («التفاعلات»): a fixed, kid-safe set of emojis and short phrases a person can send to the
 * whole room during a game. The server only relays a key from this list (never free text) and limits
 * how often each person may send one (see reactionAllowed); every phone in the room then shows it big
 * in the middle of the screen (src/games/reactions.tsx).
 */

export const REACTION_KEYS = [
  'laugh',
  'clap',
  'wow',
  'heart',
  'fire',
  'sweat',
  'think',
  'monkey',
  'cry',
  'party',
  'bravo',
  'yasalam',
  'luck',
  'faster',
  'mashallah',
  'nonono',
  'waer',
] as const;

export type ReactionKey = (typeof REACTION_KEYS)[number];

export interface ReactionInfo {
  /** an emoji shown big, or a short phrase shown as big styled text */
  kind: 'emoji' | 'phrase';
  /** the emoji or the phrase itself */
  text: string;
  /** what a screen reader says for the picker's button */
  label: string;
  /** a phrase read aloud with «قراءة الأحداث بصوت» (with the vowel marks the voice needs) */
  voice?: string;
}

export const REACTIONS: Record<ReactionKey, ReactionInfo> = {
  laugh: { kind: 'emoji', text: '😂', label: 'ضحك' },
  clap: { kind: 'emoji', text: '👏', label: 'تصفيق' },
  wow: { kind: 'emoji', text: '😮', label: 'دهشة' },
  heart: { kind: 'emoji', text: '❤️', label: 'قلب' },
  fire: { kind: 'emoji', text: '🔥', label: 'نار' },
  sweat: { kind: 'emoji', text: '😅', label: 'ارتباك' },
  think: { kind: 'emoji', text: '🤔', label: 'تفكير' },
  monkey: { kind: 'emoji', text: '🙈', label: 'لا أرى' },
  cry: { kind: 'emoji', text: '😢', label: 'حزن' },
  party: { kind: 'emoji', text: '🎉', label: 'احتفال' },
  bravo: { kind: 'phrase', text: 'برافو!', label: 'برافو', voice: 'بْرَافُو!' },
  yasalam: { kind: 'phrase', text: 'يا سلام!', label: 'يا سلام', voice: 'يَا سَلَام!' },
  luck: { kind: 'phrase', text: 'حظ موفق', label: 'حظ موفق', voice: 'حَظٌّ مُوَفَّق' },
  faster: { kind: 'phrase', text: 'أسرع!', label: 'أسرع', voice: 'أَسْرِعْ!' },
  mashallah: { kind: 'phrase', text: 'ما شاء الله', label: 'ما شاء الله', voice: 'مَا شَاءَ الله' },
  nonono: { kind: 'phrase', text: 'لا لا لا!', label: 'لا لا لا', voice: 'لَا، لَا، لَا!' },
  waer: { kind: 'phrase', text: 'واعر!', label: 'واعر', voice: 'وَاعِرْ!' },
};

export function isReactionKey(k: unknown): k is ReactionKey {
  return typeof k === 'string' && (REACTION_KEYS as readonly string[]).includes(k);
}

/** At most one reaction every 3 s, and at most 3 in any 15 s, per person. */
export const REACTION_GAP_MS = 3000;
export const REACTION_BURST = 3;
export const REACTION_WINDOW_MS = 15000;

/**
 * May someone who sent reactions at `times` (ms, oldest first) send another one at `now`? Returns the
 * times to keep (with `now` added when allowed). The server decides; the phone uses the same rule to
 * show the button as resting.
 */
export function reactionAllowed(times: readonly number[], now: number): { ok: boolean; times: number[] } {
  const recent = times.filter((t) => now - t < REACTION_WINDOW_MS);
  const last = recent[recent.length - 1];
  if ((last !== undefined && now - last < REACTION_GAP_MS) || recent.length >= REACTION_BURST) return { ok: false, times: recent };
  return { ok: true, times: [...recent, now] };
}

/** How long until a reaction is allowed again (0 = now). */
export function reactionWait(times: readonly number[], now: number): number {
  const recent = times.filter((t) => now - t < REACTION_WINDOW_MS);
  if (!recent.length) return 0;
  const byGap = recent[recent.length - 1] + REACTION_GAP_MS - now;
  const byBurst = recent.length >= REACTION_BURST ? recent[recent.length - REACTION_BURST] + REACTION_WINDOW_MS - now : 0;
  return Math.max(0, byGap, byBurst);
}
