/**
 * Groups («المجموعات»): a family saved once, so anyone in it can start a room with everyone.
 * Shared by the app and the server; no React Native / Bun imports here.
 */

/** Group codes: 6 characters, no look-alikes (no 0/O, no 1/I). */
export const GROUP_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const GROUP_CODE_LEN = 6;
export const GROUP_NAME_MAX = 30;
/** A phone can be in this many groups at most. */
export const MAX_GROUPS_PER_PLAYER = 20;
/** A group holds this many members at most. */
export const MAX_GROUP_MEMBERS = 30;

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * What someone typed or pasted → a code to look up: upper case, Arabic/Persian digits as 0–9,
 * spaces and dashes dropped. Returns '' when it can't be a group code.
 */
export function normalizeGroupCode(input: unknown): string {
  if (typeof input !== 'string') return '';
  let s = '';
  for (const ch of input.toUpperCase()) {
    const a = ARABIC_DIGITS.indexOf(ch);
    const p = PERSIAN_DIGITS.indexOf(ch);
    const c = a >= 0 ? String(a) : p >= 0 ? String(p) : ch;
    if (/[A-Z0-9]/.test(c)) s += c;
  }
  if (s.length !== GROUP_CODE_LEN) return '';
  for (const ch of s) if (!GROUP_CODE_ALPHABET.includes(ch)) return '';
  return s;
}

/** Keep only what can go in a code box while typing (upper case, alphabet letters, at most 6). */
export function typingGroupCode(input: string): string {
  let s = '';
  for (const ch of input.toUpperCase()) {
    const a = ARABIC_DIGITS.indexOf(ch);
    const p = PERSIAN_DIGITS.indexOf(ch);
    const c = a >= 0 ? String(a) : p >= 0 ? String(p) : ch;
    if (GROUP_CODE_ALPHABET.includes(c)) s += c;
  }
  return s.slice(0, GROUP_CODE_LEN);
}

/** A group name as stored: trimmed, single spaces, at most 30 characters. */
export function cleanGroupName(input: unknown): string {
  if (typeof input !== 'string') return '';
  return [...input.replace(/\s+/g, ' ').trim()].slice(0, GROUP_NAME_MAX).join('').trim();
}

/** The invite link: opening it on a phone with the app adds that phone to the group. */
export const groupLink = (code: string) => `familygames://group?code=${code}`;

/** Expo push tokens look like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]. */
export function isExpoPushToken(token: unknown): token is string {
  return typeof token === 'string' && token.length <= 200 && /^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(token);
}
