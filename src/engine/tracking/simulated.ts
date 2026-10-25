import { synthHand, type RawLm } from './handMath';
import type { Side } from './types';

/**
 * Synthetic mannequin used when no camera is active (armory preview, editor preview, and
 * automated tests). It produces landmarks in the same normalized format as MediaPipe so the
 * whole pipeline (mapping, smoothing, gestures, powers) runs exactly as with a real camera.
 * Every screen that uses it shows a "SIMULATED POSE" badge.
 */
export type SimAction = 'idle' | 'palm' | 'web' | 'fist' | 'punch' | 'slam' | 'bothPalms' | 'tpose';

export interface SimOutput { pose: RawLm[]; hands: { lm: RawLm[]; side: Side }[] }

export function simulatePose(tMs: number, action: SimAction, actionT: number /* ms since action start */): SimOutput {
  const t = tMs / 1000;
  const sway = Math.sin(t * 1.3) * 0.006;
  const breathe = Math.sin(t * 2.1) * 0.004;
  const cx = 0.5 + sway;
  const pose: RawLm[] = Array.from({ length: 33 }, () => ({ x: cx, y: 0.5, z: 0, visibility: 0.98 }));
  const set = (i: number, x: number, y: number, z = 0) => { pose[i] = { x, y, z, visibility: 0.98 }; };
  // Video aspect is 16:9, so horizontal normalized units are "narrower" than vertical ones.
  const ax = 9 / 16;
  const shY = 0.36 + breathe, hipY = 0.62, kneeY = 0.79, ankY = 0.95;
  const shW = 0.17 * ax * 1.6;
  set(0, cx, 0.2 + breathe); set(7, cx + 0.05 * ax * 1.6, 0.21); set(8, cx - 0.05 * ax * 1.6, 0.21);
  set(11, cx + shW / 2, shY); set(12, cx - shW / 2, shY); // 11 = person's left (image right, unmirrored)
  set(23, cx + shW * 0.32, hipY); set(24, cx - shW * 0.32, hipY);
  set(25, cx + shW * 0.36, kneeY); set(26, cx - shW * 0.36, kneeY);
  set(27, cx + shW * 0.38, ankY); set(28, cx - shW * 0.38, ankY);
  set(31, cx + shW * 0.45, ankY + 0.02); set(32, cx - shW * 0.45, ankY + 0.02);

  const upper = 0.15, fore = 0.14;
  const arm = (side: Side, ang: number, elbowBend: number) => {
    // angle in radians: 0 = straight down, +pi/2 = outward horizontal, pi = straight up
    const s = side === 'left' ? 1 : -1; // left arm goes to image right
    const sh = pose[side === 'left' ? 11 : 12];
    const ex = sh.x + s * Math.sin(ang) * upper * ax * 1.6, ey = sh.y + Math.cos(ang) * upper;
    const a2 = ang + elbowBend;
    const wx = ex + s * Math.sin(a2) * fore * ax * 1.6, wy = ey + Math.cos(a2) * fore;
    set(side === 'left' ? 13 : 14, ex, ey);
    set(side === 'left' ? 15 : 16, wx, wy);
    return { w: { x: wx, y: wy }, dir: { x: (wx - ex), y: (wy - ey) } };
  };

  let lA = 0.25 + Math.sin(t * 1.1) * 0.03, rA = 0.25 + Math.sin(t * 1.1 + 1) * 0.03;
  let lBend = 0.15, rBend = 0.15;
  let rExt = [0.6, 0.6, 0.6, 0.6, 0.6], lExt = [0.6, 0.6, 0.6, 0.6, 0.6];
  let rDirOverride: { x: number; y: number } | null = null;
  let lDirOverride: { x: number; y: number } | null = null;
  const k = Math.min(1, actionT / 350); // ease into the pose
  const open = [1, 1, 1, 1, 1], fist = [0, 0, 0, 0, 0], web = [1, 1, 0, 0, 1];

  switch (action) {
    case 'tpose': lA = rA = Math.PI / 2; lBend = rBend = 0; rExt = lExt = open; break;
    case 'palm': rA = lerp(rA, Math.PI / 2, k); rBend = 0; rExt = open; rDirOverride = { x: 0, y: -1 }; break;
    case 'web': rA = lerp(rA, Math.PI / 2, k); rBend = 0; rExt = web; rDirOverride = { x: 0, y: -1 }; break;
    case 'fist': rA = lerp(rA, Math.PI / 2, k); rBend = 0.2; rExt = fist; break;
    case 'punch': {
      // wind-up (fist cocked at the shoulder), then a fast ~90 ms extension
      const p = actionT < 250 ? 0 : Math.min(1, (actionT - 250) / 90);
      rA = lerp(0.35, Math.PI / 2, p); rBend = lerp(2.5, 0, p); rExt = fist; break;
    }
    case 'slam': {
      const up = actionT < 1000, p = up ? Math.min(1, actionT / 300) : Math.min(1, (actionT - 1000) / 200);
      const a = up ? lerp(0.3, Math.PI * 0.95, p) : lerp(Math.PI * 0.95, 0.15, p);
      lA = rA = a; lBend = rBend = 0; lExt = rExt = fist; break;
    }
    case 'bothPalms':
      lA = rA = lerp(0.3, 1.2, k); lBend = rBend = 0.4; lExt = rExt = open;
      lDirOverride = rDirOverride = { x: 0, y: -1 }; break;
  }
  const R = arm('right', rA, rBend), Lf = arm('left', lA, lBend);
  const hl = 0.085;
  const hands: SimOutput['hands'] = [];
  const relaxed = action === 'idle';
  hands.push({ side: 'right', lm: synthHand(R.w, rDirOverride ?? R.dir, hl, 'right', rExt, !relaxed && action !== 'fist' && action !== 'punch') });
  hands.push({ side: 'left', lm: synthHand(Lf.w, lDirOverride ?? Lf.dir, hl, 'left', lExt, !relaxed && (action === 'bothPalms' || action === 'tpose')) });
  for (const h of hands) {
    const i = h.side === 'left' ? 0 : 1;
    const idx = h.lm[8], pky = h.lm[20];
    set(i === 0 ? 19 : 20, idx.x, idx.y); set(i === 0 ? 17 : 18, pky.x, pky.y);
  }
  // squash horizontal hand coordinates to video aspect (synthHand works in square units)
  for (const h of hands) {
    const w = h.lm[0];
    for (const p of h.lm) p.x = w.x + (p.x - w.x) * ax;
  }
  // shrink the figure so the whole body (feet included) fits a 16:9 viewport
  const FIT = 0.74;
  const fit = (p: RawLm) => { p.x = 0.5 + (p.x - 0.5) * FIT; p.y = 0.56 + (p.y - 0.56) * FIT; };
  pose.forEach(fit); hands.forEach((h) => h.lm.forEach(fit));
  return { pose, hands };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
