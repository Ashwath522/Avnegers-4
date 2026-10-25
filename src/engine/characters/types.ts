import type { GestureId } from '../gestures/GestureEngine';

export type ComponentId =
  | 'head' | 'chest' | 'core' | 'belt'
  | 'lShoulder' | 'rShoulder' | 'lUpperArm' | 'rUpperArm' | 'lForearm' | 'rForearm' | 'lHand' | 'rHand'
  | 'lThigh' | 'rThigh' | 'lShin' | 'rShin' | 'lFoot' | 'rFoot' | 'tendrils';

export const ALL_COMPONENTS: ComponentId[] = [
  'head', 'chest', 'core', 'belt', 'lShoulder', 'rShoulder', 'lUpperArm', 'rUpperArm', 'lForearm', 'rForearm',
  'lHand', 'rHand', 'lThigh', 'rThigh', 'lShin', 'rShin', 'lFoot', 'rFoot', 'tendrils',
];

export type PowerKind = 'repulsor' | 'chargedBlast' | 'web' | 'webPull' | 'punch' | 'slam' | 'tendrils' | 'tendrilPull';
export const POWER_KINDS: PowerKind[] = ['repulsor', 'chargedBlast', 'web', 'webPull', 'punch', 'slam', 'tendrils', 'tendrilPull'];

export interface PowerTuning {
  intensity: number;   // damage / visual scale multiplier, 0.2..2
  range: number;       // in shoulder-widths
  speed: number;       // projectile speed in shoulder-widths per second
  cooldownMs: number;
  color: string;       // hex
  particles: number;   // particle density multiplier 0..2
  chargeMs: number;    // charge time where relevant
}

export interface PowerDef {
  id: string;
  name: string;
  kind: PowerKind;
  gesture: GestureId;
  hint: string;        // how to perform it
  description: string;
  tuning: PowerTuning;
}

export type MaterializeEffect = 'particles' | 'converge' | 'mechanical' | 'organic';

export interface SequenceStep {
  id: string;
  label: string;
  components: ComponentId[];
  start: number;       // ms
  duration: number;    // ms
  effect: MaterializeEffect;
}

export type Surface = 'metal' | 'suit' | 'skin' | 'organic';
export type HeadStyle = 'helmet' | 'mask' | 'bare' | 'organic';

export interface CharacterDef {
  id: string;
  name: string;
  archetype: string;
  tagline: string;
  palette: { primary: string; secondary: string; trim: string; energy: string; eyes: string };
  surface: Surface;
  headStyle: HeadStyle;
  bulk: number;        // limb thickness multiplier
  components: ComponentId[];
  powers: PowerDef[];
  sequence: SequenceStep[];
  assetStatus: 'procedural-placeholder' | 'model';
}
