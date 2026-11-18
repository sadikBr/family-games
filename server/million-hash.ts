/** A short, stable key for a question's text (FNV-1a, 32 bits, base 36), used by million-levels.ts. */
export function qHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
