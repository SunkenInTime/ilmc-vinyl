// Little interface sounds, synthesised (no samples): a click for buttons, a chime when a window opens, a drive
// spinning up when a disc goes in, a two-note buzz for an error, a rising arpeggio when the song is recognised.
// Quiet, on their own audio context, and off with the "Sounds" switch in Controls.
let ctx = null, out = null;
const KEY = 'ilmc-sfx';
export const sfx = {
  on: (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })(),
  set(on) { this.on = on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {} },
  click() { play((t) => { blip(t, 1800, 0.012, 0.18); noise(t, 0.008, 3200, 0.09); }); },
  tick() { play((t) => blip(t, 2600, 0.01, 0.1)); },
  open() { play((t) => { tone(t, 1318.5, 0.18, 0.11); tone(t + 0.07, 1975.5, 0.26, 0.09); }); },
  error() { play((t) => { tone(t, 220, 0.14, 0.12, 'square'); tone(t + 0.15, 185, 0.2, 0.12, 'square'); }); },
  insert() { play((t) => { blip(t, 90, 0.08, 0.35); whirr(t + 0.04, 0.9); }); },
  match() { play((t) => [659.3, 830.6, 987.8, 1318.5].forEach((f, i) => tone(t + i * 0.065, f, 0.22, 0.1))); },
};
function play(f) {
  if (!sfx.on) return;
  try {
    ctx ||= new AudioContext();
    if (!out) { out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination); }
    if (ctx.state !== 'running') ctx.resume();
    f(ctx.currentTime + 0.005);
  } catch {}
}
function env(t, a, d, peak) { const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(1e-4, t + a + d); g.connect(out); return g; }
function tone(t, f, d, peak, type = 'sine') { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = env(t, 0.004, d, type === 'square' ? peak * 0.35 : peak); o.connect(g); o.start(t); o.stop(t + d + 0.05); }
function blip(t, f, d, peak) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d); o.connect(env(t, 0.001, d, peak)); o.start(t); o.stop(t + d + 0.02); }
function noiseBuf(d) { const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * d), ctx.sampleRate), c = b.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1; return b; }
function noise(t, d, f, peak) { const s = ctx.createBufferSource(); s.buffer = noiseBuf(d + 0.02); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.2; s.connect(bp); bp.connect(env(t, 0.001, d, peak)); s.start(t); }
function whirr(t, d) {                              // the drive spinning up: filtered noise sweeping up, wobbling
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(d + 0.1);
  const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(1400, t + d);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.15); g.gain.linearRampToValueAtTime(0, t + d);
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 28; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g.gain);
  s.connect(lp); lp.connect(g); g.connect(out); s.start(t); lfo.start(t); s.stop(t + d + 0.1); lfo.stop(t + d + 0.1);
}
