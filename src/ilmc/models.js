// The hardware around the deck, modelled here so it shares the deck's units (metres) and light.
// Local frame: +y up, screens face +z. Every builder returns { g, screens: [{ mesh, w, h }], tick(dt, fx) }.
import * as THREE from 'three';
import { RoundedBoxGeometry } from './../vendor/addons/RoundedBoxGeometry.js';
import { plastic, age, glassOver } from './wear.js';
import { bake } from './bake.js';

export const rbox = (w, h, d, r = 0.006, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
export const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// ---------- materials ----------
// Aged plastic now comes from wear.js (shared maps, sampled in each part's own space). `crust` here is how far gone it is:
// 0 = kept nicely, 1 = yellowed, dusty and scuffed. The mineral crust of the frankencomputers is wear.js's `crust`.
export function crusty(color, crust = 1, rough = 0.6) {
  return plastic(color, rough, { age: 0.25 + 0.4 * crust, dust: 0.2 + 0.4 * crust, wear: 0.3 + 0.5 * crust });
}
export const MAT = {
  beige: () => crusty(0xd8cfb7, 0.85, 0.5),
  platinum: () => crusty(0xe2ddd0, 0.4, 0.45),
  black: () => plastic(0x161618, 0.5, { age: 0, dust: 0.5, wear: 0.5 }),
  blackGloss: () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.25 }),
  silver: () => age(new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.32, metalness: 0.9 }), { age: 0, dust: 0.3, wear: 0.6 }),
  white: () => plastic(0xeeeeea, 0.35, { age: 0.3, dust: 0.3, wear: 0.5 }),
  grey: () => plastic(0x55585e, 0.5, { age: 0, dust: 0.4, wear: 0.4 }),
  pcb: () => new THREE.MeshStandardMaterial({ color: 0x1d3a26, roughness: 0.55, metalness: 0.1 }),
  pcbDark: () => new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.2 }),
  orange: () => new THREE.MeshStandardMaterial({ color: 0xe5561d, roughness: 0.45 }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 1 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.08, metalness: 0, clearcoat: 1 }),
};

// a screen: a slightly bulged quad (CRTs) or a flat one; the material is assigned by the screen system. A quad laid over
// or under a picture of size rw x rh passes it, so all the layers of one tube follow the same curved surface.
export function screenQuad(w, h, bulge = 0, rw = w, rh = h) {
  const g = new THREE.PlaneGeometry(w, h, bulge ? 16 : 1, bulge ? 12 : 1), p = g.attributes.position;
  if (bulge) for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (rw / 2), y = p.getY(i) / (rh / 2); p.setZ(i, bulge * (1 - 0.5 * (x * x + y * y))); }
  g.computeVertexNormals();
  return g;
}
export const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

// a case fan: a square frame with a round throat and screw holes, struts behind, a hub with a sticker, seven curved and
// pitched blades, and a translucent blur that fades in as it speeds up (so it reads as spinning, not strobing).
// faces +z; spin it with set(angle)
export function fan(size, mat, standoff = 0) {
  const g = new THREE.Group(), r = size * 0.47, d = size * 0.26, TAU = Math.PI * 2;
  const sq = new THREE.Shape(), h = size / 2, c = size * 0.09;
  sq.moveTo(-h + c, -h); sq.lineTo(h - c, -h); sq.quadraticCurveTo(h, -h, h, -h + c); sq.lineTo(h, h - c); sq.quadraticCurveTo(h, h, h - c, h); sq.lineTo(-h + c, h); sq.quadraticCurveTo(-h, h, -h, h - c); sq.lineTo(-h, -h + c); sq.quadraticCurveTo(-h, -h, -h + c, -h);
  const throat = new THREE.Path(); throat.absarc(0, 0, r, 0, TAU, true); sq.holes.push(throat);
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = new THREE.Path(); p.absarc(x * size * 0.4, y * size * 0.4, size * 0.035, 0, TAU, true); sq.holes.push(p); }
  const fg = new THREE.ExtrudeGeometry(sq, { depth: d, bevelEnabled: true, bevelThickness: size * 0.01, bevelSize: size * 0.01, bevelSegments: 1, curveSegments: 16 }); fg.translate(0, 0, -d / 2);
  g.add(mesh(fg, mat));
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.7 });
  const mount = mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.36, d * 0.25, 32), mat); mount.rotation.x = Math.PI / 2; mount.position.z = -d * 0.38; g.add(mount);
  for (let i = 0; i < 4; i++) { const st = mesh(new THREE.BoxGeometry(r * 0.66, size * 0.03, d * 0.2), mat); const a = i / 4 * TAU + Math.PI / 4; st.position.set(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, -d * 0.38); st.rotation.z = a; g.add(st); }
  if (standoff > 0) {                           // screwed to whatever is behind it: four metal posts from the corner holes
    const post = new THREE.CylinderGeometry(size * 0.028, size * 0.028, standoff, 12); post.rotateX(Math.PI / 2);
    const back = -d / 2 - size * 0.01 - standoff / 2;
    const sv = MAT.silver(); for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(mesh(post, sv, x * size * 0.4, y * size * 0.4, back));
  }
  const rot = new THREE.Group(); g.add(rot);
  const hub = mesh(new THREE.CylinderGeometry(r * 0.32, r * 0.33, d * 0.6, 32), mat); hub.rotation.x = Math.PI / 2; hub.position.z = d * 0.05; rot.add(hub);
  const st1 = mesh(new THREE.CircleGeometry(r * 0.27, 32), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.35 })); st1.position.z = d * 0.351; rot.add(st1);
  const st2 = mesh(new THREE.RingGeometry(r * 0.17, r * 0.2, 32), new THREE.MeshStandardMaterial({ color: 0xd8dbe0, roughness: 0.4 })); st2.position.z = d * 0.352; rot.add(st2);
  // a blade: a curved, swept vane from the hub to near the rim, then pitched about its own radial axis
  const pol = (rr, a) => [rr * Math.cos(a), rr * Math.sin(a)], r0 = r * 0.31, r1 = r * 0.95, bs = new THREE.Shape();
  bs.moveTo(...pol(r0, -0.32));
  bs.quadraticCurveTo(...pol(r * 0.66, -0.3), ...pol(r1, -0.04));
  for (let k = 1; k <= 8; k++) bs.lineTo(...pol(r1, -0.04 + k * 0.06));
  bs.quadraticCurveTo(...pol(r * 0.64, 0.46), ...pol(r0, 0.24));
  for (let k = 1; k <= 6; k++) bs.lineTo(...pol(r0, 0.24 - k * 0.0933));
  const bg = new THREE.ExtrudeGeometry(bs, { depth: size * 0.008, bevelEnabled: true, bevelThickness: size * 0.004, bevelSize: size * 0.004, bevelSegments: 1, curveSegments: 6 });
  bg.translate(0, 0, -size * 0.004); bg.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.cos(0.12), Math.sin(0.12), 0), 0.5));
  for (let i = 0; i < 7; i++) { const b = mesh(bg, mat); b.rotation.z = i / 7 * TAU; b.position.z = d * 0.05; rot.add(b); }
  const blurMat = new THREE.MeshBasicMaterial({ color: 0x18181b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const blur = mesh(new THREE.RingGeometry(r0, r1, 48), blurMat); blur.position.z = d * 0.2; g.add(blur);
  bake(g, [rot, blur]); bake(rot, []);
  let last = 0, t = performance.now();
  return {
    g, rot,
    set(angle) {                                 // spin to this angle; the blur follows how fast it got there
      const now = performance.now(), w = Math.abs(angle - last) / Math.max(1e-3, (now - t) / 1000);
      last = angle; t = now; rot.rotation.z = angle;
      blurMat.opacity += (Math.min(0.7, Math.max(0, (w - 6) / 40)) - blurMat.opacity) * 0.2;
    },
  };
}

// a motherboard slab with chips, caps and slots, instanced
export function board(w, h, seed, mat = MAT.pcb()) {
  const R = rng(seed), g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, h, 0.003), mat));
  const chips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), MAT.pcbDark(), 26), caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12), MAT.silver(), 18);
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2b2f8a, roughness: 0.5 }), 4);
  const o = new THREE.Object3D();
  for (let i = 0; i < 26; i++) {
    const s = 0.008 + R() * 0.03; o.position.set((R() - 0.5) * (w - s), (R() - 0.5) * (h - s), 0.003); o.scale.set(s, s * (0.6 + R()), 0.003 + R() * 0.004); o.rotation.set(0, 0, 0); o.updateMatrix(); chips.setMatrixAt(i, o.matrix);
  }
  for (let i = 0; i < 18; i++) {
    const r = 0.003 + R() * 0.004; o.position.set((R() - 0.5) * (w - 0.01), (R() - 0.5) * (h - 0.01), 0.008); o.scale.set(r, 0.014, r); o.rotation.set(Math.PI / 2, 0, 0); o.updateMatrix(); caps.setMatrixAt(i, o.matrix);
  }
  for (let i = 0; i < 4; i++) { o.position.set(-w * 0.15 + i * 0.012, h * 0.1, 0.005); o.scale.set(0.006, h * 0.55, 0.008); o.rotation.set(0, 0, 0); o.updateMatrix(); slots.setMatrixAt(i, o.matrix); }
  g.add(chips, caps, slots);
  return g;
}

