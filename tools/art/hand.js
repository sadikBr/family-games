/* In-page helpers for the art pipeline: the "mascot" pass adds bold outlines, cel shading and a sticker border. */
const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

function parseColor(c) {
  if (!c || c === 'none' || c === 'transparent') return null;
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x));
  if (p.length === 4 && p[3] === 0) return null;
  return p;
}
const toHex = (p) => '#' + p.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const shade = (p, k) => toHex(p.map((v, i) => (i < 3 ? v * k : v)));
const mix = (p, q, t) => toHex(p.slice(0, 3).map((v, i) => v * (1 - t) + q[i] * t));

function roundRectPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
}

function shapePath(el) {
  const n = (a) => parseFloat(el.getAttribute(a) || '0');
  switch (el.tagName) {
    case 'path':
      return el.getAttribute('d');
    case 'circle': {
      const cx = n('cx'), cy = n('cy'), r = n('r');
      return { ellipse: [cx, cy, 2 * r, 2 * r] };
    }
    case 'ellipse':
      return { ellipse: [n('cx'), n('cy'), 2 * n('rx'), 2 * n('ry')] };
    case 'rect': {
      const rx = n('rx');
      if (rx > 0) return roundRectPath(n('x'), n('y'), n('width'), n('height'), rx);
      return { rect: [n('x'), n('y'), n('width'), n('height')] };
    }
    case 'line':
      return { line: [n('x1'), n('y1'), n('x2'), n('y2')] };
    case 'polygon':
    case 'polyline': {
      const pts = el.getAttribute('points').trim().split(/[\s,]+/).map(Number);
      const arr = [];
      for (let i = 0; i < pts.length; i += 2) arr.push([pts[i], pts[i + 1]]);
      return { poly: arr, closed: el.tagName === 'polygon' };
    }
  }
  return null;
}

