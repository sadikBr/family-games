// Ludo and checkers boards, pieces and dice (rendered through the mascot pass).
import { INK, svg100 } from './mkit.mjs';

const LC = { red: '#E2475F', green: '#2FB67C', yellow: '#F2B33D', blue: '#3D7BE0' };
const LIGHT = { red: '#F7B3BF', green: '#A8E6C8', yellow: '#FBE0A6', blue: '#B5CCF5' };

/* same geometry as src/shared/ludo.ts */
const TRACK = (() => {
  const t = [];
  for (let c = 1; c <= 5; c++) t.push([6, c]);
  for (let r = 5; r >= 0; r--) t.push([r, 6]);
  t.push([0, 7]);
  for (let r = 0; r <= 5; r++) t.push([r, 8]);
  for (let c = 9; c <= 14; c++) t.push([6, c]);
  t.push([7, 14]);
  for (let c = 14; c >= 9; c--) t.push([8, c]);
  for (let r = 9; r <= 14; r++) t.push([r, 8]);
  t.push([14, 7]);
  for (let r = 14; r >= 9; r--) t.push([r, 6]);
  for (let c = 5; c >= 0; c--) t.push([8, c]);
  t.push([7, 0]);
  t.push([6, 0]);
  return t;
})();
const START = { red: 0, green: 13, yellow: 26, blue: 39 };
const STARS = [8, 21, 34, 47];
const HOME = {
  red: [1, 2, 3, 4, 5].map((c) => [7, c]),
  green: [1, 2, 3, 4, 5].map((r) => [r, 7]),
  yellow: [13, 12, 11, 10, 9].map((c) => [7, c]),
  blue: [13, 12, 11, 10, 9].map((r) => [r, 7]),
};
const BASES = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };

function star(cx, cy, r, fill) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${p.join(' ')}" fill="${fill}" data-noshade data-lw="0.5"/>`;
}