// ---------- the hero: a compact Mac-shaped computer fused with PC parts, as in the video ----------
export function franken(seed = 1, s = 1) {
  const R = rng(seed), g = new THREE.Group(), beige = MAT.beige();
  const W = 0.25 * s, H = 0.33 * s, D = 0.27 * s;
  g.add(mesh(rbox(W, H, D, 0.018 * s, 4), beige, 0, H / 2, 0));
  // bezel recess and the screen
  const sw = 0.165 * s, sh = 0.125 * s;
  g.add(mesh(rbox(sw + 0.024 * s, sh + 0.024 * s, 0.01 * s, 0.01 * s), MAT.black(), 0, H * 0.64, D / 2 - 0.0065 * s));   // bezel face 1.5 mm behind the glass
  const scr = mesh(screenQuad(sw, sh, 0.006 * s), null, 0, H * 0.64, D / 2 + 0.002 * s); g.add(scr);
  g.add(mesh(rbox(0.08 * s, 0.006 * s, 0.01 * s, 0.002 * s), MAT.black(), 0.045 * s, H * 0.24, D / 2));     // floppy slot
  const slot = new THREE.Object3D(); slot.position.set(0.045 * s, H * 0.24, D / 2 + 0.01); g.add(slot);
  g.add(mesh(rbox(W * 0.9, 0.02 * s, 0.006 * s, 0.003), crusty(0xb8ae96, 0.9), 0, 0.03 * s, D / 2 + 0.001)); // the chin ridges
  g.add(mesh(rbox(W * 0.9, 0.02 * s, 0.006 * s, 0.003), crusty(0xb8ae96, 0.9), 0, 0.06 * s, D / 2 + 0.001));
  // the fused PC: a board up the side, a big fan, a tower of slots behind, orange caps on top
  const side = board(D * 0.9, H * 0.85, seed * 7, MAT.pcbDark()); side.rotation.y = Math.PI / 2; side.position.set(W / 2 + 0.004 * s, H * 0.5, 0); g.add(side);
  const f = fan(0.12 * s, MAT.black()); f.g.rotation.y = Math.PI / 2; f.g.position.set(W / 2 + 0.03 * s, H * 0.45, 0.02 * s); g.add(f.g);
  const back = board(W * 0.8, H * 0.7, seed * 13); back.position.set(0, H * 0.55, -D / 2 - 0.004); back.rotation.y = Math.PI; g.add(back);
  const capMat = MAT.orange();
  for (let i = 0; i < 4; i++) { const c = mesh(new THREE.CylinderGeometry(0.014 * s, 0.012 * s, 0.03 * s, 16), capMat, -W * 0.3 + i * 0.03 * s + R() * 0.01, H + 0.012 * s, -D * 0.2 + R() * 0.04); c.rotation.z = (R() - 0.5) * 0.3; g.add(c); }
  const tower = mesh(rbox(0.07 * s, 0.2 * s, 0.2 * s, 0.006), crusty(0x8c8778, 1), -W / 2 - 0.035 * s, 0.1 * s, -0.02 * s); g.add(tower);
  const led = mesh(new THREE.SphereGeometry(0.003 * s, 8, 8), new THREE.MeshBasicMaterial({ color: 0x55ff77 }), -W * 0.38, 0.03 * s, D / 2 + 0.004); g.add(led);
  let spin = 0;
  return {
    g, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'franken', size: H, slot,
    tick(dt, fx) { spin += dt * (2 + 40 * fx.low + 25 * fx.energy); f.set(spin); led.material.color.setHSL(0.33, 1, 0.3 + 0.5 * fx.hat); },
  };
}

