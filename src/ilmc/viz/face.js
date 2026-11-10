// The :3 face, the only character in the room. The lead is the beige frankencomputer left of the deck; every other face
// on a screen is the chorus, and the enormous one in the drops' sky is the lead again.
//
// It sings: each syllable she sings is in the song map, measured off her vocal; the mouth opens into its vowel (a wide
// "a", a round "o"...) on the syllable's first frame and shuts when she stops, consonants close or purse the lips, long
// notes hold with a little vibrato, a cut-off "f-" snaps shut with a flinch, and her vocal chops in the builds make it
// chatter, one open-and-shut per chop.
// It feels: a handful of expressions (asleep, waking, curious, shy, delighted, love, wanting, overwhelmed, joy,
// crashed, dazed, blissful, frantic, declaring, sleepy). The continuous parts (lids, smile, blush, tilt) move on springs
// so they overshoot and settle; the eyes change shape only behind a blink, never by cross-fading.
// It looks at things: the lens, the record, a flash that just went off; between, small saccades like a living eye.
//   screens.lead.mood('love', 2)       hold an expression for 2 s (without secs: until the story moves on)
//   screens.lead.look('record', 1.5)   look at 'lens' | 'record' | a THREE.Vector3 (world) for 1.5 s
//   screens.lead.react('snap')         a one-shot: 'snap' (a cut-off word), 'flash', 'gasp', 'wink', 'love'
import * as THREE from 'three';

