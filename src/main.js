// UI: wires the renderer, the mastering worker and the audio-thread physics engine together.
import { Renderer } from './render.js';
import { TAU } from './dsp.js';
import { RECORDS } from './records.js';
import { press, makeVis } from './press.js';
import { PIVOT_X, PIVOT_Y, ALPHA_REST, R_DISC, R_LABEL, R_LEADIN, W33, alphaForRadius, stylusXY, grooveRadius } from './geometry.js';
import { ILMC } from './ilmc/index.js';
import { ilmcLabel } from './ilmc/label.js';
import { setLabelArt } from './label.js';
import { art } from './ilmc/art.js';
import { readMeta } from './ilmc/meta.js';
import { envelope, match } from './ilmc/match.js';
import { sfx } from './ilmc/sfx.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), renderer = new Renderer(canvas);
// ?og (the share image) and ?plain (the deck on its own) skip the room
const PLAIN = /[?&](og|plain)(&|$)/.test(location.search);
const reduceFlashing = () => { try { const v = localStorage.getItem('ilmc-flash'); return v ? v === 'off' : matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const PRIV = window.__private;   // see index.html
const root = document.documentElement;
const ilmc = PLAIN ? null : new ILMC(renderer.gl, canvas, { overlay: $('words'), reduceFlashing: reduceFlashing() });
// the label: the ILMC picture label with the visitor's own album art, when the record in the drive is the song
setLabelArt(() => (!PLAIN && S.matched ? ilmcLabel(art.img, art.has()) : null));
art.on(() => { if (renderer.titles) renderer.setLabel(renderer.titles); });
let masterWorker = null;      // the lathe + pressing plant; only started if something has to be mastered in the browser
const worker = { postMessage: (m, transfer) => { busy(); (masterWorker ||= startWorker()).postMessage(m, transfer || []); } };
// The progress bar (index.html) shows window.__load: a download with got/total, or just "busy" when the size is unknown.
const busy = (h = { got: 0, total: 0 }) => (window.__load = h);
const idle = () => { if (window.__load) window.__load.done = true; };
const AZ0 = -0.5, EL0 = PLAIN_CAM() ? 0.6 : 0.86, ZOOM0 = PLAIN_CAM() ? 0 : -1.35;   // default camera: pulled back to see the room
function PLAIN_CAM() { return /[?&](og|plain)(&|$)/.test(location.search); }
const S = { hudOn: false, lastDown: 0, tel: null, tRecv: 0, zoom: ZOOM0, zoomT: ZOOM0, az: AZ0, el: EL0, rpm: 33.3333, rec: null, pending: null, motor: false, cue: true, ready: false };
let ctx = null, node = null, drag = null;
// ?og renders just the deck on black, with no interface and no audio: it is how og.png (the share image) is made
const OG = new URLSearchParams(location.search).has('og');
if (OG) document.documentElement.classList.add('og');
let pick = 0;   // bumps each time a record is chosen, so an older, slower cut cannot land on top of a newer choice
const send = (m, transfer) => { if (node) node.port.postMessage(m, transfer || []); };
const status = (msg) => { $('status').textContent = msg; };   // empty when nothing is happening
const notice = (msg) => { status(msg); clearTimeout(S.noticeT); S.noticeT = setTimeout(() => { if ($('status').textContent === msg) status(''); }, 5000); };

// ---------- mastering ----------
const condition = () => Object.fromEntries(['noise', 'dust', 'scratches', 'warp', 'offCenter'].map((k) => [k, +$('c-' + k).value]));
function startWorker() {
  const w = new Worker(new URL('./master-worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data: m }) => {
    if (m.t === 'status') { status(m.msg + '...'); if (S.fileCut) cutStage(/press/i.test(m.msg) ? 'press' : 'cut'); }
    else if (m.t === 'error') { idle(); status('Mastering failed: ' + m.msg); console.error(m.msg); if (S.fileCut) { S.fileCut = 0; sfx.error(); insertState('error', { err: 'Cutting failed: ' + m.msg }); } }
    else if (m.t === 'done') { if (m.id == null || m.id === pick) { gotRecord(m.rec, m.vis); if (S.fileCut === pick) { S.fileCut = 0; fileReady(); } } }
  };
  return w;
}
function gotRecord(rec, vis) {
  renderer.setRecord(rec, vis);
  idle();
  showRoom();
  S.pending = rec; S.pendingPick = pick;          // gotRecord only ever runs for the current pick
  status(rec.truncated ? 'Programme was too long for one side and was cut short.' : '');
  $('d-points').textContent = (rec.n / 1e6).toFixed(1) + ' million';
  loadRecord();
}
function loadRecord() {
  if (!S.ready || !S.pending) return;
  const rec = S.pending; S.pending = null;
  // what the track readout maps the needle onto; seq comes back in the telemetry once the audio thread has it,
  // so a packet about the previous record can't be read against this one
  S.rec = { tracks: rec.tracks, thetaLock: rec.thetaLock, pick: S.pendingPick, seq: S.recSeq = (S.recSeq || 0) + 1 };
  S.rtab = rec.rTab;
  send({ t: 'cue', up: true });
  send({ t: 'record', rec, seq: S.rec.seq }, [rec.wallIn.buffer, rec.wallOut.buffer]);
  S.loaded = true;
  if (S.started) play(); else start();
}
const play = () => { cancelSeek(); hideEnd(); setMotor(true); setTimeout(() => send({ t: 'cueTo', al: alphaForRadius(R_LEADIN - 0.0012) }), 400); };
// The room fades in a frame after it has first been drawn. The public page shows it straight away (there is no record
// until the visitor brings one); the private copy waits for its record, so the deck and the disc appear together.
function showRoom() {
  if (S.shown) return;
  S.shown = true;
  const go = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('ready')));
  if (ilmc) ilmc.whenWarm.then(go); else go();      // the room fades in once its shaders are built (it builds them without freezing the page)
}
// Nothing moves until all three are true: the user powered on, the engine is warm, and a record is in it.
function start() {
  if (!S.on || !S.ready || !S.loaded || S.started) return;
  S.started = true; root.classList.remove('powering', 'browse'); root.classList.add('started'); $('insert').hidden = false; play();
}

// ---------- precompiled record (lathe.mjs): the clean cut ships as DPCM; decode it, press it here, go ----------
const decodeAudio = async (url, fs) => new OfflineAudioContext(2, 1, fs).decodeAudioData(await (await fetch(url)).arrayBuffer());   // for mastering here
// Start every download for a record at once and expose how far the big one is.
function fetchRecord(dir) {
  const h = { dir, got: 0, total: 0 };
  h.man = fetch(dir + 'record.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('no precompiled record'); return r.json(); });
  h.audio = h.man.then(async (man) => {
    const r = await fetch(dir + man.walls);
    if (!r.ok) throw new Error('no precompiled record');
    h.total = +r.headers.get('content-length') || 0;
    let buf;
    if (r.body) {
      const reader = r.body.getReader(), chunks = [];
      for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); h.got += value.length; }
      buf = await new Blob(chunks).arrayBuffer();
    } else buf = await r.arrayBuffer();
    return new OfflineAudioContext(2, 1, man.fs).decodeAudioData(buf);
  });
  h.vis = h.man.then((man) => fetch(dir + man.vis.file).then((r) => r.arrayBuffer()));
  for (const k of ['man', 'audio', 'vis']) h[k].catch(() => {});
  return h;
}
// The opening record is already on its way: index.html starts these fetches before any module loads.
function takeBoot(dir) {
  const b = window.__boot;
  if (!b || b.dir !== dir || b.used) return null;
  b.used = true; return b;
}
async function loadPrecompiled(dir = 'assets/', me = pick, pressing = null) {     // dir: assets/ (house record) or assets/<id>/ (a shelf record)
  let h = takeBoot(dir) || fetchRecord(dir), man = await h.man;
  if (man.version !== 2) throw new Error('precompiled record is in an old format');
  if (h === window.__boot && man.walls !== 'record.flac') { h = fetchRecord(dir); man = await h.man; }
  S.load = busy(h);
  const [audio, visData] = await Promise.all([h.audio, h.vis]);
  if (me !== pick) return;                      // another record was chosen meanwhile
  if (audio.length < man.n || audio.sampleRate !== man.fs) throw new Error('precompiled record does not match its manifest');
  const unpack = (q) => {                       // 16-bit DPCM of the wall slope -> wall displacement (m)
    const w = new Float32Array(man.n); let d = 0;
    for (let i = 0; i < 4096; i++) { const x = q[i] * 32768; if (Math.abs(x - Math.round(x)) > 0.01) throw new Error('this browser did not decode the record losslessly'); }
    for (let i = 0; i < man.n; i++) { d += Math.round(q[i] * 32768) * man.gain; w[i] = d; }
    return w;
  };
  const rec = { ...man.rec, rTab: Float64Array.from(man.rTab), wallIn: unpack(audio.getChannelData(0)), wallOut: unpack(audio.getChannelData(1)) };
  // the pressing plant: roughness, dust, scratches and echo are seeded, so they are made here instead of downloaded
  press(rec, pressing?.cond ?? man.press.cond, pressing?.seed ?? man.press.seed);
  S.man = man; S.manDir = dir; S.load = null;
  gotRecord(rec, pressing ? makeVis(rec) : { data: new Uint8Array(visData), cols: man.vis.cols, rows: man.vis.rows });
}
function houseRecord() {                        // "Demo EP" on the shelf: assets/, or synthesised and mastered here
  S.workerHasSource = false;
  return loadPrecompiled().catch((err) => {     // not built (or stale): master it here instead
    console.info((err.message || err) + '; mastering in the browser');
    S.man = null; worker.postMessage({ t: 'demo', fs: 48000, cond: condition() });
  });
}
// Pressing again: a precompiled record is pressed here from the same cut (re-read from the browser cache);
// one mastered in the browser goes back to the worker, which still has the tape.
async function pressAgain() {
  const cond = condition(), seed = 1 + Math.floor(Math.random() * 1e6);
  if (!S.man) return worker.postMessage({ t: 'press', cond, seed });
  const me = ++pick;
  try { await loadPrecompiled(S.manDir, me, { cond, seed }); }
  catch (err) { console.error(err); if (me === pick) { idle(); status('Could not press that record again.'); } }
}

