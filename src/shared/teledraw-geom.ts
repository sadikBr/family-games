/**
 * «الرسم المتسلسل» — keeping drawings small. Every drawing is stored for the whole game and sent again
 * in the reveal, so each line is thinned out (Ramer–Douglas–Peucker) before it leaves the phone, and
 * again on the server. Coordinates are integers on a 1000 × 1000 canvas.
 */

/** Distance from point p to the segment a–b. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Drop the points of a line (x0,y0,x1,y1…) that are closer than `eps` to the simplified line.
 * The first and last points always stay; a single dot stays a dot.
 */
export function simplifyPoints(pts: number[], eps = 2.5): number[] {
  const n = Math.floor(pts.length / 2);
  if (n <= 2) return pts.slice(0, n * 2);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let best = eps;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i * 2], pts[i * 2 + 1], pts[a * 2], pts[a * 2 + 1], pts[b * 2], pts[b * 2 + 1]);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

/** Number of coordinates in a drawing (2 per point). */
export function drawingSize(strokes: { p: number[] }[]): number {
  let n = 0;
  for (const s of strokes) n += s.p.length;
  return n;
}
