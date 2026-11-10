// The drop as a ride: a track through the wallpaper sky that the deck and its train of machines run along.
// A module of the room. The conductor (index.js) builds it once and then, every frame, tells it what is happening
// (`stage`) and, when something happens, what (`on`). See the "stage and bus" comment in index.js for both shapes.
//   ctx: { scene, root (the room's group: y up, metres, +z toward the opening camera, floor at y = FLOOR), renderer, CX, FLOOR,
//          things (the machines), kit (props.js), listener (live audio), screens, sky, post, psx(obj) (joins the PS1 wobble) }
//
// The deck is drawn by its own renderer at the room's origin and cannot move, so the ride is told the other way round:
// the whole ride (track, scenery) lives in one group, and every frame that group is put where the world is as seen from
// the front car. The deck is car 0, level, facing +z (its label first); the machines are the cars behind it (-z).
//
// The layout is the music. A ride is a list of elements, each a number of beats long (a lift, a fall, a loop, a hill...).
// Each element is a shape (how much it pitches, turns and rolls along its length) with a free size: the size is solved so
// that a train obeying gravity takes exactly the element's beats to run it. So every element starts and ends on its beat,
// the speed inside follows the height like a real coaster, and the place on the track is a function of the song's clock.
// The frame is carried along the track by integrating its turns (never rebuilt from a fixed up), so loops never flip.
// Banking is solved too: in a turn the track rolls until the riders feel no sideways push (a coordinated turn).
//
// What the conductor reads, every frame while `riding` (the ride is running; `on` is the bus, as for every module):
//   car(i, pos, quat)  where car i sits (room coordinates; returns how far it has boarded, 0..1); carOf(machine) -> i
//   sky                how the sky is turned relative to the deck (for Sky.turn)
//   shots              { onboard, chase, side, front, wide }: { eye, at, up (room coordinates), fov (degrees) }
// Which ride: drop 1 runs by default. An act in fmc.json can carry `ride`: "drop2" (on the flight act of drop 2; its climb
// starts in the act before, which the conductor sees as the next act's ride) or "none" (no ride: the tumbling flight).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { systemMessage } from './win98.js';
import { drawFace } from './label.js';

const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const BEAT = 0.44116;                  // seconds a beat (the map's 136 BPM grid); a bar is four
const G = 13;                          // gravity, a little strong: the elements come out big enough to read at the deck's size
const VLIFT = 3.6, VMIN = 2.4, MU = 0.01;    // chain speed (one tie a sixteenth), slowest crest, rolling friction
const HEART = 0.17;                    // the heartline (what rolls stay centred on) above the car floor
const CHASSIS = 0.075, GAUGE = 0.34, RAIL_R = 0.02, SPINE_Y = 0.2, SPINE_R = 0.05;   // car floor to rail top; the rails; the spine under them
const DS = 0.05, DEG = Math.PI / 180, TAIL = 34;            // integration step; straight track behind the station for the train's tail
const XA = new V3(1, 0, 0), YA = new V3(0, 1, 0), ZA = new V3(0, 0, 1);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);

// ---- the rides ----
// An element: b beats; len its rough length (m; the solver scales it); pitch/yaw/roll: [degrees, from u, to u] spread
// smoothly over that stretch of the element (u = 0..1 along it); yaw turns about the world's up, pitch and roll about the
// car's own axes; side: [metres, from, to] slides it sideways. chain: pulled at the chain's speed. free: no automatic banking (rolls). calm: what it becomes with
// flashing off (no inversions, half the speed). tag: what the scenery hangs on it.
const hop = (a, yaw = 0, tag = 'hop') => ({ b: 1, len: 7, pitch: [[-a, 0, 0.32], [2 * a, 0.22, 0.78], [-a, 0.68, 1]], yaw: yaw ? [[yaw, 0, 1]] : [], tag });
const LOOP_CALM = { pitch: [[34, 0, 0.3], [-68, 0.3, 0.72], [34, 0.72, 1]] };
const RIDES = {
  // drop 1, 0:42.1 to 1:06.8: fourteen bars, the breath in bar 8, the picture freezes at the top of the last loop
  drop1: { fall: 92, from: 80, end: 56, hold: 4, until: 156, def: true,
    els: [
      { b: 12, chain: true, pitch: [[45, 0.07, 0.17], [-45, 0.88, 1]], tag: 'lift' },            // 0:36.8 the click-click climb
      { b: 2, len: 10, pitch: [[-72, 0, 0.62]], yaw: [[28, 0.3, 1]], tag: 'fall' },              // over the top on the downbeat
      { b: 2, len: 14, pitch: [[72, 0.05, 1]], yaw: [[14, 0, 0.6]], tag: 'pull' },              // bottom on the bar's second big hit
      { b: 4, len: 30, pitch: [[360, 0, 1]], side: [[1.5, 0.1, 0.9]], tag: 'loop', calm: LOOP_CALM },   // bar 2: the loop, upside down on beat 3
      { b: 4, len: 30, pitch: [[30, 0, 0.4], [-30, 0.62, 1]], yaw: [[-24, 0, 1]], tag: 'hill' },        // up to a crest on bar 4's line
      hop(24, 18), hop(20, -22), hop(18, 22),                                                      // three bunny hops, crests on the beats
      { b: 1, len: 8, pitch: [[-18, 0, 0.5], [18, 0.5, 1]], tag: 'dip' },
      { b: 4, len: 30, roll: [[360, 0.08, 0.92]], yaw: [[80, 0, 1]], pitch: [[22, 0, 0.5], [-22, 0.5, 1]], free: true, tag: 'cork', calm: { roll: [] } },   // bar 5 (the big-hit bar): corkscrew, inverted on its second hit
      { b: 4, len: 30, yaw: [[-165, 0.04, 0.96]], pitch: [[-16, 0, 0.4], [16, 0.6, 1]], tag: 'turn' },  // a swooping overbank
      { b: 4, len: 30, pitch: [[26, 0, 0.36], [-26, 0.6, 1]], yaw: [[28, 0, 1]], tag: 'climb' },          // up to the high crest on bar 8's line
      { b: 4, len: 12, yaw: [[72, 0.1, 0.9]], pitch: [[-14, 0.84, 1]], tag: 'breath' },                   // bar 8, the breath: floating slow ("I wanna")
      { b: 2, len: 12, pitch: [[-44, 0, 0.4]], tag: 'fall' },                                            // bar 9: the second fall on its downbeat
      { b: 2, len: 14, pitch: [[58, 0.05, 1]], tag: 'pull' },
      { b: 8, len: 60, yaw: [[450, 0, 1, 'lin']], pitch: [[-4, 0, 0.12], [4, 0.88, 1]], tag: 'helix' },    // bars 10-11: the helix round a giant icon
      hop(18, -20), hop(16, 22), hop(16, -22), hop(14, 16),
      { b: 4, len: 30, roll: [[-360, 0.1, 0.9]], pitch: [[10, 0, 0.5], [-10, 0.5, 1]], free: true, tag: 'tunnel', calm: { roll: [] } },   // bar 13 (big hits): a roll in a tunnel of monitors
      { b: 2, len: 14, pitch: [[-24, 0, 0.5], [24, 0.5, 1]], tag: 'dip' },
      { b: 4, len: 30, pitch: [[360, 0, 1]], side: [[-1.5, 0.1, 0.9]], tag: 'loop', calm: LOOP_CALM },    // the end: the blue screen catches it at the top
      { b: 4, len: 30, tag: 'out' },
    ],
    scene: { tunnels: [[-10.6, -1.4, 'arch'], [48.4, 51.6, 'ring']], windows: [12, 28], rings: [9, 10, 11, 21, 22, 23, 45, 46, 47], puffs: [26, 33.2, 41.5],
      signs: [[-0.65, 'I WANNA F—', 0], [30.5, 'I WANNA', 1]], giant: 'helix', inLoop: 3 } },
  // drop 2, 2:06.8 to 2:31.5: a different ride on the same fourteen bars (off unless an act asks for it)
  drop2: { fall: 284, from: 276, end: 56, hold: 8, until: 348,
    els: [
      { b: 8, chain: true, pitch: [[45, 0.08, 0.2], [-45, 0.86, 1]], tag: 'lift' },
      { b: 2, len: 10, pitch: [[-88, 0, 0.7]], yaw: [[-40, 0.2, 1]], tag: 'fall' },
      { b: 2, len: 14, pitch: [[88, 0.05, 1]], tag: 'pull' },
      { b: 4, len: 30, roll: [[-360, 0.08, 0.92]], yaw: [[-90, 0, 1]], pitch: [[24, 0, 0.5], [-24, 0.5, 1]], free: true, tag: 'cork', calm: { roll: [] } },
      { b: 4, len: 30, yaw: [[180, 0.04, 0.96]], tag: 'turn' },
      hop(24, 20), hop(22, -20), hop(20, 20), hop(18, -20),
      { b: 4, len: 30, pitch: [[360, 0, 1]], side: [[-1.5, 0.1, 0.9]], tag: 'loop', calm: LOOP_CALM },
      { b: 4, len: 30, roll: [[360, 0.08, 0.92]], yaw: [[90, 0, 1]], pitch: [[20, 0, 0.5], [-20, 0.5, 1]], free: true, tag: 'cork', calm: { roll: [] } },
      { b: 4, len: 30, pitch: [[30, 0, 0.36], [-30, 0.6, 1]], tag: 'climb' },
      { b: 4, len: 12, yaw: [[-80, 0.1, 0.9]], pitch: [[-14, 0.84, 1]], tag: 'breath' },
      { b: 2, len: 12, pitch: [[-62, 0, 0.62]], tag: 'fall' },
      { b: 2, len: 14, pitch: [[76, 0.05, 1]], tag: 'pull' },
      { b: 4, len: 30, pitch: [[360, 0, 1]], side: [[1.5, 0.1, 0.9]], tag: 'loop', calm: LOOP_CALM },
      { b: 8, len: 50, yaw: [[-450, 0, 1, 'lin']], pitch: [[-6, 0, 0.12], [6, 0.88, 1]], tag: 'helix' },
      { b: 4, len: 30, roll: [[-360, 0.1, 0.9]], yaw: [[-70, 0, 1]], free: true, tag: 'tunnel', calm: { roll: [] } },
      { b: 2, len: 14, pitch: [[-20, 0, 0.5], [20, 0.5, 1]], yaw: [[-40, 0, 1]], tag: 'dip' },
      { b: 4, len: 30, pitch: [[36, 0, 0.3], [-72, 0.3, 0.7], [36, 0.7, 1]], tag: 'hill' },               // the picture tiles at the top of a last big hill
      { b: 4, len: 30, tag: 'out' },
    ],
    scene: { tunnels: [[-7, -2.4, 'arch'], [48.4, 51.6, 'ring']], windows: [44], rings: [5, 6, 7, 13, 14, 15, 29, 30, 31], puffs: [22, 36],
      signs: [[-3.73, 'WANT', 1], [-3.05, 'WANT', 0], [-2.39, 'WANT', 1], [-1.71, 'WANT', 0], [-1.03, 'WANNA', 1], [-0.38, 'F—', 0]], giant: 'helix', inLoop: 12 } },
};