// ---------- audio ----------
// The engine is created (and its JIT warm-up runs) as soon as the page loads. The context just stays
// suspended until the first click, so "power on" is normally instant.
let audioInit = null;
function initAudio() {
  return audioInit ||= (async () => {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
    node = new AudioWorkletNode(ctx, 'turntable', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    node.port.onmessage = ({ data: m }) => {
      if (m.t === 'tel') { S.tel = m; S.tRecv = performance.now(); if (m.view) S.view = m.view; S.cue = m.cueUp; }
      else if (m.t === 'ready') {
        S.ready = true; pushParams(); send({ t: 'view', on: true }); loadRecord(); start();
        $('d-rate').textContent = (m.os * m.fs).toLocaleString('en-US');
      } else if (m.t === 'log') console.warn(m.msg);
    };
    node.connect(ctx.destination);
    ilmc?.attachAudio(ctx, node);
    if (!S.on && ctx.state === 'running') await ctx.suspend();   // some browsers start it unasked; stay silent until power-on
  })().catch((err) => { audioInit = null; ctx = null; node = null; throw err; });
}
const POWER_MSG = matchMedia('(pointer: coarse)').matches ? 'tap to power on' : 'click to power on';
async function powerOn() {
  if (S.on) return;
  S.on = true; root.classList.add('powering');      // a spinner until the engine is warm AND the record is in it
  if ($('insert')?.dataset.state === 'cutting') S.waitCut = true;
  powerMsg();
  try {
    if (ctx) ctx.resume().catch(() => {});            // straight away, inside the gesture: iOS only honours it there
    await initAudio();
    // If the browser did not count this event as a user gesture, resume() never settles. Do not hang on it:
    // give up after a moment and go back to waiting, so the next tap can try again.
    if (ctx.state !== 'running') await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 3000))]);
    if (ctx.state !== 'running') throw new Error('not started');
    start();
  } catch (err) {
    S.on = false; root.classList.remove('powering');
    if ($('power-msg')) $('power-msg').textContent = err.message === 'not started' ? POWER_MSG : 'audio failed: ' + err.message;
    if (err.message !== 'not started') console.error(err);
  }
}
// What the power button says while we wait (the progress bar itself is driven from index.html).
function powerMsg() {
  const el = $('power-msg');
  if (el && S.on && !S.started) el.textContent = $('status').textContent.replace(/\.+$/, '') || (S.loaded ? (S.ready ? 'starting' : 'warming up') : 'loading the record');
}
$('power-msg').addEventListener('click', powerOn);   // the pill (shown while warming up); the insert window's buttons power on too
$('power-msg').textContent = POWER_MSG;
if (!OG) initAudio().catch(() => {});   // best effort before any gesture; the click retries if the browser refused

// ---------- controls ----------
function setMotor(on) { S.motor = on; send({ t: 'motor', on }); $('b-start').textContent = on ? 'Stop' : 'Start'; $('b-start').classList.toggle('on', on); }
function pushParams() {
  // 100% on the slider is 2 dB under unity: the cartridge lifts the treble by up to 1.9 dB, and bright peaks would clip
  send({ t: 'set', volume: 0.8 * +$('p-volume').value, stylus: $('p-stylus').value, vtf: +$('p-vtf').value, antiskate: +$('p-antiskate').value, hum: +$('p-hum').value });
}
for (const el of document.querySelectorAll('#ctl input[type=range]')) {
  const out = el.parentElement.querySelector('output'), show = () => { out.textContent = el.id === 'p-volume' ? Math.round(el.value * 100) + '%' : (+el.value).toFixed(2); };
  el.addEventListener('input', () => { show(); if (el.id.startsWith('p-')) pushParams(); }); show();
}
$('p-stylus').addEventListener('change', pushParams);
const toggle = (btn, panel, onChange) => $(btn).addEventListener('click', () => {
  const open = $(panel).hidden; $(panel).hidden = !open; $(btn).setAttribute('aria-pressed', String(open)); if (onChange) onChange(open);
});
toggle('t-ctl', 'ctl', (open) => { if (open && !$('shelf').hidden) $('t-records').click(); });      // one panel in that corner at a time
toggle('t-records', 'shelf', (open) => { if (open && !$('ctl').hidden) $('t-ctl').click(); });
// tapping anywhere outside an open panel closes it, and that tap does nothing else (it won't drop the needle
// or grab the record), so the toggles and a tap on the scene both work as open / close; so does Escape
const PANELS = [['ctl', 't-ctl'], ['shelf', 't-records']];
const panelOpen = () => PANELS.some(([p]) => !$(p).hidden) || !!document.querySelector('dialog[open]');
addEventListener('pointerdown', (e) => {
  let closed = false;
  for (const [panel, btn] of PANELS) if (!$(panel).hidden && !$(panel).contains(e.target) && !$(btn).contains(e.target) && !e.target.closest?.('dialog')) { $(btn).click(); closed = true; }
  if (closed && e.target === canvas) e.stopPropagation();
}, true);
$('t-reset').addEventListener('click', () => {      // ease the camera back to where it started
  S.zoomT = ZOOM0; S.resetting = true;
  S.az = AZ0 + ((((S.az - AZ0 + Math.PI) % TAU) + TAU) % TAU) - Math.PI;   // unwind full turns first
});
const openDialog = (id) => { const d = $(id); if (d.open) return; d.showModal(); d.querySelector('.page').scrollTop = 0; sfx.open(); };
$('b-more').addEventListener('click', () => openDialog('more'));
for (const b of ['b-keys', 'b-keys2']) $(b).addEventListener('click', () => { $('more').close(); openDialog('keys'); });
for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });   // click outside closes
for (const b of document.querySelectorAll('[data-dialog-close]')) b.addEventListener('click', () => b.closest('dialog').close());
$('b-start').addEventListener('click', () => setMotor(!S.motor));
// interface sounds: a click for buttons (not the ones that open the file picker: the drive makes its own noise)
document.addEventListener('click', (e) => { if (e.target.closest('button, a.btn') && !e.target.closest('#b-insert, #b-other, #tp-insert, .insert, #tl')) sfx.click(); }, true);
document.addEventListener('change', (e) => { if (e.target.type === 'checkbox') sfx.tick(); }, true);
$('b-sfx').checked = sfx.on; $('b-sfx').addEventListener('change', () => sfx.set($('b-sfx').checked));
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => $(b.dataset.close).click());
// Flashing: the room's strobes, flashes and glitches. Remembered; the first visit follows prefers-reduced-motion.
function showFlash() {
  const on = ilmc && !ilmc.reduce;
  $('t-flash').textContent = on ? 'Flashing on' : 'Flashing off'; $('t-flash').setAttribute('aria-pressed', String(on));
  $('calm').checked = !on;
}
function setFlash(on) { if (!ilmc) return; ilmc.reduce = !on; try { localStorage.setItem('ilmc-flash', on ? 'on' : 'off'); } catch {} showFlash(); }
if (ilmc) {
  showFlash();
  $('t-flash').addEventListener('click', () => setFlash(ilmc.reduce));
  $('calm').addEventListener('change', () => setFlash(!$('calm').checked));
} else { $('t-flash').hidden = true; for (const el of document.querySelectorAll('#insert .warn')) el.remove(); }
// groove.exe: closed with its own close box, back with G or from Controls; remembered
function showHud(on) { $('hud').hidden = !on; $('b-hud').checked = on; try { localStorage.setItem('ilmc-hud', on ? 'on' : 'off'); } catch {} }
showHud((() => { try { return localStorage.getItem('ilmc-hud') !== 'off'; } catch { return true; } })());
$('hud-x').addEventListener('click', () => showHud(false));
$('b-hud').addEventListener('change', () => showHud($('b-hud').checked));
$('b-cue').addEventListener('click', () => { cancelSeek(); send({ t: 'cue', up: !S.cue }); });
$('b-bump').addEventListener('click', () => send({ t: 'bump', s: 1 }));
$('b-press').addEventListener('click', pressAgain);
for (const b of document.querySelectorAll('[data-rpm]')) {
  b.addEventListener('click', () => { document.querySelectorAll('[data-rpm]').forEach((x) => x.classList.toggle('on', x === b)); S.rpm = +b.dataset.rpm; send({ t: 'speed', rpm: S.rpm }); });
}

