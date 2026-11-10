// The type plates of her last scene: in the white, the lyric is set enormous behind the machines, each word stamped
// into its place as she sings it and left there, line printed over line, until the next verse wipes it.
// Her type: Times stretched tall in black, a royal-blue condensed grotesk, red script, neon green and magenta, orange.
// It is one sheet standing far behind everything, facing the lens, so the machines pass in front of the letters.
import * as THREE from 'three';

const TIMES = '400 100px "Times New Roman", Times, serif', OSW = '700 100px Oswald, "Arial Narrow", sans-serif', SCRIPT = '100px "Pinyon Script", cursive';
const INK = { black: '#0b0b0c', blue: '#1f33ff', red: '#e3122e', green: '#38ff32', pink: '#ff2bd8', orange: '#ff7a00' };
// each kind of line has its boxes, filled in order by the words as they are sung: [x, y, w, h] of the sheet, font, ink
const LAYOUTS = {
  wanna: [[0.03, 0.03, 0.2, 0.5, TIMES, 'black'], [0.25, 0.03, 0.72, 0.5, TIMES, 'black'], [0.22, 0.4, 0.56, 0.58, TIMES, 'black'], [0.36, 0.06, 0.28, 0.46, OSW, 'blue'], [0.02, 0.5, 0.96, 0.48, OSW, 'blue']],
  cause: [[0.04, 0.05, 0.3, 0.2, SCRIPT, 'red'], [0.33, 0.03, 0.12, 0.2, SCRIPT, 'red'], [0.47, 0.06, 0.16, 0.2, SCRIPT, 'red'], [0.1, 0.24, 0.1, 0.2, SCRIPT, 'red'], [0.2, 0.22, 0.14, 0.2, SCRIPT, 'red'], [0.35, 0.2, 0.26, 0.24, SCRIPT, 'red'],
    [0.1, 0.42, 0.3, 0.2, SCRIPT, 'red'], [0.4, 0.4, 0.14, 0.2, SCRIPT, 'red'], [0.52, 0.38, 0.34, 0.24, SCRIPT, 'red']],
  says: [[0.02, 0.02, 0.2, 0.5, OSW, 'pink'], [0.24, 0.02, 0.74, 0.5, OSW, 'pink'], [0.02, 0.5, 0.3, 0.48, OSW, 'green'], [0.34, 0.5, 0.64, 0.48, OSW, 'green'], [0.3, 0.2, 0.16, 0.5, TIMES, 'pink'], [0.48, 0.2, 0.5, 0.5, TIMES, 'pink']],
  better: [[0.52, 0.02, 0.2, 0.3, OSW, 'orange'], [0.74, 0.02, 0.1, 0.3, OSW, 'orange'], [0.86, 0.02, 0.12, 0.3, OSW, 'orange'], [0.52, 0.34, 0.08, 0.3, OSW, 'orange'], [0.62, 0.34, 0.12, 0.3, OSW, 'orange'], [0.76, 0.34, 0.22, 0.3, OSW, 'orange'],
    [0.5, 0.66, 0.2, 0.32, OSW, 'orange'], [0.72, 0.66, 0.06, 0.32, OSW, 'orange'], [0.8, 0.66, 0.18, 0.32, OSW, 'orange']],
};
const kindOf = (text) => (/^i wanna/i.test(text) || /^want/i.test(text) ? 'wanna' : /^'?cause/i.test(text) ? 'cause' : /^it says/i.test(text) ? 'says' : /^and no one/i.test(text) ? 'better' : 'wanna');

// what goes in must come out of the camera's tone curve as the ink's own colour: the curve (post.js), solved backwards
const FS = `precision highp float; uniform sampler2D t; uniform float uA; varying vec2 vUv;
vec3 untone(vec3 y) { y = clamp(y, 0.0, 0.985); vec3 a = 2.51 - 2.43 * y, b = 0.03 - 0.59 * y, c = -0.14 * y; return (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a); }
void main() { vec4 c = texture2D(t, vUv); gl_FragColor = vec4(untone(pow(c.rgb, vec3(2.2))), c.a * uA); }`;

export class Plates {
  constructor(scene) {
    const c = this.c = document.createElement('canvas'); c.width = 2048; c.height = 1152; this.x = c.getContext('2d');
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.NoColorSpace; this.tex.generateMipmaps = false; this.tex.minFilter = THREE.LinearFilter;
    this.mat = new THREE.ShaderMaterial({ uniforms: { t: { value: this.tex }, uA: { value: 0 } }, transparent: true, depthWrite: false, fragmentShader: FS,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }' });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = -4; this.mesh.visible = false; scene.add(this.mesh);
    this.line = -1; this.n = 0; this.kind = null; this.a = 0;
  }
  clear() { this.x.clearRect(0, 0, this.c.width, this.c.height); this.tex.needsUpdate = true; this.n = 0; }
  // a sung word: `line` is its line's index in the lyrics, `text` the whole line (it decides the layout)
  word(w, line, text, idx) {
    if (line !== this.line) {
      const kind = kindOf(text); this.line = line; this.n = 0; this.kind = kind;
      if (kind === 'wanna') this.clear();                               // a new verse starts on a clean sheet; the other lines print over what is there
    }
    const L = LAYOUTS[this.kind], box = L[Math.min(idx ?? this.n, L.length - 1)]; this.n++;
    const [bx, by, bw, bh, font, ink] = box, x = this.x, W = this.c.width, H = this.c.height;
    const s = /-$/.test(w) ? w.replace(/-$/, '—').toUpperCase() : font === SCRIPT ? w.replace(/[,.]/g, '').toLowerCase() : w.replace(/[,.]/g, '').toUpperCase();
    x.save(); x.font = font; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    const m = x.measureText(s), tw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    // stretched to fill its box exactly, as her type is: wide words squeezed, short ones pulled tall
    x.translate(bx * W, by * H); x.scale(bw * W / Math.max(1, tw), bh * H / Math.max(1, th));
    x.fillStyle = INK[ink]; x.globalAlpha = font === SCRIPT ? 0.95 : 1;
    x.fillText(s, m.actualBoundingBoxLeft, m.actualBoundingBoxAscent);
    x.restore(); this.tex.needsUpdate = true;
  }
  // stands across the whole view, `dist` away, facing the lens; on: 0..1 how much it shows
  place(cam, on, dist = 16) {
    this.a += (on - this.a) * 0.3; this.mat.uniforms.uA.value = this.a; this.mesh.visible = this.a > 0.01;
    if (!this.mesh.visible) return;
    const e = cam.projectionMatrix.elements, h = 2 * dist / e[5], w = 2 * dist / e[0], m = this.mesh;
    m.position.setFromMatrixPosition(cam.matrixWorld).addScaledVector(new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld), dist);
    m.quaternion.setFromRotationMatrix(cam.matrixWorld); m.scale.set(w, h, 1);
  }
}
