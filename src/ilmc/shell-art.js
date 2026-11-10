// Everything printed in the bedroom (shell.js), painted once into one atlas so the whole room draws with one texture:
// posters, rave flyers, photos, magazine pages and printed System message windows taped up crooked; stickers; a
// calendar, a timetable, post-its, a cork board, a crayon drawing of her computer; the duvet's print, the curtains,
// the door, book and CD spines, the hi-fi's face, the street outside the window, the ceiling's glow stars.
// All original artwork in her world (wallpaper skies, the :3 face, her type plates). Nothing here is a real band,
// brand, character or the album's cover.
//
//   const art = await paintAtlas({ lite });   // { canvas, cell(name) -> { u0, v0, u1, v1, w, h } (w, h in metres), list(kind) }
// Painting yields to the page between pieces, so it never holds a frame for long.
import { drawFace } from './label.js';
import { systemMessage } from './win98.js';
import { plate, sky, cover, mulberry } from './props-made.js';

const idle = () => new Promise((r) => setTimeout(r, 0));          // a breath for the page between pieces
const SERIF = '"Times New Roman", Times, serif', HAND = '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive', MONO = '"Courier New", Courier, monospace';
const face = (x, cx, cy, s) => drawFace(x, cx, cy, s, { bg: true });

// ---------- small things that get drawn on many pieces ----------
function tape(x, cx, cy, len, ang, wid = len * 0.32) {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  x.fillStyle = 'rgba(236,226,190,0.93)'; x.beginPath();
  const h = wid / 2, l = len / 2; x.moveTo(-l, -h);
  for (let i = 0; i <= 6; i++) x.lineTo(l + (i % 2 ? 2 : -1), -h + (wid * i) / 6);   // torn ends
  for (let i = 6; i >= 0; i--) x.lineTo(-l + (i % 2 ? -2 : 1), -h + (wid * i) / 6);
  x.fill(); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(-l, -h, len, wid * 0.3); x.restore();
}
function pin(x, cx, cy, r, col) {
  x.save(); x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.arc(cx + r * 0.35, cy + r * 0.45, r, 0, 7); x.fill();
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r); g.addColorStop(0, '#fff'); g.addColorStop(0.25, col); g.addColorStop(1, 'rgba(0,0,0,.6)');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.restore();
}
// old paper: a slightly warm, uneven, scuffed top layer
function age(x, w, h, R, k = 1) {
  x.save(); x.globalCompositeOperation = 'multiply';
  const g = x.createRadialGradient(w * (0.3 + R() * 0.4), h * (0.3 + R() * 0.4), 0, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(214,196,160,${0.35 * k})`); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 14 * k; i++) { x.strokeStyle = `rgba(255,255,255,${0.05 + R() * 0.1})`; x.lineWidth = 0.6 + R(); x.beginPath(); const a = R() * w, b = R() * h; x.moveTo(a, b); x.lineTo(a + (R() - 0.5) * w * 0.4, b + (R() - 0.5) * h * 0.1); x.stroke(); }
  // a fold line or two
  if (R() < 0.6) { x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, h * 0.5); x.lineTo(w, h * (0.48 + R() * 0.04)); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.moveTo(0, h * 0.5 + 1.5); x.lineTo(w, h * 0.5 + 1.5); x.stroke(); }
  x.restore();
}
function photocopy(x, w, h, R) {                     // flyers off the school photocopier: toner speckle and banding
  x.save(); x.globalCompositeOperation = 'multiply';
  for (let i = 0; i < w * h / 900; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.25})`; x.fillRect(R() * w, R() * h, 1 + R() * 1.5, 1 + R() * 1.5); }
  for (let y = 0; y < h; y += 6 + R() * 30) { x.fillStyle = `rgba(80,80,80,${R() * 0.08})`; x.fillRect(0, y, w, 1 + R() * 3); }
  x.restore();
}
function text(x, s, cx, cy, size, { font = SERIF, fill = '#000', align = 'center', weight = '', style = '', maxW = 1e9, rot = 0 } = {}) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.font = `${style} ${weight} ${Math.round(size)}px ${font}`; x.fillStyle = fill; x.textAlign = align; x.textBaseline = 'middle'; x.fillText(s, 0, 0, maxW); x.restore();
}
function star(x, cx, cy, r, n = 5, inner = 0.45) {
  x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * inner : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath();
}
function heart(x, cx, cy, s) {
  x.beginPath(); x.moveTo(cx, cy + s * 0.35); x.bezierCurveTo(cx - s * 1.1, cy - s * 0.35, cx - s * 0.45, cy - s * 1.05, cx, cy - s * 0.45);
  x.bezierCurveTo(cx + s * 0.45, cy - s * 1.05, cx + s * 1.1, cy - s * 0.35, cx, cy + s * 0.35); x.closePath();
}
function bokeh(x, w, h, R, hues = [320, 190, 50, 280]) {
  x.fillStyle = '#07060c'; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const r = Math.min(w, h) * (0.04 + R() * 0.12), cx = R() * w, cy = R() * h, hue = hues[i % hues.length] + (R() - 0.5) * 30;
    const g = x.createRadialGradient(cx, cy, r * 0.6, cx, cy, r); g.addColorStop(0, `hsla(${hue},90%,60%,0.35)`); g.addColorStop(1, `hsla(${hue},90%,50%,0)`);
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
  x.globalCompositeOperation = 'source-over';
}
const DAY = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

