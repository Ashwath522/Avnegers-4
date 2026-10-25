# Reference Index

Source: `~/Downloads/PROJECT_ALTER_EGO_REFERENCE_GUIDE.pdf` (15 pages: cover + 14 UI references).
Images were extracted losslessly with `pdfimages` into `references/project-alter-ego/` and renamed by page.
`thumbs/` holds 1000px JPG previews. Original generated filenames come from the PDF captions.

**Inspection status:** pages 01, 04, 06 and 14 were visually inspected. The other 10 are mapped from the PDF's
written captions only and still need a visual pass (see PROJECT_STATUS.md).
**Missing:** the three individual suit images (`suit-apex-armor`, `suit-verdant-titan`, `suit-void-symbiont`) are not in the PDF.

| # | File | Original name | Informs | Route | Status |
|---|------|---------------|---------|-------|--------|
| 01 | page-01-armory.png | a_futuristic_sci_fi_ui_scene_widescreen_game_app.png | Character select, part grid, preview transformation | `#/armory` | Inspected · implemented |
| 02 | page-02-power-customization.png | a_wide_cinematic_sci_fi_user_interface_concept_a.png | Per-character power tuning | `#/powers` | Caption only · implemented |
| 03 | page-03-destruction-physics.png | wide_futuristic_sci_fi_ui_dashboard_scene_in_a_dar.png | Targets, debris, physics controls | `#/lab` | Caption only · implemented |
| 04 | page-04-transformation-chamber.png | a_futuristic_sci_fi_user_interface_scene_a_high_t.png | Staged materialization, component status, styles, "both palms to synchronize" | `#/transform` | Inspected · implemented |
| 05 | page-05-transformation-editor.png | wide_cinematic_futuristic_ui_screenshot_dashboar.png | Editable stage order/timing/effects | `#/editor` | Caption only · implemented |
| 06 | page-06-home-dashboard.png | a_wide_futuristic_sci_fi_ui_dashboard_scene_cybe.png | Hero, quick access, featured suits, recent creations, status bar | `#/` | Inspected · implemented |
| 07 | page-07-profile-suit-collection.png | a_wide_ultra_detailed_futuristic_sci_fi_ui_dashbo.png | Profile, collection, achievements (real stats) | `#/profile` | Caption only · implemented |
| 08 | page-08-my-creations.png | a_wide_cinematic_dark_sci_fi_ui_dashboard_screens.png | Gallery, preview, download/delete | `#/creations` | Caption only · partial (no clip editing) |
| 09 | page-09-transformation-sequences.png | wide_cinematic_ui_dashboard_screen_futuristic_neo.png | Distinct per-character sequences | registry + `#/editor` | Caption only · implemented |
| 10 | page-10-cinematic-mode.png | a_widescreen_cinematic_ui_ux_concept_scene_a_fut.png | Grades, letterbox, record/export | `#/cinematic` | Caption only · partial (no virtual environments) |
| 11 | page-11-gesture-training.png | wide_futuristic_ui_screenshot_game_like_dashboar.png | Live scores, drills, calibration | `#/training` | Caption only · implemented |
| 12 | page-12-power-lab.png | a_wide_cinematic_futuristic_sci_fi_user_interfac.png | Power test vs targets | `#/powers` | Caption only · implemented |
| 13 | page-13-settings-tracking.png | a_wide_futuristic_sci_fi_ui_dashboard_mockup_for.png | Camera, tracking, perf, permission errors, calibration | `#/settings` | Caption only · implemented |
| 14 | page-14-live-experience.png | a_futuristic_high_tech_hud_ar_interface_screensho.png | Main AR view, power list, power bar, stats, capture, perf | `#/live` | Inspected · implemented |

## Implemented vs. inspiration only
- **Implemented:** layout language (dark navy, cyan neon frames, Orbitron/Rajdhani), panel structure, power list + power bar, tracking pill, record/capture, effects toggles, component status grid, step list with progress.
- **Inspiration only:** photoreal armor renders, character portraits, fake-looking stats in the mockups (GPU %, "Level 12", XP, cloud sync, storage 100 GB). Stats shown in the app are real measurements or local counters; GPU/CPU % are not shown because browsers don't expose them.

## Inconsistencies noticed
- Page 14 lists 7 powers (Shield, Telekinesis, Flight); the spec defines 2 per character. Only spec'd powers are built.
- Page 01 shows "Velocity Weaver" and locked suits; the spec names "Webrunner" and nothing requires locking. All suits are available.
- Pages 01/06/14 suit art closely resembles existing film characters; the in-app suits are deliberately original (procedural geometry, original eye/emblem shapes, no logos).
