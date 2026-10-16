// Spanish 40-card deck in the mascot style (200×300).
import { INK, blush, brow, eye, smile } from './mkit.mjs';
import { club, coin, cup, sword } from './badges.mjs';

const W = 200, H = 300;
const CREAM = '#FBF6EA';
const SKIN = '#F4C7A1';
const SUIT_COLOR = { coins: '#B8860B', cups: '#C8273A', swords: '#2552A8', clubs: '#2E7D32' };
const GAPS = { coins: 0, cups: 1, swords: 2, clubs: 3 };
const ROBE = {
  coins: ['#D9A21B', '#C8273A'],
  cups: ['#C8273A', '#2E5FB8'],
  swords: ['#2E5FB8', '#E8B52E'],
  clubs: ['#2E8B3E', '#C8273A'],
};

const LAYOUTS = {
  1: [[100, 150]],
  2: [[100, 92], [100, 208]],
  3: [[100, 74], [100, 150], [100, 226]],
  4: [[66, 92], [134, 92], [66, 208], [134, 208]],
  5: [[66, 86], [134, 86], [100, 150], [66, 214], [134, 214]],
  6: [[66, 80], [134, 80], [66, 150], [134, 150], [66, 220], [134, 220]],
  7: [[66, 74], [134, 74], [100, 112], [66, 150], [134, 150], [66, 224], [134, 224]],
};

export function symbol(suit, x, y, s = 1, rot = 0) {
  if (suit === 'coins') return coin(x, y, 17 * s);
  if (suit === 'cups') return cup(x, y + 2 * s, 1.95 * s);
  if (suit === 'swords') return sword(x, y, 1.45 * s, rot);
  return club(x, y, 1.55 * s, rot);
}

function frame(suit) {
  const g = GAPS[suit];
  const edge = (y) => {
    if (!g) return `<path d="M26 ${y} H174" stroke="${INK}" stroke-width="2.4" data-flat/>`;
    const gapW = 10, total = g * gapW + (g - 1) * 6, start = 100 - total / 2;
    let d = `M26 ${y} H${start}`;
    for (let i = 0; i < g; i++) {
      const gs = start + i * (gapW + 6);
      if (i > 0) d += `M${gs - 6} ${y} H${gs}`;
      if (i === g - 1) d += `M${gs + gapW} ${y} H174`;
    }
    return `<path d="${d}" stroke="${INK}" stroke-width="2.4" fill="none" data-flat/>`;
  };
  return `${edge(20)}${edge(280)}<path d="M26 20 V280 M174 20 V280" stroke="${INK}" stroke-width="2.4" data-flat/>`;
}

const corner = (rank, color) => `
  <text x="33" y="52" font-family="Lilita" font-size="34" text-anchor="middle" fill="${color}" data-flat>${rank}</text>
  <text x="167" y="274" font-family="Lilita" font-size="34" text-anchor="middle" fill="${color}" data-flat>${rank}</text>`;

/* ---------------- figures ---------------- */

function headFace(cx, cy, r, o = {}) {
  const ex = r * 0.38, ey = cy + r * 0.06;
  return `<path d="M${cx - r} ${cy - r * 0.1} C${cx - r} ${cy - r * 0.95} ${cx + r} ${cy - r * 0.95} ${cx + r} ${cy - r * 0.1} C${cx + r} ${cy + r * 0.7} ${cx + r * 0.4} ${cy + r * 1.05} ${cx} ${cy + r * 1.08} C${cx - r * 0.4} ${cy + r * 1.05} ${cx - r} ${cy + r * 0.7} ${cx - r} ${cy - r * 0.1}Z" fill="${SKIN}"/>
    ${eye(cx - ex, ey, { side: -1, iris: o.iris ?? '#5a3a1e', w: r * 0.52, h: r * 0.38, lash: 0.2, lid: o.lid ?? 0 })}
    ${eye(cx + ex, ey, { side: 1, iris: o.iris ?? '#5a3a1e', w: r * 0.52, h: r * 0.38, lash: 0.2, lid: o.lid ?? 0 })}
    ${brow(cx - ex, ey - r * 0.36, { side: -1, w: r * 0.5, t: r * 0.12, angle: o.brow ?? 0, color: o.browColor ?? INK })}
    ${brow(cx + ex, ey - r * 0.36, { side: 1, w: r * 0.5, t: r * 0.12, angle: o.brow ?? 0, color: o.browColor ?? INK })}`;
}

