// Rebuilds the floor kit (assets/ilmc/props/*.glb, assets/ilmc/tex/*.webp, assets/ilmc/props/manifest.json).
// Dev only: nothing in tools/props-bake ships or runs in the page. The downloads and the tools' own node_modules
// live in a work folder outside the repo, and the scripts run from there so their imports resolve:
//   mkdir E:\w\props-work && cd E:\w\props-work && copy <repo>\tools\props-bake\*.mjs .
//   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 @gltf-transform/extensions@4.5.1 meshoptimizer sharp
//   set PROPS_WORK=E:\w\props-work & set PROPS_REPO=<repo>\
//   node fetch.mjs <Poly Haven ids, see ASSETS in bake.mjs>   (textures: see the SETS sources in tex.mjs, unzipped into tdl/)
//   node bake.mjs & node tex.mjs & node manifest.mjs
// Bake Poly Haven glTFs into the floor kit: one .glb per source asset, each prop a top-level node named after it,
// y-up, metres, origin on the floor under its centre. Writes assets/ilmc/props/*.glb and part of manifest.json.
//   node bake.mjs [only-asset ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress, meshopt, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
const WORK = (process.env.PROPS_WORK || '').replace(/\\/g, '/'); if (!WORK) throw new Error('set PROPS_WORK to the work folder (see the header)');
const REPO = (process.env.PROPS_REPO || '').replace(/\\/g, '/'); if (!REPO.endsWith('/')) throw new Error('set PROPS_REPO to the repo folder, ending in a slash');

const DL = WORK + '/dl', OUT = REPO + 'assets/ilmc/props';
mkdirSync(OUT, { recursive: true });
const D2R = Math.PI / 180;
const quat = ([x, y, z]) => {   // XYZ euler (degrees) -> quaternion
  const [a, b, c] = [x * D2R / 2, y * D2R / 2, z * D2R / 2], [ca, cb, cc, sa, sb, sc] = [Math.cos(a), Math.cos(b), Math.cos(c), Math.sin(a), Math.sin(b), Math.sin(c)];
  return [sa * cb * cc + ca * sb * sc, ca * sb * cc - sa * cb * sc, ca * cb * sc + sa * sb * cc, ca * cb * cc - sa * sb * sc];
};

