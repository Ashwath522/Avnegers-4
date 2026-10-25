import type { CharacterDef, PowerTuning } from '../characters/types';
import type { GestureEvent } from '../gestures/GestureEngine';
import type { ArmorRig } from '../rendering/ArmorRig';
import type { Particles } from '../rendering/Particles';
import type { Stage } from '../rendering/Stage';
import type { BodyFrame } from '../tracking/types';
import type { World } from '../world/World';

export interface PowerContext {
  def: CharacterDef;
  stage: Stage;
  world: World;
  particles: Particles;
  rig: ArmorRig;
  tuning: (powerId: string) => PowerTuning;
  /** called whenever a power actually fires (stats / UI log) */
  fired: (powerId: string) => void;
  /** whether the suit is ready (transformation complete) */
  suitReady: () => boolean;
  aimAssist: number; // 0..1
}

export interface PowerController {
  onGesture(e: GestureEvent, f: BodyFrame): void;
  update(dt: number, f: BodyFrame | null, t: number): void;
  /** ms until each power is ready again (0 = ready) */
  cooldowns(t: number): Record<string, number>;
  /** extra state for the HUD, e.g. "charging 60%" */
  status(): string;
  dispose(): void;
}

export class Cooldowns {
  private readyAt = new Map<string, number>();
  ready(id: string, t: number) { return t >= (this.readyAt.get(id) ?? 0); }
  use(id: string, t: number, ms: number) { this.readyAt.set(id, t + ms); }
  remaining(id: string, t: number) { return Math.max(0, (this.readyAt.get(id) ?? 0) - t); }
}
