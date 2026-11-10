// The bedroom around the floor: walls, furniture, what hangs and stands in it.
// A module of the room. The conductor (index.js) builds it once and then, every frame, tells it what is happening
// (`stage`) and, when something happens, what (`on`). See the "stage and bus" comment in index.js for both shapes.
//   ctx: { scene, root (the room's group: y up, metres, +z toward the opening camera, floor at y = FLOOR), renderer, CX, FLOOR,
//          things (the machines), kit (props.js), dress (set.js), listener (live audio), screens, sky, post, psx(obj) (joins the PS1 wobble) }
//
// A teenager's bedroom, about 2004, at night: three walls (the side toward the opening camera is open), a window with
// blinds and the street light coming through the slats, a door with a bead curtain, a bed with the duvet half on the
// floor, a desk the pile outgrew, shelves, a wardrobe with a mirror, a chest with the hi-fi on it, glow stars on the
// ceiling, and every wall papered with prints (shell-art.js). It is laid out round wherever the machines ended up.
//
// What it costs: the room is built after the first frames, compiled off the main thread, then let in. Static parts are
// merged per wall and per material; everything that repeats is instanced; everything printed is one atlas. The light
// it throws is mostly painted in the shader (roomLit): fairy lights, glows, the street light through the slats, the
// mirror ball's spots; only three small unshadowed point lights are real, and only in the room.
//
// Each wall is a group hinged at its foot: at a drop they fall away backwards as the floor goes, and stand back up
// when the song comes home. Whatever stands against a wall goes with it; a wall the lens is behind is not drawn.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/addons/RoundedBoxGeometry.js';
import { paintAtlas } from './shell-art.js';
import { drawFace } from './label.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);
const rng = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const idle = () => new Promise((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 300 }) : setTimeout(r, 30)));
const breath = () => new Promise((r) => setTimeout(r, 0));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const lin = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);      // a colour in linear light (Color() converts from sRGB)
const M = (x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(sx, sy, sz));

// ---------------- the room's light, painted into its own materials ----------------
// One set of uniforms, shared by every material roomLit() has touched (the room's own, the carpet, the floor props).
// Positions are in the room's coordinates (y up from the floor group's origin = FLOOR).
const NF = 12, NG = 4;
export const RL = {
  uRLtoRoom: { value: new THREE.Matrix4() },
  uRLfp: { value: Array.from({ length: NF }, () => V(0, -50, 0)) }, uRLfc: { value: Array.from({ length: NF }, () => V()) },   // fairy lights, as twelve lamps
  uRLgp: { value: Array.from({ length: NG }, () => V(0, -50, 0)) }, uRLgc: { value: Array.from({ length: NG }, () => V()) },   // glows: lava lamp, plasma ball, hi-fi, clock
  uRLst: { value: V() }, uRLsc: { value: V() }, uRLcp: { value: V() }, uRLcc: { value: V() },                                 // the street lamp, a passing car
  uRLwin: { value: new THREE.Vector4() }, uRLwz: { value: 0 }, uRLslat: { value: V(0.022, 0.5, 0) },                         // the window (x0, x1, y0, y1), its plane, the blinds (pitch, open, bottom)
  uRLball: { value: V() }, uRLbrot: { value: new THREE.Matrix3() }, uRLbi: { value: 0 },                                      // the mirror ball
  uRLt: { value: 0 }, uRLflap: { value: 0 }, uRLsway: { value: 0 },
};
const RL_VERT_HEAD = `uniform mat4 uRLtoRoom; varying vec3 vRLp;
#ifdef RL_MOVE
attribute vec2 aMove; uniform float uRLt, uRLflap, uRLsway;
#endif
`;
const RL_FRAG_HEAD = `uniform mat4 uRLtoRoom; varying vec3 vRLp;
uniform vec3 uRLfp[${NF}], uRLfc[${NF}], uRLgp[${NG}], uRLgc[${NG}], uRLst, uRLsc, uRLcp, uRLcc, uRLball, uRLslat; uniform vec4 uRLwin; uniform float uRLwz, uRLbi; uniform mat3 uRLbrot;
float rlHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// light from a lamp outside, through the window and the blinds' slats (no occlusion inside: it is a cookie)
vec3 rlCookie(vec3 P, vec3 N, vec3 S, vec3 C) {
  vec3 Ls = S - P; if (P.z < uRLwz + 0.002 || Ls.z > -0.001 || dot(C, C) < 1e-6) return vec3(0.0);
  vec3 Q = P + Ls * ((uRLwz - P.z) / Ls.z); float far = length(Q - P), e = 0.006 + far * 0.012;
  float inside = smoothstep(uRLwin.x - e, uRLwin.x + e, Q.x) * smoothstep(uRLwin.y + e, uRLwin.y - e, Q.x) * smoothstep(uRLwin.z - e, uRLwin.z + e, Q.y) * smoothstep(uRLwin.w + e, uRLwin.w - e, Q.y);
  inside *= smoothstep(0.012, 0.03 + e, abs(Q.x - 0.5 * (uRLwin.x + uRLwin.y)));          // the frame's middle bar
  float f = fract((Q.y - uRLslat.z) / uRLslat.x), soft = 0.05 + far * 0.04;
  float slat = Q.y < uRLslat.z ? 1.0 : smoothstep(1.0 - uRLslat.y - soft, 1.0 - uRLslat.y + soft, f);
  return C * inside * slat * max(dot(N, normalize(Ls)), 0.0);
}
vec3 roomLight(vec3 P, vec3 N) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${NF}; i++) { vec3 L = uRLfp[i] - P; float d2 = dot(L, L); acc += uRLfc[i] * max(dot(N, L) * inversesqrt(d2), 0.0) / (d2 + 0.06); }
  for (int i = 0; i < ${NG}; i++) { vec3 L = uRLgp[i] - P; float d2 = dot(L, L); acc += uRLgc[i] * (0.25 + 0.75 * max(dot(N, L) * inversesqrt(d2), 0.0)) / (d2 + 0.02); }
  acc += rlCookie(P, N, uRLst, uRLsc) + rlCookie(P, N, uRLcp, uRLcc);
  if (uRLbi > 0.001) {                                     // the mirror ball: a spot from every other facet, slowly turning
    vec3 B = P - uRLball; float dB = length(B); vec3 Dw = B / dB, D = uRLbrot * Dw;
    float rows = 18.0, lat = asin(clamp(D.y, -1.0, 1.0)), ri = floor((lat / 3.14159 + 0.5) * rows), latc = ((ri + 0.5) / rows - 0.5) * 3.14159;
    float cols = max(3.0, floor(rows * 2.0 * cos(latc))), ci = floor((atan(D.z, D.x) / 6.28318 + 0.5) * cols), lonc = ((ci + 0.5) / cols - 0.5) * 6.28318;
    float h = rlHash(vec2(ri, ci)); vec3 Cd = vec3(cos(latc) * cos(lonc), sin(latc), cos(latc) * sin(lonc));
    float spot = smoothstep(0.05, 0.022, length(D - Cd)) * step(0.4, h);
    vec3 col = mix(vec3(1.0), 0.5 + 0.5 * cos(6.28318 * (h * 3.0 + vec3(0.0, 0.33, 0.67))), 0.6);
    acc += col * spot * uRLbi * max(dot(N, -Dw), 0.0) / (dB * dB + 0.3);
  }
  return acc;
}
`;
// opts.move: the geometry carries aMove (x: lifts off its wall with the kick, y: breathes like cloth)
export function roomLit(mat, { move = false } = {}) {
  if (!mat || mat.userData.rl || !(mat.isMeshStandardMaterial)) return mat;
  mat.userData.rl = true;
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    Object.assign(s.uniforms, RL);
    if (move) s.defines = { ...(s.defines || {}), RL_MOVE: '' };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + RL_VERT_HEAD)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef RL_MOVE