// ---------- a CRT monitor (beige, or a black TV) ----------
export function crt(seed = 1, s = 1, tv = false) {
  const g = new THREE.Group(), mat = tv ? MAT.black() : (seed % 2 ? MAT.beige() : MAT.platinum());
  const W = (tv ? 0.42 : 0.38) * s, H = (tv ? 0.34 : 0.33) * s, D = 0.06 * s;
  g.add(mesh(rbox(W, H, D, 0.014 * s, 3), mat, 0, H / 2 + 0.03 * s, 0));
  const back = new THREE.CylinderGeometry(0.11 * s, 0.17 * s, 0.26 * s, 4, 1); back.rotateY(Math.PI / 4); back.rotateX(-Math.PI / 2); back.scale(1.15, 1, 1);
  g.add(mesh(back, mat, 0, H / 2 + 0.03 * s, -D / 2 - 0.12 * s));
  if (!tv) g.add(mesh(rbox(0.22 * s, 0.03 * s, 0.22 * s, 0.01 * s), mat, 0, 0.015 * s, -0.05 * s));   // swivel foot
  else for (const x of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.03 * s, 8), MAT.silver(), x * 0.12 * s, 0.015 * s, 0));
  const sw = W * 0.78, sh = H * 0.74;
  g.add(mesh(rbox(sw + 0.02 * s, sh + 0.02 * s, 0.01 * s, 0.012 * s), MAT.black(), 0, H / 2 + 0.03 * s + 0.008 * s, D / 2 - 0.0045 * s));
  const scr = mesh(screenQuad(sw, sh, 0.012 * s), null, 0, H / 2 + 0.03 * s + 0.008 * s, D / 2 + 0.002 * s); g.add(scr);
  const led = mesh(new THREE.SphereGeometry(0.0035 * s, 8, 8), new THREE.MeshBasicMaterial({ color: 0x77ff66 }), W * 0.38, 0.05 * s, D / 2 + 0.002); g.add(led);
  return { g, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: tv ? 'tv' : 'crt', size: H, tick(dt, fx) { led.material.color.setHSL(0.3, 1, 0.25 + 0.5 * fx.kick); } };
}

// ---------- a flat panel on a stand (the big monitor on the album cover) ----------
export function lcd(s = 1) {
  const g = new THREE.Group(), W = 0.56 * s, H = 0.34 * s;
  g.add(mesh(rbox(W, H, 0.025 * s, 0.006 * s), MAT.black(), 0, 0.12 * s + H / 2, 0));
  g.add(mesh(rbox(0.05 * s, 0.14 * s, 0.02 * s, 0.004), MAT.black(), 0, 0.07 * s, -0.025 * s));
  g.add(mesh(rbox(0.22 * s, 0.012 * s, 0.16 * s, 0.005), MAT.black(), 0, 0.006 * s, -0.02 * s));
  const sw = W - 0.02 * s, sh = H - 0.02 * s;
  const scr = mesh(screenQuad(sw, sh), null, 0, 0.12 * s + H / 2, 0.0135 * s); g.add(scr);
  return { g, screens: [{ mesh: scr, w: sw, h: sh }], kind: 'lcd', size: 0.46 * s, tick() {} };
}

// ---------- a laptop whose lid flaps open and shut on the jig ----------
export function laptop(seed = 1, s = 1, color = 'silver') {
  const g = new THREE.Group(), mat = color === 'white' ? MAT.white() : color === 'black' ? MAT.black() : MAT.silver();
  const W = 0.32 * s, D = 0.22 * s, T = 0.014 * s;
  g.add(mesh(rbox(W, T, D, 0.006 * s), mat, 0, T / 2, 0));
  const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0155 * s, 0.002 * s, 0.0155 * s), keyMaterial(), 14 * 5);
  const o = new THREE.Object3D(), col = new THREE.Color();
  for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) { o.position.set((c - 6.5) * 0.019 * s, T + 0.0006 * s, (r - 2) * 0.019 * s - 0.03 * s); o.updateMatrix(); keys.setMatrixAt(r * 14 + c, o.matrix); keys.setColorAt(r * 14 + c, col.setRGB(0, 0, 0)); }
  g.add(keys);
  g.add(mesh(rbox(0.1 * s, 0.001 * s, 0.06 * s, 0.003), MAT.grey(), 0, T + 0.0003 * s, D * 0.3));
  const hinge = new THREE.Group(); hinge.position.set(0, T, -D / 2 + 0.004 * s); g.add(hinge);
  const lid = mesh(rbox(W, 0.012 * s, D, 0.006 * s), mat, 0, 0, D / 2); lid.position.set(0, 0.006 * s, D / 2); hinge.add(lid);
  const sw = W - 0.03 * s, sh = D - 0.035 * s;
  const scr = mesh(screenQuad(sw, sh), null, 0, -0.0012 * s, D / 2 + 0.003 * s); scr.rotation.x = Math.PI / 2; hinge.add(scr);
  // the open angle: 0 = shut, 1 = open (about 110 degrees)
  let open = 0.9, target = 0.9, vel = 0;
  return {
    g, screens: [{ mesh: scr, w: sw, h: sh }], kind: 'laptop', size: 0.2 * s, keys,
    flip() { target = target > 0.5 ? 0.08 : 0.92; },
    tick(dt, fx) {
      vel += ((target - open) * 260 - vel * 18) * dt; open += vel * dt;                 // a springy hinge
      hinge.rotation.x = -open * 1.92;
      keyGlow(keys, fx, 14, 5, col);
    },
  };
}

// keys that light up as a spectrum analyser: columns are frequency, rows are level
export function keyMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKey;').replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvKey = instanceColor;\n#endif');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vKey;')
      .replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vKey * 3.0;');
  };
  m.customProgramCacheKey = () => 'keys';
  return m;
}
export const KEYCOL = [new THREE.Color(0xff3fa4), new THREE.Color(0x46c8ff), new THREE.Color(0xffffff)];
function keyGlow(keys, fx, cols, rows, col) {
  if (!fx.spec) return;
  for (let c = 0; c < cols; c++) {
    const v = fx.spec[Math.floor(4 + c / cols * 100)] * fx.alive, lit = v * rows * 1.3;
    for (let r = 0; r < rows; r++) {
      const on = Math.max(0, Math.min(1, lit - (rows - 1 - r)));
      col.copy(KEYCOL[fx.palette % 3]).multiplyScalar(on * on); keys.setColorAt(r * cols + c, col);
    }
  }
  keys.instanceColor.needsUpdate = true;
}

