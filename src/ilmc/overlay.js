// Words over the picture, from the videos: lyric words land where they are sung, scattered across the frame in
// clashing typefaces (iPod Touch), while the line runs along the bottom as a yellow serif subtitle (Fuck My
// Computer). Between the vocals the jig chops the song's own words. Before a drop the screen is spammed with the
// stutter, harder and harder, and on the downbeat every word is blown off the screen.
// five faces, black and white, as in the iPod Touch video: a high-contrast italic serif, a tall condensed sans,
// a slab on a white card, the condensed sans on a black card, and a blackletter
// her type, from the videos: Times stretched tall and thin (iPod Touch), spaced small caps, a royal-blue condensed
// grotesk and red script (the Fuck My Computer plates), neon green and magenta condensed (IT SAYS MY NAME)
import { Desk } from './desk.js';
const SERIF = '"Times New Roman", Times, serif';
const STYLES = [
  { font: `400 {s}px ${SERIF}`, fill: '#fff', sx: 0.6, sy: 1.75, soft: true },
  { font: `small-caps 400 {s}px ${SERIF}`, fill: '#fff', sx: 1.25, soft: true },
  { font: '700 {s}px Oswald', fill: '#1f33ff', sx: 0.85, sy: 1.3, keep: true },
  { font: '{s}px "Pinyon Script"', fill: '#e3122e', sx: 1.1, keep: true },
  { font: '700 {s}px Oswald', fill: '#38ff32', sx: 0.75, sy: 1.5, keep: true },
  { font: '700 {s}px Oswald', fill: '#ff2bd8', sx: 0.75, sy: 1.5, keep: true },
];
const BIG = [{ font: '700 {s}px Oswald', fill: '#1f33ff', sx: 0.85, sy: 1.35, keep: true }, { font: `400 {s}px ${SERIF}`, fill: '#fff', sx: 0.6, sy: 1.8, soft: true }];
const SPAM = ['FUCK', 'F-', 'FU-', 'FUCK', 'F-F-F-', 'WANT', 'WANNA', 'I WANNA', 'FUCK', 'MY COMPUTER', 'F—', 'FUUU'];
const hash = (n) => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

