import * as THREE from 'three';
import { Cooldowns, type PowerContext, type PowerController } from './types';
import { aimFrom } from './aim';
import { makeGlow } from '../rendering/Stage';
import { Tube } from '../rendering/Tube';
import type { GestureEvent } from '../gestures/GestureEngine';
import type { BodyFrame, Side } from '../tracking/types';
import type { TargetBody } from '../world/targetLogic';

const SIDES: Side[] = ['left', 'right'];

/* ---------------------------------------------------------------- projectiles */
interface Proj { x: number; y: number; dx: number; dy: number; speed: number; dist: number; range: number; radius: number; damage: number; push: number; color: string; sprite: THREE.Sprite; size: number }

class ProjectileSystem {
  list: Proj[] = [];
  constructor(private ctx: PowerContext) {}
  fire(p: Omit<Proj, 'sprite' | 'dist'>) {
    const sprite = makeGlow(p.color, p.size, 1);
    sprite.position.set(p.x, p.y, 600);
    this.ctx.stage.root.add(sprite);
    this.list.push({ ...p, sprite, dist: 0 });
  }
  update(dt: number) {
    const { world, particles } = this.ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const step = p.speed * dt;
      const nx = p.x + p.dx * step, ny = p.y + p.dy * step;
      const hit = world.sweep(p.x, p.y, nx, ny, p.radius);
      particles.emit({ x: p.x, y: p.y, count: 6, color: p.color, speed: 60, size: p.size * 0.5, life: 0.25, drag: 4 });
      if (hit) {
        const hx = p.x + (nx - p.x) * hit.frac, hy = p.y + (ny - p.y) * hit.frac;
        world.hit(hit.target, p.damage, p.dx * p.push * hit.target.mass, p.dy * p.push * hit.target.mass + 0.15 * p.push * hit.target.mass, hx, hy, p.color);
        particles.emit({ x: hx, y: hy, count: 40, color: p.color, speed: 700, size: p.size * 0.6, life: 0.35, drag: 5 });
        this.ctx.stage.addShake(p.damage * 0.12);
        this.remove(i); continue;
      }
      p.x = nx; p.y = ny; p.dist += step;
      p.sprite.position.set(p.x, p.y, 600);
      p.sprite.scale.setScalar(p.size * (0.9 + Math.random() * 0.2));
      if (p.dist > p.range || p.x < -200 || p.x > world.W + 200 || p.y < -200 || p.y > world.H + 200) {
        particles.emit({ x: p.x, y: p.y, count: 12, color: p.color, speed: 120, size: p.size * 0.4, life: 0.3 });
        this.remove(i);
      }
    }
  }
  private remove(i: number) { this.list[i].sprite.removeFromParent(); this.list[i].sprite.material.dispose(); this.list.splice(i, 1); }
  dispose() { while (this.list.length) this.remove(this.list.length - 1); }
}

/* ---------------------------------------------------------------- Apex Armor */
export class ApexController implements PowerController {
  private cd = new Cooldowns();
  private proj: ProjectileSystem;
  private charge: Record<Side, number> = { left: 0, right: 0 };
  private charging: Record<Side, boolean> = { left: false, right: false };
  private lastFrame: BodyFrame | null = null;
  constructor(private ctx: PowerContext) { this.proj = new ProjectileSystem(ctx); }