// cumulative share of an op's angle at w (0..1 through its stretch): a smooth bell, or a trapezoid (steady turn, eased ends)
function cum(w, kind) {
  if (w <= 0) return 0; if (w >= 1) return 1;
  if (kind !== 'lin') return (1 - Math.cos(Math.PI * w)) / 2;
  const r = 0.14, a = 1 - r;
  return (w < r ? w * w / (2 * r) : w > 1 - r ? a - (1 - w) * (1 - w) / (2 * r) : r / 2 + (w - r)) / a;
}
const angle = (ops, u) => { let a = 0; if (ops) for (const [deg, u0, u1, k] of ops) a += deg * cum((u - u0) / (u1 - u0), k); return a * DEG; };

// ---- the track: a ride's elements integrated into samples every DS metres along the heartline ----
// Each sample: s (m), t (beats from the fall), P (heartline), Q (the banked car frame: x left, y up, z forward), v (m/s),
// fx, fy (what a rider feels, sideways and into the seat, m/s²), an (how hard the track is turning them, m/s²)
export function buildTrack(ride, calm = false) { const g = trackSteps(ride, calm); let r; while (!(r = g.next()).done); return r.value; }
// the same, an element at a time (the room builds a ride in slices between frames)
export function* trackSteps(ride, calm = false) {
  const g = calm ? G / 4 : G, vl = calm ? VLIFT / 2 : VLIFT, bankMax = (calm ? 32 : 82) * DEG;
  const S = { s: [], t: [], P: [], Q: [], v: [], fx: [], fy: [], an: [] }, els = [];
  let st = { P: new V3(), Q: new Q4(), E: 0, s: 0 };
  const tb = new V3(), ta = new V3(), x0 = new V3(), u0v = new V3(), f = new V3(), dT = new V3(), qa = new Q4(), qb = new Q4(), xb = new V3(), ub = new V3();
  // run an element of length L from state st; rec: write samples (and return them), else just the time it takes
  const run = (el, L, st0, rec, beat0, chain, step = DS) => {
    const s = { P: st0.P.clone(), Q: st0.Q.clone(), E: st0.E, s: st0.s }, n = Math.max(6, Math.ceil(L / step)), ds = L / n;
    const aside = new V3(1, 0, 0).applyQuaternion(st0.Q).setY(0).normalize();          // `side`: slid this way (a loop's way out passes beside its way in)
    let time = 0; const i0 = S.s.length;
    for (let j = 1; j <= n; j++) {
      const ua = (j - 1) / n, uz = j / n;
      tb.set(0, 0, 1).applyQuaternion(s.Q);
      s.Q.multiply(qa.setFromAxisAngle(XA, -(angle(el.pitch, uz) - angle(el.pitch, ua))));        // nose up = +pitch
      s.Q.premultiply(qa.setFromAxisAngle(YA, angle(el.yaw, uz) - angle(el.yaw, ua)));
      ta.set(0, 0, 1).applyQuaternion(s.Q);
      s.P.addScaledVector(dT.copy(tb).add(ta).normalize(), ds); s.s += ds;
      if (el.side) s.P.addScaledVector(aside, (angle(el.side, uz) - angle(el.side, ua)) / DEG);
      if (!chain) s.E -= 2 * MU * g * ds;
      const v = chain ? vl : Math.sqrt(Math.max(VMIN * VMIN, s.E - 2 * g * s.P.y));
      time += ds / v;
      if (!rec) continue;
      // what the rider feels in the unbanked frame, and the bank that cancels the sideways part
      dT.copy(ta).sub(tb).divideScalar(ds);
      f.copy(dT).multiplyScalar(v * v); const an = f.length(); f.y += g;
      x0.set(1, 0, 0).applyQuaternion(s.Q); u0v.set(0, 1, 0).applyQuaternion(s.Q);
      const fX = f.dot(x0), fU = f.dot(u0v);
      let bank = el.free ? 0 : Math.max(-bankMax, Math.min(bankMax, Math.atan(-fX / Math.max(fU, 0.4 * g))));
      bank += calm ? 0 : angle(el.roll, uz);
      const qB = s.Q.clone().multiply(qb.setFromAxisAngle(ZA, bank));
      xb.set(1, 0, 0).applyQuaternion(qB); ub.set(0, 1, 0).applyQuaternion(qB);
      S.s.push(s.s); S.t.push(time); S.P.push(s.P.x, s.P.y, s.P.z); S.Q.push(qB.x, qB.y, qB.z, qB.w); S.v.push(v); S.fx.push(f.dot(xb)); S.fy.push(f.dot(ub)); S.an.push(an);
    }
    if (rec) for (let i = i0; i < S.t.length; i++) S.t[i] = beat0 + S.t[i] / time * el.b;   // pinned: the element takes exactly its beats
    return { time, st: s };
  };
  let beat = -ride.els[0].b;
  // the station: level, the train standing on it
  S.s.push(0); S.t.push(beat - 1e-3); S.P.push(0, 0, 0); S.Q.push(0, 0, 0, 1); S.v.push(vl); S.fx.push(0); S.fy.push(g); S.an.push(0);
  for (const el0 of ride.els) {
    const el = calm && el0.calm ? { ...el0, ...el0.calm } : el0, want = el.b * BEAT * (calm && !el.chain ? 1 : 1);
    let L;
    if (el.chain) L = vl * want;
    else {                                                    // the size that takes exactly the beats (time only grows with size), on a coarse walk;
      let lo = 0.03, hi = 15;                                 // the samples are pinned to the beats afterwards anyway
      for (let j = 0; j < 26; j++) { const k = Math.sqrt(lo * hi); if (run(el, el.len * k, st, false, 0, false, Math.max(DS, el.len * k / 90)).time > want) hi = k; else lo = k; }
      L = el.len * Math.sqrt(lo * hi);
    }
    const i0 = S.s.length, r = run(el, L, st, true, beat, el.chain);
    st = r.st; if (el.chain) st.E = vl * vl + 2 * g * st.P.y;
    els.push({ tag: el.tag, b0: beat, b1: beat + el.b, i0, i1: S.s.length - 1, len: L, k: L / (el.len || L) });
    beat += el.b;
    yield;
  }
  const T = { calm, ride, els, n: S.s.length, g };
  for (const k in S) T[k] = Float32Array.from(S[k]);
  T.sEnd = T.s[T.n - 1];
  return T;
}

