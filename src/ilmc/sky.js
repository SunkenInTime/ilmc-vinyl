// Everything beyond the pile: what is overhead, and what is underfoot when it is not the bedroom floor.
// Four places, cut between by the song (index.js `acts`):
//   room   a dark room; nothing out there but a faint wash of the screens' colour
//   y2k    the stock-wallpaper worlds the drops fly through (painted on the dome: there is no ground, only speed)
//   bliss  the pile set down on the wallpaper hill: a real hill under a real sun that sets over the verse
//   void   the white of her last scene, where only the type and the machines are left
import * as THREE from 'three';
import { SKY_GLSL } from './screens.js';
import { hill, Land } from './hill.js';
export { hill };

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const DOME_FS = `precision highp float;
uniform float uTime, uScene, uFlash, uFlyD, uY2k, uBliss, uVoid, uDay, uBT; uniform vec3 uHue, uSun; uniform mat3 uTurn;
varying vec3 vD;
${SKY_GLSL}
vec3 spectrum(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
// the wallpaper sky: blue to the zenith, heaped cloud, a sun that goes down (uDay: 0 noon, 1 sunset, 1.6 night). Over the
// afternoon: a rainbow after the drop, a plane drawing its trail across; at sunset the high cloud catches fire; then a
// big moon comes up over the hills on the left and the first stars come out.
vec3 blissSky(vec3 d) {
  float el = d.y, set = smoothstep(0.35, 1.0, uDay), night = smoothstep(1.0, 1.6, uDay), dusk = smoothstep(0.7, 1.25, uDay);
  vec3 zen = mix(vec3(0.035, 0.19, 0.78), vec3(0.09, 0.09, 0.36), set), hor = mix(vec3(0.5, 0.74, 1.05), vec3(1.25, 0.5, 0.2), set);
  zen = mix(zen, vec3(0.004, 0.006, 0.022), night); hor = mix(hor, vec3(0.05, 0.035, 0.11), night);
  float toSun = max(0.0, dot(normalize(d), uSun));
  vec3 c = mix(hor, zen, pow(smoothstep(-0.02, 0.62, el), 0.55));
  c += mix(vec3(0.7, 0.3, 0.5), vec3(0.0), night) * set * pow(1.0 - toSun, 3.0) * smoothstep(0.25, 0.0, el) * 0.25;   // the pink band opposite the sun
  c += mix(vec3(1.0, 0.86, 0.6), vec3(1.4, 0.42, 0.12), set) * (pow(toSun, 9.0) * (0.28 + 0.9 * set) + pow(toSun, 90.0) * 0.9) * (1.0 - night);
  c += vec3(1.0, 0.93, 0.8) * smoothstep(0.99965, 0.99985, toSun) * 40.0 * (1.0 - night);            // the disc itself
  if (night > 0.01 || dusk > 0.01) {                                                             // stars come out
    vec3 q = d * 160.0, id = floor(q); float hh = sh(id.xy + id.z * 7.13);
    c += max(night, dusk * 0.35) * step(0.95, hh) * smoothstep(0.35, 0.0, length(fract(q) - 0.5)) * (0.6 + 0.4 * sin(uTime * 2.0 + hh * 40.0)) * 1.4 * smoothstep(0.05, 0.3, el);
  }
  // the moon, large and low, rising over the hills (left of the default frame's middle) as the sun goes down on the right
  { vec3 M = normalize(vec3(0.05, mix(0.0, 0.13, smoothstep(0.5, 1.35, uDay)) + 0.2 * smoothstep(1.3, 1.75, uDay), -1.0)); float R = 0.05, a = acos(clamp(dot(normalize(d), M), -1.0, 1.0));
    float moonK = smoothstep(0.45, 0.9, uDay);
    if (moonK > 0.0) {
      vec3 u = normalize(cross(M, vec3(0, 1, 0))), v = cross(u, M); vec2 mp = vec2(dot(d, u), dot(d, v)) / R;
      float disc = smoothstep(1.0, 0.97, length(mp)) * step(-0.005, el), mar = sfbm(mp * 2.2 + 4.0), cr = sn(mp * 9.0);
      vec3 mc = mix(vec3(1.05, 0.98, 0.86), vec3(0.62, 0.6, 0.58), smoothstep(0.45, 0.65, mar)) * (0.9 + 0.1 * cr);
      mc *= mix(vec3(1.25, 0.62, 0.32), vec3(1.0), smoothstep(0.0, 0.12, el));                     // orange near the hills
      c = mix(c, mc * mix(0.55, 2.4, dusk), disc * moonK);
      c += vec3(0.6, 0.62, 0.7) * exp(-a * 18.0) * 0.25 * moonK * dusk;
    } }
  // the rainbow: a low bow over the far hills, in from the start of the afternoon, gone as the light turns
  { float rk = smoothstep(0.5, 4.0, uBT) * (1.0 - smoothstep(0.12, 0.42, uDay));
    if (rk > 0.0) {
      vec3 C = normalize(vec3(0.08, -0.59, -0.8)); float th = acos(clamp(dot(normalize(d), C), -1.0, 1.0)) * 57.2958;
      float bow = smoothstep(40.2, 40.8, th) * smoothstep(42.6, 42.0, th), bow2 = smoothstep(50.0, 50.8, th) * smoothstep(53.5, 52.6, th);
      float g = smoothstep(-0.01, 0.05, el) * (0.55 + 0.45 * smoothstep(0.0, 0.2, el));
      c += spectrum(clamp((42.4 - th) / 2.4, 0.0, 1.0) * 0.78) * bow * 0.42 * rk * g;
      c += spectrum(clamp((th - 50.2) / 3.0, 0.0, 1.0) * 0.78) * bow2 * 0.12 * rk * g;
      c *= 1.0 + 0.07 * smoothstep(40.5, 39.0, th) * rk * g;                                   // brighter inside the bow
    } }
  if (el > 0.0) {                                                                                // cumulus on a plane, lit from the sun's side
    vec2 p = d.xz / max(el, 0.03) * 0.42 + vec2(uTime * 0.012, 0.0);
    float f = sfbm(p * 0.9), cl = smoothstep(0.5, 0.74, f) * smoothstep(0.0, 0.1, el) * (1.0 - 0.45 * smoothstep(0.5, 1.0, el));
    float thick = smoothstep(0.5, 0.95, f), lit = 0.55 + 0.45 * toSun, rim = smoothstep(0.62, 0.5, f) * pow(toSun, 4.0);
    vec3 white = mix(vec3(1.25, 1.24, 1.2), vec3(1.6, 0.7, 0.4), set) * lit, under = mix(vec3(0.6, 0.68, 0.86), mix(vec3(0.42, 0.2, 0.36), vec3(0.75, 0.25, 0.3), toSun), set);
    vec3 cc = mix(white, under, thick * 0.6) + rim * mix(vec3(1.5), vec3(2.4, 1.1, 0.4), set) * 0.8; cc = mix(cc, vec3(0.03, 0.03, 0.06), night);
    c = mix(c, cc, cl * 0.92);
    // high cloud: thin streaks, white at noon, burning orange and pink at sunset long after the low cloud has gone grey
    vec2 pc = d.xz / max(el, 0.04) * 0.16 + vec2(uTime * 0.006, 0.002 * uTime);
    float ci = smoothstep(0.52, 0.85, sfbm(vec2(pc.x * 1.0 + pc.y * 0.4, pc.y * 7.0 - pc.x * 1.6))) * smoothstep(0.02, 0.2, el) * (1.0 - cl);
    vec3 cic = mix(vec3(1.0, 1.0, 1.02), mix(vec3(2.2, 0.75, 0.42), vec3(1.6, 0.45, 0.7), smoothstep(0.2, 0.7, el + 0.3 * (1.0 - toSun))), set);
    c = mix(c, cic * (1.0 - 0.85 * night), ci * mix(0.35, 0.75, set));
  }
  // a plane, high up, drawing its trail across the afternoon; the trail spreads and catches the sunset
  { vec3 A = normalize(vec3(0.95, 0.16, -0.32)), B = normalize(vec3(-0.92, 0.2, -0.36)), n = normalize(cross(A, B));
    float tot = acos(dot(A, B)), head = tot * clamp((uBT - 1.5) / 24.0, 0.0, 1.0) * 1.3 - 0.15;
    vec3 dn = normalize(d); float dist = dot(dn, n); vec3 pr = normalize(dn - n * dist); float ang = atan(dot(pr, cross(n, A)), dot(pr, A));
    float age = head - ang;
    if (age > 0.0 && age < 0.9 && uBT > 1.5) {
      float w = 0.0012 + 0.006 * age, tr = smoothstep(w, 0.0, abs(dist - 0.002 * sin(ang * 30.0) * age)) * (1.0 - age / 0.9) * 0.75;
      c = mix(c, mix(vec3(1.3, 1.3, 1.32), vec3(1.9, 0.85, 0.55), set) * (1.0 - night), tr * smoothstep(0.0, 0.02, el));
    }
    c += vec3(2.5) * smoothstep(0.0025, 0.0, length(vec2(dist, (ang - head) * 0.6))) * step(0.0, el) * (1.0 - night) * step(1.5, uBT);
  }
  return c;
}
void main() {
  vec3 d = normalize(vD), dy = uTurn * vec3(d.x, d.z, -d.y);           // world z-up -> y-up, then turned (a ride banks and loops: turn())
  vec3 c = vec3(0.004, 0.0042, 0.005) + uHue * smoothstep(-0.2, 0.6, dy.y) * 0.5;
  if (uY2k > 0.001) {                                                 // the wallpapers, as saturated as a 2001 desktop
    vec3 k = y2k(dy, uTime, uScene, uFlyD); float l = dot(k, vec3(0.299, 0.587, 0.114));
    k = max(mix(vec3(l), k, 1.4), 0.0); vec3 kc = min(k, 1.0); k = mix(k, kc * kc * (3.0 - 2.0 * kc) + (k - kc), 0.45);   // the curve only below white: above it the sun stays a sun
    c = mix(c, k * 1.15, uY2k);
  }
  if (uBliss > 0.001) c = mix(c, blissSky(dy), uBliss);
  if (uVoid > 0.001) c = mix(c, vec3(5.0) * (0.92 + 0.08 * smoothstep(-0.4, 0.5, dy.y)), uVoid);
  gl_FragColor = vec4(mix(c, vec3(3.0), uFlash), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Drop 2's world: a city of windows at night, the flight rushing over and between its towers. One instanced box per
// tower; the towers ride toward the lens with the flight and wrap round to the far end in the vertex shader, so moving
// the whole city costs one number a frame. Its windows light up in rows on the beat.
const CITY_VS = `
uniform float uScroll, uSpan, uZ0; varying vec3 vP, vN, vS; varying float vSeed, vDist;
void main() {
  vec3 S = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vec4 w = instanceMatrix * vec4(position, 1.0);
  float z0 = instanceMatrix[3].z; w.z += mod(z0 + uScroll - uZ0, uSpan) + uZ0 - z0;
  vP = (position + 0.5) * S; vN = normal; vS = S; vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec4 mv = modelViewMatrix * w; vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const CITY_FS = `
uniform float uBeat, uKick, uA, uScene, uTime; varying vec3 vP, vN, vS; varying float vSeed, vDist;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 haze = uScene > 2.5 ? vec3(0.9, 0.42, 0.42) : vec3(0.015, 0.012, 0.05);
  vec3 c = vec3(0.012, 0.013, 0.02) + vec3(0.02, 0.025, 0.05) * smoothstep(0.0, 6.0, vP.y);       // dark glass, a little lighter up high
  if (abs(vN.y) < 0.5) {
    float u = abs(vN.x) > 0.5 ? vP.z : vP.x;                                                        // across the face, then up it
    vec2 cell = vec2(u / 0.16, vP.y / 0.21), id = floor(cell), f = fract(cell);
    float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.8);
    float r = h1(id + vSeed * 91.0), on = step(0.7, r) * step(0.3, h1(vec2(id.y, vSeed * 13.0)));
    float row = floor(uBeat * 4.0), chase = step(abs(mod(id.y - row * 2.0, 24.0)), 0.5) * step(0.75, vSeed) * step(0.5, r);  // rows light up the tower on the beat
    vec3 lamp = r > 0.9 ? vec3(0.4, 0.9, 1.6) : r > 0.8 ? vec3(1.6, 0.4, 1.2) : mix(vec3(1.7, 1.15, 0.6), vec3(1.2, 1.25, 1.4), h1(id + 3.0));
    c += win * lamp * (on * (0.55 + 0.45 * sin(uTime * 0.5 + r * 40.0)) + chase * 1.4 * (0.6 + 0.8 * uKick)) * 1.2;
  } else if (vN.y > 0.5) {                                                                           // roofs: a red light that blinks on the beat
    float d = length(vP.xz - vS.xz * 0.5);
    c += vec3(3.0, 0.15, 0.1) * smoothstep(0.08, 0.02, d) * step(0.5, fract(uBeat * 0.5 + vSeed));
  }
  c = mix(c, haze, smoothstep(16.0, 34.0, vDist) * 0.9);
  gl_FragColor = vec4(c, uA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
class City {
  constructor(root, FLOOR, CX) {
    const R = (() => { let s = 1999; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
    const pick = [], span = 46, z0 = -40;
    for (let x = -22; x <= 22; x += 2.2) for (let z = z0; z < z0 + span; z += 2.4) {
      const ax = Math.abs(x - CX), w = 1 + R() * 0.9, d = 1 + R() * 1.0;
      if (R() < 0.18) continue;                                        // streets and squares
      // a carpet of lights below the flight, deepest under its lane, with now and then a spire rising past the camera
      const top = ax < 3 ? FLOOR - 3.5 - R() * 2.5 : R() < 0.08 && ax > 4 ? FLOOR + R() * 3 : FLOOR - 2.2 - Math.pow(R(), 0.7) * 4.5;
      pick.push([x + (R() - 0.5) * 0.6, z + (R() - 0.5) * 0.6, w, d, top]);
    }
    const g = new THREE.BoxGeometry(1, 1, 1), bottom = FLOOR - 9;
    this.u = { uScroll: { value: 0 }, uSpan: { value: span }, uZ0: { value: z0 }, uBeat: { value: 0 }, uKick: { value: 0 }, uA: { value: 1 }, uScene: { value: 2 }, uTime: { value: 0 } };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: CITY_VS, fragmentShader: CITY_FS });
    const im = this.mesh = new THREE.InstancedMesh(g, m, pick.length), M = new THREE.Matrix4();
    pick.forEach(([x, z, w, d, top], i) => { const h = top - bottom; M.makeScale(w, h, d).setPosition(x, bottom + h / 2, z); im.setMatrixAt(i, M); });
    im.frustumCulled = false; im.visible = false; im.userData.keep = true; root.add(im);
  }
  // st: the stage; flyV: how fast the flight is going (fx.js, the same surge as the speed lines)
  live(dt, fx, st, flyV, scene) {
    const on = st.act === 'flight' && st.song != null && st.song > 126 && st.env.y2k > 0.5;
    this.mesh.visible = on; if (!on) return;
    const u = this.u; u.uScroll.value += flyV * dt * 0.8; u.uBeat.value = st.beat; u.uKick.value = fx.kick * st.alive; u.uScene.value = scene; u.uTime.value = st.t;
  }
}

export class Sky {
  constructor(scene, root, FLOOR) {
    this.u = { uTime: { value: 0 }, uScene: { value: 0 }, uFlash: { value: 0 }, uFlyD: { value: 0 }, uY2k: { value: 0 }, uBliss: { value: 0 }, uVoid: { value: 0 }, uDay: { value: 0 }, uBT: { value: 0 },
      uHue: { value: new THREE.Color(0, 0, 0) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uTurn: { value: new THREE.Matrix3() } };
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: this.u, fragmentShader: DOME_FS,
      vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }' });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 24), m); this.dome.frustumCulled = false; this.dome.renderOrder = -10; scene.add(this.dome);
    // the hill: a wide sheet, finer near the pile
    const N = 180, S = 260, g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {                                 // pull the grid in toward the middle, then lift it
      let x = p.getX(i), z = p.getZ(i); const k = Math.pow(Math.max(Math.abs(x), Math.abs(z)) / (S / 2), 1.6);
      x *= k; z *= k; p.setXYZ(i, x, hill(x, z), z);
    }
    g.computeVertexNormals();
    // what is on it: the ground's paint, the grass, flowers, the far things (hill.js)
    this.land = new Land(root, FLOOR, 0.042, this.u);
    this.city = new City(root, FLOOR, 0.042);
    const grass = this.land.groundMaterial();
    this.ground = new THREE.Mesh(g, grass); this.ground.position.y = FLOOR; this.ground.receiveShadow = true; this.ground.visible = false; this.ground.userData.keep = true;
    root.add(this.ground);
    this.fog = scene.fog = new THREE.Fog(0x9cc4f0, 1e5, 1e6);        // always there (so no shader is rebuilt at a cut), only near enough to see on the hill
    this.sunDir = new THREE.Vector3();
  }
  // the music, on the hill (fx.js calls this every frame): wind, the kick's ripples, the kite; and the lawn's map of the pile
  live(dt, fx, st, ex) { this.u.uBT.value = st.act === 'bliss' ? st.actT : 0; this.land.live(dt, fx, st, ex); this.city.live(dt, fx, st, ex.flyV || 0, this.u.uScene.value); }
  // where the sun stands at a time of day (room coordinates, toward the sun): high in front at noon, low behind the pile at sunset
  sunAt(day, out = this.sunDir) {
    // it goes round by the left and the back, sinking all the way, so the shadows swing across the grass and grow
    const t = ss(0.05, 1.0, day), az = (138 + 170.5 * t) * Math.PI / 180, el = (47 - 36 * Math.pow(t, 0.8) - 13 * ss(1.0, 1.6, day)) * Math.PI / 180;
    return out.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  }
  // toward the moon (the dome's shader draws it on the same path): it lights the hill once the sun is down
  moonAt(day, out = new THREE.Vector3()) { return out.set(0.05, 0.13 * ss(0.5, 1.35, day) + 0.2 * ss(1.3, 1.75, day), -1).normalize(); }
  // turn the whole sky (a quaternion in the room's coordinates, or null for level): what is overhead when the deck is upside down
  turn(q) { if (q) this.u.uTurn.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q.clone().invert())); else this.u.uTurn.value.identity(); }
  // w: { y2k, bliss, void } weights; day: time of day on the hill; root: the room's group (for the sun's direction in world space)
  update(t, w, o) {
    const u = this.u;
    u.uTime.value = t; u.uY2k.value = w.y2k; u.uBliss.value = w.bliss; u.uVoid.value = w.void; u.uDay.value = o.day; u.uScene.value = o.scene; u.uFlyD.value = o.flyD; u.uFlash.value = o.flash; u.uHue.value.copy(o.hue);
    const s = this.sunAt(o.day); u.uSun.value.set(s.x, s.y, s.z);    // the dome works y-up, like the room
    this.ground.visible = this.land.group.visible = w.bliss > 0.5;
    const set = ss(0.35, 1.0, o.day), night = ss(1.0, 1.6, o.day);
    this.fog.color.setRGB(0.5 + 0.75 * set, 0.74 - 0.24 * set, 1.05 - 0.85 * set).multiplyScalar(1 - 0.95 * night);
    this.fog.near = w.bliss > 0.5 ? 30 : 1e5; this.fog.far = w.bliss > 0.5 ? 210 : 1e6;
  }
}