function rey(suit) {
  const [robe, trim] = ROBE[suit];
  return `
    <path d="M58 132 C50 170 46 214 44 254 H156 C154 214 150 170 142 132Z" fill="${trim}" data-shade="0.6"/>
    <path d="M70 128 C64 170 62 214 62 250 H138 C138 214 136 170 130 128Z" fill="${robe}"/>
    <path d="M62 236 H138 V252 H62Z" fill="#F7F5EE"/>
    <g fill="${INK}" data-flat>${[70, 82, 94, 106, 118, 130].map((x) => `<path d="M${x} 241 l2 4 l-2 3 l-2 -3z"/>`).join('')}</g>
    <path d="M100 132 V236" stroke="#F4C02E" stroke-width="4" data-flat/><path d="M100 132 V236" stroke="${INK}" stroke-width="1" data-flat stroke-dasharray="3 5"/>
    <path d="M78 134 C70 150 66 166 70 178" stroke="${INK}" stroke-width="12" fill="none" stroke-linecap="round" data-flat/>
    <path d="M78 134 C70 150 66 166 70 178" stroke="${robe}" stroke-width="8.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M122 134 C132 146 138 156 140 166" stroke="${INK}" stroke-width="12" fill="none" stroke-linecap="round" data-flat/>
    <path d="M122 134 C132 146 138 156 140 166" stroke="${robe}" stroke-width="8.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M68 180 V108" stroke="${INK}" stroke-width="5" stroke-linecap="round" data-flat/><path d="M68 180 V108" stroke="#E8B52E" stroke-width="2.6" stroke-linecap="round" data-flat/>
    <circle cx="68" cy="106" r="5" fill="#F4C02E"/>
    <circle cx="70" cy="180" r="5" fill="${SKIN}"/>
    ${symbol(suit, 146, 168, 0.6, 20)}
    <circle cx="140" cy="168" r="5" fill="${SKIN}"/>
    <path d="M84 128 Q100 138 116 128 L112 122 H88Z" fill="#F7F5EE"/>
    ${headFace(100, 100, 21, { lid: 0.2, brow: 0.2 })}
    <path d="M80 104 C80 124 88 134 100 136 C112 134 120 124 120 104 C116 112 110 116 100 116 C90 116 84 112 80 104Z" fill="#7A4A24" data-shade="0.6"/>
    <path d="M92 116 Q100 112 108 116 Q100 120 92 116Z" fill="#5a3418" data-flat/>
    <path d="M80 86 L78 64 L88 74 L94 58 L100 72 L106 58 L112 74 L122 64 L120 86Z" fill="#F4C02E"/>
    <circle cx="100" cy="78" r="3" fill="#E2475F" data-lw="0.8"/><circle cx="88" cy="81" r="2" fill="#3FA3D9" data-lw="0.8"/><circle cx="112" cy="81" r="2" fill="#3FA3D9" data-lw="0.8"/>`;
}

function sota(suit) {
  const [robe, trim] = ROBE[suit];
  return `
    <path d="M86 210 V252 M114 210 V252" stroke="${INK}" stroke-width="12" stroke-linecap="round" data-flat/>
    <path d="M86 210 V250 M114 210 V250" stroke="${trim}" stroke-width="8.4" stroke-linecap="round" data-flat/>
    <path d="M78 256 Q86 246 94 256Z M106 256 Q114 246 122 256Z" fill="#3a2a22"/>
    <path d="M74 130 C68 160 66 190 68 216 H132 C134 190 132 160 126 130Z" fill="${robe}"/>
    <path d="M68 204 H132 V216 H68Z" fill="${trim}" data-noshade/>
    <path d="M70 166 H130" stroke="#F4C02E" stroke-width="5" data-flat/><path d="M70 166 H130" stroke="${INK}" stroke-width="1" data-flat/>
    <path d="M80 134 C70 146 64 158 66 172" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round" data-flat/>
    <path d="M80 134 C70 146 64 158 66 172" stroke="${robe}" stroke-width="7.6" fill="none" stroke-linecap="round" data-flat/>
    <path d="M120 134 C132 142 136 150 136 160" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round" data-flat/>
    <path d="M120 134 C132 142 136 150 136 160" stroke="${robe}" stroke-width="7.6" fill="none" stroke-linecap="round" data-flat/>
    <circle cx="66" cy="174" r="4.6" fill="${SKIN}"/>
    ${symbol(suit, 140, 150, 0.72, 18)}
    <circle cx="136" cy="160" r="4.6" fill="${SKIN}"/>
    <path d="M86 128 Q100 136 114 128 L110 122 H90Z" fill="#F7F5EE"/>
    ${headFace(100, 102, 19)}
    ${smile(100, 116, 8)}${blush(88, 112, 3)}${blush(112, 112, 3)}
    <path d="M80 98 C80 84 88 78 100 78 C112 78 120 84 120 98 C114 92 108 90 100 90 C92 90 86 92 80 98Z" fill="#6b4226" data-shade="0.6"/>
    <path d="M74 86 Q100 70 126 86 Q100 80 74 86Z" fill="${trim}"/>
    <path d="M84 84 C84 72 92 66 100 66 C108 66 116 72 116 84Z" fill="${trim}"/>
    <path d="M114 74 C124 62 134 62 138 56 C134 68 126 74 116 78Z" fill="#F7F5EE"/>`;
}