export class Overlay {
  constructor(el) {
    this.c = el; this.x = el.getContext('2d');
    this.words = []; this.sub = ''; this.line = -1; this.n = 0; this.cycle = -1; this.group = -1;
    this.desk = new Desk(); this.hole = null;
  }
  rnd() { return hash(this.n++ * 7919 + 13); }
  place(big) {
    const W = this.c.width, H = this.c.height; let best = null;
    for (let k = 0; k < 24; k++) {
      const p = big ? [W * (0.3 + 0.4 * this.rnd()), H * (0.3 + 0.32 * this.rnd())] : [W * (0.06 + 0.86 * this.rnd()), H * (0.1 + 0.74 * this.rnd())];
      let score = -Math.max(0, 1 - Math.hypot((p[0] / W - 0.5) / 0.24, (p[1] / H - 0.55) / 0.3)) * (big ? 0.2 : 2) + this.rnd() * 0.3;
      for (const o of this.words) if (!o.gone) score -= Math.max(0, 1 - Math.hypot((o.x - p[0]) / W, (o.y - p[1]) / H) / 0.2);
      if (!best || score > best.s) best = { p, s: score };
    }
    return best.p;
  }
  add(w, st, size, x, y, extra = {}) {
    this.words.push({ w, st, size, x, y, vx: 0, vy: 0, rot: extra.rot ?? (this.rnd() - 0.5) * 0.12, vr: 0, sc: 1, vs: 0, a: 1, t: 0, gone: false, glitch: extra.glitch || 0 });
    const live = this.words.filter((o) => !o.gone && !o.dlg);
    if (live.length > (extra.cap || 10)) { const old = live[0]; old.gone = true; old.vy = -60; old.va = 5; }
  }
  // a sung word. cut words ("f-") come out big, as F—, tearing
  lyric(word, line, power, subOnly = false) {
    const base = Math.min(this.c.width * 0.62, this.c.height);
    if (line !== this.line) {                                    // a new line: the old words drift off
      for (const o of this.words) if (!o.gone) { o.gone = true; o.va = 2.5; o.vy = -20 - 40 * this.rnd(); }
      this.line = line; this.sub = '';
    }
    const cut = /-$/.test(word), show = cut ? word.replace(/-$/, '—').toUpperCase() : word.replace(/[,.]$/, '');
    const key = /computer|fuck|name|better|world/i.test(word);
    const st = cut ? BIG[0] : key ? STYLES[[2, 3, 4, 5][Math.floor(this.rnd() * 4)]] : STYLES[Math.floor(this.rnd() * 2)];
    const size = (cut ? 0.15 : key ? 0.08 + 0.04 * this.rnd() : 0.032 + 0.035 * this.rnd()) * base * (0.8 + 0.4 * power);
    if (!subOnly) { const [x, y] = this.place(cut || /computer/i.test(word)); this.add(show, st, size, x, y, { glitch: cut ? 1 : 0 }); }
    this.sub = (this.sub ? this.sub + ' ' : '') + (cut ? word.slice(0, -1).toUpperCase() + '—' : word.toUpperCase().replace(/[,.]$/, ''));
  }
  // between the vocals: the jig chops the song's words (4-5-6-2 per bar)
  hit(cycle, g, i, n, power, vocab) {
    if (cycle !== this.cycle || g < this.group) for (const o of this.words) if (!o.gone) { o.gone = true; o.va = 3; }
    if (g !== this.group) this.sub = '';
    this.cycle = cycle; this.group = g; this.line = -1;
    const line = vocab[((g % vocab.length) + vocab.length) % vocab.length], w = line[i % line.length], big = g === 3;
    const st = big ? BIG[i % 2] : STYLES[Math.floor(this.rnd() * STYLES.length)];
    const base = Math.min(this.c.width * 0.62, this.c.height);
    const size = (big ? 0.1 : st.small ? 0.026 : 0.03 + 0.04 * this.rnd() * (0.5 + power)) * base;
    const [x, y] = this.place(big);
    this.add(w, st, size, x, y, { cap: 8 });
    this.sub = (this.sub ? this.sub + ' ' : '') + w.toUpperCase();
  }
  // the stutter before a drop: k words at once, anywhere, any size, some of them tearing apart
  spam(k, s) {
    const W = this.c.width, H = this.c.height, base = Math.min(W * 0.62, H);
    for (let j = 0; j < k; j++) {
      const w = SPAM[Math.floor(this.rnd() * SPAM.length)], st = this.rnd() < 0.3 ? BIG[Math.floor(this.rnd() * 2)] : STYLES[Math.floor(this.rnd() * STYLES.length)];
      const size = (0.03 + 0.22 * Math.pow(this.rnd(), 2.5) * (0.4 + s)) * base;
      this.add(w, st, size, W * this.rnd(), H * (0.05 + 0.9 * this.rnd()), { rot: (this.rnd() - 0.5) * (0.2 + 1.2 * s), glitch: this.rnd() < s ? 1 : 0, cap: 260 });
    }
    this.line = -1;
  }
  // the downbeat: everything flies out from the middle, spinning, growing, gone
  obliterate() {
    const W = this.c.width, H = this.c.height; this.casc = null;
    for (const o of this.words) {
      const dx = o.x - W / 2, dy = o.y - H * 0.5, d = Math.hypot(dx, dy) + 1, sp = (1400 + 2600 * this.rnd()) * (W / 1600);
      o.vx = dx / d * sp; o.vy = dy / d * sp; o.vr = (this.rnd() - 0.5) * 18; o.vs = 2 + 4 * this.rnd(); o.gone = true; o.va = 2.2;
    }
    this.sub = '';
  }
  // a word as broken data: drawn once off-screen, then put back in horizontal slices, some shoved sideways, one
  // column of pixels smeared out across it, and now and then the whole thing crunched down to a few big pixels
  glitchText(x, o, st, m, ink) {
    const s = o.size, w = Math.ceil(m.width + s * 0.4), h = Math.ceil(s * 1.5);
    const c = this.scratch ||= document.createElement('canvas'), g = c.getContext('2d');
    if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
    g.clearRect(0, 0, w, h); g.font = x.font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (st.stroke) { g.lineWidth = Math.max(2, s * 0.045); g.strokeStyle = ink; g.strokeText(o.w, w / 2, h / 2); } else { g.fillStyle = ink; g.fillText(o.w, w / 2, h / 2); }
    const seed = Math.floor(performance.now() / 60) * 31 + Math.round(s), r = (k) => hash(seed * 7 + k);
    if (r(1) < 0.25) {                                    // crunch: down to big pixels and back up
      const p = this.crunch ||= document.createElement('canvas'), q = p.getContext('2d'), f = 0.08 + r(2) * 0.1;
      p.width = Math.max(1, Math.round(w * f)); p.height = Math.max(1, Math.round(h * f)); q.imageSmoothingEnabled = false; q.drawImage(c, 0, 0, w, h, 0, 0, p.width, p.height);
      x.imageSmoothingEnabled = false; x.drawImage(p, 0, 0, p.width, p.height, -w / 2, -h / 2, w, h); x.imageSmoothingEnabled = true;
      return;
    }
    let y = 0, k = 3;
    while (y < h) {                                       // slices, a few of them shoved sideways
      const bh = Math.max(2, Math.round(h * (0.05 + r(k) * 0.22))), dx = r(k + 1) < 0.4 ? (r(k + 2) - 0.5) * s * 0.9 : 0;
      x.drawImage(c, 0, y, w, Math.min(bh, h - y), -w / 2 + dx, -h / 2 + y, w, Math.min(bh, h - y)); y += bh; k += 3;
    }
    if (r(9) < 0.6) {                                     // one column of pixels smeared out sideways
      const sx = Math.floor(w * (0.2 + r(10) * 0.6)), y0 = Math.floor(h * r(11) * 0.6), hh = Math.max(2, Math.floor(h * (0.1 + r(12) * 0.3)));
      x.drawImage(c, sx, y0, 1, hh, -w / 2 + sx, -h / 2 + y0, w * (0.2 + r(13) * 0.7), hh);
    }
  }
  // overload: an error dialog, one more in the cascade that trails down and across the screen, on the beat
  dialog(text, s, sprite) {
    const W = this.c.width, H = this.c.height, k = Math.min(W, H * 1.6) / 1600;
    const c = this.casc ||= { x: W * 0.22, y: H * 0.16, n: 0 };
    const step = (10 + 12 * s) * k;
    c.x += step; c.y += step * 0.86; c.n++;
    if (c.y > H * 0.82 || c.x > W * 0.8) { c.n = 0; c.y = H * (0.06 + this.rnd() * 0.2); c.x = W * (0.05 + this.rnd() * 0.5); }
    this.words.push({ dlg: true, img: sprite, w: text, size: (420 + 200 * s) * k, x: c.x, y: c.y, vx: 0, vy: 0, rot: 0, vr: 0, sc: 1, vs: 0, a: 1, t: 0, gone: false, st: STYLES[0] });
    const live = this.words.filter((o) => o.dlg && !o.gone); if (live.length > 260) { live[0].gone = true; live[0].va = 30; }
  }
  drawDialog(x, o) {
    const w = o.size, h = o.size * 0.42, tb = h * 0.2, r = Math.max(2, w * 0.02);
    x.translate(-w / 2, -h / 2);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(4, 5, w, h);
    x.fillStyle = '#ece9d8'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, tb); g.addColorStop(0, '#3d8bff'); g.addColorStop(0.45, '#0a54e3'); g.addColorStop(1, '#0839b0');
    x.fillStyle = g; x.beginPath(); x.roundRect(0, 0, w, tb, [r, r, 0, 0]); x.fill();
    x.strokeStyle = '#0831a3'; x.lineWidth = Math.max(1, w * 0.006); x.strokeRect(0, 0, w, h);
    x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.font = `bold ${Math.round(tb * 0.56)}px Tahoma, Verdana, sans-serif`; x.fillText('Fuck My Computer', tb * 0.35, tb * 0.52);
    x.fillStyle = '#e24a2a'; x.fillRect(w - tb * 0.95, tb * 0.12, tb * 0.78, tb * 0.76); x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText('×', w - tb * 0.56, tb * 0.5);
    const cy = tb + (h - tb) * 0.42, ir = (h - tb) * 0.2;                 // the red error icon and the word
    x.fillStyle = '#d4242a'; x.beginPath(); x.arc(tb * 0.9 + ir, cy, ir, 0, 7); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = ir * 0.28; x.beginPath(); x.moveTo(tb * 0.9 + ir * 0.55, cy - ir * 0.45); x.lineTo(tb * 0.9 + ir * 1.45, cy + ir * 0.45); x.moveTo(tb * 0.9 + ir * 1.45, cy - ir * 0.45); x.lineTo(tb * 0.9 + ir * 0.55, cy + ir * 0.45); x.stroke();
    x.fillStyle = '#000'; x.textAlign = 'left'; x.font = `bold ${Math.round((h - tb) * 0.26)}px Tahoma, Verdana, sans-serif`; x.fillText(o.w, tb * 1.4 + ir * 2, cy);
    x.fillStyle = '#f4f3ee'; const bw = w * 0.2, bh = (h - tb) * 0.24; x.fillRect(w / 2 - bw / 2, h - bh * 1.35, bw, bh); x.strokeStyle = '#003c74'; x.lineWidth = 1; x.strokeRect(w / 2 - bw / 2, h - bh * 1.35, bw, bh);
    x.fillStyle = '#000'; x.textAlign = 'center'; x.font = `${Math.round(bh * 0.55)}px Tahoma, Verdana, sans-serif`; x.fillText('OK', w / 2, h - bh * 0.85);
  }
  clear() { for (const o of this.words) { o.gone = true; o.va = 6; } this.sub = ''; this.line = -1; }
  setSub(s) { this.sub = s; }
  // take: { kind, p } while the computer has the whole picture (desk.js); this.hole is then where the live clip shows through
  draw(dt, alpha, sky = 0, shake = 0, take = null) {
    const light = sky > 0.9;                                // dark ink only when the bright sky is fully up
    const c = this.c, dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = this.x; x.clearRect(0, 0, w, h);
    for (const o of this.words) {                         // motion: fly, spin, grow, fade
      o.t += dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt; o.sc *= 1 + o.vs * dt;
      if (o.gone) o.a -= (o.va || 3) * dt;
    }
    this.words = this.words.filter((o) => o.a > 0.01 && o.x > -w && o.x < 2 * w && o.y > -h && o.y < 2 * h);
    this.hole = take ? this.desk.draw(x, w, h, take.kind, take.p, dt) : null; if (!take && this.desk.n) this.desk.reset();
    if (alpha <= 0.01) return;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const fr = Math.floor(performance.now() / 33), sx = shake * (hash(fr) - 0.5) * w * 0.03, sy = shake * (hash(fr + 7) - 0.5) * h * 0.03;
    let budget = 24;                                      // glitching is drawn on the newest two dozen words only
    for (const o of this.words) {
      const k = Math.min(1, o.t / 0.08), pop = o.t < 0.08 ? 1.3 - 0.3 * k : 1 + 0.04 * Math.exp(-o.t * 12);
      const st = o.st; x.save(); x.globalAlpha = alpha * Math.max(0, Math.min(1, o.a));
      if (o.dlg) {
        x.translate(o.x + sx, o.y + sy); x.rotate(o.rot); const pop = o.t < 0.06 ? 0.85 + 2.5 * o.t : 1; x.scale(o.sc * pop, o.sc * pop);
        if (o.img) { const w = o.size, h = w * o.img.height / o.img.width; x.drawImage(o.img, -w / 2, -h / 2, w, h); } else this.drawDialog(x, o);
        x.restore(); continue;
      }
      x.translate(o.x + sx, o.y + sy); x.rotate(o.rot); x.scale((st.sx || 1) * pop * o.sc, (st.sy || 1) * pop * o.sc);
      x.font = st.font.replace('{s}', Math.round(o.size));
      const m = x.measureText(o.w);
      const tear = o.glitch && budget-- > 0 && hash(Math.floor(performance.now() / 60) + Math.round(o.size)) < 0.6;
      if (st.box) { x.fillStyle = st.box; x.fillRect(-m.width / 2 - o.size * 0.12, -o.size * 0.62, m.width + o.size * 0.24, o.size * 1.18); }
      if (st.glow) { x.shadowColor = 'rgba(255,255,255,.9)'; x.shadowBlur = o.size * 0.3; }
      else if (st.soft) { x.shadowColor = light ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.6)'; x.shadowBlur = o.size * 0.12; x.shadowOffsetY = o.size * 0.03; }
      const ink = st.stroke ? (light ? '#000' : st.stroke) : (light && st.fill === '#fff' && !st.keep ? '#000' : st.fill);
      if (tear) { x.shadowBlur = 0; this.glitchText(x, o, st, m, ink); }
      else if (st.stroke) { x.lineWidth = Math.max(2, o.size * 0.045); x.strokeStyle = ink; x.strokeText(o.w, 0, 0); }
      else { x.fillStyle = ink; x.fillText(o.w, 0, 0); }
      x.restore();
    }
    if (this.photo > 0.02) {                               // a cheap camera's date stamp, burnt into the corner of the photograph (the album's release day)
      const s = Math.max(15, Math.min(w, h * 1.5) * 0.026);
      x.globalAlpha = Math.min(1, this.photo * 1.6); x.font = `bold ${s}px "Courier New", Courier, monospace`; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
      x.shadowColor = 'rgba(255,120,0,.8)'; x.shadowBlur = s * 0.35; x.fillStyle = '#ffb347'; x.fillText("'25  8  8", w - s * 2.2, h - s * 2.4); x.shadowBlur = 0; x.textAlign = 'center'; x.textBaseline = 'middle';
    }
    if (this.sub) {                                       // the subtitle, DVD yellow with a black edge
      const s = Math.max(16, Math.min(w, h * 1.4) * 0.028);
      x.globalAlpha = alpha; x.font = `italic 700 ${s}px "Times New Roman", Times, serif`; x.lineJoin = 'round';
      x.lineWidth = s * 0.16; x.strokeStyle = 'rgba(0,0,0,.92)'; x.strokeText(this.sub, w / 2 + sx, h - s * 3.2 + sy, w * 0.9);
      x.fillStyle = '#ffe10a'; x.fillText(this.sub, w / 2 + sx, h - s * 3.2 + sy, w * 0.9);
    }
    x.globalAlpha = 1;
  }
}
