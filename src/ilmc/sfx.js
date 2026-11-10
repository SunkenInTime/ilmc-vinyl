// Little interface sounds, synthesised (no samples), in the spirit of a late-90s PC: a mouse click for buttons, a
// two-note bell when a window opens, a soft stab for an error, a CD drive taking a disc and spinning up, a rising
// chime when the song is recognised, a falling one at the end of the side. All original, all quiet, on their own
// audio context, through a little soundcard-style echo; off with "Interface sounds" in Controls.
let ctx = null, out = null, wet = null;
const KEY = 'ilmc-sfx';
const N = (m) => 440 * 2 ** ((m - 69) / 12);          // MIDI note -> Hz
export const sfx = {
  on: (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })(),
  set(on) { this.on = on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {} if (on) this.tick(); },
  click() { play((t) => { noise(t, 0.004, 2800, 0.16, 2); blip(t, 1400, 0.006, 0.05); noise(t + 0.045, 0.003, 3600, 0.06, 2); }); },   // press and release
  tick() { play((t) => { noise(t, 0.003, 4200, 0.12, 3); blip(t, 2200, 0.005, 0.04); }); },
  open() { play((t) => { bell(t, N(79), 0.5, 0.07); bell(t + 0.09, N(84), 0.8, 0.07); }); },
  error() { play((t) => { stab(t, [N(64), N(67)], 0.32, 0.05); stab(t + 0.16, [N(60), N(63)], 0.5, 0.05); }); },
  insert() { play((t) => { thunk(t); whirr(t + 0.12, 1.1); [0.55, 0.68, 0.74, 0.95].forEach((d) => noise(t + d, 0.004, 5200, 0.05, 4)); }); },
  match() {
    play((t) => {
      [72, 76, 79, 83, 86].forEach((m, i) => bell(t + i * 0.075, N(m), 0.9, 0.045));
      pad(t + 0.3, [N(60), N(64), N(67), N(71)], 1.6, 0.022);
    });
  },
  done() { play((t) => { [79, 76, 72].forEach((m, i) => bell(t + i * 0.16, N(m), 1, 0.05)); }); },
};
function play(f) {
  if (!sfx.on) return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
      // the echo: a short feedback delay, darkened, mixed in low
      const d = ctx.createDelay(0.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), mix = ctx.createGain();
      d.delayTime.value = 0.085; fb.gain.value = 0.28; lp.type = 'lowpass'; lp.frequency.value = 2600; mix.gain.value = 0.22;
      wet = ctx.createGain(); wet.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(mix); mix.connect(out);
    }
    if (ctx.state !== 'running') ctx.resume();
    f(ctx.currentTime + 0.005);
  } catch {}
}
function env(t, a, d, peak, send = 0.6) {
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(1e-4, t + a + d);
  g.connect(out); if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(wet); }
  return g;
}
// a small FM bell: an inharmonic modulator that dies away faster than the tone, so it starts bright and rings soft
function bell(t, f, d, peak) {
  const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = env(t, 0.003, d, peak);
  c.frequency.value = f; m.frequency.value = f * 3.5;
  mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.02, t + d * 0.6);
  m.connect(mg); mg.connect(c.frequency); c.connect(g);
  const o2 = ctx.createOscillator(), g2 = env(t, 0.003, d * 0.5, peak * 0.25, 0.3); o2.frequency.value = f * 2; o2.connect(g2);   // a little octave shimmer
  for (const o of [c, m, o2]) { o.start(t); o.stop(t + d + 0.1); }
}
function stab(t, fs, d, peak) {                         // a soft, rounded square dyad
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(500, t + d); lp.Q.value = 0.7;
  lp.connect(env(t, 0.006, d, peak));
  for (const f of fs) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + d + 0.1); }
}
function pad(t, fs, d, peak) {                          // a slow swell under the chime
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.3); g.gain.exponentialRampToValueAtTime(1e-4, t + d);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(g); g.connect(out); const s = ctx.createGain(); s.gain.value = 0.8; g.connect(s); s.connect(wet);
  fs.forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = (i % 2 ? 6 : -6); o.connect(lp); o.start(t); o.stop(t + d + 0.1); });
}
function blip(t, f, d, peak) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d); o.connect(env(t, 0.001, d, peak, 0)); o.start(t); o.stop(t + d + 0.02); }
function noiseBuf(d) { const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * d), ctx.sampleRate), c = b.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1; return b; }
function noise(t, d, f, peak, q = 1.2) { const s = ctx.createBufferSource(); s.buffer = noiseBuf(d + 0.02); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; s.connect(bp); bp.connect(env(t, 0.001, d, peak, 0.2)); s.start(t); }
function thunk(t) {                                     // the tray closing: a dull knock and a latch click
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.08); o.connect(env(t, 0.002, 0.09, 0.22, 0.2)); o.start(t); o.stop(t + 0.15);
  noise(t, 0.02, 900, 0.12, 0.8); noise(t + 0.07, 0.004, 3000, 0.08, 2);
}
function whirr(t, d) {                                  // the drive spinning up: a motor whine rising, and air
  const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(420, t + d * 0.8);
  lp.type = 'bandpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(1600, t + d * 0.8);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.2); g.gain.linearRampToValueAtTime(0.035, t + d * 0.7); g.gain.linearRampToValueAtTime(0, t + d);
  o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(d + 0.1);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2400, t + d);
  const ng = ctx.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.12, t + 0.25); ng.gain.linearRampToValueAtTime(0, t + d);
  s.connect(bp); bp.connect(ng); ng.connect(out); s.start(t); s.stop(t + d + 0.1);
}
