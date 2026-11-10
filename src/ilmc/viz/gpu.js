// The visualisers, drawn on the GPU once a frame into their own small pictures (render targets with mipmaps), which
// the screens then show like any other picture. Drawing each one once, at its own resolution, and letting the screen
// sample it through mipmaps is what keeps a 40 px-wide LED analyser from aliasing and crawling as the camera moves.
//   analyzer  31-band LED spectrum analyser, peak caps that fall under gravity
//   scope     a triggered oscilloscope trace on a green P31 tube, with phosphor persistence
//   vector    an X-Y goniometer (mid up, side across), amber, with persistence
//   waterfall a scrolling spectrogram (time leftward, pitch up), Cool Edit's spectral colours
//   milk      a MilkDrop-style feedback warp: last frame zoomed, swirled and hue-shifted, the wave drawn back in
//   meters    a pair of VU meters with real ballistics and peak LEDs, PPM ladders under them
//   player    the Winamp 2 main window and playlist, its spectrum live
//   steps     the FL Studio step sequencer, this bar's pattern read from the song map, the playhead on the sixteenth
// Everything is fed from the room's live analysis (fx.spec, fx.wavL/R, fx.kick...) and the song clock.
import * as THREE from 'three';
import * as C from './chrome.js';
import { ERA, G } from './era.js';

export const KEYS = ['analyzer', 'scope', 'vector', 'waterfall', 'milk', 'meters', 'player', 'steps'];   // and the period software in era.js
const HIST = 256, HIST_HZ = 40;     // spectrogram rows kept, and written per second
// each picture is laid out on a 384 x 288 grid and drawn at 512 x 384, so it stays crisp when a screen flies past the lens
const RW = 512, RH = 384, MS = 320;

const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = `precision highp float;
uniform sampler2D uData; uniform float uTime, uBeat, uKick, uLow, uMid, uHigh, uAlive, uCalm, uDt;
varying vec2 vUv;
float specB(float b) { return texelFetch(uData, ivec2(int(clamp(b, 0.0, 127.0)), 2), 0).r; }
float peakB(float b) { return texelFetch(uData, ivec2(int(clamp(b, 0.0, 127.0)), 3), 0).r; }
// an antialiased rectangle in some pixel space (x, y, w, h)
float rect(vec2 p, vec4 r) { vec2 d = min(p - r.xy, r.xy + r.zw - p); vec2 w = fwidth(p) * 0.5 + 1e-4; return clamp(min(d.x / w.x, d.y / w.y) + 0.5, 0.0, 1.0); }
`;
const pass = (frag, uniforms, opts = {}) => new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: HEAD + frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...opts });

const ANALYZER = `uniform sampler2D uChrome;
void main() {
  vec3 c = vec3(0.010, 0.011, 0.012);
  vec2 a = (vUv - vec2(0.085, 0.14)) / vec2(0.895, 0.78);
  if (a.x >= 0.0 && a.x < 1.0 && a.y >= 0.0 && a.y < 1.0) {
    const float N = 31.0, S = 18.0;
    float bi = floor(a.x * N), si = floor(a.y * S);
    vec2 f = vec2(fract(a.x * N), fract(a.y * S));
    float v = 0.0, cap = 0.0, b0 = 4.0 + bi * 4.0;                     // four of the 128 log bands to a bar: 1/3 octave
    for (int k = 0; k < 4; k++) { v = max(v, specB(b0 + float(k))); cap = max(cap, peakB(b0 + float(k))); }
    float lvl = (si + 0.5) / S;
    vec3 led = lvl < 0.62 ? vec3(0.12, 1.0, 0.22) : lvl < 0.84 ? vec3(1.0, 0.78, 0.06) : vec3(1.0, 0.1, 0.08);
    float on = step(lvl, v), pk = step(abs(si - floor(cap * S - 0.001)), 0.5) * step(0.03, cap);
    float cell = rect(f * vec2(10.0, 10.0), vec4(1.4, 1.6, 7.2, 6.8));
    c += led * cell * (0.045 + 0.955 * max(on, pk));                   // the unlit segments stay faintly visible
  }
  vec4 ch = texture(uChrome, vUv); c = mix(c, ch.rgb, ch.a);
  gl_FragColor = vec4(c, 1.0);
}`;

