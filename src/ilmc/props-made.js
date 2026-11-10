// The things no model library has, made here (original artwork only): clothes dropped where they came off, a hoodie
// with the :3 face on it, magazines and loose prints in her Y2K look (wallpaper skies, type plates, the System
// message window), rugs, a beanbag, plush, a pile of books. Each maker returns a Group in the kit's shape (y up,
// metres, origin on the floor under its middle); props.js sets shadows and measures it.
// ctx: { THREE, surface(name, opts) } where surface() is the kit's tiling material (UVs in metres).
import { drawFace } from './label.js';
import { systemMessage } from './win98.js';

// ---------- small tools ----------
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash2 = (x, y, s) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s, o = 4) => { let a = 0.5, t = 0; for (let i = 0; i < o; i++) { t += a * vnoise(x, y, s + i * 17); x = x * 2.03 + 3.1; y = y * 2.03 + 1.7; a *= 0.5; } return t; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 2D signed distances (metres, x across, z down the garment from the collar)
const sdBox = (x, z, cx, cz, hw, hd, r = 0, ang = 0) => {
  let px = x - cx, pz = z - cz; if (ang) { const c = Math.cos(ang), s = Math.sin(ang); [px, pz] = [c * px + s * pz, -s * px + c * pz]; }
  const qx = Math.abs(px) - hw + r, qz = Math.abs(pz) - hd + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
};
const sdCircle = (x, z, cx, cz, r) => Math.hypot(x - cx, z - cz) - r;
const sdSeg = (x, z, ax, az, bx, bz, r) => { const px = x - ax, pz = z - az, dx = bx - ax, dz = bz - az, h = Math.max(0, Math.min(1, (px * dx + pz * dz) / (dx * dx + dz * dz))); return Math.hypot(px - dx * h, pz - dz * h) - r; };
const smin = (a, b, k = 0.03) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// a canvas texture, redrawn once her fonts have arrived (the first draw may fall back to a system face)
const FONTS = ['700 40px Oswald', '40px "Pinyon Script"'];
function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const go = () => { const x = c.getContext('2d'); x.clearRect(0, 0, w, h); draw(x, w, h); t.needsUpdate = true; };
  go();
  if (document.fonts && document.fonts.status !== 'loaded' || !FONTS.every((f) => document.fonts?.check(f))) Promise.all(FONTS.map((f) => document.fonts.load(f))).then(go, () => {});
  return t;
}

// ---------- her look, on canvas ----------
const SERIF = '"Times New Roman", Times, serif';
// type plates: [font, fill, sx, sy]
const PLATE = {
  times: [`400 {s}px ${SERIF}`, '#ffffff', 0.6, 1.75], caps: [`small-caps 400 {s}px ${SERIF}`, '#ffffff', 1.25, 1],
  blue: ['700 {s}px Oswald, Anton, sans-serif', '#1f33ff', 0.85, 1.3], script: ['{s}px "Pinyon Script", cursive', '#e3122e', 1.1, 1],
  green: ['700 {s}px Oswald, Anton, sans-serif', '#38ff32', 0.75, 1.5], pink: ['700 {s}px Oswald, Anton, sans-serif', '#ff2bd8', 0.75, 1.5],
};
function plate(x, kind, text, cx, cy, size, { fill, align = 'center', maxW = 1e9 } = {}) {
  const [f, c, sx, sy] = PLATE[kind]; x.save(); x.translate(cx, cy); x.scale(sx, sy);
  x.font = f.replace('{s}', Math.round(size)); x.fillStyle = fill || c; x.textAlign = align; x.textBaseline = 'alphabetic';
  x.fillText(text, 0, 0, maxW / sx); x.restore();
}
// the stock wallpapers: 0 Bliss-like hills, 1 ocean, 2 dusk above the clouds, 3 night with stars
function sky(x, X, Y, w, h, kind, R) {
  x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip();
  const top = ['#0b4bd6', '#0b56c9', '#2b3a9e', '#04031a'][kind], low = ['#9fd2ff', '#a9dcff', '#ff9e6b', '#26206a'][kind];
  let g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, top); g.addColorStop(0.75, low); x.fillStyle = g; x.fillRect(X, Y, w, h);
  if (kind === 3) { x.fillStyle = '#fff'; for (let i = 0; i < 90; i++) x.fillRect(X + R() * w, Y + R() * h * 0.8, 1.5, 1.5); }
  else for (let i = 0; i < 9; i++) {                                     // soft cumulus
    const cx = X + R() * w, cy = Y + h * (0.1 + R() * (kind === 2 ? 0.7 : 0.45)), r = w * (0.08 + R() * 0.12);
    for (let k = 0; k < 6; k++) {
      const px = cx + (R() - 0.5) * r * 2, py = cy + (R() - 0.5) * r * 0.5, pr = r * (0.4 + R() * 0.5);
      const cg = x.createRadialGradient(px, py, 0, px, py, pr); cg.addColorStop(0, kind === 2 ? 'rgba(255,214,190,.9)' : 'rgba(255,255,255,.92)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = cg; x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
  }
  if (kind === 0) {                                                      // the hill
    g = x.createLinearGradient(0, Y + h * 0.6, 0, Y + h); g.addColorStop(0, '#79c832'); g.addColorStop(1, '#2f7d12'); x.fillStyle = g;
    x.beginPath(); x.moveTo(X, Y + h * 0.78); x.bezierCurveTo(X + w * 0.3, Y + h * 0.55, X + w * 0.65, Y + h * 0.62, X + w, Y + h * 0.74); x.lineTo(X + w, Y + h); x.lineTo(X, Y + h); x.fill();
  } else if (kind === 1) {
    g = x.createLinearGradient(0, Y + h * 0.66, 0, Y + h); g.addColorStop(0, '#0f6fb5'); g.addColorStop(1, '#02254f'); x.fillStyle = g; x.fillRect(X, Y + h * 0.66, w, h * 0.34);
    x.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 40; i++) x.fillRect(X + R() * w, Y + h * (0.68 + R() * 0.3), 6 + R() * 18, 1.5);
  }
  x.restore();
}
const face = (x, cx, cy, s) => drawFace(x, cx, cy, s, { bg: true });

