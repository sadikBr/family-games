// Emblem for «خمّن من الإيموجي» (100×100, mascot pass) — STUB (to be drawn).
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

export function emoji() {
  return svg100(`${base(ROUND, ROUND_IN, '#2B2766', '#E9A21F')}`);
}