export function ludoBoard() {
  const S = 10;
  let cells = '';
  const cell = (r, c, fill, extra = '') => `<rect x="${c * S}" y="${r * S}" width="${S}" height="${S}" fill="${fill}" data-noshade data-lw="0.45" ${extra}/>`;
  TRACK.forEach(([r, c], i) => {
    let fill = '#FFFDF7';
    for (const [col, st] of Object.entries(START)) if (st === i) fill = LC[col];
    cells += cell(r, c, fill);
    if (STARS.includes(i)) cells += star(c * S + 5, r * S + 5, 3.6, '#C9C2D6');
  });
  for (const [col, list] of Object.entries(HOME)) for (const [r, c] of list) cells += cell(r, c, LC[col]);
  // start arrows
  const arrow = (r, c, rot) => `<path d="M-2.6 -1.6 L1.8 0 L-2.6 1.6Z" fill="#ffffff" transform="translate(${c * S + 5} ${r * S + 5}) rotate(${rot})" data-flat/>`;
  cells += arrow(6, 1, 0) + arrow(1, 8, 90) + arrow(8, 13, 180) + arrow(13, 6, 270);
  let bases = '';
  for (const [col, [r0, c0]] of Object.entries(BASES)) {
    const x = c0 * S, y = r0 * S;
    bases += `<rect x="${x}" y="${y}" width="60" height="60" fill="${LC[col]}" data-off="0.04" data-lw="0.9"/>
      <rect x="${x + 7}" y="${y + 7}" width="46" height="46" rx="7" fill="#FFFDF7" data-noshade data-lw="0.8"/>
      ${[[20, 20], [40, 20], [20, 40], [40, 40]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="7" fill="${LIGHT[col]}" data-noshade data-lw="0.7"/>`).join('')}`;
  }
  const centre = `
    <path d="M60 60 L75 75 L60 90Z" fill="${LC.red}" data-noshade data-lw="0.7"/>
    <path d="M60 60 L75 75 L90 60Z" fill="${LC.green}" data-noshade data-lw="0.7"/>
    <path d="M90 60 L75 75 L90 90Z" fill="${LC.yellow}" data-noshade data-lw="0.7"/>
    <path d="M60 90 L75 75 L90 90Z" fill="${LC.blue}" data-noshade data-lw="0.7"/>`;
  return svg100(
    `<rect x="-4" y="-4" width="158" height="158" rx="8" fill="#6B3E1E" data-off="0.02" data-lw="1.1"/>
     <rect x="0" y="0" width="150" height="150" fill="#FFFDF7" data-noshade data-lw="0.8"/>
     ${bases}${cells}${centre}`,
    '',
    '-6 -6 162 162',
  );
}

export function pawn(color) {
  const c = LC[color];
  return svg100(`
    <ellipse cx="50" cy="88" rx="30" ry="9" fill="${c}" data-shade="0.6"/>
    <path d="M30 86 C34 64 40 56 42 46 L58 46 C60 56 66 64 70 86Z" fill="${c}"/>
    <ellipse cx="50" cy="46" rx="14" ry="5" fill="${c}" data-shade="0.6"/>
    <circle cx="50" cy="30" r="17" fill="${c}"/>
    <ellipse cx="44" cy="23" rx="5" ry="3.4" fill="#ffffff" opacity="0.65" data-flat/>`);
}

export function dice(n) {
  const P = { 1: [[50, 50]], 2: [[32, 32], [68, 68]], 3: [[30, 30], [50, 50], [70, 70]], 4: [[32, 32], [68, 32], [32, 68], [68, 68]], 5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]], 6: [[32, 28], [68, 28], [32, 50], [68, 50], [32, 72], [68, 72]] }[n];
  return svg100(`
    <rect x="10" y="10" width="80" height="80" rx="18" fill="#FFFDF7" data-shade="0.86"/>
    ${P.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${n === 1 ? 10 : 8}" fill="${n === 1 ? '#E2475F' : INK}" data-noshade data-lw="0.6"/>`).join('')}`);
}

export function damaBoard() {
  let sq = '';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const dark = (r + c) % 2 === 1;
      sq += `<rect x="${c * 10}" y="${r * 10}" width="10" height="10" fill="${dark ? '#8A5A33' : '#F1D9A8'}" data-noshade data-noline/>`;
    }
  return svg100(
    `<rect x="-7" y="-7" width="94" height="94" rx="6" fill="#4A2A16" data-off="0.02" data-lw="1"/>
     <rect x="-3.5" y="-3.5" width="87" height="87" rx="2" fill="none" stroke="#C9963F" stroke-width="1.1" data-flat/>
     ${sq}
     <rect x="0" y="0" width="80" height="80" fill="none" stroke="${INK}" stroke-width="0.9" data-flat/>`,
    '',
    '-9 -9 98 98',
  );
}

export function damaPiece(color, king) {
  const base = color === 'white' ? '#F4ECDD' : '#3A2C2A';
  const ring = color === 'white' ? '#D9CBB0' : '#5A4440';
  const crown = king
    ? `<path d="M32 58 L30 38 L40 46 L50 32 L60 46 L70 38 L68 58Z" fill="#F4C02E" data-lw="1.6"/>
       <circle cx="50" cy="44" r="3" fill="#E2475F" data-lw="0.8"/>`
    : '';
  return svg100(`
    <ellipse cx="50" cy="58" rx="38" ry="30" fill="${base}" data-shade="0.6"/>
    <ellipse cx="50" cy="50" rx="38" ry="30" fill="${base}"/>
    <ellipse cx="50" cy="50" rx="26" ry="20" fill="none" stroke="${ring}" stroke-width="3" data-flat/>
    <ellipse cx="50" cy="50" rx="14" ry="10" fill="none" stroke="${ring}" stroke-width="2.4" data-flat/>
    ${crown}`);
}