// magazine covers: invented titles, period coverlines
const MASTS = ['HARDDRIVE', 'LOGIN', 'screensaver', 'DIALTONE', 'BEDROOM', 'NEW MESSAGE'];
const LINES = [['BURN YOUR OWN MIX CD', 'WHICH MP3 PLAYER?', 'FREE CD-ROM INSIDE'], ['25 SCREENSAVERS', 'BUILD A PC FOR £400', 'MSN AFTER DARK'],
  ['BEDROOM STUDIO SPECIAL', 'SAMPLERS ON A BUDGET', 'POSTER INSIDE'], ['THE WIRELESS ISSUE', 'GET A FASTER MODEM', 'SKINS FOR YOUR DESKTOP']];
function cover(x, w, h, i) {
  const R = mulberry(i * 977 + 5), m = i % 4, mast = MASTS[i % MASTS.length], lines = LINES[i % LINES.length];
  if (m === 0) {                                                        // the sky issue
    sky(x, 0, 0, w, h, 0, R); plate(x, 'times', mast, w / 2, h * 0.16, h * 0.1, { maxW: w * 0.94 });
    face(x, w * 0.5, h * 0.48, w * 0.24);
    plate(x, 'blue', lines[0], w * 0.06, h * 0.83, h * 0.05, { align: 'left', maxW: w * 0.8 }); plate(x, 'script', 'the summer of pixels', w * 0.06, h * 0.93, h * 0.045, { align: 'left' });
  } else if (m === 1) {                                                 // black, neon type stacked
    x.fillStyle = '#060608'; x.fillRect(0, 0, w, h);
    plate(x, 'green', mast, w / 2, h * 0.2, h * 0.14, { maxW: w * 0.94 });
    lines.forEach((l, k) => plate(x, k % 2 ? 'pink' : 'green', l, w / 2, h * (0.42 + k * 0.13), h * 0.07, { maxW: w * 0.9 }));
    sky(x, w * 0.58, h * 0.75, w * 0.34, h * 0.18, 3, R); x.strokeStyle = '#ff2bd8'; x.lineWidth = 3; x.strokeRect(w * 0.58, h * 0.75, w * 0.34, h * 0.18);
  } else if (m === 2) {                                                 // white, royal blue masthead, the System message window
    x.fillStyle = '#f4f3ef'; x.fillRect(0, 0, w, h);
    plate(x, 'blue', mast, w / 2, h * 0.17, h * 0.13, { maxW: w * 0.94 });
    const sc = document.createElement('canvas'); sc.width = 320; sc.height = 200; sky(sc.getContext('2d'), 0, 0, 320, 200, 0, R);
    const win = systemMessage(sc, Math.round(w * 0.78)); x.drawImage(win, w * 0.11, h * 0.26);
    plate(x, 'script', 'your computer loves you', w / 2, h * 0.86, h * 0.05); plate(x, 'blue', lines[1], w / 2, h * 0.95, h * 0.04, { maxW: w * 0.9 });
  } else {                                                              // hot pink, the face huge
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ff4fa3'); g.addColorStop(1, '#6a2bff'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    face(x, w / 2, h * 0.42, w * 0.36);
    plate(x, 'times', mast, w / 2, h * 0.14, h * 0.1, { maxW: w * 0.94 }); plate(x, 'caps', lines[2].toLowerCase(), w / 2, h * 0.9, h * 0.045, { maxW: w * 0.9 });
  }
  x.fillStyle = '#fff'; x.fillRect(w * 0.82, h * 0.88, w * 0.13, h * 0.08); x.fillStyle = '#000';               // barcode box and price
  for (let k = 0; k < 18; k++) x.fillRect(w * 0.83 + k * w * 0.006, h * 0.89, R() < 0.5 ? 1 : 2.5, h * 0.045);
  x.font = `${Math.round(h * 0.022)}px Arial`; x.fillText('£2.99', w * 0.835, h * 0.955);
}
// loose prints: photo prints of the skies, type-plate posters, a printed System message
function printArt(x, w, h, i) {
  const R = mulberry(i * 613 + 11), k = i % 6;
  if (k < 2) { sky(x, 0, 0, w, h, [0, 2][k], R); return; }
  if (k === 2) { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); plate(x, 'times', 'new message', w / 2, h * 0.42, h * 0.16, { maxW: w * 0.9 }); plate(x, 'script', 'from my computer', w / 2, h * 0.7, h * 0.12); return; }
  if (k === 3) { x.fillStyle = '#f6f5f0'; x.fillRect(0, 0, w, h); plate(x, 'blue', 'LOW BATTERY', w / 2, h * 0.45, h * 0.2, { maxW: w * 0.92 }); plate(x, 'script', 'still playing', w / 2, h * 0.72, h * 0.12); return; }
  if (k === 4) { sky(x, 0, 0, w, h, 1, R); const win = systemMessage(null, Math.round(w * 0.7)); x.drawImage(win, w * 0.15, h * 0.18); return; }
  x.fillStyle = '#0b0b0d'; x.fillRect(0, 0, w, h); face(x, w / 2, h * 0.36, Math.min(w, h) * 0.28); plate(x, 'green', 'LOADING...', w / 2, h * 0.9, h * 0.11, { maxW: w * 0.9 });
}