function caballo(suit) {
  const [robe, trim] = ROBE[suit];
  const horse = '#F0EDE6';
  return `
    <path d="M48 196 C40 204 38 218 44 226" stroke="${INK}" stroke-width="9" fill="none" stroke-linecap="round" data-flat/>
    <path d="M48 196 C40 204 38 218 44 226" stroke="#8A5A33" stroke-width="5.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M62 214 V254 M78 220 V254 M118 220 V254 M134 214 V254" stroke="${INK}" stroke-width="11" stroke-linecap="round" data-flat/>
    <path d="M62 214 V252 M78 220 V252 M118 220 V252 M134 214 V252" stroke="${horse}" stroke-width="7.4" stroke-linecap="round" data-flat/>
    <path d="M50 200 C50 182 70 176 100 178 C126 176 146 182 146 200 C146 218 128 226 100 226 C70 226 50 218 50 200Z" fill="${horse}" data-shade="0.8"/>
    <path d="M128 186 C130 166 134 150 142 138 L160 146 C162 156 160 164 154 168 C150 180 146 192 144 200Z" fill="${horse}" data-shade="0.8"/>
    <path d="M142 138 C146 132 152 130 158 134 L166 152 C168 158 164 162 158 160 L154 158Z" fill="${horse}" data-shade="0.8"/>
    <path d="M142 138 L146 126 L150 136Z" fill="${horse}"/>
    <path d="M140 140 C134 150 130 164 128 180 L134 182 C136 166 140 152 146 142Z" fill="#8A5A33" data-noshade/>
    <circle cx="156" cy="143" r="2" fill="${INK}" data-flat/>
    <path d="M78 182 H122 V200 H78Z" fill="${trim}" data-noshade/><path d="M82 200 V214 H118 V200" fill="${robe}" data-noshade/>
    <path d="M86 112 C82 136 82 160 84 184 H116 C118 160 118 136 114 112Z" fill="${robe}"/>
    <path d="M110 120 C122 112 130 104 134 94" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round" data-flat/>
    <path d="M110 120 C122 112 130 104 134 94" stroke="${robe}" stroke-width="7.6" fill="none" stroke-linecap="round" data-flat/>
    ${symbol(suit, 140, 80, 0.6, 24)}
    <circle cx="134" cy="94" r="4.4" fill="${SKIN}"/>
    <path d="M90 186 L84 214" stroke="${INK}" stroke-width="10" stroke-linecap="round" data-flat/><path d="M90 186 L84 212" stroke="${robe}" stroke-width="6.6" stroke-linecap="round" data-flat/>
    ${headFace(100, 88, 17, { brow: 0.4 })}
    ${smile(100, 100.5, 7, { smirk: 0.8 })}
    <path d="M82 84 C82 70 90 64 100 64 C110 64 118 70 118 84 C112 80 106 78 100 78 C94 78 88 80 82 84Z" fill="${trim}"/>
    <path d="M80 84 H120 L118 88 H82Z" fill="#F4C02E" data-noshade/>`;
}

export function card(suit, rank) {
  const color = SUIT_COLOR[suit];
  let art = '';
  if (rank <= 7) {
    const long = suit === 'swords' || suit === 'clubs';
    const s = rank === 1 ? (suit === 'coins' ? 2.3 : 1.9) : long ? (rank <= 2 ? 1.15 : rank === 3 ? 0.95 : 0.82) : suit === 'cups' ? (rank <= 2 ? 1.15 : rank === 3 ? 0.9 : rank === 7 ? 0.7 : 0.82) : rank <= 3 ? 1.2 : 0.95;
    art = LAYOUTS[rank].map(([x, y], i) => symbol(suit, x, y, s, long ? (rank === 1 ? -18 : i % 2 ? 14 : -14) : 0)).join('');
  } else art = rank === 10 ? sota(suit) : rank === 11 ? caballo(suit) : rey(suit);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs></defs>
    <rect x="4" y="4" width="192" height="292" rx="16" fill="${CREAM}" data-shade="0.93" data-off="0.03" data-lw="1.6"/>
    ${frame(suit)}${corner(rank, color)}${art}</svg>`;
}

export function back() {
  let lattice = '';
  for (let i = -300; i < 300; i += 18) lattice += `M${i} 0 L${i + 300} 300 M${i + 300} 0 L${i} 300 `;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><clipPath id="bk"><rect x="18" y="18" width="164" height="264" rx="8"/></clipPath></defs>
    <rect x="4" y="4" width="192" height="292" rx="16" fill="#8E1F2E" data-shade="0.9" data-off="0.03" data-lw="1.6"/>
    <rect x="18" y="18" width="164" height="264" rx="8" fill="#B3263C" data-noshade data-lw="1.4"/>
    <g clip-path="url(#bk)"><path d="${lattice}" stroke="#E8B52E" stroke-width="1.4" opacity="0.45" data-flat/></g>
    <path d="M100 104 L146 150 L100 196 L54 150Z" fill="#F4C02E"/>
    <path d="M100 118 L132 150 L100 182 L68 150Z" fill="#8E1F2E" data-noshade/>
    ${coin(100, 150, 14)}</svg>`;
}
