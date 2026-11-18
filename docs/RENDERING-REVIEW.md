# Rendering and Rust/WASM review

17 November 2026. Baseline measured against the v0.3 runtime at `cb28d87`;
the first measured scene optimization ships in v0.3.1.

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

## First shipped optimization: buried crown surfaces

Version 0.3.1 builds each garden or woodland crown once, retaining its exposed
triangles, normals, colors and original leaf-pattern coordinates. It removes a
triangle only when all three vertices lie strictly inside the conservative convex
interior of another crown lobe. The resulting shapes are shared across trees.
There is no distance-dependent geometry substitution. Garden crowns shed 43 to
44 percent of their leaf triangles without redesigning their visible shape.

Two baseline and two optimized software WebGL runs were sampled in baseline,
optimized, optimized, baseline order, at the same 720p Low wide-town camera:

| Metric | Before | After |
| --- | ---: | ---: |
| Scene triangles | 903,158 | 765,504 |
| Draw calls | 247 | 280 |
| Median frame interval, two runs | 235.9 / 235.8 ms | 210.1 / 212.7 ms |
| Median software GPU time, two runs | 232.1 / 232.3 ms | 206.2 / 209.2 ms |

That is a repeatable 10 to 11 percent frame-time improvement in this diagnostic,
still much too slow for a playable low-end target. The geometry grouping increases
draw calls. Unthrottled hardware render CPU median rose from 1.2 to 1.5 ms, while
the hardware frame interval remained about 16.7 ms. Under 4x main-thread throttling,
wide-view p95 rose from 18.7 to 19.2 ms and street-view p95 from 20.3 to 21.8 ms.
These short samples expose the CPU tradeoff; this is not a claim of improvement
on every device. An integrated-GPU or phone measurement remains required.

The geometry regression compares nearest crown intersections from 32 directions.
Three 1200 by 720 rendered comparisons included the original tree colors and cast
shadows. The largest mean channel difference was 0.00043 on a 0 to 255 scale;
at most 36 pixels differed by more than four channel levels. The reviewed captures
show the same visible surface. This is preservation of the current art, not the
larger visual upgrade requested for the trees and terrain.

Use `--full-only` to sample the whole renderer without isolation variants.

## Terrain findings on the v0.3 baseline

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

## Startup and frame measurements

Version 0.3.3 moves furniture station routing out of city startup. Full home
geometry data for collision and the resident worker are available at startup.
Each home computes its interaction points on first use and reuses them later.
Six alternating headless desktop Chrome loads used 1280 × 720 Low, localhost,
fresh browser contexts and local networking. Navigation to the ready viewer and
street session took 2.889, 2.811 and 2.619 seconds on v0.3.2 and 1.712, 1.744
and 1.697 seconds on v0.3.3. Every sample had 457 residents and the worker.

### Physical integrated GPU

Headless Chrome reported Intel(R) Graphics, PCI device 0x7D67, via ANGLE
Direct3D 11 on Windows. The installed graphics driver was 32.0.101.5869.
At 1280 × 720 Low, both fixed cameras had 16.7 ms median and 16.8 ms p95
frame intervals with 457 residents. GPU fences confirmed 59.65 completed frames
per second over the bay and 59.70 at the café over 240 frames each. In both
samples, at least 95 percent of frames had retired the previous frame's fence
by the following callback. The bay submitted 1,639,019 triangles in 1,142 calls.

Each moving-camera sample covered 360 frames after warmup. The street orbit
ran in walking mode. The town orbit included up to 89 visible residents.

| Preset and orbit | Completed FPS | p95 frame interval | Longest interval |
| --- | ---: | ---: | ---: |
| Low, street | 59.66 | 17.5 ms | 62.1 ms |
| Low, town | 59.82 | 17.9 ms | 36.1 ms |
| Balanced, street | 59.83 | 17.5 ms | 26.0 ms |
| Balanced, town | 59.82 | 17.6 ms | 38.2 ms |

The isolated 62.1 ms interval occurred on Low during the street orbit. A longer
walk through several districts with profiling enabled would help locate hitches.

To run the moving-camera comparison on a Windows hybrid machine, set
`COZY_ADAPTER_LUID` to the target adapter's current decimal high,low DXGI LUID
and `COZY_EXPECT_GPU` to a distinguishing substring of its WebGL renderer.
Run `node tools/benchmark.mjs --720p --orbit --gpu-completion`. The harness checks
the renderer name before timing and waits for the final GPU fence. The result
measures browser rendering on a desktop processor with this particular iGPU.
Older laptops, phones, thermal throttling and display presentation need their
own measurements.

### Terrain and water changes

The v0.3.2 terrain pass supplies packed slope normals and unlit albedo, removes
skirts from equal-resolution viewer tiles and simplifies nearly uniform offshore
water. Drawing the minimap at its display resolution eliminated a retained
3133 × 4096 canvas, about 49 MiB at four bytes per pixel.

Matched 1280 × 720 Low captures used the same Petalwood bay and café camera
poses with all 457 residents active. Hardware draws at the bay went from
1,877,275 to 1,639,019 triangles in 1,142 calls. At the café they went from
603,434 to 401,962 in 503 calls. Desktop median and p95 frame intervals held
at 16.7 and 16.8 ms over 120 frames per view. In 30-frame SwiftShader samples,
bay median/p95 went from 466.6/466.8 to 416.7/433.3 ms and café median/p95 from
166.6/183.3 to 116.7/133.3 ms.

## Remaining renderer work

1. Improve the actual models and scene representation first. Build original tree
   crowns and architecture with deliberate silhouettes, shared materials and less
   hidden geometry. Preserve detail from street to town; no abrupt cheap-model swap.
2. Improve contact shading, transitions at the riverbank and terrain composition.
   Compare both street and whole-town views on the Intel adapter.
3. Profile terrain draw submission. In the wide bay view, terrain uses 319 calls
   and water uses 243 of 1,142 total. Exterior crowns contribute 489,116 triangles.
   Compare future changes at this same camera, including the visible result.
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