// the phosphor buffers: last frame faded, then the beam drawn in (additive)
const FADE = `uniform sampler2D uPrev; uniform float uDecay;
void main() { gl_FragColor = vec4(max(texture(uPrev, vUv).rgb * uDecay - 0.0015, 0.0), 1.0); }`;
const BEAM_VS = `attribute float aI; attribute vec2 aC;
uniform sampler2D uData; uniform int uKind; uniform float uN, uGain, uW, uTrig, uAsp, uRot, uR0;
varying float vS, vI;
float L(float i) { return texelFetch(uData, ivec2(int(clamp(i, 0.0, 511.0)), 0), 0).r; }
float R(float i) { return texelFetch(uData, ivec2(int(clamp(i, 0.0, 511.0)), 1), 0).r; }
vec2 P(float i) {
  if (uKind == 0) return vec2(-0.96 + 1.92 * i / (uN - 1.0), clamp(texelFetch(uData, ivec2(int(clamp(uTrig + i, 0.0, 511.0)), 4), 0).r * uGain, -0.96, 0.96));
  if (uKind == 1) { vec2 v = clamp(vec2(R(i) - L(i), L(i) + R(i)) * 0.7071 * uGain, -0.95, 0.95); return vec2(v.x / uAsp, v.y); }
  float a = i / (uN - 1.0) * 6.28318 + uRot, r = uR0 + 0.32 * (L(i) + R(i)) * 0.5 * uGain;
  return vec2(cos(a) / uAsp, sin(a)) * r;
}
void main() {
  if (aI >= uN - 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 p0 = P(aI), p1 = P(aI + 1.0), d = (p1 - p0) * vec2(uAsp, 1.0);
  float len = length(d); vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0), n = vec2(-dir.y, dir.x);
  vec2 off = (n * aC.y + dir * (aC.x * 2.0 - 1.0)) * uW; off.x /= uAsp;
  vS = aC.y; vI = clamp(uW * 1.5 / (len + uW * 1.5), 0.05, 1.0);    // a fast beam is a dim beam
  gl_Position = vec4(mix(p0, p1, aC.x) + off, 0.0, 1.0);
}`;
const BEAM_FS = `precision highp float; uniform vec3 uColor; uniform float uAmp; varying float vS, vI;
void main() { gl_FragColor = vec4(uColor * exp(-vS * vS * 3.5) * vI * uAmp, 1.0); }`;