// ---------- a keyboard, its keys a spectrum ----------
export function keyboard(seed = 1, s = 1) {
  const g = new THREE.Group(), W = 0.45 * s, D = 0.16 * s;
  g.add(mesh(rbox(W, 0.025 * s, D, 0.008 * s), seed % 2 ? MAT.beige() : MAT.platinum(), 0, 0.0125 * s, 0));
  const cols = 18, rows = 6, keys = new THREE.InstancedMesh(rbox(0.018 * s, 0.01 * s, 0.018 * s, 0.002 * s, 2), keyMaterial(), cols * rows);
  const o = new THREE.Object3D(), col = new THREE.Color();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { o.position.set((c - (cols - 1) / 2) * 0.0225 * s, 0.027 * s, (r - (rows - 1) / 2) * 0.0225 * s); o.updateMatrix(); keys.setMatrixAt(r * cols + c, o.matrix); keys.setColorAt(r * cols + c, col.setRGB(0, 0, 0)); }
  g.add(keys);
  return { g, screens: [], kind: 'keyboard', size: 0.04 * s, tick(dt, fx) { keyGlow(keys, fx, cols, rows, col); } };
}

// ---------- a studio monitor: the woofer moves with the bass ----------
export function speaker(s = 1) {
  const g = new THREE.Group(), W = 0.19 * s, H = 0.3 * s, D = 0.22 * s;
  g.add(mesh(rbox(W, H, D, 0.04 * s, 5), new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.45, metalness: 0.4 }), 0, H / 2, 0));
  const ring = mesh(new THREE.TorusGeometry(0.068 * s, 0.008 * s, 10, 40), MAT.black(), 0, H * 0.36, D / 2); g.add(ring);
  const cone = new THREE.LatheGeometry([new THREE.Vector2(0.065 * s, 0), new THREE.Vector2(0.05 * s, -0.012 * s), new THREE.Vector2(0.02 * s, -0.024 * s), new THREE.Vector2(0.019 * s, -0.022 * s), new THREE.Vector2(0, -0.016 * s)], 40);
  cone.rotateX(-Math.PI / 2);
  const woof = mesh(cone, new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.75 }), 0, H * 0.36, D / 2); g.add(woof);
  const tw = mesh(new THREE.SphereGeometry(0.014 * s, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.silver(), 0, H * 0.74, D / 2 - 0.002); tw.rotation.x = Math.PI / 2; g.add(tw);
  g.add(mesh(new THREE.TorusGeometry(0.03 * s, 0.006 * s, 8, 30), MAT.black(), 0, H * 0.74, D / 2));
  const led = mesh(new THREE.SphereGeometry(0.003 * s, 8, 8), new THREE.MeshBasicMaterial({ color: 0x33ff55 }), 0, H * 0.1, D / 2 + 0.001); g.add(led);
  return { g, screens: [], kind: 'speaker', size: H, tick(dt, fx) { woof.position.z = D / 2 + (fx.low * 0.012 + fx.kick * 0.008) * s * fx.alive; led.material.color.setRGB(0.1 + fx.level * 2, 1, 0.2); } };
}