  private fire(side: Side, f: BodyFrame, id: 'repulsor' | 'charged', level = 1) {
    const tu = this.ctx.tuning(id);
    const t = performance.now();
    if (!this.cd.ready(id, t)) return;
    this.cd.use(id, t, tu.cooldownMs);
    const o = this.ctx.rig.palmOrWrist(f, side);
    const sw = f.shoulderWidth;
    const aim = aimFrom(f, side, o, this.ctx.world, tu.range * sw, this.ctx.aimAssist);
    const big = id === 'charged';
    const size = sw * (big ? 0.35 + 0.35 * level : 0.22) * Math.sqrt(tu.intensity);
    this.proj.fire({ x: o.x, y: o.y, dx: aim.dx, dy: aim.dy, speed: tu.speed * sw, range: tu.range * sw, radius: size * 0.35, damage: (big ? 45 * level : 18) * tu.intensity, push: (big ? 900 : 380) * tu.intensity, color: tu.color, size });
    this.ctx.particles.emit({ x: o.x, y: o.y, count: big ? 60 : 24, color: tu.color, speed: big ? 500 : 300, size: size * 0.4, life: 0.3, dir: { x: aim.dx, y: aim.dy }, spread: 1.2, drag: 5 });
    if (big) { this.ctx.world.shockwave(o.x, o.y, sw * 0.9, tu.color, 0.35, 1); this.ctx.stage.addShake(10 * level); }
    this.ctx.rig.emitterBoost[side] = big ? 1.5 : 0.9;
    this.ctx.fired(id);
  }

  onGesture(e: GestureEvent, f: BodyFrame) {
    if (!this.ctx.suitReady() || !e.side) return;
    if (e.gesture !== 'palm') return;
    const s = e.side;
    if (e.type === 'start') { this.fire(s, f, 'repulsor'); this.charging[s] = true; this.charge[s] = 0; }
    else if (e.type === 'hold' && this.charging[s]) {
      const tu = this.ctx.tuning('charged');
      this.charge[s] = Math.min(1, Math.max(0, (e.heldMs - 350) / tu.chargeMs));
    } else if (e.type === 'end') {
      if (this.charge[s] >= 0.35) this.fire(s, f, 'charged', this.charge[s]);
      this.charging[s] = false; this.charge[s] = 0;
    }
  }

  update(dt: number, f: BodyFrame | null) {
    this.lastFrame = f;
    this.proj.update(dt);
    for (const s of SIDES) {
      const rig = this.ctx.rig;
      rig.emitterBoost[s] = Math.max(this.charge[s] * 0.8, rig.emitterBoost[s] * Math.exp(-dt * 6));
      if (f && this.charge[s] > 0.05) {
        const o = rig.palmOrWrist(f, s);
        this.ctx.particles.emit({ x: o.x, y: o.y, count: 3 + Math.round(this.charge[s] * 6), color: this.ctx.tuning('charged').color, speed: 30, size: 8, life: 0.4, radius: f.shoulderWidth * 0.6, attract: o });
      }
    }
  }

  cooldowns(t: number) { return { repulsor: this.cd.remaining('repulsor', t), charged: this.cd.remaining('charged', t) }; }
  status() {
    const c = Math.max(this.charge.left, this.charge.right);
    return c > 0.05 ? `Charging ${Math.round(c * 100)}%` : this.lastFrame?.hands.left || this.lastFrame?.hands.right ? 'Emitters online' : 'Show a hand to arm emitters';
  }
  dispose() { this.proj.dispose(); }
}

/* ---------------------------------------------------------------- Webrunner */
interface Web {
  side: Side; state: 'flying' | 'attached' | 'slack';
  head: { x: number; y: number }; vx: number; vy: number; traveled: number; range: number;
  pts: { x: number; y: number; px: number; py: number }[];
  rest: number; target: TargetBody | null; off: { x: number; y: number }; reeling: boolean; life: number; tube: Tube;
}
const ROPE_N = 22;

export class WebrunnerController implements PowerController {
  private cd = new Cooldowns();
  private webs: Record<Side, Web | null> = { left: null, right: null };
  private mat = new THREE.MeshBasicMaterial({ color: '#f2f6ff', toneMapped: false, transparent: true });
  constructor(private ctx: PowerContext) {}

  private anchor(f: BodyFrame, side: Side) { const h = f.hands[side]; return h ? h.lm[9] : f.joints[side === 'left' ? 'lWrist' : 'rWrist']; }

