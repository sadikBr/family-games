// Emblems for الخربقة, معركة السفن, إكس أو, سودوكو, معلومات عامة, الذاكرة (100×100, mascot pass).
import { INK, svg100 } from './mkit.mjs';
import { HEX, HEX_IN, ROUND, ROUND_IN, SHIELD, SHIELD_IN, base } from './games2.mjs';

export function kharbga() {
  const x0 = 26, step = 8; // 7×7 lines, 48 wide
  let grid = '';
  for (let i = 0; i < 7; i++) {
    grid += `<path d="M${x0} ${x0 + 2 + i * step} H${x0 + 48}" stroke="#7A4A22" stroke-width="1" data-flat/>`;
    grid += `<path d="M${x0 + i * step} ${x0 + 2} V${x0 + 50}" stroke="#7A4A22" stroke-width="1" data-flat/>`;
  }
  const P = { 1: '#F5ECD6', 2: '#B8323F' };
  const layout = [
    [0, 1, 1, 0, 2, 0, 0],
    [1, 0, 1, 2, 0, 2, 0],
    [0, 1, 0, 1, 2, 0, 2],
    [1, 0, 1, 0, 2, 2, 0],
    [0, 1, 0, 2, 0, 2, 2],
    [0, 0, 1, 0, 2, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ];
  let pieces = '';
  layout.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) pieces += `<circle cx="${x0 + c * step}" cy="${x0 + 2 + r * step}" r="3.3" fill="${P[v]}" data-lw="0.8"/>`;
    }),
  );
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#6B3A18', '#C77D3A', ['#2E8B57', '#9BD8A6'])}
    <rect x="${x0 - 5}" y="${x0 - 3}" width="58" height="58" rx="5" fill="#E9C88E"/>
    ${grid}
    <rect x="${x0 + 3 * step - 3.4}" y="${x0 + 2 + 3 * step - 3.4}" width="6.8" height="6.8" fill="#2E8B57" data-noshade data-lw="0.8"/>
    ${pieces}`);
}

export function battleship() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#0E2A55', '#2F7FD0', ['#E2475F', '#FFB3BE'])}
    <path d="M17 58 H83 V70 C70 84 30 84 17 70Z" fill="#1B4E9B" data-noline/>
    <path d="M22 50 H78 L71 64 H29Z" fill="#8C96B4"/>
    <rect x="36" y="38" width="24" height="12" rx="2" fill="#B9C2DA"/>
    <rect x="44" y="28" width="8" height="10" rx="1.5" fill="#8C96B4"/>
    <path d="M60 44 L73 39" stroke="${INK}" stroke-width="4" stroke-linecap="round" data-flat/>
    <path d="M60 44 L73 39" stroke="#B9C2DA" stroke-width="2" stroke-linecap="round" data-flat/>
    <circle cx="33" cy="56" r="2" fill="#F2C23D" data-noshade data-lw="0.6"/><circle cx="43" cy="56" r="2" fill="#F2C23D" data-noshade data-lw="0.6"/><circle cx="53" cy="56" r="2" fill="#F2C23D" data-noshade data-lw="0.6"/>
    <path d="M22 68 C28 64 34 72 40 68 C46 64 52 72 58 68 C64 64 70 72 78 68" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" data-flat/>
    <path d="M68 18 L71 25 L78 23 L74 29 L80 33 L72 34 L72 41 L67 36 L61 40 L62 33 L55 31 L62 28 L60 21 L66 24Z" fill="#F08A3E"/>
    <circle cx="68" cy="30" r="3.5" fill="#FFE08A" data-noshade/>`);
}

