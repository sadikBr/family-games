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

export function blocks() {
  const sq = (x, y, c) => `<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${c}" data-lw="0.9"/>`;
  const piece = (cells, c, ox, oy) => cells.map(([i, j]) => sq(ox + i * 10, oy + j * 10, c)).join('');
  return svg100(`
    ${base(HEX, HEX_IN, '#163C7A', '#3D7BE0', ['#F2C23D', '#FFE89A'])}
    <rect x="22" y="22" width="56" height="56" rx="5" fill="#E8EEF8" data-shade="0.85"/>
    ${piece([[0, 0], [1, 0], [1, 1], [2, 1]], '#E2475F', 25, 25)}
    ${piece([[0, 0], [0, 1], [0, 2], [1, 2]], '#2FB67C', 55, 25)}
    ${piece([[0, 0], [1, 0], [2, 0], [1, 1]], '#F2C23D', 25, 55)}
    ${piece([[0, 0], [1, 0], [1, 1]], '#7B61D9', 55, 58)}`);
}

export function codebreak() {
  const peg = (x, y, c) => `<circle cx="${x}" cy="${y}" r="5.2" fill="${c}" data-lw="0.9"/>`;
  const row = (y, cols) => cols.map((c, i) => peg(32 + i * 12, y, c)).join('');
  const key = (x, y, c) => `<circle cx="${x}" cy="${y}" r="1.9" fill="${c}" data-noshade data-lw="0.5"/>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#3A2470', '#7B61D9', ['#2FB67C', '#A8E6C8'])}
    <rect x="22" y="20" width="56" height="60" rx="8" fill="#3B2A1C" data-shade="0.85"/>
    ${row(32, ['#E2475F', '#F2C23D', '#3D7BE0', '#2FB67C'])}
    ${row(48, ['#F2C23D', '#E2475F', '#2FB67C', '#F08A3E'])}
    <rect x="26" y="58" width="48" height="14" rx="4" fill="#5A4030" data-noshade/>
    <text x="50" y="69.5" font-size="12" font-family="Lilita" fill="#FFF4DA" text-anchor="middle" data-flat>? ? ? ?</text>
    ${key(76, 29, '#151726')}${key(76, 35, '#FFFFFF')}${key(76, 45, '#151726')}${key(76, 51, '#151726')}`);
}

export function boggle() {
  const L = ['ك', 'ت', 'ا', 'ب', 'م', 'ل', 'و', 'ر', 'س', 'ن', 'ي', 'ج', 'ح', 'ع', 'د', 'ف'];
  let tiles = '';
  L.forEach((ch, i) => {
    const x = 25 + (i % 4) * 13, y = 25 + Math.floor(i / 4) * 13;
    const hot = [0, 1, 2, 3].includes(i);
    tiles += `<rect x="${x}" y="${y}" width="11.5" height="11.5" rx="2.5" fill="${hot ? '#FFE08A' : '#FFF4DA'}" data-lw="0.8"/>`;
    tiles += `<text x="${x + 5.75}" y="${y + 10}" font-size="11.5" font-family="Lalezar" fill="#2A160A" text-anchor="middle" data-flat>${ch}</text>`;
  });
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#7A4E08', '#E8A417', ['#3D7BE0', '#A9C8FF'])}
    <rect x="21" y="21" width="58" height="58" rx="7" fill="#B5652B" data-shade="0.8"/>
    ${tiles}
    <path d="M28 31 H72" stroke="#E2475F" stroke-width="2.4" stroke-linecap="round" opacity="0.8" data-flat/>`);
}

/* ---- Islamic games (objects and places only: no people) ---- */

const rehal = (fill = '#8C5A2B') => `<path d="M26 74 L50 58 L74 74 M30 80 L50 66 L70 80" stroke="${INK}" stroke-width="5.6" fill="none" stroke-linecap="round" data-flat/>
    <path d="M26 74 L50 58 L74 74 M30 80 L50 66 L70 80" stroke="${fill}" stroke-width="3" fill="none" stroke-linecap="round" data-flat/>`;
const book = (pageText = '') => `<path d="M50 30 C42 25 30 25 22 28 V62 C30 59 42 59 50 64Z" fill="#FFF8E6"/>
    <path d="M50 30 C58 25 70 25 78 28 V62 C70 59 58 59 50 64Z" fill="#FFF8E6"/>
    <path d="M50 30 V64" stroke="${INK}" stroke-width="1.6" data-flat/>${pageText}`;
const lines = (x0, x1, ys, c = '#C9B48A') => ys.map((y) => `<path d="M${x0} ${y} H${x1}" stroke="${c}" stroke-width="1.6" stroke-linecap="round" data-flat/>`).join('');

export function qquote() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#11472E', '#2E8B57', ['#F2C23D', '#FFE89A'])}
    ${rehal()}
    ${book(lines(27, 45, [37, 43, 49, 55]) + lines(55, 73, [37, 43, 49, 55]))}
    <path d="M60 12 H84 C87 12 89 14 89 17 V28 C89 31 87 33 84 33 H76 L70 39 L71 33 H60 C57 33 55 31 55 28 V17 C55 14 57 12 60 12Z" fill="#FFF4DA"/>
    <text x="72" y="30" font-size="20" font-family="Lalezar" fill="#2E8B57" text-anchor="middle" data-flat>؟</text>`);
}

