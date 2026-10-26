import * as THREE from 'three';
import type { Surface } from '../characters/types';

/**
 * Sculpted lathe profiles per surface type (unit height, centred, radius ≈ 1).
 * Replaces plain cylinders so limbs read as armour plates / muscle / sinew rather than tubes.
 */
const lathe = (pts: [number, number][], seg = 28) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);

const cache = new Map<string, THREE.BufferGeometry>();
const memo = (k: string, f: () => THREE.BufferGeometry) => { let g = cache.get(k); if (!g) { g = f(); cache.set(k, g); } return g; };

/** Limb segment: y = -0.5 proximal joint → +0.5 distal joint. */
export function limbGeometry(s: Surface, distal: boolean): THREE.BufferGeometry {
  return memo(`limb-${s}-${distal}`, () => {
    switch (s) {
      case 'metal': // overlapping armour bands with grooves between plates
        return lathe([[0, -0.5], [0.86, -0.5], [0.97, -0.44], [1.0, -0.3], [0.93, -0.27], [0.99, -0.24], [1.03, -0.05], [1.0, 0.1],
          [0.92, 0.13], [0.97, 0.16], [0.97, 0.32], [distal ? 0.86 : 0.9, 0.42], [distal ? 0.8 : 0.86, 0.5], [0, 0.5]]);
      case 'skin': { // muscle belly bulging toward the proximal third
        const p: [number, number][] = [[0, -0.5]];
        for (let i = 0; i <= 14; i++) { const t = i / 14; p.push([0.78 + 0.34 * Math.sin(Math.PI * Math.pow(t, 0.75)) - (distal ? 0.12 * t : 0), -0.5 + t]); }
        p.push([0, 0.5]); return lathe(p);
      }
      case 'organic': { // sinewy, slightly wavy
        const p: [number, number][] = [[0, -0.5]];
        for (let i = 0; i <= 18; i++) { const t = i / 18; p.push([0.84 + 0.12 * Math.sin(Math.PI * t) + 0.04 * Math.sin(t * 18), -0.5 + t]); }
        p.push([0, 0.5]); return lathe(p);
      }
      default: { // athletic suit: smooth taper
        const p: [number, number][] = [[0, -0.5]];
        for (let i = 0; i <= 12; i++) { const t = i / 12; p.push([0.92 + 0.12 * Math.sin(Math.PI * t * 0.9) - 0.16 * t, -0.5 + t]); }
        p.push([0, 0.5]); return lathe(p);
      }
    }
  });
}

/** Torso: y = -0.5 waist → +0.5 shoulders/neck, radius normalised to 0.5 at the chest. */
export function torsoGeometry(s: Surface): THREE.BufferGeometry {
  return memo(`torso-${s}`, () => {
    const chest = s === 'skin' ? 0.53 : 0.5, waist = s === 'skin' ? 0.42 : s === 'suit' ? 0.34 : 0.37;
    const p: [number, number][] = [[0, -0.5], [waist, -0.5], [waist * 0.97, -0.3], [waist * 1.04, -0.1], [chest * 0.92, 0.1], [chest, 0.25], [chest * 0.98, 0.36], [chest * 0.86, 0.44], [0.24, 0.5], [0, 0.5]];
    if (s === 'metal') p.splice(4, 0, [waist * 1.08, -0.02], [waist * 1.02, 0.0]); // waist plate seam
    return lathe(p, 36);
  });
}

/** Layered pauldron: three stacked shells. */
export function pauldronGeometries(): THREE.BufferGeometry[] {
  return [0, 1, 2].map((i) => memo(`paul-${i}`, () => new THREE.SphereGeometry(1 - i * 0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * (0.5 - i * 0.08))));
}

/* ------------------------------------------------------------- procedural surface maps */

function canvas(size = 512) { const c = document.createElement('canvas'); c.width = c.height = size; return { c, g: c.getContext('2d')! }; }

/** Bump map with panel grooves and rivets (white = raised). */
export function panelBump(): THREE.Texture {
  const { c, g } = canvas();
  g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#202020'; g.lineWidth = 4;
  const rows = [0, 90, 210, 300, 420, 512];
  for (let r = 0; r < rows.length - 1; r++) {
    g.beginPath(); g.moveTo(0, rows[r]); g.lineTo(512, rows[r]); g.stroke();
    let x = (r % 2) * 60;
    while (x < 512) {
      const w = 90 + Math.random() * 110;
      g.beginPath(); g.moveTo(x, rows[r]); g.lineTo(x + (Math.random() - 0.5) * 20, rows[r + 1]); g.stroke();
      // bevel highlight inside each panel
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 6, rows[r] + 6, w - 12, 6);
      g.fillStyle = '#d8d8d8';
      for (const yy of [rows[r] + 12, rows[r + 1] - 12]) for (const xx of [x + 12, x + w - 12]) { g.beginPath(); g.arc(xx, yy, 3.5, 0, 7); g.fill(); }
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Emissive map: a few thin energy seams following panel lines (original Apex signature). */
export function seamEmissive(): THREE.Texture {
  const { c, g } = canvas();
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.shadowColor = '#ffffff'; g.shadowBlur = 8;
  for (const y of [90, 300]) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  for (let k = 0; k < 4; k++) { const x = 60 + k * 120; g.beginPath(); g.moveTo(x, 210); g.lineTo(x, 300); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Roughness variation (scratches / wear) for metal. */
export function wearRoughness(): THREE.Texture {
  const { c, g } = canvas(256);
  g.fillStyle = '#4a4a4a'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(200,200,200,0.35)'; g.lineWidth = 1;
  for (let k = 0; k < 160; k++) { const x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * 6, l = 4 + Math.random() * 18; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Muscle striation bump for skin. */
export function muscleBump(): THREE.Texture {
  const { c, g } = canvas(256);
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 90; k++) {
    const x = Math.random() * 256; g.strokeStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},0.12)`; g.lineWidth = 2 + Math.random() * 4;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 20, 80, x - 20, 170, x + 10, 256); g.stroke();
  }
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 30; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
