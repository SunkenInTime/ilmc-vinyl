// The camera. The deck and the room are drawn, in linear light, into one offscreen HDR picture with a depth buffer;
// this turns that into a photograph from a cheap 2000s digital camera, then into a music video:
//   1. contact shading from the depth buffer (horizon-based, at half size, denoised over its own noise pattern,
//      brought back up along depth edges)
//   2. motion blur from the depth buffer and where the camera was a frame ago (a cut leaves no trail)
//   3. a lens: depth of field with a six-bladed aperture, a foreground that blurs over what is behind it, cat's-eye
//      discs and soft focus toward the corners of a wide lens
//   4. light in the air: haze that the screens glow in, the flash lighting the dust in front of the lens, shafts from
//      the sun (and from the white), glow with film halation, star streaks, the sun's lens flare, dirt on the glass
//   5. the film: exposure, one tone curve that keeps hues, a grade for each act
//   6. the music-video treatment over the developed picture: flash frames, chromatic split, zoom smear, the triptych,
//      glitch blocks (and JPEG blocking), PS1 pixels, afterimages, sensor noise, the barrel of the lens, sharpening
// Quality 2 does all of it; 1 drops the lens (depth of field, streaks, ghosts); 0 (phones, weak GPUs) also drops
// contact shading, motion blur, the air's shafts and flare, and antialiasing. Nothing here keeps a history, so a hard
// cut is clean on its first frame. Every shader is built before the song plays; tiers and effects switch on uniforms.
import * as THREE from 'three';

const QUAD_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const HEAD = `precision highp float; precision highp int; varying vec2 vUv;
const float PI = 3.14159265;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
uint hash3(vec2 p, float k) { return pcg(uint(int(p.x) + 8192) + pcg(uint(int(p.y) + 8192) + pcg(uint(k)))); }
float rnd(vec2 p, float k) { return float(hash3(p, k)) * (1.0 / 4294967295.0); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
#define TEX(t, p) textureLod(t, p, 0.0)
`;
// distance along the view axis from the depth buffer (the sky is never written: 1e4), and back to a view-space point
const DEPTH = `uniform vec4 uPK; uniform vec2 uPZ;
float linZ(float d) { return d >= 0.999999 ? 1e4 : uPZ.y / (d * 2.0 - 1.0 + uPZ.x); }
vec3 viewAt(vec2 uv, float z) { return vec3(z * (uv.x * 2.0 - 1.0 + uPK.z) / uPK.x, z * (uv.y * 2.0 - 1.0 + uPK.w) / uPK.y, -z); }
`;

// ---- 1. contact shading ----
const ZH = HEAD + DEPTH + `uniform sampler2D tDepth;
void main() { ivec2 s = textureSize(tDepth, 0) - 1, p = min(ivec2(gl_FragCoord.xy) * 2, s); gl_FragColor = vec4(linZ(texelFetch(tDepth, p, 0).x)); }`;
// ground-truth ambient occlusion (Jimenez et al. 2016): in a few slices through each pixel, find how far up the
// horizon reaches on either side and integrate the visible arc against the normal. The slices and steps are offset in a
// 4x4 pattern that the denoiser below sums over exactly, so the result is smooth and does not crawl.
const GTAO = HEAD + DEPTH + `uniform sampler2D tZ; uniform vec2 uHalf, uFall; uniform float uRadius, uMaxPx, uSlices, uSteps, uPower;
const float B4[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float zAt(ivec2 p) { return texelFetch(tZ, clamp(p, ivec2(0), ivec2(uHalf) - 1), 0).x; }
vec3 posAt(ivec2 p) { return viewAt((vec2(p) + 0.25) / uHalf, zAt(p)); }
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy); float z = zAt(ip);
  if (z > 5e3) { gl_FragColor = vec4(1.0, z, 0.0, 1.0); return; }
  vec3 P = posAt(ip);
  vec3 l = posAt(ip - ivec2(1, 0)), r = posAt(ip + ivec2(1, 0)), d = posAt(ip - ivec2(0, 1)), u = posAt(ip + ivec2(0, 1));
  vec3 dx = abs(l.z - P.z) < abs(r.z - P.z) ? P - l : r - P, dy = abs(d.z - P.z) < abs(u.z - P.z) ? P - d : u - P;
  vec3 N = normalize(cross(dx, dy)), V = normalize(-P);
  float rPx = min(uRadius * uPK.y * 0.5 * uHalf.y / z, uMaxPx);
  if (rPx < 1.5) { gl_FragColor = vec4(1.0, z, 0.0, 1.0); return; }
  float jA = (B4[(ip.x & 3) + ((ip.y & 3) << 2)] + 0.5) / 16.0, jS = (B4[((ip.x + 1) & 3) + (((ip.y + 2) & 3) << 2)] + 0.5) / 16.0;
  float vis = 0.0;
  for (int s = 0; s < 4; s++) {
    if (float(s) >= uSlices) break;
    float phi = (float(s) + jA) / uSlices * PI;
    vec2 om = vec2(cos(phi), sin(phi));
    vec3 dir = vec3(om, 0.0), ortho = dir - dot(dir, V) * V, axis = normalize(cross(ortho, V)), pn = N - axis * dot(N, axis);
    float pl = length(pn), cosN = clamp(dot(pn, V) / max(pl, 1e-4), 0.0, 1.0), n = sign(dot(ortho, pn)) * acos(cosN);
    float lo0 = cos(n + 0.5 * PI), lo1 = cos(n - 0.5 * PI), h0c = lo0, h1c = lo1;
    for (int j = 0; j < 8; j++) {
      if (float(j) >= uSteps) break;
      float t = (float(j) + jS) / uSteps; t *= t;
      ivec2 o = ivec2(round(om * (1.0 + t * (rPx - 1.0))));
      vec3 a = posAt(ip + o) - P, b = posAt(ip - o) - P;
      float la = max(length(a), 1e-5), lb = max(length(b), 1e-5);
      h0c = max(h0c, mix(lo0, dot(a, V) / la, clamp(la * uFall.x + uFall.y, 0.0, 1.0)));
      h1c = max(h1c, mix(lo1, dot(b, V) / lb, clamp(lb * uFall.x + uFall.y, 0.0, 1.0)));
    }
    float h0 = n + clamp(-acos(clamp(h1c, -1.0, 1.0)) - n, -0.5 * PI, 0.5 * PI), h1 = n + clamp(acos(clamp(h0c, -1.0, 1.0)) - n, -0.5 * PI, 0.5 * PI);
    vis += pl * 0.25 * (2.0 * cosN + 2.0 * (h0 + h1) * sin(n) - cos(2.0 * h0 - n) - cos(2.0 * h1 - n));
  }
  gl_FragColor = vec4(pow(clamp(vis / uSlices, 0.0, 1.0), uPower), z, 0.0, 1.0);
}`;
// one axis of the denoiser: five taps weighted 1/2,1,1,1,1/2 cover the 4-pixel pattern exactly; a tap counts only if it
// lies on the same surface (its depth matches the plane through this pixel, so slanted floors still smooth)
const AODN = HEAD + `uniform sampler2D tAO; uniform vec2 uHalf, uDir;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), dd = ivec2(uDir), mx = ivec2(uHalf) - 1;
  vec2 c = texelFetch(tAO, p, 0).xy;
  if (c.y > 5e3) { gl_FragColor = vec4(1.0, c.y, 0.0, 1.0); return; }
  float zl = texelFetch(tAO, clamp(p - dd, ivec2(0), mx), 0).y, zr = texelFetch(tAO, clamp(p + dd, ivec2(0), mx), 0).y;
  float g = abs(zr - c.y) < abs(zl - c.y) ? zr - c.y : c.y - zl, sum = c.x, w = 1.0;
  for (int i = -2; i <= 2; i++) {
    if (i == 0) continue;
    vec2 s = texelFetch(tAO, clamp(p + dd * i, ivec2(0), mx), 0).xy;
    float k = (abs(i) == 2 ? 0.5 : 1.0) * clamp(1.0 - abs(s.y - (c.y + g * float(i))) / (0.012 * c.y + 0.002), 0.0, 1.0);
    sum += s.x * k; w += k;
  }
  gl_FragColor = vec4(sum / w, c.y, 0.0, 1.0);
}`;
// contact shading onto the picture (brought up from half size along depth edges, tinted by the surface it darkens,
// never on light sources), and how far out of focus each pixel is (alpha, in pixels: negative in front of the focus)
const PREP = HEAD + DEPTH + `uniform sampler2D tScene, tAO, tDepth; uniform vec2 uHalf, uRes; uniform float uAO, uUseAO, uFocus, uAperture, uMaxCoc, uCurv;
void main() {
  vec3 c = TEX(tScene, vUv).rgb;
  if (!(c.r + c.g + c.b < 1e9)) c = vec3(0.0);                          // a broken highlight must not poison the blurs
  c = clamp(c, 0.0, 64.0);
  float z = linZ(TEX(tDepth, vUv).x);
  if (uUseAO > 0.5 && z < 5e3) {
    vec2 hp = (gl_FragCoord.xy - 0.5) * 0.5, f = fract(hp); ivec2 b = ivec2(floor(hp)), mx = ivec2(uHalf) - 1;
    float sum = 0.0, ws = 0.0;
    for (int k = 0; k < 4; k++) {
      ivec2 o = ivec2(k & 1, k >> 1);
      vec2 s = texelFetch(tAO, clamp(b + o, ivec2(0), mx), 0).xy;
      float dz = abs(s.y - z) / (0.015 * z + 0.002), wt = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y) / (1e-3 + dz * dz);
      sum += s.x * wt; ws += wt;
    }
    float ao = sum / max(ws, 1e-9);
    vec3 alb = clamp(c / max(max(c.r, max(c.g, c.b)), 1e-3), 0.0, 1.0) * 0.6;   // light bounces back out of a coloured crease, in its colour
    vec3 aoc = max(vec3(ao), ((ao * (2.0404 * alb - 0.3324) + (0.6417 - 4.7951 * alb)) * ao + (2.7552 * alb + 0.6903)) * ao);
    c *= mix(vec3(1.0), aoc, uAO * (1.0 - smoothstep(0.6, 2.5, luma(c))));
  }
  float coc = 0.0;
  if (uAperture > 0.0) {
    vec2 sp = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    coc = uAperture * (1.0 - uFocus / max(z, 0.01)) * uRes.y;
    coc += (coc < 0.0 ? -1.0 : 1.0) * uCurv * dot(sp, sp) * uRes.y;  // field curvature: a wide lens never has its corners in focus
    coc = clamp(coc, -uMaxCoc, uMaxCoc);
  }
  gl_FragColor = vec4(c, coc);
}`;

