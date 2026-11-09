// The overload's discs: the towers fire CDs out of their trays at the pace of the build. They fly, bounce, slide and
// pile up on the floor; on the drop they are blown off it, and when the floor comes back they are gone.
import * as THREE from 'three';

const MAX = 420, G = 9.8;

export class Discs {
  // launchers: [{ obj, owner, kind: 'cd' | 'floppy' }]; obj marks the mouth, owner.g says which way is forward
  constructor(root, launchers, floor) {
    this.launchers = launchers; this.floor = floor; this.list = []; this.next = 0;
    const disc = new THREE.CylinderGeometry(0.06, 0.06, 0.0012, 40, 1);
    const face = new THREE.MeshPhysicalMaterial({ color: 0xd8dde6, metalness: 1, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 900] });
    this.mesh = new THREE.InstancedMesh(disc, face, MAX); this.mesh.count = 0; this.mesh.frustumCulled = false;
    const hole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.0016, 16), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 }), MAX);
    hole.count = 0; hole.frustumCulled = false; this.hole = hole;
    const fl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.0033, 0.093), new THREE.MeshStandardMaterial({ roughness: 0.45 }), MAX);
    fl.count = 0; fl.frustumCulled = false; this.floppy = fl; this.flist = [];
    const pal = [0x1d1d1f, 0x2a6be0, 0xff4fa3, 0xf2e86a, 0xf4f4f0, 0x7cff6b].map((c) => new THREE.Color(c)); for (let i = 0; i < MAX; i++) fl.setColorAt(i, pal[i % pal.length]);
    root.add(this.mesh, hole, fl);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.one = new THREE.Vector3(1, 1, 1);
  }
  // out of tower i's tray, forward and up, spinning
  fire(i, power = 1, target = null) {
    const L = this.launchers[i % this.launchers.length]; if (!L) return;
    const p = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, 1);
    L.obj.getWorldPosition(p); this.mesh.parent.worldToLocal(p);
    fwd.applyQuaternion(L.owner.g.quaternion);
    const list = L.kind === 'floppy' ? this.flist : this.list;
    const d = list.length < MAX ? (list.push({}), list[list.length - 1]) : list[(L.kind === 'floppy' ? this.fnext = (this.fnext || 0) + 1 : this.next++) % MAX];
    d.p = p.addScaledVector(fwd, 0.1);
    if (target) {                                          // a lob that lands on the target: flight time T, gravity G
      const T = 0.55 + Math.random() * 0.35;
      d.v = new THREE.Vector3((target.x - d.p.x) / T, (target.y - d.p.y) / T + 0.5 * G * T, (target.z - d.p.z) / T);
    } else {
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar((Math.random() - 0.5) * 1.4);
      d.v = fwd.clone().multiplyScalar(1.4 * power).add(side).add(new THREE.Vector3(0, 0.9 + Math.random() * 0.8, 0).multiplyScalar(power));
    }
    d.q = new THREE.Quaternion(); d.w = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 3, Math.random() - 0.5).multiplyScalar(18); d.rest = false; d.away = false;
  }
  // the drop: everything on the floor goes flying
  blow(center) {
    for (const d of [...this.list, ...this.flist]) { const o = d.p.clone().sub(center).setY(0).normalize(); d.v = o.multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(0, 2 + Math.random() * 2, 0)); d.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30); d.rest = false; d.away = true; }
  }
  step(dt, noFloor) {
    if (!noFloor && this.wasNoFloor) { this.list.length = 0; this.next = 0; this.flist.length = 0; }   // the floor is back: start clean
    this.wasNoFloor = noFloor;
    const n = new THREE.Vector3(), tmp = new THREE.Quaternion();
    for (const d of [...this.list, ...this.flist]) {
      if (d.rest) continue;
      d.v.y -= G * dt; d.p.addScaledVector(d.v, dt);
      const wl = d.w.length(); if (wl > 1e-4) { tmp.setFromAxisAngle(n.copy(d.w).divideScalar(wl), wl * dt); d.q.premultiply(tmp); }
      d.k = d.k ?? (this.stackN = (this.stackN || 0) + 1) % 7;
      const top = this.floor + 0.0008 + d.k * 0.0014;                               // a little stacking so piles don't flicker
      if (!noFloor && !d.away && d.p.y < top) {
        d.p.y = top;
        if (Math.abs(d.v.y) > 0.6) { d.v.y = -d.v.y * 0.28; d.v.x *= 0.7; d.v.z *= 0.7; d.w.multiplyScalar(0.5); }
        else {                                                                   // settle flat, sliding to a stop
          d.v.y = 0; d.v.x *= Math.exp(-dt * 6); d.v.z *= Math.exp(-dt * 6); d.w.multiplyScalar(Math.exp(-dt * 10));
          const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, new THREE.Euler().setFromQuaternion(d.q).y, 0)); d.q.slerp(flat, 1 - Math.exp(-dt * 14));
          if (Math.hypot(d.v.x, d.v.z) < 0.02) d.rest = true;
        }
      }
      if (d.p.y < this.floor - 3) d.rest = true;
    }
    this.mesh.count = this.hole.count = this.list.length;
    this.list.forEach((d, i) => { this.m.compose(d.p, d.q, this.one); this.mesh.setMatrixAt(i, this.m); this.hole.setMatrixAt(i, this.m); });
    this.floppy.count = this.flist.length;
    this.flist.forEach((d, i) => { this.m.compose(d.p, d.q, this.one); this.floppy.setMatrixAt(i, this.m); });
    this.mesh.instanceMatrix.needsUpdate = this.hole.instanceMatrix.needsUpdate = this.floppy.instanceMatrix.needsUpdate = true;
  }
}
