// Emblem for «البلد الغامض» (100×100, mascot pass) — STUB (to be drawn).
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

export function balad() {
  return svg100(`${base(ROUND, ROUND_IN, '#2B2766', '#D2554B')}`);
}