// ---- 2. motion blur: every pixel is put back where it was a frame ago (from its depth and the last camera) and
// smeared along that path for as long as the shutter was open ----
const MBLUR = HEAD + DEPTH + `uniform sampler2D tSrc, tDepth; uniform mat4 uReproj; uniform vec2 uRes; uniform float uShutter, uMaxV, uTaps;
void main() {
  vec4 c0 = TEX(tSrc, vUv);
  float z = linZ(TEX(tDepth, vUv).x);
  vec4 pc = uReproj * (z > 5e3 ? vec4(viewAt(vUv, 1.0), 0.0) : vec4(viewAt(vUv, z), 1.0));
  if (pc.w <= 1e-4) { gl_FragColor = c0; return; }
  vec2 v = (vUv - (pc.xy / pc.w * 0.5 + 0.5)) * uRes * uShutter;
  float L = length(v); if (L > uMaxV) v *= uMaxV / L;
  if (L < 0.75) { gl_FragColor = c0; return; }
  float j = ign(gl_FragCoord.xy); vec3 acc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (float(i) >= uTaps) break;
    acc += TEX(tSrc, vUv + v * ((float(i) + j) / uTaps - 0.5) / uRes).rgb;
  }
  gl_FragColor = vec4(acc / uTaps, c0.a);
}`;

// ---- 3. the lens ----
// half size, and each pixel already spread over the gap between the gather's rings, so a small highlight comes out as a
// solid disc and not as the ring pattern (only neighbours at a similar blur mix: layers stay apart)
const DDOWN = HEAD + `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRings;
void main() {
  ivec2 s = textureSize(tSrc, 0) - 1, p = ivec2(gl_FragCoord.xy) * 2;
  float a = texelFetch(tSrc, min(p, s), 0).a, b = texelFetch(tSrc, min(p + ivec2(1, 0), s), 0).a, c = texelFetch(tSrc, min(p + ivec2(0, 1), s), 0).a, d = texelFetch(tSrc, min(p + ivec2(1, 1), s), 0).a;
  float lo = min(min(a, b), min(c, d)), coc = 0.5 * (lo < -0.5 ? lo : (a + b + c + d) * 0.25), ac = abs(coc);
  vec2 uv = (vec2(p) + 1.0) * uTexel;
  vec3 col = TEX(tSrc, uv).rgb; float w = 1.0;
  float rp = 1.2 * ac / clamp(ceil(ac / 2.0), 1.0, uRings);
  if (rp > 0.6) for (int i = 0; i < 8; i++) {
    float an = float(i) * 0.7853982 + 0.39;
    vec4 t = TEX(tSrc, uv + vec2(cos(an), sin(an)) * rp * 2.0 * uTexel);
    float k = clamp(1.0 - abs(t.a * 0.5 - coc) / (1.0 + 0.3 * ac), 0.0, 1.0);
    col += t.rgb * k; w += k;
  }
  gl_FragColor = vec4(col / w, coc);
}`;
// the most a foreground blur reaches into each 8x8 tile, then over its neighbours
const TILE = HEAD + `uniform sampler2D tSrc;
void main() { ivec2 s = textureSize(tSrc, 0) - 1, b = ivec2(gl_FragCoord.xy) * 8; float m = 0.0;
  for (int j = 0; j < 8; j++) for (int i = 0; i < 8; i++) m = max(m, -texelFetch(tSrc, min(b + ivec2(i, j), s), 0).a);
  gl_FragColor = vec4(m, 0.0, 0.0, 1.0); }`;
const NEIGH = HEAD + `uniform sampler2D tSrc;
void main() { ivec2 s = textureSize(tSrc, 0) - 1, p = ivec2(gl_FragCoord.xy); float m = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) m = max(m, texelFetch(tSrc, clamp(p + ivec2(i, j), ivec2(0), s), 0).r);
  gl_FragColor = vec4(m, 0.0, 0.0, 1.0); }`;
// The gather: each pixel collects from a six-bladed disc as wide as its own blur or the nearest foreground's, into two
// layers. What is behind it (or level with it) may spread over it only as far as its own blur reaches; what is in front
// spreads over it freely, as a layer with its own coverage. Toward the corners the far side of the disc is cut off by
// the barrel (cat's eye), and every disc has a slightly brighter rim.
const GATHER = `precision highp float; precision highp int; varying vec2 vUv;
layout(location = 0) out vec4 oBg; layout(location = 1) out vec4 oFg;
const float PI = 3.14159265;
#define TEX(t, p) textureLod(t, p, 0.0)
uniform sampler2D tHalf, tTile; uniform vec2 uHalf; uniform float uBlades, uRound, uCat, uRings, uAspect, uRim;
void main() {
  vec4 c0 = TEX(tHalf, vUv); float r0 = c0.a, R = max(abs(r0), TEX(tTile, vUv).r);
  if (R < 0.5) { oBg = vec4(c0.rgb, 1.0); oFg = vec4(0.0); return; }
  float rings = clamp(ceil(R / 2.0), 1.0, uRings), seg = 2.0 * PI / uBlades, cb = cos(PI / uBlades);
  vec2 cat = (vUv - 0.5) * vec2(uAspect, 1.0) * uCat;
  vec3 bg = c0.rgb, fg = vec3(0.0); float bw = 1.0, fa = 0.0, n = 1.0;
  for (int k = 1; k <= 4; k++) {
    if (float(k) > rings) break;
    float cnt = float(k * 8), rad = R * float(k) / rings;
    for (int i = 0; i < 32; i++) {
      if (i >= k * 8) break;
      float th = (float(i) + 0.5 * float(k & 1)) / cnt * 2.0 * PI;
      vec2 o = vec2(cos(th), sin(th)) * rad * mix(1.0, cb / cos(mod(th + 0.3, seg) - 0.5 * seg), uRound);
      if (length(o / R + cat) > 1.0) continue;
      n += 1.0;
      vec4 s = TEX(tHalf, vUv + o / uHalf);
      float dist = length(o), sc = s.a;
      if (sc < r0 - 1.0 && sc < -0.5) {
        float a = clamp(-sc - dist + 1.0, 0.0, 1.0) * min(R * R / (sc * sc), 16.0);
        fg += s.rgb * a; fa += a;
      } else {
        float e = sc > r0 ? min(abs(sc), abs(r0)) : abs(sc);
        float w = clamp(e - dist + 1.0, 0.0, 1.0) * (1.0 + uRim * smoothstep(0.65, 1.0, dist / max(e, 1.0)));
        bg += s.rgb * w; bw += w;
      }
    }
  }
  oBg = vec4(bg / bw, 1.0);
  oFg = vec4(fa > 1e-4 ? fg / fa : vec3(0.0), clamp(fa / n, 0.0, 1.0));
}`;
const DMIX = HEAD + `uniform sampler2D tSharp, tBg, tFg;
void main() {
  vec4 s = TEX(tSharp, vUv); vec4 fg = TEX(tFg, vUv);
  vec3 c = mix(s.rgb, TEX(tBg, vUv).rgb, smoothstep(0.75, 2.0, abs(s.a)));
  gl_FragColor = vec4(mix(c, fg.rgb, fg.a), s.a);
}`;