// ---------- a beige tower with drive bays ----------
export function tower(seed = 1, s = 1) {
  const g = new THREE.Group(), W = 0.19 * s, H = 0.42 * s, D = 0.43 * s;
  g.add(mesh(rbox(W, H, D, 0.008 * s), MAT.beige(), 0, H / 2, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(rbox(W * 0.8, 0.04 * s, 0.008 * s, 0.003), MAT.platinum(), 0, H - 0.05 * s - i * 0.048 * s, D / 2));
  const leds = [0x44ff66, 0xffaa22].map((c, i) => { const l = mesh(new THREE.BoxGeometry(0.008 * s, 0.004 * s, 0.003 * s), new THREE.MeshBasicMaterial({ color: c }), -W * 0.3 + i * 0.02 * s, H * 0.4, D / 2 + 0.001); g.add(l); return l; });
  const tray = new THREE.Group(); tray.position.set(0, H - 0.05 * s, D / 2 - 0.14 * s); g.add(tray);
  tray.add(mesh(new THREE.BoxGeometry(W * 0.74, 0.006 * s, 0.15 * s), MAT.black()));
  tray.add(mesh(new THREE.BoxGeometry(W * 0.8, 0.034 * s, 0.006 * s), MAT.platinum(), 0, 0.004 * s, 0.077 * s));
  const disc = cd(0.95 * s); disc.position.set(0, 0.0035 * s, -0.005 * s); tray.add(disc);
  const pump = new Pump(); pump.x = pump.target = 0;
  let spin = 0;
  return { g, screens: [], kind: 'tower', size: H, pump, tray,
    tick(dt, fx) { leds[1].visible = fx.hat > 0.3 || Math.random() < fx.mid * 0.5; const o = pump.step(dt); tray.position.z = D / 2 - 0.14 * s + Math.max(-0.01, o) * 0.15 * s; spin += dt * (4 + 30 * fx.level); disc.rotation.y = spin; } };
}

// ---------- small things with screens ----------
export function flipPhone(s = 1) {
  const g = new THREE.Group(), W = 0.05 * s, L = 0.09 * s, T = 0.01 * s, mat = new THREE.MeshStandardMaterial({ color: 0xd8dde8, roughness: 0.25, metalness: 0.7 });
  g.add(mesh(rbox(W, T, L, 0.004 * s), mat, 0, T / 2, 0));
  const hinge = new THREE.Group(); hinge.position.set(0, T, -L / 2); g.add(hinge);
  hinge.add(mesh(rbox(W, T, L, 0.004 * s), mat, 0, T / 2, L / 2));
  const scr = mesh(screenQuad(W * 0.8, L * 0.55), null, 0, -0.0005, L * 0.55); scr.rotation.x = Math.PI / 2; hinge.add(scr);
  let open = 1, target = 1, vel = 0;
  return { g, screens: [{ mesh: scr, w: W * 0.8, h: L * 0.55 }], kind: 'phone', size: 0.02, flip() { target = target > 0.5 ? 0 : 1; },
    tick(dt) { vel += ((target - open) * 400 - vel * 22) * dt; open += vel * dt; hinge.rotation.x = -open * 2.8; } };
}
export function ipod(s = 1) {
  const g = new THREE.Group(), W = 0.062 * s, L = 0.11 * s;
  g.add(mesh(rbox(W, 0.009 * s, L, 0.006 * s), MAT.chrome(), 0, 0.0045 * s, 0));
  g.add(mesh(rbox(W * 0.98, 0.0012 * s, L * 0.98, 0.006 * s), MAT.blackGloss(), 0, 0.009 * s, 0));
  const scr = mesh(screenQuad(W * 0.86, L * 0.72), null, 0, 0.0099 * s, 0); scr.rotation.x = -Math.PI / 2; g.add(scr);
  return { g, screens: [{ mesh: scr, w: W * 0.86, h: L * 0.72 }], kind: 'ipod', size: 0.01, tick() {} };
}

// ---------- floor clutter: cables, discs, floppies, kandi ----------
// ---------- cables: glossy jackets, real plugs, data pulses running along them, ripples with the bass ----------
const PLUG = { usb: [0.016, 0.009, 0.034], rj: [0.014, 0.013, 0.026], jack: [0.008, 0.008, 0.03] };
// every plug in the room: one instanced mesh per part and kind (boots take their cable's colour)
export class Plugs {
  constructor(cables) {
    this.g = new THREE.Group(); this.sets = [];
    for (const kind of ['usb', 'rj', 'jack']) {
      const list = cables.filter((c) => c.kind === kind); if (!list.length) continue;
      const sz = PLUG[kind], n = list.length * 2;
      const bootGeo = new RoundedBoxGeometry(sz[0] * 1.15, sz[1] * 1.3, sz[2] * 0.7, 2, 0.002).translate(0, 0, sz[2] * 0.3);
      const tipGeo = (kind === 'jack' ? new THREE.CylinderGeometry(sz[0] * 0.3, sz[0] * 0.3, sz[2] * 0.6, 12).rotateX(Math.PI / 2) : new THREE.BoxGeometry(sz[0], sz[1], sz[2] * 0.5)).translate(0, 0, sz[2] * 0.85);
      const tipMat = kind === 'rj' ? new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.1, transparent: true, opacity: 0.6 }) : new THREE.MeshStandardMaterial({ color: kind === 'jack' ? 0xd8c27a : 0xcfd2d8, roughness: 0.25, metalness: 0.9 });
      const boots = new THREE.InstancedMesh(bootGeo, new THREE.MeshStandardMaterial({ roughness: 0.35 }), n), tips = new THREE.InstancedMesh(tipGeo, tipMat, n);
      list.forEach((c, i) => { boots.setColorAt(i * 2, c.color); boots.setColorAt(i * 2 + 1, c.color); });
      this.g.add(boots, tips); this.sets.push({ list, boots, tips });
    }
    this.update();
  }
  update() {                                            // follow each cable (they fall away in the drops)
    const m = new THREE.Matrix4(), off = new THREE.Vector3();
    for (const { list, boots, tips } of this.sets) {
      list.forEach((c, i) => c.plugs.forEach((pl, j) => {
        off.copy(pl.p).add(c.g.position); m.compose(off, pl.q, new THREE.Vector3(c.g.visible ? 1 : 0, 1, 1));
        boots.setMatrixAt(i * 2 + j, m); tips.setMatrixAt(i * 2 + j, m);
      }));
      boots.instanceMatrix.needsUpdate = tips.instanceMatrix.needsUpdate = true;
    }
  }
}
export class Cable {
  constructor(points, radius, color, seed, kind = 'usb', free = null) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    this.len = curve.getLength();
    const geo = new THREE.TubeGeometry(curve, Math.max(24, Math.round(this.len * 90)), radius, 7, false);
    // how free each part is to ripple: 0 where it lies on or under another cable (so they never pass through)
    const cum = [0]; for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]));
    const fr = new Float32Array(geo.attributes.uv.count), uv = geo.attributes.uv, tot = cum[cum.length - 1] || 1;
    for (let v = 0; v < fr.length; v++) {
      const d = uv.getX(v) * tot; let j = 1; while (j < cum.length - 1 && cum[j] < d) j++;
      let f = 1; if (free) { const lo = Math.max(0, j - 3), hi = Math.min(free.length - 1, j + 2); for (let k = lo; k <= hi; k++) f = Math.min(f, free[k]); }
      fr[v] = f;
    }
    geo.setAttribute('aFree', new THREE.BufferAttribute(fr, 1));
    const u = this.u = { uT: { value: 0 }, uWave: { value: 0 }, uFloat: { value: 0 }, uLen: { value: this.len }, uSeed: { value: seed },
      uPulse: { value: new THREE.Vector4(-9, -9, -9, -9) }, uDir: { value: new THREE.Vector4(1, 1, 1, 1) }, uPC: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] }, uData: { value: 0 } };
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, u);
      const head = 'uniform float uT, uWave, uFloat, uLen, uSeed, uData; uniform vec4 uPulse, uDir; uniform vec3 uPC[4]; varying float vU;';
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFree;\n' + head)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vU = uv.x;
          float pin = sin(3.14159 * uv.x);
          float x = uv.x * uLen;
          transformed.y += pin * aFree * max(0.0, sin(x * 22.0 - uT * 13.0 + uSeed)) * uWave * 0.006;   // only ever up, and only where it is free
          transformed.y += pin * sin(x * 3.1 + uT * 1.3 + uSeed) * uFloat * 0.05;
          transformed.x += pin * sin(x * 2.3 - uT * 0.9 + uSeed * 2.0) * uFloat * 0.05;`);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + head)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          for (int i = 0; i < 4; i++) {
            float h = (uT - uPulse[i]) * 2.6 / uLen; float at = uDir[i] > 0.0 ? h : 1.0 - h;
            float d = (vU - at) * uLen; float tail = uDir[i] > 0.0 ? step(d, 0.0) : step(0.0, d);
            totalEmissiveRadiance += uPC[i] * (exp(-d * d / 0.0004) * 5.0 + exp(-abs(d) * 9.0) * tail * 1.4) * step(0.0, h) * step(h, 1.15);
          }
          totalEmissiveRadiance += vec3(0.6, 0.9, 1.0) * uData * step(0.82, fract(vU * uLen * 18.0 - uT * 4.0)) * 0.6;`);
    };
    m.customProgramCacheKey = () => 'cable';
    this.mesh = new THREE.Mesh(geo, m); this.next = 0; this.seed = seed;
    this.g = new THREE.Group(); this.g.add(this.mesh);
    // the two plugs, as poses for the shared instanced plug meshes (Plugs)
    this.kind = kind; this.color = new THREE.Color(color);
    this.plugs = [0, 1].map((t) => ({ p: curve.getPointAt(t), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(t).multiplyScalar(t ? 1 : -1)) }));
  }
  // a pulse of light along the cable; toward the far end (dir 1) or back (dir -1)
  fire(t, color, dir = 1) {
    const i = this.next++ % 4; this.u.uPulse.value.setComponent(i, t); this.u.uDir.value.setComponent(i, dir); this.u.uPC.value[i].copy(color);
  }
  // the plugs ride the same float as the cable's ends (which stay put; only the middle floats), nothing to do
}

