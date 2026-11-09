// The quality pass: the room's machines rebuilt with real shapes (tapered CRT housings, recessed bezels with a
// chamfered lip, laid-out keyboards) and painted detail (front panels, vents, badges, labels) as decals.
// Same interface as models.js, so the room, the lights and the physics need no changes.
import * as THREE from 'three';
import { MAT, crusty, rbox, mesh, screenQuad, fan, board, cd, keyMaterial, KEYCOL, rng, Pump } from './models.js';

const TAU = Math.PI * 2;

// ---------------- shapes ----------------
function rrShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2; r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function rrPath(w, h, r, cx = 0, cy = 0) { const p = new THREE.Path(); p.setFromPoints(rrShape(w, h, r, cx, cy).getPoints(10).reverse()); return p; }
// a front shell with an opening: outer rounded rect, inner hole, extruded toward -z, with a bevel that reads as a chamfered lip
function frame(ow, oh, or, iw, ih, ir, depth, bevel, ix = 0, iy = 0) {
  const s = rrShape(ow, oh, or); s.holes.push(rrPath(iw, ih, ir, ix, iy));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -depth); return g;
}
// a tapered rounded housing: front face w0 x h0 at z = 0, back face w1 x h1 at z = -d (CRT backs). Side + back cap.
function taper(w0, h0, r0, w1, h1, r1, d, dy = 0) {
  const ring = (w, h, r) => rrShape(w, h, r).getPoints(8);
  const a = ring(w0, h0, r0), b = ring(w1, h1, r1), n = Math.min(a.length, b.length), pos = [];
  const A = a.slice(0, n), B = b.slice(0, n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, p0 = [A[i].x, A[i].y, 0], p1 = [A[j].x, A[j].y, 0], q0 = [B[i].x, B[i].y + dy, -d], q1 = [B[j].x, B[j].y + dy, -d];
    pos.push(...p0, ...q0, ...p1, ...p1, ...q0, ...q1);
  }
  const side = new THREE.BufferGeometry(); side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); side.computeVertexNormals();
  const cap = new THREE.ShapeGeometry(rrShape(w1, h1, r1, 0, dy), 8); cap.rotateY(Math.PI); cap.translate(0, 0, -d);
  return [side, cap];
}
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ---------------- painted detail ----------------
const decalCache = new Map();
function decal(w, h, key, draw, { rough = 0.55, metal = 0, emissive = false, res = 512 } = {}) {
  let t = decalCache.get(key);
  if (!t) {
    const c = document.createElement('canvas'); c.width = Math.round(res * Math.min(1, w / h)); c.height = Math.round(res * Math.min(1, h / w));
    draw(c.getContext('2d'), c.width, c.height);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; decalCache.set(key, t);
  }
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: rough, metalness: metal, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  if (emissive) { m.emissiveMap = t; m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = 0.6; }
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}
const ink = (x, c) => { x.fillStyle = c; x.strokeStyle = c; };
function vents(x, w, h, n, col = 'rgba(0,0,0,.72)', vertical = false) {     // moulded slots
  ink(x, col); const r = Math.min(w, h) * 0.02;
  for (let i = 0; i < n; i++) {
    if (vertical) { const sx = w * (0.08 + 0.84 * i / (n - 1)); x.beginPath(); x.roundRect(sx - w * 0.012, h * 0.08, w * 0.024, h * 0.84, r); x.fill(); }
    else { const sy = h * (0.12 + 0.76 * i / (n - 1)); x.beginPath(); x.roundRect(w * 0.06, sy - h * 0.02, w * 0.88, h * 0.04, r); x.fill(); }
  }
  ink(x, 'rgba(255,255,255,.18)');
  for (let i = 0; i < n; i++) { if (vertical) { const sx = w * (0.08 + 0.84 * i / (n - 1)) + w * 0.013; x.fillRect(sx, h * 0.08, w * 0.004, h * 0.84); } else { const sy = h * (0.12 + 0.76 * i / (n - 1)) + h * 0.022; x.fillRect(w * 0.06, sy, w * 0.88, h * 0.006); } }
}
function badge(x, w, h, text, { fg = '#2b2b2e', font = 'bold', italic = false, rainbow = false } = {}) {
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `${italic ? 'italic ' : ''}${font} ${Math.round(h * 0.62)}px "Arial Narrow", Arial, Helvetica, sans-serif`;
  if (rainbow) { const g = x.createLinearGradient(0, 0, w, 0); ['#5ebd3e', '#ffb900', '#f78200', '#e23838', '#973999', '#009cdf'].forEach((c, i) => g.addColorStop(i / 5, c)); x.fillStyle = g; } else x.fillStyle = fg;
  x.fillText(text, w / 2, h * 0.54, w * 0.96);
}
// little parts
const button = (w, h, d, mat) => mesh(rbox(w, h, d, Math.min(w, h) * 0.25, 2), mat);
const ledMat = (c) => new THREE.MeshBasicMaterial({ color: c });

