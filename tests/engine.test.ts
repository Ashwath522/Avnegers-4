import { describe, expect, it } from 'vitest';
import { GestureMachine } from '../src/engine/gestures/GestureMachine';
import { Sequencer } from '../src/engine/transformations/Sequencer';
import { CHARACTERS, APEX } from '../src/engine/characters/registry';
import { validateCharacter, validateSequence } from '../src/engine/characters/validate';
import { applyHit, integrate, makeTarget, segmentHitsBox, settleState } from '../src/engine/world/targetLogic';
import { fingerExtension, palmFacing, synthHand } from '../src/engine/tracking/handMath';
import { handScores } from '../src/engine/gestures/GestureEngine';
import { mapPoint } from '../src/engine/tracking/mapping';
import { OneEuro } from '../src/engine/tracking/smoothing';
import { simulatePose } from '../src/engine/tracking/simulated';
import { Cooldowns } from '../src/engine/powers/types';

const feed = (m: GestureMachine, score: number, from: number, to: number, step = 16) => {
  const evs: string[] = [];
  for (let t = from; t <= to; t += step) { const e = m.update(score, t); if (e && e.type !== 'hold') evs.push(e.type); }
  return evs;
};

describe('GestureMachine', () => {
  it('ignores a single-frame spike', () => {
    const m = new GestureMachine();
    expect(m.update(1, 0)).toBeNull();
    expect(feed(m, 0, 16, 400)).toEqual([]);
    expect(m.state).toBe('idle');
  });
  it('fires start after the hold time and end on release', () => {
    const m = new GestureMachine({ activate: 0.7, release: 0.4, minHoldMs: 100, cooldownMs: 200, smoothing: 1 });
    expect(feed(m, 1, 0, 80)).toEqual([]);
    expect(feed(m, 1, 96, 200)).toEqual(['start']);
    expect(feed(m, 0, 216, 232)).toEqual(['end']);
    expect(m.state).toBe('cooldown');
  });
  it('respects cooldown before re-arming', () => {
    const m = new GestureMachine({ activate: 0.7, release: 0.4, minHoldMs: 0, cooldownMs: 300, smoothing: 1 });
    feed(m, 1, 0, 32); feed(m, 0, 48, 48);
    expect(feed(m, 1, 64, 200)).toEqual([]);           // still cooling down
    expect(feed(m, 1, 400, 480)).toEqual(['start']);
  });
  it('hysteresis keeps an active gesture through small dips', () => {
    const m = new GestureMachine({ activate: 0.7, release: 0.4, minHoldMs: 0, cooldownMs: 0, smoothing: 1 });
    feed(m, 1, 0, 32);
    expect(feed(m, 0.5, 48, 200)).toEqual([]);
    expect(m.state).toBe('active');
  });
});

describe('Cooldowns', () => {
  it('blocks until expiry', () => {
    const c = new Cooldowns();
    expect(c.ready('x', 0)).toBe(true);
    c.use('x', 0, 300);
    expect(c.ready('x', 299)).toBe(false);
    expect(c.remaining('x', 100)).toBe(200);
    expect(c.ready('x', 300)).toBe(true);
  });
});

describe('Sequencer', () => {
  const steps = [
    { id: 'a', label: 'A', components: ['lHand' as const], start: 0, duration: 100, effect: 'mechanical' as const },
    { id: 'b', label: 'B', components: ['head' as const], start: 100, duration: 100, effect: 'converge' as const },
  ];
  it('materializes components in order', () => {
    const s = new Sequencer(); s.load(steps, ['lHand', 'head', 'chest']);
    expect(s.componentProgress().get('lHand')).toBe(0);
    s.start(); s.tick(50);
    const p = s.componentProgress();
    expect(p.get('lHand')).toBeCloseTo(0.5); expect(p.get('head')).toBe(0); expect(p.get('chest')).toBe(1);
    expect(s.stepStatus(steps[0])).toBe('active'); expect(s.stepStatus(steps[1])).toBe('waiting');
    s.tick(200);
    expect(s.state).toBe('complete'); expect(s.progress).toBe(1);
  });
  it('pause, restart and reset', () => {
    const s = new Sequencer(); s.load(steps, ['lHand', 'head']);
    s.start(); s.tick(50); s.pause(); s.tick(1000);
    expect(s.elapsed).toBe(50);
    expect(s.start()).toBe(true);
    s.restart(); expect(s.elapsed).toBe(0);
    s.reset(); expect(s.componentProgress().get('head')).toBe(0);
  });
  it('rejects a second start while running', () => {
    const s = new Sequencer(); s.load(steps, ['lHand', 'head']);
    s.start(); expect(s.start()).toBe(false);
  });
});

describe('Character configuration', () => {
  it('all characters validate', () => {
    for (const c of CHARACTERS) expect(validateCharacter(c), c.id).toEqual([]);
  });
  it('catches bad sequences', () => {
    expect(validateSequence([{ id: 'x', label: '', components: ['nope' as any], start: -1, duration: 0, effect: 'particles' }], APEX.components).length).toBe(3);
  });
});

