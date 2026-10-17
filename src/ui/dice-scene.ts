/**
 * The 3D dice scene (three.js on an expo-gl context): rounded ivory dice with real pips, lit from the
 * top left, thrown in from the right. Each die rolls along its path, bounces lower and lower and
 * settles exactly on the rolled face — the motion is computed, so it is smooth at any frame rate.
 *
 * Coordinates: the overlay is W × H pixels; the camera is orthographic and tilted, so a ground point
 * (x, z) shows at screen (W/2 + x, H/2 + z·cos(TILT)) and height y lifts it by y·sin(TILT).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TILT = (32 * Math.PI) / 180;
export const THROW_MS = 1150;

/** Each value's face, as the outward normal in the die's own space (opposite faces add up to 7). */
const FACE: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 1, 0),
  6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(1, 0, 0),
  5: new THREE.Vector3(-1, 0, 0),
  3: new THREE.Vector3(0, 0, 1),
  4: new THREE.Vector3(0, 0, -1),
};
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

interface Throw {
  mesh: THREE.Group;
  shadow: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  target: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  delay: number;
  edge: number;
}

export class DiceScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private dice: { mesh: THREE.Group; shadow: THREE.Mesh }[] = [];
  private throws: Throw[] = [];
  private start = 0;
  private frame: number | null = null;
  private onDone: (() => void) | null = null;

  constructor(
    private gl: WebGLRenderingContext & { endFrameEXP?: () => void },
    private W: number,
    private H: number,
  ) {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    // three.js only needs a canvas-like object when it is handed an existing context
    const canvas = {
      width: w,
      height: h,
      style: {},
      clientWidth: w,
      clientHeight: h,
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: () => gl,
    } as unknown as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 6000);
    const d = 2000;
    this.camera.position.set(0, d * Math.cos(TILT), d * Math.sin(TILT));
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x3a3560, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-0.55, 1, 0.45);
    this.scene.add(sun);
  }

  /** Make sure there are `n` dice of edge `edge` px. */
  private ensure(n: number, edge: number) {
    while (this.dice.length < n) {
      const mesh = makeDie(edge);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(edge * 0.62, 32),
        new THREE.MeshBasicMaterial({ color: 0x05040e, transparent: true, opacity: 0.32, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      this.scene.add(mesh, shadow);
      this.dice.push({ mesh, shadow });
    }
    this.dice.forEach((d, i) => {
      d.mesh.visible = i < n;
      d.shadow.visible = i < n;
    });
  }

  /** Screen point (px from the overlay's top left) → ground point. */
  private ground(sx: number, sy: number) {
    return new THREE.Vector3(sx - this.W / 2, 0, (sy - this.H / 2) / Math.cos(TILT));
  }

  private place(d: { mesh: THREE.Group; shadow: THREE.Mesh }, p: THREE.Vector3, edge: number, lift: number, q: THREE.Quaternion) {
    d.mesh.position.set(p.x, edge / 2 + lift, p.z);
    d.mesh.quaternion.copy(q);
    d.shadow.position.set(p.x, 0.5, p.z + edge * 0.08);
    const k = Math.max(0, 1 - lift / (edge * 2.2));
    d.shadow.scale.setScalar(0.65 + 0.35 * k);
    (d.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * k;
  }

  private restingSpot(i: number, n: number, size: number) {
    const gap = size * 0.25;
    const total = n * size + (n - 1) * gap;
    return { x: (this.W - total) / 2 + size / 2 + i * (size + gap), y: this.H / 2 + (i % 2 ? size * 0.08 : -size * 0.06) };
  }

  /** Show the dice lying still (or nothing). */
  rest(values: number[] | null, size: number) {
    this.stop();
    const edge = size * 0.86;
    this.ensure(values?.length ?? 0, edge);
    values?.forEach((v, i) => {
      const s = this.restingSpot(i, values.length, size);
      this.place(this.dice[i], this.ground(s.x, s.y), edge, 0, faceUp(v, i * 0.4));
    });
    this.render();
  }

  /** Throw the dice in from the right; `onDone` fires when the last one has settled. */
  throwDice(values: number[], size: number, onDone: () => void) {
    this.stop();
    const edge = size * 0.86;
    this.ensure(values.length, edge);
    this.throws = values.map((v, i) => {
      const s = this.restingSpot(i, values.length, size);
      const from = this.ground(this.W + size * (0.7 + i * 0.5), this.H * (0.88 - i * 0.12));
      const to = this.ground(s.x, s.y);
      const dir = to.clone().sub(from).normalize();
      // rolling: spin about the horizontal axis across the direction of travel, a little wobbly
      const axis = new THREE.Vector3(0, 1, 0).cross(dir).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5)).normalize();
      return {
        mesh: this.dice[i].mesh,
        shadow: this.dice[i].shadow,
        from,
        to,
        target: faceUp(v, (Math.random() - 0.5) * 0.6),
        axis,
        spin: Math.PI * (5 + Math.random() * 2.5),
        delay: i * 90,
        edge,
      };
    });
    this.onDone = onDone;
    this.start = Date.now();
    const loop = () => {
      const done = this.step(Date.now() - this.start);
      this.render();
      if (done) {
        this.frame = null;
        const cb = this.onDone;
        this.onDone = null;
        cb?.();
      } else this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  private step(ms: number): boolean {
    let done = true;
    this.throws.forEach((th, i) => {
      const t = Math.min(1, Math.max(0, (ms - th.delay) / THROW_MS));
      if (t < 1) done = false;
      const travel = easeOut(Math.min(1, t * 1.12));
      const p = th.from.clone().lerp(th.to, travel);
      // bounces that shrink to nothing
      const lift = th.edge * 1.5 * Math.abs(Math.sin(t * Math.PI * 2.7)) * Math.pow(1 - t, 2);
      // the spin slows to exactly zero, so the die ends on its target face without a jump
      const angle = th.spin * Math.pow(1 - t, 2.4);
      const q = new THREE.Quaternion().setFromAxisAngle(th.axis, angle).multiply(th.target);
      this.place(this.dice[i], p, th.edge, lift, q);
    });
    return done;
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP?.();
  }

  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  dispose() {
    this.stop();
    this.renderer.dispose();
  }
}

/** Rotation that puts `value` on top, turned `yaw` radians about the vertical. */
function faceUp(value: number, yaw: number) {
  const q = new THREE.Quaternion().setFromUnitVectors(FACE[value], new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}

function makeDie(edge: number) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(edge, edge, edge, 5, edge * 0.17),
    new THREE.MeshStandardMaterial({ color: 0xfbf6ea, roughness: 0.42, metalness: 0 }),
  );
  group.add(body);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1a33, roughness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd8364c, roughness: 0.55 });
  const pip = new THREE.CircleGeometry(edge * 0.095, 24);
  const big = new THREE.CircleGeometry(edge * 0.16, 32);
  const a = edge * 0.27;
  for (const v of [1, 2, 3, 4, 5, 6]) {
    const n = FACE[v];
    // two directions lying on the face
    const u = Math.abs(n.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(n).normalize();
    const w = n.clone().cross(u).normalize();
    const facing = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    for (const [i, j] of PIPS[v]) {
      const m = new THREE.Mesh(v === 1 ? big : pip, v === 1 ? red : dark);
      m.position.copy(n.clone().multiplyScalar(edge / 2 + edge * 0.004)).addScaledVector(u, i * a).addScaledVector(w, j * a);
      m.quaternion.copy(facing);
      group.add(m);
    }
  }
  return group;
}
