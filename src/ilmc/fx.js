// What is in the air: dust in the flash, sparks, hearts, petals, insects; and what grows on the hill.
// A module of the room. The conductor (index.js) builds it once and then, every frame, tells it what is happening
// (`stage`) and, when something happens, what (`on`). See the "stage and bus" comment in index.js for both shapes.
//   ctx: { scene, root (the room's group: y up, metres, +z toward the opening camera, floor at y = FLOOR), renderer, CX, FLOOR,
//          things (the machines), kit (props.js), listener (live audio), screens, sky, post, psx(obj) (joins the PS1 wobble) }
//
// One particle system for the whole song: three pools of camera-facing sprites cut from one atlas, one draw call each.
//   solid  cut-out shapes that write depth and take the room's light: confetti, CDs, floppies, hearts, butterflies, birds
//   glow   added light: dust and pollen (lit only by the flash, the screens and the sun), sparks, fireflies
//   soft   see-through and soft-edged: clouds you fly through, bubbles, dandelion seeds, drops on the lens
// Each pool is a fixed set of slots; a particle lives in a slot until it dies, then the last live one takes its place, so
// the GPU only ever draws the live ones and nothing is allocated while the song plays. Every act has a manager below that
// decides what is born where; the physics is the same for all (gravity, drag, wind, flutter, a bounce off the ground).
import * as THREE from 'three';
import { hill } from './sky.js';

// ---------------- the atlas: 8 x 4 cells, drawn once ----------------
export const SP = { DOT: 0, SPARK: 1, HEART: 2, PIXEL: 3, RECT: 4, CD: 5, FLOPPY: 6, CURSOR: 7, HOURGLASS: 8, FOLDER: 9, MYCOMP: 10, CLOUD: 11, SEED: 12, PETAL: 13, BUBBLE: 14, FLY: 15,
  BIRD_UP: 16, BIRD_DN: 17, DROP: 18, STREAMER: 19, STAR: 20, DISC: 21, NOTE: 22, FACE: 23, WINDOW: 24, MAIL: 25, SMOKE: 26 };