// ---------------- a CRT monitor (beige or platinum), or a black TV with knobs and a speaker grille ----------------
export function crt(seed = 1, s = 1, tv = false) {
  const R = rng(seed * 31 + 7), g = new THREE.Group(), mat = tv ? new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.45 }) : (seed % 2 ? MAT.beige() : MAT.platinum());
  const W = (tv ? 0.44 : 0.38) * s, H = (tv ? 0.34 : 0.33) * s, D = 0.045 * s, y0 = (tv ? 0.028 : 0.05) * s, cy = y0 + H / 2;
  const sw = W * (tv ? 0.66 : 0.76), sh = H * (tv ? 0.72 : 0.72), sx = tv ? -W * 0.1 : 0, sy = tv ? 0.004 * s : 0.018 * s;
  // the front shell, its opening chamfered in toward the tube
  const front = mesh(frame(W, H, 0.018 * s, sw + 0.014 * s, sh + 0.014 * s, 0.022 * s, D, 0.006 * s, sx, sy), mat, 0, cy, D / 2); g.add(front);
  const surround = mesh(rbox(sw + 0.02 * s, sh + 0.02 * s, 0.01 * s, 0.02 * s), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 }), sx, cy + sy, D / 2 - 0.024 * s); g.add(surround);
  const scr = mesh(screenQuad(sw, sh, 0.014 * s), null, sx, cy + sy, D / 2 - 0.016 * s); g.add(scr);
  // the tube's housing behind, tapering and sitting a little low
  const bd = (tv ? 0.26 : 0.28) * s, y1 = H * 0.475, y2 = H * 0.26 - 0.03 * s;
  const [side, cap] = taper(W * 0.97, H * 0.95, 0.03 * s, W * 0.5, H * 0.52, 0.05 * s, bd, -0.03 * s);
  for (const geo of [side, cap]) { const m = mesh(geo, mat, 0, cy, -D / 2); g.add(m); }
  const slope = Math.atan2(y1 - y2, bd), tt = 0.35;                     // vents on the sloped top of the housing
  const top = decal(W * 0.55, bd * 0.4 / Math.cos(slope), 'vents-top', (x, w, h) => vents(x, w, h, 9, 'rgba(0,0,0,.6)', true), { rough: 0.7 });
  top.rotation.x = -Math.PI / 2 + slope; top.position.set(0, cy + y1 * (1 - tt) + y2 * tt + 0.0015 * s, -D / 2 - bd * tt); g.add(top);
  if (!tv) {
    // swivel foot: a turned disc and a neck
    g.add(mesh(lathe([[0, 0], [0.12 * s, 0], [0.125 * s, 0.006 * s], [0.11 * s, 0.016 * s], [0.06 * s, 0.026 * s], [0.05 * s, y0 + 0.01 * s], [0, y0 + 0.01 * s]], 48), mat, 0, 0, -0.05 * s));
    // controls on the chin: a power button and LED, a row of small buttons, the badge
    const pw = button(0.022 * s, 0.012 * s, 0.008 * s, mat); pw.position.set(W * 0.38, y0 + 0.022 * s, D / 2 + 0.003 * s); g.add(pw);
    for (let i = 0; i < 4; i++) { const b = button(0.01 * s, 0.006 * s, 0.005 * s, MAT.grey()); b.position.set(W * 0.12 + i * 0.016 * s, y0 + 0.02 * s, D / 2 + 0.002 * s); g.add(b); }
    const lbl = decal(0.11 * s, 0.018 * s, `crt-badge-${seed % 3}`, (x, w, h) => badge(x, w, h, ['ILMC SyncView 17', 'ILMC MultiScan', 'ILMC 1700'][seed % 3], { fg: '#5a564c', italic: true }));
    lbl.position.set(-W * 0.24, y0 + 0.021 * s, D / 2 + 0.0005); g.add(lbl);
    const led = mesh(new THREE.CircleGeometry(0.0028 * s, 16), ledMat(0x77ff66), W * 0.31, y0 + 0.022 * s, D / 2 + 0.0008); g.add(led);
    return { g, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'crt', size: H, tick(dt, fx) { led.material.color.setHSL(0.3, 1, 0.25 + 0.5 * fx.kick); } };
  }
  // the TV: a speaker grille and two knobs to the right of the tube, four short feet
  const gx = W * 0.36, grille = decal(W * 0.17, H * 0.36, 'tv-grille', (x, w, h) => { ink(x, '#0a0a0b'); x.fillRect(0, 0, w, h); ink(x, '#2c2c30'); for (let yy = 4; yy < h; yy += 9) for (let xx = 4 + (yy / 9 % 2) * 4; xx < w; xx += 9) { x.beginPath(); x.arc(xx, yy, 2.6, 0, TAU); x.fill(); } }, { rough: 0.8 });
  grille.position.set(gx, cy + H * 0.16, D / 2 + 0.0005); g.add(grille);
  for (let i = 0; i < 2; i++) {
    const k = mesh(lathe([[0, 0], [0.016 * s, 0], [0.016 * s, 0.012 * s], [0.012 * s, 0.016 * s], [0, 0.016 * s]], 32), MAT.silver(), gx, cy - H * 0.13 - i * 0.05 * s, D / 2); k.rotation.x = Math.PI / 2; g.add(k);
    const tick = mesh(new THREE.BoxGeometry(0.002 * s, 0.01 * s, 0.002 * s), MAT.black(), gx, cy - H * 0.13 - i * 0.05 * s + 0.007 * s, D / 2 + 0.017 * s); g.add(tick);
  }
  const brand = decal(0.09 * s, 0.016 * s, 'tv-brand', (x, w, h) => badge(x, w, h, 'TRINITUBE', { fg: '#c9ccd2', font: '700' }), { metal: 0.6, rough: 0.3 });
  brand.position.set(sx, y0 + 0.012 * s, D / 2 + 0.0005); g.add(brand);
  for (const fx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.008 * s, 0.01 * s, y0, 12), MAT.black(), fx * W * 0.38, y0 / 2, 0));
  const led = mesh(new THREE.CircleGeometry(0.0026 * s, 16), ledMat(0xff3322), gx + 0.025 * s, y0 + 0.012 * s, D / 2 + 0.0008); g.add(led);
  return { g, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'tv', size: H, tick(dt, fx) { led.material.color.setHSL(0.0, 1, 0.3 + 0.4 * fx.kick); } };
}

