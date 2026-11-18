# Rendering and Rust/WASM review

17 November 2026. Baseline measured against the v0.3 runtime at `cb28d87`;
the first measured scene optimization ships in v0.3.1.

## Recommendation

### Framed art in v0.18.0

With 459 simulated residents, the wall in Home 9 took 309 draw calls on its own
and 310 with a framed painting. An Intel Graphics 0x7D67 running D3D11 completed
59.8 FPS at 1280 × 720 with or without the picture on Balanced and Low.
Each sample covered 360 frames at the same camera position. The frame texture is
created when a decorated room opens and released when the player leaves.
Reproduce the empty wall, framed painting and empty wall sequence with
`node tools/benchmark.mjs --gallery --720p --gpu-completion`.

### Full-island terrain in v0.15.1

We repeated the 360-frame Petalwood orbit at 1,800 m and 1280 × 720 on Intel Graphics
0x7D67, D3D11. All 457 residents were visible at the peak. The old build was `39d3d2b`.

| Preset | v0.15.0 completed FPS | v0.15.1 completed FPS | p95 interval before | p95 interval after |
| --- | ---: | ---: | ---: | ---: |
| Low | 43.1 | 55.2 | 25.1 ms | 19.6 ms |
| Balanced | 42.1 | 55.0 | 25.5 ms | 19.3 ms |

Peak draw calls fell from 2,609 to 922. The larger bounds submitted 5.73 million
triangles at peak, up from 5.72 million. The same 24 m street and 180 m town orbits
ran at 59.8 FPS on both presets. Reproduce the wide orbit with
`node tools/benchmark.mjs --wide-street --orbit --720p --gpu-completion`.

The viewer builds the whole island in 256 m regions when the island dimensions permit.
Petalwood takes 64 regions. Ground samples and shoreline triangles retain their original
spacing. The worker drops water vertices unused by any triangle before transferring the mesh.
A fixed-camera comparison measured terrain and water attribute and index buffers at 22.3 MB.
The old build used 12.0 MB at the initial street camera and 30.6 MB once the whole island was in view.
These counts exclude textures, scenery, the simulation and driver overhead.

The worker test compares ground positions, normals and colors, and each emitted water triangle's
positions and depths, against the 64 m source tiles. The browser test checks the complete surface
after loading each locale and after two overlapping island loads.

### Roadside flowers in v0.15.0

At 1280 × 720 on Intel Graphics 0x7D67, a close view of watering and regrowth
delivered 59.8 GPU-completed FPS on both Low and Balanced with 457 residents
simulated. The p95 frame interval was 17.3 ms and neither 360-frame sample
recorded a long task. The full-island orbit measured 43.9 FPS on Low and
42.8 on Balanced, with p95 intervals of 25.2 and 25.5 ms respectively.
Balanced recorded one 85 ms long task during the orbit. Reproduce both views
with `node tools/benchmark.mjs --720p --gpu-completion` and either
`--flowers` or `--wide-street --orbit`.

### Painting in the v0.14.0 public studio

At 1280 × 720 on Intel Graphics 0x7D67, both Low and Balanced delivered
59.8 GPU-completed FPS. The camera faced the active painter with two easels
and two club chairs in the room. Each preset ran for 360 frames with 457
residents simulated. Both recorded a 17.3 ms p95 frame interval and zero
long tasks. Run `node tools/benchmark.mjs --studio --720p --gpu-completion`
to reproduce the view.

### Home lighting in v0.13.0

With 457 residents simulated, a fixed view of Home 5 on Intel Graphics 0x7D67
held 59.8 GPU-completed FPS at 1280 × 720 on both Low and Balanced. Each
preset ran for 360 frames with the lights off, 360 with the entry lantern,
desk lamp and bedside lamp on, and 360 after switching them off. Peak draws
went from 536 to 537 and back to 536. The p95 frame interval across those six
samples was 17.2 to 17.4 ms. Reproduce with
`node tools/benchmark.mjs --entry-light --720p --gpu-completion`.

### Whole-island performance in v0.12.4

We repeated the same 360-frame Petalwood camera paths at 1280 × 720 on Intel
Graphics 0x7D67 using Chrome D3D11 and GPU completion fences, with 457 residents.

| Orbit and setting | v0.12.3 FPS | v0.12.4 FPS | v0.12.4 p95 frame interval |
| --- | ---: | ---: | ---: |
| Street, 24 m, Low | 59.8 | 59.8 | 17.3 ms |
| Town, 180 m, Low | 59.8 | 59.8 | 17.4 ms |
| Island, 1,800 m, Low | 32.4 | 43.3 | 25.0 ms |
| Island, 1,800 m, Balanced | 31.9 | 42.5 | 26.5 ms |

