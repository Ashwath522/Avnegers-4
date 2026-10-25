/** Pure target state + collision logic (no rendering) — unit tested. */
export type TargetState = 'AVAILABLE' | 'TARGETED' | 'HIT' | 'DAMAGED' | 'DESTROYED';
export type TargetKind = 'dummy' | 'block' | 'wall' | 'drone';

export interface TargetBody {
  id: number;
  kind: TargetKind;
  x: number; y: number;       // centre
  w: number; h: number;
  vx: number; vy: number;
  angle: number; av: number;
  mass: number;
  hp: number; maxHp: number;
  state: TargetState;
  hitTimer: number;           // seconds of HIT flash remaining
  targetedTimer: number;
  floating: boolean;          // drones ignore gravity until destroyed
  homeX: number; homeY: number;
  grabbed: number;            // >0 while a web/tendril holds it
}

export function makeTarget(id: number, kind: TargetKind, x: number, y: number, w: number, h: number, hp: number): TargetBody {
  return {
    id, kind, x, y, w, h, vx: 0, vy: 0, angle: 0, av: 0, mass: (w * h) / 4000, hp, maxHp: hp, state: 'AVAILABLE',
    hitTimer: 0, targetedTimer: 0, floating: kind === 'drone', homeX: x, homeY: y, grabbed: 0,
  };
}

/** Apply damage + impulse. Returns true if this hit destroyed the target. */
export function applyHit(t: TargetBody, damage: number, ix: number, iy: number): boolean {
  if (t.state === 'DESTROYED') return false;
  t.hp = Math.max(0, t.hp - damage);
  t.vx += ix / t.mass; t.vy += iy / t.mass;
  t.av += (ix / t.mass) * 0.004 * (Math.random() > 0.5 ? 1 : -1);
  t.hitTimer = 0.15;
  if (t.hp <= 0) { t.state = 'DESTROYED'; return true; }
  t.state = t.hp < t.maxHp * 0.5 ? 'DAMAGED' : 'HIT';
  return false;
}

export function settleState(t: TargetBody, dt: number) {
  if (t.state === 'DESTROYED') return;
  t.hitTimer = Math.max(0, t.hitTimer - dt);
  t.targetedTimer = Math.max(0, t.targetedTimer - dt);
  if (t.hitTimer > 0) return;
  if (t.hp < t.maxHp * 0.5) t.state = 'DAMAGED';
  else if (t.targetedTimer > 0) t.state = 'TARGETED';
  else t.state = 'AVAILABLE';
}

/**
 * Swept segment vs. axis-aligned box (expanded by radius). Returns entry fraction 0..1 or null.
 */
export function segmentHitsBox(x0: number, y0: number, x1: number, y1: number, t: Pick<TargetBody, 'x' | 'y' | 'w' | 'h'>, radius = 0): number | null {
  const minX = t.x - t.w / 2 - radius, maxX = t.x + t.w / 2 + radius;
  const minY = t.y - t.h / 2 - radius, maxY = t.y + t.h / 2 + radius;
  const dx = x1 - x0, dy = y1 - y0;
  let tmin = 0, tmax = 1;
  for (const [p, d, lo, hi] of [[x0, dx, minX, maxX], [y0, dy, minY, maxY]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export interface PhysParams { gravity: number; restitution: number; friction: number; groundY: number; minX: number; maxX: number }

/** Integrate one rigid body (translation + spin) against ground and side walls. */
export function integrate(t: TargetBody, dt: number, p: PhysParams) {
  if (t.state === 'DESTROYED') return;
  const free = !t.floating || t.grabbed > 0;
  if (t.floating && t.grabbed <= 0) {
    // drones hover back toward their home point
    t.vx += (t.homeX - t.x) * 3 * dt; t.vy += (t.homeY - t.y) * 3 * dt;
    t.vx *= Math.exp(-2.5 * dt); t.vy *= Math.exp(-2.5 * dt);
  } else if (free) t.vy -= p.gravity * dt;
  t.x += t.vx * dt; t.y += t.vy * dt;
  t.angle += t.av * dt;
  const bottom = t.y - t.h / 2;
  if (bottom < p.groundY) {
    t.y = p.groundY + t.h / 2;
    if (t.vy < 0) t.vy = -t.vy * p.restitution;
    if (Math.abs(t.vy) < 30) t.vy = 0;
    t.vx *= Math.exp(-p.friction * dt);
    // settle upright on the ground
    t.av *= Math.exp(-6 * dt);
    t.angle += (Math.round(t.angle / (Math.PI / 2)) * (Math.PI / 2) - t.angle) * Math.min(1, 8 * dt);
  }
  if (t.x - t.w / 2 < p.minX) { t.x = p.minX + t.w / 2; t.vx = Math.abs(t.vx) * p.restitution; }
  if (t.x + t.w / 2 > p.maxX) { t.x = p.maxX - t.w / 2; t.vx = -Math.abs(t.vx) * p.restitution; }
}
