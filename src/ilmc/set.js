// Dressing the bedroom floor like the cover: carpet under everything, rugs, clothes where they were dropped, magazines
// and prints, a plant, a boombox, a television nobody plugged in, junk; and once the room (shell.js) is there, things on
// the bed, the desk, the shelves, the sill and the wardrobe. The things come from the kit (props.js) after the room is on
// screen, so each one is set down as it arrives.
//
// Things lie next to each other, not on top of each other: every footprint is the real turned rectangle, machines and
// furniture included. No rug over a rug; cloth may touch a rug's edge, never cover it; a standing thing is either on
// bare floor or squarely on one rug; paper lies on bare floor or squarely on one thing. On the camera's side of the deck
// there is a clear lane (nothing taller than 6 cm), and nothing tall sits in the front third of the opening frame, so
// low shots across the floor are not filled by a ball or a heap. What does not fit is left out. `put` lists every
// placed thing (and the furniture) for the director: { x, z, r, h, kind } (+ w, d, a: the rectangle).
import * as THREE from 'three';
import { Props } from './props.js';
import { roomLit } from './shell.js';

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
// [name, kind, where it may go in order of preference]
// kinds: rug; soft (cloth, low); low (small, standing); tall; paper (flat). Places: a surface of the room (bed, bedhead,
// desk, underdesk, shelf, wardrobetop, sill, bookcase, bedside), 'pile' (under the machines), 'wall' (floor against a
// wall), 'floor' (anywhere on the floor).
const PLAN = [
  ['rug_daisy', 'rug', ['pile']], ['rug_face', 'rug', ['pile']], ['rug_shag', 'rug', ['pile', 'floor']], ['rug_rag', 'rug', ['front', 'floor']],
  ['beanbag', 'tall', ['wall']], ['storage_tub', 'tall', ['underdesk', 'wall']], ['plant', 'tall', ['wall']], ['tv_silver', 'tall', ['wall']], ['boombox', 'tall', ['bookcase', 'wall']],
  ['beanbag_blue', 'tall', ['wall']], ['bin_bag', 'tall', ['wall']], ['tv_black', 'tall', ['wall']], ['cardboard_box', 'tall', ['wardrobetop', 'wall']], ['milk_crate', 'tall', ['underdesk', 'wall']],
  ['pillow', 'soft', ['bed']], ['laptop_90s', 'tall', ['bed', 'wall']], ['desk_lamp', 'tall', ['wall']], ['plush_bear', 'tall', ['bed', 'wardrobetop', 'wall']],
  ['hoodie', 'soft', ['floor']], ['jeans', 'soft', ['bed', 'floor']], ['tee_white', 'soft', ['floor']], ['tee_pink', 'soft', ['bed', 'floor']], ['hoodie_grey', 'soft', ['floor']], ['tee_black', 'soft', ['floor']], ['tee_blue', 'soft', ['floor']],
  ['magazine_stack', 'low', ['underdesk', 'wall']], ['books', 'low', ['bookcase', 'underdesk', 'wall']], ['plush_face', 'low', ['shelf', 'bed', 'wall']], ['football', 'low', ['wall']], ['books_2', 'low', ['bedside', 'wall']],
  ['multimeter', 'low', ['desk', 'wall']], ['aloe', 'low', ['sill', 'wall']], ['duck', 'low', ['shelf', 'sill', 'desk']], ['alarm_clock', 'low', ['shelf', 'desk']],
  ['spray_can', 'low', ['desk', 'wall']], ['spray_can_dented', 'low', ['wall']], ['motherboard', 'low', ['underdesk', 'wall']], ['tape_recorder', 'low', ['desk', 'bed']], ['walkman', 'low', ['bed', 'desk']], ['pencil_cup', 'low', ['desk']],
  ['gamepad', 'paper', ['bed', 'floor']], ['magazine', 'paper', ['floor']], ['magazine_2', 'paper', ['floor', 'bed']], ['magazine_3', 'paper', ['floor']], ['magazine_4', 'paper', ['bed', 'floor']],
  ['print_1', 'paper', ['floor']], ['print_2', 'paper', ['floor']], ['print_3', 'paper', ['floor', 'bed']], ['print_4', 'paper', ['floor']], ['print_5', 'paper', ['floor']], ['print_6', 'paper', ['floor']],
  ['notebook_open', 'paper', ['desk', 'floor']], ['notebook', 'paper', ['floor']], ['legal_pad', 'paper', ['desk', 'floor']], ['paper_stack', 'paper', ['floor']], ['note_cards', 'paper', ['floor']], ['paper_sheet', 'paper', ['floor']], ['paper_sheet_2', 'paper', ['floor']], ['sticky_notes', 'paper', ['desk', 'floor']],
  ['postcard_1', 'paper', ['floor']], ['postcard_3', 'paper', ['floor']], ['postcard_5', 'paper', ['bed', 'floor']], ['postcard_8', 'paper', ['floor']], ['postcard_11', 'paper', ['floor']], ['postcard_14', 'paper', ['floor']], ['cassette', 'paper', ['floor']], ['watch', 'paper', ['bedside', 'floor']],
  ['pen_red', 'paper', ['floor']], ['pen_blue', 'paper', ['desk', 'floor']], ['pencil', 'paper', ['floor']], ['eraser', 'paper', ['floor']],
];
// what a phone is asked to download and draw
const LITE = new Set(['rug_face', 'rug_daisy', 'hoodie', 'jeans', 'tee_white', 'tee_pink', 'beanbag', 'plant', 'boombox', 'tv_silver', 'magazine_stack', 'books', 'plush_face', 'magazine', 'magazine_2', 'print_1', 'print_2', 'print_3']);
const LANE = 0.06, GAP = 0.02;

