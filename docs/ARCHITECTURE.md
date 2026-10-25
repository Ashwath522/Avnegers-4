# Architecture

Vite + React 19 + TypeScript, Three.js (r180), MediaPipe Tasks Vision (Pose + Hand Landmarker). No backend.

```
src/
  engine/
    tracking/   Tracker (singleton camera + MediaPipe, ref-counted), mapping (cover-fit, mirror, y-up),
                smoothing (One-Euro), handMath (palm facing, finger extension), simulated (mannequin)
    gestures/   GestureMachine (state machine), GestureEngine (hand/body/motion gestures → events)
    characters/ types, registry (4 character configs: palette, surface, components, powers, sequences), validate
    transformations/ Sequencer (pure, data-driven timeline)
    rendering/  Stage (ortho pixel camera over video, env map, shake), ArmorRig (procedural components attached
                to joints + materialize effects), Particles (pooled GPU points), Tube (alloc-free tubes), materials
    powers/     controllers (Apex / Webrunner / Titan / Symbiont), aim, cooldowns
    world/      targetLogic (pure HP/state/collision/integration), World (targets, fracture debris, shockwaves)
    Experience.ts  coordinator: one render loop per screen; tracker → gestures → controller → rig/world → render;
                   snapshot stream for the HUD; screenshot + MediaRecorder capture
  state/        store (localStorage), creationsDb (IndexedDB)
  ui/           useExperience hook (store ↔ engine sync), shared HUD components
  features/     12 routes covering the 14 reference pages
```

Key decisions
- **Orthographic camera in pixel units** over a `object-fit: cover` video. Landmarks map 1:1 to world space, so armor
  stays aligned at any window size/aspect, and mirroring is a single flag.
- **Single tracker instance** with acquire/release ref-counting: no duplicate streams/detectors across screens; tracks
  stop when no screen needs the camera.
- **Glow sprites + additive particles instead of post-process bloom**: UnrealBloomPass destroys canvas alpha, which
  would hide the webcam feed. Sprites keep the user visible.
- **Gestures in one engine**, powers consume events. Character behaviour lives in a controller per character.
- **Data-driven transformation**: steps (components, start, duration, effect) in config; the editor writes overrides to
  the store; the engine re-loads them live.
- **Simulated mannequin** produces MediaPipe-format landmarks so the full pipeline can be exercised without a camera
  (preview screens, automated tests, camera-denied fallback). Always labelled "SIMULATED POSE".
- Occlusion is approximate: depth comes from MediaPipe's relative z; there is no person segmentation.
