// Renders the 3D die with three.js in Chromium:
//   - a 36-frame tumbling loop (sprite sheet, 6×6)
//   - 6 resting frames, one per value (face up, seen at an angle)
//   node dice3d.mjs <outdir> [size]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(new URL(import.meta.url).pathname);
const [outDir, sizeArg] = process.argv.slice(2);
const SIZE = Number(sizeArg ?? 256);
fs.mkdirSync(outDir, { recursive: true });

const page_src = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style>
<script type="importmap">{"imports":{"three":"http://assets.local/three.module.js","three/addons/":"http://assets.local/jsm/"}}</script></head>
<body><script type="module">
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const S = ${SIZE};
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(S, S);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.5).texture;
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
camera.position.set(0, 3.45, 1.9);
camera.lookAt(0, 0, 0);

const PIPS = { 1: [[.5,.5]], 2: [[.27,.27],[.73,.73]], 3: [[.25,.25],[.5,.5],[.75,.75]], 4: [[.28,.28],[.72,.28],[.28,.72],[.72,.72]], 5: [[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]], 6: [[.28,.24],[.72,.24],[.28,.5],[.72,.5],[.28,.76],[.72,.76]] };
function faceTex(n) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, 512, 512);
  for (const [x, y] of PIPS[n]) {
    const r = n === 1 ? 62 : 44;
    const cx = x * 512, cy = y * 512;
    const red = n === 1;
    // soft rim, then a recessed pip lit from the top-left
    g.beginPath(); g.arc(cx, cy, r * 1.12, 0, Math.PI * 2); g.fillStyle = '#ECE6D6'; g.fill();
    const grad = g.createRadialGradient(cx + r * 0.35, cy + r * 0.4, r * 0.1, cx, cy, r);
    grad.addColorStop(0, red ? '#FF5A6E' : '#4A4D66');
    grad.addColorStop(1, red ? '#B5122B' : '#141626');
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = grad; g.fill();
  }
  // Upload raw pixels: swiftshader's canvas→texture path leaves streaks around each draw call.
  const t = new THREE.DataTexture(new Uint8Array(g.getImageData(0, 0, 512, 512).data.buffer), 512, 512, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
// BoxGeometry groups: +x, -x, +y, -y, +z, -z
const VALUES = [2, 5, 1, 6, 3, 4];
const mats = VALUES.map((n) => new THREE.MeshStandardMaterial({ map: faceTex(n), roughness: 0.55, metalness: 0, envMapIntensity: 0.35 }));
const geo = new RoundedBoxGeometry(1, 1, 1, 12, 0.2);
const die = new THREE.Group();
die.add(new THREE.Mesh(geo, mats));
const hull = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 12, 0.2), new THREE.MeshBasicMaterial({ color: 0x2a2c44, side: THREE.BackSide }));
hull.scale.setScalar(1.03);
die.add(hull);
scene.add(die);
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc3a8, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-2, 4, 2.5); scene.add(sun);

const NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
window.rest = (n) => {
  const nrm = new THREE.Vector3(...NORMALS[VALUES.indexOf(n)]);
  const q = new THREE.Quaternion().setFromUnitVectors(nrm, new THREE.Vector3(0, 1, 0));
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 5);
  die.quaternion.copy(yaw.multiply(q));
  renderer.render(scene, camera);
};
window.tumble = (i, total) => {
  const t = (i / total) * Math.PI * 2;
  const e = new THREE.Euler(t * 2 + 0.4, t + 0.9, t * 1 + 0.2, 'XYZ');
  die.quaternion.setFromEuler(e);
  renderer.render(scene, camera);
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
const three = path.join(here, 'node_modules/three');
await page.route('http://assets.local/**', (route) => {
  const p = new URL(route.request().url()).pathname;
  const file = p.startsWith('/jsm/') ? path.join(three, 'examples/jsm', p.slice(5)) : path.join(three, 'build', p.slice(1));
  route.fulfill({ path: file, contentType: 'text/javascript' });
});
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.setContent(page_src);
await page.waitForFunction(() => window.ready === true, null, { timeout: 20000 });
const canvas = await page.$('canvas');
for (let n = 1; n <= 6; n++) {
  await page.evaluate((v) => window.rest(v), n);
  await canvas.screenshot({ path: path.join(outDir, `rest-${n}.png`), omitBackground: true });
}
const FRAMES = 36;
for (let i = 0; i < FRAMES; i++) {
  await page.evaluate(([a, b]) => window.tumble(a, b), [i, FRAMES]);
  await canvas.screenshot({ path: path.join(outDir, `tumble-${String(i).padStart(2, '0')}.png`), omitBackground: true });
}
await browser.close();
console.log('dice frames written');