export function tajweed() {
  const word = (x, y, c, w = 10) => `<rect x="${x}" y="${y}" width="${w}" height="3.4" rx="1.7" fill="${c}" data-noshade data-noline/>`;
  return svg100(`
    ${base(HEX, HEX_IN, '#0E3F37', '#1F7A6B', ['#E2475F', '#FFB3BE'])}
    ${rehal()}
    ${book()}
    ${word(27, 36, '#9EA3AE', 7)}${word(36, 36, '#E2475F', 8)}${word(26, 43, '#9EA3AE', 12)}${word(40, 43, '#2FB67C', 6)}${word(28, 50, '#3D7BE0', 9)}${word(39, 50, '#9EA3AE', 7)}
    ${word(55, 36, '#9EA3AE', 9)}${word(66, 36, '#F29A1E', 8)}${word(55, 43, '#E2475F', 6)}${word(63, 43, '#9EA3AE', 11)}${word(57, 50, '#9EA3AE', 6)}${word(65, 50, '#2FB67C', 9)}`);
}

export function qword() {
  const tile = (x, y, ch, c) => `<rect x="${x}" y="${y}" width="12" height="12" rx="2.6" fill="${c}" data-lw="0.8"/>
    <text x="${x + 6}" y="${y + 10}" font-size="10.5" font-family="Lalezar" fill="#FFFFFF" text-anchor="middle" data-flat>${ch}</text>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#6E5310', '#C8A13A', ['#2FB67C', '#A8E6C8'])}
    ${rehal('#5A3A1A')}
    <rect x="22" y="26" width="56" height="42" rx="6" fill="#1F2A44" data-shade="0.85"/>
    ${tile(67, 31, 'ر', '#2FB67C')}${tile(53, 31, 'ح', '#2FB67C')}${tile(39, 31, 'م', '#C8A13A')}${tile(25, 31, 'ة', '#5B6478')}
    ${tile(67, 50, 'ن', '#5B6478')}${tile(53, 50, 'و', '#C8A13A')}${tile(39, 50, 'ر', '#2FB67C')}${tile(25, 50, '؟', '#3B4560')}`);
}

export function asma() {
  const star = (r1, r2) => {
    let d = '';
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? r2 : r1, a = (Math.PI / 8) * i - Math.PI / 2;
      d += `${i ? 'L' : 'M'}${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)} `;
    }
    return d + 'Z';
  };
  return svg100(`
    ${base(ROUND, ROUND_IN, '#5E4513', '#B5892B', ['#2FA57A', '#A8E6C8'])}
    <path d="${star(32, 25)}" fill="#F6E3B4"/>
    <path d="${star(25, 20)}" fill="#2FA57A" data-shade="0.82"/>
    <circle cx="50" cy="50" r="15" fill="#FFF4DA"/>
    <text x="50" y="57" font-size="19" font-family="Lilita" fill="#7A5A16" text-anchor="middle" data-flat>99</text>`);
}

