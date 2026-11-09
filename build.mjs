// Builds the static site into dist/: the page, its modules, the precompiled records (assets/) and their
// audio (records/). There is no bundler: the browser loads src/ as is. Records are cut ahead of time by
// lathe.mjs and committed, so this only checks that every record on the shelf has been cut.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECORDS } from './src/records.js';

const root = fileURLToPath(new URL('.', import.meta.url)), dist = join(root, 'dist');

const missing = RECORDS.map((r) => (r.tracks ? `assets/${r.id}/record.json` : 'assets/record.json')).filter((f) => !existsSync(join(root, f)));
if (missing.length) {
  console.error(`not cut yet: ${missing.join(', ')}\nrun \`npm run lathe\` (needs ffmpeg) and commit assets/`);
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
const skip = (src) => !/(\.building|\.tmp)$/.test(src);
for (const f of ['index.html', 'og.png', 'src']) cpSync(join(root, f), join(dist, f), { recursive: true, filter: skip });
// only what the shelf uses: the house record, each shelf record's cut and its audio, and the ILMC song map
for (const f of ['record.json', 'record.vis', 'record.flac', 'record.wav']) if (existsSync(join(root, 'assets', f))) cpSync(join(root, 'assets', f), join(dist, 'assets', f));
cpSync(join(root, 'assets', 'ilmc'), join(dist, 'assets', 'ilmc'), { recursive: true, filter: skip });
for (const r of RECORDS.filter((r) => r.tracks)) {
  cpSync(join(root, 'assets', r.id), join(dist, 'assets', r.id), { recursive: true, filter: skip });
  for (const k of r.tracks) cpSync(join(root, 'records', k.file), join(dist, 'records', k.file));
}
cpSync(join(root, '_headers'), join(dist, '_headers'));
console.log(`dist/: index.html, src/, assets/ (${RECORDS.length} records), records/`);
