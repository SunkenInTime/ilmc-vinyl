// The whole picture taken over by the computer itself, for the moments the song stops dead:
//   crash   the blue screen, full frame, cursor blinking
//   window  a Windows 98 desktop on the Bliss wallpaper, and the drop still playing inside a "System message" window that
//           hangs: on every hit it jumps and leaves a frozen copy behind (the trail a stuck window drags), until the
//           pointer finds OK
//   off     the last card: it is now safe to turn off your computer
// Drawn on the 2D canvas over the GL picture; the live clip inside the window is a hole in it (post.js draws the picture
// into the same rectangle).
import { systemMessage } from './win98.js';

const MONO = '"Lucida Console", "Courier New", monospace', UI = 'Tahoma, "MS Sans Serif", Arial, sans-serif';
const BSOD = ['', 'A fatal exception 0E has occurred at 0028:C0011E36 in VXD VMM(01) +', '00010E36. The current application will be terminated.', '',
  '*  Press any key to terminate the current application.', '*  Press CTRL+ALT+DEL again to restart your computer. You will', '   lose any unsaved information in all applications.', '', ''];

export class Desk {
  constructor() { this.trail = []; this.n = 0; this.t = 0; }
  reset() { this.trail = []; this.n = 0; this.t = 0; this.pos = null; }
  // where the live window stands (canvas px) after n jumps, and the hole its clip leaves: same proportions as win98.js
  frame(w, h, n = this.n) {
    const W = Math.round(Math.min(w * 0.44, h * 0.76)), H = Math.round(W * 0.74), step = Math.round(W * 0.042);     // six jumps end in the middle of the screen
    const X = Math.round(w * 0.5 - W * 0.5 + (n - 6) * step * 1.3), Y = Math.round(h * 0.49 - H * 0.5 + (n - 6) * step);
    const cap = Math.round(W * 0.062), fx = Math.round(W * 0.085), fy = 4 + cap + Math.round(W * 0.035), fw = W - 2 * fx, fh = Math.round(H * 0.56);
    const ow = Math.round(W * 0.34), oh = Math.round(H * 0.11);
    return { X, Y, W, H, clip: [X + fx, Y + fy, fw, fh], ok: [X + (W - ow) / 2, Y + fy + fh + Math.round(H * 0.06), ow, oh] };
  }
  // a hit: the window jumps, and what it showed stays behind as a dead copy
  jump(still) { if (this.n >= 7) return; this.trail.push({ n: this.n, still }); this.n++; }
  wallpaper(w, h) {
    if (this.wall && this.wall.width === w && this.wall.height === h) return this.wall;
    const c = this.wall = Object.assign(document.createElement('canvas'), { width: w, height: h }), x = c.getContext('2d');
    let g = x.createLinearGradient(0, 0, 0, h * 0.62); g.addColorStop(0, '#1f5ddc'); g.addColorStop(0.55, '#5c9bea'); g.addColorStop(1, '#b9d9f6'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.9)'; x.filter = `blur(${Math.round(h * 0.012)}px)`;
    for (const [cx, cy, r] of [[0.14, 0.2, 0.09], [0.2, 0.16, 0.07], [0.26, 0.21, 0.08], [0.58, 0.1, 0.06], [0.64, 0.13, 0.08], [0.72, 0.1, 0.06], [0.88, 0.3, 0.09], [0.94, 0.26, 0.07], [0.42, 0.34, 0.07], [0.48, 0.31, 0.06]]) {
      x.beginPath(); x.ellipse(cx * w, cy * h, r * w, r * h * 0.55, 0, 0, 7); x.fill();
    }
    x.filter = 'none';
    const hillPath = (y0, y1, c1, c2) => { x.beginPath(); x.moveTo(0, h); x.lineTo(0, y0 * h); x.bezierCurveTo(w * 0.3, (y0 - 0.16) * h, w * 0.62, (y1 + 0.12) * h, w, y1 * h); x.lineTo(w, h); x.closePath();
      const gg = x.createLinearGradient(0, Math.min(y0, y1) * h - h * 0.1, 0, h); gg.addColorStop(0, c1); gg.addColorStop(1, c2); x.fillStyle = gg; x.fill(); };
    hillPath(0.66, 0.5, '#8fcf3a', '#3f8f1c'); hillPath(0.6, 0.78, '#77c22c', '#2d7a14');
    return c;
  }
  bevel(x, X, Y, w, h, up, k) {
    x.fillStyle = up ? '#fff' : '#808080'; x.fillRect(X, Y, w, k); x.fillRect(X, Y, k, h);
    x.fillStyle = up ? '#404040' : '#fff'; x.fillRect(X, Y + h - k, w, k); x.fillRect(X + w - k, Y, k, h);
  }
  taskbar(x, w, h, k) {
    const th = Math.round(30 * k), y = h - th;
    x.fillStyle = '#c0c0c0'; x.fillRect(0, y, w, th); x.fillStyle = '#fff'; x.fillRect(0, y + k, w, k);
    const bw = Math.round(62 * k), bh = th - Math.round(8 * k), by = y + Math.round(5 * k), bx = Math.round(3 * k);
    x.fillStyle = '#c0c0c0'; x.fillRect(bx, by, bw, bh); this.bevel(x, bx, by, bw, bh, true, Math.max(1, Math.round(k)));
    const f = Math.round(4.5 * k), lx = bx + Math.round(6 * k), ly = by + bh / 2 - f;                    // the flag: four panes
    for (const [i, j, col] of [[0, 0, '#e03c1f'], [1, 0, '#3aa33a'], [0, 1, '#2f6fdb'], [1, 1, '#f2c21a']]) { x.fillStyle = col; x.fillRect(lx + i * (f + 1), ly + j * (f + 1), f, f); }
    x.fillStyle = '#000'; x.font = `bold ${Math.round(12.5 * k)}px ${UI}`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('Start', lx + 2 * f + Math.round(6 * k), by + bh / 2 + k);
    const cw = Math.round(70 * k), cx = w - cw - Math.round(4 * k); this.bevel(x, cx, by, cw, bh, false, Math.max(1, Math.round(k)));
    const d = new Date(); x.font = `${Math.round(12 * k)}px ${UI}`; x.textAlign = 'center';
    x.fillText(d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), cx + cw / 2, by + bh / 2 + k);
    // one task on the bar: the window that will not close
    const tx = bx + bw + Math.round(10 * k), tw = Math.round(150 * k); this.bevel(x, tx, by, tw, bh, false, Math.max(1, Math.round(k)));
    x.fillStyle = '#000'; x.font = `bold ${Math.round(11.5 * k)}px ${UI}`; x.textAlign = 'left'; x.fillText('System message', tx + Math.round(8 * k), by + bh / 2 + k);
  }
  pointer(x, px, py, k) {                                          // the arrow
    x.save(); x.translate(px, py); x.scale(k * 1.3, k * 1.3); x.beginPath();
    x.moveTo(0, 0); x.lineTo(0, 16); x.lineTo(4, 12.5); x.lineTo(6.8, 19); x.lineTo(9.2, 18); x.lineTo(6.5, 11.6); x.lineTo(11.5, 11.6); x.closePath();
    x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1; x.stroke(); x.restore();
  }
  // kind: 'crash' | 'window' | 'off'; p: 0..1 through it; returns the clip's hole for the GL pass (window), or null
  draw(x, w, h, kind, p, dt, live) {
    this.t += dt; const k = Math.max(1, h / 720);
    if (kind === 'crash') {
      // it arrives the way a text screen is drawn: top to bottom, in three frames, over the picture frozen behind it
      const rows = Math.min(1, p / 0.035); x.save(); x.beginPath(); x.rect(0, 0, w, Math.ceil(h * rows)); x.clip();
      x.fillStyle = '#0000aa'; x.fillRect(0, 0, w, h);
      const fs = Math.round(Math.min(w / 46, h / 22)), lh = fs * 1.45, cw = fs * 0.6, X0 = (w - 67 * cw) / 2, Y0 = h * 0.5 - lh * 5;
      x.font = `${fs}px ${MONO}`; x.textBaseline = 'top'; x.textAlign = 'center';
      x.fillStyle = '#aaaaaa'; x.fillRect(w / 2 - cw * 5.2, Y0 - lh * 0.12, cw * 10.4, lh * 0.95); x.fillStyle = '#0000aa'; x.fillText(' Windows ', w / 2, Y0);
      x.fillStyle = '#fff'; x.textAlign = 'left'; BSOD.forEach((l, i) => x.fillText(l, X0, Y0 + lh * (i + 1)));
      x.textAlign = 'center'; x.fillText('Press any key to continue ' + (Math.floor(this.t * 3.3) % 2 ? '_' : ' '), w / 2, Y0 + lh * (BSOD.length + 1));
      x.restore();
      return null;
    }
    if (kind === 'off') {
      x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
      const a = Math.max(0, Math.min(1, (p - 0.25) * 4)), fs = Math.round(Math.min(w / 22, h / 11));
      x.globalAlpha = a; x.fillStyle = '#f4a11c'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
      x.fillText("It's now safe to turn off", w / 2, h / 2 - fs * 0.62); x.fillText('your computer.', w / 2, h / 2 + fs * 0.62); x.globalAlpha = 1;
      return null;
    }
    // the desktop comes up the way it does after a crash: the wallpaper, then the taskbar, then the window that was open
    x.drawImage(this.wallpaper(w, h), 0, 0); if (p > 0.03) this.taskbar(x, w, h, k);
    if (p < 0.07) { this.pointer(x, w * 0.86, h * 0.2, k); return null; }
    for (const tr of this.trail) {                                   // the dead copies, oldest underneath
      const f = this.frame(w, h, tr.n);
      tr.sprite ||= systemMessage(tr.still, f.W); x.drawImage(tr.sprite, f.X, f.Y, f.W, f.H);
    }
    const f = this.frame(w, h), pressed = p > 0.965;
    if (!this.main || this.main.width !== f.W) this.main = systemMessage(null, f.W);
    x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(f.X + 5 * k, f.Y + 6 * k, f.W, f.H);
    x.drawImage(this.main, f.X, f.Y);
    if (pressed) { const [ox, oy, ow, oh] = f.ok; x.fillStyle = '#ecebe5'; x.fillRect(ox, oy, ow, oh); this.bevel(x, ox, oy, ow, oh, false, 1.5); x.fillStyle = '#000'; x.font = `${Math.round(oh * 0.62)}px Arial, Helvetica, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('OK', ox + ow / 2 + 1.5, oy + oh / 2 + 2.5); }
    x.clearRect(...f.clip);                                          // the live clip shows through
    // the pointer drifts in from the corner and lands on OK just before the bar line
    const e = Math.min(1, p / 0.94), s = e * e * (3 - 2 * e), tx = f.ok[0] + f.ok[2] * 0.55, ty = f.ok[1] + f.ok[3] * 0.5;
    this.pointer(x, w * 0.86 + (tx - w * 0.86) * s, h * 0.2 + (ty - h * 0.2) * s + Math.sin(e * Math.PI) * h * 0.05, k);
    return f.clip;
  }
}
