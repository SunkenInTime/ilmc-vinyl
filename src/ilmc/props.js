// The floor kit: real things to bury the floor in, like the cover (books, toys, a plant, a boombox, clothes, junk),
// fetched after the room is on screen. Scanned CC0 models come from assets/ilmc/props/*.glb (sources, authors and
// licences in assets/ilmc/props/manifest.json); clothes, magazines, prints, a rug, a beanbag and plush are made in
// code (props-made.js). Every prop has the same shape whatever made it.
//
//   import { Props } from './props.js';
//   const kit = new Props({ renderer });         // nothing is fetched yet
//   kit.load({ first, only });                   // starts once the page is idle; resolves (never rejects) when every file has settled.
//                                                // first: prop names to fetch before the rest; only: fetch just the files holding these
//                                                // (when() waits for load(): call load() once, early, and the rest follows)
//   await kit.listed;                            // the manifest is in: names() and spec() cover the models too, before they arrive
//   const o = kit.get('boombox');                // a fresh clone, or null if it has not arrived (or never will)
//   kit.when('boombox').then((o) => o && room.add(o));   // a clone as soon as it arrives; null if its file failed or was not asked for
//   kit.spec('boombox')                          // { w, d, h, tris, bytes, made } in metres (w along x, d along z, h up), or null
//   kit.names()                                  // every prop known so far (code ones at once, models once the manifest is in)
//   kit.surface('carpet', { color })             // a MeshStandardMaterial for a tiling surface; textures fill in when they land
//   kit.floor('carpet', 4, 3)                    // a w x d plane of it lying on y = 0, shadows received
//
// A prop is a THREE.Group: y up, metres, real-world size, origin on the floor under the middle of its footprint, so
// `o.position.set(x, floorY, z); o.rotation.y = a` puts it down. Meshes cast and receive shadows, materials are
// MeshStandardMaterial / MeshPhysicalMaterial, and clones share geometry, materials and textures (change a
// material on one and you change it on all; clone the material first to tint one). o.userData.prop = { name, w, d, h }.
// Surface materials expect UVs in metres (u, v = metres along the surface); the texture repeat carries the weave's
// real size. A file that fails to load is skipped with one console warning: that prop is simply absent.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';
import { MADE } from './props-made.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const idle = () => new Promise((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 1500 }) : setTimeout(r, 150)));
// the grey weaves (jersey, fleece, teddy) sit at about 0.78 sRGB = 0.57 linear; scale the tint back up so the colour asked for is the colour you get
const GREY_LIFT = 1 / 0.57;

export class Props {
  constructor({ base = 'assets/ilmc/', renderer = null, concurrency = 3 } = {}) {
    this.base = base.endsWith('/') ? base : base + '/';
    this.aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    this.concurrency = concurrency;
    this.tpl = new Map();          // name -> template Group (clone it)
    this.specs = new Map();        // name -> spec
    this.wait = new Map();         // name -> [resolve]
    this.failed = new Set(); this.done = false;   // done: load() has settled every file it was going to fetch
    this.surf = new Map();         // name -> { info, tex: { col, nor, rough } | null, mats: Map }
    this.manifest = null; this.loading = null; this.listed = new Promise((r) => { this.onListed = r; });
    for (const name of Object.keys(MADE)) this.specs.set(name, { made: true });
  }

  names() { return [...this.specs.keys()]; }
  spec(name) { this.build(name); return this.specs.get(name) || null; }
  has(name) { return this.tpl.has(name) || name in MADE; }
  get(name) { const t = this.build(name); return t ? t.clone(true) : null; }
  when(name) {
    if (this.has(name)) return Promise.resolve(this.get(name));
    if (this.done || this.failed.has(name) || (this.manifest && !this.specs.has(name))) return Promise.resolve(null);   // settled, or never coming
    return new Promise((r) => { const l = this.wait.get(name) || []; l.push(r); this.wait.set(name, l); });
  }

  load({ first = [], only = null } = {}) {
    return this.loading ||= (async () => {
      await nextFrame(); await nextFrame(); await idle();          // never in the way of the room's first frames
      try {
        const res = await fetch(this.base + 'props/manifest.json', { priority: 'low' });
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        this.manifest = await res.json();
      } catch (e) { console.warn('props: no manifest, no models', e.message); this.onListed(this); this.done = true; this.settleAll(); return this; }
      const sf = this.manifest.surfaces || {};
      for (const [name, info] of Object.entries(sf)) this.surfEntry(name).info = info;
      for (const m of this.manifest.models) for (const [name, s] of Object.entries(m.props)) this.specs.set(name, { ...s, bytes: Math.round(m.bytes / Object.keys(m.props).length), file: m.file });
      this.onListed(this);
      const surfaces = Promise.all(Object.keys(sf).map((n) => this.loadSurface(n)));
      // models in manifest order, the ones asked for first
      const rank = (m) => { const i = Object.keys(m.props).map((n) => first.indexOf(n)).filter((i) => i >= 0); return i.length ? Math.min(...i) : first.length + this.manifest.models.indexOf(m); };
      const queue = this.manifest.models.filter((m) => !only || Object.keys(m.props).some((n) => only.includes(n))).sort((a, b) => rank(a) - rank(b));
      const worker = async () => { for (let m; (m = queue.shift());) await this.loadModel(m); };
      // the made things cost 5-55 ms each to build (canvas art, cloth); build them one per idle slot so get() never hitches
      const made = (async () => { for (const n of Object.keys(MADE)) if (!this.tpl.has(n)) { await idle(); this.build(n); } })();
      await Promise.all([surfaces, made, ...Array.from({ length: this.concurrency }, worker)]);
      this.done = true; this.settleAll();
      return this;
    })();
  }

