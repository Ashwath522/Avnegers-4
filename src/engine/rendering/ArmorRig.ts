import * as THREE from 'three';
import type { CharacterDef, ComponentId, MaterializeEffect } from '../characters/types';
import type { BodyFrame, Joint, P3, Side } from '../tracking/types';
import { dist2 } from '../tracking/types';
import { createSuitMaterials, type SuitMaterials } from './materials';
import { makeGlow } from './Stage';
import { Tube } from './Tube';
import { limbGeometry, pauldronGeometries, torsoGeometry } from './shapes';
import type { Particles } from './Particles';

/**
 * Procedural, landmark-driven suit. Every component is attached to tracked joints (never to fixed
 * screen positions) and scaled from the user's shoulder width. These meshes are explicit
 * placeholders behind a stable component interface: a rigged GLB can replace any component later.
 */

const UNIT_CYL = new THREE.CylinderGeometry(0.82, 1, 1, 20, 1);
const UNIT_RING = new THREE.CylinderGeometry(1.06, 1.06, 0.1, 20, 1);
const UNIT_SPHERE = new THREE.SphereGeometry(1, 24, 16);
const UNIT_DOME = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const DISC = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 32);
const FINGER = new THREE.CylinderGeometry(1, 1, 1, 10, 1);

const UP = new THREE.Vector3(0, 1, 0);

function placeSeg(o: THREE.Object3D, a: P3, b: P3, r: number, depth = 1) {
  o.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  o.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
  o.scale.set(r, len, r * depth);
}

const easeOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

interface Comp {
  id: ComponentId;
  group: THREE.Group;
  mats: THREE.Material[];
  joints: Joint[];               // required joints
  place: (f: BodyFrame, t: number) => P3 | null; // returns anchor point
  anchor: P3;
  outward: { x: number; y: number };
}

export class ArmorRig {
  readonly group = new THREE.Group();
  /** When true, procedural body plates stay hidden (GLB model is driving the silhouette). Palm emitters still update. */
  proceduralHidden = false;
  private comps = new Map<ComponentId, Comp>();
  private base: SuitMaterials;
  private emitters: Record<Side, THREE.Sprite>;
  readonly emitterBoost: Record<Side, number> = { left: 0, right: 0 };
  private tendrils: Tube[] = [];
  private emitAcc = 0;
  coreGlow: THREE.Sprite | null = null;
  private faceplatePivot: THREE.Group | null = null;

  constructor(readonly def: CharacterDef, private particles: Particles) {
    this.base = createSuitMaterials(def);
    for (const id of def.components) this.build(id);
    this.emitters = { left: makeGlow(def.palette.energy, 10, 0), right: makeGlow(def.palette.energy, 10, 0) };
    this.group.add(this.emitters.left, this.emitters.right);
  }

  private mats() {
    const clone = <T extends THREE.Material>(m: T) => { const c = m.clone() as T; c.transparent = true; return c; };
    return { primary: clone(this.base.primary), secondary: clone(this.base.secondary), trim: clone(this.base.trim), energy: clone(this.base.energy), eyes: clone(this.base.eyes) };
  }

  private add(id: ComponentId, joints: Joint[], build: (g: THREE.Group, m: ReturnType<ArmorRig['mats']>) => Comp['place']) {
    const g = new THREE.Group();
    const m = this.mats();
    const place = build(g, m);
    this.group.add(g);
    this.comps.set(id, { id, group: g, mats: [m.primary, m.secondary, m.trim, m.energy, m.eyes], joints, place, anchor: { x: 0, y: 0, z: 0, v: 0 }, outward: { x: 0, y: 0 } });
  }

  private build(id: ComponentId) {
    const d = this.def, s = d.surface, bulk = d.bulk;
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(geo, mat);
    const limb = (a: Joint, b: Joint, rK: number, distal: boolean, matKey: 'primary' | 'secondary' = 'primary') => this.add(id, [a, b], (g, m) => {
      const main = mesh(limbGeometry(s, distal), m[matKey]);
      const ring = mesh(UNIT_RING, s === 'metal' ? (distal ? m.trim : m.secondary) : m.secondary);
      ring.position.y = 0.32;
      const extra = s === 'metal' ? mesh(UNIT_BOX, m.primary) : s === 'skin' ? mesh(UNIT_SPHERE, m[matKey]) : null;
      const joint = distal ? mesh(UNIT_SPHERE, s === 'metal' ? m.secondary : m[matKey]) : null;
      const segGroup = new THREE.Group();
      segGroup.add(main);
      if (s === 'metal' || s === 'suit') segGroup.add(ring);
      if (extra) {
        if (s === 'metal') { extra.scale.set(1.15, 0.55, 0.5); extra.position.set(0, -0.05, 0.75); }
        else { extra.scale.set(1.18, 0.42, 1.12); extra.position.y = -0.08; }
        segGroup.add(extra);
      }
      g.add(segGroup);
      if (joint) g.add(joint);
      return (f) => {
        const A = f.joints[a], B = f.joints[b];
        const r = f.shoulderWidth * rK * bulk;
        placeSeg(segGroup, A, B, r, 0.9);
        if (joint) { joint.position.set(A.x, A.y, A.z + r * 0.2); joint.scale.setScalar(r * 1.05); }
        return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: 0, v: 1 };
      };
    });

