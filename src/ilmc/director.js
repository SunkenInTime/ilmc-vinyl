// The camera's director. The song is cut like a music video: every stretch of it has a shot (a close-up of the lead
// computer waking, a low dolly across the floor, the album cover's straight-down flash photograph, a spiral that tightens
// through the long build). Most cuts are a change of angle on the whole pile, on a bar line; on every beat the lens nods. Shots are written in the room's coordinates (y up, +z toward the opening camera) against bar numbers, and
// evaluated from the song clock, so seeking lands in the right shot. The viewer can take the camera at any time
// (main.js); "Reset view" gives it back.
import * as THREE from 'three';
import { stylusXY, ALPHA_REST } from '../geometry.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), DEG = Math.PI / 180;
const ease = (t) => t * t * (3 - 2 * t), clamp01 = (v) => Math.max(0, Math.min(1, v)), mix = (a, b, t) => a + (b - a) * t;
const n1 = (t, k) => Math.sin(t * (1.3 + k * 0.37) + k * 2.1) * 0.6 + Math.sin(t * (2.9 - k * 0.21) + k) * 0.4;      // slow wander, for a hand-held lens

// ---- shot kinds: (director, u in 0..1 through the shot, params) -> { eye, at, fov (degrees), roll } ----
const KIND = {
  // round a point: az 0 = from straight in front (+z), el up from the floor, d metres; d* values are the drift over the shot
  orb(D, u, p) {
    const k = p.lin ? u : p.pow ? Math.pow(u, p.pow) : ease(u), at = D.point(p.at || 'deck'), az = p.az + (p.daz || 0) * k, el = p.el + (p.del || 0) * k, d = p.d * (1 + (p.dd || 0) * k);
    return { eye: V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(at), at, fov: p.fov + (p.dfov || 0) * k, roll: (p.roll || 0) + (p.droll || 0) * k };
  },
  // On a machine: wide enough to see what it is and where it stands. The lens goes where the survey found a clear view of
  // its face (side and height are the survey's, nudged toward what the shot asked for); d is in units of the screen's size.
  // With nothing surveyed clear, it falls back to the master shot: the camera never looks at the back of a box.
  on(D, u, p) {
    const c = D.choose(p); if (!c) return KIND.orb(D, u, { ...MASTER, dd: -0.08, daz: 0.05 });
    const s = D.facing(c.o), k = ease(u), side = c.side + (p.dside || 0) * k * 0.5 * Math.sign(c.side || 1), d = (p.d || 3.6) * s.size * (1 + (p.dd || 0) * k);
    const n = s.n.clone().applyAxisAngle(V(0, 1, 0), side), at = s.p.clone().add(V(0, (p.lift || 0) * s.size, 0));
    const eye = at.clone().addScaledVector(n, d).add(V(0, c.h * d, 0)); if (eye.y < D.FLOOR + 0.035) eye.y = D.FLOOR + 0.035;
    return { eye, at, fov: (p.fov || 50) + (p.dfov || 0) * k, roll: (p.roll || 0) + (p.droll || 0) * k };
  },
  // one of the ride's own cameras (coaster.js: onboard, chase, side, front, wide); the master shot if the ride is not running
  ride(D, u, p) {
    const co = D.room.coaster, q = co?.riding && co.shots[p.name]; if (!q) return KIND.orb(D, u, { ...MASTER, el: 0.3, fov: 40 });
    return { eye: q.eye.clone(), at: q.at.clone(), fov: q.fov, roll: 0, up: q.up.clone() };
  },
};
const orb = (p) => ['orb', p], on = (name, p = {}) => ['on', { on: name, ...p }], ride = (name) => ['ride', { name }];

