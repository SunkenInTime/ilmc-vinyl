// Precompile records so the page does no DSP to put one on:
//   the house record (src/demo.js + any audio files in songs/)  -> lathe -> default pressing -> assets/
//   each shelf record (src/records.js, its audio in records/)   -> lathe -> default pressing -> assets/<id>/
// The pressed groove walls are stored as 16-bit DPCM (wall slope per sample) inside a lossless audio
// container, which the browser decodes natively.
// The results are committed, so the site build (build.mjs) and deploys never run this. Run it by hand after
// changing a song or the lathe: `npm run lathe` (node lathe.mjs all) re-cuts every record that is out of date,
// `node lathe.mjs` the house record, `node lathe.mjs <id> ...` just those shelf records. Needs ffmpeg.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoTracks } from './src/demo.js';
import { cut } from './src/cut.js';
import { press, makeVis, DEFAULT_CONDITION } from './src/press.js';
import { RECORDS } from './src/records.js';

const root = fileURLToPath(new URL('.', import.meta.url)), assets = join(root, 'assets'), songsDir = join(root, 'songs'), recordsDir = join(root, 'records');
const FS = 48000, SEED = 7, STEP = 0.5e-9, HOUSE_CUT = { maxExtra: 150e-6 };
const LATHE = ['lathe.mjs', 'src/demo.js', 'src/cut.js', 'src/press.js', 'src/dsp.js', 'src/geometry.js'];
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const t0 = Date.now(), log = (...a) => console.log(`[build +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
mkdirSync(assets, { recursive: true });

// one lathe at a time: if two are started, the second just leaves
const lock = join(assets, '.building');
try {
  const pid = +readFileSync(lock, 'utf8');
  if (pid && pid !== process.pid) { process.kill(pid, 0); log(`another build is running (pid ${pid}), leaving it to finish`); process.exit(0); }
} catch {}   // no lock, or the build that held it is gone
writeFileSync(lock, String(process.pid));
process.on('exit', () => { try { rmSync(lock); } catch {} });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(1));

// ---- songs ----
function decode(file, title) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(FS), 'pipe:1'], { maxBuffer: Infinity });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const f = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + (r.stdout.byteLength & ~3)));
  const n = f.length >> 1, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return { L, R, title: title ?? basename(file, extname(file)).replace(/^\d+[\s._-]+/, '') };
}
function songs() {
  try { return readdirSync(songsDir).filter((f) => /\.(wav|flac|mp3|m4a|aac|ogg|opus|aiff?)$/i.test(f)).sort(); } catch { return []; }
}
function houseTracks() {
  const tracks = demoTracks(FS), files = songs();
  if (files.length && !ffmpeg) log('songs/ has audio files but ffmpeg is not installed; skipping them');
  else for (const f of files) tracks.push(decode(join(songsDir, f)));
  return tracks;
}

// ---- containers ----
function container(out, name, pcm, fmt) {     // pcm: Buffer of interleaved stereo little-endian samples
  if (ffmpeg) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', fmt, '-ar', String(FS), '-ac', '2', '-i', 'pipe:0', '-c:a', 'flac', '-compression_level', '8', join(out, name + '.flac')], { input: pcm, maxBuffer: Infinity });
    if (r.status === 0) return name + '.flac';
    log('ffmpeg flac encode failed, writing wav instead:', String(r.stderr).trim());
  }
  const bytes = fmt === 's16le' ? 2 : 3, h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(FS, 24); h.writeUInt32LE(FS * 2 * bytes, 28); h.writeUInt16LE(2 * bytes, 32); h.writeUInt16LE(8 * bytes, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(join(out, name + '.wav'), Buffer.concat([h, pcm]));
  return name + '.wav';
}

// ---- one record: tracks -> out/record.{flac,vis,json} (+ out/source.flac when keepSource) ----
function build({ id, out, load, cutOpts, keepSource }) {
  mkdirSync(out, { recursive: true });
  const tracks = load();
  log(`${id}: ${tracks.length} tracks:`, tracks.map((t) => `${t.title} (${(t.L.length / FS).toFixed(0)}s)`).join(', '));

  // The lathe. What ships is the CLEAN cut: the walls as closed-loop 16-bit DPCM in 0.5 nm steps, so the
  // decoded wall is within a quarter of a nanometre of the cut one everywhere. The pressing (wall roughness,
  // dust, scratches, groove echo) is random but seeded, so it is not downloaded: the page presses the decoded
  // cut itself with the same seed. Roughly half of the old file was that noise.
  const rec = cut(tracks, FS, cutOpts);
  const { wallIn, wallOut, n } = rec;
  let peak = 0;
  for (const w of [wallIn, wallOut]) for (let i = 1; i < n; i++) { const d = Math.abs(w[i] - w[i - 1]); if (d > peak) peak = d; }
  const gain = Math.max(STEP, peak * 1.02 / 32767), q = new Int16Array(2 * n);
  let err2 = 0, errMax = 0;
  [wallIn, wallOut].forEach((w, ch) => {
    let d = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.max(-32767, Math.min(32767, Math.round((w[i] - d) / gain)));
      q[2 * i + ch] = s; d += s * gain;
      const e = Math.abs(d - w[i]); err2 += e * e; if (e > errMax) errMax = e;
      w[i] = d;                                  // from here on, work with exactly what the page will decode
    }
  });
  const walls = container(out, 'record', Buffer.from(q.buffer), 's16le');
  log(`${id}: cut: ${(rec.thetaEnd / (2 * Math.PI)).toFixed(0)} revolutions, ${n} groove samples${rec.truncated ? ' (programme truncated to fit one side)' : ''}`);
  log(`${id}: walls -> ${walls}: step ${(gain * 1e9).toFixed(3)} nm, error rms ${(Math.sqrt(err2 / (2 * n)) * 1e9).toFixed(3)} nm, max ${(errMax * 1e9).toFixed(3)} nm`);

  // the default pressing, only to draw the disc (record.vis) and to record its scratches / warp in the manifest
  press(rec, DEFAULT_CONDITION, SEED);
  const vis = makeVis(rec);

  // the songs themselves (24-bit), only fetched if the record is pressed again with other settings.
  // Shelf records skip this: their master tape is already the audio in records/.
  let source;
  if (keepSource) {
    const total = tracks.reduce((a, t) => a + t.L.length, 0), pcm = Buffer.alloc(total * 6);
    let o = 0;
    for (const t of tracks) for (let i = 0; i < t.L.length; i++) {
      pcm.writeIntLE(Math.round(Math.max(-1, Math.min(1, t.L[i])) * 8388607), o, 3); pcm.writeIntLE(Math.round(Math.max(-1, Math.min(1, t.R[i])) * 8388607), o + 3, 3); o += 6;
    }
    source = { file: container(out, 'source', pcm, 's24le'), tracks: tracks.map((t) => ({ title: t.title, n: t.L.length })) };
  }
  writeFileSync(join(out, 'record.vis'), Buffer.from(vis.data.buffer, vis.data.byteOffset, vis.data.byteLength));

  const manifest = {
    version: 2, id, built: new Date().toISOString(), fs: FS, walls, gain, n, press: { seed: SEED, cond: DEFAULT_CONDITION },
    vis: { file: 'record.vis', cols: vis.cols, rows: vis.rows },
    source, cutOpts, seed: SEED,
    rec: {
      fs: rec.fs, spr: rec.spr, n, thetaEnd: rec.thetaEnd, thetaLock: rec.thetaLock, W: rec.W, Vfs: rec.Vfs, deEssDb: rec.deEssDb, truncated: rec.truncated,
      tracks: rec.tracks, ecc: rec.ecc, warp: rec.warp, scratches: rec.scratches, condition: rec.condition,
    },
    rTab: Array.from(rec.rTab),
  };
  writeFileSync(join(out, 'record.json.tmp'), JSON.stringify(manifest));
  renameSync(join(out, 'record.json.tmp'), join(out, 'record.json'));      // manifest last, atomically
  const mb = (f) => (statSync(join(out, f)).size / 1e6).toFixed(1) + ' MB';
  log(`${id}: done: ${walls} ${mb(walls)}${source ? `, ${source.file} ${mb(source.file)}` : ''}, record.vis ${mb('record.vis')}, record.json ${mb('record.json')}`);
}

// ---- what to build ----
const jobs = [
  { id: 'house', out: assets, inputs: [...LATHE, 'songs', ...songs().map((f) => 'songs/' + f)], load: houseTracks, cutOpts: HOUSE_CUT, keepSource: false },   // pressing again no longer needs the tape
  ...RECORDS.filter((r) => r.tracks).map((r) => ({
    id: r.id, out: join(assets, r.id), inputs: [...LATHE, 'src/records.js', ...r.tracks.map((k) => 'records/' + k.file)],
    load: () => r.tracks.map((k) => decode(join(recordsDir, k.file), k.title)), cutOpts: r.cut || {}, keepSource: false,
  })),
];
const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };
const fresh = (j) => mtime(join(j.out, 'record.json')) > Math.max(...j.inputs.map((f) => mtime(join(root, f))));
const args = process.argv.slice(2), all = args.includes('all'), want = args.length ? args : ['house'];
for (const id of want) if (id !== 'all' && !jobs.some((j) => j.id === id)) log(`no such record: ${id} (have: ${jobs.map((j) => j.id).join(', ')})`);
for (const j of jobs) {
  if (all ? fresh(j) : !want.includes(j.id)) continue;
  if (j.id !== 'house' && !ffmpeg) { log(`${j.id}: skipped, ffmpeg is not installed`); continue; }
  try { build(j); } catch (err) { log(`${j.id}: failed:`, err.message || err); process.exitCode = 1; }
}
