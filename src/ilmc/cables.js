// The wiring, grown rather than placed. Every computer is powered from one power strip fed by a giant mains
// cable, and sends data into the back of the deck. Each run is steered across the floor: pulled toward where it
// is going, pushed around everything in the way, wandering on a noise field, and now and then throwing a coil
// of slack that crosses over itself. Long runs share a path in zip-tied bundles.
import * as THREE from 'three';
import { Cable, Plugs, rbox } from './models.js';

// obstacles: circles (x, z, r) on the floor, in the room's local frame
export class Router {
  constructor(obstacles, seed = 1) {
    this.obs = obstacles; this.s = seed;
  }
  rnd() { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; }
  // a noise angle field, so neighbouring runs bend alike
  field(x, z, k) { return Math.sin(x * 3.1 + k) * 1.3 + Math.sin(z * 2.7 - k * 1.7) * 1.1 + Math.sin((x + z) * 5.3 + k * 0.5) * 0.5; }
  route(a, b, { y = 0, wander = 0.8, coil = 0, keepOut = 0.04, ignore = [] } = {}) {
    const pts = [[a[0], a[1]]], step = 0.03, k = this.rnd() * 10;
    let x = a[0], z = a[1], dir = Math.atan2(b[1] - z, b[0] - x) + (this.rnd() - 0.5) * 1.2;
    let coiled = coil ? 0 : 1, coilAt = 0.25 + this.rnd() * 0.5;
    const total = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const maxSteps = Math.ceil(total / step * 2.2) + 40;
    for (let i = 0; i < maxSteps; i++) {
      const dx = b[0] - x, dz = b[1] - z, d = Math.hypot(dx, dz);
      if (d < step * 1.5) break;
      if (i > maxSteps - 30) { x += dx / d * step * 1.5; z += dz / d * step * 1.5; pts.push([x, z]); continue; }   // stuck: just go
      let vx = dx / d * (1.2 + 2 / (d + 0.2)), vz = dz / d * (1.2 + 2 / (d + 0.2));
      const f = this.field(x, z, k); vx += Math.cos(f) * wander * Math.min(1, d * 2); vz += Math.sin(f) * wander * Math.min(1, d * 2);
      for (const o of this.obs) {                              // pushed around what is in the way
        if (ignore.includes(o)) continue;
        const ox = x - o.x, oz = z - o.z, od = Math.hypot(ox, oz), R = o.r + keepOut;
        if (od < R * 1.8) { const push = Math.pow(1 - Math.min(1, (od - R) / (R * 0.8)), 2) * 4; vx += ox / (od + 1e-4) * push; vz += oz / (od + 1e-4) * push; }
      }
      const want = Math.atan2(vz, vx); let turn = ((want - dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      dir += Math.max(-0.35, Math.min(0.35, turn));            // cables can't turn on a pin
      x += Math.cos(dir) * step; z += Math.sin(dir) * step; pts.push([x, z]);
      if (!coiled && 1 - d / total > coilAt) {                 // a coil of slack, crossing over itself
        coiled = 1; const r = 0.045 + this.rnd() * 0.04, side = this.rnd() < 0.5 ? 1 : -1, turns = 1 + Math.floor(this.rnd() * 2) + coil - 1;
        const cx = x + Math.cos(dir + side * Math.PI / 2) * r, cz = z + Math.sin(dir + side * Math.PI / 2) * r, a0 = Math.atan2(z - cz, x - cx);
        for (let j = 1; j <= 24 * turns; j++) { const t = a0 - side * j / 24 * Math.PI * 2; pts.push([cx + Math.cos(t) * r * (1 + 0.08 * j / 24), cz + Math.sin(t) * r * (1 + 0.08 * j / 24), 0.006 * j / (24 * turns)]); }
        x = pts[pts.length - 1][0]; z = pts[pts.length - 1][1];
      }
    }
    pts.push([b[0], b[1]]);
    return pts.map(([x, z]) => [x, y, z]);
  }
}

// a long white power strip with six sockets and a glowing switch
export function powerStrip() {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.45 });
  g.add(new THREE.Mesh(rbox(0.36, 0.04, 0.07, 0.012), white)); g.children[0].position.y = 0.02;
  const hole = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.7 });
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 20), hole); s.position.set(-0.13 + i * 0.045, 0.04, 0); g.add(s); }
  const sw = new THREE.Mesh(rbox(0.03, 0.012, 0.022, 0.003), new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff3a00, emissiveIntensity: 1.5, roughness: 0.3 }));
  sw.position.set(0.155, 0.044, 0); g.add(sw); g.userData.switch = sw;
  return g;
}
// headphones, for plugging into the deck
export function headphones() {
  const g = new THREE.Group(), m = new THREE.MeshPhysicalMaterial({ color: 0x1b1b1f, roughness: 0.35, clearcoat: 0.6 }), pad = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.03, 32), m); cup.position.set(s * 0.085, 0.022, 0); cup.rotation.z = s * 0.25; g.add(cup);
    const p = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.012, 10, 30), pad); p.position.set(s * 0.085, 0.04, 0); p.rotation.x = Math.PI / 2; g.add(p);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 10, 40, Math.PI), m); band.rotation.x = -Math.PI / 2 + 0.1; band.position.y = 0.012; g.add(band);
  return g;
}

