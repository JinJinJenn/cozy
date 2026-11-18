# Cozy working spec

Version 0.3, 17 November 2026. This records the current direction and the gaps that
remain; it is not a claim that the complete game or editor is finished.

## Direction

A continuous, original coastal town with the neighborhood composition and sense of
place of Sunset Valley in The Sims 3. Players should be able to inspect the whole
town, walk into any residential building, spend time with people, and renovate
without stopping other visitors. Keep the existing published town and saves useful
as the project grows.

The street network should produce neighborhoods with fronts, backs, gardens,
landmarks and deliberate public space. Populate both sides where the terrain and
parcels permit. Preserve parks, water and the countryside between neighborhoods.
More parcels alone will not resolve repetitive architecture or empty scenery.

## Acceptance targets: Town and Sky Lounge parity

Town parity and Sky Lounge parity are explicit targets, not loose inspiration.
Track their user-visible systems and object behaviors in a versioned checklist,
with implemented, partial, missing and verified states. Cozy retains its continuous
city and NPC population while adding the richer interiors and social systems.
Reference study does not authorize copying third-party code, models or textures.

Every prop needs a defined function and observable response. Add animation where
it makes sense: switches change lights, taps produce water, instruments perform,
storage opens and objects support the activities their appearance promises.
An action label or completion message alone is not finished parity. A temporary
decorative prop remains a tracked gap, rather than becoming an exempt category.

Object acceptance includes discovery by click, a valid approach, reservation where
needed, an appropriate pose/animation, a visible state or useful outcome, safe
interruption and exit, multiplayer replication, save behavior where state persists,
and an explicit CPU/GPU budget. Room editing must preserve those contracts.

Rendering and terrain need an evidence-based architecture review, including the
current Three.js/WebGL path, Three.js/WebGPU and Rust/WASM with a GPU backend.
Choose migration work from measured bottlenecks and preserved gameplay behavior.

## What 0.3 adds

The public-town and private-home direction is selected. Read the
[multiplayer and save contract](MULTIPLAYER-PLAN.md) before changing ownership,
joining or persistence. Version 0.4 implements automatic public joining.
Permanent parcel ownership remains open.

Generated homes support resting, reading, cooking, washing and stretching, plus
desk, dining and washroom activities where those furnishings fit. The host reserves
the object, routes to a validated approach and releases it to a safe floor point.
Timed activities have visible poses or effects and completion feedback. These are
social activities, not an inventory, food-economy or needs system. Kitchen and bed
models gain detail; wall-mounted bookshelves leave compact studios navigable.

Petalwood simulates 457 generated-home residents plus the two waterfront social
residents. The town simulation runs in a dedicated worker, through real home doors
and around the same collision geometry. Residents use visible roadside benches.
The camera draws their original articulated avatar geometry in shared batches;
offscreen residents keep their routines. Signed guest frames include the full
population in a compact representation. No population is removed to improve FPS.

The runtime prepares material programs before play and avoids recomposing static
mesh transforms. Worker tick timings and render-frame timings must be reported
separately; moving work off the render thread does not make that work free.

## What 0.2 delivered

- Petalwood keeps its 534 published parcel boundaries and gains 54 frontage parcels.
  Nine of the additions are on the waterfront road. Harbor Green remains open.
- 457 generated homes have open front doors, collision-aware interiors, cutaway
  walls and roofs, and a reservable sofa. The two existing furnished waterfront
  homes retain their visits and building controls.
- Large generated plans have sleeping, dining, cooking and washroom areas.
  Compact plans are studios. Beds, appliances, dining chairs and bathroom fixtures
  are scenery in this release; only the sofa advertises an interaction.
- One home descriptor supplies its shell, openings, furniture footprints, room
  approaches, floor height and seat. Detailed furniture is allocated only for the
  occupied home. This is a foundation for editing, not a general room editor yet.
