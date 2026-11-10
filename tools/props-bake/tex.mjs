// Rebuilds the floor kit (assets/ilmc/props/*.glb, assets/ilmc/tex/*.webp, assets/ilmc/props/manifest.json).
// Dev only: nothing in tools/props-bake ships or runs in the page. The downloads and the tools' own node_modules
// live in a work folder outside the repo, and the scripts run from there so their imports resolve:
//   mkdir E:\w\props-work && cd E:\w\props-work && copy <repo>\tools\props-bake\*.mjs .
//   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 @gltf-transform/extensions@4.5.1 meshoptimizer sharp
//   set PROPS_WORK=E:\w\props-work & set PROPS_REPO=<repo>\
//   node fetch.mjs <Poly Haven ids, see ASSETS in bake.mjs>   (textures: see the SETS sources in tex.mjs, unzipped into tdl/)
//   node bake.mjs & node tex.mjs & node manifest.mjs
// Bake tiling surface sets into assets/ilmc/tex/<name>_{col,nor,rough}.webp and print the manifest entries.
// grey: true turns the colour map into neutral detail (mean ~0.78) so a material colour tints it.
import sharp from 'sharp';
import { writeFileSync, statSync, mkdirSync } from 'node:fs';
const WORK = (process.env.PROPS_WORK || '').replace(/\\/g, '/'); if (!WORK) throw new Error('set PROPS_WORK to the work folder (see the header)');
const REPO = (process.env.PROPS_REPO || '').replace(/\\/g, '/'); if (!REPO.endsWith('/')) throw new Error('set PROPS_REPO to the repo folder, ending in a slash');
const T = WORK + '/tdl', OUT = REPO + 'assets/ilmc/tex';
mkdirSync(OUT, { recursive: true });
const acg = (id) => ({ col: `${T}/${id}/${id}_1K-JPG_Color.jpg`, nor: `${T}/${id}/${id}_1K-JPG_NormalGL.jpg`, rough: `${T}/${id}/${id}_1K-JPG_Roughness.jpg` });
const ph = (id) => ({ col: `${T}/${id}/col.jpg`, nor: `${T}/${id}/nor.jpg`, rough: `${T}/${id}/rough.jpg` });
export const SETS = {
  carpet: { ...acg('Carpet012'), tile: 0.5, source: 'https://ambientcg.com/view?id=Carpet012', authors: ['Lennart Demes (ambientCG)'], title: 'Carpet 012' },
  carpet_pink: { ...acg('Carpet013'), tile: 0.5, source: 'https://ambientcg.com/view?id=Carpet013', authors: ['Lennart Demes (ambientCG)'], title: 'Carpet 013' },
  rug_checks: { ...acg('Carpet006'), tile: 0.6, source: 'https://ambientcg.com/view?id=Carpet006', authors: ['Lennart Demes (ambientCG)'], title: 'Carpet 006' },
  wood: { ...ph('laminate_floor_02'), tile: 1.7, size: 1024, source: 'https://polyhaven.com/a/laminate_floor_02', authors: ['Dario Barresi', 'Charlotte Baglioni'], title: 'Laminate Floor 02' },
  jersey: { ...ph('cotton_jersey'), tile: 0.264, grey: true, source: 'https://polyhaven.com/a/cotton_jersey', authors: ['colormass', 'Rico Cilliers'], title: 'Cotton Jersey' },
  fleece: { ...ph('jogging_melange'), tile: 0.273, grey: true, source: 'https://polyhaven.com/a/jogging_melange', authors: ['colormass', 'Rico Cilliers'], title: 'Jogging Melange' },
  denim: { ...ph('denim_fabric_03'), tile: 0.271, source: 'https://polyhaven.com/a/denim_fabric_03', authors: ['colormass', 'Rico Cilliers'], title: 'Denim Fabric 03' },
  gingham: { ...ph('gingham_check'), tile: 0.29, source: 'https://polyhaven.com/a/gingham_check', authors: ['colormass', 'Rico Cilliers'], title: 'Gingham Check' },
  teddy: { ...ph('curly_teddy_natural'), tile: 0.33, grey: true, source: 'https://polyhaven.com/a/curly_teddy_natural', authors: ['colormass', 'Rico Cilliers'], title: 'Curly Teddy Natural' },
};
const out = {};
for (const [name, s] of Object.entries(SETS)) {
  const files = {}; let bytes = 0;
  const N = s.size || 512;
  let col = sharp(s.col).resize(N, N);
  if (s.grey) {
    const st = await sharp(s.col).greyscale().stats(), m = st.channels[0].mean / 255;
    col = col.greyscale().linear(0.78 / m, 0).toColourspace('srgb');
  }
  for (const [k, img, q] of [['col', col, 80], ['nor', sharp(s.nor).resize(N, N), 88], ['rough', sharp(s.rough).resize(N / 2, N / 2).greyscale(), 80]]) {
    const f = `${name}_${k}.webp`; await img.webp({ quality: q }).toFile(`${OUT}/${f}`); files[k] = f; bytes += statSync(`${OUT}/${f}`).size;
  }
  const st = await sharp(`${OUT}/${files.col}`).stats(), mean = st.channels.slice(0, 3).map((c) => Math.round(c.mean));
  const rs = await sharp(`${OUT}/${files.rough}`).stats();
  out[name] = { ...files, px: N, tile: s.tile, mean: '#' + mean.map((v) => v.toString(16).padStart(2, '0')).join(''), roughness: Math.round(rs.channels[0].mean / 2.55) / 100, tint: !!s.grey, bytes, source: s.source, title: s.title, authors: s.authors, licence: 'CC0-1.0' };
  console.log(name.padEnd(12), (bytes >> 10) + ' KB', out[name].mean, out[name].roughness);
}
writeFileSync(WORK + '/tex-report.json', JSON.stringify(out, null, 1));