  private launch(side: Side, f: BodyFrame) {
    const tu = this.ctx.tuning('web'); const t = performance.now();
    if (!this.cd.ready('web', t)) return;
    this.cd.use('web', t, tu.cooldownMs);
    this.release(side);
    const a = this.anchor(f, side), sw = f.shoulderWidth;
    const aim = aimFrom(f, side, a, this.ctx.world, tu.range * sw, this.ctx.aimAssist);
    const tube = new Tube(ROPE_N - 1, 5, this.mat);
    this.ctx.stage.root.add(tube.mesh);
    const pts = Array.from({ length: ROPE_N }, () => ({ x: a.x, y: a.y, px: a.x, py: a.y }));
    this.webs[side] = { side, state: 'flying', head: { x: a.x, y: a.y }, vx: aim.dx * tu.speed * sw, vy: aim.dy * tu.speed * sw, traveled: 0, range: tu.range * sw, pts, rest: 0, target: null, off: { x: 0, y: 0 }, reeling: false, life: 1, tube };
    this.ctx.particles.emit({ x: a.x, y: a.y, count: 14, color: '#ffffff', speed: 200, size: 6, life: 0.25, dir: aim.dx ? { x: aim.dx, y: aim.dy } : undefined, spread: 0.8 });
    this.ctx.fired('web');
  }

  private release(side: Side) {
    const w = this.webs[side];
    if (!w) return;
    if (w.target) w.target.grabbed = Math.max(0, w.target.grabbed - 1);
    w.state = 'slack'; w.target = null; w.reeling = false;
  }

  onGesture(e: GestureEvent, f: BodyFrame) {
    if (!this.ctx.suitReady() || !e.side || e.type !== 'start') return;
    const w = this.webs[e.side];
    if (e.gesture === 'web') this.launch(e.side, f);
    else if (e.gesture === 'fist' && w?.state === 'attached') {
      const t = performance.now();
      if (!this.cd.ready('pull', t)) return;
      this.cd.use('pull', t, this.ctx.tuning('pull').cooldownMs);
      w.reeling = true; this.ctx.fired('pull');
    } else if (e.gesture === 'palm' && w && w.state !== 'slack') this.release(e.side);
  }