function atlas() {
  const C = 128, cv = document.createElement('canvas'); cv.width = C * 8; cv.height = C * 4;
  const x = cv.getContext('2d'), TAU = Math.PI * 2;
  const cell = (i, f) => { x.save(); x.translate((i % 8) * C, Math.floor(i / 8) * C); x.beginPath(); x.rect(0, 0, C, C); x.clip(); f(); x.restore(); };
  const radial = (cx, cy, r, stops) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); for (const [o, c] of stops) g.addColorStop(o, c); return g; };
  const poly = (pts, fill, stroke, lw = 4) => { x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.lineWidth = lw; x.strokeStyle = stroke; x.lineJoin = 'round'; x.stroke(); } };
  const heart = (cx, cy, s) => { x.beginPath(); x.moveTo(cx, cy + s * 0.9); x.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.7, cy - s * 1.2, cx, cy - s * 0.45); x.bezierCurveTo(cx + s * 0.7, cy - s * 1.2, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9); };
  cell(SP.DOT, () => { x.fillStyle = radial(64, 64, 60, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]); x.fillRect(0, 0, C, C); });
  cell(SP.SPARK, () => {
    x.fillStyle = radial(64, 64, 60, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,240,200,0.9)'], [0.4, 'rgba(255,200,120,0.15)'], [1, 'rgba(255,160,60,0)']]); x.fillRect(0, 0, C, C);
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(62, 6, 4, 116); x.fillRect(6, 62, 116, 4);
  });
  cell(SP.HEART, () => { heart(64, 60, 40); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 5; x.strokeStyle = 'rgba(150,150,150,1)'; x.stroke(); heart(52, 46, 9); x.fillStyle = '#fff'; x.fill(); });
  cell(SP.PIXEL, () => { x.fillStyle = '#bbb'; x.fillRect(22, 22, 84, 84); x.fillStyle = '#fff'; x.fillRect(28, 28, 72, 72); });
  cell(SP.RECT, () => { x.fillStyle = '#fff'; x.fillRect(40, 14, 48, 100); x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(40, 14, 48, 8); });
  cell(SP.CD, () => {
    x.beginPath(); x.arc(64, 64, 58, 0, TAU); x.arc(64, 64, 9, 0, TAU, true); x.fillStyle = '#d8dade'; x.fill('evenodd');
    const g = x.createConicGradient(0.4, 64, 64); ['#ff5ab4', '#ffe14a', '#6dff8a', '#4ad7ff', '#9a6bff', '#ff5ab4'].forEach((c, k) => g.addColorStop(k / 5, c));
    x.globalAlpha = 0.55; x.beginPath(); x.arc(64, 64, 56, 0, TAU); x.arc(64, 64, 20, 0, TAU, true); x.fillStyle = g; x.fill('evenodd'); x.globalAlpha = 1;
    x.beginPath(); x.arc(64, 64, 20, 0, TAU); x.arc(64, 64, 9, 0, TAU, true); x.fillStyle = 'rgba(240,240,245,0.95)'; x.fill('evenodd');
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 40, -0.9, -0.3); x.stroke();
  });
  cell(SP.FLOPPY, () => {
    poly([[14, 14], [104, 14], [114, 24], [114, 114], [14, 114]], '#fff', '#888', 3);
    x.fillStyle = '#9aa0a8'; x.fillRect(38, 14, 52, 34); x.fillStyle = '#5c6066'; x.fillRect(70, 20, 12, 22);
    x.fillStyle = '#eee'; x.fillRect(26, 66, 76, 48); x.fillStyle = '#c33'; x.fillRect(26, 66, 76, 7);
    x.fillStyle = '#aaa'; for (let k = 0; k < 4; k++) x.fillRect(32, 82 + k * 8, 60, 2);
  });
  cell(SP.CURSOR, () => poly([[30, 10], [30, 104], [52, 84], [68, 118], [82, 112], [66, 78], [96, 78]], '#fff', '#000', 6));
  cell(SP.HOURGLASS, () => {
    x.fillStyle = '#222'; x.fillRect(30, 10, 68, 10); x.fillRect(30, 108, 68, 10);
    poly([[36, 20], [92, 20], [92, 30], [68, 64], [92, 98], [92, 108], [36, 108], [36, 98], [60, 64], [36, 30]], '#f4f4f4', '#222', 5);
    poly([[46, 34], [82, 34], [64, 58]], '#e8c440'); poly([[64, 80], [86, 104], [42, 104]], '#e8c440');
  });
  cell(SP.FOLDER, () => { poly([[12, 30], [50, 30], [58, 40], [116, 40], [116, 106], [12, 106]], '#e6b422', '#7a5a00', 3); poly([[12, 52], [116, 52], [116, 106], [12, 106]], '#ffd84a', '#7a5a00', 3); });
  cell(SP.MYCOMP, () => {
    x.fillStyle = '#d9d2bf'; x.fillRect(18, 12, 92, 76); x.fillStyle = '#222'; x.fillRect(18, 12, 92, 76); x.fillStyle = '#d9d2bf'; x.fillRect(21, 15, 86, 70);
    x.fillStyle = '#1438c8'; x.fillRect(30, 22, 68, 50); x.fillStyle = '#5fe0ff'; x.fillRect(36, 28, 24, 14);
    x.fillStyle = '#bfb7a2'; x.fillRect(46, 88, 36, 10); x.fillStyle = '#d9d2bf'; x.fillRect(14, 98, 100, 18); x.strokeStyle = '#222'; x.lineWidth = 3; x.strokeRect(14, 98, 100, 18);
  });
  cell(SP.CLOUD, () => {
    for (const [cx, cy, r] of [[64, 74, 46], [40, 76, 30], [88, 74, 32], [54, 54, 30], [78, 52, 28], [64, 84, 40]])
      { x.fillStyle = radial(cx, cy, r, [[0, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]); x.fillRect(0, 0, C, C); }
  });
  cell(SP.SEED, () => {
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.6;
    for (let k = 0; k < 26; k++) { const a = -Math.PI * (0.05 + 0.9 * k / 25); x.beginPath(); x.moveTo(64, 50); x.lineTo(64 + Math.cos(a) * 40, 50 + Math.sin(a) * 40); x.stroke(); }
    x.fillStyle = radial(64, 30, 46, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); x.fillRect(0, 0, C, C);
    x.strokeStyle = 'rgba(230,230,220,1)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(64, 50); x.lineTo(64, 104); x.stroke(); x.fillStyle = '#8a7350'; x.fillRect(61, 100, 6, 14);
  });
  cell(SP.PETAL, () => { x.beginPath(); x.ellipse(64, 64, 26, 50, 0, 0, TAU); x.fillStyle = '#fff'; x.fill(); x.fillStyle = 'rgba(0,0,0,0.12)'; x.beginPath(); x.ellipse(64, 80, 10, 30, 0, 0, TAU); x.fill(); });
  cell(SP.BUBBLE, () => {
    x.fillStyle = radial(64, 64, 58, [[0, 'rgba(255,255,255,0.02)'], [0.78, 'rgba(255,255,255,0.08)'], [0.93, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]); x.fillRect(0, 0, C, C);
    const g = x.createConicGradient(1.0, 64, 64); ['#ff7ad9', '#7ad8ff', '#a6ff8c', '#ffe27a', '#ff7ad9'].forEach((c, k) => g.addColorStop(k / 4, c));
    x.globalAlpha = 0.5; x.lineWidth = 6; x.strokeStyle = g; x.beginPath(); x.arc(64, 64, 52, 0, TAU); x.stroke(); x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(44, 40, 12, 7, -0.7, 0, TAU); x.fill();
  });
  cell(SP.FLY, () => {
    const wing = (s) => {
      x.beginPath(); x.moveTo(64, 60); x.bezierCurveTo(64 + s * 20, 14, 64 + s * 62, 8, 64 + s * 58, 42); x.bezierCurveTo(64 + s * 56, 58, 64 + s * 30, 64, 64, 64);
      x.bezierCurveTo(64 + s * 30, 70, 64 + s * 48, 96, 64 + s * 30, 108); x.bezierCurveTo(64 + s * 14, 112, 64 + s * 6, 90, 64, 68); x.closePath();
      x.fillStyle = '#fff'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#1a1208'; x.stroke();
      x.fillStyle = '#1a1208'; x.beginPath(); x.arc(64 + s * 44, 30, 6, 0, TAU); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(64 + s * 46, 28, 2.5, 0, TAU); x.fill();
    };
    wing(-1); wing(1); x.fillStyle = '#1a1208'; x.beginPath(); x.ellipse(64, 66, 4, 26, 0, 0, TAU); x.fill();
    x.strokeStyle = '#1a1208'; x.lineWidth = 2; x.beginPath(); x.moveTo(62, 42); x.lineTo(54, 26); x.moveTo(66, 42); x.lineTo(74, 26); x.stroke();
  });
  const bird = (i, up) => cell(i, () => { x.strokeStyle = '#111'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath();
    if (up) { x.moveTo(14, 40); x.quadraticCurveTo(40, 52, 64, 72); x.quadraticCurveTo(88, 52, 114, 40); } else { x.moveTo(14, 84); x.quadraticCurveTo(40, 64, 64, 66); x.quadraticCurveTo(88, 64, 114, 84); }
    x.stroke(); x.fillStyle = '#111'; x.beginPath(); x.ellipse(64, 68, 8, 6, 0, 0, TAU); x.fill(); });
  bird(SP.BIRD_UP, true); bird(SP.BIRD_DN, false);
  cell(SP.DROP, () => {
    x.fillStyle = radial(64, 64, 56, [[0, 'rgba(200,220,255,0.10)'], [0.75, 'rgba(220,235,255,0.22)'], [0.9, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]); x.fillRect(0, 0, C, C);
    x.fillStyle = 'rgba(30,40,60,0.35)'; x.beginPath(); x.arc(64, 44, 34, Math.PI * 1.1, Math.PI * 1.9); x.lineTo(64, 64); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(78, 84, 10, 6, -0.6, 0, TAU); x.fill();
  });
  cell(SP.STREAMER, () => { x.beginPath(); for (let k = 0; k <= 40; k++) { const yy = 4 + k * 3, xx = 64 + Math.sin(k * 0.45) * 22; k ? x.lineTo(xx, yy) : x.moveTo(xx, yy); } x.lineWidth = 12; x.strokeStyle = '#fff'; x.stroke(); });
  cell(SP.STAR, () => {
    x.fillStyle = radial(64, 64, 40, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); x.fillRect(0, 0, C, C);
    poly([[64, 4], [72, 56], [124, 64], [72, 72], [64, 124], [56, 72], [4, 64], [56, 56]], '#fff');
  });
  cell(SP.DISC, () => { x.beginPath(); x.arc(64, 64, 34, 0, TAU); x.fillStyle = '#fff'; x.fill(); });
  cell(SP.NOTE, () => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(46, 92, 20, 15, -0.4, 0, TAU); x.fill(); x.fillRect(60, 22, 8, 72); poly([[60, 22], [100, 34], [100, 50], [68, 40]], '#fff'); });
  cell(SP.FACE, () => {
    const g = x.createLinearGradient(0, 10, 0, 118); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#9aa2ae'); g.addColorStop(0.55, '#e8ecf2'); g.addColorStop(1, '#6a707a');
    poly([[10, 18], [118, 18], [64, 114]], g, '#2a2d33', 5);
    x.fillStyle = '#111'; x.beginPath(); x.ellipse(46, 42, 6, 10, 0, 0, TAU); x.ellipse(82, 42, 6, 10, 0, 0, TAU); x.fill();
    x.strokeStyle = '#111'; x.lineWidth = 4; x.beginPath(); x.arc(58, 62, 6, 0, Math.PI); x.arc(70, 62, 6, 0, Math.PI); x.stroke();
  });
  cell(SP.WINDOW, () => {
    x.fillStyle = '#c0c0c0'; x.fillRect(10, 22, 108, 84); x.fillStyle = '#fff'; x.fillRect(10, 22, 108, 3); x.fillRect(10, 22, 3, 84); x.fillStyle = '#404040'; x.fillRect(115, 22, 3, 84); x.fillRect(10, 103, 108, 3);
    const g = x.createLinearGradient(14, 0, 114, 0); g.addColorStop(0, '#000080'); g.addColorStop(1, '#1084d0'); x.fillStyle = g; x.fillRect(14, 26, 100, 16);
    x.fillStyle = '#c0c0c0'; x.fillRect(100, 29, 11, 10); x.fillStyle = '#fff'; x.fillRect(22, 50, 84, 40); x.fillStyle = '#c0c0c0'; x.fillRect(48, 92, 32, 9);
  });
  cell(SP.MAIL, () => { x.fillStyle = '#fafafa'; x.fillRect(14, 32, 100, 66); x.strokeStyle = '#555'; x.lineWidth = 4; x.strokeRect(14, 32, 100, 66); x.beginPath(); x.moveTo(14, 32); x.lineTo(64, 70); x.lineTo(114, 32); x.stroke(); x.fillStyle = '#e33'; x.fillRect(88, 40, 16, 16); });
  cell(27, () => { x.fillStyle = radial(64, 64, 60, [[0, 'rgba(255,255,255,0.55)'], [0.78, 'rgba(255,255,255,0.7)'], [0.9, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]); x.beginPath(); x.arc(64, 64, 60, 0, TAU); x.fill(); });
  cell(SP.SMOKE, () => {
    for (const [cx, cy, r] of [[64, 64, 54], [48, 70, 34], [80, 56, 34]]) { x.fillStyle = radial(cx, cy, r, [[0, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]); x.fillRect(0, 0, C, C); }
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------------- the sprites' shader: one for all three pools, told apart by defines ----------------
const VS = `
attribute vec4 iPos;   // x, y, z (the room's metres), size (m; on the lens: a fraction of the picture's height)
attribute vec4 iCol;   // tint (linear), alpha
attribute vec4 iMisc;  // sprite, spin (rad), width (-1..1: a card turning edge-on, a wing beating), streak (s of motion; < 0: on the lens)
attribute vec4 iVel;   // velocity (m/s, for the streak), how much light it gives off itself
uniform vec3 uAmb, uSunC, uSunD, uFlashP, uKeyP, uKeyC; uniform float uFlash, uAspect, uFocus, uAper;
uniform vec4 uLitP[6]; uniform vec3 uLitC[6];
varying vec2 vUv; varying vec4 vCol;
void main() {
  vec2 c = position.xy;
  float sp = iMisc.x; vec2 cell = vec2(mod(sp, 8.0), floor(sp / 8.0 + 0.01));
  vUv = vec2((cell.x + c.x + 0.5) / 8.0, 1.0 - (cell.y + 0.5 - c.y) / 4.0);
  vec2 q = vec2(c.x * iMisc.z, c.y);
  float a = iMisc.y; q = mat2(cos(a), sin(a), -sin(a), cos(a)) * q;
  // what lights it: its own glow, the room's ambient, the sun, the camera's flash, the lamp, the six biggest screens
  vec3 P = iPos.xyz, L = uAmb + uSunC;
  vec3 df = P - uFlashP; L += uFlash * vec3(1.0, 0.965, 0.92) / (1.0 + dot(df, df) * 0.45);
  vec3 dk = P - uKeyP; L += uKeyC / (1.0 + dot(dk, dk) * 2.0);
  for (int i = 0; i < 6; i++) { vec3 d = uLitP[i].xyz - P; L += uLitC[i] * uLitP[i].w / (dot(d, d) + 0.05); }
  vCol = vec4(iCol.rgb * (iVel.w + L), iCol.a);
  if (iMisc.w < 0.0) {                                           // on the lens: placed in the picture, not the room
    gl_Position = vec4(P.xy + q * iPos.w * vec2(1.0 / uAspect, 1.0), -0.999, 1.0);
    vCol = vec4(iCol.rgb * (iVel.w + uAmb), iCol.a);
    return;
  }
  vec4 mv = modelViewMatrix * vec4(P, 1.0);
  float size = iPos.w;
#ifndef CUT
  // out of focus: a mote close to the lens is a big soft disc, dimmer for being spread (the post's blur only sees what writes depth)
  float coc = uAper * abs(-mv.z - uFocus) / uFocus;
  if (sp < 0.5 && coc > size) { vUv = vec2((3.0 + c.x + 0.5) / 8.0, 1.0 - (3.0 + 0.5 - c.y) / 4.0); vCol.a *= max(0.14, pow(size / coc, 0.8)); size = coc; }
#endif
  vec2 v = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xy; float vl = length(v);
  if (iMisc.w > 0.0 && vl > 1e-4) {                              // a streak: the card's length lies along its motion on screen
    vec2 dir = v / vl; q = vec2(c.x * iMisc.z * size, c.y * (size + iMisc.w * vl));
    mv.xy += mat2(dir.y, -dir.x, dir.x, dir.y) * q;
  } else mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vCol.a;
#ifdef CUT
  if (a < 0.5) discard;
  gl_FragColor = vec4(vCol.rgb * t.rgb, 1.0);
#else
  gl_FragColor = vec4(vCol.rgb * t.rgb, a);
#endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// how each particle moves
const K = { PHYS: 0, HAND: 1, DUST: 2, LENS: 3, STREAM: 4 };
class Pool {
  constructor(n, mat) {
    this.n = n; this.count = 0;
    const g = new THREE.InstancedBufferGeometry(), b = new THREE.PlaneGeometry(1, 1);
    g.index = b.index; g.setAttribute('position', b.attributes.position);
    this.gpu = {};
    for (const k of ['iPos', 'iCol', 'iMisc', 'iVel']) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); this.gpu[k] = a; }
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.userData.keep = true;
    // the simulation, one row per slot
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.size = new Float32Array(n); this.col = new Float32Array(n * 4); this.sprite = new Float32Array(n); this.spin = new Float32Array(n); this.spinV = new Float32Array(n);
    this.flip = new Float32Array(n); this.flipV = new Float32Array(n); this.streak = new Float32Array(n); this.emit = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.wind = new Float32Array(n); this.bounce = new Float32Array(n); this.kind = new Uint8Array(n);
    this.tag = new Uint8Array(n); this.seed = new Float32Array(n); this.grow = new Float32Array(n);
  }
  // a new particle, or -1 when the pool is full; the caller fills in what differs from the defaults
  add(x, y, z, vx, vy, vz, life, size, sprite, r, g, b, a = 1) {
    if (this.count >= this.n) return -1;
    const i = this.count++, i3 = i * 3, i4 = i * 4;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.sprite[i] = sprite; this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a;
    this.spin[i] = Math.random() * 6.283; this.spinV[i] = 0; this.flip[i] = Math.random() * 6.283; this.flipV[i] = 0; this.streak[i] = 0; this.emit[i] = 0;
    this.grav[i] = 0; this.drag[i] = 0; this.wind[i] = 0; this.bounce[i] = -1; this.kind[i] = K.PHYS; this.tag[i] = 0; this.seed[i] = Math.random(); this.grow[i] = 0;
    return i;
  }
  kill(i) {
    const j = --this.count; if (i === j) return;
    for (const a of [this.p, this.v]) { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; }
    for (let k = 0; k < 4; k++) this.col[i * 4 + k] = this.col[j * 4 + k];
    for (const a of [this.age, this.life, this.size, this.sprite, this.spin, this.spinV, this.flip, this.flipV, this.streak, this.emit, this.grav, this.drag, this.wind, this.bounce, this.kind, this.tag, this.seed, this.grow]) a[i] = a[j];
  }
}

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const R = Math.random, rr = (a, b) => a + (b - a) * Math.random();
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };      // sRGB hex -> the camera's linear light
// her type colours (the white's confetti), the drops' candy, the build's pixels
const TYPE = ['#000000', '#000000', '#1530e8', '#e8141e', '#39ff14', '#ff1fa8', '#ff7a00'].map(lin);
const CANDY = ['#ff4fa3', '#ffe10a', '#4ad7ff', '#7dff6a', '#b06bff', '#ffffff', '#ff7a1a'].map(lin);
const PIX = ['#ff2d95', '#29e6ff', '#ffe10a', '#5dff4a', '#ffffff'].map(lin);
const WINGS = ['#ff8a1a', '#ffd21a', '#5ab4ff', '#ffffff', '#ff6ad5'].map(lin);

export class Atmos {
  constructor(ctx) {
    this.ctx = ctx; const { root, FLOOR } = ctx; this.FLOOR = FLOOR;
    this.map = atlas();
    const shared = { uMap: { value: this.map }, uFlashP: { value: new THREE.Vector3() }, uFlash: { value: 0 }, uKeyP: { value: new THREE.Vector3() }, uKeyC: { value: new THREE.Color(0, 0, 0) },
      uLitP: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uLitC: { value: Array.from({ length: 6 }, () => new THREE.Color(0, 0, 0)) }, uSunD: { value: new THREE.Vector3(0, 1, 0) }, uAspect: { value: 1.78 }, uFocus: { value: 3 }, uAper: { value: 0.02 } };
    const mat = (o, defines) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, defines, uniforms: { ...shared, uAmb: { value: new THREE.Color(0, 0, 0) }, uSunC: { value: new THREE.Color(0, 0, 0) } }, ...o });
    const q = ctx.quality ?? 2;
    this.solid = new Pool(2600, mat({ side: THREE.DoubleSide }, { CUT: 1 }));
    this.glow = new Pool(2400, mat({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.soft = new Pool(700, mat({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.glow.mesh.renderOrder = 5; this.soft.mesh.renderOrder = 6;
    for (const P of [this.solid, this.glow, this.soft]) root.add(P.mesh);
    this.shared = shared;
    // what in the room the air answers: the speakers (kicks), the CRTs (static), the lead computer (the builds), the screens that light the dust
    this.speakers = ctx.things.filter((o) => o.kind === 'speaker');
    this.crts = ctx.things.flatMap((o) => o.screens.filter((s) => s.crt));
    this.hero = ctx.things[0];
    this.lit = ctx.things.flatMap((o) => o.screens).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 6);
    this.key = null; ctx.scene.traverse((o) => { if (o.isSpotLight && !this.key) this.key = o; if (o.isHemisphereLight) this.hemi = o; if (o.isDirectionalLight) this.sunL = o; });
    // where cables.js lays the power strip (behind the deck, left)
    this.strip = new THREE.Vector3(ctx.CX - 0.55, FLOOR + 0.03, -0.42);
    this.kicks = 0; this.wind = 0; this.gust = 0; this.t = 0; this.lastAct = 'room';
    this.flies = []; this.birds = []; this.lastMote = -1; this.hat = 0;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._f = new THREE.Vector3();
  }

  // ---------------- the bus ----------------
  on(type, e, st) {
    if (type === 'drop') this.burst(st, e);
    else if (type === 'hit') this.hit(e, st);
    else if (type === 'chop') { if (st.act === 'room' || st.act === 'bliss') this.pour(st, 6, 1.6); }
    else if (type === 'word') { if ((st.act === 'room' || st.act === 'bliss') && /computer|love/i.test(e.w)) this.pour(st, st.reduce ? 3 : 10, 1.2, true); }
    else if (type === 'beat') { if (st.act === 'flight' && e.b === 0 && !st.reduce) this.confettiPuff(st, 26); }
    else if (type === 'cut') this.cut(e, st);
  }
  hit(e, st) {
    const big = e.big, room = st.act === 'room';
    if (room && st.playing && !st.reduce) {
      if (big && e.power >= 0.6) this.sparks(this.strip, 18 + 22 * e.power, 2.4);           // the strip arcs on the two big hits
      const n = big ? 3 : 1;                                                                  // static on the tubes
      for (let k = 0; k < n; k++) this.crackle(this.crts[(Math.random() * this.crts.length) | 0], big ? 10 : 5);
    }
    if (st.act === 'void' && big) this.cannons(st, e.i);
    if (st.act === 'bliss' && big) this.popBubbles(st);
  }
  cut(e, st) {
    // leaving a place lets its things go (they fade where they are); arriving sets the new one's residents up
    const keep = (P, f) => { for (let i = 0; i < P.count; i++) if (f(i, P)) P.life[i] = Math.min(P.life[i], P.age[i] + 0.4 + Math.random() * 0.5); };
    if (e.to !== 'room' && e.to !== 'off') keep(this.glow, (i, P) => P.kind[i] === K.DUST && P.tag[i] === 0);
    if (e.to !== 'bliss') { for (const P of [this.solid, this.glow, this.soft]) keep(P, (i) => P.tag[i] === 2 || P.tag[i] === 5 || P.tag[i] === 6); this.flies.length = 0; this.birds.length = 0; }
    if (e.to !== 'flight') { keep(this.solid, (i, P) => P.kind[i] === K.STREAM); keep(this.soft, (i, P) => P.kind[i] === K.STREAM); }
    if (e.to === 'bliss') { this.hill = { seeds: 0, bub: 0 }; this.flockN = 0; this.birds.length = 0; }
  }

  // ---------------- every frame ----------------
  update(dt, fx, st) {
    if (!dt) return;
    const c = this.ctx, act = st.act; this.t += dt;
    const kicked = c.listener.kicks !== this.kicks && st.alive > 0.2; this.kicks = c.listener.kicks;
    const hatHit = fx.hat > 0.95 && this.hat < 0.95; this.hat = fx.hat;
    this.qk = st.quality === 2 ? 1 : st.quality === 1 ? 0.6 : 0.35;                         // fewer of everything on a weaker machine
    // the wind: a slow breeze, a gust on every kick (the hill's grass and everything light in the air ride it)
    this.gust = Math.max(this.gust * Math.exp(-dt * 2.2), kicked ? 0.6 + 0.4 * fx.kick : 0);
    this.wind = 0.25 + 0.12 * Math.sin(this.t * 0.37) + 0.08 * Math.sin(this.t * 1.13) + this.gust * (st.reduce ? 0.4 : 1);
    this.lights(fx, st);
    if (act === 'room') this.room(dt, fx, st, kicked);
    else if (act === 'flight') this.flight(dt, fx, st);
    else if (act === 'bliss') this.meadow(dt, fx, st, kicked, hatHit);
    else if (act === 'void' && st.reduce) this.drizzle(dt, st);
    if (act === 'room' || act === 'off') this.dust(dt, fx, st);
    c.sky?.live?.(dt, fx, st, { kicked, wind: this.wind, gust: this.gust, renderer: c.renderer, scene: c.scene, flyV: this.flyV || 0 });
    for (const P of [this.solid, this.glow, this.soft]) { this.step(P, dt, st); this.upload(P); }
  }

  // light for the sprites: borrowed from the room's own lights, so a confetto in the sun and a mote in the flash agree with the machines
  lights(fx, st) {
    const S = this.shared, root = this.ctx.root, h = this.hemi, sl = this.sunL;
    S.uFlashP.value.copy(st.eye); S.uFlash.value = (st.reduce ? 0.35 : 0.12 + 3.4 * st.pop) * (st.env.bliss > 0.5 ? 0.15 + 0.85 * ss(0.8, 1.5, st.day) : 1) * (1 - st.lift);
    if (this.key) { root.worldToLocal(this.key.getWorldPosition(S.uKeyP.value)); S.uKeyC.value.copy(this.key.color).multiplyScalar(this.key.intensity * 0.012); }
    for (let i = 0; i < 6; i++) {
      const s = this.lit[i], P = S.uLitP.value[i], C = S.uLitC.value[i];
      if (!s) { P.w = 0; continue; }
      s.mesh.getWorldPosition(this._v); root.worldToLocal(this._v); P.set(this._v.x, this._v.y, this._v.z, s.w * s.h * (0.9 + 1.6 * fx.kick * fx.alive));
      const g = this.ctx.screens.glow(s); C.setRGB(g[0], g[1], g[2]).multiplyScalar(0.35 + 0.6 * s.flash);
    }
    S.uSunD.value.copy(st.sun);
    const amb = this.solid.mesh.material.uniforms.uAmb.value, sun = this.solid.mesh.material.uniforms.uSunC.value;
    if (h) amb.copy(h.color).lerp(h.groundColor, 0.35).multiplyScalar(h.intensity * 0.55); else amb.setRGB(0.05, 0.05, 0.05);
    if (sl) sun.copy(sl.color).multiplyScalar(sl.intensity * 0.32 * Math.max(0.2, st.sun.y + 0.3)); else sun.setRGB(0, 0, 0);
    // dust and pollen: no ambient of their own (only the flash, the lamp, the screens, and on the hill the sun through the air)
    const ga = this.glow.mesh.material.uniforms, sa = this.soft.mesh.material.uniforms;
    ga.uAmb.value.setRGB(0, 0, 0); ga.uSunC.value.copy(sl ? sl.color : ga.uSunC.value).multiplyScalar(sl ? sl.intensity * 0.09 * st.env.bliss : 0);
    sa.uAmb.value.copy(amb).multiplyScalar(1.15); sa.uSunC.value.copy(sun);
    const cv = this.ctx.renderer.domElement; S.uAspect.value = cv.width / Math.max(1, cv.height);
    // the lens: focused on the record (as post.js is), wide open in the dark, stopped down in daylight and on a weaker machine
    S.uFocus.value = Math.max(0.3, st.eye.distanceTo(this._f.set(this.ctx.CX, 0, 0))); S.uAper.value = (st.quality > 1 ? 0.02 : 0.012) * (1 - 0.6 * Math.max(st.env.y2k, st.env.void)) * (1 - 0.4 * st.env.bliss);
  }

  // ---------------- the physics, the same for every particle ----------------
  step(P, dt, st) {
    const F = this.FLOOR, wind = this.wind, flyV = this.flyV || 0, eyeZ = st.eye.z, bliss = st.env.bliss > 0.5;
    for (let i = 0; i < P.count; i++) {
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) { P.kill(i); i--; continue; }
      const k = P.kind[i], i3 = i * 3;
      if (k === K.HAND) continue;                                    // its manager moves it
      let vx = P.v[i3], vy = P.v[i3 + 1], vz = P.v[i3 + 2];
      if (k === K.LENS) { P.p[i3 + 1] += vy * dt; P.v[i3 + 1] = vy - dt * 0.05 * P.seed[i]; continue; }   // drops on the glass slide down
      const d = Math.exp(-P.drag[i] * dt);
      vx *= d; vy = vy * d - P.grav[i] * dt; vz *= d;
      if (k === K.DUST) {                                           // hanging in the air: a slow wander, no fall
        const s = P.seed[i] * 40, t = this.t;
        vx += (Math.sin(t * 0.31 + s) * 0.004 + Math.sin(P.p[i3 + 1] * 3.1 + t * 0.2 + s) * 0.003) * dt * 60;
        vy += Math.sin(t * 0.23 + s * 1.7) * 0.002 * dt * 60; vz += Math.cos(t * 0.27 + s * 0.6) * 0.003 * dt * 60;
      }
      vx += P.wind[i] * wind * dt * 1.5; vz -= P.wind[i] * wind * dt * 0.4;
      P.v[i3] = vx; P.v[i3 + 1] = vy; P.v[i3 + 2] = vz;
      P.p[i3] += vx * dt; P.p[i3 + 1] += vy * dt; P.p[i3 + 2] += vz * dt;
      if (k === K.STREAM) { P.p[i3 + 2] += flyV * dt; if (P.p[i3 + 2] > eyeZ + 1.2) { P.kill(i); i--; continue; } }
      if (P.bounce[i] >= 0) {                                       // the ground: bounce, then lie there
        const g = F + 0.003 + (bliss ? hill(P.p[i3], P.p[i3 + 2]) : 0);
        if (P.p[i3 + 1] < g) { P.p[i3 + 1] = g; P.v[i3 + 1] = Math.abs(vy) > 0.4 ? -vy * P.bounce[i] : 0; P.v[i3] *= 0.6; P.v[i3 + 2] *= 0.6; P.spinV[i] *= 0.5; if (Math.abs(vy) < 0.4) { P.flipV[i] = 0; P.flip[i] = Math.PI * 0.5 * Math.round(P.flip[i] / (Math.PI * 0.5)); } }
      }
      P.spin[i] += P.spinV[i] * dt; P.flip[i] += P.flipV[i] * dt; P.size[i] += P.grow[i] * dt;
    }
  }
  upload(P) {
    const G = P.gpu, a = G.iPos.array, c = G.iCol.array, m = G.iMisc.array, v = G.iVel.array;
    for (let i = 0; i < P.count; i++) {
      const i3 = i * 3, i4 = i * 4, t = P.age[i], L = P.life[i];
      const fade = Math.min(1, t / Math.min(0.25, L * 0.15)) * Math.min(1, (L - t) / Math.min(1.2, L * 0.3));
      a[i4] = P.p[i3]; a[i4 + 1] = P.p[i3 + 1]; a[i4 + 2] = P.p[i3 + 2]; a[i4 + 3] = P.size[i];
      c[i4] = P.col[i4]; c[i4 + 1] = P.col[i4 + 1]; c[i4 + 2] = P.col[i4 + 2]; c[i4 + 3] = P.col[i4 + 3] * fade;
      const fl = P.flipV[i] !== 0 ? Math.cos(P.flip[i]) : (P.kind[i] === K.HAND ? P.flip[i] : 1);
      m[i4] = P.sprite[i]; m[i4 + 1] = P.spin[i]; m[i4 + 2] = Math.abs(fl) < 0.06 ? 0.06 * Math.sign(fl || 1) : fl; m[i4 + 3] = P.kind[i] === K.LENS ? -1 : P.streak[i];
      v[i4] = P.v[i3]; v[i4 + 1] = P.v[i3 + 1]; v[i4 + 2] = P.v[i3 + 2] + (P.kind[i] === K.STREAM ? this.flyV || 0 : 0); v[i4 + 3] = P.emit[i] * (P.kind[i] === K.LENS || P.tag[i] === 3 ? 1 : fade);
    }
    for (const k in G) { G[k].clearUpdateRanges(); if (P.count) { G[k].addUpdateRange(0, P.count * 4); G[k].needsUpdate = true; } }
    P.mesh.geometry.instanceCount = P.count; P.mesh.visible = P.count > 0;
  }

  // ---------------- the dark room ----------------
  // dust hangs in a box around the pile; you only see it where the flash or a screen catches it
  dust(dt, fx, st) {
    const P = this.glow, F = this.FLOOR, CX = this.ctx.CX, end = st.song != null && st.song > 181.5, off = st.act === 'off';
    const want = Math.round((end || off ? 0 : 900) * this.qk);
    let have = 0; for (let i = 0; i < P.count; i++) if (P.kind[i] === K.DUST && P.tag[i] === 0) have++;
    for (let k = 0; k < Math.min(60, want - have); k++) {
      let x = CX + rr(-2.6, 2.6), y = F + Math.pow(R(), 1.4) * 1.8 + 0.02, z = rr(-2.2, 1.6);
      if (R() < 0.35) { const E = st.eye, t = rr(0.06, 0.45); x = E.x + (CX - E.x) * t + rr(-0.6, 0.6) * t; y = E.y + (F + 0.1 - E.y) * t + rr(-0.4, 0.4) * t; z = E.z - E.z * t + rr(-0.4, 0.4) * t; }
      const i = P.add(x, y, z, 0, 0, 0, rr(14, 40), rr(0.0025, 0.007), SP.DOT, 1, 0.95, 0.88, rr(0.35, 0.8));
      if (i < 0) break; P.kind[i] = K.DUST; P.drag[i] = 1.5; P.age[i] = R() * 3;
    }
    // the power-down: the dust settles to the floor and goes out; one mote is the last thing in the air
    if (end || off) {
      for (let i = 0; i < P.count; i++) if (P.kind[i] === K.DUST && P.tag[i] === 0) { P.grav[i] = 0.05; P.drag[i] = 2.5; P.bounce[i] = 0; if (P.p[i * 3 + 1] < F + 0.01) P.life[i] = Math.min(P.life[i], P.age[i] + 1.5); }
      if (this.lastMote < 0 && st.song != null && st.song > 184) {
        const i = P.add(CX - 0.3, F + 0.9, 0.35, 0.01, -0.012, 0, 9, 0.006, SP.DOT, 1, 0.92, 0.8, 1);
        if (i >= 0) { P.kind[i] = K.PHYS; P.drag[i] = 0.2; P.emit[i] = 0.35; P.tag[i] = 3; this.lastMote = 1; }
      }
    } else this.lastMote = -1;
  }
  room(dt, fx, st, kicked) {
    if (!st.playing) return;
    // a breath of dust off the woofers on every kick
    if (kicked) for (const o of this.speakers) {
      const s = o.size / 0.3; this._v.set(0, 0.108 * s, 0.13 * s).applyMatrix4(o.g.matrix); this._w.set(0, 0, 1).transformDirection(o.g.matrix);
      const n = Math.round((st.reduce ? 3 : 9) * this.qk), sp = st.reduce ? 0.25 : 0.6 + 0.6 * fx.kick;
      for (let k = 0; k < n; k++) {
        const i = this.glow.add(this._v.x + rr(-0.04, 0.04), this._v.y + rr(-0.04, 0.04), this._v.z, (this._w.x + rr(-0.5, 0.5)) * sp, (this._w.y + rr(-0.2, 0.6)) * sp, (this._w.z + rr(-0.5, 0.5)) * sp, rr(1.2, 2.6), rr(0.003, 0.008), SP.DOT, 1, 0.94, 0.86, 0.9);
        if (i >= 0) { this.glow.drag[i] = 3.2; this.glow.kind[i] = K.DUST; this.glow.tag[i] = 1; this.glow.emit[i] = 0.05; }
      }
      if (!st.reduce && R() < 0.5) { const i = this.soft.add(this._v.x, this._v.y, this._v.z, this._w.x * 0.25, 0.05, this._w.z * 0.25, 1.4, 0.07, SP.SMOKE, 0.5, 0.48, 0.46, 0.18); if (i >= 0) { this.soft.drag[i] = 2; this.soft.grow[i] = 0.12; } }
    }
    // the builds: hearts and pixels pour out of the lead computer, faster and faster
    if (st.build > 0.02) {
      this.pourAcc = (this.pourAcc || 0) + dt * (st.reduce ? 3 + 10 * st.build : 3 + 140 * st.build * st.build) * this.qk;
      const n = Math.floor(this.pourAcc); this.pourAcc -= n; if (n) this.pour(st, n, 0.8 + 1.4 * st.build);
    }
    // the tubes tick with static now and then
    if (!st.reduce && R() < dt * (1.5 + 6 * fx.energy)) this.crackle(this.crts[(R() * this.crts.length) | 0], 3);
  }
  // hearts and pixels out of a screen (the lead's, or, deep in a build, anyone's)
  pour(st, n, speed, hearts = false) {
    const root = this.ctx.root;
    for (let k = 0; k < n; k++) {
      const others = st.build > 0.6 && R() < st.build - 0.5, sc = others ? this.lit[(R() * this.lit.length) | 0] : this.hero.screens[0];
      if (!sc) return;
      sc.mesh.getWorldPosition(this._v); root.worldToLocal(this._v); sc.mesh.getWorldDirection(this._w); this._w.transformDirection(this._m.copy(root.matrixWorld).invert());
      const heart = hearts || R() < 0.45, col = heart ? (R() < 0.7 ? CANDY[0] : CANDY[5]) : PIX[(R() * PIX.length) | 0], s = speed * rr(0.6, 1.2);
      const i = this.solid.add(this._v.x + rr(-0.06, 0.06), this._v.y + rr(-0.05, 0.05), this._v.z + rr(-0.06, 0.06),
        (this._w.x + rr(-0.45, 0.45)) * s, (this._w.y + rr(0.2, 0.9)) * s, (this._w.z + rr(-0.45, 0.45)) * s, rr(2.2, 4), heart ? rr(0.022, 0.04) : rr(0.012, 0.024), heart ? SP.HEART : SP.PIXEL, col[0], col[1], col[2]);
      if (i < 0) return;
      const P = this.solid; P.grav[i] = 3.2; P.drag[i] = 0.7; P.bounce[i] = 0.35; P.emit[i] = heart ? 1.4 : 1.8; P.spinV[i] = rr(-4, 4); if (!heart) P.flipV[i] = rr(-8, 8);
    }
  }
  sparks(at, n, speed) {
    n = Math.round(n * this.qk);
    for (let k = 0; k < n; k++) {
      const a = R() * 6.283, up = rr(0.4, 1), s = speed * rr(0.4, 1.1), hot = R();
      const i = this.glow.add(at.x + rr(-0.12, 0.12), at.y, at.z + rr(-0.03, 0.03), Math.cos(a) * s * (1 - up * 0.6), up * s, Math.sin(a) * s * (1 - up * 0.6), rr(0.25, 0.8), rr(0.006, 0.012), SP.SPARK, 1, 0.75 + 0.25 * hot, 0.45 + 0.4 * hot);
      if (i < 0) return;
      const P = this.glow; P.grav[i] = 9.8; P.drag[i] = 1.2; P.bounce[i] = 0.4; P.emit[i] = 5; P.streak[i] = 0.035;
    }
    const i = this.soft.add(at.x, at.y + 0.03, at.z, 0, 0.12, 0, 1.6, 0.08, SP.SMOKE, 0.4, 0.4, 0.42, 0.35); if (i >= 0) { this.soft.drag[i] = 1; this.soft.grow[i] = 0.15; }
  }
  // static crawling over a tube's glass
  crackle(sc, n) {
    if (!sc) return;
    const root = this.ctx.root;
    for (let k = 0; k < n; k++) {
      this._v.set((R() - 0.5) * sc.w * 0.9, (R() - 0.5) * sc.h * 0.9, 0.012); sc.mesh.localToWorld(this._v); root.worldToLocal(this._v);
      const i = this.glow.add(this._v.x, this._v.y, this._v.z, rr(-0.3, 0.3), rr(-0.3, 0.3), rr(-0.05, 0.1), rr(0.05, 0.16), rr(0.006, 0.016), R() < 0.6 ? SP.SPARK : SP.STAR, 0.7, 0.85, 1);
      if (i < 0) return; this.glow.emit[i] = 2.5; this.glow.spinV[i] = rr(-20, 20);
    }
  }
  // the drop: everything bursts out from the deck
  burst(st, e) {
    const CX = this.ctx.CX, F = this.FLOOR;
    for (let i = 0; i < this.glow.count; i++) if (this.glow.kind[i] === K.DUST) {         // the dust is blown outward
      const i3 = i * 3, dx = this.glow.p[i3] - CX, dz = this.glow.p[i3 + 2], d = Math.hypot(dx, dz) + 0.2;
      this.glow.v[i3] += dx / d * (st.reduce ? 0.3 : 2.5); this.glow.v[i3 + 1] += st.reduce ? 0.1 : 1.2; this.glow.v[i3 + 2] += dz / d * (st.reduce ? 0.3 : 2.5); this.glow.emit[i] = st.reduce ? 0 : 0.4;
    }
    const n = Math.round((st.reduce ? 40 : 420) * this.qk * Math.min(1, 0.3 + e.k));
    for (let k = 0; k < n; k++) {
      const a = R() * 6.283, el = rr(0.15, 1.2), s = st.reduce ? rr(0.4, 1.2) : rr(2, 7.5), r = R();
      const spr = r < 0.45 ? (R() < 0.5 ? SP.RECT : SP.DISC) : r < 0.6 ? SP.HEART : r < 0.75 ? SP.PIXEL : r < 0.85 ? SP.STAR : r < 0.92 ? SP.CD : SP.FACE;
      const col = spr === SP.CD || spr === SP.FACE ? [1, 1, 1] : CANDY[(R() * CANDY.length) | 0];
      const P = spr === SP.STAR ? this.glow : this.solid;
      const i = P.add(CX + Math.cos(a) * 0.15, F + 0.1, Math.sin(a) * 0.15, Math.cos(a) * Math.cos(el) * s, Math.sin(el) * s, Math.sin(a) * Math.cos(el) * s, rr(1.6, 3.4),
        spr === SP.CD ? 0.09 : spr === SP.FACE ? 0.08 : spr === SP.STAR ? rr(0.03, 0.07) : rr(0.02, 0.045), spr, col[0], col[1], col[2]);
      if (i < 0) break;
      P.grav[i] = 2; P.drag[i] = 1.6; P.spinV[i] = rr(-6, 6); P.flipV[i] = spr === SP.STAR ? 0 : rr(-14, 14); P.emit[i] = spr === SP.STAR ? 4 : 0.5; P.streak[i] = spr === SP.STAR ? 0.02 : 0;
    }
  }

  // ---------------- the flights: the stock-wallpaper sky rushing past ----------------
  flight(dt, fx, st) {
    const CX = this.ctx.CX, F = this.FLOOR, at = st.beat, ph = at - Math.floor(at), be = Math.exp(-ph * 5) * fx.alive;
    const L = st.lift * st.env.y2k; this.flyV = (0.55 + 2.4 * be) * L * 6.3;              // the same surge as the speed lines (index.js fly())
    const night = st.song != null && st.song > 126;                                      // drop 2: the skies go to space and dusk
    this.flyAcc = (this.flyAcc || 0) + dt * (st.reduce ? 18 : 55 + 50 * be) * L * this.qk;
    const n = Math.floor(this.flyAcc); this.flyAcc -= n;
    for (let k = 0; k < n; k++) {
      const a = R() * 6.283, r = 0.7 + Math.pow(R(), 0.6) * 3.2, x = CX + Math.cos(a) * r * 1.3, y = F + 0.3 + Math.sin(a) * r * 0.8, z = st.eye.z - rr(11, 15);
      const u = R();
      let spr, size, col = [1, 1, 1], P = this.solid;
      if (u < 0.34) { spr = R() < 0.6 ? SP.RECT : SP.DISC; size = rr(0.05, 0.1); col = CANDY[(R() * CANDY.length) | 0]; }
      else if (u < 0.46) { spr = SP.STREAMER; size = rr(0.07, 0.12); col = CANDY[(R() * CANDY.length) | 0]; }
      else if (u < 0.56) { spr = SP.CD; size = rr(0.16, 0.24); }
      else if (u < 0.64) { spr = SP.FLOPPY; size = rr(0.13, 0.18); col = CANDY[(R() * 5) | 0]; }
      else if (u < 0.72) { spr = SP.CURSOR; size = rr(0.12, 0.22); }
      else if (u < 0.77) { spr = SP.HOURGLASS; size = rr(0.12, 0.2); }
      else if (u < 0.86) { spr = [SP.FOLDER, SP.MYCOMP, SP.WINDOW, SP.MAIL][(R() * 4) | 0]; size = rr(0.14, 0.24); }
      else if (u < 0.92) { spr = SP.HEART; size = rr(0.07, 0.13); col = CANDY[0]; }
      else if (u < 0.95) { spr = SP.FACE; size = rr(0.16, 0.26); }
      else { spr = SP.STAR; size = rr(0.06, 0.14); P = this.glow; col = night ? [0.8, 0.85, 1] : [1, 0.95, 0.8]; }
      const i = P.add(x, y, z, rr(-0.3, 0.3), rr(-0.2, 0.2), 0, 20, size, spr, col[0], col[1], col[2]);
      if (i < 0) break;
      P.kind[i] = K.STREAM; P.spinV[i] = rr(-3, 3) * (spr === SP.STREAMER ? 0.3 : 1); P.flipV[i] = spr === SP.CURSOR || spr === SP.HOURGLASS ? rr(-2, 2) : rr(-7, 7);
      if (spr === SP.STREAMER) { P.streak[i] = 0.12; P.flipV[i] = rr(-3, 3); P.spinV[i] = 0; }
      if (spr === SP.STAR) { P.emit[i] = 3; P.streak[i] = 0.03; P.flipV[i] = 0; }
      if (spr === SP.CD || spr === SP.HEART) P.emit[i] = 0.25;
    }
    // clouds: soft banks drifting by, and now and then one straight through the lens
    this.cloudAcc = (this.cloudAcc || 0) + dt * 1.1 * L;
    if (this.cloudAcc > 1) {
      this.cloudAcc -= 1;
      const through = R() < 0.22, a = R() * 6.283, r = through ? rr(0, 0.25) : rr(1.4, 4), z = st.eye.z - 15;
      const x = through ? st.eye.x + Math.cos(a) * r : CX + Math.cos(a) * r * 1.4, y = through ? st.eye.y + Math.sin(a) * r : F + 0.4 + Math.sin(a) * r * 0.7;
      const tint = night ? [0.75, 0.62, 0.85] : [1, 1, 1];
      for (let k = 0; k < 5; k++) {
        const i = this.soft.add(x + rr(-0.6, 0.6), y + rr(-0.3, 0.3), z + rr(-0.8, 0.8), 0, 0, 0, 30, rr(1.2, 2.6), SP.CLOUD, tint[0], tint[1], tint[2], rr(0.5, 0.8));
        if (i < 0) break; this.soft.kind[i] = K.STREAM; this.soft.tag[i] = through ? 4 : 0; this.soft.spinV[i] = rr(-0.2, 0.2);
      }
    }
    // a cloud reaching the lens leaves it wet
    for (let i = 0; i < this.soft.count; i++) if (this.soft.tag[i] === 4 && this.soft.p[i * 3 + 2] > st.eye.z - 0.6) { this.soft.tag[i] = 0; this.wet(st); }
  }
  wet(st) {
    if (this.wetT && this.t - this.wetT < 0.8) return; this.wetT = this.t;
    const n = Math.round((st.reduce ? 8 : 22) * this.qk);
    for (let k = 0; k < n; k++) {
      const i = this.soft.add(rr(-0.95, 0.95), rr(-0.9, 0.95), 0, 0, -rr(0, 0.04), 0, rr(1.6, 3.5), rr(0.015, 0.06), SP.DROP, 1, 1, 1, rr(0.6, 1));
      if (i < 0) return; this.soft.kind[i] = K.LENS; this.soft.emit[i] = 0.15;
    }
  }
  confettiPuff(st, n) {
    const CX = this.ctx.CX, F = this.FLOOR;
    for (let k = 0; k < n * this.qk; k++) {
      const a = R() * 6.283, s = rr(1.5, 3.5), col = CANDY[(R() * CANDY.length) | 0];
      const i = this.solid.add(CX + Math.cos(a) * 0.3, F + 0.2, Math.sin(a) * 0.3, Math.cos(a) * s, rr(0.5, 2.5), Math.sin(a) * s, rr(1.5, 2.5), rr(0.025, 0.045), R() < 0.6 ? SP.RECT : SP.DISC, col[0], col[1], col[2]);
      if (i < 0) return; this.solid.kind[i] = K.STREAM; this.solid.drag[i] = 1.5; this.solid.spinV[i] = rr(-6, 6); this.solid.flipV[i] = rr(-12, 12);
    }
  }

  // ---------------- the white: her colours fired on the two big hits ----------------
  cannons(st, i0) {
    if (st.reduce) return;
    const CX = this.ctx.CX, E = st.eye, D = this._v.set(CX, 0, 0).sub(E).setY(0).normalize(), Rt = this._w.set(-D.z, 0, D.x);
    const n = Math.round(170 * this.qk);
    for (const side of [-1, 1]) {
      const ox = CX + Rt.x * side * 1.5 + D.x * 0.4, oz = Rt.z * side * 1.5 + D.z * 0.4, oy = this.FLOOR - 0.1;
      for (let k = 0; k < n; k++) {
        const s = rr(3.5, 7.5), spread = rr(-0.5, 0.5), col = TYPE[(R() * TYPE.length) | 0];
        const vx = -Rt.x * side * s * rr(0.25, 0.6) + D.x * spread * s * 0.5 + rr(-0.6, 0.6), vz = -Rt.z * side * s * rr(0.25, 0.6) + D.z * spread * s * 0.5 + rr(-0.6, 0.6);
        const i = this.solid.add(ox, oy, oz, vx, s * rr(0.7, 1.1), vz, rr(7, 11), rr(0.03, 0.06), R() < 0.7 ? SP.RECT : SP.DISC, col[0], col[1], col[2]);
        if (i < 0) return;
        const P = this.solid; P.grav[i] = 1.6; P.drag[i] = rr(1.6, 2.4); P.spinV[i] = rr(-5, 5); P.flipV[i] = rr(-11, 11); P.wind[i] = 0.15;
      }
    }
  }
  // flashing off: the white still gets its confetti, only it falls gently from above instead of being fired
  drizzle(dt, st) {
    this.drAcc = (this.drAcc || 0) + dt * 14 * this.qk; const n = Math.floor(this.drAcc); this.drAcc -= n;
    const CX = this.ctx.CX;
    for (let k = 0; k < n; k++) {
      const col = TYPE[(R() * TYPE.length) | 0], i = this.solid.add(CX + rr(-2.2, 2.2), this.FLOOR + 2.4, rr(-1.6, 1.4), 0, -0.2, 0, 9, rr(0.022, 0.04), R() < 0.7 ? SP.RECT : SP.DISC, col[0], col[1], col[2]);
      if (i < 0) return; const P = this.solid; P.grav[i] = 1.2; P.drag[i] = 2.4; P.spinV[i] = rr(-3, 3); P.flipV[i] = rr(-7, 7);
    }
  }

  // ---------------- the hill: life in the afternoon, then the evening ----------------
  meadow(dt, fx, st, kicked, hatHit) {
    const c = this.ctx, CX = c.CX, F = this.FLOOR, E = st.eye, day = st.day, dusk = ss(0.75, 1.2, day), qk = this.qk;
    const h = this.hill ||= { seeds: 0, bub: 0 };
    const count = (P, tag, kind) => { let n = 0; for (let i = 0; i < P.count; i++) if (P.tag[i] === tag && (kind === undefined || P.kind[i] === kind)) n++; return n; };
    // pollen in the sunlight, thick near the lens so it reads at any distance
    { const want = Math.round(260 * qk * (1 - 0.6 * dusk)), have = count(this.glow, 2, K.DUST);
      for (let k = 0; k < Math.min(20, want - have); k++) {
        const near = R() < 0.6, x = near ? E.x + rr(-1.5, 1.5) : CX + rr(-3, 3), z = near ? E.z - rr(0.3, 2.6) : rr(-3, 1.5);
        const i = this.glow.add(x, F + rr(0.05, 1.4), z, 0, 0, 0, rr(8, 20), rr(0.0025, 0.006), SP.DOT, 1, 0.92, 0.7, rr(0.4, 0.9));
        if (i < 0) break; this.glow.kind[i] = K.DUST; this.glow.tag[i] = 2; this.glow.drag[i] = 1.2; this.glow.wind[i] = 0.25;
      } }
    // dandelion seeds on the wind, crossing the frame
    h.seeds += dt * (st.reduce ? 2 : 3.5) * qk * (1 - dusk);
    while (h.seeds > 1) {
      h.seeds--;
      const i = this.soft.add(CX - rr(3, 4.5), F + rr(0.1, 1.6), rr(-2.5, E.z - 0.4), rr(0.2, 0.5), rr(-0.02, 0.08), rr(-0.1, 0.05), rr(10, 16), rr(0.03, 0.05), SP.SEED, 1, 1, 0.97, 0.95);
      if (i < 0) break; const P = this.soft; P.tag[i] = 2; P.drag[i] = 0.6; P.wind[i] = 1; P.grav[i] = 0.01; P.spin[i] = rr(-0.3, 0.3); P.spinV[i] = rr(-0.3, 0.3);
    }
    // bubbles: the speakers blow them on the kick; a big hit pops the old ones
    if (kicked && !st.reduce) for (const o of this.speakers) {
      const s = o.size / 0.3; this._v.set(0, 0.108 * s, 0.13 * s).applyMatrix4(o.g.matrix); this._w.set(0, 0, 1).transformDirection(o.g.matrix);
      for (let k = 0; k < Math.round(2 * qk + R()); k++) {
        const i = this.soft.add(this._v.x, this._v.y, this._v.z, this._w.x * rr(0.2, 0.5), rr(0.05, 0.25), this._w.z * rr(0.2, 0.5), rr(4, 8), rr(0.025, 0.06), SP.BUBBLE, 1, 1, 1, 0.9);
        if (i < 0) break; const P = this.soft; P.tag[i] = 2; P.drag[i] = 0.8; P.grav[i] = -0.04; P.wind[i] = 0.5; P.emit[i] = 0.3; P.spinV[i] = rr(-0.5, 0.5);
      }
    }
    // butterflies, landing on the machines; their wings beat with the hi-hat
    const nFly = Math.round(7 * Math.max(0.5, qk));
    if (!this.flies.length && dusk < 0.5) this.tops = this.machineTops();
    while (this.flies.length < nFly && dusk < 0.5) {
      const i = this.solid.add(CX + rr(-2, 2), F + rr(0.3, 1), rr(-1.5, 1), 0, 0, 0, 1e9, rr(0.035, 0.05), SP.FLY, ...WINGS[this.flies.length % WINGS.length]);
      if (i < 0) break; this.solid.kind[i] = K.HAND; this.solid.tag[i] = 2;
      const P = this.solid, b = { P, i: -1, ph: R() * 6, sit: 0, to: null, id: this.solid.seed[i] }; this.flies.push(b); P.emit[i] = 0.1; this.solid.tag[i] = 5;
    }
    this.flyFlies(dt, fx, st, hatHit, dusk);
    // a flock crossing, twice
    if (!this.birds.length && (this.flockN || 0) < 2 && st.actT > 4 + 10 * (this.flockN || 0)) this.flock(st);
    this.flyBirds(dt, st);
    // fireflies come out as it gets dark, and fall into step with the beat
    { const want = Math.round(160 * qk * dusk), have = count(this.glow, 2, K.HAND);
      for (let k = 0; k < Math.min(10, want - have); k++) {
        const a = R() * 6.283, r = 0.8 + Math.pow(R(), 0.7) * 6;
        const i = this.glow.add(CX + Math.cos(a) * r, F + rr(0.04, 0.7), Math.sin(a) * r * 0.8, 0, 0, 0, 1e9, rr(0.012, 0.022), SP.DOT, 0.75, 1, 0.25);
        if (i < 0) break; this.glow.kind[i] = K.HAND; this.glow.tag[i] = 2; this.glow.emit[i] = 4; this.glow.flip[i] = 1;
      }
      const sync = ss(1.05, 1.5, day), beat = st.beat * Math.PI;
      for (let i = 0; i < this.glow.count; i++) if (this.glow.tag[i] === 2 && this.glow.kind[i] === K.HAND) {
        const P = this.glow, i3 = i * 3, s = P.seed[i] * 50, t = this.t;
        P.p[i3] += Math.sin(t * 0.5 + s) * 0.08 * dt; P.p[i3 + 1] += Math.sin(t * 0.7 + s * 1.3) * 0.05 * dt; P.p[i3 + 2] += Math.cos(t * 0.45 + s * 0.7) * 0.08 * dt;
        const own = t * (1.6 + P.seed[i]) + s, phase = own + (beat * 2 - own) * sync * (st.reduce ? 0.5 : 1);
        const blink = Math.pow(Math.max(0, Math.sin(phase)), 6);
        P.col[i * 4 + 3] = (0.08 + 0.92 * blink) * dusk;
      }
    }
  }
  // the tops of the machines, where a butterfly can sit (the room's coordinates)
  machineTops() {
    const b = new THREE.Box3(), root = this.ctx.root, out = [];
    for (const o of this.ctx.things) {
      if (o.kind === 'keyboard' || o.kind === 'phone' || o.kind === 'ipod') continue;
      // the room is turned (its up is the world's +z), so the box's top is its largest z
      b.setFromObject(o.g); const c = b.getCenter(new THREE.Vector3()); c.z = b.max.z; root.worldToLocal(c);
      out.push(c);
    }
    return out;
  }
  flyFlies(dt, fx, st, hatHit, dusk) {
    const P = this.solid, F = this.FLOOR, CX = this.ctx.CX;
    for (const b of this.flies) {
      let i = -1; for (let k = 0; k < P.count; k++) if (P.tag[k] === 5 && P.seed[k] === b.id) { i = k; break; }
      if (i < 0) continue;
      const i3 = i * 3, p = this._v.set(P.p[i3], P.p[i3 + 1], P.p[i3 + 2]);
      if (dusk > 0.5 && !b.leaving) { b.leaving = true; b.sit = 0; b.to = new THREE.Vector3(CX + rr(-6, 6), F + 2.5, -6); }
      if (b.sit > 0) {                                                // sitting: wings slowly open and close
        b.sit -= dt; b.ph += dt * 2.2;
        P.flip[i] = 0.25 + 0.75 * Math.abs(Math.cos(b.ph)) * (1 - 0.6 * fx.hat);
        if (b.sit <= 0) b.to = null;
        continue;
      }
      if (!b.to) { const tops = this.tops || []; b.to = R() < 0.65 && tops.length ? tops[(R() * tops.length) | 0].clone().add(this._w.set(rr(-0.05, 0.05), 0.004, rr(-0.04, 0.04))) : new THREE.Vector3(CX + rr(-2.2, 2.2), F + rr(0.3, 1.2), rr(-1.8, 1.2)); b.land = b.to.y < F + 1.25 && R() < 0.8; }
      const d = this._w.copy(b.to).sub(p), dist = d.length();
      if (dist < 0.025 && b.land && !b.leaving) { b.sit = rr(2, 6); P.p[i3] = b.to.x; P.p[i3 + 1] = b.to.y; P.p[i3 + 2] = b.to.z; continue; }
      if (dist < 0.05) { b.to = null; continue; }
      // a butterfly's flight: toward where it is going, in loops and drops, quicker on each beat of the hat
      b.ph += dt * (14 + 8 * fx.energy) + (hatHit ? 1.4 : 0);
      const sp = Math.min(0.55, dist * 1.5 + 0.12), wob = 0.35;
      P.p[i3] += (d.x / dist * sp + Math.sin(b.ph * 0.37 + b.id * 9) * wob) * dt;
      P.p[i3 + 1] += (d.y / dist * sp + Math.sin(b.ph * 0.5) * 0.3) * dt;
      P.p[i3 + 2] += (d.z / dist * sp + Math.cos(b.ph * 0.29 + b.id * 5) * wob) * dt;
      P.flip[i] = 0.12 + 0.88 * Math.abs(Math.cos(b.ph)) * (1 - 0.7 * fx.hat);
      P.spin[i] = Math.sin(b.ph * 0.21) * 0.35;
    }
  }
  flock(st) {
    const P = this.solid, E = st.eye, n = 9;
    const dir = (this.flockN || 0) % 2 ? -1 : 1, z = E.z - rr(32, 48), y = E.y + rr(3, 6);
    this.birdsGo = { x: E.x - dir * 30, z, y, dir, v: rr(4, 5.5) };
    for (let k = 0; k < n; k++) {
      const i = P.add(0, 0, 0, 0, 0, 0, 1e9, rr(0.45, 0.6), SP.BIRD_UP, 0.06, 0.06, 0.07);
      if (i < 0) return; P.kind[i] = K.HAND; P.tag[i] = 6; P.flip[i] = 1;
      const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
      this.birds.push({ i: P.seed[i], dx: -dir * row * 1.1, dz: side * row * 0.9, dy: rr(-0.2, 0.2) + row * 0.08, ph: R() * 6 });
    }
  }
  flyBirds(dt, st) {
    if (!this.birds.length) return;
    const P = this.solid, g = this.birdsGo; g.x += g.dir * g.v * dt;
    for (const b of this.birds) {
      let i = -1; for (let k = 0; k < P.count; k++) if (P.tag[k] === 6 && P.seed[k] === b.i) { i = k; break; }
      if (i < 0) continue;
      b.ph += dt * 7;
      const i3 = i * 3; P.p[i3] = g.x + b.dx; P.p[i3 + 1] = g.y + b.dy + Math.sin(b.ph * 0.2) * 0.2; P.p[i3 + 2] = g.z + b.dz;
      P.sprite[i] = Math.sin(b.ph) > 0 ? SP.BIRD_UP : SP.BIRD_DN; P.spin[i] = 0;
    }
    if (g.dir * (g.x - st.eye.x) > 36) {                         // gone over the hill: let them go, the next flock comes later
      for (let k = 0; k < P.count; k++) if (P.tag[k] === 6) P.life[k] = P.age[k] + 0.3;
      this.birds.length = 0; this.flockN = (this.flockN || 0) + 1;
    }
  }
  popBubbles(st) {
    const P = this.soft;
    for (let i = 0; i < P.count; i++) if (P.sprite[i] === SP.BUBBLE && P.age[i] > 1.2) {
      const i3 = i * 3;
      for (let k = 0; k < 4; k++) { const j = this.glow.add(P.p[i3], P.p[i3 + 1], P.p[i3 + 2], rr(-0.4, 0.4), rr(-0.4, 0.4), rr(-0.4, 0.4), 0.25, 0.008, SP.STAR, 1, 1, 1); if (j >= 0) { this.glow.emit[j] = 1.5; this.glow.drag[j] = 4; } }
      P.life[i] = P.age[i] + 0.02;
    }
  }
}
