// The last pass over the whole frame (deck included): bloom from the bright parts, then the music-video treatment:
// flash frames, chromatic split, a radial zoom smear on the drop, the girl-EDM triptych, grain, vignette.
import * as THREE from 'three';

const QUAD_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DOWN = `precision highp float; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  if (uThresh > 0.0) { float l = max(c.r, max(c.g, c.b)); c *= smoothstep(uThresh, uThresh + 0.35, l); }
  gl_FragColor = vec4(c, 1.0);
}`;
const UP = `precision highp float; uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c += texture2D(tSrc, vUv + uTexel * vec2(float(i), float(j)) * 1.5).rgb * (i == 0 && j == 0 ? 4.0 : (i == 0 || j == 0 ? 2.0 : 1.0));
  gl_FragColor = vec4(c / 16.0, 1.0);
}`;
const COMP = `precision highp float;
uniform sampler2D tFrame, tB0, tB1, tB2, tB3, tPrev; uniform vec2 uVel; uniform float uTrail, uMBlur; uniform vec2 uRes; uniform float uTime, uBloom, uFlash, uSplit, uZoom, uTri, uInv, uGrain, uVig, uShake, uGlitch, uPixel; uniform vec3 uTint;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 frame(vec2 uv) {
  vec2 c = uv - 0.5; float r = length(c);
  vec2 off = c * (uSplit * 0.03 * r + uGlitch * 0.012);
  return vec3(texture2D(tFrame, uv + off).r, texture2D(tFrame, uv).g, texture2D(tFrame, uv - off).b);
}
void main() {
  vec2 uv = vUv;
  if (uTri > 0.5) uv.x = (fract(uv.x * 3.0) - 0.5) / 3.0 + 0.5;     // the middle third, three times
  float tt = floor(uTime * 24.0), gh = 0.0;
  if (uGlitch > 0.01) {                                             // blocks shoved sideways, scanlines torn
    vec2 blk = floor(vUv * vec2(10.0, 28.0)); gh = hash(blk + tt);
    if (gh < uGlitch * 0.28) uv.x += (hash(blk + tt + 3.1) - 0.5) * 0.22 * uGlitch;
    float ln = floor(vUv.y * 150.0); if (hash(vec2(ln, tt)) < uGlitch * 0.14) uv.x += (hash(vec2(tt, ln)) - 0.5) * 0.07;
    if (hash(blk * 1.7 + tt) < uGlitch * 0.08) uv = (floor(uv * vec2(24.0, 14.0)) + 0.5) / vec2(24.0, 14.0);   // mosaic
  }
  if (uPixel > 0.01) { vec2 g = uRes / mix(1.0, 6.0, uPixel); uv = (floor(uv * g) + 0.5) / g; }       // chunky pixels
  vec3 c = frame(uv);
  // digital motion blur: the camera's motion leaves stepped copies, snapped to a block grid, channels drifting apart
  float vl = length(uVel);
  if (vl > 0.004 && uMBlur > 0.0) {
    vec3 acc = c; float wsum = 1.0; vec2 blk = vec2(7.0) / uRes;
    for (int i = 1; i <= 6; i++) {
      float k = float(i) / 6.0; vec2 o = uVel * k * 2.4 * uMBlur;
      o = floor(o / blk + 0.5) * blk;                                           // steps, not a smear
      vec2 q = uv - o; vec3 g = vec3(texture2D(tFrame, q + vec2(blk.x * k, 0.0)).r, texture2D(tFrame, q).g, texture2D(tFrame, q - vec2(blk.x * k, 0.0)).b);
      g = floor(g * 12.0 + 0.5) / 12.0;                                         // and posterised, like a cheap codec
      float w = 1.0 - k * 0.7; acc += g * w; wsum += w;
    }
    c = mix(c, acc / wsum, clamp((vl - 0.004) * 60.0, 0.0, 1.0));     // only fast moves: whips, cuts, the flight
  }
  if (gh > 1.0 - uGlitch * 0.07) c = c.brg;                          // a block with its channels swapped
  if (uZoom > 0.001) {                                               // smear out from the centre
    vec3 acc = c; float wsum = 1.0;
    for (int i = 1; i < 12; i++) { float k = float(i) / 11.0; vec2 p = 0.5 + (uv - 0.5) * (1.0 - uZoom * 0.18 * k); acc += frame(p) * (1.0 - k * 0.5); wsum += 1.0 - k * 0.5; }
    c = acc / wsum;
  }
  vec3 b = texture2D(tB0, uv).rgb * 0.6 + texture2D(tB1, uv).rgb * 0.8 + texture2D(tB2, uv).rgb + texture2D(tB3, uv).rgb * 1.1;
  c += b * uBloom;
  c *= uTint;
  float v = length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)); c *= mix(1.0, smoothstep(1.15, 0.35, v), uVig);
  c += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
  if (uPixel > 0.01) {                                              // PS1: ordered dither down to a few levels per channel
    vec2 q = floor(mod(gl_FragCoord.xy / mix(1.0, 6.0, uPixel), 4.0));
    float b = mod(q.x * 8.0 + q.y * 4.0 + mod(q.x + q.y, 2.0) * 2.0 + floor(mod(q.y, 2.0)), 16.0) / 16.0 - 0.5;
    float lv = mix(64.0, 7.0, uPixel); c = floor(c * lv + b + 0.5) / lv;
  }
  if (uTrail > 0.01) {                                              // afterimage: last frame, in big pixels, fading in steps
    vec2 g = uRes / 5.0; vec3 p = texture2D(tPrev, (floor(vUv * g) + 0.5) / g).rgb;
    p = floor(p * 8.0) / 8.0;
    c = max(c, p * uTrail);
  }
  if (uInv > 0.5) c = vec3(1.0) - c;
  c = mix(c, vec3(1.0), uFlash);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(r) {
    this.r = r;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.down = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0 } });
    this.up = mk(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.comp = mk(COMP, {
      tFrame: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, uRes: { value: new THREE.Vector2() },
      uTime: { value: 0 }, uBloom: { value: 0.9 }, uFlash: { value: 0 }, uSplit: { value: 0 }, uZoom: { value: 0 }, uTri: { value: 0 }, uInv: { value: 0 }, uGrain: { value: 0.035 }, uVig: { value: 0.8 }, uShake: { value: 0 }, uGlitch: { value: 0 }, uPixel: { value: 0 }, tPrev: { value: null }, uVel: { value: new THREE.Vector2() }, uTrail: { value: 0 }, uMBlur: { value: 1 },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
    });
    this.w = 0; this.h = 0;
  }
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.frame?.dispose(); this.mips?.forEach((m) => m.dispose());
    // the finished canvas is blitted (and its antialiasing resolved) into this; the canvas has no alpha, so neither does this
    this.frameRT?.dispose(); this.frameRT = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBFormat, depthBuffer: false });
    this.frame = this.frameRT.texture;
    this.mips = []; let mw = w, mh = h;
    for (let i = 0; i < 5; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); this.mips.push(new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, depthBuffer: false })); }
    this.ups = this.mips.slice(0, 4).map((m) => new THREE.WebGLRenderTarget(m.width, m.height, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.outs?.forEach((o) => o.dispose()); this.outs = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, { depthBuffer: false })); this.flip = 0;
    this.copy ||= new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: 'precision highp float; uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = texture2D(t, vUv); }', uniforms: { t: { value: null } }, depthTest: false, depthWrite: false });
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam); }
  // the canvas already holds the finished scene; read it, then draw it back with everything on top
  run(fx) {
    const r = this.r, w = this.w, h = this.h;
    r.setRenderTarget(this.frameRT);                                // makes three create its framebuffer
    const gl = r.getContext(), fb = r.properties.get(this.frameRT).__webglFramebuffer;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    r.resetState();
    let src = this.frame, sw = w, sh = h;
    this.mips.forEach((m, i) => {
      this.down.uniforms.tSrc.value = src; this.down.uniforms.uTexel.value.set(1 / sw, 1 / sh); this.down.uniforms.uThresh.value = i === 0 ? (fx.post.uThresh ?? 0.62) : 0;
      this.pass(this.down, m); src = m.texture; sw = m.width; sh = m.height;
    });
    for (let i = 3; i >= 0; i--) {                                   // blur back up the chain
      this.up.uniforms.tSrc.value = (i === 3 ? this.mips[4] : this.ups[i + 1]).texture; this.up.uniforms.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      this.pass(this.up, this.ups[i]);
    }
    const u = this.comp.uniforms;
    u.tFrame.value = this.frame; u.tB0.value = this.ups[0].texture; u.tB1.value = this.ups[1].texture; u.tB2.value = this.ups[2].texture; u.tB3.value = this.ups[3].texture;
    u.uRes.value.set(w, h); u.uTime.value = fx.time;
    for (const k of ['uBloom', 'uFlash', 'uSplit', 'uZoom', 'uTri', 'uInv', 'uGrain', 'uVig', 'uGlitch', 'uPixel', 'uTrail', 'uMBlur']) if (fx.post[k] !== undefined) u[k].value = fx.post[k];
    u.uTint.value.set(...fx.post.tint);
    if (fx.post.vel) u.uVel.value.set(fx.post.vel[0], fx.post.vel[1]);
    // composite into one of two targets, show it, and keep it as the next frame's afterimage
    const out = this.outs[this.flip], prev = this.outs[1 - this.flip]; this.flip = 1 - this.flip;
    u.tPrev.value = prev.texture;
    this.pass(this.comp, out);
    this.copy.uniforms.t.value = out.texture; this.pass(this.copy, null);
  }
}