// ---------- bring your own copy ----------
// The file is decoded, cut and pressed here, in this browser; nothing is uploaded. Its tags and art come from the file.
// If its loudness over time matches the song map, the room plays along to the song (assets/ilmc/fmc.json).
const AUDIO = /\.(mp3|flac|wav|wave|m4a|mp4|aac|alac|ogg|oga|opus|aif|aiff|webm|weba)$/i;
let fmc = null;
const songMap = () => (fmc ||= fetch('assets/ilmc/fmc.json').then((r) => { if (!r.ok) throw new Error('no map'); return r.json(); })
  .then((m) => Object.assign(m, { envBytes: Uint8Array.from(atob(m.env), (c) => c.charCodeAt(0)) })));
if (!PLAIN) songMap().catch(() => {});
// The Insert disc window. Before the music starts it is the first thing on screen; afterwards it only comes back while
// another file is being cut, or to say that one could not be read.
function insertState(state, extra = {}) {
  const el = $('insert'); if (!el) return;
  el.dataset.state = state;
  root.classList.toggle('cutting', state === 'cutting');
  if (S.started) el.classList.toggle('open', state === 'cutting' || state === 'error');
  if (state !== 'idle' && state !== 'loading') { el.hidden = false; root.classList.remove('browse'); }
  if (extra.err) $('insert-err').textContent = extra.err;
  if (extra.title != null) $('insert-title').textContent = extra.title;
  if (extra.note != null) $('insert-note').textContent = extra.note;
  el.classList.toggle('has-art', state === 'ready' && art.has());
  if (state === 'ready' && art.has()) $('insert-art').src = art.url;
  // the default button: dropping the needle, unless the record is not the song (then choosing another comes first)
  if (state === 'ready') {
    const mine = extra.wrong;
    $('b-play').textContent = mine ? 'Play it anyway' : 'Drop the needle'; $('b-other').textContent = mine ? 'Choose another file...' : 'Choose another';
    $('b-play').classList.toggle('def', !mine); $('b-other').classList.toggle('def', !!mine);
    $('b-play').parentElement.append(mine ? $('b-other') : $('b-play'));     // the default button sits on the right
  }
  if (state === 'cutting') cutStage('read');
  updateTransport();
}
// The progress bar while a file is cut. The steps report when they start but not how far along they are, so each step
// eases toward its share of the bar over about as long as it usually takes (measured on a 3 min song).
const STAGES = { read: [0, 0.05, 0.3], decode: [0.05, 0.2, 1.2], match: [0.2, 0.26, 0.4], cut: [0.26, 0.9, 4], press: [0.9, 0.98, 1.2] };
function cutStage(k) { S.stage = { k, t0: performance.now() }; $('insert-status').textContent = { read: 'Reading the file', decode: 'Decoding', match: 'Listening for the song', cut: 'Cutting the lacquer', press: 'Pressing the record' }[k]; }
function drawProgress() {
  const st = S.stage; if (!st || $('insert').dataset.state !== 'cutting') return;
  const [a, b, d] = STAGES[st.k], f = a + (b - a) * (1 - Math.exp(-(performance.now() - st.t0) / 1000 / d));
  $('insert-prog').style.width = (f * 100).toFixed(1) + '%';
}
async function cutFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('audio/') || f.type.startsWith('video/') || AUDIO.test(f.name));
  if (!list.length) { sfx.error(); insertState('error', { err: "That doesn't look like an audio file." }); return; }
  const me = ++pick; S.fileCut = me; sfx.insert();
  insertState('cutting');
  const tracks = [], transfer = []; let first = null;
  for (const f of list) {
    try {
      const buf = await f.arrayBuffer();
      const tags = first ? {} : readMeta(buf);                         // before decoding: decoding detaches the buffer
      cutStage('decode');
      const ab = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(buf);
      if (me !== pick) return;
      if (!first) first = { tags, env: envelope(ab), dur: ab.duration };
      const L = ab.getChannelData(0).slice(), R = ab.numberOfChannels > 1 ? ab.getChannelData(1).slice() : L.slice();
      tracks.push({ L, R, title: (tracks.length ? '' : tags.title) || f.name.replace(/\.[^.]+$/, '') }); transfer.push(L.buffer, R.buffer);
    } catch (err) { console.error(err); }
  }
  if (!tracks.length) {
    sfx.error(); const msg = `This browser can't read ${list[0].name}. Try an MP3, FLAC, WAV or M4A.`;
    insertState('error', { err: msg });
  }
  // is it the song?
  cutStage('match');
  let m = { r: 0, lag: 0 }, map = null;
  if (ilmc) { try { map = await songMap(); m = match(first.env, map.envBytes); } catch (err) { console.warn(err); } }
  if (me !== pick) return;
  S.matched = !!map && m.r > 0.8;
  const t = first.tags, title = t.title || (S.matched ? map.track.title : tracks[0].title);
  art.set({ title, artist: t.artist || (S.matched ? map.track.artist : ''), album: t.album || (S.matched ? map.track.album : ''), dur: first.dur, pic: t.pic || null });
  ilmc?.setSong(S.matched ? map : null, m.lag);
  console.info(`match r=${m.r.toFixed(3)} lag=${m.lag.toFixed(2)}s`);
  S.workerHasSource = true; S.man = null; markRecord(null); S.recTitle = title; nowPlaying(title);
  cutStage('cut');
  worker.postMessage({ t: 'tracks', id: me, tracks, fs: 48000, cond: condition() }, transfer);
}
// called once the visitor's record is cut and pressed
function fileReady() {
  const title = art.title || 'Your record';
  if (S.matched) { sfx.match(); insertState('ready', { title: `${title}${art.artist ? ' · ' + art.artist : ''}`, note: art.has() ? 'Recognised. The room knows this one.' : 'Recognised. The room knows this one. (Your file has no cover art, so the label is plain.)' }); }
  else { sfx.open(); insertState('ready', { wrong: true, title, note: "This isn't Fuck My Computer, as far as the page can tell. It will play, but the room only knows that one song." }); }
  if (S.started) notice(S.matched ? `${title}: recognised` : `${title}: playing, but the room doesn't know this one`);
}
const pickFile = () => $('f-audio').click();
for (const b of ['b-insert', 'b-other']) $(b).addEventListener('click', pickFile);
$('b-play').addEventListener('click', (e) => { e.stopPropagation(); powerOn(); });
// no copy of the song: one record from the shelf, straight onto the platter (it downloads now, about 9 MB)
const DEMO = RECORDS.find((r) => r.id === 'mountain-king') || RECORDS[0];
$('b-demo').addEventListener('click', (e) => { e.stopPropagation(); pickRecord(DEMO); powerOn(); });
// its close box: look around the room first; the transport offers the disc again
$('insert-x').addEventListener('click', () => {
  if (S.started) { $('insert').classList.remove('open'); return; }
  $('insert').hidden = true; root.classList.add('browse'); updateTransport();
});
$('tp-insert').addEventListener('click', () => { if (!S.started && $('insert').hidden) { $('insert').hidden = false; root.classList.remove('browse'); updateTransport(); } else pickFile(); });
$('f-audio').addEventListener('cancel', () => { if ($('insert')?.dataset.state === 'cutting') insertState('idle'); });