  update(dt: number, f: BodyFrame | null) {
    for (const side of SIDES) {
      const w = this.webs[side];
      if (!w) continue;
      const a = f ? this.anchor(f, side) : w.pts[0];
      const sw = f?.shoulderWidth ?? 100;
      const world = this.ctx.world;
      if (w.state === 'flying') {
        const nx = w.head.x + w.vx * dt, ny = w.head.y + w.vy * dt;
        const hit = world.sweep(w.head.x, w.head.y, nx, ny, sw * 0.04);
        if (hit) {
          const hx = w.head.x + (nx - w.head.x) * hit.frac, hy = w.head.y + (ny - w.head.y) * hit.frac;
          w.state = 'attached'; w.target = hit.target; w.off = { x: hx - hit.target.x, y: hy - hit.target.y };
          hit.target.grabbed++;
          w.rest = Math.hypot(hx - a.x, hy - a.y);
          const tu = this.ctx.tuning('web');
          world.hit(hit.target, 6 * tu.intensity, 0, 0, hx, hy, '#ffffff');
          w.head = { x: hx, y: hy };
        } else {
          w.head = { x: nx, y: ny }; w.traveled += Math.hypot(w.vx, w.vy) * dt;
          if (w.traveled > w.range) w.state = 'slack';
        }
      } else if (w.state === 'attached' && w.target) {
        const T = w.target;
        if (T.state === 'DESTROYED') this.release(side);
        else {
          const tu = this.ctx.tuning('pull');
          if (w.reeling) w.rest = Math.max(sw * 0.5, w.rest - tu.speed * sw * dt);
          const px = T.x + w.off.x, py = T.y + w.off.y;
          const dx = a.x - px, dy = a.y - py, d = Math.hypot(dx, dy) || 1;
          if (d > w.rest) {
            // spring constraint: the rope pulls the target toward the hand
            const k = 14 * (w.reeling ? tu.intensity : 0.5);
            T.vx += (dx / d) * (d - w.rest) * k * dt; T.vy += (dy / d) * (d - w.rest) * k * dt;
          }
          w.head = { x: px, y: py };
          if (w.reeling && d < sw * 0.9) {
            world.hit(T, 45 * tu.intensity, (dx / d) * 300 * T.mass, 400 * T.mass, px, py, '#ffffff');
            this.ctx.stage.addShake(6);
            this.release(side);
          }
        }
      }
      // verlet rope
      const P = w.pts, n = P.length;
      const g = (this.ctx.world.phys.gravity * 0.35) * dt * dt;
      for (let i = 1; i < n; i++) {
        const p = P[i]; const vx = (p.x - p.px) * 0.97, vy = (p.y - p.py) * 0.97;
        p.px = p.x; p.py = p.y; p.x += vx; p.y += vy - g;
      }
      const end = w.state === 'slack' ? null : w.head;
      const total = w.state === 'flying' ? Math.hypot(w.head.x - a.x, w.head.y - a.y) * 1.03 : w.state === 'attached' ? w.rest : (w.rest || Math.hypot(P[n - 1].x - a.x, P[n - 1].y - a.y));
      const seg = Math.max(1, total / (n - 1));
      for (let it = 0; it < 10; it++) {
        P[0].x = a.x; P[0].y = a.y;
        if (end) { P[n - 1].x = end.x; P[n - 1].y = end.y; }
        for (let i = 0; i < n - 1; i++) {
          const p = P[i], q = P[i + 1];
          const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-6;
          const diff = (d - seg) / d * 0.5;
          if (d > seg || w.state !== 'attached') {
            if (i > 0) { p.x += dx * diff; p.y += dy * diff; }
            if (i + 1 < n - 1 || !end) { q.x -= dx * diff; q.y -= dy * diff; }
          }
        }
      }
      if (w.state === 'slack') { w.rest = w.rest || total; w.life -= dt * 0.9; }
      this.mat.opacity = 1;
      w.tube.update(P.map((p) => ({ x: p.x, y: p.y, z: 200 })), () => sw * 0.012 * Math.max(0.2, w.life));
      if (w.life <= 0) { w.tube.mesh.removeFromParent(); w.tube.dispose(); this.webs[side] = null; }
    }
  }

  cooldowns(t: number) { return { web: this.cd.remaining('web', t), pull: this.cd.remaining('pull', t) }; }
  status() {
    const att = SIDES.filter((s) => this.webs[s]?.state === 'attached').length;
    return att ? `${att} web line${att > 1 ? 's' : ''} attached — make a fist to pull` : 'Web shooters ready';
  }
  dispose() { for (const s of SIDES) { this.release(s); const w = this.webs[s]; if (w) { w.tube.mesh.removeFromParent(); w.tube.dispose(); } this.webs[s] = null; } this.mat.dispose(); }
}

/* ---------------------------------------------------------------- Verdant Titan */
interface Slam { x: number; t0: number; speed: number; maxR: number; hit: Set<number>; lastDust: number }

export class TitanController implements PowerController {
  private cd = new Cooldowns();
  private slams: Slam[] = [];
  private chargingUp = false;
  private time = 0;
  constructor(private ctx: PowerContext) {}

