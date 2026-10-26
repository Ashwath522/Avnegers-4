import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { BodyFrame, P3 } from '../tracking/types';
import type { Particles } from './Particles';

/**
 * Drives a rigged humanoid GLB/glTF (Mixamo, VRM-style, or Unreal/Blender "_l/_r" naming) from
 * tracked landmarks. Each frame the skeleton is reset to its bind pose, the torso is aligned
 * (up + shoulder line), then every limb bone is aimed at its tracked child joint. Bone lengths
 * from the model are used to recover depth (foreshortening) instead of stretching limbs.
 */

type Slot = 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'lUpperArm' | 'lForearm' | 'lHand' | 'rUpperArm' | 'rForearm' | 'rHand'
  | 'lThigh' | 'lShin' | 'lFoot' | 'rThigh' | 'rShin' | 'rFoot' | 'lMiddle' | 'rMiddle' | 'lToe' | 'rToe';

const norm = (s: string) => s.toLowerCase().replace(/^mixamorig\d*[:_]?/, '').replace(/[\s_:.\-]/g, '');

// Patterns over normalised names. Side handled by l/left and r/right prefixes or suffixes.
const SIDE = (side: 'l' | 'r', parts: string[]) => {
  const w = side === 'l' ? 'left' : 'right';
  return parts.flatMap((p) => [`${w}${p}`, `${p}${side}`, `${side}${p}`, `${p}${w}`]);
};
const PATTERNS: Record<Slot, string[]> = {
  hips: ['hips', 'pelvis', 'hip'],
  spine: ['spine', 'spine01', 'spine1'],
  chest: ['spine2', 'upperchest', 'chest', 'spine03', 'spine1'],
  neck: ['neck', 'neck01'],
  head: ['head'],
  lUpperArm: SIDE('l', ['arm', 'upperarm']), rUpperArm: SIDE('r', ['arm', 'upperarm']),
  lForearm: SIDE('l', ['forearm', 'lowerarm']), rForearm: SIDE('r', ['forearm', 'lowerarm']),
  lHand: SIDE('l', ['hand']), rHand: SIDE('r', ['hand']),
  lMiddle: SIDE('l', ['handmiddle1', 'middle1', 'middleproximal', 'middle01']), rMiddle: SIDE('r', ['handmiddle1', 'middle1', 'middleproximal', 'middle01']),
  lThigh: SIDE('l', ['upleg', 'thigh', 'upperleg']), rThigh: SIDE('r', ['upleg', 'thigh', 'upperleg']),
  lShin: SIDE('l', ['leg', 'calf', 'lowerleg', 'shin']), rShin: SIDE('r', ['leg', 'calf', 'lowerleg', 'shin']),
  lFoot: SIDE('l', ['foot']), rFoot: SIDE('r', ['foot']),
  lToe: SIDE('l', ['toebase', 'toes', 'ball', 'toe']), rToe: SIDE('r', ['toebase', 'toes', 'ball', 'toe']),
};

