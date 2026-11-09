// What the scene listens to: the deck's real output (after the stylus, the cartridge and the RIAA curve), plus
// the song's map (assets/ilmc/fmc.json: tempo, downbeats, sections, lyrics, chops), read at wherever the needle is in the groove.
// Scratch the record backwards and the beat runs backwards; stop the platter and the room goes quiet.

const BINS = 128, WAVE = 512;

export class Listener {
  constructor() {
    this.spec = new Float32Array(BINS);          // 0..1, log-spaced 30 Hz .. 16 kHz, smoothed
    this.peak = new Float32Array(BINS);          // falling peak caps
    this.wavL = new Float32Array(WAVE); this.wavR = new Float32Array(WAVE);
    this.level = 0; this.sub = 0; this.low = 0; this.mid = 0; this.high = 0;
    this.kick = 0; this.snare = 0; this.hat = 0;    // onset envelopes, 1 on a hit, decaying
    this.kicks = 0;                               // count of detected kicks
    this._avg = { low: 0, mid: 0, high: 0 }; this._prev = { low: 0, mid: 0, high: 0 };
  }
  attach(ctx, node) {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    const fft = this.fft = ctx.createAnalyser(); fft.fftSize = 4096; fft.smoothingTimeConstant = 0.5; fft.minDecibels = -90; fft.maxDecibels = -12;
    const split = ctx.createChannelSplitter(2), aL = this.aL = ctx.createAnalyser(), aR = this.aR = ctx.createAnalyser();
    aL.fftSize = aR.fftSize = 1024;
    node.connect(fft); node.connect(split); split.connect(aL, 0); split.connect(aR, 1);
    this.fbuf = new Float32Array(fft.frequencyBinCount); this.tL = new Float32Array(1024); this.tR = new Float32Array(1024);
    const hz = ctx.sampleRate / fft.fftSize;
    this.map = Array.from({ length: BINS + 1 }, (_, i) => Math.max(1, Math.round(30 * Math.pow(16000 / 30, i / BINS) / hz)));
    this.hzBin = (f) => Math.round(f / hz);
  }
  update(dt) {
    if (!this.fft) return;
    const f = this.fbuf; this.fft.getFloatFrequencyData(f);
    const db = (i) => Math.max(0, Math.min(1, (f[i] + 90) / 78));
    for (let b = 0; b < BINS; b++) {
      let m = 0; for (let i = this.map[b]; i <= Math.max(this.map[b], this.map[b + 1] - 1); i++) m = Math.max(m, db(i));
      m = Math.pow(m, 1.6) * (0.75 + 0.5 * b / BINS);        // tilt: the top end is quieter on any record
      this.spec[b] += (m - this.spec[b]) * (m > this.spec[b] ? 0.7 : 0.25);
      this.peak[b] = Math.max(this.spec[b], this.peak[b] - dt * 0.6);
    }
    const band = (lo, hi) => { let s = 0, n = 0; for (let i = this.hzBin(lo); i <= this.hzBin(hi); i++) { s += Math.pow(10, f[i] / 20); n++; } return Math.sqrt(s / Math.max(1, n)); };
    const raw = { low: band(35, 130), mid: band(1500, 4500), high: band(7000, 14000) };
    const sub = band(25, 60);
    this.aL.getFloatTimeDomainData(this.tL); this.aR.getFloatTimeDomainData(this.tR);
    let rms = 0;
    for (let i = 0; i < WAVE; i++) { this.wavL[i] = this.tL[i * 2]; this.wavR[i] = this.tR[i * 2]; rms += this.tL[i * 2] ** 2 + this.tR[i * 2] ** 2; }
    rms = Math.sqrt(rms / (2 * WAVE));
    const k = 1 - Math.exp(-dt * 18);
    this.level += (Math.min(1, rms * 3.2) - this.level) * k;
    this.sub += (Math.min(1, sub * 14) - this.sub) * k;
    // onsets: a band jumping well above its own recent average
    const onset = (name, gain, thr) => {
      const v = raw[name], a = this._avg[name], p = this._prev[name];
      this._avg[name] = a + (v - a) * (1 - Math.exp(-dt * 3));
      this._prev[name] = v;
      return v > a * thr && v > p * 1.08 && v * gain > 0.12;
    };
    this.low += (Math.min(1, raw.low * 9) - this.low) * k; this.mid += (Math.min(1, raw.mid * 40) - this.mid) * k; this.high += (Math.min(1, raw.high * 90) - this.high) * k;
    const decay = Math.exp(-dt * 9);
    this.kick *= decay; this.snare *= decay; this.hat *= Math.exp(-dt * 16);
    if (onset('low', 9, 1.35) && this.kick < 0.5) { this.kick = 1; this.kicks++; }
    if (onset('mid', 40, 1.5) && this.snare < 0.5) this.snare = 1;
    if (onset('high', 90, 1.4) && this.hat < 0.5) this.hat = 1;
  }
}

// The 4-5-6-2 jig: four bars, and in them 4, 5, 6 and then 2 hits, on sixteenths.
export const JIG = [[0, 4, 8, 12], [0, 3, 6, 10, 12], [0, 3, 6, 8, 11, 14], [0, 8]];

export class Song {
  constructor(map) {
    this.m = map;
    const dec = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    this.low = dec(map.low); this.mid = dec(map.mid); this.high = dec(map.high); this.onset = dec(map.onset); this.wave = dec(map.wave);
    this.bars = map.bars;
    // a lone quieter bar inside a drop is still the drop (and a lone loud bar in a build is not): majority of five bars
    this.bars.forEach((x, i) => {
      let n = 0; for (let k = i - 2; k <= i + 2; k++) n += this.bars[Math.max(0, Math.min(this.bars.length - 1, k))].sec === 'drop' ? 1 : 0;
      x.zone = n >= 3 ? 'drop' : x.sec === 'drop' ? 'build' : x.sec;
    });
  }
  // everything about a moment in the song (seconds from the start of the track)
  at(t) {
    const m = this.m, b = (t - m.beat0) / m.beatLen, bar = Math.floor(b / 4), i = Math.min(this.bars.length - 1, Math.max(0, bar));
    const f = Math.max(0, Math.min(this.low.length - 1, Math.round(t * m.fps)));
    const bi = this.bars[i];
    return {
      t, beat: b, bar, beatInBar: b - bar * 4, sixteenth: Math.floor(b * 4),
      sec: t < m.beat0 || t > m.dur ? 'break' : bi.zone, energy: bi.e, barLow: bi.lo,
      next: this.bars[i + 1]?.sec, prev: this.bars[i - 1]?.sec,
      low: this.low[f] / 255, mid: this.mid[f] / 255, high: this.high[f] / 255, onset: this.onset[f] / 255,
      progress: Math.max(0, Math.min(1, t / m.dur)),
    };
  }
}