describe('Targets', () => {
  it('state transitions AVAILABLE → HIT → DAMAGED → DESTROYED', () => {
    const t = makeTarget(1, 'block', 0, 0, 100, 100, 100);
    expect(t.state).toBe('AVAILABLE');
    applyHit(t, 20, 0, 0); expect(t.state).toBe('HIT');
    settleState(t, 1); expect(t.state).toBe('AVAILABLE');
    applyHit(t, 40, 0, 0); expect(t.state).toBe('DAMAGED');
    expect(applyHit(t, 100, 0, 0)).toBe(true); expect(t.state).toBe('DESTROYED');
    expect(applyHit(t, 100, 0, 0)).toBe(false);
  });
  it('swept collision only when the segment actually crosses the box', () => {
    const box = { x: 100, y: 0, w: 20, h: 20 };
    expect(segmentHitsBox(0, 0, 200, 0, box)).toBeCloseTo(0.45);
    expect(segmentHitsBox(0, 50, 200, 50, box)).toBeNull();
    expect(segmentHitsBox(0, 0, 50, 0, box)).toBeNull();
    expect(segmentHitsBox(0, 18, 200, 18, box, 10)).not.toBeNull();
    expect(segmentHitsBox(0, 25, 200, 25, box, 10)).toBeNull();
  });
  it('impulse moves a target and gravity returns it to the ground', () => {
    const t = makeTarget(1, 'block', 500, 50, 100, 100, 100);
    applyHit(t, 1, 500 * t.mass, 800 * t.mass);
    const p = { gravity: 2000, restitution: 0.3, friction: 3, groundY: 0, minX: 0, maxX: 2000 };
    for (let i = 0; i < 200; i++) integrate(t, 1 / 60, p);
    expect(t.x).toBeGreaterThan(500);
    expect(t.y).toBeCloseTo(50, 0);
  });
});

describe('Hand features', () => {
  const open = synthHand({ x: 0.5, y: 0.5 }, { x: 0, y: -1 }, 0.1, 'right', [1, 1, 1, 1, 1], true);
  it('palm facing sign', () => {
    expect(palmFacing(open, 'right')).toBeGreaterThan(0.9);
    const back = synthHand({ x: 0.5, y: 0.5 }, { x: 0, y: -1 }, 0.1, 'right', [1, 1, 1, 1, 1], false);
    expect(palmFacing(back, 'right')).toBeLessThan(-0.9);
    const left = synthHand({ x: 0.5, y: 0.5 }, { x: 0, y: -1 }, 0.1, 'left', [1, 1, 1, 1, 1], true);
    expect(palmFacing(left, 'left')).toBeGreaterThan(0.9);
  });
  it('finger extension distinguishes open / fist', () => {
    const fist = synthHand({ x: 0.5, y: 0.5 }, { x: 0, y: -1 }, 0.1, 'right', [0, 0, 0, 0, 0]);
    expect(fingerExtension(open).slice(1).every((e) => e > 0.8)).toBe(true);
    expect(fingerExtension(fist).slice(1).every((e) => e < 0.2)).toBe(true);
  });
  it('gesture scores', () => {
    const asHand = (lm: ReturnType<typeof synthHand>, facing: number) => ({ side: 'right' as const, lm: lm.map((p) => ({ ...p, v: 1 })), score: 1, palm: { x: 0, y: 0, z: 0, v: 1 }, palmFacing: facing, size: 1 });
    const web = synthHand({ x: 0.5, y: 0.5 }, { x: 0, y: -1 }, 0.1, 'right', [1, 1, 0, 0, 1]);
    const fist = synthHand({ x: 0.5, y: 0.5 }, { x: 0, y: -1 }, 0.1, 'right', [0, 0, 0, 0, 0]);
    expect(handScores(asHand(open, 1)).palm).toBeGreaterThan(0.8);
    expect(handScores(asHand(open, -1)).palm).toBe(0);
    expect(handScores(asHand(web, 1)).web).toBeGreaterThan(0.8);
    expect(handScores(asHand(web, 1)).palm).toBeLessThan(0.6);
    expect(handScores(asHand(fist, 1)).fist).toBeGreaterThan(0.8);
  });
});

describe('Coordinate mapping', () => {
  it('maps cover-fit + mirror correctly', () => {
    const m = { W: 1000, H: 500, vw: 1280, vh: 720, mirror: true };
    const c = mapPoint(m, 0.5, 0.5);
    expect(c.x).toBeCloseTo(500); expect(c.y).toBeCloseTo(250);
    const l = mapPoint(m, 0.25, 0.5);
    expect(l.x).toBeGreaterThan(500);           // mirrored
    const top = mapPoint({ ...m, mirror: false }, 0.5, 0);
    expect(top.y).toBeGreaterThan(500);         // cover crops vertically, y-up
  });
});

describe('Smoothing', () => {
  it('OneEuro reduces jitter', () => {
    const f = new OneEuro(1, 0.0);
    let maxDev = 0;
    for (let i = 0; i < 100; i++) { const v = f.filter(100 + (i % 2 ? 5 : -5), i * 16); if (i > 20) maxDev = Math.max(maxDev, Math.abs(v - 100)); }
    expect(maxDev).toBeLessThan(2.5);
  });
});

describe('Simulated mannequin', () => {
  it('produces 33 pose + 2 hands and a recognisable palm gesture', () => {
    const s = simulatePose(1000, 'palm', 1000);
    expect(s.pose.length).toBe(33);
    expect(s.hands.length).toBe(2);
    const r = s.hands.find((h) => h.side === 'right')!;
    expect(palmFacing(r.lm, 'right')).toBeGreaterThan(0.5);
    expect(fingerExtension(r.lm).slice(1).every((e) => e > 0.7)).toBe(true);
  });
});