export function resolveBones(names: string[]): Partial<Record<Slot, string>> {
  const out: Partial<Record<Slot, string>> = {};
  const byNorm = new Map(names.map((n) => [norm(n), n]));
  for (const slot of Object.keys(PATTERNS) as Slot[]) {
    for (const p of PATTERNS[slot]) { const hit = byNorm.get(p); if (hit && !Object.values(out).includes(hit)) { out[slot] = hit; break; } }
  }
  return out;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

export class ModelRig {
  readonly root = new THREE.Group();
  private bones: Partial<Record<Slot, THREE.Bone>> = {};
  private rest = new Map<THREE.Object3D, THREE.Quaternion>();
  private restTorso = 1;
  private hipsRest = new THREE.Vector3();
  private clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  private scanLine: THREE.Mesh;
  private mats: THREE.Material[] = [];
  missing: Slot[] = [];
  progress = 1;

  private constructor(model: THREE.Object3D, private particles: Particles) {
    this.root.add(model);
    const names: string[] = [];
    model.traverse((o) => { if ((o as THREE.Bone).isBone) names.push(o.name); });
    const map = resolveBones(names);
    for (const [slot, name] of Object.entries(map)) this.bones[slot as Slot] = model.getObjectByName(name!) as THREE.Bone;
    const required: Slot[] = ['hips', 'lUpperArm', 'lForearm', 'rUpperArm', 'rForearm', 'lThigh', 'lShin', 'rThigh', 'rShin', 'head'];
    this.missing = required.filter((s) => !this.bones[s]);
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.rest.set(o, o.quaternion.clone());
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = list.map((m) => { const c = m.clone(); c.clippingPlanes = [this.clipPlane]; c.clipShadows = true; this.mats.push(c); return c; });
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
      }
    });
    // face the camera (+z): the model's left arm must be on +x
    model.updateMatrixWorld(true);
    const L = this.bones.lUpperArm, R = this.bones.rUpperArm;
    if (L && R && L.getWorldPosition(_a).x < R.getWorldPosition(_b).x) model.rotation.y += Math.PI;
    model.updateMatrixWorld(true);
    const H = this.bones.hips, N = this.bones.neck ?? this.bones.head;
    if (H && N) { this.restTorso = H.getWorldPosition(_a).distanceTo(N.getWorldPosition(_b)) || 1; this.hipsRest.copy(_a); }
    this.scanLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scanLine.renderOrder = 40;
    this.root.add(this.scanLine);
  }

  static async load(url: string, particles: Particles): Promise<ModelRig | null> {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      const ct = head.headers.get('content-type') ?? '';
      if (!head.ok || ct.includes('text/html')) return null;

      const lower = url.toLowerCase();
      let scene: THREE.Object3D;
      if (lower.endsWith('.fbx')) {
        scene = await new FBXLoader().loadAsync(url);
      } else {
        const gltf = await new GLTFLoader().loadAsync(url);
        scene = gltf.scene;
      }

      // Mixamo units are often cm — normalize height ~1.7m
      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 50 || (maxDim > 0 && maxDim < 0.1)) {
        scene.scale.multiplyScalar(1.7 / maxDim);
        scene.updateMatrixWorld(true);
      }

      const rig = new ModelRig(scene, particles);
      if (rig.missing.length) console.warn(`[model] ${url}: could not find bones for ${rig.missing.join(', ')}`);
      else console.info(`[model] loaded ${url}`);
      return rig;
    } catch (e) {
      console.warn(`[model] failed to load ${url}`, e);
      return null;
    }
  }

  setEnergyColor(c: string) { (this.scanLine.material as THREE.MeshBasicMaterial).color.set(c); }

  /**
   * Paint the loaded mesh with character palette so Mixamo X Bot reads as Iron Man / hero suit.
   * Primary = armor body, trim = gold accents, energy = glowing core/eyes.
   */
  applyPalette(palette: { primary: string; secondary: string; trim: string; energy: string; eyes: string }, style: 'metal' | 'suit' | 'skin' | 'organic' = 'metal') {
    const primary = new THREE.MeshPhysicalMaterial({
      color: palette.primary,
      metalness: style === 'metal' ? 0.92 : style === 'organic' ? 0.25 : 0.15,
      roughness: style === 'metal' ? 0.28 : style === 'organic' ? 0.15 : 0.45,
      clearcoat: style === 'metal' || style === 'organic' ? 0.9 : 0.2,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.8,
    });
    const trim = new THREE.MeshPhysicalMaterial({
      color: palette.trim,
      metalness: 1,
      roughness: 0.15,
      clearcoat: 0.85,
      envMapIntensity: 2.0,
    });
    const secondary = new THREE.MeshStandardMaterial({
      color: palette.secondary,
      metalness: style === 'metal' ? 0.9 : 0.2,
      roughness: 0.35,
    });
    const energy = new THREE.MeshBasicMaterial({ color: palette.energy, toneMapped: false });
    const eyes = new THREE.MeshBasicMaterial({ color: palette.eyes, toneMapped: false });
    this.mats.push(primary, trim, secondary, energy, eyes);

    // Collect meshes and assign by height bands (feet→head) + name hints
    const meshes: THREE.Mesh[] = [];
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
    if (!meshes.length) return;

    const worldBox = new THREE.Box3().setFromObject(this.root);
    const minY = worldBox.min.y;
    const spanY = Math.max(1e-3, worldBox.max.y - worldBox.min.y);

    for (const mesh of meshes) {
      const mb = new THREE.Box3().setFromObject(mesh);
      const cy = (mb.min.y + mb.max.y) * 0.5;
      const t = (cy - minY) / spanY; // 0 feet → 1 head
      const name = (mesh.name || mesh.parent?.name || '').toLowerCase();

      let mat: THREE.Material = primary;
      // Head / face / eyes
      if (/head|face|eye|helmet|skull|visor/.test(name) || t > 0.88) {
        mat = /eye|visor|lens/.test(name) ? eyes : primary;
      } else if (/hand|finger|glove|wrist/.test(name)) {
        mat = primary;
      } else if (/boot|foot|shoe|toe/.test(name) || t < 0.12) {
        mat = trim; // gold boots
      } else if (/shoulder|clavicle|arm|forearm|elbow|leg|thigh|calf|knee|shin|spine|chest|torso|pelvis|hip|body|mesh/.test(name)) {
        // alternate some panels to gold for armor plate read
        const useGold = /shoulder|knee|elbow|belt|collar|pelvis/.test(name) || (Math.abs(hash(name)) % 5 === 0);
        mat = useGold ? trim : primary;
      } else {
        mat = t > 0.75 ? primary : t < 0.15 ? trim : primary;
      }

      // Keep clipping plane from constructor
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clip = list[0] && (list[0] as THREE.Material).clippingPlanes;
      const applied = mat.clone();
      if (clip) {
        applied.clippingPlanes = clip;
        applied.clipShadows = true;
      }
      this.mats.push(applied);
      mesh.material = applied;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    // Attach a simple arc-reactor glow on the chest (hips→shoulders midpoint)
    this.attachReactorGlow(palette.energy);
  }

  private attachReactorGlow(energyColor: string) {
    const chest = this.bones.chest || this.bones.spine || this.bones.hips;
    if (!chest) return;
    // Remove old if any
    const old = this.root.getObjectByName('__arcReactor');
    if (old) old.removeFromParent();

    const group = new THREE.Group();
    group.name = '__arcReactor';
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.012, 12, 32),
      new THREE.MeshPhysicalMaterial({ color: '#d9a441', metalness: 1, roughness: 0.2 }),
    );
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 32),
      new THREE.MeshBasicMaterial({ color: energyColor, toneMapped: false }),
    );
    core.position.z = 0.01;
    const glowMat = new THREE.SpriteMaterial({
      color: energyColor,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.25);
    glow.position.z = 0.05;
    group.add(ring, core, glow);
    // Offset forward from chest bone
    group.position.set(0, 0.12, 0.12);
    chest.add(group);
    this.mats.push(ring.material as THREE.Material, core.material as THREE.Material, glowMat);
  }

  /** Rotate `bone` (world space) so its rest direction toward `child` points along `desired`. */
  private aim(bone: THREE.Object3D | undefined, child: THREE.Object3D | undefined, from: P3, to: P3, scale: number) {
    if (!bone || !child || !bone.parent) return;
    bone.getWorldPosition(_a); child.getWorldPosition(_b);
    const cur = _b.sub(_a); const len = cur.length(); if (len < 1e-6) return; cur.divideScalar(len);
    const dx = to.x - from.x, dy = to.y - from.y, l2 = Math.hypot(dx, dy);
    const boneLen = len; // world length already includes model scale
    let dz = 0;
    if (l2 < boneLen * 0.98) {
      const mag = Math.sqrt(boneLen * boneLen - l2 * l2);
      const zd = to.z - from.z;
      dz = (Math.abs(zd) > boneLen * 0.15 ? Math.sign(zd) : 1) * mag; // ambiguous → toward camera
    }
    _d.set(dx, dy, dz).normalize();
    _q.setFromUnitVectors(cur, _d);
    bone.getWorldQuaternion(_wq);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq)));
    bone.updateMatrixWorld(true);
    void scale;
  }

  update(f: BodyFrame | null, mirror: boolean, t: number) {
    if (!f || !f.hasPose || f.shoulderWidth < 8) { this.root.visible = false; return; }
    this.root.visible = this.progress > 0.001;
    if (!this.root.visible) return;
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    const j = f.joints;
    const shMid = { x: (j.lShoulder.x + j.rShoulder.x) / 2, y: (j.lShoulder.y + j.rShoulder.y) / 2, z: (j.lShoulder.z + j.rShoulder.z) / 2, v: 1 };
    const hipMid = { x: (j.lHip.x + j.rHip.x) / 2, y: (j.lHip.y + j.rHip.y) / 2, z: (j.lHip.z + j.rHip.z) / 2, v: 1 };
    // scale so the model's torso matches the tracked torso
    const torso = Math.hypot(shMid.x - hipMid.x, shMid.y - hipMid.y);
    const s = Math.max(1e-3, (torso * 1.05) / this.restTorso);
    this.root.scale.setScalar(s);
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.root.updateMatrixWorld(true);
    // whole-body orientation: up = hips→shoulders, side = right shoulder→left shoulder (screen space)
    const screenLeft = j.lShoulder.x > j.rShoulder.x ? 'l' : 'r'; // which tracked side sits at +x
    const sL = screenLeft === 'l' ? j.lShoulder : j.rShoulder, sR = screenLeft === 'l' ? j.rShoulder : j.lShoulder;
    const up = new THREE.Vector3(shMid.x - hipMid.x, shMid.y - hipMid.y, 0).normalize();
    const side = new THREE.Vector3(sL.x - sR.x, sL.y - sR.y, (sL.z - sR.z) * 0.5).normalize();
    const fwd = new THREE.Vector3().crossVectors(side, up).normalize();
    const side2 = new THREE.Vector3().crossVectors(up, fwd).normalize();
    _m.makeBasis(side2, up, fwd);
    this.root.quaternion.setFromRotationMatrix(_m);
    this.root.updateMatrixWorld(true);
    // position hips on the tracked hip midpoint
    const H = this.bones.hips;
    if (H) { H.getWorldPosition(_a); this.root.position.set(hipMid.x - _a.x, hipMid.y - _a.y, 0); this.root.updateMatrixWorld(true); }
    void _m2; void mirror;

    // model's +x side limbs follow whichever tracked arm/leg appears at +x on screen
    const P = (k: 'Shoulder' | 'Elbow' | 'Wrist' | 'Hip' | 'Knee' | 'Ankle' | 'Foot' | 'Index' | 'Pinky', modelSide: 'l' | 'r') => {
      const tracked = modelSide === 'l' ? screenLeft : (screenLeft === 'l' ? 'r' : 'l');
      return (j as any)[`${tracked}${k}`] as P3;
    };
    const B = this.bones;
    const headTarget = { x: (j.lEar.x + j.rEar.x) / 2 * 0.5 + j.nose.x * 0.5, y: Math.max(j.lEar.y, j.rEar.y, j.nose.y) + f.shoulderWidth * 0.15, z: shMid.z, v: 1 };
    this.aim(B.neck ?? B.chest, B.head, shMid, headTarget, s);
    for (const side of ['l', 'r'] as const) {
      const up_ = side === 'l' ? B.lUpperArm : B.rUpperArm, fa = side === 'l' ? B.lForearm : B.rForearm, hand = side === 'l' ? B.lHand : B.rHand, mid = side === 'l' ? B.lMiddle : B.rMiddle;
      this.aim(up_, fa, P('Shoulder', side), P('Elbow', side), s);
      this.aim(fa, hand, P('Elbow', side), P('Wrist', side), s);
      const w = P('Wrist', side), I = P('Index', side), Pk = P('Pinky', side);
      this.aim(hand, mid, w, { x: (I.x + Pk.x) / 2, y: (I.y + Pk.y) / 2, z: w.z, v: 1 }, s);
      const th = side === 'l' ? B.lThigh : B.rThigh, sh = side === 'l' ? B.lShin : B.rShin, ft = side === 'l' ? B.lFoot : B.rFoot, toe = side === 'l' ? B.lToe : B.rToe;
      if (P('Knee', side).v > 0.4 || f.simulated) {
        this.aim(th, sh, P('Hip', side), P('Knee', side), s);
        if (P('Ankle', side).v > 0.4 || f.simulated) {
          this.aim(sh, ft, P('Knee', side), P('Ankle', side), s);
          this.aim(ft, toe, P('Ankle', side), { ...P('Foot', side), z: P('Ankle', side).z + f.shoulderWidth * 0.3 }, s);
        }
      }
    }
    // materialize: scan plane sweeping up from the feet
    const feetY = Math.min(j.lAnkle.y, j.rAnkle.y) - f.shoulderWidth * 0.3;
    const topY = Math.max(j.nose.y, j.lEar.y) + f.shoulderWidth * 0.6;
    const clipY = this.progress >= 1 ? 1e6 : feetY + (topY - feetY) * this.progress;
    this.clipPlane.constant = clipY;
    this.scanLine.visible = this.progress < 1;
    if (this.scanLine.visible) {
      // scanLine is a child of root: place in world via inverse root transform
      const wPos = new THREE.Vector3(hipMid.x, clipY, 800);
      this.root.worldToLocal(wPos);
      this.scanLine.position.copy(wPos);
      this.scanLine.quaternion.copy(this.root.quaternion).invert();
      this.scanLine.scale.set(f.shoulderWidth * 3 / s, 3 / s, 1);
      if (Math.random() < 0.6) this.particles.emit({ x: hipMid.x + (Math.random() - 0.5) * f.shoulderWidth * 2.5, y: clipY, count: 3, color: (this.scanLine.material as THREE.MeshBasicMaterial).color, speed: 60, size: 8, life: 0.5, dir: { x: 0, y: 1 }, spread: 0.6 });
    }
    void t;
  }

  dispose() {
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.mats.forEach((m) => m.dispose());
    this.root.removeFromParent();
  }
}
