// The rest of a 1998-2004 desktop, each drawn on the GPU into its own picture (gpu.js runs them like the visualisers)
// and each moved by the music. Classic grey chrome, the 16-colour palette, the system font; no logos, no product names.
//   pipes      the 3D pipes screensaver: a real little scene of shaded pipes, a joint on every beat
//   stars      the starfield: its speed is the bass
//   mystify    two polygons bouncing round the screen with their trails, faster with the level, recoloured on the beat
//   maze       a brick maze walked in first person, one step or turn on every eighth note
//   bounce     the bouncing logo, timed backwards from the drop so it lands exactly in the corner on the downbeat
//   defrag     the defragmenter: a block read (red) and written (green) on each step of the bar's pattern
//   copy       the file-copy dialog, a page flying from folder to folder on every beat
//   download   the download manager: speeds and the throughput graph follow the level
//   burn       a disc being written: progress, and a buffer that drains on the kicks
//   scandisk   the blue text-mode surface scan, a row of clusters a bar, bad ones marked on the big hits
//   solitaire  the winning cascade: cards thrown off the foundations by the jig's two big hits, bouncing, leaving trails
//   mines      the mine field cleared on the beat, blown up on the drop
//   webcam     the room seen from the lead computer's own webcam: tiny, four frames a second, blown out
//   mplayer    a media player's visualisations: bars, an ambience swirl, the visitor's album art
// Each entry: w, h (its picture), frag (drawn over its chrome, layout 384 x 288), uniforms(), init(viz, ch),
// feed(dt, fx, viz, ch) on the CPU, sig(fx, viz, ch) + paint(x, fx, viz, ch, trk) for the chrome canvas, render(r, viz, ch, draw).
import * as THREE from 'three';
import { art } from '../art.js';

export const SANS = '"Microsoft Sans Serif", "MS Sans Serif", Tahoma, Arial, sans-serif', DOS = '"VT323", "Lucida Console", monospace';
const fonts = () => (document.fonts && document.fonts.status === 'loaded' ? 1 : 0);
const fmt = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
const rng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// how many times v crossed a whole number since last asked (0 after a seek backwards or a jump)
const ticks = (S, k, v) => { const n = Math.floor(v), d = S[k] == null ? 0 : n - S[k]; S[k] = n; return d > 0 && d < 8 ? d : 0; };
// the song's grid: sixteenth, bar, which bar of the 4-5-6-2 jig, the drops
const grid = (fx) => { const six = Math.floor((fx.beat || 0) * 4), bar = Math.floor(six / 16); return { six, bar, step: six - bar * 16, g: ((bar % 4) + 4) % 4 }; };
const drops = (fx) => (fx.song?.m.cues || []).filter((c) => c.k > 0.5).map((c) => c.t1);

