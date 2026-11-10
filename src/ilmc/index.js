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
import { Screens, MODE, TILE, WALL, FACE_GLSL } from './screens.js';
import { Post } from './post.js';
import { Sky } from './sky.js';
import { Plates } from './plates.js';
import { Dressing } from './set.js';
import { Shell } from './shell.js';
import { Atmos } from './fx.js';
import { Coaster } from './coaster.js';
import { Director } from './director.js';
import { Overlay } from './overlay.js';
import { Listener, Song, JIG } from './audio.js';
import { Body, SHOTS } from './motion.js';
import { wire } from './cables.js';
import { drawFace } from './label.js';
import { PIVOT_X, PIVOT_Y } from '../geometry.js';

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
// what each screen shows, by what it is and where the song is: a few pieces each, changing every eight bars, staggered
// across the room. intro: the room asleep, screensavers; build: the machines working flat out; drop: cascades and
// explosions; hill: the webcam, the chorus of faces, the media player; white: faces; outro: screensavers again.
// (cave is a record without a song map, on the ground)
const T = (t) => [MODE.TILE, t], FACE = [MODE.FACE], FACES = [MODE.FACES];
const ROLES = {
  franken: { intro: [T(TILE.STARS), FACE, T(TILE.MYSTIFY)], build: [T(TILE.SCOPE), T(TILE.DEFRAG), FACE, T(TILE.VECTOR)], drop: [FACE, T(TILE.SOLITAIRE), T(TILE.HEART), T(TILE.MILK)],
             hill: [FACE, T(TILE.WEBCAM), FACE], white: [FACE, FACES], outro: [T(TILE.STARS), FACE] },
  lcd:     { intro: [T(TILE.MAZE), T(TILE.WAVE), T(TILE.PIPES)], build: [T(TILE.DAW), T(TILE.DOWNLOAD), T(TILE.WATERFALL), T(TILE.DEFRAG)], drop: [T(TILE.MINES), T(TILE.MILK), T(TILE.SOLITAIRE), [MODE.BLISS]],
             hill: [T(TILE.MPLAYER), T(TILE.WEBCAM), T(TILE.CHAT)], white: [T(TILE.MPLAYER), FACES], outro: [T(TILE.PIPES), T(TILE.MAZE)] },
  crt:     { intro: [T(TILE.PIPES), T(TILE.BIOS), T(TILE.STARS), T(TILE.MYSTIFY), T(TILE.MAZE)], build: [T(TILE.SCANDISK), T(TILE.ANALYZER), T(TILE.COPY98), T(TILE.METERS), T(TILE.BURN), T(TILE.UEFI)],
             drop: [T(TILE.SOLITAIRE), T(TILE.MINES), [MODE.TUNNEL], T(TILE.MILK), T(TILE.ANALYZER), T(TILE.HEART)], hill: [FACE, T(TILE.MYSTIFY), T(TILE.MPLAYER), FACE, T(TILE.CHAT)],
             white: [FACES, T(TILE.SOLITAIRE), T(TILE.HEART)], outro: [T(TILE.STARS), T(TILE.PIPES), T(TILE.MYSTIFY)] },
  tv:      { intro: [T(TILE.STARS), T(TILE.MYSTIFY), T(TILE.NAME)], build: [T(TILE.SCOPE), T(TILE.WATERFALL), T(TILE.BURN)], drop: [FACES, T(TILE.MILK), T(TILE.TRIPLE), T(TILE.SOLITAIRE)],
             hill: [T(TILE.WEBCAM), FACE, [MODE.BLISS]], white: [FACES, FACE], outro: [T(TILE.STARS), T(TILE.MYSTIFY)] },
  laptop:  { intro: [T(TILE.MYSTIFY), T(TILE.CHAT), T(TILE.PIPES), T(TILE.DESKTOP)], build: [T(TILE.DOWNLOAD), T(TILE.COPY98), T(TILE.DAW), T(TILE.DEFRAG), T(TILE.METERS)],
             drop: [T(TILE.MINES), FACES, T(TILE.SOLITAIRE), T(TILE.MILK)], hill: [T(TILE.CHAT), T(TILE.MPLAYER), FACE, T(TILE.WEBCAM)], white: [FACES, T(TILE.MPLAYER)], outro: [T(TILE.MAZE), T(TILE.STARS)] },
  imac:    { intro: [T(TILE.MAZE), T(TILE.STARS)], build: [T(TILE.BOUNCE)], drop: [T(TILE.SOLITAIRE), T(TILE.MINES), T(TILE.MILK), FACES], hill: [FACE, T(TILE.MPLAYER)], white: [FACES], outro: [T(TILE.PIPES)] },
  phone:   { intro: [T(TILE.HEART)], build: [T(TILE.HEART)], drop: [T(TILE.HEART), FACES], hill: [T(TILE.HEART)], white: [FACES], outro: [T(TILE.HEART)] },
};
for (const r in ROLES) ROLES[r].cave = ROLES[r].build;
// The places the song goes. lift: everything leaves the ground; env: what is out there (sky.js); cam: where the camera
// stands, as offsets from wherever the viewer has put it (rise lifts what it looks at, so the horizon comes into frame).
const WORLDS = {
  room:   { lift: 0, env: null,    cam: { az: 0, el: 0, zoom: 0, rise: 0 } },
  flight: { lift: 1, env: 'y2k',   cam: { az: 0, el: -0.66, zoom: 0.12, rise: 0 } },
  bliss:  { lift: 0, env: 'bliss', cam: { az: 0.1, el: -0.74, zoom: 0.16, rise: 0.4 } },
  void:   { lift: 1, env: 'void',  cam: { az: 0, el: -0.6, zoom: 0.05, rise: 0.12 } },
  // the song stops dead and the computer takes the picture (desk.js): the flight hangs in the air behind it
  crash:  { lift: 1, env: 'y2k',   cam: { az: 0, el: -0.66, zoom: 0.12, rise: 0 }, take: 'crash', time: 0 },
  window: { lift: 1, env: 'y2k',   cam: { az: 0, el: -0.66, zoom: 0.12, rise: 0 }, take: 'window', time: 0.3 },
  tile:   { lift: 1, env: 'y2k',   cam: { az: 0, el: -0.66, zoom: 0.12, rise: 0 }, time: 0.25 },
  off:    { lift: 0, env: null,    cam: { az: 0, el: 0, zoom: 0, rise: 0 }, take: 'off' },
};
const ACT_ROOM = { t: 0, w: 'room' }, ACT_FLY = { t: 0, w: 'flight' };
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
// ?shot=onboard|chase|side|front|wide: look through one of the ride's cameras (coaster.js) while it runs (testing)
const SHOT = /[?&]shot=(\w+)/.exec(location.search)?.[1];
// a pose in the room's coordinates ({ eye, at, up, fov }) as the deck's orbit camera takes it (render.js camera(): z up)
function viewOf(s) {
  const w = (v) => [v.x, -v.z, v.y], e = w(s.eye), a = w(s.at), u = w(s.up), d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]], dist = Math.hypot(...d);
  const f = d.map((x) => -x / dist), rl = Math.hypot(f[1], f[0]) || 1, r = [f[1] / rl, -f[0] / rl, 0], up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { at: a, dist, az: Math.atan2(d[0], -d[1]), el: Math.asin(d[2] / dist), roll: Math.atan2(u[0] * r[0] + u[1] * r[1] + u[2] * r[2], u[0] * up[0] + u[1] * up[1] + u[2] * up[2]) || 1e-6, zoom: 0, fov: s.fov * Math.PI / 180 };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class ILMC {
  constructor(gl, canvas, opts = {}) {
    performance.mark('room:start');
    const r = this.r = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
    r.autoClear = false; r.outputColorSpace = THREE.SRGBColorSpace;      // the tone curve is the camera's (post.js): the room is drawn in linear light
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.quality = 2; this.scale = 1;                                      // see pace(): a machine that cannot keep up gets a cheaper picture
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.15;
    this.cam = new THREE.PerspectiveCamera(); this.cam.matrixAutoUpdate = false; this.cam.matrixWorldAutoUpdate = false;
    this.root = new THREE.Group(); this.root.rotation.x = Math.PI / 2; this.scene.add(this.root);   // local: +y up (world +z), +z toward the viewer (world -y)
    this.listener = new Listener(); this.screens = new Screens(); this.post = new Post(r);
    this.overlay = opts.overlay ? new Overlay(opts.overlay) : null;
    this.reduce = !!opts.reduceFlashing;
    this.t = 0; this.lift = 0; this.liftT = 0; this.sky = 0; this.skyScene = 0; this.env = { y2k: 0, bliss: 0, void: 0 }; this.day = 0; this.timeK = 1; this.tiles = 1; this.crt = 0; this.act = ACT_ROOM; this.camW = { az: 0, el: 0, zoom: 0, rise: 0 }; this.hits = 0; this.lastSix = null; this.flash = 0; this.inv = 0; this.zoomBlur = 0; this.tri = 0; this.split = 0;
    this.camKick = 0; this.azOff = 0; this.glitch = 0; this.camShot = { az: 0, el: 0, zoom: 0 }; this.strobe = 0; this.washHue = 0;
    this.buildLights(); this.buildRoom(); this.world = new Sky(this.scene, this.root, FLOOR); this.plates = new Plates(this.scene); this.buildBigFace();
    performance.mark('room:built');
    this.whenWarm = new Promise((res) => { this.warmDone = res; });        // resolves once the room has been drawn (begin())
    this.psx = { value: 0 };
    // the floor's dressing arrives after the room is up (set.js); each thing joins the wobble and the shadows as it lands
    this.dress = new Dressing({ root: this.root, things: this.things, floor: this.floor, cam: this.viewCam, eye: this.viewEye, CX, FLOOR, renderer: r, looseTo: this.clutter,
      lite: matchMedia('(pointer: coarse)').matches, onAdd: (o) => o.traverse((m) => { if (m.isMesh) for (const mt of [].concat(m.material)) if (mt && !mt.isShaderMaterial && !mt.isMeshBasicMaterial) psxify(mt, this.psx); }) });
    // ---- stage and bus ----
    // The other modules of the room (shell.js, fx.js, coaster.js) are built here with one context, and then live on two things:
    //   stage  what is happening this frame: { t (room clock, s), dt, song (seconds into the song, or null), playing, beat (float),
    //          bar, sec ('break' | 'build' | 'drop'), act (the world: 'room' | 'flight' | 'crash' | 'window' | 'bliss' | 'tile' | 'void' | 'off'),
    //          actT (seconds into the act), env { y2k, bliss, void } (0..1 each), lift (0 on the ground .. 1 in the air), day (the hill's
    //          time: 0 noon, 1 sunset, 1.6 night), pop (the lens flash, 0..1), flash (white-out, 0..1), build (0..1 through a build-up),
    //          alive (0..1 music is playing and audible), eye (THREE.Vector3, the lens in the room's coordinates), sun (toward the sun),
    //          quality (0..2), reduce (true = flashing off: be calm) }
    //          and fx, the live audio: { kick, level, low, mid, high, hat (0..1), spec (128 bands), wavL, wavR (512 samples), energy, beat }
    //   bus    on(type, e, stage): 'hit' { g (0..3: which bar of the 4-5-6-2 jig), i, n, power, big (the two-hit bar) }
    //          'beat' { b (0..3), bar }   'word' { w, cut (a cut-off "f-"), line, text }   'chop' { w } (one of her vocal chops in a build)
    //          'cut' { from, to } (the world changed)   'drop' { k } (a build-up just ended: the downbeat)
    const ctx = { scene: this.scene, root: this.root, renderer: r, CX, FLOOR, things: this.things, kit: this.dress.kit, dress: this.dress, listener: this.listener, screens: this.screens, sky: this.world, post: this.post,
      psx: (o) => o.traverse((m) => { if (m.isMesh) for (const mt of [].concat(m.material)) if (mt && !mt.isShaderMaterial && !mt.isMeshBasicMaterial) psxify(mt, this.psx); }) };
    this.director = new Director(this, CX, FLOOR);
    this.mods = [];
    for (const [name, M_] of [['shell', Shell], ['atmos', Atmos], ['coaster', Coaster]]) { try { this.mods.push(this[name] = new M_(ctx)); } catch (e) { console.error(name, e); } }
    this.stage = { t: 0, dt: 0, song: null, playing: false, beat: 0, bar: 0, sec: 'break', act: 'room', actT: 0, env: this.env, lift: 0, day: 0, pop: 0, flash: 0, build: 0, alive: 0, eye: new THREE.Vector3(0, 2, 3), sun: new THREE.Vector3(0, 1, 0), quality: 2, reduce: false };
    { const q = /[?&]q=([012])/.exec(location.search);                       // ?q=0..2 pins the quality (testing); phones start a step down
      if (q) { this.fixedQuality = true; this.setQuality(+q[1]); } else if (matchMedia('(pointer: coarse)').matches) { this.setQuality(1); this.scale = 0.85; } }
    this.psx ||= { value: 0 };
    this.root.traverse((m) => { if (m.material && !m.material.isShaderMaterial && !m.material.isMeshBasicMaterial) psxify(m.material, this.psx); });
    // everything solid casts and takes shadows; screens, glows and the old painted-on shadows do not
    this.root.traverse((m) => {
      if (!m.isMesh || m.userData.ghost) return;
      const mt = m.material; if (!mt || mt.isShaderMaterial || mt.isMeshBasicMaterial || mt.transparent) return;
      m.castShadow = m !== this.floor && !m.userData.keep; m.receiveShadow = true;
    });
  }

  // ---------------- the room ----------------
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x8899aa, 0x221a12, 0.06); s.add(this.hemi);
    // the room's lamp: a warm spot from the same direction as the deck's softbox, so its pool and its shadows agree with the deck's
    this.key = new THREE.SpotLight(0xffe9cf, 9, 0, 0.62, 1, 1.2); this.key.position.set(CX - 0.38 * 2.1, 0.30 * 2.1, 0.87 * 2.1);
    this.key.target.position.set(CX, 0, FLOOR); s.add(this.key, this.key.target);
    // the camera's flash: rides just off the lens, so every jig hit is a flash photograph with thin hard shadows behind everything
    this.flashLight = new THREE.SpotLight(0xfff6ea, 0, 0, 0.42, 0.75, 2); this.flashLight.target.position.set(CX, 0, 0); s.add(this.flashLight, this.flashLight.target);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 0); this.sun.position.set(-1, -0.8, 1.6); this.sun.target.position.set(CX, 0, 0); s.add(this.sun, this.sun.target);
    { const c = this.sun.shadow.camera; c.left = c.bottom = -3.6; c.right = c.top = 3.6; }      // its shadows are for the hill (lights())
    for (const [l, near, far] of [[this.key, 0.5, 6], [this.flashLight, 0.06, 9], [this.sun, 2, 30]]) {
      l.castShadow = true; l.shadow.mapSize.set(2048, 2048); l.shadow.camera.near = near; l.shadow.camera.far = far; l.shadow.bias = -0.0006; l.shadow.normalBias = 0.006;
      l.shadow.autoUpdate = false; l.shadow.needsUpdate = true;                // refreshed in turn (lights()): one shadow pass a frame at most
    }
    this.pop = 0; this.flashOut = { pos: [0, 0, 1], col: [0, 0, 0] };
    this.points = Array.from({ length: 4 }, () => { const p = new THREE.PointLight(0xffffff, 0, 2.2, 2); s.add(p); return p; });
    this.strobeLight = new THREE.PointLight(0xffffff, 0, 0, 2); this.strobeLight.position.set(CX, 0, 1.2); s.add(this.strobeLight);
    this.deckLights = { pos: new Float32Array(32), col: new Float32Array(24), amb: new Float32Array(3), key: 0.5 };
  }
  // the computer's face, enormous, hanging in the sky during the drops
  buildBigFace() {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uA: { value: 0 }, uTime: { value: 0 }, uFE: { value: this.screens.lead.E }, uFM: { value: this.screens.lead.M }, uFX: { value: this.screens.lead.X }, uFY: { value: this.screens.lead.Y } },   // the lead's own performance
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `precision highp float; uniform float uA, uTime; uniform vec4 uFE, uFM, uFX, uFY; varying vec2 vUv;
        ${FACE_GLSL}
        void main() {
          vec2 p = (vUv - 0.5) * 1.15, pp = faceXf(p, uFX, uFY, uTime);
          vec3 c = faceAt(pp, vec3(0.0), uFE, uFM, uFX, uFY, uTime);
          float d = faceD(pp), a = smoothstep(0.012, -0.012, d);
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
    const f = this.bigFace, u = f.material.uniforms, a = clamp01(this.env.y2k * 1.2 - 0.2) * (this.alive > 0.2 ? 1 : 0.4);
    f.visible = a > 0.01; if (!f.visible) return;
    const eye = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), fwd = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld), up = new THREE.Vector3(0, 1, 0).transformDirection(cam.matrixWorld);
    const dist = 9 - 2.5 * this.bigLunge;                     // always in the upper part of the picture, behind everything
    f.position.copy(eye).addScaledVector(fwd, dist).addScaledVector(up, dist * (0.19 + 0.01 * Math.sin(this.t * 0.8)));
    f.up.copy(up); f.lookAt(eye); const s = dist * 0.3 * (1 + 0.04 * this.fx.kick);
    f.scale.set(s, s, s);
    this.bigBlink = Math.max(0, this.bigBlink - dt * 6); this.bigLunge *= Math.exp(-dt * 4);
    u.uA.value = a; u.uTime.value = this.t;
  }

  buildRoom() {
    const R = (() => { let s = 4242; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
    this.things = [];
    // the floor is the room's own (the deck's renderer leaves its table out), so it can take shadows
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: 0x3b3632, roughness: 0.96 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.set(CX, FLOOR, 0); this.root.add(this.floor);
    // the deck is drawn by its own renderer; these stand in for it in the room's shadow maps
    { const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), g = this.deckGhost = new THREE.Group();
      g.add(M.mesh(new THREE.BoxGeometry(0.455, 0.056, 0.38), ghost, 0.0425, -0.052, 0), M.mesh(new THREE.CylinderGeometry(0.1645, 0.1645, 0.02, 40), ghost, 0, -0.012, 0),
        M.mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.07, 16), ghost, PIVOT_X, 0.012, -PIVOT_Y));
      for (const m of g.children) { m.castShadow = true; m.userData.ghost = true; } this.root.add(g); }
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
    this.deckMods = M.deckMods(drawFace, CX); this.root.add(this.deckMods.g);
    this.discs = new Discs(this.root, this.things.filter((o) => o.slot || o.tray).map((o) => ({ obj: o.slot || o.tray, owner: o, kind: 'cd' })), FLOOR);
    this.deckMods.screens = this.deckMods.screens.map((d) => this.screens.make(d, 99));
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
    for (const c of this.cables) c.g.traverse((m) => { m.userData.noOcc = true; });       // a cable across the view does not hide a machine (director.js)
    // big screens light the room (and the deck): the eight most important ones
    this.lit = this.things.flatMap((o) => o.screens.map((s) => ({ o, s }))).sort((a, b) => b.s.w * b.s.h - a.s.w * a.s.h).slice(0, 8);
    this.fixedScreens = [...this.things.flatMap((o) => o.screens), ...this.deckMods.screens].filter((sc) => sc.fixed !== undefined);
    for (const sc of this.fixedScreens) this.screens.set(sc, MODE.TILE, sc.fixed);
    this.allScreens = this.things.flatMap((o) => o.screens).filter((sc) => sc.fixed === undefined);
    // starting picture: the hero shows the face, the rest a quiet desktop
    const start = [[MODE.FACE], [MODE.TILE, TILE.BIOS], [MODE.TILE, TILE.DESKTOP], [MODE.TILE, TILE.AMP], [MODE.TILE, TILE.UEFI], [MODE.FACE], [MODE.TILE, TILE.SCOPE], [MODE.TILE, TILE.WAVE], [MODE.TILE, TILE.DAW], [MODE.FACE], [MODE.TILE, TILE.CHAT], [MODE.TILE, TILE.COPY]];
    this.allScreens.forEach((s, i) => this.screens.set(s, ...start[i % start.length]));
    for (const o of this.things) for (const sc of o.screens) { sc.owner = o; sc.role = o === this.hero ? 'hero' : o.kind; }
    this.allScreens.forEach((sc, i) => { sc.order = (i * 7) % this.allScreens.length; });
    { const h = this.hero.screens[0], first = this.allScreens.find((sc) => sc.order === 0); if (h && first && h !== first) { first.order = h.order; h.order = 0; } }   // the lead wakes first
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
    cam.updateMatrixWorld(); this.root.updateMatrixWorld(); this.viewCam = cam;
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
    this.viewEye = eye;
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
    dt = Math.min(0.1, Math.max(0, dt));
    // a photograph: on the two big hits of the jig the room is held for an instant at the top of the flash, date-stamped
    // like a cheap camera's, while the song carries on. Nothing moves, because the room's clock does not.
    if (this.freeze > 0) { this.freeze -= dt; dt = 0; }
    this.photo = Math.max(0, (this.photo || 0) - (this._dt0 = Math.min(0.1, Math.max(0, arguments[0]))) * 2.2);
    this.t += dt; this._dt = dt; this.armAl = pos?.al;
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
    // which world the song is in
    const act = this.actAt(at, playing), W = WORLDS[act.w] || WORLDS.room, k10 = 1 - Math.exp(-dt * 10);
    if (act !== this.act) { const was = this.act; this.act = act; if (playing || was !== ACT_ROOM) this.cut(was, act, playing); }
    { const cu = at && (this.song.m.cues || []).find((q) => q.t1 - q.t0 > 20 && at.t >= q.t0 && at.t < q.t1); this.tense = cu && playing ? clamp01((at.t - cu.t0) / (cu.peak - cu.t0)) : 0; }   // 0..1 through a long build-up
    this.liftT = this.coaster?.riding ? 1 : W.lift;                                  // the ride: everything leaves the floor for the train
    this.timeK += ((W.time ?? 1) - this.timeK) * (1 - Math.exp(-dt * 6)); const mdt = dt * this.timeK;      // how fast things in the air move (the takeovers hang them)
    this.take = W.take ? { kind: W.take, p: at ? clamp01((at.t - act.t) / Math.max(0.1, (this.nextAct(act)?.t ?? act.t + 4) - act.t)) : 0 } : null;
    if (act.w !== 'tile') this.tiles = 1;
    { const nx = this.nextAct(act), left = nx && at ? nx.t - at.t : 9, up = playing && nx && !W.lift && (WORLDS[nx.w] || {}).lift && nx.w === 'flight';
      this.suck = up && left < 0.75 ? smooth(1 - left / 0.75) : 0;                                         // the breath before a drop: everything leans in toward the record
      if (act.w === 'tile' && left < 0.9 && !this.reduce) this.flash = Math.max(this.flash, 0.85 * smooth(1 - left / 0.9));   // the tiles burn out into the white
    }
    { const nx = this.nextAct(act), left = nx && at ? nx.t - at.t : 9;                                    // a cut marked 'crt': the picture folds up in the last third of a second, and opens again after
      this.crt = playing && nx?.cut === 'crt' && left < 0.32 ? 1 - left / 0.32 : Math.max(0, this.crt - dt * 5); }
    this.lift += (this.liftT - this.lift) * (1 - Math.exp(-dt * (this.liftT > this.lift ? 2.4 : 1.6)));
    this.sky += ((W.env ? 1 : 0) - this.sky) * k10;
    for (const e in this.env) this.env[e] += ((W.env === e ? 1 : 0) - this.env[e]) * k10;
    // the hill has a time of day, written into the act as [song time, day] points
    if (act.day && at) { const d = act.day; let v = d[0][1]; for (let i = 0; i + 1 < d.length; i++) if (at.t >= d[i][0]) v = d[i][1] + (d[i + 1][1] - d[i][1]) * clamp01((at.t - d[i][0]) / (d[i + 1][0] - d[i][0])); this.day = v; }
    else if (this.env.bliss < 0.01) this.day = 0;
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
    for (const o of this.things) { this.animate(o, mdt, fx); o.tick(dt, fx); }
    this.deckMods.tick(dt, fx);
    this.discs.step(mdt, this.lift > 0.5); this.dress.update(this.lift);
    this.camera(dt, at, playing);
    this.fly(mdt, fx);
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
      k.visible = !this.coaster?.riding || cl < 0.5;                 // on the ride they are left behind with the floor
      k.position.set(u.home.x, u.home.y + cl * (u.up + 0.03 * Math.sin(this.t * 1.3 + u.ph) + 0.09 * (this.beatHard || 0)), u.home.z);
      k.rotation.set(cl * Math.sin(this.t * 0.7 + u.ph) * 1.2, u.ry + cl * this.t * u.spin * 0.3, cl * Math.cos(this.t * 0.5 + u.ph));
    }
    this.formSpin = (this.formSpin || 0) + ((this.formSpinT || 0) - (this.formSpin || 0)) * (1 - Math.exp(-dt * 12));
    this.glitch *= Math.exp(-dt * 5); this.flash *= Math.exp(-dt * 9); this.inv = Math.max(0, this.inv - dt); this.zoomBlur *= Math.exp(-dt * 3.5); this.tri = Math.max(0, this.tri - dt);
    this.split += (L.kick * 0.6 * alive + this.flash + 0.5 * (this.beatEnv || 0) * this.lift - this.split) * (1 - Math.exp(-dt * 20));
    this.camKick *= Math.exp(-dt * 7); this.strobe *= Math.exp(-dt * 14);
    this.azOff += dt * 0.06 * this.lift; this.azOff *= 1 - (1 - this.lift) * dt * 0.8;
    this.washHue = (this.washHue + dt * 0.05) % 1;
    this.lights(dt, fx, at);
    { const st = this.stage; st.t = this.t; st.dt = dt; st.song = at ? at.t : null; st.playing = playing; st.beat = fx.beat; st.bar = at ? at.bar : 0; st.sec = at ? at.sec : 'break';
      st.act = this.act.w; st.actT = at ? at.t - this.act.t : 0; st.lift = this.lift; st.day = this.day; st.pop = Math.min(1, this.pop); st.flash = this.flash; st.build = this.spamS || 0; st.alive = alive;
      if (this.eye) st.eye.copy(this.eye); st.sun.copy(this.world.sunDir); st.quality = this.quality; st.reduce = this.reduce; st.ride = this.act.ride ?? this.nextAct(this.act)?.ride;
      for (const m of this.mods) { try { m.update(dt, fx, st); } catch (e) { if (!m.broke) { m.broke = true; console.error('module', e); } } } }
    { const co = this.coaster, p = new THREE.Vector3(), q = new THREE.Quaternion();          // the ride: the machines take their seats in the train, the sky turns with the track
      if (co?.riding) for (const o of this.things) { const i = co.carOf(o); if (!i) continue; const w = co.car(i, p, q); o.g.position.lerp(p, w).y += Math.sin(Math.PI * w) * 0.35; o.g.quaternion.slerp(q, w); }
      const spin = this.act.w === 'bliss' && this.at ? clamp01((this.at.t - 112.7) / 14.1) : 0;                   // the riser: the night sky wheels round, faster and faster
      this.world.turn(co?.riding ? co.sky : spin > 0 && !this.reduce ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 7 * spin * spin * spin) : null); }
    const px = this.reduce ? 0 : this.pixel();
    this.psx.value = px > 0.05 ? Math.round(420 - 330 * px) : 0;
    if (this.overlay) {
      this.overlay.photo = this.photo || 0;
      if (!playing && this._wasPlaying) this.overlay.clear();
      this.overlay.draw(dt, clamp01(alive * 1.4) * (this.reduce ? 0.7 : 1), this.sky, (this.spamS || 0) * (this.reduce ? 0.2 : 1), this.take);
    }
    this._wasPlaying = playing;
    const fl = this.reduce ? 0.25 : 1;
    return {
      lights: this.deckLights, bare: true,
      cam: this.camOut(alive, fl),
      flash: this.flashOut, noFloor: true,
      post: { act: this.env, day: this.day, pop: this.reduce ? 0 : Math.min(1, this.pop), uTile: this.tiles, uCrt: this.crt, win: this.winRect(), uFlash: this.flash * fl * 0.85, uSplit: this.split * fl, uZoom: this.zoomBlur * fl, uTri: this.tri > 0 && !this.reduce ? 1 : 0, uInv: this.inv > 0 && !this.reduce ? 1 : 0,
        uBloom: (0.11 + 0.05 * L.kick * alive) * (1 - 0.45 * this.sky) * (1 - this.env.void), uThresh: 1.3 + 0.5 * this.sky, uHal: 0.05 * (1 - this.sky), uAO: 0.95 - 0.5 * this.sky + 0.35 * this.env.void,
        uFocus: this.focus || 3, uAperture: 0.014 * (1 - 0.6 * this.sky) * (1 - 0.5 * (this.spamS || 0)) * (1 - this.env.void) * (this.shot ? Math.min(1, Math.pow(32 / this.shot.wide, 1.6)) : 1),   // a wide lens holds more in focus
        uGrain: 0.03 + 0.02 * this.sky + 0.08 * (this.spamS || 0), uVig: (0.85 - 0.4 * this.sky) * (1 - this.env.void),
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
    this.spamS = playing && !(WORLDS[this.act.w] || {}).take && this.act.w !== 'tile' ? s : 0;      // no word wall over the computer's own screens
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
    this.overN = (this.overN || 0) + 1; this.emit('chop', { w: word });
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
    const inVoid = this.act.w === 'void';
    this.emit('word', { w: w.w, cut, line: w.line, text: this.song.m.lyrics.lines[w.line]?.text || '' }); this.director.word();
    { const ly = this.song.m.lyrics; this.plates.word(w.w, w.line, ly.lines[w.line]?.text || '', ly.words.filter((x) => x.line === w.line && x.t < w.t).length); }   // the plates are always being printed; they only show in the white
    this.overlay.lyric(w.w, w.line, power, inVoid || !!this.take);
    this.screens.word = cut ? w.w.replace(/-$/, '—').toUpperCase() : w.w.replace(/[,.]/g, '').toUpperCase();
    this.hits++;
    for (const sc of this.lyricScreens) { if (sc.mode !== MODE.TILE || sc.tile !== TILE.WORD) this.screens.set(sc, MODE.TILE, TILE.WORD); sc.flash = 0.5; sc.lyricUntil = this.t + 1.4; }
    this.answer(w.w);
    if (cut) { this.glitch = Math.max(this.glitch, 0.7); this.camKick = 1; for (const o of this.things) if (o.body.air) { o.body.kick(4, 0, null); o.body.glitch = 0.18; } }
    if (/computer/i.test(w.w)) { this.hero.screens[0].blink = 1.4; this.bigLunge = 1; }
  }
  obliterate(k) {
    this.emit('drop', { k });
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
  // how chunky the picture is: a photograph until the stutter, where it falls apart into PS1 pixels
  pixel() {
    return Math.max((this.spamS || 0) * 0.45, this.glitch > 0.6 ? this.glitch * 0.6 : 0);
  }
  // camera: in the drops, cuts between shots on every other bar line, a slow move inside each; handheld shake in the stutter
  camera(dt, at, playing) {
    this.shot ||= SHOTS[0]; this.shotT = (this.shotT || 0) + dt;
    const inDrop = this.lift > 0.5 && playing;

    // each world has its own stand; lifting off and landing are eased, every other change of world is a cut
    const to = (WORLDS[this.act.w] || WORLDS.room).cam, k = this.camSnap ? 1 : 1 - Math.exp(-dt * 2.4); this.camSnap = false;
    for (const key in this.camW) this.camW[key] += (to[key] - this.camW[key]) * k;
    this.camShot = { az: 0, el: 0, zoom: 0 };
  }
  camOut(alive, fl) {
    const sh = (this.spamS || 0) * fl, n = (k) => Math.sin(this.t * (23 + k * 7) + k) * Math.sin(this.t * (31 - k * 5));
    const drop1 = this.song?.m.cues?.[0]?.t1 ?? 42.1, it = this.at && this.at.t < drop1 ? 1 - smooth(clamp01(this.at.t / 22)) : 0;   // out to the wall by 0:22, then hold
    this.introW = (this.introW || 0) + (it - (this.introW || 0)) * 0.08;                // eased, so a seek never jumps the shot
    const iw = this.introW * fl;
    const bp = this.at ? this.at.beat : this.t * 2.27, ride = smooth(this.lift) * this.env.y2k * fl, cw = this.camW;      // two beats up, two beats down
    // the director's shot, if the song has one for this moment (director.js), as the deck's renderer wants it: world coordinates, z up
    let shot = this.shot = this.director.frame(this._dt || 0.016, this.at, this.stage, this.armAl); const w3 = (v) => [v.x, -v.z, v.y];
    if (SHOT && this.coaster?.riding && this.coaster.shots[SHOT]) { const q = this.coaster.shots[SHOT]; shot = this.shot = { eye: q.eye, at: q.at, up: q.up, fov: q.fov * Math.PI / 180, focus: q.eye.distanceTo(q.at), cut: 0 }; }   // ?shot=name: one of the ride's cameras, for testing
    return {
      view: shot ? { eye: w3(shot.eye), at: w3(shot.at), up: w3(shot.up), fov: shot.fov } : null,
      roll: ride * (0.05 * Math.sin(bp * Math.PI / 2) + 0.035 * (this.beatEnv || 0) * (Math.floor(bp) % 2 ? 1 : -1)) + n(3) * 0.03 * sh,
      rise: cw.rise,
      az: this.camShot.az + cw.az + Math.sin(this.t * 0.31) * 0.01 * alive + n(1) * 0.025 * sh - 0.32 * iw,
      el: this.camShot.el - 0.22 * iw + Math.sin(this.t * 0.23) * 0.008 * alive + cw.el + n(2) * 0.02 * sh + ride * 0.07 * Math.sin(bp * Math.PI / 2 - 0.6),
      zoom: this.camShot.zoom + 0.75 * iw + this.camKick * 0.05 * fl + cw.zoom + sh * 0.25 + ride * (0.05 * Math.sin(bp * Math.PI / 2 + 1.0) + 0.07 * (this.beatEnv || 0)),
    };
  }

  // ---- the drops: the deck surfs forward; the world, the computers and streaks of light rush past ----
  fly(dt, fx) {
    const at = this.at, ph = at ? at.beat - Math.floor(at.beat) : 1, be = this.beatEnv = (at ? Math.exp(-ph * 5) : fx.kick) * fx.alive;   // 1 on each beat, falling
    this.beatHard = this.reduce ? 0 : (at ? Math.exp(-ph * 8) : 0) * fx.alive;      // sharper than be: the hit itself
    const L = this.lift * this.env.y2k, speed = (0.55 + 2.4 * be) * L;                    // the flight surges on every beat and settles between
    if (at && L > 0.5 && Math.floor(at.beat) !== this.lastBeat) { this.lastBeat = Math.floor(at.beat); if (at.beatInBar < 1) this.ring(); }
    this.flyD += dt * speed * 7; this.streamD += dt * speed * 1.7;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const op = clamp01(L * 1.4 - 0.3) * (this.reduce ? 0.4 : 0.85);
    this.lines.material.opacity = op * (0.45 + 0.55 * be); this.lines.visible = op > 0.01 && !this.coaster?.riding;
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
    const bar = at ? at.bar : Math.floor(this.t / 1.76), N = this.allScreens.length, A = this.act.w;
    const set = !at || !this.song.m.acts ? (this.sky > 0.5 ? 'drop' : 'cave') : A === 'bliss' ? 'hill' : A === 'tile' || A === 'void' ? 'white' : this.sky > 0.5 ? 'drop' : at.t < 27.5 ? 'intro' : at.t > 181 ? 'outro' : 'build';
    this.screens.reduce = this.reduce;
    // the lead face (viz/face.js) follows the song's story and looks at the lens, the record and the flash
    { const P = this.screens.perf, v = this._lens ||= new THREE.Vector3(); this.root.updateMatrixWorld(); if (this.eye) P.lens.copy(this.root.localToWorld(v.copy(this.eye))); P.record.copy(this.root.localToWorld(v.set(CX, FLOOR + 0.02, 0)));
      this.screens.perform({ songT: at ? at.t : null, playing, alive: this.alive || 0, bar, sky: this.sky, pop: this.pop, scene: this.scene, quality: this.quality }); }
    const lead = this.hero.screens[0], end = at && this.song.m.acts ? this.song.m.acts.find((a) => a.w === 'off')?.t : null;
    for (const sc of this.allScreens) {
      if (sc === lead) {                     // the lead is on from the first second (asleep) to the last (asleep again), whatever the room does
        const off = end != null && playing && at.t >= end - 0.15;
        if (off ? sc.mode !== MODE.OFF : sc.mode !== MODE.FACE) this.screens.set(sc, off ? MODE.OFF : MODE.FACE);
        continue;
      }
      if (this.bsodUntil) continue;
      if (sc.lyricUntil > this.t) continue;
      const out = at && this.song.m.outro && at.t > this.song.m.outro[0];                    // the end: the screens go dark one by one, the way they came on
      if (at && playing && (at.t < 30 || out)) {
        const p = out ? 1 - clamp01((at.t - this.song.m.outro[0]) / (this.song.m.outro[1] - this.song.m.outro[0])) : clamp01((at.t - 1.2) / 26), on = sc.order / N < p * p * 0.85 + p * 0.15;
        if (!on && !(out && sc.owner === this.hero && p > 0.03)) { if (sc.mode !== MODE.OFF) this.screens.set(sc, MODE.OFF); continue; }   // the lead's screen is the last one on
        if (sc.mode === MODE.OFF) { sc.flash = 0.9; sc.tear = 0.6; }
      }
      const ov = sc.override;
      if (ov && this.t >= ov.from && this.t < ov.until) { if (sc.mode !== ov.mode || (ov.mode === MODE.TILE && sc.tile !== ov.tile)) { this.screens.set(sc, ov.mode, ov.tile ?? -1); sc.flash = 0.5; } continue; }
      const list = (ROLES[sc.role] || ROLES.crt)[set]; let want = list[Math.floor((bar + sc.order * 3) / 8 + 64) % list.length];
      // in the stutter the words take the screens over; the bouncing logo keeps going (it is headed for the corner on the drop)
      if (this.spamS > 0.05 && sc.order / N < this.spamS * 1.15 && want[1] !== TILE.BOUNCE) want = (Math.floor(this.t * 6) + sc.order) % 3 ? [MODE.TILE, TILE.WORD] : [MODE.SNOW];
      if (sc.mode !== want[0] || (want[0] === MODE.TILE && sc.tile !== want[1])) this.screens.set(sc, want[0], want[1] ?? -1);
    }
  }
  // the room answers her: on "name" her name ripples across every screen, on "better" they all turn to the face and
  // blink together, "world" is the wallpaper world, "computer" the cover, and every cut-off "f-" a burst of static
  answer(word) {
    const w = word.toLowerCase().replace(/[^a-z-]/g, ''), all = this.allScreens, N = all.length, t = this.t;
    const ripple = (mode, tile, hold, step = 0.045) => all.forEach((sc) => { sc.override = { mode, tile, from: t + sc.order * step, until: t + sc.order * step + hold }; });
    const L = this.screens.lead;               // the lead hears its name, its praise, itself
    if (w === 'name') L.react('love'); else if (w === 'better') L.react('wink'); else if (w === 'computer') L.look('lens', 1.6);
    if (w === 'name') ripple(MODE.TILE, TILE.NAME, 2.2);
    else if (w === 'better') { this.screens.wallFor(WALL.FACE, 2.6, 0.25); this.screens.wall.blink = 1.6; }   // the whole stack is one face, and it blinks
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

  // what the picture shows right now, as its own small canvas (the hung window's dead copies)
  still() {
    const cv = this.r.domElement, h = this.overlay?.hole; if (!h) return null;
    const c = Object.assign(document.createElement('canvas'), { width: 360, height: Math.round(360 * h[3] / h[2]) });
    try { c.getContext('2d').drawImage(cv, h[0], h[1], h[2], h[3], 0, 0, c.width, c.height); } catch { return null; }
    return c;
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
    this.emit('beat', { b, bar }); this.director.beat();
    if (b === 0 && this.lift < 0.3 && sec !== 'break') for (const o of this.things) o.hopAt = this.t + Math.hypot(o.home.p.x - CX, o.home.p.z) * 0.11;   // a bar line: a ripple of hops out from the record
    if (b === 0 && bar % 4 === 3 && !this.take) this.screens.wallFor?.(sec === 'drop' ? WALL.MILK : WALL.VIZ, 0.7, 0.12);
    // a long build gathers: the whole wall of screens becomes one analyser on the bar lines, then on every other beat, then a wash on
    // every beat; a light off the record beats harder and harder; the flash fires on each bar line
    { const T = this.tense || 0;
      if (T > 0 && !this.take && !this.reduce) {
        if (T > 0.6) this.screens.wallFor?.(b % 2 ? WALL.WASH : WALL.VIZ, 0.3, 0.05); else if (b === 0 && (T > 0.3 || bar % 2 === 0)) this.screens.wallFor?.(WALL.VIZ, 0.32, 0.06);
        this.strobe = Math.max(this.strobe, (b === 0 ? 1 : 0.55) * (0.25 + 0.75 * T)); if (b === 0) this.pop = Math.max(this.pop, 0.5 + 0.5 * T);
      } }                               // the two-hit bar: every screen is one picture for a moment
    if (this.act.w === 'flight' && b === 0 && bar % 4 === 0) { const sk = this.act.skies || [0, 1, 2, 3]; this.skyN = (this.skyN || 0) + 1; this.skyScene = sk[this.skyN % sk.length]; this.zoomBlur = Math.max(this.zoomBlur, 0.8); }
    if (sec === 'drop') this.strobe = Math.max(this.strobe, b % 2 ? 0.5 : 1);
    if (this.act.w === 'void') { if (b === 0 && bar % 2 === 0) { this.formN = (this.formN || 0) + 1; this.zoomBlur = Math.max(this.zoomBlur, 0.5); } this.formSpinT = (this.formSpinT || 0) + Math.PI / 8; }
    const face = this.hero.screens[0]; if (b === 2 && Math.random() < 0.6) face.blink = 1.6;
    if (b === 3 && bar % 2) this.bigBlink = 1.6;
  }
  hit(cycle, g, i, n, sec) {
    this.hits++;
    const power = sec === 'drop' ? 1 : sec === 'build' ? 0.6 : 0.3, S = this.screens, all = this.allScreens;
    this.pop = Math.max(this.pop, g === 3 ? 1 : sec === 'break' ? 0.45 : 0.7);        // every hit is a flash photograph
    this.emit('hit', { g, i, n, power, big: g === 3 }); this.director.hit();
    if (g === 3 && (this.act.w === 'room' || (this.act.w === 'bliss' && this.day > 1.45)) && !this.reduce && !(this.spamS > 0.25) && this.at && this.at.t > 6) { this.freeze = 0.14; this.photo = 1; this.pop = 1; }
    if (this.act.w === 'window') this.jumpPending = true;                              // the copy is taken once this frame is drawn (render())
    if (this.act.w === 'tile' && !this.reduce) { this.tiles = Math.min(6, this.tiles + (i % 2 === 0 ? 1 : 0)); this.zoomBlur = Math.max(this.zoomBlur, 0.4); }
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
    if (this.env.void > 0.5) { const toEye = this.eye.clone().sub(new THREE.Vector3(CX, 0, 0)).normalize(); for (let j = 0; j < (g === 3 ? movers.length : 6); j++) movers[(this.hits * 5 + j * 7) % movers.length].body.v.addScaledVector(toEye, g === 3 ? 1.6 : 0.9); }   // in formation a hit is a lunge at the lens
    else if (this.lift > 0.5) { for (let j = 0; j < (g === 3 ? movers.length : 3); j++) { const o = movers[(this.hits * 5 + j * 7) % movers.length]; o.body.kick(g === 3 ? 7 : 3.5, 0.25, null); if (g === 3 && i === 1 && j % 3 === 0) o.body.glitch = 0.2; } }
    else if (sec !== 'break') { const o = movers[(this.hits * 3) % movers.length]; o.hopV += 0.9 * power; }
    for (let j = 0; j < (g === 3 ? 6 : 2); j++) this.deckCables[(this.hits + j * 3) % this.deckCables.length]?.fire(this.t, PULSE[(this.hits + j) % 4].clone().multiplyScalar(power), 1);
    for (let j = 0; j < (sec === 'drop' ? 3 : 1); j++) this.cables[(this.hits * 7 + j * 11) % this.cables.length].fire(this.t, PULSE[(this.hits * 3 + j) % 4].clone().multiplyScalar(0.7 * power), (this.hits + j) % 2 ? 1 : -1);
    if (this.overlay && !this.inLine && !(this.spamS > 0.02) && g === 3 && sec === 'drop') this.overlay.hit(cycle, g, i, n, power, sec === 'drop' ? VOCAB : VOCAB_SOFT);
  }

  animate(o, dt, fx) {
    if (o.hopAt && this.t >= o.hopAt) { o.hopAt = 0; if (o !== this.kb) o.hopV += 0.55 * (1 + 1.6 * (this.tense || 0)); }
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
      const form = this.env.void > 0.5, anchor = form ? this.formation(o) : orbit.lerp(stream, clamp01(this.lift * 2 - 0.6));
      if (this.eye && !form) {                                // the anchor keeps out of the line between the lens and the deck
        const E = this.eye, D = new THREE.Vector3(CX, FLOOR + 0.06, 0).sub(E);
        const t = Math.max(0, Math.min(1.15, anchor.clone().sub(E).dot(D) / D.lengthSq()));
        const lat = anchor.clone().sub(E.clone().addScaledVector(D, t)), ld = lat.length(), need = 0.35 + 0.5 * Math.min(1, t * 1.4) + o.size * 0.6;
        if (ld < need) { if (ld < 1e-4) lat.set(1, 0, 0); anchor.addScaledVector(lat.normalize(), need - ld); }
      }
      if (form) B.step(dt, this.t, anchor, this.eye, 0.12, 4.5, 5); else B.step(dt, this.t, anchor, this.eye, 0.35 + 0.9 * fx.energy);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(); B.pose(p, q);
      { const hard = (this.beatHard || 0) * e * (form ? 0.45 : 1), out = p.clone().sub(new THREE.Vector3(CX, 0.1, 0)); p.addScaledVector(out, 0.13 * hard); o.g.scale.setScalar(1 + 0.11 * hard); }   // the beat: thrown out from the record, swollen, and back
      o.g.position.lerpVectors(o.home.p, p, e); o.g.quaternion.slerpQuaternions(o.homeQ, q, e);
    } else {
      o.g.position.copy(o.home.p); o.g.position.y += o.hop * 0.25;
      if (this.suck > 0) { const k = this.suck * 0.16; o.g.position.x += (CX - o.home.p.x) * k + Math.sin(this.t * 61 + o.fly.bob) * 0.006 * this.suck; o.g.position.z += -o.home.p.z * k; }
      o.g.quaternion.copy(o.homeQ); o.g.rotateX(-o.hop * 0.6);
      { const hard = (this.beatHard || 0) * (this.at && this.at.sec !== 'break' ? 1 : 0.4); const k = 1 + 2 * (this.tense || 0); o.g.scale.set(1 - 0.012 * hard * k, 1 + 0.04 * hard * k, 1 - 0.012 * hard * k); }   // on the ground the pile pumps on the beat
    }
    if (o.shadowMesh) o.shadowMesh.material.opacity = (this.quality > 0 ? 0 : 0.8) * (1 - e) / (1 + o.hop * 20);   // the painted-on shadow, only where there are no real ones
  }

  // In the white the machines stop tumbling and hold formations around the deck, facing the lens, changing shape every
  // two bars: a wall, a wheel, a tunnel, two towers. Each machine keeps its own slot in every one of them.
  formation(o) {
    const E = this.eye, deck = new THREE.Vector3(CX, 0.1, 0), back = deck.clone().sub(E).setY(0).normalize(), right = new THREE.Vector3(-back.z, 0, back.x), up = new THREE.Vector3(0, 1, 0);
    const list = this.formList ||= this.things.filter((x) => x !== this.kb), N = list.length, i = Math.max(0, list.indexOf(o));
    const at = (u, v, d) => deck.clone().addScaledVector(right, u).addScaledVector(up, v).addScaledVector(back, d);
    const k = this.formN || 0, spin = this.formSpin || 0;
    if (o === this.kb) return at(0, -0.32, -0.25);
    if (k % 4 === 0) { const cols = 10, c = i % cols, r = Math.floor(i / cols), x = c - (cols - 1) / 2; return at(x * 0.43, -0.28 + r * 0.42 + (c % 2) * 0.08, 1.7 - 0.07 * x * x); }                // a wall, curved toward the lens at its ends
    if (k % 4 === 1) { const a = i / N * Math.PI * 2 + spin, R = 0.92 + 0.3 * (i % 2); return at(Math.cos(a) * R * 1.5, 0.3 + Math.sin(a) * R * 0.82, 0.8 + 0.5 * (i % 2)); }                   // a wheel, turning
    if (k % 4 === 2) { const a = i * 0.83 + spin * 1.6, R = 0.95; return at(Math.cos(a) * R * 1.35, 0.3 + Math.sin(a) * R * 0.8, 0.2 + i * 0.13); }                                            // a tunnel, receding
    const side = i % 2 ? 1 : -1, n = Math.floor(i / 2); return at(side * (0.8 + 0.42 * (n % 3)), -0.3 + Math.floor(n / 3) * 0.4, 0.5 + 0.25 * (n % 3));                                        // two towers
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
    // the place: a dark room with a coloured wash on the beat, a wallpaper sky, the hill under its sun, or the white
    const sky = this.sky, E = this.env, set = smooth(clamp01((this.day - 0.35) / 0.65)), night = smooth(clamp01((this.day - 1) / 0.6)), dayK = E.bliss * (1 - night);
    const wash = new THREE.Color().setHSL(fx.palette % 2 ? 0.9 : 0.6, 0.9, 0.5).multiplyScalar(0.05 * fx.alive * (1 + 2 * this.strobe) * (1 - E.bliss - E.void));
    const A = this.deckLights.amb, amb = new THREE.Color(0.25, 0.35, 0.55).multiplyScalar(E.y2k * 0.9 + dayK * (0.8 - 0.5 * set)).add(new THREE.Color(1.5, 1.5, 1.5).multiplyScalar(E.void))
      .add(new THREE.Color(0.05, 0.08, 0.17).multiplyScalar(E.bliss * night)).add(wash).addScalar(this.flash * 0.6 + this.strobe * 0.12 * fx.alive * (this.reduce ? 0.2 : 1));
    A[0] = amb.r; A[1] = amb.g; A[2] = amb.b;
    this.hemi.intensity = 0.06 + E.y2k * 2.2 + dayK * (0.95 - 0.6 * set) + E.bliss * night * 0.42 + E.void * 2.6 + this.flash * 2;
    this.hemi.color.setRGB(0.55 + 0.45 * (1 - sky) + 0.5 * E.void + 0.35 * E.bliss * set - 0.6 * E.bliss * night, 0.7 + 0.3 * E.void, 1.0);
    this.hemi.groundColor.setRGB(0.2 + 0.2 * sky + 0.6 * E.void - 0.1 * E.bliss, 0.35 * sky + 0.1 + 0.5 * E.void, 0.1 + 0.9 * E.void);
    // the sun: a plain one in the wallpaper skies; on the hill it is the one in the sky, casting the only shadows, and it sets
    const sun = this.sun, sd = this.world.sunAt(this.day);
    const moonUp = E.bliss > 0.5 && night > 0.5, md = moonUp ? this.world.moonAt(this.day) : null;                  // after dark the same light is the moon: cool, low, long shadows
    if (moonUp) { sun.position.set(CX + md.x * 12, -md.z * 12, md.y * 12); sun.color.setRGB(0.5, 0.66, 1); }
    else if (E.bliss > 0.5) { sun.position.set(CX + sd.x * 12, -sd.z * 12, sd.y * 12); sun.color.setRGB(1, 0.95 - 0.45 * set, 0.86 - 0.7 * set); }
    else { sun.position.set(-1, -0.8, 1.6); sun.color.setRGB(1, 0.955, 0.878); }
    sun.intensity = E.y2k * 2.4 + (moonUp ? E.bliss * (night - 0.5) * 2 * 1.5 : dayK * (5.2 - 2.2 * set) * clamp01(sd.y * 9 + 0.25)) + E.void * 1.1;
    sun.shadow.intensity = E.bliss > 0.5 ? 1 : 0; if (E.bliss > 0.5) sun.shadow.needsUpdate = true;
    this.key.intensity = 9.5 * (1 - sky) + 2.4 * E.y2k; this.deckLights.key = 0.42 * (1 - sky) + 0.92 * E.y2k + dayK * (1.3 - 0.9 * set) + 0.9 * E.void;
    // the flash: a little of it always (the room is never only screen-lit), all of it for a moment on every hit of the jig;
    // on the hill it comes back as the light goes
    this.pop *= Math.exp(-dt * 7.5);
    const dark = (1 - sky) + E.bliss * (0.35 * set + 0.65 * night);
    const near = Math.max(0.02, Math.min(2.5, ((this.focus || 3.2) / 3.2) ** 2));        // a flash is set for its subject: close up it fires weaker
    const fI = (this.reduce ? 0.34 : 0.2 + 0.8 * Math.min(1, this.pop)) * 70 * dark * (0.35 + 0.65 * fx.alive) * near, F = this.flashLight, fo = this.flashOut;
    F.intensity = fI; if (this.flashPos) F.position.copy(this.flashPos);
    F.angle = this.shot ? Math.min(1.15, Math.max(0.42, Math.atan(Math.tan(this.shot.fov / 2) * 1.78) * 1.08)) : 0.42;      // the flash covers whatever lens is on
    fo.pos[0] = F.position.x; fo.pos[1] = F.position.y; fo.pos[2] = F.position.z; fo.col[0] = fI / Math.PI; fo.col[1] = fI * 0.965 / Math.PI; fo.col[2] = fI * 0.92 / Math.PI;
    // the lamp's and the flash's shadows only matter on a floor; they are redrawn in turn, and let go when there is none
    const room = sky < 0.5; this.key.shadow.intensity = room ? 1 : 0; F.shadow.intensity = dark > 0.3 ? 1 : 0;
    if (room) ((this.shN = (this.shN || 0) + 1) % 2 || this.quality < 2 ? this.key : F).shadow.needsUpdate = true; else if (dark > 0.3 && this.quality > 1) F.shadow.needsUpdate = true;
    this.floor.visible = room && !this.coaster?.riding;
    this.strobeLight.intensity = this.strobe * 4 * fx.alive * (this.reduce ? 0.2 : 1) * ((1 - sky) + E.bliss * (0.4 * set + 0.9 * night));   // on the hill it shows as the light goes
    this.scene.environmentIntensity = 0.12 + E.y2k * 0.9 + dayK * (0.45 - 0.25 * set) + E.void * 1.2;
    this.world.update(this.t, E, { day: this.day, scene: this.skyScene, flyD: this.flyD, flash: this.flash * 0.5 + 0.12 * (this.beatEnv || 0) * E.y2k * (this.reduce ? 0.3 : 1), hue: wash });
  }

  winRect() {
    const h = this.overlay?.hole, c = this.overlay?.c; if (!h || !c) return null;
    return [h[0] / c.width, 1 - (h[1] + h[3]) / c.height, (h[0] + h[2]) / c.width, 1 - h[1] / c.height];
  }
  nextAct(act) { const a = this.song?.m.acts; if (!a) return null; const i = a.indexOf(act); return i >= 0 ? a[i + 1] : null; }
  emit(type, e) { for (const m of this.mods) { try { m.on(type, e, this.stage); } catch (err) { if (!m.broke) { m.broke = true; console.error('module', err); } } } }
  // the song's acts say where it is; a song without them flies in its drops
  actAt(at, playing) {
    if (!at || !playing) return ACT_ROOM;
    const acts = this.song.m.acts;
    if (!acts) return at.sec === 'drop' && at.energy > 0.6 ? ACT_FLY : ACT_ROOM;
    let a = acts[0]; for (const x of acts) if (at.t >= x.t) a = x;
    return a;
  }
  // a change of world: lifting off and landing ease; everything else is a hard cut under a flash
  cut(from, to, playing) {
    this.emit('cut', { from: from.w, to: to.w });
    const take = !!(WORLDS[to.w] || {}).take; if (take) this.overlay?.clear();          // the computer's own screens are not written on
    document.documentElement.classList.toggle('takeover', take);                         // and the page's own windows step aside for them (index.html)
    const air = (a) => (WORLDS[a.w] || WORLDS.room).lift, eased = ((from.w === 'room' || from.w === 'bliss') && to.w === 'flight') || (from.w === 'flight' && to.w === 'room');   // lifting off (from the floor or from the hill) and landing
    if (playing) this.bigFlash(air(to) ? 1 : 0.7);
    if (!eased) this.camSnap = true;
  }

  // before the deck draws: the HDR picture both of them draw into, as { fb, w, h } for the deck's renderer
  begin(cw, ch) {
    this.pace();
    const w = Math.max(2, Math.round(cw * this.scale)), h = Math.max(2, Math.round(ch * this.scale));
    this.post.quality = this.quality; this.post.resize(w, h);
    // A cold browser needs seconds to build the room's shaders. Have it done off the main thread (the page stays alive and
    // only the deck is drawn meanwhile), then let the room in.
    if (!this.warming) {
      this.warming = true; this.r.setRenderTarget(this.post.sceneRT); performance.mark('room:compile');
      const done = () => { performance.mark('room:compiled'); this.warm = true; requestAnimationFrame(() => requestAnimationFrame(() => this.warmDone())); };
      try { this.r.compileAsync(this.scene, this.cam).then(done, done); } catch { done(); }
    }
    return { fb: this.post.begin(), w, h };
  }
  // A machine that cannot keep up gets a cheaper picture, one step at a time, and keeps it: first the lens and the flash's
  // shadows go, then resolution, then all shadows and contact shading. Judged on two seconds of frames, never during loading.
  pace() {
    const now = performance.now(), dt = now - (this._pt || now); this._pt = now;
    if (dt <= 0 || dt > 250 || document.hidden || this.t < 5) { this._pn = 0; this._ps = 0; return; }
    this._ps = (this._ps || 0) + dt; this._pn = (this._pn || 0) + 1;
    if (this._ps < 2000) return;
    const avg = this._ps / this._pn; this._ps = 0; this._pn = 0;
    if (avg < 26 || this.fixedQuality) { this._slow = 0; return; }
    if ((this._slow = (this._slow || 0) + 1) < 3) return;                // six slow seconds in a row, not one hitch
    this._slow = 0;
    if (this.quality === 2) this.setQuality(1);
    else if (this.scale > 0.75) this.scale = 0.75;
    else if (this.quality === 1) this.setQuality(0);
    else if (this.scale > 0.55) this.scale = 0.55;
    console.info(`room: ${avg.toFixed(0)} ms a frame, now quality ${this.quality} at ${this.scale}x`);
  }
  setQuality(q) {
    this.quality = q;
    this.flashLight.castShadow = q > 1; this.key.castShadow = q > 0;
    this.key.shadow.mapSize.setScalar(q > 1 ? 2048 : 1024); if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
    this.scene.traverse((m) => { if (m.material) m.material.needsUpdate = true; });
  }
  render(deckCam, post) {
    const r = this.r, c = this.cam;
    r.resetState();
    c.projectionMatrix.fromArray(deckCam.proj); c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    c.matrixWorldInverse.fromArray(deckCam.m); c.matrixWorld.copy(c.matrixWorldInverse).invert();
    const w = r.domElement.width, h = r.domElement.height;
    this.root.updateMatrixWorld();
    const eyeW = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    this.eye = this.root.worldToLocal(eyeW.clone());
    this.world.dome.position.copy(eyeW);                                     // the sky is infinitely far: it stays centred on the lens (a ride takes the lens far from the deck)
    // the flash sits up and to the right of the lens; the lens is focused on the record
    const right = new THREE.Vector3(1, 0, 0).transformDirection(c.matrixWorld), up = new THREE.Vector3(0, 1, 0).transformDirection(c.matrixWorld), d = eyeW.distanceTo(new THREE.Vector3(CX, 0, 0));
    const focus = this.shot ? this.shot.focus : d;                     // a directed shot is focused on its subject
    (this.flashPos ||= new THREE.Vector3()).copy(eyeW).addScaledVector(right, 0.085 * focus).addScaledVector(up, 0.11 * focus);
    this.focus = focus;
    if ((this.shot?.cut || 0) !== this._cutN) { this._cutN = this.shot?.cut || 0; this.prevVP = null; post.cut = true; }      // no motion smear across a cut
    this.placeBigFace(c, this._dt || 0.016); this.plates.place(c, this.env.void > 0.5 ? 1 : 0);
    r.setRenderTarget(this.post.sceneRT);
    if (this.warm) r.render(this.scene, c);
    // how far the picture moved since the last frame, at the deck (for the motion blur)
    const vp = c.projectionMatrix.clone().multiply(c.matrixWorldInverse), at = new THREE.Vector3(CX, 0, -0.03);
    const now = at.clone().applyMatrix4(vp);
    if (this.prevVP) { const was = at.clone().applyMatrix4(this.prevVP); post.vel = [Math.max(-0.2, Math.min(0.2, (now.x - was.x) * 0.5)), Math.max(-0.2, Math.min(0.2, (now.y - was.y) * 0.5))]; }
    this.prevVP = vp;
    { const s = (this._sunW ||= new THREE.Vector3()).copy(this.world.sunDir).applyMatrix3((this._turnT ||= new THREE.Matrix3()).copy(this.world.u.uTurn.value).transpose()).transformDirection(this.root.matrixWorld); post.sun = [s.x, s.y, s.z]; }   // toward the sun as the dome draws it (for the camera's flare and shafts)
    this.post.run({ time: this.t, post, proj: c.projectionMatrix, view: c.matrixWorldInverse, out: [w, h] });
    if (this.jumpPending) { this.jumpPending = false; const st = this.still(); if (st && this.overlay) this.overlay.desk.jump(st); }
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
