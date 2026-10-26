import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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

export class ModelRig {
  readonly root = new THREE.Group();
  private bones: Partial<Record<Slot, THREE.Bone>> = {};
  private rest = new Map<THREE.Object3D, THREE.Quaternion>();
  private restTorso = 1;
  private hipsRest = new THREE.Vector3();
  private clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  private scanLine: THREE.Mesh;
  private mats: THREE.Material[] = [];
  private faceplatePivot: THREE.Group | null = null;
  private faceplateClosed = 1;
  private reactorGlow: THREE.Sprite | null = null;
  missing: Slot[] = [];
  progress = 1;

  /** 0 = open (raised about 110 degrees at the brow hinge), 1 = sealed. */
  private setFaceplateClosed(closed: number) {
    this.faceplateClosed = THREE.MathUtils.clamp(closed, 0, 1);
    if (this.faceplatePivot) this.faceplatePivot.rotation.x = -(1 - this.faceplateClosed) * THREE.MathUtils.degToRad(110);
  }

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
   * Mark III–style Iron Man armor on Mixamo skeleton.
   * CRITICAL: plate sizes use inverse world-scale of each bone so they stay
   * human-sized whether the FBX was in cm or meters.
   */
  applyIronManKit(palette: { primary: string; secondary: string; trim: string; energy: string; eyes: string }) {
    const red = new THREE.MeshPhysicalMaterial({
      color: palette.primary, metalness: 0.95, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 2.5,
    });
    const gold = new THREE.MeshPhysicalMaterial({
      color: palette.trim, metalness: 1, roughness: 0.1, clearcoat: 0.95, clearcoatRoughness: 0.05, envMapIntensity: 2.8,
    });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2d33', metalness: 0.9, roughness: 0.4 });
    const energyMat = new THREE.MeshBasicMaterial({ color: palette.energy, toneMapped: false });
    const eyeMat = new THREE.MeshBasicMaterial({ color: palette.eyes, toneMapped: false });
    this.mats.push(red, gold, dark, energyMat, eyeMat);

    // Paint base mesh deep red metal (not black) so body never looks empty
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const imported = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // Preserve authored armor/texture materials from a future licensed GLB. The supplied
      // X Bot has no maps, so it still receives the deep-red base below.
      if (imported.some((m) => 'map' in m && !!(m as THREE.MeshStandardMaterial).map)) return;
      const m = red.clone();
      m.clippingPlanes = [this.clipPlane];
      m.metalness = 0.9; m.roughness = 0.35;
      mesh.material = m;
      mesh.castShadow = true;
    });

    this.root.updateMatrixWorld(true);
    const _ws = new THREE.Vector3();
    /** Local size so that `meters` becomes that many metres in world space under this bone. */
    const U = (bone: THREE.Object3D | undefined, meters: number) => {
      if (!bone) return meters;
      bone.getWorldScale(_ws);
      const s = Math.max(_ws.x, _ws.y, _ws.z, 1e-6);
      return meters / s;
    };
    const B = (s: Slot) => this.bones[s];
    const attach = (parent: THREE.Object3D | undefined, child: THREE.Object3D, x = 0, y = 0, z = 0) => {
      if (!parent) return;
      child.position.set(x, y, z);
      parent.add(child);
    };
    const box = (w: number, h: number, d: number, mat: THREE.Material, bevel = 0.12) => {
      const radius = Math.min(w, h, d) * bevel;
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.max(radius, 1e-5)), mat);
      m.castShadow = true; return m;
    };
    const sph = (r: number, mat: THREE.Material, ws = 24, hs = 16) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat); m.castShadow = true; return m;
    };
    const cyl = (a: number, b: number, h: number, mat: THREE.Material, seg = 18) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(a, b, h, seg), mat); m.castShadow = true; return m;
    };
    const dome = (r: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
      m.castShadow = true; return m;
    };

    // ---- HELMET (Mark-style) with animating faceplate ----
    {
      const head = B('head');
      if (head) {
        const u = (m: number) => U(head, m);
        const H = new THREE.Group(); H.name = '__mkHelmet';
        // Red outer shell (rear + top always visible)
        const shell = sph(u(0.12), red, 28, 20);
        shell.scale.set(1.05, 1.15, 1.0);
        H.add(shell);
        const crown = dome(u(0.125), red);
        crown.scale.set(1.1, 0.65, 1.0);
        crown.position.y = u(0.05);
        H.add(crown);
        // Cheeks / jaw base (stay fixed)
        for (const sx of [-1, 1] as const) {
          const cheek = box(u(0.05), u(0.11), u(0.09), red);
          cheek.position.set(sx * u(0.11), u(-0.02), u(0.03));
          H.add(cheek);
        }
        const jaw = box(u(0.14), u(0.055), u(0.1), red);
        jaw.position.set(0, u(-0.09), u(0.05));
        H.add(jaw);
        const chin = box(u(0.06), u(0.035), u(0.055), gold);
        chin.position.set(0, u(-0.12), u(0.07));
        H.add(chin);

        // FACEPLATE PIVOT — rotates open/closed around brow hinge (classic Iron Man)
        const pivot = new THREE.Group();
        pivot.name = '__mkFaceplate';
        // hinge near brow
        pivot.position.set(0, u(0.05), u(0.05));
        const faceRoot = new THREE.Group();
        faceRoot.position.set(0, u(-0.05), u(0.05)); // offset so plate covers face when closed
        // Gold faceplate
        const face = box(u(0.15), u(0.17), u(0.04), gold);
        face.position.set(0, 0, u(0.06));
        faceRoot.add(face);
        const faceTop = sph(u(0.08), gold, 16, 12);
        faceTop.scale.set(0.95, 0.65, 0.4);
        faceTop.position.set(0, u(0.05), u(0.04));
        faceRoot.add(faceTop);
        // Brow on plate
        const brow = box(u(0.16), u(0.025), u(0.04), red);
        brow.position.set(0, u(0.06), u(0.075));
        faceRoot.add(brow);
        // Narrow eye slits (not huge white blocks)
        for (const sx of [-1, 1] as const) {
          const socket = box(u(0.05), u(0.018), u(0.012), dark);
          socket.position.set(sx * u(0.04), u(0.02), u(0.08));
          socket.rotation.z = sx * -0.15;
          faceRoot.add(socket);
          const eye = box(u(0.042), u(0.01), u(0.008), eyeMat);
          eye.position.set(sx * u(0.04), u(0.02), u(0.086));
          eye.rotation.z = sx * -0.15;
          faceRoot.add(eye);
        }
        // Mouth vents
        for (let i = -1; i <= 1; i++) {
          const v = box(u(0.016), u(0.03), u(0.01), dark);
          v.position.set(i * u(0.025), u(-0.05), u(0.08));
          faceRoot.add(v);
        }
        pivot.add(faceRoot);
        H.add(pivot);
        this.faceplatePivot = pivot;
        // Start closed if suit already complete; open if materializing
        this.setFaceplateClosed(this.faceplateClosed);

        attach(head, H, 0, U(head, 0.06), 0);
      }
    }

    // ---- CHEST + REACTOR ----
    {
      const chest = B('chest') || B('spine') || B('hips');
      if (chest) {
        const u = (m: number) => U(chest, m);
        const T = new THREE.Group(); T.name = '__mkTorso';
        for (const sx of [-1, 1] as const) {
          const pec = box(u(0.12), u(0.11), u(0.07), red);
          pec.position.set(sx * u(0.09), u(0.1), u(0.12));
          pec.rotation.z = sx * -0.1;
          T.add(pec);
          const gt = box(u(0.09), u(0.025), u(0.035), gold);
          gt.position.set(sx * u(0.085), u(0.04), u(0.14));
          T.add(gt);
        }
        for (let row = 0; row < 3; row++) {
          for (const sx of [-1, 1] as const) {
            const ab = box(u(0.08), u(0.05), u(0.05), red);
            ab.position.set(sx * u(0.07), u(-0.02 - row * 0.06), u(0.12));
            T.add(ab);
          }
        }
        const sternum = box(u(0.03), u(0.24), u(0.03), gold);
        sternum.position.set(0, u(0.03), u(0.145));
        T.add(sternum);
        const collar = box(u(0.26), u(0.04), u(0.11), gold);
        collar.position.set(0, u(0.2), u(0.06));
        T.add(collar);
        for (const sx of [-1, 1] as const) {
          const side = box(u(0.04), u(0.24), u(0.1), red);
          side.position.set(sx * u(0.16), u(0.02), u(0.06));
          T.add(side);
        }
        const back = box(u(0.24), u(0.3), u(0.05), red);
        back.position.set(0, u(0.04), u(-0.12));
        T.add(back);

        // Arc reactor — center of chest, controlled glow (not face-sized)
        const R = new THREE.Group();
        R.name = '__mkReactor';
        const house = cyl(u(0.055), u(0.06), u(0.025), gold, 40);
        house.rotation.x = Math.PI / 2;
        R.add(house);
        for (const [rad, tube, mat] of [[0.05, 0.006, gold], [0.036, 0.004, dark], [0.024, 0.003, gold]] as const) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(u(rad), u(tube), 10, 36), mat);
          ring.position.z = u(0.012);
          R.add(ring);
        }
        for (let i = 0; i < 8; i++) {
          const spoke = box(u(0.03), u(0.006), u(0.004), dark);
          const a = (i / 8) * Math.PI * 2;
          spoke.position.set(Math.cos(a) * u(0.03), Math.sin(a) * u(0.03), u(0.012));
          spoke.rotation.z = a;
          R.add(spoke);
        }
        const core = new THREE.Mesh(new THREE.CircleGeometry(u(0.02), 28), energyMat);
        core.position.z = u(0.016);
        R.add(core);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          color: palette.energy, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        // Small glow — previous version washed out the whole torso/face
        glow.scale.setScalar(u(0.12));
        glow.position.z = u(0.04);
        R.add(glow);
        this.reactorGlow = glow;
        // Place on sternum / mid-chest (Mark III reference)
        R.position.set(0, u(0.06), u(0.15));
        T.add(R);



        attach(chest, T, 0, U(chest, 0.02), 0);
      }
    }

    // ---- PAULDRONS ----
    for (const side of ['l', 'r'] as const) {
      const arm = B(side === 'l' ? 'lUpperArm' : 'rUpperArm');
      if (!arm) continue;
      const u = (m: number) => U(arm, m);
      const P = new THREE.Group();
      const main = dome(u(0.11), red);
      main.scale.set(1.25, 0.95, 1.2);
      main.rotation.z = side === 'l' ? 0.45 : -0.45;
      main.rotation.x = 0.15;
      P.add(main);
      const rim = cyl(u(0.11), u(0.11), u(0.025), gold, 20);
      rim.position.y = u(-0.03);
      P.add(rim);
      const layer = dome(u(0.1), gold);
      layer.scale.set(1.1, 0.6, 1.0);
      layer.position.y = u(-0.04);
      layer.rotation.z = side === 'l' ? 0.45 : -0.45;
      P.add(layer);
      attach(arm, P, side === 'l' ? U(arm, -0.03) : U(arm, 0.03), U(arm, 0.1), U(arm, 0.02));
    }

    // ---- UPPER ARMS / FOREARMS / HANDS ----
    for (const side of ['l', 'r'] as const) {
      const up = B(side === 'l' ? 'lUpperArm' : 'rUpperArm');
      const fo = B(side === 'l' ? 'lForearm' : 'rForearm');
      const hd = B(side === 'l' ? 'lHand' : 'rHand');
      if (up) {
        const u = (m: number) => U(up, m);
        const G = new THREE.Group();
        G.add(cyl(u(0.06), u(0.055), u(0.22), red, 16));
        G.children[0].position.y = u(0.12);
        for (const y of [0.05, 0.15, 0.22]) {
          const band = cyl(u(0.063), u(0.063), u(0.02), gold, 16);
          band.position.y = u(y);
          G.add(band);
        }
        attach(up, G, 0, 0, 0);
      }
      if (fo) {
        const u = (m: number) => U(fo, m);
        const G = new THREE.Group();
        const plate = cyl(u(0.05), u(0.045), u(0.22), red, 16);
        plate.position.y = u(0.11);
        G.add(plate);
        const ridge = box(u(0.035), u(0.18), u(0.025), gold);
        ridge.position.set(0, u(0.11), u(0.045));
        G.add(ridge);
        const cuff = cyl(u(0.052), u(0.052), u(0.03), gold, 16);
        cuff.position.y = 0;
        G.add(cuff);
        attach(fo, G, 0, 0, 0);
      }
      if (hd) {
        const u = (m: number) => U(hd, m);
        const G = new THREE.Group();
        G.add(box(u(0.08), u(0.1), u(0.04), red));
        G.children[0].position.set(0, u(0.05), u(0.015));
        const kn = box(u(0.085), u(0.025), u(0.035), gold);
        kn.position.set(0, u(0.1), u(0.02));
        G.add(kn);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(u(0.025), 20), energyMat);
        disc.position.set(0, u(0.05), u(0.04));
        G.add(disc);
        const g = new THREE.Sprite(new THREE.SpriteMaterial({
          color: palette.energy, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        g.scale.setScalar(u(0.1));
        g.position.set(0, u(0.05), u(0.06));
        G.add(g);
        attach(hd, G, 0, 0, 0);
      }
    }

    // ---- LEGS ----
    for (const side of ['l', 'r'] as const) {
      const th = B(side === 'l' ? 'lThigh' : 'rThigh');
      const sh = B(side === 'l' ? 'lShin' : 'rShin');
      const ft = B(side === 'l' ? 'lFoot' : 'rFoot');
      if (th) {
        const u = (m: number) => U(th, m);
        const G = new THREE.Group();
        const plate = cyl(u(0.08), u(0.07), u(0.3), red, 16);
        plate.position.y = u(0.15);
        G.add(plate);
        const ridge = box(u(0.045), u(0.24), u(0.035), gold);
        ridge.position.set(0, u(0.15), u(0.065));
        G.add(ridge);
        attach(th, G, 0, 0, 0);
      }
      if (sh) {
        const u = (m: number) => U(sh, m);
        const G = new THREE.Group();
        const plate = cyl(u(0.065), u(0.055), u(0.28), red, 16);
        plate.position.y = u(0.14);
        G.add(plate);
        const knee = sph(u(0.06), gold, 14, 12);
        G.add(knee);
        const ridge = box(u(0.035), u(0.2), u(0.03), gold);
        ridge.position.set(0, u(0.14), u(0.055));
        G.add(ridge);
        attach(sh, G, 0, 0, 0);
      }
      if (ft) {
        const u = (m: number) => U(ft, m);
        const G = new THREE.Group();
        const boot = box(u(0.1), u(0.08), u(0.18), red);
        boot.position.set(0, u(0.03), u(0.06));
        G.add(boot);
        const toe = box(u(0.09), u(0.05), u(0.07), gold);
        toe.position.set(0, u(0.025), u(0.16));
        G.add(toe);
        attach(ft, G, 0, 0, 0);
      }
    }

    // ---- BELT ----
    {
      const hips = B('hips');
      if (hips) {
        const u = (m: number) => U(hips, m);
        const G = new THREE.Group();
        const belt = cyl(u(0.16), u(0.16), u(0.05), gold, 24);
        belt.position.y = u(0.06);
        G.add(belt);
        const buckle = box(u(0.06), u(0.05), u(0.04), red);
        buckle.position.set(0, u(0.06), u(0.16));
        G.add(buckle);
        attach(hips, G, 0, 0, 0);
      }
    }

    const mapped = Object.keys(this.bones).length;
    console.info(`[model] Iron Man kit attached (${mapped} bones mapped). missing=${this.missing.join(',') || 'none'}`);
  }

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
    // Faceplate seals during the final quarter of the suit-up scan (Iron Man helmet close)
    if (this.faceplatePivot) {
      const seal = this.progress <= 0.72 ? 0 : Math.min(1, (this.progress - 0.72) / 0.28);
      this.setFaceplateClosed(this.progress >= 1 ? 1 : seal);
    }
    if (this.reactorGlow) {
      const pulse = 0.7 + 0.25 * Math.sin(t * 3.5);
      this.reactorGlow.material.opacity = pulse;
    }
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