    switch (id) {
      case 'lUpperArm': return limb('lShoulder', 'lElbow', 0.13, false);
      case 'rUpperArm': return limb('rShoulder', 'rElbow', 0.13, false);
      case 'lForearm': return limb('lElbow', 'lWrist', 0.115, true, s === 'suit' ? 'secondary' : 'primary');
      case 'rForearm': return limb('rElbow', 'rWrist', 0.115, true, s === 'suit' ? 'secondary' : 'primary');
      case 'lThigh': return limb('lHip', 'lKnee', 0.17, false, s === 'skin' ? 'secondary' : 'primary');
      case 'rThigh': return limb('rHip', 'rKnee', 0.17, false, s === 'skin' ? 'secondary' : 'primary');
      case 'lShin': return limb('lKnee', 'lAnkle', 0.13, true, s === 'suit' ? 'secondary' : 'primary');
      case 'rShin': return limb('rKnee', 'rAnkle', 0.13, true, s === 'suit' ? 'secondary' : 'primary');
      case 'lShoulder': case 'rShoulder': {
        const j: Joint = id === 'lShoulder' ? 'lShoulder' : 'rShoulder';
        return this.add(id, [j], (g, m) => {
          const dome = mesh(UNIT_DOME, m.primary);
          const band = mesh(UNIT_RING, s === 'metal' ? m.trim : m.secondary);
          band.position.y = 0.35; band.scale.set(0.82, 0.6, 0.82);
          g.add(dome); if (s === 'metal') dome.add(band);
          if (s === 'metal') {
            // layered plates
            pauldronGeometries().slice(1).forEach((pg, i) => { const layer = mesh(pg, i === 0 ? m.secondary : m.primary); layer.position.y = -0.22 * (i + 1); layer.scale.setScalar(1.04); dome.add(layer); });
          }
          return (f) => {
            const J = f.joints[j];
            const other = f.joints[j === 'lShoulder' ? 'rShoulder' : 'lShoulder'];
            const out = Math.sign(J.x - other.x) || 1;
            const r = f.shoulderWidth * 0.2 * bulk;
            dome.position.set(J.x + out * r * 0.15, J.y + r * 0.1, J.z + r * 0.3);
            dome.scale.set(r, r * 0.95, r);
            dome.rotation.set(0, 0, -out * 0.55);
            return J;
          };
        });
      }
      case 'chest': return this.add(id, ['lShoulder', 'rShoulder', 'lHip', 'rHip'], (g, m) => {
        const torso = mesh(torsoGeometry(s), m.primary);
        g.add(torso);
        const details: THREE.Mesh[] = [];
        if (s === 'metal') {
          // Iron Man: layered pectoral + abdominal plates with gold trim
          for (const sx of [-1, 1]) {
            const pec = mesh(UNIT_BOX, m.primary);
            pec.position.set(sx * 0.22, 0.22, 0.42); pec.scale.set(0.28, 0.22, 0.14); pec.rotation.z = sx * -0.08; torso.add(pec); details.push(pec);
            const pecGold = mesh(UNIT_BOX, m.trim);
            pecGold.position.set(sx * 0.22, 0.12, 0.48); pecGold.scale.set(0.18, 0.06, 0.06); torso.add(pecGold);
          }
          const sternum = mesh(UNIT_BOX, m.trim);
          sternum.position.set(0, 0.05, 0.5); sternum.scale.set(0.1, 0.55, 0.08); torso.add(sternum);
          for (let i = 0; i < 3; i++) {
            for (const sx of [-1, 1]) {
              const plate = mesh(UNIT_BOX, m.primary);
              plate.position.set(sx * 0.16, -0.12 - i * 0.14, 0.4);
              plate.scale.set(0.2, 0.1, 0.1);
              torso.add(plate); details.push(plate);
            }
          }
          for (const sx of [-1, 1]) {
            const side = mesh(UNIT_BOX, m.secondary);
            side.position.set(sx * 0.42, 0.0, 0.15); side.scale.set(0.12, 0.7, 0.35); torso.add(side);
          }
          const collar = mesh(UNIT_BOX, m.trim); collar.position.set(0, 0.48, 0.28); collar.scale.set(0.75, 0.07, 0.28); torso.add(collar);
          for (const sx of [-1, 1]) {
            const fl = mesh(UNIT_BOX, m.trim);
            fl.position.set(sx * 0.38, 0.42, 0.15); fl.scale.set(0.14, 0.08, 0.22); fl.rotation.z = sx * 0.35; torso.add(fl);
          }
        } else if (s === 'skin') {
          // Hulk: heavy pectorals, abs, traps
          for (const sx of [-1, 1]) {
            const pec = mesh(UNIT_SPHERE, m.primary); pec.position.set(sx * 0.2, 0.24, 0.32); pec.scale.set(0.26, 0.18, 0.18); torso.add(pec);
            const trap = mesh(UNIT_SPHERE, m.primary); trap.position.set(sx * 0.28, 0.42, 0.05); trap.scale.set(0.18, 0.12, 0.14); torso.add(trap);
          }
          for (let i = 0; i < 3; i++) {
            for (const sx of [-1, 1]) {
              const ab = mesh(UNIT_SPHERE, m.primary);
              ab.position.set(sx * 0.12, -0.05 - i * 0.14, 0.3);
              ab.scale.set(0.14, 0.1, 0.1); torso.add(ab);
            }
          }
          const navel = mesh(UNIT_SPHERE, m.secondary); navel.position.set(0, -0.2, 0.35); navel.scale.set(0.06, 0.05, 0.04); torso.add(navel);
        } else if (s === 'suit') {
          // Spider-Man: raised chest emblem zone + side webbings + abs panels
          for (const side of [-1, 1]) {
            const panel = mesh(UNIT_BOX, m.secondary); panel.position.set(side * 0.36, -0.1, 0.12); panel.scale.set(0.16, 0.85, 0.5); torso.add(panel);
          }
          // Spider emblem base (raised diamond)
          const emblem = mesh(UNIT_BOX, m.secondary);
          emblem.position.set(0, 0.18, 0.45); emblem.scale.set(0.22, 0.28, 0.08); emblem.rotation.z = Math.PI / 4; torso.add(emblem);
          const emblemIn = mesh(UNIT_BOX, m.primary);
          emblemIn.position.set(0, 0.18, 0.5); emblemIn.scale.set(0.14, 0.18, 0.05); emblemIn.rotation.z = Math.PI / 4; torso.add(emblemIn);
          // Web-line ridges on torso
          for (let i = 0; i < 5; i++) {
            const ridge = mesh(UNIT_BOX, m.secondary);
            ridge.position.set(0, 0.35 - i * 0.18, 0.4);
            ridge.scale.set(0.55 - i * 0.04, 0.02, 0.03); torso.add(ridge);
          }
        } else if (s === 'organic') {
          // Venom: glossy mass with white spider-chest mark
          for (const sx of [-1, 1]) {
            const mass = mesh(UNIT_SPHERE, m.primary);
            mass.position.set(sx * 0.18, 0.15, 0.3); mass.scale.set(0.28, 0.35, 0.2); torso.add(mass);
          }
          // White spider emblem (abstract)
          const mark = mesh(UNIT_BOX, m.eyes);
          mark.position.set(0, 0.15, 0.48); mark.scale.set(0.18, 0.32, 0.06); torso.add(mark);
          for (const sx of [-1, 1]) {
            const leg = mesh(UNIT_BOX, m.eyes);
            leg.position.set(sx * 0.16, 0.05, 0.46); leg.scale.set(0.06, 0.22, 0.04); leg.rotation.z = sx * 0.5; torso.add(leg);
            const leg2 = mesh(UNIT_BOX, m.eyes);
            leg2.position.set(sx * 0.2, 0.28, 0.46); leg2.scale.set(0.05, 0.16, 0.04); leg2.rotation.z = sx * -0.4; torso.add(leg2);
          }
        }
        return (f) => {
          const j = f.joints;
          const sm = { x: (j.lShoulder.x + j.rShoulder.x) / 2, y: (j.lShoulder.y + j.rShoulder.y) / 2 };
          const hm = { x: (j.lHip.x + j.rHip.x) / 2, y: (j.lHip.y + j.rHip.y) / 2 };
          const h = Math.hypot(sm.x - hm.x, sm.y - hm.y);
          const w = f.shoulderWidth * 1.08 * (s === 'skin' ? 1.2 : 1);
          torso.position.set(sm.x * 0.55 + hm.x * 0.45, sm.y * 0.55 + hm.y * 0.45, (j.lShoulder.z + j.rShoulder.z) / 2 - w * 0.1);
          torso.rotation.set(0, 0, Math.atan2(sm.y - hm.y, sm.x - hm.x) - Math.PI / 2);
          torso.scale.set(w, h * 1.08, w * 0.55);
          return { x: torso.position.x, y: torso.position.y, z: 0, v: 1 };
        };
      });
      case 'core': return this.add(id, ['lShoulder', 'rShoulder', 'lHip', 'rHip'], (g, m) => {
        // Bright layered arc reactor — center MUST read cyan, not grey
        const assembly = new THREE.Group();
        const brightCore = new THREE.MeshBasicMaterial({ color: '#7ff3ff', toneMapped: false });
        const goldMat = m.trim;
        const darkMat = m.secondary;

        if (s === 'metal') {
          // Gold housing ring (flat cylinder facing camera)
          const housing = mesh(new THREE.CylinderGeometry(1.05, 1.1, 0.18, 48), goldMat);
          housing.rotation.x = Math.PI / 2;
          // Concentric rings
          const ringA = mesh(new THREE.TorusGeometry(0.88, 0.06, 10, 48), goldMat);
          const ringB = mesh(new THREE.TorusGeometry(0.62, 0.04, 10, 40), darkMat);
          const ringC = mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 32), goldMat);
          ringA.position.z = 0.08; ringB.position.z = 0.1; ringC.position.z = 0.12;
          // Cyan core disc (large enough to dominate)
          const coreDisc = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 32), brightCore);
          coreDisc.rotation.x = Math.PI / 2;
          coreDisc.position.z = 0.06;
          // Spokes
          for (let i = 0; i < 8; i++) {
            const spoke = mesh(UNIT_BOX, darkMat);
            const ang = (i / 8) * Math.PI * 2;
            spoke.position.set(Math.cos(ang) * 0.55, Math.sin(ang) * 0.55, 0.05);
            spoke.rotation.z = ang;
            spoke.scale.set(0.3, 0.05, 0.04);
            housing.add(spoke);
          }
          // Strong glow sprite in FRONT of everything
          const glow = makeGlow('#5fe1ff', 18, 0.95);
          glow.position.z = 0.35;
          glow.scale.setScalar(2.2);
          this.coreGlow = glow;
          assembly.add(housing, ringA, ringB, ringC, coreDisc, glow);
        } else {
          const disc = mesh(DISC, m.eyes);
          disc.rotation.x = Math.PI / 2;
          const glow = makeGlow(d.palette.energy, 10, 0.5);
          this.coreGlow = glow;
          assembly.add(disc, glow);
        }
        g.add(assembly);
        return (f, t) => {
          const j = f.joints;
          const sm = { x: (j.lShoulder.x + j.rShoulder.x) / 2, y: (j.lShoulder.y + j.rShoulder.y) / 2 };
          const hm = { x: (j.lHip.x + j.rHip.x) / 2, y: (j.lHip.y + j.rHip.y) / 2 };
          // Mid-chest, slightly above geometric center (Mark reference)
          const x = sm.x * 0.72 + hm.x * 0.28;
          const y = sm.y * 0.72 + hm.y * 0.28;
          const z = f.shoulderWidth * 0.55;
          const r = f.shoulderWidth * (s === 'metal' ? 0.19 : 0.12);
          assembly.position.set(x, y, z);
          const pulse = 1 + 0.07 * Math.sin(t * 3.5);
          assembly.scale.set(r * pulse, r * pulse, r);
          if (this.coreGlow) {
            this.coreGlow.position.set(x, y, z + r * 0.5);
            this.coreGlow.scale.setScalar(r * 5.5 * pulse);
            this.coreGlow.material.opacity = 0.8 + 0.2 * Math.sin(t * 3.5);
          }
          return { x, y, z, v: 1 };
        };
      });
      case 'belt': return this.add(id, ['lHip', 'rHip'], (g, m) => {
        const belt = mesh(DISC, s === 'metal' ? m.trim : m.secondary);
        belt.geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
        g.add(belt);
        return (f) => {
          const j = f.joints;
          const hw = dist2(j.lHip, j.rHip);
          belt.position.set((j.lHip.x + j.rHip.x) / 2, (j.lHip.y + j.rHip.y) / 2 + f.shoulderWidth * 0.06, 0);
          belt.rotation.z = Math.atan2(j.lHip.y - j.rHip.y, j.lHip.x - j.rHip.x);
          const w = Math.max(hw * 1.7, f.shoulderWidth * 0.85) * (s === 'skin' ? 1.25 : 1);
          belt.scale.set(w, f.shoulderWidth * (s === 'skin' ? 0.32 : 0.14), w * 0.5);
          return belt.position as unknown as P3;
        };
      });
      case 'lFoot': case 'rFoot': {
        const a: Joint = id === 'lFoot' ? 'lAnkle' : 'rAnkle', b: Joint = id === 'lFoot' ? 'lFoot' : 'rFoot';
        return this.add(id, [a, b], (g, m) => {
          const boot = mesh(UNIT_BOX, s === 'metal' ? m.primary : s === 'skin' ? m.primary : m.secondary);
          const sole = mesh(UNIT_BOX, s === 'metal' ? m.trim : m.secondary);
          g.add(boot, sole);
          return (f) => {
            const A = f.joints[a], B = f.joints[b];
            const r = f.shoulderWidth * 0.13 * bulk;
            placeSeg(boot, A, B, 1);
            boot.scale.set(r * 1.8, Math.max(r * 1.4, dist2(A, B) * 1.3), r * 2.2);
            sole.position.copy(boot.position); sole.rotation.copy(boot.rotation);
            sole.scale.set(r * 1.9, boot.scale.y * 1.02, r * 0.5);
            sole.position.y -= r * 0.4;
            return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: 0, v: 1 };
          };
        });
      }
      case 'lHand': case 'rHand': {
        const side: Side = id === 'lHand' ? 'left' : 'right';
        const wristJ: Joint = side === 'left' ? 'lWrist' : 'rWrist';
        const idxJ: Joint = side === 'left' ? 'lIndex' : 'rIndex';
        const pkJ: Joint = side === 'left' ? 'lPinky' : 'rPinky';
        return this.add(id, [wristJ], (g, m) => {
          const palm = mesh(UNIT_BOX, m.primary);
          const cuff = mesh(UNIT_CYL, s === 'metal' ? m.trim : m.primary);
          const fingers: THREE.Mesh[] = [];
          const BONES = [[1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [17, 18], [18, 19], [19, 20]];
          for (let i = 0; i < BONES.length; i++) {
            const fm = mesh(FINGER, (i % 3 === 0 && s === 'metal') ? m.secondary : m.primary);
            fingers.push(fm); g.add(fm);
          }
          const emitterDisc = mesh(DISC, m.energy); emitterDisc.rotation.x = Math.PI / 2;
          g.add(palm, cuff);
          if (d.id === 'apex') g.add(emitterDisc);
          return (f) => {
            const h = f.hands[side];
            const W = f.joints[wristJ];
            const handBulk = s === 'skin' ? 1.45 : 1;
            if (h) {
              const lm = h.lm;
              const pc = h.palm;
              const sz = h.size * handBulk;
              palm.position.set(pc.x, pc.y, 20);
              palm.rotation.set(0, 0, Math.atan2(lm[9].y - lm[0].y, lm[9].x - lm[0].x) - Math.PI / 2);
              const pw = Math.max(dist2(lm[5], lm[17]) * 1.25, sz * 0.5);
              palm.scale.set(pw, sz * 1.05, sz * 0.32);
              const fr = sz * 0.095 * (s === 'skin' ? 1.35 : 1);
              BONES.forEach(([a, b], i) => { placeSeg(fingers[i], lm[a], lm[b], fr); fingers[i].position.z = 26; fingers[i].visible = true; });
              placeSeg(cuff, { ...lm[0], x: lm[0].x - (lm[9].x - lm[0].x) * 0.55, y: lm[0].y - (lm[9].y - lm[0].y) * 0.55 }, lm[0], sz * 0.42, 0.85);
              emitterDisc.position.set(pc.x, pc.y, 40); emitterDisc.scale.setScalar(sz * 0.38);
              emitterDisc.visible = h.palmFacing > 0.2;
              return pc;
            }
            // fallback: pose-only hand
            const I = f.joints[idxJ], P = f.joints[pkJ];
            const tip = { x: (I.x + P.x) / 2, y: (I.y + P.y) / 2, z: 0, v: 1 };
            const sz = Math.max(dist2(W, tip) * 1.6, f.shoulderWidth * 0.22) * handBulk;
            palm.position.set((W.x + tip.x) / 2, (W.y + tip.y) / 2, 20);
            palm.rotation.set(0, 0, Math.atan2(tip.y - W.y, tip.x - W.x) - Math.PI / 2);
            palm.scale.set(sz * 0.65, sz, sz * 0.35);
            fingers.forEach((x) => (x.visible = false));
            emitterDisc.visible = false;
            placeSeg(cuff, { ...W, x: W.x - (tip.x - W.x) * 0.7, y: W.y - (tip.y - W.y) * 0.7 }, W, sz * 0.38, 0.85);
            return W;
          };
        });
      }
      case 'head': return this.add(id, ['nose'], (g, m) => {
        const head = new THREE.Group(); g.add(head);
        const skull = mesh(UNIT_SPHERE, m.primary); skull.scale.set(1, 1.18, 1.05); head.add(skull);
        const glows: THREE.Sprite[] = [];
        if (d.headStyle === 'helmet') {
          // Red shell
          skull.scale.set(1.0, 1.1, 1.02);
          const crown = mesh(UNIT_DOME, m.primary);
          crown.scale.set(1.1, 0.7, 1.05); crown.position.set(0, 0.4, -0.05); head.add(crown);
          for (const sx of [-1, 1]) {
            const cheek = mesh(UNIT_SPHERE, m.primary);
            cheek.scale.set(0.4, 0.55, 0.48); cheek.position.set(sx * 0.72, -0.1, 0.12); head.add(cheek);
          }
          const jaw = mesh(UNIT_BOX, m.primary);
          jaw.position.set(0, -0.58, 0.4); jaw.scale.set(0.7, 0.28, 0.55); head.add(jaw);
          const chin = mesh(UNIT_BOX, m.trim);
          chin.position.set(0, -0.72, 0.52); chin.scale.set(0.35, 0.14, 0.28); head.add(chin);

          // FACEPLATE — hinged at brow, animates closed during helmet step
          const pivot = new THREE.Group();
          pivot.position.set(0, 0.22, 0.35); // brow hinge
          const plate = new THREE.Group();
          plate.position.set(0, -0.28, 0.25); // hangs down over face when closed
          const face = mesh(UNIT_SPHERE, m.trim);
          face.scale.set(0.78, 0.88, 0.5); face.position.set(0, 0, 0);
          plate.add(face);
          const brow = mesh(UNIT_BOX, m.primary);
          brow.position.set(0, 0.28, 0.35); brow.scale.set(0.9, 0.1, 0.2); plate.add(brow);
          for (const sx of [-1, 1]) {
            const socket = mesh(UNIT_BOX, m.secondary);
            socket.position.set(sx * 0.28, 0.08, 0.48); socket.scale.set(0.3, 0.1, 0.06);
            socket.rotation.z = sx * -0.15; plate.add(socket);
            const eye = mesh(UNIT_BOX, m.eyes);
            eye.position.set(sx * 0.28, 0.08, 0.52); eye.scale.set(0.24, 0.05, 0.04);
            eye.rotation.z = sx * -0.15; plate.add(eye);
            const gl = makeGlow(d.palette.energy, 1.2, 0.9);
            gl.position.set(sx * 0.28, 0.08, 0.6); gl.scale.setScalar(0.5); plate.add(gl); glows.push(gl);
          }
          for (let i = -1; i <= 1; i++) {
            const vent = mesh(UNIT_BOX, m.secondary);
            vent.position.set(i * 0.12, -0.35, 0.45); vent.scale.set(0.08, 0.12, 0.04); plate.add(vent);
          }
          pivot.add(plate);
          head.add(pivot);
          this.faceplatePivot = pivot;
          // default sealed
          pivot.rotation.x = 0;
                } else if (d.headStyle === 'mask') {
          // Spider-Man: full mask with large white eye lenses + web ridges
          skull.scale.set(1.02, 1.08, 1.05);
          const lensShape = new THREE.Shape();
          [[0, 0], [0.48, 0.08], [0.58, 0.35], [0.35, 0.5], [0.05, 0.32]].forEach(([x, y], i) => (i ? lensShape.lineTo(x, y) : lensShape.moveTo(x, y)));
          const lens = new THREE.ShapeGeometry(lensShape);
          for (const sx of [-1, 1]) {
            const border = mesh(lens, m.secondary); border.scale.set(sx * 1.25, 1.25, 1); border.position.set(sx * 0.05, -0.02, 0.98); head.add(border);
            const eye = mesh(lens, m.eyes); eye.scale.set(sx * 1.05, 1.05, 1); eye.position.set(sx * 0.06, 0.0, 1.02); head.add(eye);
            const gl = makeGlow('#ffffff', 0.8, 0.5); gl.position.set(sx * 0.22, 0.12, 1.15); gl.scale.setScalar(0.45); head.add(gl); glows.push(gl);
          }
          // Web ridge lines across mask
          for (let i = 0; i < 4; i++) {
            const ridge = mesh(UNIT_BOX, m.secondary);
            ridge.position.set(0, 0.55 - i * 0.28, 0.85);
            ridge.scale.set(0.9 - i * 0.08, 0.025, 0.04); head.add(ridge);
          }
        } else if (d.headStyle === 'bare') {
          // Hulk: heavy brow, wide jaw, dark hair dome
          skull.scale.set(1.08, 1.15, 1.1);
          const hair = mesh(UNIT_DOME, new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }));
          hair.scale.set(1.08, 0.85, 1.1); hair.position.y = 0.18; head.add(hair);
          const brow = mesh(UNIT_BOX, m.primary); brow.position.set(0, 0.28, 0.9); brow.scale.set(1.05, 0.22, 0.3); head.add(brow);
          for (const sx of [-1, 1]) {
            const eye = mesh(UNIT_SPHERE, m.eyes); eye.position.set(sx * 0.3, 0.06, 0.98); eye.scale.set(0.1, 0.06, 0.05); head.add(eye);
            const gl = makeGlow(d.palette.energy, 0.6, 0.35); gl.position.set(sx * 0.3, 0.06, 1.1); gl.scale.setScalar(0.35); head.add(gl); glows.push(gl);
          }
          const nose = mesh(UNIT_BOX, m.primary); nose.position.set(0, -0.08, 1.0); nose.scale.set(0.18, 0.2, 0.2); head.add(nose);
          const jaw = mesh(UNIT_BOX, m.primary); jaw.position.set(0, -0.55, 0.5); jaw.scale.set(1.05, 0.4, 0.75); head.add(jaw);
          const mouth = mesh(UNIT_BOX, m.secondary); mouth.position.set(0, -0.45, 0.95); mouth.scale.set(0.4, 0.08, 0.08); head.add(mouth);
        } else {
          // Venom: oversized white eyes, jagged mouth suggestion, glossy skull
          skull.scale.set(1.08, 1.2, 1.12);
          const sh = new THREE.Shape();
          sh.moveTo(0, 0); sh.quadraticCurveTo(0.4, 0.02, 0.72, 0.48); sh.quadraticCurveTo(0.35, 0.35, 0.02, 0.2); sh.lineTo(0, 0);
          const eg = new THREE.ShapeGeometry(sh, 14);
          for (const sx of [-1, 1]) {
            const eye = mesh(eg, m.eyes); eye.scale.set(sx * 1.15, 1.15, 1); eye.position.set(sx * 0.05, -0.08, 1.05); head.add(eye);
            const gl = makeGlow('#eef0ff', 1.0, 0.7); gl.position.set(sx * 0.25, 0.08, 1.2); gl.scale.setScalar(0.55); head.add(gl); glows.push(gl);
          }
          // Jagged mouth row
          for (let i = -3; i <= 3; i++) {
            const tooth = mesh(UNIT_BOX, m.eyes);
            tooth.position.set(i * 0.1, -0.5, 0.95);
            tooth.scale.set(0.06, 0.12 + (Math.abs(i) % 2) * 0.06, 0.05);
            head.add(tooth);
          }
          const chin = mesh(UNIT_SPHERE, m.primary);
          chin.position.set(0, -0.7, 0.4); chin.scale.set(0.55, 0.35, 0.45); head.add(chin);
        }
        return (f) => {
          const j = f.joints;
          const [a, b] = j.lEar.x < j.rEar.x ? [j.lEar, j.rEar] : [j.rEar, j.lEar];
          const earD = dist2(a, b);
          const size = Math.max(earD * 0.62, f.shoulderWidth * 0.21) * (d.headStyle === 'bare' ? 1.1 : 1);
          const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
          const useEars = a.v > 0.4 && b.v > 0.4;
          const x = useEars ? cx : j.nose.x, y = (useEars ? cy : j.nose.y) + size * 0.12;
          head.position.set(x, y, f.shoulderWidth * 0.2);
          head.scale.setScalar(size);
          const yaw = earD > 1 ? Math.max(-0.9, Math.min(0.9, ((j.nose.x - cx) / earD) * 1.8)) : 0;
          head.rotation.set(0, yaw, Math.atan2(b.y - a.y, b.x - a.x));
          glows.forEach((gl) => (gl.material.opacity = 0.7 + Math.random() * 0.2));
          return { x, y, z: 0, v: 1 };
        };
      });
      case 'tendrils': return this.add(id, ['lShoulder', 'rShoulder'], (g, m) => {
        const tubes = [0, 1, 2, 3].map(() => new Tube(18, 6, m.primary));
        tubes.forEach((t) => { g.add(t.mesh); this.tendrils.push(t); });
        const pts = Array.from({ length: 19 }, () => ({ x: 0, y: 0, z: -30 }));
        return (f, t) => {
          const j = f.joints;
          const L = f.shoulderWidth * 1.1;
          tubes.forEach((tube, k) => {
            const side = k < 2 ? -1 : 1;
            const S = (j.lShoulder.x < j.rShoulder.x) === (side < 0) ? j.lShoulder : j.rShoulder;
            const baseAng = Math.PI / 2 + side * (0.5 + (k % 2) * 0.45);
            for (let i = 0; i <= 18; i++) {
              const u = i / 18;
              const wave = Math.sin(t * 2.2 + k * 1.7 - u * 5) * 0.5 * u;
              const ang = baseAng - side * u * 0.9 + wave;
              const prev = i ? pts[i - 1] : { x: S.x, y: S.y - f.shoulderWidth * 0.1, z: -30 };
              pts[i] = i ? { x: prev.x + Math.cos(ang) * L / 18, y: prev.y + Math.sin(ang) * L / 18, z: -30 } : prev;
            }
            tube.update(pts, (u) => f.shoulderWidth * 0.05 * (1 - u * 0.85));
          });
          return { x: (j.lShoulder.x + j.rShoulder.x) / 2, y: j.lShoulder.y, z: 0, v: 1 };
        };
      });
    }
  }

  componentIds() { return [...this.comps.keys()]; }

  update(f: BodyFrame | null, progress: Map<ComponentId, number>, effects: Map<ComponentId, MaterializeEffect>, t: number, dt: number) {
    if (!f || !f.hasPose || f.shoulderWidth < 8) { this.group.visible = false; return; }
    this.group.visible = true;
    const cx = (f.joints.lShoulder.x + f.joints.rShoulder.x) / 2;
    const cy = (f.joints.lShoulder.y + f.joints.lHip.y) / 2;
    this.emitAcc += dt;
    const emitNow = this.emitAcc > 0.05; if (emitNow) this.emitAcc = 0;
    for (const c of this.comps.values()) {
      const p = progress.get(c.id) ?? 1;
      const visibleJoints = f.simulated || c.joints.every((j) => f.joints[j].v > 0.45);
      // Hide procedural plates when a GLB model is driving the silhouette; keep palm emitters usable.
      if (this.proceduralHidden || p <= 0.001 || !visibleJoints) { c.group.visible = false; continue; }
      c.group.visible = true;
      c.group.position.set(0, 0, 0); c.group.scale.setScalar(1);
      const anchor = c.place(f, t);
      if (!anchor) { c.group.visible = false; continue; }
      c.anchor = anchor;
      const ox = anchor.x - cx, oy = anchor.y - cy, ol = Math.hypot(ox, oy) || 1;
      c.outward = { x: ox / ol, y: oy / ol };
      const eff = effects.get(c.id) ?? 'particles';
      let sc = 1, offX = 0, offY = 0, op = 1;
      if (p < 1) {
        if (eff === 'mechanical') { sc = 0.45 + 0.55 * easeOutBack(p); const fly = (1 - p) * (1 - p) * f.shoulderWidth * 1.4; offX = c.outward.x * fly; offY = c.outward.y * fly; op = smooth(0, 0.35, p); }
        else if (eff === 'organic') { sc = 0.25 + 0.75 * smooth(0, 1, p) + Math.sin(p * 18) * 0.05 * (1 - p); op = smooth(0, 0.25, p); }
        else if (eff === 'converge') { sc = 0.85 + 0.15 * p; op = smooth(0.35, 0.9, p); }
        else { sc = 1; op = smooth(0.15, 0.85, p); }
        if (emitNow) {
          const col = this.def.palette.energy;
          if (eff === 'converge') this.particles.emit({ x: anchor.x, y: anchor.y, count: 10, color: col, speed: 60, size: 10, life: 0.6, radius: f.shoulderWidth * 0.9, attract: anchor });
          else if (eff === 'organic') this.particles.emit({ x: anchor.x, y: anchor.y, count: 4, color: col, speed: 40, size: 9, life: 0.5, radius: f.shoulderWidth * 0.2 });
          else this.particles.emit({ x: anchor.x, y: anchor.y, count: 8, color: col, speed: 140, size: 7, life: 0.45, radius: f.shoulderWidth * 0.25 });
        }
      }
      c.group.scale.setScalar(sc);
      c.group.position.set(anchor.x * (1 - sc) + offX, anchor.y * (1 - sc) + offY, 0);
      const flash = p < 1 ? Math.sin(Math.PI * p) : 0;
      for (const m of c.mats) {
        m.opacity = op;
        const sm = m as THREE.MeshStandardMaterial;
        if (sm.emissive && this.def.surface !== 'organic') { sm.emissive.set(this.def.palette.energy); sm.emissiveIntensity = (sm.userData.baseEmissive ?? 0) + flash * 0.9; }
      }
    }
    // Faceplate close animation: open while head materializes, seal when head progress → 1
    if (this.faceplatePivot && this.def.headStyle === 'helmet') {
      const hp = progress.get('head') ?? 1;
      // 0..0.35 open, 0.35..1 close
      const closed = hp <= 0.35 ? 0 : Math.min(1, (hp - 0.35) / 0.65);
      this.faceplatePivot.rotation.x = -(1 - closed) * Math.PI * 0.7;
    }
        // palm emitters
    for (const side of ['left', 'right'] as Side[]) {
      const e = this.emitters[side];
      const h = f.hands[side];
      const handVisible = this.comps.get(side === 'left' ? 'lHand' : 'rHand')?.group.visible;
      if (!h || !handVisible) { e.material.opacity = 0; continue; }
      const facing = Math.max(0, h.palmFacing);
      const base = this.def.id === 'apex' ? 0.35 + facing * 0.4 : 0;
      const boost = this.emitterBoost[side];
      e.material.opacity = Math.min(1, base + boost);
      e.position.set(h.palm.x, h.palm.y, 60);
      const sz = h.size * (1.2 + boost * 2.5) * (0.9 + Math.random() * 0.15);
      e.scale.set(sz, sz, 1);
    }
    if (this.coreGlow) this.coreGlow.material.opacity = 0.75 + Math.sin(t * 3) * 0.15;
  }

  palmOrWrist(f: BodyFrame, side: Side): P3 {
    const h = f.hands[side];
    return h ? h.palm : f.joints[side === 'left' ? 'lWrist' : 'rWrist'];
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      const mat = m.material as THREE.Material | undefined;
      if (mat && !Array.isArray(mat)) mat.dispose();
    });
    this.tendrils.forEach((t) => t.dispose());
    for (const k of Object.keys(this.base) as (keyof SuitMaterials)[]) {
      const mm = this.base[k] as THREE.MeshStandardMaterial;
      mm.map?.dispose(); mm.bumpMap?.dispose(); mm.emissiveMap?.dispose(); mm.dispose();
    }
    this.group.removeFromParent();
  }
}

export { UP };