// ---------- geometry ----------
// A garment, dropped: a grid clipped to an outline, its edge snapped onto the outline, pushed up into a few soft
// bunches and a dozen creases (each a ridge with a sharp crest that tapers off at both ends), all dying out toward
// the hem, then shoved sideways a little so it does not lie square. Vertex colours are a cavity map: below the
// neighbourhood's average is darker, above it lighter, so the flash finds the creases.
// Returns { geo, height(x, z), shoved(x, z) } in the garment's flat frame (x across, z from the collar down).
function garment(THREE, { sdf, w, d, n = 72, seed = 1, loft = 0.05, fold = 0.016, folds = 12, bunch = 3, shove = 0.03, shade = null }) {
  const R = mulberry(seed), bumps = Array.from({ length: bunch }, () => ({ x: (R() - 0.5) * w * 0.7, z: (R() - 0.5) * d * 0.7, s: 0.06 + R() * 0.1, a: loft * (0.4 + R() * 0.8) }));
  const creases = [];
  while (creases.length < folds) {
    const x = (R() - 0.5) * w, z = (R() - 0.5) * d; if (sdf(x, z) > -0.02) continue;
    const a = R() * Math.PI; creases.push({ x, z, c: Math.cos(a), s: Math.sin(a), L: 0.08 + R() * 0.22, wd: 0.025 + R() * 0.035, bend: (R() - 0.5) * 0.25, A: fold * (0.4 + R() * 0.9) });
  }
  const nx = n, nz = Math.max(8, Math.round(n * d / w)), hx = w / nx, hz = d / nz;
  const P = [], idx = [], map = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
  const vert = (i, j) => { const k = j * (nx + 1) + i; if (map[k] < 0) { map[k] = P.length / 2; P.push(-w / 2 + i * hx, -d / 2 + j * hz); } return map[k]; };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (sdf(-w / 2 + (i + 0.5) * hx, -d / 2 + (j + 0.5) * hz) > 0) continue;
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), e = vert(i + 1, j + 1);
    idx.push(a, c, b, b, c, e);
  }
  // the rim: every vertex on an edge only one triangle uses goes onto the outline, in or out
  const edges = new Map(), key = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const e = key(idx[t + k], idx[t + (k + 1) % 3]); edges.set(e, (edges.get(e) || 0) + 1); }
  const rim = new Set(); for (const [e, n] of edges) if (n === 1) { rim.add(Math.floor(e / 1e6)); rim.add(e % 1e6); }
  for (const v of rim) {
    let x = P[v * 2], z = P[v * 2 + 1];
    for (let it = 0; it < 4; it++) { const s = sdf(x, z), e = 1e-4, gx = (sdf(x + e, z) - s) / e, gz = (sdf(x, z + e) - s) / e, gl = Math.hypot(gx, gz) || 1; x -= gx / gl * s; z -= gz / gl * s; }
    P[v * 2] = x; P[v * 2 + 1] = z;
  }
  const low = (x, z) => { let h = 0; for (const b of bumps) h += b.a * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (b.s * b.s)); return h; };
  const crest = (x, z) => {
    let h = 0;
    for (const f of creases) {
      const dx = x - f.x, dz = z - f.z, t = (dx * f.c + dz * f.s) / f.L, u = Math.abs(-dx * f.s + dz * f.c - f.bend * t * t) / f.wd;   // a gently bowed ridge
      if (t * t >= 1 || u >= 1) continue;
      h += f.A * (1 - t * t) ** 1.5 * (1 - u) ** 2 * (1 + 2 * u);
    }
    return h;
  };
  const height = (x, z) => 0.002 + smooth(0, 0.04, -sdf(x, z)) * (low(x, z) + crest(x, z) + 0.004 * fbm(x * 7, z * 7, seed + 5));
  const shoved = (x, z) => [x + (fbm(x * 3, z * 3, seed + 9) - 0.5) * shove * 2, z + (fbm(x * 3 + 5, z * 3, seed + 9) - 0.5) * shove * 2];
  const N = P.length / 2, pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), col = new Float32Array(N * 3), ring = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(k * 1.047), Math.sin(k * 1.047)]);
  for (let v = 0; v < N; v++) {
    const x0 = P[v * 2], z0 = P[v * 2 + 1], h = height(x0, z0), [x, z] = shoved(x0, z0);
    pos.set([x, h, z], v * 3); uv.set([x0, z0], v * 2);
    let avg = 0; for (const [cx, cz] of ring) avg += height(x0 + cx * 0.025, z0 + cz * 0.025); avg /= ring.length;
    let c = Math.max(0.35, Math.min(1.1, 0.88 + (h - avg) * 22)) * (0.8 + 0.2 * smooth(0, 0.012, -sdf(x0, z0)));
    if (shade) c *= shade(x0, z0);
    col.set([c, c, c], v * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return { geo, height, shoved };
}
// a print laid onto a garment's folds: the garment's own triangles inside a rectangle, lifted 1.5 mm, textured
function printOn(THREE, gm, tex, cx, cz, pw, pd) {
  const src = gm.geo, P = src.attributes.position, U = src.attributes.uv, I = src.index.array, keep = [];
  const inside = (k) => Math.abs(U.getX(k) - cx) < pw / 2 && Math.abs(U.getY(k) - cz) < pd / 2;
  for (let t = 0; t < I.length; t += 3) if (inside(I[t]) && inside(I[t + 1]) && inside(I[t + 2])) keep.push(I[t], I[t + 1], I[t + 2]);
  const g = new THREE.BufferGeometry(), N = src.attributes.normal, pos = new Float32Array(P.count * 3), uv = new Float32Array(P.count * 2);
  for (let k = 0; k < P.count; k++) { pos.set([P.getX(k) + N.getX(k) * 0.0015, P.getY(k) + N.getY(k) * 0.0015, P.getZ(k) + N.getZ(k) * 0.0015], k * 3); uv.set([(U.getX(k) - cx) / pw + 0.5, 0.5 - (U.getY(k) - cz) / pd], k * 2); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('normal', N.clone()); g.setIndex(keep);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.castShadow = false; return m;
}

const SHIRT = (x, z) => {                       // a tee, flat lay, collar toward -z
  let s = sdBox(x, z, 0, 0.04, 0.23, 0.3, 0.03);
  s = smin(s, sdBox(x, z, -0.27, -0.17, 0.12, 0.075, 0.02, 0.55)); s = smin(s, sdBox(x, z, 0.27, -0.17, 0.12, 0.075, 0.02, -0.55));
  return Math.max(s, -sdCircle(x, z, 0, -0.3, 0.075));
};
const HOODIE = (x, z) => {
  let s = sdBox(x, z, 0, 0.06, 0.26, 0.32, 0.04);
  s = smin(s, sdSeg(x, z, -0.22, -0.2, -0.5, 0.2, 0.07), 0.05); s = smin(s, sdSeg(x, z, 0.22, -0.2, 0.42, 0.3, 0.07), 0.05);
  return smin(s, sdCircle(x, z, 0, -0.33, 0.15), 0.06);
};
const JEANS = (x, z) => smin(smin(sdBox(x, z, 0, -0.36, 0.2, 0.06, 0.015), sdBox(x, z, -0.11, 0.06, 0.095, 0.4, 0.02, 0.06), 0.06), sdBox(x, z, 0.13, 0.04, 0.095, 0.39, 0.02, -0.12), 0.06);
const SHEET = (x, z) => sdBox(x, z, 0, 0, 0.6, 0.5, 0.04);

function tee(ctx, { seed, color, art }) {
  const { THREE, surface } = ctx, g = new THREE.Group();
  const gm = garment(THREE, { sdf: SHIRT, w: 0.82, d: 0.7, n: 80, seed, loft: 0.05, fold: 0.018, folds: 11, bunch: 4, shove: 0.045 });
  g.add(new THREE.Mesh(gm.geo, surface('jersey', { color, vertexColors: true })));
  if (art != null) g.add(printOn(THREE, gm, canvasTex(THREE, 256, 256, (x, w, h) => printArt(x, w, h, art)), 0, 0.02, 0.2, 0.2));
  return g;
}
function hoodie(ctx, { seed, color }) {
  const { THREE, surface } = ctx, g = new THREE.Group();
  const shade = (x, z) => {
    let c = 1 - 0.75 * smooth(0.02, -0.02, sdCircle(x, z, 0, -0.36, 0.085));                  // inside the hood
    c *= 1 - 0.5 * smooth(0.006, 0, Math.abs(sdBox(x, z, 0, 0.2, 0.15, 0.08, 0.02)));           // the pocket's seam
    c *= 1 - 0.4 * smooth(0.008, 0, Math.abs(z - 0.36));                                         // the waistband
    return c;
  };
  const gm = garment(THREE, { sdf: HOODIE, w: 1.08, d: 0.86, seed, loft: 0.07, fold: 0.024, folds: 14, bunch: 5, shove: 0.05, shade });
  g.add(new THREE.Mesh(gm.geo, surface('fleece', { color, vertexColors: true })));
  g.add(printOn(THREE, gm, canvasTex(THREE, 256, 256, (x, w, h) => { drawFace(x, w / 2, h * 0.42, w * 0.34, {}); }), 0, -0.06, 0.16, 0.16));
  const cord = new THREE.MeshStandardMaterial({ color: 0xe9e6dd, roughness: 0.7 });
  for (const s of [-1, 1]) {                                                                  // drawstrings, lying on the folds
    const pts = []; for (let k = 0; k <= 12; k++) { const x0 = s * (0.035 + k * 0.004), z0 = -0.2 + k * 0.017, [x, z] = gm.shoved(x0, z0); pts.push(new THREE.Vector3(x, gm.height(x0, z0) + 0.004, z)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.003, 5), cord));
  }
  return g;
}
function jeans(ctx, { seed }) {
  const { THREE, surface } = ctx;
  const shade = (x, z) => 1 - 0.35 * smooth(0.006, 0, Math.abs(z + 0.3)) - 0.3 * smooth(0.005, 0, Math.abs(sdSeg(x, z, 0, -0.3, 0.01, -0.1, 0)));
  const gm = garment(THREE, { sdf: JEANS, w: 0.5, d: 0.98, seed, loft: 0.035, fold: 0.018, folds: 12, bunch: 4, shove: 0.04, shade });
  return new THREE.Group().add(new THREE.Mesh(gm.geo, surface('denim', { vertexColors: true })));
}
function sheet(ctx, { seed, name = 'gingham', color = null }) {
  const { THREE, surface } = ctx;
  const gm = garment(THREE, { sdf: SHEET, w: 1.22, d: 1.02, n: 80, seed, loft: 0.08, fold: 0.032, folds: 18, bunch: 6, shove: 0.07 });
  return new THREE.Group().add(new THREE.Mesh(gm.geo, surface(name, { color, vertexColors: true })));
}

// paper: a sheet with a little curl (the corners lift), front printed, back plain
function paper(THREE, w, d, tex, { curl = 0.006, gloss = 0.5, seed = 1 } = {}) {
  const geo = new THREE.PlaneGeometry(w, d, 8, 8); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, R = mulberry(seed), cx = (R() - 0.5) * 2, cz = (R() - 0.5) * 2;
  for (let k = 0; k < p.count; k++) { const u = p.getX(k) / (w / 2), v = p.getZ(k) / (d / 2); p.setY(k, 0.0006 + curl * Math.max(0, (u * cx + v * cz) * 0.5 + 0.2) ** 2 * 1.4 + curl * 0.3 * u * u); }
  geo.computeVertexNormals();
  const back = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8, side: THREE.BackSide });
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: gloss })), new THREE.Mesh(geo, back));
  return g;
}
function magazine(THREE, i, { w = 0.21, d = 0.275, t = 0.004 } = {}) {
  const tex = canvasTex(THREE, 512, 672, (x, cw, ch) => cover(x, cw, ch, i));
  const edge = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.9 }), back = new THREE.MeshStandardMaterial({ color: [0x1f33ff, 0xf4f3ef, 0x111111, 0xff4fa3][i % 4], roughness: 0.4 });
  const geo = new THREE.BoxGeometry(w, t, d); geo.translate(0, t / 2, 0);
  return new THREE.Mesh(geo, [edge, edge, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }), back, edge, edge]);
}
function magazines(ctx, { n, seed }) {
  const { THREE } = ctx, g = new THREE.Group(), R = mulberry(seed); let y = 0;
  for (let k = 0; k < n; k++) { const m = magazine(THREE, seed + k, { t: 0.003 + R() * 0.003 }); m.position.set((R() - 0.5) * 0.03, y, (R() - 0.5) * 0.03); m.rotation.y = (R() - 0.5) * 0.35; y += m.geometry.parameters.height; g.add(m); }
  return g;
}

