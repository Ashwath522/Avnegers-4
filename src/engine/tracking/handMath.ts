import type { Side } from './types';

export interface RawLm { x: number; y: number; z: number; visibility?: number }

/**
 * Palm orientation from raw normalized hand landmarks (unmirrored image, y down).
 * Returns +1 when the palm faces the camera, -1 when the back of the hand does.
 */
export function palmFacing(lm: RawLm[], side: Side): number {
  const w = lm[0], i = lm[5], p = lm[17];
  const ax = i.x - w.x, ay = i.y - w.y, az = i.z - w.z;
  const bx = p.x - w.x, by = p.y - w.y, bz = p.z - w.z;
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  const f = -nz / len;
  return side === 'right' ? f : -f;
}

/**
 * Finger extension 0..1 for thumb, index, middle, ring, pinky.
 * Uses the ratio of tip distance to PIP distance from the wrist, which is scale-invariant.
 */
export function fingerExtension(lm: RawLm[]): number[] {
  const d = (a: RawLm, b: RawLm) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.5);
  const w = lm[0];
  const out: number[] = [];
  // thumb: compare tip distance from index MCP vs. thumb IP distance from index MCP
  const tThumb = d(lm[4], lm[5]) / Math.max(1e-6, d(lm[3], lm[5]));
  out.push(clamp01((tThumb - 1.0) / 0.5));
  const fingers: [number, number][] = [[8, 6], [12, 10], [16, 14], [20, 18]];
  for (const [tip, pip] of fingers) {
    const r = d(lm[tip], w) / Math.max(1e-6, d(lm[pip], w));
    // ~1.35+ when straight, <1.0 when curled
    out.push(clamp01((r - 1.0) / 0.35));
  }
  return out;
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Generate 21 synthetic hand landmarks (normalized coords, y down) — used by the simulated mannequin and tests. */
export function synthHand(
  wrist: { x: number; y: number }, dir: { x: number; y: number }, L: number, side: Side,
  ext: number[] /* thumb..pinky 0..1 */, palmOut = true,
): RawLm[] {
  const n = Math.hypot(dir.x, dir.y) || 1;
  const u = { x: dir.x / n, y: dir.y / n };
  let p = side === 'right' ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
  if (!palmOut) p = { x: -p.x, y: -p.y };
  const at = (a: number, b: number): RawLm => ({ x: wrist.x + u.x * a * L + p.x * b * L, y: wrist.y + u.y * a * L + p.y * b * L, z: 0 });
  const lm: RawLm[] = new Array(21);
  lm[0] = at(0, 0);
  // thumb
  const te = ext[0];
  lm[1] = at(0.25, 0.3); lm[2] = at(0.45, 0.5); lm[3] = at(0.55 + 0.1 * te, 0.62 + 0.1 * te);
  lm[4] = te > 0.5 ? at(0.7, 0.8) : at(0.6, 0.3);
  const offs = [0.35, 0.12, -0.1, -0.3];
  const lens = [0.75, 0.82, 0.76, 0.6];
  for (let f = 0; f < 4; f++) {
    const b = 5 + f * 4; // 5, 9, 13, 17
    const o = offs[f], e = ext[f + 1], l = lens[f];
    lm[b] = at(0.9, o);
    lm[b + 1] = at(0.9 + 0.4 * l, o);           // PIP
    if (e > 0.5) {
      lm[b + 2] = at(0.9 + 0.7 * l, o);
      lm[b + 3] = at(0.9 + 1.0 * l, o);
    } else {
      lm[b + 2] = at(0.9 + 0.25 * l, o);
      lm[b + 3] = at(0.75, o);                  // tip folded back near palm
    }
  }
  return lm;
}
