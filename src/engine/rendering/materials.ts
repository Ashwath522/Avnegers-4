import * as THREE from 'three';
import type { CharacterDef } from '../characters/types';
import { muscleBump, panelBump, seamEmissive, wearRoughness } from './shapes';

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
      {
        const bump = panelBump(), rough = wearRoughness(), seams = seamEmissive();
        primary = new THREE.MeshPhysicalMaterial({ color: p.primary, metalness: 0.75, roughness: 0.32, roughnessMap: rough, bumpMap: bump, bumpScale: 3.5, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 1.5, emissive: p.energy, emissiveMap: seams, emissiveIntensity: 0.55 });
        primary.userData.baseEmissive = 0.55;
        secondary = new THREE.MeshStandardMaterial({ color: p.secondary, metalness: 0.9, roughness: 0.38, bumpMap: bump, bumpScale: 2, roughnessMap: rough });
        trim = new THREE.MeshPhysicalMaterial({ color: p.trim, metalness: 1, roughness: 0.2, clearcoat: 0.6, envMapIntensity: 1.7, bumpMap: bump, bumpScale: 1.5 });
      }
      break;
    case 'suit':
      primary = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: weaveTexture(p.primary, '#2a0a12'), metalness: 0.05, roughness: 0.5, sheen: 0.6, sheenColor: '#ff8090', sheenRoughness: 0.5 });
      secondary = new THREE.MeshStandardMaterial({ color: '#ffffff', map: weaveTexture(p.secondary, '#33407a'), metalness: 0.15, roughness: 0.5 });
      trim = new THREE.MeshStandardMaterial({ color: p.trim, metalness: 0.6, roughness: 0.3 });
      break;
    case 'skin': {
      const bump = muscleBump();
      primary = new THREE.MeshPhysicalMaterial({ color: p.primary, roughness: 0.6, metalness: 0.02, bumpMap: bump, bumpScale: 3, sheen: 0.12, sheenColor: '#7fd47a', sheenRoughness: 0.6, emissive: p.energy, emissiveIntensity: 0.04 });
      primary.userData.baseEmissive = 0.04;
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
