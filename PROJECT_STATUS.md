# Project Status — 2026-10-26 (armor upgrade + character names)

## Changes in this package
- Display names: **Iron Man**, **Spider-Man**, **Hulk**, **Venom** (internal ids still apex/webrunner/titan/symbiont).
- **Iron Man**: layered 3D arc reactor, sculpted helmet, pectoral/abs plates, gold trim.
- **Spider-Man**: full mask with large eye lenses + web ridges, chest emblem + web lines.
- **Hulk**: heavy brow/jaw, muscle pecs/abs/traps.
- **Venom**: oversized white eyes, jagged mouth, white spider-chest mark, organic mass.
- ModelRig tests + optional `modelUrl` + `proceduralHidden` for future GLB swaps.

## Apply this package
1. Unzip over your project (or copy the files listed in APPLY.md).
2. `npm install && npm test && npm run dev`
3. Open Armory / Live and switch characters.

## Remaining limitations
- Still procedural geometry (not film-scanned meshes). No copyrighted GLBs bundled.
- No person-segmentation occlusion yet.
- Real webcam still needs calibration on your machine.

---

# Project Status — 2026-10-25 (checkpoint 1)

## Baseline audit
- `~/Documents/Avengers` was **empty**: no existing Iron Man implementation, no package.json, no assets.
  Built from scratch; "Apex Armor" is the first end-to-end character.
- References: 14 UI pages extracted from the PDF. The 3 individual suit images were not provided.
- No 3D models / textures / audio exist → procedural placeholders (see docs/ASSET_MANIFEST.md).

## Milestones
| Milestone | State | Evidence |
|---|---|---|
| Ph1 audit + foundation | ✅ | this file, references/REFERENCE_INDEX.md |
| Ph2 Apex end-to-end (camera → tracking → suit → palm gesture → blast → collision → fracture) | ✅ code + mannequin-verified; ⏳ needs real-webcam check | tests, headless screenshots |
| Ph3 transformation engine (data-driven, per-component effects, pause/restart/complete, both-palms trigger) | ✅ | Sequencer tests, Live screenshot |
| Ph4 character framework (shared rig/controllers/config/validation, switching with cleanup) | ✅ | validate tests |
| Ph5 Webrunner (verlet web, attach on collision, spring pull, release) | ✅ mannequin-verified launch; pull verified in logic only | |
| Ph6 Verdant Titan (punch, ground slam wave, knockback, fracture) | ✅ logic + gesture tests; ⚠ slam not seen in headless (software GL ran at ~5 fps) | |
| Ph7 Void Symbiont (procedural tendrils, seek/latch/pull, ambient back tendrils) | ✅ mannequin-verified latch + pull | |
| Ph8 pages (12 routes cover all 14 refs) | ✅ / partial: Creations (no editing), Cinematic (no virtual backgrounds) | |
| Ph9 final verification on real hardware | ⏳ | |

## Commands run
`npm install`, `npx tsc -b`, `npx vitest run` (28/28 pass), `npx vite build` (ok, 1.0 MB JS / 285 kB gz),
headless Playwright screenshots of Home/Armory/Power Lab/Lab/Live.

## Known defects / limitations
- Not yet tested with a real webcam — gesture thresholds are tuned on synthetic landmarks; expect to adjust
  sensitivity in Gesture Training.
- Armor is joint-attached primitives, not a skinned character; no true occlusion (no segmentation).
- Targets use AABB collision; stacked targets would interpenetrate (presets avoid stacking).
- Web/aim can legitimately miss low targets when the arm points level — use aim assist or point at them.
- No audio (no licensed assets).
- Bundle is a single 1 MB chunk (MediaPipe + three) — fine locally; split later if needed.

## Next steps (resume here)
1. `npm run dev`, open http://localhost:5173, Settings → calibrate with a real camera.
2. Live: check suit alignment while moving/raising arms/stepping back; tune `rK` radii in ArmorRig if limbs look thin/thick.
3. Gesture Training: verify palm/fist/web scores on real hands; adjust thresholds in GestureEngine if needed.
4. Visually inspect reference pages 02,03,05,07–13 and refine those screens.
5. Replace placeholders with licensed GLB suits when available.