// ---------- the drawing ----------
// face(p, bg, E, M, X, Y): p is the screen position (screen height = 1, centred). The four vec4s are the performance:
//   E look x, look y, eye open (0 shut, 1 open, >1 wide), eye shape (0 slots, 1 ^ happy, 2 sleeping, 3 hearts, 4 > <, 5 X, 6 spirals, 7 stars)
//   M mouth open (below 0: the lips pressed shut), its vowel (-1 round "u" .. 1 wide "e"), smile (0 a flat line .. 1 the cat's :3), wobble
//   X blush, sweat, zz (asleep), head tilt (radians)
//   Y squash (+ flattened, - stretched), shake, heart beat (0..1), wink (0..1, the right eye)
export const FACE_GLSL = `
float sdTri(vec2 p, float r) { const float k = 1.7320508; p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0; p.x -= clamp(p.x, -2.0 * r, 0.0); return -length(p) * sign(p.y); }
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdHeart(vec2 p) { p.x = abs(p.x);
  if (p.y + p.x > 1.0) return length(p - vec2(0.25, 0.75)) - 0.35355;
  vec2 a = p - vec2(0.0, 1.0), b = p - 0.5 * max(p.x + p.y, 0.0); return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y); }
float fhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// the head moves as a whole: tilt about the chin, squash and stretch, a shiver
vec2 faceXf(vec2 p, vec4 X, vec4 Y, float t) {
  p.x += Y.y * 0.007 * sin(t * 71.0) * sin(t * 13.0);
  p.y -= 0.03; p.y += 0.06;
  float c = cos(X.w), s = sin(X.w); p = mat2(c, s, -s, c) * p;
  p.y -= 0.06;
  return p / vec2(1.0 + Y.x * 0.6, 1.0 - Y.x);
}
float faceD(vec2 p) { return sdTri(vec2(p.x * 0.92, -p.y * 1.05 + 0.08), 0.36) - 0.07; }
// one eye's outline as a distance (negative inside); side -1 left, +1 right
float eyeD(vec2 q, float st, float side, float open, float t) {
  if (st < 0.5) {                                                  // slots; the lid comes down from the top
    float o = clamp(open, 0.0, 1.35), hh = max(0.0055, 0.065 * min(o, 1.0) * (1.0 + 0.25 * max(o - 1.0, 0.0))), hw = 0.035 * (1.0 + 0.7 * max(o - 1.0, 0.0));
    return sdBox(q - vec2(0.0, -0.065 + hh), vec2(hw, hh), min(0.012, hh));
  }
  float sq = max(open, 0.07); q.y /= sq;                           // the other shapes blink by squashing flat
  float d;
  if (st < 1.5) { vec2 c = q - vec2(0.0, -0.035); d = c.y > 0.0 ? abs(length(c) - 0.045) - 0.011 : min(length(c - vec2(0.045, 0.0)), length(c + vec2(0.045, 0.0))) - 0.011; }
  else if (st < 2.5) { vec2 c = q - vec2(0.0, 0.02); d = c.y < 0.0 ? abs(length(c) - 0.042) - 0.01 : min(length(c - vec2(0.042, 0.0)), length(c + vec2(0.042, 0.0))) - 0.01; }
  else if (st < 3.5) d = sdHeart((q - vec2(0.0, -0.06)) / 0.115) * 0.115;
  else if (st < 4.5) { vec2 a = vec2(0.032 * side, 0.042), b = vec2(-0.03 * side, 0.0), cc = vec2(0.032 * side, -0.042); d = min(sdSeg(q, a, b), sdSeg(q, b, cc)) - 0.011; }
  else if (st < 5.5) d = min(sdSeg(q, vec2(-0.034, -0.04), vec2(0.034, 0.04)), sdSeg(q, vec2(-0.034, 0.04), vec2(0.034, -0.04))) - 0.01;
  else if (st < 6.5) { float r = length(q), a = atan(q.y, q.x) * side; d = max((abs(fract(r / 0.017 - a / 6.2832 + t * 1.3) - 0.5) - 0.24) * 0.017, r - 0.052); }
  else { vec2 a = abs(q) / 0.07; d = (pow(pow(a.x, 0.5) + pow(a.y, 0.5), 2.0) - 1.0) * 0.03; }
  return d * sq;
}
vec3 faceAt(vec2 p, vec3 bg, vec4 E, vec4 M, vec4 X, vec4 Y, float t) {
  float d = faceD(p), aa = fwidth(d) * 1.2;
  vec3 c = bg;
  c *= 1.0 - 0.5 * smoothstep(0.08, -0.02, faceD(p - vec2(0.02, -0.03)));     // drop shadow behind the plate
  vec3 ink = vec3(0.06, 0.065, 0.08);
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
    // blush: two warm patches under the eyes, with the three little strokes
    for (int i = 0; i < 2; i++) {
      vec2 e = (p - vec2(i == 0 ? -0.19 : 0.19, -0.012)) / vec2(0.065, 0.032); float r = length(e);
      chrome = mix(chrome, vec3(1.0, 0.36, 0.52), smoothstep(1.0, 0.25, r) * X.x * 0.8);
      float h = abs(fract((p.x * 0.8 + p.y) * 55.0) - 0.5); chrome = mix(chrome, vec3(0.8, 0.12, 0.3), step(h, 0.16) * step(r, 0.62) * step(abs(e.y), 0.5) * X.x * 0.85);
    }
    c = mix(c, chrome, smoothstep(aa, -aa, d));
    // the eyes: where they look, the head turns a little too
    vec2 lk = E.xy * vec2(0.022, 0.016);
    for (int i = 0; i < 2; i++) {
      float side = i == 0 ? -1.0 : 1.0, op = E.z * (i == 1 ? 1.0 - Y.w : 1.0);
      vec2 q = (p - vec2(0.115 * side, 0.068) - lk) / 1.22;          // features drawn a size up, so they read across the room
      float ed = eyeD(q, E.w, side, op, t) * 1.22, ea = fwidth(ed) + 1e-4;
      vec3 col = ink;
      if (E.w > 2.5 && E.w < 3.5) { col = vec3(1.0, 0.18, 0.42) * (1.0 + 0.5 * Y.z); c = mix(c, ink, smoothstep(ea, -ea, ed - 0.007)); }   // hearts, outlined
      if (E.w > 6.5) { col = vec3(1.0, 0.93, 0.55) * (1.2 + 0.6 * Y.z); c = mix(c, ink, smoothstep(ea, -ea, ed - 0.006)); }             // stars
      c = mix(c, col, smoothstep(ea, -ea, ed));
      if (E.w < 0.5 && op > 0.45) c = mix(c, vec3(0.92, 0.95, 1.0), smoothstep(0.0095, 0.006, length(q - vec2(-0.012, -0.018 + 0.03 * min(op, 1.0)))) * smoothstep(0.45, 0.7, op));  // the catchlight
      if (E.w > 2.5 && E.w < 3.5) c = mix(c, vec3(1.0, 0.85, 0.9), smoothstep(0.012, 0.006, length(q - vec2(-0.02, 0.01))) * 0.9);
    }
    // the mouth: the cat's :3, two little arcs side by side (a flat line as the smile goes). It opens downward from under
    // them: the arcs stay as its upper lip, the opening first shows under the point where they meet, then widens to their
    // outer ends and drops a round jaw, so at every amount it is one shape. Wide vowels stretch it, round ones pucker the
    // arcs together; pressed shut (m, b, p), the arcs flatten a little.
    vec2 m = (p - lk * 0.45 - vec2(0.0, -0.05)) / 1.18 + vec2(0.0, -0.05);
    if (abs(m.x) < 0.16 && m.y > -0.3 && m.y < 0.06) {
      float o = clamp(M.x, 0.0, 1.3), o1 = min(o, 1.0), pr = clamp(-M.x, 0.0, 1.0), sm = clamp(M.z, 0.0, 1.0);
      float r = 0.033 * (1.0 + 0.2 * max(M.y, 0.0) * o1 - 0.3 * max(-M.y, 0.0) * o1);              // one arc's half-width
      float D = max(0.002, r * sm * (1.0 - 0.38 * o1) * (1.0 - 0.45 * pr));                         // how deep the arcs dip
      float th = 0.0085 * (1.0 + 0.2 * pr);
      vec2 q = vec2(m.x, m.y - (-0.04 - 0.012 * (1.0 - sm)) - M.w * 0.008 * sin(m.x * 120.0 + t * 7.0));
      // the lip: each arc is a piece of a circle through the arc's two ends, sagging D below them
      float Rc = (r * r + D * D) / (2.0 * D), ax = abs(q.x), sinT = r / Rc;
      vec2 v = vec2(ax - r, q.y - (Rc - D));
      float dl = v.y < 0.0 && abs(v.x) <= sinT * length(v) ? abs(length(v) - Rc) : min(length(q), length(vec2(ax - 2.0 * r, q.y)));
      // below the lip (signed, + under it), measured square to the arc
      float u = clamp(ax - r, -r, r), top = (Rc - D) - sqrt(max(Rc * Rc - u * u, 0.0)), sl = u / max(sqrt(max(Rc * Rc - u * u, 0.0)), Rc * 0.16);
      float below = ax < 2.0 * r ? (top - q.y) / sqrt(1.0 + sl * sl) : -dl;
      // the jaw: half an ellipse hanging from the lip's two ends
      float h = 0.125 * o * (1.0 - 0.3 * max(M.y, 0.0)) + 1e-4, W = 2.0 * r;
      vec2 ab = vec2(W, h), jp = vec2(q.x, min(q.y, 0.0)); float k0 = length(jp / ab), k1 = length(jp / (ab * ab));
      float jaw = q.y > 0.0 ? max(q.y, k0 * (k0 - 1.0) / max(k1, 1e-5)) : k0 * (k0 - 1.0) / max(k1, 1e-5);
      float inside = min(below, -jaw), ma = min(fwidth(inside), 0.004) + 1e-4;                       // (capped: a fold or a branch has no width)
      if (o > 0.0) {
        c = mix(c, vec3(0.16, 0.03, 0.06), smoothstep(-ma, ma, inside));
        float tg = length((q - vec2(0.0, -h * 0.92)) / vec2(W * 0.52, h * 0.45 + 0.004)) - 1.0;   // the tongue
        c = mix(c, vec3(0.95, 0.38, 0.5), smoothstep(0.05, -0.05, tg) * smoothstep(-ma, ma, inside - th * 0.5));
      }
      float edge = min(dl, max(abs(jaw), -below)), la = min(fwidth(edge), 0.004) + 1e-4;             // the lip, and the jaw's rim where it is open
      c = mix(c, ink, smoothstep(la, -la, edge - th));
    }
    // sweat: a drop by the brow, sliding
    vec2 sw = (p - vec2(0.27, 0.17 - 0.04 * fract(t * 0.8))) / 1.5;
    float sd = min(length(sw) - 0.021, max(sdSeg(sw, vec2(0.0), vec2(0.0, 0.04)) - 0.021 * (1.0 - clamp(sw.y / 0.042, 0.0, 1.0)), -sw.y));
    c = mix(c, ink, smoothstep(aa, -aa, sd - 0.005) * X.y);
    c = mix(c, vec3(0.55, 0.85, 1.0), smoothstep(aa, -aa, sd) * X.y);
    c = mix(c, vec3(1.0), smoothstep(0.007, 0.003, length(sw - vec2(-0.007, 0.004))) * X.y);
  }
  // zz, rising off the top corner while it sleeps
  if (X.z > 0.01) for (int i = 0; i < 3; i++) {
    float ph = fract(t * 0.32 + float(i) / 3.0), s = 0.022 * (0.6 + 0.8 * ph);
    vec2 z = p - vec2(0.3 + 0.08 * ph + 0.02 * sin(ph * 6.0), 0.24 + 0.22 * ph);
    float zd = min(min(sdSeg(z, vec2(-s, s), vec2(s, s)), sdSeg(z, vec2(s, s), vec2(-s, -s))), sdSeg(z, vec2(-s, -s), vec2(s, -s))) - 0.0055;
    c = mix(c, vec3(0.85, 0.9, 1.0), smoothstep(fwidth(zd), -fwidth(zd), zd) * X.z * smoothstep(1.0, 0.6, ph) * smoothstep(0.0, 0.15, ph));
  }
  return c;
}
vec3 face(vec2 p, vec3 bg, vec4 E, vec4 M, vec4 X, vec4 Y, float t) { return faceAt(faceXf(p, X, Y, t), bg, E, M, X, Y, t); }
`;