export function cd(s = 1) {
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({ color: 0xd8dde6, metalness: 1, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 900] });
  const disc = mesh(new THREE.RingGeometry(0.0075 * s, 0.06 * s, 64, 1), m); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.0012; g.add(disc);
  const back = mesh(new THREE.RingGeometry(0.0075 * s, 0.06 * s, 64, 1), MAT.white()); back.rotation.x = Math.PI / 2; back.position.y = 0.0008; g.add(back);
  return g;
}
export function floppy(color, s = 1) {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.09 * s, 0.0033 * s, 0.093 * s, 0.002 * s), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), 0, 0.0017 * s, 0));
  g.add(mesh(new THREE.BoxGeometry(0.05 * s, 0.0005 * s, 0.028 * s), MAT.silver(), 0, 0.0035 * s, -0.032 * s));
  g.add(mesh(new THREE.BoxGeometry(0.06 * s, 0.0005 * s, 0.04 * s), MAT.white(), 0, 0.0035 * s, 0.02 * s));
  return g;
}
export function kandi(seed, s = 1) {
  const R = rng(seed), n = 26, r = 0.035 * s, beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055 * s, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.3 }), n);
  const o = new THREE.Object3D(), c = new THREE.Color(), pal = [0xff4fa3, 0x46c8ff, 0xfff04a, 0x7cff6b, 0xb06bff, 0xffffff, 0xff7a2f];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2; o.position.set(Math.cos(a) * r, 0.0055 * s, Math.sin(a) * r * (0.8 + 0.2 * R())); o.updateMatrix(); beads.setMatrixAt(i, o.matrix);
    beads.setColorAt(i, c.setHex(pal[Math.floor(R() * pal.length)]));
  }
  return beads;
}
// a soft dark disc under something sitting on the floor
let shadowTex = null;
export function contactShadow(w, d, strength = 0.75) {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); shadowTex = new THREE.CanvasTexture(c);
  }
  const m = mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: strength, depthWrite: false, color: 0x000000 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = -1;
  return m;
}

// ---------- paper on the floor: printouts, posters, a sleeve of the album ----------
function sheet(w, h, draw) {
  const c = document.createElement('canvas'); c.width = Math.round(512 * w / Math.max(w, h)); c.height = Math.round(512 * h / Math.max(w, h));
  const x = c.getContext('2d'); draw(x, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.0006;
  const g = new THREE.Group(); g.add(m); return { g, t };
}
export function papers(cover) {
  const withCover = (fn) => (x, w, h) => { const go = () => { fn(x, w, h); }; go(); };
  return [
    () => { const s = sheet(0.3, 0.3, (x, w, h) => { x.fillStyle = '#111'; x.fillRect(0, 0, w, h); }); const draw = () => { if (!cover.naturalWidth) return; const x = s.t.image.getContext('2d'); x.drawImage(cover, 0, 0, s.t.image.width, s.t.image.height); s.t.needsUpdate = true; }; draw(); cover.addEventListener('load', draw); return s.g; },
    () => sheet(0.21, 0.297, (x, w, h) => { x.fillStyle = '#f4f2ec'; x.fillRect(0, 0, w, h); x.fillStyle = '#222'; x.font = 'bold 30px Tahoma, sans-serif'; x.fillText('SET LIST', 28, 60);
      ['iPod Touch', 'Infohazard', 'All I Am', 'Fuck My Computer', 'girl EDM', '???'].forEach((t, i) => { x.font = '24px "Times New Roman", serif'; x.fillText(`${i + 1}. ${t}`, 32, 110 + i * 40); }); x.strokeStyle = '#d22'; x.lineWidth = 3; x.beginPath(); x.ellipse(150, 230, 120, 22, -0.05, 0, 7); x.stroke(); }).g,
    () => sheet(0.42, 0.3, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ff4fa3'); g.addColorStop(1, '#5a3bff'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.font = '900 70px Orbitron, sans-serif'; x.textAlign = 'center'; x.fillText('ILMC', w / 2, h / 2 + 10); x.font = 'italic 700 26px "Times New Roman", serif'; x.fillStyle = '#ffe10a'; x.fillText('NINAJIRACHI', w / 2, h / 2 + 56); }).g,
    () => sheet(0.3, 0.21, (x, w, h) => { x.fillStyle = '#0000aa'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '22px "Lucida Console", monospace';
      ['A fatal exception 0E has occurred', 'at 0028:C0011E36 in VXD ILMC(01)', '', 'Press any key to love', 'your computer.'].forEach((l, i) => x.fillText(l, 22, 50 + i * 30)); }).g,
  ];
}
export function mouse(color) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color, roughness: 0.35 });
  const body = mesh(new THREE.SphereGeometry(0.03, 24, 14), m); body.scale.set(1, 0.55, 1.6); body.position.y = 0.014; g.add(body);
  g.add(mesh(new THREE.TorusGeometry(0.06, 0.0022, 6, 30, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5 }), 0, 0.003, -0.1));
  return g;
}
export function jewelCase() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.142, 0.01, 0.125), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.35 }), 0, 0.005, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.002, 0.12), new THREE.MeshStandardMaterial({ color: [0xff4fa3, 0x2f6fe8, 0xfff04a, 0x111111][Math.floor(Math.random() * 4)], roughness: 0.6 }), 0, 0.004, 0));
  return g;
}