// ---------------- the hero: a compact all-in-one fused with a PC (the video's computer) ----------------
export function franken(seed = 1, s = 1) {
  const R = rng(seed), g = new THREE.Group(), beige = MAT.beige();
  const W = 0.25 * s, H = 0.33 * s, D = 0.27 * s, fD = 0.03 * s;
  const sw = 0.165 * s, sh = 0.125 * s, scy = H * 0.64;
  // the case: body behind, and a front shell whose screen opening steps in to a recessed tube
  g.add(mesh(rbox(W, H, D - fD, 0.02 * s, 4), beige, 0, H / 2, -fD / 2));
  g.add(mesh(frame(W, H, 0.02 * s, sw + 0.03 * s, sh + 0.03 * s, 0.014 * s, fD, 0.005 * s, 0, scy - H / 2), beige, 0, H / 2, D / 2));
  g.add(mesh(rbox(sw + 0.03 * s, sh + 0.03 * s, 0.01 * s, 0.012 * s), new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6 }), 0, scy, D / 2 - fD + 0.002 * s));
  const scr = mesh(screenQuad(sw, sh, 0.006 * s), null, 0, scy, D / 2 - fD + 0.008 * s); g.add(scr);
  // the chin: a floppy slot with its door, ridges, badge, LED; vents down the side
  const slotBox = mesh(rbox(0.085 * s, 0.009 * s, 0.006 * s, 0.003 * s), new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.4 }), 0.045 * s, H * 0.24, D / 2 + 0.0015 * s); g.add(slotBox);
  const slot = new THREE.Object3D(); slot.position.set(0.045 * s, H * 0.24, D / 2 + 0.01); g.add(slot);
  const chin = decal(W * 0.92, H * 0.2, 'franken-chin', (x, w, h) => {
    ink(x, 'rgba(0,0,0,.18)'); for (let i = 0; i < 3; i++) x.fillRect(w * 0.04, h * (0.7 + i * 0.1), w * 0.92, h * 0.025);
    x.textAlign = 'left'; x.font = `bold ${Math.round(h * 0.17)}px Arial, sans-serif`; x.fillStyle = '#6e685a'; x.fillText('ILMC', w * 0.06, h * 0.3);
    const rb = x.createLinearGradient(0, 0, 0, h * 0.2); ['#5ebd3e', '#ffb900', '#e23838', '#009cdf'].forEach((c, i) => rb.addColorStop(i / 3, c)); x.fillStyle = rb; x.fillRect(w * 0.035, h * 0.18, w * 0.018, h * 0.16);
  });
  chin.position.set(0, H * 0.13, D / 2 + 0.0005); g.add(chin);
  const sideV = decal(D * 0.5, H * 0.3, 'franken-vents', (x, w, h) => vents(x, w, h, 10, 'rgba(30,26,20,.6)'));
  sideV.rotation.y = -Math.PI / 2; sideV.position.set(-W / 2 - 0.0005, H * 0.62, -0.02 * s); g.add(sideV);
  // the fused PC: a board up the side, a big fan, a board behind, orange caps on top, a drive bolted to the left
  const side = board(D * 0.9, H * 0.85, seed * 7, MAT.pcbDark()); side.rotation.y = Math.PI / 2; side.position.set(W / 2 + 0.0015, H * 0.5, 0); g.add(side);
  const f = fan(0.12 * s, MAT.black(), 0.016 * s); f.g.rotation.y = Math.PI / 2; f.g.position.set(W / 2 + 0.003 + 0.016 * s + 0.12 * s * 0.14, H * 0.45, 0.02 * s); g.add(f.g);
  const back = board(W * 0.8, H * 0.7, seed * 13); back.position.set(0, H * 0.55, -D / 2 - 0.0015); back.rotation.y = Math.PI; g.add(back);
  const capMat = MAT.orange(), capTop = MAT.silver();
  for (let i = 0; i < 4; i++) {
    const x0 = -W * 0.3 + i * 0.03 * s + R() * 0.01, z0 = -D * 0.2 + R() * 0.04;
    const c = mesh(new THREE.CylinderGeometry(0.014 * s, 0.013 * s, 0.03 * s, 20), capMat, x0, H + 0.015 * s, z0); g.add(c);
    const t = mesh(new THREE.CylinderGeometry(0.0135 * s, 0.0135 * s, 0.002 * s, 20), capTop, x0, H + 0.031 * s, z0); g.add(t);
  }
  const drive = mesh(rbox(0.07 * s, 0.2 * s, 0.2 * s, 0.006), crusty(0x8c8778, 1), -W / 2 - 0.035 * s, 0.1 * s, -0.02 * s); g.add(drive);
  const dl = decal(0.06 * s, 0.03 * s, 'drive-face', (x, w, h) => { ink(x, '#2a2824'); x.fillRect(w * 0.05, h * 0.3, w * 0.9, h * 0.12); x.fillRect(w * 0.7, h * 0.6, w * 0.15, h * 0.2); });
  dl.rotation.y = 0; dl.position.set(-W / 2 - 0.035 * s, 0.17 * s, 0.08 * s + 0.0005); g.add(dl);
  const led = mesh(new THREE.CircleGeometry(0.003 * s, 16), ledMat(0x55ff77), -W * 0.38, H * 0.06, D / 2 + 0.001); g.add(led);
  let spin = 0;
  return { g, fan: f, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'franken', size: H, slot,
    tick(dt, fx) { spin += dt * (2 + 40 * fx.low + 25 * fx.energy); f.set(spin); led.material.color.setHSL(0.33, 1, 0.3 + 0.5 * fx.hat); } };
}