// where along the track the front car is at a beat (from the fall), and the pose at any place s (also off either end)
function idxT(T, t) {
  const a = T.t; if (t <= a[0]) return 0; if (t >= a[T.n - 1]) return T.n - 1;
  let lo = 0, hi = T.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= t) lo = m; else hi = m; }
  return lo + (t - a[lo]) / Math.max(1e-9, a[hi] - a[lo]);
}
const sAtT = (T, t) => { const f = idxT(T, t), i = Math.floor(f), k = f - i; return i + 1 < T.n ? T.s[i] + (T.s[i + 1] - T.s[i]) * k : T.s[i]; };
function idxS(T, s) {
  const a = T.s; if (s <= 0) return 0; if (s >= T.sEnd) return T.n - 1;
  let lo = 0, hi = T.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= s) lo = m; else hi = m; }
  return lo + (s - a[lo]) / Math.max(1e-9, a[hi] - a[lo]);
}
const _qa = new Q4(), _qb = new Q4(), _d = new V3();
// the heartline point P, the car frame Q and the car floor O (on the track's centre, CHASSIS above the rails)
function poseAt(T, s, P, Q, O) {
  const f = idxS(T, s), i = Math.min(T.n - 2, Math.floor(f)), k = f - i;
  _qa.fromArray(T.Q, i * 4); _qb.fromArray(T.Q, i * 4 + 4); Q.slerpQuaternions(_qa, _qb, Math.max(0, Math.min(1, k)));
  P.set(T.P[i * 3] + (T.P[i * 3 + 3] - T.P[i * 3]) * k, T.P[i * 3 + 1] + (T.P[i * 3 + 4] - T.P[i * 3 + 1]) * k, T.P[i * 3 + 2] + (T.P[i * 3 + 5] - T.P[i * 3 + 2]) * k);
  if (s < 0 || s > T.sEnd) P.addScaledVector(_d.set(0, 0, 1).applyQuaternion(Q), s < 0 ? s : s - T.sEnd);   // straight on, past either end
  if (O) O.copy(P).addScaledVector(_d.set(0, -HEART, 0).applyQuaternion(Q), 1);
  return f;
}
const at = (A, f, stride = 1) => { const i = Math.min(A.length / stride - 2, Math.floor(f)), k = f - i; return A[i] + (A[i + 1] - A[i]) * k; };

// ---- pictures: pixel-art desktop icons, the screens' face, signs ----
const ICONS = ['computer', 'folder', 'bin', 'cd', 'floppy', 'notepad', 'heart', 'network'];
function iconAtlas() {
  const c = document.createElement('canvas'); c.width = 32 * ICONS.length; c.height = 32; const x = c.getContext('2d');
  const R = (i, col, a, b, w, h) => { x.fillStyle = col; x.fillRect(i * 32 + a, b, w, h); };
  ICONS.forEach((k, i) => {
    if (k === 'computer') { R(i, '#d8d2bd', 5, 3, 22, 18); R(i, '#a8a08a', 5, 19, 22, 2); R(i, '#0b6e7a', 8, 6, 16, 11); R(i, '#36b2b8', 9, 7, 6, 3); R(i, '#c7c0a9', 11, 21, 10, 3); R(i, '#d8d2bd', 4, 24, 24, 5); R(i, '#a8a08a', 6, 26, 20, 1); R(i, '#3f9c35', 22, 18, 2, 1); }
    else if (k === 'folder') { R(i, '#e0a91c', 3, 6, 10, 4); R(i, '#e0a91c', 3, 9, 26, 18); R(i, '#ffd84a', 3, 12, 26, 15); R(i, '#fff1a0', 4, 13, 24, 2); }
    else if (k === 'bin') { R(i, '#9aa3a8', 6, 4, 20, 4); R(i, '#c9d1d4', 8, 8, 16, 21); for (let j = 0; j < 4; j++) R(i, '#7e888c', 10 + j * 4, 10, 1, 17); R(i, '#2c9e4b', 13, 14, 6, 6); R(i, '#c9d1d4', 15, 16, 2, 2); }
    else if (k === 'cd') { const cx = i * 32 + 16; for (let r = 13; r > 2; r--) { x.fillStyle = `hsl(${(r * 37) % 360},70%,${r === 13 ? 62 : 78}%)`; x.beginPath(); x.arc(cx, 16, r, 0, 7); x.fill(); } x.clearRect(cx - 2, 14, 4, 4); }
    else if (k === 'floppy') { R(i, '#22306e', 4, 4, 24, 24); R(i, '#b9bec6', 10, 4, 12, 9); R(i, '#22306e', 17, 5, 3, 7); R(i, '#f2f2ee', 8, 16, 16, 11); R(i, '#d43a3a', 8, 16, 16, 2); }
    else if (k === 'notepad') { R(i, '#fdfdf8', 7, 3, 18, 26); R(i, '#2c58c9', 7, 3, 18, 4); for (let j = 0; j < 7; j++) R(i, '#8a95b5', 9, 10 + j * 3, 14, 1); }
    else if (k === 'heart') { x.fillStyle = '#ff3d9a'; x.beginPath(); const cx = i * 32 + 16; x.moveTo(cx, 27); x.bezierCurveTo(cx - 16, 15, cx - 10, 2, cx, 10); x.bezierCurveTo(cx + 10, 2, cx + 16, 15, cx, 27); x.fill(); R(i, '#ffb3d6', 9, 9, 3, 3); }
    else if (k === 'network') { for (const [a, b] of [[2, 4], [15, 12]]) { R(i, '#d8d2bd', a, b, 15, 12); R(i, '#0b6e7a', a + 2, b + 2, 11, 7); R(i, '#c7c0a9', a + 5, b + 12, 5, 2); } R(i, '#333', 10, 22, 2, 6); R(i, '#333', 10, 27, 12, 1); }
  });
  // the black one-pixel outline every 98 icon has
  const d = x.getImageData(0, 0, c.width, 32), o = new Uint8ClampedArray(d.data), A = (u, v) => (u < 0 || v < 0 || u >= c.width || v >= 32 || ((u / 32) | 0) !== ((u0 / 32) | 0)) ? 0 : d.data[(v * c.width + u) * 4 + 3];
  let u0 = 0;
  for (let v = 0; v < 32; v++) for (let u = 0; u < c.width; u++) {
    u0 = u; if (A(u, v) > 128) continue;
    if (A(u - 1, v) > 128 || A(u + 1, v) > 128 || A(u, v - 1) > 128 || A(u, v + 1) > 128) { const p = (v * c.width + u) * 4; o[p] = 10; o[p + 1] = 10; o[p + 2] = 14; o[p + 3] = 255; }
  }
  d.data.set(o); x.putImageData(d, 0, 0);
  return c;
}
// what the tunnel monitors show: the face on a dark screen (tinted per monitor)
function faceScreen() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 48, 10, 64, 48, 80); g.addColorStop(0, '#3a4258'); g.addColorStop(1, '#0a0b12'); x.fillStyle = g; x.fillRect(0, 0, 128, 96);
  drawFace(x, 64, 46, 30);
  x.globalAlpha = 0.18; x.fillStyle = '#000'; for (let y = 0; y < 96; y += 3) x.fillRect(0, y, 128, 1);
  return c;
}
// two System message windows: one with its picture cut out (the track runs through it), one showing the hill
function windowAtlas() {
  const W = 360, pic = document.createElement('canvas'); pic.width = 200; pic.height = 120; const p = pic.getContext('2d');
  const sk = p.createLinearGradient(0, 0, 0, 80); sk.addColorStop(0, '#1d5fd6'); sk.addColorStop(1, '#9cc8ff'); p.fillStyle = sk; p.fillRect(0, 0, 200, 120);
  p.fillStyle = '#fff'; for (const [a, b, r] of [[40, 30, 14], [56, 26, 18], [74, 32, 12], [150, 20, 10], [164, 18, 13]]) { p.beginPath(); p.arc(a, b, r, 0, 7); p.fill(); }
  p.fillStyle = '#3c9a1e'; p.beginPath(); p.moveTo(0, 120); p.quadraticCurveTo(70, 50, 200, 82); p.lineTo(200, 120); p.fill();
  const a = systemMessage(null, W), b = systemMessage(pic, W), H = a.height;
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H; const x = c.getContext('2d'); x.drawImage(a, 0, 0); x.drawImage(b, W, 0);
  const cap = Math.round(W * 0.062), fx = Math.round(W * 0.085), fy = 4 + cap + Math.round(W * 0.035), fw = W - 2 * fx, fh = Math.round(H * 0.56);
  x.clearRect(fx, fy, fw, fh);
  return { c, hole: [(fx + fw / 2) / W - 0.5, 0.5 - (fy + fh / 2) / H, fw / W, fh / H], asp: H / W };
}
function signCanvas() { const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; return c; }
// a lyric on a board: 0 = stretched Times, black on white; 1 = Oswald in royal blue on white
function drawSign(c, row, text, style) {
  const x = c.getContext('2d'), h = 128, y = row * h;
  x.fillStyle = style ? '#f4f1e6' : '#fbfaf4'; x.fillRect(0, y, 1024, h);
  x.fillStyle = '#111'; x.fillRect(0, y, 1024, 6); x.fillRect(0, y + h - 6, 1024, 6);
  x.save(); x.translate(512, y + h * 0.53); x.textAlign = 'center'; x.textBaseline = 'middle';
  if (style) { x.fillStyle = '#1f3fd8'; x.font = '700 100px Oswald, "Arial Narrow", sans-serif'; x.scale(1.05, 1); }
  else { x.fillStyle = '#0a0a0a'; x.font = '400 92px "Times New Roman", Times, serif'; x.scale(1.5, 1); }
  const w = x.measureText(text).width, k = Math.min(1, 940 / (w * (style ? 1.05 : 1.5))); x.scale(k, 1);
  x.fillText(text, 0, 0); x.restore();
}