function rug(ctx, { w, d, round = false, draw, base = 'carpet', pile = 0.012 }) {
  const { THREE, surface } = ctx;
  const tex = canvasTex(THREE, 1024, Math.round(1024 * d / w), draw); tex.repeat.set(1 / w, 1 / d); tex.offset.set(0.5, 0.5);
  const top = surface(base, { map: tex });
  let geo;
  if (round) { const s = new THREE.Shape(); s.absellipse(0, 0, w / 2, d / 2, 0, Math.PI * 2); geo = new THREE.ExtrudeGeometry(s, { depth: pile, bevelEnabled: true, bevelThickness: pile * 0.4, bevelSize: pile * 0.8, bevelSegments: 3, curveSegments: 72 }); }
  else { const s = new THREE.Shape(), r = 0.02; s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    geo = new THREE.ExtrudeGeometry(s, { depth: pile, bevelEnabled: true, bevelThickness: pile * 0.4, bevelSize: pile * 0.8, bevelSegments: 3 }); }
  geo.rotateX(-Math.PI / 2); geo.computeBoundingBox(); geo.translate(0, -geo.boundingBox.min.y, 0);
  const p = geo.attributes.position, uv = geo.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k), -p.getZ(k));   // metres, for both the pattern and the pile
  return new THREE.Group().add(new THREE.Mesh(geo, top));
}