// ---------- the expressions ----------
// eye: shape (as above); open: lids (1 open); smile/wavy: the mouth at rest; grin: how far the mouth hangs open at rest;
// blush, sweat, zz, tilt, shake; bounce: how much it hops on the beat; blink: blinks a second; look: what it looks at;
// sway: the head rocks; dim: how bright its screen is (asleep, the tube is turned down)
const BASE = { eye: 0, open: 1, smile: 0.95, wavy: 0, grin: 0, blush: 0, sweat: 0, zz: 0, tilt: 0, shake: 0, bounce: 0.15, blink: 0.3, look: 'things', sway: 0, dim: 1, slow: 0 };
export const EXPR = {
  asleep:      { eye: 2, smile: 0.75, tilt: -0.08, bounce: 0, blink: 0, look: 'none', zz: 1, dim: 0.55, slow: 1 },
  waking:      { open: 0.42, smile: 0.6, wavy: 0.2, tilt: -0.05, bounce: 0, blink: 0.9, look: 'wander', dim: 0.85, slow: 0.5 },
  curious:     { open: 1.14, smile: 0.9, tilt: 0.09, bounce: 0.12, blink: 0.3, look: 'things' },
  shy:         { open: 0.8, smile: 0.55, wavy: 0.6, blush: 1, tilt: -0.11, bounce: 0.08, blink: 0.45, look: 'away' },
  delighted:   { eye: 1, smile: 1, blush: 0.45, tilt: 0.05, bounce: 0.55, look: 'lens' },
  love:        { eye: 3, smile: 1, blush: 0.8, bounce: 0.5, blink: 0.15, look: 'lens' },
  wanting:     { open: 1.22, smile: 0.75, wavy: 0.25, blush: 0.75, sweat: 0.25, shake: 0.15, bounce: 0.35, blink: 0.2, look: 'lens' },
  overwhelmed: { eye: 4, smile: 0.1, wavy: 1, blush: 0.6, sweat: 1, shake: 0.7, bounce: 0.35, blink: 0, look: 'none' },
  joy:         { eye: 1, smile: 1, grin: 0.3, blush: 0.4, bounce: 1, blink: 0, look: 'lens' },
  ecstasy:     { eye: 7, smile: 1, grin: 0.4, blush: 0.55, bounce: 1, blink: 0.1, look: 'lens' },
  crashed:     { eye: 5, smile: 0, wavy: 0, tilt: 0.2, bounce: 0, blink: 0, look: 'none' },
  dazed:       { eye: 6, smile: 0.2, wavy: 0.8, tilt: 0.08, bounce: 0, blink: 0, look: 'none', sway: 1 },
  blissful:    { eye: 1, smile: 1, blush: 0.6, tilt: 0.04, bounce: 0.25, blink: 0, look: 'none', sway: 0.6, slow: 0.4 },
  frantic:     { open: 1.28, smile: 0.4, wavy: 0.5, sweat: 0.8, shake: 0.35, bounce: 0.5, blink: 0.15, look: 'dart' },
  declare:     { open: 1.1, smile: 0.95, blush: 0.5, bounce: 0.6, blink: 0.2, look: 'lens' },
  sleepy:      { open: 0.38, smile: 0.7, tilt: -0.07, bounce: 0, blink: 0.3, look: 'drift', dim: 0.85, slow: 1 },
};
for (const k in EXPR) EXPR[k] = { ...BASE, ...EXPR[k] };