- Walking zoom extends from a maximum distance of 45 to 420. The map still offers
  the wider island views. Low, Balanced, High and Auto graphics retain the same
  town geometry. Resolution and shadows control the rendering budget.

The playable street session remains the published Harbor Town / Petalwood world.
Other locale previews are procedural terrain and settlement previews, not complete
playable towns. Civic hall and market buildings still have exterior models only.

## Reference findings

These are design references, not source to transplant.

| Reference | Useful pattern | Application here |
| --- | --- | --- |
| [Jenn's Town](https://github.com/JinJinJenn/town) | Furniture footprint and movement share a home plan; reservations and standing transitions are explicit | Generated homes use one descriptor for visible objects, collision and seating |
| Sky Lounge | Catalog objects have specific activities, supports and occupancy rules | Every prop needs a meaningful function; unfinished decorative props remain explicit gaps |
| [Jenn's Cafe](https://github.com/TrentSterling/jenns-cafe) connected-room work | Preview a candidate room edit, validate it, then commit once against a revision | Use the same candidate plan for preview, rendering, movement and multiplayer acceptance when the general editor is built |

## Next coherent slice: editable inhabited homes

Shipped in v0.7.0: generated homes accept one owner-placed full-width divider
with a repositionable open doorway. Its pose is stored against the lot ID in
the versioned private layout. Guests and the resident simulation use both
solid wall panels. Room resizing, moving furniture with a room and a general
furniture catalog are still open.

The existing venue-specific wall and terrace tools remain supported. The next
editor should replace duplicated geometry rules with a committed home plan:

1. Stable lot, room, wall, opening and object IDs, with explicit schema versions.
2. Connected room regions and shared walls. Door and window ownership survives a
   room move or resize. Furniture moves with its room where appropriate.
3. Catalog entries carry dimensions, collision, support surfaces, seat/activity
   approaches and permitted transforms, plus interaction, animation and persistent
   state contracts. Track unfinished behavior explicitly for every prop.
4. An edit starts from a revision, produces a candidate, and validates parcel fit,
   connected doors, usable floor area, objects and current/reserved occupants.
   The owner commits one transaction with undo. Guests never commit edits.
5. Host and guest use the same committed snapshot for collision and activities.
   Reject stale edits; do not move or strand seated visitors to make an edit fit.
6. Migrate existing per-venue saves explicitly. Do not silently reset old lots or
   overwrite a player's furniture when introducing a new generator revision.

Acceptance should include a guest entering a generated home, taking a seat, and
remaining connected while its owner previews, commits and undoes a valid room
change. Reload must restore the same plan. Invalid edits must leave the plan and
occupancy untouched.

## Visual and performance targets

Improve architectural proportions and silhouettes, landscaping, material response,
lighting and interior composition together. Preserve detail continuity between
street and town views. Do not hide a weak layout behind fog or abrupt model swaps.

Target smooth 60 FPS at 1280 by 720 on an integrated GPU using Low, with a 30 FPS
floor in the wide town view. This is an acceptance target, not verified hardware
coverage. Track p50/p95 frame time, startup, memory, camera changes and entry stutter
on named devices. A fast desktop result or SwiftShader run is not a potato-hardware
certification. Auto can lower resolution and then disable shadows under sustained
load; manual settings remain available at the top right.

## Verification

`npm test` covers terrain, settlement, saves, authority, activities and every
generated home's door, seat and room approaches. `npm run test:homes` adds actual
browser entry through a clicked door, seating, zoom, graphics controls and captures.
`npm run test:viewer` covers four locale previews. `npm run test:street` covers the
existing host/guest editing and social workflows over local transport.

`node tools/benchmark.mjs --baseline=<commit>` compares identical street and wide
cameras at a 1920 by 1080 CSS viewport. Add `--software` for a software WebGL stress
test. Set `PLAYWRIGHT_FROM` and `CHROME_EXE` when using an external test installation.
Reports go to ignored `test-results` unless an output environment variable is set.