function beanbag(ctx, { color, seed }) {
  // a sphere sat in: the bottom flattened onto the floor and spread, a hollow where you sit, the back still standing up
  const { THREE, surface } = ctx, geo = new THREE.SphereGeometry(0.42, 64, 40), p = geo.attributes.position, uv = geo.attributes.uv;
  for (let k = 0; k < p.count; k++) {
    let x = p.getX(k), y = p.getY(k), z = p.getZ(k); const a = Math.atan2(z, x), up = Math.max(0, y) / 0.42;
    const wr = 1 + 0.03 * (fbm(a * 3 + 9, y * 8, seed) - 0.5) + 0.012 * Math.sin(a * 13 + y * 24);          // wrinkles
    let ny = y < 0 ? y * 0.3 : y * 0.92;
    ny += 0.07 * Math.exp(-((z + 0.3) ** 2) / 0.04) * up;                                                  // the back
    ny -= 0.15 * Math.exp(-((x * 0.9) ** 2 + (z - 0.06) ** 2) / 0.05) * smooth(0.1, 0.6, up);               // the seat's hollow
    const spread = (y < 0 ? 1.1 : 1.1 - 0.22 * up) * wr;
    x *= spread; z *= spread; p.setXYZ(k, x, ny, z); uv.setXY(k, x + ny * 0.6, z - ny * 0.6);               // no pinch at the top
  }
  geo.computeBoundingBox(); geo.translate(0, -geo.boundingBox.min.y, 0); geo.computeVertexNormals();
  return new THREE.Group().add(new THREE.Mesh(geo, surface('fleece', { color })));
}
// the :3 face as a plush cushion: a soft rounded triangle in silver fleece, the face embroidered on
function triPlush(ctx) {
  const { THREE, surface } = ctx, s = new THREE.Shape(), r = 0.17, k = Math.sqrt(3) / 2;
  const P = [[-r, r * 0.55], [r, r * 0.55], [0, r * 0.55 - 2 * r * k]];          // y up: the point at the bottom, like the face
  const rr = 0.045; for (let i = 0; i < 3; i++) {
    const p = P[i], a = P[(i + 2) % 3], b = P[(i + 1) % 3], da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const p1 = [p[0] + (a[0] - p[0]) / da * rr, p[1] + (a[1] - p[1]) / da * rr], p2 = [p[0] + (b[0] - p[0]) / db * rr, p[1] + (b[1] - p[1]) / db * rr];
    i ? s.lineTo(...p1) : s.moveTo(...p1); s.quadraticCurveTo(p[0], p[1], ...p2);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 10, curveSegments: 16 });
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.7 * pos.getZ(i), pos.getY(i) + 0.7 * pos.getZ(i));
  geo.rotateX(-Math.PI / 2); geo.computeVertexNormals(); geo.computeBoundingBox();
  const bb = geo.boundingBox, cz = (bb.min.z + bb.max.z) / 2; geo.translate(0, -bb.min.y, -cz);
  const g = new THREE.Group(), body = new THREE.Mesh(geo, surface('fleece', { color: 0xc9ccd4 }));
  g.add(body);
  const tex = canvasTex(THREE, 256, 256, (x, w, h) => {
    // drawFace's proportions, in a 0.4 m square centred where the triangle's own centre (cy) sits
    const u = w / 0.4, ew = 0.17 * r * u, eh = 0.3 * r * u, c0 = w / 2; x.fillStyle = '#16171c';
    for (const sx of [-1, 1]) { x.beginPath(); x.roundRect(c0 + sx * 0.3 * r * u - ew / 2, c0 - 0.32 * r * u, ew, eh, ew * 0.3); x.fill(); }
    x.lineWidth = 0.07 * r * u; x.strokeStyle = '#16171c'; x.lineCap = 'round'; const mr = 0.13 * r * u, my = c0 + 0.12 * r * u;
    x.beginPath(); x.arc(w / 2 - mr, my, mr, 0, Math.PI); x.stroke(); x.beginPath(); x.arc(w / 2 + mr, my, mr, 0, Math.PI); x.stroke();
  });
  const top = bb.max.y - bb.min.y, fp = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 0.9 }));
  fp.position.set(0, top + 0.0015, -cz); fp.castShadow = false; g.add(fp);
  return g;
}
// a bear-ish plush, sitting: teddy pile, button eyes
function plushBear(ctx, { color = 0xd9b48a } = {}) {
  const { THREE, surface } = ctx, m = surface('teddy', { color }), g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.2 });
  const blob = (r, x, y, z, sx = 1, sy = 1, sz = 1) => { const geo = new THREE.SphereGeometry(r, 28, 18); const uv = geo.attributes.uv, p = geo.attributes.position; for (let k = 0; k < p.count; k++) uv.setXY(k, Math.atan2(p.getZ(k), p.getX(k)) * r, p.getY(k)); const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); g.add(o); return o; };
  blob(0.085, 0, 0.085, 0, 1, 1.05, 0.9);                    // body
  blob(0.065, 0, 0.215, 0.01);                               // head
  blob(0.024, -0.05, 0.27, 0.0, 1, 1, 0.6); blob(0.024, 0.05, 0.27, 0.0, 1, 1, 0.6);   // ears
  blob(0.03, 0, 0.2, 0.06, 1, 0.8, 0.8);                     // muzzle
  blob(0.03, -0.085, 0.11, 0.03, 0.8, 1.4, 0.8).rotation.z = 0.5; blob(0.03, 0.085, 0.11, 0.03, 0.8, 1.4, 0.8).rotation.z = -0.5;   // arms
  blob(0.035, -0.05, 0.03, 0.07, 0.9, 0.8, 1.4); blob(0.035, 0.05, 0.03, 0.07, 0.9, 0.8, 1.4);                                        // legs
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), dark); e.position.set(s * 0.025, 0.23, 0.062); g.add(e); }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), dark); nose.position.set(0, 0.205, 0.09); nose.scale.set(1.3, 0.8, 0.8); g.add(nose);
  return g;
}
const TITLES = ['LEARN JAVASCRIPT', 'Music Theory', 'SYNTHESIS', 'The Bedroom Producer', 'HTML in a Weekend', 'Sound on Sound', 'DRAWING', 'Year Book 2003'];
function books(ctx, { n, seed }) {
  // hardbacks and paperbacks: boards a little bigger than the block of pages, a spine, a printed title
  const { THREE } = ctx, g = new THREE.Group(), R = mulberry(seed), pages = new THREE.MeshStandardMaterial({ color: 0xece4cf, roughness: 0.95 }); let y = 0;
  const cols = ['#1f33ff', '#e3122e', '#141416', '#f2e86a', '#2f7d12', '#ff4fa3', '#e9e6de', '#5a3bff'];
  for (let k = 0; k < n; k++) {
    const w = 0.13 + R() * 0.08, d = 0.19 + R() * 0.07, t = 0.015 + R() * 0.03, hard = R() < 0.6, bt = hard ? 0.0025 : 0.0008, lip = hard ? 0.003 : 0.0005;
    const col = cols[Math.floor(R() * cols.length)], title = TITLES[(seed * 3 + k) % TITLES.length], style = ['blue', 'times', 'caps', 'green'][k % 4];
    const tex = canvasTex(THREE, 256, Math.round(256 * d / w), (x, cw, ch) => {
      x.fillStyle = col; x.fillRect(0, 0, cw, ch); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, ch * 0.7, cw, ch * 0.06);
      plate(x, style, title, cw / 2, ch * 0.3, ch * 0.09, { fill: col === '#e9e6de' || col === '#f2e86a' ? '#141416' : '#ffffff', maxW: cw * 0.86 });
    });
    const board = new THREE.MeshStandardMaterial({ color: col, roughness: hard ? 0.5 : 0.35 }), front = new THREE.MeshStandardMaterial({ map: tex, roughness: hard ? 0.5 : 0.35 });
    const b = new THREE.Group(), slab = (yy, m) => { const s = new THREE.Mesh(new THREE.BoxGeometry(w, bt, d), m); s.position.y = yy; b.add(s); };
    slab(bt / 2, board); slab(t - bt / 2, [board, board, front, board, board, board]);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(bt, t, d), board); spine.position.set(-w / 2 + bt / 2, t / 2, 0); b.add(spine);
    const block = new THREE.Mesh(new THREE.BoxGeometry(w - bt - lip, t - 2 * bt, d - 2 * lip), pages); block.position.set(bt / 2 - lip / 2, t / 2, 0); b.add(block);
    b.position.set((R() - 0.5) * 0.03, y, (R() - 0.5) * 0.03); b.rotation.y = (R() - 0.5) * 0.4; y += t; g.add(b);
  }
  return g;
}