// ---------- the classic chrome, on canvas ----------
const GREY = '#c0c0c0';
export function bevel(x, X, Y, w, h, up = true) {
  const [a, b, c, d] = up ? ['#dfdfdf', '#000', '#fff', '#808080'] : ['#808080', '#fff', '#000', '#dfdfdf'];
  x.fillStyle = a; x.fillRect(X, Y, w, 1); x.fillRect(X, Y, 1, h);
  x.fillStyle = b; x.fillRect(X, Y + h - 1, w, 1); x.fillRect(X + w - 1, Y, 1, h);
  x.fillStyle = c; x.fillRect(X + 1, Y + 1, w - 2, 1); x.fillRect(X + 1, Y + 1, 1, h - 2);
  x.fillStyle = d; x.fillRect(X + 1, Y + h - 2, w - 2, 1); x.fillRect(X + w - 2, Y + 1, 1, h - 2);
}
export function button(x, X, Y, w, h, label, down = false) {
  x.fillStyle = GREY; x.fillRect(X, Y, w, h); bevel(x, X, Y, w, h, !down);
  if (label) { x.fillStyle = '#000'; x.font = `11px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, X + w / 2 + (down ? 1 : 0), Y + h / 2 + 1); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; }
}
// a window: grey frame, the navy title bar fading to blue, the caption buttons; returns its client area
export function win(x, X, Y, w, h, title, { buttons = 3, active = true } = {}) {
  x.fillStyle = GREY; x.fillRect(X, Y, w, h); bevel(x, X, Y, w, h);
  const g = x.createLinearGradient(X + 3, 0, X + w - 3, 0); g.addColorStop(0, active ? '#000080' : '#808080'); g.addColorStop(1, active ? '#1084d0' : '#b5b5b5');
  x.fillStyle = g; x.fillRect(X + 3, Y + 3, w - 6, 18);
  x.fillStyle = '#fff'; x.font = `bold 11px ${SANS}`; x.textBaseline = 'middle'; x.fillText(title, X + 7, Y + 12.5, w - 70); x.textBaseline = 'alphabetic';
  for (let i = 0; i < buttons; i++) {
    const bx = X + w - 21 - i * 16 - (i ? 2 : 0), by = Y + 5; button(x, bx, by, 16, 14); x.fillStyle = '#000';
    if (i === 0) { x.save(); x.strokeStyle = '#000'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(bx + 4.5, by + 3.5); x.lineTo(bx + 11, by + 10); x.moveTo(bx + 11, by + 3.5); x.lineTo(bx + 4.5, by + 10); x.stroke(); x.restore(); }
    else if (i === 1) { x.fillRect(bx + 3, by + 2, 9, 2); x.fillRect(bx + 3, by + 2, 1, 9); x.fillRect(bx + 11, by + 2, 1, 9); x.fillRect(bx + 3, by + 10, 9, 1); }
    else x.fillRect(bx + 4, by + 9, 6, 2);
  }
  return { x: X + 4, y: Y + 24, w: w - 8, h: h - 28 };
}
export const sunken = (x, X, Y, w, h, fill = '#fff') => { x.fillStyle = fill; x.fillRect(X, Y, w, h); bevel(x, X, Y, w, h, false); };
const text = (x, s, X, Y, { size = 11, bold = false, color = '#000', font = SANS, align = 'left' } = {}) => { x.font = `${bold ? 'bold ' : ''}${size}px ${font}`; x.fillStyle = color; x.textAlign = align; x.fillText(s, X, Y); x.textAlign = 'left'; };
const desk = (x) => { x.fillStyle = '#008080'; x.fillRect(0, 0, 384, 288); };     // the teal desktop behind a dialog
function folder(x, X, Y, s = 1) {
  x.save(); x.translate(X, Y); x.scale(s, s);
  x.fillStyle = '#c8a000'; x.fillRect(0, 2, 14, 5); x.fillStyle = '#ffe080'; x.fillRect(0, 6, 34, 24); x.fillStyle = '#c8a000'; x.fillRect(0, 29, 34, 2); x.fillRect(33, 6, 2, 25);
  x.fillStyle = '#fff3b0'; x.fillRect(1, 7, 32, 2); x.restore();
}

// GLSL shared by the pictures below (after gpu.js's HEAD: uData, uTime, uBeat, uKick, uLow, uMid, uHigh, uAlive, uCalm, rect...)
export const G = `
uniform sampler2D uChrome;
vec2 L() { return vec2(vUv.x * 384.0, (1.0 - vUv.y) * 288.0); }
vec4 chromeAt(vec2 p) { return texture(uChrome, vec2(p.x / 384.0, 1.0 - p.y / 288.0)); }
// the classic progress bar: navy chunks in a sunken box (x, y, w, h), filled to v
vec3 chunks(vec3 c, vec2 p, vec4 r, float v, vec3 col) {
  float k = floor((p.x - r.x - 2.0) / 9.0), f = p.x - r.x - 2.0 - k * 9.0, n = floor(v * (r.z - 4.0) / 9.0 + 0.999);
  float in_ = rect(p, vec4(r.x + 2.0, r.y + 2.0, r.z - 4.0, r.w - 4.0)) * step(f, 7.0) * step(k, n - 1.0) * step(0.0, k);
  return mix(c, col, in_);
}
float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// the pictures are written in linear light (their targets store sRGB): a colour picked by eye goes through this
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
`;

// ---------- the pictures ----------
export const ERA = {};

// 3D pipes: a scene of its own, rendered into the picture; a joint on every beat, two cells a beat between
ERA.pipes = {
  init(viz, ch) {
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0, 0, 0);
    const cam = new THREE.PerspectiveCamera(42, 4 / 3, 0.5, 60); cam.position.set(1.0, 0.7, 12.2); cam.lookAt(0, 0, 0);
    sc.add(new THREE.AmbientLight(0xffffff, 0.35)); const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(4, 6, 8); sc.add(d);
    const mat = new THREE.MeshPhongMaterial({ shininess: 70, specular: 0x777777 });
    const N = 260, cyl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 14, 1, true), mat, N), ball = new THREE.InstancedMesh(new THREE.SphereGeometry(0.29, 16, 12), mat, N);
    for (const m of [cyl, ball]) { m.count = 0; m.frustumCulled = false; m.setColorAt(0, new THREE.Color()); sc.add(m); }
    ch.s = { sc, cam, cyl, ball, R: rng(7), cells: new Set(), pipes: [], nc: 0, nb: 0, grow: 0 };
    this.reset(ch.s);
  },
  reset(S) { S.cells.clear(); S.pipes = []; S.cyl.count = 0; S.ball.count = 0; this.spawn(S); },
  spawn(S) {
    const C = [[1, 0.1, 0.1], [0.1, 0.85, 0.15], [0.15, 0.3, 1], [1, 0.85, 0.1], [0.1, 0.9, 0.9], [1, 0.2, 0.9], [0.95, 0.95, 0.95]];
    for (let k = 0; k < 20; k++) {
      const p = [0, 1, 2].map(() => Math.floor(S.R() * 9) - 4); if (S.cells.has(p.join())) continue;
      S.cells.add(p.join()); const col = new THREE.Color(...C[Math.floor(S.R() * C.length)]);
      S.pipes.push({ p, d: this.dir(S, p, null), col }); this.ball(S, p, col); return true;
    }
    return false;
  },
  dir(S, p, d) {        // keep going or turn; never into a cell already taken
    const D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].filter((v) => { const q = p.map((x, i) => x + v[i]); return q.every((x) => Math.abs(x) <= 4) && !S.cells.has(q.join()); });
    if (!D.length) return null;
    const turn = D.filter((v) => !d || v.join() !== d.join()), pool = turn.length && S.R() < 0.85 ? turn : D; return pool[Math.floor(S.R() * pool.length)];
  },
  ball(S, p, col) { const m = new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]), i = S.ball.count++; if (i >= 260) return; S.ball.setMatrixAt(i, m); S.ball.setColorAt(i, col); S.ball.instanceMatrix.needsUpdate = S.ball.instanceColor.needsUpdate = true; },
  seg(S, a, d, len, col, i) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
    m.compose(new THREE.Vector3(a[0] + d[0] * len / 2, a[1] + d[1] * len / 2, a[2] + d[2] * len / 2), q, new THREE.Vector3(1, Math.max(0.001, len), 1));
    S.cyl.setMatrixAt(i, m); S.cyl.setColorAt(i, col); S.cyl.instanceMatrix.needsUpdate = S.cyl.instanceColor.needsUpdate = true;
  },
  feed(dt, fx, viz, ch) {
    const S = ch.s, beats = ticks(S, 'beat', fx.beat || fx.time * 2.27), half = ticks(S, 'half', (fx.beat || fx.time * 2.27) * 2);
    const pipe = S.pipes[S.pipes.length - 1]; if (!pipe) return;
    if (beats && grid(fx).step === 0 && (S.cyl.count > 210 || S.dead)) { S.dead = false; this.reset(S); return; }   // full: the screen clears on a downbeat
    if (beats && grid(fx).step === 0 && grid(fx).bar % 2 === 0 && S.pipes.length < 7 && pipe.d && S.cyl.count > 8) { if (S.cur) { this.seg(S, pipe.p, pipe.d, 1, pipe.col, S.cur.i); pipe.p = pipe.p.map((x, i) => x + pipe.d[i]); S.cur = null; } this.ball(S, pipe.p, pipe.col); if (this.spawn(S)) return; }   // every two bars a new pipe sets off
    if (half) {                                       // a cell done: take it; on the beat a joint and maybe a turn
      if (S.cur) { S.cur = null; pipe.p = pipe.p.map((x, i) => x + pipe.d[i]); }
      if (beats) { this.ball(S, pipe.p, pipe.col); pipe.d = this.dir(S, pipe.p, pipe.d); } else if (!pipe.d || S.cells.has(pipe.p.map((x, i) => x + pipe.d[i]).join()) || pipe.p.some((x, i) => Math.abs(x + pipe.d[i]) > 4)) { this.ball(S, pipe.p, pipe.col); pipe.d = this.dir(S, pipe.p, pipe.d); }
      if (!pipe.d) { if (S.pipes.length > 5 || !this.spawn(S)) S.dead = true; return; }
      const q = pipe.p.map((x, i) => x + pipe.d[i]); S.cells.add(q.join()); S.cur = { i: S.cyl.count++ };
      if (S.cur.i >= 260) { S.dead = true; S.cur = null; return; }
    }
    if (S.cur) { const ph = ((fx.beat || fx.time * 2.27) * 2) % 1; this.seg(S, pipe.p, pipe.d, ph, pipe.col, S.cur.i); }
  },
  render(r, viz, ch) { r.setRenderTarget(ch.rt); r.render(ch.s.sc, ch.s.cam); },
};

// the starfield: stars streaming out of the middle, streaking as the bass pushes them
ERA.stars = {
  uniforms: () => ({ uTravel: { value: 0 }, uSpeed: { value: 0.2 } }),
  feed(dt, fx, viz, ch) { const U = ch.mat.uniforms, v = 0.18 + 2.2 * Math.pow((fx.low || 0) * (fx.alive || 0), 2) + 0.8 * (fx.kick || 0) * (fx.alive || 0); U.uSpeed.value += (v - U.uSpeed.value) * (1 - Math.exp(-dt * 8)); U.uTravel.value += dt * U.uSpeed.value; },
  frag: `uniform float uTravel, uSpeed;
void main() {
  vec2 p = (vUv - 0.5) * vec2(4.0 / 3.0, 1.0); vec3 c = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float z = fract(float(i) / 7.0 - uTravel * 0.35), zp = z + uSpeed * 0.035 + 0.004;   // depth now, and a moment ago
    vec2 w = p * z * 14.0, id = floor(w), o = vec2(hash1(id + float(i) * 17.0), hash1(id + float(i) * 31.0 + 5.0));
    if (hash1(id * 1.3 + float(i)) > 0.55) continue;
    vec2 s = (id + o) / (z * 14.0), s0 = (id + o) / (zp * 14.0);
    vec2 pa = p - s, ba = s0 - s; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0.0, 1.0), d = length(pa - ba * h);
    float b = smoothstep(1.0, 0.25, z) * smoothstep(0.0, 0.08, z);
    c += vec3(1.0, 0.97, 0.9) * b * smoothstep(0.0035 + 0.003 * (1.0 - z), 0.0, d) * (1.0 - 0.5 * h);
  }
  gl_FragColor = vec4(min(c, vec3(1.0)), 1.0);
}`,
};

// the polygons: two four-sided shapes with six echoes each, bouncing; the level sets the pace, each beat a new colour
ERA.mystify = {
  uniforms: () => ({ uP: { value: Array.from({ length: 56 }, () => new THREE.Vector2()) }, uC: { value: [new THREE.Color(), new THREE.Color()] } }),
  init(viz, ch) { const R = rng(3); ch.s = { R, poly: [0, 1].map(() => Array.from({ length: 4 }, () => ({ p: [R(), R()], v: [(R() - 0.5) * 0.5, (R() - 0.5) * 0.5] }))), hist: [], acc: 0, hue: [R(), R()] }; },
  feed(dt, fx, viz, ch) {
    const S = ch.s, sp = 0.5 + 2.2 * (fx.level || 0) * (fx.alive || 0) + 1.2 * (fx.kick || 0) * (fx.alive || 0), U = ch.mat.uniforms;
    for (const poly of S.poly) for (const v of poly) for (let k = 0; k < 2; k++) { v.p[k] += v.v[k] * dt * sp; if (v.p[k] < 0 || v.p[k] > 1) { v.v[k] *= -1; v.p[k] = Math.max(0, Math.min(1, v.p[k])); } }
    S.acc += dt; if (S.acc > 1 / 14) { S.acc = 0; S.hist.unshift(S.poly.map((pl) => pl.map((v) => [...v.p]))); S.hist.length = Math.min(S.hist.length, 7); }
    if (ticks(S, 'b', fx.beat || fx.time * 2)) S.hue = S.hue.map((h) => (h + 0.13 + S.R() * 0.1) % 1);
    for (let e = 0; e < 7; e++) { const h = S.hist[Math.min(e, S.hist.length - 1)] || S.poly.map((pl) => pl.map((v) => v.p)); for (let q = 0; q < 2; q++) for (let k = 0; k < 4; k++) U.uP.value[(q * 7 + e) * 4 + k].set(h[q][k][0], h[q][k][1]); }
    S.hue.forEach((h, i) => U.uC.value[i].setHSL(h, 1, 0.5));
  },
  frag: `uniform vec2 uP[56]; uniform vec3 uC[2];