// ---- small geometry helpers ----
function tubeRing(pos, nor, col, O, X, U, dx, dy, r, n, c) {
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const nx = X.x * ca + U.x * sa, ny = X.y * ca + U.y * sa, nz = X.z * ca + U.z * sa;
    pos.push(O.x + X.x * dx + U.x * dy + nx * r, O.y + X.y * dx + U.y * dy + ny * r, O.z + X.z * dx + U.z * dy + nz * r); nor.push(nx, ny, nz); col.push(c[0], c[1], c[2]);
  }
}
function island(pos, col, cx, cy, cz, r, seed) {
  const R = (k) => { const v = Math.sin(seed * 91.7 + k * 12.989) * 43758.5453; return v - Math.floor(v); };
  const n = 22, rim = [], mid = [], low = [];
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2, rr = r * (0.82 + 0.3 * R(k));
    rim.push([cx + Math.cos(a) * rr, cy + (R(k + 50) - 0.5) * 0.25, cz + Math.sin(a) * rr]);
    mid.push([cx + Math.cos(a + 0.1) * rr * 0.78, cy - r * (0.28 + 0.12 * R(k + 9)), cz + Math.sin(a + 0.1) * rr * 0.78]);
    low.push([cx + Math.cos(a - 0.1) * rr * 0.42, cy - r * (0.62 + 0.2 * R(k + 19)), cz + Math.sin(a - 0.1) * rr * 0.42]);
  }
  const tip = [cx + (R(77) - 0.5) * r * 0.3, cy - r * 1.05, cz + (R(78) - 0.5) * r * 0.3], top = [cx, cy + 0.15, cz];
  const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let j = 0; j < 3; j++) col.push(...k); };
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, gr = 0.55 + 0.45 * R(k + 30);
    tri(top, rim[j], rim[k], [0.05 * gr, 0.2 * gr + 0.03, 0.012]);                                       // grass
    const e = 0.7 + 0.3 * R(k + 40), dirt = [0.16 * e, 0.075 * e, 0.03 * e], rock = [0.11 * e, 0.085 * e, 0.07 * e];
    tri(rim[k], rim[j], mid[j], [0.04, 0.12 * e, 0.01]); tri(rim[k], mid[j], mid[k], [0.04, 0.12 * e, 0.01]);   // a lip of turf
    tri(mid[k], mid[j], low[j], dirt); tri(mid[k], low[j], low[k], dirt); tri(low[k], low[j], tip, rock);
  }
}
function flat(pos, uv, O, X, Y, w, h, u0, v0, u1, v1, cx = 0, cy = 0) {   // a quad centred on O + X*cx + Y*cy, w x h, both faces
  const c = (a, b) => [O.x + X.x * (cx + a * w / 2) + Y.x * (cy + b * h / 2), O.y + X.y * (cx + a * w / 2) + Y.y * (cy + b * h / 2), O.z + X.z * (cx + a * w / 2) + Y.z * (cy + b * h / 2)];
  const p00 = c(-1, -1), p10 = c(1, -1), p11 = c(1, 1), p01 = c(-1, 1);
  pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01); uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
}
const geom = (pos, nor, col, uv) => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (!nor) g.computeVertexNormals(); g.computeBoundingSphere(); return g;
};
const lin = (hex) => new THREE.Color(hex);     // authored as sRGB, used as linear-light inputs (THREE converts)

const SHOTS = ['onboard', 'chase', 'side', 'front', 'wide'];
const PALETTE = [lin(0xff2f9a), lin(0x2f6bff), lin(0xffe10a), lin(0x3dff6a), lin(0xff7a1a), lin(0x29e0ff)];

export class Coaster {
  constructor(ctx) {
    this.ctx = ctx; this.riding = false;
    this.sky = new Q4(); this.shots = {};
    for (const k of SHOTS) this.shots[k] = { eye: new V3(), at: new V3(), up: new V3(0, 1, 0), fov: 50 };
    this.g = new THREE.Group(); this.g.matrixAutoUpdate = false; this.g.visible = false; ctx.root.add(this.g);
    this.M = new THREE.Matrix4(); this.Mi = new THREE.Matrix4(); this.Mq = new Q4();
    this.layouts = {}; this.cur = null; this.carS = []; this.cars = []; this.waves = [];
    // Materials and one stand-in of every kind of mesh are made now, so the room's shader warm-up builds their programs
    // with everything else; the ride itself is built when the song starts (build()).
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.icons = new THREE.CanvasTexture(iconAtlas()); this.icons.magFilter = THREE.NearestFilter; this.icons.minFilter = THREE.NearestFilter; this.icons.generateMipmaps = false; this.icons.colorSpace = THREE.SRGBColorSpace;
    const wa = this.winAtlas = windowAtlas(); this.wins = new THREE.CanvasTexture(wa.c); this.wins.colorSpace = THREE.SRGBColorSpace; this.wins.anisotropy = 4;
    this.face = new THREE.CanvasTexture(faceScreen()); this.face.colorSpace = THREE.SRGBColorSpace;
    this.signC = signCanvas(); this.signs = new THREE.CanvasTexture(this.signC); this.signs.colorSpace = THREE.SRGBColorSpace; this.signs.anisotropy = 4;
    this.mats = {
      rails: std({ vertexColors: true, metalness: 0.55, roughness: 0.32 }),
      steel: std({ color: 0xffffff, metalness: 0.35, roughness: 0.45 }),              // ties, supports, chassis (coloured per instance)
      island: std({ vertexColors: true, roughness: 1, flatShading: true }),
      cloud: std({ color: 0xffffff, roughness: 1, emissive: 0xc8d8ff, emissiveIntensity: 0.14, side: THREE.DoubleSide }),
      icon: std({ map: this.icons, emissiveMap: this.icons, emissive: 0xffffff, emissiveIntensity: 0.4, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
      win: std({ map: this.wins, emissiveMap: this.wins, emissive: 0xffffff, emissiveIntensity: 0.3, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
      glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),                          // lamps, rings, screens: their own light
      screen: new THREE.MeshBasicMaterial({ map: this.face }),
      sign: new THREE.MeshBasicMaterial({ map: this.signs, side: THREE.DoubleSide }),
      spark: new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
    this.geo = {
      tie: mergeGeometries([new THREE.BoxGeometry(GAUGE + 0.05, 0.026, 0.034).translate(0, -RAIL_R * 0.6, 0), new THREE.BoxGeometry(0.03, SPINE_Y - CHASSIS - 0.01, 0.026).translate(0, -(SPINE_Y - CHASSIS) / 2, 0)]),
      column: new THREE.CylinderGeometry(1, 1, 1, 8, 1).translate(0, -0.5, 0),     // hangs down from its top
      ring: new THREE.TorusGeometry(0.8, 0.055, 8, 40),
      puff: new THREE.IcosahedronGeometry(1, 2),
      lamp: new THREE.BoxGeometry(0.026, 0.026, 0.05),
      monitor: new THREE.BoxGeometry(0.5, 0.4, 0.42),
      glass: new THREE.PlaneGeometry(0.4, 0.3).translate(0, 0, 0.212),
      chassis: mergeGeometries([new THREE.BoxGeometry(0.42, 0.04, 1).translate(0, -0.02, 0), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.BoxGeometry(0.05, 0.05, 0.08).translate(sx * GAUGE / 2, -CHASSIS + 0.022, sz * 0.32)))]),
    };
    const inst = (g, m, n) => { const o = new THREE.InstancedMesh(g, m, n); o.setColorAt(0, new THREE.Color(1, 1, 1)); o.userData.ghost = true; return o; };
    // the train's chassis and its sparks are the ride's moving parts, shared by every layout
    this.chassis = inst(this.geo.chassis, this.mats.steel, 64); this.chassis.frustumCulled = false; this.chassis.count = 0; this.g.add(this.chassis);
    const NS = 700, sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3)); sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    this.sparks = new THREE.Points(sg, this.mats.spark); this.sparks.frustumCulled = false; this.sparks.userData.ghost = true; this.g.add(this.sparks);
    this.spark = { p: new Float32Array(NS * 3), v: new Float32Array(NS * 3), life: new Float32Array(NS), n: NS, next: 0 };
    // stand-ins for the warm-up (never drawn: the group is hidden until the ride starts)
    const warm = this.warm = new THREE.Group(); warm.visible = false;
    const tri = geom([0, 0, 0, 1, 0, 0, 0, 1, 0], null, [1, 1, 1], [0, 0, 1, 0, 0, 1]);
    for (const m of [this.mats.rails, this.mats.island, this.mats.icon, this.mats.win, this.mats.sign]) { const o = new THREE.Mesh(tri, m); o.userData.ghost = true; warm.add(o); }
    for (const [gk, m] of [['tie', 'steel'], ['puff', 'cloud'], ['ring', 'glow'], ['glass', 'screen'], ['lamp', 'glow'], ['monitor', 'steel']]) warm.add(inst(this.geo[gk], this.mats[m], 1));
    this.g.add(warm);
    ctx.psx?.(this.g);
  }