const DAISY = (x, w, h) => {                       // a teenage rug: pastel checks with daisies
  const n = 8, cw = w / n, ch = h / Math.round(n * h / w);
  for (let j = 0; j * ch < h; j++) for (let i = 0; i < n; i++) { x.fillStyle = (i + j) % 2 ? '#ffd1e8' : '#a9dcff'; x.fillRect(i * cw, j * ch, cw + 1, ch + 1); }
  for (let j = 0; j * ch < h; j++) for (let i = 0; i < n; i++) if ((i + j) % 2 === 0) {
    const cx = (i + 0.5) * cw, cy = (j + 0.5) * ch, r = cw * 0.3; x.fillStyle = '#fff';
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; x.beginPath(); x.ellipse(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, r * 0.42, r * 0.2, a, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#ffe10a'; x.beginPath(); x.arc(cx, cy, r * 0.28, 0, Math.PI * 2); x.fill();
  }
  x.strokeStyle = '#ff4fa3'; x.lineWidth = w * 0.025; x.strokeRect(0, 0, w, h);
};
const RAG = (x, w, h) => {                         // a rag rug: stripes of old t-shirts, a fringe at the ends
  const cols = ['#ff7ab8', '#a9dcff', '#fff27a', '#c7a6ff', '#ffffff', '#7dff9a'], n = 22;
  for (let i = 0; i < n; i++) { x.fillStyle = cols[(i * 7) % cols.length]; x.fillRect(i * w / n, 0, w / n + 1, h); for (let k = 0; k < h; k += 6) { x.fillStyle = `rgba(0,0,0,${0.05 + 0.07 * ((k / 6 + i) % 2)})`; x.fillRect(i * w / n, k, w / n, 3); } }
  x.fillStyle = 'rgba(255,255,255,.5)'; for (let k = 0; k < h; k += 5) { x.fillRect(0, k, w * 0.02, 2); x.fillRect(w * 0.98, k, w * 0.02, 2); }
};
const SHAG = (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, '#ff7ac2'); g.addColorStop(1, '#ff4fa3'); x.fillStyle = g; x.fillRect(0, 0, w, h); };
const FACE_RUG = (x, w, h) => { x.fillStyle = '#1f33ff'; x.fillRect(0, 0, w, h); drawFace(x, w / 2, h * 0.42, w * 0.32, {}); };