/** Re-serialise compact path data (e.g. arc flags written as "0114") so rough.js can parse it. */
const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
function normPath(d) {
  let i = 0, out = [], cmd = null;
  const num = () => {
    const m = d.slice(i).match(/^[\s,]*([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/);
    if (!m) return null;
    i += m[0].length;
    return m[1];
  };
  const flag = () => {
    const m = d.slice(i).match(/^[\s,]*([01])/);
    if (!m) return null;
    i += m[0].length;
    return m[1];
  };
  while (i < d.length) {
    const ws = d.slice(i).match(/^[\s,]+/);
    if (ws) { i += ws[0].length; continue; }
    const ch = d[i];
    if (/[a-zA-Z]/.test(ch)) { cmd = ch; i++; out.push(ch); if (ch.toLowerCase() === 'z') continue; }
    else if (!cmd) break;
    else out.push(cmd === 'm' ? 'l' : cmd === 'M' ? 'L' : cmd);
    const n = ARGS[cmd.toLowerCase()];
    const vals = [];
    for (let k = 0; k < n; k++) {
      const v = cmd.toLowerCase() === 'a' && (k === 3 || k === 4) ? flag() : num();
      if (v === null) break;
      vals.push(v);
    }
    out.push(vals.join(' '));
    if (out[out.length - 2] === 'M') cmd = 'M'; if (out[out.length - 2] === 'm') cmd = 'm';
  }
  return out.join(' ').replace(/^(.)\s/, '$1');
}

function draw(rc, shape, o) {
  if (typeof shape === 'string') return rc.path(normPath(shape), o);
  if (shape.ellipse) return rc.ellipse(...shape.ellipse, o);
  if (shape.rect) return rc.rectangle(...shape.rect, o);
  if (shape.line) return rc.line(...shape.line, o);
  if (shape.poly) return shape.closed ? rc.polygon(shape.poly, o) : rc.linearPath(shape.poly, o);
}

/* ------------------------------------------------------------------ */
/* Mascot pass: bold outlines, hard cel shading, sticker border         */
/* ------------------------------------------------------------------ */
const LINE = '#151726';
function hexOrRgb(c) { return parseColor(c); }
function darker(p, k = 0.7) {
  // shade toward a cool violet so shadows look painted, not grey
  const t = [42, 24, 92];
  return toHex(p.slice(0, 3).map((v, i) => v * k + t[i] * (1 - k) * 0.55));
}
function lighter(p, t = 0.38) { return mix(p, [255, 255, 255], t); }

window.mascot = function mascot(svgString, opts = {}) {
  const host = document.getElementById('stage');
  host.innerHTML = svgString;
  const svg = host.querySelector('svg');
  const vb = svg.viewBox.baseVal;
  const px = opts.px ?? 512;
  svg.setAttribute('width', px);
  svg.setAttribute('height', Math.round((px * vb.height) / vb.width));
  const u = vb.width / 100;
  const line = (opts.line ?? 2.6) * u;
  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.prepend(defs); }
  const off = (opts.off ?? 4.2) * u;
  const els = [...svg.querySelectorAll('path,circle,ellipse,rect,polygon')].filter((e) => !e.closest('defs') && !e.closest('clipPath') && !e.closest('mask') && !e.closest('pattern'));
  els.forEach((el, i) => {
    if (!el.id) el.id = `m${i}`;
    const cs = getComputedStyle(el);
    const fill = hexOrRgb(cs.fill);
    const stroke = hexOrRgb(cs.stroke);
    const g = document.createElementNS(NS, 'g');
    if (el.getAttribute('transform')) { g.setAttribute('transform', el.getAttribute('transform')); el.removeAttribute('transform'); }
    if (el.getAttribute('opacity')) { g.setAttribute('opacity', el.getAttribute('opacity')); el.removeAttribute('opacity'); }
    el.replaceWith(g);
    g.appendChild(el);
    const flat = !!el.closest('[data-flat]');
    if (!fill || flat) {
      if (stroke && el.dataset.keepstroke === undefined && !flat) el.setAttribute('stroke', LINE);
      return;
    }
    const bb = el.getBBox();
    const big = Math.min(bb.width, bb.height) > 5 * u;
    const o = Math.min(off, Math.min(bb.width, bb.height) * (el.dataset.off ? parseFloat(el.dataset.off) : 0.22));
    if (el.dataset.noshade === undefined && big) {
      const cid = `c${el.id}`, mid = `k${el.id}`, hid = `h${el.id}`;
      const shape = el.cloneNode(false);
      shape.removeAttribute('id');
      shape.removeAttribute('stroke');
      ['fill', 'stroke', 'stroke-width', 'class', 'style'].forEach((a) => shape.removeAttribute(a));
      defs.insertAdjacentHTML('beforeend', `<clipPath id="${cid}" clipPathUnits="userSpaceOnUse">${shape.outerHTML}</clipPath>
        <mask id="${mid}" maskUnits="userSpaceOnUse" x="${bb.x - 20 * u}" y="${bb.y - 20 * u}" width="${bb.width + 40 * u}" height="${bb.height + 40 * u}">
          <rect x="${bb.x - 20 * u}" y="${bb.y - 20 * u}" width="${bb.width + 40 * u}" height="${bb.height + 40 * u}" fill="#fff"/>
          <g transform="translate(${-o} ${-o * 1.15})" fill="#000">${shape.outerHTML}</g></mask>
        <mask id="${hid}" maskUnits="userSpaceOnUse" x="${bb.x - 20 * u}" y="${bb.y - 20 * u}" width="${bb.width + 40 * u}" height="${bb.height + 40 * u}">
          <rect x="${bb.x - 20 * u}" y="${bb.y - 20 * u}" width="${bb.width + 40 * u}" height="${bb.height + 40 * u}" fill="#fff"/>
          <g transform="translate(${o * 0.45} ${o * 0.55})" fill="#000">${shape.outerHTML}</g></mask>`);
      const sh = document.createElementNS(NS, 'g');
      sh.setAttribute('clip-path', `url(#${cid})`);
      const k = el.dataset.shade ? parseFloat(el.dataset.shade) : 0.72;
      sh.innerHTML = `<g mask="url(#${mid})">${shape.outerHTML.replace('<', `<`).replace(/^<(\w+)/, `<$1 fill="${darker(fill, k)}"`)}</g>`;
      if (el.dataset.nohi === undefined && Math.min(bb.width, bb.height) > 9 * u) {
        sh.innerHTML += `<g mask="url(#${hid})" opacity="0.85">${shape.outerHTML.replace(/^<(\w+)/, `<$1 fill="${lighter(fill)}"`)}</g>`;
      }
      g.appendChild(sh);
    }
    if (el.dataset.noline === undefined) {
      const ln = el.cloneNode(false);
      ln.removeAttribute('id');
      ln.setAttribute('fill', 'none');
      ln.setAttribute('stroke', LINE);
      const own = parseFloat(el.getAttribute('stroke-width') || '0');
      ln.setAttribute('stroke-width', el.dataset.lw ? parseFloat(el.dataset.lw) * u : Math.max(line * (big ? 1 : 0.6), own));
      ln.setAttribute('stroke-linejoin', 'round');
      ln.setAttribute('stroke-linecap', 'round');
      g.appendChild(ln);
      el.removeAttribute('stroke');
    }
  });
  // sticker border around the whole artwork
  const content = document.createElementNS(NS, 'g');
  [...svg.childNodes].filter((nd) => nd !== defs).forEach((nd) => content.appendChild(nd));
  const b1 = (opts.border ?? 2.2) * u, b2 = b1 + (opts.ring ?? 3.2) * u, b3 = b2 + (opts.outer ?? 2) * u;
  defs.insertAdjacentHTML('beforeend', `<filter id="stk" x="-25%" y="-25%" width="150%" height="150%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="${b3}" result="d3"/>
    <feFlood flood-color="${opts.outerColor ?? LINE}"/><feComposite in2="d3" operator="in" result="o3"/>
    <feMorphology in="SourceAlpha" operator="dilate" radius="${b2}" result="d2"/>
    <feFlood flood-color="${opts.ringColor ?? '#ffffff'}"/><feComposite in2="d2" operator="in" result="o2"/>
    <feMorphology in="SourceAlpha" operator="dilate" radius="${b1}" result="d1"/>
    <feFlood flood-color="${LINE}"/><feComposite in2="d1" operator="in" result="o1"/>
    <feGaussianBlur in="d3" stdDeviation="${2.5 * u}"/><feOffset dy="${2.4 * u}" result="sb"/>
    <feFlood flood-color="#05040e" flood-opacity="${opts.shadow ?? 0.5}"/><feComposite in2="sb" operator="in" result="sh"/>
    <feMerge><feMergeNode in="sh"/><feMergeNode in="o3"/><feMergeNode in="o2"/><feMergeNode in="o1"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`);
  if (opts.sticker !== false) content.setAttribute('filter', 'url(#stk)');
  svg.appendChild(content);
};
