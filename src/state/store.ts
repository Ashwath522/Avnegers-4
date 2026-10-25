import { useSyncExternalStore } from 'react';
import { CHARACTERS, getCharacter } from '../engine/characters/registry';
import type { PowerTuning, SequenceStep } from '../engine/characters/types';
import { validateSequence } from '../engine/characters/validate';

export interface AppState {
  characterId: string;
  tunings: Record<string, Record<string, Partial<PowerTuning>>>;
  sequences: Record<string, SequenceStep[]>;
  transformSpeed: number;
  autoTransformOnPalms: boolean;
  tracker: { deviceId: string | null; mirror: boolean; poseModel: 'lite' | 'full'; minCutoff: number; beta: number };
  gesture: { sensitivity: number; holdMs: number };
  view: { particles: boolean; shake: boolean; dim: number; skeleton: boolean; density: number; aimAssist: number; grade: 'none' | 'cinematic' | 'noir' | 'heat'; letterbox: boolean };
  physics: { gravity: number; restitution: number; respawnMs: number };
  calibration: { done: boolean; at: string | null; fullBody: boolean; handsSeen: boolean };
  stats: { powersFired: number; targetsDestroyed: number; transformations: number; byPower: Record<string, number> };
}

const KEY = 'alter-ego-state-v1';

export const DEFAULT_STATE: AppState = {
  characterId: 'apex',
  tunings: {},
  sequences: {},
  transformSpeed: 1,
  autoTransformOnPalms: true,
  tracker: { deviceId: null, mirror: true, poseModel: 'lite', minCutoff: 1.2, beta: 0.015 },
  gesture: { sensitivity: 1, holdMs: 120 },
  view: { particles: true, shake: true, dim: 0, skeleton: false, density: 1, aimAssist: 0.5, grade: 'none', letterbox: false },
  physics: { gravity: 1, restitution: 0.35, respawnMs: 2500 },
  calibration: { done: false, at: null, fullBody: false, handsSeen: false },
  stats: { powersFired: 0, targetsDestroyed: 0, transformations: 0, byPower: {} },
};

function load(): AppState {
  try {
    if (typeof localStorage === 'undefined') return structuredClone(DEFAULT_STATE);
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const p = JSON.parse(raw);
    const s: AppState = { ...structuredClone(DEFAULT_STATE), ...p };
    for (const k of ['tracker', 'gesture', 'view', 'physics', 'calibration', 'stats'] as const) (s as any)[k] = { ...(DEFAULT_STATE as any)[k], ...(p[k] ?? {}) };
    if (!CHARACTERS.some((c) => c.id === s.characterId)) s.characterId = 'apex';
    // drop invalid persisted sequences rather than crashing
    for (const [cid, seq] of Object.entries(s.sequences)) {
      if (!Array.isArray(seq) || validateSequence(seq, getCharacter(cid).components).length) delete s.sequences[cid];
    }
    return s;
  } catch { return structuredClone(DEFAULT_STATE); }
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getState() { return state; }

export function setState(fn: (s: AppState) => Partial<AppState>) {
  state = { ...state, ...fn(state) };
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } }, 250);
}

export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

/* ---- derived helpers ---- */
export function tuningFor(s: AppState, charId: string, powerId: string): PowerTuning {
  const def = getCharacter(charId).powers.find((p) => p.id === powerId);
  const base = def?.tuning ?? { intensity: 1, range: 8, speed: 12, cooldownMs: 300, color: '#ffffff', particles: 1, chargeMs: 900 };
  return { ...base, ...(s.tunings[charId]?.[powerId] ?? {}) };
}

export function sequenceFor(s: AppState, charId: string): SequenceStep[] {
  return s.sequences[charId] ?? getCharacter(charId).sequence;
}

export function bumpStat(key: 'powersFired' | 'targetsDestroyed' | 'transformations', powerId?: string) {
  setState((s) => ({
    stats: {
      ...s.stats, [key]: s.stats[key] + 1,
      byPower: powerId ? { ...s.stats.byPower, [powerId]: (s.stats.byPower[powerId] ?? 0) + 1 } : s.stats.byPower,
    },
  }));
}
