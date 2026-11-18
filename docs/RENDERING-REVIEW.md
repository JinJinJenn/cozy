# Rendering and Rust/WASM review

17 November 2026. Measured against the v0.3 runtime at `cb28d87`.

## Recommendation

Keep the current game running while improving its scene and asset representation.
Do not start a whole-game Rust rewrite on the evidence available here. A small
renderer comparison can follow, using the same town, camera, visual requirements
and gameplay state. Rust/WASM remains an option for independently measured CPU
kernels or a future native client, rather than a presumed cure for rendering cost.

The current engine is Three.js 0.180.0 with WebGL2. Terrain generation/chunk building
and resident simulation already run in separate JavaScript workers. Neither changing
their language nor moving draw submission to Rust removes the geometry and fragment
work submitted to the GPU.

Reproduce the isolation with `node tools/profile-renderer.mjs --wide-only`.
Add `--software` for SwiftShader, `--geometry-only` for the foliage/material
comparison, or `--cpu4 --matrix-only` for the static-root experiment. Set
`PLAYWRIGHT_FROM` and `CHROME_EXE` for an external browser test installation.
Reports and CPU profiles go to ignored `test-results/renderer`, or the directory
in `COZY_RENDER_REPORT`. Sequential profiles should use separate output directories.

## Measurements

Headless Chrome, RTX 5070 Ti, Low at 1280 by 720. The fixed wide-town view retained
457 simulated residents and approximately 65 visible residents. Diagnostic variants
only hid or substituted rendering; they are not changes in the released game.

| Wide view | Median frame interval | Visible triangles |
| --- | ---: | ---: |
| Original scene, hardware GPU | 16.7 ms | About 901,000 |
| Original scene, software WebGL | 239.3 ms | About 903,000 |
| Plain terrain shading, software | 214.8 ms | About 902,000 |
| Terrain hidden, software | 221.6 ms | About 858,000 |
| Exterior scenery hidden, software | 72.2 ms | About 225,000 |
| Original scene, second software run | 243.9 ms | About 903,000 |
| Foliage hidden, second software run | 160.6 ms | About 472,000 |
| Unlit exterior scenery, second software run | 238.6 ms | About 904,000 |
| Original scene restored, second software run | 242.9 ms | About 909,000 |

Software variants sampled 35 frames after warmup. Hardware variants sampled 180.
Resident movement changes counts slightly. Software WebGL is a stress diagnostic,
not an emulation of an Intel integrated GPU or a phone. These numbers cannot certify
either device class. Hiding geometry also changes coverage and occlusion, so these
are isolation experiments, not additive per-system budgets.

CPU time inside `renderer.render` was roughly 1.8 to 2.4 ms in these unthrottled
samples, while the software GPU query reported roughly 235 ms for the full scene.
The hardware GPU timer results varied with scheduling and did not support a reliable
small shader ranking. The large software scenery difference was repeatable after
restoring the original scene.

A CPU profile identified scene matrix updates, frustum projection and submission
as the largest main-thread render costs. A test disabling redundant root transform
updates under 4x CPU throttling did not produce a consistent improvement; it was
not shipped. CPU throttling does not throttle the simulation worker or GPU and is
not a substitute for a slow-device benchmark.

The separate 1080p orbit test peaked at approximately 1.74 million triangles and
646 calls. One ready-state census contained 955 exterior scenery meshes and about
91,000 primitive instances across the whole island. Instance sharing has reduced
submission cost, but the shapes themselves still contain substantial work.

## Terrain findings

- Terrain slope light, heightfield shadows and cavity shade are baked into vertex
  colors in `packages/island-gen/src/chunks.js`.
- `src/main.js` supplies vertical normals everywhere, including slopes, to avoid
  dark skirt seams. Runtime Lambert lighting therefore does not describe the actual
  terrain surface. Changing normals alone would also double-light the baked color.
- `src/road-surface.js` evaluates procedural grain and nearby road segments per
  fragment. The road lookup is spatially bounded, rather than testing every road.
  Removing all custom terrain shading improved the software sample modestly; it
  was not the dominant wide-view cost.
- Terrain retains crack skirts even though current tiles use one consistent source
  resolution. Water samples at twice that linear resolution and trims fully dry
  quads. The coast, bridge, water-level and collision contracts must survive any
  topology change.
- The coarse-looking crowns are not especially cheap: the foliage primitive is a
  deformed subdivision-2 icosahedron repeated into tree crowns. In the measured view
  foliage accounted for approximately 431,000 submitted triangles.

## Work order

1. Improve the actual models and scene representation first. Build original tree
   crowns and architecture with deliberate silhouettes, shared materials and less
   hidden geometry. Preserve detail from street to town; no abrupt cheap-model swap.
2. Separate terrain albedo from lighting. Use coherent slope normals, material
   variation and contact shading. Keep a measured Low path and compare both street
   and whole-town views. Better terrain composition is also a generator/art task.
3. Review unnecessary terrain skirts, offshore water topology and static scene
   traversal. Benchmark each change against unchanged geometry and visual captures.
4. Keep canonical home/world/object state independent of Three.js objects. A view
   adapter consumes snapshots and stable IDs; saves and network authority stay in
   the game model. This also serves the connected-room editor and prop contracts.
5. Benchmark one identical district through Three.js WebGPU before deciding on a
   larger backend migration. Include startup, p95 frame time, memory, editing,
   picking, shadows and WebGL fallback. Compare on the named low-end target.
6. Consider Rust/WASM for terrain generation or navigation only when a profile
   identifies that CPU work as the limiting budget. Keep a typed-array boundary
   and test serialization/transfer overhead as part of the result.

## Migration options

| Option | What it preserves | What needs evidence or replacement |
| --- | --- | --- |
| Improve current Three/WebGL2 path | Current editor, UI, WebRTC, audio, saves, shaders | Scene/model cost, terrain lighting, target-device performance |
| Three.js WebGPU/TSL | Much of the scene-facing game integration | Custom material rewrite, renderer differences, fallback tests and pinned-version upgrade |
| Rust/WASM CPU modules plus current renderer | Current rendering and browser integrations | Kernel speedup after memory/transfer costs; deterministic world and save compatibility |
| Rust/wgpu renderer or whole client | Potential shared native/web renderer | New rendering/material pipeline and browser bridges; editor/picking/audio/network integration; complete regression burden |

The current Three.js documentation says WebGPURenderer can fall back to WebGL2,
but custom GLSL ShaderMaterial and onBeforeCompile materials need conversion to
node materials/TSL. Cozy uses those hooks for terrain, water, sky, foliage, facade
finishes and avatar shadows. This is a real migration, not a constructor rename.
[Three.js migration guidance](https://threejs.org/manual/pages/webgpurenderer).

Rust's wgpu can target browser WebGPU or WebGL2 through WebAssembly; its documented
WebGL2 backend has feature differences. That makes it a feasible candidate, not a
measured speedup for this game. No Rust or WebGPU Cozy prototype was benchmarked in
this review. [wgpu web platform documentation](https://wgpu.rs/doc/wgpu/documentation/platforms/web/index.html).
