// How things move once they leave the floor. Not keyframes: each object is a body with a position, a velocity,
// an orientation and a spin. A slow current (a drifting vector field) pushes it around, a soft spring keeps it
// near its place in the orbit, the bass shoves it outward, hits kick its spin about a fresh axis, and a weak
// torque turns its screen back toward the camera so you can still read it. Now and then a body glitches:
// for a moment it is drawn snapped to a coarse grid, like a computer dropping frames.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();

export class Body {
  constructor(seed) {
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.q = new THREE.Quaternion(); this.w = new THREE.Vector3();
    this.seed = seed; this.air = false; this.glitch = 0;
    const r = (k) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5 + 0.5;
    this.ph = [r(1), r(2), r(3), r(4), r(5), r(6)].map((x) => x * 6.283);
    this.k = 2.2 + r(7) * 1.8;                 // spring to its anchor: lower is floatier
    this.drag = 1.1 + r(8) * 0.8;
    this.spinDrag = 0.8 + r(9) * 0.9;
    this.mass = 1;
  }
  // leave the floor: from where it stands, thrown up and out, spinning
  launch(homeP, homeQ, out, power = 1) {
    this.p.copy(homeP); this.q.copy(homeQ); this.air = true;
    this.v.copy(out).multiplyScalar(0.5 * power).addScaledVector(UP, (1.3 + 0.6 * Math.sin(this.ph[0])) * power);
    this.w.set(Math.sin(this.ph[1]), Math.sin(this.ph[2]), Math.sin(this.ph[3])).multiplyScalar(3.5 * power);
  }
  land() { this.air = false; this.v.set(0, 0, 0); this.w.set(0, 0, 0); }
  // a hit: spin about a new axis (not the old one), and a little shove
  kick(spin, shove, dir) {
    const a = new THREE.Vector3(Math.sin(this.seed * 3.1 + performance.now() * 0.0013), Math.cos(this.seed * 1.7 + performance.now() * 0.0007), Math.sin(this.seed * 5.3 - performance.now() * 0.0011)).normalize();
    this.w.addScaledVector(a, spin);
    if (dir) this.v.addScaledVector(dir, shove);
  }
  // the current: three slow sine fields, so neighbours drift together and nothing repeats
  current(t, out) {
    const p = this.p, f = this.ph;
    return out.set(
      Math.sin(p.y * 1.7 + t * 0.53 + f[0]) + Math.sin(p.z * 2.3 - t * 0.37 + f[1]),
      Math.sin(p.z * 1.9 + t * 0.41 + f[2]) + Math.sin(p.x * 1.3 - t * 0.29 + f[3]) * 0.8,
      Math.sin(p.x * 2.1 + t * 0.47 + f[4]) + Math.sin(p.y * 1.1 - t * 0.33 + f[5]),
    ).multiplyScalar(0.5);
  }
  // stiff: how much harder than usual it is held to its anchor (a formation); face: how hard its screen is turned to the eye
  step(dt, t, anchor, eye, flow, stiff = 1, face = 1) {
    // translation: spring + drag + current
    tmpV.copy(anchor).sub(this.p).multiplyScalar(this.k * stiff);
    tmpV.addScaledVector(this.v, -this.drag * Math.sqrt(stiff) * (stiff > 1 ? 1.6 : 1));
    const c = this.current(t, new THREE.Vector3()).multiplyScalar(flow);
    tmpV.add(c);
    this.v.addScaledVector(tmpV, dt); this.p.addScaledVector(this.v, dt);
    // rotation: drag, a wandering torque, and a weak pull turning the screen (+z) toward the eye, upright-ish
    this.w.multiplyScalar(Math.exp(-dt * this.spinDrag * (face > 1 ? 2.5 : 1)));
    this.w.addScaledVector(c, dt * 0.9);
    if (eye) {
      tmpM.lookAt(eye, this.p, UP); tmpQ.setFromRotationMatrix(tmpM);           // a pose facing the eye
      const d = tmpQ.multiply(this.q.clone().invert());                        // the rotation still to go
      if (d.w < 0) { d.x = -d.x; d.y = -d.y; d.z = -d.z; d.w = -d.w; }
      const ang = 2 * Math.acos(Math.min(1, d.w)), s = Math.sqrt(Math.max(1e-8, 1 - d.w * d.w));
      if (ang > 1e-3) this.w.addScaledVector(tmpV.set(d.x / s, d.y / s, d.z / s), ang * dt * 0.9 * face);
    }
    const wl = this.w.length();
    if (wl > 1e-5) { tmpQ.setFromAxisAngle(tmpV.copy(this.w).divideScalar(wl), wl * dt); this.q.premultiply(tmpQ).normalize(); }
    this.glitch = Math.max(0, this.glitch - dt);
  }
  // what to draw: the body, or while glitching, the body snapped to a coarse grid of places and angles
  pose(outP, outQ) {
    if (this.glitch <= 0) { outP.copy(this.p); outQ.copy(this.q); return; }
    const g = 0.05; outP.set(Math.round(this.p.x / g) * g, Math.round(this.p.y / g) * g, Math.round(this.p.z / g) * g);
    const e = new THREE.Euler().setFromQuaternion(this.q), st = Math.PI / 6;
    outQ.setFromEuler(e.set(Math.round(e.x / st) * st, Math.round(e.y / st) * st, Math.round(e.z / st) * st));
  }
}

// camera shots for the drops: an offset from wherever the viewer has put the camera, and a slow move within it
export const SHOTS = [
  { az: 0, el: 0, zoom: 0, daz: 0.05, dzoom: 0.04 },
  { az: 1.25, el: 0.12, zoom: -0.25, daz: -0.06, dzoom: 0.05 },
  { az: -0.95, el: -0.08, zoom: 0.3, daz: 0.08, dzoom: -0.03 },
  { az: 2.7, el: 0.28, zoom: -0.15, daz: 0.04, dzoom: 0.06 },
  { az: 0.35, el: -0.16, zoom: 0.55, daz: -0.05, dzoom: 0.02 },     // close on the deck
  { az: -2.2, el: 0.05, zoom: -0.35, daz: 0.07, dzoom: 0.05 },
  { az: 3.14, el: 0.2, zoom: 0.1, daz: -0.04, dzoom: 0.03 },        // from behind the computers
];
export { FWD };