// the tube faces over the phosphor: graticules, the trace's glow in the glass
const SCOPE = `uniform sampler2D uPh, uChrome;
void main() {
  vec3 tr = texture(uPh, vUv).rgb + texture(uPh, vUv, 2.5).rgb * 0.7;
  vec2 g = vUv * vec2(10.0, 8.0), d = abs(fract(g + 0.5) - 0.5) / fwidth(g);
  float grid = 1.0 - min(min(d.x, d.y), 1.0);
  vec2 cc = abs(vUv - 0.5) * vec2(10.0, 8.0), m = vUv * vec2(50.0, 40.0), t5 = abs(fract(m + 0.5) - 0.5) / fwidth(m);
  float ticks = step(cc.y, 0.1) * (1.0 - min(t5.x, 1.0)) + step(cc.x, 0.1) * (1.0 - min(t5.y, 1.0));
  vec3 c = vec3(0.008, 0.016, 0.012) + vec3(0.13, 0.2, 0.17) * max(grid * 0.6, ticks * 0.8) + tr;
  vec4 ch = texture(uChrome, vUv); c = mix(c, ch.rgb, ch.a);
  gl_FragColor = vec4(c, 1.0);
}`;
const VECTOR = `uniform sampler2D uPh, uChrome;
void main() {
  vec3 tr = texture(uPh, vUv).rgb + texture(uPh, vUv, 2.5).rgb * 0.7;
  vec2 p = (vUv - 0.5) * vec2(4.0 / 3.0, 1.0) * 2.0; float r = length(p);
  float fr = fwidth(r), ring = 0.0;
  for (int i = 1; i <= 4; i++) ring = max(ring, 1.0 - min(abs(r - float(i) * 0.235) / fr, 1.0) * (i == 4 ? 1.0 : 1.0));
  vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.7071, fq = fwidth(q);                 // the L and R diagonals
  float axes = (1.0 - min(abs(p.x) / fwidth(p.x), 1.0)) + (1.0 - min(abs(p.y) / fwidth(p.y), 1.0)) * 0.6 + (1.0 - min(abs(q.x) / fq.x, 1.0)) * 0.6 + (1.0 - min(abs(q.y) / fq.y, 1.0)) * 0.6;
  float inside = step(r, 0.95);
  vec3 c = vec3(0.012, 0.01, 0.008) + vec3(0.2, 0.14, 0.08) * max(ring * 0.55, min(axes, 1.0) * 0.4 * inside) + tr;
  vec4 ch = texture(uChrome, vUv); c = mix(c, ch.rgb, ch.a);
  gl_FragColor = vec4(c, 1.0);
}`;
const WATERFALL = `uniform sampler2D uHist, uChrome; uniform float uHead;
vec3 cmap(float v) {
  vec3 c = mix(vec3(0.0, 0.0, 0.015), vec3(0.07, 0.02, 0.42), smoothstep(0.02, 0.25, v));
  c = mix(c, vec3(0.72, 0.04, 0.42), smoothstep(0.22, 0.45, v));
  c = mix(c, vec3(1.0, 0.32, 0.04), smoothstep(0.42, 0.64, v));
  c = mix(c, vec3(1.0, 0.86, 0.16), smoothstep(0.62, 0.84, v));
  return mix(c, vec3(1.0, 1.0, 0.9), smoothstep(0.86, 1.0, v));
}
void main() {
  vec3 c = vec3(0.0);
  vec2 a = (vUv - vec2(0.1, 0.1)) / vec2(0.88, 0.8);
  if (a.x >= 0.0 && a.x <= 1.0 && a.y >= 0.0 && a.y <= 1.0) {
    float row = uHead - 0.5 - (1.0 - a.x) * ${HIST - 8}.0;
    float v = texture(uHist, vec2((4.0 + a.y * 123.0 + 0.5) / 128.0, row / ${HIST}.0)).r;
    c = cmap(v);
  }
  vec4 ch = texture(uChrome, vUv); c = mix(c, ch.rgb, ch.a);
  gl_FragColor = vec4(c, 1.0);
}`;
const MILK = `uniform sampler2D uPrev; uniform float uZoom, uRot, uSwirl, uDecay, uHue;
vec3 hue(vec3 c, float a) { const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
void main() {
  vec2 c = vUv - 0.5; float r = length(c), a = uRot + uSwirl * r;
  vec2 w = mat2(cos(a), -sin(a), sin(a), cos(a)) * (c / uZoom);
  w += 0.003 * vec2(sin(uTime * 0.7 + c.y * 9.0), cos(uTime * 0.6 + c.x * 8.0));
  vec2 t = vec2(1.0 / ${MS}.0), u = w + 0.5;
  vec3 p = texture(uPrev, u).rgb * 0.76 + (texture(uPrev, u + vec2(t.x, 0.0)).rgb + texture(uPrev, u - vec2(t.x, 0.0)).rgb + texture(uPrev, u + vec2(0.0, t.y)).rgb + texture(uPrev, u - vec2(0.0, t.y)).rgb) * 0.06;
  p = max(hue(p, uHue) * uDecay - 0.0015, 0.0);
  gl_FragColor = vec4(p, 1.0);
}`;
const METERS = `uniform sampler2D uChrome; uniform vec4 uVU; uniform vec4 uPPM;
float seg(vec2 p, vec2 a, vec2 b, float w) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - w; }
void main() {
  vec2 p = vec2(vUv.x * 384.0, (1.0 - vUv.y) * 288.0);
  vec3 c = texture(uChrome, vUv).rgb;
  for (int i = 0; i < 2; i++) {
    float x0 = 12.0 + float(i) * 186.0, pos = i == 0 ? uVU.x : uVU.y, pk = i == 0 ? uVU.z : uVU.w;
    vec2 pv = vec2(x0 + 87.0, 196.0), tip = pv + vec2(sin(-0.5 + 1.0 * pos), -cos(-0.5 + 1.0 * pos)) * 164.0;
    float inFace = rect(p, vec4(x0 + 4.0, 20.0, 166.0, 140.0));
    float d = seg(p, pv, tip, 0.9), aa = fwidth(d);
    c = mix(c, c * 0.55, smoothstep(aa, -aa, seg(p - vec2(2.5, 2.0), pv, tip, 1.2)) * inFace);   // its shadow on the scale
    c = mix(c, vec3(0.04, 0.035, 0.03), smoothstep(aa, -aa, d) * inFace);
    float led = length(p - vec2(x0 + 154.0, 146.0));
    c = mix(c, mix(vec3(0.22, 0.03, 0.02), vec3(1.0, 0.16, 0.08), pk), smoothstep(5.0, 4.0, led));
    c += vec3(1.0, 0.2, 0.08) * pk * exp(-led * 0.18) * 0.5;
  }
  // the PPM ladders: L at y 196, R at y 226; 32 segments from x 44 to 372
  for (int i = 0; i < 2; i++) {
    float y0 = 200.0 + float(i) * 30.0, v = i == 0 ? uPPM.x : uPPM.y, hold = i == 0 ? uPPM.z : uPPM.w;
    float s = floor((p.x - 44.0) / 10.25), f = p.x - 44.0 - s * 10.25;
    if (s >= 0.0 && s < 32.0 && p.y >= y0 && p.y < y0 + 16.0) {
      float lvl = (s + 0.5) / 32.0;
      vec3 led = lvl < 0.75 ? vec3(0.15, 1.0, 0.3) : lvl < 0.9 ? vec3(1.0, 0.8, 0.1) : vec3(1.0, 0.15, 0.1);
      float on = max(step(lvl, v), step(abs(s - floor(hold * 32.0 - 0.001)), 0.5) * step(0.03, hold));
      c = mix(c, led * (0.06 + 0.94 * on), rect(vec2(f, p.y - y0), vec4(1.0, 1.0, 8.0, 14.0)));
    }
  }
  gl_FragColor = vec4(c, 1.0);
}`;
// Winamp: the chrome is a canvas (redrawn when the clock or the marquee steps); the visualiser is drawn here
const PLAYER = `uniform sampler2D uChrome;
void main() {
  vec2 p = vec2(vUv.x * 384.0, (1.0 - vUv.y) * 288.0);
  vec3 c = texture(uChrome, vUv).rgb;
  vec2 a = (p - vec2(24.0, 98.0)) / vec2(144.0, 52.0);                         // the vis box
  if (a.x >= 0.0 && a.x < 1.0 && a.y >= 0.0 && a.y < 1.0) {
    float bi = floor(a.x * 19.0), f = fract(a.x * 19.0), y = 1.0 - a.y, v = 0.0, cap = 0.0;
    for (int k = 0; k < 6; k++) { float b = 6.0 + bi * 6.4 + float(k); v = max(v, specB(b)); cap = max(cap, peakB(b)); }
    float rows = 16.0, ri = floor(y * rows);
    // Winamp's own vis colours: red at the top through yellow to green at the bottom; the peaks a pale grey
    vec3 col = mix(vec3(0.1, 0.72, 0.1), vec3(0.85, 0.85, 0.1), smoothstep(0.2, 0.6, y)); col = mix(col, vec3(0.95, 0.2, 0.1), smoothstep(0.65, 0.95, y));
    float inBar = step(f, 0.78), on = step((ri + 0.5) / rows, v) * inBar, pk = step(abs(ri - floor(cap * rows - 0.001)), 0.5) * inBar * step(0.04, cap);
    c = mix(c, col, on); c = mix(c, vec3(0.62, 0.64, 0.7), pk * (1.0 - on));
  }
  gl_FragColor = vec4(c, 1.0);
}`;
const STEPS = `uniform sampler2D uChrome; uniform float uStep; uniform float uPat[8];
void main() {
  vec2 p = vec2(vUv.x * 384.0, (1.0 - vUv.y) * 288.0);
  vec3 c = texture(uChrome, vUv).rgb;
  float k = floor(uStep), f = fract(uStep), si = floor((p.x - ${C.STEP_X}.0) / ${C.STEP_W.toFixed(2)}), sx = p.x - ${C.STEP_X}.0 - si * ${C.STEP_W.toFixed(2)};
  if (si >= 0.0 && si < 16.0) {
    // the step lights along the top: the one playing is lit
    float led = length(vec2(sx - ${C.STEP_W.toFixed(2)} * 0.5, p.y - ${C.LED_Y}.0));
    c = mix(c, si == k ? vec3(0.55, 1.0, 0.3) : vec3(0.1, 0.16, 0.1), smoothstep(3.6, 2.6, led));
    if (si == k) c += vec3(0.4, 1.0, 0.2) * exp(-led * 0.35) * 0.4;
    float ri = floor((p.y - ${C.ROW_Y}.0) / ${C.ROW_H}.0), ry = p.y - ${C.ROW_Y}.0 - ri * ${C.ROW_H}.0;
    if (ri >= 0.0 && ri < 8.0 && si == k) {
      float m = uPat[int(ri)], on = mod(floor(m / exp2(k)), 2.0);
      float btn = rect(vec2(sx, ry), vec4(2.0, 4.0, ${C.STEP_W.toFixed(2)} - 4.0, ${C.ROW_H}.0 - 8.0));
      c = mix(c, c * 1.25 + vec3(0.06), btn * 0.6);                           // the column under the playhead
      c = mix(c, vec3(1.0, 0.86, 0.6), btn * on * (0.35 + 0.65 * exp(-f * 2.5)));   // a lit step fires
    }
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export class Viz {
  constructor() {
    this.tick = 0; this.ran = -1; this.want = new Set();
    // the live data, read by texelFetch: rows wavL, wavR, spectrum (128), peak caps (128), wavL low-passed (the scope's)
    this.data = new THREE.DataTexture(new Float32Array(512 * 5), 512, 5, THREE.RedFormat, THREE.FloatType);
    this.data.minFilter = this.data.magFilter = THREE.NearestFilter; this.data.generateMipmaps = false;
    this.hist = new THREE.DataTexture(new Uint8Array(128 * HIST), 128, HIST, THREE.RedFormat, THREE.UnsignedByteType);
    this.hist.minFilter = this.hist.magFilter = THREE.LinearFilter; this.hist.wrapT = THREE.RepeatWrapping; this.hist.generateMipmaps = false;
    this.head = 0; this.hacc = 0;
    this.pk = new Float32Array(128); this.pv = new Float32Array(128); this.ph = new Float32Array(128);
    this.vu = [0, 0]; this.vv = [0, 0]; this.ppm = [0, 0]; this.hold = [0, 0]; this.holdT = [0, 0]; this.clip = [0, 0];
    this.u = { uData: { value: this.data }, uTime: { value: 0 }, uBeat: { value: 0 }, uKick: { value: 0 }, uLow: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uAlive: { value: 0 }, uCalm: { value: 0 }, uDt: { value: 1 / 60 } };
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    // the beam: 511 short quads, placed by the vertex shader from the waveform
    const n = 511, aI = new Float32Array(n * 4), aC = new Float32Array(n * 8), idx = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) { aI[i * 4 + k] = i; aC[(i * 4 + k) * 2] = k >> 1; aC[(i * 4 + k) * 2 + 1] = k & 1 ? 1 : -1; }
      const b = i * 4; idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3)); bg.setAttribute('aI', new THREE.BufferAttribute(aI, 1)); bg.setAttribute('aC', new THREE.BufferAttribute(aC, 2)); bg.setIndex(idx);
    const beam = () => {
      const m = new THREE.Mesh(bg, new THREE.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uData: this.u.uData, uKind: { value: 0 }, uN: { value: 256 }, uGain: { value: 1 }, uW: { value: 0.01 }, uTrig: { value: 0 }, uAsp: { value: 4 / 3 }, uRot: { value: 0 }, uR0: { value: 0.42 }, uColor: { value: new THREE.Color() }, uAmp: { value: 1 } } }));
      m.frustumCulled = false; m.renderOrder = 1; return m;
    };
    this.fade = new THREE.Mesh(this.quad.geometry, pass(FADE, { ...this.u, uPrev: { value: null }, uDecay: { value: 0.9 } }, { blending: THREE.NoBlending })); this.fade.frustumCulled = false;
    this.beams = [beam(), beam()];
    this.bscene = new THREE.Scene(); this.bscene.add(this.fade, ...this.beams);
    const rt = (w, h) => { const t = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }); t.texture.anisotropy = 4; return t; };
    const chrome = (w = RW, h = RH) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return { c, x: c.getContext('2d'), t, sig: null }; };
    const ch = this.ch = {};
    for (const k of KEYS) ch[k] = { rt: rt(k === 'milk' ? MS : RW, k === 'milk' ? MS : RH), chrome: k === 'milk' ? null : chrome() };
    for (const k of ['scope', 'vector', 'milk']) ch[k].ping = [ch[k].rt, rt(k === 'milk' ? MS : RW, k === 'milk' ? MS : RH)];
    const U = (k, extra = {}) => ({ ...this.u, uChrome: { value: ch[k].chrome?.t }, ...extra });
    ch.analyzer.mat = pass(ANALYZER, U('analyzer'));
    ch.scope.mat = pass(SCOPE, U('scope', { uPh: { value: null } }));
    ch.vector.mat = pass(VECTOR, U('vector', { uPh: { value: null } }));
    ch.waterfall.mat = pass(WATERFALL, U('waterfall', { uHist: { value: this.hist }, uHead: { value: 0 } }));
    ch.milk.mat = pass(MILK, { ...this.u, uPrev: { value: null }, uZoom: { value: 1 }, uRot: { value: 0 }, uSwirl: { value: 0 }, uDecay: { value: 0.96 }, uHue: { value: 0 } });
    ch.meters.mat = pass(METERS, U('meters', { uVU: { value: new THREE.Vector4() }, uPPM: { value: new THREE.Vector4() } }));
    ch.player.mat = pass(PLAYER, U('player'));
    ch.steps.mat = pass(STEPS, U('steps', { uStep: { value: 0 }, uPat: { value: new Array(8).fill(0) } }));
    // the scope and the vectorscope draw their face over a separate phosphor buffer; the output is its own target
    for (const k of ['scope', 'vector']) { ch[k].ph = ch[k].ping; ch[k].rt = rt(RW, RH); }
    this.pat = { bar: null, masks: new Array(8).fill(0) };
    // the period software (era.js): each its own picture, chrome canvas (if it paints one) and state
    for (const [k, P] of Object.entries(ERA)) {
      const c = ch[k] = { P, rt: rt(P.w || RW, P.h || RH), chrome: P.paint ? chrome() : null };
      c.mat = pass(G + P.frag, { ...this.u, uChrome: { value: c.chrome?.t || null }, ...(P.uniforms ? P.uniforms() : {}) });
      P.init?.call(P, this, c);
    }
  }
  tex(k) { return this.ch[k].rt.texture; }
  need(k) { this.want.add(k); }

  // every frame, on the CPU: the data texture, the falling peaks, the spectrogram row, the meter needles, the chrome
  feed(dt, fx, calm, trk) {
    this.tick++; this.dt = dt;
    const a = fx.alive || 0, d = this.data.image.data, u = this.u;
    u.uTime.value = fx.time; u.uBeat.value = fx.beat; u.uKick.value = fx.kick * a; u.uLow.value = (fx.low || 0) * a; u.uMid.value = (fx.mid || 0) * a; u.uHigh.value = (fx.high || 0) * a;
    u.uAlive.value = a; u.uCalm.value = calm ? 1 : 0; u.uDt.value = dt;
    for (let i = 0; i < 512; i++) { d[i] = (fx.wavL ? fx.wavL[i] : 0) * a; d[512 + i] = (fx.wavR ? fx.wavR[i] : 0) * a; }
    for (let b = 0; b < 128; b++) {
      const v = (fx.spec ? fx.spec[b] : 0) * a; d[1024 + b] = v;
      // peak caps: caught by the bar, held a moment, then they fall and speed up as they go
      if (v >= this.pk[b]) { this.pk[b] = v; this.pv[b] = 0; this.ph[b] = 0.32; }
      else if (this.ph[b] > 0) this.ph[b] -= dt;
      else { this.pv[b] += 1.6 * dt; this.pk[b] = Math.max(v, this.pk[b] - this.pv[b] * dt); }
      d[1536 + b] = this.pk[b];
    }
    this.data.needsUpdate = true;
    // the scope's input through a gentle low-pass (two one-pole stages, about 1.5 kHz), as a scope on a mix bus shows it
    // with its bandwidth limit on; then trigger on a rising zero crossing so a steady note stands still
    let y1 = 0, y2 = 0; for (let i = 0; i < 512; i++) { y1 += (d[i] - y1) * 0.33; y2 += (y1 - y2) * 0.33; d[2048 + i] = y2; }
    let trig = 0; for (let i = 8; i < 190; i++) if (d[2048 + i - 1] < 0 && d[2048 + i] >= 0) { trig = i; break; }
    this.beams[0].material.uniforms.uTrig.value = trig;
    {
      this.hacc += dt; let wrote = false;
      while (this.hacc >= 1 / HIST_HZ) {
        this.hacc -= 1 / HIST_HZ; const h = this.hist.image.data, row = this.head * 128;
        for (let b = 0; b < 128; b++) h[row + b] = Math.min(255, d[1024 + b] * 290);
        this.head = (this.head + 1) % HIST; wrote = true;
      }
      if (wrote && (this.want.has('waterfall') || this.wantedLast?.has('waterfall'))) this.hist.needsUpdate = true;
      this.ch.waterfall.mat.uniforms.uHead.value = this.head + this.hacc * HIST_HZ;
    }
    // VU: needle position is linear in voltage, 0 VU at 71 % of the swing; a damped spring gives the 300 ms rise
    for (let c = 0; c < 2; c++) {
      let s = 0, p = 0; for (let i = 0; i < 512; i++) { const v = d[c * 512 + i]; s += v * v; p = Math.max(p, Math.abs(v)); }
      const rms = Math.sqrt(s / 512), target = Math.min(1.08, rms / 0.42 * 0.708), w = 13, z = 0.78;
      this.vv[c] += (w * w * (target - this.vu[c]) - 2 * z * w * this.vv[c]) * Math.min(dt, 0.05); this.vu[c] = Math.max(0, Math.min(1.1, this.vu[c] + this.vv[c] * Math.min(dt, 0.05)));
      this.clip[c] = this.vu[c] > 0.92 ? 1 : Math.max(0, this.clip[c] - dt * 3);
      const db = Math.max(0, Math.min(1, (20 * Math.log10(p + 1e-6) + 36) / 36));        // PPM: -36..0 dBFS
      this.ppm[c] = Math.max(db, this.ppm[c] - dt * 0.33);
      if (db >= this.hold[c]) { this.hold[c] = db; this.holdT[c] = 1.4; } else if ((this.holdT[c] -= dt) < 0) this.hold[c] = Math.max(this.ppm[c], this.hold[c] - dt * 0.5);
    }
    this.ch.meters.mat.uniforms.uVU.value.set(this.vu[0], this.vu[1], this.clip[0], this.clip[1]);
    this.ch.meters.mat.uniforms.uPPM.value.set(this.ppm[0], this.ppm[1], this.hold[0], this.hold[1]);
    // the step sequencer: the playhead on the song's sixteenth, this bar's pattern from the map
    const song = fx.song, t = fx.songT;
    if (song && t != null) {
      const m = song.m, b = (t - m.beat0) / m.beatLen, bar = Math.floor(b / 4);
      this.ch.steps.mat.uniforms.uStep.value = Math.max(0, (b * 4) - bar * 16);
      if (bar !== this.pat.bar) { this.pat = { bar, masks: C.pattern(song, bar) }; for (let i = 0; i < 8; i++) this.ch.steps.mat.uniforms.uPat.value[i] = this.pat.masks[i]; }
    }
    // the chrome canvases of the pictures someone is looking at
    for (const k of this.want) {
      const ch = this.ch[k], c = ch.chrome, P = ch.P;
      if (P) { fx.calm = calm; P.feed?.call(P, dt, fx, this, ch); }
      if (!c) continue;
      const sig = P ? P.sig(fx, this, ch) : C.sig(k, fx, this);
      if (sig !== c.sig) {
        c.sig = sig;
        if (P) { const x = c.x; x.save(); x.clearRect(0, 0, x.canvas.width, x.canvas.height); x.scale(x.canvas.width / 384, x.canvas.height / 288); P.paint.call(P, x, fx, this, ch, trk()); x.restore(); }
        else C.draw(k, c.x, fx, this, trk);
        c.t.needsUpdate = true;
      }
    }
  }

  // on the GPU, once per frame, only the pictures a visible screen (or the wall) is showing
  render(r) {
    if (this.ran === this.tick) return; this.ran = this.tick;
    if (!this.warmed) {                 // build every picture's shader in the background once, so none stalls the frame it first appears
      this.warmed = true; const sc = new THREE.Scene();
      for (const k in this.ch) { const m = this.ch[k].mat; if (m) { const q = new THREE.Mesh(this.quad.geometry, m); q.frustumCulled = false; sc.add(q); } }
      try { r.compileAsync(sc, this.cam); if (this.ch.pipes?.s) r.compileAsync(this.ch.pipes.s.sc, this.ch.pipes.s.cam); } catch { /* compiled on first use instead */ }
    }
    const prev = r.getRenderTarget(), dt = Math.min(0.05, this.dt || 1 / 60), k60 = dt * 60, calm = this.u.uCalm.value, u = this.u;
    const draw = (mat, target) => { this.quad.material = mat; r.setRenderTarget(target); r.render(this.scene, this.cam); };
    const phosphor = (ch, decay, setup) => {
      const [a, b] = ch.ph || ch.ping; this.fade.material.uniforms.uPrev.value = a.texture; this.fade.material.uniforms.uDecay.value = Math.pow(decay, k60);
      this.beams.forEach((m, i) => { m.visible = setup(m.material.uniforms, i) !== false; });
      r.setRenderTarget(b); r.render(this.bscene, this.cam);
      if (ch.ph) ch.ph.reverse(); else ch.ping.reverse();
      return b;
    };
    for (const k of this.want) {
      const ch = this.ch[k];
      if (k === 'scope') {
        const ph = phosphor(ch, 0.62, (U, i) => { if (i) return false; U.uKind.value = 0; U.uN.value = 320; U.uGain.value = 1.1; U.uW.value = 2.2 / 288; U.uAsp.value = 4 / 3; U.uColor.value.setRGB(0.32, 1.0, 0.5); U.uAmp.value = 1.15 * k60; });
        ch.mat.uniforms.uPh.value = ph.texture; draw(ch.mat, ch.rt);
      } else if (k === 'vector') {
        const ph = phosphor(ch, 0.72, (U, i) => { if (i) return false; U.uKind.value = 1; U.uN.value = 512; U.uGain.value = 0.85; U.uW.value = 2.0 / 288; U.uAsp.value = 4 / 3; U.uColor.value.setRGB(1.0, 0.62, 0.18); U.uAmp.value = 0.42 * k60; });
        ch.mat.uniforms.uPh.value = ph.texture; draw(ch.mat, ch.rt);
      } else if (k === 'milk') {
        // MilkDrop's loop: warp the last frame into the new one, then draw the waves into it
        const [a, b] = ch.ping, M = ch.mat.uniforms, push = (u.uKick.value * 0.045 + u.uLow.value * 0.012) * (1 - 0.75 * calm);
        M.uPrev.value = a.texture; M.uZoom.value = Math.pow(1.008 + push, k60); M.uRot.value = (0.003 + 0.006 * Math.sin(u.uTime.value * 0.17) + 0.008 * u.uMid.value) * k60;
        M.uSwirl.value = 0.05 * Math.sin(u.uTime.value * 0.11) * k60; M.uDecay.value = Math.pow(0.945, k60); M.uHue.value = (0.012 + 0.03 * u.uHigh.value) * k60;
        draw(ch.mat, b);
        this.fade.visible = false;
        const hue = (u.uTime.value * 0.07) % 1;
        this.beams.forEach((m, i) => {
          const U = m.material.uniforms; U.uKind.value = i ? 1 : 2; U.uN.value = 512; U.uAsp.value = 1; U.uW.value = (i ? 1.6 : 2.4) / 256;
          U.uGain.value = i ? 1.0 : 1.3; U.uRot.value = u.uTime.value * 0.4; U.uR0.value = 0.2 + 0.12 * u.uLow.value;
          U.uColor.value.setHSL((hue + (i ? 0.5 : 0)) % 1, 1, 0.55); U.uAmp.value = (i ? 0.16 : 0.3) * k60 * (0.4 + 0.6 * u.uAlive.value); m.visible = true;
        });
        r.setRenderTarget(b); r.render(this.bscene, this.cam);
        this.fade.visible = true; ch.ping.reverse(); ch.rt = b;
      } else if (ch.P?.render) ch.P.render(r, this, ch, draw);
      else draw(ch.mat, ch.rt);
    }
    r.setRenderTarget(prev);
    this.wantedLast = new Set(this.want); this.want.clear();
  }
}
