// Title, artist, album and the album art, read from the file a visitor brings: ID3v2 (MP3), FLAC metadata blocks,
// MP4 atoms (M4A / AAC / ALAC) and Vorbis comments (Ogg / Opus). Nothing leaves the browser.
const td = (enc) => new TextDecoder(enc);
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const str = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

function id3(b) {
  const v = b[3], size = ((b[6] & 127) << 21) | ((b[7] & 127) << 14) | ((b[8] & 127) << 7) | (b[9] & 127), out = {};
  let o = 10; const end = Math.min(b.length, 10 + size);
  if (b[5] & 0x40) o += v === 4 ? ((b[10] & 127) << 21 | (b[11] & 127) << 14 | (b[12] & 127) << 7 | (b[13] & 127)) : u32(b, 10) + 4;
  const text = (d) => { const e = d[0], s = d.subarray(1); return (e === 0 ? td('latin1') : e === 3 ? td('utf-8') : e === 2 ? td('utf-16be') : td('utf-16')).decode(s).replace(/\0+$/, '').split('\0')[0]; };
  while (o + 10 <= end) {
    const id = str(b, o, 4); if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const n = v === 4 ? ((b[o + 4] & 127) << 21 | (b[o + 5] & 127) << 14 | (b[o + 6] & 127) << 7 | (b[o + 7] & 127)) : u32(b, o + 4);
    const d = b.subarray(o + 10, o + 10 + n);
    if (id === 'TIT2') out.title = text(d); else if (id === 'TPE1') out.artist = text(d); else if (id === 'TALB') out.album = text(d);
    else if (id === 'APIC' && (!out.pic || d[0] !== undefined)) {
      const enc = d[0]; let p = 1; while (d[p]) p++; const mime = str(d, 1, p - 1) || 'image/jpeg'; p++;
      const type = d[p++];
      if (enc === 1 || enc === 2) { while (p + 1 < d.length && (d[p] || d[p + 1])) p += 2; p += 2; } else { while (d[p]) p++; p++; }
      if (!out.pic || type === 3) out.pic = new Blob([d.subarray(p)], { type: mime.includes('/') ? mime : 'image/' + mime.toLowerCase() });
    }
    o += 10 + n;
  }
  return out;
}

function vorbis(b, o, out) {                       // a Vorbis comment block, little-endian lengths
  const vl = le32(b, o); o += 4 + vl; const n = le32(b, o); o += 4;
  for (let i = 0; i < n && o < b.length; i++) {
    const l = le32(b, o); o += 4; const c = td('utf-8').decode(b.subarray(o, o + l)); o += l;
    const k = c.slice(0, c.indexOf('=')).toUpperCase(), val = c.slice(c.indexOf('=') + 1);
    if (k === 'TITLE') out.title = val; else if (k === 'ARTIST') out.artist ||= val; else if (k === 'ALBUM') out.album = val;
    else if (k === 'METADATA_BLOCK_PICTURE' && !out.pic) { try { out.pic = picture(Uint8Array.from(atob(val), (ch) => ch.charCodeAt(0)), 0); } catch {} }
  }
}
function picture(b, o) {                           // a FLAC PICTURE block (also base64'd inside Ogg comments)
  o += 4; const ml = u32(b, o); o += 4; const mime = str(b, o, ml); o += ml; const dl = u32(b, o); o += 4 + dl + 16;
  const n = u32(b, o); o += 4; return new Blob([b.subarray(o, o + n)], { type: mime || 'image/jpeg' });
}
function flac(b) {
  const out = {}; let o = 4, last = false;
  while (!last && o + 4 <= b.length) {
    last = !!(b[o] & 128); const type = b[o] & 127, n = (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4;
    if (type === 4) vorbis(b, o, out); else if (type === 6 && !out.pic) out.pic = picture(b, o);
    o += n;
  }
  return out;
}
function mp4(b) {
  const out = {};
  const walk = (o, end, path) => {
    while (o + 8 <= end) {
      let n = u32(b, o); const t = str(b, o + 4, 4); let h = 8;
      if (n === 1) { n = Number((BigInt(u32(b, o + 8)) << 32n) | BigInt(u32(b, o + 12))); h = 16; }
      if (n < h || o + n > end) n = end - o;
      if (['moov', 'udta', 'ilst', 'trak', 'mdia'].includes(t)) walk(o + h, o + n, t);
      else if (t === 'meta') walk(o + h + 4, o + n, t);
      else if (path === 'ilst') {
        const dt = o + h; if (str(b, dt + 4, 4) === 'data') {
          const kind = u32(b, dt + 8) & 0xffffff, d = b.subarray(dt + 16, o + n);
          if (t === '©nam') out.title = td('utf-8').decode(d); else if (t === '©ART') out.artist = td('utf-8').decode(d);
          else if (t === '©alb') out.album = td('utf-8').decode(d);
          else if (t === 'covr' && !out.pic) out.pic = new Blob([d], { type: kind === 14 ? 'image/png' : 'image/jpeg' });
        }
      }
      o += n;
    }
  };
  walk(0, b.length, '');
  return out;
}
function ogg(b) {                                  // the comment header is in the first few pages
  const out = {}, s = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 1 << 20)));
  for (const tag of ['OpusTags', '\u0003vorbis']) { const i = s.indexOf(tag); if (i >= 0) { try { vorbis(b, i + tag.length, out); } catch {} } }
  return out;
}

export function readMeta(buf) {
  const b = new Uint8Array(buf);
  try {
    if (str(b, 0, 3) === 'ID3') return id3(b);
    if (str(b, 0, 4) === 'fLaC') return flac(b);
    if (str(b, 4, 4) === 'ftyp') return mp4(b);
    if (str(b, 0, 4) === 'OggS') return ogg(b);
  } catch (err) { console.warn('could not read the tags', err); }
  return {};
}
