// Emblems for المراحل العشر, شبكة الكلمات, تمثيل صامت, الجاسوس, ماذا قال الناس؟, المربعات, المنقلة (100×100, mascot pass).
import { INK, svg100 } from './mkit.mjs';
import { HEX, HEX_IN, ROUND, ROUND_IN, SHIELD, SHIELD_IN, base } from './games2.mjs';

export function phase10() {
  const card = (x, y, rot, fill, label, size = 15) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-13" y="-18" width="26" height="36" rx="4" fill="#FFF8EA" data-shade="0.86"/>
    <rect x="-10" y="-15" width="20" height="30" rx="3" fill="${fill}" data-noline data-shade="0.82"/>
    <text x="0" y="${size * 0.36}" font-size="${size}" font-family="Lilita" fill="#FFFFFF" text-anchor="middle" stroke="${INK}" stroke-width="1.2" paint-order="stroke" data-flat>${label}</text></g>`;
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#7A1626', '#E2475F', ['#F2C23D', '#FFE89A'])}
    ${card(33, 52, -18, '#3D7BE0', '7')}${card(67, 52, 18, '#2FB67C', '9')}
    ${card(50, 47, 0, '#F29A1E', '10', 14)}
    <path d="M30 74 H70 L66 82 H34Z" fill="#F2C23D"/>
    <path d="M38 78 H62" stroke="#B5651D" stroke-width="1.6" stroke-linecap="round" data-flat/>`);
}

export function scrabble() {
  let grid = '';
  for (let i = 0; i <= 5; i++) {
    grid += `<path d="M${22 + i * 11.2} 24 V80 M22 ${24 + i * 11.2} H78" stroke="#1F7A55" stroke-width="0.8" data-flat/>`;
  }
  const tile = (x, y, letter, pts) => `<g transform="translate(${x} ${y})">
    <rect x="-9" y="-9" width="18" height="18" rx="3" fill="#F6E3B4" data-shade="0.84"/>
    <text x="0" y="5.5" font-size="15" font-family="Lalezar" fill="#3A2412" text-anchor="middle" data-flat>${letter}</text>
    <text x="6" y="7" font-size="4.5" font-family="Lilita" fill="#3A2412" text-anchor="middle" data-flat>${pts}</text></g>`;
  return svg100(`
    ${base(HEX, HEX_IN, '#0F4A33', '#2FA57A', ['#F08A3E', '#FFD0A8'])}
    <rect x="22" y="24" width="56" height="56" rx="4" fill="#3DBE8A" data-shade="0.8"/>
    <rect x="44.4" y="46.4" width="11.2" height="11.2" fill="#E2475F" data-noline data-noshade/>
    <rect x="22" y="24" width="11.2" height="11.2" fill="#3D7BE0" data-noline data-noshade/>
    <rect x="66.8" y="68.8" width="11.2" height="11.2" fill="#3D7BE0" data-noline data-noshade/>
    ${grid}
    ${tile(69, 52, 'ك', 3)}${tile(50, 52, 'ل', 1)}${tile(31, 52, 'م', 1)}
    ${tile(50, 33, 'ق', 4)}`);
}

export function charades() {
  const face = (x, y, rot, fill, happy) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <path d="M-15 -14 C-15 -22 15 -22 15 -14 C16 4 9 16 0 18 C-9 16 -16 4 -15 -14Z" fill="${fill}"/>
    <path d="M-9 -7 C-7 -10 -3 -10 -1.5 -7" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M1.5 -7 C3 -10 7 -10 9 -7" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round" data-flat/>
    ${happy
      ? `<path d="M-7 4 C-3 11 3 11 7 4Z" fill="${INK}" data-flat/>`
      : `<path d="M-6 9 C-3 4 3 4 6 9" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round" data-flat/>`}</g>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#7A3A0F', '#F08A3E', ['#7B61D9', '#CFC2FF'])}
    ${face(38, 50, -14, '#FFE08A', true)}${face(63, 54, 14, '#9EC4E8', false)}
    <path d="M30 76 C40 70 60 70 70 76" stroke="#7B61D9" stroke-width="4" fill="none" stroke-linecap="round" data-flat/>`);
}

export function spy() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#1C2466', '#4F5BD5', ['#F2C23D', '#FFE89A'])}
    <path d="M24 44 C24 30 76 30 76 44Z" fill="#3A2E28"/>
    <path d="M16 46 C30 40 70 40 84 46 C70 52 30 52 16 46Z" fill="#2A211C"/>
    <rect x="25" y="41" width="50" height="4" fill="#C8384E" data-noline data-noshade/>
    <path d="M34 54 C34 50 46 50 46 54 C46 58 34 58 34 54Z M54 54 C54 50 66 50 66 54 C66 58 54 58 54 54Z" fill="#1B1B2A"/>
    <path d="M46 54 H54" stroke="${INK}" stroke-width="2" data-flat/>
    <circle cx="64" cy="68" r="10" fill="#BFE6FF" data-shade="0.8"/>
    <path d="M71 75 L80 84" stroke="${INK}" stroke-width="7" stroke-linecap="round" data-flat/>
    <path d="M71 75 L80 84" stroke="#B5651D" stroke-width="3.6" stroke-linecap="round" data-flat/>
    <path d="M59 64 a6 6 0 0 1 6 -3" stroke="#FFFFFF" stroke-width="1.8" fill="none" stroke-linecap="round" data-flat/>`);
}

