# Testing

```
npm test          # vitest — 28 unit/integration tests
npm run typecheck # tsc
npm run build     # production build
```

Covered: gesture state machine (spike rejection, hold, release, cooldown, hysteresis), cooldowns, sequencer
(order, pause/restart/reset, double start), character config validation (all 4), target states, swept collision,
rigid-body integration, palm-facing sign, finger extension, gesture scores, cover/mirror mapping, One-Euro smoothing,
and an end-to-end path mannequin → mapping → (smoothing) → gesture engine for idle/palm/web/fist/bothPalms/punch/slam.

Browser checks done (headless Chromium, software WebGL, no camera → mannequin fallback):
Armory render, Power Lab repulsor + charged blast fired via recognised gestures, Symbiont tendrils latch + pull,
Webrunner web launch, Live both-palms → transformation start, all 12 routes load with no page errors.

Not verified automatically: real webcam tracking quality, MediaPipe model loading (sandbox had no CDN access),
recording output, IndexedDB persistence across reloads. Do these by hand on a real machine (see PROJECT_STATUS.md).