// ---------- the iPod touch from the song: a 2nd generation (her own words), in a yellow Pikachu case with a small
// crack in the screen (the lyrics). Her actual case was never shown; this is the common silicone sleeve of the era,
// two leaf ears with black tips, a raised lightning tail on the back. Built in millimetres, front view (+z = glass).
export function ipodTouch(s = 1) {
  const mm = 0.001 * s, root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  g.rotation.x = -Math.PI / 2;                                   // lying on its back, screen up, top end away
  const rr = (w, h, r) => { const sh = new THREE.Shape(), x = -w / 2, y = -h / 2;
    sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y); return sh; };
  const ext = (shape, depth, bevel, segs = 5) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 18 });
  const yellow = new THREE.MeshPhysicalMaterial({ color: 0xf2cf12, roughness: 0.66, sheen: 0.35, sheenColor: new THREE.Color(0xfff2a0) });
  const brown = new THREE.MeshStandardMaterial({ color: 0x713a22, roughness: 0.6 }), black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.55 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd6dade, roughness: 0.18, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x090a0c, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0.1 });
  // the device: a steel body with a contoured back, a chrome rim, black glass, the home button
  const body = new THREE.Mesh(ext(rr(61.8 * mm - 3 * mm, 110 * mm - 3 * mm, 7 * mm), 5.5 * mm, 1.5 * mm, 6), steel); body.position.z = -8.5 * mm + 1.5 * mm; g.add(body);
  const front = new THREE.Mesh(new THREE.ShapeGeometry(rr(60.6 * mm, 108.8 * mm, 7.4 * mm), 18), glass); front.position.z = 0.02 * mm; g.add(front);
  const hb = new THREE.Mesh(new THREE.CircleGeometry(4.5 * mm, 32), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.3 })); hb.position.set(0, -46 * mm, 0.4 * mm); g.add(hb);
  const sq = new THREE.Shape(rr(3.2 * mm, 3.2 * mm, 0.7 * mm).getPoints(24)); sq.holes.push(new THREE.Path(rr(2.6 * mm, 2.6 * mm, 0.45 * mm).getPoints(24).reverse()));
  const sqm = new THREE.Mesh(new THREE.ShapeGeometry(sq), new THREE.MeshBasicMaterial({ color: 0x6b6e74 })); sqm.position.set(0, -46 * mm, 0.6 * mm); g.add(sqm);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(49.3 * mm, 74 * mm), null); scr.position.set(0, 1 * mm, 0.5 * mm); g.add(scr);
  const gl = glassOver(scr, 58 * mm, 104 * mm, 0, 0.25 * mm, {}); gl.position.y = -1 * mm; g.add(gl);      // the front glass, over the picture
  // the case: a soft sleeve behind and around it, a lip over the front edge
  const sleeve = new THREE.Mesh(ext(rr(62 * mm, 110 * mm, 10 * mm), 8.5 * mm, 2.2 * mm, 6), yellow); sleeve.position.z = -10.7 * mm; g.add(sleeve);
  const lip = rr(66 * mm, 114 * mm, 11 * mm); lip.holes.push(new THREE.Path(rr(58.6 * mm, 106 * mm, 7.2 * mm).getPoints(40).reverse()));
  const lipm = new THREE.Mesh(ext(lip, 0.6 * mm, 0.6 * mm, 4), yellow); lipm.position.z = -0.3 * mm; g.add(lipm);
  // ears off the top corners, leaning out; black tips on the back
  const leaf = new THREE.Shape(); leaf.moveTo(-5 * mm, 0); leaf.quadraticCurveTo(-6.5 * mm, 17 * mm, 0, 28 * mm); leaf.quadraticCurveTo(6.5 * mm, 17 * mm, 5 * mm, 0); leaf.closePath();
  const tipS = new THREE.Shape(); tipS.moveTo(-3.6 * mm, 20 * mm); tipS.quadraticCurveTo(-2.4 * mm, 25 * mm, 0, 28 * mm); tipS.quadraticCurveTo(2.4 * mm, 25 * mm, 3.6 * mm, 20 * mm); tipS.closePath();
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(sx * 23 * mm, 52 * mm, -5.5 * mm); ear.rotation.set(-0.15, 0, -sx * 0.26); g.add(ear);
    const e = new THREE.Mesh(ext(leaf, 2.2 * mm, 1 * mm, 4), yellow); e.position.z = -1.1 * mm; ear.add(e);
    const t = new THREE.Mesh(ext(tipS, 0.4 * mm, 0.5 * mm, 3), black); t.position.z = -2.6 * mm; ear.add(t);
  }
  // the back: a raised lightning tail with a brown root, and the brown stripes
  const tail = new THREE.Shape(); [[2, -40], [12, -28], [4, -26], [16, -10], [8, -8], [20, 12], [-6, -6], [2, -8], [-10, -22], [-2, -24], [-10, -38]].forEach(([x, y], i) => (i ? tail.lineTo(x * mm, y * mm) : tail.moveTo(x * mm, y * mm))); tail.closePath();
  const tl = new THREE.Mesh(ext(tail, 0.8 * mm, 0.4 * mm, 2), yellow); tl.rotation.y = Math.PI; tl.position.set(0, 4 * mm, -13.1 * mm); g.add(tl);
  const root2 = new THREE.Shape(); [[2, -40], [12, -28], [4, -26], [8, -32], [-2, -30], [-10, -38]].forEach(([x, y], i) => (i ? root2.lineTo(x * mm, y * mm) : root2.moveTo(x * mm, y * mm))); root2.closePath();
  const rt = new THREE.Mesh(ext(root2, 0.9 * mm, 0.4 * mm, 2), brown); rt.rotation.y = Math.PI; rt.position.set(0, 4 * mm, -13.2 * mm); g.add(rt);
  for (const [x, y, a] of [[-14, -20, 0.25], [14, -20, -0.25], [-14, -30, -0.1], [14, -30, 0.1]]) {
    const st = new THREE.Shape(); st.moveTo(-8 * mm, 0); st.quadraticCurveTo(0, 2.4 * mm, 8 * mm, 0); st.quadraticCurveTo(0, -2.4 * mm, -8 * mm, 0);
    const m = new THREE.Mesh(ext(st, 0.3 * mm, 0.2 * mm, 2), brown); m.rotation.set(0, Math.PI, a); m.position.set(x * mm, y * mm, -12.8 * mm); g.add(m);
  }
  bake(g, [scr, gl]);
  return { g: root, screens: [{ mesh: scr, w: 49.3 * mm, h: 74 * mm, fixed: 16 }], kind: 'ipod', size: 0.03, tick() {} };
}