// ---------- record shelf: free-to-ship recordings (src/records.js, audio in records/), precompiled into assets/<id>/ ----------
const list = $('shelf-list'), credit = $('shelf-note');
// What is on the platter, for the transport and the tab: the record, or while a track plays its title.
function nowPlaying(title) {
  if (title === S.nowTitle && S.started === S.nowStarted) return;
  S.nowTitle = title; S.nowStarted = S.started;
  document.title = title && S.started ? `${title} · I Love My Computer` : 'I Love My Computer';
  updateTransport();
}
function markRecord(r) {
  S.shelf = r?.tracks ? r : null;
  S.recTitle = r ? r.title : 'Your audio'; S.recBy = r ? r.by : ''; nowPlaying(S.recTitle);
  for (const b of list.querySelectorAll('button[data-id]')) b.setAttribute('aria-current', String(b.dataset.id === r?.id));
  credit.replaceChildren(r ? [r.credit, r.licence].filter(Boolean).join(' · ') : 'Your own copy, cut in this browser');
  if (r?.url) credit.append(' · ', Object.assign(document.createElement('a'), { href: r.url, target: '_blank', rel: 'noopener', textContent: 'source' }));
}
async function pickRecord(r) {
  const me = ++pick;
  markRecord(r);
  ilmc?.setSong(null); S.matched = false; S.fileCut = 0;          // the shelf's records have no map: the room follows their kicks
  art.set({ title: r.title, artist: r.by });
  if (!r.tracks) return houseRecord();
  S.workerHasSource = false;
  try {
    await loadPrecompiled(r.dir || `assets/${r.id}/`, me);
    if (r.priv && me === pick) {                  // the private copy: it is the song, so the room gets its map and the cover
      const map = await songMap(), pic = await fetch(r.priv.cover).then((x) => (x.ok ? x.blob() : null)).catch(() => null);
      if (me !== pick) return;
      S.matched = true; ilmc?.setSong(map, 0);
      art.set({ title: r.title, artist: r.by, album: r.priv.album, dur: map.dur, pic });
      insertState('ready', { title: `${r.title} · ${r.by}`, note: 'Private copy on this machine.' });
    }
  }
  catch (err) {                                 // not built (or stale): cut and press it here instead, which takes a while
    console.info(`${r.title}: ${err.message || err}; mastering in the browser`);
    if (me === pick) { S.man = null; master(r, me); }
  }
}
async function master(r, me, seed) {            // the slow way: fetch the audio, then lathe and pressing plant in the worker
  try {
    busy();
    const tracks = [], transfer = [];
    for (const k of r.tracks) {
      status(`Fetching ${k.title}...`);
      const ab = await decodeAudio(new URL('../records/' + k.file, import.meta.url), 48000);
      if (me !== pick) return;
      const L = ab.getChannelData(0).slice(), R = ab.numberOfChannels > 1 ? ab.getChannelData(1).slice() : L.slice();
      tracks.push({ L, R, title: k.title }); transfer.push(L.buffer, R.buffer);
    }
    S.workerHasSource = true;
    worker.postMessage({ t: 'tracks', id: me, tracks, fs: 48000, opts: r.cut, cond: condition(), seed }, transfer);
  } catch (err) { console.error(err); if (me === pick) { idle(); status(`Could not load ${r.title}.`); } }
}
// the shelf: your own copy first, then the public-domain records (each one downloads when it is picked)
const shelfItem = (title, by, click, id) => {
  const b = document.createElement('button'); if (id) b.dataset.id = id;
  b.append(Object.assign(document.createElement('b'), { textContent: title }), Object.assign(document.createElement('span'), { textContent: by }));
  b.addEventListener('click', () => { click(); b.blur(); });
  list.appendChild(document.createElement('li')).append(b);
  return b;
};
shelfItem('Insert your copy...', 'Fuck My Computer', () => { $('t-records').click(); pickFile(); }).className = 'insert';
for (const r of RECORDS) shelfItem(r.title, r.by, () => { pickRecord(r); if (!S.on) powerOn(); }, r.id);
// the record on the platter when the page opens: the private copy on a dev server, otherwise none until the visitor brings one
if (PRIV) { insertState('loading'); pickRecord({ id: PRIV.id, title: PRIV.title, by: PRIV.artist, dir: PRIV.dir, priv: PRIV, tracks: [{ title: PRIV.title }], credit: 'Private copy' }); }
else credit.textContent = 'The records here are public domain or freely licensed. Each one downloads when you pick it.';
$('f-audio').addEventListener('change', (e) => { if (e.target.files.length) cutFiles(e.target.files); e.target.value = ''; });   // cleared, so the same file can be chosen again
let dragN = 0;
addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragN++; document.documentElement.classList.add('dragging'); } });
addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; document.documentElement.classList.remove('dragging'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); dragN = 0; document.documentElement.classList.remove('dragging'); if (e.dataTransfer?.files?.length) cutFiles(e.dataTransfer.files); });
// keyboard (the list is in the Keyboard shortcuts window: ? or Controls)
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (root.classList.contains('bare')) setBare(false);
    for (const [panel, btn] of PANELS) if (!$(panel).hidden) $(btn).click();
    return;
  }
  const t = e.target;
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || document.querySelector('dialog[open]')) return;
  if ((e.key === ' ' || e.key === 'Enter') && t.closest?.('button, a')) return;     // the focused button gets it
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === ' ') { e.preventDefault(); playPause(); }
  else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); if (S.started) seek(Math.max(0, (S.seekTo ? S.seekTo.sec : S.pos || 0) + (k === 'ArrowLeft' ? -10 : 10))); }
  else if (k === 'h') setBare(!root.classList.contains('bare'));
  else if (k === 'f') toggleFullscreen();
  else if (k === 'l') { if (ilmc) setFlash(ilmc.reduce); }
  else if (k === 'g') showHud($('hud').hidden);
  else if (k === '?') openDialog('keys');
  else if (k === 'c') { cancelSeek(); send({ t: 'cue', up: !S.cue }); }
  else if (k === 'b') send({ t: 'bump', s: 1 });
  else if (k === 'z') S.zoomT = S.zoomT > 0.5 ? ZOOM0 : 0.92;
});

