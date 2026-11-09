// I Love My Computer: the room around the deck. Shares the deck's WebGL context and depth buffer, so the
// computers stand in the same space as the turntable, and lends the deck their light (shaders.js uSL/uSC/uAmb).
//
// What drives it, from the music:
//   the song map (tempo, downbeats, sections), read at the needle's place in the groove -> the 4-5-6-2 jig, the drops
//   the deck's actual output (Listener) -> how hard everything moves, the spectrum, the scope, the woofers
// Build bars: a dark cave, crusted computers on the floor, faces on the screens. A drop: white flash, the floor goes,
// everything floats up into a Y2K wallpaper sky and flips on the jig. The break brings it all back down.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/addons/RoomEnvironment.js';
import * as M0 from './models.js';
import * as HQ from './hq.js';
const M = { ...M0, ...HQ };   // hq.js: the quality-pass versions of the machines
import { Discs } from './discs.js';
import { systemMessage } from './win98.js';
import { Screens, MODE, TILE, SKY_GLSL, FACE_GLSL } from './screens.js';
import { Post } from './post.js';
import { Overlay } from './overlay.js';
import { Listener, Song, JIG } from './audio.js';
import { Body, SHOTS } from './motion.js';
import { wire } from './cables.js';
import { drawFace } from './label.js';

