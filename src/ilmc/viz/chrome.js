// The static parts of the visualisers, painted on 2D canvases: scales, labels, window frames, the Winamp window and
// the FL Studio channel rack. Each is repainted only when its signature changes (the clock ticks over, the marquee
// steps, a new bar starts), and the live parts are drawn over them on the GPU (gpu.js).
const MONO = '"VT323", "Lucida Console", monospace', UI = 'Tahoma, Verdana, "Segoe UI", sans-serif';
const W = 384, H = 288;
export const STEP_X = 104, STEP_W = 17, LED_Y = 40, ROW_Y = 52, ROW_H = 29;
const fonts = () => (document.fonts && document.fonts.status === 'loaded' ? 1 : 0);
const fmt = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
// where a frequency sits on the 128-band log axis (30 Hz .. 16 kHz)
const band = (f) => 128 * Math.log(f / 30) / Math.log(16000 / 30);

export function sig(k, fx, viz) {
  if (k === 'player') return `${fonts()}|${Math.floor(Math.max(0, fx.songT || 0))}|${Math.floor(fx.time * 4)}|${fx.alive > 0.3}`;
  if (k === 'steps') return `${fonts()}|${viz.pat.bar}`;
  return `${fonts()}`;
}
export function draw(k, x, fx, viz, trk) {
  x.save(); x.clearRect(0, 0, x.canvas.width, x.canvas.height); x.scale(x.canvas.width / W, x.canvas.height / H);
  ({ analyzer, scope, vector, waterfall, meters, player, steps })[k](x, fx, viz, trk());
  x.restore();
}

