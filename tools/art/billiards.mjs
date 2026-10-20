// Emblem for «البلياردو» (100×100, mascot pass): the 8 ball in front of a yellow 1 and a red striped 11
// on green cloth, a cue coming in from the lower right.
import { INK, svg100 } from './mkit.mjs';
import { ROUND, ROUND_IN, base } from './games2.mjs';

function ball(cx, cy, r, color, n, stripe = false) {
  const h = r * 0.5;
  const w = Math.sqrt(r * r - h * h);
  const band = `M${cx - w} ${cy - h} L${cx + w} ${cy - h} A${r} ${r} 0 0 1 ${cx + w} ${cy + h} L${cx - w} ${cy + h} A${r} ${r} 0 0 1 ${cx - w} ${cy - h}Z`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${stripe ? '#FFF8EA' : color}"/>
    ${stripe ? `<path d="${band}" fill="${color}" data-noline/>` : ''}
    <circle cx="${cx}" cy="${cy}" r="${r * 0.46}" fill="#FFFFFF" data-noshade data-lw="0.7"/>
    <text x="${cx}" y="${cy + r * 0.2}" font-size="${r * (n >= 10 ? 0.5 : 0.62)}" font-family="Lilita" fill="${INK}" text-anchor="middle" dominant-baseline="middle" data-flat>${n}</text>
    <ellipse cx="${cx - r * 0.42}" cy="${cy - r * 0.48}" rx="${r * 0.22}" ry="${r * 0.13}" transform="rotate(-35 ${cx - r * 0.42} ${cy - r * 0.48})" fill="#FFFFFF" opacity="0.7" data-flat/>`;
}

export function billiards() {
  return svg100(`
    ${base(ROUND, ROUND_IN, '#0E5139', '#1C8C64', ['#F2C23D', '#FFE89A'])}
    ${ball(63, 31, 11.5, '#F2C21B', 1)}
    ${ball(34, 35, 11.5, '#DA3030', 11, true)}
    ${ball(38, 63, 15.5, '#1A1A1E', 8)}
    <path d="M86 85 L66.5 61.5" stroke="${INK}" stroke-width="7.5" stroke-linecap="round" data-flat/>
    <path d="M86 85 L68.3 63.7" stroke="#E9CFA0" stroke-width="4.6" stroke-linecap="round" data-flat/>
    <path d="M86 85 L79 76.5" stroke="#5B3A22" stroke-width="5" stroke-linecap="round" data-flat/>
    <path d="M68.3 63.7 L66.6 61.6" stroke="#3D7BD9" stroke-width="4.6" stroke-linecap="round" data-flat/>
    <circle cx="61" cy="54.5" r="6.5" fill="#F7F3E8" data-lw="1"/>`);
}