export function steps() {
  const step = (x, y, w, n, c) => `<rect x="${x}" y="${y}" width="${w}" height="12" rx="3" fill="${c}"/>
    <text x="${x + 7}" y="${y + 9.5}" font-size="9" font-family="Lilita" fill="#FFFFFF" text-anchor="middle" data-flat>${n}</text>`;
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#183B7A', '#3D7BE0', ['#F2C23D', '#FFE89A'])}
    ${step(24, 66, 52, 1, '#2FB67C')}${step(30, 53, 40, 2, '#F29A1E')}${step(36, 40, 28, 3, '#E2475F')}
    <path d="M50 18 C56 26 59 30 59 34 A9 9 0 0 1 41 34 C41 30 44 26 50 18Z" fill="#7FD4FF"/>
    <path d="M46 33 a4 4 0 0 0 4 4" stroke="#FFFFFF" stroke-width="1.8" fill="none" stroke-linecap="round" data-flat/>`);
}

export function mapquiz() {
  return svg100(`
    ${base(HEX, HEX_IN, '#0F4A47', '#22B8B0', ['#F08A3E', '#FFD0A8'])}
    <rect x="20" y="26" width="60" height="48" rx="6" fill="#9FD8F0" data-shade="0.85"/>
    <path d="M22 44 C30 40 34 46 42 44 C46 43 48 38 54 40 C60 42 62 36 70 38 C74 39 77 42 78 46 V72 H22Z" fill="#E9C88E"/>
    <path d="M24 58 C34 54 40 62 52 58 C60 55 66 60 76 56" stroke="#C9A35A" stroke-width="1.4" fill="none" data-flat/>
    <path d="M58 22 C66 22 70 28 70 33 C70 41 58 52 58 52 C58 52 46 41 46 33 C46 28 50 22 58 22Z" fill="#E2475F"/>
    <circle cx="58" cy="33" r="4.5" fill="#FFF4DA" data-noshade/>`);
}

export function prophets() {
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#2F1F66', '#7B61D9', ['#F2C23D', '#FFE89A'])}
    <path d="M20 66 C30 60 40 70 50 64 C60 58 70 68 80 62 V76 H20Z" fill="#3D7BE0"/>
    <path d="M28 58 H72 L64 68 H36Z" fill="#B5652B"/>
    <rect x="40" y="46" width="22" height="12" rx="2" fill="#D9A066"/>
    <path d="M51 22 V46" stroke="${INK}" stroke-width="3.4" data-flat/><path d="M51 22 V46" stroke="#8C5A2B" stroke-width="1.6" data-flat/>
    <path d="M52 24 L66 38 H52Z" fill="#FFF4DA"/>
    <path d="M22 72 C30 68 38 76 48 72 C58 68 66 76 78 72" stroke="#FFFFFF" stroke-width="1.8" fill="none" stroke-linecap="round" data-flat/>`);
}