float sg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  vec2 p = vec2(vUv.x * 384.0, vUv.y * 288.0); vec3 c = vec3(0.0);
  for (int q = 0; q < 2; q++) for (int e = 0; e < 7; e++) {
    float d = 1e9;
    for (int k = 0; k < 4; k++) { vec2 a = uP[(q * 7 + e) * 4 + k] * vec2(384.0, 288.0), b = uP[(q * 7 + e) * 4 + (k + 1) % 4] * vec2(384.0, 288.0); d = min(d, sg(p, a, b)); }
    c = max(c, uC[q] * smoothstep(1.3, 0.3, d));
  }
  gl_FragColor = vec4(c, 1.0);
}`,
};

// the maze: generated, then walked by keeping a hand on the right-hand wall; one move every eighth note
ERA.maze = {
  uniforms: () => ({ uMaze: { value: null }, uPos: { value: new THREE.Vector2(1.5, 1.5) }, uAng: { value: 0 } }),
  init(viz, ch) {
    const tex = new THREE.DataTexture(new Uint8Array(32 * 32), 32, 32, THREE.RedFormat); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    ch.mat.uniforms.uMaze.value = tex; ch.s = { tex, R: rng(11), n: 0 }; this.make(ch.s);
  },
  make(S) {
    const N = 23, m = S.tex.image.data; m.fill(1); const R = S.R, st = [[1, 1]]; m[1 * 32 + 1] = 0;
    while (st.length) {             // a perfect maze: carve from cell to unvisited cell, back up at dead ends
      const [x, y] = st[st.length - 1], nb = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => x + dx > 0 && x + dx < N - 1 && y + dy > 0 && y + dy < N - 1 && m[(y + dy) * 32 + x + dx]);
      if (!nb.length) { st.pop(); continue; }
      const [dx, dy] = nb[Math.floor(R() * nb.length)]; m[(y + dy / 2) * 32 + x + dx / 2] = 0; m[(y + dy) * 32 + x + dx] = 0; st.push([x + dx, y + dy]);
    }
    S.tex.needsUpdate = true; S.x = 1; S.y = 1; S.d = 0; S.from = { x: 1, y: 1, a: 0 }; S.to = { ...S.from }; S.steps = 0;
  },
  feed(dt, fx, viz, ch) {
    const S = ch.s, m = S.tex.image.data, open = (x, y) => m[y * 32 + x] === 0, D = [[1, 0], [0, 1], [-1, 0], [0, -1]], e = (fx.beat || fx.time * 2.27) * 2;
    if (ticks(S, 'e', e)) {
      S.from = { ...S.to };
      const r = (S.d + 1) % 4, l = (S.d + 3) % 4;
      if (S.turned !== true && open(S.x + D[r][0], S.y + D[r][1])) { S.d = r; S.turned = true; }       // keep the right hand on the wall
      else if (open(S.x + D[S.d][0], S.y + D[S.d][1])) { S.x += D[S.d][0] * 2; S.y += D[S.d][1] * 2; S.turned = false; S.steps++; }
      else { S.d = l; S.turned = true; }
      S.to = { x: S.x, y: S.y, a: S.from.a + ((((S.d * Math.PI / 2 - S.from.a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) };
      if (S.steps > 140 || (S.x === 21 && S.y === 21)) this.make(S);
    }
    const k = Math.min(1, (e % 1) * 1.6), s = k * k * (3 - 2 * k), U = ch.mat.uniforms;
    U.uPos.value.set(S.from.x + (S.to.x - S.from.x) * s + 0.5, S.from.y + (S.to.y - S.from.y) * s + 0.5); U.uAng.value = S.from.a + (S.to.a - S.from.a) * s;
  },
  frag: `uniform sampler2D uMaze; uniform vec2 uPos; uniform float uAng;
bool wall(ivec2 c) { return c.x < 0 || c.y < 0 || c.x > 22 || c.y > 22 || texelFetch(uMaze, c, 0).r > 0.5; }
void main() {
  vec2 sp = vUv - 0.5; float fov = 0.62;
  vec2 dir = vec2(cos(uAng), sin(uAng)), pl = vec2(-dir.y, dir.x) * fov, rd = dir + pl * sp.x * 2.0;
  ivec2 mp = ivec2(floor(uPos)); vec2 dd = abs(1.0 / rd), sd; ivec2 st;
  st.x = rd.x < 0.0 ? -1 : 1; sd.x = rd.x < 0.0 ? (uPos.x - float(mp.x)) * dd.x : (float(mp.x) + 1.0 - uPos.x) * dd.x;
  st.y = rd.y < 0.0 ? -1 : 1; sd.y = rd.y < 0.0 ? (uPos.y - float(mp.y)) * dd.y : (float(mp.y) + 1.0 - uPos.y) * dd.y;
  int side = 0; float dist = 30.0;
  for (int i = 0; i < 40; i++) {
    if (sd.x < sd.y) { sd.x += dd.x; mp.x += st.x; side = 0; } else { sd.y += dd.y; mp.y += st.y; side = 1; }
    if (wall(mp)) { dist = side == 0 ? sd.x - dd.x : sd.y - dd.y; break; }
  }
  float h = 0.5 / max(dist, 0.05), y = vUv.y - 0.5; vec3 c;
  if (abs(y) < h) {                                                         // brick: rows of bricks, every other row offset
    float u = side == 0 ? uPos.y + dist * rd.y : uPos.x + dist * rd.x, v = (y + h) / (2.0 * h);
    vec2 b = vec2(u * 4.0 + (mod(floor(v * 8.0), 2.0) * 0.5), v * 8.0), f = fract(b);
    float mortar = max(step(f.x, 0.07), step(f.y, 0.12));
    c = mix(vec3(0.62, 0.2, 0.13) * (0.85 + 0.3 * hash1(floor(b) + vec2(mp))), vec3(0.75, 0.72, 0.66), mortar);
    c *= side == 1 ? 0.72 : 1.0;
  } else {                                                                  // the floor and the ceiling, in perspective
    float fd = 0.5 / abs(y); vec2 w = uPos + rd * fd;
    c = y < 0.0 ? mix(vec3(0.35, 0.36, 0.38), vec3(0.5, 0.5, 0.52), mod(floor(w.x) + floor(w.y), 2.0)) : vec3(0.82, 0.84, 0.86) - 0.12 * step(0.94, max(fract(w.x * 2.0), fract(w.y * 2.0)));
    dist = fd;
  }
  c *= clamp(1.4 / (0.6 + dist * 0.45), 0.0, 1.0) * (0.85 + 0.25 * uKick);
  gl_FragColor = vec4(srgb(c), 1.0);
}`,
};

// the bouncing logo: the face and the album's four letters; its path is laid backwards from the next drop, so the
// downbeat is the corner hit everyone waits for
ERA.bounce = {
  uniforms: () => ({ uLogo: { value: new THREE.Vector2() }, uCol: { value: new THREE.Color(1, 1, 1) }, uHit: { value: 0 } }),
  init(viz, ch) { ch.s = { last: -1, hit: 0 }; },
  feed(dt, fx, viz, ch) {
    const S = ch.s, t = fx.songT ?? fx.time, D = drops(fx), tD = D.find((d) => d > t - 3) ?? (D.length ? D[D.length - 1] : 0);
    const vx = 66, vy = 49, X = 384 - 128, Y = 288 - 56, sx = (t - tD) * vx / X + 1, sy = (t - tD) * vy / Y + 1;
    const tri = (s) => 1 - Math.abs((((s % 2) + 2) % 2) - 1);         // 1 at whole even numbers: the far edge
    const U = ch.mat.uniforms; U.uLogo.value.set(tri(sx) * X, tri(sy) * Y);
    const n = Math.floor(sx) + Math.floor(sy);
    if (n !== S.last) { if (S.last !== -1 && Math.abs(t - tD) < 0.1) S.hit = 1; S.last = n; const C = [0xff2a2a, 0x2aff4a, 0x3a6aff, 0xffe00a, 0xff3ad0, 0x2ae8ff, 0xffffff, 0xff8a1a]; U.uCol.value.set(C[((n % 8) + 8) % 8]); }
    S.hit = Math.max(0, S.hit - dt * 0.7); U.uHit.value = S.hit * (1 - 0.7 * (fx.calm ? 1 : 0));
  },
  sig: () => `${fonts()}`,
  paint(x) {                    // the logo, white, top-left; the shader tints it and moves it
    x.save(); x.translate(4, 6);
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, 2); x.lineTo(40, 2); x.quadraticCurveTo(44, 2, 42, 6); x.lineTo(23, 40); x.quadraticCurveTo(20, 44, 17, 40); x.lineTo(-2, 6); x.quadraticCurveTo(-4, 2, 0, 2); x.fill();
    x.fillStyle = '#000'; x.fillRect(12, 12, 4, 8); x.fillRect(24, 12, 4, 8);
    x.lineWidth = 2; x.strokeStyle = '#000'; x.beginPath(); x.arc(17, 24, 3, 0, Math.PI); x.arc(23, 24, 3, 0, Math.PI); x.stroke();
    x.font = `italic 900 30px "Times New Roman", serif`; x.fillStyle = '#fff'; x.save(); x.scale(1.05, 1.25); x.fillText('ILMC', 44, 27); x.restore();
    x.font = `bold 7px ${SANS}`; x.fillText('I LOVE MY COMPUTER', 47, 44, 78);
    x.restore();
  },
  frag: `uniform vec2 uLogo; uniform vec3 uCol; uniform float uHit;