  // ---- the ride's clock: beats from the fall, frozen at the end (the blue screen) and drifting in the hung window ----
  clock(R, beat) { const r = beat - R.fall; return r <= R.end ? r : r <= R.end + R.hold ? R.end : R.end + 0.3 * (r - R.end - R.hold); }
  pick(st) {
    if (st.song == null || !st.playing) return null;
    const beat = st.beat;
    if (this.cur && beat >= this.cur.from && beat < this.cur.until) return this.cur;     // a ride that started runs to its end
    if (st.ride === 'none') return null;
    if (st.ride && RIDES[st.ride]) { const R = RIDES[st.ride]; return beat >= R.from && beat < R.until ? R : null; }
    for (const k in RIDES) { const R = RIDES[k]; if (R.def && beat >= R.from && beat < R.until) return R; }
    return null;
  }
  // a ride's layout, built in slices: `soon` asks for a few milliseconds of building now (ahead of time, between frames);
  // without it, whatever is left is finished at once (the ride is needed this frame)
  layout(R, calm, soon = false) {
    const key = Object.keys(RIDES).find((k) => RIDES[k] === R) + (calm ? ':calm' : ''), L = this.layouts[key];
    if (L?.done) return L;
    const job = (this.jobs ||= {})[key] ||= { gen: this.build(R, calm, key), ms: 0 };
    const t0 = performance.now();
    for (;;) { const r = job.gen.next(); if (r.done) { this.layouts[key] = r.value; r.value.done = true; r.value.stats.ms = +(job.ms + performance.now() - t0).toFixed(1); delete this.jobs[key]; return r.value; }
      if (soon && performance.now() - t0 > 4) { job.ms += performance.now() - t0; return null; } }
  }

