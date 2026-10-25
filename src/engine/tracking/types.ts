/** Screen-space point in world units (pixels, y-up, origin bottom-left of the stage). */
export interface P3 { x: number; y: number; z: number; v: number /* visibility 0..1 */ }

export type Side = 'left' | 'right';

export const JOINTS = [
  'nose', 'lEar', 'rEar', 'lShoulder', 'rShoulder', 'lElbow', 'rElbow', 'lWrist', 'rWrist',
  'lIndex', 'rIndex', 'lPinky', 'rPinky', 'lHip', 'rHip', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle', 'lFoot', 'rFoot',
] as const;
export type Joint = (typeof JOINTS)[number];

/** MediaPipe pose landmark indices for each joint (person's anatomical left/right). */
export const POSE_INDEX: Record<Joint, number> = {
  nose: 0, lEar: 7, rEar: 8, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lPinky: 17, rPinky: 18, lIndex: 19, rIndex: 20, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
  lFoot: 31, rFoot: 32,
};

export interface HandState {
  side: Side;          // anatomical side, matched to the pose wrist
  lm: P3[];            // 21 landmarks in stage space
  score: number;       // detector confidence
  palm: P3;            // palm centre
  palmFacing: number;  // -1..1, +1 = palm facing the camera
  size: number;        // wrist→middle MCP length (px)
}

export interface BodyFrame {
  t: number;                       // ms timestamp
  hasPose: boolean;
  joints: Record<Joint, P3>;
  hands: Partial<Record<Side, HandState>>;
  shoulderWidth: number;           // px, used as a body scale reference
  simulated: boolean;              // true when driven by the synthetic mannequin, not a camera
}

export type TrackingStatus = 'idle' | 'loading' | 'no-camera' | 'denied' | 'error' | 'searching' | 'tracking' | 'lost';

export function emptyJoints(): Record<Joint, P3> {
  const o = {} as Record<Joint, P3>;
  for (const j of JOINTS) o[j] = { x: 0, y: 0, z: 0, v: 0 };
  return o;
}

export const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: P3, b: P3): P3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, v: Math.min(a.v, b.v) });
