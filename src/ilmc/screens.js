// Every screen in the room. Content is either drawn in the shader (the :3 face, spectrum, tunnel, Y2K wallpaper,
// snow) or painted into a shared 2D atlas (BIOS, BSOD, system message, DAW, winamp, scope, the cover...).
// The shader then treats it like glass: CRT curvature, scanlines, phosphor mask, and a power-on collapse.
import * as THREE from 'three';
import { art } from './art.js';
import { systemMessage } from './win98.js';

export const MODE = { OFF: 0, FACE: 1, BARS: 2, BLISS: 3, TILE: 4, TUNNEL: 5, SNOW: 6, FACES: 7 };
export const TILE = { BIOS: 0, BSOD: 1, SYSMSG: 2, COVER: 3, AMP: 4, SCOPE: 5, DAW: 6, WORD: 7, WAVE: 8, DESKTOP: 9, COPY: 10, UEFI: 11, HEART: 12, TRIPLE: 13, CHAT: 14, NAME: 15, IPOD: 16, VFD: 17 };
// what's playing, for the screens that show it (the visitor's file, or the record from the shelf)
const trk = () => ({ title: art.title || 'I Love My Computer', artist: art.artist || 'Ninajirachi', album: art.album || art.title || 'I Love My Computer' });
const COLS = 4, ROWS = 5, TW = 384, TH = 288;

export const FACE_GLSL = `
float sdTri(vec2 p, float r) { const float k = 1.7320508; p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0; p.x -= clamp(p.x, -2.0 * r, 0.0); return -length(p) * sign(p.y); }
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// the :3 face: a chrome downward triangle, two slot eyes, a cat mouth
vec3 face(vec2 p, vec3 bg) {
  float s = 1.0 + 0.06 * uKick; p /= s;
  p.y -= 0.03;
  vec2 q = vec2(p.x * 0.92, -p.y * 1.05 + 0.08);
  float d = sdTri(q, 0.36) - 0.07;
  float aa = fwidth(d) * 1.2;
  vec3 c = bg;
  // drop shadow behind the plate
  c *= 1.0 - 0.5 * smoothstep(0.08, -0.02, sdTri(q + vec2(-0.02, 0.03), 0.36) - 0.07);
  if (d < 0.02) {
    float bev = clamp(-d / 0.06, 0.0, 1.0);
    vec2 gdir = normalize(vec2(dFdx(d), dFdy(d)) + 1e-6);
    float lit = 0.5 + 0.5 * dot(-gdir, normalize(vec2(-0.6, 0.8)));
    // chrome: a horizon line reflected in the plate, plus a hot rim on the bevel
    float y = p.y + 0.15 * p.x;
    vec3 chrome = mix(vec3(0.95, 0.97, 1.0), vec3(0.42, 0.45, 0.52), smoothstep(-0.04, 0.12, y));
    chrome = mix(chrome, vec3(0.18, 0.2, 0.25), smoothstep(-0.02, -0.12, y) * 0.6);
    chrome += 0.12 * sin(p.x * 18.0 + p.y * 6.0);
    chrome = mix(chrome * (0.55 + 0.6 * lit), chrome, bev);
    c = mix(c, chrome, smoothstep(aa, -aa, d));
    // eyes (blink: squash)
    float bl = 1.0 - 0.9 * uBlink;
    float e = min(sdBox(p - vec2(-0.11, 0.07), vec2(0.035, 0.065 * bl), 0.012), sdBox(p - vec2(0.11, 0.07), vec2(0.035, 0.065 * bl), 0.012));
    c = mix(c, vec3(0.06, 0.065, 0.08), smoothstep(aa, -aa, e));
    c = mix(c, vec3(0.6, 0.65, 0.75), smoothstep(aa, -aa, e + 0.008) * smoothstep(0.0, 0.03, p.y - 0.07 + 0.04) * 0.0);
    // mouth: two lower half-circles, opening with the mids
    float o = 0.02 + 0.03 * uMid;
    vec2 m1 = p - vec2(-0.033, -0.04), m2 = p - vec2(0.033, -0.04);
    float arc = min(abs(length(m1) - 0.033) - 0.009 + step(0.0, m1.y) * 1.0, abs(length(m2) - 0.033) - 0.009 + step(0.0, m2.y) * 1.0);
    c = mix(c, vec3(0.06, 0.065, 0.08), smoothstep(aa, -aa, arc));
    c = mix(c, vec3(0.06), smoothstep(aa, -aa, sdBox(p - vec2(0.0, -0.1), vec2(0.03, o * 0.5), 0.01)) * step(0.35, uMid));
  }
  return c;
}
`;