void main() {
  vec2 p = L() - uLogo; vec3 c = vec3(0.0);
  if (p.x >= 0.0 && p.y >= 0.0 && p.x < 128.0 && p.y < 56.0) { float a = chromeAt(p).r; c = uCol * a; }
  c += vec3(1.0) * uHit * 0.35 * smoothstep(0.6, 0.0, length(vUv - vec2(uLogo.x > 128.0 ? 1.0 : 0.0, uLogo.y > 116.0 ? 0.0 : 1.0)));   // the corner lights up
  gl_FragColor = vec4(c, 1.0);
}`,
};

// the defragmenter: each step of the bar's pattern reads a stray block (red) and writes it in place (green)
const DFC = 48, DFR = 20;
ERA.defrag = {
  uniforms: () => ({ uCells: { value: null }, uPct: { value: 0 } }),
  init(viz, ch) {
    const tex = new THREE.DataTexture(new Uint8Array(64 * 32), 64, 32, THREE.RedFormat); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    ch.mat.uniforms.uCells.value = tex; ch.s = { tex, R: rng(5) }; this.make(ch.s);
  },
  make(S) {   // 0 free, 1 out of place, 2 in place, 3 being read, 4 being written, 5 won't move
    const n = DFC * DFR, c = new Uint8Array(n); S.done = 0; S.c = c;
    for (let i = 0; i < n; i++) { const r = S.R(); c[i] = i > n * 0.82 ? (r < 0.12 ? 1 : 0) : r < 0.5 ? 1 : r < 0.7 ? 2 : r < 0.74 ? 5 : 0; }
    this.flush(S);
  },
  flush(S) { const d = S.tex.image.data; for (let i = 0; i < DFC * DFR; i++) d[Math.floor(i / DFC) * 64 + (i % DFC)] = S.c[i] * 40; S.tex.needsUpdate = true; },
  feed(dt, fx, viz, ch) {
    const S = ch.s, c = S.c, n = DFC * DFR, G = grid(fx), masks = viz.pat?.masks || [];
    if (!ticks(S, 'six', (fx.beat || fx.time * 2.27) * 4)) return;
    for (let i = 0; i < n; i++) if (c[i] === 3) c[i] = 0; else if (c[i] === 4) c[i] = 2;     // last step's move lands
    let on = 0; for (const m of masks) if ((m >> G.step) & 1) on++;
    if (on || G.step % 4 === 0) for (let k = 0; k < Math.max(1, on); k++) {
      while (S.done < n && (c[S.done] === 2 || c[S.done] === 5 || c[S.done] === 4)) S.done++;
      if (S.done >= n) { this.make(S); return; }
      if (c[S.done] === 1) { c[S.done] = 4; S.done++; continue; }      // a stray block already here: rewritten where it lies
      let src = -1; for (let j = n - 1; j > S.done; j--) if (c[j] === 1 && S.R() < 0.15) { src = j; break; }
      if (src < 0) for (let j = S.done + 1; j < n; j++) if (c[j] === 1) { src = j; break; }
      if (src < 0) { this.make(S); return; }
      c[src] = 3; c[S.done] = 4; S.done++;                               // read from out there, written here
    }
    let free = 0, placed = 0; for (let i = 0; i < n; i++) { if (c[i] === 0) free++; else if (c[i] === 2 || c[i] === 5) placed++; }
    ch.mat.uniforms.uPct.value = placed / Math.max(1, n - free); S.pct = Math.floor(ch.mat.uniforms.uPct.value * 100);
    this.flush(S);
  },
  sig: (fx, viz, ch) => `${fonts()}|${ch.s.pct}`,
  paint(x, fx, viz, ch) {
    desk(x); const a = win(x, 6, 6, 372, 276, 'Defragmenting Drive C');
    sunken(x, a.x + 4, a.y + 4, a.w - 8, 166);
    text(x, `${ch.s.pct || 0}% Complete`, a.x + 8, a.y + 186);
    sunken(x, a.x + 6, a.y + 192, a.w - 12, 18);
    ['Stop', 'Pause', 'Legend', 'Hide Details'].forEach((b, i) => button(x, a.x + 6 + i * 90, a.y + 222, 82, 22, b));
  },
  frag: `uniform sampler2D uCells; uniform float uPct;
void main() {
  vec2 p = L(); vec3 c = chromeAt(p).rgb;
  vec2 g = (p - vec2(14.0, 34.0)) / vec2(${DFC}.0 * 7.25, ${DFR}.0 * 7.9);
  if (g.x >= 0.0 && g.y >= 0.0 && g.x < 1.0 && g.y < 1.0) {
    vec2 cc = g * vec2(${DFC}.0, ${DFR}.0), f = fract(cc); float v = texelFetch(uCells, ivec2(floor(cc)), 0).r * 255.0 / 40.0;
    vec3 col = srgb(v < 0.5 ? vec3(1.0) : v < 1.5 ? vec3(0.0, 0.62, 0.65) : v < 2.5 ? vec3(0.0, 0.0, 0.62) : v < 3.5 ? vec3(1.0, 0.0, 0.0) : v < 4.5 ? vec3(0.0, 0.85, 0.0) : vec3(0.15));
    float edge = step(0.86, max(f.x, f.y)) + step(max(f.x, f.y), 0.0);
    c = mix(col, v < 0.5 ? vec3(1.0) : col * 0.4 + vec3(0.06), edge * 0.7);
  }
  c = chunks(c, p, vec4(16.0, 220.0, 352.0, 18.0), uPct, srgb(vec3(0.0, 0.0, 0.5)));
  gl_FragColor = vec4(c, 1.0);
}`,
};

// copying: a page flies from one folder to the other on every beat; the bar fills over four bars, then the next file
const FILES = ['vox_main_take3.wav', 'kick_layer_02.wav', 'supersaw_stack.wav', 'chops_bounce.wav', 'sub_bass.wav', 'fx_riser_long.wav', 'perc_loop_136.wav', 'master_v7.wav'];
ERA.copy = {
  uniforms: () => ({ uFly: { value: 0 }, uProg: { value: 0 } }),
  init(viz, ch) { ch.s = {}; },
  feed(dt, fx, viz, ch) {
    const b = fx.beat || fx.time * 2.27, U = ch.mat.uniforms; U.uFly.value = Math.min(1, (b % 1) * 1.3); U.uProg.value = (b / 16) % 1;
    ch.s.file = Math.floor(b / 16); ch.s.left = Math.ceil((1 - U.uProg.value) * 16 * ((fx.song?.m.beatLen) || 0.44));
  },
  sig: (fx, viz, ch) => `${fonts()}|${ch.s.file}|${ch.s.left}`,
  paint(x, fx, viz, ch) {
    desk(x); const a = win(x, 20, 40, 344, 196, 'Copying...', { buttons: 1 });
    folder(x, a.x + 22, a.y + 14); folder(x, a.x + a.w - 62, a.y + 14);
    const f = FILES[((ch.s.file % FILES.length) + FILES.length) % FILES.length];
    text(x, f, a.x + 14, a.y + 76); text(x, "From 'Stems' to 'ILMC Bounce'", a.x + 14, a.y + 94);
    sunken(x, a.x + 12, a.y + 104, a.w - 24, 18);
    text(x, `${Math.max(1, ch.s.left || 1)} Seconds Remaining`, a.x + 14, a.y + 140);
    button(x, a.x + a.w - 88, a.y + 144, 76, 22, 'Cancel');
  },
  frag: `uniform float uFly, uProg;