export function survey() {
  const bar = (y, n, w, fill) => `<rect x="26" y="${y}" width="48" height="11" rx="3" fill="#1B2A6B"/>
    <rect x="26" y="${y}" width="11" height="11" rx="3" fill="${fill}" data-noline data-noshade/>
    <text x="31.5" y="${y + 8.6}" font-size="9" font-family="Lilita" fill="#FFFFFF" text-anchor="middle" data-flat>${n}</text>
    <rect x="40" y="${y + 3.5}" width="${w}" height="4" rx="2" fill="#F2C23D" data-noline data-noshade/>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#7A4E08', '#E8A417', ['#E2475F', '#FFB3BE'])}
    <rect x="21" y="30" width="58" height="50" rx="6" fill="#2D3E99"/>
    ${bar(34, 1, 30, '#E2475F')}${bar(49, 2, 22, '#3D7BE0')}${bar(64, 3, 14, '#2FB67C')}
    <path d="M58 10 H82 C85 10 87 12 87 15 V26 C87 29 85 31 82 31 H74 L68 37 L69 31 H58 C55 31 53 29 53 26 V15 C53 12 55 10 58 10Z" fill="#FFF4DA"/>
    <text x="70" y="29" font-size="22" font-family="Lalezar" fill="#C8371F" text-anchor="middle" data-flat>؟</text>`);
}

export function dots() {
  const x0 = 28, s = 14.7;
  let dotsSvg = '', lines = '';
  const seg = (x1, y1, x2, y2, c) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${INK}" stroke-width="5.4" stroke-linecap="round" data-flat/><path d="M${x1} ${y1} L${x2} ${y2}" stroke="${c}" stroke-width="2.8" stroke-linecap="round" data-flat/>`;
  const P = (i) => x0 + i * s;
  lines += `<rect x="${P(0)}" y="${P(0)}" width="${s}" height="${s}" fill="#F2C23D" data-noline data-noshade/>`;
  lines += `<rect x="${P(1)}" y="${P(2)}" width="${s}" height="${s}" fill="#FF8FA8" data-noline data-noshade/>`;
  lines += seg(P(0), P(0), P(1), P(0), '#F2C23D') + seg(P(1), P(0), P(1), P(1), '#F2C23D') + seg(P(0), P(1), P(1), P(1), '#F2C23D') + seg(P(0), P(0), P(0), P(1), '#F2C23D');
  lines += seg(P(1), P(2), P(2), P(2), '#FF8FA8') + seg(P(2), P(2), P(2), P(3), '#FF8FA8') + seg(P(1), P(3), P(2), P(3), '#FF8FA8') + seg(P(1), P(2), P(1), P(3), '#FF8FA8');
  lines += seg(P(2), P(0), P(3), P(0), '#7FD4FF') + seg(P(3), P(1), P(3), P(2), '#7FD4FF') + seg(P(0), P(2), P(0), P(3), '#7FD4FF');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) dotsSvg += `<circle cx="${P(c)}" cy="${P(r)}" r="2.6" fill="#FFF4DA" data-lw="0.8"/>`;
  return svg100(`
    ${base(HEX, HEX_IN, '#3E1F6E', '#7B61D9', ['#2FB67C', '#A8E6C8'])}
    <rect x="20" y="20" width="60" height="60" rx="8" fill="#5A3FB0" data-shade="0.85"/>
    ${lines}${dotsSvg}`);
}

export function mancala() {
  const pit = (x, y, n) => {
    let seeds = '';
    const pts = [[0, 0], [-2.6, -1.8], [2.6, -1.6], [-1.6, 2.2], [2.2, 2.4]].slice(0, n);
    for (const [dx, dy] of pts) seeds += `<circle cx="${x + dx}" cy="${y + dy}" r="1.7" fill="${['#E2475F', '#3D7BE0', '#F2C23D', '#2FB67C'][(dx * 7 + dy * 3 + 9) % 4 | 0] ?? '#F2C23D'}" data-noshade data-lw="0.5"/>`;
    return `<ellipse cx="${x}" cy="${y}" rx="6.4" ry="6" fill="#6B3A18" data-noshade/>${seeds}`;
  };
  let pits = '';
  [30, 43, 56, 69].forEach((x, i) => {
    pits += pit(x, 44, [3, 4, 2, 5][i]);
    pits += pit(x, 60, [4, 1, 3, 4][i]);
  });
  return svg100(`
    ${base(ROUND, ROUND_IN, '#5A2E0E', '#B5652B', ['#F2C23D', '#FFE89A'])}
    <rect x="12" y="32" width="76" height="40" rx="18" fill="#C98A4B" data-shade="0.8"/>
    <rect x="15" y="38" width="9" height="28" rx="4.5" fill="#6B3A18" data-noshade/>
    <rect x="76" y="38" width="9" height="28" rx="4.5" fill="#6B3A18" data-noshade/>
    ${pits}
    <circle cx="19.5" cy="47" r="1.7" fill="#F2C23D" data-noshade data-lw="0.5"/><circle cx="19.5" cy="53" r="1.7" fill="#E2475F" data-noshade data-lw="0.5"/><circle cx="19.5" cy="59" r="1.7" fill="#3D7BE0" data-noshade data-lw="0.5"/>
    <circle cx="80.5" cy="50" r="1.7" fill="#2FB67C" data-noshade data-lw="0.5"/><circle cx="80.5" cy="56" r="1.7" fill="#F2C23D" data-noshade data-lw="0.5"/>`);
}