// The story, in song time: what the lead feels through the song (the acts are in assets/ilmc/fmc.json). A mood can be a
// function of the moment (the builds tighten as they go).
const STORY = [
  [0, 'asleep'], [1.35, 'waking'], [2.3, 'curious'],           // the room powers on; "I"
  [3.5, 'shy'], [15.7, 'delighted'], [16.9, 'curious'],        // "I wanna f-"... "my computer"
  [19.35, 'delighted'], [20.1, 'love'], [23.9, 'delighted'],   // "knows me better", "it says my name", "does it better"
  [27.5, 'shy'], [29.5, 'wanting'], [34.5, 'love'], [37.9, 'overwhelmed'],   // the first build
  [42.12, 'joy'], [66.83, 'crashed'], [68.6, 'dazed'],          // drop 1; the blue screen; the hung window
  [70.36, 'blissful'], [84.1, 'shy'], [85.6, 'blissful'],      // the hill; the sun goes down through "I wanna f-"
  [96.83, 'frantic'], [117, 'overwhelmed'], [119.5, 'frantic'], [124.6, 'overwhelmed'],   // the long build
  [126.83, 'ecstasy'], [151.53, 'overwhelmed'], [155.06, 'declare'],   // drop 2; the tiles; the white
  [181.5, 'sleepy'], [188.0, 'asleep'],                         // the room powers down; the last screen falls asleep
];
// lines the chorus sings with her (the hook)
const HOOK = /computer|world|name/i;