// ---- rectangles on the floor plan: { x, z, w, d, a } (w along x before turning by a about y) ----
const corners = (q) => { const c = Math.cos(q.a), s = Math.sin(q.a), hw = q.w / 2, hd = q.d / 2; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [q.x + u * c + v * s, q.z - u * s + v * c]); };
const axes = (q) => { const c = Math.cos(q.a), s = Math.sin(q.a); return [[c, -s], [s, c]]; };
// do two rectangles overlap (by more than `pad`; a negative pad keeps them that far apart)?
function overlap(A, B, pad = 0) {
  const ca = corners(A), cb = corners(B);
  for (const [ax, az] of [...axes(A), ...axes(B)]) {
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const [x, z] of ca) { const p = x * ax + z * az; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const [x, z] of cb) { const p = x * ax + z * az; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    if (a1 - pad <= b0 || b1 - pad <= a0) return false;
  }
  return true;
}
// is A entirely inside B (with a margin)?
function inside(A, B, m = 0) {
  const c = Math.cos(-B.a), s = Math.sin(-B.a);
  return corners(A).every(([x, z]) => { const dx = x - B.x, dz = z - B.z, u = dx * c + dz * s, v = -dx * s + dz * c; return Math.abs(u) <= B.w / 2 - m && Math.abs(v) <= B.d / 2 - m; });
}

