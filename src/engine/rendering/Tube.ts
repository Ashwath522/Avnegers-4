import * as THREE from 'three';

/**
 * Pre-allocated tube mesh along a polyline in the screen plane. Used for web lines and tendrils;
 * updated every frame without allocating new geometry.
 */
export class Tube {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private nrm: Float32Array;
  constructor(readonly segments: number, readonly radial: number, material: THREE.Material) {
    const rings = segments + 1;
    this.pos = new Float32Array(rings * radial * 3);
    this.nrm = new Float32Array(rings * radial * 3);
    const idx: number[] = [];
    for (let s = 0; s < segments; s++) for (let r = 0; r < radial; r++) {
      const a = s * radial + r, b = s * radial + ((r + 1) % radial), c = (s + 1) * radial + r, d = (s + 1) * radial + ((r + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
  }

  /** points: segments+1 entries; radius(t) with t in 0..1 along the tube */
  update(points: { x: number; y: number; z?: number }[], radius: (t: number) => number) {
    const R = this.radial, n = this.segments;
    for (let s = 0; s <= n; s++) {
      const p = points[Math.min(s, points.length - 1)];
      const a = points[Math.max(0, s - 1)], b = points[Math.min(points.length - 1, s + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const nx = -ty, ny = tx; // in-plane normal; binormal = z
      const rad = radius(s / n);
      for (let r = 0; r < R; r++) {
        const ang = (r / R) * Math.PI * 2, c = Math.cos(ang), si = Math.sin(ang);
        const i = (s * R + r) * 3;
        this.nrm[i] = nx * c; this.nrm[i + 1] = ny * c; this.nrm[i + 2] = si;
        this.pos[i] = p.x + nx * c * rad; this.pos[i + 1] = p.y + ny * c * rad; this.pos[i + 2] = (p.z ?? 0) + si * rad;
      }
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    g.computeBoundingSphere();
  }

  dispose() { this.mesh.geometry.dispose(); }
}
