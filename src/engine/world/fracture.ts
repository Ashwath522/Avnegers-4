import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

/**
 * Voronoi-style fracture of a box. Seeds are concentrated around the impact point, so pieces are
 * small and numerous where the hit landed and large further away — like real brittle failure.
 * Each cell is the convex hull of the box sample points closest to its seed.
 */
export interface Shard { geometry: THREE.BufferGeometry; center: THREE.Vector3; radius: number }

export function fractureBox(w: number, h: number, d: number, impact: { x: number; y: number }, seeds = 18): Shard[] {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const S: THREE.Vector3[] = [];
  for (let i = 0; i < seeds; i++) {
    const near = i < seeds * 0.6; // 60% of seeds clustered around the impact
    const r = near ? 0.35 : 1;
    S.push(new THREE.Vector3(
      clamp(impact.x + (Math.random() * 2 - 1) * hw * r * (near ? 1 : 1.2), -hw, hw),
      clamp(impact.y + (Math.random() * 2 - 1) * hh * r * (near ? 1 : 1.2), -hh, hh),
      (Math.random() * 2 - 1) * hd,
    ));
  }
  // sample points: a jittered volume grid + the 8 corners + edge points so hulls fill the box
  const pts: THREE.Vector3[] = [];
  const nx = 13, ny = Math.max(6, Math.round(13 * h / w)), nz = 4;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) {
    const onEdge = i === 0 || i === nx || j === 0 || j === ny || k === 0 || k === nz;
    const jx = onEdge ? 0 : (Math.random() - 0.5) * 0.6, jy = onEdge ? 0 : (Math.random() - 0.5) * 0.6;
    pts.push(new THREE.Vector3(-hw + w * (i + jx) / nx, -hh + h * (j + jy) / ny, -hd + d * k / nz));
  }
  const cells: THREE.Vector3[][] = S.map(() => []);
  for (const p of pts) {
    let best = 0, bd = Infinity;
    for (let s = 0; s < S.length; s++) { const dd = p.distanceToSquared(S[s]); if (dd < bd) { bd = dd; best = s; } }
    cells[best].push(p);
  }
  const out: Shard[] = [];
  for (const c of cells) {
    if (c.length < 5) continue;
    let g: THREE.BufferGeometry;
    try { g = new ConvexGeometry(c); } catch { continue; }
    g.computeBoundingBox();
    const center = new THREE.Vector3(); g.boundingBox!.getCenter(center);
    g.translate(-center.x, -center.y, -center.z);
    g.computeBoundingSphere();
    addBoxUVs(g, center, w, h);
    out.push({ geometry: g, center, radius: g.boundingSphere!.radius });
  }
  return out;
}

/** Small random rock-like chips for impact spall (reused). */
let chipCache: THREE.BufferGeometry[] | null = null;
export function chipGeometries(): THREE.BufferGeometry[] {
  if (chipCache) return chipCache;
  chipCache = [];
  for (let k = 0; k < 6; k++) {
    const pts = Array.from({ length: 9 }, () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.6));
    const g = new ConvexGeometry(pts);
    g.computeBoundingSphere();
    addBoxUVs(g, new THREE.Vector3(), 1, 1);
    chipCache.push(g);
  }
  return chipCache;
}

/** Planar UVs from the box front face so outer faces keep the target's texture (cracks included). */
function addBoxUVs(g: THREE.BufferGeometry, offset: THREE.Vector3, w: number, h: number) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + offset.x) / w + 0.5;
    uv[i * 2 + 1] = (pos.getY(i) + offset.y) / h + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ crack textures */