// ---------------- a flat panel on a stand (the album cover's big monitor) ----------------
export function lcd(s = 1) {
  const g = new THREE.Group(), W = 0.56 * s, H = 0.35 * s, y0 = 0.12 * s, black = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.4 });
  const sw = W - 0.024 * s, sh = H - 0.05 * s, chin = 0.018 * s;
  g.add(mesh(rbox(W, H, 0.012 * s, 0.006 * s), black, 0, y0 + H / 2, 0));
  const [side, cap] = taper(W * 0.96, H * 0.94, 0.01 * s, W * 0.5, H * 0.5, 0.02 * s, 0.035 * s); for (const geo of [side, cap]) g.add(mesh(geo, black, 0, y0 + H / 2, -0.006 * s));
  g.add(mesh(frame(W, H, 0.006 * s, sw + 0.004 * s, sh + 0.004 * s, 0.002 * s, 0.004 * s, 0.0015 * s, 0, chin / 2), black, 0, y0 + H / 2, 0.0095 * s));
  const scr = mesh(screenQuad(sw, sh), null, 0, y0 + H / 2 + chin / 2, 0.0068 * s); g.add(scr);
  const logo = decal(0.06 * s, 0.01 * s, 'lcd-logo', (x, w, h) => badge(x, w, h, 'ILMC', { fg: '#8a8d94', font: '600' }), { metal: 0.5, rough: 0.3 });
  logo.position.set(0, y0 + 0.012 * s, 0.0101 * s); g.add(logo);
  const led = mesh(new THREE.CircleGeometry(0.0022 * s, 12), ledMat(0x3a8bff), W * 0.44, y0 + 0.012 * s, 0.0102 * s); g.add(led);
  // the stand: a curved neck and a round turned base
  const neck = new THREE.Shape(); neck.moveTo(-0.025 * s, 0); neck.lineTo(0.025 * s, 0); neck.lineTo(0.02 * s, y0 + 0.05 * s); neck.lineTo(-0.02 * s, y0 + 0.05 * s); neck.closePath();
  const ng = new THREE.ExtrudeGeometry(neck, { depth: 0.014 * s, bevelEnabled: true, bevelThickness: 0.003 * s, bevelSize: 0.003 * s, bevelSegments: 2 }); ng.translate(0, 0, -0.04 * s); g.add(mesh(ng, black));
  g.add(mesh(lathe([[0, 0], [0.11 * s, 0], [0.112 * s, 0.003 * s], [0.1 * s, 0.009 * s], [0.03 * s, 0.012 * s], [0, 0.012 * s]], 48), black, 0, 0, -0.03 * s));
  return { g, screens: [{ mesh: scr, w: sw, h: sh }], kind: 'lcd', size: (y0 + H) * 0.85, tick(dt, fx) { led.material.color.setHSL(0.6, 1, 0.35 + 0.3 * fx.kick); } };
}