// ---------- pointer: grab the headshell, spin the record, or click to drop the needle ----------
const armAngle = (p) => { const a = Math.atan2(p[1] - PIVOT_Y, p[0] - PIVOT_X); return a < 0 ? a + TAU : a; };
const curAl = () => (S.tel ? S.tel.al : ALPHA_REST);
const touches = new Map();   // active pointers, for two-finger pinch zoom
canvas.addEventListener('pointerdown', (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (touches.size === 2) {                     // a second finger: stop what the first was doing and pinch
    if (drag) drag.tap = false;
    release();
    const [a, b] = [...touches.values()];
    drag = { type: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z0: S.zoomT };
    return;
  }
  const pa = renderer.pick(e.clientX, e.clientY, 0.018), p = renderer.pick(e.clientX, e.clientY, 0);
  // until it is powered on the scene can only be looked around; a tap that doesn't drag powers it on
  const plain = S.started && S.ready && e.button === 0 && !e.shiftKey && !e.altKey;
  if (plain && pa && renderer.armDistance(pa, curAl()) < (e.pointerType === 'touch' ? 0.03 : 0.011)) {
    cancelSeek(); drag = { type: 'arm', off: curAl() - armAngle(pa) };
    send({ t: 'hand', on: true, al: curAl() });
  } else if (plain && p && Math.hypot(p[0], p[1]) < R_DISC) {
    cancelSeek(); drag = { type: 'platter', ang: Math.atan2(p[1], p[0]), moved: 0, t0: performance.now(), p };
    send({ t: 'platter', on: true });
  } else drag = { type: 'orbit', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, tap: !S.on && e.button === 0 };   // anywhere else: turn the camera
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (!drag) return;
  if (drag.type === 'pinch') {
    const [a, b] = [...touches.values()];
    if (b) S.zoomT = Math.max(-1.6, Math.min(0.985, drag.z0 + 0.6 * Math.log(Math.hypot(a[0] - b[0], a[1] - b[1]) / drag.d0)));
  } else if (drag.type === 'orbit') {
    S.az -= (e.clientX - drag.x) * 0.006; S.el = Math.max(0.02, Math.min(1.55, S.el + (e.clientY - drag.y) * 0.006)); S.resetting = false;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.tap = false;
  } else if (drag.type === 'arm') {
    const pa = renderer.pick(e.clientX, e.clientY, 0.018);
    if (pa) send({ t: 'hand', on: true, al: armAngle(pa) + drag.off });
  } else {
    const p = renderer.pick(e.clientX, e.clientY, 0); if (!p) return;
    const a = Math.atan2(p[1], p[0]);
    let d = a - drag.ang; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
    drag.ang = a; drag.moved += Math.abs(d) * Math.hypot(p[0], p[1]);
    send({ t: 'platterMove', d: -d });            // platter angle is clockwise-positive
  }
});
const release = () => {
  if (!drag) return;
  if (drag.type === 'arm') send({ t: 'hand', on: false });
  else if (drag.type === 'orbit' && drag.tap) S.tapped = performance.now();   // powers on in the click / touchend that follows
  else if (drag.type === 'platter') {
    send({ t: 'platter', on: false });
    const r = Math.hypot(drag.p[0], drag.p[1]);
    if (drag.moved < 0.003 && performance.now() - drag.t0 < 400 && r > R_LABEL + 0.002) send({ t: 'cueTo', al: alphaForRadius(r) });
  }
  drag = null; canvas.style.cursor = 'grab';
};
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, (e) => { touches.delete(e.pointerId); release(); });
// A tap on the scene powers on. It has to happen in `touchend` or `click`: iOS Safari does not accept
// `pointerup` as a gesture that may start audio, and the context would stay suspended forever.
for (const type of ['touchend', 'click']) canvas.addEventListener(type, () => {
  // (only once there is a record to play: before that the Insert disc window is the way in)
  if (!S.on && S.tapped && performance.now() - S.tapped < 800 && root.classList.contains('ready') && (S.loaded || S.pending || $('insert').dataset.state === 'ready')) { S.tapped = 0; powerOn(); }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); S.zoomT = Math.max(-1.6, Math.min(0.985, S.zoomT - e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });

// ---------- HUD ----------
const scope = $('scope'), sc = scope.getContext('2d');
function drawScope() {
  const w = scope.width, h = scope.height, v = S.view, rows = 5, cols = 160, k = (h / 2) / 95e-6;
  sc.fillStyle = '#0c0f18'; sc.fillRect(0, 0, w, h);
  sc.fillStyle = 'rgba(166,202,240,.05)'; for (let y = 0; y < h; y += 3) sc.fillRect(0, y, w, 1);   // faint scanlines
  if (!v) return;
  const X = (c) => c / (cols - 1) * w, Y = (m) => h / 2 - m * k;
  const fill = new Path2D(), edge = new Path2D();
  for (let g = 0; g < rows; g++) {
    for (let c = 0; c + 1 < cols; c++) {
      const o = (g * cols + c) * 2, a0 = v[o], b0 = v[o + 1], a1 = v[o + 2], b1 = v[o + 3];
      if (a0 !== a0 || a1 !== a1 || Y(a0) > 2 * h || Y(b0) < -h) continue;      // no groove here, or far outside the view
      const x0 = X(c), x1 = X(c + 1);
      fill.moveTo(x0, Y(a0)); fill.lineTo(x1 + 0.5, Y(a1)); fill.lineTo(x1 + 0.5, Y(b1)); fill.lineTo(x0, Y(b0)); fill.closePath();
      edge.moveTo(x0, Y(a0)); edge.lineTo(x1, Y(a1)); edge.moveTo(x0, Y(b0)); edge.lineTo(x1, Y(b1));
    }
  }
  sc.fillStyle = '#04060c'; sc.fill(fill);
  sc.strokeStyle = '#cfe0ff'; sc.lineWidth = 1.5; sc.stroke(edge);
  const xg = v[rows * cols * 2], hc = v[rows * cols * 2 + 1], down = hc < 40e-6;
  sc.strokeStyle = 'rgba(255,225,10,.3)'; sc.lineWidth = 1; sc.beginPath(); sc.moveTo(w / 2, 0); sc.lineTo(w / 2, h); sc.stroke();
  sc.fillStyle = down ? '#ffe10a' : 'rgba(255,225,10,.25)';
  sc.beginPath(); sc.arc(w / 2, Y(xg === xg ? xg : 0), Math.max(5, 13e-6 * k), 0, TAU); sc.fill();
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function drawNumbers(t) {
  $('s-rpm').textContent = (t.wp * 60 / TAU).toFixed(2) + ' rpm';
  $('s-vg').textContent = (t.vg * 100).toFixed(1) + ' cm/s';
  $('s-r').textContent = (t.r * 1000).toFixed(1) + ' mm';
  $('s-err').textContent = (Math.asin(Math.max(-1, Math.min(1, t.err))) * 180 / Math.PI).toFixed(2) + '°';
  $('s-nl').textContent = (t.nIn * 1000).toFixed(1) + ' mN'; $('s-nr').textContent = (t.nOut * 1000).toFixed(1) + ' mN';
  $('s-loss').textContent = (t.loss * 100).toFixed(0) + ' %';
  $('s-xi').textContent = (t.xi * 1e6).toFixed(0) + '/' + (t.ze * 1e6).toFixed(0) + ' µm'; $('s-load').textContent = t.load != null ? (t.load * 100).toFixed(0) + ' %' : '-';
  $('s-z').textContent = t.hc > 1e-4 ? (t.hc * 1000).toFixed(1) + ' mm' : (t.hc * 1e6).toFixed(1) + ' µm';   // above the local surface
}
function drawStats() {
  const t = S.tel; if (!t) return;
  drawNumbers(t);
  // the readout only exists while the needle is on the record (with a grace period so that
  // lifting it to jump elsewhere does not make the panel blink)
  const down = t.hc < 40e-6, clock = performance.now();
  if (down) S.lastDown = clock;
  const show = down || (S.lastDown > 0 && clock - S.lastDown < 3000);
  if (show !== S.hudOn) { S.hudOn = show; $('hud').classList.toggle('on', show); }
  // only while the platter holds the record that was picked last: switching shows the new name straight away,
  // and never a track of the previous record while the new one loads
  // (a new record is put on with the needle lifted: until it has been up once, it is still settling on the old radius)
  const rec = S.rec && S.rec.pick === pick && t.recSeq === S.rec.seq && (S.rec.lifted ||= !down) ? S.rec : null;
  S.live = rec;
  const k = rec && down && t.xg === t.xg ? rec.tracks.find((k) => t.theta >= k.theta0 && t.theta < k.theta1) : null;
  nowPlaying(k && rec.tracks.length > 1 ? k.title : S.recTitle || '');
  // the end of the side: the needle has run past the last track for a moment
  const sp = span();
  if (rec && sp && down && t.xg === t.xg && !S.seekTo) {
    if (t.theta > sp.b + 1) { S.endT ||= clock; if (!S.ended && clock - S.endT > 800) showEnd(); }
    else { S.endT = 0; if (S.ended && t.theta < sp.b) hideEnd(true); }
  }
  updateTransport();
}

// where the needle is in the song, for the room: seconds into the first track, and how fast the groove is going by
function songPos(t, dt) {
  if (!t || !S.rec || t.recSeq !== S.rec.seq || !S.rec.tracks.length) return null;
  const on = t.hc < 40e-6 && t.xg === t.xg, th = t.theta + (on ? t.wp * dt : 0);
  return { t: (th - S.rec.tracks[0].theta0) / W33, on, rate: t.wp / W33, al: t.al };
}

// ---------- seeking: drop the needle on the second asked for ----------
// The deck's own auto-cue swings the arm over a radius and lowers it at once, so it lands somewhere in the turn of
// the spiral that passes under the stylus: up to 1.8 s off. Which turn is decided by the radius, but where in the
// turn is decided by how far round the disc is at touchdown. So: lift, swing over the radius, hover, and let go of
// the cue at the moment that brings the asked-for spot under the stylus as it lands. While the arm hovers, tel.theta
// is the groove the stylus would land in right now; the disc turns on by wp for as long as the cue takes to lower.
S.tDown = 0.86;   // s from letting go of the cue to the stylus on the vinyl; learned from each landing
// While the cue lowers, nothing holds the arm and anti-skate swings it outward: several turns of the spiral, which would
// land seconds early. So the arm hovers that much further in: about 0.004 rad per gram of anti-skate (measured at the
// default 1.8 g, where the cue lowering in 0.83 s drifts 0.0071 rad), refined from each landing.
S.driftK = 0.004;
const antiskate = () => Math.max(0.05, +$('p-antiskate').value);
// the side: from the start of the first track to the end of the last, in groove angle
function span() { const r = S.rec; return r && r.tracks.length ? { a: r.tracks[0].theta0, b: r.tracks[r.tracks.length - 1].theta1 } : null; }
function sideLen() { const s = span(); return s ? (s.b - s.a) / W33 : 0; }
function seek(sec) {      // seconds from the start of the first track (window.__rp.seek, the timeline, the arrow keys)
  const sp = span(); if (!sp || !S.rtab || !S.started) return;
  sec = Math.max(0, Math.min((sp.b - sp.a) / W33 - 0.5, sec));
  const T = sp.a + sec * W33;
  cancelSeek(); hideEnd(true);
  S.seekTo = { sec, T, al: aimArm(T) - S.driftK * antiskate(), step: 'lift', t0: performance.now() };
  if (!S.motor) setMotor(true);
  send({ t: 'cue', up: true });
  updateTransport();
}
// The arm angle that puts the stylus over groove T at touchdown. The record sits a little off-centre (Off-centre in
// Controls), so the groove's distance from the spindle swings by up to that much each turn: more than the half a groove
// pitch the landing can miss by. Touchdown is timed for the disc angle that brings T under the stylus, so where the
// record's centre will be then is known, and the arm aims for it (same geometry as the engine: engine-core.js).
function aimArm(T) {
  const rg = grooveRadius(S.rtab, T), [ex, ey] = renderer.info?.ecc || [0, 0];
  let al = alphaForRadius(rg);
  for (let i = 0; i < 3; i++) {
    const [sx, sy] = stylusXY(al), r = Math.hypot(sx, sy), thp = T - Math.atan2(sy, sx), c = Math.cos(thp), s = Math.sin(thp);
    const cx = ex * c + ey * s, cy = -ex * s + ey * c;               // the record's centre at touchdown
    al = alphaForRadius(rg + (cx * sx + cy * sy) / r);
  }
  return al;
}
function cancelSeek() { if (!S.seekTo) return; clearTimeout(S.seekTo.timer); S.seekTo = null; }
function seekStep() {
  const q = S.seekTo, t = S.tel; if (!q || !t) return;
  const now = performance.now(), w = TAU * S.rpm / 60;
  if (now - q.t0 > 9000) { cancelSeek(); send({ t: 'hand', on: false }); return; }      // something is in the way: just lower it
  if (q.step === 'lift') { if (t.hc > 1.2e-3) { q.step = 'swing'; q.al0 = t.al; q.ts = now; } return; }
  if (q.step === 'swing') {                       // about the speed of the deck's own auto-cue, eased at both ends
    const d = q.al - q.al0, dur = Math.max(250, Math.abs(d) / 0.9 * 1000), k = Math.min(1, (now - q.ts) / dur);
    send({ t: 'hand', on: true, al: q.al0 + d * k * k * (3 - 2 * k) });
    if (k >= 1) { q.step = 'settle'; q.ts = now; }
    return;
  }
  if (q.step === 'settle') {                      // arm over the radius and the platter up to speed
    if (!((Math.abs(t.al - q.al) < 4e-4 && Math.abs(t.wp - w) < 0.03 * w && S.tRecv > q.ts) || now - q.ts > 1500)) return;
    const wp = Math.max(0.2 * w, t.wp), P = t.theta + wp * ((now - S.tRecv) / 1000 + S.tDown);
    const turn = (((q.T - P) % TAU) + TAU) % TAU;  // how much further the disc has to turn before letting go
    q.step = 'wait';
    q.timer = setTimeout(() => { if (S.seekTo !== q) return; send({ t: 'hand', on: false }); q.tDrop = performance.now(); q.step = 'land'; }, turn / wp * 1000);
    return;
  }
  if (q.step === 'land' && t.hc < 40e-6 && t.recSeq === S.rec?.seq && S.tRecv > q.tDrop) {
    const got = (S.tRecv - q.tDrop) / 1000 - 0.008;               // when it touched (telemetry comes every 16 ms)
    S.seekErr = (t.theta - t.wp * ((S.tRecv - q.tDrop) / 1000 - S.tDown) - q.T) / W33;   // where it landed, minus where it was sent (s)
    if (Math.abs(S.seekErr) < 30) S.driftK += 0.7 * ((t.al - q.al) / antiskate() - S.driftK);
    S.seekLog = [...(S.seekLog || []).slice(-19), { at: +q.sec.toFixed(2), err: +S.seekErr.toFixed(3), raw: +((t.theta - q.T) / W33).toFixed(3) }];
    if (got > 0.3 && got < 2) S.tDown += 0.5 * (got - S.tDown);
    S.seekTo = null;
    // still a turn of the spiral out (a loud passage swings the groove sideways by more than the margin): once more
    if (Math.abs(t.theta - q.T) > 0.5 * TAU && !q.retry) { seek(q.sec); S.seekTo.retry = true; }
    updateTransport();
  }
}

// ---------- the transport: play / pause, the side's timeline with the song's sections, the time ----------
var TP;    // (var: updateTransport can be called before this part of the module has run, and must see it is not ready)
const tl = $('tl'), tlc = tl.getContext('2d');
TP = { hover: null, drag: false, secs: [], song: null };
// the song's map, on the file's clock: the drops, and the two big build-ups (only when the record is the song)
function sections() {
  const song = S.matched ? ilmc?.song : null;
  if (song === TP.song) return TP.secs;
  TP.song = song; TP.secs = [];
  if (!song) return TP.secs;
  const off = song.off || 0, bar = 4 * song.m.beatLen; let run = null;
  for (const b of song.bars) {
    if (b.zone === 'drop') { if (!run) TP.secs.push(run = { k: 'drop', t0: b.t + off }); run.t1 = b.t + bar + off; } else run = null;
  }
  for (const c of song.m.cues || []) if (c.k >= 0.9) TP.secs.push({ k: 'build', t0: c.t0 + off, t1: c.t1 + off });
  return TP.secs;
}
const curPos = () => (S.seekTo ? S.seekTo.sec : S.pos);
const PAD = 7;
function drawTimeline() {
  const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(tl.clientWidth * dpr), h = Math.round(tl.clientHeight * dpr);
  if (!w || !h) return;
  if (tl.width !== w || tl.height !== h) { tl.width = w; tl.height = h; }
  const x = tlc, len = sideLen(), pad = PAD * dpr, W = w - 2 * pad, cy = Math.round(h / 2);
  x.clearRect(0, 0, w, h);
  if (!len) return;
  const hot = TP.hover != null, th = Math.round((hot ? 5 : 3) * dpr), y0 = cy - Math.floor(th / 2);
  const X = (s) => Math.round(pad + W * Math.max(0, Math.min(1, s / len)));
  const pos = curPos() ?? 0, px = X(pos);
  x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(pad, y0, W, th);
  x.fillStyle = 'rgba(255,255,255,.8)'; x.fillRect(pad, y0, px - pad, th);
  // the song's drops in the accent, its build-ups rising into it; brighter once played
  for (const played of [false, true]) {
    x.save(); x.beginPath(); if (played) x.rect(0, 0, px, h); else x.rect(px, 0, w - px, h); x.clip(); x.globalAlpha = played ? 1 : 0.5;
    for (const s of sections()) {
      const a = X(s.t0), b = X(s.t1);
      if (s.k === 'drop') x.fillStyle = '#ffe10a';
      else { const g = x.createLinearGradient(a, 0, b, 0); g.addColorStop(0, 'rgba(255,225,10,0)'); g.addColorStop(1, 'rgba(255,225,10,.75)'); x.fillStyle = g; }
      x.fillRect(a, y0, Math.max(1, b - a), th);
    }
    x.restore();
  }
  // gaps between the tracks of a record with several
  const sp = span(); x.globalCompositeOperation = 'destination-out';
  for (const k of S.rec.tracks.slice(1)) x.fillRect(X((k.theta0 - sp.a) / W33) - dpr, y0 - 1, 2 * dpr, th + 2);
  x.globalCompositeOperation = 'source-over';
  if (hot) { x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(X(TP.hover) - Math.round(dpr / 2), cy - 6 * dpr, dpr, 12 * dpr); }
  // the playhead; yellow while the needle is on its way there
  const ph = Math.round(13 * dpr), pw = Math.round(3 * dpr);
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(px - pw / 2 - dpr, cy - ph / 2 - dpr, pw + 2 * dpr, ph + 2 * dpr);
  x.fillStyle = S.seekTo ? '#ffe10a' : '#fff'; x.fillRect(px - pw / 2, cy - ph / 2, pw, ph);
}
function tip() {
  const el = $('tp-tip');
  if (TP.hover == null || !sideLen()) { el.classList.remove('on'); return; }
  const s = TP.hover, sec = sections().find((x) => s >= x.t0 && s < x.t1);
  el.textContent = fmt(s) + (sec ? (sec.k === 'drop' ? ' · drop' : ' · build-up') : '');
  el.style.left = (tl.offsetLeft + PAD + (tl.clientWidth - 2 * PAD) * (s / sideLen())) + 'px';
  el.classList.add('on');
}
const tlSec = (e) => { const r = tl.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left - PAD) / (r.width - 2 * PAD))) * sideLen(); };
tl.addEventListener('pointerdown', (e) => { if (!sideLen() || !S.started) return; try { tl.setPointerCapture(e.pointerId); } catch {} TP.drag = true; TP.hover = tlSec(e); tip(); });
tl.addEventListener('pointermove', (e) => { if (!sideLen()) return; TP.hover = tlSec(e); tip(); });
tl.addEventListener('pointerup', (e) => {
  if (TP.drag) { TP.drag = false; seek(tlSec(e)); sfx.tick(); }
  if (e.pointerType !== 'mouse') TP.hover = null;
  tip();
});
tl.addEventListener('pointerleave', () => { if (!TP.drag) { TP.hover = null; tip(); } });
tl.addEventListener('pointercancel', () => { TP.drag = false; TP.hover = null; tip(); });
tl.addEventListener('keydown', (e) => { if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); seek(e.key === 'Home' ? 0 : sideLen() - 5); } });
const PLAY_G = 'M3 1h2v1h1v1h2v1h1v1h2v1h1v2h-1v1h-2v1h-1v1h-2v1h-1v1h-2z', PAUSE_G = 'M3 2h3v10h-3zM8 2h3v10h-3z';
function updateTransport() {
  const el = $('tp'); if (!el || !TP) return;
  const ready = $('insert').dataset.state === 'ready', nodisc = !S.started && !ready;
  el.classList.toggle('nodisc', nodisc);
  el.hidden = !S.started && !root.classList.contains('browse');
  const title = nodisc ? 'No disc in the drive' : (S.started ? S.nowTitle || S.recTitle : art.title || S.recTitle) || '';
  const by = nodisc ? '' : S.matched ? art.artist : S.started ? S.recBy || '' : art.artist;
  const key = title + '|' + by;
  if (key !== TP.titleKey) { TP.titleKey = key; $('tp-title').replaceChildren(title, ...(by ? [Object.assign(document.createElement('i'), { textContent: ' · ' + by })] : [])); }
  const t = S.tel, down = t && t.hc < 40e-6, playing = S.started && S.motor && (down || !!S.seekTo) && !S.ended;
  if (playing !== TP.playing) {
    TP.playing = playing; $('tp-play-g').setAttribute('d', playing ? PAUSE_G : PLAY_G);
    $('tp-play').title = playing ? 'Pause (Space)' : 'Play (Space)'; $('tp-play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  const len = sideLen(), pos = curPos(), time = len ? `${fmt(pos || 0)} / ${fmt(len)}` : '';
  if (time !== TP.time) { TP.time = time; $('tp-time').textContent = time; tl.setAttribute('aria-valuemax', Math.round(len)); tl.setAttribute('aria-valuenow', Math.round(pos || 0)); tl.setAttribute('aria-valuetext', time); }
}
function playPause() {
  if (!S.started) { if ($('insert').dataset.state === 'ready' || S.loaded || S.pending) powerOn(); return; }
  if (S.seekTo) return;
  const t = S.tel, down = t && t.hc < 40e-6 && t.xg === t.xg;
  if (S.ended || !down) { seek(S.ended ? 0 : S.pos || 0); return; }
  setMotor(!S.motor); updateTransport();
}
$('tp-play').addEventListener('click', playPause);

// ---------- the end of the side: say so, offer it again, then lift the arm back to its rest like an auto-return deck ----------
function showEnd() {
  S.ended = true; sfx.done();
  $('end-title').textContent = S.matched ? "That's Fuck My Computer." : "That's the end of the side.";
  $('end').hidden = false; updateTransport();
  clearTimeout(S.endT2); S.endT2 = setTimeout(() => { if (S.ended && !S.seekTo) { send({ t: 'cueTo', al: ALPHA_REST }); setTimeout(() => { if (S.ended && !S.seekTo) setMotor(false); }, 2500); } }, 6000);
}
function hideEnd(reset) { $('end').hidden = true; if (reset) { S.ended = false; clearTimeout(S.endT2); } }
$('end-again').addEventListener('click', () => seek(0));
$('end-shelf').addEventListener('click', () => { hideEnd(); if ($('shelf').hidden) $('t-records').click(); });
$('end-x').addEventListener('click', () => hideEnd());

// ---------- watching: the interface fades after a few seconds without input while the music plays, and H hides it ----------
const IDLE_MS = 3000, TOUCH = matchMedia('(pointer: coarse)').matches;
S.input = performance.now();
function setIdle(on) { S.idle = on; root.classList.toggle('idle', on); }
function setBare(on) {
  root.classList.toggle('bare', on); setIdle(false); S.input = performance.now();
  const h = $('bare-hint'); clearTimeout(S.hintT);
  if (on) { h.textContent = TOUCH ? 'Tap to bring the interface back' : 'Press H to bring the interface back'; h.classList.add('on'); S.hintT = setTimeout(() => h.classList.remove('on'), 2200); }
  else h.classList.remove('on');
}
$('tp-hide').addEventListener('click', () => setBare(true));
addEventListener('pointermove', (e) => { S.input = performance.now(); S.overChrome = !!e.target.closest?.('.chrome, .win, dialog'); if (S.idle) setIdle(false); }, { passive: true });
for (const ev of ['keydown', 'wheel']) addEventListener(ev, () => { S.input = performance.now(); if (S.idle) setIdle(false); }, { passive: true, capture: true });
// a tap on the scene while the interface is away only brings it back (it would otherwise drop the needle)
addEventListener('pointerdown', (e) => {
  S.input = performance.now();
  const away = S.idle || root.classList.contains('bare');
  if (S.idle) setIdle(false);
  if (away && e.pointerType !== 'mouse' && e.target === canvas) { if (root.classList.contains('bare')) setBare(false); e.stopPropagation(); }
}, true);
function checkIdle() {
  const t = S.tel, playing = S.started && S.motor && t && t.hc < 40e-6 && !S.ended;
  const want = playing && !S.seekTo && !TP.drag && !S.overChrome && !panelOpen() && $('end').hidden && !$('insert').classList.contains('open') && performance.now() - S.input > IDLE_MS;
  if (want !== !!S.idle) setIdle(want);
}
// full screen, where the browser allows it (not on iPhone)
const FS = document.documentElement, fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
$('tp-full').hidden = !(document.fullscreenEnabled || document.webkitFullscreenEnabled);
function toggleFullscreen() {
  try {
    const r = fsOn() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (FS.requestFullscreen || FS.webkitRequestFullscreen).call(FS, { navigationUI: 'hide' });
    r?.catch?.(() => {});
  } catch {}
}
$('tp-full').addEventListener('click', toggleFullscreen);
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => {
  const on = fsOn();
  $('tp-full-g').setAttribute('d', on ? 'M4 1h2v5h-5v-2h3zM8 1h2v3h3v2h-5zM1 8h5v5h-2v-3h-3zM8 8h5v2h-3v3h-2z' : 'M1 1h5v2h-3v3h-2zM8 1h5v5h-2v-3h-3zM1 8h2v3h3v2h-5zM11 8h2v5h-5v-2h3z');
  $('tp-full').title = on ? 'Leave full screen (F)' : 'Full screen (F)';
});
// where the needle is, in seconds from the start of the side, for the transport (held while the arm is up)
function trackPos(t, dt) {
  if (!S.live || !t || t.hc >= 40e-6 || t.xg !== t.xg) return;
  const sp = span(); S.pos = Math.max(0, Math.min((sp.b - sp.a) / W33, (t.theta + t.wp * dt - sp.a) / W33));
}
function drawTransport() { if (!$('tp').hidden && !root.classList.contains('idle') && !root.classList.contains('bare')) drawTimeline(); }

// ---------- frame loop ----------
let frame = 0;
// One failing part must never stop the frame loop: that froze the picture while the sound carried on.
// The first error is shown in the status line so it can be read off a phone.
const seen = new Set();
function guard(name, fn) {
  try { fn(); } catch (err) {
    if (seen.has(name)) return;
    seen.add(name); console.error(name, err); status(`${name} error: ${(err && err.message) || err}`);
  }
}
addEventListener('error', (e) => { if (!seen.size) { seen.add('page'); status(`error: ${e.message}`); } });
function tick() {
  requestAnimationFrame(tick);      // first, so nothing below can end the loop
  const t = S.tel, dt = t ? Math.min(0.1, (performance.now() - S.tRecv) / 1000) : 0;
  S.zoom += (S.zoomT - S.zoom) * 0.12;
  if (frame % 6 === 0 && S.on && !S.started) powerMsg();
  if (S.resetting) {
    S.az += (AZ0 - S.az) * 0.12; S.el += (EL0 - S.el) * 0.12;
    if (Math.abs(S.az - AZ0) < 1e-3 && Math.abs(S.el - EL0) < 1e-3) { S.az = AZ0; S.el = EL0; S.resetting = false; }
  }
  const moved = Math.abs(S.zoomT - ZOOM0) > 0.01 || Math.abs(S.az - AZ0) > 0.01 || Math.abs(S.el - EL0) > 0.01;
  if (moved !== S.moved) { S.moved = moved; $('t-reset').hidden = !moved; }
  guard('seek', seekStep);
  guard('render', () => {
    if (OG) renderer.draw({ thp: 2.2, al: alphaForRadius(0.108), zt: 0, zoom: 0, az: -0.5, el: 0.6, motor: true, rpm: 33.3333, bare: true, dist: 1.1, at: [0.021, -0.07, -0.093], ...window.__og });   // deck high in the frame: X overlays the bottom
    else {
      const now = performance.now(), fdt = S.tPrev ? (now - S.tPrev) / 1000 : 0; S.tPrev = now;
      let room = null;
      try { room = ilmc ? ilmc.update(fdt, songPos(t, dt)) : null; } catch (err) { if (!S.roomErr) { S.roomErr = true; console.error('room', err); } }   // the deck keeps drawing whatever the room does
      const c = room ? room.cam : { az: 0, el: 0, zoom: 0 };
      const az = S.az + c.az, el = Math.max(0.02, Math.min(1.55, S.el + c.el));
      const target = room ? ilmc.begin(...renderer.fit()) : null;      // the room's camera develops the picture: the deck draws into its HDR frame
      // the room directs the camera (cuts, close-ups, moves) until the visitor takes it; "Reset view" hands it back
      const view = c.view && !S.moved && !S.resetting && !(drag && drag.type === 'orbit') ? c.view : null;
      renderer.draw({ thp: t ? t.thp + t.wp * dt : 0, al: t ? t.al : ALPHA_REST, zt: t ? t.zb + t.ze : 5e-3, zoom: S.zoom + c.zoom, az, el, roll: c.roll || 0, motor: S.motor, rpm: S.rpm, lights: room?.lights, bare: room?.bare, ilmc: !!room,
        target, flash: room?.flash, noFloor: room?.noFloor, rise: c.rise || 0, view });
      if (ilmc && room) ilmc.render(renderer.cam, room.post);
    }
  });
  if (frame++ % 2 === 0 && S.hudOn) guard('groove view', drawScope);
  if (frame % 6 === 0) guard('readout', drawStats);
  if (frame % 2 === 0) guard('transport', () => { trackPos(t, dt); drawTransport(); });
  if (frame % 3 === 0) drawProgress();
  if (frame % 15 === 0) checkIdle();
}
tick();
if (!PRIV && !OG) showRoom();      // the public page: the room is on screen as soon as it has been drawn once
updateTransport();
window.__rp = { S, get ctx() { return ctx; }, send, renderer, stylusXY, ilmc, seek };   // debugging handle