// props: name -> source top-level node names ('*' = all), optional rot (deg), scale. tris: target for the whole file.
export const ASSETS = {
  television_02: { file: 'tv_black', tex: 1024, tris: 2400, props: { tv_black: { nodes: '*' } } },
  Television_01: { file: 'tv_silver', tex: 1024, tris: 2000, props: { tv_silver: { nodes: '*' } } },
  // two character stickers painted out of the diffuse map (patched from clean panel nearby); the skull stays
  boombox: { tex: 1024, tris: 5000, props: { boombox: { nodes: '*' } }, paint: { 'textures/boombox_diff_1k.jpg': [[548, 380, 690, 512, 330, 380], [712, 772, 845, 850, 712, 898], [712, 812, 845, 898, 712, 904]] } },
  portable_cassette_player: { file: 'walkman', tex: 512, tris: 4500, props: {
    walkman: { nodes: ['portable_cassette_player', 'portable_cassette_player_lid'] },
    cassette: { nodes: ['portable_cassette_player_casette'], rot: [-90, 0, 0] } } },
  cassette_player: { file: 'tape_recorder', tex: 512, tris: 3000, props: { tape_recorder: { nodes: '*', rot: [-90, 0, 0] } } },
  classic_laptop: { file: 'laptop_90s', tex: 1024, tris: 6000, props: { laptop_90s: { nodes: '*' } } },
  gamepad: { tex: 512, tris: 3000, props: { gamepad: { nodes: '*' } } },
  digital_wrist_watch: { file: 'watch', tex: 512, tris: 2000, props: { watch: { nodes: '*' } } },
  alarm_clock_01: { file: 'alarm_clock', tex: 512, tris: 3500, props: { alarm_clock: { nodes: '*' } } },
  circuit_board: { file: 'motherboard', tex: 1024, q: 72, tris: 6000, props: { motherboard: { nodes: '*' } } },
  retro_multimeter: { file: 'multimeter', tex: 512, tris: 4000, props: { multimeter: { nodes: '*' } } },
  binder_notebook: { file: 'notebooks', tex: 512, tris: 5000, props: { notebook_open: { nodes: ['binder_notebook'] }, notebook: { nodes: ['binder_notebook_closed'] } } },
  office_notepads: { file: 'notepads', tex: 512, tris: 800, props: {
    legal_pad: { nodes: ['office_notepads_yellow_pad'] }, sticky_notes: { nodes: ['office_notepads_sticky_stack'] },
    paper_stack: { nodes: ['office_notepads_a4_stack'] }, note_cards: { nodes: ['office_notepads_note_stack'] },
    paper_sheet: { nodes: ['office_notepads_a4_a'] }, paper_sheet_2: { nodes: ['office_notepads_a4_b'] } } },
  stationery_supplies: { file: 'stationery', tex: 512, tris: 4500, props: {
    pencil_cup: { nodes: ['stationery_supplies_pencilcup'] }, pen_red: { nodes: ['stationery_supplies_pen_red'] }, pen_blue: { nodes: ['stationery_supplies_pen_blue'] },
    pencil: { nodes: ['stationery_supplies_pencil_used'] }, eraser: { nodes: ['stationery_supplies_eraser'] } } },
  postcard_set_01: { file: 'postcards', tex: 1024, tris: 3000, props: Object.fromEntries([1, 3, 5, 8, 11, 14, 17, 20].map((i) => ['postcard_' + i, { nodes: ['postcard_' + String(i).padStart(2, '0')], rot: [-90, 0, 0] }])) },
  cardboard_box_01: { file: 'cardboard_box', tex: 1024, tris: 3000, props: { cardboard_box: { nodes: '*' } } },
  plastic_crate_01: { file: 'milk_crate', tex: 512, tris: 8000, props: { milk_crate: { nodes: '*' } } },
  potted_plant_02: { file: 'plant', tex: 768, tris: 16000, props: { plant: { nodes: '*' } } },
  potted_plant_04: { file: 'aloe', tex: 512, tris: 4000, props: { aloe: { nodes: ['potted_plant_04_dirt', 'potted_plant_04_plant', 'potted_plant_04_pot'] } } },
  throw_pillows_01: { file: 'pillows', tex: 512, tris: 6400, props: { pillow: { nodes: ['throw_pillows_01_pillow01'] }, pillow_2: { nodes: ['throw_pillows_01_pillow02'] } } },
  rubber_duck_toy: { file: 'duck', tex: 512, tris: 3000, props: { duck: { nodes: '*', scale: 0.55 } } },
  spray_paint_bottles_02: { file: 'spray_cans', tex: 512, tris: 3500, props: { spray_can: { nodes: ['spray_paint_bottles_02'] }, spray_can_dented: { nodes: ['spray_paint_bottles_02_dented'] } } },
  desk_lamp_arm_01: { file: 'desk_lamp', tex: 512, tris: 7000, props: { desk_lamp: { nodes: '*' } } },
  plastic_container: { file: 'storage_tub', tex: 1024, tris: 4100, props: { storage_tub: { nodes: '*' } } },
  trashbag: { file: 'bin_bag', tex: 1024, tris: 4500, props: { bin_bag: { nodes: '*' } } },
  football: { tex: 512, tris: 2200, props: { football: { nodes: ['football_inflated'] } } },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;

// copy rectangles of a texture over others with a 6 px feathered edge: [dx0, dy0, dx1, dy1, sx, sy]; keeps the original as .orig.jpg
async function paintOut(file, patches) {
  const orig = file.replace(/\.jpg$/, '.orig.jpg'); if (!existsSync(orig)) copyFileSync(file, orig);
  const comps = [];
  for (const [x0, y0, x1, y1, sx, sy] of patches) {
    const w = x1 - x0, h = y1 - y0, f = 6, rgb = await sharp(orig).extract({ left: sx, top: sy, width: w, height: h }).removeAlpha().raw().toBuffer(), px = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y), a = Math.max(0, Math.min(1, (e - f / 2) / (f / 2))), i = y * w + x;
      px[i * 4] = rgb[i * 3]; px[i * 4 + 1] = rgb[i * 3 + 1]; px[i * 4 + 2] = rgb[i * 3 + 2]; px[i * 4 + 3] = Math.round(255 * a * a * (3 - 2 * a));
    }
    comps.push({ input: px, raw: { width: w, height: h, channels: 4 }, left: x0, top: y0 });
  }
  await sharp(orig).composite(comps).jpeg({ quality: 92 }).toFile(file);
}
const triCount = (n) => { let t = 0; n.traverse((c) => { const m = c.getMesh(); if (m) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; }); return t; };
const only = process.argv.slice(2), report = {};
for (const [id, a] of Object.entries(ASSETS)) {
  if (only.length && !only.includes(id)) continue;
  for (const [f, patches] of Object.entries(a.paint || {})) await paintOut(`${DL}/${id}/${f}`, patches);
  const doc = await io.read(`${DL}/${id}/${id}.gltf`), root = doc.getRoot(), scene = root.listScenes()[0];
  const top = scene.listChildren(), used = new Set();
  let srcTris = 0; for (const n of top) srcTris += triCount(n);
  for (const [name, p] of Object.entries(a.props)) {
    const P = doc.createNode(name);
    const pick = p.nodes === '*' ? top : p.nodes.map((nm) => { const n = top.find((t) => t.getName() === nm); if (!n) throw new Error(`${id}: no node ${nm}`); return n; });
    for (const n of pick) { scene.removeChild(n); P.addChild(n); used.add(n); }
    if (p.rot) P.setRotation(quat(p.rot));
    if (p.scale) P.setScale([p.scale, p.scale, p.scale]);
    scene.addChild(P);
    const b = getBounds(P);
    P.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  }
  for (const n of top) if (!used.has(n)) { n.traverse((c) => c.dispose()); }
  const ratio = Math.min(1, a.tris / srcTris);
  await doc.transform(
    prune(), dedup(), weld(),
    ...(ratio < 0.98 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: a.err || 0.004 })] : []),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [a.tex, a.tex], quality: a.q || 82, slots: /^(?!normalTexture).*$/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [a.tex, a.tex], quality: 90, slots: /^normalTexture$/ }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const file = (a.file || id) + '.glb';
  await io.write(`${OUT}/${file}`, doc);
  const bytes = statSync(`${OUT}/${file}`).size, info = JSON.parse(readFileSync(`${DL}/${id}/info.json`, 'utf8'));
  const props = {};
  for (const P of doc.getRoot().listScenes()[0].listChildren()) {
    const b = getBounds(P), r = (v) => Math.round(v * 1000) / 1000;
    props[P.getName()] = { w: r(b.max[0] - b.min[0]), d: r(b.max[2] - b.min[2]), h: r(b.max[1] - b.min[1]), tris: triCount(P) };
  }
  report[file] = { file, bytes, source: `https://polyhaven.com/a/${id}`, title: info.name, authors: Object.keys(info.authors), licence: 'CC0-1.0', srcTris, props };
  console.log(file.padEnd(20), String(bytes >> 10).padStart(5) + ' KB', `${srcTris} -> ${Object.values(props).reduce((s, p) => s + p.tris, 0)} tris`, Object.entries(props).map(([k, v]) => `${k} ${v.w}x${v.d}x${v.h}`).join(' | '));
}
const prev = (() => { try { return JSON.parse(readFileSync(WORK + '/bake-report.json', 'utf8')); } catch { return {}; } })();
writeFileSync(WORK + '/bake-report.json', JSON.stringify({ ...prev, ...report }, null, 1));
