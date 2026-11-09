// Is the file someone brought the song this room was choreographed for? Compare its loudness over time (dB, 50 per
// second) with the one in the song map. That survives any encoding (MP3, AAC, Opus, FLAC) and a few seconds of extra
// silence at either end; it does not survive a different mix or edit, which is the point.
export function envelope(ab) {
  const L = ab.getChannelData(0), R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L, hop = Math.round(ab.sampleRate / 50);
  const n = Math.floor(L.length / hop), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0; for (let j = i * hop; j < (i + 1) * hop; j++) { const v = (L[j] + R[j]) * 0.5; s += v * v; }
    const db = Math.max(-60, Math.min(0, 20 * Math.log10(Math.sqrt(s / hop) + 1e-9)));
    out[i] = Math.round((db + 60) / 60 * 255);
  }
  return out;
}
// best normalised correlation of a 60 s stretch of the map against the file, over offsets of up to 15 s either way
export function match(file, map, { from = 20, len = 60, maxLag = 15, fps = 50 } = {}) {
  const a0 = from * fps, n = Math.min(len * fps, map.length - a0), L = maxLag * fps;
  if (n < fps * 10) return { r: 0, lag: 0 };
  let ma = 0; for (let i = 0; i < n; i++) ma += map[a0 + i]; ma /= n;
  let mv = 0; for (let i = 0; i < n; i++) mv += (map[a0 + i] - ma) ** 2;
  let best = { r: -1, lag: 0 };
  for (let lag = -L; lag <= L; lag += 1) {
    const b0 = a0 + lag; if (b0 < 0 || b0 + n > file.length) continue;
    let fa = 0; for (let i = 0; i < n; i++) fa += file[b0 + i]; fa /= n;
    let c = 0, fv = 0; for (let i = 0; i < n; i++) { const d = file[b0 + i] - fa; c += (map[a0 + i] - ma) * d; fv += d * d; }
    const r = c / Math.sqrt(mv * fv + 1e-9);
    if (r > best.r) best = { r, lag: lag / fps };
  }
  return best;
}
