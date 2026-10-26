import type { CharacterDef, ComponentId, PowerTuning } from './types';

const T = (p: Partial<PowerTuning>): PowerTuning => ({
  intensity: 1, range: 8, speed: 14, cooldownMs: 350, color: '#5fe1ff', particles: 1, chargeMs: 900, ...p,
});

const BODY: ComponentId[] = [
  'head', 'chest', 'core', 'belt', 'lShoulder', 'rShoulder', 'lUpperArm', 'rUpperArm', 'lForearm', 'rForearm',
  'lHand', 'rHand', 'lThigh', 'rThigh', 'lShin', 'rShin', 'lFoot', 'rFoot',
];

export const APEX: CharacterDef = {
  id: 'apex',
  name: 'Apex Armor',
  archetype: 'Technological armored hero',
  tagline: 'Advanced tech suit',
  palette: { primary: '#b3121c', secondary: '#2a2d33', trim: '#d9a441', energy: '#5fe1ff', eyes: '#bff6ff' },
  surface: 'metal', headStyle: 'helmet', bulk: 1,
  components: BODY,
  powers: [
    { id: 'repulsor', name: 'Energy Repulsor', kind: 'repulsor', gesture: 'palm', hint: 'Open palm toward the camera', description: 'Quick energy pulse from the palm emitter.', tuning: T({ intensity: 1, range: 10, speed: 18, cooldownMs: 300 }) },
    { id: 'charged', name: 'Charged Blast', kind: 'chargedBlast', gesture: 'palm', hint: 'Hold open palm to charge, close hand to release', description: 'Hold to build charge, close your hand to fire a heavy blast.', tuning: T({ intensity: 2.2, range: 14, speed: 14, cooldownMs: 900, chargeMs: 1100 }) },
  ],
  sequence: [
    { id: 'scan', label: 'Body Scan', components: [], start: 0, duration: 700, effect: 'particles' },
    { id: 'gauntlets', label: 'Gauntlet Assembly', components: ['lHand', 'rHand'], start: 600, duration: 700, effect: 'mechanical' },
    { id: 'arms', label: 'Arm Plating', components: ['lForearm', 'rForearm', 'lUpperArm', 'rUpperArm'], start: 1200, duration: 800, effect: 'mechanical' },
    { id: 'core', label: 'Chest Core Activation', components: ['chest', 'core'], start: 1900, duration: 800, effect: 'converge' },
    { id: 'torso', label: 'Shoulders & Torso', components: ['lShoulder', 'rShoulder', 'belt'], start: 2500, duration: 600, effect: 'mechanical' },
    { id: 'legs', label: 'Leg & Boot Armor', components: ['lThigh', 'rThigh', 'lShin', 'rShin', 'lFoot', 'rFoot'], start: 2900, duration: 900, effect: 'mechanical' },
    { id: 'helmet', label: 'Helmet Materialization', components: ['head'], start: 3700, duration: 700, effect: 'converge' },
  ],
  assetStatus: 'procedural-placeholder',
};

export const WEBRUNNER: CharacterDef = {
  id: 'webrunner',
  name: 'Webrunner',
  archetype: 'Agile web-slinging hero',
  tagline: 'Agile & fast',
  palette: { primary: '#8e0f2a', secondary: '#141c3a', trim: '#c9d3ff', energy: '#e9f1ff', eyes: '#e8f4ff' },
  surface: 'suit', headStyle: 'mask', bulk: 0.78,
  components: BODY,
  powers: [
    { id: 'web', name: 'Web Line', kind: 'web', gesture: 'web', hint: 'Index + pinky out, middle + ring folded', description: 'Launch a web line that attaches to what it hits.', tuning: T({ intensity: 0.4, range: 16, speed: 24, cooldownMs: 400, color: '#eef3ff' }) },
    { id: 'pull', name: 'Web Pull', kind: 'webPull', gesture: 'fist', hint: 'Make a fist while a web is attached', description: 'Yank an attached target toward your hand. Open palm releases.', tuning: T({ intensity: 1, range: 16, speed: 10, cooldownMs: 200, color: '#eef3ff' }) },
  ],
  sequence: [
    { id: 'scan', label: 'Body Scan', components: [], start: 0, duration: 500, effect: 'particles' },
    { id: 'weave', label: 'Suit Weave — Torso', components: ['chest', 'core', 'belt'], start: 400, duration: 700, effect: 'particles' },
    { id: 'limbs', label: 'Suit Weave — Limbs', components: ['lShoulder', 'rShoulder', 'lUpperArm', 'rUpperArm', 'lForearm', 'rForearm', 'lThigh', 'rThigh', 'lShin', 'rShin'], start: 900, duration: 900, effect: 'particles' },
    { id: 'gloves', label: 'Gloves & Boots', components: ['lHand', 'rHand', 'lFoot', 'rFoot'], start: 1700, duration: 500, effect: 'particles' },
    { id: 'mask', label: 'Mask Seal', components: ['head'], start: 2100, duration: 500, effect: 'converge' },
  ],
  assetStatus: 'procedural-placeholder',
};