transformed += objectNormal * aMove.x * uRLflap;
{ float ph = dot(position, vec3(3.1, 2.3, 1.7)); transformed += vec3(sin(uRLt * 1.7 + ph), 0.25 * sin(uRLt * 1.1 + ph * 1.3), cos(uRLt * 1.3 + ph * 0.7)) * aMove.y * uRLsway; }
#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 rlp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  rlp = instanceMatrix * rlp;
#endif
  vRLp = (uRLtoRoom * modelMatrix * rlp).xyz; }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + RL_FRAG_HEAD)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.directDiffuse += diffuseColor.rgb * roomLight(vRLp, normalize(mat3(uRLtoRoom) * inverseTransformDirection(normal, viewMatrix)));`);
  };
  mat.customProgramCacheKey = () => (key ? key.call(mat) : '') + (move ? '|rlm' : '|rl');
  if (move) mat.defaultAttributeValues = { ...(mat.defaultAttributeValues || {}), aMove: [0, 0] };
  mat.needsUpdate = true;
  return mat;
}

// ---------------- building: geometry gathered per material, merged ----------------
class Bag {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.m = []; this.i = []; this.count = 0; }
  // geo: any BufferGeometry with uv; m: its placement; o.cell: atlas cell (or six, one per box face; null = keep uv);
  // o.color: hex, THREE.Color or fn(local x, y, z) -> Color; o.move: [flap, sway] or fn(local x, y, z, u, v) -> [flap, sway]
  add(geo, m, o = {}) {
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, nm = new THREE.Matrix3().getNormalMatrix(m), v = V(), n = V(), base = this.count;
    const col = typeof o.color === 'function' ? null : o.color instanceof THREE.Color ? o.color : new THREE.Color(o.color ?? 0xffffff);
    for (let k = 0; k < P.count; k++) {
      v.fromBufferAttribute(P, k); const lx = v.x, ly = v.y, lz = v.z; v.applyMatrix4(m); this.p.push(v.x, v.y, v.z);
      n.fromBufferAttribute(N, k).applyMatrix3(nm).normalize(); this.n.push(n.x, n.y, n.z);
      let uu = U ? U.getX(k) : 0, vv = U ? U.getY(k) : 0;
      const cell = Array.isArray(o.cell) ? o.cell[Math.min(5, Math.floor(k / 4))] : o.cell;
      if (cell) { uu = cell.u0 + (cell.u1 - cell.u0) * uu; vv = cell.v0 + (cell.v1 - cell.v0) * vv; }
      this.u.push(uu, vv);
      const c = col || o.color(lx, ly, lz); this.c.push(c.r, c.g, c.b);
      const mv = typeof o.move === 'function' ? o.move(lx, ly, lz, U ? U.getX(k) : 0, U ? U.getY(k) : 0) : o.move || [0, 0]; this.m.push(mv[0], mv[1]);
    }
    if (geo.index) for (let k = 0; k < geo.index.count; k++) this.i.push(base + geo.index.getX(k));
    else for (let k = 0; k < P.count; k++) this.i.push(base + k);
    this.count += P.count;
    return this;
  }
  geometry(origin) {
    const g = new THREE.BufferGeometry(), p = new Float32Array(this.p);
    if (origin) for (let k = 0; k < p.length; k += 3) { p[k] -= origin.x; p[k + 1] -= origin.y; p[k + 2] -= origin.z; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aMove', new THREE.Float32BufferAttribute(this.m, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); return g;
  }
}
const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);                 // origin at the bottom
const rboxGeo = (w, h, d, r = 0.01, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)).translate(0, h / 2, 0);
const cylGeo = (r0, r1, h, seg = 16) => new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, h / 2, 0);
const sub = (c, a0, a1, b0, b1) => ({ ...c, u0: c.u0 + (c.u1 - c.u0) * a0, u1: c.u0 + (c.u1 - c.u0) * a1, v0: c.v0 + (c.v1 - c.v0) * b0, v1: c.v0 + (c.v1 - c.v0) * b1 });
// a quad on a plane: centre c, along U (s) and V (t), normal U x V; segments for flapping/bending
function quad(bag, c, U, Vv, w, h, cell, { seg = 1, color = 0xffffff, move = null, bend = 0, lift = 0 } = {}) {
  const g = new THREE.PlaneGeometry(w, h, seg, seg), N = V().crossVectors(U, Vv).normalize();
  const m = new THREE.Matrix4().makeBasis(U.clone().normalize(), Vv.clone().normalize(), N).setPosition(c);
  if (bend || lift) { const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const s = p.getX(k) / w * 2, t = p.getY(k) / h * 2; p.setZ(k, bend * (1 - s * s) + lift * (typeof move === 'function' ? move(0, 0, 0, (s + 1) / 2, (t + 1) / 2)[0] : 0)); } g.computeVertexNormals(); }
  bag.add(g, m, { cell, color, move });
}

// ---------------- the plan: where everything goes, from where the machines are ----------------
// x across, z toward the opening camera, y up from the floor. Furniture as boxes on the floor plan (x0..x1, z0..z1, h).
export function layout(things) {
  let ax = 9, bx = -9, az = 9;
  for (const o of things) { const p = o.home.p, r = o.foot || 0.2; ax = Math.min(ax, p.x - r); bx = Math.max(bx, p.x + r); az = Math.min(az, p.z - r); }
  if (ax > bx) { ax = -2; bx = 2; az = -1.5; }
  const X0 = Math.min(-2.75, ax - 0.8), X1 = Math.max(2.95, bx + 1.35), Z0 = Math.min(-2.45, az - 0.95), Z1 = 3.1, H = 2.5;
  const L = { X0, X1, Z0, Z1, H };
  L.wardrobe = { x0: X0, x1: X0 + 0.6, z0: Z0, z1: Z0 + 1.2, h: 2.02 };
  L.desk = { x0: X0 + 0.72, x1: X0 + 2.1, z0: Z0, z1: Z0 + 0.62, h: 0.74 };
  L.chest = { x0: X0 + 2.22, x1: X0 + 2.94, z0: Z0, z1: Z0 + 0.45, h: 0.8 };
  L.bed = { x0: X1 - 0.95, x1: X1, z0: Z0, z1: Z0 + 2.02, h: 0.5 };
  // how far the duvet slides off onto the floor: up to 42 cm, stopping short of any machine beside the bed
  { let near = -9; for (const o of things) { const p = o.home.p, r = o.foot || 0.2; if (p.z + r > L.bed.z0 + 0.3 && p.z - r < L.bed.z1 + 0.1) near = Math.max(near, p.x + r); }
    L.duvetRun = Math.max(0.12, Math.min(0.42, L.bed.x0 - near - 0.1)); }
  L.bedside = { x0: L.bed.x0 - 0.44, x1: L.bed.x0 - 0.04, z0: Z0, z1: Z0 + 0.4, h: 0.52 };
  { const a = L.chest.x1 + 0.1, b = L.bedside.x0 - 0.08, w = Math.min(1.3, b - a), c = (a + b) / 2; L.win = { x0: c - w / 2, x1: c + w / 2, y0: 0.95, y1: 2.12 }; }
  L.door = { z0: Math.max(L.wardrobe.z1 + 1.1, 0.3), h: 2.0 }; L.door.z1 = Math.min(L.door.z0 + 0.84, Z1 - 0.5);
  L.bookcase = { x0: X1 - 0.32, x1: X1, z0: L.bed.z1 + 0.12, z1: L.bed.z1 + 0.92, h: 0.92 };
  L.tower = { x0: X1 - 0.22, x1: X1 - 0.02, z0: L.bookcase.z1 + 0.1, z1: L.bookcase.z1 + 0.3, h: 1.22 };
  L.shelves = [1.3, 1.66];
  L.ball = V((L.win.x0 + L.win.x1) / 2 + 0.2, 2.02, Z0 + 1.05);
  L.lantern = V(-0.756, 1.83 + 0.08, -0.63);                         // the room's lamp (index.js key light) hangs in it
  // the inflatable chair: against a wall wherever the pile left room
  const free = (x, z, r) => things.every((o) => Math.hypot(o.home.p.x - x, o.home.p.z - z) > (o.foot || 0.2) + r);
  L.chair = [[X0 + 0.5, (L.wardrobe.z1 + L.door.z0) / 2], [X1 - 0.5, L.tower.z1 + 0.55], [X0 + 0.5, L.door.z1 + 0.6], [-1.9, 1.6]].find(([x, z]) => free(x, z, 0.5)) || [X0 + 0.5, L.door.z1 + 0.6];
  L.sub = [[L.chest.x0 - 0.0, Z0 + 0.62], [L.desk.x1 + 0.05, Z0 + 0.7]].find(([x, z]) => free(x, z, 0.2)) || [L.chest.x0, Z0 + 0.62];
  // the furniture as footprints (for set.js and the director): x, z, w (along x before turning), d, a (turn), h
  const fp = (r, kind, h = r.h) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0, a: 0, h, kind });
  L.foot = [fp(L.wardrobe, 'furniture'), fp(L.desk, 'furniture'), fp(L.chest, 'furniture', 1.12), fp(L.bed, 'furniture', 0.62), fp(L.bedside, 'furniture', 0.62),
    fp(L.bookcase, 'furniture'), fp(L.tower, 'furniture'), { x: L.chair[0], z: L.chair[1], w: 0.95, d: 0.85, a: 0, h: 0.75, kind: 'furniture' },
    { x: L.sub[0], z: L.sub[1], w: 0.3, d: 0.3, a: 0, h: 0.34, kind: 'furniture' },
    { x: L.bed.x0 - L.duvetRun / 2, z: (L.bed.z0 + L.bed.z1) / 2 + 0.2, w: L.duvetRun + 0.04, d: 1.6, a: 0, h: 0.22, kind: 'soft' },                   // the duvet, on the floor
    { x: (L.win.x0 + L.win.x1) / 2, z: Z0 + 0.08, w: L.win.x1 - L.win.x0 - 0.1, d: 0.14, a: 0, h: 0.56, kind: 'furniture' },        // the radiator
    { x: X0 + 0.06, z: L.door.z1 + 0.42, w: 0.1, d: 0.86, a: 0, h: 2.0, kind: 'furniture' }];                       // the open door
  // places to put small things (set.js): a surface's rectangle, its height, how much room above, which wall it goes with
  L.spots = [
    { name: 'bed', x0: L.bed.x0 + 0.12, x1: L.bed.x1 - 0.1, z0: L.bed.z0 + 0.62, z1: L.bed.z1 - 0.1, y: 0.53, room: 0.6, wall: 'right' },
    { name: 'bedhead', x0: L.bed.x0 + 0.08, x1: L.bed.x1 - 0.06, z0: L.bed.z0 + 0.06, z1: L.bed.z0 + 0.5, y: 0.5, room: 0.6, wall: 'right' },
    { name: 'desk', x0: L.desk.x0 + 0.42, x1: L.desk.x1 - 0.4, z0: L.desk.z0 + 0.3, z1: L.desk.z1 - 0.04, y: L.desk.h, room: 0.5, wall: 'back' },
    { name: 'underdesk', x0: L.desk.x0 + 0.06, x1: L.desk.x0 + 0.85, z0: L.desk.z0 + 0.05, z1: L.desk.z1 - 0.02, y: 0, room: 0.68, wall: 'back' },
    { name: 'shelf', x0: L.desk.x0 + 0.62, x1: L.desk.x1 - 0.08, z0: Z0 + 0.03, z1: Z0 + 0.22, y: L.shelves[1] + 0.02, room: 0.32, wall: 'back' },
    { name: 'wardrobetop', x0: L.wardrobe.x0 + 0.04, x1: L.wardrobe.x1 - 0.04, z0: L.wardrobe.z0 + 0.05, z1: L.wardrobe.z1 - 0.05, y: L.wardrobe.h, room: 0.45, wall: 'left' },
    { name: 'sill', x0: L.win.x0 + 0.06, x1: L.win.x1 - 0.06, z0: Z0 + 0.02, z1: Z0 + 0.13, y: L.win.y0 + 0.03, room: 0.3, wall: 'back' },
    { name: 'bookcase', x0: L.bookcase.x0 + 0.03, x1: L.bookcase.x1 - 0.03, z0: L.bookcase.z0 + 0.04, z1: L.bookcase.z1 - 0.04, y: L.bookcase.h, room: 0.6, wall: 'right' },
    { name: 'bedside', x0: L.bedside.x0 + 0.02, x1: L.bedside.x1 - 0.02, z0: L.bedside.z0 + 0.22, z1: L.bedside.z1 - 0.02, y: L.bedside.h, room: 0.3, wall: 'back' },
  ];
  return L;
}

// ---------------- the module ----------------
export class Shell {
  constructor(ctx) {
    this.ctx = ctx; this.FL = ctx.FLOOR;
    this.lite = matchMedia('(pointer: coarse)').matches;
    this.L = layout(ctx.things);
    if (ctx.dress) ctx.dress.room = this;                       // set.js puts things on the bed, the desk, the shelves (and steers round the furniture)
    this.groups = {}; this.f = 0; this.fFree = 0; this.slam = 0; this.sleep = 0; this.wake = 1; this.hops = []; this.mounted = [];
    this.fairy = { pulse: null }; this.t = 0; this.carT = 8; this.car = -1;
    const L = this.L;
    // hinges: each wall falls about its foot; the ceiling lifts; the loose group (chair, subwoofer) stays for the hill
    const hinge = { back: V(0, 0, L.Z0), left: V(L.X0, 0, 0), right: V(L.X1, 0, 0), ceil: V(0, L.H, 0), free: V(0, 0, 0) };
    for (const [k, h] of Object.entries(hinge)) { const g = new THREE.Group(); g.name = 'shell-' + k; g.position.set(h.x, this.FL + h.y, h.z); g.userData.hinge = h; g.visible = false; this.groups[k] = g; ctx.root.add(g); }
    // the real lights: a desk lamp, the lava lamp's glow, the street light coming in; built now so no shader is rebuilt when they come on
    this.lights = { lamp: new THREE.PointLight(0xffc98a, 0, 3.2, 2), lava: new THREE.PointLight(0xff4f8a, 0, 2.6, 2), street: new THREE.PointLight(0xff9a40, 0, 4, 2) };
    for (const l of Object.values(this.lights)) { l.castShadow = false; ctx.root.add(l); }
    this.lights.street.position.set((L.win.x0 + L.win.x1) / 2, this.FL + 1.7, L.Z0 + 0.35);
    this.ready = this.build().catch((e) => console.error('shell', e));
  }

  // ---- the build, after the first frames ----
  async build() {
    await frame(); await frame(); await idle();
    const t0 = performance.now();
    const art = this.art = await paintAtlas({ lite: this.lite });
    this.artMs = performance.now() - t0;
    const tex = this.tex = new THREE.CanvasTexture(art.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, this.ctx.renderer.capabilities.getMaxAnisotropy());
    const ptex = new THREE.CanvasTexture(art.paint); ptex.colorSpace = THREE.SRGBColorSpace; ptex.wrapS = ptex.wrapT = THREE.RepeatWrapping; ptex.anisotropy = 4;
    const lit = (m, o) => roomLit(m, o);
    this.mats = {
      paint: lit(new THREE.MeshStandardMaterial({ map: ptex, vertexColors: true, roughness: 0.92 })),
      art: lit(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.62, alphaTest: 0.5 }), { move: true }),
      furn: lit(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.7 })),
      cloth: lit(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), { move: true }),
      chrome: lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.75 })),
      mirror: new THREE.MeshStandardMaterial({ color: 0xdfe6f0, roughness: 0.04, metalness: 1, envMapIntensity: 3 }),
      basic: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true }),
      stars: new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, color: lin(0xb8ffcf, 0.5) }),
      dots: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    };
    this.bags = {};
    const bag = (g, m) => (this.bags[g + '.' + m] ||= new Bag());
    this.bag = bag;
    this.dots = { back: [], left: [], right: [], ceil: [], free: [] };
    this.R = rng(1977);
    const steps = [() => this.buildWalls(), () => this.buildWindow(), () => this.buildDoor(), () => this.buildBed(), () => this.buildDesk(), () => this.buildChest(),
      () => this.buildWardrobe(), () => this.buildRight(), () => this.buildCeiling(), () => this.buildFairy(), () => this.buildArt(), () => this.buildMovers()];
    for (const s of steps) { s(); await breath(); }
    // merge: one mesh per wall per material
    const casts = new Set(['furn', 'cloth', 'chrome']);
    for (const [k, b] of Object.entries(this.bags)) {
      const [g, m] = k.split('.'), grp = this.groups[g]; if (!b.count) continue;
      const mesh = new THREE.Mesh(b.geometry(grp.userData.hinge), this.mats[m]);
      mesh.castShadow = casts.has(m) && g !== 'ceil'; mesh.receiveShadow = m !== 'basic' && m !== 'stars'; mesh.name = k;
      grp.add(mesh);
    }
    this.bags = null;
    for (const [g, list] of Object.entries(this.dots)) if (list.length) this.makeDots(g, list);
    for (const g of Object.values(this.groups)) this.ctx.psx?.(g);
    // compile everything off the main thread, upload the atlas, then let it in
    const r = this.ctx.renderer, cam = new THREE.PerspectiveCamera(30, 1.6, 0.05, 50);
    try { r.initTexture(tex); r.initTexture(ptex); } catch {}
    const done = Object.values(this.groups).map((g) => this.compile(g, cam));
    await Promise.all(done);
    this.marks = { art: this.artMs, compile: performance.now() - t0 };
    this.built = true;
    performance.mark('shell:built'); this.buildMs = performance.now() - t0;
  }

  // compile off the main thread, into the picture the room is drawn into (its HDR target: linear, no tone curve), so the
  // programs made here are the ones drawn with, and nothing is built when a thing first comes into view
  compile(obj, cam = new THREE.PerspectiveCamera(30, 1.6, 0.05, 50)) {
    const r = this.ctx.renderer, prev = r.getRenderTarget(); let p;
    try { r.setRenderTarget(this.ctx.post?.sceneRT || prev); p = r.compileAsync(obj, cam, this.ctx.scene); } catch (e) { p = Promise.resolve(); } finally { r.setRenderTarget(prev); }
    return p.catch((e) => console.warn('shell compile', e.message));
  }

  // the dots: every small light in one instanced mesh per wall (fairy bulbs, LEDs, the hi-fi's meter)
  dot(g, p, col, r = 0.011, kind = 'led', sy = 1) { const d = { p: p.clone(), col: lin(col), r, kind, sy, i: this.dots[g].length, k: 0 }; this.dots[g].push(d); return d; }
  makeDots(g, list) {
    const geo = new THREE.IcosahedronGeometry(1, 1), mesh = new THREE.InstancedMesh(geo, this.mats.dots, list.length), h = this.groups[g].userData.hinge, m = new THREE.Matrix4();
    for (const d of list) { m.compose(d.p.clone().sub(h), new THREE.Quaternion(), V(d.r, d.r * d.sy, d.r)); mesh.setMatrixAt(d.i, m); mesh.setColorAt(d.i, new THREE.Color(0, 0, 0)); }
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.name = 'dots.' + g;
    this.groups[g].add(mesh); list.mesh = mesh;
  }

  // ---- walls, skirting, ceiling, the openings ----
  buildWalls() {
    const L = this.L, b = this.bag, A = this.art.cell('plain'), paint = lin(0xc4b2e6), skirt = 0xf6f3ee;
    const wq = (g, c, U, Vv, w, h) => { const geo = new THREE.PlaneGeometry(w, h, Math.ceil(w / 0.6), Math.ceil(h / 0.6)), uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 1.3, uv.getY(k) * h / 1.3);
      const N = V().crossVectors(U, Vv); b(g, 'paint').add(geo, new THREE.Matrix4().makeBasis(U, Vv, N).setPosition(c), { color: (x, y) => paint.clone().multiplyScalar(0.92 + 0.08 * clamp01((y + h / 2) / 1.2)) }); };
    // back: around the window
    const W = L.win, zb = L.Z0, ex = V(1, 0, 0), ey = V(0, 1, 0);
    const back = (x0, x1, y0, y1) => wq('back', V((x0 + x1) / 2, (y0 + y1) / 2, zb), ex, ey, x1 - x0, y1 - y0);
    back(L.X0, W.x0, 0, L.H); back(W.x1, L.X1, 0, L.H); back(W.x0, W.x1, 0, W.y0); back(W.x0, W.x1, W.y1, L.H);
    // left: around the door; right: plain
    const D = L.door, ez = V(0, 0, 1), nz = V(0, 0, -1);
    const left = (z0, z1, y0, y1) => wq('left', V(L.X0, (y0 + y1) / 2, (z0 + z1) / 2), nz, ey, z1 - z0, y1 - y0);
    left(L.Z0, D.z0, 0, L.H); left(D.z1, L.Z1, 0, L.H); left(D.z0, D.z1, D.h, L.H);
    wq('right', V(L.X1, L.H / 2, (L.Z0 + L.Z1) / 2), ez, ey, L.Z1 - L.Z0, L.H);
    // the openings' reveals (the wall is 12 cm thick)
    const rv = (g, c, U, Vv, w, h) => wq(g, c, U, Vv, w, h), t = 0.12;
    rv('back', V(W.x0, (W.y0 + W.y1) / 2, zb - t / 2), V(0, 0, -1), ey, t, W.y1 - W.y0); rv('back', V(W.x1, (W.y0 + W.y1) / 2, zb - t / 2), V(0, 0, 1), ey, t, W.y1 - W.y0);
    rv('back', V((W.x0 + W.x1) / 2, W.y1, zb - t / 2), ex, V(0, 0, 1), W.x1 - W.x0, t);
    rv('left', V(L.X0 - t / 2, D.h / 2, D.z0), V(1, 0, 0), ey, t, D.h); rv('left', V(L.X0 - t / 2, D.h / 2, D.z1), V(-1, 0, 0), ey, t, D.h);
    rv('left', V(L.X0 - t / 2, D.h, (D.z0 + D.z1) / 2), nz, V(1, 0, 0), D.z1 - D.z0, t);
    // skirting
    const sk = (g, x, z, w, ry) => b(g, 'furn').add(rboxGeo(w, 0.1, 0.018, 0.004), M(x, 0, z, ry), { cell: A, color: skirt });
    sk('back', (L.X0 + L.X1) / 2, zb + 0.009, L.X1 - L.X0, 0); sk('right', L.X1 - 0.009, (L.Z0 + L.Z1) / 2, L.Z1 - L.Z0, Math.PI / 2);
    sk('left', L.X0 + 0.009, (L.Z0 + D.z0) / 2, D.z0 - L.Z0, Math.PI / 2); sk('left', L.X0 + 0.009, (D.z1 + L.Z1) / 2, L.Z1 - D.z1, Math.PI / 2);
    // a light switch and a double socket with things plugged in
    b('left', 'furn').add(rboxGeo(0.085, 0.085, 0.012, 0.004), M(L.X0 + 0.006, 1.2, D.z1 + 0.15, Math.PI / 2), { cell: A, color: 0xf4f2ee });
    b('back', 'furn').add(rboxGeo(0.15, 0.085, 0.014, 0.004), M(L.desk.x0 + 0.3, 0.3, zb + 0.007), { cell: A, color: 0xf4f2ee });
    b('right', 'furn').add(rboxGeo(0.15, 0.085, 0.014, 0.004), M(L.X1 - 0.007, 0.3, L.bed.z1 + 0.06, Math.PI / 2), { cell: A, color: 0xf4f2ee });
  }

  buildWindow() {
    const L = this.L, W = L.win, b = this.bag, A = this.art.cell('plain'), zb = L.Z0, white = 0xf4f3ef, cx = (W.x0 + W.x1) / 2, ww = W.x1 - W.x0, wh = W.y1 - W.y0;
    // the frame: white uPVC, set back in the reveal, with a middle bar
    const fz = zb - 0.07, fr = (w, h, x, y) => b('back', 'furn').add(boxGeo(w, h, 0.06), M(x, y, fz), { cell: A, color: white });
    fr(ww, 0.06, cx, W.y0); fr(ww, 0.06, cx, W.y1 - 0.06); fr(0.06, wh, W.x0 + 0.03, W.y0); fr(0.06, wh, W.x1 - 0.03, W.y0); fr(0.05, wh, cx, W.y0);
    // the sill
    b('back', 'furn').add(rboxGeo(ww + 0.12, 0.03, 0.2, 0.006), M(cx, W.y0 - 0.03, zb + 0.02), { cell: A, color: white });
    // the street outside (it glows: it is lit by its own lamps)
    quad(b('back', 'basic'), V(cx + 0.15, (W.y0 + W.y1) / 2 + 0.05, zb - 0.9), V(1, 0, 0), V(0, 1, 0), ww + 1.3, wh + 1.1, this.art.cell('street'), { color: lin(0xffffff, 0.55) });
    // glass: a faint sheen
    // the venetian blind: headrail, slats (instanced so they can rattle), bottom rail, cords
    const bz = zb - 0.035, bottom = W.y0 + 0.36, pitch = 0.022, n = Math.floor((W.y1 - 0.07 - bottom) / pitch);
    b('back', 'furn').add(rboxGeo(ww - 0.08, 0.04, 0.05, 0.006), M(cx, W.y1 - 0.08, bz), { cell: A, color: 0xeeeeea });
    this.blind = { n, bottom, pitch, cx, y1: W.y1 - 0.09, bz, w: ww - 0.1, open: 0.5 };
    b('back', 'chrome').add(boxGeo(ww - 0.1, 0.012, 0.03), M(cx, bottom - 0.012, bz), { color: 0xd8d8d4 });
    for (const sx of [-0.3, 0.3]) b('back', 'chrome').add(boxGeo(0.002, W.y1 - 0.08 - bottom, 0.002), M(cx + sx * (ww - 0.1), bottom, bz + 0.012), { color: 0xe8e8e8 });
    b('back', 'chrome').add(cylGeo(0.0015, 0.0015, 0.5, 4), M(W.x1 - 0.12, bottom - 0.25, bz + 0.03), { color: 0xeeeeee });
    // curtain pole and two sheer curtains, gathered, breathing with the music
    const py = W.y1 + 0.14, pz = zb + 0.09;
    b('back', 'chrome').add(cylGeo(0.012, 0.012, ww + 0.7, 10), M(cx - (ww + 0.7) / 2, py, pz, 0, 0, -Math.PI / 2), { color: 0xd9c08a });
    for (const s of [-1, 1]) b('back', 'chrome').add(new THREE.SphereGeometry(0.025, 10, 8), M(cx + s * (ww / 2 + 0.36), py, pz), { color: 0xd9c08a });
    const voile = this.art.cell('voile');
    for (const s of [-1, 1]) {
      const cw = 0.42, ch = py - 0.82, geo = new THREE.PlaneGeometry(cw, ch, 22, 14), p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), t = (ch / 2 - y) / ch; p.setZ(k, 0.028 * Math.sin((x / cw + 0.5) * Math.PI * 9) * (1 - 0.3 * t) + 0.04 * t * t); p.setX(k, x * (1 + 0.25 * t * t)); }
      geo.computeVertexNormals();
      b('back', 'cloth').add(geo, M(cx + s * (ww / 2 + 0.12), py - ch / 2 - 0.02, pz + 0.01), { cell: voile, color: 0xffffff, move: (x, y) => [0, 0.06 * Math.pow(clamp01((ch / 2 - y) / ch), 1.6)] });
    }
    // the radiator under it, socks drying
    const rw = ww - 0.16, rz = zb + 0.035;
    b('back', 'furn').add(rboxGeo(rw, 0.5, 0.05, 0.01), M(cx, 0.08, rz + 0.025), { cell: A, color: 0xf2f1ec });
    for (let k = 0; k < Math.floor(rw / 0.05); k++) b('back', 'furn').add(boxGeo(0.012, 0.47, 0.012), M(cx - rw / 2 + 0.025 + k * 0.05, 0.095, rz + 0.056), { cell: A, color: 0xe8e7e2 });
    for (const s of [-1, 1]) b('back', 'chrome').add(cylGeo(0.012, 0.012, 0.08, 8), M(cx + s * (rw / 2 + 0.03), 0.02, rz + 0.03), { color: 0xd8d8d8 });
    const sock = (x, col) => { const g = new THREE.PlaneGeometry(0.09, 0.28, 3, 8), p = g.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setZ(k, y > 0.06 ? -0.03 * Math.cos((y - 0.06) * 14) + 0.035 : 0.035 + 0.01 * Math.sin(y * 20)); } g.computeVertexNormals();
      b('back', 'cloth').add(g, M(x, 0.48, rz + 0.04), { cell: A, color: col, move: (lx, ly) => [0, 0.015 * clamp01(-ly * 4)] }); };
    sock(cx - 0.2, 0xff6fae); sock(cx - 0.08, 0xffffff); sock(cx + 0.22, 0x4b6bff);
  }

  buildDoor() {
    const L = this.L, D = L.door, b = this.bag, A = this.art.cell('plain'), x = L.X0, white = 0xf4f2ee, dw = D.z1 - D.z0;
    // architrave
    const ar = (w, h, z, y) => b('left', 'furn').add(rboxGeo(0.02, h, w, 0.004), M(x + 0.01, y, z), { cell: A, color: white });
    ar(0.07, D.h + 0.07, D.z0 - 0.035, 0); ar(0.07, D.h + 0.07, D.z1 + 0.035, 0); ar(dw + 0.14, 0.07, (D.z0 + D.z1) / 2, D.h);
    // the landing beyond: dark, a warm light from downstairs
    quad(b('left', 'basic'), V(x - 0.9, D.h / 2 + 0.1, (D.z0 + D.z1) / 2 - 0.1), V(0, 0, -1), V(0, 1, 0), dw + 1.2, D.h + 0.6, A,
      { seg: 6, color: lin(0x2a1c18, 1) });
    for (const [z, s] of [[D.z0 - 0.3, 1], [D.z1 + 0.3, -1]]) quad(b('left', 'basic'), V(x - 0.45, D.h / 2 + 0.1, z), V(s, 0, 0), V(0, 1, 0), 0.9, D.h + 0.6, A, { color: lin(0x1a1210, 1) });
    quad(b('left', 'basic'), V(x - 0.45, 0.001, (D.z0 + D.z1) / 2), V(-1, 0, 0), V(0, 0, 1), 0.9, dw + 0.6, A, { color: lin(0x3a2418, 1) });   // the landing's carpet, lit from below the stairs
    // the door, open into the room, hinged at the front side of the opening
    const ang = 1.5, hz = D.z1 - 0.02, door = this.art.cell('door');
    const dm = M(x + 0.02 + Math.sin(ang) * dw / 2, 0, hz - Math.cos(ang) * dw / 2, Math.PI / 2 - ang + Math.PI);
    const dg = boxGeo(dw - 0.02, D.h - 0.01, 0.04);
    b('left', 'furn').add(dg, dm, { cell: [A, A, A, A, door, door], color: white });
    // its handle and what is stuck on it
    const local = (u, v, w) => V(u, v, w).applyMatrix4(dm);
    b('left', 'chrome').add(new THREE.SphereGeometry(0.025, 12, 8), M(...local(-dw / 2 + 0.08, 1.0, 0.045).toArray()), { color: 0xd9c08a });
    b('left', 'chrome').add(new THREE.SphereGeometry(0.025, 12, 8), M(...local(-dw / 2 + 0.08, 1.0, -0.045).toArray()), { color: 0xd9c08a });
    const dN = V(0, 0, 1).transformDirection(dm), dU = V(1, 0, 0).transformDirection(dm), ey = V(0, 1, 0);
    // the inside face of the door is the one facing into the room
    const inside = dN.x > 0 ? 1 : -1, n = dN.clone().multiplyScalar(inside), U = dU.clone().multiplyScalar(inside);
    const onDoor = (name, u, v, rot = 0) => { const c = this.art.cell(name); const p = local(u, v, 0.021 * inside); this.piece('left', name, p, U, ey, n, rot, { seg: 1 }); };
    onDoor('doorsign', 0, 1.45, -0.04); onDoor('stk0', 0.2, 1.7, 0.2); onDoor('stk4', -0.25, 1.62, -0.3); onDoor('stk9', 0.18, 0.9, 0.1); onDoor('flyer3', 0.05, 1.08, 0.05);
    // the bead curtain hangs in the doorway (built as movers)
    this.beadsAt = { x: x - 0.03, z0: D.z0 + 0.03, z1: D.z1 - 0.03, top: D.h - 0.03 };
  }

  buildBed() {
    const L = this.L, B = L.bed, b = this.bag, A = this.art.cell('plain'), pine = this.art.cell('pine'), cx = (B.x0 + B.x1) / 2, w = B.x1 - B.x0, len = B.z1 - B.z0;
    // frame: pine, a slatted headboard, short footboard
    const pn = (geo, m) => b('right', 'furn').add(geo, m, { cell: pine, color: 0xffffff });
    pn(rboxGeo(w, 0.95, 0.045, 0.01), M(cx, 0, B.z0 + 0.025)); pn(rboxGeo(w, 0.6, 0.045, 0.01), M(cx, 0, B.z1 - 0.025));
    pn(rboxGeo(0.045, 0.1, len, 0.008), M(B.x0 + 0.022, 0.18, (B.z0 + B.z1) / 2)); pn(rboxGeo(0.045, 0.1, len, 0.008), M(B.x1 - 0.022, 0.18, (B.z0 + B.z1) / 2));
    for (const z of [B.z0 + 0.03, B.z1 - 0.03]) for (const xx of [B.x0 + 0.03, B.x1 - 0.03]) pn(rboxGeo(0.06, z < B.z1 - 0.1 ? 1.0 : 0.66, 0.06, 0.01), M(xx, 0, z));
    // mattress, sheet
    b('right', 'furn').add(rboxGeo(w - 0.06, 0.2, len - 0.08, 0.05, 3), M(cx, 0.28, (B.z0 + B.z1) / 2), { cell: this.art.cell('sheet'), color: 0xffffff });
    // pillows
    const pc = this.art.cell('pillowcase');
    b('right', 'cloth').add(rboxGeo(0.62, 0.13, 0.4, 0.06, 4), M(cx + 0.05, 0.47, B.z0 + 0.27, 0.08, -0.25), { cell: pc, color: 0xffffff });
    b('right', 'cloth').add(rboxGeo(0.58, 0.12, 0.38, 0.06, 4), M(cx - 0.12, 0.52, B.z0 + 0.36, -0.2, -0.45), { cell: pc, color: 0xfff0f8 });
    // the duvet: on the bed, pulled half off its near side onto the floor, rumpled
    b('right', 'cloth').add(duvetGeo(L), new THREE.Matrix4(), { cell: this.art.cell('duvet'), color: (x, y, z) => lin(0xffffff, 0.86 + 0.14 * clamp01(y * 3)), move: (x, y) => [0, 0.008 + 0.01 * clamp01(y * 2)] });
    // stickers on the headboard and footboard
    const N = V(0, 0, 1), U = V(1, 0, 0), ey = V(0, 1, 0);
    [['stk1', 0.25, 0.85], ['stk3', -0.3, 0.75], ['stk7', 0.32, 0.6]].forEach(([n, u, v]) => this.piece('right', n, V(cx + u, v, B.z0 + 0.049), U, ey, N, (this.R() - 0.5) * 0.6));
    [['stk2', 0.2, 0.52], ['stk11', -0.22, 0.48]].forEach(([n, u, v]) => this.piece('right', n, V(cx + u, v, B.z1 + 0.001), U, ey, N, (this.R() - 0.5) * 0.6));
    // bedside table, the clock radio on it, a glass of water, a clear phone
    const S = L.bedside, sx = (S.x0 + S.x1) / 2, sw = S.x1 - S.x0;
    b('back', 'furn').add(rboxGeo(sw, S.h, S.z1 - S.z0, 0.01), M(sx, 0, (S.z0 + S.z1) / 2), { cell: A, color: 0xf2efe9 });
    b('back', 'furn').add(rboxGeo(sw - 0.04, 0.14, 0.01, 0.004), M(sx, S.h - 0.18, S.z1 + 0.002), { cell: A, color: 0xe9e5dd });
    b('back', 'chrome').add(rboxGeo(0.07, 0.015, 0.02, 0.006), M(sx, S.h - 0.12, S.z1 + 0.01), { color: 0xd9c08a });
    this.clockAt = V(sx - 0.05, S.h, S.z0 + 0.16);
    b('back', 'chrome').add(cylGeo(0.032, 0.036, 0.11, 14), M(sx + 0.12, S.h, S.z1 - 0.1), { color: lin(0xcfe6ff, 0.7) });
    this.phoneAt = V(sx + 0.08, S.h, S.z0 + 0.12);
  }

  buildDesk() {
    const L = this.L, D = L.desk, b = this.bag, A = this.art.cell('plain'), wood = this.art.cell('wood'), cx = (D.x0 + D.x1) / 2, w = D.x1 - D.x0, d = D.z1 - D.z0, zc = (D.z0 + D.z1) / 2;
    // a cheap self-assembly desk: beech top, white panels, a drawer pedestal on the right
    b('back', 'furn').add(rboxGeo(w, 0.028, d, 0.004), M(cx, D.h - 0.028, zc), { cell: wood, color: 0xffffff });
    b('back', 'furn').add(boxGeo(0.02, D.h - 0.028, d - 0.02), M(D.x0 + 0.02, 0, zc), { cell: A, color: 0xf3f1ec });
    b('back', 'furn').add(boxGeo(w - 0.04, 0.3, 0.015), M(cx, D.h - 0.33, D.z0 + 0.02), { cell: A, color: 0xf3f1ec });   // modesty panel
    const px = D.x1 - 0.22;
    b('back', 'furn').add(boxGeo(0.42, D.h - 0.028, d - 0.03), M(px, 0, zc - 0.005), { cell: A, color: 0xf3f1ec });
    for (let k = 0; k < 3; k++) { b('back', 'furn').add(rboxGeo(0.4, 0.21, 0.012, 0.003), M(px, 0.03 + k * 0.225, D.z1 - 0.012), { cell: A, color: 0xf7f5f0 }); b('back', 'chrome').add(rboxGeo(0.1, 0.012, 0.018, 0.005), M(px, 0.19 + k * 0.225, D.z1 + 0.004), { color: 0xc8ccd4 }); }
    [['stk5', 0.1, 0.55], ['stk8', -0.1, 0.33], ['stk13', 0.08, 0.12]].forEach(([n, u, v]) => this.piece('back', n, V(px + u, v, D.z1 + 0.001), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (this.R() - 0.5) * 0.5));
    // two shelves above it on brackets, books and CDs
    const sw = w - 0.12, sx = cx + 0.04;
    for (const y of L.shelves) {
      b('back', 'furn').add(rboxGeo(sw, 0.022, 0.23, 0.004), M(sx, y, L.Z0 + 0.115), { cell: A, color: 0xf6f4ef });
      for (const s of [-1, 1]) b('back', 'chrome').add(boxGeo(0.015, 0.012, 0.18), M(sx + s * (sw / 2 - 0.12), y - 0.012, L.Z0 + 0.09), { color: 0x999ca4 });
    }
    this.bookRow('back', sx - sw / 2 + 0.03, sx - sw / 2 + 0.6, L.shelves[0] + 0.022, L.Z0 + 0.03, 0.17);
    this.bookRow('back', sx + 0.12, sx + sw / 2 - 0.03, L.shelves[0] + 0.022, L.Z0 + 0.03, 0.15, 'cds');
    this.bookRow('back', sx - sw / 2 + 0.03, sx - sw / 2 + 0.55, L.shelves[1] + 0.022, L.Z0 + 0.03, 0.18);
    // on the desk: a stack of CD spindles, a mug, a mouse mat, a pile of paper
    const top = D.h;
    for (let k = 0; k < 3; k++) { b('back', 'chrome').add(cylGeo(0.065, 0.065, 0.012, 24), M(D.x1 - 0.5, top + k * 0.05, D.z0 + 0.16 + (k % 2) * 0.01), { color: 0x222226 }); b('back', 'furn').add(cylGeo(0.062, 0.062, 0.04, 24), M(D.x1 - 0.5, top + 0.012 + k * 0.05, D.z0 + 0.16 + (k % 2) * 0.01), { cell: this.art.cell('cds'), color: lin(0xd0d0e0, 0.9) }); }
    b('back', 'furn').add(cylGeo(0.04, 0.042, 0.1, 18), M(D.x1 - 0.15, top, D.z0 + 0.45), { cell: A, color: 0xff6fae });
    b('back', 'furn').add(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), M(D.x1 - 0.105, top + 0.05, D.z0 + 0.45, 0, 0, -Math.PI / 2), { cell: A, color: 0xff6fae });
    b('back', 'furn').add(rboxGeo(0.24, 0.004, 0.2, 0.002), M(cx - 0.05, top, D.z1 - 0.14, 0.1), { cell: this.art.cell('big1'), color: 0xffffff });
    // the subwoofer on the floor beside the chest (it goes with the loose things: it stays on the hill)
    const [qx, qz] = L.sub;
    b('free', 'furn').add(rboxGeo(0.28, 0.32, 0.28, 0.012), M(qx, 0, qz, 0.3), { cell: A, color: 0x232428 });
    this.subAt = { x: qx, z: qz, a: 0.3 };
  }

  bookRow(g, x0, x1, y, z, hmax, kind = 'books', xf = null) {
    const c = this.art.cell(kind), R = this.R, b = this.bag(g, 'furn'), A = this.art.cell('plain');
    let x = x0;
    while (x < x1 - 0.02) {
      const w = kind === 'cds' ? 0.0104 * (4 + Math.floor(R() * 5)) : 0.02 + R() * 0.035, h = kind === 'cds' ? 0.125 : hmax * (0.65 + R() * 0.35), d = kind === 'cds' ? 0.14 : 0.13 + R() * 0.06;
      if (x + w > x1) break;
      const a0 = R() * 0.85, f = sub(c, a0, a0 + (kind === 'cds' ? w / 0.6 : w / 0.9), 0, kind === 'cds' ? 1 : h / 0.24);
      const lean = R() < 0.08 && kind !== 'cds' ? 0.18 : 0;
      const m = M(x + w / 2 + lean * h * 0.5, y, z + d / 2, 0, 0, -lean); if (xf) m.premultiply(xf);
      b.add(boxGeo(w, h, d), m, { cell: [A, A, A, A, f, A], color: kind === 'cds' ? 0xffffff : lin(0xffffff, 0.95) });
      x += w + 0.002 + lean * h;
      if (R() < 0.06 && kind !== 'cds') x += 0.05;
    }
  }

  buildChest() {
    const L = this.L, C = L.chest, b = this.bag, A = this.art.cell('plain'), cx = (C.x0 + C.x1) / 2, w = C.x1 - C.x0, d = C.z1 - C.z0;
    b('back', 'furn').add(rboxGeo(w, C.h, d, 0.008), M(cx, 0.04, (C.z0 + C.z1) / 2), { cell: A, color: 0xf3f0ea });
    b('back', 'furn').add(boxGeo(w - 0.04, 0.04, d - 0.04), M(cx, 0, (C.z0 + C.z1) / 2), { cell: A, color: 0xd8d4cc });
    for (let k = 0; k < 4; k++) {
      const out = k === 1 ? 0.07 : 0, y = 0.07 + k * 0.19;
      b('back', 'furn').add(rboxGeo(w - 0.05, 0.17, 0.014, 0.004), M(cx, y, C.z1 + 0.005 + out), { cell: A, color: 0xf8f6f1 });
      for (const s of [-1, 1]) b('back', 'chrome').add(new THREE.SphereGeometry(0.014, 10, 6), M(cx + s * w * 0.25, y + 0.085, C.z1 + 0.02 + out), { color: 0xd9c08a });
      if (out) {                                                     // a drawer left open, a sleeve hanging out of it
        b('back', 'furn').add(boxGeo(w - 0.08, 0.13, out), M(cx, y + 0.02, C.z1 - out / 2 + 0.005 + out), { cell: A, color: 0xe9e5dd });
        const g = new THREE.PlaneGeometry(0.12, 0.3, 3, 10), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setZ(i, yy > 0.08 ? 0.05 * (yy - 0.08) * 6 : 0.01 * Math.sin(yy * 30)); } g.computeVertexNormals();
        b('back', 'cloth').add(g, M(cx + 0.12, y + 0.04, C.z1 + out + 0.02, 0.2), { cell: A, color: 0x2a2a30, move: (x, yy) => [0, 0.03 * clamp01(-yy * 3)] });
      }
    }
    [['stk6', -0.2, 0.62], ['stk10', 0.22, 0.45], ['stk14', -0.15, 0.25], ['stk16', 0.2, 0.15]].forEach(([n, u, v]) => this.piece('back', n, V(cx + u, v, C.z1 + 0.013), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (this.R() - 0.5) * 0.6));
    // the mini hi-fi on top: centre unit, two speakers (their cones pump: movers)
    const top = C.h + 0.04, hz = C.z0 + 0.2, H = this.art.cell('hifi'), Wf = this.art.cell('woofer'), dark = 0x3a3d45;
    b('back', 'furn').add(boxGeo(0.27, 0.2, 0.26), M(cx, top, hz), { cell: [A, A, A, A, H, A], color: 0xffffff });
    for (const s of [-1, 1]) b('back', 'furn').add(boxGeo(0.19, 0.31, 0.21), M(cx + s * 0.24, top, hz), { cell: [A, A, A, A, Wf, A], color: 0xffffff });
    this.hifiAt = { cx, top, z: hz + 0.13 };
  }

  buildWardrobe() {
    const L = this.L, Wd = L.wardrobe, b = this.bag, A = this.art.cell('plain'), x1 = Wd.x1, zc = (Wd.z0 + Wd.z1) / 2, d = Wd.z1 - Wd.z0;
    b('left', 'furn').add(rboxGeo(Wd.x1 - Wd.x0, Wd.h, d, 0.008), M((Wd.x0 + Wd.x1) / 2, 0, zc), { cell: A, color: 0xf3f0ea });
    // two doors on its room face: one with a long mirror, one covered in stickers and a poster
    const wd = this.art.cell('wdoor'), dw = d / 2 - 0.01, U = V(0, 0, 1), ey = V(0, 1, 0), N = V(1, 0, 0);
    for (const s of [-1, 1]) b('left', 'furn').add(rboxGeo(0.02, Wd.h - 0.12, dw, 0.004), M(x1 + 0.01, 0.08, zc + s * (dw / 2 + 0.005)), { cell: wd, color: 0xffffff });
    b('left', 'mirror').add(boxGeo(0.004, 1.45, dw - 0.12), M(x1 + 0.021, 0.35, zc + dw / 2 + 0.005));
    for (const s of [-1, 1]) b('left', 'chrome').add(rboxGeo(0.02, 0.16, 0.02, 0.006), M(x1 + 0.03, 1.0, zc + s * 0.03), { color: 0xc8ccd4 });
    const z0 = zc - dw / 2, put = (n, z, y, r) => this.piece('left', n, V(x1 + 0.021, y, z), U, ey, N, r);
    put('big8', z0 + 0.02, 1.35, 0.03); put('stk12', z0 - 0.2, 0.75, 0.3); put('stk15', z0 + 0.15, 0.6, -0.2); put('stk17', z0 - 0.12, 0.45, 0.1); put('photo3', z0 - 0.1, 1.85, -0.1); put('postit2', z0 + 0.18, 0.95, 0.12);
    // a dressing gown on a hook on the mirror door, breathing
    const g = new THREE.PlaneGeometry(0.42, 1.05, 10, 16), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const xx = p.getX(k), yy = p.getY(k), t = (0.52 - yy) / 1.05; p.setZ(k, 0.05 * Math.sin((xx / 0.42 + 0.5) * Math.PI * 5) * t + 0.08 * Math.cos(xx * 6) * (1 - t) * 0.5 + 0.02); p.setX(k, xx * (0.55 + 0.45 * Math.min(1, t * 3))); }
    g.computeVertexNormals();
    b('left', 'cloth').add(g, M(x1 + 0.06, 1.32, zc + dw * 0.75, Math.PI / 2), { cell: A, color: 0xff8fc8, move: (xx, yy) => [0, 0.035 * clamp01((0.52 - yy) / 1.05) ** 1.5] });
    b('left', 'chrome').add(cylGeo(0.008, 0.008, 0.05, 6), M(x1 + 0.03, 1.84, zc + dw * 0.75, 0, 0, -Math.PI / 2), { color: 0xd9c08a });
  }

  buildRight() {
    const L = this.L, b = this.bag, A = this.art.cell('plain'), K = L.bookcase, T = L.tower;
    // a low bookcase, full
    const kx = (K.x0 + K.x1) / 2, kz = (K.z0 + K.z1) / 2, kd = K.x1 - K.x0, kw = K.z1 - K.z0;
    const box = (w, h, d, x, y, z) => b('right', 'furn').add(boxGeo(w, h, d), M(x, y, z), { cell: A, color: 0xf4f1ec });
    box(kd, 0.02, kw, kx, K.h - 0.02, kz); box(kd, 0.02, kw, kx, 0, kz); box(kd, K.h, 0.02, kx, 0, K.z0 + 0.01); box(kd, K.h, 0.02, kx, 0, K.z1 - 0.01); box(0.015, K.h, kw, K.x1 - 0.008, 0, kz);
    for (const y of [0.3, 0.6]) box(kd - 0.02, 0.018, kw - 0.04, kx, y, kz);
    // books on their sides along z: built along x then turned
    for (const [y, kind] of [[0.02, 'books'], [0.318, 'cds'], [0.618, 'books']]) this.bookRow('right', -kw / 2 + 0.03, kw / 2 - 0.03, 0, 0, 0.26, kind, M(K.x1 - 0.02, y, kz, -Math.PI / 2));
    // a CD tower
    const tx = (T.x0 + T.x1) / 2, tz = (T.z0 + T.z1) / 2;
    b('right', 'furn').add(boxGeo(T.x1 - T.x0, 0.03, T.z1 - T.z0), M(tx, 0, tz), { cell: A, color: 0x1d1d22 });
    for (const s of [-1, 1]) b('right', 'chrome').add(boxGeo(0.01, T.h, 0.012), M(tx, 0, tz + s * 0.085), { color: 0x9aa0aa });
    const cds = this.art.cell('cds');
    for (let k = 0; k < 26; k++) { const a0 = this.R() * 0.8; b('right', 'furn').add(boxGeo(0.14, 0.0104 * 4, 0.125), M(tx - 0.0, 0.05 + k * 0.044, tz, -Math.PI / 2), { cell: [A, A, A, A, sub(cds, a0, a0 + 0.07, 0, 1), A], color: 0xffffff }); }
    // a guitar leaning on the wall by the tower
    const gx = L.X1 - 0.12, gz = T.z1 + 0.3, gm = (y, z, sx, sy, sz) => M(gx, y, gz + z, 0, 0, 0.17, sx, sy, sz);
    const red = lin(0xd81b2c), bm = new THREE.Matrix4().makeRotationZ(0.17);
    const gb = (geo, x, y, z, col) => b('right', 'furn').add(geo, new THREE.Matrix4().makeTranslation(gx, 0, gz).multiply(bm).multiply(new THREE.Matrix4().makeTranslation(x, y, z)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), { cell: A, color: col });
    gb(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24).rotateX(Math.PI / 2), 0, 0.22, 0, red); gb(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 24).rotateX(Math.PI / 2), 0, 0.43, 0, red);
    gb(new THREE.CylinderGeometry(0.035, 0.035, 0.052, 16).rotateX(Math.PI / 2), 0, 0.32, 0, lin(0x111111));
    gb(new THREE.BoxGeometry(0.05, 0.5, 0.025), 0, 0.78, 0, lin(0x6b3d1d)); gb(new THREE.BoxGeometry(0.07, 0.15, 0.022), 0, 1.1, 0, lin(0x1a1a1a));
    // the inflatable chair goes with the loose things (built as a mover)
  }

  buildCeiling() {
    const L = this.L, b = this.bag, H = L.H, A = this.art.cell('plain');
    const geo = new THREE.PlaneGeometry(L.X1 - L.X0, L.Z1 - L.Z0, 4, 4), uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (L.X1 - L.X0) / 1.3, uv.getY(k) * (L.Z1 - L.Z0) / 1.3);
    b('ceil', 'paint').add(geo, new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, 0, 1), V(0, -1, 0)).setPosition((L.X0 + L.X1) / 2, H, (L.Z0 + L.Z1) / 2), { color: lin(0xf0ecf6, 0.9) });
    // coving round the top of the walls
    b('back', 'furn').add(boxGeo(L.X1 - L.X0, 0.06, 0.04), M((L.X0 + L.X1) / 2, H - 0.06, L.Z0 + 0.02), { cell: A, color: 0xf6f3ee });
    b('right', 'furn').add(boxGeo(0.04, 0.06, L.Z1 - L.Z0), M(L.X1 - 0.02, H - 0.06, (L.Z0 + L.Z1) / 2), { cell: A, color: 0xf6f3ee });
    b('left', 'furn').add(boxGeo(0.04, 0.06, L.Z1 - L.Z0), M(L.X0 + 0.02, H - 0.06, (L.Z0 + L.Z1) / 2), { cell: A, color: 0xf6f3ee });
    // glow-in-the-dark stars, stuck on in a hurry
    const S = this.art.cell('stars'), R = this.R, st = this.bag('ceil', 'stars');
    for (let k = 0; k < (this.lite ? 40 : 70); k++) {
      const i = Math.floor(R() * 6), j = Math.floor(R() * 3), c = sub(S, i / 6, (i + 1) / 6, 1 - (j + 1) / 3, 1 - j / 3), s = 0.04 + R() * 0.06;
      const x = L.X0 + 0.2 + R() * (L.X1 - L.X0 - 0.4), z = L.Z0 + 0.2 + R() * (L.Z1 - L.Z0 - 0.6), a = R() * 6.28;
      quad(st, V(x, H - 0.002, z), V(Math.cos(a), 0, Math.sin(a)), V(-Math.sin(a), 0, Math.cos(a)), s, s, c);
    }
    // the paper lantern round the room's lamp, on its flex
    const P = L.lantern;
    b('ceil', 'chrome').add(cylGeo(0.004, 0.004, H - P.y - 0.17, 6), M(P.x, P.y + 0.17, P.z), { color: 0xeeeeee });
    b('ceil', 'basic').add(new THREE.SphereGeometry(0.19, 20, 14).scale(1, 0.88, 1), M(P.x, P.y, P.z), { cell: A, color: lin(0xffe3b8, 1.5) });
    for (let k = -2; k <= 2; k++) b('ceil', 'chrome').add(new THREE.TorusGeometry(0.19 * Math.cos(k * 0.32) + 0.002, 0.0015, 4, 32), M(P.x, P.y + 0.19 * 0.88 * Math.sin(k * 0.32), P.z, 0, Math.PI / 2), { color: 0xbfae90 });
    // the mirror ball's chain
    b('ceil', 'chrome').add(cylGeo(0.003, 0.003, H - L.ball.y - 0.1, 4), M(L.ball.x, L.ball.y + 0.1, L.ball.z), { color: 0xbbbbbb });
  }

  // a printed piece on a plane: centre p (of the paper itself), along U, up V, facing N; taped pieces lift a corner
  piece(g, name, p, U, Vv, N, rot = 0, { seg = 3, peel = null } = {}) {
    const c = this.art.cell(name); if (!c) return;
    const ca = Math.cos(rot), sa = Math.sin(rot), u = U.clone().multiplyScalar(ca).addScaledVector(Vv, sa), v = Vv.clone().multiplyScalar(ca).addScaledVector(U, -sa);
    const pc = peel == null ? (c.kind === 'poster' && this.R() < 0.35 ? Math.floor(this.R() * 4) : -1) : peel;
    const corner = [[0, 0], [1, 0], [0, 1], [1, 1]][pc] || null;
    const move = (x, y, z, s, t) => { if (!corner) return [0.12 * (1 - t) * (1 - t) * 4 * s * (1 - s), 0]; const d = Math.hypot(s - corner[0], t - corner[1]); return [Math.max(0, 1 - d * 1.6) ** 2, 0]; };
    const bag = this.bag(g, c.kind === 'surface' ? 'furn' : 'art');
    quad(bag, p.clone().addScaledVector(N, 0.0015), u, v, c.w, c.h, c, { seg: c.kind === 'sticker' ? 1 : seg, move, lift: corner ? 0.018 : 0, bend: c.kind === 'poster' && c.w > 0.35 ? 0.004 : 0 });
  }

  // ---- the walls' prints: collages, crooked, overlapping, denser low where low cameras look ----
  buildArt() {
    const L = this.L, R = this.R, art = this.art;
    const pools = { big: art.list('poster').filter((n) => /^big/.test(n) && n !== 'big8' && n !== 'big1'), mid: art.list('poster').filter((n) => /^(flyer|mag|sys|timetable|crayon)/.test(n)), small: art.list('photo'), stk: art.list('sticker') };
    const take = (k) => { const p = pools[k]; const n = p.shift(); p.push(n); return n; };
    // a wall: point on it at (u along it, v up), its U and N
    const walls = {
      back: { at: (u, v) => V(u, v, L.Z0), U: V(1, 0, 0), N: V(0, 0, 1) },
      left: { at: (u, v) => V(L.X0, v, -u), U: V(0, 0, -1), N: V(1, 0, 0) },
      right: { at: (u, v) => V(L.X1, v, u), U: V(0, 0, 1), N: V(-1, 0, 0) },
    };
    let depth = 0;
    const fill = (g, u0, u1, v1, v0, mix) => {                 // v1: the top of the band, v0 its foot
      const W = walls[g]; let v = v1;
      while (v > v0 + 0.05) {
        let u = u0 + R() * 0.05, row = 0;
        while (u < u1 - 0.05) {
          const kind = mix[Math.floor(R() * mix.length)], name = take(kind), c = art.cell(name); if (!c) break;
          const [w, h] = c.inner, cu = u + w / 2 + (R() - 0.5) * 0.04, cv = v - h / 2 - (R() - 0.3) * 0.05;
          if (cu + w / 2 > u1 + 0.04 || cv - h / 2 < v0 - 0.03) { u += 0.08; continue; }
          const rot = (R() - 0.5) * (kind === 'big' ? 0.08 : kind === 'mid' ? 0.14 : 0.3);
          depth = (depth + 1) % 14;
          this.piece(g, name, W.at(cu, cv).addScaledVector(W.N, 0.0008 * depth), W.U, V(0, 1, 0), W.N, rot);
          if (R() < 0.3) { const sn = take('stk'); this.piece(g, sn, W.at(cu + (R() - 0.5) * w, cv + (R() - 0.5) * h).addScaledVector(W.N, 0.0008 * 14 + 0.001), W.U, V(0, 1, 0), W.N, (R() - 0.5)); }
          u += w * (0.78 + R() * 0.18); row = Math.max(row, h);
        }
        v -= row * (0.8 + R() * 0.12) || 0.1;
      }
    };
    const D = L.desk, C = L.chest, W = L.win, B = L.bed, Wd = L.wardrobe, Dr = L.door, K = L.bookcase, T = L.tower;
    // back wall
    fill('back', D.x0 + 0.05, D.x1 - 0.05, L.shelves[0] - 0.04, D.h + 0.12, ['small', 'small', 'mid']);   // between the desk and the shelf
    fill('back', D.x0, D.x1, L.H - 0.08, L.shelves[1] + 0.33, ['big', 'mid']);
    fill('back', Wd.x1 + 0.02, D.x0 - 0.02, 2.3, 0.15, ['small', 'mid']);
    fill('back', C.x0 - 0.04, C.x1 + 0.04, L.H - 0.1, C.h + 1.02, ['mid', 'small']);
    fill('back', W.x0 - 0.02, W.x1 + 0.02, L.H - 0.06, W.y1 + 0.2, ['small', 'mid']);
    fill('back', W.x1 + 0.1, B.x0 + 0.12, L.H - 0.08, L.bedside.h + 0.08, ['mid', 'small', 'small']);
    fill('back', B.x0 + 0.05, B.x1 - 0.03, L.H - 0.08, 1.02, ['big', 'mid']);
    // right wall: the big collage over the bed, more past it
    fill('right', B.z0 + 0.06, B.z1, L.H - 0.08, 0.66, ['big', 'mid', 'mid', 'small']);
    fill('right', K.z0, L.Z1 - 0.35, L.H - 0.08, K.h + 0.08, ['big', 'mid', 'small']);
    fill('right', T.z1 + 0.62, L.Z1 - 0.35, K.h, 0.14, ['mid', 'small']);
    // left wall: over the wardrobe, between it and the door, beyond the door
    fill('left', -(Dr.z0 - 0.1), -(Wd.z1 + 0.05), L.H - 0.08, 0.14, ['big', 'mid', 'small']);
    fill('left', -(L.Z1 - 0.35), -(Dr.z1 + 0.12), L.H - 0.08, Dr.h + 0.05, ['mid', 'small']);
    fill('left', -(L.Z1 - 0.35), -(Dr.z1 + 0.95), Dr.h - 0.05, 0.2, ['big', 'mid', 'small']);
    fill('left', -(Wd.z1 - 0.05), -(Wd.z0 + 0.05), L.H - 0.06, Wd.h + 0.08, ['small']);
    // the calendar and the cork board get their own places
    this.piece('back', 'cork', V((C.x0 + C.x1) / 2, C.h + 0.7, L.Z0 + 0.006), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.01, { peel: -1 });
    this.piece('left', 'calendar', V(Wd.x0 + 0.3, 1.32, Wd.z1 + 0.002), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), -0.03);
  }

  // ---- fairy lights: strings round the top of the walls, the window, the headboard and the shelf ----
  buildFairy() {
    const L = this.L, W = L.win, B = L.bed, D = L.desk, y = 2.28, pal = [0xff5aa0, 0xffb060, 0x5ad8ff, 0xffe14a, 0xb87cff];
    const strings = [], path = (g, pts, sag = 0.07, hooks = 0.55) => {
      // between each hook the wire sags in a curve; a bulb every 10 cm
      const full = []; for (let k = 0; k + 1 < pts.length; k++) { const a = pts[k], b = pts[k + 1], n = Math.max(1, Math.round(a.distanceTo(b) / hooks)); for (let j = 0; j < n; j++) full.push([a.clone().lerp(b, j / n), a.clone().lerp(b, (j + 1) / n)]); }
      const curve = new THREE.CurvePath(); for (const [a, b] of full) { const m = a.clone().lerp(b, 0.5); m.y -= sag; curve.add(new THREE.QuadraticBezierCurve3(a, m, b)); }
      const len = curve.getLength(), n = Math.floor(len / 0.1), bulbs = [];
      for (let k = 0; k < n; k++) { const p = curve.getPointAt((k + 0.5) / n); p.y -= 0.012; bulbs.push(this.dot(g, p, pal[(k + strings.length) % pal.length], 0.011, 'fairy', 1.35)); }
      const tube = new THREE.TubeGeometry(curve, Math.max(8, Math.round(len / 0.06)), 0.0018, 3, false);
      this.bag(g, 'chrome').add(tube, new THREE.Matrix4(), { color: 0x1c3a20 });
      strings.push({ g, bulbs, curve, len, inward: g === 'back' ? V(0, -0.3, 0.45) : g === 'left' ? V(0.45, -0.3, 0) : g === 'right' ? V(-0.45, -0.3, 0) : V(0, -0.3, 0.45) });
    };
    path('back', [V(L.wardrobe.x1 + 0.05, y, L.Z0 + 0.03), V(L.X1 - 0.03, y, L.Z0 + 0.03)]);
    path('right', [V(L.X1 - 0.03, y, L.Z0 + 0.05), V(L.X1 - 0.03, y, L.Z1 - 0.4)]);
    path('left', [V(L.X0 + 0.03, y, L.wardrobe.z1 + 0.05), V(L.X0 + 0.03, y, L.Z1 - 0.4)]);
    path('back', [V(W.x0 - 0.08, W.y0 + 0.1, L.Z0 + 0.1), V(W.x0 - 0.08, W.y1 + 0.08, L.Z0 + 0.1), V(W.x1 + 0.08, W.y1 + 0.08, L.Z0 + 0.1), V(W.x1 + 0.08, W.y0 + 0.1, L.Z0 + 0.1)], 0.03, 0.3);
    path('right', [V(B.x0 + 0.02, 1.0, B.z0 + 0.06), V(B.x1 - 0.02, 1.0, B.z0 + 0.06)], 0.05, 0.3);
    path('back', [V(D.x0 + 0.1, L.shelves[1] + 0.02, L.Z0 + 0.24), V(D.x1 - 0.05, L.shelves[1] + 0.02, L.Z0 + 0.24)], 0.09, 0.4);
    // twelve lamps for the shader: each string's share, centred on its stretch and stood off its wall
    const total = strings.reduce((s, q) => s + q.bulbs.length, 0); let li = 0;
    this.fairy.groups = [];
    for (const s of strings) {
      const k = Math.max(1, Math.round(NF * s.bulbs.length / total)), per = Math.ceil(s.bulbs.length / k);
      for (let j = 0; j < k && li < NF; j++) { const list = s.bulbs.slice(j * per, (j + 1) * per); if (!list.length) continue; const c = list.reduce((a, d) => a.add(d.p), V()).divideScalar(list.length).add(s.inward); this.fairy.groups.push({ list, p: c, g: s.g }); li++; }
    }
    this.fairy.strings = strings; this.fairy.all = strings.flatMap((s) => s.bulbs.map((d, k) => ({ d, s, k, f: k / s.bulbs.length })));
  }

  // ---- the things that move, each its own small mesh ----
  buildMovers() {
    const L = this.L, b = this.bag, A = this.art.cell('plain'), R = this.R, g = this.groups, FL = this.FL;
    const own = (grp, mesh, at) => { const h = grp.userData.hinge; mesh.position.copy(at).sub(h); grp.add(mesh); return mesh; };
    const chrome = this.mats.chrome, std = (o) => roomLit(new THREE.MeshStandardMaterial(o));
    const merged = (parts, mat) => { const bg = new Bag(); for (const [geo, m, o] of parts) bg.add(geo, m, o || {}); return new THREE.Mesh(bg.geometry(), mat); };
    this.mv = {};
    // the venetian blind's slats
    { const B = this.blind, geo = new THREE.BoxGeometry(B.w, 0.0012, 0.025), m = new THREE.InstancedMesh(geo, chrome, B.n);
      const c = lin(0xf0efe8); for (let k = 0; k < B.n; k++) m.setColorAt(k, c);
      this.mv.slats = own(g.back, m, V(0, 0, 0)); m.position.set(-g.back.userData.hinge.x, 0, -g.back.userData.hinge.z); m.castShadow = false; m.frustumCulled = false; this.updateSlats(0, 0); }
    // the hi-fi's woofers and the subwoofer: cones that pump
    { const prof = [[0.072, 0], [0.068, -0.004], [0.03, -0.022], [0.018, -0.026], [0.018, -0.02], [0, -0.016]].map(([r, z]) => new THREE.Vector2(r, z));
      const cone = new THREE.LatheGeometry(prof, 20).rotateX(Math.PI / 2), H = this.hifiAt;
      const m = new THREE.InstancedMesh(cone, chrome, 3); for (let k = 0; k < 3; k++) m.setColorAt(k, lin(0x1a1a1e));
      m.frustumCulled = false; m.castShadow = false; this.mv.cones = { m, at: [V(H.cx - 0.24, H.top + 0.109, H.z - 0.025), V(H.cx + 0.24, H.top + 0.109, H.z - 0.025)], s: [0.95, 0.95] };
      own(g.back, m, V(0, 0, 0)).position.set(-g.back.userData.hinge.x, 0, -g.back.userData.hinge.z);
      const sub_ = new THREE.Mesh(cone.clone().scale(1.45, 1.45, 1.6), chrome); sub_.castShadow = false;
      const S = this.subAt; this.mv.sub = { m: sub_, at: V(S.x + Math.sin(S.a) * 0.141, 0.16, S.z + Math.cos(S.a) * 0.141), a: S.a };
      sub_.position.copy(this.mv.sub.at); sub_.rotation.y = S.a; g.free.add(sub_);
    }
    // the hi-fi's meter: ten bands of LEDs in its display window
    { const H = this.hifiAt; this.mv.eq = [];
      for (let bnd = 0; bnd < 10; bnd++) for (let r = 0; r < 5; r++) this.mv.eq.push({ d: this.dot('back', V(H.cx - 0.11 + bnd * 0.0145, H.top + 0.2 * (1 - 0.47) + r * 0.0088, H.z + 0.001), [0x2af0ff, 0x2aff8a, 0x9aff2a, 0xffd02a, 0xff3a2a][r], 0.0035, 'led', 0.6), bnd, r }); }
    // the desk lamp: base and lower arm fixed, the upper arm and head nod about the elbow
    { const D = L.desk, at = V(D.x0 + 0.55, D.h, D.z0 + 0.2), pink = lin(0xff7ab8);
      b('back', 'chrome').add(cylGeo(0.075, 0.08, 0.025, 24), M(at.x, at.y, at.z), { color: pink });
      const elbow = V(at.x, at.y + 0.33, at.z + 0.1);
      b('back', 'chrome').add(cylGeo(0.007, 0.007, 0.35, 6), M(at.x - 0.015, at.y + 0.02, at.z, 0, 0.29), { color: 0xd8d8dc });
      b('back', 'chrome').add(cylGeo(0.007, 0.007, 0.35, 6), M(at.x + 0.015, at.y + 0.02, at.z, 0, 0.29), { color: 0xd8d8dc });
      const head = merged([[cylGeo(0.007, 0.007, 0.3, 6), M(-0.015, 0, 0, 0, Math.PI / 2 - 0.35), { color: lin(0xd8d8dc) }], [cylGeo(0.007, 0.007, 0.3, 6), M(0.015, 0, 0, 0, Math.PI / 2 - 0.35), { color: lin(0xd8d8dc) }],
        [new THREE.LatheGeometry([[0.012, 0], [0.03, -0.02], [0.065, -0.1], [0.068, -0.105]].map(([r, y]) => new THREE.Vector2(r, y)), 20), M(0, 0.1, 0.29, 0, -0.5), { color: pink }],
        [new THREE.SphereGeometry(0.022, 12, 8), M(0, 0.1, 0.29), { color: pink }]], chrome);
      head.castShadow = true; this.mv.lamp = { m: own(g.back, head, elbow), bulb: V(0, 0.05, 0.33), base: 0.25 };
      this.mv.lamp.dot = this.dot('back', elbow.clone().add(V(0, 0.05, 0.33)), 0xfff0d0, 0.024, 'bulb'); }
    // the desk fan: oscillating head, spinning blades
    { const D = L.desk, at = V(D.x0 + 0.17, D.h, D.z0 + 0.3);
      b('back', 'chrome').add(cylGeo(0.075, 0.08, 0.03, 24), M(at.x, at.y, at.z), { color: 0xf2f2f6 });
      b('back', 'chrome').add(cylGeo(0.012, 0.012, 0.2, 8), M(at.x, at.y + 0.03, at.z), { color: 0xf2f2f6 });
      const parts = [[new THREE.SphereGeometry(0.04, 16, 10).scale(1, 1, 1.4), M(0, 0, -0.045), { color: lin(0xf2f2f6) }]];
      for (const z of [0.005, 0.06]) parts.push([new THREE.TorusGeometry(0.115, 0.0022, 4, 40), M(0, 0, z), { color: lin(0xd8dce4) }]);
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; parts.push([new THREE.BoxGeometry(0.002, 0.115, 0.002), M(Math.cos(a) * 0.058, Math.sin(a) * 0.058, 0.064, 0, 0, a - Math.PI / 2), { color: lin(0xd8dce4) }]); }
      parts.push([new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16).rotateX(Math.PI / 2), M(0, 0, 0.066), { color: lin(0x5ad8ff) }]);
      const head = merged(parts, chrome); head.castShadow = true;
      const bp = []; for (let k = 0; k < 3; k++) bp.push([new THREE.SphereGeometry(0.05, 10, 6).scale(1, 0.55, 0.06), M(Math.cos(k * 2.094) * 0.052, Math.sin(k * 2.094) * 0.052, 0, 0, 0.35, k * 2.094), { color: lin(0x9ad8ff) }]);
      const blades = merged(bp, std({ vertexColors: true, roughness: 0.3, transparent: true, opacity: 0.75 })); blades.position.z = 0.03;
      head.add(blades); this.mv.fan = { m: own(g.back, head, V(at.x, at.y + 0.25, at.z)), blades, spin: 0, osc: 0 }; }
    // the lava lamp
    { const D = L.desk, at = V(D.x1 - 0.12, D.h, D.z0 + 0.14), pur = lin(0x6a2cff);
      b('back', 'chrome').add(new THREE.LatheGeometry([[0, 0], [0.065, 0], [0.065, 0.006], [0.035, 0.13], [0, 0.13]].map(([r, y]) => new THREE.Vector2(r, y)), 24), M(at.x, at.y, at.z), { color: pur });
      b('back', 'chrome').add(new THREE.LatheGeometry([[0.026, 0], [0.013, 0.065], [0, 0.065]].map(([r, y]) => new THREE.Vector2(r, y)), 20), M(at.x, at.y + 0.42, at.z), { color: pur });
      const prof = []; for (let k = 0; k <= 16; k++) { const t = k / 16; prof.push(new THREE.Vector2(lavaR(t), 0.13 + t * 0.29)); }
      const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), lavaMat()); m.castShadow = false;
      this.mv.lava = { m: own(g.back, m, at), t: 0, at: at.clone().add(V(0, 0.27, 0)) }; }
    // the plasma ball on the shelf
    { const at = V(L.desk.x1 - 0.32, L.shelves[0] + 0.022, L.Z0 + 0.12);
      b('back', 'chrome').add(new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.06, 0.01], [0.045, 0.055], [0.028, 0.065], [0, 0.065]].map(([r, y]) => new THREE.Vector2(r, y)), 24), M(at.x, at.y, at.z), { color: lin(0x111114) });
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 20), plasmaMat()); m.castShadow = false;
      this.mv.plasma = { m: own(g.back, m, at.clone().add(V(0, 0.13, 0))), aim: V(0, 0, 1), zap: 0, at: at.clone().add(V(0, 0.13, 0)) }; }
    // the router on the shelf: LEDs that flicker with the hats
    { const at = V(L.desk.x0 + 0.85, L.shelves[1] + 0.022, L.Z0 + 0.12);
      b('back', 'furn').add(rboxGeo(0.2, 0.035, 0.13, 0.008), M(at.x, at.y, at.z), { cell: A, color: 0xeeeef2 });
      for (const s of [-1, 1]) b('back', 'chrome').add(cylGeo(0.005, 0.004, 0.16, 6), M(at.x + s * 0.08, at.y + 0.03, at.z - 0.05, 0, 0, s * 0.25), { color: 0x2a2a2e });
      this.mv.router = [0, 1, 2, 3, 4, 5].map((k) => ({ d: this.dot('back', V(at.x - 0.07 + k * 0.028, at.y + 0.018, at.z + 0.066), k ? 0x2aff6a : 0xffa020, 0.0032, 'led'), on: 1 })); }
    // the webcam on a gooseneck: it turns to look at the lens
    { const D = L.desk, at = V(D.x0 + 0.95, D.h, D.z0 + 0.12), neck = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.01, 0.1, 0.02), V(-0.02, 0.2, 0.05), V(0, 0.27, 0.07)]);
      b('back', 'chrome').add(cylGeo(0.04, 0.045, 0.02, 20), M(at.x, at.y, at.z), { color: 0x222226 });
      b('back', 'chrome').add(new THREE.TubeGeometry(neck, 20, 0.006, 6), M(at.x, at.y + 0.02, at.z), { color: 0x333338 });
      const head = merged([[new THREE.SphereGeometry(0.038, 20, 14), M(0, 0, 0), { color: lin(0xf2f2f6) }], [new THREE.CylinderGeometry(0.02, 0.022, 0.012, 20).rotateX(Math.PI / 2), M(0, 0, 0.034), { color: lin(0x111111) }],
        [new THREE.SphereGeometry(0.012, 12, 8), M(0, 0, 0.037), { color: lin(0x203048) }]], chrome);
      this.mv.cam = { m: own(g.back, head, at.clone().add(V(0, 0.33, 0.07))), q: new THREE.Quaternion(), led: this.dot('back', V(0, 0, 0), 0x3a7aff, 0.004, 'led'), look: V() }; }
    // the clock radio
    { const at = this.clockAt;
      b('back', 'furn').add(rboxGeo(0.2, 0.075, 0.1, 0.015), M(at.x, at.y, at.z, -0.25), { cell: A, color: 0x1e1f24 });
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.045), new THREE.MeshBasicMaterial({ map: t, color: lin(0xffffff, 2.2) }));
      m.rotation.set(-0.08, -0.25, 0); this.mv.clock = { m: own(g.back, m, at.clone().add(V(Math.sin(-0.25) * 0.0505, 0.038, Math.cos(-0.25) * 0.0505))), cv, t, shown: '' };
      this.drawClock('2:47', true); }
    // the clear phone on the bedside: its insides light up on her chops
    { const at = this.phoneAt;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.19).translate(0, 0.025, 0), std({ color: lin(0x9a6aff, 0.8), transparent: true, opacity: 0.55, roughness: 0.1, emissive: 0xff2bd8, emissiveIntensity: 0 }));
      m.rotation.y = 0.4; this.mv.phone = { m: own(g.back, m, at), k: 0 }; }
    // the mirror ball
    { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 3), ballMat()); m.castShadow = false;
      this.mv.ball = { m: own(g.ceil, m, L.ball), a: 0 }; }
    // CDs hanging in the window on threads, turning
    { const W = L.win, n = this.lite ? 8 : 15, m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.0012, 28).rotateX(Math.PI / 2), cdMat(), n); m.frustumCulled = false; m.castShadow = false;
      this.mv.cds = { m, list: [] };
      for (let k = 0; k < n; k++) { const s = k % 3, j = Math.floor(k / 3), x = W.x0 + 0.25 + s * (W.x1 - W.x0 - 0.5) / 2, yv = W.y1 + 0.05 - 0.16 - j * 0.15; this.mv.cds.list.push({ p: V(x, yv, L.Z0 + 0.14), a: R() * 6, w: (R() - 0.5) * 0.6 });
        if (j === 0) b('back', 'chrome').add(cylGeo(0.0006, 0.0006, W.y1 + 0.14 - yv, 3), M(x, yv, L.Z0 + 0.14), { color: 0xffffff }); }
      own(g.back, m, V(0, 0, 0)).position.set(-g.back.userData.hinge.x, 0, -g.back.userData.hinge.z); }
    // the bead curtain: strands of beads making the face, swinging on the kick
    { const B = this.beadsAt, ns = this.lite ? 14 : 21, nb = this.lite ? 26 : 40, len = B.top - 0.08, m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.0095, 0), roomLit(new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.1 })), ns * nb);
      const pic = document.createElement('canvas'); pic.width = ns * 6; pic.height = nb * 6; const x = pic.getContext('2d');
      const gr = x.createLinearGradient(0, 0, 0, pic.height); gr.addColorStop(0, '#ff2bd8'); gr.addColorStop(0.5, '#1f33ff'); gr.addColorStop(1, '#5ad8ff'); x.fillStyle = gr; x.fillRect(0, 0, pic.width, pic.height);
      drawFace(x, pic.width / 2, pic.height * 0.4, pic.width * 0.36);
      const px = x.getImageData(0, 0, pic.width, pic.height).data;
      m.frustumCulled = false; m.castShadow = false;
      this.mv.beads = { m, ns, nb, len, strands: Array.from({ length: ns }, (_, s) => ({ z: B.z0 + (B.z1 - B.z0) * (s + 0.5) / ns, ax: 0, vx: 0, az: 0, vz: 0, ph: R() * 6 })) };
      for (let s = 0; s < ns; s++) for (let k = 0; k < nb; k++) { const i = (Math.floor((k + 0.5) / nb * pic.height) * pic.width + Math.floor((s + 0.5) / ns * pic.width)) * 4; m.setColorAt(s * nb + k, new THREE.Color().setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace)); }
      b('left', 'chrome').add(boxGeo(0.02, 0.02, B.z1 - B.z0), M(B.x, B.top, (B.z0 + B.z1) / 2), { color: 0x6b3d1d });
      own(g.left, m, V(0, 0, 0)).position.set(-g.left.userData.hinge.x, 0, 0); }
    // the inflatable chair
    { const [cx, cz] = L.chair, toPile = Math.atan2(0.04 - cx, 0 - cz), parts = [], P = (geo, m) => parts.push([geo, m, { color: lin(0xffffff) }]);
      P(new THREE.TorusGeometry(0.29, 0.13, 14, 36).rotateX(Math.PI / 2), M(0, 0.13, 0));
      P(new THREE.TorusGeometry(0.27, 0.12, 14, 36), M(0, 0.47, -0.27, 0, -0.32));
      for (const s of [-1, 1]) P(new THREE.TorusGeometry(0.17, 0.085, 12, 28).rotateY(Math.PI / 2), M(s * 0.36, 0.3, 0.02));
      P(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 30), M(0, 0.17, 0));
      const m = merged(parts, std({ color: lin(0xb06bff), transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0, depthWrite: false, envMapIntensity: 2 }));
      m.position.set(cx, 0, cz); m.rotation.y = toPile; m.castShadow = true; m.renderOrder = 2; this.groups.free.add(m); this.mv.chair = { m, k: 0 }; }
  }

  drawClock(text, colon) {
    const C = this.mv.clock, x = C.cv.getContext('2d'), w = C.cv.width, h = C.cv.height;
    x.fillStyle = '#120202'; x.fillRect(0, 0, w, h);
    x.font = '84px VT323, "Courier New", monospace'; x.textBaseline = 'middle'; x.textAlign = 'right';
    x.fillStyle = 'rgba(255,40,20,.08)'; x.fillText('88:88', w - 34, h / 2 + 4);                  // the unlit segments
    x.fillStyle = '#ff2a1a'; x.fillText(colon ? text : text.replace(':', ' '), w - 34, h / 2 + 4);
    x.fillRect(w - 22, 20, 8, 8);                                                           // the alarm-set dot
    C.t.needsUpdate = true; C.shown = text + colon;
  }

  updateSlats(rattle, t) {
    const S = this.mv.slats, B = this.blind, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let k = 0; k < B.n; k++) { e.set(B.open + rattle * Math.sin(t * 37 + k * 1.7) * 0.25, 0, rattle * Math.sin(t * 23 + k) * 0.01); q.setFromEuler(e); m.compose(V(B.cx, B.y1 - k * B.pitch, B.bz + 0.01), q, V(1, 1, 1)); S.setMatrixAt(k, m); }
    S.instanceMatrix.needsUpdate = true;
  }

  // a prop from set.js goes on a surface of the room: it moves with that wall
  mount(o, wall) {
    const g = this.groups[wall] || this.groups.back, h = g.userData.hinge;
    o.position.sub(V(h.x, this.FL + h.y, h.z));                  // set.js placed it in the room group's coordinates; the wall at rest
    g.add(o); o.userData.base = { p: o.position.clone(), r: o.rotation.clone() }; this.mounted.push(o);
  }

  // ---------------- every frame ----------------
  update(dt, fx, st) {
    if (!this.built) return;
    // it arrives under a flash (or at once when nothing is playing), so the room is never seen popping in
    if (!this.shown) { this.waitT = (this.waitT || 0) + dt; if (!st.playing || this.flashed || this.waitT > 4) { this.shown = true; performance.mark('shell:shown'); } else return; }
    this.t += dt; const L = this.L, t = this.t, R = this.R, red = st.reduce;
    this.ctx.root.updateMatrixWorld(); this.camPos = this.ctx.root.localToWorld(st.eye.clone());
    const home = st.act === 'room' || st.act === 'off';
    // where the walls are: standing (0) .. fallen away (1)
    if (home) { const was = this.f; this.f = Math.max(0, this.f - dt / 0.45); if (was > 0 && this.f === 0) this.slam = 1; }
    else if (st.act === 'bliss') this.f = 1;
    else this.f = Math.max(this.f, clamp01(st.lift * 1.6));
    this.fFree = home || st.act === 'bliss' ? Math.max(0, this.fFree - dt / 0.45) : Math.max(this.fFree, clamp01(st.lift * 1.4));
    this.slam = Math.max(0, this.slam - dt * 2.5);
    const f = this.f, e = f * f, wob = this.slam * Math.sin(this.slam * 28) * 0.04;
    const eye = st.eye, G = this.groups;
    const vis = f < 0.999 && st.act !== 'bliss';
    G.back.visible = vis && eye.z > L.Z0 + 0.04; G.left.visible = vis && eye.x > L.X0 + 0.04; G.right.visible = vis && eye.x < L.X1 - 0.04; G.ceil.visible = vis && eye.y < this.FL + L.H - 0.03;
    G.back.rotation.x = -(e * 1.75 + wob); G.left.rotation.z = e * 1.75 + wob; G.right.rotation.z = -(e * 1.75 + wob);
    for (const k of ['back', 'left', 'right']) G[k].position.y = this.FL - e * 1.6;
    G.ceil.position.y = this.FL + L.H + e * 3.5; G.ceil.rotation.x = e * 0.4;
    G.free.visible = this.fFree < 0.999; G.free.position.y = this.fFree * this.fFree * 3; G.free.rotation.y = this.fFree * 1.2;
    const on = (1 - smooth(f)) * (home ? 1 : 0), A = 1 + 2.2 * (st.build || 0), alive = st.alive || 0;
    // the song wakes the room and puts it to sleep
    const sT = st.song;
    const wakeAt = (t0, len = 1.5) => (sT == null || !st.playing ? 1 : clamp01((sT - t0) / len));
    // the song's outro (the screens going dark one by one) turns the room's lights off one by one too; the stars stay
    const out = fx.song?.m?.outro, sl = st.act === 'off' ? 1 : out && sT != null && st.playing ? clamp01((sT - out[0]) / (out[1] - out[0])) : 0;
    this.sleep += (sl - this.sleep) * (1 - Math.exp(-dt * 8));
    const awake = (k) => clamp01((0.08 + 0.84 * k - this.sleep) / 0.06);              // k: 0 goes first .. 1 last
    const hat = fx.hat * alive, kick = fx.kick * alive, low = fx.low * alive, lvl = fx.level * alive;
    // ---- shared light uniforms
    RL.uRLtoRoom.value.copy(this.ctx.root.matrixWorld).invert().premultiply(new THREE.Matrix4().makeTranslation(0, -this.FL, 0));
    RL.uRLt.value = t; RL.uRLsway.value = (0.25 + 0.6 * low + 0.4 * lvl) * A * (red ? 0.6 : 1) * (1 + 0.6 * smooth(clamp01(Math.sin(this.mv.fan.osc) * 0.5 + 0.5)));
    this.flap = Math.max(0, (this.flap || 0) - dt * 4); RL.uRLflap.value = (0.004 + 0.02 * kick + 0.03 * this.flap) * A;
    // the street light, and a car going by now and then (its stripes cross the ceiling)
    const W = L.win; RL.uRLwin.value.set(W.x0, W.x1, W.y0, W.y1); RL.uRLwz.value = L.Z0 - 0.04; RL.uRLslat.value.set(this.blind.pitch, 0.42 + 0.1 * Math.sin(t * 0.2), this.blind.bottom);
    const cx = (W.x0 + W.x1) / 2, flick = st.build > 0.3 && !red ? (Math.sin(t * 61) > 0.85 ? 0.4 : 1) : 1;
    RL.uRLst.value.set(cx - 2.2, 5.8, L.Z0 - 3.6); RL.uRLsc.value.set(1.0, 0.5, 0.17).multiplyScalar(0.55 * on * flick);
    this.carT -= dt; if (this.carT < 0 && this.car < 0 && home) { this.car = 0; this.carT = 14 + R() * 18; }
    if (this.car >= 0) { this.car += dt / 3.2; if (this.car > 1) this.car = -1; }
    if (this.car >= 0) { const k = this.car; RL.uRLcp.value.set(cx + 5 - 10 * k, -1.2, L.Z0 - 4); RL.uRLcc.value.set(0.9, 0.95, 1).multiplyScalar(1.6 * Math.sin(Math.PI * k) * on); } else RL.uRLcc.value.set(0, 0, 0);
    // ---- fairy lights: a glow always, the jig chasing through them
    const F = this.fairy; F.pulse ||= new Float32Array(F.all.length);
    const decay = Math.exp(-dt * (red ? 3 : 9)), fon0 = on * wakeAt(2.8, 2);
    for (let i = 0; i < F.all.length; i++) {
      const b = F.all[i], d = b.d; F.pulse[i] *= decay;
      const tw = 0.5 + 0.5 * Math.sin(t * (1.3 + (i % 7) * 0.31) + i), wave = st.build > 0.05 ? Math.max(0, Math.sin((b.f * 6 - t * (1.5 + 5 * st.build)) * Math.PI)) ** 6 * st.build : 0;
      const sparkle = hat > 0.6 && ((i * 7 + Math.floor(t * 20)) % 23 === 0) ? 1 : 0;
      const fon = fon0 * awake(0.3 + 0.5 * b.f);                                       // the strings go out from one end
      d.k = fon * (1.6 + 0.6 * tw + (red ? 1.5 : 5) * F.pulse[i] + 1.4 * wave + (red ? 0 : 1.2 * sparkle) + 0.5 * lvl);
    }
    // ---- glows: lava lamp, plasma ball, hi-fi, clock
    const lav = this.mv.lava, lavOn = on * wakeAt(0.3, 6) * awake(0.85);
    lav.t += dt * (0.25 + 0.6 * low + 1.8 * (st.build || 0)); const lu = lav.m.material.uniforms; lu.uT.value = lav.t; lu.uOn.value = 0.25 + 0.75 * lavOn; lu.uKick.value = kick;
    lav.m.updateWorldMatrix(true, false); lu.uCam.value.copy(lav.m.worldToLocal(this.camPos.clone()));
    const pl = this.mv.plasma, pu = pl.m.material.uniforms, plOn = on * wakeAt(1.2, 0.6) * awake(0.4);
    pl.zap = Math.max(0, pl.zap - dt * 2); pu.uT.value = t * (1 + 1.5 * st.build); pu.uOn.value = plOn; pu.uZap.value = pl.zap; pu.uMid.value = fx.mid * alive;
    pl.m.updateWorldMatrix(true, false); pu.uCam.value.copy(pl.m.worldToLocal(V().copy(this.camPos)));
    pu.uAim.value.lerp(pl.m.worldToLocal(V().copy(this.camPos)).normalize(), 1 - Math.exp(-dt * 6));
    const gp = RL.uRLgp.value, gc = RL.uRLgc.value, wpos = (m, local) => this.ctx.root.worldToLocal(m.localToWorld(local.clone())).sub(V(0, this.FL, 0));
    gp[0].copy(wpos(lav.m, V(0, 0.25, 0))); gc[0].set(1, 0.28, 0.45).multiplyScalar(0.05 * lavOn * (1 + 0.5 * kick));
    gp[1].copy(wpos(pl.m, V())); gc[1].set(0.7, 0.3, 1).multiplyScalar(0.03 * plOn * (1 + 2 * pl.zap + fx.mid * alive));
    // ---- the hi-fi: cones pump, the meter dances
    const cn = this.mv.cones, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), hifiOn = on * wakeAt(0.2, 0.3) * awake(0.3);
    const push = (kick * 0.9 + low * 0.4) * (red ? 0.5 : 1) * hifiOn;
    cn.at.forEach((p, k) => { m4.compose(V(p.x, p.y, p.z + 0.004 * push), q.identity(), V(0.95, 0.95, 0.95 * (1 + 1.2 * push))); cn.m.setMatrixAt(k, m4); });
    cn.m.count = 2; cn.m.instanceMatrix.needsUpdate = true;
    this.mv.sub.m.scale.set(1, 1, 1 + 1.5 * push); this.mv.sub.m.position.copy(this.mv.sub.at).add(V(Math.sin(this.mv.sub.a), 0, Math.cos(this.mv.sub.a)).multiplyScalar(0.006 * push));
    const spec = fx.spec;
    for (const E of this.mv.eq) { const lo = Math.floor(Math.pow(E.bnd / 10, 1.6) * 90) + 2, v = spec ? (spec[lo] + spec[lo + 1]) / 2 : 0, lvlE = Math.pow(v || 0, 0.8) * 5.5 * alive; E.d.k = hifiOn * (E.r < lvlE ? 2.2 : 0.06); }
    gp[2].set((L.chest.x0 + L.chest.x1) / 2, L.chest.h + 0.2, L.Z0 + 0.5); gc[2].set(0.2, 0.9, 0.8).multiplyScalar(0.006 * hifiOn * (0.4 + lvl));
    // ---- the clock radio: 2:47 and counting with the song; the colon on the beat
    const ck = this.mv.clock, mins = 167 + Math.floor((sT || 0) / 60), beatPh = (st.beat || 0) % 1, colon = !st.playing || beatPh < 0.5;
    const txt = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`; if (ck.shown !== txt + colon) this.drawClock(txt, colon);
    ck.m.material.color.setScalar(2.2 * (0.15 + 0.85 * on));
    gp[3].copy(this.clockAt).add(V(0, 0.1, 0.12)); gc[3].set(1, 0.08, 0.04).multiplyScalar(0.004 * on);
    // ---- the lamp nods on the beat, harder on the big hits
    const lp = this.mv.lamp; this.nod = (this.nod || 0) * Math.exp(-dt * 6); this.nodV = ((this.nodV || 0) - this.nod * 120 * dt) * Math.exp(-dt * 7); this.nod += this.nodV * dt;
    lp.m.rotation.x = lp.base + this.nod * (red ? 0.4 : 1) + 0.02 * Math.sin(t * 0.7);
    const lampOn = on * wakeAt(8, 0.15) * awake(0.2);
    lp.dot.k = lampOn * 1.6; lp.m.updateWorldMatrix(true, false);
    { const bw = this.ctx.root.worldToLocal(lp.m.localToWorld(lp.bulb.clone())); this.lights.lamp.position.copy(bw); this.lights.lamp.intensity = 0.55 * lampOn; this.lights.lamp.visible = true;
      lp.dot.p.copy(bw).sub(V(0, this.FL, 0)); }
    // ---- the fan: blades with the bass, the head sweeping
    const fan = this.mv.fan, fanOn = on * wakeAt(4, 2) * awake(0.5);
    fan.spin += dt * fanOn * (3 + 26 * low + 20 * (st.build || 0)) * (red ? 0.6 : 1); fan.blades.rotation.z = fan.spin;
    fan.osc += dt * 0.35 * fanOn; fan.m.rotation.y = Math.sin(fan.osc) * 0.7;
    // ---- the webcam turns to the lens, a beat late
    const wc = this.mv.cam; wc.m.updateWorldMatrix(true, false);
    { const target = this.camPos.clone(), from = wc.m.getWorldPosition(V()), back = wc.m.quaternion.clone();
      wc.m.lookAt(target); const want = wc.m.quaternion.clone(); wc.m.quaternion.copy(back).slerp(want, 1 - Math.exp(-dt * (2 + 4 * st.build))); }
    wc.led.k = on * (0.6 + 1.8 * ((this.chopK || 0))); this.chopK = Math.max(0, (this.chopK || 0) - dt * 5);
    { const lw = this.ctx.root.worldToLocal(wc.m.localToWorld(V(0.02, 0.025, 0.02))); wc.led.p.copy(lw).sub(V(0, this.FL, 0)); }
    // ---- the router's LEDs flicker with the hats
    for (const r of this.mv.router) { if (R() < dt * (2 + 30 * hat)) r.on = R() < 0.6 ? 1 : 0; r.d.k = on * (r.d === this.mv.router[0].d ? 1.4 : (0.15 + 1.6 * r.on)); }
    // ---- the phone glows on her chops
    const ph = this.mv.phone; ph.k = Math.max(0, ph.k - dt * 4); ph.m.material.emissiveIntensity = (red ? 0.5 : 2.5) * ph.k * on;
    // ---- mirror ball: turns; its spots come on with the flash, and stay in the build
    const ball = this.mv.ball; ball.a += dt * (0.25 + 0.8 * st.build); ball.m.rotation.y = ball.a;
    RL.uRLball.value.copy(L.ball); RL.uRLbrot.value.setFromMatrix4(new THREE.Matrix4().makeRotationY(ball.a));
    RL.uRLbi.value = on * ((red ? 0.25 : 1.6) * (st.pop || 0) + 0.25 * (st.build || 0) + 0.04);
    ball.m.material.userData.u.uSparkle.value = 0.3 + 3 * (st.pop || 0) * (red ? 0.3 : 1);
    // ---- the CDs in the window turn and catch the flash
    { const C = this.mv.cds, h = G.back.userData.hinge; for (let k = 0; k < C.list.length; k++) { const c = C.list[k]; c.a += dt * (c.w + 0.6 * low * Math.sign(c.w || 1)); q.setFromEuler(new THREE.Euler(0, c.a, 0)); m4.compose(c.p, q, V(1, 1, 1)); C.m.setMatrixAt(k, m4); }
      C.m.instanceMatrix.needsUpdate = true; C.m.material.userData.u.uGlint.value = (red ? 0.3 : 1.5) * (st.pop || 0); }
    // ---- slats rattle on the kick
    this.rattle = Math.max((this.rattle || 0) * Math.exp(-dt * 10), kick > 0.8 ? kick * 0.5 * A : 0);
    if (this.rattle > 0.01 || this.rattleWas) this.updateSlats(this.rattle * (red ? 0.4 : 1), t); this.rattleWas = this.rattle > 0.01;
    // ---- bead curtain: each strand a pendulum, kicked
    const bd = this.mv.beads; this.beadKick = (this.beadKick || 0);
    for (const s of bd.strands) {
      s.vx += (-s.ax * 18 - s.vx * 2.2) * dt + this.beadKick * (0.6 + 0.8 * Math.sin(s.ph)) ; s.vz += (-s.az * 18 - s.vz * 2.2) * dt + this.beadKick * 0.3 * Math.cos(s.ph * 1.7);
      s.vx += (Math.sin(t * 0.9 + s.ph) * 0.15 * A + Math.sin(fan.osc) * 0.1) * dt; s.ax += s.vx * dt; s.az += s.vz * dt;
    }
    this.beadKick = 0;
    for (let s = 0; s < bd.ns; s++) { const S = bd.strands[s]; for (let k = 0; k < bd.nb; k++) { const d = (k + 0.5) / bd.nb * bd.len, w = Math.pow(d / bd.len, 0.8); m4.makeTranslation(this.beadsAt.x + Math.sin(S.ax * w) * d, this.beadsAt.top - 0.01 - d * Math.cos(S.ax * w * 0.7), S.z + Math.sin(S.az * w) * d * 0.5); bd.m.setMatrixAt(s * bd.nb + k, m4); } }
    bd.m.instanceMatrix.needsUpdate = true;
    // ---- the inflatable chair breathes
    const ch = this.mv.chair; ch.k = Math.max(0, ch.k - dt * 3); const sq = (low * 0.03 + ch.k * 0.06) * (red ? 0.5 : 1); ch.m.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    // ---- the real lights
    this.lights.lava.position.copy(lav.at).add(V(0, this.FL + 0.05, 0.12)); this.lights.lava.intensity = 0.5 * lavOn * (1 + 0.6 * kick);
    this.lights.street.intensity = 1.1 * on * flick;
    // ---- stars glow in the dark; brightest once the lights are off
    this.mats.stars.color.copy(lin(0xb8ffcf, 0.35 + 1.6 * this.sleep * on + 0.15 * Math.sin(t * 0.5)));
    // ---- write the dots, and the fairy lamps for the shader
    for (const [g, list] of Object.entries(this.dots)) {
      if (!list.mesh) continue; const c = new THREE.Color(), hh = G[g].userData.hinge;
      for (const d of list) { c.copy(d.col).multiplyScalar(d.k || 0); list.mesh.setColorAt(d.i, c); if (d.kind === 'bulb' || d === wc.led) { m4.compose(d.p.clone().sub(hh), q.identity(), V(d.r, d.r, d.r)); list.mesh.setMatrixAt(d.i, m4); } }
      list.mesh.instanceColor.needsUpdate = true; list.mesh.instanceMatrix.needsUpdate = true;
    }
    F.groups.forEach((gr, i) => { const c = V(); for (const d of gr.list) c.add(V(d.col.r, d.col.g, d.col.b).multiplyScalar(d.k)); RL.uRLfp.value[i].copy(gr.p); RL.uRLfc.value[i].copy(c.multiplyScalar(0.004 * on)); });
    // ---- loose things hop where the hits land
    this.hopStep(dt, home);
  }

  hopStep(dt, home) {
    const list = this.hops;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i], o = h.o; h.vy -= 9.8 * dt; h.y += h.vy * dt; h.rx *= Math.exp(-dt * 5); h.rz *= Math.exp(-dt * 5);
      if (h.y < 0) { h.y = 0; h.vy = h.vy < -0.25 ? -h.vy * 0.3 : 0; }
      h.ry += h.vr * dt; h.vr *= Math.exp(-dt * 3);
      const done = h.y === 0 && h.vy === 0 && Math.abs(h.rx) < 1e-3 && Math.abs(h.rz) < 1e-3 && Math.abs(h.vr) < 0.02;
      const base = o.userData.base;
      if (base) { o.position.copy(base.p); o.rotation.copy(base.r); }
      o.position.y += h.y; o.rotation.x += h.rx * Math.sin(this.t * 40); o.rotation.z += h.rz * Math.cos(this.t * 37); o.rotation.y += h.ry;
      if (base && done) { base.r.y += h.ry; }
      if (done) { if (!base && o.userData.ry !== undefined) o.userData.ry += h.ry; list.splice(i, 1); o.userData.hop = null; }
    }
  }
  // a hit near something loose: it hops, rattles, maybe spins
  kickProps(power, big) {
    const dress = this.ctx.dress, loose = [...(dress?.loose || []), ...(dress?.looseTo?.children || []), ...this.mounted];
    const src = [V(0.042, 0, 0), ...this.ctx.things.filter((o) => o.kind === 'speaker').map((o) => o.home.p), V(this.subAt.x, 0, this.subAt.z), V(this.hifiAt.cx, 0, this.L.Z0 + 0.3)];
    const seen = new Set();
    for (const o of loose) {
      if (seen.has(o) || !o.parent) continue; seen.add(o);
      const p = o.userData.base ? this.ctx.root.worldToLocal(o.getWorldPosition(V())) : o.position, x = p.x, z = p.z;
      let d = 9; for (const s of src) d = Math.min(d, Math.hypot(s.x - x, s.z - z));
      const k = power * clamp01(1 - d / 0.9) * (0.7 + 0.6 * Math.random()); if (k < 0.08) continue;
      let h = o.userData.hop; if (!h) { h = o.userData.hop = { o, y: 0, vy: 0, rx: 0, rz: 0, ry: 0, vr: 0 }; this.hops.push(h); }
      if (h.y < 0.01) h.vy = Math.max(h.vy, 1.1 * k); h.rx = Math.max(h.rx, 0.08 * k); h.rz = Math.max(h.rz, 0.08 * k); if (big) h.vr += (Math.random() - 0.5) * 6 * k;
    }
  }

  on(type, e, st) {
    if (!this.built) return;
    if (type === 'hit') this.flashed = true;
    const home = st.act === 'room';
    if (!home) return;
    const red = st.reduce;
    if (type === 'hit') {
      // the fairy lights chase the jig: on hit i of n, the i-th of n stretches of every string flashes
      const F = this.fairy;
      for (let k = 0; k < F.all.length; k++) { const b = F.all[k], seg = Math.floor(b.f * e.n); if (e.big || seg === e.i) F.pulse[k] = Math.max(F.pulse[k], e.big ? 1 : 0.8 * e.power + 0.3); }
      if (e.big) { this.nodV = (this.nodV || 0) - 6; this.flap = 1; this.mv.chair.k = 1; }
      this.beadKick += (e.big ? 3 : 1.2) * e.power * (red ? 0.5 : 1);
      this.kickProps(e.power * (e.big ? 1 : 0.6), e.big);
    } else if (type === 'beat') { this.nodV = (this.nodV || 0) + (e.b === 0 ? -2.5 : -1.2) * (red ? 0.5 : 1); }
    else if (type === 'word') { this.mv.plasma.zap = 1; }
    else if (type === 'chop') { this.mv.phone.k = 1; this.chopK = 1; this.mv.plasma.zap = Math.max(this.mv.plasma.zap, 0.6); }
    else if (type === 'drop') { this.beadKick += 5; this.flap = 1; }
  }
}