// ---------- the voice: syllables and chops along the song ----------
// Her syllables come from the song map: each word has its syllables measured off the vocal ("s": [[start, end], ...],
// seconds), and a word without them is cut into vowel groups and spread over its time, as before. The mouth opens on a
// syllable's first frame, holds while she holds the note, and shuts when she stops. Consonants shape the edges: m, b, p
// press the lips shut (b and p before the sound, m while she hums it), f and v tuck them shut before it, w puckers; between two
// syllables joined by any other consonant the jaw only half closes, so a run of words reads as a run, not a chatter.
const VOWEL = { a: [1, 0.45], e: [0.7, 1], i: [0.72, 0.9], y: [0.72, 0.9], o: [0.92, -0.7], u: [0.66, -1] };
const lips = (c) => /[mbp]/.test(c) ? (/m/.test(c) ? 'm' : 'b') : /[fv]/.test(c) ? 'f' : /w/.test(c) ? 'w' : '';
// a word's syllables as sounds: the vowel group of each, the consonants it starts with and (the last) ends with
function sounds(clean) {
  const w = clean.replace(/-/g, ''), G = [...w.matchAll(/[aeiouy]+/g)].map((m) => [m.index, m[0]]);
  if (!G.length) G.push([0, 'u']);
  if (G.length > 1 && /e$|es$/.test(w) && G[G.length - 1][1] === 'e') G.pop();                  // "name", "'cause"
  if (w === 'i') G[0][1] = 'ai';
  return G.map(([at, v], k) => {
    const from = k ? G[k - 1][0] + G[k - 1][1].length : 0, split = k && at - from >= 2 ? from + 1 : from;   // com|pu|ter, wan|na
    const sh = v === 'ai' || v === 'ay' ? [0.95, 0.5] : v === 'au' || v === 'ou' ? [0.95, -0.4] : VOWEL[v[0]];
    const tail = k === G.length - 1 ? w.slice(at + v.length).replace(/e?s?$/, (x) => (x === 's' ? 's' : '')) : '';
    return { open: sh[0], wide: sh[1], on: lips(w.slice(split, at)), off: /^[^aeiouy]*[mbp]/.test(tail) ? 'm' : '' };
  });
}
export class Voice {
  constructor(song) {
    this.song = song; const m = song.m, L = m.lyrics; this.syl = []; this.snaps = [];
    if (L) {
      const W = [...L.words].sort((a, b) => a.t - b.t);
      W.forEach((w, i) => {
        const next = W[i + 1]?.t ?? w.t + 1.2, end = L.lines[w.line]?.end ?? next, clean = w.w.toLowerCase().replace(/[^a-z-]/g, ''), cut = /-$/.test(clean);
        const hook = HOOK.test(L.lines[w.line]?.text || ''), S = sounds(clean);
        let spans = w.s;
        if (!spans) {                                       // no measured syllables: spread the vowel groups over the word
          if (cut) spans = [[w.t, w.t + 0.13]];
          else {
            const n = S.length, avail = Math.max(0.12, Math.min(next, end + 0.15) - w.t - 0.04), total = Math.min(avail, n * 0.2 + 0.6), each = Math.min(0.2, total / n);
            spans = S.map((_, k) => [w.t + each * k, k < n - 1 ? w.t + each * (k + 1) : w.t + Math.max(each * k + 0.08, total)]);
          }
        }
        spans.forEach(([t0, t1], k) => {
          const sh = S[Math.min(k, S.length - 1)], again = k >= S.length;   // past its vowels: the word again (a stutter, a chopped held note)
          const v = cut ? (/u/.test(clean) ? [0.66, -0.8] : [0.5, 0.25]) : [sh.open, sh.wide];
          this.syl.push({ t0, t1, open: v[0], wide: v[1], on: again || cut ? lips(clean[0]) : sh.on, off: again || cut ? '' : sh.off, cut, hook });
        });
        if (cut) this.snaps.push(spans[spans.length - 1][1]);   // "f-": when she finally cuts it off, the face flinches
      });
      this.syl.sort((a, b) => a.t0 - b.t0);
      // how each syllable lets go: shut (the next starts on closed lips, or it ends on m/b/p), half way (a tongue consonant
      // into the next), or all the way after she stops
      this.syl.forEach((s, i) => {
        const n = this.syl[i + 1], join = n && n.t0 - s.t1 < 0.04;
        s.end = s.off === 'm' ? s.t1 - Math.min(0.07, 0.25 * (s.t1 - s.t0)) : s.t1;
        if (n && (n.on === 'b' || n.on === 'f') && n.t0 - s.end < 0.06) s.end = Math.min(s.end, n.t0 - 0.04);   // b, p, f: the lips meet before the sound
        s.end = Math.max(s.t0 + 0.04, s.end);
        s.floor = join && (!n.on || n.on === 'w') && s.off !== 'm' ? 0.32 : 0;
        s.until = join ? n.t0 : s.end;
        s.rel = s.cut ? 0.017 : s.floor ? 0.05 : 0.034;
      });
    }
    this.chops = (m.chops || []).slice().sort((a, b) => a - b);
  }
  // the map's mid band around t, smoothed (her voice sits there, among the synths): how hard she is singing
  push(t) { const s = this.song, f = Math.round(t * s.m.fps); let v = 0; for (let k = -3; k <= 3; k++) v += s.mid[Math.max(0, Math.min(s.mid.length - 1, f + k))]; return v / 7 / 255; }
  // the mouth at song time t: { open, wide, press (lips shut on a consonant), active (she is mid-phrase) }; hookOnly: only
  // the lines the chorus knows
  at(t, hookOnly = false) {
    let open = 0, wide = 0, press = 0, active = false, sung = false;
    const S = this.syl; let lo = 0, hi = S.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (S[mid].t0 <= t) lo = mid + 1; else hi = mid; }
    for (let i = Math.max(0, lo - 3); i < Math.min(S.length, lo + 1); i++) {
      const s = S[i]; if (hookOnly && !s.hook) continue;
      if (t >= s.t0 - 0.06 && t < s.until + 0.25) active = true;
      if (t >= s.t0 - 0.06 && t < s.until + s.rel) sung = true;
      if (t < s.t0 - 0.05 || t > s.until + s.rel) continue;
      const hold = s.on === 'm' ? Math.min(0.045, 0.3 * (s.t1 - s.t0)) : 0, a0 = s.t0 + hold;
      if (t < a0) { if (s.on && s.on !== 'w' && t >= s.t0 - (s.on === 'm' ? 0 : 0.05)) press = 1; continue; }   // the consonant: lips together
      const a = Math.min(1, 0.65 + (t - a0) / 0.03);                     // most of the way on its first frame, all of it by the next
      const r = t <= s.end - s.rel ? 1 : t <= s.end ? (s.end - t) / s.rel : 0;
      let o = s.open * a * Math.max(s.floor && t < s.until ? s.floor : 0, r), wd = s.wide;
      if (s.on === 'w' && t - a0 < 0.04) { o = Math.min(o, 0.42); wd = -1; }   // "w": a pucker first
      const held = t - s.t0;
      if (s.t1 - s.t0 > 0.35) o *= (0.88 + 0.12 * Math.sin(held * 29)) * (1 - 0.2 * Math.min(1, held / 1.4));   // a held note: vibrato, easing off
      if (o > open) { open = o; wide = wd; }
      if (r <= 0 && t < s.until && (s.off === 'm' || /[mbf]/.test(S[i + 1]?.on || ''))) press = 1;
    }
    if (!hookOnly && !sung) {                              // her chops (not while she sings a word): one quick open-and-shut each, shut before the next
      const C = this.chops; let l = 0, h = C.length; while (l < h) { const mid = (l + h) >> 1; if (C[mid] <= t) l = mid + 1; else h = mid; }
      const c = C[l - 1], g = Math.min(0.2, (C[l] ?? c + 0.2) - c), up = Math.min(0.055, g * 0.5), shut = Math.min(0.085, g * 0.8);
      if (c != null && t - c < shut) { const k = t - c, o = 0.55 * (k < up ? 1 : (shut - k) / (shut - up)); if (o > open) { open = o; wide = l % 2 ? 0.7 : -0.5; press = 0; } active = true; }
    }
    if (open > 0) { open *= 0.8 + 0.35 * Math.min(1, this.push(t) * 1.7); press = 0; }
    return { open: Math.min(1.1, open), wide, press, active };
  }
}