// ---------------- keyboards: a real layout, its keys a spectrum ----------------
// rows of [width in key units, gap before it]; returns positions (u, row) for each key
function layoutRows(rows, unit) {
  const keys = []; let maxW = 0;
  rows.forEach((row, r) => { let x = 0; for (const k of row) { const [w, gap = 0] = Array.isArray(k) ? k : [k]; x += gap; keys.push({ x: x + w / 2, w, r }); x += w; } maxW = Math.max(maxW, x); });
  for (const k of keys) { k.u = k.x / maxW; k.cx = (k.x - maxW / 2) * unit; }
  return { keys, width: maxW * unit };
}
const FULL = [
  [1, [1, 1], 1, 1, 1, [1, 0.5], 1, 1, 1, [1, 0.5], 1, 1, 1, [1, 0.25], 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, [1, 0.25], 1, 1, [1, 0.25], 1, 1, 1, 1],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, [1, 0.25], 1, 1, [1, 0.25], 1, 1, 1, 1],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25, [1, 3.5], 1, 1, 1],
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75, [1, 1.25], [1, 1.25], 1, 1, 1],
  [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25, [1, 0.25], 1, 1, [2, 0.25], 1],
];
const LAPTOP = [
  Array(14).fill(0.92),
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.6],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.1],
  [1.8, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.8],
  [2.3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.3],
  [1, 1, 1.3, 5.6, 1.3, 1, 1, 1, 1],
];
function keySet(rows, unit, capH, mat) {
  const L = layoutRows(rows, unit), n = L.keys.length;
  const keys = new THREE.InstancedMesh(rbox(1, 1, 1, 0.18, 2), mat, n), o = new THREE.Object3D(), col = new THREE.Color(0, 0, 0);
  L.keys.forEach((k, i) => { o.position.set(k.cx, 0, (k.r - (rows.length - 1) / 2) * unit); o.scale.set(k.w * unit - unit * 0.14, capH, unit * 0.86); o.updateMatrix(); keys.setMatrixAt(i, o.matrix); keys.setColorAt(i, col); });
  return { keys, layout: L, rows: rows.length };
}
function glow(set, fx, col) {
  if (!fx.spec) return;
  const { keys, layout, rows } = set;
  layout.keys.forEach((k, i) => {
    const v = fx.spec[Math.floor(4 + k.u * 96)] * fx.alive, lit = v * rows * 1.3, on = Math.max(0, Math.min(1, lit - (rows - 1 - k.r)));
    col.copy(KEYCOL[fx.palette % 3]).multiplyScalar(on * on); keys.setColorAt(i, col);
  });
  keys.instanceColor.needsUpdate = true;
}
export function keyboard(seed = 1, s = 1) {
  const g = new THREE.Group(), u = 0.0185 * s, set = keySet(FULL, u, 0.009 * s, keyMaterial());
  const W = set.layout.width + 0.03 * s, D = u * 6 + 0.04 * s, mat = seed % 2 ? MAT.beige() : MAT.platinum();
  // a wedge-shaped case: taller at the back
  const prof = new THREE.Shape(); prof.moveTo(-D / 2, 0); prof.lineTo(D / 2, 0); prof.lineTo(D / 2, 0.03 * s); prof.lineTo(D / 2 - 0.01 * s, 0.032 * s); prof.lineTo(-D / 2, 0.02 * s); prof.closePath();
  const body = new THREE.ExtrudeGeometry(prof, { depth: W, bevelEnabled: true, bevelThickness: 0.003 * s, bevelSize: 0.003 * s, bevelSegments: 2 });
  body.rotateY(Math.PI / 2); body.translate(-W / 2, 0, 0); g.add(mesh(body, mat));
  const well = mesh(new THREE.BoxGeometry(set.layout.width + 0.006 * s, 0.002 * s, u * 6 + 0.006 * s), new THREE.MeshStandardMaterial({ color: 0x3a3732, roughness: 0.8 }), 0, 0.024 * s, 0.004 * s);
  well.rotation.x = 0.06; g.add(well);
  set.keys.position.set(0, 0.031 * s, 0.004 * s); set.keys.rotation.x = 0.06; g.add(set.keys);
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CircleGeometry(0.0018 * s, 10), ledMat(i === 1 ? 0x55ff77 : 0x1c3a20), W / 2 - 0.04 * s + i * 0.012 * s, 0.0325 * s, -D / 2 + 0.012 * s).rotateX(-Math.PI / 2));
  const lbl = decal(0.05 * s, 0.009 * s, 'kb-badge', (x, w, h) => badge(x, w, h, 'ILMC', { fg: '#7d776a' }));
  lbl.rotation.x = -Math.PI / 2 + 0.06; lbl.position.set(-W / 2 + 0.05 * s, 0.033 * s, -D / 2 + 0.012 * s); g.add(lbl);
  const col = new THREE.Color();
  return { g, screens: [], kind: 'keyboard', size: 0.04 * s, tick(dt, fx) { glow(set, fx, col); } };
}

// ---------------- a laptop: keyboard well, trackpad, hinge, a bezel with a webcam, a glowing :3 on the lid ----------------
export function laptop(seed = 1, s = 1, color = 'silver') {
  const g = new THREE.Group(), mat = color === 'white' ? new THREE.MeshPhysicalMaterial({ color: 0xf2f2ee, roughness: 0.32, clearcoat: 0.5 }) : color === 'black' ? new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.42 }) : MAT.silver();
  const W = 0.32 * s, D = 0.22 * s, T = 0.016 * s, u = 0.0182 * s;
  g.add(mesh(rbox(W, T, D, 0.008 * s, 3), mat, 0, T / 2, 0));
  const set = keySet(LAPTOP, u, 0.0022 * s, keyMaterial());
  g.add(mesh(new THREE.BoxGeometry(set.layout.width + 0.008 * s, 0.001 * s, u * 6 + 0.008 * s), new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.7 }), 0, T - 0.0002 * s, -0.035 * s));
  set.keys.position.set(0, T + 0.0006 * s, -0.035 * s); g.add(set.keys);
  g.add(mesh(rbox(0.095 * s, 0.0008 * s, 0.058 * s, 0.004 * s), new THREE.MeshStandardMaterial({ color: color === 'black' ? 0x232327 : 0xb9bcc2, roughness: 0.35, metalness: color === 'silver' ? 0.7 : 0 }), 0, T + 0.0002 * s, D * 0.3));
  for (const fx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.002 * s, 12), MAT.black(), fx * W * 0.4, 0.001 * s, fx * 0 + D * 0.4));
  const hinge = new THREE.Group(); hinge.position.set(0, T, -D / 2 + 0.004 * s); g.add(hinge);
  const barrel = mesh(new THREE.CylinderGeometry(0.0055 * s, 0.0055 * s, W * 0.8, 20), mat); barrel.rotation.z = Math.PI / 2; hinge.add(barrel);
  const lid = mesh(rbox(W, 0.008 * s, D, 0.007 * s, 3), mat, 0, 0.004 * s, D / 2); hinge.add(lid);
  const bez = decal(W - 0.004 * s, D - 0.004 * s, `bezel-${color}`, (x, w, h) => { ink(x, '#0b0b0d'); x.beginPath(); x.roundRect(0, 0, w, h, w * 0.02); x.fill(); ink(x, '#26262a'); x.beginPath(); x.arc(w / 2, h * 0.04, w * 0.006, 0, TAU); x.fill(); });
  bez.rotation.x = Math.PI / 2; bez.position.set(0, -0.0003 * s, D / 2); hinge.add(bez);
  const sw = W - 0.03 * s, sh = D - 0.035 * s;
  const scr = mesh(screenQuad(sw, sh), null, 0, -0.0012 * s, D / 2 + 0.003 * s); scr.rotation.x = Math.PI / 2; hinge.add(scr);
  const logo = decal(0.04 * s, 0.04 * s, 'lid-face', (x, w, h) => {
    const r = w * 0.38, k = Math.sqrt(3) / 2; x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(w / 2 - r, h * 0.3); x.lineTo(w / 2 + r, h * 0.3); x.lineTo(w / 2, h * 0.3 + 2 * r * k); x.closePath(); x.fill();
    x.fillStyle = '#000'; x.fillRect(w * 0.38, h * 0.38, w * 0.06, h * 0.12); x.fillRect(w * 0.56, h * 0.38, w * 0.06, h * 0.12);
  }, { emissive: true });
  logo.rotation.x = -Math.PI / 2; logo.position.set(0, 0.0085 * s, D / 2 + 0.01 * s); hinge.add(logo);
  let open = 0.9, target = 0.9, vel = 0;
  const col = new THREE.Color();
  return {
    g, screens: [{ mesh: scr, w: sw, h: sh }], kind: 'laptop', size: 0.2 * s, keys: set.keys,
    flip() { target = target > 0.5 ? 0.08 : 0.92; },
    tick(dt, fx) {
      vel += ((target - open) * 260 - vel * 18) * dt; open += vel * dt; hinge.rotation.x = -open * 1.92;
      glow(set, fx, col); logo.material.emissiveIntensity = 0.4 + 1.2 * fx.kick * fx.alive;
    },
  };
}

