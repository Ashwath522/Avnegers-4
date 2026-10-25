# Implementation Plan

Order (dependency-first): tracking → gestures → rendering/suit → Apex powers + targets → transformation engine →
character framework → Webrunner → Titan → Symbiont → screens → verification.

| # | Work item | Status |
|---|---|---|
| 1 | Tracker singleton, cover/mirror mapping, One-Euro smoothing, lost-tracking, permission errors | done |
| 2 | Gesture engine: state machine, palm/fist/web/point, bothPalms, armsUp, slam, punch | done |
| 3 | Stage (ortho over video), procedural ArmorRig (19 components), glow + particles | done |
| 4 | Apex repulsor + charged blast, aim + assist, swept collision, HP states, fracture debris | done |
| 5 | Sequencer + materialize effects (particles/converge/mechanical/organic) | done |
| 6 | Character registry + validation; controllers per character | done |
| 7 | Webrunner web (verlet + attach + spring pull) | done |
| 8 | Titan punch + slam wave | done |
| 9 | Symbiont tendrils | done |
| 10 | Screens: Home, Armory, Transformation, Live, Power Lab, Destruction Lab, Sequence Editor, Cinematic, Gestures, Creations, Profile, Settings | done |
| 11 | Capture: screenshot + MediaRecorder WebM to IndexedDB | done (manual check pending) |
| 12 | Real-webcam tuning pass | next |
| 13 | GLB asset pipeline | blocked on assets |
| 14 | Audio | blocked on licensed SFX |
| 15 | Person segmentation (occlusion, virtual backgrounds) | future |
