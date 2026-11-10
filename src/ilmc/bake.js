// A machine is dozens of small parts but only a few materials. Once it is built, every part that never moves on its own
// is welded into one mesh per material, in the machine's own frame, so the room draws a machine in a handful of calls
// (three times a frame, with the shadow passes). Parts named in `keep` (screens, lids, trays, fans, lights that change
// colour, anything index.js or cables.js holds on to) stay as they are, with everything under them.
import * as THREE from 'three';

function sig(m) {
  const w = m.userData.wear ? Object.entries(m.userData.wear).map(([k, u]) => (u.value?.isColor ? u.value.getHexString() : u.value?.isTexture ? '' : u.value)).join(',') : '';
  if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') && !m.userData.wear) return m.uuid;     // its own shader: never shared
  return [m.type, m.color?.getHexString(), m.roughness, m.metalness, m.map?.uuid, m.roughnessMap?.uuid, m.normalMap?.uuid, m.emissive?.getHexString(), m.emissiveIntensity, m.emissiveMap?.uuid,
    m.transparent, m.opacity, m.side, m.clearcoat, m.clearcoatRoughness, m.sheen, m.polygonOffset, m.alphaTest, m.depthWrite, m.blending, w, JSON.stringify(m.defines || {})].join('|');
}
// plain painted parts (no maps, no shader of their own) differ only in colour and finish: they share one mesh per finish,
// their colours carried per vertex
const own = (m) => Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile');
const plain = (m) => m.type === 'MeshStandardMaterial' && !m.map && !m.emissiveMap && !m.roughnessMap && !m.normalMap && !m.transparent && !own(m) && m.side === THREE.FrontSide && !m.vertexColors && !(m.emissive && m.emissive.getHex());
const finish = (m) => [Math.round(m.roughness / 0.15) * 0.15, m.metalness > 0.5 ? 1 : 0];
const A = ['position', 'normal', 'uv', 'color'];
export function bake(g, keep = []) {
  const keepSet = new Set(keep.filter(Boolean)), groups = new Map(), gone = [];
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), rel = new THREE.Matrix4(), im = new THREE.Matrix4();
  const take = (o) => {
    const geo = o.geometry, m = o.material;
    if (!geo || !m || Array.isArray(m) || o.children.length || m.userData.glass || o.userData.keep) return;
    rel.multiplyMatrices(inv, o.matrixWorld);
    const mats = o.isInstancedMesh ? Array.from({ length: o.count }, (_, i) => { o.getMatrixAt(i, im); return rel.clone().multiply(im); }) : [rel.clone()];
    if (o.isInstancedMesh && o.instanceColor) return;
    const vc = plain(m), k = vc ? 'vc|' + finish(m).join('|') : sig(m); let gr = groups.get(k); if (!gr) groups.set(k, gr = { m, vc, parts: [] });
    for (const mx of mats) {
      const c = (geo.index ? geo.toNonIndexed() : geo.clone()); c.applyMatrix4(mx); if (mx.determinant() < 0) flip(c);
      if (vc) { const n = c.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([m.color.r, m.color.g, m.color.b], i * 3); c.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
      gr.parts.push(c);
    }
    gone.push(o);
  };
  const walk = (o) => { if (keepSet.has(o)) return; if (o.isMesh) take(o); for (const c of [...o.children]) walk(c); };
  for (const c of [...g.children]) walk(c);
  for (const o of gone) o.parent.remove(o);
  for (const { m: m0, vc, parts } of groups.values()) {
    const [r, mt] = vc ? finish(m0) : [], m = vc ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: Math.max(0.05, r), metalness: mt }) : m0;
    let n = 0; for (const p of parts) n += p.attributes.position.count;
    const out = new THREE.BufferGeometry();
    for (const a of A) {
      if (a === 'color' && !vc) continue;
      const sz = a === 'uv' ? 2 : 3, arr = new Float32Array(n * sz); let o = 0;
      for (const p of parts) { const src = p.attributes[a], cnt = p.attributes.position.count; if (src) for (let i = 0; i < cnt; i++) for (let j = 0; j < sz; j++) arr[(o + i) * sz + j] = src.getComponent(i, j); o += cnt; }
      out.setAttribute(a, new THREE.BufferAttribute(arr, sz));
    }
    for (const p of parts) p.dispose();
    out.computeBoundingSphere();
    const w = new THREE.Mesh(out, m); if (m.transparent) w.receiveShadow = true;   // painted detail takes the shadows the part it is painted on takes
    g.add(w);
  }
  return g;
}
// a mirrored transform turns triangles inside out; put their winding back
function flip(geo) {
  const p = geo.attributes.position, nm = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i += 3) for (const a of [p, nm, uv]) { if (!a) continue; for (let j = 0; j < a.itemSize; j++) { const t = a.getComponent(i + 1, j); a.setComponent(i + 1, j, a.getComponent(i + 2, j)); a.setComponent(i + 2, j, t); } }
}
