// Every screen in the room. Content is drawn in the shader (the :3 face, Y2K wallpaper, tunnel, snow), drawn on the
// GPU into its own small picture (the visualisers: viz/gpu.js), or painted into a 2D tile (BIOS, BSOD, system message,
// the cover...). The shader then treats it like a display: a CRT's curved glass, phosphor stripes and scanlines that
// melt away with distance, darker corners, a degauss wobble when it powers on; an LCD's pixel grid, cool backlight and
// off-axis washout. One exposure for all of them, with highlights rolled off so bright pictures keep their colour.
import * as THREE from 'three';
import { art } from './art.js';
import { systemMessage } from './win98.js';
import { Viz } from './viz/gpu.js';
import { FACE_GLSL, Face, Voice } from './viz/face.js';
import { win, sunken, button, SANS } from './viz/era.js';
export { FACE_GLSL };

export const MODE = { OFF: 0, FACE: 1, BARS: 2, BLISS: 3, TILE: 4, TUNNEL: 5, SNOW: 6, FACES: 7 };
// pictures by id. AMP, SCOPE and DAW kept their ids and are now the GPU's Winamp, oscilloscope and FL step sequencer
export const TILE = { BIOS: 0, BSOD: 1, SYSMSG: 2, COVER: 3, AMP: 4, SCOPE: 5, DAW: 6, WORD: 7, WAVE: 8, DESKTOP: 9, COPY: 10, UEFI: 11, HEART: 12, TRIPLE: 13, CHAT: 14, NAME: 15, IPOD: 16, VFD: 17,
  ANALYZER: 18, VECTOR: 19, WATERFALL: 20, MILK: 21, METERS: 22,
  // the period software (viz/era.js)
  PIPES: 23, STARS: 24, MYSTIFY: 25, MAZE: 26, BOUNCE: 27, DEFRAG: 28, COPY98: 29, DOWNLOAD: 30, BURN: 31, SCANDISK: 32, SOLITAIRE: 33, MINES: 34, WEBCAM: 35, MPLAYER: 36 };
const GPU = { [TILE.AMP]: 'player', [TILE.SCOPE]: 'scope', [TILE.DAW]: 'steps', [TILE.ANALYZER]: 'analyzer', [TILE.VECTOR]: 'vector', [TILE.WATERFALL]: 'waterfall', [TILE.MILK]: 'milk', [TILE.METERS]: 'meters',
  [TILE.PIPES]: 'pipes', [TILE.STARS]: 'stars', [TILE.MYSTIFY]: 'mystify', [TILE.MAZE]: 'maze', [TILE.BOUNCE]: 'bounce', [TILE.DEFRAG]: 'defrag', [TILE.COPY98]: 'copy', [TILE.DOWNLOAD]: 'download',
  [TILE.BURN]: 'burn', [TILE.SCANDISK]: 'scandisk', [TILE.SOLITAIRE]: 'solitaire', [TILE.MINES]: 'mines', [TILE.WEBCAM]: 'webcam', [TILE.MPLAYER]: 'mplayer' };
// roughly what each gives off, for the lights
const GLOW = { [TILE.PIPES]: [0.25, 0.22, 0.25], [TILE.STARS]: [0.08, 0.08, 0.1], [TILE.MYSTIFY]: [0.2, 0.15, 0.25], [TILE.MAZE]: [0.4, 0.25, 0.2], [TILE.BOUNCE]: [0.08, 0.08, 0.08], [TILE.SOLITAIRE]: [0.15, 0.45, 0.15],
  [TILE.SCANDISK]: [0.1, 0.1, 0.6], [TILE.MPLAYER]: [0.45, 0.4, 0.5], [TILE.WEBCAM]: [0.4, 0.45, 0.45] };