// grow the whole wiring of the room
export function wire(room, { CX, FLOOR, things, R }) {
  const obs = things.map((o) => ({ x: o.home.p.x, z: o.home.p.z, r: Math.max(0.06, o.foot || o.size * 0.55), o }));
  for (const [x, z] of [[-0.12, -0.12], [-0.12, 0.12], [0.06, -0.14], [0.06, 0.14], [0.21, -0.12], [0.21, 0.12]]) obs.push({ x: CX - 0.04 + x, z, r: 0.12 });   // the deck
  const router = new Router(obs, 9001), cables = [], group = new THREE.Group(), specs = [];
  // every run is settled on the floor before it is made: where it meets a cable already lying there it rides
  // up over it (and over itself, in a coil), with a ramp either side, so nothing ever passes through anything
  const CELL = 0.03, grid = new Map(), key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const settle = (pts, r, spec) => {
    const base = pts.map((p) => p[1]), need = base.slice(), under = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, , z] = pts[i]; let hit = null;
      for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) for (const q of grid.get(`${Math.floor(x / CELL) + gx},${Math.floor(z / CELL) + gz}`) || []) {
        if (q.spec === spec && Math.abs(q.i - i) < 8) continue;
        const d = Math.hypot(q.x - x, q.z - z);
        if (d < q.r + r + 0.0015) { const top = q.y + q.r + r + 0.0005; if (top > need[i]) { need[i] = top; hit = q; } }
      }
      if (hit) under.push(hit);
      if (spec.fixedEnd && i >= pts.length - spec.fixedEnd) need[i] = pts[i][1];
      grid.has(key(x, z)) || grid.set(key(x, z), []);
      grid.get(key(x, z)).push({ x, z, y: need[i], r, spec, i });                   // later cables see this one
    }
    const step = 0.03, slope = 0.3, y = need.slice();                             // ramps: rise into a crossing, settle after
    for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i], y[i - 1] - slope * step);
    for (let i = y.length - 2; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - slope * step);
    for (let i = 0; i < pts.length; i++) { pts[i][1] = y[i]; for (const g of grid.get(key(pts[i][0], pts[i][2])) || []) if (g.spec === spec && g.i === i) g.y = y[i]; }
    spec.free = y.map((v, i) => (v - base[i] > 0.001 ? 0 : 1));                 // riding over something: hold still
    for (const q of under) q.spec.free[q.i] = 0;                                   // and the one underneath holds still too
  };
  const add = (pts, rad, col, kind, tag, fixedEnd = 0) => {
    const spec = { rad, col, kind, tag, fixedEnd, free: null }; specs.push(spec);
    settle(pts, rad, spec); spec.pts = pts;
    return spec;
  };
  // the power strip behind the deck, and the mains cable running off into the dark, with a big coil
  const strip = powerStrip(); strip.position.set(CX - 0.55, FLOOR, -0.42); strip.rotation.y = 0.35; group.add(strip);
  const stripObs = { x: strip.position.x, z: strip.position.z, r: 0.2 }; obs.push(stripObs);
  const sock = (i) => new THREE.Vector3(-0.13 + (i % 6) * 0.045, 0, 0.04).applyEuler(strip.rotation).add(strip.position);
  const mains = router.route([strip.position.x - 0.2, strip.position.z - 0.02], [-2.6, -1.9], { y: FLOOR + 0.011, wander: 1.1, coil: 2, ignore: [stripObs] });
  add(mains, 0.011, 0x111113, 'jack', 'mains'); mains.pts = mains;
  // a zip-tied bundle that follows the mains for a while: four cables, twisted around it
  const bundle = [], ties = [];
  for (let k = 0; k < 4; k++) {
    const ph = k / 4 * Math.PI * 2, pts = mains.pts.slice(1, Math.min(mains.pts.length, 70)).filter((p, i) => i % 3 === 0).map(([x, y, z], i) => [x + Math.cos(i * 0.5 + ph) * 0.016, y + 0.004 + Math.sin(i * 0.5 + ph) * 0.006, z + Math.sin(i * 0.5 + ph) * 0.016]);
    const sp = { rad: 0.0035, col: [0xf4f4f0, 0x2f6fe8, 0xf4f4f0, 0xd22a2a][k], kind: 'usb', tag: 'bundle', pts: pts.flatMap((p, i) => (i ? [[(p[0] + pts[i - 1][0]) / 2, (p[1] + pts[i - 1][1]) / 2, (p[2] + pts[i - 1][2]) / 2], p] : [p])), free: null };
    sp.free = sp.pts.map(() => 0); specs.push(sp); bundle.push(sp);
    if (k === 0) for (let i = 2; i < pts.length - 1; i += 5) {                // zip ties
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0025, 6, 18), new THREE.MeshStandardMaterial({ color: 0xf8f8f4, roughness: 0.5 })); ties.push(t);
      const m = mains.pts, j = 1 + i * 3; if (j + 3 >= m.length) break;
      t.position.set(m[j][0], m[j][1], m[j][2]);
      const n = new THREE.Vector3(m[j + 3][0] - m[j - 1][0], 0, m[j + 3][2] - m[j - 1][2]).normalize(); t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); group.add(t);
    }
  }
  // every computer: power from the strip, data into the deck
  let s = 0;
  const deckPorts = [];
  for (const o of things) {
    if (!o.screens.length && o.kind !== 'speaker' && o.kind !== 'tower') continue;
    const me = obs.find((b) => b.o === o), from = [o.home.p.x - Math.sin(o.home.yaw) * (o.foot || 0.1), o.home.p.z - Math.cos(o.home.yaw) * (o.foot || 0.1)];
    if (o.kind !== 'phone' && o.kind !== 'ipod') {
      const to = sock(s++);
      add(router.route(from, [to.x, to.z], { y: FLOOR + 0.006 + (s % 3) * 0.002, coil: R() < 0.35 ? 1 : 0, ignore: [me, stripObs] }), 0.0045, [0x16161a, 0xf4f4f0][s % 2], 'usb', 'power');
    }
    if (o.screens.length) {
      const px = CX + (deckPorts.length % 6 - 2.5) * 0.04, port = [px, -0.255];
      const pts = router.route(from, port, { y: FLOOR + 0.008 + (deckPorts.length % 4) * 0.002, coil: R() < 0.3 ? 1 : 0, ignore: [me] });
      pts.push([px, FLOOR + 0.015, -0.23], [px, FLOOR + 0.03, -0.205]);   // up into the back of the plinth
      deckPorts.push(add(pts, 0.0038, o.kind === 'laptop' ? 0xf4f4f0 : [0x16161a, 0xf4f4f0, 0x2f6fe8][deckPorts.length % 3], 'usb', 'data', 2));
    }
  }
  // headphones on the floor in front, plugged into the deck
  const hp = headphones(); hp.position.set(CX - 0.42, FLOOR, 0.36); hp.rotation.y = 0.6; group.add(hp);
  obs.push({ x: hp.position.x, z: hp.position.z, r: 0.12 });
  add(router.route([hp.position.x + 0.05, hp.position.z - 0.05], [CX - 0.16, 0.24], { y: FLOOR + 0.004, coil: 2, ignore: [obs[obs.length - 1]] }).concat([[CX - 0.16, FLOOR + 0.03, 0.205]]), 0.0025, 0x111113, 'jack', 'phones', 1);
  // and a lot of loose runs between whatever is near: the mess of the cover
  for (let i = 0; i < 26; i++) {
    const a = things[Math.floor(R() * things.length)], ang = R() * Math.PI * 2, far = 0.5 + R() * 1.2;
    const from = [a.home.p.x + Math.cos(ang) * 0.12, a.home.p.z + Math.sin(ang) * 0.12], to = [from[0] + Math.cos(ang + (R() - 0.5)) * far, from[1] + Math.sin(ang + (R() - 0.5)) * far];
    add(router.route(from, to, { y: FLOOR + 0.004 + (i % 5) * 0.0015, wander: 1.2, coil: R() < 0.4 ? 1 : 0, ignore: [obs.find((b) => b.o === a)] }), 0.0026 + R() * 0.003, [0xf4f4f0, 0xeeeeea, 0xf4f4f0, 0x16161a, 0x2f6fe8, 0xd22a2a, 0xffffff][i % 7], ['usb', 'rj', 'jack'][i % 3], 'loose');
  }
  // now make them: thin the settled paths for the spline, and carry how free each stretch is to move
  for (const sp of specs) {
    const keep = sp.pts.map((p, i) => i).filter((i) => i % 2 === 0 || i === sp.pts.length - 1);
    const c = new Cable(keep.map((i) => sp.pts[i]), sp.rad, sp.col, cables.length * 1.7 + 0.3, sp.kind, keep.map((i) => sp.free[i]));
    c.tag = sp.tag; sp.cable = c; group.add(c.g); cables.push(c);
  }
  const plugs = new Plugs(cables); group.add(plugs.g);
  room.add(group);
  return { plugs, cables, data: deckPorts.map((s) => s.cable), power: cables.filter((c) => c.tag === 'power' || c.tag === 'mains' || c.tag === 'bundle'), strip, headphones: hp, group, ties };
}
