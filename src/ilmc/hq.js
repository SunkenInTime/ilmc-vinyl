// The machines as hardware someone owned for years: moulded shells with panel gaps, vents with depth, recessed drive
// bays, ports and a power socket on the back, labels, LEDs bright enough to bloom, glass over every picture, and on the
// frankencomputers a mineral crust. Materials are wear.js (aged plastic, glass); once built, each machine's still parts
// are welded into a few meshes (bake.js). Same interface as models.js, so the room, the lights and the physics need no
// changes: { g, screens: [{ mesh, w, h, crt }], kind, size, tick } plus the moving parts index.js holds on to.
import * as THREE from 'three';
import { rbox, mesh, screenQuad, fan, KEYCOL, rng, Pump, kandi } from './models.js';
import { plastic, age, glassOver, ledMat } from './wear.js';
import { bake } from './bake.js';

const TAU = Math.PI * 2;

// ---------------- materials (one set per machine, so its yellowing and dust lie differently) ----------------
const beigeOf = (R, o = {}) => plastic(0xc9bd9d, 0.48, { age: 0.6, dust: 0.5, wear: 0.65, seed: R() * 9, ...o });
const platOf = (R, o = {}) => plastic(0xcdc8b9, 0.42, { age: 0.32, dust: 0.45, wear: 0.55, yellow: 0xeed49a, seed: R() * 9, ...o });
const blackOf = (R, o = {}) => plastic(0x161618, 0.58, { age: 0, dust: 0.55, wear: 0.5, seed: R() * 9, ...o });
const hole = () => new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.95 });               // the dark inside of an opening
const tubeBlack = () => new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.3 });           // the tube's black border, under the glass
const metal = (c = 0xc4c7cc, r = 0.35) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 1 });
const steel = () => age(new THREE.MeshStandardMaterial({ color: 0xb8bbbf, roughness: 0.42, metalness: 1 }), { age: 0, dust: 0.35, wear: 0.5, seed: 1 });

// ---------------- shapes ----------------
function rrShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2; r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
const circle = (r, cx, cy) => { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, TAU, true); return p; };
function rrPath(w, h, r, cx = 0, cy = 0) { const p = new THREE.Path(); p.setFromPoints(rrShape(w, h, r, cx, cy).getPoints(8).reverse()); return p; }
// a front shell with an opening: outer rounded rect, inner hole, extruded toward -z, the bevel a chamfered lip
function frame(ow, oh, or, iw, ih, ir, depth, bevel, ix = 0, iy = 0, seg = 3) {
  const s = rrShape(ow, oh, or); s.holes.push(rrPath(iw, ih, ir, ix, iy));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 8 });
  g.translate(0, 0, -depth - bevel); return g;
}
// a tapered rounded housing: front w0 x h0 at z = 0, back w1 x h1 at z = -d (CRT backs). Side + back cap.
function taper(w0, h0, r0, w1, h1, r1, d, dy = 0) {
  const ring = (w, h, r, y) => rrShape(w, h, r, 0, y).getPoints(6);
  const a = ring(w0, h0, r0, 0), b = ring(w1, h1, r1, dy), n = Math.min(a.length, b.length), pos = [];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; pos.push(a[i].x, a[i].y, 0, b[i].x, b[i].y, -d, a[j].x, a[j].y, 0, a[j].x, a[j].y, 0, b[i].x, b[i].y, -d, b[j].x, b[j].y, -d); }
  const side = new THREE.BufferGeometry(); side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); side.computeVertexNormals();
  side.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  const cap = new THREE.ShapeGeometry(rrShape(w1, h1, r1, 0, dy), 6); cap.rotateY(Math.PI); cap.translate(0, 0, -d);
  return [side, cap];
}
const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const ext = (shape, depth, bevel = 0, segs = 2, curve = 8) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: curve });
// moulded vents: dark slots behind a row of ribs that stand proud of the face, so each slot has a lit lip and a shadow.
// Built facing +z on the plane z = 0, centred; n slots across w (vertical slots) or down h.
function vents(g, mat, w, h, n, { vertical = true, x = 0, y = 0, z = 0, ry = 0, rx = 0, depth = 0.0025 } = {}) {
  const v = new THREE.Group(); v.position.set(x, y, z); v.rotation.set(rx, ry, 0, 'YXZ'); g.add(v);
  v.add(mesh(new THREE.PlaneGeometry(w, h), hole(), 0, 0, -depth));
  const pitch = (vertical ? w : h) / n, rib = pitch * 0.42;
  for (let i = 0; i <= n; i++) {
    const t = -0.5 + i / n, b = vertical ? new THREE.BoxGeometry(rib, h + rib, depth * 2) : new THREE.BoxGeometry(w + rib, rib, depth * 2);
    v.add(mesh(b, mat, vertical ? t * w : 0, vertical ? 0 : t * h, -depth * 0.5));
  }
  // the frame round the slots
  for (const s of [-1, 1]) { v.add(mesh(new THREE.BoxGeometry(vertical ? w + rib * 2 : rib * 1.5, vertical ? rib * 1.5 : h + rib * 2, depth * 2), mat, vertical ? 0 : s * (w / 2 + rib * 0.5), vertical ? s * (h / 2 + rib * 0.5) : 0, -depth * 0.5)); }
  return v;
}
// screws: a domed head with a cross, any number, as one geometry
function screws(g, pts, r, mat) { const geo = new THREE.SphereGeometry(r, 10, 4, 0, TAU, 0, Math.PI / 2.4); geo.rotateX(Math.PI / 2); geo.scale(1, 1, 0.5); for (const [x, y, z, ry = 0] of pts) { const m = mesh(geo, mat, x, y, z); m.rotation.y = ry; g.add(m); } }

