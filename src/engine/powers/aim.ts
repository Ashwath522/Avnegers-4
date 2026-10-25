import type { BodyFrame, Side } from '../tracking/types';
import type { World } from '../world/World';
import type { TargetBody } from '../world/targetLogic';

/**
 * Aim direction for a hand: shoulder → hand, in screen space. When the arm points at the camera
 * (short projected vector) we fall back to "outward from the body". Optional aim assist bends the
 * ray toward a target inside a cone — it never fires at something the user isn't facing.
 */
export function aimFrom(f: BodyFrame, side: Side, origin: { x: number; y: number }, world: World, rangePx: number, assist: number): { dx: number; dy: number; target: TargetBody | null } {
  const sh = f.joints[side === 'left' ? 'lShoulder' : 'rShoulder'];
  let dx = origin.x - sh.x, dy = origin.y - sh.y;
  let l = Math.hypot(dx, dy);
  if (l < f.shoulderWidth * 0.35) {
    const cx = (f.joints.lShoulder.x + f.joints.rShoulder.x) / 2;
    dx = Math.sign(origin.x - cx) || 1; dy = 0.05; l = Math.hypot(dx, dy);
  }
  dx /= l; dy /= l;
  const target = world.inCone(origin.x, origin.y, dx, dy, rangePx, 0.25 + assist * 0.35);
  if (target && assist > 0) {
    let tx = target.x - origin.x, ty = target.y - origin.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    dx = dx * (1 - assist) + tx * assist; dy = dy * (1 - assist) + ty * assist;
    const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
  }
  return { dx, dy, target };
}
