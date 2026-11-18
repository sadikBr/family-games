// Emblem for «الدومينو» (100×100, mascot pass): three ivory tiles meeting on a round green café table —
// a double six standing crosswise in the middle, a 6|3 and a 4|6 joined to it on each side — black pips,
// a brass pin in each groove.
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

const SPOTS = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.28, 0.22], [0.28, 0.5], [0.28, 0.78], [0.72, 0.22], [0.72, 0.5], [0.72, 0.78]],
};

/** A tile at (x, y), `u` = half its length; vertical or not; `a` = top/left pips, `b` = the other half. */
function tile(x, y, u, vertical, a, b, rot = 0) {
  const w = vertical ? u : 2 * u, h = vertical ? 2 * u : u;
  const cx = x + w / 2, cy = y + h / 2;
  const pips = (n, ox, oy) =>
    (SPOTS[n] ?? [])
      .map(([px, py]) => {
        const [qx, qy] = vertical ? [px, py] : [py, px];
        return `<circle cx="${ox + 1 + qx * (u - 2)}" cy="${oy + 1 + qy * (u - 2)}" r="${u * 0.12}" fill="${INK}" data-flat/>`;
      })
      .join('');
  const groove = vertical ? `M${x + 2.4} ${cy} H${x + w - 2.4}` : `M${cx} ${y + 2.4} V${y + h - 2.4}`;
  return `<g transform="rotate(${rot} ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${u * 0.2}" fill="#FBF3DF" data-shade="0.86"/>
    <path d="${groove}" stroke="#B9AA86" stroke-width="1.3" stroke-linecap="round" data-flat/>
    ${pips(a, x, y)}${vertical ? pips(b, x, y + u) : pips(b, x + u, y)}
    <circle cx="${cx}" cy="${cy}" r="1.1" fill="#C29A45" data-flat/>
  </g>`;
}

export function domino() {
  const u = 12;
  return svg100(`
    ${base(ROUND, ROUND_IN, '#124530', '#1E6B4A', ['#F2C23D', '#FFE89A'])}
    <ellipse cx="50" cy="56" rx="27" ry="16" fill="#FFFFFF" opacity="0.06" data-noline data-noshade/>
    ${tile(50 - u / 2, 51 - u, u, true, 6, 6)}
    ${tile(50 + u / 2, 51 - u / 2, u, false, 6, 3)}
    ${tile(50 - u / 2 - 2 * u, 51 - u / 2, u, false, 4, 6)}
    ${tile(39, 21, u * 0.85, false, 5, 2, -10)}`);
}
