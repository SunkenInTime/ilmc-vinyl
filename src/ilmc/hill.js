// The Bliss hill as a place: the ground's paint (mown stripes round the pile, a footpath, a country road, a tulip field,
// cloud shadows crossing), grass that is grass up close, flowers, a tree, pylons, a kite. Built by sky.js (which owns the
// hill's shape and the sky over it) and moved by the music through Sky.live(), which fx.js calls every frame.
//
// The grass is two windows of tufts that follow the camera over the ground: a dense one round where it looks, a sparse
// wide one behind it. Each tuft has a fixed spot in the world, so moving the camera never drags the grass along; the
// windows only decide which spots are drawn, and fade at their edges into the painted ground. Where the pile lies (the
// machines, the deck, rugs, clothes, cables) the grass does not grow: a picture of the pile taken from straight above
// (mask()) is the lawn's map of what is lying on it.
import * as THREE from 'three';

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
// The hill, in the room's own coordinates (y up, metres, 0 = the bedroom floor's level): flat where the pile stands,
// falling away all round so the horizon is other hills, with the wallpaper's long swell rising behind.
export function hill(x, z) {
  const r = Math.hypot(x, z), away = ss(2.4, 14, r);
  let h = -1.1 * away - 0.9 * ss(14, 60, r);
  h += 0.22 * away * Math.sin(x * 0.31 + 1.7) * Math.sin(z * 0.27 - 0.6);
  h += away * (7.5 * bump(x, z, -26, -58, 30) + 5.5 * bump(x, z, 40, -74, 26) + 3.2 * bump(x, z, 12, -34, 13) + 4.5 * bump(x, z, -62, -20, 28) + 4 * bump(x, z, 70, 10, 30) + 3 * bump(x, z, -10, 60, 30));
  return h;
}
// the footpath's middle line (x at a given z), behind the pile and away up the big hill
const pathX = (z) => 0.8 + 2.5 * Math.sin(z * 0.12 + 0.5) + 0.35 * z;
const onPath = (x, z) => z < -2.2 && Math.abs(x - pathX(z)) < 0.7;

// The same land, in GLSL: the hill's height, and what colour the ground is at a spot (albedo, before the light)
export const LAND_GLSL = `
float lh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ln(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
float lfbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * ln(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float lbump(vec2 p, vec2 c, float r) { vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
float hillH(vec2 p) {
  float r = length(p), away = smoothstep(2.4, 14.0, r);
  float h = -1.1 * away - 0.9 * smoothstep(14.0, 60.0, r);
  h += 0.22 * away * sin(p.x * 0.31 + 1.7) * sin(p.y * 0.27 - 0.6);
  h += away * (7.5 * lbump(p, vec2(-26, -58), 30.0) + 5.5 * lbump(p, vec2(40, -74), 26.0) + 3.2 * lbump(p, vec2(12, -34), 13.0) + 4.5 * lbump(p, vec2(-62, -20), 28.0) + 4.0 * lbump(p, vec2(70, 10), 30.0) + 3.0 * lbump(p, vec2(-10, 60), 30.0));
  return h;
}
float pathD(vec2 p) { if (p.y > -1.6) return 99.0; float cx = 0.8 + 2.5 * sin(p.y * 0.12 + 0.5) + 0.35 * p.y; return abs(p.x - cx) / (1.0 + smoothstep(-2.6, -1.6, p.y) * 3.0); }
float roadD(vec2 p) { return abs(p.y - (-46.0 + 7.0 * sin(p.x * 0.035 + 1.0))); }
// the tulip field: rows of one colour each, on the slope behind the pile
vec4 tulips(vec2 p) {
  vec2 c = p - vec2(17.0, -29.0); float a = 0.42; vec2 q = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a));
  if (abs(q.x) > 15.0 || abs(q.y) > 7.5) return vec4(0.0);
  float band = floor(q.y / 1.5), inRow = smoothstep(0.5, 0.4, abs(fract(q.y / 1.5) - 0.5) * 1.5);
  float k = lh(vec2(band, 3.0));
  vec3 col = k < 0.2 ? vec3(0.9, 0.03, 0.03) : k < 0.4 ? vec3(1.0, 0.75, 0.02) : k < 0.55 ? vec3(1.0, 0.25, 0.5) : k < 0.7 ? vec3(0.95, 0.92, 0.85) : k < 0.85 ? vec3(1.0, 0.35, 0.02) : vec3(0.45, 0.08, 0.5);
  float dots = smoothstep(0.35, 0.75, ln(q * vec2(6.0, 7.0)) * 0.6 + ln(q * 13.0) * 0.4);
  float edge = smoothstep(15.0, 14.0, abs(q.x)) * smoothstep(7.5, 7.0, abs(q.y));
  return vec4(col, inRow * (0.55 + 0.45 * dots) * edge);
}
uniform float uLandT, uCloudK;
vec3 land(vec2 q, float d) {
  float big = lfbm(q * 0.07), mid = lfbm(q * 0.9 + 3.0);
  vec3 g = mix(vec3(0.045, 0.17, 0.012), vec3(0.2, 0.44, 0.035), smoothstep(0.25, 0.8, big * 0.6 + mid * 0.4));
  g = mix(g, vec3(0.42, 0.52, 0.08), smoothstep(0.62, 0.9, mid) * 0.35);                                           // drier, yellower patches
  if (d < 30.0) { float fine = ln(q * vec2(34.0, 90.0)) * ln(q * 61.0); g *= 0.72 + 0.56 * mix(fine, 0.5, smoothstep(2.0, 14.0, d)); }
  float r = length(q);
  { vec2 sd = vec2(0.8, 0.6); float st = step(0.5, fract(dot(q, sd) / 2.6));                                        // mown in stripes round the pile
    g *= 1.0 + (st - 0.5) * 0.22 * smoothstep(20.0, 12.0, r) * smoothstep(1.0, 3.0, r); }
  { vec4 t = tulips(q); g = mix(g, mix(vec3(0.05, 0.16, 0.03), t.rgb, t.a), smoothstep(0.0, 0.05, t.a) * 0.9 + 0.1 * t.a); }
  { float pd = pathD(q); vec3 earth = mix(vec3(0.36, 0.26, 0.16), vec3(0.5, 0.42, 0.3), ln(q * 9.0)) * (0.85 + 0.3 * ln(q * 40.0));
    g = mix(g, earth, smoothstep(0.55, 0.32, pd + 0.12 * ln(q * 3.0))); }
  { float rd = roadD(q); vec3 tar = vec3(0.09, 0.09, 0.1) + 0.03 * ln(q * 4.0);
    float dash = step(0.55, fract(q.x / 6.0)) * smoothstep(0.12, 0.06, rd);
    g = mix(g, vec3(0.32, 0.29, 0.22), smoothstep(2.6, 2.2, rd)); g = mix(g, tar, smoothstep(2.1, 1.9, rd)); g = mix(g, vec3(0.9, 0.85, 0.6), dash); }
  // the shadows of the clouds, crossing with the wind
  float cs = smoothstep(0.48, 0.72, lfbm(q * 0.022 + vec2(uLandT * 0.045, uLandT * 0.015)));
  return g * (1.0 - 0.42 * cs * uCloudK);
}`;