// ---------------- a studio monitor: a proper woofer (surround, cone, dust cap, basket screws), a waveguide tweeter, a port ----------------
export function speaker(s = 1) {
  const g = new THREE.Group(), W = 0.19 * s, H = 0.3 * s, D = 0.22 * s, cab = new THREE.MeshStandardMaterial({ color: 0x2e3034, roughness: 0.5, metalness: 0.3 });
  g.add(mesh(rbox(W, H, D, 0.03 * s, 5), cab, 0, H / 2, 0));
  const baffle = decal(W * 0.8, H * 0.85, 'spk-baffle', (x, w, h) => {
    
    ink(x, '#8b8e94'); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; x.beginPath(); x.arc(w / 2 + Math.cos(a) * w * 0.47, h * 0.665 + Math.sin(a) * w * 0.47, w * 0.02, 0, TAU); x.fill(); }
    ink(x, '#050506'); x.beginPath(); x.roundRect(w * 0.28, h * 0.93, w * 0.44, h * 0.045, h * 0.022); x.fill();
  }, { rough: 0.6 });
  baffle.position.set(0, H / 2, D / 2 + 0.0005); g.add(baffle);
  const wy = H * 0.36, wz = D / 2;
  g.add(mesh(new THREE.TorusGeometry(0.066 * s, 0.006 * s, 12, 48), new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.9 }), 0, wy, wz));
  const cone = lathe([[0.062 * s, 0], [0.05 * s, -0.01 * s], [0.026 * s, -0.022 * s], [0.02 * s, -0.024 * s]], 48); cone.rotateX(-Math.PI / 2);
  const woof = new THREE.Group(); woof.position.set(0, wy, wz); g.add(woof);
  woof.add(mesh(cone, new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.75 })));
  const cap = mesh(new THREE.SphereGeometry(0.024 * s, 24, 12, 0, TAU, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.35 }), 0, 0, -0.03 * s); cap.rotation.x = Math.PI / 2; woof.add(cap);
  const ty = H * 0.76;
  g.add(mesh(lathe([[0.034 * s, 0], [0.03 * s, -0.004 * s], [0.016 * s, -0.012 * s], [0.0, -0.012 * s]], 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.3, metalness: 0.4 }), 0, ty, wz + 0.001));
  const dome = mesh(new THREE.SphereGeometry(0.012 * s, 20, 10, 0, TAU, 0, Math.PI / 2), MAT.silver(), 0, ty, wz - 0.011 * s); dome.rotation.x = Math.PI / 2; g.add(dome);
  const led = mesh(new THREE.CircleGeometry(0.0028 * s, 12), ledMat(0x33ff55), W * 0.36, H * 0.06, wz + 0.001); g.add(led);
  return { g, screens: [], kind: 'speaker', size: H, tick(dt, fx) { woof.position.z = wz + (fx.low * 0.01 + fx.kick * 0.007) * s * fx.alive; led.material.color.setRGB(0.1 + fx.level * 2, 1, 0.2); } };
}