// a damped spring: overshoots a little and settles, which is what gives a change of face its weight
class Spring { constructor(v) { this.v = v; this.d = 0; } step(to, dt, w = 11, z = 0.5) { const h = Math.min(dt, 0.04); this.d += (w * w * (to - this.v) - 2 * z * w * this.d) * h; this.v += this.d * h; return this.v; } }

// ---------- the performer ----------
// temper: how this face differs from the lead (the chorus): lag (s behind the lead's feelings), amp (mouth), bounce,
// blush, lids, blinks. All faces share one drawing.
export class Face {
  constructor(temper = {}) {
    this.temper = { lag: 0, amp: 1, bounce: 1, blush: 0, lids: 1, blinks: 1, seed: 0, ...temper };
    this.E = new THREE.Vector4(0, 0, 1, 2); this.M = new THREE.Vector4(0, 0, 0.75, 0); this.X = new THREE.Vector4(0, 0, 0, 0); this.Y = new THREE.Vector4();
    this.name = 'asleep'; this.storyName = 'asleep'; this.since = 0; this.hold = null; this.t = 0;
    this.eye = 2; this.wantEye = 2; this.lid = 1; this.blinkT = 9; this.nextBlink = 1; this.swapAt = -1;
    this.sp = {}; for (const k of ['open', 'smile', 'wavy', 'grin', 'blush', 'sweat', 'zz', 'tilt', 'shake', 'bounce', 'dim']) this.sp[k] = new Spring(EXPR.asleep[k]);
    this.lk = new THREE.Vector2(); this.lkTo = new THREE.Vector2(); this.lkNext = 0; this.lkOver = null; this.peek = 0;
    this.squash = new Spring(0); this.wink = 0; this.jolt = 0; this.gasp = 0; this.flinch = 0; this.dim = 0.55;
    this._v = new THREE.Vector3(); this.R = mulberry(1 + this.temper.seed * 977);
  }
  // ---- the API ----
  mood(name, secs) { if (!EXPR[name]) return; if (secs) this.hold = { name, until: this.t + secs }; else { this.hold = null; this.storyName = name; } }
  look(target, secs = 1.2) { this.lkOver = { target, until: this.t + secs }; }
  react(kind) {
    if (kind === 'snap') { this.squash.d -= 2.2; this.flinch = 0.16; this.sp.blush.d += 3; this.sp.tilt.d -= 1.2; }
    else if (kind === 'flash') { this.flinch = 0.2; this.squash.d += 1.5; this.look('lens', 1.4); }
    else if (kind === 'gasp') { this.gasp = 0.45; this.squash.d -= 3; }
    else if (kind === 'wink') this.wink = 0.5;
    else if (kind === 'love') this.mood('love', 2.2);
  }
  // the lead's story (song time), the build-ups' grip on it, and what the room is doing; at == null: no song map
  follow(songT, ctx = {}) {
    if (songT == null) { this.storyName = !ctx.playing ? 'asleep' : ctx.sky > 0.5 ? 'joy' : 'curious'; return; }
    let n = STORY[0][1]; for (const [t, m] of STORY) if (songT >= t) n = m;
    if (n === 'ecstasy' && ctx.bar != null && ctx.bar % 4 >= 2) n = 'love';             // drop 2: stars, then hearts, two bars each
    if (!ctx.playing && n !== 'asleep') n = ctx.alive > 0.05 ? n : 'sleepy';
    this.storyName = n;
  }
  get current() { return this.hold && this.t < this.hold.until ? this.hold.name : this.storyName; }

