import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Transparent Three.js layer drawn over the webcam video. Uses an orthographic camera in
 * pixel units (y-up) so tracked landmarks map 1:1 to world coordinates.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly root = new THREE.Group(); // shaken for screen-shake
  W = 1; H = 1;
  private shake = 0;
  shakeEnabled = true;
  private ro: ResizeObserver;

  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.localClippingEnabled = true; // used by the model materialize scan
    this.renderer.domElement.className = 'stage-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -20000, 20000);
    this.camera.position.set(0, 0, 5000);
    this.scene.add(this.root);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-0.5, 1, 1.2);
    const rim = new THREE.DirectionalLight(0x66ccff, 1.4); rim.position.set(1, 0.3, -0.4);
    const fill = new THREE.HemisphereLight(0xbfd8ff, 0x201810, 0.6);
    this.scene.add(key, rim, fill);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.renderer.setSize(this.W, this.H, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.left = 0; this.camera.right = this.W; this.camera.top = this.H; this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
  }

  addShake(amount: number) { if (this.shakeEnabled) this.shake = Math.min(40, this.shake + amount); }

  render(dt: number) {
    if (this.shake > 0.1) {
      this.root.position.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0);
      this.shake *= Math.exp(-dt * 9);
    } else this.root.position.set(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

let glowTex: THREE.Texture | null = null;
/** Shared radial-gradient texture for additive glow sprites (cheap bloom substitute that keeps the video visible). */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function makeGlow(color: string | number, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.set(size, size, 1);
  s.renderOrder = 10;
  return s;
}