// ---------------- a beige tower: a painted front panel (bays, buttons, vents, the CPU sticker), a real DVD tray ----------------
export function tower(seed = 1, s = 1) {
  const g = new THREE.Group(), W = 0.19 * s, H = 0.42 * s, D = 0.43 * s, beige = MAT.beige();
  g.add(mesh(rbox(W, H, D, 0.008 * s), beige, 0, H / 2, 0));
  const face = decal(W * 0.94, H * 0.96, `tower-face-${seed % 2}`, (x, w, h) => {
    const bay = (y, hh, eject = true) => { ink(x, 'rgba(60,55,45,.35)'); x.fillRect(w * 0.08, y, w * 0.84, hh); ink(x, 'rgba(255,255,255,.35)'); x.fillRect(w * 0.08, y + hh - 2, w * 0.84, 2); if (eject) { ink(x, 'rgba(40,36,30,.5)'); x.beginPath(); x.roundRect(w * 0.74, y + hh * 0.55, w * 0.12, hh * 0.25, 3); x.fill(); } };
    bay(h * 0.12, h * 0.1, false); bay(h * 0.24, h * 0.1); bay(h * 0.36, h * 0.1);
    ink(x, 'rgba(60,55,45,.35)'); x.fillRect(w * 0.3, h * 0.5, w * 0.6, h * 0.05); ink(x, '#1a1814'); x.fillRect(w * 0.36, h * 0.52, w * 0.4, h * 0.008);
    ink(x, 'rgba(40,36,30,.45)'); x.beginPath(); x.arc(w * 0.22, h * 0.62, w * 0.07, 0, TAU); x.fill(); ink(x, 'rgba(255,255,255,.4)'); x.beginPath(); x.arc(w * 0.215, h * 0.612, w * 0.055, 0, TAU); x.fill();
    x.save(); x.translate(0, h * 0.72); vents(x, w, h * 0.22, 7, 'rgba(30,26,20,.5)'); x.restore();
    const st = (sx, sy, a, b) => { ink(x, a); x.beginPath(); x.roundRect(sx, sy, w * 0.22, h * 0.07, 4); x.fill(); x.fillStyle = b; x.font = `bold ${Math.round(h * 0.022)}px Arial`; x.textAlign = 'center'; x.fillText(seed % 2 ? 'TURBO' : 'MMX', sx + w * 0.11, sy + h * 0.045); };
    st(w * 0.62, h * 0.58, '#1f3fbf', '#fff'); st(w * 0.62, h * 0.66, '#d9d2c2', '#333');
  });
  face.position.set(0, H / 2, D / 2 + 0.0005); g.add(face);
  const pb = button(0.026 * s, 0.026 * s, 0.006 * s, beige); pb.position.set(-W * 0.28, H * 0.38, D / 2 + 0.003 * s); g.add(pb);
  const leds = [0x44ff66, 0xffaa22].map((c, i) => { const l = mesh(new THREE.CircleGeometry(0.0028 * s, 12), ledMat(c), -W * 0.12 + i * 0.016 * s, H * 0.38, D / 2 + 0.001); g.add(l); return l; });
  const sideSeam = decal(D * 0.96, H * 0.96, 'tower-side', (x, w, h) => { ink(x, 'rgba(0,0,0,.22)'); x.fillRect(w * 0.04, 0, 2, h); for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(w * 0.96, h * (0.1 + i * 0.2), 4, 0, TAU); x.fill(); } x.save(); x.translate(w * 0.2, h * 0.1); vents(x, w * 0.5, h * 0.25, 8, 'rgba(30,26,20,.45)'); x.restore(); });
  sideSeam.rotation.y = Math.PI / 2; sideSeam.position.set(W / 2 + 0.0005, H / 2, 0); g.add(sideSeam);
  const tray = new THREE.Group(); tray.position.set(0, H - 0.05 * s, D / 2 - 0.14 * s); g.add(tray);
  tray.add(mesh(new THREE.BoxGeometry(W * 0.74, 0.006 * s, 0.15 * s), MAT.black()));
  tray.add(mesh(rbox(W * 0.84, 0.036 * s, 0.006 * s, 0.002 * s), MAT.platinum(), 0, 0.004 * s, 0.077 * s));
  const disc = cd(0.95 * s); disc.position.set(0, 0.0035 * s, -0.005 * s); tray.add(disc);
  const pump = new Pump(); pump.x = pump.target = 0;
  let spin = 0;
  return { g, screens: [], kind: 'tower', size: H, pump, tray,
    tick(dt, fx) { leds[1].visible = fx.hat > 0.3 || Math.random() < fx.mid * 0.5; const o = pump.step(dt); tray.position.z = D / 2 - 0.14 * s + Math.max(-0.01, o) * 0.15 * s; spin += dt * (4 + 30 * fx.level); disc.rotation.y = spin; } };
}