void main() {
  vec2 p = L(); vec3 c = chromeAt(p).rgb;
  c = chunks(c, p, vec4(36.0, 168.0, 312.0, 18.0), uProg, srgb(vec3(0.0, 0.0, 0.5)));
  // the page: it leaves the left folder, arcs over, turning as it goes, and drops into the right one
  float s = uFly, x0 = 72.0 + s * 238.0, y0 = 96.0 - sin(s * 3.14159) * 32.0, turn = cos(s * 6.2832);
  vec2 q = p - vec2(x0, y0); q.x /= max(0.15, abs(turn));
  float pg = rect(q, vec4(-8.0, -10.0, 16.0, 20.0)) * step(s, 0.98);
  if (pg > 0.0) { c = mix(c, vec3(0.0), pg); float inner = rect(q, vec4(-7.0, -9.0, 14.0, 18.0)); c = mix(c, turn > 0.0 ? vec3(1.0) : vec3(0.7), inner);
    float ln = step(0.5, fract((q.y + 9.0) / 3.0)) * step(-5.0, q.x) * step(q.x, 5.0) * step(-6.0, q.y) * step(q.y, 6.0) * step(0.0, turn); c = mix(c, vec3(0.2), ln * inner); }
  gl_FragColor = vec4(c, 1.0);
}`,
};

// downloads: three files, their speeds following the level, and a graph of the line's throughput
const DL = [['fmc_stems_final.zip', 48200], ['ILMC_tour_visuals.mpg', 131000], ['plugins_update_v2.exe', 9400]];
ERA.download = {
  uniforms: () => ({ uHist: { value: new Array(64).fill(0) }, uProg: { value: new THREE.Vector3() } }),
  init(viz, ch) { ch.s = { got: [0.31, 0.07, 0.62], acc: 0, kb: [0, 0, 0], show: [0, 0, 0] }; },
  feed(dt, fx, viz, ch) {
    const S = ch.s, lv = Math.min(1, (fx.level || 0) * (fx.alive || 0) * 1.6 + (fx.kick || 0) * 0.3), U = ch.mat.uniforms;
    S.kb = [0.6, 0.3, 0.1].map((w, i) => (3 + 140 * lv * w) * (1 + 0.15 * Math.sin(fx.time * (3 + i))));
    S.got = S.got.map((g, i) => { const n = g + S.kb[i] * dt / DL[i][1]; return n >= 1 ? 0 : n; });
    U.uProg.value.set(...S.got);
    S.acc += dt; if (S.acc > 0.1) { S.acc = 0; const h = U.uHist.value; h.shift(); h.push(lv); }
    if (ticks(S, 'q', fx.time * 4)) S.show = S.kb.map((k) => k.toFixed(1));
  },
  sig: (fx, viz, ch) => `${fonts()}|${ch.s.show.join()}|${ch.s.got.map((g) => Math.floor(g * 100)).join()}`,
  paint(x, fx, viz, ch) {
    desk(x); const a = win(x, 8, 8, 368, 272, 'Downloads');
    sunken(x, a.x + 4, a.y + 4, a.w - 8, 150);
    x.fillStyle = GREY; x.fillRect(a.x + 6, a.y + 6, a.w - 12, 16); text(x, 'File', a.x + 10, a.y + 18); text(x, 'Progress', a.x + 160, a.y + 18); text(x, 'Speed', a.x + 292, a.y + 18);
    DL.forEach(([n, size], i) => {
      const y = a.y + 30 + i * 40, g = ch.s.got[i];
      text(x, n, a.x + 10, y + 12); text(x, `${Math.floor(g * size)} KB of ${size} KB`, a.x + 10, y + 28, { color: '#555' });
      sunken(x, a.x + 160, y + 2, 124, 16); text(x, `${Math.floor(g * 100)}%`, a.x + 160, y + 32, { color: '#555' });
      text(x, `${ch.s.show[i]} KB/s`, a.x + 292, y + 14);
    });
    text(x, 'Throughput', a.x + 6, a.y + 172); sunken(x, a.x + 4, a.y + 176, a.w - 8, 64, '#000');
  },
  frag: `uniform float uHist[64]; uniform vec3 uProg;
void main() {
  vec2 p = L(); vec3 c = chromeAt(p).rgb;
  for (int i = 0; i < 3; i++) c = chunks(c, p, vec4(172.0, 64.0 + float(i) * 40.0, 124.0, 16.0), uProg[i], srgb(vec3(0.0, 0.0, 0.5)));
  vec2 g = (p - vec2(14.0, 210.0)) / vec2(356.0, 60.0);
  if (g.x >= 0.0 && g.x <= 1.0 && g.y >= 0.0 && g.y <= 1.0) {
    float k = g.x * 63.0, v = mix(uHist[int(floor(k))], uHist[int(min(63.0, floor(k) + 1.0))], fract(k)), y = 1.0 - g.y;
    vec2 gg = fract(g * vec2(16.0, 4.0)); c = mix(c, srgb(vec3(0.0, 0.3, 0.0)), clamp(step(gg.x, 0.03) + step(gg.y, 0.06), 0.0, 1.0));
    c = mix(c, srgb(vec3(0.0, 0.5, 0.0)), step(y, v * 0.92)); c = mix(c, srgb(vec3(0.3, 1.0, 0.3)), smoothstep(0.03, 0.0, abs(y - v * 0.92)));
  }
  gl_FragColor = vec4(c, 1.0);
}`,
};

// writing a disc: the disc turns, the bar crawls over the song, the buffer drains on each kick and refills
ERA.burn = {
  uniforms: () => ({ uProg: { value: 0 }, uBuf: { value: 0.9 }, uRot: { value: 0 } }),
  init(viz, ch) { ch.s = { buf: 0.92 }; },
  feed(dt, fx, viz, ch) {
    const S = ch.s, U = ch.mat.uniforms, t = fx.songT ?? fx.time, dur = fx.song?.m.dur || 190;
    S.buf = Math.min(0.98, S.buf + dt * 0.9) - (fx.kick || 0) * (fx.alive || 0) * dt * 6;
    U.uBuf.value = Math.max(0.25, S.buf); U.uProg.value = Math.min(1, Math.max(0, t / dur)); U.uRot.value += dt * (4 + 6 * (fx.level || 0));
    S.pct = Math.floor(U.uProg.value * 100); S.sec = Math.floor(t);
  },
  sig: (fx, viz, ch) => `${fonts()}|${ch.s.pct}|${ch.s.sec}`,
  paint(x, fx, viz, ch, trk) {
    desk(x); const a = win(x, 14, 22, 356, 244, 'Writing Disc', { buttons: 1 });
    text(x, 'Writing track 1 of 1', a.x + 92, a.y + 22, { bold: true }); text(x, trk.title, a.x + 92, a.y + 40, { color: '#333' });
    text(x, 'Write speed:  16x (2,400 KB/s)', a.x + 92, a.y + 58);
    text(x, `Elapsed ${fmt(ch.s.sec || 0)}`, a.x + 92, a.y + 76);
    text(x, `Overall progress: ${ch.s.pct || 0}%`, a.x + 10, a.y + 108); sunken(x, a.x + 10, a.y + 114, a.w - 20, 18);
    text(x, 'Buffer', a.x + 10, a.y + 152); sunken(x, a.x + 10, a.y + 158, a.w - 20, 14);
    button(x, a.x + a.w - 90, a.y + a.h - 30, 80, 22, 'Cancel');
  },
  frag: `uniform float uProg, uBuf, uRot;
