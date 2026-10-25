/**
 * Hysteresis + hold-time + cooldown state machine for a single gesture channel.
 *
 *  idle ──score≥activate──▶ arming ──held ≥ minHoldMs──▶ active ──score<release──▶ cooldown ──cooldownMs──▶ idle
 *                 ▲             │ score<release
 *                 └─────────────┘
 *
 * Score is smoothed with an exponential moving average so single-frame spikes never fire.
 */
export type GState = 'idle' | 'arming' | 'active' | 'cooldown';
export type GEventType = 'start' | 'hold' | 'end';
export interface GEvent { type: GEventType; heldMs: number }

export interface GestureParams {
  activate: number;      // smoothed score needed to begin arming
  release: number;       // smoothed score below which an active gesture ends
  minHoldMs: number;     // time above threshold before 'start' fires
  cooldownMs: number;    // dead time after 'end'
  smoothing: number;     // EMA factor 0..1 (higher = more responsive)
}

export const DEFAULT_PARAMS: GestureParams = { activate: 0.7, release: 0.45, minHoldMs: 120, cooldownMs: 250, smoothing: 0.45 };

export class GestureMachine {
  state: GState = 'idle';
  score = 0;
  private since = 0;
  private activeSince = 0;
  constructor(public params: GestureParams = { ...DEFAULT_PARAMS }) {}

  /** Feed one frame. Returns events produced this frame (0 or 1, 'hold' every frame while active). */
  update(raw: number, t: number): GEvent | null {
    const p = this.params;
    this.score = this.score + (raw - this.score) * p.smoothing;
    const s = this.score;
    switch (this.state) {
      case 'idle':
        if (s >= p.activate) { this.state = 'arming'; this.since = t; }
        return null;
      case 'arming':
        if (s < p.release) { this.state = 'idle'; return null; }
        if (t - this.since >= p.minHoldMs) { this.state = 'active'; this.activeSince = t; return { type: 'start', heldMs: 0 }; }
        return null;
      case 'active':
        if (s < p.release) { this.state = 'cooldown'; this.since = t; return { type: 'end', heldMs: t - this.activeSince }; }
        return { type: 'hold', heldMs: t - this.activeSince };
      case 'cooldown':
        if (t - this.since >= p.cooldownMs) this.state = 'idle';
        return null;
    }
  }

  /** Force-end (e.g. tracking lost). */
  reset(t: number): GEvent | null {
    const wasActive = this.state === 'active';
    this.state = 'idle'; this.score = 0;
    return wasActive ? { type: 'end', heldMs: t - this.activeSince } : null;
  }
}