// ---------------- painted detail (decals) ----------------
const decalCache = new Map();
export function decalTex(key, w, h, draw, res = 512) {
  let t = decalCache.get(key);
  if (!t) {
    const c = document.createElement('canvas'); c.width = Math.round(res * Math.min(1, w / h)); c.height = Math.round(res * Math.min(1, h / w));
    draw(c.getContext('2d'), c.width, c.height);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; decalCache.set(key, t);
  }
  return t;
}
function decal(w, h, key, draw, { rough = 0.55, metal: mt = 0, emissive = false, res = 512 } = {}) {
  const t = decalTex(key, w, h, draw, res);
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: rough, metalness: mt, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, depthWrite: false });
  if (emissive) { m.emissiveMap = t; m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = 0.6; }
  const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); d.receiveShadow = true;
  return d;
}
const ink = (x, c) => { x.fillStyle = c; x.strokeStyle = c; };
const FONT = '"Arial Narrow", Arial, Helvetica, sans-serif';
function badge(x, w, h, text, { fg = '#2b2b2e', weight = 'bold', italic = false, size = 0.62 } = {}) {
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `${italic ? 'italic ' : ''}${weight} ${Math.round(h * size)}px ${FONT}`; x.fillStyle = fg;
  x.fillText(text, w / 2, h * 0.54, w * 0.96);
}
// the rating label on the back of everything: model, power, serial, a barcode, made in. Fine print, but big enough to read
function rating(x, w, h, { model = 'ILMC-1700', power = '100-240V~ 50/60Hz 1.5A', made = 'MADE IN TAIWAN', paper = '#e9e4d4', seed = 1 } = {}) {
  const R = rng(seed * 97 + 3);
  x.fillStyle = paper; x.fillRect(0, 0, w, h);
  ink(x, '#3b3a36'); x.lineWidth = Math.max(1, h * 0.012); x.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.font = `bold ${Math.round(h * 0.13)}px ${FONT}`; x.fillText('MODEL: ' + model, h * 0.1, h * 0.22);
  x.font = `${Math.round(h * 0.085)}px ${FONT}`; x.fillText(power, h * 0.1, h * 0.36); x.fillText('S/N ' + Math.floor(R() * 9e8 + 1e8) + 'A', h * 0.1, h * 0.48);
  x.fillText(made, h * 0.1, h * 0.6);
  for (let i = 0, bx = h * 0.1; bx < w * 0.6; i++) { const bw = (1 + Math.floor(R() * 3)) * h * 0.008; if (i % 2 === 0) x.fillRect(bx, h * 0.67, bw, h * 0.2); bx += bw; }
  x.strokeRect(w * 0.7, h * 0.2, h * 0.28, h * 0.28); x.font = `bold ${Math.round(h * 0.11)}px ${FONT}`; x.textAlign = 'center'; x.fillText('CE', w * 0.7 + h * 0.14, h * 0.38);
  x.beginPath(); x.moveTo(w * 0.86, h * 0.48); x.lineTo(w * 0.86 + h * 0.15, h * 0.2); x.lineTo(w * 0.86 + h * 0.3, h * 0.48); x.closePath(); x.stroke();
  x.fillText('!', w * 0.86 + h * 0.15, h * 0.45);
  x.font = `${Math.round(h * 0.06)}px ${FONT}`; x.fillText('CAUTION: RISK OF ELECTRIC SHOCK', w * 0.78, h * 0.62); x.fillText('DO NOT OPEN', w * 0.78, h * 0.7);
  // a little grime on the paper
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(90,70,40,${R() * 0.06})`; x.beginPath(); x.arc(R() * w, R() * h, R() * h * 0.2, 0, TAU); x.fill(); }
}

// ---------------- little parts ----------------
const button = (w, h, d, mat) => mesh(rbox(w, h, d, Math.min(w, h) * 0.3, 2), mat);
// an indicator: a clear domed lens in a dark ring, lit well past white so the camera's glow catches it
function led(g, r, color, x, y, z, k = 6, up = false) {
  const m = ledMat(color, k), l = mesh(new THREE.SphereGeometry(r, 12, 5, 0, TAU, 0, Math.PI / 2), m, x, y, z); l.rotation.x = up ? 0 : Math.PI / 2; l.scale.set(1, 0.6, 1); g.add(l);
  const ring = mesh(new THREE.TorusGeometry(r * 1.15, r * 0.3, 4, 16), hole(), x, y, z); if (up) ring.rotation.x = -Math.PI / 2; g.add(ring);
  return l;
}
const lit = (l, r, gg, b, k = 6) => l.material.color.setRGB(r * k, gg * k, b * k);
// an IEC power inlet: a recessed black socket with three pins
function iec(g, x, y, z, s = 1, ry = 0) {
  const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = ry; g.add(p);
  const sh = new THREE.Shape(); const w = 0.024 * s, h = 0.016 * s; sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 4); sh.lineTo(w / 2 - h / 4, h / 2); sh.lineTo(-w / 2 + h / 4, h / 2); sh.lineTo(-w / 2, h / 4); sh.closePath();
  p.add(mesh(ext(sh, 0.003 * s, 0.001 * s), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }), 0, 0, -0.002 * s));
  const inner = new THREE.Shape(sh.getPoints().map((v) => v.clone().multiplyScalar(0.78)));
  p.add(mesh(new THREE.ShapeGeometry(inner), hole(), 0, 0, 0.0021 * s));
  for (const px of [-0.0065, 0, 0.0065]) p.add(mesh(new THREE.BoxGeometry(0.0012 * s, 0.004 * s, 0.003 * s), metal(0xd0c49a, 0.3), px * s, px === 0 ? 0.002 * s : -0.002 * s, 0.003 * s));
  return p;
}
// a row of period ports on a back panel: D-sub (VGA, serial, parallel), PS/2 rounds, audio jacks
const PORT_COL = { vga: 0x2850c8, ser: 0x3c8a5a, par: 0xb04878, kb: 0x7a4ab0, ms: 0x3a9a4a, in: 0x4aa0d8, out: 0x7cc23a, mic: 0xe07aa0 };
function ports(g, list, x0, y, z, ry = 0, s = 1) {
  const o = new THREE.Group(); o.position.set(x0, y, z); o.rotation.y = ry; g.add(o);
  const p = new THREE.Group(); o.add(p);
  let x = 0; const sh = metal(0xb9bcc0, 0.35);
  for (const k of list) {
    if (k === 'vga' || k === 'ser' || k === 'par') {
      const w = (k === 'par' ? 0.04 : k === 'vga' ? 0.019 : 0.019) * s, h = 0.008 * s, t = new THREE.Shape(); t.moveTo(-w / 2, h / 2); t.lineTo(w / 2, h / 2); t.lineTo(w / 2 - h * 0.25, -h / 2); t.lineTo(-w / 2 + h * 0.25, -h / 2); t.closePath();
      x += w / 2 + 0.006 * s;
      p.add(mesh(rbox(w + 0.007 * s, h + 0.005 * s, 0.001 * s, 0.001 * s), sh, x, 0, 0.0005 * s));
      p.add(mesh(ext(t, 0.003 * s), new THREE.MeshStandardMaterial({ color: PORT_COL[k], roughness: 0.55 }), x, 0, 0.0005 * s));
      for (const hx of [-1, 1]) p.add(mesh(new THREE.CylinderGeometry(0.0016 * s, 0.0016 * s, 0.004 * s, 6).rotateX(Math.PI / 2), sh, x + hx * (w / 2 + 0.0022 * s), 0, 0.002 * s));
      x += w / 2 + 0.006 * s;
    } else if (k === 'usb') {
      x += 0.008 * s; p.add(mesh(new THREE.BoxGeometry(0.013 * s, 0.0055 * s, 0.003 * s), sh, x, 0, 0.0005 * s)); p.add(mesh(new THREE.BoxGeometry(0.0115 * s, 0.004 * s, 0.001 * s), hole(), x, 0, 0.0016 * s)); x += 0.008 * s;
    } else {                                                         // round: PS/2 or a jack
      const r = (k === 'kb' || k === 'ms' ? 0.0055 : 0.0036) * s; x += r + 0.004 * s;
      p.add(mesh(new THREE.CylinderGeometry(r, r, 0.003 * s, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: PORT_COL[k], roughness: 0.5 }), x, 0, 0.0005 * s));
      p.add(mesh(new THREE.CircleGeometry(r * 0.55, 12), hole(), x, 0, 0.0021 * s));
      x += r + 0.004 * s;
    }
  }
  p.position.x = -x / 2;
  return o;
}
// a stub of cable leaving a socket, with its strain relief: reads as plugged in from behind
function stub(g, x, y, z, col = 0x1a1a1c, r = 0.003, len = 0.03, ry = 0) {
  const c = new THREE.Group(); c.position.set(x, y, z); c.rotation.y = ry; g.add(c);
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.45 });
  c.add(mesh(rbox(r * 4, r * 3.2, 0.012, r, 2), m, 0, 0, 0.006));
  const cy = new THREE.CylinderGeometry(r, r, len, 10).rotateX(Math.PI / 2); c.add(mesh(cy, m, 0, 0, 0.012 + len / 2));
  return c;
}

// ---------------- the picture's glass ----------------
// screen quads keep their material (screens.js); the glass goes over them and over the black border around them
function screen(g, w, h, bulge, x, y, z, { glassW = w, glassH = h, matte = false, gap = 0.0012 } = {}) {
  const scr = mesh(screenQuad(w, h, bulge), null, x, y, z); g.add(scr);
  const gl = glassOver(scr, glassW, glassH, bulge, gap, { matte, rw: w, rh: h }); g.add(gl);
  if (glassW > w) g.add(mesh(screenQuad(glassW, glassH, bulge, w, h), tubeBlack(), x, y, z - 0.0008));   // the tube's black border, on the same curve
  return scr;
}

// ---------------- a CRT monitor (beige or platinum), or a black TV with knobs and a speaker grille ----------------
export function crt(seed = 1, s = 1, tv = false) {
  const R = rng(seed * 31 + 7), g = new THREE.Group();
  const mat = tv ? blackOf(R, { dust: 0.6 }) : (seed % 2 ? beigeOf(R) : platOf(R));
  const W = (tv ? 0.44 : 0.38) * s, H = (tv ? 0.34 : 0.33) * s, D = 0.045 * s, y0 = (tv ? 0.028 : 0.05) * s, cy = y0 + H / 2;
  const sw = W * (tv ? 0.66 : 0.76), sh = H * (tv ? 0.72 : 0.72), sx = tv ? -W * 0.1 : 0, sy = tv ? 0.004 * s : 0.018 * s;
  // the front bezel; its opening chamfers in toward the tube, then a second lip steps down onto the glass
  g.add(mesh(frame(W, H, 0.018 * s, sw + 0.03 * s, sh + 0.03 * s, 0.024 * s, D, 0.006 * s, sx, sy), mat, 0, cy, D / 2));
  g.add(mesh(frame(sw + 0.034 * s, sh + 0.034 * s, 0.024 * s, sw + 0.012 * s, sh + 0.012 * s, 0.02 * s, 0.012 * s, 0.003 * s), mat, sx, cy + sy, D / 2 - 0.008 * s));
  // the tube: a black glass border with the picture inside it, the glass over both
  const scr = screen(g, sw, sh, 0.014 * s, sx, cy + sy, D / 2 - 0.0205 * s, { glassW: sw + 0.016 * s, glassH: sh + 0.016 * s, gap: 0.0016 * s });
  // the seam where the bezel meets the back shell
  g.add(mesh(frame(W * 0.985, H * 0.985, 0.017 * s, W * 0.95, H * 0.95, 0.016 * s, 0.002 * s, 0.0005 * s, 0, 0, 1), hole(), 0, cy, -D / 2 + 0.0005 * s));
  // the tube's housing behind, tapering and sitting a little low
  const bd = (tv ? 0.26 : 0.28) * s, y1 = H * 0.475, y2 = H * 0.26 - 0.03 * s;
  const [side, cap] = taper(W * 0.97, H * 0.95, 0.03 * s, W * 0.5, H * 0.52, 0.05 * s, bd, -0.03 * s);
  for (const geo of [side, cap]) g.add(mesh(geo, mat, 0, cy, -D / 2));
  // louvres on the sloped top, and on the back cap
  const slope = Math.atan2(y1 - y2, bd), tt = 0.4;
  vents(g, mat, W * 0.5, bd * 0.32, 11, { x: 0, y: cy + y1 * (1 - tt) + y2 * tt + 0.0005 * s, z: -D / 2 - bd * tt, rx: -Math.PI / 2 - slope });     // the roof slopes down to the back, so it faces up and back
  vents(g, mat, W * 0.3, H * 0.14, 7, { x: 0, y: cy - 0.03 * s + H * 0.12, z: -D / 2 - bd - 0.0003 * s, ry: Math.PI });
  // the back: a rating label, the power inlet with its cord, the signal cable
  const lb = decal(0.1 * s, 0.045 * s, `rating-${tv ? 'tv' : 'crt'}`, (x, w, h) => rating(x, w, h, tv ? { model: 'KV-14TR', power: 'AC 120V 60Hz 70W', made: 'MADE IN MALAYSIA', seed } : { model: 'ILMC-1700', power: 'AC 100-240V~ 1.5A 50/60Hz', seed }), { rough: 0.8, res: 512 });
  lb.rotation.y = Math.PI; lb.position.set(0, cy - 0.03 * s - H * 0.08, -D / 2 - bd - 0.0006 * s); g.add(lb);
  iec(g, W * 0.15, cy - 0.03 * s - H * 0.17, -D / 2 - bd - 0.0005 * s, s, Math.PI);
  if (!tv) {
    // tilt-swivel foot: a turned disc and a neck
    g.add(mesh(lathe([[0, 0], [0.12 * s, 0], [0.125 * s, 0.004 * s], [0.118 * s, 0.012 * s], [0.07 * s, 0.024 * s], [0.055 * s, y0 + 0.01 * s], [0, y0 + 0.01 * s]], 40), mat, 0, 0, -0.05 * s));
    g.add(mesh(lathe([[0.121 * s, 0], [0.124 * s, 0], [0.124 * s, 0.0015 * s], [0.121 * s, 0.0015 * s]], 40), hole(), 0, 0, -0.05 * s));
    // the chin: a recessed control well, the power rocker, four small buttons, the model badge moulded in
    g.add(mesh(rbox(0.1 * s, 0.016 * s, 0.006 * s, 0.003 * s), new THREE.MeshStandardMaterial({ color: 0x2a2824, roughness: 0.7 }), W * 0.2, y0 + 0.021 * s, D / 2 - 0.0015 * s));
    for (let i = 0; i < 4; i++) { const b = button(0.014 * s, 0.009 * s, 0.006 * s, mat); b.position.set(W * 0.2 - 0.033 * s + i * 0.018 * s, y0 + 0.021 * s, D / 2 + 0.0005 * s); g.add(b); }
    const pw = button(0.024 * s, 0.014 * s, 0.009 * s, mat); pw.position.set(W * 0.4, y0 + 0.021 * s, D / 2 + 0.002 * s); g.add(pw);
    const lbl = decal(0.12 * s, 0.02 * s, `crt-badge-${seed % 3}`, (x, w, h) => { badge(x, w * 0.75, h, ['SyncView 17', 'MultiScan 15sf', 'ILMC 1700T'][seed % 3], { fg: 'rgba(70,64,52,.85)', italic: true }); x.font = `${Math.round(h * 0.34)}px ${FONT}`; x.fillStyle = 'rgba(80,74,62,.8)'; x.fillText('▲ ▼ ◄ ►', w * 0.88, h * 0.55); });
    lbl.position.set(-W * 0.22, y0 + 0.022 * s, D / 2 + 0.0005 * s); g.add(lbl);
    const l = led(g, 0.0026 * s, 0x66ff55, W * 0.32, y0 + 0.022 * s, D / 2 + 0.0005 * s);
    bake(g, [scr, l]);
    return { g, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'crt', size: H, tick(dt, fx) { const k = 0.35 + 0.65 * fx.kick; lit(l, 0.25 * k, k, 0.2 * k, 7); } };
  }
  // the TV: a perforated speaker grille and two knobs right of the tube, four short feet
  const gx = W * 0.36;
  g.add(mesh(rbox(W * 0.17, H * 0.36, 0.004 * s, 0.006 * s), hole(), gx, cy + H * 0.16, D / 2 - 0.0012 * s));
  const grille = decal(W * 0.17, H * 0.36, 'tv-grille', (x, w, h) => { ink(x, '#1b1b1e'); x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'destination-out'; for (let yy = 5; yy < h - 3; yy += 10) for (let xx = 5 + (yy / 10 % 2) * 5; xx < w - 3; xx += 10) { x.beginPath(); x.arc(xx, yy, 3, 0, TAU); x.fill(); } }, { rough: 0.6 });
  grille.position.set(gx, cy + H * 0.16, D / 2 + 0.0005 * s); g.add(grille);
  for (let i = 0; i < 2; i++) {
    const ky = cy - H * 0.13 - i * 0.05 * s;
    const k = mesh(lathe([[0, 0], [0.017 * s, 0], [0.017 * s, 0.003 * s], [0.015 * s, 0.013 * s], [0.012 * s, 0.016 * s], [0, 0.016 * s]], 24), metal(0x9a9da2, 0.4), gx, ky, D / 2); k.rotation.x = Math.PI / 2; g.add(k);
    const tick = mesh(new THREE.BoxGeometry(0.002 * s, 0.009 * s, 0.002 * s), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), gx, ky + 0.007 * s, D / 2 + 0.0165 * s); tick.rotation.z = (R() - 0.5) * 2; g.add(tick);
  }
  const brand = decal(0.1 * s, 0.016 * s, 'tv-brand', (x, w, h) => { badge(x, w, h, 'COLORVISION', { fg: '#c9ccd2', weight: '700' }); }, { metal: 0.8, rough: 0.3 });
  brand.position.set(sx, y0 + 0.012 * s, D / 2 + 0.0005); g.add(brand);
  for (const fx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.008 * s, 0.011 * s, y0, 12), hole(), fx * W * 0.38, y0 / 2, 0));
  ports(g, ['in', 'out', 'in'], -W * 0.1, cy - 0.03 * s - H * 0.19, -D / 2 - bd - 0.0005 * s, Math.PI, s);
  const l = led(g, 0.0024 * s, 0xff3322, gx + 0.026 * s, y0 + 0.012 * s, D / 2 + 0.0005 * s);
  bake(g, [scr, l]);
  return { g, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'tv', size: H, tick(dt, fx) { const k = 0.4 + 0.6 * fx.kick; lit(l, k, 0.12 * k, 0.08 * k, 7); } };
}

// ---------------- printed circuit boards: solder mask, traces, silkscreen, parts ----------------
function pcbTex(dark) {
  return decalTex('pcb-' + (dark ? 'd' : 'g'), 1, 1, (x, w, h) => {
    const R = rng(dark ? 7 : 3), tr = dark ? 'rgba(80,92,98,.7)' : 'rgba(64,138,70,.85)', pad = '#c8b070';
    x.fillStyle = dark ? '#15181a' : '#1b4528'; x.fillRect(0, 0, w, h);
    x.lineCap = 'round'; x.lineJoin = 'round';
    // bundles of parallel traces that run, jog 45 degrees, and run on: a bus between two chips
    for (let b = 0; b < 26; b++) {
      const n = 3 + Math.floor(R() * 8), gap = 4, x0 = R() * w, y0 = R() * h, l1 = 20 + R() * 120, l2 = 20 + R() * 120, horiz = R() < 0.5, dir = R() < 0.5 ? 1 : -1;
      x.strokeStyle = tr; x.lineWidth = R() < 0.85 ? 1.6 : 3;
      for (let k = 0; k < n; k++) {
        x.beginPath(); const o = k * gap;
        if (horiz) { x.moveTo(x0, y0 + o); x.lineTo(x0 + l1 + o, y0 + o); x.lineTo(x0 + l1 + o + 18, y0 + o + 18 * dir); x.lineTo(x0 + l1 + l2, y0 + o + 18 * dir); }
        else { x.moveTo(x0 + o, y0); x.lineTo(x0 + o, y0 + l1 + o); x.lineTo(x0 + o + 18 * dir, y0 + l1 + o + 18); x.lineTo(x0 + o + 18 * dir, y0 + l1 + l2); }
        x.stroke();
      }
    }
    // rows of pads (where chips and connectors are soldered), vias
    for (let i = 0; i < 30; i++) { const px = R() * w, py = R() * h, n = 4 + Math.floor(R() * 14), v = R() < 0.5; x.fillStyle = pad; for (let k = 0; k < n; k++) x.fillRect(px + (v ? 0 : k * 5), py + (v ? k * 5 : 0), 3, 3); }
    for (let i = 0; i < 160; i++) { x.fillStyle = pad; x.beginPath(); x.arc(R() * w, R() * h, 1.6, 0, TAU); x.fill(); }
    // silkscreen: part outlines, designators, a board name
    x.strokeStyle = 'rgba(232,232,222,.75)'; x.lineWidth = 1; x.fillStyle = 'rgba(236,236,228,.85)'; x.font = `9px ${FONT}`;
    for (let i = 0; i < 36; i++) { const px = R() * w, py = R() * h, bw = 8 + R() * 36, bh = 6 + R() * 24; x.strokeRect(px, py, bw, bh); x.fillText(['C', 'R', 'U', 'L', 'Q', 'J', 'D'][i % 7] + Math.floor(R() * 90 + 1), px, py - 2); }
    x.font = `bold 13px ${FONT}`; x.fillText(dark ? 'ILMC-DSP  REV C' : 'ILMC-MB  REV 2.1', 18, h - 14); x.font = `9px ${FONT}`; x.fillText('94V-0  E212345', w - 96, h - 14);
  }, 512);
}
export function board(w, h, seed, mat, dark = false) {
  const R = rng(seed), g = new THREE.Group();
  const base = new THREE.MeshStandardMaterial({ map: pcbTex(dark), roughness: 0.42, metalness: 0.1 });
  const pg = new THREE.BoxGeometry(w, h, 0.0016); const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.22 + seed * 0.37, uv.getY(i) * h / 0.22);
  g.add(mesh(pg, base));
  const chip = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.35 }), pin = metal(0xc8c9c4, 0.3), alu = steel();
  const capBody = new THREE.MeshStandardMaterial({ color: dark ? 0x2a2a6a : 0x1d2a4a, roughness: 0.35 }), capTop = metal(0xcfd2d6, 0.3);
  // chips with a row of pins each side and a printed part number
  const n = 5 + Math.floor(w * h * 400);
  for (let i = 0; i < Math.min(n, 12); i++) {
    const cw = 0.01 + R() * 0.022, ch = cw * (0.5 + R() * 0.8), x = (R() - 0.5) * (w - cw - 0.01), y = (R() - 0.5) * (h - ch - 0.01);
    g.add(mesh(new THREE.BoxGeometry(cw, ch, 0.0022), chip, x, y, 0.0019));
    g.add(mesh(new THREE.BoxGeometry(cw * 0.9, ch + 0.003, 0.0006), pin, x, y, 0.0011));
  }
  // electrolytic caps: a sleeve with a stripe, a scored silver top
  for (let i = 0; i < 6 + Math.floor(R() * 5); i++) {
    const r = 0.0028 + R() * 0.0035, x = (R() - 0.5) * (w - 0.012), y = (R() - 0.5) * (h - 0.012), hh = 0.008 + R() * 0.008;
    const c = mesh(new THREE.CylinderGeometry(r, r, hh, 12), capBody, x, y, 0.0008 + hh / 2); c.rotation.x = Math.PI / 2; g.add(c);
    const t = mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.0006, 12), capTop, x, y, 0.0008 + hh + 0.0002); t.rotation.x = Math.PI / 2; g.add(t);
  }
  // little surface-mount resistors and caps scattered between the bigger parts
  const smd = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5 }), smdC = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.5 });
  for (let i = 0; i < 26; i++) g.add(mesh(new THREE.BoxGeometry(0.0022, 0.0012, 0.0008), i % 3 ? smd : smdC, (R() - 0.5) * (w - 0.006), (R() - 0.5) * (h - 0.006), 0.0012).rotateZ(R() < 0.5 ? 0 : Math.PI / 2));
  // slots, a heatsink with fins
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.004, h * 0.55, 0.007), new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.55 }), -w * 0.18 + i * 0.008, h * 0.12, 0.0043));
  const hx = w * 0.22, hy = -h * 0.12;
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.002), alu, hx, hy, 0.0018));
  for (let i = 0; i < 7; i++) g.add(mesh(new THREE.BoxGeometry(0.0012, 0.03, 0.011), alu, hx - 0.0135 + i * 0.0045, hy, 0.0074));
  return g;
}

// ---------------- crust ----------------
// A coat of crust over a w x h face (facing +z, the face at z = 0): a jittered grid lifted by lumpy noise, flat-shaded so it
// breaks into facets. Thicker toward the openings it is built up round, dipping into them; past the face's edge it curls
// back over the corner. holes: [cx, cy, w, h, build-up]. Only the parts of a cell that are not inside an opening are kept.
function crustFace(w, h, holes, amp, cell, seed, floor = -1e9) {
  const R = rng(seed * 7919 + 1), ov = cell * 1.5, nx = Math.ceil((w + 2 * ov) / cell), ny = Math.ceil((h + 2 * ov) / cell);
  const L = new Float32Array(64 * 64).map(() => R());
  const vn = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), at = (a, b) => L[((b & 63) << 6) | (a & 63)];
    return at(ix, iy) * (1 - u) * (1 - v) + at(ix + 1, iy) * u * (1 - v) + at(ix, iy + 1) * (1 - u) * v + at(ix + 1, iy + 1) * u * v; };
  const P = [], inHole = [], Z = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const edge = i === 0 || j === 0 || i === nx || j === ny, jt = edge ? 0 : 0.38;
    const x = -w / 2 - ov + i * (w + 2 * ov) / nx + (R() - 0.5) * jt * cell, y = Math.max(floor, -h / 2 - ov + j * (h + 2 * ov) / ny + (R() - 0.5) * jt * cell);   // jittered, so facets are irregular
    const n = vn(x / (cell * 4) + 11, y / (cell * 4) + 7) * 0.6 + vn(x / (cell * 1.6) + 3, y / (cell * 1.6) + 5) * 0.4;
    let z = amp * (0.2 + 0.8 * Math.pow(n, 1.4)) + (R() - 0.5) * amp * 0.45, dIn = 1;
    for (const [hx, hy, hw, hh, build] of holes) {
      const d = Math.max(Math.abs(x - hx) - hw / 2, Math.abs(y - hy) - hh / 2);            // > 0 outside the opening
      z += amp * 0.9 * build * Math.exp(-Math.max(0, d) / (cell * 1.4)) * (0.6 + 0.8 * n);
      if (d < 0) { z -= -d * 1.4; dIn = Math.min(dIn, d); }
    }
    const e = Math.max(Math.abs(x) - w / 2, Math.abs(y) - h / 2);
    if (e > 0) z -= e * 1.7;
    P.push(x, y, z); Z.push(z); inHole.push(dIn < -cell * 0.9);
  }
  const pos = [], uv = [], at = (i, j) => (j * (nx + 1) + i);
  // how far each point sits below its neighbours: the crevices, darkened in the shader
  const cav = Z.map((z, k) => { const i = k % (nx + 1), j = Math.floor(k / (nx + 1)); let a = 0, n = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii > nx || jj > ny) continue; a += Z[at(ii, jj)]; n++; } return Math.max(0, Math.min(1, (a / n - z) / (amp * 0.45))); });
  const tri = (a, b, c) => { if (inHole[a] && inHole[b] && inHole[c]) return; const t = R(); for (const k of [a, b, c]) { pos.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); uv.push(cav[k], t); } };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1); if ((i + j) % 2) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}

// ---------------- the hero: a compact all-in-one fused with a PC, crusted over (the video's computer) ----------------
export function franken(seed = 1, s = 1) {
  const R = rng(seed), g = new THREE.Group();
  const beige = plastic(0xcfc5ab, 0.55, { age: 0.6, dust: 0.6, wear: 0.8, crust: 0.6, seed: R() * 9 });
  const W = 0.25 * s, H = 0.33 * s, D = 0.27 * s, fD = 0.03 * s;
  const sw = 0.165 * s, sh = 0.125 * s, scy = H * 0.64;
  // the case: body behind, a front shell whose opening steps in to the tube
  g.add(mesh(rbox(W, H, D - fD, 0.02 * s, 3), beige, 0, H / 2, -fD / 2));
  g.add(mesh(frame(W, H, 0.02 * s, sw + 0.03 * s, sh + 0.03 * s, 0.014 * s, fD, 0.006 * s, 0, scy - H / 2), beige, 0, H / 2, D / 2));
  g.add(mesh(frame(sw + 0.032 * s, sh + 0.032 * s, 0.015 * s, sw + 0.012 * s, sh + 0.012 * s, 0.01 * s, 0.012 * s, 0.003 * s), beige, 0, scy, D / 2 - fD + 0.012 * s));
  const scr = screen(g, sw, sh, 0.006 * s, 0, scy, D / 2 - fD + 0.0075 * s, { glassW: sw + 0.014 * s, glassH: sh + 0.014 * s, gap: 0.0012 * s });
  // crust: a thick lumpy coat of it over the face, the top and the left side, built up round the screen and curling over
  // the edges, chipped into facets (the video's computer looks dug out of plaster). The floppy slot is kept clear.
  const ow = sw + 0.03 * s, oh = sh + 0.03 * s, fy = H * 0.24, crust = plastic(0xcfc5ab, 0.85, { age: 0.2, dust: 0.5, wear: 0.5, crust: 1, shell: true, seed: R() * 9 });
  const front = mesh(crustFace(W, H, [[0, scy - H / 2, ow, oh, 1.6], [0.03 * s, fy - H / 2, 0.15 * s, 0.03 * s, 0.5]], 0.014 * s, 0.012 * s, seed, -H / 2 - 0.005 * s), crust, 0, H / 2, D / 2); g.add(front);
  const topC = mesh(crustFace(W - 0.03 * s, D - 0.03 * s, [], 0.011 * s, 0.016 * s, seed + 3), crust, 0, H - 0.002 * s, 0); topC.rotation.x = -Math.PI / 2; g.add(topC);   // inset: the face's coat curls over onto it
  const left = mesh(crustFace(D - 0.03 * s, H - 0.03 * s, [], 0.009 * s, 0.016 * s, seed + 5, -H / 2 - 0.005 * s), crust, -W / 2 + 0.002 * s, H / 2, 0); left.rotation.y = -Math.PI / 2; g.add(left);
  // the chin: a floppy slot with its door and eject button, ridges, the badge
  g.add(mesh(rbox(0.09 * s, 0.012 * s, 0.004 * s, 0.003 * s), hole(), 0.045 * s, H * 0.24, D / 2 - 0.0005 * s));
  g.add(mesh(rbox(0.082 * s, 0.006 * s, 0.002 * s, 0.001 * s), new THREE.MeshStandardMaterial({ color: 0x2a2824, roughness: 0.5 }), 0.045 * s, H * 0.24, D / 2 + 0.0005 * s));
  g.add(mesh(rbox(0.012 * s, 0.006 * s, 0.004 * s, 0.002 * s), beige, 0.1 * s, H * 0.205, D / 2 + 0.001 * s));
  const slot = new THREE.Object3D(); slot.position.set(0.045 * s, H * 0.24, D / 2 + 0.01); g.add(slot);
  // the fused PC: a board up the side on standoffs, a big fan, a board behind, orange caps on top, a drive bolted left
  const side = board(D * 0.9, H * 0.85, seed * 7, null, true); side.rotation.y = Math.PI / 2; side.position.set(W / 2 + 0.0015, H * 0.5, 0); g.add(side);
  const f = fan(0.12 * s, blackOf(R, { dust: 0.8 }), 0.016 * s); f.g.rotation.y = Math.PI / 2; f.g.position.set(W / 2 + 0.003 + 0.016 * s + 0.12 * s * 0.14, H * 0.45, 0.02 * s); g.add(f.g);
  const back = board(W * 0.8, H * 0.7, seed * 13); back.position.set(0, H * 0.55, -D / 2 - 0.0015); back.rotation.y = Math.PI; g.add(back);
  const so = metal(0xb08a3a, 0.35);
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.0025 * s, 0.0025 * s, 0.0012, 6).rotateZ(Math.PI / 2), so, W / 2 + 0.0026 + 0.0006, H * 0.5 + y * H * 0.38, x * D * 0.4));   // the screws through the boards
    g.add(mesh(new THREE.CylinderGeometry(0.0025 * s, 0.0025 * s, 0.0012, 6).rotateX(Math.PI / 2), so, x * W * 0.36, H * 0.55 + y * H * 0.3, -D / 2 - 0.0026 - 0.0006));
  }
  ports(g, ['kb', 'ms', 'vga', 'ser', 'in', 'out'], -W * 0.08, H * 0.1, -D / 2 - 0.001 * s, Math.PI, s);
  iec(g, W * 0.36, H * 0.1, -D / 2 - 0.002 * s, s, Math.PI);
  const capMat = new THREE.MeshStandardMaterial({ color: 0xe0501c, roughness: 0.42 }), capTop = metal(0xc9ccd0, 0.3);
  for (let i = 0; i < 4; i++) {
    const x0 = -W * 0.3 + i * 0.03 * s + R() * 0.01, z0 = -D * 0.2 + R() * 0.04;
    g.add(mesh(lathe([[0, 0], [0.0135 * s, 0], [0.0142 * s, 0.003 * s], [0.0142 * s, 0.028 * s], [0.013 * s, 0.031 * s], [0, 0.031 * s]], 20), capMat, x0, H, z0));
    g.add(mesh(new THREE.CylinderGeometry(0.0125 * s, 0.0125 * s, 0.0012 * s, 20), capTop, x0, H + 0.0316 * s, z0));
    g.add(mesh(new THREE.BoxGeometry(0.0035 * s, 0.029 * s, 0.0285 * s), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4 }), x0 + 0.0125 * s, H + 0.015 * s, z0));
  }
  // the bolted-on drive: a crusty grey box with a bay face
  const dmat = plastic(0x8f8a7c, 0.6, { age: 0.3, dust: 0.7, wear: 0.8, crust: 0.7, seed: R() * 9 });
  g.add(mesh(rbox(0.07 * s, 0.2 * s, 0.2 * s, 0.005 * s, 2), dmat, -W / 2 - 0.035 * s, 0.1 * s, -0.02 * s));
  g.add(mesh(rbox(0.058 * s, 0.028 * s, 0.004 * s, 0.002 * s), hole(), -W / 2 - 0.035 * s, 0.17 * s, 0.08 * s));
  g.add(mesh(rbox(0.054 * s, 0.024 * s, 0.003 * s, 0.002 * s), new THREE.MeshStandardMaterial({ color: 0x2a2824, roughness: 0.55 }), -W / 2 - 0.035 * s, 0.17 * s, 0.081 * s));
  const dl = led(g, 0.0016 * s, 0xff9922, -W / 2 - 0.02 * s, 0.163 * s, 0.0832 * s);
  const l = led(g, 0.0026 * s, 0x55ff77, -0.035 * s, H * 0.24, D / 2 + 0.0008 * s);
  bake(g, [scr, f.g, l, dl, slot]);
  let spin = 0;
  return { g, fan: f, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'franken', size: H, slot,
    tick(dt, fx) { spin += dt * (2 + 40 * fx.low + 25 * fx.energy); f.set(spin); const k = 0.3 + 0.7 * fx.hat; lit(l, 0.25 * k, k, 0.35 * k, 7); const d = fx.mid > 0.4 || Math.random() < 0.1 ? 1 : 0.1; lit(dl, d, 0.55 * d, 0.1 * d, 7); } };
}

// ---------------- a flat panel on a stand (the album cover's big monitor) ----------------
export function lcd(s = 1) {
  const R = rng(Math.round(s * 100) + 5), g = new THREE.Group(), W = 0.56 * s, H = 0.35 * s, y0 = 0.12 * s, black = blackOf(R, { dust: 0.5, wear: 0.4 }), sat = plastic(0x232427, 0.42, { age: 0, dust: 0.4, wear: 0.3, seed: R() * 9 });
  const sw = W - 0.024 * s, sh = H - 0.05 * s, chin = 0.018 * s;
  g.add(mesh(rbox(W, H, 0.012 * s, 0.006 * s), black, 0, y0 + H / 2, 0));
  const [side, cap] = taper(W * 0.96, H * 0.94, 0.01 * s, W * 0.5, H * 0.5, 0.02 * s, 0.035 * s); for (const geo of [side, cap]) g.add(mesh(geo, black, 0, y0 + H / 2, -0.006 * s));
  g.add(mesh(frame(W, H, 0.006 * s, sw + 0.004 * s, sh + 0.004 * s, 0.002 * s, 0.004 * s, 0.0015 * s, 0, chin / 2), sat, 0, y0 + H / 2, 0.0095 * s));
  const scr = screen(g, sw, sh, 0, 0, y0 + H / 2 + chin / 2, 0.0068 * s, { matte: true, gap: 0.0008 * s });
  const logo = decal(0.06 * s, 0.01 * s, 'lcd-logo', (x, w, h) => badge(x, w, h, 'ILMC', { fg: '#9a9da4', weight: '600' }), { metal: 0.8, rough: 0.3 });
  logo.position.set(0, y0 + 0.012 * s, 0.0101 * s); g.add(logo);
  // the buttons along the bottom edge, their labels printed on the bezel
  for (let i = 0; i < 5; i++) { const b = button(0.008 * s, 0.003 * s, 0.006 * s, sat); b.position.set(W * 0.22 + i * 0.016 * s, y0 - 0.001 * s, 0.002 * s); g.add(b); }
  const keys = decal(0.09 * s, 0.006 * s, 'lcd-keys', (x, w, h) => { x.fillStyle = 'rgba(190,190,195,.85)'; x.font = `${Math.round(h * 0.7)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; ['MENU', '◄', '►', 'AUTO', '⏻'].forEach((t, i) => x.fillText(t, w * (0.1 + i * 0.178), h * 0.55)); });
  keys.position.set(W * 0.22 + 0.032 * s, y0 + 0.006 * s, 0.0101 * s); g.add(keys);
  const l = led(g, 0.0018 * s, 0x3a8bff, W * 0.46, y0 + 0.008 * s, 0.0102 * s);
  // the back: a VESA plate with four screws, vent slits, the ports and the label
  vents(g, black, W * 0.4, 0.03 * s, 14, { x: 0, y: y0 + H * 0.66, z: -0.0415 * s, ry: Math.PI });
  screws(g, [[-0.05, 0.05], [0.05, 0.05], [-0.05, -0.05], [0.05, -0.05]].map(([x, y]) => [x * s, y0 + H / 2 + y * s, -0.0412 * s, Math.PI]), 0.003 * s, metal());
  ports(g, ['vga', 'usb', 'in'], 0, y0 + H * 0.33, -0.0412 * s, Math.PI, s);
  iec(g, W * 0.18, y0 + H * 0.33, -0.0412 * s, s, Math.PI);
  const lb = decal(0.08 * s, 0.036 * s, 'rating-lcd', (x, w, h) => rating(x, w, h, { model: 'FP-1912', power: '100-240V~ 1.0A 50/60Hz', made: 'MADE IN CHINA', paper: '#c9c9c4', seed: 4 }), { rough: 0.7 });
  lb.rotation.y = Math.PI; lb.position.set(-W * 0.15, y0 + H * 0.42, -0.0414 * s); g.add(lb);
  // the stand: a tapered neck and a round turned base
  const neck = new THREE.Shape(); neck.moveTo(-0.028 * s, 0); neck.lineTo(0.028 * s, 0); neck.lineTo(0.02 * s, y0 + 0.05 * s); neck.lineTo(-0.02 * s, y0 + 0.05 * s); neck.closePath();
  const ng = ext(neck, 0.014 * s, 0.003 * s); ng.translate(0, 0, -0.04 * s); g.add(mesh(ng, sat));
  g.add(mesh(lathe([[0, 0], [0.11 * s, 0], [0.112 * s, 0.003 * s], [0.1 * s, 0.009 * s], [0.03 * s, 0.012 * s], [0, 0.012 * s]], 40), sat, 0, 0, -0.03 * s));
  bake(g, [scr, l]);
  return { g, screens: [{ mesh: scr, w: sw, h: sh }], kind: 'lcd', size: (y0 + H) * 0.85, tick(dt, fx) { const k = 0.4 + 0.6 * fx.kick; lit(l, 0.2 * k, 0.5 * k, k, 6); } };
}

