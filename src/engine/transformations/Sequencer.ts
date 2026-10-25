import type { ComponentId, SequenceStep } from '../characters/types';

export type SeqState = 'idle' | 'running' | 'paused' | 'complete';
export type StepStatus = 'waiting' | 'active' | 'complete';

/**
 * Data-driven transformation timeline. Pure: time is fed in, so it is deterministic and testable.
 * Components not referenced by any step are treated as present from the start.
 */
export class Sequencer {
  state: SeqState = 'idle';
  elapsed = 0;
  speed = 1;
  private steps: SequenceStep[] = [];
  private all: ComponentId[] = [];

  load(steps: SequenceStep[], components: ComponentId[]) {
    this.steps = [...steps].sort((a, b) => a.start - b.start);
    this.all = components;
    this.state = 'idle'; this.elapsed = 0;
  }

  get totalMs() { return this.steps.reduce((m, s) => Math.max(m, s.start + s.duration), 0); }
  get progress() { return this.state === 'complete' ? 1 : this.totalMs ? Math.min(1, this.elapsed / this.totalMs) : 1; }
  get stepList() { return this.steps; }

  start() { if (this.state === 'running') return false; this.elapsed = 0; this.state = 'running'; return true; }
  pause() { if (this.state === 'running') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'running'; }
  restart() { this.elapsed = 0; this.state = 'running'; }
  complete() { this.elapsed = this.totalMs; this.state = 'complete'; }
  /** Remove the suit (back to civilian). */
  reset() { this.elapsed = 0; this.state = 'idle'; }

  tick(dtMs: number) {
    if (this.state !== 'running') return;
    this.elapsed += dtMs * this.speed;
    if (this.elapsed >= this.totalMs) { this.elapsed = this.totalMs; this.state = 'complete'; }
  }

  stepStatus(s: SequenceStep): StepStatus {
    if (this.state === 'complete') return 'complete';
    if (this.state === 'idle') return 'waiting';
    if (this.elapsed >= s.start + s.duration) return 'complete';
    if (this.elapsed >= s.start) return 'active';
    return 'waiting';
  }

  stepProgress(s: SequenceStep) {
    if (this.state === 'complete') return 1;
    if (this.state === 'idle') return 0;
    return Math.max(0, Math.min(1, (this.elapsed - s.start) / s.duration));
  }

  /** 0..1 materialization for each component. */
  componentProgress(): Map<ComponentId, number> {
    const m = new Map<ComponentId, number>();
    for (const c of this.all) m.set(c, this.state === 'idle' ? 0 : 1);
    if (this.state === 'complete' || this.state === 'idle') return m;
    for (const s of this.steps) for (const c of s.components) m.set(c, this.stepProgress(s));
    return m;
  }

  currentStep(): SequenceStep | null {
    if (this.state !== 'running' && this.state !== 'paused') return null;
    let cur: SequenceStep | null = null;
    for (const s of this.steps) if (this.elapsed >= s.start) cur = s;
    return cur;
  }
}