function analyzer(x) {
  x.fillStyle = '#9fb3a6'; x.font = `16px ${MONO}`; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  for (const [f, s] of [[31, '31'], [63, '63'], [125, '125'], [250, '250'], [500, '500'], [1000, '1k'], [2000, '2k'], [4000, '4k'], [8000, '8k'], [16000, '16k']]) {
    const bar = Math.max(0, Math.min(30, (band(f) - 4) / 4)), cx = (0.085 + 0.895 * (bar + 0.5) / 31) * W;
    x.fillText(s, cx, H - 16);
  }
  x.textAlign = 'right'; x.fillStyle = '#6f8277';
  for (let i = 0; i <= 3; i++) { const y = H - (0.14 + 0.78 * i / 3) * H; x.fillText(['-48', '-32', '-16', '0'][i], 28, y + 5); x.fillRect(30, y, 3, 1); }
  x.textAlign = 'left'; x.fillStyle = '#b8c9be'; x.font = `18px ${MONO}`; x.fillText('SPECTRUM  1/3 OCT', 32, 22); x.textAlign = 'right'; x.fillText('dB  L+R', W - 12, 22);
}
function scope(x) {
  x.font = `17px ${MONO}`; x.fillStyle = '#7fd9a0'; x.textBaseline = 'alphabetic';
  x.fillText('CH1  500mV', 10, H - 10); x.fillText('M 2.00ms', 150, H - 10); x.textAlign = 'right'; x.fillText('CH1 ↑ 0.00V', W - 10, H - 10);
  x.textAlign = 'left'; x.fillText('Trig\'d', 10, 20); x.fillStyle = '#4c8c62'; x.fillText('1→', 2, H / 2 + 5);
}
function vector(x) {
  x.font = `17px ${MONO}`; x.fillStyle = '#e0a66a';
  const cx = W / 2, cy = H / 2, r = 0.235 * 4 * H / 2;
  x.textAlign = 'center'; x.fillText('M', cx, cy - r - 4); x.fillText('S', cx + r * 1.02 + 12, cy + 5); x.fillText('S', cx - r * 1.02 - 12, cy + 5);
  x.fillText('L', cx - r * 0.72 - 6, cy - r * 0.72 - 2); x.fillText('R', cx + r * 0.72 + 6, cy - r * 0.72 - 2);
  x.textAlign = 'left'; x.fillText('GONIOMETER', 8, 20); x.textAlign = 'right'; x.fillText('PHASE  +1', W - 8, H - 10);
}
function waterfall(x) {
  x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#000'; x.fillRect(0.1 * W - 1, 0.1 * H - 1, 0.88 * W + 2, 0.8 * H + 2); x.clearRect(0.1 * W, 0.1 * H, 0.88 * W, 0.8 * H);
  x.fillStyle = '#000'; x.font = `bold 13px ${UI}`; x.fillText('Spectral View', 8, 18); x.font = `12px ${UI}`; x.textAlign = 'right'; x.fillText('Hz', 0.1 * W - 4, 0.1 * H + 10);
  for (const [f, s] of [[100, '100'], [1000, '1k'], [10000, '10k']]) { const y = (1 - 0.1 - 0.8 * (band(f) - 4) / 123) * H; x.fillText(s, 0.1 * W - 4, y + 4); x.fillRect(0.1 * W - 3, y, 3, 1); }
  x.textAlign = 'center'; for (let i = 0; i <= 3; i++) x.fillText(i ? `-${i * 2}s` : 'now', (0.98 - 0.88 * i * 2 / 6.2) * W, H - 10);
}
function meters(x) {
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#26272b'); g.addColorStop(1, '#151618'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 2; i++) {
    const x0 = 12 + i * 186, pv = [x0 + 87, 196];
    x.fillStyle = '#0b0b0c'; x.fillRect(x0, 16, 174, 148);
    const f = x.createRadialGradient(x0 + 87, 120, 10, x0 + 87, 100, 120); f.addColorStop(0, '#fbe9b0'); f.addColorStop(1, '#d8b86c');   // a warm bulb behind the card
    x.fillStyle = f; x.fillRect(x0 + 4, 20, 166, 140);
    x.save(); x.beginPath(); x.rect(x0 + 4, 20, 166, 140); x.clip();
    const ang = (pos) => -0.5 + 1.0 * pos, pt = (pos, r) => [pv[0] + Math.sin(ang(pos)) * r, pv[1] - Math.cos(ang(pos)) * r];
    const posDb = (db) => Math.pow(10, db / 20) * 0.708;
    x.lineWidth = 2; x.strokeStyle = '#1b1a17'; x.beginPath(); x.arc(pv[0], pv[1], 138, ang(posDb(-20)) - Math.PI / 2, ang(posDb(0)) - Math.PI / 2); x.stroke();
    x.lineWidth = 5; x.strokeStyle = '#c4231a'; x.beginPath(); x.arc(pv[0], pv[1], 141, ang(posDb(0)) - Math.PI / 2, ang(posDb(3)) - Math.PI / 2); x.stroke();
    x.font = `15px ${MONO}`; x.textAlign = 'center'; x.lineWidth = 1.5;
    for (const db of [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3]) {
      const p = posDb(db), [ax, ay] = pt(p, 138), [bx, by] = pt(p, 150), [tx, ty] = pt(p, 162);
      x.strokeStyle = db >= 0 ? '#c4231a' : '#1b1a17'; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      if ([-20, -10, -5, -3, 0, 3].includes(db)) { x.fillStyle = db >= 0 ? '#c4231a' : '#1b1a17'; x.fillText(db > 0 ? `+${db}` : `${db}`, tx, ty + 4); }
    }
    x.fillStyle = '#1b1a17'; x.font = `bold 30px ${UI}`; x.fillText('VU', x0 + 87, 132);
    x.font = `14px ${UI}`; x.fillText(i ? 'R' : 'L', x0 + 22, 150); x.font = `11px ${UI}`; x.fillText('PEAK', x0 + 128, 150);
    const sh = x.createLinearGradient(0, 20, 0, 60); sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = sh; x.fillRect(x0 + 4, 20, 166, 40);   // the hood's shadow
    x.restore();
  }
  x.font = `16px ${MONO}`; x.textAlign = 'left'; x.fillStyle = '#9aa0a8';
  x.fillText('L', 26, 213); x.fillText('R', 26, 243);
  x.textAlign = 'center'; x.font = `13px ${MONO}`;
  for (const [db, s] of [[-36, '-36'], [-24, '-24'], [-12, '-12'], [-6, '-6'], [-3, '-3'], [0, '0']]) x.fillText(s, 44 + 328 * (1 + db / 36), 274);
  x.fillStyle = '#060607'; x.fillRect(42, 198, 332, 20); x.fillRect(42, 228, 332, 20);
}