// ---- 4. light: glow chain (13-tap down with a firefly-proof first step, tent up that adds each level back) ----
const DOWN = HEAD + `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh, uKaris, uWide;
vec3 S(vec2 o) { vec3 c = TEX(tSrc, vUv + o * uTexel).rgb; return c.r + c.g + c.b < 1e9 ? min(c, vec3(64.0)) : vec3(0.0); }
vec3 kw(vec3 g, float W, inout float ws) { float w = uKaris > 0.5 ? W / (1.0 + luma(g)) : W; ws += w; return g * w; }
void main() {
  vec3 c; float ws = 0.0;
  if (uWide > 0.5) {
    vec3 a = S(vec2(-2.0, 2.0)), b = S(vec2(0.0, 2.0)), cc = S(vec2(2.0, 2.0)), d = S(vec2(-2.0, 0.0)), e = S(vec2(0.0)), f = S(vec2(2.0, 0.0)),
         g = S(vec2(-2.0, -2.0)), h = S(vec2(0.0, -2.0)), i = S(vec2(2.0, -2.0)), j = S(vec2(-1.0, 1.0)), k = S(vec2(1.0, 1.0)), l = S(vec2(-1.0, -1.0)), m = S(vec2(1.0, -1.0));
    c = kw((j + k + l + m) * 0.25, 0.5, ws) + kw((a + b + d + e) * 0.25, 0.125, ws) + kw((b + cc + e + f) * 0.25, 0.125, ws) + kw((d + e + g + h) * 0.25, 0.125, ws) + kw((e + f + h + i) * 0.25, 0.125, ws);
    c /= ws;
  } else c = (S(vec2(-1.0, -1.0)) + S(vec2(1.0, -1.0)) + S(vec2(-1.0, 1.0)) + S(vec2(1.0, 1.0))) * 0.25;
  if (uThresh > 0.0) {                                                // a soft knee, so glow fades in instead of switching on
    float br = max(c.r, max(c.g, c.b)), kn = uThresh * 0.5, rq = clamp(br - uThresh + kn, 0.0, 2.0 * kn);
    c *= max(rq * rq / (4.0 * kn + 1e-5), br - uThresh) / max(br, 1e-5);
    c = min(c, vec3(24.0));
  }
  gl_FragColor = vec4(c, 1.0);
}`;
const UP = HEAD + `uniform sampler2D tSrc, tAdd; uniform vec2 uTexel;
void main() {
  vec3 c = vec3(0.0);
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c += TEX(tSrc, vUv + uTexel * vec2(float(i), float(j))).rgb * (i == 0 && j == 0 ? 4.0 : (i == 0 || j == 0 ? 2.0 : 1.0));
  gl_FragColor = vec4(c / 16.0 + TEX(tAdd, vUv).rgb, 1.0);
}`;
// star streaks: one axis, seven taps, the step growing 4x a pass (Kawase)
const STREAK = HEAD + `uniform sampler2D tSrc; uniform vec2 uStep; uniform float uFall, uThr;
void main() {
  vec3 a = vec3(0.0); float ws = 0.0;
  for (int i = -3; i <= 3; i++) {
    float w = pow(uFall, abs(float(i))); vec3 s = TEX(tSrc, vUv + uStep * float(i)).rgb;
    if (uThr > 0.0) s *= smoothstep(uThr, uThr * 2.5, max(s.r, max(s.g, s.b)));
    a += s * w; ws += w;
  }
  gl_FragColor = vec4(a / ws, 1.0);
}`;
// light shafts: what of the sky (or the white) glows near the source, smeared out from it in three passes
const SHMASK = HEAD + `uniform sampler2D tHdr, tDepth; uniform vec2 uSrc, uTexel; uniform float uAspect, uSky, uThr, uSpread;
void main() {
  vec3 c = vec3(0.0); float sky = 0.0;
  for (int k = 0; k < 4; k++) { vec2 q = vUv + vec2((k & 1) == 1 ? 1.0 : -1.0, k > 1 ? 1.0 : -1.0) * uTexel; c += TEX(tHdr, q).rgb; sky += step(0.999999, TEX(tDepth, q).x); }
  c *= 0.25; sky *= 0.25;
  if (!(c.r + c.g + c.b < 1e9)) c = vec3(0.0);
  vec2 d = (vUv - uSrc) * vec2(uAspect, 1.0);
  c *= mix(1.0, sky, uSky) * smoothstep(uThr, uThr * 2.5 + 0.1, luma(c)) * exp(-dot(d, d) * uSpread);
  gl_FragColor = vec4(min(c, vec3(8.0)), 1.0);
}`;
const RADIAL = HEAD + `uniform sampler2D tSrc; uniform vec2 uSrc; uniform float uLen;
void main() {
  vec2 st = (uSrc - vUv) * uLen / 8.0, p = vUv; vec3 a = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 8; i++) { float w = 1.0 - float(i) * 0.09; a += TEX(tSrc, p).rgb * w; ws += w; p += st; }
  gl_FragColor = vec4(a / ws, 1.0);
}`;
// how much of the sun's disc is not behind something (one pixel, read by the flare)
const SUNVIS = HEAD + `uniform sampler2D tDepth; uniform vec2 uSrc, uR;
void main() { float v = 0.0;
  for (int i = 0; i < 32; i++) { float fi = float(i) + 0.5; vec2 q = uSrc + vec2(cos(fi * 2.39996), sin(fi * 2.39996)) * sqrt(fi / 32.0) * uR;
    v += (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) ? 0.0 : step(0.999999, TEX(tDepth, q).x); }
  gl_FragColor = vec4(v / 32.0); }`;