const FLOOR = -0.08, CX = 0.042;
// between the vocals the jig chops the song's own words (4, 5, 6 and 2 to a bar)
const VOCAB = [['MY', 'COMPUTER'], ['MY', 'COMPUTER'], ['MY', 'COMPUTER'], ['MY', 'COMPUTER']];
const VOCAB_SOFT = [['loading', '.', '.', '.'], ['low', 'battery', 'still', 'playing', ':3'], ['new', 'message', 'from', 'my', 'computer', '♥'], ['ILMC', '.wav']];   // deck world: the floor, and the middle of the plinth
// PS1 wobble: vertices land on a coarse grid of screen positions (uPsx rows; 0 = off)
function psxify(mat, u) {
  if (mat.userData.psx) return; mat.userData.psx = true;
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    s.uniforms.uPsx = u;
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
uniform float uPsx;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
if (uPsx > 0.0) { vec2 g = vec2(uPsx * 1.7778, uPsx); gl_Position.xy = floor(gl_Position.xy / gl_Position.w * g + 0.5) / g * gl_Position.w; }`);
  };
  mat.customProgramCacheKey = () => (key ? key.call(mat) : '') + '|psx';
  mat.needsUpdate = true;
}
const PULSE = [new THREE.Color(1, 0.3, 0.7), new THREE.Color(0.3, 0.8, 1), new THREE.Color(1, 1, 1), new THREE.Color(1, 0.9, 0.2)];
// what each screen shows, by what it is: a few pieces each, changing every eight bars, staggered across the room
const T = (t) => [MODE.TILE, t];
const ROLES = {
  hero:    { cave: [[MODE.FACE]], drop: [[MODE.FACE], [MODE.FACES]] },
  franken: { cave: [T(TILE.SCOPE), [MODE.BARS], [MODE.FACE], T(TILE.UEFI)], drop: [[MODE.FACE], [MODE.TUNNEL], T(TILE.HEART)] },
  lcd:     { cave: [T(TILE.DAW), T(TILE.WAVE), T(TILE.COVER), T(TILE.DESKTOP)], drop: [[MODE.BLISS], T(TILE.TRIPLE), T(TILE.SYSMSG)] },
  crt:     { cave: [T(TILE.BIOS), T(TILE.UEFI), T(TILE.DESKTOP), T(TILE.COPY), T(TILE.AMP)], drop: [[MODE.TUNNEL], T(TILE.HEART), [MODE.BARS], T(TILE.BSOD)] },
  tv:      { cave: [T(TILE.SCOPE), [MODE.SNOW], T(TILE.NAME), T(TILE.COVER)], drop: [[MODE.FACES], T(TILE.NAME), T(TILE.TRIPLE)] },
  laptop:  { cave: [T(TILE.AMP), T(TILE.COPY), T(TILE.DESKTOP), T(TILE.WAVE)], drop: [[MODE.FACES], [MODE.TUNNEL], T(TILE.SYSMSG), [MODE.BLISS]] },
  imac:    { cave: [T(TILE.DESKTOP), T(TILE.SYSMSG), T(TILE.HEART)], drop: [T(TILE.SYSMSG), [MODE.BLISS], T(TILE.HEART), [MODE.FACES]] },
  phone:   { cave: [T(TILE.HEART)], drop: [T(TILE.HEART), [MODE.FACES]] },
};
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class ILMC {
  constructor(gl, canvas, opts = {}) {
    const r = this.r = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
    r.autoClear = false; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.15;
    this.cam = new THREE.PerspectiveCamera(); this.cam.matrixAutoUpdate = false; this.cam.matrixWorldAutoUpdate = false;
    this.root = new THREE.Group(); this.root.rotation.x = Math.PI / 2; this.scene.add(this.root);   // local: +y up (world +z), +z toward the viewer (world -y)
    this.listener = new Listener(); this.screens = new Screens(); this.post = new Post(r);
    this.overlay = opts.overlay ? new Overlay(opts.overlay) : null;
    this.reduce = !!opts.reduceFlashing;
    this.t = 0; this.lift = 0; this.liftT = 0; this.sky = 0; this.skyScene = 0; this.hits = 0; this.lastSix = null; this.flash = 0; this.inv = 0; this.zoomBlur = 0; this.tri = 0; this.split = 0;
    this.camKick = 0; this.azOff = 0; this.glitch = 0; this.camShot = { az: 0, el: 0, zoom: 0 }; this.strobe = 0; this.washHue = 0;
    this.buildLights(); this.buildSky(); this.buildRoom(); this.buildBigFace();
    this.psx = { value: 0 };
    this.root.traverse((m) => { if (m.material && !m.material.isShaderMaterial && !m.material.isMeshBasicMaterial) psxify(m.material, this.psx); });
  }

  // ---------------- the room ----------------
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x8899aa, 0x221a12, 0.06); s.add(this.hemi);
    // the deck's key: a spot from the same direction as its softbox, so the pool of light lands in the same place
    this.key = new THREE.SpotLight(0xfff2e0, 9, 0, 0.42, 0.9, 1.2); this.key.position.set(CX - 0.38 * 1.6, 0.30 * 1.6, 0.87 * 1.6);
    this.key.target.position.set(CX, 0, FLOOR); s.add(this.key, this.key.target);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 0); this.sun.position.set(-1, -0.8, 1.6); s.add(this.sun);
    this.points = Array.from({ length: 4 }, () => { const p = new THREE.PointLight(0xffffff, 0, 2.2, 2); s.add(p); return p; });
    this.strobeLight = new THREE.PointLight(0xffffff, 0, 0, 2); this.strobeLight.position.set(CX, 0, 1.2); s.add(this.strobeLight);
    this.deckLights = { pos: new Float32Array(32), col: new Float32Array(24), amb: new Float32Array(3), key: 0.5 };
  }
  buildSky() {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uSky: { value: 0 }, uTime: { value: 0 }, uFlyD: { value: 0 }, uScene: { value: 0 }, uFlash: { value: 0 }, uHue: { value: new THREE.Color(0, 0, 0) } },
      vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `precision highp float; uniform float uSky, uTime, uScene, uFlash, uFlyD; uniform vec3 uHue; varying vec3 vD;
        ${SKY_GLSL}
        void main() {
          vec3 d = normalize(vD); vec3 dy = vec3(d.x, d.z, -d.y);       // world z-up -> y-up for the wallpaper
          vec3 cave = vec3(0.004, 0.0042, 0.005) + uHue * smoothstep(-0.2, 0.6, dy.y) * 0.5;
          vec3 c = mix(cave, y2k(dy, uTime, uScene, uFlyD) * 0.85, uSky);
          gl_FragColor = vec4(mix(c, vec3(1.0), uFlash), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.skyMat = m; this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), m); this.skyMesh.frustumCulled = false; this.skyMesh.renderOrder = -10;
    this.scene.add(this.skyMesh);
  }
  // the computer's face, enormous, hanging in the sky during the drops
  buildBigFace() {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uKick: { value: 0 }, uMid: { value: 0 }, uBlink: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `precision highp float; uniform float uKick, uMid, uBlink, uA; varying vec2 vUv;
        ${FACE_GLSL}
        void main() {
          vec2 p = (vUv - 0.5) * 1.15;
          vec3 c = face(p, vec3(0.0));
          vec2 q = vec2(p.x * 0.92, -(p.y - 0.03) * 1.05 + 0.08) / (1.0 + 0.06 * uKick);
          float d = sdTri(q, 0.36) - 0.07, a = smoothstep(0.012, -0.012, d);
          float edge = smoothstep(0.03, 0.0, d) * (1.0 - a);            // a dark rim so it holds against a bright sky
          float halo = smoothstep(0.3, 0.02, d) * 0.3 * (1.0 - a);
          vec3 col = c * 1.1 * a + vec3(0.02, 0.03, 0.06) * edge + vec3(1.0) * halo;
          gl_FragColor = vec4(col / max(0.001, max(a + edge, halo)), clamp(a + edge * 0.9 + halo, 0.0, 1.0) * uA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.bigFace = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); this.bigFace.renderOrder = -5; this.bigFace.frustumCulled = false;
    this.scene.add(this.bigFace);
    this.bigBlink = 0; this.bigLunge = 0;
  }
  placeBigFace(cam, dt) {
    const f = this.bigFace, u = f.material.uniforms, a = clamp01(this.sky * 1.2 - 0.2) * (this.alive > 0.2 ? 1 : 0.4);
    f.visible = a > 0.01; if (!f.visible) return;
    const eye = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), fwd = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld), up = new THREE.Vector3(0, 1, 0).transformDirection(cam.matrixWorld);
    const dist = 9 - 2.5 * this.bigLunge;                     // always in the upper part of the picture, behind everything
    f.position.copy(eye).addScaledVector(fwd, dist).addScaledVector(up, dist * (0.19 + 0.01 * Math.sin(this.t * 0.8)));
    f.up.copy(up); f.lookAt(eye); const s = dist * 0.3 * (1 + 0.04 * this.fx.kick);
    f.scale.set(s, s, s);
    this.bigBlink = Math.max(0, this.bigBlink - dt * 6); this.bigLunge *= Math.exp(-dt * 4);
    u.uA.value = a; u.uKick.value = this.fx.kick * this.alive; u.uMid.value = this.fx.mid * this.alive; u.uBlink.value = Math.min(1, this.bigBlink);
  }

  buildRoom() {
    const R = (() => { let s = 4242; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
    this.things = [];
    const view = [-0.48, 0.88];                       // where the default camera stands (local x, z)
    const put = (o, x, z, opts = {}) => {
      const tx = CX + view[0] * 0.7 + (opts.tx || 0), tz = view[1] * 0.7;
      const yaw = opts.yaw ?? Math.atan2(tx - x, tz - z) + (R() - 0.5) * 0.3;
      { const bb = new THREE.Box3().setFromObject(o.g), sz = bb.getSize(new THREE.Vector3()); o.foot = Math.max(sz.x, sz.z) * 0.5; o.height = sz.y; }
      o.g.position.set(x, FLOOR + (opts.y || 0), z); o.g.rotation.y = yaw; this.root.add(o.g);
      if (opts.shadow !== false) { const sh = M.contactShadow(opts.sw || o.size * 1.4 + 0.15, opts.sd || o.size * 1.4 + 0.15, 0.8); sh.position.set(x, FLOOR + 0.0005, z); sh.rotation.z = yaw; this.root.add(sh); o.shadowMesh = sh; }
      const a = Math.atan2(z, x - CX), rad = Math.hypot(x - CX, z);
      o.home = { p: new THREE.Vector3(x, FLOOR + (opts.y || 0), z), yaw, rx: opts.rx || 0 };
      o.fly = { a, r: Math.max(0.55, rad * 0.9 + 0.15), h: 0.05 + R() * 0.45, speed: (0.05 + R() * 0.08) * (R() < 0.5 ? -1 : 1), axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), bob: R() * 6, delay: Math.min(0.5, rad * 0.25 + R() * 0.15) };
      o.hop = 0; o.hopV = 0; o.body = new Body(this.things.length * 1.37 + R());
      o.lane = { x: (R() < 0.5 ? -1 : 1) * (0.5 + R() * 1.4), h: -0.2 + R() * 0.85, z0: R() * 7 };
      o.homeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx || 0, yaw, 0));
      o.screens = o.screens.map((d, i) => this.screens.make(d, this.things.length * 3 + i + R()));
      this.things.push(o);
      return o;
    };
    // behind the deck
    this.hero = put(M.franken(3, 1.35), -0.62, -0.45);
    put(M.crt(1, 1.0), 0.06, -0.66);
    put(M.lcd(1.0), 0.6, -0.62);
    put(M.crt(2, 1.1, true), 1.12, -0.32);
    put(M.tower(5, 1.0), -1.08, -0.6);
    put(M.speaker(1.0), -0.3, -0.85, { tx: 0.3 });
    put(M.speaker(1.0), 1.0, -0.92, { tx: -0.3 });
    put(M.crt(4, 0.85), -1.2, -0.05);
    put(M.franken(9, 0.9), 1.3, 0.22);
    put(M.crt(6, 0.75, true), -0.5, -1.05);
    put(M.franken(12, 1.0), 0.4, -1.15);
    put(M.lcd(0.8), -1.5, -0.6);
    put(M.crt(7, 0.9), 1.7, -0.55);
    // in front, low, so they don't hide the deck
    this.kb = put(M.keyboard(1, 1.0), 0.02, 0.44, { yaw: 0.04 });
    this.laptops = [put(M.laptop(1, 1.0, 'silver'), -0.66, 0.34), put(M.laptop(2, 0.9, 'white'), 0.78, 0.46), put(M.laptop(3, 0.95, 'black'), -1.15, 0.62)];
    this.phone = put(M.flipPhone(1.0), 0.42, 0.32, { shadow: false }); this.ipod = put(M.ipodTouch(1.0), 0.33, 0.27, { shadow: false, yaw: 0.5 });
    // further out: candy iMacs, a stack of CRTs, a PS2, more of everything
    put(M.imac(0x1c9ad6, 1.0), -1.55, 0.2); put(M.imac(0xff7a1a, 0.9), 1.6, -0.15); put(M.imac(0xb14cff, 0.85), -0.95, -1.25);
    const low = put(M.crt(11, 0.95), 1.45, -1.0); put(M.crt(12, 0.8, true), 1.45, -1.0, { y: 0.33 * 0.95 + 0.03, shadow: false, yaw: low.home.yaw + 0.15 });
    put(M.ps2(1.0), -0.85, -0.82); put(M.laptop(4, 0.9, 'white'), 1.05, 0.95); put(M.laptop(5, 0.85, 'black'), -1.6, -0.95);
    put(M.crt(13, 0.85, true), -2.0, -0.3); put(M.crt(14, 1.0), 2.05, 0.35); put(M.franken(21, 0.95), 0.05, -1.55); put(M.tower(8, 1.0), 2.0, -0.85); put(M.speaker(0.9), -1.9, 0.75, { tx: 0.4 });
    this.mods = M.deckMods(drawFace, CX); this.root.add(this.mods.g);
    this.discs = new Discs(this.root, this.things.filter((o) => o.slot || o.tray).map((o) => ({ obj: o.slot || o.tray, owner: o, kind: 'cd' })), FLOOR);
    this.mods.screens = this.mods.screens.map((d) => this.screens.make(d, 99));
    put(M.keyboard(2, 0.9), 1.2, 0.85, { yaw: -0.5 });
    // floor clutter: discs, floppies, kandi, cables
    this.clutter = new THREE.Group(); this.root.add(this.clutter);
    for (let i = 0; i < 14; i++) {
      const a = R() * Math.PI * 2, rad = 0.45 + R() * 1.1, x = CX + Math.cos(a) * rad * 1.2, z = Math.sin(a) * rad;
      if (Math.abs(x - CX) < 0.33 && Math.abs(z) < 0.3) continue;
      const k = i % 3 === 0 ? M.cd(1) : i % 3 === 1 ? M.floppy([0x1d1d1f, 0x2a6be0, 0xff4fa3, 0xf2e86a][i % 4]) : M.kandi(i * 7 + 1);
      k.position.set(x, FLOOR + 0.0005 * i, z); k.rotation.y = R() * 6; this.clutter.add(k);
      k.userData.home = k.position.clone(); k.userData.ry = k.rotation.y; k.userData.up = 0.1 + R() * 0.5; k.userData.spin = (R() - 0.5) * 3; k.userData.ph = R() * 6;
    }
    const sheets = M.papers(this.screens.painter.cover);
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, rad = 0.5 + R() * 1.3, x = CX + Math.cos(a) * rad * 1.25, z = Math.sin(a) * rad;
      if (Math.abs(x - CX) < 0.33 && Math.abs(z) < 0.3) continue;
      const k = i % 4 === 3 ? M.mouse(R() < 0.5 ? 0xeeeeea : 0x222224) : i % 4 === 2 ? M.jewelCase() : sheets[i % sheets.length]();
      k.position.set(x, FLOOR + 0.0004 + 0.0003 * i, z); k.rotation.y = R() * 6; this.clutter.add(k);
      k.userData.home = k.position.clone(); k.userData.ry = k.rotation.y; k.userData.up = 0.1 + R() * 0.6; k.userData.spin = (R() - 0.5) * 3; k.userData.ph = R() * 6;
    }
    this.restack();
    // the wiring, grown around everything
    this.wiring = wire(this.root, { CX, FLOOR, things: this.things, R });
    this.cables = this.wiring.cables; this.deckCables = this.wiring.data;
    // big screens light the room (and the deck): the eight most important ones
    this.lit = this.things.flatMap((o) => o.screens.map((s) => ({ o, s }))).sort((a, b) => b.s.w * b.s.h - a.s.w * a.s.h).slice(0, 8);
    this.fixedScreens = [...this.things.flatMap((o) => o.screens), ...this.mods.screens].filter((sc) => sc.fixed !== undefined);
    for (const sc of this.fixedScreens) this.screens.set(sc, MODE.TILE, sc.fixed);
    this.allScreens = this.things.flatMap((o) => o.screens).filter((sc) => sc.fixed === undefined);
    // starting picture: the hero shows the face, the rest a quiet desktop
    const start = [[MODE.FACE], [MODE.TILE, TILE.BIOS], [MODE.TILE, TILE.DESKTOP], [MODE.TILE, TILE.AMP], [MODE.TILE, TILE.UEFI], [MODE.FACE], [MODE.TILE, TILE.SCOPE], [MODE.TILE, TILE.WAVE], [MODE.TILE, TILE.DAW], [MODE.FACE], [MODE.TILE, TILE.CHAT], [MODE.TILE, TILE.COPY]];
    this.allScreens.forEach((s, i) => this.screens.set(s, ...start[i % start.length]));
    for (const o of this.things) for (const sc of o.screens) { sc.owner = o; sc.role = o === this.hero ? 'hero' : o.kind; }
    this.allScreens.forEach((sc, i) => { sc.order = (i * 7) % this.allScreens.length; });
    // the karaoke screens: the black TVs and the small flat panel show the sung word, and only they do
    this.lyricScreens = this.allScreens.filter((sc) => sc.role === 'tv' || (sc.role === 'lcd' && sc.w < 0.5));
    // the gag: a pink USB stick in the side of the silver laptop, the tower's DVD tray
    const lap = this.laptops[0]; this.usb = M.usbStick(0xff4fa3); this.usbPump = new M.Pump();
    this.usb.g.position.set(0.16 + 0.006, 0.007, 0.04); lap.g.add(this.usb.g);
    this.tower = this.things.find((o) => o.kind === 'tower');
    // speed lines for the flight: thin streaks in a tube around the deck, rushing toward the viewer
    const N = 160, geo = new THREE.BoxGeometry(0.009, 0.009, 1), mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.InstancedMesh(geo, mat, N); this.lines.frustumCulled = false; this.root.add(this.lines);
    this.lineData = Array.from({ length: N }, (_, i) => { const a = R() * Math.PI * 2, r = 0.45 + Math.pow(R(), 0.7) * 2.2; return { x: CX + Math.cos(a) * r, y: FLOOR + 0.2 + Math.sin(a) * r * 0.8, z: R() * 10 - 6, len: 0.5 + R() * 1.6 }; });
    const lc = [new THREE.Color(1, 1, 1), new THREE.Color(1, 0.35, 0.75), new THREE.Color(0.35, 0.8, 1), new THREE.Color(1, 0.92, 0.3)];
    for (let i = 0; i < N; i++) this.lines.setColorAt(i, lc[i % 4]);
    this.flyD = 0; this.streamD = 0; this.rings = []; this.beatEnv = 0;
  }

  // Everything the opening camera can't see is wasted, so move it into the frame: onto the floor where there is room,
  // or stacked on top of another machine, like the pile on the cover. A spot counts only if the screen's centre lands
  // in frame, the stack doesn't stand between the lens and the deck, and its screen keeps clear of the others on screen.
  restack() {
    const asp = Math.max(1, innerWidth / Math.max(1, innerHeight));
    // the default view, as main.js / render.js build it (az -0.5, el 0.86, zoom -1.35)
    const at = new THREE.Vector3(0.042, 0, -0.015), base = Math.max(0.95, 0.95 * 1.5 / asp), dist = base * Math.exp(0.9 * 1.35), az = -0.5, el = 0.86;
    const cam = new THREE.PerspectiveCamera(30, asp, 0.05, 150); cam.up.set(0, 0, 1);
    cam.position.set(at.x + dist * Math.cos(el) * Math.sin(az), at.y - dist * Math.cos(el) * Math.cos(az), at.z + dist * Math.sin(el)); cam.lookAt(at);
    cam.updateMatrixWorld(); this.root.updateMatrixWorld();
    const ndc = (x, y, z) => this.root.localToWorld(new THREE.Vector3(x, y, z)).project(cam);
    const eye = this.root.worldToLocal(cam.position.clone()), deck = new THREE.Vector3(CX, FLOOR + 0.05, 0);
    const scrH = (o) => { const sc = o.screens[0]; if (!sc) return o.height * 0.6; sc.mesh.updateWorldMatrix(true, false); const v = sc.mesh.getWorldPosition(new THREE.Vector3()); return this.root.worldToLocal(v).y - o.g.position.y; };
    const seen = (o) => (o.screens.length ? true : (() => { const v = ndc(o.home.p.x, o.home.p.y + o.height * 0.8, o.home.p.z); return Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9; })()) && o.screens.every((sc) => { const v = sc.mesh.getWorldPosition(new THREE.Vector3()).project(cam); return Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z < 1; });
    const mobile = ['crt', 'tv', 'lcd', 'imac', 'franken', 'tower', 'ps2', 'speaker', 'laptop'];
    const stacks = this.things.map((o) => ({ x: o.home.p.x, z: o.home.p.z, r: o.foot, top: o.height, base: o, n: 1 }));
    const pts = [];                                          // screen positions already in frame, in NDC
    for (const o of this.things) if (seen(o)) for (const sc of o.screens) { const v = sc.mesh.getWorldPosition(new THREE.Vector3()).project(cam); pts.push([v.x, v.y]); }
    stacks.push({ x: CX, z: 0, r: 0.36, top: 0.1, deck: true, n: 9 }, { x: 0.02, z: 0.44, r: 0.3, top: 0.05, deck: true, n: 9 });
    const blocks = (x, z, h, r) => {                          // between the lens and the deck?
      const D = deck.clone().sub(eye), P = new THREE.Vector3(x, FLOOR + h * 0.5, z), t = P.clone().sub(eye).dot(D) / D.lengthSq();
      if (t < 0 || t > 1.05) return false;
      return P.distanceTo(eye.clone().addScaledVector(D, t)) < r + 0.22;
    };
    const out = this.things.filter((o) => mobile.includes(o.kind) && !seen(o)).sort((a, b) => b.height - a.height);
    for (const o of out) {
      const own = stacks.find((st) => st.base === o); if (own) stacks.splice(stacks.indexOf(own), 1);
      const sh = scrH(o); let best = null;
      const consider = (x, z, y, onto) => {
        const c = ndc(x, FLOOR + y + sh, z), top = ndc(x, FLOOR + y + o.height, z);
        if (Math.abs(c.x) > 0.86 || Math.abs(c.y) > 0.84 || top.y > 1.05 || Math.abs(top.x) > 1) return;
        if (blocks(x, z, y + o.height, o.foot)) return;
        if (Math.hypot(x - eye.x, z - eye.z) < Math.hypot(deck.x - eye.x, deck.z - eye.z) - 0.1) return;   // not in the foreground
        let near = 9; for (const [px, py] of pts) near = Math.min(near, Math.hypot((c.x - px) * asp, c.y - py));
        const score = Math.min(near, 0.6) + (onto ? 0.12 : 0) + 0.15 * c.y;       // apart from the others, stacked, toward the back
        if (!best || score > best.score) best = { x, z, y, onto, score, c };
      };
      for (const st of stacks) if (!st.deck && st.n < 3 && st.r >= o.foot * 0.75) consider(st.x, st.z, st.top, st);   // on top of something
      for (let z = -1.4; z <= 0.9; z += 0.08) for (let x = -1.4; x <= 1.6; x += 0.08) {                              // or on the floor
        if (stacks.some((st) => Math.hypot(st.x - x, st.z - z) < st.r + o.foot + 0.03)) continue;
        consider(x, z, 0, null);
      }
      if (!best) { if (own) stacks.push(own); continue; }
      const yaw = Math.atan2(eye.x - best.x, eye.z - best.z) + (best.onto ? (Math.random() - 0.5) * 0.25 : 0);
      o.home.p.set(best.x, FLOOR + best.y, best.z); o.home.yaw = yaw; o.homeQ.setFromEuler(new THREE.Euler(0, yaw, 0));
      o.g.position.copy(o.home.p); o.g.quaternion.copy(o.homeQ);
      if (o.shadowMesh) { o.shadowMesh.visible = !best.onto; o.shadowMesh.position.set(best.x, FLOOR + 0.0005, best.z); o.shadowMesh.rotation.z = yaw; }
      if (best.onto) { best.onto.top += o.height; best.onto.n++; o.stackedOn = best.onto.base; }
      else stacks.push({ x: best.x, z: best.z, r: o.foot, top: o.height, base: o, n: 1 });
      pts.push([best.c.x, best.c.y]);
    }
    this.root.updateMatrixWorld();
  }

  // ---------------- per frame ----------------
  attachAudio(ctx, node) { this.listener.attach(ctx, node); }
  setSong(map, off = 0) { this.song = map ? new Song(map) : null; if (this.song) this.song.off = off; this.lastT = null; this.doneT = null; }

  // pos: { t (s into the track), on (needle in the groove), rate (1 = playing at speed) }; returns what the deck needs
  update(dt, pos, opts = {}) {
    if (pos && this.song?.off) pos = { ...pos, t: pos.t - this.song.off };     // the map's clock, not the file's
    dt = Math.min(0.1, Math.max(0, dt)); this.t += dt; this._dt = dt;
    const L = this.listener; L.update(dt);
    const playing = !!(pos && pos.on && Math.abs(pos.rate) > 0.3);
    const alive = this.alive = (this.alive || 0) + ((playing ? 1 : 0) * Math.min(1, L.level * 6 + 0.2) - (this.alive || 0)) * (1 - Math.exp(-dt * 6));
    const at = this.song && pos && pos.on ? this.song.at(pos.t) : null;
    this.at = at;
    // the 4-5-6-2 jig, stepped by sixteenths as the needle moves forward through them
    if (at && playing) {
      const six = at.sixteenth;
      if (this.lastSix !== null && six > this.lastSix && six - this.lastSix < 8) for (let k = this.lastSix + 1; k <= six; k++) this.jigStep(k, at);
      this.lastSix = this.lastSix === null || six > this.lastSix || six < this.lastSix - 8 ? six : this.lastSix;   // a few-ms wobble back never re-fires a step
    } else if (!at && playing && L.kick > 0.99 && !this._kickLatch) { this._kickLatch = true; this.liveHit(); }   // a record with no map: the kicks drive it
    if (L.kick < 0.6) this._kickLatch = false;
    if (!playing) this.lastSix = at ? at.sixteenth : null;
    if (this.song && pos && pos.on) this.words(dt, pos.t, playing); else this.spamS = 0;
    this.lastT = pos && pos.on ? pos.t : null;
    // where we are: the floor (cave) or the sky (drop)
    const drop = playing && at && at.sec === 'drop' && at.energy > 0.6;
    this.liftT = drop ? 1 : 0;
    if (!at && !playing) this.liftT = 0;
    this.lift += (this.liftT - this.lift) * (1 - Math.exp(-dt * (this.liftT > this.lift ? 2.4 : 1.6)));
    this.sky += ((this.liftT > 0.5 ? 1 : 0) - this.sky) * (1 - Math.exp(-dt * 10));
    if (this.liftT !== this._wasLift) { if (this._wasLift !== undefined && playing) this.bigFlash(this.liftT ? 1 : 0.7); this._wasLift = this.liftT; }
    // continuous reactions
    const fx = this.fx = {
      time: this.t, beat: at ? at.beat : this.t * 2, kick: Math.max(L.kick, at ? at.onset * at.low : 0), level: L.level, low: L.low, mid: L.mid, high: L.high, hat: L.hat,
      spec: L.spec, peak: L.peak, wavL: L.wavL, wavR: L.wavR, alive, hits: this.hits, energy: at ? at.energy * alive : 0, palette: Math.floor((at ? at.bar : 0) / 4) & 3,
      songT: pos?.t, song: this.song,
    };
    this.screens.shared.uScene.value = this.sky;
    if (this.bsodUntil && this.t > this.bsodUntil) this.bsodUntil = 0;
    this.screens.update(dt, fx);
    if (L.kick > 0.99 && !this._kickPush) {                  // the kick shoves everything in the air outward
      this._kickPush = true;
      for (const o of this.things) if (o.body.air) o.body.v.addScaledVector(o.body.p.clone().setY(0).sub(new THREE.Vector3(CX, 0, 0)).normalize(), 0.35 * alive);
    }
    if (L.kick < 0.5) this._kickPush = false;
    for (const o of this.things) { this.animate(o, dt, fx); o.tick(dt, fx); }
    this.mods.tick(dt, fx);
    this.discs.step(dt, this.sky > 0.5);
    this.camera(dt, at, playing);
    this.fly(dt, fx);
    this.program(at, playing);
    const ux = this.usbPump.step(dt); this.usb.g.position.x = 0.166 + (1 - ux) * 0.05; this.usb.led.material.color.setHSL(0.38, 1, 0.3 + 0.5 * (1 - ux));
    for (const c of this.cables) {
      const u = c.u, d = clamp01(this.lift * 1.6 - (c.seed % 1) * 0.6), fall = smooth(d);
      u.uT.value = this.t; u.uWave.value = (fx.low * 0.6 + fx.kick * 0.8) * alive; u.uFloat.value = fall; u.uData.value = fx.energy * 0.6;
      c.g.position.y = -fall * fall * (1.2 + (c.seed * 3.7 % 1) * 1.5); c.g.visible = fall < 0.995;
    }
    const sf = smooth(clamp01(this.lift * 1.4)); this.wiring.strip.position.y = FLOOR - sf * sf * 1.4; this.wiring.headphones.position.y = FLOOR - sf * sf * 1.1;
    for (const z of this.wiring.ties || []) z.visible = sf < 0.2;
    if (this.lift > 0.001 || this._plugsMoved) { this.wiring.plugs.update(); this._plugsMoved = this.lift > 0.001; }
    const cl = smooth(clamp01(this.lift * 1.3 - 0.2));          // the small things on the floor drift up too
    for (const k of this.clutter.children) {
      const u = k.userData; if (!u.home) continue;
      k.position.set(u.home.x, u.home.y + cl * (u.up + 0.03 * Math.sin(this.t * 1.3 + u.ph)), u.home.z);
      k.rotation.set(cl * Math.sin(this.t * 0.7 + u.ph) * 1.2, u.ry + cl * this.t * u.spin * 0.3, cl * Math.cos(this.t * 0.5 + u.ph));
    }
    this.glitch *= Math.exp(-dt * 5); this.flash *= Math.exp(-dt * 9); this.inv = Math.max(0, this.inv - dt); this.zoomBlur *= Math.exp(-dt * 3.5); this.tri = Math.max(0, this.tri - dt);
    this.split += (L.kick * 0.6 * alive + this.flash + 0.5 * (this.beatEnv || 0) * this.lift - this.split) * (1 - Math.exp(-dt * 20));
    this.camKick *= Math.exp(-dt * 7); this.strobe *= Math.exp(-dt * 14);
    this.azOff += dt * 0.06 * this.lift; this.azOff *= 1 - (1 - this.lift) * dt * 0.8;
    this.washHue = (this.washHue + dt * 0.05) % 1;
    this.lights(dt, fx, at);
    const px = this.reduce ? 0 : this.pixel();
    this.psx.value = px > 0.05 ? Math.round(420 - 330 * px) : 0;
    if (this.overlay) {
      if (!playing && this._wasPlaying) this.overlay.clear();
      this.overlay.draw(dt, clamp01(alive * 1.4) * (this.reduce ? 0.7 : 1), this.sky, (this.spamS || 0) * (this.reduce ? 0.2 : 1));
    }
    this._wasPlaying = playing;
    const fl = this.reduce ? 0.25 : 1;
    return {
      lights: this.deckLights, bare: this.sky > 0.5,
      cam: this.camOut(alive, fl),
      post: { uFlash: this.flash * fl * 0.85, uSplit: this.split * fl, uZoom: this.zoomBlur * fl, uTri: this.tri > 0 && !this.reduce ? 1 : 0, uInv: this.inv > 0 && !this.reduce ? 1 : 0, uBloom: (0.5 + 0.25 * L.kick * alive) * (1 - 0.6 * this.sky), uThresh: 0.74 + 0.18 * this.sky, uGrain: 0.03 + 0.02 * this.sky + 0.08 * (this.spamS || 0), uVig: 0.85 - 0.4 * this.sky,
        uGlitch: Math.min(1, this.glitch + 0.3 * (this.spamS || 0) ** 2) * fl, uPixel: this.reduce ? 0 : this.pixel(),
        uTrail: this.reduce ? 0 : Math.min(0.85, 0.32 * this.lift * fx.energy + 0.55 * (this.spamS || 0) + 0.6 * this.glitch * this.glitch), uMBlur: this.reduce ? 0.3 : 0.6 + 0.6 * this.lift,
        tint: [1 + this.strobe * 0.2 * fl, 1 + this.strobe * 0.2 * fl, 1 + this.strobe * 0.2 * fl] },
    };
  }

  // ---- the words: lyrics where they are sung, the stutter spam before a drop, and the blow-out on the downbeat ----
  words(dt, t, playing) {
    const ly = this.song.m.lyrics, cues = this.song.m.cues || [], prev = this.lastT;
    // the needle's time wobbles back a few ms between telemetry packets; only ever fire past the furthest point reached
    if (this.doneT == null || t < this.doneT - 0.5 || t > this.doneT + 0.5) this.doneT = t;
    const from = Math.max(prev ?? t, this.doneT), fwd = playing && prev != null && t > from && t - from < 0.5;
    if (fwd && ly && this.overlay) for (const w of ly.words) if (w.t > from && w.t <= t) this.sung(w);
    this.inLine = !!(ly && ly.words.some((w) => w.t <= t && w.t > t - 1.6));   // she is singing (or just was)
    const cue = cues.find((c) => t >= c.t0 && t < c.t1);
    if (fwd && this.song.m.chops && cue) {
      for (const ct of this.song.m.chops) if (ct > from && ct <= t && ct >= cue.t0) {
        const left = cue.t1 - ct; this.chopN = (this.chopN || 0) + 1;
        if (this.chopN % (left > 20 ? 3 : left > 10 ? 2 : 1)) continue;
        const w = ly && [...ly.words].reverse().find((x) => x.t <= ct + 0.05);
        this.overload(Math.max(0.3, this.spamS || 0.3), false, w && ct - w.t < 2.5 ? w.w.replace(/-$/, '—').replace(/[,.]/g, '').toUpperCase() : null);
      }
    }
    let s = 0;
    for (const c of cues) {
      if (t >= c.t0 && t < c.t1) {
        const p = (t - c.t0) / (c.peak - c.t0), short = c.t1 - c.t0 < 10;      // a short run-up has to hit hard from its first second
        let v = t < c.peak ? (short ? 0.35 + 0.55 * p : 0.1 + 0.65 * Math.pow(p, 1.5)) : 0.9 + 0.1 * (t - c.peak) / (c.t1 - c.peak);
        if (c.curve) for (let i = 0; i + 1 < c.curve.length; i++) {                // or the song's own shape, where we measured it
          const [ta, va] = c.curve[i], [tb, vb] = c.curve[i + 1];
          if (t >= ta && t <= tb) { const k = (t - ta) / (tb - ta); v = va + (vb - va) * k * k * (3 - 2 * k); break; }
        }
        s = Math.max(s, c.k * v);
      }
      if (fwd && from < c.t1 && t >= c.t1) this.obliterate(c.k);
    }
    if (t > this.doneT) this.doneT = t;
    this.spamS = playing ? s : 0;
    if (this.overlay && this.spamS > 0.02) {
      this.spamAcc = (this.spamAcc || 0) + dt * 30 * Math.max(0, this.spamS - 0.55) ** 2 * 6;
      const k = Math.floor(this.spamAcc); this.spamAcc -= k;
      if (k && this.spamS > 0.55) this.overlay.spam(Math.min(k, 4), this.spamS);
      this.glitch = Math.max(this.glitch, this.spamS * 0.3 * (Math.random() < 0.25 ? 1 : 0.3));
      if (Math.random() < this.spamS * dt * 12) this.screens.word = ['FUCK', 'F—', 'FU—', 'WANT', 'WANNA'][Math.floor(Math.random() * 5)];
    }
  }
  // one step of the overload: a dialog in the cascade, a disc fired out of a tower, static on a screen
  overload(s, sung, word) {
    const words = ['FUCK', 'F—', 'FU—', 'WANT', 'WANNA', 'MY COMPUTER'];
    this.overN = (this.overN || 0) + 1;
    // the machines take turns: each lobs a CD onto open floor between itself and the deck, kept in view
    const L = this.discs.launchers, li = this.overN % L.length, from = L[li].owner.home.p, R = Math.random;
    let tx = from.x + (CX - from.x) * (0.35 + R() * 0.3) + (R() - 0.5) * 0.3, tz = from.z + (0.3 - from.z) * (0.35 + R() * 0.3) + (R() - 0.5) * 0.3;
    const dx = tx - CX, dz = tz, d = Math.hypot(dx, dz); if (d < 0.36) { tx = CX + dx / (d || 1) * 0.36; tz = dz / (d || 1) * 0.36; }   // not onto the deck
    const v = this.root.localToWorld(new THREE.Vector3(tx, FLOOR, tz)).project(this.cam);
    if (Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.92) { tx = CX - 0.55 + R() * 1.1; tz = 0.24 + R() * 0.32; }                     // out of view: in front of the deck instead
    this.discs.fire(li, 0.7 + 0.7 * s, new THREE.Vector3(tx, FLOOR + 0.002, tz));
    const sc = this.allScreens[(this.overN * 5) % this.allScreens.length]; sc.override = { mode: MODE.SNOW, from: this.t, until: this.t + 0.09 }; sc.tear = 1;
    this.camKick = Math.max(this.camKick, 0.35 * s);
  }
  sung(w) {
    const power = this.at ? (this.at.sec === 'drop' ? 1 : 0.7) : 0.6, cut = /-$/.test(w.w);
    this.overlay.lyric(w.w, w.line, power);
    this.screens.word = cut ? w.w.replace(/-$/, '—').toUpperCase() : w.w.replace(/[,.]/g, '').toUpperCase();
    this.hits++;
    for (const sc of this.lyricScreens) { if (sc.mode !== MODE.TILE || sc.tile !== TILE.WORD) this.screens.set(sc, MODE.TILE, TILE.WORD); sc.flash = 0.5; sc.lyricUntil = this.t + 1.4; }
    this.answer(w.w);
    if (cut) { this.glitch = Math.max(this.glitch, 0.7); this.camKick = 1; for (const o of this.things) if (o.body.air) { o.body.kick(4, 0, null); o.body.glitch = 0.18; } }
    if (/computer/i.test(w.w)) { this.hero.screens[0].blink = 1.4; this.bigLunge = 1; }
  }
  obliterate(k) {
    this.discs.blow(new THREE.Vector3(CX, FLOOR, 0));
    for (const c of this.wiring.power) c.fire(this.t, new THREE.Color(1.6, 1.6, 1.8), c.tag === 'power' ? -1 : 1);   // a surge out of the strip
    for (const c of this.wiring.data) c.fire(this.t + 0.15, new THREE.Color(1.2, 0.4, 1.0), 1);
    this.overlay?.obliterate();
    this.bigFlash(1); this.glitch = 1; this.zoomBlur = 1.3; this.camKick = 1.5;
    for (const o of this.things) if (o.body.air) { o.body.kick(10 * k, 1.2 * k, o.body.p.clone().sub(new THREE.Vector3(CX, 0, 0)).normalize()); o.body.glitch = 0.3; }
    for (const s of this.allScreens) this.screens.set(s, MODE.TILE, TILE.BSOD);
    this.bsodUntil = this.t + 0.35;
    this.usbPump.set(1); if (this.tower) this.tower.pump.set(0);          // in, and shut
  }
  // how chunky the picture is: PS1-ish in the quiet parts, sharp in the drops, falling apart in the stutter
  pixel() {
    const quiet = this.at && this.at.sec === 'break' ? 1 : this.at && this.at.sec === 'build' ? 0.5 : 0;
    return Math.max((1 - this.sky) * quiet * 0.55 * (this.alive || 0), (this.spamS || 0) * 0.45, this.glitch > 0.6 ? this.glitch * 0.6 : 0);
  }
  // camera: in the drops, cuts between shots on every other bar line, a slow move inside each; handheld shake in the stutter
  camera(dt, at, playing) {
    this.shot ||= SHOTS[0]; this.shotT = (this.shotT || 0) + dt;
    const inDrop = this.lift > 0.5 && playing;

    const w = this.shotW = (this.shotW || 0) + ((inDrop ? 1 : 0) - (this.shotW || 0)) * (1 - Math.exp(-dt * (inDrop ? 30 : 1.5)));
    this.camShot = { az: 0, el: 0, zoom: 0 };
  }
  camOut(alive, fl) {
    const sh = (this.spamS || 0) * fl, n = (k) => Math.sin(this.t * (23 + k * 7) + k) * Math.sin(this.t * (31 - k * 5));
    const drop1 = this.song?.m.cues?.[0]?.t1 ?? 42.1, it = this.at && this.at.t < drop1 ? 1 - smooth(clamp01(this.at.t / 22)) : 0;   // out to the wall by 0:22, then hold
    this.introW = (this.introW || 0) + (it - (this.introW || 0)) * 0.08;                // eased, so a seek never jumps the shot
    const iw = this.introW * fl;
    const bp = this.at ? this.at.beat : this.t * 2.27, ride = smooth(this.lift) * fl;      // two beats up, two beats down
    return {
      roll: ride * (0.05 * Math.sin(bp * Math.PI / 2) + 0.035 * (this.beatEnv || 0) * (Math.floor(bp) % 2 ? 1 : -1)) + n(3) * 0.03 * sh,
      az: this.camShot.az + Math.sin(this.t * 0.31) * 0.01 * alive + n(1) * 0.025 * sh - 0.32 * iw,
      el: this.camShot.el - 0.22 * iw + Math.sin(this.t * 0.23) * 0.008 * alive - smooth(this.lift) * 0.66 + n(2) * 0.02 * sh + ride * 0.07 * Math.sin(bp * Math.PI / 2 - 0.6),
      zoom: this.camShot.zoom + 0.75 * iw + this.camKick * 0.05 * fl + smooth(this.lift) * 0.12 + sh * 0.25 + ride * (0.05 * Math.sin(bp * Math.PI / 2 + 1.0) + 0.07 * (this.beatEnv || 0)),
    };
  }

  // ---- the drops: the deck surfs forward; the world, the computers and streaks of light rush past ----
  fly(dt, fx) {
    const at = this.at, ph = at ? at.beat - Math.floor(at.beat) : 1, be = this.beatEnv = (at ? Math.exp(-ph * 5) : fx.kick) * fx.alive;   // 1 on each beat, falling
    const L = this.lift, speed = (0.55 + 2.4 * be) * L;                    // the flight surges on every beat and settles between
    if (at && L > 0.5 && Math.floor(at.beat) !== this.lastBeat) { this.lastBeat = Math.floor(at.beat); if (at.beatInBar < 1) this.ring(); }
    this.flyD += dt * speed * 7; this.streamD += dt * speed * 1.7;
    this.skyMat.uniforms.uFlyD.value = this.flyD;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const op = clamp01(L * 1.4 - 0.3) * (this.reduce ? 0.4 : 0.85);
    this.lines.material.opacity = op * (0.45 + 0.55 * be); this.lines.visible = op > 0.01;
    for (const r of this.rings) { r.t += dt; const k = r.t / 0.8; r.m.visible = k < 1; if (k < 1) { const sc = 0.35 + 4.5 * (1 - Math.pow(1 - k, 3)); r.m.scale.set(sc, sc, sc); r.m.material.opacity = (1 - k) * 0.9 * (this.reduce ? 0.4 : 1); } }
    if (this.lines.visible) {
      this.lineData.forEach((d, i) => {
        const z = ((d.z + this.flyD * 0.9) % 10 + 10) % 10 - 6, len = d.len * (0.4 + 1.4 * speed);
        m.compose(new THREE.Vector3(d.x, d.y, z), q, sc.set(1, 1, len)); this.lines.setMatrixAt(i, m);
      });
      this.lines.instanceMatrix.needsUpdate = true;
    }
  }
  // what each screen shows: its role's list for this part of the song, moving on every eight bars, staggered;
  // the karaoke screens hold the sung word for a moment; in the big build the stutter takes the screens over
  program(at, playing) {
    const bar = at ? at.bar : Math.floor(this.t / 1.76), set = this.sky > 0.5 ? 'drop' : 'cave', N = this.allScreens.length;
    for (const sc of this.allScreens) {
      if (this.bsodUntil) continue;
      if (sc.lyricUntil > this.t) continue;
      if (at && playing && at.t < 30) {
        const p = clamp01((at.t - 1.2) / 26), on = sc.order / N < p * p * 0.85 + p * 0.15;
        if (!on) { if (sc.mode !== MODE.OFF) this.screens.set(sc, MODE.OFF); continue; }
        if (sc.mode === MODE.OFF) { sc.flash = 0.9; sc.tear = 0.6; }
      }
      const ov = sc.override;
      if (ov && this.t >= ov.from && this.t < ov.until) { if (sc.mode !== ov.mode || (ov.mode === MODE.TILE && sc.tile !== ov.tile)) { this.screens.set(sc, ov.mode, ov.tile ?? -1); sc.flash = 0.5; } continue; }
      let want;
      if (this.spamS > 0.05 && sc.order / N < this.spamS * 1.15) want = (Math.floor(this.t * 6) + sc.order) % 3 ? [MODE.TILE, TILE.WORD] : [MODE.SNOW];
      else { const list = (ROLES[sc.role] || ROLES.crt)[set]; want = list[Math.floor((bar + sc.order * 3) / 8 + 64) % list.length]; }
      if (sc.mode !== want[0] || (want[0] === MODE.TILE && sc.tile !== want[1])) this.screens.set(sc, want[0], want[1] ?? -1);
    }
  }
  // the room answers her: on "name" her name ripples across every screen, on "better" they all turn to the face and
  // blink together, "world" is the wallpaper world, "computer" the cover, and every cut-off "f-" a burst of static
  answer(word) {
    const w = word.toLowerCase().replace(/[^a-z-]/g, ''), all = this.allScreens, N = all.length, t = this.t;
    const ripple = (mode, tile, hold, step = 0.045) => all.forEach((sc) => { sc.override = { mode, tile, from: t + sc.order * step, until: t + sc.order * step + hold }; });
    if (w === 'name') ripple(MODE.TILE, TILE.NAME, 2.2);
    else if (w === 'better') { ripple(MODE.FACE, -1, 2.4, 0.02); for (const sc of all) sc.blink = 1.6; }
    else if (w === 'world') ripple(MODE.BLISS, -1, 1.6, 0.03);
    else if (w === 'computer') ripple(MODE.TILE, TILE.COVER, 1.5, 0.025);
    else if (/-$/.test(w)) all.forEach((sc) => { sc.override = { mode: MODE.SNOW, from: t, until: t + 0.22 }; sc.tear = 1; });
  }

  // a shockwave off the deck on every downbeat in the drops
  ring() {
    this.rings ||= [];
    let r = this.rings.find((x) => x.t > 0.8);
    if (!r) {
      if (this.rings.length >= 4) return;
      const m = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.frustumCulled = false; this.root.add(m); r = { m, t: 0 }; this.rings.push(r);
    }
    r.t = 0; r.m.position.set(CX, FLOOR + 0.02, 0); r.m.material.color.setHSL([0.92, 0.55, 0.15, 0][(this.ringN = (this.ringN || 0) + 1) % 4], 1, 0.6);
  }

  bigFlash(k) { this.flash = Math.max(this.flash, k); this.zoomBlur = Math.max(this.zoomBlur, k); for (const s of this.allScreens) s.flash = 0.7; }

  jigStep(six, at) {
    const bar = Math.floor(six / 16), g = ((bar % 4) + 4) % 4, step = six - bar * 16, list = JIG[g], i = list.indexOf(step);
    const sec = this.song.at((six / 4) * this.song.m.beatLen + this.song.m.beat0).sec;
    if (step % 4 === 0) this.beatTick(step / 4, sec, bar);
    if (this.spamS > 0.02) {                                   // overload, locked to the beat: quarters, then eighths, then sixteenths
      const s = this.spamS, every = s < 0.3 ? 4 : s < 0.6 ? 2 : 1;
      this.usbPump.toggle(); if (this.tower) this.tower.pump.toggle();
    }
    if (i < 0) return;
    this.hit(Math.floor(bar / 4), g, i, list.length, sec);
  }
  liveHit() {
    const n = this._n = ((this._n || 0) + 1) % 17, gs = [4, 5, 6, 2]; let g = 0, i = n;
    while (i >= gs[g]) { i -= gs[g]; g++; }
    this.hit(this._cyc = (this._cyc || 0) + (n === 0 ? 1 : 0), g, i, gs[g], this.listener.level > 0.35 ? 'build' : 'break');
  }
  beatTick(b, sec, bar) {
    // every beat: something small; on the downbeat of four bars in a drop, a new wallpaper world
    if (sec === 'drop' && b === 0 && bar % 4 === 0) { this.skyScene = (this.skyScene + 1) % 4; this.skyMat.uniforms.uScene.value = this.skyScene; this.zoomBlur = Math.max(this.zoomBlur, 0.8); }
    if (sec === 'drop') this.strobe = Math.max(this.strobe, b % 2 ? 0.5 : 1);
    const face = this.hero.screens[0]; if (b === 2 && Math.random() < 0.6) face.blink = 1.6;
    if (b === 3 && bar % 2) this.bigBlink = 1.6;
  }
  hit(cycle, g, i, n, sec) {
    this.hits++;
    const power = sec === 'drop' ? 1 : sec === 'build' ? 0.6 : 0.3, S = this.screens, all = this.allScreens;
    // screens: a hit flashes and tears a few of them; what they show is their own (program)
    const k = sec === 'drop' ? 4 : sec === 'build' ? 2 : 1;
    for (let j = 0; j < k; j++) { const sc = all[(this.hits * 3 + j * 5) % all.length]; sc.flash = Math.max(sc.flash, 0.3 * power); sc.tear = 0.4 + 0.5 * power; }
    // the gag, in the quiet parts: the stick goes in and out on the six-hit bar, the tray on the two
    if (!(this.spamS > 0.02)) { if (g === 2 && sec !== 'drop') this.usbPump.toggle(); if (g === 3 && this.tower) this.tower.pump.toggle(); }
    if (g === 3) {                                   // the two big hits: everything answers at once
      for (const s of all) s.flash = Math.max(s.flash, 0.5 * power);
      if (sec === 'drop') { if (i === 0) { this.flash = Math.max(this.flash, 0.55); this.zoomBlur = 1; } else { this.inv = 0.07; this.tri = 0.45; } }
      this.camKick = 1;
      this.hero.screens[0].blink = 1.2;
      if (i === 0) this.bigLunge = 1;
    }
    // things move: laptops and the phone flap on the first bar, the floor hops in builds, everything flips in the sky
    if (g === 0) this.laptops[i % this.laptops.length].flip();
    if (g === 1 && i % 2 === 0) this.phone.flip();
    const movers = this.things.filter((o) => o !== this.kb);
    if (this.lift > 0.5) { for (let j = 0; j < (g === 3 ? movers.length : 3); j++) { const o = movers[(this.hits * 5 + j * 7) % movers.length]; o.body.kick(g === 3 ? 7 : 3.5, 0.25, null); if (g === 3 && i === 1 && j % 3 === 0) o.body.glitch = 0.2; } }
    else if (sec !== 'break') { const o = movers[(this.hits * 3) % movers.length]; o.hopV += 0.9 * power; }
    for (let j = 0; j < (g === 3 ? 6 : 2); j++) this.deckCables[(this.hits + j * 3) % this.deckCables.length]?.fire(this.t, PULSE[(this.hits + j) % 4].clone().multiplyScalar(power), 1);
    for (let j = 0; j < (sec === 'drop' ? 3 : 1); j++) this.cables[(this.hits * 7 + j * 11) % this.cables.length].fire(this.t, PULSE[(this.hits * 3 + j) % 4].clone().multiplyScalar(0.7 * power), (this.hits + j) % 2 ? 1 : -1);
    if (this.overlay && !this.inLine && !(this.spamS > 0.02) && g === 3 && sec === 'drop') this.overlay.hit(cycle, g, i, n, power, sec === 'drop' ? VOCAB : VOCAB_SOFT);
  }

  animate(o, dt, fx) {
    o.hopV -= 9.8 * dt; o.hop += o.hopV * dt; if (o.hop < 0) { o.hop = 0; o.hopV = o.hopV < -0.3 ? -o.hopV * 0.25 : 0; }
    const l = clamp01((this.lift - o.fly.delay) / (1 - o.fly.delay)), e = smooth(l), f = o.fly, B = o.body;
    if (l > 0.02 && !B.air) B.launch(o.home.p, o.homeQ, o.home.p.clone().sub(new THREE.Vector3(CX, FLOOR, 0)).setY(0).normalize(), 0.8 + 0.4 * (this.alive || 0));
    if (l <= 0.001 && B.air) B.land();
    if (B.air) {
      f.a += f.speed * dt;
      const ln = o.lane, span = 7, zz = ((ln.z0 + this.streamD) % span + span) % span - 4.2;
      if (ln.last !== undefined && zz < ln.last - 3) B.p.z -= span;           // wrapped round to the front: jump with it
      ln.last = zz;
      const orbit = new THREE.Vector3(CX + Math.cos(f.a) * f.r * 1.15, f.h, Math.sin(f.a) * f.r), stream = new THREE.Vector3(CX + ln.x, ln.h, zz);
      const anchor = orbit.lerp(stream, clamp01(this.lift * 2 - 0.6));
      if (this.eye) {                                         // the anchor keeps out of the line between the lens and the deck
        const E = this.eye, D = new THREE.Vector3(CX, FLOOR + 0.06, 0).sub(E);
        const t = Math.max(0, Math.min(1.15, anchor.clone().sub(E).dot(D) / D.lengthSq()));
        const lat = anchor.clone().sub(E.clone().addScaledVector(D, t)), ld = lat.length(), need = 0.35 + 0.5 * Math.min(1, t * 1.4) + o.size * 0.6;
        if (ld < need) { if (ld < 1e-4) lat.set(1, 0, 0); anchor.addScaledVector(lat.normalize(), need - ld); }
      }
      B.step(dt, this.t, anchor, this.eye, 0.35 + 0.9 * fx.energy);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(); B.pose(p, q);
      o.g.position.lerpVectors(o.home.p, p, e); o.g.quaternion.slerpQuaternions(o.homeQ, q, e);
    } else {
      o.g.position.copy(o.home.p); o.g.position.y += o.hop * 0.25;
      o.g.quaternion.copy(o.homeQ); o.g.rotateX(-o.hop * 0.6);
    }
    if (o.shadowMesh) o.shadowMesh.material.opacity = 0.8 * (1 - e) / (1 + o.hop * 20);
  }

  lights(dt, fx, at) {
    const v = new THREE.Vector3(), nrm = new THREE.Vector3(), P = this.deckLights.pos, C = this.deckLights.col, flick = 1;
    this.lit.forEach(({ o, s }, i) => {
      s.mesh.getWorldPosition(v); s.mesh.getWorldDirection(nrm);
      const facing = clamp01(1 + nrm.z * 1.6);                  // a screen face down (a shut laptop) lights nothing
      v.addScaledVector(nrm, 0.07);                              // the light sits in front of the glass, not in it
      const g = this.screens.glow(s), k = (0.3 + 0.55 * fx.level * fx.alive + 0.9 * fx.kick * fx.alive + 0.6 * s.flash) * flick * facing;
      const half = Math.sqrt(s.w * s.h) * 0.5;
      P[i * 4] = v.x; P[i * 4 + 1] = v.y; P[i * 4 + 2] = v.z; P[i * 4 + 3] = half;
      C[i * 3] = g[0] * k; C[i * 3 + 1] = g[1] * k; C[i * 3 + 2] = g[2] * k;
      const pl = this.points[i]; if (pl) { pl.position.copy(v); pl.color.setRGB(g[0], g[1], g[2]); pl.intensity = k * half * half * 60 * 1.6; }
    });
    // the room: dark cave with a coloured wash on the beat, or bright sky
    const sky = this.sky, wash = new THREE.Color().setHSL(fx.palette % 2 ? 0.9 : 0.6, 0.9, 0.5).multiplyScalar(0.05 * fx.alive * (1 + 2 * this.strobe));
    const A = this.deckLights.amb, amb = new THREE.Color(0.25, 0.35, 0.55).multiplyScalar(sky * 0.9).add(wash).addScalar(this.flash * 0.6 + this.strobe * 0.12 * fx.alive * (this.reduce ? 0.2 : 1));
    A[0] = amb.r; A[1] = amb.g; A[2] = amb.b;
    this.hemi.intensity = 0.06 + sky * 2.2 + this.flash * 2; this.hemi.color.setRGB(0.55 + 0.45 * (1 - sky), 0.7, 1.0); this.hemi.groundColor.setRGB(0.2 + 0.2 * sky, 0.35 * sky + 0.1, 0.1);
    this.sun.intensity = sky * 2.4; this.key.intensity = 4 * (1 - 0.5 * sky); this.deckLights.key = 0.42 + 0.5 * sky;
    this.strobeLight.intensity = this.strobe * 4 * fx.alive * (this.reduce ? 0.2 : 1) * (1 - sky * 0.5);
    this.scene.environmentIntensity = 0.12 + sky * 0.9;
    const u = this.skyMat.uniforms; u.uSky.value = sky; u.uTime.value = this.t; u.uFlash.value = this.flash * 0.5 + 0.12 * (this.beatEnv || 0) * sky * (this.reduce ? 0.3 : 1); u.uHue.value.copy(wash);
  }

  // after the deck has drawn: the room, into the same colour and depth, then the treatment over all of it
  render(deckCam, post) {
    const r = this.r, c = this.cam;
    r.resetState();
    c.projectionMatrix.fromArray(deckCam.proj); c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    c.matrixWorldInverse.fromArray(deckCam.m); c.matrixWorld.copy(c.matrixWorldInverse).invert();
    const w = r.domElement.width, h = r.domElement.height;
    r.setViewport(0, 0, w / r.getPixelRatio(), h / r.getPixelRatio());
    this.root.updateMatrixWorld();
    this.eye = this.root.worldToLocal(new THREE.Vector3().setFromMatrixPosition(c.matrixWorld));
    this.placeBigFace(c, this._dt || 0.016);
    r.render(this.scene, c);
    // how far the picture moved since the last frame, at the deck (for the motion blur)
    const vp = c.projectionMatrix.clone().multiply(c.matrixWorldInverse), at = new THREE.Vector3(CX, 0, -0.03);
    const now = at.clone().applyMatrix4(vp);
    if (this.prevVP) { const was = at.clone().applyMatrix4(this.prevVP); post.vel = [Math.max(-0.2, Math.min(0.2, (now.x - was.x) * 0.5)), Math.max(-0.2, Math.min(0.2, (now.y - was.y) * 0.5))]; }
    this.prevVP = vp;
    this.post.resize(w, h);
    this.post.run({ time: this.t, post });
    // a small copy of the finished frame: the "webcam" in the System message windows (only while they are popping)
    if (((this.spamS || 0) > 0.01 || (this.frameN = (this.frameN || 0) + 1) % 30 === 0) && (this.thumbN = (this.thumbN || 0) + 1) % 2 === 0) {
      const tc = this.thumb ||= Object.assign(document.createElement('canvas'), { width: 240, height: 150 });
      const cv = r.domElement, s = Math.max(240 / cv.width, 150 / cv.height);
      tc.getContext('2d').drawImage(cv, (240 - cv.width * s) / 2, (150 - cv.height * s) / 2, cv.width * s, cv.height * s);
      this.screens.painter.thumb = tc;
    }
    r.resetState();
  }
}
