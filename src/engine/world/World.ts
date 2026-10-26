import * as THREE from 'three';
import { applyHit, integrate, makeTarget, segmentHitsBox, settleState, type PhysParams, type TargetBody, type TargetKind } from './targetLogic';
import type { Particles } from '../rendering/Particles';
import { makeGlow } from '../rendering/Stage';
import { CrackSurface, Dust, chipGeometries, fractureBox } from './fracture';

export type WorldPreset = 'live' | 'dummies' | 'blocks' | 'wall' | 'drones' | 'empty';

interface TargetView { body: TargetBody; group: THREE.Group; mats: THREE.MeshStandardMaterial[]; hpBar: THREE.Mesh; hpBack: THREE.Mesh; baseColors: THREE.Color[]; spawn: number; surface: CrackSurface | null; depth: number }
interface Chunk { mesh: THREE.Mesh; vel: THREE.Vector3; ang: THREE.Vector3; life: number; radius: number; resting: boolean; ownsMat: boolean }
const MAX_CHUNKS = 450;
const _q = new THREE.Quaternion(), _axis = new THREE.Vector3();

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
  private flashes: { s: THREE.Sprite; t: number }[] = [];
  private shockFx: { ring: THREE.Mesh; t: number; dur: number; maxR: number; flat: number }[] = [];
  private time = 0;

  readonly dust = new Dust();
  private surfaces: CrackSurface[] = [];
  constructor(private particles: Particles) { this.group.add(this.dust.group); }

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
    let surface: CrackSurface | null = null;
    let depth = Math.min(w, h) * 0.8;
    if (kind === 'dummy') {
      surface = new CrackSurface('paint', '#d8782a');
      const torso = new THREE.Mesh(CYL, M({ color: '#ffffff', map: surface.texture, roughness: 0.6 })); torso.scale.set(w, h * 0.72, w * 0.8); torso.position.y = -h * 0.1;
      const head = new THREE.Mesh(SPH, M({ color: '#e0a060', roughness: 0.5 })); head.scale.setScalar(w * 0.75); head.position.y = h * 0.38;
      const band = new THREE.Mesh(CYL, M({ color: '#202020', roughness: 0.4 })); band.scale.set(w * 1.04, h * 0.08, w * 0.85); band.position.y = h * 0.05;
      group.add(torso, head, band); depth = w * 0.8;
    } else if (kind === 'block' || kind === 'wall') {
      surface = new CrackSurface(kind === 'wall' ? 'brick' : 'concrete');
      const box = new THREE.Mesh(BOX, M({ color: kind === 'wall' ? '#b29a8c' : '#a8a39b', map: surface.texture, roughness: 0.95 }));
      box.scale.set(w, h, depth); group.add(box);
    } else {
      const shell = new THREE.Mesh(BOX, M({ color: '#3a4250', metalness: 0.8, roughness: 0.3 })); shell.scale.set(w, h * 0.5, w * 0.7);
      const eye = new THREE.Mesh(SPH, M({ color: '#ff3b3b', emissive: '#ff2020', emissiveIntensity: 2 })); eye.scale.setScalar(h * 0.35); eye.position.z = w * 0.35;
      const glow = makeGlow('#ff4040', h * 1.2, 0.6); glow.position.z = w * 0.4;
      group.add(shell, eye, glow); depth = w * 0.7;
    }
    if (surface) this.surfaces.push(surface);
    const hpBack = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.6 }));
    const hpBar = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: '#33ff88' }));
    hpBack.renderOrder = hpBar.renderOrder = 30;
    this.group.add(group, hpBack, hpBar);
    const view: TargetView = { body, group, mats, hpBar, hpBack, baseColors: mats.map((m) => m.color.clone()), spawn: 0, surface, depth };
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
    const v = this.views.find((x) => x.body === t);
    const destroyed = applyHit(t, damage, ix, iy);
    const sev = Math.min(1, damage / t.maxHp * 2.2);
    this.particles.emit({ x: px, y: py, count: 26, color, speed: 520, size: 16, life: 0.45, drag: 3 });
    if (v && t.kind !== 'drone') {
      // crack the surface where the hit actually landed
      const u = (px - (t.x - t.w / 2)) / t.w, vv = (py - (t.y - t.h / 2)) / t.h;
      v.surface?.crack(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, vv)), sev);
      this.spall(v, px, py, ix, iy, 3 + Math.round(sev * 8));
      this.dust.emit(px, py, 2 + Math.round(sev * 4), Math.min(t.w, t.h) * 0.5);
    } else if (v) {
      this.particles.emit({ x: px, y: py, count: 18, color: '#ffd27a', speed: 700, size: 6, life: 0.4, gravity: 900, drag: 1 });
    }
    if (destroyed) this.fracture(t, ix, iy, px, py);
    return destroyed;
  }

  /** Small chips knocked off the surface at the impact point. */
  private spall(v: TargetView, px: number, py: number, ix: number, iy: number, n: number) {
    const chips = chipGeometries();
    const t = v.body;
    const sz = Math.min(t.w, t.h) * 0.09;
    const im = Math.hypot(ix, iy) || 1;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(chips[k % chips.length], v.mats[0]);
      m.scale.setScalar(sz * (0.4 + Math.random() * 0.8));
      m.position.set(px, py, v.depth * 0.5);
      // chips fly back toward the attacker and outward
      const vel = new THREE.Vector3(-(ix / im) * (150 + Math.random() * 350) + (Math.random() - 0.5) * 300, 150 + Math.random() * 400, 100 + Math.random() * 250);
      this.addChunk(m, vel, 0.5 * sz, 3 + Math.random() * 2, false);
    }
  }

  private addChunk(mesh: THREE.Mesh, vel: THREE.Vector3, radius: number, life: number, ownsMat: boolean) {
    if (this.chunks.length >= MAX_CHUNKS) { const old = this.chunks.shift()!; old.mesh.removeFromParent(); if (old.ownsMat) (old.mesh.material as THREE.Material).dispose(); }
    const ang = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.group.add(mesh);
    this.chunks.push({ mesh, vel, ang, life, radius, resting: false, ownsMat });
  }

  /** Voronoi fracture: irregular shards, smaller near the impact, thrown by the actual impulse. */
  private fracture(t: TargetBody, ix: number, iy: number, px: number, py: number) {
    const v = this.views.find((x) => x.body === t);
    if (!v) return;
    v.group.visible = false; v.hpBar.visible = v.hpBack.visible = false;
    const local = { x: px - t.x, y: py - t.y };
    const seeds = t.kind === 'wall' ? 34 : t.kind === 'drone' ? 10 : t.kind === 'dummy' ? 16 : 20;
    const shards = fractureBox(t.w, t.h, v.depth, local, seeds);
    const mat = v.mats[0].clone(); mat.emissive?.set('#000000'); mat.transparent = true;
    const imp = Math.hypot(ix, iy) / t.mass;
    const idir = imp > 0 ? { x: ix / t.mass / imp, y: iy / t.mass / imp } : { x: 0, y: 1 };
    const span = Math.hypot(t.w, t.h);
    for (const sh of shards) {
      const mesh = new THREE.Mesh(sh.geometry, mat);
      mesh.position.set(t.x + sh.center.x, t.y + sh.center.y, sh.center.z);
      const rx = sh.center.x - local.x, ry = sh.center.y - local.y, rl = Math.hypot(rx, ry) || 1;
      const near = 1 - Math.min(1, rl / span); // pieces near the impact fly fastest
      const speed = Math.min(1800, imp * 0.5 + 150) * (0.35 + near * 0.9);
      const vel = new THREE.Vector3(
        idir.x * speed + (rx / rl) * 260 * near + (Math.random() - 0.5) * 120,
        idir.y * speed + (ry / rl) * 220 * near + 180 * Math.random(),
        (Math.random() - 0.2) * 320 * near,
      );
      this.addChunk(mesh, vel, sh.radius, 7 + Math.random() * 3, false);
      mesh.rotation.set(0, 0, 0);
    }
    if (t.kind === 'drone') {
      const boom = makeGlow('#ff8a2a', Math.max(t.w, t.h) * 4, 1); boom.position.set(t.x, t.y, 800);
      this.group.add(boom); this.flashes.push({ s: boom, t: 0 });
      this.particles.emit({ x: t.x, y: t.y, count: 80, color: '#ff9a3a', speed: 600, size: 18, life: 0.7, drag: 2 });
      this.dust.emit(t.x, t.y, 8, Math.max(t.w, t.h) * 1.2, '#3a3632');
    } else {
      this.dust.emit(t.x, t.y, 10 + Math.round(t.w * t.h / 4000), Math.min(t.w, t.h) * 0.9, '#b9b2a6', 1.6);
      this.particles.emit({ x: px, y: py, count: 30, color: '#e8e0d0', speed: 500, size: 8, life: 0.6, gravity: 900, drag: 1.5 });
    }
    this.onDestroyed(t);
    if (this.autoRespawnMs > 0) setTimeout(() => this.respawn(v), this.autoRespawnMs);
  }

  private respawn(v: TargetView) {
    if (!this.views.includes(v)) return;
    const b = v.body;
    Object.assign(b, makeTarget(b.id, b.kind, b.homeX, b.homeY, b.w, b.h, b.maxHp));
    if (v.surface) {
      const fresh = new CrackSurface(b.kind === 'wall' ? 'brick' : b.kind === 'dummy' ? 'paint' : 'concrete', '#d8782a');
      this.surfaces.push(fresh);
      v.mats[0].map = fresh.texture; v.mats[0].needsUpdate = true; v.surface = fresh;
    }
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
      const m = c.mesh;
      c.life -= dt;
      if (!c.resting) {
        c.vel.y -= this.phys.gravity * dt;
        c.vel.multiplyScalar(Math.exp(-0.15 * dt));
        m.position.addScaledVector(c.vel, dt);
        const angLen = c.ang.length();
        if (angLen > 1e-4) { _axis.copy(c.ang).divideScalar(angLen); _q.setFromAxisAngle(_axis, angLen * dt); m.quaternion.premultiply(_q); }
        const bottom = m.position.y - c.radius * 0.55;
        if (bottom < g) {
          m.position.y = g + c.radius * 0.55;
          if (c.vel.y < 0) c.vel.y = -c.vel.y * this.phys.restitution * 0.7;
          c.vel.x *= 0.6; c.vel.z *= 0.6; c.ang.multiplyScalar(0.55);
          if (Math.abs(c.vel.y) < 60 && Math.hypot(c.vel.x, c.vel.z) < 40) c.resting = true; // settle as rubble
        }
        if (m.position.x < 0 || m.position.x > this.W) { c.vel.x = -c.vel.x * 0.4; m.position.x = Math.max(0, Math.min(this.W, m.position.x)); }
      }
      if (c.life < 1.5) m.position.y -= c.radius * 0.9 * dt; // rubble sinks into the ground before disappearing
      if (c.life <= 0) { m.removeFromParent(); if (c.ownsMat) (m.material as THREE.Material).dispose(); if (!chipGeometries().includes(m.geometry)) m.geometry.dispose(); this.chunks.splice(i, 1); }
    }
    this.dust.update(dt);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.t += dt;
      f.s.material.opacity = Math.max(0, 1 - f.t / 0.35); f.s.scale.multiplyScalar(1 + dt * 2);
      if (f.t > 0.35) { f.s.removeFromParent(); f.s.material.dispose(); this.flashes.splice(i, 1); }
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
    for (const c of this.chunks) { c.mesh.removeFromParent(); c.mesh.geometry !== undefined && !chipGeometries().includes(c.mesh.geometry) && c.mesh.geometry.dispose(); }
    this.chunks = [];
    this.dust.dispose();
    this.surfaces.forEach((x) => x.dispose()); this.surfaces = [];
    for (const v of this.views) v.mats.forEach((m) => m.dispose());
    this.group.removeFromParent();
  }
}
