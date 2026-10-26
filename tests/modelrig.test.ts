import { describe, expect, it } from 'vitest';
import { resolveBones } from '../src/engine/rendering/ModelRig';
import { simulatePose } from '../src/engine/tracking/simulated';
import { mapPoint } from '../src/engine/tracking/mapping';
import { JOINTS, POSE_INDEX, emptyJoints, dist2 } from '../src/engine/tracking/types';

function dirOf(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

function tposeFrame() {
  const s = simulatePose(1000, 'tpose', 1000);
  const map = { W: 1280, H: 720, vw: 1280, vh: 720, mirror: true };
  const joints = emptyJoints();
  for (const j of JOINTS) {
    const r = s.pose[POSE_INDEX[j]];
    const m = mapPoint(map, r.x, r.y, r.z);
    joints[j] = { ...m, v: 1 };
  }
  return { hasPose: true as const, joints, shoulderWidth: dist2(joints.lShoulder, joints.rShoulder) };
}

describe('resolveBones', () => {
  it('maps Mixamo-style names', () => {
    const names = [
      'mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
      'mixamorig:Neck', 'mixamorig:Head',
      'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
      'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
      'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot',
      'mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot',
    ];
    const m = resolveBones(names);
    expect(m.hips).toBe('mixamorig:Hips');
    expect(m.head).toBe('mixamorig:Head');
    expect(m.lUpperArm).toBe('mixamorig:LeftArm');
    expect(m.rForearm).toBe('mixamorig:RightForeArm');
    expect(m.lThigh).toBe('mixamorig:LeftUpLeg');
    expect(m.rShin).toBe('mixamorig:RightLeg');
  });

  it('maps VRM/Unity humanoid names', () => {
    const names = [
      'Hips', 'Spine', 'Chest', 'Neck', 'Head',
      'LeftUpperArm', 'LeftLowerArm', 'LeftHand',
      'RightUpperArm', 'RightLowerArm', 'RightHand',
      'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot',
      'RightUpperLeg', 'RightLowerLeg', 'RightFoot',
    ];
    const m = resolveBones(names);
    expect(m.hips).toBe('Hips');
    expect(m.lUpperArm).toBe('LeftUpperArm');
    expect(m.rShin).toBe('RightLowerLeg');
  });

  it('maps Blender _l/_r style names', () => {
    const names = [
      'hips', 'spine', 'chest', 'neck', 'head',
      'upperarm_l', 'forearm_l', 'hand_l',
      'upperarm_r', 'forearm_r', 'hand_r',
      'thigh_l', 'shin_l', 'foot_l',
      'thigh_r', 'shin_r', 'foot_r',
    ];
    const m = resolveBones(names);
    expect(m.lUpperArm).toBe('upperarm_l');
    expect(m.rThigh).toBe('thigh_r');
    expect(m.lFoot).toBe('foot_l');
  });

  it('leaves unmapped slots undefined when bones are missing', () => {
    const m = resolveBones(['Hips', 'Head']);
    expect(m.hips).toBe('Hips');
    expect(m.head).toBe('Head');
    expect(m.lUpperArm).toBeUndefined();
  });
});

describe('ModelRig retargeting', () => {
  it('T-pose landmarks put both upper arms horizontal and legs down', () => {
    const frame = tposeFrame();
    expect(frame.hasPose).toBe(true);
    const j = frame.joints;
    expect(Math.abs(j.lShoulder.x - j.rShoulder.x)).toBeGreaterThan(Math.abs(j.lHip.x - j.rHip.x) * 0.5);
    const armLen = Math.hypot(j.lElbow.x - j.lShoulder.x, j.lElbow.y - j.lShoulder.y);
    expect(Math.abs(j.lElbow.y - j.lShoulder.y)).toBeLessThan(armLen * 0.45);
    expect(Math.abs(j.rElbow.y - j.rShoulder.y)).toBeLessThan(armLen * 0.45);
    expect(dirOf(j.lHip, j.lKnee).y).toBeLessThan(-0.5);
    expect(dirOf(j.rHip, j.rKnee).y).toBeLessThan(-0.5);
    expect(dirOf(j.lKnee, j.lAnkle).y).toBeLessThan(-0.7);
    expect(dirOf(j.rKnee, j.rAnkle).y).toBeLessThan(-0.7);
  });

  it('missing landmarks do not produce NaN positions', () => {
    const frame = tposeFrame();
    frame.joints.lElbow = { ...frame.joints.lElbow, v: 0 };
    for (const key of Object.keys(frame.joints) as (keyof typeof frame.joints)[]) {
      const p = frame.joints[key];
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