export const TITAN: CharacterDef = {
  id: 'titan',
  name: 'Verdant Titan',
  archetype: 'Massive superhuman powerhouse',
  tagline: 'Pure strength',
  palette: { primary: '#2f6e2c', secondary: '#2b2622', trim: '#5c4a35', energy: '#38ff8b', eyes: '#b9ffcf' },
  surface: 'skin', headStyle: 'bare', bulk: 1.6,
  components: BODY.filter((c) => c !== 'core'),
  powers: [
    { id: 'punch', name: 'Titan Punch', kind: 'punch', gesture: 'punch', hint: 'Throw a fast punch outward', description: 'Short-range impact with heavy knockback.', tuning: T({ intensity: 1.6, range: 3.5, speed: 0, cooldownMs: 450, color: '#38ff8b' }) },
    { id: 'slam', name: 'Ground Slam', kind: 'slam', gesture: 'slam', hint: 'Raise both arms overhead, then drive them down', description: 'Shockwave along the ground that launches everything it reaches.', tuning: T({ intensity: 1.8, range: 14, speed: 16, cooldownMs: 1200, color: '#38ff8b' }) },
  ],
  sequence: [
    { id: 'surge', label: 'Gamma Surge', components: [], start: 0, duration: 800, effect: 'converge' },
    { id: 'arms', label: 'Arm Mass', components: ['lUpperArm', 'rUpperArm', 'lForearm', 'rForearm', 'lHand', 'rHand', 'lShoulder', 'rShoulder'], start: 600, duration: 900, effect: 'organic' },
    { id: 'torso', label: 'Torso Mass', components: ['chest', 'belt'], start: 1300, duration: 800, effect: 'organic' },
    { id: 'legs', label: 'Leg Mass', components: ['lThigh', 'rThigh', 'lShin', 'rShin', 'lFoot', 'rFoot'], start: 1900, duration: 800, effect: 'organic' },
    { id: 'head', label: 'Rage Face', components: ['head'], start: 2500, duration: 600, effect: 'organic' },
  ],
  assetStatus: 'procedural-placeholder',
};

export const SYMBIONT: CharacterDef = {
  id: 'symbiont',
  name: 'Void Symbiont',
  archetype: 'Alien organic shadow warrior',
  tagline: 'Adaptive organic suit',
  palette: { primary: '#0b0b10', secondary: '#1b1626', trim: '#3a2a55', energy: '#a35bff', eyes: '#eef0ff' },
  surface: 'organic', headStyle: 'organic', bulk: 1.1,
  components: [...BODY.filter((c) => c !== 'core'), 'tendrils'],
  powers: [
    { id: 'tendrils', name: 'Tendril Lash', kind: 'tendrils', gesture: 'palm', hint: 'Open palm and hold to extend tendrils', description: 'Tendrils seek and latch onto nearby targets.', tuning: T({ intensity: 0.8, range: 9, speed: 12, cooldownMs: 300, color: '#a35bff', particles: 0.7 }) },
    { id: 'tpull', name: 'Tendril Pull', kind: 'tendrilPull', gesture: 'fist', hint: 'Make a fist while tendrils are latched', description: 'Rip latched targets toward you, damaging them.', tuning: T({ intensity: 1.2, range: 9, speed: 10, cooldownMs: 400, color: '#a35bff' }) },
  ],
  sequence: [
    { id: 'spread', label: 'Symbiote Spread — Hands', components: ['lHand', 'rHand', 'lForearm', 'rForearm'], start: 0, duration: 800, effect: 'organic' },
    { id: 'arms', label: 'Arms & Shoulders', components: ['lUpperArm', 'rUpperArm', 'lShoulder', 'rShoulder'], start: 600, duration: 700, effect: 'organic' },
    { id: 'torso', label: 'Torso Engulf', components: ['chest', 'belt'], start: 1100, duration: 700, effect: 'organic' },
    { id: 'legs', label: 'Legs Engulf', components: ['lThigh', 'rThigh', 'lShin', 'rShin', 'lFoot', 'rFoot'], start: 1600, duration: 700, effect: 'organic' },
    { id: 'head', label: 'Head Engulf', components: ['head'], start: 2200, duration: 600, effect: 'organic' },
    { id: 'tendrils', label: 'Tendrils Emerge', components: ['tendrils'], start: 2700, duration: 600, effect: 'organic' },
  ],
  assetStatus: 'procedural-placeholder',
};

export const CHARACTERS: CharacterDef[] = [APEX, WEBRUNNER, TITAN, SYMBIONT];
export const getCharacter = (id: string) => CHARACTERS.find((c) => c.id === id) ?? APEX;