void main() {
  vec2 p = L(); vec3 c = chromeAt(p).rgb;
  c = chunks(c, p, vec4(28.0, 160.0, 328.0, 18.0), uProg, srgb(vec3(0.0, 0.0, 0.5)));
  if (rect(p, vec4(30.0, 206.0, 324.0, 10.0)) > 0.5) c = mix(c, srgb(vec3(0.0, 0.5, 0.0)), step(p.x, 30.0 + 324.0 * uBuf));
  vec2 q = p - vec2(64.0, 82.0); float r = length(q), a = atan(q.y, q.x) + uRot;
  if (r < 30.0) {                                                     // the disc: silver, rainbow sheen, the hub
    vec3 d = vec3(0.78, 0.8, 0.84) + 0.2 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + a / 3.14159 + r * 0.04)) * smoothstep(9.0, 14.0, r);
    d = mix(d, vec3(0.9), smoothstep(0.92, 1.0, cos(a * 2.0)) * 0.6);
    c = mix(d, vec3(0.55, 0.55, 0.6), step(r, 9.0)); c = mix(c, vec3(0.0), step(r, 4.0)); c = srgb(mix(c, vec3(0.3), smoothstep(29.0, 30.0, r)));
  }
  gl_FragColor = vec4(c, 1.0);
}`,
};

// the surface scan, in text mode: a row of clusters a bar, bad sectors where the big hits land
ERA.scandisk = {
  uniforms: () => ({ uProg: { value: 0 }, uSeed: { value: 0 } }),
  init(viz, ch) { ch.s = {}; },
  feed(dt, fx, viz, ch) { const b = (fx.beat || fx.time * 2.27) / 4, U = ch.mat.uniforms; U.uProg.value = (b % 14) / 14; U.uSeed.value = Math.floor(b / 14); ch.s.pct = Math.floor(U.uProg.value * 100); },
  sig: (fx, viz, ch) => `${fonts()}|${ch.s.pct}`,
  paint(x, fx, viz, ch) {
    x.fillStyle = '#0000aa'; x.fillRect(0, 0, 384, 288);
    x.fillStyle = '#aaa'; x.fillRect(0, 0, 384, 16); text(x, ' Disk Surface Scan', 4, 13, { font: DOS, size: 16, color: '#000' });
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.strokeRect(10, 24, 364, 196); x.strokeRect(14, 28, 356, 188);
    text(x, `Checking drive C... ${ch.s.pct || 0}% complete`, 16, 236, { font: DOS, size: 17, color: '#fff' });
    text(x, '░ unused  ▒ used  █ examined  B bad', 16, 256, { font: DOS, size: 16, color: '#ffff55' });
    x.fillStyle = '#00aaaa'; x.fillRect(0, 270, 384, 18); text(x, ' < Pause >   < More Info >   < Exit >', 4, 284, { font: DOS, size: 16, color: '#000' });
  },
  frag: `uniform float uProg, uSeed;
float glyphB(vec2 f) { vec2 g = floor(f * vec2(4.0, 6.0)); int r = int(g.y), cc = int(g.x);   // a 3x5 letter B
  int row = r == 0 || r == 2 || r == 4 ? 6 : r == 1 || r == 3 ? 5 : 0; return cc < 3 && r < 5 ? float((row >> (2 - cc)) & 1) : 0.0; }
void main() {
  vec2 p = L(); vec3 c = chromeAt(p).rgb;
  vec2 g = (p - vec2(20.0, 34.0)) / vec2(344.0, 176.0);
  if (g.x >= 0.0 && g.y >= 0.0 && g.x < 1.0 && g.y < 1.0) {
    vec2 cc = g * vec2(40.0, 14.0), id = floor(cc), f = fract(cc); float idx = (id.y * 40.0 + id.x) / 560.0;
    float used = step(0.35, hash1(id + uSeed)), bad = step(0.985, hash1(id * 1.7 + uSeed + 3.0)), done = step(idx, uProg), here = step(abs(idx - uProg) * 560.0, 0.6);
    vec2 px = floor(f * vec2(4.0, 8.0)); float chk = mod(px.x + px.y, 2.0), light = chk * mod(px.y, 2.0);    // the shade characters
    vec3 v = done > 0.5 ? vec3(1.0, 1.0, 0.33) : mix(vec3(0.0, 0.0, 0.66), vec3(0.67), used > 0.5 ? chk : light);
    if (done > 0.5 && bad > 0.5) v = mix(vec3(0.0, 0.0, 0.66), vec3(1.0, 0.33, 0.33), glyphB(f * vec2(1.2, 1.1) - vec2(0.05)));
    float cell = step(0.06, f.x) * step(f.x, 0.94);
    c = mix(c, srgb(v), cell);
    c = mix(c, vec3(1.0), here * cell * step(0.5, fract(uTime * 4.0)));
  }
  gl_FragColor = vec4(c, 1.0);
}`,
};

// the winning cascade: a card leaves a foundation, bounces down the screen and off it, every frame of it left on the felt;
// the jig's two big hits throw the next cards
ERA.solitaire = {
  uniforms: () => ({ uPrev: { value: null }, uCards: { value: Array.from({ length: 4 }, () => new THREE.Vector4(-99, -99, 0, 0)) }, uClear: { value: 1 } }),
  init(viz, ch) {
    const mk = () => new THREE.WebGLRenderTarget(384, 288, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace });
    ch.s = { buf: [mk(), mk()], cards: [], n: 0, R: rng(9), clear: true, frames: 0 };
    ch.out = { mat: null };
  },
  launch(S) {
    if (S.cards.length >= 4) return;
    const f = S.n % 4, x0 = 168 + f * 52; S.n++;
    S.cards.push({ x: x0, y: 8, vx: (S.R() < 0.5 ? -1 : 1) * (70 + S.R() * 110), vy: -S.R() * 120, face: S.n % 8 });
  },
  feed(dt, fx, viz, ch) {
    const S = ch.s, G = grid(fx);
    if (ticks(S, 'six', (fx.beat || fx.time * 2.27) * 4) && G.g === 3 && (G.step === 0 || G.step === 8)) { this.launch(S); if (G.step === 0) this.launch(S); }
    if (!fx.song && ticks(S, 'idle', fx.time / 1.6)) this.launch(S);
    for (const c of S.cards) { c.vy += 620 * dt; c.x += c.vx * dt; c.y += c.vy * dt; if (c.y > 288 - 64) { c.y = 288 - 64; c.vy *= -0.78; } }
    S.cards = S.cards.filter((c) => c.x > -50 && c.x < 384);
    if (S.n > 26 && !S.cards.length) { S.n = 0; S.clear = true; }      // a full game's worth: deal again
    const U = ch.mat.uniforms; for (let i = 0; i < 4; i++) { const c = S.cards[i]; U.uCards.value[i].set(c ? c.x : -99, c ? c.y : -99, c ? c.face : 0, 0); }
  },
  sig: () => `${fonts()}`,
  paint(x) {                // the eight card faces, side by side along the top of the chrome (not shown, sampled)
    const R = ['K', 'Q', 'J', '10', '9', 'A', '8', '7'], S = ['♥', '♠', '♦', '♣'];
    x.clearRect(0, 0, 384, 288);
    for (let i = 0; i < 8; i++) {
      const X = i * 48, s = S[i % 4], red = i % 2 === 0;
      x.fillStyle = '#000'; x.fillRect(X, 0, 46, 64); x.fillStyle = '#fff'; x.fillRect(X + 1, 1, 44, 62);
      x.fillStyle = red ? '#e00000' : '#000'; x.font = `bold 11px ${SANS}`; x.fillText(R[i], X + 3, 12); x.font = `11px ${SANS}`; x.fillText(s, X + 3, 23);
      x.font = '26px serif'; x.textAlign = 'center'; x.fillText(s, X + 23, 42); x.textAlign = 'left';
      if (i < 3) { x.fillStyle = red ? '#ffd040' : '#4060ff'; x.fillRect(X + 12, 46, 22, 10); }
    }
  },
  frag: `uniform sampler2D uPrev; uniform vec4 uCards[4]; uniform float uClear;
