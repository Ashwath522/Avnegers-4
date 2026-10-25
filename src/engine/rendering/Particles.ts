import * as THREE from 'three';
import { glowTexture } from './Stage';

export interface EmitOpts {
  x: number; y: number; z?: number;
  count: number;
  color: THREE.ColorRepresentation;
  speed: number; spread?: number;   // spread: radians around dir (default full circle)
  dir?: { x: number; y: number };
  size: number; life: number;       // px, seconds
  gravity?: number; drag?: number;
  /** if set, particles move toward this point instead (energy convergence) */
  attract?: { x: number; y: number };
  radius?: number;                  // spawn radius
}

/** Pooled additive point-sprite particle system (one draw call for all effects). */
export class Particles {
  readonly points: THREE.Points;
  density = 1;
  enabled = true;
  private n: number;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array; private alpha: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array; private grav: Float32Array; private drag: Float32Array;
  private baseSize: Float32Array; private attract: Float32Array;
  private cursor = 0;
  private tmp = new THREE.Color();

  constructor(capacity = 5000) {
    this.n = capacity;
    this.pos = new Float32Array(capacity * 3); this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity); this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 2); this.life = new Float32Array(capacity); this.max = new Float32Array(capacity);
    this.grav = new Float32Array(capacity); this.drag = new Float32Array(capacity); this.baseSize = new Float32Array(capacity);
    this.attract = new Float32Array(capacity * 3); // x, y, flag
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTexture() }, pr: { value: Math.min(2, window.devicePixelRatio) } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float pr;
        void main(){ vC=color; vA=alpha; gl_PointSize=size*pr; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t=texture2D(map, gl_PointCoord); gl_FragColor=vec4(vC*t.rgb, t.a*vA); }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  emit(o: EmitOpts) {
    if (!this.enabled) return;
    const count = Math.round(o.count * this.density);
    this.tmp.set(o.color);
    for (let k = 0; k < count; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
      const baseA = o.dir ? Math.atan2(o.dir.y, o.dir.x) : 0;
      const a = o.dir ? baseA + (Math.random() - 0.5) * (o.spread ?? 0.6) : Math.random() * Math.PI * 2;
      const sp = o.speed * (0.35 + Math.random() * 0.65);
      const r = (o.radius ?? 0) * Math.sqrt(Math.random());
      const ra = Math.random() * Math.PI * 2;
      this.pos[i * 3] = o.x + Math.cos(ra) * r; this.pos[i * 3 + 1] = o.y + Math.sin(ra) * r; this.pos[i * 3 + 2] = (o.z ?? 0) + 400;
      this.vel[i * 2] = Math.cos(a) * sp; this.vel[i * 2 + 1] = Math.sin(a) * sp;
      if (o.attract) { this.attract[i * 3] = o.attract.x; this.attract[i * 3 + 1] = o.attract.y; this.attract[i * 3 + 2] = 1; }
      else this.attract[i * 3 + 2] = 0;
      const l = o.life * (0.6 + Math.random() * 0.4);
      this.life[i] = l; this.max[i] = l;
      this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 1.5;
      const jitter = 0.85 + Math.random() * 0.3;
      this.col[i * 3] = this.tmp.r * jitter; this.col[i * 3 + 1] = this.tmp.g * jitter; this.col[i * 3 + 2] = this.tmp.b * jitter;
      this.baseSize[i] = o.size * (0.5 + Math.random() * 0.8);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      if (this.attract[i * 3 + 2] > 0) {
        const dx = this.attract[i * 3] - this.pos[i * 3], dy = this.attract[i * 3 + 1] - this.pos[i * 3 + 1];
        this.vel[i * 2] += dx * 18 * dt; this.vel[i * 2 + 1] += dy * 18 * dt;
        if (dx * dx + dy * dy < 36) this.life[i] = 0;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 2] *= dr; this.vel[i * 2 + 1] = this.vel[i * 2 + 1] * dr - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 2] * dt; this.pos[i * 3 + 1] += this.vel[i * 2 + 1] * dt;
      this.alpha[i] = t; this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}