// ---------------- an iMac G3: a translucent candy shell with the tube visible inside, white front, handle, vents ----------------
export function imac(color = 0x1c9ad6, s = 1) {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false });
  const ice = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.25, clearcoat: 0.8 });
  const [side, cap] = taper(0.37 * s, 0.34 * s, 0.07 * s, 0.24 * s, 0.24 * s, 0.1 * s, 0.3 * s, -0.02 * s);
  for (const geo of [side, cap]) g.add(mesh(geo, shell, 0, 0.215 * s, 0.1 * s));
  g.add(mesh(new THREE.SphereGeometry(0.13 * s, 24, 16), new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.5 }), 0, 0.21 * s, -0.06 * s));
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.2 * s, 0.006 * s, 0.002 * s), new THREE.MeshStandardMaterial({ color: 0x1d6f2f, roughness: 0.6 }), 0, 0.12 * s + i * 0.05 * s, -0.12 * s));
  const sw = 0.25 * s, sh = 0.19 * s;
  g.add(mesh(frame(0.37 * s, 0.34 * s, 0.07 * s, sw + 0.02 * s, sh + 0.02 * s, 0.018 * s, 0.03 * s, 0.006 * s, 0, 0.02 * s), ice, 0, 0.215 * s, 0.13 * s));
  g.add(mesh(rbox(sw + 0.022 * s, sh + 0.022 * s, 0.01 * s, 0.016 * s), new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6 }), 0, 0.235 * s, 0.105 * s));
  const scr = mesh(screenQuad(sw, sh, 0.01 * s), null, 0, 0.235 * s, 0.112 * s); g.add(scr);
  const handle = mesh(new THREE.TorusGeometry(0.05 * s, 0.008 * s, 10, 24, Math.PI), shell, 0, 0.34 * s, -0.06 * s); handle.rotation.x = -0.5; g.add(handle);
  g.add(mesh(rbox(0.16 * s, 0.035 * s, 0.07 * s, 0.015 * s), shell, 0, 0.05 * s, 0.11 * s));
  const logo = decal(0.03 * s, 0.03 * s, 'imac-logo', (x, w, h) => { x.fillStyle = '#5a5d64'; x.font = `${Math.round(h * 0.9)}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♥', w / 2, h / 2); }, { metal: 0.4, rough: 0.3 });
  logo.position.set(0, 0.075 * s, 0.137 * s); g.add(logo);
  return { g, screens: [{ mesh: scr, w: sw, h: sh, crt: true }], kind: 'imac', size: 0.4 * s, tick() {} };
}

// ---------------- a PlayStation 2 standing up: the ribbed half, the two-level front, the blue light ----------------
export function ps2(s = 1) {
  const g = new THREE.Group(), body = new THREE.Group(); body.rotation.z = Math.PI / 2; body.position.y = 0.155 * s; g.add(body);
  const black = new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.38 }), matte = new THREE.MeshStandardMaterial({ color: 0x18191d, roughness: 0.7 });
  body.add(mesh(rbox(0.3 * s, 0.04 * s, 0.18 * s, 0.003 * s), black, 0, 0.02 * s, 0));
  body.add(mesh(rbox(0.3 * s, 0.036 * s, 0.172 * s, 0.003 * s), matte, 0, -0.019 * s, -0.004 * s));
  for (let i = 0; i < 9; i++) body.add(mesh(new THREE.BoxGeometry(0.296 * s, 0.002 * s, 0.168 * s), black, 0, -0.035 * s + i * 0.0035 * s, -0.004 * s));
  const front = decal(0.3 * s, 0.076 * s, 'ps2-front', (x, w, h) => {
    ink(x, '#26272c'); x.fillRect(w * 0.04, h * 0.58, w * 0.62, h * 0.1);                     // the disc tray, on the upper half
    ink(x, '#3d3f46'); x.beginPath(); x.roundRect(w * 0.72, h * 0.56, w * 0.05, h * 0.14, 3); x.fill(); x.beginPath(); x.roundRect(w * 0.8, h * 0.56, w * 0.05, h * 0.14, 3); x.fill();
    ink(x, '#1b1c20'); for (let i = 0; i < 2; i++) x.fillRect(w * (0.05 + i * 0.12), h * 0.2, w * 0.08, h * 0.12);   // controller ports
  }, { rough: 0.4 });
  front.position.set(0, 0, 0.0906 * s); body.add(front);
  const led = mesh(new THREE.BoxGeometry(0.004 * s, 0.02 * s, 0.002 * s), ledMat(0x2f6bff), 0.13 * s, 0.022 * s, 0.0912 * s); body.add(led);
  return { g, screens: [], kind: 'ps2', size: 0.3 * s, tick(dt, fx) { led.material.color.setRGB(0.1, 0.3 + 0.7 * fx.low * fx.alive, 1); } };
}

// ---------------- clutter: a floppy with a hand-written label, a two-button mouse with a wheel ----------------
const LABELS = ['STEMS', 'ilmc v13', 'DO NOT\nDELETE', 'girl EDM', 'samples', 'FMC final'];
export function floppy(color, s = 1) {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  g.add(mesh(rbox(0.09 * s, 0.0033 * s, 0.093 * s, 0.0015 * s), body, 0, 0.0017 * s, 0));
  g.add(mesh(new THREE.BoxGeometry(0.052 * s, 0.0006 * s, 0.03 * s), MAT.silver(), -0.006 * s, 0.0036 * s, -0.031 * s));
  g.add(mesh(new THREE.BoxGeometry(0.012 * s, 0.0007 * s, 0.018 * s), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }), 0.006 * s, 0.0038 * s, -0.033 * s));
  const n = Math.floor(Math.random() * LABELS.length), lbl = decal(0.066 * s, 0.048 * s, `floppy-${n}`, (x, w, h) => {
    x.fillStyle = '#f6f3ea'; x.fillRect(0, 0, w, h); ink(x, '#7a9ad8'); for (let i = 1; i < 6; i++) x.fillRect(0, h * (0.2 + i * 0.14), w, 1.5);
    ink(x, '#d22'); x.fillRect(0, h * 0.2, w, 2); x.fillStyle = '#1a2a8a'; x.font = `${Math.round(h * 0.18)}px "Comic Sans MS", "Segoe Print", cursive`; x.textAlign = 'center';
    LABELS[n].split('\n').forEach((l, i) => x.fillText(l, w / 2, h * (0.48 + i * 0.2)));
  }, { rough: 0.85, res: 256 });
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.00345 * s, 0.018 * s); g.add(lbl);
  return g;
}
export function mouse(color) {
  const g = new THREE.Group(), m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.4 });
  const body = mesh(new THREE.SphereGeometry(0.03, 32, 18, 0, TAU, 0, Math.PI / 2), m); body.scale.set(1, 0.62, 1.65); g.add(body);
  const seam = mesh(new THREE.BoxGeometry(0.0012, 0.004, 0.03), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }), 0, 0.017, -0.02); g.add(seam);
  const wheel = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 20), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6 }), 0, 0.0185, -0.022); wheel.rotation.z = Math.PI / 2; g.add(wheel);
  g.add(mesh(new THREE.TorusGeometry(0.06, 0.0022, 6, 30, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5 }), 0, 0.003, -0.1));
  return g;
}