void main() {
  vec2 p = L();
  vec3 c = uClear > 0.5 ? srgb(vec3(0.0, 0.5, 0.0)) : texture(uPrev, vUv).rgb;
  if (uClear > 0.5) for (int i = 0; i < 4; i++) {                        // the foundations, each topped by its king
    vec2 q = p - vec2(168.0 + float(i) * 52.0, 8.0); if (q.x >= 0.0 && q.y >= 0.0 && q.x < 46.0 && q.y < 64.0) c = chromeAt(q + vec2(float(i) * 48.0, 0.0)).rgb;
  }
  for (int i = 0; i < 4; i++) { vec2 q = p - uCards[i].xy; if (q.x >= 0.0 && q.y >= 0.0 && q.x < 46.0 && q.y < 64.0) c = chromeAt(q + vec2(uCards[i].z * 48.0, 0.0)).rgb; }
  gl_FragColor = vec4(c, 1.0);
}`,
  render(r, viz, ch, draw) {
    const S = ch.s, [a, b] = S.buf, U = ch.mat.uniforms;
    U.uPrev.value = a.texture; U.uClear.value = S.clear ? 1 : 0; S.clear = false;
    draw(ch.mat, b); S.buf.reverse();
    // what the screens see: the felt, copied into the mipmapped picture
    ch.copy ||= new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }', uniforms: { t: { value: null } }, depthTest: false, depthWrite: false, toneMapped: false });
    ch.copy.uniforms.t.value = b.texture; draw(ch.copy, ch.rt);
  },
};

// the mine field, cleared on the beat; on the drop a mine goes off
const MW = 16, MH = 9;
ERA.mines = {
  init(viz, ch) { ch.s = { R: rng(21), v: 0 }; this.deal(ch.s); },
  deal(S) {
    S.mine = new Uint8Array(MW * MH); S.open = new Uint8Array(MW * MH); S.boom = -1; S.over = 0; S.v++;
    let n = 0; while (n < 24) { const i = Math.floor(S.R() * MW * MH); if (!S.mine[i]) { S.mine[i] = 1; n++; } }
  },
  near(S, i) { const x = i % MW, y = Math.floor(i / MW); let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < MW && Y < MH && S.mine[Y * MW + X]) n++; } return n; },
  flood(S, i) {
    const st = [i]; while (st.length) {
      const j = st.pop(); if (S.open[j]) continue; S.open[j] = 1; if (this.near(S, j)) continue;
      const x = j % MW, y = Math.floor(j / MW); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < MW && Y < MH && !S.mine[Y * MW + X]) st.push(Y * MW + X); }
    }
  },
  feed(dt, fx, viz, ch) {
    const S = ch.s, t = fx.songT ?? fx.time, D = drops(fx);
    if (ticks(S, 'b', fx.beat || fx.time * 2.27)) {
      if (S.over) { if (--S.over === 0) this.deal(S); return; }
      const shut = []; for (let i = 0; i < MW * MH; i++) if (!S.open[i] && !S.mine[i]) shut.push(i);
      if (!shut.length) { S.over = 6; S.won = true; S.v++; return; }
      this.flood(S, shut[Math.floor(S.R() * shut.length)]); S.v++;
    }
    // it goes off on the drop's downbeat, and on the first big hit of the jig while a drop lasts (or of every other cycle, with no map)
    const G = grid(fx), big = G.g === 3 && ticks(S, 'bigbar', G.bar / 4), sec = fx.song && fx.songT != null ? fx.song.at(fx.songT).sec : null;
    const boom = D.some((d) => S.lastT != null && t - S.lastT < 0.5 && d > S.lastT && d <= t) || (big && (sec ? sec === 'drop' : S.R() < 0.5));
    if (boom && !S.over) { const m = []; for (let i = 0; i < MW * MH; i++) if (S.mine[i]) m.push(i); S.boom = m[Math.floor(S.R() * m.length)]; S.over = 9; S.won = false; S.v++; }
    S.lastT = t;
  },
  sig: (fx, viz, ch) => `${fonts()}|${ch.s.v}|${Math.floor(fx.time) % 1000}`,
  paint(x, fx, viz, ch) {
    const S = ch.s, C = 19, X0 = (384 - MW * C) / 2, Y0 = 92;
    desk(x); const a = win(x, X0 - 14, 8, MW * C + 28, 274, 'Mines');
    text(x, 'Game   Help', a.x + 4, a.y + 10);
    sunken(x, X0 - 4, a.y + 18, MW * C + 8, 44, GREY);
    const led = (v, X) => { x.fillStyle = '#000'; x.fillRect(X, a.y + 26, 42, 28); text(x, String(Math.max(0, v)).padStart(3, '0'), X + 21, a.y + 50, { font: DOS, size: 30, color: '#f00', align: 'center' }); };
    let flags = 0; for (let i = 0; i < MW * MH; i++) if (S.mine[i]) flags++;
    led(flags, X0 + 2); led(Math.floor(fx.time) % 1000, X0 + MW * C - 44);
    const fx0 = X0 + MW * C / 2 - 14, fy = a.y + 26; button(x, fx0, fy, 28, 28);                 // the face on the button
    x.fillStyle = '#ff0'; x.beginPath(); x.arc(fx0 + 14, fy + 14, 10, 0, 7); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1; x.stroke(); x.fillStyle = '#000';
    if (S.over && !S.won) { x.lineWidth = 1.4; x.beginPath(); for (const e of [-4, 4]) { x.moveTo(fx0 + 14 + e - 2, fy + 10); x.lineTo(fx0 + 14 + e + 2, fy + 14); x.moveTo(fx0 + 14 + e + 2, fy + 10); x.lineTo(fx0 + 14 + e - 2, fy + 14); } x.stroke(); x.beginPath(); x.arc(fx0 + 14, fy + 21, 4, Math.PI, 0); x.stroke(); }
    else { x.fillRect(fx0 + 9, fy + 10, 2, 3); x.fillRect(fx0 + 17, fy + 10, 2, 3); if (S.won) { x.fillRect(fx0 + 6, fy + 9, 16, 3); } x.beginPath(); x.arc(fx0 + 14, fy + 15, 5, 0.2, Math.PI - 0.2); x.stroke(); }
    sunken(x, X0 - 3, Y0 - 3, MW * C + 6, MH * C + 6, '#808080');
    const NC = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000', '#808080'];
    for (let i = 0; i < MW * MH; i++) {
      const X = X0 + (i % MW) * C, Y = Y0 + Math.floor(i / MW) * C;
      if (S.open[i] || (S.over && S.mine[i] && !S.won)) {
        x.fillStyle = i === S.boom ? '#f00' : GREY; x.fillRect(X, Y, C, C); x.fillStyle = '#808080'; x.fillRect(X, Y, C, 1); x.fillRect(X, Y, 1, C);
        if (S.mine[i]) { x.fillStyle = '#000'; x.beginPath(); x.arc(X + C / 2, Y + C / 2, 5, 0, 7); x.fill(); x.fillRect(X + 3, Y + C / 2 - 0.5, C - 6, 1.5); x.fillRect(X + C / 2 - 0.5, Y + 3, 1.5, C - 6); x.fillStyle = '#fff'; x.fillRect(X + C / 2 - 3, Y + C / 2 - 3, 2, 2); }
        else { const n = this.near(S, i); if (n) text(x, String(n), X + C / 2, Y + C - 4, { bold: true, size: 14, color: NC[n], align: 'center' }); }
      } else { x.fillStyle = GREY; x.fillRect(X, Y, C, C); bevel(x, X, Y, C, C); }
    }
  },
  frag: `void main() { gl_FragColor = vec4(chromeAt(L()).rgb, 1.0); }`,
};

// the webcam on the lead computer: the room from where it stands, 160 x 120, four frames a second, blown out
ERA.webcam = {
  w: 512, h: 384,
  uniforms: () => ({ uCam: { value: null }, uRec: { value: 0 } }),
  init(viz, ch) {
    const mk = () => new THREE.WebGLRenderTarget(160, 120, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    ch.s = { rts: [mk(), mk()], cam: new THREE.PerspectiveCamera(58, 4 / 3, 0.03, 3), next: 0, k: null, parts: null, small: [], v: new THREE.Vector3() }; ch.mat.uniforms.uCam.value = ch.s.rts[0].texture;
  },
  feed(dt, fx, viz, ch) { ch.s.sec = Math.floor(fx.time); ch.mat.uniforms.uRec.value = Math.floor(fx.time * 1.5) % 2; },
  sig: (fx, viz, ch) => `${fonts()}|${ch.s.sec}`,
  paint(x, fx, viz, ch) {
    desk(x); const a = win(x, 6, 4, 372, 280, 'Video Capture - Preview');
    text(x, 'File   Edit   View   Capture   Options   Help', a.x + 4, a.y + 10);
    sunken(x, a.x + 4, a.y + 16, a.w - 8, 214, '#000');
    sunken(x, a.x, a.y + a.h - 18, a.w, 18, GREY);
    const s = ch.s.sec || 0; text(x, `160x120   4.0 fps   00:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, a.x + 6, a.y + a.h - 5);
  },
  frag: `uniform sampler2D uCam; uniform float uRec;
void main() {
  vec2 p = L(); vec3 c = chromeAt(p).rgb;
  vec2 v = (p - vec2(14.0, 46.0)) / vec2(356.0, 210.0);
  if (v.x >= 0.0 && v.y >= 0.0 && v.x < 1.0 && v.y < 1.0) {
    vec2 px = (floor(vec2(v.x, 1.0 - v.y) * vec2(160.0, 120.0)) + 0.5) / vec2(160.0, 120.0);
    vec3 s = texture(uCam, px).rgb;
    s = 1.0 - exp(-s * 5.5);                                   // a cheap sensor: everything bright clips, the dark lifts
    s = mix(vec3(dot(s, vec3(0.3, 0.59, 0.11))), s, 1.35) * vec3(1.0, 1.04, 0.92) + 0.03;
    s = floor(s * 24.0 + hash1(px * 160.0 + floor(uTime * 4.0)) * 0.9) / 24.0;   // its 15-bit colour and its noise
    c = srgb(clamp(s, 0.0, 1.0));
    if (uRec > 0.5) c = mix(c, vec3(1.0, 0.1, 0.1), smoothstep(5.0, 4.0, length(p - vec2(356.0, 60.0))));
  }
  gl_FragColor = vec4(c, 1.0);
}`,
  // the shot itself: drawn from inside the room's frame, four times a second, only while a webcam is on a screen in view.
  // An extra view of the room costs a few ms (most of it per render, not per draw: splitting it over frames saved little),
  // so it leaves out what is too small to show at 160 x 120, and draws into a back buffer that is shown once whole.
  render(r, viz, ch, draw) {
    const S = ch.s, eye = viz.room, now = performance.now();
    if (S.k == null && eye && eye.scene && eye.from && now >= S.next) {
      // a machine the room has had to go easy on gets one shot a second
      S.next = now + (eye.lite ? 1000 : 250); S.k = 0; S.parts = [[]]; S.small.length = 0; let i = 0;
      eye.scene.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry) return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const s = o.getWorldScale(S.v), rad = o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z);
        (rad < 0.03 && !o.isInstancedMesh ? S.small : S.parts[i++ % S.parts.length]).push(o);
      });
      const cam = S.cam; cam.position.copy(eye.from); cam.lookAt(eye.at); cam.updateMatrixWorld();
    }
    if (S.k != null && eye?.scene) {
      const hide = [S.small, ...S.parts.filter((_, j) => j !== S.k)], was = hide.map((l) => l.map((o) => o.visible)), sc = eye.scene, bg = sc.background;
      hide.forEach((l) => l.forEach((o) => { o.visible = false; }));
      if (S.k > 0) sc.background = null;                                 // the later thirds draw over the first
      const sm = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
      r.setRenderTarget(S.rts[1]); if (S.k === 0) r.clear(); r.render(sc, S.cam); r.shadowMap.autoUpdate = sm;
      sc.background = bg; hide.forEach((l, a) => l.forEach((o, b) => { o.visible = was[a][b]; }));
      if (++S.k === S.parts.length) { S.k = null; S.rts.reverse(); ch.mat.uniforms.uCam.value = S.rts[0].texture; }
    }
    draw(ch.mat, ch.rt);
  },
};

