# Asset Manifest

No 3D model, texture, audio or animation files were supplied. Everything visible is generated in code.

| Asset id | Character | Location | Format | License | Use | Rig | Anim | Status |
|---|---|---|---|---|---|---|---|---|
| suit.apex.* (19 components) | Apex Armor | `src/engine/rendering/ArmorRig.ts` | procedural Three.js | original | suit | joint-attached (no skeleton) | landmark-driven | **placeholder** |
| suit.webrunner.* | Webrunner | same | procedural + canvas lattice texture (`materials.ts`) | original | suit | joint-attached | landmark-driven | **placeholder** |
| suit.titan.* | Verdant Titan | same | procedural + canvas bump noise | original | suit | joint-attached | landmark-driven | **placeholder** |
| suit.symbiont.* + back tendrils | Void Symbiont | same + `Tube.ts` | procedural, clearcoat + canvas vein emissive | original | suit | joint-attached; tendrils procedural | procedural | **placeholder** |
| fx.glow | all | `Stage.ts` glowTexture | canvas radial gradient | original | glow sprites, particles | — | — | final |
| fx.particles | all | `Particles.ts` | GPU points shader | original | trails, impacts, materialize | — | — | final |
| fx.web / fx.tendril | Webrunner / Symbiont | `Tube.ts` + `controllers.ts` | procedural tube, verlet rope | original | powers | — | simulated | final |
| world.targets | all | `World.ts` | procedural + canvas concrete texture | original | dummies, blocks, walls, drones | — | physics | placeholder art, final logic |
| tracking models | all | Google CDN or `public/models/` | MediaPipe `.task` | Apache-2.0 | pose + hands | — | — | external (run `npm run fetch-models` to vendor) |
| audio | — | — | — | — | — | — | — | **missing** (no licensed SFX supplied; audio toggles intentionally omitted) |

## Replacing a placeholder with a GLB
Each suit component is created in `ArmorRig.build(id)` and returns a `place(frame)` function that positions it from
joints. To swap in a model: load the GLB with `GLTFLoader`, split or name meshes per component id, and in `place()`
set the mesh transform from the same joints (or drive a skinned skeleton's bones from them). The transformation engine,
materialization effects and opacity handling work on `Comp.group`, so they keep working unchanged.

Do not add third-party character models/textures without a license that permits it. Never use assets depicting
existing copyrighted characters.