  onGesture(e: GestureEvent, f: BodyFrame) {
    if (!this.ctx.suitReady()) return;
    const t = performance.now();
    if (e.gesture === 'armsUp') this.chargingUp = e.type !== 'end';
    if (e.gesture === 'punch' && e.side && e.dir) {
      const tu = this.ctx.tuning('punch');
      if (!this.cd.ready('punch', t)) return;
      this.cd.use('punch', t, tu.cooldownMs);
      const w = f.joints[e.side === 'left' ? 'lWrist' : 'rWrist'];
      const sw = f.shoulderWidth, range = tu.range * sw;
      const power = Math.min(1.6, Math.max(0.7, (e.speed ?? 6) / 7));
      this.ctx.world.shockwave(w.x, w.y, sw * 0.7, tu.color, 0.3, 1);
      this.ctx.particles.emit({ x: w.x, y: w.y, count: 40, color: tu.color, speed: 600, size: 14, life: 0.35, dir: e.dir, spread: 1.0, drag: 5 });
      for (const T of this.ctx.world.targets) {
        if (T.state === 'DESTROYED') continue;
        const cx = Math.max(T.x - T.w / 2, Math.min(w.x, T.x + T.w / 2)), cy = Math.max(T.y - T.h / 2, Math.min(w.y, T.y + T.h / 2));
        const dx = cx - w.x, dy = cy - w.y, d = Math.hypot(dx, dy);
        const facing = d < 1 || (dx * e.dir.x + dy * e.dir.y) / d > 0.35;
        if (d <= range && facing) {
          this.ctx.world.hit(T, 35 * tu.intensity * power, e.dir.x * 900 * tu.intensity * T.mass, (e.dir.y * 900 + 250) * tu.intensity * T.mass, cx, cy, tu.color);
        }
      }
      this.ctx.stage.addShake(10 * power);
      this.ctx.fired('punch');
    }
    if (e.gesture === 'slam') {
      const tu = this.ctx.tuning('slam');
      if (!this.cd.ready('slam', t)) return;
      this.cd.use('slam', t, tu.cooldownMs);
      this.chargingUp = false;
      const j = f.joints, sw = f.shoulderWidth;
      const x = j.lAnkle.v > 0.4 && j.rAnkle.v > 0.4 ? (j.lAnkle.x + j.rAnkle.x) / 2 : (j.lHip.x + j.rHip.x) / 2;
      this.slams.push({ x, t0: this.time, speed: tu.speed * sw, maxR: tu.range * sw, hit: new Set(), lastDust: 0 });
      this.ctx.world.shockwave(x, this.ctx.world.phys.groundY, tu.range * sw, tu.color, 0.9);
      this.ctx.world.shockwave(x, this.ctx.world.phys.groundY, tu.range * sw * 0.6, '#ffffff', 0.6);
      this.ctx.stage.addShake(28 * tu.intensity);
      this.ctx.fired('slam');
    }
  }

  update(dt: number, f: BodyFrame | null) {
    this.time += dt;
    const world = this.ctx.world, g = world.phys.groundY;
    if (this.chargingUp && f) {
      for (const s of SIDES) {
        const w = f.joints[s === 'left' ? 'lWrist' : 'rWrist'];
        this.ctx.particles.emit({ x: w.x, y: w.y, count: 3, color: this.ctx.tuning('slam').color, speed: 40, size: 12, life: 0.5, radius: f.shoulderWidth * 0.5, attract: w });
      }
    }
    for (let i = this.slams.length - 1; i >= 0; i--) {
      const s = this.slams[i];
      const r = (this.time - s.t0) * s.speed;
      const tu = this.ctx.tuning('slam');
      if (this.time - s.lastDust > 0.04 && r < s.maxR) {
        s.lastDust = this.time;
        for (const dir of [-1, 1]) this.ctx.particles.emit({ x: s.x + dir * r, y: g + 4, count: 8, color: '#c9bfae', speed: 260, size: 22, life: 0.8, dir: { x: dir * 0.3, y: 1 }, spread: 1.2, gravity: 500, drag: 2 });
      }
      for (const T of world.targets) {
        if (T.state === 'DESTROYED' || s.hit.has(T.id)) continue;
        const dx = T.x - s.x;
        if (Math.abs(dx) - T.w / 2 <= r && Math.abs(dx) <= s.maxR && (T.y - T.h / 2) < g + world.H * 0.3) {
          s.hit.add(T.id);
          const fall = 1 - 0.5 * Math.min(1, Math.abs(dx) / s.maxR);
          world.hit(T, 40 * tu.intensity * fall, Math.sign(dx || 1) * 450 * T.mass * tu.intensity, 1100 * T.mass * tu.intensity * fall, T.x, T.y - T.h / 2, tu.color);
        }
      }
      if (r > s.maxR) this.slams.splice(i, 1);
    }
  }

