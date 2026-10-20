// Emblems for the «معلومات وثقافة» games (100×100, mascot pass):
// - «كم تقدّر؟»: a glass jar full of sweets with a «؟» tag — how many are there?
// - «صح أم خطأ»: a green check and a red cross side by side.
// - «الأعلام والعواصم»: a globe with a flag planted on top.
import { INK, svg100 } from './mkit.mjs';
import { HEX, HEX_IN, ROUND, ROUND_IN, SHIELD, SHIELD_IN, base } from './games2.mjs';

export function estimate() {
  const sweets = [
    [40, 66, '#E2475F'], [50, 69, '#3D9BE0'], [60, 66, '#2FB67C'], [45, 59, '#F2C23D'], [55, 59, '#B565D9'],
    [36, 57, '#2FB67C'], [64, 57, '#E2475F'], [40, 50, '#3D9BE0'], [50, 51, '#E2475F'], [60, 49, '#F2C23D'],
  ];
  return svg100(`
    ${base(HEX, HEX_IN, '#6B3A08', '#E0892B', ['#F2C23D', '#FFE89A'])}
    <rect x="35" y="25" width="30" height="7" rx="3" fill="#C8371F"/>
    <path d="M37 32 H63 C63 36 67 37 67 42 V70 C67 75 63 78 58 78 H42 C37 78 33 75 33 70 V42 C33 37 37 36 37 32Z" fill="#DDF1FF" data-shade="0.9"/>
    ${sweets.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="5" fill="${c}" data-lw="0.8"/>`).join('')}
    <path d="M38 44 C38 40 40 38 42 37" stroke="#FFFFFF" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.9" data-flat/>
    <path d="M66 30 L74 22" stroke="${INK}" stroke-width="1.6" data-flat/>
    <circle cx="77" cy="26" r="10" fill="#FFF4DA"/>
    <text x="77" y="33" font-size="17" font-family="Lalezar" fill="#C8371F" text-anchor="middle" data-flat>؟</text>`);
}

export function truefalse() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#14524A', '#2E9E8F', ['#F2C23D', '#FFE89A'])}
    <circle cx="36" cy="48" r="16" fill="#2FB67C"/>
    <path d="M28 48.5 L34 54.5 L45 42" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" data-flat/>
    <circle cx="64" cy="56" r="16" fill="#E2475F"/>
    <path d="M57.5 49.5 L70.5 62.5 M70.5 49.5 L57.5 62.5" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" data-flat/>`);
}

export function flags() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#173E7A', '#3E7BD6', ['#2FB67C', '#A8E6C8'])}
    <circle cx="48" cy="58" r="22" fill="#3D9BE0"/>
    <path d="M32 50 C36 46 40 52 45 48 C48 45 46 40 51 39 M54 72 C56 66 61 68 63 62 C65 58 69 58 69 56 M30 63 C34 61 38 65 42 63" stroke="#2FB67C" stroke-width="5" fill="none" stroke-linecap="round" data-flat/>
    <path d="M60 41 V14" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" data-flat/>
    <path d="M60 41 V14" stroke="#E9CFA0" stroke-width="1.8" stroke-linecap="round" data-flat/>
    <path d="M61 15 H84 L80 22 L84 29 H61Z" fill="#C1272D"/>
    <path d="M71.5 17.5 L70.2 25.6 L76.6 20.4 H66.4 L72.8 25.6Z" fill="none" stroke="#006233" stroke-width="1.2" stroke-linejoin="round" data-flat/>`);
}