// ---- 5. the film ----
const DEVELOP = HEAD + DEPTH + `uniform sampler2D tHdr, tDepth, tBloom, tHal, tWide, tStrH, tStrV, tShaft, tVis, tDirt, tGhost;
uniform vec2 uRes, uSun; uniform float uBloom, uHal, uExposure, uSat, uContrast, uWarm, uVig, uVigN, uStreak, uShaft, uGhost, uDirt, uHaze, uHazeStart, uHazeGlow, uVeil, uOrbs, uSeed, uEdge, uSunK, uGSat, uGCon;
uniform vec3 uShadowTint, uShaftCol, uSunCol, uHazeCol, uLift, uGamma, uGain;
// the deck's own curve (Narkowicz's ACES fit) up to 0.8, then a longer shoulder joined smoothly that never clips
float tc(float x) { return x < 0.98236 ? (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14) : 1.0 - 0.2 / pow(1.0 + 0.54657 * (x - 0.98236), 2.0); }
// Per channel (as the deck was made) bleaches a saturated screen toward white and drifts its hue; the same curve on the
// brightest channel keeps the hue (at the brightness the deck's curve gives). Mostly the second; very bright colours
// still go to white, because there is no room left at that brightness for their colour.
vec3 tone(vec3 x) {
  x = max(x, 0.0);
  float m = max(x.r, max(x.g, x.b)), tm = tc(m);
  vec3 pc = vec3(tc(x.r), tc(x.g), tc(x.b)), hp = x * (tm / max(m, 1e-6));
  float L = luma(pc), Lh = luma(hp);
  hp *= L / max(Lh, 1e-6);                                              // as bright as the deck's own curve makes it,
  float mh = max(hp.r, max(hp.g, hp.b));                                // and where that will not fit, paler, not clipped
  if (mh > 1.0) hp = L + (hp - L) * (1.0 - L) / max(mh - L, 1e-6);
  return mix(pc, hp, 0.6);
}
float hexd(vec2 p) { p = abs(p); return max(p.x * 0.866025 + p.y * 0.5, p.y); }
const float GT[6] = float[6](0.55, -0.22, -0.48, -0.72, -1.08, -1.6), GS[6] = float[6](0.022, 0.045, 0.085, 0.03, 0.13, 0.2);
const vec3 GC[6] = vec3[6](vec3(0.5, 1.0, 0.6), vec3(1.0, 0.55, 0.9), vec3(0.4, 0.8, 1.0), vec3(1.0, 0.8, 0.4), vec3(0.6, 1.0, 0.8), vec3(0.8, 0.6, 1.0));
// the sun through a cheap zoom lens: glare, a six-point star from the blades, ghosts of the aperture strung on the line
// through the centre, and a thin rainbow halo on the far side
vec3 flare(vec2 p, vec2 s) {
  vec2 d = p - s; float r = length(d), a = atan(d.y, d.x);
  float star = pow(abs(cos(a * 3.0 + 0.3)), 120.0) + 0.35 * pow(abs(cos(a * 3.0 + 0.82)), 300.0);
  vec3 f = uSunCol * (0.03 / (r * r * 30.0 + 0.02) + 0.35 / (r * r * 6000.0 + 0.25) + star * 1.2 / (r * 14.0 + 0.04) * smoothstep(0.75, 0.0, r));
  for (int i = 0; i < 6; i++) {
    float h = hexd((p - s * GT[i]) / GS[i]);
    f += GC[i] * uSunCol * smoothstep(1.0, 0.85, h) * (0.3 + 0.7 * smoothstep(0.5, 1.0, h)) * 0.055;
  }
  float rr = length(p + s * 0.15), side = max(0.0, dot(normalize(p + 1e-5), normalize(s + 1e-5)));
  f += vec3(exp(-pow((rr - 0.40) * 34.0, 2.0)), exp(-pow((rr - 0.41) * 34.0, 2.0)), exp(-pow((rr - 0.42) * 34.0, 2.0))) * side * side * 0.05;
  return f;
}
// ghosts of everything bright, mirrored through the centre (the flash's glints, the screens)
vec3 ghosts(vec2 uv) {
  vec3 a = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float sc = i == 0 ? -0.62 : i == 1 ? -1.25 : 0.4;
    vec2 q = 0.5 + (uv - 0.5) * sc;
    float w = pow(max(0.0, 1.0 - length(q - 0.5) * 1.5), 2.0);
    vec2 ca = (q - 0.5) * 0.04;
    a += vec3(TEX(tGhost, q + ca).r, TEX(tGhost, q).g, TEX(tGhost, q - ca).b) * w * GC[i + 2];
  }
  return a;
}
// dust in front of the lens, lit by the flash: soft discs (out of focus) with a brighter rim; a new set every photo
vec3 orbs(vec2 p) {
  p *= 3.2; vec2 cell = floor(p); vec3 o = vec3(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cc = cell + vec2(i, j) + 64.0;
    float h = rnd(cc, uSeed); if (h > 0.32) continue;
    vec2 ctr = cc - 64.0 + vec2(rnd(cc, uSeed + 1.0), rnd(cc, uSeed + 2.0));
    float d = length(p - ctr) / mix(0.12, 0.5, rnd(cc, uSeed + 3.0));
    if (d < 1.0) o += (smoothstep(1.0, 0.86, d) * 0.45 + smoothstep(0.72, 0.97, d) * smoothstep(1.0, 0.95, d) * 0.7) * (0.35 + 2.0 * h);
  }
  return o * vec3(1.0, 0.97, 0.9);
}
vec3 fetch(vec2 uv) { vec3 c = TEX(tHdr, uv).rgb; return c.r + c.g + c.b < 1e9 ? min(c, vec3(64.0)) : vec3(0.0); }
void main() {
  vec2 uv = vUv, asp = vec2(uRes.x / uRes.y, 1.0);
  vec3 raw = fetch(uv), c = raw, wide = TEX(tWide, uv).rgb;
  if (uHaze > 0.0 || uVeil > 0.0) {                                    // (not on phones: the depth read is the cost)
    float z = linZ(TEX(tDepth, uv).x), air = 1.0 - exp(-max(z - uHazeStart, 0.0) * uHaze);
    c = c * (1.0 - 0.4 * air) + (uHazeCol + wide * uHazeGlow) * air;   // the air of the room, holding the screens' glow
    c += vec3(1.0, 0.96, 0.9) * uVeil * (1.0 - exp(-min(z, 12.0) * 0.3)) * (0.7 + 0.6 * clamp(dot(uv - 0.5, vec2(0.5, 0.6)) + 0.5, 0.0, 1.0));   // the flash lighting the dust in front of the lens
  }
  c += TEX(tBloom, uv).rgb * uBloom;
  c += TEX(tHal, uv).rgb * vec3(1.0, 0.32, 0.1) * uHal;           // halation: the red layer exposed again by light bounced off the film base
  if (uStreak > 0.0) c += (TEX(tStrH, uv).rgb * vec3(0.8, 0.92, 1.2) + TEX(tStrV, uv).rgb * vec3(1.0, 0.95, 0.9) * 0.7) * uStreak;
  if (uShaft > 0.0) c += TEX(tShaft, uv).rgb * uShaftCol * uShaft;
  vec3 onGlass = wide;
  if (uSunK > 0.0) {
    float vis = TEX(tVis, vec2(0.5)).r; vec2 p = (uv - 0.5) * asp, s = (uSun - 0.5) * asp;
    c += flare(p, s) * vis * uSunK;
    onGlass += uSunCol * vis * uSunK * 0.35 / (1.0 + 6.0 * length(p - s));
  }
  if (uGhost > 0.0) c += ghosts(uv) * uGhost;
  if (uDirt > 0.0) c += texture2D(tDirt, uv).rgb * onGlass * uDirt;      // smudges on the front element catch the light
  if (uOrbs > 0.0) c += orbs(uv * asp) * uOrbs;
  float v = length((uv - 0.5) * asp), cs = 1.0 / (1.0 + v * v * uVigN);
  c *= pow(mix(1.0, smoothstep(1.15, 0.35, v), uVig), 2.2) * cs * cs;    // the old falloff (a flash lights the middle) and the lens's own
  vec3 E = uExposure * mix(vec3(1.0), vec3(1.06, 1.0, 0.92), uWarm);
  vec3 t = tone(c * E);
  if (uEdge > 0.0) {                                                    // multisampling averages a bright edge before the curve, so it
    vec2 px = 1.0 / uRes; vec3 lo = raw, hi = raw;                      // comes out thick and stepped; re-mix the two sides after it
    for (int k = 0; k < 4; k++) {
      vec3 s = fetch(uv + (k == 0 ? vec2(px.x, 0.0) : k == 1 ? vec2(-px.x, 0.0) : k == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y)));
      if (luma(s) < luma(lo)) lo = s; if (luma(s) > luma(hi)) hi = s;
    }
    float L = luma(raw), Lo = luma(lo), Hi = luma(hi);
    if (Hi * uExposure > 0.7 && Hi > 4.0 * Lo + 0.05 && L > Lo && L < Hi) t += (mix(tone(lo * E), tone(hi * E), (L - Lo) / (Hi - Lo)) - tone(raw * E)) * uEdge;
  }
  float l = luma(t);
  t = mix(vec3(l), t, uSat * uGSat);
  t = mix(t, t * t * (3.0 - 2.0 * t), uContrast + uGCon);
  t += uShadowTint * (1.0 - smoothstep(0.0, 0.35, l));                // the blacks of a cheap sensor are never neutral
  vec3 o = pow(max(t, 0.0), vec3(1.0 / 2.2));
  o = pow(max(uGain * (o + uLift * (1.0 - o)), 0.0), 1.0 / uGamma);   // the act's grade, on the picture as it will be seen
  gl_FragColor = vec4(o + (ign(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
}`;

