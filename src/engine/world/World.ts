import * as THREE from 'three';
import { applyHit, integrate, makeTarget, segmentHitsBox, settleState, type PhysParams, type TargetBody, type TargetKind } from './targetLogic';
import type { Particles } from '../rendering/Particles';
import { makeGlow } from '../rendering/Stage';

export type WorldPreset = 'live' | 'dummies' | 'blocks' | 'wall' | 'drones' | 'empty';

interface TargetView { body: TargetBody; group: THREE.Group; mats: THREE.MeshStandardMaterial[]; hpBar: THREE.Mesh; hpBack: THREE.Mesh; baseColors: THREE.Color[]; spawn: number }
interface Chunk { mesh: THREE.Mesh; x: number; y: number; z: number; vx: number; vy: number; vz: number; ax: number; ay: number; av: number; life: number; half: number }

let concreteTex: THREE.Texture | null = null;
function concrete() {
  if (concreteTex) return concreteTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8d8a85'; g.fillRect(0, 0, 128, 128);
  const img = g.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 50; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 1;
  for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(Math.random() * 128, Math.random() * 128); g.lineTo(Math.random() * 128, Math.random() * 128); g.stroke(); }
  concreteTex = new THREE.CanvasTexture(c); concreteTex.colorSpace = THREE.SRGBColorSpace;
  return concreteTex;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
const SPH = new THREE.SphereGeometry(0.5, 18, 12);
const PLANE = new THREE.PlaneGeometry(1, 1);

export class World {
  readonly group = new THREE.Group();
  readonly views: TargetView[] = [];
  private chunks: Chunk[] = [];
  private nextId = 1;
  preset: WorldPreset = 'live';
  phys: PhysParams = { gravity: 2200, restitution: 0.35, friction: 3, groundY: 0, minX: 0, maxX: 1 };
  autoRespawnMs = 2500;
  gravityMult = 1;
  W = 1; H = 1;
  onDestroyed: (t: TargetBody) => void = () => {};
  private shockFx: { ring: THREE.Mesh; t: number; dur: number; maxR: number; flat: number }[] = [];
  private time = 0;

  constructor(private particles: Particles) {}

  get targets() { return this.views.map((v) => v.body); }

  resize(W: number, H: number) {
    const rebuild = this.W === 1;
    this.W = W; this.H = H;
    this.phys.groundY = H * 0.035; this.phys.minX = 0; this.phys.maxX = W;
    this.phys.gravity = 2200 * (H / 720) * this.gravityMult;
    if (rebuild) this.setPreset(this.preset);
  }

  setPreset(p: WorldPreset) {
    this.preset = p;
    for (const v of this.views) v.group.removeFromParent();
    this.views.length = 0;
    const { W, H } = this;
    if (W <= 1) return;
    const g = this.phys.groundY;
    const add = (kind: TargetKind, xf: number, w: number, h: number, hp: number, yOverride?: number) =>
      this.spawn(kind, W * xf, yOverride ?? g + h / 2, w, h, hp);
    switch (p) {
      case 'live':
        add('dummy', 0.12, H * 0.09, H * 0.3, 100); add('block', 0.86, H * 0.15, H * 0.15, 80); add('dummy', 0.94, H * 0.08, H * 0.26, 100);
        add('drone', 0.2, H * 0.08, H * 0.06, 40, H * 0.72); add('drone', 0.8, H * 0.08, H * 0.06, 40, H * 0.68);
        break;
      case 'dummies': [0.08, 0.18, 0.82, 0.92].forEach((x) => add('dummy', x, H * 0.085, H * 0.28, 100)); break;
      case 'blocks': [0.07, 0.17, 0.83, 0.93].forEach((x, i) => add('block', x, H * (0.11 + (i % 2) * 0.04), H * (0.11 + (i % 2) * 0.04), 80)); break;
      case 'wall': add('wall', 0.88, H * 0.14, H * 0.6, 400); add('wall', 0.1, H * 0.12, H * 0.45, 300); break;
      case 'drones': [[0.12, 0.7], [0.25, 0.85], [0.75, 0.82], [0.88, 0.66]].forEach(([x, y]) => add('drone', x, H * 0.08, H * 0.06, 40, H * y)); break;
      case 'empty': break;
    }
  }

  setGravity(mult: number) { this.gravityMult = mult; this.phys.gravity = 2200 * (Math.max(this.H, 360) / 720) * mult; }

  resetAll() { this.setPreset(this.preset); }