// ---------------- keyboards: a real layout with printed legends, its keys a spectrum ----------------
function layoutRows(rows, unit) {
  const keys = []; let maxW = 0;
  rows.forEach((row, r) => { let x = 0; row.forEach((k, i) => { const [w, gap = 0] = Array.isArray(k) ? k : [k]; x += gap; keys.push({ x: x + w / 2, w, r, i }); x += w; }); maxW = Math.max(maxW, x); });
  for (const k of keys) { k.u = k.x / maxW; k.cx = (k.x - maxW / 2) * unit; }
  return { keys, width: maxW * unit };
}
const FULL = [
  [1, [1, 1], 1, 1, 1, [1, 0.5], 1, 1, 1, [1, 0.5], 1, 1, 1, [1, 0.25], 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, [1, 0.25], 1, 1, [1, 0.25], 1, 1, 1],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, [1, 0.25], 1, 1, [1, 0.25], 1, 1, 1, [1, 0]],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25, [1, 3.5], 1, 1],
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75, [1, 1.25], [1, 1.25], 1, 1, [1, 0]],
  [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25, [1, 0.25], 1, 1, [2, 0.25], 1],
];
const FULL_L = [
  'Esc F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 Prt Scr Pse',
  '` 1 2 3 4 5 6 7 8 9 0 - = ← Ins Hm PgU Num / * -',
  'Tab Q W E R T Y U I O P [ ] \\ Del End PgD 7 8 9 +',
  'Caps A S D F G H J K L ; \' Enter 4 5 6',
  'Shift Z X C V B N M , . / Shift ↑ 1 2 3 Ent',
  'Ctrl ⊞ Alt _ Alt ⊞ ≡ Ctrl ← ↓ → 0 .',
].map((r) => r.split(' ').map((t) => (t === '_' ? '' : t)));
const LAPTOP = [
  Array(14).fill(0.92),
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.6],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.1],
  [1.8, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.8],
  [2.3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.3],
  [1, 1, 1.3, 5.6, 1.3, 1, 1, 1, 1],
];
const LAPTOP_L = [
  'esc F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 ⏏',
  '` 1 2 3 4 5 6 7 8 9 0 - = delete',
  'tab Q W E R T Y U I O P [ ] \\',
  'caps A S D F G H J K L ; \' return',
  'shift Z X C V B N M , . / shift',
  'fn ctrl alt _ cmd ← ↑ ↓ →',
].map((r) => r.split(' ').map((t) => (t === '_' ? '' : t)));
const MODS = new Set(['Esc', 'Tab', 'Caps', 'Shift', 'Ctrl', 'Alt', '⊞', '≡', 'Enter', 'Ent', '←', 'Ins', 'Hm', 'PgU', 'Del', 'End', 'PgD', 'Num', 'Prt', 'Scr', 'Pse', '↑', '↓', '→', 'F1', 'F2', 'F3', 'F4', 'F9', 'F10', 'F11', 'F12']);
// every legend in one atlas: 16 x 16 cells of 64 px
const GLYPHS = [...new Set([...FULL_L.flat(), ...LAPTOP_L.flat()])];
let atlas = null;
function glyphAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024); x.fillStyle = '#fff'; x.textAlign = 'left'; x.textBaseline = 'top';
  GLYPHS.forEach((t, i) => { if (!t) return; const cx = (i % 16) * 64, cy = Math.floor(i / 16) * 64, big = t.length === 1; x.font = `${big ? 'bold 24' : '600 14'}px Arial, Helvetica, sans-serif`; x.fillText(t, cx + 10, cy + 9, 46); });
  atlas = new THREE.CanvasTexture(c); atlas.anisotropy = 8; atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter;
  return atlas;
}
// a keycap: a skirt that narrows to a top with a chamfer, the legend mapped onto the top. Unit-sized; instances scale it.
function keycap() {
  const b = 0.5, t = 0.38, c = 0.43, y0 = -0.5, y1 = 0.38, y2 = 0.5, pos = [], uv = [];
  const quad = (a, bb, cc, d, uvs) => { pos.push(...a, ...bb, ...cc, ...a, ...cc, ...d); uv.push(...(uvs || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])); };
  quad([-t, y2, t], [t, y2, t], [t, y2, -t], [-t, y2, -t], [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);    // top, the legend in its top-left
  const ring = (r0, ya, r1, yb) => { const P = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; quad([p[0] * r0, ya, p[1] * r0], [p[0] * r1, yb, p[1] * r1], [q[0] * r1, yb, q[1] * r1], [q[0] * r0, ya, q[1] * r0]); } };
  ring(t, y2, c, y1); ring(c, y1, b, y0);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals(); return geo;
}
// keys: aged plastic, two tones (letters, and the darker modifiers), a printed legend, and the spectrum glow on top
function keyMat(light, dark, legend, R) {
  const m = plastic(0xffffff, 0.5, { age: light > 0.5 ? 0.5 : 0, dust: 0.4, wear: 0.9, seed: R() * 9 });
  const ownWear = m.onBeforeCompile;
  m.userData.keys = { tGlyph: { value: glyphAtlas() }, uLight: { value: new THREE.Color(light) }, uDark: { value: new THREE.Color(dark) }, uLegend: { value: new THREE.Color(legend) } };
  m.onBeforeCompile = (s, r) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aKey; varying vec2 vKeyA; varying vec3 vKey; varying vec2 vKeyUv;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvKeyA = aKey; vKeyUv = uv;\n#ifdef USE_INSTANCING_COLOR\nvKey = instanceColor;\n#endif');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGlyph; uniform vec3 uLight, uDark, uLegend; varying vec2 vKeyA; varying vec3 vKey; varying vec2 vKeyUv;')
      .replace('#include <color_fragment>', `diffuseColor.rgb = mix(uLight, uDark, vKeyA.y);
        if (vKeyA.x >= 0.0 && vKeyUv.x + vKeyUv.y > 0.0) { vec2 cell = vec2(mod(vKeyA.x, 16.0), floor(vKeyA.x / 16.0)); float a = texture2D(tGlyph, vec2((cell.x + vKeyUv.x) / 16.0, 1.0 - (cell.y + 1.0 - vKeyUv.y) / 16.0)).r; diffuseColor.rgb = mix(diffuseColor.rgb, uLegend, a * 0.92); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vKey * 3.0;');
    Object.assign(s.uniforms, m.userData.keys);
    ownWear(s, r);
  };
  m.customProgramCacheKey = () => 'keys2';
  return m;
}
function keySet(rows, labels, unit, capH, mat) {
  const L = layoutRows(rows, unit), n = L.keys.length, geo = keycap();
  const keys = new THREE.InstancedMesh(geo, mat, n), o = new THREE.Object3D(), col = new THREE.Color(0, 0, 0), a = new Float32Array(n * 2);
  L.keys.forEach((k, i) => {
    o.position.set(k.cx, 0, (k.r - (rows.length - 1) / 2) * unit); o.scale.set(k.w * unit - unit * 0.12, capH, unit * 0.88); o.updateMatrix(); keys.setMatrixAt(i, o.matrix); keys.setColorAt(i, col);
    const t = labels[k.r]?.[k.i] ?? ''; a[i * 2] = t ? GLYPHS.indexOf(t) : -1; a[i * 2 + 1] = MODS.has(t) || t.length > 1 || (!t && k.w > 2) ? 1 : 0;
  });
  geo.setAttribute('aKey', new THREE.InstancedBufferAttribute(a, 2));
  return { keys, layout: L, rows: rows.length };
}
function glow(set, fx, col) {
  if (!fx.spec) return;
  const { keys, layout, rows } = set;
  layout.keys.forEach((k, i) => {
    const v = fx.spec[Math.floor(4 + k.u * 96)] * fx.alive, on = Math.max(0, Math.min(1, v * rows * 1.3 - (rows - 1 - k.r)));
    col.copy(KEYCOL[fx.palette % 3]).multiplyScalar(on * on); keys.setColorAt(i, col);
  });
  keys.instanceColor.needsUpdate = true;
}
export function keyboard(seed = 1, s = 1) {
  const R = rng(seed * 13 + 1), g = new THREE.Group(), u = 0.0185 * s;
  const set = keySet(FULL, FULL_L, u, 0.0085 * s, keyMat(0xd6d0bf, 0x9c968a, 0x34322d, R));
  const W = set.layout.width + 0.03 * s, D = u * 6 + 0.045 * s, mat = seed % 2 ? beigeOf(R) : platOf(R);
  // a wedge-shaped case, taller at the back, with a step down to the key well
  const prof = new THREE.Shape(); prof.moveTo(-D / 2, 0); prof.lineTo(D / 2, 0); prof.lineTo(D / 2, 0.022 * s); prof.lineTo(D / 2 - 0.006 * s, 0.025 * s); prof.lineTo(-D / 2 + 0.01 * s, 0.033 * s); prof.lineTo(-D / 2, 0.03 * s); prof.closePath();
  const body = ext(prof, W, 0.003 * s); body.rotateY(Math.PI / 2); body.translate(-W / 2, 0, 0); g.add(mesh(body, mat));
  const well = mesh(new THREE.BoxGeometry(set.layout.width + 0.006 * s, 0.002 * s, u * 6 + 0.006 * s), new THREE.MeshStandardMaterial({ color: 0x3a3732, roughness: 0.85 }), 0, 0.025 * s, 0.006 * s);
  well.rotation.x = 0.07; g.add(well);
  set.keys.position.set(0, 0.0315 * s, 0.006 * s); set.keys.rotation.x = 0.07; g.add(set.keys);
  // the lock lights and the badge on the top strip, feet and a cable out the back
  const leds = [0, 1, 2].map((i) => led(g, 0.0016 * s, 0x55ff77, W / 2 - 0.045 * s + i * 0.014 * s, 0.0315 * s, -D / 2 + 0.013 * s, 1.5, true));
  const lt = decal(0.05 * s, 0.006 * s, 'kb-locks', (x, w, h) => { x.fillStyle = 'rgba(70,66,58,.8)'; x.font = `${Math.round(h * 0.75)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; ['Num', 'Caps', 'Scroll'].forEach((t, i) => x.fillText(t, w * (0.18 + i * 0.28), h * 0.5)); });
  lt.rotation.x = -Math.PI / 2 + 0.25; lt.position.set(W / 2 - 0.031 * s, 0.0333 * s, -D / 2 + 0.019 * s); g.add(lt);
  const lbl = decal(0.06 * s, 0.01 * s, 'kb-badge', (x, w, h) => badge(x, w, h, 'ILMC  enhanced', { fg: '#7d776a', italic: true }));
  lbl.rotation.x = -Math.PI / 2 + 0.25; lbl.position.set(-W / 2 + 0.06 * s, 0.0335 * s, -D / 2 + 0.013 * s); g.add(lbl);
  for (const fx of [-1, 1]) g.add(mesh(rbox(0.03 * s, 0.004 * s, 0.012 * s, 0.0015 * s), hole(), fx * W * 0.4, 0.0015 * s, -D * 0.35));
  bake(g, [set.keys, ...leds]);
  const col = new THREE.Color(); let t = 0;
  return { g, screens: [], kind: 'keyboard', size: 0.04 * s, tick(dt, fx) { glow(set, fx, col); t += dt; leds.forEach((l, i) => { const on = i === 1 || (i === 0 && fx.kick > 0.5) || (i === 2 && fx.hat > 0.4) ? 1 : 0.04; lit(l, 0.3 * on, on, 0.25 * on, 6); }); } };
}