// ---------- an iMac G3 in a candy colour ----------
export function imac(color = 0x1c9ad6, s = 1) {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.78 });
  const body = mesh(new THREE.SphereGeometry(0.2 * s, 32, 24), shell, 0, 0.2 * s, -0.04 * s); body.scale.set(1, 0.95, 1.05); g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.16 * s, 20, 16), MAT.grey(), 0, 0.2 * s, -0.06 * s));
  g.add(mesh(rbox(0.36 * s, 0.33 * s, 0.07 * s, 0.05 * s, 4), MAT.white(), 0, 0.21 * s, 0.13 * s));
  const sw = 0.25 * s, sh = 0.19 * s;
  g.add(mesh(rbox(sw + 0.02 * s, sh + 0.02 * s, 0.01 * s, 0.012 * s), MAT.black(), 0, 0.235 * s, 0.1615 * s));
  const scr = mesh(screenQuad(sw, sh, 0.01 * s), null, 0, 0.235 * s, 0.168 * s); g.add(scr);
  g.add(mesh(rbox(0.16 * s, 0.03 * s, 0.05 * s, 0.012 * s), shell, 0, 0.07 * s, 0.16 * s));
  return { g, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'imac', size: 0.4 * s, tick() {} };
}
// ---------- a PlayStation 2 standing up, its blue light breathing with the bass ----------
export function ps2(s = 1) {
  const g = new THREE.Group(), body = new THREE.Group(); body.rotation.z = Math.PI / 2; body.position.y = 0.155 * s; g.add(body);
  body.add(mesh(rbox(0.3 * s, 0.078 * s, 0.18 * s, 0.004 * s), new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.4 })));
  for (let i = 0; i < 6; i++) body.add(mesh(new THREE.BoxGeometry(0.29 * s, 0.003 * s, 0.17 * s), MAT.black(), 0, -0.02 * s + i * 0.008 * s, 0));
  const led = mesh(new THREE.BoxGeometry(0.004 * s, 0.03 * s, 0.003 * s), new THREE.MeshBasicMaterial({ color: 0x2f6bff }), 0.135 * s, 0.0, 0.0905 * s); body.add(led);
  return { g, screens: [], kind: 'ps2', size: 0.3 * s, tick(dt, fx) { led.material.color.setRGB(0.1, 0.3 + 0.7 * fx.low * fx.alive, 1); } };
}
// ---------- the deck's mods: a board and a fan bolted to its side, capacitors and stickers on top, a VFD ----------
export function sticker(draw, w, h) {
  const c = document.createElement('canvas'); c.width = Math.round(256 * w / Math.max(w, h)); c.height = Math.round(256 * h / Math.max(w, h)); draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 }));
  return m;
}
export function deckMods(drawFace, CX) {
  const g = new THREE.Group();
  // the plinth's left side: a motherboard standing against it, a fan on the board, caps along the top
  const side = new THREE.Group(); side.position.set(-0.1865, -0.046, 0); side.rotation.y = -Math.PI / 2; g.add(side);
  const b = board(0.34, 0.066, 31, MAT.pcbDark()); b.position.set(0, 0.0, 0); side.add(b);
  const f = fan(0.06, MAT.black(), 0.014); f.g.position.set(-0.06, 0.0, 0.0015 + 0.014 + 0.06 * 0.14); side.add(f.g);
  const capMat = MAT.orange();
  for (let i = 0; i < 5; i++) { const c = mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.024, 16), capMat, 0.04 + i * 0.022, 0.045, 0.012); side.add(c); }
  // on the plate: a cluster of caps and the stickers
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.008, 0.007, 0.02, 16), capMat, -0.17 + (i % 2) * 0.018, -0.012, -0.13 - i * 0.012));
  const face = sticker((x, w, h) => { drawFace(x, w / 2, h * 0.42, w * 0.42, {}); }, 0.05, 0.05);
  face.rotation.set(-Math.PI / 2, 0, 0.3); face.position.set(-0.16, -0.0215, 0.115); g.add(face);
  const ilmc = sticker((x, w, h) => { x.fillStyle = '#ff4fa3'; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 20); x.fill(); x.fillStyle = '#fff'; x.font = '900 70px Orbitron, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ILMC', w / 2, h / 2 + 4, w - 30); }, 0.06, 0.026);
  ilmc.rotation.set(-Math.PI / 2, 0, -0.2); ilmc.position.set(0.215, -0.0215, 0.135); g.add(ilmc);
  const name = sticker((x, w, h) => { x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '900 46px Orbitron, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = '#fff'; x.shadowBlur = 8; x.fillText('NINAJIRACHI', w / 2, h / 2, w - 16); }, 0.12, 0.022);
  name.position.set(0.12, -0.046, 0.1915); g.add(name);                                              // on the plinth's front edge
  const heart = sticker((x, w, h) => { x.fillStyle = '#46c8ff'; x.font = '200px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♥', w / 2, h / 2 + 10); }, 0.03, 0.03);
  heart.rotation.set(-Math.PI / 2, 0, 0.5); heart.position.set(-0.13, -0.0214, 0.135); g.add(heart);
  const k = kandi(55, 0.9); k.position.set(-0.14, -0.022, -0.155); g.add(k);
  // the VFD strip in front of the pitch slider
  const vfd = mesh(screenQuad(0.11, 0.02), null, 0.165, -0.0207, 0.174); vfd.rotation.x = -Math.PI / 2; g.add(vfd);
  g.add(mesh(new THREE.BoxGeometry(0.118, 0.0008, 0.026), MAT.blackGloss(), 0.165, -0.0217, 0.174));
  let spin = 0;
  return { g, fan: f, screens: [{ mesh: vfd, w: 0.11, h: 0.02, fixed: 17, band: 70 / 288 }], tick(dt, fx) { spin += dt * (3 + 50 * fx.low * fx.alive); f.set(spin); } };
}

// ---------- the gag: a USB stick that goes in and out, a DVD tray that slides in and out ----------
export function usbStick(color = 0xff4fa3) {
  const g = new THREE.Group();
  const body = mesh(rbox(0.048, 0.009, 0.018, 0.004), new THREE.MeshStandardMaterial({ color, roughness: 0.35 }), 0.024 + 0.006, 0, 0); g.add(body);
  g.add(mesh(new THREE.BoxGeometry(0.013, 0.0045, 0.012), MAT.silver(), 0.0005, 0, 0));
  const led = mesh(new THREE.BoxGeometry(0.004, 0.001, 0.003), new THREE.MeshBasicMaterial({ color: 0x55ff99 }), 0.045, 0.0048, 0); g.add(led);
  g.add(mesh(new THREE.TorusGeometry(0.004, 0.0012, 6, 14), MAT.silver(), 0.054, 0, 0));
  return { g, led };
}
// a spring for the in-and-out: stiff, so it snaps
export class Pump {
  constructor() { this.x = 1; this.v = 0; this.target = 1; }
  set(t) { this.target = t; }
  toggle() { this.target = this.target > 0.5 ? 0 : 1; }
  step(dt) { const n = Math.ceil(dt / 0.004), h = dt / n; for (let i = 0; i < n; i++) { this.v += ((this.target - this.x) * 5200 - this.v * 90) * h; this.x += this.v * h; } return this.x; }
}