  private spawn(kind: TargetKind, x: number, y: number, w: number, h: number, hp: number) {
    const body = makeTarget(this.nextId++, kind, x, y, w, h, hp);
    const group = new THREE.Group();
    const mats: THREE.MeshStandardMaterial[] = [];
    const M = (opts: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial({ transparent: true, ...opts }); mats.push(m); return m; };
    if (kind === 'dummy') {
      const torso = new THREE.Mesh(CYL, M({ color: '#d8782a', roughness: 0.6 })); torso.scale.set(w, h * 0.72, w * 0.8); torso.position.y = -h * 0.1;
      const head = new THREE.Mesh(SPH, M({ color: '#e0a060', roughness: 0.5 })); head.scale.setScalar(w * 0.75); head.position.y = h * 0.38;
      const band = new THREE.Mesh(CYL, M({ color: '#202020', roughness: 0.4 })); band.scale.set(w * 1.04, h * 0.08, w * 0.85); band.position.y = h * 0.05;
      group.add(torso, head, band);
    } else if (kind === 'block' || kind === 'wall') {
      const box = new THREE.Mesh(BOX, M({ color: kind === 'wall' ? '#a8a29a' : '#ffffff', map: concrete(), roughness: 0.95 }));
      box.scale.set(w, h, Math.min(w, h) * 0.8); group.add(box);
    } else {
      const shell = new THREE.Mesh(BOX, M({ color: '#3a4250', metalness: 0.8, roughness: 0.3 })); shell.scale.set(w, h * 0.5, w * 0.7);
      const eye = new THREE.Mesh(SPH, M({ color: '#ff3b3b', emissive: '#ff2020', emissiveIntensity: 2 })); eye.scale.setScalar(h * 0.35); eye.position.z = w * 0.35;
      const glow = makeGlow('#ff4040', h * 1.2, 0.6); glow.position.z = w * 0.4;
      group.add(shell, eye, glow);
    }
    const hpBack = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.6 }));
    const hpBar = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: '#33ff88' }));
    hpBack.renderOrder = hpBar.renderOrder = 30;
    this.group.add(group, hpBack, hpBar);
    const view: TargetView = { body, group, mats, hpBar, hpBack, baseColors: mats.map((m) => m.color.clone()), spawn: 0 };
    this.views.push(view);
    return view;
  }

  /** Nearest target hit by a moving sphere from (x0,y0) to (x1,y1). */
  sweep(x0: number, y0: number, x1: number, y1: number, radius: number): { target: TargetBody; frac: number } | null {
    let best: { target: TargetBody; frac: number } | null = null;
    for (const v of this.views) {
      if (v.body.state === 'DESTROYED' || v.spawn < 1) continue;
      const f = segmentHitsBox(x0, y0, x1, y1, v.body, radius);
      if (f !== null && (!best || f < best.frac)) best = { target: v.body, frac: f };
    }
    return best;
  }

  /** Target closest to the aim ray within a cone (used for aim assist and highlighting). */
  inCone(ox: number, oy: number, dx: number, dy: number, maxDist: number, cone: number): TargetBody | null {
    let best: TargetBody | null = null, bestScore = Infinity;
    for (const v of this.views) {
      const t = v.body;
      if (t.state === 'DESTROYED' || v.spawn < 1) continue;
      const tx = t.x - ox, ty = t.y - oy, d = Math.hypot(tx, ty);
      if (d > maxDist || d < 1) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (tx * dx + ty * dy) / d)));
      if (ang > cone) continue;
      const score = ang * 2 + d / maxDist;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  nearest(x: number, y: number, maxDist: number, exclude: Set<number> = new Set()): TargetBody | null {
    let best: TargetBody | null = null, bd = maxDist;
    for (const v of this.views) {
      const t = v.body;
      if (t.state === 'DESTROYED' || v.spawn < 1 || exclude.has(t.id)) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  markTargeted(t: TargetBody) { t.targetedTimer = 0.2; }

  hit(t: TargetBody, damage: number, ix: number, iy: number, px: number, py: number, color: string) {
    const destroyed = applyHit(t, damage, ix, iy);
    this.particles.emit({ x: px, y: py, count: 26, color, speed: 520, size: 16, life: 0.45, drag: 3 });
    this.particles.emit({ x: px, y: py, count: 14, color: '#bdb6aa', speed: 260, size: 22, life: 0.9, drag: 2, gravity: 300 });
    if (destroyed) this.fracture(t, ix, iy, px, py);
    return destroyed;
  }

  /** Pre-fractured grid of chunks inheriting the target's material, thrown by the impact impulse. */
  private fracture(t: TargetBody, ix: number, iy: number, px: number, py: number) {
    const v = this.views.find((x) => x.body === t);
    if (!v) return;
    v.group.visible = false; v.hpBar.visible = v.hpBack.visible = false;
    const nx = t.kind === 'wall' ? 4 : 3, ny = t.kind === 'wall' ? 8 : t.kind === 'dummy' ? 5 : 3;
    const cw = t.w / nx, ch = t.h / ny;
    const mat = v.mats[0].clone(); mat.emissive?.set('#000000');
    const imp = Math.hypot(ix, iy) / t.mass;
    const idir = imp > 0 ? { x: ix / t.mass / imp, y: iy / t.mass / imp } : { x: 0, y: 1 };
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const cx = t.x - t.w / 2 + cw * (i + 0.5), cy = t.y - t.h / 2 + ch * (j + 0.5);
      const s = 0.7 + Math.random() * 0.35;
      const mesh = new THREE.Mesh(BOX, mat);
      const half = Math.min(cw, ch) * s / 2;
      mesh.scale.set(cw * s, ch * s, Math.min(cw, ch) * s);
      const rx = cx - px, ry = cy - py, rl = Math.hypot(rx, ry) || 1;
      const speed = Math.min(1600, imp * 0.6 + 200);
      this.chunks.push({
        mesh, x: cx, y: cy, z: 0, half,
        vx: idir.x * speed * (0.5 + Math.random()) + (rx / rl) * 180 * Math.random(),
        vy: idir.y * speed * (0.5 + Math.random()) + (ry / rl) * 180 * Math.random() + 250,
        vz: (Math.random() - 0.5) * 300,
        ax: Math.random(), ay: Math.random(), av: (Math.random() - 0.5) * 14, life: 3.5 + Math.random(),
      });
      this.group.add(mesh);
    }
    this.particles.emit({ x: t.x, y: t.y, count: 60, color: '#c8c0b2', speed: 400, size: 26, life: 1.2, drag: 2.5, gravity: 200, radius: Math.min(t.w, t.h) / 2 });
    this.onDestroyed(t);
    if (this.autoRespawnMs > 0) setTimeout(() => this.respawn(v), this.autoRespawnMs);
  }

  private respawn(v: TargetView) {
    if (!this.views.includes(v)) return;
    const b = v.body;
    Object.assign(b, makeTarget(b.id, b.kind, b.homeX, b.homeY, b.w, b.h, b.maxHp));
    v.group.visible = true; v.spawn = 0;
  }

  /** Expanding ground shockwave visual. */
  shockwave(x: number, y: number, maxR: number, color: string, dur = 0.6, flat = 0.22) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.set(x, y, 300);
    ring.renderOrder = 15;
    this.group.add(ring);
    this.shockFx.push({ ring, t: 0, dur, maxR, flat });
  }

  update(dt: number) {
    this.time += dt;
    for (const v of this.views) {
      const b = v.body;
      if (b.state === 'DESTROYED') continue;
      v.spawn = Math.min(1, v.spawn + dt * 2.5);
      integrate(b, dt, this.phys);
      settleState(b, dt);
      v.group.position.set(b.x, b.y + (b.floating && b.grabbed <= 0 ? Math.sin(this.time * 2 + b.id) * 6 : 0), 0);
      v.group.rotation.set(0, b.kind === 'drone' ? this.time * 1.5 : 0, b.angle);
      v.group.scale.setScalar(0.3 + 0.7 * v.spawn);
      const flash = b.hitTimer > 0 ? 1 : 0;
      v.mats.forEach((m, i) => {
        m.opacity = v.spawn;
        const dmg = 1 - 0.45 * (1 - b.hp / b.maxHp);
        m.color.copy(v.baseColors[i]).multiplyScalar(dmg);
        if (b.kind !== 'drone' || i !== 1) {
          m.emissive.set(flash ? '#ffffff' : b.state === 'TARGETED' ? '#1d6f8a' : '#000000');
          m.emissiveIntensity = flash ? 1.2 : 0.6;
        }
      });
      const showBar = b.hp < b.maxHp || b.state === 'TARGETED';
      v.hpBar.visible = v.hpBack.visible = showBar;
      const bw = Math.max(40, b.w * 1.1), top = b.y + b.h / 2 + 14;
      v.hpBack.position.set(b.x, top, 500); v.hpBack.scale.set(bw, 6, 1);
      const r = b.hp / b.maxHp;
      v.hpBar.position.set(b.x - bw * (1 - r) / 2, top, 501); v.hpBar.scale.set(Math.max(0.001, bw * r), 6, 1);
      (v.hpBar.material as THREE.MeshBasicMaterial).color.setHSL(0.33 * r, 0.9, 0.55);
    }
    const g = this.phys.groundY;
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.life -= dt;
      c.vy -= this.phys.gravity * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.y - c.half < g) { c.y = g + c.half; c.vy = Math.abs(c.vy) * this.phys.restitution; c.vx *= 0.7; c.av *= 0.7; if (c.vy < 40) c.vy = 0; }
      if (c.x < 0 || c.x > this.W) c.vx = -c.vx * 0.5;
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.x += c.av * c.ax * dt; c.mesh.rotation.y += c.av * c.ay * dt; c.mesh.rotation.z += c.av * dt;
      const m = c.mesh.material as THREE.MeshStandardMaterial;
      if (c.life < 1) { m.opacity = Math.max(0, c.life); }
      if (c.life <= 0) { c.mesh.removeFromParent(); this.chunks.splice(i, 1); }
    }
    for (let i = this.shockFx.length - 1; i >= 0; i--) {
      const s = this.shockFx[i];
      s.t += dt;
      const k = s.t / s.dur;
      const r = s.maxR * (1 - Math.pow(1 - Math.min(1, k), 2));
      s.ring.scale.set(r, r * s.flat, 1);
      (s.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) { s.ring.removeFromParent(); s.ring.geometry.dispose(); (s.ring.material as THREE.Material).dispose(); this.shockFx.splice(i, 1); }
    }
  }

  dispose() {
    for (const c of this.chunks) c.mesh.removeFromParent();
    this.chunks = [];
    for (const v of this.views) v.mats.forEach((m) => m.dispose());
    this.group.removeFromParent();
  }
}
