import { useEffect, useRef, useState } from 'react';
import { Experience, gradeFilter, type ExperienceSnapshot } from '../engine/Experience';
import { getCharacter } from '../engine/characters/registry';
import type { WorldPreset } from '../engine/world/World';
import { bumpStat, getState, sequenceFor, subscribe, tuningFor } from '../state/store';

export interface UseExperienceOpts {
  camera: boolean;
  simulate?: boolean;          // use the mannequin when the camera is unavailable/off
  preset?: WorldPreset;
  suitOnStart?: boolean;       // start with the suit already assembled
  skeleton?: boolean;          // force skeleton overlay on
}

/** Creates one Experience for the lifetime of the component and keeps it in sync with the app store. */
export function useExperience(opts: UseExperienceOpts) {
  const ref = useRef<HTMLDivElement>(null);
  const [exp, setExp] = useState<Experience | null>(null);
  const [snap, setSnap] = useState<ExperienceSnapshot | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let e: Experience;
    try {
      e = new Experience(el, {
        camera: opts.camera,
        simulateWhenNoCamera: !!opts.simulate,
        preset: opts.preset ?? 'live',
        tuning: (c, p) => tuningFor(getState(), c, p),
        onPowerFired: (p) => bumpStat('powersFired', p),
        onTargetDestroyed: () => bumpStat('targetsDestroyed'),
        onTransformComplete: () => bumpStat('transformations'),
      });
    } catch (err) {
      setSnap(null);
      el.dataset.error = `WebGL failed to start: ${(err as Error).message}`;
      return;
    }
    let lastChar = '', lastSeq: unknown = null;
    const apply = () => {
      const s = getState();
      const cid = s.characterId;
      const seq = sequenceFor(s, cid);
      if (cid !== lastChar) { e.setCharacter(getCharacter(cid), seq); lastChar = cid; lastSeq = seq; }
      else if (seq !== lastSeq) { e.setSequence(seq); lastSeq = seq; }
      e.tracker.updateSettings(s.tracker);
      e.gestures.sensitivity = s.gesture.sensitivity; e.gestures.holdMs = s.gesture.holdMs; e.gestures.applyParams();
      e.particles.enabled = s.view.particles; e.particles.density = s.view.density;
      e.stage.shakeEnabled = s.view.shake;
      e.showSkeleton = opts.skeleton || s.view.skeleton;
      e.aimAssist = s.view.aimAssist;
      e.grade = s.view.grade; e.letterbox = s.view.letterbox;
      e.autoTransformOnPalms = s.autoTransformOnPalms;
      e.seq.speed = s.transformSpeed;
      e.world.setGravity(s.physics.gravity); e.world.phys.restitution = s.physics.restitution; e.world.autoRespawnMs = s.physics.respawnMs;
      const v = e.tracker.video;
      v.style.transform = s.tracker.mirror ? 'scaleX(-1)' : 'none';
      v.style.filter = gradeFilter(s.view.grade);
    };
    apply();
    if (opts.suitOnStart) e.completeTransformation();
    const unsubStore = subscribe(apply);
    const unsubSnap = e.subscribe(setSnap);
    setExp(e);
    return () => { unsubStore(); unsubSnap(); e.dispose(); setExp(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, exp, snap };
}