// ---------------- the duvet: on the bed, pulled half off its near side onto the floor ----------------
function duvetGeo(L) {
  const B = L.bed, NS = 44, NT = 30, top = 0.52, x1 = B.x1 - 0.04, bx = B.x0;
  // the path across the bed and down: a polyline (x, y) by arc length
  const pts = [[x1, top], [bx + 0.1, top + 0.02], [bx - 0.02, top - 0.04], [bx - 0.07, top - 0.22], [bx - 0.14, 0.05], [bx - Math.min(0.25, L.duvetRun * 0.6), 0.02], [bx - L.duvetRun, 0.025]];
  const seg = []; let tot = 0; for (let k = 0; k + 1 < pts.length; k++) { const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); seg.push(l); tot += l; }
  const at = (s) => { let d = s * tot; for (let k = 0; k < seg.length; k++) { if (d <= seg[k] || k === seg.length - 1) { const u = Math.min(1, d / seg[k]); return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u, k]; } d -= seg[k]; } };
  const noise = (a, b) => Math.sin(a * 7.1 + Math.sin(b * 3.3) * 2) * 0.5 + Math.sin(a * 13.7 - b * 5.1) * 0.25 + Math.sin(b * 9.3 + a * 2.1) * 0.25;
  const g = new THREE.PlaneGeometry(1, 1, NS, NT), p = g.attributes.position, uv = g.attributes.uv;
  const z0 = B.z0 + 0.42, z1 = B.z1 + 0.06;
  for (let k = 0; k < p.count; k++) {
    const s = uv.getX(k), tt = uv.getY(k), reach = 0.86 + 0.14 * tt;              // pulled further off at the foot
    const [x, y, sg] = at(s * reach);
    const z = z0 + (z1 - z0) * tt;
    const floorPart = sg >= 4 ? 1 : 0, side = sg === 3 || sg === 2 ? 1 : 0;
    const fold = noise(s * 2.2, tt * 2.6);
    let yy = y + (floorPart ? 0.055 * Math.max(0, fold + 0.4) + 0.02 * Math.sin(tt * 30 + s * 10) : side ? 0 : 0.03 * fold + 0.06 * Math.exp(-((s - 0.3) ** 2) / 0.02 - ((tt - 0.55) ** 2) / 0.05));
    let xx = x - (side ? 0.03 * fold : 0) + (floorPart ? 0.06 * Math.sin(tt * 9 + fold) : 0);
    const zz = z + (floorPart ? 0.08 * Math.sin(s * 14 + tt * 4) * s : 0);
    p.setXYZ(k, xx, yy, zz);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------- the lava lamp: wax that rises and falls, raymarched inside the glass ----------------
const lavaR = (t) => 0.034 + 0.03 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.62) * (1 - t * 0.25) - 0.014 * t * t;
function lavaMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uOn: { value: 1 }, uKick: { value: 0 }, uCam: { value: V(0, 0.3, 1) } },
    vertexShader: 'varying vec3 vO; void main() { vO = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `precision highp float; uniform float uT, uOn, uKick; uniform vec3 uCam; varying vec3 vO;
      float field(vec3 p) {
        float f = 0.0;
        for (int i = 0; i < 6; i++) {
          float fi = float(i), ph = uT * (0.18 + 0.05 * fi) + fi * 1.7;
          vec3 c = vec3(0.012 * sin(fi * 2.3 + uT * 0.3), 0.15 + 0.27 * (0.5 + 0.5 * sin(ph)), 0.012 * cos(fi * 1.9 + uT * 0.2));
          float r = 0.013 + 0.006 * sin(fi * 3.1) + 0.003 * uKick;
          f += r * r / max(1e-5, dot(p - c, p - c));
        }
        f += 0.0004 / max(1e-4, (p.y - 0.13) * (p.y - 0.13) + 0.0001);   // the pool of wax at the bottom
        return f;
      }
      void main() {
        vec3 rd = normalize(vO - uCam), p = vO; vec3 acc = vec3(0.0); float hit = 0.0;
        for (int i = 0; i < 26; i++) {
          p += rd * 0.0045;
          if (length(p.xz) > 0.07 || p.y < 0.13 || p.y > 0.42) break;
          float f = field(p);
          if (f > 1.0) { hit = 1.0; break; }
          acc += vec3(0.9, 0.08, 0.35) * 0.012;
        }
        float h = clamp((p.y - 0.13) / 0.29, 0.0, 1.0);
        vec3 liquid = mix(vec3(0.5, 0.02, 0.25), vec3(0.9, 0.12, 0.45), h) * 0.25 + acc;
        vec3 wax = mix(vec3(3.2, 1.1, 0.15), vec3(2.6, 0.5, 0.25), h);
        vec3 col = mix(liquid, wax, hit) * uOn;
        float rim = pow(1.0 - abs(dot(normalize(vec3(vO.x, 0.0, vO.z)), -rd)), 3.0);
        col += vec3(1.0, 0.8, 0.9) * rim * 0.25;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// ---------------- the plasma ball: tendrils from the core to the glass; on a sung word one reaches for the lens ----------------
function plasmaMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uOn: { value: 1 }, uZap: { value: 0 }, uMid: { value: 0 }, uCam: { value: V(0, 0, 1) }, uAim: { value: V(0, 0, 1) } },
    vertexShader: 'varying vec3 vO; void main() { vO = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `precision highp float; uniform float uT, uOn, uZap, uMid; uniform vec3 uCam, uAim; varying vec3 vO;
      float segD(vec3 ro, vec3 rd, vec3 a, vec3 b) {          // closest distance between the ray and a segment
        vec3 ba = b - a, oa = ro - a; float d = dot(rd, ba), e = dot(ba, ba), f = dot(rd, oa), g = dot(ba, oa);
        float den = e - d * d, t = clamp((g - d * f) / max(den, 1e-6), 0.0, 1.0), s = max(0.0, dot(rd, a + ba * t - ro));
        vec3 pr = ro + rd * s, ps = a + ba * t; return length(pr - ps);
      }
      vec3 dirK(float k) { float a = k * 2.399 + uT * (0.4 + 0.07 * k), b = sin(uT * 0.31 + k * 1.3) * 1.2; return normalize(vec3(cos(a) * cos(b), sin(b), sin(a) * cos(b))); }
      void main() {
        vec3 rd = normalize(vO - uCam), ro = vO; float R = 0.075; vec3 col = vec3(0.012, 0.006, 0.03);
        float glow = 0.0;
        for (int i = 0; i < 8; i++) {
          float k = float(i); vec3 d = dirK(k); if (i == 0) d = normalize(mix(d, uAim, clamp(uZap * 1.3, 0.0, 1.0)));
          vec3 mid = d * R * 0.5 + 0.012 * vec3(sin(uT * 7.0 + k), cos(uT * 6.0 + k * 2.0), sin(uT * 8.0 - k));
          float w = 0.0016 + 0.0015 * uMid + (i == 0 ? 0.002 * uZap : 0.0);
          float dd = min(segD(ro, rd, vec3(0.0), mid), segD(ro, rd, mid, d * R * 0.97));
          glow += exp(-dd * dd / (w * w)) * (0.6 + 0.4 * sin(uT * 23.0 + k * 5.0)) * (i == 0 ? 1.0 + 2.0 * uZap : 1.0);
          glow += exp(-pow(length(normalize(vO) - d) / 0.12, 2.0)) * 0.25;                       // where it touches the glass
        }
        float core = exp(-pow(segD(ro, rd, vec3(0.0), vec3(0.0, 0.0001, 0.0)) / 0.01, 2.0));
        col += (vec3(1.6, 0.5, 2.4) * glow + vec3(3.0, 1.6, 3.2) * core) * uOn;
        float rim = pow(1.0 - abs(dot(normalize(vO), -rd)), 2.5); col += vec3(0.3, 0.25, 0.45) * rim;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// the mirror ball's facets sparkle with the flash
function ballMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 1, roughness: 0.18, flatShading: true, envMapIntensity: 2.5 }), u = { uSparkle: { value: 0.3 } };
  m.userData.u = u;
  m.onBeforeCompile = (s) => { Object.assign(s.uniforms, u);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSparkle;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))); float h = fract(sin(dot(floor(fn * 9.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  totalEmissiveRadiance += vec3(1.0, 0.97, 0.92) * step(0.82, h) * uSparkle * (0.5 + 0.5 * pow(max(fn.z, 0.0), 6.0)); }`); };
  m.customProgramCacheKey = () => 'mirrorball';
  return m;
}
// the hanging CDs: silver with a rainbow that slides across as they turn
function cdMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.9, roughness: 0.18, envMapIntensity: 3, side: THREE.DoubleSide }), u = { uGlint: { value: 0.2 } };
  m.userData.u = u;
  m.onBeforeCompile = (s) => { Object.assign(s.uniforms, u);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlint;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float v = abs(dot(normalize(normal), normalize(vViewPosition))); vec2 q = vUv - 0.5; float r = length(q) * 2.0, a = atan(q.y, q.x);
  float band = smoothstep(0.32, 0.36, r) * smoothstep(1.0, 0.94, r);                       // the data side: a rainbow sweeping round as it turns
  vec3 rain = 0.5 + 0.5 * cos(6.28318 * (a * 0.32 + v * 1.7 + vec3(0.0, 0.33, 0.67)));
  totalEmissiveRadiance += rain * band * (0.03 + uGlint) * pow(1.0 - v, 0.7) + vec3(0.04) * band; }`); };
  m.customProgramCacheKey = () => 'cds'; m.defines = { USE_UV: '' };
  return m;
}
