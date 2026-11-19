// Emblem for «قطار المغرب» (100×100, mascot pass): a little green locomotive pulling a saffron wagon along the
// rails, in front of a cream horseshoe arch (a Moroccan gate), with a puff of steam — collect wagons, claim the line.
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

export function train() {
  const wheel = (cx) => `
    <circle cx="${cx}" cy="70" r="5" fill="#3A2F45"/>
    <circle cx="${cx}" cy="70" r="1.8" fill="#F2C53D" data-noline data-flat/>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#2B2766', '#B5453A')}
    <path d="M28 74 V46 A22 22 0 1 1 72 46 V74Z" fill="#F6E3B4" data-shade="0.92"/>
    <path d="M34 74 V48 A16 16 0 1 1 66 48 V74Z" fill="#E9C98A" data-noline data-flat/>
    <circle cx="24" cy="30" r="5.5" fill="#FFFFFF" opacity="0.9" data-noshade/>
    <circle cx="31" cy="24" r="4.2" fill="#FFFFFF" opacity="0.9" data-noshade/>
    <circle cx="17" cy="36" r="3.4" fill="#FFFFFF" opacity="0.85" data-noshade/>
    <path d="M12 76 H88" stroke="#6B4423" stroke-width="3" stroke-linecap="round" data-flat/>
    <path d="M18 79 V73 M28 79 V73 M38 79 V73 M48 79 V73 M58 79 V73 M68 79 V73 M78 79 V73" stroke="#6B4423" stroke-width="2.2" stroke-linecap="round" data-flat/>
    <rect x="58" y="51" width="26" height="16" rx="3" fill="#F2C53D"/>
    <rect x="62" y="55" width="6" height="5" rx="1" fill="${INK}" opacity="0.55" data-noline data-flat/>
    <rect x="73" y="55" width="6" height="5" rx="1" fill="${INK}" opacity="0.55" data-noline data-flat/>
    <path d="M55 62 H59" stroke="${INK}" stroke-width="2" data-flat/>
    <path d="M20 67 V52 H40 V42 H55 V67Z" fill="#2FB67C"/>
    <rect x="25" y="38" width="6" height="14" rx="1.5" fill="#2FB67C"/>
    <rect x="23.5" y="36" width="9" height="4" rx="1.5" fill="#23314F"/>
    <rect x="44" y="46" width="7" height="7" rx="1.2" fill="#FFF4DA" data-noline data-flat/>
    <path d="M14 67 L20 59 V67Z" fill="#E2475F"/>
    <circle cx="20" cy="55" r="2.2" fill="#FFE89A" data-noline data-flat/>
    ${wheel(27)}${wheel(39)}${wheel(50)}${wheel(64)}${wheel(78)}`);
}
