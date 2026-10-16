// Mascot drawing kit: expressive eyes, brows, mouths, hair helpers.
// Elements carry data-* hints for the mascot pass:
//   data-flat     → no shading, no outline (details drawn in ink or white)
//   data-noshade  → outline only
//   data-noline   → shading only
//   data-lw="1.2" → outline width (in 1/100 of the drawing)
export const INK = '#151726';
let k = 0;
export const id = (p) => `${p}${++k}`;

export const svg100 = (body, defs = '', vb = '0 0 100 100') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><defs>${defs}</defs>${body}</svg>`;

/** Anime-style eye. side: -1 = left eye (viewer's left), 1 = right. */
export function eye(cx, cy, { w = 13, h = 9, iris = '#2e9bd6', side = 1, look = 0, lid = 0, fierce = 0, lash = 1 } = {}) {
  const l = cx - w / 2, r = cx + w / 2;
  // outer corner is on the far side from the nose
  const outer = side > 0 ? r : l, inner = side > 0 ? l : r;
  const up = h * (0.15 + fierce * 0.25);
  const top = cy - h * (1 - lid * 0.55);
  const d = `M${inner} ${cy + h * 0.05} C${inner + (outer - inner) * 0.18} ${top} ${outer - (outer - inner) * 0.22} ${top - fierce * 2} ${outer} ${cy - up} C${outer - (outer - inner) * 0.2} ${cy + h * 0.72} ${inner + (outer - inner) * 0.22} ${cy + h * 0.72} ${inner} ${cy + h * 0.05}Z`;
  const cid = id('eye');
  const ir = h * 0.66;
  const ix = cx + look * w * 0.18, iy = cy + h * 0.02;
  return `<clipPath id="${cid}"><path d="${d}"/></clipPath>
  <path d="${d}" fill="#ffffff" data-noshade data-lw="1.1"/>
  <g clip-path="url(#${cid})">
    <circle cx="${ix}" cy="${iy}" r="${ir}" fill="${iris}" data-flat/>
    <path d="M${ix - ir} ${iy} a${ir} ${ir} 0 0 1 ${ir * 2} 0z" fill="${INK}" opacity="0.35" data-flat/>
    <circle cx="${ix}" cy="${iy + ir * 0.35}" r="${ir * 0.55}" fill="#ffffff" opacity="0.22" data-flat/>
    <circle cx="${ix}" cy="${iy}" r="${ir * 0.45}" fill="${INK}" data-flat/>
    <circle cx="${ix + ir * 0.35}" cy="${iy - ir * 0.38}" r="${ir * 0.3}" fill="#ffffff" data-flat/>
    <circle cx="${ix - ir * 0.32}" cy="${iy + ir * 0.4}" r="${ir * 0.14}" fill="#ffffff" data-flat/>
    <path d="${d}" fill="none" stroke="${INK}" stroke-width="${h * 0.08}" opacity="0.25" transform="translate(0 ${h * 0.12})" data-flat/>
  </g>
  <path d="M${inner} ${cy + h * 0.05} C${inner + (outer - inner) * 0.18} ${top} ${outer - (outer - inner) * 0.22} ${top - fierce * 2} ${outer} ${cy - up} l${side * 2.2 * lash} ${(-1.6 - fierce) * lash} l${-side * 1.2 * lash} ${2.6 * lash} C${outer - (outer - inner) * 0.25} ${top + h * 0.5} ${inner + (outer - inner) * 0.2} ${top + h * 0.45} ${inner} ${cy + h * 0.22}Z" fill="${INK}" data-flat/>`;
}

/** Thick tapered eyebrow. angle > 0 = angry (inner end low). */
export function brow(cx, cy, { w = 13, side = 1, angle = 0, t = 2.6, color = INK } = {}) {
  const inner = cx - side * w / 2, outer = cx + side * w / 2;
  const yi = cy + angle * 2.6, yo = cy - angle * 1.2;
  return `<path d="M${inner} ${yi + t * 0.5} Q${cx} ${Math.min(yi, yo) - 3.2} ${outer} ${yo} Q${cx} ${Math.min(yi, yo) - 3.2 + t} ${inner} ${yi + t * 0.5 + t}Z" fill="${color}" data-flat/>`;
}

/** Mouths. */
export function smile(cx, cy, w = 10, { open = false, smirk = 0, teeth = false } = {}) {
  if (!open) {
    return `<path d="M${cx - w / 2} ${cy - smirk} Q${cx} ${cy + w * 0.42} ${cx + w / 2} ${cy - 1.4 - smirk * 0.2}" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" data-flat/>`;
  }
  return `<path d="M${cx - w / 2} ${cy} Q${cx} ${cy + w * 0.95} ${cx + w / 2} ${cy}Z" fill="#5b1f2a" data-noshade data-lw="1.3"/>
    <path d="M${cx - w * 0.28} ${cy + w * 0.42} Q${cx} ${cy + w * 0.2} ${cx + w * 0.28} ${cy + w * 0.42} Q${cx} ${cy + w * 0.75} ${cx - w * 0.28} ${cy + w * 0.42}Z" fill="#e8667a" data-flat/>
    ${teeth ? `<path d="M${cx - w * 0.42} ${cy + 0.4} H${cx + w * 0.42} L${cx + w * 0.36} ${cy + w * 0.18} H${cx - w * 0.36}Z" fill="#fff" data-flat/>` : ''}`;
}

export const blush = (cx, cy, r = 3.4) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.6}" fill="#ff6f86" opacity="0.4" data-flat/>`;

export const nose = (cx, cy, s = 1) =>
  `<path d="M${cx + 0.4 * s} ${cy - 2.4 * s} Q${cx + 1.6 * s} ${cy} ${cx - 0.6 * s} ${cy + 0.6 * s}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity="0.65" data-flat/>`;

/** Quick polygon/curve path helper: points with optional 'q' control (quadratic). */
export function curve(pts, close = true) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) d += `Q${p[0]} ${p[1]} ${p[2]} ${p[3]}`;
    else if (p.length === 6) d += `C${p.join(' ')}`;
    else d += `L${p[0]} ${p[1]}`;
  }
  return d + (close ? 'Z' : '');
}

/** Spiky hair tuft row along a head top: returns a path of spikes between x0..x1 at baseline y. */
export function spikes(x0, x1, y, n, h, lean = 0, jitter = 0.3) {
  let d = `M${x0} ${y}`;
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * step, b = a + step;
    const hh = h * (1 - jitter / 2 + ((i * 37) % 10) / 10 * jitter);
    d += `Q${a + step * 0.15} ${y - hh * 0.55} ${a + step * 0.5 + lean} ${y - hh} Q${a + step * 0.75} ${y - hh * 0.4} ${b} ${y}`;
  }
  return d;
}
