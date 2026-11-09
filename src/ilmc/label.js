// The record's label for I Love My Computer: the album cover as a picture label, a printed ring around it,
// and the :3 face from the Fuck My Computer video where the logo used to be.
const S = 1024, C = S / 2, DARKEN = 0.4;   // same exposure as label.js: the disc shader squares the texel and the key light is strong

export function drawFace(x, cx, cy, size, { bg = null } = {}) {
  // a downward triangle with rounded corners, chrome, two slot eyes and a cat mouth
  const r = size, k = Math.sqrt(3) / 2, pts = [[cx - r, cy - r * 0.55], [cx + r, cy - r * 0.55], [cx, cy - r * 0.55 + 2 * r * k]];
  const rr = r * 0.22;
  x.save();
  x.beginPath();
  for (let i = 0; i < 3; i++) {
    const p = pts[i], a = pts[(i + 2) % 3], b = pts[(i + 1) % 3];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const p1 = [p[0] + (a[0] - p[0]) / da * rr * 1.7, p[1] + (a[1] - p[1]) / da * rr * 1.7], p2 = [p[0] + (b[0] - p[0]) / db * rr * 1.7, p[1] + (b[1] - p[1]) / db * rr * 1.7];
    i ? x.lineTo(...p1) : x.moveTo(...p1); x.quadraticCurveTo(p[0], p[1], ...p2);
  }
  x.closePath();
  if (bg) { x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = size * 0.15; x.shadowOffsetY = size * 0.05; }
  const g = x.createLinearGradient(cx, cy - r * 0.6, cx + r * 0.2, cy + r * 1.2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.32, '#d9dde6'); g.addColorStop(0.42, '#70747f'); g.addColorStop(0.55, '#c8ccd6'); g.addColorStop(1, '#5c606a');
  x.fillStyle = g; x.fill(); x.shadowColor = 'transparent';
  x.lineWidth = size * 0.035; x.strokeStyle = 'rgba(255,255,255,.7)'; x.stroke();
  x.fillStyle = '#121318';
  const ew = r * 0.17, eh = r * 0.3, ey = cy - r * 0.32;
  for (const s of [-1, 1]) { x.beginPath(); x.roundRect(cx + s * r * 0.3 - ew / 2, ey, ew, eh, ew * 0.25); x.fill(); }
  x.lineWidth = r * 0.07; x.strokeStyle = '#121318'; x.lineCap = 'round';
  const my = cy + r * 0.12, mr = r * 0.13;
  x.beginPath(); x.arc(cx - mr, my, mr, 0, Math.PI); x.stroke(); x.beginPath(); x.arc(cx + mr, my, mr, 0, Math.PI); x.stroke();
  x.restore();
}

function arcText(k, text, r, startDeg, size) {
  k.save(); k.font = `700 ${size}px Orbitron, "Arial Black", sans-serif`; k.fillStyle = '#fff'; k.textAlign = 'center'; k.textBaseline = 'middle';
  const chars = [...text], adv = chars.map((ch) => k.measureText(ch).width + size * 0.18);
  let th = startDeg * Math.PI / 180;
  chars.forEach((ch, i) => {
    th += adv[i] / r / 2;
    k.save(); k.translate(C + r * Math.cos(th), C + r * Math.sin(th)); k.rotate(th + Math.PI / 2); k.fillText(ch, 0, 0); k.restore();
    th += adv[i] / r / 2;
  });
  k.restore();
}

export function ilmcLabel(cover, has = true) {
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#0d0d10'; x.fillRect(0, 0, S, S);
  // the cover, cropped to the circle (a little zoomed so the spindle lands on the middle of the floor, not on a face)
  x.save(); x.beginPath(); x.arc(C, C, 440, 0, Math.PI * 2); x.clip();
  const s = 1000; if (has) x.drawImage(cover, C - s / 2 - 10, C - s / 2 + 10, s, s);
  else { const g = x.createRadialGradient(C, C, 40, C, C, 440); g.addColorStop(0, '#2a2f6a'); g.addColorStop(1, '#0a0b18'); x.fillStyle = g; x.fillRect(0, 0, S, S); }
  x.restore();
  // printed ring
  x.lineWidth = 86; x.strokeStyle = '#0a0a0c'; x.beginPath(); x.arc(C, C, 486, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.arc(C, C, 443, 0, Math.PI * 2); x.stroke();
  arcText(x, 'NINAJIRACHI  ·  I LOVE MY COMPUTER  ·  ', 482, -200, 30);
  arcText(x, 'SIDE A  ·  1. FUCK MY COMPUTER  ·  33⅓', 482, -10, 26);
  // the face, small, at the top of the picture, and a hole in the middle
  drawFace(x, C, C - 300, 70, { bg: true });
  x.fillStyle = '#000'; x.beginPath(); x.arc(C, C, 40, 0, Math.PI * 2); x.fill();
  x.globalCompositeOperation = 'multiply'; x.fillStyle = `rgb(${DARKEN * 255},${DARKEN * 255},${DARKEN * 255})`; x.fillRect(0, 0, S, S);
  return c;
}