// ---- the cut: [bar, shot], [bar, { cycle: [shots], beats }] (the next angle every so many beats), [bar, { words: [shots] }] (a cut on each sung word), or [bar, null] (the room's own flying camera) ----
const MASTER = { az: -0.5, el: 0.86, d: 3.2, fov: 30 };
// Wide looks at the whole pile from different sides. Most of the cut is one of these: a change of angle, not a close-up of
// some screen. Close-ups are kept for what matters: the needle, the record, the lead's face.
const WIDE = {
  left: orb({ at: 'pile', az: -1.25, el: 0.3, d: 2.7, fov: 54, daz: 0.12 }),
  right: orb({ at: 'pile', az: 0.55, el: 0.34, d: 2.7, fov: 54, daz: -0.12 }),
  high: orb({ at: 'deck', az: 0.75, el: 0.72, d: 3.1, fov: 40, daz: -0.08 }),
  low: orb({ at: 'pile', az: -0.35, el: 0.13, d: 2.5, fov: 60, daz: 0.1 }),
  deck: orb({ at: 'deck', az: -0.15, el: 0.46, d: 1.5, fov: 50, daz: -0.14 }),
  over: orb({ at: 'deck', az: -0.5, el: 1.5, d: 3.3, fov: 36, droll: 0.12 }),
};
const EDL = [
  // waking: the needle finds the groove, the lead computer opens its eyes, the room comes on
  [-2, orb({ at: 'stylus', az: 2.2, el: 0.2, d: 0.2, fov: 26, daz: -0.25, dd: -0.2 })],
  [0, on('hero', { d: 5.7, side: -0.5, dside: 0.5, dd: -0.2, fov: 40 })],
  [2, orb({ at: 'pile', az: -1.5, daz: 0.75, el: 0.07, d: 2.3, fov: 52, lin: 1 })],
  [4, orb({ at: 'deck', az: -0.5, el: 1.5, d: 3.5, dd: -0.16, fov: 34, droll: 0.22 })],                      // the cover: straight down, flash on
  // flirting: the bass leaves for a bar, then the verse is cut on her edit
  [6, orb({ at: 'stylus', az: 0.7, el: 0.3, d: 0.24, fov: 24, daz: 0.35 })],
  [7, { cycle: [WIDE.left, on('hero', { d: 3.8, side: 0.35 }), WIDE.high, WIDE.deck], beats: 4 }],                      // a new angle on each bar line
  [11, orb({ ...MASTER, dd: -0.1, daz: 0.06 })],                                                              // "it says my name": every screen, at once
  [13, { cycle: [WIDE.right, WIDE.over], beats: 4 }],
  // wanting: one long push through the build, then her chops cut it to pieces
  [15, orb({ at: 'deck', az: -0.5, daz: 0.22, el: 0.84, del: -0.3, d: 3.2, dd: -0.34, fov: 30, lin: 1 })],
  [20, { cycle: [WIDE.low, on('hero', { d: 3.2, side: 0.15 })], beats: 4 }],
  [22, orb({ at: 'label', az: -0.5, daz: 0.5, el: 0.55, d: 1.7, dd: -0.8, fov: 40, dfov: -18, pow: 2.2 })],
  // euphoria: the flight, cut every two bars; the deck holds still and the world goes past
  [23, orb({ at: 'deck', az: -0.5, el: 0.2, d: 3.4, fov: 36, daz: 0.25, dd: -0.1 })],
  [25, orb({ at: 'deck', az: 0.15, el: 0.06, d: 1.5, fov: 58, daz: -0.3, roll: 0.12, droll: -0.24 })],      // low under the nose, wide
  [27, orb({ at: 'deck', az: -1.55, el: 0.16, d: 2.2, fov: 40, dd: 0.2 })],                                   // alongside
  [29, orb({ at: 'deck', az: 0, el: 1.35, d: 3.2, fov: 40, droll: 0.9, lin: 1 })],                             // from straight above, the ground rushing under it
  [30, orb({ at: 'deck', az: 1.9, el: 0.3, d: 3.0, fov: 46, daz: 0.5 })],
  [31, orb({ at: 'deck', az: 3.0, el: 0.14, d: 2.6, fov: 44, daz: 0.5 })],                                    // from ahead, looking back down the stream
  [33, orb({ at: 'deck', az: -0.8, el: 0.4, d: 4.6, fov: 26, dd: -0.35, pow: 0.5 })],
  [35, orb({ at: 'deck', az: 0.9, el: 0.08, d: 1.2, fov: 62, daz: -1.4, lin: 1 })],                            // a whip round the front
  [36.5, orb({ at: 'label', az: -0.5, el: 0.7, d: 1.2, dd: -0.5, fov: 34 })],
  [37, null],
  // afterglow: the hill, held all the way to the second drop. Few cuts, long looks, the sky in every one: noon, the golden
  // hour, the sun going down behind the pile, dusk, and night for the riser.
  [39, orb({ at: 'horizon', az: -0.4, el: 0.06, del: 0.04, d: 6.5, dd: -0.545, fov: 34, pow: 0.3 })],            // through the window and into the wallpaper
  [39.6, orb({ at: 'sunset', az: -0.4, daz: 0.55, el: 0.07, d: 3.1, fov: 46, lin: 1 })],                          // noon: a slow walk round the front
  [43, on('hero', { d: 3.2, side: 0.5, dside: -0.3, lift: 0.3, fov: 40 })],                                     // the lead, singing, sky behind it
  [45, orb({ at: 'sunset', az: 1.0, daz: -0.35, el: 0.1, del: 0.12, d: 3.5, fov: 46, lin: 1 })],                  // rising over the fields
  [47, orb({ at: 'sunset', az: -1.35, daz: 0.69, el: 0.05, d: 3.5, fov: 46, lin: 1 })],                          // the golden hour: round to face the sun
  [52, orb({ at: 'sunset', az: -0.66, el: 0.04, d: 3.5, dd: 0.2, fov: 44, lin: 1 })],                            // and hold: the sun low behind the pile
  // 1:37, the build to the second drop starts here, and the camera builds with it: a push that gathers speed, straight down
  // the sun's line, until the pile towers against the sunset; then cuts that come twice as fast each time; then the spiral
  [54, orb({ at: 'horizon', az: -0.66, daz: 0.12, el: 0.06, d: 4.6, dd: -0.7, fov: 42, dfov: 10, pow: 1.6 })],
  [59, orb({ at: 'horizon', az: -1.55, daz: 0.6, el: 0.09, d: 1.8, fov: 56, lin: 1 })],                          // dusk: a fast track along the left, close
  [60, orb({ at: 'horizon', az: 0.85, daz: -0.6, el: 0.09, d: 1.7, fov: 56, lin: 1 })],                          // and back along the right, the moon behind
  [61, { cycle: [on('hero', { d: 2.6, side: 0.3, lift: 0.3, fov: 46, roll: 0.07 }), orb({ at: 'horizon', az: -0.2, daz: 0.3, el: 0.05, d: 1.4, fov: 64, lin: 1 }),
      orb({ at: 'deck', az: 0.9, daz: -0.3, el: 0.3, d: 1.1, fov: 56, roll: -0.08, lin: 1 }), orb({ at: 'horizon', az: -1.0, daz: 0.3, el: 0.05, d: 1.3, fov: 64, lin: 1 })], beats: 2 }],
  [63, orb({ at: 'horizon', az: 0.24, daz: 8.86, el: 0.3, del: -0.2, d: 2.5, dd: -0.56, fov: 44, dfov: 14, pow: 2.1 })],      // night: the spiral, low enough to keep the stars and the moon in frame, tightening until the drop
  [69, orb({ ...MASTER, d: 2.7, dd: 0.1 })],
  [70, { words: [on('hero', { d: 2.6, h: 0.05, fov: 34 }), orb({ at: 'stylus', az: 0.9, el: 0.3, d: 0.2, fov: 24 }), on('hero', { d: 2.6, side: 0.2, fov: 34 }), orb({ at: 'label', az: -0.4, el: 0.9, d: 0.4, fov: 28 }), on('hero', { d: 2.6, side: -0.1, fov: 34 }), orb({ at: 'deck', az: -0.5, el: 0.5, d: 1.0, fov: 44 })] }],
  // ecstasy: the second flight, wider and wilder
  [71, orb({ at: 'deck', az: -0.5, el: 0.12, d: 4.2, fov: 44, dd: -0.3, pow: 0.4 })],
  [73, orb({ at: 'deck', az: 2.2, el: 0.5, d: 2.4, fov: 40, daz: -1.2, lin: 1 })],
  [75, orb({ at: 'deck', az: -1.2, el: 0.04, d: 1.3, fov: 64, daz: 0.5, roll: -0.2, droll: 0.4 })],
  [77, orb({ at: 'deck', az: 0.3, el: 1.4, d: 2.6, fov: 46, droll: -1.2, dd: 0.5, lin: 1 })],
  [78, orb({ at: 'deck', az: -2.4, el: 0.24, d: 2.6, fov: 50, daz: 0.6 })],
  [79, orb({ at: 'deck', az: 3.14, el: 0.3, d: 3.0, fov: 38, daz: 6.28, pow: 1.6 })],                          // once all the way round
  [81, orb({ at: 'deck', az: -0.5, el: 0.2, d: 1.1, fov: 60, dd: 2.4, pow: 0.5 })],                            // thrown back from it
  [83, orb({ at: 'deck', az: 0.8, el: 0.1, d: 2.0, fov: 50, daz: -1.6, roll: 0.25, droll: -0.5, lin: 1 })],
  [85, null],
  // declaration: square on to the wall of type, stepping in on the big hits
  [87, orb({ at: 'horizon', az: -0.5, el: 0.2, d: 3.4, fov: 30, daz: 0.1, dd: -0.06 })],
  [91, orb({ at: 'horizon', az: -0.2, el: 0.12, d: 3.0, fov: 34, daz: -0.2 })],
  [95, orb({ at: 'horizon', az: -0.75, el: 0.3, d: 3.6, fov: 28, daz: 0.2, dd: -0.1 })],
  [99, orb({ at: 'horizon', az: -0.5, el: 0.16, d: 3.2, fov: 32, dd: 0.25, pow: 0.6 })],
  // sleep
  [102, orb({ at: 'deck', az: -0.5, el: 0.86, del: 0.5, d: 3.2, dd: 0.12, fov: 30, lin: 1 })],
  [105, on('hero', { d: 3.5, side: 0.3, dside: -0.2, h: 0.15, dd: -0.3, fov: 30 })],
];

