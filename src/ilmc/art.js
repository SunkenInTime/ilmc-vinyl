// What is in the drive: title, artist, album and its art, from the visitor's own file. The room, the label and the
// screens read it from here; nothing of the album's art ships with the site.
const subs = new Set();
export const art = {
  img: new Image(), title: '', artist: '', album: '', dur: 0, url: null,
  has() { return !!this.url && this.img.complete && this.img.naturalWidth > 0; },
  set({ title = '', artist = '', album = '', dur = 0, pic = null } = {}) {
    Object.assign(this, { title, artist, album, dur });
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = pic ? URL.createObjectURL(pic) : null;
    if (this.url) this.img.src = this.url;
    for (const f of subs) f();
  },
  on(f) { subs.add(f); },
};
art.img.addEventListener('load', () => { for (const f of subs) f(); });