// Winamp 2's main window, drawn at legible size: the clock, the marquee with the track's own title, kbps/kHz, stereo,
// the seek bar and transport, and a one-line playlist under it. The vis box is left black for the GPU.
function player(x, fx, viz, trk) {
  const t = Math.max(0, fx.songT || 0), dur = (fx.song && fx.song.m.dur) || 190.6, playing = fx.alive > 0.3;
  const bevel = (X, Y, w, h, up = true) => { x.fillStyle = up ? '#5b5b70' : '#16161d'; x.fillRect(X, Y, w, 1); x.fillRect(X, Y, 1, h); x.fillStyle = up ? '#16161d' : '#5b5b70'; x.fillRect(X, Y + h - 1, w, 1); x.fillRect(X + w - 1, Y, 1, h); };
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a3a4c'); g.addColorStop(1, '#2a2a38'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let y = 22; y < 228; y += 2) { x.fillStyle = 'rgba(255,255,255,.025)'; x.fillRect(0, y, W, 1); }
  // title bar: the grooves either side of the name
  x.fillStyle = '#1f1f2a'; x.fillRect(0, 0, W, 20);
  for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#8a7a3a' : '#c8b45a'; x.fillRect(8, 5 + i * 3, 140, 1); x.fillRect(W - 148, 5 + i * 3, 116, 1); }
  x.fillStyle = '#e8dca0'; x.font = `bold 13px ${UI}`; x.textAlign = 'center'; x.fillText('WINAMP', 192, 15); x.textAlign = 'left';
  for (let i = 0; i < 3; i++) { x.fillStyle = '#9a9aa8'; x.fillRect(W - 26 + i * 8, 6, 6, 8); }
  bevel(0, 0, W, 230);
  // the display
  x.fillStyle = '#000'; x.fillRect(12, 28, 166, 128); bevel(12, 28, 166, 128, false);
  x.fillStyle = '#00e800';
  if (playing) { x.beginPath(); x.moveTo(22, 40); x.lineTo(32, 46); x.lineTo(22, 52); x.fill(); } else { x.fillRect(22, 40, 4, 12); x.fillRect(29, 40, 4, 12); }
  x.font = `62px ${MONO}`; x.textAlign = 'right'; x.fillText(fmt(t), 170, 88); x.textAlign = 'left';
  // marquee: steps a character at a time, like the real one
  x.fillStyle = '#000'; x.fillRect(186, 30, 186, 34); bevel(186, 30, 186, 34, false);
  const tick = `${trk.artist} - ${trk.title} (${fmt(dur)})  ***  `, off = Math.floor(fx.time * 4) % tick.length;
  x.save(); x.beginPath(); x.rect(188, 32, 182, 30); x.clip();
  x.fillStyle = '#00f000'; x.font = `28px ${MONO}`; x.fillText((tick + tick).slice(off, off + 18), 192, 56); x.restore();
  x.fillStyle = '#000'; x.fillRect(186, 70, 46, 22); x.fillRect(272, 70, 34, 22); bevel(186, 70, 46, 22, false); bevel(272, 70, 34, 22, false);
  x.fillStyle = '#00e000'; x.font = `22px ${MONO}`; x.fillText('320', 192, 88); x.fillText('44', 278, 88);
  x.fillStyle = '#b8b8c8'; x.font = `11px ${UI}`; x.fillText('kbps', 236, 86); x.fillText('kHz', 310, 86);
  x.font = `bold 12px ${UI}`; x.fillStyle = '#3c5a3c'; x.fillText('mono', 300, 108); x.fillStyle = '#00e800'; x.fillText('stereo', 334, 108);
  // volume and balance
  const sl = (X, w, v, col) => { x.fillStyle = '#16161d'; x.fillRect(X, 118, w, 10); bevel(X, 118, w, 10, false); x.fillStyle = col; x.fillRect(X + 1, 119, (w - 2) * v, 8); x.fillStyle = '#c8c8d4'; x.fillRect(X + (w - 12) * v, 115, 12, 16); bevel(X + (w - 12) * v, 115, 12, 16); };
  sl(186, 110, 0.78, '#2f9a2f'); sl(304, 68, 0.5, '#2f9a2f');
  x.fillStyle = '#c8c8d4'; x.font = `bold 11px ${UI}`; x.fillText('EQ', 316, 150); x.fillText('PL', 348, 150); bevel(310, 138, 26, 16); bevel(342, 138, 26, 16);
  // seek bar
  x.fillStyle = '#16161d'; x.fillRect(12, 164, 360, 12); bevel(12, 164, 360, 12, false);
  const p = Math.min(1, t / dur); x.fillStyle = '#c8c8d4'; x.fillRect(12 + 332 * p, 162, 28, 16); bevel(12 + 332 * p, 162, 28, 16);
  // transport: previous, play, pause, stop, next, eject
  const icons = ['prev', 'play', 'pause', 'stop', 'next'];
  icons.forEach((ic, i) => {
    const X = 12 + i * 46, Y = 186; const bg = x.createLinearGradient(0, Y, 0, Y + 34); bg.addColorStop(0, '#d6d6e0'); bg.addColorStop(1, '#8e8e9e'); x.fillStyle = bg; x.fillRect(X, Y, 42, 34); bevel(X, Y, 42, 34, !(ic === 'play' && playing));
    x.fillStyle = '#20202a'; const cx = X + 21, cy = Y + 17;
    const tri = (ax, d) => { x.beginPath(); x.moveTo(ax, cy - 7); x.lineTo(ax + 10 * d, cy); x.lineTo(ax, cy + 7); x.fill(); };
    if (ic === 'play') tri(cx - 5, 1); else if (ic === 'pause') { x.fillRect(cx - 6, cy - 7, 4, 14); x.fillRect(cx + 2, cy - 7, 4, 14); } else if (ic === 'stop') x.fillRect(cx - 6, cy - 6, 12, 12);
    else if (ic === 'prev') { x.fillRect(cx - 9, cy - 7, 3, 14); tri(cx + 4, -1); tri(cx + 10, -1); } else { tri(cx - 10, 1); tri(cx - 4, 1); x.fillRect(cx + 6, cy - 7, 3, 14); }
  });
  x.fillStyle = '#c8c8d4'; x.font = `bold 11px ${UI}`; x.fillText('SHUFFLE', 252, 208); bevel(246, 194, 66, 20); x.fillText('REP', 330, 208); bevel(320, 194, 48, 20);
  // the playlist editor, one entry
  x.fillStyle = '#1f1f2a'; x.fillRect(0, 232, W, 14); x.fillStyle = '#c8b45a'; x.fillRect(8, 238, 120, 1); x.fillRect(W - 128, 238, 120, 1);
  x.fillStyle = '#e8dca0'; x.font = `bold 11px ${UI}`; x.textAlign = 'center'; x.fillText('WINAMP PLAYLIST', 192, 243); x.textAlign = 'left';
  x.fillStyle = '#000'; x.fillRect(6, 248, W - 12, 36);
  x.fillStyle = '#0000c6'; x.fillRect(8, 250, W - 16, 20);
  x.font = `20px ${MONO}`; x.fillStyle = '#fff'; x.fillText(`1. ${trk.artist} - ${trk.title}`.slice(0, 34), 12, 266); x.textAlign = 'right'; x.fillText(fmt(dur), W - 12, 266);
  x.fillStyle = '#00e800'; x.fillText(`${fmt(t)}/${fmt(dur)}`, W - 12, 284); x.textAlign = 'left';
}

