import { GestureMachine, type GestureParams, type GEventType, DEFAULT_PARAMS } from './GestureMachine';
import { fingerExtension, clamp01 } from '../tracking/handMath';
import type { BodyFrame, Side, HandState } from '../tracking/types';

export type HandGesture = 'palm' | 'fist' | 'web' | 'point';
export type BodyGesture = 'bothPalms' | 'armsUp';
export type GestureId = HandGesture | BodyGesture | 'punch' | 'slam';

export interface GestureEvent {
  gesture: GestureId;
  side?: Side;
  type: GEventType;
  heldMs: number;
  /** for motion gestures: normalized direction in stage space */
  dir?: { x: number; y: number };
  /** for motion gestures: speed in shoulder-widths per second (an estimate, not a force measurement) */
  speed?: number;
}

export const HAND_GESTURES: HandGesture[] = ['palm', 'fist', 'web', 'point'];

export function handScores(h: HandState): Record<HandGesture, number> & { ext: number[] } {
  const e = fingerExtension(h.lm);
  const facing = clamp01((h.palmFacing - 0.15) / 0.45);
  const four = (e[1] + e[2] + e[3] + e[4]) / 4;
  return {
    ext: e,
    palm: Math.min(four, Math.min(e[1], e[2], e[3], e[4]) * 1.3) * facing,
    fist: 1 - Math.max(e[1], e[2], e[3], e[4]),
    web: Math.min(e[1], e[4]) * (1 - Math.max(e[2], e[3])),
    point: e[1] * (1 - Math.max(e[2], e[3], e[4])),
  };
}

interface Motion { x: number; y: number; t: number; vx: number; vy: number; lastPunch: number }

export interface GestureSnapshot {
  hands: Record<Side, { present: boolean; scores: Record<HandGesture, number>; states: Record<HandGesture, string>; ext: number[] }>;
  body: Record<BodyGesture, { score: number; state: string }>;
  speed: Record<Side, number>;
}

export class GestureEngine {
  sensitivity = 1; // >1 = easier to trigger
  holdMs = DEFAULT_PARAMS.minHoldMs;
  private hand: Record<Side, Record<HandGesture, GestureMachine>>;
  private body: Record<BodyGesture, GestureMachine>;
  private motion: Record<Side, Motion | null> = { left: null, right: null };
  private armsUpEndedAt = -1e9;
  private lastSlam = -1e9;
  private lastScores: GestureSnapshot;

  constructor() {
    const mk = (p?: Partial<GestureParams>) => new GestureMachine({ ...DEFAULT_PARAMS, ...p });
    const handSet = () => ({ palm: mk(), fist: mk(), web: mk({ activate: 0.65 }), point: mk() });
    this.hand = { left: handSet(), right: handSet() };
    this.body = { bothPalms: mk({ minHoldMs: 600 }), armsUp: mk({ activate: 0.6, release: 0.4, minHoldMs: 80, cooldownMs: 0 }) };
    const zero = { palm: 0, fist: 0, web: 0, point: 0 };
    const st = { palm: 'idle', fist: 'idle', web: 'idle', point: 'idle' };
    this.lastScores = {
      hands: { left: { present: false, scores: { ...zero }, states: { ...st }, ext: [0, 0, 0, 0, 0] }, right: { present: false, scores: { ...zero }, states: { ...st }, ext: [0, 0, 0, 0, 0] } },
      body: { bothPalms: { score: 0, state: 'idle' }, armsUp: { score: 0, state: 'idle' } },
      speed: { left: 0, right: 0 },
    };
  }

  applyParams() {
    const k = this.sensitivity;
    for (const side of ['left', 'right'] as Side[]) for (const g of HAND_GESTURES) {
      const m = this.hand[side][g];
      m.params.activate = clamp01((g === 'web' ? 0.65 : 0.7) / k);
      m.params.release = clamp01(0.45 / k);
      m.params.minHoldMs = this.holdMs;
    }
  }

  get snapshot() { return this.lastScores; }