// ---------- the pieces ----------
// rave flyers: invented nights, invented DJs, invented places
const NIGHTS = [
  { t: 'DIALTONE', s: 'an all night bedroom rave', l: ['dj modem', 'packetloss', 'sleepmode b2b screensaver'], d: 'SAT 14 FEB · the old leisure centre · £5 b4 11' },
  { t: 'HARDDRIVE', s: 'ALL-NIGHTER', l: ['ctrl+z', 'firmware', 'cache & carry', 'mousepad (live)'], d: 'FRI 03 OCT · unit 4 trading estate' },
  { t: 'LOW BATTERY', s: 'presents STILL PLAYING', l: ['bluescreen', 'error 404 fm', 'the startup sound'], d: 'SAT 21 JUN · 10pm til late · £6 / £4 nus' },
  { t: 'NEW MESSAGE', s: '2 rooms · 6 djs · lasers', l: ['dialup b2b broadband', 'pixel princess', 'lowpoly'], d: 'SAT 09 AUG · the arches · 18+ ID' },
  { t: 'BIOS UPDATE', s: 'free before midnight w/ this flyer', l: ['safe mode', 'defrag', 'the recycle bin'], d: 'FRI 28 NOV · basement bar' },
  { t: 'SCREENSAVER', s: 'happy hardcore & bouncy techno', l: ['star field', 'flying toasters?? NO', 'pipes (3 hrs)'], d: 'NYE · 9pm - 6am · bring glowsticks' },
];
function flyer(x, w, h, i, R) {
  const n = NIGHTS[i % NIGHTS.length], k = i % 5;
  if (k === 0) {                                                    // black, neon stacked
    x.fillStyle = '#060608'; x.fillRect(0, 0, w, h);
    plate(x, 'green', n.t, w / 2, h * 0.24, h * 0.16, { maxW: w * 0.92 });
    plate(x, 'pink', n.s.toUpperCase(), w / 2, h * 0.34, h * 0.05, { maxW: w * 0.9 });
    n.l.forEach((l, j) => plate(x, j % 2 ? 'pink' : 'green', l.toUpperCase(), w / 2, h * (0.5 + j * 0.085), h * 0.055, { maxW: w * 0.86 }));
    text(x, n.d, w / 2, h * 0.93, h * 0.026, { font: 'Oswald, sans-serif', fill: '#fff', maxW: w * 0.92 });
  } else if (k === 1) {                                             // a wallpaper sky, stretched Times
    sky(x, 0, 0, w, h, [0, 2, 1, 3][i % 4], R);
    plate(x, 'times', n.t.toLowerCase(), w / 2, h * 0.22, h * 0.14, { maxW: w * 0.95 });
    plate(x, 'caps', n.s, w / 2, h * 0.32, h * 0.04, { maxW: w * 0.9 });
    face(x, w / 2, h * 0.52, w * 0.17);
    n.l.forEach((l, j) => plate(x, 'caps', l, w / 2, h * (0.7 + j * 0.055), h * 0.04, { maxW: w * 0.9 }));
    text(x, n.d, w / 2, h * 0.94, h * 0.024, { fill: '#fff', maxW: w * 0.92 });
  } else if (k === 2) {                                             // white, royal blue, red script
    x.fillStyle = '#f4f3ef'; x.fillRect(0, 0, w, h);
    plate(x, 'blue', n.t, w / 2, h * 0.26, h * 0.2, { maxW: w * 0.94 });
    plate(x, 'script', n.s, w / 2, h * 0.38, h * 0.06, { maxW: w * 0.9 });
    x.fillStyle = '#1f33ff'; x.fillRect(w * 0.08, h * 0.45, w * 0.84, h * 0.006);
    n.l.forEach((l, j) => text(x, l.toUpperCase(), w / 2, h * (0.53 + j * 0.07), h * 0.045, { font: 'Oswald, sans-serif', weight: '700', fill: '#111', maxW: w * 0.86 }));
    text(x, n.d, w / 2, h * 0.92, h * 0.026, { font: 'Oswald, sans-serif', fill: '#1f33ff', maxW: w * 0.92 });
  } else if (k === 3) {                                             // photocopied black and white
    x.fillStyle = '#f2f2ee'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#111'; x.fillRect(0, 0, w, h * 0.42);
    face(x, w * 0.5, h * 0.17, w * 0.2);
    text(x, n.t, w / 2, h * 0.36, h * 0.07, { font: 'Oswald, sans-serif', weight: '700', fill: '#fff', maxW: w * 0.92 });
    text(x, n.s, w / 2, h * 0.5, h * 0.036, { style: 'italic', fill: '#111', maxW: w * 0.9 });
    n.l.forEach((l, j) => text(x, l, w / 2, h * (0.6 + j * 0.065), h * 0.04, { font: 'Oswald, sans-serif', fill: '#111', maxW: w * 0.86 }));
    text(x, n.d, w / 2, h * 0.93, h * 0.026, { fill: '#111', maxW: w * 0.92 });
    photocopy(x, w, h, R);
  } else {                                                          // hot pink, chrome face, green
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ff2bd8'); g.addColorStop(1, '#7a0fd0'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 12; j++) { x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, h * 0.62 + j * j * 1.6); x.lineTo(w, h * 0.62 + j * j * 1.6); x.stroke(); }
    face(x, w / 2, h * 0.3, w * 0.24);
    plate(x, 'green', n.t, w / 2, h * 0.66, h * 0.11, { maxW: w * 0.92 });
    n.l.forEach((l, j) => plate(x, 'caps', l, w / 2, h * (0.76 + j * 0.05), h * 0.035, { maxW: w * 0.9 }));
    text(x, n.d, w / 2, h * 0.95, h * 0.024, { fill: '#fff', maxW: w * 0.92 });
  }
}
function bigPoster(x, w, h, i, R) {
  switch (i) {
    case 0: sky(x, 0, 0, w, h, 0, R); plate(x, 'times', 'my computer', w / 2, h * 0.2, h * 0.12, { maxW: w * 0.95 }); plate(x, 'caps', 'please wait while it starts', w / 2, h * 0.3, h * 0.03, { maxW: w * 0.9 }); break;
    case 1: x.fillStyle = '#1f33ff'; x.fillRect(0, 0, w, h); face(x, w / 2, h * 0.42, w * 0.36); plate(x, 'caps', 'SYSTEM MESSAGE', w / 2, h * 0.86, h * 0.045, { maxW: w * 0.9 }); break;
    case 2: x.fillStyle = '#050505'; x.fillRect(0, 0, w, h); plate(x, 'times', 'WANT', w / 2, h * 0.55, h * 0.4, { maxW: w * 0.98 }); plate(x, 'script', 'so bad it hurts', w / 2, h * 0.72, h * 0.07); break;
    case 3: sky(x, 0, 0, w, h, 1, R); plate(x, 'green', 'LOADING...', w / 2, h * 0.32, h * 0.12, { maxW: w * 0.9 }); x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(w * 0.15, h * 0.4, w * 0.7, h * 0.035); x.fillStyle = '#38ff32'; x.fillRect(w * 0.16, h * 0.408, w * 0.47, h * 0.02); break;
    case 4: sky(x, 0, 0, w, h, 3, R); plate(x, 'pink', 'SLEEP MODE', w / 2, h * 0.82, h * 0.1, { maxW: w * 0.9 }); x.fillStyle = '#fff6c8'; x.beginPath(); x.arc(w * 0.7, h * 0.25, w * 0.1, 0, 7); x.fill(); x.fillStyle = '#04031a'; x.beginPath(); x.arc(w * 0.75, h * 0.22, w * 0.09, 0, 7); x.fill(); break;
    case 5: { sky(x, 0, 0, w, h, 0, R); const sc = document.createElement('canvas'); sc.width = 320; sc.height = 200; sky(sc.getContext('2d'), 0, 0, 320, 200, 2, R); const win = systemMessage(sc, Math.round(w * 0.82)); x.drawImage(win, w * 0.09, h * 0.24); plate(x, 'caps', 'new message from my computer', w / 2, h * 0.12, h * 0.035, { maxW: w * 0.9 }); break; }
    case 6: x.fillStyle = '#f4f3ef'; x.fillRect(0, 0, w, h); for (let j = 0; j < 3; j++) plate(x, 'blue', 'MY COMPUTER', w / 2, h * (0.3 + j * 0.2), h * 0.17, { maxW: w * 0.95 }); plate(x, 'script', 'i love', w * 0.3, h * 0.13, h * 0.09); break;
    case 7: sky(x, 0, 0, w, h, 2, R); plate(x, 'caps', 'afterglow', w / 2, h * 0.86, h * 0.06, { maxW: w * 0.9 }); face(x, w * 0.5, h * 0.42, w * 0.18); break;
    default: { x.fillStyle = '#0000a8'; x.fillRect(0, 0, w, h); x.fillStyle = '#aaa'; x.fillRect(w * 0.38, h * 0.2, w * 0.24, h * 0.045);   // a printed blue screen
      text(x, 'MY COMPUTER', w / 2, h * 0.225, h * 0.03, { font: MONO, weight: 'bold', fill: '#0000a8' });
      ['A problem has been detected and', 'your heart has been shut down', 'to prevent damage to your computer.', '', 'Press any key to continue _'].forEach((l, j) => text(x, l, w * 0.1, h * (0.36 + j * 0.065), h * 0.032, { font: MONO, weight: 'bold', fill: '#fff', align: 'left', maxW: w * 0.84 })); }
  }
}
function photo(x, w, h, i, R) {                       // a 6x4 print with a white border, glossy
  const b = Math.min(w, h) * 0.05; x.fillStyle = '#f7f6f2'; x.fillRect(0, 0, w, h);
  x.save(); x.translate(b, b); const iw = w - 2 * b, ih = h - 2 * b;
  const k = i % 7;
  if (k < 4) sky(x, 0, 0, iw, ih, k, R);
  else if (k === 4) bokeh(x, iw, ih, R);
  else if (k === 5) { bokeh(x, iw, ih, R, [30, 40, 20]); face(x, iw / 2, ih * 0.45, Math.min(iw, ih) * 0.28); }
  else { const g = x.createLinearGradient(0, 0, 0, ih); g.addColorStop(0, '#ff9e6b'); g.addColorStop(0.55, '#ffcf7a'); g.addColorStop(0.56, '#2a5d8a'); g.addColorStop(1, '#0c2747'); x.fillStyle = g; x.fillRect(0, 0, iw, ih); x.fillStyle = '#fff3c0'; x.beginPath(); x.arc(iw * 0.6, ih * 0.52, ih * 0.1, Math.PI, 0); x.fill(); }
  // the flash on the gloss and a date stamp
  const g = x.createRadialGradient(iw * 0.7, ih * 0.25, 0, iw * 0.7, ih * 0.25, iw * 0.5); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, iw, ih);
  text(x, `'0${3 + (i % 5)} ${10 + i} ${1 + (i * 7) % 12}`, iw - 4, ih - 8, ih * 0.08, { font: MONO, weight: 'bold', fill: '#ff8a1a', align: 'right' });
  x.restore();
}
function polaroid(x, w, h, i, R) {
  x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h);
  const b = w * 0.07, iw = w - 2 * b; x.save(); x.translate(b, b);
  if (i % 3 === 0) bokeh(x, iw, iw, R); else if (i % 3 === 1) sky(x, 0, 0, iw, iw, 2, R); else { x.fillStyle = '#1b1b22'; x.fillRect(0, 0, iw, iw); face(x, iw / 2, iw * 0.45, iw * 0.3); }
  x.restore();
  text(x, ['me + my computer ♥', 'best nite ever!!', 'sleepover 2k4'][i % 3], w / 2, h * 0.9, h * 0.07, { font: HAND, fill: '#1a1ab0', rot: -0.03 });
}
function booth(x, w, h, R) {                          // a photo booth strip: four frames
  x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, w, h);
  for (let j = 0; j < 4; j++) { const y = h * 0.03 + j * h * 0.235, iw = w * 0.84, ih = h * 0.22; x.save(); x.translate(w * 0.08, y); bokeh(x, iw, ih, R, [300 + j * 20, 200]); face(x, iw / 2, ih * 0.48, iw * (0.2 + 0.04 * j)); x.restore(); }
}
function postit(x, w, h, i) {
  const cols = ['#fff27a', '#ff9ccf', '#9ff0ff', '#c7ff8a', '#ffb36b'], lines = [['msn', 'after 9 :3'], ['burn cds', '4 jess'], ['BUY:', 'blank cds', 'batteries'], ['i <3', 'my', 'computer'], ['dont', 'forget!!'], ['library', 'books :('], ['defrag', 'sunday']][i % 7];
  x.fillStyle = cols[i % cols.length]; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(0,0,0,.06)'; x.fillRect(0, 0, w, h * 0.16);
  lines.forEach((l, j) => text(x, l, w / 2, h * (0.32 + j * 0.2), h * 0.17, { font: HAND, fill: j % 2 ? '#c4126b' : '#14149a', rot: -0.04 + 0.02 * j, maxW: w * 0.9 }));
}
function calendar(x, w, h, R) {
  x.fillStyle = '#fbfaf5'; x.fillRect(0, 0, w, h);
  sky(x, w * 0.05, h * 0.04, w * 0.9, h * 0.42, 0, R);
  x.fillStyle = '#333'; for (let j = 0; j < 12; j++) { x.beginPath(); x.arc(w * (0.08 + j * 0.076), h * 0.02, w * 0.012, 0, 7); x.fill(); }
  text(x, 'NOVEMBER 2004', w / 2, h * 0.5, h * 0.035, { font: 'Oswald, sans-serif', weight: '700', fill: '#1f33ff' });
  const gx = w * 0.05, gy = h * 0.54, cw = w * 0.9 / 7, ch = h * 0.42 / 5;
  x.strokeStyle = '#999'; x.lineWidth = 1; x.font = `${Math.round(ch * 0.28)}px ${SERIF}`; x.fillStyle = '#333'; x.textAlign = 'left'; x.textBaseline = 'top';
  for (let d = 1; d <= 30; d++) { const c = d % 7, r = Math.floor(d / 7); const X = gx + c * cw, Y = gy + r * ch; x.strokeRect(X, Y, cw, ch); x.fillText(String(d), X + 3, Y + 2);
    if (d < 19) { x.strokeStyle = '#d0121e'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(X + 3, Y + 3); x.lineTo(X + cw - 3, Y + ch - 3); x.moveTo(X + cw - 3, Y + 3); x.lineTo(X + 3, Y + ch - 3); x.stroke(); x.strokeStyle = '#999'; x.lineWidth = 1; } }
  { const X = gx + (20 % 7) * cw, Y = gy + 2 * ch; x.strokeStyle = '#ff2bd8'; x.lineWidth = 2.5; x.beginPath(); x.ellipse(X + cw / 2, Y + ch / 2, cw * 0.6, ch * 0.55, 0.1, 0, 7); x.stroke(); text(x, 'RAVE!!', X + cw / 2, Y + ch * 0.68, ch * 0.3, { font: HAND, fill: '#ff2bd8', rot: -0.1 }); }
}
function timetable(x, w, h, R) {
  x.fillStyle = '#fdfdf8'; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(80,120,220,.45)'; x.lineWidth = 1; for (let y = h * 0.12; y < h; y += h * 0.035) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
  x.strokeStyle = 'rgba(220,60,60,.6)'; x.beginPath(); x.moveTo(w * 0.1, 0); x.lineTo(w * 0.1, h); x.stroke();
  text(x, 'my timetable', w / 2, h * 0.06, h * 0.05, { font: HAND, fill: '#14149a', rot: -0.02 });
  const subj = ['maths', 'english', 'ICT!!', 'music', 'science', 'french', 'art', 'PE :(', 'free'];
  const gx = w * 0.14, gy = h * 0.16, cw = w * 0.82 / 5, ch = h * 0.78 / 6;
  x.strokeStyle = '#333'; x.lineWidth = 1.2;
  for (let c = 0; c < 5; c++) { text(x, DAY[c], gx + cw * (c + 0.5), gy - ch * 0.25, ch * 0.22, { font: HAND, fill: '#333' }); for (let r = 0; r < 6; r++) { x.strokeRect(gx + c * cw, gy + r * ch, cw, ch); const s = subj[Math.floor(R() * subj.length)]; text(x, s, gx + cw * (c + 0.5), gy + ch * (r + 0.5), ch * 0.2, { font: HAND, fill: s === 'ICT!!' ? '#d0121e' : '#14149a', maxW: cw * 0.9 }); } }
}
function crayon(x, w, h, R) {                         // her computer, in crayon, by a younger sibling
  x.fillStyle = '#fbfaf3'; x.fillRect(0, 0, w, h);
  const scrib = (pts, col, wid) => { x.strokeStyle = col; x.lineWidth = wid; x.lineCap = 'round'; x.lineJoin = 'round'; for (let k = 0; k < 3; k++) { x.beginPath(); pts.forEach(([a, b], j) => (j ? x.lineTo : x.moveTo).call(x, a * w + (R() - 0.5) * 4, b * h + (R() - 0.5) * 4)); x.stroke(); } };
  scrib([[0.2, 0.25], [0.8, 0.25], [0.8, 0.7], [0.2, 0.7], [0.2, 0.25]], '#b39b6b', 5);
  scrib([[0.27, 0.32], [0.73, 0.32], [0.73, 0.6], [0.27, 0.6], [0.27, 0.32]], '#4a7bff', 4);
  scrib([[0.38, 0.38], [0.62, 0.38], [0.5, 0.56], [0.38, 0.38]], '#888', 4);
  scrib([[0.44, 0.43], [0.44, 0.46]], '#222', 4); scrib([[0.56, 0.43], [0.56, 0.46]], '#222', 4);
  scrib([[0.3, 0.7], [0.25, 0.85], [0.75, 0.85], [0.7, 0.7]], '#b39b6b', 4);
  for (const [a, b, s] of [[0.12, 0.15, 0.05], [0.88, 0.2, 0.04], [0.85, 0.8, 0.06], [0.1, 0.78, 0.04]]) { x.fillStyle = '#ff3b7a'; heart(x, a * w, b * h, s * w); x.fill(); }
  text(x, 'MY COMPUTER', w / 2, h * 0.93, h * 0.07, { font: HAND, weight: 'bold', fill: '#e2192b', rot: 0.02 });
}
function corkboard(x, w, h, R) {
  x.fillStyle = '#b8895a'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 30; i++) { x.fillStyle = R() < 0.5 ? 'rgba(90,55,25,.35)' : 'rgba(230,190,140,.3)'; x.fillRect(R() * w, R() * h, 1 + R() * 2.5, 1 + R() * 2); }
  const f = w * 0.04; x.strokeStyle = '#7a5532'; x.lineWidth = f; x.strokeRect(f / 2, f / 2, w - f, h - f);
  x.strokeStyle = '#a07246'; x.lineWidth = f * 0.35; x.strokeRect(f * 0.75, f * 0.75, w - f * 1.5, h - f * 1.5);
  // tickets, a photo, a flyer, notes, all pinned
  const items = [
    [0.08, 0.1, 0.3, 0.42, (c, a, b) => flyer(c, a, b, 3, R)], [0.42, 0.08, 0.24, 0.3, (c, a, b) => photo(c, a, b, 4, R)],
    [0.68, 0.1, 0.24, 0.32, (c, a, b) => polaroid(c, a, b, 1, R)], [0.4, 0.45, 0.2, 0.2, (c, a, b) => postit(c, a, b, 3)],
    [0.08, 0.58, 0.28, 0.14, (c, a, b) => ticket(c, a, b, 0)], [0.14, 0.76, 0.28, 0.14, (c, a, b) => ticket(c, a, b, 1)],
    [0.64, 0.5, 0.28, 0.4, (c, a, b) => photo(c, a, b, 2, R)], [0.44, 0.7, 0.18, 0.2, (c, a, b) => postit(c, a, b, 0)],
  ];
  for (const [u, v, a, b, draw] of items) {
    x.save(); x.translate(u * w + a * w / 2, v * h + b * h / 2); x.rotate((R() - 0.5) * 0.2); x.translate(-a * w / 2, -b * h / 2);
    x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 4; x.shadowOffsetY = 2; x.fillStyle = '#fff'; x.fillRect(0, 0, a * w, b * h); x.shadowColor = 'transparent';
    x.beginPath(); x.rect(0, 0, a * w, b * h); x.clip(); draw(x, a * w, b * h); x.restore();
    pin(x, u * w + a * w / 2, v * h + 6, 5, ['#e2192b', '#1f33ff', '#ffe10a', '#38c232'][Math.floor(R() * 4)]);
  }
}
function ticket(x, w, h, i) {
  x.fillStyle = ['#ffd6ec', '#d8f1ff'][i % 2]; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k < 6; k++) x.fillRect(0, h * k / 6, w, 1);
  x.setLineDash([3, 3]); x.strokeStyle = '#555'; x.beginPath(); x.moveTo(w * 0.72, 0); x.lineTo(w * 0.72, h); x.stroke(); x.setLineDash([]);
  text(x, ['DIALTONE · ADMIT ONE', 'NEW MESSAGE · £6'][i % 2], w * 0.36, h * 0.35, h * 0.16, { font: MONO, weight: 'bold', fill: '#222', maxW: w * 0.66 });
  text(x, ['No 004471', 'No 000918'][i % 2], w * 0.36, h * 0.7, h * 0.13, { font: MONO, fill: '#444' });
  text(x, '★', w * 0.86, h / 2, h * 0.4, { fill: '#e2192b' });
}
function inlay(x, w, h, R) {                          // a mix CD's insert, felt tip on white
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  text(x, 'mix 4 u ♥', w / 2, h * 0.14, h * 0.1, { font: HAND, fill: '#d0121e', rot: -0.05 });
  ['1. intro (dialup)', '2. my computer', '3. sleep mode', '4. new message', '5. still playing', '6. afterglow', '7. ????'].forEach((l, j) => text(x, l, w * 0.12, h * (0.3 + j * 0.095), h * 0.065, { font: HAND, fill: '#14149a', align: 'left' }));
  for (let j = 0; j < 6; j++) { x.fillStyle = '#ffe10a'; star(x, w * (0.75 + R() * 0.2), h * (0.3 + R() * 0.6), h * 0.04); x.fill(); }
}
// stickers: die-cut with a white edge
function sticker(x, w, h, i) {
  const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.42, k = i % 9;
  x.save(); x.shadowColor = '#fff'; x.shadowBlur = 0;
  const outline = (path, fill) => { path(); x.lineWidth = s * 0.18; x.strokeStyle = '#fff'; x.lineJoin = 'round'; x.stroke(); x.fillStyle = fill; x.fill(); };
  if (k === 0) { x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, s * 1.05, 0, 7); x.fill(); x.fillStyle = '#1f33ff'; x.beginPath(); x.arc(cx, cy, s * 0.95, 0, 7); x.fill(); drawFace(x, cx, cy + s * 0.05, s * 0.62); }
  else if (k === 1) outline(() => star(x, cx, cy, s), '#ffe10a');
  else if (k === 2) outline(() => heart(x, cx, cy + s * 0.3, s * 0.95), '#ff2bd8');
  else if (k === 3) { outline(() => { x.beginPath(); x.arc(cx, cy, s, 0, 7); }, '#ffe10a'); x.fillStyle = '#222'; x.beginPath(); x.arc(cx - s * 0.35, cy - s * 0.2, s * 0.12, 0, 7); x.arc(cx + s * 0.35, cy - s * 0.2, s * 0.12, 0, 7); x.fill(); x.lineWidth = s * 0.1; x.strokeStyle = '#222'; x.beginPath(); x.arc(cx, cy + s * 0.05, s * 0.5, 0.2, Math.PI - 0.2); x.stroke(); }
  else if (k === 4) outline(() => { x.beginPath(); x.moveTo(cx + s * 0.2, cy - s); x.lineTo(cx - s * 0.5, cy + s * 0.1); x.lineTo(cx, cy + s * 0.1); x.lineTo(cx - s * 0.2, cy + s); x.lineTo(cx + s * 0.55, cy - s * 0.15); x.lineTo(cx + s * 0.05, cy - s * 0.15); x.closePath(); }, '#38ff32');
  else if (k === 5) { outline(() => { x.beginPath(); x.roundRect(cx - s, cy - s * 0.55, s * 2, s * 1.1, s * 0.15); }, '#ecebe5'); text(x, 'OK', cx, cy, s * 0.6, { font: 'Arial, sans-serif', fill: '#000' }); x.strokeStyle = '#000'; x.lineWidth = 1; x.setLineDash([1.5, 1.5]); x.strokeRect(cx - s * 0.8, cy - s * 0.38, s * 1.6, s * 0.76); x.setLineDash([]); }
  else if (k === 6) {                                  // the pointer arrow, pixel by pixel
    const P = ['X', 'XX', 'XWX', 'XWWX', 'XWWWX', 'XWWWWX', 'XWWWWWX', 'XWWWWWWX', 'XWWWWXXXX', 'XWWXWX', 'XWX XWX', 'XX  XWX', '     XWX', '      XX'], px = s * 2 / 14;
    x.fillStyle = '#fff'; x.fillRect(cx - s * 0.62, cy - s * 1.05, px * 11, px * 15.5);
    P.forEach((row, r) => [...row].forEach((c, q) => { if (c !== ' ') { x.fillStyle = c === 'X' ? '#000' : '#fff'; x.fillRect(cx - s * 0.5 + q * px, cy - s * 0.95 + r * px, px, px); } }));
  } else if (k === 7) { outline(() => { x.beginPath(); x.ellipse(cx, cy, s * 0.75, s, 0, 0, 7); }, '#7dff6a'); x.fillStyle = '#111'; x.beginPath(); x.ellipse(cx - s * 0.32, cy + s * 0.05, s * 0.2, s * 0.32, 0.5, 0, 7); x.ellipse(cx + s * 0.32, cy + s * 0.05, s * 0.2, s * 0.32, -0.5, 0, 7); x.fill(); }
  else { outline(() => { x.beginPath(); for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2; x.moveTo(cx, cy); x.ellipse(cx + Math.cos(a) * s * 0.55, cy + Math.sin(a) * s * 0.55, s * 0.45, s * 0.28, a, 0, 7); } }, '#ffffff'); x.fillStyle = '#ffd21a'; x.beginPath(); x.arc(cx, cy, s * 0.32, 0, 7); x.fill(); }
  x.restore();
}
// a hand-written sign for the door
function doorSign(x, w, h) {
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  text(x, 'KNOCK FIRST!!', w / 2, h * 0.25, h * 0.15, { font: HAND, weight: 'bold', fill: '#d0121e', rot: -0.03, maxW: w * 0.92 });
  text(x, 'rendering in progress', w / 2, h * 0.52, h * 0.1, { font: HAND, fill: '#14149a', maxW: w * 0.9 });
  text(x, 'do not turn off', w / 2, h * 0.7, h * 0.1, { font: HAND, fill: '#14149a', maxW: w * 0.9 });
  face(x, w * 0.82, h * 0.86, h * 0.1);
}