// ---------------- a laptop: keyboard well, trackpad, hinge, a bezel with a webcam, a glowing :3 on the lid ----------------
export function laptop(seed = 1, s = 1, color = 'silver') {
  const R = rng(seed * 7 + 3), g = new THREE.Group();
  const mat = color === 'white' ? plastic(0xefeee8, 0.3, { age: 0.35, dust: 0.3, wear: 0.7, yellow: 0xead9a8, seed: R() * 9 }) : color === 'black' ? blackOf(R, { wear: 0.6 }) : age(new THREE.MeshStandardMaterial({ color: 0xc2c5ca, roughness: 0.34, metalness: 1 }), { age: 0, dust: 0.3, wear: 0.6, grain: 0.3, seed: R() * 9 });
  const W = 0.32 * s, D = 0.22 * s, T = 0.016 * s, u = 0.0182 * s;
  g.add(mesh(rbox(W, T, D, 0.008 * s, 3), mat, 0, T / 2, 0));
  const set = keySet(LAPTOP, LAPTOP_L, u, 0.0022 * s, keyMat(color === 'white' ? 0xf4f3ee : 0x1c1c1f, color === 'white' ? 0xf4f3ee : 0x1c1c1f, color === 'white' ? 0x55565a : 0xd8d8d4, R));
  g.add(mesh(new THREE.BoxGeometry(set.layout.width + 0.008 * s, 0.001 * s, u * 6 + 0.008 * s), new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.7 }), 0, T - 0.0002 * s, -0.035 * s));
  set.keys.position.set(0, T + 0.0006 * s, -0.035 * s); g.add(set.keys);
  // the trackpad, sunk a little, and its button
  g.add(mesh(rbox(0.1 * s, 0.002 * s, 0.062 * s, 0.004 * s), hole(), 0, T - 0.0006 * s, D * 0.3));
  g.add(mesh(rbox(0.095 * s, 0.0016 * s, 0.046 * s, 0.003 * s), age(new THREE.MeshStandardMaterial({ color: color === 'black' ? 0x232327 : 0xb9bcc2, roughness: 0.3, metalness: color === 'silver' ? 0.8 : 0 }), { age: 0, dust: 0.1, wear: 1, seed: R() * 9 }), 0, T - 0.0002 * s, D * 0.27));
  g.add(mesh(rbox(0.095 * s, 0.0016 * s, 0.012 * s, 0.002 * s), mat, 0, T - 0.0002 * s, D * 0.27 + 0.03 * s));
  // feet, ports down the side (the USB stick goes in the front one on the right), a vent
  for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.CylinderGeometry(0.005 * s, 0.005 * s, 0.002 * s, 12), hole(), fx * W * 0.42, 0.0005 * s, fz * D * 0.4));
  for (const [k, z] of [['usb', 0.04], ['usb', 0.015], ['in', -0.012]]) ports(g, [k], W / 2 + 0.0002, Math.min(0.007, T * 0.45), z * s, Math.PI / 2, s);   // the stick goes in the first
  vents(g, mat, 0.07 * s, 0.005 * s, 10, { x: -W / 2 + 0.0013 * s, y: T * 0.5, z: -0.04 * s, ry: -Math.PI / 2 });
  const hinge = new THREE.Group(); hinge.position.set(0, T, -D / 2 + 0.004 * s); g.add(hinge);
  const barrel = mesh(new THREE.CylinderGeometry(0.0055 * s, 0.0055 * s, W * 0.8, 16), mat); barrel.rotation.z = Math.PI / 2; hinge.add(barrel);
  const lid = mesh(rbox(W, 0.008 * s, D, 0.007 * s, 3), mat, 0, 0.004 * s, D / 2); hinge.add(lid);
  // the bezel inside the lid: black, a webcam, the matte panel and its glass
  const bez = mesh(new THREE.PlaneGeometry(W - 0.006 * s, D - 0.006 * s), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.45 }), 0, -0.0003 * s, D / 2); bez.rotation.x = Math.PI / 2; hinge.add(bez);
  const cam = mesh(new THREE.CircleGeometry(0.0022 * s, 12), new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.1, metalness: 0.5 }), 0, -0.0005 * s, D * 0.97); cam.rotation.x = Math.PI / 2; hinge.add(cam);
  const sw = W - 0.03 * s, sh = D - 0.035 * s;
  const scr = mesh(screenQuad(sw, sh), null, 0, -0.0012 * s, D / 2 + 0.003 * s); scr.rotation.x = Math.PI / 2; hinge.add(scr);
  const gl = glassOver(scr, sw + 0.006 * s, sh + 0.006 * s, 0, 0.0005 * s, { matte: true }); hinge.add(gl);
  const logo = decal(0.04 * s, 0.04 * s, 'lid-face', (x, w, h) => {
    const r = w * 0.38, k = Math.sqrt(3) / 2; x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(w / 2 - r, h * 0.3); x.lineTo(w / 2 + r, h * 0.3); x.lineTo(w / 2, h * 0.3 + 2 * r * k); x.closePath(); x.fill();
    x.fillStyle = '#000'; x.fillRect(w * 0.38, h * 0.38, w * 0.06, h * 0.12); x.fillRect(w * 0.56, h * 0.38, w * 0.06, h * 0.12);
  }, { emissive: true });
  logo.rotation.x = -Math.PI / 2; logo.position.set(0, 0.0085 * s, D / 2 + 0.01 * s); hinge.add(logo);
  const pl = led(g, 0.0012 * s, 0xffffff, W * 0.43, T * 0.55, D / 2 - 0.0008 * s, 3);
  bake(g, [set.keys, hinge, pl]);
  bake(hinge, [scr, logo, gl]);
  let open = 0.9, target = 0.9, vel = 0, br = 0;
  const col = new THREE.Color();
  return {
    g, screens: [{ mesh: scr, w: sw, h: sh }], kind: 'laptop', size: 0.2 * s, keys: set.keys,
    flip() { target = target > 0.5 ? 0.08 : 0.92; },
    tick(dt, fx) {
      vel += ((target - open) * 260 - vel * 18) * dt; open += vel * dt; hinge.rotation.x = -open * 1.92;
      glow(set, fx, col); logo.material.emissiveIntensity = 0.4 + 1.2 * fx.kick * fx.alive;
      br += dt; const k = open < 0.2 ? 0.5 + 0.5 * Math.sin(br * 3) : 1; lit(pl, k, k, k, 2.5);   // sleeping, it breathes
    },
  };
}