  // the train: the lead (the beige one with the face) right behind the deck, then everything else
  train() {
    if (this.order) return this.order;
    const things = this.ctx.things, hero = things.find((o) => o.kind === 'franken') || things[0];
    const list = [hero, ...things.filter((o) => o !== hero)];
    this.order = new Map(); let off = 0.5;            // a gap behind the deck: the rider's eye (shots.onboard) sits in it
    this.carS = [0]; this.carFoot = [0.22];
    list.forEach((o, i) => {
      const bb = new THREE.Box3().setFromObject(o.g), sz = bb.getSize(new V3()), d = Math.max(0.12, Math.min(0.5, sz.z * 0.5 + 0.02));
      off += d + 0.08; this.carS.push(off); this.carFoot.push(d); off += d;
      this.order.set(o, i + 1);
    });
    this.nCars = list.length + 1;
    this.cars = Array.from({ length: this.nCars }, (_, i) => ({ y: 0, vy: 0, roll: 0, vr: 0, pitch: 0, vp: 0, yaw: (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.14 }));
    return this.order;
  }
  carOf(o) { return this.order?.get(o) || 0; }

  // ---- building a layout: the track and everything it runs through, in one group of a dozen meshes ----
  *build(R, calm, key) {
    const tg = trackSteps(R, calm); let tr; while (!(tr = tg.next()).done) yield;
    const T = tr.value, grp = new THREE.Group(), L = { R, T, grp, calm, key };
    grp.visible = false; this.g.add(grp);
    const P = new V3(), Q = new Q4(), O = new V3(), X = new V3(), U = new V3(), F = new V3(), m4 = new THREE.Matrix4(), one = new V3(1, 1, 1), col = new THREE.Color();
    const frame = (s) => { poseAt(T, s, P, Q, O); X.set(1, 0, 0).applyQuaternion(Q); U.set(0, 1, 0).applyQuaternion(Q); F.set(0, 0, 1).applyQuaternion(Q); };
    const sOfBeat = (b) => sAtT(T, b), el = (tag, k = 0) => T.els.filter((e) => e.tag === tag)[k];
    const rnd = (() => { let s = 1234 + (calm ? 7 : 0) + R.fall; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
    const add = (o) => { o.userData.ghost = true; grp.add(o); return o; };
    // where the track is, coarsely, so scenery and supports keep clear of it
    const near = new Map(), cell = (x, y, z) => `${Math.floor(x / 2)},${Math.floor(y / 2)},${Math.floor(z / 2)}`;
    for (let i = 0; i < T.n; i += 8) { const k = cell(T.P[i * 3], T.P[i * 3 + 1], T.P[i * 3 + 2]); (near.get(k) || near.set(k, []).get(k)).push(i); }
    const clear = (p, r) => {
      const n = Math.ceil(r / 2) + 1, cx = Math.floor(p.x / 2), cy = Math.floor(p.y / 2), cz = Math.floor(p.z / 2);
      for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (let c = -n; c <= n; c++) for (const i of near.get(`${cx + a},${cy + b},${cz + c}`) || [])
        if ((T.P[i * 3] - p.x) ** 2 + (T.P[i * 3 + 1] - p.y) ** 2 + (T.P[i * 3 + 2] - p.z) ** 2 < r * r) return false;
      return true;
    };
    // rails and spine: one swept mesh
    { const pos = [], nor = [], cl = [], idx = [], rails = [0.85, 0.86, 0.9], spine = calm ? [0.25, 0.4, 1] : [1, 0.03, 0.32];
      let rings = 0; const per = 5 + 5 + 7;
      for (let s = -TAIL; s <= T.sEnd + 6; s += 0.26) {
        frame(s);
        tubeRing(pos, nor, cl, O, X, U, GAUGE / 2, -CHASSIS - RAIL_R, RAIL_R, 5, rails);
        tubeRing(pos, nor, cl, O, X, U, -GAUGE / 2, -CHASSIS - RAIL_R, RAIL_R, 5, rails);
        tubeRing(pos, nor, cl, O, X, U, 0, -SPINE_Y, SPINE_R, 7, spine);
        if (rings) { const b = (rings - 1) * per, c = rings * per; let o = 0;
          for (const n of [5, 5, 7]) { for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; idx.push(b + o + k, b + o + k1, c + o + k, c + o + k, b + o + k1, c + o + k1); } o += n; } }
        rings++;
      }
      const g = geom(pos, nor, cl); g.setIndex(idx); add(new THREE.Mesh(g, this.mats.rails)); }
    yield;
    // cross ties, one a sixteenth on the lift
    { const step = (calm ? VLIFT / 2 : VLIFT) * BEAT / 4, n = Math.ceil((T.sEnd + 6 + TAIL) / step), m = add(new THREE.InstancedMesh(this.geo.tie, this.mats.steel, n));
      for (let i = 0; i < n; i++) { frame(-TAIL + i * step); m.setMatrixAt(i, m4.compose(P.copy(O).addScaledVector(U, -CHASSIS - RAIL_R), Q, one)); m.setColorAt(i, col.setRGB(0.8, 0.82, 0.86)); }
      m.computeBoundingSphere(); }
    // lamps along both rails (they chase up the lift and light up as the train passes)
    { const n = Math.ceil((T.sEnd + TAIL) / 0.9), m = L.lamps = add(new THREE.InstancedMesh(this.geo.lamp, this.mats.glow, n * 2)); L.lampS = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) for (const sd of [0, 1]) { const s = -TAIL + i * 0.9; frame(s); P.copy(O).addScaledVector(U, -CHASSIS - RAIL_R * 0.5).addScaledVector(X, (sd ? 1 : -1) * (GAUGE / 2 + 0.035)); m.setMatrixAt(i * 2 + sd, m4.compose(P, Q, one)); m.setColorAt(i * 2 + sd, col.setRGB(0, 0, 0)); L.lampS[i * 2 + sd] = s; }
      m.computeBoundingSphere(); }
    yield;
    // supports down to floating islands, wherever the track is the right way up and the column would miss the track below
    const feet = [], cols = [];
    for (let s = -TAIL + 2; s < T.sEnd; s += 3.2) {
      frame(s); if (U.y < 0.5) continue;
      const top = O.clone().addScaledVector(U, -SPINE_Y - SPINE_R * 0.6);
      let blocked = false; for (let i = 0; i < T.n; i += 6) { const dx = T.P[i * 3] - top.x, dz = T.P[i * 3 + 2] - top.z, dy = top.y - T.P[i * 3 + 1]; if (dx * dx + dz * dz < 0.8 && dy > 0.6) { blocked = true; break; } }
      if (!blocked) feet.push(top);
    }
    let minY = Infinity, maxY = -Infinity; for (let i = 0; i < T.n; i++) { minY = Math.min(minY, T.P[i * 3 + 1]); maxY = Math.max(maxY, T.P[i * 3 + 1]); }
    const lands = new Map();
    for (const f of feet) { const k = `${Math.floor(f.x / 11)},${Math.floor(f.z / 11)}`; (lands.get(k) || lands.set(k, []).get(k)).push(f); }
    const isl = [];
    for (const list of lands.values()) {
      const c = list.reduce((a, f) => a.add(f), new V3()).divideScalar(list.length);
      let r = 2.2; for (const f of list) r = Math.max(r, Math.hypot(f.x - c.x, f.z - c.z) + 1.4);
      const y = Math.min(...list.map((f) => f.y)) - 2.2 - rnd() * 2.5;
      isl.push({ x: c.x, y: Math.max(minY - 9, y), z: c.z, r });
      for (const f of list) cols.push([f, Math.max(minY - 9, y)]);
    }
    yield;
    // the giant icon the helix wraps round, standing on its own island; the folder inside the first loop
    const icons = [], helix = el(R.scene.giant);
    if (helix) { let c = new V3(); for (let i = helix.i0; i <= helix.i1; i++) c.x += T.P[i * 3], c.z += T.P[i * 3 + 2]; c.divideScalar(helix.i1 - helix.i0 + 1);
      let rad = 99, lo = Infinity, hi = -Infinity; for (let i = helix.i0; i <= helix.i1; i++) { rad = Math.min(rad, Math.hypot(T.P[i * 3] - c.x, T.P[i * 3 + 2] - c.z)); lo = Math.min(lo, T.P[i * 3 + 1]); hi = Math.max(hi, T.P[i * 3 + 1]); }
      const size = Math.min(rad * 1.5, (hi - lo) + 6); c.y = lo - 1.4;
      isl.push({ x: c.x, y: c.y, z: c.z, r: Math.min(rad * 0.75, size * 0.45) }); icons.push({ k: 0, p: c.clone().setY(c.y + size / 2 - 0.2), size, face: null, spin: 0.25 }); }
    { const lp = el('loop', calm ? 0 : 0); if (lp) { const mid = (lp.i0 + lp.i1) >> 1; let c = new V3(); for (let i = lp.i0; i <= lp.i1; i++) c.add(new V3(T.P[i * 3], T.P[i * 3 + 1], T.P[i * 3 + 2])); c.divideScalar(lp.i1 - lp.i0 + 1);
      frame(T.s[lp.i0]); const ax = X.clone(), h = Math.abs(T.P[mid * 3 + 1] - T.P[lp.i0 * 3 + 1]);
      icons.push({ k: 1, p: c.addScaledVector(ax, calm ? 3 : 2.6), size: Math.max(1.6, h * 0.42), face: ax.clone() }); } }
    // more icons and windows along the ride, off to the side of each element, facing the track
    const decor = (n, mk) => { for (let j = 0; j < n; j++) {
      const e = T.els[1 + Math.floor(rnd() * (T.els.length - 2))], i = e.i0 + Math.floor(rnd() * (e.i1 - e.i0)); frame(T.s[i]);
      const side = new V3(F.z, 0, -F.x).normalize().multiplyScalar(rnd() < 0.5 ? -1 : 1), d = 4.5 + rnd() * 7;
      const p = O.clone().addScaledVector(side, d).add(new V3(0, (rnd() - 0.4) * 5, 0)), size = 2.2 + rnd() * 3.2;
      if (!clear(p, size * 0.8)) continue; mk(p, size, O.clone());
    } };
    decor(calm ? 10 : 16, (p, size, to) => icons.push({ k: 1 + Math.floor(rnd() * (ICONS.length - 1)), p, size, face: to.sub(p).setY(0).normalize() }));
    { const pos = [], uv = [], up = new V3(0, 1, 0), right = new V3();
      for (const ic of icons) { const fw = ic.face || new V3(1, 0, 0.4).normalize(); right.crossVectors(up, fw).normalize(); flat(pos, uv, ic.p, right, up, ic.size, ic.size, ic.k / ICONS.length, 0, (ic.k + 1) / ICONS.length, 1); }
      add(new THREE.Mesh(geom(pos, null, null, uv), this.mats.icon)); }
    yield;
    // System message windows: the track runs through the picture of some, the rest hang about the sky
    { const pos = [], uv = [], wa = this.winAtlas, h = wa.hole, W = 2.5 / (h[3] * wa.asp), Hh = W * wa.asp;      // the picture 2.5 m tall: room for the train and the cameras riding with it
      for (const b of R.scene.windows) { frame(sOfBeat(b)); flat(pos, uv, P, X.clone().negate(), U, W, Hh, 0, 0, 0.5, 1, -h[0] * W, -h[1] * Hh); }
      decor(calm ? 6 : 10, (p, size, to) => { const fw = to.sub(p).normalize(), rt = new V3().crossVectors(new V3(0, 1, 0), fw).normalize(), up = new V3().crossVectors(fw, rt).applyAxisAngle(fw, (rnd() - 0.5) * 0.5);
        rt.crossVectors(up, fw).normalize(); flat(pos, uv, p, rt, up, size * 1.4, size * 1.4 * wa.asp, 0.5, 0, 1, 1); });
      add(new THREE.Mesh(geom(pos, null, null, uv), this.mats.win)); }
    // lyric signs on gantries over the track, where she sings them
    const posts = [];
    { const pos = [], uv = [], c = this.signC;
      R.scene.signs.forEach(([b, text, style], j) => {
        const row = (this.signRows = (this.signRows || 0) + 1) - 1; if (row >= 8) return;
        drawSign(c, row, text, style); this.signs.needsUpdate = true;
        frame(sOfBeat(b)); const w = 2.7, hh = w / 8 * 1.0;
        flat(pos, uv, O.clone().addScaledVector(U, 1.05), X.clone().negate(), U, w, hh * 1.25, 0, 1 - (row + 1) / 8, 1, 1 - row / 8);
        for (const sd of [-1, 1]) posts.push([O.clone().addScaledVector(X, sd * 1.38).addScaledVector(U, 1.38), U.clone(), 1.9, 0.04]);
        posts.push([O.clone().addScaledVector(U, 1.42).addScaledVector(X, 1.42), X.clone(), 2.84, 0.035]);
      });
      add(new THREE.Mesh(geom(pos, null, null, uv), this.mats.sign)); }
    // columns (supports and gantry posts), coloured the interface yellow
    { const n = cols.length + posts.length, m = add(new THREE.InstancedMesh(this.geo.column, this.mats.steel, Math.max(1, n))), yel = calm ? col.setRGB(0.9, 0.9, 0.92).clone() : lin(0xffe10a);
      const q = new Q4(); let k = 0;
      for (const [top, y] of cols) { m.setMatrixAt(k, m4.compose(top, q.identity(), P.set(0.075, top.y - y + 0.3, 0.075))); m.setColorAt(k++, yel); }
      for (const [top, dir, len, r] of posts) { m.setMatrixAt(k, m4.compose(top, q.setFromUnitVectors(YA, dir), P.set(r, len, r))); m.setColorAt(k++, col.setRGB(0.9, 0.9, 0.92)); }
      m.count = k; m.computeBoundingSphere(); }
    yield;
    // floating islands
    { const pos = [], cl = []; isl.forEach((f, i) => island(pos, cl, f.x, f.y, f.z, f.r, i + 1));
      // and the one the train sets out from (the station, under the lift)
      island(pos, cl, 0, -2.6, -6, 7, 99); island(pos, cl, 9, -7.5, 9, 4.5, 98);
      add(new THREE.Mesh(geom(pos, null, cl), this.mats.island)); }
    yield;
    // clouds: a sea of them far below, banks beside the track, and a few right on it that the train bursts through on the beat
    { const puffs = [], bx = new THREE.Box3(); for (let i = 0; i < T.n; i += 20) bx.expandByPoint(P.set(T.P[i * 3], T.P[i * 3 + 1], T.P[i * 3 + 2]));
      const c = bx.getCenter(new V3()), sz = bx.getSize(new V3()); L.box = bx; L.center = c; L.size = sz;
      for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (Math.max(sz.x, sz.z) * 0.5 + 30); puffs.push([c.x + Math.cos(a) * r, minY - 15 - rnd() * 8, c.z + Math.sin(a) * r, 3 + rnd() * 7, 0.6 + rnd() * 0.3]); }
      for (let j = 0; j < 26; j++) { const i = Math.floor(rnd() * T.n), side = new V3(rnd() - 0.5, 0, rnd() - 0.5).normalize(), d = 5 + rnd() * 10, p = new V3(T.P[i * 3], T.P[i * 3 + 1] + (rnd() - 0.6) * 4, T.P[i * 3 + 2]).addScaledVector(side, d);
        if (!clear(p, 3)) continue; for (let k = 0; k < 3 + rnd() * 4; k++) puffs.push([p.x + (rnd() - 0.5) * 3, p.y + (rnd() - 0.5) * 0.8, p.z + (rnd() - 0.5) * 3, 0.8 + rnd() * 1.4, 0.7]); }
      for (const b of R.scene.puffs) { frame(sOfBeat(b)); for (let k = 0; k < 4; k++) puffs.push([P.x + (rnd() - 0.5) * 1.2, P.y + (rnd() - 0.5) * 0.6, P.z + (rnd() - 0.5) * 1.2, 1.1 + rnd() * 0.7, 0.8]); }
      const m = add(new THREE.InstancedMesh(this.geo.puff, this.mats.cloud, puffs.length)), q = new Q4();
      puffs.forEach(([x, y, z, s, f], i) => { m.setMatrixAt(i, m4.compose(P.set(x, y, z), q.identity(), F.set(s, s * f, s))); m.setColorAt(i, col.setRGB(1, 1, 1)); });
      m.computeBoundingSphere(); }
    yield;
    // rings to fly through, one a beat in the stretches that have them
    { const m = L.rings = add(new THREE.InstancedMesh(this.geo.ring, this.mats.glow, R.scene.rings.length)); L.ringB = R.scene.rings;
      R.scene.rings.forEach((b, i) => { frame(sOfBeat(b)); m.setMatrixAt(i, m4.compose(P, Q, one)); m.setColorAt(i, PALETTE[i % PALETTE.length]); }); m.computeBoundingSphere(); }
    yield;
    // tunnels of monitors: an arch over the lift (the climb in the dark), a full ring round the roll
    { const mons = [];
      for (const [b0, b1, kind] of R.scene.tunnels) {
        const s0 = sOfBeat(b0), s1 = sOfBeat(b1), angs = kind === 'arch' ? [-120, -96, -72, -48, -24, 0, 24, 48, 72, 96, 120] : Array.from({ length: 15 }, (_, k) => k * 24);
        for (let s = s0, j = 0; s < s1; s += 1.05, j++) { frame(s); for (const a of angs) {
          const ca = Math.cos((a + (j % 2) * 12) * DEG), sa = Math.sin((a + (j % 2) * 15) * DEG), rad = new V3().addScaledVector(U, ca).addScaledVector(X, sa), p = P.clone().addScaledVector(rad, 1.6);
          const q = new Q4().setFromRotationMatrix(m4.makeBasis(new V3().crossVectors(rad.clone().negate(), F).negate().normalize(), F.clone(), rad.clone().negate()));
          mons.push({ p, q, s, a }); } }
      }
      const body = add(new THREE.InstancedMesh(this.geo.monitor, this.mats.steel, Math.max(1, mons.length))), glass = L.glass = add(new THREE.InstancedMesh(this.geo.glass, this.mats.screen, Math.max(1, mons.length)));
      const shells = [lin(0xd8d0b8), lin(0xc9c2aa), lin(0x2a2a2e), lin(0xe8e6df)];
      mons.forEach((o, i) => { m4.compose(o.p, o.q, one); body.setMatrixAt(i, m4); glass.setMatrixAt(i, m4); body.setColorAt(i, shells[i % 4]); glass.setColorAt(i, col.setRGB(0, 0, 0)); });
      body.count = glass.count = mons.length; body.computeBoundingSphere(); glass.computeBoundingSphere(); L.mons = mons; }
    yield;
    // trackside cameras: one beside each element, on the outside, a little ahead of its middle
    L.side = T.els.map((e) => {
      const i = Math.floor(e.i0 + (e.i1 - e.i0) * 0.6); frame(T.s[i]);
      const out = new V3(F.z, 0, -F.x); if (out.lengthSq() < 1e-4) out.set(1, 0, 0); out.normalize();
      let best = null; for (const sd of [1, -1]) for (const d of [3.2, 4.5, 6]) { const p = O.clone().addScaledVector(out, sd * d).add(new V3(0, 0.5 + d * 0.12, 0)); if (clear(p, 1.6) && !best) best = p; }
      return { b0: e.b0, b1: e.b1, p: best || O.clone().add(new V3(0, 4, 0)) };
    });
    // the wide: square on to the layout's long side, far enough back to take it all in, a little above its middle
    { const c = L.center; let xx = 0, xz = 0, zz = 0, n = 0;
      for (let i = 0; i < T.n; i += 20) { const dx = T.P[i * 3] - c.x, dz = T.P[i * 3 + 2] - c.z; xx += dx * dx; xz += dx * dz; zz += dz * dz; n++; }
      const ang = 0.5 * Math.atan2(2 * xz, xx - zz), along = new V3(Math.cos(ang), 0, Math.sin(ang)), across = new V3(-along.z, 0, along.x);
      let ext = 0; for (let i = 0; i < T.n; i += 20) ext = Math.max(ext, Math.abs((T.P[i * 3] - c.x) * along.x + (T.P[i * 3 + 2] - c.z) * along.z));
      L.wide = c.clone().addScaledVector(across, Math.min(70, ext * 0.95 + 8)).add(new V3(0, 7, 0)); }
    let tris = 0, draws = 0; grp.traverse((o) => { if (!o.isMesh) return; draws++; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); });
    L.stats = { draws: draws + 2, tris, ms: 0, length: +(T.sEnd + TAIL).toFixed(0), top: +maxY.toFixed(1), bottom: +minY.toFixed(1), vmax: +Math.max(...T.v).toFixed(1) };
    return L;
  }

  // A built ride is drawn once, small and out of sight, as soon as it is ready: the browser's first draw of new meshes
  // uploads them and (with ANGLE) finishes their shaders, which would otherwise stall the frame the ride starts on.
  warmDraw(L) {
    if (L.warm) return; L.warm = true;
    // into the room's own picture (same formats, so the same compiled pipeline), in one 8-pixel corner the deck paints over
    const r = this.ctx.renderer, rt = this.ctx.post.sceneRT, cam = new THREE.PerspectiveCamera(60, 1, 0.1, 10), was = [], vis = this.g.visible, lv = L.grp.visible;
    if (!rt) return;
    this.g.visible = true; L.grp.visible = true; this.g.traverse((o) => { if (o.isMesh || o.isPoints) { was.push([o, o.frustumCulled]); o.frustumCulled = false; } });
    const vp = rt.viewport.clone(), sc = rt.scissor.clone(), st = rt.scissorTest;
    try { r.resetState(); rt.viewport.set(0, 0, 8, 8); rt.scissor.set(0, 0, 8, 8); rt.scissorTest = true; r.setRenderTarget(rt); r.render(this.ctx.scene, cam); } catch (e) { console.warn('coaster warm', e); }
    rt.viewport.copy(vp); rt.scissor.copy(sc); rt.scissorTest = st; r.setRenderTarget(null); r.resetState();
    for (const [o, f] of was) o.frustumCulled = f;
    this.g.visible = vis; L.grp.visible = lv;
  }

  // ---- every frame ----
  update(dt, fx, st) {
    const R = this.pick(st);
    if (st.playing && st.song != null && !(R && this.riding)) for (const k in RIDES) {          // build the next ride ahead, a few ms a frame, once the song plays
      const N = RIDES[k]; if (!((N.def && st.ride !== 'none') || st.ride === k) || st.beat >= N.until || this.layouts[k + (st.reduce ? ':calm' : '')]?.done) continue;
      this.train(); const L = this.layout(N, !!st.reduce, true); if (L && !this.riding) this.warmDraw(L); break;
    }
    if (!R) { if (this.riding) { this.riding = false; this.g.visible = false; this.cur = null; } return; }
    this.train();
    const L = this.layout(R, !!st.reduce);
    if (this.L !== L) { if (this.L) this.L.grp.visible = false; L.grp.visible = true; this.L = L; }
    this.cur = R; this.riding = true; this.g.visible = true;
    const T = L.T, r = this.r = this.clock(R, st.beat), s0 = this.s0 = sAtT(T, r), fi = idxS(T, s0);
    this.speed = r > R.end ? 0 : at(T.v, fi); this.felt = [at(T.fx, fi), at(T.fy, fi), at(T.an, fi)];
    const P = new V3(), Q = new Q4(), O = new V3(), X = new V3(), U = new V3(), F = new V3(), m4 = new THREE.Matrix4();
    // the hits of the jig ripple down the train, front to back; airtime lifts the cars off their seats; turns rock them
    const now = st.t, cars = this.cars, n = this.nCars;
    this.waves = this.waves.filter((w) => now - w.t < 3);
    for (let i = 0; i < n; i++) {
      const c = cars[i], si = s0 - this.carS[i], f = idxS(T, si);
      for (const w of this.waves) { const at0 = w.t + i * 0.028; if (now >= at0 && now - dt < at0) { c.vy += w.p * (1.1 + 0.3 * Math.sin(i * 7.1)); c.vr += w.p * 3 * Math.sin(i * 3.7 + w.t); } }
      const air = Math.max(0, -at(T.fy, f) / T.g) * 0.045 * (si < 0 ? 0 : 1), side = (si < 0 ? 0 : at(T.fx, f) / T.g) * 0.18;
      c.vy += (-(c.y - air) * 170 - c.vy * 11) * dt; c.y += c.vy * dt; if (c.y < 0) { c.y = 0; c.vy = Math.abs(c.vy) * 0.25; }
      c.vr += (-(c.roll + side) * 90 - c.vr * 7) * dt; c.roll += c.vr * dt;
    }
    // the world, seen from the front car: the group is put where the track is relative to the deck
    poseAt(T, s0, P, Q, O);
    this.F0 = { P: P.clone(), Q: Q.clone(), O: O.clone() };
    m4.compose(O, Q, new V3(1, 1, 1)).invert();
    this.M.makeTranslation(this.ctx.CX, this.ctx.FLOOR - cars[0].y * 0.6, 0).multiply(m4);
    this.g.matrix.copy(this.M); this.g.matrixWorldNeedsUpdate = true;
    this.Mq.copy(Q).invert(); this.sky.copy(this.Mq);
    // chassis under every car (the deck's too), in the world
    { const ch = this.chassis, one = new V3(1, 1, 1), col = new THREE.Color();
      for (let i = 0; i < n; i++) { poseAt(T, s0 - this.carS[i], P, Q, O); ch.setMatrixAt(i, m4.compose(O, Q, one.set(1, 1, i ? this.carFoot[i] * 2.1 : 0.42))); ch.setColorAt(i, i ? PALETTE[i % 4] : col.setRGB(0.15, 0.15, 0.17)); }
      ch.count = n; ch.instanceMatrix.needsUpdate = true; ch.instanceColor.needsUpdate = true; }
    this.lights(L, r, st, fx);
    this.sparkle(L, dt, st);
    this.camera(L, r, st);
  }
  // where car i sits in the room (machines ride on their car's floor, a little late into every turn); returns how far it
  // has boarded (0 on the floor where it was, 1 in its seat)
  car(i, pos, quat) {
    const T = this.L?.T; if (!T || i <= 0 || i >= this.nCars) return 0;
    const P = _cP, Q = _cQ, O = _cO, c = this.cars[i], s = this.s0 - this.carS[i];
    poseAt(T, s - 0.22, P, _cQ2, null); poseAt(T, s, P, Q, O);
    Q.slerp(_cQ2, 0.55);                                              // late into the turn
    O.addScaledVector(_cU.set(0, 1, 0).applyQuaternion(Q), c.y);
    Q.multiply(_cR.setFromEuler(_cE.set(0, c.yaw, c.roll)));
    pos.copy(O).applyMatrix4(this.M); quat.copy(this.Mq).multiply(Q);
    const b0 = this.cur.els ? -this.cur.els[0].b : -12;               // boarding: in the first bar of the climb, front to back
    return smooth(clamp01((this.r - b0 - 0.3 - i / this.nCars * 2.2) / 1.4));
  }
  lights(L, r, st, fx) {
    const T = L.T, s0 = this.s0, col = new THREE.Color(), ph = r * 4, bar = Math.floor((r + 64) / 4), reduce = st.reduce;
    const beatK = Math.exp(-(((r % 1) + 1) % 1) * 5), lift = L.T.els[0];
    { const m = L.lamps, n = m.count;
      for (let i = 0; i < n; i++) {
        const s = L.lampS[i], d = s - s0, onLift = s > 0 && s < T.s[lift.i1];
        let k = 0.12 + 1.4 * Math.exp(-Math.abs(d) / 2.5) + (d > 0 ? 0.6 * Math.exp(-d / 12) : 0);
        if (onLift && r < 0) k += ((((Math.floor(s / 0.9) - Math.floor(ph)) % 4) + 4) % 4 === 0 ? 1.4 : 0.1) * (reduce ? 0.4 : 1);   // the chain's lights climb with the sixteenths
        else k += 0.5 * beatK * (reduce ? 0.3 : 1);
        const c = PALETTE[(i >> 1) % 3 + (bar % 2) * 3]; m.setColorAt(i, col.copy(c).multiplyScalar(k * 2));
      }
      m.instanceColor.needsUpdate = true; }
    { const m = L.rings; L.ringB.forEach((b, i) => { const p = r - b, k = p >= 0 ? Math.exp(-p * 3) : Math.exp(p * 1.2) * 0.5; m.setColorAt(i, col.copy(PALETTE[i % PALETTE.length]).multiplyScalar(0.7 + (reduce ? 1.2 : 5) * k)); }); m.instanceColor.needsUpdate = true; }
    { const m = L.glass, mons = L.mons, chop = this.chopK || 0;
      for (let i = 0; i < mons.length; i++) {
        const o = mons[i], d = Math.abs(o.s - s0), hue = PALETTE[(i + bar) % PALETTE.length], hit = ((i * 7 + (this.chopN || 0) * 3) % 5 === 0 ? chop : 0) * (reduce ? 0.3 : 1);
        col.setRGB(0.55, 0.6, 0.75).lerp(hue, 0.35).multiplyScalar(0.55 + 1.6 * Math.exp(-d / 3) + 2.5 * hit);
        m.setColorAt(i, col);
      }
      m.instanceColor.needsUpdate = true; }
    this.chopK = Math.max(0, (this.chopK || 0) - st.dt * 6);
  }
  // sparks off the wheels wherever the track throws the cars hard (tight turns, the bottoms of the falls)
  sparkle(L, dt, st) {
    const S = this.spark, T = L.T, P = new V3(), Q = new Q4(), O = new V3(), X = new V3(), U = new V3(), F = new V3(), g = this.sparks.geometry;
    if (this.r <= this.cur.end && dt > 0) for (let i = 0; i < this.nCars; i += 2) {
      const s = this.s0 - this.carS[i], f = idxS(T, s); if (s < 0) break;
      const an = at(T.an, f), v = at(T.v, f), k = (an - 1.6 * T.g) / T.g;
      if (k <= 0) continue;
      poseAt(T, s, P, Q, O); X.set(1, 0, 0).applyQuaternion(Q); U.set(0, 1, 0).applyQuaternion(Q); F.set(0, 0, 1).applyQuaternion(Q);
      let emit = k * dt * 140 * (st.reduce ? 0.3 : 1); while (emit > 0 && (emit >= 1 || Math.random() < emit)) { emit--;
        const j = S.next = (S.next + 1) % S.n, sd = Math.random() < 0.5 ? -1 : 1;
        P.copy(O).addScaledVector(U, -CHASSIS).addScaledVector(X, sd * GAUGE / 2).addScaledVector(F, (Math.random() - 0.5) * 0.3);
        S.p[j * 3] = P.x; S.p[j * 3 + 1] = P.y; S.p[j * 3 + 2] = P.z;
        const vx = -F.x * v * 0.35 + X.x * sd * 1.2 + (Math.random() - 0.5) * 2, vy = -F.y * v * 0.35 + X.y * sd * 1.2 + (Math.random() - 0.5) * 2, vz = -F.z * v * 0.35 + X.z * sd * 1.2 + (Math.random() - 0.5) * 2;
        S.v[j * 3] = vx; S.v[j * 3 + 1] = vy; S.v[j * 3 + 2] = vz; S.life[j] = 0.25 + Math.random() * 0.3;
      }
    }
    const pa = g.attributes.position.array, ca = g.attributes.color.array;
    for (let j = 0; j < S.n; j++) {
      if (S.life[j] <= 0) { ca[j * 3] = ca[j * 3 + 1] = ca[j * 3 + 2] = 0; continue; }
      S.life[j] -= dt; S.v[j * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) { S.p[j * 3 + a] += S.v[j * 3 + a] * dt; pa[j * 3 + a] = S.p[j * 3 + a]; }
      const k = Math.max(0, S.life[j]) * 6; ca[j * 3] = 3 * k; ca[j * 3 + 1] = 1.7 * k; ca[j * 3 + 2] = 0.5 * k;
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
  // ---- the named shots, in the room's coordinates ----
  camera(L, r, st) {
    const T = L.T, s0 = this.s0, M = this.M, Mq = this.Mq, sh = this.shots, P = new V3(), Q = new Q4(), O = new V3(), U = new V3(), F = new V3(), X = new V3();
    const { CX, FLOOR } = this.ctx, v = this.speed || 0, felt = this.felt || [0, 0, 0];
    const room = (out, w) => out.copy(w).applyMatrix4(M), roomDir = (out, w) => out.copy(w).applyQuaternion(Mq);
    const n = (k) => Math.sin(r * (13.1 + k * 3.7) + k) * Math.sin(r * (7.3 - k * 1.3) + k * 2), shake = (st.reduce ? 0.3 : 1) * (0.0015 * v + 0.004 * Math.abs(felt[0] / T.g) + 0.003 * Math.max(0, felt[1] / T.g - 1.5));
    // on board: the rider's eye just behind the deck, over the tonearm, looking down the track
    { const o = sh.onboard; o.eye.set(CX + n(1) * shake, FLOOR + 0.36 + n(2) * shake, -0.42); o.at.set(CX, FLOOR + 0.1, 3); o.up.set(n(3) * shake * 2, 1, 0).normalize(); o.fov = 64; }
    const heart = room(new V3(), this.F0.O.clone().addScaledVector(U.set(0, 1, 0).applyQuaternion(this.F0.Q), 0.12));
    // chase: riding the track behind the train, over its shoulder (inside the tunnels' and windows' clearance), looking past the cars at the deck
    { const o = sh.chase; poseAt(T, s0 - 3.0, P, Q, O); U.set(0, 1, 0).applyQuaternion(Q); X.set(1, 0, 0).applyQuaternion(Q); room(o.eye, O.addScaledVector(U, 1.22).addScaledVector(X, 0.55));
      roomDir(o.up, U); poseAt(T, s0 + 1.0, P, Q, O); room(o.at, O.addScaledVector(U.set(0, 1, 0).applyQuaternion(Q), 0.15)); o.fov = 52; }
    // front: on the track ahead, looking back at the deck and the faces of the train
    { const o = sh.front; poseAt(T, s0 + 2.1, P, Q, O); U.set(0, 1, 0).applyQuaternion(Q); X.set(1, 0, 0).applyQuaternion(Q); room(o.eye, O.addScaledVector(U, 0.38).addScaledVector(X, 0.12));
      roomDir(o.up, U); o.at.copy(heart); o.fov = 48; }
    // side: a camera by the track at each element; the train roars past it
    { const o = sh.side, c = L.side.find((e) => r >= e.b0 && r < e.b1) || L.side[L.side.length - 1]; room(o.eye, c.p); o.at.copy(heart); roomDir(o.up, YA); o.fov = 42; }
    // wide: the whole layout from far off, following the train
    { const o = sh.wide; room(o.eye, L.wide); o.at.copy(heart).lerp(room(new V3(), L.center), 0.45); roomDir(o.up, YA); o.fov = 46; }
  }

  on(type, e, stage) {
    if (!this.riding) return;
    if (type === 'hit') this.waves.push({ t: stage.t, p: (e.big ? 1.6 : 0.75) * (e.power || 0.6) * (stage.reduce ? 0.4 : 1) });
    else if (type === 'chop') { this.chopK = 1; this.chopN = (this.chopN || 0) + 1; }
    else if (type === 'beat' && e.b === 0) this.waves.push({ t: stage.t, p: 0.25 });
  }
}
const _cP = new V3(), _cQ = new Q4(), _cQ2 = new Q4(), _cO = new V3(), _cU = new V3(), _cR = new Q4(), _cE = new THREE.Euler();
export { RIDES };