  cooldowns(t: number) { return { punch: this.cd.remaining('punch', t), slam: this.cd.remaining('slam', t) }; }
  status() { return this.chargingUp ? 'Arms raised — slam down!' : 'Ready to smash'; }
  dispose() { this.slams = []; }
}

/* ---------------------------------------------------------------- Void Symbiont */
interface Tendril { side: Side; tube: Tube; len: number; maxLen: number; dir: number; target: TargetBody | null; state: 'extend' | 'latched' | 'retract'; phase: number; latchedFor: number; tip: { x: number; y: number } }

export class SymbiontController implements PowerController {
  private cd = new Cooldowns();
  private tendrils: Tendril[] = [];
  private mat: THREE.MeshPhysicalMaterial;
  private time = 0;
  constructor(private ctx: PowerContext) {
    this.mat = new THREE.MeshPhysicalMaterial({ color: '#08080c', roughness: 0.12, metalness: 0.25, clearcoat: 1, emissive: ctx.tuning('tendrils').color, emissiveIntensity: 0.15 });
  }

  private base(f: BodyFrame, side: Side) { const h = f.hands[side]; return h ? h.lm[0] : f.joints[side === 'left' ? 'lWrist' : 'rWrist']; }

  onGesture(e: GestureEvent, f: BodyFrame) {
    if (!this.ctx.suitReady() || !e.side) return;
    const side = e.side, t = performance.now();
    if (e.gesture === 'palm' && e.type === 'start') {
      const tu = this.ctx.tuning('tendrils');
      if (!this.cd.ready('tendrils', t)) return;
      this.cd.use('tendrils', t, tu.cooldownMs);
      const b = this.base(f, side), sw = f.shoulderWidth, range = tu.range * sw;
      const aim = aimFrom(f, side, b, this.ctx.world, range, this.ctx.aimAssist);
      const taken = new Set<number>(this.tendrils.filter((x) => x.target).map((x) => x.target!.id));
      const baseAng = Math.atan2(aim.dy, aim.dx);
      for (let k = 0; k < 3; k++) {
        const tgt = this.ctx.world.nearest(b.x, b.y, range, taken);
        if (tgt) taken.add(tgt.id);
        const tube = new Tube(20, 6, this.mat);
        this.ctx.stage.root.add(tube.mesh);
        this.tendrils.push({ side, tube, len: 0, maxLen: range, dir: baseAng + (k - 1) * 0.35, target: tgt, state: 'extend', phase: Math.random() * 6, latchedFor: 0, tip: { x: b.x, y: b.y } });
      }
      this.ctx.fired('tendrils');
    } else if (e.gesture === 'palm' && e.type === 'end') {
      for (const td of this.tendrils) if (td.side === side && td.state === 'extend') td.state = 'retract';
    } else if (e.gesture === 'fist' && e.type === 'start') {
      const latched = this.tendrils.filter((x) => x.side === side && x.state === 'latched' && x.target);
      if (!latched.length) return;
      const tu = this.ctx.tuning('tpull');
      if (!this.cd.ready('tpull', t)) return;
      this.cd.use('tpull', t, tu.cooldownMs);
      const b = this.base(f, side);
      for (const td of latched) {
        const T = td.target!;
        const dx = b.x - T.x, dy = b.y - T.y, d = Math.hypot(dx, dy) || 1;
        this.ctx.world.hit(T, 35 * tu.intensity, (dx / d) * 1100 * tu.intensity * T.mass, ((dy / d) * 1100 + 300) * tu.intensity * T.mass, T.x, T.y, tu.color);
        T.grabbed = Math.max(0, T.grabbed - 1);
        td.target = null; td.state = 'retract';
      }
      this.ctx.stage.addShake(8);
      this.ctx.fired('tpull');
    }
  }

