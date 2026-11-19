// Emblem for «مكية أم مدنية؟» (100×100, mascot pass) — STUB (to be drawn).
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

export function makki() {
  return svg100(`${base(ROUND, ROUND_IN, '#2B2766', '#2E9E6B')}`);
}
