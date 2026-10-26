// Emblem for «المثلثات» (100×100, mascot pass): a small dark hexagonal board of pegs on a triangular
// lattice, rubber bands stretched between pegs in the players' colours, and two triangles already won
// (a piece of each owner's colour inside) — the «Chain Triangle» toy.
import { INK, svg100 } from './mkit.mjs';
import { HEX, HEX_IN, base } from './games2.mjs';

export function triangles() {
  const s = 14;
  const cx = 50, cy = 53;
  const P = (q, r) => [cx + (q + r / 2) * s, cy + r * s * 0.866];
  const pegs = [];
  for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) if (Math.abs(q + r) <= 2) pegs.push(P(q, r));
  const corner = (q, r, k = 1.27) => P(q * k, r * k).join(' ');
  const board = `M${corner(2, 0)} L${corner(0, 2)} L${corner(-2, 2)} L${corner(-2, 0)} L${corner(0, -2)} L${corner(2, -2)}Z`;
  // a piece inside the unit triangle a-b-c (shrunk towards its centre)
  const piece = (a, b, c, fill) => {
    const pts = [a, b, c].map(([q, r]) => P(q, r));
    const mx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, my = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
    const k = 0.74;
    return `<path d="M${pts.map(([x, y]) => `${mx + (x - mx) * k} ${my + (y - my) * k}`).join(' L')}Z" fill="${fill}" data-lw="0.9"/>`;
  };
  // a rubber band looped over two pegs: dark outline, bright strands, darker middle
  const band = (a, b, c, mid) => {
    const [x1, y1] = P(...a), [x2, y2] = P(...b);
    const d = `M${x1} ${y1} L${x2} ${y2}`;
    return `<path d="${d}" stroke="${INK}" stroke-width="4.8" stroke-linecap="round" data-flat/><path d="${d}" stroke="${c}" stroke-width="3" stroke-linecap="round" data-flat/><path d="${d}" stroke="${mid}" stroke-width="1.1" stroke-linecap="round" data-flat/>`;
  };
  return svg100(`
    ${base(HEX, HEX_IN, '#6A2E0C', '#E0873A', ['#F2C23D', '#FFE89A'])}
    <path d="${board}" fill="#1A1E46" stroke-linejoin="round" data-shade="0.8"/>
    ${band([-2, 0], [1, 0], '#F0566B', '#8E2232')}
    ${band([0, -2], [0, 1], '#F2C23D', '#8A6414')}
    ${band([1, 0], [-1, 2], '#4AA8F0', '#1E5480')}
    ${band([-2, 1], [0, -1], '#3CCB8A', '#17694A')}
    ${piece([0, 0], [1, 0], [0, 1], '#4AA8F0')}
    ${piece([-1, 0], [0, -1], [0, 0], '#F0566B')}
    ${pegs.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.5" fill="#FFF4DA" data-lw="0.8"/>`).join('')}`);
}
