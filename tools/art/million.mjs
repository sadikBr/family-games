// Emblem for «من سيربح المليون؟» (100×100, mascot pass): the show's studio disc — deep blue-violet, a ring of
// golden lights — with a big golden «؟» in the middle and an answer lozenge on its rail below.
import { svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const GOLD = '#F4C552';
const GOLD_DEEP = '#C9922A';
const CREAM = '#FFF6DE';
const NAVY = '#0D0A3E';
const SILVER = '#C8CCEA';

/** The ring of little lights around the disc. */
function lights() {
  const out = [];
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI * 2) / 20;
    const r = i % 2 ? 1.1 : 1.6;
    out.push(`<circle cx="${(50 + 31 * Math.cos(a)).toFixed(2)}" cy="${(50 + 31 * Math.sin(a)).toFixed(2)}" r="${r}" fill="${i % 2 ? CREAM : GOLD}" data-flat/>`);
  }
  return out.join('');
}

/** The Arabic question mark (the Latin one mirrored), thick and golden, with its dot. */
function question() {
  const d = 'M59 33 Q59 22 50 22 Q41 22 41 31 Q41 38 50 42 V50';
  return `
    <path d="${d}" stroke="${GOLD_DEEP}" stroke-width="9.5" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <path d="${d}" stroke="${GOLD}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <circle cx="50" cy="58.5" r="4.6" fill="${GOLD}" data-lw="1"/>`;
}

/** An answer lozenge on its silver rail. */
function lozenge() {
  return `
    <path d="M17 75 H83" stroke="${SILVER}" stroke-width="1.4" data-flat/>
    <path d="M30 68 H70 L76 75 L70 82 H30 L24 75Z" fill="${NAVY}" stroke="${GOLD}" stroke-width="1.8" data-flat/>
    <path d="M37 75 H63" stroke="${CREAM}" stroke-width="2.4" stroke-linecap="round" stroke-opacity="0.85" data-flat/>`;
}

export function million() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#3A1F9E', ['#C9922A', '#F4C552'])}
    <circle cx="50" cy="46" r="24" fill="#6C4BD1" fill-opacity="0.45" data-flat/>
    ${lights()}
    ${question()}
    ${lozenge()}`);
}