// name -> maker; every call makes a fresh template (props.js keeps one and clones it)
export const MADE = {
  tee_white: (c) => tee(c, { seed: 3, color: 0xf2f0ea, art: 0 }),
  tee_black: (c) => tee(c, { seed: 7, color: 0x18181b, art: 5 }),
  tee_pink: (c) => tee(c, { seed: 11, color: 0xff7ab8, art: null }),
  tee_blue: (c) => tee(c, { seed: 19, color: 0x3d63d8, art: 3 }),
  hoodie: (c) => hoodie(c, { seed: 5, color: 0x1a1a1e }),
  hoodie_grey: (c) => hoodie(c, { seed: 13, color: 0xa7a9ad }),
  jeans: (c) => jeans(c, { seed: 2 }),
  blanket: (c) => sheet(c, { seed: 4 }),
  duvet_pink: (c) => sheet(c, { seed: 9, name: 'jersey', color: 0xffb3d6 }),
  magazine: (c) => magazines(c, { n: 1, seed: 1 }),
  magazine_2: (c) => magazines(c, { n: 1, seed: 2 }),
  magazine_3: (c) => magazines(c, { n: 1, seed: 3 }),
  magazine_4: (c) => magazines(c, { n: 1, seed: 4 }),
  magazine_stack: (c) => magazines(c, { n: 7, seed: 21 }),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [`print_${i}`, (c) => {
    const big = i >= 2, w = big ? 0.21 : 0.15, d = big ? 0.297 : 0.1;
    return paper(c.THREE, w, d, canvasTex(c.THREE, big ? 512 : 384, big ? 724 : 256, (x, cw, ch) => printArt(x, cw, ch, i)), { gloss: big ? 0.6 : 0.3, seed: i + 1, curl: big ? 0.008 : 0.004 });
  }])),
  rug_daisy: (c) => rug(c, { w: 1.4, d: 1.0, draw: DAISY }),
  rug_face: (c) => rug(c, { w: 1.1, d: 0.8, draw: FACE_RUG }),
  rug_rag: (c) => rug(c, { w: 1.7, d: 0.95, draw: RAG }),
  rug_shag: (c) => rug(c, { w: 1.2, d: 1.2, round: true, draw: SHAG, base: 'carpet_pink', pile: 0.02 }),
  beanbag: (c) => beanbag(c, { color: 0xff4fa3, seed: 1 }),
  beanbag_blue: (c) => beanbag(c, { color: 0x1f33ff, seed: 2 }),
  plush_face: (c) => triPlush(c),
  plush_bear: (c) => plushBear(c),
  books: (c) => books(c, { n: 5, seed: 1 }),
  books_2: (c) => books(c, { n: 3, seed: 2 }),
};
// shared with the room's wall art (shell-art.js)
export { plate, sky, cover, mulberry, canvasTex };