export function mosque() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#0F4A33', '#2FA57A', ['#F2C23D', '#FFE89A'])}
    <rect x="60" y="22" width="13" height="50" fill="#F1D9A8"/>
    <rect x="58" y="18" width="17" height="6" fill="#2FA57A"/>
    <rect x="64" y="10" width="5" height="9" fill="#F1D9A8"/>
    <circle cx="66.5" cy="9" r="2.2" fill="#F2C23D" data-noshade data-lw="0.6"/>
    <rect x="63.5" y="30" width="6" height="8" rx="3" fill="#2FA57A" data-noshade/>
    <rect x="24" y="46" width="38" height="26" fill="#FFF4DA"/>
    <path d="M30 46 C30 36 50 36 50 46Z" fill="#2FA57A"/>
    <path d="M34 72 V60 C34 54 44 54 44 60 V72Z" fill="#B5652B"/>
    <path d="M24 46 H62" stroke="${INK}" stroke-width="1.4" data-flat/>
    <rect x="20" y="72" width="60" height="5" rx="2" fill="#C98A4B"/>
    <path d="M27 77 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3" stroke="#2FA57A" stroke-width="1.1" fill="none" data-flat/>`);
}

export function catan() {
  // a little island of seven hexes (forest, field, pasture, hills, mountains…) with a red village on top
  const R = 10.6;
  const hx = (cx, cy, fill) => {
    let d = '';
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      d += `${i ? 'L' : 'M'}${(cx + R * Math.cos(a)).toFixed(2)} ${(cy + R * Math.sin(a)).toFixed(2)} `;
    }
    return `<path d="${d}Z" fill="${fill}" data-lw="1"/>`;
  };
  const w = R * Math.sqrt(3);
  const cells = [
    [0, 0, '#E9C46A'], [-w, 0, '#2E8B57'], [w, 0, '#C8643B'], [-w / 2, -R * 1.5, '#9ACD5A'], [w / 2, -R * 1.5, '#8E9AA6'],
    [-w / 2, R * 1.5, '#C8643B'], [w / 2, R * 1.5, '#2E8B57'],
  ];
  const tree = (x, y) => `<path d="M${x} ${y - 4.5} L${x + 3.2} ${y + 1.5} H${x - 3.2}Z" fill="#1D6B3F" data-noshade data-lw="0.6"/>`;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#1E4F7A', '#3D9BD9', ['#F2C23D', '#FFE89A'])}
    ${cells.map(([x, y, c]) => hx(50 + x, 54 + y, c)).join('')}
    ${tree(50 - w, 54)}${tree(50 + w / 2, 54 + R * 1.5)}
    <path d="M${50 + w / 2 - 4} ${54 - R * 1.5 + 2} L${50 + w / 2} ${54 - R * 1.5 - 4} L${50 + w / 2 + 4} ${54 - R * 1.5 + 2}Z" fill="#D8DEE4" data-noshade data-lw="0.6"/>
    <circle cx="50" cy="54" r="4.6" fill="#FFF3D6" data-noshade data-lw="0.8"/>
    <text x="50" y="56.3" font-size="6.4" font-family="Lilita" fill="#C0392B" text-anchor="middle" data-flat>8</text>
    <g transform="translate(37 31)">
      <path d="M-7 2 L0 -6 L7 2 V10 H-7Z" fill="#E2475F" data-lw="1.1"/>
      <rect x="-2" y="4" width="4" height="6" fill="#7A1626" data-noline data-noshade/>
    </g>`);
}

export function carca() {
  // one square land tile: a walled city with its shield, a road running out, fields around, and a follower
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#2C5A2E', '#5CB85C', ['#F2C23D', '#FFE89A'])}
    <rect x="26" y="26" width="48" height="48" rx="3" fill="#8CCB5E" data-shade="0.82"/>
    <path d="M26 26 H74 V36 C62 46 38 46 26 36Z" fill="#D9A866" data-lw="1.1"/>
    <path d="M28 37.5 C40 46 60 46 72 37.5" stroke="#8A5A2B" stroke-width="2.4" fill="none" stroke-linecap="round" data-flat/>
    <path d="M44 27 h12 v9 c0 4 -6 6 -6 6 c0 0 -6 -2 -6 -6Z" fill="#3D7BE0" data-lw="0.8"/>
    <path d="M50 29.5 v8 M46.5 33 h7" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round" data-flat/>
    <path d="M50 74 C50 62 58 56 74 56" stroke="#F3E6C8" stroke-width="5.5" fill="none" data-lw="0.9"/>
    <path d="M50 74 C50 62 58 56 74 56" stroke="#C9B48A" stroke-width="0.8" stroke-dasharray="2 2.4" fill="none" data-flat/>
    <g transform="translate(37 60)">
      <circle cx="0" cy="-7" r="3.6" fill="#E2475F" data-lw="0.9"/>
      <path d="M-6 6 L-3.5 -3 H3.5 L6 6Z" fill="#E2475F" data-lw="0.9"/>
    </g>`);
}