  update(dt: number, f: BodyFrame | null) {
    this.time += dt;
    if (!f) return;
    const sw = f.shoulderWidth;
    const speed = this.ctx.tuning('tendrils').speed * sw;
    const color = this.ctx.tuning('tendrils').color;
    this.mat.emissive.set(color);
    for (let i = this.tendrils.length - 1; i >= 0; i--) {
      const td = this.tendrils[i];
      const b = this.base(f, td.side);
      let gx: number, gy: number;
      if (td.target && td.target.state !== 'DESTROYED') { gx = td.target.x; gy = td.target.y; }
      else {
        if (td.target) { td.target.grabbed = Math.max(0, td.target.grabbed - (td.state === 'latched' ? 1 : 0)); td.target = null; if (td.state === 'latched') td.state = 'retract'; }
        gx = b.x + Math.cos(td.dir) * td.maxLen; gy = b.y + Math.sin(td.dir) * td.maxLen;
      }
      const dist = Math.hypot(gx - b.x, gy - b.y) || 1;
      if (td.state === 'extend') {
        td.len = Math.min(td.maxLen, td.len + speed * dt);
        if (td.target && td.len >= dist - Math.min(td.target.w, td.target.h) * 0.3) {
          td.state = 'latched'; td.target.grabbed++;
          this.ctx.world.hit(td.target, 8 * this.ctx.tuning('tendrils').intensity, 0, 0, gx, gy, color);
        } else if (!td.target && td.len >= td.maxLen) td.state = 'retract';
      } else if (td.state === 'latched') {
        td.len = dist; td.latchedFor += dt;
        if (td.latchedFor > 4) { if (td.target) td.target.grabbed = Math.max(0, td.target.grabbed - 1); td.target = null; td.state = 'retract'; }
      } else {
        td.len -= speed * 1.6 * dt;
        if (td.len <= 0) { td.tube.mesh.removeFromParent(); td.tube.dispose(); this.tendrils.splice(i, 1); continue; }
      }
      const reach = Math.min(td.len, dist);
      const ux = (gx - b.x) / dist, uy = (gy - b.y) / dist;
      const px = -uy, py = ux;
      const taut = td.state === 'latched' ? 0.25 : 1;
      const pts = [];
      for (let k = 0; k <= 20; k++) {
        const u = k / 20;
        const wave = Math.sin(u * 7 - this.time * 9 + td.phase) * Math.sin(u * Math.PI) * sw * 0.16 * taut;
        pts.push({ x: b.x + ux * reach * u + px * wave, y: b.y + uy * reach * u + py * wave, z: 150 });
      }
      td.tip = pts[20];
      td.tube.update(pts, (u) => sw * (0.05 - 0.038 * u));
      if (Math.random() < 0.3) this.ctx.particles.emit({ x: td.tip.x, y: td.tip.y, count: 2, color, speed: 50, size: 9, life: 0.4, gravity: 200 });
    }
  }

  cooldowns(t: number) { return { tendrils: this.cd.remaining('tendrils', t), tpull: this.cd.remaining('tpull', t) }; }
  status() {
    const l = this.tendrils.filter((x) => x.state === 'latched').length;
    return l ? `${l} tendril${l > 1 ? 's' : ''} latched — make a fist to pull` : this.tendrils.length ? 'Tendrils seeking…' : 'Symbiote dormant';
  }
  dispose() { for (const t of this.tendrils) { t.target && (t.target.grabbed = 0); t.tube.mesh.removeFromParent(); t.tube.dispose(); } this.tendrils = []; this.mat.dispose(); }
}

export function createController(ctx: PowerContext): PowerController {
  switch (ctx.def.id) {
    case 'webrunner': return new WebrunnerController(ctx);
    case 'titan': return new TitanController(ctx);
    case 'symbiont': return new SymbiontController(ctx);
    default: return new ApexController(ctx);
  }
}