export function xo() {
  const X = (cx, cy, s = 6.5) => `<path d="M${cx - s} ${cy - s} L${cx + s} ${cy + s} M${cx + s} ${cy - s} L${cx - s} ${cy + s}" stroke="${INK}" stroke-width="7" stroke-linecap="round" data-flat/>
    <path d="M${cx - s} ${cy - s} L${cx + s} ${cy + s} M${cx + s} ${cy - s} L${cx - s} ${cy + s}" stroke="#E2475F" stroke-width="4" stroke-linecap="round" data-flat/>`;
  const O = (cx, cy, r = 6.5) => `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${INK}" stroke-width="7" fill="none" data-flat/>
    <circle cx="${cx}" cy="${cy}" r="${r}" stroke="#3DB7E4" stroke-width="4" fill="none" data-flat/>`;
  const cells = [30, 50, 70];
  return svg100(`
    ${base(HEX, HEX_IN, '#3E1F6E', '#7B4BD0', ['#F2C23D', '#FFE89A'])}
    <rect x="19" y="19" width="62" height="62" rx="8" fill="#FFF4DA"/>
    <path d="M40 23 V77 M60 23 V77 M23 40 H77 M23 60 H77" stroke="#C9B9E8" stroke-width="2.6" stroke-linecap="round" data-flat/>
    ${X(cells[0], cells[0])}${O(cells[1], cells[0])}${X(cells[1], cells[1])}${O(cells[0], cells[2])}${X(cells[2], cells[2])}${O(cells[2], cells[0])}
    <path d="M24 24 L76 76" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" data-flat/>
    <path d="M24 24 L76 76" stroke="#F2C23D" stroke-width="2.2" stroke-linecap="round" data-flat/>`);
}

export function sudoku() {
  const nums = [
    [5, 0, 3],
    [0, 7, 0],
    [9, 0, 1],
  ];
  let t = '';
  nums.forEach((row, r) =>
    row.forEach((v, c) => {
      const x = 27 + c * 16, y = 27 + r * 16;
      const hot = r === 1 && c === 2;
      t += `<rect x="${x}" y="${y}" width="15" height="15" rx="2" fill="${hot ? '#F2C23D' : v ? '#FFFFFF' : '#E7F4EE'}" data-lw="0.8"/>`;
      const ch = hot ? '4' : v ? String(v) : '';
      if (ch) t += `<text x="${x + 7.5}" y="${y + 12}" font-size="11.5" font-family="Lalezar" fill="${hot ? INK : '#1F6F57'}" text-anchor="middle" data-flat>${ch}</text>`;
    }),
  );
  return svg100(`
    ${base(SHIELD, SHIELD_IN, '#145244', '#2A9D7C', ['#F2B33D', '#FFE08A'])}
    <rect x="24" y="24" width="54" height="54" rx="5" fill="#1F6F57"/>
    ${t}
    <path d="M68 62 L80 74 L76 78 L64 66Z" fill="#F08A3E"/>
    <path d="M64 66 L68 62 L62 60Z" fill="#FFF4DA"/>`);
}

export function trivia() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#7A3A0F', '#E58A2B', ['#3D7BE0', '#A9C8FF'])}
    <circle cx="50" cy="48" r="23" fill="#3D9BE0"/>
    <path d="M33 40 C38 36 42 42 47 38 C50 35 47 30 52 28 M56 60 C58 54 64 56 66 50 C68 46 72 46 72 44 M30 54 C34 52 38 56 42 54" stroke="#2FB67C" stroke-width="5" fill="none" stroke-linecap="round" data-flat/>
    <path d="M60 18 H80 C83 18 85 20 85 23 V35 C85 38 83 40 80 40 H72 L66 46 L67 40 H60 C57 40 55 38 55 35 V23 C55 20 57 18 60 18Z" fill="#FFF4DA"/>
    <text x="70" y="38" font-size="24" font-family="Lalezar" fill="#C8371F" text-anchor="middle" data-flat>؟</text>`);
}

export function memory() {
  const card = (x, y, rot, face) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-12" y="-16" width="24" height="32" rx="4" fill="${face ? '#FFF4DA' : '#D0457A'}"/>
    ${face ? face : `<path d="M0 -8 L7 0 L0 8 L-7 0Z" fill="#FFC2D8" data-noshade data-lw="0.6"/>`}</g>`;
  const star = `<path d="M0 -9 L2.6 -3 L9 -2.6 L4 1.6 L5.6 8 L0 4.6 L-5.6 8 L-4 1.6 L-9 -2.6 L-2.6 -3Z" fill="#F2C23D" data-lw="0.8"/>`;
  return svg100(`
    ${base(HEX, HEX_IN, '#6E1B45', '#D0457A', ['#2FB67C', '#A8E6C8'])}
    ${card(32, 40, -10)}${card(68, 40, 10)}
    ${card(36, 62, -6, star)}${card(64, 62, 6, star)}`);
}