export class Director {
  // room: the conductor (things, hero, kb, root, song)
  constructor(room, CX, FLOOR) { this.room = room; this.CX = CX; this.FLOOR = FLOOR; this.hitN = 0; this.wordN = 0; this.hitT = 0; this.cue = null; this.cutN = 0; this.al = ALPHA_REST; this.picks = {}; this.views = new Map(); }
  hit() { this.hitN++; this.hitT = this.clock; }
  beat() { this.beatN = (this.beatN || 0) + 1; this.beatT = this.clock; }
  word() { this.wordN++; this.wordT = this.clock; }
  // named places
  point(p) {
    if (Array.isArray(p)) return V(...p);
    if (p === 'label') return V(0, 0, 0);
    if (p === 'stylus') { const [x, y] = stylusXY(this.al); return V(x, 0.002, -y); }
    if (p === 'pile') return V(this.CX, 0.22, -0.35);
    if (p === 'horizon') return V(this.CX, 0.42, 0);
    if (p === 'sunset') return V(this.CX, 0.85, 0);
    if (p === 'kb') { const o = this.room.kb; return o ? o.g.position.clone().add(V(0, 0.03, 0)) : V(this.CX, 0, 0.44); }
    return V(this.CX, 0, 0);
  }
  // Which machine a shot is of, and from where: chosen once per shot, from the survey. Of the machines of that kind (taken
  // in turn), the first whose screen is on and that has a surveyed clear view; of its views, the one nearest the side asked for.
  choose(p) {
    if (this.chosen && this.chosen.key === this.key && this.chosen.p === p) return this.chosen.pick;
    const R = this.room, name = p.on, want = p.side || 0;
    let list = name === 'hero' ? [R.hero] : R.things.filter((t) => (name === 'crt' ? t.kind === 'crt' && t.screens.length : name === 'tv' ? t.kind === 'tv' || t.kind === 'crt' : t.kind === name) && t !== R.hero);
    if (!list.length || ['laptop', 'tower', 'speaker', 'ps2', 'keyboard'].includes(name)) list = R.things.filter((t) => t.screens.length && t.kind !== 'laptop');
    const start = (this.picks[name] ?? 0) % list.length; let pick = null;
    const lit = (o) => !o.screens.length || o.screens[0].mode !== 0;
    for (const pool of [list, R.things.filter((t) => t.screens.length && t.kind !== 'laptop')]) {          // its own kind first, then any machine with a face
      for (let k = 0; k < pool.length && !pick; k++) {
        const o = pool[(start + k) % pool.length], views = this.views.get(o);
        if (!views || !views.length || !lit(o) || (o === this.lastSubject && name !== 'hero')) continue;      // not the same machine twice running, unless it is the lead that was asked for
        const v = views.reduce((a, b) => (Math.abs(b.side - want) - b.score * 0.3 < Math.abs(a.side - want) - a.score * 0.3 ? b : a));
        pick = { o, side: v.side, h: v.h };
      }
      if (pick) break;
    }
    if (pick) this.lastSubject = pick.o;
    this.chosen = { key: this.key, p, pick };
    return pick;
  }
  // ---- the survey: for every machine, the places a lens could stand and really see its face ----
  // Each machine and each thing on the floor is a box in its own frame; a view counts when rays from the lens to five
  // points of the face reach them without passing through anyone's box, the machine's own included (so never from
  // behind, never through the stack above). A few milliseconds, done while the pile is on the ground and again whenever
  // the floor's dressing changes. views: machine -> [{ side, h, score }], best first.
  boxOf(g) {
    g.updateMatrixWorld(true); const inv = g.matrixWorld.clone().invert(), box = new THREE.Box3(), m4 = new THREE.Matrix4();
    g.traverse((m) => {
      const mt = m.material; if (!m.isMesh || !m.geometry || m.userData.ghost || !mt || mt.transparent || mt.depthWrite === false || mt.blending !== THREE.NormalBlending) return;   // solid things only: not glows, light pools or painted shadows
      let bb; if (m.isInstancedMesh) { m.computeBoundingBox(); bb = m.boundingBox; } else { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); bb = m.geometry.boundingBox; }   // instanced parts are unit shapes scaled per copy
      if (bb && !bb.isEmpty()) box.union(bb.clone().applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld)));
    });
    return { g, box: box.expandByScalar(-0.012), inv };
  }
  survey() {
    const R = this.room, n = (R.dress?.put.length || 0) + R.things.length;
    if (this.svN !== n) { this.svN = n; this.svAt = this.clock + 1.2; }                              // something arrived: look again once it has settled
    if (this.svAt == null || this.clock < this.svAt || this.svDone === n) return;
    const boxes = R.things.map((o) => ({ ...this.boxOf(o.g), o })).filter((b) => !b.box.isEmpty());
    for (const g of [...(R.dress?.loose || []), ...(R.dress?.ground.children || [])]) { const b = this.boxOf(g); if (!b.box.isEmpty() && b.box.max.y - b.box.min.y > 0.05) boxes.push(b); }
    const ray = new THREE.Ray(), local = new THREE.Ray(), hit = V(), next = new Map(), toW = (v) => R.root.localToWorld(v.clone());
    // does the stretch from a to b (world) pass through a box before it gets within `slack` of b?
    const blocked = (a, b, bx, slack) => {
      const len = a.distanceTo(b); ray.origin.copy(a); ray.direction.copy(b).sub(a).divideScalar(len);
      local.copy(ray).applyMatrix4(bx.inv);
      if (!local.intersectBox(bx.box, hit)) return false;
      return hit.applyMatrix4(bx.g.matrixWorld).distanceTo(a) < len - slack;
    };
    for (const o of R.things) {
      const f = this.facing(o), found = [], own = boxes.find((b) => b.o === o);
      const right = V().crossVectors(V(0, 1, 0), f.n).normalize(), pts = [f.p, ...[[-1, 0], [1, 0], [0, 1], [0, -1]].map(([a, b]) => f.p.clone().addScaledVector(right, a * f.size * 0.3).add(V(0, b * f.size * 0.26, 0)))].map(toW);
      for (const side of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) for (const h of [0.1, 0.3]) {
        const d = 3 * f.size, eyeL = f.p.clone().addScaledVector(f.n.clone().applyAxisAngle(V(0, 1, 0), side), d).add(V(0, h * d, 0));
        if (eyeL.y < this.FLOOR + 0.04) continue;
        const eye = toW(eyeL); let seen = 0;
        for (const q of pts) if (!boxes.some((bx) => bx !== own && blocked(eye, q, bx, 0.015))) seen++;
        if (seen >= 4) found.push({ side, h, score: seen / 5 - Math.abs(side) * 0.1 });
      }
      found.sort((a, b) => b.score - a.score); next.set(o, found);
    }
    this.views = next; this.svDone = n; this.boxes = boxes;
  }
  // can a lens at eye see toward at? Not if it stands inside something, or something fills the first part of its view.
  sees(eyeL, atL) {
    if (!this.boxes) return true;
    const R = this.room, a = R.root.localToWorld(eyeL.clone()), b = R.root.localToWorld(atL.clone()), len = a.distanceTo(b), ray = new THREE.Ray(a, b.clone().sub(a).divideScalar(len || 1)), local = new THREE.Ray(), hit = V();
    for (const bx of this.boxes) {
      const pl = a.clone().applyMatrix4(bx.inv); if (bx.box.clone().expandByScalar(0.07).containsPoint(pl)) return false;
      local.copy(ray).applyMatrix4(bx.inv);
      if (local.intersectBox(bx.box, hit) && hit.applyMatrix4(bx.g.matrixWorld).distanceTo(a) < len * 0.6) return false;
    }
    return true;
  }
  // a shot round a point, as written or, if the pile is in its way, turned and lifted by the least that clears it (found once per shot)
  fixFor(shot) {
    if (shot[0] !== 'orb' || !this.boxes) return null;
    const p = shot[1], ok = (daz, del) => [0, 0.5, 1].every((u) => { const q = KIND.orb(this, u, { ...p, az: p.az + daz, el: Math.min(1.52, p.el + del) }); return q.eye.y > this.FLOOR + 0.03 && this.sees(q.eye, q.at); });
    for (const [daz, del] of [[0, 0], [0, 0.1], [0.25, 0.05], [-0.25, 0.05], [0, 0.22], [0.5, 0.12], [-0.5, 0.12], [0, 0.4], [0.8, 0.25], [-0.8, 0.25], [0, 0.6], [1.2, 0.4], [-1.2, 0.4], [0, 0.85]]) if (ok(daz, del)) return daz || del ? { daz, del } : null;
    return { daz: 0, del: 1.0 };
  }
  // where a machine's face is, which way it looks, how big it is
  facing(o) {
    const R = this.room;
    const sc = o.screens[0], p = V(), n = V(0, 0, 1);
    R.root.updateMatrixWorld();
    if (sc) { sc.mesh.getWorldPosition(p); R.root.worldToLocal(p); sc.mesh.getWorldDirection(n); n.set(n.x, n.z, -n.y); }
    else { p.copy(o.g.position).add(V(0, (o.height || 0.2) * 0.55, 0)); n.set(0, 0, 1).applyQuaternion(o.g.quaternion); }
    n.y = 0; if (n.lengthSq() < 1e-4) n.set(0, 0, 1); n.normalize();
    return { p, n, size: sc ? Math.max(0.12, Math.sqrt(sc.w * sc.h)) : Math.max(0.16, (o.height || 0.25) * 0.7) };
  }
  // at: the song position (audio.js Song.at) or null; returns { eye, at, up, fov (radians), focus, cut } in the room's coordinates, or null
  frame(dt, at, stage, al) {
    const m = this.room.song?.m; this.clock = stage.t; if (al != null) this.al = al;
    if (stage.lift < 0.02) this.survey();
    if (!at || !stage.playing || !m || !m.acts) { this.cue = null; return null; }
    const bar = (at.t - m.beat0) / (m.beatLen * 4);
    let i = -1; for (let k = 0; k < EDL.length; k++) if (bar >= EDL[k][0]) i = k;
    const F = this.force; if (F) i = F.i;                             // a rig looking at one shot of the cut
    if (i < 0 || !EDL[i][1]) { this.cue = null; return null; }
    const [b0, spec] = EDL[i], b1 = EDL[i + 1] ? EDL[i + 1][0] : b0 + 4;
    let shot = spec, u = clamp01((bar - b0) / (b1 - b0)), key = i * 1000;
    if (spec.cycle) {                                                 // a new angle every so many beats, in turn; a slow drift inside each
      const per = spec.beats || 4, since = (bar - b0) * 4, n = F ? F.n : Math.floor(since / per);
      shot = spec.cycle[n % spec.cycle.length]; u = clamp01((since - n * per) / per); key += n + 1;
    } else if (spec.words) {                                          // a cut on every sung word
      const n = F ? F.n : this.wordN, since = stage.t - (this.wordT || 0);
      shot = spec.words[n % spec.words.length]; u = clamp01(since / 1.2); key += n + 1;
    }
    if (F && F.u != null) u = F.u;
    if (key !== this.key) {                                           // a new shot: a new machine of each kind, and no smear across the cut
      this.key = key; this.cutN++;
      for (const k of ['crt', 'tv', 'tower', 'franken', 'speaker', 'laptop', 'imac', 'lcd']) this.picks[k] = ((this.picks[k] ?? 0) + (key % 7) + 1) | 0;
      this.fix = stage.lift < 0.05 ? this.fixFor(shot) : null;
    }
    const fx_ = this.fix, s = KIND[shot[0]](this, u, fx_ ? { ...shot[1], az: shot[1].az + fx_.daz, el: Math.min(1.52, shot[1].el + fx_.del) } : shot[1]);
    // the lens never sits inside a heap of bedding or a machine: it rides over whatever it finds itself in
    for (const q of this.room.dress?.put || []) if (q.h > 0.05 && Math.hypot(q.x - s.eye.x, q.z - s.eye.z) < q.r * 0.85) s.eye.y = Math.max(s.eye.y, this.FLOOR + q.h + 0.06);
    { // and nothing small sits right in front of it filling the frame: it lifts until its first stretch of view is clear
      const seg = s.at.clone().sub(s.eye), len = seg.length(); seg.divideScalar(len || 1);
      for (const q of this.room.dress?.put || []) {
        if (q.h < 0.06 || q.kind === 'rug') continue;
        const c = V(q.x, this.FLOOR + q.h * 0.5, q.z), t = c.clone().sub(s.eye).dot(seg); if (t < 0 || t > len * 0.55) continue;
        const r = Math.max(q.r, q.h * 0.5) + 0.05 + t * 0.12, gap = c.distanceTo(s.eye.clone().addScaledVector(seg, t));
        if (gap < r) s.eye.y += (r - gap) * 1.6;
      }
    }
    for (const o of this.room.things) if (o !== this.chosen?.pick?.o && Math.hypot(o.g.position.x - s.eye.x, o.g.position.z - s.eye.z) < (o.foot || 0.15) * 0.9 && s.eye.y < o.g.position.y + (o.height || 0.2)) s.eye.y = o.g.position.y + (o.height || 0.2) + 0.08;
    // the head-nod: on every beat the lens drives in and dips, hard, and is back before the next one (harder on the bar line, hardest in a drop)
    { const ph = at.beat - Math.floor(at.beat), down = at.beatInBar < 1 ? 1.35 : 1, k = (stage.sec === 'drop' ? 1 : stage.sec === 'build' ? 0.6 : 0.4) * (stage.reduce ? 0.2 : 1) * stage.alive;
      const hard = Math.exp(-ph * 7.5) * down * k, dv = s.at.clone().sub(s.eye), len = dv.length();
      s.eye.addScaledVector(dv, 0.04 * hard); s.eye.y -= 0.012 * len * hard; s.at.y -= 0.016 * len * hard; }
    // someone is holding this: it breathes, it shakes with the build, it punches in on a flash
    const d = s.eye.distanceTo(s.at), hand = (0.0035 + 0.012 * stage.build) * d * (stage.reduce ? 0.3 : 1), t = stage.t;
    s.eye.add(V(n1(t, 1), n1(t, 2), n1(t, 3)).multiplyScalar(hand)); s.at.add(V(n1(t, 4), n1(t, 5), n1(t, 6)).multiplyScalar(hand * 0.6));
    const fov = s.fov * (1 - (stage.reduce ? 0 : 0.035) * stage.pop), roll = (s.roll || 0) + n1(t, 7) * 0.006;
    const f = s.at.clone().sub(s.eye).normalize(), right = V().crossVectors(f, s.up || V(0, 1, 0)).normalize(), up = V().crossVectors(right, f).normalize();   // a ride camera banks with its track
    up.applyAxisAngle(f, roll);
    return { eye: s.eye, at: s.at, up, fov: fov * DEG, focus: d, cut: this.cutN, wide: fov };
  }
}

export const CUT = EDL;   // for the audit rig