The wide orbit peaked at 2,566 draws, down from 3,226, with the same 5.67
million triangles. Exterior batches now cover 140 m per side. Tree crowns,
shrubs and other round pieces reuse vertices with bit-identical attributes.
The island remains below 60 FPS at this distance on this adapter.

### Whole-island street orbit, v0.12.3

Petalwood's street camera reaches 3,174 metres. In a 1,800-metre orbit,
headless Chrome on Intel Graphics 0x7D67 (D3D11, 1280 × 720) completed
32.4 FPS on Low and 31.9 FPS on Balanced. The p95 frame intervals were
32.6 ms and 33.7 ms. Each run measured 360 frames with GPU fences and all
457 residents in simulation. The orbit checks that every camera position
stays at the requested aerial distance.

On the same build and adapter, Low completed 59.8 FPS in the 24-metre
street orbit and 59.8 FPS in the 180-metre town orbit. Their p95 frame
intervals were 17.3 ms and 17.5 ms respectively.

The peak frame submitted 3,226 draw calls and 5.67 million triangles.
In one fixed aerial frame, the town exterior group alone submitted 1,160
calls and 3.15 million triangles. The full-island view still exceeds a
16.7 ms frame budget on this adapter. Run
`node tools/benchmark.mjs --wide-street --720p --orbit --gpu-completion`
with the adapter selection described below to reproduce it.

### Living-room television, v0.6

The TV draws a 224 × 128 picture at eight frames per second. Each client allocates
the screen texture when a powered set enters its open interior and disposes it
on leaving. The host replicates a channel number. Each viewer draws the program
against the existing shared clock.

We measured 360 frames per channel with the same Home 5 camera and 457 residents
in simulation on an Intel 0x7D67, D3D11, at 1280 × 720. Peak draw calls in this
view went from 417 with power off to 418 with a program running. On Low, all
three channels measured 59.8 completed FPS on the repeat. An earlier Night Sky
sample measured 51.9 FPS with a 426 ms frame. The repeat also saw a 230 ms frame
with the set off. The cause of those stalls remains open.

Reproduce with `node tools/benchmark.mjs --television --720p --gpu-completion`.
The run samples power off, each channel in order, then power off again on both
Balanced and Low. The report records the adapter, GPU completions, draw calls
and frame-time percentiles.

### Resident worker, v0.3.5

A Chrome CPU profile of the Petalwood resident worker attributed 74.6% of
sampled active time to walkability checks including their callees. A route
now reuses the current 32-metre cell for successive probes. Editable venues
use a conservative cell index covering the terrace and full renovation range.
Generated houses reject distant probes against their rotated world bounds
and use one local-coordinate transform to check the floor and furniture.

The replay passed the same production startup data and 160 fixed ticks to a
fresh browser worker in each run. It used the default layout and no player inputs.
All 73,120 per-resident snapshots matched across versions. Timings below
measure the worker's simulation step and exclude rendering and messaging.

| Run order | Total worker time | Median tick | p95 tick | Longest tick |
| --- | ---: | ---: | ---: | ---: |
| v0.3.4 | 3,272 ms | 3.7 ms | 139.3 ms | 275.3 ms |
| v0.3.5 | 839 ms | 1.1 ms | 34.9 ms | 83.7 ms |
| v0.3.5 | 709 ms | 1.3 ms | 24.7 ms | 71.6 ms |
| v0.3.4 | 2,921 ms | 2.7 ms | 111.4 ms | 200.6 ms |

Reproduce with `node tools/benchmark-residents.mjs 59ca3aa`. The two
previous-build runs bracket the two working-tree runs. A separate v0.3.4
720p Low test on the physical Intel 0x7D67 measured 59.84 completed FPS in
the street orbit and 58.52 in the town orbit. The town orbit's longest frame
was 67.4 ms. The worker timings alone cannot predict that frame interval.

Repeating the 360-frame orbits on v0.3.5 with the same Intel GPU and all 457
residents gave these GPU-fence results. Each row is a single run.

| 720p orbit | Completed FPS | p95 interval | Longest interval |
| --- | ---: | ---: | ---: |
| Low street | 59.50 | 19.6 ms | 37.3 ms |
| Low town | 59.66 | 18.0 ms | 48.6 ms |
| Balanced street | 59.84 | 17.4 ms | 26.3 ms |
| Balanced town | 59.82 | 18.0 ms | 41.3 ms |

A fresh browser on the live site then walked from spawn through Homes 67, 66
and 65 at normal speed on 720p Low. All three interiors opened. Across 1,758
frame intervals, p95 was 16.8 ms and the longest interval was 433.2 ms.
Repeating the route with browser timing probes gave a 233.3 ms worst interval.
The first route request itself took 50–57 ms. The trace did not establish a
single cause for the longer gaps. This walk is a better hitch check than a
stationary orbit and identifies ongoing work on frame pacing.

### Engine direction

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
