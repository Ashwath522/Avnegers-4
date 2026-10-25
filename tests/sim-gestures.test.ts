import { describe, expect, it } from 'vitest';
import { simulatePose, type SimAction } from '../src/engine/tracking/simulated';
import { mapPoint } from '../src/engine/tracking/mapping';
import { palmFacing } from '../src/engine/tracking/handMath';
import { FilterBank } from '../src/engine/tracking/smoothing';
import { GestureEngine, type GestureEvent } from '../src/engine/gestures/GestureEngine';
import { JOINTS, POSE_INDEX, emptyJoints, dist2, type BodyFrame, type HandState } from '../src/engine/tracking/types';

/** End-to-end: mannequin landmarks → stage mapping → gesture engine, the same path the app uses. */
function run(action: SimAction, ms: number, start = 0, dtMs = 33, smooth = false): GestureEvent[] {
  const ge = new GestureEngine();
  const fb = new FilterBank(1.2, 0.015);
  const map = { W: 1280, H: 720, vw: 1280, vh: 720, mirror: true };
  const out: GestureEvent[] = [];
  for (let t = start; t < start + ms; t += dtMs) {
    const s = simulatePose(t, action, t - start);
    const joints = emptyJoints();
    for (const j of JOINTS) { const r = s.pose[POSE_INDEX[j]]; const m = mapPoint(map, r.x, r.y, r.z); joints[j] = smooth ? { x: fb.f(j + 'x', m.x, t), y: fb.f(j + 'y', m.y, t), z: 0, v: 1 } : { ...m, v: 1 }; }
    const hands: BodyFrame['hands'] = {};
    for (const h of s.hands) {
      const lm = h.lm.map((r) => ({ ...mapPoint(map, r.x, r.y, r.z), v: 1 }));
      const hs: HandState = { side: h.side, lm, score: 1, palm: lm[9], palmFacing: palmFacing(h.lm, h.side), size: dist2(lm[0], lm[9]) };
      hands[h.side] = hs;
    }
    out.push(...ge.update({ t, hasPose: true, joints, hands, shoulderWidth: dist2(joints.lShoulder, joints.rShoulder), simulated: true }));
  }
  return out.filter((e) => e.type === 'start');
}

describe('mannequin → gesture engine', () => {
  it('idle triggers nothing', () => { expect(run('idle', 2000)).toEqual([]); });
  it('palm', () => { expect(run('palm', 1000).map((e) => `${e.gesture}:${e.side}`)).toContain('palm:right'); });
  it('web', () => { expect(run('web', 1000).map((e) => e.gesture)).toContain('web'); });
  it('fist', () => { expect(run('fist', 1000).map((e) => e.gesture)).toContain('fist'); });
  it('both palms', () => { expect(run('bothPalms', 1500).map((e) => e.gesture)).toContain('bothPalms'); });
  it('punch', () => { expect(run('punch', 800).map((e) => e.gesture)).toContain('punch'); });
  it('slam with smoothing at 25 fps', () => { expect(run('slam', 1600, 0, 40, true).map((e) => e.gesture)).toContain('slam'); });
  it('punch with smoothing at 25 fps', () => { expect(run('punch', 800, 0, 40, true).map((e) => e.gesture)).toContain('punch'); });
  it('slam', () => { expect(run('slam', 1600).map((e) => e.gesture)).toContain('slam'); });
});
