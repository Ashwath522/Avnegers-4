# Gesture Mapping

Recognition lives in `src/engine/gestures/`. Each gesture is a per-frame score 0..1 fed into a `GestureMachine`
(EMA smoothing → activate threshold → min hold time → active → release threshold → cooldown). Defaults: activate 0.70,
release 0.45, hold 120 ms, cooldown 250 ms. Sensitivity and hold time are adjustable in Gesture Training.

| Gesture | Score definition | Notes |
|---|---|---|
| palm | min finger extension (I/M/R/P) × palm-facing-camera × hand-raised-above-hips | palm normal from wrist/index-MCP/pinky-MCP cross product |
| fist | 1 − max extension (I/M/R/P) | |
| web | min(index, pinky) × (1 − max(middle, ring)) | original "web sign" |
| point | index × (1 − max(M/R/P)) | reserved |
| bothPalms | min(left palm, right palm), hold 600 ms | starts the transformation |
| armsUp | lowest wrist above nose | |
| slam | armsUp ends, then both wrists below mid-torso within 900 ms | |
| punch | pose-wrist speed > 5.5 shoulder-widths/s, moving away from shoulder, reach > 0.9 sw, fist (or hand lost to blur), 450 ms refractory | speed is a 2D webcam estimate, not force |

| Character | Gesture | Power |
|---|---|---|
| Apex Armor | palm start | Energy Repulsor (pulse) |
| Apex Armor | palm hold > 350 ms then release | Charged Blast (scales with charge) |
| Webrunner | web start | Web Line (attaches on real collision) |
| Webrunner | fist while attached | Web Pull (reel-in, rope spring pulls target) |
| Webrunner | palm while attached | release web |
| Verdant Titan | punch | Titan Punch (cone, short range) |
| Verdant Titan | slam | Ground Slam (expanding ground wave) |
| Void Symbiont | palm start | Tendril Lash (3 tendrils seek nearest targets) |
| Void Symbiont | fist while latched | Tendril Pull |
| all | bothPalms (suit offline) | Start transformation |

Aim = shoulder→hand direction; when the arm points at the camera it falls back to outward. Aim assist (0–1) bends the
ray toward a target inside a cone; it never fires at something outside the cone.
