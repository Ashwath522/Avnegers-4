import * as THREE from 'three';
import type { CharacterDef } from '../characters/types';

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Original geometric "tech-weave" pattern for Webrunner — triangular lattice, not a classic web motif. */
function weaveTexture(base: string, line: string) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    g.strokeStyle = line; g.globalAlpha = 0.55; g.lineWidth = 2;
    const step = s / 6;
    for (let i = -6; i <= 12; i++) {
      g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step + s * 0.58, s); g.stroke();
      g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step - s * 0.58, s); g.stroke();
    }
    g.globalAlpha = 0.25; g.lineWidth = 1;
    for (let y = 0; y < s; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  }, 2);
}

function noiseTexture(seedColor: string, amp: number) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = seedColor; g.fillRect(0, 0, s, s);
    const img = g.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * amp;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  }, 3);
}

function veinTexture() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.globalAlpha = 0.8;
    for (let k = 0; k < 14; k++) {
      let x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 12; j++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 26; g.lineTo(x, y); }
      g.stroke();
    }
  }, 1.5);
}

export interface SuitMaterials {
  primary: THREE.MeshStandardMaterial;
  secondary: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  energy: THREE.MeshBasicMaterial;
  eyes: THREE.MeshBasicMaterial;
}

export function createSuitMaterials(c: CharacterDef): SuitMaterials {
  const p = c.palette;
  let primary: THREE.MeshStandardMaterial, secondary: THREE.MeshStandardMaterial, trim: THREE.MeshStandardMaterial;
  switch (c.surface) {
    case 'metal':
      primary = new THREE.MeshStandardMaterial({ color: p.primary, metalness: 0.85, roughness: 0.27, envMapIntensity: 1.4 });
      secondary = new THREE.MeshStandardMaterial({ color: p.secondary, metalness: 0.9, roughness: 0.4 });
      trim = new THREE.MeshStandardMaterial({ color: p.trim, metalness: 1, roughness: 0.22, envMapIntensity: 1.6 });
      break;
    case 'suit':
      primary = new THREE.MeshStandardMaterial({ color: '#ffffff', map: weaveTexture(p.primary, '#2a0a12'), metalness: 0.1, roughness: 0.55 });
      secondary = new THREE.MeshStandardMaterial({ color: '#ffffff', map: weaveTexture(p.secondary, '#33407a'), metalness: 0.15, roughness: 0.5 });
      trim = new THREE.MeshStandardMaterial({ color: p.trim, metalness: 0.6, roughness: 0.3 });
      break;
    case 'skin': {
      const bump = noiseTexture('#808080', 60);
      primary = new THREE.MeshStandardMaterial({ color: p.primary, roughness: 0.62, metalness: 0.05, bumpMap: bump, bumpScale: 2 });
      secondary = new THREE.MeshStandardMaterial({ color: p.secondary, roughness: 0.9, map: noiseTexture('#9a948c', 40) });
      trim = new THREE.MeshStandardMaterial({ color: p.trim, roughness: 0.8 });
      break;
    }
    case 'organic': {
      const phys = new THREE.MeshPhysicalMaterial({ color: p.primary, metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, emissive: p.energy, emissiveMap: veinTexture(), emissiveIntensity: 0.35 });
      primary = phys;
      secondary = new THREE.MeshPhysicalMaterial({ color: p.secondary, metalness: 0.2, roughness: 0.2, clearcoat: 1 });
      trim = new THREE.MeshPhysicalMaterial({ color: p.trim, metalness: 0.3, roughness: 0.18, clearcoat: 1 });
      break;
    }
  }
  return {
    primary, secondary, trim,
    energy: new THREE.MeshBasicMaterial({ color: p.energy, toneMapped: false }),
    eyes: new THREE.MeshBasicMaterial({ color: p.eyes, toneMapped: false }),
  };
}