  update(f: BodyFrame): GestureEvent[] {
    const out: GestureEvent[] = [];
    const t = f.t;
    const palmScore: Record<Side, number> = { left: 0, right: 0 };
    for (const side of ['left', 'right'] as Side[]) {
      const h = f.hands[side];
      const snap = this.lastScores.hands[side];
      snap.present = !!h;
      const sc = h ? handScores(h) : null;
      if (sc) {
        snap.ext = sc.ext;
        // palms only count when the hand is raised above the hips — avoids firing with relaxed arms
        if (f.hasPose) {
          const hipY = (f.joints.lHip.y + f.joints.rHip.y) / 2, shY = (f.joints.lShoulder.y + f.joints.rShoulder.y) / 2;
          const torso = Math.max(1, shY - hipY);
          sc.palm *= clamp01((h!.lm[0].y - hipY) / (0.3 * torso));
        }
      }
      for (const g of HAND_GESTURES) {
        const m = this.hand[side][g];
        const raw = sc ? sc[g] : 0;
        const ev = m.update(raw, t);
        snap.scores[g] = m.score; snap.states[g] = m.state;
        if (ev) out.push({ gesture: g, side, type: ev.type, heldMs: ev.heldMs });
      }
      palmScore[side] = sc ? sc.palm : 0;
      // motion (punch) from the pose wrist, which survives motion blur better than the hand model
      const w = f.joints[side === 'left' ? 'lWrist' : 'rWrist'];
      const sh = f.joints[side === 'left' ? 'lShoulder' : 'rShoulder'];
      if (f.hasPose && w.v > 0.3 && f.shoulderWidth > 10) {
        const prev = this.motion[side];
        if (prev && t > prev.t) {
          const dt = (t - prev.t) / 1000;
          const vx = (w.x - prev.x) / dt, vy = (w.y - prev.y) / dt;
          prev.vx = prev.vx * 0.4 + vx * 0.6; prev.vy = prev.vy * 0.4 + vy * 0.6;
          prev.x = w.x; prev.y = w.y; prev.t = t;
          const speed = Math.hypot(prev.vx, prev.vy) / f.shoulderWidth;
          this.lastScores.speed[side] = speed;
          const reach = Math.hypot(w.x - sh.x, w.y - sh.y) / f.shoulderWidth;
          // moving away from the shoulder?
          const outward = ((w.x - sh.x) * prev.vx + (w.y - sh.y) * prev.vy) > 0;
          const fistOk = !h || (sc && sc.fist > 0.4);
          if (speed > 5.5 / this.sensitivity && reach > 0.9 && outward && fistOk && t - prev.lastPunch > 450) {
            prev.lastPunch = t;
            const n = Math.hypot(prev.vx, prev.vy) || 1;
            out.push({ gesture: 'punch', side, type: 'start', heldMs: 0, dir: { x: prev.vx / n, y: prev.vy / n }, speed });
          }
        } else this.motion[side] = { x: w.x, y: w.y, t, vx: 0, vy: 0, lastPunch: prev?.lastPunch ?? -1e9 };
      } else this.motion[side] = null;
    }

    // body gestures
    const both = Math.min(palmScore.left, palmScore.right);
    const j = f.joints;
    let armsUp = 0;
    if (f.hasPose && f.shoulderWidth > 10) {
      const lowest = Math.min(j.lWrist.y, j.rWrist.y);
      armsUp = clamp01((lowest - j.nose.y) / (0.35 * f.shoulderWidth) + 0.5);
    }
    for (const [g, raw] of [['bothPalms', both], ['armsUp', armsUp]] as [BodyGesture, number][]) {
      const m = this.body[g];
      const ev = m.update(raw, t);
      this.lastScores.body[g] = { score: m.score, state: m.state };
      if (ev) {
        out.push({ gesture: g, type: ev.type, heldMs: ev.heldMs });
        if (g === 'armsUp' && ev.type === 'end') this.armsUpEndedAt = t;
      }
    }
    // slam = arms raised, then both wrists driven below mid-torso within 900 ms
    if (f.hasPose && t - this.armsUpEndedAt < 900 && t - this.lastSlam > 1200) {
      const midY = (j.lShoulder.y + j.lHip.y) / 2;
      if (j.lWrist.y < midY && j.rWrist.y < midY) {
        this.lastSlam = t; this.armsUpEndedAt = -1e9;
        out.push({ gesture: 'slam', type: 'start', heldMs: 0 });
      }
    }
    return out;
  }

  /** Called when tracking is lost: end any active gesture cleanly. */
  reset(t: number): GestureEvent[] {
    const out: GestureEvent[] = [];
    for (const side of ['left', 'right'] as Side[]) for (const g of HAND_GESTURES) {
      const ev = this.hand[side][g].reset(t);
      if (ev) out.push({ gesture: g, side, type: 'end', heldMs: ev.heldMs });
    }
    for (const g of ['bothPalms', 'armsUp'] as BodyGesture[]) this.body[g].reset(t);
    this.motion = { left: null, right: null };
    return out;
  }
}