// FL Studio's step sequencer: tempo and pattern on top, the step lights, eight channels and their sixteen steps
const NAMES = ['Kick', 'Clap', 'Hat', 'Bass', 'Vox', 'Chop', 'Lead', 'Crash'];
function steps(x, fx, viz, trk) {
  const masks = viz.pat.masks;
  x.fillStyle = '#4b555c'; x.fillRect(0, 0, W, H);
  const tg = x.createLinearGradient(0, 0, 0, 22); tg.addColorStop(0, '#7d8a94'); tg.addColorStop(1, '#56626b'); x.fillStyle = tg; x.fillRect(0, 0, W, 22);
  x.fillStyle = '#e9eef2'; x.font = `bold 13px ${UI}`; x.fillText('Step sequencer', 8, 15);
  x.fillStyle = '#20262a'; x.fillRect(150, 3, 84, 16); x.fillRect(244, 3, 132, 16);
  x.fillStyle = '#ffb14a'; x.font = `17px ${MONO}`; x.fillText('136.000', 158, 16); x.fillText(`Pattern ${1 + (((viz.pat.bar || 0) >> 2) & 7)}`, 252, 16);
  x.fillStyle = '#c7d0d6'; x.font = `11px ${UI}`; x.fillText(trk.title.slice(0, 13), 8, 44);
  for (let r = 0; r < 8; r++) {
    const y = ROW_Y + r * ROW_H;
    x.fillStyle = '#3a4248'; x.fillRect(4, y + 3, W - 8, ROW_H - 4);
    x.fillStyle = r === 4 ? '#7fd36a' : '#2fe05a'; x.beginPath(); x.arc(14, y + ROW_H / 2, 4, 0, 7); x.fill();      // the channel's mute light
    const bg = x.createLinearGradient(0, y + 4, 0, y + ROW_H - 4); bg.addColorStop(0, '#9aa6ae'); bg.addColorStop(1, '#6d7880'); x.fillStyle = bg; x.fillRect(24, y + 5, 74, ROW_H - 8);
    x.fillStyle = '#12171a'; x.font = `bold 13px ${UI}`; x.fillText(NAMES[r], 30, y + 19);
    for (let s = 0; s < 16; s++) {
      const X = STEP_X + s * STEP_W, on = (masks[r] >> s) & 1, grp = (s >> 2) & 1;
      x.fillStyle = on ? (grp ? '#f0c8c0' : '#e3e8ec') : grp ? '#6b4040' : '#3d4449';
      x.fillRect(X + 2, y + 4, STEP_W - 4, ROW_H - 8);
      x.fillStyle = on ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.08)'; x.fillRect(X + 2, y + 4, STEP_W - 4, 2);
    }
  }
}

