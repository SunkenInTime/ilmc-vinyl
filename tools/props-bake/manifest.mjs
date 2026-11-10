// Rebuilds the floor kit (assets/ilmc/props/*.glb, assets/ilmc/tex/*.webp, assets/ilmc/props/manifest.json).
// Dev only: nothing in tools/props-bake ships or runs in the page. The downloads and the tools' own node_modules
// live in a work folder outside the repo, and the scripts run from there so their imports resolve:
//   mkdir E:\w\props-work && cd E:\w\props-work && copy <repo>\tools\props-bake\*.mjs .
//   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 @gltf-transform/extensions@4.5.1 meshoptimizer sharp
//   set PROPS_WORK=E:\w\props-work & set PROPS_REPO=<repo>\
//   node fetch.mjs <Poly Haven ids, see ASSETS in bake.mjs>   (textures: see the SETS sources in tex.mjs, unzipped into tdl/)
//   node bake.mjs & node tex.mjs & node manifest.mjs
// assets/ilmc/props/manifest.json from the two bake reports, in a fixed order (big, telling things first)
import { readFileSync, writeFileSync } from 'node:fs';
const WORK = (process.env.PROPS_WORK || '').replace(/\\/g, '/'); if (!WORK) throw new Error('set PROPS_WORK to the work folder (see the header)');
const REPO = (process.env.PROPS_REPO || '').replace(/\\/g, '/'); if (!REPO.endsWith('/')) throw new Error('set PROPS_REPO to the repo folder, ending in a slash');
const B = JSON.parse(readFileSync(WORK + '/bake-report.json', 'utf8')), T = JSON.parse(readFileSync(WORK + '/tex-report.json', 'utf8'));
const ORDER = ['tv_black', 'boombox', 'laptop_90s', 'motherboard', 'plant', 'pillows', 'milk_crate', 'cardboard_box', 'tv_silver', 'desk_lamp', 'gamepad', 'walkman', 'tape_recorder', 'notebooks', 'notepads', 'postcards', 'stationery', 'spray_cans', 'alarm_clock', 'watch', 'multimeter', 'aloe', 'duck', 'football', 'bin_bag', 'storage_tub'];
const models = ORDER.map((f) => B[f + '.glb']).filter(Boolean).map(({ file, bytes, title, source, authors, licence, props }) => ({ file, bytes, title, source, authors, licence, props }));
const surfaces = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v]));
const total = models.reduce((s, m) => s + m.bytes, 0) + Object.values(T).reduce((s, t) => s + t.bytes, 0);
writeFileSync(REPO + 'assets/ilmc/props/manifest.json', JSON.stringify({
  about: 'The floor kit (src/ilmc/props.js). Models: Poly Haven glTFs, re-baked (split into props, origin on the floor, simplified, WebP textures, meshopt) by tools/props-bake/. Surfaces: tiling WebP sets in assets/ilmc/tex/, UVs in metres, `tile` = metres per repeat. Every asset here is CC0 1.0 (public domain); credit is kind, not required. Props made in code (props-made.js) are original artwork.',
  bytes: total, models, surfaces,
}, null, 1).replace(/\n/g, '\r\n') + '\r\n');
console.log('models', models.length, 'props', models.reduce((s, m) => s + Object.keys(m.props).length, 0), 'total', (total / 1048576).toFixed(2), 'MB');