// ---------------- a studio monitor: a woofer you can see into, a waveguide tweeter, a port, an amp plate on the back ----------------
export function speaker(s = 1) {
  const R = rng(Math.round(s * 77)), g = new THREE.Group(), W = 0.19 * s, H = 0.3 * s, D = 0.22 * s;
  const cab = plastic(0x232427, 0.62, { age: 0, dust: 0.65, wear: 0.55, grain: 2.2, seed: R() * 9 });       // vinyl wrap: a coarser grain
  const baffleM = plastic(0x161618, 0.4, { age: 0, dust: 0.5, wear: 0.4, seed: R() * 9 });
  const wy = H * 0.36, wz = D / 2, ty = H * 0.76, bt = 0.022 * s;
  g.add(mesh(rbox(W, H, D - bt, 0.012 * s, 3), cab, 0, H / 2, -bt / 2));
  // the baffle: a thick front with the drivers and the port let into it
  const bf = rrShape(W - 0.006 * s, H - 0.006 * s, 0.03 * s, 0, H / 2); bf.holes.push(circle(0.0645 * s, 0, wy), circle(0.035 * s, 0, ty), rrPath(W * 0.5, 0.016 * s, 0.007 * s, 0, H * 0.07));
  const bg = ext(bf, bt - 0.006 * s, 0.003 * s, 2, 24); bg.translate(0, 0, -(bt - 0.003 * s)); g.add(mesh(bg, baffleM, 0, 0, wz));
  g.add(mesh(new THREE.CylinderGeometry(0.0645 * s, 0.0645 * s, bt, 40, 1, true).rotateX(Math.PI / 2), hole(), 0, wy, wz - bt / 2));
  g.add(mesh(new THREE.BoxGeometry(W * 0.5, 0.016 * s, 0.002 * s), hole(), 0, H * 0.07, wz - bt + 0.002 * s));
  // the woofer: a trim ring with screws, a rubber surround, the cone (coated paper), the dust cap; sunk into the baffle
  g.add(mesh(lathe([[0.072 * s, 0], [0.076 * s, 0.002 * s], [0.074 * s, 0.005 * s], [0.066 * s, 0.005 * s], [0.064 * s, 0]], 48).rotateX(Math.PI / 2), metal(0x8a8d93, 0.38), 0, wy, wz));
  screws(g, [0, 1, 2, 3].map((i) => { const a = i / 4 * TAU + Math.PI / 4; return [Math.cos(a) * 0.07 * s, wy + Math.sin(a) * 0.07 * s, wz + 0.005 * s]; }), 0.0022 * s, metal(0x55575c, 0.4));
  const cone = lathe([[0.064 * s, 0], [0.062 * s, -0.004 * s], [0.058 * s, -0.003 * s], [0.054 * s, -0.007 * s], [0.04 * s, -0.016 * s], [0.026 * s, -0.026 * s], [0.022 * s, -0.028 * s]], 48); cone.rotateX(Math.PI / 2);
  const woof = new THREE.Group(); woof.position.set(0, wy, wz); woof.scale.z = 0.7; g.add(woof);
  woof.add(mesh(cone, age(new THREE.MeshStandardMaterial({ color: 0x6b6d70, roughness: 0.6, side: THREE.DoubleSide }), { age: 0, dust: 0.6, wear: 0, grain: 4, seed: 2 })));   // woven glass fibre
  const capG = new THREE.SphereGeometry(0.026 * s, 24, 6, 0, TAU, 0, Math.PI / 3.4); capG.rotateX(Math.PI / 2);
  woof.add(mesh(capG, new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.18 }), 0, 0, -0.0485 * s));
  woof.add(mesh(new THREE.TorusGeometry(0.0625 * s, 0.0035 * s, 6, 40), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.7 }), 0, 0, -0.0015 * s));   // the rubber surround
  // the tweeter: a shallow waveguide and a silk dome behind a little grille
  g.add(mesh(lathe([[0.038 * s, 0], [0.034 * s, -0.003 * s], [0.02 * s, -0.01 * s], [0.012 * s, -0.012 * s], [0, -0.012 * s]], 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.25, metalness: 0.3, side: THREE.DoubleSide }), 0, ty, wz + 0.0005 * s));
  const dome = mesh(new THREE.SphereGeometry(0.0115 * s, 16, 6, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.75 }), 0, ty, wz - 0.012 * s); dome.rotation.x = Math.PI / 2; g.add(dome);
  // the port: a flared slot at the bottom

  const logo = decal(0.05 * s, 0.01 * s, 'spk-logo', (x, w, h) => badge(x, w, h, 'ILMC  M5', { fg: '#c8c9cc', weight: '700' }), { metal: 0.8, rough: 0.3 });
  logo.position.set(0, H * 0.94, wz + 0.0006 * s); g.add(logo);
  const l = led(g, 0.0022 * s, 0x33ff55, W * 0.34, H * 0.94, wz + 0.0005 * s);
  // the back: an amp plate with heatsink fins, a volume knob, inputs, the power inlet and a label
  const back = -D / 2 + 0.0005 * s;      // the cabinet runs from -D/2 to the baffle
  g.add(mesh(rbox(W * 0.7, H * 0.55, 0.004 * s, 0.004 * s, 1), metal(0x2a2b2f, 0.45), 0, H * 0.4, back - 0.002 * s));
  for (let i = 0; i < 8; i++) g.add(mesh(new THREE.BoxGeometry(0.002 * s, H * 0.22, 0.012 * s), metal(0x2a2b2f, 0.45), -W * 0.3 + i * W * 0.085, H * 0.56, back - 0.009 * s));
  g.add(mesh(lathe([[0, 0], [0.011 * s, 0], [0.011 * s, 0.0115 * s], [0.009 * s, 0.0135 * s], [0, 0.0135 * s]], 20).rotateX(-Math.PI / 2), hole(), -W * 0.18, H * 0.3, back - 0.004 * s));
  ports(g, ['in', 'in'], W * 0.08, H * 0.3, back - 0.004 * s, Math.PI, s);
  iec(g, W * 0.1, H * 0.18, back - 0.004 * s, s, Math.PI);
  bake(g, [woof, l]);
  return { g, screens: [], kind: 'speaker', size: H, tick(dt, fx) { woof.position.z = wz + (fx.low * 0.01 + fx.kick * 0.007) * s * fx.alive; const k = 0.4 + Math.min(1, fx.level * 2); lit(l, 0.15 * k, k, 0.25 * k, 6); } };
}

