// What years do to hardware, as a few small shared maps and one shader hook: plastic that has yellowed unevenly (more on
// the faces the sun saw), a fine moulded grain, dust settled on the tops, edges scuffed by hands, glass smudged by
// fingers, and on the frankencomputers a mineral crust of chipped facets and cracks. The maps are generated once and
// sampled in each part's own space (metres), so a button and a tower share them at the same scale and nothing stretches.
import * as THREE from 'three';

// ---------------- the maps ----------------
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
// tileable value noise: a lattice of `per` cells across `n` pixels that wraps at the edges
function vnoise(n, per, seed) {
  const R = rand(seed), L = new Float32Array(per * per).map(() => R()), out = new Float32Array(n * n), s = per / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x * s, fy = y * s, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty), x1 = (ix + 1) % per, y1 = (iy + 1) % per;
    const a = L[iy * per + ix], b = L[iy * per + x1], c = L[y1 * per + ix], d = L[y1 * per + x1];
    out[y * n + x] = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  return out;
}
function fbm(n, per, oct, seed) {
  const out = new Float32Array(n * n); let amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { const v = vnoise(n, per << o, seed + o * 101); for (let i = 0; i < out.length; i++) out[i] += v[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const stretch = (a, lo, hi) => { for (let i = 0; i < a.length; i++) a[i] = Math.max(0, Math.min(1, (a[i] - lo) / (hi - lo))); return a; };
function tex(n, data, filter = true) {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = filter; t.minFilter = filter ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4; t.needsUpdate = true; return t;
}
// a soft line into a wrapping float buffer (scratches)
function line(buf, n, x0, y0, x1, y1, v, w = 0.8) {
  const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, fade = Math.sin(Math.PI * t) ** 0.5;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const px = Math.floor(x) + ox, py = Math.floor(y) + oy, d = Math.hypot(px + 0.5 - x, py + 0.5 - y), k = Math.max(0, 1 - d / (w + 0.5));
      const j = ((py % n + n) % n) * n + ((px % n + n) % n); buf[j] = Math.max(buf[j], v * k * fade);
    }
  }
}
let MAPS = null;
export function maps() {
  if (MAPS) return MAPS;
  // 1. the surface, 512 px over 0.16 m: moulded grain as a normal (rg) and a height (b); scratches (a)
  const n1 = 512, grain = fbm(n1, 64, 3, 11), fine = vnoise(n1, 256, 17), h = grain.map((g, i) => g * 0.55 + fine[i] * 0.45);
  const scr = new Float32Array(n1 * n1), R = rand(5);
  for (let i = 0; i < 260; i++) {                                    // mostly short, a few long; drawn along a couple of favourite directions (hands)
    const x = R() * n1, y = R() * n1, a = (R() < 0.6 ? 0.3 : 1.9) + (R() - 0.5) * 0.9, l = 4 + R() ** 3 * 120;
    line(scr, n1, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.35 + R() * 0.65, R() < 0.8 ? 0.6 : 1.1);
  }
  const d1 = new Uint8Array(n1 * n1 * 4);
  for (let y = 0; y < n1; y++) for (let x = 0; x < n1; x++) {
    const i = y * n1 + x, hx = h[y * n1 + (x + 1) % n1] - h[y * n1 + (x + n1 - 1) % n1], hy = h[((y + 1) % n1) * n1 + x] - h[((y + n1 - 1) % n1) * n1 + x];
    d1[i * 4] = 128 + Math.max(-127, Math.min(127, -hx * 900)); d1[i * 4 + 1] = 128 + Math.max(-127, Math.min(127, -hy * 900));
    d1[i * 4 + 2] = h[i] * 255; d1[i * 4 + 3] = scr[i] * 255;
  }
  // 2. the patches, 256 px over 0.7 m: where it yellowed (r), where dust lies (g), fingerprints and wipes (b), where edges wore (a)
  const n2 = 256, yel = stretch(fbm(n2, 4, 4, 23), 0.25, 0.75), dust = stretch(fbm(n2, 6, 4, 29), 0.3, 0.7), wear = stretch(fbm(n2, 10, 3, 37), 0.3, 0.7);
  const smudge = new Float32Array(n2 * n2), R2 = rand(41);
  for (let k = 0; k < 34; k++) {                                     // fingerprints: ridged ovals, some smeared
    const cx = R2() * n2, cy = R2() * n2, rx = 5 + R2() * 4, ry = rx * (1.25 + R2() * 0.3), a = R2() * Math.PI, ca = Math.cos(a), sa = Math.sin(a), smear = R2() < 0.4 ? 2.5 : 1;
    for (let y = -16; y <= 16; y++) for (let x = -16; x <= 16; x++) {
      const u = (x * ca + y * sa) / (rx * smear), v = (-x * sa + y * ca) / ry, r = Math.hypot(u, v); if (r > 1) continue;
      const j = (((Math.round(cy) + y) % n2 + n2) % n2) * n2 + (((Math.round(cx) + x) % n2 + n2) % n2);
      smudge[j] = Math.max(smudge[j], (1 - r * r) * (smear > 1 ? 0.55 : 0.45 + 0.4 * Math.max(0, Math.sin(r * ry * 2.6))));
    }
  }
  for (let k = 0; k < 7; k++) {                                      // wipe arcs: a cloth dragged round in a sweep
    const cx = R2() * n2, cy = R2() * n2, r0 = 20 + R2() * 50, a0 = R2() * 6.28, sweep = 1 + R2() * 1.5;
    for (let b = 0; b < 9; b++) { const rr = r0 + b * 1.6; let px = cx + Math.cos(a0) * rr, py = cy + Math.sin(a0) * rr;
      for (let s = 1; s <= 40; s++) { const a = a0 + sweep * s / 40, nx = cx + Math.cos(a) * rr, ny = cy + Math.sin(a) * rr; line(smudge, n2, px, py, nx, ny, 0.28 + 0.12 * Math.sin(b * 2.1), 0.7); px = nx; py = ny; } }
  }
  const d2 = new Uint8Array(n2 * n2 * 4);
  for (let i = 0; i < n2 * n2; i++) { d2[i * 4] = yel[i] * 255; d2[i * 4 + 1] = dust[i] * 255; d2[i * 4 + 2] = smudge[i] * 255; d2[i * 4 + 3] = wear[i] * 255; }
  // 3. the crust, 256 px (sampled at two scales): chipped facets, each a tilted plane (normal rg), a stone tone per facet (b), the cracks between (a)
  const n3 = 256, G = 12, cell = n3 / G, R3 = rand(53), pts = [];
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) pts.push({ x: (gx + 0.15 + R3() * 0.7) * cell, y: (gy + 0.15 + R3() * 0.7) * cell, nx: (R3() - 0.5) * 0.9, ny: (R3() - 0.5) * 0.9, t: R3() });
  const pit = vnoise(n3, 48, 59), d3 = new Uint8Array(n3 * n3 * 4);
  for (let y = 0; y < n3; y++) for (let x = 0; x < n3; x++) {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell); let b1 = 1e9, b2 = 1e9, best = null;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy, p = pts[((cy + G) % G) * G + ((cx + G) % G)], px = p.x + (cx < 0 ? -n3 : cx >= G ? n3 : 0), py = p.y + (cy < 0 ? -n3 : cy >= G ? n3 : 0);
      const d = Math.hypot(x - px, y - py); if (d < b1) { b2 = b1; b1 = d; best = p; } else if (d < b2) b2 = d;
    }
    const i = (y * n3 + x) * 4, edge = Math.max(0, 1 - (b2 - b1) / 1.8), pv = pit[y * n3 + x];
    d3[i] = 128 + best.nx * 127 * (1 - edge * 0.5); d3[i + 1] = 128 + best.ny * 127 * (1 - edge * 0.5);
    d3[i + 2] = Math.max(0, Math.min(255, (best.t * 0.75 + pv * 0.25) * 255)); d3[i + 3] = Math.max(edge * edge, pv > 0.78 ? (pv - 0.78) * 4 : 0) * 255;
  }
  MAPS = { surf: tex(n1, d1), patch: tex(n2, d2), crust: tex(n3, d3) };
  return MAPS;
}