export const SKY_GLSL = `
float sh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
float sfbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * sn(p); p = p * 2.02 + 3.1; a *= 0.5; } return s; }
// The stock wallpapers the video flies through, as a world around you: sky above, ground below, flying forward.
// d: view direction (y up). scene 0 Bliss hills + a road, 1 ocean, 2 space, 3 above the clouds at dusk
vec3 y2k(vec3 d, float t, float scene, float D) {
  float el = d.y;
  vec2 fly = vec2(0.0, -D);                                       // forward, toward -z
  bool space = scene > 1.5 && scene < 2.5, dusk = scene > 2.5;
  vec3 skyTop = dusk ? vec3(0.16, 0.22, 0.62) : vec3(0.06, 0.3, 0.86), skyLow = dusk ? vec3(1.0, 0.62, 0.42) : vec3(0.62, 0.82, 1.0);
  vec3 c = mix(skyLow, skyTop, smoothstep(0.0, 0.55, el));
  vec3 sd = normalize(vec3(-0.45, 0.32, -0.83)); float sun = max(0.0, dot(d, sd));
  if (space) {
    vec3 q = d * 140.0, id = floor(q), f = fract(q) - 0.5; float hh = sh(id.xy + id.z * 7.13);
    vec3 o = vec3(sh(id.xy + 1.3), sh(id.yz + 2.1), sh(id.zx + 3.7)) - 0.5;
    float st = step(0.93, hh) * smoothstep(0.09, 0.0, length(f - o * 0.7)) * (0.55 + 0.45 * sin(t * 3.0 + hh * 40.0)) * 2.0;
    c = mix(vec3(0.0, 0.0, 0.03), vec3(0.06, 0.03, 0.16), smoothstep(-0.6, 0.6, d.x)) + st;
    vec3 pc = normalize(vec3(0.55, 0.22, -0.8)); float r = acos(clamp(dot(d, pc), -1.0, 1.0));
    if (r < 0.34) {
      vec3 u = normalize(cross(pc, vec3(0, 1, 0))), v = cross(u, pc); vec2 pp = vec2(dot(d - pc, u), dot(d - pc, v)) / 0.34;
      float band = sin((pp.y + 0.06 * sin(pp.x * 7.0 + t * 0.2)) * 26.0) + 0.5 * sin(pp.y * 61.0);
      vec3 jup = mix(vec3(0.72, 0.48, 0.32), vec3(0.98, 0.9, 0.78), 0.5 + 0.35 * band);
      float lit = clamp(dot(normalize(vec3(pp, sqrt(max(0.0, 1.0 - dot(pp, pp))))), normalize(vec3(-0.6, 0.5, 0.6))), 0.0, 1.0);
      c = mix(c, jup * (0.08 + 0.95 * lit), smoothstep(0.34, 0.33, r));
    }
    return c;
  }
  if (el > 0.0) {                                                       // clouds on a plane overhead, receding to the horizon
    vec2 p = d.xz / max(el, 0.02) * 1.0 + fly * 0.25;
    float cl = smoothstep(0.52, 0.78, sfbm(p * 0.55)) * smoothstep(0.0, 0.18, el);
    c = mix(c, mix(vec3(1.0), dusk ? vec3(1.0, 0.78, 0.7) : vec3(0.86, 0.9, 1.0), 0.4 * sfbm(p * 2.0)), cl * 0.85);
    c += vec3(1.0, 0.9, 0.7) * (pow(sun, 600.0) * 3.0 + pow(sun, 12.0) * 0.25);
    return c;
  }
  // the ground, seen from about a metre up, and fog toward the horizon
  vec2 p = d.xz / max(-el, 0.015) * 1.2 + fly;
  float fog = smoothstep(0.0, 0.32, -el);
  vec3 g;
  if (scene < 0.5) {                                                    // hills: grass, mown stripes, a highway
    float st = sfbm(p * 0.4) * 0.6 + 0.4 * sn(p * 6.0);
    g = mix(vec3(0.16, 0.48, 0.07), vec3(0.48, 0.8, 0.2), st) * (0.9 + 0.1 * step(0.5, fract(p.x * 0.5)));
    float road = smoothstep(0.62, 0.58, abs(p.x - 0.4 * sin(p.y * 0.08)));
    vec3 asphalt = vec3(0.17, 0.17, 0.19) + 0.04 * sn(p * 30.0);
    float dash = step(0.5, fract(p.y * 0.35)) * smoothstep(0.035, 0.02, abs(p.x - 0.4 * sin(p.y * 0.08)));
    g = mix(g, asphalt + dash * vec3(0.9, 0.85, 0.3), road);
  } else if (scene < 1.5) {                                             // ocean: swells and foam rushing past
    float w = sfbm(p * vec2(0.9, 0.35)) + 0.35 * sn(p * vec2(4.0, 1.5));
    g = mix(vec3(0.0, 0.14, 0.4), vec3(0.05, 0.42, 0.72), smoothstep(0.35, 0.8, w));
    g += vec3(0.92, 0.97, 1.0) * smoothstep(0.86, 0.98, w) * 0.85;
    g += vec3(1.0, 0.85, 0.6) * pow(max(0.0, dot(reflect(d, vec3(0, 1, 0)), sd)), 40.0) * 0.6;
  } else {                                                              // a sea of cloud tops at dusk
    float cl = sfbm(p * 0.35) * 0.7 + 0.3 * sfbm(p * 1.6);
    g = mix(vec3(0.55, 0.45, 0.62), vec3(1.0, 0.86, 0.8), smoothstep(0.3, 0.75, cl));
  }
  return mix(g, skyLow, 1.0 - fog);
}`;