// ---------------- a beige tower: bays with real recesses, a working DVD tray, buttons and lights; ports and a PSU behind ----------------
export function tower(seed = 1, s = 1) {
  const R = rng(seed * 5 + 11), g = new THREE.Group(), W = 0.19 * s, H = 0.42 * s, D = 0.43 * s, beige = beigeOf(R), bay = beigeOf(R, { age: 0.75, yellow: 0xd9b56a });
  // the chassis (sheet steel painted beige) and the moulded front bezel, with the gap between them
  g.add(mesh(rbox(W, H - 0.01 * s, D - 0.034 * s, 0.004 * s, 2), beige, 0, H / 2 + 0.003 * s, -0.013 * s));   // its back stops short, so the back panel's parts sit within the case's outline
  // the drive bays: three 5.25" openings (the top one is the DVD drive), a 3.5" with the floppy, the power button's well;
  // the bezel is moulded round them, so each opening has real depth
  const front = D / 2, fz = front - 0.026 * s, bw = W * 0.8, bh = 0.042 * s, top = H - 0.05 * s, fy = top - 3 * 0.048 * s + 0.004 * s, py = H * 0.4;
  const openings = [[bw, bh, 0, top], [bw, bh, 0, top - 0.048 * s], [bw, bh, 0, top - 0.096 * s], [W * 0.5, 0.026 * s, W * 0.12, fy], [0.032 * s, 0.032 * s, -W * 0.26, py]];
  const face = rrShape(W - 0.004 * s, H - 0.004 * s, 0.01 * s, 0, H / 2); for (const [w, h, x, y] of openings) face.holes.push(rrPath(w, h, 0.002 * s, x, y));
  const fg = ext(face, 0.022 * s, 0.002 * s, 2); fg.translate(0, 0, -0.024 * s); g.add(mesh(fg, beige, 0, 0, front));
  g.add(mesh(rbox(W * 0.99, H * 0.99, 0.004 * s, 0.006 * s, 1), hole(), 0, H / 2, fz - 0.002 * s));       // the gap behind the bezel
  for (const [w, h, x, y] of openings) g.add(mesh(new THREE.BoxGeometry(w, h, 0.002 * s), hole(), x, y, front - 0.016 * s));
  const blank = (w, h, x, y) => { g.add(mesh(rbox(w * 0.99, h * 0.96, 0.004 * s, 0.0015 * s, 1), bay, x, y, front - 0.005 * s)); g.add(mesh(new THREE.BoxGeometry(w * 0.3, h * 0.1, 0.002 * s), hole(), x, y - h * 0.3, front - 0.0025 * s)); };
  blank(bw, bh, 0, top - 0.048 * s); blank(bw, bh, 0, top - 0.096 * s);
  // the DVD drive's face: a tray slot (the tray's own front closes it), the eject button
  g.add(mesh(frame(bw * 0.99, bh * 0.96, 0.0015 * s, W * 0.66, 0.012 * s, 0.001 * s, 0.003 * s, 0.0005 * s, 0, 0.004 * s, 1), bay, 0, top, front - 0.0035 * s));
  g.add(mesh(rbox(0.014 * s, 0.006 * s, 0.004 * s, 0.002 * s), bay, W * 0.3, top - 0.012 * s, front - 0.004 * s));
  // the floppy: its face, the slot with its flap, the eject button
  g.add(mesh(rbox(W * 0.49, 0.025 * s, 0.004 * s, 0.0015 * s), bay, W * 0.12, fy, front - 0.005 * s));
  g.add(mesh(new THREE.BoxGeometry(W * 0.34, 0.004 * s, 0.002 * s), hole(), W * 0.08, fy + 0.003 * s, front - 0.0028 * s));
  g.add(mesh(rbox(0.012 * s, 0.005 * s, 0.004 * s, 0.002 * s), bay, W * 0.3, fy - 0.007 * s, front - 0.003 * s));
  // power and reset, the two lights, the key lock, a model plate
  g.add(mesh(rbox(0.028 * s, 0.028 * s, 0.012 * s, 0.006 * s, 2), bay, -W * 0.26, py, front));
  g.add(mesh(rbox(0.01 * s, 0.006 * s, 0.004 * s, 0.002 * s), bay, W * 0.05, py - 0.012 * s, front));
  const leds = [0x44ff66, 0xffaa22].map((c, i) => led(g, 0.0022 * s, c, -W * 0.06 + i * 0.02 * s, py + 0.006 * s, front + 0.0004 * s));
  g.add(mesh(new THREE.CylinderGeometry(0.0055 * s, 0.0055 * s, 0.004 * s, 20).rotateX(Math.PI / 2), metal(0xc9b680, 0.3), W * 0.3, py + 0.004 * s, front + 0.001 * s));
  g.add(mesh(new THREE.BoxGeometry(0.0015 * s, 0.006 * s, 0.001 * s), hole(), W * 0.3, py + 0.004 * s, front + 0.0032 * s));
  const plate = decal(W * 0.6, 0.03 * s, `tower-plate-${seed % 2}`, (x, w, h) => {
    x.fillStyle = 'rgba(60,55,45,.75)'; x.font = `${Math.round(h * 0.34)}px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillText('POWER', w * 0.0, h * 0.2); x.fillText('HDD', w * 0.39, h * 0.2); x.fillText('RESET', w * 0.55, h * 0.95);
    const st = (sx, a, b, t) => { x.fillStyle = a; x.beginPath(); x.roundRect(sx, h * 0.45, w * 0.24, h * 0.5, 3); x.fill(); x.fillStyle = b; x.font = `bold ${Math.round(h * 0.3)}px ${FONT}`; x.textAlign = 'center'; x.fillText(t, sx + w * 0.12, h * 0.72); };
    st(w * 0.72, '#1f3fbf', '#fff', seed % 2 ? 'TURBO' : 'MMX');
  });
  plate.position.set(W * 0.0, py - 0.022 * s, front + 0.0005 * s); g.add(plate);
  vents(g, beige, W * 0.7, H * 0.16, 9, { vertical: false, x: 0, y: H * 0.13, z: front + 0.0004 * s });
  // the side: the panel's seam, its thumb screws round the back
  g.add(mesh(new THREE.BoxGeometry(0.001 * s, H * 0.96, 0.002 * s), hole(), W / 2 + 0.0002 * s, H / 2, fz - 0.004 * s));
  // the back: PSU with a fan grille, its switch and inlet, the I/O shield, the slot covers, thumbscrews, the label
  const bz = -D / 2 + 0.0038 * s, back = Math.PI;
  g.add(mesh(rbox(W * 0.9, 0.08 * s, 0.003 * s, 0.002 * s), metal(0xa9aaa6, 0.5), 0, H - 0.05 * s, bz - 0.001 * s));
  const grille = decal(0.07 * s, 0.07 * s, 'psu-grille', (x, w, h) => { x.strokeStyle = '#1a1a1a'; x.lineWidth = 6; for (let r = w * 0.08; r < w * 0.48; r += w * 0.07) { x.beginPath(); x.arc(w / 2, h / 2, r, 0, TAU); x.stroke(); } x.lineWidth = 5; for (let a = 0; a < 4; a++) { x.beginPath(); x.moveTo(w / 2, h / 2); x.lineTo(w / 2 + Math.cos(a * Math.PI / 2 + 0.78) * w * 0.48, h / 2 + Math.sin(a * Math.PI / 2 + 0.78) * h * 0.48); x.stroke(); } }, { metal: 0.6, rough: 0.4 });
  grille.rotation.y = back; grille.position.set(-W * 0.18, H - 0.05 * s, bz - 0.0028 * s); g.add(grille);
  g.add(mesh(new THREE.CircleGeometry(0.034 * s, 24), hole(), -W * 0.18, H - 0.05 * s, bz - 0.0026 * s).rotateY(back));
  iec(g, W * 0.22, H - 0.035 * s, bz - 0.001 * s, s, back);
  g.add(mesh(rbox(0.012 * s, 0.008 * s, 0.004 * s, 0.001 * s), new THREE.MeshStandardMaterial({ color: 0x8a1c1c, roughness: 0.5 }), W * 0.22, H - 0.065 * s, bz - 0.002 * s));
  g.add(mesh(rbox(W * 0.6, 0.11 * s, 0.002 * s, 0.001 * s), metal(0xbfc0bc, 0.45), -W * 0.12, H * 0.62, bz - 0.001 * s));
  ports(g, ['kb', 'ms'], -W * 0.24, H * 0.66, bz - 0.0015 * s, back, s);
  ports(g, ['ser', 'par'], -W * 0.06, H * 0.62, bz - 0.0015 * s, back, s);
  ports(g, ['usb', 'usb'], -W * 0.24, H * 0.58, bz - 0.0015 * s, back, s);
  for (let i = 0; i < 6; i++) g.add(mesh(rbox(0.016 * s, 0.1 * s, 0.002 * s, 0.001 * s), metal(0xb2b3af, 0.5), W * 0.3 - i * 0.022 * s, H * 0.3, bz - 0.001 * s));
  ports(g, ['vga'], W * 0.3, H * 0.33, bz - 0.0015 * s, back, s);
  ports(g, ['in', 'out', 'mic'], W * 0.256, H * 0.24, bz - 0.0015 * s, back, s);
  screws(g, [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([x, y]) => [x * W * 0.44, H / 2 + y * H * 0.44, bz - 0.002 * s, back]), 0.004 * s, metal(0x9a9b98, 0.4));
  const lb = decal(0.08 * s, 0.04 * s, 'rating-tower', (x, w, h) => rating(x, w, h, { model: 'ILMC P5-233', power: '115/230V~ 6/3A 60/50Hz', made: 'ASSEMBLED IN USA', seed: 8 }), { rough: 0.8 });
  lb.rotation.y = back; lb.position.set(W * 0.1, H * 0.13, bz - 0.001 * s); g.add(lb);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.CylinderGeometry(0.009 * s, 0.011 * s, 0.006 * s, 12), hole(), x * W * 0.38, 0.003 * s, z * D * 0.4));
  // the DVD drive: a tray that slides out, a disc on it, the drive's own face plate and eject button
  const zc = front - 0.079 * s, tray = new THREE.Group(); tray.position.set(0, top, zc); g.add(tray);
  tray.add(mesh(rbox(W * 0.63, 0.005 * s, 0.15 * s, 0.002 * s, 1), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.55 }), 0, 0.003 * s, 0));
  tray.add(mesh(new THREE.CylinderGeometry(0.058 * s, 0.058 * s, 0.001 * s, 40), new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.6 }), 0, 0.0055 * s, -0.005 * s));
  tray.add(mesh(rbox(W * 0.655, 0.0115 * s, 0.004 * s, 0.001 * s), bay, 0, 0.004 * s, 0.077 * s));
  const tl = led(g, 0.0013 * s, 0x44ff66, W * 0.2, top - 0.012 * s, front - 0.0018 * s, 4);
  const disc = cd(0.95 * s); disc.position.set(0, 0.0035 * s, -0.005 * s); tray.add(disc);
  bake(g, [tray, tl, ...leds]);
  bake(tray, [disc]);
  const pump = new Pump(); pump.x = pump.target = 0;
  let spin = 0;
  return { g, screens: [], kind: 'tower', size: H, pump, tray,
    tick(dt, fx) {
      const hdd = fx.hat > 0.3 || Math.random() < fx.mid * 0.5; lit(leds[1], hdd ? 1 : 0.05, hdd ? 0.6 : 0.03, 0.05, 6); lit(leds[0], 0.3, 1, 0.4, 5);
      const o = pump.step(dt); tray.position.z = zc + Math.max(-0.01, o) * 0.15 * s; spin += dt * (4 + 30 * fx.level); disc.rotation.y = spin;
      const b = o > 0.2 ? 1 : 0.1; lit(tl, 0.3 * b, b, 0.4 * b, 4);
    } };
}

// ---------------- an iMac G3: a translucent candy shell with the works visible inside, white front, handle, vents ----------------
export function imac(color = 0x1c9ad6, s = 1) {
  const R = rng(color % 997), g = new THREE.Group();
  const shell = age(new THREE.MeshPhysicalMaterial({ color, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.66, side: THREE.DoubleSide, depthWrite: false }), { age: 0, dust: 0.5, wear: 0.5, grain: 0.4, seed: R() * 9 });
  const ice = age(new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 }), { age: 0.15, dust: 0.45, wear: 0.6, yellow: 0xeedca8, seed: R() * 9 });
  const [side, cap] = taper(0.37 * s, 0.34 * s, 0.07 * s, 0.24 * s, 0.24 * s, 0.1 * s, 0.3 * s, -0.02 * s);
  for (const geo of [side, cap]) g.add(mesh(geo, shell, 0, 0.215 * s, 0.1 * s));
  // inside, seen through the shell: the tube's funnel and neck, the board, a shield, the fan-less vents' shadow
  const works = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.5 });
  g.add(mesh(lathe([[0.15 * s, 0], [0.12 * s, -0.08 * s], [0.04 * s, -0.17 * s], [0.025 * s, -0.24 * s], [0, -0.24 * s]], 24).rotateX(Math.PI / 2), works, 0, 0.225 * s, 0.07 * s));
  const b = board(0.2 * s, 0.12 * s, 77); b.rotation.x = -Math.PI / 2; b.position.set(0, 0.07 * s, -0.04 * s); g.add(b);
  g.add(mesh(new THREE.BoxGeometry(0.22 * s, 0.14 * s, 0.002 * s), metal(0x9a9c9e, 0.5), 0, 0.2 * s, -0.17 * s));
  // the white front: a deep bezel round the tube, the speaker grilles either side of the CD slot below it
  const sw = 0.25 * s, sh = 0.19 * s;
  // the coloured shell shows as a rim all round the white face, and in a band under the screen where the speakers are
  g.add(mesh(frame(0.37 * s, 0.34 * s, 0.07 * s, 0.33 * s, 0.305 * s, 0.055 * s, 0.03 * s, 0.006 * s), shell, 0, 0.215 * s, 0.124 * s));
  g.add(mesh(frame(0.336 * s, 0.31 * s, 0.056 * s, sw + 0.02 * s, sh + 0.02 * s, 0.018 * s, 0.03 * s, 0.006 * s, 0, 0.02 * s), ice, 0, 0.215 * s, 0.13 * s));
  g.add(mesh(rbox(0.3 * s, 0.035 * s, 0.004 * s, 0.012 * s, 2), shell, 0, 0.085 * s, 0.1305 * s));
  const scr = screen(g, sw, sh, 0.01 * s, 0, 0.235 * s, 0.105 * s, { glassW: sw + 0.022 * s, glassH: sh + 0.022 * s, gap: 0.0016 * s });
  const gr = decal(0.05 * s, 0.018 * s, 'imac-grille', (x, w, h) => { x.fillStyle = 'rgba(40,40,44,.85)'; for (let yy = 4; yy < h; yy += 8) for (let xx = 4 + (yy / 8 % 2) * 4; xx < w; xx += 8) { x.beginPath(); x.arc(xx, yy, 2.2, 0, TAU); x.fill(); } }, { rough: 0.5 });
  for (const sx of [-1, 1]) { const m = gr.clone(); m.position.set(sx * 0.1 * s, 0.085 * s, 0.1328 * s); g.add(m); }
  g.add(mesh(rbox(0.08 * s, 0.004 * s, 0.003 * s, 0.0015 * s), hole(), 0, 0.068 * s, 0.1305 * s));
  const logo = decal(0.022 * s, 0.026 * s, 'imac-logo', (x, w, h) => { x.fillStyle = '#4a4d54'; x.font = `${Math.round(h * 0.95)}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♥', w / 2, h / 2); }, { metal: 0.7, rough: 0.3 });
  logo.position.set(0, 0.104 * s, 0.1306 * s); g.add(logo);
  const pb = mesh(new THREE.CylinderGeometry(0.009 * s, 0.009 * s, 0.003 * s, 24).rotateX(Math.PI / 2), shell, 0.13 * s, 0.07 * s, 0.13 * s); g.add(pb);
  const l = led(g, 0.0018 * s, 0x66ff66, 0.13 * s, 0.07 * s, 0.1318 * s, 4);
  // handle, foot, and the port door on the side
  const handle = mesh(new THREE.TorusGeometry(0.05 * s, 0.009 * s, 10, 20, Math.PI), shell, 0, 0.34 * s, -0.06 * s); handle.rotation.x = -0.5; g.add(handle);
  g.add(mesh(rbox(0.16 * s, 0.035 * s, 0.07 * s, 0.015 * s), shell, 0, 0.05 * s, 0.11 * s));
  ports(g, ['usb', 'usb', 'in', 'out'], 0.168 * s, 0.13 * s, 0.0, Math.PI / 2, s);
  bake(g, [scr, l]);
  return { g, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'imac', size: 0.4 * s, tick(dt, fx) { const k = 0.6 + 0.4 * fx.kick; lit(l, 0.4 * k, k, 0.4 * k, 4); } };
}

// ---------------- a PlayStation 2 standing up: the ribbed half, the two-level front, the blue light ----------------
export function ps2(s = 1) {
  const R = rng(22), g = new THREE.Group(), body = new THREE.Group(); body.rotation.z = Math.PI / 2; body.position.y = 0.155 * s; g.add(body);
  const black = plastic(0x111215, 0.32, { age: 0, dust: 0.6, wear: 0.5, seed: R() * 9 }), matte = plastic(0x1a1b1f, 0.7, { age: 0, dust: 0.6, wear: 0.4, seed: R() * 9 });
  body.add(mesh(rbox(0.3 * s, 0.04 * s, 0.18 * s, 0.003 * s), black, 0, 0.02 * s, 0));
  body.add(mesh(rbox(0.3 * s, 0.036 * s, 0.172 * s, 0.003 * s), matte, 0, -0.019 * s, -0.004 * s));
  for (let i = 0; i < 9; i++) body.add(mesh(rbox(0.296 * s, 0.0022 * s, 0.168 * s, 0.0008 * s, 1), black, 0, -0.035 * s + i * 0.0035 * s, -0.004 * s));
  // the front: the tray (upper half), reset and eject, the two controller and two card ports below
  const fz = 0.0902 * s;
  body.add(mesh(rbox(0.19 * s, 0.009 * s, 0.002 * s, 0.001 * s), hole(), -0.04 * s, 0.022 * s, fz));
  body.add(mesh(rbox(0.186 * s, 0.006 * s, 0.003 * s, 0.001 * s), black, -0.04 * s, 0.022 * s, fz + 0.0006 * s));
  for (let i = 0; i < 2; i++) { body.add(mesh(rbox(0.014 * s, 0.009 * s, 0.004 * s, 0.002 * s), black, 0.08 * s + i * 0.022 * s, 0.024 * s, fz + 0.001 * s)); }
  for (let i = 0; i < 2; i++) { body.add(mesh(rbox(0.026 * s, 0.009 * s, 0.003 * s, 0.002 * s), hole(), -0.12 * s + i * 0.036 * s, -0.015 * s, fz - 0.003 * s)); body.add(mesh(rbox(0.018 * s, 0.004 * s, 0.003 * s, 0.001 * s), hole(), -0.12 * s + i * 0.036 * s, -0.026 * s, fz - 0.003 * s)); }
  const logo = decal(0.07 * s, 0.012 * s, 'ps2-logo', (x, w, h) => badge(x, w, h, 'GAMESTATION 2', { fg: '#7a7c84', weight: '600', italic: true }), { rough: 0.4 });
  logo.position.set(0.0 * s, -0.008 * s, fz + 0.0006 * s); body.add(logo);
  // the back: the fan grille, ports, the power inlet
  vents(body, black, 0.05 * s, 0.03 * s, 8, { x: 0.09 * s, y: 0.0, z: -0.0902 * s + 0.0013 * s, ry: Math.PI });
  const led1 = mesh(new THREE.BoxGeometry(0.004 * s, 0.018 * s, 0.002 * s), ledMat(0x2f6bff, 4), 0.13 * s, 0.022 * s, 0.0912 * s); body.add(led1);
  const led2 = mesh(new THREE.BoxGeometry(0.004 * s, 0.006 * s, 0.002 * s), ledMat(0x22ff66, 4), 0.13 * s, 0.006 * s, 0.0912 * s); body.add(led2);
  bake(g, [led1, led2]);
  return { g, screens: [], kind: 'ps2', size: 0.3 * s, tick(dt, fx) { lit(led1, 0.1, 0.3 + 0.7 * fx.low * fx.alive, 1, 4); lit(led2, 0.15, 1, 0.3, 3); } };
}

// ---------------- clutter: a floppy with a hand-written label, a two-button mouse with a wheel ----------------
const LABELS = ['STEMS', 'ilmc v13', 'DO NOT\nDELETE', 'girl EDM', 'samples', 'FMC final'];
export function floppy(color, s = 1) {
  const R = rng(color % 1000 + 1), g = new THREE.Group(), body = plastic(color, 0.42, { age: color === 0x1d1d1f ? 0 : 0.2, dust: 0.5, wear: 0.7, seed: R() * 9 });
  g.add(mesh(rbox(0.09 * s, 0.0033 * s, 0.093 * s, 0.0015 * s, 1), body, 0, 0.0017 * s, 0));
  // the shutter: brushed steel over a recessed track, the hub on the back, the write-protect notch
  g.add(mesh(new THREE.BoxGeometry(0.056 * s, 0.0004 * s, 0.032 * s), hole(), -0.006 * s, 0.0034 * s, -0.031 * s));
  g.add(mesh(new THREE.BoxGeometry(0.05 * s, 0.0007 * s, 0.031 * s), age(new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.3, metalness: 1 }), { age: 0, dust: 0.3, wear: 1, seed: R() * 9 }), -0.009 * s, 0.0037 * s, -0.031 * s));
  g.add(mesh(new THREE.BoxGeometry(0.012 * s, 0.0008 * s, 0.018 * s), hole(), -0.003 * s, 0.0039 * s, -0.033 * s));
  g.add(mesh(new THREE.BoxGeometry(0.005 * s, 0.0008 * s, 0.006 * s), hole(), 0.04 * s, 0.0034 * s, 0.04 * s));
  const n = Math.floor(R() * LABELS.length), lbl = decal(0.066 * s, 0.048 * s, `floppy-${n}`, (x, w, h) => {
    x.fillStyle = '#f2eee2'; x.fillRect(0, 0, w, h); ink(x, '#7a9ad8'); for (let i = 1; i < 6; i++) x.fillRect(0, h * (0.2 + i * 0.14), w, 1.5);
    ink(x, '#d22'); x.fillRect(0, h * 0.2, w, 2); x.fillStyle = '#1a2a8a'; x.font = `${Math.round(h * 0.18)}px "Comic Sans MS", "Segoe Print", cursive`; x.textAlign = 'center';
    LABELS[n].split('\n').forEach((l, i) => x.fillText(l, w / 2, h * (0.48 + i * 0.2)));
    x.fillStyle = 'rgba(120,100,60,.12)'; for (let i = 0; i < 12; i++) { x.beginPath(); x.arc(Math.random() * w, Math.random() * h, Math.random() * h * 0.25, 0, TAU); x.fill(); }
  }, { rough: 0.85, res: 256 });
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.00345 * s, 0.018 * s); g.add(lbl);
  bake(g, []);
  return g;
}
export function mouse(color) {
  const R = rng(color % 1000 + 3), g = new THREE.Group(), m = plastic(color, 0.38, { age: color > 0x888888 ? 0.45 : 0, dust: 0.4, wear: 0.9, seed: R() * 9 });
  const body = mesh(new THREE.SphereGeometry(0.03, 28, 12, 0, TAU, 0, Math.PI / 2), m); body.scale.set(1, 0.62, 1.65); g.add(body);
  g.add(mesh(new THREE.BoxGeometry(0.001, 0.003, 0.034), hole(), 0, 0.0172, -0.022));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.003, 0.0008), hole(), 0, 0.012, -0.006));
  const wheel = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.0045, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.75 }), 0, 0.0186, -0.022); wheel.rotation.z = Math.PI / 2; g.add(wheel);
  g.add(mesh(new THREE.TorusGeometry(0.06, 0.0022, 6, 24, Math.PI), plastic(0xe0ddd2, 0.5, { age: 0.3, dust: 0.5, wear: 0.4 }), 0, 0.003, -0.1));
  bake(g, []);
  return g;
}