// ---- 6. the treatment ----
const COMP = HEAD + `
uniform sampler2D tFrame, tPrev; uniform vec2 uVel; uniform float uTrail, uMBlur; uniform vec2 uRes; uniform float uTime, uFlash, uSplit, uZoom, uTri, uInv, uGrain, uVig, uShake, uGlitch, uPixel; uniform vec3 uTint; uniform vec4 uWin; uniform float uTile, uCrt;
uniform float uBarrel, uScale, uCA, uSharp, uSoft, uDigi, uQ;
// the lens bows straight lines outward (more the wider it is), scaled so the corners stay filled
vec2 lens(vec2 uv) { vec2 c = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0); return 0.5 + (uv - 0.5) * (1.0 + uBarrel * dot(c, c)) * uScale; }
vec3 frame(vec2 uv) {
  vec2 q = lens(uv), c = q - 0.5; float r = length(c);
  vec2 off = c * (uSplit * 0.03 * r + uGlitch * 0.012 + uCA * r * r);   // a cheap lens fringes toward its corners, always
  return vec3(TEX(tFrame, q + off).r, TEX(tFrame, q).g, TEX(tFrame, q - off).b);
}
vec3 vnoise(vec2 p, float k) {                                          // blotchy colour noise, a few pixels across
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  vec3 a = vec3(0.0);
  for (int n = 0; n < 4; n++) {
    vec2 o = vec2(n & 1, n >> 1); uint h = hash3(i + o, k);
    a += vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u)) / 1023.0 * (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
  }
  return a - 0.5;
}
void main() {
  vec2 UV = vUv; float gain = 1.0;
  if (uCrt > 0.001) {                                               // a tube switching off: the picture folds to a line, the line to a dot
    float sy = mix(1.0, 0.006, smoothstep(0.0, 0.55, uCrt)), sx = mix(1.0, 0.0, smoothstep(0.5, 1.0, uCrt));
    vec2 d = abs(vUv - 0.5) * 2.0;
    if (d.y > sy || d.x > sx) {                                       // and the phosphor glows around what is left
      float e = length(max(d - vec2(sx, sy), 0.0) * vec2(uRes.x / uRes.y, 1.0));
      gl_FragColor = vec4(vec3(0.8, 0.88, 1.0) * exp(-e * 45.0) * smoothstep(0.15, 0.6, uCrt) * (1.0 - smoothstep(0.92, 1.0, uCrt)) * 0.7, 1.0); return;
    }
    UV = (vUv - 0.5) / vec2(max(sx, 1e-3), sy) + 0.5; gain = 1.0 + 5.0 * smoothstep(0.0, 0.5, uCrt);
  }
  if (uWin.z > uWin.x) {                                            // the picture as a clip inside a window (desk.js draws the window)
    UV = (UV - uWin.xy) / (uWin.zw - uWin.xy);
    if (UV.x < 0.0 || UV.x > 1.0 || UV.y < 0.0 || UV.y > 1.0) { gl_FragColor = vec4(vec3(0.0), 1.0); return; }
  }
  if (uTile > 1.5) UV = fract(UV * uTile);                           // the whole picture, tiled like a wallpaper

  vec2 uv = UV;
  if (uTri > 0.5) uv.x = (fract(uv.x * 3.0) - 0.5) / 3.0 + 0.5;     // the middle third, three times
  float tt = floor(uTime * 24.0), gh = 0.0; vec2 blk = vec2(0.0);
  if (uGlitch > 0.01) {                                             // blocks shoved sideways, scanlines torn
    blk = floor(UV * vec2(10.0, 28.0)); gh = rnd(blk, tt);
    if (gh < uGlitch * 0.28) uv.x += (rnd(blk, tt + 3.0) - 0.5) * 0.22 * uGlitch;
    float ln = floor(UV.y * 150.0); if (rnd(vec2(ln, 7.0), tt) < uGlitch * 0.14) uv.x += (rnd(vec2(tt, ln), 11.0) - 0.5) * 0.07;
    if (rnd(blk * 1.7, tt + 5.0) < uGlitch * 0.08) uv = (floor(uv * vec2(24.0, 14.0)) + 0.5) / vec2(24.0, 14.0);   // mosaic
  }
  if (uPixel > 0.01) { vec2 g = uRes / mix(1.0, 6.0, uPixel); uv = (floor(uv * g) + 0.5) / g; }       // chunky pixels
  vec3 c = frame(uv);
  if (uSharp > 0.0 || uSoft > 0.0) {                                 // the camera's own sharpening (a thin halo on every edge),
    vec2 q = lens(uv), px = 1.0 / uRes;                              // giving way to softness toward the corners of a wide lens
    vec3 b = (TEX(tFrame, q + vec2(px.x, 0.0)).rgb + TEX(tFrame, q - vec2(px.x, 0.0)).rgb + TEX(tFrame, q + vec2(0.0, px.y)).rgb + TEX(tFrame, q - vec2(0.0, px.y)).rgb) * 0.25;
    vec2 cc = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    c = max(c + (c - b) * (uSharp - uSoft * dot(cc, cc) * 2.5), 0.0);
  }
  // digital motion blur, for the glitch moments: the camera's motion leaves stepped copies, snapped to a block grid,
  // channels drifting apart (the real blur is upstream, from the depth buffer)
  float vl = length(uVel);
  if (vl > 0.004 && uMBlur > 0.0 && uDigi > 0.0) {
    vec3 acc = c; float wsum = 1.0; vec2 bk = vec2(7.0) / uRes;
    for (int i = 1; i <= 6; i++) {
      float k = float(i) / 6.0; vec2 o = uVel * k * 2.4 * uMBlur;
      o = floor(o / bk + 0.5) * bk;
      vec2 q = lens(uv - o); vec3 g = vec3(TEX(tFrame, q + vec2(bk.x * k, 0.0)).r, TEX(tFrame, q).g, TEX(tFrame, q - vec2(bk.x * k, 0.0)).b);
      g = floor(g * 12.0 + 0.5) / 12.0;                                         // and posterised, like a cheap codec
      float w = 1.0 - k * 0.7; acc += g * w; wsum += w;
    }
    c = mix(c, acc / wsum, clamp((vl - 0.004) * 60.0, 0.0, 1.0) * uDigi);
  }
  if (uGlitch > 0.12) {                                             // JPEG at a terrible quality: colour in 16 px blocks, detail in 8 px steps
    float jk = smoothstep(0.12, 0.5, uGlitch) * step(rnd(floor(UV * uRes / 32.0), tt + 9.0), 0.2 + 0.7 * uGlitch);
    vec2 b8 = 8.0 / uRes, b16 = 16.0 / uRes;
    vec3 m = frame((floor(uv / b8) + 0.5) * b8), ch = frame((floor(uv / b16) + 0.5) * b16);
    float y = luma(c), ym = luma(m);
    c = mix(c, vec3(ym + floor((y - ym) * 5.0 + 0.5) / 5.0) + (ch - luma(ch)), jk);
  }
  if (gh > 1.0 - uGlitch * 0.07) c = c.brg;                          // a block with its channels swapped
  if (uZoom > 0.001) {                                               // smear out from the centre
    vec3 acc = c; float wsum = 1.0;
    for (int i = 1; i < 12; i++) { float k = float(i) / 11.0; vec2 p = 0.5 + (uv - 0.5) * (1.0 - uZoom * 0.18 * k); acc += frame(p) * (1.0 - k * 0.5); wsum += 1.0 - k * 0.5; }
    c = acc / wsum;
  }
  c *= uTint;
  // the sensor: grain that lives in the mids and shadows (clean whites), and blotchy colour noise in the dark
  float L = clamp(luma(c), 0.0, 1.0), seed = floor(uTime * 60.0);
  uint h = pcg(uint(gl_FragCoord.x) + (uint(gl_FragCoord.y) << 12) + pcg(uint(seed)));
  float gn = (float(h & 255u) + float((h >> 8) & 255u)) / 255.0 - 1.0;
  vec3 cn = uQ > 0.5 ? vnoise(gl_FragCoord.xy / 2.7, seed + 7.0) : vec3(float((h >> 16) & 31u), float((h >> 21) & 31u), float((h >> 26) & 31u)) / 31.0 - 0.5;
  c += gn * uGrain * (0.2 + 1.1 * sqrt(L) * (1.0 - L)) + cn * uGrain * (1.0 - smoothstep(0.0, 0.4, L));
  if (uPixel > 0.01) {                                              // PS1: ordered dither down to a few levels per channel
    vec2 q = floor(mod(gl_FragCoord.xy / mix(1.0, 6.0, uPixel), 4.0));
    float b = mod(q.x * 8.0 + q.y * 4.0 + mod(q.x + q.y, 2.0) * 2.0 + floor(mod(q.y, 2.0)), 16.0) / 16.0 - 0.5;
    float lv = mix(64.0, 7.0, uPixel); c = floor(c * lv + b + 0.5) / lv;
  }
  if (uTrail > 0.01) {                                              // afterimage: last frame, in big pixels, fading in steps
    vec2 g = uRes / 5.0; vec3 p = TEX(tPrev, (floor(UV * g) + 0.5) / g).rgb;
    p = floor(p * 8.0) / 8.0;
    c = max(c, p * uTrail);
  }
  if (uInv > 0.5) c = vec3(1.0) - c;
  c = clamp(c * gain, 0.0, 1.0);
  c = 1.0 - (1.0 - c) * pow(vec3(1.0 - uFlash), vec3(1.0 + 2.5 * luma(c)));   // a white-out burns the highlights first
  gl_FragColor = vec4(c, 1.0);
}`;

