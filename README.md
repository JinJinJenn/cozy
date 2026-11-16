# Jenn's Cozy Town

Explore a seeded island, choose **Town** to meet its residents, and click the minimap to jump between neighbourhoods. The current playtest shows graded streets and outlined lots across four island presets. [Play Harbor Town](https://jinjinjenn.github.io/cozy/?preset=harborTown&seed=petalwood&view=town) · [Devlog](docs/DEVLOG.html)

## Where the game is going

Jenn's Café contributed the models and building tools. Jenn's Farm informed the rendering and UI. Jenn's Town explored residents and neighbourhood routines. Cozy Town starts with a fresh island and brings those ideas together around live, multiplayer building.

The next playable milestone is one occupied lot on the island. The room owner drags a wall with an attached door while a guest walks through the doorway and a resident continues their routine. The edit should move connected pieces together, preserve a usable passage and resolve contact without trapping a player or cancelling an unrelated interaction. A constrained drag should stop at the last valid position. The host should commit the geometry, collision and navigation change at the same simulation tick. Guests can join from a link and keep playing throughout a drag. A late joiner and an owner undo should see the same resulting layout. The first planned group activity lets players perform different parts of one MML song together.

## Run

```bash
npm install --ignore-scripts      # three 0.180.0 (only needed once)
npm run vendor                    # copies three + OrbitControls into vendor/
npm test                          # package and worker regression tests (node --test)
npm run serve                     # http://127.0.0.1:4180/ (binds localhost, does NOT open a browser)
```

Open the printed URL yourself. Drag = orbit, right-drag = pan, wheel = zoom. Panel: locale dropdown, seed box, Re-roll, Oblique / Top / Shore / Town camera buttons. The minimap (bottom right) is clickable to jump.
URL params: `?preset=pineHighlands&seed=clover-123&view=shore`.

## Headless captures (no window, no focus steal)

```bash
node tools/shots.mjs [outDir] [seed]      # 3 views x every preset -> docs/shots/YYYY-MM-DD/
node tools/video.mjs <preset> [sec] [fps] [seed] [WxH]   # orbit fly-over -> docs/video/YYYY-MM-DD/raw/*.mp4 (needs ffmpeg)
```

## Layout

```
packages/island-gen/src/rng.js      seeded rng, gradient noise, fBm, ridged fBm
packages/island-gen/src/presets.js  locale presets = plain data (add a new island type by adding an object)
packages/island-gen/src/island.js   generator: base shape -> erosion -> rivers/lakes -> beach -> terraces; sample/slope/paint queries
packages/island-gen/src/chunks.js   64 m chunk builders (terrain with baked light, water with depth attribute)
src/minimap.js    top-down minimap
src/main.js       viewer (Three.js, LOD chunk streaming, water shader)
tools/            serve, vendor, shots, video
tests/            node --test suite
docs/             DEVLOG.html, STORY.md, timeline.json, shots/, video/, blog/
```

## How the terrain is made

1. Radial/lobe falloff mask with a domain warp, shelf + deep-ocean profile, plus bays (preset data).
2. Hills = fBm; mountains = ridged fBm gated by a mask (Pine Highlands).
3. Droplet hydraulic erosion + thermal relax on the whole grid (deterministic).
4. Lakes get a flat water level below their rim; rivers follow steepest descent with a carved, monotonically falling bed and a water-level ribbon.
5. Beach shaping, then optional cliff terraces on steep rock.
6. Paint: each preset has an ordered `zones` list (height / slope / wetness / noise windows -> pastel colour). Not a biome simulation; add rows to add patches.
7. Baked light: lambert + heightfield shadow march + cavity darkening, softly banded, in vertex colours (unlit toon material).
8. Water: per-chunk surface mesh with a depth attribute -> depth tint, animated shore foam.

The same seed and preset reproduce the island. The viewer grades streets and buildable plots before generating chunk meshes.