// ---------------- small things ----------------
// a CD: the silvered side (iridescent), the clear hub ring, the printed label side
export function cd(s = 1) {
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({ color: 0xd8dde6, metalness: 1, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 900] });
  const disc = mesh(new THREE.RingGeometry(0.0165 * s, 0.06 * s, 48, 1), m); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.0012; g.add(disc);
  const hub = mesh(new THREE.RingGeometry(0.0075 * s, 0.0165 * s, 32, 1), new THREE.MeshStandardMaterial({ color: 0xc9d2d8, roughness: 0.15, metalness: 0.2 })); hub.rotation.x = -Math.PI / 2; hub.position.y = 0.00118; g.add(hub);
  const t = decalTex('cd-label', 1, 1, (x, w, h) => {
    x.fillStyle = '#efeeea'; x.beginPath(); x.arc(w / 2, h / 2, w / 2, 0, TAU); x.fill();
    x.fillStyle = '#1b1b1d'; x.font = `bold ${Math.round(h * 0.07)}px ${FONT}`; x.textAlign = 'center'; x.fillText('CD-R  700MB  80min', w / 2, h * 0.2);
    x.fillStyle = '#2b3fa0'; x.font = `${Math.round(h * 0.09)}px "Comic Sans MS", "Segoe Print", cursive`; x.fillText('FMC bounce 4', w / 2, h * 0.78);
    for (let i = 0; i < 3; i++) { x.strokeStyle = 'rgba(40,40,44,.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(w * 0.22, h * (0.84 + i * 0.04)); x.lineTo(w * 0.78, h * (0.84 + i * 0.04)); x.stroke(); }
  }, 256);
  const back = mesh(new THREE.RingGeometry(0.0165 * s, 0.06 * s, 48, 1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 })); back.rotation.x = Math.PI / 2; back.position.y = 0.0008; g.add(back);
  const uv = back.geometry.attributes.uv, p = back.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (0.12 * s), 0.5 + p.getY(i) / (0.12 * s));
  return g;
}
// a jewel case: clear lid and back, a dark tray with the hub rosette, a paper insert under the lid, the hinge down one side
export function jewelCase() {
  const g = new THREE.Group(), R = Math.random;
  const clear = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.22, depthWrite: false });
  g.add(mesh(rbox(0.142, 0.0024, 0.125, 0.001, 1), clear, 0, 0.0092, 0));
  const tray = plastic(0x18181a, 0.35, { age: 0, dust: 0.4, wear: 0.4 });
  g.add(mesh(rbox(0.138, 0.006, 0.122, 0.0008, 1), tray, 0.001, 0.0035, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, 12), tray, 0.003, 0.0072, 0));
  g.add(mesh(new THREE.BoxGeometry(0.006, 0.01, 0.125), clear, -0.068, 0.005, 0));
  const covers = [['#ff4fa3', '#fff', 'mix 1'], ['#2f6fe8', '#ffe10a', 'FMC'], ['#fff04a', '#111', 'stems'], ['#141414', '#eee', 'girl EDM']], k = Math.floor(R() * covers.length), [bg, fg, txt] = covers[k];
  const ins = decal(0.12, 0.12, 'jewel-' + k, (x, w, h) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = `italic bold ${Math.round(h * 0.14)}px "Times New Roman", serif`; x.textAlign = 'center'; x.fillText(txt, w / 2, h * 0.56); x.font = `${Math.round(h * 0.05)}px ${FONT}`; x.fillText('ILMC  2025', w / 2, h * 0.9); }, { rough: 0.6, res: 256 });
  ins.material.transparent = false; ins.material.depthWrite = true; ins.rotation.x = -Math.PI / 2; ins.position.set(0.003, 0.0078, 0); g.add(ins);
  bake(g, []);
  return g;
}
// the USB stick in the laptop: a glossy body, the steel plug, a lanyard ring, and an activity light that blooms
export function usbStick(color = 0xff4fa3) {
  const g = new THREE.Group();
  const body = mesh(rbox(0.048, 0.009, 0.018, 0.004, 2), age(new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8 }), { age: 0, dust: 0.3, wear: 0.8 }), 0.024 + 0.006, 0, 0); g.add(body);
  g.add(mesh(new THREE.BoxGeometry(0.013, 0.0045, 0.012), steel(), 0.0005, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(0.009, 0.0012, 0.008), hole(), 0.0005, 0.0012, 0));
  const lm = new THREE.MeshBasicMaterial({ color: 0x55ff99 });                    // index.js sets its colour each frame; lit well past white here
  lm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= 6.0;\n#include <opaque_fragment>'); };
  lm.customProgramCacheKey = () => 'led6';
  const led = mesh(new THREE.BoxGeometry(0.004, 0.001, 0.003), lm, 0.045, 0.0048, 0); g.add(led);
  g.add(mesh(new THREE.TorusGeometry(0.004, 0.0012, 6, 14), steel(), 0.054, 0, 0));
  return { g, led };
}
// a flip phone: two halves with a hinge barrel, a little outer display, a keypad, the inner screen with its glass
export function flipPhone(s = 1) {
  const g = new THREE.Group(), W = 0.05 * s, L = 0.09 * s, T = 0.01 * s;
  const paint = age(new THREE.MeshPhysicalMaterial({ color: 0xc9cfd9, roughness: 0.3, metalness: 0.75, clearcoat: 0.7, clearcoatRoughness: 0.2 }), { age: 0, dust: 0.3, wear: 1 });
  g.add(mesh(rbox(W, T, L, 0.004 * s, 2), paint, 0, T / 2, 0));
  const pad = decal(W * 0.84, L * 0.62, 'phone-keys', (x, w, h) => {
    x.fillStyle = '#20232a'; x.fillRect(0, 0, w, h);
    const k = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    x.fillStyle = '#c4cad4'; x.beginPath(); x.ellipse(w / 2, h * 0.12, w * 0.16, h * 0.08, 0, 0, TAU); x.fill();
    k.forEach((t, i) => { const cx = w * (0.2 + (i % 3) * 0.3), cy = h * (0.3 + Math.floor(i / 3) * 0.17); x.fillStyle = '#c4cad4'; x.beginPath(); x.roundRect(cx - w * 0.12, cy - h * 0.06, w * 0.24, h * 0.12, 8); x.fill(); x.fillStyle = '#1a1c22'; x.font = `bold ${Math.round(h * 0.07)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, cx, cy); });
  }, { rough: 0.35, res: 256 });
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, T + 0.0002, L * 0.06); g.add(pad);
  const hinge = new THREE.Group(); hinge.position.set(0, T, -L / 2); g.add(hinge);
  const barrel = mesh(new THREE.CylinderGeometry(0.0045 * s, 0.0045 * s, W * 0.98, 16), paint, 0, 0, 0.0045 * s); barrel.rotation.z = Math.PI / 2; hinge.add(barrel);
  hinge.add(mesh(rbox(W, T, L, 0.004 * s, 2), paint, 0, T / 2, L / 2));
  const inner = mesh(new THREE.PlaneGeometry(W * 0.88, L * 0.8), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.4 }), 0, -0.0002, L * 0.52); inner.rotation.x = Math.PI / 2; hinge.add(inner);
  const scr = mesh(screenQuad(W * 0.8, L * 0.55), null, 0, -0.0005, L * 0.55); scr.rotation.x = Math.PI / 2; hinge.add(scr);
  const gl = glassOver(scr, W * 0.84, L * 0.6, 0, 0.0003, {}); hinge.add(gl);
  const outer = mesh(new THREE.PlaneGeometry(W * 0.5, L * 0.22), new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, roughness: 0.05, clearcoat: 1 }), 0, T + 0.0002, L * 0.66); outer.rotation.x = -Math.PI / 2; hinge.add(outer);
  bake(hinge, [scr, gl]); bake(g, [hinge]);
  let open = 1, target = 1, vel = 0;
  return { g, screens: [{ mesh: scr, w: W * 0.8, h: L * 0.55 }], kind: 'phone', size: 0.02, flip() { target = target > 0.5 ? 0 : 1; },
    tick(dt) { vel += ((target - open) * 400 - vel * 22) * dt; open += vel * dt; hinge.rotation.x = -open * 2.8; } };
}
// ---------------- the deck's mods: a board and a fan bolted to its side, capacitors and stickers on top, a VFD ----------------
function sticker(draw, w, h, key) {
  const m = decal(w, h, key, draw, { rough: 0.3, res: 256 }); m.material.polygonOffsetFactor = -2; return m;
}
const die = (x, w, h, r = 20) => { x.fillStyle = '#f4f2ec'; x.beginPath(); x.roundRect(2, 2, w - 4, h - 4, r); x.fill(); };     // the white die-cut border
export function deckMods(drawFace, CX) {
  const g = new THREE.Group();
  const side = new THREE.Group(); side.position.set(-0.1865, -0.046, 0); side.rotation.y = -Math.PI / 2; g.add(side);
  const b = board(0.34, 0.066, 31, null, true); side.add(b);
  const f = fan(0.06, plastic(0x161618, 0.5, { age: 0, dust: 0.7, wear: 0.5 }), 0.014); f.g.position.set(-0.06, 0.0, 0.0015 + 0.014 + 0.06 * 0.14); side.add(f.g);
  const capMat = new THREE.MeshStandardMaterial({ color: 0xe0501c, roughness: 0.42 }), capTop = metal(0xc9ccd0, 0.3);
  const cap = (parent, x, y, z, r, h) => { parent.add(mesh(lathe([[0, 0], [r, 0], [r * 1.05, h * 0.1], [r * 1.05, h * 0.92], [r * 0.95, h], [0, h]], 18), capMat, x, y - h / 2, z)); parent.add(mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.0008, 18), capTop, x, y + h / 2 + 0.0002, z)); };
  for (let i = 0; i < 5; i++) { const c = new THREE.Group(); c.position.set(0.04 + i * 0.022, 0.045, 0.012); side.add(c); cap(c, 0, 0, 0, 0.0085, 0.024); }
  for (let i = 0; i < 3; i++) cap(g, -0.17 + (i % 2) * 0.018, -0.012, -0.13 - i * 0.012, 0.0075, 0.02);
  const face = sticker((x, w, h) => { die(x, w, h, w * 0.5); drawFace(x, w / 2, h * 0.42, w * 0.38, {}); }, 0.05, 0.05, 'stk-face');
  face.rotation.set(-Math.PI / 2, 0, 0.3); face.position.set(-0.16, -0.0215, 0.115); g.add(face);
  const ilmc = sticker((x, w, h) => { die(x, w, h, 24); x.fillStyle = '#ff4fa3'; x.beginPath(); x.roundRect(10, 10, w - 20, h - 20, 16); x.fill(); x.fillStyle = '#fff'; x.font = '900 70px Orbitron, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ILMC', w / 2, h / 2 + 4, w - 40); }, 0.06, 0.026, 'stk-ilmc');
  ilmc.rotation.set(-Math.PI / 2, 0, -0.2); ilmc.position.set(0.215, -0.0215, 0.135); g.add(ilmc);
  const name = sticker((x, w, h) => { x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '900 46px Orbitron, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('NINAJIRACHI', w / 2, h / 2, w - 16); }, 0.12, 0.022, 'stk-name');
  name.position.set(0.12, -0.046, 0.1915); g.add(name);
  const heart = sticker((x, w, h) => { die(x, w, h, w * 0.5); x.fillStyle = '#46c8ff'; x.font = '180px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♥', w / 2, h / 2 + 10); }, 0.03, 0.03, 'stk-heart');
  heart.rotation.set(-Math.PI / 2, 0, 0.5); heart.position.set(-0.13, -0.0214, 0.135); g.add(heart);
  const k = kandi(55, 0.9); k.position.set(-0.14, -0.022, -0.155); g.add(k);
  // the VFD strip in front of the pitch slider: a smoked window in a black surround, its glass over the picture
  const vfd = mesh(screenQuad(0.11, 0.02), null, 0.165, -0.0207, 0.174); vfd.rotation.x = -Math.PI / 2; g.add(vfd);
  g.add(mesh(rbox(0.12, 0.0016, 0.028, 0.0007, 1), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.3 }), 0.165, -0.0222, 0.174));
  const vg = glassOver(vfd, 0.114, 0.024, 0, 0.0004, {}); g.add(vg);
  bake(side, [f.g]); bake(g, [side, f.g, k, vfd, vg]);
  let spin = 0;
  return { g, fan: f, screens: [{ mesh: vfd, w: 0.11, h: 0.02, fixed: 17, band: 70 / 288 }], tick(dt, fx) { spin += dt * (3 + 50 * fx.low * fx.alive); f.set(spin); } };
}