// ---------- surfaces (the room's furniture and fabric reuse these, tinted) ----------
function grain(x, w, h, R, { base = '#d9b98c', dark = 'rgba(120,80,40,', light = 'rgba(255,240,210,' } = {}) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < h; i += 1) { const v = Math.sin(i * 0.09 + Math.sin(i * 0.013) * 6) * 0.5 + 0.5; x.fillStyle = (v > 0.5 ? dark : light) + (Math.abs(v - 0.5) * 0.22) + ')'; x.fillRect(0, i, w, 1); }
  for (let i = 0; i < 30; i++) { x.strokeStyle = dark + (0.05 + R() * 0.08) + ')'; x.lineWidth = 0.5 + R() * 1.5; x.beginPath(); const y = R() * h; x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + (R() - 0.5) * 12, w * 0.7, y + (R() - 0.5) * 12, w, y + (R() - 0.5) * 8); x.stroke(); }
}
function plain(x, w, h, R, k = 0.05) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); for (let i = 0; i < w * h / 40; i++) { x.fillStyle = `rgba(0,0,0,${R() * k})`; x.fillRect(R() * w, R() * h, 2, 2); } }
function duvet(x, w, h, R) {                          // her duvet: a wallpaper sky, the clouds printed big, piped in pink
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5f9dff'); g.addColorStop(1, '#a9d4ff'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const cx = R() * w, cy = R() * h, r = w * (0.04 + R() * 0.05); x.fillStyle = 'rgba(255,255,255,.95)'; for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(cx + (k - 2) * r * 0.6, cy + (k % 2 ? -r * 0.25 : 0), r * (0.55 + (k % 2) * 0.2), 0, 7); x.fill(); } }
  for (let i = 0; i < 30; i++) { x.fillStyle = '#ffe10a'; star(x, R() * w, R() * h, w * 0.012); x.fill(); }
  x.strokeStyle = '#ff7ab8'; x.lineWidth = w * 0.02; x.strokeRect(w * 0.01, h * 0.01, w * 0.98, h * 0.98);
}
function pillowcase(x, w, h, R) { x.fillStyle = '#ffb3d6'; x.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(255,255,255,.8)'; heart(x, R() * w, R() * h, w * 0.03); x.fill(); } }
function sheet(x, w, h, R) { x.fillStyle = '#f2eef7'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(180,160,220,.4)'; x.lineWidth = 3; for (let i = 0; i < w; i += 18) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } }
function voile(x, w, h, R) {                          // sheer curtains: lilac with a woven stripe
  x.fillStyle = '#d9c6ff'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 6) { x.fillStyle = `rgba(255,255,255,${0.1 + 0.15 * Math.abs(Math.sin(i * 0.11))})`; x.fillRect(i, 0, 3, h); }
  for (let i = 0; i < 18; i++) { x.fillStyle = 'rgba(255,255,255,.55)'; star(x, R() * w, R() * h, w * 0.025); x.fill(); }
}
function panelDoor(x, w, h, R, col = '#f3f0ea') {     // a six-panel door
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  const P = [[0.12, 0.05, 0.33, 0.24], [0.55, 0.05, 0.33, 0.24], [0.12, 0.33, 0.33, 0.3], [0.55, 0.33, 0.33, 0.3], [0.12, 0.7, 0.33, 0.25], [0.55, 0.7, 0.33, 0.25]];
  for (const [a, b, c, d] of P) { x.fillStyle = 'rgba(0,0,0,.09)'; x.fillRect(a * w, b * h, c * w, d * h); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(a * w + 3, b * h + 3, c * w - 6, d * h - 6); x.fillStyle = col; x.fillRect(a * w + 6, b * h + 6, c * w - 12, d * h - 12); }
  for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(80,60,40,.06)'; x.fillRect(R() * w, h * 0.4 + R() * h * 0.3, 2 + R() * 8, 1 + R() * 4); }   // finger marks round the handle
}
function wardrobeDoor(x, w, h, R) { x.fillStyle = '#f4f1ec'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 4; x.strokeRect(w * 0.08, h * 0.04, w * 0.84, h * 0.92); }
function spines(x, w, h, R, kind) {                   // book or CD spines in a row
  let X = 0; const cols = ['#e2192b', '#1f33ff', '#ffe10a', '#111', '#ff2bd8', '#38c232', '#f4f3ef', '#7a0fd0', '#ff8a1a', '#5ad1ff'];
  const words = ['HARD DRIVE', 'dial tone', 'NEW MESSAGE', 'afterglow', 'SAFE MODE', 'pixel', 'LOW BATTERY', 'screensaver', 'STARTUP', 'mix 2004', 'MIX!!', 'bedroom', 'GCSE ICT', 'french', 'Y2K', 'sleep mode'];
  while (X < w) {
    const sw = kind === 'cd' ? 10 + R() * 4 : 16 + R() * 26, c = cols[Math.floor(R() * cols.length)], top = kind === 'cd' ? 0 : R() * h * 0.18;
    x.fillStyle = c; x.fillRect(X, top, sw - 1, h - top);
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(X + sw - 2, top, 1.5, h - top);
    if (kind === 'cd') { x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(X + 1, 0, 1.5, h); }
    x.save(); x.translate(X + sw / 2, top + (h - top) / 2); x.rotate(-Math.PI / 2); x.fillStyle = c === '#f4f3ef' || c === '#ffe10a' || c === '#5ad1ff' ? '#111' : '#fff';
    x.font = `${R() < 0.5 ? 'bold ' : ''}${Math.round(Math.min(sw * 0.55, 18))}px ${R() < 0.5 ? SERIF : 'Oswald, sans-serif'}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(words[Math.floor(R() * words.length)], 0, 0, (h - top) * 0.85); x.restore();
    X += sw;
  }
}
function hifi(x, w, h, R) {                           // a mini hi-fi's front: CD drawer, tape decks, the display window, a big knob
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5b5f68'); g.addColorStop(0.5, '#2d3038'); g.addColorStop(1, '#1b1d22'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = '#0d0e10'; x.fillRect(w * 0.06, h * 0.08, w * 0.88, h * 0.1);                         // CD drawer
  x.fillStyle = '#050608'; x.fillRect(w * 0.08, h * 0.26, w * 0.52, h * 0.24);                        // display window (the LEDs glow in it)
  for (const X of [0.08, 0.52]) { x.fillStyle = '#121317'; x.fillRect(w * X, h * 0.58, w * 0.4, h * 0.3); x.fillStyle = 'rgba(160,190,220,.15)'; x.fillRect(w * X + 4, h * 0.62, w * 0.4 - 8, h * 0.12); x.fillStyle = '#333'; x.beginPath(); x.arc(w * (X + 0.13), h * 0.68, h * 0.035, 0, 7); x.arc(w * (X + 0.27), h * 0.68, h * 0.035, 0, 7); x.fill(); }
  const kx = w * 0.8, ky = h * 0.38, kr = h * 0.14, kg = x.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, kr * 0.1, kx, ky, kr); kg.addColorStop(0, '#d8dbe2'); kg.addColorStop(1, '#55585f');
  x.fillStyle = kg; x.beginPath(); x.arc(kx, ky, kr, 0, 7); x.fill(); x.fillStyle = '#222'; x.fillRect(kx - 1, ky - kr, 2, kr * 0.4);
  text(x, 'MINI COMPONENT SYSTEM', w * 0.34, h * 0.95, h * 0.04, { font: 'Arial, sans-serif', weight: 'bold', fill: '#9aa0aa' });
  text(x, 'MEGA BASS', w * 0.8, h * 0.6, h * 0.05, { font: 'Arial, sans-serif', weight: 'bold', style: 'italic', fill: '#ff8a1a' });
}
function speakerFront(x, w, h) {
  x.fillStyle = '#26272b'; x.fillRect(0, 0, w, h);
  const ring = (cy, r) => { const g = x.createRadialGradient(w / 2, cy, r * 0.2, w / 2, cy, r); g.addColorStop(0, '#0d0d0f'); g.addColorStop(0.85, '#1a1a1d'); g.addColorStop(1, '#3a3b40'); x.fillStyle = g; x.beginPath(); x.arc(w / 2, cy, r, 0, 7); x.fill(); };
  ring(h * 0.27, w * 0.24); ring(h * 0.66, w * 0.4);
  text(x, 'SUPER WOOFER', w / 2, h * 0.94, h * 0.035, { font: 'Arial, sans-serif', weight: 'bold', fill: '#888' });
}
function street(x, w, h, R) {                         // the night outside: rooftops, a few lit windows, the street lamp's glow, a bare tree
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#05061a'); g.addColorStop(0.6, '#1a1640'); g.addColorStop(1, '#4a2a3a'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 50; i++) { x.fillStyle = `rgba(255,255,255,${R() * 0.6})`; x.fillRect(R() * w, R() * h * 0.45, 1.5, 1.5); }
  const lg = x.createRadialGradient(w * 0.78, h * 0.42, 0, w * 0.78, h * 0.42, w * 0.5); lg.addColorStop(0, 'rgba(255,170,70,.85)'); lg.addColorStop(0.15, 'rgba(255,140,50,.35)'); lg.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = lg; x.fillRect(0, 0, w, h);
  x.fillStyle = '#0a0812';
  let X = -10; while (X < w) { const bw = 60 + R() * 90, bh = h * (0.35 + R() * 0.2); x.beginPath(); x.moveTo(X, h); x.lineTo(X, h - bh); x.lineTo(X + bw / 2, h - bh - 30 - R() * 20); x.lineTo(X + bw, h - bh); x.lineTo(X + bw, h); x.fill();
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) { const lit = R() < 0.35; x.fillStyle = lit ? (R() < 0.3 ? '#7aa0e8' : '#e8b060') : '#16121e'; x.fillRect(X + 12 + k * (bw - 24) / 3, h - bh + 14 + r * 26, 7, 9); }
    x.fillStyle = '#0a0812';
    X += bw + 6; }
  x.strokeStyle = '#0a0812'; x.lineCap = 'round';
  const branch = (bx, by, a, len, wd) => { if (len < 6) return; const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len; x.lineWidth = wd; x.beginPath(); x.moveTo(bx, by); x.lineTo(ex, ey); x.stroke(); branch(ex, ey, a - 0.4 - R() * 0.3, len * 0.72, wd * 0.7); branch(ex, ey, a + 0.3 + R() * 0.3, len * 0.68, wd * 0.7); };
  branch(w * 0.18, h, -Math.PI / 2 + 0.1, h * 0.28, 9);
  x.fillStyle = '#0a0812'; x.fillRect(w * 0.78 - 3, h * 0.42, 6, h); x.fillStyle = '#ffd18a'; x.beginPath(); x.ellipse(w * 0.78, h * 0.42, 10, 5, 0, 0, 7); x.fill();
}
function glowStars(x, w, h, R) {                      // glow-in-the-dark stars and moons, cut out (alpha)
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const cx = (i + 0.5) * w / 6, cy = (j + 0.5) * h / 3, s = Math.min(w / 6, h / 3) * 0.42;
    x.fillStyle = '#fff';
    if ((i + j) % 5 === 4) { x.beginPath(); x.arc(cx, cy, s, 0, 7); x.fill(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(cx + s * 0.45, cy - s * 0.2, s * 0.85, 0, 7); x.fill(); x.globalCompositeOperation = 'source-over'; }
    else { star(x, cx, cy, s, 5, 0.42 + 0.06 * (i % 2)); x.fill(); }
  }
}
function plaster(x, w, h, R) {                        // the wall paint: tiles seamlessly (every blot is drawn wrapped)
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 220; i++) {
    const cx = R() * w, cy = R() * h, r = 8 + R() * 60, a = R() * 0.05, dark = R() < 0.5;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r); g.addColorStop(0, dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < w * h / 25; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.035})`; x.fillRect(R() * w, R() * h, 1.5, 1.5); }
}

// ---------- the list: name, kind, size in metres, painter ----------
// kind: poster (taped, may peel), photo, sticker (die-cut), pinned (one pin), surface (furniture / fabric; no margin)
function pieces() {
  const L = [];
  const add = (name, kind, w, h, paint, o = {}) => L.push({ name, kind, w, h, paint, ...o });
  for (let i = 0; i < 9; i++) add(`big${i}`, 'poster', i < 2 ? 0.6 : 0.42, i < 2 ? 0.84 : 0.594, (x, w, h, R) => { bigPoster(x, w, h, i, R); age(x, w, h, R, 0.6); }, { dens: 700 });
  for (let i = 0; i < 12; i++) add(`flyer${i}`, 'poster', i % 3 === 2 ? 0.148 : 0.21, i % 3 === 2 ? 0.21 : 0.297, (x, w, h, R) => { flyer(x, w, h, i, R); age(x, w, h, R, 0.5); });
  for (let i = 0; i < 4; i++) add(`mag${i}`, 'poster', 0.21, 0.275, (x, w, h, R) => { cover(x, w, h, i + 1); age(x, w, h, R, 0.8); });
  for (let i = 0; i < 2; i++) add(`sys${i}`, 'poster', 0.297, 0.21, (x, w, h, R) => { x.fillStyle = '#fbfbf8'; x.fillRect(0, 0, w, h); const sc = document.createElement('canvas'); sc.width = 320; sc.height = 200; sky(sc.getContext('2d'), 0, 0, 320, 200, i ? 3 : 0, R); x.drawImage(systemMessage(sc, Math.round(w * 0.8)), w * 0.1, h * 0.09); photocopy(x, w, h, R); age(x, w, h, R, 0.4); });
  for (let i = 0; i < 14; i++) add(`photo${i}`, 'photo', i % 2 ? 0.1 : 0.15, i % 2 ? 0.15 : 0.1, (x, w, h, R) => photo(x, w, h, i, R));
  for (let i = 0; i < 3; i++) add(`pola${i}`, 'photo', 0.088, 0.107, (x, w, h, R) => polaroid(x, w, h, i, R));
  add('booth', 'photo', 0.05, 0.2, (x, w, h, R) => booth(x, w, h, R));
  for (let i = 0; i < 7; i++) add(`postit${i}`, 'photo', 0.076, 0.076, (x, w, h) => postit(x, w, h, i));
  add('calendar', 'pinned', 0.3, 0.45, (x, w, h, R) => calendar(x, w, h, R));
  add('timetable', 'poster', 0.21, 0.297, (x, w, h, R) => timetable(x, w, h, R));
  add('crayon', 'poster', 0.297, 0.21, (x, w, h, R) => crayon(x, w, h, R));
  add('inlay', 'photo', 0.12, 0.12, (x, w, h, R) => inlay(x, w, h, R));
  for (let i = 0; i < 2; i++) add(`ticket${i}`, 'photo', 0.14, 0.06, (x, w, h) => ticket(x, w, h, i));
  add('doorsign', 'poster', 0.21, 0.148, (x, w, h) => doorSign(x, w, h));
  for (let i = 0; i < 18; i++) add(`stk${i}`, 'sticker', 0.07, 0.07, (x, w, h) => sticker(x, w, h, i), { dens: 900 });
  // surfaces
  add('cork', 'surface', 0.8, 0.55, (x, w, h, R) => corkboard(x, w, h, R), { dens: 900 });
  add('wood', 'surface', 0.5, 0.5, (x, w, h, R) => grain(x, w, h, R), { dens: 700 });
  add('pine', 'surface', 0.5, 0.5, (x, w, h, R) => grain(x, w, h, R, { base: '#e8c896' }), { dens: 600 });
  add('plain', 'surface', 0.1, 0.1, (x, w, h, R) => plain(x, w, h, R), { dens: 600 });
  add('duvet', 'surface', 1.0, 1.0, (x, w, h, R) => duvet(x, w, h, R), { dens: 700 });
  add('pillowcase', 'surface', 0.4, 0.4, (x, w, h, R) => pillowcase(x, w, h, R), { dens: 600 });
  add('sheet', 'surface', 0.4, 0.4, (x, w, h, R) => sheet(x, w, h, R), { dens: 500 });
  add('voile', 'surface', 0.5, 1.0, (x, w, h, R) => voile(x, w, h, R), { dens: 500 });
  add('door', 'surface', 0.4, 1.0, (x, w, h, R) => panelDoor(x, w, h, R), { dens: 500 });
  add('wdoor', 'surface', 0.3, 1.0, (x, w, h, R) => wardrobeDoor(x, w, h, R), { dens: 400 });
  add('books', 'surface', 0.9, 0.24, (x, w, h, R) => spines(x, w, h, R, 'book'), { dens: 900 });
  add('cds', 'surface', 0.6, 0.15, (x, w, h, R) => spines(x, w, h, R, 'cd'), { dens: 1100 });
  add('hifi', 'surface', 0.3, 0.2, (x, w, h, R) => hifi(x, w, h, R), { dens: 1300 });
  add('woofer', 'surface', 0.2, 0.32, (x, w, h) => speakerFront(x, w, h), { dens: 1000 });
  add('street', 'surface', 1.3, 1.2, (x, w, h, R) => street(x, w, h, R), { dens: 400 });
  add('stars', 'surface', 0.6, 0.3, (x, w, h, R) => glowStars(x, w, h, R), { dens: 700 });
  return L;
}

export async function paintAtlas({ lite = false } = {}) {
  if (document.fonts) await Promise.race([Promise.all(['700 40px Oswald', '40px "Pinyon Script"'].map((f) => document.fonts.load(f))).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
  const W = lite ? 2048 : 4096, H = lite ? 1024 : 2048, S = lite ? 0.5 : 1, PAD = 6;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const L = pieces();
  // the margin round a taped piece is where its tape hangs over the edge
  for (const p of L) { const d = (p.dens || 1000) * S, m = p.kind === 'poster' ? 0.025 : p.kind === 'pinned' ? 0.012 : 0; p.m = m; p.pw = Math.ceil((p.w + 2 * m) * d); p.ph = Math.ceil((p.h + 2 * m) * d); p.d = d; }
  // shelf packing, tallest first
  const order = [...L].sort((a, b) => b.ph - a.ph); let X = 0, Y = 0, row = 0;
  for (const p of order) {
    if (X + p.pw + PAD * 2 > W) { X = 0; Y += row; row = 0; }
    p.x = X + PAD; p.y = Y + PAD; X += p.pw + PAD * 2; row = Math.max(row, p.ph + PAD * 2);
  }
  if (Y + row > H) console.warn('shell: atlas overflow', Y + row, H);
  const cells = new Map(); let n = 0, t0 = performance.now();
  for (const p of L) {
    const R = mulberry(++n * 7919), m = p.m * p.d, w = p.pw - 2 * m, h = p.ph - 2 * m;
    x.save(); x.translate(p.x + m, p.y + m); x.beginPath(); x.rect(0, 0, w, h); x.clip();
    try { p.paint(x, w, h, R); } catch (e) { console.warn('shell art', p.name, e.message); }
    x.restore();
    if (p.kind === 'poster' || p.kind === 'pinned') {                  // tape or a pin, over the edge
      x.save(); x.translate(p.x + m, p.y + m);
      if (p.kind === 'pinned') pin(x, w / 2, m * 0.2 + 6, Math.max(4, m * 0.5), '#e2192b');
      else { const tl = Math.min(w, h) * 0.28, corners = R() < 0.3 ? [[w / 2, 0, (R() - 0.5) * 0.3]] : [[0, 0, -0.7], [w, 0, 0.7], [0, h, 0.7], [w, h, -0.7]].filter(() => R() < 0.85);
        for (const [a, b, ang] of corners) tape(x, a, b, tl, ang + (R() - 0.5) * 0.4); }
      x.restore();
    }
    // a pixel-wide border copied outward, so mipmaps do not bleed the neighbours in
    if (p.kind === 'surface') { x.drawImage(c, p.x, p.y, p.pw, 1, p.x, p.y - 2, p.pw, 2); x.drawImage(c, p.x, p.y + p.ph - 1, p.pw, 1, p.x, p.y + p.ph, p.pw, 2); x.drawImage(c, p.x, p.y, 1, p.ph, p.x - 2, p.y, 2, p.ph); x.drawImage(c, p.x + p.pw - 1, p.y, 1, p.ph, p.x + p.pw, p.y, 2, p.ph); }
    const e = 1.5;                                                   // keep samples off the cell's outer pixel
    cells.set(p.name, { u0: (p.x + e) / W, u1: (p.x + p.pw - e) / W, v0: 1 - (p.y + p.ph - e) / H, v1: 1 - (p.y + e) / H, w: p.w + 2 * p.m, h: p.h + 2 * p.m, inner: [p.w, p.h], kind: p.kind });
    if (performance.now() - t0 > 10) { await idle(); t0 = performance.now(); }
  }
  // the wall paint is its own small texture: it tiles
  const pc = document.createElement('canvas'); pc.width = pc.height = 512; plaster(pc.getContext('2d'), 512, 512, mulberry(31));
  return { canvas: c, paint: pc, cell: (name) => cells.get(name), list: (kind) => L.filter((p) => p.kind === kind).map((p) => p.name) };
}