// ---------------- the shader hook ----------------
const VERT_HEAD = 'varying vec3 vWP; varying vec3 vWN; varying mat3 vWM; varying vec2 vCrUv;';
const VERT_BODY = `
  vWP = transformed; vWN = objectNormal; vWM = normalMatrix; vCrUv = uv;
  #ifdef USE_INSTANCING
    vWP = (instanceMatrix * vec4(transformed, 1.0)).xyz; vWN = mat3(instanceMatrix) * objectNormal;
  #endif`;
const FRAG_HEAD = `varying vec3 vWP; varying vec3 vWN; varying mat3 vWM; varying vec2 vCrUv;
uniform sampler2D tSurf, tPatch, tCrust; uniform float uAge, uDust, uWear, uCrust, uGrain, uSeed; uniform vec3 uYellow;
vec4 triS(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
// a normal map sampled three ways, its tilt brought back into the part's space
vec3 triN(sampler2D t, vec3 p, vec3 w) {
  vec2 a = texture2D(t, p.zy).xy * 2.0 - 1.0, b = texture2D(t, p.xz).xy * 2.0 - 1.0, c = texture2D(t, p.xy).xy * 2.0 - 1.0;
  return vec3(0.0, a.y, a.x) * w.x + vec3(b.x, 0.0, b.y) * w.y + vec3(c.x, c.y, 0.0) * w.z;
}`;
const FRAG_MAP = `
  vec3 wN = normalize(vWN), wW = pow(abs(wN), vec3(4.0)); wW /= dot(wW, vec3(1.0));
  vec3 wP = vWP + uSeed;
  vec4 wS = triS(tSurf, wP / 0.16, wW), wPa = triS(tPatch, wP / 0.7, wW);
  float wUp = smoothstep(0.35, 0.95, wN.y), wCurv = length(fwidth(wN)) / max(length(fwidth(vWP)), 1e-6);
  float wEdge = smoothstep(20.0, 180.0, wCurv) * uWear * (0.35 + 0.65 * wPa.a);
  // yellowing: patchy, strongest on the top and the front (the faces a window lit for years)
  float wYel = uAge * clamp((0.35 + 0.4 * wUp + 0.25 * max(wN.z, 0.0)) * (0.45 + 0.9 * wPa.r), 0.0, 1.0);
  diffuseColor.rgb *= mix(vec3(1.0), uYellow, wYel);
  diffuseColor.rgb *= 0.965 + 0.07 * wS.b * uGrain;                         // the moulded grain
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.72, wEdge * 0.55);           // handled edges: skin oil and grime
  diffuseColor.rgb = mix(diffuseColor.rgb, min(vec3(1.0), diffuseColor.rgb * 1.12 + 0.03), wS.a * 0.45 * uWear);   // scratches catch white
  float wDust = uDust * clamp(wUp * 0.85 + 0.25, 0.0, 1.0) * smoothstep(0.15, 0.85, wPa.g) * (1.0 - 0.8 * wPa.b);
  float wCr = 0.0; vec4 wC = vec4(0.5, 0.5, 0.5, 0.0);
  #ifdef WEAR_CRUST
    wC = mix(triS(tCrust, wP / 0.32, wW), triS(tCrust, wP / 0.11 + 0.37, wW), 0.4);
    wCr = uCrust * smoothstep(0.2, 0.55, wPa.r * 0.6 + wPa.a * 0.5 + wEdge * 0.6 + 0.2 * uCrust);
    vec3 stone = mix(vec3(0.3, 0.29, 0.27), vec3(0.47, 0.45, 0.41), wC.b) * (0.86 + 0.28 * wS.b) * mix(vec3(1.0), vec3(1.0, 0.93, 0.8), wPa.r);
    stone = mix(stone, vec3(0.07, 0.065, 0.06), wC.a * 0.7);               // the cracks and pits
    #ifdef CRUST_SHELL
      wCr = 1.0;                                                            // a shell is all crust: uv = (how deep in a crevice, this facet's tone)
      stone *= mix(0.75, 1.25, vCrUv.y) * mix(1.0, 0.3, vCrUv.x);
    #endif
    diffuseColor.rgb = mix(diffuseColor.rgb, stone, wCr);
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.37), wDust * 0.55);`;
const FRAG_ROUGH = `
  roughnessFactor = clamp(roughnessFactor * (0.9 + 0.2 * wS.b) + wEdge * 0.12 + wS.a * 0.12 * uWear + wDust * 0.4 + wCr * 0.5 - wPa.b * 0.1 * (1.0 - wCr), 0.04, 1.0);`;