  // ---------- models ----------
  async loadModel(m) {
    try {
      const res = await fetch(this.base + 'props/' + m.file, { priority: 'low' });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.parseAsync(await res.arrayBuffer(), this.base + 'props/');
      for (const node of [...gltf.scene.children]) {
        const name = node.name, g = new THREE.Group(); g.name = name; g.add(node);
        node.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = o.receiveShadow = true;
          for (const mt of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (mt[k]) mt[k].anisotropy = this.aniso;
        });
        this.adopt(name, g, { ...this.specs.get(name), file: m.file });
      }
    } catch (e) {
      console.warn(`props: ${m.file} did not load (${e.message}); left out`);
      for (const name of Object.keys(m.props)) { this.failed.add(name); this.settle(name); }
    }
  }
  adopt(name, g, extra = {}) {
    const b = new THREE.Box3().setFromObject(g), sz = b.getSize(new THREE.Vector3()), r = (v) => Math.round(v * 1000) / 1000;
    let tris = 0; g.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    const spec = { ...extra, w: r(sz.x), d: r(sz.z), h: r(sz.y), tris };
    g.userData.prop = { name, w: spec.w, d: spec.d, h: spec.h };
    this.tpl.set(name, g); this.specs.set(name, spec); this.settle(name);
    return g;
  }
  settle(name) { const l = this.wait.get(name); if (!l) return; this.wait.delete(name); for (const r of l) r(this.has(name) ? this.get(name) : null); }
  settleAll() { for (const name of [...this.wait.keys()]) { if (!this.has(name)) this.failed.add(name); this.settle(name); } }

  // code-made props are built on first use, from the surfaces (which may still be on their way)
  build(name) {
    if (this.tpl.has(name)) return this.tpl.get(name);
    const make = MADE[name]; if (!make) return null;
    const g = make({ THREE, surface: (n, o) => this.surface(n, o) });
    g.name = name; g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    return this.adopt(name, g, { made: true, bytes: 0 });
  }

  // ---------- surfaces ----------
  surfEntry(name) { let s = this.surf.get(name); if (!s) this.surf.set(name, s = { info: null, tex: null, mats: new Map() }); return s; }
  async loadSurface(name) {
    const s = this.surfEntry(name), i = s.info, L = new THREE.TextureLoader(), url = (f) => this.base + 'tex/' + f;
    try {
      const [col, nor, rough] = await Promise.all([L.loadAsync(url(i.col)), L.loadAsync(url(i.nor)), L.loadAsync(url(i.rough))]);
      col.colorSpace = THREE.SRGBColorSpace;
      for (const t of [col, nor, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / i.tile, 1 / i.tile); t.anisotropy = this.aniso; }
      s.tex = { col, nor, rough };
      for (const m of s.mats.values()) this.dress(m, s);
    } catch (e) { console.warn(`props: surface ${name} did not load; flat colour stays`); }
  }
  // opts: color (a tint; for the grey weaves it is the cloth's colour), vertexColors, side, repeat (extra tiling factor),
  // map (your own colour texture over the surface's weave, e.g. a rug's pattern; its repeat is yours to set)
  surface(name, { color = null, vertexColors = false, side = THREE.FrontSide, repeat = 1, map = null } = {}) {
    const s = this.surfEntry(name), key = [color, vertexColors, side, repeat, map?.uuid].join('|');
    let m = s.mats.get(key); if (m) return m;
    m = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color ?? 0x8a8a8a, roughness: 0.85, vertexColors, side, map });
    m.userData.surface = { name, tint: color, repeat, own: !!map }; s.mats.set(key, m);
    if (s.tex) this.dress(m, s);
    return m;
  }
  dress(m, s) {
    const { tint, repeat, own } = m.userData.surface, t = s.tex, i = s.info;
    const tx = (x) => { if (repeat === 1) return x; const c = x.clone(); c.repeat.multiplyScalar(repeat); return c; };
    if (!own) m.map = tx(t.col); m.normalMap = tx(t.nor); m.roughnessMap = tx(t.rough); m.roughness = 1;
    m.color.set(tint ?? 0xffffff); if (tint != null && i.tint) m.color.multiplyScalar(GREY_LIFT);
    m.needsUpdate = true;
  }
  floor(name, w, d, opts) {
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w, uv.getY(k) * d);
    const m = new THREE.Mesh(geo, this.surface(name, opts)); m.receiveShadow = true; return m;
  }
}