// the front element's dirt: dust, a few smudges, a thumb's arcs (drawn once, seeded, so it is the same lens every visit)
function dirtTexture() {
  const W = 512, H = 288, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'); let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
  const blob = (cx, cy, r, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); };
  for (let i = 0; i < 14; i++) blob(R() * W, R() * H, 30 + R() * 90, 0.05 + R() * 0.08);       // smudges
  for (let i = 0; i < 110; i++) blob(R() * W, R() * H, 0.6 + R() * R() * 3.5, 0.15 + R() * 0.35);   // dust
  for (let i = 0; i < 10; i++) { const r = 1.5 + R() * 4; x.strokeStyle = `rgba(255,255,255,${0.15 + R() * 0.25})`; x.lineWidth = 0.7; x.beginPath(); x.arc(R() * W, R() * H, r, 0, 7); x.stroke(); }   // dried drops
  const fx = W * (0.62 + R() * 0.2), fy = H * (0.3 + R() * 0.4);
  for (let i = 0; i < 16; i++) { x.strokeStyle = `rgba(255,255,255,${0.035 + R() * 0.03})`; x.lineWidth = 1.6; x.beginPath(); x.ellipse(fx, fy, 6 + i * 3.4, 4 + i * 2.6, 0.5, 3.6 + R() * 0.4, 5.6 + R() * 0.8); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
const clamp01 = (x) => Math.max(0, Math.min(1, x)), sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixA = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// what the choreography may set each frame (update().post), with the values a still room gets. Hooks beyond these:
// post.act ({ y2k, bliss, void } world weights), post.day (time of day on the hill), post.pop (the lens flash, 0..1,
// already calmed under "Flashing off"), post.sun ([x, y, z], toward the sun in world space), post.cut (a hard cut this
// frame; optional: cuts are also found from the camera), and run()'s fx.view (the camera's world-to-view matrix).
export const LOOK = { uBloom: 0.12, uThresh: 1.3, uHal: 0.05, uExposure: 1, uSat: 1.08, uContrast: 0.18, uWarm: 0.5, uAO: 0.9, uAperture: 0.012, uFocus: 2.3, uMaxCoc: 14,
  uFlash: 0, uSplit: 0, uZoom: 0, uTri: 0, uInv: 0, uGrain: 0.035, uVig: 0.8, uGlitch: 0, uPixel: 0, uTrail: 0, uMBlur: 1, uTile: 1, uCrt: 0,
  uStreak: 1, uShaft: 1, uGhost: 1, uDirt: 1, uHaze: 1, uVeil: 1, uOrbs: 1, uSharp: 0.28 };
// the grade of each world: lift (shadows), gamma, gain (highlights), saturation, contrast (added to the conductor's)
const GRADE = {
  room: { lift: [0.004, 0.004, 0.009], gamma: [1.06, 1.06, 1.07], gain: [1.03, 1.0, 0.97], sat: 1.04, con: 0.03 },      // a flash in a dark bedroom: warm skin of light, inky blue blacks
  fly: { lift: [0.0, 0.008, 0.016], gamma: [1, 1.02, 1.03], gain: [1.0, 1.02, 1.03], sat: 1.1, con: 0.05 },       // the wallpaper skies, as saturated as a 2001 desktop
  noon: { lift: [0.0, 0.004, 0.012], gamma: [1.02, 1.02, 1.0], gain: [1.03, 1.02, 0.97], sat: 1.1, con: 0.04 },  // sunlit, golden-warm, clean
  sunset: { lift: [0.035, 0.01, 0.045], gamma: [1.02, 1.0, 0.98], gain: [1.06, 0.99, 0.92], sat: 1.08, con: 0.05 }, // gold highlights, violet shadows
  night: { lift: [0.0, 0.01, 0.03], gamma: [0.98, 1.0, 1.04], gain: [0.94, 0.98, 1.06], sat: 0.95, con: 0.05 },
  white: { lift: [0.0, 0.0, 0.006], gamma: [1.01, 1.01, 1.02], gain: [1.0, 1.0, 1.01], sat: 1.02, con: 0.0 },     // high key: open shadows, nothing crushed
};

export class Post {
  constructor(r) {
    this.r = r; this.quality = 2;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    const V2 = () => new THREE.Vector2(), V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), M4 = () => new THREE.Matrix4();
    this.sh = { uPK: { value: new THREE.Vector4(1, 1, 0, 0) }, uPZ: { value: V2() } };       // the projection, shared by every pass that reads depth
    this.mats = [];
    const mk = (fs, u, o = {}) => { const m = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms: { ...U(u), ...this.sh }, depthTest: false, depthWrite: false, ...o }); this.mats.push(m); return m; };
    const named = () => { for (const k in this) if (this[k] && this[k].isShaderMaterial) this[k].name = k; };
    this.zh = mk(ZH, { tDepth: null });
    this.ao = mk(GTAO, { tZ: null, uHalf: V2(), uFall: V2(), uRadius: 0.1, uMaxPx: 40, uSlices: 3, uSteps: 6, uPower: 1.3 });
    this.aoDn = mk(AODN, { tAO: null, uHalf: V2(), uDir: V2() });
    this.prep = mk(PREP, { tScene: null, tAO: null, tDepth: null, uHalf: V2(), uRes: V2(), uAO: 1, uUseAO: 1, uFocus: 2, uAperture: 0, uMaxCoc: 9, uCurv: 0 });
    this.mb = mk(MBLUR, { tSrc: null, tDepth: null, uReproj: M4(), uRes: V2(), uShutter: 0.5, uMaxV: 64, uTaps: 12 });
    this.ddown = mk(DDOWN, { tSrc: null, uTexel: V2(), uRings: 4 });
    this.tile = mk(TILE, { tSrc: null });
    this.neigh = mk(NEIGH, { tSrc: null });
    this.gather = mk(GATHER, { tHalf: null, tTile: null, uHalf: V2(), uBlades: 6, uRound: 0.55, uCat: 0.45, uRings: 4, uAspect: 1, uRim: 0.35 }, { glslVersion: THREE.GLSL3 });
    this.dmix = mk(DMIX, { tSharp: null, tBg: null, tFg: null });
    this.down = mk(DOWN, { tSrc: null, uTexel: V2(), uThresh: 0, uKaris: 0, uWide: 1 });
    this.up = mk(UP, { tSrc: null, tAdd: null, uTexel: V2() });
    this.streak = mk(STREAK, { tSrc: null, uStep: V2(), uFall: 0.9, uThr: 0 });
    this.shMask = mk(SHMASK, { tHdr: null, tDepth: null, uSrc: V2(), uTexel: V2(), uAspect: 1, uSky: 1, uThr: 1, uSpread: 4 });
    this.radial = mk(RADIAL, { tSrc: null, uSrc: V2(), uLen: 1 });
    this.sunVis = mk(SUNVIS, { tDepth: null, uSrc: V2(), uR: V2() });
    this.develop = mk(DEVELOP, { tHdr: null, tDepth: null, tBloom: null, tHal: null, tWide: null, tStrH: null, tStrV: null, tShaft: null, tVis: null, tDirt: null, tGhost: null,
      uRes: V2(), uSun: V2(), uBloom: 0.5, uHal: 0.1, uExposure: 1, uSat: 1, uContrast: 0, uWarm: 0, uVig: 0.8, uVigN: 0, uStreak: 0, uShaft: 0, uGhost: 0, uDirt: 0, uHaze: 0, uHazeStart: 1, uHazeGlow: 0,
      uVeil: 0, uOrbs: 0, uSeed: 0, uEdge: 0, uSunK: 0, uGSat: 1, uGCon: 0, uShadowTint: V3(0.0, 0.004, 0.012), uShaftCol: V3(1, 1, 1), uSunCol: V3(1, 1, 1), uHazeCol: V3(), uLift: V3(), uGamma: V3(1, 1, 1), uGain: V3(1, 1, 1) });
    this.comp = mk(COMP, { tFrame: null, tPrev: null, uRes: V2(), uTime: 0, uFlash: 0, uSplit: 0, uZoom: 0, uTri: 0, uInv: 0, uGrain: 0.035, uVig: 0.8, uShake: 0, uGlitch: 0, uPixel: 0, uVel: V2(), uTrail: 0, uMBlur: 1,
      uTint: V3(1, 1, 1), uWin: new THREE.Vector4(0, 0, 0, 0), uTile: 1, uCrt: 0, uBarrel: 0, uScale: 1, uCA: 0.0025, uSharp: 0, uSoft: 0, uDigi: 1, uQ: 2 });
    this.copy = mk('precision highp float; uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = texture2D(t, vUv); }', { t: null });
    this.dirt = dirtTexture(); named();
    this.w = 0; this.h = 0;
    // camera history (only to know how the camera moved since the last frame; nothing of the picture is kept)
    this.prevVP = M4(); this.vp = M4(); this.invView = M4(); this.reproj = M4(); this.hasPrev = false; this.prevPos = V3(); this.prevFwd = V3(); this.prevP5 = 1;
    this.pos = V3(); this.fwd = V3(); this.v4 = new THREE.Vector4(); this.v4b = new THREE.Vector4(); this.seed = 0; this.lastPop = 0;
  }
  // w, h: the size the scene is drawn at (the canvas, times the render scale)
  resize(w, h) {
    if (w === this.w && h === this.h && this.q === this.quality) return;
    this.w = w; this.h = h; this.q = this.quality;
    for (const t of this.all || []) t.dispose();
    this.all = [];
    const HF = THREE.HalfFloatType, N = THREE.NearestFilter, rt = (tw, th, o = {}) => { const t = new THREE.WebGLRenderTarget(Math.max(1, tw), Math.max(1, th), { type: HF, depthBuffer: false, ...o }); this.all.push(t); return t; };
    const near = { minFilter: N, magFilter: N }, q = this.quality;
    // the scene: HDR, antialiased, with a depth texture the later passes read
    const depth = new THREE.DepthTexture(w, h); depth.type = THREE.UnsignedIntType; depth.minFilter = depth.magFilter = N;
    this.sceneRT = rt(w, h, { depthBuffer: true, depthTexture: depth, samples: q > 0 ? 4 : 0 });
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    if (q > 0) {
      const fl = this.r.extensions.has('EXT_color_buffer_float');
      this.zhRT = rt(hw, hh, { type: fl ? THREE.FloatType : HF, format: THREE.RedFormat, ...near });
      this.aoA = rt(hw, hh, near); this.aoB = rt(hw, hh, near);
      this.prepRT = rt(w, h); this.mbRT = rt(w, h);
      this.visRT = rt(1, 1, near);
    }
    if (q > 1) {
      this.dofRT = rt(w, h); this.dHalf = rt(hw, hh);
      this.dTile = rt(Math.ceil(hw / 8), Math.ceil(hh / 8), near); this.dTile2 = rt(Math.ceil(hw / 8), Math.ceil(hh / 8), near);
      this.dGather = rt(hw, hh, { count: 2 });
    }
    this.mips = []; let mw = w, mh = h;
    for (let i = 0; i < 5; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); this.mips.push(rt(mw, mh)); }
    this.ups = this.mips.slice(0, 4).map((m) => rt(m.width, m.height));
    const qw = this.mips[1].width, qh = this.mips[1].height;
    if (q > 0) { this.shA = rt(qw, qh); this.shB = rt(qw, qh); }
    if (q > 1) { this.stA = rt(qw, qh); this.stB = rt(qw, qh); this.stC = rt(qw, qh); this.stD = rt(qw, qh); }
    this.ldr = rt(w, h, { type: THREE.UnsignedByteType });
    this.outs = [0, 1].map(() => rt(w, h, { type: THREE.UnsignedByteType })); this.flip = 0;
  }
  // The deck draws with raw WebGL: hand it the framebuffer the room will also draw into.
  begin() {
    const r = this.r; r.setRenderTarget(this.sceneRT);
    const p = r.properties.get(this.sceneRT), fb = p.__webglMultisampledFramebuffer || p.__webglFramebuffer;
    r.resetState();
    return fb;
  }
  pass(mat, target) {
    const T = this.prof, gl = T && this.r.getContext(), ext = T && (T.ext ||= gl.getExtension('EXT_disjoint_timer_query_webgl2'));
    let q; if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam);
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); (T.pend ||= []).push([mat.name, q]); }
  }
  // GPU time of each pass (set post.prof = {} from the console; post.prof.ms then holds { pass: [ms, ...] })
  profRead() {
    const T = this.prof, gl = this.r.getContext(); if (!T || !T.pend) return;
    T.ms ||= {};
    T.pend = T.pend.filter(([k, q]) => {
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!gl.getParameter(T.ext.GPU_DISJOINT_EXT)) (T.ms[k] ||= []).push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q); return false;
    });
  }
  // every program built up front, whatever this machine's tier is now, so nothing compiles while the song plays
  warmUp() {
    this.warmed = true;
    for (const m of this.mats) { this.quad.material = m; try { this.r.compile(this.scene, this.cam); } catch (e) { console.error('post: compile', e); } }
  }
  // fx: { time, post (LOOK values + vel + tint + the hooks above), proj (THREE.Matrix4), view (THREE.Matrix4), out: [w, h] of the canvas }
  run(fx) {
    const r = this.r, w = this.w, h = this.h, P = { ...LOOK, ...fx.post }, q = this.quality, pe = fx.proj.elements;
    if (!this.warmed) this.warmUp();
    if (this.prof) this.profRead();
    this.sh.uPK.value.set(pe[0], pe[5], pe[8], pe[9]); this.sh.uPZ.value.set(pe[10], pe[14]);
    const tanY = 1 / pe[5], fov = 2 * Math.atan(tanY) * 57.2958, wide = sstep(30, 75, fov), aspect = w / h;
    // the light we are in
    const A = P.act || {}, y2k = A.y2k || 0, bliss = A.bliss || 0, white = A.void || 0, room = clamp01(1 - y2k - bliss - white);
    const day = P.day || 0, night = sstep(1, 1.6, day), set = sstep(0.35, 1, day) * (1 - night), pop = clamp01(P.pop || 0);
    if (pop > this.lastPop + 0.2) this.seed = (this.seed + 1) % 4093;                  // a new photograph, new dust in front of the lens
    this.lastPop = pop;

    // how the camera moved since the last frame, and whether that was a cut
    const now = performance.now(), gap = now - (this.tLast || 0); this.tLast = now;
    let mbOn = false, sunUV = null;
    if (fx.view) {
      const vp = this.vp.multiplyMatrices(fx.proj, fx.view), inv = this.invView.copy(fx.view).invert();
      const pos = this.pos.setFromMatrixPosition(inv), fwd = this.fwd.set(0, 0, -1).transformDirection(inv);
      const cut = !this.hasPrev || !!P.cut || gap > 250 || pos.distanceTo(this.prevPos) > 0.5 * Math.max(0.4, P.uFocus) || fwd.dot(this.prevFwd) < 0.9 || Math.abs(pe[5] / this.prevP5 - 1) > 0.12;
      if (!cut && q > 0 && P.uMBlur > 0) {
        this.reproj.multiplyMatrices(this.prevVP, inv);
        // how far the picture moved: the middle and the corners, at the focus distance and at infinity
        const F = Math.max(0.3, P.uFocus || 2), tx = tanY * aspect; let mx = 0;
        for (const [sx, sy, wv] of [[0, 0, 1], [0.8, 0.8, 1], [-0.8, 0.8, 1], [0.8, -0.8, 1], [-0.8, -0.8, 1], [0.8, 0.8, 0], [-0.8, -0.8, 0]]) {
          const d = wv ? F : 1, a = this.v4.set(sx * tx * d, sy * tanY * d, -d, wv), b = this.v4b.copy(a).applyMatrix4(this.reproj); a.applyMatrix4(fx.proj);
          if (b.w <= 1e-4 || a.w <= 1e-4) { mx = 0; break; }
          mx = Math.max(mx, Math.hypot((a.x / a.w - b.x / b.w) * 0.5 * w, (a.y / a.w - b.y / b.w) * 0.5 * h));
        }
        mbOn = mx * 0.5 * P.uMBlur > 0.75;
      }
      this.cutNow = cut; this.prevVP.copy(vp); this.prevPos.copy(pos); this.prevFwd.copy(fwd); this.prevP5 = pe[5]; this.hasPrev = true;
      if (P.sun && q > 0 && bliss > 0.01) {                             // the sun on the picture
        const s = this.v4.set(P.sun[0], P.sun[1], P.sun[2], 0).applyMatrix4(vp);
        if (s.w > 1e-4) sunUV = [s.x / s.w * 0.5 + 0.5, s.y / s.w * 0.5 + 0.5];
      }
    }
    const sunCol = mixA([1.0, 0.9, 0.74], [1.0, 0.46, 0.16], set), sunEdge = sunUV ? Math.max(Math.abs(sunUV[0] - 0.5), Math.abs(sunUV[1] - 0.5)) : 9;
    const sunK = sunUV ? bliss * (1 - night) * (1 - sstep(0.5, 0.75, sunEdge)) * (0.6 + 0.8 * set) : 0;

    this.info = { fov, sunUV, sunK, mb: mbOn, cut: this.cutNow };   // for looking at it from the console
    const depth = this.sceneRT.depthTexture;
    let hdr = this.sceneRT.texture;
    if (q > 0) {
      // 1. contact shading
      const hw = this.aoA.width, hh = this.aoA.height;
      this.zh.uniforms.tDepth.value = depth; this.pass(this.zh, this.zhRT);
      let u = this.ao.uniforms; const rad = 0.1;
      u.tZ.value = this.zhRT.texture; u.uHalf.value.set(hw, hh); u.uRadius.value = rad; u.uMaxPx.value = hh * 0.09;
      u.uFall.value.set(-1 / (rad * 0.615), (rad * (1 - 0.615)) / (rad * 0.615) + 1); u.uSlices.value = q > 1 ? 3 : 2; u.uSteps.value = q > 1 ? 6 : 4;
      this.pass(this.ao, this.aoA);
      u = this.aoDn.uniforms; u.uHalf.value.set(hw, hh);
      u.tAO.value = this.aoA.texture; u.uDir.value.set(1, 0); this.pass(this.aoDn, this.aoB);
      u.tAO.value = this.aoB.texture; u.uDir.value.set(0, 1); this.pass(this.aoDn, this.aoA);
      u = this.prep.uniforms;
      u.tScene.value = hdr; u.tAO.value = this.aoA.texture; u.tDepth.value = depth; u.uHalf.value.set(hw, hh); u.uRes.value.set(w, h);
      u.uAO.value = P.uAO; u.uUseAO.value = 1; u.uFocus.value = P.uFocus; u.uAperture.value = q > 1 ? P.uAperture : 0; u.uMaxCoc.value = P.uMaxCoc * h / 900;
      u.uCurv.value = q > 1 ? 0.006 * wide * (P.uAperture > 0 ? 1 : 0) : 0;
      this.pass(this.prep, this.prepRT); hdr = this.prepRT.texture;
      // 2. motion blur
      if (mbOn) {
        u = this.mb.uniforms; u.tSrc.value = hdr; u.tDepth.value = depth; u.uReproj.value.copy(this.reproj); u.uRes.value.set(w, h);
        u.uShutter.value = 0.5 * P.uMBlur; u.uMaxV.value = 0.07 * w; u.uTaps.value = q > 1 ? 12 : 8;
        this.pass(this.mb, this.mbRT); hdr = this.mbRT.texture;
      }
      // 3. the lens
      if (q > 1 && P.uAperture > 0) {
        u = this.ddown.uniforms; u.tSrc.value = hdr; u.uTexel.value.set(1 / w, 1 / h); this.pass(this.ddown, this.dHalf);
        this.tile.uniforms.tSrc.value = this.dHalf.texture; this.pass(this.tile, this.dTile);
        this.neigh.uniforms.tSrc.value = this.dTile.texture; this.pass(this.neigh, this.dTile2);
        u = this.gather.uniforms; u.tHalf.value = this.dHalf.texture; u.tTile.value = this.dTile2.texture; u.uHalf.value.set(this.dHalf.width, this.dHalf.height); u.uAspect.value = aspect;
        u.uCat.value = 0.25 + 0.4 * wide;
        this.pass(this.gather, this.dGather);
        u = this.dmix.uniforms; u.tSharp.value = hdr; u.tBg.value = this.dGather.textures[0]; u.tFg.value = this.dGather.textures[1];
        this.pass(this.dmix, this.dofRT); hdr = this.dofRT.texture;
      }
    }
    // 4. light: the glow chain
    let src = hdr, sw = w, sh = h;
    this.mips.forEach((m, i) => {
      const u = this.down.uniforms;
      u.tSrc.value = src; u.uTexel.value.set(1 / sw, 1 / sh); u.uThresh.value = i === 0 ? P.uThresh : 0; u.uKaris.value = i === 0 ? 1 : 0; u.uWide.value = q > 0 ? 1 : 0;
      this.pass(this.down, m); src = m.texture; sw = m.width; sh = m.height;
    });
    for (let i = 3; i >= 0; i--) {                                   // blur back up the chain, adding each level back in
      const u = this.up.uniforms, s = i === 3 ? this.mips[4] : this.ups[i + 1];
      u.tSrc.value = s.texture; u.tAdd.value = this.mips[i].texture; u.uTexel.value.set(1 / s.width, 1 / s.height);
      this.pass(this.up, this.ups[i]);
    }
    // star streaks from what is brightest (the flash's glints, the screens, the sun)
    const streak = q > 1 ? P.uStreak * (0.05 * room + 0.025 * y2k + 0.03 * bliss + 0.012 * white) * (1 + 1.5 * pop) : 0;
    if (streak > 0) {
      const u = this.streak.uniforms, m1 = this.mips[1], tx = 1 / m1.width, ty = 1 / m1.height;
      const run = (s, d, x, y, fall, thr) => { u.tSrc.value = s.texture; u.uStep.value.set(x, y); u.uFall.value = fall; u.uThr.value = thr; this.pass(this.streak, d); };
      run(m1, this.stA, tx, 0, 0.9, 1.5); run(this.stA, this.stB, tx * 4, 0, 0.66, 0); run(this.stB, this.stA, tx * 16, 0, 0.19, 0);
      run(m1, this.stC, 0, ty, 0.88, 2.2); run(this.stC, this.stD, 0, ty * 4, 0.6, 0);
    }
    // light shafts: from the sun on the hill; from the middle of the white and of a white-out
    let shaft = 0, shSrc = [0.5, 0.56], shCol = [1, 1, 1], spread = 2.2, thr = 1.2;
    if (q > 0) {
      if (sunUV && sunK > 0) { shSrc = sunUV; shCol = sunCol; spread = 5; thr = 1.0; shaft = P.uShaft * sunK * (0.35 + 0.9 * set) * (1 - sstep(0.6, 1.2, sunEdge)); }
      const wh = P.uShaft * (0.025 * white + 0.6 * clamp01(P.uFlash) + 0.08 * y2k);
      if (wh > shaft) { shaft = wh; shSrc = [0.5, 0.56]; shCol = [1, 0.98, 0.95]; spread = 1.4; thr = 1.6; }
    }
    if (shaft > 0.002) {
      let u = this.shMask.uniforms;
      u.tHdr.value = hdr; u.tDepth.value = depth; u.uSrc.value.set(...shSrc); u.uTexel.value.set(1 / w, 1 / h); u.uAspect.value = aspect; u.uSky.value = 1; u.uThr.value = thr; u.uSpread.value = spread;
      this.pass(this.shMask, this.shA);
      u = this.radial.uniforms; u.uSrc.value.set(...shSrc);
      u.tSrc.value = this.shA.texture; u.uLen.value = 0.7; this.pass(this.radial, this.shB);
      u.tSrc.value = this.shB.texture; u.uLen.value = 0.7 / 8; this.pass(this.radial, this.shA);
      u.tSrc.value = this.shA.texture; u.uLen.value = 0.7 / 64; this.pass(this.radial, this.shB);
    }
    if (sunK > 0) { const u = this.sunVis.uniforms; u.tDepth.value = depth; u.uSrc.value.set(...sunUV); u.uR.value.set(0.03 / aspect, 0.03); this.pass(this.sunVis, this.visRT); }

    // 5. the film
    const gw = { room, fly: y2k, noon: bliss * (1 - set - night), sunset: bliss * set, night: bliss * night, white };
    let tot = 0; const g = { lift: [0, 0, 0], gamma: [0, 0, 0], gain: [0, 0, 0], sat: 0, con: 0 };
    for (const k in gw) {
      const x = gw[k]; if (x <= 0) continue; tot += x; const G = GRADE[k];
      for (const c of ['lift', 'gamma', 'gain']) for (let i = 0; i < 3; i++) g[c][i] += G[c][i] * x;
      g.sat += G.sat * x; g.con += G.con * x;
    }
    if (tot < 1e-3) { Object.assign(g, GRADE.room); tot = 1; }
    let u = this.develop.uniforms;
    u.tHdr.value = hdr; u.tDepth.value = depth; u.tBloom.value = this.ups[0].texture; u.tHal.value = this.mips[0].texture; u.tWide.value = this.ups[2].texture;
    u.tStrH.value = q > 1 ? this.stA.texture : null; u.tStrV.value = q > 1 ? this.stD.texture : null; u.tShaft.value = q > 0 ? this.shB.texture : null; u.tVis.value = q > 0 ? this.visRT.texture : null;
    u.tDirt.value = this.dirt; u.tGhost.value = this.mips[1].texture;
    u.uRes.value.set(w, h);
    for (const k of ['uExposure', 'uSat', 'uContrast', 'uWarm', 'uVig']) u[k].value = P[k];
    u.uBloom.value = P.uBloom * 0.9; u.uHal.value = P.uHal * 2.5;
    u.uVigN.value = 0.1 + 0.4 * wide;
    u.uStreak.value = streak; u.uShaft.value = shaft > 0.002 ? shaft : 0; u.uShaftCol.value.set(...shCol);
    u.uSunK.value = sunK; if (sunUV) u.uSun.value.set(...sunUV); u.uSunCol.value.set(...sunCol);
    u.uGhost.value = q > 1 ? P.uGhost * (0.015 + 0.04 * pop) * room : 0;
    u.uDirt.value = q > 0 ? P.uDirt * (0.5 * (1 - white) * (1 - 0.6 * y2k) + 1.5 * sunK) : 0;   // a field of white is not a source: no smudges over the white
    u.uHaze.value = q > 0 ? P.uHaze * 0.05 * room : 0; u.uHazeStart.value = Math.max(0.5, 0.55 * (P.uFocus || 2)); u.uHazeGlow.value = 0.1; u.uHazeCol.value.set(0.0005, 0.0006, 0.001);
    u.uVeil.value = q > 0 ? P.uVeil * 0.012 * pop * room : 0; u.uOrbs.value = q > 0 ? P.uOrbs * 0.05 * pop * room : 0; u.uSeed.value = this.seed;
    u.uEdge.value = q > 0 ? 1 : 0;
    u.uLift.value.set(...g.lift.map((x) => x / tot)); u.uGamma.value.set(...g.gamma.map((x) => x / tot)); u.uGain.value.set(...g.gain.map((x) => x / tot)); u.uGSat.value = g.sat / tot; u.uGCon.value = g.con / tot;
    this.pass(this.develop, this.ldr);

    // 6. the treatment
    u = this.comp.uniforms;
    u.tFrame.value = this.ldr.texture; u.uRes.value.set(w, h); u.uTime.value = fx.time;
    for (const k of ['uFlash', 'uSplit', 'uZoom', 'uTri', 'uInv', 'uGrain', 'uVig', 'uGlitch', 'uPixel', 'uTrail', 'uMBlur', 'uTile', 'uCrt']) u[k].value = P[k];
    if (P.win) u.uWin.value.set(...P.win); else u.uWin.value.set(0, 0, 0, 0);
    u.uTint.value.set(...(P.tint || [1, 1, 1]));
    if (P.vel) u.uVel.value.set(P.vel[0], P.vel[1]);
    // the barrel of a wide lens (scaled so the corners stay filled), the image breathing a little as the focus pulls close
    const k = 0.045 * wide - 0.008 * (1 - wide), rc = 0.25 * aspect * aspect + 0.25;
    u.uBarrel.value = k; u.uScale.value = 1 / (1 + Math.max(0, k) * rc) / (1 + 0.012 * clamp01(1.6 / Math.max(0.3, P.uFocus || 2)));
    u.uCA.value = 0.0025 * (0.7 + 0.8 * wide);
    u.uQ.value = q; u.uSharp.value = q > 0 ? P.uSharp : 0; u.uSoft.value = q > 0 ? 0.35 * wide : 0;
    u.uDigi.value = q > 0 ? sstep(0.04, 0.3, P.uGlitch + P.uPixel) : 1;    // the stepped blur: always on phones (no real blur there), a style elsewhere
    // composite into one of two targets, show it, and keep it as the next frame's afterimage
    const out = this.outs[this.flip], prev = this.outs[1 - this.flip]; this.flip = 1 - this.flip;
    u.tPrev.value = prev.texture;
    this.pass(this.comp, out);
    const D = this.debug;
    this.copy.uniforms.t.value = D === 'ao' ? this.aoA.texture : D === 'bloom' ? this.ups[0].texture : D === 'scene' ? this.sceneRT.texture : D === 'shaft' ? this.shB?.texture : D === 'streak' ? this.stA?.texture
      : D === 'dofbg' ? this.dGather?.textures[0] : D === 'doffg' ? this.dGather?.textures[1] : D === 'hdr' ? hdr : out.texture;   // debug: look at one stage
    r.setRenderTarget(null); r.setViewport(0, 0, fx.out[0] / r.getPixelRatio(), fx.out[1] / r.getPixelRatio());
    this.pass(this.copy, null);
  }
}