const FRAG_NORMAL = `
  {
    vec3 d = triN(tSurf, wP / 0.16, wW) * 0.032 * uGrain;
    #ifdef WEAR_CRUST
      d = mix(d, triN(tCrust, wP / 0.32, wW) * 0.35 + triN(tCrust, wP / 0.11 + 0.37, wW) * 0.2, wCr);
    #endif
    d -= wN * dot(d, wN);
    vec3 dv = vWM * d; normal = normalize(normal + dv * faceDirection);
    roughnessFactor = min(1.0, roughnessFactor + 1.5 * length(fwidth(normal)));   // where the normal swings faster than a pixel, spread the highlight instead of sparkling
  }`;
// hook a standard or physical material: aged plastic, optionally crusted
export function age(m, { age = 0.5, dust = 0.4, wear = 0.5, crust = 0, grain = 1, yellow = 0xe8c47a, seed, shell = false } = {}) {
  const M = maps(), prev = m.onBeforeCompile;
  m.userData.wear = { uAge: { value: age }, uDust: { value: dust }, uWear: { value: wear }, uCrust: { value: crust }, uGrain: { value: grain }, uSeed: { value: seed ?? Math.random() * 10 },
    uYellow: { value: new THREE.Color(yellow) }, tSurf: { value: M.surf }, tPatch: { value: M.patch }, tCrust: { value: M.crust } };
  if (crust > 0) m.defines = { ...(m.defines || {}), WEAR_CRUST: '', ...(shell ? { CRUST_SHELL: '' } : {}) };
  m.onBeforeCompile = (s, r) => {
    prev?.call(m, s, r);
    Object.assign(s.uniforms, m.userData.wear);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL);
  };
  m.customProgramCacheKey = () => 'wear' + (crust > 0 ? 'C' : '') + (shell ? 'S' : '') + (m.isMeshPhysicalMaterial ? 'P' : '');
  return m;
}
export const plastic = (color, rough = 0.55, o = {}) => age(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: o.metal || 0 }), o);