// The wall: every screen in the stack (not the iPod or the deck's own display) shows its piece of one picture laid over
// the whole frame, sampled by where each pixel lands in the camera's view, so the pile reads as one display with bezels.
//   screens.wall.pic = WALL.FACE; screens.wall.amount = 0..1   set each frame from the choreography, or
//   screens.wallFor(WALL.FACE, secs, fade = 0.3)               a one-off moment: fades in, holds, fades out
// WALL.VIZ a giant LED analyser across the frame; FACE the :3 face (blinks with screens.wall.blink = 1);
// WASH a colour wash sweeping across on the beat; WORD the sung word (screens.word) in huge type; MILK the MilkDrop warp.
// screens.exposure is the level of the screens' white, linear (default 0.85); highlights roll off above 60 % of it.
export const WALL = { VIZ: 0, FACE: 1, WASH: 2, WORD: 3, MILK: 4 };
// what's playing, for the screens that show it (the visitor's file, or the record from the shelf)
const trk = () => ({ title: art.title || 'I Love My Computer', artist: art.artist || 'Ninajirachi', album: art.album || art.title || 'I Love My Computer' });
const COLS = 4, ROWS = 5, TW = 384, TH = 288;
// the chorus' temperaments: how late each feels the lead's mood, how big it sings, hops, blushes, how heavy its lids are,
// and the moods it takes its own way
const TEMPER = [
  { lag: 0.5, amp: 0.8, bounce: 0.7, blush: 0.35, lids: 0.92, blinks: 1.3, map: { curious: 'shy', declare: 'shy', wanting: 'shy' } },          // bashful
  { lag: 0.12, amp: 1.25, bounce: 1.6, blush: 0, lids: 1.12, blinks: 0.7, map: { curious: 'delighted', shy: 'delighted', blissful: 'joy' } },  // eager
  { lag: 0.8, amp: 0.7, bounce: 0.5, blush: 0.1, lids: 0.72, blinks: 1.6, map: { joy: 'blissful', frantic: 'overwhelmed', declare: 'blissful' } },   // dozy
  { lag: 0.3, amp: 1, bounce: 1, blush: 0.2, lids: 1, blinks: 1, map: { overwhelmed: 'love', curious: 'love' } },                          // smitten
];

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
uniform sampler2D uAudio, uAtlas, uWallTex;
uniform float uTear; uniform vec4 uTile; uniform int uMode; uniform float uTime, uBeat, uFlash, uSeed, uAspect, uSwitch, uPower, uCrt, uBright, uKick, uMid, uLevel, uInvert, uBlink, uScene, uHue;
uniform float uExposure, uCalm, uWall; uniform int uWallPic; uniform vec4 uVP;
uniform vec4 uFE, uFM, uFX, uFY, uLE, uLM, uLX, uLY;   // this screen's face, and the lead's (for the wall)
varying vec2 vUv; varying vec3 vN, vV;
${SKY_GLSL}
float spec(float x) { return texture2D(uAudio, vec2(x, 0.125)).r; }
float wav(float x) { return texture2D(uAudio, vec2(x, 0.375)).r; }
${FACE_GLSL}
// one of a crowd of faces: each blinks on its own, looks a little elsewhere and sings a little more or less
vec3 faceCell(vec2 p, vec3 bg, vec2 id, vec4 E, vec4 M, vec4 X, vec4 Y) {
  float h = fhash(id + 3.7), bt = fract(uTime * (0.21 + 0.1 * h) + h * 7.0);
  if (E.w < 0.5) E.z *= bt > 0.97 ? abs(bt - 0.985) / 0.015 : 1.0;
  E.xy += vec2(h - 0.5, fract(h * 13.0) - 0.5) * 0.8; M.x *= 0.6 + 0.6 * fract(h * 31.0); X.w += (fract(h * 7.0) - 0.5) * 0.2;
  return face(p, bg, E, M, X, Y, uTime + h * 10.0);
}
vec3 wallpaper(vec2 uv, float t, float scene) {
  vec3 sky = scene > 2.5 ? mix(vec3(1.0, 0.62, 0.42), vec3(0.16, 0.22, 0.62), uv.y) : scene > 1.5 ? vec3(0.02, 0.01, 0.08) : mix(vec3(0.62, 0.82, 1.0), vec3(0.06, 0.3, 0.86), uv.y);
  if (scene > 1.5 && scene < 2.5) return sky + step(0.985, sh(floor(uv * vec2(90.0, 60.0)))) * vec3(1.0);
  float cl = smoothstep(0.55, 0.8, sn(vec2(uv.x * 5.0 + t * 0.1, uv.y * 9.0)) * 0.7 + sn(vec2(uv.x * 13.0, uv.y * 20.0)) * 0.3) * step(0.45, uv.y);
  sky = mix(sky, vec3(1.0), cl * 0.8);
  float hz = 0.38 + 0.06 * sin(uv.x * 5.0 + 1.0) + 0.03 * sin(uv.x * 13.0);
  if (uv.y < hz) sky = scene > 0.5 && scene < 1.5 ? mix(vec3(0.0, 0.14, 0.4), vec3(0.05, 0.42, 0.72), sn(vec2(uv.x * 20.0, uv.y * 40.0 - t * 2.0))) : mix(vec3(0.42, 0.78, 0.18), vec3(0.13, 0.45, 0.07), (hz - uv.y) * 3.0);
  return sky;
}
vec3 tex(vec2 uv, float bias) { return texture2D(uAtlas, uTile.xy + clamp(uv, 0.002, 0.998) * uTile.zw, bias).rgb; }
vec3 content(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  if (uMode == 1) {
    vec3 bg = mix(vec3(0.16, 0.165, 0.17), vec3(0.08), length(p)) ;
    if (uScene > 0.5) bg = mix(vec3(0.1, 0.35, 0.95), vec3(0.02, 0.1, 0.5), length(p));
    return face(p * 0.8, bg, uFE, uFM, uFX, uFY, uTime);           // a size up: it fills its screen, so it reads across the room
  }
  if (uMode == 3) return wallpaper(uv, uTime + uSeed * 10.0, floor(fract(uSeed * 7.3) * 4.0));
  if (uMode == 4 || uMode == 8) return tex(uv, 0.0);
  if (uMode == 5) {
    // stripes rushing out of the middle; where they get finer than a pixel (the centre) they melt to their average
    float r = length(p), a = atan(p.y, p.x), z = 0.25 / max(r, 0.02) + uTime * (0.6 + 2.0 * uLevel * (1.0 - 0.7 * uCalm));
    float zz = z + a / 6.2832 * 6.0 * (fract(uSeed) > 0.5 ? 1.0 : -1.0), w = min(fwidth(z) * 1.5, 0.5);
    float stripes = mix(smoothstep(0.5 - w, 0.5 + w, abs(fract(zz) - 0.5) * 2.0), 0.5, smoothstep(0.25, 0.5, w));
    vec3 c1 = vec3(1.0, 0.25, 0.65), c2 = vec3(0.2, 0.55, 1.0);
    vec3 c = mix(c1, c2, stripes) * smoothstep(0.0, 0.25, r) * (0.6 + 0.8 * spec(fract(a / 6.2832 + 0.5) * 0.6));
    return c + vec3(1.0) * smoothstep(0.06, 0.0, r) * uKick;
  }
  if (uMode == 6) { float n = sh(floor(uv * vec2(160.0, 120.0)) + floor(uTime * mix(30.0, 6.0, uCalm))); return vec3(mix(n * 0.8 + 0.1, 0.25 + n * 0.2, uCalm)); }
  if (uMode == 7) {
    vec2 g = p * 3.0 + vec2(uTime * 0.3, uBeat * 0.25); vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    vec3 bg = mod(id.x + id.y, 2.0) < 1.0 ? vec3(1.0, 0.3, 0.65) : vec3(0.2, 0.5, 1.0);
    return faceCell(f * 0.9, bg * 0.9, id, uFE, uFM, uFX, uFY);
  }
  return vec3(0.0);
}
// the wall's picture at q (0..1 across the camera's frame)
vec3 wallPic(vec2 q) {
  float asp = uVP.z / uVP.w; vec2 p = (q - 0.5) * vec2(asp, 1.0);
  if (uWallPic == 0) {
    float N = 16.0, bi = floor(q.x * N), rows = 10.0, ri = floor(q.y * rows);
    vec2 f = vec2(fract(q.x * N), fract(q.y * rows)), fw = fwidth(q * vec2(N, rows));
    float v = 0.0; for (int k = 0; k < 6; k++) v = max(v, spec((bi * 6.0 + float(k) + 6.0) / 104.0));
    float lvl = (ri + 0.5) / rows, on = step(lvl, v * 1.08);
    vec2 e = smoothstep(vec2(0.07), vec2(0.07) + fw, f) * smoothstep(vec2(0.07), vec2(0.07) + fw, 1.0 - f);
    vec3 col = lvl < 0.6 ? vec3(0.1, 1.0, 0.25) : lvl < 0.82 ? vec3(1.0, 0.78, 0.05) : vec3(1.0, 0.1, 0.1);
    return col * e.x * e.y * (0.05 + 0.95 * on);
  }
  // a field of faces, each about a screen big, drifting across the whole stack together (one face over the whole
  // frame only ever lands as flat chrome on the scattered screens; a moving field crosses the bezels and reads as one)
  if (uWallPic == 1) {
    vec2 g = p * 4.2 + vec2(uTime * 0.35, 0.0), id = floor(g), f = fract(g) - 0.5;
    vec3 bg = mod(id.x + id.y, 2.0) < 1.0 ? vec3(1.0, 0.3, 0.65) : vec3(0.15, 0.4, 1.0);
    return faceCell(f * 0.95, bg * 0.85, id, uLE, uLM, uLX, uLY);
  }
  if (uWallPic == 2) {
    float h = fract(q.x * 0.55 - uBeat * 0.125 + 0.08 * sin(q.y * 3.0 + uTime));
    return (0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)))) * (0.75 + 0.25 * uKick);
  }
  if (uWallPic == 3) return texture2D(uWallTex, q).rgb;
  return texture2D(uWallTex, p / max(asp, 1.0) * 1.1 + 0.5).rgb;
}
void main() {
  vec2 uv = vUv, c0 = uv - 0.5;
  // degauss: for a second after a tube powers on, the picture wobbles and its colours swirl
  float dg = uCrt * exp(-uPower * 3.2) * step(uPower, 1.6) * (1.0 - 0.6 * uCalm);
  uv += dg * 0.012 * vec2(sin(uv.y * 21.0 + uPower * 50.0), sin(uv.x * 15.0 + uPower * 37.0));
  if (uTear > 0.01) { float row = floor(uv.y * 36.0), ft = floor(uTime * 24.0); uv.x += (sh(vec2(row, ft)) - 0.5) * uTear * 0.3 * step(0.55, sh(vec2(row + 3.0, ft))); }
  float mask = 1.0;
  if (uCrt > 0.5) {
    vec2 c = uv - 0.5; uv = 0.5 + c * (1.0 + 0.1 * dot(c, c));                      // barrel
    vec2 e = smoothstep(0.0, 0.014, uv) * smoothstep(0.0, 0.014, 1.0 - uv); mask = e.x * e.y;
  }
  // power on / channel change: the picture collapses to a line, then opens up
  float sw = clamp(uSwitch * 7.0, 0.0, 1.0), squash = mix(0.004, 1.0, smoothstep(0.0, 1.0, sw));
  vec2 su = vec2(0.5 + (uv.x - 0.5) / mix(0.3, 1.0, smoothstep(0.0, 0.6, sw)), 0.5 + (uv.y - 0.5) / squash);
  bool inside = !(su.y < 0.0 || su.y > 1.0 || su.x < 0.0 || su.x > 1.0 || uMode == 0);
  vec3 col = inside ? content(su) : vec3(0.0);
  if (inside && (uMode == 4 || uMode == 8)) col += tex(su, 3.5) * 0.14;           // light spreading in the glass
  if (uWall > 0.001) col = mix(col, wallPic((gl_FragCoord.xy - uVP.xy) / uVP.zw), uWall);
  col += vec3(1.0) * (1.0 - sw) * smoothstep(0.02, 0.0, abs(uv.y - 0.5) - squash * 0.5) * 2.0;
  if (uInvert > 0.5) col = vec3(1.0) - col;
  float a = uv.x * 7.0 - uv.y * 5.0 + uPower * 9.0;
  col *= 1.0 + dg * 0.9 * vec3(sin(a), sin(a + 2.1), sin(a + 4.2));
  col *= uExposure * uBright;
  col = col * (1.0 + 0.8 * uFlash) + vec3(0.12) * uFlash * uExposure;               // a flash: the picture burns brighter
  vec3 glass;
  if (uCrt > 0.5) {
    // aperture grille and scanlines, each faded out before it gets finer than a pixel (no moire, no crawl)
    float tri = uv.x * 200.0 * uAspect, mk = 1.0 - smoothstep(0.22, 0.45, fwidth(tri));
    float ph = fract(tri) * 6.2832; vec3 grille = 1.0 + 0.85 * cos(ph - vec3(0.0, 2.094, 4.189));
    col *= mix(vec3(1.0), grille, mk * 0.55);
    float ln = uv.y * 240.0, sk = 1.0 - smoothstep(0.22, 0.45, fwidth(ln)), lum = dot(col, vec3(0.3, 0.6, 0.1));
    float s = 0.5 + 0.5 * cos(ln * 6.2832); col *= mix(1.0, mix(0.35, 0.75, clamp(lum * 1.5, 0.0, 1.0)) + 0.6 * s, sk * 0.8);   // bright lines bloom fatter
    float r2 = dot(c0, c0);
    col *= (1.0 - 1.1 * r2 * r2 * 4.0 - 0.3 * r2) * vec3(1.0 + 0.06 * c0.x, 1.0, 1.0 - 0.06 * c0.x);   // dimmer, slightly off-colour corners
    float sheen = smoothstep(0.42, 0.0, length(c0 * vec2(1.0, 1.3) - vec2(-0.2, 0.24)));
    glass = vec3(0.011, 0.013, 0.012) + vec3(0.028, 0.03, 0.034) * sheen;          // the grey of a dark tube, a soft reflection
  } else {
    // LCD: the pixel grid up close, a cool backlight that never quite goes black, off-axis the picture greys out
    vec2 px = uv * vec2(300.0 * uAspect, 300.0), gk = 1.0 - smoothstep(vec2(0.22), vec2(0.45), fwidth(px)), gp = abs(fract(px) - 0.5);
    col *= 1.0 - 0.45 * max(smoothstep(0.38, 0.5, gp.x) * gk.x, smoothstep(0.38, 0.5, gp.y) * gk.y);
    float ndv = abs(dot(normalize(vN), normalize(-vV))), k = smoothstep(0.15, 0.85, ndv);
    col = mix(col * 0.55 + vec3(0.02, 0.024, 0.035) * uExposure, col * vec3(0.94, 0.98, 1.05), k);
    col *= 0.93 + 0.07 * smoothstep(0.5, 0.3, abs(c0.y));
    glass = vec3(0.012, 0.014, 0.02) * (0.5 + 0.5 * uExposure);
  }
  // highlights roll off instead of clipping, so a white plate stays a plate and a colour stays that colour
  float m = max(col.r, max(col.g, col.b)), K = 0.6 * uExposure, top = 1.15 * uExposure;
  if (m > K) col *= (K + (top - K) * (1.0 - exp(-(m - K) / (top - K)))) / m;
  gl_FragColor = vec4(glass + max(col, 0.0) * mask, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const VERT = `varying vec2 vUv; varying vec3 vN, vV;
void main() { vUv = uv; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }`;

export class Screens {
  constructor() {
    this.list = []; this.frame = 0; this.reduce = false;
    this.audio = new THREE.DataTexture(new Uint8Array(512 * 4 * 4), 512, 4, THREE.RGBAFormat); this.audio.magFilter = this.audio.minFilter = THREE.LinearFilter;
    // one small canvas texture per 2D tile, so a frame only uploads the tiles that changed and are on a screen
    this.tiles = Array.from({ length: COLS * ROWS }, (_, i) => {
      const c = document.createElement('canvas'); c.width = i === TILE.IPOD ? 320 : TW; c.height = i === TILE.IPOD ? 480 : TH;   // the iPod is native 320 x 480
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
      return { c, x: c.getContext('2d'), t };
    });
    this.x = this.tiles[0].x;
    this.viz = new Viz();
    this.shared = { uAudio: { value: this.audio }, uTime: { value: 0 }, uBeat: { value: 0 }, uKick: { value: 0 }, uMid: { value: 0 }, uLevel: { value: 0 }, uScene: { value: 0 },
      uExposure: { value: 0.85 }, uCalm: { value: 0 }, uWall: { value: 0 }, uWallPic: { value: 0 }, uWallTex: { value: null }, uVP: { value: new THREE.Vector4(0, 0, 1600, 900) } };
    this.wall = { pic: WALL.FACE, amount: 0, blink: 0 }; this.moment = null;
    const wc = document.createElement('canvas'); wc.width = 1024; wc.height = 512;
    this.wordTex = { c: wc, x: wc.getContext('2d'), t: new THREE.CanvasTexture(wc), sig: null }; this.wordTex.t.colorSpace = THREE.SRGBColorSpace;
    this.painter = new Painter(null);
    this.used = new Set();
    this._vp = new THREE.Vector4();
    // the :3 face as a character (viz/face.js): the lead on the frankencomputer left of the deck, the chorus on the other
    // screens showing a face, each with its own temperament; perform() hands the lead the song's story every frame
    this.lead = new Face(); this.chorus = new Map(); this.voice = null;
    this.perf = { songT: null, playing: false, alive: 0, bar: 0, sky: 0, pop: 0, lens: new THREE.Vector3(0, 3, 3), record: new THREE.Vector3() };
    Object.assign(this.shared, { uLE: { value: this.lead.E }, uLM: { value: this.lead.M }, uLX: { value: this.lead.X }, uLY: { value: this.lead.Y } });
  }
  // the conductor, every frame: where the song is and what the room is doing (song time, playing, alive, bar, sky, pop,
  // and the lens and the record as world positions, so the faces can look at them)
  perform(o) {
    const P = this.perf, popped = o.pop > 0.9 && P.pop < 0.85;
    Object.assign(P, o); this.lead.follow(o.songT, o);
    if (popped && ['curious', 'shy', 'waking', 'sleepy', 'wanting', 'declare'].includes(this.lead.name)) this.lead.react('flash');   // a big flash: it flinches, then looks at the lens
  }
  get exposure() { return this.shared.uExposure.value; }
  set exposure(v) { this.shared.uExposure.value = v; }
  // a one-off wall moment: fades in over `fade` s, holds, fades out by `secs`
  wallFor(pic, secs, fade = 0.3) { this.moment = { pic, t: 0, secs, fade }; }
  make(desc, seed) {
    const u = { ...this.shared, uFE: { value: new THREE.Vector4(0, 0, 1, 0) }, uFM: { value: new THREE.Vector4(0, 0, 0.9, 0) }, uFX: { value: new THREE.Vector4() }, uFY: { value: new THREE.Vector4() }, uAtlas: { value: this.tiles[0].t }, uTile: { value: new THREE.Vector4(0, 0, 1, 1) }, uMode: { value: MODE.FACE }, uFlash: { value: 0 }, uSeed: { value: seed }, uAspect: { value: desc.w / desc.h },
      uTear: { value: 0 }, uSwitch: { value: 1 }, uPower: { value: 10 }, uCrt: { value: desc.crt ? 1 : 0 }, uBright: { value: 1 }, uInvert: { value: 0 }, uBlink: { value: 0 }, uHue: { value: seed % 2 } };
    if (desc.fixed !== undefined) u.uWall = { value: 0 };                  // the iPod and the deck's display keep their own picture
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, extensions: { derivatives: true }, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    desc.mesh.material = m;
    const s = { ...desc, u, mode: MODE.FACE, tile: -1, t: 10, power: 10, seed, flash: 0, seen: -9 };
    // drawn this frame (it passed the camera's culling): note it, run the visualisers once, and tell the wall where the frame is
    desc.mesh.onBeforeRender = (r) => { s.seen = this.frame; this.viz.render(r); r.getCurrentViewport(this._vp); this.shared.uVP.value.copy(this._vp); };
    this.list.push(s);
    return s;
  }
  set(s, mode, tile = -1) {
    if (s.mode === MODE.OFF && mode !== MODE.OFF) s.power = 0;            // a tube coming on degausses
    if (mode === MODE.BARS) tile = TILE.ANALYZER;                        // the bars are the LED analyser now
    s.mode = mode; s.tile = tile; s.t = 0;
    const gpu = tile >= 0 && GPU[tile];
    s.u.uMode.value = gpu ? 8 : mode === MODE.BARS ? 8 : mode;
    if (gpu) { s.u.uAtlas.value = this.viz.tex(gpu); s.u.uTile.value.set(0, 0, 1, 1); }
    else if (tile >= 0) { s.u.uAtlas.value = this.tiles[tile].t; s.u.uTile.value.set(0, 0, 1, 1); }
    if (tile >= 0 && s.band) { const v = s.u.uTile.value; v.y = 1 - s.band; v.w = s.band; }   // only the top strip of the tile
  }
  // what a screen gives off, for the lights (rough average colour of each kind of content)
  glow(s) {
    const t = s.mode === MODE.TILE || s.mode === MODE.BARS ? s.tile : -1;
    const c = s.mode === MODE.OFF ? [0, 0, 0] : s.mode === MODE.FACE ? (this.shared.uScene.value > 0.5 ? [0.25, 0.4, 1] : [0.45, 0.47, 0.5])
      : s.mode === MODE.BLISS ? [0.45, 0.7, 1] : s.mode === MODE.TUNNEL ? [0.8, 0.4, 0.9] : s.mode === MODE.SNOW ? [0.5, 0.5, 0.5] : s.mode === MODE.FACES ? [0.7, 0.45, 0.9]
      : t === TILE.BSOD || t === TILE.UEFI ? [0.1, 0.2, 1] : t === TILE.BIOS ? [0.15, 0.15, 0.15] : t === TILE.SYSMSG || t === TILE.DESKTOP ? [0.4, 0.6, 1] : t === TILE.COVER || t === TILE.TRIPLE ? [0.6, 0.55, 0.6]
      : t === TILE.ANALYZER ? [0.3, 0.7, 0.2] : t === TILE.SCOPE ? [0.15, 0.5, 0.3] : t === TILE.VECTOR ? [0.5, 0.32, 0.12] : t === TILE.WATERFALL ? [0.4, 0.15, 0.45] : t === TILE.MILK ? [0.6, 0.4, 0.9]
      : t === TILE.METERS ? [0.8, 0.62, 0.3] : t === TILE.AMP ? [0.25, 0.25, 0.32] : t === TILE.DAW ? [0.35, 0.38, 0.4]
      : t === TILE.WORD ? [0.8, 0.8, 0.8] : t === TILE.HEART ? [1, 0.3, 0.6] : GLOW[t] || (t >= TILE.DEFRAG ? [0.25, 0.45, 0.45] : [0.5, 0.5, 0.55]);
    const on = Math.min(1, s.t * 5), b = s.u.uBright.value * on;
    const w = s.u.uWall.value, wc = w > 0 ? [[0.3, 0.7, 0.2], [0.6, 0.45, 0.8], [0.8, 0.6, 0.7], [0.15, 0.6, 0.12], [0.6, 0.4, 0.9]][this.shared.uWallPic.value] : c;
    return c.map((v, i) => ((v * (1 - w) + wc[i] * w) * (1 - s.flash) + s.flash) * b);
  }
  update(dt, fx) {
    this.frame++;
    const calm = this.reduce, a = this.audio.image.data;
    for (let i = 0; i < 512; i++) {
      const sp = fx.spec ? fx.spec[Math.floor(i / 4)] : 0;
      a[i * 4] = sp * 255 * fx.alive;
      const w = fx.wavL ? fx.wavL[i] : 0; a[(512 + i) * 4] = (0.5 + 0.5 * w) * 255;
    }
    this.audio.needsUpdate = true;
    fx.word = this.word;
    const sh = this.shared; sh.uTime.value = fx.time; sh.uBeat.value = fx.beat; sh.uKick.value = fx.kick * fx.alive * (calm ? 0.3 : 1); sh.uMid.value = fx.mid * fx.alive; sh.uLevel.value = fx.level; sh.uCalm.value = calm ? 1 : 0;
    // the wall: the choreography's amount, or a moment's
    let wall = this.wall.amount, pic = this.wall.pic;
    const mo = this.moment;
    if (mo) { mo.t += dt; const k = Math.min(1, mo.t / mo.fade, (mo.secs - mo.t) / mo.fade); if (mo.t >= mo.secs) this.moment = null; else if (k > wall) { wall = Math.max(0, k); pic = mo.pic; } }
    sh.uWall.value = wall; sh.uWallPic.value = pic;
    this.wall.blink = Math.max(0, this.wall.blink - dt * 6);
    if (wall > 0.001 && pic === WALL.MILK) { this.viz.need('milk'); sh.uWallTex.value = this.viz.tex('milk'); }
    if (wall > 0.001 && pic === WALL.WORD) { this.wordPlate(this.word); sh.uWallTex.value = this.wordTex.t; }
    this.used.clear();
    const recent = this.frame - 3;
    for (const s of this.list) {
      s.t += dt; s.power += dt; s.flash *= Math.exp(-dt * 10);
      s.tear = calm ? 0 : Math.max(0, (s.tear || 0) - dt * 4); s.u.uTear.value = s.tear;
      s.u.uSwitch.value = s.t; s.u.uPower.value = s.power; s.u.uFlash.value = s.flash * (calm ? 0.3 : 1);
      s.u.uBright.value = 0.94 + (calm ? 0.04 : 0.2) * fx.kick * fx.alive;
      s.blink = Math.max(0, (s.blink || 0) - dt * 6); s.u.uBlink.value = Math.min(1, wall > 0.5 && pic === WALL.FACE && s.u.uWall === sh.uWall ? this.wall.blink : s.blink);
      const on = s.seen >= recent || s.t < 0.25;
      const gpu = (s.mode === MODE.TILE || s.mode === MODE.BARS) && GPU[s.tile];
      if (gpu) { s.u.uAtlas.value = this.viz.tex(gpu); if (on) this.viz.need(gpu); }
      else if (s.mode === MODE.TILE && on) this.used.add(s.tile);
    }
    this.performFaces(dt, fx, recent);
    this.viz.feed(dt, fx, calm, trk);
    // repaint the 2D tiles that are on a screen in view and whose picture changed (each upload costs the GPU); a
    // tile that has never been painted, or whose word just changed, goes first; at most four a frame
    const P = this.painter, todo = [];
    for (const t of this.used) { const T = this.tiles[t], sig = P.sig(t, fx); if (sig !== T.sig) todo.push([t, sig, !T.sig || t === TILE.WORD]); }
    todo.sort((x, y) => y[2] - x[2]);
    this.rr = (this.rr || 0) + 1;
    const fresh = todo.filter((d) => d[2]), rest = todo.filter((d) => !d[2]);
    const pick = [...fresh, ...rest.map((_, i) => rest[(i + this.rr) % rest.length])].slice(0, Math.max(4, fresh.length));
    for (const [t, sig] of pick) { const T = this.tiles[t]; T.sig = sig; P.x = T.x; T.x.save(); P.tile(t, fx); T.x.restore(); T.t.needsUpdate = true; }
    this.repainted = pick.length;
  }
  // the faces: the lead always (it is also the face in the sky and on the wall), the chorus where one is in view
  performFaces(dt, fx, recent) {
    // this frame's song time (perform() hands over the story after the screens have drawn, which would sing a frame late)
    const P = this.perf, st = P.songT != null && fx.songT != null ? fx.songT : P.songT, V = this.voice = fx.song ? (this.voice?.song === fx.song ? this.voice : new Voice(fx.song)) : null, L = this.lead;
    const live = P.playing && st != null;
    if (V && live && this.lastSongT != null && st > this.lastSongT && st - this.lastSongT < 0.5) {
      for (const s of V.snaps) if (s > this.lastSongT && s <= st) L.react('snap');                        // a cut-off "f-": the mouth snaps shut
      for (const c of fx.song.m.cues || []) if (c.t1 > this.lastSongT && c.t1 <= st && c.k > 0.5) L.react('gasp');   // the drop lands
    }
    this.lastSongT = live ? st : null;
    const mouth = V && live ? V.at(st) : { open: P.playing ? Math.max(0, fx.mid * fx.alive - 0.35) * 1.4 : 0, wide: 0.3 };   // a record with no map: the mids
    const hero = this.hero ||= this.list.find((s) => s.role === 'hero');
    const ctx = { mesh: hero?.mesh, lens: P.lens, record: P.record, beat: fx.beat, alive: fx.alive };
    if (hero && P.scene) {             // the lead's webcam (viz/era.js): sat on top of its monitor, looking past the deck into the room
      const R = this.viz.room ||= { scene: null, from: new THREE.Vector3(), at: new THREE.Vector3() }; R.scene = P.scene; R.lite = P.quality != null && P.quality < 2;
      hero.mesh.updateWorldMatrix(true, false); R.from.set(0, hero.h * 0.75, 0.06).applyMatrix4(hero.mesh.matrixWorld); R.at.copy(P.record).lerp(P.lens, 0.12);
    }
    ctx.mouth = mouth; L.update(dt, ctx);
    const lag = fx.song ? fx.song.m.beatLen : 0.44;
    for (const s of this.list) {
      if (s.mode !== MODE.FACE && s.mode !== MODE.FACES) continue;
      let A = L;
      if (s !== hero) {
        if (s.seen < recent && s.t > 0.25) continue;
        A = this.chorus.get(s);
        if (!A) { const k = this.chorus.size % 4; A = new Face({ seed: this.chorus.size + 1, ...TEMPER[k] }); A.kind = k; this.chorus.set(s, A); }
        // the chorus feels what the lead feels, each a little late and in its own way, and sings the hook a beat behind her
        const n = L.t - L.since > A.temper.lag ? L.name : L.prev || L.name; A.storyName = TEMPER[A.kind].map[n] || n;
        ctx.mesh = s.mesh; ctx.mouth = V && live ? V.at(st - lag - A.temper.lag * 0.2, true) : { open: mouth.open * 0.7, wide: mouth.wide }; A.update(dt, ctx);
      } else s.u.uBright.value *= L.dim;
      s.u.uFE.value.copy(A.E); s.u.uFM.value.copy(A.M); s.u.uFX.value.copy(A.X); s.u.uFY.value.copy(A.Y);
    }
  }
  // the wall's word, the whole frame wide: her neon-green condensed type on black (a white plate across every screen
  // only floods the room with white)
  wordPlate(word) {
    const w = (word || 'MY COMPUTER').replace(/[^A-Z0-9—' ]/gi, '').toUpperCase(), W = this.wordTex;
    const sig = `${w}|${document.fonts?.status}`; if (W.sig === sig) return; W.sig = sig;
    const x = W.x; x.fillStyle = '#050505'; x.fillRect(0, 0, 1024, 512); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(512, 270); x.font = '700 300px Oswald, Anton, sans-serif'; const mw = x.measureText(w).width; x.scale(Math.min(1, 940 / mw), 1.45); x.fillStyle = '#39ff2e'; x.fillText(w, 0, 0); x.restore();
    W.t.needsUpdate = true;
  }
}

// ---------- the atlas painter: one function per tile, each drawing at 384 x 288 ----------
const W = TW, H = TH;
const XP_BLUE = '#0a54e3', TAHOMA = 'Tahoma, Verdana, Segoe UI, sans-serif', MONO = '"VT323", "Lucida Console", monospace';
export class Painter {
  constructor(x) {
    this.x = x; this.cover = art.img;   // the visitor's own album art (art.js)
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
  // what a tile's picture depends on right now: it is repainted only when this changes
  sig(t, fx) {
    const f = document.fonts?.status === 'loaded' ? 'f' : 'n', T = fx.time, k = fx.kick * fx.alive, art_ = art.has() ? 'a' : '-';
    if ((t === TILE.COVER || t === TILE.TRIPLE) && !art.has()) t = TILE.NAME;
    switch (t) {
      case TILE.BIOS: return `${f}${Math.floor((T * 4) % 18)}|${Math.floor(T * 3) % 2}`;
      case TILE.BSOD: case TILE.NAME: return f;
      case TILE.SYSMSG: return `${f}${art_}${this.thumb ? Math.floor(T / 0.4) : 0}`;
      case TILE.COVER: return `${art_}${Math.floor(T * (k > 0.05 ? 15 : 4))}`;
      case TILE.WORD: return `${f}${fx.word}`;
      case TILE.WAVE: return `${f}${art_}${fx.song ? Math.floor((fx.songT || 0) / fx.song.m.dur * 120) : -1}`;
      case TILE.DESKTOP: case TILE.COPY: return `${f}${fx.hits % 6}|${Math.floor(T * 15)}`;
      case TILE.UEFI: return `${f}${(fx.hits || 0) % 6}`;
      case TILE.HEART: return `${f}${Math.round(k * 10)}`;
      case TILE.TRIPLE: return `${art_}${Math.floor(T * 6) % 3}|${Math.round(k * 5)}`;
      case TILE.CHAT: return `${f}${this.sung(fx)}|${Math.floor(T * 2) % 2}`;
      case TILE.IPOD: return `${f}${art_}${Math.floor(Math.max(0, fx.songT || 0))}|${fx.alive > 0.3}`;
      case TILE.VFD: { let b = ''; for (let i = 0; i < 12; i++) b += (fx.spec ? fx.spec[4 + i * 9] : 0) * fx.alive * 12 > i * 0.9 ? 1 : 0; return `${f}${Math.floor(T * 10)}|${b}`; }
    }
    return `${Math.floor(T * 15)}`;
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
  // how many of her words have been sung by now
  sung(fx) { const ws = fx.song?.m.lyrics?.words, t = fx.songT; if (!ws || t == null) return 0; let n = 0; for (const w of ws) if (w.t <= t) n++; return n; }
  // an instant-message window that says only what is true: her lines, each word typed in as she sings it
  chat(x, fx) {
    const who = trk().artist, ws = fx.song?.m.lyrics?.words || [], n = this.sung(fx), lines = [];
    for (const w of ws.slice(0, n)) { const l = lines[lines.length - 1]; if (l && l.line === w.line) l.words.push(w.w); else lines.push({ line: w.line, words: [w.w] }); }
    x.fillStyle = '#008080'; x.fillRect(0, 0, W, H);
    const a = win(x, 0, 0, W, H, `${who} - Instant Message`);
    x.fillStyle = '#000'; x.font = `11px ${SANS}`; x.fillText('File   Edit   Insert   People', a.x + 4, a.y + 10);
    sunken(x, a.x + 2, a.y + 16, a.w - 4, 158);
    x.save(); x.beginPath(); x.rect(a.x + 4, a.y + 18, a.w - 8, 154); x.clip();
    const show = lines.slice(-6), next = ws[n], typing = next && next.t - (fx.songT ?? 0) < 1.2 && show.length && next.line === show[show.length - 1].line;
    show.forEach((l, i) => {
      const y = a.y + 34 + i * 25; x.font = `bold 12px ${SANS}`; x.fillStyle = '#c00000'; const tag = `${who}: `; x.fillText(tag, a.x + 8, y);
      x.font = `13px ${SANS}`; x.fillStyle = '#000'; x.fillText(l.words.join(' '), a.x + 8 + x.measureText(tag).width + 6, y, a.w - 30 - x.measureText(tag).width);
    });
    x.restore();
    x.font = `11px ${SANS}`; x.fillStyle = '#000'; if (typing) x.fillText(`${who} is typing a message.`, a.x + 4, a.y + 188);
    sunken(x, a.x + 2, a.y + 194, a.w - 72, 56); if (Math.floor(fx.time * 2) % 2) { x.fillStyle = '#000'; x.fillRect(a.x + 8, a.y + 200, 1, 14); }
    button(x, a.x + a.w - 64, a.y + 194, 62, 26, 'Send'); button(x, a.x + a.w - 64, a.y + 224, 62, 26, 'Talk');
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