// this bar's pattern, read off the song map: onsets and band levels per sixteenth, her words and the vocal chops
export function pattern(song, bar) {
  const m = song.m, masks = new Array(8).fill(0), bi = Math.max(0, Math.min(song.bars.length - 1, bar)), zone = song.bars[bi]?.zone, prevZone = song.bars[bi - 1]?.zone;
  const words = m.lyrics ? m.lyrics.words : [], chops = m.chops || [];
  for (let k = 0; k < 16; k++) {
    const t0 = m.beat0 + (bar * 4 + k / 4) * m.beatLen, t1 = t0 + m.beatLen / 4, f = Math.max(0, Math.min(song.low.length - 3, Math.round(t0 * m.fps)));
    if (t0 < 0 || t0 > m.dur) continue;
    let o = 0; for (let j = Math.max(0, f - 1); j <= f + 2; j++) o = Math.max(o, song.onset[j]);
    const lo = song.low[f] / 255, mid = song.mid[f] / 255, hi = song.high[f] / 255;
    const set = (r) => { masks[r] |= 1 << k; };
    if (o > 140 || (zone === 'drop' && k % 4 === 0)) set(0);
    if (k % 8 === 4 && (mid > 0.4 || zone === 'drop')) set(1);
    if (hi > 0.5) set(2);
    if (lo > 0.35 && k % 4 !== 0) set(3);
    if (words.some((w) => w.t >= t0 && w.t < t1)) set(4);
    if (chops.some((c) => c >= t0 && c < t1)) set(5);
    if (mid > 0.6 && k % 2 === 0) set(6);
    if (k === 0 && (zone !== prevZone || bar % 8 === 0) && song.bars[bi]?.e > 0.5) set(7);
  }
  return masks;
}