// ---------------- glass ----------------
// Glass over a picture: drawn after it and added on top, so it can only add what glass adds, reflections. A tube face
// is glossy and catches the flash as a hard spot; a flat panel's anti-glare coat spreads it into a soft sheen. The
// fingerprints and wipe marks change how rough it is, so they show only where a light or the room is reflected.
let GLASS = null;
function glassMap() {
  if (GLASS) return GLASS;
  const P = maps(), n = 256, src = P.patch.image.data, d = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) { const s = src[i * 4 + 2] / 255, dust = src[i * 4 + 1] / 255; d[i * 4] = 255; d[i * 4 + 1] = Math.min(255, (0.05 + s * 0.55 + dust * dust * 0.08) * 255); d[i * 4 + 2] = 0; d[i * 4 + 3] = 255; }
  GLASS = tex(n, d); return GLASS;
}
export function glassMat({ rough = 1, env = 3, matte = false, tint = 0x000000 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: tint, roughness: matte ? 0.55 : rough, roughnessMap: matte ? null : glassMap(), metalness: 0, ior: matte ? 1.2 : 1.52,
    envMapIntensity: matte ? env * 0.3 : env, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, premultipliedAlpha: false });
  m.userData.glass = true;
  return m;
}
// a glass shell a hair in front of a screen quad (same bulge), over the same area plus the border it sits in
export function glassOver(scr, w, h, bulge = 0, gap = 0.0012, opts = {}) {
  const g = new THREE.PlaneGeometry(w, h, bulge ? 16 : 1, bulge ? 12 : 1), p = g.attributes.position, rw = opts.rw || w, rh = opts.rh || h;
  if (bulge) for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (rw / 2), y = p.getY(i) / (rh / 2); p.setZ(i, bulge * (1 - 0.5 * (x * x + y * y))); }
  g.computeVertexNormals();
  const uv = g.attributes.uv, o = Math.random(); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 0.7 + o, uv.getY(i) * h / 0.7 + o);   // smudges at their real size
  const m = new THREE.Mesh(g, glassMat(opts)); m.position.copy(scr.position); m.rotation.copy(scr.rotation); m.translateZ(gap); m.renderOrder = 2;
  m.userData.keep = true;
  return m;
}

// ---------------- light ----------------
// an indicator LED: a small domed lens, lit far above white so the camera's glow catches it
export function ledMat(color, k = 5) { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }); m.userData.hdr = k; m.toneMapped = false; return m; }
export const ledSet = (m, k = m.userData.hdr || 5) => m.color.multiplyScalar(k);