// the media player: its visualisation changes every four bars between bars and waves, an ambience swirl, and the album art
ERA.mplayer = {
  uniforms: () => ({ uVis: { value: 0 }, uArt: { value: null }, uHasArt: { value: 0 } }),
  init(viz, ch) { ch.s = {}; art.on(() => { ch.s.artTex?.dispose(); ch.s.artTex = null; }); },
  feed(dt, fx, viz, ch) {
    const U = ch.mat.uniforms, bar = Math.floor((fx.beat || fx.time * 2.27) / 4);
    U.uVis.value = Math.floor(bar / 4) % 3; ch.s.sec = Math.floor(Math.max(0, fx.songT || 0));
    if (art.has() && !ch.s.artTex) { const t = ch.s.artTex = new THREE.Texture(art.img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; }
    U.uArt.value = ch.s.artTex || null; U.uHasArt.value = ch.s.artTex ? 1 : 0;
  },
  sig: (fx, viz, ch) => `${fonts()}|${ch.s.sec}|${ch.mat.uniforms.uVis.value}|${art.has()}`,
  paint(x, fx, viz, ch, trk) {
    desk(x); const a = win(x, 4, 4, 376, 280, 'Now Playing');
    sunken(x, a.x + 4, a.y + 4, a.w - 8, 188, '#000');
    text(x, `${trk.artist} - ${trk.title}`, a.x + 6, a.y + 208, { bold: true });
    text(x, ['Bars and Waves', 'Ambience: Swirl', 'Album Art'][ch.mat.uniforms.uVis.value] + (ch.mat.uniforms.uVis.value === 2 && !art.has() ? ' (none)' : ''), a.x + 6, a.y + 224, { color: '#444' });
    const dur = fx.song?.m.dur || 190.6; text(x, `${fmt(ch.s.sec || 0)} / ${fmt(dur)}`, a.x + a.w - 6, a.y + 208, { align: 'right' });
    sunken(x, a.x + 4, a.y + 230, a.w - 8, 8, '#fff'); x.fillStyle = '#000080'; x.fillRect(a.x + 6, a.y + 232, (a.w - 12) * Math.min(1, (ch.s.sec || 0) / dur), 4);
    ['|◀◀', '▶', '■', '▶▶|'].forEach((g, i) => button(x, a.x + 4 + i * 34, a.y + a.h - 24, 30, 22, g, i === 1));
  },
  frag: `uniform float uVis, uHasArt; uniform sampler2D uArt;
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2832 * (t + vec3(0.0, 0.33, 0.67))); }
void main() {
  vec2 p = L(); vec3 c = chromeAt(p).rgb;
  vec2 v = (p - vec2(10.0, 30.0)) / vec2(364.0, 184.0);
  if (v.x >= 0.0 && v.y >= 0.0 && v.x < 1.0 && v.y < 1.0) {
    vec2 q = (v - 0.5) * vec2(2.0, 1.0); float y = 1.0 - v.y; vec3 o = vec3(0.0);
    if (uVis < 0.5) {                                          // bars over a mirrored wave
      float b = floor(v.x * 40.0), f = fract(v.x * 40.0), s = specB(4.0 + b * 3.0) * 1.1, pk = peakB(4.0 + b * 3.0);
      o = srgb(mix(vec3(0.1, 0.4, 1.0), vec3(0.4, 0.9, 1.0), y)) * step(f, 0.8) * step(y, s * 0.85) * step(0.15, y);
      o += vec3(1.0) * step(f, 0.8) * step(abs(y - pk * 0.85), 0.006) * step(0.15, y);
      float w = texelFetch(uData, ivec2(int(v.x * 511.0), 0), 0).r; o += vec3(0.2, 1.0, 0.6) * smoothstep(0.02, 0.0, abs(y - 0.08 - w * 0.07)) * step(y, 0.15);
    } else if (uVis < 1.5 || uHasArt < 0.5) {                  // the ambience: a swirl that turns with the mids and blooms on the bass
      float r = length(q), a = atan(q.y, q.x);
      float sw = sin(a * 3.0 + r * 9.0 - uTime * (1.2 + 2.5 * uMid) + sin(r * 4.0 - uTime) * (1.0 + 2.0 * uLow));
      float sw2 = sin(a * 5.0 - r * 13.0 + uTime * 0.9);
      o = srgb(pal(r * 0.6 + uTime * 0.05 + 0.15 * sw2)) * smoothstep(0.1, 0.9, 0.5 + 0.5 * sw) * (0.25 + 0.9 * smoothstep(1.3, 0.0, r)) * (0.6 + 0.6 * uLow + 0.6 * uKick);
    } else {                                                   // the album art, slowly pushing in, the level as a bar under it
      float z = 1.0 - 0.08 * fract(uTime * 0.03); vec2 a = vec2((v.x - 0.5) * 364.0 / 184.0, v.y - 0.5) * z + 0.5;
      o = texture(uArt, vec2(a.x, 1.0 - a.y)).rgb * step(abs(a.x - 0.5), 0.5) * (0.92 + 0.15 * uKick);
    }
    c = o;
  }
  gl_FragColor = vec4(c, 1.0);
}`,
};