  // dt; ctx: { mesh (the screen, for where things are), lens, record (world positions), beat (float), alive, mouth { open, wide }, time, pop }
  update(dt, ctx) {
    this.t += dt; const R = this.R, T = this.temper;
    let name = this.current;
    if (name !== this.name) { this.prev = this.name; this.name = name; this.since = this.t; }
    const ex = EXPR[name] || EXPR.curious;
    // the eyes change shape only while they are shut
    if (ex.eye !== this.wantEye) { this.wantEye = ex.eye; if (this.blinkT > 0.2) { this.blinkT = 0; this.blinkLen = ex.slow > 0.5 || this.eye === 2 ? 0.5 : 0.17; } }
    // blinking: at random, now and then twice
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      const rate = ex.blink * T.blinks;
      if (rate > 0 && this.eye === ex.eye) { this.blinkT = 0; this.blinkLen = ex.slow > 0.5 ? 0.55 : 0.16; }
      this.nextBlink = rate > 0 ? (R() < 0.22 ? 0.25 : (0.4 + R() * 1.6) / rate) : 0.5;
    }
    this.blinkT += dt;
    { const L = this.blinkLen || 0.16, k = this.blinkT / L;               // shut fast, open slower
      this.lid = k >= 1 ? 1 : k < 0.35 ? 1 - k / 0.35 : k < 0.45 ? 0 : (k - 0.45) / 0.55;
      if (k >= 0.35 && k < 1 && this.eye !== this.wantEye) this.eye = this.wantEye;
      if (k >= 1 && this.eye !== this.wantEye) this.eye = this.wantEye; }
    if (this.flinch > 0) { this.flinch -= dt; this.lid = Math.min(this.lid, 0.25); }
    // the continuous parts, on springs
    const sp = this.sp, w = ex.slow ? 6 : 11;
    for (const k in sp) sp[k].step(ex[k] + (k === 'blush' ? T.blush : 0), dt, k === 'tilt' || k === 'open' ? w : w * 0.8, 0.45);
    // looking
    const target = this.lkOver && this.t < this.lkOver.until ? this.lkOver.target : ex.look;
    this.lkNext -= dt;
    if (target === 'none') this.lkTo.set(0, name === 'asleep' || name === 'sleepy' ? -0.4 : 0);
    else if (target === 'lens' || target === 'record' || target?.isVector3) { if (this.lkNext <= 0) { this.aim(target, ctx); this.lkTo.x += (R() - 0.5) * 0.25; this.lkTo.y += (R() - 0.5) * 0.2; this.lkNext = 0.4 + R() * 1.2; } }
    else if (target === 'things') { if (this.lkNext <= 0) { const r = R(); r < 0.45 ? this.aim('lens', ctx) : r < 0.75 ? this.aim('record', ctx) : this.lkTo.set(R() * 2 - 1, R() * 1.4 - 0.7); this.lkNext = 0.7 + R() * 1.8; } }
    else if (target === 'away') {                          // shy: eyes down and to the side, and every so often a peek at the lens
      if (this.lkNext <= 0) { this.peek = R() < 0.4 ? 0.45 : 0; this.lkNext = 1.2 + R() * 1.6; }
      if (this.peek > 0) { this.peek -= dt; this.aim('lens', ctx); } else this.lkTo.set(-0.85, -0.75);
    }
    else if (target === 'wander') { if (this.lkNext <= 0) { this.lkTo.set(R() * 1.6 - 0.8, R() * 1.0 - 0.5); this.lkNext = 0.8 + R() * 1.5; } }
    else if (target === 'dart') { if (this.lkNext <= 0) { R() < 0.3 ? this.aim('lens', ctx) : this.lkTo.set(R() * 2 - 1, R() * 2 - 1); this.lkNext = 0.12 + R() * 0.3; } }
    else if (target === 'drift') { if (this.lkNext <= 0) { this.lkTo.set(R() * 0.8 - 0.4, -0.5 - R() * 0.4); this.lkNext = 1.5 + R() * 2; } }
    this.lk.lerp(this.lkTo, 1 - Math.exp(-dt * (ex.slow ? 6 : 30)));           // saccades: a jump, then still
    // the beat: a hop on every beat in the happy moods; asleep, it breathes
    const ph = ctx.beat != null ? ctx.beat - Math.floor(ctx.beat) : 0, be = Math.exp(-ph * 7) * (ctx.alive ?? 1) * T.bounce;
    this.squash.step(0, dt, 16, 0.35);
    const breathe = name === 'asleep' || name === 'sleepy' ? 0.025 * Math.sin(this.t * 1.7) : 0;
    this.gasp = Math.max(0, this.gasp - dt); this.wink = Math.max(0, this.wink - dt);
    // the voice
    const mo = ctx.mouth || { open: 0, wide: 0 }, am = T.amp * (name === 'asleep' ? 0.25 : name === 'crashed' ? 0.3 : 1);
    let open = mo.open * am, wide = mo.wide;
    if (this.gasp > 0) { open = Math.max(open, 0.9 * Math.min(1, this.gasp / 0.15)); wide = -0.8; }
    if (!mo.active) open = Math.max(open, sp.grin.v * (0.7 + 0.3 * be));      // a grin hangs open only between phrases: singing, the consonants close it
    const sway = ex.sway ? Math.sin(this.t * 1.3) * 0.07 * ex.sway : 0;
    this.E.set(this.lk.x, this.lk.y, Math.max(0, sp.open.v * T.lids) * this.lid, this.eye);
    // M.x below zero is the lips pressed shut (on m, b, p, f); the :3 is the upper lip at every opening, so the smile stays its own
    this.M.set(open > 0.004 ? open : -(mo.press || 0), wide, sp.smile.v, sp.wavy.v * (1 - Math.min(1, open * 2)));
    this.X.set(Math.max(0, Math.min(1, sp.blush.v)), Math.max(0, sp.sweat.v), Math.max(0, sp.zz.v), sp.tilt.v + sway);
    this.Y.set(0.07 * be * sp.bounce.v + this.squash.v * 0.05 + breathe, Math.max(0, sp.shake.v) * (1 + 0.6 * be), be, Math.min(1, this.wink * 4) * (this.wink > 0.12 ? 1 : this.wink / 0.12));
    this.dim = Math.max(0.3, Math.min(1, sp.dim.v));
  }
  // where a thing in the room is, as a look: the target in the screen's own frame
  aim(target, ctx) {
    const p = target?.isVector3 ? target : ctx[target]; if (!p || !ctx.mesh) { this.lkTo.set(0, 0); return; }
    const v = ctx.mesh.worldToLocal(this._v.copy(p)), d = Math.max(1e-3, v.length());
    this.lkTo.set(Math.max(-1, Math.min(1, v.x / d * 2.4)), Math.max(-1, Math.min(1, v.y / d * 2.4)));
  }
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
