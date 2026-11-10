// Rebuilds the floor kit (assets/ilmc/props/*.glb, assets/ilmc/tex/*.webp, assets/ilmc/props/manifest.json).
// Dev only: nothing in tools/props-bake ships or runs in the page. The downloads and the tools' own node_modules
// live in a work folder outside the repo, and the scripts run from there so their imports resolve:
//   mkdir E:\w\props-work && cd E:\w\props-work && copy <repo>\tools\props-bake\*.mjs .
//   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 @gltf-transform/extensions@4.5.1 meshoptimizer sharp
//   set PROPS_WORK=E:\w\props-work & set PROPS_REPO=<repo>\
//   node fetch.mjs <Poly Haven ids, see ASSETS in bake.mjs>   (textures: see the SETS sources in tex.mjs, unzipped into tdl/)
//   node bake.mjs & node tex.mjs & node manifest.mjs
// download Poly Haven 1k glTFs into ../dl/<id>/
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
const WORK = (process.env.PROPS_WORK || '').replace(/\\/g, '/'); if (!WORK) throw new Error('set PROPS_WORK to the work folder (see the header)');
const REPO = (process.env.PROPS_REPO || '').replace(/\\/g, '/'); if (!REPO.endsWith('/')) throw new Error('set PROPS_REPO to the repo folder, ending in a slash');
const ids = process.argv.slice(2), root = WORK + '/dl';
for (const id of ids) {
  const f = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const g = f.gltf?.['1k']?.gltf; if (!g) { console.log('no gltf', id); continue; }
  const dir = join(root, id); mkdirSync(dir, { recursive: true });
  const get = async (url, p) => { const out = join(dir, p); if (existsSync(out)) return; mkdirSync(dirname(out), { recursive: true }); const b = Buffer.from(await (await fetch(url)).arrayBuffer()); writeFileSync(out, b); };
  await get(g.url, id + '.gltf');
  await Promise.all(Object.entries(g.include || {}).map(([p, v]) => get(v.url, p)));
  const info = await (await fetch(`https://api.polyhaven.com/info/${id}`)).json();
  writeFileSync(join(dir, 'info.json'), JSON.stringify(info));
  console.log(id, Object.keys(g.include || {}).length + 1, 'files');
}
