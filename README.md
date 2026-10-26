# Project Alter Ego

Real-time webcam superhero transformation in the browser: MediaPipe body + hand tracking drives a procedural 3D suit,
gestures fire powers, and virtual targets react with physics and fracture.

## Run
```bash
npm install
npm run dev          # http://localhost:5173 (camera needs localhost or HTTPS)
npm test             # unit + gesture pipeline tests
npm run build
npm run fetch-models # optional: vendor MediaPipe models into public/models (else loaded from Google CDN)
```
Stand 1.5–2.5 m from the camera in good light. Start in **Settings** to calibrate, then **Transformation**:
hold both palms toward the camera to suit up.

## Characters
- **Iron Man** — open palm = repulsor; hold palm to charge, close hand to release a charged blast.
- **Spider-Man** — index + pinky out (middle/ring folded) = web line; fist = reel in; open palm = release.
- **Hulk** — fast punch; raise both arms then drive down = ground slam.
- **Venom** — open palm = tendrils seek targets; fist = rip them toward you.

No camera? Every screen falls back to a labelled simulated mannequin with pose buttons.

Docs: `PROJECT_STATUS.md`, `IMPLEMENTATION_PLAN.md`, `references/REFERENCE_INDEX.md`, `docs/*`.
# Avnegers-4