// ---------------- the pieces ----------------
// one patch: four blades a few centimetres apart, each two segments and a point (bl: lean direction, lean, height, and
// where in the patch it stands)
function tuftGeometry() {
  const pos = [], bl = [], bo = [], nor = [], idx = []; let v = 0;
  for (let b = 0; b < 4; b++) {
    const yaw = b * 1.7 + 0.4, lean = 0.15 + 0.12 * b, hs = [1, 0.8, 0.65, 0.9][b], off = [[0, 0], [0.045, 0.02], [-0.03, 0.04], [0.015, -0.045]][b];
    for (const [x, y] of [[-0.5, 0], [0.5, 0], [-0.36, 0.45], [0.36, 0.45], [0, 1]]) { pos.push(x, y, 0); bl.push(yaw, lean, hs, b); bo.push(...off); nor.push(0, 1, 0); }
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2, v + 2, v + 3, v + 4); v += 5;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('bl', new THREE.Float32BufferAttribute(bl, 4)); g.setAttribute('bo', new THREE.Float32BufferAttribute(bo, 2)); g.setIndex(idx);
  return g;
}
// a tulip: a cup of six petals on a stem with two leaves (vertex colour: stem green, the cup white so each one takes its own colour)
function tulipGeometry() {
  const parts = [], green = [0.12, 0.42, 0.08];
  const add = (geo, col, tint) => { const n = geo.attributes.position.count, c = [], t = []; for (let i = 0; i < n; i++) { c.push(...col); t.push(tint); } geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); geo.setAttribute('aTint', new THREE.Float32BufferAttribute(t, 1)); parts.push(geo.index ? geo.toNonIndexed() : geo); };
  add(new THREE.CylinderGeometry(0.0035, 0.004, 0.3, 3, 1, true).translate(0, 0.15, 0), green, 0);
  for (const s of [-1, 1]) { const l = new THREE.PlaneGeometry(0.03, 0.17, 1, 2); const p = l.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - Math.abs(y) / 0.1)); p.setZ(i, (y + 0.085) ** 2 * 1.4); } l.rotateY(s > 0 ? 0.3 : 3.4).translate(0, 0.085, 0); add(l, [0.16, 0.48, 0.1], 0); }
  // the cup: rounded at the bottom, waisted, its rim cut into six pointed petals
  const cup = new THREE.CylinderGeometry(0.022, 0.012, 0.055, 12, 2, true);
  { const p = cup.attributes.position; for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 0.055 + 0.5, k = 1 + 0.55 * Math.sin(y * Math.PI) - 0.15 * y, a = Math.atan2(p.getZ(i), p.getX(i)), tip = y > 0.99 ? 0.012 * Math.max(0, Math.cos(a * 6)) : 0;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, p.getY(i) + tip); } }
  add(cup.translate(0, 0.325, 0), [1, 1, 1], 1);
  add(new THREE.CircleGeometry(0.016, 8).rotateX(Math.PI / 2).translate(0, 0.298, 0), [1, 1, 1], 1);
  const g = new THREE.BufferGeometry(); const merge = (k, n) => { const out = []; for (const p of parts) out.push(...p.attributes[k].array); return new THREE.Float32BufferAttribute(out, n); };
  g.setAttribute('position', merge('position', 3)); g.setAttribute('color', merge('color', 3)); g.setAttribute('aTint', merge('aTint', 1)); g.computeVertexNormals();
  return g;
}
// a daisy (or a buttercup): a flat star of petals with a yolk, on a short stem
function daisyGeometry() {
  const pos = [], col = [], tint = [], N = 10;
  const tri = (a, b, c, cl, t) => { pos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) { col.push(...cl); tint.push(t); } };
  const h = 0.11, y = [0.18, 0.5, 0.1];
  tri([-0.003, 0, 0], [0.003, 0, 0], [0, h, 0.004], [0.14, 0.42, 0.1], 0); tri([0, 0, -0.003], [0, 0, 0.003], [0.004, h, 0], [0.14, 0.42, 0.1], 0);
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, b = a + Math.PI / N * 0.8, c = a - Math.PI / N * 0.8; tri([0, h, 0], [Math.cos(c) * 0.026, h + 0.002, Math.sin(c) * 0.026], [Math.cos(b) * 0.026, h + 0.002, Math.sin(b) * 0.026], [1, 1, 1], 1); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, b = (i + 1) / 6 * Math.PI * 2; tri([0, h + 0.006, 0], [Math.cos(a) * 0.007, h + 0.004, Math.sin(a) * 0.007], [Math.cos(b) * 0.007, h + 0.004, Math.sin(b) * 0.007], [1, 0.75, 0.05], 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1)); g.computeVertexNormals();
  return g;
}
// the far things, one mesh: a tree on the rise, a farmhouse and a barn, pylons marching over the far hills
function farGeometry(FLOOR) {
  const parts = [];
  const add = (geo, col, x, y, z, ry = 0) => { geo = geo.index ? geo.toNonIndexed() : geo; geo.rotateY(ry).translate(x, y, z); const n = geo.attributes.position.count, c = []; for (let i = 0; i < n; i++) c.push(...col); geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); parts.push(geo); };
  const R = (() => { let s = 777; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
  // the tree: one big oak alone on the rise, a trunk that forks into limbs under a crown of lumps (lighter on top)
  { const tx = 34, tz = -52, ty = FLOOR + hill(tx, tz) - 0.2, bark = [0.2, 0.14, 0.09], at = parts.length;
    add(new THREE.CylinderGeometry(0.32, 0.6, 4.2, 8), bark, tx, ty + 2.1, tz);
    for (const [a, l, tilt] of [[0.4, 2.6, 0.75], [2.1, 2.4, 0.6], [3.6, 2.8, 0.8], [5.2, 2.2, 0.55]]) { const b = new THREE.CylinderGeometry(0.1, 0.24, l, 6); b.translate(0, l / 2, 0).rotateZ(-tilt).rotateY(a); add(b, bark, tx, ty + 3.6, tz); }
    for (let i = 0; i < 44; i++) {
      const a = R() * 6.28, u = R(), r = Math.sqrt(u) * 3.4, yy = (R() - 0.35) * 2.6 * (1 - 0.5 * u), s = 0.8 + R() * 0.9;
      const blob = new THREE.IcosahedronGeometry(s, 1), bp = blob.attributes.position;
      for (let k = 0; k < bp.count; k++) { const x = bp.getX(k), y = bp.getY(k), z = bp.getZ(k), h = Math.sin(x * 12.9 + y * 78.2 + z * 37.7) * 43758.5; bp.setXYZ(k, x * (0.85 + 0.3 * (h - Math.floor(h))), y * 0.8, z * (0.85 + 0.3 * (h * 7 - Math.floor(h * 7)))); }
      const lift = (yy + 1.3) / 3, g = (0.45 + 0.35 * R()) * (0.6 + 0.6 * lift);
      add(blob, [0.05 * g, 0.19 * g, 0.03 * g], tx + Math.cos(a) * r, ty + 6.4 + yy, tz + Math.sin(a) * r);
    }
    for (let k = at; k < parts.length; k++) parts[k].translate(-tx, -ty, -tz).scale(0.8, 0.8, 0.8).translate(tx, ty, tz); }
  // a farmhouse and a barn, far off on the left, with windows
  const house = (x, z, ry, wall, roof, w, d, hh, wins) => {
    const y = FLOOR + hill(x, z) - 0.3, fx = Math.sin(ry), fz = Math.cos(ry);
    add(new THREE.BoxGeometry(w, hh, d), wall, x, y + hh / 2, z, ry);
    const r = new THREE.CylinderGeometry(0.01, w * 0.72, hh * 0.55, 4, 1); r.rotateY(Math.PI / 4).scale(1, 1, d / w); add(r, roof, x, y + hh + hh * 0.27, z, ry);
    add(new THREE.BoxGeometry(w * 0.16, hh * 0.5, 0.06), [0.12, 0.07, 0.05], x + fx * d * 0.5 + fz * w * 0.25, y + hh * 0.25, z + fz * d * 0.5 - fx * w * 0.25, ry);
    for (const [u, v] of wins) add(new THREE.BoxGeometry(w * 0.13, hh * 0.18, 0.06), [0.1, 0.13, 0.2], x + fx * d * 0.5 + fz * w * u, y + hh * v, z + fz * d * 0.5 - fx * w * u, ry);
  };
  house(-36, -70, 0.5, [0.92, 0.9, 0.84], [0.55, 0.1, 0.07], 4.2, 3.4, 3.0, [[-0.22, 0.6], [0.05, 0.6], [-0.05, 0.28]]);
  house(-29.5, -73, 0.45, [0.5, 0.1, 0.07], [0.22, 0.22, 0.24], 5.2, 4, 3.6, [[-0.2, 0.7]]);
  // pylons marching over the far hills: four leaning legs, cross bracing, two arms
  const pyl = [];
  for (let k = 0; k < 7; k++) {
    const x = -95 + k * 31, z = -92 - 8 * Math.sin(k * 0.9), y = FLOOR + hill(x, z) - 0.3, H = 13, s = 0.26, gr = [0.26, 0.27, 0.29], lean = 1.5;
    for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = new THREE.CylinderGeometry(s * 0.5, s, H, 3); leg.rotateX(az * Math.atan(lean / H)).rotateZ(-ax * Math.atan(lean / H)); add(leg, gr, x + ax * lean * 0.5, y + H / 2, z + az * lean * 0.5); }
    for (const [hy, w] of [[H * 0.72, 7], [H * 0.92, 5]]) add(new THREE.BoxGeometry(0.35, 0.3, w), gr, x, y + hy, z);
    for (let j = 1; j < 6; j++) { const b = new THREE.BoxGeometry(0.14, 0.14, 2.9 * (1 - j / 7) + 0.3); b.rotateX(j % 2 ? 0.5 : -0.5); add(b, gr, x, y + j * H / 6.5, z); }
    pyl.push([x, y + H * 0.72, z, 3.3], [x, y + H * 0.72, z, -3.3], [x, y + H * 0.92, z, 2.3], [x, y + H * 0.92, z, -2.3]);
  }
  const g = new THREE.BufferGeometry(); const out = [], col = [];
  for (const p of parts) { out.push(...p.attributes.position.array); col.push(...p.attributes.color.array); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  // the wires: sagging between neighbouring pylons, one segment list
  const w = [];
  for (let k = 0; k + 1 < pyl.length / 4; k++) for (let j = 0; j < 4; j++) {
    const a = pyl[k * 4 + j], b = pyl[k * 4 + 4 + j];
    for (let s = 0; s < 16; s++) { for (const u of [s / 16, (s + 1) / 16]) { w.push(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - 2.2 * 4 * u * (1 - u), a[2] + a[3] * 0.0 + (b[2] - a[2]) * u + a[3]); } }
  }
  const wires = new THREE.BufferGeometry(); wires.setAttribute('position', new THREE.Float32BufferAttribute(w, 3));
  return { g, wires };
}

export class Land {
  // u: the sky's uniforms (shared clock and time of day); root: the room's group
  constructor(root, FLOOR, CX, u) {
    this.root = root; this.FLOOR = FLOOR; this.CX = CX; this.u = u;
    this.group = new THREE.Group(); this.group.visible = false; root.add(this.group);
    const lu = this.lu = {
      uLandT: { value: 0 }, uCloudK: { value: 1 }, uGT: { value: 0 }, uWind: { value: new THREE.Vector3(1, 0, 0.3) }, uRip: { value: new THREE.Vector4(-99, -99, -99, -99) },
      uA0: { value: new THREE.Vector2() }, uA1: { value: new THREE.Vector2() }, uTile: { value: new THREE.Vector2(9, 22) }, uFloorY: { value: FLOOR }, uCX: { value: CX },
      uMask: { value: null }, uMaskBox: { value: new THREE.Vector4(CX, 0, 8, 0) }, uEye: { value: new THREE.Vector3() }, uSunD: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(0, 0, 0) },
    };
    // the lawn's map of what lies on it (mask()): black until the first picture is taken
    this.maskRT = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: true, generateMipmaps: false }); lu.uMask.value = this.maskRT.texture;
    this.maskMat = new THREE.ShaderMaterial({ vertexShader: ['void main() { vec4 p = vec4(position, 1.0);', '#ifdef USE_INSTANCING', 'p = instanceMatrix * p;', '#endif', 'gl_Position = projectionMatrix * modelViewMatrix * p; }'].join('\n'), fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }', side: THREE.DoubleSide });
    this.maskCam = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.05, 12); this.maskCam.matrixAutoUpdate = false; this.maskCam.matrixWorldAutoUpdate = false;
    // two hidden stand-ins so the mask's program (plain and instanced) is built with the room's, not in the middle of the song
    this.warm = new THREE.Group(); this.warm.add(new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001), this.maskMat), new THREE.InstancedMesh(new THREE.PlaneGeometry(0.001, 0.001), this.maskMat, 1));
    for (const m of this.warm.children) { m.frustumCulled = false; m.userData.keep = true; } this.warm.visible = false; root.add(this.warm);
    this.buildGrass(); this.buildFlowers(); this.buildFar(); this.buildKite();
    this.ripN = 0; this.maskN = -1; this.maskAt = -9;
  }
  // the ground's material: the land's paint, under the room's lights and the sun's shadows
  groundMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    m.customProgramCacheKey = () => 'land';                          // its own program: the room wraps every material's hook (psxify), which would otherwise make them all look alike to the cache
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.lu);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = position + vec3(0.0, ' + this.FLOOR.toFixed(3) + ', 0.0);');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGP; uniform vec3 uEye;${LAND_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = land(vGP.xz, length(vGP - uEye));`);
    };
    return m;
  }

  buildGrass() {
    const near = 10000, far = 4000, N = near + far, ofs = new Float32Array(N * 4), T = this.lu.uTile.value;
    for (let i = 0; i < N; i++) {                                   // near and far interleaved, so a cheaper picture (fewer drawn) thins both evenly
      const f = i % 7 >= 5 ? 1 : 0, s = f ? T.y : T.x;
      ofs[i * 4] = Math.random() * s; ofs[i * 4 + 1] = Math.random() * s; ofs[i * 4 + 2] = Math.random(); ofs[i * 4 + 3] = f;
    }
    const g = tuftGeometry(); g.setAttribute('iOfs', new THREE.InstancedBufferAttribute(ofs, 4)); g.instanceCount = N; this.grassN = N;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    m.customProgramCacheKey = () => 'grass-blades';
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.lu);
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 iOfs; attribute vec4 bl; attribute vec2 bo;
uniform vec2 uA0, uA1, uTile; uniform float uGT, uFloorY, uCX; uniform vec3 uWind, uEye; uniform vec4 uRip, uMaskBox; uniform sampler2D uMask;
varying vec3 vGP; varying vec3 vGC; varying float vTip;
${LAND_GLSL}`)
        .replace('#include <beginnormal_vertex>', `
  bool farT = iOfs.w > 0.5; vec2 A = farT ? uA1 : uA0; float T = farT ? uTile.y : uTile.x;
  float ca = cos(iOfs.z * 6.2831), sa = sin(iOfs.z * 6.2831);
  vec2 rel = mod(iOfs.xy - A + 0.5 * T, T) - 0.5 * T, base = A + rel + mat2(ca, sa, -sa, ca) * bo * (farT ? 2.0 : 1.0);   // each patch has its own spot; the window picks which are drawn
  float fade = 1.0 - smoothstep(0.3 * T, 0.48 * T, length(rel));
  vec2 muv = vec2((base.x - uMaskBox.x) / uMaskBox.z + 0.5, 0.5 - (base.y - uMaskBox.y) / uMaskBox.z);
  float cover = all(greaterThan(muv, vec2(0.0))) && all(lessThan(muv, vec2(1.0))) ? texture2D(uMask, muv).r : 0.0;
  vec2 dc = base - vec2(uCX, 0.0); float r = length(dc);
  float meadow = smoothstep(3.2, 7.5, r), hr = fract(iOfs.z * 17.3);
  float H = mix(0.055, 0.2, meadow) * (0.55 + 0.9 * hr) * bl.z * fade * (1.0 - cover) * smoothstep(0.3, 0.6, pathD(base)) * smoothstep(1.9, 2.4, roadD(base));
  float yaw = bl.x + iOfs.z * 6.2831; vec2 dirB = vec2(cos(yaw), sin(yaw)), side = vec2(-dirB.y, dirB.x);
  // the wind: waves rolling over the hill, stronger in a gust; on each kick a ring runs out from the deck and flattens the grass it crosses
  float wave = 0.5 + 0.5 * sin(dot(base, uWind.xy) * 0.8 - uGT * 2.1 + iOfs.z * 2.0) * (0.6 + 0.4 * sin(dot(base, vec2(0.13, 0.31)) - uGT * 0.7));
  float rip = 0.0; for (int k = 0; k < 4; k++) { float age = uGT - uRip[k]; rip += age > 0.0 ? exp(-pow((r - 0.3 - age * 3.4) * 2.0, 2.0)) * exp(-age * 0.9) : 0.0; }
  vec2 bend = dirB * bl.y + uWind.xy * uWind.z * (0.3 + 0.9 * wave) + dc / max(r, 0.01) * rip * 1.3;
  float t = position.y, bt = t * t, bl2 = min(1.0, length(bend));
  vec3 P = vec3(base.x, uFloorY + hillH(base) - 0.004, base.y);
  float wid = (0.0055 + 0.0035 * hr) * (1.0 + 0.09 * distance(P, uEye));      // a little wider far off, so a blade never thins to a flicker
  P.xz += side * position.x * wid * (H > 0.001 ? 1.0 : 0.0) + bend * H * bt * 0.8;
  P.y += H * t * (1.0 - 0.3 * bl2);
  vGP = P; vTip = t;
  vGC = land(base, 99.0) * mix(0.72, 1.22, t) * (0.88 + 0.24 * fract(iOfs.z * 31.7));
  vGC = mix(vGC, vGC * vec3(1.35, 1.2, 0.6), meadow * t * 0.5 * step(0.6, hr));       // seed heads in the long grass
  vec3 objectNormal = normalize(vec3(bend.x * 0.5, 1.0, bend.y * 0.5) + vec3(side.x, 0.0, side.y) * position.x * 0.8);
  #ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
  #endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = P;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uEye, uSunD, uSunC; varying vec3 vGP; varying vec3 vGC; varying float vTip;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = vGC;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uSunC * vGC * 2.2 * pow(max(0.0, dot(normalize(vGP - uEye), uSunD)), 5.0) * vTip;    // backlit blades glow`);
    };
    this.grass = new THREE.Mesh(g, m); this.grass.frustumCulled = false; this.grass.receiveShadow = true; this.grass.userData.keep = true; this.group.add(this.grass);
  }

  buildFlowers() {
    const make = (geo, n, place, cols, tilt) => {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
      m.customProgramCacheKey = () => 'flowers';
      m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, this.lu);
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
attribute float aTint; uniform float uGT; uniform vec3 uWind;`)
          .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
vColor.rgb = color.rgb * mix(vec3(1.0), instanceColor.rgb, aTint);
#endif`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec3 o = instanceMatrix[3].xyz; float k = transformed.y * transformed.y * 4.0;          // flowers nod in the wind
  transformed.xz += (uWind.xy * uWind.z * (0.6 + 0.5 * sin(uGT * 2.3 + o.x * 0.9 + o.z * 0.7)) + vec2(sin(uGT * 1.3 + o.z), cos(uGT * 1.1 + o.x)) * 0.15) * k * 0.12; }`);
      };
      const im = new THREE.InstancedMesh(geo, m, n), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
      let k = 0;
      for (let tries = 0; k < n && tries < n * 20; tries++) {
        const p = place(); if (!p) continue;
        const [x, z, s] = p; if (onPath(x, z)) continue;
        e.set((Math.random() - 0.5) * tilt, Math.random() * 6.28, (Math.random() - 0.5) * tilt); q.setFromEuler(e);
        M.compose(new THREE.Vector3(x, this.FLOOR + hill(x, z) - 0.005, z), q, new THREE.Vector3(s, s * (0.85 + Math.random() * 0.3), s)); im.setMatrixAt(k, M);
        im.setColorAt(k, c.copy(cols[(Math.random() * cols.length) | 0])); k++;
      }
      im.count = k; im.frustumCulled = false; im.receiveShadow = true; im.userData.keep = true; this.group.add(im);
      return im;
    };
    const lin = (h) => new THREE.Color(h);
    const CX = this.CX, eye = [-1.0, 2.55];                          // where the hill's default camera stands: nothing between it and the deck
    const clear = (x, z) => {
      if (Math.hypot(x - CX, z) < 2.5) return false;
      const dx = CX - eye[0], dz = -eye[1], L = Math.hypot(dx, dz), t = ((x - eye[0]) * dx + (z - eye[1]) * dz) / (L * L);
      return !(t > -0.6 && t < 1.2 && Math.abs((x - eye[0]) * dz - (z - eye[1]) * dx) / L < 1.1);
    };
    // tulips: clumps of one colour, like a bed someone planted, and a few strays
    const clumps = Array.from({ length: 26 }, () => { const a = Math.random() * 6.28, r = 4.2 + Math.random() * 7; return [CX + Math.cos(a) * r, Math.sin(a) * r * 0.9, (Math.random() * 6) | 0]; });
    clumps.push([-2.6, 2.1, 0], [-3.1, 1.2, 2], [3.3, 1.6, 3]);                        // in the foreground, either side of the default frame
    const TC = ['#e3101c', '#ffc21a', '#ff4f9a', '#fff4e8', '#ff6a12', '#8a2bd0'].map(lin);
    this.tulips = make(tulipGeometry(), 700, () => {
      const c = clumps[(Math.random() * clumps.length) | 0], a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.55, x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r;
      return clear(x, z) ? [x, z, 0.75 + Math.random() * 0.35] : null;
    }, TC, 0.25);
    { const cc = new THREE.Color(); let k = 0;                    // each clump keeps its colour
      for (let i = 0; i < this.tulips.count; i++) { const M = new THREE.Matrix4(); this.tulips.getMatrixAt(i, M); const p = new THREE.Vector3().setFromMatrixPosition(M);
        let best = 0, bd = 1e9; clumps.forEach((c, j) => { const d = Math.hypot(c[0] - p.x, c[1] - p.z); if (d < bd) { bd = d; best = j; } });
        this.tulips.setColorAt(i, cc.copy(TC[clumps[best][2]]).multiplyScalar(0.85 + 0.3 * Math.random())); k++; } }
    // daisies and buttercups scattered through the grass
    this.daisies = make(daisyGeometry(), 1400, () => { const a = Math.random() * 6.28, r = 2.6 + Math.pow(Math.random(), 0.8) * 10, x = CX + Math.cos(a) * r, z = Math.sin(a) * r; return clear(x, z) ? [x, z, 0.8 + Math.random() * 0.6] : null; },
      [lin('#ffffff'), lin('#ffffff'), lin('#fff6e0'), lin('#ffd21a')], 0.3);
  }

  buildFar() {
    const { g, wires } = farGeometry(this.FLOOR);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    this.far = new THREE.Mesh(g, m); this.far.userData.keep = true; this.far.frustumCulled = false; this.group.add(this.far);
    this.wires = new THREE.LineSegments(wires, new THREE.LineBasicMaterial({ color: 0x23262a })); this.wires.frustumCulled = false; this.group.add(this.wires);
  }

  // a kite on a long string, high over the far side of the hill, swinging in the gusts
  buildKite() {
    const k = this.kite = new THREE.Group(); this.group.add(k);
    const pos = [0, 0.55, 0, -0.38, 0, 0, 0, -0.75, 0, 0.38, 0, 0], col = [[1, 0.06, 0.4], [1, 0.85, 0.05], [0.1, 0.45, 1], [0.1, 0.9, 0.3]];
    const p = [], c = []; const tri = (a, b, cc) => { p.push(0, 0, 0, ...pos.slice(a * 3, a * 3 + 3), ...pos.slice(b * 3, b * 3 + 3)); c.push(...cc, ...cc, ...cc); };
    tri(0, 1, col[0]); tri(1, 2, col[1]); tri(2, 3, col[2]); tri(3, 0, col[3]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.computeVertexNormals();
    this.kiteBody = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x111111 })); this.kiteBody.userData.keep = true; k.add(this.kiteBody);
    // the string and the tail: one line each, bent every frame
    this.kStr = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.55 }));
    this.kTail = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xff2a6a }));
    for (const l of [this.kStr, this.kTail]) { l.frustumCulled = false; this.group.add(l); }
    this.kAnchor = new THREE.Vector3(12, this.FLOOR + hill(12, -18), -18);
    this.kPos = new THREE.Vector3(6, this.FLOOR + 9, -30); this.kVel = new THREE.Vector3(); this.tail = Array.from({ length: 16 }, () => this.kPos.clone());
  }

  // ---------------- every frame ----------------
  live(dt, fx, st, ex) {
    const lu = this.lu, E = st.eye, CX = this.CX;
    lu.uGT.value += dt; lu.uLandT.value = this.u.uTime.value; lu.uEye.value.copy(E);
    if (ex.kicked && st.alive > 0.2) lu.uRip.value.setComponent(this.ripN++ % 4, lu.uGT.value);
    const set = ss(0.35, 1.0, st.day), night = ss(1.0, 1.6, st.day);
    lu.uCloudK.value = (1 - set * 0.8) * (1 - night);
    { const a = 0.4 + 0.25 * Math.sin(lu.uGT.value * 0.05); lu.uWind.value.set(Math.cos(a), Math.sin(a), 0.12 + ex.wind * 0.35 + ex.gust * 0.5); }
    lu.uSunD.value.copy(st.sun); lu.uSunC.value.setRGB(1, 0.85 - 0.4 * set, 0.6 - 0.5 * set).multiplyScalar((0.25 + 0.9 * set) * (1 - night));
    // the grass's two windows: round where the camera looks, ahead of it
    { const dx = CX - E.x, dz = -E.z, L = Math.hypot(dx, dz) || 1, fx_ = dx / L, fz = dz / L;
      lu.uA0.value.set(E.x + fx_ * 3.2, E.z + fz * 3.2); lu.uA1.value.set(E.x + fx_ * 8.5, E.z + fz * 8.5); }
    const q = st.quality; this.grass.geometry.instanceCount = Math.round(this.grassN * (q === 2 ? 1 : q === 1 ? 0.6 : 0.3));
    // the lawn's map: taken while the pile sits on the floor (the dressing lands over the first seconds), and again whenever it changes
    if (this.group.visible || st.act === 'room') {
      if (st.lift < 0.01 && st.t - this.maskAt > 2.5 && (this.maskN < 0 || st.act === 'room')) {
        let n = 0; this.root.traverse((o) => { if (o.isMesh && o.visible) n++; });
        if (n !== this.maskN) { this.maskN = n; this.mask(ex.renderer, ex.scene); }
        this.maskAt = st.t;
      }
    }
    if (!this.group.visible) return;
    this.flyKite(dt, fx, st, ex);
  }
  // a picture of the pile from straight above: wherever anything lies, white
  mask(r, scene) {
    const root = this.root, cam = this.maskCam, hide = [];
    for (const o of scene.children) if (o !== root && o.visible && !o.isLight) { o.visible = false; hide.push(o); }
    const skip = (o) => o === this.group || o.userData.keep || o === this.warm || (o.isMesh && o.material && !Array.isArray(o.material) && o.material.transparent);
    root.traverse((o) => { if (o.visible && o !== root && skip(o)) { o.visible = false; hide.push(o); } });
    root.updateMatrixWorld();
    const L = new THREE.Matrix4().makeTranslation(this.CX, this.FLOOR + 6, 0).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    cam.matrixWorld.multiplyMatrices(root.matrixWorld, L); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.near = 0.05; cam.far = 6 - 0.0015; cam.updateProjectionMatrix();      // anything standing more than a hair above the floor
    // (the shadow maps stay switched on: turning them off for this one picture would make it a different program to build)
    const was = r.getRenderTarget(), ov = scene.overrideMaterial, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    scene.overrideMaterial = this.maskMat;
    r.setRenderTarget(this.maskRT); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, cam);
    r.setRenderTarget(was); scene.overrideMaterial = ov; r.setClearColor(cc, ca);
    for (const o of hide) o.visible = true;
    this.lu.uMaskBox.value.set(this.CX, 0, 8, 0);
  }
  flyKite(dt, fx, st, ex) {
    const t = this.lu.uGT.value, P = this.kPos, A = this.kAnchor, L = 17, want = this._kw ||= new THREE.Vector3(), tmp = this._kt ||= new THREE.Vector3();
    want.set(A.x - 7 + 3 * Math.sin(t * 0.23), A.y + 6.5 + 1.2 * Math.sin(t * 0.31) + 1.2 * ex.gust, A.z - 14 + 3 * Math.cos(t * 0.19));
    want.x += 2.5 * Math.sin(st.beat * Math.PI * 0.5) * (st.reduce ? 0.3 : 1) * st.alive;            // it swings two beats left, two right
    this.kVel.addScaledVector(want.sub(P), dt * 1.8).multiplyScalar(Math.exp(-dt * 1.4)); P.addScaledVector(this.kVel, dt);
    const d = tmp.copy(P).sub(A); if (d.length() > L) P.copy(A).addScaledVector(d.normalize(), L);
    // it faces the camera (the kite and the eye are both in the room's coordinates, so aim it by hand)
    const k = this.kite; k.position.copy(P); tmp.copy(st.eye).sub(P).normalize(); k.quaternion.setFromUnitVectors(this._kz ||= new THREE.Vector3(0, 0, 1), tmp); k.rotateZ(0.3 * Math.sin(t * 1.3) + 0.15 * this.kVel.x);
    const s = this.kStr.geometry.attributes.position;
    for (let i = 0; i < 24; i++) { const u = i / 23; s.setXYZ(i, A.x + (P.x - A.x) * u, A.y + (P.y - A.y) * u - 3 * u * (1 - u), A.z + (P.z - A.z) * u); }
    s.needsUpdate = true;
    const tl = this.tail, ta = this.kTail.geometry.attributes.position;
    tl[0].set(0, -0.75, 0).applyQuaternion(k.quaternion).add(P);
    for (let i = 1; i < tl.length; i++) { const p = tl[i]; p.y -= dt * 0.6; p.x += dt * 1.2 * (0.5 + ex.wind); const dd = tmp.copy(p).sub(tl[i - 1]), l = dd.length(); if (l > 0.22) p.copy(tl[i - 1]).addScaledVector(dd, 0.22 / l); p.x += Math.sin(t * 6 + i * 0.7) * 0.01; }
    tl.forEach((p, i) => ta.setXYZ(i, p.x, p.y, p.z)); ta.needsUpdate = true;
  }
}
