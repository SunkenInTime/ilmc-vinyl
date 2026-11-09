// The "System message" window from the Fuck My Computer video: Windows 98/2000 classic chrome (raised bevel, a navy to
// sky-blue caption, a monospace title, a boxed close button), a clip in a sunken frame, and a wide default OK button
// with a dotted focus box. Drawn once into its own canvas, so a cascade of a hundred costs a hundred drawImage calls.
const FACE = '#ecebe5', HI = '#ffffff', SH = '#a09f9a', DK = '#3c3c3c';

function bevel(x, X, Y, w, h, up = true) {
  x.fillStyle = up ? HI : SH; x.fillRect(X, Y, w, 1.5); x.fillRect(X, Y, 1.5, h);
  x.fillStyle = up ? DK : HI; x.fillRect(X, Y + h - 1.5, w, 1.5); x.fillRect(X + w - 1.5, Y, 1.5, h);
  x.fillStyle = up ? SH : DK; x.fillRect(X + 1.5, Y + h - 3, w - 3, 1.5); x.fillRect(X + w - 3, Y + 1.5, 1.5, h - 3);
}

// the clip: whatever image we have, through a cheap webcam (blown highlights, a cold cast, a little smear)
function clip(x, img, X, Y, w, h) {
  x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip();
  if (img) {
    const iw = img.width, ih = img.height, s = Math.max(w / iw, h / ih);
    x.filter = 'blur(0.6px) saturate(1.25) contrast(1.15) brightness(1.12)';
    x.drawImage(img, X + (w - iw * s) / 2, Y + (h - ih * s) / 2, iw * s, ih * s); x.filter = 'none';
    x.globalCompositeOperation = 'screen'; x.fillStyle = 'rgba(70,90,170,.22)'; x.fillRect(X, Y, w, h);
    x.globalCompositeOperation = 'source-over';
  } else { x.fillStyle = '#9fb4e8'; x.fillRect(X, Y, w, h); }
  x.restore();
}

export function systemMessage(img, W = 360) {
  const H = Math.round(W * 0.74), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), cap = Math.round(W * 0.062);
  x.fillStyle = FACE; x.fillRect(0, 0, W, H); bevel(x, 0, 0, W, H, true);
  const g = x.createLinearGradient(4, 0, W - 4, 0); g.addColorStop(0, '#0a246a'); g.addColorStop(1, '#a6caf0');
  x.fillStyle = g; x.fillRect(4, 4, W - 8, cap);
  x.fillStyle = '#fff'; x.font = `bold ${Math.round(cap * 0.72)}px "Courier New", Courier, monospace`; x.textBaseline = 'middle';
  x.fillText('System message', 9, 4 + cap / 2 + 1);
  const b = cap - 5, bx = W - 7 - b, by = 6.5;                       // the close box
  x.fillStyle = FACE; x.fillRect(bx, by, b, b); bevel(x, bx, by, b, b, true);
  x.strokeStyle = '#000'; x.lineWidth = Math.max(1.5, b * 0.12); x.beginPath();
  x.moveTo(bx + b * 0.3, by + b * 0.28); x.lineTo(bx + b * 0.7, by + b * 0.68); x.moveTo(bx + b * 0.7, by + b * 0.28); x.lineTo(bx + b * 0.3, by + b * 0.68); x.stroke();
  const fx = Math.round(W * 0.085), fy = 4 + cap + Math.round(W * 0.035), fw = W - 2 * fx, fh = Math.round(H * 0.56);
  clip(x, img, fx, fy, fw, fh); bevel(x, fx - 2, fy - 2, fw + 4, fh + 4, false);
  const ow = Math.round(W * 0.34), oh = Math.round(H * 0.11), ox = (W - ow) / 2, oy = fy + fh + Math.round(H * 0.06);
  x.fillStyle = '#000'; x.fillRect(ox - 1, oy - 1, ow + 2, oh + 2);   // the default button's black ring
  x.fillStyle = FACE; x.fillRect(ox, oy, ow, oh); bevel(x, ox, oy, ow, oh, true);
  x.strokeStyle = '#000'; x.lineWidth = 1; x.setLineDash([1, 1]); x.strokeRect(ox + 4.5, oy + 4.5, ow - 9, oh - 9); x.setLineDash([]);
  x.fillStyle = '#000'; x.font = `${Math.round(oh * 0.62)}px Arial, Helvetica, sans-serif`; x.textAlign = 'center'; x.fillText('OK', W / 2, oy + oh / 2 + 1);
  return c;
}