export class Dressing {
  // room: { root, things, floor, cam (the opening camera), eye (it, in the room's coordinates), CX, FLOOR, renderer, lite, onAdd(obj), looseTo }
  constructor(room) {
    Object.assign(this, room);
    this.kit = new Props({ renderer: room.renderer });
    this.ground = new THREE.Group(); this.loose = []; this.put = []; this.R = rng(90210);
    this.root.add(this.ground);
    // the carpet: the kit's weave, in metres, on the floor that is already there (it keeps the flat colour until the weave lands)
    const g = this.floor.geometry, uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getY(i));
    this.floor.material = roomLit(this.kit.surface('carpet', { color: 0xc9c3cf })); this.onAdd(this.floor);
    this.room = null;                                     // shell.js sets itself here: the walls, the furniture, its surfaces
    this.run();
  }
  async run() {
    const plan = PLAN.filter(([n]) => !this.lite || LITE.has(n));
    this.kit.load({ first: plan.slice(0, 24).map(([n]) => n), only: this.lite ? [...LITE] : null });
    await this.kit.listed; this.prepare();
    for (const [name, kind, where] of plan) {                       // in the plan's order: big things claim their ground first
      const o = await this.kit.when(name); if (!o) continue;
      await new Promise((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30)));
      try { await this.place(o, kind, where); } catch (e) { console.warn('dressing:', name, e.message); }
    }
  }
  // what is already on the floor: the machines (their real turned boxes) and the room's furniture
  prepare() {
    const L = this.room?.L, box = new THREE.Box3(), sz = new THREE.Vector3(), ctr = new THREE.Vector3();
    this.blocks = [];
    for (const t of this.things) {
      if (t.stackedOn) continue;
      const g = t.g, q = g.quaternion.clone(), p = g.position.clone(), par = g.parent;
      g.quaternion.identity(); g.position.set(0, 0, 0); g.updateMatrixWorld(true);
      const inv = par ? par.matrixWorld.clone().invert() : new THREE.Matrix4();
      box.setFromObject(g).applyMatrix4(inv); box.getSize(sz); box.getCenter(ctr);
      g.quaternion.copy(q); g.position.copy(p); g.updateMatrixWorld(true);
      const a = new THREE.Euler().setFromQuaternion(q, 'YXZ').y, c = Math.cos(a), s = Math.sin(a);
      this.blocks.push({ x: p.x + ctr.x * c + ctr.z * s, z: p.z - ctr.x * s + ctr.z * c, w: sz.x, d: sz.z, a, h: t.height, kind: 'machine' });
    }
    if (L) for (const f of L.foot) { this.blocks.push(f); this.put.push({ ...f, r: Math.hypot(f.w, f.d) / 2 }); }
    this.bounds = L ? { x0: L.X0 + 0.04, x1: L.X1 - 0.04, z0: L.Z0 + 0.04, z1: L.Z1 - 0.3 } : { x0: this.CX - 2.5, x1: this.CX + 2.7, z0: -2.3, z1: 1.4 };
    // the clear lane: from the deck toward the opening camera
    const e = this.eye, dx = e.x - this.CX, dz = e.z, n = Math.hypot(dx, dz) || 1;
    this.lane = { dx: dx / n, dz: dz / n };
    this.spotItems = new Map();
  }
  seen(x, y, z) { const v = this.root.localToWorld(new THREE.Vector3(x, y, z)).project(this.cam); return v.z < 1 ? [v.x, v.y] : [9, 9]; }
  // within half a metre of the deck on the camera's side (the deck itself is about 0.23 m across from its middle)
  inLane(q) {
    const r = Math.hypot(q.w, q.d) / 2, px = q.x - this.CX, pz = q.z, t = Math.max(0, Math.min(1.5, px * this.lane.dx + pz * this.lane.dz));
    const off = Math.hypot(px - this.lane.dx * t, pz - this.lane.dz * t);
    return Math.hypot(px, pz) < 0.75 + r || (t > 0 && off < 0.5 + r * 0.8);
  }
  roomy(q) { const b = this.bounds; return corners(q).every(([x, z]) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1); }
  // may this rectangle lie here, given its kind?
  fits(q, kind) {
    if (!this.roomy(q)) return false;
    if (Math.hypot(q.x - this.CX, q.z) < 0.3 + Math.hypot(q.w, q.d) * 0.4) return false;                 // not on the deck
    if (q.h > LANE && this.inLane(q)) return false;
    if (q.h > LANE && kind !== 'rug') { const [nx, ny] = this.seen(q.x, this.FLOOR + q.h * 0.5, q.z); if (ny < -0.33 && ny > -1.1 && Math.abs(nx) < 1.1) return false; }   // the front third of the opening frame stays low
    const rugs = this.put.filter((p) => p.kind === 'rug');
    for (const b of this.blocks) if (b.kind === 'machine' ? kind !== 'rug' && overlap(q, b, -GAP) : overlap(q, b, kind === 'paper' ? -0.01 : -GAP)) return false;
    if (kind === 'rug') return !rugs.some((p) => overlap(q, p, -0.04)) && !this.put.some((p) => p.kind === 'furniture' && overlap(q, p, -0.03));
    const others = this.put.filter((p) => p.kind !== 'rug' && p.kind !== 'furniture' && !p.on);
    if (others.some((p) => overlap(q, p, -GAP))) return false;
    if (kind === 'soft') return !rugs.some((p) => overlap(q, { ...p, w: p.w - 0.1, d: p.d - 0.1 }));       // cloth may touch a rug's edge, never cover it
    // everything else: on bare floor, or squarely on one rug
    const on = rugs.filter((p) => overlap(q, p, 0.002));
    return on.length === 0 || (on.length === 1 && inside(q, on[0], 0.04));
  }
  async place(o, kind, where) {
    const { w, d, h } = o.userData.prop, R = this.R;
    for (const w_ of where) {
      if (this.room && this.room.L.spots.some((s) => s.name === w_)) { if (this.onto(o, kind, w_)) return; continue; }
      if (this.floorPlace(o, kind, w_)) return;
    }
  }
  // onto a surface of the room: inside its rectangle, clear of what is already there, low enough to fit under what is above
  onto(o, kind, name) {
    const s = this.room.L.spots.find((x) => x.name === name), { w, d, h } = o.userData.prop, R = this.R;
    if (h > s.room) return false;
    const items = this.spotItems.get(name) || [];
    for (let k = 0; k < 80; k++) {
      const a = (name === 'bed' && kind !== 'tall' ? (R() - 0.5) * 2.4 : (R() - 0.5) * 0.5) + (name === 'bedhead' ? 0 : 0), q = { x: s.x0 + R() * (s.x1 - s.x0), z: s.z0 + R() * (s.z1 - s.z0), w, d, a, h };
      if (!inside(q, { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, w: s.x1 - s.x0, d: s.z1 - s.z0, a: 0 }, 0)) continue;
      if (items.some((p) => overlap(q, p, -0.015))) continue;
      const y = s.y + (name === 'bed' ? 0.04 : 0);
      o.position.set(q.x, this.FLOOR + y, q.z); o.rotation.y = a;
      items.push(q); this.spotItems.set(name, items);
      this.put.push({ x: q.x, z: q.z, r: Math.hypot(w, d) / 2, h: y + h, kind, w, d, a, on: name, name: o.name });
      this.adopt(o, true); this.room.mount(o, s.wall);
      return true;
    }
    return false;
  }
  // onto the floor: under the pile (rugs), against a wall (it backs onto it), or wherever there is room
  floorPlace(o, kind, how) {
    const { w, d, h } = o.userData.prop, R = this.R, CX = this.CX, b = this.bounds, L = this.room?.L;
    let best = null;
    for (let k = 0; k < 320; k++) {
      let x, z, a;
      if (how === 'pile') { x = CX + (R() - 0.5) * 2.6; z = -0.6 + R() * 1.2; a = (R() - 0.5) * 0.3; }
      else if (how === 'front') { x = CX + (R() - 0.5) * 3; z = 0.6 + R() * 1.6; a = (R() - 0.5) * 0.3; }      // the open floor toward the lens
      else if (how === 'wall' && L) {                                 // back onto a wall, facing into the room
        const side = R(), lens = [L.X1 - L.X0, (b.z1 - L.Z0) * 0.8, (b.z1 - L.Z0) * 0.8], tot = lens[0] + lens[1] + lens[2], j = side * tot < lens[0] ? 0 : side * tot < lens[0] + lens[1] ? 1 : 2;
        const back = (j === 0 ? d : w) / 2 + 0.03 + R() * 0.04;
        if (j === 0) { x = b.x0 + R() * (b.x1 - b.x0); z = L.Z0 + 0.04 + d / 2 + R() * 0.04; a = (R() - 0.5) * 0.25; }
        else if (j === 1) { x = L.X0 + 0.04 + d / 2 + R() * 0.04; z = b.z0 + R() * (b.z1 - b.z0); a = Math.PI / 2 + (R() - 0.5) * 0.25; }
        else { x = L.X1 - 0.04 - d / 2 - R() * 0.04; z = b.z0 + R() * (b.z1 - b.z0); a = -Math.PI / 2 + (R() - 0.5) * 0.25; }
      } else { x = b.x0 + R() * (b.x1 - b.x0); z = b.z0 + R() * (b.z1 - b.z0); a = kind === 'paper' || kind === 'soft' ? R() * Math.PI * 2 : (R() - 0.5) * 0.6; }
      const q = { x, z, w, d, a, h };
      if (!this.fits(q, kind)) continue;
      const [nx, ny] = this.seen(x, this.FLOOR + h * 0.5, z), inView = Math.abs(nx) < 1 && ny < 1 && ny > -1;
      // in the opening frame if it can be; rugs toward the middle of the pile; a little chance
      const score = (inView ? 0.5 : 0) + (how === 'pile' ? -Math.hypot(x - CX, z) * 0.2 : 0) + (kind === 'paper' ? -0.2 * Math.abs(ny) : 0) + R() * 0.35;
      if (!best || score > best.score) best = { q, score };
    }
    if (!best) return false;
    const q = best.q, rug = kind !== 'rug' && this.put.find((p) => p.kind === 'rug' && overlap(q, p, 0.002));
    // what lies on what: a thing squarely on a rug sits on its pile; each flat thing a hair higher than the last
    const y = this.FLOOR + (rug ? rug.h + 0.002 : 0.0012 * (this.put.length % 7));
    o.position.set(q.x, y, q.z); o.rotation.y = q.a;
    this.put.push({ x: q.x, z: q.z, r: Math.hypot(q.w, q.d) / 2, h: (rug ? rug.h : 0) + q.h, kind, w: q.w, d: q.d, a: q.a, name: o.name });
    this.adopt(o, false, kind);
    return true;
  }
  // into the scene: lit by the room, wobbling with it, compiled before it is drawn (no hitch when it appears)
  adopt(o, mounted, kind) {
    o.traverse((m) => { if (m.isMesh) for (const mt of [].concat(m.material)) roomLit(mt); });
    this.onAdd(o);
    const add = () => {
      if (mounted) return;
      if (kind === 'rug' || kind === 'soft') { this.ground.add(o); return; }
      // loose things: they drift up with the rest when the floor goes (index.js moves them through userData, like its own clutter)
      const R = this.R; o.userData.home = o.position.clone(); o.userData.ry = o.rotation.y; o.userData.up = 0.15 + R() * 0.7 + (kind === 'tall' ? 0.3 : 0); o.userData.spin = (R() - 0.5) * (kind === 'tall' ? 1.2 : 3); o.userData.ph = R() * 6;
      this.loose.push(o); this.looseTo.add(o);
    };
    add();
    // compiled before it is drawn, into the room's own picture (shell.js compile), so it never stalls a frame when it first comes into view
    const show = () => { o.visible = true; };
    if (this.room) { o.visible = false; this.room.compile(o, this.cam).then(show, show); }
  }
  // the ground-bound things are only there while there is ground
  update(lift) { this.ground.visible = lift < 0.4; }
}