/** Per-target canvas texture: base surface plus cracks that accumulate where hits land. */
export class CrackSurface {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  constructor(base: 'concrete' | 'brick' | 'paint', color = '#d8782a') {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 512;
    this.g = this.canvas.getContext('2d')!;
    const g = this.g, S = 512;
    if (base === 'paint') { g.fillStyle = color; g.fillRect(0, 0, S, S); }
    else {
      g.fillStyle = base === 'brick' ? '#8a6a58' : '#8e8b86'; g.fillRect(0, 0, S, S);
      const img = g.getImageData(0, 0, S, S);
      for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 46; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
      g.putImageData(img, 0, 0);
      // stains + aggregate
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '40,38,35' : '200,196,188'},${Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 6 + Math.random() * 40, 0, 7); g.fill(); }
      if (base === 'brick') {
        g.strokeStyle = 'rgba(210,200,185,0.8)'; g.lineWidth = 5;
        for (let y = 0; y < S; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); for (let x = ((y / 42) % 2) * 48; x < S; x += 96) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 42); g.stroke(); } }
      }
    }
    if (base === 'paint') { g.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < 30; k++) g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 30, 2); }
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /** Draw a crack network radiating from (u,v) in 0..1; severity 0..1 controls length/branching. */
  crack(u: number, v: number, severity: number) {
    const g = this.g, S = 512;
    const x0 = u * S, y0 = (1 - v) * S;
    // crater
    const r = 10 + severity * 26;
    const grd = g.createRadialGradient(x0, y0, 0, x0, y0, r);
    grd.addColorStop(0, 'rgba(25,22,20,0.85)'); grd.addColorStop(0.6, 'rgba(60,55,50,0.45)'); grd.addColorStop(1, 'rgba(60,55,50,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x0, y0, r, 0, 7); g.fill();
    const arms = 4 + Math.round(severity * 5);
    for (let a = 0; a < arms; a++) this.branch(x0, y0, (a / arms) * Math.PI * 2 + Math.random() * 0.6, 40 + severity * 170, 2.6, 0);
    this.texture.needsUpdate = true;
  }

  private branch(x: number, y: number, ang: number, len: number, width: number, depth: number) {
    const g = this.g;
    g.strokeStyle = 'rgba(18,16,15,0.9)'; g.lineCap = 'round';
    let cx = x, cy = y, remaining = len;
    while (remaining > 0) {
      const step = 6 + Math.random() * 10;
      ang += (Math.random() - 0.5) * 0.7;
      const nx = cx + Math.cos(ang) * step, ny = cy + Math.sin(ang) * step;
      g.lineWidth = Math.max(0.6, width * (remaining / len));
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(nx, ny); g.stroke();
      // highlight edge for depth
      g.strokeStyle = 'rgba(220,214,204,0.25)'; g.lineWidth *= 0.5; g.beginPath(); g.moveTo(cx + 1, cy + 1); g.lineTo(nx + 1, ny + 1); g.stroke();
      g.strokeStyle = 'rgba(18,16,15,0.9)';
      if (depth < 2 && Math.random() < 0.12) this.branch(nx, ny, ang + (Math.random() > 0.5 ? 0.8 : -0.8), remaining * 0.5, width * 0.6, depth + 1);
      cx = nx; cy = ny; remaining -= step;
    }
  }

  dispose() { this.texture.dispose(); }
}

/* ------------------------------------------------------------------ dust */

let smokeTex: THREE.Texture | null = null;
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let k = 0; k < 14; k++) {
    const x = 64 + (Math.random() - 0.5) * 40, y = 64 + (Math.random() - 0.5) * 40, r = 20 + Math.random() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

interface Puff { s: THREE.Sprite; vx: number; vy: number; life: number; max: number; grow: number; rot: number }

/** Non-additive dust clouds (additive particles look like glowing energy, not dust). */
export class Dust {
  readonly group = new THREE.Group();
  private puffs: Puff[] = [];
  enabled = true;
  emit(x: number, y: number, n: number, size: number, color = '#b9b2a6', spread = 1) {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      if (this.puffs.length > 160) { const old = this.puffs.shift()!; old.s.removeFromParent(); old.s.material.dispose(); }
      const m = new THREE.SpriteMaterial({ map: smokeTexture(), color, transparent: true, depthWrite: false, opacity: 0.8 });
      const s = new THREE.Sprite(m);
      s.position.set(x + (Math.random() - 0.5) * size * spread, y + (Math.random() - 0.3) * size * 0.5 * spread, 700);
      s.scale.setScalar(size * (0.6 + Math.random() * 0.6));
      s.renderOrder = 25;
      this.group.add(s);
      const life = 1.4 + Math.random() * 1.6;
      this.puffs.push({ s, vx: (Math.random() - 0.5) * 120 * spread, vy: 20 + Math.random() * 90, life, max: life, grow: size * (0.6 + Math.random()), rot: (Math.random() - 0.5) * 0.8 });
    }
  }
  update(dt: number) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.vx *= Math.exp(-1.5 * dt); p.vy *= Math.exp(-1.2 * dt);
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt;
      const sc = p.s.scale.x + p.grow * dt; p.s.scale.set(sc, sc, 1);
      p.s.material.rotation += p.rot * dt;
      const k = p.life / p.max;
      p.s.material.opacity = 0.75 * Math.min(1, k * 1.6) * Math.min(1, (1 - k) * 8);
      if (p.life <= 0) { p.s.removeFromParent(); p.s.material.dispose(); this.puffs.splice(i, 1); }
    }
  }
  dispose() { this.puffs.forEach((p) => p.s.material.dispose()); this.puffs = []; this.group.removeFromParent(); }
}