const FRAG = `
precision highp float;
uniform sampler2D uAudio, uAtlas;
uniform float uTear; uniform vec4 uTile; uniform int uMode; uniform float uTime, uBeat, uFlash, uSeed, uAspect, uSwitch, uCrt, uBright, uKick, uMid, uLevel, uInvert, uBlink, uScene, uHue;
varying vec2 vUv;
${SKY_GLSL}
float spec(float x) { return texture2D(uAudio, vec2(x, 0.125)).r; }
float wav(float x) { return texture2D(uAudio, vec2(x, 0.375)).r; }
${FACE_GLSL}
vec3 wallpaper(vec2 uv, float t, float scene) {
  vec3 sky = scene > 2.5 ? mix(vec3(1.0, 0.62, 0.42), vec3(0.16, 0.22, 0.62), uv.y) : scene > 1.5 ? vec3(0.02, 0.01, 0.08) : mix(vec3(0.62, 0.82, 1.0), vec3(0.06, 0.3, 0.86), uv.y);
  if (scene > 1.5 && scene < 2.5) return sky + step(0.985, sh(floor(uv * vec2(90.0, 60.0)))) * vec3(1.0);
  float cl = smoothstep(0.55, 0.8, sn(vec2(uv.x * 5.0 + t * 0.1, uv.y * 9.0)) * 0.7 + sn(vec2(uv.x * 13.0, uv.y * 20.0)) * 0.3) * step(0.45, uv.y);
  sky = mix(sky, vec3(1.0), cl * 0.8);
  float hz = 0.38 + 0.06 * sin(uv.x * 5.0 + 1.0) + 0.03 * sin(uv.x * 13.0);
  if (uv.y < hz) sky = scene > 0.5 && scene < 1.5 ? mix(vec3(0.0, 0.14, 0.4), vec3(0.05, 0.42, 0.72), sn(vec2(uv.x * 20.0, uv.y * 40.0 - t * 2.0))) : mix(vec3(0.42, 0.78, 0.18), vec3(0.13, 0.45, 0.07), (hz - uv.y) * 3.0);
  return sky;
}
vec3 content(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  if (uMode == 1) {
    vec3 bg = mix(vec3(0.16, 0.165, 0.17), vec3(0.08), length(p)) ;
    if (uScene > 0.5) bg = mix(vec3(0.1, 0.35, 0.95), vec3(0.02, 0.1, 0.5), length(p));
    return face(p, bg);
  }
  if (uMode == 2) {
    float n = 24.0, i = floor(uv.x * n), f = fract(uv.x * n), v = spec((i + 0.5) / n * 0.8 + 0.02);
    float seg = step(0.2, fract(uv.y * 22.0)), on = step(uv.y, v) * step(0.12, f) * step(f, 0.88) * seg;
    vec3 col = mix(vec3(0.1, 1.0, 0.35), vec3(1.0, 0.85, 0.1), smoothstep(0.45, 0.7, uv.y)); col = mix(col, vec3(1.0, 0.15, 0.25), smoothstep(0.75, 0.9, uv.y));
    if (uHue > 0.5) col = mix(vec3(0.25, 0.7, 1.0), vec3(1.0, 0.3, 0.65), uv.y);
    return col * on + vec3(0.02, 0.03, 0.05);
  }
  if (uMode == 3) return wallpaper(uv, uTime + uSeed * 10.0, floor(fract(uSeed * 7.3) * 4.0));
  if (uMode == 4) { return texture2D(uAtlas, uTile.xy + clamp(uv, 0.002, 0.998) * uTile.zw).rgb; }
  if (uMode == 5) {
    float r = length(p), a = atan(p.y, p.x), z = 0.25 / max(r, 0.02) + uTime * (0.6 + 2.0 * uLevel);
    float stripes = step(0.5, fract(z * 1.0 + a / 6.2832 * 6.0 * (fract(uSeed) > 0.5 ? 1.0 : -1.0)));
    vec3 c1 = vec3(1.0, 0.25, 0.65), c2 = vec3(0.2, 0.55, 1.0);
    vec3 c = mix(c1, c2, stripes) * smoothstep(0.0, 0.25, r) * (0.6 + 0.8 * spec(fract(a / 6.2832 + 0.5) * 0.6));
    return c + vec3(1.0) * smoothstep(0.06, 0.0, r) * uKick;
  }
  if (uMode == 6) { float n = sh(floor(uv * vec2(160.0, 120.0)) + floor(uTime * 30.0)); return vec3(n * 0.8 + 0.1); }
  if (uMode == 7) {
    vec2 g = p * 3.0 + vec2(uTime * 0.3, uBeat * 0.25); vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    vec3 bg = mod(id.x + id.y, 2.0) < 1.0 ? vec3(1.0, 0.3, 0.65) : vec3(0.2, 0.5, 1.0);
    return face(f * 0.9 * vec2(1.0, 1.0), bg * 0.9);
  }
  return vec3(0.0);
}
void main() {
  vec2 uv = vUv;
  if (uTear > 0.01) { float row = floor(uv.y * 36.0), ft = floor(uTime * 24.0); uv.x += (sh(vec2(row, ft)) - 0.5) * uTear * 0.3 * step(0.55, sh(vec2(row + 3.0, ft))); }
  float mask = 1.0;
  if (uCrt > 0.5) {
    vec2 c = uv - 0.5; uv = 0.5 + c * (1.0 + 0.1 * dot(c, c));                      // barrel
    vec2 e = smoothstep(0.0, 0.012, uv) * smoothstep(0.0, 0.012, 1.0 - uv); mask = e.x * e.y;
  }
  // power on / channel change: the picture collapses to a line, then opens up
  float sw = clamp(uSwitch * 7.0, 0.0, 1.0), squash = mix(0.004, 1.0, smoothstep(0.0, 1.0, sw));
  vec2 su = vec2(0.5 + (uv.x - 0.5) / mix(0.3, 1.0, smoothstep(0.0, 0.6, sw)), 0.5 + (uv.y - 0.5) / squash);
  vec3 col = (su.y < 0.0 || su.y > 1.0 || su.x < 0.0 || su.x > 1.0 || uMode == 0) ? vec3(0.0) : content(su);
  col += vec3(1.0) * (1.0 - sw) * smoothstep(0.02, 0.0, abs(uv.y - 0.5) * squash * 0.0 + abs(uv.y - 0.5) - squash * 0.5) * 2.0;
  if (uInvert > 0.5) col = vec3(1.0) - col;
  if (uCrt > 0.5) {
    float lines = 240.0, fw = fwidth(uv.y * lines);                                  // scanlines, faded out before they alias
    col *= 1.0 - 0.18 * (0.5 - 0.5 * cos(uv.y * lines * 6.2832)) * (1.0 - smoothstep(0.25, 0.6, fw));
    col *= 1.0 - 0.35 * dot(uv - 0.5, uv - 0.5) * 2.5;
  }
  col = col * (1.0 + 1.2 * uFlash) + vec3(0.25) * uFlash;           // a flash: the picture burns brighter
  vec3 glass = vec3(0.012, 0.013, 0.015);
  gl_FragColor = vec4(glass + col * uBright * mask, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class Screens {
  constructor() {
    this.list = [];
    this.audio = new THREE.DataTexture(new Uint8Array(512 * 4 * 4), 512, 4, THREE.RGBAFormat); this.audio.magFilter = this.audio.minFilter = THREE.LinearFilter;
    // one small canvas texture per tile, so a frame only uploads the tiles that are on a screen
    this.tiles = Array.from({ length: COLS * ROWS }, (_, i) => {
      const c = document.createElement('canvas'); c.width = i === TILE.IPOD ? 320 : TW; c.height = i === TILE.IPOD ? 480 : TH;   // the iPod is native 320 x 480
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
      return { c, x: c.getContext('2d'), t };
    });
    this.x = this.tiles[0].x;
    this.shared = { uAudio: { value: this.audio }, uTime: { value: 0 }, uBeat: { value: 0 }, uKick: { value: 0 }, uMid: { value: 0 }, uLevel: { value: 0 }, uScene: { value: 0 } };
    this.painter = new Painter(null);
    this.used = new Set();
  }
  make(desc, seed) {
    const u = { ...this.shared, uAtlas: { value: this.tiles[0].t }, uTile: { value: new THREE.Vector4(0, 0, 1, 1) }, uMode: { value: MODE.FACE }, uFlash: { value: 0 }, uSeed: { value: seed }, uAspect: { value: desc.w / desc.h },
      uTear: { value: 0 }, uSwitch: { value: 1 }, uCrt: { value: desc.crt ? 1 : 0 }, uBright: { value: 1.2 }, uInvert: { value: 0 }, uBlink: { value: 0 }, uHue: { value: seed % 2 } };
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, extensions: { derivatives: true }, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    desc.mesh.material = m;
    const s = { ...desc, u, mode: MODE.FACE, tile: -1, t: 10, seed, flash: 0 };
    this.list.push(s);
    return s;
  }
  set(s, mode, tile = -1) {
    s.mode = mode; s.tile = tile; s.t = 0;
    s.u.uMode.value = mode;
    if (tile >= 0) { s.u.uAtlas.value = this.tiles[tile].t; s.u.uTile.value.set(0, 0, 1, 1); }
    if (tile >= 0 && s.band) { const v = s.u.uTile.value; v.y = 1 - s.band; v.w = s.band; }   // only the top strip of the tile
  }
  // what a screen gives off, for the lights (rough average colour of each kind of content)
  glow(s) {
    const t = s.mode === MODE.TILE ? s.tile : -1;
    const c = s.mode === MODE.OFF ? [0, 0, 0] : s.mode === MODE.FACE ? (this.shared.uScene.value > 0.5 ? [0.25, 0.4, 1] : [0.45, 0.47, 0.5]) : s.mode === MODE.BARS ? [0.3, 0.9, 0.35]
      : s.mode === MODE.BLISS ? [0.45, 0.7, 1] : s.mode === MODE.TUNNEL ? [0.8, 0.4, 0.9] : s.mode === MODE.SNOW ? [0.5, 0.5, 0.5] : s.mode === MODE.FACES ? [0.7, 0.45, 0.9]
      : t === TILE.BSOD || t === TILE.UEFI ? [0.1, 0.2, 1] : t === TILE.BIOS ? [0.15, 0.15, 0.15] : t === TILE.SYSMSG || t === TILE.DESKTOP ? [0.4, 0.6, 1] : t === TILE.COVER || t === TILE.TRIPLE ? [0.6, 0.55, 0.6]
      : t === TILE.AMP || t === TILE.SCOPE ? [0.2, 0.9, 0.3] : t === TILE.WORD ? [0.8, 0.8, 0.8] : t === TILE.HEART ? [1, 0.3, 0.6] : [0.5, 0.5, 0.55];
    const on = Math.min(1, s.t * 5), b = s.u.uBright.value * on;
    return c.map((v) => (v * (1 - s.flash) + s.flash) * b);
  }
  update(dt, fx, gl) {
    const a = this.audio.image.data;
    for (let i = 0; i < 512; i++) {
      const sp = fx.spec ? fx.spec[Math.floor(i / 4)] : 0;
      a[i * 4] = sp * 255 * fx.alive;
      const w = fx.wavL ? fx.wavL[i] : 0; a[(512 + i) * 4] = (0.5 + 0.5 * w) * 255;
    }
    this.audio.needsUpdate = true;
    fx.word = this.word;
    const sh = this.shared; sh.uTime.value = fx.time; sh.uBeat.value = fx.beat; sh.uKick.value = fx.kick * fx.alive; sh.uMid.value = fx.mid * fx.alive; sh.uLevel.value = fx.level;
    this.used.clear();
    for (const s of this.list) {
      s.t += dt; s.flash *= Math.exp(-dt * 10);
      s.tear = Math.max(0, (s.tear || 0) - dt * 4); s.u.uTear.value = s.tear;
      s.u.uSwitch.value = s.t; s.u.uFlash.value = s.flash; s.u.uBright.value = 1.05 + 0.45 * fx.kick * fx.alive;
      s.blink = Math.max(0, (s.blink || 0) - dt * 6); s.u.uBlink.value = Math.min(1, s.blink);
      if (s.mode === MODE.TILE) this.used.add(s.tile);
    }
    // repaint at most three tiles a frame, in turn (each upload costs the GPU about a millisecond); a tile that has
    // never been painted, or whose word just changed, jumps the queue
    const used = [...this.used], fresh = used.filter((t) => !this.tiles[t].sig || (t === TILE.WORD && this.tiles[t].sig !== `${fx.word}`));
    this.rr = (this.rr || 0);
    const pick = [...fresh];
    for (let k = 0; k < used.length && pick.length < 3; k++) { const t = used[(this.rr + k) % used.length]; if (!pick.includes(t)) pick.push(t); }
    this.rr += 3;
    for (const t of pick.slice(0, Math.max(3, fresh.length))) {
      const T = this.tiles[t], sig = t === TILE.BSOD || t === TILE.NAME ? 'once' : t === TILE.WORD ? `${fx.word}` : 'live';
      if (sig !== 'live' && T.sig === sig) continue;
      T.sig = sig; this.painter.x = T.x; T.x.save(); this.painter.tile(t, fx); T.x.restore(); T.t.needsUpdate = true;
    }
  }
}

// ---------- the atlas painter: one function per tile, each drawing at 384 x 288 ----------
const W = TW, H = TH;
const XP_BLUE = '#0a54e3', TAHOMA = 'Tahoma, Verdana, Segoe UI, sans-serif', MONO = '"VT323", "Lucida Console", monospace';
export class Painter {
  constructor(x) {
    this.x = x; this.cover = art.img;   // the visitor's own album art (art.js)
    this.scope = document.createElement('canvas'); this.scope.width = W; this.scope.height = H; this.sx = this.scope.getContext('2d');
    this.lines = []; this.copyN = 0;
  }
  tile(t, fx) {
    const x = this.x;
    if ((t === TILE.COVER || t === TILE.TRIPLE) && !art.has()) t = TILE.NAME;      // no art in the file: the name card instead
    switch (t) {
      case TILE.BIOS: return this.bios(x, fx);
      case TILE.BSOD: return this.bsod(x, fx);
      case TILE.SYSMSG: return this.sysmsg(x, fx);
      case TILE.COVER: return this.coverGlitch(x, fx);
      case TILE.AMP: return this.amp(x, fx);
      case TILE.SCOPE: return this.scopeTile(x, fx);
      case TILE.DAW: return this.daw(x, fx);
      case TILE.WORD: return this.word(x, fx);
      case TILE.WAVE: return this.wave(x, fx);
      case TILE.DESKTOP: return this.desktop(x, fx);
      case TILE.COPY: return this.copy(x, fx);
      case TILE.UEFI: return this.uefi(x, fx);
      case TILE.HEART: return this.heart(x, fx);
      case TILE.TRIPLE: return this.triple(x, fx);
      case TILE.CHAT: return this.chat(x, fx);
      case TILE.NAME: return this.name(x, fx);
      case TILE.IPOD: return this.ipod(x, fx);
      case TILE.VFD: return this.vfd(x, fx);
    }
  }
  bios(x, fx) {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#c8c8c8'; x.font = `20px ${MONO}`;
    const t = fx.time, L = ['Award Modular BIOS v6.00PG, An Energy Star Ally', 'Copyright (C) 1984-2003, Award Software, Inc.', '', 'Main Processor : Intel Pentium(R) 4 2400MHz', 'Memory Testing : ' + Math.min(65536, Math.floor(t * 9000) % 70000) + 'K OK', '',
      'Detecting IDE Primary Master ... ST380011A', 'Detecting IDE Primary Slave  ... None', 'Detecting IDE Secondary Master... HL-DT-ST DVD-RW', '', 'Press DEL to enter SETUP', '08/22/2003-i845PE-6A69KG0BC-00'];
    const n = Math.min(L.length, Math.floor((t * 4) % (L.length + 6)));
    L.slice(0, n).forEach((l, i) => x.fillText(l, 12, 26 + i * 20));
    if (Math.floor(t * 3) % 2) x.fillRect(12 + (L[n - 1] || '').length * 8.6, 12 + Math.max(0, n - 1) * 20, 10, 16);
  }
  bsod(x, fx) {
    x.fillStyle = '#0000aa'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#fff'; x.font = `18px ${MONO}`;
    const L = ['A problem has been detected and Windows has been', 'shut down to prevent damage to your computer.', '', 'PAGE_FAULT_IN_NONPAGED_AREA', '', 'If this is the first time you have seen this', 'Stop error screen, restart your computer. If this',
      'screen appears again, follow these steps:', '', 'Technical information:', '', '*** STOP: 0x00000050 (0xFD3094C2, 0x00000001,', '0xFBFE7617, 0x00000000)'];
    L.forEach((l, i) => x.fillText(l, 12, 24 + i * 19));
  }
  window(x, X, Y, w, h, title) {
    const g = x.createLinearGradient(0, Y, 0, Y + 24); g.addColorStop(0, '#3d95ff'); g.addColorStop(0.5, XP_BLUE); g.addColorStop(1, '#0841b8');
    x.fillStyle = '#ece9d8'; x.fillRect(X, Y, w, h); x.fillStyle = g; x.fillRect(X, Y, w, 24);
    x.strokeStyle = '#0831a3'; x.lineWidth = 2; x.strokeRect(X, Y, w, h);
    x.fillStyle = '#fff'; x.font = `bold 13px ${TAHOMA}`; x.fillText(title, X + 8, Y + 16);
    x.fillStyle = '#e24a2a'; x.fillRect(X + w - 22, Y + 3, 18, 18); x.fillStyle = '#fff'; x.font = `bold 13px ${TAHOMA}`; x.fillText('x', X + w - 17, Y + 16);
  }
  bliss(x) {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a6fe0'); g.addColorStop(0.6, '#8cc8ff'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.ellipse(40 + i * 80, 50 + (i % 2) * 20, 50, 14, 0, 0, Math.PI * 2); x.fill(); }
    const h = x.createLinearGradient(0, H * 0.55, 0, H); h.addColorStop(0, '#6cc22b'); h.addColorStop(1, '#2d7d12'); x.fillStyle = h;
    x.beginPath(); x.moveTo(0, H * 0.7); x.bezierCurveTo(W * 0.3, H * 0.45, W * 0.6, H * 0.6, W, H * 0.62); x.lineTo(W, H); x.lineTo(0, H); x.fill();
  }
  sysmsg(x, fx) {                                       // her System message window on the Bliss hills, the room in it
    this.bliss(x);
    if (!this.sm || (fx.time - (this.smT || 0) > 0.4 && this.thumb)) { this.sm = systemMessage(this.thumb || (art.has() ? this.cover : null), 300); this.smT = fx.time; }
    x.drawImage(this.sm, (W - 240) / 2, 24, 240, 240 * this.sm.height / this.sm.width);
  }
  coverGlitch(x, fx) {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    if (!art.has()) return;
    const s = Math.max(W, H) * 1.02, ox = (W - s) / 2, oy = (H - s) / 2 - 20 + Math.sin(fx.time * 0.3) * 20;
    x.drawImage(this.cover, ox, oy, s, s);
    const amt = fx.kick * fx.alive;
    for (let i = 0; i < 10 * amt; i++) {                 // slices shoved sideways on the kick
      const y = Math.random() * H, h = 4 + Math.random() * 30, dx = (Math.random() - 0.5) * 80 * amt;
            x.drawImage(this.cover, 0, (y - oy) / s * this.cover.height, this.cover.width, h / s * this.cover.height, ox + dx, y, s, h);
    }
    if (amt > 0.6) { x.globalCompositeOperation = 'difference'; x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; }
  }
  amp(x, fx) {
    x.fillStyle = '#1a1b26'; x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#3a3c55'); g.addColorStop(1, '#22233a'); x.fillStyle = g; x.fillRect(0, 0, W, 22);
    x.fillStyle = '#d8d8f0'; x.font = `bold 12px ${TAHOMA}`; x.fillText('WINAMP', 8, 15);
    x.fillStyle = '#000'; x.fillRect(10, 30, W - 20, 64);
    x.fillStyle = '#00e676'; x.font = `34px ${MONO}`; const tt = Math.max(0, fx.songT || 0);
    x.fillText(`${Math.floor(tt / 60)}:${String(Math.floor(tt % 60)).padStart(2, '0')}`, 18, 76);
    const tick = `***  1. ${trk().artist} - ${trk().title}  ***  ${trk().album}  `, off = Math.floor(fx.time * 8) % tick.length;
    x.font = `20px ${MONO}`; x.fillText((tick + tick).slice(off, off + 26), 110, 70);
    const n = 40, bw = (W - 20) / n;
    for (let i = 0; i < n; i++) {
      const v = (fx.spec ? fx.spec[Math.floor(2 + i * 2.6)] : 0) * fx.alive, h = v * 150, pk = (fx.peak ? fx.peak[Math.floor(2 + i * 2.6)] : 0) * fx.alive * 150;
      const gg = x.createLinearGradient(0, H - 20, 0, H - 170); gg.addColorStop(0, '#16c60c'); gg.addColorStop(0.6, '#f7e400'); gg.addColorStop(1, '#ff2a2a');
      x.fillStyle = gg; x.fillRect(10 + i * bw, H - 20 - h, bw - 2, h); x.fillStyle = '#cfd8ff'; x.fillRect(10 + i * bw, H - 22 - pk, bw - 2, 2);
    }
  }
  scopeTile(x, fx) {
    const s = this.sx; s.fillStyle = 'rgba(0,8,2,.28)'; s.fillRect(0, 0, W, H);
    if (fx.wavL) {
      s.strokeStyle = 'rgba(80,255,140,.95)'; s.lineWidth = 2; s.shadowColor = '#4f8'; s.shadowBlur = 8; s.beginPath();
      for (let i = 0; i < 512; i++) { const px = W / 2 + fx.wavL[i] * 230 * fx.alive, py = H / 2 - fx.wavR[i] * 230 * fx.alive; i ? s.lineTo(px, py) : s.moveTo(px, py); }
      s.stroke(); s.shadowBlur = 0;
    }
    x.drawImage(this.scope, 0, 0);
    x.strokeStyle = 'rgba(80,255,140,.15)'; x.lineWidth = 1; for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(i * W / 8, 0); x.lineTo(i * W / 8, H); x.stroke(); }
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, i * H / 6); x.lineTo(W, i * H / 6); x.stroke(); }
  }
  daw(x, fx) {
    x.fillStyle = '#3b444b'; x.fillRect(0, 0, W, H); x.fillStyle = '#2b3237'; x.fillRect(0, 0, W, 20);
    x.fillStyle = '#c9d4dc'; x.font = `11px ${TAHOMA}`; x.fillText('Playlist - Arrangement › fuck my computer', 8, 14);
    const song = fx.song, dur = song ? song.m.dur : 190, view = 48, t = Math.max(0, fx.songT || 0), t0 = Math.max(0, Math.min(dur - view, t - view * 0.35));
    const tracks = ['kick', 'bass', 'vox', 'lead', 'fx', 'drums', 'chops', 'pad'], cols = ['#7fd35a', '#5aa6d3', '#d35aa0', '#d3b35a', '#9a7fd3', '#5ad3c4', '#d36a5a', '#a0d35a'];
    tracks.forEach((n, i) => {
      const y = 24 + i * 32; x.fillStyle = i % 2 ? '#353d43' : '#394248'; x.fillRect(0, y, W, 31); x.fillStyle = '#9fb0bc'; x.fillText(n, 6, y + 19);
      if (!song) return;
      for (const b of song.bars) {
        const on = b.sec === 'drop' ? i !== 7 : b.sec === 'build' ? (i % 3 !== 0) : i === 7 || i === 2;
        if (!on || b.t + 4 * song.m.beatLen < t0 || b.t > t0 + view) continue;
        const X = 50 + (b.t - t0) / view * (W - 50), w = 4 * song.m.beatLen / view * (W - 50) - 1;
        x.fillStyle = cols[i]; x.globalAlpha = 0.85; x.fillRect(X, y + 3, w, 25); x.globalAlpha = 1;
        x.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 4; k++) x.fillRect(X + 2 + k * w / 4, y + 14 + ((k * 7 + i * 3) % 9) - 4, w / 6, 3);
      }
    });
    const px = 50 + (t - t0) / view * (W - 50); x.fillStyle = '#7dff9b'; x.fillRect(px, 20, 2, H - 20);
  }
  word(x, fx) {                                         // her type plates: white, a tall serif, the word in blue, red script across
    const w = (fx.word || 'MY COMPUTER').replace(/[^A-Z0-9—' ]/gi, '');
    x.fillStyle = '#f7f7f5'; x.fillRect(0, 0, W, H); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(W / 2, H * 0.3); x.scale(0.62, 1.6); x.font = '400 64px "Times New Roman", serif'; x.fillStyle = '#111'; x.fillText('I WANNA', 0, 0, W * 1.5); x.restore();
    x.save(); x.translate(W / 2, H * 0.62); x.scale(0.85, 1.35); x.font = '700 92px Oswald, Anton, sans-serif'; x.fillStyle = '#1f33ff'; x.fillText(w.toUpperCase(), 0, 0, W * 1.1); x.restore();
    x.font = '40px "Pinyon Script", cursive'; x.fillStyle = '#e3122e'; x.fillText('no one in the world', W / 2, H * 0.48, W * 0.95);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  }
  wave(x, fx) {
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, W, H);
    if (art.has()) x.drawImage(this.cover, 12, 12, 70, 70);
    x.fillStyle = '#f50'; x.beginPath(); x.arc(112, 46, 22, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(105, 35); x.lineTo(122, 46); x.lineTo(105, 57); x.fill();
    x.fillStyle = '#999'; x.font = `13px ${TAHOMA}`; x.fillText(trk().artist, 145, 38, W - 155); x.fillStyle = '#333'; x.font = `bold 16px ${TAHOMA}`; x.fillText(trk().title, 145, 58, W - 155);
    const song = fx.song; if (!song) return;
    const n = 120, prog = (fx.songT || 0) / song.m.dur;
    for (let i = 0; i < n; i++) {
      const v = song.wave[Math.floor(i / n * song.wave.length)] / 255, h = 10 + v * 110;
      x.fillStyle = i / n < prog ? '#f50' : '#bbb'; x.fillRect(12 + i * (W - 24) / n, 200 - h * 0.7, (W - 24) / n - 1, h * 0.7);
      x.fillStyle = i / n < prog ? '#fbb08a' : '#ddd'; x.fillRect(12 + i * (W - 24) / n, 202, (W - 24) / n - 1, h * 0.3);
    }
  }
  desktop(x, fx) {
    this.bliss(x);
    const icons = ['My Computer', 'Recycle Bin', 'FL Studio', 'ilmc.wav', 'girl EDM', 'stems'];
    icons.forEach((n, i) => {
      const X = 18 + (i % 2) * 80, Y = 14 + Math.floor(i / 2) * 78;
      x.fillStyle = i === (fx.hits % 6) ? 'rgba(49,106,197,.7)' : 'rgba(0,0,0,0)'; x.fillRect(X - 6, Y - 4, 70, 70);
      x.fillStyle = ['#bfd7ff', '#d9eedd', '#ff9d3c', '#fff', '#ff6fb5', '#ffe36a'][i]; x.fillRect(X + 14, Y + 4, 32, 30);
      x.strokeStyle = '#334'; x.strokeRect(X + 14, Y + 4, 32, 30);
      x.fillStyle = '#fff'; x.font = `11px ${TAHOMA}`; x.textAlign = 'center'; x.fillText(n, X + 30, Y + 50); x.textAlign = 'left';
    });
    x.fillStyle = '#245edb'; x.fillRect(0, H - 26, W, 26); x.fillStyle = '#3c9a3c'; x.fillRect(0, H - 26, 76, 26);
    x.fillStyle = '#fff'; x.font = `italic bold 14px ${TAHOMA}`; x.fillText('start', 22, H - 8);
    const cx = W * 0.5 + Math.sin(fx.time * 1.3) * 90, cy = H * 0.45 + Math.cos(fx.time * 0.9) * 60;   // the cursor wanders
    x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy + 18); x.lineTo(cx + 5, cy + 13); x.lineTo(cx + 12, cy + 13); x.closePath(); x.fill(); x.stroke();
  }
  copy(x, fx) {
    x.fillStyle = '#3a6ea5'; x.fillRect(0, 0, W, H);
    this.window(x, 24, 50, W - 48, 170, 'Copying...');
    const p = ((fx.songT || 0) / (art.dur || 190)) % 1;
    x.fillStyle = '#000'; x.font = `12px ${TAHOMA}`; x.fillText(trk().title.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_master.wav', 44, 110, W - 88); x.fillText('From \'Exports\' to \'iPod\'', 44, 128);
    x.fillStyle = '#fff'; x.fillRect(44, 142, W - 88, 20); x.strokeStyle = '#7a7a7a'; x.strokeRect(44, 142, W - 88, 20);
    x.fillStyle = '#2fa827'; for (let i = 0; i < Math.floor(p * 28); i++) x.fillRect(46 + i * 10.5, 144, 9, 16);
    x.fillStyle = '#000'; x.fillText(`${Math.max(1, Math.round((1 - p) * 9))} Minutes Remaining`, 44, 186);
    const fly = (fx.time * 0.8) % 1;                    // the page that flies between the folders
    x.fillStyle = '#ffe36a'; x.fillRect(60, 70, 26, 22); x.fillRect(W - 90, 70, 26, 22);
    x.fillStyle = '#fff'; x.fillRect(70 + fly * (W - 170), 74 - Math.sin(fly * Math.PI) * 18, 12, 14);
  }
  uefi(x, fx) {
    x.fillStyle = '#1f3fbf'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#e8ecff'; x.font = `20px ${MONO}`; x.fillText('UEFI Boot Choices', 18, 30); x.font = `16px ${MONO}`; x.fillText('Select Boot Device:', 18, 50);
    const items = ['ILMC DISK  (Ninajirachi)', 'FL STUDIO  Partition 1', 'CD-ROM  girl EDM', 'NETWORK  infohazard', 'USB  iPod Touch', 'SETUP'], sel = (fx.hits || 0) % items.length;
    items.forEach((it, i) => { if (i === sel) { x.fillStyle = '#e8ecff'; x.fillRect(14, 64 + i * 26, W - 28, 24); } x.fillStyle = i === sel ? '#1f3fbf' : '#e8ecff'; x.fillText(it, 22, 81 + i * 26); });
  }
  heart(x, fx) {
    x.fillStyle = '#ff4fa3'; x.fillRect(0, 0, W, H);
    const px = 14, s = 1 + 0.15 * fx.kick * fx.alive, P = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'];
    x.save(); x.translate(W / 2, H / 2 - 20); x.scale(s, s); x.fillStyle = '#fff';
    P.forEach((r, j) => [...r].forEach((c, i) => { if (c === 'X') x.fillRect((i - 4.5) * px, (j - 4) * px, px - 1, px - 1); }));
    x.restore();
    x.fillStyle = '#fff'; x.font = '40px "Alfa Slab One"'; x.textAlign = 'center'; x.fillText('my computer', W / 2, H - 30); x.textAlign = 'left';
  }
  triple(x, fx) {                                       // the same picture three times side by side (girl EDM)
    if (!art.has()) return;
    const w = W / 3, j = Math.floor(fx.time * 6) % 3;
    for (let i = 0; i < 3; i++) {
      const sx = this.cover.width * (0.3 + 0.03 * ((i + j) % 3)), sw = this.cover.width * 0.33;
      x.drawImage(this.cover, sx, this.cover.height * 0.45, sw, sw * H / w, i * w, 0, w, H);
    }
    x.fillStyle = `rgba(150,60,255,${0.25 + 0.3 * fx.kick * fx.alive})`; x.fillRect(0, 0, W, H);
  }
  chat(x, fx) {
    x.fillStyle = '#dfe9f5'; x.fillRect(0, 0, W, H); this.window(x, 0, 0, W, H, 'ninajirachi - Conversation');
    const msgs = [['nina', 'did u back up the stems'], ['computer', ':3'], ['nina', 'i love you'], ['computer', 'i know'], ['nina', 'dont crash tonight'], ['computer', 'no promises']];
    const n = 1 + Math.floor((fx.time * 0.7) % msgs.length);
    msgs.slice(0, n).forEach(([who, m], i) => {
      x.fillStyle = who === 'nina' ? '#c23' : '#227'; x.font = `bold 12px ${TAHOMA}`; x.fillText(who + ' says:', 12, 46 + i * 38);
      x.fillStyle = '#111'; x.font = `13px ${TAHOMA}`; x.fillText(m, 22, 62 + i * 38);
    });
  }
  // the iPod touch's Now Playing, as iPhone OS 3 drew it, at its own 320 x 480; with the small crack from the lyrics
  ipod(x, fx) {
    const W = 320, H = 480, playing = fx.alive > 0.3, t = Math.max(0, fx.songT || 0), dur = art.dur || 190.6;
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    if (art.has()) x.drawImage(this.cover, 0, 44 + 20, W, W);                        // the album art
    const gloss = (y, h, a = 0.85) => { const g = x.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, `rgba(70,70,74,${a})`); g.addColorStop(0.5, `rgba(18,18,20,${a})`); g.addColorStop(0.51, `rgba(0,0,0,${a})`); g.addColorStop(1, `rgba(10,10,12,${a})`); x.fillStyle = g; x.fillRect(0, y, W, h); };
    // status bar
    x.fillStyle = '#000'; x.fillRect(0, 0, W, 20); x.fillStyle = '#fff'; x.font = 'bold 12px Helvetica, Arial, sans-serif';
    x.fillText('iPod', 6, 15); x.textAlign = 'center'; x.fillText('4:20 PM', W / 2, 15); x.textAlign = 'left';
    x.strokeStyle = '#fff'; x.lineWidth = 1; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(46, 15, 3 + i * 3.2, -2.3, -0.84); x.stroke(); }
    x.strokeRect(W - 30, 6, 22, 10); x.fillRect(W - 8, 9, 2, 4); x.fillStyle = '#ff3b30'; x.fillRect(W - 28, 8, 4, 6);     // nearly flat
    // top bar: back, the three lines of now playing, the track list
    gloss(20, 44);
    x.fillStyle = '#2b2b2f'; x.beginPath(); x.moveTo(8, 42); x.lineTo(18, 30); x.lineTo(42, 30); x.lineTo(42, 54); x.lineTo(18, 54); x.closePath(); x.fill(); x.strokeStyle = '#555'; x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(20, 42); x.lineTo(28, 36); x.lineTo(28, 48); x.fill(); x.fillRect(28, 40, 8, 4);
    x.textAlign = 'center'; x.font = '11px Helvetica, Arial, sans-serif'; x.fillStyle = '#9a9aa0'; x.fillText(trk().artist, W / 2, 32, W - 100);
    x.font = 'bold 12px Helvetica, Arial, sans-serif'; x.fillStyle = '#fff'; x.fillText(trk().title, W / 2, 46, W - 100);
    x.font = '11px Helvetica, Arial, sans-serif'; x.fillStyle = '#9a9aa0'; x.fillText('I Love My Computer', W / 2, 59); x.textAlign = 'left';
    x.strokeStyle = '#ccc'; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(W - 34, 34 + i * 7); x.lineTo(W - 14, 34 + i * 7); x.stroke(); }
    // the scrubber over the art: repeat, elapsed / remaining, shuffle
    x.fillStyle = 'rgba(0,0,0,.62)'; x.fillRect(0, 64, W, 52);
    x.font = 'bold 11px Helvetica, Arial, sans-serif'; x.fillStyle = '#fff';
    const fmt = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`, p = Math.min(1, t / dur);
    x.fillText(fmt(t), 34, 96); x.textAlign = 'right'; x.fillText('-' + fmt(Math.max(0, dur - t)), W - 34, 96); x.textAlign = 'left';
    x.fillStyle = '#555'; x.fillRect(72, 90, W - 144, 4); x.fillStyle = '#ddd'; x.fillRect(72, 90, (W - 144) * p, 4);
    x.beginPath(); x.arc(72 + (W - 144) * p, 92, 6, 0, 7); x.fill();
    x.strokeStyle = '#ccc'; x.lineWidth = 2; x.strokeRect(10, 84, 14, 9); x.beginPath(); x.moveTo(W - 24, 84); x.lineTo(W - 10, 94); x.moveTo(W - 24, 94); x.lineTo(W - 10, 84); x.stroke();
    // transport: previous, play/pause, next, and the volume slider
    gloss(H - 96, 96, 0.92);
    x.fillStyle = '#fff';
    const tri = (cx, cy, d) => { x.beginPath(); x.moveTo(cx - 8 * d, cy - 9); x.lineTo(cx + 8 * d, cy); x.lineTo(cx - 8 * d, cy + 9); x.closePath(); x.fill(); };
    x.fillRect(66, H - 72, 3, 18); tri(80, H - 63, -1); tri(92, H - 63, -1);
    if (playing) { x.fillRect(W / 2 - 9, H - 74, 6, 22); x.fillRect(W / 2 + 3, H - 74, 6, 22); } else tri(W / 2 + 2, H - 63, 1);
    tri(W - 92, H - 63, 1); tri(W - 80, H - 63, 1); x.fillRect(W - 69, H - 72, 3, 18);
    x.fillStyle = '#888'; x.fillRect(46, H - 26, W - 92, 3); x.fillStyle = '#ddd'; x.fillRect(46, H - 26, (W - 92) * 0.7, 3);
    x.beginPath(); x.arc(46 + (W - 92) * 0.7, H - 24.5, 8, 0, 7); const kg = x.createRadialGradient(46 + (W - 92) * 0.7 - 2, H - 27, 1, 46 + (W - 92) * 0.7, H - 24, 8); kg.addColorStop(0, '#fff'); kg.addColorStop(1, '#9a9aa0'); x.fillStyle = kg; x.fill();
    // the crack: small, from the upper-right edge of the glass, with one short branch (lyrics: a small crack)
    if (!this.crack) {
      const c = this.crack = document.createElement('canvas'); c.width = W; c.height = H; const k = c.getContext('2d');
      const path = [[W + 2, 30], [W - 22, 52], [W - 40, 61], [W - 63, 86], [W - 78, 92], [W - 96, 118]], br = [[W - 40, 61], [W - 52, 52], [W - 70, 50]];
      for (const [pts, w] of [[path, 1.6], [br, 1.1]]) {
        k.lineCap = 'round'; k.lineJoin = 'round';
        k.strokeStyle = 'rgba(0,0,0,.55)'; k.lineWidth = w + 1.5; k.beginPath(); pts.forEach(([a, b], i) => (i ? k.lineTo(a, b + 1) : k.moveTo(a, b + 1))); k.stroke();
        k.strokeStyle = 'rgba(235,240,255,.85)'; k.lineWidth = w; k.beginPath(); pts.forEach(([a, b], i) => (i ? k.lineTo(a, b) : k.moveTo(a, b))); k.stroke();
      }
      const gl = k.createRadialGradient(W - 22, 52, 0, W - 22, 52, 9); gl.addColorStop(0, 'rgba(255,255,255,.7)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); k.fillStyle = gl; k.fillRect(W - 32, 42, 20, 20);
    }
    x.drawImage(this.crack, 0, 0);
  }
  // the deck's vacuum fluorescent display: a marquee and a level meter, in cyan
  vfd(x, fx) {
    const h = 70; x.fillStyle = '#031413'; x.fillRect(0, 0, W, h);
    const msg = `  ♥ ${trk().title} ♥ ${trk().artist} ♥ ${trk().album} ♥ SIDE A ♥ 33⅓  `.toUpperCase(), off = Math.floor(fx.time * 10) % msg.length;
    x.font = `44px ${MONO}`; x.fillStyle = '#58fff0'; x.shadowColor = '#3ff'; x.shadowBlur = 10;
    x.fillText((msg + msg).slice(off, off + 15), 8, 50);
    for (let i = 0; i < 12; i++) { const on = (fx.spec ? fx.spec[4 + i * 9] : 0) * fx.alive * 12 > i * 0.9; x.fillStyle = on ? (i > 9 ? '#ff5aa0' : '#58fff0') : '#0b3330'; x.fillRect(W - 66 + (i % 6) * 10, i < 6 ? 14 : 40, 8, 18); }
    x.shadowBlur = 0;
  }
  name(x, fx) {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.font = '900 58px Orbitron'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#fff'; x.shadowBlur = 18; x.fillStyle = '#fff';
    const sc = Math.min(1, (W - 24) / x.measureText('NINAJIRACHI').width); x.save(); x.translate(W / 2, H / 2); x.scale(sc, 1); x.fillText('NINAJIRACHI', 0, 0); x.restore();
    x.shadowBlur = 0; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  }
}
